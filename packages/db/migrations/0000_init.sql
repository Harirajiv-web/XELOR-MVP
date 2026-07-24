-- =============================================================================
-- 0000_init — platform tables + GENERAL first slice.
-- Runs as the schema OWNER (indcore_owner). Encodes the binding conventions:
--   §5.1 columns · §1.2/§1.6 FORCE RLS (fail closed) · §3.3 append-only audit ·
--   §1.1 intra-module FK only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Reusable RLS predicate: fence a row to the tenant GUC. NULLIF(...) makes an
-- UNSET tenant resolve to NULL -> matches nothing -> fail closed (never leak).
-- ---------------------------------------------------------------------------
-- (Inlined per-table below; kept identical everywhere so rls-check can assert it.)

-- ===================== PLATFORM =====================

-- Tenant registry — deliberately NOT tenant-scoped, NOT under RLS (§5.2).
CREATE TABLE tenant (
  id          uuid PRIMARY KEY,
  legal_name  text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON tenant TO app_user;
-- App never writes the registry (platform/admin does, as owner).
REVOKE INSERT, UPDATE, DELETE ON tenant FROM app_user;

-- Transactional outbox (§5.4).
CREATE TABLE outbox_event (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  name         text NOT NULL,
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts     bigint NOT NULL DEFAULT 0
);
CREATE INDEX ix_outbox_unpublished ON outbox_event (tenant_id, created_at) WHERE published_at IS NULL;
ALTER TABLE outbox_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON outbox_event
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- Hash-chained, append-only audit log (§3.3 / MCA Rule 11(g)).
CREATE TABLE audit_log (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  seq         bigint NOT NULL,
  actor_id    uuid NOT NULL,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  data        jsonb NOT NULL,
  at          timestamptz NOT NULL DEFAULT now(),
  prev_hash   char(64) NOT NULL,
  hash        char(64) NOT NULL,
  CONSTRAINT uq_audit_tenant_seq UNIQUE (tenant_id, seq)
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_log
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
-- The audit log has NO disable switch (§3.3). This trigger blocks every UPDATE and
-- DELETE unconditionally — not even super-admin edits history without dropping the
-- trigger, which is a reviewed schema change, not a runtime action.
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (MCA Rule 11(g)); % is forbidden', TG_OP;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_audit_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
-- Belt-and-braces: the app role cannot even attempt UPDATE/DELETE.
REVOKE UPDATE, DELETE ON audit_log FROM app_user;

-- AI action log (§4.3) — logged for every AI call, append-only.
CREATE TABLE ai_action_log (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  feature_key text NOT NULL,
  actor_id    uuid NOT NULL,
  input_hash  char(64) NOT NULL,
  output_hash char(64),
  decision    jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ai_action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_action_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_action_log
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
CREATE TRIGGER trg_ai_action_append_only
  BEFORE UPDATE OR DELETE ON ai_action_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
REVOKE UPDATE, DELETE ON ai_action_log FROM app_user;

-- ===================== GENERAL (first slice) =====================

CREATE TABLE company (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  legal_name  text NOT NULL,
  cin         text
);
CREATE INDEX ix_company_tenant ON company (tenant_id, id);
ALTER TABLE company ENABLE ROW LEVEL SECURITY;
ALTER TABLE company FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON company
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
-- Masters are never hard-deleted (§5.1); use is_active. App role: no DELETE.
REVOKE DELETE ON company FROM app_user;

CREATE TABLE gst_registration (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  company_id  uuid NOT NULL,
  gstin       text NOT NULL,
  state_code  text NOT NULL,
  place_name  text NOT NULL,
  -- Intra-module FK is allowed (§1.1); a cross-module ref would be a bare uuid.
  CONSTRAINT fk_gstreg_company FOREIGN KEY (company_id) REFERENCES company (id) ON DELETE RESTRICT,
  CONSTRAINT uq_gstreg_tenant_gstin UNIQUE (tenant_id, gstin)
);
CREATE INDEX ix_gstreg_tenant_company ON gst_registration (tenant_id, company_id);
ALTER TABLE gst_registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE gst_registration FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON gst_registration
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON gst_registration FROM app_user;
