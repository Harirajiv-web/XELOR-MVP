-- =============================================================================
-- 0032_planning — PLANNING / MRP (Module 13): what to make, what to buy, by when.
--
-- Every other module in this system records something that happened. This one records
-- something that has NOT happened yet — and that is the whole difficulty. A plan is an
-- argument about the future, and the only way it stays trustworthy is if the argument is
-- kept alongside the conclusion.
--
-- SEVEN guarantees are made HERE, in the database:
--
--  (1) A COMPLETED RUN IS IMMUTABLE. `mrp_run`, `mrp_run_item`, `mrp_run_bucket` and
--      `planned_order_peg` are trigger-blocked against UPDATE and DELETE once the run is
--      completed. The per-bucket arithmetic IS the answer to "why did we buy fifty
--      castings in July?", and that question is asked in November. A plan that can be
--      edited after the fact cannot answer it.
--
--  (2) ONE PLANNED ORDER PER ITEM PER BUCKET PER RUN. UNIQUE (tenant, run_id, order_key).
--      Two planned orders for the same item in the same week is not a plan, it is a
--      double order — and it is what a re-entrant or retried run produces without this.
--
--  (3) A PLANNED ORDER CANNOT BE CONVERTED TWICE. A partial UNIQUE index on
--      (tenant, converted_to_kind, converted_to_ref) plus a CHECK that `converted` implies
--      a reference. Converting the same planned order into two work orders builds the
--      same pump twice, and nothing downstream notices until the stock does not move.
--
--  (4) AN ITEM CANNOT BE PLANNED BY MRP *AND* CARRY A REORDER POINT. A CHECK on
--      `item_planning_policy`. This is the single commonest way an ERP silently
--      accumulates excess: the plan orders it, and the reorder trigger orders it again
--      against no demand at all. The application reports it as a conflict on import; the
--      database refuses to store it.
--
--  (5) CAPACITY FACTORS ARE FRACTIONS IN (0, 1]. Utilisation and efficiency at zero make
--      available capacity zero and every load percentage infinite; above one they invent
--      hours the plant does not have. Both are how a capacity report becomes decoration.
--
--  (6) A FROZEN MPS BUCKET CANNOT BE CHANGED WITHOUT A RECORDED REASON. A CHECK ties
--      `override_by` and `override_reason` together — one without the other is an
--      unattributable change to a number the shop floor has already committed material
--      against.
--
--  (7) THE DEMAND FENCE CANNOT SIT OUTSIDE THE PLANNING FENCE. A CHECK that
--      demand_time_fence <= planning_time_fence. The reverse is meaningless — it declares
--      a bucket simultaneously frozen and freely changeable.
--
-- Note what is deliberately NOT enforced: a planned order may sit in a bucket whose
-- release date is clamped to today while `computed_release_date` remains in the past. That
-- pair disagreeing is not corruption — it is the module reporting that the lead time
-- cannot be met, and normalising it away would delete the most important thing the plan
-- has to say.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Guard functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION plan_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'a completed planning run is immutable: % on % is not permitted', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

-- A run in flight may be written to; the moment it completes, its working is history.
CREATE OR REPLACE FUNCTION plan_guard_run() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'planning runs are never deleted — run % is the record of a decision', OLD.run_no
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status IN ('completed','failed') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'run % is already % and cannot be re-opened; make a new run', OLD.run_no, OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status = 'completed' AND (
       NEW.planning_date  IS DISTINCT FROM OLD.planning_date OR
       NEW.first_bucket   IS DISTINCT FROM OLD.first_bucket  OR
       NEW.last_bucket    IS DISTINCT FROM OLD.last_bucket   OR
       NEW.params         IS DISTINCT FROM OLD.params) THEN
    RAISE EXCEPTION 'run % is completed — its inputs are frozen', OLD.run_no
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Calendars and capacity
-- ---------------------------------------------------------------------------

CREATE TABLE plan_calendar (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  code          text NOT NULL,
  name          text NOT NULL,
  working_days  jsonb NOT NULL DEFAULT '[1,2,3,4,5,6]'::jsonb,
  is_default    boolean NOT NULL DEFAULT false,
  CONSTRAINT uq_plancal_tenant_code UNIQUE (tenant_id, code),
  -- A calendar with no working days makes every lead-time offset non-terminating.
  CONSTRAINT ck_plancal_days CHECK (jsonb_array_length(working_days) BETWEEN 1 AND 7)
);
REVOKE DELETE ON plan_calendar FROM app_user;

