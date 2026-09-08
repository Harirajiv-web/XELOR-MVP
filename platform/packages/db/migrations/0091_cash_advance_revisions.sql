-- 0091 — `cash_advance` joins the amendable documents.
--
-- Missed in 0089 because the advance's amendable state is not the obvious one. A REQUESTED
-- advance is a draft and needs nothing; a DISBURSED one is money that has left the account
-- and is corrected by a refund. The gap is the state between them: an APPROVED advance is a
-- commitment somebody has agreed to and not yet paid, so changing the amount is an
-- amendment — it needs a reason, a revision and a fresh approval, exactly like an approved
-- purchase order.
--
-- Without these columns the edit service has nowhere to record that, and the policy would
-- have had to pretend an approved advance is uneditable. Bending the rule to fit the schema
-- is the wrong direction; this is the schema catching up to the rule.
ALTER TABLE cash_advance ADD COLUMN IF NOT EXISTS revision_no integer NOT NULL DEFAULT 0;
ALTER TABLE cash_advance ADD COLUMN IF NOT EXISTS amended_at timestamptz;
ALTER TABLE cash_advance ADD COLUMN IF NOT EXISTS amended_by uuid;
ALTER TABLE cash_advance ADD COLUMN IF NOT EXISTS amend_reason text;

ALTER TABLE cash_advance DROP CONSTRAINT IF EXISTS ck_cash_advance_revision_no_non_negative;
ALTER TABLE cash_advance ADD CONSTRAINT ck_cash_advance_revision_no_non_negative CHECK (revision_no >= 0);

ALTER TABLE cash_advance DROP CONSTRAINT IF EXISTS ck_cash_advance_amendment_is_explained;
ALTER TABLE cash_advance ADD CONSTRAINT ck_cash_advance_amendment_is_explained
  CHECK (
    revision_no = 0
    OR (amended_at IS NOT NULL AND amended_by IS NOT NULL
        AND amend_reason IS NOT NULL AND length(btrim(amend_reason)) >= 3)
  );

-- Same monotonicity backstop as every other amendable document (function from 0089).
DROP TRIGGER IF EXISTS trg_cash_advance_revision_monotonic ON cash_advance;
CREATE TRIGGER trg_cash_advance_revision_monotonic
  BEFORE UPDATE OF revision_no ON cash_advance
  FOR EACH ROW EXECUTE FUNCTION document_revision_monotonic();

CREATE INDEX IF NOT EXISTS ix_cash_advance_amended
  ON cash_advance (tenant_id, amended_at DESC) WHERE revision_no > 0;
