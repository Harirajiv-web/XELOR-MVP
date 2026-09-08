-- THE ORDER FULFILMENT MISSION.
--
-- The Agent OS already runs bounded graphs well: it validates them, executes ready nodes in
-- parallel, checkpoints every wave, pauses for approval and refuses side effects without
-- approval ancestry. What it could not do is OWN something. Its graphs are reviews — they
-- start, they finish inside a minute, and nothing survives them.
--
-- A customer commitment is not a review. It lasts weeks, it waits on other people, it is
-- interrupted by events nobody scheduled, and the plan that was correct on Monday is wrong
-- by Thursday because a supplier called. The unit of durability therefore has to be the
-- COMMITMENT, not the run.
--
-- Five tables, and the split between them is the architecture:
--
--   mission        the objective. One per sales order. Long-lived, and the only thing that
--                  knows what "done" means.
--   plan_version   an immutable, frozen, executable proposal. Never edited — superseded.
--                  An approval binds to a DIGEST of one of these, so an approval cannot
--                  survive the plan it approved being quietly altered underneath it.
--   step           what the mission did, in order, with its evidence and its reasoning.
--                  This is what the investor watches stream past.
--   action         a governed change to business state, with its precondition, its result
--                  and its independently-verified postcondition kept apart. "Executed" and
--                  "verified" are different columns because they are different claims.
--   event          something that happened. Internal or simulated-external. Carries its own
--                  impact analysis, so "we saw it and it did not matter" is recorded rather
--                  than indistinguishable from never having seen it.

