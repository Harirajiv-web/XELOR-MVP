# IND-CORE / IND-AI Master Product Blueprint

### The complete engineering and product record: what exists, what is built, why, and what happens next

**Company:** AIKYANTRA
**Products:** IND-CORE (full ERP) · IND-AI (read-only intelligence layer)
**Document date:** 28 July 2026
**Audience:** external technical or investment reviewer, reading cold
**Status:** descriptive record, not a binding document — `DECISIONS-V2.md` is the only binding document

---

## 0. How to read this file

This document exists because the project's knowledge is spread across three very different kinds of artefact: **research** (why we believe what we believe), **blueprints** (what each module must do), and **code** (what actually runs). A reviewer looking at any one of them in isolation will draw the wrong conclusion about the other two.

Everything here is one of two things, and they are labelled throughout:

| Marking | Meaning |
|---|---|
| **Measured** | Counted or executed against the repository on 28 July 2026. Reproducible. |
| **Documented** | Stated in a source document. True as a *decision*; not evidence that code exists. |

Where a document and the code disagree, this file says so explicitly rather than smoothing it over. Those disagreements are in **§6**. They are the most useful part of this document for a reviewer, and they are deliberately not buried.

---

## 1. The product, in one page

**IND-CORE** is an India-first, AI-native manufacturing ERP for Indian MSMEs. It ships in two forms on one platform:

- **IND-CORE** — a complete modern ERP (Sales/CRM, Procurement, Inventory, Manufacturing, Quality, Maintenance, Finance, People) with an AI copilot built in. Target customer: a factory running on paper and Excel with no ERP at all.
- **IND-AI** — a read-only intelligence layer that sits on top of a plant's *existing* systems (SAP, Tally, Odoo, Dynamics, MES/SCADA, scanned documents). Target customer: a factory that already bought an ERP and cannot get answers out of it.

**The thesis:** turn disconnected factory data into trusted operational decisions in minutes — with evidence, under human control. The loop is *Connect → Retrieve → Reason → Act*.

**The AI doctrine, which is architectural rather than aspirational:** AI is evidence-grounded and approval-gated. It cites the source rows it used, it drafts actions for a human to approve, and it never writes to a business record autonomously. The phrase used throughout the corpus is *"AI explains, never decides."* §4 of the binding baseline turns this into enforceable rules, and the code implements it as a closed feature registry that rejects unregistered calls at runtime.

**The market bet** (from `RES-competitors.md`): no shipping product today combines all five of — Tally-grade Indian tax compliance, real manufacturing depth, native Indian payroll, modern affordable cloud, and built-in AI. That five-way gap is the opening. The most dangerous competitor named is **Zoho**, followed by **Odoo**.

**Team and scale:** approximately five engineers. Target is an investor-grade MVP first, then a pilotable product. Named pilot reference: Kaveri Pumps & Motors, Coimbatore.

---

## 2. The document corpus

### 2.1 The four layers, and why the order matters

The corpus is layered, and each layer is only allowed to overrule the one below it in one direction:

```
  RESEARCH        →  evidence. Cited, confidence-rated, adversarially reviewed.
      ↓
  DECISIONS-V2    →  the binding baseline. Turns research into rules. WINS ALL CONFLICTS.
      ↓
  NAME.md         →  who owns what. Departments cut by system-of-record ownership.
      ↓
  16 BLUEPRINTS   →  what each module must do. Defers to DECISIONS-V2 on every conflict.
      ↓
  CODE            →  MVP_PROTOTYPE_1. What actually runs.
```

A blueprint may not silently diverge from `DECISIONS-V2`. Divergence requires an ADR reviewed by HEXA. This rule is why the corpus has stayed coherent across ~2.9 MB of module specification written by different agents.

---

### 2.2 The research evidence base — `E:\ERP\RESEARCH\`

**Six files, ~174 KB.** Authored by Fable 5, dated 18 July 2026. Every claim carries a citation and a confidence rating (H/M/L or High/Medium). These are analyst reports, not opinion pieces.

| File | Phase | The question it answers | Why it exists |
|---|---|---|---|
| `ERP-RESEARCH-BRIEFING.md` (16 KB) | index | *What is in this folder and how was it produced?* | Plain-language index and methodology statement. Written by a second model reading all files in full — a deliberate second pair of eyes. Read this first. |
| `RES-competitors.md` (33 KB) | 2 | *Who else sells ERP to Indian manufacturers, and where is the gap?* | Positioning. Maps SAP, NetSuite, Dynamics, Infor, Epicor, IFS, Odoo, ERPNext, Tally, Zoho, Busy, Marg, Focus, Ramco on affordability, cloud, manufacturing depth, GST, payroll, AI, UX and implementation burden. Produces the five-way whitespace the product attacks. |
| `RES-compliance.md` (32 KB) | — | *What Indian law must this software obey, and by when?* | The highest-stakes file. Primary-source-graded (PIB, MeitY, cert-in.org.in, labour.gov.in, gst.gov.in, MCA/ICAI). Delivers an 18-item Compliance Register mapped to modules and deadlines, a top-10 risk list, and an explicit 11-item "law still in flux" list. |
| `RES-architecture.md` (34 KB) | 3 | *Is the modular-monolith + shared-schema-RLS shape right?* | Treats the baseline as a hypothesis to attack. Verdict: baseline survives, with three amendments — make module boundaries *enforced* not aspirational; plan the RLS→bridge tenancy path now because tenancy is the hardest thing to reverse; treat approval workflow as a product feature to build, not infrastructure to buy. All three amendments are visible in the code today. |
| `RES-technology.md` (28 KB) | 4 | *Which technologies do we build with?* | Eleven categories judged on maintainability and five-year total cost, not hype. Each section is a comparison table, a verdict, and a documented "would change if…" trigger. Overturned four choices from the earlier draft baseline: Prisma→Drizzle, Redis→Valkey, MinIO→Garage/SeaweedFS, Terraform→OpenTofu. |
| `RES-disproof.md` (30 KB) | 7 | *Is any of the above actually wrong?* | An adversarial review. The author adopts a skeptical-CTO stance and runs 17 **fresh** searches deliberately hunting counter-evidence. **Result: of 14 major recommendations, 9 survived, 5 survived with modification, 0 were overturned.** |

