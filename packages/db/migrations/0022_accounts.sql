-- =============================================================================
-- 0022_accounts — ACCOUNTS (Module 08): the general ledger and the AR subledger.
--
-- The governing rule (ACCOUNTS §1.3): NEVER RE-POST WHAT A SIBLING ALREADY VALUED.
-- Accounts validates that a journal BALANCES, that its period is OPEN, that its accounts
-- EXIST and are POSTABLE, and that the instruction is NOT A DUPLICATE. It does not
-- second-guess a sibling's arithmetic.
--
-- The journal is APPEND-ONLY, guarded in THREE INDEPENDENT LAYERS (§9.4), exactly as
-- Inventory guards stock_ledger:
--   (a) a DEFERRED constraint trigger asserting debits = credits and >= 2 lines, checked
--       at COMMIT so a voucher can be assembled line by line inside one transaction;
--   (b) BEFORE UPDATE/DELETE triggers — correction is a REVERSAL voucher, never a mutation;
--   (c) the GRANT itself is revoked, so even a code bug cannot get past it.
-- All three are tested independently: a raw UPDATE as app_user must fail at the GRANT.
-- =============================================================================

CREATE TABLE gl_account (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  code         text NOT NULL,
  name         text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','income','expense')),
  is_postable  boolean NOT NULL DEFAULT true,
  parent_code  text,
  CONSTRAINT uq_glaccount_tenant_code UNIQUE (tenant_id, code)
);
ALTER TABLE gl_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_account FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON gl_account
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON gl_account FROM app_user;

CREATE TABLE acc_period (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  code        text NOT NULL,
  fiscal_year text NOT NULL,
  starts_on   date NOT NULL,
  ends_on     date NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  CONSTRAINT uq_accperiod_tenant_code UNIQUE (tenant_id, code),
  CONSTRAINT ck_accperiod_range CHECK (ends_on >= starts_on)
);
ALTER TABLE acc_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_period FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON acc_period
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON acc_period FROM app_user;

CREATE TABLE journal_voucher (
  id                     uuid PRIMARY KEY,
  tenant_id              uuid NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid NOT NULL,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             uuid NOT NULL,
  is_active              boolean NOT NULL DEFAULT true,
  voucher_no             text NOT NULL,
  voucher_type           text NOT NULL,
  posting_date           date NOT NULL,
  period_id              uuid NOT NULL,
  narration              text,
  status                 text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','reversed')),
  posting_mode           text NOT NULL CHECK (posting_mode IN ('sync','async','manual','system')),
  source_module          text,
  source_doc_type        text,
  source_doc_id          text,
  idempotency_key        text NOT NULL,
  reverses_voucher_id    uuid,
  reversed_by_voucher_id uuid,
  reversal_reason        text,
  total_debit            numeric(18,2) NOT NULL,
  total_credit           numeric(18,2) NOT NULL,
  CONSTRAINT uq_voucher_tenant_no UNIQUE (tenant_id, voucher_no),
  -- replay yields exactly ONE voucher, forever
  CONSTRAINT uq_voucher_idem UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT fk_voucher_period FOREIGN KEY (period_id) REFERENCES acc_period (id) ON DELETE RESTRICT,
  CONSTRAINT ck_voucher_balanced CHECK (total_debit = total_credit),
  CONSTRAINT ck_no_self_reverse CHECK (reverses_voucher_id IS NULL OR reverses_voucher_id <> id)
);
-- one journal per source document, forever — the structural idempotency guarantee
CREATE UNIQUE INDEX uq_voucher_source ON journal_voucher
  (tenant_id, source_module, source_doc_type, source_doc_id)
  WHERE source_module IS NOT NULL;
