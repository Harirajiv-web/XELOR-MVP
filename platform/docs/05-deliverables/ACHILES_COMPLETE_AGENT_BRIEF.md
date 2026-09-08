# ACHILES — Complete Agent Brief

**Platform:** XELOR  
**Agent role:** Private Platform Assurance  
**Implementation status:** Working MVP  
**Visibility:** Authorised XELOR administrators and IT operators only  
**Authority:** Observe and record only

## ACHILES in one sentence

ACHILES privately checks whether the XELOR platform is responding, records the result as
tenant-separated evidence, and shows authorised readers when that evidence is old or
failing. It then stops so RELAY and the accountable technical owner can coordinate and
perform any repair.

> **The most important rule:** ACHILES detects and records. It does not diagnose, repair,
> restart, change ERP data, open a customer conversation, or dispatch an Agent OS action.

## Quick facts

| Question | Answer |
| --- | --- |
| What kind of agent is it? | A deterministic technical monitoring agent, not a general-purpose AI or chatbot |
| Where is it in XELOR? | The ninth and final registered agent, after RELAY |
| Which module does it own? | **Platform Health** |
| Main screen | **ACHILES → Private status** (`/platform-health/status`) |
| Normal cadence | Every 60 minutes |
| Manual run | Available to an authorised operator |
| Main output | Healthy, degraded, unavailable, stale, or never run, with component evidence |
| Stored history | Latest 24 runs shown in the UI; all stored runs remain in PostgreSQL unless separately retained or removed by an authorised database process |
| Agent OS capability | `platform-health.status.read` |
| Side effects | None |
| Customer visibility | Hidden from ordinary customer roles |
| Licence grouping | The web module uses the `aiops` licence key |

The repository uses **ACHILES** as the product name. It does not define an official acronym
expansion, so this brief does not invent one.

## Why ACHILES exists

The ERP can continue to contain business records even when part of the software platform is
unavailable. A stored sales order, for example, does not prove that the web application,
API, database and supporting runtime are all responding now.

ACHILES creates a separate, private evidence trail for that question:

```text
Hourly schedule or authorised operator
                  |
                  v
        ACHILES runs fixed probes
                  |
                  v
       Classify the current result
                  |
                  v
    Store tenant-separated evidence
                  |
 authorised person or mission reads
       a failure or stale result
                  v
 operating hand-off to RELAY
       (this is not automatic)
                  |
                  v
   Technical owner diagnoses and repairs
```

It is deliberately separate from:

- **RELAY**, which owns service-incident coordination, severity, clocks and customer updates.
- **HEXA**, which owns platform governance, identity, permissions and security controls.
- **ONYX**, which coordinates Agent OS missions and AI controls.
- The business agents, which own their own sales, supply, planning, factory and finance work.

## Exactly what ACHILES checks

Every run creates the same five component results.

| Check | Required? | What the current implementation actually proves |
| --- | --- | --- |
| **Backend API** | Yes | The ACHILES service is currently executing inside the API process. It is a process-level self-check, not a separate outside-network probe. |
| **PostgreSQL database** | Yes | A `SELECT 1` query completed inside the current tenant context and row-level-security boundary. |
| **Event queue** | Optional | When `VALKEY_URL` is configured, Valkey accepted a private `PING` and returned `PONG`. |
| **Web application** | Optional | When a web URL is configured, its public entry page returned an HTTP response from 200 through 399. Redirects are followed. |
| **AI runtime** | Optional/informational | The configured provider string is recorded as `passed` with `0 ms`. The current check is hard-coded: it never calls the provider, cannot fail, and cannot make the overall result degraded or unavailable. It does **not** prove model access, inference or quality. |

Each active remote/database probe has a four-second overall timeout. The Valkey client also
uses a two-second connection timeout. A component that is not configured is labelled
`not_configured`; it is never falsely shown as passed.

The database, Valkey and web probes run one after another, not in parallel. There is no
separate slow-response warning below the timeout: for example, a response just under four
seconds still passes and only its measured latency shows that it was slow.

## How ACHILES decides the overall result

ACHILES keeps component status, overall status and freshness as separate ideas.

### Component status

- `passed` — the configured probe completed successfully.
- `failed` — the configured probe failed or exceeded its timeout.
- `not_configured` — the optional endpoint was not supplied in this environment.

### Overall status

| Overall result | Meaning |
| --- | --- |
| `healthy` | No configured check failed. Optional checks may still be `not_configured`. |
| `degraded` | The required checks passed, but at least one configured optional check failed. |
| `unavailable` | At least one required check failed. Today the required checks are API and database. |

### Freshness

- `never_run` — no evidence exists for this tenant yet.
- `current` — the newest completed result is no more than 90 minutes old.
- `stale` — the newest result is older than 90 minutes.

