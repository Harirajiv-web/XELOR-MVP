---
document_type: complete_project_context
project: XELOR
project_role: subproject_under_parent_project
parent_project_name: TBD_BY_OWNER
snapshot_date: 2026-08-07
source_basis: repository_working_tree_and_verified_local_runtime
commercial_numbers_status: hypotheses_and_placeholders_only
---

# XELOR: complete project context and business-model input

## 1. What this document is for

This is the single, self-contained handoff for XELOR. It is written so that a founder,
investor, product manager, finance team, technical team, or another AI system can understand
the product without reading the whole repository first.

Use it for:

- building a business model for XELOR as a subproject of a larger parent project;
- preparing investor, customer, technical, and managed-service material;
- estimating pricing, revenue, implementation effort, operating cost, and staffing;
- planning a pilot, production roadmap, deployment, or ERP integration;
- giving another ChatGPT or Codex session a reliable starting context.

This file separates three kinds of statement:

- **Implemented fact** means working code exists in this repository and has been locally
  exercised.
- **Demonstration fact** means a real product flow is backed by seeded or illustrative data;
  it does not prove a live customer operation.
- **Hypothesis or roadmap** means it is a proposed commercial or production direction, not
  a capability that should be sold as already complete.

No final price, customer count, revenue forecast, market size, parent-project name, staffed
service level, or production deployment is invented here. Those values must be supplied by
the business owner.

## 2. Executive summary

XELOR is an India-first manufacturing operations and intelligence platform. In the current
prototype it combines a broad manufacturing ERP with a governed decision-and-agent layer.
It connects facts that normally sit in separate departments—sales, engineering, planning,
purchasing, inventory, production, quality, maintenance, people, finance, product care,
integration, and managed services—into one traceable operating decision.

Its central promise is not “an AI can do anything.” Its stronger promise is:

> XELOR can read permitted business evidence, connect the evidence across departments,
> explain what needs attention, pause at the correct human boundary, dispatch only approved
> and bounded work, and preserve an audit trail of the recommendation, decision, action,
> and result.

XELOR can eventually be positioned as an intelligence layer above an existing ERP. The
current repository, however, is not yet a universal plug-and-play ERP adapter. It includes
its own ERP records and a provider-neutral integration foundation. Real customer deployment
on top of SAP, Oracle, Dynamics, Tally, Zoho, another ERP, or factory systems will require a
defined canonical data contract plus tested adapters for that customer’s systems.

The current system contains:

- **9 governed agents** in one fixed operating map;
- **22 installed web modules**;
- a modular NestJS API and Next.js interface;
- PostgreSQL with tenant isolation, permissions, approval trails, audit evidence, and
  business records;
- real Keycloak sign-in and role isolation, plus a separate sign-in-free disposable demo
  mode;
- an Agent OS with durable missions, parallel evidence collection, human approval, a
  backend kill switch, two autonomy modes, and an append-only action-dispatch ledger;
- RELAY managed-service coordination and ACHILES private hourly health assurance;
- a seeded Northstar customer-order story designed for a non-technical investor demo.

Current maturity is best described as an **investor-ready, locally verified MVP/prototype**.
It is not yet a generally deployable production SaaS, a staffed 24×7 managed service, a
certified compliance product, or a fully autonomous factory.

## 3. XELOR’s place under a parent project

The parent project has not been named or defined in this repository. Until the owner adds
that information, the clean business treatment is:

```text
PARENT PROJECT / COMPANY PLATFORM
│
├── shared brand, leadership, sales, legal, finance and platform resources
│
└── XELOR SUBPROJECT
    ├── manufacturing ERP and records
    ├── governed intelligence and Agent OS
    ├── implementation and integration services
    └── optional managed service operated through RELAY
```

For financial modelling, XELOR should have a subproject-level profit-and-loss view even if
the parent sells it as part of a larger offer. Track direct XELOR revenue and direct XELOR
cost separately, then allocate shared parent costs through an agreed rule.

Recommended attribution rules, still subject to finance approval:

- A contract that explicitly buys XELOR: 100% direct XELOR revenue.
- A bundled parent-project contract: allocate revenue using relative standalone selling
  prices, not an arbitrary percentage after the sale.
- XELOR onboarding, connector, data-migration, training, and managed-service fees: direct
  XELOR service revenue.
- Shared cloud, security, brand, sales, legal, and leadership costs: allocated using a
  declared driver such as usage, headcount, engineering time, or attributed revenue.
- Reusable intellectual property built for the parent but used by XELOR: record the chosen
  internal allocation or transfer-pricing rule explicitly.
- A lead generated by the parent but converted into an XELOR contract: keep both the source
  and the resulting XELOR revenue so sales economics are not double-counted.

Information the owner still needs to add:

| Missing parent-project input | Why it matters |
| --- | --- |
| Parent project/company name and objective | Establishes positioning and ownership |
| Legal entity that will contract and invoice | Determines revenue recognition and tax |
| Shared-team roles and annual cost | Required for allocated operating expense |
| Shared technology/IP ownership | Required for cost and margin treatment |
| Parent sales channels and lead ownership | Required for CAC attribution |
| Bundling and standalone-selling policy | Required for XELOR revenue allocation |
| Funding and hurdle rate | Required for investment and break-even decisions |

## 4. The customer problem

Manufacturing businesses often have records in many systems and decisions in messages,
spreadsheets, or people’s heads. A customer order may look healthy in Sales while Quality
has rejected a batch, Maintenance knows a critical machine is at risk, Planning sees a
material shortage, and Finance sees a credit or cash constraint. Traditional screens show
each record but make the person assemble the decision.

XELOR is designed to reduce these problems:

- fragmented operational data;
- slow cross-department coordination;
- decisions with weak or missing evidence;
- approval reasons hidden in email or chat;
- unsafe automation that bypasses permissions;
- repeated manual checking and reconciliation;
- unclear responsibility when a technology service fails;
- no durable memory of what was decided and whether it worked.

The initial target is an Indian manufacturing business, especially a small or medium-sized
manufacturer with meaningful sales-order, material, production, quality, maintenance,
GST, payroll, cash, and audit workflows. The design also supports a larger multi-site
direction, but multi-factory intelligence is not complete in this MVP.

Typical users include:

- owner, managing director, plant head, and operations manager;
- sales and customer-care teams;
- engineering and production planning;
- purchasing and stores;
- production, quality, and maintenance;
- finance, accounts, payroll, and HR;
- platform administrator and integration owner;
- XELOR service desk, service manager, and technical owners;
- authorised customer or partner users with narrow portal access.

## 5. The product in simple words

XELOR has three layers:

1. **System of record:** the manufacturing and business modules store orders, stock,
   production, inspections, maintenance, accounts, people, and related evidence.
2. **Intelligence and control layer:** ONYX and the specialist agents read allowed data,
   join it into decisions, calculate confidence from evidence, request approval, and keep
   the full workflow visible.
