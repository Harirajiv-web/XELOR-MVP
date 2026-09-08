-- =============================================================================
-- 0066 — AI Control Center: tenant autonomy policy and durable step gates.
--
-- Autonomy is an operating permission, not a browser preference. The policy is tenant-
-- fenced and audited by the application. Step gates survive restarts so a serverless
-- process cannot accidentally forget that a person asked it to wait.
-- =============================================================================

ALTER TABLE agent_run DROP CONSTRAINT IF EXISTS agent_run_status_check;
ALTER TABLE agent_run DROP CONSTRAINT IF EXISTS ck_agentrun_status;
ALTER TABLE agent_run ADD CONSTRAINT ck_agentrun_status
  CHECK (status IN (
    'pending','running','waiting_step','waiting_approval','halted',
    'completed','failed','cancelled'
  ));

CREATE TABLE agent_control_policy (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  mode            text NOT NULL DEFAULT 'autonomous_guarded'
                  CHECK (mode IN ('autonomous_guarded','step_by_step')),
  changed_reason  text NOT NULL CHECK (length(trim(changed_reason)) >= 5),
  changed_at      timestamptz NOT NULL DEFAULT now(),
  changed_by      uuid NOT NULL,
  CONSTRAINT uq_agentcontrol_tenant UNIQUE (tenant_id)
);

CREATE TABLE agent_step_gate (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  run_id          uuid NOT NULL REFERENCES agent_run(id) ON DELETE RESTRICT,
  wave_key        text NOT NULL,
  sequence        integer NOT NULL CHECK (sequence > 0),
  node_ids        jsonb NOT NULL DEFAULT '[]'::jsonb
                  CHECK (jsonb_typeof(node_ids) = 'array'),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved')),
  requested_at    timestamptz NOT NULL DEFAULT now(),
  decided_by      uuid,
  decided_at      timestamptz,
  decision_note   text,
  resumed         boolean NOT NULL DEFAULT false,
  CONSTRAINT uq_agentstep_run_wave UNIQUE (tenant_id, run_id, wave_key),
  CONSTRAINT uq_agentstep_run_sequence UNIQUE (tenant_id, run_id, sequence),
  CONSTRAINT ck_agentstep_decision CHECK (
    (status = 'pending' AND decided_by IS NULL AND decided_at IS NULL)
    OR (status = 'approved' AND decided_by IS NOT NULL AND decided_at IS NOT NULL
        AND length(trim(decision_note)) >= 3)
  )
);
CREATE INDEX ix_agentstep_tenant_status
  ON agent_step_gate (tenant_id, status, requested_at DESC);

ALTER TABLE agent_control_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_control_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_control_policy
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE agent_step_gate ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_step_gate FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agent_step_gate
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON agent_control_policy, agent_step_gate TO app_user;
REVOKE DELETE ON agent_control_policy, agent_step_gate FROM app_user;
