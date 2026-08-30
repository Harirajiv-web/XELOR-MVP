# CLAUDE.md — IND-CORE / IND-AI Manufacturing ERP

> Project context for Claude Code. Read this first. It captures the state of the project as handed off from a Cowork session on 23 Jul 2026, so a fresh session can continue without re-explanation.

## What this project is

**IND-CORE** is an India-first, AI-native manufacturing ERP for MSMEs (founder: Hari Rajiv; positioning: "Manufacturing Intelligence for India"). Two product forms share one platform, and they now have names:

- **ONYX by AIKYANTRA** — Phase 1, the ERP, in `ONYX-phase-1/`.
- **XELOR by AIKYANTRA** — Phase 2, the intelligence layer, in `XELOR-phase-2/`.

NOTE: these names were SWAPPED on 20 Aug 2026. Any document written before that date uses
them the other way round — including the architecture dossier in `deliverables/`.

- **IND-CORE** — a full modern ERP (Sales/CRM, Procurement, Inventory, Manufacturing, Quality, Maintenance, Finance & People) with an **IND Copilot** built in. Target: factories with no ERP (paper/Excel).
- **IND-AI** — a read-only intelligence layer on top of a plant's existing systems (SAP, Tally, Odoo, Dynamics, MES/SCADA, documents). Target: factories that already run an ERP.

Core thesis: turn disconnected factory data into **trusted operational decisions in minutes — with evidence, under human control** (Connect → Retrieve → Reason → Act). AI is **evidence-grounded and approval-gated**: it cites source rows and only drafts actions for humans to approve; it never writes back autonomously.

Team: ~5 engineers. Target: investor MVP first, then a pilotable product. Pilot reference: Kaveri Pumps & Motors, Coimbatore.

## Where things live

- `ONYX-phase-1/` — **ONYX by AIKYANTRA**, Phase 1: the ERP (api :3000, web :3001, db `indcore`).
- `XELOR-phase-2/` — **XELOR by AIKYANTRA**, Phase 2: the intelligence layer on top of it (api :3100, web :3101, db `indcore_p2`).
- `docs/00-governance/` — binding decisions, ownership, and the master product blueprint.
- `docs/01-platform/` through `docs/05-people-and-finance/` — ordered module blueprints.
- `docs/06-ai-architecture/` and `docs/07-execution/` — advisory architecture and execution plans.
- `docs/08-presentations/` — investor decks and their source assets.
- `deliverables/` — documents for people outside the team: the architecture dossier, the investor deck, the competitor research.
- `archive/` — nothing live: the original single-repo checkout, superseded decks, the immutable research corpus, disposable probes.

See `README.md` for the complete workspace index. **The top-level folder name says which product a file belongs to**; `docs/` and `deliverables/` cover both.

## THE binding document — read it before writing any code

**`docs/00-governance/01-binding-platform-decisions-v2.md`** is the normative platform rulebook. It is **binding** and **wins on any conflict** with a module blueprint. It has 7 sections every module defers to:

- **§1** core decisions & ports (modular monolith; pooled shared-schema + FORCE RLS; `WorkflowExecutor` port w/ hard feature budget; provider-agnostic AI router; Keycloak 26; PG17 + RLS acceptance criteria)
- **§2** stack table + rejected alternatives
- **§3** compliance facts (DPDP, CERT-In, MCA 8-yr audit trail, GST incl. 1 Aug 2026 Ship-to-GSTIN, payroll deemed-wages)
- **§4** AI governance (golden-set eval gate; closed 8-feature registry; "AI explains, never decides")
- **§5** data/API/eventing conventions (the densest, most-cited section)
- **§6** open mandatory work items
- **§7** canonical demo universe

To diverge from any §1–§7 decision, raise an ADR reviewed by HEXA — never diverge silently.

## Locked technology stack (do not re-choose)

**NestJS v11 / Node 22 · Next.js 15 / React 19 + shadcn/ui · PostgreSQL 17 (shared-schema + FORCE RLS) · Drizzle ORM v1 · Valkey + BullMQ · Keycloak 26 · pgvector · Gotenberg (PDF) · S3 ap-south-1 · OpenTofu + GitHub Actions · OpenTelemetry + Grafana + Sentry · AWS ap-south-1.**

