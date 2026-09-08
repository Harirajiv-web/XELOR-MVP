-- =============================================================================
-- 0047 — document_series was fenced against the application itself.
--
-- Migration 0046 gave the table a row-level policy reading
--
--     tenant_id = current_setting('app.tenant_id', true)::uuid
--
-- but the setting this platform sets is `app.current_tenant` (packages/db/src/client.ts,
-- `set_config('app.current_tenant', …, true)` inside withTenant). Nothing sets
-- `app.tenant_id`, so the expression evaluated to NULL for every row, the policy matched
-- nothing, and every series row was invisible to the app.
--
-- The failure mode is worth recording because it was not the obvious one. Nothing errored.
-- The counter UPDATE simply matched zero rows, NumberingService did exactly what it was
-- written to do about that — refuse rather than invent a number — and every create endpoint
-- returned a clean 422 saying the series was not configured. It looked like missing seed
-- data. The seed data was there and correctly tenanted; it was the fence that was wrong.
--
-- AND THE RLS GATE PASSED THE WHOLE TIME. rls-check asserted ENABLE + FORCE + at least one
-- policy, and this table had all three. It never read what the policy SAID. A table fenced
-- by a policy that names a setting nobody sets is fenced against everyone, application
-- included — perfectly secure and perfectly useless — and the check reported it as OK. The
-- gate now compares the policy expression against the platform setting, so the next one of
-- these fails in CI instead of at a demo.
-- =============================================================================

DROP POLICY IF EXISTS p_document_series ON document_series;

CREATE POLICY tenant_isolation ON document_series
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- NULLIF over a bare cast, matching every other table: an unset GUC reads as the empty
-- string, and ''::uuid raises rather than returning NULL. The difference is a policy that
-- denies quietly versus a query that explodes.

DO $$
DECLARE q text;
BEGIN
  SELECT pg_get_expr(polqual, polrelid) INTO q
    FROM pg_policy WHERE polrelid = 'document_series'::regclass LIMIT 1;
  IF q IS NULL OR q NOT LIKE '%app.current_tenant%' THEN
    RAISE EXCEPTION 'document_series policy still does not name app.current_tenant: %', q;
  END IF;
  RAISE NOTICE 'document_series policy now reads: %', q;
END $$;