3. **Service and assurance layer:** ACHILES privately checks whether XELOR is working;
   RELAY coordinates the managed-service process when the technology needs attention.

```text
People / investor / operator
             │
             ▼
       ONYX Mission Control
             │
     evidence + permissions
             │
  ┌──────────┼──────────┬──────────┬──────────┐
  ▼          ▼          ▼          ▼          ▼
HEXA       MICA       SPAR       AXLE       KILN ... RASP
controls   sales      supply     plan       factory   finance
  │          │          │          │          │          │
  └──────────┴──────────┴──────────┴──────────┴──────────┘
             │
     human approval boundary
             │
             ▼
    governed work + verification

ACHILES detects platform health → RELAY coordinates service → technical owner repairs
```

## 6. Complete operating flow covered by the MVP

The broad order-to-cash and factory flow is:

1. **Set up the organisation:** company, plant, users, roles, permissions, numbering,
   workflows, and connections.
2. **Define the product:** item, Bill of Materials (BOM), routing, material, and planning
   policy.
3. **Accept customer demand:** sales order, tax treatment, customer delivery date, credit
   check, and human override where required.
4. **Run planning:** MRP—Material Requirements Planning—explodes demand through the BOM,
   checks supply, offsets lead times, and proposes what to make or buy and by when.
5. **Buy material:** purchase requisition/order, approval, supplier choice, goods receipt,
   and incoming inspection.
6. **Control stock:** one append-only stock ledger records receipts, issues, transfers,
   batches, quarantine, and balances. Production and other modules use this single write
   boundary.
7. **Make the product:** production orders and operation steps consume components, record
   responsibility and evidence, and create finished stock.
8. **Check quality:** inspection results, sampling, acceptance/rejection, quarantine, NCR,
   CAPA, audit documents, and effectiveness evidence.
9. **Maintain factory assets:** requests, maintenance work orders, downtime, preventive
   maintenance, spares, and reliability measures.
10. **Deliver and invoice:** dispatch, invoice, GST evidence, IRN/e-way-bill records, and
    customer commitment status.
11. **Book and collect money:** vouchers, receivables, receipts, working-capital views,
    cash outlook, margin, and lender evidence.
12. **Handle people and spend:** attendance, payroll, employee claims, budgets, tax
    treatment, and approvals.
13. **Support the manufactured product:** MICA owns complaints, installed-product cases,
    warranty, AMC, spares, and human-approved customer replies.
14. **Operate XELOR as a service:** ACHILES records private platform-health evidence;
    RELAY owns incidents, changes, customer service updates, reviews, and improvement.

Important present gaps in this full commercial cycle are listed in section 19. In
particular, pre-order opportunity/quotation management, engineering change control, and
direct-material supplier invoice/payment are not complete.

## 7. The nine agents and their non-overlapping ownership

The exact agent order is:

`ONYX → HEXA → MICA → SPAR → AXLE → KILN → RASP → RELAY → ACHILES`

| Agent | Plain-language role | Owns | Must not own |
| --- | --- | --- | --- |
| **ONYX Supervisor** | The cross-department coordinator | Goals, mission graphs, evidence joining, decision brief, AI Operations, approved orchestration | Another department’s business record; incident clock; arbitrary SQL or writes |
| **HEXA Governance** | The platform, control, identity, and integration guardian | Organisation setup, authorisation, workflows, audit, connector controls, evidence verification, security determination | Sales, supply, production, finance, or managed-service customer promises |
| **MICA Sales & Product Care** | The commercial and manufactured-product relationship owner | Customers, orders, delivery commitments, complaints, warranty, AMC, spares, product support | XELOR platform incidents; factory maintenance; managed-service clock |
| **SPAR Supply** | The purchasing and stock specialist | Suppliers, purchase options, stock, shortages, procurement evidence | Production execution, sales commitments, or cash movement |
| **AXLE Planning** | The engineering and planning specialist | Items, BOMs, routings, MRP, capacity, schedules, planning exceptions | Supplier execution, production completion, or quality declaration |
| **KILN Operations & Quality** | The physical factory specialist | Production, operation evidence, inspection, NCR/CAPA, audits, maintenance, machine risk | Platform outage management, customer contract, or financial transfer |
| **RASP Finance & Working Capital** | The money, workforce, and control specialist | Accounts, cash, receivables, payables evidence, stock cash, margin, spend, people, payroll impact | Moving money autonomously or signing commercial terms |
| **RELAY Managed Services** | The XELOR service coordinator | Service catalogue, transition, incident clock, escalation, change calendar, customer status update, service review, continual improvement | Technical diagnosis/repair, product warranty, security determination, AI kill-switch release, factory maintenance |
| **ACHILES Platform Assurance** | The private “is XELOR working?” watcher | Deterministic hourly availability checks and immutable health history | Diagnosis, repair, restart, customer communication, incident ownership, or any action dispatch |

The main overlap rules are deliberate:

- MICA owns the customer’s manufactured product and commercial relationship; RELAY owns the
  customer-facing operating relationship for the XELOR technology service.
- KILN owns physical machines and factory maintenance; ACHILES checks XELOR’s software
  runtime, not a furnace, lathe, or pump.
- HEXA Integration diagnoses and repairs connectors; RELAY coordinates the service incident
  and update when a connector affects an agreed outcome.
- ONYX AI Operations investigates models, prompts, evaluations, guardrails, and AI cost;
  RELAY coordinates the customer impact; only an authorised person releases high-impact
  controls.
- ACHILES detects and records; RELAY coordinates; the technical owner repairs; a human owns
  contractual or high-impact decisions.

## 8. The 22 installed modules

This table reflects the actual web module registry, not an older document count.

| Agent/department | Module | What the module does |
| --- | --- | --- |
| ONYX | ONYX Copilot | Read-only, permission-checked questions over known business intents; no generated SQL or write tool |
| ONYX | Agent OS | Decision Commander, approvals, mission control, graphs, evidence, and action ledger |
| ONYX | AI Operations | AI connections, registered features, providers, evaluations, cost, review queue, and incidents |
| ONYX | AI Control Center | Autonomy mode, live workflow visibility, backend kill switch, and controlled resumption |
| HEXA | Organisation | Company and organisation master data |
| HEXA | Administration | Roles, permissions, audit, incidents, workflow, and platform administration |
| HEXA | Integration | Connectors, flows, dead letters, statutory filing state, and webhooks |
| MICA | Sales | Customers, sales orders, tax/credit evidence, dispatch, and delivery commitments |
| MICA | Customer Care & Warranty | Product cases, customer portal, warranty, AMC, replies, and installed-product service |
| SPAR | Purchase | Vendors, requisitions, purchase orders, approvals, and goods receipts |
| SPAR | Inventory | Stock balance, movements, batches, warehouses, quarantine, and single ledger boundary |
| AXLE | Engineering | Item master, BOM, product structure, and routing evidence |
| AXLE | Planning | MRP, MPS, planned orders, exceptions, capacity, and scheduling evidence |
| KILN | Production | Production orders, operation sequence, material use, output, and execution evidence |
| KILN | QMS & Audit | Quality overview, inspections, documents, audits, findings, CAPA, training, and evidence packs |
| KILN | Maintenance | Asset register, requests, maintenance work orders, downtime, PM, spares, and reliability |
| RASP | People | Employees, attendance, muster, payroll, payslips, and statutory evidence |
| RASP | Employee Spend | Claims, receipt lines, budgets, GST-credit treatment, advances, and reimbursement |
| RASP | Accounts | Journal, vouchers, trial balance, receivables, receipts, and accounting evidence |
| RASP | Working Capital | Cash, collections, supplier commitments, inventory cash, margin, forecast, scenarios, and lender pack |
| RELAY | Managed Services | Command centre, incidents, changes, service reviews, and responsibility map |
| ACHILES | Platform Health | Private current health, component checks, freshness, and immutable check history |

