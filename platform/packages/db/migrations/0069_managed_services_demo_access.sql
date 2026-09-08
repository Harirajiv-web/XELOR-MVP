-- The isolated public-demo identity uses demo_admin rather than the normal admin role.
-- Keep the ordinary authorization path: grant the same registered permission instead of
-- bypassing the guard for demo traffic. This corrective migration is required for local
-- databases that had already applied 0068 before demo_admin was added to its fresh-install
-- role list.

INSERT INTO role_permission (
  id, tenant_id, created_by, updated_by, role_id, permission
)
SELECT
  gen_random_uuid(), r.tenant_id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  r.id, 'managed_services.overview.read'
FROM role r
WHERE r.code = 'demo_admin'
ON CONFLICT DO NOTHING;
