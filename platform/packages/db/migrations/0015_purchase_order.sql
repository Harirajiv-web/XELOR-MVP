-- =============================================================================
-- 0015_purchase_order — purchase orders (header + lines). Submitted for approval
-- through the W1 engine (WorkflowExecutor port); the linked instance drives status.
-- Intra-module FKs only (po.vendor_id -> vendor, po_line.po_id -> po); item_id is a
-- cross-module logical ref (no FK, §1.1). Money is NUMERIC(18,2) (§5.1).
-- =============================================================================

CREATE TABLE purchase_order (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  po_no                text NOT NULL,
  vendor_id            uuid NOT NULL,
  status               text NOT NULL
                       CHECK (status IN ('draft','pending_approval','approved','rejected','partially_received','received','cancelled')),
  po_date              timestamptz NOT NULL DEFAULT now(),
  expected_date        timestamptz,
  currency             text NOT NULL DEFAULT 'INR',
  total_amount         numeric(18,2) NOT NULL DEFAULT 0,
  remarks              text,
  workflow_instance_id uuid,
  CONSTRAINT uq_po_tenant_no UNIQUE (tenant_id, po_no),
  CONSTRAINT fk_po_vendor FOREIGN KEY (vendor_id) REFERENCES vendor (id) ON DELETE RESTRICT
);
CREATE INDEX ix_po_tenant_status ON purchase_order (tenant_id, status);
CREATE INDEX ix_po_tenant_vendor ON purchase_order (tenant_id, vendor_id);
ALTER TABLE purchase_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON purchase_order
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON purchase_order FROM app_user;

CREATE TABLE purchase_order_line (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  po_id        uuid NOT NULL,
  line_no      integer NOT NULL,
  item_id      uuid NOT NULL,
  qty          numeric(18,3) NOT NULL,
  rate         numeric(18,2) NOT NULL,
  amount       numeric(18,2) NOT NULL,
  received_qty numeric(18,3) NOT NULL DEFAULT 0,
  CONSTRAINT uq_poline_po_line UNIQUE (tenant_id, po_id, line_no),
  CONSTRAINT fk_poline_po FOREIGN KEY (po_id) REFERENCES purchase_order (id) ON DELETE RESTRICT
);
CREATE INDEX ix_poline_tenant_po ON purchase_order_line (tenant_id, po_id);
ALTER TABLE purchase_order_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_line FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON purchase_order_line
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON purchase_order_line FROM app_user;

-- ---- permissions: admins create+submit POs; approvals are governed by W1 approver
--      resolution, not a static permission ----
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission) VALUES
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','purchase.po.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','purchase.po.create'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','purchase.po.submit'),
  -- stores can read POs (they approve step 1 via W1's own approver check)
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','purchase.po.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','purchase.po.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','purchase.po.create'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','purchase.po.submit')
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;
