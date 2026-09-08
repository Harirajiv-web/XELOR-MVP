-- =============================================================================
-- 0007_ai_action_log_chain — make ai_action_log genuinely hash-chained (§4.3, §5.2).
--
-- ai_action_log was already append-only (trigger + REVOKE from 0000) and RLS-fenced,
-- but only stored per-call content hashes. DECISIONS-V2 calls it "hash-chained", so
-- we add the same per-tenant chain the audit_log and workflow_action use: a monotonic
-- seq, prev_hash and hash, so no AI record can be inserted, edited or dropped without
-- breaking the chain. Also fold in the operational fields a real record needs
-- (model, tier, token usage, degraded flag). The table is empty at this migration.
-- =============================================================================

ALTER TABLE ai_action_log
  ADD COLUMN seq           bigint,
  ADD COLUMN prev_hash     char(64),
  ADD COLUMN hash          char(64),
  ADD COLUMN model         text,
  ADD COLUMN tier          text,
  ADD COLUMN input_tokens  bigint  NOT NULL DEFAULT 0,
  ADD COLUMN output_tokens bigint  NOT NULL DEFAULT 0,
  ADD COLUMN degraded      boolean NOT NULL DEFAULT false;

-- Chain columns are mandatory going forward (table is empty, so no backfill needed).
ALTER TABLE ai_action_log
  ALTER COLUMN seq       SET NOT NULL,
  ALTER COLUMN prev_hash SET NOT NULL,
  ALTER COLUMN hash      SET NOT NULL;

-- Per-tenant monotonic chain order — the tamper-evidence anchor.
ALTER TABLE ai_action_log
  ADD CONSTRAINT uq_ai_action_tenant_seq UNIQUE (tenant_id, seq);
