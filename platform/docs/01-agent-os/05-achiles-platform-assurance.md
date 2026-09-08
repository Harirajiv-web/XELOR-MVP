# ACHILES — Private platform assurance

**Status:** implemented MVP platform-health agent

**Position:** final specialist in the XELOR agent map

**Normal cadence:** once every hour

**Visibility:** authorised XELOR administrators and IT operators only
**Authority:** observe and record only

## Purpose in simple words

ACHILES answers one private question: **“Is XELOR working?”**

Every hour it performs fixed technical checks against the running application. It records
what passed, what failed, how long each check took and when the observation completed. It
does not ask a language model to guess whether the platform is healthy.

```text
              every hour
                  │
                  ▼
            ┌────────────┐
            │  ACHILES   │
            │ check only │
            └─────┬──────┘
                  │
     ┌────────────┼───────────────┬──────────────┐
     ▼            ▼               ▼              ▼
 Backend API   PostgreSQL     Event queue     Web application
     └────────────┼───────────────┴──────────────┘
                  ▼
        tenant-isolated result history
                  │ failed evidence
                  ▼
      RELAY coordinates the incident
                  │
                  ▼
  HEXA / ONYX / specialist diagnoses and repairs
```

## Exact checks

| Check | What it proves | Required in the MVP |
| --- | --- | --- |
| Backend API | The authenticated ACHILES endpoint is responding | Yes |
| PostgreSQL | A tenant-fenced database query completes | Yes |
| Event queue | Valkey accepts a private `PING` | Only when `VALKEY_URL` is configured |
| Web application | The public entry page returns a healthy HTTP response | Only when `XELOR_WEB_URL` is configured |
| AI runtime | The configured runtime mode is declared; deterministic demo mode needs no external model call | No |

Each remote probe has a four-second timeout. A required failure marks XELOR unavailable. An
optional failure marks it degraded. A service that has not been configured is shown as
`not_configured`; it is never falsely reported as passed.

## What ACHILES is not allowed to do

- No ERP business record can be created, changed or deleted.
- No process, container or service can be restarted.
- No root-cause diagnosis is claimed from a simple availability check.
- No incident clock, customer message, contractual SLA decision or service credit is owned.
- No Agent OS action can be dispatched. ACHILES only has
  `platform-health.status.read` in the capability registry.
- No ordinary customer role receives either platform-health permission.

The ownership split is deliberate:

| Stage | Accountable owner |
| --- | --- |
| Detect and record | ACHILES |
| Coordinate the service incident and customer update | RELAY |
| Diagnose and repair | HEXA, ONYX or the affected specialist |
| Approve contractual or high-impact decisions | Authorised person |

## Stored evidence

`platform_health_run` is an append-only, row-level-security-protected PostgreSQL table. Each
row records tenant, actor, trigger (`hourly_schedule` or `manual`), overall result, component
results, latencies, start time, completion time and total duration. The UI shows the latest
24 observations. A latest result older than 90 minutes is explicitly marked stale.

The database role can select and insert records but cannot update or delete them. This keeps
the historical evidence separate from the live screen.

## Access and endpoints

| Endpoint | Permission or protection | Purpose |
| --- | --- | --- |
| `GET /api/v1/platform-health/overview` | `platform_health.overview.read` | Latest result, freshness and history |
| `POST /api/v1/platform-health/run` | `platform_health.run.execute` | Authorised operator check for the current tenant |
| `GET /api/v1/internal/platform-health/run` | `Authorization: Bearer <CRON_SECRET>` | Scheduled check for every active tenant |

The two role permissions are seeded only to `xelor_admin`, `it_admin` and `demo_admin`.
The internal scheduler endpoint has no customer identity path and requires `CRON_SECRET`.

## Scheduling options

ACHILES supports two deployment shapes without changing its business rules:

1. **Long-running API container (Docker/Railway/local):** set
   `ACHILES_BACKGROUND_ENABLED=true`. The API starts a private in-process interval and uses
   `ACHILES_INTERVAL_MS=3600000` by default.
2. **Serverless API (Vercel or an external scheduler):** leave the background interval off
   and call the secret-protected internal endpoint hourly. `apps/api/vercel.json` contains
   the intended cron schedule; the hosting plan must support that frequency.

Set `XELOR_WEB_URL` to the public demo URL so the web application is included in every
observation. Set `VALKEY_URL` to include the event queue. The interval has a five-minute
minimum to prevent accidental rapid polling.

## Failure and recovery behaviour

- Only one all-tenant sweep runs at a time.
- A failure for one tenant does not prevent checks for the remaining tenants.
- All reads and saved results execute inside explicit tenant context.
- A failed check is evidence, not an automatic repair command.
- Manual ERP operation and the AI kill switch remain independent of ACHILES.
- The next healthy observation proves availability returned; RELAY and the technical owner
  still decide whether the incident can close.

## Demo route

Open **ACHILES → Private status** as an authorised demo administrator. Press **Run private
check now**, show the component results and then show the new immutable history row. Finish
with the hand-off note at the bottom: ACHILES detects, RELAY coordinates and the technical
owner repairs.

Do not present the background agent as a customer feature or as production observability.
It is an honest MVP heartbeat with real database history and real access boundaries.
