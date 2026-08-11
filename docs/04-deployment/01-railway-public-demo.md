# Railway public-demo deployment

This deployment is intentionally optimized for an investor demo, not production. It opens
straight into the isolated XELOR demo identity, loads and verifies the sample world
automatically, and exposes only the Next.js web service to the internet.

## Why Railway, and what “free” means

Railway is the better match for this repository because the complete demo runtime needs
five continuously running services. Railway's current trial provides a one-time USD 5
credit for up to 30 days and permits at most five services. After the trial, the Free plan
includes only USD 1 of monthly usage, so this five-service stack is **not expected to remain
free indefinitely**. Treat it as a temporary public demo and suspend it when it is not being
shown.

Render is a worse fit for this exact topology: its free allowance provides 750 web-service
hours per workspace each month (approximately one always-on service), free web services
sleep after 15 idle minutes, background workers are not free, and its free PostgreSQL
database expires after 30 days.

Current platform references:

- [Railway free trial](https://docs.railway.com/pricing/free-trial)
- [Railway plans](https://docs.railway.com/pricing/plans)
- [Railway config as code](https://docs.railway.com/config-as-code/reference)
- [Render free services](https://render.com/docs/free)

## Hosted topology

```text
Public visitor
      |
      v
xelor-web (public Railway URL, Next.js)
      |
      | same-origin /api/v1 proxy over Railway private DNS
      v
xelor-api (NestJS, private) ------> xelor-postgres (PG17 + pgvector, volume)
      |                                      ^
      | transactional outbox                 |
      v                                      |
xelor-valkey (private) <------ xelor-worker -+
```

The local Compose file also contains Keycloak and Gotenberg. They are deliberately absent
from the hosted demo:

- Keycloak is replaced by the existing `API_PUBLIC_DEMO` / `NEXT_PUBLIC_PUBLIC_DEMO`
  mode. This is acceptable only because the database is a disposable investor dataset and
  the URL must be sign-in-free. It must never be used for real company data.
- Gotenberg is not referenced by the current API or web code, so running it would spend
  credit without enabling a demo feature.

This reduction brings the deployment from seven services to Railway Trial's five-service
limit without removing a working product feature.

## Files supplied

| File | Purpose |
|---|---|
| `infra/railway/Dockerfile.web` | Reproducible Next.js image with public-demo settings built in |
| `infra/railway/Dockerfile.api` | Shared API/worker image built from the pnpm monorepo |
| `infra/railway/Dockerfile.postgres` | PostgreSQL 17 image with pgvector and safe role bootstrap |
| `infra/railway/Dockerfile.valkey` | Pinned Valkey 8 image |
| `infra/railway/*.railway.json` | Per-service build, start, restart, watch, and health settings |
| `infra/railway/start-*.sh` | Migration, one-time seed, verification, and startup ordering |
| `infra/railway/docker-compose.demo.yml` | Local build/run parity check for all five hosted containers |

## Deploy from GitHub

### 1. Create the project and shared secrets

Create a blank Railway project, preferably in the Singapore region for an India-facing
demo. In the project environment's **Shared Variables**, create:

```dotenv
POSTGRES_PASSWORD=<48-character hex value>
APP_DATABASE_PASSWORD=<different 48-character hex value>
```

Generate URL-safe values locally with `openssl rand -hex 24`. Do not reuse the example
local passwords from `.env.example`.

### 2. Add exactly five GitHub services

Add the same `Harirajiv-web/XELOR-MVP` GitHub repository five times. Give the services these
exact names and select the matching config-file path in each service's **Settings → Config
as Code**:

| Railway service name | Config file path |
|---|---|
| `xelor-postgres` | `/infra/railway/postgres.railway.json` |
| `xelor-valkey` | `/infra/railway/valkey.railway.json` |
| `xelor-api` | `/infra/railway/api.railway.json` |
| `xelor-worker` | `/infra/railway/worker.railway.json` |
| `xelor-web` | `/infra/railway/web.railway.json` |

Keep the repository root directory as `/`. The service names matter because the supplied
private-network URLs use them.

### 3. Attach the database volume

Open `xelor-postgres`, add a volume, and mount it at:

```text
/var/lib/postgresql/data
```

No volume is needed for Valkey in this demo; the database outbox remains the durable source
of pending events.

### 4. Set service variables

Railway supports references such as `${{shared.POSTGRES_PASSWORD}}`. Paste the following
variables into each service. The reference expressions should remain expressions, not be
replaced with copied secret text.

#### `xelor-postgres`

```dotenv
POSTGRES_DB=indcore
POSTGRES_USER=indcore_owner
POSTGRES_PASSWORD=${{shared.POSTGRES_PASSWORD}}
APP_DATABASE_PASSWORD=${{shared.APP_DATABASE_PASSWORD}}
```

#### `xelor-api`

```dotenv
PORT=3000
NODE_ENV=production
API_SELF_ORIGIN=http://127.0.0.1:3000
API_PUBLIC_DEMO=true
AI_PROVIDER=stub
DB_POOL_MAX=5
DATABASE_OWNER_URL=postgresql://indcore_owner:${{shared.POSTGRES_PASSWORD}}@xelor-postgres.railway.internal:5432/indcore
DATABASE_URL=postgresql://app_user:${{shared.APP_DATABASE_PASSWORD}}@xelor-postgres.railway.internal:5432/indcore
VALKEY_URL=redis://xelor-valkey.railway.internal:6379
SEED_DEMO_ON_BOOT=true
DEMO_SEED_VERSION=railway-public-demo-v1
READINESS_FILE=/tmp/xelor-api-ready
```

#### `xelor-worker`

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://app_user:${{shared.APP_DATABASE_PASSWORD}}@xelor-postgres.railway.internal:5432/indcore
VALKEY_URL=redis://xelor-valkey.railway.internal:6379
API_HEALTH_URL=http://xelor-api.railway.internal:3000/api/v1/health
```

#### `xelor-web`

```dotenv
PORT=3001
NODE_ENV=production
NEXT_PUBLIC_PUBLIC_DEMO=true
NEXT_PUBLIC_API_ORIGIN=http://xelor-api.railway.internal:3000
API_HEALTH_URL=http://xelor-api.railway.internal:3000/api/v1/health
```

`xelor-valkey` requires no variables.

### 5. Deploy and create the public URL

Deploy `xelor-postgres` and `xelor-valkey` first, then `xelor-api`, followed by the worker
and web services. The API startup performs all database migrations, loads both demo seed
scripts once, runs the investor-demo verification matrix, and only then becomes healthy.
The first deployment can therefore take several minutes.

In `xelor-web` only, open **Settings → Networking → Public Networking** and generate a
Railway domain. Do not generate public domains for the other four services.

Open the generated `https://...up.railway.app` URL. The home page should load without a
sign-in screen, and `/api/v1/health` through that same domain should return:

```json
{"status":"ok","service":"xelor-api"}
```

## GitHub-to-demo deployment flow

After the five services are linked to the repository, a push to the selected GitHub branch
triggers only the services whose `watchPatterns` match the changed files. Railway builds
the pinned Dockerfile, waits for its health check, and replaces the previous deployment.
Database migrations are forward-only and the named seed version is recorded in PostgreSQL,
so ordinary API restarts do not reload the demo world.

When the intended seed content changes, update `DEMO_SEED_VERSION` (for example to
`railway-public-demo-v2`) to run the idempotent seed and verification sequence once more.

## Keep usage as low as possible

- Keep `AI_PROVIDER=stub`; it is deterministic and creates no model bill.
- Expose only `xelor-web`; private traffic avoids unnecessary public egress and attack
  surface.
- Suspend `xelor-worker` and `xelor-valkey` between presentations if asynchronous outbox
  delivery is not being demonstrated. Core screens and synchronous transactions still use
  the API and PostgreSQL.
- Suspend the whole project when nobody needs the public URL. Railway bills actual resource
  usage, and five services are unlikely to fit inside the post-trial USD 1 monthly credit.
- Treat the database as disposable. The free/trial setup is not a backup strategy.

## Local five-container validation

From the repository root:

```bash
export POSTGRES_PASSWORD="$(openssl rand -hex 24)"
export APP_DATABASE_PASSWORD="$(openssl rand -hex 24)"
docker compose -f infra/railway/docker-compose.demo.yml build
docker compose -f infra/railway/docker-compose.demo.yml up
```

Then open `http://localhost:3001`. Stop with `Ctrl+C`, followed by:

```bash
docker compose -f infra/railway/docker-compose.demo.yml down
```

If ports 3000 or 3001 are already occupied, set `XELOR_API_HOST_PORT` and
`XELOR_WEB_HOST_PORT` before `up`; container-to-container addresses do not change.

Add `--volumes` only when intentionally deleting the disposable local demo database.

## Optional custom domain

Once the Railway URL works, add `xelor.kisancred.com` as a custom domain on `xelor-web`.
Railway will show the exact DNS target. Add that CNAME at the authoritative DNS provider,
leave proxying off until Railway issues TLS, and do not change the apex `kisancred.com`
records. Keep the Railway-generated domain available as a fallback.
