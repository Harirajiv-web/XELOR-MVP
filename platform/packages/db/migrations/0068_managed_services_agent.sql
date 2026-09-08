-- =============================================================================
-- 0068 — RELAY Managed Services permission.
--
-- The managed-services MVP view is intentionally read-only and demonstrative. This
-- migration makes its one route reachable without inventing separate permission strings
-- for every tab that all read the same governed snapshot.
-- =============================================================================

INSERT INTO permission_catalogue (
  id, tenant_id, created_by, updated_by,
  permission, doc_type, action, description, is_privileged
)
SELECT
  gen_random_uuid(), t.id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  'managed_services.overview.read', 'managed_service', 'read',
  'Read the managed-service command centre, service catalogue, incidents, changes, reviews and responsibility map.',
  false
FROM tenant t
ON CONFLICT (tenant_id, permission) DO UPDATE
  SET doc_type = EXCLUDED.doc_type,
      action = EXCLUDED.action,
      description = EXCLUDED.description,
      is_privileged = EXCLUDED.is_privileged,
      updated_at = now(),
      updated_by = EXCLUDED.updated_by;

INSERT INTO role_permission (
  id, tenant_id, created_by, updated_by, role_id, permission
)
SELECT
  gen_random_uuid(), r.tenant_id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  r.id, 'managed_services.overview.read'
FROM role r
WHERE r.code IN ('admin', 'demo_admin', 'xelor_admin', 'operations_manager', 'it_admin')
ON CONFLICT DO NOTHING;
