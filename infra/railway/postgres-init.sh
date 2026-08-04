#!/bin/sh
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${APP_DATABASE_PASSWORD:?APP_DATABASE_PASSWORD is required}"

psql \
  --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set owner_role="$POSTGRES_USER" \
  --set database_name="$POSTGRES_DB" \
  --set app_password="$APP_DATABASE_PASSWORD" <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

SELECT 'CREATE ROLE app_user LOGIN NOBYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user')
\gexec

SELECT format('ALTER ROLE app_user LOGIN PASSWORD %L NOBYPASSRLS', :'app_password')
\gexec

GRANT CONNECT ON DATABASE :"database_name" TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

ALTER DATABASE :"database_name" SET app.current_tenant = '';
SQL
