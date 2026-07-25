-- =============================================================================
-- 0026_maintenance — MAINTENANCE / CMMS (Module 10): the asset-uptime backbone.
--
-- One loop, captured as transactions rather than as memory (MAINTENANCE §1.1):
--   request -> triage -> MWO -> execute (labour + spares + checklist) -> close with a
--   failure code -> downtime and cost land on the asset -> KPIs and the next PM fall out
--
-- Five guarantees are made HERE, in the database, not in the service layer:
--
--  (1) A MACHINE CANNOT BE DOWN TWICE. A btree_gist EXCLUDE constraint over
--      (tenant, asset, tstzrange(started_at, coalesce(ended_at,'infinity'))) makes an
--      overlapping downtime interval unrepresentable. Two operators reporting the same
--      stop produce one clock and a structured DOWNTIME_OVERLAP for the loser -- decided
--      by Postgres, not by application politeness (NFR-04).
--
--  (2) A TECHNICIAN CANNOT BE IN TWO PLACES. The same mechanism over
--      (tenant, employee_ref, labour interval) rejects overlapping labour rows across
--      MWOs, so labour cost cannot be double-counted by a mis-tap (V-LAB-02).
--
--  (3) DURATION AND COST TOTALS ARE GENERATED, never hand-maintained, so they can never
--      disagree with the endpoints and amounts they are derived from.
--
--  (4) PM GENERATION IS IDEMPOTENT. UNIQUE (tenant, schedule, occurrence_seq) means a
--      worker retry, a redeploy or a manual re-run produces zero duplicate occurrences
--      (NFR-05) -- and a statutory schedule cannot be set to floating drift at all
--      (ck_statutory_fixed), because the six-monthly examination stays on the calendar.
--
--  (5) METER READINGS, ASSET HISTORY AND EXTERNAL ACTUALS ARE APPEND-ONLY, at the grant
--      AND at a trigger -- the same two-layer discipline the stock ledger, the journal and
--      the punch table already use. `asset_meter.current_value` is a PROJECTION of the
--      readings and a trigger asserts it stays one.
--
-- Naming (§1.4, §9.2, enforced again by `pnpm --filter @ind-core/db naming-check`):
-- `maintenance_work_order` is NOT `work_orders`. PRODUCTION owns the manufacturing order
-- (item + BOM + qty). This module owns the MWO (asset + failure + downtime). Separate
-- tables, separate series, separate permissions, no FK between them, ever.
-- =============================================================================

-- Range-overlap exclusion over scalar equality columns needs btree_gist.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- Shared guard functions
-- ---------------------------------------------------------------------------

-- Blanket append-only refusal, for tables where nothing may ever change.
CREATE OR REPLACE FUNCTION mnt_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only: % on % is not permitted', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

-- A CLOSED or CANCELLED maintenance work order is history. The cost snapshot on it was
-- computed from rates and valuations as they stood on the work date; letting it be edited
-- later is how a maintenance system quietly restates last quarter.
CREATE OR REPLACE FUNCTION mnt_guard_closed_mwo() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'maintenance work orders are never deleted (%), cancel with a reason instead', OLD.mwo_no
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status IN ('closed','cancelled') THEN
    RAISE EXCEPTION 'MWO % is % and is frozen', OLD.mwo_no, OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Children of a closed MWO are frozen with it: labour, tasks, spares and external costs
-- are the evidence behind the closed figure.
CREATE OR REPLACE FUNCTION mnt_guard_mwo_child() RETURNS trigger AS $$
DECLARE parent_id uuid; parent_status text; parent_no text;
BEGIN
  -- NEW is unassigned in a DELETE trigger, so the parent id is resolved per operation
  -- rather than with COALESCE(NEW.…, OLD.…), which would raise before it could compare.
  IF TG_OP = 'DELETE' THEN parent_id := OLD.mwo_id; ELSE parent_id := NEW.mwo_id; END IF;
  SELECT status, mwo_no INTO parent_status, parent_no
    FROM maintenance_work_order WHERE id = parent_id;
  IF parent_status IN ('closed','cancelled') THEN
    RAISE EXCEPTION '% on % is refused: MWO % is %',
      TG_OP, TG_TABLE_NAME, parent_no, parent_status
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A downtime correction is ADDITIVE: the original endpoints are retained in-row and a
-- reason is mandatory. Silent edits to the downtime clock are the one change that could
-- flatter every reliability KPI at once, so they are made impossible rather than rare.
CREATE OR REPLACE FUNCTION mnt_guard_downtime() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'downtime intervals are never deleted; correct with a reason instead'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.started_at, NEW.ended_at) IS DISTINCT FROM (OLD.started_at, OLD.ended_at)
     AND OLD.ended_at IS NOT NULL THEN
    IF NOT NEW.corrected OR NEW.correction_reason IS NULL THEN
      RAISE EXCEPTION 'changing a closed downtime interval requires corrected = true and a reason'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.original_started_at IS NULL OR NEW.original_ended_at IS NULL THEN
      RAISE EXCEPTION 'a correction must retain the original start and end'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- `current_value` is a projection of asset_meter_reading, never an editable field.
-- The trigger asserts exactly that definition: after any update it must equal the latest
-- reading. (A meter with no readings yet is left alone -- there is nothing to project.)
CREATE OR REPLACE FUNCTION mnt_guard_meter_projection() RETURNS trigger AS $$
DECLARE latest numeric(18,4);
BEGIN
  SELECT reading_value INTO latest
    FROM asset_meter_reading
   WHERE meter_id = NEW.id
   ORDER BY reading_at DESC, created_at DESC
   LIMIT 1;
  IF latest IS NOT NULL AND NEW.current_value IS DISTINCT FROM latest THEN
    RAISE EXCEPTION
      'asset_meter.current_value is a projection of its readings (latest %, attempted %)',
      latest, NEW.current_value
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Asset master, hierarchy and meters
-- =============================================================================

