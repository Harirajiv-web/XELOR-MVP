# IND-CORE Module 05 — Inventory and Stores
## Engineering Implementation Blueprint

**Product:** IND-CORE Manufacturing ERP (IND-AI)
**Module:** Inventory / Stores — Append-only Stock Ledger, Warehouses, Batch/Serial Tracking, Movement Documents, Cycle Counting, Valuation, India-Statutory Stores Compliance
**Document version:** 2.0 · **Date:** 19 July 2026 · **Status:** Ready for build
**Audience:** Frontend, Backend, AI and Product teams — start immediately from this document.

Companion module blueprints (one shared IND-CORE platform, one shared pilot universe):
`ENGINEERING.md` (Module 1 — Engineering/PLM) · `SMBD.md` (Module 2 — SMBD) · `PLANNING.md` (Module 3 — Planning/MRP) · `PURCHASE.md` (Module 4 — Purchase/Procurement) · `PRODUCTION.md` (Module 6 — Production/Manufacturing).

> **Load-bearing framing — Inventory is the prerequisite module.** MRP-class planning needs **95–99% inventory record accuracy** to function (Strategos); typical unaudited accuracy measures far lower (~63–65% in the DeHoratius & Raman / Auburn RFID retail studies). Cycle counting closes that gap, and this module is where counting lives. **Production (Module 6) stays OFF until this module is trusted** — the record-accuracy KPI is the explicit go/no-go gate for turning Production on.

---

## 1. Module Overview

Inventory / Stores is the **system of record for where material *is*, how much of it exists, and what it is worth** — across raw material, WIP, finished goods, consumables and scrap; across the plant's physical stores, transit, quarantine, subcontractor premises and customer-supplied material.

### 1.1 The core thesis: a ledger, not a number

Every credible ERP surveyed (SAP MM-IM, ERPNext, Dynamics 365 Business Central, NetSuite, Odoo — full research narrative in Appendix A) implements inventory the same way: as a **document-driven, append-only perpetual ledger**. SAP writes a *material document* for every goods movement and only ever changes quantity/value through those documents; ERPNext appends *Stock Ledger Entries* aggregated into a *Bin* projection; Business Central appends item ledger entries + value entries. Nobody ships an editable on-hand column.

**Design consequence, stated once and enforced everywhere: the stock table is a transaction ledger keyed to vouchers — never an editable on-hand column.** On-hand quantity is a *derived projection* (`bin`), rebuildable from the ledger at any time and never authoritative. There is no admin "fix the number" button; a correction is a Stock Reconciliation document with a mandatory reason code. This vindicates the running-balance lesson from the dashboard MVP: the legacy Excel's "Stock Qty" column is exactly the anti-pattern this module exists to kill.

Everything else in this blueprint hangs off that invariant:

- **One movement document** (Stock Entry) with a purpose enum, shipping 3 purposes at MVP (issue / receipt / transfer) and reserving the manufacturing purposes for Module 6 — same table, extended enum, no new mechanism.
- **One write path**: Purchase's GRN submit and Production's material moves call `POST /api/stock/entries` — every module reaches the ledger through the same validated, locked, valuated pipeline (§10, §11.1).
- **Valuation as replayable computation**: FIFO layers persisted as an ordered `[qty, rate, date]` queue (JSONB) on every ledger row, moving average as the alternative; method hard-locked per item once ledger rows exist (Business Central's immutability rule, copied).
- **Counting as a document**: Stock Reconciliation freezes a book-qty snapshot, takes counts, posts signed differences with GST-aware reason codes — and doubles as the opening-stock CSV loader.
- **India statutory as first-class stores flows**: Rule 55 delivery challans, e-way bill Part A fields with state-configurable thresholds, the GSTIN/place-of-supply transfer branch, the Rule 45 / Section 143 job-work register with 1-year/3-year ageing clocks, Rule 56(2) scrap stock accounts, Section 17(5)(h) reason codes with ITC-reversal flags, RGP/NRGP gate passes, ICDS II-compliant valuation, and the CARO 2020 bank stock statement.

### 1.2 Position in the build sequence

Inventory is the trust anchor of the execution phase. Engineering (M1) defines what items *are*; SMBD (M2) sells them; Planning (M3) decides what to make and buy; Purchase (M4) brings material in. **Inventory records every gram of it, and Production (M6) is only switched on when the last cycle count shows ≥ 95% record accuracy.** Planning's MRP netting consumes this module's projected quantities; a wrong on-hand number silently corrupts every planned order downstream — which is why record accuracy is treated as a hard gate, not a dashboard vanity metric.

### 1.3 Integration contracts (summary)

Full contract detail in §10 (API), §10.12 (events) and §11 (algorithms). The one-line versions:

| Boundary | Direction | Contract summary |
|---|---|---|
| **Purchase (Module 4)** | ↔ | PO confirm → row in the expected-receipts queue (workbench). **GRN submit posts through `POST /api/stock/entries`** into accepted + quarantine warehouses (batches created at GRN). Reorder breach → draft Material Request (purpose = purchase) for the Purchase workbench. GRNI clearing: Inventory emits Dr Stock / Cr GRNI; Purchase clears Dr GRNI / Cr AP at invoice. |
| **Production (Module 6)** | ↔ | Module 6 activates the reserved Stock Entry purposes (`transfer_for_manufacture`, `manufacture`, `repack`, plus job-work GA) — same table, extended enum. WIP = stock sitting in a WIP-type warehouse; subcontractor virtual warehouses carry job-work stock; the scrap warehouse receives production scrap. **The 95% record-accuracy KPI is the go/no-go gate for turning Production on.** |
| **Planning (Module 3)** | → | `bin.projected_qty` (actual + ordered − requested, simplified) feeds MRP netting; `stock.entry.posted` events set Planning's net-change dirty flags; the reorder-rule vs MRP conflict guard (V-INV-16, mirroring Planning's V-08) ensures an item is governed by exactly one replenishment brain. |
| **Sales / Dispatch (SMBD)** | ← | Delivery Note posts at **valuation** (Dr COGS / Cr Stock) — revenue and pricing are not Inventory's job. Challan/e-way printing on the DN; batch on DN lines completes forward traceability to customers. |
| **Accounts (stub)** | → | `gl_event` rows on every submit/cancel (voucher, account, Dr, Cr, reversal on cancel); warehouse → stock-account mapping; reason-coded adjustments carry the Section 17(5)(h) ITC-reversal flag so the eventual GST module inherits clean data. |
| **Quality** | ↔ | `item.inspection_required` flag + nullable Quality Inspection FK gate on receipt-type entries; quarantine (`rejected`-type) warehouses hold uninspected/rejected stock — segregation always via ledger transactions, never edits. |

### 1.4 Scope boundary

| In this module | Not in this module (consumes it) |
|---|---|
| Stock ledger, bins, valuation (FIFO/moving average) | Item/BOM definition (Engineering M1) |
| Warehouse master incl. transit/quarantine/scrap/subcontractor/customer types | PO lifecycle, supplier master, GRN document (Purchase M4 — GRN *posts* here) |
| Stock Entry, Delivery Note, Stock Reconciliation documents | Work-order execution, manufacture/backflush entries (Production M6 — posts here) |
| Batch/serial masters and traceability queries | MRP netting and reorder *policy math* beyond static levels (Planning M3) |
| Reorder-level scan → draft Material Request | Converting the MR to a PO (Purchase M4) |
| Challan/e-way print, job-work register, gate passes, scrap disposal doc | E-way bill/e-invoice *API generation* (deferred — portal-pastable export ships) |
| GL-event emission (Dr/Cr pairs per voucher) | Actual ledgers, trial balance, GST returns (Accounts, future) |
| Bank stock statement report (CARO 2020 3(ii)(b)) | Working-capital finance workflows |

---

## 2. Objectives

| # | Objective | Success metric (pilot targets) |
|---|-----------|-------------------------------|
| O1 | Kill the editable stock column: every movement is a voucher on an append-only ledger | 100% of stock mutations traceable to a submitted document; zero direct-edit paths in code or DB (enforced by trigger + revoked grants, §9.3); property test bin = Σ ledger green in CI |
| O2 | Reach and hold the Production gate: record accuracy ≥ 95% | Cycle counts running weekly within 4 weeks of go-live; accuracy from "unknown/Excel" to ≥ 95% within 2 count cycles; gate status visible on the dashboard |
| O3 | Trustworthy valuation | FIFO/moving-average values reproducible by replay (bin rebuild = identical); ICDS II-compliant (FIFO or weighted average only, LIFO barred); bank stock statement generated in < 5 s at any cutoff date |
| O4 | Statutory-complete stores paperwork | Rule 55 challans, e-way Part A fields with state-config thresholds, job-work register with 1y/3y clocks, RGP/NRGP log, Rule 56(2) scrap accounts — all printable day one; zero "we'll keep that register in Excel" residue |
| O5 | Opening in a day, not a quarter | Client's item master + opening stock loaded from their Excel via CSV with dry-run validation in < 1 day (poor data migration is cited in 38% of ERP failures — Panorama data via Godlan) |
| O6 | Replenishment without gut feel | Nightly reorder scan drafts MRs for exactly the items below level; zero A-class stockouts caused by "nobody noticed" after month 2 |
| O7 | Recall-grade traceability | Any supplier lot/heat number → every document it flowed through (forward + backward) in one query, < 5 s |
| O8 | AI narrates, never counts | Assistant answers stock questions (English + Hindi) grounded on ledger rows with citations; every AI number comes from a deterministic query — the LLM never invents quantities |

---

## 3. User Personas

### 3.1 Stores In-charge — PRIMARY
- **Profile:** S. Poongodi, stores in-charge at Kaveri Pumps & Motors, Coimbatore. 12 years in stores, ITI + materials-management certificate. Runs main stores + FG store with two storekeepers. Today: a 4,000-row Excel register with a hand-edited "Stock Qty" column, a paper gate-pass book, and a job-work notebook her CA asks about every quarter.
- **Goals:** issue fast against approved MRs, receive without queues, always know what's where, pass the CA's stock audit without a weekend of reconciliation.
- **Pain points:** Excel balance trusted until a physical shortage stops assembly; duplicate purchases of parts nobody could find; challan formats rejected by the transporter; job-work material "at the plater's since last year" with no register to prove when it went.
- **Owns:** all Stock Entries, Stock Reconciliations (counts + opening), Delivery Note posting, job-work challans, gate passes, scrap disposal.
- **Screens:** Stores Workbench (home), Stock Entry form, Count screen, Stock Browser, Job-work Register, Gate-pass Log, Reports.

### 3.2 Storekeeper / Material Handler
- **Profile:** K. Selvam, storekeeper under Poongodi. Physically picks, weighs, bins and moves material; enters counts on a tablet during cycle counts; prints challans at the gate.
- **Goals:** unambiguous pick instructions (item, batch, bin hint, qty in *his* UoM), a count sheet he can walk the racks with.
- **Pain points:** kg-vs-pcs confusion on rod and ingot items; illegible manual challans; being blamed for variances that are really unrecorded issues.
- **Screens:** Stores Workbench (pick queue), Stock Entry (execute), Count screen (enter counts), Gate-pass Log.

### 3.3 Procurement Officer
- **Profile:** Anand Krishnan, purchase officer (persona shared with Modules 3/4). Converts draft MRs to POs, chases suppliers, wants GRNs to hit stores without re-keying.
- **Needs from this module:** the expected-receipts queue (confirmed PO lines awaiting GRN), reorder-breach drafts landing in his workbench, quarantine status of received lots, GRNI linkage.
- **Screens:** Stores Workbench (receipts panel, read), Stock Browser, Reports (projected qty).

### 3.4 Production Supervisor
- **Profile:** P. Sathish, assembly shop supervisor at Kaveri. Requests material via MRs, receives issues into WIP, returns excess, sends shafts/gland followers out for plating (job work).
- **Needs:** MR status without walking to stores; batch identity on issued castings (heat numbers for quality); WIP warehouse balances that match what's physically on his line.
- **Screens:** Material Request (create), Stores Workbench (his MR statuses), Stock Browser (WIP warehouses), Job-work Register (his sends).

### 3.5 PPC Planner
- **Profile:** Meenakshi Sundaram, PPC officer (primary persona of Module 3). Consumes this module's numbers rather than operating it.
- **Needs:** projected qty she can trust for MRP netting; the record-accuracy KPI (her Production gate); dead/slow-stock visibility; assurance the reorder-rule/MRP conflict guard is on.
- **Screens:** Stock Browser (read), KPI Dashboard, Reports (ageing, projected).

### 3.6 Finance / CA
- **Profile:** CA Lakshmi Narayanan, part-time CFO/CA (shared persona). Files the bank stock statement against the cash-credit limit, signs off valuation at year-end, answers the auditor.
- **Needs:** RM/WIP/FG value at any cutoff straight off the ledger (CARO 2020 3(ii)(b)); reason-coded adjustments with the 17(5)(h) ITC flag; scrap disposal documents with correct HSN; valuation method provably ICDS II-compliant (Section 145A tax-inclusive view via landed-cost fields, Phase 2).
- **Screens:** Reports (bank stock statement, valuation), KPI Dashboard, Stock Browser (read), GL-event export.

### 3.7 Auditor (read-only)
- **Profile:** Statutory audit team (e.g., M/s Subramaniam & Co, Chartered Accountants). Annual + CARO checks; increasingly asks for system-generated registers.
- **Needs:** immutable ledger with voucher drill-down; count history with variances and reasons; job-work and gate-pass registers; book-vs-bank-statement reconciliation at the statement dates.
- **Screens:** read-only everything; CSV/PDF export on all reports. No create/submit/cancel rights anywhere (§14).

---

## 4. Functional Requirements

Numbering: `FR-INV-xxx`. Priority: **M**ust (MVP) / **S**hould (Phase 2, some ship dark in MVP) / **C**ould (Phase 3). A traceability matrix to the research must-haves (M1–M14) and India-statutory items (§3.1–3.9 of the research base, reproduced in Appendix A) closes this section.

