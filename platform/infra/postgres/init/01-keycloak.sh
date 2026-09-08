#!/bin/sh
# Keycloak's own database, created beside `indcore` on first boot.
#
# In PRODUCTION Keycloak runs `start` against PostgreSQL and needs a real database. Local
# development runs `start-dev`, which keeps its own embedded file store and needs none —
# so this script does nothing there rather than failing the whole init and leaving a
# half-built cluster behind. Both compose files mount this directory; the difference is
# whether KEYCLOAK_DB_PASSWORD is set.
#
# Runs once, on an empty data volume, in filename order after 00-init.sql.
set -eu

if [ -z "${KEYCLOAK_DB_PASSWORD:-}" ]; then
  echo "01-keycloak: KEYCLOAK_DB_PASSWORD is unset — skipping (expected in local dev)."
  exit 0
fi

echo "01-keycloak: creating the keycloak role and database."

# `:'kcpw'` is psql's quoted-variable form, so the password is escaped by psql rather than
# interpolated into SQL by the shell.
psql -v ON_ERROR_STOP=1 -v kcpw="$KEYCLOAK_DB_PASSWORD" \
     --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'EOSQL'
	DO $$
	BEGIN
	  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'keycloak') THEN
	    CREATE ROLE keycloak LOGIN;
	  END IF;
	END
	$$;
	ALTER ROLE keycloak PASSWORD :'kcpw';
EOSQL

# CREATE DATABASE cannot run inside a transaction block, so it is its own invocation.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -c "CREATE DATABASE keycloak OWNER keycloak;"

echo "01-keycloak: done."