CREATE TABLE maintenance_asset (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  asset_code           text NOT NULL,
  name                 text NOT NULL,
  asset_type           text NOT NULL CHECK (asset_type IN ('plant','area','machine','component')),
  parent_asset_id      uuid REFERENCES maintenance_asset (id),   -- intra-module FK: legal
  path                 text NOT NULL,
  depth                smallint NOT NULL CHECK (depth BETWEEN 0 AND 3),
  criticality          text CHECK (criticality IN ('A','B','C')),
  criticality_reason   text,
  status               text NOT NULL DEFAULT 'operational'
                       CHECK (status IN ('commissioned','operational','under_maintenance',
                                         'standby','idle','decommissioned')),
  make                 text,
  model                text,
  serial_no            text,
  manufacture_year     smallint,
  commissioned_on      date,
  location_ref         uuid,
  cost_centre_ref      text,
  department_ref       text,
  work_center_ref      uuid,
  supplier_ref         uuid,
  asset_finance_ref    uuid,
  warranty_end_date    date,
  statutory_class      text NOT NULL DEFAULT 'none'
                       CHECK (statutory_class IN ('none','hoist_lift_s28','lifting_tackle_s29',
                                                  'pressure_plant_s31','other')),
  competent_person_ref uuid,
  qr_payload           text,
  attributes           jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_asset_code UNIQUE (tenant_id, asset_code),
  -- A machine or component without a criticality cannot be given an SLA or a PM policy.
  -- Grouping nodes (plant, area) legitimately have none.
  CONSTRAINT ck_asset_criticality_required
    CHECK (asset_type IN ('plant','area') OR criticality IS NOT NULL)
);
COMMENT ON TABLE  maintenance_asset IS
  'Maintainable asset master. Production owns the same machine as a WORK CENTER; the link is work_center_ref (logical, no FK).';
COMMENT ON COLUMN maintenance_asset.work_center_ref IS
  'Logical reference to Production.work_center, resolved through Production''s public interface. Never a foreign key.';
COMMENT ON COLUMN maintenance_asset.path IS
  'Materialised hierarchy path for subtree queries; rebuilt on move, never accepted from a client.';
CREATE INDEX ix_asset_parent ON maintenance_asset (tenant_id, parent_asset_id);
CREATE INDEX ix_asset_path   ON maintenance_asset (tenant_id, path text_pattern_ops);
CREATE INDEX ix_asset_crit   ON maintenance_asset (tenant_id, criticality, status);
CREATE INDEX ix_asset_statut ON maintenance_asset (tenant_id, statutory_class)
  WHERE statutory_class <> 'none';
-- One work center maps to at most ONE active asset. A second link is a data error that
-- would split a machine's history in two, so it is a constraint violation, not a warning.
CREATE UNIQUE INDEX uq_asset_workcenter ON maintenance_asset (tenant_id, work_center_ref)
  WHERE work_center_ref IS NOT NULL AND is_active;
REVOKE DELETE ON maintenance_asset FROM app_user;

CREATE TABLE maintenance_asset_history (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  asset_id        uuid NOT NULL REFERENCES maintenance_asset (id),
  change_type     text NOT NULL CHECK (change_type IN
                    ('move','status','criticality','work_center_link','decommission')),
  from_value      jsonb,
  to_value        jsonb NOT NULL,
  reason          text,
  effective_from  timestamptz NOT NULL,
  effective_to    timestamptz
);
CREATE INDEX ix_asset_hist ON maintenance_asset_history (tenant_id, asset_id, effective_from DESC);
REVOKE UPDATE, DELETE ON maintenance_asset_history FROM app_user;
CREATE TRIGGER trg_asset_hist_append_only
  BEFORE UPDATE OR DELETE ON maintenance_asset_history
  FOR EACH ROW EXECUTE FUNCTION mnt_forbid_mutation();

CREATE TABLE asset_meter (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  asset_id             uuid NOT NULL REFERENCES maintenance_asset (id),
  meter_type           text NOT NULL CHECK (meter_type IN ('run_hours','cycles','strokes','km','kwh')),
  uom                  text NOT NULL,
  current_value        numeric(18,4) NOT NULL DEFAULT 0,
  last_reading_at      timestamptz,
  last_real_reading_at timestamptz,
  rollover_at          numeric(18,4),
  daily_rate_est       numeric(18,4),
  CONSTRAINT uq_meter UNIQUE (tenant_id, asset_id, meter_type)
);
COMMENT ON COLUMN asset_meter.current_value IS
  'Projection of asset_meter_reading, rebuildable. Never edited directly -- the Inventory ledger lesson applied to meters (FR-MNT-005).';
COMMENT ON COLUMN asset_meter.last_real_reading_at IS
  'Last NON-estimated reading. A meter with none for 60 days stops driving PM forecasts rather than inventing a due date.';
CREATE TRIGGER trg_meter_projection BEFORE UPDATE ON asset_meter
  FOR EACH ROW EXECUTE FUNCTION mnt_guard_meter_projection();
REVOKE DELETE ON asset_meter FROM app_user;

CREATE TABLE asset_meter_reading (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  meter_id          uuid NOT NULL REFERENCES asset_meter (id),
  reading_value     numeric(18,4) NOT NULL CHECK (reading_value >= 0),
  reading_at        timestamptz NOT NULL,
  source            text NOT NULL CHECK (source IN ('manual','event','estimated')),
  source_ref        text,
  is_estimated      boolean NOT NULL DEFAULT false,
  is_correction     boolean NOT NULL DEFAULT false,
  correction_reason text,
  photo_key         text,
  note              text,
  -- A correction must say why. Everything else about a reading is immutable.
  CONSTRAINT ck_meter_correction CHECK (NOT is_correction OR correction_reason IS NOT NULL),
  CONSTRAINT ck_meter_estimated  CHECK ((source = 'estimated') = is_estimated)
);
COMMENT ON TABLE asset_meter_reading IS
  'Append-only. An ESTIMATED reading may move a PM forecast but may never satisfy the due meter value of an occurrence being completed (FR-MNT-006, V-MTR-03).';
