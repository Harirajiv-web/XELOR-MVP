import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, "../../..");
const seedVersion = process.env.DEMO_SEED_VERSION ?? "railway-public-demo-v1";

const stages = [
  ["base", "apps/api/scripts/demo/01-seed-base-world.mjs"],
  ["northstar", "apps/api/scripts/demo/02-seed-northstar-story.mjs"],
  ["verified", "apps/api/scripts/diagnostics/investor-demo-matrix.mjs"],
] as const;

/** Seed and verify once per named version, serialized across overlapping deploys. */
async function main(): Promise<void> {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) throw new Error("DATABASE_OWNER_URL is required.");

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [862_056_317]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS _deployment_seed_runs (
        version text PRIMARY KEY,
        completed_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const completed = await client.query<{ version: string }>(
      "SELECT version FROM _deployment_seed_runs WHERE version = $1",
      [seedVersion],
    );
    if (completed.rowCount) {
      console.log(`Demo seed ${seedVersion} is already complete.`);
      return;
    }

    for (const [stage, script] of stages) {
      const stageVersion = `${seedVersion}:${stage}`;
      const stageCompleted = await client.query<{ version: string }>(
        "SELECT version FROM _deployment_seed_runs WHERE version = $1",
        [stageVersion],
      );
      if (stageCompleted.rowCount) {
        console.log(`Demo seed stage ${stage} is already complete.`);
        continue;
      }
      await run(script);
      await client.query(
        "INSERT INTO _deployment_seed_runs (version) VALUES ($1) ON CONFLICT DO NOTHING",
        [stageVersion],
      );
    }
    await client.query(
      "INSERT INTO _deployment_seed_runs (version) VALUES ($1) ON CONFLICT DO NOTHING",
      [seedVersion],
    );
    console.log(`Demo seed ${seedVersion} completed and verified.`);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [862_056_317]).catch(() => undefined);
    await client.end();
  }
}

function run(relativePath: string): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    console.log(`\nRunning ${relativePath} ...`);
    const child = spawn(process.execPath, [resolve(repositoryRoot, relativePath)], {
      cwd: repositoryRoot,
      env: { ...process.env, DEMO_PUBLIC_MODE: "true" },
      stdio: "inherit",
    });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${relativePath} failed (${signal ?? `exit ${code}`}).`));
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
