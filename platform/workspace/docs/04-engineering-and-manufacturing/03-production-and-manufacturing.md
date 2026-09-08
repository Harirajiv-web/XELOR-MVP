# IND-CORE Module 06 — Production and Manufacturing
## Engineering Implementation Blueprint

**Product:** IND-CORE Manufacturing ERP for Indian SMEs (IND-AI)
**Module:** Production / Manufacturing — BOM as the manufacturing recipe, Work Orders, material moves, scrap & rework, job work (subcontracting), quality hooks, statutory production accounts
**Document version:** 1.0 · **Date:** 19 July 2026 · **Status:** Ready for build
**Audience:** Frontend, Backend, AI and Product teams — start immediately from this document.

> Companion blueprints (the six-module IND-CORE suite):
> **Module 1 — Engineering / PLM** ([Engineering](01-engineering-and-plm.md)) · **Module 2 — SMBD** ([Commercial](../02-commercial/01-sales-marketing-and-business-development.md)) · **Module 3 — Planning / MRP** ([Planning](02-planning-and-mrp.md)) · **Module 4 — Purchase / Procurement** ([Purchase](../03-supply-chain/01-purchase-and-procurement.md)) · **Module 5 — Inventory / Stores** ([Inventory](../03-supply-chain/02-inventory-and-stores.md)) · **Module 6 — Production / Manufacturing** (this document).
>
> **Hard dependency: Module 5 (Inventory).** Every production quantity in this module is a stock-ledger fact, and planning logic needs **95–99% stock-record accuracy** to emit trustworthy shortages. **Production stays OFF until the Inventory accuracy gate is met** — build and trust Module 5 first, load opening stock, pass the cycle-count gate, then switch this module on.

---

## 1. Module Overview

Production is the **shop-floor execution core** of IND-CORE. Its thesis is deliberately narrow and heavily evidence-backed:

> **A multi-level BOM + a Work Order + two stock moves (Transfer-for-Manufacture and Manufacture) replicates the load-bearing core of every ERP surveyed** — SAP B1, S/4HANA, NetSuite, Dynamics 365 BC, Odoo, ERPNext, Epicor, Katana, MRPeasy. Everything else (routings, schedulers, MES tablets, WIP GL) is a tier above that vendors themselves sell separately, gate behind Enterprise editions, or ship without.

ERPNext — the most fully documented reference — centres its Manufacturing module on **five load-bearing doctypes** (BOM, Work Order, Job Card, Production Plan, Workstation) with supporting masters and utilities around them. Module 6 implements that core plus the four things an Indian job-work-heavy discrete manufacturer cannot live without: **scrap/process-loss semantics, batch genealogy, GST job-work compliance (challans, ITC-04, s.143 clocks), and the Rule 56(12) statutory production account.**

### 1.1 The reference document chain

```
BOM ──▶ Production-Plan-lite ──▶ WORK ORDER ──▶ Job Cards (optional, per operation)
                 │                    │
                 │                    ├──▶ Stock Entry: Transfer for Manufacture (Source→WIP)
                 │                    └──▶ Stock Entry: Manufacture (WIP→FG + scrap + process loss)
                 ├──▶ Material Requests (buy)            [Module 4 — Purchase]
                 └──▶ Subcontract PO drafts (job work)   [Module 4 + challan chain]
```

Key verified mechanics this module copies deliberately (full evidence in Appendix A):

- **BOM immutability** — submitted BOMs cannot be edited; versioning is cancel-and-duplicate with `is_active`/`is_default` flags. Historical WO costing stays auditable; the cost is one status column plus a copy action.
- **The Work Order minimal field set** — item, qty, BOM ref, planned dates, and **four warehouses** (Source, WIP, Target, Scrap). Raw materials tracked per line as the triple **Required / Transferred / Consumed** — the minimal schema that supports partial issues, partial completions, and over/under-consumption reporting.
- **WIP-as-warehouse** — stock physically sitting in the WIP-type warehouse **is** the WIP balance. No separate WIP ledger, no WIP GL in the MVP.
- **Scrap vs process loss** — scrap items are received into a Scrap Warehouse as real, valued stock; process loss has *no* stock impact — plan 100, produce 80, and the 20 lost units' cost is absorbed into the valuation of the 80 good units.
- **Odoo's consumption control is one enum**, not a workflow: Flexible Consumption = Blocked / Allowed / Allowed-with-warning.
- **No approval matrix on Work Orders** — stock ERPNext gates WOs on submission only. An approval workflow here is enterprise bloat; we follow the precedent.

### 1.2 Scope boundary with Module 3 (Planning / MRP) — read this first

**Module 3 owns planning: MPS, full time-phased MRP netting, capacity planning (RCCP/CRP), and finite scheduling (the APS board).** Module 6 owns **execution**: the recipe (BOM), the order (WO), the moves, the scrap, the job work, the quality gates, and the statutory production accounts.

Module 6 ships one small planning artifact of its own — **Production-Plan-lite**, a *single-pass shortage calculation* (`Required = BOM Required − Projected Qty`, fanned out into WO / Material Request / Subcontract-PO drafts). Its position is explicit:

- It is the **lightweight built-in loop for pilots that do not run Module 3** — a Kaveri-sized shop can run demand → explode → emit without ever seeing an MPS grid.
- **When Module 3 is installed, Production-Plan-lite is superseded**: Module 3's regenerative/net-change MRP becomes the planning engine, its Planned Orders convert into this module's Work Orders (`PLANNING.md` §4.E FR-PLN-042), and Production-Plan-lite is disabled per plant (a config switch, enforced — two planning engines double-ordering one item is the documented Odoo failure mode Module 3 guards with its V-08).
- MPS, time-phased multi-horizon MRP, capacity-constrained planning, Gantt boards and finite scheduling are **anti-goals here, permanently** — cross-referenced to `PLANNING.md` §4.B/§4.C/§4.G. Module 6 never grows a scheduler; it renders workstation *load*, nothing more.

The Work Order object itself is shared across the boundary without conflict: **Module 3 creates/converts planned orders INTO work orders; Module 6 executes them** (status machine, material triple, produce entries, completion). Module 3 reads back execution events (`prod.wo.produced`, deviations) as its net-change replan triggers.

### 1.3 Integration contracts (summary)