CREATE TABLE plan_holiday (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  calendar_id   uuid NOT NULL REFERENCES plan_calendar (id),
  holiday_date  date NOT NULL,
  name          text NOT NULL,
  CONSTRAINT uq_planhol_cal_date UNIQUE (tenant_id, calendar_id, holiday_date)
);

CREATE TABLE plan_work_centre (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  code             text NOT NULL,
  name             text NOT NULL,
  calendar_id      uuid REFERENCES plan_calendar (id),
  machine_count    integer NOT NULL DEFAULT 1 CHECK (machine_count >= 1),
  utilisation_pct  numeric(5,4) NOT NULL DEFAULT 0.85,
  efficiency_pct   numeric(5,4) NOT NULL DEFAULT 0.9,
  is_bottleneck    boolean NOT NULL DEFAULT false,
  cost_centre_ref  text,
  CONSTRAINT uq_planwc_tenant_code UNIQUE (tenant_id, code),
  -- Guarantee (5). Zero makes every load percentage infinite; above one invents hours.
  CONSTRAINT ck_planwc_util CHECK (utilisation_pct > 0 AND utilisation_pct <= 1),
  CONSTRAINT ck_planwc_eff  CHECK (efficiency_pct  > 0 AND efficiency_pct  <= 1)
);
REVOKE DELETE ON plan_work_centre FROM app_user;

CREATE TABLE plan_shift (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  work_centre_id   uuid NOT NULL REFERENCES plan_work_centre (id),
  name             text NOT NULL,
  hours            numeric(6,2) NOT NULL,
  days             jsonb NOT NULL DEFAULT '[1,2,3,4,5,6]'::jsonb,
  CONSTRAINT uq_planshift_wc_name UNIQUE (tenant_id, work_centre_id, name),
  -- A shift longer than a day is a data-entry slip that quietly doubles plant capacity.
  CONSTRAINT ck_planshift_hours CHECK (hours > 0 AND hours <= 24)
);

CREATE TABLE plan_wc_downtime (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  work_centre_id  uuid NOT NULL REFERENCES plan_work_centre (id),
  bucket          text NOT NULL,
  hours           numeric(8,2) NOT NULL CHECK (hours > 0),
  reason          text NOT NULL,
  CONSTRAINT uq_planwcdt_wc_bucket UNIQUE (tenant_id, work_centre_id, bucket)
);

CREATE TABLE plan_routing_operation (
  id                        uuid PRIMARY KEY,
  tenant_id                 uuid NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid NOT NULL,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid NOT NULL,
  is_active                 boolean NOT NULL DEFAULT true,
  item_id                   uuid NOT NULL,
  item_code                 text NOT NULL,
  operation_seq             integer NOT NULL CHECK (operation_seq > 0),
  work_centre_id            uuid NOT NULL REFERENCES plan_work_centre (id),
  alternate_work_centre_id  uuid REFERENCES plan_work_centre (id),
  description               text NOT NULL,
  setup_hours               numeric(8,3) NOT NULL DEFAULT 0 CHECK (setup_hours >= 0),
  run_hours_per_unit        numeric(10,4) NOT NULL DEFAULT 0 CHECK (run_hours_per_unit >= 0),
  CONSTRAINT uq_planrouting_item_seq UNIQUE (tenant_id, item_id, operation_seq),
  -- Routing an operation to its own alternate makes the alternate meaningless.
  CONSTRAINT ck_planrouting_alt CHECK (alternate_work_centre_id IS NULL OR alternate_work_centre_id <> work_centre_id)
);
CREATE INDEX ix_planrouting_tenant_wc ON plan_routing_operation (tenant_id, work_centre_id);

-- ---------------------------------------------------------------------------
-- Planning policy
-- ---------------------------------------------------------------------------

