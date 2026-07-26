-- =============================================================================
-- 0043_aiops — AI OPERATIONS (Module 16): the control plane for the AI itself.
--
-- The organising principle, and the reason for most of what follows:
-- **THE AI CANNOT SHIP ITSELF.** Every promotion, rollout and rollback is a human action
-- with a name, a reason and an audit row — the same rule Administration applies to access,
-- applied to the thing that would otherwise change what the system says to everybody.
--
-- EIGHT guarantees are made HERE, in the database:
--
--  (1) A PRODUCTION PROMPT NEEDS A SECOND PERSON. A CHECK asserts that a promoted version
--      has an approver AND that the approver is not the author. This is the control people
--      ask to skip on a Friday; it stays, because the whole value of it is that it binds
--      when it is inconvenient.
--
--  (2) ONE PRODUCTION VERSION PER FEATURE. A partial unique index. Two "current" prompts is
--      a system where nobody can answer which one produced an answer.
--
--  (3) A PROMPT IS CONTENT-ADDRESSED AND UNIQUE BY CONTENT. UNIQUE (tenant, feature,
--      content_hash) — the same text cannot exist as two versions, so "which prompt
--      produced this?" has exactly one answer.
--
--  (4) AN EVAL RUN IS BOUND TO THE CONTENT IT TESTED. `prompt_content_hash` is required for
--      any run that can gate a promotion. A pass that covers a different version proves
--      nothing about this one, and a gate that can be satisfied by a stale pass is not a
--      gate.
--
--  (5) EVERY ROUTING CHAIN ENDS DETERMINISTICALLY. Enforced by a trigger on activation:
--      the last step must be `deterministic` and must describe what it does. A chain that
--      can be exhausted is a feature that stops working when somebody else's API does, and
--      a plant cannot stop taking receipts for that.
--
--  (6) A PRICE IS EFFECTIVE-DATED AND NEVER RESTATED. `ai_model_price` is trigger-blocked
--      against UPDATE and DELETE — a change is a new row. Otherwise a call made in May is
--      re-costed at September's rate and the report stops matching the invoice.
--
--  (7) A KILL SWITCH THAT IS ENGAGED SAYS WHO AND WHY. Both required by a CHECK. An
--      emergency control with nobody's name on it is one nobody dares release.
--
--  (8) A GUARDRAIL EVENT NEVER CONTAINS THE THING IT CAUGHT. Enforced by convention in the
--      writer and stated here: `detail` holds field NAMES and digests. A redaction log
--      containing the redacted value is a second copy of the problem, kept for years.
--
-- Note what is deliberately NOT enforced: a feature may sit at `off` forever with no eval
-- run. Requiring a passing gate to keep a feature switched OFF would be a control that
-- punishes caution.
-- =============================================================================

CREATE OR REPLACE FUNCTION aiops_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is effective-dated and append-only; supersede the row with a new effective_from', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TABLE ai_provider (
  id                            uuid PRIMARY KEY,
  tenant_id                     uuid NOT NULL,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  created_by                    uuid NOT NULL,
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  updated_by                    uuid NOT NULL,
  is_active                     boolean NOT NULL DEFAULT true,
  code                          text NOT NULL,
  name                          text NOT NULL,
  kind                          text NOT NULL CHECK (kind IN ('hosted','edge','stub')),
  region                        text NOT NULL,
  endpoint_ref                  text,
  credential_ref                text,
  status                        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','retired')),
  training_exclusion_confirmed  boolean NOT NULL DEFAULT false,
  CONSTRAINT uq_aiprovider_tenant_code UNIQUE (tenant_id, code)
);
COMMENT ON COLUMN ai_provider.training_exclusion_confirmed IS
  'Contractual assertion that our data — golden sets especially — is excluded from provider training. Recorded rather than assumed.';

