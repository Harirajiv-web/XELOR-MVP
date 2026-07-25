-- =============================================================================
-- 0024_hrm — HRM & ATTENDANCE (Module 09): the people-and-pay backbone.
--
-- One pipeline, fixed as a single auditable flow (HRM §1):
--   punch -> attendance day -> payable days/OT -> DEEMED WAGES -> payroll -> payslip -> GL
--
-- Four structural guarantees are made HERE, in the database, not in the service layer:
--
--  (1) STATUTORY RATES CANNOT BE EDITED. The stat_* tables are platform-global and
--      effective-dated, and UPDATE/DELETE are revoked from app_user. A rate change is an
--      INSERT with a new effective_from. That is what lets a Jun-2026 payslip recompute
--      against Jun-2026's rates forever, and what makes "no statutory number in code" real.
--
--  (2) THE s.2(y) IDENTITY IS A CHECK CONSTRAINT. deemed = included + addback and
--      excluded = total - included are asserted by the database on every payslip row, so
--      even a code bug cannot persist a wrong PF wage base.
--
--  (3) SEGREGATION OF DUTIES IS A CHECK CONSTRAINT. approved_by <> prepared_by, backing
--      the service guard (NFR-09) rather than trusting it.
--
--  (4) RAW PUNCHES AND PII ACCESS LOGS ARE APPEND-ONLY, at the grant AND at a trigger --
--      the same two-layer discipline the stock ledger and the journal use. A locked
--      attendance month and an approved run's payslips are frozen by trigger too.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Shared guard functions
-- ---------------------------------------------------------------------------

-- Blanket append-only refusal, for tables where nothing may ever change.
CREATE OR REPLACE FUNCTION hrm_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only: % on % is not permitted', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

-- A locked attendance month is frozen. The ONLY permitted change to a locked day is the
-- explicit, audited unlock -- and that transition may not smuggle a data edit alongside it.
CREATE OR REPLACE FUNCTION hrm_guard_locked_attendance() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.locked THEN
      RAISE EXCEPTION 'attendance for employee % on % is locked for payroll', OLD.employee_id, OLD.att_date
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.locked THEN
    IF NEW.locked = false
       AND (NEW.status, NEW.worked_hours, NEW.ot_hours, NEW.payable_units, NEW.lop_units,
            NEW.first_in, NEW.last_out)
           IS NOT DISTINCT FROM
           (OLD.status, OLD.worked_hours, OLD.ot_hours, OLD.payable_units, OLD.lop_units,
            OLD.first_in, OLD.last_out)
    THEN
      RETURN NEW; -- a clean unlock, changing nothing else
    END IF;
    RAISE EXCEPTION
      'attendance for employee % on % is locked for payroll; unlock explicitly before editing',
      OLD.employee_id, OLD.att_date
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Once a run is approved, its payslips are a record of what was paid. Recompute is legal
-- up to that point and impossible after it; a correction is a fresh adjustment run.
CREATE OR REPLACE FUNCTION hrm_guard_payslip() RETURNS trigger AS $$
DECLARE st text; rid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN rid := OLD.payroll_run_id; ELSE rid := NEW.payroll_run_id; END IF;
  SELECT status INTO st FROM payroll_run WHERE id = rid;
  IF st IN ('approved','paid','posted','closed') THEN
    RAISE EXCEPTION 'payslips of an approved payroll run are immutable (run status %)', st
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION hrm_guard_payslip_child() RETURNS trigger AS $$
DECLARE st text; pid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN pid := OLD.payslip_id; ELSE pid := NEW.payslip_id; END IF;
  SELECT r.status INTO st
    FROM payslip p JOIN payroll_run r ON r.id = p.payroll_run_id
   WHERE p.id = pid;
  IF st IN ('approved','paid','posted','closed') THEN
    RAISE EXCEPTION 'payslip detail of an approved payroll run is immutable (run status %)', st
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

