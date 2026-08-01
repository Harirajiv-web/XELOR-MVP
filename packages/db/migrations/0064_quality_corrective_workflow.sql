-- =============================================================================
-- 0064 — Real NCR/CAPA workflow for the investor-quality thread.
-- Completion and effectiveness are deliberately separate: work being done is not proof
-- that it worked, and only an attributable human verification may close the action.
-- =============================================================================

CREATE TABLE qms_finding (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  finding_no text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('inspection','audit','complaint','supplier','manual')),
  source_ref text NOT NULL,
  inspection_id uuid REFERENCES qms_inspection(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical','major','minor')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contained','cause_confirmed','action_active','effectiveness_review','closed')),
  owner_ref text NOT NULL,
  due_date date,
  containment text,
  contained_at timestamptz,
  root_cause text,
  root_cause_confirmed_by uuid,
  root_cause_confirmed_at timestamptz,
  closed_at timestamptz,
  closed_by uuid,
  closure_reason text,
  idempotency_key text NOT NULL,
  CONSTRAINT uq_qmsfinding_no UNIQUE (tenant_id, finding_no),
  CONSTRAINT uq_qmsfinding_idem UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT ck_qmsfinding_containment CHECK (status = 'new' OR (containment IS NOT NULL AND contained_at IS NOT NULL)),
  CONSTRAINT ck_qmsfinding_rootcause CHECK (status IN ('new','contained') OR (root_cause IS NOT NULL AND root_cause_confirmed_by IS NOT NULL AND root_cause_confirmed_at IS NOT NULL)),
  CONSTRAINT ck_qmsfinding_closure CHECK (status <> 'closed' OR (closed_at IS NOT NULL AND closed_by IS NOT NULL AND closure_reason IS NOT NULL))
);
CREATE INDEX ix_qmsfinding_status ON qms_finding (tenant_id, status, due_date);
CREATE INDEX ix_qmsfinding_source ON qms_finding (tenant_id, source_type, source_ref);

CREATE TABLE qms_corrective_action (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  capa_no text NOT NULL,
  finding_id uuid NOT NULL REFERENCES qms_finding(id) ON DELETE RESTRICT,
  title text NOT NULL,
  action_plan text NOT NULL,
  owner_ref text NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','effectiveness_review','closed','ineffective')),
  effectiveness_criteria text NOT NULL,
  completion_evidence text,
  completed_at timestamptz,
  effectiveness_result text NOT NULL DEFAULT 'pending' CHECK (effectiveness_result IN ('pending','effective','ineffective')),
  effectiveness_evidence text,
  verified_by uuid,
  verified_at timestamptz,
  idempotency_key text NOT NULL,
  CONSTRAINT uq_qmscapa_no UNIQUE (tenant_id, capa_no),
  CONSTRAINT uq_qmscapa_idem UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT ck_qmscapa_completion CHECK (status IN ('planned','in_progress') OR (completion_evidence IS NOT NULL AND completed_at IS NOT NULL)),
  CONSTRAINT ck_qmscapa_verification CHECK (
    effectiveness_result = 'pending'
    OR (effectiveness_evidence IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
  ),
  CONSTRAINT ck_qmscapa_close CHECK (status <> 'closed' OR effectiveness_result = 'effective'),
  CONSTRAINT ck_qmscapa_ineffective CHECK (status <> 'ineffective' OR effectiveness_result = 'ineffective')
);
CREATE INDEX ix_qmscapa_status ON qms_corrective_action (tenant_id, status, due_date);
CREATE INDEX ix_qmscapa_finding ON qms_corrective_action (tenant_id, finding_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['qms_finding','qms_corrective_action'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
       USING (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)
       WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO app_user', t);
    EXECUTE format('REVOKE DELETE ON %I FROM app_user', t);
  END LOOP;
END $$;

INSERT INTO document_series
  (id, tenant_id, created_by, updated_by, doc_type, prefix, fy_code, width, next_no)
SELECT gen_random_uuid(), tenant.id,
       '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
       '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
       series.doc_type, series.prefix, '2627', 5, 1
  FROM tenant
 CROSS JOIN (VALUES ('quality_finding','NC'), ('corrective_action','CAPA')) AS series(doc_type, prefix)
ON CONFLICT (tenant_id, doc_type, fy_code) DO NOTHING;
