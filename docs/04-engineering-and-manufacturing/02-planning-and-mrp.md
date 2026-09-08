# IND-CORE Module 03 — Planning and MRP

**Product:** IND-CORE (manufacturing ERP for Indian SMEs) · **Company:** IND-AI
**Module:** Planning / MRP — Demand → MPS → MRP → Capacity → Finite Scheduling → Work Orders
**Document version:** 1.0 · **Date:** 18 July 2026 · **Status:** Ready for build
**Source spec:** `PLANNING.html` §3 (Module 3), cross-cutting design system & build sequence

---

## 1. Module Overview

Planning answers four linked questions for a manufacturing SME:

1. **What should we make and when?** → Master Production Schedule (MPS)
2. **What materials do we need, and when to order or make them?** → Material Requirements Planning (MRP)
3. **Can our machines and labour actually do it in that window?** → Capacity planning (RCCP / CRP)
4. **In what exact sequence should each machine run?** → Finite scheduling (APS)

The module converts uncertain demand (forecast + confirmed sales orders + transfers + spares) into a **time-phased, feasible plan** of **Work Orders** (make) and **Purchase Requisitions/Orders** (buy), respecting BOMs, routings, lead times, on-hand stock, and finite resource capacity. The canonical closed loop is:

**Demand → Consolidation → MPS → MRP explosion → Planned orders → Capacity check → Scheduling → Release → Track → Re-plan.**

**Why it matters.** Without planning, an SME job shop either locks cash in excess raw material/WIP or misses delivery dates. Planning is the single biggest lever on **working capital** and **on-time delivery** — the two survival metrics for Indian SMEs, amplified by MSME 45-day payment cycles where late deliveries directly delay cash. It also restores **pegging** (the traceable "why does this order exist?") that "Excel + WhatsApp planning" destroys.

**The strategic gap IND-CORE attacks.** Research across the market (ERPNext, Odoo, Katana, Fishbowl vs SAP PP/PP-DS, D365 Planning Optimization, Siemens Opcenter APS/Preactor, DELMIA Ortems) confirms a hard split: **every SME-priced ERP is infinite-capacity only; true finite-capacity APS is enterprise-priced** (Opcenter APS is a scheduling layer requiring a host ERP plus high licensing). The industry-standard advice is to layer a finite scheduler *on top of* infinite-capacity MRP — exactly what IND-CORE builds natively: **APS-quality drag-drop finite scheduling with changeover-aware auto-optimize, at SME price**, plus four supporting differentiators:

- Native **job-work / sub-contract planning** with GST-correct delivery challans (ITC-04 flow) as a first-class planning object.
- **Learned supplier lead times + dynamic safety stock** — because Indian vendor variability is the planner's daily reality, static min/max fails.
- **What-if rush-order promising (CTP)** against real capacity, feeding Sales/SMBD.
- **Assistant-led, regional-language UX** (Hindi + regional) so a non-APICS-trained planner can run MRP confidently.

**Position in the build sequence.** Planning is Phase-1 item (3) — "closing the loop" after Engineering (Items/BOM/Routing) and SMBD (lead→quote→order). It consumes Engineering's BOMs/routings and SMBD's sales orders; it emits requisitions to Purchase, Work Orders to Production, and ATP/CTP promises back to Sales.

---

## 2. Objectives

| # | Objective | Success metric (pilot targets) |
|---|-----------|-------------------------------|
| O1 | Replace Excel/WhatsApp planning with a closed-loop MRP a non-specialist can run | Planner runs full MRP unaided within 2 weeks of onboarding; ≥ 80% of exceptions actioned in-app |
| O2 | Cut working capital locked in inventory | Raw-material days-of-cover ↓ 15–25% within 2 quarters (dynamic safety stock + EOQ) |
| O3 | Improve on-time delivery | OTIF ↑ to ≥ 90% at pilot plants; schedule adherence ≥ 85% |
| O4 | Deliver affordable finite scheduling — the market gap | Drag-drop Gantt + changeover-aware auto-sequence usable on a shop of ≤ 25 machines; < ₹ enterprise-APS pricing by 10× |
| O5 | Make every order explainable | Pegging from any planned order/WO to its demand in **one click, everywhere** |
| O6 | Fast, trustworthy planning runs | Full regenerative MRP for 5,000 items / 8-level BOMs in < 60 s; net-change in < 10 s |
| O7 | India-native from day one | Job-work planning with GST challans; festival-aware forecasting (Diwali/regional); MSME cash-flow view of planned POs |
| O8 | AI that drafts, humans approve | Forecast, safety stock, auto-sequence, reschedule proposals all follow the "✦ AI proposes → planner clicks" trust model |

---

## 3. User Personas

### 3.1 Production Planner / PPC Officer — PRIMARY
- **Profile:** e.g., Meenakshi Sundaram, PPC officer at Kaveri Pumps, Coimbatore. Diploma in mechanical engineering, 6 years in production, no formal APICS training. Plans in Excel today; chased on WhatsApp by sales and stores all day.
- **Owns:** forecast/demand workbench, MPS, MRP runs, exception resolution, firming/converting planned orders, the finite schedule.
- **Daily loop:** open exception worklist → run/refresh MRP → resolve exceptions → firm & convert → check capacity heatmap → sequence the board → publish dispatch list.
- **Needs:** plain-language exceptions ("Order 50 castings by Wed or WO-0142 slips 4 days"), one-click pegging, an assistant that explains *why*.

### 3.2 Plant / Production Manager
- e.g., R. Karthikeyan, Kaveri Pumps plant head. Approves the published schedule, watches capacity load % and bottlenecks, overrides priorities, maintains work centers/shifts/calendars. Wants the heatmap and schedule-adherence trend on his phone.

### 3.3 Materials / Stores
- e.g., S. Poongodi, stores in-charge. Maintains on-hand and allocations, works the shortage list (kitting readiness per WO), confirms material issues against reservations. Phone-first shortage list.

### 3.4 Procurement
- e.g., Anand Krishnan, purchase officer. Converts planned requisitions → POs, maintains supplier lead times/MOQs, expedites per MRP exception messages. Cares about learned-vs-promised lead times per vendor and MSME 45-day payment scheduling of planned POs.

### 3.5 Sales / CSR
- e.g., Divya Ramesh (CSR, feeds SOs from SMBD module). Reads ATP from the MPS board, requests CTP checks for rush orders ("can we deliver 40 KV-80 pumps by 20-Aug?"), creates demand.

### 3.6 Shop-floor Operator
- e.g., Murugan V., CNC operator. Sees his machine's dispatch list (sequence published from the board), reports operation progress/scrap/downtime from a tablet at the machine. Tamil/Hindi UI labels.

### 3.7 Finance
- e.g., CA Lakshmi Narayanan. Reads planned-order valuation, projected purchase cash-flow (planned POs × price × due week, flagged for MSME 45-day obligations), WIP value. Read-only.

---

## 4. Functional Requirements

Numbering: `FR-PLN-xxx`. Priority: **M**ust (MVP) / **S**hould (Phase 2) / **C**ould (Phase 3).

### 4.A Demand & Forecast

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PLN-001 | Collect independent demand from sales orders (auto, via SMBD event), manual forecasts, stock-transfer requests, and spares demand into time-bucketed `DemandLine`s (weekly/monthly buckets, configurable). | Confirming an SO in SMBD creates DemandLines within 5 s (event bus). Each line carries source_type + source_ref for pegging. | M |
| FR-PLN-002 | Forecast entry grid: item × period, manual entry + CSV/XLSX import, copy-from-last-year with % uplift. | Import of 500 item-periods completes < 10 s with row-level error report. | M |
| FR-PLN-003 | **Forecast consumption**: per item per bucket, net independent demand = `max(Forecast(t), Orders(t))` — orders consume forecast, never double-count. | Given F=100, O=60 → demand 100 (consumed 60, remaining 40); F=100, O=130 → demand 130. Unit-tested edge cases (zero forecast, orders spanning bucket boundaries per configurable backward/forward consumption window, default backward-then-forward 1 bucket). | M |
| FR-PLN-004 | Forecast freeze/version: freeze a forecast snapshot per cycle; MRP runs reference a frozen version. | Editing a frozen forecast requires new version; runs record forecast_id. | S |
| FR-PLN-005 | Statistical/ML forecast generation per item with model auto-selection (see §13.1) producing qty + confidence interval; planner reviews & accepts into the forecast grid. | AI-generated lines flagged `model != 'manual'`; accuracy (MAPE, bias) tracked per item per model. | S |
| FR-PLN-006 | Forecast accuracy report: MAPE/bias per item/family per period; festival annotations (Diwali, Navratri, monsoon, FY-end). | MAPE computed on consumed periods only; drill to item history chart. | S |

### 4.B Master Production Schedule (MPS)

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PLN-010 | MPS grid for items flagged `is_mps_item`: per bucket show gross demand `max(F,O)`, projected on-hand, MPS receipts (editable), **ATP**, per the exact formulas in §11.3. | Numbers match hand-computed reference case TC-MPS-01 (§16). | M |
| FR-PLN-011 | **Time fences**: demand time fence (frozen — no auto changes, manual override with reason) and planning time fence (firm — MRP may propose but not move). Violations raise warnings. | Editing an MPS receipt inside DTF requires supervisor role + reason; MRP never auto-modifies firmed rows. | M |
| FR-PLN-012 | Firm MPS rows (`firm_flag`) and "Release to MRP" action feeding the run scope. | Firmed receipts are treated as fixed supply in netting; regen never deletes them. | M |
| FR-PLN-013 | RCCP: rough-cut load of the MPS on designated bottleneck work centers using a bill-of-resources (hrs/unit), before full MRP. | Overload > 100% highlights the bucket; drill shows contributing MPS rows. | S |
| FR-PLN-014 | ATP inquiry for Sales: discrete ATP per bucket (formula §11.3), lookup by item/date/qty; CTP (capacity check) in Phase 2. | Sales role can query ATP read-only; result shows earliest bucket covering qty. | M (ATP) / S (CTP) |

### 4.C MRP Run

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PLN-020 | Run configuration: scope (all / item group / single item+where-used), **regenerative or net-change**, include forecast (Y/N), horizon (weeks), lot-size override, plant/warehouse. | Config persisted per run in `mrp_run`; defaults remembered per user. | M |
| FR-PLN-021 | MRP executes as an **async job** (Celery worker, isolated service): level-by-level netting using low-level codes, scrap gross-up, safety stock, lot sizing (L4L/FOQ/MOQ/multiple/EOQ/POQ), lead-time offset — the exact math of §11.4. | POST returns run_id immediately; progress streamed (SSE) — status: queued → exploding L0..Ln → generating exceptions → done. Results match textbook case TC-MRP-01 exactly. | M |
| FR-PLN-022 | **Low-level codes** recomputed on BOM change (event from Engineering) with circular-BOM guard. | Cycle insertion rejected with the offending path listed; LLC job < 5 s for 5k items. | M |
| FR-PLN-023 | **Net-change** re-run processes only items touched since last run (demand/receipt/BOM/inventory deltas) and their affected components. | Net-change result ≡ regenerative result on same data (property test TC-MRP-04); < 10 s for ≤ 200 changed items. | S |
| FR-PLN-024 | Regeneration deletes prior *unfirmed* planned orders in scope; **firmed planned orders and released WOs are never deleted or moved** (only re-exception-flagged). | Regen run leaves firm_flag rows intact; TC-MRP-05. | M |
| FR-PLN-025 | Run log & stats: items planned, planned orders created, exceptions by type, duration per level, warnings (missing lead time, no BOM, inactive routing). | Log downloadable; warnings link to master-data fix screens. | M |
| FR-PLN-026 | What-if simulation runs: execute against a scenario copy, compare planned orders vs baseline, discard or promote. | Simulation never writes to live planned orders; diff view by item. | C |

### 4.D Exceptions (the planner worklist)

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PLN-030 | Generate exception/action messages per planned order & open supply: **Release now, Expedite/Reschedule-in, De-expedite/Reschedule-out, Cancel, Past-due, Shortage (unmet even after planning — e.g., inside lead time), Excess/no-demand supply, BOM/data warning.** | Each exception carries item, order ref, current vs suggested date/qty, severity, peg link. Reference case produces the expected set (TC-EXC-01). | M |
| FR-PLN-031 | Exception worklist as the module **home**: filter/sort/group by type, severity, item, buyer/planner code, work center; bulk accept; snooze with reason + until-date. | Accepting "reschedule-in" updates the firmed order's dates; snoozed items resurface at date. | M |
| FR-PLN-032 | One-click **pegging** from any exception/planned order/WO: full multi-level peg tree up to the demand (SO/forecast) and down to lowest components. | Peg drawer opens < 1 s; every node navigable. | M |
| FR-PLN-033 | "✦ Explain this exception" — AI turns the exception + peg into plain language (English/Hindi), with the evidence rows shown. | Response cites the pegged demand, dates, and quantities actually in the DB (no hallucinated refs). | S |

### 4.E Planned Orders

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PLN-040 | Planned Orders workbench: item, qty, type (make/buy), release/due dates, lot rule applied, source demand (peg), suggested supplier/work center, exception badge, status (planned/firmed/converted). Inline edit of qty/dates (marks firmed). | Grid handles 10k rows (virtualized); saved filters; bulk select. | M |
| FR-PLN-041 | **Firm** planned orders (planner only): firmed orders survive regeneration untouched. | Audit log of who firmed/edited; TC-MRP-05. | M |
| FR-PLN-042 | **Convert**: make → Work Order (copies BOM+routing snapshot, reserves material); buy → Purchase Requisition (supplier defaulted from lead-time/price master); job-work → sub-contract PO + planned GST delivery challan for material issue. | Conversion is transactional; peg preserved onto WO/PR (`source_planned_order`); bulk convert ≤ 200 orders < 15 s. | M (WO/PR), S (job-work) |
| FR-PLN-043 | Split / merge / reschedule a planned order with immediate local re-peg and a net-change flag. | Splitting 100 into 60+40 keeps both pegged to original demand proportionally. | S |

