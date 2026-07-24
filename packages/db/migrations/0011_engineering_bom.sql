-- =============================================================================
-- 0011_engineering_bom — Bill of Materials (header + lines).
-- Intra-module FKs only (§1.1): bom.item_id -> item, bom_line.bom_id -> bom,
-- bom_line.component_item_id -> item. Tenant-scoped + FORCE RLS; versioned so a
-- running production order pins to a version and later edits never disturb it.
-- =============================================================================

CREATE TABLE bom (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  item_id     uuid NOT NULL,
  version     integer NOT NULL,
  output_qty  numeric(18,3) NOT NULL DEFAULT 1,
  uom         text NOT NULL,
  notes       text,
  CONSTRAINT uq_bom_item_version UNIQUE (tenant_id, item_id, version),
  CONSTRAINT fk_bom_item FOREIGN KEY (item_id) REFERENCES item (id) ON DELETE RESTRICT
);
CREATE INDEX ix_bom_tenant_item ON bom (tenant_id, item_id);
ALTER TABLE bom ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bom
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON bom FROM app_user;

CREATE TABLE bom_line (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  bom_id            uuid NOT NULL,
  line_no           integer NOT NULL,
  component_item_id uuid NOT NULL,
  qty               numeric(18,3) NOT NULL,
  uom               text NOT NULL,
  scrap_pct         numeric(5,2) NOT NULL DEFAULT 0,
  CONSTRAINT uq_bomline_bom_line UNIQUE (tenant_id, bom_id, line_no),
  CONSTRAINT fk_bomline_bom FOREIGN KEY (bom_id) REFERENCES bom (id) ON DELETE RESTRICT,
  CONSTRAINT fk_bomline_item FOREIGN KEY (component_item_id) REFERENCES item (id) ON DELETE RESTRICT
);
CREATE INDEX ix_bomline_tenant_bom ON bom_line (tenant_id, bom_id);
ALTER TABLE bom_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_line FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bom_line
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON bom_line FROM app_user;

-- ---- permissions for the demo admin roles ----
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission) VALUES
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','engineering.bom.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','engineering.bom.create'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','engineering.bom.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','engineering.bom.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','engineering.bom.create')
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;