-- ------------------------------------------------------------------- mission ----
CREATE TABLE IF NOT EXISTS fulfilment_mission (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  mission_no           text NOT NULL,
  sales_order_id       uuid NOT NULL,
  so_no                text NOT NULL,
  customer_name        text NOT NULL,
  objective            jsonb NOT NULL,
  promised_date        date NOT NULL,
  target_margin_pct    numeric(9,4) NOT NULL,
  autonomy_tier        text NOT NULL DEFAULT 'A3',
  status               text NOT NULL DEFAULT 'planning',
  stage                text NOT NULL DEFAULT 'intake',
  current_plan_version integer NOT NULL DEFAULT 0,
  delivery_confidence  numeric(5,2),
  forecast_margin_pct  numeric(9,4),
  forecast_date        date,
  next_event_at        timestamptz,
  waiting_reason       text,
  outcome              jsonb,
  closed_at            timestamptz,
  CONSTRAINT uq_fmission_tenant_no UNIQUE (tenant_id, mission_no),
  -- One live mission per order. Two missions pursuing the same commitment would each
  -- reserve stock and raise supply for the whole quantity.
  CONSTRAINT ck_fmission_status CHECK (status IN
    ('planning','awaiting_approval','executing','waiting','replanning','completed','failed','cancelled')),
  CONSTRAINT ck_fmission_autonomy CHECK (autonomy_tier IN ('A0','A1','A2','A3','A4','A5'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fmission_one_live_per_order
  ON fulfilment_mission (tenant_id, sales_order_id)
  WHERE status NOT IN ('completed','failed','cancelled');

CREATE INDEX IF NOT EXISTS ix_fmission_tenant_status ON fulfilment_mission (tenant_id, status);

-- -------------------------------------------------------------- plan version ----
CREATE TABLE IF NOT EXISTS fulfilment_plan_version (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid NOT NULL,
  is_active          boolean NOT NULL DEFAULT true,
  mission_id         uuid NOT NULL,
  version_no         integer NOT NULL,
  strategy_key       text NOT NULL,
  strategy_name      text NOT NULL,
  digest             text NOT NULL,
  candidates         jsonb NOT NULL,
  chosen             jsonb NOT NULL,
  rationale          text NOT NULL,
  trade_off_weights  jsonb NOT NULL,
  hard_constraints   jsonb NOT NULL,
  feasible           boolean NOT NULL,
  critique           jsonb,
  expected_date      date NOT NULL,
  expected_cost      numeric(18,2) NOT NULL,
  expected_margin_pct numeric(9,4) NOT NULL,
  confidence         numeric(5,2) NOT NULL,
  requires_approval  boolean NOT NULL DEFAULT false,
  superseded_at      timestamptz,
  supersede_reason   text,
  CONSTRAINT uq_fplan_mission_version UNIQUE (tenant_id, mission_id, version_no)
);

CREATE INDEX IF NOT EXISTS ix_fplan_tenant_mission ON fulfilment_plan_version (tenant_id, mission_id);

-- ---------------------------------------------------------------------- step ----
CREATE TABLE IF NOT EXISTS fulfilment_step (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  mission_id      uuid NOT NULL,
  plan_version_id uuid,
  seq             integer NOT NULL,
  step_key        text NOT NULL,
  title           text NOT NULL,
  kind            text NOT NULL,
  agent_key       text NOT NULL,
  question        text,
  status          text NOT NULL DEFAULT 'pending',
  started_at      timestamptz,
  ended_at        timestamptz,
  duration_ms     integer,
  evidence        jsonb,
  findings        jsonb,
  narration       text,
  confidence      numeric(5,2),
  refused_reason  text,
  CONSTRAINT uq_fstep_mission_seq UNIQUE (tenant_id, mission_id, seq),
  CONSTRAINT ck_fstep_kind CHECK (kind IN
    ('observe','diagnose','plan','critique','authorize','act','verify','wait','replan','close')),
  CONSTRAINT ck_fstep_status CHECK (status IN
    ('pending','running','succeeded','failed','skipped','waiting_approval'))
);

CREATE INDEX IF NOT EXISTS ix_fstep_tenant_mission ON fulfilment_step (tenant_id, mission_id, seq);

-- -------------------------------------------------------------------- action ----
CREATE TABLE IF NOT EXISTS fulfilment_action (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  mission_id        uuid NOT NULL,
  plan_version_id   uuid NOT NULL,
  step_id           uuid,
  action_no         text NOT NULL,
  action_type       text NOT NULL,
  target_domain     text NOT NULL,
  title             text NOT NULL,
  params            jsonb NOT NULL,
  digest            text NOT NULL,
  autonomy_tier     text NOT NULL,
  status            text NOT NULL DEFAULT 'proposed',
  precondition      jsonb,
  approval_id       uuid,
  idempotency_key   text NOT NULL,
  executed_at       timestamptz,
  result            jsonb,
  result_ref        text,
  -- Kept apart from `result` on purpose. A capability returning 200 says the call
  -- succeeded; it does not say the world changed. Reporting success from the first is how
  -- a mission claims to have reserved stock that was never reserved.
  postcondition     jsonb,
  verified_at       timestamptz,
  verified          boolean,
  failure_reason    text,
  compensated_at    timestamptz,
  compensation_ref  text,
  CONSTRAINT uq_faction_tenant_no UNIQUE (tenant_id, action_no),
  CONSTRAINT uq_faction_idempotency UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT ck_faction_status CHECK (status IN
    ('proposed','checked','refused','awaiting_approval','authorized','executing',
     'executed','verified','failed','compensated')),
  -- A verified action must say when. Marking `verified` without a timestamp is the shape a
  -- careless retry takes.
  CONSTRAINT ck_faction_verified_has_time CHECK (verified IS NULL OR verified_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ix_faction_tenant_mission ON fulfilment_action (tenant_id, mission_id);

-- --------------------------------------------------------------------- event ----
CREATE TABLE IF NOT EXISTS fulfilment_event (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  mission_id    uuid,
  event_key     text NOT NULL,
  event_name    text NOT NULL,
  source        text NOT NULL,
  simulated     boolean NOT NULL DEFAULT false,
  payload       jsonb NOT NULL,
  impact        jsonb,
  disposition   text,
  observed_at   timestamptz NOT NULL DEFAULT now(),
  handled_at    timestamptz,
  -- The same supplier message delivered twice must wake the mission once. At-least-once
  -- delivery plus an idempotent key is the only combination that yields exactly-once effect.
  CONSTRAINT uq_fevent_tenant_key UNIQUE (tenant_id, event_key),
  CONSTRAINT ck_fevent_disposition CHECK (disposition IS NULL OR disposition IN
    ('no_impact','deterministic','replan','escalate'))
);

CREATE INDEX IF NOT EXISTS ix_fevent_tenant_mission ON fulfilment_event (tenant_id, mission_id);

-- ------------------------------------------------------------------ approval ----
CREATE TABLE IF NOT EXISTS fulfilment_approval (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  mission_id       uuid NOT NULL,
  plan_version_id  uuid NOT NULL,
  approval_no      text NOT NULL,
  title            text NOT NULL,
  risk             text NOT NULL,
  autonomy_tier    text NOT NULL,
  brief            jsonb NOT NULL,
  plan_digest      text NOT NULL,
  requested_at     timestamptz NOT NULL DEFAULT now(),
  requested_by     uuid NOT NULL,
  expires_at       timestamptz,
  decision         text,
  decided_at       timestamptz,
  decided_by       uuid,
  decision_note    text,
  CONSTRAINT uq_fapproval_tenant_no UNIQUE (tenant_id, approval_no),
  CONSTRAINT ck_fapproval_decision CHECK (decision IS NULL OR decision IN ('approved','rejected','expired')),
  -- An approval is an attributable grant of authority. A decision with nobody's name on it
  -- is not one, and this is the constraint that stops a resume path writing one by accident.
  CONSTRAINT ck_fapproval_decided_is_attributed
    CHECK (decision IS NULL OR (decided_at IS NOT NULL AND decided_by IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS ix_fapproval_tenant_mission ON fulfilment_approval (tenant_id, mission_id);

-- ----------------------------------------------------------------- RLS + grants ----
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fulfilment_mission','fulfilment_plan_version','fulfilment_step',
    'fulfilment_action','fulfilment_event','fulfilment_approval'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_%I ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY rls_%I ON %I USING (tenant_id = current_setting(''app.current_tenant'', true)::uuid) '
      'WITH CHECK (tenant_id = current_setting(''app.current_tenant'', true)::uuid)', t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO app_user', t);
  END LOOP;
END $$;

-- A plan version is a frozen proposal. Superseding it is a status change; rewriting its
-- numbers is forging the record an approval was granted against.
CREATE OR REPLACE FUNCTION fulfilment_plan_version_is_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.digest IS DISTINCT FROM OLD.digest
     OR NEW.chosen IS DISTINCT FROM OLD.chosen
     OR NEW.candidates IS DISTINCT FROM OLD.candidates
     OR NEW.expected_cost IS DISTINCT FROM OLD.expected_cost
     OR NEW.expected_margin_pct IS DISTINCT FROM OLD.expected_margin_pct
     OR NEW.version_no IS DISTINCT FROM OLD.version_no THEN
    RAISE EXCEPTION
      'plan version %.% is frozen; publish a new version instead of editing this one',
      OLD.mission_id, OLD.version_no
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fplan_immutable ON fulfilment_plan_version;
CREATE TRIGGER trg_fplan_immutable
  BEFORE UPDATE ON fulfilment_plan_version
  FOR EACH ROW EXECUTE FUNCTION fulfilment_plan_version_is_immutable();