CREATE INDEX ix_meter_read ON asset_meter_reading (tenant_id, meter_id, reading_at DESC);
REVOKE UPDATE, DELETE ON asset_meter_reading FROM app_user;
CREATE TRIGGER trg_meter_read_append_only
  BEFORE UPDATE OR DELETE ON asset_meter_reading
  FOR EACH ROW EXECUTE FUNCTION mnt_forbid_mutation();

-- =============================================================================
-- Configuration & taxonomy -- effective-dated, append-only, never a code constant
-- =============================================================================

CREATE TABLE failure_code (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  code           text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('mode','cause','detection','action')),
  label          text NOT NULL,
  parent_code_id uuid REFERENCES failure_code (id),
  asset_class    text,
  effective_from date NOT NULL,
  effective_to   date,
  CONSTRAINT uq_failure_code UNIQUE (tenant_id, kind, code, effective_from)
);
COMMENT ON TABLE failure_code IS
  'Structured after the ISO 14224 reliability-data model (failure mode / cause / detection). Codes are RETIRED by effective_to; history is never rewritten.';
REVOKE DELETE ON failure_code FROM app_user;

CREATE TABLE downtime_reason_code (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  code           text NOT NULL,
  label          text NOT NULL,
  default_kind   text NOT NULL DEFAULT 'unplanned' CHECK (default_kind IN ('unplanned','planned')),
  effective_from date NOT NULL,
  effective_to   date,
  CONSTRAINT uq_dt_reason UNIQUE (tenant_id, code, effective_from)
);
REVOKE DELETE ON downtime_reason_code FROM app_user;

CREATE TABLE criticality_sla_matrix (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  criticality      text NOT NULL CHECK (criticality IN ('A','B','C')),
  severity         text NOT NULL CHECK (severity IN ('stopped','degraded','cosmetic')),
  priority         text NOT NULL CHECK (priority IN ('P1','P2','P3','P4')),
  respond_minutes  integer NOT NULL CHECK (respond_minutes > 0),
  restore_minutes  integer NOT NULL CHECK (restore_minutes > 0),
  escalate_to_role text NOT NULL DEFAULT 'maintenance_manager',
  effective_from   date NOT NULL,
  effective_to     date,
  CONSTRAINT uq_sla_matrix UNIQUE (tenant_id, criticality, severity, effective_from),
  CONSTRAINT ck_sla_order CHECK (restore_minutes >= respond_minutes)
);
COMMENT ON TABLE criticality_sla_matrix IS
  'Priority and SLA are DERIVED from criticality x severity, resolved AS OF the request date. Effective-dated and append-only, so editing the matrix in September cannot restate a July deadline (NFR-14).';
-- Superseded by a new effective_from, never edited. Same discipline as HRM's stat_* book.
REVOKE UPDATE, DELETE ON criticality_sla_matrix FROM app_user;
CREATE TRIGGER trg_sla_matrix_append_only
  BEFORE UPDATE OR DELETE ON criticality_sla_matrix
  FOR EACH ROW EXECUTE FUNCTION mnt_forbid_mutation();

CREATE TABLE maintenance_labour_rate (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  trade          text NOT NULL,
  grade          text,
  rate_per_hour  numeric(18,2) NOT NULL CHECK (rate_per_hour >= 0),
  ot_multiplier  numeric(6,3) NOT NULL DEFAULT 1.000,
  effective_from date NOT NULL,
  effective_to   date
);
COMMENT ON TABLE maintenance_labour_rate IS
  'FALLBACK only. Where HRM publishes an employee costing rate it is consumed by reference and preferred; no employee pay data is ever copied into this module (FR-MNT-075, NFR-13).';
CREATE UNIQUE INDEX uq_labour_rate
  ON maintenance_labour_rate (tenant_id, trade, coalesce(grade,''), effective_from);
REVOKE UPDATE, DELETE ON maintenance_labour_rate FROM app_user;
CREATE TRIGGER trg_labour_rate_append_only
  BEFORE UPDATE OR DELETE ON maintenance_labour_rate
  FOR EACH ROW EXECUTE FUNCTION mnt_forbid_mutation();

CREATE TABLE maintenance_technician (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  employee_ref        uuid NOT NULL,
  trade               text NOT NULL,
  grade               text,
  plant_ref           uuid,
  is_competent_person boolean NOT NULL DEFAULT false,
  competency_note     text,
  CONSTRAINT uq_mnt_tech UNIQUE (tenant_id, employee_ref)
);
COMMENT ON TABLE maintenance_technician IS
  'NOT an employee master. The person lives in HRM; this row holds only the maintenance facts -- which trade and grade price their time, and whether they are a competent person for statutory examinations. No name, no pay, no identity document.';
REVOKE DELETE ON maintenance_technician FROM app_user;

-- =============================================================================
-- Requests
-- =============================================================================

