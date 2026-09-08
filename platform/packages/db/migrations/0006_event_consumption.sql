-- =============================================================================
-- 0006_event_consumption — the consumer-side dedup ledger for the outbox relay.
--
-- The relay (DECISIONS-V2 §5.4) ships each outbox_event row onto Valkey/BullMQ
-- AT LEAST ONCE. A subscriber records one row here per (consumer, event) it has
-- handled. A redelivered event collides on the unique key and is skipped, so the
-- side effect fires exactly once:  at-least-once delivery + this ledger = exactly-once EFFECT.
--
-- Tenant-scoped and under FORCE RLS like every other business table; append-only
-- (a consumption record is a fact — never edited or removed).
-- =============================================================================

CREATE TABLE event_consumption (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  consumer     text NOT NULL,            -- logical subscriber name (e.g. demo-logger)
  event_id     uuid NOT NULL,            -- the outbox_event id being acknowledged
  event_name   text NOT NULL,            -- module.entity.verb.vN
  consumed_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_event_consumption UNIQUE (tenant_id, consumer, event_id)
);
ALTER TABLE event_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_consumption FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON event_consumption
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
-- Append-only: the app role inserts consumption facts, never mutates them.
REVOKE UPDATE, DELETE ON event_consumption FROM app_user;