**Why `RES-disproof.md` is the most important file in the folder.** It is the reason the stack is credible. A stack nobody attacked is an opinion; this one was attacked on purpose and held. But its real value is the *"missing topics"* section — nine questions the other files never asked. Those nine became §6 of the binding baseline and remain the project's live risk register (see §6 and §7 of this document).

Its closing line is worth quoting to any reviewer, because it is the honest summary of the project's risk:

> *"The corpus's real failure is not a wrong decision but a missing question: how this ERP works on a factory floor with no reliable network, and whether 4–8 engineers can ship this scope at all."*

**Two inconsistencies a reviewer will notice, stated plainly:**

1. The briefing describes **four** research reports and indexes four. There are **five** (`RES-architecture.md` is the fifth). The briefing is dated 19 July; the architecture file was last modified 23 July. The briefing simply predates it and was never re-indexed. *(Measured: file timestamps.)*
2. The corpus references two documents that **do not exist anywhere under `E:\ERP`**: `RES-ai.md` (the AI-features research that reportedly cut ~32 candidate features down to the committed 8) and `SHARED-STACK.md` (the draft stack baseline `RES-technology.md` evaluates). Both are load-bearing. `RES-ai.md` is the justification for the closed 8-feature registry that the running code enforces. *(Measured: filesystem search.)*

---

### 2.3 The binding baseline — `DECISIONS-V2.md` (32 KB)

**This is the only normative document in the project.** It wins on any conflict with any blueprint. It is cited 250+ times across the module specifications. Seven sections:

| § | Contents | Why it is binding |
|---|---|---|
| **§1** | Core decisions and ports: boundary-enforced modular monolith; pooled shared-schema + FORCE RLS designed bridge-ready; the W1 workflow engine behind a `WorkflowExecutor` port with a **hard feature budget**; a provider-agnostic AI router, thin by design; Keycloak 26 with Organizations; PG17 + RLS acceptance criteria | These are the decisions that are expensive or impossible to reverse later. Tenancy model above all. |
| **§2** | The stack table, plus **rejected alternatives with reasons** | Recording the rejections is what stops the same debate re-opening every quarter. |
| **§3** | Compliance as normative fact: DPDP Act 2023 + Rules 2025 (substantive obligations land **12 May 2027**), CERT-In 6-hour incident reporting (**live now**), MCA 8-year un-disable-able audit trail (**live since 1 Apr 2023**), GST incl. the **1 Aug 2026 Ship-to-GSTIN** change, payroll deemed-wages under the Labour Codes | Compliance is stated as fact, not as a requirement to be negotiated. Auditors will test for the MCA audit trail directly. |
| **§4** | AI governance: the golden-set eval gate; the **closed 8-feature registry** (3 committed, 5 stretch); guardrails binding on every AI call; "AI explains, never decides" | A registry that grows whenever somebody has an idea is not a control. Closing it is the control. |
| **§5** | Data, API and eventing conventions — the densest and most-cited section | Summarised in §3 of this document. |
| **§6** | Nine open mandatory platform work items, lettered (a)–(i), several of which are **sequencing gates that block module work** | This is the project's live risk register. Reproduced in §7 below. |
| **§7** | The canonical demo universe | One internally consistent dataset for every module. Inconsistent numbers between modules is the fastest way to lose an investor's trust. |

**The canonical demo universe (§7)** — every module seeds against this and nothing else:

- **Primary tenant:** Trishul Precision Components Pvt Ltd — auto-component manufacturer, Pune HQ, **two plants and two GST registrations**: Pune-Chakan (Maharashtra) `27AABCT1234F1Z5`, Coimbatore (Tamil Nadu) `33AABCT1234F1Z9`.
- **Secondary tenant:** Kaveri ElectroFab Industries (Bengaluru) — seeded *minimally*, existing solely to power tenant-isolation and RLS leak-probe demonstrations.
- **Financial year:** FY 2026-27, INR, lakh/crore formatting, DD-MMM-YYYY dates.
- **Demo "today":** Monday 20 July 2026.

The two-GSTIN primary tenant is deliberate: it exercises multi-GSTIN-per-tenant from day one. Single-GSTIN-per-nexus is a documented NetSuite limitation and a competitor dealbreaker.

---

### 2.4 The organisational map — `NAME.md` (10 KB)

Six delivery departments plus one cross-cutting component. Departments are cut by **system-of-record ownership** — not by technical layer, and not by convenience. Names are exactly four letters, drawn from a mineral/industrial register, and each department's initial matches its owner's initial.

