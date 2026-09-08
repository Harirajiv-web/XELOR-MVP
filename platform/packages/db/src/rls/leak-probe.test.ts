import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

/**
 * DECISIONS-V2 §1.6: "two-tenant leak probes run on EVERY migration." This proves,
 * against a live database, that the RLS backstop actually fences data — connecting
 * as the NON-OWNER app_user (NOBYPASSRLS), exactly as the API does.
 *
 * Requires the infra to be up + migrations applied. Skipped automatically when no
 * DATABASE_URL is configured (e.g. a laptop without Docker), so `pnpm test` stays
 * green there; CI runs it with the database present.
 */
const TRISHUL = "0192a8c0-0000-7000-8000-000000000001";
const KAVERI = "0192a8c0-0000-7000-8000-000000000002";
const url = process.env.DATABASE_URL;

let client: pg.Client;

before(async () => {
  if (!url) return;
  client = new pg.Client({ connectionString: url }); // app_user, NOBYPASSRLS
  await client.connect();
});

after(async () => {
  if (client) await client.end();
});

async function asTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
    const out = await fn();
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

test("a tenant sees only its own companies", { skip: !url }, async () => {
  const trishul = await asTenant(TRISHUL, async () =>
    (await client.query("SELECT legal_name FROM company")).rows.map((r) => r.legal_name),
  );
  assert.ok(trishul.some((n: string) => n.includes("3S")));
  assert.ok(!trishul.some((n: string) => n.includes("Kaveri")), "Kaveri leaked into 3S");

  const kaveri = await asTenant(KAVERI, async () =>
    (await client.query("SELECT legal_name FROM company")).rows.map((r) => r.legal_name),
  );
  assert.ok(kaveri.some((n: string) => n.includes("Kaveri")));
  assert.ok(!kaveri.some((n: string) => n.includes("3S")), "3S leaked into Kaveri");
});

test("no tenant set => zero rows (fail closed)", { skip: !url }, async () => {
  const rows = (await client.query("SELECT * FROM company")).rows;
  assert.equal(rows.length, 0, "rows visible with no tenant GUC — RLS is NOT failing closed");
});

test("cannot INSERT a row for another tenant (WITH CHECK)", { skip: !url }, async () => {
  await assert.rejects(
    () =>
      asTenant(TRISHUL, async () => {
        // Attempt to write a Kaveri-tenant row while fenced to 3S.
        await client.query(
          `INSERT INTO company (id, tenant_id, created_by, updated_by, legal_name)
           VALUES (gen_random_uuid(), $1, $2, $2, 'cross-tenant write')`,
          [KAVERI, "0192a8c0-0000-7000-8000-0000000000ff"],
        );
      }),
    /row-level security|violates|policy/i,
  );
});