| Boundary | Contract |
|---|---|
| **↔ Module 5 — Inventory / Stores** (structural) | **All material movement goes through the one ledger API** — Production never writes stock tables directly. `stock_entries` gains four purposes: `transfer_for_manufacture · manufacture · return_components · send_to_subcontractor`. WIP = stock in a WIP-type warehouse; scrap warehouse; subcontractor **virtual warehouses**; batch genealogy rides the ledger's `batch_id`. **Production is OFF until Module 5's 95–99% stock-accuracy gate is met.** Challan register + ageing data live in Module 5; Module 6 surfaces them per subcontract order. |
| **↔ Module 4 — Purchase / Procurement** | Production-Plan-lite emits **Material Requests** (purpose=purchase) and **Subcontract PO drafts**; consumes PO status/promise dates for material-availability chips. Job work splits cleanly: the **money flow** (service PO → Purchase Invoice, SAC 9988 @18% with ITC, 194C TDS) is Module 4's; the **goods flow** (challan out → virtual warehouse → receipt back, no GST on the goods) is Module 6 + Module 5. Scrap-sale RCM/TDS/TCS logic lives in Purchase/Sales config. GRNs create the RM batches genealogy starts from. |
| **↔ Module 3 — Planning / MRP** | Planned orders (make) convert into Module 6 Work Orders carrying the peg (`source_planned_order`); Module 6 events (`prod.wo.produced`, `prod.wo.completed`, scrap deviations) feed Module 3's net-change replan and schedule-adherence stats. **Production-Plan-lite defers to Module 3 wherever Module 3 is installed** (§1.2). Workstation masters align with Module 3's `work_center` (one physical machine list, two views). |
| **↔ Module 1 — Engineering / PLM** | Module 1 owns EBOM/MBOM authoring, revisions and ECR/ECO change control. **Module 6 consumes released MBOMs**: `eng.eco.applied` / released-MBOM events hydrate Module 6 production BOMs (item, lines, scrap %, operations) with a `source_mbom_ref` back-reference; effectivity dates gate which BOM version `is_default`. Open WOs on a superseded revision get a warning banner (never a silent change). |
| **↔ Module 2 — SMBD / Sales** (future demand source) | Sales orders are the demand feed for Production-Plan-lite (and for Module 3 when installed); WO completion vs planned-end feeds on-time-delivery; FG batch → dispatch linkage completes genealogy to the customer. |
| **↔ Accounts** (stub) | Quantity-WIP only in MVP; posting **events** emitted at Manufacture (Dr FG / Cr WIP components at valuation) for a future Finance module. Variance reconciliation deferred with **NetSuite's 3-transaction WIP cycle** as the future reference (§18). |
| **↔ HR / QC** (future) | Job cards carry worker + start/stop times → labour cost and Factories Act register *exports* later (muster/OT data is HR's, keyed off job-card time). `quality_inspections` is a **shared doctype** with Module 4's GRN gate (`ref_type` discriminated). |
| **↔ GST compliance** | Delivery challans per Rules 45/55 (print + e-way-pastable export); **ITC-04 Tables 4/5 register export with original-challan back-reference**; challan ageing vs s.143 1-year/3-year clocks with deemed-supply flip; **Rule 56(12) monthly production account**; scrap HSN/RCM/TDS/TCS rates in config, never code. |

---

## 2. Objectives

| # | Objective | Success metric (pilot targets) |
|---|-----------|-------------------------------|
| O1 | Replace the paper production register + Excel shortage sheet with a closed WO loop the floor actually uses | ≥ 95% of production booked through WO produce entries within 6 weeks; zero parallel Excel registers by month 3 |
| O2 | Make WIP visible and trustworthy | WIP value on the dashboard reconciles to physical WIP-warehouse count within ±2%; WOs `in_process` with no movement > N days = 0 unexplained |
| O3 | Capture scrap and process loss honestly, at the moment they happen | Scrap rate and FPY computed from transactions, not month-end estimates; actual-vs-BOM loss deviation alerts fire within the shift |
| O4 | Job-work compliance without a consultant | Every send accompanied by a Rule 55 challan; ITC-04 Tables 4/5 export reconciles to the challan register in one click; zero challans silently crossing the s.143 1-year clock |
| O5 | Lot-level answerability for OEM customers | "Which customers got parts from this lot?" answered in one query, forward and backward, supplier lot → dispatch |
| O6 | Statutory production accounts for free | Rule 56(12) monthly account generated from data already captured — replaces the legacy hand-written register |
| O7 | Keep the pilot on the low-risk curve | Scope guard MTS + simple MTO only (complexity index MTS 65 / MTO 78 vs CTO 85 / ETO 92); no scheduler, no approval matrices, no over-modeled routings |
| O8 | Honest KPIs from WO data alone | Simple-form OEE, FPY, scrap rate, schedule adherence, WIP value — demo shows a credible 50–70% OEE, not a fantasy 90%+ |

---

## 3. User Personas

| Persona | Example (demo universe — Kaveri Pumps & Motors, Coimbatore unless noted) | Goals | Pain today | Primary screens |
|---|---|---|---|---|
| **Production Supervisor — PRIMARY** | **K. Selvam**, Assembly & Machining Supervisor. 18 years on the floor, ITI fitter, runs 2 shifts across lathes/VMC/assembly. | Release WOs, get material moved, book production + scrap same-shift, keep the floor fed | Paper job slips; shortage discovered at the machine; production register written up at day-end from memory | Production Workbench, Work Order card, Produce dialog, Job-card strip |
| **Shop-floor Operator** | **Murugan V.**, CNC operator, lathe **WC-LTH01**. Tamil-first, phone-literate. | Start/stop his job card, report qty OK / rejected without leaving the machine | Nothing digital today; supervisor writes for him | Job-card strip (tablet/phone), My Machine view |
| **Stores In-charge** | **S. Poongodi**, stores in-charge. | Execute transfer-to-WIP against WO pick lists, book returns, keep batches straight | Hand-written issue slips, no link between issue and WO | WO material grid, Transfer dialog, shortage list (phone) |
| **PPC Planner** | **Meenakshi Sundaram**, PPC officer (Module 3's primary persona). | Run Production-Plan-lite (until Module 3), convert shortages into WOs/MRs/SCOs, watch adherence | Excel shortage sheet diverges from stores reality | Planning/Shortage screen, Workbench, KPI dashboard |
| **Plant Manager** | **R. Karthikeyan**, plant head. | Watch the workbench aging, OEE/FPY/scrap trends, approve stop/cancel, own the accuracy gate | No live view; walks the floor to know status | KPI dashboard, Workbench (read), Job-work board |
| **Quality Engineer** | **Meera Iyer** (from `ENGINEERING.md` — quality gate on ECOs; here she executes inspections). | QI at final Manufacture and subcontract receipt; disposition rejected FG → rework or scrap | Inspection registers on paper; FPY unknowable | QI form, Rework/Reject queue |
| **Procurement Officer** | **Anand Krishnan**, purchase officer. | Raise/track subcontract POs (money flow) against SCOs; expedite job-work returns | Challan file and PO file never reconcile | Job-work board, SCO detail, MR queue (Module 4 screens for PO itself) |
| **Finance / CA** | **CA Lakshmi Narayanan** (read-only). | ITC-04 filing data, scrap-sale rates/registers, monthly production account, WIP value | Compiles ITC-04 and the production register by hand from files | ITC-04 export, Rule 56(12) view, KPI dashboard (₹ tiles) |

---

## 4. Functional Requirements

Numbered **FR-PRD-xxx**, grouped in lettered sub-areas. Priority: **M** = MVP must-have, **S** = should-have (demo-strengthening, still cheap), **C/P2** = deferred to roadmap. The MVP must-have set M1–M11 (§17.1) maps onto these FRs as noted; every India-statutory item from the research (§3.1–3.8 of the original survey — see Appendix A.3) appears here as a requirement.

### 4.A BOM Management (FR-PRD-001…014) — maps to must-have M1

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PRD-001 | **Multi-level production BOM**: header (item, qty, UoM, costing basis, process-loss %), component lines (item, qty-per, UoM + **conversion factor**, rate, optional `sub_bom_id` self-reference for sub-assemblies), scrap-item lines (item, qty-per, rate), optional operation lines (seq, operation, workstation, minutes, hourly rate). | A 3-level BOM (pump → impeller sub-assembly → casting) persists and round-trips through the API; `sub_bom_id` chains resolve without depth limit (recursion guard at 20 levels). | M |
| FR-PRD-002 | **UoM conversion on BOM lines** (verified gap in the client's Excel): buy in kg, consume per-piece/per-metre — every line carries stock-UoM qty + conversion factor to the purchase/stock UoM. | SS-SHAFT-ROD consumed 0.6 m/pump converts against stock in metres; a kg↔pc factor of 0 is rejected (V-PRD-03). | M |
| FR-PRD-003 | **Multi-level explosion** with quantity multiplication and UoM conversion at every level, recursive-CTE implementation (§11.1); "Use Multi-Level BOM" flag per WO (on by default) controls whether sub-assembly BOMs explode or sub-assemblies are consumed as items. | Explosion of the §20.5 demo BOM matches the hand-computed component table exactly, including multiplied quantities and converted UoMs (TC-BOM-01). | M |
| FR-PRD-004 | **BOM immutability after submit**: status `draft → submitted → cancelled`; a submitted BOM's header/lines/scrap/operations are read-only at API level (not just UI). | Any PATCH/PUT on a submitted BOM's content returns 409 with a "create a new version" hint (TC-BOM-02); only `is_active`/`is_default` flags remain writable. | M |
| FR-PRD-005 | **Versioning = cancel-and-duplicate**: "New version" action deep-copies a BOM as draft v(n+1) with `parent_bom_version` lineage; on submit it may take `is_default`; exactly one active default BOM per item (partial unique index). | Creating and defaulting v2 never touches v1's rows; historical WOs keep costing against their original BOM version (TC-BOM-03). | M |
| FR-PRD-006 | **Scrap items + process-loss % on the BOM**: scrap lines model recoverable by-material (received into scrap warehouse as valued stock at Manufacture); `process_loss_pct` models expected unrecoverable loss (no stock, cost absorbed). The two are distinct and never conflated. | Produce entry pre-fills expected scrap qty and flags actual-vs-planned loss deviation (feeds §13.2). | M |
| FR-PRD-007 | **Cost roll-up** off valuation rate (default) or last-purchase rate, selectable per BOM (`costing_basis`); operation cost = Σ minutes × workstation hourly rate; scrap credit subtracted; multi-level roll-up bottom-up (§11.2). Rolled cost + as-of timestamp stored on the BOM. | Roll-up of the demo BOM matches hand-computed ₹ (TC-BOM-04); re-roll after a valuation change updates only draft/active-cost display, never submitted-BOM history. | M |
| FR-PRD-008 | **BOM tree + where-used**: interactive tree of any BOM; reverse where-used query for any component ("which BOMs/parents consume this item?") across all levels. | Where-used for CI-CASTING-IMP returns IMPELLER-KV50 → PUMP-KV50 chain in < 1 s. | M |
| FR-PRD-009 | **CSV import** of BOM lines (component code, qty, UoM, conversion) with row-level error report — the data-migration path (38% of ERP failures are data migration; make correction cheap). | 200-line import completes < 5 s; bad item codes reported per-row, partial import never commits. | M |
| FR-PRD-010 | **Released-MBOM handoff from Module 1**: subscribing to `eng.eco.applied` / MBOM-release events creates/updates a draft production BOM carrying `source_mbom_ref` (MBOM id + revision); effectivity date proposes the `is_default` switch date; supervisor submits after review. | Kaveri KPM-5HP-MB Rev B (eff. 01-Aug-2026) arrives as a draft v2 BOM referencing ECO-2026-0031; v1 (Rev A) stays default until effectivity; open WOs on Rev A show a warning banner, never a silent change. | M |
| FR-PRD-011 | Standalone-mode BOM authoring: where Module 1 is not installed, the BOM editor is the authoring surface (no ECO workflow — cancel-and-duplicate only). | Feature-flagged per tenant; identical schema either way. | M |
| FR-PRD-012 | BOM types kept to **one**: production BOM only. No sales/template/phantom/kit BOM types, no unbuild/disassembly (SAP B1 ships five BOM types; only production is needed — §17.3 deferred). Phantom-style blow-through is honoured **when consuming Module 1 MBOMs that contain phantoms** (flatten on hydrate). | A Module 1 phantom (HW-KIT-5HP) arrives flattened into parent lines with a provenance note. | M |
| FR-PRD-013 | Circular-reference guard shared with Module 1/Module 3: `sub_bom_id` insertion that creates a cycle is rejected with the offending path. | A→B→A rejected with path listed (V-PRD-02). | M |
| FR-PRD-014 | BOM comparison view: any two versions of an item's BOM diffed line-wise (added/removed/qty-changed). | v1 vs v2 diff renders in the version-history panel. | S |

### 4.B Work Order lifecycle (FR-PRD-020…028) — maps to must-have M2

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PRD-020 | **Work Order minimal field set**: item, qty, BOM ref (defaulted to active default BOM), planned start/end, **four warehouses** — Source, WIP, Target, Scrap (defaulted from plant config), `skip_transfer` flag, `consumption_policy` enum, optional sales-order ref / plan ref / `source_planned_order` (Module 3 peg). | WO creation from a BOM takes ≤ 3 fields of user input; all warehouses default correctly. | M |
| FR-PRD-021 | **Required-items triple**: on submit, WO explodes its BOM into `wo_items` lines each tracking **Required / Transferred / Consumed** (+ Returned) quantities — the minimal schema for partial issues, partial completions, over/under-consumption reporting. | The triple grid renders live on the WO card; sums update transactionally with each stock entry (TC-WO-01). | M |
| FR-PRD-022 | **Derived status machine** — status is computed from quantities, never hand-set: `draft → submitted(not_started) → in_process (any transfer or produce) → completed (qty_produced + qty_process_loss ≥ qty_planned)`; explicit `stopped` (with reason; capped at current produced qty) and `cancelled` (only if ledger effects reversed). 3–4 working states, per the cross-vendor norm (BC's 5, ERPNext's derived 3, Odoo's 4). | Status transitions match the table in §11.3 exactly; no API exists to set status directly (TC-WO-02). | M |
| FR-PRD-023 | **No approval matrix on Work Orders** — submission is the only gate (stock-ERPNext precedent). Role permissions (§14) control who may submit/produce/stop/cancel; there is no multi-step approval workflow anywhere in this module. | Design-guard test: no approval-workflow table/endpoint exists for WOs. | M |
| FR-PRD-024 | **Partial everything**: partial transfers, partial produce entries, multiple produce entries per WO, over-production tolerance % (config, default 0). | Produce 30 + 50 of a 100-pc WO leaves it `in_process` with correct triple; a third produce of 20 completes it. | M |
| FR-PRD-025 | Stop / resume: `stopped` WOs block further stock entries; resume returns to derived status. Cancel reverses (or requires prior reversal of) all linked stock entries — exact ledger reversal (TC-MFG-03). | Cancel on a WO with net WIP ≠ 0 is blocked with the list of entries to reverse. | M |
| FR-PRD-026 | Material-availability check at submit/release: per-line `available_in_source ≥ required − transferred` chip (can-start / short); shortage list deep-links to MR/SCO creation. Uses Module 5 projected qty. | Workbench chips match ledger truth; shortage click-through pre-fills an MR. | M |
| FR-PRD-027 | Overdue/aging surfacing: WOs past `planned_end`, and WOs `in_process` with **no stock movement for N days** (config, default 3), are flagged on the workbench — the WIP-drift countermeasure (risk register §17.6). | Aging query is indexed; the two flags render as distinct badges. | M |
| FR-PRD-028 | Rework WO variant: `is_rework = true`, input = rejected FG (consumes the rejected-FG item/batch from the rejected warehouse), output = same FG item; excluded from FPY numerator by definition. Full spec in 4.D. | See FR-PRD-044. | M |

### 4.C Material moves (FR-PRD-030…037) — maps to must-have M3; **the most heavily tested code in the module** (NFR-PRD-01)

All four moves are **stock entries executed by Module 5's single ledger-write API** with production purposes; Module 6 composes them, never writes stock rows itself.

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PRD-030 | **Transfer for Manufacture** (Source → WIP): pre-filled from BOM × WO qty minus already-transferred; batch pickers per line (FEFO/FIFO suggestion from Module 5); partial quantities; updates `transferred_qty`. | Transfer of a partial kit updates the triple and flips WO to `in_process`; ledger rows land in the WIP warehouse (TC-MFG-04). | M |
| FR-PRD-031 | **Manufacture entry** (the produce move, one atomic stock entry): consumes components from WIP per BOM proportion ± consumption policy, receives FG into Target (with auto-batch when tracked), receives scrap items into Scrap warehouse as valued stock, books process-loss qty (no stock, cost absorbed into good units — §11.4 math). | The §16 golden fixture (produce 80 of 100 with 5 scrap + 15 process loss) reproduces the hand-computed ledger effects exactly (TC-MFG-01). | M |
| FR-PRD-032 | **Return Components** (WIP → Source): reversal path for unconsumed material on stop/short-complete; batch-preserving. | Return restores source-warehouse batch balances; `returned_qty` tracked; WIP nets to zero on a fully returned stopped WO. | M |
| FR-PRD-033 | **Skip-transfer / backflush toggle** per WO (`skip_transfer`): Manufacture consumes directly from Source (no WIP leg) — the backflush path for one-op shops. Company-level default in Manufacturing Settings (ERPNext precedent: both modes; per-WO override). | Same produce math, ledger shows Source→(consume) with no WIP rows (TC-MFG-05). | M |
| FR-PRD-034 | **Consumption-policy enum** per WO (default from settings): `blocked` — consumption ≠ BOM proportion rejected; `allowed` — any consumption accepted; `warn` — accepted with a logged warning + deviation event. One enum, not a workflow (Odoo Flexible Consumption precedent). | Over-consumption behaves per policy in TC-MFG-02; deviations emit `prod.wo.deviation` for Module 3. | M |
| FR-PRD-035 | Explicit consumption override lines on the produce dialog (when policy permits): per-component actual qty + batch, replacing the BOM-proportional prefill. | Actual consumption stored per line; triple reflects actuals. | M |
| FR-PRD-036 | Every production stock entry carries `wo_id` (or `sco_id`) back-reference; the WO card lists its entries with deep links; **exact reversal on cancel** — each entry reversal restores every ledger row (qty, value, batch) to the pre-entry state. | Cancel-and-assert ledger equality test passes (TC-MFG-03). | M |
| FR-PRD-037 | Posting-date control: entries post at server time by default; backdating limited to the open stock period (Module 5 period lock) and role-gated. | Backdated entry into a closed period → 422. | M |

### 4.D Scrap, process loss & rework/reject path (FR-PRD-040…045) — maps to must-haves M4 + M8

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PRD-040 | **Scrap capture at completion**: scrap items from the BOM (± ad-hoc additions on the dialog) received into the Scrap warehouse as **real, valued stock** at scrap rate; per-WO, per-item, per-period scrap reporting. | Scrap warehouse balance +5 after the golden fixture; scrap value appears in WIP→FG cost math as a credit. | M |
| FR-PRD-041 | **Process-loss capture**: `qty_process_loss` on the produce entry — reduces good qty, has *no* stock impact, cost absorbed into remaining good units (plan 100 / produce 80 semantics, §11.4). Planned (`bom.process_loss_pct`) vs actual loss both stored; deviation computed. | Unit valuation of good FG reflects absorbed loss to the paisa (TC-MFG-01); actual-vs-plan deviation > threshold raises an alert. | M |
| FR-PRD-042 | Scrap disposal linkage: scrap-warehouse stock is sellable via a disposal invoice (Sales/Purchase side) with **per-item HSN + GST rate from config** (copper 7404 / steel 7204 @18%, precious-metal waste 3%), **never a hardcoded rate**; metal-scrap RCM (purchases from unregistered, since Oct-2024) and **2% GST TDS** on B2B scrap sales > ₹2.5 lakh flagged from config. Income-tax TCS on scrap kept in config with a **verify-before-hardcoding caveat** (historically 1%; one source reports 2% from 1-Apr-2026 — single-source). | Rates resolve from `statutory_config` at invoice time; changing a rate needs no deploy (V-PRD-14). | M |
| FR-PRD-043 | **Reject path for FG failing final inspection**: QI result `rejected` routes FG to the **Rejected warehouse** (quarantine, non-sellable); a disposition action then chooses **rework WO** or **explicit scrap decision** (move to scrap warehouse at scrap value, with reason). | FG failing QI can never reach a sellable warehouse (V-PRD-10, TC-QC-01). | M |
| FR-PRD-044 | **Rework WO** (`is_rework`): consumes the rejected FG (item + batch) from the Rejected warehouse as its input material (plus any additional components), produces the FG again; on pass, FG re-enters sellable stock with a new batch linked to the reworked batch (genealogy preserved). Reworked units are **excluded from the FPY numerator by definition**. ERPNext itself lacks first-class rework (open issue) — this simple explicit path beats their manual workaround. | Rework WO restores a failed batch after passing QI; FPY calculation provably excludes it (TC-QC-02). | M |
| FR-PRD-045 | Rework/Reject queue screen: all rejected-warehouse stock with age, source WO/QI, disposition buttons. | Queue drains to zero in the demo script; ageing sort. | M |

### 4.E Batch genealogy (FR-PRD-050…053) — maps to must-have M5

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PRD-050 | **Consume RM by batch** on transfer/produce (mandatory when `item.tracking_mode = batch` — Module 5 master); batch pickers with FEFO/age hints; split-batch consumption supported. | Batch-tracked component without a batch on the entry → 422 (V-PRD-08). | M |
| FR-PRD-051 | **Auto-create FG batch at Manufacture** (configurable series, e.g. `IMP-B-{YYMMDD}-{seq}`); the manufacture entry records the consumed-batch set → produced-batch edge in the genealogy graph (rides Module 5's `batch_id` on ledger rows). | Every produce entry of a batch-tracked FG yields exactly one new batch with its parent set (TC-GEN-01). | M |
| FR-PRD-052 | **Forward + backward trace report**: supplier lot → all FG batches → dispatches/customers (forward); FG batch → all consumed RM lots → suppliers/GRNs (backward). One recursive query over ledger edges (§11.7); answers "which customers got parts from this copper lot?" in one call. | The §20.13 recall drill returns the full chain < 2 s (TC-GEN-02). | M |
| FR-PRD-053 | Genealogy spans job work: batches sent to a subcontractor (virtual warehouse) and received back keep lineage through the SCO chain. | Trace through the plating loop shows vendor custody hop. | M |

### 4.F Shortage calculation lite — Production-Plan-lite (FR-PRD-055…059) — maps to must-have M6; **superseded by Module 3 when installed (§1.2)**

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PRD-055 | Demand capture: from sales order(s) (SMBD ref) or manual lines (item + qty + need date). Single pass, no time-phasing, no buckets — deliberately. | A plan documents its demand source per line for pegging-lite. | M |
| FR-PRD-056 | **Single-pass shortage calc**: multi-level BOM explosion of demand → per item `Required = BOM Required − Projected Qty` (projected from Module 5: on-hand + on-order − reserved) → classify each shortage line **make / buy / subcontract** from the item master. The minimal MRP contract: one formula, one fan-out. | The §20.11 fixture with partial stock yields exactly the expected make/buy/subcontract split (TC-PLN-01). | M |
| FR-PRD-057 | **Emit fan-out**: one click creates draft **Work Orders** (make), **Material Requests** (buy → Module 4), **Subcontract-PO drafts + SCOs** (subcontract → Module 4 + §4.G). Links back to the plan and demand. This fan-out *is* the Purchase↔Production integration boundary. | Emitted documents carry `plan_id` + demand refs; each is a draft requiring its own submit. | M |
| FR-PRD-058 | **Idempotent re-run**: re-running a plan (or running an overlapping plan) never double-emits — emitted lines are marked with their document refs and re-runs reconcile against open emitted quantities. | Run twice on identical data → zero new documents (TC-PLN-02, golden fixture). | M |
| FR-PRD-059 | **Module 3 deferral switch**: per-plant flag `planning_engine = lite | module3`. When `module3`, Production-Plan-lite screens hide, its endpoints 409 with a pointer to Module 3, and planned-order→WO conversion becomes the only WO-creation path from planning. | Flag flip is reversible; both engines never run on one plant (mirror of Module 3's V-08). | M |

### 4.G Job work / subcontracting — free-issue variant (FR-PRD-060…071) — maps to must-have M7; India-statutory items §3.1–3.5

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PRD-060 | **Subcontract Order (SCO)**: supplier, service item (SAC 9988), FG/processed item, qty, component list (qty-per, from BOM or manual), expected return date, status `open → partial → closed` (+ cancelled); `po_ref` links the **money flow** (service PO on Module 4). The six-document ERPNext chain simplified to four (SCO, send entry+challan, receipt, service PO). | SCO lifecycle round-trips; closing requires component reconciliation (V-PRD-12). | M |
| FR-PRD-061 | **Send to Subcontractor**: stock entry (purpose `send_to_subcontractor`) moving components into the supplier's **virtual warehouse** — the subcontractor is a warehouse in the principal's own ledger, enabling at-vendor balance, ageing and ITC-04 **without any vendor data**. | Send 100 → virtual-warehouse balance 100 (TC-JW-01). | M |
| FR-PRD-062 | **Delivery challan per dispatch (Rules 45/55)**: serially numbered (≤ 16 chars, per-FY series), triplicate print (original/duplicate/triplicate marked), carrying principal + job-worker GSTINs, HSN, qty, taxable value, tax rate, place of supply; generated with the send entry; supports **vendor-direct shipment** (supplier ships to job worker; challan still required from principal). | Challan PDF carries every Rule 55 mandatory field; numbering gapless per FY (V-PRD-11). | M |
| FR-PRD-063 | **E-way bill support**: challan export in portal-pastable format; **inter-state job-work movement prompts e-way regardless of value** (the ₹50k threshold does not apply inter-state; intra-state thresholds per state config — TN ₹1 lakh). Native e-way API deferred (§18). | Inter-state SCO send without e-way acknowledgment → blocking prompt; export file matches portal template. | M |
| FR-PRD-064 | **Subcontract Receipt**: receive processed goods from virtual warehouse → accepted warehouse; fields for `qty_received`, `qty_rejected`, and **`scrap_at_jobworker_qty`** (a distinct stream from in-house scrap — s.143(5): scrap at the job worker's premises is sold from there by a *registered* job worker, else accounted by the principal); consumes component balances per qty-per; **`challan_refs` back-reference (JSONB)** allocating the receipt against original outward challans — the ITC-04 Table 5 key schema decision. | Receive 95 + 3 scrap + 2 rejected against a 100-send: virtual wh nets correctly and Table 5 rows reconcile to the original challan (TC-JW-01). | M |
| FR-PRD-065 | Optional QI gate at subcontract receipt (`item.inspection_required`), same shared QI doctype (§4.H). | Failed QI routes to rejected handling before acceptance. | M |
| FR-PRD-066 | **ITC-04 register export (Rule 45(3))**: Table 4 (goods sent in period) + Table 5 (received back / supplied from job worker's premises, **cross-referencing the original outward challan**) as CSV/XLSX; filed by the principal — **half-yearly (due 25 Oct / 25 Apr) above ₹5 crore AATO, else annual** (period config per tenant). A periodic register export suffices; no real-time filing pipeline. | Export for the demo period matches the challan register row-for-row (TC-JW-03). | M |
| FR-PRD-067 | **Section 143 clocks + deemed supply**: inputs must return within **1 year**, capital goods within **3 years** (dies/jigs/fixtures move separately; **moulds & dies are exempt from the return requirement** — flag per challan line); overdue challans flip to `deemed_supply` state — a taxable supply **from the original dispatch date** with GST + 18% interest exposure surfaced. Challan **ageing register is owned by Module 5**; Module 6 surfaces ageing bars per SCO/vendor on the job-work board. | 10-month challan renders amber (config threshold), 13-month renders red `deemed_supply` (TC-JW-02); moulds/dies lines excluded from the 1-year sweep. | M |
| FR-PRD-068 | **Money-flow linkage**: SCO links to the service PO (SAC 9988, engineering job work @18% with ITC) and its Purchase Invoice on Module 4; 194C TDS on job-work payments is Module 4's; the two chains — goods (challan, no GST) and money (PO/invoice, GST on service) — **reconcile at the SCO**. | SCO detail shows both chains side-by-side with status. | M |
| FR-PRD-069 | Job-work board: per-subcontractor columns — components out, at-vendor balance (virtual wh), receipts, **ageing bars**, ITC-04 export button; drill to SCO. | §7.7 renders from live data; ageing amber/red thresholds from config. | M |
| FR-PRD-070 | Subcontractor rate cards (₹/unit per service) maintained on the Purchase side; Module 6 reads for SCO defaulting. | Rate pre-fills the SCO/service-PO draft. | S |
| FR-PRD-071 | **Inward job work (client as job worker on a principal's material) — OPEN SCOPE, do not build until confirmed** (Appendix B Q1): would need customer-material non-valuated warehouse (type exists in Module 5), inward-challan register, service sales invoice. | Explicitly out of MVP; decision gate documented. | C |

### 4.H Quality inspection hooks (FR-PRD-075…078) — maps to must-have M9

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PRD-075 | **QI document** (shared doctype with Module 4's GRN gate): template (parameters, spec min/max/target), sample size, readings (JSONB), result accepted/rejected, inspector, timestamp; keyed by `ref_type` (`grn | manufacture | subcontract_receipt | job_card`) + `ref_id`. | One table serves all four gates; Module 4 GRN QI rows coexist (TC-QC-03). | M |
| FR-PRD-076 | QI **triggerable at final Manufacture** and **at subcontract receipt**, gated by `item.inspection_required`; pending QI holds FG in a quarantine state (not sellable) until resolved. | With inspection required, produce entry creates a pending QI and FG lands in quarantine until accept (V-PRD-10). | M |
| FR-PRD-077 | QI results generate the **FPY numerator** (accepted-first-time) and feed the reject path (4.D) on failure. | FPY on the dashboard matches hand-count on fixtures. | M |
| FR-PRD-078 | QI templates per item with parameter library; readings entry optimized for ≤ 10 parameters (floor reality). | Template reuse across items; readings validate against min/max. | S |

### 4.I Job cards & workstations (FR-PRD-080…084) — should-have tier

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PRD-080 | **Simplified job card** per operation (optional per WO — routing is never forced; NetSuite tier-2 evidence: base work orders are operation-less): operation, workstation, worker, qty OK / rejected, process-loss qty, start/stop times. Labour capture + scrap-at-operation + the HR/QC touchpoints in one deliberately dumb document. | Job card start/stop round-trip < 3 s on plant Wi-Fi; a WO whose BOM has no operations completes without any job card (the ERPNext each-piece-cuttable principle). | S |
| FR-PRD-081 | Workstation master: code, name, hourly rate, daily hours, holiday list; **load display only** (available vs booked hours from open WO operations) — **no scheduler, ever** (§1.2 anti-goal; scheduling is Module 3 §4.G). | Load bars render; no sequencing UI exists. | S |
| FR-PRD-082 | Operator "My Machine" view: today's job cards for the operator's workstation, start/stop buttons, qty entry — Tamil/Hindi labels. | Murugan completes a card in ≤ 4 taps. | S |
| FR-PRD-083 | Job-card rollup: `wo_operations` aggregates job-card actuals (minutes, qty OK/rejected) per operation for cycle-time KPIs and future labour costing. | Rollup consistent with card sums (transactional). | S |
| FR-PRD-084 | Workstation ↔ Module 3 `work_center` alignment: one physical machine list; Module 6 workstations map 1:1 to Module 3 work centers when both installed (shared code). | No duplicate machine masters in a full-suite install. | S |

### 4.J Statutory production reports (FR-PRD-090…093) — maps to must-have M10; India items §3.6–3.8

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PRD-090 | **Rule 56(12) monthly production account** (verified gap in every surveyed SME): monthly quantitative accounts of **raw materials consumed and goods produced, including waste and by-products** — generated straight from the Required/Transferred/Consumed triple + scrap entries + process-loss records. Directly replaces the legacy hand-written production register. | §20.10 fixture month's totals tie to the stock ledger exactly (TC-RPT-01); view + XLSX export. | M |
| FR-PRD-091 | All statutory **rates and section labels in a config table** (`statutory_config`, effective-dated): scrap HSN/GST rates, RCM applicability, GST-TDS 2% threshold ₹2.5 lakh, income-tax TCS (single-source 2%-from-Apr-2026 caveat recorded in the row's note), ITC-04 periodicity, e-way thresholds per state, ageing amber/red thresholds. | Zero statutory literals in code (V-PRD-14); config rows carry source + verified-on date. | M |
| FR-PRD-092 | **Factories Act registers are exports, not features**: muster roll, OT and accident registers are HR-side documents keyed off job-card time data — Module 6 exposes the raw job-card time export only. | CSV export of job-card times per worker per period. | S |
| FR-PRD-093 | Challan register print (running serial, per FY) for audit; Allahabad HC has upheld detention for challan-less job-work movement — the register is the defence document. | Register export matches issued challans 1:1. | M |

### 4.K KPIs (FR-PRD-095…097) — should-have tier, computed from WO data alone (no sensors)

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PRD-095 | KPI engine over WO/job-card/scrap data: **OEE (simple form)** = (Good Count × Ideal Cycle Time) / Planned Production Time; **FPY** = good qty without rework ÷ total produced (needs the rework path to mean anything); **scrap rate** = scrap ÷ total (per WO/item/period); **schedule adherence** = WOs completed by planned date ÷ total; **cycle time** = actual vs planned (from job cards); **WIP value** = stock value in WIP warehouses (free from the Module 5 ledger). | Formulas match §11 definitions; fixtures hand-verified. Benchmarks displayed honestly: world-class 85%, typical ≈ 60%, more plants score below 45% than above 85% — **the demo shows 50–70%**. | S |
| FR-PRD-096 | Before/after baselining practice (Panorama checklist): 8 metrics snapshotted at go-live (throughput, cycle time, OEE, forecast accuracy, costs avoided, inventory turns, changeover time, FPY) for the pilot's ROI story. MTBF/MTTR excluded (no maintenance records); TEEP/OLE/energy-per-unit excluded as bloat. | Baseline snapshot stored and comparable at +90 days. | S |
| FR-PRD-097 | KPI dashboard screen + Rule 56(12) view/export co-located (§7.9). | Tiles + trends render from materialized views < 1 s. | S |

---

## 5. Non-functional Requirements

| ID | Requirement | Target / design rule |
|----|-------------|----------------------|
| NFR-PRD-01 | **The WO → stock-entry path is the most heavily tested code in the module.** Shop-floor post-mortem evidence: when transactions don't match floor practice, "supervisors revert to spreadsheets, operators bypass transactions" — the produce path failing once in front of the floor kills adoption. | Golden fixtures hand-computed (§16); property tests on ledger reversal; mutation-testing budget spent here first; produce/transfer endpoints at 100% branch coverage. |
| NFR-PRD-02 | **Floor usability — capture only events the floor will actually record**: issue, finished qty, scrap. Everything else (operations, job cards, QI) is optional per WO. Produce entry ≤ 3 user decisions in the common case (qty good, scrap, batch confirm). | Task-completion test with a supervisor persona: produce entry < 30 s; job-card action ≤ 4 taps; works on a ₹12k Android tablet over plant Wi-Fi. |
| NFR-PRD-03 | **Partial-everything tolerance**: partial transfers, partial produces, over/under-consumption per policy, partial SCO receipts, multi-receipt reconciliation — no code path assumes "exactly once, exactly full qty". | Fuzz tests over random partial sequences preserve invariants (triple sums, ledger balance, SCO reconciliation). |
| NFR-PRD-04 | **Audit immutability**: submitted documents are immutable (BOM content, posted stock entries, challans, QI results); corrections are new documents (reversal/amendment), never edits. Immutable audit rows (who/when/before/after) on every state change. | DB-level: no UPDATE grants on posted rows to the app role beyond flag columns; audit table append-only. |
| NFR-PRD-05 | Interactive latency | p95 < 300 ms for workbench/grids; BOM tree (5 levels, 500 nodes) < 1 s; genealogy trace < 2 s; produce POST (incl. ledger write) < 1.5 s. |
| NFR-PRD-06 | Scale envelope (SME) | 10k items, 5k BOMs, 2k open WOs, 200 stock entries/day, 50 concurrent users, 5 plants (data-scoped); 7-year statutory retention of challans/registers. |
| NFR-PRD-07 | Consistency | Produce/transfer entries are single DB transactions spanning Module 6 rows + Module 5 ledger call; idempotency keys on all mutation endpoints (floor Wi-Fi retries must not double-post). |
| NFR-PRD-08 | Availability & ops | Single-VM Docker Compose demo; pilot 99.5% business-hours; nightly pg_dump + WAL archiving; on-prem installable. |
| NFR-PRD-09 | **DPDP posture** | Worker names on job cards are personal data: role-scoped visibility, export minimization, retention policy; AI features degrade to deterministic templates when the tenant disables external LLM calls; all data in-region/on-prem when the customer opts. |
| NFR-PRD-10 | Localization & accessibility | UI strings externalized (en, hi at launch; ta next — Kaveri's floor is Tamil-first); ₹ lakh/crore grouping; WCAG AA on supervisor screens; print stylesheets for challans/registers (A4, triplicate markings). |

---

## 6. UI/UX Flow

### 6.1 The production supervisor's daily loop (K. Selvam)

The module opens on the **Production Workbench** (worklist-first principle from the shared design system). Selvam's day:

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 1. Morning   │→ │ 2. Release / │→ │ 3. Material  │→ │ 4. Produce   │→ │ 5. Job-work  │→ │ 6. End of day│
│ workbench:   │  │ start WOs    │  │ transfers    │  │ entries with │  │ receipts &   │  │ review: aging│
│ chips, aging,│  │ (can-start   │  │ (Poongodi    │  │ scrap/loss   │  │ challan      │  │ WOs, KPIs,   │
│ overdue,     │  │ chips green) │  │ executes the │  │ (+auto batch,│  │ ageing check │  │ ✦ AI shift   │
│ QI pending   │  │              │  │ pick lists)  │  │ QI if reqd)  │  │              │  │ summary      │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
        ↑                                                                                        │
        └────────────── ledger truth (Module 5) refreshes chips; events feed Module 3 ◄──────────┘
```

Narrated: **(1)** 07:45 — workbench shows 14 open WOs; two red chips (material short), one amber aging badge (WO in_process, no movement 4 days). **(2)** He releases WO-2026-0157 (casing batch) — chips green, Transfer button lights up. **(3)** Poongodi opens the pre-filled transfer (BOM × qty minus already-moved), confirms batches FEFO-suggested by Module 5, posts — WIP warehouse rises live. **(4)** 14:20 — lathe cell finishes; Selvam opens Produce on WO-2026-0158: qty good 80, scrap 5 (pre-filled from BOM scrap line), process loss 15 (deviation vs plan flagged orange), FG batch auto-numbered; posts — one atomic manufacture entry, WO stays `in_process` for the balance. QI fires (impellers are inspection-required); Meera accepts. **(5)** Gate entry: 95 plated impellers back from Sree Murugan Electroplating — receipt against SCO-2026-0034, 3 scrap-at-jobworker + 2 rejected recorded, receipt allocated to challan DC-2026-0071; the board's amber bar for the old challan DC-2025-0112 nudges him to chase. **(6)** 17:50 — KPI strip: 61% OEE, 2 WOs at risk; "✦ End-of-shift summary" drafts the WhatsApp-able shift report (English/Tamil) from the day's transactions; he forwards it to Karthikeyan.

### 6.2 The operator's minimal job-card flow (Murugan V., WC-LTH01)

```
My Machine (tablet) → today's cards list → [▶ Start] card JC-0341 (WO-2026-0158, Turn)
   → machine runs … → [■ Stop] → qty OK 92 / rejected 3 / loss 5 → [Save] → next card
```

Four taps, no navigation, no free text. Rejected qty > 0 offers an optional reason chip (tool wear / material / setting). The card writes `wo_operations` rollups and (if QI-flagged) opens an inspection stub for Meera. Anything more is Phase-2 MES territory (§18) — deliberately.

### 6.3 Conventions (shared design system)

- **Chips are ledger truth**: material-availability chips on every WO row recompute from Module 5 projections, never cached optimism.
- **Guarded actions**: Submit/Produce/Send/Receive are single deliberate buttons with an inline consequence summary ("consumes 100 castings from WIP; creates FG batch; posts to ledger").
- **Pre-filled, editable**: every stock entry arrives pre-filled from the BOM/WO math; the human edits actuals, never re-keys.
- **Plain language + tooltips**: Required/Transferred/Consumed, backflush, process loss, deemed supply all carry hover explanations (en/hi).
- **Mobile**: workbench cards, shortage list, job cards, QI accept, SCO receipt are phone/tablet-first; BOM editor and registers are desktop.
- **Command bar**: global search + "✦ ask" (English/Hindi) — "इस लॉट से कौन से कस्टमर को माल गया?" opens the genealogy answer with deep-linked chips (§13.4).

### 6.4 Document state flows (reference)

```
BOM:        draft ──submit──▶ submitted (immutable) ──cancel+duplicate──▶ v2 draft ──▶ …
                                        └─ is_active / is_default flags remain writable

WO:         draft ──submit──▶ not_started ──(transfer|produce)──▶ in_process ──(produced+loss ≥ planned)──▶ completed
                 └─ stopped / cancelled                     partials allowed at every step

Manufacture entry: consumes WIP per BOM (± consumption_policy), receives FG (+auto batch) + scrap,
                   books process loss (no stock row; cost absorbed into good units)

Job work:   SCO(open) ─send components─▶ challan (+e-way if inter-state) ─▶ virtual warehouse
              ─receipt(s): accepted + rejected + scrap-at-jobworker, challan_refs back-alloc─▶ SCO closed
              money flow: service PO ─▶ purchase invoice (SAC 9988 @18%)          [Module 4]
              register:   ITC-04 Tables 4/5 export; ageing vs 1y/3y clocks        [register: Module 5]

Rework:     FG fails QI ─▶ rejected warehouse ─▶ rework WO (is_rework, input = rejected FG batch)
                                              └─ or explicit scrap decision (reason, audited)
```

---

## 7. Screen-by-Screen Design

### 7.1 Production Workbench (module home)
- **Layout:** KPI strip (open WOs by status donut, overdue count, aging-no-movement count, QI pending, WIP value ₹). Main = WO table grouped by status: WO no., item + thumbnail, qty produced/planned progress bar, **material-availability chip** (🟢 can-start / 🔴 short n items / 🟡 partial), planned end (overdue red), aging badge (no movement N days), rework flag, peg chip (SO / plan / Module 3 planned order).
- **Actions:** New WO, Release, quick Transfer/Produce buttons on row hover, filter presets (My lines / Overdue / Short / Aging), bulk print job slips.
- **States:** empty state (arrow to Production-Plan-lite or "convert planned orders" if Module 3 active); ledger-offline banner (Module 5 unreachable → all mutation buttons disabled, read-only view stays).
- **Mobile:** card list with progress bars; chips tap-through to shortage detail.

### 7.2 BOM Editor
- **Layout:** left = item/BOM list with version badges (v1 superseded grey, v2 default green). Main = **tree view** of the multi-level structure (expand sub-BOMs inline, qty × conversion shown per node, rolled-up cost per subtree). Tabs: Components / Scrap items / Operations / **Where-used** / **Version history** (timeline of v1→v2 with diff chips and `source_mbom_ref` provenance for Module 1 hydrated BOMs).
- **Fields:** header (item, qty, UoM, costing basis, process-loss %, with-operations toggle); line editor (component picker, qty-per, UoM + conversion factor, rate, sub-BOM link); scrap lines (item, qty-per, rate).
- **Actions:** Save draft, **Submit** (locks content — confirmation states immutability), **New version** (cancel-and-duplicate), Set default, Roll up cost (shows basis + as-of), CSV import, Compare versions, Print.
- **States:** draft (editable) / submitted (padlock on every field; only flags/actions live) / cancelled (grey); Module 1-sourced BOMs show an "from MBOM KPM-5HP-MB Rev B · ECO-2026-0031" banner; error state on circular reference shows the offending path.

### 7.3 Work Order Card
- **Layout:** header card (WO no., item, BOM version chip, qty planned/produced/process-loss, status pill, planned vs actual dates, four warehouse chips, skip-transfer + consumption-policy badges, is_rework banner if set). Centre = **the live Required / Transferred / Consumed grid** (per component: required, transferred, consumed, returned, available-in-source, batch summary; short rows tinted). Right rail: linked documents (stock entries, job cards, QI, plan/SO peg). Tabs: Materials / Operations (if any) / Entries / History.
- **Actions:** **one-click Transfer** (opens pre-filled transfer dialog) and **one-click Produce** (opens §7.4), Return components, Stop (reason), Resume, Cancel (guarded — lists entries to reverse), Print job slip (QR → deep link).
- **States:** draft / not-started / in-process / completed / stopped / cancelled; overdue banner; "BOM superseded by v2 (eff. 01-Aug)" warning banner when Engineering releases a newer version mid-flight.

### 7.4 Produce Dialog (the money screen — modal over the WO)
- **Layout:** top: qty good (default = remaining), **process loss qty** (deviation vs `bom.process_loss_pct` shown inline, orange when > plan), over-production tolerance note. Middle: **scrap section** — BOM scrap lines pre-filled (item, qty, scrap warehouse, rate), add-row for ad-hoc scrap. Consumption section (collapsed by default): BOM-proportional prefill per component with batch allocations; expands for override when policy allows. Bottom: **FG batch** — auto-number preview (editable prefix), or batch picker if manual; posting date.
- **Actions:** Post (single atomic manufacture entry; consequence summary: "consume … from WIP · receive 80 + batch IMP-B-260713-01 · scrap +5 · loss 15 absorbed"); Save-as-draft (none — deliberately: produce is post-or-nothing).
- **States/errors:** produce qty > transferred-available → blocked with the math shown (V-PRD-06); over-consumption per policy → blocked / allowed / warn toast; batch missing on tracked item → inline error; QI-required note ("FG will wait in quarantine for inspection").

### 7.5 Job-card Strip (optional per WO; operator surface)
- **Layout:** horizontal strip on the WO card (and the operator's My Machine list): one card per operation — operation name, workstation, worker avatar, ▶/■ big buttons, qty OK / rejected / loss steppers, elapsed timer.
- **Actions:** Start, Stop (prompts quantities), reason chips on rejects; supervisor can reassign worker/workstation.
- **States:** pending / running (pulsing) / done; deliberately dumb — no sequencing, no dependencies beyond op order.

### 7.6 Planning / Shortage Screen (Production-Plan-lite)
- **Layout:** left = demand panel (SO picker + manual lines). Main = **shortage tree** after Run: demand item root → exploded components with per-node `Required | Projected | Shortage` columns and a **make / buy / subcontract** classification chip; net-zero nodes collapsed by default.
- **Actions:** Run calc (re-runnable, idempotent), adjust classifications (dropdown per line), **Emit** (consequence summary: "3 WOs, 2 MRs, 1 SCO draft will be created"), open emitted docs.
- **States:** plan draft / emitted (locked, shows document refs per line); **hidden entirely when `planning_engine = module3`** — replaced by a pointer card: "Planning runs in Module 3 — planned orders convert to Work Orders there."

### 7.7 Job-work Board
- **Layout:** kanban-ish columns per subcontractor (Sree Murugan Electroplating first in demo): header (vendor, MSME badge, at-vendor value ₹), rows per SCO — components out vs received bar, **ageing bars per open challan** (green < 6 m, amber ≥ 10 m, red ≥ 12 m = deemed-supply), expected return date, money-flow status chip (service PO / invoice).
- **Actions:** New SCO, Send (challan dialog: components, batches, transporter, e-way prompt for inter-state), Receive (accepted / rejected / **scrap-at-jobworker** fields + challan allocation), **ITC-04 export** (period picker → Tables 4/5 XLSX), challan register print.
- **States:** empty vendor column invites rate-card setup; deemed-supply rows carry a red "s.143 — taxable from dispatch date + 18% interest" banner with the computed exposure ₹.

### 7.8 Rework / Reject Queue
- **Layout:** table of rejected-warehouse stock: item, batch, qty, source WO + QI link, reason, age (ageing tint), value ₹.
- **Actions:** **Create rework WO** (pre-filled: input = rejected FG batch, BOM = rework BOM or original), **Scrap decision** (moves to scrap warehouse at scrap value, reason mandatory), split disposition.
- **States:** empty = "no rejected stock — FPY holding"; rework-in-progress rows link to the rework WO's status.

### 7.9 KPI Dashboard + Rule 56(12) View
- **Layout:** KPI cards (design-system standard): **OEE (simple form)** with honest benchmark footnote, FPY, scrap rate, schedule adherence, WIP value ₹ (lakh), aging WOs. Charts: scrap Pareto (by item/operation/batch — feeds §13.2), planned-vs-actual cycle times, adherence trend, WIP value trend.
- **Rule 56(12) tab:** month picker → the monthly production account table (opening / consumed / produced / waste & by-products / closing per item class), ledger-tie badge ("matches stock ledger ✓"), XLSX export, print.
- **States:** month with open stock period shows "provisional until period close".

### 7.10 Batch Genealogy Explorer
- **Layout:** search by batch/lot/GRN/dispatch → **genealogy graph** (left-to-right: supplier lot → GRN → WO consumptions → FG batches → dispatches/customers), with a table twin (auditors want rows, not graphs).
- **Actions:** trace forward / trace backward toggle, export chain (CSV/PDF for OEM complaint responses), jump into any node's document.
- **States:** batch with vendor-custody hop renders the virtual-warehouse segment dashed ("at Sree Murugan 18-Jun → 12-Jul").

---

## 8. Navigation

Second-level in-module rail (persistent left, under the IND-CORE module rail):

**Workbench · BOMs · Work Orders · Job Cards · Plan (lite) · Job Work · Quality · Rework · Genealogy · Reports & KPIs**

- **Module home = Production Workbench** — the "what needs me now" list per the worklist-first design rule. Rail badges: short-material count on Workbench, pending-QI count on Quality, deemed-supply/amber count on Job Work.
- **Plan (lite)** hides when `planning_engine = module3` (§4.F FR-PRD-059); a slim "Planning → Module 3" pointer remains for orientation.
- Global command bar top-centre (search + ✦ ask, en/hi). Breadcrumbs on every screen: `Production › Work Orders › WO-2026-0158 › Produce`.
- **Deep links:** every entity URL-addressable — `/production/wo/WO-2026-0158`, `/production/bom/BOM-IMP-KV50-002`, `/production/sco/SCO-2026-0034`, `/production/batch/IMP-B-260713-01`, `/production/reports/rule56?month=2026-06` — enabling QR job slips, notifications, genealogy chips and AI-answer citations.
- Role-based landing: Supervisor → Workbench; Operator → My Machine; Stores → Transfer queue; Planner → Plan (lite) / Workbench; Plant Manager → KPI Dashboard; QE → Quality queue; Finance → Reports.

---

## 9. Database Schema (PostgreSQL 16)

Module 6 tables below. Conventions: every table carries `plant_id` scoping and `created_at / updated_at / created_by` audit columns (omitted below except where structural); money `NUMERIC(14,2)` ₹, quantities `NUMERIC(14,4)` (6 decimals where unit-fractions matter); all FKs `ON DELETE RESTRICT` unless noted. `item`, `uom`, `warehouse`, `batch`, `supplier`, and the **stock ledger** are owned by other modules (Modules 1/5/4) and referenced here.

> **Cross-module note (structural):** stock movement tables live in **Module 5**. `stock_entries` there gains purposes `transfer_for_manufacture | manufacture | return_components | send_to_subcontractor`. **Production never writes the ledger directly** — the same single-write-path rule Purchase follows for GRNs. Module 6 stores only the production documents and back-references (`stock_entry_id`) returned by Module 5's ledger API.

```sql
-- ═══════════════════════════ 9.1 BOM ═══════════════════════════
CREATE TABLE boms (
  bom_id             BIGSERIAL PRIMARY KEY,
  bom_no             TEXT NOT NULL UNIQUE,                  -- 'BOM-IMP-KV50-002'
  item_id            BIGINT NOT NULL REFERENCES item,
  qty                NUMERIC(14,4) NOT NULL DEFAULT 1 CHECK (qty > 0),   -- batch size the BOM is stated for
  uom                TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','submitted','cancelled')),
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  is_default         BOOLEAN NOT NULL DEFAULT FALSE,
  version_no         SMALLINT NOT NULL DEFAULT 1,
  parent_bom_version BIGINT REFERENCES boms,                -- cancel-and-duplicate lineage (v2 → v1)
  costing_basis      TEXT NOT NULL DEFAULT 'valuation'
                     CHECK (costing_basis IN ('valuation','last_purchase','manual')),
  with_operations    BOOLEAN NOT NULL DEFAULT FALSE,
  process_loss_pct   NUMERIC(5,2) NOT NULL DEFAULT 0
                     CHECK (process_loss_pct >= 0 AND process_loss_pct < 100),
  source_mbom_ref    TEXT,                                  -- Module 1 handoff: 'MBOM:KPM-5HP-MB:RevB:ECO-2026-0031'
  rolled_cost        NUMERIC(14,2),                         -- last roll-up result
  cost_as_of         TIMESTAMPTZ,
  remarks            TEXT
);
COMMENT ON TABLE boms IS
  'Production BOM. IMMUTABLE after submit: content tables reject writes when status=submitted '
  '(trigger trg_bom_immutable + service guard). Versioning = cancel-and-duplicate; only flag '
  'columns (is_active, is_default) stay writable post-submit.';
-- exactly one active default BOM per item:
CREATE UNIQUE INDEX uq_bom_default ON boms (item_id) WHERE is_default AND is_active;
CREATE INDEX idx_bom_item ON boms (item_id, status);

CREATE TABLE bom_lines (
  bom_line_id       BIGSERIAL PRIMARY KEY,
  bom_id            BIGINT NOT NULL REFERENCES boms ON DELETE CASCADE,
  seq               SMALLINT NOT NULL,
  component_item_id BIGINT NOT NULL REFERENCES item,
  qty_per           NUMERIC(14,6) NOT NULL CHECK (qty_per > 0),   -- per header qty
  uom               TEXT NOT NULL,
  conversion_factor NUMERIC(14,6) NOT NULL DEFAULT 1 CHECK (conversion_factor > 0),
                                                            -- consumption UoM → stock UoM (buy kg, consume pc/m)
  scrap_pct         NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (scrap_pct >= 0 AND scrap_pct < 100),
  rate              NUMERIC(14,2),                          -- snapshot at roll-up (basis per header)
  sub_bom_id        BIGINT REFERENCES boms,                 -- self-reference = multi-level / sub-assembly
  UNIQUE (bom_id, seq)
);
CREATE INDEX idx_bomline_component ON bom_lines (component_item_id);  -- where-used entry point
CREATE INDEX idx_bomline_subbom    ON bom_lines (sub_bom_id) WHERE sub_bom_id IS NOT NULL;
COMMENT ON COLUMN bom_lines.sub_bom_id IS
  'Recursive-CTE-friendly multi-level link. Cycle insertion rejected (V-PRD-02) via path check.';

CREATE TABLE bom_scrap_items (
  id            BIGSERIAL PRIMARY KEY,
  bom_id        BIGINT NOT NULL REFERENCES boms ON DELETE CASCADE,
  scrap_item_id BIGINT NOT NULL REFERENCES item,
  qty_per       NUMERIC(14,6) NOT NULL CHECK (qty_per > 0),
  rate          NUMERIC(14,2) NOT NULL DEFAULT 0            -- scrap valuation rate (credit in cost math)
);

CREATE TABLE bom_operations (
  id             BIGSERIAL PRIMARY KEY,
  bom_id         BIGINT NOT NULL REFERENCES boms ON DELETE CASCADE,
  seq            SMALLINT NOT NULL,
  operation      TEXT NOT NULL,                             -- 'Turn', 'Mill', 'Assemble', 'Hydro test'
  workstation_id BIGINT REFERENCES workstations,
  setup_min      NUMERIC(10,2) NOT NULL DEFAULT 0,
  run_min_per_unit NUMERIC(10,4) NOT NULL DEFAULT 0,
  hourly_rate    NUMERIC(12,2),                             -- defaults from workstation
  UNIQUE (bom_id, seq)
);

-- ═══════════════════════════ 9.2 WORKSTATIONS ═══════════════════════════
CREATE TABLE workstations (
  ws_id        BIGSERIAL PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,                        -- 'WC-LTH01' — aligns 1:1 with Module 3 work_center
  name         TEXT NOT NULL,
  plant_id     BIGINT NOT NULL,
  hourly_rate  NUMERIC(12,2) NOT NULL DEFAULT 0,
  daily_hours  NUMERIC(5,2) NOT NULL DEFAULT 8,
  holiday_list TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);
COMMENT ON TABLE workstations IS
  'Load DISPLAY only — no scheduler (anti-goal, see Module 3). In a full-suite install this is a '
  'view over Module 3 work_center to avoid duplicate machine masters (FR-PRD-084).';

-- ═══════════════════════════ 9.3 WORK ORDERS ═══════════════════════════
CREATE TABLE work_orders (
  wo_id            BIGSERIAL PRIMARY KEY,
  wo_no            TEXT NOT NULL UNIQUE,                    -- 'WO-2026-0158' (per-FY sequence)
  item_id          BIGINT NOT NULL REFERENCES item,
  bom_id           BIGINT NOT NULL REFERENCES boms,         -- version snapshot by reference (BOM immutable)
  qty_planned      NUMERIC(14,4) NOT NULL CHECK (qty_planned > 0),
  qty_produced     NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (qty_produced >= 0),
  qty_process_loss NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (qty_process_loss >= 0),
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','not_started','in_process','completed','stopped','cancelled')),
                   -- DERIVED from quantities + entries (§11.3); no API sets it directly
  planned_start    DATE, planned_end DATE,
  actual_start     TIMESTAMPTZ, actual_end TIMESTAMPTZ,
  source_wh_id     BIGINT NOT NULL,                         -- REFERENCES warehouse (Module 5)
  wip_wh_id        BIGINT NOT NULL,                         -- must be warehouse_type='wip' (V-PRD-05)
  target_wh_id     BIGINT NOT NULL,
  scrap_wh_id      BIGINT NOT NULL,
  skip_transfer    BOOLEAN NOT NULL DEFAULT FALSE,          -- backflush path (consume direct from source)
  use_multi_level_bom BOOLEAN NOT NULL DEFAULT TRUE,
  consumption_policy TEXT NOT NULL DEFAULT 'warn'
                   CHECK (consumption_policy IN ('blocked','allowed','warn')),  -- Odoo enum, not a workflow
  overproduce_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_rework        BOOLEAN NOT NULL DEFAULT FALSE,
  rework_source_batch_id BIGINT,                            -- rejected FG batch consumed (REFERENCES batch, M5)
  sales_order_ref  TEXT,                                    -- SMBD peg
  plan_id          BIGINT,                                  -- FK production_plans below (lite peg)
  source_planned_order BIGINT,                              -- Module 3 peg (planned_order.plo_id) — nullable
  stop_reason      TEXT,
  plant_id         BIGINT NOT NULL,
  CHECK (qty_produced + qty_process_loss <= qty_planned * (1 + overproduce_pct/100.0)),
  CHECK (is_rework = FALSE OR rework_source_batch_id IS NOT NULL)
);
CREATE INDEX idx_wo_workbench ON work_orders (plant_id, status, planned_end);
CREATE INDEX idx_wo_item      ON work_orders (item_id, status);
CREATE INDEX idx_wo_plan      ON work_orders (plan_id) WHERE plan_id IS NOT NULL;
COMMENT ON COLUMN work_orders.status IS
  'Derived: submit→not_started; first transfer/produce→in_process; produced+loss>=planned→completed; '
  'stopped/cancelled explicit. Trigger trg_wo_status_guard blocks direct UPDATE of this column '
  'except by the derivation function.';

CREATE TABLE wo_items (                                     -- the Required/Transferred/Consumed triple
  id                BIGSERIAL PRIMARY KEY,
  wo_id             BIGINT NOT NULL REFERENCES work_orders ON DELETE CASCADE,
  item_id           BIGINT NOT NULL REFERENCES item,
  required_qty      NUMERIC(14,4) NOT NULL CHECK (required_qty >= 0),
  transferred_qty   NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (transferred_qty >= 0),
  consumed_qty      NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (consumed_qty >= 0),
  returned_qty      NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (returned_qty >= 0),
  uom               TEXT NOT NULL,
  conversion_factor NUMERIC(14,6) NOT NULL DEFAULT 1,
  source_wh_id      BIGINT,                                 -- per-line override of WO source
  CHECK (consumed_qty + returned_qty <= transferred_qty + 0.0001),  -- can't consume what never reached WIP
  UNIQUE (wo_id, item_id)
);
COMMENT ON TABLE wo_items IS
  'The minimal schema for partial issues, partial completions and over/under-consumption reporting. '
  'On skip_transfer WOs, transferred_qty is written equal to consumed_qty at produce time (backflush).';

CREATE TABLE wo_operations (                                -- rolled up from job cards
  id             BIGSERIAL PRIMARY KEY,
  wo_id          BIGINT NOT NULL REFERENCES work_orders ON DELETE CASCADE,
  seq            SMALLINT NOT NULL,
  operation      TEXT NOT NULL,
  workstation_id BIGINT REFERENCES workstations,
  planned_min    NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual_min     NUMERIC(12,2) NOT NULL DEFAULT 0,
  completed_qty  NUMERIC(14,4) NOT NULL DEFAULT 0,
  rejected_qty   NUMERIC(14,4) NOT NULL DEFAULT 0,
  UNIQUE (wo_id, seq)
);

CREATE TABLE job_cards (
  job_card_id    BIGSERIAL PRIMARY KEY,
  jc_no          TEXT NOT NULL UNIQUE,                      -- 'JC-2026-0341'
  wo_id          BIGINT NOT NULL REFERENCES work_orders,
  operation_seq  SMALLINT NOT NULL,
  workstation_id BIGINT REFERENCES workstations,
  worker_id      BIGINT,                                    -- HR-lite user ref; DPDP: role-scoped visibility
  qty_ok         NUMERIC(14,4) NOT NULL DEFAULT 0,
  qty_rejected   NUMERIC(14,4) NOT NULL DEFAULT 0,
  process_loss_qty NUMERIC(14,4) NOT NULL DEFAULT 0,
  reject_reason  TEXT,
  started_at     TIMESTAMPTZ,
  ended_at       TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','running','done','cancelled')),
  qi_id          BIGINT,                                    -- FK quality_inspections below
  CHECK (ended_at IS NULL OR started_at IS NOT NULL)
);
CREATE INDEX idx_jc_ws_today ON job_cards (workstation_id, status, started_at);  -- My Machine view

-- ═══════════════════════════ 9.4 PRODUCTION-PLAN-LITE ═══════════════════════════
CREATE TABLE production_plans (
  plan_id       BIGSERIAL PRIMARY KEY,
  plan_no       TEXT NOT NULL UNIQUE,                       -- 'PPL-2026-0021'
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','calculated','emitted','closed','cancelled')),
  demand_source TEXT NOT NULL CHECK (demand_source IN ('sales_order','manual')),
  sales_order_ref TEXT,
  calculated_at TIMESTAMPTZ,
  emitted_at    TIMESTAMPTZ,
  plant_id      BIGINT NOT NULL
);
COMMENT ON TABLE production_plans IS
  'Production-Plan-lite: SINGLE-PASS shortage calc. Disabled per plant when planning_engine=module3 '
  '(Module 3 supersedes — §1.2). Re-runs are idempotent against emitted refs (§11.6).';

CREATE TABLE plan_lines (
  id            BIGSERIAL PRIMARY KEY,
  plan_id       BIGINT NOT NULL REFERENCES production_plans ON DELETE CASCADE,
  item_id       BIGINT NOT NULL REFERENCES item,
  bom_id        BIGINT REFERENCES boms,
  level_no      SMALLINT NOT NULL DEFAULT 0,
  required_qty  NUMERIC(14,4) NOT NULL,
  projected_qty NUMERIC(14,4) NOT NULL,                     -- from Module 5 at calc time (snapshot)
  shortage_qty  NUMERIC(14,4) NOT NULL,                     -- max(required - projected, 0)
  emit_type     TEXT CHECK (emit_type IN ('work_order','material_request','subcontract_po','none')),
  emitted_ref   TEXT,                                       -- 'WO-2026-0161' / 'MR-2026-0104' / 'SCO-2026-0035'
  emitted_at    TIMESTAMPTZ,
  UNIQUE (plan_id, item_id)                                 -- one line per item per plan → idempotency anchor
);

-- ═══════════════════════════ 9.5 JOB WORK (SUBCONTRACTING) ═══════════════════════════
CREATE TABLE subcontract_orders (
  sco_id          BIGSERIAL PRIMARY KEY,
  sco_no          TEXT NOT NULL UNIQUE,                     -- 'SCO-2026-0034'
  supplier_id     BIGINT NOT NULL,                          -- REFERENCES supplier (Module 4)
  service_item_id BIGINT NOT NULL REFERENCES item,          -- SAC 9988 service item
  fg_item_id      BIGINT NOT NULL REFERENCES item,          -- processed/returned item
  qty_ordered     NUMERIC(14,4) NOT NULL CHECK (qty_ordered > 0),
  qty_received    NUMERIC(14,4) NOT NULL DEFAULT 0,
  qty_rejected    NUMERIC(14,4) NOT NULL DEFAULT 0,
  qty_scrap_at_jobworker NUMERIC(14,4) NOT NULL DEFAULT 0,  -- s.143(5) stream, distinct from in-house scrap
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','partial','closed','cancelled')),
  po_ref          TEXT,                                     -- MONEY FLOW: service PO on Module 4 (SAC 9988 @18%)
  virtual_wh_id   BIGINT NOT NULL,                          -- subcontractor virtual warehouse (Module 5, type='subcontractor')
  expected_return DATE,
  plant_id        BIGINT NOT NULL
);
CREATE INDEX idx_sco_board ON subcontract_orders (supplier_id, status);

CREATE TABLE sco_components (
  id            BIGSERIAL PRIMARY KEY,
  sco_id        BIGINT NOT NULL REFERENCES subcontract_orders ON DELETE CASCADE,
  item_id       BIGINT NOT NULL REFERENCES item,
  qty_per       NUMERIC(14,6) NOT NULL CHECK (qty_per > 0),
  qty_sent      NUMERIC(14,4) NOT NULL DEFAULT 0,
  qty_consumed  NUMERIC(14,4) NOT NULL DEFAULT 0,           -- reconciled at receipts (qty_per × received)
  qty_returned_unused NUMERIC(14,4) NOT NULL DEFAULT 0,
  is_capital_goods BOOLEAN NOT NULL DEFAULT FALSE,          -- dies/jigs/fixtures → 3-year clock
  is_mould_or_die  BOOLEAN NOT NULL DEFAULT FALSE,          -- exempt from return requirement (s.143 proviso)
  UNIQUE (sco_id, item_id)
);

CREATE TABLE subcontract_receipts (
  receipt_id    BIGSERIAL PRIMARY KEY,
  receipt_no    TEXT NOT NULL UNIQUE,                       -- 'SCR-2026-0051'
  sco_id        BIGINT NOT NULL REFERENCES subcontract_orders,
  qty_received  NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  qty_rejected  NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (qty_rejected >= 0),
  scrap_at_jobworker_qty NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (scrap_at_jobworker_qty >= 0),
  challan_refs  JSONB NOT NULL DEFAULT '[]',
                -- ITC-04 TABLE 5 BACK-REFERENCE (the key schema decision):
                -- [{"challan_no":"DC-2026-0071","challan_date":"2026-06-18","qty_against":95}]
  qi_id         BIGINT,                                     -- FK quality_inspections
  stock_entry_id BIGINT,                                    -- Module 5 ledger back-ref (virtual wh → accepted wh)
  posting_dt    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (qty_received + qty_rejected + scrap_at_jobworker_qty > 0),
  CHECK (jsonb_typeof(challan_refs) = 'array')
);
CREATE INDEX idx_scr_sco ON subcontract_receipts (sco_id);
CREATE INDEX idx_scr_challans ON subcontract_receipts USING gin (challan_refs jsonb_path_ops);
COMMENT ON COLUMN subcontract_receipts.challan_refs IS
  'Every receipt allocates its quantities against ORIGINAL outward challans — this back-reference '
  'is what makes ITC-04 Table 5 generable (§11.8) and challan-balance reconciliation possible (V-PRD-12). '
  'Challan documents themselves (jobwork_challans) live in Module 5''s register.';

-- Rework orders are work_orders with is_rework=TRUE consuming rejected FG (no separate table).

-- ═══════════════════════════ 9.6 QUALITY (shared doctype) ═══════════════════════════
CREATE TABLE quality_inspections (
  qi_id        BIGSERIAL PRIMARY KEY,
  qi_no        TEXT NOT NULL UNIQUE,                        -- 'QI-2026-0210'
  ref_type     TEXT NOT NULL
               CHECK (ref_type IN ('grn','manufacture','subcontract_receipt','job_card')),
  ref_id       BIGINT NOT NULL,                             -- polymorphic: GRN id (Module 4) or Module 6 doc id
  item_id      BIGINT NOT NULL REFERENCES item,
  batch_id     BIGINT,                                      -- REFERENCES batch (Module 5)
  template_id  BIGINT REFERENCES qi_templates,
  sample_size  NUMERIC(14,4),
  readings     JSONB NOT NULL DEFAULT '[]',                 -- [{"param":"Bore Ø","min":24.98,"max":25.02,"reading":25.01,"ok":true}]
  result       TEXT NOT NULL DEFAULT 'pending'
               CHECK (result IN ('pending','accepted','rejected')),
  inspector    BIGINT,
  inspected_at TIMESTAMPTZ,
  UNIQUE (ref_type, ref_id)
);
CREATE INDEX idx_qi_pending ON quality_inspections (result) WHERE result = 'pending';
COMMENT ON TABLE quality_inspections IS
  'SHARED doctype: Module 4 uses ref_type=grn at goods receipt; Module 6 uses manufacture / '
  'subcontract_receipt / job_card. One inspection vocabulary across the suite (M9).';

CREATE TABLE qi_templates (
  template_id BIGSERIAL PRIMARY KEY,
  item_id     BIGINT REFERENCES item,
  name        TEXT NOT NULL,
  params      JSONB NOT NULL DEFAULT '[]'                   -- [{"param":"Bore Ø","uom":"mm","min":24.98,"max":25.02}]
);

-- ═══════════════════════════ 9.7 CONFIG & AUDIT ═══════════════════════════
CREATE TABLE statutory_config (                             -- rates in CONFIG, never code (V-PRD-14)
  id           BIGSERIAL PRIMARY KEY,
  config_key   TEXT NOT NULL,       -- 'scrap.gst.hsn7404' | 'scrap.gst_tds.threshold' | 'scrap.it_tcs.rate'
                                    -- 'itc04.periodicity' | 'eway.intrastate.threshold.TN' | 'challan.ageing.amber_months'
  value        JSONB NOT NULL,      -- {"rate":18,"hsn":"7404"} / {"rate":2,"note":"single-source; verify before FY27","verified_on":null}
  effective_from DATE NOT NULL,
  effective_to  DATE,
  source_note  TEXT,
  UNIQUE (config_key, effective_from)
);

CREATE TABLE prod_settings (                                -- per-plant module settings
  plant_id           BIGINT PRIMARY KEY,
  planning_engine    TEXT NOT NULL DEFAULT 'lite' CHECK (planning_engine IN ('lite','module3')),
  default_consumption_policy TEXT NOT NULL DEFAULT 'warn'
                     CHECK (default_consumption_policy IN ('blocked','allowed','warn')),
  default_skip_transfer BOOLEAN NOT NULL DEFAULT FALSE,     -- company-wide backflush default (ERPNext precedent)
  wip_aging_days     SMALLINT NOT NULL DEFAULT 3,           -- no-movement alert threshold
  fg_batch_series    TEXT NOT NULL DEFAULT '{ITEM}-B-{YYMMDD}-{SEQ}',
  overproduce_pct    NUMERIC(5,2) NOT NULL DEFAULT 0
);

CREATE TABLE prod_audit_log (                               -- append-only; no UPDATE/DELETE grants
  id         BIGSERIAL PRIMARY KEY,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor      BIGINT NOT NULL,
  doc_type   TEXT NOT NULL,   -- 'bom'|'work_order'|'stock_entry'|'sco'|'qi'|'plan'|...
  doc_id     BIGINT NOT NULL,
  action     TEXT NOT NULL,   -- 'submit'|'produce'|'stop'|'cancel'|'send'|'receive'|'disposition'|...
  before     JSONB, after JSONB
);
CREATE INDEX idx_audit_doc ON prod_audit_log (doc_type, doc_id, ts);

-- ═══════════════════════════ 9.8 REPORTING VIEWS ═══════════════════════════
-- Rule 56(12): monthly quantitative account — RM consumed, goods produced, waste & by-products.
CREATE VIEW v_monthly_production_account AS
SELECT date_trunc('month', se.posting_dt)          AS month,
       sel.item_id, sel.direction,                 -- 'consume' | 'receive_fg' | 'receive_scrap'
       sum(sel.qty)                                AS qty,
       sum(sel.qty * sel.valuation_rate)           AS value
FROM   m5.stock_entries se JOIN m5.stock_entry_lines sel USING (stock_entry_id)
WHERE  se.purpose IN ('manufacture','transfer_for_manufacture','return_components')
GROUP  BY 1,2,3;                                    -- process-loss qty joined from work_orders in the report layer

-- ITC-04 Table 4 (goods sent) and Table 5 (received back, challan back-referenced) — §11.8 queries
-- materialize over m5.jobwork_challans + subcontract_receipts.challan_refs.

-- Challan ageing (owned by Module 5's register; view consumed here for the job-work board):
--   v_challan_ageing: challan_no, sco_id, dispatched_on, months_open, clock ('1y'|'3y'|'exempt-mould'),
--   state ('open'|'amber'|'deemed_supply') — state flip logic in §11.9.
```

### 9.9 Cardinality & design notes

- `boms 1─n bom_lines`, self-referencing through `bom_lines.sub_bom_id` — the **recursive-CTE-friendly** multi-level shape (§11.1); `bom_scrap_items`/`bom_operations` hang off the header. One active default per item enforced by partial unique index, exactly the ERPNext `is_active`/`is_default` altitude.
- `work_orders 1─n wo_items` (the triple) `1─n wo_operations 1─n job_cards`. Stock entries are **not here** — Module 5 rows carry `wo_id`/`sco_id` back-references; the WO card joins across the module API.
- `production_plans 1─n plan_lines`; `plan_lines.emitted_ref` + `UNIQUE(plan_id,item_id)` is the **idempotency anchor** for re-runs (§11.6).
- `subcontract_orders 1─n sco_components`, `1─n subcontract_receipts`; goods flow = Module 5 entries (`send_to_subcontractor` → virtual wh) + receipts; money flow = `po_ref` → Module 4. The two chains reconcile at the SCO.
- **Rework = work_orders with `is_rework`** consuming the rejected FG batch — no parallel rework schema to drift.
- `quality_inspections` is polymorphic (`ref_type`/`ref_id`) and **shared with Module 4** — a deliberate cross-module table (one inspection vocabulary), with `UNIQUE(ref_type, ref_id)` preventing double gates.
- Volumes (SME envelope): boms ~5k, bom_lines ~60k, work_orders ~15k/yr, wo_items ~90k/yr, job_cards ~50k/yr, subcontract_receipts ~2k/yr — trivial for PostgreSQL 16; every hot path indexed above.

### 9.10 Document numbering (statutory-grade sequences)

```sql
CREATE TABLE doc_sequences (
  plant_id   BIGINT NOT NULL,
  doc_type   TEXT   NOT NULL,      -- 'WO'|'JC'|'PPL'|'SCO'|'SCR'|'QI'|'DC' (challan: Module 5 issues, same mechanism)
  fy         TEXT   NOT NULL,      -- '2026-27' — challan series reset per FY (Rule 55)
  next_no    BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (plant_id, doc_type, fy)
);
-- allocation: SELECT ... FOR UPDATE inside the document's transaction → gapless within the commit,
-- ≤16-char challan format enforced at render ('DC-2026-0071'); audit row records every allocation.
```

Gapless-per-FY matters only for the challan register (statutory); other doctypes tolerate gaps on rollback — the allocator takes the strict path only for `DC` to keep hot-path contention off produce/transfer posts.

---

## 10. API Design (REST, OpenAPI via FastAPI)

Base: `/api/v1/production`. JWT bearer (access/refresh), RBAC-scoped per §14. All list endpoints: cursor pagination, `?filter=`, `?sort=`. All mutations audited and idempotency-keyed (`Idempotency-Key` header — floor Wi-Fi retries must not double-post, NFR-PRD-07).

### 10.1 BOMs
```
POST   /bom                          # create draft {item_id, qty, uom, lines[], scrap_items[], operations[], ...}
GET    /bom/{id}                     # header + lines + scrap + ops + version lineage
POST   /bom/{id}/submit              # locks content; 409 on validation failure (cycle, zero conversion)
POST   /bom/{id}/new-version         # cancel-and-duplicate → draft v(n+1) {carry_default?: bool}
PATCH  /bom/{id}/flags               # {is_active?, is_default?} — the ONLY writable fields post-submit
GET    /bom/{id}/tree?levels=        # recursive explosion (nested JSON, qty×conversion per node)
GET    /bom/where-used?item_id=      # reverse explosion, all levels
POST   /bom/{id}/rollup-cost         # {basis?} → {rolled_cost, per_line[], scrap_credit, as_of}
POST   /bom/import                   # multipart CSV → row-level error report
GET    /bom/compare?a=&b=            # line-wise version diff
```

### 10.2 Work orders — the core loop
```
POST   /wo                           # {item_id, qty, bom_id?, planned_start/end?, warehouses?, skip_transfer?,
                                     #  consumption_policy?, sales_order_ref?, plan_id?, source_planned_order?}
GET    /wo?status=&item_id=&aging=&overdue=&short=       # workbench dataset (chips computed server-side)
GET    /wo/{id}                      # header + triple grid + operations + linked entries + peg
POST   /wo/{id}/submit               # explodes BOM → wo_items; status → not_started
POST   /wo/{id}/transfer             # → Module 5 stock entry purpose=transfer_for_manufacture
POST   /wo/{id}/produce              # → manufacture entry (payload below)
POST   /wo/{id}/return-components    # {lines:[{item_id, qty, batch_no?}]} → purpose=return_components
POST   /wo/{id}/stop                 # {reason}          POST /wo/{id}/resume
POST   /wo/{id}/cancel               # guarded: 409 with entry list if ledger effects not reversed
GET    /wo/{id}/entries              # linked stock entries (from Module 5, joined)
```

**`POST /wo/{id}/transfer` — request:**
```json
{ "lines": [
    {"item_id": 1204, "qty": 100, "from_wh": "WH-RM-CBE",
     "batches": [{"batch_no": "VMA-LTB2-0619", "qty": 100}]}
  ],
  "posting_dt": "2026-07-10T09:12:00+05:30" }
```
Response `201`: `{stock_entry_id, wo_status: "in_process", triple: [{item_id, required, transferred, consumed}]}`

**`POST /wo/{id}/produce` — request (the golden-path payload, scrap + process loss):**
```json
{ "qty_good": 80,
  "process_loss_qty": 15,
  "scrap": [
    {"item_id": 1912, "item_code": "CAST-REJ-IMP", "qty": 5,
     "warehouse": "WH-SCRAP-CBE", "rate": 150.00}
  ],
  "consumption_mode": "per_bom",
  "consumption_overrides": [],
  "consume_batches": [
    {"item_id": 1204, "batch_no": "VMA-LTB2-0619", "qty": 100}
  ],
  "fg_batch": {"auto": true},
  "posting_dt": "2026-07-13T14:20:00+05:30",
  "remarks": "Shift A — borewell-profile lot, high burn"
}
```
Response `201`:
```json
{ "stock_entry_id": 88412,
  "fg_batch_no": "IMP-B-260713-01",
  "wo_status": "completed",
  "consumed": [{"item_id": 1204, "qty": 100, "from_wh": "WH-WIP-CBE"}],
  "received": [{"item_id": 1101, "qty": 80, "to_wh": "WH-FG-CBE", "unit_cost": 965.63}],
  "scrap_received": [{"item_id": 1912, "qty": 5, "to_wh": "WH-SCRAP-CBE", "value": 750.00}],
  "process_loss": {"qty": 15, "absorbed_value": 11700.00,
                   "deviation_vs_plan_pct": 10.0, "alert": "loss 15% vs planned 5%"},
  "qi": {"required": true, "qi_no": "QI-2026-0210", "fg_hold": "quarantine until accepted"} }
```
Errors: `422` produce > transferred-available (math in body) · `409` policy=blocked over-consumption · `422` missing batch on tracked item · `423` stock period locked.

### 10.3 Job cards & workstations
```
POST   /jobcard                      # {wo_id, operation_seq, workstation_id, worker_id}
POST   /jobcard/{id}/start           # timestamps; 409 if another running card on the workstation (config)
POST   /jobcard/{id}/complete        # {qty_ok, qty_rejected, process_loss_qty, reject_reason?}
GET    /jobcard/my-machine?ws=       # operator view dataset
GET    /workstations                 # + /workstations/{id}/load  (booked vs available hours — display only)
```

### 10.4 Production-Plan-lite
```
POST   /plan                         # {demand_source, sales_order_ref? | lines:[{item_id, qty, need_date}]}
POST   /plan/{id}/calculate          # single-pass shortage calc → tree payload (idempotent re-run)
GET    /plan/{id}                    # tree: per node {required, projected, shortage, classification}
PATCH  /plan/{id}/lines/{line_id}    # override make/buy/subcontract classification
POST   /plan/{id}/emit               # → {work_orders[], material_requests[], sco_drafts[]} — never double-emits
-- all four endpoints return 409 {"detail":"planning_engine=module3","see":"/api/v1/planning"} when superseded
```

### 10.5 Job work
```
POST   /sco                          # {supplier_id, service_item_id, fg_item_id, qty, components[], expected_return}
GET    /sco?supplier_id=&status=     # job-work board dataset (incl. ageing bars from Module 5 register)
POST   /sco/{id}/send                # {lines:[{item_id, qty, batches[]}], transporter?, vehicle_no?}
                                     # → Module 5 entry purpose=send_to_subcontractor + challan draft (Rule 55 fields)
                                     # inter-state → response includes eway_required=true + portal-pastable export URL
POST   /sco/{id}/receive             # {qty_received, qty_rejected, scrap_at_jobworker_qty,
                                     #  challan_refs:[{challan_no, qty_against}], qi?: bool}
POST   /sco/{id}/close               # 409 unless components reconcile (V-PRD-12)
GET    /sco/{id}/challans            # outward challans + balances (from Module 5 register)
GET    /itc04?from=&to=&format=xlsx  # Tables 4/5 export with original-challan back-references
GET    /challan-ageing?state=amber|deemed_supply
```

**`POST /sco/{id}/send` — request/response (challan + virtual-warehouse move in one call):**
```json
{ "lines": [
    {"item_id": 1101, "qty": 100,
     "batches": [{"batch_no": "IMP-B-260618-02", "qty": 100}]}
  ],
  "transporter": "Sri Ganapathy Lorry Service", "vehicle_no": "TN-38-BQ-4471",
  "remarks": "Electro-nickel plating, borewell spec EN-12" }
```
```json
{ "stock_entry_id": 88377, "challan_no": "DC-2026-0071",
  "challan_pdf": "/print/challan/DC-2026-0071",
  "eway": {"required": true, "reason": "intra-state value ₹1,49,500 > TN threshold ₹1,00,000",
           "export_url": "/export/eway/DC-2026-0071"},
  "virtual_wh_balance": {"item_id": 1101, "qty": 100, "value": 149500.00} }
```

### 10.6 Quality & rework
```
GET    /qi?result=pending&ref_type=          POST /qi/{id}/record   # {readings[], result, sample_size}
POST   /rework/from-batch                    # {batch_id, qty, bom_id?} → rework WO (is_rework, input=rejected FG)
POST   /reject/{batch_id}/scrap-decision     # {reason} → scrap-warehouse move at scrap value
GET    /reject-queue                         # rejected-warehouse stock with age + source links
```

### 10.7 Reports, KPIs & genealogy
```
GET    /reports/monthly-account?month=2026-06         # Rule 56(12) view + ?format=xlsx
GET    /kpis?from=&to=               # {oee, fpy, scrap_rate, schedule_adherence, wip_value, trends[]}
GET    /trace?batch=IMP-B-260713-01&direction=forward|backward   # genealogy chain (nested)
GET    /trace?grn_batch=VMA-LTB2-0619&direction=forward          # supplier-lot recall entry point
```

### 10.8 Events (internal bus — Redis Streams)

Mirrors `PLANNING.md` §10.8; consumer groups per module; events are transport-agnostic contracts.

| Event | Producer → Consumer | Effect |
|---|---|---|
| `prod.bom.submitted` | Production → Planning, SMBD | BOM available for netting/quoting; Module 3 LLC recompute if structure changed |
| `prod.wo.released` | Production → Planning, Inventory | reservations/kitting visibility; Module 3 scheduled-receipt refresh |
| `prod.wo.produced` | Production → Planning, Inventory, Accounts-stub | FG receipt as supply; **net-change replan trigger**; posting event (Dr FG / Cr WIP) |
| `prod.wo.completed` / `prod.wo.stopped` | Production → Planning, SMBD | adherence stats; on-time-delivery feed; demand peg closure |
| `prod.wo.deviation` | Production → Planning | scrap/loss > plan or consumption ≠ BOM → replan + alert |
| `prod.plan.emitted` | Production → Purchase | MR + SCO drafts appear in Module 4 worklists |
| `prod.sco.sent` | Production → Inventory, Purchase | challan registered (M5); service-PO linkage nudge (M4) |
| `prod.sco.received` | Production → Purchase, Planning | invoice matching enabled; supply arrival for netting |
| `prod.qi.failed` | Production → Quality-consumers, Planning | reject-queue entry; supply shortfall replan trigger |
| `eng.eco.applied` *(consumed)* | Engineering → Production | hydrate draft BOM vN+1 with `source_mbom_ref`; banner on open WOs |
| `so.confirmed` *(consumed)* | SMBD → Production | demand line available to Production-Plan-lite (when engine=lite) |

---

## 11. Backend Logic

Module services live in `services/production/` (Python 3.12, FastAPI, `default` Celery queue for reports/exports). Pure-function cores with thin I/O shells — every algorithm below is testable without a database, and the golden fixtures in §16 are hand-computed against these exact specs.

### 11.1 Multi-level BOM explosion (recursive CTE)

Quantity multiplication and UoM conversion at every level; `use_multi_level_bom` decides whether sub-assembly nodes expand or are consumed as items.

```sql
WITH RECURSIVE explode AS (
  SELECT bl.component_item_id, bl.sub_bom_id,
         (bl.qty_per / b.qty) * :wo_qty * bl.conversion_factor
           * (1 + bl.scrap_pct/100.0)                    AS req_qty,   -- line scrap gross-up (planning parity, §11.6)
         bl.uom, 1 AS level, ARRAY[b.bom_id] AS path
  FROM   boms b JOIN bom_lines bl USING (bom_id)
  WHERE  b.bom_id = :root_bom_id
  UNION ALL
  SELECT bl.component_item_id, bl.sub_bom_id,
         e.req_qty * (bl.qty_per / b.qty) * bl.conversion_factor
           * (1 + bl.scrap_pct/100.0),
         bl.uom, e.level + 1, e.path || b.bom_id
  FROM   explode e
  JOIN   boms b       ON b.bom_id = e.sub_bom_id          -- descend only through sub-assembly links
  JOIN   bom_lines bl USING (bom_id)
  WHERE  e.sub_bom_id IS NOT NULL
    AND  e.level < 20                                     -- depth guard
    AND  NOT b.bom_id = ANY(e.path)                       -- cycle guard (belt; V-PRD-02 is braces)
)
SELECT component_item_id, uom, sum(req_qty) AS total_required, min(level) AS top_level
FROM   explode
WHERE  :multi_level = FALSE OR sub_bom_id IS NULL         -- leaf components only when exploding fully
GROUP  BY 1, 2;
```

Where-used is the same CTE inverted (join on `component_item_id`, ascend through parents). Both are exposed as `/bom/{id}/tree` and `/bom/where-used`.

### 11.2 Cost roll-up

```python
def rollup(bom, basis) -> BomCost:
    line_cost = 0
    for l in bom.lines:
        if l.sub_bom_id:                                  # bottom-up: children first (memoized)
            rate = rollup(get_bom(l.sub_bom_id), basis).unit_cost
        else:
            rate = valuation_rate(l.component_item_id) if basis == 'valuation' \
                   else last_purchase_rate(l.component_item_id)      # Module 5 / Module 4 lookups
        line_cost += l.qty_per * l.conversion_factor * rate
    op_cost      = sum(o.setup_min/bom.qty + o.run_min_per_unit
                       for o in bom.operations) and \
                   sum((o.setup_min/bom.qty + o.run_min_per_unit) * (o.hourly_rate or ws_rate(o))/60
                       for o in bom.operations)
    scrap_credit = sum(s.qty_per * s.rate for s in bom.scrap_items)
    # planned process loss inflates unit cost: good units carry the loss (same law as §11.4 actuals)
    unit_cost = (line_cost + op_cost - scrap_credit) / bom.qty / (1 - bom.process_loss_pct/100.0)
    return BomCost(unit_cost=round(unit_cost, 2), as_of=now(), basis=basis)
```

Stored on `boms.rolled_cost`; submitted BOMs are never re-rolled in place (display-only recompute for drafts/what-ifs).

### 11.3 Derived WO status machine

Status is a **pure function of quantities and entries** — no endpoint sets it:

```python
def derive_status(wo) -> str:
    if wo.explicit_state in ('stopped', 'cancelled'):        return wo.explicit_state
    if wo.status == 'draft' and not wo.submitted:            return 'draft'
    produced_total = wo.qty_produced + wo.qty_process_loss
    if produced_total >= wo.qty_planned:                     return 'completed'   # tolerance via overproduce_pct
    if produced_total > 0:                                   return 'in_process'
    if any(li.transferred_qty > 0 for li in wo.items):       return 'in_process'
    return 'not_started'
```

| Event | From → To | Side effects |
|---|---|---|
| submit | draft → not_started | explode BOM → `wo_items`; availability chips computed; `prod.wo.released` |
| first transfer / produce | not_started → in_process | `actual_start` stamped |
| produce reaching planned (± tolerance) | in_process → completed | `actual_end`; `prod.wo.completed` |
| stop(reason) | any active → stopped | further entries blocked; return-components offered |
| resume | stopped → derive() | re-derives from quantities |
| cancel | any, guarded | 409 unless all linked entries reversed; exact ledger restoration asserted (TC-MFG-03) |

### 11.4 Manufacture-entry math (the golden path)

One atomic entry, four effects — consume WIP, receive FG, receive scrap, absorb process loss:

```python
def produce(wo, qty_good, loss_qty, scrap_lines, overrides, batches):
    out_total = qty_good + loss_qty                       # scrap ITEMS are separate outputs, not FG units
    # 1) consumption: BOM-proportional prefill, overridden per consumption_policy
    for li in wo.items:
        plan_consume = li.required_qty * out_total / wo.qty_planned
        actual = overrides.get(li.item_id, plan_consume)
        enforce_policy(wo.consumption_policy, actual, plan_consume)   # blocked | allowed | warn (+deviation event)
        assert_available(li, actual)                      # consumed+returned ≤ transferred (V-PRD-06)
        consume(li, actual, from_wh=wo.wip_wh_id, batches=batches[li.item_id])
    # 2) cost pool = value actually consumed (batch-valuation from Module 5)
    pool = sum(consumed_value)                            # ₹, exact ledger values, not BOM estimates
    # 3) scrap receipts: real valued stock into scrap warehouse; value credits the pool
    for s in scrap_lines:
        receive(s.item_id, s.qty, to_wh=wo.scrap_wh_id, rate=s.rate)
        pool -= s.qty * s.rate
    # 4) FG receipt: good units absorb the whole remaining pool — process loss has NO stock row
    unit_cost = pool / qty_good
    fg_batch  = new_batch(wo.item_id) if tracked(wo.item_id) else None
    receive(wo.item_id, qty_good, to_wh=wo.target_wh_id, rate=unit_cost, batch=fg_batch,
            parents={b for lines in batches.values() for b in lines})     # genealogy edge
    wo.qty_produced += qty_good; wo.qty_process_loss += loss_qty
    emit('prod.wo.produced', ...); maybe_open_qi(wo, fg_batch)
```

**Worked example — the produce-80-of-100 golden fixture (hand-computed, = TC-MFG-01 and demo WO-2026-0158):**

WO for 100 × IMPELLER-KV50; BOM v2: 1 × CI-CASTING-IMP per unit (₹780 valuation), scrap item CAST-REJ-IMP @ ₹150, planned process loss 5%. Transferred to WIP: 100 castings (batch VMA-LTB2-0619).

| Step | Math | Ledger effect |
|---|---|---|
| Produce entry | qty_good 80, process_loss 15, scrap 5 → out_total 95 → consume 100 × 95/100 ≈ 95… **override to 100** (policy `warn`, actuals rule the floor) | consume 100 CI-CASTING-IMP from WH-WIP-CBE (−₹78,000.00) |
| Cost pool | 100 × ₹780 = **₹78,000** | |
| Scrap receipt | 5 × ₹150 = ₹750 credit → pool ₹77,250 | +5 CAST-REJ-IMP into WH-SCRAP-CBE (+₹750.00) |
| FG receipt | ₹77,250 ÷ 80 = **₹965.63/unit** — the 15 lost units' cost is absorbed by the 80 good units (₹780 → ₹965.63, +23.8%) | +80 IMPELLER-KV50 batch IMP-B-260713-01 into WH-FG-CBE (+₹77,250.00) |
| Process loss | 15 units, **no stock row**; `qty_process_loss` 15; deviation 15% vs planned 5% → `prod.wo.deviation` | — |
| Post-state | WIP empties (0 castings); WO `in_process`? No: produced+loss = 95 < 100 → **in_process**, remaining 5 | ledger balanced: −78,000 + 750 + 77,250 = 0 ✓ |

(The §16 test asserts every row above to the paisa, then cancels the entry and asserts exact restoration. The WO is later short-closed at 95 via `stop` in the demo — an honest partial.)

### 11.5 Backflush / skip-transfer path

`skip_transfer = TRUE` ⇒ the produce entry consumes **directly from Source** (no WIP leg): same math as §11.4 with `from_wh = wo.source_wh_id`; `transferred_qty` is written equal to `consumed_qty` at produce time so the triple stays truthful. Company default in `prod_settings.default_skip_transfer`, per-WO override — mirroring ERPNext's settings + per-WO "Skip Material Transfer" and SAP B1/BC/Odoo per-item flushing granularity (per-item granularity is roadmap; the toggle is MVP).

### 11.6 Production-Plan-lite — single-pass shortage calc (idempotent)

```python
def calculate(plan):                                       # 409 if prod_settings.planning_engine == 'module3'
    demand = load_demand(plan)                             # SO lines or manual lines
    req    = explode_all(demand)                           # §11.1 per demand item, summed per component
    for item_id, required in req.items():
        projected = m5.projected_qty(item_id, plan.plant_id)   # on-hand + on-order − reserved (snapshot)
        shortage  = max(required - projected, 0)
        upsert_plan_line(plan, item_id, required, projected, shortage,
                         classification=item_master.make_buy_jobwork(item_id))
    # THE minimal MRP contract: Required = BOM Required − Projected Qty; one formula, one fan-out.

def emit(plan):
    for line in plan.lines.where(shortage_qty > 0):
        if line.emitted_ref:                               # ← idempotency: emitted lines are never re-emitted
            continue                                       #    re-runs reconcile against open emitted qty
        ref = {'work_order':       create_draft_wo,
               'material_request': m4.create_draft_mr,
               'subcontract_po':   create_sco_and_draft_po}[line.emit_type](line, peg=plan)
        line.emitted_ref, line.emitted_at = ref, now()     # UNIQUE(plan_id, item_id) anchors the guarantee
    emit_event('prod.plan.emitted', ...)
```

Re-running `calculate` refreshes `projected_qty` snapshots and shortage math; `emit` fans out **only** unemitted shortage lines — run twice on identical data ⇒ zero new documents (TC-PLN-02). Emitted drafts are ordinary documents; deleting one clears `emitted_ref` via FK-watcher so a re-run can legitimately re-emit.

### 11.7 Batch genealogy traversal

Genealogy = edges recorded at every manufacture/receipt: `(consumed_batch_set) → produced_batch`, riding Module 5's ledger `batch_id`s (no separate graph store).

```sql
-- Forward: supplier lot → every FG batch → dispatches ("which customers got parts from this copper lot?")
WITH RECURSIVE fwd AS (
  SELECT edge.child_batch_id, 1 AS hop, ARRAY[edge.parent_batch_id] AS path
  FROM   m5.batch_edges edge WHERE edge.parent_batch_id = :root_batch
  UNION ALL
  SELECT e.child_batch_id, f.hop+1, f.path || e.parent_batch_id
  FROM   fwd f JOIN m5.batch_edges e ON e.parent_batch_id = f.child_batch_id
  WHERE  f.hop < 10 AND NOT e.child_batch_id = ANY(f.path)
)
SELECT b.batch_no, b.item_id, d.customer_id, d.dispatch_no, d.dispatch_dt
FROM   fwd JOIN m5.batches b ON b.batch_id = fwd.child_batch_id
LEFT   JOIN m5.dispatch_lines d USING (batch_id);
```

Backward is the mirrored CTE (child → parents → GRNs → suppliers). Vendor-custody hops (virtual warehouse) appear as ordinary ledger moves, so the trace shows "at Sree Murugan 18-Jun → 12-Jul" without special casing (FR-PRD-053).

### 11.8 ITC-04 Tables 4 / 5 generation

```python
def itc04(period):                       # period = half-year (AATO > ₹5cr; due 25 Oct / 25 Apr) or annual, per config
    t4 = [ {'challan_no': c.challan_no, 'challan_date': c.dt, 'jobworker_gstin': c.gstin,
            'state': c.pos, 'items': [{'desc': l.desc, 'uom': l.uom, 'qty': l.qty,
            'taxable_value': l.value, 'goods_type': l.goods_type}]}                 # inputs | capital_goods
           for c in m5.jobwork_challans.dispatched_in(period) ]
    t5 = []
    for r in subcontract_receipts.received_in(period):
        for ref in r.challan_refs:       # THE back-reference: every receipt row names its original challan
            t5.append({'original_challan_no': ref.challan_no, 'original_challan_date': ref.date,
                       'jobworker_gstin': r.sco.supplier_gstin,
                       'nature': 'received_back',            # or 'supplied_from_jobworker_premises'
                       'qty_received': ref.qty_against,
                       'received_via': r.receipt_no,
                       'losses_and_wastes': allocate(r.scrap_at_jobworker_qty, ref)})
    assert reconciles(t4, t5, open_balances())               # Σ(sent) = Σ(received) + Σ(scrap) + open balance
    return xlsx(t4, t5)
```

The reconciliation assert is the feature: if Table 5 rows don't tie back to Table 4 challans plus open at-vendor balances, the export refuses with the diff — that is precisely the reconciliation CAs do by hand today.

### 11.9 Challan ageing → deemed-supply flip

```python
def sweep_challan_ageing():                                  # nightly job (Celery beat)
    for c in m5.jobwork_challans.open():
        clock_months = 36 if c.is_capital_goods else 12      # s.143: inputs 1y, capital goods 3y
        if c.is_mould_or_die:  continue                      # moulds/dies exempt from return requirement
        age = months_between(c.dispatch_dt, today())         # clock runs FROM DISPATCH DATE
        if   age >= clock_months:  c.state = 'deemed_supply' # taxable supply from dispatch date
        elif age >= cfg('challan.ageing.amber_months'):      # default 10
                                   c.state = 'amber'
        if c.state == 'deemed_supply' and not c.exposure_computed:
            c.exposure = c.taxable_value * gst_rate(c) * (1 + 0.18 * years_since_dispatch(c))
            alert(job_work_board, c); emit('prod.challan.deemed_supply', c)
```

Register and states are Module 5's; this sweep and the board surfacing are Module 6's. The 18% interest figure and thresholds come from `statutory_config`.

### 11.10 Rule 56(12) monthly aggregation

```python
def monthly_production_account(month):
    rows = query(v_monthly_production_account, month)        # consume / receive_fg / receive_scrap per item
    loss = work_orders.process_loss_in(month)                # waste with no stock rows — joined explicitly
    account = pivot(rows, loss, groups=['rm_consumed', 'goods_produced', 'waste_and_byproducts'])
    assert ties_to_ledger(account, month)                    # totals must equal stock-ledger sums (TC-RPT-01)
    return account                                           # view + XLSX; "provisional" until period close
```

Waste & by-products = scrap receipts (both in-house and scrap-at-jobworker) + process-loss quantities — exactly the Required/Transferred/Consumed triple plus scrap entries, which is why this statutory report is nearly free (M10).

### 11.11 KPI computation spec (FR-PRD-095 — formulas as implemented)

```python
def kpis(plant, frm, to):
    wos      = work_orders.completed_or_active_in(plant, frm, to)
    produced = sum(w.qty_produced for w in wos)
    # OEE simple form — no sensors: availability folded into planned production time
    ideal_cycle_min = {w: bom_run_minutes_per_unit(w.bom_id) for w in wos}      # Σ run_min_per_unit
    planned_time    = workstation_calendar_minutes(plant, frm, to)              # shifts − holidays
    oee   = sum(w.qty_produced * ideal_cycle_min[w] for w in wos) / planned_time
    # FPY — reworked units excluded from the numerator BY DEFINITION (M8)
    reworked = sum(w.qty_produced for w in wos if w.is_rework)
    failed_first_time = qi.rejected_qty(plant, frm, to)
    fpy   = (produced - reworked - failed_first_time) / max(produced - reworked, 1)
    scrap_rate = scrap_entries.qty(plant, frm, to) / max(produced + scrap_qty + loss_qty, 1)
    adherence  = len([w for w in wos if w.status=='completed' and w.actual_end.date() <= w.planned_end]) \
                 / max(len([w for w in wos if w.status=='completed']), 1)
    wip_value  = m5.warehouse_value(plant, type='wip')                          # free from the ledger
    return dict(oee=oee, fpy=fpy, scrap_rate=scrap_rate, adherence=adherence, wip_value=wip_value)
```

Materialized nightly per plant/period into a KPI snapshot table (dashboard reads < 1 s, FR-PRD-097); the baselining job (FR-PRD-096) freezes a snapshot at go-live for the before/after ROI story. Honesty rule: the dashboard renders the benchmark footnote (world-class 85% / typical ≈ 60% / more below 45% than above 85%) next to OEE — a 61% tile with context beats a fantasy 92%.

---

## 12. Frontend Components

React 18 + TypeScript; shadcn/ui primitives; TanStack Query (server state) + TanStack Table (grids); module component library `@ind-core/production-ui` (shares `@ind-core/charts` and the design-system KPI cards with Modules 1–5).

| Component | Description & key props |
|---|---|
| `<ProductionWorkbench>` | TanStack Table of WOs with server-computed chips; group-by status; row hover quick-actions (Transfer/Produce); filter presets. Props: `filters, onQuickAction`. SSE-refreshed on `prod.*` events (badge pulse, no full reload). |
| `<AvailabilityChip>` | 🟢/🟡/🔴 material chip; popover = per-component short list with MR/SCO deep links. Ledger-truth only — renders a stale badge if the Module 5 snapshot is > 60 s old. |
| `<BomTree>` | Recursive tree (virtualized past 200 nodes): qty × conversion per node, rolled-cost per subtree, sub-BOM expand, where-used flip. Props: `bomId, mode: 'tree'|'where-used', onNodeOpen`. Reuses Module 1's tree interaction idioms (same muscle memory as the MBOM editor). |
| `<BomVersionPanel>` | Version timeline (v1 grey/superseded → v2 default), diff chips, `source_mbom_ref` provenance banner, New-version / Set-default guarded actions. |
| `<WoTripleGrid>` | **The signature grid**: per-component Required / Transferred / Consumed / Returned + available-in-source; short rows tinted; cell-level deep links to entries. Live-updates transactionally after each post (TanStack Query invalidation on mutation success). |
| `<TransferDialog>` / `<ProduceDialog>` | Pre-filled, editable dialogs (§7.4). ProduceDialog composes `<ScrapSection>` (BOM prefill + ad-hoc rows), `<ProcessLossInput>` (deviation-vs-plan inline warning), `<BatchAllocator>` (FEFO suggestions from Module 5), `<ConsequenceSummary>` (the guarded-action pattern). Post button disabled until client-side validation matches server rules (shared Zod/Pydantic vocabulary). |
| `<JobCardStrip>` | Horizontal op cards with ▶/■, steppers, elapsed timer; `variant: 'wo' | 'my-machine'`; 4-tap completion; offline-tolerant (queued mutation with idempotency key). |
| `<ShortageTree>` | Plan-lite result tree: per-node Required/Projected/Shortage columns + make/buy/subcontract chips; emit bar with consequence summary. Hidden when `planning_engine=module3` (renders `<Module3Pointer>` instead). |
| `<JobWorkBoard>` | Vendor columns; `<ChallanAgeingBar>` per open challan (green/amber/red = deemed-supply with ₹ exposure tooltip); send/receive dialogs; ITC-04 export button with period picker. |
| `<ChallanAgeingBar>` | Horizontal age bar scaled to the 12/36-month clock; mould/die-exempt lines render hatched; the module's most India-specific visual. |
| `<RejectQueue>` | Ageing-tinted table + disposition dialogs (rework WO prefill / scrap decision with reason). |
| `<GenealogyGraph>` | Left-to-right batch DAG (SVG, dagre layout) + synchronized table twin; dashed vendor-custody segments; export chain. Props: `root, direction`. |
| `<KpiCards>` / `<ScrapPareto>` | Design-system KPI cards (big number, plain label, trend delta, sparkline) for OEE/FPY/scrap/adherence/WIP ₹; Recharts Pareto (bar+cumulative line) by item/operation/batch feeding §13.2. |
| `<Rule56View>` | Month picker + statutory table with ledger-tie badge; print stylesheet (A4); XLSX export. |
| `<AiAssistPanel>` | Shared "✦ AI" pattern (per `PLANNING.md` §12): proposal + evidence rows + language toggle EN/हिंदी; used by shift summary, scrap narrative, genealogy Q&A. Streams tokens; every answer renders citation chips that deep-link (§8). |

State conventions: server state via TanStack Query (query keys per plant; event-driven invalidation from the SSE bridge on `prod.*`); dialogs use local optimistic state with server-validated rollback; all mutations carry idempotency keys (NFR-PRD-07).

---

## 13. AI Features

Platform doctrine (identical to Module 3 §13): **numbers from deterministic models, language from the LLM — the LLM never invents quantities.** Every feature below runs Claude API **tool-use over read-only module APIs** (§10 GET endpoints only), must cite retrieved rows (refuse if no evidence), and renders in **English + Hindi** (Tamil next — Kaveri's floor). On-prem/DPDP tenants: deterministic template output ships first; LLM polish is a per-tenant switch (NFR-PRD-09).

> **Boundary note:** bottleneck prediction, ML forecasting, capacity/schedule optimization AI live in **Module 3** (`PLANNING.md` §13) — none of that is duplicated here. Module 6's AI narrates *execution* facts.

### 13.1 End-of-shift / end-of-day production summary (flagship)
Deterministic pass assembles the shift's facts: WOs touched (produced/started/stopped), quantities, scrap + process-loss vs plan, job-card times, QI results, job-work sends/receipts, aging flags. Claude writes the 6–8 line narrative a supervisor would WhatsApp the plant head — grounded on those rows only, EN/HI (worked example seeded at §20.15). One tap from the workbench at shift close; auto-drafted at 17:45, human sends.

### 13.2 Scrap-pattern narratives
Deterministic Pareto (scrap + process loss by item / operation / workstation / batch / supplier-lot, trailing 4 weeks) → Claude explains the top contributors in plain language with the evidence table attached ("62% of this month's impeller loss is on borewell-profile lots machined from Venkatramana lot VMA-LTB2-0619 — see 3 WOs"). Never proposes numeric process changes; flags patterns for humans.

### 13.3 WO delay-risk flags
Deterministic rule set: `in_process` with no stock movement ≥ N days; produced-rate vs remaining-time projection past `planned_end`; material short with no open MR/SCO. Each flagged WO gets an LLM-narrated one-liner on the workbench ("WO-2026-0154 has had no movement for 5 days and its casing kit is still short 8 — likely to miss 17-Jul") with citation chips. The *rules* flag; the LLM only phrases.

### 13.4 Conversational genealogy (EN/HI)
"Which customers got parts from this copper lot?" / **"इस लॉट से कौन से कस्टमर को माल गया?"** → tool-use over `/trace` → grounded answer listing FG batches, dispatches, customers as deep-linked chips, with the recall-pack export offered. Refuses when the batch has no trace rows. (Demo: the §20.13 Venkatramana bronze-lot drill.)

### 13.5 Job-work compliance digest
Weekly deterministic sweep (§11.9) → Claude drafts the digest for Finance/Procurement: challans nearing the s.143 1-year clock (amber list with days-to-deadline), any deemed-supply flips with computed exposure ₹, ITC-04 period countdown, at-vendor balances by vendor. Sent as notification + board banner; every number from the sweep, verbatim.

### 13.6 Rework root-cause summaries
For a rework WO cluster (same item/period), deterministic join of QI readings (failed parameters), operations, workstations, batches → Claude summarizes the common thread ("all 3 failed hydro-test on seal-face leakage; all consumed seal lot MS-25-0611") for the quality review meeting. Readings are quoted, never re-computed.

### 13.7 Produce-entry anomaly explainer (assist, not gate)
When a produce entry's deviation trips (loss ≫ plan, consumption ≠ BOM), the warning toast includes a "✦ why is this flagged?" explainer: the deterministic rule, the numbers, and the two most similar past deviations. Reduces warning-blindness without adding an approval step (the no-approval-matrix principle holds even for AI).

---

## 14. Security

### 14.1 Role-permission matrix (personas × actions per doctype)

✔ = allowed · view = read-only · — = hidden/403. **By design there is no approval matrix on Work Orders** — submission is the only gate (stock-ERPNext precedent, §1.1); the matrix below is *permission*, not *workflow*.

| Capability | Supervisor (Selvam) | Operator (Murugan) | Stores (Poongodi) | Planner (Meenakshi) | Plant Mgr (Karthikeyan) | QE (Meera) | Procurement (Anand) | Finance (CA) |
|---|---|---|---|---|---|---|---|---|
| BOM create/edit draft | ✔ | — | — | ✔ | ✔ | view | view | view |
| BOM **submit** / new version / set default | ✔ | — | — | ✔ | ✔ | — | — | — |
| WO create + **submit** | ✔ | — | — | ✔ | ✔ | — | — | view |
| WO **transfer** / return components | ✔ | — | ✔ | — | ✔ | — | — | — |
| WO **produce** (manufacture entry) | ✔ | ✔ (own workstation's WO, qty-only prefilled) | — | — | ✔ | — | — | — |
| WO stop / resume | ✔ | — | — | — | ✔ | — | — | — |
| WO **cancel** (ledger-guarded) | — | — | — | — | ✔ | — | — | — |
| Job card start/stop + qty entry | ✔ | **✔ (his cards only)** | — | — | ✔ | — | — | — |
| Plan-lite run / emit | — | — | — | ✔ | ✔ | — | view (MR/SCO queue) | — |
| SCO create / send (challan) | ✔ | — | ✔ (send entry) | ✔ | ✔ | — | ✔ | view |
| SCO receive (+scrap-at-jobworker) | ✔ | — | ✔ | — | ✔ | — | ✔ | view |
| QI record / disposition | — | — | — | — | view | **✔ (only role)** | — | view |
| Rework WO create / scrap decision | ✔ (rework) | — | — | — | ✔ | ✔ (disposition) | — | — |
| ITC-04 / Rule 56(12) / registers export | view | — | — | view | view | view | view | **✔** |
| Statutory config edit | — | — | — | — | ✔ | — | — | ✔ (rates) |
| KPI dashboard | ✔ | — | — | ✔ | ✔ | ✔ | view | ✔ |

Operators are deliberately limited to **job-card start/stop and a prefilled produce entry** on their own workstation's WO — the two events the floor will actually record (NFR-PRD-02).

### 14.2 Controls

- **JWT access (15 min) / refresh (7 d) with RBAC claims** enforced server-side per endpoint (FastAPI dependency); UI hides what the role can't do; plant-level data scoping in every query. Shared platform baseline.
- **Immutable audit log** (`prod_audit_log`, append-only, no UPDATE/DELETE grants) on every submit/produce/stop/cancel/send/receive/disposition — who, when, before/after (NFR-PRD-04).
- Posted documents immutable; cancel = compensating reversal, never edit; DB-level guards back the service checks (belt and braces).
- **Device-bound tokens for shop-floor tablets** (roadmap, Phase 2): token pinned to device + workstation scope, so a lost tablet exposes one machine's job cards, not the module. MVP: short-lived tokens + workstation-scoped operator role.
- Idempotency keys on all mutations (retry-safe floor Wi-Fi); rate limits on produce/transfer endpoints per user.
- AI endpoints: read-only tool scope, per-tenant isolation, citation-required answers; LLM disableable per tenant (DPDP posture, NFR-PRD-09); worker personal data (job cards) role-scoped and minimized in exports.

---

## 15. Validation

| ID | Rule |
|----|------|
| V-PRD-01 | **BOM edit blocked after submit** — content writes on a submitted BOM → 409 at API *and* trigger level; only `is_active`/`is_default` writable; versioning is the sanctioned path (cancel-and-duplicate). |
| V-PRD-02 | **Circular BOM guard** — `sub_bom_id` insertion creating a cycle rejected with the offending path (shared vocabulary with Module 1/Module 3 V-05). Explosion carries a belt-and-braces path check + depth cap 20. |
| V-PRD-03 | BOM line sanity — qty_per > 0; conversion_factor > 0; scrap_pct ∈ [0,100); process_loss_pct ∈ [0,100); UoM must exist; scrap rate ≥ 0. |
| V-PRD-04 | **WO qty vs BOM** — qty_planned > 0; WO must reference an active submitted BOM for its item (default suggested); rework WOs must name a rejected-FG source batch. |
| V-PRD-05 | Warehouse-type integrity — `wip_wh_id` must be a WIP-type warehouse; `scrap_wh_id` scrap-type; SCO `virtual_wh_id` subcontractor-type; sellable FG can only land in sellable warehouses (types from Module 5 master). |
| V-PRD-06 | **Produce ≤ transferred available** — per component, `consumed + returned ≤ transferred` (skip-transfer path: consumed ≤ source availability); produce qty (good + loss) ≤ planned × (1 + tolerance). Violation → 422 with the math. |
| V-PRD-07 | **Over/under-consumption per `consumption_policy`** — `blocked`: consumption ≠ BOM-proportional → 409; `allowed`: any; `warn`: accepted + logged deviation + `prod.wo.deviation` event. One enum, no workflow. |
| V-PRD-08 | **Batch mandatory when `item.tracking_mode = batch`** — every consume/receive line of a tracked item carries batch allocations summing to line qty; FG auto-batch on tracked outputs; genealogy edge recorded atomically with the entry. |
| V-PRD-09 | Status machine integrity — no direct write to `work_orders.status`; stopped WOs reject stock entries; cancel requires zero net ledger effect (entry list returned otherwise). |
| V-PRD-10 | **FG failing QI cannot reach a sellable warehouse** — QI-pending FG sits in quarantine; `rejected` result forces Rejected-warehouse routing; only `accepted` (or rework-then-accepted) stock may move to sellable. Enforced on the ledger call, not just UI. |
| V-PRD-11 | Challan integrity — serially numbered ≤ 16 chars per FY, gapless; Rule 55 mandatory fields present before print; inter-state movement requires e-way acknowledgment (regardless of value); challan lines flag capital-goods and mould/die status for the s.143 clocks. |
| V-PRD-12 | **SCO receipt reconciliation** — each receipt's `challan_refs` allocations must not exceed the referenced challans' open balances; `received + rejected + scrap_at_jobworker` per SCO ≤ sent (per component via qty_per); SCO close requires full reconciliation or an explicit written-off remainder (audited). |
| V-PRD-13 | Plan-lite integrity — calculate/emit → 409 when `planning_engine = module3`; emit only lines with shortage > 0 and no `emitted_ref`; classifications restricted to the item's allowed make/buy/jobwork set. |
| V-PRD-14 | **Statutory rates from config, never code** — scrap HSN/GST %, RCM applicability, GST-TDS 2%/₹2.5 lakh, income-tax TCS (single-source caveat recorded), ITC-04 periodicity, e-way thresholds, ageing thresholds all resolve from `statutory_config` effective-dated rows; a missing config row fails loud, no silent defaults. |
| V-PRD-15 | Posting-period lock — entries into a closed Module 5 stock period → 423; backdating role-gated within the open period. |

---

## 16. Testing

Golden fixtures are **hand-computed first, then encoded** — the engine must reproduce the human math, not vice versa. The WO→stock-entry path carries the module's highest test budget (NFR-PRD-01).

### 16.1 BOM (TC-BOM-01…05)
- **TC-BOM-01 — 3-level explosion:** the §20.5 BOM (PUMP-KV50 → IMPELLER-KV50 sub-assembly → CI-CASTING-IMP; SS-SHAFT-ROD 0.6 m/pump with UoM conversion) explodes for 24 pumps with correct **multiplied quantities and converted UoMs** — hand table asserted node-by-node, incl. line-scrap gross-up parity with Module 3's netting (24 impellers → 25 castings at 5%).
- **TC-BOM-02 — submitted-BOM edit impossible via API:** every content mutation (header PATCH, line POST/PATCH/DELETE, scrap, ops) on a submitted BOM → 409; direct SQL blocked by trigger (tested via app role).
- **TC-BOM-03 — v2 default without touching v1:** new-version copy → submit → set default: v1 rows byte-identical before/after (checksum), `uq_bom_default` holds, historical WO on v1 still costs against v1.
- **TC-BOM-04 — cost roll-up:** hand-computed roll-up incl. sub-BOM memoization, op minutes × rates, scrap credit, process-loss divisor; matches to the paisa.
- **TC-BOM-05 — cycle guard:** inserting a line making IMPELLER's BOM reference PUMP's BOM → 422 with path `PUMP → IMPELLER → PUMP`.

### 16.2 Work order & moves (TC-WO / TC-MFG)
- **TC-WO-01 — triple bookkeeping:** partial transfer 60, produce 30, transfer 40, produce 50, return 10, produce 15 — triple sums and derived status asserted after every step.
- **TC-WO-02 — no direct status writes:** API surface contains no status setter; forced UPDATE via app role rejected by trigger.
- **TC-MFG-01 — THE golden fixture (produce 80 of 100 with 5 scrap + 15 process loss):** exactly §11.4's worked table — WIP empties, FG batch created with unit cost **₹965.63** absorbing the loss, scrap warehouse +5 @ ₹150, ledger nets to zero, deviation event fired, WO remains `in_process` at 95/100. **Hand-computed reference, asserted to the paisa.**
- **TC-MFG-02 — over-consumption per policy:** same fixture with consumption override 110: `blocked` → 409; `allowed` → posts; `warn` → posts + deviation row + event. Under-consumption mirror-tested.
- **TC-MFG-03 — exact ledger reversal on cancel:** cancel the golden entry → every ledger row (qty, value, batch, warehouse) restored to pre-entry state; genealogy edge removed; triple decremented; audit rows for both post and reversal.
- **TC-MFG-04 — transfer & batch:** FEFO suggestion honoured; split-batch transfer (60+40 across two lots) preserved through consumption.
- **TC-MFG-05 — skip-transfer/backflush:** same golden math consuming direct from Source; no WIP rows; triple shows transferred = consumed.

### 16.3 Production-Plan-lite (TC-PLN)
- **TC-PLN-01 — make/buy/subcontract split:** fixture demand 24 PUMP-KV50 with partial stock (§20.11) yields exactly the expected WO/MR/SCO-draft set — quantities hand-netted (`Required − Projected`).
- **TC-PLN-02 — idempotent re-run (no double-emit):** calculate + emit twice on identical data → second emit creates **zero** documents; deleting an emitted MR then re-running legitimately re-emits exactly one.

### 16.4 Job work (TC-JW)
- **TC-JW-01 — send/receive reconciliation:** send 100 impellers to the plating vendor → virtual-warehouse balance 100; receive 95 + 3 scrap-at-jobworker + 2 rejected with `challan_refs` → virtual wh 0, accepted wh +95, SCO closes, **Table 5 rows reconcile to the original challan DC-2026-0071** (qty allocation asserted).
- **TC-JW-02 — deemed supply:** fixture challan aged 13 months → nightly sweep flips state to `deemed_supply`, renders red with exposure ₹ (GST + 18% interest from dispatch date); 10-month challan renders amber; a mould/die line is exempt from the sweep.
- **TC-JW-03 — ITC-04 export:** demo period export reproduces the challan register row-for-row; the reconciliation assert fails loud on a deliberately unbalanced fixture.
- **TC-JW-04 — inter-state e-way prompt:** SCO send to a Bengaluru vendor (inter-state) without e-way acknowledgment → blocked regardless of value; intra-state under threshold → no prompt.

### 16.5 Quality & rework (TC-QC)
- **TC-QC-01 — QI gate:** FG failing QI cannot reach the sellable warehouse (attempted move → 403/422); lands in Rejected warehouse via disposition.
- **TC-QC-02 — rework restores, FPY excludes:** rework WO consumes the rejected batch, passes QI, FG re-enters sellable stock with lineage to the reworked batch; **FPY calculation provably excludes reworked units** (fixture: 100 produced, 8 failed, 6 reworked-OK → FPY 92%, not 98%).
- **TC-QC-03 — shared doctype:** Module 4 GRN QI and Module 6 manufacture QI coexist; `UNIQUE(ref_type, ref_id)` blocks double gates.

### 16.6 Genealogy (TC-GEN)
- **TC-GEN-01 — edge creation:** every produce of a tracked FG records the consumed-batch set → FG batch edge atomically (crash-test: entry and edge commit or roll back together).
- **TC-GEN-02 — recall drill both directions:** §20.13 fixture — forward from supplier lot VMA-LTB2-0619 reaches 2 impeller batches, 2 pump batches, 2 dispatches/customers; backward from a dispatched pump batch reaches the same lot + Lakshmi Steels shaft lot; vendor-custody hop rendered.

### 16.7 Statutory reports (TC-RPT)
- **TC-RPT-01 — Rule 56(12) ties to ledger:** fixture month's account (consumed / produced / waste incl. process loss and scrap-at-jobworker) equals stock-ledger sums exactly; a seeded 1-unit ledger discrepancy makes the tie-badge fail loud.

### 16.8 Non-engine
API contract tests (OpenAPI schema-driven); RBAC matrix tests per §14.1 (every — cell → 403); idempotency-key replay tests on produce/transfer (same key → same result, one entry); Playwright E2E of the supervisor loop (workbench → release → transfer → produce-with-scrap → job-work receive → EOD summary) and the operator 4-tap job card; load test: 50 concurrent produce posts hold p95 < 1.5 s (NFR-PRD-05); print snapshots for challan/register PDFs (Rule 55 fields present).

---

## 17. MVP Scope

### 17.1 Must-have — the minimum coherent loop (M1–M11)

| # | Feature | Justification |
|---|---|---|
| M1 | **Multi-level production BOM** — components (item, qty, UoM + conversion factor), scrap items + process-loss %, costing off valuation/last-purchase rate, **immutable after submit** (cancel-and-duplicate, is_active/is_default) — §4.A | Table stakes ×6 vendors; immutability = auditable historical costing; **UoM on BOM lines is a verified gap** (buy kg, consume per-piece/metre) |
| M2 | **Work Order** — item, qty, BOM ref, planned start/end, Source/WIP/Target/Scrap warehouses, Required Items triple (Required/Transferred/Consumed), **3–4 derived states** (draft → in_process → completed, + stopped/cancelled), no approval matrix — §4.B | ERPNext minimal set; derived statuses; stock ERPNext has no WO approvals |
| M3 | **Two stock moves via Inventory's ledger**: Transfer for Manufacture (Source→WIP) and Manufacture (consume WIP + receive FG + scrap in one entry); partial quantities; Return Components reversal; **skip-transfer/backflush toggle** — §4.C | The universal execution core — and the most heavily tested code in the demo (post-mortem evidence) |
| M4 | **Scrap + process-loss capture at completion** — scrap → scrap warehouse as real valued stock; process loss reduces good qty with cost absorbed into remaining units — §4.D | ERPNext/Odoo semantics; feeds Rule 56(12) + scrap KPIs |
| M5 | **Batch genealogy through production** (verified gap): consume RM by batch on issue; auto-create FG batch at Manufacture; forward/backward trace (supplier lot → FG batch → dispatch) — §4.E | Base-tier in ERPNext; OEM customers of a precision maker expect lot-level complaint tracing; schema decided in Module 5 — this module completes the chain |
| M6 | **Single-pass shortage calculation** (Production-Plan-lite): demand → multi-level explosion → `Required = BOM Required − Projected` → emit **WOs + MRs (+ SCO drafts)**; **superseded by Module 3 when installed** — §4.F | The minimal MRP contract; defines the Purchase↔Production boundary; the M3 deferral keeps one planning engine per plant |
| M7 | **Job work (subcontracting), free-issue variant**: SCO → Send to Subcontractor (challan print, Rule 55 fields, e-way prompt) → virtual warehouse → Subcontract Receipt (**scrap-at-jobworker qty**) → service PO/Invoice on Module 4; **ITC-04 Tables 4/5 export with original-challan back-reference** — §4.G | Essential, not advanced, for this client profile; six-document ERPNext chain simplified to four |
| M8 | **Rework/reject path** (verified gap): FG failing final inspection → rejected warehouse → **rework WO consuming the rejected FG as input** or explicit scrap decision — §4.D | Without it FPY is unmeasurable; ERPNext itself lacks first-class rework (open issue) — a simple explicit path beats their manual workaround |
| M9 | **Quality inspection hooks** (verified gap): QI doc (template, sample, readings, accept/reject) at final Manufacture and subcontract receipt, behind `item.inspection_required` — same doctype Purchase uses at GRN — §4.H | Table stakes for precision components; generates the FPY numerator |
| M10 | **Rule 56(12) monthly production account** — RM consumed + goods produced + waste/by-products per month — §4.J | Statutory, and nearly free from data already captured |
| M11 | **Scope guard: MTS + simple MTO only** — no CTO/ETO configurator logic | Complexity index **MTS 65 / MTO 78 vs CTO 85 / ETO 92** — scoping keeps the pilot at the low end of the 73%-failure risk curve |

### 17.2 Should-have (demo-strengthening, still cheap)

| Feature | Note |
|---|---|
| Simplified job cards per operation + workstation master with **load display** (no scheduler) — §4.I | Labour capture + scrap-at-operation + HR/QC touchpoints in one optional document; routing never forced (NetSuite tier-2 evidence) |
| Odoo-style consumption enum surfaced in settings/per-WO | One enum instead of approval workflows (shipped in M3 core; the *setting UI* is the should-have) |
| KPI dashboard from WO data alone — §4.K | On-time completion, cycle time, scrap, FPY, adherence, simple-form OEE at an honest 50–70% |
| E-way-pastable challan export; subcontractor rate cards (Purchase side) | Compliance convenience; SCO defaulting |
| BOM version compare; produce-anomaly explainer (§13.7) | Cheap on the existing data |

### 17.3 Explicitly deferred (vendor precedent — see §18)

Finite/constraint scheduling, Gantt, MPS (**Module 3's, never here**) · tablet MES/shop-floor app, OEE control panels, downtime entry · full WIP GL accounting · BOM certification workflows, production versions, phantom/kit/sales BOM types, unbuild/disassembly, by-product costing · time-phased multi-horizon MRP, capacity-constrained planning (Module 3) · approval matrices anywhere · native e-way bill API, Factories Act form rendering (raw exports instead) · **inward job work — open scope question, confirm with the pilot before building** (Appendix B Q1).

### 17.4 Build phases F1–F6 (with acceptance criteria)

> **Prerequisite gate:** Module 5 (Inventory) phases **I1–I3 shipped** and the client's opening stock loaded — the 95–99% accuracy argument; Production stays OFF until the accuracy gate is met. Module 4 (Purchase) **P1–P3 recommended** (GRN feeds the RM batches genealogy starts from).

| Phase | Scope | Acceptance criteria |
|---|---|---|
| **F1 — BOM** | `boms`/`bom_lines`/`bom_scrap_items`(+ops) + editor + tree/where-used; recursive-CTE explosion; UoM conversion on lines; immutability + versioning (cancel-and-duplicate, default selection); cost roll-up | A 3-level BOM (pump → impeller sub-assembly → casting) explodes with correct multiplied quantities and converted UoMs; editing a submitted BOM is impossible via API; v2 becomes default without touching v1 history (TC-BOM-01…05) |
| **F2 — Work Order + the two moves (the core loop)** | `work_orders`/`wo_items` + derived-status machine; transfer-to-WIP (pre-filled, batch pick, partials); manufacture entry (consumption policy, FG auto-batch, scrap → scrap wh, process-loss math); return-components; skip-transfer toggle | **The most heavily tested path:** produce 80 of 100 with 5 scrap + 15 process loss → WIP empties, FG batch created, scrap wh +5, unit cost of the 80 absorbs the loss; over-consumption blocked/warned per policy; every ledger effect reverses exactly on cancel. **Golden fixtures hand-computed** (TC-MFG-01…05) |
| **F3 — Production-Plan-lite** | `production_plans` + shortage calc (explode − projected from Module 5); emit WOs/MRs/SCO drafts with demand links; Module-3 deferral switch | Fixture with partial stock yields exactly the expected make/buy/subcontract split; re-running the plan doesn't double-emit (TC-PLN-01/02) |
| **F4 — Job work + statutory** | `subcontract_orders` + send flow (Rule 55 challan print, inter-state e-way prompt) into virtual warehouse; receipts (accepted/rejected/scrap-at-jobworker) + challan back-references; ITC-04 Tables 4/5 export; ageing on the board (register from Module 5) | Send 100 to the plating vendor → virtual-wh balance 100; receive 95 + 3 scrap + 2 rejected → balances and Table 5 rows reconcile to the original challan; a 13-month-old open challan renders red (TC-JW-01…04) |
| **F5 — Quality, rework, job cards** | `quality_inspections` + gates at Manufacture and subcontract receipt; rejected-FG path → rework WO or scrap decision; optional job cards + workstation load view | FG failing QI cannot reach the sellable warehouse; a rework WO restores it after passing; FPY excludes reworked units by definition (TC-QC-01…03) |
| **F6 — Reports & KPIs** | Rule 56(12) monthly account; KPI tiles (OEE simple form, FPY, scrap, adherence, WIP value); genealogy report; AI summaries (§13.1/13.2) | Monthly account totals tie to the ledger for the fixture month; the trace query answers "which customers got parts from this copper lot?" in one call (TC-RPT-01, TC-GEN-02) |

### 17.5 Demo script beats (investor demo, ~12 min)

1. **BOM tree** of a real pump with rolled-up cost (v1 superseded, v2 default — the version story in one glance).
2. **Plan against a sales order** → watch it split into make / buy / send-to-plating (the fan-out is the integration).
3. **Run the WO**: transfer, produce partial with scrap — WIP and FG move live on the Inventory ledger screen.
4. **Job-work board**: material sitting at the plating vendor, one challan going amber (the s.143 clock made visible).
5. **Batch recall drill**: supplier lot → every FG batch and customer it reached (forward), in seconds.
6. **Month-end**: Rule 56(12) account + ITC-04 export — *"the two registers your team compiles by hand today."*

### 17.6 Anti-goals & risks

**Anti-goals (hard, by design):**
- **No scheduler.** Load display only. Finite scheduling is the best-documented enterprise-tier trap for a shop this size — and it is **Module 3's job** (`PLANNING.md` §4.G) when the customer grows into it. Module 6 never sequences anything.
- **No over-modeled routings.** Capture only events the floor will record (issue / produce / scrap) — post-mortems show over-modeled routings drive operators back to spreadsheets. Operations and job cards stay optional per WO, forever.
- **No approval matrices** — anywhere in the module. Submission and role permissions are the only gates (stock-ERPNext precedent).
- **No full WIP GL.** Quantity-WIP + posting events at completion; variance accounting deferred with NetSuite's 3-transaction model as the reference (§18).
- **No MPS / no time-phased MRP** here — Production-Plan-lite is single-pass by definition and steps aside for Module 3 (§1.2).

**Risks:**

| Risk | Mitigation |
|---|---|
| **BOM data quality** — wrong BOMs corrupt everything downstream; data migration causes 38% of ERP failures (beats over-customization at 23%) | CSV import with row-level errors + where-used + version history make correction cheap; Module 1's AI BOM extraction feeds clean masters where installed |
| **WIP drift** — produce entries skipped on the floor | Workbench ages WOs `in_process` with no movement N days (default 3); delay-risk AI narrates (§13.3); supervisor EOD loop closes the day |
| **Statutory rates drift** — the scrap-TCS change is single-sourced | All rates/section labels in `statutory_config` with source + verified-on notes (V-PRD-14); Appendix A provenance flags carried into the config seed |
| **Floor rejection** — transactions not matching floor practice | NFR-PRD-02 usability budget; produce path ≤ 3 decisions; operator surface 4 taps; Tamil/Hindi labels |
| **Scope creep toward CTO/ETO** | M11 scope guard cited in every triage: complexity index MTS 65 / MTO 78 / **CTO 85 / ETO 92** |

---

## 18. Future Roadmap

Staged, each item with the vendor precedent that justifies deferring it now:

| Phase | Timeline | Deliverables (vendor precedent) |
|---|---|---|
| **Phase 2 — Floor & depth** | +2 quarters | **Tablet MES / shop-floor app** with downtime entry (Odoo Shop Floor is Enterprise-only; Epicor MES an add-on; ERPNext added Plant Floor only in v15 atop the long-stable core); device-bound tablet tokens (§14.2); per-item backflush granularity (SAP B1/BC/Odoo parity); job-card labour costing into WO cost; BOM version compare++; e-way bill API integration; Tamil UI. |
| **Phase 3 — Costing & control** | +4 quarters | **Full WIP GL accounting** on **NetSuite's 3-transaction model** (issue / completion / close with variance reconciliation) as the reference; OEE panels fed by downtime + ideal-cycle masters; **BOM release/certification workflows and production versions** (BC + S/4HANA machinery — only if enterprise-ish customers demand); QI sampling plans (AQL). |
| **Phase 4 — Structure & edge cases** | +6 quarters | **Phantom/kit BOM types, unbuild/disassembly, by-product costing** (SAP B1 ships five BOM types; demand-driven only); **inward job work** — customer-material non-valuated warehouse, inward-challan register, service sales invoice — **pending pilot confirmation** (Appendix B Q1); Factories Act register *rendering* (data exports exist from MVP); multi-plant production transfer orders. |

Scheduling, MPS, capacity and their AI stay in **Module 3's roadmap** (`PLANNING.md` §18) — this module's roadmap deliberately contains no scheduler at any phase.

---

## 19. Technology Stack & Rationale

Aligned to the **IND-CORE shared platform baseline** (identical layer choices to `PLANNING.md` §19 and the other module blueprints); the rationale column below is **Module-6-specific**.

> **Supersession note:** the original research-summary plan framed a *FastAPI + SQLite + Next.js static export, single node* stack. That framing is **superseded** — Module 6 ships on the shared **PostgreSQL 16** platform baseline below. Every SQLite-specific assumption migrates: recursive CTEs and partial unique indexes are first-class in PostgreSQL; JSONB replaces JSON-as-text (`challan_refs`, QI readings); triggers enforce immutability at the DB; concurrent floor writes get real row locking instead of a single-writer file. (This is the only intentional SQLite mention in this document.)

| Layer | Choice | Module-6 rationale |
|---|---|---|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query/Table | One design system across modules — the supervisor moves between Module 5's stock screens and this workbench without relearning. TanStack Table virtualization carries the 2k-open-WO workbench and the triple grid; TanStack Query's event-driven invalidation keeps chips at ledger truth. |
| **Charts** | Recharts (trends/Pareto/sparklines) + ECharts (dense matrices) | Recharts covers Module 6's needs (KPI cards, scrap Pareto, adherence trend); ECharts reserved for the genealogy-adjacent dense views — both already wrapped in `@ind-core/charts`, zero new chart risk. |
| **Backend** | Python 3.12 + FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2 | Shared platform runtime; Pydantic v2 models are the single validation vocabulary mirrored to Zod (produce dialog client checks = server checks); Alembic migrations sequence the cross-module `stock_entries` purpose additions with Module 5. |
| **Database** | **PostgreSQL 16** + pgvector | **Recursive CTEs are the BOM engine** (§11.1 explosion, where-used, genealogy traversal); partial unique indexes enforce one-default-BOM; JSONB for `challan_refs`/QI readings with GIN indexing; triggers back immutability (NFR-PRD-04); pgvector serves the assistant's fuzzy lookups ("woh borewell impeller wala WO"). |
| **Jobs / async** | Redis + Celery (`default` queue; reports/exports/sweeps) | Module 6 has no long solver runs (that's Module 3's `mrp`/`scheduler` queues) — Celery here handles the nightly challan-ageing sweep (§11.9), ITC-04/Rule 56(12) exports, and AI digest jobs. Same broker, no new ops. |
| **Auth** | JWT access (15 min)/refresh (7 d) + RBAC claims, FastAPI dependencies | Shared platform auth; workstation-scoped operator role; device-bound tablet tokens on the Phase-2 path (§14.2). |
| **APIs** | REST (OpenAPI auto-gen) + internal event bus on **Redis Streams** | Typed client generation for the frontend; **the §10.8 event table is the module's integration spine** — `prod.wo.produced`/`prod.wo.deviation` feed Module 3's net-change replan triggers, `prod.plan.emitted` feeds Module 4 worklists, exactly as `PLANNING.md` §10.8 consumes them. |
| **Real-time** | **SSE** (workbench/board live updates) | One-way server-push fits Module 6 perfectly: **live WO-status and chip updates on the workbench** as entries post, job-work board refresh — SSE is simpler and proxy-friendly; no bidirectional need (no co-editing surface here). |
| **AI** | Anthropic Claude API — tool-use over read-only module APIs; deterministic engines (Pareto, ageing sweep, delay rules) compute every number | The platform doctrine verbatim: *numbers from deterministic models, language from the LLM — the LLM never invents quantities* (§13). On-prem/DPDP tenants degrade to templated deterministic output. |
| **Deployment** | Docker Compose (api, workers, postgres, redis, caddy, frontend) on a single VM; same compose on-prem; K8s only at multi-tenant SaaS scale | Matches the platform posture — single-VM demo, on-prem capable (DPDP), nightly encrypted backups, Prometheus/Grafana sidecar. Plant-floor reality: the compose stack runs on a ₹60k mini-server in the office rack if the customer wants zero cloud. |

### 19.1 Vendor comparison (distilled from the research base — Appendix A)

| Vendor | Manufacturing-core shape | What Module 6 takes / rejects |
|---|---|---|
| **ERPNext** | Five load-bearing doctypes (BOM, WO, Job Card, Production Plan, Workstation); BOM immutability via cancel-and-amend; Required/Transferred/Consumed triple; WIP-as-warehouse; scrap vs process loss split; no WO approvals | **The primary template.** Copy the core mechanics; fix its gaps (first-class rework, UoM-on-BOM-line ergonomics, ITC-04 back-reference discipline) |
| **Odoo** | MO Draft→Confirmed→In Progress→Done; scrap orders → virtual scrap location; **Flexible Consumption enum**; free/paid boundary = a published MVP scoping decision (MPS, WO scheduling, Shop Floor, quality, PLM are Enterprise-only) | Take the consumption enum and the scrap-location semantics; take the free/paid line as scope evidence |
| **SAP B1** | MRP Wizard nets into exactly four proposal types; five BOM types; per-item backflush granularity | Take the four-proposal fan-out shape (Plan-lite emits three); reject the extra BOM types |
| **SAP S/4HANA** | PP/PP-DS, PEO — the correctness ceiling for routing/scheduling | Reference only; everything it adds beyond the core is Module 3 or roadmap territory |
| **NetSuite** | Base work orders are **operation-less assembly builds**; routing gated behind "WIP & Routings" feature; 3-transaction WIP GL cycle | Take operations-optional as a design law; adopt its WIP GL model *later* (§18 Phase 3) |
| **Dynamics 365 BC** | 5-status production orders (Simulated→…→Finished); per-item flushing methods | Evidence that 3–4 working states suffice; flushing granularity on the Phase-2 path |
| **Epicor** | APS and MES sold as add-ons | Confirms scheduler and MES are a tier above core — deferred (scheduler permanently, to Module 3) |
| **Katana** | $199–899/mo; BOM+subassemblies, MTS/MTO, lot tracking, contract manufacturing — **ships without finite scheduling or quality** | The SME floor: proves a coherent product exists without a scheduler |
| **MRPeasy** | From $49/user/mo; multi-level BOM/routing, Gantt, default lot traceability; favoured by electronics/machinery SMEs | The most relevant SME reference for this client class — matches our depth target incl. genealogy |
| **Zoho Inventory** | No manufacturing at all (one-step "bundle") | The absolute floor the MVP must exceed |
| **Siemens Opcenter / Plex / Infor** | **Full MES tier** — machine-connected execution, real-time OEE, quality enforcement at the station, genealogy at sensor granularity (Opcenter/Plex are cloud-MES leaders; Infor CloudSuite Industrial the upper-mid ERP+MES) | Honest note: this is the tier the deferred shop-floor layer (§18 Phase 2/3) would *grow toward*, not compete with today. Module 6's job-card + produce-entry data model is deliberately shaped so an MES layer can later land on top without schema rework. No further claims made — not researched at implementation depth. |

---

## 20. Demo Data (Seed — investor-demo grade)

Shared IND-CORE pilot universe (consistent across all module plans): **(1) Sharma Precision Components Pvt Ltd**, Faridabad, HR; **(2) Kaveri Pumps & Motors Ltd**, Coimbatore, TN; **(3) Trident Sheet Metal Works Pvt Ltd**, Pune, MH; **(4) Zenith Fasteners Pvt Ltd**, Rajkot, GJ; **(5) Arvind Electro Controls Pvt Ltd**, Noida, UP.

**Primary walkthrough: Kaveri Pumps & Motors Ltd, Coimbatore plant (GSTIN 33AAACK2140F1Z6, plant KPM-CBE-1).** Demo "today" = **Mon 13-Jul-2026** (start of week W29 — same clock as `PLANNING.md` §20). Personas reuse `PLANNING.md` §20.1; work centers reuse §20.2; items reuse §20.3; the Module 1 MBOM handoff reuses `ENGINEERING.md` §20.5.

### 20.1 Companies & plants (identical to ENGINEERING.md §20.1)

| company_id | Company | GSTIN (demo) | Plant | City | Production demo role |
|---|---|---|---|---|---|
| 1 | Kaveri Pumps & Motors Ltd | 33AAACK2140F1Z6 | KPM-CBE-1 | Coimbatore, TN | **Primary walkthrough** (MTO pumps, job-work plating) |
| 2 | Trident Sheet Metal Works Pvt Ltd | 27AABCT7712E1ZD | TSM-PUN-1 | Pune (Chakan), MH | Secondary: powder-coat subcontract op (ITC-04 flagged in its MBOM) |
| 3 | Sharma Precision Components Pvt Ltd | 06AADCS3491J1ZR | SPC-FBD-1 | Faridabad, HR | Backdrop tenant (CNC job lots) |
| 4 | Zenith Fasteners Pvt Ltd | 24AABCZ5618Q1ZL | ZFL-RJK-1 | Rajkot, GJ | Backdrop tenant (MTS, batch-heavy) |
| 5 | Arvind Electro Controls Pvt Ltd | 09AAECA8804C1Z2 | AEC-NOI-1 | Noida, UP | Backdrop tenant (panel assembly kits) |

**Warehouses (Module 5-owned, Kaveri):** WH-RM-CBE (raw material stores) · WH-WIP-CBE (WIP-type) · WH-FG-CBE (sellable FG) · WH-SCRAP-CBE (scrap-type) · WH-REJECT-CBE (rejected-FG quarantine) · **WH-SUBCON-SME** (virtual, subcontractor-type — Sree Murugan Electroplating).

### 20.2 Employees / users (Kaveri; personas per §3, logins per PLANNING.md §20.1)

| User | Role | Login |
|---|---|---|
| **K. Selvam** | Production Supervisor (primary demo user) | supervisor@kaveripumps.in |
| Murugan V. | CNC Operator (WC-LTH01) | op.lth01@kaveripumps.in |
| S. Poongodi | Stores In-charge | stores@kaveripumps.in |
| Meenakshi Sundaram | PPC Planner | planner@kaveripumps.in |
| R. Karthikeyan | Plant Manager | plant@kaveripumps.in |
| Meera Iyer | Quality Engineer | quality@kaveripumps.in |
| Anand Krishnan | Procurement Officer | purchase@kaveripumps.in |
| CA Lakshmi Narayanan | Finance (read-only) | finance@kaveripumps.in |

### 20.3 Workstations (= PLANNING.md §20.2 work centers; shifts/calendar identical — A+B 2×8 h Mon–Sat, Sundays off, 15-Aug 0 h)

| Code | Machine | ₹/hr | Notes for Production demo |
|---|---|---|---|
| WC-VMC01 | Ace Micromatic VMC-850 machining centre | 950 | Impeller/casing milling ops; Sat 25-Jul PM block |
| WC-LTH01 | LMW LL20T L5 CNC lathe #1 | 800 | **Murugan's machine** — job-card demo strip |
| WC-LTH02 | LMW LL20T L5 CNC lathe #2 | 800 | Alternate turning |
| WC-ASSY | Pump assembly line (6 fitters) | 450 | Pump assembly op 10 |
| WC-TEST | Hydro test rig | 600 | Final test op 20; QI station |

### 20.4 Suppliers & job workers (canonical seed — shared with Modules 4/5)

| Party | City | Role in demo | Notes |
|---|---|---|---|
| **Sree Murugan Electroplating Works** | Coimbatore | **THE subcontractor** — impeller electro-nickel plating (borewell corrosion spec) | Virtual warehouse **WH-SUBCON-SME**; MSME **Micro**; SAC 9988 service PO on Module 4; rate card ₹22/pc |
| **Venkatramana Metals & Alloys Pvt Ltd** | Coimbatore | Bronze/gunmetal ingot, rod **and LTB2 cast blank** supplier — source of the recall-demo lot **VMA-LTB2-0619** | Supplies CI-CASTING-IMP (legacy item code keeps the "CI-" prefix from the cast-iron era; material is LTB2 bronze — a real-world master-data wart the demo owns honestly) |
| **Sri Balaji Castings** | Coimbatore | CI castings — CI-CASTING-CSG casing blanks | MSME **Small**; lot SBC-CI-0601 in the genealogy chain |
| **Lakshmi Steels & Tubes** | Chennai | SS410/EN8 shaft rod — SS-SHAFT-ROD | Lot LST-SS410-0605; inter-state GRNs (e-way on inward side, Module 4/5) |

### 20.5 Items & BOMs

Item economics identical to `PLANNING.md` §20.3: PUMP-KV50 ₹18,400 · PUMP-KV80 ₹24,900 · IMPELLER-KV50 ₹2,150 · CASING-KV50 ₹3,400 · MOTOR-5HP ₹7,800 (CG Power) · CI-CASTING-IMP ₹780 (MOQ 50, LT 2 wk) · CI-CASTING-CSG ₹1,450 · MECH-SEAL-25 ₹310 · SS-SHAFT-ROD ₹240/m. Production adds scrap items: **CAST-REJ-IMP** (rejected impeller casting, foundry-return, ₹150/pc) · **BRZ-TURNINGS** (bronze turnings, HSN **7404**, ₹560/kg) · **CI-BORINGS** (HSN **7204**, ₹28/kg) — GST rates from `statutory_config`, never code.

**Seeded BOMs (3, multi-level, with a superseded v1 + active v2):**

```
BOM-PKV50-002  (v2, submitted, DEFAULT)  PUMP-KV50, qty 1 NOS
├─ IMPELLER-KV50  ×1   scrap 2%   sub-BOM → BOM-IMP-KV50-002
├─ CASING-KV50    ×1   scrap 1%   sub-BOM → BOM-CSG-KV50-001
├─ MOTOR-5HP      ×1
├─ MECH-SEAL-25   ×1
└─ SS-SHAFT-ROD   ×0.6 MTR  (conversion: stock UoM = MTR, purchased per 6 m rod — UoM demo)
   ops: 10 Assemble WC-ASSY (setup 15, run 45/u) → 20 Hydro test WC-TEST (10, 20/u)

BOM-IMP-KV50-001 (v1, CANCELLED — superseded)   IMPELLER-KV50, qty 50 (batch-stated)
└─ CI-CASTING-IMP ×52.5 (1.05/u allowance baked in; no explicit scrap modeling)   ← the old Excel way

BOM-IMP-KV50-002 (v2, submitted, DEFAULT)       IMPELLER-KV50, qty 50
├─ CI-CASTING-IMP ×50  (1/u, line scrap 5% — planning parity with Module 3's gross-up)
├─ scrap item: CAST-REJ-IMP 0.05/u @ ₹150      ← explicit, valued scrap stream
├─ header process_loss_pct 5                    ← planned loss; actuals captured at produce
   ops: 10 Turn WC-LTH01 (30, 18/u) → 20 Mill WC-VMC01 (40, 22/u)

BOM-CSG-KV50-001 (v1, submitted, DEFAULT)       CASING-KV50, qty 30
├─ CI-CASTING-CSG ×30 (1/u, scrap 3%)
├─ scrap item: CI-BORINGS 0.4 kg/u @ ₹28
   ops: 10 Mill WC-VMC01 (45, 35/u)
```

**v1 → v2 story (the versioning demo):** v1 hid the foundry allowance inside qty-per (1.05); v2 models it correctly — 1.0 qty-per + 5% line scrap + explicit scrap item + planned process-loss %. v1 was cancelled-and-duplicated on 02-Jun-2026; historical WOs still cost against v1 untouched (TC-BOM-03 live on real data).

**Cost roll-up (v2 impeller, basis = valuation):** material 780 × 1.05 = ₹819.00 · ops (setup amortized over batch 50): turn (30/50 + 18) min × ₹800/60 = ₹248.00; mill (40/50 + 22) min × ₹950/60 = ₹361.00 · scrap credit 0.05 × 150 = −₹7.50 · ÷(1 − 0.05) process loss ⇒ **₹1,495.26/unit direct**. The gap to legacy std ₹2,150 (overheads, consumables) renders as a review flag on the BOM editor — an honest data-quality beat, not hidden.

**Module 1 handoff seed:** `eng.eco.applied` for **ECO-2026-0031** has hydrated draft **BOM-KPM5HP-002** from released MBOM **KPM-5HP-MB Rev B (v2, effective 01-Aug-2026)** — SS impeller IMP-SS-5HP replacing bronze, phantom HW-KIT-5HP flattened, `source_mbom_ref = 'MBOM:KPM-5HP-MB:RevB:ECO-2026-0031'`. Today (13-Jul) **Rev A is still the default** and the workbench shows the use-up banner: "40 bronze impellers to consume before 01-Aug cut-over" (consistent with `ENGINEERING.md` §20.7).

### 20.6 Work orders (8 across states — the workbench as of Mon 13-Jul-2026 17:50)

| WO | Item · qty | Planned | Status | Story |
|---|---|---|---|---|
| WO-2026-0128 | PUMP-KV50 × 16 | 06→10-Jul | **completed** | The W30 MPS receipt made real; FG batch PKV50-B-260710-01; 16/16, zero scrap; dispatched 11-Jul (SO-1042 part) |
| WO-2026-0136 | PUMP-KV50 × 24 (SO-1042) | 20→24-Jul | draft (awaiting kit) | **Shortage chip: MOTOR-5HP × 6** (CG Power PO-2213 due W31 — Module 4 promise date on the chip) |
| WO-2026-0139 | IMPELLER-KV50 × 18 | 14→17-Jul | in_process | Turn done (18 ok, 0 scrap, JC on LTH-01); mill queued on VMC01 |
| WO-2026-0141 | GLAND-CI × 40 | 14→15-Jul | in_process | Murugan's running card: 22/40 done, 1 rejected |
| WO-2026-0142 | IMPELLER-KV80 × 12 | 14→18-Jul | in_process, **OVERDUE-risk** | Late flag vs SO-1051 need (Module 3's late-WO fixture, seen from the execution side) |
| **WO-2026-0158** | **IMPELLER-KV50 × 100** | 08→13-Jul | **in_process 95/100 — THE golden fixture** | Transferred 100 castings (lot VMA-LTB2-0619) 10-Jul; produce 13-Jul 14:20: **80 good (batch IMP-B-260713-01 @ ₹965.63) + 5 scrap CAST-REJ-IMP + 15 process loss** (deviation 15% vs plan 5% → red alert); short-close pending |
| WO-2026-0151 | PUMP-KV80 × 10 | 02→08-Jul | **stopped** | Stop reason: "motor vendor quality hold — CG Power lot recall"; 4 produced; components part-returned to stores |
| WO-2026-0154 | CASING-KV50 × 30 | 06→11-Jul | in_process, **aging: no movement 5 d** | Partial transfer 22/30; **short 8 CI-CASTING-CSG**; the §13.3 delay-risk narrative target |
| WO-2026-0160 | PUMP-KV50 × 2 | 13→15-Jul | **rework (is_rework)** | Consumes rejected FG batch PKV50-B-260710-01 × 2 (failed hydro-test QI-2026-0198, seal-face leak); new seals added; FPY excludes these 2 by definition |

### 20.7 Job cards (WC-LTH01, Murugan V.)

| JC | WO · op | Status | Result |
|---|---|---|---|
| JC-2026-0341 | WO-2026-0158 · Turn | done (10–11 Jul, 2 shifts) | 100 ok / 0 rej — 31.2 h actual vs 30.5 planned |
| JC-2026-0344 | WO-2026-0141 · Turn | **running** (13-Jul 13:05 →) | 22 ok / 1 rej (reason chip: tool wear) |
| JC-2026-0347 | WO-2026-0139 · Turn | done (12-Jul) | 18 ok / 0 rej |
| JC-2026-0351 | WO-2026-0142 · Turn | pending | queued behind JC-2026-0344 |

### 20.8 Job work walkthrough — Sree Murugan Electroplating Works

**SCO-2026-0034** — electro-nickel plating of 100 × IMPELLER-KV50 (borewell corrosion spec); service PO **PO-2026-0412** (Module 4, SAC 9988 @18%, ₹22/pc = ₹2,200 + GST; 194C TDS on payment — money flow); virtual warehouse **WH-SUBCON-SME**.

| Event | Date | Document | Effect |
|---|---|---|---|
| Send 100 impellers (batch IMP-B-260618-02) | 18-Jun | Challan **DC-2026-0071** (Rule 55 fields; taxable value ₹1,49,500; intra-state TN, value > ₹1 lakh → e-way generated) | WH-SUBCON-SME +100 (at-vendor value ₹1.50 L) |
| Receive back | 12-Jul | Receipt **SCR-2026-0051**: qty_received **95**, qty_rejected **2**, **scrap_at_jobworker 3**; `challan_refs = [{"challan_no":"DC-2026-0071","qty_against":100}]` | WH-SUBCON-SME −100 → accepted 95 to WH-RM-CBE (plated stock), 2 to WH-REJECT-CBE, 3 booked as job-worker scrap (s.143(5) stream); **SCO closed — reconciles 95+2+3 = 100** ✓ |
| Older exposure | 12-Sep-2025 | Challan **DC-2025-0112**: 60 GLAND-CI sent for plating, still open | **Age 10 months → AMBER bar** on the board ("return by 11-Sep-2026 or deemed supply") — the s.143 clock made visible. (The 13-month red `deemed_supply` case lives in the test fixture TC-JW-02, not the live board.) |

### 20.9 ITC-04 extract (period Apr–Sep 2026, due 25-Oct-2026 — Kaveri AATO > ₹5 crore ⇒ half-yearly)

**Table 4 — goods sent to job worker:**

| Challan | Date | Job worker GSTIN | Goods | UQC/Qty | Taxable value | Type |
|---|---|---|---|---|---|---|
| DC-2026-0071 | 18-Jun-2026 | 33BJQPS8821F1Z5 (Sree Murugan) | Bronze impeller, machined (HSN 8413) | NOS / 100 | ₹1,49,500 | inputs |

**Table 5 — received back (original-challan back-reference — the key schema decision, from `subcontract_receipts.challan_refs`):**

| Original challan | Orig. date | Received via | Qty received back | Losses & wastes | Nature |
|---|---|---|---|---|---|
| **DC-2026-0071** | 18-Jun-2026 | SCR-2026-0051 (12-Jul) | 97 (95 accepted + 2 rejected returned) | 3 (scrap at job worker, s.143(5)) | received_back |

Reconciliation footer: Σ sent 100 = Σ received 97 + wastes 3 + open 0 ✓ (the export refuses to render if this fails — §11.8). DC-2025-0112 belongs to the Apr–Sep-2025 Table 4 (prior period); it appears in the current period only on the ageing register.

### 20.10 Rule 56(12) monthly production account — Jun-2026 (view + XLSX; "matches stock ledger ✓")

| Raw material consumed | Qty | | Goods produced | Qty | | Waste & by-products | Qty |
|---|---|---|---|---|---|---|---|
| CI-CASTING-IMP (bronze blank) | 210 NOS | | PUMP-KV50 | 118 NOS | | CAST-REJ-IMP (valued scrap) | 9 NOS |
| CI-CASTING-CSG | 168 NOS | | PUMP-KV80 | 34 NOS | | BRZ-TURNINGS | 36.8 KG |
| MOTOR-5HP | 152 SET | | IMPELLER-KV50 (intermediate) | 205 NOS | | CI-BORINGS | 64.0 KG |
| MECH-SEAL-25 | 158 NOS | | CASING-KV50 (intermediate) | 162 NOS | | Process loss — impellers | 11 NOS |
| SS-SHAFT-ROD | 96.5 MTR | | GLAND-CI | 310 NOS | | Process loss — casings | 5 NOS |

*"The register your team writes by hand today"* — generated from the triple + scrap entries + process-loss records; the July view (provisional) already shows WO-2026-0158's 15-unit loss and 5 scrap.

### 20.11 Production-Plan-lite run — PPL-2026-0021 (Meenakshi, 13-Jul, against SO-1046: 25 × PUMP-KV50, need W32)

| Item | Required | Projected | Shortage | Classification → emitted |
|---|---|---|---|---|
| PUMP-KV50 | 25 | 0 (on-hand committed to SO-1042) | 25 | make → **WO-2026-0161 draft (25)** |
| IMPELLER-KV50 | 26 (25 × 1.0204 ↑) | 10 (30 − 20 reserved) | 16 | make → **WO-2026-0162 draft (16)** |
| — plating pass (item finish = job-work) | 16 | — | 16 | subcontract → **SCO-2026-0035 draft** (Sree Murugan) |
| CI-CASTING-IMP | 17 (16 × 1.0526 ↑) | 12 (40 − 28 reserved) | 5 | buy → **MR-2026-0104** (Venkatramana) |
| MOTOR-5HP | 25 | 8 | 17 | buy → **MR-2026-0105** (CG Power) |
| MECH-SEAL-25 / SS-SHAFT-ROD | 25 / 15 m | 72 / 90 m | 0 | none (collapsed) |

Emit once → 2 WOs + 2 MRs + 1 SCO draft; **re-run immediately after → zero new documents** (the idempotency demo, TC-PLN-02). Banner: "Lot sizing, time-phasing and capacity: install Module 3 — this plan is a single-pass shortage check."

### 20.12 KPI tiles (13-Jul-2026, trailing 30 days — honest numbers)

| KPI | Value | Note |
|---|---|---|
| **OEE (simple form)** | **61%** | (Good × ideal cycle) / planned time, WC-LTH01+VMC01; benchmark footnote: world-class 85%, typical ≈ 60% — *more plants score below 45% than above 85%* |
| FPY | 94.2% | rework-excluded by definition (WO-2026-0160's 2 units out of numerator) |
| Scrap rate | 2.8% | + this week's deviation spike flagged (WO-0158) |
| Schedule adherence | 87% | Jun WOs completed by planned end |
| WIP value | ₹8.4 L | live from WH-WIP-CBE valuation |
| At-vendor value | ₹1.9 L | WH-SUBCON-SME (incl. DC-2025-0112 amber ₹0.4 L) |

### 20.13 Batch-genealogy walkthrough (the recall drill)

**Forward — "Venkatramana lot VMA-LTB2-0619: which customers?"** (GRN-2026-0642, 19-Jun, 250 blanks):

```
VMA-LTB2-0619 (250 pcs, Venkatramana Metals & Alloys)
├─ WO-2026-0147 ─▶ IMP-B-260628-01 (60 impellers)
│    ├─ WO-2026-0125 ─▶ PKV50-B-260703-01 (20 pumps) ─▶ DISP-2026-0210 · Coimbatore Waterworks (04-Jul)
│    └─ WO-2026-0128 ─▶ PKV50-B-260710-01 (16 pumps) ─▶ DISP-2026-0221 · Kirloskar dealer, Salem (11-Jul)
├─ WO-2026-0158 ─▶ IMP-B-260713-01 (80 impellers — in FG store, not yet consumed)
└─ (90 pcs still in WH-RM-CBE)
Answer: 2 impeller batches → 2 pump batches → 2 customers. Export recall pack (PDF/CSV).
```

**Backward — pump batch PKV50-B-260710-01:** impellers IMP-B-260628-01 ← **VMA-LTB2-0619** (Venkatramana) · casings ← SBC-CI-0601 (Sri Balaji Castings) · shafts ← LST-SS410-0605 (Lakshmi Steels & Tubes, Chennai) · motors ← CG Power serial range · seals ← MS-25-0611. The plated-impeller path shows the dashed **vendor-custody hop**: "at Sree Murugan 18-Jun → 12-Jul".

### 20.14 Inventory touchpoints (stock position snapshot, 13-Jul 17:50 — Module 5 truth the demo reads live)

| Warehouse | Highlights | Value |
|---|---|---|
| WH-RM-CBE | CI-CASTING-IMP 90 (lot VMA-LTB2-0619 remainder) · CI-CASTING-CSG 27 (**short vs WO-0154 need 8**) · MOTOR-5HP 8 · MECH-SEAL-25 118 · SS-SHAFT-ROD 84 m · 95 plated impellers (SCR-2026-0051) | ₹6.1 L |
| WH-WIP-CBE | WO-0141 gland blanks · WO-0154 22 casing blanks · WO-0139 18 turned impellers awaiting mill | ₹1.9 L |
| WH-FG-CBE | IMPELLER-KV50 batch IMP-B-260713-01 × 80 · PUMP-KV80 × 4 (WO-0151 partial) | ₹1.4 L |
| WH-SCRAP-CBE | CAST-REJ-IMP 9 · BRZ-TURNINGS 41 kg · CI-BORINGS 71 kg (disposal invoice pending — rates from config) | ₹9,800 |
| WH-REJECT-CBE | PKV50-B-260710-01 × 2 (→ rework WO-2026-0160) · 2 rejected plated impellers (SCR-2026-0051) | ₹39,700 |
| WH-SUBCON-SME (virtual) | GLAND-CI × 60 (DC-2025-0112 — **amber**) | ₹0.4 L |

Every number above is a Module 5 ledger fact — the demo deliberately flips to the Inventory screen mid-walkthrough (demo beat 3) to show the same rows moving.

### 20.15 Alerts feed (seeded)

- 🔴 **Process-loss deviation** — WO-2026-0158 booked 15% loss vs 5% plan (borewell-profile lot); scrap Pareto updated.
- 🟠 **Job-work ageing** — DC-2025-0112 (60 GLAND-CI at Sree Murugan) is 10 months old; return by 11-Sep-2026 or deemed supply (GST + 18% interest from dispatch date).
- 🟠 **Aging WO** — WO-2026-0154 has no movement for 5 days and is short 8 castings (MR suggested).
- 🟠 **Kit short** — WO-2026-0136 awaiting 6 × MOTOR-5HP (PO-2213 due W31).
- 🟢 **Rule 56(12) June account generated** — ties to ledger ✓; ITC-04 H1 export ready for review.

### 20.16 AI output examples (seeded verbatim)

**AI example 1 — End-of-shift summary (✦ drafted 13-Jul 17:45, Selvam sends):**
> **Shift A+B summary, Mon 13-Jul** — Produced: **80 IMPELLER-KV50** (WO-0158, batch IMP-B-260713-01), 22/40 GLAND-CI running (WO-0141). **Attention: WO-0158 lost 20 of 100** — 15 process loss + 5 scrap castings — against a 5% plan; all from Venkatramana lot VMA-LTB2-0619, borewell profile. Unit cost of good pieces rose to ₹966 (+24%). Job work: **95 plated impellers received** from Sree Murugan (2 rejected → quality queue, 3 scrapped at vendor — booked). Still stuck: WO-0154 (casings) — no movement 5 days, short 8 blanks; WO-0136 kit waits on 6 motors (PO-2213, W31). Rework WO-0160 (2 pumps, seal-face leak) starts tomorrow. *[Evidence: 6 stock entries, 3 job cards, QI-2026-0210, SCR-2026-0051]*
> *Hindi:* "आज 80 इम्पेलर बने (WO-0158), पर 100 में से 20 का नुकसान — 15 प्रोसेस लॉस + 5 स्क्रैप, प्लान 5% था। श्री मुरुगन से 95 प्लेटेड इम्पेलर वापस आए, 2 रिजेक्ट। WO-0154 पाँच दिन से रुका है — 8 कास्टिंग कम।"

**AI example 2 — Scrap-pattern narrative (✦ on the scrap Pareto):**
> "Impeller loss this month is **not random**: 62% of combined scrap + process loss sits on **borewell-profile lots machined from casting lot VMA-LTB2-0619** (3 WOs, incl. WO-0158's 20/100). Non-borewell impeller WOs off the same machines averaged 4.1% loss — within plan. The pattern points at the casting lot/profile combination, not the operators or machines. Suggested next step (human decision): hold the remaining 90 blanks of this lot for incoming inspection and raise it with Venkatramana. *[Pareto table attached: by lot, by item, by workstation — deterministic; I computed no new numbers.]*"

**AI example 3 — Job-work compliance digest (✦ weekly, to Anand + CA Lakshmi):**
> "Job-work status, W29: **1 challan needs action** — DC-2025-0112 (60 GLAND-CI at Sree Murugan Electroplating, sent 12-Sep-2025) is **10 months old; 60 days to the s.143 one-year limit** (11-Sep-2026). If not received back, it becomes a deemed supply *from the dispatch date* with GST plus 18% interest — current exposure ≈ ₹9,100. All other challans green: DC-2026-0071 fully reconciled on receipt SCR-2026-0051 (95+2+3=100 ✓). ITC-04 (Apr–Sep) export is reconciled and ready; due 25-Oct. *[Rows: challan register (Module 5), receipt SCR-2026-0051, exposure calc from statutory_config rates.]*"

---

## Appendix A — Research findings & key sources

Grounded in ~72 web-research findings (SAP B1/S4, NetSuite, Dynamics 365 BC, Odoo, ERPNext, Epicor, Katana, MRPeasy, Zoho + India-statutory sources), adversarially fact-checked; corrections applied. Provenance flags retained where evidence is vendor-hosted or single-source.

### A.1 What the market ships

**Table stakes (base manufacturing module in all six full-ERP products surveyed):**
- **Multi-level BOM with sub-assembly explosion** — no vendor treats it as an add-on.
- **Work/production order with a status lifecycle** — BC uses 5 statuses (Simulated→Planned→Firm Planned→Released→Finished); ERPNext derives Not Started→In Process→Completed from quantities; Odoo MOs use Draft→Confirmed→In Progress→Done. **An MVP needs roughly 3–4 states.** Notably: **stock ERPNext has no approval matrix on Work Orders — submission is the only gate.** An approval workflow here is enterprise bloat.
- **Backflush vs manual material issue, selectable.** Per-item/per-BOM-line granularity in SAP B1, BC, and Odoo; ERPNext offers both modes but as a company-wide Manufacturing Settings choice (plus per-WO "Skip Material Transfer"). MVP: support both paths; per-item granularity optional.
- **Actual-scrap transactions during execution** (Odoo scrap orders → virtual scrap location; ERPNext splits Process Loss vs Scrap Items).
- **A basic MRP/planning loop**: SAP B1's MRP Wizard nets demand into exactly four proposal types (POs, production orders, reschedules, transfers); ERPNext's Production Plan is the same loop.
- **Quantity-level WIP visibility** (full WIP GL accounting is a layer above).

**Second tier / advanced (deferred with vendor precedent):**

| Feature | Evidence it's a tier above the core |
|---|---|
| Operation-level routing & work centers | NetSuite gates routing behind a separately-enabled "WIP & Routings" feature — base work orders are operation-less assembly builds |
| Finite/constraint scheduling & Gantt | Epicor APS sold separately; SAP PP/DS; NetSuite Advanced Mfg; Katana ships **without it entirely**; infinite loading vs work-center calendars is the mid-market norm |
| Tablet MES / shop floor + OEE panels | Odoo Shop Floor is Enterprise-only; Epicor MES is an add-on; ERPNext added Plant Floor only in v15 atop the long-stable core |
| Full WIP GL accounting | NetSuite's 3-transaction cycle (issue/completion/close with variance reconciliation); MVP stubs with quantity-only WIP |
| BOM release/certification workflows, production versions | BC + S/4HANA machinery, absent from all mid-market products; ERPNext's is_active/is_default + cancel-and-duplicate is the right altitude |
| Extra BOM types (sales/template/phantom/kit), unbuild/disassembly, by-products | SAP B1 ships five BOM types; only the production BOM is needed |

**Odoo's own free/paid boundary is a published MVP scoping decision**: MOs, multi-level BOMs, work centers, routing = free Community; MPS, WO scheduling, Shop Floor app, quality, PLM = Enterprise.

**SME floor and ceiling**: Katana ($199–899/mo) ships BOM+subassemblies, MTS/MTO, shop-floor tasks, lot tracking, contract manufacturing — no finite scheduling and no quality module. **MRPeasy** (from $49/user/mo) differentiates on production depth (multi-level routing, Gantt, default lot traceability) and is favored by electronics/machinery SMEs — the more relevant reference for this client class. **Zoho Inventory ships no manufacturing at all** (one-step "bundle") — the absolute floor the MVP must exceed.

**The ERPNext reference chain** (most fully documented) is reproduced in §1.1; its five load-bearing doctypes and the verified mechanics (immutability, the triple, WIP-as-warehouse, scrap vs process loss, the optional-machinery spread across BOM/WO/Settings such that **a work order whose BOM has no operations still completes**) are design law throughout this blueprint. **The minimal MRP contract is one formula and one fan-out**: `Required = BOM Required − Projected Qty`, emitting Work Orders + Material Requests + Subcontract POs — that fan-out *is* the Purchase↔Production integration (§4.F).

### A.2 Business impact & KPI evidence (provenance flagged)

**KPIs computable from work-order data alone (no sensors):**

| KPI | Formula | Benchmark |
|---|---|---|
| **OEE (simple form)** | (Good Count × Ideal Cycle Time) / Planned Production Time | World-class 85%; most manufacturers ≈ 60%; more score **below 45% than above 85%**. A demo showing 50–70% is more credible than 90%+ |
| First pass yield | good qty without rework ÷ total produced | needs the rework/reject path (M8) to mean anything |
| Scrap rate | scrap qty ÷ total qty, per WO / item / period | from scrap entries |
| Schedule adherence | WOs completed by planned date ÷ total | from planned vs actual dates |
| Cycle time | actual end − actual start vs planned | auto-captured from job cards |
| WIP value | stock value in WIP warehouses | free from the Inventory ledger |

Panorama's analyst checklist recommends baselining exactly 8 metrics before/after (throughput, cycle time, OEE, forecast accuracy, costs avoided, inventory turns, changeover time, FPY) — the before/after measurement itself is the practice to sell. MTBF/MTTR need maintenance records the MVP won't have; TEEP/OLE/energy-per-unit are bloat.

**Evidence for automating:**
- **Aberdeen (vendor-hosted, ~2008–12, directional)**: SMB manufacturers on ERP achieved **19% better complete-and-on-time delivery** and **17% inventory reduction**; best-in-class hit 97% on-time-complete shipment.
- **Panko (academic — the strongest non-vendor evidence)**: errors in **88% of 113 audited spreadsheets**; developers estimated 18% error likelihood when the real rate was 86%. This is the client's Excel production plan.
- **Excel-MRP failure mechanisms (practitioner)**: manual re-entry, version divergence, silent formula breakage, **no linkage between plan and shop-floor actuals**, key-person dependency. "Planning divorced from execution" is the direct business case for work-order status tracking.
- **Implementation risk**: 73% of discrete-manufacturing ERP projects fail to meet objectives (Panorama data via Godlan); data migration (38%) outranks over-customization (23%) as a cause. Complexity scores: **MTS 65 / MTO 78 / CTO 85 / ETO 92** → scoping to **MTS + simple MTO** keeps the pilot at the low end of the risk curve (M11).
- **Shop-floor post-mortems**: when BOMs/routings don't match floor practice, "supervisors revert to spreadsheets, operators bypass transactions." → capture only events the floor will actually record (issue, finished qty, scrap), and make **Work Order → stock entry the most heavily tested code in the demo** (NFR-PRD-01).

### A.3 India-statutory research (all promoted to FRs in §4.G/§4.J; kept here with sources)

For a job-work-heavy precision manufacturer, GST job-work compliance is the dominant statutory load on this module.

1. **Delivery challan per dispatch (Rules 45/55)**: serially numbered (≤16 chars), triplicate, carrying GSTINs, HSN, qty, taxable value, tax rate; required even when a vendor ships direct to the job worker. **E-way bill is mandatory for any inter-state job-work movement regardless of value** (the ₹50k threshold doesn't apply inter-state); Allahabad HC has upheld detention for challan-less job-work movement. MVP: printable challan + portal-pastable e-way export. → FR-PRD-062/063
2. **ITC-04 (Rule 45(3))**: filed by the principal — half-yearly (due 25 Oct/25 Apr) above ₹5 crore AATO, else annual. Table 4 = goods sent; Table 5 = received back / supplied from the job worker's premises, **cross-referencing the original outward challan** — that back-reference is the key schema decision (`subcontract_receipts.challan_refs`). A periodic register export suffices; no real-time filing pipeline. → FR-PRD-066
3. **Section 143 clocks**: inputs back within **1 year**, capital goods (dies, jigs, fixtures move separately — moulds/dies exempt from the return requirement) within **3 years**, else the challan is deemed a taxable supply from dispatch date with GST + 18% interest → **challan ageing is a required report** (owned by Inventory's register; surfaced here per subcontract order). → FR-PRD-067
4. **Two independent chains reconcile at the subcontract order**: the **goods flow** (challan out → receipt back, no GST) and the **money flow** (service PO → Purchase Invoice, SAC 9988, engineering job work @18% with ITC). The subcontractor is a **virtual warehouse in the principal's own ledger**, enabling ageing and ITC-04 without any vendor data. → FR-PRD-060/061/068
5. **Job-worker scrap (s.143(5))**: scrap at the job worker's premises — sold from there by a registered job worker, else accounted by the principal → the subcontract receipt needs its own scrap-qty field (a distinct stream from in-house scrap). → FR-PRD-064
6. **Scrap sales**: copper 7404 / steel 7204 etc. @18% (precious-metal waste 3%) — per-item HSN and rate on the disposal invoice, never a hardcoded rate. Metal scrap since Oct 2024: RCM on purchases from unregistered suppliers; **2% GST TDS** on B2B sales above ₹2.5 lakh. (Income-tax TCS on scrap: historically 1%; one source reports 2% from 1 Apr 2026 — **single-source, verify before hardcoding**; keep rates in config.) → FR-PRD-042/091
7. **Rule 56(12) monthly production accounts (verified gap)**: every manufacturer must maintain monthly quantitative accounts of raw materials used and goods produced **including waste and by-products**. This is exactly the Required/Transferred/Consumed triple + scrap entries → a cheap statutory report that directly replaces the legacy production register. → FR-PRD-090
8. **Factories Act registers** (muster roll, OT, accident): HR-side *exports* keyed off job-card time data — downstream of this module, not a feature of it. → FR-PRD-092

### A.4 Key sources

ERPNext manuals (bill-of-materials, work-order v13/v15, job-card, production-plan, stock-entry-purpose, manufacturing, subcontracting-v14 blog) · Odoo docs (manufacturing, bill_configuration, manufacturing_work_orders, subcontracting; Community-vs-Enterprise split) · Microsoft Learn BC (production orders, flushing methods, configure-production) · NetSuite WIP & Routings datasheet + WIP accounting docs · SAP B1 production planning (erpresearch) · S/4HANA PEO/PP-DS blog · Epicor APS/MES pages · Katana/MRPeasy/Zoho feature+pricing pages · oee.com (formulas, benchmarks) · Panorama manufacturing metrics + 2015 mfg report · Godlan failure statistics · Panko spreadsheet-error research · FractionERP / UserSolutions Excel-MRP failures · sysgenpro shop-floor post-mortems · CBIC Rule 45/55/56 + s.143 texts · TaxGuru ITC-04 guide · docs.indiacompliance.app (ITC-04 doc-references pattern) · ClearTax (e-way, scrap GST) · VJM Global (scrap RCM/TDS) · gstrefundservices (**scrap TCS change — single-source, flagged**) · Turqosoft/CodeWithKarani (ERPNext batch traceability, UoM pitfalls) · GST Council job-work flyer (inward job-work definition) · **Aberdeen SMB-ERP studies — vendor-hosted, directional only**.

---

## Appendix B — Open questions for the pilot customer (Kaveri Pumps & Motors, Coimbatore)

To be answered during pilot onboarding, before F4/F5 build freeze. Q1 is the standing scope gate.

1. **Does Kaveri do inward job work** — machining/assembly on a principal's (e.g., an OEM's) free-issued material? This activates a distinct schema: customer-material **non-valuated** warehouse (type exists in Module 5), inward-challan register, service **sales** invoice (SAC 9988 outbound). **Deliberately out of MVP until confirmed** (FR-PRD-071, §18 Phase 4). *The GST Council's job-work flyer defines the role symmetrically — the data model must not assume Kaveri is only ever the principal.*
2. **Which operations are outsourced today, and to how many vendors?** (Plating to Sree Murugan is seeded; grinding? heat treatment? balancing?) Sizes the job-work board and the challan register migration.
3. **Are dies, jigs, fixtures or patterns sent to job workers?** Activates the 3-year capital-goods clock and the moulds/dies return-exemption handling (per-challan-line flags, FR-PRD-067) — foundry patterns at Sri Balaji Castings and Venkatramana are the likely case.
4. **Do OEM customers demand lot certificates today** (Kirloskar dealers, waterworks tenders)? Calibrates batch-genealogy depth and the recall-pack export format (§20.13).
5. **Real BOM depth: 2 levels or 4?** (Affects UI more than schema — the tree editor's default expansion and the explosion depth guard.)
6. **MTO share of business** — build to order against sales orders, or mostly to stock with dealer forecasts? Tunes Plan-lite's demand default and the Module 3 adoption timeline.
7. **Which legacy registers exist and in what format** (hand-written production register, challan file, scrap book)? Sets the data-migration plan — migration is the top failure cause (38%), so these get converted, not re-keyed.
8. **Scrap disposal practice**: who buys bronze turnings/CI borings, at what cadence, registered or unregistered buyers? Confirms RCM/GST-TDS/TCS config seeding (V-PRD-14) and whether the scrap-sale invoice ships in the pilot or waits for Module 2/4 maturity.

---

*— End of blueprint. Companion plans: `ENGINEERING.md` (Module 1), `SMBD.md` (Module 2), `PLANNING.md` (Module 3), `PURCHASE.md` (Module 4), `INVENTORY.md` (Module 5). Production stays OFF until Module 5's inventory-accuracy gate is met.*
