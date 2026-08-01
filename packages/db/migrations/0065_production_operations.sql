-- =============================================================================
-- 0065 — Executable production routing.
-- A production order is no longer a quantity-only shell: each shop-floor operation has
-- an ordered sequence, accountable operator, timestamps, quantities and completion evidence.
-- =============================================================================

CREATE TABLE production_operation (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  order_id          uuid NOT NULL REFERENCES production_order(id) ON DELETE RESTRICT,
  sequence          integer NOT NULL CHECK (sequence > 0),
  operation_code    text NOT NULL,
  operation_name    text NOT NULL,
  work_center_ref   text,
  status            text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','in_progress','completed','blocked')),
  planned_start     timestamptz,
  planned_end       timestamptz,
  actual_start      timestamptz,
  actual_end        timestamptz,
  operator_ref      text,
  input_qty         numeric(18,3) CHECK (input_qty IS NULL OR input_qty >= 0),
  output_qty        numeric(18,3) NOT NULL DEFAULT 0 CHECK (output_qty >= 0),
  rejected_qty      numeric(18,3) NOT NULL DEFAULT 0 CHECK (rejected_qty >= 0),
  evidence_note     text,
  CONSTRAINT uq_prodop_order_sequence UNIQUE (tenant_id, order_id, sequence),
  CONSTRAINT ck_prodop_plan_window CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start),
  CONSTRAINT ck_prodop_actual_window CHECK (actual_end IS NULL OR actual_start IS NULL OR actual_end >= actual_start),
  CONSTRAINT ck_prodop_started CHECK (status = 'queued' OR actual_start IS NOT NULL),
  CONSTRAINT ck_prodop_completed CHECK (
    status <> 'completed'
    OR (actual_end IS NOT NULL AND operator_ref IS NOT NULL AND evidence_note IS NOT NULL)
  )
);
CREATE INDEX ix_prodop_tenant_order ON production_operation (tenant_id, order_id, sequence);
CREATE INDEX ix_prodop_tenant_status ON production_operation (tenant_id, status);

ALTER TABLE production_operation ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_operation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON production_operation
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON production_operation TO app_user;
REVOKE DELETE ON production_operation FROM app_user;
