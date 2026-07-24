-- =============================================================================
-- 0010_engineering_item — ENGINEERING item master (§5.1 conventions).
-- Tenant-scoped + FORCE RLS; no hard DELETE (is_active soft delete); UUIDv7 PK.
-- A GIN trigram index on name powers the item-dedup name prefilter (shared brain).
-- =============================================================================

CREATE TABLE item (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  item_code         text NOT NULL,
  name              text NOT NULL,
  description       text,
  item_type         text NOT NULL
                    CHECK (item_type IN ('raw_material','component','sub_assembly','finished_good','consumable')),
  uom               text NOT NULL,
  hsn_code          text,
  item_group        text,
  is_purchasable    boolean NOT NULL DEFAULT true,
  is_manufacturable boolean NOT NULL DEFAULT false,
  is_sellable       boolean NOT NULL DEFAULT false,
  standard_cost     numeric(18,2),
  CONSTRAINT uq_item_tenant_code UNIQUE (tenant_id, item_code)
);
CREATE INDEX ix_item_tenant ON item (tenant_id, id);
CREATE INDEX ix_item_name_trgm ON item USING gin (name gin_trgm_ops);
ALTER TABLE item ENABLE ROW LEVEL SECURITY;
ALTER TABLE item FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON item
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
-- Masters are never hard-deleted (§5.1): soft delete via is_active.
REVOKE DELETE ON item FROM app_user;

-- ---- permissions for the demo admin roles ----
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission) VALUES
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','engineering.item.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','engineering.item.create'),
  -- stores_incharge can read the catalogue
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','engineering.item.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','engineering.item.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','engineering.item.create')
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;