The module registry separates three decisions: code installed, licence purchased, and user
permission granted. A module may exist in the code but remain unavailable to a company or
person.

## 9. How Agent OS coordinates work

Agent OS is a durable graph engine, not a free-form group chat. A graph fixes the nodes,
dependencies, permitted capability, time limit, retry limit, and approval boundary before a
mission runs. A model cannot invent a new tool or permission at runtime.

The full nine-agent pattern is:

```text
Goal or typed ERP signal
        │
        ▼
ONYX bounds the question and evidence scope
        │
        ├── HEXA reads controls/platform context
        ├── MICA reads customer commitments
        ├── SPAR reads stock and supply
        ├── AXLE reads plans and capacity
        ├── KILN reads production/quality/maintenance
        ├── RASP reads finance/people evidence
        ├── RELAY reads service assurance
        └── ACHILES reads private platform health
        │
        ▼
Eight specialist assessments are joined
        │
        ▼
HEXA verifies permissions, evidence, and boundaries
        │
        ▼
Human approval or Proceed gate
        │ approved
        ▼
Seven permitted business/service work items dispatch
        │
        ├── six domain-owned work items
        ├── one RELAY service-coordination work item
        └── ACHILES dispatches nothing
        │
        ▼
HEXA verifies approval ancestry → ONYX publishes result → outcome can enter memory
```

Current action execution mode is **governed work item**. The append-only dispatch is real,
but it does not falsely claim that an external supplier message, payment, repair, or customer
commitment was completed. Later domain executors can consume those work items under the same
permission, approval, idempotency, audit, and kill-switch controls.

### Autonomy modes

The AI Control Center provides two tenant-level modes:

- **Guarded autopilot:** routine, permitted, bounded steps continue automatically; mandatory
  business approvals, policy failures, and high-impact boundaries still stop.
- **Approve every step:** the graph creates a durable Proceed gate before each execution
  wave and waits for an authorised person.

Changing mode is permission-controlled and records a reason. Neither mode removes mandatory
financial, quality, compliance, or authority approvals.

### Kill switch

The KILL SWITCH is a backend-enforced tenant-wide control. When engaged it:

- refuses new agent reasoning and automated mission progress;
- safely marks active missions as halted;
- leaves the manual ERP available;
- cannot be bypassed by changing a browser control;
- requires permission and a recorded reason;
- does not silently restart halted work after release.

After safety review, an authorised person releases the switch and separately chooses
whether halted missions should resume. This separation prevents automation from restarting
merely because the emergency block was removed.

### Visibility

Mission Control displays the current goal, run state, elapsed time, nodes completed,
specialists, current work, evidence, human gate, dispatch ledger, and convergence. It
exposes structured operational evidence, not hidden chain-of-thought.

## 10. Managed Services and RELAY

RELAY represents a managed-service operating model around XELOR. Technology alone is not a
managed service; a service requires named people, coverage, transition, incident processes,
change control, communication, measurement, review, and improvement.

The lifecycle is:

1. **Design:** service catalogue, outcomes, support hours, severity definitions, SLO/SLA
   schedule, responsibility, continuity, and exit plan.
2. **Transition:** discovery, data and connector readiness, monitoring coverage, contacts,
   runbooks, acceptance tests, and hypercare.
3. **Operate:** event triage, incidents, requests, escalation, change calendar, updates,
   and service restoration evidence.
4. **Improve:** problem record, repeat-failure analysis, monthly review, capacity, roadmap,
   and continual-improvement register.

Human roles still required for a credible paid service are service owner, service manager,
transition lead, service desk/operations lead, technical domain owners, security/control
owner, and customer authorised approver. XELOR assists them; it does not prove that those
people or shifts already exist.

The current Managed Services screens use an explicitly labelled
`illustrative_demo_operating_model`. They do not prove a live ITSM integration, a staffed
24×7 NOC/service desk, contractual SLA achievement, real paging, customer emails, or
autonomous repair.

## 11. ACHILES private platform assurance

ACHILES answers one narrow private question: “Is XELOR working?” It performs deterministic
checks and stores the result. It does not use a language model to guess health.

Current checks are:

| Check | Requirement and meaning |
| --- | --- |
| Backend API | Required; the authenticated ACHILES route is responding |
| PostgreSQL | Required; a tenant-fenced database query completes |
| Event queue | Optional; Valkey responds when configured |
| Web application | Optional; the configured public entry returns a healthy response |
| AI runtime | Informational; declares the configured provider mode; stub mode needs no external call |

Each remote probe times out after four seconds. A required failure makes the platform
`unavailable`; an optional failure makes it `degraded`; an unconfigured optional service is
reported as `not_configured`, never passed.

The normal cadence is one hour. Long-running deployments can enable an internal interval;
serverless deployments can call the secret-protected scheduler endpoint. Results are stored
in the append-only, tenant-isolated `platform_health_run` table. The latest 24 checks are
shown, and a latest result older than 90 minutes is labelled stale.

Only `xelor_admin`, `it_admin`, and `demo_admin` roles receive platform-health permissions.
Ordinary customer roles do not receive them. ACHILES has one Agent OS capability,
`platform-health.status.read`, and no side-effecting capability.

## 12. Technical architecture

### Runtime block

```text
Browser
  │ HTTPS / same-origin /api/v1
  ▼
Next.js 15 + React 19 web application
  │ rewrite; no direct database credential
  ▼
NestJS 11 modular API
  ├── permissions, tenant context, validation, idempotency, audit
  ├── 22 product-module surfaces and Agent OS
  ├── provider-neutral AI router
  └── transactional business writes
        │
        ├── PostgreSQL 17 + pgvector + pg_trgm
        │     ├── ERP and agent records
        │     ├── FORCE row-level security
        │     ├── append-only evidence and ledgers
        │     └── transactional outbox
        │
        └── Valkey 8 + BullMQ
              ▲
              │
       separate worker process
       outbox relay + idempotent consumer

Keycloak 26 ── OIDC identity and tenant group
Gotenberg 8 ── available HTML-to-PDF service
Ollama ─────── optional local AI provider; deterministic stub is default
```

