-- =============================================================================
-- 0035 — the append-only guard names the table it is actually guarding.
--
-- `audit_log_append_only()` is shared by four append-only tables, and it hard-coded one
-- table's name into the message. Deleting from `stock_ledger` reported:
--
--     ERROR:  audit_log is append-only (MCA Rule 11(g)); DELETE is forbidden
--
-- which sends whoever hit it to the wrong table, and to a compliance rule that has nothing
-- to do with the stock ledger. This was found while building PLANNING, when the Module 13
-- verification tried to level stock by deleting ledger rows — the refusal was correct and
-- the explanation was not.
--
-- The MCA Rule 11(g) citation is kept for `audit_log`, where it is the actual reason, and
-- every other table now gets its own name. Nothing about what is REFUSED changes; only
-- what the refusal says.
-- =============================================================================

CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  -- The statutory citation belongs to the audit trail specifically: MCA Rule 11(g)
  -- requires an unalterable record for eight years.
  IF TG_TABLE_NAME = 'audit_log' THEN
    RAISE EXCEPTION 'audit_log is append-only (MCA Rule 11(g)); % is forbidden', TG_OP
      USING ERRCODE = 'restrict_violation';
  END IF;
  RAISE EXCEPTION '% is append-only; % is forbidden', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
