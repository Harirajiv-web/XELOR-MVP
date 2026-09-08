# IND-CORE Binding Platform Decisions — Version 2

**Status:** Binding · **Version:** 2.0 · **Supersedes:** `SHARED-STACK.md` (V1 baseline) and the per-plan V1 stack sections (PLAN-1 … PLAN-6)
**Owner department:** HEXA (Platform & Governance) · **Applies to:** every module blueprint (GENERAL, ADMINISTRATION, INTEGRATION, SMBD, CSP, ENGINEERING, PLANNING, PURCHASE, INVENTORY, PRODUCTION, INSPECTION, MAINTENANCE, HRM-ATTENDANCE, EXPENDITURE, ACCOUNTS, AI-OPERATIONS)
**Date reconstructed:** 23 July 2026 · **Evidence date of underlying research:** 18 July 2026

---

## 0. How to read this file

This is the single **normative rulebook** the module blueprints defer to. Two rules govern its authority:

1. **It is binding.** Where a blueprint says "conforms to DECISIONS-V2," the decisions below are not suggestions — they are the contract that module ships against.
2. **It wins on conflict.** Where any plan and this document disagree, **this document wins**. A module that needs to diverge must raise an ADR (Architecture Decision Record) and get a platform-level decision from HEXA; it may not diverge silently.

Every decision carries the evidence that produced it. The evidence base is the six research files: `RES-architecture.md` (Phase 3, software & tenancy), `RES-technology.md` (Phase 4, stack selection), `RES-compliance.md` (India legal/regulatory), `RES-competitors.md` (Phase 2, market), `RES-disproof.md` (Phase 7, adversarial review), and the `ERP-RESEARCH-BRIEFING.md` index. Confidence ratings (**High / Medium / Low**) and "would-flip-if" triggers are carried through from that research; a decision rated **Medium** is a real decision, not an open question, but its trigger is worth watching.

**Provenance note.** `RES-disproof.md` is the authoritative "final" list: it re-ran 17 fresh searches against every recommendation and overturned **none of 14** (9 survived outright, 5 survived with a corrected rationale). Where this file states a decision, it reflects the *post-disproof* position, including the corrected rationales.

---

## §1. Binding platform decisions & core ports

These are the load-bearing choices. They are locked for the MVP and the 3-year horizon unless a §-level trigger fires.

### 1.1 Architecture — boundary-enforced modular monolith

The product is a **single deployable NestJS application, single PostgreSQL database, organised into one module per ERP domain**, deployed as one image in **web and worker roles**. This is the pattern with the strongest first-party evidence for both our product category and our scale (Shopify's 1,000-dev modular monolith; Odoo and ERPNext are both monoliths; Prime Video's >90% cost cut collapsing microservices back to a monolith). Confidence: **High** — the best-evidenced decision in the corpus.

Binding consequences:

- **Module boundaries are enforced mechanically, not by convention.** Cross-module access is allowed *only* via exported service interfaces or outbox events. Boundary violations must fail CI (ESLint import rules / Nx module-boundary lint / `eslint-plugin-boundaries`), wired in **sprint 1**, not "later." Unenforced modularity decays into a ball of mud — the highest-likelihood risk in the corpus.
- **Cross-module ACID stays in one transaction.** A GRN posting that touches inventory, accounts and audit is one `BEGIN…COMMIT`, never a saga. This is *the* reason microservices are rejected at every horizon this document covers.
- **No hard foreign key crosses a module boundary.** Masters owned by a sibling module (`company`, `cost_center`, `item`, `supplier`, `customer`, `employee`, `asset`, etc.) are referenced **by id as a logical reference**; only intra-module FKs are declared. (This is the rule ACCOUNTS and others cite as "DECISIONS-V2 §2" for cross-module references; it is stated here and in §2.)

**Rejected:** unstructured monolith (forfeits cheap boundary insurance); microservices (premium exceeds a 4–8-person team; converts free ACID into sagas for no benefit at this scale); Event Sourcing / full CQRS (best-evidenced rejection in the corpus — consistent failure record; audit is met more cheaply by hash-chained logs + history tables). **Adopt narrowly:** transactional outbox + in-process events for side-effects; strategic DDD fully (context map = module map); tactical DDD selectively (payroll, tax/GST document lifecycle, stock valuation); ports/adapters for external systems and the workflow engine; CQRS-lite (report views / read replica) for reporting.