### Main stack

| Area | Implemented choice |
| --- | --- |
| Language/runtime | TypeScript 5.7, Node.js 22-compatible, pnpm 9 workspace |
| Frontend | Next.js 15 App Router, React 19, Tailwind 4, Radix-based components, Three.js login scene |
| API | NestJS 11 on Express 5, Zod validation, SWC build |
| Database | PostgreSQL 17, Drizzle ORM, pgvector, pg_trgm |
| Queue/eventing | Valkey 8, BullMQ, ioredis, transactional outbox |
| Identity | Keycloak 26 OIDC, JWKS token verification, group-to-tenant mapping |
| Documents | Gotenberg 8 is available locally; broad governed document export is not complete |
| AI | Provider-neutral router; deterministic stub by default; Ollama local adapter optional |
| Testing | Node test runner, live database probes, Playwright/Chromium browser tests |
| Packaging | Docker Compose for local/single-host; five-service Railway demo packaging |

### Modular-monolith choice

XELOR is one deployable API divided into strict business modules rather than many early
microservices. Cross-module access goes through shared ports or events. Lint and module
checks detect boundary violations. This keeps transactions and deployment manageable for
the MVP while preserving later extraction points.

### Browser-to-API boundary

The web application holds no database connection and no service-role credential. Browser
calls use same-origin `/api/v1`; Next.js rewrites them to the API. This avoids a separate
cross-origin token path and ensures permissions, tenant fencing, audit, and idempotency are
not bypassed by a server component talking directly to PostgreSQL.

## 13. Data, tenancy, permissions, and audit

The prototype currently uses two seeded tenants: Trishul Precision Components and Kaveri
ElectroFab. The second tenant is also used to prove data cannot leak across tenants.

Security layers are:

1. Keycloak verifies identity.
2. A signed token group determines the tenant; the tenant is never trusted from a caller
   header in authenticated mode.
3. In-app roles resolve permissions from PostgreSQL.
4. API routes declare required permissions.
5. Each database transaction sets the tenant context.
6. PostgreSQL FORCE Row-Level Security is the fail-closed backstop.

The latest verification found:

- **233 tenant-scoped tables** protected by FORCE RLS and a tenant policy;
- **147 route-demanded permissions** matching **147 registry permissions**;
- **294 permission catalogue rows** across the two demo tenants;
- zero uncatalogued grants in the check;
- **22 module manifests** and **163 navigation permission references** aligned.

Critical evidence uses append-only or tamper-evident designs, including audit, stock,
accounting, AI action, Agent OS event/checkpoint, platform-health, and action-dispatch
records. Business mutations use explicit transaction boundaries and idempotency where a
retry could duplicate an effect.

## 14. AI layer and truthful capability boundary

XELOR’s AI router is one governed doorway:

1. reject an unknown or non-routable feature key;
2. check opt-out, budget, and kill-switch governance;
3. route to the configured provider;
4. record the call, including refusals and usage.

The default is `AI_PROVIDER=stub`: deterministic, offline, no model bill, and no external
data transfer. `AI_PROVIDER=ollama` can use a local plant-hosted model. No hosted OpenAI,
Gemini, Claude, or other external model adapter is proven active in this snapshot.

The safety rule is **AI explains; code and authorised people decide**. The owning module
calculates tax, quality, credit, stock, payroll, approval, and similar conclusions. A model
may suggest, extract, classify, explain, or draft inside a fixed contract. Every feature has
a degraded deterministic or manual mode.

The baseline governance decision said eight AI features. Current source truth needs to be
stated carefully:

- AI #1 through AI #8 are the canonical registry set.
- `copilot.retrieval_qa` is an additional AI #9 entry in `in_eval` status and is explicitly
  documented in code as requiring a HEXA-reviewed architecture decision before broader
  promotion.
- `integrations.no_mvp_ai` is a non-routable null declaration, not an AI feature.
- The Copilot works primarily through a deterministic known-intent router even when no model
  is active.

Current AI-related capabilities include receipt/document extraction support, master-data
duplicate detection, product-ticket triage, duplicate-receipt detection, HSN/SAC suggestion,
reply drafting, payslip explanation, segregation-of-duties explanation, and read-only
Copilot routing. Individual registry status and evaluation evidence must be checked before
calling a feature shipped or production-ready.

There is no endpoint that accepts arbitrary SQL from a model. Copilot uses known,
hand-written read queries with permission checks and row limits. Agent OS uses registered
capabilities and fixed graphs. There is no general-purpose autonomous write access.

## 15. Integration and the plug-and-play direction

The Integration module already models provider-neutral concepts such as connectors, flows,
field mappings, messages, dead letters, retries, circuit breakers, statutory filing state,
and webhooks. It shows fake/simulated connections honestly. It is the correct foundation,
but it is not the same as having production adapters for every ERP.

The right plug-and-play implementation plan is:

1. Define a versioned XELOR canonical model for organisation, users, customers, suppliers,
   items, BOMs, stock, orders, production, quality, maintenance, finance, and events.
2. Define read, draft, and execute capabilities separately. Default a new connector to read
   only.
3. Build an adapter SDK with authentication, mapping, pagination, change capture, retry,
   idempotency, rate-limit, health, and error contracts.
4. Implement the first two or three high-demand adapters using real customer evidence,
   rather than claiming a universal connector.
5. Add discovery and mapping: source fields, identity keys, units, tax codes, time zones,
   master-data ownership, and data-quality checks.
6. Run a historical read-only synchronisation and reconciliation report.
7. Turn on event ingestion, then recommendations, then draft actions.
8. Permit narrow writes only after approval, rollback, audit, and acceptance tests are
   proven for that adapter.
9. Package deployment, health checks, runbooks, and upgrade compatibility so connection is
   repeatable rather than a consulting-only exercise.
10. Certify each adapter version against a declared ERP/version combination.

A realistic first customer installation will still require configuration and mapping.
“Plug and play” should mean a repeatable connector kit and short controlled onboarding, not
zero discovery for every factory.

Current third-party/service dependencies and their status:

| Service | Current role | Snapshot status |
| --- | --- | --- |
| PostgreSQL/pgvector | Primary data, RLS, vector-ready storage | Live locally |
| Valkey/BullMQ | Queue and event delivery | Live locally |
| Keycloak | OIDC sign-in and demo identities | Live locally; omitted from sign-in-free Railway demo |
| Gotenberg | HTML-to-PDF runtime | Container available; not a broad product export claim |
| Ollama | Optional local AI provider | Adapter exists; not required in deterministic demo |
| IRP/e-way bill and other external systems | Statutory/integration records and flows | Demo/simulated evidence; not a claim of live production connectivity |
| ITSM/paging/OpenTelemetry | Future managed-service integration | Not live in the MVP |

## 16. Northstar investor demonstration