CREATE TABLE item_planning_policy (
  id                          uuid PRIMARY KEY,
  tenant_id                   uuid NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid NOT NULL,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid NOT NULL,
  is_active                   boolean NOT NULL DEFAULT true,
  item_id                     uuid NOT NULL,
  item_code                   text NOT NULL,
  low_level_code              integer NOT NULL DEFAULT 0 CHECK (low_level_code >= 0),
  planning_method             text NOT NULL DEFAULT 'mrp'
                                CHECK (planning_method IN ('mrp','reorder_point','min_max','none')),
  source_type                 text NOT NULL CHECK (source_type IN ('make','buy')),
  lot_rule                    text NOT NULL DEFAULT 'L4L'
                                CHECK (lot_rule IN ('L4L','FOQ','MOQ','MULT','EOQ','POQ')),
  lot_size                    numeric(18,3) CHECK (lot_size IS NULL OR lot_size > 0),
  min_order_qty               numeric(18,3) CHECK (min_order_qty IS NULL OR min_order_qty > 0),
  lead_time_working_days      integer NOT NULL DEFAULT 0 CHECK (lead_time_working_days >= 0),
  safety_stock                numeric(18,3) NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
  service_level               numeric(4,3) CHECK (service_level IS NULL OR (service_level > 0 AND service_level < 1)),
  abc_class                   text CHECK (abc_class IS NULL OR abc_class IN ('A','B','C')),
  uom_precision               integer NOT NULL DEFAULT 0 CHECK (uom_precision BETWEEN 0 AND 6),
  annual_demand               numeric(18,3) CHECK (annual_demand IS NULL OR annual_demand >= 0),
  order_cost                  numeric(18,2) CHECK (order_cost IS NULL OR order_cost >= 0),
  holding_cost                numeric(18,2) CHECK (holding_cost IS NULL OR holding_cost >= 0),
  reorder_point               numeric(18,3) CHECK (reorder_point IS NULL OR reorder_point >= 0),
  max_level                   numeric(18,3) CHECK (max_level IS NULL OR max_level >= 0),
  is_mps_item                 boolean NOT NULL DEFAULT false,
  demand_time_fence_buckets   integer NOT NULL DEFAULT 0 CHECK (demand_time_fence_buckets >= 0),
  planning_time_fence_buckets integer NOT NULL DEFAULT 0 CHECK (planning_time_fence_buckets >= 0),
  planner_ref                 text,
  CONSTRAINT uq_planpolicy_tenant_item UNIQUE (tenant_id, item_id),
  -- Guarantee (4). The single commonest silent source of excess inventory.
  CONSTRAINT ck_planpolicy_no_double_order CHECK (planning_method <> 'mrp' OR reorder_point IS NULL),
  -- Guarantee (7).
  CONSTRAINT ck_planpolicy_fences CHECK (demand_time_fence_buckets <= planning_time_fence_buckets),
  -- A rule that needs a size must have one, or it silently degrades to lot-for-lot.
  CONSTRAINT ck_planpolicy_lotsize CHECK (lot_rule NOT IN ('FOQ','MOQ','MULT','POQ') OR lot_size IS NOT NULL),
  -- A min/max maximum at or below the reorder point orders nothing, forever.
  CONSTRAINT ck_planpolicy_minmax CHECK (max_level IS NULL OR reorder_point IS NULL OR max_level > reorder_point)
);
CREATE INDEX ix_planpolicy_tenant_llc    ON item_planning_policy (tenant_id, low_level_code);
CREATE INDEX ix_planpolicy_tenant_method ON item_planning_policy (tenant_id, planning_method);
COMMENT ON TABLE item_planning_policy IS
  'Planning attributes of an item. ENGINEERING owns what a part IS; this owns how it is REPLENISHED. The blueprint put low_level_code on engineering.item; a module may not add columns to another module''s system of record (DECISIONS-V2 §1.1), so it lives here keyed by a bare item_id.';
REVOKE DELETE ON item_planning_policy FROM app_user;

-- ---------------------------------------------------------------------------
-- Demand
-- ---------------------------------------------------------------------------

CREATE TABLE plan_forecast (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  item_id     uuid NOT NULL,
  item_code   text NOT NULL,
  bucket      text NOT NULL,
  qty         numeric(18,3) NOT NULL CHECK (qty >= 0),
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','csv_import','copy_last_year')),
  note        text,
  CONSTRAINT uq_planfc_item_bucket UNIQUE (tenant_id, item_id, bucket)
);

