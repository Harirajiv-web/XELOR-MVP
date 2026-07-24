-- =============================================================================
-- 0016_purchase_grn — goods receipts against a PO. Posting a GRN records stock through
-- Inventory's single write path (STOCK_POSTER.postInTx) in the SAME transaction, so the
-- GRN doc, the PO line received-qty updates, and the stock ledger commit atomically.
-- Intra-module FKs to purchase_order / _line; warehouse_id is a cross-module ref (no FK).
-- =============================================================================

CREATE TABLE grn (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  grn_no       text NOT NULL,
  po_id        uuid NOT NULL,
  vendor_id    uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  grn_date     timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'posted',
  CONSTRAINT uq_grn_tenant_no UNIQUE (tenant_id, grn_no),
  CONSTRAINT fk_grn_po FOREIGN KEY (po_id) REFERENCES purchase_order (id) ON DELETE RESTRICT
);
CREATE INDEX ix_grn_tenant_po ON grn (tenant_id, po_id);
ALTER TABLE grn ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON grn
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON grn FROM app_user;

CREATE TABLE grn_line (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  grn_id      uuid NOT NULL,
  line_no     integer NOT NULL,
  po_line_id  uuid NOT NULL,
  item_id     uuid NOT NULL,
  qty         numeric(18,3) NOT NULL,
  batch       text NOT NULL DEFAULT '',
  CONSTRAINT uq_grnline_grn_line UNIQUE (tenant_id, grn_id, line_no),
  CONSTRAINT fk_grnline_grn FOREIGN KEY (grn_id) REFERENCES grn (id) ON DELETE RESTRICT,
  CONSTRAINT fk_grnline_poline FOREIGN KEY (po_line_id) REFERENCES purchase_order_line (id) ON DELETE RESTRICT
);
CREATE INDEX ix_grnline_tenant_grn ON grn_line (tenant_id, grn_id);
ALTER TABLE grn_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_line FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON grn_line
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON grn_line FROM app_user;

-- ---- permissions: stores staff receive goods; admins too ----
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission) VALUES
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','purchase.grn.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','purchase.grn.create'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','purchase.grn.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','purchase.grn.create'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','purchase.grn.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','purchase.grn.create')
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;