The canonical story is intentionally one connected operating decision rather than unrelated
dashboard cards.

**Northstar Process Systems ordered 120 PX-400 precision pump assemblies for ₹74.34 lakh,
due 4 September 2026.** The order initially exceeded a ₹45 lakh credit limit and proceeded
only after a recorded human override. Factory work created a 40-unit tranche. Final quality
testing measured 0.034 mm shaft runout against a 0.020 mm limit. Twelve units from the
affected setup were quarantined, leaving 28 available/dispatched and 80 still to complete
against the 120-unit order. Furnace 02 also lost 4.5 hours and is the sole solution-annealing
route for the product.

Canonical facts to preserve:

| Fact | Value |
| --- | --- |
| Customer | Northstar Process Systems Pvt Ltd |
| Sales order | SO-2627-00004 |
| Customer reference | NPS/PO/10482 |
| Product | PX-400 / PMP-PX400 precision pump assembly |
| Ordered quantity | 120 |
| Order value | ₹74.34 lakh |
| Delivery date | 04-Sep-2026 |
| Credit limit | ₹45 lakh; documented temporary override to ₹80 lakh for the order |
| First finished tranche | 40 |
| Quality hold | 12 |
| Finished/dispatchable and shown dispatched | 28 |
| Remaining order commitment after dispatch | 92 total open, including 12 held; 80 still to build/complete |
| Failed runout | 0.034 mm measured vs 0.020 mm maximum |
| Maintenance event | Furnace 02, 4.5 hours lost, ₹1,855 recorded cost |
| Main purchase example | PO-2627-00003, 750 kg SS 316L at ₹385/kg, ₹2,88,750 |
| Part payment example | ₹10 lakh customer receipt |

The primary non-technical guided demo has 11 steps from customer order to delivery and asks
the presenter to create a real sales order and purchase order before continuing. A separate
9-step “Meet the agents” demo opens each agent area and explains its role at a high level.
The visual guide explains but does not secretly create business records.

The key investor message is:

> The recommendation, source evidence, human decision, dispatched work, verification, and
> outcome are separate records. That separation makes the intelligence governable.

## 17. Local running and deployment

### Local development/runtime

Prerequisites are Node.js 22+, pnpm 9+, Docker, and a Docker Compose implementation. On the
verified machine the available command is `docker-compose` rather than `docker compose`;
use whichever exists on the target device.

Typical setup from the repository root:

```bash
pnpm install
cp .env.example .env
docker-compose -f infra/docker-compose.yml up -d
pnpm db:migrate
pnpm demo:seed
pnpm demo:northstar
pnpm --filter @ind-core/platform build
pnpm --filter @ind-core/db build
```

Run the backend:

```bash
pnpm --filter @ind-core/api build
pnpm --filter @ind-core/api start
```

Run the worker in another terminal when demonstrating asynchronous outbox delivery:

```bash
pnpm --filter @ind-core/api worker
```

Run the frontend in development:

```bash
pnpm --filter @ind-core/web dev -- --port 3001
```

Or build and run the production frontend:

```bash
pnpm --filter @ind-core/web build
PORT=3001 pnpm --filter @ind-core/web start
```

`next start` requires a successful `next build` first. That is the reason a standalone
frontend start command fails when `.next` does not exist.

Reset the disposable demo world between presentations with:

```bash
pnpm demo:rebuild
```

That command is destructive to the demo database and deliberately refuses a database that
contains tenants other than the two known demo tenants.

### Environment-variable categories

Never copy actual secrets into an AI prompt or this document. Required categories are:

- runtime: `PORT`, `API_PORT`, `NODE_ENV`;
- browser/API routing: `NEXT_PUBLIC_API_ORIGIN`;
- disposable demo flags: `API_PUBLIC_DEMO`, `NEXT_PUBLIC_PUBLIC_DEMO`;
- database: `DATABASE_URL`, `DATABASE_OWNER_URL`, `DB_POOL_MAX`;
- queue: `VALKEY_URL`;
- identity: `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`;
- document runtime: `GOTENBERG_URL`;
- AI: `AI_PROVIDER`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, optional premium model and timeout;
- ACHILES: `ACHILES_BACKGROUND_ENABLED`, `ACHILES_INTERVAL_MS`, `XELOR_WEB_URL`,
  `CRON_SECRET` for the scheduler endpoint;
- hosted demo seed: `SEED_DEMO_ON_BOOT`, `DEMO_SEED_VERSION`;
- single-host production: public host and separate owner/app/Keycloak/admin passwords.

`NEXT_PUBLIC_*` values are included in the browser build. Changing one normally requires a
new frontend build, not only a restart.

### Railway public-demo option

The repository includes a five-service Railway topology:

```text
public xelor-web
      │ private same-origin API route
      ▼
private xelor-api ── PostgreSQL with volume
      │                    ▲
      ▼                    │
private Valkey ← private worker
```

It deliberately omits Keycloak by using the disposable public-demo identity and omits
Gotenberg because the current hosted path does not need it. Only the web service should be
public. Railway watches GitHub paths and rebuilds the affected service. Pricing, trial
credits, sleep rules, and free allowances change; verify current provider terms before
assuming the five-service stack can remain free.

After the generated Railway URL works, `xelor.kisancred.com` can be attached to the web
service. Add the exact CNAME target shown by Railway at the authoritative DNS provider,
leave the parent/apex records unchanged, and wait for TLS validation.

### Single-host authenticated option

`infra/docker-compose.prod.yml` packages Caddy, web, API, worker, one-shot migrator,
PostgreSQL, Valkey, Keycloak, and Gotenberg. It is suitable as a pilot shape, not the final
multi-region architecture. The included production guide requires a hardened Keycloak
realm; the local realm file contains wildcard origins and published demo credentials and
must never be imported unchanged on a real public host.

### Vercel boundary

The repository contains API cron intent for daily outbox drain and hourly platform-health
checks. Vercel alone does not replace PostgreSQL, Valkey, Keycloak, long-running workers,
and the rest of this Compose runtime. A Vercel deployment therefore needs external managed
services or a reduced public-demo topology. The repository does not contain evidence that
the full current working tree is deployed to a live production URL.

### GitHub and CI/CD truth

The configured remote is `https://github.com/Harirajiv-web/XELOR-MVP.git`. Railway can
deploy linked services automatically on a branch push. The single-host deployment is a
manual `git pull` plus Docker Compose rebuild. The repository now has a three-job GitHub
Actions workflow: static/schema/report proofs, clean-context container builds, and a fresh
public-demo rebuild with the 99-check matrix plus critical route/Factory browser journeys.
It does not yet implement automatic production promotion or rollback.

## 18. Verification snapshot: 8 August 2026

The current working tree was checked against isolated services on ports 3100/3101 while
existing processes on 3000/3001 were left untouched.

### Static, unit, database, and build evidence

