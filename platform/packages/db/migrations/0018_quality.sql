-- =============================================================================
-- 0018_quality — INSPECTION / QMS (Module 06). The quality system of record.
--
-- Boundary rules (INSPECTION §1.2 / §1.4, DECISIONS-V2 §1.1 / §5.6):
--   * The transactional GATE stays with the owning module (Purchase's GRN, Production's
--     manufacture). Quality owns the DEFINITION (characteristic, sampling plan, template)
--     and the RECORD (inspection, readings), exposed via the INSPECTION_GATE port.
--   * A disposition NEVER writes the stock ledger. It posts through Inventory's single
--     write path and stores the returned entry id in inventory_movement_ref; status
--     'executed' is impossible without one (enforced in the service + proven by test).
--   * item / warehouse / supplier / ref ids are cross-module LOGICAL refs — no FK across
--     a module boundary. Intra-module FKs (template->plan, reading->inspection) are real.
--
-- Spec limits are EFFECTIVE-DATED on the characteristic and SNAPSHOTTED onto each reading,
-- so revising a spec can never retroactively flip a historical verdict.
-- =============================================================================

-- ---- definition layer -------------------------------------------------------

CREATE TABLE qms_characteristic (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  code            text NOT NULL,
  name            text NOT NULL,
  item_ref        uuid,
  char_type       text NOT NULL CHECK (char_type IN ('variable','attribute')),
  nominal         numeric(18,6),
  usl             numeric(18,6),
  lsl             numeric(18,6),
  uom             text,
  defect_class    text NOT NULL DEFAULT 'major'
                  CHECK (defect_class IN ('critical','major','minor')),
  effective_from  date NOT NULL,
  effective_to    date,
  CONSTRAINT uq_qmschar_code_from UNIQUE (tenant_id, code, effective_from),
  -- a variable characteristic without a limit cannot be judged
  CONSTRAINT ck_qmschar_variable_has_limit
    CHECK (char_type <> 'variable' OR usl IS NOT NULL OR lsl IS NOT NULL),
  CONSTRAINT ck_qmschar_limits CHECK (usl IS NULL OR lsl IS NULL OR usl >= lsl)
);
CREATE INDEX ix_qmschar_tenant_item ON qms_characteristic (tenant_id, item_ref);
ALTER TABLE qms_characteristic ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_characteristic FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON qms_characteristic
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON qms_characteristic FROM app_user;

CREATE TABLE qms_sampling_plan (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  code              text NOT NULL,
  name              text NOT NULL,
  standard          text NOT NULL CHECK (standard IN
                      ('iso_2859_1_style','fixed_n','percentage','hundred_percent','c_equals_zero')),
  inspection_level  text,
  aql               numeric(6,3),
  fixed_n           integer,
  percentage        numeric(6,3),
  plan_table        jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT uq_qmsplan_code UNIQUE (tenant_id, code),
  -- each standard must carry the data its resolver needs
  CONSTRAINT ck_qmsplan_shape CHECK (
    (standard = 'iso_2859_1_style' AND aql IS NOT NULL AND jsonb_array_length(plan_table) > 0) OR
    (standard = 'fixed_n'          AND fixed_n > 0) OR
    (standard = 'percentage'       AND percentage > 0) OR
    (standard IN ('hundred_percent','c_equals_zero'))
  )
);
ALTER TABLE qms_sampling_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_sampling_plan FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON qms_sampling_plan
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON qms_sampling_plan FROM app_user;

