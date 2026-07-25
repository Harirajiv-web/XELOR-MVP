# IND-CORE Manufacturing ERP — MVP Prototype 1

A **boundary-enforced modular monolith** built strictly to **`DECISIONS-V2.md`**
(binding). This scaffold makes its §1/§4/§5 conventions *executable* rather than
aspirational: the platform foundation, an in-house RBAC + approval engine, the shared
**AI spine** every module's "brain" plugs into, and the first two business modules
(GENERAL, ENGINEERING) — each one done *correctly* so the remaining ~14 modules copy
locked patterns instead of re-litigating them.

**Stack (locked, do not re-choose):** NestJS v11 / Node 22 · PostgreSQL 17 + **FORCE
RLS** · Drizzle ORM · Valkey + BullMQ · Keycloak 26 OIDC · pgvector/pg_trgm ·
Gotenberg · pnpm workspace. Provider-agnostic AI router — an offline deterministic stub by
default, a **local model (EDGE tier)** with `AI_PROVIDER=ollama`, and a hosted provider
swappable in by the same config.

> **Scope now:** platform foundation + Identity/RBAC + W1 approval engine + the shared
> AI spine + **Module 01 GENERAL** (company master with a duplicate-detection brain) +
> **Module 02 ENGINEERING** (item master + Bill of Materials, reusing the shared dedup
> brain) + **Module 03 INVENTORY** (the stock ledger + the single stock write path) +
> **Module 04 PURCHASE** (vendors, POs approved through W1, GRNs posting stock through
> Inventory) + **Module 05 PRODUCTION** (the make cycle — consume components, produce
> finished goods) + **Module 06 INSPECTION/QMS** (sampling, inspections, dispositions, and
> the quality gate Production now honours) + **Module 07 SMBD** (customers, sales orders
> with real GST place-of-supply, credit gate, dispatch). The order-to-cash spine
> (buy → stock → make → inspect → **sell**) is in place.

## What's here

```
MVP_PROTOTYPE_1/
├─ infra/
│  ├─ docker-compose.yml            # PG17+pg_trgm · Valkey · Keycloak 26 · Gotenberg
│  ├─ keycloak/realm-indcore.json   # realm 'indcore': clients, groups→tenant, demo users
│  └─ postgres/init/00-init.sql     # app_user (NON-OWNER, NOBYPASSRLS) + extensions
├─ packages/
│  ├─ platform/                     # @ind-core/platform — the primitives §5 mandates
│  │  └─ src/
│  │     ├─ {ids,errors,events,tenancy,audit,api}/     # UUIDv7, error envelope, outbox
│  │     │                                             #   events, cursor pagination …
│  │     ├─ masterdata/
│  │     │  ├─ dedup.ts             # the SHARED, pure dedup brain (AI #2 baseline+detector)
│  │     │  └─ dedup-verdict.ts     # CODE decides the conclusion + action; grounding guard
│  │     ├─ quality/sampling.ts     # pure QMS brain: ISO 2859-1 sampling · spec eval · lot verdict
│  │     ├─ tax/gst.ts              # pure GST brain: GSTIN+checksum · place of supply · CGST/SGST vs IGST
│  │     └─ ai/                     # router types · CLOSED 8-feature registry · eval gate
│  │        ├─ types.ts             #   AiProvider / AiCompletionRequest contracts
│  │        ├─ feature-registry.ts  #   the closed set of 8 (unknown key → hard reject)
│  │        └─ eval.ts              #   pure golden-set scoring + PASS/FAIL gate (§4.1)
│  └─ db/                           # @ind-core/db — Drizzle schema + RLS + migrations
│     ├─ src/schema/{platform,general,admin,workflow,engineering,inventory,purchase,production}.ts
│     ├─ src/{client,migrate,rls-check}.ts
│     ├─ src/rls/leak-probe.test.ts # two-tenant leak probe (§1.6)
│     └─ migrations/0000 … 0019.sql # see "Schema surface" below
└─ apps/
   └─ api/                          # @ind-core/api — NestJS modular monolith
      └─ src/
         ├─ main.ts                 # HTTP entrypoint (the API)
         ├─ worker.ts               # WORKER entrypoint — the outbox relay ("mailman") + consumer
         ├─ eval.ts                 # ship-gate CLI — runs a feature's golden set, exits 0/1
         ├─ ai-grounding.ts         # grounding gate CLI — is the EXPLANATION true? exits 0/1
         ├─ app.module.ts           # composes AiModule + General + Workflow + Engineering + Inventory + Purchase + Production
         ├─ common/                 # tenant middleware · RBAC guard · audit · idempotency · error filter
         ├─ ports/                  # app-level cross-module ports: WorkflowExecutor · StockPoster · BomProvider · InspectionGate
         ├─ bus/                    # the event bus: BullMQ relay + idempotent consumer
         │  └─ {connection,queue,outbox-relay,event-consumer}.ts
         ├─ ai/                     # the shared AI SPINE (see below)
         │  ├─ ai-router.service.ts #   the one doorway: reject → govern → route → log
         │  ├─ stub.provider.ts     #   OFFLINE provider (default) — deterministic, zero spend
         │  ├─ ollama.provider.ts   #   EDGE provider — a model on this machine, auto-degrades
         │  └─ dedup-explainer.ts   #   the dedup brain's surface (verdict in code, wording in model)
         └─ modules/
            ├─ general/             # Module 01 — company master + master_dedup brain
            ├─ engineering/         # Module 02 — item master + Bill of Materials
            ├─ inventory/           # Module 03 — stock ledger + the single stock write path (@Global port)
            ├─ purchase/            # Module 04 — vendors + POs (W1 approval) + GRNs (post stock)
            ├─ production/          # Module 05 — the make cycle (consume components, produce FG)
            ├─ quality/             # Module 06 — inspections, sampling, dispositions (@Global gate port)
            ├─ sales/               # Module 07 — customers, sales orders + GST, credit gate, dispatch
            └─ workflow/            # W1 approval engine (@Global WorkflowExecutor port)
```

