import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * Live-database regression for the Agent OS evidence boundary. This uses the schema owner
 * deliberately: composite foreign keys and immutability triggers must still hold on paths
 * that can bypass RLS. It is skipped on machines without a configured owner connection.
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

async function expectStatementRejected(
  statement: string,
  parameters: readonly unknown[],
  expected: RegExp,
): Promise<void> {
  await client.query("SAVEPOINT expected_agentos_rejection");
  let rejected: unknown;
  try {
    await client.query(statement, [...parameters]);
  } catch (error) {
    rejected = error;
  }
  await client.query("ROLLBACK TO SAVEPOINT expected_agentos_rejection");
  await client.query("RELEASE SAVEPOINT expected_agentos_rejection");
  assert.ok(rejected, "statement unexpectedly crossed the Agent OS evidence boundary");
  assert.match(String(rejected), expected);
}

test(
  "Agent OS run evidence is tenant-bound and immutable even for the schema owner",
  { skip: !url },
  async () => {
    const expectedForeignKeys = [
      "fk_agentnode_run_tenant",
      "fk_agentcheckpoint_run_tenant",
      "fk_agentapproval_run_tenant",
      "fk_agentevent_run_tenant",
      "fk_agentaction_run_tenant",
      "fk_agentaction_approval_tenant",
      "fk_agentaction_node_tenant",
      "fk_agentstep_run_tenant",
      "fk_decisionevidence_run_tenant",
      "fk_decisionoutcome_run_tenant",
      "fk_decisionoutcome_action_tenant",
    ];
    const constraints = await client.query<{ conname: string; definition: string }>(
      `SELECT conname, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname = ANY($1::text[])
       ORDER BY conname`,
      [expectedForeignKeys],
    );
    assert.deepEqual(
      constraints.rows.map((row) => row.conname),
      [...expectedForeignKeys].sort(),
    );
    for (const constraint of constraints.rows) {
      assert.match(constraint.definition, /FOREIGN KEY \(tenant_id, /);
      assert.match(constraint.definition, /REFERENCES .+\(tenant_id, /);
    }

    const structuralEvidence = await client.query<{ name: string }>(
      `SELECT conname AS name
       FROM pg_constraint
       WHERE conname IN ('uq_agentrun_tenant_id', 'uq_agentaction_tenant_id')
       UNION ALL
       SELECT tgname AS name
       FROM pg_trigger
       WHERE NOT tgisinternal
         AND tgname IN (
           'trg_agentrun_evidence_immutable',
           'trg_agentrun_lifecycle',
           'trg_agentapproval_proposal_immutable',
           'trg_agentaction_approved_gate'
         )
       ORDER BY name`,
    );
    assert.deepEqual(
      structuralEvidence.rows.map((row) => row.name),
      [
        "trg_agentaction_approved_gate",
        "trg_agentapproval_proposal_immutable",
        "trg_agentrun_evidence_immutable",
        "trg_agentrun_lifecycle",
        "uq_agentaction_tenant_id",
        "uq_agentrun_tenant_id",
      ],
    );

    const actionGuard = await client.query<{ definition: string }>(
      "SELECT pg_get_functiondef('agent_action_approved_gate_guard'::regproc) AS definition",
    );
    assert.match(
      actionGuard.rows[0]?.definition ?? "",
      /FOR NO KEY UPDATE/i,
      "dispatch must serialize status transitions without blocking evidence foreign keys",
    );

    const leaseColumns = await client.query<{ column_name: string; data_type: string; is_nullable: string }>(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'agent_node_run'
         AND column_name IN ('execution_token', 'execution_lease_expires_at')
       ORDER BY column_name`,
    );
    assert.deepEqual(leaseColumns.rows, [
      { column_name: "execution_lease_expires_at", data_type: "timestamp with time zone", is_nullable: "YES" },
      { column_name: "execution_token", data_type: "uuid", is_nullable: "YES" },
    ]);

    const fingerprintColumn = await client.query<{
      data_type: string;
      character_maximum_length: number | null;
    }>(
      `SELECT data_type, character_maximum_length
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'agent_run'
         AND column_name = 'request_fingerprint'`,
    );
    assert.deepEqual(fingerprintColumn.rows, [
      { data_type: "text", character_maximum_length: null },
    ]);

    const runId = randomUUID();
    const nodeId = randomUUID();
    const secondNodeId = randomUUID();
    const approvalId = randomUUID();
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO agent_run (
           id, tenant_id, created_by, updated_by, graph_key, graph_version, goal,
           input, graph_snapshot, status, provider_mode, max_steps, consumed_steps,
           timeout_at, idempotency_key, request_fingerprint
         ) VALUES (
           $1, $2, $3, $3, 'integrity.regression', 1, 'Prove the evidence boundary',
           '{"original":true}'::jsonb, '{"key":"integrity.regression","version":1}'::jsonb,
           'pending', 'deterministic', 4, 0, now() + interval '5 minutes', $4, $5
         )`,
        [runId, TRISHUL, ACTOR, `integrity-${randomUUID()}`, `v2:${"a".repeat(64)}`],
      );

      const legacyRunId = randomUUID();
      await client.query(
        `INSERT INTO agent_run (
           id, tenant_id, created_by, updated_by, graph_key, graph_version, goal,
           input, graph_snapshot, status, provider_mode, max_steps, consumed_steps,
           timeout_at, idempotency_key, request_fingerprint
         ) VALUES (
           $1, $2, $3, $3, 'integrity.legacy-fingerprint', 1, 'Prove legacy replay compatibility',
           '{}'::jsonb, '{"key":"integrity.legacy-fingerprint","version":1}'::jsonb,
           'pending', 'deterministic', 1, 0, now() + interval '5 minutes', $4, $5
         )`,
        [legacyRunId, TRISHUL, ACTOR, `legacy-${randomUUID()}`, "b".repeat(64)],
      );

      await expectStatementRejected(
        `INSERT INTO agent_node_run (
           id, tenant_id, created_by, updated_by, run_id, node_id, node_name, node_kind
         ) VALUES ($1, $2, $3, $3, $4, 'node-1', 'Wrong tenant node', 'agent')`,
        [nodeId, KAVERI, ACTOR, runId],
        /fk_agentnode_run_tenant|foreign key/i,
      );

      await client.query(
        `INSERT INTO agent_node_run (
           id, tenant_id, created_by, updated_by, run_id, node_id, node_name, node_kind
         ) VALUES ($1, $2, $3, $3, $4, 'node-1', 'Owned node', 'agent')`,
        [nodeId, TRISHUL, ACTOR, runId],
      );
      await client.query(
        `INSERT INTO agent_node_run (
           id, tenant_id, created_by, updated_by, run_id, node_id, node_name, node_kind
         ) VALUES ($1, $2, $3, $3, $4, 'node-2', 'Second owned node', 'agent')`,
        [secondNodeId, TRISHUL, ACTOR, runId],
      );
      const executionToken = randomUUID();
      await client.query(
        `UPDATE agent_node_run
         SET status = 'running', execution_token = $2, attempt = attempt + 1,
             execution_lease_expires_at = now() + interval '90 seconds',
             started_at = now(), updated_at = now(), updated_by = $3
         WHERE id = $1`,
        [nodeId, executionToken, ACTOR],
      );
      const claimedNode = await client.query<{ execution_token: string }>(
        "SELECT execution_token FROM agent_node_run WHERE id = $1",
        [nodeId],
      );
      assert.equal(claimedNode.rows[0]?.execution_token, executionToken);

      // A reclaimed attempt receives a new token. A late completion from the old process
      // must no longer satisfy the same `status = 'running'` predicate.
      const reclaimedToken = randomUUID();
      await client.query(
        `UPDATE agent_node_run
         SET status = 'pending', execution_token = NULL,
             execution_lease_expires_at = NULL, started_at = NULL,
             updated_at = now(), updated_by = $2
         WHERE id = $1`,
        [nodeId, ACTOR],
      );
      await client.query(
        `UPDATE agent_node_run
         SET status = 'running', execution_token = $2, attempt = attempt + 1,
             execution_lease_expires_at = now() + interval '90 seconds',
             started_at = now(), updated_at = now(), updated_by = $3
         WHERE id = $1 AND status = 'pending'`,
        [nodeId, reclaimedToken, ACTOR],
      );
      const lateOldAttempt = await client.query(
        `UPDATE agent_node_run
         SET status = 'succeeded', execution_token = NULL,
             execution_lease_expires_at = NULL,
             completed_at = now(), updated_at = now(), updated_by = $3
         WHERE id = $1 AND status = 'running' AND execution_token = $2
         RETURNING id`,
        [nodeId, executionToken, ACTOR],
      );
      assert.equal(lateOldAttempt.rowCount, 0);
      const currentAttempt = await client.query<{ status: string; execution_token: string }>(
        "SELECT status, execution_token FROM agent_node_run WHERE id = $1",
        [nodeId],
      );
      assert.deepEqual(currentAttempt.rows, [{ status: "running", execution_token: reclaimedToken }]);

      await client.query(
        `UPDATE agent_node_run
         SET execution_lease_expires_at = now() - interval '1 second'
         WHERE id = $1`,
        [nodeId],
      );
      const recoveredExpiredLease = await client.query(
        `UPDATE agent_node_run
         SET status = 'pending', execution_token = NULL,
             execution_lease_expires_at = NULL, started_at = NULL,
             updated_at = now(), updated_by = $2
         WHERE id = $1 AND status = 'running'
           AND execution_lease_expires_at < now()
         RETURNING id`,
        [nodeId, ACTOR],
      );
      assert.equal(recoveredExpiredLease.rowCount, 1);

      await expectStatementRejected(
        "UPDATE agent_run SET input = '{\"original\":false}'::jsonb WHERE id = $1",
        [runId],
        /agent run request identity, input and graph snapshot are immutable/i,
      );

      await expectStatementRejected(
        `UPDATE agent_run
         SET status = 'completed', output = '{"forged":true}'::jsonb,
             completed_at = now(), updated_at = now(), updated_by = $2
         WHERE id = $1`,
        [runId, ACTOR],
        /invalid agent run lifecycle transition: pending -> completed/i,
      );

      await client.query(
        `UPDATE agent_run
         SET status = 'running', started_at = now(), consumed_steps = 1,
             updated_at = now(), updated_by = $2
         WHERE id = $1`,
        [runId, ACTOR],
      );

      await client.query(
        `INSERT INTO agent_approval (
           id, tenant_id, created_by, updated_by, run_id, node_id,
           title, risk, proposed_action, proposed
         ) VALUES ($1, $2, $3, $3, $4, 'node-1', 'Approve action', 'medium',
                   'Create governed work item', '{"amount":10}'::jsonb)`,
        [approvalId, TRISHUL, ACTOR, runId],
      );

      await expectStatementRejected(
        "UPDATE agent_approval SET proposed = '{\"amount\":999}'::jsonb WHERE id = $1",
        [approvalId],
        /agent approval attribution and proposed action are immutable/i,
      );

      await client.query(
        `UPDATE agent_approval
         SET status = 'approved', decision_note = 'Regression approval',
             decided_by = $2, decided_at = now(), updated_at = now(), updated_by = $2
         WHERE id = $1`,
        [approvalId, ACTOR],
      );
      const lifecycle = await client.query<{ status: string; decided_by: string }>(
        "SELECT status, decided_by FROM agent_approval WHERE id = $1",
        [approvalId],
      );
      assert.deepEqual(lifecycle.rows, [{ status: "approved", decided_by: ACTOR }]);

      await expectStatementRejected(
        `UPDATE agent_approval
         SET decision_note = 'Rewritten decision', updated_at = now(), updated_by = $2
         WHERE id = $1`,
        [approvalId, ACTOR],
        /terminal agent approval decision evidence is immutable/i,
      );

      const actionId = randomUUID();
      await client.query(
        `INSERT INTO agent_action_dispatch (
           id, tenant_id, created_by, updated_by, run_id, node_id, approval_node_id,
           agent_key, target_domain, action_type, title, risk, payload, approved_by
         ) VALUES (
           $1, $2, $3, $3, $4, 'node-1', 'node-1',
           'KILN', 'production', 'create_work_item', 'Create recovery work', 'medium',
           '{"bounded":true}'::jsonb, $3
         )`,
        [actionId, TRISHUL, ACTOR, runId],
      );
      await expectStatementRejected(
        `INSERT INTO agent_action_dispatch (
           id, tenant_id, created_by, updated_by, run_id, node_id, approval_node_id,
           agent_key, target_domain, action_type, title, risk, payload, approved_by
         ) VALUES (
           $1, $2, $3, $3, $4, 'node-1', 'node-1',
           'KILN', 'production', 'create_work_item', 'Create forged recovery work', 'medium',
           '{}'::jsonb, $5
         )`,
        [randomUUID(), TRISHUL, ACTOR, runId, randomUUID()],
        /must retain its approved gate and human decider/i,
      );

      await client.query(
        `UPDATE agent_run
         SET timeout_at = now() - interval '1 second', updated_at = now(), updated_by = $2
         WHERE id = $1`,
        [runId, ACTOR],
      );
      await expectStatementRejected(
        `INSERT INTO agent_action_dispatch (
           id, tenant_id, created_by, updated_by, run_id, node_id, approval_node_id,
           agent_key, target_domain, action_type, title, risk, payload, approved_by
         ) VALUES (
           $1, $2, $3, $3, $4, 'node-2', 'node-1',
           'KILN', 'production', 'create_work_item', 'Expired recovery work', 'medium',
           '{}'::jsonb, $3
         )`,
        [randomUUID(), TRISHUL, ACTOR, runId],
        /requires an active, running and unexpired mission/i,
      );
      await client.query(
        `UPDATE agent_run
         SET timeout_at = now() + interval '5 minutes', updated_at = now(), updated_by = $2
         WHERE id = $1`,
        [runId, ACTOR],
      );

      await client.query(
        `UPDATE agent_run
         SET status = 'completed', output = '{"result":"recorded"}'::jsonb,
             completed_at = now(), updated_at = now(), updated_by = $2
         WHERE id = $1`,
        [runId, ACTOR],
      );
      await expectStatementRejected(
        `INSERT INTO agent_action_dispatch (
           id, tenant_id, created_by, updated_by, run_id, node_id, approval_node_id,
           agent_key, target_domain, action_type, title, risk, payload, approved_by
         ) VALUES (
           $1, $2, $3, $3, $4, 'node-2', 'node-1',
           'KILN', 'production', 'create_work_item', 'Late recovery work', 'medium',
           '{}'::jsonb, $3
         )`,
        [randomUUID(), TRISHUL, ACTOR, runId],
        /requires an active, running and unexpired mission/i,
      );
      await expectStatementRejected(
        `UPDATE agent_run
         SET status = 'cancelled', updated_at = now(), updated_by = $2
         WHERE id = $1`,
        [runId, ACTOR],
        /terminal agent run evidence is immutable/i,
      );
    } finally {
      await client.query("ROLLBACK");
    }
  },
);
