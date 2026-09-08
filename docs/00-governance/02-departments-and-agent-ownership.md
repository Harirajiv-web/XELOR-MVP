# IND-CORE Departments and Agent Ownership

**Status:** Decided
**Date:** 22 July 2026
**Scope:** Names for the six delivery departments and the one cross-cutting AI component, plus the file-to-department assignment they govern.

---

## 1. The naming system

Three rules, applied without exception:

| # | Rule | Reason |
|---|---|---|
| 1 | **Exactly four letters** | Uniform length makes the set read as one deliberate system rather than seven unrelated picks. Also fits package prefixes, ticket labels and UI chips without truncation |
| 2 | **Mineral, geometric or industrial register** | Neutral, non-mythological, pronounceable in any market, and consistent with a precision-manufacturing product. Nothing that sounds like a mascot or a gaming brand |
| 3 | **Departmental initial = owner's initial** | H, M, S, A, K, R map to the five-person team's initials. The letter is the mnemonic for who owns the department. ONYX is unconstrained because AI Operations is a component, not a person's department |

Names are internal engineering identifiers. They are **not** customer-facing product branding — that decision is separate and still open.

---

## 2. Departments & agents

| Letter | Agent | Department | Blueprint files | Owns |
|---|---|---|---|---|
| **H** | **HEXA** | Platform & Governance | `GENERAL.md` · `ADMINISTRATION.md` · `INTEGRATION.md` | Master data, identity, RBAC/ABAC, W1 workflow engine, hash-chained audit, event bus, external connectors |
| **M** | **MICA** | Commercial | `SMBD.md` · `CSP.md` | Customer master, leads, quotations, sales orders, tenders, tickets, complaints, warranty/AMC |
| **S** | **SPAR** | Supply Chain | `PURCHASE.md` · `INVENTORY.md` | Supplier master, PO→GRN→invoice→payment, the stock ledger, bins, valuation, batches |
| **A** | **AXLE** | Product Engineering & Planning | `ENGINEERING.md` · `PLANNING.md` | Item/BOM/routing masters, ECR→ECO change control, MPS, MRP, capacity, finite scheduling |
| **K** | **KILN** | Manufacturing Operations | `PRODUCTION.md` · `INSPECTION.md` · `MAINTENANCE.md` | Work orders, material moves, scrap, batch genealogy, quality gates, NCR/CAPA, calibration, asset uptime |
| **R** | **RASP** | People & Money | `HRM-ATTENDANCE.md` · `EXPENDITURE.md` *(+ missing `ACCOUNTS.md`)* | Employee master, shifts, attendance, payroll & Indian statutory, budgets, claims, indirect spend, GL |
| — | **ONYX** | AI Operations *(cross-cutting component)* | `AI-OPERATIONS.md` | Provider-agnostic router, feature registry, prompt lifecycle, eval gates, cost ledger, PII egress, kill switch |

`HEXA · MICA · SPAR · AXLE · KILN · RASP · ONYX`

### 2.1 Note on SPAR / RASP

**SPAR** and **RASP** are anagrams. This was accepted knowingly. Mitigation: the owner's initial disambiguates them (S owns SPAR, R owns RASP), and neither may be abbreviated in code, package names, branch names or ticket titles. Always write the full four letters.

---

## 3. Why the departments are drawn this way

Departments are cut by **system-of-record ownership**, which is what each blueprint's own "Module boundary — touchpoints only" table already encodes.

- **HEXA** depends on nobody and is depended on by everything. It ships the bootstrap (monorepo, FORCE RLS, outbox, audit framework) that all other departments inherit.
- **MICA** owns the customer. SMBD and CSP share one customer master and one order spine.
- **SPAR** owns supplier and material. GRN-submit is the stock ledger's busiest write path, and the reorder→MR→PO loop closes entirely inside this department.
- **AXLE** owns intent — what we intend to build and when. Engineering defines the product; Planning decides the schedule.
- **KILN** owns execution. Production, Inspection and Maintenance share one physical spine: the item, the work centre, the work order, the asset. Inspection's gates fire *inside* Production's flow; Maintenance's downtime is Production's OEE input.
- **RASP** owns people and rupees.
- **ONYX** is horizontal. It serves modules across HEXA, MICA and RASP, and has zero business-domain edges of its own — which is precisely why it is a component and not a department.

---

## 4. Cross-department contracts

Every seam below needs a named contract owner. These are extracted from the blueprints' own event tables and boundary sections, not invented.

