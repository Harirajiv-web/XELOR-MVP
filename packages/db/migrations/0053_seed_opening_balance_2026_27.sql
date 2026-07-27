-- =============================================================================
-- 0053_seed_opening_balance_2026_27 — Trishul's opening position at 01-Apr-2026.
--
-- Accounts' primary screen was rendering empty on the demo date, because the seeded
-- universe contained a chart of accounts and no balances. "Correctly empty" is not a
-- distinction anybody makes while looking at it.
--
-- This is the entry every company makes on the first day of a financial year: the position
-- it carried in. It is dated 01-Apr-2026, the first day of FY 2026-27, and it lands in the
-- 2026-04 period, which the seed marks CLOSED — correctly, because April is over. The entry
-- is a record of something that happened while April was open, not a new posting; the
-- application would rightly refuse to post into a closed period today, and that check is not
-- being bypassed so much as pre-dated.
--
-- ---------------------------------------------------------------------------
-- DERIVED versus CHOSEN — read this before trusting any figure below
-- ---------------------------------------------------------------------------
-- DERIVED from data already in the database:
--   · every inventory RATE — each item is valued at the `standard_cost` on its own row in
--     the item master, so this entry moves if that master moves, and no valuation is
--     restated here that the product does not already hold;
--   · the split between raw material and finished goods — taken from `item.item_type`, not
--     from a judgement about which account each belongs in;
--   · RETAINED EARNINGS — the arithmetic balancing figure, computed in SQL from the other
--     five lines. It is not a chosen number and it is not an assertion about past profit;
--     it is what the opening position leaves over, which is what reserves ARE in an opening
--     balance sheet.
--
-- CHOSEN, because nothing in the database could supply them:
--   · the inventory QUANTITIES (rates are real; how many of each were on hand is not
--     recorded anywhere before this date);
--   · plant and machinery at written-down value — Rs 3.50 crore;
--   · the bank balance — Rs 42.00 lakh;
--   · issued share capital — Rs 1.00 crore.
-- These are sized for what Trishul demonstrably is: two plants, thirteen people on roll in
-- the seeded employee master, a payroll of roughly Rs 1.1 crore a year, and a precision
-- pump-component line. A manufacturer of that shape turns over somewhere around Rs 12 crore
-- and carries plant of a few crore. They are plausible, they are internally consistent, and
-- they are NOT measurements. A future reader must not treat them as evidence of anything.
--
-- ---------------------------------------------------------------------------
-- What this entry deliberately does NOT contain
-- ---------------------------------------------------------------------------
-- No trade receivables, no trade payables, no GST balances, no statutory dues. Every one of
-- those is backed by a subledger or a return — AR open items, vendor bills, a GSTR filing —
-- and the seeded universe has none of them dated before 01-Apr-2026. A general-ledger
-- balance with no detail behind it is a reconciliation break on day one: the ledger would
-- claim receivables that `GET /accounts/customers/:id/outstanding` cannot find. A smaller
-- balance sheet that can be drilled into everywhere beats a fuller one that cannot be.
--
-- Nor does it double-count. Every transactional row in the seeded universe is dated AFTER
-- 01-Apr-2026, so July's receipts and dispatches sit on top of this position rather than
-- instead of it. Opening inventory is a chosen opening position, explicitly NOT derived from
-- today's stock balances — deriving it from those would restate July's movements as if they
-- had been on hand in April, which is exactly the double-count to avoid.
--
-- Trishul only. Kaveri ElectroFab stays minimal: it exists to prove tenant isolation leaks
-- nothing, and giving it a balance sheet dilutes the only job it has.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The one account the chart was missing. A manufacturer with two plants owns machines;
-- there was nowhere to put them. Net book value in a single account, because depreciation
-- is not modelled anywhere in this build and an accumulated-depreciation account with
-- nothing ever posted to it would be furniture.
-- ---------------------------------------------------------------------------
INSERT INTO gl_account (id, tenant_id, created_by, updated_by, code, name, account_type, is_postable) VALUES
 ('0192a8c0-0053-7000-8000-000000000001','0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '1110','Plant and Machinery (net)','asset',true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- The opening stock, valued off the item master.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TEMPORARY VIEW ob_item AS
SELECT i.item_code, i.item_type, cq.qty, i.standard_cost,
       ROUND(cq.qty * i.standard_cost, 2) AS value
  FROM (VALUES
          -- castings and fasteners
          ('CST-CAS50',   480),
          ('CST-IMP6',    520),
          ('RAW-BLT-M8', 24000),
          -- machined and bought-out components
          ('CMP-CAS50',   150),
          ('CMP-IMP6',    180),
          ('CMP-SEAL20',  600),
          ('CMP-SFT20',   220),
          -- finished pumps awaiting dispatch
          ('PMP-CP50',    165)
       ) AS cq(item_code, qty)
  JOIN item i ON i.item_code = cq.item_code
             AND i.tenant_id = '0192a8c0-0000-7000-8000-000000000001';

-- MRO consumables are excluded on purpose: maintenance spares are Maintenance's stores, and
-- folding them into "Inventory - Raw Material" would misstate what that account means.

-- Fail LOUDLY if the item master has moved. A missing item would otherwise shrink inventory
-- silently and be absorbed by the balancing figure, leaving an entry that still foots and no
-- longer means what this comment says it means.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM ob_item;
  IF n <> 8 THEN
    RAISE EXCEPTION
      'opening balance: expected 8 seeded items to value, found % — the item master has changed and the quantities above need revisiting', n;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- The six lines. Retained earnings is computed, never typed, so the entry cannot fail to
-- foot however the derived figures move.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TEMPORARY VIEW ob_line AS
WITH inv AS (
  SELECT
    COALESCE(SUM(value) FILTER (WHERE item_type IN ('raw_material','component')), 0)::numeric(18,2) AS rm,
    COALESCE(SUM(value) FILTER (WHERE item_type = 'finished_good'), 0)::numeric(18,2) AS fg
  FROM ob_item
),
chosen AS (
  SELECT 35000000.00::numeric(18,2) AS plant,   -- Rs 3.50 crore   CHOSEN
          4200000.00::numeric(18,2) AS bank,    -- Rs 42.00 lakh   CHOSEN
         10000000.00::numeric(18,2) AS capital  -- Rs 1.00 crore   CHOSEN
)
SELECT 1 AS line_no, '1110' AS account_code, c.plant AS debit, 0.00::numeric(18,2) AS credit,
       'Plant and machinery at written-down value, Pune-Chakan and Coimbatore' AS memo
  FROM chosen c
UNION ALL
SELECT 2, '1210', c.bank, 0.00, 'Balance on the current account at 01-Apr-2026' FROM chosen c
UNION ALL
SELECT 3, '1410', i.rm, 0.00, 'Castings, fasteners and machined components at standard cost' FROM inv i
UNION ALL
SELECT 4, '1430', i.fg, 0.00, 'Finished CP-50 pumps awaiting dispatch, at standard cost' FROM inv i
UNION ALL
SELECT 5, '3010', 0.00, c.capital, 'Issued and paid-up share capital' FROM chosen c
UNION ALL
SELECT 6, '3110', 0.00, (c.plant + c.bank + i.rm + i.fg - c.capital),
       'Reserves carried forward — the balancing figure of the opening position'
  FROM chosen c CROSS JOIN inv i;

-- ---------------------------------------------------------------------------
-- The voucher. Its own OB series, so an opening balance can never collide with a journal
-- the application allocates from the JV series, and so it is recognisable as what it is.
-- `source_module` stays NULL: no sibling module produced this, a human did.
-- ---------------------------------------------------------------------------
INSERT INTO journal_voucher (id, tenant_id, created_by, updated_by, voucher_no, voucher_type,
                             posting_date, period_id, narration, status, posting_mode,
                             idempotency_key, total_debit, total_credit)
SELECT
  '0192a8c0-0053-7100-8000-000000000001',
  '0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0000-7000-8000-0000000000ff',
  'OB-2627-00001',
  'opening_balance',
  DATE '2026-04-01',
  '0192a8c0-0023-7000-8000-000000000004',   -- period 2026-04
  'Opening balances carried forward into FY 2026-27',
  'posted',
  'manual',
  'opening-balance:2026-27',
  t.total_debit, t.total_credit
FROM (
  SELECT SUM(debit) AS total_debit, SUM(credit) AS total_credit, count(*) AS n FROM ob_line
) t
-- `n > 0` keeps a re-run from inserting a voucher with NULL totals: an aggregate over no
-- rows still returns one row, and the guard below only stops the SECOND run.
WHERE t.n > 0
  AND NOT EXISTS (
    SELECT 1 FROM journal_voucher WHERE id = '0192a8c0-0053-7100-8000-000000000001'
  );

INSERT INTO journal_line (id, tenant_id, created_by, updated_by, voucher_id, line_no,
                          account_code, debit, credit, memo)
SELECT
  ('0192a8c0-0053-7200-8000-' || lpad(l.line_no::text, 12, '0'))::uuid,
  '0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0053-7100-8000-000000000001',
  l.line_no, l.account_code, l.debit, l.credit, l.memo
FROM ob_line l
WHERE NOT EXISTS (
  SELECT 1 FROM journal_line WHERE voucher_id = '0192a8c0-0053-7100-8000-000000000001'
);

DROP VIEW IF EXISTS ob_line;
DROP VIEW IF EXISTS ob_item;