| Check | Result |
| --- | --- |
| Repository lint | Passed with zero warnings |
| TypeScript type checking | Passed for web, platform, database, edge, and API |
| Platform unit tests | 712/712 passed |
| Live database tests | 4/4 passed |
| API tests | 55/55 passed |
| Edge simulator tests | 6/6 passed |
| Web API-client tests | 5/5 passed |
| Total of the five reported test groups | 782/782 passed |
| Web module validation | 22 modules and 163 navigation permission references aligned |
| RLS check | 233 tenant-scoped tables fenced |
| Permission check | 147/147 route/registry permissions aligned; 294 tenant catalogue rows |
| Full monorepo build | Passed, including optimized Next.js production build and 182-file API build |
| Investor/API acceptance matrix | 99/99 passed |
| Browser scenarios discovered | 32 across 11 specification files |

### Runtime and browser evidence

- PostgreSQL, Valkey, Keycloak, and Gotenberg responded locally.
- API liveness, real authentication, unauthenticated 401, malformed-token 401, cross-role
  403, clean API 404, and correct demo identity were exercised.
- The agent catalogue returned all nine agents in the intended order.
- ACHILES was verified private, read-only, and healthy across the configured API, database,
  event-bus, web, and declared AI runtime checks.
- The protected scheduler rejected missing and wrong secrets and accepted the correct one,
  checking both demo tenants.
- Public-demo browser journeys covered Decision Commander, RELAY, ACHILES, guided demos,
  the presentation journeys, and a full workflow across more than 40 routes.
- Authenticated Playwright checks covered desktop, dark mode, phone layout, reduced motion,
  fresh login, invalid login, repeated login, role personas, finance/quality navigation,
  the complete controlled-autonomy mission, and the rule that 32 seconds of inactivity does
  not return the user to sign-in.
- The final controlled mission reached approval, accepted an attributable human decision,
  and displayed seven action-dispatch rows while ACHILES remained read-only.

### Defects found and fixed during the recheck

1. The visual topology denominator still said eight after ACHILES was added. It now reports
   `9/9 agents connected`, and related login/test wording says nine.
2. The diagnostic matrix still expected eight agents. It now requires the exact nine-agent
   order and ACHILES last.
3. The database agent-key constraints still accepted only the earlier agent set. Forward
   migrations now permit RELAY and ACHILES as run evidence while deliberately preventing
   ACHILES action dispatch.
4. Cancelling a mission could leave a stale pending approval. Cancellation now retires the
   approval with an attributable system lifecycle outcome; it is not mislabelled as a human
   rejection.
5. Browser tests now accept an isolated base URL, wait for the OAuth callback to finish,
   and release an engaged kill switch when needed without cancelling the legitimate seeded
   approval used by the investor demo.

One known HTTP semantic limitation remains: the generic client-side module route calls the
Next.js not-found boundary after hydration, but an unknown web URL can initially return HTTP
200 rather than a server-side 404. The user does not receive business data, but production
SEO/monitoring semantics should be corrected by moving route validation to a server
boundary.

## 19. Honest gaps and limitations

Do not claim the following as complete:

### Business-function gaps

- No full lead/opportunity pipeline before the sales order.
- No quotation document, revision, validity, or quote-to-order conversion.
- No full engineering change request/order workflow with effectivity and where-used impact.
- Direct-material purchasing stops after receipt; supplier invoice, three-way match,
  payment run, and material AP ageing are incomplete.
- Cost-centre vocabularies are not fully unified across employee and budget masters.
- Multi-factory intelligence and enterprise consolidation are roadmap items.

### Intelligence/automation gaps

- Deterministic reasoning is the default; no hosted external foundation model is proven
  active.
- Action dispatch creates governed internal work items, not automatic completion in every
  domain or external system.
- Universal ERP plug-and-play adapters do not yet exist.
- Predictive accuracy, optimization value, and decision-learning uplift need pilot data and
  measured baselines.
- Copilot AI #9 is an explicitly recorded governance divergence from the original closed
  eight and should receive an approved architecture decision.

### Managed-service gaps

- Managed-service data is illustrative, not live ITSM or telemetry.
- No staffed 24×7 service desk/NOC, on-call rota, paging, or contractual SLA is proven.
- ACHILES is an honest heartbeat, not full production observability, root-cause analysis,
  or automatic remediation.
- OpenTelemetry, Sentry, Grafana, production alerts, backup/restore drills, and a customer
  exit exercise remain work.

### Product/production gaps

- CI verifies the repository and public-demo critical path, but automatic production
  promotion, rollback, signed artifacts and cloud infrastructure delivery remain absent.
- No evidence of current full-stack production deployment.
- Single-host Compose has no built-in off-site backups or multi-region disaster recovery.
- The local Keycloak realm is intentionally insecure for public production use.
- Public-demo mode removes authentication and must contain only disposable seed data.
- Security review, performance/load tests, penetration testing, accessibility audit,
  privacy assessment, compliance sign-off, support staffing, and production runbooks still
  need formal completion.

## 20. Business and revenue model

The following is a modelling framework, not a price recommendation. Prices must be tested
with target customers, implementation partners, and actual unit costs.

### Possible sellable units

1. **Core platform subscription:** tenant, identity, audit, workflows, integration
   foundation, standard modules, and basic support.
2. **Intelligence/Agent OS package:** ONYX, Decision Commander, evidence graph, confidence,
   memory, governed missions, approvals, and AI Control Center.
3. **Department module bundles:** commercial/product care, supply, planning/engineering,
   factory/quality/maintenance, finance/people, governance/integration.
4. **Site or factory add-on:** additional plant, data volume, environment, and operational
   scope.
5. **Integration/adaptor package:** standard connector subscription plus one-time mapping,
   migration, reconciliation, and acceptance.
6. **Implementation services:** discovery, configuration, master-data preparation,
   migration, workflows, training, and go-live support.
7. **Managed Services through RELAY:** service design, transition, monitoring, incident
   coordination, changes, reporting, and improvement; priced by real coverage and staffing.
8. **Usage-based services:** model tokens, document extraction pages, storage, messages,
   high-volume events, or premium reasoning where actual marginal cost varies.
9. **Premium governance/assurance:** private environments, advanced audit exports,
   observability, longer retention, security integrations, and dedicated service review.
10. **Partner/OEM model:** implementation partner licence, certified adapters, resale,
    white-label, or revenue share, subject to the parent strategy.

### Suggested package architecture to test

| Package hypothesis | Intended buyer | Main content | Charging basis to test |
| --- | --- | --- | --- |
| XELOR Pilot | One plant and a bounded decision | Core records, selected modules, onboarding, success baseline | Fixed-time pilot fee |
| XELOR Core | Manufacturing operations team | ERP core, security, workflow, audit, standard support | Annual tenant + site subscription |
| XELOR Intelligence | Leadership and cross-functional users | ONYX, Agent OS, decision evidence, controlled autonomy | Annual add-on, possibly by site or usage band |
| XELOR Department Packs | Department owner | Selected specialist modules/agents | Annual module bundle |
| XELOR Connect | IT/platform owner | Standard adapters, mappings, monitoring, support | Setup fee + annual connector fee |
| XELOR Managed | Customer wanting an operating team | RELAY lifecycle, coverage, service reporting, named coordination | Monthly retainer by coverage and service tier |
| XELOR Enterprise | Multi-site customer | SSO, private deployment, advanced integration, governance, future consolidation | Negotiated annual contract |