| Seam | Contract | Notes |
|---|---|---|
| **HEXA → all** | `WorkflowExecutor` port (W1 engine), `AiPort`, `outbox_event`, hash-chained `audit_log`, Keycloak OIDC | No department re-implements identity, workflow or audit |
| **SPAR ↔ KILN** | `POST /api/stock/entries` — the single write path to the ledger; `purchase.grn.submitted`; `prod.wo.produced` | **KILN never writes stock tables directly.** Production is gated OFF until Inventory hits its 95–99% stock-accuracy target |
| **AXLE ↔ KILN** | Planned orders → Work Orders; `prod.wo.produced` / `prod.wo.deviation` → net-change replan; `eng.eco.applied` | **The tightest treaty in the system.** Production-Plan-lite is auto-disabled per plant when Planning is installed — two planning engines double-ordering one item is the documented Odoo failure mode |
| **AXLE ↔ SPAR** | `planning.pr.created` → Purchase MR queue; `grn.posted` → lead-time learning | Pegging must survive the conversion |
| **MICA ↔ AXLE** | `so.confirmed` → demand lines | |
| **MICA ↔ KILN** | `csp.complaint.created.v1` → `qms.ncr.created.v1` → `qms.capa.status_changed.v1` | The most fully specified cross-module contract in the whole set |
| **RASP ↔ KILN** | `hrm.attendance.day_finalised.v1` + `GET /internal/labour-cost/daily`; `maintenance.external.work.requested.v1` | Labour cost flows to work-order costing |
| **RASP ↔ SPAR** | Expenditure raises indirect PRs, then hands off to Purchase's PO engine | Expenditure has no PO engine of its own |
| **ONYX ↔ HEXA** | `AiGovernancePort` (opt-out, token budget, kill switch, `ai_action_log`); `platform/ai` router behind `AiPort` | **Open:** the router package currently ships with General's bootstrap. Decide whether it moves to ONYX or stays in HEXA |

---

## 5. Names considered and rejected

Recorded so they are not re-proposed.

### 5.1 Rejected for collision with tools already in our stack

| Name | Conflict |
|---|---|
| Sentry | Our observability stack (`GENERAL.md` §19) |
| Prometheus | Our metrics sidecar (`PRODUCTION.md` §19) |
| Atlas | Named as the rejected ORM runner-up (`GENERAL.md` §19) |
| Helm, Harbor | Kubernetes package manager and CNCF container registry |
| Vertex, Apex, Kronos, Vanta | Google Vertex AI, Salesforce Apex, UKG Kronos (HR software), Vanta (compliance SaaS) |
| Ruby, Rust | Programming languages |
| Prism | Epicor's AI brand — a direct competitor in manufacturing ERP |
| Joule, Zia, Einstein, Copilot, Now Assist | SAP, Zoho, Salesforce, Microsoft, ServiceNow |

### 5.2 Rejected for meaning or reputation

| Name | Reason |
|---|---|
| **Pegasus / PEAGASIS** | Pegasus is NSO Group's spyware. Catastrophic for a component whose job is proving DPDP compliance and PII residency to auditors |
| **Zeus** | Zeus/Zbot is a notorious banking trojan. We sell to CFOs |
| **Zapdos** | A Pokémon. Nintendo IP |
| **Silo** | "Siloed" is the exact anti-pattern our architecture forbids — no private copies of masters |
| **Motor** | Our pilot tenant manufactures auto components; it would read as a product, not a module |
| **Xeno** | Means *foreign / alien*. Wrong signal for a trust-and-compliance layer |
| **Retro** | Means backward-looking |
| **Axis** | Axis Bank — too present in Indian business for a finance-adjacent module |
| **Aadhar / Adhar** | The national identity system |
| **Khata** | Khatabook, a well-known Indian SME bookkeeping app |
| **Tally** | The incumbent we are displacing |
| **Kanban** | Generic, and it is a Planning concept — it would sit in the wrong department |

### 5.3 Strong runners-up, kept on file

| Name | Was proposed for | Why it nearly won |
|---|---|---|
| **AGATE** | AXLE's slot | Onyx is a banded variety of agate — same mineral family, giving the set an actual rule rather than a register |
| **KERF** | KILN's slot | The width of material a cutting tool removes. Genuine CNC-machining vocabulary, exactly our pilot's trade |
| **ARBOR** | AXLE's slot | A machine-tool spindle *and* a tree structure — a multi-level BOM is both |
| **STRATA** | SPAR's slot | Geological layers. The stock ledger *is* append-only FIFO layers |
| **PRAMAN** | ONYX's slot | Sanskrit प्रमाण, *proof / valid evidence* — matches the doctrine that AI must cite retrieved rows or refuse |
| **ROTA** | RASP's slot | The duty roster. Standard workplace vocabulary for the shift/muster core of HRM |

---

## 6. Open items

| # | Item | Lands on |
|---|---|---|
| 1 | **`ACCOUNTS.md` does not exist.** Nine modules emit posting events to an "Accounts stub" that has no blueprint | **RASP** |
| 2 | **`DECISIONS-V2.md` does not exist** anywhere under `E:\ERP`, yet it is cited 250+ times as binding across the nine V2 blueprints | **HEXA** |
| 3 | **Two files break their department's stack.** `SMBD.md` (MICA) and `PRODUCTION.md` (KILN) are FastAPI / PostgreSQL 16 while their departmental siblings are NestJS / PostgreSQL 17. Every other department is internally consistent | **MICA**, **KILN** |
| 4 | **ONYX's feature registry is closed** at 8 features across 5 modules, but 8 other modules specify AI features in their §13 — three of them claiming a "flagship." The router would reject all of them at runtime. Either register them (with golden sets and eval gates) or cut them and strip the claims | **ONYX** |
| 5 | **Router package ownership** — does `platform/ai` stay in HEXA's bootstrap or move to ONYX? | **HEXA** / **ONYX** |
| 6 | **Customer-facing branding** for the AI layer is undecided. These seven are internal engineering names | — |