### 4.F Capacity

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PLN-050 | Work center master: capacity_type (finite/infinite), efficiency %, utilization %, cost/hr, machines count; shifts (start/end/days/breaks) and exception calendar (holidays, maintenance blocks from Maintenance module). | `Available_Capacity = machines × shift hours × utilization × efficiency` per §11.6; calendar overrides shifts. | M |
| FR-PLN-051 | Infinite-capacity load report (CRP): per work center × week, `Load = Σ(setup + run)` of planned + released operations; Load% with green (< 85) / amber (85–100) / red (> 100) bands; heatmap + drillable bar chart. | Overloaded cell drill lists contributing orders with move/level actions. Matches TC-CAP-01. | M |
| FR-PLN-052 | Load leveling actions: move order to alternate work center (from routing alternates), shift to adjacent week, add shift/overtime (updates calendar) — each action re-computes load instantly. | Every action logged; capacity recalc < 2 s for one WC. | S |
| FR-PLN-053 | Bottleneck prediction: N-week-ahead overload forecast from the planned-order pipeline (see §13.4). | Weekly digest flags WCs predicted > 95% with ≥ 70% precision after 3 months of data. | C |

### 4.G Finite Scheduling (APS)

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PLN-060 | Machine-row Gantt of WO operations with **drag-drop resequence**, snap-to-calendar, changeover blocks rendered between ops, material-availability and precedence violations highlighted live. | Dragging an op re-flows successors on that machine; violations shown < 200 ms; 500 ops render at 60 fps (desktop only). | M (board), S (full APS rules) |
| FR-PLN-061 | Scheduling engine (isolated service): **forward, backward, and bottleneck-first** strategies; dispatching heuristics (EDD, SPT, CR, ATCS) for instant results; optional **CP-SAT optimization** (OR-Tools) minimizing weighted tardiness + setup time, respecting the **sequence-dependent changeover matrix**, calendars, and material availability (time-limited anytime search). | Heuristic schedule for 300 ops < 5 s; CP-SAT improves total setup+tardiness vs heuristic on benchmark set; never loads a finite WC past 100%. TC-SCH-01/02. | S (heuristics) / C (CP-SAT at scale) |
| FR-PLN-062 | Changeover matrix per work center keyed by attribute (material family, colour, tool): `setup(i→j)` minutes. | Matrix editable grid; scheduler and Gantt both consume it; TC-SCH-02. | S |
| FR-PLN-063 | Lock operations / freeze horizon (e.g., next 24 h locked); **publish dispatch list** per machine (versioned, requires Plant Manager approval), pushed to operator tablets & printable. | Publishing creates immutable schedule version; operators see only published sequence. | M (publish) |
| FR-PLN-064 | Disruption re-schedule: machine-breakdown or material-delay event proposes a minimal-disruption repair schedule for approval (never auto-publishes). | Proposal shows moved ops + delta to due dates; one-click accept/reject. | C |

### 4.H Work Orders

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PLN-070 | WO lifecycle: Draft → Released → In-process → Completed → Closed (+ Cancelled, Hold). Header (item, qty, dates, BOM/routing snapshot, warehouse, source planned order) + operations + required materials. | Status transitions role-guarded; snapshot immune to later BOM edits (ECO triggers a warning, not silent change). | M |
| FR-PLN-071 | Release reserves materials (allocated_qty on WO_Material against on-hand); shortage list = required − allocated where short, by WO need date (kitting readiness). | Release blocked (with override) if a critical material is short; shortage list phone-friendly. | M |
| FR-PLN-072 | Operation reporting: start/stop, qty done, scrap, downtime reason from operator UI; completion posts FG receipt; deviations (late op, scrap over %) raise a **net-change re-plan trigger** and schedule-adherence data. | Reporting round-trip < 3 s on plant Wi-Fi tablet; scrap > BOM scrap% flags exception. | M |
| FR-PLN-073 | Sub-contract WO variant: material issue via GST delivery challan (job-work, ITC-04 reference), vendor operation, receipt back with reconciliation of issued vs consumed. | Challan doc numbers sequential per FY; pending-at-vendor report by age (ITC-04 quarters). | S |

### 4.I Reorder Policies & Inventory Planning

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PLN-080 | Per item × warehouse policy: min/max, ROP, EOQ, safety stock, service level, review period; ABC class auto-computed (annual consumption value 80/15/5). | Policy engine generates replenishment DemandLines/requisitions when projected on-hand < ROP (respecting open supply). Odoo-style conflict guard: an item is planned by **either** MPS/MRP **or** reorder rules, never both (validation V-08). | M |
| FR-PLN-081 | EOQ calculator: `EOQ = sqrt(2DS/H)` with editable D, S, H; result writable to policy. | Matches hand calc (§20.9). | M |
| FR-PLN-082 | Dynamic safety stock recompute: `SS = Z × sqrt(LT·σd² + d²·σLT²)` from demand history and learned lead-time stats, per target service level; batch "recalc all" proposes new values for approval. | Proposed vs current diff view; approval writes with audit; TC-SS-01. | S |
| FR-PLN-083 | Days-of-cover and projected on-hand chart per item; dead/slow stock flag (no consumption N days). | Projection = time-phased `Projected_Available` from last run. | S |

---

## 5. Non-functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01 | **Regenerative MRP run time** — 5,000 items, 8-level BOMs, 26-week horizon, ~50k demand/supply rows | < 60 s wall clock on the reference VM (8 vCPU/16 GB). Design: set-based netting per LLC level (one SQL pass per level pulls all items at that level), computation in vectorized Python (NumPy/pandas) inside the worker — the SAP MRP Live lesson: push work to the database / process levels in bulk, not item-by-item round-trips. |
| NFR-02 | **Net-change run** — ≤ 200 changed items + affected where-used closure | < 10 s. (Note: D365 Planning Optimization dropped net-change in favour of fast full regens; we keep both — fast regen as the correctness baseline, net-change for interactive loops, with the equivalence property test TC-MRP-04 as the guardrail.) |
| NFR-03 | **Scheduler-as-a-service isolation** — MRP engine and finite scheduler run as separate Celery worker pools (separate queues `mrp`, `scheduler`), independently scalable and deployable; a runaway CP-SAT solve can never starve MRP or the API. | Hard time limits: heuristic pass ≤ 10 s; CP-SAT anytime limit configurable 30–300 s; worker memory cap; kill-switch endpoint. |
| NFR-04 | Interactive API latency | p95 < 300 ms for grids/lists; pegging tree < 1 s for 8 levels; ATP lookup < 500 ms. |
| NFR-05 | Concurrency & consistency | One MRP run per plant at a time (advisory lock); runs read a consistent snapshot (REPEATABLE READ); UI shows "data as of run #, ts". |
| NFR-06 | Scale envelope (SME) | 10k items, 100 work centers, 50 concurrent users, 2k WOs open, 5 plants (data-scoped). |
| NFR-07 | Availability & ops | Single-VM Docker Compose demo; pilot 99.5% business-hours; nightly pg_dump + WAL archiving; on-prem installable (DPDP-friendly, no data leaves plant if customer opts). |
| NFR-08 | Auditability | Every firm/convert/publish/override is an immutable audit row (who, when, before/after). Plans and schedule versions are never hard-deleted. |
| NFR-09 | Localization & accessibility | UI strings externalized (en, hi at launch; ta, mr next); ₹ formatting with lakh/crore grouping; WCAG AA on planner screens. |
| NFR-10 | Run progress transparency | SSE progress events at least every 2 s during a run; resumable status via polling fallback (Celery `update_state` pattern — standard FastAPI+Celery+Redis practice). |

---

## 6. UI/UX Flow — the planner's loop

The module opens on the **Exception Worklist** (worklist-first principle from the design system). The core daily loop:

```
┌────────────┐   ┌─────────────┐   ┌────────────┐   ┌───────────────┐   ┌────────────────┐   ┌──────────────────┐
│ 1. Run MRP │ → │ 2. Work the │ → │ 3. Firm &  │ → │ 4. Capacity   │ → │ 5. Finite      │ → │ 6. Publish       │
│  (or auto- │   │  exception  │   │  convert   │   │  heatmap —    │   │  schedule board│   │  dispatch list   │
│  nightly)  │   │  worklist   │   │  planned   │   │  level red    │   │  drag/optimize │   │  (mgr approves)  │
│            │   │             │   │  orders    │   │  cells        │   │                │   │                  │
└────────────┘   └─────────────┘   └────────────┘   └───────────────┘   └────────────────┘   └──────────────────┘
        ↑                                                                                             │
        └──────────────── shop-floor reporting / GRN / SO changes → net-change re-plan ◄──────────────┘
```

**Principles (from the shared design system):**
- **Pegging one click everywhere.** Every row that represents supply or demand (exception, planned order, WO, MPS cell, shortage line) has a peg icon opening the pegging tree drawer. This is the module's signature interaction.
- **Guided guarded actions.** Firm, Convert, Publish are single deliberate buttons with an inline readiness check (material? capacity? time fence?) and a confirmation summarizing consequences.
- **Plain language + tooltips.** MRP, ATP, RCCP, L4L, EDD all carry hover explanations; exception texts are sentences, not codes ("Move PO-2213 in by 5 days — casting arrives after the machining slot").
- **Command bar** (top-centre): global search + "ask the AI planner" (English/Hindi), e.g., "why is WO-2026-0142 late?".
- **Mobile:** exception approve/snooze, shortage list, WO status, ATP lookup are phone-first. The Gantt, MPS grid, and changeover matrix are desktop-only (a read-only "today at machine X" mobile view exists for the schedule).
- **Breadcrumbs & drill:** Demand ↔ MPS ↔ MRP result ↔ Planned Order ↔ Work Order ↔ Operation; parallel drill by work center into Capacity/Schedule.

---

## 7. Screen-by-Screen Design

### 7.1 Demand / Forecast Workbench
- **Layout:** left rail of item families + saved filters; main area = editable **item × period grid** (columns: buckets W29…W54 or months; row groups per item: Forecast, Actual Orders, Consumed, Net Demand). Right panel: item history chart (24 months actual vs forecast, festival markers) + model card (model used, MAPE, bias).
- **Fields:** forecast qty (editable unless frozen), actual orders (read-only, drill to SO), consumed forecast, net demand `max(F,O)`, forecast model, accuracy.
- **Actions:** Import (CSV/XLSX), Edit inline, Freeze version, ✦ Run AI forecast (per item/family — proposals appear in a review diff, planner accepts), copy-last-year +x%.
- **States:** Draft / Frozen (badge + lock); AI-proposed cells shown with dashed border until accepted.
- **Mobile:** read-only summary per item; no grid editing.

### 7.2 MPS Board
- **Layout:** grid of MPS items (rows, grouped by family) × weekly buckets. Sub-rows per item: Gross demand (max(F,O)), Scheduled receipts, **Projected on-hand**, **MPS receipt** (editable), **ATP**. Time-fence shading: red zone (inside DTF, frozen), amber (inside PTF, firm), white (free).
- **Fields:** as above + firm flag per cell, safety stock line, lot rule hint.
- **Actions:** edit MPS receipt (guarded inside fences), Firm row/cell, Run RCCP (bottleneck load strip appears under the grid), Release to MRP, ATP lookup popover for Sales.
- **States:** cell badges — negative projected on-hand (red), ATP < 0 (red), fence-violating edit pending approval (amber).
- **Mobile:** ATP lookup only.