Avoid charging only per user if the main value comes from a factory-wide decision and
background integration. A blended structure—base tenant/site fee, module/agent package,
connector fee, implementation, managed-service tier, and controlled usage overage—matches
the actual cost and value drivers more closely.

### Revenue equations

Use variables rather than invented prices:

```text
Annual recurring revenue (ARR)
  = core annual subscription
  + intelligence add-on
  + sum(module bundle fees)
  + additional site fees
  + connector subscriptions
  + managed-service retainers
  + committed usage charges

Annual contract value (ACV)
  = ARR
  + annualised implementation / onboarding revenue if the company reports it that way

First-year contract value
  = ARR
  + implementation fee
  + migration and connector setup
  + training / hypercare
  + expected usage overage

Gross profit
  = recognised revenue
  - cloud and database cost
  - model/document/event variable cost
  - direct support and managed-service delivery labour
  - third-party licence cost
  - implementation labour treated as cost of revenue

Gross margin % = gross profit / recognised revenue

CAC payback months
  = sales and marketing CAC / monthly recurring gross profit

Net revenue retention
  = (opening recurring revenue + expansion - contraction - churn)
    / opening recurring revenue
```

### Spreadsheet-ready input variables

| Variable | Meaning | Owner must supply |
| --- | --- | --- |
| `pilot_fee` | Fixed fee for bounded pilot | Yes |
| `core_arr_per_tenant` | Annual core platform subscription | Yes |
| `site_arr` | Annual fee per additional plant/site | Yes |
| `intelligence_arr` | ONYX/Agent OS add-on | Yes |
| `module_pack_arr` | Annual price per department bundle | Yes |
| `connector_setup_fee` | One-time mapping/migration/acceptance | Yes |
| `connector_arr` | Annual adapter maintenance fee | Yes |
| `managed_service_mrr` | Monthly RELAY service retainer | Yes |
| `usage_price` | Per token/page/event/storage unit | Yes |
| `implementation_days` | Delivery effort per customer | Measure in pilots |
| `blended_delivery_day_cost` | Direct implementation labour cost | Yes |
| `cloud_cost_per_tenant` | Compute, database, queue, storage, network | Measure |
| `ai_cost_per_tenant` | External model/document usage | Zero in stub demo; measure in pilot |
| `support_hours_per_tenant` | Normal support consumption | Measure |
| `managed_service_fte_per_tier` | People required for promised coverage | Capacity plan |
| `sales_cycle_months` | Lead to signed contract | Measure |
| `win_rate` | Qualified opportunity to contract | Measure |
| `annual_logo_churn` | Customers lost per year | Hypothesis then measure |
| `expansion_rate` | Sites/modules/services added | Hypothesis then measure |
| `parent_shared_cost_allocation` | XELOR share of parent overhead | Finance rule |

### Cost model

Separate costs into:

- product engineering and product management;
- implementation and connector engineering;
- cloud compute, PostgreSQL, queue, object storage, network, backup, and DR;
- Keycloak/identity administration and security;
- AI tokens or local edge hardware;
- document processing and PDF/storage;
- monitoring, incident tooling, and third-party integrations;
- customer success, training, support, and RELAY staffing;
- compliance, legal, insurance, testing, and certification;
- sales commissions, partner share, and marketing;
- parent-project shared cost allocation.

The deterministic stub makes the demo’s model cost effectively zero, but a commercial
forecast must not assume zero AI cost if hosted models or document services are introduced.
Managed-service margin must include real staffing for every promised coverage window.

### Value drivers to measure in a pilot

Do not sell an unmeasured savings number. Agree a baseline and measure:

- order-risk detection lead time;
- planner time spent reconciling demand, supply, and exceptions;
- inventory shortage and excess reduction;
- quality escape, quarantine, scrap, and CAPA closure time;
- machine downtime and maintenance response;
- days sales outstanding and cash-forecast accuracy;
- approval cycle time and audit-evidence preparation;
- duplicate/manual data-entry reduction;
- incident detection, update, and restoration time for the XELOR service;
- number of decisions with traceable evidence and verified outcomes.

Each benefit should have a source, baseline period, measurement window, attribution status,
and authorised customer sign-off. Estimated value and verified value must remain separate.

### Pilot-to-contract funnel

```text
Qualified manufacturer
  → discovery and data-readiness assessment
  → one bounded paid pilot
  → agreed baseline and success measures
  → read-only integration and reconciliation
  → live user workflow with approvals
  → measured outcome review
  → annual platform contract
  → modules/sites/connectors expansion
  → optional RELAY managed-service tier
```

A credible initial pilot should choose one plant, one cross-functional decision, 3–5 source
systems or modules, named owners, business-hours support, and written acceptance criteria.

### Scenario framework

Build low, base, and high cases using customer counts and measured unit economics:

```text
Year-end ARR
  = opening ARR
  + new customers × average new ARR
  + existing-customer expansion
  - churned ARR
  - contraction

Services revenue
  = new implementations × average implementation fee
  + connector projects
  + training/hypercare

Managed-service capacity required
  = sum(customers by tier × service-hours/FTE requirement by tier)
```

The low case should assume slower sales, more implementation effort, fewer standard
adapters, lower expansion, and higher service labour. The high case should be earned by
evidence of repeatable onboarding and retained customers, not only a larger market number.

## 21. Recommended roadmap

### Stage 0 — current investor MVP

- Keep the 9-agent/22-module demo stable and truthful.
- Keep the Northstar story resettable.
- Preserve permission, approval, kill-switch, and audit evidence.
- Correct remaining documentation drift and unknown-route HTTP semantics.

### Stage 1 — paid pilot readiness

- Choose the initial customer segment and one decision use case.
- Implement quotation or the most commercially critical missing workflow.
- Define canonical data contracts and build the first real ERP adapter.
- Add customer-specific configuration and reconciliation.
- Establish backups, restore test, logs, metrics, errors, alert ownership, and runbooks.
- Run security, privacy, access, load, and acceptance testing.
- Establish a repeatable deployment environment and CI pipeline.

### Stage 2 — controlled pilot

- Start read-only and establish baseline data quality.
- Enable recommendations and draft actions.
- Enable narrow approval-bound writes only after reconciliation.
- Measure outcomes and operating cost.
- Operate business-hours RELAY service with named people and honest SLOs.

### Stage 3 — production product

- Harden tenancy, identity lifecycle, secrets, backups, DR, observability, and upgrades.
- Complete AP/three-way match and priority commercial gaps.
- Certify versioned connectors.
- Add external domain executors behind governed action dispatch.
- Add customer contracts, billing/metering, licence enforcement, and service entitlements.
- Expand managed-service coverage only when staffing and exercises prove it.