### Schema surface (migrations 0000 → 0013)

| # | Migration | What it adds |
|---|---|---|
| 0000 | `init` | platform tables + GENERAL first slice; UUIDv7, `tenant_id`, FORCE RLS, hash-chained `audit_log`, `outbox_event`, `company` + `gst_registration` |
| 0001 | `seed_demo_universe` | §7 canonical data — Trishul Precision Components (one company, **two GSTINs**) + Kaveri ElectroFab |
| 0002 | `admin_rbac` | in-app RBAC engine: `role`, `permission`, `role_permission`, `user_role` (tenant-owned, FORCE RLS) |
| 0003 | `seed_rbac` | demo roles/permissions/assignments keyed to the fixed Keycloak user ids |
| 0004 | `idempotency` | `Idempotency-Key` replay store — one row per (tenant, key) (§5.3) |
| 0005 | `workflow` | W1 approval engine: versioned templates (`definition`) + live `instance` + tamper-proof action trail |
| 0006 | `event_consumption` | consumer-side dedup ledger for the relay → idempotent consumer |
| 0007 | `ai_action_log_chain` | makes `ai_action_log` genuinely hash-chained (§4.3, §5.2) |
| 0008 | `ai_governance` | `ai_feature_state` (kill switch), `ai_opt_out` (DPDP), `ai_token_ledger` (daily budget) |
| 0009 | `company_trgm_index` | GIN trigram index so the live dedup name-prefilter is fast at scale |
| 0010 | `engineering_item` | ENGINEERING item master (§5.1 conventions, FORCE RLS, soft-delete) |
| 0011 | `engineering_bom` | Bill of Materials — `bom` header + `bom_line`, intra-module FKs only (§1.1) |
| 0012 | `seed_engineering` | Centrifugal Pump **CP-50** + its components + the pump's BOM (§7) |
| 0013 | `inventory` | `warehouse`, `stock_balance` (the contended row), append-only `stock_ledger`, `stock_entry` + line; 5 seeded Trishul warehouses; stores staff get `inventory.stock.post` |
| 0014 | `purchase_vendor` | PURCHASE `vendor` master (GIN trigram index on name for the shared dedup brain) |
| 0015 | `purchase_order` | `purchase_order` + `_line` (approved through W1; `workflow_instance_id` links the approval) |
| 0016 | `purchase_grn` | `grn` + `grn_line` — goods receipts that post stock through Inventory's write path atomically |
| 0017 | `production` | `production_order` + `production_order_component` (BOM requirements exploded + snapshotted); consumes/produces stock through Inventory's port |
| 0018 | `quality` | QMS: `qms_characteristic` (effective-dated specs), `qms_sampling_plan` (band tables as config), versioned `qms_inspection_template` + lines, `qms_inspection` (+ the partial-unique **gate anchor**), `qms_inspection_reading` (spec limits snapshotted), `qms_disposition` (CHECK: `executed` requires a stock-entry ref) |
| 0019 | `seed_quality` | AQL 1.0 / Level II band table, the CP-50 pump's final-inspection template (bore ⌀, runout, leak test) and the casing's incoming template (§7) |
| 0020 | `sales` | SMBD: `customer` (GSTIN shape CHECK + trigram index for the dedup brain), `sales_order` + `_line` (rate-wise GST stored per line, `chk_gst_exclusive`, duplicate-PO guard, credit snapshots), `dispatch` + `_line` (CHECK: shipped requires a stock-entry ref) |
| 0021 | `seed_sales` | four demo customers chosen to exercise place of supply: Pune (intra), Bengaluru (inter), Coimbatore (intra *or* inter depending on the selling GSTIN), and one unregistered buyer (§7) |

