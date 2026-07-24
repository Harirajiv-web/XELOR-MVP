-- =============================================================================
-- 0005_workflow — ADMINISTRATION's W1 approval engine (DECISIONS-V2 §1.3).
-- Templates (definition, versioned) · live approvals (instance) · tamper-proof
-- action trail (hash-chained, append-only, like the audit log).
-- =============================================================================

CREATE TABLE workflow_definition (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  code         text NOT NULL,
  version      integer NOT NULL,
  name         text NOT NULL,
  subject_type text NOT NULL,
  steps        jsonb NOT NULL,
  CONSTRAINT uq_wfdef_code_ver UNIQUE (tenant_id, code, version)
);
ALTER TABLE workflow_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_definition FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow_definition
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON workflow_definition FROM app_user;

CREATE TABLE workflow_instance (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  definition_id    uuid NOT NULL,
  definition_code  text NOT NULL,
  subject_type     text NOT NULL,
  subject_id       uuid NOT NULL,
  current_step_seq integer NOT NULL,
  status           text NOT NULL,               -- pending | approved | rejected | cancelled
  sla_due_at       timestamptz,
  initiated_by     uuid NOT NULL,
  CONSTRAINT fk_wfinst_def FOREIGN KEY (definition_id) REFERENCES workflow_definition (id) ON DELETE RESTRICT
);
CREATE INDEX ix_wfinst_status ON workflow_instance (tenant_id, status);
CREATE INDEX ix_wfinst_subject ON workflow_instance (tenant_id, subject_type, subject_id);
ALTER TABLE workflow_instance ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_instance FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow_instance
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON workflow_instance FROM app_user;

CREATE TABLE workflow_action (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  instance_id uuid NOT NULL,
  seq         integer NOT NULL,
  action      text NOT NULL,                    -- submit | approve | reject | cancel
  step_seq    integer NOT NULL,
  actor_id    uuid NOT NULL,
  comment     text,
  at          timestamptz NOT NULL DEFAULT now(),
  prev_hash   char(64) NOT NULL,
  hash        char(64) NOT NULL,
  CONSTRAINT fk_wfaction_inst FOREIGN KEY (instance_id) REFERENCES workflow_instance (id) ON DELETE RESTRICT,
  CONSTRAINT uq_wfaction_seq UNIQUE (tenant_id, instance_id, seq)
);
ALTER TABLE workflow_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_action FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workflow_action
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
-- The approval trail is append-only, same guarantee as the audit log (reuse the
-- trigger function from 0000). Nobody edits who signed off.
CREATE TRIGGER trg_wfaction_append_only
  BEFORE UPDATE OR DELETE ON workflow_action
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
REVOKE UPDATE, DELETE ON workflow_action FROM app_user;

-- ---- demo template: a 2-level purchase-order approval for Trishul ----
INSERT INTO workflow_definition (id, tenant_id, created_by, updated_by, code, version, name, subject_type, steps) VALUES
  ('0192a8c0-0005-7000-8000-000000000001','0192a8c0-0000-7000-8000-000000000001',
   '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
   'po_approval', 1, 'Purchase Order Approval', 'purchase_order',
   '[{"seq":1,"name":"Stores review","approverType":"role","approverRef":"stores_incharge","slaHours":24},
     {"seq":2,"name":"Admin sign-off","approverType":"role","approverRef":"admin","slaHours":48}]'::jsonb)
ON CONFLICT (id) DO NOTHING;
