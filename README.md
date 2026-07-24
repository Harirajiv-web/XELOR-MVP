# IND-CORE Manufacturing ERP — MVP Prototype 1

The HEXA/GENERAL bootstrap: the boundary-enforced modular monolith every module
inherits. Built strictly to **`DECISIONS-V2.md`** (binding) — this scaffold makes
its §1/§5 conventions *executable* rather than aspirational.

> Scope of this prototype: the **platform foundation + the first vertical slice**
> (GENERAL → company master). It is deliberately one thin slice done *correctly*,
> not many done loosely — the point is to lock the patterns the other 15 modules copy.

## What's here

```
MVP_PROTOTYPE_1/
├─ infra/
│  ├─ docker-compose.yml        # PG17+pgvector · Valkey · Keycloak 26 · Gotenberg
│  └─ postgres/init/00-init.sql # app_user (NON-OWNER, NOBYPASSRLS) + extensions
├─ packages/
│  ├─ platform/                 # @ind-core/platform — the primitives §5 mandates
│  │  └─ src/{ids,errors,events,tenancy,audit,api}
│  └─ db/                       # @ind-core/db — Drizzle schema + RLS + migrations
│     ├─ src/schema/{platform,general}.ts
│     ├─ src/{client,migrate,rls-check}.ts
│     ├─ src/rls/leak-probe.test.ts        # two-tenant leak probe (§1.6)
│     └─ migrations/{0000_init,0001_seed}.sql
└─ apps/
   └─ api/                      # @ind-core/api — NestJS modular monolith
      └─ src/{main,app.module, common/*, modules/general/*}
```

### The conventions, made real

| DECISIONS-V2 rule | Where it lives |
|---|---|
| §1.1 module boundaries fail CI | `eslint.config.js` (eslint-plugin-boundaries) |
| §1.2/§1.6 pooled shared-schema + **FORCE RLS**, non-owner `app_user`, `SET LOCAL` per tx | `infra/postgres/init`, `migrations/0000`, `packages/db/client.ts` |
| §1.6 **every tenant-scoped table has an RLS policy** (CI gate) | `packages/db/src/rls-check.ts` |
| §1.6 **two-tenant leak probes on every migration** | `packages/db/src/rls/leak-probe.test.ts` |
| §3.3 append-only, hash-chained audit, **no disable switch** | `platform/audit/hash-chain.ts` + `audit_log` trigger in `0000` |
| §5.1 UUIDv7, tenant_id, created/updated/by, is_active, no hard DELETE | `db/schema/columns.ts`, `migrations/0000` |
| §5.3 canonical error envelope · cursor pagination · Idempotency-Key | `platform/errors`, `platform/api/pagination.ts`, `api/.../general.controller.ts` |
| §5.4 versioned events via transactional outbox | `platform/events/*`, `general.service.ts` |
| §5.5 ledger-critical writes synchronous in one tx | `general.service.ts` (write + audit + outbox atomic) |
| §7 canonical demo universe (Trishul, 2 GSTINs; Kaveri ElectroFab) | `migrations/0001_seed_demo_universe.sql` |

The **GENERAL create-company** path is the reference implementation of the pattern
every module repeats: in one tenant-fenced transaction it performs the domain write,
appends the hash-chained audit entry, and stages the outbox event — atomically.

## Run it

Prerequisites: **Docker** (for PG17/Valkey/Keycloak/Gotenberg) and **pnpm 9**.

```bash
corepack enable && corepack prepare pnpm@9 --activate   # or: npm i -g pnpm@9
cp .env.example .env

pnpm install
pnpm infra:up          # start the containers
pnpm db:migrate        # apply 0000_init + 0001_seed (as the schema owner)
pnpm db:rls-check      # §1.6 gate: fails if any tenant-scoped table lacks FORCE RLS
pnpm test              # unit tests + the two-tenant leak probe (needs infra up)
pnpm dev               # NestJS API on http://localhost:3000/api/v1
```

Exercise the slice. Auth is real Keycloak OIDC — get a token, then call with `Bearer`
(the tenant comes from the verified token's group, never a header):

```bash
# a token for the Trishul user (group 'trishul' -> Trishul tenant)
TOKEN=$(curl -s -X POST http://localhost:8080/realms/indcore/protocol/openid-connect/token \
  -d grant_type=password -d client_id=indcore-api -d username=poongodi -d password=demo \
  | grep -o '"access_token":"[^"]*"' | sed 's/.*:"//;s/"$//')

curl -s localhost:3000/api/v1/general/companies -H "authorization: Bearer $TOKEN"

curl -s -X POST localhost:3000/api/v1/general/companies \
  -H "authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" -H "content-type: application/json" \
  -d '{"legalName":"Trishul — new subsidiary"}'
```

Demo users (realm `indcore`, password `demo`) and their in-app roles:
**poongodi** → Trishul *stores_incharge* (read-only → `403` on create),
**venkat** → Trishul *admin* (read+create), **kaveri-admin** → Kaveri *admin*.
No token / bad signature → `401`; authenticated-but-unpermitted → `403`. Note: run
these **inside WSL** — Windows cannot reach the container ports on `localhost`.

CI aggregate: `pnpm ci` (lint → typecheck → test). Boundary + RLS gates are wired
from sprint 1, exactly as §1.1/§1.6 require.

## Honest caveats (read before running)

- **Docker is required** and isn't installed on the authoring machine, so the db/API
  paths were written against the pinned images but not executed here. Expect to run
  the steps above once Docker + pnpm are present.
- **Node:** the baseline is **22 LTS** (`.nvmrc`); this machine has 24, which is fine
  for dev. Pin to 22 for parity before shipping.
- **API build (ESM + SWC)** is the single most likely thing to need a small tweak on
  first `pnpm build`: NestJS + native ESM + SWC decorator-metadata is supported but
  version-sensitive. If DI complains, the fallback is the stock CJS+tsc Nest builder.
- **Auth is real Keycloak OIDC.** The tenant is derived only from a JWKS-signature-
  verified access token (§1.5) — never a trusted header (§2, CVE-2025-29927). Token →
  tenant uses a **group → tenant** mapping (a group per tenant); the production upgrade
  is Keycloak **Organizations** → the tenant registry, same guard logic. The demo
  password grant is dev-only; real clients use the auth-code flow.
- **Idempotency-Key** is enforced as *present* on mutations; the replay/dedup store
  is ADMINISTRATION's to build next.
- Implemented surface is intentionally just GENERAL → company + gst_registration.

## Next increments (in order)

1. ~~Keycloak realm + OIDC guard; retire the dev headers.~~ ✅ done (`feat/keycloak-oidc`).
2. ADMINISTRATION: ~~RBAC permission engine~~ ✅, ~~Idempotency replay store~~ ✅
   (a retried mutation replays its first result; no duplicates). Still to come:
   ABAC row/field scoping and the `WorkflowExecutor` (W1) port.
3. The outbox **relay** worker (Valkey/BullMQ) + idempotent consumer dedup.
4. Frontend app (Next.js 15/React 19 + shadcn/ui) against `/api/v1`.
5. Then the spine — ENGINEERING → INVENTORY → PURCHASE → PRODUCTION — per the ranking.
6. Upgrade auth: Keycloak Organizations → tenant (replacing the group stand-in);
   auth-code flow for the SPA; retire the demo password grant.
