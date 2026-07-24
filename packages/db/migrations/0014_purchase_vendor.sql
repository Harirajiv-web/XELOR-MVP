-- =============================================================================
-- 0014_purchase_vendor — PURCHASE vendor master (§5.1). Tenant-scoped + FORCE RLS,
-- soft-delete, GIN trigram index on name for the shared dedup brain's name prefilter.
-- =============================================================================

CREATE TABLE vendor (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  code           text NOT NULL,
  name           text NOT NULL,
  gstin          text,
  contact_email  text,
  contact_phone  text,
  address        text,
  payment_terms  text,
  CONSTRAINT uq_vendor_tenant_code UNIQUE (tenant_id, code)
);
CREATE INDEX ix_vendor_name_trgm ON vendor USING gin (name gin_trgm_ops);
ALTER TABLE vendor ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vendor
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON vendor FROM app_user;

-- ---- permissions: admins manage vendors; stores can read them ----
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission) VALUES
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','purchase.vendor.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','purchase.vendor.create'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','purchase.vendor.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','purchase.vendor.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','purchase.vendor.create')
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;
