-- =============================================================================
-- 0003_seed_rbac — demo roles, permissions, and assignments. Runs as OWNER.
-- Subjects are the FIXED Keycloak user ids set in infra/keycloak/realm-indcore.json:
--   poongodi     11111111-1111-4111-8111-111111111111  (Trishul, stores_incharge)
--   venkat       22222222-2222-4222-8222-222222222222  (Trishul, admin)
--   kaveri-admin 33333333-3333-4333-8333-333333333333  (Kaveri,  admin)
-- =============================================================================

-- ---- Trishul roles ----
INSERT INTO role (id, tenant_id, created_by, updated_by, code, name) VALUES
  ('0192a8c0-0003-7000-8000-000000000001','0192a8c0-0000-7000-8000-000000000001',
   '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','admin','Administrator'),
  ('0192a8c0-0003-7000-8000-000000000002','0192a8c0-0000-7000-8000-000000000001',
   '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','stores_incharge','Stores In-charge')
ON CONFLICT (id) DO NOTHING;

-- ---- Kaveri roles ----
INSERT INTO role (id, tenant_id, created_by, updated_by, code, name) VALUES
  ('0192a8c0-0003-7000-8000-000000000003','0192a8c0-0000-7000-8000-000000000002',
   '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','admin','Administrator')
ON CONFLICT (id) DO NOTHING;

-- ---- permissions per role ----
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission) VALUES
  -- Trishul admin: read + create
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','general.company.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000001','general.company.create'),
  -- Trishul stores_incharge: read only
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000002','general.company.read'),
  -- Kaveri admin: read + create
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','general.company.read'),
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0003-7000-8000-000000000003','general.company.create')
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;

-- ---- user -> role assignments (subject = Keycloak user id) ----
INSERT INTO user_role (id, tenant_id, created_by, updated_by, subject, role_id) VALUES
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','22222222-2222-4222-8222-222222222222','0192a8c0-0003-7000-8000-000000000001'), -- venkat -> Trishul admin
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','11111111-1111-4111-8111-111111111111','0192a8c0-0003-7000-8000-000000000002'), -- poongodi -> Trishul stores
  (gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','33333333-3333-4333-8333-333333333333','0192a8c0-0003-7000-8000-000000000003')  -- kaveri-admin -> Kaveri admin
ON CONFLICT (tenant_id, subject, role_id) DO NOTHING;