-- The identity of an approved run -- its period, its preparer, the inputs it computed on --
-- can never be rewritten. Only the state machine's own forward columns may move.
CREATE OR REPLACE FUNCTION hrm_guard_payroll_run() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('approved','paid','posted','closed') THEN
    IF (NEW.period_month, NEW.pay_group, NEW.prepared_by, NEW.inputs_hash,
        NEW.total_gross, NEW.total_deduction, NEW.total_net, NEW.period_working_days)
       IS DISTINCT FROM
       (OLD.period_month, OLD.pay_group, OLD.prepared_by, OLD.inputs_hash,
        OLD.total_gross, OLD.total_deduction, OLD.total_net, OLD.period_working_days)
    THEN
      RAISE EXCEPTION 'payroll run % is %; its period, preparer, inputs and totals are immutable',
        OLD.run_no, OLD.status
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- (1) STATUTORY CONFIGURATION -- platform-global, effective-dated, APPEND-ONLY
--
-- Deliberately NOT tenant-scoped: the Code on Wages does not vary by customer. Optional
-- per-tenant choice, where the law permits one, lives on the employee row instead
-- (epf_ceiling_policy, pt_state, pt_municipality).
-- =============================================================================

CREATE TABLE stat_wage_definition (
  id                    uuid PRIMARY KEY,
  effective_from        date NOT NULL,
  effective_to          date,
  source_note           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL,
  addback_threshold_pct numeric(5,2) NOT NULL CHECK (addback_threshold_pct > 0 AND addback_threshold_pct < 100)
);

CREATE TABLE stat_epf_config (
  id             uuid PRIMARY KEY,
  effective_from date NOT NULL,
  effective_to   date,
  source_note    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  wage_ceiling   numeric(12,2) NOT NULL,
  employee_pct   numeric(5,2) NOT NULL,
  eps_pct        numeric(5,2) NOT NULL,
  admin_pct      numeric(5,2) NOT NULL,
  edli_pct       numeric(5,2) NOT NULL
);

CREATE TABLE stat_esi_config (
  id              uuid PRIMARY KEY,
  effective_from  date NOT NULL,
  effective_to    date,
  source_note     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  gross_threshold numeric(12,2) NOT NULL,
  employee_pct    numeric(5,2) NOT NULL,
  employer_pct    numeric(5,2) NOT NULL,
  round_up        boolean NOT NULL DEFAULT true
);

CREATE TABLE stat_pt_slab (
  id                uuid PRIMARY KEY,
  effective_from    date NOT NULL,
  effective_to      date,
  source_note       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  state             text NOT NULL,
  period_basis      text NOT NULL CHECK (period_basis IN ('monthly','half_yearly')),
  municipality      text,
  slab_from         numeric(12,2) NOT NULL,
  slab_to           numeric(12,2),
  amount            numeric(12,2) NOT NULL,
  amount_february   numeric(12,2),
  annual_cap        numeric(12,2) NOT NULL,
  women_exempt_upto numeric(12,2),
  CONSTRAINT ck_ptslab_range CHECK (slab_to IS NULL OR slab_to >= slab_from)
);
CREATE INDEX ix_ptslab_state ON stat_pt_slab (state, effective_from);

CREATE TABLE stat_tds_config (
  id                      uuid PRIMARY KEY,
  effective_from          date NOT NULL,
  effective_to            date,
  source_note             text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid NOT NULL,
  fy                      text NOT NULL,
  regime                  text NOT NULL,
  standard_deduction      numeric(12,2) NOT NULL,
  rebate_87a_amount       numeric(12,2) NOT NULL,
  rebate_87a_income_limit numeric(14,2) NOT NULL,
  cess_pct                numeric(5,2) NOT NULL,
  act_reference           text NOT NULL
);

CREATE TABLE stat_tds_slab (
  id             uuid PRIMARY KEY,
  effective_from date NOT NULL,
  effective_to   date,
  source_note    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  fy             text NOT NULL,
  regime         text NOT NULL,
  slab_from      numeric(14,2) NOT NULL,
  slab_to        numeric(14,2),
  rate_pct       numeric(5,2) NOT NULL
);
CREATE INDEX ix_tdsslab_fy ON stat_tds_slab (fy, regime, slab_from);

