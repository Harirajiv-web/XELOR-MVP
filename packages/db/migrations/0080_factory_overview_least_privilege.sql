-- Department roles use their scoped, projected Factory views. The combined overview is
-- reserved for platform/integration administrators and the explicit KILN/HEXA demo
-- capability roles; broad source-permission inheritance from 0076 is revoked here as a
-- forward-only correction for databases that already applied it.
UPDATE role_permission grant_row
SET is_active = false,
    updated_at = now(),
    updated_by = '0192a8c0-0000-7000-8000-0000000000ff'::uuid
FROM role
WHERE role.tenant_id = grant_row.tenant_id
  AND role.id = grant_row.role_id
  AND grant_row.permission = 'factory.connect.read'
  AND role.code NOT IN (
    'admin', 'xelor_admin', 'it_admin', 'demo_admin', 'demo_hexa', 'demo_kiln'
  );

INSERT INTO role_permission (
  id, tenant_id, created_by, updated_by, role_id, permission
)
SELECT gen_random_uuid(), role.tenant_id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  role.id, 'factory.connect.read'
FROM role
WHERE role.code IN (
    'admin', 'xelor_admin', 'it_admin', 'demo_admin', 'demo_hexa', 'demo_kiln'
  )
  AND role.is_active = true
ON CONFLICT (tenant_id, role_id, permission) DO UPDATE SET
  is_active = true,
  updated_at = now(),
  updated_by = EXCLUDED.updated_by;