A stale result is shown as a warning even when the last recorded colour was green. This
prevents a stopped monitor from leaving an old healthy result looking current. It is a
passive dashboard state: ACHILES does not actively send that warning to anyone.

## What happens during a run

1. A manual operator action or private schedule starts the run.
2. ACHILES enters one explicit tenant context.
3. It records the start time and creates the API self-check result.
4. It runs the database, event-queue and web probes with bounded timeouts.
5. It records the declared AI-provider mode.
6. It classifies required and optional failures.
7. It creates a plain-language summary.
8. It inserts one new `platform_health_run` evidence row.
9. The UI reloads the latest status and history.
10. If an authorised person or mission sees failing or stale evidence, the operating model
    hands responsibility to RELAY and the relevant technical owner. ACHILES performs no
    follow-up action or automatic hand-off itself.

The scheduled all-tenant sweep continues when one tenant fails. Its response contains only
aggregate counts for checked, healthy, degraded and unavailable tenants; it does not expose
one tenant's evidence to another.

## What the Private status screen shows

The permission-gated screen is designed to answer the question without requiring technical
knowledge. It shows:

- a headline: **Waiting**, **XELOR is working**, **working with a warning**, **needs
  attention**, or **last result is stale**;
- whether the monitor is private, hourly and read-only;
- the scheduler mode and last completion time;
- one card for API, database, event queue, web application and AI runtime;
- pass, fail or not-configured status for each component;
- measured latency for configured probes;
- the latest 24 immutable application-level observations;
- whether each row came from the hourly schedule or an internal operator;
- total run duration and configured-check pass count; and
- the hand-off rule explaining that RELAY and the technical owner take over after detection.

The **Run private check now** button appears only when the viewer has execute permission.
The module also supplies a small status signal to the XELOR shell: Waiting, Working, Stale,
At risk or Unavailable. This is a passive dashboard signal, not an alert source: ACHILES
does not create an alert-centre item, emit an incident event, start a mission, page anyone
or call RELAY. An authorised reader must load the page/dashboard, or a mission must read
the saved evidence. The screen has a tested phone layout.

## Access, privacy and security

### User endpoints

| Endpoint | Protection | Purpose |
| --- | --- | --- |
| `GET /api/v1/platform-health/overview` | `platform_health.overview.read` | Read latest status, freshness and history |
| `POST /api/v1/platform-health/run` | `platform_health.run.execute` | Run one manual, read-only check for the current tenant |
| `GET /api/v1/internal/platform-health/run` | `Authorization: Bearer <CRON_SECRET>` | Run a scheduled sweep for every active tenant |

The initial database policy grants the two user permissions only to:

- `xelor_admin`
- `it_admin`
- `demo_admin`

`platform_health.run.execute` is marked privileged. Ordinary customer roles do not receive
either permission, so the normal UI does not show the module to them. The public presenter
demo may show it through the disposable `demo_admin` identity; that exception must not be
used with real customer data.

The internal scheduler endpoint intentionally has no customer token. It is excluded from
normal tenant-token middleware, requires an exact bearer `CRON_SECRET`, enumerates active
tenants internally, and then enters each tenant context before reading or writing evidence.

### Stored evidence

The PostgreSQL table `platform_health_run` stores:

- tenant and actor identity;
- manual or hourly trigger;
- healthy, degraded or unavailable result;
- plain-language summary;
- all component results and latencies as JSON;
- start and completion timestamps; and
- total duration.

The table uses forced PostgreSQL row-level security. The application database role may
`SELECT` and `INSERT`, but may not `UPDATE` or `DELETE`. This makes the history append-only
for the application. It is an access-controlled database guarantee, not a cryptographic
claim that a database owner could never alter data.

The database indexes tenant/time and tenant/status/time for recent-status queries. The API
returns the latest 24 rows. No automatic retention or archive policy is implemented yet.

## How ACHILES participates in Agent OS

> **Important implementation split:** the Platform Health module performs and stores manual
> and scheduled checks. The ACHILES identity inside Agent OS can only read the saved
> overview. A mission cannot use ACHILES to start a new check.

ACHILES has exactly one registered capability:

| Capability | Mode | Permission | Approval | Side effect |
| --- | --- | --- | --- | --- |
| `platform-health.status.read` | Read | `platform_health.overview.read` | Not required | No |

That capability returns the tenant's latest deterministic checks, freshness and recent
history. Only ACHILES may use it. ACHILES is intentionally absent from
`agent.action.dispatch`, so a mission cannot turn its health observation into an automatic
repair or customer message. Its allow-list contains only the `platform-health.` capability
family, and it delegates to no other agent.

