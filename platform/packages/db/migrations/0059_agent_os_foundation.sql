-- =============================================================================
-- 0059 — Agent OS Phase 1: durable, tenant-fenced graph execution.
--
-- Business records remain in their owning ERP modules. These tables contain execution
-- plans, status, structured evidence, approvals and resumable checkpoints only. Agents
-- receive no SQL surface; capability handlers call the same Nest services as the UI.
-- =============================================================================

CREATE TABLE agent_graph_definition (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  graph_key     text NOT NULL,
  version       integer NOT NULL CHECK (version >= 1),
  name          text NOT NULL,
  description   text NOT NULL,
  spec          jsonb NOT NULL,
  content_hash  text NOT NULL CHECK (length(content_hash) = 64),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  CONSTRAINT uq_agentgraph_tenant_key_version UNIQUE (tenant_id, graph_key, version)
);
CREATE INDEX ix_agentgraph_tenant_status ON agent_graph_definition (tenant_id, status);

CREATE TABLE agent_run (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  graph_key        text NOT NULL,
  graph_version    integer NOT NULL CHECK (graph_version >= 1),
  goal             text NOT NULL CHECK (length(trim(goal)) > 0),
  input            jsonb NOT NULL DEFAULT '{}'::jsonb,
  graph_snapshot   jsonb NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','running','waiting_approval','completed','failed','cancelled')),
  provider_mode    text NOT NULL DEFAULT 'deterministic',
  max_steps        integer NOT NULL CHECK (max_steps > 0),
  consumed_steps   integer NOT NULL DEFAULT 0 CHECK (consumed_steps >= 0 AND consumed_steps <= max_steps),
  timeout_at       timestamptz NOT NULL,
  idempotency_key  text NOT NULL,
  request_fingerprint char(64) NOT NULL,
  output           jsonb,
  error_code       text,
  error_message    text,
  started_at       timestamptz,
  completed_at     timestamptz,
  CONSTRAINT uq_agentrun_tenant_idem UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT ck_agentrun_error CHECK (
    (status = 'failed' AND error_code IS NOT NULL AND error_message IS NOT NULL)
    OR (status <> 'failed')),
  CONSTRAINT ck_agentrun_completed CHECK (
    (status IN ('completed','failed','cancelled')) = (completed_at IS NOT NULL))
);
CREATE INDEX ix_agentrun_tenant_status_time ON agent_run (tenant_id, status, created_at DESC);

CREATE TABLE agent_node_run (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  run_id          uuid NOT NULL REFERENCES agent_run (id),
  node_id         text NOT NULL,
  node_name       text NOT NULL,
  node_kind       text NOT NULL CHECK (node_kind IN ('agent','capability','transform','branch','approval','verification')),
  agent_key       text CHECK (agent_key IS NULL OR agent_key IN ('ONYX','HEXA','MICA','SPAR','AXLE','KILN','RASP')),
  capability_key  text,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','waiting_approval','succeeded','failed','skipped','cancelled')),
  attempt         integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  input           jsonb NOT NULL DEFAULT '{}'::jsonb,
  output          jsonb,
  error_code      text,
  error_message   text,
  started_at      timestamptz,
  completed_at    timestamptz,
  CONSTRAINT uq_agentnode_run_node UNIQUE (tenant_id, run_id, node_id)
);
CREATE INDEX ix_agentnode_run_status ON agent_node_run (tenant_id, run_id, status);

CREATE TABLE agent_checkpoint (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  run_id      uuid NOT NULL REFERENCES agent_run (id),
  sequence    integer NOT NULL CHECK (sequence >= 1),
  reason      text NOT NULL,
  state       jsonb NOT NULL,
  CONSTRAINT uq_agentcheckpoint_run_seq UNIQUE (tenant_id, run_id, sequence)
);
CREATE INDEX ix_agentcheckpoint_run_time ON agent_checkpoint (tenant_id, run_id, created_at);