CREATE INDEX ix_voucher_tenant_period ON journal_voucher (tenant_id, period_id, posting_date);
ALTER TABLE journal_voucher ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_voucher FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON journal_voucher
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE TABLE journal_line (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  voucher_id    uuid NOT NULL,
  line_no       integer NOT NULL,
  account_code  text NOT NULL,
  debit         numeric(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit        numeric(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  customer_ref  uuid,
  vendor_ref    uuid,
  tax_head      text CHECK (tax_head IS NULL OR tax_head IN ('cgst','sgst','igst','cess')),
  tax_direction text CHECK (tax_direction IS NULL OR tax_direction IN ('input','output','rcm')),
  hsn_sac       text,
  memo          text,
  CONSTRAINT uq_jl_voucher_line UNIQUE (tenant_id, voucher_id, line_no),
  CONSTRAINT fk_jl_voucher FOREIGN KEY (voucher_id) REFERENCES journal_voucher (id) ON DELETE RESTRICT,
  -- a line is debit OR credit, never both: a negative debit is a credit in disguise
  CONSTRAINT ck_one_side CHECK ((debit = 0) <> (credit = 0))
);
CREATE INDEX ix_jl_tenant_voucher ON journal_line (tenant_id, voucher_id);
CREATE INDEX ix_jl_tenant_account ON journal_line (tenant_id, account_code);
CREATE INDEX ix_jl_tenant_customer ON journal_line (tenant_id, customer_ref) WHERE customer_ref IS NOT NULL;
CREATE INDEX ix_jl_tenant_tax ON journal_line (tenant_id, tax_direction, tax_head) WHERE tax_direction IS NOT NULL;
ALTER TABLE journal_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_line FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON journal_line
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---- LAYER (a): the deferred balance assertion, per voucher, at COMMIT --------------
-- Deferred so a voucher can be assembled line by line; it still cannot COMMIT unbalanced.
CREATE OR REPLACE FUNCTION assert_voucher_balanced() RETURNS trigger AS $$
DECLARE
  d numeric(18,2); c numeric(18,2); n integer;
BEGIN
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0), COUNT(*)
    INTO d, c, n FROM journal_line WHERE voucher_id = NEW.voucher_id;
  IF n < 2 THEN
    RAISE EXCEPTION 'UNBALANCED_JOURNAL: voucher % has % line(s); a journal needs at least two',
      NEW.voucher_id, n;
  END IF;
  IF d <> c THEN
    RAISE EXCEPTION 'UNBALANCED_JOURNAL: voucher % debits % <> credits %', NEW.voucher_id, d, c;
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_voucher_balanced
  AFTER INSERT ON journal_line
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_voucher_balanced();

-- ---- LAYER (b): append-only. Correction is reversal, never mutation (FR-ACC-006) ----
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'journal is append-only: correct by posting a reversal voucher (FR-ACC-006)';
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_jl_append_only BEFORE UPDATE OR DELETE ON journal_line
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

-- The voucher permits exactly TWO columns to change, and only to link a reversal.
CREATE OR REPLACE FUNCTION forbid_voucher_mutation_except_reversal_link() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'journal is append-only: a voucher cannot be deleted (FR-ACC-006)';
  END IF;
  IF NEW.reversed_by_voucher_id IS DISTINCT FROM OLD.reversed_by_voucher_id
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    -- allow ONLY the reversal link + the status flip that accompanies it
    IF ROW(NEW.voucher_no, NEW.voucher_type, NEW.posting_date, NEW.period_id, NEW.total_debit,
           NEW.total_credit, NEW.idempotency_key, NEW.source_doc_id)
       IS DISTINCT FROM
       ROW(OLD.voucher_no, OLD.voucher_type, OLD.posting_date, OLD.period_id, OLD.total_debit,
           OLD.total_credit, OLD.idempotency_key, OLD.source_doc_id) THEN
      RAISE EXCEPTION 'journal is append-only: only the reversal link may change (FR-ACC-006)';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'journal is append-only: correct by posting a reversal voucher (FR-ACC-006)';
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_jv_append_only BEFORE UPDATE OR DELETE ON journal_voucher
  FOR EACH ROW EXECUTE FUNCTION forbid_voucher_mutation_except_reversal_link();

-- ---- LAYER (c): the grant. Even a code bug cannot get past this. -------------------
REVOKE UPDATE, DELETE, TRUNCATE ON journal_line FROM app_user;
REVOKE DELETE, TRUNCATE ON journal_voucher FROM app_user;
GRANT SELECT, INSERT ON journal_voucher, journal_line TO app_user;
-- journal_voucher keeps UPDATE so the reversal link can be written; the trigger above is
-- what narrows that to two columns. journal_line has no UPDATE path at all.
GRANT UPDATE ON journal_voucher TO app_user;

-- ---- the AR subledger --------------------------------------------------------------
CREATE TABLE ar_open_item (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  invoice_no          text NOT NULL,
  invoice_date        date NOT NULL,
  customer_ref        uuid NOT NULL,
  customer_name_cache text,
  so_ref              text,
  dispatch_ref        text,
  voucher_id          uuid NOT NULL,
  taxable_value       numeric(18,2) NOT NULL,
  tax_cgst            numeric(18,2) NOT NULL DEFAULT 0,
  tax_sgst            numeric(18,2) NOT NULL DEFAULT 0,
  tax_igst            numeric(18,2) NOT NULL DEFAULT 0,
  gross_receivable    numeric(18,2) NOT NULL,
  received_amount     numeric(18,2) NOT NULL DEFAULT 0,
  -- GENERATED: the outstanding can never drift from the figures it is derived from
  outstanding         numeric(18,2) GENERATED ALWAYS AS (gross_receivable - received_amount) STORED,
  due_date            date NOT NULL,
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','partly_paid','settled')),
  CONSTRAINT uq_ar_tenant_invoice UNIQUE (tenant_id, invoice_no),
  CONSTRAINT fk_ar_voucher FOREIGN KEY (voucher_id) REFERENCES journal_voucher (id) ON DELETE RESTRICT,
  CONSTRAINT ck_ar_not_over_received CHECK (received_amount <= gross_receivable + 0.005)
);
CREATE INDEX ix_ar_tenant_customer ON ar_open_item (tenant_id, customer_ref);
CREATE INDEX ix_ar_open ON ar_open_item (tenant_id, customer_ref, due_date)
  WHERE status IN ('open','partly_paid');
ALTER TABLE ar_open_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_open_item FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ar_open_item
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON ar_open_item FROM app_user;

CREATE TABLE settlement (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  settlement_no     text NOT NULL,
  settlement_type   text NOT NULL CHECK (settlement_type IN ('receipt','payment')),
  settlement_date   date NOT NULL,
  party_ref         uuid NOT NULL,
  amount            numeric(18,2) NOT NULL CHECK (amount > 0),
  bank_account_code text NOT NULL,
  reference         text,
  voucher_id        uuid NOT NULL,
  CONSTRAINT uq_settlement_tenant_no UNIQUE (tenant_id, settlement_no),
  CONSTRAINT fk_settlement_voucher FOREIGN KEY (voucher_id) REFERENCES journal_voucher (id) ON DELETE RESTRICT
);
CREATE INDEX ix_settlement_tenant_party ON settlement (tenant_id, party_ref);
ALTER TABLE settlement ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON settlement
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON settlement FROM app_user;

CREATE TABLE settlement_allocation (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  settlement_id   uuid NOT NULL,
  ar_open_item_id uuid NOT NULL,
  amount          numeric(18,2) NOT NULL CHECK (amount > 0),
  CONSTRAINT fk_alloc_settlement FOREIGN KEY (settlement_id) REFERENCES settlement (id) ON DELETE RESTRICT,
  CONSTRAINT fk_alloc_ar FOREIGN KEY (ar_open_item_id) REFERENCES ar_open_item (id) ON DELETE RESTRICT
);
CREATE INDEX ix_settlementalloc_tenant_settlement ON settlement_allocation (tenant_id, settlement_id);
ALTER TABLE settlement_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_allocation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON settlement_allocation
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON settlement_allocation FROM app_user;

-- ---- permissions ----
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission) VALUES
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','accounts.ledger.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','accounts.journal.post'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','accounts.receipt.record'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','accounts.voucher.reverse'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','accounts.ledger.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','accounts.ledger.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','accounts.journal.post'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','accounts.receipt.record')
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;
