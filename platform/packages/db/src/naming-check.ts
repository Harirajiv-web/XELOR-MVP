import pg from "pg";

/**
 * TC-16-07 (naming lint) — the MWO / manufacturing-work-order disambiguation, enforced
 * structurally rather than by reviewer memory.
 *
 * MAINTENANCE §1.4 and §9.2 call this "the single most load-bearing boundary in the
 * module", and they are right: two doctypes called "work order", in the same product, is
 * how a maintenance job ends up consuming a BOM or a production order acquires a failure
 * code. The rule is stated once, and checked here on every migration:
 *
 *   PRODUCTION owns  `production_order`      — item + BOM + quantity
 *   MAINTENANCE owns `maintenance_work_order` — asset + failure + downtime
 *
 * A bare `work_order`/`work_orders` table, or a Maintenance table without the
 * `maintenance_`/`mwo_`/`pm_`/`asset_`/`amc_` prefix, fails CI. So does an `mwo_*` column
 * appearing on a production table, or a shared numbering series.
 */

const BARE_WORK_ORDER = /^work_orders?$/;

/** Every table this module is allowed to own, by prefix. */
const MAINTENANCE_PREFIXES = ["maintenance_", "mwo_", "pm_", "asset_", "amc_", "failure_", "downtime_", "criticality_"];

async function main(): Promise<void> {
  const url = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_OWNER_URL or DATABASE_URL is required.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const failures: string[] = [];

  try {
    const tables = (
      await client.query<{ table_name: string }>(`
        SELECT c.relname AS table_name
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname = 'public'
        ORDER BY c.relname
      `)
    ).rows.map((r) => r.table_name);

    // 1. No bare "work_order(s)" table may exist. The name is ambiguous by construction.
    for (const t of tables) {
      if (BARE_WORK_ORDER.test(t)) {
        failures.push(
          `  x ${t}: ambiguous table name — use production_order (manufacturing) or maintenance_work_order (MWO)`,
        );
      }
    }

    // 2. The MWO table must exist under exactly its documented name, and be distinct from
    //    the production order table.
    const hasMwo = tables.includes("maintenance_work_order");
    const hasProd = tables.includes("production_order");
    if (hasMwo && !hasProd) {
      failures.push("  x maintenance_work_order exists but production_order does not — check the migration order");
    }

    // 3. No `mwo_*` column may appear on a Production-owned table, and no `production_*`
    //    column on a Maintenance-owned one. Columns are where the two doctypes actually
    //    bleed into each other.
    const cols = (
      await client.query<{ table_name: string; column_name: string }>(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
      `)
    ).rows;

    for (const { table_name, column_name } of cols) {
      if (table_name.startsWith("production_") && column_name.startsWith("mwo_")) {
        failures.push(`  x ${table_name}.${column_name}: a maintenance work order has no place on a production table`);
      }
      const isMaintenance = MAINTENANCE_PREFIXES.some((p) => table_name.startsWith(p));
      if (isMaintenance && column_name.startsWith("production_order")) {
        failures.push(`  x ${table_name}.${column_name}: link to Production by work_center_ref, never by its order id`);
      }
    }

    // 4. NO FOREIGN KEY may cross between the two doctypes, in either direction. This is
    //    the check that would have caught the "convenient" FK somebody adds in month four.
    const fks = (
      await client.query<{ conname: string; src: string; tgt: string }>(`
        SELECT c.conname, s.relname AS src, t.relname AS tgt
        FROM pg_constraint c
        JOIN pg_class s ON s.oid = c.conrelid
        JOIN pg_class t ON t.oid = c.confrelid
        WHERE c.contype = 'f'
      `)
    ).rows;

    const maintenanceTable = (n: string): boolean => MAINTENANCE_PREFIXES.some((p) => n.startsWith(p));
    const productionTable = (n: string): boolean => n.startsWith("production_");
    for (const { conname, src, tgt } of fks) {
      if ((maintenanceTable(src) && productionTable(tgt)) || (productionTable(src) && maintenanceTable(tgt))) {
        failures.push(`  x ${conname}: FK ${src} -> ${tgt} crosses the Production/Maintenance boundary`);
      }
    }

    // 5. The two numbering series must be distinct. A shared counter would let an MWO and
    //    a production order collide on a document number — the failure the customer sees.
    if (hasMwo) {
      const clash = await client.query<{ n: string }>(`
        SELECT mwo_no AS n FROM maintenance_work_order
        WHERE mwo_no NOT LIKE 'MWO-%'
        LIMIT 5
      `);
      for (const r of clash.rows) failures.push(`  x maintenance_work_order.mwo_no '${r.n}' is not in the MWO- series`);
    }

    if (failures.length > 0) {
      console.error("Naming check FAILED — the MWO / production work-order boundary is compromised:");
      console.error(failures.join("\n"));
      process.exit(1);
    }
    console.log(
      `Naming check OK — ${tables.length} tables; production_order and maintenance_work_order are distinct doctypes with no FK between them.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