### Stage 4 — platform expansion

- Multi-factory intelligence and enterprise consolidation.
- Predictive/optimization services with measured evaluation gates.
- Marketplace/plugin and workflow-building capability.
- Edge runtime and factory-specific model options.
- Advanced decision-learning and confidence calibration based on verified outcomes.

## 22. Repository map

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js product interface, module registry, guided demos, Playwright tests |
| `apps/api` | NestJS API, business modules, Agent OS, AI router, worker, diagnostics |
| `packages/platform` | Shared domain rules, errors, permissions, Agent OS contracts, AI registry |
| `packages/db` | Drizzle schema, 85 forward migrations through `0086`, RLS/permission checks, seed support |
| `infra/docker-compose.yml` | Local PostgreSQL, Valkey, Keycloak, and Gotenberg |
| `infra/docker-compose.prod.yml` | Single-host authenticated deployment shape |
| `infra/railway` | Five-service public-demo Dockerfiles, scripts, and Railway config |
| `docs/01-agent-os` | Agent OS, managed-service, and ACHILES implementation notes |
| `docs/02-investor-demo` | Presenter story and honest capability gaps |
| `docs/03-agent-guides` | Agent guide source/index and generated reports |
| `docs/04-deployment` | Railway public-demo deployment guide |
| `docs/05-deliverables/agent-guides` | Generated master and per-agent PDFs |
| `docs/05-deliverables/project-reports` | Final architecture, strategy, roadmap and technical-handoff PDFs |
| `.env.example` | Local non-secret variable template; example values are development-only |
| `.env.production.example` | Single-host production variable template with blanks for secrets |

Important source files include:

- `apps/web/src/modules/registry.ts` — installed 22 modules;
- `packages/platform/src/agent-os/types.ts` — exact 9-agent registry;
- `apps/api/src/agent-os/graph-registry.service.ts` — fixed mission graphs;
- `apps/api/src/agent-os/capability-registry.service.ts` — registered tools/capabilities;
- `apps/api/src/agent-os/agent-graph.engine.ts` — durable graph execution;
- `apps/api/src/agent-os/agent-control.service.ts` — modes and kill switch;
- `packages/platform/src/managed-services/operating-model.ts` — RELAY ownership model;
- `apps/api/src/modules/platform-health` — ACHILES checks and scheduler;
- `packages/platform/src/ai/feature-registry.ts` — AI feature truth;
- `apps/api/src/common/tenant.middleware.ts` and permission guard — identity/tenant/access;
- `packages/db/src/rls-check.ts` and `perm-check.ts` — executable security checks.

## 23. Glossary

| Term | Meaning |
| --- | --- |
| Agent | A named, bounded responsibility and capability set, not an unrestricted model persona |
| Agent OS | The graph, permission, approval, execution, and evidence runtime for agents |
| BOM | Bill of Materials: components and quantities required to make a product |
| CAPA | Corrective and Preventive Action: fix the cause and prove effectiveness |
| ERP | Enterprise Resource Planning: the system of record for business and factory transactions |
| Governed work item | An approved internal action-dispatch record; not proof the external work finished |
| Human approval | A durable, attributable decision required before a consequential boundary |
| MRP | Material Requirements Planning: calculates what to buy/make and when from demand, supply, BOMs, lead times, and policy |
| NCR | Non-Conformance Report: the persisted quality issue and containment record |
| RLS | PostgreSQL Row-Level Security, used here to isolate tenants |
| SLO/SLA | Service objective/contractual service commitment; current RELAY values are illustrative unless contracted |
| System of record | The authoritative transactional record, separate from an AI explanation |
| Tenant | One customer/company data boundary in the shared database |
| Transactional outbox | Business data and an event commit together; a worker later delivers the event safely |
| Verified outcome | A measured result with evidence, kept separate from an estimated benefit |

## 24. Facts another AI must not change or invent

When using this document, another AI should preserve these rules:

1. There are **9 agents**, in the exact order stated in section 7.
2. There are **22 installed web modules** in this snapshot.
3. RELAY is the managed-service coordinator; MICA owns manufactured-product sales and care.
4. ACHILES is private, deterministic, read-only, and cannot repair or communicate with a
   customer.
5. ONYX coordinates; it does not receive arbitrary SQL or universal write access.
6. Guarded autopilot still keeps mandatory approvals. Approve-every-step adds more gates.
7. The kill switch is backend-enforced and leaves manual ERP available.
8. Seven work items dispatch after approval because ACHILES reads but never dispatches.
9. Managed Services is an illustrative operating model, not proof of a staffed 24×7 team.
10. The public demo has disposable data and may remove sign-in; that mode is not production
    security.
11. No production deployment, universal ERP adapter, external model provider, or final
    commercial price should be claimed without new evidence.
12. AI #9 Copilot is a visible governance divergence from the baseline closed eight.
13. Estimated financial benefit must never be reported as realised value.
14. Parent-project details and revenue allocation inputs remain owner-supplied.

## 25. Copy-paste prompt for business-model work

Use the following with this file attached:

> Treat the attached XELOR complete-project-context document as the factual source of truth.
> XELOR is a subproject under a parent project whose missing fields must remain explicit.
> Build a three-year business and revenue model with low, base, and high scenarios. Separate
> recurring software revenue, implementation revenue, connector revenue, managed-service
> revenue, usage revenue, direct cost of revenue, operating expense, and allocated parent
> costs. Do not invent market size, prices, customer counts, conversion rates, salaries, or
> cloud costs. First list every missing input and provide a spreadsheet-ready assumptions
> table. Then provide formulas, unit economics, break-even logic, cash requirement, staffing
> capacity, pilot-to-contract funnel, risks, and sensitivity analysis. Preserve the product’s
> current MVP limitations and do not describe demonstration data as production evidence.

## 26. Owner completion checklist

To turn this technical/business context into an investable financial plan, complete:

- [ ] Parent project/company name, legal entity, and strategic role of XELOR.
- [ ] Target customer segment, geography, plant size, and initial buyer.
- [ ] First paid pilot scope and success measures.
- [ ] Package structure and standalone selling prices.
- [ ] One-time implementation and connector pricing.
- [ ] Managed-service coverage hours, staffing model, and SLA promises.
- [ ] Sales channel, sales cycle, win rate, and partner share.
- [ ] Cloud, AI, support, implementation, security, and compliance unit costs.
- [ ] Parent shared-cost allocation rule.
- [ ] Revenue-recognition policy for subscription and services.
- [ ] Low/base/high customer and expansion assumptions.
- [ ] Funding, runway, break-even target, and return requirement.
- [ ] Evidence plan for measuring customer value during the pilot.

Once those inputs are supplied, this document is sufficient context for another AI or a
human finance team to create the revenue model without rediscovering the product from code.