CREATE TABLE maintenance_request (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  request_no       text NOT NULL,
  asset_id         uuid NOT NULL REFERENCES maintenance_asset (id),
  requested_by_ref uuid NOT NULL,
  requested_at     timestamptz NOT NULL DEFAULT now(),
  severity         text NOT NULL CHECK (severity IN ('stopped','degraded','cosmetic')),
  symptom_code     text NOT NULL,
  detail           text,
  photo_keys       jsonb NOT NULL DEFAULT '[]'::jsonb,
  line_stopped     boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'submitted'
                   CHECK (status IN ('submitted','acknowledged','triaged','mwo_created',
                                     'merged','converted_to_pm','rejected','closed')),
  acknowledged_at  timestamptz,
  acknowledged_by  uuid,
  triaged_at       timestamptz,
  triaged_by       uuid,
  mwo_id           uuid,                        -- FK added after maintenance_work_order
  reject_reason    text,
  downtime_id      uuid,                        -- FK added after asset_downtime
  sla_respond_by   timestamptz NOT NULL,
  sla_config_ref   text NOT NULL,
  sla_breached     boolean NOT NULL DEFAULT false,
  idempotency_key  text NOT NULL,
  CONSTRAINT uq_request_no   UNIQUE (tenant_id, request_no),
  CONSTRAINT uq_request_idem UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT ck_request_reject CHECK (status <> 'rejected' OR reject_reason IS NOT NULL)
);
COMMENT ON COLUMN maintenance_request.downtime_id IS
  'A stopped-severity request opens a downtime interval BEFORE triage (FR-MNT-021), so the clock reflects the machine rather than maintenance''s reaction time. A rejection CORRECTS the interval with an audited reason; it never deletes it.';
-- The triage queue is the module's hottest read; a partial index keeps it that way.
CREATE INDEX ix_request_queue ON maintenance_request (tenant_id, status, requested_at DESC)
  WHERE status IN ('submitted','acknowledged');
CREATE INDEX ix_request_asset ON maintenance_request (tenant_id, asset_id, requested_at DESC);
CREATE INDEX ix_request_mine  ON maintenance_request (tenant_id, requested_by_ref, requested_at DESC);
REVOKE DELETE ON maintenance_request FROM app_user;

-- =============================================================================
-- The Maintenance Work Order and its children
-- =============================================================================

CREATE TABLE maintenance_work_order (
  id                       uuid PRIMARY KEY,
  tenant_id                uuid NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid NOT NULL,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid NOT NULL,
  is_active                boolean NOT NULL DEFAULT true,
  mwo_no                   text NOT NULL,
  asset_id                 uuid NOT NULL REFERENCES maintenance_asset (id),
  mwo_type                 text NOT NULL CHECK (mwo_type IN
                             ('breakdown','corrective','preventive','statutory','improvement')),
  priority                 text NOT NULL CHECK (priority IN ('P1','P2','P3','P4')),
  priority_override_reason text,
  status                   text NOT NULL DEFAULT 'draft' CHECK (status IN
                             ('draft','approved','assigned','in_progress','on_hold',
                              'completed','closed','cancelled')),
  source                   text NOT NULL CHECK (source IN
                             ('request','pm_occurrence','manual','inspection_finding')),
  request_id               uuid REFERENCES maintenance_request (id),
  pm_occurrence_id         uuid,                -- FK added after pm_occurrence
  title                    text NOT NULL,
  description              text,
  cost_centre_ref          text,
  primary_tech_ref         uuid,
  reported_at              timestamptz NOT NULL,
  planned_start            timestamptz,
  planned_end              timestamptz,
  actual_start             timestamptz,
  actual_end               timestamptz,
  sla_respond_by           timestamptz,
  sla_restore_by           timestamptz,
  responded_at             timestamptz,
  sla_breached             boolean NOT NULL DEFAULT false,
  hold_reason              text CHECK (hold_reason IN
                             ('awaiting_spare','awaiting_vendor','awaiting_production_window',
                              'awaiting_permit','other')),
  hold_note                text,
  held_at                  timestamptz,
  failure_mode_id          uuid REFERENCES failure_code (id),
  failure_cause_id         uuid REFERENCES failure_code (id),
  detection_id             uuid REFERENCES failure_code (id),
  failed_component_id      uuid REFERENCES maintenance_asset (id),
  is_safety_related        boolean NOT NULL DEFAULT false,
  incident_ref             text,
  competent_person_ref     uuid,
  amc_contract_id          uuid,                -- FK added after amc_contract
  cost_labour              numeric(18,2) NOT NULL DEFAULT 0,
  cost_spares              numeric(18,2) NOT NULL DEFAULT 0,
  cost_external            numeric(18,2) NOT NULL DEFAULT 0,
  cost_total               numeric(18,2)
                           GENERATED ALWAYS AS (cost_labour + cost_spares + cost_external) STORED,
  cost_computed_at         timestamptz,
  workflow_instance_id     uuid,
  approval_required_reason text,
  closed_at                timestamptz,
  cancel_reason            text,
  idempotency_key          text NOT NULL,
  CONSTRAINT uq_mwo_no   UNIQUE (tenant_id, mwo_no),
  CONSTRAINT uq_mwo_idem UNIQUE (tenant_id, idempotency_key),
  -- A cancellation without a reason is an untraceable disappearance.
  CONSTRAINT ck_mwo_cancel CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL),
  -- On hold means on hold FOR a reason -- the enum drives whether the clock keeps running.
  CONSTRAINT ck_mwo_hold   CHECK (status <> 'on_hold' OR hold_reason IS NOT NULL),
  -- Failure coding is enforced by the completion gate; the constraint backs it for the
  -- two types where the reliability views depend on it.
  CONSTRAINT ck_mwo_failure_coded CHECK (
    status NOT IN ('completed','closed')
    OR mwo_type NOT IN ('breakdown','corrective')
    OR (failure_mode_id IS NOT NULL AND failure_cause_id IS NOT NULL AND detection_id IS NOT NULL)
  ),
  -- A statutory examination without a named competent person is not an examination.
  CONSTRAINT ck_mwo_competent CHECK (
    status NOT IN ('completed','closed')
    OR mwo_type <> 'statutory'
    OR competent_person_ref IS NOT NULL
  )
);
COMMENT ON TABLE maintenance_work_order IS
  'Maintenance Work Order (MWO). NOT the manufacturing work order -- PRODUCTION owns production_order (item + BOM + qty, WO- series). Separate table, separate numbering series, separate permissions (mnt.* vs prod.*), no FK between them.';