| Agent | Department | Owns (system of record) | Blueprints |
|---|---|---|---|
| **HEXA** | Platform & Governance | Master data, identity, RBAC/ABAC, W1 workflow engine, hash-chained audit, event bus, external connectors | `GENERAL` · `ADMINISTRATION` · `INTEGRATION` |
| **MICA** | Commercial | Customer master, leads, quotations, sales orders, tenders, tickets, complaints, warranty/AMC | `SMBD` · `CSP` |
| **SPAR** | Supply Chain | Supplier master, PO→GRN→invoice→payment, the stock ledger, bins, valuation, batches | `PURCHASE` · `INVENTORY` |
| **AXLE** | Product Engineering & Planning | Item/BOM/routing masters, ECR→ECO change control, MPS, MRP, capacity, finite scheduling | `ENGINEERING` · `PLANNING` |
| **KILN** | Manufacturing Operations | Work orders, material moves, scrap, batch genealogy, quality gates, NCR/CAPA, calibration, asset uptime | `PRODUCTION` · `INSPECTION` · `MAINTENANCE` |
| **RASP** | People & Money | Employee master, shifts, attendance, payroll & Indian statutory, budgets, claims, indirect spend, GL | `HRM-ATTENDANCE` · `EXPENDITURE` · `ACCOUNTS` |
| **ONYX** | AI Operations *(component, not a department)* | Provider-agnostic router, feature registry, prompt lifecycle, eval gates, cost ledger, PII egress, kill switch | `AI-OPERATIONS` |

**Why ONYX is a component and not a department:** it serves modules across HEXA, MICA and RASP and has zero business-domain edges of its own. Making it a department would imply it owns a system of record. It does not.

**The cross-department contracts** are extracted from the blueprints' own event tables, not invented. The three that matter most:

- **SPAR ↔ KILN** — `POST /api/stock/entries` is the *single write path* to the stock ledger. KILN never writes stock tables directly. Production is gated off until Inventory reaches its 95–99% stock-accuracy target.
- **AXLE ↔ KILN** — the tightest treaty in the system. Production-Plan-lite auto-disables per plant when Planning is installed, because two planning engines double-ordering one item is a documented Odoo failure mode.
- **MICA ↔ KILN** — `csp.complaint.created.v1` → `qms.ncr.created.v1` → `qms.capa.status_changed.v1`. The most fully specified cross-module contract in the corpus.

