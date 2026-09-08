-- =============================================================================
-- 0094 — Sales quotation and sourcing (RFQ → quotes → award → PO).
--
-- The two halves of the commercial loop this ERP could not hold. It could take an order but
-- not quote for one, and it could raise a purchase order but not record why that supplier
-- was chosen. Both gaps had the same shape: the decision happened in a mailbox and only its
-- consequence reached the database.
--
-- Additive. Nothing here alters an existing table, and neither feature is on the path of any
-- current write, so an installation that ignores both behaves exactly as it did.
-- =============================================================================

-- --- Sales quotation -------------------------------------------------------

CREATE TABLE sales_quotation (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  quote_no            text NOT NULL,
  revision_no         integer NOT NULL DEFAULT 1 CHECK (revision_no >= 1),
  supersedes_id       uuid,
  customer_id         uuid NOT NULL,
  enquiry_ref         text,
  quote_date          date NOT NULL,
  valid_until         date NOT NULL,
  payment_terms       text,
  delivery_terms      text,
  notes               text,
  subtotal            numeric(18,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_total           numeric(18,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  grand_total         numeric(18,2) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  status              text NOT NULL DEFAULT 'draft',
  lost_reason         text,
  converted_order_id  uuid,
  converted_so_no     text,
  CONSTRAINT uq_quote_tenant_no_rev UNIQUE (tenant_id, quote_no, revision_no),
  -- One order per quotation, enforced here rather than in the service: a retried convert
  -- must not be able to commit the company twice, and a UNIQUE is the only version of that
  -- promise which survives two API instances racing.
  CONSTRAINT uq_quote_converted_order UNIQUE (tenant_id, converted_order_id),
  CONSTRAINT ck_quote_status CHECK (status IN ('draft','sent','accepted','rejected','expired','superseded','converted')),
  CONSTRAINT ck_quote_valid_window CHECK (valid_until >= quote_date)
);
CREATE INDEX ix_quote_tenant_status ON sales_quotation (tenant_id, status);
CREATE INDEX ix_quote_tenant_customer ON sales_quotation (tenant_id, customer_id);
CREATE INDEX ix_quote_tenant_valid ON sales_quotation (tenant_id, valid_until);

CREATE TABLE sales_quotation_line (
  id                        uuid PRIMARY KEY,
  tenant_id                 uuid NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid NOT NULL,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid NOT NULL,
  is_active                 boolean NOT NULL DEFAULT true,
  quotation_id              uuid NOT NULL REFERENCES sales_quotation (id),
  line_no                   integer NOT NULL CHECK (line_no >= 1),
  item_id                   uuid NOT NULL,
  description               text,
  qty                       numeric(18,3) NOT NULL CHECK (qty > 0),
  uom                       text NOT NULL,
  rate                      numeric(18,2) NOT NULL CHECK (rate >= 0),
  hsn                       text NOT NULL,
  gst_rate_pct              numeric(5,2) NOT NULL CHECK (gst_rate_pct >= 0),
  line_total                numeric(18,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  requested_delivery_date   date,
  CONSTRAINT uq_quoteline_quote_line UNIQUE (tenant_id, quotation_id, line_no)
);
CREATE INDEX ix_quoteline_tenant_quote ON sales_quotation_line (tenant_id, quotation_id);

-- --- Sourcing --------------------------------------------------------------

CREATE TABLE sourcing_rfq (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  rfq_no            text NOT NULL,
  title             text NOT NULL,
  item_id           uuid NOT NULL,
  qty               numeric(18,3) NOT NULL CHECK (qty > 0),
  uom               text NOT NULL,
  drawing_rev       text,
  need_date         date NOT NULL,
  quote_deadline    date NOT NULL,
  delivery_plant    text NOT NULL,
  origin_ref        text,
  notes             text,
  status            text NOT NULL DEFAULT 'draft',
  CONSTRAINT uq_rfq_tenant_no UNIQUE (tenant_id, rfq_no),
  CONSTRAINT ck_rfq_status CHECK (status IN ('draft','issued','evaluation','awarded','closed','cancelled')),
  -- A deadline after the need date is not a schedule, it is a wish.
  CONSTRAINT ck_rfq_deadline CHECK (quote_deadline <= need_date)
);
CREATE INDEX ix_rfq_tenant_status ON sourcing_rfq (tenant_id, status);
CREATE INDEX ix_rfq_tenant_need ON sourcing_rfq (tenant_id, need_date);

CREATE TABLE sourcing_rfq_invitation (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  rfq_id            uuid NOT NULL REFERENCES sourcing_rfq (id),
  vendor_id         uuid NOT NULL,
  response_status   text NOT NULL DEFAULT 'invited',
  CONSTRAINT uq_rfqinv_rfq_vendor UNIQUE (tenant_id, rfq_id, vendor_id),
  CONSTRAINT ck_rfqinv_status CHECK (response_status IN ('invited','quoted','declined'))
);
CREATE INDEX ix_rfqinv_tenant_rfq ON sourcing_rfq_invitation (tenant_id, rfq_id);

CREATE TABLE sourcing_supplier_quote (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  rfq_id                uuid NOT NULL REFERENCES sourcing_rfq (id),
  vendor_id             uuid NOT NULL,
  revision_no           integer NOT NULL DEFAULT 1 CHECK (revision_no >= 1),
  unit_price            numeric(18,2) NOT NULL CHECK (unit_price >= 0),
  tooling_cost          numeric(18,2) NOT NULL DEFAULT 0 CHECK (tooling_cost >= 0),
  freight_cost          numeric(18,2) NOT NULL DEFAULT 0 CHECK (freight_cost >= 0),
  non_creditable_tax    numeric(18,2) NOT NULL DEFAULT 0 CHECK (non_creditable_tax >= 0),
  landed_cost           numeric(18,2) NOT NULL CHECK (landed_cost >= 0),
  moq                   numeric(18,3),
  lead_time_days        integer CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  promised_date         date,
  valid_until           date,
  -- The gate a person sets against the released specification, BEFORE a score exists.
  technical_gate        text NOT NULL DEFAULT 'pending',
  gate_note             text,
  status                text NOT NULL DEFAULT 'submitted',
  CONSTRAINT uq_squote_rfq_vendor_rev UNIQUE (tenant_id, rfq_id, vendor_id, revision_no),
  CONSTRAINT ck_squote_gate CHECK (technical_gate IN ('pending','pass','conditional','fail')),
  CONSTRAINT ck_squote_status CHECK (status IN ('submitted','superseded','withdrawn'))
);
CREATE INDEX ix_squote_tenant_rfq ON sourcing_supplier_quote (tenant_id, rfq_id);
CREATE INDEX ix_squote_tenant_status ON sourcing_supplier_quote (tenant_id, status);

CREATE TABLE sourcing_award (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  rfq_id            uuid NOT NULL REFERENCES sourcing_rfq (id),
  quote_id          uuid NOT NULL REFERENCES sourcing_supplier_quote (id),
  vendor_id         uuid NOT NULL,
  award_reason      text NOT NULL,
  landed_cost       numeric(18,2) NOT NULL CHECK (landed_cost >= 0),
  converted_po_id   uuid,
  converted_po_no   text,
  status            text NOT NULL DEFAULT 'awarded',
  -- One award per RFQ, and one purchase order per award. Both are database promises because
  -- both are the kind of mistake that is discovered by a supplier delivering twice.
  CONSTRAINT uq_award_rfq UNIQUE (tenant_id, rfq_id),
  CONSTRAINT uq_award_po UNIQUE (tenant_id, converted_po_id),
  CONSTRAINT ck_award_status CHECK (status IN ('awarded','converted'))
);
CREATE INDEX ix_award_tenant_vendor ON sourcing_award (tenant_id, vendor_id);

-- --- Tenant isolation ------------------------------------------------------
-- NULLIF is load-bearing: an unset GUC reads as the empty string, and ''::uuid raises
-- rather than returning NULL, which would fail open on the first unfenced connection.

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'sales_quotation','sales_quotation_line',
    'sourcing_rfq','sourcing_rfq_invitation','sourcing_supplier_quote','sourcing_award'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)',
      table_name
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO app_user', table_name);
    EXECUTE format('REVOKE DELETE ON %I FROM app_user', table_name);
  END LOOP;
END $$;

-- An award is a commitment. Superseding it means a new RFQ, not an edited row.
REVOKE UPDATE ON sourcing_award FROM app_user;
GRANT UPDATE (converted_po_id, converted_po_no, status, updated_at, updated_by)
  ON sourcing_award TO app_user;

-- --- Document numbering ----------------------------------------------------
-- Both financial years, because the ERP once stopped taking orders on 1 April.

INSERT INTO document_series (id, tenant_id, created_by, updated_by, doc_type, prefix, fy_code, width, next_no)
SELECT gen_random_uuid(), t.id,
       '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
       '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
       d.doc_type, d.prefix, y.fy_code, 5, 1
FROM tenant t
CROSS JOIN (VALUES ('sales_quotation','QT'), ('sourcing_rfq','RFQ')) AS d(doc_type, prefix)
CROSS JOIN (VALUES ('2627'), ('2728')) AS y(fy_code)
ON CONFLICT (tenant_id, doc_type, fy_code) DO NOTHING;

-- --- Permissions -----------------------------------------------------------
-- Catalogue for EVERY tenant first: the role_permission trigger refuses a grant whose
-- permission is not catalogued for that same tenant.

INSERT INTO permission_catalogue (
  id, tenant_id, created_by, updated_by, permission, doc_type, action, description, is_privileged
)
SELECT gen_random_uuid(), t.id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  p.permission, p.doc_type, p.action, p.description, p.is_privileged
FROM tenant t
CROSS JOIN (VALUES
  ('sales.quotation.read',    'sales_quotation', 'read',    'Read sales quotations.', false),
  ('sales.quotation.create',  'sales_quotation', 'create',  'Raise a sales quotation.', false),
  ('sales.quotation.send',    'sales_quotation', 'send',    'Send a quotation to the customer.', false),
  ('sales.quotation.decide',  'sales_quotation', 'decide',  'Record the customer''s acceptance or rejection.', false),
  ('sales.quotation.convert', 'sales_quotation', 'convert', 'Convert an accepted quotation into a sales order.', false),
  ('purchase.rfq.read',       'sourcing_rfq',    'read',    'Read requests for quotation and supplier responses.', false),
  ('purchase.rfq.create',     'sourcing_rfq',    'create',  'Raise a request for quotation.', false),
  ('purchase.rfq.issue',      'sourcing_rfq',    'issue',   'Issue an RFQ to invited suppliers.', false),
  ('purchase.rfq.quote',      'sourcing_rfq',    'quote',   'Record a supplier quotation and its technical gate.', false),
  ('purchase.rfq.award',      'sourcing_rfq',    'award',   'Award an RFQ and raise the purchase order.', true)
) AS p(permission, doc_type, action, description, is_privileged)
ON CONFLICT (tenant_id, permission) DO UPDATE SET
  doc_type = EXCLUDED.doc_type, action = EXCLUDED.action, description = EXCLUDED.description,
  is_privileged = EXCLUDED.is_privileged, updated_at = now(), updated_by = EXCLUDED.updated_by;

-- Derive grants from the right each new permission follows, rather than naming roles: a
-- hand-written role list is wrong the first time somebody adds a role, and silently so.
CREATE TEMP TABLE _follows (new_permission text, follows_permission text) ON COMMIT DROP;
INSERT INTO _follows (new_permission, follows_permission) VALUES
  ('sales.quotation.read',    'sales.order.read'),
  ('sales.quotation.create',  'sales.order.create'),
  ('sales.quotation.send',    'sales.order.create'),
  ('sales.quotation.decide',  'sales.order.create'),
  ('sales.quotation.convert', 'sales.order.create'),
  ('purchase.rfq.read',       'purchase.po.read'),
  ('purchase.rfq.create',     'purchase.po.create'),
  ('purchase.rfq.issue',      'purchase.po.create'),
  ('purchase.rfq.quote',      'purchase.po.create'),
  -- Awarding follows the right to submit a PO for approval: the same people who can commit
  -- the company to a purchase may choose who it buys from. Separation of duties is NOT
  -- expressed here — a permission cannot say "somebody other than the raiser". The service
  -- refuses an award by the person who created the RFQ.
  ('purchase.rfq.award',      'purchase.po.submit');

INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT DISTINCT gen_random_uuid(), rp.tenant_id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  rp.role_id, f.new_permission
FROM role_permission rp
JOIN _follows f ON f.follows_permission = rp.permission
WHERE NOT EXISTS (
  SELECT 1 FROM role_permission existing
  WHERE existing.tenant_id = rp.tenant_id
    AND existing.role_id = rp.role_id
    AND existing.permission = f.new_permission)
ON CONFLICT DO NOTHING;

-- Admin always holds everything, including rights no existing permission implied.
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT gen_random_uuid(), ro.tenant_id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  ro.id, p.permission
FROM role ro
CROSS JOIN (VALUES
  ('sales.quotation.read'), ('sales.quotation.create'), ('sales.quotation.send'),
  ('sales.quotation.decide'), ('sales.quotation.convert'),
  ('purchase.rfq.read'), ('purchase.rfq.create'), ('purchase.rfq.issue'),
  ('purchase.rfq.quote'), ('purchase.rfq.award')
) AS p(permission)
WHERE ro.code IN ('admin', 'demo_admin', 'xelor_admin', 'it_admin')
ON CONFLICT DO NOTHING;

-- --- Proof -----------------------------------------------------------------
-- A migration that silently matched nothing is the one nobody notices until a demo.

DO $$
DECLARE catalogued integer; granted integer; series integer;
BEGIN
  SELECT count(*) INTO catalogued FROM permission_catalogue
    WHERE permission LIKE 'sales.quotation.%' OR permission LIKE 'purchase.rfq.%';
  SELECT count(*) INTO granted FROM role_permission
    WHERE permission LIKE 'sales.quotation.%' OR permission LIKE 'purchase.rfq.%';
  SELECT count(*) INTO series FROM document_series
    WHERE doc_type IN ('sales_quotation', 'sourcing_rfq');

  IF catalogued < 10 THEN
    RAISE EXCEPTION 'expected at least 10 catalogued quotation/RFQ permissions, found %', catalogued;
  END IF;
  IF granted = 0 THEN
    RAISE EXCEPTION 'no role received a quotation or RFQ permission — the derivation matched nothing';
  END IF;
  IF series < 4 THEN
    RAISE EXCEPTION 'expected at least 4 document_series rows for QT/RFQ, found %', series;
  END IF;
END $$;