### The conventions, made real

| DECISIONS-V2 rule | Where it lives |
|---|---|
| §1.1 module boundaries fail CI | `eslint.config.js` (eslint-plugin-boundaries) |
| §1.2/§1.6 pooled shared-schema + **FORCE RLS**, non-owner `app_user`, `SET LOCAL` per tx | `infra/postgres/init`, `migrations/0000`, `packages/db/src/client.ts` |
| §1.6 **every tenant-scoped table has an RLS policy** (CI gate) | `packages/db/src/rls-check.ts` |
| §1.6 **two-tenant leak probes** | `packages/db/src/rls/leak-probe.test.ts` |
| §1.3 W1 approval workflow behind a **WorkflowExecutor** port | `apps/api/src/modules/workflow/*`, `migrations/0005` |
| §1.5 identity — tenant from a **verified token group**, never a header | `apps/api/src/common/tenant.middleware.ts` (Keycloak OIDC via `jose`) |
| RBAC — `@RequirePermission` + a global `PermissionGuard` | `apps/api/src/common/permission.guard.ts`, `migrations/0002`/`0003` |
| §1.4/§4.2 **provider-agnostic AI router**; unregistered `feature_key` rejected | `apps/api/src/ai/ai-router.service.ts` + `packages/platform/src/ai/feature-registry.ts` |
| §4.3 AI governance (kill switch · DPDP opt-out · daily budget), checked & audited | `apps/api/src/ai/db.governance.ts`, `.../governance.controller.ts`, `migrations/0008` |
| §4.3 hash-chained `ai_action_log` for **every** AI call (refusals included) | `apps/api/src/ai/ai-action-log.service.ts`, `migrations/0007` |
| §4.1 golden-set **eval gate** (beat the deterministic baseline; no must-pass regression) | `apps/api/src/ai/eval/*` + `apps/api/src/eval.ts` + `packages/platform/src/ai/eval.ts` |
| §4.3 **"AI explains, never decides"** — the conclusion + action decided in code, the model writes only the reason, and ungrounded wording is rejected | `packages/platform/src/masterdata/dedup-verdict.ts` + `apps/api/src/ai-grounding.ts` |
| §3.4 GST — place of supply, CGST/SGST vs IGST, HSN, and the **1 Aug 2026 Ship-to-GSTIN mandate** as a config date | `packages/platform/src/tax/gst.ts` + `migrations/0020` |
| "every statutory number is config, never a constant" | `GstConfig` (mandate date, checksum enforcement) + `qms_sampling_plan.plan_table` (sampling bands as data) |
| the SHARED master-dedup brain (one brain, every module) | `packages/platform/src/masterdata/dedup.ts` + `@Global` `apps/api/src/ai/dedup-explainer.ts` |
| §1.1 cross-module access via shared **ports**, never module→module imports | `apps/api/src/ports/*` (`WorkflowExecutor`, `StockPoster`, `BomProvider`, `InspectionGate`); `@Global` Workflow + Inventory + Engineering + Quality |
| §3.3 append-only, hash-chained audit, **no disable switch** | `apps/api/src/common/audit-log.service.ts` + `audit_log` in `migrations/0000` |
| §5.1 UUIDv7, tenant_id, created/updated/by, is_active, no hard DELETE | `packages/db/src/schema/columns.ts`, `migrations/0000` |
| §5.3 canonical error envelope · cursor pagination · Idempotency-Key | `packages/platform/src/errors`, `.../api/pagination.ts`, `apps/api/src/common/idempotency.ts` |
| §5.4 versioned events via transactional outbox **+ the relay that ships them** | `packages/platform/src/events/*`, `apps/api/src/bus/*` (relay + consumer) |
| §5.5 ledger-critical writes synchronous in one tx (SELECT … FOR UPDATE on the contended row) | `apps/api/src/modules/inventory/inventory.service.ts` (balance locked, no negative stock) |
| §5.6 the **single write path to stock** — nothing else writes stock | `apps/api/src/modules/inventory/stock.controller.ts` (`POST /api/v1/stock/entries`) |
| §7 canonical demo universe | `migrations/0001` (Trishul, Kaveri) + `0003` (users/roles) + `0012` (CP-50 + BOM) |

## The platform foundation (done, verified)

- **Multi-tenancy** — pooled **shared-schema + FORCE RLS**. The app connects as a
  non-owner `app_user` (`NOBYPASSRLS`); every transaction opens with `SET LOCAL` to
  bind the tenant, so RLS fences every read and write. UUIDv7 PKs; composite indexes
  lead with `tenant_id`.