CREATE TABLE stat_gratuity_config (
  id                       uuid PRIMARY KEY,
  effective_from           date NOT NULL,
  effective_to             date,
  source_note              text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid NOT NULL,
  factor_num               integer NOT NULL,
  factor_den               integer NOT NULL,
  vesting_years_default    integer NOT NULL,
  vesting_years_fixed_term integer NOT NULL,
  tax_exempt_cap           numeric(14,2) NOT NULL,
  wage_base                text NOT NULL CHECK (wage_base = 'deemed_wages')
);

CREATE TABLE stat_ot_config (
  id                     uuid PRIMARY KEY,
  effective_from         date NOT NULL,
  effective_to           date,
  source_note            text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid NOT NULL,
  multiplier             numeric(5,2) NOT NULL,
  rate_basis             text NOT NULL,
  daily_hours_cap        numeric(5,2) NOT NULL,
  weekly_hours_cap       numeric(5,2) NOT NULL,
  quarterly_ot_cap_hours numeric(6,2) NOT NULL
);

-- A statutory rate can be SUPERSEDED, never edited or erased. Two layers, as everywhere
-- else in this codebase: the grant stops the app, the trigger stops everyone.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stat_wage_definition','stat_epf_config','stat_esi_config',
                           'stat_pt_slab','stat_tds_config','stat_tds_slab',
                           'stat_gratuity_config','stat_ot_config']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT ON %I TO app_user', t);
    EXECUTE format('REVOKE UPDATE, DELETE ON %I FROM app_user', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_append_only BEFORE UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION hrm_forbid_mutation()', t, t);
  END LOOP;
END $$;

-- =============================================================================
-- Employee master
-- =============================================================================

CREATE TABLE employee (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  emp_code             text NOT NULL,
  first_name           text NOT NULL,
  last_name            text,
  gender               text CHECK (gender IS NULL OR gender IN ('male','female','other')),
  employment_type      text NOT NULL CHECK (employment_type IN
                         ('permanent','probation','trainee','fixed_term','contract','apprentice')),
  fixed_term_end_date  date,
  date_of_joining      date NOT NULL,
  probation_end_date   date,
  status               text NOT NULL DEFAULT 'active' CHECK (status IN
                         ('draft','active','probation','confirmed','notice','relieved')),
  -- Encrypted envelopes (AES-256-GCM with tenant+field bound in as AAD). Never plaintext.
  pan_enc              text,
  aadhaar_enc          text,
  bank_account_enc     text,
  bank_ifsc            text,
  uan                  text,
  esic_number          text,
  pt_state             text NOT NULL,
  pt_municipality      text,
  epf_ceiling_policy   text NOT NULL DEFAULT 'capped_at_15000'
                         CHECK (epf_ceiling_policy IN ('capped_at_15000','actual')),
  location_ref         uuid,
  department           text,
  designation          text,
  cost_centre          text,
  default_shift_id     uuid,
  reporting_manager_id uuid,
  pii_legal_basis      text NOT NULL DEFAULT 'legitimate_use_employment',
  pii_notice_version   text,
  CONSTRAINT uq_employee_tenant_code UNIQUE (tenant_id, emp_code),
  -- A fixed-term employee without an end date has no computable vesting horizon.
  CONSTRAINT ck_employee_fixed_term CHECK
    (employment_type <> 'fixed_term' OR fixed_term_end_date IS NOT NULL)
);
CREATE INDEX ix_employee_tenant_status ON employee (tenant_id, status);
CREATE INDEX ix_employee_tenant_location ON employee (tenant_id, location_ref);
REVOKE DELETE ON employee FROM app_user;

CREATE TABLE employee_job_history (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  employee_id    uuid NOT NULL REFERENCES employee (id) ON DELETE RESTRICT,
  effective_from date NOT NULL,
  change_type    text NOT NULL CHECK (change_type IN ('hire','promotion','transfer','comp','exit')),
  department     text,
  designation    text,
  cost_centre    text,
  monthly_gross  numeric(12,2),
  note           text
);
CREATE INDEX ix_jobhistory_tenant_emp ON employee_job_history (tenant_id, employee_id, effective_from);
REVOKE DELETE ON employee_job_history FROM app_user;

CREATE TABLE pii_access_log (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  employee_id uuid NOT NULL REFERENCES employee (id) ON DELETE RESTRICT,
  field       text NOT NULL,
  viewed_by   uuid NOT NULL,
  viewed_at   timestamptz NOT NULL DEFAULT now(),
  reason      text NOT NULL CHECK (length(btrim(reason)) > 0)
);
CREATE INDEX ix_piiaccess_tenant_emp ON pii_access_log (tenant_id, employee_id, viewed_at);
-- An access log that can be edited is not an access log (DPDP Rule 6).
REVOKE UPDATE, DELETE ON pii_access_log FROM app_user;
CREATE TRIGGER trg_piiaccess_append_only BEFORE UPDATE OR DELETE ON pii_access_log
  FOR EACH ROW EXECUTE FUNCTION hrm_forbid_mutation();

-- =============================================================================
-- Shifts, roster, punches, attendance
-- =============================================================================

CREATE TABLE shift (
  id                         uuid PRIMARY KEY,
  tenant_id                  uuid NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  created_by                 uuid NOT NULL,
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  updated_by                 uuid NOT NULL,
  is_active                  boolean NOT NULL DEFAULT true,
  code                       text NOT NULL,
  name                       text NOT NULL,
  start_time                 time NOT NULL,
  end_time                   time NOT NULL,
  break_minutes              integer NOT NULL DEFAULT 30 CHECK (break_minutes >= 0),
  grace_minutes              integer NOT NULL DEFAULT 10 CHECK (grace_minutes >= 0),
  is_night                   boolean NOT NULL DEFAULT false,
  ot_after_minutes           integer NOT NULL DEFAULT 480 CHECK (ot_after_minutes > 0),
  half_day_threshold_minutes integer NOT NULL DEFAULT 240 CHECK (half_day_threshold_minutes > 0),
  CONSTRAINT uq_shift_tenant_code UNIQUE (tenant_id, code),
  -- A shift whose end is not after its start MUST be flagged as crossing midnight.
  CONSTRAINT ck_shift_night CHECK (is_night = (end_time <= start_time))
);
REVOKE DELETE ON shift FROM app_user;

CREATE TABLE shift_roster (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  employee_id    uuid NOT NULL REFERENCES employee (id) ON DELETE RESTRICT,
  roster_date    date NOT NULL,
  shift_id       uuid REFERENCES shift (id) ON DELETE RESTRICT,
  entry_type     text NOT NULL DEFAULT 'shift' CHECK (entry_type IN ('shift','weekly_off')),
  status         text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','locked')),
  is_ot_planned  boolean NOT NULL DEFAULT false,
  work_centre_ref uuid,
  -- A B->C same-day double roster is structurally impossible, not merely discouraged.
  CONSTRAINT uq_roster_tenant_emp_date UNIQUE (tenant_id, employee_id, roster_date),
  CONSTRAINT ck_roster_shift_present CHECK ((entry_type = 'shift') = (shift_id IS NOT NULL))
);
CREATE INDEX ix_roster_tenant_date ON shift_roster (tenant_id, roster_date);

CREATE TABLE biometric_punch (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  device_id       text NOT NULL,
  emp_code        text NOT NULL,
  employee_id     uuid REFERENCES employee (id) ON DELETE RESTRICT,
  punch_time      timestamptz NOT NULL,
  direction       text NOT NULL DEFAULT 'auto' CHECK (direction IN ('in','out','auto')),
  source          text NOT NULL DEFAULT 'device'
                    CHECK (source IN ('device','csv','mobile','web','manual')),
  client_punch_id uuid,
  import_batch_id uuid,
  processed       boolean NOT NULL DEFAULT false,
  -- Idempotent ingest: the same finger, the same second, the same device is ONE punch.
  CONSTRAINT uq_punch_tenant_device_emp_time UNIQUE (tenant_id, device_id, emp_code, punch_time)
);
CREATE INDEX ix_punch_tenant_emp_time ON biometric_punch (tenant_id, emp_code, punch_time);
-- The raw store is evidence. A regularisation APPENDS a corrective punch; it never edits
-- what the device recorded. Both layers, as with stock_ledger and journal_line.
REVOKE UPDATE, DELETE ON biometric_punch FROM app_user;
CREATE TRIGGER trg_punch_append_only BEFORE UPDATE OR DELETE ON biometric_punch
  FOR EACH ROW EXECUTE FUNCTION hrm_forbid_mutation();

CREATE TABLE attendance_day (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  employee_id          uuid NOT NULL REFERENCES employee (id) ON DELETE RESTRICT,
  att_date             date NOT NULL,
  shift_id             uuid REFERENCES shift (id) ON DELETE RESTRICT,
  first_in             timestamptz,
  last_out             timestamptz,
  worked_hours         numeric(6,2) NOT NULL DEFAULT 0 CHECK (worked_hours >= 0),
  ot_hours             numeric(6,2) NOT NULL DEFAULT 0 CHECK (ot_hours >= 0),
  late_minutes         integer NOT NULL DEFAULT 0 CHECK (late_minutes >= 0),
  status               text NOT NULL CHECK (status IN
                         ('present','absent','half','leave','holiday','off','od','pending_reg')),
  lop_units            numeric(4,2) NOT NULL DEFAULT 0 CHECK (lop_units BETWEEN 0 AND 1),
  payable_units        numeric(4,2) NOT NULL DEFAULT 0 CHECK (payable_units BETWEEN 0 AND 1),
  exceptions           jsonb NOT NULL DEFAULT '[]'::jsonb,
  leave_application_id uuid,
  work_centre_ref      uuid,
  locked               boolean NOT NULL DEFAULT false,
  CONSTRAINT uq_attendance_tenant_emp_date UNIQUE (tenant_id, employee_id, att_date),
  CONSTRAINT ck_attendance_out_after_in CHECK (last_out IS NULL OR first_in IS NULL OR last_out > first_in)
);
CREATE INDEX ix_attendance_tenant_date ON attendance_day (tenant_id, att_date);
CREATE INDEX ix_attendance_tenant_status ON attendance_day (tenant_id, status);
CREATE TRIGGER trg_attendance_lock_guard BEFORE UPDATE OR DELETE ON attendance_day
  FOR EACH ROW EXECUTE FUNCTION hrm_guard_locked_attendance();

CREATE TABLE regularisation_request (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  employee_id   uuid NOT NULL REFERENCES employee (id) ON DELETE RESTRICT,
  att_date      date NOT NULL,
  requested_in  timestamptz,
  requested_out timestamptz,
  reason        text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','cancelled')),
  approver_id   uuid,
  decided_at    timestamptz,
  CONSTRAINT ck_reg_has_correction CHECK (requested_in IS NOT NULL OR requested_out IS NOT NULL)
);
CREATE INDEX ix_reg_tenant_status ON regularisation_request (tenant_id, status, att_date);

-- =============================================================================
-- Leave
-- =============================================================================

CREATE TABLE leave_type (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  code              text NOT NULL,
  name              text NOT NULL,
  is_paid           boolean NOT NULL DEFAULT true,
  accrual_rule      text NOT NULL DEFAULT 'monthly'
                      CHECK (accrual_rule IN ('monthly','annual','on_join','none')),
  monthly_rate      numeric(5,2) NOT NULL DEFAULT 0,
  annual_quota      numeric(6,2) NOT NULL DEFAULT 0,
  carry_forward_cap numeric(6,2) NOT NULL DEFAULT 0,
  encashable        boolean NOT NULL DEFAULT false,
  allow_negative    boolean NOT NULL DEFAULT false,
  count_holidays    boolean NOT NULL DEFAULT false,
  CONSTRAINT uq_leavetype_tenant_code UNIQUE (tenant_id, code)
);
REVOKE DELETE ON leave_type FROM app_user;

CREATE TABLE leave_application (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  employee_id   uuid NOT NULL REFERENCES employee (id) ON DELETE RESTRICT,
  leave_type_id uuid NOT NULL REFERENCES leave_type (id) ON DELETE RESTRICT,
  from_date     date NOT NULL,
  to_date       date NOT NULL,
  half_day      boolean NOT NULL DEFAULT false,
  days          numeric(5,2) NOT NULL CHECK (days > 0),
  reason        text,
  status        text NOT NULL DEFAULT 'applied'
                  CHECK (status IN ('applied','approved','rejected','cancelled')),
  approver_id   uuid,
  decided_at    timestamptz,
  CONSTRAINT ck_leaveapp_range CHECK (to_date >= from_date)
);
CREATE INDEX ix_leaveapp_tenant_emp ON leave_application (tenant_id, employee_id, from_date);

CREATE TABLE leave_balance (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  employee_id   uuid NOT NULL REFERENCES employee (id) ON DELETE RESTRICT,
  leave_type_id uuid NOT NULL REFERENCES leave_type (id) ON DELETE RESTRICT,
  period_year   text NOT NULL,
  opening       numeric(6,2) NOT NULL DEFAULT 0,
  accrued       numeric(6,2) NOT NULL DEFAULT 0,
  used          numeric(6,2) NOT NULL DEFAULT 0,
  encashed      numeric(6,2) NOT NULL DEFAULT 0,
  CONSTRAINT uq_leavebal_tenant_emp_type_year UNIQUE (tenant_id, employee_id, leave_type_id, period_year)
);

-- =============================================================================
-- Salary structures
-- =============================================================================

CREATE TABLE salary_component (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  code            text NOT NULL,
  name            text NOT NULL,
  component_type  text NOT NULL CHECK (component_type IN ('earning','deduction')),
  calc_type       text NOT NULL DEFAULT 'fixed' CHECK (calc_type IN ('fixed','percentage','formula')),
  is_taxable      boolean NOT NULL DEFAULT true,
  -- EVERY component is classified for the wage definition. There is no 'unclassified'.
  wage_class      text NOT NULL CHECK (wage_class IN ('included','excluded')),
  gl_account_code text,
  sequence        integer NOT NULL DEFAULT 0,
  CONSTRAINT uq_salcomp_tenant_code UNIQUE (tenant_id, code)
);
REVOKE DELETE ON salary_component FROM app_user;

CREATE TABLE salary_structure (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  code           text NOT NULL,
  name           text NOT NULL,
  effective_from date NOT NULL,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','superseded')),
  CONSTRAINT uq_salstruct_tenant_code UNIQUE (tenant_id, code)
);
REVOKE DELETE ON salary_structure FROM app_user;

CREATE TABLE salary_structure_component (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  structure_id uuid NOT NULL REFERENCES salary_structure (id) ON DELETE RESTRICT,
  component_id uuid NOT NULL REFERENCES salary_component (id) ON DELETE RESTRICT,
  value_pct    numeric(6,3),
  value_amount numeric(12,2),
  sequence     integer NOT NULL DEFAULT 0,
  CONSTRAINT uq_salstructcomp UNIQUE (tenant_id, structure_id, component_id),
  CONSTRAINT ck_salstructcomp_value CHECK (num_nonnulls(value_pct, value_amount) = 1)
);
CREATE INDEX ix_salstructcomp_tenant_struct ON salary_structure_component (tenant_id, structure_id);

CREATE TABLE employee_salary_assignment (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  employee_id    uuid NOT NULL REFERENCES employee (id) ON DELETE RESTRICT,
  structure_id   uuid NOT NULL REFERENCES salary_structure (id) ON DELETE RESTRICT,
  monthly_gross  numeric(12,2) NOT NULL CHECK (monthly_gross > 0),
  ctc            numeric(14,2),
  effective_from date NOT NULL,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded')),
  CONSTRAINT uq_salassign_tenant_emp_from UNIQUE (tenant_id, employee_id, effective_from)
);
CREATE INDEX ix_salassign_tenant_emp ON employee_salary_assignment (tenant_id, employee_id);
REVOKE DELETE ON employee_salary_assignment FROM app_user;

-- =============================================================================
-- Payroll
-- =============================================================================

CREATE TABLE payroll_run (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  run_no               text NOT NULL,
  pay_group            text NOT NULL DEFAULT 'MONTHLY',
  period_month         date NOT NULL,
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN
                         ('draft','attendance_locked','computed','under_review',
                          'approved','paid','posted','closed')),
  period_working_days  numeric(5,2) NOT NULL CHECK (period_working_days > 0),
  total_gross          numeric(14,2) NOT NULL DEFAULT 0,
  total_deduction      numeric(14,2) NOT NULL DEFAULT 0,
  total_net            numeric(14,2) NOT NULL DEFAULT 0,
  total_employer_cost  numeric(14,2) NOT NULL DEFAULT 0,
  inputs_hash          text,
  prepared_by          uuid NOT NULL,
  approved_by          uuid,
  approved_at          timestamptz,
  gl_voucher_id        uuid,
  gl_voucher_no        text,
  CONSTRAINT uq_payrollrun_tenant_group_period UNIQUE (tenant_id, pay_group, period_month),
  CONSTRAINT uq_payrollrun_tenant_no UNIQUE (tenant_id, run_no),
  -- (3) SEGREGATION OF DUTIES, as a database constraint. The preparer of a run can never
  -- also be its approver -- not by a service bug, not by a direct SQL statement.
  CONSTRAINT ck_payrollrun_sod CHECK (approved_by IS NULL OR approved_by <> prepared_by),
  CONSTRAINT ck_payrollrun_period_first CHECK (date_trunc('month', period_month) = period_month)
);
CREATE INDEX ix_payrollrun_tenant_status ON payroll_run (tenant_id, status);
REVOKE DELETE ON payroll_run FROM app_user;
CREATE TRIGGER trg_payrollrun_guard BEFORE UPDATE ON payroll_run
  FOR EACH ROW EXECUTE FUNCTION hrm_guard_payroll_run();

