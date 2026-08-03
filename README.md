# XELOR Manufacturing Intelligence — MVP Prototype 1

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

## Documentation

The ordered project documentation starts at [docs/README.md](docs/README.md):

- `00-project/` — technology and architecture;
- `01-agent-os/` — the three implemented Agent OS phases, in order; and
- `02-investor-demo/` — the presenter walkthrough and honest capability-gap register; and
- `03-agent-guides/` — the master Agent System guide and seven detailed agent handbooks.

Repository discovery files remain at the root because tools expect them there:
`README.md` for project entry and `CLAUDE.md` for environment notes.

> **Scope now:** platform foundation + Identity/RBAC + W1 approval engine + the shared
> AI spine + **Module 01 GENERAL** (company master with a duplicate-detection brain) +
> **Module 02 ENGINEERING** (item master + Bill of Materials, reusing the shared dedup
> brain) + **Module 03 INVENTORY** (the stock ledger + the single stock write path) +
> **Module 04 PURCHASE** (vendors, POs approved through W1, GRNs posting stock through
> Inventory) + **Module 05 PRODUCTION** (the make cycle — consume components, produce
> finished goods) + **Module 06 INSPECTION/QMS** (sampling, inspections, dispositions, and
> the quality gate Production now honours) + **Module 07 SMBD** (customers, sales orders
> with real GST place-of-supply, credit gate, dispatch) + **Module 08 ACCOUNTS** (the
> append-only general ledger, the AR subledger, receipts) + **Module 09 HRM &
> ATTENDANCE** (punch → attendance → **deemed wages (s.2(y))** → payroll → payslip → GL) +
> **Module 10 MAINTENANCE/CMMS** (asset register → request → MWO → an overlap-free
> **downtime clock** → PM schedules → reliability KPIs) + **Module 11 CSP / Customer
> Service Portal** (the first internet-facing surface: a **second scoping dimension** —
> tenant *and* customer account — a business-time SLA clock, triage that is suggested and
> never forced, reply drafting that cannot promise anything, and warranty as a computed
> gate) + **Module 12 EXPENDITURE** (budgetary control as a **reservation ledger** that counts
> committed money and not just spent money, input tax credit through the s.17(5) and
> company-GSTIN gates, TDS with a threshold crossing the system refuses to decide, and
> receipt extraction whose every figure is re-derived) + **Module 13 PLANNING / MRP** (what
> to make, what to buy and by when: low-level codes derived from the bill of materials,
> demand as `max(forecast, orders)`, level-by-level netting with scrap and safety stock,
> lead times offset over a working-day calendar, and an exception worklist that proposes
> and never acts). The order-to-cash spine
> (buy → stock → make → inspect → sell → **book it**) is in place, so is the people-and-pay
> spine that feeds it, so is the asset-uptime layer that decides whether the machines are
> there tomorrow, the customer can see their own side of it, every rupee going out is
> checked against a budget before it is committed rather than after it is spent — and the
> system now tells the plant *what to buy and what to make*, which is the question the
> other twelve modules were all waiting on.

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
│  │     ├─ accounting/journal.ts   # pure LEDGER brain: double-entry · reversal · trial balance
│  │     ├─ people/                 # pure PAYROLL brains: s.2(y) deemed wages · EPF/ESI/PT/TDS · attendance
│  │     ├─ maintenance/            # pure CMMS brains: MTBF/MTTR/availability · PM drift + meter forecast
│  │     │                          #   · criticality×severity SLA · completion gate · narrative grounding
│  │     ├─ csp/                    # pure SERVICE-DESK brains: business-time SLA clock · ticket lifecycle
│  │     │                          #   · triage classifier (AI #3) · reply gate (AI #6) · entitlement
│  │     ├─ spend/                  # pure SPEND brains: the reservation ledger · s.17(5) ITC gates
│  │     │                          #   · TDS thresholds + the crossing · receipt cross-checks (AI #1)
│  │     │                          #   · duplicate tiers (AI #4) · per-diem + advance settlement
│  │     ├─ planning/                # pure MRP brains: low-level codes + cycle detection · lot rules
│  │     │                          #   · forecast consumption · MPS + discrete ATP · the netting engine
│  │     │                          #   · exceptions · capacity load · EDD/SPT/CR dispatch · reorder points
│  │     ├─ time/                    # shared date arithmetic: ISO weeks · IST offset · working-day walks
│  │     └─ ai/                     # router types · CLOSED 8-feature registry · eval gate
│  │        ├─ types.ts             #   AiProvider / AiCompletionRequest contracts
│  │        ├─ feature-registry.ts  #   the closed set of 8 (unknown key → hard reject)
│  │        └─ eval.ts              #   pure golden-set scoring + PASS/FAIL gate (§4.1)
│  └─ db/                           # @ind-core/db — Drizzle schema + RLS + migrations
│     ├─ src/schema/{platform,general,admin,workflow,engineering,inventory,purchase,production,…,csp}.ts
│     ├─ src/{client,migrate,rls-check,naming-check}.ts   # naming-check gates the MWO/WO boundary
│     ├─ src/rls/leak-probe.test.ts # two-tenant leak probe (§1.6)
│     └─ migrations/0000 … 0035.sql # see "Schema surface" below
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
         │  ├─ dedup-explainer.ts   #   the dedup brain's surface (verdict in code, wording in model)
         │  ├─ ticket-triage.ts     #   AI #3 — suggested never forced; degrades to a HIDDEN chip
         │  ├─ reply-drafter.ts     #   AI #6 — drafts only; the gate refuses promises and verdicts
         │  └─ receipt-extractor.ts #   AI #1 — the flagship; every figure re-derived, nothing posts
         └─ modules/
            ├─ general/             # Module 01 — company master + master_dedup brain
            ├─ engineering/         # Module 02 — item master + Bill of Materials
            ├─ inventory/           # Module 03 — stock ledger + the single stock write path (@Global port)
            ├─ purchase/            # Module 04 — vendors + POs (W1 approval) + GRNs (post stock)
            ├─ production/          # Module 05 — the make cycle (consume components, produce FG)
            ├─ quality/             # Module 06 — inspections, sampling, dispositions (@Global gate port)
            ├─ sales/               # Module 07 — customers, sales orders + GST, credit gate, dispatch
            ├─ accounts/            # Module 08 — append-only GL, AR subledger, receipts (@Global ledger port)
            ├─ hrm/                 # Module 09 — attendance, leave, deemed wages, payroll → GL
            ├─ maintenance/         # Module 10 — assets, MWOs, the downtime clock, PM, reliability KPIs
            ├─ csp/                 # Module 11 — tickets, the business-time SLA clock, complaints,
            │                       #   entitlement, spares, KB, CSAT; TWO route prefixes, disjoint guards
            ├─ expenditure/         # Module 12 — the budget reservation ledger, claims, advances,
            │                       #   indirect spend with GST/TDS, and the posting handoff to Accounts
            ├─ planning/            # Module 13 — MRP: what to make, what to buy, by when. The widest READ
            │                       #   surface in the system (6 ports), the narrowest write surface (a plan)
            └─ workflow/            # W1 approval engine (@Global WorkflowExecutor port)
