-- SPREADSHEET IMPORT, MADE AUDITABLE.
--
-- Most of the factories this product is sold into keep their operational truth in Excel.
-- That is not a transitional embarrassment to be migrated away from once; it is how the
-- plant runs, and an import is therefore a permanent integration path rather than a
-- one-off onboarding script. Which means it needs the same thing every other inbound path
-- in this system has: a record of what arrived, what was accepted, what was refused and
-- why, that survives the request that created it.
--
-- The failure this exists to prevent is specific and it is the one every hand-rolled
-- importer produces. Four hundred rows are uploaded, three hundred and forty are created,
-- the connection drops, and the only surviving evidence of which sixty are missing is in a
-- browser tab that has since been closed. The operator's rational move at that point is to
-- upload the whole file again, and now the master has duplicates. Two tables and a unique
-- index remove that entire class of afternoon.
--
-- TWO TABLES, AND THE SPLIT IS THE POINT:
--
--   data_import_batch   one upload: the file, the sheet, the mapping, the target, the
--                       counts. The unique key is the CONTENT — the same bytes mapped the
--                       same way to the same target is the same import, whoever re-posts
--                       it and however many times.
--   data_import_row     one spreadsheet row: what it said, what it became, what happened
--                       to it, and the idempotency key it was committed under. This is
--                       what makes a part-completed import RESUMABLE rather than merely
--                       regrettable — the rows that landed are marked, so a resume only
--                       does the rest.
--
-- WHAT IS NOT HERE: any customer, item, vendor, stock or order column. An import writes
-- nothing into a master directly. Every accepted row is committed through the module's own
-- endpoint — the same door the form uses, with the same permission, the same GST
-- validation, the same duplicate check and the same idempotency ledger. A bulk INSERT
-- would be faster and would bypass all four, and a master built that way is exactly the
-- pile of unvalidated rows the customer is trying to leave behind.

-- ------------------------------------------------------------------- batch ----
CREATE TABLE IF NOT EXISTS data_import_batch (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  -- Where this data came from, recorded rather than assumed. Today an import is always an
  -- uploaded file, and the column exists because the UI makes a promise about provenance —
  -- a connected source, a file somebody uploaded, and demo data are shown differently and
  -- must never be confusable. A future scheduled pull from a shared drive lands here as a
  -- different value, not as an indistinguishable row.
  source_kind      text NOT NULL DEFAULT 'uploaded_file',
  filename         text NOT NULL,
  file_kind        text NOT NULL,
  byte_size        integer NOT NULL,
  -- sha256 over the file bytes, the sheet, the target and the mapping. See the unique index.
  content_hash     text NOT NULL,
  sheet_name       text NOT NULL,
  target           text NOT NULL,
  mapping          jsonb NOT NULL,
  row_count        integer NOT NULL DEFAULT 0,
  accepted_count   integer NOT NULL DEFAULT 0,
  rejected_count   integer NOT NULL DEFAULT 0,
  imported_count   integer NOT NULL DEFAULT 0,
  failed_count     integer NOT NULL DEFAULT 0,
  -- What to do with a row the duplicate brain flags. Default 'skip': an import must never
  -- be the thing that talks past a duplicate warning a person would have had to answer.
  on_duplicate     text NOT NULL DEFAULT 'skip',
  status           text NOT NULL DEFAULT 'running',
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  CONSTRAINT ck_dibatch_target CHECK (target IN
    ('customers','items','vendors','stock_opening','sales_orders')),
  CONSTRAINT ck_dibatch_status CHECK (status IN
    ('running','completed','partial','failed')),
  CONSTRAINT ck_dibatch_on_duplicate CHECK (on_duplicate IN ('skip','import_anyway')),
  CONSTRAINT ck_dibatch_source_kind CHECK (source_kind IN ('uploaded_file')),
  CONSTRAINT ck_dibatch_finished_has_status CHECK (
    finished_at IS NULL OR status <> 'running'
  )
);