CREATE TABLE payslip (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  payroll_run_id        uuid NOT NULL REFERENCES payroll_run (id) ON DELETE RESTRICT,
  employee_id           uuid NOT NULL REFERENCES employee (id) ON DELETE RESTRICT,
  paid_days             numeric(5,2) NOT NULL CHECK (paid_days >= 0),
  lop_days              numeric(5,2) NOT NULL DEFAULT 0 CHECK (lop_days >= 0),
  ot_hours              numeric(6,2) NOT NULL DEFAULT 0 CHECK (ot_hours >= 0),
  gross                 numeric(12,2) NOT NULL CHECK (gross >= 0),
  -- ---- the deemed-wages block (s.2(y)) -------------------------------------------
  total_remuneration    numeric(12,2) NOT NULL,
  included_wages        numeric(12,2) NOT NULL,
  excluded_wages        numeric(12,2) NOT NULL,
  deemed_wages_addback  numeric(12,2) NOT NULL CHECK (deemed_wages_addback >= 0),
  deemed_wages          numeric(12,2) NOT NULL,
  pf_wage_base          numeric(12,2) NOT NULL,
  gratuity_wage_base    numeric(12,2) NOT NULL,
  gratuity_provision    numeric(12,2) NOT NULL DEFAULT 0,
  gratuity_vesting_date date,
  -- --------------------------------------------------------------------------------
  total_deduction       numeric(12,2) NOT NULL CHECK (total_deduction >= 0),
  employer_cost         numeric(12,2) NOT NULL DEFAULT 0,
  net_pay               numeric(12,2) NOT NULL,
  status                text NOT NULL DEFAULT 'computed',
  CONSTRAINT uq_payslip_tenant_run_emp UNIQUE (tenant_id, payroll_run_id, employee_id),
  -- (2) THE s.2(y) IDENTITY, ENFORCED BY THE DATABASE. A wrong PF wage base cannot be
  -- persisted even by a code path that has not been written yet.
  CONSTRAINT ck_payslip_dw_split CHECK (excluded_wages = total_remuneration - included_wages),
  CONSTRAINT ck_payslip_dw_addback CHECK (deemed_wages = included_wages + deemed_wages_addback),
  CONSTRAINT ck_payslip_pf_base CHECK (pf_wage_base <= deemed_wages),
  CONSTRAINT ck_payslip_gratuity_base CHECK (gratuity_wage_base = deemed_wages),
  CONSTRAINT ck_payslip_net CHECK (net_pay = gross - total_deduction),
  CONSTRAINT ck_payslip_gross CHECK (gross = total_remuneration)
);
CREATE INDEX ix_payslip_tenant_emp ON payslip (tenant_id, employee_id);
CREATE TRIGGER trg_payslip_guard BEFORE UPDATE OR DELETE ON payslip
  FOR EACH ROW EXECUTE FUNCTION hrm_guard_payslip();