```

### Schema surface (migrations 0000 → 0035)

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
| 0022 | `accounts` | `gl_account`, `acc_period` (the close), `journal_voucher` + `journal_line` under the **three-layer append-only guard**, `ar_open_item` (GENERATED `outstanding`), `settlement` + allocations |
| 0023 | `seed_accounts` | a Schedule III-shaped chart of accounts (separate GST head per direction, so a return is a *query*) + FY 2026-27 periods with April–June closed and July open |
| 0024 | `hrm` | the **platform-global, append-only statutory rate book** (`stat_wage_definition`, `stat_epf_config`, `stat_esi_config`, `stat_pt_slab`, `stat_tds_config` + slabs, `stat_gratuity_config`, `stat_ot_config` — UPDATE/DELETE revoked *and* trigger-blocked) + 19 tenant-scoped tables: `employee` (encrypted PII columns), `pii_access_log`, `shift`, `shift_roster`, append-only `biometric_punch`, `attendance_day` (lock-guarded), `regularisation_request`, leave, salary structures, `payroll_run` (**`ck_payrollrun_sod`**), `payslip` (**the s.2(y) identity as CHECK constraints**), `payslip_line`, `statutory_contribution` |
| 0025 | `seed_hrm` | the rate book itself — s.2(y) 50% threshold (eff. 21-Nov-2025), EPF ceiling ₹15,000 (re-notified 29-May-2026), ESI ₹21,000, Maharashtra PT (with the February ₹300), Tamil Nadu half-yearly PT, FY 2026-27 new-regime slabs + §87A, gratuity 15/26 with the **dual vesting horizon** — each row carrying a `source_note`; plus the §20 shifts, leave types, salary structure and ten employees, and the payroll GL accounts |
| 0026 | `maintenance` | 23 tables and the module's four structural guarantees: `asset_downtime` with a **btree_gist EXCLUDE** so one asset can never hold two overlapping intervals, `mwo_labour` with the same over `(employee, interval)` so a fitter cannot be in two places, GENERATED `duration_minutes` / `hours` / `cost_total`, and `UNIQUE (tenant, schedule, occurrence_seq)` so PM generation is idempotent. Plus `ck_statutory_fixed` (a statutory examination cannot float), `ck_spare_issued_has_entry` (issued is impossible without Inventory's stock-entry ref), an append-only `asset_meter_reading` with a trigger asserting `current_value` stays a projection of it, and an append-only `criticality_sla_matrix` |
| 0027 | `seed_maintenance` | the Trishul asset register (23 assets over two plants, four levels, criticality with a written justification), 11 meters with real readings behind them, the §4.C criticality × severity SLA matrix, labour rates by trade, an ISO 14224-shaped failure taxonomy (12 modes / 12 causes / 6 detections / 5 actions), 9 PM schedules including the **Factories Act s.29 twelve-monthly crane examination**, two AMC coverage mirrors, seven MRO spare items, the `mwo_closure_approval` W1 ladder, and the `mnt.*` permission set — with `mnt.downtime.adjust` and `mnt.mwo.prioritise` deliberately granted separately |
| 0028 | `csp` | the only internet-facing schema, and **six** guarantees made in the database: (1) every portal-reachable table carries `customer_account_id` and a **RESTRICTIVE** `customer_account_isolation` policy *in addition to* tenant isolation — Postgres ANDs restrictive policies with permissive ones, so a portal session sees rows that are both this tenant's **and** this customer's; (2) that policy carries **`WITH CHECK` as well as `USING`** (the blueprint's DDL shows only `USING`, which fences reads while leaving a portal principal able to *write* a row stamped with somebody else's account); (3) children reference the ticket by the **composite key `(id, customer_account_id)`**, so a comment cannot claim a different customer from its ticket; (4) a **btree_gist EXCLUDE** on `csp_ticket_pause` makes a ticket paused twice over the same minute unrepresentable — doubly-subtracted minutes are how an SLA report quietly becomes fiction; (5) `csp_ticket_event` and `csp_abuse_event` are append-only at the grant *and* at a trigger; (6) a **sent reply is frozen** by trigger. Plus a GENERATED `search_tsv` on `csp_kb_article` with a restrictive policy that shows a portal session published public articles and nothing else, and a provisioned `vector(384)` + HNSW index so the fast-follow RAG is a backfill rather than a migration on a live table |
| 0029 | `seed_csp` | the service desk: the **Mon–Sat 09:00–18:00 IST** calendar (a nine-hour day, six days — assuming Mon–Fri 9-to-5 would have promised every customer an extra day on every resolution clock) with three real holidays; three teams; the eight-category taxonomy whose `code` the SLA policies and the AI baseline both key on; **six SLA policies across all three precedence bands** — priority, category (a DPDP rights request has a statutory clock and does **not** pause) and contract (the AMC's own 240-minute commitment, which outranks the tenant's "urgent"); the `TKT/CMP/SPR-2627` counters; four portal users including one left `invited` so "invited but not consented" is a real state; eight warranties and two AMCs — one comprehensive, one **non-comprehensive** so the entitlement engine has something to answer `partial` about; and five KB articles, the fifth **internal** and deliberately stuffed with the vocabulary a customer would search for, so a broken visibility policy fails loudly |
| 0030 | `expenditure` | budgetary control and the spend that is not a purchase order, with **seven** guarantees in the database: (1) `budget_consumption` is **append-only** at the grant and at a trigger — availability is `budget − actual − committed − in_approval` read from it under a row lock, and a rejection is a signed negative row rather than an edit; (2) **UNIQUE (tenant, idempotency_key)** on that ledger, so a retried submit collides instead of doubling a commitment; (3) a CHECK over an **immutable function** asserts a budget line's twelve monthly cells sum to its annual figure (a subquery is not permitted in a CHECK, and this guarantee was worth a function rather than a trigger that fires after the fact); (4) `net_reimbursable` is **GENERATED and cannot go negative** — when an advance exceeds the claim the difference is a refund receivable, not a payroll deduction nobody agreed to; (5) `tds_config`, `per_diem_rate` and `fx_rate` are effective-dated and **append-only**, so a July deduction is still reproducible in a 2029 assessment; (6) **UNIQUE idempotency key on `posting_instruction`** — Expenditure writes one instruction per document version and Accounts posts it; (7) `tds_config_ref` is required whenever `tds_amount` is non-zero, so no deduction exists without the dated row that produced it. Plus `ck_meter_forward` (a utility meter does not run backwards), `ck_line_itc_block` (a blocked line cannot carry a credit) and a deliberately **non-unique** `exp_attachment.sha256`, because a duplicate must be detected and flagged with both documents named rather than refused at upload |
| 0031 | `seed_expenditure` | 17 expense heads carrying the s.17(5) position that decides whether GST is recoverable (meals, motor vehicles, staff welfare blocked; electricity `exempt`; freight `rcm`) plus the `category_keywords` that are AI #1's deterministic baseline; the **TDS rate book** with the pre- and post-Finance-Act-2025 rows for 194C/194J/194I/194Q, the older ones *closed* rather than edited, each carrying a `source_note`; the grade × city-tier per-diem matrix; FY 26-27 budgets for five cost centres over 18 lines — MRO spares and tooling **stop**, travel **warn**, rent **ignore** — every distribution verified by the database on insert; and three recurring templates, none auto-posting |
| 0032 | `planning` | MRP's own tables, with **seven** guarantees in the database: (1) a **completed run is immutable** — `mrp_run_bucket`, `mrp_run_item` and `planned_order_peg` are trigger-blocked and their grants revoked, because the per-bucket working IS the answer to "why did we buy fifty castings in July?" and that question is asked in November; (2) **UNIQUE (tenant, run, order_key)** — one planned order per item per bucket, so a retried run cannot double-plan; (3) a planned order can be **converted exactly once** (a partial unique index on the conversion reference plus a CHECK that `converted` implies one), because converting twice builds the same pump twice and nothing downstream notices until the stock does not move; (4) an item **cannot be MRP-planned AND carry a reorder point** — the single commonest silent source of excess inventory, refused rather than reported; (5) utilisation and efficiency are **fractions in (0,1]** — zero makes every load percentage infinite, above one invents hours the plant does not have; (6) a frozen MPS bucket cannot change without `override_by` **and** `override_reason` together; (7) the demand fence cannot sit **outside** the planning fence. Plus `ck_plannedorder_clamp` — a release date may be moved forward to today but never back-dated behind what the lead time asked for, because the disagreement between the two IS the module reporting that the date cannot be met |
| 0033 | `sales_delivery_date` | a **requested delivery date on the sales-order line** — a structural addition to SMBD's table, made because without it "demand from confirmed sales orders" is fiction: MRP's entire output is dates walked backwards from the day the customer expects delivery. Deliberately **nullable**, because an order taken with no promised date is a real thing; PLANNING places that demand in the current bucket and raises a `data_warning` rather than inventing a date nobody agreed to. A trigger refuses a delivery date earlier than the order date (a CHECK cannot reach the header) |
| 0034 | `seed_planning` | the §7 demo universe **deepened from two BOM levels to three** — a two-level bill cannot demonstrate the thing MRP exists to do. Adds the casting blanks under the impeller and the casing, and puts the blueprint's scrap percentages on the assembly (2% impeller, 5% casting) so the gross-up step is visible. Then the planning world: a Mon–Sat calendar with Independence Day and Gandhi Jayanti; five work centres, the bottleneck VMC running two shifts for **73.44 available hours** against 96 nominal; five routings; eight planning policies carrying the blueprint's §20.3 lot rules and lead times **in working days** (1 wk = 6, 2 wk = 12, 3 wk = 18); the flat 20-a-week forecast; and the MPS grid with its ATP row |
| 0035 | `append_only_names_its_table` | the shared append-only guard **names the table it is actually guarding**. Four tables use one trigger function that hard-coded `audit_log` into its message, so deleting from `stock_ledger` reported *"audit_log is append-only (MCA Rule 11(g))"* — pointing at the wrong table and at a compliance rule with nothing to do with stock. Found while building PLANNING. The statutory citation is kept where it belongs; nothing about what is refused changed |

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
| §1.1 cross-module access via shared **ports**, never module→module imports | `apps/api/src/ports/*` (`WorkflowExecutor`, `StockPoster`, `BomProvider`, `InspectionGate`, `AccountsPoster`); `@Global` Workflow + Inventory + Engineering + Quality + Accounts |
| ledger-critical writes are **append-only**, guarded at trigger *and* grant level | `stock_ledger` (`migrations/0013`) and `journal_voucher`/`journal_line` (`migrations/0022`) |
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
  (FR-AIO-001). Two are wired: `general.master_dedup` (AI #2, `committed`, Tier-2) and
  `hrm.payslip_explainer` (AI #7, `stretch`, **Tier-3 advisory-only-forever**). INSPECTION
  ships **zero AI** for the same reason — no key of its own exists in the closed set.
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

The same shape was applied to `hrm.payslip_explainer` (Module 09), with two rules the
dedup gate does not need: an explanation may not **advise** the employee, and it may not
**judge** whether the pay is correct. "You appear to have been underpaid" is not a bad
sentence; it is a legal event.

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

## Module 08 — ACCOUNTS (done)

The general ledger, the AR subledger, and the credit exposure every other module asks
about. Its governing rule (ACCOUNTS §1.3) is a boundary, not a feature:

> **Never re-post what a sibling already valued.** If SMBD says the invoice is ₹1,47,500,
> the ledger says ₹1,47,500.

Accounts checks exactly four things and nothing else: the journal **balances**, the period
is **open**, every account **exists and is postable**, and the instruction is **not a
duplicate**. It never second-guesses a sibling's arithmetic — and it *cannot*, because the
dependency arrow points one way: modules depend on Accounts, Accounts reads no sibling's
tables. That keeps the module graph acyclic and makes the rule structural.

- **The journal is append-only, guarded in three independent layers** (§9.4), the same
  discipline Inventory applies to `stock_ledger`:
  **(a)** a DEFERRED constraint trigger asserts debits = credits and ≥ 2 lines *at COMMIT*,
  so a voucher can be assembled line by line but can never commit lopsided;
  **(b)** BEFORE UPDATE/DELETE triggers — a posted voucher's date, amount or account can
  never change; **(c)** the GRANT is revoked, so even a code bug cannot get past it.
  All three are tested **independently** — the grant test runs as `app_user`, the trigger
  test as the schema owner (who bypasses grants entirely).
- **Correction is a reversal, never an edit** — the reversal is the same lines with the
  sides swapped, so the pair nets to zero and *both* stay visible forever.
- **Dispatch raises the invoice in the same transaction** — goods leaving, the stock
  ledger and the receivable commit together or not at all. One invoice per dispatch,
  forever: a retried dispatch returns the original, it does not double-bill.
- **The credit gate got real teeth.** SMBD's exposure now = the **unpaid AR** Accounts owns
  + SMBD's own confirmed-but-unshipped commitments. Before this module, it summed only the
  second half and so understated every customer who already owed money.
- **Receipts settle oldest-first**, and `outstanding` is a GENERATED column — it cannot
  drift from the figures it derives from.

## Module 09 — HRM & ATTENDANCE (done)

The people-and-pay backbone, fixed as **one auditable pipeline**:

> **punch → attendance day → payable days / OT → DEEMED WAGES → payroll → payslip → GL**

This blueprint carries the largest compliance delta of any module, because since
**21 Nov 2025** all four Labour Codes are in force and the Code on Wages **s.2(y)** changed
the wage base payroll computes on. Every SMB spreadsheet — and most legacy payroll tools —
still computes PF on Basic + DA. That is systematic underpayment from day one, with
interest and damages under EPF §14B and a gratuity shortfall waiting at exit.

**The s.2(y) deemed-wages engine is the centre of the module.** When excluded components
(HRA, OT, conveyance, special allowance…) exceed 50% of total remuneration, the *excess* is
added back to "wages". Sanjay Patil's June payslip is the case that makes it visible:

| | ₹ |
|---|---|
| Basic 9,750 + HRA 3,900 + Special 5,850 + **OT (8h at 2×) 1,500** | **21,000** |
| Included wages (Basic) | 9,750 |
| Excluded components — **53.57%** of total | 11,250 |
| 50% of total remuneration | 10,500 |
| **Add-back (the excess only)** | **750** |
| **Deemed wages — the PF and gratuity base** | **10,500** |
| EPF employee 12% × 10,500 | **1,260** *(a Basic+DA engine says 1,170)* |

The overtime is what tips it over — and OT is an *excluded* component, so paying it
triggers the very add-back the employer wasn't computing.

- **Statutory rates are data, never code.** Not one rate, slab, ceiling or threshold is a
  literal anywhere in `src/`. The `stat_*` tables are platform-global and effective-dated,
  resolved **as-of the payroll period**, and each `statutory_contribution` row stores the
  `config_ref` of the exact row that produced it. A rate change is an INSERT with a new
  `effective_from` — and **UPDATE/DELETE are revoked and trigger-blocked**, so a rate can be
  superseded but never edited. A June-2026 payslip recomputes against June-2026's rates
  forever.
- **The published golden vectors are executable.** The six hand-computed payslips in
  HRM §20.4/§20.5 are the test suite (`TC-GOLD-*`), and the end-to-end run asserts four of
  them against a live database to the rupee: Sanjay's add-back, Kavita's exact-50% boundary
  and §87A rebate, Imran's ceiling cap under LOP proration, Priya's slab walk.
- **The s.2(y) identity is a CHECK constraint.** `deemed = included + addback` and
  `excluded = total − included` are asserted by the *database* on every payslip row, so a
  wrong PF base cannot be persisted even by a code path that has not been written yet.
  The arithmetic itself runs in **integer paise**, because rounding each step in floating
  point makes an exact 50/50 split at an odd paise total disagree with itself by a paisa —
  and the boundary is precisely where it matters.
- **Attendance is a pure function, so a disputed day is re-derived, not argued about.**
  Punches in, roster + holiday + leave in, one row out — replayable in any order, any number
  of times. A **C-shift out-punch at 06:10 the next morning belongs to the previous
  attendance date** (the case a `WHERE punch_time::date = att_date` query loses every
  night), and the pairing window is bounded by the neighbouring rostered shifts so
  back-to-back nights don't steal each other's punches.
- **A single punch is never auto-Present.** It becomes Pending-Regularisation, the month
  **cannot be locked** while one remains, and approving a regularisation **appends a
  corrective punch and replays the day** — it never edits what the device recorded. The raw
  punch store is append-only at the grant *and* at a trigger.
- **Segregation of duties, defended three times.** The preparer's role does not carry
  `hrm.payroll.approve` at all; the service refuses an approver equal to the preparer; and
  `ck_payrollrun_sod` refuses it in the database, even for a direct SQL statement.
- **PII is encrypted, masked, and revealed only under audit.** PAN / Aadhaar / bank use
  AES-256-GCM with the **tenant and field bound in as additional authenticated data** — a
  ciphertext lifted into another tenant's row simply will not decrypt. Aadhaar is checked
  against its Verhoeff checksum *before* encryption. Every unmask writes a `pii_access_log`
  row with the reason typed, on a table where UPDATE/DELETE are revoked. Legal basis is
  DPDP **s.7 legitimate use** — no consent theatre — and the wording stays "DPDP-**ready**".
- **Payroll posts through the ACCOUNTS port, same as everyone else.** Salary cost by nature,
  employer contributions as expense, net pay and each statute as separate payables — one
  synchronous transaction, and the ledger refuses a **closed period** (June's salaries post
  on the July pay date, which is what actually happens). A replayed `post-journal` returns
  the *original* voucher.
- **`hrm.payslip_explainer` (AI #7, registered Tier-3 advisory-only).** The registered
  deterministic baseline is a complete explanation on its own; a model may only re-word it,
  and the grounding gate rejects any figure not already on the payslip — plus, uniquely for
  this feature, any **advice** ("you should contact HR") and any **claim of error** ("you
  appear to have been underpaid"). Those are not bad sentences; they are legal events.

**Verified end-to-end against PG17** (`_scratch/run30.sh`): 506 simulated punches through
the `BiometricDevicePort` fake adapter (duplicates, a missing out-punch, direction-less
turnstile reads, a late arrival, a no-show); 300 employee-days processed and re-processed to
the identical result; a regularisation replayed; the month locked and further processing
skipped; ten payslips computed twice to an identical `inputs_hash`; the four golden payslips
matching; a balanced ₹7,96,622.93 payroll journal; and every guard — grant, trigger, CHECK —
refusing independently.

## Module 10 — MAINTENANCE / CMMS (done)

The asset-uptime layer. Where Production asks *"did we make the part?"*, Maintenance asks
**"will the machine be there tomorrow?"** — and it answers with transactions instead of
memory:

> **request → triage → MWO → execute (labour + spares + checklist) → close with a failure
> code → downtime and cost land on the asset → the KPIs and the next PM fall out of the data**

**Read the naming rule first.** "Work order" is overloaded in this suite, so the two are
kept structurally apart: PRODUCTION owns `production_order` (item + BOM + quantity, `WO-`
series, `prod.*` permissions); MAINTENANCE owns **`maintenance_work_order`** (asset +
failure + downtime, `MWO-` series, `mnt.*` permissions). No FK between them, ever. The only
shared vocabulary is the *machine*, and that is a logical `work_center_ref`. This is checked
on every migration by `pnpm --filter @ind-core/db naming-check`, which fails CI on a bare
`work_order` table, an `mwo_*` column on a production table, or a foreign key crossing the
two — the "convenient" FK somebody adds in month four.

### The four things the database refuses, so the code doesn't have to be trusted

- **A machine cannot be down twice.** A `btree_gist` EXCLUDE over
  `(tenant, asset, tstzrange(started_at, coalesce(ended_at,'infinity')))` makes an
  overlapping interval *unrepresentable*. Two operators reporting the same stop produce one
  clock and a structured `DOWNTIME_OVERLAP` naming the interval that won, so the UI can
  offer "join the existing job". Postgres is the arbiter — the service only translates.
  The range's upper bound is exclusive, so a stop ending at `13:02:04` and the next
  starting at exactly `13:02:04` is legal while `13:02:03` is not; that one second is the
  difference between a correct clock and a plausible one.
- **A technician cannot be in two places.** The same mechanism over
  `(tenant, employee_ref, labour interval)`, across *all* work orders — without it a
  double-tap silently doubles labour cost.
- **Duration and totals are GENERATED**, never hand-maintained, so they cannot drift from
  the endpoints and amounts they come from.
- **PM generation is idempotent.** `UNIQUE (tenant, schedule, occurrence_seq)` — a retry, a
  redeploy, a manual re-run and two workers racing all produce exactly one occurrence. And
  a **statutory** schedule cannot be set to floating drift at all (`ck_statutory_fixed`):
  the Factories Act's twelve-monthly examination stays on the calendar.

### The behaviours that make the data worth having

- **The clock starts before triage, not after.** A `severity=stopped` request opens the
  downtime interval in the same transaction as the request. Measuring from the moment
  maintenance *noticed* would measure the wrong thing. If triage disagrees, the interval is
  **corrected with a reason** — never deleted, because deleting it erases the fact that
  somebody believed the line was down.
- **Handback is its own action, before completion.** Real technicians give the machine back
  and write their notes afterwards. Closing the clock when the paperwork is done would
  overstate every downtime figure in the plant by however long the paperwork takes.
- **Only one hold reason stops the clock.** `awaiting_production_window` — the machine is
  back with production while the job stays open. Downtime measures the *asset*, not the
  work order. Every other reason keeps it running, and the API says which in plain English.
- **The completion gate reports every unmet condition at once** — the exact task with its
  instruction, the exact missing field, the open interval with a hint — so the UI renders a
  checklist with jump links rather than one refusal at a time.
- **Drift is a stored, visible decision.** `fixed` anchors the next service to the
  *scheduled* date (a job done 21 days late is still due 01-Sep); `floating` anchors it to
  *actual completion* (22-Sep). A schedule dormant for a year wakes with **one** occurrence
  and a trail of honest `missed` rows, never twelve work orders.
- **A stale meter forecasts nothing.** No observed reading in 60 days suppresses the
  projection and raises a flag rather than inventing a date — and the projection is anchored
  at the **last reading**, not at today, so an unread meter goes overdue instead of
  appearing to be a constant seven days from its service, for ever.
- **Spares are Inventory's stock, and it shows.** There is no stock table, no bin, no
  on-hand column and no valuation function anywhere in `modules/maintenance`. An issue is a
  synchronous call through `STOCK_POSTER`; the stock-entry id and the amount **Inventory**
  valued it at are mirrored read-only, and `issue_status = 'issued'` is impossible without
  that reference (a CHECK constraint, not a promise). A refusal surfaces Inventory's own
  code and message **verbatim**.
- **Two levers are made noisy by design.** Downtime correction and priority override are
  separately granted permissions, both demand a reason, and the correction retains the
  original endpoints in-row and re-emits the event with `corrected: true` so Production's
  OEE *recomputes* instead of quietly diverging. They are the two changes that could
  flatter every reliability KPI at once.
- **Every KPI is one implementation with its formula attached.** MTBF, MTTR, availability,
  PM compliance and schedule adherence are computed in one pure function and nowhere else;
  the response carries the formula, the input row ids and an `inputs_digest` proving a
  recompute reproduces it. A zero-failure window returns **NULL**, not 0 and not infinity.
  A plant with no shift calendar returns NULL availability and says *"Needs shift calendar"*
  rather than assuming 24×7 for exactly the customers who configured nothing.

### The golden fixture, matched to the decimal

VMC-01, July 2026, two shifts × 8 h × 26 days = **416.0 scheduled hours**; three unplanned
production-impacting stops of 3.5 h, 3.5 h and 1.5 h (**one crossing midnight**), plus a
4.0 h planned PM window that is reported but excluded:

| | computed | blueprint §16.3 |
|---|---|---|
| unplanned downtime | 8.5 h | 8.5 h |
| operating hours | 407.5 h | 407.5 h |
| **MTBF** | **135.833 h** | 135.833 h ✅ |
| **MTTR** | **2.833 h** | 2.833 h ✅ |
| **Availability** | **97.9567 %** | 97.9567 % ✅ |

…and the identity the dashboard prints out loud holds: `407.5 / 416 = 97.9567 %`. The
function *throws* if those two expressions ever disagree, because an availability tile that
contradicts the downtime tile is the argument that ends a CMMS rollout.

**The 14-Jul story arc closes at ₹6,480 exactly** — labour ₹1,804 (3.2 h × ₹420 + 1.0 h ×
₹460, both at the **as-of** rate, so a raise dated October cannot restate a July job) plus
spares ₹4,676 valued by Inventory. Below the ₹25,000 band, so no approval; above it, closure
routes through W1 and `close` refuses while the workflow is pending.

**Verified end-to-end against PG17** (`_scratch/run31.sh`): the full arc from a 20-second
shop-floor request to a closed, coded work order; a second operator's report joining the
same clock; the completion gate refusing with four named conditions; handback closing the
interval at 210 minutes; PM generation across nine schedules and re-run idempotently; the
s.29 crane examination dated 09-Aug; the reliability fixture matching; a two-tenant leak
probe returning 23 / 3 / 0 / 0; and fourteen database guards — EXCLUDE, CHECK, trigger and
grant — each refusing independently with no application code running.

## Module 11 — CSP / Customer Service Portal (done)

The first module a **customer** touches. Everything else in this suite is reached by an
employee, through a VPN, with a staff-realm token; this one is reached from the public
internet by somebody who does not work here — and nearly every structural decision in it
follows from that single difference.

> **raise → auto-triage (suggested) → SLA clock → agent works it → complaint to Quality →
> entitlement decides who pays → resolve → the customer closes it → CSAT**

One record, **two faces**. There is no customer-facing copy of a ticket: the customer and
the agent read the same row, and the difference between what they see is a projection, not
a second table that can drift. An internal note is a comment with `visibility = 'internal'`;
an unsent AI reply is a comment with `author_type = 'ai_draft'`. Neither is ever selected
into the portal view, and neither needs a copy kept in step.

### The second scoping dimension

Tenant isolation answers *"is this Trishul's row?"*. It cannot answer *"is this
**BlueOrbit's** row?"*, and on an internet-facing surface that is the question that matters.

So every portal-reachable table carries `customer_account_id` and a **RESTRICTIVE** policy
on it, in addition to the ordinary permissive tenant policy. Postgres evaluates
`(OR of permissive) AND (AND of restrictive)`, so the second policy can only ever narrow
what the first allowed:

```sql
CREATE POLICY customer_account_isolation ON csp_ticket AS RESTRICTIVE
  USING (NULLIF(current_setting('app.customer_account_id', true), '') IS NULL
         OR customer_account_id = NULLIF(current_setting('app.customer_account_id', true), '')::uuid)
  WITH CHECK (…same…);
```

Four things make it trustworthy rather than decorative:

- **The value is minted, never accepted.** It comes from the organization claim on a
  signature-verified portal-realm token. No header, query parameter or body field can set
  it, and the middleware refuses a portal token that carries no organization at all.
- **`withTenant` sets it to `''` explicitly on every transaction**, rather than leaving it
  unset for staff. A pooled connection still carrying the previous request's customer id
  would be precisely the leak this exists to prevent.
- **`WITH CHECK`, not only `USING`.** The blueprint's DDL shows only `USING`, which fences
  reads. Without the check half, a portal principal could *insert* a ticket stamped with
  another customer's account: the row would vanish from their own view — so nothing would
  look wrong — and appear in the victim's.
- **Children reference the ticket by `(id, customer_account_id)`.** A comment, attachment,
  event, pause, complaint or CSAT row whose account does not match its ticket's is refused
  by a foreign key. That closes the one route an application bug could have taken to leak a
  thread: mislabelling the child rather than the parent.

For staff the setting is empty, the restrictive policy is a no-op, and an agent sees every
customer in their tenant — which is exactly right.

The knowledge base has no customer account, so its second dimension is **publication**: a
portal session sees published, public articles and nothing else, by policy rather than by
`WHERE` clause. `KB-005` — the internal complaint→NCR SOP — is seeded deliberately full of
the vocabulary a customer would search for, so a broken policy fails loudly.

### Business time, or the SLA number is a fiction

"First response within 4 hours" promised at 22:40 on a Friday does not mean 02:40 on
Saturday. Depending on the calendar it means Saturday 09:30, or Tuesday if Monday is a
holiday. Getting this wrong does not produce a slightly-off number; it produces a breach
notification at 9 p.m. and an argument with a customer who was never promised what the
software thinks it promised.

So there is exactly one implementation of business time, it is pure, and it is the only
thing allowed to add minutes to a clock. Four properties, each verified end to end:

- **A calendar is data** — working weekdays, a daily window, a holiday list. Trishul's desk
  runs **Mon–Sat 09:00–18:00 IST**: a nine-hour day, six days a week. Nothing assumes
  Mon–Fri 9-to-5, and assuming an eight-hour day would have promised every customer an
  extra day on every resolution clock.
- **A request raised before the desk opens starts its clock at opening.** The oil-leak
  ticket is raised at 06:20 and its first response is due at **13:00** — 09:00 plus four
  business hours — not at 10:20.
- **Elapsed time is re-derived from stored pause intervals, never accumulated.** A counter
  is cheaper and is wrong the first time a pause is back-dated or a job runs twice — and by
  then the number has been on a report. A disputed verdict is recomputed, not argued about.
- **Escalating does not hand back a fresh clock.** Raised 09:00 as medium (due 18:00),
  escalated to urgent at 12:00: three business hours are already spent, so it is due at
  **13:00**, not 16:00. Recomputing from *now* is the classic way an SLA report quietly
  becomes fiction, and it would have recorded a "met" response that took seven hours.

Time the *customer* held the ticket can never breach the agent's clock: `pending_customer`
pauses it, the customer's reply resumes it and returns the ticket to `in_progress`, and a
`btree_gist` EXCLUDE constraint makes two overlapping pauses on one ticket unrepresentable —
doubly-subtracted minutes would make a ticket look less consumed than it was.

Escalation tiers fire **exactly once** per ticket: the fired markers live on the row, so a
scanner running every minute for an hour sends one notification rather than sixty. And a
response clock that has already been answered does not escalate — chasing a response that
has happened is how people learn to mute the ladder.

### Warranty as a gate, not a gift

Claims get honoured on goodwill without anyone checking the serial, the purchase date or
the contract terms, and the result is a drain Finance cannot accrue for. So coverage is a
**computed verdict with reasons**, cached on the ticket with the moment it was reached
(a CHECK constraint refuses one without the other — a verdict without a timestamp cannot be
told apart from one reached a year ago against cover that has since expired).

- The claim is judged on the **date of failure, not on today**. A failure inside the cover
  period stays covered even if reported three weeks later; defaulting to `now` would quietly
  deny every late-reported claim, which is a commercial decision nobody made.
- A comprehensive AMC **outranks** the standard warranty — it is what the customer paid
  extra for, and reporting the cheaper cover would understate what they bought.
- A non-comprehensive AMC returns **`partial`**: visit and labour covered, parts chargeable.
  "Covered" and "not covered" would both be false.
- **Anomalies never silently flip a verdict.** A claim dated before dispatch, or two live
  warranties on one serial, are flagged for a human and the coverage answer stands on its
  own merits. A data-entry error is not fraud, and the software is not entitled to treat it
  as one. (Warranty-fraud scoring stays deferred for the same reason.)

The AMC renewal lead goes to SMBD **once**, not nightly for two months — `AMC-2627-0002` is
T-42 on 20-Jul-2026, flips to `expiring`, emits one `csp.amc.expiring.v1`, and the second
scan emits nothing.

### The two AI features, and what they are not allowed to do

CSP owns two of the closed registry's eight, and they have the strictest guards in the
codebase — because a support reply is a statement a company makes to its customer.

**AI #3 `csp.ticket_triage`** — committed, Tier-1 advisory, baseline `keyword_rule_classifier`,
degraded mode `feature_hidden`.

- **Suggested, never forced.** The output is written to `ai_triage` and *nothing else moves*.
  Category, priority and therefore the SLA policy change only when a human accepts — and the
  acceptance, the edits and the dismissals are recorded, because **override rate** is the
  metric that reveals drift before a customer does.
- **Closed enums, always.** A model returning `"URGENT!!! (customer says line down)"` is
  rejected outright rather than string-matched into compliance. The moment free text is
  tolerated in a field the UI renders, the ticket body has a route into the interface.
- **PII never leaves.** Emails, Indian mobile numbers, GSTINs, PANs and long identifiers are
  replaced with type tokens before the payload is built, and a hard assertion refuses to
  route if anything personal survived the scrub.
- **Honest confidence.** Below 0.6 the chip renders collapsed. A confident wrong answer costs
  more than no answer.
- **Degrading hides the feature.** `feature_hidden` is implemented literally: governance
  refusal or an invalid reply returns *no suggestion*, and the agent triages an ordinary
  ticket. A missing chip costs seconds; a confident wrong one costs trust in every future
  suggestion.

A ticket body attempting to steer the classifier is logged to `csp_abuse_event` and then
ignored. Worth being exact about the claim: the keyword baseline has no instruction-following
in it, but it will match the word "urgent" wherever that word appears — including inside the
attack. That costs nothing, because the output is a closed enum and **nothing is applied**.

**AI #6 `csp.reply_draft`** — stretch, Tier-2 draft-record, baseline
`canned_response_template`, degraded mode `feature_hidden`. The blueprint names the lesson
this is built around: assistive drafting is where the evidence is good, autonomy is where it
broke publicly. So **a draft is never sent** — structurally, not carefully. It is stored with
`author_type = 'ai_draft'`, a value the customer-visibility rule excludes and a CHECK
constraint forbids from ever carrying a `sent_at`. It becomes a message when a human presses
send, and that act rewrites the author, stamps the sender, and a trigger **freezes the text**:
a reply the customer has read and may be relying on cannot be edited into something else.

The gate refuses a draft that:

| refusal | example it catches |
|---|---|
| `made_a_commitment` | "We will replace the seal free of charge and dispatch it tomorrow." |
| `decided_liability` | "This is a manufacturing defect on our side." |
| `leaked_internal_context` | "NCR-2627-0044 has been raised for this batch." |
| `claimed_coverage_without_an_entitlement_check` | "This part is covered under warranty." |
| `ungrounded_number:42` | "We have shipped 6 units; the balance 42 will follow." |
| `broke_persona` | "As an AI language model I cannot confirm coverage." |

The context handed to the drafter is built from **public comments only**, so an internal note
cannot reach a drafting prompt — the difference between a model that might leak one and a
model that has never seen one.

### The eval gate, and why it does not score 1.000

`pnpm --filter @ind-core/api eval csp.ticket_triage` runs a 27-case golden set scored on
**macro-F1** — the unweighted mean of the per-class F1s. Weighting by support would let a
classifier that is excellent on the two common categories and useless on the six rare ones
post a fine number; the rare ones are what a human would otherwise have to catch. A DPDP
rights request misfiled as "support" is a statutory clock nobody started, and there are few
of them — which is exactly why they must count as much as an oil leak.

```
baseline   macro-F1=0.032  accuracy=14.8%     ← believe the customer's own wizard selection
candidate  macro-F1=0.977  accuracy=96.3%     ← the shipped keyword rules
verdict    PASS ✓
```

Two notes on honesty. First, DECISIONS-V2 registers `keyword_rule_classifier` as this
feature's baseline — the thing a *model* must beat — and no model is bound in CI, so running
the model against itself would be a gate that cannot fail. This gate is therefore the tier
below: the shipped rules against the honest naive comparator, and it **publishes the bar** a
model must clear. When a model is bound, both slots move down one and the dataset does not
move.

Second, the set contains a **known miss, kept deliberately**: a performance failure written
entirely in domain terms — *"not building pressure, 30% below the rated curve"* — with no
defect vocabulary and no serial. The rules return `support` at 0.2 confidence and the chip
collapses. That is the honest failure mode, and it is precisely the ceiling a model exists to
raise. Adding "not building" to the keyword list would fix the number and fix nothing else.

Two must-pass assertions no macro-F1 can buy its way past: a data-protection request must
never be misfiled, and a stopped line must be suggested `urgent`.

### Two route prefixes, two trust zones, disjoint guards

`/api/v1/csp` takes a staff-realm token through the RBAC grid. `/api/v1/portal` takes a
portal-realm token and asserts the principal on entry. They are **not** two roles on one
route table: a permission bug on a staff route cannot expose a customer, because a portal
token cannot address a staff path at all, and a staff token — having no `customerAccountId` —
is refused on the portal path.

Out-of-scope is **404, not 403**. A ticket belonging to another customer must be
indistinguishable from one that does not exist; a 403 confirms the id was real, which is the
whole enumeration attack. RLS makes this the natural outcome rather than something to
remember: the row simply is not selectable.

### What the run proves

`_scratch/run32.sh` drives the whole module against live PG17 — **69 assertions, 0
failures** — through the service layer, not through fixtures:

the 06:20 ticket due at 13:00 and Saturday 17:30 + 60 business minutes landing Monday 09:30;
a medium→urgent escalation due at 13:00 rather than 16:00; a suggestion recorded and *not
applied*, then overridden field by field; a prompt-injection attempt logged and inert; five
entitlement verdicts including `partial` and a flagged pre-dispatch claim; the renewal lead
firing once and only once; a paused clock charging the desk 540 minutes instead of five days,
and the database refusing an overlapping pause; escalation tiers firing once across two
scans; a draft invisible to the customer, then sent by a human, then frozen against editing;
five refused draft sentences; a complaint reaching Quality in the same transaction as its own
row, refusing to close over an open CAPA and then closing on a recorded manager override; a
warranty-covered spare at no charge and a `partial` one quoted at ₹21,000; an agent forbidden
from closing their own resolved ticket; CSAT answerable exactly once with a follow-up on 2★; a
seven-day reopen window that refuses on day 47 *with a path forward* and yields to a manager;
a claim race producing one owner and one 409; a portal payload containing no internal note, no
NCR number, no agent and no AI suggestion; a customer unable to find the internal SOP the desk
finds; **both leak probes** — cross-tenant and cross-customer, read *and* write; a dashboard
reporting 30% compliance of 10 tickets with a verdict rather than 0% of a world where
everything is on fire; three append-only refusals; and a replayed submit returning the
original ticket.


## Module 12 — EXPENDITURE (done)

PURCHASE buys things that arrive in a warehouse. This module handles everything else a
factory actually spends money on — the engineer's hotel bill, the housekeeping AMC, the
electricity, the auditor's fee, the rent — and it is where three questions get decided that
nobody can answer from a journal: **is there budget, is the GST recoverable, and how much
must be withheld from the supplier.**

> **budget reserved → claim or invoice raised → approved → posting instruction to Accounts
> → acknowledged → the reservation becomes actual → paid**

### Availability is a ledger, not a report

The single idea the module turns on. A budget checked by summing posted journals answers
*"what have we spent?"* — which is the wrong question, because the money that will sink a
cost centre is already committed on approved documents and claims sitting in an approval
inbox. By the time it reaches the ledger the decision has been taken.

So availability is read from an append-only reservation ledger with three buckets:

```
available = budget(period) − actual − committed − in_approval
```

and one reservation's life is: **reserve** into `in_approval` on submit → **flip** to
`committed` on final approval → **flip** to `actual` when Accounts acknowledges → **reverse**
(a signed negative row) on rejection. Nothing is ever updated in place. Six months later the
ledger can still answer *"why was this allowed?"*, which is the only question anybody ever
asks of a budget.

Three properties make it hold:

- **`SELECT … FOR UPDATE` on the budget line before availability is read.** Without it, two
  people submitting ₹30,000 against ₹50,000 remaining both read "available" and both pass,
  and the cost centre is over with no single document responsible. With it, one waits, reads
  the other's reservation, and gets a refusal naming the shortfall. The verification proves
  exactly this.
- **The reservation and the document are the SAME transaction.** A crash between them rolls
  back both. Budget held against a document that does not exist is the failure nobody notices
  until a controller asks why a cost centre looks full.
- **`UNIQUE (tenant, idempotency_key)` on the ledger.** A submit that times out and is
  retried produces one reservation and one collision — never a silent double-commitment.

Three control actions, and the distinction between them is the point. **Stop** refuses with
the shortfall and the override path — MRO spares is `stop`, because an unbudgeted spares
spike is exactly what a controller wants to hear about *before* it happens. **Warn** allows
and says so loudly — travel is `warn`, because refusing a customer visit to protect a budget
line is usually the more expensive decision. **Ignore** allows silently — rent is `ignore`,
because the lease was signed last year and the system refusing to record it changes nothing
except the accounts.

A revision that cuts a line below what is already spent is **returned as a conflict**, not
refused: the money is gone and the budget must be allowed to record reality. What cannot
happen is the cut going through unseen — a CHECK constraint refuses a revision row carrying
conflicts without an acknowledger, and the consumption already booked is carried forward
onto the new version rather than the cost centre being handed its budget back.

### Input tax credit: two gates, and both must pass

Every rupee of GST on a purchase is either recoverable from the government or it is cost.
Getting it wrong in either direction is expensive and neither error announces itself:
over-claiming produces a demand with interest and penalty at the next audit, under-claiming
silently donates working capital.

1. **The expense head.** CGST Act **s.17(5)** blocks credit on named categories whatever the
   paperwork says — food and beverages, motor vehicles under thirteen seats and rent-a-cab,
   club and fitness membership, personal consumption. The staff lunch is blocked because it
   is a lunch, and a perfect company-GSTIN invoice does not change that.
2. **The invoice.** Credit requires a tax invoice carrying the **recipient's** GSTIN. A B2C
   cash bill showing GST is a bill on which no credit exists, because the supplier never
   reported it against the company. This is the rule employees refuse to believe, so the
   refusal says which gate failed and why.

The demo runs both on one trip: ₹758 recovered on the company-GSTIN hotel bill, ₹67 blocked
on the meal beside it. And **a model never sets eligibility** — receipt extraction may
suggest the head; `resolveItc` then decides the credit from the head and the invoice. The AI
reads paper; the code decides money.

CGST + SGST versus IGST is decided purely by the two-digit state code opening each GSTIN.
The money the company pays is identical either way; which government receives it is not, and
that is the commonest notice in Indian GST. The odd paisa on a half-split goes to SGST rather
than evaporating, because a register one paisa out is a register somebody has to explain.

### TDS, including the crossing the system refuses to decide

Under-deducting makes the company liable for the tax it failed to withhold, plus interest,
plus the disallowance of 30% of the expense itself under s.40(a)(ia). Over-deducting takes
money out of a small supplier's working capital that they spend months recovering.

Three things make it harder than a percentage, and all three are implemented:

- **Two thresholds.** A section fires on a single payment above one limit **or** on the
  running annual total above another. A vendor billing ₹9,000 a month never trips the single
  test and trips the annual one in the eleventh month — which is why the per-vendor ×
  section × year accumulator exists.
- **The rate depends on who the supplier is.** 194C is 1% for an individual or HUF and 2% for
  a company, so the same invoice from two vendors withholds different money. A vendor with no
  PAN is deducted at 20% under s.206AA, and the reason line says so.
- **TDS is withheld on the TAXABLE VALUE, never on the GST-inclusive total.** Withholding on
  the gross over-deducts on every single invoice, and it is a common enough error to be worth
  a test of its own.

**The crossing is genuinely ambiguous, and the module refuses to pretend otherwise.** When
the running total crosses the annual threshold mid-year, one reading of the Act says deduct
on this payment; another says the threshold was always going to be crossed, so catch up on
everything paid so far. **Both figures are computed, stored on the document, and a finance
review is raised.** The demo's freight bill takes Vega Logistics from ₹96,000 to ₹1,14,000:
₹180 prospective, ₹1,140 catch-up, and the note reads *"this is a tax position, and it
belongs to Finance."* Silently choosing either would be a software author taking a tax
position on somebody else's behalf.

Every rate and threshold is an **effective-dated, append-only row** carrying a `source_note`
— the same discipline as HRM's statutory rate book, because a July 2026 deduction must still
be reproducible in a 2029 assessment. A change is a new row; the pre-Finance-Act-2025 rows
are *closed*, not edited.

### Two blueprint figures that predate the Finance Act 2025

Stated in the seed and here rather than glossed over, because both change what the demo
does:

- **194J.** §20.8 deducts ₹4,500 on a single ₹45,000 professional-fee bill. The threshold was
  raised from ₹30,000 to ₹50,000 with effect from 01-Apr-2025, so a *first* ₹45,000 bill in
  FY 26-27 does not reach it. The prototype withholds nothing on the Q1 bill and ₹4,500 on
  the Q2 one, where it is actually due — and the demo shows the crossing, which is a better
  beat than an unexplained deduction.
- **194I.** §20.8 justifies the ₹10,000 rent deduction as *"annual > ₹2.4L"*. That was the
  pre-2025 test; from 01-Apr-2025 it is **₹50,000 per month**, which a ₹1,00,000 monthly rent
  crosses on the first bill. The blueprint's figure is right and its stated reason is out of
  date, so the seeded row carries the current rule and says exactly that.

### AI #1 — receipt extraction, the flagship

Committed, Tier-2 (draft-record), baseline `azure_doc_intelligence_prebuilt_invoice`,
degraded mode `manual_entry`. Point a phone at a hotel bill, get a claim line — and it is the
AI feature in this product with the largest blast radius, because its output is money.

The principle is `ai-verdict-in-code-wording-in-model` pushed one step further: **the model
reads paper and the code checks arithmetic.** A vision model is genuinely good at finding
"₹6,322" on a crumpled thermal print and genuinely willing to invent a total that makes the
numbers look tidy. So every figure is re-derived:

| cross-check | what it catches |
|---|---|
| GSTIN shape + state code vs place of supply | `Z4AAHFH…` — a plausible string and an unclaimable credit |
| CGST + SGST (or IGST) = rate × taxable value | a transcribed tax that does not match the rate |
| taxable + tax = total, ±₹1 for the supplier's rounding | the inclusive/exclusive confusion |
| line sum = total | **the hallucinated line** |

A failed total drags every figure it was derived from into review — reviewing the total alone
while the taxable value that produced it stays "confident" is not a review. Low confidence
sends a field to review even when the arithmetic is perfect. The demo's contrast seed is a
thermal-print taxi receipt reading ₹850 whose two lines sum to ₹730: caught, flagged, and
corrected by a human whose correction is recorded.

Four more properties:

- **Wholesale validation.** An unexpected field is fatal rather than dropped — a receipt image
  is untrusted input, and a model echoing text out of it is how a field called `approved`
  eventually appears.
- **The deterministic fallback wins on numbers** and the disagreement is shown as a pick-one
  diff, never merged silently.
- **Nothing posts.** The draft lives on the attachment. It becomes a claim line only through
  the confirm endpoint, tagged `source = 'ai_assisted'`, and a CHECK constraint refuses such
  a line without its confidence record.
- **The edit rate is published beside the acceptance rate.** A user who confirms a draft after
  correcting four of its seven fields has "accepted" it and has also done the work by hand.
  Acceptance rate alone flatters the feature; the field edit rate is the honest measure, and
  the dashboard returns them together so the headline cannot be quoted on its own.

### AI #4 — duplicate receipts, in three tiers

Stretch, Tier-1 advisory, baseline `attachment_sha256_exact`, degraded mode
`deterministic_substitute`. The tiers matter because they are the difference between a
control and an accusation:

- **Exact** — the same file, byte for byte, on two claims. A hash match is a fact, costs
  nothing, and ships whether or not any model does. Somebody claiming a receipt twice usually
  uploads the same file twice, because they photographed it once.
- **Near** — same merchant, same date, same amount, different bytes. Deterministic fuzzy
  matching catches most re-photographed bills without a model. Reported as *probable*, because
  two identical taxi fares on the same route on the same day are an ordinary Tuesday.
- **Pattern** — several receipts just under a threshold, same merchant, same evening. This is
  the finding most likely to be **wrong about a person**, so its severity is capped and its
  wording is careful: *"This is the shape of splitting to stay under a limit — and also the
  shape of 4 people splitting one bill. Worth asking; not worth assuming."*

**Nothing in the module ever rejects anything.** Every finding is a flag naming both
documents. And `exp_attachment.sha256` is deliberately an index rather than a unique
constraint: refusing the second upload would *hide* the second claim instead of surfacing it.

### The posting handoff

Expenditure never writes a general-ledger row. It writes a `posting_instruction` carrying a
journal-shaped payload, in the same transaction as the approval, and Accounts posts it — the
same discipline that gives Inventory one stock write path. The key is
`exp:{docType}:{id}:v{n}` and it is UNIQUE, so a relay that delivers twice, a worker that
restarts mid-batch and an operator who presses retry all produce one journal.

The acknowledgement — not the approval — is what flips the bucket from `committed` to
`actual`. **An approval is a decision; a posting is a fact**, and a budget that treats them as
the same thing reports money as spent that the ledger has never seen.

### The one hard refusal

Everything in this module flags and lets a human decide, with one exception: **a new advance
while an old one is unsettled past its settle-by date is blocked.** A claim with a missing
receipt is a conversation for an approver, who can see context the software cannot; cash
already handed out and not accounted for is the company's money sitting somewhere
unexplained. It is overridable with a recorded reason, and the default is no.

Settlement never produces a negative payout. When the advance exceeds the claim — the demo's
₹15,000 against ₹13,650 — the difference is a **refund receivable from the employee**, which
goes on the advance's ageing rather than becoming a payroll deduction nobody agreed to. The
advance stays *partially settled* until that refund lands.

Per-diem is resolved **as of the trip date**, and the exact effective-dated rate row is
stamped on the travel request. A rate revised in October must not restate a July trip, and an
employee promoted in September must be paid the grade they held when they travelled. Days are
counted inclusively, because they ate on all of them.

### What the database refuses

- The **reservation ledger** cannot be edited or deleted — trigger and grant.
- The **statutory rate books** (`tds_config`, `per_diem_rate`, `fx_rate`) accept only the
  closing of a row; a change is a new row with a new `effective_from`.
- A **budget line whose twelve cells do not sum to its annual figure** — enforced by a CHECK
  over an immutable function, because a budget that disagrees with itself is unreconcilable
  and the disagreement is invisible until year end.
- **`net_reimbursable` is GENERATED and cannot go negative**; `advance_adjusted` cannot exceed
  the claim; ITC cannot exceed the tax charged; a blocked line cannot carry a credit.
- **A deduction without the config row that produced it** — `tds_config_ref` is required
  whenever `tds_amount` is non-zero.
- **A second posting instruction for the same document version.**
- **A meter reading that runs backwards**, which would otherwise flow into the ₹/unit anomaly
  report as fact.
- **Deleting a claim, an advance or an invoice.**

### The eval gate, and what it honestly measures

The blueprint's ship gate is ≥50 labelled Indian receipts scored against Azure Document
Intelligence with zero uncaught arithmetic inconsistencies. Two thirds of that cannot run
here: there are no receipt *images* in the repository and no Azure subscription to compare
against, and asserting a field accuracy nobody measured would be worse than measuring
something smaller.

So the gate measures the part that is real — **auto-categorisation**, macro-F1 over thirteen
labelled Indian receipts — and asserts the part that matters more as must-pass conditions on
every case:

1. every receipt whose arithmetic does **not** reconcile must be caught (a miss is a wrong
   number reaching a claim);
2. every receipt whose arithmetic **does** reconcile must come back clean (a detector that
   flags everything catches every error and is switched off by Friday).

A single failure of either fails the gate outright, whatever the categorisation score.

### Demo universe (§7)

Primary tenant **Trishul Precision Components Pvt Ltd** (one company, two GSTINs:
Pune-Chakan + Coimbatore); secondary tenant **Kaveri ElectroFab** (seeded for RLS
leak-probe demos). Demo users (realm `indcore`, password `demo`): **poongodi** → Trishul
*stores_incharge* (read-only), **venkat** → Trishul *admin* (read+create),
**kaveri-admin** → Kaveri *admin*. Plus a **Centrifugal Pump CP-50**, its components
(casing, impeller, shaft, seal, bolts), the pump's BOM, and five Trishul warehouses
(accepted / quarantine / WIP / finished / scrap). `poongodi` (stores) can post stock.

## Module 13 — PLANNING / MRP (done)

Every other module in this system records something that **happened**. This one records something that has **not happened yet** — and that is the whole difficulty. A plan is an argument about the future, and the only way it stays trustworthy is if the argument is kept next to the conclusion.

Planning is also the module with the **widest read surface and the narrowest write surface** in the codebase. It reads demand from SMBD, stock from Inventory, the product structure from Engineering, and open supply from Purchase and Production — six `@Global` ports, no module→module imports — and it writes exactly one thing of its own: a plan.

### What it actually computes

**Low-level codes, derived from the whole BOM graph.** Every item is netted exactly once, at the deepest level it appears anywhere. An item planned too early is netted against demand that does not exist yet and the run **silently under-orders** — a failure with no error message and no symptom until the line stops. A cycle in the bill of materials is refused and the cycle is *named*: `PMP-CP50 → CMP-IMP6 → PMP-CP50` is a thirty-second fix, `circular BOM detected` is an afternoon bisecting a product structure by hand.

**Demand is `max(Forecast, Orders)`, never the sum.** Real orders *consume* the forecast that predicted them. Adding them plans the same pump twice and the plant builds inventory nobody asked for.

**The netting engine**, level by level: gross requirement (independent demand + what the parents released), net requirement (`gross − scheduled − projected available + safety stock`), a lot rule, and a lead-time offset walked over **working days**. A two-week foundry lead time is twelve working days, not fourteen; offsetting on calendar days silently promises the plant two days it does not have, once per order, forever.

**Two things the engine refuses to do:**

- **It never moves an existing commitment.** A released purchase order enters as a scheduled receipt at the date the buyer promised, and stays there. Where the plan disagrees, it raises a reschedule exception for a human — moving a supplier's commitment is a phone call, not a database write.
- **It never back-dates.** A release date already in the past is clamped to today and **flagged**, with the date the lead time actually wanted kept beside it. A planned order dated last Tuesday is a lie that makes the horizon look feasible.

**The exception worklist is the product.** A run over a real factory produces thousands of planned orders and almost none need a human. Severity comes from *consequence*, not category: the same lateness on a customer order outranks it on a forecast, because one of them breaks a promise to somebody expecting a delivery. Every row names something to **do**. Accepting one records the decision and does **not** perform it — an exception list that silently creates work orders is a plan that acts, and this system's whole position is that plans do not act.

**Capacity** is `machines × shift hours × utilisation × efficiency` — the two percentages are where honest plants and optimistic ones diverge. The demo's bottleneck has **73.44** available hours a week against 96 nominal, and a four-hour maintenance block costs **3.06** effective hours, not four.

**The schedule board** is a tier-1 heuristic (EDD / SPT / CR) and is labelled as one everywhere. It **never auto-publishes**: a draft becomes the shop's dispatch list only when a named person approves it, enforced by the database.

### The golden case reproduces exactly

`PLANNING §20.5` is a three-level MRP example worked by hand. It is the test. The blueprint dates its demo Monday 13 Jul 2026; `DECISIONS-V2 §7` is binding and fixes demo "today" at Monday **20 Jul 2026**, so the whole example is shifted forward exactly one week — every quantity unchanged, every bucket label one higher, and the past-due beat survives, which is the point of checking it.

Against live PostgreSQL, all three levels land on the blueprint's numbers:

| | W30 | W31 | W32 | W33 | W34 | W35 |
|---|---|---|---|---|---|---|
| **PMP-CP50** planned receipt | 0 | **16** | 20 | 25 | 20 | 20 |
| **CMP-IMP6** gross (2% scrap) | 17 | 21 | 26 | 21 | 21 | 0 |
| **CMP-IMP6** projected available | 13 | 10 | 10 | 10 | 10 | 10 |
| **CST-IMP6** net requirement | 0 | **22** | 0 | 18 | 0 | 0 |
| **CST-IMP6** planned receipt (MOQ 50) | 0 | **50** | 0 | 50 | 0 | 0 |

The impeller settles on exactly its 10 of safety stock — a floor the plan sits on, not a buffer it eats. The casting's shortfall of 22 becomes an order of 50, because a foundry will not pour 22. And the two-week lead time puts that order's release in **W29 — the week before today** — so it is clamped, flagged, and counted as **6 working days** late.

**Two findings while reproducing it:**

- The blueprint's §20.5 *prose* names SO-1042 at the top of the pegging chain. Its own tables do not support that — SO-1042's demand is absorbed by impeller stock and never creates a casting order. The tables are hand-verified and were followed; the prose sentence is an error in the source, and the test says so.
- The seeded **Independence Day holiday** legitimately changes the plan: six working days back from Mon 17 Aug crosses 15 Aug and lands a week earlier. The golden case therefore runs holiday-free, and a **second** section puts the holiday back and proves what it does. The totals differ by exactly one impeller — because when two requirements merge into one bucket the scrap gross-up rounds up *once* instead of twice. Rounding per parent, the obvious implementation, would have ordered that extra impeller every time two parents shared a week.

### Reconciled to the baseline

`PLANNING.md` is one of the six blueprints authored on FastAPI/PG16. Beyond the stack, four divergences were made deliberately:

- **The low-level code does not live on `item`.** The blueprint persists it to Engineering's table; a module may not add a column to another module's system of record (§1.1), so every planning attribute lives in `item_planning_policy`, keyed by a bare `item_id`. Engineering describes what a part *is*; Planning describes how it is *replenished*.
- **The run is synchronous.** The blueprint specifies a Celery job with SSE progress, which matters at ten thousand items; at pilot scale the whole run finishes in **~70 ms**, faster than the round trip that would poll it. The engine is a pure function, so moving it onto the BullMQ queue later changes one file.
- **No AI feature.** The registry is closed at eight and Planning has none. What ships is the **deterministic explainer** the blueprint itself specifies for MVP — the pegging chain and the per-bucket working, rendered in words, with no model call. Claiming an unregistered flagship would have meant cutting it later.
- **Sales orders gained a delivery date** (migration 0033) — without it, "demand from confirmed sales orders" is fiction.

### Verified

**48 assertions against live PostgreSQL 17**, exit 0: the three-level golden case, the holiday effect, forecast consumption, the undated-order warning, past-due clamping, the pegging chain climbing to a real sales order, the exception worklist and its refusals, capacity to two decimal places, an existing PO treated as fact, firm → convert → the double-conversion refusal, the requisition hand-off, the schedule board and its publish gate, the policy conflict guard, and seven things the database refuses outright. Plus **114 new platform tests** (507 total), the RLS gate at **158 tenant-scoped tables**, the naming gate at 168, a clean cross-tenant leak probe, and zero typecheck or boundary-lint errors.

## Module 14 — ADMINISTRATION (done)

The control plane. Keycloak already authenticated, `role`/`role_permission`/`user_role` already decided, and `audit_log` already chained — those landed in the platform bootstrap. This module is everything that turns those primitives into something an auditor, a regulator or a plant manager can actually work with.

### Three questions, not one

A permission answers *may this person read work orders?* It does not answer **which ones**, or **how much of each**. Skipping either turns a shop-floor operator into somebody who can read every plant's costs — with a perfectly correct permission grid on the screen.

- **Row scope.** Absence of a scope row means **no access**, never all access. That default is the whole thing: making "unconfigured" and "unrestricted" the same state is how a scoping model leaks. Unrestricted row access exists, but only as an explicit role flag that shows up in any role listing.
- **Field masks**, applied on the way *out*, to whole rows, before they become JSON. A hidden field is **removed** — a blanked key still tells you the field exists, and hiding it in the UI leaves it in the payload. Where two roles disagree, the **most restrictive wins**; otherwise the way to see a masked salary is to collect roles until one of them forgets to mask it.
- **"Explain access"** is the *same function the guard uses*, run uncached. A simulator answering from a second code path eventually tells an administrator the access is fine while the guard denies it.

Every denial names the roles the user actually holds and the roles that *would* grant it. Every grant reports which roles a permission arrives through — usually more than one, which is the number an access review gets wrong.

### Segregation of duties, and exactly one thing that blocks

The classics are seeded — raise-and-approve a PO, create-a-vendor-and-pay-it, prepare-and-approve payroll. Only **`prevent`**-level rules refuse a grant. Blocking every classic conflict in a plant whose entire office is four people stops the plant, and a control that stops the plant is switched off in week two, after which nothing is controlled at all. The rest are granted and **recorded**, and accepting one as a known risk requires a name and a reason — the database enforces both, because "accepted risk" with nobody's name on it is how a control becomes a checkbox.

The demo tenant ships with a **real critical conflict on a real person**. A control plane whose every light is green demonstrates nothing.

### AI #8 — the model may only choose the words

`admin.sod_explain` is Tier 3 (advisory forever) and ships **off**. The deterministic matrix decides; the model rephrases. A grounding gate runs twice — inside the provider so the router degrades, and again before anything is stored — and the database refuses to store an explanation that did not pass it. The template sentence is kept **alongside** every finding, so the record still reads correctly when the model is off, which is its default.

The gate scores **safe-to-show F1 0.889 against a 0.533 baseline** (+0.356). The baseline is "accept anything non-empty" — exactly what shipping a model with no grounding gate would do. Ten of the eleven cases are the failure modes a small model actually produces; one is a deliberate, documented miss (a faithful sentence that invents a *motive*), kept so the number stays honest.

### The clocks the law starts

- **CERT-In: six hours from DETECTION** — not from confirming it. `detected_at` is captured before anybody knows how bad it is, and the database refuses any deadline that is not exactly detection + 6h.
- **DPDP: 72 hours** to intimate the Board, running **in parallel**, not after. Treating them as a pipeline is how the second deadline is missed while the first is being handled.
- **DPDP: 90 days** for a data-principal request, alarmed well before the end — assembling one person's data across a manufacturing ERP is not a same-day job.
- A **late report is recorded as late** and cannot be edited out. An **erasure refused under a statutory hold must name the obligation**; "refused" alone is what a regulator asks about first.
- **Employment data is legitimate use (s.7), not consent** — recording it as consent would imply payroll stops the moment somebody clicks withdraw.

### Proof, not claims

The chain verifier distinguishes three failures, because they mean different things: a **hash mismatch** (a row was edited), a **link mismatch** (a row was replaced or re-signed), and a **sequence gap** (a row was deleted). "Chain broken" throws away the only diagnostic information the chain carries. Verifications are **stored** — "we verify nightly" is a claim; a row per verification is evidence. One verifier covers both `audit_log` and `ai_action_log`; two would eventually disagree about what a valid link looks like.

Machine keys are **shown once and never stored** — there is deliberately no column a secret could be read back from — scoped narrowly, and a revoked key reports **revoked**, not unknown, because the holder is usually a device somebody forgot to reconfigure.

### A finding worth recording

Seeding the permission catalogue proved the blueprint's "13 closed actions" wrong about this system. It enforces **112 permissions and 46 of them use operational verbs the 13 do not contain** — `hrm.payroll.approve`, `inventory.stock.post`, `quality.disposition.decide`, `planning.mrp.run`. My first cut made those ungrantable, unexplainable and uncataloguable. Renaming them to fit was worse: `hrm.payroll.approve` says what it guards and `hrm.payroll.amend` does not.

So the 13 stayed as the recommended *document* vocabulary, the catalogue accepts any verb, and typos are caught by **catalogue membership** instead — which is strictly stronger, since a compiled-in list could only reject `aprove` by also rejecting `approve`. A separate constraint keeps the permission string's last segment identical to its `action` column, so the two can never drift into a grant that checks nothing.

### Verified

**57 assertions against live PostgreSQL 17**, exit 0, plus **56 new platform tests** (562 total). RLS gate at **177 tenant-scoped tables**, naming gate at 187, clean cross-tenant leak probe, all four AI eval gates green, zero typecheck or boundary-lint errors. Eight things the database refuses outright, including a forged "all rows" scope, an anonymous accepted risk, an attestation claiming a break with no position, and a retention setting below its statutory floor.

## Module 15 — INTEGRATION (done)

The edge of the system. Everything here talks to something we do not control — a GST portal, a bank's SFTP drop, a biometric device, a customer's webhook endpoint — and that single fact shapes every decision in the module.

### Nothing is assumed to have worked

**A timeout is not a failure.** It is the one case where the two possible truths — *it never arrived* and *it arrived and the response was lost* — are indistinguishable from our side, and only one of them is safe to retry. So an IRN timeout triggers **GET-before-retry**: fetch by document reference, and only submit again if the portal genuinely does not have it. A blind resubmit either duplicates a tax filing or burns the 24-hour cancellation window, and a duplicate filing is visible to a regulator and cannot be quietly withdrawn.

The idempotency key is derived from the **document**, never the attempt. Attempt two must present the same key or the gateway sees a second invoice.

### Failure classification decides everything downstream

| Failure | Verdict | Why |
|---|---|---|
| `401 / 403` | **fatal** | Retrying a wrong credential is how an account gets locked out mid-incident |
| `4xx` | **fatal** | The payload will be just as wrong in thirty seconds |
| `409` | **fatal** | It almost certainly already succeeded — fetch, do not resend |
| `429` | retryable | And the server's own `Retry-After` beats our schedule |
| `5xx` / network | retryable | Their problem, and it usually passes |
| timeout | retryable, **side-effect possible** | Which is what makes a replay unsafe |

Backoff is exponential **with jitter**, and the jitter is not decoration: without it everything that failed during one outage retries at the same instants afterwards, and the recovering system is hit by a synchronised wave.

The **circuit breaker lives on the connection row**, not in memory. An in-process breaker is not a breaker once there are two processes — each discovers the same outage separately and the far side gets double the traffic it was being protected from.

### The 30-day window is a cliff, not a slope

Above ₹10 crore turnover an invoice older than 30 days **cannot be reported at all** — the portal simply refuses, permanently, and the only remedy is a credit note and a re-issue. So the alerts escalate at **day 20, 25 and 28** rather than arriving once at the end, the deadline is computed by a database CHECK rather than typed, and a submission past the cliff is refused *before* it is sent rather than discovered from a rejection.

### An e-way bill remembers which portal made it

The dual portal exists because the primary has downtime and a truck at a gate cannot wait. Failover is **recorded on the document**, because a bill generated on the secondary must be *cancelled* on the secondary — losing that fact is how a cancellation silently succeeds at doing nothing while the vehicle is already moving. With both portals down the document is queued and says so; it is never lost.

### Webhooks

The signature binds the timestamp **into** the HMAC (`t=…,v1=…`), which is what makes the replay window enforceable rather than advisory — signing the payload alone lets a captured message be replayed forever. A **future** timestamp is rejected too, for the same reason. Twenty consecutive failures **auto-pause** the subscription: continuing is a slow denial-of-service against somebody who very likely decommissioned the URL. A rotation keeps the previous secret valid for a grace period, because a rotation with no grace is a coordinated outage, and a secret nobody can rotate is a secret forever.

### The module with no AI, and why that is the feature

INTEGRATION carries the registry's **explicit null entry** (`integrations.no_mvp_ai`). The dead-letter triage table is the reason: the error category already determines what a person should do, and a model guessing at it would be slower, unauditable, and capable of the one failure this queue cannot afford — a confident wrong answer about a statutory document. The deterministic table *is* the feature, and it is also the registered baseline any future model would have to beat.

Replay is guard-railed, hard. A DLQ that replays anything on one click is a way to submit the same invoice four times:

- a **transform** failure is not replayable — fix the mapping first, or the replay runs the same broken mapping;
- a **timeout with a possible side effect** is refused outright — check the far side first;
- a **statutory** replay is allowed but demands explicit confirmation;
- **resolving** requires a note, without which the same failure is diagnosed from scratch three months later.

### Mapping fails before the wire, not after

A required field that maps to nothing **fails the message** rather than writing a null — a stock entry with no quantity is discovered days later by a person, and by then the source file is gone. A transform that throws fails it too, rather than passing the raw value through. `dd/mm/yyyy` is read as Indian and never as American, because reading it as `mm/dd` produces a valid-looking wrong date for eleven days of every month. An unmapped unit code is a failure, not a pass-through: letting both `PCS` and `NOS` through gives a plant two units for one thing and quietly wrongs every stock report after that.

The pre-flight dry run finds the **one** mis-typed source path rather than reporting four unrelated problems.

### A correction worth recording

My first cut of the circuit-breaker constraint asserted that only an `open` circuit carries `circuit_opened_at`. That is wrong about the middle state: a **half-open** breaker keeps the timestamp, because if the probe fails the cool-down is measured from the *original* opening. Clearing it would restart the cool-down on every probe, so a flapping endpoint would be probed forever at the shortest possible interval — precisely what the breaker exists to prevent. Migration 0042 inverts the rule: only a *closed* circuit has no opened-at.

### Verified

**48 assertions against live PostgreSQL 17**, exit 0, plus **52 new platform tests** (614 total). RLS gate at **193 tenant-scoped tables**, naming gate at 203, clean cross-tenant leak probe, all four AI eval gates green, zero typecheck or boundary-lint errors. Eight database refusals including a plain-http webhook target, a hand-typed 30-day deadline, a generated IRN with no IRN number, and an attempt orphaned from both its parents.

Every connection ships in **`fake` adapter mode**. That is not a shortcut — it is how the failover, the timeout recovery and the auto-pause can be rehearsed at all. A system whose outage handling can only be demonstrated by causing an outage never gets demonstrated, and the first time anybody sees it is during the incident.

## Module 16 — AI OPERATIONS (done)

The control plane for the AI itself. The platform already had the *mechanism* — a router, a closed 8-feature registry, a hash-chained action log, per-tenant governance. This is the *operations* plane over it.

One rule underlies all of it: **the AI cannot ship itself.** Every promotion, rollout and rollback is a human action with a name and a reason. There is deliberately **no endpoint to force a promotion**, none to bypass a guardrail, and none that lets this module act on business data — the absence of those routes is how the rule is enforced rather than merely written down.

### Minimisation is an allow-list, and it refuses

A block-list is a promise to have thought of every format PII can take, forever, in a country with a dozen identifier schemes. An **allow-list** is a promise that only the fields somebody named will ever be sent.

The detectors run anyway — over what the allow-list produced. When something gets through (somebody allows `remarks` for context and a vendor has typed a PAN into it) the call is **refused**, not quietly redacted: a silent redaction leaves the allow-list wrong forever. PAN is matched by its holder-type character, Aadhaar by the **Verhoeff checksum** — a checksum-valid number is `certain`, a look-alike is only `likely`, because flagging every twelve-digit string as certain PII buries the ones that are.

The redaction record holds **field names, never values**. It is kept next to the audit trail for eight years, and a redaction log containing the thing it redacted is a second copy of the problem.

**Injection is marked, not stripped.** Removing "ignore previous instructions" from a vendor's remarks silently changes the document, and the next attacker phrases it differently anyway. The text is sent as quarantined *data* — which is what it always was — and the confidence drops.

### Numeric provenance

The highest-value guardrail in a finance product. Every number in the model's output must appear in its input; anything else is rejected. The characteristic failure of this technology is not refusing to answer — it is **producing a plausible total nobody typed**, and a number the model invented is indistinguishable from one it read unless you check. Numbers the *code* derived and handed over are allowed explicitly, because "the model may compute" and "the model may invent" are the same permission otherwise.

### The gate is not a warning

A prompt change looks like editing a string and behaves like deploying code. So a version is **content-addressed**, immutable in production, and promoted only when three conditions hold — all refusals, none warnings:

1. the template validates (an undeclared `{{invoiceTotl}}` renders as empty, the model reasons about a missing total and obliges, and **nothing crashes**);
2. an eval **passed for this exact content hash** — a pass covering a previous version proves nothing about this one;
3. the approver **is not the author**.

The database enforces all three, plus one production version per feature. There is no force flag. A rollback states its **blast radius first** — the calls already answered by the bad version, which the rollback stops but does not un-answer.

### Routing always ends somewhere that needs no model

Every chain's last step is deterministic, enforced by a database trigger at activation. A chain that can be exhausted is a feature that stops working when somebody else's API does, and a plant cannot stop taking receipts for that. Residency is checked at **edit, activation and call time** — the third catches a provider that quietly changed where it serves from, which is the only one the first two cannot.

Every attempt is attributed, not just the winner: "the call succeeded" hides that the primary failed nine times out of ten this hour, which is exactly the signal drift needs.

### Cost, and the number beside it

Calls are priced at **the rate in force on the day they happened** — a June call stays at June's rate when the report runs in September, because costing history at today's price is how a report stops matching the invoice. A missing price meters at **zero and flags it**: a guessed price is worse than a missing one, because it reconciles.

The budget **throttles before it blocks**. At 90% the premium tier is refused and the cheap one still answers; only at 100% does the feature fall to its deterministic step. A budget that goes from "fine" to "off" produces an outage that looks like a bug.

Cost is shown **beside acceptance rate**, because spend without acceptance is a number with no opinion attached.

### The switch, and the drill

The kill switch is a **refusal at the chokepoint** — the router declines to route — rather than a flag each feature is trusted to read. A switch depending on eight modules honouring it is eight chances to have missed one. Every feature already has a registered degraded mode, which is what makes it safe to pull: the feature degrades, it does not fail.

And it is **probed**. A kill switch nobody has tried is a belief; the probe sends a real call through and asserts it was refused inside the 60-second bound, records the result, and **fails loudly** when the switch did nothing.

### Drift, and the honest refusals

A falling **acceptance rate** is the signal nothing else on a dashboard shows — the product quietly becoming wrong while latency and cost stay green. A rising fallback rate says the feature still works and it is increasingly *not the AI* doing it. Below twenty calls the scan reports nothing at all, because drift alerts from a handful of calls are how a team learns to ignore drift alerts. A promotion in the window is offered as **a lead, not a proven cause**.

### The five-part answer

"What did the AI do with this document?" — which feature and prompt version, which provider and **from which region**, exactly what left the building, what the guardrails did, and which human confirmed it. Anything less is a log; those five together are an answer somebody can give a regulator. The evidence pack adds the **1:1 reconciliation** between metered calls and the hash-chained action log — a call that was routed but not metered is spend nobody can see.

Golden sets are **evaluation artefacts, contractually excluded from training**, and the database refuses to record one that is not.

### Verified

**59 assertions against live PostgreSQL 17**, exit 0, plus **49 new platform tests** (663 total). RLS gate at **210 tenant-scoped tables**, naming gate at 220, clean cross-tenant leak probe, all four AI eval gates green, zero typecheck or boundary-lint errors.

Nine things the database refuses outright, including a self-approved production prompt, two production prompts for one feature, a restated price, an eval PASS with no content hash, an eval PASS that disagrees with its own numbers, an engaged kill switch with nobody's name on it, a golden set opted into training, and a routing chain activated without a deterministic tail.

The ANN leak probe is recorded rather than assumed: a nearest-neighbour search that crosses tenants returns a competitor's part names as "similar items", and an index that was **never probed** says so — which is not the same as safe.

## Run it on a new device

Prerequisites:

- **Node.js 22** (the supported range is `>=22 <25`);
- **Docker Desktop with Docker Compose v2** (PG17, Valkey, Keycloak and Gotenberg);
- free local ports **3000, 3001, 3002, 5432, 6379 and 8080**; and
- Git.

The repository contains the source, lockfile, all migrations, deterministic demo seeders,
Keycloak realm and compiled login theme. Dependencies, build output, `.env` and the local
PostgreSQL volume are deliberately not committed; the commands below recreate them.

### First-time setup

```bash
git clone https://github.com/Harirajiv-web/XELOR-MVP.git
cd XELOR-MVP

corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env

docker compose version                         # must report Compose v2
pnpm infra:up
docker compose -f infra/docker-compose.yml ps  # wait until PostgreSQL is healthy
pnpm db:migrate                                # applies every migration through 0065
pnpm db:rls-check
```

The API and database scripts load the root `.env` automatically. You do not need to source
it manually in each terminal.

### Start the complete demo

Keep these processes running in separate terminals from the repository root:

```bash
# Terminal 1 — API (development/watch mode)
pnpm dev

# Terminal 2 — web application
pnpm --filter @ind-core/web dev

# Terminal 3 — asynchronous outbox worker
pnpm --filter @ind-core/api worker
```

After Keycloak and Terminal 1 are ready, populate the investor story from a fourth terminal:

```bash
pnpm demo:seed
pnpm demo:northstar
pnpm demo:verify
```

Open **http://localhost:3001**. Keycloak is at **http://localhost:8080** and the API is at
**http://localhost:3000/api/v1**.

For the sign-in-free investor presentation, set both of these values in the local `.env`
before building or starting the web app:

```bash
API_PUBLIC_DEMO=true
NEXT_PUBLIC_PUBLIC_DEMO=true
```

The API flag is off by default and is only for the seeded, isolated Trishul demo dataset.
Without it, the presentation header is ignored and normal Keycloak JWT verification stays
mandatory.

### Production-mode local run

```bash
pnpm build

# Three separate terminals after the build:
pnpm --filter @ind-core/api start
pnpm --filter @ind-core/api worker
pnpm --filter @ind-core/web start
```

To rebuild the committed Keycloak login JavaScript after changing its TypeScript source:

```bash
pnpm --filter @ind-core/web build-login-theme
```

The main verification commands are:

```bash
pnpm lint
pnpm typecheck
pnpm test              # includes DB-gated tests when the infrastructure is available
pnpm db:rls-check
pnpm db:perm-check

# AI ship-gates (exit 0 PASS / 1 FAIL)
pnpm --filter @ind-core/api eval general.master_dedup
pnpm --filter @ind-core/api ai:grounding
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
- **HRM deliberately stops short of five things**, each named in the blueprint as MVP-out or
  as an infrastructure dependency, and none of them affecting a computed figure: payslip
  **PDFs** (Gotenberg is in the compose file but not wired — the payslip data and its full
  trace are served as JSON); **BullMQ fan-out** for compute (it runs synchronously
  in-process, which is a scaling question, not a correctness one); **CSV punch import + S3**
  (the device port and its fake adapter carry the same contract); the **real ZKTeco/eSSL
  bridge** (post-MVP by design — the port exists precisely so it lands additively); and
  **holiday calendars**, which belong to GENERAL and which that module does not yet own —
  §20.3 records no MH/TN holiday in June 2026, so the demo month is unaffected.
- **Two blueprint spellings were overridden by the binding baseline.** DECISIONS-V2 §5.4
  mandates kebab-case event segments, so `hrm.attendance.month_locked.v1` ships as
  `hrm.attendance.month-locked.v1` (same event). §5.4 wins on conflict, by rule. The same
  rule reshapes Maintenance's downtime events:
  `maintenance.asset.downtime.started.v1` → `maintenance.downtime.started.v1`.
- **MAINTENANCE ships with NO AI feature, and that is the binding document winning.**
  DECISIONS-V2 §4.2 fixes the MVP portfolio at a **closed registry of eight**; the module
  blueprint proposes four more (§13.1–§13.4). What ships is the half the blueprint itself
  calls the *deterministic baseline* — a complete asset narrative that needs no model —
  plus the guard a model would have to pass, including a **numeric cross-check** and a
  **PII probe** that refuses any technician's name. Asking the router for
  `maintenance.asset_summary` returns `AI_FEATURE_NOT_REGISTERED`, on purpose. Opening the
  registry is an ADR against §4.2, not a code change.
- **MAINTENANCE deliberately stops short of five things**, none of them affecting a
  computed figure: **Gotenberg PDFs** (the statutory register and the asset dossier are
  served as JSON/CSV-shaped data); **BullMQ scheduling** for the PM generator and the
  KPI rollup (both run on demand and are idempotent, which is the property that matters —
  putting them on a timer is configuration); **Inventory reservations** (Inventory does not
  yet expose a reservation contract, so a PM's default spares are recorded as planned lines
  and flagged to stores — the amber chip, without the hold); **S3 photo attachments**; and
  **General's shift calendar**, which that module does not own yet — so scheduled hours are
  supplied by the caller and the KPI response says exactly where the number came from,
  rendering `Needs shift calendar` rather than assuming 24×7 when it is absent.
- **EXPENDITURE corrects two of the blueprint's own tax figures, because both predate the
  Finance Act 2025** — the 194J threshold moved from ₹30,000 to ₹50,000 and the 194I test
  became ₹50,000 *per month*. Both the old and the new rows are seeded, the old ones closed
  rather than edited, and the seed says in full which reasoning the demo now follows. The
  ₹10,000 rent deduction the blueprint quotes is still right; only its stated justification
  was out of date. The ₹4,500 professional-fee deduction moves from the first quarterly bill
  to the second, where the accumulator actually crosses.
- **EXPENDITURE deliberately stops short of six things**, none of them affecting a computed
  figure: **W1 approval ladders** (the blueprint's amount-banded ladders are configuration for
  the existing engine — the module submits, approves and rejects through its own guarded
  transitions, and wiring the ladder is a seed rather than a code change); **BullMQ workers**
  for the extraction queue, the recurring-expense generator and advance ageing (all three run
  on demand and are idempotent, which is the property that matters); **S3 pre-signed uploads**
  (the attachment row, its hash and the duplicate detection are real; the object store is
  not); **Gotenberg PDF exports** of the registers, which are served as JSON; **multi-currency
  claim lines** (the `fx_rate` table and the as-of rule ship, line-level conversion does not);
  and the **Purchase PO supersession** of an indirect PR's reservation, which needs Purchase to
  emit the event this module would consume.
- **AI #1's eval gate measures categorisation, not field accuracy, and says so.** The
  blueprint's ship gate compares ≥50 labelled receipts against Azure Document Intelligence;
  there are no receipt images in this repository and no Azure subscription, so that half
  cannot honestly run. What does run is the auto-categorisation macro-F1 plus the assertion
  that matters more — zero uncaught arithmetic inconsistencies and zero false alarms on sound
  receipts — as must-pass conditions that fail the gate outright.
- **The offline receipt extractor is a fixture and reports itself as one.** With no vision
  model bound, the stub returns the cached extraction §20.9 seeds, and the model name on the
  record is the stub's rather than a provider's. That is what makes the demo independent of
  provider latency without claiming a model ran.
- **CSP reconciles three things to the established demo universe, and says so rather than
  glossing.** (a) **Demo "today" is Monday 20 July 2026** — DECISIONS-V2 §7 fixes it and
  §7 binds; CSP §20 writes 18-Jul, which is a Saturday. Every SLA figure in the module is
  therefore *computed* at 20-Jul rather than copied from the blueprint's table, and the
  computed values are what the verification prints. (b) **The customers are SMBD's, not new
  ones.** §20 names Ashvamedha Motors, BlueOrbit Pumps and Deccan Agrotech; migration 0021
  already seeded this tenant's customer master, and inventing three more would give the demo
  two sets of customers and the first genuinely divergent master in the prototype — so
  BlueOrbit maps to `CUST-BLO`, and `CUST-SUN` / `CUST-BAC` stand in for Ashvamedha and
  Deccan. (c) **The machines are the CP-50 pump**, because a spare request calls
  `ITEM_PROVIDER` and a demo that only works if nobody presses the button is not a demo.
- **Inventory does not yet track serials, so CSP stores the serial as text.** The warranty
  registry, the AMC asset list and the ticket all key on the number stamped on the
  nameplate, which is what a customer reads out. When Inventory grows a serial register this
  becomes a logical `product_serial_id` and the column shape does not change.
- **`csp_business_calendar` lives in CSP because the platform has no shared calendar master
  yet.** Its columns match `BusinessCalendar` in `@ind-core/platform` exactly, so moving it
  to GENERAL is a rename rather than a rewrite. The same is true of the holiday list, which
  is the gap HRM already records.
- **CSP deliberately stops short of six things**, none affecting a computed figure:
  **Keycloak Organizations** (the portal principal is minted from a realm + organization
  claim the middleware already reads, but the portal realm itself is not provisioned — the
  verification drives the two zones by constructing the contexts directly); **BullMQ
  scheduling** for the SLA scanner and the renewal scan (both run on demand and are
  idempotent, which is the property that matters — a timer is configuration, and `asOf` is a
  parameter precisely so the engine can be time-travelled and checked); **S3 attachments and
  AV scanning** (the `scan_status` column and its `clean`-only serving rule are in place, the
  pipeline is not); **outbound tenant webhooks** with HMAC signatures and a delivery ledger
  (the outbox events they would carry are all published); **rate limiting and CAPTCHA** on
  the portal auth endpoints (the `csp_abuse_event` ledger they feed exists and already
  records prompt-injection attempts); and the **KB RAG assistant**, which the blueprint
  itself defers until the KB is curated — the `vector(384)` column and its HNSW index are
  provisioned so that lands as a backfill.
- **The AI #3 eval gate scores the shipped RULES, not a model, and the README says which.**
  §4.2 registers `keyword_rule_classifier` as the baseline a model must beat; with no model
  bound in CI, comparing the model to itself would be a gate that cannot fail. The gate as it
  stands compares the rules to the honest naive comparator and publishes the bar
  (**macro-F1 0.977** over 27 cases). It keeps one case it fails, on purpose.
- **Two of the blueprint's own numbers do not follow from its own inputs**, and the code
  says so rather than reproducing them. §16.2 quotes a compressor consumption rate of
  22.4 h/day, but the two meter readings the same document gives (11,450 h on 15-Jun,
  11,842.5 h on 03-Jul) imply **21.8056 h/day**; and its step-2 row expects a 22-Jul
  projection that no anchoring of its own figures produces. The engine uses the rate its
  readings support and reproduces the document's *step-1* arithmetic exactly (550 h at
  22.0 h/day from 15-Jun = 25 days = **10-Jul**). Both discrepancies are recorded in the
  seed, the test and the platform source.

- **Planning is single-plant.** MRP nets against total on-hand across every warehouse; there is no inter-plant supply, no transfer planning and no per-warehouse allocation. When a planned order becomes a work order, the components are taken from the first `accepted` warehouse and the output received into the first `finished` one — a documented default, and the point at which multi-warehouse planning becomes a real routing decision rather than a convention.
- **A production order carries no promised date.** Open work orders therefore enter the plan as supply available in the *current* bucket, which is optimistic. The run raises a `data_warning` naming every such document rather than hiding it; inventing a date from the order's creation timestamp would produce a confident number with nothing behind it.
- **The MRP run is regenerative and synchronous.** There is no net-change engine yet: every run re-plans everything. At pilot scale that takes ~70 ms; the blueprint's async job with SSE progress is the shape this grows into, and the engine is already a pure function behind a queue-shaped boundary.
- **The schedule board is a heuristic, not a solver.** EDD/SPT/CR list scheduling with precedence, material dates and the working calendar respected. There is no sequence-dependent setup optimisation and no CP-SAT; those are Phase 3 in the blueprint and are not implied anywhere in the UI copy.
- **Items with no routing are missing from the capacity and schedule views**, and both say so by name. The plan is more optimistic than the plant until a routing exists.

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
13. ~~**Module 08 ACCOUNTS** — the append-only general ledger, the invoice raised inside
    the dispatch transaction, the AR subledger and receipts, and SMBD's credit gate reading
    real receivables through the ledger port.~~ ✅
14. ~~**Module 09 HRM & ATTENDANCE** — the deterministic attendance engine, the s.2(y)
    deemed-wages engine, an effective-dated statutory rate book that cannot be edited,
    payroll under segregation of duties, and the payroll journal posted through the ledger
    port.~~ ✅
15. ~~**Module 10 MAINTENANCE / CMMS** — the asset register, the overlap-free downtime
    clock, MWOs with a completion gate that collects the data reliability needs, calendar
    and meter PM with explicit drift, spares brokered through Inventory, and deterministic
    MTBF / MTTR / availability.~~ ✅
16. ~~**Module 11 CSP / Customer Service Portal** — the first internet-facing surface: the
    second scoping dimension (tenant **and** customer account, read and write), the
    business-time SLA clock, AI #3 triage suggested-never-forced and AI #6 drafting that
    cannot promise, the entitlement gate, the Quality hand-off and CSAT.~~ ✅
17. ~~**Module 12 EXPENDITURE** — the budget reservation ledger that counts committed money
    and not just spent money, input-tax-credit resolution through the s.17(5) and
    company-GSTIN gates, TDS with two thresholds and a crossing the system refuses to decide,
    AI #1 receipt extraction whose every figure is re-derived, AI #4 duplicate detection that
    only ever flags, and the posting handoff that keeps the ledger's single writer.~~ ✅
18. ~~**Module 13 PLANNING / MRP** — low-level codes derived from the BOM graph with cycle
    detection, `max(F,O)` forecast consumption, the MPS with discrete ATP and time fences,
    the level-by-level netting engine with scrap gross-up and every lot rule, lead times
    offset over a working-day calendar, past-due clamped-and-flagged rather than back-dated,
    the pegging chain that answers "why fifty castings?", the exception worklist that
    proposes and never acts, infinite-capacity load, the EDD/SPT/CR schedule board that
    cannot publish itself, and the conversion hand-off to Production and Purchase.~~ ✅
19. The **CLOUD / HYBRID tiers** — a hosted adapter behind the same router, with the
    existing `tier` field routing routine work to the local model and hard work to the
    cloud. Governed, budgeted and eval-gated exactly as the local provider is.
20. Upgrade auth: Keycloak **Organizations** → tenant (replacing the group stand-in) **and
    → customer account for the portal realm**, which is now the load-bearing claim behind
    CSP's second scoping dimension; auth-code flow for the SPA; retire the demo password
    grant.
21. **Per-module DB roles.** Today the whole app connects as one `app_user`, so the
    blueprint's "Quality has no INSERT grant on Inventory's tables" is enforced
    architecturally (boundary lint + the `StockPoster` port + the disposition CHECK
    constraint) but *not* by a database grant. Splitting the role per module would make it
    structural.
