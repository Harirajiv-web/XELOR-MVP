-- CORRECTIONS — the columns that let a document be changed after someone has relied on it.
--
-- The system could create 222 kinds of thing and change almost none of them. That is not
-- the safe design it looks like: with no edit path, a wrong quantity gets fixed by
-- cancelling and re-keying, which loses the connection between the mistake and the fix far
-- more thoroughly than an edit ever would.
--
-- So documents may now be amended, and these four columns are what make an amendment a
-- fact about the business rather than an overwrite:
--
--   revision_no    starts at 0 on creation; every amendment increments it. The number a
--                  vendor quotes back at you when they ask which PO they are holding.
--   amended_at     when the most recent amendment happened.
--   amended_by     who made it.
--   amend_reason   why. NOT optional at the application layer for an amendment, and the
--                  single most useful column here — "changed 120 to 96" answers nothing
--                  that "customer reduced the call-off after the Chakan line stoppage"
--                  does not answer better.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH
--
-- No column is added to journal_voucher, journal_line, grn, stock_ledger or stock_entry_line.
-- Those are corrected by a reversing entry, never by an amendment, and giving them an
-- `amend_reason` would imply an edit path that must not exist (§3, eight-year retention;
-- §5, the single stock write path). The absence is the design.
--
-- The before/after values are NOT stored here. They go into `audit_log` as a hash-chained
-- change set (§3.3), so the trail of what a document used to say is tamper-evident and
-- lives in one place rather than being scattered across a shadow column on every table.

-- ---------------------------------------------------------------------------
-- 1. The amendable documents.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  amendable text[] := ARRAY[
    'sales_order',
    'purchase_order',
    'production_order',
    'qms_inspection',
    'maintenance_request',
    'maintenance_work_order',
    'expense_claim',
    'travel_request',
    'purchase_expense',
    'leave_application',
    'csp_ticket',
    'csp_spare_request'
  ];
BEGIN
  FOREACH t IN ARRAY amendable LOOP
    -- Skip a table this deployment does not have rather than failing the migration:
    -- the module set is not identical across every environment, and a missing optional
    -- module must not block a platform-wide capability.
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipping %, not present in this database', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS revision_no integer NOT NULL DEFAULT 0', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS amended_at timestamptz', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS amended_by uuid', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS amend_reason text', t);

    -- A revision number that can go backwards is worse than none: it makes "which version
    -- is the vendor holding" unanswerable. Non-negative is checked; monotonicity is
    -- enforced by the update trigger below.
    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS ck_%s_revision_no_non_negative', t, t);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT ck_%s_revision_no_non_negative CHECK (revision_no >= 0)', t, t);

    -- An amendment without a reason is an overwrite with extra steps. The application
    -- requires the reason; this makes the pair inseparable at the row level, so a direct
    -- SQL edit cannot leave a revision behind with nothing explaining it.
    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS ck_%s_amendment_is_explained', t, t);
    EXECUTE format($f$
      ALTER TABLE %I ADD CONSTRAINT ck_%s_amendment_is_explained
      CHECK (
        revision_no = 0
        OR (amended_at IS NOT NULL AND amended_by IS NOT NULL
            AND amend_reason IS NOT NULL AND length(btrim(amend_reason)) >= 3)
      )
    $f$, t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. A revision number only ever goes up, and only by one.
-- ---------------------------------------------------------------------------
-- Two amendments racing on the same document would otherwise both read revision 3, both
-- write 4, and one operator's stated reason would vanish with no trace that it ever
-- existed. The application takes a row lock; this is the backstop for anything that does
-- not, including a direct psql session.
CREATE OR REPLACE FUNCTION document_revision_monotonic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.revision_no < OLD.revision_no THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'revision_no cannot go backwards on %s (% -> %)',
        TG_TABLE_NAME, OLD.revision_no, NEW.revision_no);
  END IF;

  IF NEW.revision_no > OLD.revision_no + 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'revision_no must advance one at a time on %s (% -> %); a skipped revision means a lost amendment',
        TG_TABLE_NAME, OLD.revision_no, NEW.revision_no);
  END IF;

  RETURN NEW;
END $$;

DO $$
DECLARE
  t text;
  amendable text[] := ARRAY[
    'sales_order', 'purchase_order', 'production_order', 'qms_inspection',
    'maintenance_request', 'maintenance_work_order', 'expense_claim',
    'travel_request', 'purchase_expense', 'leave_application',
    'csp_ticket', 'csp_spare_request'
  ];
BEGIN
  FOREACH t IN ARRAY amendable LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_revision_monotonic ON %I', t, t);
    EXECUTE format($f$
      CREATE TRIGGER trg_%s_revision_monotonic
      BEFORE UPDATE OF revision_no ON %I
      FOR EACH ROW EXECUTE FUNCTION document_revision_monotonic()
    $f$, t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Finding amended documents cheaply.
-- ---------------------------------------------------------------------------
-- "What has been changed since it was approved" is the question an auditor and a plant
-- head both ask, and without an index it is a sequential scan of the busiest tables in the
-- product. Partial, because revision 0 is the overwhelming majority of every table and
-- indexing it would pay for rows nobody is looking for. Leads with tenant_id per §5.
DO $$
DECLARE
  t text;
  amendable text[] := ARRAY[
    'sales_order', 'purchase_order', 'production_order', 'qms_inspection',
    'maintenance_request', 'maintenance_work_order', 'expense_claim',
    'travel_request', 'purchase_expense', 'leave_application',
    'csp_ticket', 'csp_spare_request'
  ];
BEGIN
  FOREACH t IN ARRAY amendable LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS ix_%s_amended ON %I (tenant_id, amended_at DESC) WHERE revision_no > 0',
      t, t);
  END LOOP;
END $$;