### 1.2 Multi-tenancy — pooled shared-schema + FORCE RLS, designed bridge-ready

**Single PostgreSQL, `tenant_id` on every tenant-scoped row, `FORCE ROW LEVEL SECURITY`, a dedicated non-owner `app_user` role, tenant set per-transaction (`SET LOCAL app.current_tenant = …`)** so PgBouncer transaction pooling stays safe. App-layer scoping is the *primary* mechanism; RLS is the fail-closed *backstop* — both are mandatory (belt-and-braces). Confidence: **High** for MVP-through-hundreds-of-tenants.

The tenancy model is the hardest thing to reverse, so the exits are designed in now: **UUIDv7 PKs** (never expose raw cross-tenant sequence IDs), every query carries `tenant_id` explicitly in `WHERE`, composite indexes lead with `tenant_id`. This keeps both exits cheap — Citus distribution on `tenant_id` (scale path A) and per-tenant DB extraction into a silo tier (commercial/compliance path B, priced as a premium SKU).

**Rejected:** schema-per-tenant (worst-of-both — pool's weak isolation with silo's O(N) migrations; Influitive post-mortem); DB-per-tenant-for-all (the Odoo/ERPNext precedent is driven by per-tenant schema mutation, which this product excludes via JSONB config — so it does not apply).

### 1.3 The W1 workflow engine — build it, behind a port, with a hard feature budget

Approval/document flows (PO chains, expense claims, leave, document lifecycles) are **tenant-configurable product surface no engine provides** — so we build a thin custom engine. It is exposed behind a **`WorkflowExecutor` port** and its scope is a **binding feature budget: states, transitions, approver resolution, and SLA timers only.** Anything else — parallel branches, sagas, compensation, day-spanning orchestration — is out of budget. The documented exit is **Temporal behind the same port**, adopted only when W2-class flows span days with cross-system compensation or exceed ~2–3 hand-rolled recovery mechanisms. Confidence: **High**.

Workflow config/instances/actions live in platform tables (`workflow_definition`, `workflow_instance`, `workflow_action` — hash-chained, append-only, feeding the audit log). In-flight instances stay **pinned to their definition version**; activating version n+1 never mutates a running instance.

**Rejected at MVP:** Temporal cluster (code-first, not tenant-configurable; heavy ops for a small team); Camunda (analyst-BPMN, not SMB-customer-facing; heaviest footprint); Step Functions (lock-in + per-transition economics + un-testable ASL for core ERP logic).

### 1.4 The AI router — one provider-agnostic port, thin by design

All AI calls go through a **provider-agnostic thin router** exposing `completion(task, schema)`. Default to **small models** (GPT-5 nano/mini or Gemini Flash class); Claude is the routed **premium** tier. The abstraction stays **thin — task-level model routing config, not a capability-abstracting gateway** (a fat gateway rots into a lowest-common-denominator wrapper that blocks provider-specific strengths). This hedges residency and pricing concentration. Governance (opt-out, token budget, kill switch, `ai_action_log`) is defined in §4. Confidence: **Medium** (re-verify the model/price table and any India-residency contract language at build time). See §4 for the feature registry and eval gate.

### 1.5 Identity — Keycloak 26 self-hosted, with Organizations

**Keycloak 26 (Apache-2.0), self-hosted in ap-south-1, with the Organizations feature** for B2B tenant identity separation; org membership mints the tenant/customer-account claim. It is the only option satisfying the full triad — India self-host (DPDP posture), SAML + LDAP federation (Indian mid-market SSO reality), and a permissive licence. **Auth.js is retired platform-wide** (it cannot carry the orgs/SAML/LDAP/residency requirements). Confidence: **Medium-High**.

