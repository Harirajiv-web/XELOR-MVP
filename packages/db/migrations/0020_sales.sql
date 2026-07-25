-- =============================================================================
-- 0020_sales — SMBD (Module 07): customers, sales orders with GST, dispatch.
--
-- RECONCILED to the locked baseline. The SMBD blueprint was authored on PostgreSQL 16 /
-- FastAPI with BIGINT identities, a separate `smbd.` schema and NUMERIC(14,2). This
-- migration keeps its DOMAIN decisions (place of supply, rate-wise splits, duplicate-PO
-- guard, credit gate) and drops its INFRASTRUCTURE ones in favour of DECISIONS-V2:
-- UUIDv7 PKs, shared schema + tenant_id + FORCE RLS, NUMERIC(18,2) money (§5.1).
--
-- Two statutory points are structural here:
--   * chk_gst_exclusive — a document can never carry BOTH IGST and CGST/SGST.
--   * ship_to_gstin is captured at ORDER time, because from 1 Aug 2026 the IRP requires it
--     on the e-invoice payload (DECISIONS-V2 §3.4, ranked risk #1) and order time is the
--     last moment a human can still ask the customer for it. The DATE ITSELF is config in
--     the platform GST brain, never a constant here.
-- =============================================================================

CREATE TABLE customer (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  code            text NOT NULL,
  name            text NOT NULL,
  gstin           text,
  state_code      text,
  is_registered   boolean NOT NULL DEFAULT true,
  contact_email   text,
  contact_phone   text,
  billing_address text,
  credit_limit    numeric(18,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  credit_days     integer NOT NULL DEFAULT 30 CHECK (credit_days BETWEEN 0 AND 365),
  CONSTRAINT uq_customer_tenant_code UNIQUE (tenant_id, code),
  -- shape only; the check DIGIT is enforced per tenant config (the §7 demo GSTINs are
  -- well-formed but fictional, so a global checksum rule would break the demo universe)
  CONSTRAINT ck_customer_gstin_shape CHECK (
    gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  -- an unregistered buyer must NOT carry a GSTIN, and a registered one must
  CONSTRAINT ck_customer_registered_has_gstin CHECK (
    (is_registered AND gstin IS NOT NULL) OR (NOT is_registered AND gstin IS NULL))
);
CREATE INDEX ix_customer_tenant_name ON customer (tenant_id, name);
-- trigram index so the SHARED dedup brain's name prefilter stays fast at scale
CREATE INDEX ix_customer_name_trgm ON customer USING gin (name gin_trgm_ops);
ALTER TABLE customer ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON customer
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON customer FROM app_user;

CREATE TABLE sales_order (
  id                       uuid PRIMARY KEY,
  tenant_id                uuid NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid NOT NULL,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid NOT NULL,
  is_active                boolean NOT NULL DEFAULT true,
  so_no                    text NOT NULL,
  customer_id              uuid NOT NULL,
  cust_po_no               text NOT NULL,
  order_date               date NOT NULL,
  supplier_gstin           text NOT NULL,
  bill_to_gstin            text,
  ship_to_gstin            text,
  ship_to_state_code       text NOT NULL,
  ship_to_address          text,
  place_of_supply          text NOT NULL,
  is_inter_state           boolean NOT NULL,
  fg_warehouse_id          uuid,
  subtotal                 numeric(18,2) NOT NULL DEFAULT 0,
  cgst_total               numeric(18,2) NOT NULL DEFAULT 0,
  sgst_total               numeric(18,2) NOT NULL DEFAULT 0,
  igst_total               numeric(18,2) NOT NULL DEFAULT 0,
  round_off                numeric(18,2) NOT NULL DEFAULT 0,
  grand_total              numeric(18,2) NOT NULL DEFAULT 0,
  credit_status            text NOT NULL DEFAULT 'pending'
                           CHECK (credit_status IN ('pending','passed','hold','override')),
  credit_limit_snapshot    numeric(18,2),
  credit_exposure_snapshot numeric(18,2),
  credit_override_by       uuid,
  credit_override_reason   text,
  status                   text NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','confirmed','credit_hold','partially_dispatched',
                                             'dispatched','cancelled')),
  CONSTRAINT uq_so_tenant_no UNIQUE (tenant_id, so_no),
  -- the duplicate customer-PO guard: the same PO twice is nearly always a re-key
  CONSTRAINT uq_so_customer_po UNIQUE (tenant_id, customer_id, cust_po_no),
  CONSTRAINT fk_so_customer FOREIGN KEY (customer_id) REFERENCES customer (id) ON DELETE RESTRICT,
  -- IGST and CGST/SGST are mutually exclusive on one document. Structural, not advisory.
  CONSTRAINT chk_gst_exclusive CHECK (
    (igst_total = 0) OR (cgst_total = 0 AND sgst_total = 0)),
  CONSTRAINT ck_so_interstate_matches_tax CHECK (
    (is_inter_state AND cgst_total = 0 AND sgst_total = 0) OR
    (NOT is_inter_state AND igst_total = 0)),
  CONSTRAINT ck_so_override_has_reason CHECK (
    credit_status <> 'override' OR credit_override_reason IS NOT NULL)
);
CREATE INDEX ix_so_tenant_status ON sales_order (tenant_id, status);
CREATE INDEX ix_so_tenant_customer ON sales_order (tenant_id, customer_id);
ALTER TABLE sales_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sales_order
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON sales_order FROM app_user;

CREATE TABLE sales_order_line (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  order_id       uuid NOT NULL,
  line_no        integer NOT NULL,
  item_id        uuid NOT NULL,
  qty            numeric(18,3) NOT NULL CHECK (qty > 0),
  uom            text,
  rate           numeric(18,2) NOT NULL CHECK (rate >= 0),
  discount_pct   numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct < 100),
  -- HSN is mandatory on every line; 4/6/8 digits (6-digit reporting above Rs 5 crore AATO)
  hsn            text NOT NULL CHECK (hsn ~ '^([0-9]{4}|[0-9]{6}|[0-9]{8})$'),
  gst_rate_pct   numeric(5,2) NOT NULL CHECK (gst_rate_pct >= 0 AND gst_rate_pct <= 28),
  taxable_value  numeric(18,2) NOT NULL,
  cgst           numeric(18,2) NOT NULL DEFAULT 0,
  sgst           numeric(18,2) NOT NULL DEFAULT 0,
  igst           numeric(18,2) NOT NULL DEFAULT 0,
  line_total     numeric(18,2) NOT NULL,
  delivered_qty  numeric(18,3) NOT NULL DEFAULT 0 CHECK (delivered_qty >= 0),
  CONSTRAINT uq_soline_order_line UNIQUE (tenant_id, order_id, line_no),
  CONSTRAINT fk_soline_order FOREIGN KEY (order_id) REFERENCES sales_order (id) ON DELETE RESTRICT,
  -- you can never dispatch more than was ordered
  CONSTRAINT ck_soline_not_over_delivered CHECK (delivered_qty <= qty + 0.0001),
  CONSTRAINT chk_line_gst_exclusive CHECK ((igst = 0) OR (cgst = 0 AND sgst = 0))
);
CREATE INDEX ix_soline_tenant_order ON sales_order_line (tenant_id, order_id);
-- the dispatch worklist: lines still owing quantity
CREATE INDEX ix_soline_pending ON sales_order_line (tenant_id, order_id)
  WHERE delivered_qty < qty;