- **Hash-chained audit** — an append-only, per-tenant `audit_log` whose chain is
  serialised by a transaction-scoped advisory lock. `app_user` has no UPDATE/DELETE
  privilege on it: tamper-evident by construction, with no disable switch (§3.3).
- **Transactional outbox + the relay ("mailman")** — domain write, audit entry, and
  outbox event all commit in **one** transaction (§5.5). The worker
  (`apps/api/src/bus/*` + `worker.ts`) drains `outbox_event` per tenant under RLS
  (`FOR UPDATE SKIP LOCKED`), delivers to Valkey/BullMQ keyed by event id, and an
  idempotent consumer records each event once in the `event_consumption` ledger — so
  at-least-once delivery + an idempotent consumer = **exactly-once effect**.
- **Idempotency-Key** replay store, canonical error envelope, and cursor-only
  pagination — all enforced, all reused by every module.
- **Module boundaries** are enforced in CI by `eslint-plugin-boundaries` from sprint 1;
  cross-module reuse goes through the platform floor or the event bus, never a
  module→module import or a cross-module FK.

## Identity / RBAC (done)

Auth is **real Keycloak 26 OIDC**. The tenant is derived only from a
JWKS-signature-verified access token's **group** (a group per tenant) — never a trusted
header (§1.5, guards against CVE-2025-29927). In-app RBAC (`role` / `role_permission` /
`user_role`) is enforced by a global `PermissionGuard`; routes opt in with
`@RequirePermission(...)`, unguarded routes pass. The production upgrade is Keycloak
**Organizations** → tenant registry, same guard logic.

## W1 approval workflow engine (done)

Behind a **`WorkflowExecutor`** port (§1.3): versioned templates, role/user approver
resolution, SLA timers, and a hash-chained append-only action trail. Kept to a hard
feature budget — it is an approval engine, not a general BPM.

## The shared AI spine — the "nervous system" every module's brain plugs into

The AI layer is a **`@Global` module** (`apps/api/src/ai/`) so any module can inject the
router without importing it. Governing principle: **"AI explains, never decides"** —
draft-for-approval, evidence-grounded, human-in-control.

- **One doorway** — `AiRouterService.complete(req)` is the single entry every AI call
  passes through. It does exactly four things, in order: (1) **reject** any `feature_key`
  not in the closed registry; (2) **ask governance** before spending a token; (3)
  **route** to the configured provider; (4) **log** the call — refusals included.
- **Provider-agnostic** — `AI_PROVIDER` selects the backend as **config, not code**:
  `stub` (default) is the offline deterministic responder — zero model spend, used by CI;
  `ollama` is the **EDGE tier**, a real model running on the plant's own machine (no API
  key, no per-call cost, no data leaving the site). A hosted CLOUD-tier adapter slots in
  the same way. No business module changes either way.