CREATE TABLE ai_model (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  provider_id     uuid NOT NULL REFERENCES ai_provider (id),
  code            text NOT NULL,
  display_name    text NOT NULL,
  tier            text NOT NULL DEFAULT 'small' CHECK (tier IN ('small','premium','local')),
  context_tokens  integer CHECK (context_tokens IS NULL OR context_tokens > 0),
  status          text NOT NULL DEFAULT 'active',
  CONSTRAINT uq_aimodel_tenant_code UNIQUE (tenant_id, code)
);

CREATE TABLE ai_model_price (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  model_code      text NOT NULL,
  input_per_1k    numeric(12,4) NOT NULL CHECK (input_per_1k >= 0),
  output_per_1k   numeric(12,4) NOT NULL CHECK (output_per_1k >= 0),
  currency        text NOT NULL DEFAULT 'INR',
  effective_from  date NOT NULL,
  effective_to    date,
  source_note     text NOT NULL,
  CONSTRAINT ck_aiprice_window CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_aiprice_tenant_model ON ai_model_price (tenant_id, model_code, effective_from DESC);
-- Guarantee (6): a price change is a NEW row. Restating one re-costs history.
CREATE TRIGGER trg_aiprice_append_only BEFORE UPDATE OR DELETE ON ai_model_price
  FOR EACH ROW EXECUTE FUNCTION aiops_forbid_mutation();
REVOKE UPDATE, DELETE ON ai_model_price FROM app_user;

CREATE TABLE ai_route_policy (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  feature_key      text NOT NULL,
  version          integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  allowed_regions  jsonb NOT NULL DEFAULT '[]'::jsonb,
  activated_by     uuid,
  activated_at     timestamptz,
  CONSTRAINT uq_airoute_feature_version UNIQUE (tenant_id, feature_key, version),
  CONSTRAINT ck_airoute_activated CHECK ((status = 'active') = (activated_at IS NOT NULL AND activated_by IS NOT NULL))
);
-- One active chain per feature; two would make "where did this call go?" unanswerable.
CREATE UNIQUE INDEX uq_airoute_one_active ON ai_route_policy (tenant_id, feature_key) WHERE status = 'active';

CREATE TABLE ai_route_step (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  policy_id             uuid NOT NULL REFERENCES ai_route_policy (id),
  step_order            integer NOT NULL CHECK (step_order >= 1),
  kind                  text NOT NULL CHECK (kind IN ('model','deterministic')),
  provider_code         text,
  model_code            text,
  region                text,
  fallback_description  text,
  CONSTRAINT uq_airoutestep UNIQUE (tenant_id, policy_id, step_order),
  CONSTRAINT ck_airoutestep_model CHECK (kind <> 'model' OR (provider_code IS NOT NULL AND model_code IS NOT NULL)),
  -- "Falls back" is not an answer to "what happens when the model is off?".
  CONSTRAINT ck_airoutestep_fallback CHECK (kind <> 'deterministic' OR fallback_description IS NOT NULL)
);

-- Guarantee (5): a chain may only be ACTIVATED if its last step is deterministic.
CREATE OR REPLACE FUNCTION aiops_route_must_end_deterministic() RETURNS trigger AS $$
DECLARE last_kind text;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  SELECT kind INTO last_kind FROM ai_route_step
   WHERE policy_id = NEW.id ORDER BY step_order DESC LIMIT 1;
  IF last_kind IS NULL THEN
    RAISE EXCEPTION 'routing chain for % has no steps', NEW.feature_key USING ERRCODE = 'check_violation';
  END IF;
  IF last_kind <> 'deterministic' THEN
    RAISE EXCEPTION 'the last step of %''s routing chain must be deterministic — a chain that can be exhausted is a feature that stops working when somebody else''s API does', NEW.feature_key
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_airoute_deterministic_tail BEFORE INSERT OR UPDATE ON ai_route_policy
  FOR EACH ROW EXECUTE FUNCTION aiops_route_must_end_deterministic();

CREATE TABLE ai_prompt_version (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  feature_key          text NOT NULL,
  version              integer NOT NULL CHECK (version >= 1),
  stage                text NOT NULL DEFAULT 'draft'
                         CHECK (stage IN ('draft','staged','production','rolled_back','retired')),
  template             text NOT NULL CHECK (length(trim(template)) > 0),
  declared_variables   jsonb NOT NULL DEFAULT '[]'::jsonb,
  output_schema        text,
  content_hash         char(64) NOT NULL,
  author_id            uuid NOT NULL,
  approver_id          uuid,
  promoted_at          timestamptz,
  rolled_back_at       timestamptz,
  rollback_reason      text,
  change_summary       text,
  CONSTRAINT uq_aiprompt_feature_version UNIQUE (tenant_id, feature_key, version),
  -- Guarantee (3): the same text cannot exist twice, so "which prompt produced this?" has
  -- exactly one answer.
  CONSTRAINT uq_aiprompt_hash UNIQUE (tenant_id, feature_key, content_hash),
  -- Guarantee (1): a second person, and not the author. This is the control people ask to
  -- skip on a Friday.
  CONSTRAINT ck_aiprompt_promoted CHECK (
    stage <> 'production' OR (approver_id IS NOT NULL AND approver_id <> author_id AND promoted_at IS NOT NULL)),
  CONSTRAINT ck_aiprompt_rollback CHECK ((rolled_back_at IS NULL) = (rollback_reason IS NULL))
);
-- Guarantee (2): one production version per feature.
CREATE UNIQUE INDEX uq_aiprompt_one_production ON ai_prompt_version (tenant_id, feature_key) WHERE stage = 'production';
CREATE INDEX ix_aiprompt_stage ON ai_prompt_version (tenant_id, feature_key, stage);
REVOKE DELETE ON ai_prompt_version FROM app_user;

CREATE TABLE ai_eval_dataset (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid NOT NULL,
  is_active          boolean NOT NULL DEFAULT true,
  feature_key        text NOT NULL,
  dataset_version    text NOT NULL,
  description        text NOT NULL,
  case_count         integer NOT NULL DEFAULT 0 CHECK (case_count >= 0),
  training_excluded  boolean NOT NULL DEFAULT true,
  CONSTRAINT uq_aidataset UNIQUE (tenant_id, feature_key, dataset_version),
  -- Golden sets are EVALUATION artefacts. A golden set used for training is a golden set
  -- the model has memorised, and the gate it feeds stops measuring anything.
  CONSTRAINT ck_aidataset_training CHECK (training_excluded = true)
);

CREATE TABLE ai_eval_run (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  feature_key           text NOT NULL,
  dataset_version       text NOT NULL,
  prompt_content_hash   char(64),
  metric                text NOT NULL,
  baseline_score        numeric(6,4) NOT NULL,
  candidate_score       numeric(6,4) NOT NULL,
  tolerance             numeric(6,4) NOT NULL,
  must_pass_failures    jsonb NOT NULL DEFAULT '[]'::jsonb,
  verdict               text NOT NULL CHECK (verdict IN ('pass','fail')),
  case_count            integer NOT NULL DEFAULT 0,
  failure_clusters      jsonb NOT NULL DEFAULT '[]'::jsonb,
  run_by                uuid NOT NULL,
  run_at                timestamptz NOT NULL DEFAULT now(),
  -- Guarantee (4): a PASS must name the content it tested, or it cannot gate anything.
  CONSTRAINT ck_aievalrun_bound CHECK (verdict <> 'pass' OR prompt_content_hash IS NOT NULL),
  -- The verdict must agree with its own numbers: a "pass" with must-pass failures, or one
  -- that did not beat the baseline by the stated tolerance, is a gate that is not a gate.
  CONSTRAINT ck_aievalrun_consistent CHECK (
    verdict <> 'pass'
    OR (jsonb_array_length(must_pass_failures) = 0 AND candidate_score >= baseline_score + tolerance))
);
CREATE INDEX ix_aievalrun_feature ON ai_eval_run (tenant_id, feature_key, run_at DESC);
REVOKE UPDATE, DELETE ON ai_eval_run FROM app_user;

CREATE TABLE ai_guardrail_event (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  feature_key     text NOT NULL,
  correlation_id  text NOT NULL,
  stage           text NOT NULL CHECK (stage IN ('pre','post')),
  code            text NOT NULL,
  severity        text NOT NULL CHECK (severity IN ('block','degrade','note')),
  message         text NOT NULL,
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_aiguard_tenant_feature ON ai_guardrail_event (tenant_id, feature_key, created_at DESC);
COMMENT ON COLUMN ai_guardrail_event.detail IS
  'Guarantee (8): field NAMES and digests only. A redaction log containing the redacted value is a second copy of the problem, kept for years.';
REVOKE UPDATE, DELETE ON ai_guardrail_event FROM app_user;

CREATE TABLE ai_hitl_item (
  id                      uuid PRIMARY KEY,
  tenant_id               uuid NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid NOT NULL,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid NOT NULL,
  is_active               boolean NOT NULL DEFAULT true,
  feature_key             text NOT NULL,
  correlation_id          text NOT NULL,
  doc_type                text,
  doc_ref                 text,
  reason                  text NOT NULL CHECK (reason IN ('low_confidence','guardrail_degrade','policy')),
  confidence              numeric(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  proposed                jsonb NOT NULL,
  status                  text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','corrected','rejected')),
  reviewed_by             uuid,
  reviewed_at             timestamptz,
  correction              jsonb,
  promoted_to_golden_set  boolean NOT NULL DEFAULT false,
  -- A review is attributable, and a "corrected" item must say what was corrected —
  -- otherwise the feedback loop has nothing to learn from.
  CONSTRAINT ck_aihitl_reviewed CHECK (status = 'open' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT ck_aihitl_correction CHECK (status <> 'corrected' OR correction IS NOT NULL)
);
CREATE INDEX ix_aihitl_tenant_status ON ai_hitl_item (tenant_id, status, feature_key);

CREATE TABLE ai_call_metric (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  feature_key           text NOT NULL,
  correlation_id        text NOT NULL,
  action_log_seq        integer,
  provider_code         text,
  model_code            text,
  region                text,
  prompt_content_hash   char(64),
  input_tokens          integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens         integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  input_cost            numeric(14,4) NOT NULL DEFAULT 0 CHECK (input_cost >= 0),
  output_cost           numeric(14,4) NOT NULL DEFAULT 0 CHECK (output_cost >= 0),
  total_cost            numeric(14,4) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  price_effective_from  date,
  latency_ms            integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  degraded              boolean NOT NULL DEFAULT false,
  used_fallback         boolean NOT NULL DEFAULT false,
  accepted              boolean,
  called_at             timestamptz NOT NULL DEFAULT now(),
  -- One metric row per call, so it reconciles 1:1 with the action log rather than
  -- approximately.
  CONSTRAINT uq_aimetric_correlation UNIQUE (tenant_id, correlation_id),
  CONSTRAINT ck_aimetric_total CHECK (total_cost = input_cost + output_cost),
  -- A costed call must say which price produced the number. Zero with no price is the
  -- honest "we do not know"; non-zero with no price is a number nobody can reconcile.
  CONSTRAINT ck_aimetric_priced CHECK (total_cost = 0 OR price_effective_from IS NOT NULL)
);
CREATE INDEX ix_aimetric_tenant_feature ON ai_call_metric (tenant_id, feature_key, called_at DESC);

CREATE TABLE ai_feature_rollout (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  feature_key       text NOT NULL,
  stage             text NOT NULL DEFAULT 'off'
                      CHECK (stage IN ('off','internal','pilot','general','rolled_back')),
  changed_by        uuid,
  changed_at        timestamptz NOT NULL DEFAULT now(),
  reason            text,
  last_eval_run_id  uuid REFERENCES ai_eval_run (id),
  CONSTRAINT uq_airollout_feature UNIQUE (tenant_id, feature_key),
  -- A feature that went dark with no note gets turned back on by somebody who does not
  -- know why it went dark.
  CONSTRAINT ck_airollout_rolled_back CHECK (stage <> 'rolled_back' OR reason IS NOT NULL)
);

CREATE TABLE ai_kill_switch (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  feature_key  text,
  engaged      boolean NOT NULL DEFAULT false,
  engaged_by   uuid,
  engaged_at   timestamptz,
  reason       text,
  released_by  uuid,
  released_at  timestamptz,
  -- Guarantee (7). An emergency control with nobody's name on it is one nobody dares release.
  CONSTRAINT ck_aikill_engaged CHECK (engaged = false OR (engaged_by IS NOT NULL AND engaged_at IS NOT NULL AND reason IS NOT NULL))
);
CREATE UNIQUE INDEX uq_aikill_scope ON ai_kill_switch (tenant_id, coalesce(feature_key, ''));

CREATE TABLE ai_kill_switch_probe (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  feature_key   text NOT NULL,
  refused       boolean NOT NULL,
  elapsed_ms    integer NOT NULL CHECK (elapsed_ms >= 0),
  within_bound  boolean NOT NULL,
  message       text NOT NULL,
  probed_by     uuid NOT NULL,
  probed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_aiprobe_tenant_time ON ai_kill_switch_probe (tenant_id, probed_at DESC);
COMMENT ON TABLE ai_kill_switch_probe IS
  'The drill, recorded. A kill switch nobody has tried is a belief, and the probe is a release gate rather than a task.';
REVOKE UPDATE, DELETE ON ai_kill_switch_probe FROM app_user;

CREATE TABLE ai_incident (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  incident_no      text NOT NULL,
  feature_key      text,
  severity         text NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  title            text NOT NULL,
  description      text NOT NULL,
  detected_at      timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','mitigated','resolved')),
  action_taken     text,
  resolved_at      timestamptz,
  resolution_note  text,
  CONSTRAINT uq_aiincident_no UNIQUE (tenant_id, incident_no),
  CONSTRAINT ck_aiincident_resolved CHECK ((resolved_at IS NULL) = (resolution_note IS NULL))
);

CREATE TABLE ai_drift_scan (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  feature_key    text NOT NULL,
  baseline_from  date NOT NULL,
  baseline_to    date NOT NULL,
  current_from   date NOT NULL,
  current_to     date NOT NULL,
  findings       jsonb NOT NULL DEFAULT '[]'::jsonb,
  attributed_to  text,
  headline       text NOT NULL,
  scanned_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_aidrift_windows CHECK (baseline_to >= baseline_from AND current_to >= current_from)
);
CREATE INDEX ix_aidrift_tenant_feature ON ai_drift_scan (tenant_id, feature_key, scanned_at DESC);

CREATE TABLE ai_embedding_index (
  id                     uuid PRIMARY KEY,
  tenant_id              uuid NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid NOT NULL,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             uuid NOT NULL,
  is_active              boolean NOT NULL DEFAULT true,
  index_name             text NOT NULL,
  entity_type            text NOT NULL,
  model_code             text NOT NULL,
  dimensions             integer NOT NULL CHECK (dimensions > 0),
  vector_count           integer NOT NULL DEFAULT 0 CHECK (vector_count >= 0),
  last_rebuilt_at        timestamptz,
  leak_probe_passed_at   timestamptz,
  CONSTRAINT uq_aiindex_name UNIQUE (tenant_id, index_name)
);
COMMENT ON COLUMN ai_embedding_index.leak_probe_passed_at IS
  'Set by the ANN leak probe. NULL means never probed, which is not the same as safe — a nearest-neighbour search that crosses tenants returns a competitor''s part names as "similar items".';

-- =============================================================================
-- FORCE RLS on every tenant-scoped table in this migration.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_provider','ai_model','ai_model_price','ai_route_policy','ai_route_step',
    'ai_prompt_version','ai_eval_dataset','ai_eval_run','ai_guardrail_event','ai_hitl_item',
    'ai_call_metric','ai_feature_rollout','ai_kill_switch','ai_kill_switch_probe',
    'ai_incident','ai_drift_scan','ai_embedding_index']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)', t);
  END LOOP;
END $$;