`NAME.md` also records **names considered and rejected**, which prevents re-proposal. Some rejections are substantive rather than aesthetic: *Pegasus* (NSO Group spyware — catastrophic for a component whose job is proving DPDP compliance to auditors), *Zeus* (banking trojan; we sell to CFOs), *Silo* (the exact anti-pattern the architecture forbids), *Prism* (Epicor's AI brand — a direct competitor).

---

### 2.5 The sixteen module blueprints — `E:\ERP\MVP FILES\*.md`

**~2.87 MB of specification.** Every blueprint follows the identical 20-section + 2-appendix template, which is what makes them comparable and reviewable:

> 1 Module Overview · 2 Objectives · 3 User Personas · 4 Functional Requirements · 5 Non-functional Requirements · 6 UI/UX Flow · 7 Screen-by-Screen Design · 8 Navigation · 9 Database Schema (PostgreSQL 17) · 10 API Design · 11 Backend Logic · 12 Frontend Components · 13 AI Features · 14 Security · 15 Validation · 16 Testing · 17 MVP Scope · 18 Future Roadmap · 19 Technology Stack & Rationale · 20 Demo Data (Seed) · **Appendix A** Research findings & sources · **Appendix B** Open questions, assumptions & documented triggers

| Blueprint | Owner | Size | What it specifies |
|---|---|---:|---|
| `ACCOUNTS.md` | RASP | 345 KB | Append-only general ledger, AR/AP subledgers, receipts, period close. The largest file in the corpus — nine other modules emit posting events into it. |
| `INSPECTION.md` | KILN | 295 KB | QMS: sampling plans, inspections, dispositions, NCR/CAPA, calibration, and the quality gate Production must honour. |
| `MAINTENANCE.md` | KILN | 261 KB | CMMS: asset register, requests, maintenance work orders, the overlap-free downtime clock, PM schedules, reliability KPIs. |
| `AI-OPERATIONS.md` | ONYX | 239 KB | The control plane for the AI itself: router, closed registry, prompt lifecycle, eval gates, cost ledger, PII egress, human-in-the-loop queue, kill switch. |
| `PRODUCTION.md` | KILN | 185 KB | The make cycle: work orders, component consumption, output, scrap, batch genealogy. |
| `PURCHASE.md` | SPAR | 177 KB | Vendor master, PO→GRN→invoice→payment. |
| `INVENTORY.md` | SPAR | 175 KB | The stock ledger, bins, valuation, batches — and the single write path. |
| `ADMINISTRATION.md` | HEXA | 163 KB | RBAC/ABAC, the W1 approval engine, idempotency, segregation of duties, licensing. |
| `GENERAL.md` | HEXA | 150 KB | Company/master data, the platform bootstrap every module inherits. |
| `CSP.md` | MICA | 139 KB | Customer Service Portal — the first internet-facing surface; the *second scoping dimension* (tenant **and** customer account), business-time SLA clock, warranty as a computed gate. |
| `HRM-ATTENDANCE.md` | RASP | 138 KB | Employee master, shifts, attendance, payroll, Indian statutory incl. s.2(y) deemed wages. |
| `EXPENDITURE.md` | RASP | 132 KB | Budgetary control as a reservation ledger, GST input tax credit, vendor TDS. |
| `INTEGRATION.md` | HEXA | 131 KB | The edge of the system: connectors, circuit breakers, DLQ. |
| `SMBD.md` | MICA | 123 KB | Customers, sales orders with real GST place-of-supply, credit gate, dispatch, invoicing. |
| `ENGINEERING.md` | AXLE | 107 KB | Item master, Bill of Materials, ECR→ECO change control. |
| `PLANNING.md` | AXLE | 106 KB | MPS, MRP, low-level codes, netting, lead-time offsetting, capacity, exception worklist. |

---

### 2.6 Supporting and working documents

| File | Location | Purpose |
|---|---|---|
| `_RESEARCH_DOCS_GOLDEN/` | `MVP FILES/` | **Read-only golden snapshot** of the blueprint corpus with an MD5 manifest. Its existence is the tamper-evidence mechanism for the specification set: any drift in a blueprint is detectable against the recorded hashes. Never modify. |
| `docs/08-presentations/02-aikyantra-pitch-deck.html` | Workspace | The current investor deck (508 KB). Source of the "Agent Brain" visual language now implemented in the product's arrival screen. |
| `docs/08-presentations/01-main-investor-deck.html` | Workspace | Earlier investor deck and the origin of the product's design language. |
| `IND-AI_Master_Plan (3).md`, `IND-AI_Investor_MVP_Plan.md`, `IND-AI_Execution_Plan.docx` | `E:\ERP\` | Product and commercial planning, predating `DECISIONS-V2`. Where they conflict with the baseline, the baseline wins. |
| `docs/07-execution/01-frontend-execution-plan.md` | Workspace | The written brief for the arrival experience (the void, the brain, the ONYX map, the idle return). Implemented. |
| `docs/06-ai-architecture/01-universal-graph-multi-agent-operating-system-v2.md` | Workspace | **Advisory, external, not adopted.** A 249 KB specification for a general-purpose multi-agent operating system. Assessed 28 July 2026 — verdict: *take parts, not the whole*. Its recommended stack (Python/FastAPI/PostgreSQL 16) directly violates the binding baseline, and its core discipline ("the OS ships zero domain knowledge") is the inverse of this product's thesis. Three items were identified as worth adopting via ADR: the capability model with attenuation, prompt-injection/egress controls before IND-AI document ingestion ships, and making the eval gate blocking in CI. |
| `floorplan-3d/` | `MVP FILES/` | The standalone tracing project that produced the factory floor-plan geometry now used in the sign-in experience. |

---

## 3. The rules every module obeys

These are the §5 conventions. They apply to every table, endpoint and event without exception, and they are the reason sixteen modules written at speed still look like one system.

**Data**
- UUIDv7 primary keys everywhere.
- `tenant_id` on every tenant-scoped table, with **FORCE Row-Level Security**. The application connects as a non-owner, `NOBYPASSRLS` role.
- Composite indexes lead with `tenant_id`.
- `created_at/by`, `updated_at/by`, `is_active` soft delete.
- **No hard DELETE** on master, financial or statutory rows — ever.
- Money is `NUMERIC(18,2)`. Statutory and rate masters are effective-dated.
- Every statutory number is configuration, never a constant in code.

**API**
- One canonical error envelope.
- Cursor pagination only — no offset pagination anywhere.
- `Idempotency-Key` required on mutating endpoints.

**Events**
- Versioned names: `module.entity.verb.v1`.
- Delivered through a **transactional outbox**. At-least-once delivery plus idempotent consumers yields an exactly-once *effect*.

**Two safety rules that override convenience**
- **The ledger-critical rule.** Ledger-critical writes stay synchronous, inside one transaction. They never go on the bus. A general ledger that is eventually consistent is a general ledger that is wrong at the moment somebody looks at it.
- **The single write path to stock.** Production never writes stock directly. All stock movement goes through `POST /api/stock/entries`, owned by Inventory.

**One documented trip-wire**
- RLS overhead exceeding 15–20% triggers a *mandatory* design review — the pre-agreed trigger to re-open the tenancy decision rather than quietly living with it.

---

## 4. What is actually built

**Location:** `E:\ERP\MVP FILES\MVP_PROTOTYPE_1`

### 4.1 Measured inventory, 28 July 2026

| Metric | Count | How measured |
|---|---:|---|
| Commits | 54 | `git rev-list --count HEAD` |
| Database migrations | 55 | file count, `packages/db/migrations` |
| Tables created | 221 | `CREATE TABLE` statements across all migrations |
| HTTP endpoints | 339 | route decorators across all controllers |
| API module folders | 19 | `apps/api/src/modules` |
| Permissions in the platform registry | 139 | `packages/platform/src/access` |
| Installed web modules | 16 | `INSTALLED_MODULES` in the web registry |
| Web screens | 64 | screen files across all module folders |
| Test files | 40 | `*.test.ts`, excluding dependencies |
| AI features registered | 9 (+1 explicit null entry) | `packages/platform/src/ai/feature-registry.ts` |
| AI features with implementations | 7 of 9 | call-site search per feature key |
| Golden-set eval specs | 4 | `apps/api/src/ai/eval/specs` |

### 4.2 Repository shape

```
MVP_PROTOTYPE_1/
├─ infra/                     docker-compose: PG17+pgvector · Valkey 8 · Keycloak 26 · Gotenberg
│  ├─ keycloak/               realm 'indcore' — clients, groups→tenant, demo users
│  ├─ keycloak-themes/        the IND-CORE sign-in theme (dark glass + 3D factory backdrop)
│  └─ postgres/init/          app_user — NON-OWNER, NOBYPASSRLS — plus extensions
├─ packages/
│  ├─ platform/               @ind-core/platform — the primitives §5 mandates
│  └─ db/                     schema, migrations, RLS policies, leak probe, naming checks
└─ apps/
   ├─ api/                    NestJS v11 modular monolith — 19 module folders
   └─ web/                    Next.js 15 / React 19 — spine + 16 module folders
```

### 4.3 The platform foundation (HEXA)

Everything below is **live and exercised by the modules above it**, not scaffolding:

- **FORCE RLS multi-tenancy** with a dedicated two-tenant **leak probe** (`packages/db/src/rls/leak-probe.test.ts`). Tenant isolation is tested, not asserted.
- **Transactional outbox** + BullMQ relay worker + idempotent consumers (`packages/platform/src/events`, `apps/api/src/bus`).
- **Hash-chained audit trail** (`packages/platform/src/audit/hash-chain.ts`) with its own test — this is the MCA 8-year tamper-evidence obligation, implemented.
- **Keycloak 26 OIDC**, tenant derived from a JWKS-verified token claim and never from a header. The dev-header stub was deliberately retired in commit 2 of 54.
- **In-app RBAC** with a 139-permission registry, plus segregation-of-duties rules.
- **The W1 approval workflow engine**, built behind a `WorkflowExecutor` port with the hard feature budget §1.3 requires.
- **Idempotency replay store** so a repeated mutation cannot double-post.
- **Document numbering** — human-readable, gap-free series.
- **Naming and permission consistency checks** that run as build gates.

### 4.4 The AI spine (ONYX)

Built in three deliberate stages before any module was allowed to use it:

| Stage | Commit | What it established |
|---|---|---|
| **A1** | `9fc1c74` | The thin, provider-agnostic router; the **closed feature registry**; the hash-chained `ai_action_log`. |
| **A2** | `0bba8e3` | Governance: kill switch, DPDP opt-out, token budget — every one of them audited. |
| **A3** | `9d98f90` | The golden-set **eval gate**: a feature must beat its deterministic baseline to ship. |

**The registry is closed and enforced at runtime.** A call for a key not in the table is rejected with `AI_FEATURE_NOT_REGISTERED`. A registered-but-not-routable feature is rejected with `AI_FEATURE_NOT_ROUTABLE`. This is the control that makes "AI explains, never decides" checkable rather than promised.

**Every feature declares three things** the code actually uses: a **risk tier** (1 advisory / 2 draft-record / 3 advisory-only-forever, a one-way setting), a **deterministic baseline** the eval gate must beat, and a **degraded mode** — what the feature falls back to when AI is off, over budget, or killed.

**The current portfolio:**

| Ref | Key | Owner | Status | Tier | Implementation |
|---|---|---|---|---|---|
| AI #1 | `expenditure.receipt_extraction` | Expenditure | committed | 2 | **Built** |
| AI #2 | `general.master_dedup` | General | committed | 2 | **Built** — the first brain, and the shared one |
| AI #3 | `csp.ticket_triage` | CSP | committed | 1 | **Built** |
| AI #4 | `expenditure.duplicate_receipt` | Expenditure | stretch | 1 | *Registered, no implementation* |
| AI #5 | `general.hsn_sac_suggest` | General | stretch | 2 | *Registered, no implementation* |
| AI #6 | `csp.reply_draft` | CSP | stretch | 2 | **Built** |
| AI #7 | `hrm.payslip_explainer` | HRM | stretch | 3 | **Built** |
| AI #8 | `admin.sod_explain` | Administration | stretch | 3 | **Built** |
| AI #9 | `copilot.retrieval_qa` | Copilot | **in_eval** | 3 | **Built** — *and an explicit, documented divergence from the closed 8. Needs a HEXA-reviewed ADR before it advances past `in_eval`.* |
| — | `integrations.no_mvp_ai` | Integrations | no_mvp_ai | — | Explicit null entry — the module states it has no MVP AI rather than staying silent |

**Providers:** an offline deterministic stub (zero cost, default), a local model via Ollama (`AI_PROVIDER=ollama`, the EDGE tier), and hosted providers swappable in by the same config. A **grounding gate** sits in front of all of them.

**One design rule learned by testing rather than assumption:** a local 3B model was tested four ways and was found to flip conclusions and copy worked examples. The rule that came out of it is now enforced throughout — **code decides the verdict and the action; the model only writes the reason.** The alert system follows the same rule: "late" is a date comparison, "down" is a row with no end time. No model is asked.

### 4.5 The sixteen business modules

All built. Each one owns its system of record, and the boundary is enforced in CI — a module may import the shared spine and itself, never another module.

| # | Module | Owner | What runs today |
|---:|---|---|---|
| 01 | **General** | HEXA | Company/master data; the duplicate-detection brain that every other master reuses |
| 02 | **Engineering** | AXLE | Item master, multi-level Bill of Materials, item dedup |
| 03 | **Inventory** | SPAR | The stock ledger and the single write path — ledger-critical, synchronous |
| 04 | **Purchase** | SPAR | Vendors, POs approved through the W1 engine, GRNs posting stock atomically via Inventory |
| 05 | **Production** | KILN | The make cycle: consume components, produce finished goods |
| 06 | **Quality / Inspection** | KILN | Sampling, inspections, dispositions, and the quality gate Production honours |
| 07 | **Sales / SMBD** | MICA | Customers, sales orders with real GST place-of-supply, credit gate, dispatch |
| 08 | **Accounts** | RASP | Append-only general ledger, AR subledger, receipts |
| 09 | **HRM & Attendance** | RASP | Punch → attendance → **s.2(y) deemed wages** → payroll → payslip → GL |
| 10 | **Maintenance** | KILN | Asset register → request → MWO → overlap-free downtime clock → PM → reliability KPIs |
| 11 | **CSP** | MICA | The first internet-facing surface: second scoping dimension, business-time SLA clock, warranty as a computed gate |
| 12 | **Expenditure** | RASP | Reservation ledger, GST ITC through s.17(5) gates, vendor TDS. **Built in the API; deliberately excluded from the current web build.** |
| 13 | **Planning / MRP** | AXLE | Low-level codes from the BOM, demand as `max(forecast, orders)`, level-by-level netting, lead-time offsetting, exception worklist that proposes and never acts |
| 14 | **Administration** | HEXA | The control plane: users, roles, permissions, licensing, SoD |
| 15 | **Integration** | HEXA | The edge: connectors, circuit breakers with a half-open clock, DLQ |
| 16 | **AI Operations** | ONYX | The control plane for the AI itself: registry, cost ledger, review queue, kill switch |
| — | **Copilot** | ONYX | A read-only assistant that *cannot* do anything else — hand-written SELECTs, no write path in the module to disable |

**Expenditure's absence from the web build is a feature demonstration, not a defect.** It proves the module boundary is real: the folder can be removed and nothing else in the build refers to it. `pnpm module-check` fails the build if a module folder exists without a registry entry or an entry without a folder, so the two cannot drift apart silently.

### 4.6 The web application

**Next.js 15 App Router / React 19 / Tailwind v4.** Structure is a **spine** (access, api, auth, data, format, presence, registry, shell, states, theme, ui, void) plus 16 self-contained module folders.

Three architectural rules, each learned from a defect:

1. **The shell lives in a layout, not in the pages.** A page is torn down and rebuilt on every navigation — which previously reset the sidebar's scroll position, collapsed the module tree, and wiped the copilot conversation on every single click.
2. **Colour is never written down in a screen.** Every value is a CSS custom property; the dark theme redefines the whole set. A literal hex in a screen is a light-mode bug waiting for somebody's night shift.
3. **A module declares what it shows *and* what it watches for.** Each manifest carries `signals` (department dashboard figures), `alerts` (things somebody needs to know about now), and a `description` on every nav entry. All three live in the module, so deleting the folder takes them with it — and the build fails if a visible screen has no description.

**Three independent gates** decide whether anybody sees a screen: **INSTALLED** (is the code in this build), **LICENSED** (did the company buy it), **PERMITTED** (may this person open it). Three gates, three different people who can change them.

**The arrival experience** (specified in `executefront.md`, implemented): a near-black void, a hollow revolving 3D brain that is the only control on the page, a travel transition through it into the ONYX department map, and a return to the brain after 30 seconds of stillness — suppressed while a dialog holds unsaved work. The sign-in page itself carries a revolving 3D model of the factory floor plan behind a dark glass form, delivered as a Keycloak theme so no login template is forked.

---

## 5. Why it was built in this order

The build order is visible in the commit history and it was not arbitrary. It follows one principle: **build the thing that everything else depends on, correctly, once — then let the rest copy a locked pattern instead of re-litigating it.**

```
  1. Foundation      boundary-enforced monolith, FORCE RLS, outbox, audit chain
  2. Identity        Keycloak OIDC — the dev stub retired immediately, not "later"
  3. Governance      RBAC → idempotency → W1 approvals → the outbox relay worker
  4. AI spine        A1 router+registry → A2 governance → A3 eval gate
  5. First brain     GENERAL dedup: deterministic core → draft-for-approval → eval PASS
  6. Lift & share    the dedup brain refactored into shared layers before module 2
  7. Modules 02–16   in dependency order: make → move → buy → sell → book → people → assets
  8. The surfaces    web spine, department dashboards, copilot, arrival experience
```

Four choices in that sequence are worth a reviewer's attention:

- **The AI spine was built before any AI feature.** Governance and the eval gate existed before the first brain shipped. Retrofitting a kill switch onto features already in production is how governance becomes theatre.
- **The first brain was refactored into shared layers before the second module started** (commit `11e0a53`). One brain, reused sixteen times, rather than sixteen private copies drifting apart.
- **Ports were extracted the moment a second consumer appeared** — W1 approvals, stock posting, and the BOM each became app-level ports at the point a second module needed them, not before and not after.
- **Order-to-cash was completed before anything optional.** Buy → stock → make → inspect → sell → book. A demo that cannot complete that loop is not a demo of an ERP.

---

## 6. Verified gaps, risks and drift

Stated plainly. A reviewer will find these anyway; finding them listed here is a better signal than finding them hidden.

### 6.1 Documentation drift (measured)

| Finding | Detail |
|---|---|
| `TECH-STACK.md` is stale in two rows | AI governance and the eval gate are marked *"Planned (A2)"* and *"Planned (A3)"*. Both shipped — commits `0bba8e3` and `9d98f90`. The document understates what is built. |
| `NAME.md` open items 1 and 2 are resolved | It records that `ACCOUNTS.md` and `DECISIONS-V2.md` "do not exist". Both now exist and are in the golden manifest. The file has not been updated. |
| The research briefing indexes 4 of 5 files | `RES-architecture.md` post-dates the briefing and was never added to it. |

### 6.2 Corpus gaps (measured — files searched for and absent)

| Missing | Why it matters |
|---|---|
| **`RES-ai.md`** | The AI-features research that reportedly cut ~32 candidates to the committed 8. It is the *justification* for the closed registry the running code enforces. The control exists; its evidence base does not. |
| **`SHARED-STACK.md`** | The draft baseline `RES-technology.md` evaluates. Its absence makes four of the technology decisions harder to audit — the "before" is missing. |

### 6.3 Product and code gaps (measured)

| Gap | Status |
|---|---|
| **AI #4 and AI #5 are registered but unimplemented** | Both are `stretch`. Registered-with-no-implementation is the honest state, but they are routable by status and would fail at the call site. |
| **AI #9 (`copilot.retrieval_qa`) diverges from the closed 8** | Documented in the code with its reasoning, held at `in_eval`. Needs a HEXA-reviewed ADR. The mitigation is structural rather than promissory: risk tier 3, no write path exists in the module to disable. |
| **The eval gate does not block CI** | `in_eval` is inside the routable set. The gate exists and passes; it is not yet a build gate. |
| **Only 4 of 9 features have golden sets** | dedup, ticket triage, receipt extraction, SoD explain. |
| **Six blueprints were authored on the wrong stack** | SMBD, ENGINEERING, PLANNING, PURCHASE, INVENTORY, PRODUCTION specify FastAPI / PostgreSQL 16. All six are **implemented correctly** on NestJS / PG17 — the code is right and the documents are stale. The blueprints still need reconciling so a future reader is not misled. |
| **Manufacturing demo data is thin** | KILN's dashboard figures are largely zero. The §7 dataset needs extending for a manufacturing-led demonstration. |
| **Nothing is deployed** | Everything runs locally: Docker inside WSL2, Next on Windows. No cloud environment, no CI/CD, no IaC, no observability stack. All four are decided and pinned (`Planned` in `TECH-STACK.md`) but unbuilt. |
| **The AIKYANTRA logo has not been supplied** | The sign-in and shell currently use a text wordmark. |

### 6.4 The nine open baseline items (`DECISIONS-V2` §6) — the live risk register

Owned by HEXA. Several are **sequencing gates that block module work**, and they are ordered here by how much they block.

| # | Item | Why it blocks | State |
|---|---|---|---|
| **(a)** | **Mobile / offline-first strategy** | **The single biggest omission in the whole corpus.** Factory-floor punches, job-card updates, GRN scans and dispatch confirmations happen on mid-range Android over patchy networks. Needs a PWA-vs-native decision plus an offline queue/sync design with conflict resolution against an RLS backend. **Gate: must land before the CSP UX freeze and before the Manufacturing auth pack (kiosk PIN/badge/RFID) is sequenced.** | **Open — blocking** |
| **(d)** | **GSP vendor selection** | The entire GST design assumes "via GSP" with zero vendor research. Critical-path dependency with an external lead time. | Open |
| **(e)** | **Timeline / scope feasibility pass** | Sixteen modules plus statutory payroll plus GST plus the AI portfolio plus compliance plumbing, on ~5 engineers, has never been stress-tested. This is the item that determines whether every date in any plan is real. | Open |
| **(c)** | **Pricing / unit-economics model** | The "₹500–1,500/user/month whitespace" is asserted, never modelled. Needs COGS per tenant, GSP per-document fees, AI cost pass-through, CAC under CA/partner distribution. | Open |
| **(f)** | **WhatsApp Business API (BSP)** | The dominant Indian SMB channel, absent from the notification stack. The channel enum, adapter port and template registry must ship in MVP so a BSP is a drop-in. | Open — MVP stubs required |
| **(h)** | **Tally data-import spec** | Named as *the* pilot-conversion lever ("first invoice in a day") with no importer research behind it. | Open |
| **(g)** | **Indic-language UI / i18n** | The pitch sells an MRP-exception explainer in Hindi/Marathi. English MVP with an i18n scaffold; Indic search and input are named work items. | Open |
| **(b)** | **Frappe/ERPNext-as-build-platform rejection memo** | Building *on* Frappe was never argued against. The rejection is probably right — MariaDB/Python/DB-per-site conflict with the pooled-SaaS thesis — but a decision this size needs an explicit memo, not silence. | Open |
| **(i)** | **AI router package ownership** | Does `platform/ai` stay in HEXA's bootstrap or move to ONYX? | Open — HEXA/ONYX |

---

## 7. Roadmap — how the build carries forward

**A note on dates.** This roadmap is sequenced by dependency and gate, **not by calendar**. Item **(e)** — the timeline feasibility pass — is precisely the open item that would let anyone put honest dates on it. Publishing dates before that pass would be inventing them. The phases below are ordered so that each one's exit criteria are the next one's entry criteria.

### Phase A — Close the governance loop *(smallest effort, highest credibility return)*

| Work | Exit criterion |
|---|---|
| Make the eval gate **blocking in CI** | A feature that does not beat its deterministic baseline cannot merge |
| Golden sets for the remaining registered features | 9 of 9 covered, or the uncovered ones demoted out of the routable set |
| ADR for AI #9, reviewed by HEXA | `copilot.retrieval_qa` either advances with a recorded decision or returns to `registered` |
| Resolve AI #4 / AI #5 | Implement, or demote so status matches reality |
| Reconcile the six stale blueprints to the NestJS/PG17 baseline | No blueprint contradicts the code it describes |
| Correct `TECH-STACK.md` and `NAME.md` | Documents match measured state |

### Phase B — Security posture before IND-AI ingests anything

This is sequenced *before* IND-AI document ingestion, not after, because the threat only exists once the product reads customer-controlled text.

| Work | Exit criterion |
|---|---|
| **Capability model with attenuation** (adopted from the Universal Graph assessment, §27.3) — permissions as URNs, default deny, child ⊆ parent at every boundary, expiring with the run | The answer to "what stops this doing something stupid" is structural, not a list |
| **Prompt-injection and egress controls** — egress allowlist, content isolation, output validation, injection detection | A document containing instructions to exfiltrate the corpus produces a blocked egress and an audit record |
| **Durable human-in-the-loop** — approval survives a deployment restart | A document approved four hours later, after a restart, still completes |

### Phase C — Unblock the factory floor *(gate (a) — currently blocking)*

| Work | Exit criterion |
|---|---|
| PWA-vs-native decision, with an offline queue and sync design | An ADR that names the conflict-resolution strategy against an RLS backend |
| Manufacturing auth pack (kiosk PIN / badge / RFID) sequenced behind it | Shop-floor identity has a design |
| CSP UX freeze released | The gate `NAME.md` and `DECISIONS-V2` §6 both name is cleared |

### Phase D — Commercial and statutory dependencies with external lead times

| Work | Exit criterion |
|---|---|
| **GSP vendor selection** (d) — ClearTax / Cygnet / MasterGST / Vayana on API quality, sandbox, per-document price, SLA | A signed sandbox and a per-document cost in the unit-economics model |
| **Pricing / unit economics** (c) | COGS per tenant, GSP fees, AI cost pass-through, CAC — modelled, not asserted |
| **Tally importer spec** (h) | The "first invoice in a day" claim has an implementation behind it |
| **WhatsApp BSP stubs** (f) | Channel enum, adapter port and template registry shipped so a BSP is a drop-in |

### Phase E — Make it real: deployment, evidence, and the pilot

| Work | Exit criterion |
|---|---|
| OpenTofu + GitHub Actions + AWS ap-south-1 | The system runs somewhere other than one laptop |
| OpenTelemetry + Grafana + Sentry | Failures are observable before a customer reports them |
| Per-tenant export / PITR runbook (§5.8 acceptance criterion) | The runbook has been executed, not written |
| Extend the §7 demo dataset for a manufacturing-led narrative | KILN's dashboards show a plant that is running |
| **Timeline / scope feasibility pass** (e) | Every date in every plan becomes defensible |
| Pilot at Kaveri Pumps & Motors | Real data, real users, real failure modes |

### Standing work, every phase

- **Compliance clock.** GST Ship-to-GSTIN landed 1 Aug 2026. CERT-In and the MCA audit trail are already live and already testable by a customer's auditor. **DPDP substantive obligations enforce 12 May 2027** — inside the first year, which is why it is designed in now rather than bolted on.
- **Re-verify the flagged numbers.** Every figure rated **L/Low** or "in flux" in the research must be re-checked against its primary source before it enters a contract, a price list, or a customer promise.
- **Watch the documented triggers.** Each major decision carries a "would-flip-if" condition — the RLS 15–20% overhead trip-wire being the sharpest. When one fires, re-run *that* decision, not the whole baseline.

---

## 8. Running and verifying the system

**Local topology.** Docker Engine runs inside WSL2 Ubuntu (not Docker Desktop). PostgreSQL 17, Valkey 8, Keycloak 26 and Gotenberg run as containers; the API runs inside WSL on `:3000`; the web app runs on Windows on `:3001`.

**Healthy state is `web:200 · api:401 · kc:200`.** The API's 401 is the auth guard answering correctly, not a fault.

**Build gates**, all four of which must pass:

| Gate | What it enforces |
|---|---|
| `tsc --noEmit` | Type safety across the workspace |
| `eslint --max-warnings=0` | Including `eslint-plugin-boundaries` — a module may import the spine and itself, never another module |
| `pnpm module-check` | Every installed module is registered, every registered module exists, every nav permission is defined by the platform, and every visible screen has a description |
| `next build` | The production build compiles |

**Proofs that run against a live database**, executed inside WSL against a Linux-native copy: `db:migrate`, `db:rls-check`, and the two-tenant **RLS leak probe**. The leak probe is the one that matters — it demonstrates tenant isolation empirically rather than by reading policy definitions.

---

## 9. Change control

- `DECISIONS-V2.md` is binding. Where any plan, blueprint or document conflicts with it, **it wins**.
- Changing any §1–§7 decision requires an **ADR reviewed by HEXA**. A module may not diverge silently.
- The sanctioned re-open conditions are the "would-flip-if" triggers embedded in the baseline. When one fires, re-run that specific decision — not the whole baseline.
- `_RESEARCH_DOCS_GOLDEN/` is a read-only snapshot with an MD5 manifest. Blueprint drift is detectable against it. Do not modify it.
- Cite the section you are implementing. Every module's code should be traceable to a `DECISIONS-V2` clause.

---

## 10. Summary for a reviewer

**What is genuinely strong:**
- The stack survived a deliberate adversarial review — 14 recommendations attacked with fresh evidence, **0 overturned**.
- Compliance is treated as primary-sourced fact with dated deadlines, not as a requirement to be negotiated later. The MCA audit-trail obligation is implemented as a hash chain with its own test.
- The AI governance is structural, not promissory: a **closed registry enforced at runtime**, an eval gate against deterministic baselines, per-feature risk tiers and degraded modes, and a kill switch — all built *before* the first feature shipped.
- Module boundaries are enforced by CI rather than by convention, and the removal of Expenditure from the web build demonstrates it.
- Sixteen modules, 221 tables, 339 endpoints and a complete order-to-cash spine exist and run.

**What a reviewer should press on:**
- **Nothing is deployed.** The system has never run outside one laptop.
- **Gate (a) — mobile/offline — is open and blocking**, and it is the gap the project's own adversarial review named as its most serious.
- **Item (e) — timeline feasibility — has never been tested**, which means no date anywhere in the corpus is currently defensible.
- **`RES-ai.md` is missing**, so the closed AI registry — a genuine strength — is running without its evidence base on file.
- **The eval gate does not block CI yet**, so the strongest AI control is one configuration change away from being fully real.

---

*Compiled 28 July 2026 by reading the research corpus, the binding baseline, the sixteen blueprints, and the prototype repository. All counts in §4.1 were measured against the repository on that date and are reproducible. This document is descriptive; `DECISIONS-V2.md` remains the only binding document.*