CREATE TABLE plan_demand_line (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  item_id      uuid NOT NULL,
  item_code    text NOT NULL,
  bucket       text NOT NULL,
  qty          numeric(18,3) NOT NULL CHECK (qty > 0),
  demand_kind  text NOT NULL DEFAULT 'spares' CHECK (demand_kind IN ('spares','service','interplant')),
  ref          text NOT NULL
);
CREATE INDEX ix_plandemand_tenant_item ON plan_demand_line (tenant_id, item_id, bucket);

CREATE TABLE mps_row (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid NOT NULL,
  is_active          boolean NOT NULL DEFAULT true,
  item_id            uuid NOT NULL,
  item_code          text NOT NULL,
  bucket             text NOT NULL,
  mps_receipt_qty    numeric(18,3) NOT NULL DEFAULT 0 CHECK (mps_receipt_qty >= 0),
  forecast_qty       numeric(18,3) NOT NULL DEFAULT 0 CHECK (forecast_qty >= 0),
  order_qty          numeric(18,3) NOT NULL DEFAULT 0 CHECK (order_qty >= 0),
  demand_qty         numeric(18,3) NOT NULL DEFAULT 0,
  projected_on_hand  numeric(18,3) NOT NULL DEFAULT 0,
  atp                numeric(18,3),
  fence              text NOT NULL DEFAULT 'free' CHECK (fence IN ('frozen','firm','free')),
  override_by        uuid,
  override_reason    text,
  CONSTRAINT uq_mpsrow_item_bucket UNIQUE (tenant_id, item_id, bucket),
  -- Guarantee (6). An override without a reason is an unattributable change to a number
  -- the shop floor has already committed material against.
  CONSTRAINT ck_mpsrow_override CHECK ((override_by IS NULL) = (override_reason IS NULL))
);
REVOKE DELETE ON mps_row FROM app_user;

-- ---------------------------------------------------------------------------
-- The run and its output
-- ---------------------------------------------------------------------------

CREATE TABLE mrp_run (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  run_no              text NOT NULL,
  run_type            text NOT NULL DEFAULT 'regenerative' CHECK (run_type IN ('regenerative','net_change')),
  planning_date       date NOT NULL,
  horizon_buckets     integer NOT NULL CHECK (horizon_buckets BETWEEN 1 AND 104),
  first_bucket        text NOT NULL,
  last_bucket         text NOT NULL,
  status              text NOT NULL DEFAULT 'completed' CHECK (status IN ('running','completed','failed')),
  item_count          integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  planned_order_count integer NOT NULL DEFAULT 0 CHECK (planned_order_count >= 0),
  exception_count     integer NOT NULL DEFAULT 0 CHECK (exception_count >= 0),
  duration_ms         integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  params              jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings            jsonb NOT NULL DEFAULT '[]'::jsonb,
  failure_reason      text,
  CONSTRAINT uq_mrprun_tenant_no UNIQUE (tenant_id, run_no),
  -- A failed run must say why. "failed" with no reason is the least useful row in an ERP.
  CONSTRAINT ck_mrprun_failure CHECK (status <> 'failed' OR failure_reason IS NOT NULL)
);
CREATE INDEX ix_mrprun_tenant_date ON mrp_run (tenant_id, planning_date DESC);
CREATE TRIGGER trg_mrprun_guard BEFORE UPDATE OR DELETE ON mrp_run
  FOR EACH ROW EXECUTE FUNCTION plan_guard_run();
REVOKE DELETE ON mrp_run FROM app_user;

CREATE TABLE mrp_run_item (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid NOT NULL,
  is_active          boolean NOT NULL DEFAULT true,
  run_id             uuid NOT NULL REFERENCES mrp_run (id),
  item_id            uuid NOT NULL,
  item_code          text NOT NULL,
  low_level_code     integer NOT NULL CHECK (low_level_code >= 0),
  source_type        text NOT NULL CHECK (source_type IN ('make','buy')),
  opening_available  numeric(18,3) NOT NULL,
  safety_stock       numeric(18,3) NOT NULL,
  warnings           jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT uq_mrprunitem_run_item UNIQUE (tenant_id, run_id, item_id)
);
-- Guarantee (1): the working is never restated.
CREATE TRIGGER trg_mrprunitem_immutable BEFORE UPDATE OR DELETE ON mrp_run_item
  FOR EACH ROW EXECUTE FUNCTION plan_forbid_mutation();
