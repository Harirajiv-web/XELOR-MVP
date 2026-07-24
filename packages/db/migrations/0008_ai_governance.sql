-- =============================================================================
-- 0008_ai_governance — the AI governance controls (DECISIONS-V2 §4.3).
-- Checked BEFORE every model call by the router; every change is reason-required
-- and audited. Three thin, tenant-scoped tables:
--   ai_feature_state : the KILL SWITCH — per (tenant, feature); feature '*' = whole tenant
--   ai_opt_out       : DPDP tenant OPT-OUT of AI processing
--   ai_token_ledger  : daily TOKEN BUDGET + usage, per (tenant, day)
-- =============================================================================

CREATE TABLE ai_feature_state (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  feature_key text NOT NULL,               -- a registry key, or '*' for all features
  killed      boolean NOT NULL DEFAULT false,
  reason      text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  CONSTRAINT uq_ai_feature_state UNIQUE (tenant_id, feature_key)
);
ALTER TABLE ai_feature_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_feature_state FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_feature_state
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE TABLE ai_opt_out (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  opted_out   boolean NOT NULL DEFAULT false,
  reason      text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  CONSTRAINT uq_ai_opt_out UNIQUE (tenant_id)
);
ALTER TABLE ai_opt_out ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_opt_out FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_opt_out
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE TABLE ai_token_ledger (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  budget_day  date NOT NULL,
  used_tokens bigint NOT NULL DEFAULT 0,
  daily_limit bigint NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ai_token_ledger UNIQUE (tenant_id, budget_day)
);
ALTER TABLE ai_token_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_token_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_token_ledger
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---- grant the governance-management permission to the demo admin roles ----
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission) VALUES
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','ai.governance.manage'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','ai.governance.manage')
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;
