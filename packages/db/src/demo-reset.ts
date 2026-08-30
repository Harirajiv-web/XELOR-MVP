import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

/**
 * RESET THE DEMO DATABASE TO EMPTY, SO IT CAN BE REBUILT FROM SCRATCH.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS DROPS THE SCHEMA INSTEAD OF DELETING THE DEMO ROWS
 * ---------------------------------------------------------------------------
 * The obvious design — "delete the demo documents, keep the masters" — cannot be built in
 * this system, and finding out why is more useful than the feature would have been.
 *
 * Fifty-four tables carry an append-only trigger. `audit_log` refuses UPDATE and DELETE
 * citing MCA Rule 11(g) by name; `stock_ledger`, `journal_voucher`, `journal_line`,
 * `workflow_action`, `ai_action_log`, `payroll_run`, `payslip`, `mrp_run` and the statutory
 * rate tables all do the same. `document_series` will not rewind. Those triggers fire for
 * the schema owner as well as for the application role, which is the point: history that a
 * privileged process can quietly remove is not evidence of anything.
 *
 * So a row-level undo would have to begin by dropping those triggers. That is precisely the
 * "weaken the existing checks" that the demo is meant to prove this system does not do — and
 * it would leave the guarantee disabled on any database where somebody forgot to put them
 * back. Refusing to build it is the correct outcome, not a limitation to work around.
 *
 * What CAN be done safely is to throw the whole thing away and build it again. Thirty
 * seconds of migrations and two seeders produce a byte-for-byte equivalent world with every
 * trigger intact, which is a better guarantee than a partial delete could ever give:
 *
 *     pnpm demo:rebuild        # reset → migrate → seed the §7 world → seed the Northstar story
 *
 * ---------------------------------------------------------------------------
 * THE GUARD IS THE DATA, NOT THE DATABASE NAME
 * ---------------------------------------------------------------------------
 * A name check is worth very little — production is one `DATABASE_OWNER_URL` away from being
 * called `indcore` too. This refuses on a property of the CONTENTS instead: the `tenant`
 * table must contain nothing except the two §7 demo tenants (3S and Kaveri). One real
 * customer in that table and the reset stops without touching anything. An empty or
 * not-yet-migrated database passes, because there is nothing there to lose.
 *
 *   node --import tsx src/demo-reset.ts --yes
 */

const here = dirname(fileURLToPath(import.meta.url));
const initSqlPath = join(here, "..", "..", "..", "infra", "postgres", "init", "00-init.sql");

/** DECISIONS-V2 §7. Nothing else may be present for this to be a demo database. */
const DEMO_TENANTS = new Set([
  "0192a8c0-0000-7000-8000-000000000001", // 3S Precision Parts Pvt Ltd
  "0192a8c0-0000-7000-8000-000000000002", // Kaveri ElectroFab Industries
]);

async function main(): Promise<void> {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) throw new Error("DATABASE_OWNER_URL is required — the reset runs as the schema owner.");
  if (!process.argv.includes("--yes")) {
    console.error(
      "demo-reset drops and recreates the whole `public` schema.\n" +
        "Re-run with --yes once you are sure this is the demo database.\n" +
        "Afterwards run: pnpm db:migrate && pnpm demo:seed && pnpm demo:northstar\n" +
        "(or simply: pnpm demo:rebuild, which does all four in order)",
    );
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const db = (await client.query<{ d: string }>("SELECT current_database() AS d")).rows[0]!.d;

    /* ---- the guard ------------------------------------------------------ */
    const hasTenantTable = (
      await client.query<{ ok: boolean }>(
        "SELECT to_regclass('public.tenant') IS NOT NULL AS ok",
      )
    ).rows[0]!.ok;

    let tenantCount = 0;
    if (hasTenantTable) {
      const rows = (await client.query<{ id: string; legal_name: string }>(
        "SELECT id, legal_name FROM tenant",
      )).rows;
      tenantCount = rows.length;
      const strangers = rows.filter((r) => !DEMO_TENANTS.has(r.id));
      if (strangers.length > 0) {
        console.error(
          `REFUSING to reset "${db}".\n\n` +
            `It holds ${strangers.length} tenant(s) that are not part of the §7 demo universe:\n` +
            strangers.map((s) => `  ${s.id}  ${s.legal_name}`).join("\n") +
            "\n\nThis looks like a real database. Nothing has been changed.",
        );
        process.exit(3);
      }
    }

    console.log(
      `Resetting "${db}" — ${hasTenantTable ? `${tenantCount} demo tenant(s), no strangers` : "no schema yet"}.`,
    );

    /* ---- the reset ------------------------------------------------------ */
    //
    // DROP SCHEMA takes the tables, the triggers, the policies, the extensions AND the
    // grants with it. `00-init.sql` is what set the grants up on first container boot, so
    // it is replayed here rather than transcribed: every one of its statements is already
    // idempotent (`IF NOT EXISTS` on the role, plain GRANTs, an ALTER DATABASE), and a
    // second copy of the two-role model in this file would be one more thing to drift.
    //
    // Without that replay the rebuild appears to work — migrations run as the owner and
    // succeed — and then the API answers 500 on every query, because `app_user` lost USAGE
    // on a schema that no longer had any default privileges attached to it.
    const init = await readFile(initSqlPath, "utf8");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query(init);

    console.log("public schema dropped, recreated, and re-granted from infra/postgres/init/00-init.sql.");
    console.log("Next: pnpm db:migrate && pnpm demo:seed && pnpm demo:northstar");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