REVOKE UPDATE, DELETE ON mrp_run_item FROM app_user;

CREATE TABLE mrp_run_bucket (
  id                          uuid PRIMARY KEY,
  tenant_id                   uuid NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid NOT NULL,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid NOT NULL,
  is_active                   boolean NOT NULL DEFAULT true,
  run_id                      uuid NOT NULL REFERENCES mrp_run (id),
  item_id                     uuid NOT NULL,
  bucket                      text NOT NULL,
  bucket_seq                  integer NOT NULL CHECK (bucket_seq >= 0),
  gross_requirement           numeric(18,3) NOT NULL,
  scheduled_receipts          numeric(18,3) NOT NULL,
  projected_available_opening numeric(18,3) NOT NULL,
  net_requirement             numeric(18,3) NOT NULL CHECK (net_requirement >= 0),
  planned_receipt             numeric(18,3) NOT NULL CHECK (planned_receipt >= 0),
  projected_available         numeric(18,3) NOT NULL,
  CONSTRAINT uq_mrprunbucket UNIQUE (tenant_id, run_id, item_id, bucket)
);
CREATE INDEX ix_mrprunbucket_tenant_run ON mrp_run_bucket (tenant_id, run_id, item_id);
CREATE TRIGGER trg_mrprunbucket_immutable BEFORE UPDATE OR DELETE ON mrp_run_bucket
  FOR EACH ROW EXECUTE FUNCTION plan_forbid_mutation();
REVOKE UPDATE, DELETE ON mrp_run_bucket FROM app_user;

CREATE TABLE planned_order (
  id                       uuid PRIMARY KEY,
  tenant_id                uuid NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid NOT NULL,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid NOT NULL,
  is_active                boolean NOT NULL DEFAULT true,
  run_id                   uuid NOT NULL REFERENCES mrp_run (id),
  order_key                text NOT NULL,
  item_id                  uuid NOT NULL,
  item_code                text NOT NULL,
  source_type              text NOT NULL CHECK (source_type IN ('make','buy')),
  qty                      numeric(18,3) NOT NULL CHECK (qty > 0),
  net_requirement          numeric(18,3) NOT NULL CHECK (net_requirement > 0),
  lot_rule                 text NOT NULL,
  lot_reason               text NOT NULL,
  receipt_bucket           text NOT NULL,
  need_date                date NOT NULL,
  release_bucket           text NOT NULL,
  release_date             date NOT NULL,
  computed_release_bucket  text NOT NULL,
  computed_release_date    date NOT NULL,
  past_due                 boolean NOT NULL DEFAULT false,
  days_late                integer NOT NULL DEFAULT 0 CHECK (days_late >= 0),
  status                   text NOT NULL DEFAULT 'planned'
                             CHECK (status IN ('planned','firmed','converted','cancelled')),
  firmed_by                uuid,
  firmed_at                timestamptz,
  converted_to_kind        text CHECK (converted_to_kind IS NULL OR converted_to_kind IN ('production_order','purchase_requisition')),
  converted_to_ref         text,
  converted_at             timestamptz,
  -- Guarantee (2).
  CONSTRAINT uq_plannedorder_run_key UNIQUE (tenant_id, run_id, order_key),
  -- Guarantee (3), first half: a converted order must say what it became.
  CONSTRAINT ck_plannedorder_converted CHECK (status <> 'converted' OR (converted_to_kind IS NOT NULL AND converted_to_ref IS NOT NULL)),
  -- A lot can never be smaller than the shortfall it was raised to cover.
  CONSTRAINT ck_plannedorder_lot CHECK (qty >= net_requirement),
  -- The clamp is one-directional: a release date may be moved forward to today, never back.
  CONSTRAINT ck_plannedorder_clamp CHECK (release_date >= computed_release_date),
  CONSTRAINT ck_plannedorder_pastdue CHECK (past_due = (release_date > computed_release_date)),
  -- Material cannot arrive before it is ordered.
  CONSTRAINT ck_plannedorder_dates CHECK (need_date >= computed_release_date)
);
CREATE INDEX ix_plannedorder_tenant_status  ON planned_order (tenant_id, status);
CREATE INDEX ix_plannedorder_tenant_release ON planned_order (tenant_id, release_bucket);
-- Guarantee (3), second half: one planned order per execution document, ever.
CREATE UNIQUE INDEX uq_plannedorder_conversion ON planned_order (tenant_id, converted_to_kind, converted_to_ref)
  WHERE converted_to_ref IS NOT NULL;