CREATE INDEX ix_mwo_board ON maintenance_work_order (tenant_id, status, priority, sla_restore_by)
  WHERE status NOT IN ('closed','cancelled');
CREATE INDEX ix_mwo_asset  ON maintenance_work_order (tenant_id, asset_id, reported_at DESC);
CREATE INDEX ix_mwo_tech   ON maintenance_work_order (tenant_id, primary_tech_ref, status);
CREATE INDEX ix_mwo_type_w ON maintenance_work_order (tenant_id, mwo_type, actual_end);
CREATE INDEX ix_mwo_fail   ON maintenance_work_order (tenant_id, failure_mode_id)
  WHERE failure_mode_id IS NOT NULL;
CREATE TRIGGER trg_mwo_guard BEFORE UPDATE OR DELETE ON maintenance_work_order
  FOR EACH ROW EXECUTE FUNCTION mnt_guard_closed_mwo();
REVOKE DELETE ON maintenance_work_order FROM app_user;

ALTER TABLE maintenance_request
  ADD CONSTRAINT fk_request_mwo FOREIGN KEY (mwo_id) REFERENCES maintenance_work_order (id);

CREATE TABLE mwo_task (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  mwo_id           uuid NOT NULL REFERENCES maintenance_work_order (id),
  sequence         smallint NOT NULL,
  instruction      text NOT NULL,
  safety_note      text,
  result_type      text NOT NULL DEFAULT 'ok_not_ok'
                   CHECK (result_type IN ('ok_not_ok','numeric','text','photo')),
  expected_min     numeric(18,4),
  expected_max     numeric(18,4),
  uom              text,
  is_mandatory     boolean NOT NULL DEFAULT true,
  result_value     text,
  result_photo_key text,
  is_pass          boolean,
  completed_by     uuid,
  completed_at     timestamptz,
  template_version integer,
  CONSTRAINT uq_mwo_task_seq UNIQUE (tenant_id, mwo_id, sequence),
  CONSTRAINT ck_task_range CHECK (expected_min IS NULL OR expected_max IS NULL OR expected_max >= expected_min)
);
CREATE INDEX ix_mwo_task_open ON mwo_task (tenant_id, mwo_id)
  WHERE completed_at IS NULL AND is_mandatory;
CREATE TRIGGER trg_mwo_task_guard BEFORE UPDATE OR DELETE ON mwo_task
  FOR EACH ROW EXECUTE FUNCTION mnt_guard_mwo_child();
REVOKE DELETE ON mwo_task FROM app_user;

CREATE TABLE mwo_labour (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  mwo_id          uuid NOT NULL REFERENCES maintenance_work_order (id),
  employee_ref    uuid NOT NULL,
  work_type       text NOT NULL DEFAULT 'repair'
                  CHECK (work_type IN ('diagnosis','repair','testing','travel','waiting')),
  started_at      timestamptz NOT NULL,
  ended_at        timestamptz,
  hours           numeric(9,3) GENERATED ALWAYS AS
                    (CASE WHEN ended_at IS NULL THEN NULL
                          ELSE round(EXTRACT(epoch FROM (ended_at - started_at))::numeric / 3600, 3) END) STORED,
  trade           text,
  grade           text,
  rate_source     text CHECK (rate_source IN ('hrm','local_config')),
  rate_config_ref text,
  rate_per_hour   numeric(18,2),
  amount          numeric(18,2),
  is_backdated    boolean NOT NULL DEFAULT false,
  backdate_reason text,
  note            text,
  CONSTRAINT ck_labour_window   CHECK (ended_at IS NULL OR ended_at > started_at),
  CONSTRAINT ck_labour_backdate CHECK (NOT is_backdated OR backdate_reason IS NOT NULL)
);
-- A fitter cannot be in two places: no overlapping labour intervals per employee, across
-- ALL work orders. Without this, an accidental double-start silently doubles labour cost.
ALTER TABLE mwo_labour ADD CONSTRAINT ex_labour_no_overlap
  EXCLUDE USING gist (
    tenant_id WITH =, employee_ref WITH =,
    tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz)) WITH &&
  );
CREATE INDEX ix_labour_mwo ON mwo_labour (tenant_id, mwo_id);
CREATE TRIGGER trg_mwo_labour_guard BEFORE UPDATE OR DELETE ON mwo_labour
  FOR EACH ROW EXECUTE FUNCTION mnt_guard_mwo_child();
REVOKE DELETE ON mwo_labour FROM app_user;

CREATE TABLE mwo_spare (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  mwo_id          uuid NOT NULL REFERENCES maintenance_work_order (id),
  item_ref        uuid NOT NULL,
  item_code_cache text,
  uom             text NOT NULL,
  warehouse_ref   uuid,
  qty_planned     numeric(18,4) NOT NULL DEFAULT 0,
  qty_issued      numeric(18,4) NOT NULL DEFAULT 0,
  reservation_ref uuid,
  stock_entry_ref uuid,
  valued_amount   numeric(18,2) NOT NULL DEFAULT 0,
  issue_status    text NOT NULL DEFAULT 'planned'
                  CHECK (issue_status IN ('planned','reserved','requested','issued','failed','returned')),
  failure_note    text,
  -- 'issued' is IMPOSSIBLE without the stock entry Inventory returned. The same shape as
  -- Quality's disposition constraint: the boundary is a constraint, not a promise.
  CONSTRAINT ck_spare_issued_has_entry
    CHECK (issue_status <> 'issued' OR stock_entry_ref IS NOT NULL)
);
COMMENT ON TABLE mwo_spare IS
  'READ-ONLY MIRROR of Inventory-owned stock movements against this MWO. valued_amount is whatever Inventory returned under its own valuation method. There is no on-hand quantity, no valuation logic and no ledger write anywhere in this module.';