- **Closed 8-feature registry** (`packages/platform/src/ai/feature-registry.ts`) — the
  MVP portfolio is fixed at 8 features (the AI research cut ~32 to reach it). A call for
  a key not in the table, or for a non-routable status, is a hard reject at runtime
  (FR-AIO-001). Only `general.master_dedup` (AI #2) is `committed` and wired so far.
- **Governance** (`db.governance.ts`, `migrations/0008`) — checked **before every call**,
  fail-closed and ordered: tenant **DPDP opt-out** → **kill switch** (per-feature or the
  tenant-wide `*`) → **daily token budget**. Each admin action (kill/release, opt-out,
  set budget) requires a typed reason and appends a hash-chained audit row. Exposed via
  `GET/POST /api/v1/ai/governance/*`, gated behind `ai.governance.manage`.
- **Hash-chained `ai_action_log`** — every call (and every refusal) is recorded with a
  content hash; no raw PII is stored.
- **Golden-set eval gate** (§4.1) — a feature must **beat its deterministic baseline** on
  the headline metric (F1) *and* regress no must-pass assertion, or it does not ship. Run
  it with `pnpm --filter @ind-core/api eval <feature_key>`; the CLI exits **0 on PASS,
  1 on FAIL**, so CI blocks promotion.
- **Grounding gate** (`ai:grounding`) — the eval gate grades the *detector*; this one
  grades the *explanation*. See below.

### Verdict in code, wording in the model

A local 3B model was measured on `general.master_dedup` before being wired in
(`_scratch/ai-capability-test*.ps1`). Given the raw records it **fabricated a GSTIN match
between two different GSTINs**; given a worked example it **copied the example's conclusion**
and recommended merging two clearly different vendors. A small model cannot be relied on to
execute the conditional *"if the identifier differs, say different"* — and better prompting
made it worse, not better. So the integration is shaped accordingly:

- `decideDuplicateVerdict()` (`packages/platform/src/masterdata/dedup-verdict.ts`) settles
  the **conclusion and the recommended action in pure code** from the deterministic
  evidence. This is the literal implementation of §4.3 *"AI explains, never decides"* — the
  model cannot flip a conclusion it never owns.
- The model is handed the settled verdict and writes **only the reason sentence**.
- `checkGrounding()` then rejects that sentence if it invents an identifier or a number
  (however short), re-reads a similarity percentage as a difference, contradicts the verdict
  (including hedged claims like *"likely the same entity"*), leaks internal tokens, or is
  truncated mid-name.
- **Any** rejection, timeout, or unreachable model falls back to the deterministic sentence
  and flags `degraded` — the human always gets a correct note, and the ERP never blocks on
  a model.

Run it with `pnpm --filter @ind-core/api ai:grounding` (honours `AI_PROVIDER`); exits
non-zero on any violation. Measured: **0 violations** on both the stub and the live local
model; with the live 3B model 2–3 of 5 explanations are refused by the guards and degrade
to the deterministic wording. That degradation rate is the honest quality ceiling of a 3B
model — a larger model clears the guards more often; the safety behaviour is identical.

## Module 01 — GENERAL (done)

Company master (`company` + `gst_registration`) with the **`general.master_dedup`** brain
(AI #2, `committed`). At create-time the brain runs a deterministic detector (exact
GSTIN/CIN plus pg_trgm name similarity) and, on a suspected duplicate, the AI **explains**
the finding with cited evidence — it does **not** create the record. The endpoint returns
**`409` `duplicate_suspected`** carrying the matched rows + the explanation; the caller
either picks the existing record or re-submits with `acknowledgeDuplicates=true` to
override. The write path itself (domain write + hash-chained audit + outbox event) is the
reference implementation every module repeats, all atomic in one tenant-fenced tx.

Its **golden-set gate PASSES**: the fuzzy detector scores **F1 = 1.000** against the
exact-id baseline's **0.444** (12 labelled cases mixing exact-id dups, name-variant dups,
and clearly-distinct records) — and the "an exact-id duplicate must never be missed"
must-pass assertion holds.

## Module 02 — ENGINEERING (done)

- **Item master** (`item`) — the parts catalogue (raw material / component / sub-assembly
  / finished good / consumable), with UOM, HSN, standard cost, and purchasable /
  manufacturable / sellable flags.
- **Bill of Materials** (`bom` header + `bom_line`) — **versioned**, intra-module FKs only.
  Create validates that the produced item and every component exist (via RLS-scoped
  lookups) and **rejects a self-reference** (`BOM_SELF_REFERENCE`); multi-level cycle
  detection is explicitly deferred to Production planning.
- **Reuses the SHARED dedup brain** for item duplicate detection — the pure detector was
  lifted into `packages/platform/src/masterdata/dedup.ts` and a `@Global` `DedupExplainer`
  in the AI spine, so items get the same 409/acknowledge flow as companies, with
  per-domain field labels (`item code`, `name`). No module→module reuse (§1.1) — the
  brain lives on the platform floor.

## Module 03 — INVENTORY (done)

Warehouses, an append-only **stock ledger**, and **the single write path to stock**
(§5.6): `POST /api/v1/stock/entries` is the only writer of stock — Production and every
other module post here, nothing touches the stock tables directly.

- **Ledger-critical posting** (§5.5) — one synchronous transaction per entry. For every
  movement it INSERTs-and-locks the `stock_balance` row **`FOR UPDATE`**, refuses to let
  stock go negative (`409 INSUFFICIENT_STOCK`), updates the balance, and appends an
  **immutable** `stock_ledger` row. Then audit + a **side-effect-only** `stock.posted`
  event — the ledger write itself never rides the bus.
- **Entry types** — `receipt` (in), `issue` (out), `transfer` (move between warehouses,
  two ledger rows), and `adjustment` (signed, reason-code required). Plus on-hand
  balances (`GET /inventory/stock`) and the warehouse list.
- **Cross-module by logical id** — `item_id` is a bare uuid (no FK, §1.1); `warehouse_id`
  is an intra-module FK. Tenant isolation holds: another tenant's admin posting into a
  Trishul warehouse gets `404` (RLS hides it).

## Module 04 — PURCHASE (done)

Procurement — and the first place modules compose. It reuses the shared dedup brain, the
W1 engine, and Inventory's write path, all through app-level **ports** (no module→module
imports, §1.1).

- **Vendor master** — reuses the shared `general.master_dedup` brain (a vendor maps onto
  `{ name, GSTIN, code }`): same `409` draft-for-approval duplicate flow as companies and
  items, with per-domain field labels.
