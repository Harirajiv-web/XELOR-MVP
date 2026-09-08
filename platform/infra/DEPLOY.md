# Deploying XELOR to a single host

Everything here targets one virtual machine running Docker, serving the whole stack at one
hostname. It is the right shape for an investor demo or a pilot. It is **not** the target
described in `docs/00-governance/01-binding-platform-decisions-v2.md`, which specifies AWS
ap-south-1 provisioned with OpenTofu — that remains unbuilt.

> **None of this has been run.** The files were written against the code and validated for
> syntax; no deployment has been performed and no image has been built. Treat the first run
> as a commissioning exercise, not a formality.

---

## 1 · The server

One VM, **in an India region** — the compliance posture in the governance docs (DPDP,
CERT-In, MCA retention) assumes data residency, and a US region would contradict the
project's own binding decisions. AWS Mumbai (`ap-south-1`), DigitalOcean `BLR1` or
Hetzner all qualify.

Size it for nine containers, one of which is Keycloak and one of which is Postgres:
**4 vCPU / 8 GB RAM / 60 GB SSD** is comfortable. 2 vCPU / 4 GB will run it and will feel it.

Install Docker Engine and the Compose plugin. Open **only** 22, 80 and 443.

## 2 · DNS

One record, at whoever hosts `kisancred.com`:

| Type | Name | Value | TTL |
|---|---|---|---|
| `A` | `xelor` | *your server's IPv4* | 300 |

That is the whole DNS change. Keycloak lives at `https://xelor.kisancred.com/auth` on the
same hostname — no second record, no second certificate, and no cross-subdomain cookie
problem for the sign-in theme.

**Point DNS before the first `up`.** Caddy requests a certificate on boot and that request
fails if the name does not yet resolve to the machine.

## 3 · Configure

```bash
git clone https://github.com/Harirajiv-web/XELOR-MVP.git
cd XELOR-MVP
cp .env.production.example .env.production
```

Fill in every blank. Generate each secret separately:

```bash
openssl rand -base64 32
```

## 4 · Start

From the repository root — the image builds need the whole workspace as context:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file .env.production up -d --build
```

First run takes a while: two image builds, then Postgres initialises, then the `migrate`
container applies all 65 migrations and exits. The API and worker wait for it to finish
successfully before starting.

```bash
docker compose -f infra/docker-compose.prod.yml --env-file .env.production ps
docker compose -f infra/docker-compose.prod.yml --env-file .env.production logs -f migrate
```

## 5 · The realm — the step that is NOT automated

**The stack will start, and sign-in will not work until you do this.**

`infra/keycloak/realm-indcore.json` is deliberately not imported in production. It is a
demo artefact and importing it on a public host would be a security incident rather than a
shortcut:

- its client redirect URIs and web origin are deliberately limited to the local demo at
  `http://localhost:3001`; they are not valid production origins
- eight fixed users with published passwords (`hari` / `1234`, the rest `demo`)
- fixed user UUIDs that appear in this repository

So create the realm by hand, once, at `https://xelor.kisancred.com/auth/admin` using the
bootstrap admin from `.env.production`:

1. Realm `indcore`.
2. Client `indcore-api` — public client, standard flow on, direct access grants on.
   - Valid redirect URIs: `https://xelor.kisancred.com/*` — **this exact value, not `*`**
   - Web origins: `https://xelor.kisancred.com`
3. A **group membership** mapper on that client emitting claim `groups`, with *Full group
   path* OFF, added to the access token, ID token and userinfo.
4. Groups `trishul` and `kaveri`. These names are mapped to tenant UUIDs in
   `apps/api/src/common/tenant.middleware.ts` (`GROUP_TENANT`) — a user whose group is not
   in that map is rejected with `TENANT_MISSING`, by design.
5. Real users, in the right group, with real passwords.
6. Realm settings → Themes → Login theme → `indcore` for the XELOR sign-in page.

Then disable or rotate the bootstrap admin.

Roles and permissions are separate from Keycloak: the token establishes *who and which
tenant*, while the 138 permissions are resolved from `user_role` and `role_permission` in
Postgres. A new user with no rows there authenticates successfully and can open nothing.

## 6 · Verify

```bash
curl -I  https://xelor.kisancred.com                                   # 200
curl -s  https://xelor.kisancred.com/auth/realms/indcore/.well-known/openid-configuration | head -c 200
curl -i  https://xelor.kisancred.com/api/v1/general/companies           # 401
```

`web:200 · kc:200 · api:401` is the healthy state. **The API's 401 is its auth guard
answering, not a fault** — that is the same signal the local runbook uses.

## 7 · Demo data (optional, and only on a throwaway stack)

The seeders drive the real API over HTTP, so a green run is evidence the paths work:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file .env.production \
  exec -e API_BASE=http://api:3000 api node apps/api/scripts/demo/01-seed-base-world.mjs
```

They need the demo users to exist in Keycloak, which the hardened realm above will not have.
Seed only a stack you are willing to throw away.

`db:demo-reset` **refuses to run** unless the `tenant` table contains nothing but the two
demo tenants — point it at a real database and it stops without touching a row.

---

## What this does not do

- **No push-to-deploy.** There are no GitHub Actions workflows; deployment is `git pull`
  then `up -d --build`. Adding CI is a separate, small piece of work.
- **No backups.** `pgdata` is a Docker volume on one machine. Before anything real goes in,
  add `pg_dump` on a schedule to off-box storage. The append-only audit chain, ledger and
  payroll tables mean a restore is the *only* undo this system has.
- **No horizontal scale.** One API container, one worker. The outbox relay claims batches
  with `FOR UPDATE SKIP LOCKED`, so a second worker is safe when you need it.
- **No monitoring.** The locked stack names OpenTelemetry, Grafana and Sentry; none is wired.
- **Ports are closed by design.** Postgres, Valkey, Gotenberg, the API and the worker publish
  nothing. To reach Postgres, tunnel over SSH — do not add a `ports:` entry.
