-- =============================================================================
-- 0060 — Agent OS Phase 3: immutable, approval-bound action dispatch.
--
-- A dispatch is not arbitrary SQL and it is not a claim that an external connector ran.
-- It is the durable work item emitted by an approved graph node for a named domain owner.
-- The originating mission, approval gate, responsible agent and payload remain attributable.
-- =============================================================================

CREATE TABLE agent_action_dispatch (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  run_id            uuid NOT NULL REFERENCES agent_run (id),
  node_id           text NOT NULL,
  approval_node_id  text NOT NULL,
  agent_key         text NOT NULL CHECK (agent_key IN ('ONYX','HEXA','MICA','SPAR','AXLE','KILN','RASP')),
  target_domain     text NOT NULL,
  action_type       text NOT NULL,
  title             text NOT NULL,
  risk              text NOT NULL CHECK (risk IN ('low','medium','high')),
  execution_mode    text NOT NULL DEFAULT 'governed_work_item'
                      CHECK (execution_mode IN ('governed_work_item')),
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'dispatched'
                      CHECK (status IN ('dispatched')),
  approved_by       uuid NOT NULL,
  dispatched_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_agentaction_run_node UNIQUE (tenant_id, run_id, node_id)
);
CREATE INDEX ix_agentaction_tenant_time
  ON agent_action_dispatch (tenant_id, dispatched_at DESC);

-- Dispatch evidence is append-only. A later executor appends its own domain evidence; it
-- does not rewrite what the approved graph originally dispatched.
CREATE TRIGGER trg_agentaction_append_only
  BEFORE UPDATE OR DELETE ON agent_action_dispatch
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
REVOKE UPDATE, DELETE ON agent_action_dispatch FROM app_user;

ALTER TABLE agent_action_dispatch ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_action_dispatch FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_action_dispatch
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
