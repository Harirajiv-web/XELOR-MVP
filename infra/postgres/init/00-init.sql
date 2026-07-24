-- Runs once on first container boot, as the bootstrap owner (indcore_owner).
-- Establishes the two-role model DECISIONS-V2 §1.2/§1.6 require:
--   indcore_owner : owns the schema, runs migrations (bypasses RLS — migrations only)
--   app_user      : the role the API connects as. NON-OWNER + NOBYPASSRLS, so
--                   FORCE ROW LEVEL SECURITY is a real fail-closed backstop.

-- pgvector is provided by the image; make the extension available.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- The application role. It can log in and use the schema, but owns nothing and
-- cannot bypass RLS. Every app query is therefore tenant-fenced by policy.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_pw' NOBYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE indcore TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- Tables are created later by migrations (run as indcore_owner). Ensure the app
-- role automatically receives DML on everything the owner creates from now on.
ALTER DEFAULT PRIVILEGES FOR ROLE indcore_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE indcore_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- The tenant GUC the app sets per-transaction: SET LOCAL app.current_tenant = '<uuid>'.
-- Declaring it here lets RLS policies read current_setting('app.current_tenant', true)
-- and lets an unset value fail closed (no tenant -> no rows).
ALTER DATABASE indcore SET app.current_tenant = '';