CREATE TABLE qms_inspection_template (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  code              text NOT NULL,
  name              text NOT NULL,
  inspection_type   text NOT NULL CHECK (inspection_type IN
                      ('incoming','in_process','final','pre_dispatch','first_article',
                       'subcontract_receipt','customer_return','layered_audit')),
  item_ref          uuid,
  sampling_plan_id  uuid,
  version_no        integer NOT NULL DEFAULT 1,
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','under_review','active','superseded','obsolete')),
  CONSTRAINT uq_qmstmpl_code_version UNIQUE (tenant_id, code, version_no),
  CONSTRAINT fk_qmstmpl_plan FOREIGN KEY (sampling_plan_id)
    REFERENCES qms_sampling_plan (id) ON DELETE RESTRICT
);
-- Template-resolution ambiguity becomes a CONSTRAINT VIOLATION AT ACTIVATION TIME rather
-- than a surprise at the inspection bay (FR-QMS-004).
CREATE UNIQUE INDEX uq_qmstmpl_active_scope ON qms_inspection_template
  (tenant_id, inspection_type, coalesce(item_ref,'00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'active';
ALTER TABLE qms_inspection_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_inspection_template FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON qms_inspection_template
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON qms_inspection_template FROM app_user;

CREATE TABLE qms_template_characteristic (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid NOT NULL,
  is_active          boolean NOT NULL DEFAULT true,
  template_id        uuid NOT NULL,
  characteristic_id  uuid NOT NULL,
  seq                integer NOT NULL,
  override_usl       numeric(18,6),
  override_lsl       numeric(18,6),
  is_mandatory       boolean NOT NULL DEFAULT true,
  CONSTRAINT uq_qmstmplchar_seq UNIQUE (tenant_id, template_id, seq),
  CONSTRAINT fk_qmstmplchar_tmpl FOREIGN KEY (template_id)
    REFERENCES qms_inspection_template (id) ON DELETE RESTRICT,
  CONSTRAINT fk_qmstmplchar_char FOREIGN KEY (characteristic_id)
    REFERENCES qms_characteristic (id) ON DELETE RESTRICT
);
CREATE INDEX ix_qmstmplchar_tenant_tmpl ON qms_template_characteristic (tenant_id, template_id);
ALTER TABLE qms_template_characteristic ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_template_characteristic FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON qms_template_characteristic
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON qms_template_characteristic FROM app_user;

-- ---- execution layer --------------------------------------------------------

CREATE TABLE qms_inspection (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  inspection_no        text NOT NULL,
  template_id          uuid,
  template_version     integer,
  inspection_type      text NOT NULL,
  ref_type             text NOT NULL CHECK (ref_type IN
                         ('grn','manufacture','subcontract_receipt','job_card',
                          'standalone','pre_dispatch','customer_return','first_article',
                          'layered_audit','gauge_verification')),
  ref_id               text,
  item_ref             uuid,
  source_warehouse_ref uuid,
  lot_qty              numeric(18,3),
  sampling_plan_id     uuid,
  sample_size          integer,
  accept_number        integer,
  reject_number        integer,
  sampling_rationale   text,
  verdict_rationale    text,
  inspector_ref        uuid,
  completed_at         text,
  result               text NOT NULL DEFAULT 'pending'
                       CHECK (result IN ('pending','accepted','rejected','cancelled')),
  status               text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','in_progress','completed','cancelled')),
  qty_accepted         numeric(18,3),
  qty_rejected         numeric(18,3),
  CONSTRAINT uq_qmsinsp_tenant_no UNIQUE (tenant_id, inspection_no),
  CONSTRAINT fk_qmsinsp_tmpl FOREIGN KEY (template_id)
    REFERENCES qms_inspection_template (id) ON DELETE RESTRICT,
  -- the accepted/rejected split can never exceed the lot
  CONSTRAINT ck_qmsinsp_qty_split CHECK (
    qty_accepted IS NULL OR qty_rejected IS NULL OR lot_qty IS NULL
    OR (qty_accepted + qty_rejected) <= lot_qty + 0.0001)
);
-- THE GATE ANCHOR: one open inspection per owning transaction, preserving Production's
-- UNIQUE(ref_type, ref_id) semantics so a transaction can never be double-gated.
CREATE UNIQUE INDEX uq_qmsinsp_gate ON qms_inspection (tenant_id, ref_type, ref_id)
  WHERE ref_type IN ('grn','manufacture','subcontract_receipt','job_card');
CREATE INDEX ix_qmsinsp_tenant_status ON qms_inspection (tenant_id, status);
CREATE INDEX ix_qmsinsp_tenant_item ON qms_inspection (tenant_id, item_ref);
ALTER TABLE qms_inspection ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_inspection FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON qms_inspection
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON qms_inspection FROM app_user;

CREATE TABLE qms_inspection_reading (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  inspection_id        uuid NOT NULL,
  characteristic_id    uuid NOT NULL,
  sample_no            integer NOT NULL CHECK (sample_no > 0),
  reading_numeric      numeric(18,6),
  reading_bool         boolean,
  -- SNAPSHOT of the limits used, not a join at read time: a later spec revision must never
  -- silently change the pass/fail verdict of a historical inspection.
  applied_usl          numeric(18,6),
  applied_lsl          numeric(18,6),
  applied_defect_class text,
  is_within_spec       boolean NOT NULL,
  deviation            numeric(18,6) NOT NULL DEFAULT 0,
  CONSTRAINT uq_qmsreading_sample UNIQUE (tenant_id, inspection_id, characteristic_id, sample_no),
  CONSTRAINT fk_qmsreading_insp FOREIGN KEY (inspection_id)
    REFERENCES qms_inspection (id) ON DELETE RESTRICT,
  CONSTRAINT fk_qmsreading_char FOREIGN KEY (characteristic_id)
    REFERENCES qms_characteristic (id) ON DELETE RESTRICT
);
CREATE INDEX ix_qmsreading_tenant_insp ON qms_inspection_reading (tenant_id, inspection_id);
ALTER TABLE qms_inspection_reading ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_inspection_reading FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON qms_inspection_reading
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON qms_inspection_reading FROM app_user;

CREATE TABLE qms_disposition (
  id                     uuid PRIMARY KEY,
  tenant_id              uuid NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid NOT NULL,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             uuid NOT NULL,
  is_active              boolean NOT NULL DEFAULT true,
  disposition_no         text NOT NULL,
  inspection_id          uuid NOT NULL,
  disposition_type       text NOT NULL CHECK (disposition_type IN
                           ('accept','quarantine','rework','scrap','return_to_supplier')),
  qty                    numeric(18,3) NOT NULL CHECK (qty > 0),
  reason                 text NOT NULL,
  from_warehouse_ref     uuid,
  target_warehouse_ref   uuid,
  status                 text NOT NULL DEFAULT 'proposed'
                         CHECK (status IN ('proposed','executed','movement_failed')),
  inventory_movement_ref text,
  CONSTRAINT uq_qmsdisp_tenant_no UNIQUE (tenant_id, disposition_no),
  CONSTRAINT fk_qmsdisp_insp FOREIGN KEY (inspection_id)
    REFERENCES qms_inspection (id) ON DELETE RESTRICT,
  -- The rule of §1.4 made structural: a disposition that moved stock MUST carry the entry
  -- id Inventory returned. 'executed' without it is unrepresentable, not merely discouraged.
  CONSTRAINT ck_qmsdisp_executed_has_movement CHECK (
    status <> 'executed' OR disposition_type = 'accept' OR inventory_movement_ref IS NOT NULL)
);
CREATE INDEX ix_qmsdisp_tenant_insp ON qms_disposition (tenant_id, inspection_id);
ALTER TABLE qms_disposition ENABLE ROW LEVEL SECURITY;
ALTER TABLE qms_disposition FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON qms_disposition
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON qms_disposition FROM app_user;

-- ---- permissions: QA defines and dispositions; the shop floor records readings ----
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission) VALUES
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','quality.template.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','quality.template.manage'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','quality.inspection.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','quality.inspection.execute'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','quality.disposition.decide'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','quality.template.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','quality.inspection.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','quality.inspection.execute'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','quality.template.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','quality.template.manage'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','quality.inspection.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','quality.inspection.execute'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','quality.disposition.decide')
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;
