-- =============================================================================
-- 0009_company_trgm_index — index to make the dedup name-prefilter fast at scale.
-- pg_trgm is already enabled (00-init). A GIN trigram index lets the live duplicate
-- check use `similarity(legal_name, $1) > k` as an index-accelerated candidate filter
-- (general.master_dedup, baseline pg_trgm_gstin_exact). The pure TS scorer then makes
-- the final call, so live and eval stay identical.
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_company_legal_name_trgm
  ON company USING gin (legal_name gin_trgm_ops);
