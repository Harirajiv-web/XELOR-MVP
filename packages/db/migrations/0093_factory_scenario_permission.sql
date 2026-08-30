-- =============================================================================
-- 0093 — Separate human demo-scenario authority from edge telemetry ingestion.
--
-- `factory.telemetry.ingest` remains the machine/edge identity boundary. Human demo roles
-- receive only the narrow mock-scenario permission, and only in the 3S demo tenant.
-- This is a forward correction because 0092 has already shipped and must stay immutable.
-- =============================================================================

-- 0092's append-only state rows use fixed asset ids. Refuse this forward step if an older
-- local/custom seed claimed one of the four 3S asset codes under another id; reconciling
-- primary keys here would risk touching unrelated history. A mismatched installation must
-- be repaired explicitly before it can advertise the Workroom scenario.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('AST-PNQ-VMC-01', '0192a8c0-0092-7000-8000-000000000010'::uuid),
      ('AST-PNQ-VMC-02', '0192a8c0-0092-7000-8000-000000000011'::uuid),
      ('AST-PNQ-TRN-01', '0192a8c0-0092-7000-8000-000000000012'::uuid),
      ('AST-PNQ-LTH-02', '0192a8c0-0092-7000-8000-000000000013'::uuid)
    ) AS expected(asset_code, asset_id)
    LEFT JOIN industrial_asset_binding asset
      ON asset.tenant_id = '0192a8c0-0000-7000-8000-000000000001'::uuid
     AND asset.asset_code = expected.asset_code
     AND asset.is_active = true
    WHERE asset.id IS NULL OR asset.id <> expected.asset_id
  ) THEN
    RAISE EXCEPTION '0093 precondition failed: 3S Workroom asset codes do not map to the fixed 0092 ids';
  END IF;
END $$;

INSERT INTO permission_catalogue (
  id, tenant_id, created_by, updated_by, permission, doc_type, action,
  description, is_privileged
)
SELECT CASE tenant.id
    WHEN '0192a8c0-0000-7000-8000-000000000001'::uuid
      THEN '0192a8c0-0093-7000-8000-000000000010'::uuid
    WHEN '0192a8c0-0000-7000-8000-000000000002'::uuid
      THEN '0192a8c0-0093-7000-8000-000000000011'::uuid
  END,
  tenant.id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  'factory.scenario.execute', 'factory_simulator_scenario', 'execute',
  'Execute an explicitly configured mock-only factory scenario; this does not grant generic telemetry ingestion or physical command authority.',
  true
FROM tenant
WHERE tenant.id IN (
  '0192a8c0-0000-7000-8000-000000000001'::uuid,
  '0192a8c0-0000-7000-8000-000000000002'::uuid
)
ON CONFLICT (tenant_id, permission) DO UPDATE SET
  doc_type = EXCLUDED.doc_type,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  is_privileged = EXCLUDED.is_privileged,
  is_active = true,
  updated_at = now(),
  updated_by = EXCLUDED.updated_by;

INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT CASE role.code
    WHEN 'demo_admin' THEN '0192a8c0-0093-7000-8000-0000000000a1'::uuid
    WHEN 'demo_kiln' THEN '0192a8c0-0093-7000-8000-0000000000a2'::uuid
  END,
  role.tenant_id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  role.id,
  'factory.scenario.execute'
FROM role
WHERE role.tenant_id = '0192a8c0-0000-7000-8000-000000000001'::uuid
  AND role.code IN ('demo_admin', 'demo_kiln')
  AND role.is_active = true
ON CONFLICT (tenant_id, role_id, permission) DO UPDATE SET
  is_active = true,
  updated_at = now(),
  updated_by = EXCLUDED.updated_by;

-- Revoke only the accidental human-demo grants from 0092. The reserved
-- `factory_edge_gateway` identity and every other role retain their existing posture.
UPDATE role_permission grant_row
SET is_active = false,
    updated_at = now(),
    updated_by = '0192a8c0-0000-7000-8000-0000000000ff'::uuid
FROM role
WHERE role.tenant_id = grant_row.tenant_id
  AND role.id = grant_row.role_id
  AND role.tenant_id = '0192a8c0-0000-7000-8000-000000000001'::uuid
  AND role.code IN ('demo_admin', 'demo_kiln')
  AND grant_row.permission = 'factory.telemetry.ingest'
  AND grant_row.is_active = true;

-- Migration-time RBAC proof: humans have only scenario authority, while every active
-- reserved gateway role keeps generic telemetry ingestion.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM role
    JOIN role_permission grant_row
      ON grant_row.tenant_id = role.tenant_id AND grant_row.role_id = role.id
    WHERE role.tenant_id = '0192a8c0-0000-7000-8000-000000000001'::uuid
      AND role.code IN ('demo_admin', 'demo_kiln')
      AND role.is_active = true
      AND grant_row.permission = 'factory.telemetry.ingest'
      AND grant_row.is_active = true
  ) THEN
    RAISE EXCEPTION '0093 invariant failed: a human demo role still holds factory.telemetry.ingest';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM role
    WHERE role.code = 'factory_edge_gateway'
      AND role.is_active = true
      AND NOT EXISTS (
        SELECT 1
        FROM role_permission grant_row
        WHERE grant_row.tenant_id = role.tenant_id
          AND grant_row.role_id = role.id
          AND grant_row.permission = 'factory.telemetry.ingest'
          AND grant_row.is_active = true
      )
  ) THEN
    RAISE EXCEPTION '0093 invariant failed: an active factory edge gateway lost telemetry authority';
  END IF;
END $$;