- **Purchase orders** (`purchase_order` + `_line`) — a draft PO is **submitted into the
  W1 engine** (`po_approval`: stores → admin) via the `WorkflowExecutor` port. Approve /
  reject delegate to W1, which **enforces the correct approver per step**; the PO status
  is synced from the workflow outcome (approved only when the final step signs off).
- **Goods receipts** (`grn` + `grn_line`) — receiving against an approved PO **posts
  stock through Inventory's `StockPoster` port in the SAME transaction**, so the GRN doc,
  the PO line received-qty updates, the PO status recompute, and the stock ledger write
  all commit **atomically**. No over-receipt; a rejected receipt writes no stock.

## Module 05 — PRODUCTION (done)

The make cycle — and it closes the manufacturing spine (**buy → stock → make**),
composing three modules through ports with no module→module imports.

- **Explode a BOM** — a production order reads the item's BOM via the `BomProvider` port
  (ENGINEERING) and snapshots the component requirements: `required = componentQty /
  bomOutput × qtyToProduce × (1 + scrap%)`. The snapshot pins the BOM, so later edits
  don't disturb a running order.
- **Consume components** — issuing consumes all components from the source warehouse in
  ONE atomic stock issue through Inventory's `StockPoster` port; if any component is
  short, the whole issue is refused (`INSUFFICIENT_STOCK`) and nothing is written.
- **Produce finished goods** — completing receives the finished good into the FG
  warehouse (again through the port). Production never writes stock itself (§5.6); it is
  gated OFF until Inventory hits its stock-accuracy target (the SPAR ↔ KILN contract).
- **The quality gate** — completing now asks Quality through the `InspectionGate` port and
  refuses while an inspection is open (`INSPECTION_PENDING`) or was rejected
  (`INSPECTION_REJECTED`). See Module 06.

## Module 06 — INSPECTION / QMS (done)

The quality system of record. Its hardest design problem is a boundary, not a feature:
**the gate belongs to the module that owns the transaction; the definition and the record
belong to Quality** (INSPECTION §1.2). So Production still decides whether its order may
complete — it just asks through the `INSPECTION_GATE` port instead of owning an inspection
table. Wiring is opt-in by construction: `state: 'none'` (nobody requested an inspection)
lets the transaction through exactly as before.

- **Defensible sampling** — how many pieces to check comes from an ISO 2859-1-style
  lot-size band table held as **configuration**, not code, so a tenant can load a
  customer-mandated plan without a release. The derivation is stored in words on the
  inspection: *"lot 40 falls in band 26-50 (code D) → sample 8, accept ≤0, reject ≥1"*.
  An OEM auditor asking "what sampling standard do you apply?" gets an answer with
  arithmetic behind it.
- **Readings snapshot their spec** — each measurement stores the limits that applied at the
  time, so revising a spec tomorrow can never retroactively flip a historical verdict.
- **The verdict is arithmetic** — a piece failing two characteristics is *one* defective
  piece; and a **critical** characteristic out of spec rejects the lot regardless of the
  accept number (an AQL is not a licence to ship a critical defect).
- **Dispositions move stock through Inventory, never around it** (§1.4) — a reject posts a
  transfer via `StockPoster` inside the same transaction and records the entry id it gets
  back. `status='executed'` without one is **unrepresentable**: a CHECK constraint refuses
  the row, so a disposition can never claim to have segregated material that never moved.
- **No AI, deliberately** — the closed 8-feature registry (§4.2) has no quality feature, and
  an unregistered `feature_key` is a hard reject at the router. Quality's intelligence is
  arithmetic, which is the point: every number can be re-derived by hand.

## Module 07 — SMBD / Sales & dispatch (done)

The sell side, and the module where India actually shows up in the arithmetic. Reconciled
to the locked baseline: the blueprint was authored on PG16/FastAPI with BIGINT identities
and a separate `smbd.` schema — its **domain** decisions are kept, its **infrastructure**
ones replaced by UUIDv7 + shared schema + FORCE RLS + `NUMERIC(18,2)` (§5.1).

- **Place of supply, done properly** — the destination state decides the tax: same state ⇒
  CGST + SGST at half the rate each; different state ⇒ IGST at the full rate. This is why
  the two-GSTIN demo tenant exists: selling the *same* pump to the *same* Coimbatore
  customer is **IGST from Pune** and **CGST+SGST from Coimbatore**. Both are proven in the
  verification run.