### 4.A Item & Warehouse Masters

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-INV-001 | Item master carries the inventory attribute set (extending Engineering's `item` via migration): `is_stock_item`, `stock_uom`, `valuation_method (fifo\|moving_avg)`, `hsn_code`, `tracking_mode (none\|batch\|serial)`, `inspection_required`, `item_group (rm\|wip\|fg\|consumable\|scrap)`, `shelf_life_days`, active flag. | Non-stock items can never appear on a ledger row (DB CHECK via FK to a stock-items view or trigger); item_group drives report grouping (RM/WIP/FG) and the bank statement. | M |
| FR-INV-002 | **Dual UoM via `uom_conversion`** (item, uom, factor): buy in kg, stock in pcs/m. Ledger rows are ALWAYS in stock UoM; documents may capture any registered UoM with the conversion factor shown on the line. **A conversion factor locks once any submitted document has used it.** | GRN line in kg for a metre-stocked rod posts correct stock-UoM qty; factor edit after first use → 409 with the referencing vouchers listed (V-INV-03). | M |
| FR-INV-003 | Per-warehouse reorder parameters on `item_reorder` (reorder_level, reorder_qty), maintained by Stores/Planner, consumed by the nightly scan (FR-INV-050). | CRUD guarded by role; items governed by Planning's MRP are blocked from reorder rows (conflict guard V-INV-16). | M |
| FR-INV-004 | Warehouse master with **types: `normal`, `transit`, `rejected` (quarantine), `scrap`, `subcontractor` (virtual), `customer` (customer-material, non-valuated)** — each mapped to a stock account; `gstin` + `state_code` on the warehouse drive the transfer tax branch (§11.9). | Type set covers QC segregation, two-step transfers, job work and inward customer material without any new mechanism; `customer`-type warehouses are forcibly non-valuated (CHECK constraint). | M |
| FR-INV-005 | Batch master: `batch_no` unique per item, `supplier_lot_ref` (heat number for castings/rod), `mfg_date`, `expiry_date` (nullable). Serial-number table exists as a schema slot (`tracking_mode='serial'`), activated on demand. | Zoho's simplification copied verbatim: an item is serial-tracked **or** batch-tracked, never both — one enum column. | M (batch) / S (serial) |
| FR-INV-006 | Master hygiene: an item with any ledger rows cannot be deleted (deactivate only); a warehouse with non-zero balance cannot be deactivated; HSN mandatory for items that can appear on challans/DNs. | Attempted delete → 409 with row counts; deactivation validation messages actionable. | M |

### 4.B Stock Ledger & Valuation

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-INV-010 | **Append-only `stock_ledger`** — every submitted document writes signed ledger rows (qty_delta, value_delta) keyed to `(voucher_type, voucher_id)`; **`bin` is a rebuildable projection** (actual qty, valuation rate, value, live FIFO queue), never authoritative. | No endpoint UPDATEs `bin.actual_qty` or any ledger row — enforced in code, by DB trigger, and by revoked grants (§9.3); nightly job asserts bin = Σ ledger per item×warehouse. | M |
| FR-INV-011 | **FIFO valuation**: layers persisted as an ordered `[qty, rate, in_date]` queue in JSONB (`fifo_queue_json`) — the state *after* each row stamped on that row, the live queue held on `bin`. Consumption walks the queue head-first (§11.2). | Golden fixture TC-VAL-01 (hand-computed, = demo data §20.7) reproduced exactly; queue on last ledger row always equals bin queue. | M |
| FR-INV-012 | **Moving-average valuation** as the alternate method: receipts re-average, issues post at current average (§11.3). | Hand-computed fixture TC-VAL-02; division-by-zero guarded at zero balance. | M |
| FR-INV-013 | **Valuation method fixed at item creation, immutable once any ledger row exists** (Business Central's rule). | Method change attempt after first posting → 409 citing first ledger row (V-INV-02); switching requires the documented close-out procedure (issue all, change, re-receive) — deliberately manual. | M |
| FR-INV-014 | **Explicit negative-stock policy: block by default.** Balance validated **as of the posting datetime** at submit (not "now"), including the no-future-dip check for backdated entries; **absolute prohibition for batch/serial-tracked items** (no override). | An issue exceeding the as-of balance is rejected even if later receipts exist (TC-LED-03); error shows the as-of balance and first violating datetime. Rationale: a FIFO queue cannot consume rates from a negative balance — allowing negatives silently corrupts valuation. | M |
| FR-INV-015 | **Backdated entries allowed but surfaced**: inserting a row before existing rows triggers a valuation repost of later rows for that item×warehouse (§11.5); the audit log and the submitting user see "reposted N later entries". | Repost preserves qty history exactly (only valuation columns rewritten); `stock_repost_log` row created; bank statement at any past cutoff remains as-of-consistent (TC-BNK-01). | M |
| FR-INV-016 | **GL-event emission on every submit** (voucher, account, Dr, Cr) with exact reversal rows on cancel: GRN → Dr Stock / Cr GRNI · Issue → Dr Adjustment(or purpose account) / Cr Stock · Transfer → Dr target-wh account / Cr source-wh account · Delivery → Dr COGS / Cr Stock · Count gain/shortage → Stock ↔ Adjustment (+ ITC flag when reason demands). Full pair table in §11.11. | Every submitted voucher's gl_events balance to zero; cancel emits the exact mirror; Accounts stays a stub but the boundary stays honest. | M |
| FR-INV-017 | **Cancel = reversal, never deletion**: cancelling a submitted document writes exact reversal ledger rows (at the original posting datetime, triggering repost of later rows) and mirror GL events; the document is marked cancelled, its rows retained. | TC-LED-05: post → cancel leaves every bin identical to pre-post state and doubles the ledger row count for that voucher. | M |

### 4.C Movement Documents

The document set is deliberately **ERPNext-shaped** — this five-document skeleton is the core movement/adjustment surface of a mature stores module (ERPNext additionally ships Pick List/Packing Slip/etc., deliberately omitted here as WMS-tier).

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-INV-020 | **Stock Entry** with purpose enum — MVP ships `issue`, `receipt`, `transfer`; the enum already contains `send_to_subcontractor`, `transfer_for_manufacture`, `manufacture`, `repack` (disabled until Modules 4/6 flip their feature flags — same table, no migration later). Purpose drives required warehouses: issue → source only; receipt → target only; transfer → both, distinct. | ERPNext's Stock Entry has 8 purposes, 5 non-manufacturing; shipping 3 is a *scope choice*, not a capability gap. Purpose-conditional CHECK constraints in DDL (§9.4). | M |
| FR-INV-021 | **Material Request** (shared doctype with Purchase — see `PURCHASE.md`): purpose enum (purchase\|transfer\|issue), derived statuses (pending/partially/fully processed) computed from downstream documents; Stores works approved MRs as its issue queue. | Issue against an MR decrements its pending qty; over-issue vs MR qty blocked with override role. | M |
| FR-INV-022 | **GRN posts here, owned by Purchase**: GRN submit calls `POST /api/stock/entries` (receipt purpose) into accepted + quarantine warehouses; batches are created at GRN; rejection moves to the `rejected` warehouse via transfer, never by edit. | The single-write-path contract (§10.3) — one ledger API for every module; GRN cancel reverses through the same path. | M |
| FR-INV-023 | **Delivery Note** posts outward stock **at valuation** (Dr COGS / Cr Stock), never at price — revenue belongs to SMBD/Accounts. Carries customer, SO ref, batch per line, challan/e-way fields. | DN value equals FIFO/MA consumption value, not sales price (TC-DOC-03); challan print from the DN. | M |
| FR-INV-024 | **Two-step transfer via `transit` warehouse**: entry-1 posts source → transit; "End Transit" action creates entry-2 transit → destination; in-transit balance visible; "% transferred" derived for partials. | Cheap on top of the purpose enum + warehouse type; transit balances excluded from available-for-issue. | S |
| FR-INV-025 | **Landed-cost / additional-costs distribution** on incoming entries (freight, duty rows in `additional_costs` JSONB, allocated across lines by value) — feeds Section 145A-style tax-inclusive valuation reporting. | Allocation is value-proportional, rounding-safe (Σ allocated = Σ additional exactly); valuation rate includes allocated cost. | S |

### 4.D Batch & Serial Tracking

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-INV-030 | **Batch tracking on raw material** (and any batch-flagged item): batch master with expiry; `batch_id` on every ledger row of tracked items; batch-wise balance always derivable. | Table stakes at the SMB price floor (Zoho, Odoo, ERPNext, BC all ship it); a tracked item's ledger row without batch_id is unstorable (CHECK). | M |
| FR-INV-031 | **Batch pick on issue**: picker suggests batches FIFO-by-receipt-date (expiry-aware warning), storekeeper may override manually; expired batches blocked with role-gated override + reason (V-INV-09). | Suggested pick covers requested qty across batches; override logged. | M |
| FR-INV-032 | **Traceability as a query**: given a batch (or supplier lot/heat no.), return every voucher that touched it — backward to GRN/supplier, forward through issues/transfers to DNs/customers (and to WOs once Module 6 lands). §11.8. | The recall demo: one supplier lot → full document chain < 5 s (TC-BAT-02); genealogy feeds Production later. | M |
| FR-INV-033 | Serial tracking activation: per-unit serial rows, serial state (in-stock/issued/delivered), serial pick on issue/DN. Schema slot ships in MVP; feature flag activates on demand. | An item is batch- OR serial-tracked, never both (enum, FR-INV-005). | S |
| FR-INV-034 | Expiry management: near-expiry report + `stock.batch.expiring` event/alert at configurable horizon (default 60 days); expired-batch balances flagged on the Stock Browser. | Seeded fixture: gasket lot expiring 31-Aug-2026 raises the alert at demo date (§20.16). | S |

### 4.E Stock Reconciliation & Cycle Counting

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-INV-040 | **Stock Reconciliation** doctype with purposes `opening_stock` and `count` — one mechanism for both (ERPNext's collapse, copied): opening loads the client's Excel via CSV; count is the routine cycle-count document. | Same posting engine both ways: recon lines post signed adjustment rows valued per method. | M |
| FR-INV-041 | **Count flow with freeze-snapshot semantics**: create count sheet (scope = warehouse / item group / ABC slice) → **book_qty snapshot frozen at creation** → blind or visible count entry (config) → variance review → post differences. Postings that hit a counted item×warehouse between snapshot and post mark the line **stale**, forcing per-line snapshot refresh + re-confirm before post (V-INV-04). | Freeze-at-creation is the honest table-stakes counting model (no-freeze counting is NetSuite-Smart-Count premium tier — deferred, §18). | M |
| FR-INV-042 | **Mandatory reason codes on count variances and adjustments**: `count_variance \| damage \| theft \| obsolescence \| free_sample`. Reasons in {damage, theft, obsolescence, free_sample} on negative variances set the **Section 17(5)(h) ITC-reversal flag** on the GL event (goods lost/stolen/destroyed/written-off/gifted ⇒ ITC reversal). | One enum column at MVP — expensive to retrofit later; TC-REC-02 asserts the flag on a damage shortage. | M |
| FR-INV-043 | **Record-accuracy KPI per count**: accurate lines ÷ counted lines (within tolerance), trended; the ≥ 95% threshold surfaces as the **Production gate** banner on the dashboard. | Accuracy computed at post time and stored on the recon; the gate state is queryable by Module 6's activation check. | M |
| FR-INV-044 | Cycle-count scheduling: ABC-driven count calendar (A monthly, B quarterly, C semi-annual, configurable) generating draft count sheets; count coverage report. | Draft sheets appear on the workbench on schedule; coverage % by class visible. | S |

### 4.F Replenishment

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-INV-050 | **Reorder check → draft Material Request** (nightly Celery beat + on-demand): for each `item_reorder` row, if projected qty < reorder_level → line on a draft MR (purpose = purchase; one MR per warehouse per run), qty = reorder_qty. The canonical Inventory→Purchase bridge (ERPNext precedent for auto-drafting). | Seeded fixture produces drafts for exactly the items below level (TC-REP-01); `stock.reorder.breached` event emitted; duplicate suppression while a drafted/ordered qty covers the breach. | M |
| FR-INV-051 | **Projected qty** maintained on `bin`: `projected = actual + ordered − requested` (simplified; ordered/requested maintained from Purchase events). Feeds both the reorder scan and Planning's MRP netting. | Projected recomputed on `po.confirmed`, `grn.posted`(via entry), MR submit/close events; drill shows the three components. | M |
| FR-INV-052 | **Conflict guard (V-INV-16)**: an item×warehouse is replenished by *either* Planning's MRP *or* reorder rules, never both — double-ordering is a documented failure mode (Odoo) promoted to a hard constraint, mirroring Planning's V-08. | Creating a reorder row for an MRP-planned item → 409 with the planning policy reference. | M |

### 4.G India Statutory (stores-side GST & audit compliance)

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-INV-060 | **Delivery Challan (CGST Rule 55)** print on issues/transfers/DNs and job-work sends — the statutory document for goods movement without an invoice. Challan-shaped: serial no. (FY-wise series), date, consignor/consignee name-address-**GSTIN**, HSN, description, qty, taxable value, tax rate, transport details, signature block. | Challan completeness validated before print (V-INV-06); numbering sequential per FY; print = PDF, A5/A4 templates. | M |
| FR-INV-061 | **E-way bill (Rule 138) readiness**: Part A fields (recipient GSTIN, place/PIN, challan/invoice no., HSN, value, transporter id/vehicle) live natively on transfer/DN documents; **threshold check against a state-configurable table, never hard-coded** — ₹50,000 inter-state default; ₹1 lakh intra-state in Maharashtra/Delhi/Tamil Nadu (etc.); ₹2 lakh Rajasthan within-city; MP exempts same-district — all as config rows. API generation deferred; a **portal-pastable export** (JSON/CSV matching the NIC bulk template) suffices. | Above-threshold movement without e-way fields → submit-time warning + print watermark "E-way bill required" (V-INV-07); threshold config editable per state with effective dates (TC-STAT-02). | M |
| FR-INV-062 | **Transfer tax branch on GSTIN + place of supply** (§11.9): same GSTIN → Delivery Challan, no GST; different GSTINs (branches are "distinct persons") → **taxable supply requiring a tax invoice even at zero consideration** — IGST if inter-state, CGST+SGST if two registrations within one state. Rule 28 second proviso: the ERP's own valuation rate may serve as invoice value in the full-ITC case. | Branch decided automatically from source/target warehouse GSTIN + state; cross-GSTIN transfer produces a tax-invoice-shaped document stub with tax lines (TC-STAT-03). | M |
| FR-INV-063 | **Job work (Rule 45 / Section 143)**: goods to job workers move under challan into a `subcontractor` virtual warehouse (stock stays on the principal's books); **job-work outward register with challan-wise ageing**: inputs must return within **1 year**, capital goods (incl. dies & tooling) within **3 years**; register feeds **ITC-04** quarterly/half-yearly reporting (challan-wise sent/received/pending export). The document chain detail lives in `PRODUCTION.md` §6; the ledger and register live here. | Ageing bars green < 9 m, amber 9–12 m, red ≥ deadline; ITC-04 export CSV matches challan data (TC-JW-01/02). | M |
| FR-INV-064 | **Deemed-supply flip**: a challan aged past its deadline (1 y inputs / 3 y capital) flips to `deemed_supply` — treated as a taxable supply *dated the original dispatch* with GST + **18% interest** exposure; surfaced in red on the register and as a GL memo event. | 13-month-old input challan auto-flips and appears red (TC-JW-01); flip is irreversible in-module (credit-note path is an Accounts concern, documented). | M |
| FR-INV-065 | **Gate pass (RGP/NRGP)** — standard Indian factory documents for non-sale outward movement (dies/tools out for repair or calibration, material for demo): **Returnable** Gate Pass with expected-return date, pending-return log and overdue alerts; **Non-Returnable** for permanent exits (approver required). The legacy ERP has this; stores staff notice its absence immediately. | RGP without expected return date unstorable (CHECK); overdue RGPs highlighted + alerted (TC-GP-01). | M |
| FR-INV-066 | **Scrap as a first-class stores flow (Rule 56(2))** — stock accounts must cover "raw materials, finished goods, scrap and wastage": scrap items (item_group=scrap), `scrap` warehouse, scrap receipt entries, and an **outward disposal document with per-item HSN** (copper scrap 7404, steel/CI scrap 7204 — 18% GST). Since Oct 2024: B2B metal-scrap sales attract **2% GST TDS above ₹2.5 lakh**, unregistered scrap purchases attract RCM — both surfaced as compliance notes/flags on the disposal doc, not computed (Accounts is a stub). | Disposal doc prints with correct HSN + 18% lines (TC-STAT-04); TDS note appears when doc value > ₹2.5 lakh and buyer registered. | M |
| FR-INV-067 | **Valuation compliance (ICDS II / Section 145A)**: only FIFO and weighted/moving average offered (LIFO barred by ICDS II; Standard/Specific deferred); Section 145A tax-inclusive valuation served via the landed-cost fields + a duties-inclusive report view (Phase 2 report). | Method enum contains exactly {fifo, moving_avg}; compliance note rendered on valuation reports. | M |
| FR-INV-068 | **Bank stock statement (CARO 2020 3(ii)(b))**: manufacturers funding working capital via cash-credit limits file periodic stock statements; auditors must report book-vs-statement discrepancies. One-click report: **RM/WIP/FG (+ consumables/scrap) value as of a cutoff date, straight off the ledger**, with drawing-power margin field; export PDF/CSV in a bank-friendly layout. | Statement at cutoff T equals ledger value at T even after backdated entries (TC-BNK-01); cheap and high-credibility. | M |

### 4.H Reports & KPIs

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-INV-070 | **Core reports as ledger queries** (each with filters + CSV export): **Stock Ledger** (voucher-linked rows), **Stock Balance** (item×warehouse off `bin`), **Projected Qty**, **Stock Ageing** (free once FIFO layers persist — bucketed from layer dates, §11.6), **Batch-wise Balance**, **Bank Stock Statement** (FR-INV-068). | Report list mirrors ERPNext's own stock-report set + the CARO statement; every report row drills to its vouchers. | M |
| FR-INV-071 | **KPI tiles** (formulas in §11.12 / Appendix A §2): Inventory turnover (COGS ÷ avg inventory), Days of inventory by group (RM/WIP/FG), **Record accuracy from last count** (the Production gate), Shrinkage ((book−counted)/book), Dead-stock value (no movement N days, default 180), Stockout incidents (MR lines Stores couldn't issue — internal fill-rate analogue). | Tiles match hand-computed values on the seed dataset (§20.15); never promise a fixed carrying-cost reduction % — quote the 20–30% rule-of-thumb vs APQC ~10% range honestly (Appendix A). | M (tiles) / S (trends) |
| FR-INV-072 | Movement analysis: fast/slow/dead classification per item (movement recency + frequency), feeding the AI dead-stock narrative (§13.1). | Classification thresholds configurable; dead-stock list = ageing report ∩ no-issue window. | S |

### 4.I CSV Import / Opening Stock

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-INV-080 | **CSV import: item master** (inventory attributes incl. UoM conversions, reorder levels) with **dry-run validation report** (row-level errors, nothing written until a clean or explicitly-accepted run). | 38%-of-failures de-risking (Panorama/Godlan); 20k rows validated < 60 s (NFR-INV-09); template downloadable. | M |
| FR-INV-081 | **CSV import: opening stock** via Stock Reconciliation (purpose=opening_stock): item, warehouse, qty, valuation rate, batch/lot ref, (optional) FIFO layer breakup rows for multi-layer opening. | The demo starts from the client's real Excel; totals reconcile to their books (Phase I2 acceptance); opening allowed only into item×warehouse with no prior ledger rows (V-INV-15). | M |
| FR-INV-082 | Import audit: every import run logged (file hash, rows, errors, user); imported documents are normal documents (cancellable/reversible like any other). | Import list screen with drill to created recons/items. | M |

### 4.J Traceability matrix (research must-haves & statutory items → FRs)

| Source | Covered by |
|---|---|
| M1 append-only ledger + bin + FIFO queue + moving avg + method lock | FR-INV-010/011/012/013 |
| M2 negative-stock block as-of, absolute for batch/serial | FR-INV-014 |
| M3 item master, dual UoM, HSN, tracking_mode, inspection flag, reorder params | FR-INV-001/002/003 |
| M4 warehouse types incl. transit/rejected/scrap/subcontractor/customer + stock accounts | FR-INV-004 |
| M5 five ERPNext-shaped documents (MR · GRN · Stock Entry · DN · Stock Recon w/ reasons + CSV) | FR-INV-020/021/022/023/040/042 |
| M6 batch tracking on RM, batch on every ledger row, batch pick | FR-INV-030/031 |
| M7 reorder check → draft MR (nightly + on-demand) | FR-INV-050 |
| M8 CSV import: items + opening stock | FR-INV-080/081/082 |
| M9 cycle-count workflow (snapshot → enter → post w/ reasons) | FR-INV-041/043/044 |
| M10 scrap flow (receipts + disposal doc with HSN) | FR-INV-066 |
| M11 challan-shaped prints + e-way fields/threshold + job-work register w/ 1y/3y ageing | FR-INV-060/061/063/064 |
| M12 gate pass RGP/NRGP with pending-return log + overdue alerts | FR-INV-065 |
| M13 core reports (ledger, balance, projected, ageing, batch-wise, bank statement) | FR-INV-068/070 |
| M14 GL posting emission on every submit + reversal on cancel | FR-INV-016/017 |
| India §3.1 Rule 55 challan | FR-INV-060 |
| India §3.2 e-way bill, state-config thresholds | FR-INV-061 |
| India §3.3 GSTIN/place-of-supply transfer branch, Rule 28 | FR-INV-062 |
| India §3.4 job work Rule 45/s.143, ITC-04, 1y/3y | FR-INV-063/064 |
| India §3.5 scrap Rule 56(2), TDS/RCM | FR-INV-066 |
| India §3.6 Sec 17(5)(h) reason codes + ITC flag | FR-INV-042 |
| India §3.7 gate pass RGP/NRGP | FR-INV-065 |
| India §3.8 ICDS II / Sec 145A valuation | FR-INV-067 (+ FR-INV-025) |
| India §3.9 CARO bank stock statement | FR-INV-068 |

---

## 5. Non-functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-INV-01 | **Append-only invariant enforced in depth**: (a) service layer exposes no update/delete on ledger or bins; (b) `BEFORE UPDATE OR DELETE` trigger on `stock_ledger` raises unless the narrow maintenance path is active (§9.3); (c) app DB role has `UPDATE/DELETE` **revoked** on `stock_ledger`; only the `stock_repost` role may rewrite valuation-projection columns, and only under `app.stock_maintenance='on'` with a `stock_repost_log` row. | All three layers tested (TC-SEC-03); a raw-SQL UPDATE as app role fails at the grant level. |
| NFR-INV-02 | Posting latency | Submit of a 50-line Stock Entry (validation + FIFO + SLE inserts + bin updates + GL events + outbox) p95 < 2 s; single-line < 300 ms. |
| NFR-INV-03 | Posting throughput & contention | ≥ 20 document posts/s sustained across users without deadlock: bins locked `SELECT … FOR UPDATE` in canonical (item_id, warehouse_id) order (§11.1); hot-item contention degrades to queueing, never to deadlock or lost updates. |
| NFR-INV-04 | Read latency off the projection | Stock balance (bin) queries p95 < 150 ms; ledger drill (paginated 100 rows of 1M) p95 < 300 ms; batch trace < 5 s worst case. |
| NFR-INV-05 | **Backdated-repost cost bounds**: ≤ 500 affected later rows → synchronous within the posting request (< 3 s); above → async Celery job with progress + notice on the voucher ("valuation repost of N entries queued"); repost throughput ≥ 1,000 rows/s (set-based replay). Backdating window configurable (default: current + previous open period only). | TC-LED-06; the audit surface always shows "reposted N later entries". |
| NFR-INV-06 | Consistency & isolation | Posting transactions at `READ COMMITTED` + explicit bin row locks (sufficient because all balance math flows through the locked bin row); repost runs `SERIALIZABLE` per item×warehouse with advisory lock. Bin rebuild (§11.4) runs online without blocking posts (rebuild-then-swap). |
| NFR-INV-07 | Audit trail | Every submit/cancel/repost/import/master-change writes an immutable audit row (who, when, before/after JSONB). Documents are never hard-deleted. Audit and ledger retained ≥ 8 years (GST record-retention posture). |
| NFR-INV-08 | DPDP & deployment posture | Single-VM Docker Compose demo; on-prem installable — stock data never leaves the plant if the customer opts; LLM features degrade to deterministic outputs when the external API is disabled (§13). Nightly `pg_dump` + WAL archiving. |
| NFR-INV-09 | CSV import scale | 20,000-row opening-stock file: dry-run validation < 60 s, commit < 120 s, row-level error report streamed; imports idempotent per file hash. |
| NFR-INV-10 | Scale envelope (SME) | 10k active items, 25 warehouses, 5 plants (data-scoped), ~1M ledger rows/year, 5-year online retention (monthly partitioning + BRIN ready at the 5M-row mark, §9.6); 50 concurrent users. |
| NFR-INV-11 | Localization & accessibility | UI strings externalized (en, hi at launch; ta next — Kaveri's storekeepers are Tamil-first); ₹ formatting with lakh/crore grouping; count screen and workbench WCAG AA; challan/gate-pass prints bilingual-ready. |
| NFR-INV-12 | Availability & ops | Pilot 99.5% business-hours; Prometheus metrics on posting latency, repost queue depth, reorder-scan duration; kill-switch for the nightly jobs. |

---

## 6. UI/UX Flow — the storekeeper's daily loop

The module opens on the **Stores Workbench** (worklist-first principle from the shared design system). Poongodi's core daily loop:

```
┌───────────────┐   ┌────────────────┐   ┌───────────────┐   ┌────────────────┐   ┌──────────────────┐
│ 1. Morning    │ → │ 2. Issues      │ → │ 3. Transfers  │ → │ 4. Count       │ → │ 5. End of day    │
│  receipts —   │   │  against       │   │  & job-work   │   │  sheets —      │   │  — reorder scan  │
│  GRNs land    │   │  approved MRs  │   │  sends (chal- │   │  walk racks,   │   │  review, over-   │
│  from POs,    │   │  (pick queue,  │   │  lan print,   │   │  enter counts, │   │  due RGP/chall-  │
│  QC to        │   │  batch picker) │   │  gate passes) │   │  post w/       │   │  an check, KPI   │
│  quarantine   │   │                │   │               │   │  reasons)      │   │  glance          │
└───────────────┘   └────────────────┘   └───────────────┘   └────────────────┘   └──────────────────┘
        ↑                                                                                  │
        └────────── Purchase PO confirmations / Production MRs / SMBD dispatch requests ◄──┘
```

**Morning receipts.** The workbench's *Pending Receipts* panel lists confirmed PO lines awaiting GRN (fed by Purchase's `po.confirmed` events). Selvam receives physically; Anand's GRN submit (Module 4 screen) posts through the one ledger API — inspection-required items land in WH-QC-QTN (quarantine) automatically, the rest in WH-RM. Poongodi sees quarantine ageing chips and chases QC.

**Issues against MRs.** The *Pending Issues* panel lists approved Material Requests (Production's and maintenance's). Opening one pre-fills a Stock Entry (purpose=issue): lines, source warehouse, FIFO-suggested batches (override allowed), conversion factors visible per line. Submit validates the as-of balance — an over-issue is blocked with the balance shown, not silently accepted. The MR's derived status updates.

**Transfers & statutory paper.** Line-side replenishment is a transfer entry (WH-RM → WH-WIP). Sends to the plater are `send_to_subcontractor` challans into WH-SUBCON-SME (job-work register picks them up with their 1-year clocks). A die going out for regrind is an RGP gate pass. Every outward print is challan-shaped; above-threshold movements warn about e-way Part A fields before print.

**Count sheets.** On count days the workbench shows the scheduled sheet (ABC calendar). Selvam walks the racks with the tablet (blind count — book qty hidden by config); Poongodi reviews variances, assigns reason codes (the damage/theft/obsolescence ones visibly tagged "ITC reversal"), posts. The record-accuracy tile updates — the number R. Karthikeyan (plant head) watches for the Production go-live gate.

**End of day.** Reorder-breach drafts from last night's scan reviewed and forwarded to Anand; overdue RGPs and amber job-work challans chased; KPI glance (turnover, DOI, dead stock).

### 6.1 Document lifecycle flows

```
Stock Entry (issue):     draft ──submit──▶ posted     (source wh required; as-of balance check)
Stock Entry (transfer):  draft ──submit──▶ posted     (both wh; same-GSTIN → challan print,
                                                       cross-GSTIN → tax-invoice branch)
Two-step transfer:       entry-1 → transit wh ──"end transit"──▶ entry-2 → destination
Stock Recon (count):     draft(snapshot books) ──enter counts──▶ submit(post deltas w/ reasons)
Delivery Note:           draft ──submit──▶ posted (Dr COGS @ valuation) ──▶ challan/e-way print
Job-work challan:        open ──receipts──▶ partial ──▶ closed | (aged >1y) deemed_supply ⚠
Gate pass (RGP):         open ──return──▶ returned | (past expected) overdue ⚠
Any posted document:     posted ──cancel──▶ cancelled (exact reversal rows, repost surfaced)
```

**Principles (shared design system):**
- **Voucher drill everywhere.** Every quantity on every screen links to the ledger rows and the voucher behind it — the module's signature interaction (the counterpart of Planning's pegging).
- **Guided guarded actions.** Submit, Post Count, Cancel are deliberate buttons with an inline consequence summary ("posts 14 ledger rows · 2 GL events · reposts 3 later entries").
- **Plain language + tooltips.** FIFO, GRNI, ITC-04, RGP, deemed supply all carry hover explanations; validation errors are sentences with the offending numbers shown.
- **Command bar** (top-centre): global search + "✦ ask stores" (English/Hindi), e.g., "how much bronze ingot at Coimbatore?".
- **Mobile/tablet:** count entry, MR issue confirmation, gate-pass return, stock lookup are tablet-first; the ledger grid, recon review and reports are desktop.
- **Breadcrumbs & drill:** Bin ↔ Ledger ↔ Voucher ↔ Batch ↔ Register; parallel drill by warehouse.

---

## 7. Screen-by-Screen Design

### 7.1 Stores Workbench (module home)
- **Layout:** KPI strip (pending receipts, pending issues, open transfers, count sheets due, overdue RGP count, amber/red job-work challans). Below: four worklist panels — **Pending Receipts** (confirmed PO lines: PO, supplier, item, qty, due, quarantine flag), **Pending Issues** (approved MRs: requester, need date, readiness — green if full qty available), **Open Transfers/In-transit**, **Counts & Compliance** (scheduled counts, overdue gate passes, challans nearing deadline).
- **Actions:** open MR → pre-filled issue entry; "Receive" deep-links to Purchase's GRN; start count; print challan; snooze a worklist row (reason + date).
- **States:** panels empty-state with guidance ("No approved MRs — requests appear here when Production submits them"); rows badge red/amber by age; readiness computed live from bins.
- **Mobile:** the two queues (receipts/issues) as swipeable cards.

### 7.2 Stock Browser (with ledger drill-down)
- **Layout:** left rail: warehouse tree (typed icons: normal/transit/quarantine/scrap/subcon/customer) + item-group filter + saved views. Main: **item × warehouse grid off `bin`** (TanStack virtualized): item, warehouse, actual qty (stock UoM), valuation rate, stock value, projected qty (with ordered/requested breakdown popover), ageing chip (oldest-layer age), batch count, reorder status dot. Right panel on row select: **ledger drill** — the SLE rows for that item×warehouse (posting dt, voucher chip, qty ±, rate, value, running balance), batch drill-down, FIFO layer view (`[qty, rate, date]` table straight from `fifo_queue_json`).
- **Actions:** New Stock Entry (context pre-filled), jump to batch trace, export CSV, "✦ Explain this balance" (assistant narrates the last movements).
- **States:** negative-projection warning tint; quarantine rows amber; expired-batch badge; zero-stock rows hidden by default toggle.
- **Empty/error:** never blank — a fresh install shows the opening-stock import CTA.

### 7.3 Stock Entry form (purpose picker)
- **Layout:** header — purpose picker (issue / receipt / transfer; Module-6 purposes greyed with "Enabled with Production module" tooltip), posting datetime (defaults now; backdating role-gated), source/target warehouse selectors (shown per purpose), MR reference, remarks. Lines grid: item (typeahead with code/name/HSN), qty + UoM + **conversion factor visible on every line**, computed stock-UoM qty, batch picker (FIFO-suggested chips; expiry warnings), rate (receipts only), amount. Footer: statutory strip — challan no. (auto), e-way panel (appears when doc value ≥ state threshold), tax-branch indicator for transfers ("Same GSTIN → Delivery Challan" / "Cross-GSTIN → Tax invoice (IGST)").
- **Actions:** Save draft, **Submit** (consequence summary: ledger rows, GL events, any repost), Print challan, Cancel (posted docs — reversal warning).
- **States:** draft/submitted/cancelled pills; per-line validation inline (insufficient as-of balance shows the balance and datetime); stale-price warning on receipts vs last rate ±30%.
- **Error states:** submit failure returns per-line errors, never a generic toast; concurrent-post conflict retries transparently (bin lock queueing).

### 7.4 Stock Reconciliation / Count screen (freeze-snapshot flow)
- **Layout:** stepper — **1. Scope** (warehouse, item group/ABC slice, blind-count toggle) → **2. Sheet** (generated lines: item, batch, book qty *frozen at creation*, counted qty entry — book hidden if blind) → **3. Variance review** (book vs counted, diff qty/value, **reason code per variance line** with ITC-flagged reasons visually tagged, stale-line banners if postings occurred since snapshot) → **4. Post** (summary: N adjustments, value impact, accuracy %).
- **Actions:** print count sheet (rack-walk PDF), tablet entry mode (big touch targets, item photo hint), refresh stale lines (re-snapshot + re-confirm), post, export variance report.
- **States:** draft (counting) / review / posted; per-line stale badge; accuracy % preview updates live during review.
- **Empty/error:** posting with missing reasons on non-zero variances is blocked listing the lines (V-INV-05); a second open count on the same warehouse is prevented (one open sheet per warehouse).

### 7.5 Delivery Note
- **Layout:** header (customer, SO ref, dispatch address, posting date, source warehouse); lines (item, qty, batch — serial when active, warehouse); statutory strip (challan no., e-way panel with threshold state, transporter/vehicle); valuation summary (COGS value — visible to Finance role only).
- **Actions:** submit (posts at valuation), print challan, export e-way Part A JSON, cancel.
- **States:** draft/posted/cancelled; e-way "required" watermark when above threshold and bill no. empty.

### 7.6 Job-work Register (with ageing bars)
- **Layout:** top filter (job worker, material class, status). Main table: challan no., date, job worker (subcontractor warehouse), process, items summary, qty sent / returned / **pending**, material class (input/capital), deadline, **ageing bar** (green < 9 m, amber 9–12 m, red ≥ deadline/deemed supply), ITC-04 period chip. Row expand: line detail + receipt history + linked Stock Entries.
- **Actions:** New challan (send), Receive against challan (partial supported), ITC-04 export (period picker → challan-wise CSV), print challan copy.
- **States:** open/partial/closed/**deemed_supply** (red, locked, GL memo emitted); amber rows raise the weekly digest (§13.6).
- **Empty state:** "No material at job workers" with a link to send flow.

### 7.7 Gate-pass Log
- **Layout:** tabs RGP / NRGP. RGP table: GP no., date, issued to, purpose (repair/calibration/demo), items/asset description, expected return, **days overdue** (red), returned qty, status. NRGP: no., date, issued to, purpose, approver, items.
- **Actions:** New RGP/NRGP, record return (partial supported), print gate pass (security-gate format), close.
- **States:** open/returned/overdue/closed; overdue rows alert (workbench + notification).

### 7.8 Batch Trace / Recall screen
- **Layout:** search by batch no. / supplier lot / heat number. Result: **trace tree** — backward: GRN, PO, supplier, supplier lot ref; forward: every Stock Entry/transfer, (Module 6: WOs and FG batches), Delivery Notes with customers. Timeline view toggle (chronological voucher list). Current-location summary (bins holding remaining qty, incl. subcontractor warehouses).
- **Actions:** export trace (PDF for customer/auditor), jump to any voucher, "✦ Summarize this trace" (assistant writes the recall narrative).
- **States:** partial-trace warning if the chain crosses the pre-ERP boundary (opening-stock rows are terminal nodes, labeled honestly).

### 7.9 Reports (incl. bank stock statement)
- **Layout:** report rail (Stock Ledger, Stock Balance, Projected Qty, Stock Ageing, Batch-wise Balance, Bank Stock Statement, Movement Analysis, Import Logs); parameter bar per report; results in virtualized grid; every report exports CSV; statement/ageing also PDF.
- **Bank Stock Statement:** cutoff-date picker → RM/WIP/FG/consumables/scrap values (warehouse-account grouped), drawing-power margin % input, bank-format layout (banker-recognizable), "as of" stamp + generated-by audit line. The report is *always* as-of-consistent — backdated entries already reposted into history (NFR-INV-05).
- **Stock Ageing:** buckets 0–30/31–60/61–90/91–180/181–365/>365 days from FIFO layer dates; by item/group/warehouse; dead-stock value callout.

### 7.10 KPI Dashboard
- KPI cards (design-system standard: big number, plain label, trend delta, sparkline): **Record accuracy (last count) with the 95% Production-gate marker** · Inventory turnover · DOI by RM/WIP/FG · Dead-stock value (₹, lakh/crore) · Shrinkage % (last count) · Stockout incidents (month) · Open compliance items (overdue RGPs + amber challans).
- Charts: stock value trend by group (Recharts area), ageing distribution (stacked bars), count-accuracy trend with gate line, movement heat by warehouse (ECharts).
- **Gate banner:** when accuracy < 95%: "Production module gate: NOT met — next count Wed. 2 counts ≥ 95% required." (This banner is the demo's closing beat.)

### 7.11 Masters & Import Wizard
- Item inventory attributes (valuation method lock indicator with first-ledger-row date), UoM conversions (lock badges), reorder levels grid, warehouse master (type, stock account, GSTIN/state — with tax-branch preview between any two warehouses), batch master, e-way threshold config (state rows, effective dates).
- **CSV Import Wizard:** upload → column mapping (assistant-suggested, §13.7) → dry-run report (row errors downloadable) → commit → link to created documents. Templates downloadable per import type.

---

## 8. Navigation

Second-level in-module rail (persistent left, under the IND-CORE module rail):

**Workbench · Stock Browser · Stock Entries · Deliveries · Counts · Job Work · Gate Passes · Batches · Reports · Dashboard · Masters**

- **Module home = Stores Workbench** — the "what needs me now" list, per the worklist-first design rule. The rail badge shows pending receipts + issues + overdue compliance count.
- Global command bar top-centre (search across items/batches/vouchers + ✦ ask-stores assistant). Breadcrumbs on every screen (e.g., `Stores › Stock Browser › BRZ-INGOT-LTB2 @ WH-RM › Ledger › STE-2026-0812`).
- Deep links: every entity URL-addressable — `/stores/entries/STE-2026-0812`, `/stores/batches/B-CI-IMP-2606A/trace`, `/stores/jobwork/JWC-2025-0104`, `/stores/reports/bank-statement?cutoff=2026-06-30` — enabling notifications, audit citations and AI-answer chips.
- Role-based landing: Stores In-charge → Workbench; Storekeeper → pick/count queues; Procurement → Stock Browser (projected view); Planner → Dashboard; Finance/Auditor → Reports.

---

## 9. Database Schema (PostgreSQL 16)

Expands the research data model verbatim, hardened with PostgreSQL-16 types, constraints and indexes. Engineering (Module 1) owns `item`; Inventory adds its attribute columns via migration (shown inline, marked ◆). All tables carry `plant_id` scoping and `created_at/updated_at/created_by` audit columns (omitted below for brevity except where structural). Money `NUMERIC(16,2)` (₹), quantities `NUMERIC(14,4)` in **stock UoM always**.

### 9.1 Enums

```sql
CREATE TYPE warehouse_type   AS ENUM ('normal','transit','rejected','scrap','subcontractor','customer');
CREATE TYPE valuation_method AS ENUM ('fifo','moving_avg');          -- ICDS II: FIFO/weighted-avg only; LIFO barred
CREATE TYPE tracking_mode    AS ENUM ('none','batch','serial');       -- Zoho simplification: batch XOR serial
CREATE TYPE se_purpose       AS ENUM ('issue','receipt','transfer',
                                      'send_to_subcontractor',        -- job work (challan-linked)
                                      'transfer_for_manufacture','manufacture','repack');  -- reserved for Module 6
CREATE TYPE adjustment_reason AS ENUM ('count_variance','damage','theft','obsolescence','free_sample');
  -- Sec 17(5)(h): damage/theft/obsolescence/free_sample on a negative delta ⇒ ITC-reversal flag (generated col below)
CREATE TYPE doc_status       AS ENUM ('draft','submitted','cancelled');
CREATE TYPE recon_purpose    AS ENUM ('opening_stock','count');
CREATE TYPE jw_status        AS ENUM ('open','partial','closed','deemed_supply');
CREATE TYPE gp_type          AS ENUM ('rgp','nrgp');
CREATE TYPE gp_status        AS ENUM ('open','returned','overdue','closed');
CREATE TYPE material_class   AS ENUM ('input','capital');             -- Rule 45 clocks: +1y / +3y
```

### 9.2 Masters

```sql
-- Engineering-owned item table; ◆ = columns Inventory adds via migration
ALTER TABLE item
  ADD COLUMN is_stock_item       BOOLEAN NOT NULL DEFAULT TRUE,            -- ◆
  ADD COLUMN stock_uom           TEXT    NOT NULL DEFAULT 'NOS',           -- ◆ ledger rows ALWAYS in this UoM
  ADD COLUMN valuation_method    valuation_method NOT NULL DEFAULT 'fifo', -- ◆ immutable once ledger rows exist (V-INV-02)
  ADD COLUMN hsn_code            TEXT,                                     -- ◆ mandatory for challan/DN items (V-INV-06)
  ADD COLUMN tracking_mode       tracking_mode NOT NULL DEFAULT 'none',    -- ◆
  ADD COLUMN inspection_required BOOLEAN NOT NULL DEFAULT FALSE,           -- ◆ QI gate on receipts
  ADD COLUMN item_group          TEXT NOT NULL DEFAULT 'rm'                -- ◆ drives RM/WIP/FG grouping
      CHECK (item_group IN ('rm','wip','fg','consumable','scrap')),
  ADD COLUMN shelf_life_days     INT CHECK (shelf_life_days > 0);          -- ◆ batch expiry default

CREATE TABLE uom_conversion (
  item_id    BIGINT NOT NULL REFERENCES item,
  uom        TEXT   NOT NULL,                       -- e.g. 'KG' for a metre-stocked rod
  factor     NUMERIC(14,6) NOT NULL CHECK (factor > 0),   -- stock_qty = doc_qty × factor
  is_locked  BOOLEAN NOT NULL DEFAULT FALSE,        -- set TRUE on first submitted use; edits then rejected (V-INV-03)
  PRIMARY KEY (item_id, uom)
);

CREATE TABLE warehouse (
  warehouse_id  BIGSERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,               -- 'WH-RM', 'WH-SUBCON-SME'
  name          TEXT NOT NULL,
  wtype         warehouse_type NOT NULL DEFAULT 'normal',
  plant_id      BIGINT NOT NULL,
  stock_account TEXT NOT NULL,                      -- GL account this warehouse's value posts to
  gstin         TEXT,                               -- registration this location belongs to → transfer tax branch
  state_code    CHAR(2),                            -- '33' TN, '27' MH … → IGST vs CGST+SGST + e-way threshold
  is_valuated   BOOLEAN NOT NULL DEFAULT TRUE,
  party_ref     BIGINT,                             -- subcontractor supplier_id / customer_id for virtual warehouses
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (wtype <> 'customer' OR is_valuated = FALSE),          -- customer material never valuated on our books
  CHECK (wtype NOT IN ('subcontractor','customer') OR party_ref IS NOT NULL)
);

CREATE TABLE item_reorder (
  item_id       BIGINT NOT NULL REFERENCES item,
  warehouse_id  BIGINT NOT NULL REFERENCES warehouse,
  reorder_level NUMERIC(14,4) NOT NULL CHECK (reorder_level >= 0),
  reorder_qty   NUMERIC(14,4) NOT NULL CHECK (reorder_qty > 0),
  PRIMARY KEY (item_id, warehouse_id)
);   -- conflict guard V-INV-16 (MRP-planned items excluded) enforced in service layer + nightly assert

CREATE TABLE batch (
  batch_id         BIGSERIAL PRIMARY KEY,
  item_id          BIGINT NOT NULL REFERENCES item,
  batch_no         TEXT NOT NULL,
  supplier_lot_ref TEXT,                            -- heat number for castings/rod: 'SBC-H-2618'
  mfg_date         DATE,
  expiry_date      DATE,
  UNIQUE (item_id, batch_no),
  CHECK (expiry_date IS NULL OR mfg_date IS NULL OR expiry_date > mfg_date)
);
CREATE INDEX idx_batch_expiry ON batch (expiry_date) WHERE expiry_date IS NOT NULL;  -- expiring scan

CREATE TABLE serial_unit (                          -- schema slot; feature-flagged (FR-INV-033)
  serial_id    BIGSERIAL PRIMARY KEY,
  item_id      BIGINT NOT NULL REFERENCES item,
  serial_no    TEXT NOT NULL,
  warehouse_id BIGINT REFERENCES warehouse,         -- NULL once delivered
  status       TEXT NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock','issued','delivered','scrapped')),
  UNIQUE (item_id, serial_no)
);

CREATE TABLE eway_threshold (                       -- Rule 138 — state-configurable, never hard-coded
  state_code          CHAR(2) PRIMARY KEY,          -- '33' TN, '27' MH, '08' RJ, '23' MP …
  intra_threshold_inr NUMERIC(12,2) NOT NULL,       -- TN/MH/DL ₹1,00,000; default states ₹50,000
  note                TEXT,                         -- 'RJ: ₹2L within-city for specified goods', 'MP: same-district exempt'
  effective_from      DATE NOT NULL DEFAULT CURRENT_DATE
);
-- inter-state threshold (₹50,000) is a single config row in app settings; checks in §11.10
```

### 9.3 The ledger and its projection — the heart of the module

```sql
CREATE TABLE stock_ledger (
  sle_id          BIGSERIAL PRIMARY KEY,
  posting_dt      TIMESTAMPTZ NOT NULL,
  item_id         BIGINT NOT NULL REFERENCES item,
  warehouse_id    BIGINT NOT NULL REFERENCES warehouse,
  qty_delta       NUMERIC(14,4) NOT NULL,           -- signed; stock UoM ALWAYS
  uom             TEXT NOT NULL,                    -- denormalized stock_uom at posting time
  valuation_rate  NUMERIC(14,4) NOT NULL DEFAULT 0, -- ₹/stock-UoM for this row's delta
  value_delta     NUMERIC(16,2) NOT NULL DEFAULT 0, -- signed ₹
  qty_after       NUMERIC(14,4) NOT NULL,           -- running balance after this row (repost-maintained)
  value_after     NUMERIC(16,2) NOT NULL,
  fifo_queue_json JSONB,                            -- [[qty, rate, 'YYYY-MM-DD'], …] — queue state AFTER this row
  batch_id        BIGINT REFERENCES batch,
  serial_no       TEXT,
  voucher_type    TEXT NOT NULL CHECK (voucher_type IN
                    ('StockEntry','GRN','DeliveryNote','StockRecon','JobworkChallan','GatePass')),
  voucher_id      BIGINT NOT NULL,
  voucher_line_id BIGINT,
  is_cancelled    BOOLEAN NOT NULL DEFAULT FALSE,   -- reporting convenience; set ONLY by the cancel path (see below)
  reversal_of     BIGINT REFERENCES stock_ledger,   -- reversal rows point at the row they reverse
  plant_id        BIGINT NOT NULL,
  created_by      BIGINT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE stock_ledger IS
  'APPEND-ONLY perpetual inventory ledger. THE invariant of Module 5: no endpoint ever UPDATEs
   bins.actual_qty or any ledger row — all mutation is new documents producing new ledger rows.
   Cancel writes reversal rows (reversal_of set) and flips is_cancelled on the pair via the
   privileged path. Backdated entries trigger a valuation repost of later rows: ONLY the
   valuation-projection columns (valuation_rate, value_delta, qty_after, value_after,
   fifo_queue_json) may be rewritten, ONLY by role stock_repost under app.stock_maintenance=on,
   ONLY with a stock_repost_log row. qty_delta, item, warehouse, posting_dt, batch are frozen forever.';

-- Enforcement layer 1: trigger
CREATE FUNCTION sle_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'stock_ledger is append-only: DELETE forbidden (sle_id=%)', OLD.sle_id;
  END IF;
  IF current_setting('app.stock_maintenance', TRUE) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'stock_ledger is append-only: UPDATE forbidden outside maintenance path';
  END IF;
  IF NEW.qty_delta   IS DISTINCT FROM OLD.qty_delta   OR NEW.item_id    IS DISTINCT FROM OLD.item_id
  OR NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id OR NEW.posting_dt IS DISTINCT FROM OLD.posting_dt
  OR NEW.batch_id    IS DISTINCT FROM OLD.batch_id     OR NEW.voucher_id IS DISTINCT FROM OLD.voucher_id THEN
    RAISE EXCEPTION 'repost may rewrite valuation projections only — identity/quantity columns are frozen';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_sle_guard BEFORE UPDATE OR DELETE ON stock_ledger
  FOR EACH ROW EXECUTE FUNCTION sle_guard();

-- Enforcement layer 2: grants (layer 3 is the service layer, which simply has no update code path)
REVOKE UPDATE, DELETE ON stock_ledger FROM app_rw;
GRANT  UPDATE (valuation_rate, value_delta, qty_after, value_after, fifo_queue_json, is_cancelled)
       ON stock_ledger TO stock_repost;

-- Indexes: the as-of balance / ledger-drill workhorse, voucher lookup, batch trace, ageing scans
CREATE INDEX idx_sle_item_wh_dt ON stock_ledger (item_id, warehouse_id, posting_dt, sle_id);
CREATE INDEX idx_sle_voucher    ON stock_ledger (voucher_type, voucher_id);
CREATE INDEX idx_sle_batch      ON stock_ledger (batch_id) WHERE batch_id IS NOT NULL;   -- partial: tracked items only
CREATE INDEX idx_sle_posting_brin ON stock_ledger USING brin (posting_dt);               -- cheap time-range scans at 1M+ rows

CREATE TABLE bin (
  item_id         BIGINT NOT NULL REFERENCES item,
  warehouse_id    BIGINT NOT NULL REFERENCES warehouse,
  actual_qty      NUMERIC(14,4) NOT NULL DEFAULT 0,
  valuation_rate  NUMERIC(14,4) NOT NULL DEFAULT 0,
  stock_value     NUMERIC(16,2) NOT NULL DEFAULT 0,
  fifo_queue_json JSONB NOT NULL DEFAULT '[]',      -- LIVE queue; posting reads/writes under row lock
  ordered_qty     NUMERIC(14,4) NOT NULL DEFAULT 0, -- from Purchase po.confirmed / grn events
  requested_qty   NUMERIC(14,4) NOT NULL DEFAULT 0, -- from open MR lines
  projected_qty   NUMERIC(14,4) GENERATED ALWAYS AS (actual_qty + ordered_qty - requested_qty) STORED,
  last_sle_id     BIGINT,
  PRIMARY KEY (item_id, warehouse_id)
);
COMMENT ON TABLE bin IS
  'Projection of stock_ledger — rebuildable at any time (§11.4), NEVER authoritative. The nightly
   invariant job asserts actual_qty = Σ qty_delta and stock_value = Σ value_delta per key.
   No endpoint UPDATEs actual_qty directly; only the posting pipeline and the rebuild job write here.';
CREATE INDEX idx_bin_reorder ON bin (warehouse_id) WHERE actual_qty <> 0;  -- reorder scan / non-empty browse
```

### 9.4 Movement documents

```sql
CREATE TABLE stock_entry (
  se_id           BIGSERIAL PRIMARY KEY,
  se_no           TEXT NOT NULL UNIQUE,             -- 'STE-2026-0812' (FY-wise series)
  purpose         se_purpose NOT NULL,
  posting_dt      TIMESTAMPTZ NOT NULL,
  status          doc_status NOT NULL DEFAULT 'draft',
  source_wh       BIGINT REFERENCES warehouse,
  target_wh       BIGINT REFERENCES warehouse,
  material_request_id BIGINT,                       -- FK to shared MR table (PURCHASE.md)
  work_order_ref  TEXT,                             -- Module 6 slot
  reason_code     adjustment_reason,                -- optional on issues (e.g. free_sample out)
  remarks         TEXT,
  challan_no      TEXT, challan_date DATE,          -- Rule 55 print fields
  eway_bill_no    TEXT,
  doc_value       NUMERIC(16,2),                    -- for e-way threshold check
  tax_branch      TEXT CHECK (tax_branch IN ('none','challan','tax_invoice_igst','tax_invoice_cgst_sgst')),
  additional_costs JSONB,                           -- landed cost rows [{desc, amount}] (FR-INV-025)
  jobwork_challan_id BIGINT,                        -- linked when purpose = send_to_subcontractor
  submitted_by BIGINT, submitted_at TIMESTAMPTZ,
  cancelled_by BIGINT, cancelled_at TIMESTAMPTZ,
  -- purpose-conditional warehouse rules (FR-INV-020):
  CHECK (purpose <> 'issue'    OR (source_wh IS NOT NULL AND target_wh IS NULL)),
  CHECK (purpose <> 'receipt'  OR (source_wh IS NULL     AND target_wh IS NOT NULL)),
  CHECK (purpose NOT IN ('transfer','send_to_subcontractor','transfer_for_manufacture')
         OR (source_wh IS NOT NULL AND target_wh IS NOT NULL AND source_wh <> target_wh))
);
CREATE INDEX idx_se_status ON stock_entry (plant_id, status, posting_dt);

CREATE TABLE stock_entry_line (
  sel_id            BIGSERIAL PRIMARY KEY,
  se_id             BIGINT NOT NULL REFERENCES stock_entry ON DELETE CASCADE,
  line_no           SMALLINT NOT NULL,
  item_id           BIGINT NOT NULL REFERENCES item,
  qty               NUMERIC(14,4) NOT NULL CHECK (qty > 0),   -- in doc UoM
  uom               TEXT NOT NULL,
  conversion_factor NUMERIC(14,6) NOT NULL DEFAULT 1 CHECK (conversion_factor > 0),
  stock_qty         NUMERIC(14,4) GENERATED ALWAYS AS (qty * conversion_factor) STORED,
  batch_id          BIGINT REFERENCES batch,
  serial_nos        TEXT[],
  rate              NUMERIC(14,4),                  -- receipts: incoming rate; issues: filled by valuation engine
  amount            NUMERIC(16,2),
  UNIQUE (se_id, line_no)
);

CREATE TABLE stock_recon (
  recon_id        BIGSERIAL PRIMARY KEY,
  recon_no        TEXT NOT NULL UNIQUE,             -- 'CNT-2026-0009' / 'OPN-2026-0001'
  purpose         recon_purpose NOT NULL,
  posting_dt      TIMESTAMPTZ NOT NULL,
  status          doc_status NOT NULL DEFAULT 'draft',
  warehouse_id    BIGINT REFERENCES warehouse,      -- count scope (opening may span warehouses via lines)
  snapshot_at     TIMESTAMPTZ,                      -- freeze moment (FR-INV-041)
  blind_count     BOOLEAN NOT NULL DEFAULT TRUE,
  expense_account TEXT NOT NULL DEFAULT 'Stock Adjustment',
  accuracy_pct    NUMERIC(5,2),                     -- computed at post (FR-INV-043)
  import_run_id   BIGINT                            -- when created by CSV import
);
-- one open count sheet per warehouse (freeze-window discipline):
CREATE UNIQUE INDEX uq_recon_open_per_wh ON stock_recon (warehouse_id)
  WHERE status = 'draft' AND purpose = 'count';

CREATE TABLE stock_recon_line (
  rl_id           BIGSERIAL PRIMARY KEY,
  recon_id        BIGINT NOT NULL REFERENCES stock_recon ON DELETE CASCADE,
  item_id         BIGINT NOT NULL REFERENCES item,
  warehouse_id    BIGINT NOT NULL REFERENCES warehouse,
  batch_id        BIGINT REFERENCES batch,
  book_qty        NUMERIC(14,4) NOT NULL,           -- SNAPSHOT at sheet creation — never silently refreshed
  counted_qty     NUMERIC(14,4),
  diff_qty        NUMERIC(14,4) GENERATED ALWAYS AS (counted_qty - book_qty) STORED,
  valuation_rate  NUMERIC(14,4) NOT NULL DEFAULT 0,
  reason          adjustment_reason,                -- mandatory when diff ≠ 0 on count (V-INV-05)
  itc_reversal_flag BOOLEAN GENERATED ALWAYS AS
      (reason IN ('damage','theft','obsolescence','free_sample') AND counted_qty < book_qty) STORED,
  is_stale        BOOLEAN NOT NULL DEFAULT FALSE,   -- postings occurred after snapshot (V-INV-04)
  UNIQUE (recon_id, item_id, warehouse_id, batch_id)
);

CREATE TABLE delivery_note (
  dn_id        BIGSERIAL PRIMARY KEY,
  dn_no        TEXT NOT NULL UNIQUE,                -- 'DN-2026-0231'
  customer_id  BIGINT NOT NULL,
  so_ref       TEXT,                                -- SMBD sales order
  posting_dt   TIMESTAMPTZ NOT NULL,
  status       doc_status NOT NULL DEFAULT 'draft',
  challan_no   TEXT, eway_bill_no TEXT,
  doc_value    NUMERIC(16,2),
  transporter  TEXT, vehicle_no TEXT
);
CREATE TABLE dn_line (
  dnl_id       BIGSERIAL PRIMARY KEY,
  dn_id        BIGINT NOT NULL REFERENCES delivery_note ON DELETE CASCADE,
  item_id      BIGINT NOT NULL REFERENCES item,
  qty          NUMERIC(14,4) NOT NULL CHECK (qty > 0),
  warehouse_id BIGINT NOT NULL REFERENCES warehouse,
  batch_id     BIGINT REFERENCES batch,
  cogs_value   NUMERIC(16,2)                        -- filled at valuation by the engine (never price)
);
```

### 9.5 Statutory documents & GL events

```sql
CREATE TABLE jobwork_challan (
  jwc_id        BIGSERIAL PRIMARY KEY,
  challan_no    TEXT NOT NULL UNIQUE,               -- FY-wise series, Rule 55-compliant print
  subcon_wh     BIGINT NOT NULL REFERENCES warehouse,  -- must be wtype='subcontractor' (trigger-checked)
  supplier_id   BIGINT NOT NULL,                    -- the job worker (Purchase-owned master)
  process       TEXT,                               -- 'hard-chrome plating', 'nickel plating'
  issue_date    DATE NOT NULL,
  status        jw_status NOT NULL DEFAULT 'open',
  itc04_period  TEXT                                -- 'FY26-27 Q2' — computed at issue, reported challan-wise
);
CREATE INDEX idx_jwc_open ON jobwork_challan (issue_date) WHERE status IN ('open','partial');

CREATE TABLE jwc_line (
  jwcl_id        BIGSERIAL PRIMARY KEY,
  jwc_id         BIGINT NOT NULL REFERENCES jobwork_challan ON DELETE CASCADE,
  item_id        BIGINT NOT NULL REFERENCES item,
  qty_sent       NUMERIC(14,4) NOT NULL CHECK (qty_sent > 0),
  qty_returned   NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (qty_returned >= 0 AND qty_returned <= qty_sent),
  qty_scrap      NUMERIC(14,4) NOT NULL DEFAULT 0,  -- process loss declared at receipt
  material_class material_class NOT NULL DEFAULT 'input',
  issue_date     DATE NOT NULL,                     -- denormalized from header (trigger-set) for the generated col
  deadline_dt    DATE GENERATED ALWAYS AS (
      (issue_date + CASE WHEN material_class = 'capital'
                         THEN INTERVAL '3 years' ELSE INTERVAL '1 year' END)::date) STORED
      -- Rule 45 / Sec 143: inputs +1y, capital goods (incl. dies & tooling) +3y; ageing keys off this
);
CREATE INDEX idx_jwcl_deadline ON jwc_line (deadline_dt) WHERE qty_returned + qty_scrap < qty_sent;

CREATE TABLE gate_pass (
  gp_id              BIGSERIAL PRIMARY KEY,
  gp_no              TEXT NOT NULL UNIQUE,          -- 'GP-RGP-2026-0018'
  gp_type            gp_type NOT NULL,
  issued_to          TEXT NOT NULL,
  purpose            TEXT NOT NULL,                 -- 'die regrind', 'calibration', 'exhibition demo'
  issue_date         DATE NOT NULL,
  expected_return_dt DATE,
  approver_id        BIGINT,                        -- NRGP requires approver (V-INV-13)
  status             gp_status NOT NULL DEFAULT 'open',
  CHECK (gp_type <> 'rgp'  OR expected_return_dt IS NOT NULL),
  CHECK (gp_type <> 'nrgp' OR approver_id IS NOT NULL)
);
CREATE TABLE gp_line (
  gpl_id       BIGSERIAL PRIMARY KEY,
  gp_id        BIGINT NOT NULL REFERENCES gate_pass ON DELETE CASCADE,
  item_id      BIGINT REFERENCES item,              -- nullable: non-inventory assets go out too
  asset_desc   TEXT,                                -- 'Impeller die KV-50 (asset #D-114)'
  qty          NUMERIC(14,4) NOT NULL CHECK (qty > 0),
  returned_qty NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (returned_qty >= 0 AND returned_qty <= qty),
  CHECK (item_id IS NOT NULL OR asset_desc IS NOT NULL)
);

CREATE TABLE scrap_disposal (
  sd_id       BIGSERIAL PRIMARY KEY,
  sd_no       TEXT NOT NULL UNIQUE,                 -- 'SCR-DISP-2026-0011'
  buyer_name  TEXT NOT NULL,
  buyer_gstin TEXT,                                 -- NULL ⇒ unregistered buyer → RCM note
  posting_dt  TIMESTAMPTZ NOT NULL,
  status      doc_status NOT NULL DEFAULT 'draft',
  tds_note    BOOLEAN GENERATED ALWAYS AS (buyer_gstin IS NOT NULL) STORED  -- 2% GST-TDS note if value > ₹2.5L
);
CREATE TABLE scrap_disposal_line (
  sdl_id   BIGSERIAL PRIMARY KEY,
  sd_id    BIGINT NOT NULL REFERENCES scrap_disposal ON DELETE CASCADE,
  item_id  BIGINT NOT NULL REFERENCES item,         -- item_group='scrap' enforced by trigger
  hsn_code TEXT NOT NULL,                           -- copper 7404 · steel/CI 7204 — 18%
  qty      NUMERIC(14,4) NOT NULL CHECK (qty > 0),
  rate     NUMERIC(14,4) NOT NULL,
  amount   NUMERIC(16,2) NOT NULL
);

CREATE TABLE gl_event (                              -- the honest Accounts boundary (Accounts itself is a stub)
  gle_id       BIGSERIAL PRIMARY KEY,
  posting_dt   TIMESTAMPTZ NOT NULL,
  voucher_type TEXT NOT NULL,
  voucher_id   BIGINT NOT NULL,
  account      TEXT NOT NULL,                       -- 'Stock In Hand — WH-RM', 'GRNI', 'COGS', 'Stock Adjustment'
  debit        NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
  credit       NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  itc_reversal_flag BOOLEAN NOT NULL DEFAULT FALSE, -- Sec 17(5)(h) — carried from recon-line reasons
  memo         TEXT,                                -- e.g. 'deemed supply: challan JWC-2025-0104 aged > 1y'
  CHECK (debit = 0 OR credit = 0)
);
CREATE INDEX idx_gle_voucher ON gl_event (voucher_type, voucher_id);
-- per-voucher Σdebit = Σcredit asserted by a deferred constraint trigger at transaction end

CREATE TABLE stock_repost_log (                     -- backdated-entry audit surface (FR-INV-015)
  rp_id          BIGSERIAL PRIMARY KEY,
  trigger_sle_id BIGINT NOT NULL REFERENCES stock_ledger,
  item_id        BIGINT NOT NULL, warehouse_id BIGINT NOT NULL,
  reason         TEXT NOT NULL,                     -- 'backdated_entry' | 'cancel_reversal' | 'rebuild'
  rows_reposted  INT NOT NULL,                      -- the "reposted N later entries" notice
  gl_delta_count INT NOT NULL DEFAULT 0,
  started_at     TIMESTAMPTZ NOT NULL, finished_at TIMESTAMPTZ,
  actor          BIGINT NOT NULL
);

CREATE TABLE import_run (
  ir_id      BIGSERIAL PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('items','opening_stock')),
  file_name  TEXT NOT NULL, file_hash TEXT NOT NULL,
  dry_run    BOOLEAN NOT NULL,
  rows_total INT, rows_error INT,
  error_report JSONB,                               -- [{row, field, message}]
  status     TEXT NOT NULL CHECK (status IN ('validated','committed','failed')),
  UNIQUE (file_hash, kind, dry_run)                 -- idempotency (NFR-INV-09)
);
```

### 9.6 Shared/foreign tables & operational notes

- `material_request` / `mr_line` — **shared doctype owned jointly with Purchase**; see `PURCHASE.md` §9 for DDL (purpose enum, derived statuses). Inventory writes draft MRs (reorder scan) and consumes approved ones (issue queue); `bin.requested_qty` maintained from open MR lines.
- `v_expected_receipts` — view over Purchase's confirmed PO lines minus received qty; feeds the workbench receipts panel and `bin.ordered_qty`.
- `quality_inspection` — Quality-module stub: `qi_id`, result enum; receipt entries for `inspection_required` items carry a nullable FK and the quarantine-routing rule (V-INV-12).
- **Partitioning**: `stock_ledger` ships as a plain table; at ~5M rows convert to declarative monthly partitions on `posting_dt` (the BRIN index already serves time-range scans; `idx_sle_item_wh_dt` carries the hot path). Documented migration, not premature engineering.
- **Why the queue lives in two places**: `bin.fifo_queue_json` is the *live* state the posting pipeline locks and mutates; `stock_ledger.fifo_queue_json` is the *history* — the state after each row, which is what makes ageing (§11.6), repost replay (§11.5) and audit ("what did the queue look like on 30-Jun?") cheap queries instead of full replays.

---

## 10. API Design (REST, OpenAPI via FastAPI)

Base: `/api/v1/stock`. JWT bearer (access/refresh), RBAC-scoped per §14. All list endpoints: cursor pagination, `?filter=`, `?sort=`. Mutations audited. Errors are structured (`{code, message, details[]}`) with per-line details on document submits.

> **The single-write-path contract.** Every module that moves stock calls the same endpoint: **Purchase's GRN submit and Production's material moves call `POST /api/stock/entries` (+ submit) — one write path to the ledger for every module.** No sibling module writes `stock_ledger` or `bin` directly; the pipeline in §11.1 (validation → locks → valuation → SLE → bin → GL → events) is therefore the *only* code that can change stock. This is the API-level expression of the append-only invariant.

### 10.1 Masters
```
GET/POST  /items                          # inventory attributes (Engineering owns identity)
GET/PATCH /items/{id}                     # valuation_method change → 409 once ledger rows exist
GET/POST  /items/{id}/uom-conversions     # factor edit → 409 if is_locked
GET/PUT   /items/{id}/reorder             # per-warehouse levels; MRP-planned item → 409 (conflict guard)
GET/POST  /warehouses                     # type, stock_account, gstin, state_code
GET/POST  /batches?item_id=               # batch master; GRN auto-creates
GET/PUT   /config/eway-thresholds         # state rows (admin only)
```

### 10.2 Balances & ledger (read)
```
GET /balance?item=&warehouse=&group=&as_of=      # off bin (as_of routes to ledger aggregate)
GET /ledger?item=&warehouse=&from=&to=&voucher=  # paginated SLE rows, voucher-linked
GET /projected?item=&warehouse=                  # actual + ordered − requested, with components
GET /ageing?group=&warehouse=&buckets=30,60,90,180,365
GET /batches/{id}/trace                          # forward+backward voucher tree (§11.8)
GET /fifo-queue?item=&warehouse=                 # live layers [[qty, rate, date]…] (debug/Finance view)
```

### 10.3 Stock entries — the one write path
```
POST /entries                 # create draft
POST /entries/{id}/submit     # negative-stock validation as-of posting_dt happens HERE
POST /entries/{id}/cancel     # writes exact reversal rows (+ repost surface)
GET  /entries?purpose=&status=&from=&to=
```
Sample — Purchase's GRN posting a receipt (accepted + quarantine split):
```json
POST /api/v1/stock/entries
{
  "purpose": "receipt",
  "posting_dt": "2026-07-09T11:20:00+05:30",
  "target_wh": "WH-RM",
  "voucher_ref": {"type": "GRN", "no": "GRN-2026-0470", "po_no": "PO-2231"},
  "lines": [
    {"item": "BRZ-INGOT-LTB2", "qty": 200, "uom": "KG", "conversion_factor": 1,
     "rate": 625.00, "batch": {"batch_no": "B-BRZ-2607", "supplier_lot_ref": "VMA-L-1177"}},
    {"item": "CI-CASTING-IMP", "qty": 50, "uom": "NOS", "rate": 780.00,
     "target_wh_override": "WH-QC-QTN",
     "batch": {"batch_no": "B-CI-IMP-2607A", "supplier_lot_ref": "SBC-H-2655"}}
  ]
}
→ 201 {"se_id": 8123, "se_no": "STE-2026-0871", "status": "draft"}

POST /api/v1/stock/entries/8123/submit
→ 200 {"status": "submitted", "sle_rows": 2, "gl_events": 2,
       "reposted_later_entries": 0,
       "warnings": [{"code": "QI_PENDING", "line": 2,
                     "message": "CI-CASTING-IMP is inspection-required — 50 NOS held in WH-QC-QTN"}]}
```
Sample error — the as-of negative-stock block:
```json
POST /api/v1/stock/entries/8130/submit
→ 422 {"code": "NEGATIVE_STOCK",
       "details": [{"line": 1, "item": "BRZ-INGOT-LTB2", "warehouse": "WH-RM",
         "requested_qty": 500.0, "balance_as_of_posting_dt": 400.0,
         "posting_dt": "2026-07-11T09:00:00+05:30",
         "message": "Issue exceeds balance as of posting time. A FIFO queue cannot consume rates from a negative balance — receive first or correct the quantity."}]}
```

### 10.4 Reconciliation & counting
```
POST /recons                          # {purpose: opening_stock|count, warehouse, scope}
POST /recons/{id}/snapshot            # freeze book_qty for the scope (count sheets)
PUT  /recons/{id}/lines/{rl_id}       # counted_qty, reason
POST /recons/{id}/refresh-stale       # re-snapshot flagged lines (V-INV-04)
POST /recons/{id}/submit              # posts signed deltas; returns accuracy_pct + itc-flag summary
GET  /recons?purpose=&status=         # history with accuracy trend
```

### 10.5 Delivery notes
```
POST /delivery-notes  ·  POST /delivery-notes/{id}/submit  ·  /cancel
GET  /delivery-notes/{id}/challan.pdf ·  GET /delivery-notes/{id}/eway-parta.json
```

### 10.6 Job work
```
POST /jobwork-challans                # send: creates challan + linked send_to_subcontractor entry
POST /jobwork-challans/{id}/receive   # {lines: [{jwcl_id, qty_returned, qty_scrap}]} → return transfer entry
GET  /jobwork-register?status=&aging= # ageing bars dataset; deadline math server-side
GET  /jobwork-register/itc04?period=  # challan-wise ITC-04 export (CSV)
```

### 10.7 Gate passes
```
POST /gatepasses            ·  POST /gatepasses/{id}/return   ·  /close
GET  /gatepasses?type=rgp&status=open&overdue=true
GET  /gatepasses/{id}/print.pdf
```

### 10.8 Replenishment
```
GET  /reorder-breaches                # current breaches with projected-qty breakdown
POST /reorder-scan/run                # on-demand scan → draft MRs (also nightly via Celery beat)
GET  /reorder-scan/runs               # history: items scanned, breaches, MRs drafted
```

### 10.9 Reports
```
GET /reports/stock-balance.csv?group=&warehouse=
GET /reports/stock-ledger.csv?item=&from=&to=
GET /reports/ageing?buckets=          ·  GET /reports/batch-balance?item=
GET /reports/bank-statement?cutoff=2026-06-30&margin_pct=25   # JSON; &format=pdf|csv for exports
GET /reports/movement-analysis?window_days=180
```

### 10.10 Imports
```
POST /import/items?dry_run=true       # multipart CSV → validation report (row-level errors)
POST /import/items                    # commit (requires prior clean/accepted dry run, same file hash)
POST /import/opening?dry_run=true     # → creates draft Stock Recon (purpose=opening_stock) on commit
GET  /import/runs                     # audit list
```

### 10.11 Scrap & AI
```
POST /scrap-disposals  ·  POST /scrap-disposals/{id}/submit   # HSN-lined disposal doc (print.pdf)
POST /ai/query                        # {"q": "इंपेलर कास्टिंग कितनी बची है?", "lang": "hi"} → grounded answer + refs
POST /ai/explain-variance/{rl_id}     # count-variance narrative + suggested reason code
GET  /ai/digests/dead-stock           # latest narrative (deterministic data + LLM text)
GET  /ai/digests/jobwork-risk         # deadline risk digest (§13.6)
```

### 10.12 Events (internal bus — Redis Streams)

Transactional outbox → Redis Streams (consumer groups, replay), transport-agnostic contract shared platform-wide (same pattern as `PLANNING.md` §10.8).

| Event | Producer → Consumer | Effect |
|---|---|---|
| `stock.entry.posted` | Inventory → Planning, Purchase, Production, SMBD | bins changed; Planning sets net-change dirty flags; Purchase updates GRN/PO received state; dashboards invalidate |
| `stock.reorder.breached` | Inventory → Purchase | draft MR created; Purchase workbench badge + notification to Anand |
| `stock.count.posted` | Inventory → Accounts(stub), Planning, Production | adjustment GL events; record-accuracy KPI update; **Production-gate re-evaluation** |
| `stock.jobwork.aging` | Inventory → Purchase, Compliance digest | challans crossing 9 m (amber) / deadline (red → deemed_supply flip) |
| `stock.batch.expiring` | Inventory → Stores, Quality | near-expiry worklist rows + alert |
| `stock.repost.completed` | Inventory → Finance, audit trail | "reposted N later entries" notice on voucher + audit row |
| `po.confirmed` | Purchase → Inventory | expected-receipts row; `bin.ordered_qty` += |
| `mr.approved` / `mr.closed` | Purchase → Inventory | pending-issues queue; `bin.requested_qty` maintenance |
| `so.dispatch.requested` | SMBD → Inventory | draft Delivery Note appears on workbench |
| `wo.released` (Module 6) | Production → Inventory | material-issue context for `transfer_for_manufacture` entries |

---

## 11. Backend Logic

The stores engine lives in `services/stock-engine/` (Python 3.12): a pure-function valuation core (testable without DB) with a thin transactional I/O shell. Long-running work (reposts over threshold, reorder scan, rebuilds, digests) runs on Celery queues `stock` and `stock-batch`.

### 11.1 Posting pipeline & locking (the one write path)

```python
def post_stock_document(doc):                        # called by submit of every voucher type
    intents = expand_to_ledger_intents(doc)          # transfer line → OUT@source + IN@target (same rate);
                                                     # recon line → one signed adjustment intent
    keys = sorted({(i.item_id, i.warehouse_id) for i in intents})
    with db.tx():                                    # READ COMMITTED + explicit locks (NFR-INV-06)
        bins = {k: lock_bin(k) for k in keys}        # SELECT … FOR UPDATE in canonical (item, wh) order
                                                     #   → no deadlock possible (total order on locks)
        for i in ordered(intents):                   # OUT legs before IN legs so transfers self-fund
            validate_negative_stock(i, bins)         # §11.4 — as-of posting_dt, not "now"
            rate, value, queue = valuation_engine(i, bins[i.key])   # §11.2 / §11.3
            sle = insert_sle(i, rate, value, queue)  # fifo_queue_json = state AFTER this row
            update_bin(bins[i.key], i, rate, queue, sle.sle_id)
        if is_backdated(doc):                        # any intent with posting_dt < bin.last posting_dt
            repost_later_entries(doc, keys)          # §11.5 — sync ≤ 500 rows else Celery + notice
        emit_gl_events(doc)                          # §11.11 pairs; deferred trigger asserts Σd = Σc
        outbox.append('stock.entry.posted', payload) # relayed to Redis Streams post-commit
```
The bin row is the serialization point: all balance math flows through the locked row, so plain `READ COMMITTED` is sufficient — two concurrent issues on one item×warehouse queue behind the lock and each sees the queue state the previous one committed.

### 11.2 FIFO-queue valuation engine

The queue is an ordered list of layers `[qty, rate, in_date]`, persisted as JSONB (live copy on `bin`, historical state on every SLE row).

```python
def fifo_receive(queue, qty, rate, on):              # receipt / transfer-in / positive adjustment
    if queue and queue[-1].rate == rate and queue[-1].date == on:
        queue[-1].qty += qty                         # merge same-day same-rate (keeps queues short)
    else:
        queue.append(Layer(qty, rate, on))
    return rate, qty * rate, queue                   # incoming value = qty × given rate

def fifo_consume(queue, qty):                        # issue / transfer-out / DN / negative adjustment
    remaining, value = qty, Decimal(0)
    while remaining > 0:
        if not queue:                                # nothing left to consume a rate from —
            raise NegativeStockError                 # this is WHY negatives are blocked (§11.4)
        head = queue[0]
        take = min(head.qty, remaining)
        value += take * head.rate
        head.qty -= take; remaining -= take
        if head.qty == 0: queue.pop(0)
    effective_rate = value / qty
    return effective_rate, -value, queue             # signed value_delta
```

**Worked example (= golden test TC-VAL-01 = demo thread §20.7)** — BRZ-INGOT-LTB2 (bronze ingot, KG, FIFO) at WH-RM, Kaveri Coimbatore:

| Date | Voucher | Δ qty | Rate ₹/kg | Queue after `[qty@rate]` | Δ value ₹ | Balance | Value ₹ |
|---|---|---|---|---|---|---|---|
| 01-Jul | OPN-2026-0001 (opening) | +250 | 610.00 | [250@610] | +152,500.00 | 250 | 152,500.00 |
| 03-Jul | STE-2026-0801 ← GRN-2026-0455 | +400 | 618.00 | [250@610, 400@618] | +247,200.00 | 650 | 399,700.00 |
| 06-Jul | STE-2026-0812 (issue → WH-WIP) | −300 | 611.33* | [350@618] | −183,400.00 | 350 | 216,300.00 |
| 09-Jul | STE-2026-0871 ← GRN-2026-0470 | +200 | 625.00 | [350@618, 200@625] | +125,000.00 | 550 | 341,300.00 |
| 11-Jul | STE-2026-0839 (issue → WH-WIP) | −150 | 618.00 | [200@618, 200@625] | −92,700.00 | 400 | 248,600.00 |

\* consumption walk: 250 kg @ 610 = 152,500 + 50 kg @ 618 = 30,900 → 183,400 ÷ 300 = **₹611.33** effective. Closing check: 200×618 + 200×625 = **₹248,600** ✓. The engine must reproduce this table exactly, including the queue states.

### 11.3 Moving average

```python
def ma_receive(bin, qty, rate):
    new_qty   = bin.actual_qty + qty
    new_value = bin.stock_value + qty * rate
    bin.valuation_rate = new_value / new_qty          # re-average on every receipt
def ma_consume(bin, qty):
    return bin.valuation_rate, -(qty * bin.valuation_rate)   # issues at current average
```
Zero-balance receipt resets the average to the incoming rate. Ageing for MA items uses a shadow FIFO queue maintained for dates only (§11.6).

### 11.4 Negative-stock validation — as of posting datetime

```sql
-- balance as of the entry's posting_dt (NOT now):
SELECT COALESCE(SUM(qty_delta), 0) AS bal_asof
FROM   stock_ledger
WHERE  item_id = :item AND warehouse_id = :wh AND posting_dt <= :posting_dt;
```
Rules (FR-INV-014, V-INV-01):
1. `bal_asof + qty_delta < 0` → reject with the as-of balance shown. **An issue exceeding the balance at its posting time is rejected even if later receipts exist** — the receipt hadn't happened yet at that point on the timeline.
2. **No-future-dip check** for backdated positive-or-negative entries: replay the running balance from `posting_dt` forward; if any subsequent point dips below zero, reject and name the first violating datetime/voucher.
3. **Batch/serial items: absolute prohibition, no override role exists.** Batch-wise balance validated the same way per batch.
4. *Why so strict:* a FIFO queue cannot consume rates from a negative balance — there is no layer to take a rate from. "Allow negative" settings in legacy ERPs silently corrupt valuation and then reconcile it away at year-end; this module refuses the corruption up front.

### 11.5 Backdated-entry repost

```python
def repost_later_entries(item, wh, from_dt, actor, reason):
    with advisory_lock(item, wh), db.tx(isolation='SERIALIZABLE'):
        set_config('app.stock_maintenance', 'on')            # opens the narrow trigger path (§9.3)
        anchor = last_sle_before(item, wh, from_dt)          # queue state to replay from
        queue, qty, value = load_state(anchor)               # or empty state if none
        rows = sle_rows_from(item, wh, from_dt)              # ordered by (posting_dt, sle_id)
        gl_deltas = []
        for row in rows:                                     # identity/qty frozen; valuation rewritten
            rate, vdelta, queue = replay(row.qty_delta, row.given_rate, queue)
            if (vdelta, rate) != (row.value_delta, row.valuation_rate):
                gl_deltas.append(correction_pair(row, vdelta - row.value_delta))
            update_valuation_projection(row, rate, vdelta, qty, value, queue)
        rebuild_bin_from_last_row(item, wh)
        emit(gl_deltas)                                      # value corrections, never qty
        log = insert_repost_log(rows_reposted=len(rows), reason=reason, actor=actor)
        outbox.append('stock.repost.completed', log)         # → "reposted N later entries" on the voucher UI
```
Cost bounds per NFR-INV-05 (≤ 500 rows sync, else async with progress). Cancel uses the same machinery: reversal rows are inserted **at the original posting_dt**, then later rows repost. The audit surface is non-negotiable — the submitting user always sees "reposted N later entries", and the bank statement stays as-of-consistent at every past cutoff (TC-BNK-01).

### 11.6 Stock ageing from FIFO layers

Because every layer carries `in_date`, ageing is a projection of the live queue — no extra bookkeeping:
```python
def ageing_buckets(bin, today, edges=(30, 60, 90, 180, 365)):
    out = defaultdict(lambda: [0, 0])                        # bucket → [qty, value]
    for qty, rate, in_date in bin.fifo_queue_json:
        b = bucket_of((today - in_date).days, edges)         # '0-30' … '>365'
        out[b][0] += qty; out[b][1] += qty * rate
    return out
```
Dead stock = value in `>N days` buckets ∩ items with no issue in the window (FR-INV-072). MA items use the dates-only shadow queue.

### 11.7 Reorder-breach scan → draft Material Request

Celery beat, nightly 02:00 IST + on-demand (`POST /reorder-scan/run`):
```python
for r in item_reorder.join(bin):
    if r.item in mrp_planned_items: continue                 # conflict guard V-INV-16
    if bin.projected_qty < r.reorder_level:
        open_cover = drafted_or_ordered_qty(r.item, r.warehouse)
        if bin.projected_qty + open_cover >= r.reorder_level: continue   # duplicate suppression
        mr = get_or_create_draft_mr(r.warehouse, run_id)     # one MR per warehouse per run
        mr.add_line(r.item, qty=r.reorder_qty, reason=f'projected {bin.projected_qty} < level {r.reorder_level}')
emit('stock.reorder.breached', per_item_payload)             # Purchase workbench pickup
```

### 11.8 Batch forward/backward trace

```sql
-- every voucher that touched a batch, in time order (the recall query):
SELECT sl.posting_dt, sl.voucher_type, sl.voucher_id, sl.warehouse_id, sl.qty_delta
FROM   stock_ledger sl WHERE sl.batch_id = :batch ORDER BY sl.posting_dt, sl.sle_id;
```
Traversal builds the tree: **backward** — the batch's first positive row → GRN → PO → supplier + `supplier_lot_ref` (heat no.); **forward** — issues/transfers → destination warehouses (incl. subcontractor), Delivery Notes → customers; with Module 6, WO consumption rows link input batches to output FG batches (genealogy). Opening-stock rows are terminal nodes labeled "pre-ERP". Multi-level expansion is a recursive walk over batch-linked vouchers; depth at SME scale ≤ 4, response < 5 s worst case (NFR-INV-04).

### 11.9 GSTIN / place-of-supply transfer branching

```python
def tax_branch(src_wh, tgt_wh):                              # decided at transfer submit; stored on the doc
    if src_wh.gstin == tgt_wh.gstin or (src_wh.gstin is None and tgt_wh.gstin is None):
        return 'challan'                                     # same registration → Rule 55 Delivery Challan, no GST
    # different GSTINs: branches are "distinct persons" → taxable supply even at zero consideration
    if src_wh.state_code != tgt_wh.state_code:
        return 'tax_invoice_igst'                            # inter-state
    return 'tax_invoice_cgst_sgst'                           # two registrations within one state
```
Invoice value in the cross-GSTIN branch defaults to the ERP's own valuation rate — Rule 28 second proviso permits declared invoice value when the recipient has full ITC. The document print switches template accordingly; the GL memo carries the branch for the future GST module.

### 11.10 E-way threshold check (state-config table)

```python
def eway_check(doc):                                         # transfers + DNs, at submit and print
    intra = doc.src_state == doc.tgt_state
    limit = eway_threshold[doc.src_state].intra_threshold_inr if intra else settings.EWAY_INTERSTATE_LIMIT  # ₹50,000
    if doc.doc_value >= limit and not doc.eway_bill_no:
        warn('EWAY_REQUIRED', limit=limit, note=eway_threshold[doc.src_state].note)
        watermark_print('E-way bill required')                # warning, not hard block — portal API deferred
```
State rows are data (`eway_threshold`), never code: MH/DL/TN ₹1 lakh intra-state, Rajasthan ₹2 lakh within-city note, MP same-district exemption note, default ₹50,000. Part A export (`/delivery-notes/{id}/eway-parta.json`) matches the NIC bulk-generation template.

### 11.11 GL-event emission pairs (per document type)

| Document (submit) | Dr | Cr | Notes |
|---|---|---|---|
| GRN receipt (via entry) | Stock In Hand (target-wh account) | GRNI (Stock Received But Not Billed) | Purchase clears GRNI → AP at invoice |
| Stock Entry — issue | Stock Adjustment / purpose account | Stock In Hand (source wh) | issue-to-WIP uses WIP account once M6 lands |
| Stock Entry — transfer | Stock In Hand (target wh) | Stock In Hand (source wh) | net zero across the company; branch memo carries tax_branch |
| Delivery Note | COGS | Stock In Hand (source wh) | at valuation, never price |
| Recon — gain | Stock In Hand | Stock Adjustment | |
| Recon — shortage | Stock Adjustment | Stock In Hand | `itc_reversal_flag=true` when reason ∈ {damage, theft, obsolescence, free_sample} (17(5)(h)) |
| Scrap receipt entry | Stock In Hand (scrap wh) | Scrap Recovery | |
| Scrap disposal | COGS — Scrap | Stock In Hand (scrap wh) | TDS/RCM compliance notes on doc; revenue side = Accounts stub |
| Job-work send | — (memo only) | — | value stays on principal's books (subcon wh is ours) |
| Deemed-supply flip | — (memo event) | — | 'GST + 18% interest exposure, challan {no}, dispatch date {d}' |
| Any cancel | exact mirror of the above | | same accounts, swapped sides, reversal rows |

Every voucher's events balance to zero (deferred constraint trigger); `gl_event` is the complete, replayable feed the future Accounts module ingests.

### 11.12 KPI formulas (deterministic — the AI narrates these, never computes its own)

| KPI | Formula | Source |
|---|---|---|
| Inventory turnover | COGS(12 m) ÷ avg inventory value | gl_event COGS + bin history (healthy ≈ 2–4, practitioner heuristic) |
| Days of inventory | (avg inventory ÷ COGS) × 365, per item_group | same, split RM/WIP/FG |
| Record accuracy | accurate lines ÷ counted lines (tolerance-banded) | stock_recon.accuracy_pct — **the 95% Production gate** |
| Shrinkage | (book − counted) ÷ book, value-weighted | recon lines |
| Fill-rate analogue | MR lines Stores couldn't issue in full ÷ MR lines | MR + issue entries (leading-indicator pair with stockouts) |
| Safety stock (suggestion) | (max daily use × max lead) − (avg daily use × avg lead) | issue history + Purchase lead times → §13.4 |
| Dead stock | value with no movement in N days (default 180) | ageing ∩ movement analysis |

---

## 12. Frontend Components

React 18 + TypeScript; shadcn/ui primitives; TanStack Query (server state) + TanStack Table (grids). Module component library `@ind-core/stores-ui`:

| Component | Description & key props |
|---|---|
| `<StoresWorkbench>` | Four worklist panels (receipts / issues / transfers / counts+compliance) with badge counts, age tinting, swipe actions on tablet. Props: `filters, onOpenMR, onStartCount`. |
| `<StockBrowserGrid>` | **TanStack Table + Virtual** — the 10k-row item×warehouse grid off `bin` at 60 fps; column sets per role; projected-qty breakdown popover; ageing chips. Row select → `<LedgerDrilldown>`. |
| `<LedgerDrilldown>` | Virtualized SLE list (paginated cursor fetch), voucher chips deep-linking, running-balance column, FIFO layer table rendered straight from `fifo_queue_json`, "state as of" date scrubber (reads historical queue off the SLE rows). |
| `<StockEntryForm>` | Purpose picker (drives visible warehouse fields via the same rules as the DDL CHECKs), line grid with `<UomCell>` (factor always visible, lock badge) and `<BatchPicker>`, statutory strip (`<ChallanPanel>`, `<EwayPanel>`, `<TaxBranchBadge>`), consequence-summary submit dialog ("14 ledger rows · 2 GL events · reposts 3 later entries"). |
| `<BatchPicker>` | FIFO-suggested batch chips (expiry-aware warning tint), manual override list with per-batch balance, multi-batch split editor covering the line qty. |
| `<CountSheet>` | Stepper (scope → sheet → review → post); tablet mode: large touch targets, numeric pad, blind-count masking; stale-line banners with per-line refresh; offline-tolerant draft cache (retry queue). |
| `<VarianceReview>` | Book vs counted diff grid; reason-code select with **"ITC reversal" tags** on 17(5)(h) reasons; accuracy % live preview; ✦ explain-variance button per line (§13.2). |
| `<JobworkRegister>` | Table with `<AgeingBar>` (green < 9 m / amber 9–12 m / red ≥ deadline), deadline countdown, ITC-04 period chips, receive-against-challan dialog with scrap-qty field. |
| `<GatePassLog>` | RGP/NRGP tabs, overdue highlighting, return-recording dialog (partial), gate-format print trigger. |
| `<BatchTraceTree>` | Expandable voucher tree (backward/forward), timeline toggle, current-location summary, PDF export; nodes deep-link; renders from the trace API's nested JSON. |
| `<ChallanPrint>` / `<GatePassPrint>` | Print-ready A4/A5 React-PDF templates: Rule 55 field layout, FY-serial, HSN/qty/taxable value columns, e-way watermark logic, bilingual labels. |
| `<BankStockStatement>` | Cutoff picker + margin % input → grouped value table (RM/WIP/FG/consumables/scrap), bank-layout PDF export, "as-of consistency" stamp with last-repost info. |
| `<AgeingChart>` / `<KpiCard>` | Shared design-system cards; Recharts stacked bars for buckets; **ECharts** heat matrix for movement-by-warehouse; the accuracy card renders the 95% gate line + gate banner state. |
| `<CsvImportWizard>` | Upload → `<ColumnMapper>` (assistant-suggested mapping, §13.7) → dry-run error grid (downloadable) → commit progress → created-document links. |
| `<AiAssistPanel>` | The shared "✦ AI" pattern: streamed answer + **evidence rows (ledger/bins) rendered as chips** + accept/reject where an action is proposed; language toggle EN/हिंदी; degrades to deterministic templates when LLM is off (DPDP mode). |

State conventions: TanStack Query keys per plant + warehouse; `stock.entry.posted` SSE/event → invalidate `['bins']`, `['ledger', item]`; entry form is local-first with optimistic draft save; submit never optimistic (server is the validator of record for the as-of check).

---

## 13. AI Features

Platform doctrine (identical across IND-CORE): **numbers from deterministic models, language from the LLM — the LLM never invents quantities.** Every feature below runs a deterministic query/computation first; Claude (Anthropic API) receives the computed rows as tool results and writes the narrative with citations. Assistant surfaces in **English + Hindi** (Tamil next — Kaveri pilot). Tool-use is **read-only module APIs** (§10.2, §10.9); any suggested action becomes a pre-filled screen a human confirms. On-prem/DPDP tenants: LLM calls disableable — deterministic outputs (tables, templated sentences) always available underneath.

### 13.1 Dead-stock & slow-moving narrative
Nightly job runs the ageing + movement-analysis queries (deterministic), then Claude writes the digest: *what* is dead (top items by value), *since when* (layer dates), *why it matters* (₹ locked, storage), *suggested dispositions* (return-to-vendor window, scrap disposal with HSN note, promotion to Sales). Output on the dashboard + weekly email. Evidence rows attached; every ₹ figure is from the query payload.

### 13.2 Count-variance anomaly explanations
Deterministic outlier detection over count history (variance % vs item's historical variance distribution, value-weighted z-score) flags anomalous lines; Claude explains each flagged line in plain language and **suggests a reason code** with its rationale ("−2 pcs on mechanical seals with intact packaging pattern matches prior damage write-offs, not theft; suggest reason = damage → note: ITC reversal applies"). The human picks the final reason — the suggestion is never auto-applied (it has GST consequences).

### 13.3 Conversational stock queries (EN + HI)
Command-bar assistant with tool-use over `/balance`, `/ledger`, `/ageing`, `/batches/trace`, `/jobwork-register`:
- "How much bronze ingot at Coimbatore?" → tool call → "400 kg BRZ-INGOT-LTB2 in WH-RM (₹2,48,600 at FIFO), 150 kg in WH-WIP. Last receipt 09-Jul (GRN-2026-0470, 200 kg @ ₹625)." with voucher chips.
- "इंपेलर कास्टिंग कितनी बची है?" → "WH-RM में 40 NOS CI-CASTING-IMP (बैच B-CI-IMP-2606A, हीट SBC-H-2618) और WH-QC-QTN में 50 NOS QC-होल्ड में हैं।"
- Guardrails: answers must cite retrieved rows (refuse if no evidence); pgvector embeddings over item names/aliases for fuzzy matches ("woh bada casting wala item"); numbers verbatim from tool results.

### 13.4 Reorder-parameter suggestions
Deterministic engine computes per item×warehouse: `SS = (max daily use × max lead time) − (avg × avg)` from issue history + Purchase's learned lead times (Module 3 §13.5 data), plus a reorder-level proposal. Claude narrates the *change rationale* ("usage up 22% over 8 weeks on KV-50 launch; Venkatramana's actual lead is 6 d vs promised 4 → raise level 250 → 340 kg"). Proposals land in a diff screen; Stores/Planner approves; audit row on apply. The formula's numbers are computed, never generated.

### 13.5 Shrinkage-pattern flags
Deterministic scan across count history: recurring negative variances clustered by item family, warehouse zone, or count operator; statistical baseline per cluster. Flags (never accusations) go to Stores In-charge + Plant Manager only (sensitive — restricted visibility, §14): "Fasteners in WH-RM rack C show −1.8% median variance across 4 consecutive counts vs −0.2% store-wide; consider relocating to caged storage or counting weekly." LLM writes the neutral summary; the cluster math is attached.

### 13.6 Job-work deadline risk digest
Weekly deterministic sweep of `jwc_line` deadlines → risk-ranked list (days left × value at job worker × worker's historical return latency). Claude writes the digest with the statutory stakes spelled out: "50 gland followers at Sree Murugan Electroplating cross the 1-year Rule 45 limit on 12-Sep-2026 (60 days) — unreturned material becomes a deemed supply dated 12-Sep-2025 with GST + 18% interest. Suggested: recall or invoice conversion this month." Deep-links to the challan + receive action.

### 13.7 Opening-import mapping assistant
During CSV import, Claude maps the client's Excel headers/values to the template (columns "Qty in Godown", "Rate/Unit" → `qty`, `valuation_rate`; UoM strings "Kgs", "Mtrs" → registered UoMs; suggests `item_group` from item-name patterns). Mapping is shown for confirmation; dry-run validation stays fully deterministic. This is the 38%-failure-mode killer (Appendix A) with the friction taken out.

---

## 14. Security

### 14.1 Role-permission matrix (personas × document rights)

C = create/edit draft · S = submit (post) · X = cancel (reversal) · R = read · — = none. **Nobody, in any role, can edit a posted row — "edit posted" does not exist as a permission in the system** (the schema and grants make it unimplementable, §9.3).

| Capability | Stores In-charge | Storekeeper | Procurement | Prod. Supervisor | PPC Planner | Finance | Auditor | Admin |
|---|---|---|---|---|---|---|---|---|
| Stock Entry (issue/receipt/transfer) | C S X | C (S ≤ ₹50k value) | R | C (draft MR-linked only) | R | R | R | C S X |
| GRN posting (via Purchase) | R | R | C S X (Module 4 role) | — | R | R | R | R |
| Delivery Note | C S X | C | — | — | R | R | R | C S X |
| Stock Recon — opening | C S | — | — | — | R | R | R | C S |
| Stock Recon — count | C S X | C (enter counts only) | — | — | R | R | R | C S X |
| Reason-code assignment (17(5)(h)) | S | — | — | — | — | R | R | S |
| Job-work challan / receive | C S X | C | R | C (request) | R | R | R | C S X |
| Gate pass RGP/NRGP | C S | C (RGP only) | — | C (request) | — | R | R | C S (NRGP approver) |
| Scrap disposal | C S | C | — | — | — | R | R | C S |
| Item inventory attrs / UoM / reorder | C | — | R (reorder view) | — | C (reorder levels) | R | R | C |
| Warehouse master / e-way config | R | — | — | — | — | R | R | C |
| CSV imports | S (opening) | — | — | — | — | R | R | C S |
| Backdated posting (> 24 h) | with reason | — | — | — | — | — | — | with reason |
| Trigger repost / bin rebuild | — | — | — | — | — | — | — | S (logged) |
| Reports & bank statement | R | R (stock only) | R | R (WIP only) | R | R + generate | R | R |
| Shrinkage-pattern flags (§13.5) | R | — | — | — | — | R | — | R |

### 14.2 Controls
- **JWT access (15 min) / refresh (7 d) with RBAC claims**; permissions enforced server-side per endpoint (FastAPI dependency); UI hides what the role can't do. Plant-level data scoping on every query.
- **Append-only enforcement in depth** (NFR-INV-01): no update code path + `trg_sle_guard` trigger + revoked `UPDATE/DELETE` grants; the `stock_repost` role is held only by the engine service account, never by a user session.
- **Immutable audit log**: submit/cancel/repost/import/master-change → append-only audit rows (who/when/before/after JSONB); audit table under the same trigger+grant regime as the ledger.
- Two-step guarded actions: cancel of value > ₹1 lakh and any NRGP require a second role's approval; backdating beyond the open period requires Finance.
- Storekeeper submit ceiling (₹50k) keeps day-labour flexibility without exposure; ceilings configurable.
- Device-bound tokens for count tablets; count-entry sessions warehouse-scoped.
- AI endpoints: read-only tool scope, per-tenant isolation, no cross-tenant retrieval; DPDP posture — stock data stays in-region/on-prem, LLM calls disableable per tenant; §13.5 outputs visibility-restricted.
- Rate limits on posting endpoints per user; the repost/rebuild endpoints admin-only + logged.

---

## 15. Validation Rules

| ID | Rule |
|----|------|
| V-INV-01 | **Negative-stock block**: balance validated as of posting datetime, including the no-future-dip replay (§11.4); **absolute prohibition for batch/serial-tracked items — no override role exists**. Error always shows the as-of balance and first violating point. |
| V-INV-02 | **Valuation-method immutability**: `valuation_method` change rejected (409) once any ledger row exists for the item; the response cites the first ledger row. Method migration = documented close-out procedure, deliberately manual. |
| V-INV-03 | **UoM factor lock**: `uom_conversion.factor` immutable once any submitted document used it (`is_locked`); attempted edit lists the referencing vouchers. One wrong factor corrupts valuation invisibly — factors are also displayed on every document line. |
| V-INV-04 | **Count snapshot semantics**: `book_qty` frozen at sheet creation; any posting touching a counted item×warehouse after snapshot marks the line stale; posting a recon with stale lines is rejected until per-line refresh + re-confirm. |
| V-INV-05 | **Mandatory reason codes**: every count line with `diff_qty ≠ 0` requires a reason; ITC-flagged reasons render their GST consequence in the confirm dialog. Submit lists offending lines. |
| V-INV-06 | **Challan completeness before print**: consignor/consignee GSTIN (as applicable), HSN per line, qty, taxable value, FY-serial challan no. — print blocked with a field checklist until complete (Rule 55). |
| V-INV-07 | **E-way threshold warning**: doc value ≥ state-config threshold without e-way bill no. → submit-time warning + print watermark; thresholds only ever read from `eway_threshold` (never hard-coded). |
| V-INV-08 | **Purpose-warehouse integrity**: issue → source only; receipt → target only; transfer-family → both, distinct (DB CHECKs §9.4 mirror the API validation — defense in both layers). |
| V-INV-09 | **Batch expiry**: issuing from an expired batch blocked; override = Stores In-charge role + reason, logged; expired balances flagged on browse. |
| V-INV-10 | **Warehouse-type rules**: `customer`-type warehouses are non-valuated (CHECK); scrap-group items warn outside scrap warehouses; subcontractor warehouses accept only challan-linked entries. |
| V-INV-11 | **Cancel discipline**: cancel writes reversal rows at original posting_dt and reposts later rows (surfaced); cancel of a GRN-linked entry requires the GRN cancel to originate in Purchase (single-owner rule). |
| V-INV-12 | **QC gate**: receipt lines for `inspection_required` items must land in a `rejected`-type (quarantine) warehouse or carry a passed QI reference; direct-to-stores receipt of such items is rejected. |
| V-INV-13 | **Gate-pass integrity**: RGP requires `expected_return_dt` (CHECK); NRGP requires approver (CHECK); returns cannot exceed issued qty. |
| V-INV-14 | **Job-work integrity**: receive qty + scrap ≤ sent per line; `deemed_supply` flip is engine-only and irreversible in-module (Accounts credit-note path documented); challan print requires Rule 55 completeness (V-INV-06). |
| V-INV-15 | **Import discipline**: commit requires a clean or explicitly-accepted dry run of the same file hash; opening stock only into item×warehouse with no prior ledger rows; imported docs are normal cancellable documents. |
| V-INV-16 | **Replenishment conflict guard**: an item×warehouse governed by Planning's MRP cannot carry reorder rules and vice versa (mirrors Planning V-08); creation attempt → 409 with the conflicting policy reference. |

---

## 16. Testing

Engine core is pure-function (no DB) → fast property/golden tests; the I/O shell gets transactional integration tests; statutory outputs get fixture tests. CI gates on all of them.

### 16.1 Ledger properties (TC-LED)
- **TC-LED-01 (property)**: random sequences of receipts/issues/transfers/adjustments (Hypothesis-generated, 1k+ cases) keep **bin = Σ ledger** per item×warehouse (qty and value), and `qty_after/value_after` running columns consistent row-to-row.
- **TC-LED-02 (property)**: rebuild-from-ledger (§11.4) after any random sequence reproduces bins and live FIFO queues exactly.
- **TC-LED-03**: an issue exceeding the balance **at its posting time is rejected even if later receipts exist**; the future-dip case (backdated issue making a later point negative) also rejected, naming the violating datetime.
- **TC-LED-04**: valuation method immutable once a ledger row exists (409 path + DB-level assert).
- **TC-LED-05**: every document cancel produces **exact ledger reversals** — post → cancel leaves all bins identical to pre-post state; GL events mirror exactly.
- **TC-LED-06**: backdated entry triggers repost; audit surfaces "reposted N later entries"; sync ≤ 500 rows, async above (queue assertion); qty history unchanged, only valuation columns rewritten.

### 16.2 Valuation goldens (TC-VAL)
- **TC-VAL-01 (golden fixture)**: the hand-computed bronze-ingot FIFO table (§11.2 = §20.7) reproduced exactly — every queue state, the ₹611.33 blended issue rate, closing value ₹2,48,600.
- **TC-VAL-02**: moving-average golden (receipts re-average; issue at average; zero-balance reset).
- **TC-VAL-03 (property)**: FIFO consumption value ≡ sum over consumed layers for random queues; Σ layer qty ≡ balance always.
- **TC-VAL-04**: same-day same-rate layer merge keeps queues minimal without changing any consumption result.
- **TC-VAL-05**: landed-cost allocation is value-proportional and rounding-exact (Σ allocated = Σ additional, paise-safe).

### 16.3 Documents & counting (TC-DOC / TC-REC)
- **TC-DOC-01**: purpose-warehouse CHECKs (API + DB) reject all 6 invalid combinations.
- **TC-DOC-02**: transfer emits paired OUT/IN rows at identical rate; two-step transfer nets to zero in transit at completion.
- **TC-DOC-03**: Delivery Note posts at valuation (never price); COGS value = FIFO consumption.
- **TC-REC-01**: opening stock loaded from the pilot's Excel reconciles to their totals (Phase I2 acceptance fixture).
- **TC-REC-02**: **a count posting a shortage with reason=damage emits the ITC-reversal flag in its GL event** (17(5)(h)); gain rows carry no flag; count_variance shortage carries no flag.
- **TC-REC-03**: snapshot semantics — a posting between snapshot and submit marks the line stale and blocks post until refresh; accuracy % computed correctly on the fixture.

### 16.4 Batch & trace (TC-BAT)
- **TC-BAT-01**: tracked-item ledger row without batch_id unstorable; batch-wise balance = Σ batch rows.
- **TC-BAT-02**: given a supplier lot (heat SBC-H-2618), one query returns every document it entered — GRN → issues → (WO context) → DN — the recall demo; < 5 s on the 1M-row fixture.
- **TC-BAT-03**: expired-batch issue blocked; override logged; expiring-batch event fires at horizon.

### 16.5 Statutory (TC-STAT / TC-JW / TC-GP)
- **TC-STAT-01**: intra-state transfer under threshold prints challan only; all Rule 55 mandatory fields present (print blocked if not — V-INV-06).
- **TC-STAT-02**: cross-state transfer above ₹50,000 demands e-way fields; TN intra-state at ₹80,000 passes (limit ₹1 lakh) while MH intra-state at ₹1.2 lakh warns — straight from config rows, proving nothing is hard-coded.
- **TC-STAT-03**: GSTIN branch matrix — same GSTIN → challan; cross-GSTIN same state → CGST+SGST invoice stub; cross-state → IGST stub; Rule 28 valuation value applied.
- **TC-STAT-04**: scrap disposal doc prints 18% HSN lines (7404 copper/bronze, 7204 CI/steel); TDS note appears above ₹2.5 lakh for registered buyer; RCM note for unregistered.
- **TC-JW-01**: **a challan aged 13 months flips to deemed_supply** and surfaces red on the register with the GL memo (GST + 18% interest text); flip engine-only, irreversible in-module.
- **TC-JW-02**: ageing bar bands (green < 9 m / amber 9–12 m / red) on fixture challans; ITC-04 export matches challan-wise data for the period.
- **TC-GP-01**: RGP without expected return unstorable; overdue transition + alert at date; partial returns accumulate correctly.

### 16.6 Reports & bank statement (TC-BNK / TC-RPT)
- **TC-BNK-01**: **bank statement at cutoff T equals ledger value at T — including after a backdated entry posted later** (post entries → statement at T → backdated entry before T → repost → statement at T reflects corrected history; both statements internally consistent, difference = exactly the backdated row's value chain).
- **TC-RPT-01**: ageing buckets match FIFO layer dates on the golden queue; dead-stock list = ageing ∩ no-movement window.
- **TC-REP-01**: seeded reorder fixture produces draft MRs for exactly the items below level (no duplicates while cover exists; conflict-guard items skipped).

### 16.7 Non-engine
- API contract tests (OpenAPI schema-driven); RBAC matrix tests per §14.1 (every forbidden cell → 403); **append-only enforcement test: raw UPDATE/DELETE as app role fails at grant level, trigger blocks maintenance-mode identity changes** (TC-SEC-03).
- Load: NFR fixtures — 50-line submit p95 < 2 s; 20 posts/s no-deadlock soak (canonical lock order verified under contention); 20k-row import timings.
- Frontend: Playwright E2E of the storekeeper loop (receive → issue against MR with over-issue block shown → transfer with challan print → count with damage reason → bank statement export); count-tablet flow with offline retry; CSV wizard with error-report round-trip.

---

## 17. MVP Scope

### 17.1 Must-have — the minimum coherent loop

| # | Feature | Justification |
|---|---|---|
| M1 | **Append-only stock ledger + bin projection**; FIFO layers persisted as an ordered [qty, rate, date] queue (JSONB) + moving average; valuation method fixed at item creation | The cross-vendor invariant (Appendix A §1); ERPNext's FIFO-queue design is directly copyable into a PostgreSQL JSONB column; BC's immutability rule |
| M2 | **Explicit negative-stock policy: block by default** (validate balance as of posting datetime at submit), absolute prohibition for batch/serial items | Verified gap: a FIFO queue cannot consume rates from a negative balance — allowing negatives silently corrupts valuation |
| M3 | **Item master** — is_stock_item, valuation_method, stock UoM + **uom_conversions** (buy kg, stock pcs/m), HSN, tracking_mode (none\|serial\|batch), inspection_required, per-warehouse reorder level/qty | Dual UoM is a verified gap — single-UoM items break the very first GRN |
| M4 | **Warehouse master** with types: normal, **transit**, **rejected/quarantine**, **scrap**, **subcontractor (virtual)**, **customer-material (non-valuated)** — each mapped to a stock account | Types cover QC segregation, two-step transfers, job work and inward job work without new mechanisms |
| M5 | **Five documents, ERPNext-shaped**: Material Request (purpose enum, derived statuses) · GRN (owned by Purchase, posts here) · **Stock Entry** (purpose: issue \| receipt \| transfer) · Delivery Note (posts at valuation, not price) · **Stock Reconciliation** (purposes: opening_stock \| count; **reason codes** per 17(5)(h); CSV upload) | This set is the core movement/adjustment skeleton of a mature stores module (ERPNext also ships Pick List/Packing Slip/etc. — deliberately omitted) |
| M6 | **Batch tracking on raw material** — batch master with expiry, batch_id on every ledger row, batch pick on issue | Table stakes at the SMB floor; traceability-as-recall-query comes free; genealogy feeds Production |
| M7 | **Reorder check → draft Material Request** (nightly + on-demand) | The canonical Inventory→Purchase bridge (ERPNext precedent for auto-drafting) |
| M8 | **CSV import: item master + opening stock** via Stock Reconciliation | 38%-of-failures de-risking; the demo starts from the client's real data |
| M9 | **Cycle-count workflow** (Stock Reconciliation used routinely: count sheet snapshot → enter → post differences with reasons) | The 95% accuracy prerequisite for Production |
| M10 | **Scrap flow**: scrap receipt entries into scrap warehouse + disposal document with HSN | Rule 56(2) statutory + economically material for a metal-parts maker |
| M11 | **Challan-shaped issue/transfer print** (+ e-way Part A fields on the document, state-configurable threshold check) and **job-work outward register with 1-yr/3-yr ageing** | Rules 55/45/138, Sec 143 |
| M12 | **Gate pass RGP/NRGP** with pending-return log and overdue alerts | Standard Indian stores practice; instantly-noticed absence |
| M13 | **Core reports as ledger queries**: Stock Ledger · Stock Balance · Projected Qty (actual + ordered − requested, simplified) · **Stock Ageing** (free once FIFO layers persist) · Batch-wise balance · **Bank stock statement (RM/WIP/FG at cut-off)** | ERPNext's own report list + CARO 3(ii)(b) |
| M14 | **GL posting emission** on every submit (voucher, account, Dr, Cr; reversal on cancel): GRN → Dr Stock / Cr GRNI · Issue → Dr Adjustment / Cr Stock · Transfer → Dr target / Cr source · Delivery → Dr COGS / Cr Stock | Keeps the Accounts boundary honest even while Accounts is a stub |

### 17.2 Should-have

| Feature | Note |
|---|---|
| Two-step transfer via transit warehouse | In-transit visibility; "% transferred" for partials — cheap on top of the purpose enum (FR-INV-024) |
| Serial tracking | Schema slot ships via tracking_mode; activate on demand (FR-INV-033) |
| Quality Inspection document | Behind the existing gate flag — flag + FK ship in must-have; the form can start minimal (V-INV-12) |
| Landed-cost distribution | Additional costs on incoming entries, allocated by line value — needed if imports materialize; serves Sec 145A-style reporting (FR-INV-025) |
| KPI tiles & trends | Turnover, DOI by RM/WIP/FG, record accuracy from last count, dead-stock value, stockout incidents (FR-INV-071) — tiles in MVP, trends Phase 2 |
| ABC count calendar | FR-INV-044 |

### 17.3 Explicitly deferred (with vendor precedent — detail in §18)

| Deferred | Why |
|---|---|
| Hard reservation/commitment | The one mid-tier feature that materially complicates the ledger (available = on-hand − reserved); MVP shows projected availability instead |
| The WMS layer entirely (putaway, bins-as-ledger, wave picking, carriers) | Every vendor documents it as severable; Odoo sells it Enterprise-only; **bin-level costing doesn't exist even in NetSuite** |
| Barcode scanning, IoT, demand forecasting, dynamic reorder computation | Phase 2/3 (§18); static min/max is the SMB norm |
| No-freeze counting | NetSuite Smart Count is premium tier; freeze-at-creation is the honest table-stakes equivalent |
| Removal-strategy/FEFO picking engines | Odoo correctly separates pick order from costing method; MVP ships valuation with **no pick-order engine at all** (FIFO *suggestion* in the batch picker is UI courtesy, not an engine) |
| E-way bill / e-invoice API integration | Carry the fields; portal-pastable export ships; NIC API Phase 2 |
| LIFO, Standard, Specific costing | LIFO barred by ICDS II; others deferred |

### 17.4 Build phases

**Phase I1 — Ledger core (the foundation everything sits on)**
- I1.1 item attribute migration / uom_conversion / warehouse / batch tables + CRUD.
- I1.2 `stock_ledger` + `bin` + FIFO-queue and moving-average valuation engines + append-only enforcement (trigger, grants).
- I1.3 Negative-stock validation (as-of posting datetime, future-dip); batch/serial absolute.
- I1.4 **Acceptance:** property tests — random sequences of receipts/issues keep bin = Σ ledger; FIFO consumption reproduces hand-computed values (TC-VAL-01); an issue exceeding balance at its posting time is rejected even if later receipts exist; valuation method immutable once a ledger row exists.

**Phase I2 — Documents**
- I2.1 Stock Entry (3 purposes) + submit → ledger + GL events; cancel → reversals.
- I2.2 Stock Reconciliation (opening + count) with snapshot semantics + reasons + accuracy KPI.
- I2.3 Delivery Note at valuation.
- I2.4 CSV importers (items, opening stock) with dry-run validation report + mapping assistant.
- I2.5 **Acceptance:** opening stock loaded from the client's Excel reconciles to their totals; a count posting a shortage with reason=damage emits the ITC flag in its GL event; every document cancel produces exact ledger reversals.

**Phase I3 — Batch + traceability + scrap**
- I3.1 Batch creation at GRN (Purchase calls in), batch-wise issue, expiry handling.
- I3.2 Trace query: batch → every voucher touching it (forward + backward).
- I3.3 Scrap warehouse + scrap receipt path + disposal document with HSN.
- I3.4 **Acceptance:** given a supplier lot, one query returns every WO/DN it entered (the recall demo); scrap disposal doc prints with correct 18% HSN lines.

**Phase I4 — India statutory**
- I4.1 Challan print on issues/transfers/DNs; e-way Part A fields; state-threshold config table + submit warning.
- I4.2 GSTIN/state branch on transfers (challan vs tax invoice, IGST vs CGST+SGST).
- I4.3 Job-work outward register + ageing + deemed-supply flip + ITC-04 export; gate-pass RGP/NRGP log.
- I4.4 **Acceptance:** intra-state transfer under threshold prints challan only; cross-state transfer above threshold demands e-way fields; a challan aged past 12 months flips to deemed_supply and surfaces on the register in red.

**Phase I5 — Replenishment, reports, KPIs**
- I5.1 Reorder-breach job → draft Material Requests (Purchase workbench pickup).
- I5.2 Reports (M13 list) + CSV export; bank stock statement.
- I5.3 KPI tiles (turnover, DOI by group, accuracy from last count, dead stock) + Production-gate banner.
- I5.4 **Acceptance:** seeded fixture produces reorder drafts for exactly the items below level; ageing buckets match FIFO layer dates; bank statement at cut-off T equals ledger value at T (backdated-entry test included).

### 17.5 Demo script beats (investor + pilot)

1. **Load the client's own item list + opening stock from Excel** → the Stock Browser is instantly *their* store (assistant maps the columns live).
2. **Issue against an MR; try to over-issue** → blocked with the as-of balance shown — "the system refuses to lie about stock."
3. **Count sheet: enter one shortage as "damage"** → the ITC-reversal flag appears — "your CA sees the GST consequence the moment it happens, not at year-end."
4. **Batch trace: pick a casting heat number** → every document it flowed through — the 30-second recall answer.
5. **Job-work register: one challan amber at 10 months** — "this is the ₹-with-interest surprise the register prevents."
6. **Bank stock statement export** — "your quarterly filing, one click." Close on the dashboard's Production-gate banner: accuracy 92.9% → "when this crosses 95, we switch Production on."

### 17.6 Anti-goals (explicit)

- **No editable stock. Ever.** No admin "fix the number" button — corrections are reconciliation documents with reasons. This is the module's core credibility claim, and it is enforced at three layers (code, trigger, grants) so it cannot erode under pilot pressure.
- **No WMS scope creep. Bins stay informational.** No putaway rules, no wave/batch picking, no bins-as-ledger, no carrier integration. If the client asks for putaway/picking, that is the paid Phase-2 conversation, backed by the vendor-precedent table (§19.2 / Appendix A §1.3).
- **No pick-order engine** conflated with costing (the classic legacy-ERP mistake): FIFO valuation ≠ FIFO picking; MVP ships valuation only.
- **No fabricated savings claims**: carrying-cost is quoted as the honest range (20–30% rule-of-thumb vs APQC ~10% median), and per Panorama 2024 inventory benefits were the least fully-realized category — the demo never promises a fixed reduction percentage.

### 17.7 Risks

| Risk | Mitigation |
|---|---|
| **Backdated entries** force FIFO reposts | Allowed but bounded (NFR-INV-05) and *surfaced* (audit log + "reposted N later entries" notice); backdating window configurable; bank statement always as-of-consistent (TC-BNK-01) |
| **UoM conversion** — one wrong factor corrupts valuation invisibly | Factors shown on every line and locked once used (V-INV-03); import dry-run cross-checks factor sanity (qty × factor magnitude heuristics) |
| **Scope creep toward WMS** | Anti-goal above; vendor-precedent table ready for the conversation |
| Hot-item lock contention at posting spikes | Canonical lock ordering (no deadlocks) + queueing; soak-tested (TC load); per-warehouse posting parallelism unaffected |
| Pilot skips counts → gate never reached → "turn Production on anyway" pressure | Count calendar + workbench nagging + the gate banner make the state visible to the plant head; the gate is policy, but the KPI is unarguable |
| Storekeeper adoption (tablet vs notebook) | Tablet count mode designed for gloves/big targets; Tamil labels next; challan print beats the manual book on day one (the hook) |

---

## 18. Future Roadmap

| Phase | Timeline | Deliverables (vendor precedent) |
|---|---|---|
| **Phase 2 — Operational depth** | +2 quarters | **Barcode/QR scanning** on receipts, issues and counts (Zoho/ERPNext ship this at SMB tier); serial tracking GA; Quality Inspection full form + sampling rules; landed cost GA with Sec 145A duties-inclusive valuation report; **e-way bill API integration (NIC)** + e-invoice readiness; ABC count calendar GA + count-coverage SLAs; two-step transfer GA; Hindi/Tamil UI completion. |
| **Phase 3 — Availability & intelligence** | +4 quarters | **Hard reservations/commitments** (available = on-hand − reserved; the BC/NetSuite model) with WO/SO allocation; **no-freeze cycle counting** (NetSuite Smart Count precedent); **forecast-driven replenishment** — reorder points recomputed from demand history (NetSuite precedent; consumes Planning's Module-3 forecasting stack rather than duplicating it); shrinkage analytics GA; multi-plant transfer orchestration with in-transit valuation. |
| **Phase 4 — WMS layer (paid tier)** | +6–8 quarters | The severable WMS: **putaway rules, directed picking (wave/batch), FEFO/removal-strategy engines** (Odoo Enterprise precedent — and Odoo's correct separation of pick order from costing is the design rule), packing/carrier integration, **IoT/RFID** (weighbridge, smart-shelf) feeds posting *through the same one write path*; mobile WMS app. Bin-level data stays qty-only even here — **bin-level costing doesn't exist even in NetSuite**. |

Every roadmap item lands on the same append-only ledger — nothing in Phases 2–4 requires a schema break, because reservations, scans and WMS tasks are all *new documents and projections*, never edits.

---

## 19. Technology Stack & Rationale

Aligned to the IND-CORE shared platform baseline (same table as `PLANNING.md` §19), with **Module-5-specific rationale** per row.

> **Superseded framing note:** the original research plan for this module targeted "FastAPI + SQLite + Next.js static export, single node". That framing is superseded by the shared platform baseline below — every design decision survives, but lands on **PostgreSQL 16** (e.g., ERPNext's FIFO-queue pattern becomes a JSONB column mutated under row locks, instead of a single-writer file database; concurrency, grants-based append-only enforcement and BRIN/partial indexes are the upgrades SQLite could not express).

### 19.1 Platform stack (with Module-5-specific rationale)

| Layer | Choice | Module-5 rationale & trade-offs |
|---|---|---|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query/Table | Shared across all IND-CORE modules — one design system, one skill set. **TanStack Table + Virtual is exactly right for the 10k-row Stock Browser and 1M-row ledger drill (windowed cursor fetch)**; shadcn gives the information-dense grid/form styling stores screens need. Count-tablet mode is the same SPA with a touch layout — no separate app. |
| **Charts** | Recharts (trends/sparklines) + **ECharts** (heat matrices) | Recharts for KPI cards, ageing bars, value trends; ECharts canvas for warehouse-movement heat and any large matrix — same two-lib split as Planning, both wrapped in `@ind-core/charts`. |
| **Backend** | Python 3.12 + FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2 | Matches the platform. The valuation engine is pure Python (Decimal-safe) — trivially property-testable with Hypothesis, which is how TC-LED-01/02 stay cheap. Pydantic v2 models are the single source for the OpenAPI → typed-client pipeline the frontend consumes. |
| **Database** | **PostgreSQL 16** + pgvector | The module's heart. **Row locks (`SELECT … FOR UPDATE`) on `bin` serialize concurrent FIFO postings without deadlock (canonical lock order)**; **JSONB stores `fifo_queue_json`** with index-free small-payload reads; **generated columns** compute `stock_qty`, `diff_qty`, the 17(5)(h) `itc_reversal_flag` and job-work `deadline_dt` in the schema itself; **partial indexes** serve open-challan/undelivered scans; **BRIN** on `posting_dt` keeps time-range queries cheap at millions of rows; **trigger + REVOKE grants make append-only a database guarantee, not a code convention**. pgvector powers the assistant's fuzzy item lookup. |
| **Jobs / async** | Redis + **Celery** (queues: `stock`, `stock-batch`, `default`) | **Celery beat runs the nightly reorder scan (02:00 IST), the ageing/dead-stock digest, the expiry sweep, and the bin-invariant assert**; large backdated reposts run async with progress (NFR-INV-05); per-queue worker pools isolate batch work from interactive posting. |
| **Auth** | JWT access (15 min)/refresh (7 d) + RBAC claims, FastAPI dependencies | Stateless, on-prem friendly, shared platform-wide. Device-bound tokens for count tablets; storekeeper value ceilings as claims. |
| **APIs** | REST (OpenAPI auto-gen) + internal event bus on **Redis Streams** (transactional outbox) | REST for documents/reports; **the outbox guarantees `stock.entry.posted` is never lost** — Planning's net-change and Purchase's GRN state depend on it. Consumer groups + replay right-size for single-VM/on-prem; contract is transport-agnostic if we outgrow it. |
| **Real-time** | **SSE** (workbench refresh, repost progress, import progress) | One-way invalidation and progress is all stores needs — SSE is proxy-friendly and auto-reconnecting; no WebSocket requirement in this module. |
| **AI** | Anthropic Claude API (assistant, narratives, variance explanations — tool-use over read-only APIs) + deterministic analytics (outlier stats, ageing, SS formula) in Python | The platform doctrine applied: **numbers from deterministic models, language from the LLM — the LLM never invents quantities** (§13). pgvector embeddings in-DB (DPDP: nothing leaves). On-prem tenants: LLM off, deterministic outputs remain. |
| **Deployment** | Docker Compose (api, workers, postgres, redis, caddy, frontend) on a single cloud VM for demo; same compose on-prem; K8s only at multi-tenant SaaS scale | Matches the "single VM demo, on-prem capable, DPDP-friendly" platform posture. Nightly `pg_dump` + WAL archiving; Prometheus/Grafana sidecar watching posting latency and repost queue depth. |

### 19.2 Vendor comparison (what the market ships, distilled — full narrative in Appendix A)

| Vendor | Stores/inventory architecture | What Module 5 copies / rejects |
|---|---|---|
| **SAP MM-IM** | Material document per movement; numbered movement types encode reasons (101 GR-against-PO, 201 issue-to-cost-center, 261 issue-to-production, 3xx transfers, 7xx count differences); stock statuses Unrestricted/Quality/Blocked | Copy: document-per-movement + reason encoding (as the purpose enum + reason codes); status segregation via warehouses. Reject: movement-type numerology (plain-language purposes instead) |
| **ERPNext** | **Stock Ledger Entry (append-only) + Bin projection**; Stock Entry with 8 purposes; Stock Reconciliation doubles as opening loader; FIFO queue persisted per SLE; repost on backdating | The closest architectural template — copied nearly wholesale (SLE+Bin, purposes, recon-as-opening, FIFO queue, repost), hardened with Postgres enforcement |
| **Dynamics 365 BC** | Item ledger entries + value entries; **costing method immutable once entries exist**; item tracking/tracing | Copy: the immutability rule (V-INV-02); ledger/value split noted for the future Accounts module |
| **NetSuite** | Perpetual ledger; bin management is qty-only (**no bin-level costing**); Smart Count (no-freeze) premium; forecast-driven reorder recalculation | Copy: bins-informational stance. Defer with precedent: Smart Count, dynamic reorder (§18) |
| **Odoo** | Community edition = the empirical SMB floor (reordering rules, lot/serial, adjustments); WMS Enterprise-only; **removal strategies (FEFO) separate pick order from costing** | Copy: the Community-tier feature floor as MVP scope; the pick-vs-cost separation as an anti-goal guard. Reject: nothing — Odoo's split validates ours |
| **Zoho Inventory** | SMB price floor; serial **or** batch per item (never both); reorder alert + assist | Copy: the tracking_mode simplification verbatim |
| **Katana** | Lot traceability sold as a paid add-on (~$249/mo on the $299 Core plan) | Pricing signal: batch-as-core is a differentiator at SME price — we ship it in MVP |
| **MRPeasy** | Basic lot traceability included at $49/user/mo, targeting exactly this discrete-SME segment | Confirms batch-in-core is the right call for the segment |
| **Siemens Opcenter · Epicor · Plex · Infor** | MES/enterprise execution tier: inventory largely lives in the host ERP (Opcenter is a scheduling/MES layer; Plex is cloud MES with plant inventory; Epicor Kinetic/Infor CSI are full mid-market ERPs with WMS extensions) | **Limited direct relevance to SME stores** — included for comparison completeness, honestly: their lesson is the *severability of the WMS/MES layer* from the core ledger, which is exactly the §18 phasing. No design element is copied from this tier |

---

## 20. Demo Data (Seed — investor-demo grade)

Shared IND-CORE pilot universe (consistent across all module plans): **(1) Sharma Precision Components Pvt Ltd**, Faridabad, HR; **(2) Kaveri Pumps & Motors Ltd**, Coimbatore, TN; **(3) Trident Sheet Metal Works Pvt Ltd**, Pune, MH; **(4) Zenith Fasteners Pvt Ltd**, Rajkot, GJ; **(5) Arvind Electro Controls Pvt Ltd**, Noida, UP.

**Primary walkthrough: Kaveri Pumps & Motors Ltd, Coimbatore plant (GSTIN 33AAACK2140F1Z6, plant KPM-CBE-1).** Demo "today" = **Mon 13-Jul-2026** (start of week W29 — the same clock as `PLANNING.md` §20). Item codes, on-hand quantities and open POs/WOs are the same universe as Planning's §20.3–20.8 — the two demos drill the same numbers from two directions.

### 20.1 Companies, plants & users

| company_id | Company | GSTIN (demo) | Plant | City |
|---|---|---|---|---|
| 1 | Kaveri Pumps & Motors Ltd | 33AAACK2140F1Z6 | KPM-CBE-1 | Coimbatore, TN |
| 2 | Trident Sheet Metal Works Pvt Ltd | 27AABCT7712E1ZD | TSM-PUN-1 | Pune (Chakan), MH |
| 3 | Sharma Precision Components Pvt Ltd | 06AADCS3491J1ZR | SPC-FBD-1 | Faridabad, HR |
| 4 | Zenith Fasteners Pvt Ltd | 24AABCZ5618Q1ZL | ZFL-RJK-1 | Rajkot, GJ |
| 5 | Arvind Electro Controls Pvt Ltd | 09AAECA8804C1Z2 | AEC-NOI-1 | Noida, UP |

Personas (Kaveri, reused from `PLANNING.md` §20.1 + this module's stores staff):

| User | Role | Login |
|---|---|---|
| **S. Poongodi** | **Stores In-charge (primary demo user)** | stores@kaveripumps.in |
| K. Selvam | Storekeeper / material handler | stores2@kaveripumps.in |
| Anand Krishnan | Procurement Officer | purchase@kaveripumps.in |
| P. Sathish | Production Supervisor (assembly) | prod.assy@kaveripumps.in |
| Meenakshi Sundaram | PPC Planner | planner@kaveripumps.in |
| R. Karthikeyan | Plant Manager (watches the gate banner) | plant@kaveripumps.in |
| Murugan V. | CNC Operator LTH-01 (context) | op.lth01@kaveripumps.in |
| CA Lakshmi Narayanan | Finance (read + bank statement) | finance@kaveripumps.in |
| M/s Subramaniam & Co | Auditor (read-only) | audit.ext@kaveripumps.in |

**Machines (context — Planning §20.2 owns them):** WC-VMC01 (Ace Micromatic VMC-850), WC-LTH01/02 (LMW CNC lathes), WC-ASSY (assembly line), WC-TEST (hydro test rig). For stores, machine WIP maps to warehouse **WH-WIP**; issues cite the consuming WO. **Production orders (context — same universe):** WO-2026-0139 (18 IMPELLER-KV50, released), WO-2026-0141 (40 GLAND-CI, in-process), WO-2026-0142 (12 IMPELLER-KV80, late), WO-2026-0136 (24 PUMP-KV50, awaiting kit — **short 6 MOTOR-5HP**, the stockout-incident fixture).

### 20.2 Warehouse set — Kaveri Coimbatore

| Code | Name | Type | Valuated | Stock account | GSTIN / state |
|---|---|---|---|---|---|
| WH-RM | Main stores (raw material + bought-out) | normal | ✔ | Stock In Hand — RM | 33AAACK2140F1Z6 / 33 |
| WH-WIP | Assembly & casting-cell WIP | normal (wip role) | ✔ | Stock In Hand — WIP | same |
| WH-FG | Finished goods store | normal | ✔ | Stock In Hand — FG | same |
| WH-QC-QTN | Quarantine / under inspection | rejected | ✔ | Stock In Hand — QC | same |
| WH-SCRAP | Scrap yard | scrap | ✔ | Stock In Hand — Scrap | same |
| WH-TRANSIT | In-transit (two-step transfers) | transit | ✔ | Stock In Transit | same |
| WH-SUBCON-SME | **Sree Murugan Electroplating Works (job worker, virtual)** | subcontractor | ✔ (principal's books) | Stock with Job Workers | party GSTIN 33BBFPS1204E1Z1 |
| WH-CUST | Customer-supplied material (inward job work) | customer | ✘ non-valuated | — (memo) | — |

### 20.3 Suppliers & job workers (canonical seed — shared with Modules 4/6)

| Supplier | City | Supplies | Note |
|---|---|---|---|
| Venkatramana Metals & Alloys Pvt Ltd | Coimbatore | Bronze/gunmetal ingot LTB2 + rod | heat numbers on every lot |
| Sri Balaji Castings | Coimbatore | CI volute/impeller castings | MSME **Small** — 45-day payment clock (Purchase M4) |
| Lakshmi Steels & Tubes | Chennai | SS410/EN8 shaft rod | mill TC per heat |
| Precision Bearings India (SKF dealer) | Chennai | Bearings (6205-ZZ etc.) | |
| Sree Murugan Electroplating Works | Coimbatore | Job worker: hard-chrome/nickel plating | MSME **Micro**; modeled as WH-SUBCON-SME |
| Coimbatore Packaging Co | Coimbatore | Cartons/crates (PACK-CRT-50) | reorder-rule item |

### 20.4 Item master extract (inventory attributes; on-hand as of 13-Jul-2026)

Consistent with Planning §20.3 where items overlap (same on-hand, same safety stocks).

| Item code | Name | Group | Stock UoM | Val. method | Tracking | HSN | On-hand (main location) | Reorder (wh-level) |
|---|---|---|---|---|---|---|---|---|
| PUMP-KV50 | KV-50 centrifugal pump 5 HP | fg | NOS | fifo | none | 8413 | 8 @ WH-FG | MRP-planned (no reorder rule — V-INV-16) |
| PUMP-KV80 | KV-80 centrifugal pump 7.5 HP | fg | NOS | fifo | none | 8413 | 3 @ WH-FG | MRP-planned |
| IMPELLER-KV50 | Bronze impeller, machined | wip | NOS | fifo | batch | 8413 | 30 @ WH-WIP | MRP-planned (SS 10) |
| CASING-KV50 | CI volute casing, machined | wip | NOS | fifo | batch | 8413 | 22 @ WH-WIP | MRP-planned (SS 8) |
| MOTOR-5HP | 5 HP TEFC motor (CG Power) | rm | NOS | moving_avg | none | 8501 | 14 @ WH-RM | MRP-planned (SS 6); **PO-2213 ×10 due W31** |
| CI-CASTING-IMP | Impeller casting blank (Sri Balaji) | rm | NOS | fifo | **batch (heat)** | 7325 | 40 @ WH-RM + 50 @ WH-QC-QTN | MRP-planned (SS 15) |
| CI-CASTING-CSG | Casing casting blank | rm | NOS | fifo | batch (heat) | 7325 | 35 @ WH-RM | MRP-planned (SS 12); PO-2201 ×30 open |
| BRZ-INGOT-LTB2 | Bronze ingot LTB2 (Venkatramana) | rm | KG | **fifo** | batch (heat) | 7403 | 400 @ WH-RM + 450 @ WH-WIP | level 250 kg / qty 400 kg |
| SS-SHAFT-ROD | SS410 shaft rod | rm | M | fifo | batch (heat) | 7222 | 90 m @ WH-RM | MRP-planned (SS 20); PO-2188 ×75 m open |
| SHF-SS410-22 | Pump shaft SS410 Ø22 (machined) | wip | NOS | fifo | batch | 8413 | 20 @ WH-SUBCON-SME (at plater) | — |
| GLAND-CI | Gland follower, CI | wip | NOS | fifo | batch | 8413 | 50 @ WH-SUBCON-SME | — |
| MECH-SEAL-25 | Mechanical seal 25 mm | rm | NOS | fifo | none | 8484 | 120 @ WH-RM | MRP-planned (SS 48, EOQ 292 — Planning §20.9) |
| BRG-6205-ZZ | Ball bearing 6205-ZZ (SKF dealer) | rm | NOS | fifo | none | 8482 | 42 @ WH-RM | level 40 / qty 100 |
| GSK-NBR-3 | Gasket NBR 3 mm | consumable | NOS | moving_avg | batch (**expiry**) | 4016 | 222 @ WH-RM | level 150 / qty 500 |
| GLAND-PACK-20 | Gland packing rope 20 mm | consumable | M | moving_avg | none | 8484 | 12.5 m @ WH-RM | level 20 / qty 50 |
| PACK-CRT-50 | Export carton KV-50 | consumable | NOS | moving_avg | none | 4819 | **60 @ WH-RM** | **level 100 / qty 200 → BREACH** |
| SCRAP-BRZ | Bronze turnings/borings | scrap | KG | moving_avg | none | **7404** | 38 kg @ WH-SCRAP | — |
| SCRAP-CI | CI borings/rejects | scrap | KG | moving_avg | none | **7204** | 0 @ WH-SCRAP | — |

UoM conversions seeded: BRZ-INGOT-LTB2 buy in KG (factor 1, locked); SS-SHAFT-ROD **bought in KG, stocked in M** (factor 0.51 m/kg for Ø22 — shown and locked); GLAND-PACK-20 bought per 5 m coil (factor 5).

### 20.5 Batch masters (supplier lot refs = heat numbers)

| Batch | Item | Supplier | supplier_lot_ref (heat) | Mfg | Expiry | Qty on hand |
|---|---|---|---|---|---|---|
| B-BRZ-OPN | BRZ-INGOT-LTB2 | (pre-ERP opening) | VMA-L-1142 | 02-Jun-26 | — | 0 (consumed 06-Jul) |
| B-BRZ-2607A | BRZ-INGOT-LTB2 | Venkatramana Metals | **VMA-L-1163** | 28-Jun-26 | — | 200 kg @ WH-RM |
| B-BRZ-2607B | BRZ-INGOT-LTB2 | Venkatramana Metals | **VMA-L-1177** | 06-Jul-26 | — | 200 kg @ WH-RM |
| B-CI-IMP-2606A | CI-CASTING-IMP | Sri Balaji Castings | **SBC-H-2618** | 18-Jun-26 | — | 40 @ WH-RM |
| B-CI-IMP-2607A | CI-CASTING-IMP | Sri Balaji Castings | **SBC-H-2655** | 06-Jul-26 | — | 50 @ WH-QC-QTN (QC hold) |
| B-CI-CSG-2605B | CI-CASTING-CSG | Sri Balaji Castings | SBC-H-2571 | 22-May-26 | — | 35 @ WH-RM |
| B-SS-ROD-2607 | SS-SHAFT-ROD | Lakshmi Steels & Tubes | LST-410-0781 | 30-Jun-26 | — | 90 m @ WH-RM |
| B-GSK-2508 | GSK-NBR-3 | — | LOT-NBR-0925 | 01-Sep-25 | **31-Aug-26** ⚠ | 140 @ WH-RM |
| B-GSK-2603 | GSK-NBR-3 | — | LOT-NBR-0326 | 05-Mar-26 | 28-Feb-27 | 82 @ WH-RM |

### 20.6 Opening-stock CSV extract (loaded 01-Jul-2026 via OPN-2026-0001)

```csv
item_code,warehouse,qty,valuation_rate,batch_no,supplier_lot_ref,fifo_layers
BRZ-INGOT-LTB2,WH-RM,250,610.00,B-BRZ-OPN,VMA-L-1142,"[[250,610.00,'2026-06-02']]"
CI-CASTING-IMP,WH-RM,40,780.00,B-CI-IMP-2606A,SBC-H-2618,
CI-CASTING-CSG,WH-RM,35,1450.00,B-CI-CSG-2605B,SBC-H-2571,
MECH-SEAL-25,WH-RM,135,310.00,,,
BRG-6205-ZZ,WH-RM,46,95.00,,,
MOTOR-5HP,WH-RM,14,7800.00,,,
GSK-NBR-3,WH-RM,220,12.00,B-GSK-2508,LOT-NBR-0925,
PACK-CRT-50,WH-RM,180,85.00,,,
PUMP-KV50,WH-FG,8,18400.00,,,
PUMP-KV80,WH-FG,3,24900.00,,,
```
(Dry-run validated, committed as Stock Recon `OPN-2026-0001`; totals reconciled to Poongodi's Excel: ₹1,02,56,414. The `fifo_layers` column allows multi-layer opening for FIFO items.)

### 20.7 Stock-ledger extract (the FIFO demo thread + surrounding movements)

The bronze rows are the **worked FIFO example** — identical to §11.2 and to golden test **TC-VAL-01**.

| # | Posting dt | Voucher | Item | Wh | Δ Qty | Rate ₹ | Δ Value ₹ | Queue after (WH-RM) / note |
|---|---|---|---|---|---|---|---|---|
| 1 | 01-Jul 09:00 | OPN-2026-0001 | BRZ-INGOT-LTB2 | WH-RM | +250 | 610.00 | +152,500.00 | [250@610] · batch B-BRZ-OPN |
| 2 | 03-Jul 11:40 | STE-2026-0801 ← **GRN-2026-0455** (PO-2224, Venkatramana) | BRZ-INGOT-LTB2 | WH-RM | +400 | 618.00 | +247,200.00 | [250@610, 400@618] · B-BRZ-2607A |
| 3 | 06-Jul 10:05 | STE-2026-0812 (transfer, MR-2026-0119 → casting cell, WO-2026-0139 context) | BRZ-INGOT-LTB2 | WH-RM | −300 | 611.33 | −183,400.00 | walk: 250@610 + 50@618 → [350@618] |
| 4 | 06-Jul 10:05 | STE-2026-0812 (transfer-in leg) | BRZ-INGOT-LTB2 | WH-WIP | +300 | 611.33 | +183,400.00 | WIP queue [300@611.33] |
| 5 | 09-Jul 11:20 | STE-2026-0871 ← **GRN-2026-0470** (PO-2231) | BRZ-INGOT-LTB2 | WH-RM | +200 | 625.00 | +125,000.00 | [350@618, 200@625] · B-BRZ-2607B |
| 6 | 09-Jul 11:20 | STE-2026-0871 (line 2 — inspection-required) | CI-CASTING-IMP | **WH-QC-QTN** | +50 | 780.00 | +39,000.00 | B-CI-IMP-2607A, heat SBC-H-2655 · QC hold |
| 7 | 08-Jul 17:30 | **CNT-2026-0009** (count) | BRG-6205-ZZ | WH-RM | −4 | 95.00 | −380.00 | reason **damage** → **ITC-reversal flag** ✔ |
| 8 | 08-Jul 17:30 | CNT-2026-0009 | GLAND-PACK-20 | WH-RM | −1.5 | 180.00 | −270.00 | reason count_variance |
| 9 | 08-Jul 17:30 | CNT-2026-0009 | GSK-NBR-3 | WH-RM | +2 | 12.00 | +24.00 | reason count_variance (gain) |
| 10 | 10-Jul 15:10 | **DN-2026-0227** (SO-1053 spares, early ship) | MECH-SEAL-25 | WH-RM | −15 | 310.00 | −4,650.00 | at valuation → Dr COGS ₹4,650 |
| 11 | 11-Jul 09:00 | STE-2026-0839 (transfer → casting cell) | BRZ-INGOT-LTB2 | WH-RM | −150 | 618.00 | −92,700.00 | [200@618, 200@625] |
| 12 | 11-Jul 09:00 | STE-2026-0839 (transfer-in leg) | BRZ-INGOT-LTB2 | WH-WIP | +150 | 618.00 | +92,700.00 | WIP balance 450 kg |
| 13 | 11-Jul 16:45 | STE-2026-0842 (scrap receipt from casting cell) | SCRAP-BRZ | WH-SCRAP | +38 | 380.00 | +14,440.00 | Cr Scrap Recovery |
| 14 | 22-Jun 10:30 | STE-2026-0768 ← **JWC-2026-0031** (send to plater) | SHF-SS410-22 | WH-RM → WH-SUBCON-SME | −60/+60 | 396.00 | ∓23,760.00 | job-work send under challan |

Closing bronze check (13-Jul): WH-RM 400 kg, value 200×618 + 200×625 = **₹2,48,600**, rate ₹621.50 — exactly the §11.2 golden table.

### 20.8 Bin snapshot (13-Jul-2026, selected rows)

| Item | Warehouse | Actual qty | Val. rate ₹ | Stock value ₹ | Ordered | Requested | Projected |
|---|---|---|---|---|---|---|---|
| BRZ-INGOT-LTB2 | WH-RM | 400 kg | 621.50 | 2,48,600 | 0 | 120 kg (MR-2026-0135) | 280 kg |
| BRZ-INGOT-LTB2 | WH-WIP | 450 kg | 613.56 | 2,76,100 | — | — | 450 kg |
| CI-CASTING-IMP | WH-RM | 40 | 780.00 | 31,200 | 0 | 18 | 22 |
| CI-CASTING-IMP | WH-QC-QTN | 50 | 780.00 | 39,000 | — | — | (QC hold, not available) |
| CI-CASTING-CSG | WH-RM | 35 | 1,450.00 | 50,750 | 30 (PO-2201) | 25 | 40 |
| MOTOR-5HP | WH-RM | 14 | 7,800.00 | 1,09,200 | 10 (PO-2213, W31) | 24 (WO-2026-0136 kit) | 0 → **shortage 6 pcs** |
| MECH-SEAL-25 | WH-RM | 120 | 310.00 | 37,200 | 0 | 24 | 96 |
| SS-SHAFT-ROD | WH-RM | 90 m | 240.00 | 21,600 | 75 m (PO-2188) | 30 m | 135 m |
| SHF-SS410-22 | WH-SUBCON-SME | 20 | 396.00 | 7,920 | — | — | at job worker |
| GLAND-CI | WH-SUBCON-SME | 50 | 120.00 | 6,000 | — | — | at job worker ⚠ 10 months |
| PACK-CRT-50 | WH-RM | 60 | 85.00 | 5,100 | 0 | 0 | **60 < level 100 → breach** |
| PUMP-KV50 | WH-FG | 8 | 18,400.00 | 1,47,200 | — | 24 (SO-1042 draft DN) | −16 (MPS covers, Planning) |
| SCRAP-BRZ | WH-SCRAP | 38 kg | 380.00 | 14,440 | — | — | — |

### 20.9 Count sheet CNT-2026-0009 (WH-RM, snapshot 08-Jul 16:00, posted 08-Jul 17:30)

42 item-locations counted (blind), 39 accurate within tolerance → **record accuracy 92.9%** (gate: 95% — *not yet met*). Variances:

| Item | Book (snapshot) | Counted | Diff | Reason | Value ₹ | ITC flag |
|---|---|---|---|---|---|---|
| BRG-6205-ZZ | 46 | 42 | **−4** | **damage** (rust — monsoon ingress, rack C) | −380.00 | **✔ 17(5)(h) — ITC reversal** |
| GLAND-PACK-20 | 14.0 m | 12.5 m | −1.5 m | count_variance (unrecorded issues) | −270.00 | — |
| GSK-NBR-3 | 220 | 222 | +2 | count_variance | +24.00 | — |

GL events: Dr Stock Adjustment 650.00 / Cr Stock In Hand — RM 650.00 (of which **₹380.00 flagged itc_reversal**); Dr Stock In Hand — RM 24.00 / Cr Stock Adjustment 24.00.

### 20.10 Job-work challans (to Sree Murugan Electroplating Works — WH-SUBCON-SME)

| Challan | Issued | Process | Item | Sent / Returned / Pending | Class | Deadline | Ageing (13-Jul-26) |
|---|---|---|---|---|---|---|---|
| **JWC-2026-0031** | 22-Jun-2026 | Hard-chrome plating | SHF-SS410-22 | 60 / 40 / 20 | input | 22-Jun-2027 | **21 days — 🟢 healthy** |
| **JWC-2025-0104** | 12-Sep-2025 | Nickel plating | GLAND-CI | 200 / 150 / 50 | input | **12-Sep-2026** | **10 months — 🟠 AMBER** (₹6,000 at worker; deemed supply + 18% interest if not back by 12-Sep) |

ITC-04 export for FY26-27 Q1 lists both challans with sent/returned/pending detail. *(Context: Production's WO-2026-0145 — casing grinding at Sri Balaji Engg Works, challan DC-2026-0077 — posts into this same register when Module 6 goes live.)*

### 20.11 Gate passes

| GP no. | Type | Issued to | Purpose | Issued | Expected return | Status |
|---|---|---|---|---|---|---|
| **GP-RGP-2026-0018** | RGP | Coimbatore Die & Mould Services | KV-50 impeller die (asset D-114) — regrind | 18-Jun-2026 | 05-Jul-2026 | **🔴 OVERDUE 8 days** |
| GP-NRGP-2026-0007 | NRGP | Sri Balaji Castings | Wooden casing pattern PTN-KV80-C rev A (obsolete) — permanent transfer | 26-Jun-2026 | — | Closed (approved: R. Karthikeyan) |

### 20.12 Scrap disposal SCR-DISP-2026-0011 (posted 08-Jul-2026)

Buyer: **Salem Metal Traders** (GSTIN 33AAFCS8821B1ZQ — registered).

| Line | Item | HSN | Qty | Rate ₹ | Amount ₹ | GST |
|---|---|---|---|---|---|---|
| 1 | SCRAP-BRZ (bronze turnings) | **7404** | 180 kg | 380.00 | 68,400.00 | 18% |
| 2 | SCRAP-CI (CI borings) | **7204** | 420 kg | 28.00 | 11,760.00 | 18% |
| | **Total** | | | | **80,160.00** | |

Compliance strip on the print: *"2% GST-TDS: not applicable — consideration below ₹2.5 lakh"* (rule surfaced since Oct-2024 for B2B metal scrap); RCM note would appear had the buyer been unregistered. GL: Dr COGS — Scrap 80,160 / Cr Stock In Hand — Scrap 80,160.

### 20.13 Bank stock statement (cutoff 30-Jun-2026 — Karur Vysya Bank CC a/c 3311-0245-887)

| Group | Value ₹ (lakh) |
|---|---|
| Raw material & bought-out (WH-RM + WH-QC-QTN) | 48.62 |
| Work-in-process (WH-WIP + WH-SUBCON-SME) | 12.41 |
| Finished goods (WH-FG) | 38.95 |
| Consumables & packing | 1.86 |
| Scrap | 0.72 |
| **Total stock** | **102.56** |
| Less margin 25% | 25.64 |
| **Drawing power** | **76.92** |

Regenerating this statement today for the same cutoff returns the identical ₹1,02,56,414 — backdated entries posted since 30-Jun have been reposted into history, and the report reads the ledger as-of (the TC-BNK-01 property, demonstrated live to the CA).

### 20.14 Stock-ageing buckets (plant, 13-Jul-2026, from FIFO layer dates)

| Bucket | Value ₹ (lakh) | Highlights |
|---|---|---|
| 0–30 d | 38.2 | bronze layers 200@618 (10 d) + 200@625 (4 d); casting heat SBC-H-2655 |
| 31–60 d | 24.6 | casting heat SBC-H-2618 (25-Jun GRN) |
| 61–90 d | 14.9 | CI-CASTING-CSG lot SBC-H-2571 |
| 91–180 d | 12.3 | motor stock, seal over-buy from March |
| 181–365 d | 8.1 | gasket lot B-GSK-2508 (expiring 31-Aug ⚠), KV-32 spare seals |
| > 365 d | 4.5 | **dead-stock candidates**: KV-32 model spares (discontinued 2024), 6 obsolete bronze impellers rev A (superseded by ECO-2026-0031 — Engineering module context) |

Dead stock (>180 d, no issues): **₹2.8 lakh**.

### 20.15 KPI tiles (dashboard, 13-Jul-2026)

| Tile | Value | Note |
|---|---|---|
| **Record accuracy (last count)** | **92.9%** | 🔴 gate 95% NOT met — banner: "Production module locked. Next count Wed 15-Jul; 2 consecutive counts ≥ 95% required." |
| Inventory turnover (TTM) | 3.1 | healthy band 2–4 |
| Days of inventory | RM 42 d · WIP 6 d · FG 21 d | |
| Shrinkage (last count) | 0.36% by value | |
| Dead-stock value | ₹2.8 L | ✦ narrative available (§20.17) |
| Stockout incidents (30 d) | 2 | MOTOR-5HP ×6 (WO-2026-0136 kit); GLAND-PACK-20 |
| Open compliance | 1 overdue RGP · 1 amber job-work challan | deep-links to registers |

### 20.16 Seeded alerts (workbench/notification feed)

- 🔴 **Reorder breach:** PACK-CRT-50 projected 60 < level 100 → draft **MR-2026-0141** (200 NOS) created for Purchase — *"Coimbatore Packaging Co, last rate ₹85"*.
- 🔴 **RGP overdue:** GP-RGP-2026-0018 — impeller die at Coimbatore Die & Mould Services, 8 days past expected return.
- 🟠 **Job-work ageing:** JWC-2025-0104 at 10 months — 50 GLAND-CI at Sree Murugan Electroplating; deemed supply on 12-Sep-2026.
- 🟠 **Batch expiring:** B-GSK-2508 (GSK-NBR-3, 140 NOS) expires 31-Aug-2026 — 49 days.
- 🟠 **QC hold ageing:** 50 CI-CASTING-IMP (heat SBC-H-2655) in WH-QC-QTN for 4 days — inspection pending.

### 20.17 AI summary examples (seeded, verbatim)

**AI example 1 — Dead-stock digest (✦ dashboard, §13.1):**
> "₹2.8 lakh (2.7% of stock value) hasn't moved in 180+ days. The two biggest blocks: **KV-32 model spares (₹1.9 L)** — the model was discontinued in 2024 and the last issue was 14 months ago; consider a dealer clearance offer via Sales, or scrap disposal (CI parts → HSN 7204 @ 18%). **Six bronze impellers rev A (₹0.55 L)** — superseded by ECO-2026-0031 (SS impeller); Engineering lists no open demand on rev A. Also flagged: gasket lot B-GSK-2508 (₹1,680) expires 31-Aug-2026 — use-first suggestion sent to the batch picker. *[Evidence: ageing report >365 d rows; last-issue dates; ECO-2026-0031 link.]*"

**AI example 2 — Count-variance explanation (✦ on CNT-2026-0009 line 1, §13.2):**
> "BRG-6205-ZZ shows −4 pcs (−8.7% of book). This is anomalous vs the item's count history (median variance −0.4%). Pattern check: all 4 units were in rack C, which sits under the roof section repaired last monsoon; the units show rust per Selvam's count note. This matches prior *damage* write-offs, not theft (no gate-pass or issue gaps in the period). **Suggested reason: damage — note: ITC reversal applies under Sec 17(5)(h)** and will be flagged to CA Lakshmi in the GL feed. *[Evidence: count history for item; SLE gap scan 01→08 Jul; count note photo.]*" — *Poongodi picks the final reason; the suggestion is never auto-applied.*

**AI example 3 — Conversational stock query (Hindi, §13.3):**
> **Q:** "इंपेलर कास्टिंग कितनी बची है?"
> **A:** "CI-CASTING-IMP: **WH-RM में 40 NOS** (बैच B-CI-IMP-2606A, हीट SBC-H-2618, मूल्य ₹31,200) और **WH-QC-QTN में 50 NOS** QC-होल्ड पर हैं (हीट SBC-H-2655, 4 दिन से निरीक्षण बाकी)। MRP के अनुसार W30 में 18 NOS की माँग है — QC जल्दी पूरा करवाना ठीक रहेगा। *[स्रोत: bin snapshot 13-Jul; MR-2026-0127]*"

---

## Appendix A — Research findings & key sources

The evidence base behind this blueprint: ~74 web-research findings across SAP MM-IM, ERPNext, Dynamics 365 BC, NetSuite, Odoo, Zoho, Katana, MRPeasy + India-statutory sources, adversarially fact-checked with corrections applied. Provenance flags retained where a source is vendor-sponsored or otherwise caveated.

### A.1 The cross-vendor architectural invariant

Every surveyed ERP implements inventory as a **document-driven, append-only perpetual ledger**:

- **SAP MM-IM** writes a "material document" for every goods movement and only ever updates quantity/value through those documents, with movement *reasons* encoded as numbered movement types on that one document (101 = GR against PO, 201 = issue to cost center, 261 = issue to production, 3xx = transfers, 7xx = count differences).
- **ERPNext**: Stock Ledger Entry (append-only) aggregated into a Bin projection table. **Business Central**: item ledger entries + value entries. Same pattern.

**Design consequence: the stock table is a transaction ledger keyed to vouchers — never an editable on-hand column.** (This vindicates the running-balance lesson from the dashboard MVP: the legacy Excel's "Stock Qty" column is exactly the anti-pattern.)

### A.2 Table stakes (every major ERP)

- One movement document with a **purpose/reason enum** (ERPNext's Stock Entry has 8 purposes; 5 are non-manufacturing — Issue, Receipt, Transfer, Repack, Send to Subcontractor. The MVP ships 3 as a *scope choice*, adding the manufacturing ones when Production lands).
- **Batch/lot + serial tracking with expiry** — shipped even at the SMB price floor (Zoho, Odoo, ERPNext, BC). Zoho's simplification is copyable verbatim: an item is serial-tracked **or** batch-tracked, never both → one `tracking_mode` enum.
- **Static reorder-point replenishment**: ERPNext natively auto-creates a Material Request below reorder level; Zoho's native reorder points alert + assist (auto-PO needs an add-on). "Alert or draft at reorder level" is the SMB baseline.
- **Physical-count flow** — the same 3 steps everywhere: create count doc (snapshot book qty) → enter counts → post differences. ERPNext collapses it into one **Stock Reconciliation** doctype that doubles as the opening-stock loader.
- **FIFO + moving/weighted-average valuation**, with the method **hard-locked once ledger entries exist** (BC's immutability rule — copied).
- **Stock-status segregation for QC** (SAP: Unrestricted/Quality/Blocked; ERPNext: rejected warehouse; Odoo: quarantine locations — always via ledger transactions, never edits).
- **Ageing/slow-moving reporting** and **recall traceability as a query** (nearly free once every ledger row stores batch_id).

Odoo 18 **Community edition** is a strong empirical minimum-viable baseline: its huge free-tier SME install base runs on exactly reordering rules, warehouse management, lot/serial tracking, adjustments, and batch transfers.

### A.3 Advanced tier (deferred with vendor precedent)

- **Forecast-driven replenishment** (NetSuite recalculates reorder points from demand history) — genuine enterprise differentiator; static min/max is the norm.
- **The entire WMS layer** — putaway rules, wave/batch picking, multi-step routes, carrier integration: every vendor documents it as severable; Odoo sells it Enterprise-only. **Bin-level costing doesn't exist even in NetSuite** (bins track qty only) — validates a per-warehouse ledger with bin as an informational field.
- **Hard reservation/commitment** — the one mid-tier feature that materially complicates the ledger (available = on-hand − reserved). MVP shows projected availability instead.
- **No-freeze cycle counting** (NetSuite Smart Count) — premium; freeze-at-creation is the honest table-stakes equivalent.
- **Removal-strategy engines** (FEFO picking): Odoo correctly separates *pick order* from *costing method* — conflating them is a classic legacy-ERP mistake. MVP ships valuation with **no pick-order engine at all**.
- Pricing signal on batch tracking: **Katana** sells lot traceability as a paid add-on (~$249/mo on its $299/mo Core plan; formerly an $799/mo tier), while **MRPeasy includes basic lot traceability at $49/user/month** targeting exactly this segment (electronics/machinery discrete manufacturers). For a metal-components maker, batch-as-core is the right call.

### A.4 Business impact & evidence base

**The load-bearing number:** MRP/ERP planning logic needs **95–99% inventory record accuracy** to function (Strategos). Typical unaudited accuracy is far lower — retail studies (DeHoratius & Raman; Auburn RFID Lab) measured ~63–65% of records accurate. Cycle counting is what closes that gap → **Stock Reconciliation is MVP-essential, and Inventory is a prerequisite for Production, not a peer.**

KPI formulas (all computable from the ledger + item master — implemented in §11.12): turnover = COGS ÷ avg inventory (healthy ≈ 2–4, practitioner); DOI = (avg inventory ÷ COGS) × 365 per RM/WIP/FG; record accuracy = accurate ÷ counted (the 95% threshold); stockout/fill-rate internal analogue = MR lines Stores couldn't issue (leading-indicator pair); shrinkage = (book − counted) ÷ book; safety stock = (max daily use × max lead time) − (avg × avg); dead stock = value with no movement in N days (free from Stock Ageing).

**Carrying cost, quoted honestly:** the common industry rule of thumb is **20–30% of inventory value per year**; APQC's own benchmarked median is nearer **~10%** — quote the range, and per **Panorama 2024**, inventory benefits were the *least* fully-realized category that year, so **never promise a fixed reduction percentage in the demo** (anti-goal §17.6).

**Failure modes of the manual status quo (demo talking points):**
- 43% of US small businesses track inventory manually or not at all (**Wasp — vendor-sponsored but widely cited**): the client's Excel situation is the norm.
- **88% of audited real-world spreadsheets contain errors** (Panko, academic); developers estimated 18% error likelihood when the measured rate was 86% — the overconfidence mechanism by which a wrong Excel balance is trusted until a physical shortage stops production.
- Canonical case: **Precision Drilling** ran $2M of parts on Excel; workers repeatedly **reordered parts already in stock because they couldn't locate them** — duplicate purchasing + labor wasted hunting are *the* two manual-stores failure modes.
- 73% of discrete-manufacturing ERP projects fail to meet objectives, with **poor data migration cited in 38% of failures** (Panorama data via Godlan) → the CSV opening-stock import path is higher-value de-risking than any advanced feature.

### A.5 Key sources

SAP Help MM-IM (material documents) · Guru99/GTR Academy (movement types, stock types, MI01/04/07) · Microsoft Learn BC (costing methods & immutability, item ledger, tracking/tracing) · NetSuite docs (inventory, bin management, Smart Count) · Odoo 18/19 docs (inventory, 3-step receipts, adjustments, putaway; Community vs Enterprise split) · ERPNext manuals (stock, stock-entry, material-request, purchase-receipt, stock-reconciliation, FIFO & moving average, perpetual inventory) · DeepWiki ERPNext architecture (SLE+Bin) · Zoho (serial/batch, features) · Craftybase + current pricing pages (Katana vs MRPeasy) · Strategos (record accuracy) · DeHoratius & Raman / Auburn RFID (retail accuracy baseline) · ShipBob / KPI Depot (KPI formulas) · APQC (carrying cost) · Panorama 2024 report + Godlan failure statistics · Wasp / Katana / Panko (Excel failure evidence; Wasp is vendor-sponsored) · ClearTax (e-way, ICDS II, e-invoicing) · BUSY (state thresholds) · GimBooks / HNA LLP (branch transfers, Rule 28) · CBIC Rule 45/55/56 texts · TaxGuru (145A, ITC-04) · ClearTax/EfileTax (17(5)(h) reversal) · LFSPL/VersionX (RGP/NRGP practice) · ClearTax/Patron (CARO 2020 3(ii)(b)).

---

## Appendix B — Open questions for the pilot customer (Kaveri Pumps & Motors, Coimbatore)

1. **Locations & GSTIN:** besides KPM-CBE-1, does Kaveri operate any depot/branch (e.g., a Chennai sales depot) under a **different GSTIN**? (Activates the tax-invoice transfer branch §11.9 and its e-way implications.)
2. **Batch scope day one:** which items genuinely need batch tracking from the start — castings + rod + ingot (heat numbers) only, or FG pumps too (serial-per-pump is the likelier FG ask — confirm)?
3. **Count practice today:** annual only, or any cycle counting to build the ABC calendar on? Who counts — stores staff or a mixed team? (Affects blind-count default and the path to the 95% gate.)
4. **Bank stock-statement format:** the exact layout Karur Vysya Bank expects (monthly? margin %? product-group split?) so the §20.13 report matches it column-for-column.
5. **RGP volume:** how often do dies/tools/instruments go out for repair/calibration (the GP-RGP fixture assumes ~2–3/month)? Who signs at the gate today?
6. **Heat-number practice:** do Sri Balaji Castings' and Lakshmi Steels' challans/TCs reliably carry heat numbers we can key `supplier_lot_ref` from — or do we need a receiving-side labeling step?
7. **Scrap disposal:** current buyer(s), registered or not (RCM exposure), typical lot values (does the ₹2.5 lakh TDS threshold ever trigger)?
8. **Excel conventions:** UoM habits in the current register (kg vs pcs vs m per item) to pre-seed `uom_conversion` and the import mapping (§13.7).

---

*— End of blueprint. Companion plans: `ENGINEERING.md` (Module 1), `SMBD.md` (Module 2), `PLANNING.md` (Module 3), `PURCHASE.md` (Module 4), `PRODUCTION.md` (Module 6).*