CREATE INDEX ix_spare_mwo  ON mwo_spare (tenant_id, mwo_id);
CREATE INDEX ix_spare_item ON mwo_spare (tenant_id, item_ref, created_at DESC);
CREATE TRIGGER trg_mwo_spare_guard BEFORE UPDATE OR DELETE ON mwo_spare
  FOR EACH ROW EXECUTE FUNCTION mnt_guard_mwo_child();
REVOKE DELETE ON mwo_spare FROM app_user;

CREATE TABLE mwo_external_cost (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  mwo_id         uuid NOT NULL REFERENCES maintenance_work_order (id),
  vendor_ref     uuid,
  source_module  text NOT NULL CHECK (source_module IN ('expenditure','purchase')),
  source_doc_ref text NOT NULL,
  amount         numeric(18,2) NOT NULL,
  description    text,
  recognised_at  timestamptz NOT NULL,
  event_id       uuid NOT NULL,
  -- Redelivery of the same event is a no-op, which is what makes at-least-once safe.
  CONSTRAINT uq_extcost_event UNIQUE (tenant_id, event_id)
);
COMMENT ON TABLE mwo_external_cost IS
  'Vendor actuals MIRRORED from Expenditure/Purchase. Maintenance raises demand and attributes cost; it never books a vendor bill and no maintenance role can create a payable (SoD, §14.3).';
CREATE INDEX ix_extcost_mwo ON mwo_external_cost (tenant_id, mwo_id);
REVOKE UPDATE, DELETE ON mwo_external_cost FROM app_user;
CREATE TRIGGER trg_extcost_append_only
  BEFORE UPDATE OR DELETE ON mwo_external_cost
  FOR EACH ROW EXECUTE FUNCTION mnt_forbid_mutation();

-- =============================================================================
-- Downtime -- the overlap-free clock
-- =============================================================================

CREATE TABLE asset_downtime (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  asset_id             uuid NOT NULL REFERENCES maintenance_asset (id),
  started_at           timestamptz NOT NULL,
  ended_at             timestamptz,
  downtime_kind        text NOT NULL DEFAULT 'unplanned' CHECK (downtime_kind IN ('unplanned','planned')),
  production_impacting boolean NOT NULL DEFAULT true,
  reason_code          text,
  source               text NOT NULL CHECK (source IN ('request','mwo','pm_window','manual')),
  request_id           uuid REFERENCES maintenance_request (id),
  mwo_id               uuid REFERENCES maintenance_work_order (id),
  pm_occurrence_id     uuid,                    -- FK added after pm_occurrence
  recorded_by          uuid NOT NULL,
  corrected            boolean NOT NULL DEFAULT false,
  correction_reason    text,
  original_started_at  timestamptz,
  original_ended_at    timestamptz,
  disputed             boolean NOT NULL DEFAULT false,
  dispute_note         text,
  duration_minutes     integer GENERATED ALWAYS AS
                         (CASE WHEN ended_at IS NULL THEN NULL
                               ELSE (EXTRACT(epoch FROM (ended_at - started_at)) / 60)::int END) STORED,
  superseded_by        uuid REFERENCES asset_downtime (id),
  idempotency_key      text NOT NULL,
  CONSTRAINT ck_dt_window CHECK (ended_at IS NULL OR ended_at > started_at),
  CONSTRAINT uq_downtime_idem UNIQUE (tenant_id, idempotency_key)
);
-- NFR-04: one asset can NEVER hold two overlapping downtime intervals. tstzrange's upper
-- bound is exclusive, so an interval ending at 13:02:04 and the next starting at exactly
-- 13:02:04 is legal; 13:02:03 is not. That one-second boundary is the difference between a
-- correct clock and a plausible one.
ALTER TABLE asset_downtime ADD CONSTRAINT ex_downtime_no_overlap
  EXCLUDE USING gist (
    tenant_id WITH =, asset_id WITH =,
    tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz)) WITH &&
  );
COMMENT ON TABLE asset_downtime IS
  'Published to Production (OEE availability) and Planning (capacity) as maintenance.asset.downtime.started/ended.v1. A CORRECTION re-emits with corrected=true so downstream recomputes, rather than diverging silently.';
CREATE INDEX ix_downtime_open ON asset_downtime (tenant_id, asset_id) WHERE ended_at IS NULL;
CREATE INDEX ix_downtime_win  ON asset_downtime (tenant_id, asset_id, started_at DESC);
CREATE INDEX ix_downtime_kpi  ON asset_downtime (tenant_id, started_at, downtime_kind, production_impacting);
CREATE TRIGGER trg_downtime_guard BEFORE UPDATE OR DELETE ON asset_downtime
  FOR EACH ROW EXECUTE FUNCTION mnt_guard_downtime();
REVOKE DELETE ON asset_downtime FROM app_user;

ALTER TABLE maintenance_request
  ADD CONSTRAINT fk_request_downtime FOREIGN KEY (downtime_id) REFERENCES asset_downtime (id);

-- =============================================================================
-- PM schedules & occurrences
-- =============================================================================

