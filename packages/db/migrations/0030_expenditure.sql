-- =============================================================================
-- 0030_expenditure — EXPENDITURE (Module 12): budgetary control, claims, indirect
-- spend, TDS and input tax credit.
--
-- PURCHASE buys things that arrive in a warehouse. This module handles everything else the
-- factory spends money on — the hotel bill, the housekeeping AMC, the electricity, the
-- auditor's fee, the rent — and it is where three questions get decided that nobody can
-- answer from a journal: is there budget, is the GST recoverable, and how much must be
-- withheld from the supplier.
--
-- SEVEN guarantees are made HERE, in the database:
--
--  (1) THE RESERVATION LEDGER IS APPEND-ONLY. `budget_consumption` has UPDATE and DELETE
--      revoked AND a trigger. Availability is `budget − actual − committed − in_approval`
--      read from it under a row lock; a rejection is a signed negative row, never an edit.
--      A ledger that can be edited is a ledger that cannot answer "why was this allowed?"
--      six months later, which is the only question anybody ever asks of it.
--
--  (2) A RETRY CANNOT RESERVE THE SAME MONEY TWICE. UNIQUE (tenant, idempotency_key) on
--      the consumption ledger. A submit that times out and is retried produces one
--      reservation, and the second attempt collides rather than quietly doubling the
--      commitment against a cost centre.
--
--  (3) A BUDGET'S OWN CELLS MUST ADD UP. A CHECK asserts twelve monthly cells summing to
--      the annual figure. A budget that disagrees with itself cannot be reconciled against
--      anything, and the disagreement is invisible until year end.
--
--  (4) NET REIMBURSABLE IS GENERATED AND CANNOT GO NEGATIVE. When an advance exceeds the
--      claim the difference is a refund receivable from the employee — a separate thing
--      from a negative payment that silently becomes a payroll deduction nobody agreed to.
--
--  (5) THE STATUTORY RATE BOOKS ARE APPEND-ONLY. `tds_config`, `per_diem_rate` and
--      `fx_rate` are effective-dated and trigger-blocked against UPDATE and DELETE — the
--      same discipline as HRM's statutory tables, for the same reason: a July deduction
--      must still be reproducible in a 2029 assessment.
--
--  (6) A POSTING CANNOT BE DELIVERED TWICE. UNIQUE (tenant, idempotency_key) on
--      `posting_instruction`. Expenditure never writes a GL row; it writes exactly one
--      instruction per document version and Accounts posts it.
--
--  (7) TDS IS WITHHELD ON THE TAXABLE VALUE, AND THE ROW SAYS WHICH CONFIG DECIDED IT.
--      `tds_config_ref` is NOT NULL whenever `tds_amount` is non-zero, so no deduction can
--      exist without the effective-dated row that produced it.
--
-- Note what is deliberately NOT unique: `exp_attachment.sha256`. The same image on two
-- claims must be DETECTED and flagged with both documents named, not refused at upload —
-- refusing hides the second claim instead of surfacing it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Guard functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION exp_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only: % on % is not permitted', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

-- An effective-dated rate is history the moment a document uses it. A change is a NEW row
-- with a new effective_from; closing an old row by setting effective_to is the one edit
-- permitted, and it is permitted precisely because it does not restate anything.
CREATE OR REPLACE FUNCTION exp_guard_rate_book() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'the % rate book is append-only; supersede the row with a new effective_from', TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - 'effective_to' - 'updated_at' - 'updated_by' - 'is_active')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'effective_to' - 'updated_at' - 'updated_by' - 'is_active') THEN
    RAISE EXCEPTION 'a rate row may only be closed (effective_to) — a change is a new row'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Sum a jsonb array of numbers. IMMUTABLE, so it can be used in a CHECK constraint —
-- Postgres forbids a subquery there, and the twelve-cells-add-up guarantee is worth a
-- function rather than a trigger that runs after the fact.
CREATE OR REPLACE FUNCTION exp_jsonb_num_sum(arr jsonb) RETURNS numeric AS $$
  SELECT coalesce(sum(v::numeric), 0) FROM jsonb_array_elements_text(arr) AS v;
$$ LANGUAGE sql IMMUTABLE STRICT;

