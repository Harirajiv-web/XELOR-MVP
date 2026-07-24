import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

/**
 * Minimal forward-only migration runner. Applies every *.sql in ./migrations in
 * filename order, once, inside a transaction, recording it in `_migrations`.
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
    await client.query(
      `CREATE TABLE IF NOT EXISTS _migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const applied = new Set(
      (await client.query<{ name: string }>("SELECT name FROM _migrations")).rows.map(
        (r) => r.name,
      ),
    );
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(migrationsDir, file), "utf8");
      process.stdout.write(`applying ${file} ... `);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        process.stdout.write("ok\n");
        ran++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    console.log(ran === 0 ? "up to date." : `applied ${ran} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