CREATE TABLE agent_approval (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  run_id           uuid NOT NULL REFERENCES agent_run (id),
  node_id          text NOT NULL,
  title            text NOT NULL,
  risk             text NOT NULL CHECK (risk IN ('low','medium','high')),
  proposed_action  text NOT NULL,
  proposed         jsonb NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decision_note    text,
  decided_by       uuid,
  decided_at       timestamptz,
  CONSTRAINT uq_agentapproval_run_node UNIQUE (tenant_id, run_id, node_id),
  CONSTRAINT ck_agentapproval_decided CHECK (
    (status = 'pending' AND decided_by IS NULL AND decided_at IS NULL)
    OR (status <> 'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX ix_agentapproval_tenant_status ON agent_approval (tenant_id, status, created_at DESC);

CREATE TABLE agent_run_event (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  run_id      uuid NOT NULL REFERENCES agent_run (id),
  sequence    integer NOT NULL CHECK (sequence >= 1),
  event_type  text NOT NULL,
  node_id     text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_agentevent_run_seq UNIQUE (tenant_id, run_id, sequence)
);
CREATE INDEX ix_agentevent_run_time ON agent_run_event (tenant_id, run_id, created_at);

-- Checkpoints and events are evidence, not mutable state.
CREATE TRIGGER trg_agentcheckpoint_append_only
  BEFORE UPDATE OR DELETE ON agent_checkpoint
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
CREATE TRIGGER trg_agentevent_append_only
  BEFORE UPDATE OR DELETE ON agent_run_event
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
REVOKE UPDATE, DELETE ON agent_checkpoint FROM app_user;
REVOKE UPDATE, DELETE ON agent_run_event FROM app_user;

-- Every execution artefact is tenant-fenced, including graph definitions.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_graph_definition','agent_run','agent_node_run','agent_checkpoint',
    'agent_approval','agent_run_event']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
       USING (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)
       WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)', t);
  END LOOP;
END $$;

-- Register the three route-enforced permissions for both demo tenants.
CREATE TEMP TABLE _agentos_permission (
  permission text, doc_type text, action text, description text, is_privileged boolean
) ON COMMIT DROP;
INSERT INTO _agentos_permission VALUES
  ('agentos.run.read','agent_run','read','Read Agent OS graphs, agents, capabilities, runs and their evidence.',false),
  ('agentos.run.operate','agent_run','operate','Start, resume and cancel bounded Agent OS missions.',true),
  ('agentos.approval.decide','agent_approval','decide','Approve or reject a consequential action proposed by an agent mission.',true);

INSERT INTO permission_catalogue
  (id, tenant_id, created_by, updated_by, permission, doc_type, action, description, is_privileged)
SELECT gen_random_uuid(), t.tenant_id, '0192a8c0-0000-7000-8000-0000000000ff',
       '0192a8c0-0000-7000-8000-0000000000ff',
       p.permission, p.doc_type, p.action, p.description, p.is_privileged
FROM _agentos_permission p
CROSS JOIN (VALUES
  ('0192a8c0-0000-7000-8000-000000000001'::uuid),
  ('0192a8c0-0000-7000-8000-000000000002'::uuid)
) AS t(tenant_id)
ON CONFLICT (tenant_id, permission) DO UPDATE SET
  doc_type = EXCLUDED.doc_type,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  is_privileged = EXCLUDED.is_privileged,
  updated_at = now();

-- Platform administrators and the investor-demo administrator receive the new surface.
INSERT INTO role_permission
  (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT gen_random_uuid(), r.tenant_id, '0192a8c0-0000-7000-8000-0000000000ff',
       '0192a8c0-0000-7000-8000-0000000000ff', r.id, p.permission
FROM role r CROSS JOIN _agentos_permission p
WHERE r.code IN ('admin','demo_admin','demo_hexa')
ON CONFLICT DO NOTHING;