CREATE TABLE payslip_line (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  payslip_id          uuid NOT NULL REFERENCES payslip (id) ON DELETE CASCADE,
  component_code      text NOT NULL,
  component_name      text NOT NULL,
  line_type           text NOT NULL CHECK (line_type IN ('earning','deduction')),
  amount              numeric(12,2) NOT NULL,
  base_for_calc       numeric(12,2),
  -- Frozen at compute time, so the trace survives a later config or structure change.
  formula_snapshot    text,
  wage_class_snapshot text,
  sequence            integer NOT NULL DEFAULT 0
);
CREATE INDEX ix_payslipline_tenant_payslip ON payslip_line (tenant_id, payslip_id, sequence);
CREATE TRIGGER trg_payslipline_guard BEFORE UPDATE OR DELETE ON payslip_line
  FOR EACH ROW EXECUTE FUNCTION hrm_guard_payslip_child();

CREATE TABLE statutory_contribution (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  payslip_id      uuid NOT NULL REFERENCES payslip (id) ON DELETE CASCADE,
  statute         text NOT NULL CHECK (statute IN ('epf','esi','pt','tds')),
  employee_amount numeric(12,2) NOT NULL DEFAULT 0,
  employer_amount numeric(12,2) NOT NULL DEFAULT 0,
  wage_base       numeric(12,2) NOT NULL DEFAULT 0,
  -- Which effective-dated config row produced this rupee. Not optional.
  config_ref      text NOT NULL,
  detail          jsonb,
  note            text,
  CONSTRAINT uq_statcontrib_tenant_payslip_statute UNIQUE (tenant_id, payslip_id, statute)
);
CREATE INDEX ix_statcontrib_tenant_statute ON statutory_contribution (tenant_id, statute);
CREATE TRIGGER trg_statcontrib_guard BEFORE UPDATE OR DELETE ON statutory_contribution
  FOR EACH ROW EXECUTE FUNCTION hrm_guard_payslip_child();

-- =============================================================================
-- FORCE RLS on every tenant-scoped table in this migration.
--
-- Written as a loop rather than 19 copies of the same five statements. The policy it
-- creates is character-for-character the one the earlier modules spell out longhand, and
-- `pnpm --filter @ind-core/db rls-check` asserts the result independently of how it was
-- written -- a new table without a policy still fails CI.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'employee','employee_job_history','pii_access_log','shift','shift_roster',
    'biometric_punch','attendance_day','regularisation_request',
    'leave_type','leave_application','leave_balance',
    'salary_component','salary_structure','salary_structure_component',
    'employee_salary_assignment','payroll_run','payslip','payslip_line',
    'statutory_contribution']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)', t);
  END LOOP;
END $$;
