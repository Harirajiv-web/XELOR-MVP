-- =============================================================================
-- 0070 — ACHILES private platform assurance.
--
-- ACHILES records read-only synthetic checks for authorised internal operators. It does
-- not replace RELAY's service desk, HEXA's platform controls or ONYX's AI controls. The
-- result history is tenant-fenced and append-only so customers cannot see another tenant's
-- operating evidence and a later process cannot rewrite a past observation.
-- =============================================================================

CREATE TABLE platform_health_run (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  trigger         text NOT NULL CHECK (trigger IN ('hourly_schedule', 'manual')),
  overall_status  text NOT NULL CHECK (overall_status IN ('healthy', 'degraded', 'unavailable')),
  summary         text NOT NULL,
  checks          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(checks) = 'array'),
  duration_ms     integer NOT NULL CHECK (duration_ms >= 0),
  started_at      timestamptz NOT NULL,
  completed_at    timestamptz NOT NULL,
  CONSTRAINT ck_platformhealth_time CHECK (completed_at >= started_at)
);

CREATE INDEX ix_platformhealth_tenant_time
  ON platform_health_run (tenant_id, completed_at DESC);
CREATE INDEX ix_platformhealth_tenant_status
  ON platform_health_run (tenant_id, overall_status, completed_at DESC);

ALTER TABLE platform_health_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_health_run FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON platform_health_run
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

GRANT SELECT, INSERT ON platform_health_run TO app_user;
REVOKE UPDATE, DELETE ON platform_health_run FROM app_user;

INSERT INTO permission_catalogue (
  id, tenant_id, created_by, updated_by,
  permission, doc_type, action, description, is_privileged
)
SELECT
  gen_random_uuid(), t.id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  p.permission, p.doc_type, p.action, p.description, p.is_privileged
FROM tenant t
CROSS JOIN (VALUES
  ('platform_health.overview.read', 'platform_health_run', 'read',
   'Read private ACHILES platform-health status and check history.', false),
  ('platform_health.run.execute', 'platform_health_run', 'execute',
   'Run a private, read-only ACHILES platform-health check.', true)
) AS p(permission, doc_type, action, description, is_privileged)
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
  r.id, p.permission
FROM role r
CROSS JOIN (VALUES
  ('platform_health.overview.read'),
  ('platform_health.run.execute')
) AS p(permission)
WHERE r.code IN ('xelor_admin', 'it_admin', 'demo_admin')
ON CONFLICT DO NOTHING;
