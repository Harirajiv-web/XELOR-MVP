-- Local-upgrade companion for databases that applied the first 0076 draft. `demo_admin`
-- may run the no-hardware simulator policy evaluation end to end. This is not physical
-- machine authority; application code continues to hard-refuse every real edge dispatch.

UPDATE permission_catalogue
SET description = 'Ingest idempotent operational events through reserved factory edge gateway authority.',
    updated_at = now(),
    updated_by = '0192a8c0-0000-7000-8000-0000000000ff'::uuid
WHERE permission = 'factory.telemetry.ingest';

UPDATE role
SET description = 'Non-human identity reserved for idempotent Factory Connect telemetry. Signing and mTLS are required before physical deployment.',
    updated_at = now(),
    updated_by = '0192a8c0-0000-7000-8000-0000000000ff'::uuid
WHERE code = 'factory_edge_gateway';

INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT gen_random_uuid(), role.tenant_id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  role.id, 'factory.command.execute'
FROM role
WHERE role.code = 'demo_admin' AND role.is_active = true
ON CONFLICT (tenant_id, role_id, permission) DO UPDATE SET
  is_active = true,
  updated_at = now(),
  updated_by = EXCLUDED.updated_by;