-- A claim that has been approved is evidence behind a posted journal.
CREATE OR REPLACE FUNCTION exp_guard_claim() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'expense claims are never deleted (%); cancel with a reason instead', OLD.claim_no
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status IN ('posted','paid','cancelled') AND NEW.status = OLD.status
     AND (NEW.total_claimed, NEW.advance_adjusted) IS DISTINCT FROM (OLD.total_claimed, OLD.advance_adjusted) THEN
    RAISE EXCEPTION 'claim % is % — its amounts are frozen', OLD.claim_no, OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Masters & configuration
-- =============================================================================

CREATE TABLE expense_head (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  code                text NOT NULL,
  name                text NOT NULL,
  gl_account_ref      uuid,
  capex_flag          boolean NOT NULL DEFAULT false,
  gst_rate            numeric(5,2),
  itc_eligibility     text NOT NULL DEFAULT 'eligible'
                        CHECK (itc_eligibility IN ('eligible','blocked_17_5_food','blocked_17_5_motor_vehicle',
                                                   'blocked_17_5_personal','blocked_17_5_club','blocked_other','rcm','exempt')),
  default_tds_section text CHECK (default_tds_section IS NULL OR default_tds_section IN ('194C','194J','194I','194Q','194H')),
  receipt_threshold   numeric(18,2) NOT NULL DEFAULT 0 CHECK (receipt_threshold >= 0),
  policy_group        jsonb NOT NULL DEFAULT '{}'::jsonb,
  category_keywords   jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT uq_exp_head_code UNIQUE (tenant_id, code),
  -- An exempt supply carries no rate; a rated supply cannot be marked exempt. The pair
  -- disagreeing is how electricity ends up with a phantom credit on the ITC register.
  CONSTRAINT ck_head_exempt CHECK (itc_eligibility <> 'exempt' OR coalesce(gst_rate, 0) = 0)
);
COMMENT ON COLUMN expense_head.category_keywords IS
  'The deterministic baseline for AI #1 auto-categorisation, and the bar the model must clear in the golden-set gate. Configuration, not a dictionary compiled into the code.';
REVOKE DELETE ON expense_head FROM app_user;

