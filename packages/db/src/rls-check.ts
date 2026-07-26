import pg from "pg";

/**
 * DECISIONS-V2 §1.6 acceptance gate (CI): "a CI test asserting EVERY tenant-scoped
 * table has an RLS policy." A tenant-scoped table = any public table with a
 * `tenant_id` column, except the `tenant` registry itself (§5.2).
 *
 * Fails (exit 1) if any such table lacks ENABLE + FORCE row security or a policy, OR if a
 * policy does not actually key on the tenant setting this platform sets.
 *
 * THAT LAST CLAUSE WAS ADDED AFTER IT MATTERED. `document_series` shipped with a policy
 * reading `current_setting('app.tenant_id')` while withTenant sets `app.current_tenant`.
 * The table had ENABLE, FORCE and a policy, so this gate reported it fenced — and it was:
 * fenced against every caller including the application, which could not see a single row.
 * Counting policies asks "is there a fence?"; it does not ask "is the fence around the
 * right thing?", and the difference is invisible until a request returns nothing and the
 * cause looks like missing data.
 *
 * Wire this into CI so neither a table without RLS nor a table with a nonsense policy can
 * merge.
 */
const NOT_TENANT_SCOPED = new Set(["tenant", "_migrations"]);

/** The setting withTenant sets (packages/db/src/client.ts). Policies must key on it. */
const TENANT_SETTING = "app.current_tenant";

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

    // Every policy's USING and WITH CHECK expression, rendered back to SQL text.
    const policies = await client.query<{
      table_name: string;
      policy_name: string;
      using_expr: string | null;
      check_expr: string | null;
    }>(`
      SELECT c.relname AS table_name,
             p.polname AS policy_name,
             pg_get_expr(p.polqual, p.polrelid)      AS using_expr,
             pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
    `);
    const policiesFor = new Map<string, typeof policies.rows>();
    for (const row of policies.rows) {
      if (!policiesFor.has(row.table_name)) policiesFor.set(row.table_name, []);
      policiesFor.get(row.table_name)!.push(row);
    }

    const failures: string[] = [];
    for (const { table_name } of scoped.rows) {
      if (NOT_TENANT_SCOPED.has(table_name)) continue;
      const s = byName.get(table_name);
      if (!s || !s.rls_enabled || !s.rls_forced || s.policy_count < 1) {
        failures.push(
          `  ✖ ${table_name}: enabled=${s?.rls_enabled} forced=${s?.rls_forced} policies=${s?.policy_count ?? 0}`,
        );
        continue;
      }

      // At least one PERMISSIVE-shaped policy must key on the platform's tenant setting.
      // A RESTRICTIVE policy (CSP's second scoping dimension) narrows further and keys on
      // a different setting by design, so the test is "some policy does", not "all do".
      const rows = policiesFor.get(table_name) ?? [];
      const keysOnTenant = rows.some(
        (p) =>
          (p.using_expr ?? "").includes(TENANT_SETTING) ||
          (p.check_expr ?? "").includes(TENANT_SETTING),
      );
      if (!keysOnTenant) {
        const shown = rows
          .map((p) => `${p.policy_name}: ${p.using_expr ?? "(no USING)"}`)
          .join(" | ");
        failures.push(
          `  ✖ ${table_name}: has ${rows.length} policy/policies but NONE keys on ${TENANT_SETTING} — ` +
            `the table is fenced against the application too. ${shown}`,
        );
      }
    }

    if (failures.length > 0) {
      console.error(
        "RLS check FAILED — tenant-scoped tables missing FORCE RLS, a policy, or a policy that keys on the tenant:",
      );
      console.error(failures.join("\n"));
      process.exit(1);
    }
    const checked = scoped.rows.filter((r) => !NOT_TENANT_SCOPED.has(r.table_name));
    console.log(
      `RLS check OK — ${checked.length} tenant-scoped table(s) fenced (FORCE RLS + a policy keying on ${TENANT_SETTING}).`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
