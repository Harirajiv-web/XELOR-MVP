import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";

/**
 * Minimal forward-only migration runner. Applies every *.sql in ./migrations in
 * filename order, once, inside a transaction, recording its name and SHA-256 content hash
 * in `_migrations`. An applied file changing later is migration drift and fails closed.
 * Runs as the schema OWNER (DATABASE_OWNER_URL) — the only role that may DDL.
 */
const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");

async function main(): Promise<void> {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) throw new Error("DATABASE_OWNER_URL is required to run migrations.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // Only one release process may inspect/apply the forward migration stream at a time.
    // The session-scoped lock is released automatically if this process crashes or its
    // connection closes, and prevents two replicas racing the same not-yet-recorded file.
    await client.query("SELECT pg_advisory_lock(hashtext('ind-core:database-migrations'))");
    await client.query(
      `CREATE TABLE IF NOT EXISTS _migrations (
         name text PRIMARY KEY,
         checksum text,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    // Existing databases pre-date checksums. Adopt the checked-in content once, then make
    // every later edit detectable. This cannot reconstruct a historical hash that was never
    // stored, but it closes the gap from this deployment onward without replaying DDL.
    await client.query("ALTER TABLE _migrations ADD COLUMN IF NOT EXISTS checksum text");
    const applied = new Map(
      (
        await client.query<{ name: string; checksum: string | null }>(
          "SELECT name, checksum FROM _migrations",
        )
      ).rows.map((row) => [row.name, row.checksum]),
    );
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    const fileSet = new Set(files);
    const missing = [...applied.keys()].filter((name) => !fileSet.has(name));
    if (missing.length > 0) {
      throw new Error(
        `Applied migration files are missing from the repository: ${missing.join(", ")}`,
      );
    }
    let ran = 0;
    for (const file of files) {
      const sql = await readFile(join(migrationsDir, file), "utf8");
      const checksum = createHash("sha256").update(sql, "utf8").digest("hex");
      const recordedChecksum = applied.get(file);
      if (applied.has(file)) {
        if (recordedChecksum === null) {
          await client.query(
            "UPDATE _migrations SET checksum = $2 WHERE name = $1 AND checksum IS NULL",
            [file, checksum],
          );
          continue;
        }
        if (recordedChecksum !== checksum) {
          throw new Error(
            `Applied migration ${file} no longer matches its recorded SHA-256 checksum. Add a new forward migration instead of editing history.`,
          );
        }
        continue;
      }
      process.stdout.write(`applying ${file} ... `);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO _migrations (name, checksum) VALUES ($1, $2)",
          [file, checksum],
        );
        await client.query("COMMIT");
        process.stdout.write("ok\n");
        ran++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    await client.query("ALTER TABLE _migrations ALTER COLUMN checksum SET NOT NULL");
    console.log(ran === 0 ? "up to date." : `applied ${ran} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