- **The 1 Aug 2026 Ship-to-GSTIN mandate** (§3.4, ranked risk #1) — captured at **order**
  time, not invoice time, because that is the last moment a human can still ask the
  customer for it. Unregistered consignees record the IRP literal `URP` on *both* sides of
  the date, so nothing needs backfilling. The effective date is **config**, never a branch.
- **A document can never be both** intra- and inter-state: `chk_gst_exclusive` plus a
  second CHECK tying the flag to the totals. The line-level split is **stored**, so an
  invoice reproduces the tax agreed on the order date rather than today's rate table.
- **Credit gate** — confirming compares the order against the customer's limit and this
  module's own open exposure; over the limit parks the order in `credit_hold`, which
  **cannot ship**. An override needs a separate permission, a reason, and it is audited —
  and all three inputs are snapshotted so the decision stays reviewable after the numbers
  move.
- **Dispatch actually moves goods** — through Inventory's `StockPoster` port in the same
  transaction, refusing over-dispatch and short stock. `status='dispatched'` without a
  stock-entry reference is refused by a CHECK constraint.

> **Honest note on GSTIN check digits.** The canonical §7 demo GSTINs are well-formed but
> carry **invalid** check digits — they are fictional. So checksum *rejection* is a config
> flag (off for the demo tenant, on in production) while the checksum itself is always
> computed. A test records this deliberately, so nobody later "fixes" the checksum and
> breaks the entire demo universe.

### Demo universe (§7)

Primary tenant **Trishul Precision Components Pvt Ltd** (one company, two GSTINs:
Pune-Chakan + Coimbatore); secondary tenant **Kaveri ElectroFab** (seeded for RLS
leak-probe demos). Demo users (realm `indcore`, password `demo`): **poongodi** → Trishul
*stores_incharge* (read-only), **venkat** → Trishul *admin* (read+create),
**kaveri-admin** → Kaveri *admin*. Plus a **Centrifugal Pump CP-50**, its components
(casing, impeller, shaft, seal, bolts), the pump's BOM, and five Trishul warehouses
(accepted / quarantine / WIP / finished / scrap). `poongodi` (stores) can post stock.

## Run it

Prerequisites: **Docker** (PG17 / Valkey / Keycloak / Gotenberg) and **pnpm 9**.

```bash
corepack enable && corepack prepare pnpm@9 --activate   # or: npm i -g pnpm@9
cp .env.example .env

pnpm install
pnpm infra:up          # start the containers
pnpm db:migrate        # apply 0000 … 0021 (as the schema owner)
pnpm db:rls-check      # §1.6 gate: fails if any tenant-scoped table lacks FORCE RLS
pnpm test              # unit tests + the two-tenant leak probe (needs infra up)
pnpm dev               # NestJS API on http://localhost:3000/api/v1

# In a SECOND shell — the worker process (the outbox "mailman" + a demo consumer).
# It drains outbox_event -> Valkey/BullMQ per tenant (never bypassing RLS); the
# consumer records each event once (idempotent), so redeliveries are no-ops.
pnpm --filter @ind-core/api worker

# The AI ship-gates (exit 0 PASS / 1 FAIL).
pnpm --filter @ind-core/api eval general.master_dedup    # grades the DETECTOR (F1)
pnpm --filter @ind-core/api ai:grounding                 # grades the EXPLANATION
```

**Optional — run the EDGE-tier local model.** Everything above works with no model at all.
To let a real model on this machine write the explanations (no API key, no cost, nothing
leaves the box):

```bash
ollama pull qwen2.5:3b            # ~2 GB; runs on a 4 GB GPU
export AI_PROVIDER=ollama         # PowerShell: $env:AI_PROVIDER='ollama'
pnpm --filter @ind-core/api ai:grounding    # same gate, now against the live model
```

If Ollama is not running, every call simply degrades to the deterministic answer and the
gate still passes — the model is an enhancement, never a dependency.

Exercise a module. Auth is real Keycloak OIDC — get a token, then call with `Bearer`
(the tenant comes from the verified token's group, never a header):

```bash
# a token for a Trishul user (group 'trishul' -> Trishul tenant)
TOKEN=$(curl -s -X POST http://localhost:8080/realms/indcore/protocol/openid-connect/token \
  -d grant_type=password -d client_id=indcore-api -d username=venkat -d password=demo \
  | grep -o '"access_token":"[^"]*"' | sed 's/.*:"//;s/"$//')

# GENERAL — a name that collides with the seeded Trishul company returns 409 with evidence.
curl -s -X POST localhost:3000/api/v1/general/companies \
  -H "authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" -H "content-type: application/json" \
  -d '{"legalName":"Trishul Precision Components Private Limited"}'

# ENGINEERING — list the seeded item catalogue (CP-50 + components).
curl -s "localhost:3000/api/v1/engineering/items" -H "authorization: Bearer $TOKEN"

# INVENTORY — receive 1000 bolts into the Pune accepted store (the single stock write path),
# then read on-hand. (item/warehouse ids come from the seed; see migrations 0012/0013.)
curl -s -X POST localhost:3000/api/v1/stock/entries \
  -H "authorization: Bearer $TOKEN" -H "Idempotency-Key: $(uuidgen)" -H "content-type: application/json" \
  -d '{"entryType":"receipt","lines":[{"itemId":"0192a8c0-0012-7000-8000-000000000006","toWarehouseId":"0192a8c0-0013-7000-8000-000000000001","qty":1000}]}'
curl -s "localhost:3000/api/v1/inventory/stock" -H "authorization: Bearer $TOKEN"
```

`poongodi` (stores_incharge) can read the catalogues and **post stock**, but is read-only
on masters → `403` on a company/item create. No token / bad signature → `401`;
authenticated-but-unpermitted → `403`.

**CI aggregate:** `pnpm ci` (lint → typecheck → test). Boundary + RLS gates are wired
from sprint 1, exactly as §1.1/§1.6 require.

## Honest caveats (read before running)

- **Docker is required** and was not installed on the authoring machine, so the db/API
  paths were written against the pinned images but not executed there. Expect to run the
  steps above once Docker + pnpm are present.
- **Windows/WSL:** run the `curl`/API steps **inside WSL** — Windows cannot reach the
  container ports on `localhost`.
- **Node:** the baseline is **22 LTS**; `engines` allows `>=22 <25`. Pin to 22 for parity
  before shipping.
- **API build (ESM + SWC):** NestJS + native ESM + SWC decorator-metadata is
  version-sensitive; the most likely first-`pnpm build` tweak. Fallback is the stock
  CJS+tsc Nest builder.
- **The default AI provider is the offline stub.** A real **local** model (EDGE tier) is
  wired and gated — set `AI_PROVIDER=ollama` to use it. No **hosted** provider is wired
  yet; adding one is the same config change, gated by the same governance + eval machinery.
- **A 3B local model degrades often (by design).** 2–3 of 5 explanations are refused by the
  grounding guards and fall back to deterministic wording. That is the guards working, not
  a fault — the output is always correct, occasionally less fluent.

## Next increments (in order)

1. ~~Platform foundation (RLS, outbox + relay, hash-chained audit, event bus).~~ ✅
2. ~~Identity/RBAC (Keycloak OIDC + in-app permission engine) & W1 approval engine.~~ ✅
3. ~~The shared **AI spine** — router, closed 8-feature registry, governance,
   hash-chained action log, golden-set eval gate.~~ ✅
4. ~~**Module 01 GENERAL** — company master + the `master_dedup` brain (gate PASSES).~~ ✅
5. ~~**Module 02 ENGINEERING** — item master + versioned BOM, reusing the shared dedup
   brain.~~ ✅
6. ~~**Module 03 INVENTORY** — stock ledger + the single stock write path
   (`POST /api/stock/entries`, the only writer of stock), ledger-critical & race-safe.~~ ✅
7. ~~**Module 04 PURCHASE** — vendors + POs (approved through W1) + GRNs (posting stock
   through Inventory), composed via app-level ports.~~ ✅
8. ~~**Module 05 PRODUCTION** — consume components + produce finished goods through
   Inventory's write path; closes the buy → stock → make spine.~~ ✅
9. ~~Wire a **real AI model** behind the router — the **EDGE tier**: a local model via
   Ollama, with the verdict decided in code and a grounding gate over the wording.~~ ✅
10. ~~**Module 06 INSPECTION/QMS** — sampling, inspections, dispositions, and the
    `InspectionGate` port Production honours before releasing finished goods.~~ ✅
11. ~~**Module 07 SMBD** — customers, sales orders with GST place-of-supply and the
    1 Aug 2026 ship-to mandate, credit gate, dispatch through Inventory's write path;
    closes buy → make → inspect → sell.~~ ✅
12. A **frontend** (Next.js 15 / React 19 + shadcn/ui) against `/api/v1`.
13. **ACCOUNTS** — the invoice off a dispatched sales order (SMBD already stores every
    field the IRP payload needs), receivables, and the credit exposure SMBD currently
    computes locally becoming a port.
14. The **CLOUD / HYBRID tiers** — a hosted adapter behind the same router, with the
    existing `tier` field routing routine work to the local model and hard work to the
    cloud. Governed, budgeted and eval-gated exactly as the local provider is.
15. Upgrade auth: Keycloak **Organizations** → tenant (replacing the group stand-in);
    auth-code flow for the SPA; retire the demo password grant.
16. **Per-module DB roles.** Today the whole app connects as one `app_user`, so the
    blueprint's "Quality has no INSERT grant on Inventory's tables" is enforced
    architecturally (boundary lint + the `StockPoster` port + the disposition CHECK
    constraint) but *not* by a database grant. Splitting the role per module would make it
    structural.