-- THE SAME FILE, MAPPED THE SAME WAY, TO THE SAME TARGET, IS ONE IMPORT.
--
-- This is what makes commit idempotent at the level a person actually retries at. A dropped
-- response, a double-clicked button, a colleague re-uploading the file somebody sent them
-- twice — all three resolve to the existing batch and continue it, instead of creating a
-- second run that inserts everything again.
--
-- The hash covers the MAPPING as well as the bytes, deliberately. Re-importing the same
-- file against a corrected mapping is a genuinely different import and must be allowed to
-- proceed as one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dibatch_tenant_content
  ON data_import_batch (tenant_id, content_hash);

CREATE INDEX IF NOT EXISTS ix_dibatch_tenant_started
  ON data_import_batch (tenant_id, started_at DESC);

COMMENT ON COLUMN data_import_batch.content_hash IS
  'sha256 of the file bytes + sheet + target + canonical mapping. Re-posting the same import '
  'resumes this batch rather than starting a second one.';

-- --------------------------------------------------------------------- row ----
CREATE TABLE IF NOT EXISTS data_import_row (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  batch_id         uuid NOT NULL,
  -- The 1-based row number AS SHOWN IN EXCEL. Storing the index of the record instead is
  -- how an operator is told to fix row 3 when their screen shows the problem on row 5.
  row_no           integer NOT NULL,
  -- Which document this row belongs to. Several rows share one key when a target groups
  -- them — three lines of one sales order — and they then succeed or fail together.
  group_key        text,
  raw              jsonb NOT NULL,
  mapped           jsonb,
  issues           jsonb,
  status           text NOT NULL DEFAULT 'accepted',
  -- Deterministic, derived from the batch and the row number. The same row committed twice
  -- replays the first answer through the platform's idempotency ledger instead of creating
  -- a second customer — which is what makes a resume safe after a crash between the domain
  -- write and the bookkeeping below.
  idempotency_key  text NOT NULL,
  result_id        uuid,
  -- The document number a person would quote: SO-0007, or the item code that was created.
  result_ref       text,
  imported_at      timestamptz,
  failure_code     text,
  failure_message  text,
  CONSTRAINT uq_dirow_batch_rowno UNIQUE (tenant_id, batch_id, row_no),
  CONSTRAINT uq_dirow_tenant_idem UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT ck_dirow_status CHECK (status IN
    ('accepted','rejected','imported','failed','duplicate_suspected','skipped')),
  -- An imported row must say when. "Imported" with no timestamp is the shape a half-applied
  -- resume takes, and it is the one state that would make the resumption logic skip real work.
  CONSTRAINT ck_dirow_imported_has_time CHECK (status <> 'imported' OR imported_at IS NOT NULL),
  CONSTRAINT ck_dirow_failed_has_reason CHECK (status <> 'failed' OR failure_message IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ix_dirow_tenant_batch
  ON data_import_row (tenant_id, batch_id, row_no);

-- The resume query: everything in this batch not yet dealt with.
CREATE INDEX IF NOT EXISTS ix_dirow_tenant_batch_status
  ON data_import_row (tenant_id, batch_id, status);

COMMENT ON TABLE data_import_row IS
  'One spreadsheet row and what became of it. Kept whether it succeeded or not — a rejected '
  'row with its reason is the answer to "why is this part missing", and deleting it leaves '
  'only the absence.';

-- ------------------------------------------------------------ RLS + grants ----
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['data_import_batch','data_import_row'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_%I ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY rls_%I ON %I USING (tenant_id = current_setting(''app.current_tenant'', true)::uuid) '
      'WITH CHECK (tenant_id = current_setting(''app.current_tenant'', true)::uuid)', t, t);
    -- No DELETE. An import that can erase its own record of what it did is not an audit
    -- trail, and the row that somebody would most want to delete is the one that failed.
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO app_user', t);
  END LOOP;
END $$;
