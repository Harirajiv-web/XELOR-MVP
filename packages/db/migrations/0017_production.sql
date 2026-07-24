-- =============================================================================
-- 0017_production — production orders. A production order consumes BOM components
-- (issued from a source warehouse) and produces a finished good (received into an FG
-- warehouse), BOTH through Inventory's single write path (§5.6). Component requirements
-- are exploded from the BOM (read via the BOM_PROVIDER port) and snapshotted here.
-- Intra-module FK: component -> production_order; item/bom/warehouse ids are logical.
-- =============================================================================

CREATE TABLE production_order (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  order_no            text NOT NULL,
  item_id             uuid NOT NULL,
  bom_id              uuid NOT NULL,
  qty_to_produce      numeric(18,3) NOT NULL,
  produced_qty        numeric(18,3) NOT NULL DEFAULT 0,
  source_warehouse_id uuid NOT NULL,
  fg_warehouse_id     uuid NOT NULL,
  status              text NOT NULL
                      CHECK (status IN ('planned','in_progress','completed','cancelled')),
  CONSTRAINT uq_prodorder_tenant_no UNIQUE (tenant_id, order_no)
);
CREATE INDEX ix_prodorder_tenant_status ON production_order (tenant_id, status);
ALTER TABLE production_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_order FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON production_order
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON production_order FROM app_user;

CREATE TABLE production_order_component (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  order_id          uuid NOT NULL,
  line_no           integer NOT NULL,
  component_item_id uuid NOT NULL,
  required_qty      numeric(18,3) NOT NULL,
  issued_qty        numeric(18,3) NOT NULL DEFAULT 0,
  CONSTRAINT uq_prodcomp_order_line UNIQUE (tenant_id, order_id, line_no),
  CONSTRAINT fk_prodcomp_order FOREIGN KEY (order_id) REFERENCES production_order (id) ON DELETE RESTRICT
);
CREATE INDEX ix_prodcomp_tenant_order ON production_order_component (tenant_id, order_id);
ALTER TABLE production_order_component ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_order_component FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON production_order_component
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON production_order_component FROM app_user;

-- ---- permissions: admins plan; the shop floor (stores_incharge here) executes ----
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission) VALUES
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','production.order.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','production.order.create'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','production.order.execute'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','production.order.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','production.order.execute'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','production.order.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','production.order.create'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','production.order.execute')
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;