ALTER TABLE sales_order_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_line FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sales_order_line
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON sales_order_line FROM app_user;

CREATE TABLE dispatch (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  dispatch_no     text NOT NULL,
  order_id        uuid NOT NULL,
  dispatch_date   date NOT NULL,
  transporter     text,
  vehicle_no      text,
  eway_bill_no    text,
  status          text NOT NULL DEFAULT 'dispatched'
                  CHECK (status IN ('planned','packed','dispatched','delivered')),
  -- SMBD never writes the stock ledger: this is the entry id Inventory returned (§5.6)
  stock_entry_ref text,
  CONSTRAINT uq_dispatch_tenant_no UNIQUE (tenant_id, dispatch_no),
  CONSTRAINT fk_dispatch_order FOREIGN KEY (order_id) REFERENCES sales_order (id) ON DELETE RESTRICT,
  CONSTRAINT ck_dispatch_moved_has_entry CHECK (
    status NOT IN ('dispatched','delivered') OR stock_entry_ref IS NOT NULL)
);
CREATE INDEX ix_dispatch_tenant_order ON dispatch (tenant_id, order_id);
ALTER TABLE dispatch ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dispatch
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON dispatch FROM app_user;

CREATE TABLE dispatch_line (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  dispatch_id    uuid NOT NULL,
  order_line_id  uuid NOT NULL,
  item_id        uuid NOT NULL,
  qty            numeric(18,3) NOT NULL CHECK (qty > 0),
  CONSTRAINT fk_dispatchline_dispatch FOREIGN KEY (dispatch_id) REFERENCES dispatch (id) ON DELETE RESTRICT,
  CONSTRAINT fk_dispatchline_soline FOREIGN KEY (order_line_id) REFERENCES sales_order_line (id) ON DELETE RESTRICT
);
CREATE INDEX ix_dispatchline_tenant_dispatch ON dispatch_line (tenant_id, dispatch_id);
ALTER TABLE dispatch_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_line FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dispatch_line
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON dispatch_line FROM app_user;

-- ---- permissions: sales staff quote and order; credit override is separate ----
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission) VALUES
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','sales.customer.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','sales.customer.create'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','sales.order.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','sales.order.create'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','sales.order.confirm'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','sales.credit.override'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','sales.dispatch.execute'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','sales.customer.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','sales.order.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','sales.dispatch.execute'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','sales.customer.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','sales.customer.create'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','sales.order.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','sales.order.create'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','sales.order.confirm'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','sales.dispatch.execute')
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;
