import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * Owner-path regression for the import parent boundary. RLS protects ordinary requests;
 * the composite foreign key must also reject a cross-tenant child created by migrations,
 * maintenance tooling or any future owner job that can bypass RLS.
 */
const TRISHUL = "0192a8c0-0000-7000-8000-000000000001";
const KAVERI = "0192a8c0-0000-7000-8000-000000000002";
const ACTOR = "0192a8c0-0000-7000-8000-0000000000ff";
const url = process.env.DATABASE_OWNER_URL;

let client: pg.Client;

before(async () => {
  if (!url) return;
  client = new pg.Client({ connectionString: url });
  await client.connect();
});

after(async () => {
  if (client) await client.end();
});

test(
  "data-import rows can reference only a batch in the same tenant",
  { skip: !url },
  async () => {
    const constraints = await client.query<{ conname: string; definition: string }>(
      `SELECT conname, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname IN ('uq_dibatch_tenant_id', 'fk_dirow_batch_tenant')
       ORDER BY conname`,
    );
    assert.deepEqual(
      constraints.rows.map((row) => row.conname),
      ["fk_dirow_batch_tenant", "uq_dibatch_tenant_id"],
    );
    const fk = constraints.rows.find((row) => row.conname === "fk_dirow_batch_tenant");
    assert.match(
      fk?.definition ?? "",
      /FOREIGN KEY \(tenant_id, batch_id\) REFERENCES data_import_batch\(tenant_id, id\)/i,
    );

    const batchId = randomUUID();
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO data_import_batch (
           id, tenant_id, created_by, updated_by, filename, file_kind, byte_size,
           content_hash, sheet_name, target, mapping
         ) VALUES ($1, $2, $3, $3, 'integrity.csv', 'csv', 20, $4, 'Sheet1',
                   'customers', '{}'::jsonb)`,
        [batchId, TRISHUL, ACTOR, `integrity-${randomUUID()}`],
      );

      await client.query("SAVEPOINT expected_cross_tenant_rejection");
      let rejected: unknown;
      try {
        await client.query(
          `INSERT INTO data_import_row (
             id, tenant_id, created_by, updated_by, batch_id, row_no, raw, idempotency_key
           ) VALUES ($1, $2, $3, $3, $4, 2, '{}'::jsonb, $5)`,
          [randomUUID(), KAVERI, ACTOR, batchId, `cross-${randomUUID()}`],
        );
      } catch (error) {
        rejected = error;
      }
      await client.query("ROLLBACK TO SAVEPOINT expected_cross_tenant_rejection");
      await client.query("RELEASE SAVEPOINT expected_cross_tenant_rejection");
      assert.ok(rejected, "cross-tenant import row unexpectedly referenced another tenant's batch");
      assert.match(String(rejected), /fk_dirow_batch_tenant|foreign key/i);

      const sameTenant = await client.query(
        `INSERT INTO data_import_row (
           id, tenant_id, created_by, updated_by, batch_id, row_no, raw, idempotency_key
         ) VALUES ($1, $2, $3, $3, $4, 2, '{}'::jsonb, $5)
         RETURNING id`,
        [randomUUID(), TRISHUL, ACTOR, batchId, `same-${randomUUID()}`],
      );
      assert.equal(sameTenant.rowCount, 1);
    } finally {
      await client.query("ROLLBACK");
    }
  },
);