CREATE TABLE pm_schedule (
  id                        uuid PRIMARY KEY,
  tenant_id                 uuid NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid NOT NULL,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid NOT NULL,
  is_active                 boolean NOT NULL DEFAULT true,
  pms_code                  text NOT NULL,
  name                      text NOT NULL,
  asset_id                  uuid REFERENCES maintenance_asset (id),
  asset_class_filter        jsonb,
  pm_type                   text NOT NULL CHECK (pm_type IN ('calendar','meter','hybrid','statutory')),
  interval_value            integer CHECK (interval_value IS NULL OR interval_value > 0),
  interval_unit             text CHECK (interval_unit IN ('day','week','month','quarter','year')),
  anchor_date               date,
  drift_policy              text CHECK (drift_policy IN ('fixed','floating')),
  meter_type                text CHECK (meter_type IN ('run_hours','cycles','strokes','km','kwh')),
  interval_meter_value      numeric(18,4) CHECK (interval_meter_value IS NULL OR interval_meter_value > 0),
  last_generated_meter      numeric(18,4),
  generate_on_forecast      boolean NOT NULL DEFAULT true,
  lead_days                 smallint NOT NULL DEFAULT 7 CHECK (lead_days >= 0),
  grace_days                smallint NOT NULL DEFAULT 3 CHECK (grace_days >= 0),
  max_open_occurrences      smallint NOT NULL DEFAULT 1 CHECK (max_open_occurrences >= 1),
  est_duration_min          integer,
  trade                     text,
  statutory_ref             text,
  requires_competent_person boolean NOT NULL DEFAULT false,
  template_version          integer NOT NULL DEFAULT 1,
  owner_ref                 uuid,
  status                    text NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','active','paused','superseded','retired')),
  pause_reason              text,
  paused_until              date,
  valid_from                date NOT NULL,
  valid_to                  date,
  workflow_instance_id      uuid,
  CONSTRAINT uq_pms_code UNIQUE (tenant_id, pms_code),
  -- Each schedule type must carry the data its generator needs, or it is not a schedule.
  CONSTRAINT ck_pms_rules CHECK (
     (pm_type IN ('calendar','statutory') AND interval_value IS NOT NULL
       AND interval_unit IS NOT NULL AND drift_policy IS NOT NULL AND anchor_date IS NOT NULL)
  OR (pm_type = 'meter'  AND meter_type IS NOT NULL AND interval_meter_value IS NOT NULL)
  OR (pm_type = 'hybrid' AND interval_value IS NOT NULL AND meter_type IS NOT NULL
       AND drift_policy IS NOT NULL AND anchor_date IS NOT NULL)),
  -- FR-MNT-058: a statutory examination stays on the calendar. Always. This is the
  -- Factories Act's six/twelve-monthly obligation expressed as a constraint.
  CONSTRAINT ck_statutory_fixed CHECK (pm_type <> 'statutory' OR drift_policy = 'fixed'),
  CONSTRAINT ck_pms_pause CHECK (status <> 'paused' OR pause_reason IS NOT NULL)
);
CREATE INDEX ix_pms_due ON pm_schedule (tenant_id, status, pm_type) WHERE status = 'active';
REVOKE DELETE ON pm_schedule FROM app_user;

CREATE TABLE pm_task_template (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  pm_schedule_id uuid NOT NULL REFERENCES pm_schedule (id),
  version        integer NOT NULL,
  sequence       smallint NOT NULL,
  instruction    text NOT NULL,
  safety_note    text,
  result_type    text NOT NULL DEFAULT 'ok_not_ok'
                 CHECK (result_type IN ('ok_not_ok','numeric','text','photo')),
  expected_min   numeric(18,4),
  expected_max   numeric(18,4),
  uom            text,
  is_mandatory   boolean NOT NULL DEFAULT true,
  CONSTRAINT uq_pm_task UNIQUE (tenant_id, pm_schedule_id, version, sequence)
);
COMMENT ON TABLE pm_task_template IS
  'VERSIONED. An in-flight MWO keeps the template version it was instantiated from, so revising a checklist never rewrites a job already on the floor (FR-MNT-056).';
REVOKE DELETE ON pm_task_template FROM app_user;

CREATE TABLE pm_default_spare (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  pm_schedule_id uuid NOT NULL REFERENCES pm_schedule (id),
  item_ref       uuid NOT NULL,
  uom            text NOT NULL,
  qty            numeric(18,4) NOT NULL CHECK (qty > 0),
  reserve_ahead  boolean NOT NULL DEFAULT true,
  CONSTRAINT uq_pm_spare UNIQUE (tenant_id, pm_schedule_id, item_ref)
);
REVOKE DELETE ON pm_default_spare FROM app_user;

CREATE TABLE pm_occurrence (
  id                     uuid PRIMARY KEY,
  tenant_id              uuid NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid NOT NULL,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             uuid NOT NULL,
  is_active              boolean NOT NULL DEFAULT true,
  pm_schedule_id         uuid NOT NULL REFERENCES pm_schedule (id),
  asset_id               uuid NOT NULL REFERENCES maintenance_asset (id),
  occurrence_seq         integer NOT NULL,
  due_date               date,
  due_meter_value        numeric(18,4),
  due_basis              text CHECK (due_basis IN ('calendar','meter','forecast')),
  generated_at           timestamptz,
  mwo_id                 uuid REFERENCES maintenance_work_order (id),
  status                 text NOT NULL DEFAULT 'scheduled' CHECK (status IN
                           ('scheduled','generated','in_progress','completed','skipped','missed')),
  completed_at           timestamptz,
  completed_within_grace boolean,
  grace_days_snapshot    smallint,
  skip_reason            text,
  spares_reserved        boolean NOT NULL DEFAULT false,
  spares_note            text,
  competent_person_ref   uuid,
  -- NFR-05: generation is idempotent under retries, redeploys and manual re-runs.
  CONSTRAINT uq_pm_occ UNIQUE (tenant_id, pm_schedule_id, occurrence_seq),
  CONSTRAINT ck_occ_skip CHECK (status <> 'skipped' OR skip_reason IS NOT NULL)
);
CREATE INDEX ix_pm_occ_due ON pm_occurrence (tenant_id, status, due_date)
  WHERE status IN ('scheduled','generated','in_progress');
