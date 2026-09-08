#!/bin/sh
set -eu

api_health_url="${API_HEALTH_URL:-http://xelor-api.railway.internal:3000/api/v1/health}"
node infra/railway/wait-for-url.mjs "$api_health_url"
cd /app/apps/web
exec node scripts/run-next.mjs start