**Binding rider:** Keycloak ops is a real budget line — a named owner + HA runbook, or managed Keycloak hosting pinned to ap-south-1 (an IdP outage is a total ERP outage). Application RBAC/ABAC stays in-app (see ADMINISTRATION). **Would flip if:** two quarters of pilot sales show zero SAML/LDAP demand → re-evaluate Zitadel's lighter ops.

### 1.6 Database engine & RLS acceptance criteria (normative)

**PostgreSQL 17** is the platform database. RLS acceptance criteria are **normative, not aspirational**: FORCE RLS on every tenant-scoped table; non-owner `app_user` role; `SET LOCAL` per transaction; UUIDv7 PKs; a CI test asserting **every tenant-scoped table has an RLS policy**; and **two-tenant leak probes run on every migration**. The week-1 RLS-overhead benchmark on the top-10 queries is mandatory, with the flip trigger in §5.7.

> **PG16 → PG17 reconciliation (binding).** Six blueprints (SMBD, ENGINEERING, PLANNING, PURCHASE, INVENTORY, PRODUCTION) were authored against **PostgreSQL 16 and, in several cases, a FastAPI backend**. `RES-technology.md` selected **PostgreSQL 17**, and `RES-architecture.md`/`RES-disproof.md` selected **NestJS/Node 22** as the single backend — and that choice **survived adversarial review unchanged**. Therefore the binding baseline is **PostgreSQL 17 + NestJS** for all modules; those six are to be reconciled to it (PG16→17 is a minor-effort upgrade; FastAPI modules are flagged for migration under the HEXA ADR process). No new module may start on FastAPI or PG16.

---

## §2. Technology stack & rejected alternatives

The full stack is a **single locked decision** — modules align to it, they do not re-choose. Rationales below are platform-level; a module may add module-specific justification but not a different technology without an ADR. All versions are as of the July-2026 research and are pinned; bumps go through HEXA.