This stack survived adversarial review (`RESEARCH`/RES-disproof: 0 of 14 recommendations overturned). **No new module may start on FastAPI or PostgreSQL 16.** Six blueprints (SMBD, ENGINEERING, PLANNING, PURCHASE, INVENTORY, PRODUCTION) were authored on FastAPI/PG16 and are flagged for reconciliation to the baseline.

## Key §5 conventions (apply to every table/endpoint/event)

UUIDv7 PKs · `tenant_id` + FORCE RLS on every tenant-scoped table, composite indexes lead with `tenant_id` · `created_at/by`, `updated_at/by`, `is_active` soft delete · no hard DELETE on masters/financial/statutory rows · money `NUMERIC(18,2)` · effective-dated statutory/rate masters · canonical error envelope · cursor pagination only · `Idempotency-Key` on mutating endpoints · versioned events `module.entity.verb.v1` via transactional outbox (at-least-once + idempotent = exactly-once effect) · **ledger-critical writes stay synchronous in one transaction, never on the bus** · Production never writes stock directly (single write path `POST /api/stock/entries`, owned by Inventory) · RLS overhead >15–20% triggers a mandatory design review.

## Departments / agents (system-of-record ownership)

See `docs/00-governance/02-departments-and-agent-ownership.md`.

- **HEXA** — Platform & Governance: `docs/01-platform/`
- **MICA** — Commercial: `docs/02-commercial/`
- **SPAR** — Supply Chain: `docs/03-supply-chain/`
- **AXLE / KILN** — Engineering and Manufacturing: `docs/04-engineering-and-manufacturing/`
- **RASP** — People & Money: `docs/05-people-and-finance/`
- **ONYX** — AI Operations: `docs/01-platform/04-ai-operations.md`

Each blueprint follows the same 20-section + 2-appendix template (Module Overview → … → Demo Data → Appendix A/B).

## Canonical demo universe (§7) — seed everything against this

Primary tenant **Trishul Precision Components Pvt Ltd** (Pune HQ; two plants / two GSTINs: Pune-Chakan `27AABCT1234F1Z5`, Coimbatore `33AABCT1234F1Z9`). Secondary tenant **Kaveri ElectroFab Industries** (Bengaluru, seeded minimally for RLS leak-probe demos). FY 2026-27, INR (lakh/crore, DD-MMM-YYYY). Demo "today" = **Mon 20 Jul 2026**.

## Open items / gaps (from DECISIONS-V2 §6, owned by HEXA)

(a) **mobile/offline-first strategy** — biggest gap; blocking gate before CSP UX freeze & the Manufacturing auth pack · (b) Frappe-as-build-platform rejection memo · (c) pricing/unit-economics model · (d) GSP vendor selection · (e) timeline/scope feasibility pass · (f) WhatsApp BSP (MVP stubs) · (g) Indic i18n · (h) Tally importer spec · (i) AI router package ownership (HEXA vs ONYX).

Also note: **`RES-ai.md`** (the AI-features research behind §4) was referenced by the blueprints but is not yet in the folder — worth locating to firm up §4's feature registry.

## Suggested next steps

1. Scaffold **HEXA / GENERAL** (the platform bootstrap every module inherits: monorepo, FORCE RLS, outbox, hash-chained audit, event bus, Keycloak OIDC).
2. Assemble the **unified §7 demo dataset** so every module shows consistent numbers.
3. Reconcile the six FastAPI/PG16 blueprints to the NestJS/PG17 baseline.
4. Author the missing `RES-ai.md` / register the 8 AI features with golden-set eval gates.

## Working agreements

- Treat `docs/00-governance/01-binding-platform-decisions-v2.md` as the contract; cite the § you're implementing.
- Keep module boundaries enforced in CI from sprint 1 (cross-module access only via service interfaces or outbox events; no hard FK across a module boundary).
- Every statutory number is config, never a constant in code.