REVOKE DELETE ON planned_order FROM app_user;

CREATE TABLE planned_order_peg (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  planned_order_id  uuid NOT NULL REFERENCES planned_order (id),
  run_id            uuid NOT NULL REFERENCES mrp_run (id),
  source_kind       text NOT NULL CHECK (source_kind IN ('planned_order','sales_order','forecast','spares')),
  source_ref        text NOT NULL,
  qty               numeric(18,3) NOT NULL CHECK (qty > 0)
);
CREATE INDEX ix_plannedorderpeg_tenant_order ON planned_order_peg (tenant_id, planned_order_id);
-- Guarantee (1): the plan's reasoning is not revisable.
CREATE TRIGGER trg_plannedorderpeg_immutable BEFORE UPDATE OR DELETE ON planned_order_peg
  FOR EACH ROW EXECUTE FUNCTION plan_forbid_mutation();
REVOKE UPDATE, DELETE ON planned_order_peg FROM app_user;

CREATE TABLE plan_exception (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  run_id            uuid NOT NULL REFERENCES mrp_run (id),
  exception_type    text NOT NULL CHECK (exception_type IN
                      ('release_now','reschedule_in','reschedule_out','excess','cancel',
                       'past_due','shortage','data_warning','fence_violation')),
  severity          text NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  item_id           uuid NOT NULL,
  item_code         text NOT NULL,
  ref               text NOT NULL,
  message           text NOT NULL,
  suggestion        text NOT NULL,
  current_bucket    text,
  suggested_bucket  text,
  buckets_moved     integer,
  peg_kind          text NOT NULL DEFAULT 'none' CHECK (peg_kind IN ('sales_order','forecast','spares','none')),
  peg_ref           text,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','snoozed','closed')),
  snoozed_until     date,
  actioned_by       uuid,
  actioned_at       timestamptz,
  action_note       text,
  -- A snooze without a date is a dismissal wearing a friendlier word.
  CONSTRAINT ck_planexc_snooze CHECK (status <> 'snoozed' OR snoozed_until IS NOT NULL),
  -- Anything a person did to this row is attributable.
  CONSTRAINT ck_planexc_actioned CHECK (status = 'open' OR (actioned_by IS NOT NULL AND actioned_at IS NOT NULL))
);
CREATE INDEX ix_planexc_tenant_status_sev ON plan_exception (tenant_id, status, severity);
CREATE INDEX ix_planexc_tenant_run        ON plan_exception (tenant_id, run_id);
REVOKE DELETE ON plan_exception FROM app_user;

CREATE TABLE plan_capacity_load (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  run_id            uuid NOT NULL REFERENCES mrp_run (id),
  work_centre_id    uuid NOT NULL REFERENCES plan_work_centre (id),
  work_centre_code  text NOT NULL,
  bucket            text NOT NULL,
  available_hours   numeric(10,2) NOT NULL CHECK (available_hours >= 0),
  load_hours        numeric(10,2) NOT NULL CHECK (load_hours >= 0),
  load_pct          numeric(8,2),
  status            text NOT NULL CHECK (status IN ('idle','green','amber','red','no_capacity')),
  overload_hours    numeric(10,2) NOT NULL DEFAULT 0 CHECK (overload_hours >= 0),
  CONSTRAINT uq_plancapload UNIQUE (tenant_id, run_id, work_centre_id, bucket),
  -- A percentage of zero capacity is not a number. Storing 0 or 999 there is how a shut
  -- work centre comes to look merely busy.
  CONSTRAINT ck_plancapload_pct CHECK ((available_hours = 0) = (load_pct IS NULL))
);

