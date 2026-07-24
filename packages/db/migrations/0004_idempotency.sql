-- =============================================================================
-- 0004_idempotency — the "no-duplicates notebook" (DECISIONS-V2 §5.3).
-- One row per (tenant, Idempotency-Key). A retried request with the same key
-- replays the saved answer instead of doing the work twice. Reusing a key for a
-- DIFFERENT request (different fingerprint) is rejected.
-- =============================================================================

CREATE TABLE idempotency_key (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  key             text NOT NULL,
  fingerprint     char(64) NOT NULL,
  status          text NOT NULL,          -- pending | completed
  response_status integer,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_idem_tenant_key UNIQUE (tenant_id, key)
);
ALTER TABLE idempotency_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_key FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON idempotency_key
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
-- app_user keeps INSERT/SELECT/UPDATE (claim, replay, finalize) and DELETE
-- (cleanup of a failed attempt so a retry can proceed) — not a statutory table.