| Layer | Decision (binding) | Runner-up / documented fallback | Why (post-disproof) | Conf |
|---|---|---|---|---|
| **Backend** | **Node 22 LTS + NestJS v11**, modular monolith | Java 21 + Spring Modulith | One language across the stack; DI/modules map 1:1 to ERP modules; workload is DB-bound CRUD, compute-heavy runs are worker jobs | M-H |
| **Frontend** | **Next.js 15 (React 19) + shadcn/ui + TanStack Table/Query + React-Hook-Form + Zod** | React + Ant Design/ProComponents (bail-out **before module 3** if table/form assembly overruns) | Largest India hiring pool; investor-demo-grade polish; Tailwind-native ownership | M-H |
| **Database** | **PostgreSQL 17** (RDS ap-south-1), shared-schema + FORCE RLS | Dedicated-DB tier (bridge path B) for a marquee isolation demand | Native mature RLS; JSONB; pgvector/pg_trgm; free licence | High |
| **ORM** | **Drizzle ORM v1 + drizzle-kit**; raw SQL for reports | **Kysely + Atlas** (keep the repository-layer seam so this is a refactor, not a rewrite) | **RLS ergonomics + SQL-first fit** — Prisma wraps every query in an interactive `$transaction` for `SET LOCAL`, a standing foot-gun under FORCE RLS (prisma#12735 open). *Rationale corrected post-disproof: Prisma 7 (Nov 2025) voided the old "heavy engine/perf" grounds; RLS ergonomics is the surviving reason* | M |
| **Cache / queue** | **Valkey (ElastiCache) + BullMQ**, versions pinned | Redis 8 (AGPL) if any Valkey incompatibility surfaces | BSD licence, ~20–30% cheaper on ElastiCache, BullMQ CI passes on Valkey (evidence *strengthened* on review); near-zero revert cost | High |
| **Search** | **Postgres FTS + pg_trgm** for MVP, behind an interface | **Meilisearch** (pull forward if Devanagari/mixed-script search becomes demo-critical) | Catalogs are 5–50K rows/tenant; prefix/code lookup dominates; Indic analyzer support is the watch item | High |
| **Identity** | **Keycloak 26 + Organizations**, self-hosted ap-south-1 | Zitadel (if LDAP demand never materialises) | See §1.5 | M-H |
| **AI backbone** | **Provider-agnostic thin router**, small-model default, Claude premium | — | Residency + pricing-concentration hedge; see §1.4 / §4 | M |
| **Vector** | **pgvector** | Qdrant (trigger: >5M active vectors or vector QPS degrading OLTP) | Inherits RLS/backups/transactions; benchmarks irrelevant at tens-of-thousands of vectors/tenant | High |
| **Object storage** | **AWS S3 ap-south-1**; dev via **Garage / SeaweedFS / LocalStack** | — | MinIO dropped (community edition in de-facto maintenance mode, GUI features stripped 2025) | High |
| **PDF** | **Gotenberg sidecar** (HTML→headless-Chromium), queued via BullMQ | @react-pdf for simple docs; Typst for high-volume payslips | Pixel-faithful GST invoices reuse web templates; browser isolated from the app | High |
| **Cloud / region** | **AWS ap-south-1** (Mumbai; ap-south-2 as DR) | DigitalOcean BLR1 (cost play); E2E/Yotta (PSU/MeitY deals only) | Managed RDS/PITR/ElastiCache/S3/SES buys the small team the most time per rupee; India residency | High |
| **IaC / CI** | **OpenTofu + GitHub Actions** (hosted runners) | Terraform (if a HashiCorp-locked TACOS is adopted); GitLab CI | Honest rationale: **state encryption + governance**, not licence risk; native state encryption matters for a DPDP-sensitive stack | M-H |
| **Observability** | **OpenTelemetry everywhere + Grafana Cloud + Sentry** | Self-hosted LGTM / SigNoz in ap-south-1 | Cost; **flag early:** Grafana Cloud has no India region — decide whether telemetry is regulated data under DPDP | High |

**Security-architecture verdicts (binding, from disproof):**

- **Next.js middleware performs zero authorization.** All authz lives in NestJS guards + RLS. This is the CVE-2025-29927 lesson (middleware auth-bypass via spoofed `x-middleware-subrequest`); an ERP holding payroll data must never make a UI framework layer its security boundary. A pin/patch policy for Next.js CVEs is mandatory.
- **No hard FK across a module boundary** (restated from §1.1) — cross-module references are logical ids.
- **Commit one data-grid decision in week 1** (a TanStack Table wrapper built once, or AG Grid Community) rather than re-assembling grids per module.

---

## §3. Compliance & legal posture (normative facts)

These facts are **normative** — every module treats them as ground truth. All independently re-verified in `RES-disproof.md` against primary sources (PIB, cert-in.org.in, labour.gov.in, tutorial.gst.gov.in, MCA/ICAI). "Build now, enforce at launch."

### 3.1 DPDP Act 2023 + Rules 2025 — phased, enforces May 2027

Rules notified 13/14 Nov 2025 with staggered commencement: **Consent-Manager framework +12 months (Nov 2026)**; **everything substantive — notice, consent, security safeguards, breach notification, retention/erasure, data-principal rights (≤90-day response), cross-border — +18 months = 12/13 May 2027.** Storing all data in ap-south-1 makes cross-border moot. Penalties: security-safeguard failure ₹250 cr; breach-notification failure ₹200 cr. Confidence: **High**.

- **Permissible marketing wording is fixed.** The **only** permitted phrasing is **"DPDP-ready, aligned to DPDP Rules 2025 phase-in (May 2027)."** Never "DPDP compliant" / "DPDP-compliant from day one." Over-claiming invites regulator and buyer-counsel trouble.
- **MVP build list:** consent/purpose registry per tenant (employment data flagged "legitimate use — no consent"; portal/marketing data flagged "consent"); standalone notice + withdrawal UX; data-principal rights queue (≤90-day SLA timer); breach playbook (see 3.2); field-level PII crypto/masking (Aadhaar/PAN/bank/salary); processor DPA clauses (AWS, MSG91, SES, Anthropic); erasure jobs honouring statutory overrides.

### 3.2 CERT-In Directions (2022) — live now

Applies to SaaS vendors today, **no MSME carve-out**: **6-hour incident reporting** to CERT-In from noticing (20 categories); **180-day ICT logs retained in Indian jurisdiction**; **NTP sync to NIC/NPL** (`samay1/samay2.nic.in`) or documented traceability (AWS Time Sync alone is not literally compliant — add chrony). Dual-regulator breach discipline: **one playbook, two clocks** — CERT-In 6h (now) + DPB immediate/72h + affected users (May 2027). Confidence: **High**.

### 3.3 MCA audit-trail rule — live since 1 Apr 2023

Accounting software must keep an **append-only, hash-chained, tamper-evident audit/edit log with no disable switch (not even super-admin), 8-year retention**, auditor-facing export (Rule 11(g)). Electronic books must stay **accessible in India with daily backup on servers physically in India** (Rule 3(5)/(6); ap-south-1 primary, ap-south-2 DR). Customers' statutory auditors will actively test the product for this. Applies to all books-affecting modules (ACCOUNTS, INVENTORY valuation, PAYROLL postings, SALES/PURCHASE). Confidence: **High**.

### 3.4 GST — e-invoice, e-way bill, IMS

- **E-invoice IRN** mandatory at **AATO ≥ ₹5 crore** (permanent once crossed); **no ₹1-crore notification exists** — design per-tenant applicability flags so a future lowering is config, not code. **High.**
- **30-day IRN reporting window** for AATO ≥ ₹10 crore (IRP rejects older docs); ageing alerts + day-25 hard-stop warning.
- **⚠ 1 Aug 2026 GSTN API change (ranked risk #1):** **Ship-to GSTIN (`ShipDtls.Gstin`) becomes mandatory** in e-invoice / EWB-by-IRN APIs ("URP" if unregistered); new mandatory `Gstin` under `ExpShipDtls`; Bill-to ≠ Ship-to checks; new voluntary **EWB Closure API**. The payload builder must implement and sandbox-certify this **now**. **High.**
- **E-way Bill 2.0** dual-portal (live 1 Jul 2025): design dual-endpoint failover, same credentials/contracts.
- **IMS (Invoice Management System):** the Purchase/Finance module needs an IMS reconciliation workspace (pull records via GSP, match to GRN/PO, push accept/reject/pending, honour the one-period pending limit on credit notes, capture the ITC-reversal declaration); GSTR-2B is now sequential (generated only after the prior period's 3B is filed) and must be recomputed if IMS actions change after the 14th.
- **GSP, not direct API:** assume integration **through a GSP/ASP** (do not assume per-tenant direct NIC/IRP credentials). GSP vendor selection is an open mandatory item (§6d).

### 3.5 Payroll statutory (FY 2026-27)

- **Four Labour Codes in force since 21 Nov 2025.** The **new wage definition (s.2(y))** drives a **"deemed wages"** computation: if excluded components (HRA, conveyance, OT, bonus…) exceed **50% of total remuneration, the excess is added back** to the wage base for **PF and gratuity**. Payroll must compute deemed wages, not just Basic+DA. Fixed-term employees: gratuity after **1 year**. **High.**
- **EPF ceiling ₹15,000/month** (re-notified 29 May 2026; a hike to ₹21k/₹25k is speculative — keep config-driven). **ESI threshold ₹21,000** (0.75% employee / 3.25% employer).
- **Professional tax** is state-specific and effective-dated (Maharashtra monthly, ₹300 in February; Tamil Nadu half-yearly) — never hardcode; verify the MH women's-exemption limit before shipping.
- **Income tax FY 2026-27 new regime:** 0–4L nil; 4–8L 5%; 8–12L 10%; 12–16L 15%; 16–20L 20%; 20–24L 25%; >24L 30%; s.87A rebate ₹60,000 (≤₹12L); standard deduction ₹75,000. **The Income-tax Act 2025 replaces the 1961 Act from 1 Apr 2026** — verify TDS/24Q section renumbering against CBDT before hardcoding form labels.
- **Universal rule:** every statutory number (EPF/ESI ceilings, PT slabs, bonus thresholds, tax slabs) lives in **effective-dated config tables, never as constants in code.**

### 3.6 Security frameworks to target

**ISO/IEC 27001:2022** (the only certifiable version; target within 12–18 months — its Annex A controls double as DPDP Rule 6 evidence); **OWASP ASVS 5.0 Level 2** as the engineering bar, mapped into CI; **SOC 2 Type II** later when going upmarket/US. RBI payment-data rules apply only if we process payments (not MVP — flag before any payment-aggregator integration).

### 3.7 Observability / retention obligations (summary)

| Requirement | Driver | Number |
|---|---|---|
| Security/ICT logs, all systems | CERT-In 2022 | **180 days rolling, stored in India** |
| Personal-data access logs | DPDP Rule 6 | **≥ 1 year** |
| Financial audit trail / edit log | MCA Rule 3(1) + 11(g) | **8 years, tamper-evident, never disableable** |
| Books backup | Rule 3(5)/(6) | **Daily, servers physically in India**; ROC disclosure |
| Clock sync | CERT-In | NIC/NPL NTP or traceable |
| Incident reporting | CERT-In / DPDP | **6 h** to CERT-In (now) / DPB immediate + **72 h** + users (May 2027) |

---

## §4. AI feature governance & guardrails

### 4.1 The ship gate is real and binding

**Every AI feature must pass a golden-set eval gate before it ships: it must beat the deterministic baseline, and a failing gate blocks promotion.** The harness runs locally and in CI and produces a scorecard per feature. This is the mechanism ONYX (AI-OPERATIONS) exists to provide; without it, the ship gate is a promise, not a control. Confidence: **High** on the necessity.

### 4.2 The registry is closed at 8 features — commit 3, stretch 5

The MVP AI portfolio is **fixed at 8 features** (the AI research removed ~32 to reach it). The router keys on `feature_key`; a module that specifies an AI feature not in the registry is **rejected at runtime**. The committed flagship pattern across the corpus is **document extraction** (the one ERP-AI category with real shipped-and-stuck evidence — NetSuite Bill Capture, Concur, Zoho OCR):

- **Committed (3):** receipt/document extraction + auto-categorisation (EXPENDITURE flagship — GSTIN regex validation, tax-arithmetic cross-checks, confidence display, human confirmation); duplicate detection (GENERAL); ticket auto-triage + sentiment (CSP — suggested, not forced).
- **Stretch (5):** reply drafting / thread summarisation (CSP — agent-assist, never autonomous); HSN/SAC suggestion (GENERAL); payslip explainer (HRM); SoD-conflict explanation (ADMINISTRATION); and one further module stretch. Stretch features ship only if their golden-set gate passes.

Any module claiming a "flagship" AI feature not on this list must either register it (with a golden set and eval gate) or **cut it and strip the claim** — it cannot ship unregistered.

### 4.3 Guardrails (binding on every AI call)

- **AI explains; it never decides.** Deterministic outcomes (SoD conflicts, budget availability, tax math) are computed by rules; the model may only *explain* a row the rules already produced — it never creates, changes, or suppresses a verdict.
- **Every AI action is logged** to the hash-chained **`ai_action_log`** (even explanation calls).
- **Human-in-the-loop by tier;** confidence is displayed; the user confirms.
- **Opt-out, token budget, and a kill switch** are mandatory and owned via the `AiGovernancePort` (see §5 platform tables). *Open item (§6i): whether the router package `platform/ai` lives in HEXA's bootstrap or moves to ONYX.*
- **No sales collateral references India AI residency** until provider contract language is verified.

---

## §5. Data, persistence, API & eventing conventions

These are **normative** and apply to every table, endpoint and event in every module. This is the most-cited section in the blueprints.

### 5.1 Table conventions

- **UUIDv7 primary keys** everywhere (no raw cross-tenant sequences).
- Every tenant-scoped table carries **`tenant_id`**, with **FORCE RLS** and one simple policy; **composite indexes lead with `tenant_id`**.
- Every row carries **`created_at` / `created_by`, `updated_at` / `updated_by`, `is_active`** (soft delete).
- **No hard DELETE** on masters, financial documents, or statutory/evidence logs.
- **Monetary values are `NUMERIC(18,2)`** (use `NUMERIC(18,4)` only where sub-paisa precision is required, e.g. AI unit costs).
- **Statutory / rate / price / model-config masters are effective-dated** — INSERT a new row with an effective date and do as-of lookups; never mutate in place.

### 5.2 Platform tables (owned centrally, referenced by all)

`workflow_definition` / `workflow_instance` / `workflow_action` (hash-chained), **`outbox_event`**, **`audit_log`** (hash-chained, 8-year, non-disableable), **`ai_action_log`**, plus `tenant` registry (not RLS-scoped), `consent_record`, `dsr_request`. These are defined by HEXA (GENERAL/ADMINISTRATION); other modules **cross-reference, never redefine** them.

### 5.3 API conventions

- **Canonical error envelope** (a single platform-wide shape — not raw RFC 7807 per module).
- **Cursor pagination only** (no offset pagination).
- **`Idempotency-Key` honoured on all mutating endpoints** (replay-safe; 409 on hash mismatch).
- OpenAPI generated per module; HMAC-signed webhooks for outbound integration.

### 5.4 Eventing

- **Versioned event names: `module.entity.verb.v1`** (e.g. `purchase.grn.submitted`, `csp.ticket.created.v1`, `qms.ncr.created.v1`).
- **Transactional outbox in Postgres is the durability anchor**; Valkey relays to BullMQ consumers.
- **At-least-once delivery + idempotent consumers ⇒ exactly-once *effect*.** Platform-provided dedup on the consumer side.

### 5.5 The ledger-critical rule (binding, safety-critical)

**Ledger-correctness-critical writes are synchronous, in one DB transaction — they never ride the event bus.** A GRN that "eventually" hits stock, or a budget check that is eventually consistent, is an ERP bug, not a feature. Budget availability, stock ledger writes, and journal postings are read/written in-transaction (`SELECT … FOR UPDATE` on the contended row). Events are for *side-effects* (notifications, projections, integrations, audit fan-out), not for correctness.

### 5.6 The single write path to stock

KILN (Production) **never writes stock tables directly.** The only write path to the ledger is the platform stock-entry endpoint (`POST /api/stock/entries`), owned by SPAR (Inventory). Production is gated OFF until Inventory hits its stock-accuracy target. (This is the SPAR ↔ KILN contract; stated here so no module violates it.)

### 5.7 The RLS-overhead flip trigger

The week-1 FORCE-RLS overhead benchmark on the top-10 queries is mandatory. **If overhead exceeds 15–20%, a mandatory design review is triggered** (recorded in an ADR). This is the platform mitigation trigger every module's NFR table references.

### 5.8 Per-tenant export / PITR runbook (acceptance criterion)

A rehearsed **per-tenant logical export + point-in-time restore runbook** is an acceptance criterion (added post-disproof) — it is needed for DPDP portability/erasure, tenant offboarding, and the bridge path B silo extraction. "Can you restore *my* data to yesterday?" must have a real answer.

---

## §6. Open mandatory platform work items & sequencing gates

These are the cross-cutting gaps `RES-disproof.md` flagged as mandatory work. They are **owned by HEXA** and several are **sequencing gates** that block module work. Letters are stable identifiers the blueprints cite.

| # | Item | Status / gate |
|---|---|---|
| **(a)** | **Mobile / offline-first strategy** — the single biggest omission. Factory-floor punches, job-card updates, GRN scans, dispatch confirmations happen on mid-range Android over patchy networks. Needs a dedicated PWA-vs-native + offline queue/sync (conflict resolution against an RLS backend) design phase. **Gate: must land before the CSP UX freeze and before the Manufacturing auth pack (kiosk PIN/badge/RFID) is sequenced.** | **Open — blocking** |
| **(b)** | **Frappe/ERPNext-as-build-platform rejection memo** — building *on* Frappe was never argued against. Rejection is probably right (MariaDB/Python/DB-per-site conflict with the pooled-SaaS thesis) but a decision this size needs an explicit memo, not silence. | Open |
| **(c)** | **Pricing / unit-economics model** — the "₹500–1,500/user/mo whitespace" is asserted, never modelled. Needs COGS/tenant, GSP per-document fees, AI cost pass-through, CAC under CA/partner distribution. | Open |
| **(d)** | **GSP vendor selection** — the entire GST design assumes "via GSP" with zero vendor research (ClearTax/Cygnet/MasterGST/Vayana on API quality, sandbox, per-doc price, SLA). Critical-path dependency. | Open |
| **(e)** | **Timeline/scope feasibility pass** — 6+ modules incl. statutory payroll + GST + 8 AI features + Keycloak + compliance plumbing, 4–8 engineers, 4–6 months, never stress-tested. | Open |
| **(f)** | **WhatsApp Business API (BSP)** — the dominant Indian SMB channel, absent from the notification stack. Named fast-follow; the channel enum, adapter port and template registry ship in MVP so a BSP (MSG91/Twilio-class) is a drop-in. | Open — MVP stubs required |
| **(g)** | **Indic-language UI / i18n** — the whitespace pitch sells "MRP-exception explainer in Hindi/Marathi"; English MVP with an i18n scaffold, Indic search/input as a named work item. | Open |
| **(h)** | **Tally data-import spec** — named as a pilot-conversion lever ("first invoice in a day") with no importer research. | Open |
| **(i)** | **AI router package ownership** — does `platform/ai` stay in HEXA's bootstrap or move to ONYX? (from NAME.md open items / §4.3) | Open — HEXA/ONYX decision |

---

## §7. Canonical demo universe

Every module seeds against **one internally-consistent fictional dataset** — inconsistent numbers between modules is the fastest way to lose an investor's trust. This is fixed and unchanged across all blueprints.

- **Primary tenant: Trishul Precision Components Pvt Ltd** — auto-component manufacturer, Pune HQ; two plants and **two GST registrations**: Pune-Chakan (Maharashtra) GSTIN **`27AABCT1234F1Z5`**, Coimbatore (Tamil Nadu) GSTIN **`33AABCT1234F1Z9`**.
- **Secondary tenant: Kaveri ElectroFab Industries** (Bengaluru) — seeded **minimally**, solely to power tenant-isolation and RLS leak-probe demonstrations.
- **Financial year:** FY 2026-27 (1 Apr 2026 → 31 Mar 2027), currency **INR** (lakh/crore formatting; DD-MMM-YYYY dates).
- **Demo "today":** **Monday 20 July 2026.**

The two-GSTIN primary tenant is deliberate — it exercises multi-GSTIN-per-tenant from day one (NetSuite's single-GSTIN-per-nexus limitation is a documented competitor dealbreaker). *Note: the real-world pilot named in the Investor MVP Plan (Kaveri Pumps & Motors, Coimbatore) is a separate sales reference, not this demo tenant.*

---

## Appendix A — Pinned versions (as of July 2026 research; bumps via HEXA ADR)

Next.js 15 / React 19 · NestJS v11 / Node 22 LTS · PostgreSQL 17 · Drizzle ORM v1 + drizzle-kit · Valkey (ElastiCache) + BullMQ (pinned) · Keycloak 26 · pgvector · Gotenberg · S3 ap-south-1 (Garage/SeaweedFS/LocalStack dev) · OpenTofu + GitHub Actions · OpenTelemetry + Grafana Cloud + Sentry · AWS ap-south-1 (ap-south-2 DR).

## Appendix B — Change control

Any change to a §1–§7 decision requires an ADR reviewed by HEXA. A module may not diverge silently; where a plan and this document conflict, **this document wins**. The "would-flip-if" triggers embedded above are the sanctioned re-open conditions — watch them, and re-run the specific decision (not the whole baseline) when one fires.

## Appendix C — Evidence base

`RES-architecture.md` (Phase 3) · `RES-technology.md` (Phase 4) · `RES-compliance.md` · `RES-competitors.md` (Phase 2) · `RES-disproof.md` (Phase 7, adversarial — 0/14 overturned) · `ERP-RESEARCH-BRIEFING.md` (index). Underlying research authored by Fable 5, dated 18 July 2026; figures rated **L/Low** or "in flux" in those files must be re-verified against their primary sources before use in a contract, price list, or customer promise.

*End of DECISIONS-V2 (binding). Lineage: supersedes SHARED-STACK.md and PLAN-1 … PLAN-6 V1 stack sections. Owner: HEXA.*
