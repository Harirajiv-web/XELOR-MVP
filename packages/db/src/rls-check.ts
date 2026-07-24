import pg from "pg";

/**
 * DECISIONS-V2 §1.6 acceptance gate (CI): "a CI test asserting EVERY tenant-scoped
 * table has an RLS policy." A tenant-scoped table = any public table with a
 * `tenant_id` column, except the `tenant` registry itself (§5.2).
 *
 * Fails (exit 1) if any such table lacks ENABLE + FORCE row security or a policy.
 * Wire this into CI so a new table without RLS can never merge.
 */
const NOT_TENANT_SCOPED = new Set(["tenant", "_migrations"]);

async function main(): Promise<void> {
  const url = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_OWNER_URL or DATABASE_URL is required.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const scoped = await client.query<{ table_name: string }>(`
      SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
      WHERE c.relkind = 'r' AND n.nspname = 'public'
      ORDER BY c.relname
    `);

    const status = await client.query<{
      table_name: string;
      rls_enabled: boolean;
      rls_forced: boolean;
      policy_count: number;
    }>(`
      SELECT c.relname AS table_name,
             c.relrowsecurity AS rls_enabled,
             c.relforcerowsecurity AS rls_forced,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::int AS policy_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND n.nspname = 'public'
    `);
    const byName = new Map(status.rows.map((r) => [r.table_name, r]));

    const failures: string[] = [];
    for (const { table_name } of scoped.rows) {
      if (NOT_TENANT_SCOPED.has(table_name)) continue;
      const s = byName.get(table_name);
      if (!s || !s.rls_enabled || !s.rls_forced || s.policy_count < 1) {
        failures.push(
          `  ✖ ${table_name}: enabled=${s?.rls_enabled} forced=${s?.rls_forced} policies=${s?.policy_count ?? 0}`,
        );
      }
    }

    if (failures.length > 0) {
      console.error("RLS check FAILED — tenant-scoped tables missing FORCE RLS or a policy:");
      console.error(failures.join("\n"));
      process.exit(1);
    }
    const checked = scoped.rows.filter((r) => !NOT_TENANT_SCOPED.has(r.table_name));
    console.log(`RLS check OK — ${checked.length} tenant-scoped table(s) fenced (FORCE RLS + policy).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