CREATE TABLE tds_config (
  id                        uuid PRIMARY KEY,
  tenant_id                 uuid NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid NOT NULL,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid NOT NULL,
  is_active                 boolean NOT NULL DEFAULT true,
  section                   text NOT NULL CHECK (section IN ('194C','194J','194I','194Q','194H')),
  deductee_type             text NOT NULL DEFAULT 'any' CHECK (deductee_type IN ('individual_huf','company_firm_other','any')),
  rate_pct                  numeric(6,3) NOT NULL CHECK (rate_pct >= 0 AND rate_pct <= 100),
  single_payment_threshold  numeric(18,2) NOT NULL CHECK (single_payment_threshold >= 0),
  annual_threshold          numeric(18,2) NOT NULL CHECK (annual_threshold >= 0),
  it_act_2025_section       text,
  effective_from            date NOT NULL,
  effective_to              date,
  source_note               text NOT NULL,
  CONSTRAINT ck_tds_window CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_tds_cfg ON tds_config (tenant_id, section, effective_from DESC);
CREATE TRIGGER trg_tds_cfg_append_only
  BEFORE UPDATE OR DELETE ON tds_config FOR EACH ROW EXECUTE FUNCTION exp_guard_rate_book();
REVOKE DELETE ON tds_config FROM app_user;
COMMENT ON TABLE tds_config IS
  'Effective-dated and append-only. A July 2026 deduction must still be reproducible in a 2029 assessment, so a rate is never edited — a change is a new row.';

CREATE TABLE tds_accumulator (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  vendor_ref           uuid NOT NULL,
  section              text NOT NULL,
  fiscal_year          text NOT NULL,
  cumulative_base      numeric(18,2) NOT NULL DEFAULT 0 CHECK (cumulative_base >= 0),
  threshold_crossed_at date,
  crossing_doc_ref     text,
  CONSTRAINT uq_tds_accum UNIQUE (tenant_id, vendor_ref, section, fiscal_year),
  -- A crossing date without the document that caused it cannot be defended to an officer.
  CONSTRAINT ck_tds_crossing_doc CHECK ((threshold_crossed_at IS NULL) = (crossing_doc_ref IS NULL))
);

CREATE TABLE per_diem_rate (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  grade_code     text NOT NULL,
  city_tier      text NOT NULL CHECK (city_tier IN ('A','B','C')),
  trip_type      text NOT NULL DEFAULT 'domestic' CHECK (trip_type IN ('domestic','international')),
  daily_rate     numeric(18,2) NOT NULL CHECK (daily_rate > 0),
  lodging_rate   numeric(18,2),
  meals_rate     numeric(18,2),
  effective_from date NOT NULL,
  effective_to   date,
  CONSTRAINT ck_perdiem_window CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_perdiem ON per_diem_rate (tenant_id, grade_code, city_tier, effective_from DESC);
CREATE TRIGGER trg_perdiem_append_only
  BEFORE UPDATE OR DELETE ON per_diem_rate FOR EACH ROW EXECUTE FUNCTION exp_guard_rate_book();
REVOKE DELETE ON per_diem_rate FROM app_user;

CREATE TABLE fx_rate (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  currency       text NOT NULL,
  rate_to_inr    numeric(18,6) NOT NULL CHECK (rate_to_inr > 0),
  effective_from date NOT NULL,
  effective_to   date,
  source         text NOT NULL DEFAULT 'manual'
);
CREATE INDEX ix_fx ON fx_rate (tenant_id, currency, effective_from DESC);
CREATE TRIGGER trg_fx_append_only
  BEFORE UPDATE OR DELETE ON fx_rate FOR EACH ROW EXECUTE FUNCTION exp_guard_rate_book();
REVOKE DELETE ON fx_rate FROM app_user;

CREATE TABLE exp_document_series (
  id         uuid PRIMARY KEY,
  tenant_id  uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  doc_type   text NOT NULL CHECK (doc_type IN ('claim','travel','advance','indirect','batch')),
  prefix     text NOT NULL,
  fy_code    text NOT NULL,
  width      smallint NOT NULL DEFAULT 5,
  next_no    integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_exp_series UNIQUE (tenant_id, doc_type, fy_code)
);

-- =============================================================================
-- Budgets and the reservation ledger
-- =============================================================================

CREATE TABLE budget (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  fiscal_year          text NOT NULL,
  cost_centre_ref      text NOT NULL,
  project_ref          text,
  budget_type          text NOT NULL DEFAULT 'opex' CHECK (budget_type IN ('opex','capex')),
  basis                text NOT NULL DEFAULT 'monthly' CHECK (basis IN ('monthly','cumulative')),
  version_no           smallint NOT NULL DEFAULT 1 CHECK (version_no > 0),
  status               text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','submitted','active','revised','closed')),
  workflow_instance_id uuid,
  CONSTRAINT uq_budget_ver UNIQUE (tenant_id, fiscal_year, cost_centre_ref, version_no)
);
REVOKE DELETE ON budget FROM app_user;
-- One ACTIVE version per cost centre per year. Two active budgets is two answers to the
-- same availability question, which is worse than none.
CREATE UNIQUE INDEX uq_budget_active ON budget (tenant_id, fiscal_year, cost_centre_ref)
  WHERE status = 'active';

CREATE TABLE budget_line (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  budget_id            uuid NOT NULL REFERENCES budget (id),
  expense_head_id      uuid NOT NULL REFERENCES expense_head (id),
  annual_amount        numeric(18,2) NOT NULL CHECK (annual_amount >= 0),
  monthly_distribution jsonb NOT NULL,
  control_action       text NOT NULL DEFAULT 'warn' CHECK (control_action IN ('stop','warn','ignore')),
  applicable_docs      jsonb NOT NULL DEFAULT '["expense_claim","purchase_expense"]'::jsonb,
  CONSTRAINT uq_budget_line UNIQUE (tenant_id, budget_id, expense_head_id),
  -- Guarantee (3): twelve cells, and they add up to the annual figure.
  CONSTRAINT ck_budget_cells CHECK (jsonb_array_length(monthly_distribution) = 12),
  CONSTRAINT ck_budget_sums CHECK (abs(exp_jsonb_num_sum(monthly_distribution) - annual_amount) <= 0.01)
);
REVOKE DELETE ON budget_line FROM app_user;

CREATE TABLE budget_revision (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  budget_id            uuid NOT NULL REFERENCES budget (id),
  from_version         smallint NOT NULL,
  to_version           smallint NOT NULL,
  reason               text NOT NULL,
  changed_lines        jsonb NOT NULL DEFAULT '[]'::jsonb,
  commitment_conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  acknowledged_by      uuid,
  -- A revision that cuts a line below what is already spent is legitimate — the money is
  -- gone — but it cannot happen without somebody putting their name to having seen it.
  CONSTRAINT ck_revision_ack CHECK (
    jsonb_array_length(commitment_conflicts) = 0 OR acknowledged_by IS NOT NULL
  )
);
CREATE INDEX ix_budget_rev ON budget_revision (tenant_id, budget_id);

CREATE TABLE budget_consumption (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  budget_line_id  uuid NOT NULL REFERENCES budget_line (id),
  period          smallint NOT NULL CHECK (period BETWEEN 1 AND 12),
  bucket          text NOT NULL CHECK (bucket IN ('in_approval','committed','actual')),
  amount          numeric(18,2) NOT NULL,
  doc_type        text NOT NULL,
  doc_ref         text NOT NULL,
  entry_type      text NOT NULL CHECK (entry_type IN ('reserve','flip','reverse')),
  idempotency_key text NOT NULL,
  note            text,
  -- Guarantee (2): a retried submit collides instead of doubling the commitment.
  CONSTRAINT uq_budget_consumption_idem UNIQUE (tenant_id, idempotency_key),
  -- A reservation is positive and a reversal is negative. A `reserve` row carrying a
  -- negative amount would give budget back on submission.
  CONSTRAINT ck_consumption_sign CHECK (
    (entry_type = 'reserve'  AND amount > 0) OR
    (entry_type = 'reverse'  AND amount < 0) OR
    (entry_type = 'flip')
  )
);
CREATE INDEX ix_budget_consumption ON budget_consumption (tenant_id, budget_line_id, period, bucket);
-- Guarantee (1): append-only at the grant AND at a trigger.
CREATE TRIGGER trg_consumption_append_only
  BEFORE UPDATE OR DELETE ON budget_consumption FOR EACH ROW EXECUTE FUNCTION exp_forbid_mutation();
REVOKE UPDATE, DELETE ON budget_consumption FROM app_user;
COMMENT ON TABLE budget_consumption IS
  'The availability source of truth. available = budget − actual − committed − in_approval, read under a row lock on the budget line. Append-only: a rejection is a signed negative row, never an edit.';

-- =============================================================================
-- Expense claims
-- =============================================================================

CREATE TABLE expense_claim (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  claim_no             text NOT NULL,
  employee_ref         uuid NOT NULL,
  claim_date           date NOT NULL,
  cost_centre_ref      text NOT NULL,
  project_ref          text,
  advance_id           uuid,
  currency             text NOT NULL DEFAULT 'INR',
  fx_rate_id           uuid REFERENCES fx_rate (id),
  total_claimed        numeric(18,2) NOT NULL DEFAULT 0 CHECK (total_claimed >= 0),
  total_tax            numeric(18,2) NOT NULL DEFAULT 0 CHECK (total_tax >= 0),
  total_itc_eligible   numeric(18,2) NOT NULL DEFAULT 0 CHECK (total_itc_eligible >= 0),
  advance_adjusted     numeric(18,2) NOT NULL DEFAULT 0 CHECK (advance_adjusted >= 0),
  -- Guarantee (4): GENERATED, and it cannot go negative.
  net_reimbursable     numeric(18,2) GENERATED ALWAYS AS (greatest(total_claimed - advance_adjusted, 0)) STORED,
  status               text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','submitted','in_approval','returned','approved',
                                           'rejected','posted','paid','cancelled')),
  policy_flags         jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget_check_result  jsonb,
  workflow_instance_id uuid,
  submitted_at         timestamptz,
  approved_at          timestamptz,
  idempotency_key_hash text,
  CONSTRAINT uq_claim_no UNIQUE (tenant_id, claim_no),
  -- The advance cannot absorb more than the claim is worth.
  CONSTRAINT ck_claim_advance CHECK (advance_adjusted <= total_claimed),
  -- ITC can never exceed the tax that was charged.
  CONSTRAINT ck_claim_itc CHECK (total_itc_eligible <= total_tax)
);
CREATE INDEX ix_claim_emp ON expense_claim (tenant_id, employee_ref, status);
CREATE UNIQUE INDEX uq_claim_idem ON expense_claim (tenant_id, idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;
CREATE TRIGGER trg_claim_guard
  BEFORE UPDATE OR DELETE ON expense_claim FOR EACH ROW EXECUTE FUNCTION exp_guard_claim();
REVOKE DELETE ON expense_claim FROM app_user;

CREATE TABLE expense_claim_line (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  claim_id          uuid NOT NULL REFERENCES expense_claim (id),
  line_no           smallint NOT NULL,
  expense_head_id   uuid NOT NULL REFERENCES expense_head (id),
  expense_date      date NOT NULL,
  merchant          text,
  description       text,
  amount            numeric(18,2) NOT NULL CHECK (amount > 0),
  gst_amount        numeric(18,2) NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
  itc_amount        numeric(18,2) NOT NULL DEFAULT 0 CHECK (itc_amount >= 0),
  itc_eligibility   text NOT NULL DEFAULT 'eligible',
  itc_reason        text,
  reimbursable_type text NOT NULL DEFAULT 'bill_backed' CHECK (reimbursable_type IN ('bill_backed','allowance')),
  distance_km       numeric(12,2),
  rate_per_km       numeric(12,2),
  attachment_id     uuid,
  cost_centre_ref   text,
  policy_flags      jsonb NOT NULL DEFAULT '[]'::jsonb,
  source            text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai_assisted')),
  ai_confidence     jsonb,
  ai_user_edits     jsonb,
  CONSTRAINT uq_claim_line_no UNIQUE (tenant_id, claim_id, line_no),
  CONSTRAINT ck_line_itc CHECK (itc_amount <= gst_amount),
  -- A blocked line cannot carry a credit. The two disagreeing is exactly the error that
  -- shows up as an ITC demand two years later.
  CONSTRAINT ck_line_itc_block CHECK (itc_eligibility IN ('eligible','rcm') OR itc_amount = 0),
  -- An AI-assisted line without its confidence record cannot be measured, and the
  -- acceptance dashboard is the only honest evidence this feature earns its cost.
  CONSTRAINT ck_line_ai_provenance CHECK (source <> 'ai_assisted' OR ai_confidence IS NOT NULL)
);
REVOKE DELETE ON expense_claim_line FROM app_user;

-- =============================================================================
-- Travel and cash advances
-- =============================================================================

CREATE TABLE travel_request (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  travel_no            text NOT NULL,
  employee_ref         uuid NOT NULL,
  cost_centre_ref      text NOT NULL,
  purpose              text NOT NULL,
  from_city            text NOT NULL,
  to_city              text NOT NULL,
  city_tier            text NOT NULL DEFAULT 'B' CHECK (city_tier IN ('A','B','C')),
  from_date            date NOT NULL,
  to_date              date NOT NULL,
  mode_of_travel       text,
  est_cost             numeric(18,2) NOT NULL DEFAULT 0,
  per_diem_amount      numeric(18,2) NOT NULL DEFAULT 0,
  per_diem_rate_ref    text,
  advance_id           uuid,
  claim_id             uuid REFERENCES expense_claim (id),
  status               text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','submitted','approved','rejected','in_trip','claimed','cancelled')),
  workflow_instance_id uuid,
  CONSTRAINT uq_travel_no UNIQUE (tenant_id, travel_no),
  CONSTRAINT ck_travel_window CHECK (to_date >= from_date),
  -- A per-diem amount without the rate row that produced it cannot be reproduced when the
  -- rate is revised, which is the point of effective-dating it in the first place.
  CONSTRAINT ck_travel_perdiem_ref CHECK (per_diem_amount = 0 OR per_diem_rate_ref IS NOT NULL)
);
REVOKE DELETE ON travel_request FROM app_user;

CREATE TABLE cash_advance (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  advance_no           text NOT NULL,
  employee_ref         uuid NOT NULL,
  purpose              text NOT NULL,
  amount               numeric(18,2) NOT NULL CHECK (amount > 0),
  paid_amount          numeric(18,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  settled_amount       numeric(18,2) NOT NULL DEFAULT 0 CHECK (settled_amount >= 0),
  refunded_amount      numeric(18,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  balance              numeric(18,2) GENERATED ALWAYS AS (paid_amount - settled_amount - refunded_amount) STORED,
  needed_by            date,
  settle_by            date NOT NULL,
  travel_request_id    uuid REFERENCES travel_request (id),
  status               text NOT NULL DEFAULT 'requested'
                         CHECK (status IN ('requested','approved','disbursed','partially_settled','settled','cancelled')),
  workflow_instance_id uuid,
  disbursed_at         timestamptz,
  CONSTRAINT uq_advance_no UNIQUE (tenant_id, advance_no),
  CONSTRAINT ck_advance_paid CHECK (paid_amount <= amount),
  -- More cannot come back than went out.
  CONSTRAINT ck_advance_returned CHECK (settled_amount + refunded_amount <= paid_amount)
);
CREATE INDEX ix_advance_emp ON cash_advance (tenant_id, employee_ref, status);
REVOKE DELETE ON cash_advance FROM app_user;
COMMENT ON COLUMN cash_advance.settle_by IS
  'Mandatory. The overdue-advance block — the module''s one hard refusal — hangs entirely off this date.';

CREATE TABLE advance_settlement (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  advance_id      uuid NOT NULL REFERENCES cash_advance (id),
  claim_id        uuid REFERENCES expense_claim (id),
  settlement_type text NOT NULL CHECK (settlement_type IN ('claim_adjust','refund')),
  amount          numeric(18,2) NOT NULL CHECK (amount > 0),
  settled_at      timestamptz NOT NULL DEFAULT now(),
  note            text,
  -- A claim adjustment must name the claim it adjusted against.
  CONSTRAINT ck_settle_claim CHECK (settlement_type <> 'claim_adjust' OR claim_id IS NOT NULL)
);
CREATE INDEX ix_adv_settle ON advance_settlement (tenant_id, advance_id);
CREATE TRIGGER trg_settlement_append_only
  BEFORE UPDATE OR DELETE ON advance_settlement FOR EACH ROW EXECUTE FUNCTION exp_forbid_mutation();
REVOKE UPDATE, DELETE ON advance_settlement FROM app_user;

ALTER TABLE expense_claim ADD CONSTRAINT fk_claim_advance FOREIGN KEY (advance_id) REFERENCES cash_advance (id);
ALTER TABLE travel_request ADD CONSTRAINT fk_travel_advance FOREIGN KEY (advance_id) REFERENCES cash_advance (id);

-- =============================================================================
-- Indirect spend
-- =============================================================================

CREATE TABLE purchase_expense (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  exp_no                text NOT NULL,
  doc_kind              text NOT NULL CHECK (doc_kind IN ('direct_invoice','indirect_pr','utility_bill')),
  vendor_ref            uuid,
  vendor_name           text NOT NULL,
  vendor_gstin          text,
  vendor_deductee_type  text NOT NULL DEFAULT 'company_firm_other'
                          CHECK (vendor_deductee_type IN ('individual_huf','company_firm_other')),
  vendor_has_pan        boolean NOT NULL DEFAULT true,
  vendor_invoice_no     text,
  invoice_date          date,
  cost_centre_ref       text NOT NULL,
  fulfilment            text NOT NULL DEFAULT 'received',
  po_ref                text,
  basic_amount          numeric(18,2) NOT NULL DEFAULT 0 CHECK (basic_amount >= 0),
  cgst                  numeric(18,2) NOT NULL DEFAULT 0 CHECK (cgst >= 0),
  sgst                  numeric(18,2) NOT NULL DEFAULT 0 CHECK (sgst >= 0),
  igst                  numeric(18,2) NOT NULL DEFAULT 0 CHECK (igst >= 0),
  total_itc_eligible    numeric(18,2) NOT NULL DEFAULT 0 CHECK (total_itc_eligible >= 0),
  tds_section           text,
  tds_rate              numeric(6,3),
  tds_base              numeric(18,2) NOT NULL DEFAULT 0,
  tds_amount            numeric(18,2) NOT NULL DEFAULT 0 CHECK (tds_amount >= 0),
  tds_config_ref        text,
  tds_crossing          jsonb,
  budget_check_result   jsonb,
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','submitted','in_approval','approved','rejected',
                                            'po_raised','posted','paid','blocked','cancelled')),
  workflow_instance_id  uuid,
  approved_at           timestamptz,
  idempotency_key_hash  text,
  CONSTRAINT uq_purchase_expense_no UNIQUE (tenant_id, exp_no),
  -- An intra-state supply and an inter-state supply cannot both be true of one invoice.
  CONSTRAINT ck_pe_gst_split CHECK (igst = 0 OR (cgst = 0 AND sgst = 0)),
  -- Guarantee (7): no deduction without the effective-dated row that produced it.
  CONSTRAINT ck_pe_tds_ref CHECK (tds_amount = 0 OR tds_config_ref IS NOT NULL),
  CONSTRAINT ck_pe_itc CHECK (total_itc_eligible <= cgst + sgst + igst)
);
CREATE INDEX ix_purchase_expense_vendor ON purchase_expense (tenant_id, vendor_ref, status);
CREATE UNIQUE INDEX uq_pe_idem ON purchase_expense (tenant_id, idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;
REVOKE DELETE ON purchase_expense FROM app_user;
COMMENT ON COLUMN purchase_expense.tds_crossing IS
  'Populated on the exact document where an annual threshold is crossed. Carries BOTH statutory readings — prospective and catch-up — and a finance-review flag. The system computes; it does not choose a tax position.';

CREATE TABLE purchase_expense_line (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  purchase_expense_id uuid NOT NULL REFERENCES purchase_expense (id),
  line_no             smallint NOT NULL,
  expense_head_id     uuid NOT NULL REFERENCES expense_head (id),
  description         text NOT NULL,
  amount              numeric(18,2) NOT NULL CHECK (amount > 0),
  gst_rate            numeric(5,2),
  gst_amount          numeric(18,2) NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
  itc_eligibility     text NOT NULL DEFAULT 'eligible',
  itc_amount          numeric(18,2) NOT NULL DEFAULT 0 CHECK (itc_amount >= 0),
  hsn_sac             text,
  cost_centre_ref     text,
  allocation          jsonb,
  source              text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai_assisted')),
  ai_confidence       jsonb,
  CONSTRAINT uq_pe_line_no UNIQUE (tenant_id, purchase_expense_id, line_no),
  CONSTRAINT ck_pe_line_itc CHECK (itc_amount <= gst_amount),
  CONSTRAINT ck_pe_line_itc_block CHECK (itc_eligibility IN ('eligible','rcm') OR itc_amount = 0)
);
REVOKE DELETE ON purchase_expense_line FROM app_user;

CREATE TABLE utility_bill_detail (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  purchase_expense_id uuid NOT NULL REFERENCES purchase_expense (id),
  utility_type        text NOT NULL,
  meter_no            text,
  period_from         date,
  period_to           date,
  prev_reading        numeric(18,3),
  curr_reading        numeric(18,3),
  units_consumed      numeric(18,3),
  CONSTRAINT uq_utility_detail UNIQUE (tenant_id, purchase_expense_id),
  -- A meter does not run backwards. When it does, somebody has transposed a reading, and
  -- the resulting negative consumption would flow into the ₹/unit anomaly report as fact.
  CONSTRAINT ck_meter_forward CHECK (curr_reading IS NULL OR prev_reading IS NULL OR curr_reading >= prev_reading)
);

CREATE TABLE recurring_expense (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  template_code     text NOT NULL,
  expense_head_id   uuid NOT NULL REFERENCES expense_head (id),
  vendor_ref        uuid,
  vendor_name       text NOT NULL,
  cost_centre_ref   text NOT NULL,
  amount            numeric(18,2) NOT NULL CHECK (amount > 0),
  gst_rate          numeric(5,2),
  frequency         text NOT NULL CHECK (frequency IN ('monthly','quarterly','annual')),
  next_run_date     date NOT NULL,
  end_date          date,
  auto_post         boolean NOT NULL DEFAULT false,
  auto_post_ceiling numeric(18,2),
  last_generated_ref text,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  CONSTRAINT uq_recurring_code UNIQUE (tenant_id, template_code),
  -- Auto-posting without a ceiling is an unbounded standing instruction.
  CONSTRAINT ck_recurring_ceiling CHECK (auto_post = false OR auto_post_ceiling IS NOT NULL)
);

-- =============================================================================
-- Reimbursement and the posting handoff
-- =============================================================================

CREATE TABLE reimbursement_batch (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  batch_no             text NOT NULL,
  pay_mode             text NOT NULL DEFAULT 'bank_transfer' CHECK (pay_mode IN ('bank_transfer','payroll','cash')),
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','cancelled')),
  total_amount         numeric(18,2) NOT NULL DEFAULT 0,
  idempotency_key_hash text,
  CONSTRAINT uq_reimb_batch_no UNIQUE (tenant_id, batch_no)
);
REVOKE DELETE ON reimbursement_batch FROM app_user;

CREATE TABLE reimbursement (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  batch_id         uuid NOT NULL REFERENCES reimbursement_batch (id),
  claim_id         uuid NOT NULL REFERENCES expense_claim (id),
  gross_amount     numeric(18,2) NOT NULL CHECK (gross_amount >= 0),
  advance_adjusted numeric(18,2) NOT NULL DEFAULT 0 CHECK (advance_adjusted >= 0),
  net_amount       numeric(18,2) NOT NULL CHECK (net_amount >= 0),
  bank_ref         text,
  payroll_period   text,
  paid_date        date,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  CONSTRAINT uq_reimb_claim UNIQUE (tenant_id, batch_id, claim_id)
);
REVOKE DELETE ON reimbursement FROM app_user;
-- A claim can appear in exactly one live payout batch. Two is how somebody gets paid twice.
CREATE UNIQUE INDEX uq_reimb_claim_once ON reimbursement (tenant_id, claim_id)
  WHERE status <> 'failed';

CREATE TABLE posting_instruction (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  doc_type             text NOT NULL,
  doc_ref              text NOT NULL,
  payload              jsonb NOT NULL,
  idempotency_key      text NOT NULL,
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','acked','failed')),
  accounts_voucher_ref text,
  attempts             integer NOT NULL DEFAULT 0,
  last_error           text,
  acked_at             timestamptz,
  -- Guarantee (6): one instruction per document version, ever.
  CONSTRAINT uq_posting_idem UNIQUE (tenant_id, idempotency_key),
  -- An acknowledgement without the voucher reference proves nothing was posted.
  CONSTRAINT ck_posting_ack CHECK (status <> 'acked' OR accounts_voucher_ref IS NOT NULL)
);
CREATE INDEX ix_posting_status ON posting_instruction (tenant_id, status);
COMMENT ON TABLE posting_instruction IS
  'Expenditure never writes a general-ledger row. It writes this, in the same transaction as the approval; the relay delivers it; ACCOUNTS posts and acknowledges with a voucher reference, and the acknowledgement flips the budget bucket from committed to actual.';

-- =============================================================================
-- Attachments and the extraction draft
-- =============================================================================

CREATE TABLE exp_attachment (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  object_key        text NOT NULL,
  file_name         text NOT NULL,
  mime              text NOT NULL,
  size_bytes        integer NOT NULL CHECK (size_bytes > 0),
  sha256            text NOT NULL,
  parsed_fields     jsonb,
  extraction_status text NOT NULL DEFAULT 'none'
                      CHECK (extraction_status IN ('none','queued','extracted','fallback','failed','confirmed','declined')),
  needs_review      jsonb NOT NULL DEFAULT '[]'::jsonb,
  used_fallback     boolean NOT NULL DEFAULT false,
  linked_doc_type   text,
  linked_doc_ref    text,
  uploaded_by_ref   uuid,
  duplicate_flags   jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- A confirmed extraction must have produced a draft to confirm.
  CONSTRAINT ck_attachment_confirmed CHECK (extraction_status <> 'confirmed' OR parsed_fields IS NOT NULL)
);
-- Deliberately an INDEX, not a UNIQUE constraint. See the migration header.
CREATE INDEX ix_attachment_sha ON exp_attachment (tenant_id, sha256);
CREATE INDEX ix_attachment_doc ON exp_attachment (tenant_id, linked_doc_type, linked_doc_ref);
-- pg_trgm on the merchant name, for the near-duplicate detector's prefilter at scale.
CREATE INDEX ix_attachment_merchant_trgm ON exp_attachment
  USING GIN ((parsed_fields ->> 'merchant') gin_trgm_ops);
REVOKE DELETE ON exp_attachment FROM app_user;

-- =============================================================================
-- FORCE RLS on every tenant-scoped table in this migration.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'expense_head','tds_config','tds_accumulator','per_diem_rate','fx_rate','exp_document_series',
    'budget','budget_line','budget_revision','budget_consumption',
    'expense_claim','expense_claim_line','travel_request','cash_advance','advance_settlement',
    'purchase_expense','purchase_expense_line','utility_bill_detail','recurring_expense',
    'reimbursement_batch','reimbursement','posting_instruction','exp_attachment']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)', t);
  END LOOP;
END $$;