Its mission roles are:

- **Nine-agent operating review:** read private health evidence, prepare a bounded
  availability assessment, join the eight specialist lanes, wait for human approval, and
  let ONYX publish the joined brief.
- **Nine-agent controlled-action mission:** contribute read-only evidence and a
  recommendation before the human gate. Seven other lanes may create governed internal work
  items after approval; ACHILES creates none.
- **Factory Flow recovery:** preserve the platform boundary only. This graph's ACHILES node
  does not call `platform-health.status.read`; it only restates that XELOR platform health
  and robot-cell operation are different responsibilities, and it must not assess or command
  a robot cell.

Every capability use re-checks the mission caller's current permission. If the caller may
not read private platform health, the ACHILES evidence lane is skipped rather than exposing
the data. Run presentation also re-authorises stored outputs for the current viewer.

The mission's assessment text is produced by a generic deterministic reasoner. It mainly
counts and references upstream evidence; it does not semantically diagnose the five health
components or find a root cause. The meaningful live content comes from ACHILES's saved
Platform Health overview.

## Responsibility hand-off

| Stage | Accountable owner |
| --- | --- |
| Detect availability, latency and stale evidence | **ACHILES** |
| Coordinate incident, severity, clock, escalation and customer update | **RELAY** |
| Diagnose identity, database or integration controls | **HEXA** or the relevant technical owner |
| Diagnose AI-runtime controls | **ONYX** or the AI technical owner |
| Diagnose and repair a domain component | The accountable specialist/engineering owner |
| Approve contractual, service-credit or other high-impact decisions | An authorised person |

This is currently an operating contract, not a complete automated hand-off. ACHILES does
not yet open a RELAY incident, page an on-call person, send a notification or close an
incident automatically. It stores and displays the evidence from which that process begins.
RELAY's current operating view is also an illustrative managed-service snapshot rather than
a live ITSM integration.

## Scheduling and configuration

ACHILES supports two scheduling shapes.

### Long-running API deployment

Set:

```env
ACHILES_BACKGROUND_ENABLED=true
ACHILES_INTERVAL_MS=3600000
XELOR_WEB_URL=https://your-xelor-web.example
VALKEY_URL=redis://your-valkey:6379
```

The first background sweep starts about 15 seconds after the API module starts. Later sweeps
use the configured interval. The code enforces a minimum interval of five minutes; invalid
values fall back to one hour.

Current reporting caveat: the overview always displays `cadenceMinutes: 60` and says the
internal hourly scheduler is enabled, even when `ACHILES_INTERVAL_MS` is set to another
allowed interval. The actual timer uses the configured interval, but this displayed cadence
does not yet adapt to it.

### Serverless or external scheduler

Leave the background interval disabled and call:

```text
GET /api/v1/internal/platform-health/run
Authorization: Bearer <CRON_SECRET>
```

`apps/api/vercel.json` declares an hourly cron. The actual cadence still depends on the
hosting plan and scheduler being available.

### Relevant environment variables

| Variable | Effect |
| --- | --- |
| `ACHILES_BACKGROUND_ENABLED` | Enables the in-process interval only when exactly `true` |
| `ACHILES_INTERVAL_MS` | Interval in milliseconds; default one hour, minimum five minutes |
| `XELOR_WEB_URL` | Web entry URL to probe |
| `VERCEL_PROJECT_PRODUCTION_URL` | Fallback web hostname when `XELOR_WEB_URL` is absent |
| `VALKEY_URL` | Enables the event-queue PING probe |
| `AI_PROVIDER` | Declares the AI runtime mode shown in evidence; default is `stub` |
| `CRON_SECRET` | Protects the all-tenant scheduler endpoint |

## Failure and recovery behaviour

- One process refuses a second overlapping all-tenant sweep with `already_running`.
- The overlap flag is process-local. Multiple API replicas do not share a distributed
  ACHILES lock and may create duplicate scheduled observations.
- Manual runs have no idempotency key or concurrency lock. Repeated or concurrent authorised
  requests are separate checks and can insert separate history rows.
- A failure in one tenant does not stop the remaining active tenants from being checked.
- A new healthy observation proves that the checked endpoints responded again.
- RELAY and the technical owner still decide whether an incident can close.
- Manual ERP operation and the Agent OS/AI kill switch are independent of ACHILES.
- The in-process timer is not a durable job queue; a process restart resets its timing.

## What a green ACHILES result does—and does not—mean

### It means

- the API process was able to execute the check;
- a tenant-scoped database query worked;
- every configured network/database optional probe responded;
- the configured AI-provider string was recorded, without testing that provider;
- no configured probe exceeded its timeout; and
- the stored observation is recent if freshness is `current`.

