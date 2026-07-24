-- =============================================================================
-- 0002_admin_rbac — ADMINISTRATION's in-app RBAC engine. Same §5.1 conventions +
-- FORCE RLS as everything else. Roles/assignments are tenant-owned.
-- =============================================================================

CREATE TABLE role (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  code        text NOT NULL,
  name        text NOT NULL,
  CONSTRAINT uq_role_tenant_code UNIQUE (tenant_id, code)
);
ALTER TABLE role ENABLE ROW LEVEL SECURITY;
ALTER TABLE role FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON role
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON role FROM app_user;

CREATE TABLE role_permission (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  role_id     uuid NOT NULL,
  permission  text NOT NULL,   -- module.entity.verb
  CONSTRAINT fk_roleperm_role FOREIGN KEY (role_id) REFERENCES role (id) ON DELETE RESTRICT,
  CONSTRAINT uq_roleperm UNIQUE (tenant_id, role_id, permission)
);
CREATE INDEX ix_roleperm_role ON role_permission (tenant_id, role_id);
ALTER TABLE role_permission ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permission FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON role_permission
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON role_permission FROM app_user;

CREATE TABLE user_role (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  subject     uuid NOT NULL,   -- Keycloak user id (token `sub`)
  role_id     uuid NOT NULL,
  CONSTRAINT fk_userrole_role FOREIGN KEY (role_id) REFERENCES role (id) ON DELETE RESTRICT,
  CONSTRAINT uq_userrole UNIQUE (tenant_id, subject, role_id)
);
CREATE INDEX ix_userrole_subject ON user_role (tenant_id, subject);
ALTER TABLE user_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_role
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
REVOKE DELETE ON user_role FROM app_user;
