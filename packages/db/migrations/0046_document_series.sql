-- =============================================================================
-- 0046 — document numbers people can read, and one the GST rules accept.
--
-- Fifteen call sites across six modules built their document number from the last segment
-- of the row's uuid: SO-358FA43E8CC9, MO-E888CA3EE91F, GRN-345C75F7FBFA. Unique, sortable,
-- and nothing ever failed — which is why it survived sixteen modules.
--
-- It is still wrong in three ways, one of them legal:
--
--   * CGST Rule 46(b) requires a tax invoice to carry a CONSECUTIVE serial number, not
--     exceeding sixteen characters, unique for a financial year. `INV-` plus twelve hex
--     digits is unique, is exactly sixteen characters, and is not consecutive. That is the
--     single number in this system where the format is a legal question.
--   * A document number gets read aloud. A storekeeper quotes a GRN over a telephone
--     against a paper challan; `GRN-345C75F7FBFA` cannot be dictated or eye-checked.
--   * It carries no financial year, so a register cannot be reconciled by reading it.
--
-- `document_series` holds one counter row per (tenant, doc type, FY). NumberingService
-- allocates with a single UPDATE … RETURNING inside the caller's transaction — a row lock
-- for concurrency, and rollback safety so a failed insert does not burn a number and leave
-- a permanent hole. Gaplessness is the requirement; a Postgres sequence cannot give it.
--
-- CSP and EXPENDITURE keep their own equivalent tables: both were built correctly and are
-- covered by their own tests, and Expenditure is on hold pending review. Folding them in
-- is a follow-up, not a prerequisite.
-- =============================================================================

CREATE TABLE IF NOT EXISTS document_series (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  doc_type     text NOT NULL,
  prefix       text NOT NULL,
  fy_code      text NOT NULL,
  width        smallint NOT NULL DEFAULT 5,
  next_no      integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_document_series UNIQUE (tenant_id, doc_type, fy_code),
  -- The series must not be able to produce a number Rule 46(b) would reject: prefix,
  -- separator, four-digit FY, separator, and `width` digits must stay within sixteen.
  CONSTRAINT ck_document_series_len CHECK (length(prefix) + 1 + 4 + 1 + width <= 16),
  CONSTRAINT ck_document_series_fy CHECK (fy_code ~ '^[0-9]{4}$'),
  CONSTRAINT ck_document_series_prefix CHECK (prefix ~ '^[A-Z][A-Z0-9]{0,5}$'),
  -- A counter that can be wound backwards is a counter that can re-issue an invoice
  -- number. It only ever goes up.
  CONSTRAINT ck_document_series_next CHECK (next_no >= 1)
);

CREATE INDEX IF NOT EXISTS ix_document_series_tenant ON document_series (tenant_id, doc_type, fy_code);

ALTER TABLE document_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_series FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_document_series ON document_series;
CREATE POLICY p_document_series ON document_series
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE OR REPLACE FUNCTION document_series_never_rewinds() RETURNS trigger AS $$
BEGIN
  IF NEW.next_no < OLD.next_no THEN
    RAISE EXCEPTION 'document series %/% cannot be wound back from % to % — a reissued invoice number is not a correction',
      OLD.doc_type, OLD.fy_code, OLD.next_no, NEW.next_no
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_document_series_never_rewinds ON document_series;
CREATE TRIGGER trg_document_series_never_rewinds
  BEFORE UPDATE ON document_series
  FOR EACH ROW EXECUTE FUNCTION document_series_never_rewinds();

-- ---------------------------------------------------------------------------
-- Seed a series per doc type, per tenant, for FY 2026-27 and 2027-28.
--
-- Both years now, not 2627 alone: the first document created after 31 Mar 2027 would
-- otherwise be refused, and "the ERP stopped taking orders on 1 April" is a memorable
-- way to learn that a series was never rolled.
-- ---------------------------------------------------------------------------

INSERT INTO document_series (id, tenant_id, created_by, updated_by, doc_type, prefix, fy_code, width, next_no)
SELECT gen_random_uuid(), t.tenant_id,
       '0192a8c0-0000-7000-8000-0000000000ff', '0192a8c0-0000-7000-8000-0000000000ff',
       d.doc_type, d.prefix, y.fy_code, 5, 1
FROM (VALUES
  ('sales_order','SO'),
  ('delivery_note','DN'),
  ('purchase_order','PO'),
  ('goods_receipt','GRN'),
  ('production_order','MO'),
  ('inspection','INS'),
  ('disposition','DSP'),
  ('voucher_journal','JV'),
  ('voucher_invoice','INV'),
  ('receipt','RCPT'),
  ('maintenance_request','MR'),
  ('maintenance_work_order','MWO'),
  ('payroll_run','PRUN')
) AS d(doc_type, prefix)
CROSS JOIN (VALUES ('2627'), ('2728')) AS y(fy_code)
CROSS JOIN (VALUES
  ('0192a8c0-0000-7000-8000-000000000001'::uuid),
  ('0192a8c0-0000-7000-8000-000000000002'::uuid)
) AS t(tenant_id)
ON CONFLICT (tenant_id, doc_type, fy_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Documents that already carry a uuid-derived number are LEFT ALONE, deliberately.
--
-- Rewriting them in place looked like the obvious next step and is a trap: these numbers
-- are referenced across modules as plain strings, not foreign keys — payroll_run
-- .gl_voucher_no points at journal_voucher.voucher_no, dispatch.stock_entry_ref at a stock
-- entry, maintenance_work_order.incident_ref at an inspection handoff. An UPDATE that
-- restates one side leaves the other pointing at a document that no longer answers to that
-- name, and nothing in the schema would object.
--
-- The rows carrying the old format are demo data, and the demo dataset is rebuilt through
-- the API rather than patched — which numbers every document through the series above by
-- construction, and exercises the real code path while doing it. Existing rows keep their
-- old labels until then; they are consistent with themselves, and the series starts clean
-- at 1 for each tenant and year.
-- ---------------------------------------------------------------------------

COMMENT ON TABLE document_series IS
  'Gapless per-tenant, per-FY document numbering. Allocated by NumberingService inside the caller transaction so a failed insert does not burn a number. INV width is capped so the number stays within CGST Rule 46(b) sixteen characters.';
