-- =============================================================================
-- 0001_seed — the canonical demo universe (DECISIONS-V2 §7). Runs as OWNER.
-- Primary tenant Trishul Precision Components: ONE company, TWO GST registrations
-- (Maharashtra + Tamil Nadu) — exercises multi-GSTIN-per-tenant from day one.
-- Kaveri ElectroFab is seeded minimally, solely for RLS leak-probe demos.
-- Ids are fixed UUIDv7-shaped values shared with .env.example.
-- =============================================================================

-- System actor for seed-authored rows.
-- 0192a8c0-0000-7000-8000-0000000000ff

INSERT INTO tenant (id, legal_name, is_active) VALUES
  ('0192a8c0-0000-7000-8000-000000000001', 'Trishul Precision Components Pvt Ltd', true),
  ('0192a8c0-0000-7000-8000-000000000002', 'Kaveri ElectroFab Industries', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO company (id, tenant_id, created_by, updated_by, legal_name, cin) VALUES
  ('0192a8c0-0001-7000-8000-000000000001',
   '0192a8c0-0000-7000-8000-000000000001',
   '0192a8c0-0000-7000-8000-0000000000ff',
   '0192a8c0-0000-7000-8000-0000000000ff',
   'Trishul Precision Components Pvt Ltd',
   'U29299PN2016PTC000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO gst_registration
  (id, tenant_id, created_by, updated_by, company_id, gstin, state_code, place_name) VALUES
  ('0192a8c0-0002-7000-8000-000000000001',
   '0192a8c0-0000-7000-8000-000000000001',
   '0192a8c0-0000-7000-8000-0000000000ff',
   '0192a8c0-0000-7000-8000-0000000000ff',
   '0192a8c0-0001-7000-8000-000000000001',
   '27AABCT1234F1Z5', '27', 'Pune-Chakan'),
  ('0192a8c0-0002-7000-8000-000000000002',
   '0192a8c0-0000-7000-8000-000000000001',
   '0192a8c0-0000-7000-8000-0000000000ff',
   '0192a8c0-0000-7000-8000-0000000000ff',
   '0192a8c0-0001-7000-8000-000000000001',
   '33AABCT1234F1Z9', '33', 'Coimbatore')
ON CONFLICT (id) DO NOTHING;

-- Kaveri ElectroFab: minimal company only (RLS-probe counterpart).
INSERT INTO company (id, tenant_id, created_by, updated_by, legal_name, cin) VALUES
  ('0192a8c0-0001-7000-8000-000000000002',
   '0192a8c0-0000-7000-8000-000000000002',
   '0192a8c0-0000-7000-8000-0000000000ff',
   '0192a8c0-0000-7000-8000-0000000000ff',
   'Kaveri ElectroFab Industries', NULL)
ON CONFLICT (id) DO NOTHING;
