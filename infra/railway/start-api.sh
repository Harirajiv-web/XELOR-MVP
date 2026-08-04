#!/bin/sh
set -eu

readiness_file="/tmp/xelor-api-ready"
rm -f "$readiness_file"

node packages/db/dist/wait-for-database.js
node packages/db/dist/migrate.js

node apps/api/dist/src/main.js &
api_pid=$!

cleanup() {
  if kill -0 "$api_pid" 2>/dev/null; then
    kill -TERM "$api_pid"
    wait "$api_pid" || true
  fi
}
trap cleanup INT TERM EXIT

port="${PORT:-3000}"
API_BASE="http://127.0.0.1:${port}"
export API_BASE
node infra/railway/wait-for-url.mjs "${API_BASE}/api/v1/health/live"

if [ "${SEED_DEMO_ON_BOOT:-true}" = "true" ]; then
  node packages/db/dist/seed-deployment-demo.js
fi

touch "$readiness_file"
echo "XELOR API is ready for public demo traffic."

wait "$api_pid"
exit_code=$?
trap - INT TERM EXIT
exit "$exit_code"