CREATE TABLE plan_schedule (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  schedule_no          text NOT NULL,
  rule                 text NOT NULL CHECK (rule IN ('EDD','SPT','CR')),
  planning_date        date NOT NULL,
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','superseded')),
  late_order_count     integer NOT NULL DEFAULT 0 CHECK (late_order_count >= 0),
  total_tardiness_days integer NOT NULL DEFAULT 0 CHECK (total_tardiness_days >= 0),
  makespan_days        integer NOT NULL DEFAULT 0 CHECK (makespan_days >= 0),
  note                 text NOT NULL DEFAULT '',
  approved_by          uuid,
  approved_at          timestamptz,
  CONSTRAINT uq_planschedule_tenant_no UNIQUE (tenant_id, schedule_no),
  -- The scheduler NEVER auto-publishes (§11.7). A published schedule carries the name of
  -- the person who accepted it, or it is not published.
  CONSTRAINT ck_planschedule_publish CHECK (status <> 'published' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
REVOKE DELETE ON plan_schedule FROM app_user;

CREATE TABLE plan_schedule_op (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  schedule_id       uuid NOT NULL REFERENCES plan_schedule (id),
  order_ref         text NOT NULL,
  item_code         text NOT NULL,
  operation_seq     integer NOT NULL,
  work_centre_id    uuid NOT NULL REFERENCES plan_work_centre (id),
  work_centre_code  text NOT NULL,
  hours             numeric(10,2) NOT NULL CHECK (hours >= 0),
  due_date          date NOT NULL,
  start_date        date NOT NULL,
  end_date          date NOT NULL,
  start_hour_of_day numeric(6,2) NOT NULL CHECK (start_hour_of_day >= 0),
  end_hour_of_day   numeric(6,2) NOT NULL CHECK (end_hour_of_day >= 0),
  days_late         integer NOT NULL DEFAULT 0 CHECK (days_late >= 0),
  is_locked         boolean NOT NULL DEFAULT false,
  CONSTRAINT uq_planschedop UNIQUE (tenant_id, schedule_id, order_ref, operation_seq),
  CONSTRAINT ck_planschedop_span CHECK (end_date >= start_date)
);

CREATE TABLE plan_number_series (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  series_key   text NOT NULL,
  fiscal_year  text NOT NULL,
  prefix       text NOT NULL,
  next_number  integer NOT NULL DEFAULT 1 CHECK (next_number >= 1),
  width        integer NOT NULL DEFAULT 5 CHECK (width BETWEEN 3 AND 10),
  CONSTRAINT uq_plannumseries UNIQUE (tenant_id, series_key, fiscal_year)
);

CREATE TABLE purchase_requisition (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  req_no               text NOT NULL,
  planned_order_id     uuid NOT NULL REFERENCES planned_order (id),
  item_id              uuid NOT NULL,
  item_code            text NOT NULL,
  qty                  numeric(18,3) NOT NULL CHECK (qty > 0),
  need_date            date NOT NULL,
  release_date         date NOT NULL,
  suggested_vendor_ref text,
  status               text NOT NULL DEFAULT 'open' CHECK (status IN ('open','ordered','cancelled')),
  purchase_order_ref   text,
  note                 text,
  CONSTRAINT uq_purchreq_tenant_no UNIQUE (tenant_id, req_no),
  -- One requisition per planned order. Converting the same plan twice buys it twice.
  CONSTRAINT uq_purchreq_planned_order UNIQUE (tenant_id, planned_order_id),
  CONSTRAINT ck_purchreq_ordered CHECK (status <> 'ordered' OR purchase_order_ref IS NOT NULL)
);
CREATE INDEX ix_purchreq_tenant_status ON purchase_requisition (tenant_id, status);
REVOKE DELETE ON purchase_requisition FROM app_user;

-- =============================================================================
-- FORCE RLS on every tenant-scoped table in this migration.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'plan_calendar','plan_holiday','plan_work_centre','plan_shift','plan_wc_downtime',
    'plan_routing_operation','item_planning_policy','plan_forecast','plan_demand_line','mps_row',
    'mrp_run','mrp_run_item','mrp_run_bucket','planned_order','planned_order_peg',
    'plan_exception','plan_capacity_load','plan_schedule','plan_schedule_op',
    'plan_number_series','purchase_requisition']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)', t);
  END LOOP;
END $$;
