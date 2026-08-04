#!/bin/sh
# Give app_user its real password, on first boot, before anything can connect.
#
# 00-init.sql creates the role with the literal 'app_pw'. That is correct for local
# development — the value is in the repository, matches .env.example, and the database is
# not reachable from anywhere. It is obviously wrong for a public host, and the repository
# is public, so the literal is a published credential the moment the port is.
#
# Rather than edit 00-init.sql (which local development, the demo seeders and the WSL
# proof runs all depend on), this closes the gap immediately afterwards. Set APP_DB_PASSWORD
# and the role never serves a single connection under the published one; leave it unset and
# local development is untouched.
#
# Runs once, on an empty data volume, after 00-init.sql and 01-keycloak.sh.
set -eu

if [ -z "${APP_DB_PASSWORD:-}" ]; then
  echo "02-app-user-password: APP_DB_PASSWORD is unset — leaving the development default."
  exit 0
fi

echo "02-app-user-password: setting the app_user password."

psql -v ON_ERROR_STOP=1 -v apppw="$APP_DB_PASSWORD" \
     --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -c "ALTER ROLE app_user PASSWORD :'apppw';"

echo "02-app-user-password: done."
