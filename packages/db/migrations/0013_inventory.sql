-- =============================================================================
-- 0013_inventory — warehouses + the stock ledger and the single write path (§5.6).
-- Ledger writes are ledger-critical (§5.5): synchronous, one transaction, race-safe
-- via SELECT ... FOR UPDATE on stock_balance. The ledger is append-only; balances are
-- its running sum. item_id is a cross-module logical ref (no FK, §1.1).
-- =============================================================================

CREATE TABLE warehouse (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  code           text NOT NULL,
  name           text NOT NULL,
  warehouse_type text NOT NULL
                 CHECK (warehouse_type IN ('accepted','quarantine','wip','finished','scrap','general')),
  CONSTRAINT uq_warehouse_tenant_code UNIQUE (tenant_id, code)
);
ALTER TABLE warehouse ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON warehouse
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON warehouse FROM app_user;

CREATE TABLE stock_balance (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  item_id      uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  batch        text NOT NULL DEFAULT '',
  qty          numeric(18,3) NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_stock_balance UNIQUE (tenant_id, item_id, warehouse_id, batch),
  CONSTRAINT fk_stockbal_wh FOREIGN KEY (warehouse_id) REFERENCES warehouse (id) ON DELETE RESTRICT
);
ALTER TABLE stock_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_balance FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stock_balance
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE TABLE stock_ledger (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  item_id      uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  batch        text NOT NULL DEFAULT '',
  qty          numeric(18,3) NOT NULL,          -- signed: + in, - out
  entry_id     uuid NOT NULL,
  entry_type   text NOT NULL,
  reason_code  text,
  posted_at    timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  CONSTRAINT fk_stockledger_wh FOREIGN KEY (warehouse_id) REFERENCES warehouse (id) ON DELETE RESTRICT
);
CREATE INDEX ix_stockledger_tenant_item_wh ON stock_ledger (tenant_id, item_id, warehouse_id);
ALTER TABLE stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stock_ledger
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
-- The ledger is append-only (reuse the audit trigger); balances carry the current qty.
CREATE TRIGGER trg_stockledger_append_only
  BEFORE UPDATE OR DELETE ON stock_ledger
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
REVOKE UPDATE, DELETE ON stock_ledger FROM app_user;

CREATE TABLE stock_entry (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  entry_type  text NOT NULL CHECK (entry_type IN ('receipt','issue','transfer','adjustment')),
  reason_code text,
  remarks     text,
  posted_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE stock_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_entry FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stock_entry
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON stock_entry FROM app_user;

CREATE TABLE stock_entry_line (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  entry_id          uuid NOT NULL,
  line_no           integer NOT NULL,
  item_id           uuid NOT NULL,
  from_warehouse_id uuid,
  to_warehouse_id   uuid,
  batch             text NOT NULL DEFAULT '',
  qty               numeric(18,3) NOT NULL,
  CONSTRAINT uq_stockentryline UNIQUE (tenant_id, entry_id, line_no),
  CONSTRAINT fk_sel_entry FOREIGN KEY (entry_id) REFERENCES stock_entry (id) ON DELETE RESTRICT,
  CONSTRAINT fk_sel_from FOREIGN KEY (from_warehouse_id) REFERENCES warehouse (id) ON DELETE RESTRICT,
  CONSTRAINT fk_sel_to FOREIGN KEY (to_warehouse_id) REFERENCES warehouse (id) ON DELETE RESTRICT
);
CREATE INDEX ix_sel_tenant_entry ON stock_entry_line (tenant_id, entry_id);
ALTER TABLE stock_entry_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_entry_line FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stock_entry_line
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON stock_entry_line FROM app_user;

-- ---- seed 3S (Pune plant) warehouses ----
INSERT INTO warehouse (id, tenant_id, created_by, updated_by, code, name, warehouse_type) VALUES
 ('0192a8c0-0013-7000-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','WH-ACC','Pune Stores (Accepted)','accepted'),
 ('0192a8c0-0013-7000-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','WH-QC','Pune Quarantine','quarantine'),
 ('0192a8c0-0013-7000-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','WH-WIP','Pune WIP','wip'),
 ('0192a8c0-0013-7000-8000-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','WH-FG','Pune Finished Goods','finished'),
 ('0192a8c0-0013-7000-8000-000000000005','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','WH-SCRAP','Pune Scrap','scrap')
ON CONFLICT (id) DO NOTHING;

-- ---- permissions (stores staff post stock; admins do everything) ----
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission) VALUES
  -- 3S admin
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','inventory.warehouse.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','inventory.stock.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','inventory.stock.post'),
  -- 3S stores_incharge — stores clerks receive and issue stock
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','inventory.warehouse.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','inventory.stock.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','inventory.stock.post'),
  -- Kaveri admin
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','inventory.warehouse.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','inventory.stock.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','inventory.stock.post')
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;
