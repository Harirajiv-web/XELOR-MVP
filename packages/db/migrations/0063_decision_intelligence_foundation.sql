-- =============================================================================
-- 0063 — Cross-industry Decision Intelligence foundation.
--
-- These are overlay records, not another ERP ledger. Source modules retain ownership of
-- orders, material, machines, inspections and finance. The evidence table stores only the
-- relationship and provenance used by a decision; the outcome table prevents estimated
-- value from being presented as verified customer value.
-- =============================================================================

CREATE TABLE decision_evidence_link (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  decision_key    text NOT NULL,
  mission_run_id  uuid REFERENCES agent_run (id),
  relation_type   text NOT NULL,
  source_domain   text NOT NULL,
  source_type     text NOT NULL,
  source_id       text NOT NULL,
  source_ref      text,
  target_domain   text NOT NULL,
  target_type     text NOT NULL,
  target_id       text NOT NULL,
  target_ref      text,
  observed_at     timestamptz NOT NULL,
  confidence      numeric(5,4) NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  evidence        jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_decisionevidence_relationship UNIQUE
    (tenant_id, decision_key, relation_type, source_type, source_id, target_type, target_id)
);
CREATE INDEX ix_decisionevidence_tenant_decision
  ON decision_evidence_link (tenant_id, decision_key);
CREATE INDEX ix_decisionevidence_tenant_source
  ON decision_evidence_link (tenant_id, source_domain, source_type, source_id);

CREATE TABLE decision_outcome_metric (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  decision_key          text NOT NULL,
  mission_run_id        uuid REFERENCES agent_run (id),
  action_dispatch_id    uuid REFERENCES agent_action_dispatch (id),
  metric_key            text NOT NULL,
  label                 text NOT NULL,
  unit                  text NOT NULL,
  baseline_value        numeric(20,4),
  target_value          numeric(20,4),
  observed_value        numeric(20,4),
  estimated_value       numeric(20,2),
  verified_value        numeric(20,2),
  verification_status   text NOT NULL DEFAULT 'unverified'
                          CHECK (verification_status IN ('unverified','measuring','verified','disputed')),
  attribution_status    text NOT NULL DEFAULT 'not_assessed'
                          CHECK (attribution_status IN ('not_assessed','partial','supported','rejected')),
  verification_method   text,
  verified_by           uuid,
  verified_at           timestamptz,
  evidence              jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_decisionoutcome_metric UNIQUE (tenant_id, decision_key, metric_key),
  CONSTRAINT ck_decisionoutcome_verification CHECK (
    (verification_status = 'verified' AND verified_by IS NOT NULL AND verified_at IS NOT NULL
      AND observed_value IS NOT NULL AND verified_value IS NOT NULL)
    OR verification_status <> 'verified'
  )
);
CREATE INDEX ix_decisionoutcome_tenant_status
  ON decision_outcome_metric (tenant_id, verification_status, created_at DESC);
CREATE INDEX ix_decisionoutcome_tenant_run
  ON decision_outcome_metric (tenant_id, mission_run_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['decision_evidence_link','decision_outcome_metric']
  LOOP
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