### It does not prove

- every ERP workflow is correct;
- a user can complete an end-to-end order or payment journey;
- Keycloak sign-in, every external connector, the worker or every outbox message is healthy;
- backups can be restored;
- security, performance, capacity or disaster-recovery targets are met;
- logs, metrics and traces are complete;
- an external AI model can answer correctly;
- a physical factory device is connected or safe; or
- a customer SLA has been met.

## Current MVP limitations

ACHILES is an honest heartbeat, not a production observability platform. It currently has:

- no metrics aggregation, distributed tracing, log search or SLO burn-rate calculation;
- no external synthetic transaction that signs in and completes a business workflow;
- no active alert-centre event, mission trigger, paging, email, chat, on-call or customer
  status-page integration;
- no automatic RELAY incident creation or ITSM connector;
- no root-cause analysis, anomaly prediction or automatic remediation;
- sequential database, Valkey and web probes, with no slow-response threshold below timeout;
- no idempotency or concurrency guard for separate manual-run requests;
- no distributed scheduler lock across multiple API replicas;
- no configured history-retention or archive policy;
- no external vantage point when the in-process API itself is down; and
- no way to persist a database-failure row if the same database is unavailable for the
  evidence insert. In that case the scheduler can count the tenant as unavailable, but an
  outside monitor is still needed to preserve the outage evidence.

These limitations are important: if the API process is fully down, the in-process ACHILES
worker cannot report its own outage. Production deployment should pair ACHILES with an
external uptime monitor and proper observability/on-call tooling.

## Existing verification

The repository includes checks that verify:

- a complete demo stack can run all five component checks and preserve a new history row;
- the private status screen remains understandable on a phone-sized display;
- ACHILES is the ninth/final registered agent;
- its only Agent OS capability is the non-side-effecting health read;
- it never receives an action-dispatch node in controlled missions; and
- private health evidence is skipped when a mission caller lacks the required permission.

The full-stack browser test requires `XELOR_WEB_URL` and `VALKEY_URL`; otherwise those
optional checks honestly show `not_configured` instead of passed.

The dedicated ACHILES browser test exists, but the current GitHub CI workflow does not
select it. CI's broad route smoke opens the ACHILES page without pressing the run button.
The five-probe and new-history-row journey is therefore available through a full or manual
Playwright run, not as a currently required CI gate.

There is not yet a dedicated Platform Health service unit-test suite that exercises every
required/optional failure combination. The current strongest proof is the complete-stack
browser journey plus the Agent OS permission and no-action regressions.

## Simple demonstration

1. Sign in as an authorised demo administrator.
2. Open **ACHILES → Private status**.
3. Explain the current/stale/never-run headline.
4. Press **Run private check now**.
5. Show the five deterministic component cards. Database, Valkey and web carry measured
   latency; the API self-marker and AI-mode declaration currently show `0 ms`.
6. Show the new **Internal operator** row in the append-only history.
7. Finish with the hand-off statement: **ACHILES detects; RELAY coordinates; the technical
   owner diagnoses and repairs.**

Do not present this as a customer-facing status page, full production observability,
root-cause analysis or automatic repair.

## Technical source map

| Concern | Source |
| --- | --- |
| Core probes, status logic and scheduler | `apps/api/src/modules/platform-health/platform-health.service.ts` |
| User and cron API endpoints | `apps/api/src/modules/platform-health/platform-health.controller.ts` |
| Nest module | `apps/api/src/modules/platform-health/platform-health.module.ts` |
| Database schema | `packages/db/src/schema/platform-health.ts` |
| Table, RLS, permissions and role grants | `packages/db/migrations/0070_achiles_platform_health.sql` |
| Agent identity | `packages/platform/src/agent-os/types.ts` |
| Agent OS capability | `apps/api/src/agent-os/capability-registry.service.ts` |
| Agent OS mission roles | `apps/api/src/agent-os/graph-registry.service.ts` |
| Module and status signal | `apps/web/src/modules/platform-health/manifest.ts` |
| Private status screen | `apps/web/src/modules/platform-health/screens/status.tsx` |
| Browser verification | `apps/web/e2e/platform-health/achiles.spec.ts` |
| Existing implementation note | `docs/01-agent-os/05-achiles-platform-assurance.md` |
| Visual agent guide | `docs/05-deliverables/agent-guides/09_ACHILES_AGENT_GUIDE.pdf` |

## Final summary

ACHILES is XELOR's private, read-only platform heartbeat. It uses fixed checks rather than
AI guessing, keeps tenant-separated evidence, shows stale evidence to authorised readers,
participates in Agent OS only as an evidence reader, and has no repair authority. Its value
is bounded detection and a clean ownership boundary—not autonomous operations.