CREATE INDEX ix_pm_occ_asset ON pm_occurrence (tenant_id, asset_id, due_date DESC);
REVOKE DELETE ON pm_occurrence FROM app_user;

ALTER TABLE maintenance_work_order
  ADD CONSTRAINT fk_mwo_occ FOREIGN KEY (pm_occurrence_id) REFERENCES pm_occurrence (id);
ALTER TABLE asset_downtime
  ADD CONSTRAINT fk_dt_occ FOREIGN KEY (pm_occurrence_id) REFERENCES pm_occurrence (id);

-- =============================================================================
-- AMC coverage mirror & KPI snapshots
-- =============================================================================

CREATE TABLE amc_contract (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid NOT NULL,
  is_active          boolean NOT NULL DEFAULT true,
  contract_ref       text NOT NULL,
  vendor_ref         uuid NOT NULL,
  vendor_name_cache  text,
  coverage_type      text NOT NULL CHECK (coverage_type IN ('comprehensive','labour_only','preventive_only')),
  valid_from         date NOT NULL,
  valid_to           date NOT NULL,
  response_sla_hours integer,
  visits_contracted  smallint,
  visits_used        smallint NOT NULL DEFAULT 0,
  contract_value     numeric(18,2),
  CONSTRAINT uq_amc_ref   UNIQUE (tenant_id, contract_ref),
  CONSTRAINT ck_amc_window CHECK (valid_to >= valid_from)
);
COMMENT ON TABLE amc_contract IS
  'READ-ONLY coverage mirror for decision support. The vendor master, the contract lifecycle, GST/TDS and the spend all belong to Purchase/Expenditure; Maintenance consumes the reference and raises demand.';
REVOKE DELETE ON amc_contract FROM app_user;

CREATE TABLE amc_contract_asset (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  amc_contract_id uuid NOT NULL REFERENCES amc_contract (id),
  asset_id        uuid NOT NULL REFERENCES maintenance_asset (id),
  CONSTRAINT uq_amc_asset UNIQUE (tenant_id, amc_contract_id, asset_id)
);
REVOKE DELETE ON amc_contract_asset FROM app_user;

ALTER TABLE maintenance_work_order
  ADD CONSTRAINT fk_mwo_amc FOREIGN KEY (amc_contract_id) REFERENCES amc_contract (id);

CREATE TABLE maintenance_kpi_snapshot (
  id                       uuid PRIMARY KEY,
  tenant_id                uuid NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid NOT NULL,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid NOT NULL,
  is_active                boolean NOT NULL DEFAULT true,
  scope_type               text NOT NULL CHECK (scope_type IN ('asset','area','plant','criticality','tenant')),
  scope_ref                uuid,
  period_start             date NOT NULL,
  period_end               date NOT NULL,
  scheduled_hours          numeric(18,3),
  downtime_unplanned_hours numeric(18,3) NOT NULL DEFAULT 0,
  downtime_planned_hours   numeric(18,3) NOT NULL DEFAULT 0,
  failure_count            integer NOT NULL DEFAULT 0,
  mtbf_hours               numeric(18,3),
  mttr_hours               numeric(18,3),
  availability_pct         numeric(7,4),
  pm_due_count             integer NOT NULL DEFAULT 0,
  pm_completed_in_grace    integer NOT NULL DEFAULT 0,
  pm_compliance_pct        numeric(7,4),
  schedule_adherence_pct   numeric(7,4),
  cost_labour              numeric(18,2) NOT NULL DEFAULT 0,
  cost_spares              numeric(18,2) NOT NULL DEFAULT 0,
  cost_external            numeric(18,2) NOT NULL DEFAULT 0,
  computed_at              timestamptz NOT NULL DEFAULT now(),
  stale_since_correction   boolean NOT NULL DEFAULT false,
  inputs_digest            text NOT NULL,
  -- A zero-failure window carries NULL MTBF -- not 0, not infinity. The tile says
  -- "no failures in window" rather than printing a fabricated number (V-KPI-01).
  CONSTRAINT ck_kpi_no_failures CHECK (failure_count > 0 OR (mtbf_hours IS NULL AND mttr_hours IS NULL))
);
CREATE UNIQUE INDEX uq_kpi_snap ON maintenance_kpi_snapshot
  (tenant_id, scope_type, coalesce(scope_ref,'00000000-0000-0000-0000-000000000000'::uuid),
   period_start, period_end);
CREATE INDEX ix_kpi_scope ON maintenance_kpi_snapshot (tenant_id, scope_type, period_start);
COMMENT ON COLUMN maintenance_kpi_snapshot.inputs_digest IS
  'sha256 over the sorted set of input row ids. Recomputing the same window over the same rows must reproduce byte-identical values (TC-16-06).';

-- =============================================================================
-- FORCE RLS on every tenant-scoped table in this migration.
-- Written as a loop rather than 23 copies of the same five statements; the policy it
-- creates is character-for-character the one earlier modules spell out longhand, and
-- `pnpm --filter @ind-core/db rls-check` asserts the RESULT independently of how it was
-- written -- a new table without a policy still fails CI.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'maintenance_asset','maintenance_asset_history','asset_meter','asset_meter_reading',
    'failure_code','downtime_reason_code','criticality_sla_matrix','maintenance_labour_rate',
    'maintenance_technician','maintenance_request','maintenance_work_order','mwo_task',
    'mwo_labour','mwo_spare','mwo_external_cost','asset_downtime','pm_schedule',
    'pm_task_template','pm_default_spare','pm_occurrence','amc_contract','amc_contract_asset',
    'maintenance_kpi_snapshot']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)', t);
  END LOOP;
END $$;