### 7.3 MRP Run
- **Layout:** left = run configuration form (two-column): scope (plant, item group, single item + where-used), type (Regenerative / Net-change), include forecast toggle, horizon weeks, lot-size override, simulation toggle. Right = run history table (run #, type, ts, duration, items planned, exceptions by severity, status) with log drawer.
- **Actions:** **Run MRP** (primary button) → progress panel with live SSE stages ("Exploding level 2 of 5 — 1,840/3,200 items…"), Cancel run, View log, Compare (simulation vs live).
- **States:** queued / running (progress %) / done / failed (error with master-data links) / cancelled. Nightly auto-run indicator with schedule editor.
- **Mobile:** trigger run + watch progress; results open the worklist.

### 7.4 MRP Results / Exceptions (module home)
- **Layout:** KPI strip (exceptions outstanding by severity, past-due count, shortage count, run freshness). Main = the **exception worklist table**: severity dot, type chip (Release / Reschedule-in / Reschedule-out / Cancel / Past-due / Shortage / Data), item + description, order ref, current date/qty → suggested date/qty, days delta, pegged demand (chip: "SO-1042 · Kirloskar dealer · 05-Aug"), planner code. Group-by toggle (type / item / buyer / work center).
- **Actions:** Accept (applies suggestion), Accept all in group, Snooze (reason + date), open **Pegging drawer**, "✦ Explain", drill to planned order.
- **States:** new / snoozed / actioned / auto-resolved (disappeared after re-run — kept in history).
- **Mobile:** card list with swipe accept/snooze — the flagship mobile surface.

### 7.5 Planned Orders Workbench
- **Layout:** virtualized table: checkbox, item, description, type (make/buy/job-work), qty (inline-edit), UOM, release date, due date (inline-edit), lot rule applied, source demand peg chip, supplier / work center, exception badge, status (Planned / Firm / Converted).
- **Actions:** Firm (bulk), Convert → WO / PR / job-work PO (bulk, with confirmation summary: "12 WOs, 5 PRs will be created; 2 items short of material"), Split, Reschedule, open peg.
- **States:** row tint for firmed; converted rows locked with link to WO/PR; exception badge colours.
- **Mobile:** approve-firm list (no bulk edit).

### 7.6 Capacity / Load — Heatmap + Gantt
- **Layout:** top = **heatmap**: work centers (rows) × weeks (columns), cell = Load% coloured green < 85 / amber 85–100 / red > 100, cell tooltip shows load h vs available h. Below = per-WC detail on click: stacked bar of load by order + available-capacity line, and an infinite-capacity Gantt strip of contributing operations.
- **Actions:** drill cell → contributing orders list (move to alternate WC, shift week, split); "Add shift/overtime" (edits calendar with approval); Level (auto-suggest moves — Phase 2); jump to Schedule board filtered to this WC.
- **States:** WC marked finite/infinite; maintenance blocks hatched; predicted-bottleneck icon (Phase 3).
- **Mobile:** read-only heatmap (plant manager's favourite).

### 7.7 Scheduling Board (Finite / APS) — desktop only
- **Layout:** machine-row **Gantt**: one row per machine/work center, operation blocks (WO no., item, qty, duration) coloured by product family; **changeover blocks** rendered as hatched grey wedges between ops sized by the matrix; shift/calendar background shading (non-working greyed); "now" line; late-op red outline; material-not-ready icon.
- **Actions:** drag-drop resequence/move across machines (allowed alternates only), auto-flow successors; **Auto-optimize** (strategy picker: Forward / Backward from due dates / Bottleneck-first; objective: minimize tardiness / setups / balanced) with before/after KPI diff (total setup h, late orders, makespan); Lock op / freeze horizon slider; **Publish dispatch list** (→ Plant Manager approval → versioned, operators notified).
- **States:** draft schedule vs published version banner; violations panel (precedence, material, calendar) live-updating; optimization running spinner with anytime "best so far".
- **Mobile:** read-only "my machine today" sequence list for operators.

### 7.8 Work Order
- **Layout:** header card (WO no., item, qty, warehouse, planned start/end, status pill, source planned order peg chip, BOM/routing snapshot version) + tabs: **Operations** (seq, work center, setup/run, sched vs actual, qty done, scrap), **Materials** (required / allocated / issued, shortage highlight), **History/audit**.
- **Actions:** Release (runs readiness check: material allocated? routing valid? — override with reason), Issue material (to stores), Report progress (operator view), Complete/Close, Print job card (with QR), Cancel/Hold.
- **States:** Draft / Released / In-process / Completed / Closed / Hold / Cancelled; late badge if sched_end < today and not done; ECO-changed warning banner.
- **Mobile:** status view + operation reporting (operator tablet).

### 7.9 Reorder / Inventory Planning
- **Layout:** table item × warehouse: on-hand, projected on-hand sparkline, days-of-cover, ABC class, policy (min/max / ROP / EOQ), min, max, ROP, safety stock (current vs ✦ proposed), EOQ, service level, review period.
- **Actions:** Recalc safety stock (bulk ✦ proposal diff → approve), Recalc EOQ (editable D/S/H popover), Replenish now (creates requisition), edit policy.
- **States:** below-ROP rows red; dead/slow-stock chip; "planned by MRP" lock chip (conflict guard V-08).
- **Mobile:** below-ROP list with replenish action.

### 7.10 Planning Dashboard
- KPI cards (design-system standard: big number, plain label, trend delta, sparkline): Exceptions outstanding · Capacity load % (plant) · Schedule adherence % · OTIF % · Forecast accuracy (MAPE) · Projected inventory value (₹, lakh/crore).
- Charts: capacity heatmap (mini), inventory projection line, forecast vs actual, late-WO aging bars; planned-PO cash-flow by week (₹) with MSME 45-day markers.

---

## 8. Navigation

Second-level in-module rail (persistent left, under the IND-CORE module rail):

**Demand · MPS · Run MRP · Planned Orders · Capacity · Schedule · Work Orders · Reorder · Dashboard**

- **Module home = Exception Worklist** (MRP Results) — the "what needs me now" list, per the worklist-first design rule. The rail badge shows outstanding exception count.
- Global command bar top-centre (search + ✦ ask-the-planner). Breadcrumbs on every screen.
- Deep links: every entity URL-addressable (`/planning/planned-orders/PLO-2026-04412`), enabling peg-tree navigation, notifications, and AI-answer citations.
- Role-based landing: Planner → Exceptions; Plant Manager → Capacity; Stores → Shortage list; Procurement → Planned Orders (buy filter); Operator → My Machine (published sequence).

---

## 9. Database Schema (PostgreSQL 16)

Follows the PLANNING reference model verbatim, hardened with types, constraints, and indexes. Engineering module owns `item`, `bom`, `routing` tables (shown here for completeness — Planning adds `low_level_code`, `abc_class` columns via migration). All tables carry `plant_id` scoping and `created_at/updated_at/created_by` audit columns (omitted below for brevity except where structural).

```sql
-- ============ MASTER DATA (Engineering-owned, Planning-extended) ============
CREATE TABLE item (
  item_id        BIGSERIAL PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  item_type      TEXT NOT NULL CHECK (item_type IN ('MTS','MTO','ETO')),
  make_or_buy    TEXT NOT NULL CHECK (make_or_buy IN ('make','buy','job_work')),
  uom            TEXT NOT NULL,
  is_mps_item    BOOLEAN NOT NULL DEFAULT FALSE,
  std_cost       NUMERIC(14,2) NOT NULL DEFAULT 0,        -- ₹
  abc_class      CHAR(1) CHECK (abc_class IN ('A','B','C')),
  low_level_code SMALLINT NOT NULL DEFAULT 0,             -- recomputed on BOM change
  planner_code   TEXT,                                     -- worklist routing
  is_active      BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_item_llc ON item (low_level_code) WHERE is_active;  -- level-by-level MRP scan

CREATE TABLE bom (
  bom_id         BIGSERIAL PRIMARY KEY,
  parent_item_id BIGINT NOT NULL REFERENCES item,
  qty            NUMERIC(14,4) NOT NULL DEFAULT 1,
  uom            TEXT NOT NULL,
  version        TEXT NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  is_default     BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (parent_item_id, version)
);
CREATE UNIQUE INDEX uq_bom_default ON bom (parent_item_id) WHERE is_default AND is_active;

CREATE TABLE bom_line (
  bom_line_id       BIGSERIAL PRIMARY KEY,
  bom_id            BIGINT NOT NULL REFERENCES bom ON DELETE CASCADE,
  component_item_id BIGINT NOT NULL REFERENCES item,
  qty_per           NUMERIC(14,6) NOT NULL CHECK (qty_per > 0),
  scrap_pct         NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (scrap_pct >= 0 AND scrap_pct < 100),
  operation_seq     SMALLINT                                -- material needed at this op
);
CREATE INDEX idx_bomline_component ON bom_line (component_item_id);   -- where-used / net-change closure

CREATE TABLE routing (
  routing_id BIGSERIAL PRIMARY KEY,
  item_id    BIGINT NOT NULL REFERENCES item,
  is_default BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE routing_op (
  op_id             BIGSERIAL PRIMARY KEY,
  routing_id        BIGINT NOT NULL REFERENCES routing ON DELETE CASCADE,
  seq               SMALLINT NOT NULL,
  work_center_id    BIGINT NOT NULL,                        -- FK below
  setup_time_min    NUMERIC(10,2) NOT NULL DEFAULT 0,
  run_time_per_unit NUMERIC(10,4) NOT NULL DEFAULT 0,       -- minutes
  move_time_min     NUMERIC(10,2) NOT NULL DEFAULT 0,
  queue_time_min    NUMERIC(10,2) NOT NULL DEFAULT 0,
  alt_work_center_ids BIGINT[] DEFAULT '{}',                -- scheduler alternates
  UNIQUE (routing_id, seq)
);

-- ============ CAPACITY ============
CREATE TABLE work_center (
  wc_id          BIGSERIAL PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  plant_id       BIGINT NOT NULL,
  capacity_type  TEXT NOT NULL CHECK (capacity_type IN ('finite','infinite')) DEFAULT 'infinite',
  machines_count SMALLINT NOT NULL DEFAULT 1,
  cost_per_hr    NUMERIC(12,2) NOT NULL DEFAULT 0,          -- ₹/hr
  efficiency_pct  NUMERIC(5,2) NOT NULL DEFAULT 100,
  utilization_pct NUMERIC(5,2) NOT NULL DEFAULT 100,
  is_bottleneck  BOOLEAN NOT NULL DEFAULT FALSE,            -- RCCP set
  changeover_attr TEXT                                       -- e.g. 'material_family'
);

CREATE TABLE shift (
  shift_id   BIGSERIAL PRIMARY KEY,
  wc_id      BIGINT NOT NULL REFERENCES work_center ON DELETE CASCADE,
  name       TEXT NOT NULL,                                  -- 'A','B','General'
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  days_mask  SMALLINT NOT NULL DEFAULT 63,                   -- bit 0=Mon .. 6=Sun (63 = Mon–Sat)
  break_min  SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE calendar (                                      -- date-level exceptions & materialized availability
  cal_id          BIGSERIAL PRIMARY KEY,
  wc_id           BIGINT NOT NULL REFERENCES work_center ON DELETE CASCADE,
  cal_date        DATE NOT NULL,
  available_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  holiday_flag    BOOLEAN NOT NULL DEFAULT FALSE,            -- plant holiday / maintenance
  note            TEXT,
  UNIQUE (wc_id, cal_date)
);

CREATE TABLE changeover_matrix (
  id          BIGSERIAL PRIMARY KEY,
  wc_id       BIGINT NOT NULL REFERENCES work_center ON DELETE CASCADE,
  from_attr   TEXT NOT NULL,                                 -- e.g. 'SS304'
  to_attr     TEXT NOT NULL,                                 -- e.g. 'CI'
  setup_min   NUMERIC(8,2) NOT NULL CHECK (setup_min >= 0),
  UNIQUE (wc_id, from_attr, to_attr)
);

-- ============ DEMAND ============
CREATE TABLE forecast (
  forecast_id BIGSERIAL PRIMARY KEY,
  item_id     BIGINT NOT NULL REFERENCES item,
  plant_id    BIGINT NOT NULL,
  model       TEXT NOT NULL DEFAULT 'manual',                -- manual|croston|ets|lightgbm|copy_ly
  horizon_weeks SMALLINT NOT NULL DEFAULT 26,
  version     INT NOT NULL DEFAULT 1,
  is_frozen   BOOLEAN NOT NULL DEFAULT FALSE,
  mape_pct    NUMERIC(6,2), bias_pct NUMERIC(6,2)
);
CREATE TABLE forecast_line (
  id           BIGSERIAL PRIMARY KEY,
  forecast_id  BIGINT NOT NULL REFERENCES forecast ON DELETE CASCADE,
  period_start DATE NOT NULL,                                -- bucket start (Monday)
  qty          NUMERIC(14,4) NOT NULL CHECK (qty >= 0),
  consumed_qty NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (consumed_qty >= 0),
  ci_low NUMERIC(14,4), ci_high NUMERIC(14,4),               -- AI confidence interval
  UNIQUE (forecast_id, period_start)
);

CREATE TABLE demand_line (
  id           BIGSERIAL PRIMARY KEY,
  source_type  TEXT NOT NULL CHECK (source_type IN ('SO','forecast','transfer','spare','reorder')),
  source_ref   TEXT NOT NULL,                                -- SO-1042 / FC-88 / TR-12
  item_id      BIGINT NOT NULL REFERENCES item,
  qty          NUMERIC(14,4) NOT NULL CHECK (qty > 0),
  need_date    DATE NOT NULL,
  warehouse_id BIGINT NOT NULL,
  plant_id     BIGINT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','planned','closed','cancelled'))
);
CREATE INDEX idx_demand_item_date ON demand_line (item_id, need_date) WHERE status = 'open';

-- ============ MPS ============
CREATE TABLE mps (
  mps_id       BIGSERIAL PRIMARY KEY,
  item_id      BIGINT NOT NULL REFERENCES item,
  plant_id     BIGINT NOT NULL,
  period_start DATE NOT NULL,
  gross_demand NUMERIC(14,4) NOT NULL DEFAULT 0,             -- max(F,O) snapshot
  proj_on_hand NUMERIC(14,4) NOT NULL DEFAULT 0,
  mps_receipt  NUMERIC(14,4) NOT NULL DEFAULT 0,
  atp          NUMERIC(14,4) NOT NULL DEFAULT 0,
  time_fence   TEXT NOT NULL DEFAULT 'free' CHECK (time_fence IN ('frozen','firm','free')),
  firm_flag    BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (item_id, plant_id, period_start)
);

-- ============ MRP ============
CREATE TABLE mrp_run (
  run_id           BIGSERIAL PRIMARY KEY,
  plant_id         BIGINT NOT NULL,
  run_type         TEXT NOT NULL CHECK (run_type IN ('regen','netchange','simulation')),
  scope            JSONB NOT NULL DEFAULT '{}',              -- {item_group, item_ids, include_forecast, lot_override}
  horizon_weeks    SMALLINT NOT NULL,
  run_ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
  status           TEXT NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','running','done','failed','cancelled')),
  items_planned    INT DEFAULT 0,
  exceptions_count INT DEFAULT 0,
  duration_ms      INT,
  log              JSONB DEFAULT '[]',
  celery_task_id   TEXT
);

CREATE TABLE planned_order (
  plo_id         BIGSERIAL PRIMARY KEY,
  run_id         BIGINT REFERENCES mrp_run,
  item_id        BIGINT NOT NULL REFERENCES item,
  plant_id       BIGINT NOT NULL,
  order_type     TEXT NOT NULL CHECK (order_type IN ('make','buy','job_work','transfer')),
  qty            NUMERIC(14,4) NOT NULL CHECK (qty > 0),
  release_date   DATE NOT NULL,
  due_date       DATE NOT NULL CHECK (due_date >= release_date),
  lot_rule       TEXT NOT NULL DEFAULT 'L4L'
                 CHECK (lot_rule IN ('L4L','FOQ','MOQ','MULT','EOQ','POQ')),
  supplier_id    BIGINT,                                     -- buy
  work_center_id BIGINT REFERENCES work_center,              -- make (primary WC hint)
  peg_demand_id  BIGINT REFERENCES demand_line,              -- !! pegging: the demand this order serves
  peg_parent_plo BIGINT REFERENCES planned_order,            -- dependent-demand peg (parent planned order)
  exception_code TEXT,                                       -- latest exception on this order
  firm_flag      BOOLEAN NOT NULL DEFAULT FALSE,
  status         TEXT NOT NULL DEFAULT 'planned'
                 CHECK (status IN ('planned','firm','converted','cancelled'))
);
CREATE INDEX idx_plo_item ON planned_order (item_id, release_date);
CREATE INDEX idx_plo_peg  ON planned_order (peg_demand_id);
CREATE INDEX idx_plo_run  ON planned_order (run_id) WHERE status = 'planned';  -- regen sweep

CREATE TABLE mrp_exception (
  exc_id       BIGSERIAL PRIMARY KEY,
  run_id       BIGINT NOT NULL REFERENCES mrp_run,
  plo_id       BIGINT REFERENCES planned_order,
  ref_type     TEXT NOT NULL CHECK (ref_type IN ('planned_order','work_order','purchase_order','mps','item')),
  ref_id       BIGINT NOT NULL,
  item_id      BIGINT NOT NULL REFERENCES item,
  exc_type     TEXT NOT NULL CHECK (exc_type IN
               ('release_now','reschedule_in','reschedule_out','cancel','past_due',
                'shortage','excess','data_warning','fence_violation')),
  severity     TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  current_date_val DATE, suggested_date DATE,
  current_qty NUMERIC(14,4), suggested_qty NUMERIC(14,4),
  message      TEXT NOT NULL,                                -- plain-language sentence
  status       TEXT NOT NULL DEFAULT 'open'
               CHECK (status IN ('open','snoozed','actioned','auto_resolved')),
  snooze_until DATE, snooze_reason TEXT
);
CREATE INDEX idx_exc_worklist ON mrp_exception (status, severity, exc_type) WHERE status IN ('open','snoozed');

-- ============ EXECUTION ============
CREATE TABLE work_order (
  wo_id        BIGSERIAL PRIMARY KEY,
  wo_no        TEXT NOT NULL UNIQUE,                         -- 'WO-2026-0142'
  item_id      BIGINT NOT NULL REFERENCES item,
  bom_id       BIGINT NOT NULL REFERENCES bom,               -- snapshot reference
  routing_id   BIGINT NOT NULL REFERENCES routing,
  qty          NUMERIC(14,4) NOT NULL CHECK (qty > 0),
  qty_done     NUMERIC(14,4) NOT NULL DEFAULT 0,
  planned_start DATE NOT NULL,
  planned_end   DATE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','released','in_process','completed','closed','hold','cancelled')),
  source_planned_order BIGINT REFERENCES planned_order,      -- peg chain continues
  warehouse_id BIGINT NOT NULL,
  plant_id     BIGINT NOT NULL,
  is_subcontract BOOLEAN NOT NULL DEFAULT FALSE,
  subcontract_vendor_id BIGINT, challan_no TEXT              -- job-work GST challan
);
CREATE INDEX idx_wo_status ON work_order (plant_id, status, planned_end);

CREATE TABLE wo_operation (
  woo_id       BIGSERIAL PRIMARY KEY,
  wo_id        BIGINT NOT NULL REFERENCES work_order ON DELETE CASCADE,
  seq          SMALLINT NOT NULL,
  work_center_id BIGINT NOT NULL REFERENCES work_center,
  setup_min    NUMERIC(10,2) NOT NULL DEFAULT 0,
  run_min      NUMERIC(12,2) NOT NULL DEFAULT 0,             -- total for WO qty
  sched_start  TIMESTAMPTZ, sched_end TIMESTAMPTZ,           -- finite scheduler writes
  actual_start TIMESTAMPTZ, actual_end TIMESTAMPTZ,
  qty_done     NUMERIC(14,4) NOT NULL DEFAULT 0,
  scrap_qty    NUMERIC(14,4) NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','ready','running','done','skipped')),
  locked       BOOLEAN NOT NULL DEFAULT FALSE,               -- scheduler freeze
  UNIQUE (wo_id, seq)
);
CREATE INDEX idx_woo_wc_sched ON wo_operation (work_center_id, sched_start);   -- Gantt fetch

CREATE TABLE wo_material (
  id           BIGSERIAL PRIMARY KEY,
  wo_id        BIGINT NOT NULL REFERENCES work_order ON DELETE CASCADE,
  item_id      BIGINT NOT NULL REFERENCES item,
  required_qty  NUMERIC(14,4) NOT NULL,
  allocated_qty NUMERIC(14,4) NOT NULL DEFAULT 0,
  issued_qty    NUMERIC(14,4) NOT NULL DEFAULT 0,
  CHECK (allocated_qty >= 0 AND issued_qty >= 0)
);

CREATE TABLE schedule_version (
  sv_id        BIGSERIAL PRIMARY KEY,
  plant_id     BIGINT NOT NULL,
  published_by BIGINT, approved_by BIGINT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot     JSONB NOT NULL,                               -- [{woo_id, wc_id, start, end, seq}]
  kpis         JSONB                                          -- setup h, late count, makespan
);

-- ============ POLICIES & SUPPORT ============
CREATE TABLE reorder_policy (
  id            BIGSERIAL PRIMARY KEY,
  item_id       BIGINT NOT NULL REFERENCES item,
  warehouse_id  BIGINT NOT NULL,
  policy        TEXT NOT NULL CHECK (policy IN ('minmax','ROP','EOQ')),
  min_qty NUMERIC(14,4), max_qty NUMERIC(14,4),
  rop NUMERIC(14,4), safety_stock NUMERIC(14,4) NOT NULL DEFAULT 0,
  eoq NUMERIC(14,4),
  service_level NUMERIC(4,3) DEFAULT 0.95,                   -- → Z
  review_period_days SMALLINT DEFAULT 7,
  ss_proposed NUMERIC(14,4), ss_proposed_at TIMESTAMPTZ,     -- AI proposal awaiting approval
  UNIQUE (item_id, warehouse_id)
);

CREATE TABLE lead_time (
  id            BIGSERIAL PRIMARY KEY,
  item_id       BIGINT NOT NULL REFERENCES item,
  supplier_id   BIGINT,                                      -- NULL = mfg lead
  mfg_lead_days      SMALLINT,
  purchase_lead_days SMALLINT,
  buffer_days        SMALLINT NOT NULL DEFAULT 0,
  learned_lead_days  NUMERIC(6,1),                           -- from GRN history (AI)
  learned_std_days   NUMERIC(6,2),                           -- σ_LT for dynamic SS
  UNIQUE (item_id, supplier_id)
);

CREATE TABLE purchase_req (
  pr_id       BIGSERIAL PRIMARY KEY,
  pr_no       TEXT NOT NULL UNIQUE,
  source_planned_order BIGINT REFERENCES planned_order,
  item_id     BIGINT NOT NULL REFERENCES item,
  qty         NUMERIC(14,4) NOT NULL CHECK (qty > 0),
  need_date   DATE NOT NULL,
  supplier_id BIGINT,
  est_value   NUMERIC(14,2),                                 -- ₹, cash-flow projection
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open','converted','cancelled'))
);
```

**Cardinality & flow notes**
- `demand_line` / `mps` → `mrp_run` → `planned_order` — **`peg_demand_id` gives top-level pegging; `peg_parent_plo` chains dependent demand**, so the peg tree is walkable in both directions with two indexed self-joins (recursive CTE).
- `planned_order(make)` → `work_order` → `wo_operation` → `work_center`/`calendar` (capacity & schedule); `planned_order(buy)` → `purchase_req` → Purchase module PO; GRNs post back as scheduled receipts.
- `item` ← `bom`/`bom_line` (structure, Engineering-owned) and ← `routing`/`routing_op` (process). `reorder_policy` + `lead_time` feed netting and the lead-time offset.
- Volumes (SME envelope): item ~10k; bom_line ~100k; demand_line ~50k open; planned_order ~30k per regen; wo_operation ~20k open — all comfortably in-memory per LLC level for vectorized netting.
- Scheduled receipts are a **view** (`v_scheduled_receipts`) unioning open PO lines (Purchase), released WOs (qty−qty_done), and in-transit transfers.

---

## 10. API Design (REST, OpenAPI via FastAPI)

Base: `/api/v1/planning`. JWT bearer (access/refresh), RBAC-scoped. All list endpoints: cursor pagination, `?filter=`, `?sort=`. Mutations audited.

### 10.1 MRP runs (async job pattern)
```
POST   /mrp/runs                       # body: {plant_id, run_type, scope, horizon_weeks, include_forecast,
                                       #        lot_override?, simulation?}  → 202 {run_id, status:"queued"}
GET    /mrp/runs/{id}                  # status + stats + log summary (polling fallback)
GET    /mrp/runs/{id}/events           # SSE stream: {stage, level, items_done, items_total, pct, message}
POST   /mrp/runs/{id}/cancel
GET    /mrp/runs?plant_id=&limit=      # run history
GET    /mrp/runs/{id}/log              # full log download
GET    /mrp/runs/{id}/diff?vs={run_id} # simulation vs baseline planned-order diff
```
Pattern (validated best practice for FastAPI + Celery + Redis): POST enqueues on the `mrp` queue and returns immediately; the worker calls `update_state` with progress meta; FastAPI relays via SSE (EventSource-friendly, simpler than WebSocket for one-way progress) with polling as fallback.

### 10.2 Demand & forecast
```
GET/PUT  /forecasts?item_id=&family=          POST /forecasts/import        (multipart CSV/XLSX)
POST     /forecasts/{id}/freeze               POST /forecasts/ai-generate   {item_ids|family, horizon}
GET      /demand-lines?item_id=&status=open   GET  /forecast-accuracy?family=&from=&to=
```

### 10.3 MPS & ATP/CTP
```
GET    /mps?plant_id=&family=&from=&to=       # grid payload (items × buckets, all sub-rows)
PATCH  /mps/{mps_id}                          # edit receipt / firm  (fence rules enforced server-side)
POST   /mps/rccp                              # {item_ids?} → bottleneck load strip
POST   /atp/check                             # {item_id, qty, need_date} → {available, earliest_date, buckets[]}
POST   /ctp/check                             # Phase 2: capacity-aware promise {item_id, qty, need_date}
                                              #   → {promise_date, constraining_wc, what_slips[]}
```

### 10.4 Exceptions & pegging
```
GET    /exceptions?status=open&type=&severity=&group_by=      # the worklist
POST   /exceptions/{id}/accept                # applies suggested date/qty
POST   /exceptions/bulk-accept                # {exc_ids[]}
POST   /exceptions/{id}/snooze                # {until, reason}
GET    /pegging/{ref_type}/{ref_id}           # full up+down peg tree (recursive CTE) → nested JSON
POST   /ai/explain-exception/{exc_id}         # → {text_en, text_hi, evidence_refs[]}
```

### 10.5 Planned orders
```
GET    /planned-orders?type=&status=&exception=&item_id=
PATCH  /planned-orders/{id}                   # qty/date edit → firm
POST   /planned-orders/firm                   # {plo_ids[]}
POST   /planned-orders/convert                # {plo_ids[], target: WO|PR|JOBWORK_PO} → created refs + shortfalls
POST   /planned-orders/{id}/split             # {qtys:[60,40]}
```

### 10.6 Capacity & scheduling
```
GET    /capacity/load?plant_id=&from=&to=     # heatmap dataset [{wc_id, week, load_h, avail_h, pct}]
GET    /capacity/load/{wc_id}?week=           # contributing operations
POST   /capacity/level                        # Phase 2 auto-level suggestions
GET    /schedule/board?plant_id=&from=&to=    # Gantt dataset: ops + changeovers + calendar shading
PATCH  /schedule/operations/{woo_id}          # drag-drop: {work_center_id, sched_start} → re-flow + violations[]
POST   /schedule/optimize                     # {plant_id, strategy: forward|backward|bottleneck,
                                              #  objective, time_limit_s} → 202 job_id  (queue: scheduler)
GET    /schedule/optimize/{job_id}/events     # SSE: best-so-far KPIs (anytime CP-SAT)
POST   /schedule/lock                         # {woo_ids[]} / freeze-horizon
POST   /schedule/publish                      # → approval task for Plant Manager → schedule_version
GET    /schedule/versions/{sv_id}             # published dispatch list (operator view, printable)
```

### 10.7 Work orders & reorder
```
GET/POST /work-orders            GET /work-orders/{id}
POST   /work-orders/{id}/release | /issue-material | /hold | /complete | /close
POST   /work-orders/{id}/operations/{seq}/report    # {qty_done, scrap, downtime_reason, start|stop}
GET    /shortages?plant_id=                          # kitting readiness list
GET/PUT /reorder-policies?warehouse_id=
POST   /reorder-policies/recalc-ss                   # {item_ids[]|all} → proposals (approval required)
POST   /reorder-policies/{id}/approve-ss
POST   /reorder-policies/replenish                   # below-ROP → requisitions
```

### 10.8 Events (internal bus — Redis streams)
| Event | Producer → Consumer | Effect |
|---|---|---|
| `so.confirmed` | SMBD → Planning | create demand_lines; net-change flag |
| `eco.released` | Engineering → Planning | LLC recompute; affected-item net-change; WO snapshot warnings |
| `grn.posted` | Purchase → Planning | scheduled receipts refresh; lead-time learning sample |
| `wo.op_reported` | Shop floor → Planning | adherence stats; deviation → net-change trigger |
| `machine.down` | Maintenance → Planning | calendar block; reschedule proposal (Phase 3) |
| `mrp.completed` / `schedule.published` | Planning → all | worklist badge refresh; operator notification |

---

## 11. Backend Logic

The planning engine lives in `services/planning-engine/` (Python 3.12, runs in the `mrp` Celery queue); the finite scheduler in `services/scheduler/` (`scheduler` queue). Both are pure-function cores (testable without DB) with thin I/O shells. **The formulas below are the PLANNING spec verbatim — implement exactly.**

### 11.1 Low-level code (LLC) computation
Every item is planned once, at the deepest level it occurs in any BOM.
```python
def compute_llc(items, bom_edges):          # bom_edges: (parent_id, component_id)
    llc = {i: 0 for i in items}
    # Kahn topological order over the BOM DAG; raises CircularBOMError with the cycle path
    order = topological_sort(bom_edges)      # cycle → reject (validation V-05)
    for parent in order:
        for comp in children(parent):
            llc[comp] = max(llc[comp], llc[parent] + 1)
    return llc                               # persisted to item.low_level_code
```
Triggered by `eco.released` / BOM edit events; full recompute < 5 s for 5k items (pure in-memory graph).

### 11.2 Forecast consumption
Per item per bucket: `net_independent_demand(t) = max(Forecast(t), Orders(t))`.
Consumption bookkeeping: `consumed_qty(t) = min(Forecast(t), Orders(t))`; unconsumed remainder = `Forecast − Orders` when positive. Configurable consumption window (default: an order first consumes its own bucket's forecast, then backward 1 bucket, then forward 1) — but **the demand fed to MPS/MRP is always the per-bucket `max(F, O)` after window redistribution**.

### 11.3 MPS — projected on-hand & ATP (spec verbatim)
```
Projected_On_Hand(t) = On_Hand(t-1) + MPS_Receipt(t) - max(Forecast(t), Orders(t))
ATP(t)               = MPS_Receipt(t) + uncommitted_stock
                        - Σ customer_orders(until next MPS receipt)
```
- `uncommitted_stock` applies only in the first bucket (on-hand minus allocations).
- Discrete ATP: computed only in buckets with an MPS receipt (and bucket 1); intermediate buckets inherit. Negative ATP triggers a `data_warning` exception on the MPS row.
- Time fences: bucket ≤ DTF → `frozen`; ≤ PTF → `firm`; else `free`.

### 11.4 MRP netting — level-by-level (spec verbatim)
Process items in ascending `low_level_code`. For each item, per period t:
```
Gross_Req(t) = Σ (parent planned-order releases in t × qty_per) × 1/(1 - scrap%)   # dependent demand
             + independent demand (MPS releases for end items; spares/service)

Net_Req(t)   = Gross_Req(t) - Scheduled_Receipts(t) - Projected_Available(t-1) + Safety_Stock
   if Net_Req(t) <= 0 → no order
   else              → planned order sized by the lot rule to cover the shortfall

Projected_Available(t) = Available(t-1) + Scheduled_Receipts(t) + Planned_Receipts(t) - Gross_Req(t)
```
Implementation notes:
- `Projected_Available(0)` = on-hand − allocations (never assume negative on-hand: floor at 0 with a `data_warning`, validation V-01).
- Scrap gross-up applies at the **parent→component explosion** step using the BOM line's `scrap_pct`; round up to UOM precision.
- Firmed planned orders and released WOs/POs enter as `Scheduled_Receipts` at their **current** dates — the engine may only emit reschedule exceptions against them (FR-PLN-024).
- Safety stock behaves as a floor: a period may dip usable stock into SS only by emitting a `shortage` exception.

**Lot sizing (applied to Net_Req):**
```
L4L                 = exactly Net_Req                       # min inventory, default for MTO
FOQ / MOQ / MULT    = fixed qty / round up to MOQ / round up to multiple (supplier constraints)
EOQ                 = sqrt( (2 × D × S) / H )               # D=annual demand, S=order cost ₹, H=holding ₹/unit/yr
POQ                 = cover next k periods' net requirements
```

**Lead-time offset (time-phasing):**
```
Planned_Order_Release_date = Need_date - Lead_Time
Lead_Time = queue + setup + run + move            # make items (from routing, converted to days via calendar)
          = purchase_lead + buffer                # buy items (learned_lead_days overrides static when confident)
```
Offsetting walks the **work-center calendar** (working days only). If release date < today → clamp to today and emit `past_due` exception.

**Vectorized level pass (NFR-01):** one SQL pull per LLC level (all items at that level with their demand, receipts, policies as arrays over the bucketed horizon), netting as NumPy array ops per item batch, one bulk `COPY`/insert of planned orders, then the next level's gross requirements are built by a single join of this level's releases × `bom_line`. This is the "process levels in bulk, not item-by-item" lesson from SAP MRP Live's HANA-side design.

### 11.5 Exception generation
After netting, compare wanted vs actual for every open supply (firmed PLO, WO, PO line):
| Condition | Exception |
|---|---|
| release_date ≤ today + release_window ∧ status=planned | `release_now` |
| open supply due_date > needed date + tolerance | `reschedule_in` (expedite) — suggested_date = needed |
| open supply due_date < needed date − tolerance | `reschedule_out` (de-expedite) |
| supply exists with no pegged requirement | `excess` / `cancel` |
| computed release date < today (clamped) | `past_due` |
| Net_Req unmet inside lead time / SS breached | `shortage` (critical) |
| missing lead time / BOM / routing, negative on-hand | `data_warning` |
| suggestion would move a frozen-fence MPS row | `fence_violation` |
Severity = f(days-late, ABC class, pegged-demand type: SO > forecast). Message rendered as a plain-language sentence with the peg reference at generation time.

### 11.6 Capacity load (spec verbatim)
```
Available_Capacity(wc, t) = machines × Σ shift_hours(t) × utilization% × efficiency%
Load(wc, t)               = Σ (setup + run) of operations routed to wc in period t
Load%                     = Load / Available_Capacity
```
Shifts materialize into `calendar` rows (holidays/maintenance override to 0). Load includes released WO ops (remaining work) + planned orders exploded through their routings. RCCP is the same formula on `is_bottleneck` WCs using MPS quantities × bill-of-resources hrs/unit.

### 11.7 Finite scheduler (isolated service)
Two-tier design — instant heuristics for the interactive loop, optional CP-SAT for optimization:

**Tier 1 — dispatching heuristics (< 5 s, MVP-demoable):** simulation-based list scheduling. Maintain per-machine timelines over the calendar; at each decision point pick the next ready operation by the chosen rule: **EDD** (earliest due date, default), **SPT**, **CR** (critical ratio), **ATCS** (apparent tardiness cost with setups — folds the changeover matrix into priority). Respect: precedence (op seq within WO), material availability date, machine calendar, locked ops/frozen horizon, alternates. Forward (from release dates), backward (latest-start from due dates, then repair overlaps forward), or bottleneck-first (schedule the bottleneck WC's sequence first, then forward/backward everything else around it — the Preactor-style strategy trio planners expect).

**Tier 2 — CP-SAT (OR-Tools) optimization:** model per machine as optional interval variables + a **circuit constraint** over "job i → job j" arc literals, enforcing `start[j] ≥ end[i] + setup[i][j]` via `only_enforce_if` — the standard CP-SAT idiom for sequence-dependent setups (as used in Google's flexible job-shop examples and the PyJobShop library, which we evaluate as a modeling layer). Objective: `w1·Σ tardiness + w2·Σ setup_time (+ w3·makespan)`. Warm-start with the Tier-1 heuristic solution; anytime search with hard `max_time_in_seconds`; stream best-so-far KPIs over SSE. **Scale guard:** arc modeling is O(n²) booleans per machine — beyond ~50 unlocked ops per machine, auto-decompose (schedule the bottleneck exactly, heuristics elsewhere) or window the horizon. This keeps CP-SAT practical at SME scale (research consensus: exact circuit models degrade past ~50 jobs/machine).

Output: proposed `sched_start/sched_end` per op + KPI diff; **never auto-publishes** — planner reviews on the board, Plant Manager approves publish (schedule_version snapshot).

### 11.8 Net-change replan
- A `dirty_item` set accumulates from events (demand change, GRN, BOM change via where-used closure, op deviation, inventory adjustment).
- Net-change run = closure of dirty items downward through their BOMs (components inherit dirtiness because parent releases may change), processed in LLC order; untouched items' planned orders are left as-is.
- Correctness guardrail: property test asserts net-change ≡ regenerative on identical data (TC-MRP-04). If drift is ever detected in production (checksum of planned orders per item), auto-fallback to regen and log.

### 11.9 Pegging graph
- Built during netting: each planned order records `peg_parent_plo` (the parent release that generated its gross req, proportionally split when multiple parents share a bucket) and top-level `peg_demand_id`.
- Peg tree API = recursive CTE both directions; WO/PR conversion carries `source_planned_order` so execution documents stay in the graph.
- This is what powers "why is WO-2026-0142 late?" — walk up to the demand, down to the constraining supply, and render the chain.

### 11.10 Dynamic safety stock & lead-time learning (spec verbatim)
```
Safety_Stock = Z × sqrt( LT × σ_demand² + demand² × σ_LT² )    # Z from target service level
```
- `demand`, `σ_demand`: mean/std of weekly consumption (issue history, outlier-trimmed, ≥ 26 weeks).
- `LT`, `σ_LT`: learned per item(-supplier) from GRN history (`promised vs actual`), EWMA-updated on each `grn.posted` event → `lead_time.learned_lead_days/learned_std_days`.
- Z from service level: 0.90→1.28, 0.95→1.645, 0.98→2.05, 0.99→2.33.
- Batch job writes **proposals** (`ss_proposed`); planner approves (human-approves pattern).

---

## 12. Frontend Components

React 18 + TypeScript; shadcn/ui primitives; TanStack Query (server state) + TanStack Table (grids). Module component library `@ind-core/planning-ui`:

| Component | Description & key props |
|---|---|
| `<ExceptionWorklist>` | TanStack Table, virtualized, group-by (type/item/buyer/WC), severity dots, inline Accept/Snooze, bulk bar, swipe actions on mobile. Props: `filters, groupBy, onAccept, onSnooze, onPeg`. Row → `<PeggingDrawer>`. |
| `<MPSGrid>` | Spreadsheet-like grid (TanStack Table + custom editable cells): item rows × week columns with 5 sub-rows; fence shading; optimistic PATCH with server-validated fence rules; keyboard nav (Excel muscle memory matters to planners). |
| `<ForecastWorkbench>` | Editable grid + `<ItemHistoryChart>` (Recharts line: actual, forecast, CI band, festival markers) + AI-proposal diff cells (dashed border, accept/reject). |
| `<MRPRunPanel>` | Config form + `<RunProgress>` (SSE consumer via EventSource; stage list with per-level progress bars; polling fallback). |
| `<PlannedOrdersTable>` | Virtualized 10k-row table, inline date/qty editors, bulk firm/convert bar with consequence summary dialog. |
| `<CapacityHeatmap>` | **ECharts heatmap** (WC × week, custom green/amber/red visualMap, cell click → drill panel). ECharts chosen over Recharts here for native heatmap + large-matrix canvas performance. |
| `<ScheduleGantt>` | The flagship. **SVAR React Gantt (MIT)** as the base — 2025 benchmarks show it sustaining 60 fps at 1k tasks, the best open-source performer — heavily customized: machine-row (resource) layout, drag-drop with drop-validation callback, **changeover wedge renderer** between task bars (width = matrix minutes), calendar background shading, violation badges, "now" line, before/after KPI ribbon for optimize runs. Fallback plan if resource-row customization fights the lib: custom SVG/canvas Gantt over `@dnd-kit` (time-scale math is ours anyway; budget 3 extra weeks). Bryntum/DHTMLX are the commercial escape hatch (per-dev licensing) if pilot feedback demands enterprise polish. |
| `<PeggingDrawer>` | Right-side drawer, expandable tree: demand root (SO chip with customer) → planned orders → WOs/POs → components; every node deep-links; "✦ Explain in plain language" button. Rendered from the recursive-CTE JSON. |
| `<ATPPopover>` | Item+qty+date mini-form → earliest-promise result; embedded in SMBD's order screen too (shared package). |
| `<ChangeoverMatrixEditor>` | Attribute × attribute editable grid per WC with heat-tint by minutes. |
| `<KpiCard>` / `<PlanningDashboard>` | Shared design-system KPI cards; Recharts for trend lines/bars; ECharts heatmap mini. |
| `<AiAssistPanel>` | The "✦ AI" pattern: proposal + evidence rows + Accept/Reject; shared across forecast, SS recalc, auto-sequence, explain-exception; streams tokens; language toggle EN/हिंदी. |

State conventions: server state via TanStack Query (query keys per plant + run freshness stamp; `mrp.completed` event → invalidate); board drag state local with optimistic PATCH + violation rollback; SSE hooks `useRunProgress(runId)`, `useOptimizeProgress(jobId)`.

---

## 13. AI Features

All AI follows the IND-CORE trust model: **the AI drafts, a human approves** — surfaced as the "✦ AI" button, always showing sources/evidence, never writing without a click.

### 13.1 ML demand forecasting with Indian seasonality
- **Models (classical-first, per research on SME/intermittent demand):** per item, auto-select by backtest among: seasonal naïve / ETS (statsmodels) for smooth movers; **Croston / SBA / TSB** for intermittent-demand spares and slow movers (the literature's reliable benchmarks — Croston separates demand size from interval, exactly the SME spares pattern); **LightGBM** with engineered features for items with enough history (lags, rolling stats, week-of-year, **festival calendar features: days-to-Diwali, Navratri, Onam/Pongal regional flags, monsoon months, FY-end March push**, customer-order-book signals). Deep learning deliberately excluded at this scale — shallow models train in seconds per item and are explainable.
- **Selection:** rolling-origin backtest, winner by MAPE (smooth) / MSE-scaled (intermittent); champion recorded on `forecast.model`; re-tournament monthly.
- **Data flow:** nightly job → per-item forecast + confidence interval → `forecast_line` (new version, `model≠manual`) → planner reviews diff in the workbench → accept/adjust → freeze → MPS. Claude generates the **forecast commentary** (plain-language: "KV-50 demand up 18% for the Diwali OEM push…") grounded on the computed numbers only.
- **Accuracy loop:** MAPE/bias per item/model tracked; items where manual beats ML are flagged back to manual.

### 13.2 Dynamic safety stock
`SS = Z × sqrt(LT·σd² + d²·σLT²)` (§11.10) recomputed weekly from consumption + learned lead-time stats → proposals on `reorder_policy.ss_proposed` → diff screen → planner approves. Evidence shown: demand histogram, lead-time actuals scatter, service-level dial.

### 13.3 Auto-sequencing optimization
The Tier-2 CP-SAT solve (§11.7) exposed as "✦ Auto-optimize" on the board: strategy + objective picker, anytime best-so-far stream, before/after KPI diff (setup hours saved, late orders, makespan). Human approves by publishing. This — changeover-aware optimization at SME price — is the flagship AI feature and the market gap.

### 13.4 Bottleneck prediction
Weekly job: project load% per WC from the planned-order pipeline N weeks out (deterministic part) + a gradient-boosted residual model on historical adherence/absenteeism/breakdown patterns (learned part). Output: "WC-VMC01 predicted 112% in W34" digest with contributing orders → links to leveling actions.

### 13.5 Supplier lead-time learning
Every `grn.posted` yields a (promised, actual) sample per supplier×item → robust EWMA of mean and σ → `lead_time.learned_*`. MRP uses learned values when sample count ≥ 5 and CV is stable; Procurement sees promised-vs-actual per vendor (Indian vendor variability made visible). Feeds §13.2's σ_LT.

### 13.6 What-if rush-order CTP
"Can we take 40 KV-80 by 20-Aug?" → simulation: inject demand, net-change explode in a scenario, quick finite check on bottleneck WCs → answer: promise date + **what slips** (list of impacted WOs/SOs with days), rendered by Claude as a negotiation-ready summary for Sales. Nothing commits until the planner promotes the scenario. (SAP's pMRP validated this "simulate demand against critical resources before committing" pattern; we deliver it at SME scale.)

### 13.7 Conversational planner (English + Hindi, regional next)
- Command-bar assistant powered by Claude API with **tool-use over read-only planning APIs** (pegging, exceptions, capacity, ATP): "WO-2026-0142 late kyun hai?" → walks the peg graph → grounded answer citing real refs (deep-linked chips), e.g. shortage of CI casting on PO-2213 arriving 3 days after the machining slot.
- Guardrails: read-only tools; any suggested action becomes a pre-filled screen the human confirms; answers must cite retrieved rows (refuse if no evidence); pgvector stores embedded item/exception text for fuzzy lookup ("woh bada casting wala order").
- On-prem/DPDP mode: assistant degrades to templated explanations from the peg graph (no external API) — the deterministic explainer is built first, LLM polish on top.

---

## 14. Security

### 14.1 Role permission matrix (from PLANNING §3.6)

| Capability | PPC Planner | Plant Mgr | Stores | Procurement | Sales/CSR | Operator | Finance |
|---|---|---|---|---|---|---|---|
| Edit forecast / freeze | ✔ | view | — | — | propose | — | — |
| Edit/firm MPS, override fences | ✔ (fence override needs Mgr) | approve | — | — | view ATP | — | — |
| Run MRP | ✔ | ✔ | — | — | — | — | — |
| Resolve exceptions | ✔ | view | shortage only | buy-side view | — | — | — |
| **Firm / convert planned orders** | **✔ (only role)** | view | — | convert PR→PO (Purchase module) | — | — | — |
| Work centers / shifts / calendars | view | ✔ | — | — | — | — | — |
| Edit schedule board | ✔ | ✔ | — | — | — | — | — |
| **Publish dispatch list** | request | **approve (required)** | — | — | — | view own machine | — |
| WO release / close | ✔ | ✔ | issue material | — | — | report ops | — |
| Reorder policies / SS approval | ✔ | ✔ | view | lead times/MOQ | — | — | — |
| Costs / cash-flow / valuation | view | view | — | view | — | — | ✔ (read-only) |

### 14.2 Controls
- **JWT access (15 min) / refresh (7 d) with RBAC claims**; permissions enforced server-side per endpoint (FastAPI dependency), UI hides what the role can't do. Plant-level data scoping in every query (multi-plant tenants).
- Only the Planner role can **firm/convert**; only Plant Manager can **approve schedule publish** — both are two-step guarded actions with immutable audit rows (who/when/before/after).
- Time-fence overrides require elevated role + mandatory reason.
- Rate-limits on run endpoints (one active run per plant, advisory lock); scheduler jobs sandboxed with CPU/memory/time caps (NFR-03).
- AI endpoints: read-only tool scope, per-tenant data isolation, no cross-tenant retrieval; DPDP posture — planning data stays in-region/on-prem, LLM calls disableable per tenant.
- Operator tablets: device-bound tokens, machine-scoped view only.

---

## 15. Validation Rules

| ID | Rule |
|----|------|
| V-01 | **No negative on-hand assumptions:** netting floors `Projected_Available(0)` at 0; negative inventory records produce a `data_warning` exception, never silent negative supply. |
| V-02 | **Calendar/shift integrity:** shift end > start (overnight shifts modeled as two segments); calendar has ≥ 1 working day per week per active WC over the horizon; scheduling onto a 0-hour day is rejected; maintenance blocks cannot overlap published locked ops without a reschedule proposal. |
| V-03 | Lead-time sanity: missing/zero lead time on a planned item → `data_warning` + default (configurable) applied, run continues. |
| V-04 | Lot-rule sanity: MOQ ≥ 0, multiple > 0, EOQ inputs positive; FOQ < max weekly demand × horizon warning. |
| V-05 | **Circular BOM guard:** LLC topological sort rejects cycles with the offending path (`A → B → A`); BOM save API refuses the edge (shared with Engineering module). |
| V-06 | **Time-fence violations:** server rejects MPS/planned-order auto-changes inside DTF; inside PTF only exceptions are emitted; manual overrides need role + reason (audited). |
| V-07 | **Firm-order protection during regen:** regeneration deletes only `status='planned'` orders from prior runs; `firm`/`converted` rows untouched (DB-level: the regen sweep predicate is status-checked; belt-and-braces trigger blocks deletes of firm rows by the engine user). |
| V-08 | **Planning-method conflict guard:** an item×warehouse may be governed by MPS/MRP **or** reorder rules, not both (Odoo documents this exact double-ordering failure mode; we enforce it as a constraint, not a doc note). |
| V-09 | Conversion integrity: convert requires active default BOM+routing (make) or supplier/lead time (buy); qty within lot rule; transactional — partial bulk failures roll back per order and report. |
| V-10 | Schedule integrity: drag-drop cannot violate op precedence, land on non-working time, or double-book a finite machine — violations block save (with an explicit "override & flag" for Plant Mgr). |
| V-11 | Reporting sanity: qty_done + scrap ≤ WO qty × (1 + tolerance); over-report needs supervisor confirm. |
| V-12 | Job-work challan: material issue to vendor requires GST challan with mandatory fields; receipt reconciliation before WO close; > 1 yr pending-at-vendor flagged (ITC-04 exposure). |

---

## 16. Testing

### 16.1 Engine correctness — textbook MRP case (TC-MRP-01)
Hand-computed reference (also the demo dataset, §20.5): 3-level BOM `PUMP-KV50 → IMPELLER-KV50 (scrap 2%) → CI-CASTING-IMP (scrap 5%, MOQ 50, LT 2 wk)`, weekly buckets W29–W34-2026, on-hand {8, 30, 40}, SS {0, 10, 15}. The engine MUST reproduce exactly the planned-order table in §20.5 (releases, receipts, projected available per bucket) and the exception set in §20.6 (incl. the **past-due W28 casting release → expedite**). Assert per-bucket `Projected_Available`, scrap gross-up rounding (16×1.0204→17), MOQ rounding (22→50), and peg chain SO-1042 → PLO(pump) → PLO(impeller) → PLO(casting).

### 16.2 Forecast consumption edge cases (TC-FC-01…06)
F=100/O=60 → 100; F=100/O=130 → 130; F=0/O=50 → 50; order in bucket with zero forecast consumes backward then forward per window; order cancellation restores consumed qty; frozen forecast version untouched by consumption bookkeeping.

### 16.3 MPS & ATP (TC-MPS-01)
Given on-hand 8, receipts {W30:16, W31:20…}, orders vs forecast per §20.4 — assert projected on-hand row and discrete ATP per bucket (ATP in receipt buckets only; bucket-1 includes uncommitted stock; negative-ATP warning case included).

### 16.4 Lot sizing & offset (TC-LOT-01…04)
L4L exact; MOQ 50 on net 22 → 50; MULT 25 on 60 → 75; EOQ formula vs hand calc (§20.9: 292); lead-time offset walks calendar (release skips Sunday + Diwali holiday block); release < today → clamp + past_due.

### 16.5 Regen/net-change/firm protection (TC-MRP-04/05)
Property test: random demand/BOM/inventory perturbations → net-change result ≡ fresh regen (planned-order multiset equality per item). Firm a planned order, regen with changed demand → firm order intact, reschedule exception emitted instead.

### 16.6 Finite scheduler (TC-SCH-01/02/03)
- TC-SCH-01: 3 machines × 8 ops with precedence + calendar (Sunday off) — heuristic (EDD) schedule respects precedence, never overlaps a finite machine, never lands on non-working time.
- TC-SCH-02: **changeover matrix respected** — lathe sequence [SS job, CI job, SS job]: scheduler inserts 45-min SS→CI and 60-min CI→SS wedges per matrix (§20.7); ATCS/CP-SAT re-order groups the SS jobs, total setup 45 min < naïve 105 min; assert gap between consecutive ops ≥ setup(i→j) always.
- TC-SCH-03: CP-SAT ≤ heuristic on (tardiness+setup) objective across a 10-instance benchmark; anytime limit honoured; locked ops immovable.
- Drag-drop API: PATCH that violates precedence/calendar/double-booking → 422 with violation payload.

### 16.7 Capacity (TC-CAP-01)
VMC: 1 machine × 2 shifts × 8 h × 0.85 util × 0.90 eff, 6-day week → 73.4 h available; load fixture 86.6 h → 118% red cell (matches §20.7 heatmap fixture).

### 16.8 Dynamic SS (TC-SS-01)
Z=1.645, LT=2, σd=12, d=46, σLT=0.5 → SS=47.2→48 (matches §20.9). Degenerate cases: σLT=0; single-sample lead time → falls back to static.

### 16.9 Non-engine
API contract tests (OpenAPI schema-driven); SSE progress integration test (run emits ≥ 1 event per stage); RBAC matrix tests per §14.1 (each forbidden cell → 403); load test NFR-01 fixture (5k items/8 levels synthetic generator) in CI nightly; frontend: Playwright planner-loop E2E (run → accept exception → firm → convert → board drag → publish), Gantt drag unit tests with drop-validation mocks.

---

## 17. MVP Scope

**In (MVP — investor-demoable, pilot-usable):**
- Demand from confirmed SOs (SMBD event) + manual forecast grid with `max(F,O)` consumption; CSV import.
- MPS grid for MPS items with projected on-hand + ATP + time fences (single plant).
- **Single-plant regenerative MRP**: LLC, level-by-level netting with scrap/SS, L4L/FOQ/MOQ/MULT/EOQ lot rules, calendar lead-time offset, async run with SSE progress.
- **Exception worklist as home** (all §11.5 types) with accept/snooze and **one-click pegging everywhere**.
- Planned Orders workbench: firm, convert → Work Orders & Purchase Reqs (bulk).
- Work Orders: lifecycle, material reservation, shortage list, operation reporting (tablet), job-card print.
- **Infinite-capacity load report** + heatmap (green/amber/red) with drill.
- **Simple priority-rule schedule board (demo)**: machine-row Gantt fed by EDD/SPT heuristic, drag-drop with precedence/calendar validation, changeover wedges rendered from the matrix, publish dispatch list with manager approval. *(Sells the finite-scheduling story without full APS.)*
- Reorder policies (min/max, ROP, EOQ) with conflict guard; static safety stock; ABC.
- Dashboard KPI cards; demo seed data (§20); roles per §14.1; audit.

**Out (deferred, but the board demo previews them):**
- CP-SAT auto-optimize at scale, bottleneck-first strategy, disruption auto-reschedule (Phase 2/3 — heuristic optimize button may ship dark-launched).
- ML forecasting tournament (MVP: manual + copy-last-year+%; Croston/LightGBM Phase 2), dynamic SS automation (calculator ships, batch proposals Phase 2), lead-time learning.
- Net-change MRP (MVP regen is fast enough at pilot scale), what-if simulation runs, CTP.
- Multi-plant supply planning & transfers, RCCP bill-of-resources, job-work challan planning (challan itself lives in Inventory/Purchase MVP), conversational planner (deterministic "explain" ships; LLM layer Phase 2).

---

## 18. Future Roadmap

| Phase | Timeline | Deliverables |
|---|---|---|
| **Phase 2 — Differentiate** | +2 quarters | Net-change engine + event-driven replan; ML forecasting tournament (Croston/SBA/ETS/LightGBM + festival features); dynamic safety stock proposals; supplier lead-time learning; RCCP; job-work/sub-contract planning with GST challans + ITC-04 aging; what-if simulation runs; ATCS heuristic + CP-SAT optimize (time-boxed) on the board; conversational explain (EN/HI). |
| **Phase 3 — Lead** | +4 quarters | **True finite APS**: bottleneck-first strategy, alternate-resource optimization, CP-SAT at full scale with decomposition, schedule-repair on disruption events (machine down/material delay → minimal-disruption proposal); CTP rush-order promising into SMBD; bottleneck prediction; multi-plant planning + transfers. |
| **Phase 4 — Frontier** | +6–8 quarters | **MEIO** (multi-echelon inventory optimization across plant + depots); demand sensing from dealer/POS feeds; **auto-reschedule agents** with approval gates (agent watches events, proposes, humans approve — extending the trust model); **digital-twin scheduling** (simulate the shop against live MES state); carbon/energy-aware scheduling (schedule energy-hungry ops off-peak — real ₹ savings under Indian ToD tariffs). |

---

## 19. Technology Stack & Rationale

Aligned to the IND-CORE shared platform baseline (and the existing `ind-ai-mvp` FastAPI codebase); validated against 2025–26 ecosystem research. Trade-offs noted.

| Layer | Choice | Rationale & trade-offs |
|---|---|---|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query/Table | Shared across all IND-CORE modules — one design system, one skill set. TanStack Table's headless virtualization is exactly right for the 10k-row planned-orders/exception grids. Trade-off: heavy grid interactions (MPS editable matrix) need custom cell editors — accepted vs paying for AG Grid Enterprise (kept as an upgrade path if pilot grids strain). |
| **Gantt / board** | **SVAR React Gantt (MIT)**, customized; fallback custom SVG + dnd-kit; Bryntum/DHTMLX as commercial escape hatch | 2025 benchmarks put SVAR as the only open-source React Gantt at 60 fps @ 1k tasks; MIT license fits SME pricing (frappe-gantt too simple for machine-row scheduling; Bryntum best-in-class but per-developer licensing conflicts with our cost thesis). Risk: resource-row + changeover-wedge customization is non-trivial — spiked in week 1 of board work (§12). |
| **Charts** | Recharts (trends/bars/sparklines) + **ECharts** (capacity heatmap, large matrices) | Recharts = idiomatic React for dashboard cards; ECharts canvas renderer handles WC×week heatmaps and big scatter/history plots Recharts can't. Two libs is a deliberate, contained trade-off (both wrapped in `@ind-core/charts`). |
| **Backend** | Python 3.12 + FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2 | Matches ind-ai-mvp — zero new platform risk. Python is the only language where the web API, the vectorized MRP math (NumPy/pandas), classical ML (statsmodels/LightGBM), and OR-Tools all share one runtime — decisive for a small team. Trade-off: raw single-thread speed vs Go/Rust — mitigated by set-based/vectorized engine design (NFR-01) and worker parallelism; if a future 50k-item tenant appears, the engine core is isolatable behind its queue for a Rust port without touching the API. |
| **Database** | PostgreSQL 16 + pgvector | One database for OLTP, planning snapshots (JSONB), recursive-CTE pegging, and vector search for the assistant's fuzzy retrieval. Window functions + CTEs do real planning work server-side. pgvector avoids a separate vector store (DPDP: embeddings stay in-house). |
| **Jobs / async** | Redis + **Celery** (queues: `mrp`, `scheduler`, `ml`, `default`) | The proven FastAPI long-running-job pattern: enqueue → 202 + id → `update_state` progress → SSE/poll (industry consensus per 2025 practice guides). Celery over RQ for priorities, time limits, and per-queue worker pools — which is precisely how MRP-engine and scheduler isolation (NFR-03) is enforced. Trade-off: Celery ops complexity vs RQ simplicity — accepted; we already run Redis. |
| **Auth** | JWT access (15 min)/refresh (7 d) + RBAC claims, FastAPI dependencies | Stateless, on-prem friendly, shared with other modules. Device-bound tokens for operator tablets. |
| **APIs** | REST (OpenAPI auto-gen) + internal event bus on **Redis Streams** | REST+OpenAPI gives typed client generation for the frontend and partner integrations. Redis Streams (consumer groups, replay) over Kafka — right-sized for single-VM/on-prem SME deployments; the event contract (§10.8) is transport-agnostic if we outgrow it. |
| **Real-time** | **SSE** for run/optimize progress; WebSocket only for the multi-user schedule board | SSE is simpler, proxy-friendly, auto-reconnecting — ideal for one-way progress (research-validated pattern). The board's concurrent-edit presence needs bidirectional → one WebSocket channel, Phase 2. |
| **AI** | Anthropic Claude API (assistant, commentary, explanations — tool-use over read-only APIs) + statsmodels/**LightGBM**/Croston (forecasting) + **OR-Tools CP-SAT** (scheduling) | Deliberate split: *numbers from deterministic/classical models, language from the LLM* — the LLM never invents quantities. Croston-family + LightGBM matches the intermittent-SME-demand literature (shallow > deep at this data scale, and explainable). CP-SAT is the free, state-of-the-art CP solver with first-class sequence-dependent-setup idioms (circuit constraints); PyJobShop evaluated as a modeling shortcut. On-prem/DPDP tenants: LLM optional, deterministic explainers always available. |
| **Deployment** | Docker Compose (api, workers ×3 pools, postgres, redis, caddy, frontend) on a single cloud VM for demo; same compose on-prem; K8s only when multi-tenant SaaS scales | Matches the "single VM demo, on-prem capable, DPDP-friendly" platform posture. Nightly encrypted backups; Prometheus + Grafana sidecar for run/queue metrics. |

---

## 20. Demo Data (MVP seed — investor-demo grade)

Shared IND-CORE pilot universe (consistent across all module plans): **(1) Sharma Precision Components Pvt Ltd**, Faridabad, HR — CNC auto components, Tier-2; **(2) Kaveri Pumps & Motors Ltd**, Coimbatore, TN — industrial pumps, MTO; **(3) Trident Sheet Metal Works Pvt Ltd**, Pune, MH — sheet-metal enclosures, ETO; **(4) Zenith Fasteners Pvt Ltd**, Rajkot, GJ — high-tensile fasteners, MTS; **(5) Arvind Electro Controls Pvt Ltd**, Noida, UP — control panels.

**Primary walkthrough: Kaveri Pumps & Motors Ltd, Coimbatore plant** (MTO pumps — exercises MPS, MRP, capacity, finite scheduling). Secondary scenario: Trident Sheet Metal (laser + press brake changeovers). Demo "today" = **Mon 13-Jul-2026 (start of week W29)**; weekly buckets W29–W34.

### 20.1 Employees / users (Kaveri Pumps unless noted)

| User | Role | Login persona |
|---|---|---|
| Meenakshi Sundaram | PPC Planner (primary demo user) | planner@kaveripumps.in |
| R. Karthikeyan | Plant Manager | plant@kaveripumps.in |
| S. Poongodi | Stores In-charge | stores@kaveripumps.in |
| Anand Krishnan | Procurement Officer | purchase@kaveripumps.in |
| Divya Ramesh | Sales / CSR | sales@kaveripumps.in |
| Murugan V. | CNC Operator (LTH-01) | op.lth01@kaveripumps.in |
| CA Lakshmi Narayanan | Finance (read-only) | finance@kaveripumps.in |
| Sanjay Wagh (Trident, Pune) | Planner — scenario 2 | planner@tridentsmw.in |

### 20.2 Work centers, shifts & calendar — Kaveri Coimbatore

| WC code | Name / machine | Type | Machines | Shifts | Util % | Eff % | ₹/hr | Available h/wk* |
|---|---|---|---|---|---|---|---|---|
| WC-VMC01 | Ace Micromatic VMC-850 (machining centre) | **finite** | 1 | A+B (2×8 h, Mon–Sat) | 85 | 90 | 950 | **73.4** |
| WC-LTH01 | LMW LL20T L5 CNC lathe #1 | finite | 1 | A+B | 85 | 92 | 800 | 75.1 |
| WC-LTH02 | LMW LL20T L5 CNC lathe #2 | finite | 1 | A only (8 h) | 85 | 92 | 800 | 37.5 |
| WC-ASSY | Pump assembly line | infinite | 6 fitters | General (8 h) | 90 | 95 | 450 | 246.2 |
| WC-TEST | Hydro test rig (performance testing) | finite | 1 | General | 80 | 95 | 600 | 36.5 |
| *Trident Pune:* WC-LSR01 | TRUMPF TruLaser 3030 (fiber) | finite | 1 | A+B | 88 | 93 | 1,400 | 78.6 |
| *Trident Pune:* WC-PBR01 | Amada HFE 100-3 press brake | finite | 1 | A+B | 85 | 90 | 900 | 73.4 |

\* `machines × 6 days × shift-hours × util × eff` — e.g. WC-VMC01: 1 × 96 h × 0.85 × 0.90 = **73.4 h/wk** (formula §11.6). Calendar exceptions seeded: Sundays off; 15-Aug-2026 (Independence Day) 0 h; WC-VMC01 preventive maintenance Sat 25-Jul 4 h block; Diwali block 7–9 Nov 2026.

### 20.3 Items & 3-level BOM (walkthrough set)

| Item code | Name | Type | Make/Buy | LLC | Lot rule | LT | On-hand | SS | Std cost ₹ | ABC |
|---|---|---|---|---|---|---|---|---|---|---|
| PUMP-KV50 | KV-50 centrifugal pump, 5 HP, CI | MTO, MPS item | make | 0 | L4L | 1 wk | 8 | 0 | 18,400 | A |
| PUMP-KV80 | KV-80 centrifugal pump, 7.5 HP | MTO, MPS item | make | 0 | L4L | 1 wk | 3 | 0 | 24,900 | A |
| IMPELLER-KV50 | Bronze impeller, machined (scrap 2% in BOM line) | — | make | 1 | L4L | 1 wk | 30 | 10 | 2,150 | A |
| CASING-KV50 | CI volute casing, machined | — | make | 1 | L4L | 1 wk | 22 | 8 | 3,400 | A |
| MOTOR-5HP | 5 HP TEFC motor (bought — CG Power) | — | buy | 1 | MOQ 10 | 2 wk | 14 | 6 | 7,800 | A |
| CI-CASTING-IMP | Impeller casting blank (foundry; scrap 5% at machining) | — | buy | 2 | **MOQ 50** | **2 wk** | 40 | 15 | 780 | B |
| CI-CASTING-CSG | Casing casting blank | — | buy | 2 | MOQ 30 | 3 wk | 35 | 12 | 1,450 | B |
| MECH-SEAL-25 | Mechanical seal 25 mm | — | buy | 1 | EOQ | 2 wk | 120 | 48 | 310 | B |
| SS-SHAFT-ROD | SS410 shaft rod (per pump 0.6 m) | — | buy | 1 | MULT 25 | 1 wk | 90 m | 20 | 240/m | C |

BOM (per 1 PUMP-KV50): IMPELLER-KV50 ×1 (scrap 2%) · CASING-KV50 ×1 (scrap 1%) · MOTOR-5HP ×1 · MECH-SEAL-25 ×1 · SS-SHAFT-ROD ×0.6 m. IMPELLER-KV50 ← CI-CASTING-IMP ×1 (scrap 5%). CASING-KV50 ← CI-CASTING-CSG ×1 (scrap 3%).

Routing PUMP-KV50: 10 Assembly WC-ASSY (setup 15 m, run 45 m/u) → 20 Test WC-TEST (setup 10 m, run 20 m/u). IMPELLER-KV50: 10 Turn WC-LTH01 (alt LTH02; setup 30 m, run 18 m/u) → 20 Mill WC-VMC01 (setup 40 m, run 22 m/u). CASING-KV50: 10 Mill WC-VMC01 (setup 45 m, run 35 m/u).

### 20.4 Demand set (SOs + forecast, PUMP-KV50) and MPS

Sales orders (from SMBD): SO-1042 Kirloskar dealer, Salem — 24 KV-50, need W30 · SO-1046 Coimbatore Waterworks — 25 KV-50, need W32 · SO-1051 TN Agro tender — 18 KV-80, need W33 · SO-1053 spares — 15 MECH-SEAL-25, W31.

| PUMP-KV50 (weekly) | W30 | W31 | W32 | W33 | W34 |
|---|---|---|---|---|---|
| Forecast F | 20 | 20 | 20 | 20 | 20 |
| Orders O | 24 | 18 | 25 | 10 | 0 |
| **Demand = max(F,O)** | **24** | **20** | **25** | **20** | **20** |
| Consumed forecast | 20 | 18 | 20 | 10 | 0 |

MPS board (on-hand 8, MPS receipts = planned, L4L):

| Row | W30 | W31 | W32 | W33 | W34 |
|---|---|---|---|---|---|
| MPS receipt | 16 | 20 | 25 | 20 | 20 |
| Projected on-hand | 0 | 0 | 0 | 0 | 0 |
| ATP (discrete) | 8+16−24 = **0** | 20−18 = **2** | 25−25 = **0** | 20−10 = **10** | 20−0 = **20** |

(Time fence: DTF = W30 frozen, PTF = W32 firm. Divya's ATP lookup: "earliest 12 more KV-50 → W33/W34".)

### 20.5 Worked MRP example — gross → net → planned orders (3 levels, hand-verified = test TC-MRP-01)

**Level 0 — PUMP-KV50** (L4L, LT 1 wk, OH 8, SS 0):

| | W30 | W31 | W32 | W33 | W34 |
|---|---|---|---|---|---|
| Gross req | 24 | 20 | 25 | 20 | 20 |
| Proj. avail (start 8) | 0 | 0 | 0 | 0 | 0 |
| **Planned receipt** | 16 | 20 | 25 | 20 | 20 |
| **Planned release** | **W29: 16** | **W30: 20** | **W31: 25** | **W32: 20** | **W33: 20** |

**Level 1 — IMPELLER-KV50** (L4L, LT 1 wk, OH 30, SS 10; gross = pump releases × 1/(1−0.02), round up):

| | W29 | W30 | W31 | W32 | W33 |
|---|---|---|---|---|---|
| Gross req | 17 (16×1.0204) | 21 | 26 | 21 | 21 |
| Net req (= G − PA(t−1) + SS) | 17−30+10 = −3 → 0 | 21−13+10 = **18** | 26−10+10 = **26** | **21** | **21** |
| Planned receipt | — | 18 | 26 | 21 | 21 |
| Proj. available | 13 | 10 | 10 | 10 | 10 |
| **Planned release** | — | **W29: 18** | **W30: 26** | **W31: 21** | **W32: 21** |

**Level 2 — CI-CASTING-IMP** (buy, **MOQ 50**, LT 2 wk, OH 40, SS 15; gross = impeller releases × 1/(1−0.05), round up):

| | W29 | W30 | W31 | W32 |
|---|---|---|---|---|
| Gross req | 19 (18×1.0526) | 28 | 23 | 23 |
| Net req | 19−40+15 = −6 → 0 | 28−21+15 = **22** → lot **50** | 23−43+15 = −5 → 0 | 23−20+15 = **18** → lot **50** |
| Planned receipt | — | 50 | — | 50 |
| Proj. available | 21 | 43 | 20 | 47 |
| **Planned release** | — | **W28: 50 → PAST DUE (today = W29)** | — | **W30: 50** |

Pegging chain (one click anywhere): SO-1042 → PLO-2026-04401 (PUMP-KV50, rel W29) → PLO-2026-04407 (IMPELLER, rel W29) → **PLO-2026-04412 (CI-CASTING-IMP 50 pcs, rel W28 — past due)** → converts to PR-2026-0288 on Sri Venkateshwara Foundries, Coimbatore.

### 20.6 Exceptions worklist (seeded, as generated from 20.5 + extras)

| Sev | Type | Message (plain language) | Ref | Suggested |
|---|---|---|---|---|
| Critical | Past-due / expedite | "Casting order releases in W28 — already past. Expedite 50 pcs CI-CASTING-IMP from Sri Venkateshwara Foundries or W30 impeller machining slips 4 days." | PLO-2026-04412 | Release today, air-lift LT 1 wk (₹2,100 premium) |
| Critical | Shortage | "MOTOR-5HP short 6 pcs for WO-2026-0139 (kitting W30) — CG Power PO-2213 due W31." | WO-2026-0139 | Reschedule-in PO-2213 by 5 days |
| High | Reschedule-in | "Move PO-2201 (CI-CASTING-CSG 30 pcs) in from W33 → W31; casing machining needs it W31." | PO-2201 | 14-day pull-in |
| High | Release now | "Release planned order 18 pcs IMPELLER-KV50 (rel W29) to Work Order today." | PLO-2026-04407 | Convert → WO |
| Medium | Reschedule-out | "PO-2188 (SS-SHAFT-ROD 75 m) arrives W29 but not needed until W31 — push out to save ₹ carrying." | PO-2188 | +12 days |
| Medium | Excess / cancel | "60 pcs CI-CASTING-CSG on PO-2195 have no pegged demand after SO-1038 cancellation." | PO-2195 | Cancel / reduce to 30 |
| Low | Data warning | "GLAND-PACK-20 has no purchase lead time — 7-day default used." | Item master | Fix lead time |

### 20.7 Capacity heatmap & finite-schedule Gantt datasets

**Heatmap (Load% = load h ÷ available h, §11.6):** WC-VMC01 baseline 73.4 h/wk; W30 reduced to 70.3 h by the 4 h preventive-maintenance block on Sat 25-Jul (4 × 0.85 × 0.90 = 3.1 h effective).

| WC | W29 | W30 | W31 | W32 | W33 |
|---|---|---|---|---|---|
| WC-VMC01 | 61.2 / 73.4 = **83%** 🟢 | 66.6 / 70.3 = **95%** 🟠 | **86.6 / 73.4 = 118%** 🔴 | 70.1 / 73.4 = 95% 🟠 | 55.9 / 73.4 = 76% 🟢 |
| WC-LTH01 | 68% 🟢 | 88% 🟠 | 92% 🟠 | 81% 🟢 | 64% 🟢 |
| WC-LTH02 | 41% 🟢 | 55% 🟢 | 63% 🟢 | 48% 🟢 | 39% 🟢 |
| WC-ASSY | 52% 🟢 | 61% 🟢 | 66% 🟢 | 58% 🟢 | 55% 🟢 |
| WC-TEST | 70% 🟢 | 84% 🟢 | 97% 🟠 | 88% 🟠 | 72% 🟢 |

W31 red-cell drill: casings for SO-1046 (25 pcs × 35 m run + setups) + impeller milling + Sharma-style job-work intake = 86.6 h. Leveling demo: move 8 casing pcs to W32 **or** offload impeller milling ops to WC-LTH02 alternate **or** add Sunday B-shift (+10.4 h → 103%… still amber, shows honesty of the math).

**Finite Gantt (WC-LTH01, Tue 14-Jul, shift A 06:00–14:00; changeover matrix `material_family`: Bronze→CI 45 m, CI→Bronze 60 m, same-family 10 m):**

| Seq | Op | WO | Item (family) | Start | End | Note |
|---|---|---|---|---|---|---|
| 1 | Turn impeller | WO-2026-0139 | IMPELLER-KV50 (Bronze) | 06:00 | 08:24 | setup 30 m + 18 pcs |
| — | **Changeover Bronze→CI** | — | — | 08:24 | **09:09** | 45 m hatched wedge |
| 2 | Turn gland follower | WO-2026-0141 | GLAND-CI (CI) | 09:09 | 11:05 | |
| — | **Changeover CI→Bronze** | — | — | 11:05 | **12:05** | 60 m wedge |
| 3 | Turn impeller KV-80 | WO-2026-0142 | IMPELLER-KV80 (Bronze) | 12:05 | 14:00+ | spills to shift B → **late flag** |

Auto-optimize demo: re-order to [1, 3, 2] → one 45 m changeover instead of 105 m total → WO-2026-0142 finishes in shift A; KPI ribbon: "setup −60 m, late ops 1→0". **Trident scenario 2 (Pune):** WC-LSR01 laser nests 2 mm CRCA vs 3 mm GI (changeover = sheet-thickness attr, 20 m) feeding WC-PBR01 press brake (tool-change matrix 15–50 m) for enclosure order TR-ENC-4402 — shows the same board generalizing to sheet metal.

### 20.8 Work orders

| WO | Item | Qty | Planned | Status | Operations (WC · sched · done) |
|---|---|---|---|---|---|
| WO-2026-0139 | IMPELLER-KV50 | 18 | 14-Jul → 17-Jul | Released | Turn LTH-01 14-Jul (done 18+0 scrap) → Mill VMC01 15-Jul (pending) |
| WO-2026-0141 | GLAND-CI | 40 | 14-Jul → 15-Jul | In-process | Turn LTH-01 running, 22/40 done, 1 scrap |
| **WO-2026-0142** | IMPELLER-KV80 | 12 | 14-Jul → 18-Jul | Released, **LATE** | Turn LTH-01 spills shift; Mill VMC01 queued behind W31 overload |
| WO-2026-0136 | PUMP-KV50 (SO-1042) | 24 | 20-Jul → 24-Jul | Draft (awaiting kit) | Assy → Test; **shortage: MOTOR-5HP ×6** |
| WO-2026-0145 (job-work) | CASING-KV50 grinding | 30 | 16-Jul → 22-Jul | Released | Sub-contract: Sri Balaji Engg Works; **GST challan DC-2026-0077** issued 16-Jul (ITC-04 Q2 FY26-27) |

### 20.9 Reorder policies (computed — EOQ & dynamic SS shown with math)

| Item | Policy | D /yr | S ₹ | H ₹/u/yr | **EOQ** | Service | Z | LT (wk) | d/wk | σd | σLT | **Safety stock** | ROP |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MECH-SEAL-25 | EOQ | 2,400 | 800 | 45 | √(2·2400·800/45) = **292** | 95% | 1.645 | 2 | 46 | 12 | 0.5 | 1.645·√(2·144 + 2116·0.25) = **48** | 46·2+48 = **140** |
| CI-CASTING-IMP | ROP | 4,700 | 1,200 | 95 | (345) | 98% | 2.05 | 2 | 90 | 25 | 1.0 | 2.05·√(2·625+8100) = **199** | 90·2+199 = **379** |
| SS-SHAFT-ROD | min/max | — | — | — | — | 90% | 1.28 | 1 | 65 m | 18 | 0.3 | **35 m** | min 100 / max 250 |

(Learned lead time demo: Sri Venkateshwara Foundries promised 14 d, actuals last 8 GRNs = 16.9 d ± 3.1 → MRP offsets with 17 d; Procurement sees the variance chip.)

### 20.10 Alerts & AI examples (seeded)

**Alerts feed:** 🔴 Shortage — MOTOR-5HP 6 pcs for WO-2026-0139 (W30) · 🔴 Overload — WC-VMC01 118% in W31 · 🟠 Late WO — WO-2026-0142 projected +2 days vs SO-1051 need · 🟠 Past-due release — PLO-2026-04412 castings · 🟢 Schedule published v14 approved by R. Karthikeyan.

**AI example 1 — "Why is WO-2026-0142 late?" (pegging explanation, EN/HI):**
> WO-2026-0142 (12 bronze impellers for KV-80, pegged to **SO-1051 — TN Agro tender, need W33**) is projected 2 days late for two linked reasons: (1) its turning op lands **third** on lathe LTH-01 today behind a CI job, adding a 60-minute CI→Bronze changeover — resequencing to run both bronze jobs back-to-back recovers the shift (proposal ready); (2) its milling op is queued on **WC-VMC01, which is loaded 118% in W31** — moving 8 casing pieces of SO-1046 to W32 (SO-1046 has 3 days of slack) frees 4.7 h. Apply both and WO-2026-0142 completes on time. *[Evidence: peg tree SO-1051 → PLO-04418 → WO-2026-0142; board seq LTH-01; heatmap W31.]*
> *Hindi:* "WO-2026-0142 do karan se late hai: LTH-01 par CI job ke baad 60 minute ka changeover, aur VMC-850 par W31 mein 118% load. Dono sujhav apply karein to order samay par poora hoga."

**AI example 2 — Forecast commentary (Diwali uptick):**
> "KV-50 forecast for Oct–Nov 2026 raised 18% over base: the last two years show a **pre-Diwali dealer stocking uptick** (Diwali falls 8-Nov-2026) of +15–22% in weeks W43–W45, and Kirloskar-dealer order-book signals are already 12% ahead of last July. Monsoon-linked agri-pump demand (KV-80) expected to taper after W38. Confidence interval ±9%. Note: W45 has 3 working days — the Diwali holiday block — so W43–W44 MPS receipts carry the build. Suggested: raise W43 MPS by 12 pcs; casting MOQ means one extra foundry lot — order by W39. *(Model: LightGBM + festival features, MAPE last 6 m: 11.4%.)*"

**AI example 3 — CTP what-if:** "Add 40 KV-80 by 20-Aug?" → "Possible by **27-Aug**, not 20-Aug: WC-TEST is the binding constraint (97% W31–W32). Accepting 20-Aug would slip SO-1046 by 4 days (₹ penalty risk) — or add Saturday B-shift on test rig for 2 weeks (₹31,200 overtime) to hold both dates. Choose an option to simulate."

---

## Appendix A — Research findings that shaped this plan

1. **The finite-scheduling gap is real and structural.** Industry guidance consistently says: run MRP infinite for materials, layer a finite scheduler on top for execution — and that layer today is enterprise-priced (Siemens Opcenter APS/Preactor: interactive Gantt, drag-drop, sequence-dependent changeovers, forward/backward/bottleneck strategies, but a bolt-on to a host ERP with high licensing). ERPNext/Odoo/Katana remain effectively infinite-capacity/priority-based. IND-CORE builds that layer natively at SME price — the module's spearhead.
2. **Odoo documents the MPS-vs-reordering-rules conflict** (double ordering when both govern one item) — we promoted it from documentation warning to a hard DB-level guard (V-08).
3. **SAP MRP Live's speedup comes from set-based, level-bulk processing on the DB; D365 Planning Optimization dropped net-change for fast full regens.** We adopt vectorized level-bulk netting (NFR-01) and keep net-change only with a regen-equivalence property test as guardrail (TC-MRP-04). SAP pMRP validated the "simulate demand against critical resources" pattern behind our CTP what-if.
4. **CP-SAT circuit constraints are the practical idiom for sequence-dependent setups** (Google OR-Tools examples; PyJobShop), but arc models are O(n²)/machine and degrade past ~50 jobs/machine — hence the two-tier design: dispatching heuristics (EDD/SPT/CR/ATCS) for instant results, time-boxed warm-started CP-SAT for optimization, bottleneck decomposition at scale.
5. **For SME/intermittent demand, shallow beats deep:** Croston/SBA/TSB remain the reliable intermittent-demand benchmarks and LightGBM leads among ML models with engineered (festival) features at low training cost — so the forecasting stack is classical-first with an LLM only for language, never numbers.
6. **SVAR React Gantt (MIT)** is the 2025–26 open-source performance leader (60 fps @ 1k tasks) and the base for our board; Bryntum/DHTMLX remain the commercial fallback if resource-row customization strains it. FastAPI + Celery + Redis with `update_state` → SSE is the consensus pattern for long-running MRP/optimizer jobs.

*— End of blueprint. Companion plans: `ENGINEERING.md` (Module 1), `SMBD.md` (Module 2). Source spec: `PLANNING.html` §3 + cross-cutting design system.*
