# IND-CORE Module 04 — Purchase and Procurement
## Engineering Implementation Blueprint

**Product:** IND-CORE Manufacturing ERP for Indian SMEs (IND-AI)
**Module:** Purchase / Procurement — Supplier & terms masters → PO lifecycle → GRN + QC gate → Invoice / advisory 3-way match → Payments → GST · TDS · MSME statutory layer → Replenishment
**Document status:** Implementation-ready blueprint v1.0 · 19 July 2026
**Audience:** Frontend, Backend, AI and Product teams — start immediately from this document.

Companion module blueprints (the six-module IND-CORE suite): `ENGINEERING.md` (Module 1 — Engineering/PLM) · `SMBD.md` (Module 2 — SMBD) · `PLANNING.md` (Module 3 — Planning/MRP) · **this document (Module 4 — Purchase/Procurement)** · `INVENTORY.md` (Module 5 — Inventory/Stores) · `PRODUCTION.md` (Module 6 — Production/Manufacturing).

> Grounded in ~75 web-research findings across SAP S/4HANA, SAP Business One, NetSuite, Dynamics 365 Business Central, Odoo, ERPNext, and SME tools (Katana, Zoho Inventory, MRPeasy), plus India-statutory sources; every load-bearing claim was adversarially fact-checked by a second research pass. The full research narrative and source list are preserved in **Appendix A**.

---

## 1. Module Overview

Purchase is the **money-out mirror of SMBD**: it is the system of record for everything from "we need material" to "the supplier is paid and the input tax credit is safe". For an Indian SME discrete manufacturer, the module answers five linked questions:

1. **What do we need to buy, from whom, at what price?** → Material Requests, item–supplier purchase terms, rate contracts
2. **Is the order placed and where is it now?** → Purchase Order lifecycle + the open-pipeline tracker
3. **Did the right material actually arrive, and is it good?** → GRN with accepted/rejected split, batch capture, QC gate
4. **Are we paying the right amount, once, to the right vendor?** → Purchase invoice, duplicate guard, advisory 3-way match, payment holds
5. **Will the CA sign off?** → GSTR-2B-reconcilable purchase register, TDS 194Q/393(1) & 194C, RCM, MSME 43B(h) ageing

The backbone is the industry-standard **convertible document chain**, each document created from its predecessor with lines carried forward (no rekeying):

```
Material Request → (RFQ = a status on the draft PO) → PURCHASE ORDER → GOODS RECEIPT (+QC) → A/P INVOICE → Payment
                                                     ←—————————— the mandatory core ——————————→
```

All four full suites surveyed (ERPNext, Odoo, SAP B1, NetSuite; Business Central and S/4HANA agree) implement this chain; the successful SME tools (Katana, Zoho Inventory, MRPeasy) deliberately truncate it to **PO + receipt** — the design licence for our narrow, deep MVP (Appendix A.1).

**Three design commitments inherited from the market's best practice:**

- **Commitment / stock / liability separation** (SAP B1 makes it explicit): the PO posts no accounting value (only on-order quantity), the GRN moves inventory, the A/P invoice posts the vendor liability. This three-posting separation is the structural basis of 3-way match and is preserved end-to-end — even while Accounts is a stub that only logs posting events.
- **Statuses are always computed, never edited** (ERPNext/Odoo derived-status pattern): PO status derives from summing child-document quantities against parent lines; no status field is ever PATCHable.
- **Documents are immutable after submit** — cancel-and-amend, never update-in-place; every stock effect goes through the Module 5 Inventory ledger API, never a direct quantity write.

**Why this module wins for IND-CORE.** The statutory surface Indian SMEs actually face — ITC gated on GSTR-2B matching, two TDS sections with FY accumulators, RCM on inbound freight, MSME 43B(h) payment clocks — is either absent, half-localized, or a paid add-on in every surveyed suite. IND-CORE hard-seeds it (the surface is compact enough that **no configurable tax engine is needed**), pairs it with MRPeasy-grade two-click PO creation, and keeps matching **advisory, never blocking** — because research shows 22% of invoices are exceptions and hard blocks just spawn parallel processes (Appendix A.2).

### 1.1 Position in IND-CORE — integration contracts (summary)

| Boundary | Direction | Contract (detail in §10.9 / §11) |
|---|---|---|
| **Inventory (Module 5)** — tightest | PO confirm → Inventory; GRN → Inventory; Inventory → Purchase | PO confirm publishes a pending receipt into Inventory's expected-receipts queue. GRN submit writes stock-entry rows (accepted warehouse + quarantine warehouse) **through the one ledger API — Purchase never writes stock directly**. Inventory's reorder breach (projected qty ≤ reorder level) → nightly job drafts a Material Request into the Purchase workbench. |
| **Production (Module 6)** | Production → Purchase; Purchase → Production | Consumes Material Requests (`purpose=purchase`) emitted by Production's shortage calc; exposes PO status + expected dates back for scheduling against inbound supply. Subcontract POs (service item + FG) pair with Production's job-work challan chain — **money flow here, goods flow there** (`PRODUCTION.md` §6). |
| **Planning (Module 3)** | Planning → Purchase; Purchase → Planning | Planning's MRP emits Purchase Requisitions (`planning.pr.created`); Purchase converts PR → PO preserving the peg (`source_pr`). Open PO lines feed Planning's scheduled-receipts view; every GRN posts a (promised vs actual) lead-time learning sample back (`PLANNING.md` §13.5). Reorder-policy items and MRP-planned items are mutually exclusive (Planning's conflict guard V-08). |
| **Quality** | Purchase ⇄ Quality | The GRN submit gate + `quality_inspection` documents keyed to GRN lines **is the entire Purchase↔Quality contract**: if `item.inspection_required`, the GRN cannot submit until a linked QI is completed. |
| **Accounts (stub)** | Purchase → Accounts | Emit posting events on GRN (stock / GRNI), Invoice (AP, GST input matrix, TDS payable, RCM legs) and Payment, with the reversal pair on returns/debit notes. The GL is an append-only `posting_event` log for now; the commitment/stock/liability separation stays intact so a real GL can replay it later. |
| **Engineering (Module 1)** | Engineering → Purchase | Item master (HSN, UoM, revision) is Engineering-owned; Purchase extends it with procurement columns via migration (§9). PO lines reference released item revisions. |
| **SMBD (Module 2)** | indirect | Sales/CSR read the pipeline tracker for customer-promise questions ("is the motor PO arriving before we assemble?"); no direct document flow. |

### 1.2 Scope boundary

| In this module | Not in this module (consumes it) |
|---|---|
| Supplier master, GST/TDS/MSME attributes | Item engineering master (Engineering) |
| Item–supplier purchase terms, rate/blanket contracts | MRP netting & requisition generation (Planning) |
| Material Request intake + reorder-drafted MRs | Reorder-level policy math (Planning §4.I; Purchase executes the nightly draft) |
| PO lifecycle, approval, pipeline tracker | Stock ledger & warehouse balances (Inventory) |
| GRN, accepted/rejected split, batch capture, QC gate | Inspection template design (Quality) |
| Purchase invoice, duplicate guard, advisory match, holds | Double-entry GL, payment execution/banking (Accounts — stubbed) |
| Payments with TDS deduction (record-keeping) | Job-work challan issue/receipt (Production/Inventory own the goods flow) |
| GST purchase register, TDS accumulators, MSME ageing | GSTR filing itself (CA/GSP tools consume our export) |

---

## 2. Objectives

| # | Objective | Success metric (pilot targets) |
|---|-----------|-------------------------------|
| O1 | Replace Excel/WhatsApp purchasing with one governed document chain | 100% of pilot POs created in-system; per-PO processing cost trending to APQC top-quartile (≈ $14 vs > $54 bottom-quartile; Appendix A.2) |
| O2 | Two-click PO creation from purchase terms | PO for a terms-known item in ≤ 3 clicks / < 60 s (MRPeasy benchmark); ≥ 80% of PO lines auto-filled from `item_supplier_terms` |
| O3 | Make incoming quality a number, not an argument | Supplier defect rate (rejected ÷ received) computed live per vendor; 100% of rejections land in quarantine via the ledger; < 1% defect target for critical suppliers |
| O4 | Keep the buyer's ITC safe | 100% of invoices carry the five GSTR-2B matching keys; monthly register export reconciles line-count and tax totals against invoices; CA closes 2B reconciliation inside the 14th→20th window |
| O5 | Statutory automation that never misses | Zero missed 194Q/393(1) or 194C deductions on golden fixtures; zero MSME dues silently crossing day 15/45; RCM freight self-invoiced on every GTA bill |
| O6 | Flag, don't block | Every invoice exception (price var / qty var / no-receipt) chip-flagged; **zero** hard blocks on submit; exception rate visible on the dashboard (industry average 22% — Appendix A.2) |
| O7 | Close the replenishment loop | Below-reorder items appear as a draft Material Request by 07:00 next morning, zero manual stock scanning |
| O8 | "Where is my order?" in seconds, for anyone | Pipeline board answers any open-PO question < 3 s; conversational assistant (EN/HI) answers with grounded refs |
| O9 | On-time, in-full supply visibility | Supplier OTD ≥ 95% for strategic vendors tracked; emergency-purchase rate < 5% (> 10% = planning failure, escalated to Module 3) |

---

## 3. User Personas

### 3.1 Procurement Officer — PRIMARY
- **Profile:** Anand Krishnan, purchase officer at Kaveri Pumps & Motors Ltd, Coimbatore. B.Com + 12 years buying castings, bearings, motors and bar stock for a pump plant. Today: PO register in Excel, rate lists in a diary, order chasing on WhatsApp calls.
- **Goals:** place correct POs fast; know where every open order is; never pay a duplicate invoice; keep the MD and the CA off his back.
- **Pain points:** re-keying rates he already negotiated; duplicate orders from a half-finished shared spreadsheet; "three different places" for PO/receipt/invoice when matching; discovering an MSME due date the day after it passed.
- **Owns:** supplier master & terms, Material Request triage, PO create/confirm, expediting, invoice entry, payment-run proposals.
- **Screens:** Purchase Workbench (home), PO Editor, Invoice screen, Supplier Card, MR queue, MSME ageing, Purchase Register.

### 3.2 Stores In-charge
- **Profile:** S. Poongodi, stores in-charge, Kaveri Coimbatore. Runs receiving bay, main store and quarantine cage. Phone/tablet-first.
- **Goals:** know what's arriving today before the lorry shows up; book receipts in minutes; keep rejected material physically and systemically separate.
- **Pain points:** surprise deliveries; supplier challans that don't match any order; rejected castings mixed back into good stock.
- **Owns:** GRN entry (accepted/rejected split, batch/heat numbers), triggering QI, purchase returns.
- **Screens:** Receiving queue (auto-spawned from confirmed POs), GRN form, QI form, expected-receipts calendar.

### 3.3 Plant Manager
- **Profile:** R. Karthikeyan, plant head, Kaveri Coimbatore. Approves within his band, watches material availability against the production schedule.
- **Goals:** no line stoppage for want of a bearing; emergency purchases visible and rare; supplier quality trending down, not up.
- **Owns:** mid-band PO approvals, quarantine dispositions (with QC), emergency-PO justification.
- **Screens:** Pipeline board (filtered to late/critical), Supplier Card, KPI dashboard, mobile approvals.

### 3.4 Finance / CA
- **Profile:** CA Lakshmi Narayanan, part-time CFO/auditor for Kaveri. Files GSTR-3B against 2B, deposits TDS by the 7th, certifies 43B(h) compliance at year-end.
- **Goals:** a purchase register that reconciles with GSTR-2B without a war room; TDS computed per section with FY accumulators she can audit; an MSME ageing she can hand to the tax auditor.
- **Pain points:** invoices missing supplier invoice no./date; ITC claimed on ineligible items; 194Q surprises in March.
- **Owns:** payment runs (execution outside MVP), register export, TDS review, hold releases (finance holds).
- **Screens:** Purchase Register, MSME ageing, invoice screen (read + hold/release), supplier FY-threshold meter, posting-event log.

### 3.5 Managing Director (mobile approver)
- **Profile:** Venkat Subramanian, MD, Kaveri Pumps. Travels; approves from his phone in seconds or not at all.
- **Goals:** one-tap approve/reject with enough context (vendor, value, why, budget feel); spend visibility without asking anyone.
- **Owns:** above-threshold PO approvals (single threshold — the only approval step in MVP), emergency-PO ratification.
- **Screens:** Mobile approval card (PO summary + line peek + vendor stats), KPI dashboard (read-only).

### 3.6 Sales / CSR (read-only consumer)
- **Profile:** Divya Ramesh, CSR (SMBD module). Customers ask her for delivery dates that depend on inbound material.
- **Goals:** see whether the motors for SO-1042's pumps have a confirmed PO and when they land — without calling Anand.
- **Screens:** Pipeline tracker (read-only, filtered by item), conversational "where is my order?" assistant.

### 3.7 Supplier (indirect actor — no login in MVP)
- **Profile:** e.g., proprietor of Sri Balaji Castings. Interacts through artefacts, not screens: receives the GST-compliant PO PDF on email/WhatsApp, sends order confirmations and challans, submits invoices, chases payment on the phone.
- **Module obligations toward this actor:** printable PO with HSN/SAC, GST breakup, delivery and payment terms; correct TDS certificate data (per-section FY figures); MSME-clock-respecting payment behaviour. A supplier portal is explicitly deferred (§18) — pointless on a single-node MVP and absent from all surveyed SME tools.

---

## 4. Functional Requirements

Numbering: `FR-PUR-xxx`. Priority: **M**ust (MVP core, phases P1–P4) / **S**hould (MVP stretch, phase P5 — shipped for the demo) / **C**ould (deferred, §18). Traceability tags **[M1]–[M12]** map to the must-have list justified in §17.1; **[IN-1]–[IN-10]** map to the India-statutory items in §4.F.

### 4.A Supplier & Item Masters

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PUR-001 | **Supplier master** with: legal/display name, GSTIN, GST state (2-digit code), **GST category enum (Registered / Unregistered / Composition / SEZ / Overseas)**, RCM-default flag, PAN, **TDS section** (194Q/194C/none — parameterized labels, §11.4), **MSME status enum (none/micro/small/medium) + Udyam number**, payment-terms days, default lead-time days, currency, bank details (display-only), active flag. **[M1]** | Category + GST state drive the CGST+SGST vs IGST split (§11.1); MSME status ∈ {micro, small} activates the 43B(h) clock; Udyam number mandatory when MSME status ≠ none; PAN mandatory when a TDS section is set. | M |
| FR-PUR-002 | **Offline GSTIN validation**: 15-char format (2-digit state + 10-char PAN + entity digit + 'Z' + check char) **and check-digit verification**, plus state-code ⇄ `gst_state` consistency. Live GSTN verification is a paid GSP API — **stubbed** behind an interface. **[IN-10]** | Invalid GSTIN blocks save with a field-level error naming the failing rule; `gst_category='unregistered'` requires GSTIN to be empty; the GSP stub returns `not_configured`. | M |
| FR-PUR-003 | **Item purchase fields** (extension columns on the Engineering-owned item): default purchase UoM, HSN code, last-purchase rate (auto-updated on invoice submit), reorder level & reorder qty, preferred supplier, **inspection-required flag**, **ineligible-ITC flag** (Sec 17(5)), purchase-tax rate (GST %). **[M2]** | Editing purchase fields never touches Engineering-owned columns; last-purchase rate updates only from submitted invoices; HSN mandatory before an item can appear on a confirmed PO (V-PUR-07). | M |
| FR-PUR-004 | **Dual UoM with conversion factors** (`uom_conversion`): buy in purchase UoM (kg, MT, box), stock in stock UoM (pcs, m); the Inventory ledger is **always posted in stock UoM**. Conversion factor visible on every PO/GRN line. **[M2]** | kg→m fixture converts exactly (TC-UOM-01); factor edit is blocked once transactions reference it (superseding row with effective date instead); factor > 0 enforced by CHECK. | M |
| FR-PUR-005 | **CSV/XLSX import** for suppliers, item purchase fields, and item–supplier terms, with row-level error reporting and dry-run preview. (Data migration is the #1 documented ERP failure cause — 38%; Appendix A.2.) | 1,000 suppliers + 5,000 terms import < 60 s; every rejected row carries a reason; re-import is idempotent on natural keys. | M |
| FR-PUR-006 | **Supplier two-number stats + FY value** on the supplier card: OTD % and rejection % computed from GRN data (§11.9), FY purchase value vs the ₹50-lakh 194Q threshold as a meter. (The SME reduction of the full scorecard — ERPNext's standings/enforcement deferred.) | Stats recompute nightly and on `purchase.grn.submitted`; card shows sample counts ("out of 27 GRNs"); meter turns amber at 90% of threshold. | S |

### 4.B Purchase Terms & Rate Contracts

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PUR-010 | **Item–supplier purchase-terms table** (rate, purchase UoM, lead-time days, min-order qty per item×supplier) **auto-filling PO lines** — MRPeasy's two-click PO pattern, the single highest-leverage table in the module. **[M4]** | Selecting item + supplier on a PO line fills rate/UoM/lead time in one round-trip; a terms-known PO is creatable in ≤ 3 clicks (TC-PO-02); missing terms → manual rate entry allowed, line flagged `rate_source='manual'`. | M |
| FR-PUR-011 | **Minimal blanket / rate order**: supplier, validity window, fixed rates per item, agreed qty, **cumulative released qty**; a PO can be created as a release against it (client buys metal on rate contracts; 5 of 6 surveyed suites ship blanket agreements). | Release auto-fills the contract rate (not editable below it without a variance flag); cumulative released qty updates on PO confirm; release beyond agreed qty → warning + approval; expired contract → release blocked. | S |
| FR-PUR-012 | **Advance-paid field on the PO**, reconciled at invoice time (standard practice with small Indian job-work and raw-material vendors — SAP B1 ships a full A/P Down Payment Invoice; we ship the SME reduction). | Advance ≤ PO grand total; on invoice submit the open advance is offered for adjustment; unadjusted advance visible on the supplier card. | S |
| FR-PUR-013 | **Price history** per item×supplier (every submitted PO line and invoice line appended) feeding last-purchase rate, PPV, and the AI price-anomaly flag (§13.2). | History queryable from the PO line ("last 5 buys" popover); retained ≥ 24 months. | M |

### 4.C Purchase Order Lifecycle

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PUR-020 | **One purchase document with a state machine** — *not* separate RFQ/quotation/order tables. A draft PO doubles as an RFQ (printable with an "RFQ" watermark); Odoo's RFQ *is* a draft PO and MRPeasy ships RFQ as a PO status. Halves the pre-receipt schema and UI. **[M3]** | State machine below enforced server-side; no separate RFQ tables exist anywhere in the schema; draft print renders "Request for Quotation", confirmed print renders "Purchase Order". | M |
| FR-PUR-021 | **Computed PO fulfilment status** from per-line `received_qty` / `billed_qty` (in stock UoM): `to_receive_and_bill` → `to_bill` / `to_receive` → `completed`. Never manually edited; the lifecycle status field accepts only endpoint-driven transitions. **[M9]** | Status derivation matches the truth table in §11.2 (TC-PO-01); `PATCH /purchase-orders/{id} {status:…}` does not exist; attempts → 405. | M |
| FR-PUR-022 | **Immutable after confirm** — cancel-and-amend, never edit-in-place. Amend creates a new draft referencing the cancelled original (`amended_from`). **[M11]** | Any field-edit API on a confirmed PO → 409; cancel requires no linked open GRN/invoice (else short-close path); audit row on every transition. | M |
| FR-PUR-023 | **Single amount-threshold approval** (default ₹1,00,000, configurable; or none) with mobile one-tap approve for the MD. *One threshold, two roles — the documented over-engineering trap says stop here* (Procurify post-mortem, Appendix A.2). **[M11]** | PO ≥ threshold cannot confirm until approved; approval card shows vendor, value, lines, vendor stats; approve/reject < 5 s round-trip; below-threshold POs confirm directly. | M |
| FR-PUR-024 | **Emergency-PO flag** with reason, feeding the emergency-purchase-rate KPI (> 10% = planning failure — the Purchase↔Planning health metric). | Flag settable only at create/confirm; emergency POs badge red in the pipeline; KPI = flagged ÷ total confirmed POs per month. | M |
| FR-PUR-025 | **Procurement tracker / pipeline view** — "where is my order?" across the open pipeline: columns Draft/RFQ → Confirmed → Awaiting GRN → Awaiting Invoice → Done, with overdue chips (required-by < today). **[M12]** | Board loads < 500 ms at 2,000 open documents; every card deep-links; filter by supplier/item/buyer; Sales/CSR see it read-only. | M |
| FR-PUR-026 | **Hold / short-close**: hold pauses receiving & invoicing (with reason); short-close a partially received PO closes the remainder (computed status `completed (short-closed)`), releasing Planning's on-order projection. | Short-close emits `purchase.po.closed` with remaining-qty payload so Planning/Inventory drop the pending receipt; reopen requires Plant Manager role. | M |
| FR-PUR-027 | **GST-compliant PO print/PDF** (buyer + supplier GSTIN, line HSN/SAC, GST rate & split, totals in words, terms), shareable via email/WhatsApp file. | PDF renders < 2 s; rupee amounts in lakh/crore grouping; DC/e-way references shown on returns print. | M |
| FR-PUR-028 | **PO ⇄ source links**: PO lines created from Material Requests or Planning PRs carry `source_mr_line` / `source_pr` for pegging; converting an MR marks it `partially_ordered/ordered`. | Peg chip on the PO line opens the source document; MR status recomputes from ordered qty per line. | M |

**Document state machines (kept from the research plan — enforced verbatim):**

```
PO:        draft ──confirm──▶ confirmed ──all lines received+billed──▶ locked
             │                    │  ▲
             └──cancel            └──┴── hold / close (short-close partials)

GRN:       draft ──submit (QC gate if required)──▶ to_bill ──▶ completed
                                                       └──▶ return_issued / closed

Invoice:   draft ──submit──▶ unpaid ──▶ partly_paid ──▶ paid
                               │ (overdue = computed from terms)
                               └──▶ hold(reason) — excluded from payment selection

Material   draft ──submit──▶ pending ──▶ partially_ordered ──▶ ordered
Request:                        └──▶ stopped (short-close, history preserved)
```

### 4.D GRN & QC Gate

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PUR-030 | **Auto-spawned pre-filled GRN** from every confirmed PO: a pending-receipt row appears in the Stores receiving queue with lines, quantities and warehouses pre-filled (Odoo receipt pattern). **[M5]** | PO confirm → pending GRN visible in the queue < 5 s (event bus); receiving Poongodi edits quantities, never re-keys lines. | M |
| FR-PUR-031 | **Per-line accepted/rejected split → quarantine warehouse**: accepted qty posts to the line's warehouse, rejected qty posts to the plant quarantine warehouse — both **via the Module 5 ledger API in one atomic call**. **[M5]** | Reject 10 of 50 → quarantine balance +10, main store +40, one ledger transaction id on both rows (TC-GRN-04); Purchase has no code path that writes `stock_ledger` directly. | M |
| FR-PUR-032 | **Batch/lot capture per GRN line**: internal batch number (auto), supplier lot/heat number, mfg/expiry dates where tracked. Batch-at-receipt is a verified market gap for SME tools and the start of ISO 9001 traceability. **[M5]** | Items with `tracking_mode='batch'` cannot submit a GRN line without batch + supplier lot ref; batch flows into the Inventory ledger rows. | M |
| FR-PUR-033 | **Partial receipts** via cumulative `received_qty` per PO line; **over-receipt tolerance** (default 0%, per-item override) beyond which the GRN line is rejected. | Receive 60 of 100 → PO shows "to receive and bill 40" (TC-GRN-01); receipt beyond qty × (1+tolerance) → 422 (TC-GRN-02, golden). | M |
| FR-PUR-034 | **QC gate**: if `item.inspection_required`, the GRN cannot be submitted until a linked **Quality Inspection** (sample size, readings, accepted/rejected verdict) is completed — ERPNext's hard gate; QC as a gate, not a parallel step. **[M6]** | Submit without completed QI → 422 with the pending-QI list (TC-GRN-03); QI verdict pre-fills the accepted/rejected split; QI immutable after completion. | M |
| FR-PUR-035 | **Purchase return** against GRN lines (rejected or post-receipt discoveries) travelling under a **Delivery Challan (+ e-way bill above threshold)** — the return document stores challan no./date and e-way bill no. **[IN-9]** | Return qty ≤ accepted qty on the source GRN line; return posts the reversing ledger rows via Module 5 and emits the reversal posting-event pair; challan print includes GSTIN + HSN. | M |
| FR-PUR-036 | **Supplier challan capture** on the GRN header (supplier challan/DC no. + date) for gate-entry reconciliation. | Mandatory when the supplier invoice is not yet received; searchable. | M |

### 4.E Invoice, Matching & Payments

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PUR-040 | **Purchase invoice from PO/receipt lines** — "Get Receipt Lines" copies un-billed receipt lines onto the invoice (Business Central's structural matching); manual lines allowed for services. **[M7]** | Get Receipt Lines pulls only `billed_qty < accepted_qty` lines; billing updates `po_line.billed_qty`; an invoice can combine multiple GRNs of one supplier. | M |
| FR-PUR-041 | **Mandatory supplier invoice no. + date**; **duplicate-invoice guard: uniqueness on (supplier, normalized invoice no., FY)** — a one-flag ERPNext-standard control; normalization (case/whitespace/punctuation-insensitive) because a typo defeats naive checks (Xelix). **[M7]** | Same invoice number keyed twice → blocked with a link to the existing invoice (TC-INV-01, golden); `"sb/1042"` vs `"SB-1042 "` both hit the guard; enforcement is a DB partial unique index, race-safe under concurrent submits (NFR-04). | M |
| FR-PUR-042 | **Computed payment statuses** unpaid → partly_paid → paid, with `overdue` computed from payment terms; **payment-hold flag with reason**, hold invoices excluded from payment-run selection. **[M7]** | Status recomputes on every payment; overdue is a query predicate, not a stored state; a held invoice never appears in the payment-proposal list (TC-PAY-02). | M |
| FR-PUR-043 | **Service/expense lines with SAC codes that bypass GRN and stock posting** — PO→Invoice without Receipt is a required document-flow variant (GTA freight under RCM is the most frequent case), not an edge case. **[M7, IN-3]** | A service line requires SAC, forbids warehouse/batch, posts expense not stock; freight bill entry needs no GRN; match status for service lines skips the qty/no-receipt checks. | M |
| FR-PUR-044 | **Computed 3-way-match flag per line** — `ok` / `price_var` / `qty_var` / `no_receipt` — **advisory exception chips, never a hard block** (Odoo ships it advisory & off-by-default; NetSuite's 23-criteria workflow is the enterprise ceiling we deliberately stay below). **[M8]** | Match computation per §11.3 on submit and on relevant child changes; chips render green/amber/amber/red; submit always allowed; exception report lists all non-ok lines. | M |
| FR-PUR-045 | **Payment entry** (date, mode NEFT/RTGS/UPI/cheque/cash, UTR ref) with **TDS deducted at payment or invoice** (whichever first, per section rules §11.4), advance adjustment, partial payments. | Payment total ≤ outstanding (V-PUR-11); TDS auto-computed but editable-with-reason by Finance; payment emits `purchase.payment.posted` for MSME clock + accumulator. | M |
| FR-PUR-046 | **Import invoice fields**: Bill of Entry no./date/port code for import lines — ITC on import IGST is claimed against the **BOE, not the supplier invoice**. Landed-cost allocation deferred until imports materialize. **[IN-8]** | Supplier `gst_category='overseas'` → BOE fields mandatory, GSTIN checks skipped, register export shows BOE refs in place of supplier invoice keys. | S |
| FR-PUR-047 | **Debit note** against a submitted invoice (rate difference / return value leg), reversing tax + accumulator effects proportionally. | Debit note references invoice lines; register export carries it with negative values; TDS accumulator decremented. | S |

### 4.F India Statutory & GST

The statutory surface is compact enough to hard-seed — **no configurable tax engine** (anti-goal, §17.5). Tags [IN-1]–[IN-10] preserve the ten India-specific findings of the research plan.

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PUR-050 | **GST line-tax computation off the seeded 12-account matrix** (Input / Output / Reverse-Charge × CGST/SGST/IGST/Cess): intra-state (supplier GST state = plant state) → CGST+SGST split; inter-state → IGST; category-aware (composition/unregistered bill without tax; SEZ → IGST paths; overseas → BOE). **[IN-2, M10]** | Totals match hand-computed fixtures for both CGST+SGST and IGST cases (TC-GST-01/02, golden); matrix rows are seed data (§9.4), not user-editable in MVP. | M |
| FR-PUR-051 | **ITC is match-gated, not invoice-gated** (Sec 16(2)(aa): credit only if the supplier reported the invoice into the buyer's GSTR-2B). The purchase register therefore stores and exports the **five matching keys — supplier GSTIN, supplier invoice no., supplier invoice date, taxable value, tax amounts — plus HSN**, RCM flag and ITC-eligibility columns. GSTR-2B generates the 14th, GSTR-3B is due the 20th → the export serves the ~6-day reconciliation window. **[IN-1, M10]** | Register export (CSV + on-screen) reconciles line-count and tax totals against submitted invoices for any month (TC-REG-01); the five keys are non-null on every registered-supplier invoice. | M |
| FR-PUR-052 | **Reverse charge (RCM)**: checkbox on the invoice with supplier-level default and per-item/service applicability — blanket RCM does **not** apply to all unregistered purchases, only notified goods/services. The most frequent factory RCM event is **inbound GTA freight at 5%**. RCM tax posts **net-zero**: input leg + RCM-payable leg, nothing added to vendor payable. **[IN-3, M10]** | GTA freight bill at 5% posts net-zero GST with input+RCM legs and vendor payable = taxable value only (TC-RCM-01, golden); RCM invoices flagged in the register; unregistered non-notified purchases post no tax. | M |
| FR-PUR-053 | **HSN/SAC mandatory on B2B GST documents** — 4-digit (AATO ≤ ₹5 cr) or 6-digit (above), configured per company; HSN from the item master, SAC on service lines. **[IN-4]** | Confirmed PO / submitted invoice lines without HSN/SAC → 422; digit-length validated against company AATO config; register groups by HSN. | M |
| FR-PUR-054 | **Ineligible ITC** (Sec 17(5) blocked credits): item-level flag; the tax amount auto-loads into item cost instead of the input-tax accounts. Rules 42/43 apportionment = out of scope (bloat). **[IN-5, M10]** | Flagged item's invoice tax posts to cost (posting event shows stock/expense value incl. tax, no input-GST leg); register marks the row ITC-ineligible. | M |
| FR-PUR-055 | **TDS on goods — 194Q**: 0.1% above ₹50 lakh cumulative per seller per FY, computed **only on the excess**, via a per-vendor FY accumulator **with opening balance** (for mid-year go-live). Renumbered **Sec 393(1)** under the Income-tax Act 2025 (effective 1-Apr-2026) — **the section label is a parameter, not a hard-code**. **[IN-6, M10]** | Crossing ₹50 lakh mid-invoice computes TDS only on the excess (TC-TDS-01, golden); labels render from `statutory_param` (demo FY 2026-27 shows "393(1) [erstwhile 194Q]"); accumulator update is row-locked (NFR-04). | M |
| FR-PUR-056 | **TDS on services/job-work — 194C** (fires far more often for this client): 1% (individual/HUF) / 2% (others) with **₹30,000 single-bill / ₹1,00,000 annual thresholds**; crossing the annual threshold applies TDS to the full FY aggregate (catch-up). **[IN-6, M10]** | Threshold fixtures pass (TC-TDS-02, golden); per-vendor per-section FY totals queryable for TDS returns; missing PAN → higher-rate warning (Sec 206AA), computed but flagged for Finance. | M |
| FR-PUR-057 | **MSME / Section 43B(h)**: dues to Micro & Small enterprises are tax-deductible only if paid within **15 days (no written agreement) / 45 days (with agreement)** of acceptance. A/P ageing against the 15/45-day clock; supplier master carries MSME status + Udyam no. + has-written-agreement flag. Cheap, high-credibility — the client's auditor will ask. **[IN-7]** | Ageing report per §11.7 (TC-MSME-01); day-45 (or 15) breach never occurs silently: T-7/T-3/T-0 alerts; payment-proposal list sorts MSME-critical first. | M |
| FR-PUR-058 | **Statutory parameter table** (`statutory_param`): TDS rates/thresholds/section labels, RCM GTA rate, MSME day-counts, HSN digit rule — all effective-dated config, editable without deploy. (GST rules drift; the 194Q→393(1) renumbering is live proof.) | Changing a rate creates a new effective-dated row; computations pick the row valid on the document date; audit on every change. | M |

### 4.G Replenishment & Material Requests

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PUR-060 | **Material Request doctype** with purpose enum (**purchase / transfer / issue / manufacture / subcontract**) as the single inbound boundary from Stores, Production and Planning; statuses draft → pending → partially_ordered → ordered / stopped. | MRs with purpose≠purchase route to Inventory/Production and are read-only here; MR lines carry ordered_qty; short-close (`stopped`) preserves history. | M |
| FR-PUR-061 | **Nightly reorder → draft-MR job**: for reorder-managed items, if projected qty (on-hand + on-order − reserved, from the Module 5 API) ≤ reorder level → add to one consolidated draft MR per warehouse (ERPNext's auto-Material-Request precedent; Zoho only alerts — ERPNext is the stronger pattern). Idempotent; skips items already covered by an open MR/PO line; **excludes MRP-planned items** (Planning conflict guard V-08). | Job drafts exactly the below-level items in the fixture warehouse and no others (TC-REO-01, golden); runs via Celery beat 01:30 IST; visible in the workbench by 07:00; re-run same night creates nothing new. | S |
| FR-PUR-062 | **MR → PO conversion** (bulk): group selected MR lines by preferred supplier, auto-fill from terms; MR statuses recompute from per-line ordered qty. | Convert 10 lines across 3 suppliers → 3 draft POs < 5 s; peg preserved (`source_mr_line`). | M |
| FR-PUR-063 | **Planning PR consumption**: `planning.pr.created` events surface in the MR queue (typed as Planning requisitions) and convert to POs the same way, preserving `source_pr` for Planning's peg tree. | PR → PO conversion answers Planning's pegging ("PO-2026-0421 exists because PLO-2026-04412"); PO confirm/close feeds back to requisition status. | M |

### 4.H Reports & KPIs

| ID | Requirement | Acceptance criteria | Pri |
|----|-------------|--------------------|-----|
| FR-PUR-070 | **Purchase register** (on-screen + CSV): month/FY filter; columns = the five GSTR-2B keys + HSN + RCM + ITC-eligibility + GST heads + TDS. **[IN-1]** | Export of a 1,000-invoice month < 15 s (streamed); totals row reconciles to invoice sums (TC-REG-01). | M |
| FR-PUR-071 | **MSME ageing report**: rows per unpaid MSME invoice with acceptance date, applicable clock (15/45), days consumed, days left, buckets (green > 7 d, amber ≤ 7 d, red overdue). | Matches TC-MSME-01 fixture; drill to invoice; export for the auditor. | M |
| FR-PUR-072 | **KPI tiles** (formulas fixed): **PO cycle time** = avg(receipt − requisition date); **supplier defect rate** = rejected ÷ received qty; **OTD/OTIF** = on-time ÷ total deliveries (OTIF = OT% × IF%, multiplied not averaged); **PPV** = (standard − actual price) × qty; **emergency-purchase rate** = flagged ÷ total POs. Benchmarks (provenance-flagged, Appendix A.2): cycle < 24 h routine; defect < 1% critical suppliers; OTD 95%+ strategic; PPV ±2–5%; emergency < 5%. | Tiles match hand-computed fixture values on the seed set (§20.14); each tile drills to its underlying rows. | S |
| FR-PUR-073 | **Expected receipts / overdue views**: receipts due this week per supplier; overdue PO lines with days late (feeds expediting + OTD). | Same dataset drives the receiving queue calendar and the pipeline overdue chips. | M |
| FR-PUR-074 | **Supplier ledger view** (documents + payments + TDS per vendor per FY) supporting TDS-certificate data and vendor reconciliation phone calls. | Per-vendor FY statement exportable; ties to accumulator totals to the rupee. | S |

---

## 5. Non-functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01 | **Interactive latency** | p95 < 300 ms for lists/grids; PO confirm (incl. GST computation + pending-GRN spawn + event publish) < 1 s; pipeline board < 500 ms at 2,000 open documents; supplier-card stats < 400 ms (pre-aggregated). |
| NFR-02 | **Register & report throughput** | Purchase-register export: 1,000-invoice month < 15 s, 12-month FY < 60 s (server-side cursor + streamed CSV — never materialized in app memory). MSME ageing < 2 s at 500 open invoices. |
| NFR-03 | **Batch-job window** | Nightly chain (reorder scan → MR draft → supplier stats refresh → accumulator reconciliation check) completes < 5 min at the scale envelope, scheduled via Celery beat (01:30 IST), each step idempotent and independently re-runnable. |
| NFR-04 | **Concurrency & consistency** | Duplicate-invoice guard enforced by a **partial unique index — the DB is the arbiter** under concurrent submits (unique-violation mapped to 409). TDS FY-accumulator updates use `SELECT … FOR UPDATE` (two simultaneous invoices near the ₹50-lakh line must serialize — TC-TDS-03). GRN and invoice both updating `po_line.received_qty/billed_qty` rely on row-level locks; PO status derivation reads committed sums. One GRN submit per PO at a time (advisory lock). |
| NFR-05 | **Auditability & immutability** | Every submit/confirm/cancel/approve/hold is an immutable audit row (who, when, before/after JSON). Submitted documents accept no field updates (service layer + DB trigger belt-and-braces). `posting_event` and `audit_log` are append-only — the app role has no UPDATE/DELETE grant on them. |
| NFR-06 | **Data migration** | CSV import (suppliers/items/terms): 1,000 + 5,000 rows < 60 s with per-row error reports and dry-run mode; import is restartable and idempotent on natural keys. (38% of ERP failures trace to data migration — this is a launch-blocking capability, not a convenience.) |
| NFR-07 | **Offline tolerance (plant reality)** | Factory internet drops for minutes, not hours. Mutations are idempotent (client-generated `request_id` dedupe) so retries are safe; the receiving queue and expected-receipts list are cached read-through for same-day data; GRN entry survives a 30 s outage without data loss (local form state + retry); printable fallbacks (PO PDF, receiving checklist) for total outage. Full offline-first sync is explicitly out of scope. |
| NFR-08 | **Scale envelope (SME)** | 500 suppliers, 10k items, 20k item-supplier terms, 2,500 POs/yr, 8k GRN lines/yr, 6k invoices/yr, 5 plants (data-scoped), 50 concurrent users. All indexes sized for 5 years of data without partitioning. |
| NFR-09 | **Availability & ops** | Single-VM Docker Compose demo; pilot 99.5% business-hours; nightly `pg_dump` + WAL archiving; on-prem installable. |
| NFR-10 | **Localization & formatting** | UI strings externalized (en, hi at launch; ta next — Kaveri is a Tamil-speaking plant); ₹ with lakh/crore grouping; dates DD-MM-YYYY; FY = April–March everywhere (one shared `fy_of(date)` utility). |
| NFR-11 | **DPDP & data posture** | Supplier PII minimal (PAN, bank) — masked in lists, full view role-gated, excluded from LLM context unless the tool call requires it; on-prem tenants can disable external LLM calls (deterministic fallbacks per §13); no data leaves the plant if the customer opts out. |
| NFR-12 | **Statutory drift resilience** | All rates, thresholds and **section labels** live in effective-dated `statutory_param` rows (FR-PUR-058) — a Finance-role config change, never a deploy. Computations resolve parameters as-on document date, so historical documents re-render correctly after a change. |

---

## 6. UI/UX Flow — the procurement officer's day

The module opens on the **Purchase Workbench** (worklist-first principle from the shared design system). Anand's core daily loop:

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ 1. Workbench │ → │ 2. Triage MR │ → │ 3. Create /  │ → │ 4. Chase     │ → │ 5. Invoices  │ → │ 6. Compliance│
│  pipeline +  │   │  queue (re-  │   │  confirm POs │   │  receipts —  │   │  & matching  │   │  strip: MSME │
│  alert strip │   │  order drafts│   │  (terms auto-│   │  overdue     │   │  (chips, not │   │  clock · TDS │
│              │   │  + Planning  │   │  fill, MD    │   │  chips, GRN  │   │  blocks) +   │   │  meter · 2B  │
│              │   │  PRs + MRs)  │   │  approval)   │   │  queue w/ QC │   │  payment run │   │  register    │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
        ↑                                                                                              │
        └────────── GRN submits / invoice submits / reorder breaches re-feed the workbench ◄───────────┘
```

**A concrete morning (demo-day, Mon 13-Jul-2026):**
1. Anand opens the Workbench: 14 open POs on the board, 2 overdue chips, alert strip shows *"MSME: Sri Balaji ₹92,040 due in 7 days"* and *"Venkatramana FY value at 97% of ₹50 L — next bill attracts 393(1) TDS"*.
2. MR queue holds the nightly draft MR-2026-0068 (2 items below reorder) and a Planning PR for casting blanks. He bulk-selects, hits **Convert → PO**; lines auto-fill from terms; one PO ≥ ₹1 L routes to Venkat's phone for approval.
3. Poongodi's receiving queue already lists today's expected lorries; she books a partial GRN (60 of 100 castings), rejects 10 with a failed QI → quarantine.
4. The GRN flips the PO card to "Awaiting Invoice"; when Sri Balaji's bill arrives, Anand hits **Get Receipt Lines** — one line chips amber (price variance ₹2/pc); he submits anyway and toggles hold pending a credit note. *Flag, don't block.*
5. Lakshmi reviews the payment proposal: MSME-critical invoices sort first; held invoices are absent; TDS shows per-section. Month-end she exports the purchase register — "this is what your CA reconciles 2B against."

**Principles (shared design system):**
- **Worklist-first.** The workbench is a to-do list (drafts to send, approvals waiting, receipts overdue, invoices unmatched, MSME deadlines), not a menu.
- **Guided guarded actions.** Confirm, Submit, Approve, Hold are single deliberate buttons with an inline consequence summary ("Confirming will notify Stores and lock lines; GST total ₹43,920").
- **Chips over dialogs.** Match exceptions, overdue, emergency, RCM, MSME status render as coloured chips with hover detail; nothing modal unless money moves.
- **Command bar** (top-centre): global search + "✦ ask purchasing" (English/Hindi) — "VRL ka freight bill kahan hai?", "where are my bearings?".
- **Mobile:** MD approval cards, receiving queue + GRN entry (tablet), MSME alert list, pipeline read-only. PO editor, invoice matching and the register are desktop-only.
- **Breadcrumbs & drill:** MR ↔ PO ↔ GRN ↔ QI ↔ Invoice ↔ Payment; parallel drill by supplier into the Supplier Card; every entity URL-addressable for pegging and AI citations.

---

## 7. Screen-by-Screen Design

### 7.1 Purchase Workbench / Pipeline Tracker (module home)
- **Layout:** KPI strip (open POs, overdue receipts, unmatched invoices, MSME dues ≤ 7 d, MTD spend ₹) → **pipeline board**: columns **Draft/RFQ → Confirmed → Awaiting GRN → Awaiting Invoice → Done (30 d)**; cards show PO no., supplier, value, required-by, chips (overdue · emergency · hold · advance · blanket-release). Right rail: alert strip (MSME clock, TDS threshold, price anomalies, reorder MR drafted).
- **Key components:** `<PipelineBoard>`, `<AlertStrip>`, `<KpiCard>` row.
- **Actions:** card click → PO editor/viewer; drag is **not** supported (statuses are computed, the board is a projection — a deliberate contrast with kanban CRMs); filter by supplier/item/buyer/plant; "New PO", "New MR" buttons; board/table toggle (table = TanStack grid with saved filters).
- **Empty/error states:** first-run empty state offers "Import suppliers (CSV)" and "Create first PO" CTAs; event-lag banner if pipeline projection is > 60 s stale.
- **Mobile:** read-only board + alert strip; card opens summary sheet.

### 7.2 PO Editor
- **Layout:** header card (supplier picker with GSTIN/category/MSME badges + terms preview, order date, required-by, warehouse default, currency, emergency toggle + reason, blanket-order selector when supplier has a live contract, advance field) → **line grid** (item, description, qty, purchase UoM, conversion factor visible, rate with `rate_source` chip [terms/blanket/manual], HSN/SAC, GST %, line taxable, CGST/SGST/IGST auto-split, warehouse) → footer: taxable total, GST summary by rate, grand total, **approval banner** when ≥ threshold.
- **Key components:** `<SupplierPicker>`, `<POLineGrid>` (TanStack Table + editable cells, Excel-like keyboard nav), `<GstSummaryCard>`, `<Last5BuysPopover>`, `<ApprovalBanner>`.
- **Actions:** Save draft · Print RFQ · **Confirm** (guarded: validations V-PUR-01..09, then consequence summary) · Request approval (auto when ≥ threshold) · Cancel/Amend (post-confirm) · Hold · Short-close (from viewer).
- **Empty/error states:** no terms for item+supplier → inline "no negotiated rate — entering manual" notice; GSTIN-invalid supplier blocks confirm with a link to fix the master; blanket over-release warning inline on the line.
- **Mobile:** viewer only + approve/reject sheet for the MD (value, lines peek, vendor OTD/rejection chips, FY-value meter).

### 7.3 Receiving Screen (GRN)
- **Layout:** left = **pending-receipts queue** (auto-spawned from confirmed POs; grouped by expected date, then supplier; overdue first). Main = GRN form: header (PO ref, supplier, challan no./date, vehicle no., posting date) + line grid: ordered / already-received / **this-receipt qty**, **accepted | rejected split**, accepted warehouse (default main), rejected warehouse (locked to quarantine), **batch no. (auto) + supplier lot/heat no.**, QI chip (required/pending/done-verdict).
- **Key components:** `<ReceivingQueue>`, `<GrnLineSplit>`, `<BatchCapture>`, `<QiChip>`.
- **Actions:** Book receipt (draft) · Start QI (when gated) · **Submit** (runs QC gate + over-receipt tolerance + posts both ledger legs atomically) · Create return (from submitted GRN).
- **Empty/error states:** queue empty → "no receipts expected today"; over-tolerance entry → inline 422 with the allowed max; QI-pending submit → blocked with pending-QI list; ledger-API failure → GRN stays draft with a retry banner (idempotent request id — NFR-07).
- **Mobile/tablet:** the primary surface — big touch targets for qty entry, camera capture of the supplier challan (attachment only in MVP).

### 7.4 Quality Inspection (QI) Form
- **Layout:** header (GRN line ref, item, batch, sample size auto-suggested from lot size) + readings grid (parameter, spec min/max, reading, pass/fail auto) + verdict block (accepted qty / rejected qty + rejection reason enum: dimensional / visual / material cert / other).
- **Key components:** `<QiReadingsGrid>`, `<VerdictBlock>`.
- **Actions:** Save · Complete (locks the QI, writes verdict back to the GRN line split) · Print inspection report (goes into the supplier-quality file).
- **Empty/error states:** completing with readings missing → per-row error; verdict quantities must sum to the GRN line receipt qty (V-PUR-10).
- **Mobile/tablet:** yes — inspections happen at the receiving bay.

### 7.5 Invoice Screen (with match chips)
- **Layout:** header (supplier, **supplier invoice no. + date — mandatory**, posting date, RCM checkbox [defaulted from supplier], TDS section display + computed amount, hold toggle + reason, BOE fields when overseas) → **Get Receipt Lines** dialog (un-billed receipt lines with checkboxes) → line grid: item/service, SAC when service, qty, rate, **match chip per line** (🟢 ok / 🟡 price_var / 🟡 qty_var / 🔴 no_receipt, hover = expected vs actual), GST split columns → footer: taxable, CGST/SGST/IGST/Cess, TDS (−), advance adjusted (−), **net payable**, rounding row.
- **Key components:** `<GetReceiptLinesDialog>`, `<InvoiceMatchChips>`, `<TdsComputationPopover>` (shows accumulator math: "FY value ₹48,70,000 + this bill ₹2,44,000 → excess over ₹50,00,000 = ₹1,14,000 × 0.1% = ₹114"), `<DuplicateGuardBanner>`.
- **Actions:** Save draft · **Submit** (duplicate guard → match computation → GST/TDS/RCM postings → accumulator update) · Hold/Release (reason) · Record payment · Create debit note.
- **Empty/error states:** duplicate → 409 banner linking the existing invoice; no receipt lines available → "nothing to bill from receipts — add service lines or check GRNs"; match exceptions → amber toast "submitted with 1 price variance — visible in the exception report" (never a block).
- **Mobile:** read-only + hold/release for Finance.

### 7.6 Supplier Card
- **Layout:** identity block (name, GSTIN + validity tick, GST category & state, PAN, MSME badge + Udyam no., TDS section chip with current label "393(1)") · terms block (payment days, lead time, currency, has-written-agreement) · **stats block: OTD % and rejection % (with sample counts) + trend sparklines** · **FY purchase-value meter vs ₹50-lakh threshold** (amber ≥ 90%) · **MSME ageing strip** (open invoices vs their 15/45-day clocks) · tabs: Terms (item rates), Documents (POs/GRNs/invoices), Ledger (FY statement), Price history.
- **Key components:** `<FyThresholdMeter>`, `<MsmeAgeingStrip>`, `<VendorStatsBlock>`, `<TermsTable>`.
- **Actions:** Edit master (role-gated; GSTIN re-validation on change) · Add/edit terms · Export FY ledger · "✦ Supplier risk summary" (AI narrative, §13.1).
- **Empty/error states:** < 5 GRNs → stats show "insufficient history (n=3)" instead of misleading percentages; unregistered supplier → GSTIN block replaced by category explainer.

### 7.7 Material Requests & Reorder Queue
- **Layout:** tabbed list: **Drafted by reorder job** (nightly, grouped by warehouse) / **From Planning (PRs)** / **From Production** / **Manual**. Row: item, qty, purpose, warehouse, required-by, source peg chip, status. Detail drawer shows projected-stock math for reorder rows ("on-hand 92 + on-order 0 − reserved 0 = 92 ≤ ROP 140").
- **Actions:** Edit draft qty · Submit MR · **Bulk Convert → PO** (grouped by preferred supplier, confirmation summary: "3 POs will be drafted for 2 suppliers") · Stop (short-close with reason).
- **Empty/error states:** conversion without preferred supplier or terms → per-line "pick supplier" prompt; MRP-governed item appearing here is impossible by guard V-08 — if data drift ever surfaces one, a data_warning banner appears instead of a silent draft.
- **Mobile:** approve/submit list.

### 7.8 MSME Ageing (43B(h)) Report
- **Layout:** summary tiles (total MSME outstanding ₹, due ≤ 7 d, overdue) → table: supplier (MSME class + Udyam), invoice, acceptance date, clock (15/45 + agreement flag), day count, **days left**, amount, payment status; bucket colouring green/amber/red; group-by supplier toggle.
- **Actions:** Export (auditor CSV) · jump to payment entry pre-filtered · "✦ Explain 43B(h)" (plain-language statutory explainer with the specific rows cited).
- **Empty/error states:** no MSME suppliers flagged → CTA "mark MSME suppliers — your auditor will ask" linking a bulk-edit list.

### 7.9 Purchase Register
- **Layout:** month/FY picker + summary header (invoice count, taxable, CGST/SGST/IGST/Cess, RCM subtotal, ineligible-ITC subtotal) → virtualized table with **exactly the export columns**: supplier GSTIN · supplier invoice no. · supplier invoice date · taxable value · CGST · SGST · IGST · Cess · HSN summary · RCM flag · ITC-eligible flag · BOE ref (imports) · our invoice ref.
- **Actions:** **Export CSV** (streamed) · column totals toggle · drill any row to the invoice · "✦ 2B reconciliation explainer" (upload GSTR-2B CSV → deterministic diff → narrated, §13.3).
- **Empty/error states:** month with unposted drafts shows a "n drafts excluded" notice; export re-runs are byte-identical for a closed month (regression-tested).

### 7.10 KPI Dashboard
- **Layout:** KPI cards (design-system standard: big number, plain label, trend delta, sparkline): **PO cycle time · Supplier defect rate · OTD % · PPV ₹ · Emergency-PO rate · Invoice-exception rate**; charts: monthly spend by supplier (top-10 bar), spend by item group (donut), match-exception trend line, MSME outstanding trend, FY TDS deducted by section.
- **Actions:** every card drills to its row set; date-range picker; plant filter.
- **Empty/error states:** tiles render "—" with "insufficient data (< 1 month)" rather than fake zeros.

---

## 8. Navigation

Second-level in-module rail (persistent left, under the IND-CORE module rail):

```
Purchase
├─ Workbench                (home — pipeline board + alert strip; rail badge = actionable count)
├─ Material Requests        (tabs: Reorder-drafted · Planning PRs · Production · Manual)
├─ Purchase Orders          (list + board toggle)
├─ Rate Contracts           (blanket orders)
├─ Receipts (GRN)
│   └─ Quality Inspections
├─ Invoices
│   └─ Debit Notes
├─ Payments
├─ Suppliers                (masters + terms + cards)
├─ Reports
│   ├─ Purchase Register
│   ├─ MSME Ageing (43B(h))
│   ├─ Expected / Overdue Receipts
│   └─ Supplier Ledger & TDS
└─ Dashboard
```

- **Module home = Workbench** — the "what needs me now" surface, per the worklist-first design rule. The rail badge counts actionables (approvals waiting + overdue receipts + unmatched invoices + MSME ≤ 7 d).
- **Breadcrumbs** on every screen: `Purchase › Orders › PO-2026-0412 › GRN-2026-0231 › QI-2026-0088`.
- **Deep links:** every entity URL-addressable (`/purchase/po/PO-2026-0412`, `/purchase/suppliers/SUP-0007`, `/purchase/register?fy=2026&month=6`) — enabling peg navigation from Planning, notification taps, and AI-answer citations.
- **Keyboard patterns:** `g w` workbench · `g o` orders · `g r` receipts · `g i` invoices · `n p` new PO · `n m` new MR · `/` command bar; line grids use Excel muscle memory (Enter commits + moves down, Tab across, Ctrl+D copy-down); `.` on any document opens the action menu.
- **Role-based landing:** Procurement → Workbench; Stores → Receiving queue; Finance → Invoices (unmatched filter); MD → mobile approvals; Sales/CSR → pipeline (read-only).

---

## 9. Database Schema (PostgreSQL 16)

Expands the research plan's compact model verbatim — **every entity and column of that model survives here**, hardened with types, constraints and indexes. All tables carry `plant_id` scoping and `created_at / updated_at / created_by` audit columns (omitted below for brevity except where structural). Monetary columns are `NUMERIC(14,2)` (₹), quantities `NUMERIC(14,4)`, rates `NUMERIC(14,4)`.

**Design rules (carried over from the whole-MVP research plan, enforced at this layer):**
1. **Statuses are always computed, never edited** — lifecycle transitions happen only through endpoint-driven state machines; fulfilment statuses derive from child-quantity sums (§11.2).
2. **Documents are immutable after submit** — cancel-and-amend, never update (service layer + belt-and-braces trigger rejecting UPDATE on submitted rows' business columns).
3. **Every stock effect goes through the Module 5 Inventory ledger API** (`INVENTORY.md` §5) — Purchase owns no stock-quantity column anywhere.
4. **Commitment / stock / liability three-posting separation** — PO posts nothing, GRN posts stock/GRNI, Invoice posts AP + taxes; all as `posting_event` rows the future GL can replay.

### 9.1 Masters

```sql
-- ============ SUPPLIER ============
CREATE TABLE supplier (
  supplier_id    BIGSERIAL PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,                -- 'SUP-0007'
  name           TEXT NOT NULL,
  gstin          CHAR(15),
  gst_state      CHAR(2),                             -- '33' = TN; drives intra/inter split
  gst_category   TEXT NOT NULL DEFAULT 'registered'
                 CHECK (gst_category IN ('registered','unregistered','composition','sez','overseas')),
  rcm_default    BOOLEAN NOT NULL DEFAULT FALSE,      -- e.g. GTA vendors
  pan            CHAR(10),
  tds_section    TEXT CHECK (tds_section IN ('194Q','194C')),  -- display label via statutory_param
  tds_deductee   TEXT CHECK (tds_deductee IN ('individual_huf','other')),  -- 194C 1% vs 2%
  msme_status    TEXT NOT NULL DEFAULT 'none'
                 CHECK (msme_status IN ('none','micro','small','medium')),
  udyam_no       TEXT,                                -- 'UDYAM-TN-08-0012345'
  msme_written_agreement BOOLEAN NOT NULL DEFAULT FALSE,   -- 43B(h): 15 vs 45 days
  payment_terms_days SMALLINT NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
  lead_time_days SMALLINT NOT NULL DEFAULT 7 CHECK (lead_time_days >= 0),
  currency       CHAR(3) NOT NULL DEFAULT 'INR',
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  -- GSTIN format guard (check-digit verified in service layer, V-PUR-01):
  CONSTRAINT ck_gstin_format CHECK (gstin IS NULL OR
    gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$'),
  CONSTRAINT ck_gstin_state  CHECK (gstin IS NULL OR left(gstin, 2) = gst_state),
  CONSTRAINT ck_gstin_presence CHECK (
    CASE WHEN gst_category IN ('unregistered','overseas') THEN gstin IS NULL
         ELSE gstin IS NOT NULL END),
  CONSTRAINT ck_udyam CHECK ((msme_status = 'none') = (udyam_no IS NULL)),
  CONSTRAINT ck_tds_needs_pan CHECK (tds_section IS NULL OR pan IS NOT NULL)
);
COMMENT ON TABLE supplier IS
  'OTD%/rejection%/FY value are computed (v_supplier_stats + vendor_fy_accumulator), never stored here.';

-- ============ ITEM (Engineering-owned; Purchase adds columns via migration) ============
-- ALTER TABLE item ADD COLUMN ... :
--   purchase_uom TEXT, hsn_code TEXT, gst_rate NUMERIC(5,2),
--   inspection_required BOOLEAN NOT NULL DEFAULT FALSE,
--   ineligible_itc BOOLEAN NOT NULL DEFAULT FALSE,          -- Sec 17(5): tax loads to cost
--   reorder_level NUMERIC(14,4), reorder_qty NUMERIC(14,4),
--   preferred_supplier_id BIGINT REFERENCES supplier,
--   last_purchase_rate NUMERIC(14,4),                        -- auto-updated on invoice submit
--   over_receipt_tolerance_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
--   tracking_mode TEXT NOT NULL DEFAULT 'none' CHECK (tracking_mode IN ('none','batch'))
CREATE INDEX idx_item_reorder ON item (plant_id)
  WHERE reorder_level IS NOT NULL AND is_active;             -- nightly reorder scan

CREATE TABLE uom_conversion (
  id        BIGSERIAL PRIMARY KEY,
  item_id   BIGINT NOT NULL REFERENCES item,
  uom       TEXT NOT NULL,                                   -- purchase UoM, e.g. 'KG'
  factor    NUMERIC(14,6) NOT NULL CHECK (factor > 0),       -- stock units per 1 purchase unit
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,             -- supersede, never edit (V-PUR-06)
  UNIQUE (item_id, uom, valid_from)
);
COMMENT ON TABLE uom_conversion IS 'Ledger always posts in stock UoM: stock_qty = doc_qty x factor.';

-- ============ ITEM x SUPPLIER PURCHASE TERMS (M4 — auto-fills PO lines) ============
CREATE TABLE item_supplier_terms (
  id             BIGSERIAL PRIMARY KEY,
  item_id        BIGINT NOT NULL REFERENCES item,
  supplier_id    BIGINT NOT NULL REFERENCES supplier,
  purchase_uom   TEXT NOT NULL,
  rate           NUMERIC(14,4) NOT NULL CHECK (rate >= 0),   -- per purchase UoM, excl. GST
  lead_time_days SMALLINT NOT NULL DEFAULT 7,
  min_order_qty  NUMERIC(14,4) CHECK (min_order_qty > 0),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (item_id, supplier_id)
);

CREATE TABLE price_history (                                  -- feeds PPV, last-5-buys, AI anomaly
  id          BIGSERIAL PRIMARY KEY,
  item_id     BIGINT NOT NULL REFERENCES item,
  supplier_id BIGINT NOT NULL REFERENCES supplier,
  doc_type    TEXT NOT NULL CHECK (doc_type IN ('po','invoice')),
  doc_ref     TEXT NOT NULL,
  rate        NUMERIC(14,4) NOT NULL,
  uom         TEXT NOT NULL,
  doc_date    DATE NOT NULL
);
CREATE INDEX idx_price_hist ON price_history (item_id, supplier_id, doc_date DESC);
```

### 9.2 Demand intake & contracts

```sql
-- ============ MATERIAL REQUEST ============
CREATE TABLE material_request (
  mr_id        BIGSERIAL PRIMARY KEY,
  mr_no        TEXT NOT NULL UNIQUE,                          -- 'MR-2026-0068'
  purpose      TEXT NOT NULL
               CHECK (purpose IN ('purchase','transfer','issue','manufacture','subcontract')),
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','pending','partially_ordered','ordered','stopped')),
  requested_by BIGINT,                                        -- user; NULL = reorder job
  source       TEXT NOT NULL DEFAULT 'manual'
               CHECK (source IN ('manual','reorder_job','planning_pr','production')),
  required_by  DATE,
  plant_id     BIGINT NOT NULL
);
CREATE TABLE mr_line (
  id           BIGSERIAL PRIMARY KEY,
  mr_id        BIGINT NOT NULL REFERENCES material_request ON DELETE CASCADE,
  item_id      BIGINT NOT NULL REFERENCES item,
  qty          NUMERIC(14,4) NOT NULL CHECK (qty > 0),
  uom          TEXT NOT NULL,
  warehouse_id BIGINT NOT NULL,
  ordered_qty  NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (ordered_qty >= 0),
  source_pr    TEXT                                           -- Planning requisition ref (peg)
);
CREATE INDEX idx_mr_open ON material_request (plant_id, status)
  WHERE status IN ('draft','pending','partially_ordered');

-- ============ BLANKET / RATE ORDER ============
CREATE TABLE blanket_order (
  blanket_id  BIGSERIAL PRIMARY KEY,
  bo_no       TEXT NOT NULL UNIQUE,                           -- 'BO-2026-003'
  supplier_id BIGINT NOT NULL REFERENCES supplier,
  valid_from  DATE NOT NULL,
  valid_to    DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('draft','active','expired','closed')),
  CHECK (valid_to >= valid_from)
);
CREATE TABLE blanket_line (
  id           BIGSERIAL PRIMARY KEY,
  blanket_id   BIGINT NOT NULL REFERENCES blanket_order ON DELETE CASCADE,
  item_id      BIGINT NOT NULL REFERENCES item,
  rate         NUMERIC(14,4) NOT NULL,
  uom          TEXT NOT NULL,
  agreed_qty   NUMERIC(14,4) NOT NULL CHECK (agreed_qty > 0),
  released_qty NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (released_qty >= 0),
  UNIQUE (blanket_id, item_id)
);
```

### 9.3 The document chain

```sql
-- ============ PURCHASE ORDER ============
CREATE TABLE purchase_order (
  po_id        BIGSERIAL PRIMARY KEY,
  po_no        TEXT NOT NULL UNIQUE,                          -- 'PO-2026-0412'
  supplier_id  BIGINT NOT NULL REFERENCES supplier,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','confirmed','on_hold','locked','closed','cancelled')),
               -- draft doubles as RFQ (M3); 'locked' = fully received+billed (computed transition);
               -- 'closed' = short-closed remainder; fulfilment substatus derives per §11.2
  order_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  required_by  DATE,
  currency     CHAR(3) NOT NULL DEFAULT 'INR',
  advance_paid NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (advance_paid >= 0),
  is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
  emergency_reason TEXT,
  approval_required BOOLEAN NOT NULL DEFAULT FALSE,           -- set when total >= threshold
  approved_by  BIGINT, approved_at TIMESTAMPTZ,
  blanket_id   BIGINT REFERENCES blanket_order,               -- release against rate contract
  amended_from BIGINT REFERENCES purchase_order,              -- cancel-and-amend chain
  hold_reason  TEXT,
  plant_id     BIGINT NOT NULL,
  CONSTRAINT ck_emergency_reason CHECK (NOT is_emergency OR emergency_reason IS NOT NULL)
);
CREATE INDEX idx_po_pipeline ON purchase_order (plant_id, status, required_by)
  WHERE status IN ('draft','confirmed','on_hold');            -- the tracker board scan

CREATE TABLE po_line (
  po_line_id   BIGSERIAL PRIMARY KEY,
  po_id        BIGINT NOT NULL REFERENCES purchase_order ON DELETE CASCADE,
  line_no      SMALLINT NOT NULL,
  item_id      BIGINT REFERENCES item,                        -- NULL for free-text service lines
  is_service   BOOLEAN NOT NULL DEFAULT FALSE,
  description  TEXT NOT NULL,
  qty          NUMERIC(14,4) NOT NULL CHECK (qty > 0),
  uom          TEXT NOT NULL,
  conversion_factor NUMERIC(14,6) NOT NULL DEFAULT 1 CHECK (conversion_factor > 0),
  rate         NUMERIC(14,4) NOT NULL CHECK (rate >= 0),
  rate_source  TEXT NOT NULL DEFAULT 'manual'
               CHECK (rate_source IN ('terms','blanket','manual')),
  hsn_or_sac   TEXT NOT NULL,                                 -- V-PUR-07: mandatory at confirm
  gst_rate     NUMERIC(5,2) NOT NULL DEFAULT 0,
  warehouse_id BIGINT,                                        -- NULL for service lines
  received_qty NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (received_qty >= 0),  -- stock UoM basis
  billed_qty   NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (billed_qty >= 0),
  returned_qty NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (returned_qty >= 0),
  source_mr_line BIGINT REFERENCES mr_line,                   -- peg to MR
  source_pr    TEXT,                                          -- peg to Planning requisition
  UNIQUE (po_id, line_no),
  CONSTRAINT ck_service_shape CHECK (
    (is_service AND warehouse_id IS NULL) OR (NOT is_service AND item_id IS NOT NULL))
);
COMMENT ON COLUMN po_line.received_qty IS 'Sum of accepted GRN qty in stock UoM; PO status derives from these — never edited directly.';

-- ============ GRN ============
CREATE TABLE grn (
  grn_id       BIGSERIAL PRIMARY KEY,
  grn_no       TEXT NOT NULL UNIQUE,                          -- 'GRN-2026-0231'
  po_id        BIGINT NOT NULL REFERENCES purchase_order,
  supplier_id  BIGINT NOT NULL REFERENCES supplier,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','to_bill','completed','return_issued','closed','cancelled')),
  posting_date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_challan_no  TEXT,
  supplier_challan_date DATE,
  vehicle_no   TEXT,
  ledger_txn_ref TEXT,                                        -- Module 5 ledger transaction id
  plant_id     BIGINT NOT NULL
);
CREATE INDEX idx_grn_queue ON grn (plant_id, status) WHERE status IN ('draft','to_bill');

CREATE TABLE grn_line (
  grn_line_id  BIGSERIAL PRIMARY KEY,
  grn_id       BIGINT NOT NULL REFERENCES grn ON DELETE CASCADE,
  po_line_id   BIGINT NOT NULL REFERENCES po_line,
  qty_accepted NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (qty_accepted >= 0),
  qty_rejected NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (qty_rejected >= 0),
  accepted_warehouse_id BIGINT NOT NULL,
  rejected_warehouse_id BIGINT,                               -- quarantine; required if qty_rejected > 0
  batch_no     TEXT,                                          -- internal batch (auto)
  supplier_lot_ref TEXT,                                      -- supplier lot / heat number
  rejection_reason TEXT,
  qi_id        BIGINT,                                        -- FK added after quality_inspection
  CONSTRAINT ck_some_qty CHECK (qty_accepted + qty_rejected > 0),
  CONSTRAINT ck_reject_wh CHECK (qty_rejected = 0 OR rejected_warehouse_id IS NOT NULL)
);

-- ============ QUALITY INSPECTION (the QC gate, M6) ============
CREATE TABLE quality_inspection (
  qi_id        BIGSERIAL PRIMARY KEY,
  qi_no        TEXT NOT NULL UNIQUE,                          -- 'QI-2026-0088'
  grn_line_id  BIGINT NOT NULL REFERENCES grn_line,
  item_id      BIGINT NOT NULL REFERENCES item,
  sample_size  SMALLINT NOT NULL CHECK (sample_size > 0),
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','completed')),
  verdict_accepted_qty NUMERIC(14,4),
  verdict_rejected_qty NUMERIC(14,4),
  inspected_by BIGINT, completed_at TIMESTAMPTZ
);
ALTER TABLE grn_line ADD CONSTRAINT fk_grn_line_qi
  FOREIGN KEY (qi_id) REFERENCES quality_inspection (qi_id);

CREATE TABLE qi_reading (
  id        BIGSERIAL PRIMARY KEY,
  qi_id     BIGINT NOT NULL REFERENCES quality_inspection ON DELETE CASCADE,
  parameter TEXT NOT NULL,                                    -- 'Bore dia (mm)'
  spec_min  NUMERIC(14,4), spec_max NUMERIC(14,4),
  reading   NUMERIC(14,4),
  passed    BOOLEAN
);

-- ============ PURCHASE INVOICE ============
CREATE TABLE purchase_invoice (
  pi_id        BIGSERIAL PRIMARY KEY,
  pi_no        TEXT NOT NULL UNIQUE,                          -- 'PINV-2026-0187'
  supplier_id  BIGINT NOT NULL REFERENCES supplier,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','unpaid','partly_paid','paid','cancelled')),
               -- 'overdue' is a computed predicate (due_date < today AND status != paid), never stored
  supplier_inv_no   TEXT NOT NULL,                            -- mandatory (IN-1)
  supplier_inv_date DATE NOT NULL,
  -- Indian FY start year, generated for the duplicate guard (Apr-Mar):
  fy_start     SMALLINT GENERATED ALWAYS AS (
                 CASE WHEN EXTRACT(MONTH FROM supplier_inv_date) >= 4
                      THEN EXTRACT(YEAR FROM supplier_inv_date)::smallint
                      ELSE (EXTRACT(YEAR FROM supplier_inv_date) - 1)::smallint END) STORED,
  posting_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date     DATE,                                          -- posting_date + supplier terms
  is_rcm       BOOLEAN NOT NULL DEFAULT FALSE,
  taxable_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  cgst NUMERIC(14,2) NOT NULL DEFAULT 0,  sgst NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst NUMERIC(14,2) NOT NULL DEFAULT 0,  cess NUMERIC(14,2) NOT NULL DEFAULT 0,
  tds_section  TEXT,                                          -- resolved at submit from supplier
  tds_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  advance_adjusted NUMERIC(14,2) NOT NULL DEFAULT 0,
  rounding     NUMERIC(6,2) NOT NULL DEFAULT 0,
  grand_total  NUMERIC(14,2) NOT NULL DEFAULT 0,              -- payable incl. GST (excl. RCM tax)
  hold_flag    BOOLEAN NOT NULL DEFAULT FALSE,
  hold_reason  TEXT,
  boe_no TEXT, boe_date DATE, boe_port TEXT,                  -- imports: ITC against BOE (IN-8)
  msme_acceptance_date DATE,                                  -- 43B(h) clock anchor (§11.7)
  plant_id     BIGINT NOT NULL,
  CONSTRAINT ck_hold_reason CHECK (NOT hold_flag OR hold_reason IS NOT NULL)
);
-- THE duplicate-invoice guard (M7): normalized number, per supplier, per Indian FY.
-- Partial unique index = race-safe under concurrent submits; cancelled invoices free the slot.
CREATE UNIQUE INDEX uq_pi_supplier_invno_fy ON purchase_invoice
  (supplier_id, regexp_replace(upper(supplier_inv_no), '[^A-Z0-9]', '', 'g'), fy_start)
  WHERE status <> 'cancelled';
CREATE INDEX idx_pi_open ON purchase_invoice (plant_id, status, due_date)
  WHERE status IN ('unpaid','partly_paid');                   -- payment runs, overdue, MSME ageing
CREATE INDEX idx_pi_register ON purchase_invoice (plant_id, fy_start, posting_date);

CREATE TABLE pi_line (
  pi_line_id   BIGSERIAL PRIMARY KEY,
  pi_id        BIGINT NOT NULL REFERENCES purchase_invoice ON DELETE CASCADE,
  po_line_id   BIGINT REFERENCES po_line,
  grn_line_id  BIGINT REFERENCES grn_line,
  item_id      BIGINT REFERENCES item,
  is_service   BOOLEAN NOT NULL DEFAULT FALSE,
  description  TEXT NOT NULL,
  sac_code     TEXT,                                          -- service lines (IN-3/IN-4)
  qty          NUMERIC(14,4) NOT NULL CHECK (qty > 0),
  uom          TEXT NOT NULL,
  rate         NUMERIC(14,4) NOT NULL CHECK (rate >= 0),
  taxable      NUMERIC(14,2) NOT NULL,
  gst_rate     NUMERIC(5,2) NOT NULL DEFAULT 0,
  cgst NUMERIC(14,2) NOT NULL DEFAULT 0,  sgst NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst NUMERIC(14,2) NOT NULL DEFAULT 0,  cess NUMERIC(14,2) NOT NULL DEFAULT 0,
  itc_eligible BOOLEAN NOT NULL DEFAULT TRUE,                 -- FALSE => tax loaded to cost (IN-5)
  match_status TEXT NOT NULL DEFAULT 'ok'
               CHECK (match_status IN ('ok','price_var','qty_var','no_receipt','na_service')),
  CONSTRAINT ck_service_line CHECK (
    (is_service AND sac_code IS NOT NULL AND grn_line_id IS NULL)
    OR (NOT is_service AND item_id IS NOT NULL))
);

-- ============ PAYMENTS ============
CREATE TABLE payment (
  payment_id   BIGSERIAL PRIMARY KEY,
  pay_no       TEXT NOT NULL UNIQUE,                          -- 'PAY-2026-0143'
  pi_id        BIGINT NOT NULL REFERENCES purchase_invoice,
  amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  pay_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  mode         TEXT NOT NULL CHECK (mode IN ('neft','rtgs','upi','cheque','cash')),
  utr_ref      TEXT,
  tds_deducted NUMERIC(14,2) NOT NULL DEFAULT 0,
  plant_id     BIGINT NOT NULL
);

-- ============ PURCHASE RETURN (challan + e-way, IN-9) ============
CREATE TABLE purchase_return (
  pr_id        BIGSERIAL PRIMARY KEY,
  ret_no       TEXT NOT NULL UNIQUE,                          -- 'PRET-2026-0012'
  grn_id       BIGINT NOT NULL REFERENCES grn,
  supplier_id  BIGINT NOT NULL REFERENCES supplier,
  challan_no   TEXT NOT NULL,                                 -- Delivery Challan
  challan_date DATE NOT NULL,
  eway_bill_no TEXT,                                          -- above threshold
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','issued','cancelled')),
  plant_id     BIGINT NOT NULL
);
CREATE TABLE purchase_return_line (
  id           BIGSERIAL PRIMARY KEY,
  pr_id        BIGINT NOT NULL REFERENCES purchase_return ON DELETE CASCADE,
  grn_line_id  BIGINT NOT NULL REFERENCES grn_line,
  qty          NUMERIC(14,4) NOT NULL CHECK (qty > 0)         -- <= accepted qty (V-PUR-13)
);
```

### 9.4 Statutory & support tables

```sql
-- ============ TDS FY ACCUMULATOR (194Q / 393(1), IN-6) ============
CREATE TABLE vendor_fy_accumulator (
  id             BIGSERIAL PRIMARY KEY,
  supplier_id    BIGINT NOT NULL REFERENCES supplier,
  fy_start       SMALLINT NOT NULL,                           -- 2026 = FY 2026-27
  opening_value  NUMERIC(14,2) NOT NULL DEFAULT 0,            -- mid-year go-live opening balance
  purchase_value NUMERIC(14,2) NOT NULL DEFAULT 0,            -- cumulative taxable value (excl. GST)
  tds_deducted   NUMERIC(14,2) NOT NULL DEFAULT 0,
  UNIQUE (supplier_id, fy_start)
);
COMMENT ON TABLE vendor_fy_accumulator IS
  'Updated under SELECT ... FOR UPDATE at invoice submit (NFR-04); basis for excess-only TDS (§11.4).';

-- ============ GST ACCOUNT MATRIX — seeded 12 rows, not user-editable in MVP (IN-2) ============
CREATE TABLE gst_account (
  id           SMALLSERIAL PRIMARY KEY,
  gst_type     TEXT NOT NULL CHECK (gst_type IN ('input','output','rcm')),
  tax_head     TEXT NOT NULL CHECK (tax_head IN ('cgst','sgst','igst','cess')),
  account_code TEXT NOT NULL UNIQUE,
  account_name TEXT NOT NULL,
  UNIQUE (gst_type, tax_head)
);
INSERT INTO gst_account (gst_type, tax_head, account_code, account_name) VALUES
  ('input' ,'cgst','1451','Input CGST'),
  ('input' ,'sgst','1452','Input SGST'),
  ('input' ,'igst','1453','Input IGST'),
  ('input' ,'cess','1454','Input Cess'),
  ('output','cgst','2451','Output CGST'),
  ('output','sgst','2452','Output SGST'),
  ('output','igst','2453','Output IGST'),
  ('output','cess','2454','Output Cess'),
  ('rcm'   ,'cgst','2461','RCM Payable CGST'),
  ('rcm'   ,'sgst','2462','RCM Payable SGST'),
  ('rcm'   ,'igst','2463','RCM Payable IGST'),
  ('rcm'   ,'cess','2464','RCM Payable Cess');

-- ============ STATUTORY PARAMETERS — effective-dated, no-deploy changes (FR-PUR-058) ============
CREATE TABLE statutory_param (
  id           BIGSERIAL PRIMARY KEY,
  param_code   TEXT NOT NULL,
  valid_from   DATE NOT NULL,
  valid_to     DATE,
  value_numeric NUMERIC(14,4),
  value_text   TEXT,
  UNIQUE (param_code, valid_from)
);
INSERT INTO statutory_param (param_code, valid_from, valid_to, value_numeric, value_text) VALUES
  ('tds_goods_rate_pct',      '2021-07-01', NULL,        0.1,     NULL),
  ('tds_goods_threshold',     '2021-07-01', NULL,        5000000, NULL),
  ('tds_goods_section_label', '2021-07-01','2026-03-31', NULL,    '194Q'),
  ('tds_goods_section_label', '2026-04-01', NULL,        NULL,    '393(1)'),  -- IT Act 2025 renumbering
  ('tds_194c_single_threshold','2016-06-01', NULL,       30000,   NULL),
  ('tds_194c_annual_threshold','2016-06-01', NULL,       100000,  NULL),
  ('tds_194c_rate_individual','2016-06-01', NULL,        1,       NULL),
  ('tds_194c_rate_other',     '2016-06-01', NULL,        2,       NULL),
  ('rcm_gta_rate_pct',        '2017-07-01', NULL,        5,       NULL),
  ('msme_days_no_agreement',  '2023-04-01', NULL,        15,      NULL),
  ('msme_days_agreement',     '2023-04-01', NULL,        45,      NULL),
  ('hsn_min_digits',          '2021-04-01', NULL,        4,       NULL),      -- 6 above Rs 5 cr AATO
  ('approval_threshold_inr',  '2026-04-01', NULL,        100000,  NULL);

-- ============ ACCOUNTS STUB — append-only posting events (three-posting separation) ============
CREATE TABLE posting_event (
  event_id   BIGSERIAL PRIMARY KEY,
  doc_type   TEXT NOT NULL CHECK (doc_type IN ('grn','invoice','payment','return','debit_note')),
  doc_ref    TEXT NOT NULL,
  event_type TEXT NOT NULL,          -- 'stock_in','grni','ap','gst_input','rcm','tds','reversal',...
  legs       JSONB NOT NULL,         -- [{account:'1451', dr: 21960.00}, {account:'GRNI', cr: ...}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- App role: INSERT + SELECT only (REVOKE UPDATE, DELETE) — replayable by a future GL.

-- ============ AUDIT & NUMBERING ============
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  doc_type TEXT NOT NULL, doc_id BIGINT NOT NULL,
  action   TEXT NOT NULL,            -- create/submit/confirm/approve/cancel/hold/release/amend
  actor_id BIGINT NOT NULL,
  at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  before_state JSONB, after_state JSONB
);
CREATE INDEX idx_audit_doc ON audit_log (doc_type, doc_id, at);

CREATE TABLE doc_sequence (          -- per doc-type, per calendar/financial year series
  doc_type TEXT NOT NULL, year_key TEXT NOT NULL, next_no INT NOT NULL DEFAULT 1,
  PRIMARY KEY (doc_type, year_key)
);
```

**Cardinality & flow notes**
- `material_request → mr_line → po_line (source_mr_line)` and `po_line.source_pr` keep the peg chain walkable end-to-end: Planning's PLO → PR → PO line → GRN line → invoice line.
- `po_line.received_qty / billed_qty / returned_qty` are maintained transactionally by GRN/invoice/return submits (row-locked); **all PO fulfilment statuses derive from them** (§11.2).
- Scheduled receipts for Planning = a view `v_expected_receipts` over open confirmed `po_line`s (qty − received_qty, at `required_by`), consumed by `PLANNING.md` §9's `v_scheduled_receipts`.
- Supplier stats = materialized view `v_supplier_stats` (OTD %, rejection %, sample counts — §11.9), refreshed nightly + on GRN submit.
- Volumes at the SME envelope (NFR-08) need no partitioning; the two hot partial indexes (`idx_po_pipeline`, `idx_pi_open`) keep the workbench and payment queries index-only.

---

## 10. API Design (REST, OpenAPI via FastAPI)

Base: `/api/v1/purchase`. JWT bearer (access/refresh), RBAC-scoped per §14. All list endpoints: cursor pagination, `?filter=`, `?sort=`. Mutations audited and idempotent via `X-Request-Id` (NFR-07). **There is no `PATCH …/status` anywhere** — statuses move only through the verbs below.

### 10.1 Suppliers & masters
```
GET/POST  /suppliers                       GET/PUT /suppliers/{id}     (PUT re-validates GSTIN)
GET       /suppliers/{id}/stats            # {otd_pct, rejection_pct, samples, fy_value, threshold_pct}
GET       /suppliers/{id}/ledger?fy=       # documents + payments + TDS statement
POST      /suppliers/validate-gstin        # {gstin} → {valid, state, check_digit_ok, live:"not_configured"}
POST      /imports/suppliers|items|terms   # multipart CSV/XLSX; ?dry_run=true → row-level report
GET/POST  /item-supplier-terms             GET/PUT /item-supplier-terms/{id}
GET       /items/{id}/price-history?supplier_id=&limit=5
GET/PUT   /items/{id}/purchase-fields      # reorder level/qty, HSN, flags — Purchase-owned columns only
```

### 10.2 Material Requests & requisitions
```
GET/POST  /material-requests?purpose=&status=&source=
POST      /material-requests/{id}/submit | /stop
POST      /material-requests/convert       # {mr_line_ids[]} → grouped by preferred supplier
                                           # → {draft_pos:[{po_id, supplier, lines}], unassigned:[...]}
GET       /requisitions?source=planning    # Planning PRs surfaced in the MR queue (read + convert)
```

### 10.3 Purchase Orders
```
GET/POST  /purchase-orders                 GET /purchase-orders/{id}
PUT       /purchase-orders/{id}            # drafts only; 409 after confirm (FR-PUR-022)
POST      /purchase-orders/{id}/confirm    # validations → approval check → spawn pending GRN → events
POST      /purchase-orders/{id}/approve | /reject      # threshold approval (MD)
POST      /purchase-orders/{id}/cancel | /hold | /unhold | /close   # close = short-close remainder
POST      /purchase-orders/{id}/amend      # cancel-and-amend → new draft {amended_from}
GET       /purchase-orders/{id}/print?fmt=pdf          # RFQ watermark when draft
GET       /pipeline?plant_id=&supplier_id=&item_id=    # tracker board dataset (M12)
```

**Sample — create + confirm:**
```jsonc
POST /purchase-orders
{ "supplier_id": 7, "required_by": "2026-07-18", "plant_id": 1,
  "lines": [ { "item_id": 231, "qty": 400, "uom": "KG" } ] }        // rate omitted → terms lookup
→ 201
{ "po_id": 412, "po_no": "PO-2026-0412", "status": "draft",
  "lines": [ { "line_no": 1, "item_id": 231, "qty": 400, "uom": "KG",
               "rate": 610.0, "rate_source": "blanket", "hsn_or_sac": "7403",
               "gst_rate": 18.0, "conversion_factor": 1.0 } ],
  "totals": { "taxable": 244000.00, "cgst": 21960.00, "sgst": 21960.00,
              "igst": 0.00, "grand_total": 287920.00 },
  "approval_required": true }                                        // ≥ ₹1,00,000 threshold

POST /purchase-orders/412/confirm
→ 409 { "error": "approval_pending", "approver_role": "md" }         // until approved
→ 200 { "status": "confirmed", "pending_grn_id": 231,
        "events": ["purchase.po.confirmed"] }
```

### 10.4 GRN & Quality
```
GET       /grns?status=&supplier_id=       GET /grns/{id}
GET       /receiving-queue?plant_id=       # pending receipts (auto-spawned), grouped by expected date
PUT       /grns/{id}                       # drafts only
POST      /grns/{id}/submit                # QC gate → tolerance checks → Module 5 ledger post (atomic)
POST      /grns/{id}/cancel
GET/POST  /quality-inspections             POST /quality-inspections/{id}/complete
GET       /expected-receipts?from=&to=     # calendar dataset; also feeds Planning's scheduled receipts
```

### 10.5 Invoices & payments
```
GET/POST  /invoices                        GET /invoices/{id}
GET       /invoices/receipt-lines?supplier_id=       # "Get Receipt Lines": unbilled accepted qty
POST      /invoices/{id}/submit            # duplicate guard → match calc → GST/TDS/RCM → accumulator
POST      /invoices/{id}/hold | /release   # {reason} required on hold
POST      /invoices/{id}/cancel            # frees the duplicate-guard slot; reverses postings
GET       /invoices/exceptions?month=      # all non-ok match lines (the advisory report, M8)
POST      /payments                        # {pi_id, amount, mode, utr_ref} → TDS check, status recompute
GET       /payment-proposal?date=          # unpaid − held, MSME-critical first (§11.7)
POST      /debit-notes                     # against invoice lines; reversal postings
```

**Sample — invoice submit response (match chips + TDS math made visible):**
```jsonc
POST /invoices/187/submit
→ 200
{ "pi_no": "PINV-2026-0187", "status": "unpaid", "due_date": "2026-08-09",
  "lines": [ { "line": 1, "match_status": "ok" },
             { "line": 2, "match_status": "price_var",
               "expected_rate": 240.00, "billed_rate": 252.00, "tolerance_pct": 2.0 } ],
  "tax":  { "basis": "intra_state", "cgst": 21960.00, "sgst": 21960.00, "igst": 0 },
  "tds":  { "section": "194Q", "label": "393(1)", "fy_base_before": 4870000.00,
            "threshold": 5000000.00, "excess_taxed": 114000.00, "rate_pct": 0.1,
            "amount": 114.00 },
  "accumulator": { "supplier_id": 7, "fy_start": 2026, "purchase_value": 5114000.00 },
  "warnings": [ "1 line submitted with price_var — see /invoices/exceptions" ] }
```

### 10.6 Returns, contracts, register & jobs
```
GET/POST  /purchase-returns                POST /purchase-returns/{id}/issue   # challan + e-way fields
GET/POST  /blanket-orders                  GET /blanket-orders/{id}            # released vs agreed per line
GET       /register?fy=&month=             # purchase register dataset; &format=csv streams the export
GET       /reports/msme-ageing             GET /reports/kpis?from=&to=
POST      /jobs/reorder-run                # manual trigger of the nightly job (also Celery beat)
GET       /jobs/reorder-run/{run_id}       # idempotent result: {mr_id|null, items_drafted[], skipped[]}
```

### 10.7 AI endpoints (read-only tools; §13)
```
POST /ai/ask                    # {question, lang:"en"|"hi"} → grounded answer + citations[]
POST /ai/supplier-brief/{id}    # deterministic stats pack → narrative {text_en, text_hi, evidence[]}
POST /ai/price-check            # {po_line_id} → {zscore, verdict, history[], text}
POST /ai/reconcile-2b           # multipart GSTR-2B CSV → deterministic diff + narrated summary
```

### 10.8 Events (internal bus — Redis Streams)

| Event | Producer → Consumer | Effect |
|---|---|---|
| `purchase.po.confirmed` | Purchase → Inventory, Planning, Production | Pending receipt enters Inventory's expected-receipts queue; Planning's scheduled-receipts view refreshes; Production sees inbound supply dates |
| `purchase.po.closed` / `purchase.po.cancelled` | Purchase → Inventory, Planning | Remaining on-order qty released from projections (short-close payload carries remaining qty per line) |
| `purchase.grn.submitted` | Purchase → Inventory, Planning, Quality | Ledger rows confirmed (accepted + quarantine); Planning receives the (promised, actual) lead-time learning sample (`grn.posted` in `PLANNING.md` §10.8); supplier stats refresh |
| `purchase.invoice.submitted` | Purchase → Accounts stub, Finance dashboards | Posting events (AP, GST input matrix, TDS, RCM legs); register/KPI invalidation |
| `purchase.payment.posted` | Purchase → Accounts stub | MSME clock closure for the invoice; accumulator TDS-deposited tracking |
| `purchase.return.issued` | Purchase → Inventory, Accounts stub | Reversal ledger rows + reversal posting-event pair |
| `purchase.mr.drafted` | Purchase (reorder job) → workbench, notifications | Draft MR appears in the queue; Procurement notified pre-08:00 |
| `planning.pr.created` | Planning → Purchase (consumed) | Requisition surfaces in the MR queue for conversion (peg preserved) |
| `production.mr.created` | Production → Purchase (consumed) | Shortage-driven MR (purpose=purchase) enters triage |
| `inventory.qty.adjusted` | Inventory → Purchase (consumed) | Reorder projections use fresh on-hand next nightly run |

---

## 11. Backend Logic

The purchase engine lives in `services/purchase/` (Python 3.12; synchronous request path for document logic, `default` Celery queue for jobs). Pure-function cores with thin I/O shells — every algorithm below is unit-testable without a DB. **Statutory numbers resolve from `statutory_param` as-on document date; nothing below hard-codes a rate.**

### 11.1 GST computation (intra vs inter-state, category-aware)

```python
def compute_line_tax(line, supplier, plant_state, params) -> TaxSplit:
    """Every rupee of GST in the module flows through this one function."""
    if supplier.gst_category in ('unregistered', 'composition'):
        return TaxSplit.zero()          # neither may charge tax on the bill;
                                        # RCM on notified supplies handled in 11.5
    if supplier.gst_category == 'overseas':
        return TaxSplit.zero()          # import IGST arrives via Bill of Entry (IN-8)

    tax = round2(line.taxable * line.gst_rate / 100)
    if supplier.gst_state == plant_state and supplier.gst_category != 'sez':
        return TaxSplit(cgst=round2(tax / 2), sgst=round2(tax / 2))   # intra-state
    return TaxSplit(igst=tax)            # inter-state; SEZ supplies are IGST by law

def compute_document_tax(doc):
    heads = sum_by_head(compute_line_tax(l, ...) for l in doc.lines)
    doc.rounding = round0(doc.taxable + heads.total) - (doc.taxable + heads.total)
    # invoice-level rounding to the rupee, shown as an explicit rounding row
```
- Posting accounts come from the seeded matrix: eligible ITC → `input` row per head; `itc_eligible=False` → tax merges into the stock/expense leg (load-to-cost, IN-5); RCM → §11.5.
- Golden fixtures: TC-GST-01 (intra: 2,44,000 @ 18% → 21,960 + 21,960), TC-GST-02 (inter: 95,000 @ 18% → IGST 17,100).

### 11.2 Derived PO status (never edited)

```python
def derive_fulfilment(po) -> str:
    """Runs inside the same transaction as any GRN/invoice/return submit that
    touched this PO's lines (rows already locked)."""
    lines = [l for l in po.lines if not l.is_service or l.qty > 0]
    recv_done = all(l.received_qty >= l.qty * (1 - EPS) or l.short_closed for l in lines)
    bill_done = all(l.billed_qty  >= min(l.received_qty_accepted, l.qty) * (1 - EPS)
                    or l.short_closed for l in lines)
    if recv_done and bill_done: return 'completed'      # → lifecycle transition to 'locked'
    if recv_done:               return 'to_bill'
    if bill_done:               return 'to_receive'     # bill-before-receipt variant
    return 'to_receive_and_bill'
```
Truth table (TC-PO-01): ordered 100 → GRN 60 → `to_receive_and_bill` (40 open); GRN 100 → `to_bill`; invoice 100 → `completed`, PO auto-locks. Short-close marks open remainders `short_closed` and re-derives. Quantities compare **in stock UoM** (conversion applied once at write time, not per query).

### 11.3 Advisory 3-way match (flag, don't block — M8)

```python
def match_line(pi_line, params) -> str:
    if pi_line.is_service:
        return 'na_service'                       # services legitimately have no GRN (GTA freight)
    if pi_line.grn_line_id is None:
        return 'no_receipt'                       # red chip
    if pi_line.rate > po_rate(pi_line) * (1 + params.price_tol_pct / 100):
        return 'price_var'                        # amber; default tol 2%
    if billed_to_date(pi_line.po_line_id) + pi_line.qty \
       > accepted_to_date(pi_line.po_line_id) * (1 + params.qty_tol_pct / 100):
        return 'qty_var'                          # amber; default tol 0%
    return 'ok'
```
- Computed at submit and recomputed when a later GRN closes a `no_receipt` gap (event-driven re-flag).
- **Never blocks**: 22% of invoices are exceptions industry-wide; a hard block spawns parallel processes (Appendix A.2). The enforcement instruments are the exception report, the hold flag, and Finance's eyes.

### 11.4 TDS engine (194Q/393(1) accumulator + 194C thresholds; labels parameterized)

```python
def compute_tds(invoice, supplier, params) -> TdsResult:
    if supplier.tds_section is None:
        return TdsResult.none()
    base = invoice.taxable_value            # TDS on value EXCLUDING GST when GST is
                                            # separately indicated (CBDT Circular 13/2021)
    if supplier.tds_section == '194Q':      # goods — 0.1% above ₹50L per seller per FY
        acc = lock_accumulator(supplier.id, fy_start(invoice.supplier_inv_date))  # FOR UPDATE
        before = acc.opening_value + acc.purchase_value
        after  = before + base
        thr    = params.tds_goods_threshold                    # 50,00,000
        taxed  = max(0, after - thr) - max(0, before - thr)    # ONLY the excess (TC-TDS-01)
        amount = round2(taxed * params.tds_goods_rate_pct / 100)
        acc.purchase_value += base; acc.tds_deducted += amount
        label  = params.tds_goods_section_label                # '393(1)' from 01-Apr-2026

    elif supplier.tds_section == '194C':    # services / job work — fires far more often here
        fy_paid = fy_contract_total(supplier.id, fy_start(invoice.supplier_inv_date))
        crossed_single = base > params.tds_194c_single_threshold          # ₹30,000
        crossed_annual = fy_paid + base > params.tds_194c_annual_threshold  # ₹1,00,000
        rate = params.tds_194c_rate_individual if supplier.tds_deductee == 'individual_huf' \
               else params.tds_194c_rate_other                             # 1% / 2%
        if crossed_annual and fy_paid <= params.tds_194c_annual_threshold:
            taxed = fy_paid + base        # catch-up: full FY aggregate on first crossing
        elif crossed_single or fy_paid > params.tds_194c_annual_threshold:
            taxed = base
        else:
            taxed = 0
        amount = round2(taxed * rate / 100); label = '194C'    # label parameterized likewise

    if supplier.pan is None:
        flag_higher_rate_warning(invoice)   # Sec 206AA: higher-rate TDS; Finance resolves
    return TdsResult(section=supplier.tds_section, label=label, amount=amount, taxed=taxed)
```
- Accumulator opening balance supports mid-year go-live (client's pre-system purchases keyed once at setup).
- Two invoices racing near the threshold serialize on the accumulator row lock (TC-TDS-03).

### 11.5 RCM posting (net-zero; GTA freight 5%)

```python
def post_rcm(invoice, split: TaxSplit):
    """Buyer self-assesses the tax; vendor is paid taxable value only."""
    emit_posting(invoice, 'rcm', legs=[
        dr(input_account(head), amt)  for head, amt in split.nonzero()] + [
        cr(rcm_account(head),  amt)   for head, amt in split.nonzero()])
    # vendor payable (AP leg) = taxable value; GST NOT added to grand_total
```
- Golden fixture TC-RCM-01: VRL GTA freight ₹8,000 @ 5% IGST (KA→TN, place of supply = recipient) → Input IGST Dr 400 / RCM Payable IGST Cr 400; vendor payable exactly ₹8,000; **net GST effect zero** at invoice time (cash payment of RCM happens in GSTR-3B, outside MVP).
- Supplier `rcm_default=TRUE` pre-ticks the checkbox; per-line applicability editable — blanket RCM does **not** apply to all unregistered purchases (only notified goods/services), enforced as a soft warning, not an auto-tax.

### 11.6 Duplicate-invoice guard

```python
def guard_duplicate(invoice):
    # normalization mirrors the DB index expression exactly:
    norm = re.sub(r'[^A-Z0-9]', '', invoice.supplier_inv_no.upper())
    # the partial unique index (supplier_id, norm, fy_start) WHERE status<>'cancelled'
    # is the arbiter — app-level SELECT is only for a friendly 409 with the existing ref
    try:
        insert_or_update(invoice)
    except UniqueViolation:
        raise Conflict(409, existing=find_existing(invoice.supplier_id, norm, fy))
    fuzzy_warn_if(same_supplier_same_amount_within_7_days(invoice))   # soft warning only
```
Typos defeat naive checks (Xelix): `"SB/1042"`, `"sb-1042 "` and `"SB 1042"` all normalize identically. Cancelled invoices free the slot (amend flow).

### 11.7 MSME 43B(h) ageing clock

```python
def msme_due(invoice, supplier, params) -> MsmeDue | None:
    if supplier.msme_status not in ('micro', 'small'):
        return None                                   # 'medium' is outside 43B(h)
    accept = invoice.msme_acceptance_date \
             or earliest_grn_date(invoice) \
             or invoice.supplier_inv_date             # services: bill date
    days   = params.msme_days_agreement if supplier.msme_written_agreement \
             else params.msme_days_no_agreement       # 45 / 15
    due    = accept + timedelta(days=days)
    return MsmeDue(accept=accept, clock=days, due=due,
                   days_left=(due - today()).days,
                   bucket='red' if due < today() else 'amber' if due - today() <= 7d else 'green')
```
- Alerts at T-7 / T-3 / T-0; the payment-proposal list sorts `days_left` ascending for MSME rows first.
- The report is disclosure-grade: the auditor's 43B(h) question is answered by one export (TC-MSME-01).

### 11.8 Nightly reorder → draft-MR job (Celery beat 01:30 IST)

```python
def reorder_run(plant_id) -> ReorderResult:
    drafted, skipped = [], []
    for it in items_with_reorder_level(plant_id):          # idx_item_reorder
        if planned_by_mrp(it):                             # Planning conflict guard V-08
            skipped.append((it, 'mrp_governed')); continue
        proj = inv_api.projected_qty(it)                   # on_hand + on_order − reserved (Module 5)
        if proj > it.reorder_level:
            continue
        if open_coverage_exists(it):                       # open MR line or PO line already covers it
            skipped.append((it, 'already_covered')); continue
        drafted.append((it, max(it.reorder_qty, it.reorder_level - proj)))
    if drafted:
        mr = upsert_daily_draft_mr(plant_id, source='reorder_job', lines=drafted)  # one MR/warehouse/day
        emit('purchase.mr.drafted', mr)
    return ReorderResult(mr, drafted, skipped)             # persisted per run_id — auditable & idempotent
```
Golden fixture TC-REO-01: the job drafts **exactly** the below-level items in the fixture warehouse and no others; a second run the same night drafts nothing.

### 11.9 Supplier two-number stats (the SME scorecard reduction)

```python
OTD%       = on_time_grns / total_grns * 100          # window: trailing 365 d
             where on_time = grn.posting_date <= po.required_by + grace_days(0)
rejection% = Σ qty_rejected / Σ (qty_accepted + qty_rejected) * 100
fy_value   = accumulator.opening_value + accumulator.purchase_value
```
- Computed into `v_supplier_stats` (materialized; refreshed nightly + on `purchase.grn.submitted`); always displayed **with sample counts** — `n < 5` renders "insufficient history" instead of a percentage (honesty rule).
- ERPNext's full scorecard (weighted criteria, Preferred/Conditional/Restricted standings that can block POs) stays deferred: the two-number reduction covers the SME need (Appendix A.1).

### 11.10 Posting-event map (three-posting separation, Accounts stub)

| Trigger | Debit legs | Credit legs |
|---|---|---|
| PO confirm | — (no accounting value; on-order qty only) | — |
| GRN submit (accepted qty) | Stock (accepted wh, value = qty × rate) | GRNI (goods received, not invoiced) |
| GRN submit (rejected qty) | Stock (quarantine wh) | GRNI — reversed on return issue |
| Invoice submit (stock lines) | GRNI · Input CGST/SGST/IGST/Cess (eligible) | AP (grand total) · TDS payable |
| Invoice submit (ineligible ITC) | Stock/expense **incl. tax** (load-to-cost) | AP |
| Invoice submit (RCM) | Input GST heads | RCM payable heads (net-zero; AP = taxable only) |
| Payment | AP | Bank/Cash · (TDS payable if deducted at payment) |
| Purchase return / debit note | GRNI / AP | Stock (quarantine) / Input GST reversal |

Every row is an append-only `posting_event`; a future double-entry GL replays them without schema change.

---

## 12. Frontend Components

React 18 + TypeScript; shadcn/ui primitives; TanStack Query (server state) + TanStack Table (grids). Module component library `@ind-core/purchase-ui`:

| Component | Description & key props |
|---|---|
| `<PipelineBoard>` | The M12 tracker. Five fixed columns (Draft/RFQ → Confirmed → Awaiting GRN → Awaiting Invoice → Done), TanStack Query-fed projection, card chips (overdue/emergency/hold/advance/blanket), no drag (statuses are computed). Props: `filters, onCardOpen`. Board/table toggle shares the query cache. |
| `<AlertStrip>` | Right-rail feed (MSME clock, TDS threshold meter breach, price anomaly, reorder MR drafted); severity-sorted; each alert deep-links; dismiss = snooze with until-date. |
| `<POLineGrid>` | Editable TanStack Table: item picker cell, qty/uom with visible conversion factor, rate cell with `rate_source` chip + `<Last5BuysPopover>`, HSN cell, live GST split columns. Excel keyboard nav; optimistic edit with server re-price on blur. |
| `<SupplierPicker>` | Combobox with GSTIN/category/MSME badges inline, vendor stats mini (OTD/rejection), terms-preview footer. Warns on inactive/invalid-GSTIN vendors. |
| `<GstSummaryCard>` | Per-rate taxable/CGST/SGST/IGST/Cess rollup + rounding row; switches split display on supplier state change; renders the "why IGST?" hover (place-of-supply explainer). |
| `<ApprovalBanner>` / `<ApprovalSheet>` | Desktop banner + the MD's mobile sheet: value, lines peek, vendor stats, FY-threshold meter, one-tap approve/reject with reason; optimistic with server confirmation. |
| `<ReceivingQueue>` | Grouped list (expected date → supplier), overdue first; tablet-first layout; pull-to-refresh; opens pre-filled GRN. |
| `<GrnLineSplit>` | The accepted/rejected dual-input with running total vs ordered, tolerance meter, quarantine-warehouse lock when rejected > 0, `<BatchCapture>` (auto batch no. + supplier lot/heat) and `<QiChip>` (required/pending/verdict). |
| `<QiReadingsGrid>` | Parameter/spec/reading rows with auto pass-fail; verdict block validates sum = receipt qty. |
| `<GetReceiptLinesDialog>` | Checkbox list of unbilled accepted receipt lines (supplier-filtered), multi-GRN select, carries quantities into the invoice grid. |
| `<InvoiceMatchChips>` | Per-line chip (🟢 ok / 🟡 price_var / 🟡 qty_var / 🔴 no_receipt / ⚪ service) with hover evidence (expected vs actual, tolerance); aggregates into a header count chip. |
| `<TdsComputationPopover>` | Renders the accumulator math verbatim (base before, threshold, excess, rate, amount) — the trust-building UI for §11.4; shows the parameterized section label. |
| `<DuplicateGuardBanner>` | 409 surface: existing invoice ref, dates, amounts side-by-side; "open existing" action. |
| `<FyThresholdMeter>` | Supplier-card meter: FY value vs ₹50-lakh line, amber ≥ 90%; tooltip shows opening + YTD split. |
| `<MsmeAgeingStrip>` / `<MsmeAgeingTable>` | Clock chips per open invoice (days left vs 15/45); report table with buckets, group-by supplier, auditor CSV export. |
| `<RegisterTable>` | Virtualized month view with the exact export columns; totals row; streamed-CSV download button with progress. |
| `<CsvImportWizard>` | Upload → column mapping → dry-run report (row-level errors) → commit; shared across suppliers/items/terms. |
| `<GstinInput>` | Masked 15-char input, live format + check-digit validation, state-code cross-check against `gst_state`. |
| `<KpiCard>` / `<PurchaseDashboard>` | Shared design-system KPI cards (big number, plain label, trend, sparkline); Recharts bars/donut/lines for spend & exception trends. |
| `<AiAssistPanel>` | The "✦ AI" pattern shared platform-wide: proposal/answer + evidence rows (deep-linked chips) + language toggle EN/हिंदी; streams tokens; never a write path. |

State conventions: server state via TanStack Query (query keys per plant; `purchase.*` events → targeted invalidation over SSE); document editors use optimistic drafts with server re-validation on submit; mutations carry `X-Request-Id` for idempotent retry (NFR-07).

---

## 13. AI Features

Platform doctrine, verbatim in spirit: **numbers come from deterministic models, language comes from the LLM — the LLM never invents quantities.** Every feature below is a deterministic computation first; Claude (Anthropic API) renders explanation, translation (English + Hindi), and conversation via **tool-use over read-only module APIs** (§10.7). The "✦ AI" affordance always shows its evidence rows; answers must cite retrieved data or refuse. On-prem/DPDP tenants: LLM calls disableable — every feature degrades to its deterministic core (templated text).

### 13.1 Supplier-risk narrative
Deterministic pack: OTD %, rejection %, sample counts, FY value & threshold proximity, open exposure (unpaid + open POs), MSME clock state, price trend vs terms — assembled by `/ai/supplier-brief/{id}`. Claude writes the two-paragraph brief a buyer would want before renegotiating, in EN/HI, citing each number. Example output seeded in §20.15. *Guardrail:* the pack is the only context; no external "knowledge" about the vendor.

### 13.2 Price-anomaly flags on PO lines
Deterministic: z-score of the entered rate against `price_history` for (item, supplier) — trailing 24 months, outlier-trimmed; |z| ≥ 2 → amber chip at PO entry (advisory, consistent with flag-don't-block). LLM explains: "₹252/kg is 8.6% above your 12-month Lakshmi Steels average of ₹232 (n=9); last two buys trended up — steel index or renegotiate?" Numbers from the stats; prose from Claude.

### 13.3 GSTR-2B reconciliation explainer
Deterministic: upload the GSTR-2B CSV (as downloaded from the portal); exact-key diff against the purchase register on the five keys → three buckets (matched / in-books-not-in-2B / in-2B-not-in-books) with rupee subtotals. Claude narrates the diff and the consequence ("₹18,340 ITC at risk: 2 invoices from Sri Balaji not yet filed by supplier — call before the 20th"), EN/HI. No GSP API in MVP — the CSV is the integration.

### 13.4 Conversational "where is my order?" (EN + HI)
Command-bar assistant with tool-use over `/pipeline`, `/purchase-orders/{id}`, `/grns`, `/expected-receipts`, `/suppliers/{id}/stats`: "bearings kab aayenge?" → walks the pipeline → "PO-2026-0421 (Precision Bearings, 20 pcs 6306) confirmed today, marked emergency, expected tomorrow 14-Jul; nothing else is open for 6306." Every reference is a deep-linked chip. Sales/CSR get the same assistant read-only-scoped. pgvector embeddings over item/supplier aliases handle fuzzy Hinglish lookups ("woh casting wala order").

### 13.5 Invoice photo/email → draft invoice extraction — **roadmap (Phase 2), design now**
Claude vision extracts supplier GSTIN, invoice no./date, lines, HSN, taxes from a photographed/emailed bill into a **draft** invoice for human review (never auto-submit; duplicate guard + match run before any human accepts). Flagged roadmap because extraction QA needs a corpus of real supplier bills from the pilot; the entry screens ship first. (Shares the vision pipeline of `ENGINEERING.md` §13 BOM extraction.)

### 13.6 MSME / TDS compliance nudges
Deterministic triggers (the same ones behind §11.7 alerts and the FY meter) rendered by Claude as short actionable nudges with statute references: "Venkatramana crosses ₹50 L on the next ~₹1.3 L of purchases — from that invoice, deduct 0.1% under Sec 393(1) (erstwhile 194Q). Nothing to do now; the system will compute it." Tone: reassure + explain; never legal advice beyond the seeded rules.

### 13.7 Reorder commentary
When the nightly job drafts an MR (§11.8), Claude annotates it from the deterministic result payload: which items breached, projected vs level, preferred supplier & lead time, suggested order-by date back-computed from `required_by − lead_time`. The planner-facing sentence ("order seals by Wednesday to stay above safety stock") is language over the job's own numbers only.

---

## 14. Security

### 14.1 Role–permission matrix (create / submit-confirm / approve / cancel per doctype)

| Capability | Procurement Officer | Stores In-charge | Plant Manager | MD | Finance/CA | Sales/CSR | Admin |
|---|---|---|---|---|---|---|---|
| Supplier master & terms edit | ✔ | — | view | view | view (+PAN unmask) | — | ✔ |
| Material Request create/submit | ✔ | ✔ (issue/transfer) | ✔ | — | — | — | ✔ |
| MR stop (short-close) | ✔ | — | ✔ | — | — | — | ✔ |
| PO create/edit draft | ✔ | — | ✔ | — | — | — | ✔ |
| **PO confirm** | ✔ (below threshold) | — | ✔ (below threshold) | — | — | — | — |
| **PO approve (≥ threshold)** | — | — | — | **✔ (only role)** | — | — | — |
| PO cancel / hold / short-close | ✔ | — | ✔ | ✔ | — | — | — |
| GRN create/edit draft | view | ✔ | view | — | — | — | — |
| **GRN submit (posts stock)** | — | **✔ (only role)** | ✔ (override, audited) | — | — | — | — |
| QI complete | — | ✔ | ✔ | — | — | — | — |
| Purchase return issue | — | ✔ | ✔ | — | — | — | — |
| Invoice create/edit draft | ✔ | — | — | — | ✔ | — | — |
| **Invoice submit** | ✔ | — | — | — | ✔ | — | — |
| Invoice hold/release | ✔ (hold) | — | — | — | ✔ (hold + release) | — | — |
| Invoice cancel | — | — | — | — | ✔ | — | ✔ |
| Payment entry | propose | — | — | — | ✔ | — | — |
| Register / MSME / TDS reports | view | — | view | view | ✔ (+export) | — | ✔ |
| Pipeline tracker | ✔ | ✔ | ✔ | ✔ | ✔ | **view (read-only)** | ✔ |
| Statutory params / thresholds | — | — | — | — | ✔ | — | ✔ |
| CSV imports | ✔ | — | — | — | — | — | ✔ |

### 14.2 Controls
- **JWT access (15 min) / refresh (7 d) with RBAC claims**, enforced server-side per endpoint (FastAPI dependency); UI hides what a role can't do, the API is the wall. Plant-level data scoping in every query.
- **Immutable audit log** (append-only, no UPDATE/DELETE grants) on every create/submit/confirm/approve/cancel/hold/release/amend — who, when, before/after (NFR-05).
- **Threshold approval** is the single workflow control: `approval_threshold_inr` in `statutory_param`, MD-only approve verb, mobile-first. No workflow builder exists (anti-goal, §17.5).
- **No status PATCH**: statuses move only through the state-machine verbs (§10); a generic field-update on submitted documents returns 409 (service layer + DB trigger).
- **Separation of duties by construction:** only Stores submits GRNs (stock), only MD approves ≥ threshold (money), Finance alone releases finance-holds and cancels submitted invoices — each a different human in the pilot.
- **AI endpoints:** read-only tool scope, per-tenant isolation, PAN/bank fields excluded from LLM context, DPDP kill-switch per tenant (NFR-11).
- **Idempotency + rate limits** on mutation endpoints (`X-Request-Id` dedupe; one GRN submit per PO concurrently via advisory lock).

---

## 15. Validation Rules

| ID | Rule |
|----|------|
| V-PUR-01 | **GSTIN**: 15-char structural regex (DB CHECK) **+ check-digit algorithm** (service layer, base-36 weighted mod-36) + state-prefix ⇄ `gst_state` equality. `unregistered`/`overseas` categories must have empty GSTIN; all others must have one. |
| V-PUR-02 | **Supplier statutory completeness**: TDS section ⇒ PAN present (else 206AA higher-rate warning path); MSME status ≠ none ⇒ Udyam number present (format `UDYAM-XX-00-0000000`); composition suppliers cannot be RCM-default. |
| V-PUR-03 | **PO confirm gate**: ≥ 1 line; every line has qty > 0, rate ≥ 0, HSN/SAC, GST rate; supplier active + GSTIN valid; `required_by ≥ order_date`; approval satisfied when total ≥ threshold; blanket release within validity window. |
| V-PUR-04 | **Immutability**: business-field updates on confirmed POs / submitted GRNs / submitted invoices / completed QIs → 409 (`cancel-and-amend` is the only edit path). |
| V-PUR-05 | **UoM conversion locks**: factor > 0 (CHECK); the factor used on a document line is snapshotted onto the line; master factor changes create a superseding effective-dated row — historical documents never re-value. |
| V-PUR-06 | **Over-receipt tolerance**: Σ received (incl. this GRN) ≤ ordered × (1 + item tolerance %); breach → 422 with allowed max (golden TC-GRN-02). |
| V-PUR-07 | **QC gate**: `item.inspection_required` ⇒ GRN line needs a completed QI whose verdict quantities equal the line's receipt qty; QI readings complete before verdict. |
| V-PUR-08 | **GRN line sanity**: accepted + rejected > 0; rejected > 0 ⇒ quarantine warehouse set; batch + supplier lot mandatory for `tracking_mode='batch'` items. |
| V-PUR-09 | **Invoice mandatory keys**: supplier invoice no. + date non-empty; invoice date not in the future and within an open FY; **duplicate guard** on (supplier, normalized no., FY) — DB partial unique index is the arbiter (golden TC-INV-01). |
| V-PUR-10 | **Service lines**: SAC required, warehouse/batch forbidden, GRN link forbidden; stock lines: item + HSN required. HSN/SAC digit count per company AATO config. |
| V-PUR-11 | **Payments**: amount ≤ outstanding (grand total − paid − advance adjusted); **hold-flagged invoices are excluded from payment-proposal selection** (query-level predicate, tested TC-PAY-02); TDS override requires Finance role + reason. |
| V-PUR-12 | **RCM**: RCM tax never added to vendor payable; RCM checkbox on unregistered suppliers allowed only with an explicit notified-supply confirmation (soft-warn otherwise). |
| V-PUR-13 | **Returns**: return qty ≤ accepted qty on the source GRN line (net of prior returns); challan no./date mandatory before issue; e-way bill no. prompted above the threshold value. |
| V-PUR-14 | **Blanket releases**: cumulative released ≤ agreed qty (breach ⇒ approval escalation, not silent accept); release rate = contract rate unless variance-flagged. |
| V-PUR-15 | **Reorder job**: never drafts for MRP-governed items (Planning conflict guard V-08); never duplicates open coverage; one draft MR per warehouse per day (upsert). |
| V-PUR-16 | **Cross-document dates**: GRN posting date ≥ PO order date; invoice posting ≥ earliest linked GRN posting; payment date ≥ invoice posting — each violation 422 with the offending pair. |

---

## 16. Testing

Golden fixtures are hand-computed and double as demo data (§20.11). Engine functions (§11) are pure — unit tests need no DB except where locking is the subject.

### 16.1 GST computation (golden)
- **TC-GST-01 — intra-state (CGST+SGST)**: Kaveri plant (TN/33) buys from Venkatramana Metals (TN/33): taxable ₹2,44,000 @ 18% → **CGST ₹21,960 + SGST ₹21,960**, IGST 0; grand total ₹2,87,920; rounding row 0. Ties to the §20.11 worked example.
- **TC-GST-02 — inter-state (IGST)**: synthetic registered supplier `gst_state='27'` (MH), same plant: taxable ₹95,000 @ 18% → **IGST ₹17,100**, CGST/SGST 0.
- **TC-GST-03 — categories**: composition supplier bills ₹40,000 → zero tax, register row marked no-ITC; unregistered non-notified → zero tax; SEZ registered same-state → IGST.
- **TC-GST-04 — ineligible ITC**: `ineligible_itc` item, tax ₹1,800 → no input-GST legs; stock leg = ₹11,800 (load-to-cost); register marks ITC-ineligible.

### 16.2 PO lifecycle & statuses
- **TC-PO-01 — derived statuses (table-driven)**: order 100 → GRN 60 → `to_receive_and_bill`; GRN 40 more → `to_bill`; invoice 100 → `completed` + lifecycle `locked`. Assert no code path ever UPDATEs status directly (grep-level architecture test + 405 on PATCH).
- **TC-PO-02 — two-click creation**: item with terms → draft PO via API with only `{supplier_id, lines:[{item_id, qty}]}` → rate/UoM/HSN/GST auto-filled; ≤ 3 client actions in the Playwright flow.
- **TC-PO-03 — approval threshold**: ₹99,999 confirms directly; ₹1,00,000 → `approval_pending` 409 until MD approve; approve → confirm succeeds; audit rows present.
- **TC-PO-04 — immutability & amend**: edit after confirm → 409; amend → old cancelled + new draft with `amended_from`; short-close releases remaining qty in the `purchase.po.closed` payload.

### 16.3 GRN & QC (golden)
- **TC-GRN-01 — partial receipt (golden)**: receive **60 of 100** → PO shows "to receive and bill 40"; `received_qty=60` in stock UoM; expected-receipts view shows 40 open.
- **TC-GRN-02 — over-receipt rejection (golden)**: PO 100, tolerance 5% → GRN 106 → **422** with allowed max 105; GRN 105 passes.
- **TC-GRN-03 — QC gate**: `inspection_required` item: submit without QI → 422 listing pending QI; complete QI (verdict 55 accept / 5 reject) → submit passes with the split enforced to the verdict.
- **TC-GRN-04 — quarantine posting**: reject 10 of 50 → one atomic ledger call: +40 main store, +10 quarantine, single `ledger_txn_ref`; Purchase writes no stock rows itself (architecture test: no table access outside the Inventory client).
- **TC-UOM-01 — conversion**: EN8 rod, purchase UoM KG, factor 0.26 m/kg: receive 500 kg → ledger posts **130.0 m** in stock UoM; line shows both.

### 16.4 Invoice, duplicate guard, matching (golden)
- **TC-INV-01 — duplicate blocked (golden)**: submit supplier X, `"SB/1042"`, FY26-27 twice → second **409** referencing the first; variants `"sb-1042 "`/`"SB 1042"` also blocked; cancel the first → resubmit allowed.
- **TC-INV-02 — concurrent duplicates**: two parallel submits of the same normalized key → exactly one wins (DB unique violation on the loser) — race-safety proof for NFR-04.
- **TC-MATCH-01 — advisory chips**: rate ₹252 vs PO ₹240 (tol 2%) → `price_var`; billed 50 vs accepted 40 → `qty_var`; stock line with no GRN → `no_receipt`; freight service line → `na_service`; **all submit successfully** (flag-don't-block assertion).
- **TC-PAY-01 — payment statuses**: pay 50% → `partly_paid`; balance → `paid`; overdue is a computed predicate (no stored overdue state).
- **TC-PAY-02 — hold exclusion**: held invoice absent from `/payment-proposal`; release → present; hold requires reason.

### 16.5 TDS engine (golden)
- **TC-TDS-01 — ₹50-lakh mid-invoice crossing (golden)**: accumulator base ₹48,70,000; invoice taxable ₹2,44,000 → taxed excess **₹1,14,000 only** → TDS @ 0.1% = **₹114** (not ₹5,114 on the full base — the classic implementation bug, asserted against). Section label renders **"393(1)"** for FY 2026-27 documents and "194Q" for a back-dated FY 2025-26 fixture (parameterization proof).
- **TC-TDS-02 — 194C thresholds**: ₹28,000 bill (under both) → 0; ₹34,000 single → TDS ₹340 @1% (individual); four ₹28,000 bills → crossing ₹1,00,000 on the 4th → catch-up TDS on ₹1,12,000 = ₹1,120; subsequent bills taxed individually. Missing PAN → higher-rate warning flagged.
- **TC-TDS-03 — accumulator race**: two invoices near the threshold submitted concurrently → row lock serializes; final accumulator = sum of both; total TDS equals the sequential result.

### 16.6 RCM (golden)
- **TC-RCM-01 — GTA freight net-zero (golden)**: VRL bill ₹8,000, SAC 9965, 5% IGST RCM (KA→TN) → Input IGST Dr ₹400 / RCM Payable IGST Cr ₹400; **vendor payable exactly ₹8,000**; invoice submits with `no_receipt` suppressed (`na_service`); register row flagged RCM.

### 16.7 Replenishment (golden)
- **TC-REO-01 — exact drafting (golden)**: fixture warehouse with 5 reorder-managed items, 2 below level (one via on-order arithmetic: on-hand 92 + on-order 0 ≤ ROP 140) → the job drafts **exactly those 2** and no others; qty = max(reorder_qty, shortfall); second run same night → no new MR (idempotency); MRP-governed item present in fixture is skipped with reason `mrp_governed`.

### 16.8 MSME & register
- **TC-MSME-01 — clock math**: acceptance 05-Jun-2026, written agreement → due 20-Jul-2026; on 13-Jul: day 38, **7 days left**, bucket amber; micro supplier without agreement, acceptance 03-Jul → due 18-Jul, 5 days left; `medium` supplier excluded.
- **TC-REG-01 — register reconciliation**: seeded month exports exactly N rows = submitted invoices; taxable/CGST/SGST/IGST totals equal invoice sums to the paise; the five 2B keys non-null for registered suppliers; RCM and ineligible rows carry flags; re-export byte-identical.

### 16.9 Accounting stub & events
- **TC-ACC-01 — three-posting separation**: PO confirm emits no posting event; GRN emits stock/GRNI; invoice emits GRNI/AP/GST-input/TDS; return emits the reversal pair — replaying all `posting_event` legs nets each document chain to zero.
- **TC-EVT-01 — event contract**: confirm/submit each publish exactly-once to Redis Streams (consumer-group ack tested); Planning's `grn.posted` learning sample payload carries (promised_date, actual_date, supplier_id, item_id).

### 16.10 Non-engine
API contract tests generated from the OpenAPI schema; RBAC matrix tests per §14.1 (every forbidden cell → 403); CSV import fixture (1k suppliers incl. 50 bad rows → 950 committed + 50 row-errors); Playwright E2E of the demo script (§17.4): MR → PO → approve (mobile viewport) → GRN partial + reject → invoice with variance chip → hold → register export; load test: pipeline board at 2k open docs (NFR-01) and streamed register export at 1k invoices (NFR-02).

---

## 17. MVP Scope

### 17.1 Must-have — the minimum coherent loop (justifications carried from research)

| # | Feature | Justification from research | Where |
|---|---|---|---|
| M1 | **Supplier master** — GSTIN, GST state, GST category, RCM default, PAN, TDS section, MSME status + Udyam no., payment terms, lead time | Fields dictated by the India statutory layer (§4.F); the only master a PO strictly needs besides Item | FR-PUR-001/002 |
| M2 | **Item purchase fields** — purchase UoM + conversion factor, HSN, last-purchase price, reorder level/qty, preferred supplier, inspection-required flag, ineligible-ITC flag | Dual UoM is a verified gap: client buys strip/wire in kg, stocks in pcs/m | FR-PUR-003/004 |
| M3 | **One purchase document with a state machine** (Draft/RFQ → Confirmed → Locked/Cancelled) — *not* separate RFQ/quotation/order tables | Odoo's RFQ *is* a draft PO; MRPeasy ships RFQ as a PO status; halves pre-receipt schema and UI | FR-PUR-020 |
| M4 | **Item–supplier purchase-terms table** auto-filling PO lines | MRPeasy's two-click PO creation — the single highest-leverage table | FR-PUR-010 |
| M5 | **Auto-spawned pre-filled GRN**; per-line **accepted/rejected split → quarantine**; partial receipts via computed `received_qty`; **batch/lot capture** (supplier lot, heat no.) | Odoo receipt pattern + ERPNext QC model; batch-at-receipt is a verified gap — ISO 9001 traceability starts here | FR-PUR-030–033 |
| M6 | **QC gate**: GRN cannot submit until linked QI completes (when flagged) | ERPNext's hard gate — QC as a gate, not a parallel step | FR-PUR-034 |
| M7 | **Purchase invoice** from receipt lines; computed payment statuses; mandatory supplier inv no.+date; **duplicate guard (supplier, inv no., FY)**; payment-hold flag; service lines (SAC, no GRN) | BC structural matching; duplicate guard is a one-flag ERPNext-standard control; GTA/RCM needs the service path | FR-PUR-040–043 |
| M8 | **Computed 3-way-match flag** per line — advisory, never a hard block | Odoo ships it advisory & off-by-default; 22% exception rates mean hard blocks spawn parallel processes | FR-PUR-044 |
| M9 | **Computed PO statuses** from per-line received/billed qty | Universal derived-status pattern | FR-PUR-021 |
| M10 | **India minimum**: GST off the seeded 12-account matrix; RCM; ineligible ITC; purchase-register export (5 GSTR-2B keys + HSN); 194Q/393(1) FY accumulator (parameterized label); 194C thresholds; offline GSTIN check | §4.F items IN-1..IN-6, IN-10 | FR-PUR-050–058 |
| M11 | **Single amount-threshold approval (or none)** with immutable-after-submit | The documented over-engineering trap says stop here (Procurify post-mortem) | FR-PUR-022/023 |
| M12 | **Procurement tracker view** — "where is my order?" | ERPNext's baseline reporting deliverable; higher demo impact than dashboards of ratios | FR-PUR-025 |

### 17.2 Should-have (cheap, high leverage — MVP phase P5, all demoed)

| Feature | Justification | Where |
|---|---|---|
| Reorder → draft MR nightly job | One comparison + one draft document — the Purchase↔Inventory demo moment; ERPNext precedent for auto-drafting (Zoho only alerts) | FR-PUR-061 |
| Material Request doctype with purpose enum | The inbound boundary from Stores/Production/Planning | FR-PUR-060 |
| Supplier two-number stats (OTD %, rejection %) | The SME reduction of the scorecard, computed from GRN data already captured | FR-PUR-006 |
| Advance-paid field on PO, reconciled at invoice | Indian vendor reality (SAP B1 ships a full A/P down-payment doc; we ship the field) | FR-PUR-012 |
| Minimal blanket/rate order | Client buys metal on rate contracts; 5 of 6 suites ship it | FR-PUR-011 |
| MSME payment-ageing report (43B(h)) | Cheap, high-credibility; the auditor will ask | FR-PUR-057/071 |
| KPI tiles (cycle time, defect rate, OTD, PPV, emergency %) | Formulas computable from MVP data alone | FR-PUR-072 |
| Import BOE fields; debit notes | ITC against BOE if imports exist (pilot question B-1) | FR-PUR-046/047 |

### 17.3 Explicitly deferred (with the finding that justifies deferral)

| Deferred | Finding |
|---|---|
| Separate RFQ / Supplier-Quotation doctypes + comparison screen | SME tools omit them; NetSuite charges extra (Advanced Procurement); Odoo collapses RFQ into the PO; ERPNext's chain keeps them re-addable later as optional entry points |
| Supplier portal | Impossible/pointless single-node; no surveyed SME tool ships one |
| Multi-level / dimension approval workflows, budget commitment | Documented failure mode: build the standard flow and change policy, or people route around it via email "and you pay twice" |
| Hard-blocking 3-way match engine | 22% exception rate; Odoo advisory precedent; BC shipped for years with structural matching only |
| Full supplier scorecard (standings, PO blocking) | ERPNext precedent exists, but the two-number reduction covers the SME need |
| Landed-cost vouchers | Until imports materialize (pilot question B-1) |
| Source determination, quota arrangements, scheduling agreements, cross-company requisitions | S/4HANA-only enterprise machinery — absent from all five SMB/mid-market suites |
| GSP API integrations (live GSTIN verify, auto GSTR-2B pull, e-invoicing purchase side), Rules 42/43 apportionment, full double-entry GL | Paid APIs / statutory long tail; posting events keep the GL path open |

### 17.4 Build phases & demo script

**P1 — Masters & seed (blocks everything):** suppliers, item purchase fields, uom_conversions, item_supplier_terms + CRUD screens; **CSV import** (suppliers/terms); seed the 12-account GST matrix; GSTIN offline validator. *Acceptance:* import the pilot's real supplier + item lists from Excel; every supplier shows a valid-format GSTIN or an explicit unregistered/composition category.

**P2 — PO core:** purchase_orders/po_lines + state machine + immutable-after-confirm; line auto-fill from terms; GST computation (intra/inter split off supplier gst_state); threshold approval; pipeline tracker. *Acceptance:* PO in ≤ 3 clicks from a terms-known item; status transitions only via endpoints (no PATCH); PO totals match hand-computed GST fixtures for both CGST+SGST and IGST cases (TC-GST-01/02).

**P3 — GRN + QC:** auto-spawn pending GRN on confirm; receiving screen; accepted/rejected split → ledger postings to accepted + quarantine warehouses (Module 5 stock-entry API); batch capture; QC gate + quality_inspections; partial receipts; computed PO statuses; short-close. *Acceptance:* receive 60 of 100 → PO shows "to receive and bill 40"; reject 10 → quarantine balance +10; gated item cannot submit GRN without QI; over-receipt beyond tolerance rejected (TC-GRN-01/02/03).

**P4 — Invoice, matching, payments:** invoice from receipt lines; duplicate guard; mandatory supplier inv no./date; match chips (price/qty/no-receipt); hold flag; service lines (SAC, no GRN) incl. GTA freight RCM; payment entry with TDS; FY accumulator + 194C thresholds; RCM posting; ineligible-ITC load-to-cost. *Acceptance:* same invoice number keyed twice → blocked; freight bill with 5% RCM posts net-zero GST with input+RCM legs; crossing ₹50 lakh mid-invoice computes TDS only on the excess (TC-INV-01, TC-RCM-01, TC-TDS-01).

**P5 — India reports + replenishment + analytics:** purchase-register CSV export (5 keys + HSN + RCM + ITC columns); MSME 15/45-day ageing; nightly reorder job → draft MR; supplier two-number stats; KPI tiles; emergency flag. *Acceptance:* register export reconciles line-count and tax totals for a seeded month (TC-REG-01); reorder job drafts exactly the below-level items and no others (TC-REO-01).

**Demo script beats (in order):**
1. Two-click PO from purchase terms → MD approves on his phone → confirm.
2. Receiving queue already knows what's coming; receive partial (60/100); reject 10 to quarantine with a failed QI.
3. Invoice pulls receipt lines; one line flags a price variance; say the line: **"flag, don't block."**
4. Supplier card: OTD/rejection computed live; FY value creeping toward ₹50 lakh (meter at 97%).
5. Reorder job wakes up → draft Material Request appears — the Inventory handoff.
6. Export the GST purchase register — **"this is what your CA reconciles 2B against."**

### 17.5 Anti-goals (explicit)

- **No configurable tax engine.** Seed the 12 accounts; rates live on items and `statutory_param`. Rules 42/43, GSP APIs, purchase-side e-invoicing: out.
- **No workflow builder.** One threshold, two roles. The research says people route around anything heavier.
- **No separate RFQ/quotation subsystem.** The draft PO *is* the RFQ; comparison shopping returns in Phase 2 as optional entry points if the pilot demands it.
- **No hard-block matching.** Advisory chips + hold + report. Ever.
- **No direct stock writes, no GL.** Ledger via Module 5 only; accounting as replayable posting events.

### 17.6 Risks

| Risk | Mitigation |
|---|---|
| **UoM conversion errors** (kg strip → pcs) silently corrupt costs | Conversion factor visible on every line; snapshotted per line; unit-tested (TC-UOM-01); effective-dated supersession instead of edits (V-PUR-05) |
| **GST/TDS rules drift** (the 194Q→393(1) renumbering is live proof) | All rates/labels/thresholds in effective-dated `statutory_param` (NFR-12); computations resolve as-on document date |
| **Demo credibility** | Seed data uses the pilot's own supplier/item names imported from their Excel — not lorem ipsum (P1 acceptance criterion) |
| **Duplicate-payment slip-through via typoed invoice numbers** | Normalized DB-level guard + fuzzy same-amount warning (§11.6) |
| **Concurrent-submit races (accumulator, duplicate guard)** | DB is the arbiter: partial unique index + row locks; explicitly race-tested (TC-INV-02, TC-TDS-03) |
| **Scope creep toward enterprise procurement** | §17.3 deferral table cites the vendor precedent for every cut; anti-goals are written down |

---

## 18. Future Roadmap

| Phase | Timeline | Deliverables (each with its vendor precedent) |
|---|---|---|
| **Phase 2 — Widen the funnel** | +2 quarters | **RFQ / Supplier Quotation doctypes + comparison screen** as optional pre-PO entry points (ERPNext chain precedent; NetSuite gates these behind Advanced Procurement — market-priced validation); **invoice photo/email extraction GA** (§13.5); supplier advances as a full A/P down-payment document (SAP B1); debit-note automation from returns; per-item tolerance tuning; Tamil UI strings (Kaveri floor reality). |
| **Phase 3 — Deepen compliance & supply** | +4 quarters | **GSP API integrations**: live GSTIN verification, auto GSTR-2B pull + in-app reconciliation (replacing the CSV upload of §13.3); e-invoice (IRN) capture on the purchase side; **landed-cost vouchers + BOE-linked import costing** (activates if pilot imports — Appendix B); **supplier scorecard standings** (Preferred/Conditional/Restricted with PO warnings, ERPNext model) on top of the two-number stats; MSME Samadhaan-ready interest computation on late payments. |
| **Phase 4 — Enterprise-grade sourcing** | +6–8 quarters | **Supplier portal** (PO ack, ASN, invoice upload — turns the duplicate guard + match into supplier self-service); budget commitment & encumbrance checks (D365/NetSuite pattern); multi-level approval matrix **only if a multi-plant tenant demands it**; source determination / quota arrangements / scheduling agreements (S/4HANA tier); **agentic procurement**: AI drafts replenishment POs from forecast + terms + lead-time learning, humans approve — extending the platform trust model. |

---

## 19. Technology Stack & Rationale

Aligned to the IND-CORE shared platform baseline (see `PLANNING.md` §19 / `ENGINEERING.md` §19 — same layers, same versions, one skill set); rationale below is **Module-4-specific**.

> **Migration note (supersedes the earlier research-summary draft):** the original compact plan assumed *FastAPI + SQLite + Next.js static export, single node, demo-grade*. That baseline is **superseded by the shared platform**: PostgreSQL 16 replaces SQLite everywhere — which is precisely what makes the duplicate-invoice partial unique index, generated FY column, row-locked TDS accumulator, streamed register export, and the append-only grant model possible; Vite SPA replaces the Next.js static export per the platform decision in `ENGINEERING.md` §19. The old plan's "three-posting separation must be respected even in SQLite" rule carries over unchanged — it is now simply enforced with real database machinery.

| Layer | Choice | Module-4 rationale & trade-offs |
|---|---|---|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query/Table | TanStack Table's headless model drives the module's three grid-heavy surfaces: the **pipeline board/table toggle**, the editable **PO line grid** (custom cells for rate-source chips + live GST columns), and the virtualized **purchase register** (1k+ rows). TanStack Query's event-driven invalidation maps 1:1 onto `purchase.*` bus events, so the workbench stays live without bespoke socket code. |
| **Charts** | Recharts (+ ECharts platform-wide where heatmaps are needed) | Purchase needs only card-grade viz (spend bars, exception trend, sparklines) — Recharts alone suffices here; ECharts stays available via `@ind-core/charts` but no Module-4 screen requires canvas-scale rendering. Lightest footprint of the six modules. |
| **Backend** | Python 3.12 + FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2 | The GST/TDS/RCM engines are pure Python functions (§11) — trivially unit-tested against the golden fixtures, shared with Celery jobs without serialization tricks. Pydantic v2 models double as the OpenAPI contract for typed client generation. Alembic owns the item-table extension migration (§9.1) against the Engineering-owned schema. |
| **Database** | PostgreSQL 16 + pgvector | The statutory layer *is* database features: **partial unique index** = the race-safe duplicate-invoice guard; **generated column** = Indian-FY key; **`SELECT … FOR UPDATE`** = correct ₹50-lakh accumulator under concurrency; **REVOKE-based append-only** `posting_event`/`audit_log`; server-side cursors stream the register export. pgvector powers the assistant's fuzzy supplier/item lookup. None of this existed under the superseded single-file baseline (migration note above) — the single biggest quality jump of the rewrite. |
| **Jobs / async** | Redis + Celery (queues: `default`, `ml`; beat scheduler) | **Celery beat runs the nightly reorder→draft-MR job** (01:30 IST) plus stats refresh and accumulator reconciliation — idempotent, per-run audit rows (§11.8). Purchase needs no isolated heavy queue (unlike Planning's `mrp`/`scheduler` pools); it shares `default`, keeping the worker topology simple. |
| **Auth** | JWT access (15 min)/refresh (7 d) + RBAC claims, FastAPI dependencies | The §14.1 matrix compiles to per-endpoint dependencies; separation-of-duties (Stores-only GRN submit, MD-only approve) is claims-checked server-side. Stateless JWT keeps the MD's mobile approval flow working over flaky 4G. |
| **APIs** | REST (OpenAPI auto-gen) + internal event bus on **Redis Streams** | The integration contracts of §1.1 ride the same Streams bus as Planning (§10.8 here mirrors `PLANNING.md` §10.8): consumer groups give Inventory/Planning replayable, exactly-once-ack consumption of `po.confirmed`/`grn.submitted` — right-sized vs Kafka for a single-VM deployment. |
| **Real-time** | SSE (workbench/board invalidation, import progress) | One-way freshness is all Purchase needs — no collaborative editing surface exists in this module; SSE is proxy-friendly on factory networks. |
| **AI** | Anthropic Claude API (tool-use over read-only Purchase APIs; vision for Phase-2 invoice extraction) + deterministic stats (z-score, diff, accumulators) | The platform doctrine applies verbatim: **numbers from deterministic models, language from the LLM** — GST/TDS math never touches the LLM; Claude narrates §13's computed evidence packs and answers "where is my order?" in EN/HI. DPDP tenants can kill the LLM; deterministic cores remain. |
| **Deployment** | Docker Compose (api, worker, beat, postgres, redis, caddy, frontend) on a single VM; on-prem capable | Same one-`compose up` posture as the rest of IND-CORE; nightly `pg_dump` + WAL archiving protects the statutory record (the purchase register is an audit artefact — backup is a compliance feature here, not just ops hygiene). |

### 19.1 Vendor comparison (distilled from the research corpus — Appendix A)

| Vendor | Procurement shape | What we took / rejected |
|---|---|---|
| **ERPNext** | Full chain (MR→RFQ→SQ→PO→PR→PI), QC gate, auto-MR reorder, supplier scorecard, procurement tracker | **Took:** QC-as-gate, auto-drafted MRs, duplicate-invoice control, tracker deliverable, derived statuses. **Rejected:** separate RFQ/SQ doctypes (deferred), full scorecard standings. |
| **Odoo** | RFQ *is* the draft PO; blanket orders free; advisory 3-way match ("Should Be Paid"), off by default | **Took:** single-document PO/RFQ (M3), advisory-match philosophy (M8). **Rejected:** nothing material — Odoo is the closest philosophical match; its Enterprise-only accounting depth is replaced by our posting-event stub. |
| **SAP Business One** | Explicit commitment/stock/liability three-posting; A/P down-payment invoices | **Took:** the three-posting separation as a structural rule; advances (as a field, not a document). |
| **SAP S/4HANA** | Source determination, quota arrangements, scheduling agreements, cross-company requisitioning | **Took:** nothing to build — used as the definition of the enterprise-only tier we defer (§17.3/§18 Phase 4). |
| **Oracle NetSuite** | 23-criteria vendor-bill approval workflow; requisitions/RFQs/blanket POs gated behind paid "Advanced Procurement" | **Took:** the licensing split as market evidence of where the premium line sits — our free tier ends exactly where their paid tier begins. **Rejected:** the 23-criteria engine (advisory chips instead). |
| **Dynamics 365 BC** | "Get Receipt Lines" structural matching; many-to-one line matching only in the 2026 wave-1 release; documented 194Q design | **Took:** Get Receipt Lines as the invoice-creation UX; reassurance that simple structural matching shipped for years in a leading mid-market ERP; their 194Q accumulator design informed §11.4. |
| **Katana / Zoho Inventory / MRPeasy** (SME tier) | PO + receipt (+bill) only; per-item-per-vendor terms auto-fill (MRPeasy); reorder alerts/drafts; two vendor stats; no RFQ docs, no multi-step approval | **Took:** the entire minimalism thesis — terms-driven two-click POs, two-number vendor stats, truncated chain. These tools won this exact client segment by cutting what we cut. |
| **Siemens Opcenter · Epicor · Plex · Infor** | MES/enterprise-manufacturing tier: procurement exists but is not the differentiating layer (Opcenter is an APS/MES bolt-on to a host ERP; Epicor/Plex/Infor procurement follows the standard enterprise chain) | **Honest note:** surveyed for the checkpoint's completeness; their procurement modules offered no SME-transferable pattern beyond what SAP/NetSuite already evidence — their relevance to IND-CORE is in Planning/Production (see `PLANNING.md`), not Purchase. Nothing invented, nothing taken. |

---

## 20. Demo Data (Seed — investor-demo grade)

Shared IND-CORE pilot universe (consistent across all module plans): **(1) Sharma Precision Components Pvt Ltd**, Faridabad, HR; **(2) Kaveri Pumps & Motors Ltd**, Coimbatore, TN; **(3) Trident Sheet Metal Works Pvt Ltd**, Pune, MH; **(4) Zenith Fasteners Pvt Ltd**, Rajkot, GJ; **(5) Arvind Electro Controls Pvt Ltd**, Noida, UP.

**Primary walkthrough: Kaveri Pumps & Motors Ltd, Coimbatore plant (GSTIN 33AAACK2140F1Z6, plant KPM-CBE-1).** Demo "today" = **Mon 13-Jul-2026** (start of week W29 — the same clock as `PLANNING.md` §20). Every supplier, item, PO and invoice below is loadable seed data; the numbers of §20.11 are the golden test fixtures of §16.

### 20.1 Companies & plants (identical to `ENGINEERING.md` §20.1)

| company_id | Company | GSTIN (demo) | Plant | City |
|---|---|---|---|---|
| 1 | Kaveri Pumps & Motors Ltd | 33AAACK2140F1Z6 | KPM-CBE-1 | Coimbatore, TN |
| 2 | Trident Sheet Metal Works Pvt Ltd | 27AABCT7712E1ZD | TSM-PUN-1 | Pune (Chakan), MH |
| 3 | Sharma Precision Components Pvt Ltd | 06AADCS3491J1ZR | SPC-FBD-1 | Faridabad, HR |
| 4 | Zenith Fasteners Pvt Ltd | 24AABCZ5618Q1ZL | ZFL-RJK-1 | Rajkot, GJ |
| 5 | Arvind Electro Controls Pvt Ltd | 09AAECA8804C1Z2 | AEC-NOI-1 | Noida, UP |

### 20.2 Employees / users (Kaveri, reused from `PLANNING.md` §20.1 & `ENGINEERING.md` §20.3)

| User | Role (Purchase module) | Login persona |
|---|---|---|
| **Anand Krishnan** | **Procurement Officer — primary demo user** | purchase@kaveripumps.in |
| S. Poongodi | Stores In-charge (GRN/QI) | stores@kaveripumps.in |
| R. Karthikeyan | Plant Manager | plant@kaveripumps.in |
| Venkat Subramanian | Managing Director — mobile approver | md@kaveripumps.in |
| CA Lakshmi Narayanan | Finance / CA (register, TDS, holds) | finance@kaveripumps.in |
| Meenakshi Sundaram | PPC Planner (emits Planning PRs; context) | planner@kaveripumps.in |
| Divya Ramesh | Sales / CSR (pipeline read-only) | sales@kaveripumps.in |

### 20.3 Plant context — warehouses & machines the purchases feed

Warehouses (Inventory-owned; Purchase posts into them via the ledger API): **WH-RM-MAIN** (raw-material main store) · **WH-QRTN** (quarantine cage — all GRN rejections) · **WH-PKG** (packing store) · WH-FG (context).

Machines (work centers from `PLANNING.md` §20.2 — shown as the demand context behind the purchases): WC-LTH01/WC-LTH02 (LMW CNC lathes — consume EN8/SS shaft rod, bronze rod), WC-VMC01 (Ace Micromatic VMC-850 — machines the CI castings), WC-ASSY (pump assembly — consumes bearings 6205/6306, mechanical seals, fasteners), WC-TEST (hydro test rig — the emergency bearing story, PO-2026-0421). Sub-contract plating runs at Sree Murugan Electroplating (job-work — goods flow via Module 6 challans, money flow here).

### 20.4 Purchased-item extract (reuses `PLANNING.md` §20.3 item codes; Purchase-owned fields shown)

| Item code | Name | Stock UoM | Buy UoM (factor) | HSN/SAC | GST % | QI? | Batch? | Reorder (ROP/ROQ) | Preferred supplier |
|---|---|---|---|---|---|---|---|---|---|
| CI-CASTING-IMP | Impeller casting blank (foundry) | PCS | PCS (1) | 7325 | 18 | ✔ | ✔ heat | **MRP-governed** (V-08 — no reorder rule) | Sri Balaji Castings |
| CI-CASTING-CSG | Casing casting blank | PCS | PCS (1) | 7325 | 18 | ✔ | ✔ heat | MRP-governed | Sri Balaji Castings |
| BRZ-INGOT-LG2 | LG2 gunmetal ingot (impeller/bush melt) | KG | KG (1) | 7403 | 18 | ✔ (mat. cert) | ✔ heat | 500 / 1,000 kg | Venkatramana Metals |
| BRZ-ROD-40 | Bronze rod φ40 (gland/bush turning) | M | KG (0.115) | 7407 | 18 | — | ✔ | 30 / 60 m | Venkatramana Metals |
| SS-SHAFT-ROD | SS410 shaft rod (0.6 m per pump) | M | M (1) | 7222 | 18 | — | ✔ | MULT 25 (Planning policy) | Lakshmi Steels & Tubes |
| EN8-ROD-25 | EN8 bright bar φ25 (gland followers) | M | **KG (0.26)** | 7214 | 18 | — | ✔ | 40 / 130 m | Lakshmi Steels & Tubes |
| BRG-6205-ZZ | Ball bearing 6205-ZZ (SKF) | PCS | PCS (1) | 8482 | 18 | — | — | 60 / 200 | Precision Bearings India |
| BRG-6306-ZZ | Ball bearing 6306-ZZ (SKF) | PCS | PCS (1) | 8482 | 18 | — | — | 24 / 100 | Precision Bearings India |
| MECH-SEAL-25 | Mechanical seal 25 mm | PCS | PCS (1) | 8484 | 18 | — | — | 140 / 292 (EOQ — Planning §20.9) | Precision Bearings India |
| FAST-M8-HEX | M8 hex bolt kit + consumables | PCS | PCS (1) | 7318 | 18 | — | — | 500 / 2,000 | Madras Hardware Syndicate |
| PKG-CRATE-KV50 | Wooden export crate, KV-50 | PCS | PCS (1) | 4415 | 12 | — | — | 20 / 60 | Coimbatore Packaging Co |
| SVC-PLATING-ZN | Zinc electroplating, job work (service) | PCS | PCS (1) | **SAC 9988** | 12 | — | — | — (service) | Sree Murugan Electroplating |
| SVC-FREIGHT-GTA | Inbound freight, GTA (service) | TRIP | TRIP (1) | **SAC 9965** | **5 RCM** | — | — | — | VRL Logistics |
| MOTOR-5HP | 5 HP TEFC motor (CG Power) — context | PCS | PCS (1) | 8501 | 18 | — | — | MOQ 10 (Planning) | CG Power dealer (context, §20.8 note) |

`EN8-ROD-25` is the dual-UoM showcase: bought by weight (₹/kg), stocked by length — 500 kg × 0.26 = 130.0 m posted to the ledger (TC-UOM-01).

### 20.5 Supplier master seed — the canonical eight

| # | Supplier | City | GSTIN (demo) | GST cat. | TDS | MSME / Udyam | Agreement | Terms | Lead |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Venkatramana Metals & Alloys Pvt Ltd** | Coimbatore | 33AABCV8231F1ZQ | Registered | 194Q→**393(1)**, other | — | — | 30 d | 5 d |
| 2 | **Sri Balaji Castings** | Coimbatore | 33AAFFS4127Q1ZM | Registered | 194Q→393(1), other | **Small** · UDYAM-TN-08-0012345 | **written (45 d)** | 45 d | 15 d |
| 3 | **Lakshmi Steels & Tubes** | Chennai | 33AACFL5872B1Z8 | Registered | 194Q→393(1), other | — | — | 30 d | 7 d |
| 4 | **Precision Bearings India (SKF dealer)** | Chennai | 33AAHCP4471R1Z2 | Registered | 194Q→393(1), other | — | — | 15 d | 3 d |
| 5 | **Sree Murugan Electroplating Works** | Coimbatore | 33AEJPM8830D1ZS | Registered | **194C, individual/HUF (1%)** | **Micro** · UDYAM-TN-08-0003412 | none (**15 d**) | 15 d | 7 d |
| 6 | **Madras Hardware Syndicate** | Chennai | 33AAKFM3391N1ZE | **Composition** | — | — | — | 7 d | 2 d |
| 7 | **VRL Logistics Ltd** | Hubballi, KA | 29AABCV3609C1ZX | Registered · **RCM default (GTA)** | 194C — **nil by transporter declaration 194C(6)** | — | — | on delivery | — |
| 8 | **Coimbatore Packaging Co** | Coimbatore | — (**Unregistered**) | Unregistered | — | **Micro** · UDYAM-TN-08-0051220 | none (15 d) | 7 d | 5 d |

Notes: #6 exercises composition handling (no tax on bill, no ITC); #7 exercises inter-state RCM (KA→TN → IGST 5% self-assessed); #8 exercises unregistered handling (no GSTIN, no tax, no RCM — packing crates are not a notified supply — but still on the MSME 15-day clock). *Cross-module note:* `PLANNING.md` §20.5 references **Sri Venkateshwara Foundries** as an alternate casting source — seeded as a ninth, inactive-terms vendor so Planning's fixtures resolve; castings are dual-sourced with Sri Balaji as primary.

### 20.6 Item–supplier purchase terms (auto-fill source, M4)

| Item | Supplier | Buy UoM | Rate ₹ | MOQ | Lead |
|---|---|---|---|---|---|
| BRZ-INGOT-LG2 | Venkatramana Metals | KG | 610.00 (blanket BO-2026-003) | 100 kg | 5 d |
| BRZ-ROD-40 | Venkatramana Metals | KG | 735.00 | 25 kg | 7 d |
| CI-CASTING-IMP | Sri Balaji Castings | PCS | 780.00 | 50 | 15 d |
| CI-CASTING-CSG | Sri Balaji Castings | PCS | 1,450.00 | 30 | 15 d |
| SS-SHAFT-ROD | Lakshmi Steels & Tubes | M | 228.00 | 25 m | 7 d |
| EN8-ROD-25 | Lakshmi Steels & Tubes | KG | 78.00 | 100 kg | 7 d |
| BRG-6205-ZZ | Precision Bearings India | PCS | 385.00 | 20 | 3 d |
| BRG-6306-ZZ | Precision Bearings India | PCS | 1,180.00 | 10 | 3 d |
| MECH-SEAL-25 | Precision Bearings India | PCS | 310.00 | 50 | 14 d |
| FAST-M8-HEX | Madras Hardware Syndicate | PCS | 4.20 | 500 | 2 d |
| SVC-PLATING-ZN | Sree Murugan Electroplating | PCS | 18.00 | 500 | 7 d |
| PKG-CRATE-KV50 | Coimbatore Packaging Co | PCS | 165.00 | 20 | 5 d |

### 20.7 Rate contract (blanket order)

**BO-2026-003 — Venkatramana Metals & Alloys**, valid 01-Apr-2026 → 30-Sep-2026, status active:

| Line | Item | Rate ₹/kg | Agreed qty | Released to date |
|---|---|---|---|---|
| 1 | BRZ-INGOT-LG2 | 610.00 | 8,000 kg | **5,400 kg** (incl. PO-2026-0412's 400 kg) |
| 2 | BRZ-ROD-40 | 735.00 | 1,200 kg | 380 kg |

### 20.8 Open PO set (~10 documents across every lifecycle state)

| PO | Supplier | Lines (summary) | Value ₹ (incl. GST) | State / chips | Story |
|---|---|---|---|---|---|
| PO-2026-0380 | Madras Hardware | fastener kit | 14,600 | **cancelled** | superseded by 0392 (amend chain demo) |
| PO-2026-0387 | Precision Bearings | 200× 6205 @385 · 100× 6306 @1,180 | 2,30,100 | **locked** (received + billed + paid) | the clean, boring, fully-done PO |
| PO-2026-0392 | Madras Hardware | fasteners & consumables | 18,600 (no tax — composition) | confirmed · **to_bill** | composition handling |
| PO-2026-0398 | Lakshmi Steels | EN8-ROD-25 **500 kg @78** | 46,020 | confirmed · to_bill · **invoice on hold** | dual-UoM (→130 m) + price-variance hold |
| PO-2026-0405 | Sri Balaji Castings | CI-CASTING-IMP 100 @780 | 92,040 | confirmed · **to_receive_and_bill** · **advance ₹23,400** | partial GRN 60/100 (TC-GRN-01) |
| **PO-2026-0412** | **Venkatramana Metals** | BRZ-INGOT-LG2 **400 kg @610** (blanket release) | **2,87,920** | **locked** · MD-approved 10-Jul (≥ ₹1 L) | **the worked example (§20.11)** — crosses ₹50 L TDS |
| PO-2026-0418 | Sree Murugan | SVC-PLATING-ZN 2,000 pcs @18 (service) | 40,320 | confirmed (service — no GRN path) | job-work money leg (goods via Module 6 challan DC-2026-0077) |
| PO-2026-0421 | Precision Bearings | **EMERGENCY** 20× 6306 @1,180 | 27,848 | confirmed 13-Jul · required 14-Jul 🔴 | "bearing seizure on hydro-rig drive" — emergency-rate KPI feed |
| PO-2026-0424 | Coimbatore Packaging | 60× PKG-CRATE-KV50 @165 | 9,900 (no GST — unregistered) | **draft** | unregistered handling |
| PO-2026-0426 | Sri Balaji Castings | CI-CASTING-CSG 50 @1,450 | 85,550 | confirmed · to_bill | GRN with **10 rejected → quarantine** |

*Cross-module context rows* (numbered in the legacy display series that `PLANNING.md` §20.6 cites): PO-2188 (Lakshmi Steels, SS-SHAFT-ROD 75 m — arrived early, Planning's reschedule-out), PO-2195 (Sri Balaji, CI-CASTING-CSG 60 — Planning's excess/cancel), PO-2201 (Sri Balaji, CI-CASTING-CSG 30 — Planning's reschedule-in), PO-2213 (CG Power dealer, MOTOR-5HP 10 — Planning's shortage expedite). Seeded so both modules' demos tell one story.

### 20.9 GRNs

| GRN | PO | Received | Accepted / Rejected | Batch · supplier lot | QI | Status |
|---|---|---|---|---|---|---|
| GRN-2026-0228 | PO-0387 | 200 + 100 bearings | 300 / 0 | — | not required | completed |
| GRN-2026-0231 | PO-0405 | **60 of 100** castings | 60 / 0 | B-2026-0455 · heat SB/H-2231 | QI-2026-0084 passed (n=8) | to_bill — **PO shows "to receive and bill 40"** |
| GRN-2026-0233 | PO-0398 | 500 kg EN8 | 500 kg → **130.0 m** / 0 | B-2026-0458 · LST/C-1873 | not required | to_bill |
| GRN-2026-0234 | PO-0412 | 400 kg LG2 ingot | 400 / 0 | B-2026-0462 · heat VM/L-889 | QI-2026-0086 passed (cert check) | to_bill → billed (§20.11) |
| GRN-2026-0235 | PO-0426 | 50 casing castings | **40 / 10 (blowholes)** → WH-QRTN +10 | B-2026-0464 · heat SB/H-2258 | **QI-2026-0088: 10 fail dimensional/visual** | to_bill · return pending |

### 20.10 Invoices & payments

| Invoice | Supplier | Supplier inv no. / date | Taxable ₹ | Tax | TDS | Net payable ₹ | Status / chips |
|---|---|---|---|---|---|---|---|
| PINV-2026-0177 | Sri Balaji | SB/0988 · 03-Jun | 78,000 | CGST 7,020 + SGST 7,020 | 0 | 92,040 | unpaid · **MSME due 20-Jul (7 d left)** |
| PINV-2026-0181 | Precision Bearings | PBI/2026/1187 · 08-Jul | 1,95,000 | CGST 17,550 + SGST 17,550 | 0 | 2,30,100 | **paid** (PAY-2026-0140, NEFT UTR N20260709KPM1) |
| **PINV-2026-0187** | **Venkatramana** | **VM/2026-27/0642 · 10-Jul** | **2,44,000** | **CGST 21,960 + SGST 21,960** | **114 (393(1))** | **2,87,806** | unpaid · due 09-Aug — **worked example §20.11** |
| PINV-2026-0188 | Lakshmi Steels | LST/1873 · 11-Jul | 42,000 (billed @84 vs PO 78) | CGST 3,780 + SGST 3,780 | 0 | 49,560 | unpaid · **🟡 price_var** · **HOLD: "rate variance — CN awaited"** |
| PINV-2026-0189 | VRL Logistics | FRT-88231 · 11-Jul | 8,000 (SAC 9965) | **IGST 400 — RCM, net-zero** | 0 (194C(6) decl.) | **8,000** | unpaid · RCM chip · service line, no GRN |
| PINV-2026-0190 | Sree Murugan | SM/226 · 02-Jul | 36,000 (SAC 9988) | CGST 2,160 + SGST 2,160 | **360 (194C @1%)** | 39,960 | unpaid · **MSME micro — due 18-Jul (5 d left)** |

Duplicate-guard demo: keying Sri Balaji "SB/0988" (or "sb-0988 ") a second time in FY 2026-27 → **409** linking PINV-2026-0177 (TC-INV-01 live on stage). Advance: ₹23,400 paid to Sri Balaji against PO-0405 (30% of taxable), open for adjustment when the casting invoice arrives.

### 20.11 Worked numeric example — full PO → GRN → Invoice with GST + TDS (golden: TC-GST-01 + TC-TDS-01)

**The Venkatramana ingot buy that crosses ₹50 lakh.** Accumulator FY 2026-27 before this document: opening ₹0 (system live since 01-Apr-2026) + YTD purchases **₹48,70,000** — the supplier-card meter has shown amber (97%) since 09-Jul.

**Step 1 — PO-2026-0412** (release against BO-2026-003; created in 2 clicks from terms):

| Line | Item | Qty | Rate | Taxable | GST 18% (intra TN→TN) |
|---|---|---|---|---|---|
| 1 | BRZ-INGOT-LG2 | 400 kg | ₹610.00/kg (blanket) | **₹2,44,000.00** | CGST ₹21,960.00 + SGST ₹21,960.00 |

Grand total **₹2,87,920.00** ≥ ₹1,00,000 threshold → approval card to Venkat Subramanian's phone → approved 10-Jul 09:12 → confirmed. *Posting events: none (commitment only — on-order qty).*

**Step 2 — GRN-2026-0234** (12-Jul): 400 kg accepted → WH-RM-MAIN, batch B-2026-0462, heat VM/L-889; QI-2026-0086 (material cert check) passed.
*Posting event (stock leg):* Dr Stock ₹2,44,000 / Cr GRNI ₹2,44,000.

**Step 3 — PINV-2026-0187** (supplier inv **VM/2026-27/0642**, dt 10-Jul, submitted 12-Jul):

```
Taxable value                                    ₹ 2,44,000.00
CGST 9%                                          ₹    21,960.00     (TC-GST-01)
SGST 9%                                          ₹    21,960.00
Grand total                                      ₹ 2,87,920.00

TDS u/s 393(1) [erstwhile 194Q]:
  FY base before bill        ₹ 48,70,000
  + this bill (excl. GST)    ₹  2,44,000   → ₹ 51,14,000
  excess over ₹ 50,00,000    ₹  1,14,000   ← taxed portion ONLY
  TDS @ 0.1%                                     ₹       114.00     (TC-TDS-01)

Net payable to supplier                          ₹ 2,87,806.00
```

*Posting event (liability leg):* Dr GRNI 2,44,000 · Dr Input CGST 21,960 · Dr Input SGST 21,960 / Cr AP 2,87,806 · Cr TDS Payable 114 — balances to the paise; three-posting separation demonstrated end-to-end. Accumulator now ₹51,14,000; every further Venkatramana bill this FY carries 0.1% TDS on its full taxable value.

### 20.12 TDS accumulators & MSME ageing (as of Mon 13-Jul-2026)

**vendor_fy_accumulator (FY 2026-27):**

| Supplier | Opening | Purchase value YTD | TDS deducted | Note |
|---|---|---|---|---|
| Venkatramana Metals | 0 | **51,14,000** | **114** | crossed 10-Jul (was 48,70,000 → alert at 97%) |
| Sri Balaji Castings | 0 | 6,21,500 | 0 | far from ₹50 L |
| Lakshmi Steels & Tubes | 0 | 3,68,400 | 0 | |
| Precision Bearings India | 0 | 2,87,300 | 0 | |
| Sree Murugan (194C basis) | 0 | 1,86,000 | 1,860 | annual ₹1 L crossed in May → all bills TDS'd @1% |
| Madras Hardware Syndicate | 0 | 84,750 | 0 | composition vendor |
| VRL Logistics (194C basis) | 0 | 96,400 | 0 | nil — transporter declaration 194C(6) on file |
| Coimbatore Packaging Co | 0 | 41,200 | 0 | unregistered |

**MSME 43B(h) ageing:**

| Supplier (class · clock) | Invoice | Amount ₹ | Acceptance | Due | Day | Days left | Bucket |
|---|---|---|---|---|---|---|---|
| Coimbatore Packaging (Micro · 15 d) | CP/118 | 12,500 | 30-Jun | **15-Jul** | 13 | **2** | 🔴 pay now |
| Sree Murugan (Micro · 15 d) | SM/226 → PINV-0190 | 39,960 | 03-Jul | 18-Jul | 10 | 5 | 🟠 |
| Sri Balaji (Small · 45 d, written agreement) | SB/0988 → PINV-0177 | 92,040 | 05-Jun | 20-Jul | **38** | **7** | 🟠 approaching day 45 |

Payment-proposal list for 13-Jul therefore opens with these three rows, in this order; PINV-2026-0188 (Lakshmi) is absent — **held**.

### 20.13 Purchase register extract (June-2026 — the CA's 2B reconciliation artefact)

| Supplier GSTIN | Supplier inv no. | Inv date | Taxable ₹ | CGST ₹ | SGST ₹ | IGST ₹ | HSN/SAC | RCM | ITC |
|---|---|---|---|---|---|---|---|---|---|
| 33AABCV8231F1ZQ | VM/2026-27/0561 | 12-Jun | 3,10,000 | 27,900 | 27,900 | 0 | 7403 | N | Y |
| 33AAFFS4127Q1ZM | SB/0988 | 03-Jun | 78,000 | 7,020 | 7,020 | 0 | 7325 | N | Y |
| 33AACFL5872B1Z8 | LST/1745 | 09-Jun | 54,600 | 4,914 | 4,914 | 0 | 7214 | N | Y |
| 33AAHCP4471R1Z2 | PBI/2026/1102 | 18-Jun | 88,000 | 7,920 | 7,920 | 0 | 8482 | N | Y |
| 29AABCV3609C1ZX | FRT-87104 | 21-Jun | 6,500 | 0 | 0 | **325** | 9965 | **Y** | Y (RCM) |
| — (composition) | MHS/446 | 24-Jun | 12,400 | 0 | 0 | 0 | 7318 | N | **N** |
| **Totals (6 invoices)** | | | **5,49,500** | **47,754** | **47,754** | **325** | | | |

The five GSTR-2B matching keys (GSTIN · inv no. · inv date · taxable · tax amounts) + HSN are exactly the columns above — TC-REG-01 asserts the export reconciles to these totals.

### 20.14 KPI tiles, reorder MR & alerts feed

**KPI tiles (trailing 90 d):** PO cycle time **3.2 d** 🟢 (target < 5 d complex) · Supplier defect rate **1.8%** 🔴 (target < 1% — driven by Sri Balaji's 6.7%) · OTD **87%** 🟠 (target 95% strategic) · PPV **+2.1%** 🟢 (band ±2–5%) · Emergency-PO rate **6.2%** 🟠 (target < 5%; > 10% = planning failure) · Invoice-exception rate **18%** 🟢 (industry avg 22%).

**Supplier stats (v_supplier_stats):** Precision Bearings OTD 98% / rej 0.1% (n=41) · Venkatramana 96% / 0.4% (n=24) · Lakshmi 91% / 0.9% (n=22) · Sree Murugan OTD 83% (n=12) · **Sri Balaji 78% / 6.7% (n=18)** · VRL/Coimbatore Pkg: "insufficient history".

**MR-2026-0068** (drafted by the reorder job, 13-Jul 01:30 IST — `purchase.mr.drafted`):

| Line | Item | Projected qty math | ROP | Draft qty | Preferred supplier |
|---|---|---|---|---|---|
| 1 | MECH-SEAL-25 | 92 + 0 − 0 = **92** | 140 | 292 (EOQ) | Precision Bearings India |
| 2 | EN8-ROD-25 | 26 m + 0 − 0 = **26 m** | 40 m | 130 m (= 500 kg) | Lakshmi Steels & Tubes |

Skipped with reasons (persisted in the run log): BRG-6306-ZZ → `already_covered` (open PO-2026-0421); CI-CASTING-IMP / CI-CASTING-CSG → `mrp_governed` (Planning V-08). This run **is** golden fixture TC-REO-01.

**Alerts feed:** 🔴 MSME 43B(h) — Coimbatore Packaging ₹12,500 due **15-Jul (2 days)** · 🔴 Emergency PO-2026-0421 (hydro-rig bearing) expected tomorrow — GRN pending · 🟠 MSME — Sri Balaji ₹92,040 due 20-Jul (day 38 of 45) · 🟠 TDS — Venkatramana crossed ₹50 L on VM/2026-27/0642; first deduction ₹114 posted (alert history shows the 97% warning of 09-Jul) · 🟡 Price variance — LST/1873 billed ₹84/kg vs PO ₹78/kg, invoice on hold · 🟢 Reorder job drafted MR-2026-0068 (2 items).

### 20.15 AI summary examples (seeded verbatim, rendered by the assistant)

**AI example 1 — "✦ Supplier risk summary" on the Sri Balaji card:**
> **Sri Balaji Castings — moderate risk, quality trending down.** Delivery: **78% on-time across 18 receipts** (6 late, average 4 days late) — plan casting POs with a 4-day buffer over the quoted 15-day lead. Quality: **rejection 6.7%**, concentrated in last week's casing lot — 10 of 50 pieces rejected for blowholes on GRN-2026-0235 (heat SB/H-2258, QI-2026-0088); an 8D/credit-note reply is pending. Money: ₹92,040 (PINV-2026-0177) is due **within 7 days under Section 43B(h)** (45-day written agreement — pay by 20-Jul to keep the deduction), and a ₹23,400 advance is open against PO-2026-0405 with 40 castings still undelivered. FY volume ₹6.2 L — no TDS threshold implication this year. Suggested next steps: release payment for PINV-2026-0177 this week; hold new casing releases until the heat-SB/H-2258 disposition; keep Sri Venkateshwara Foundries warm as the alternate source. *[Evidence: v_supplier_stats (n=18) · GRN-2026-0231/0235 · QI-2026-0088 · PINV-2026-0177 · PO-2026-0405.]*
> *Hindi:* "Sri Balaji ki delivery 78% samay par hai aur pichhle lot mein 10 casting reject hui. ₹92,040 ka bhugtaan 20-Jul tak MSME niyam ke andar karein; naye casing order QI jawab tak roken."

**AI example 2 — command bar, Divya (Sales/CSR) asks: "are the 6306 bearings for the hydro rig coming?"**
> Yes. **PO-2026-0421** — Precision Bearings India, 20 pcs BRG-6306-ZZ, ₹27,848 — was confirmed **this morning (13-Jul)** as an **emergency order** (reason: bearing seizure on the hydro-rig drive) and the dealer has committed delivery **tomorrow, 14-Jul**; it is already first in Stores' receiving queue. Current free stock of 6306 is 9 against a reorder point of 24, so nothing else covers the rig before this arrives. Last night's replenishment run deliberately skipped 6306 because this PO already covers it. *[PO-2026-0421 · expected-receipts 14-Jul · reorder run log 13-Jul.]*

**AI example 3 — compliance nudge to Finance (auto-generated on the threshold crossing):**
> **393(1) threshold crossed — nothing to fix, one thing to schedule.** Venkatramana Metals crossed the ₹50-lakh FY purchase threshold on invoice VM/2026-27/0642 (10-Jul). TDS of **₹114** was deducted at 0.1% under **Sec 393(1) (erstwhile 194Q)** — computed on the **₹1,14,000 excess only**, not the full bill, per the accumulator (₹48,70,000 → ₹51,14,000). Include it in the July TDS deposit (due 7-Aug). From now on, every Venkatramana invoice this FY carries 0.1% on its full taxable value — the system computes it automatically. *[vendor_fy_accumulator · statutory_param tds_goods_* · PINV-2026-0187.]*

---

## Appendix A — Research findings & key sources

The compact research plan this blueprint expands was grounded in ~75 findings, adversarially fact-checked by a second research pass; corrections were applied before anything here was written. This appendix preserves that narrative in full.

### A.1 What the market ships — table stakes

The four full suites surveyed (ERPNext, Odoo, SAP B1, NetSuite; BC and S/4HANA agree) implement the same **convertible document chain** (§1 diagram), each document created from its predecessor with lines carried forward:

- The pre-PO steps are explicitly **optional**: ERPNext's docs confirm a PO can be created with only Supplier and Item masters as prerequisites. The SME tools (Katana, Zoho Inventory, MRPeasy) truncate the chain to **PO + receipt**, with A/P invoicing sometimes delegated to an integrated accounting app.
- **Separation of commitment / stock / liability** (SAP B1 makes it explicit): the PO posts no accounting value (only on-order qty), the goods receipt moves inventory, the A/P invoice posts the vendor liability. This three-posting separation is the design decision behind 3-way match and must be respected regardless of database engine — the research plan insisted it hold even on its original single-file demo baseline; the platform is now PostgreSQL 16 (§19 migration note).
- **Partial receipt / partial billing with computed statuses**: in ERPNext and Odoo, PO status is *derived* by summing child-document quantities against parent lines ("To Receive and Bill" → "To Bill" → "Completed") — never manually edited.
- **Blanket/rate agreements** are closer to table stakes than "advanced" (5 of 6 suites ship them) — relevant here: copper strip/brass/gunmetal bought on rate contracts.
- **Reorder-point replenishment**: ERPNext auto-creates a Material Request when projected stock dips below reorder level (nightly scheduler). Zoho's reorder points *alert* and assist PO creation (auto-drafting needs a marketplace add-on); ERPNext is the stronger precedent for auto-drafting.

### A.2 Business impact & KPI evidence (source quality flagged)

KPIs computable from MVP data alone, with benchmarks:

| KPI | Formula | Benchmark (provenance flagged) |
|---|---|---|
| PO cycle time | avg(receipt date − requisition date) | < 24 h routine, < 5 days complex (vendor-published, directional) |
| **Supplier defect rate** | rejected qty ÷ received qty × 100 | < 1% for critical suppliers. For a precision-components maker this is the single most important vendor KPI — failed incoming material stops production |
| On-time delivery / OTIF | on-time ÷ total deliveries; OTIF = OT% × IF% (multiplied, not averaged) | 95%+ strategic suppliers; industrial-equipment OTIF 88–93% |
| Purchase price variance | (standard − actual price) × qty | ±2–5% of budget typical |
| Emergency purchase rate | flagged POs ÷ total POs | < 5% healthy; > 10% = planning failure (ties Purchase to Production/Inventory) |

Why automate (evidence, with source quality):

- **APQC (neutral benchmarking body):** cost to process one PO ranges **~$14 (top performers) to > $54 (bottom)**; the gap is attributed to process standardization and enforced approved channels — exactly what a purchase module operationalizes. (Levvel/vendor figures run higher — $89.73 manual vs $30.72 automated — the methodologies conflict; only the direction "automation roughly halves per-PO cost" is corroborated.)
- **Productivity:** 615.7 POs per procurement FTE manual vs 1,302.1 automated (2.1×, APQC-attributed via a vendor; directional).
- **Invoice exceptions average 22% of invoices** (top performers ~9%), and native ERP 3-way matching typically fails on exactly partial shipments, price adjustments, split deliveries. Implication: partial-receipt quantities must be first-class in the data model, but **matching can be a report, not an enforcement engine**.
- **Failure modes of Excel/manual purchasing** (demo talking points): duplicate orders from half-finished shared spreadsheets; A/P matching POs/invoices/packing slips "stored in three different places"; no spend visibility until the invoice arrives; manual entry is the primary root cause of **duplicate payments** (a typo in invoice number defeats naive duplicate checks — Xelix).
- **Expectation-setting:** Panorama's research consistently shows ~30% of organizations fall short of expected ERP benefits, with **over-customization (~23%) and scope creep (~26%)** among documented failure causes for discrete manufacturing (figures relayed via vendor summaries — directional). Procurify documents the approval-workflow trap specifically: build the standard flow and change policy, or people route around it via email and "you pay twice." This is the core argument for a *narrow* purchase MVP. Data migration is the #1 documented failure cause (38%) — hence CSV import as a P1 deliverable.

### A.3 Advanced tier (deferred with vendor precedent)

- **Enterprise-only** (S/4HANA, absent from all five SMB/mid-market suites): automated source determination, quota arrangements, scheduling agreements, cross-company requisition processing — machinery for many plants and buyers.
- **NetSuite's licensing split is direct market evidence of where the premium line sits**: requisitions, RFQs, blanket POs, purchase contracts, and demand consolidation are gated behind the paid "Advanced Procurement" add-on.
- **3-way match implementations diverge in strictness:** *Odoo* — OFF by default; advisory "Should Be Paid" (Yes/No/Exception) field with a manual Force Status override — it flags, it does not block. *NetSuite* — a prebuilt vendor-bill approval workflow evaluating ~23 exception criteria in four groups (bill validation incl. missing receipt/terms/location mismatch, quantity tolerance, quantity difference, amount tolerance). *Business Central* — matching is structural: "Get Receipt Lines" copies posted receipt lines onto the invoice; many-to-one line matching only arrived in the 2026 wave-1 release. A leading mid-market ERP shipped for years with a simpler matching model than "enterprise 3-way match."
- **Supplier scorecards with enforcement** (ERPNext: scoring periods, weighted criteria, Preferred/Conditional/Restricted standings that can block POs) — the two-number reduction (OTD %, rejection %) covers the SME need.
- **Supplier advances**: SAP B1's A/P Down Payment Invoice. Looks like bloat in Western feature lists, but advances are standard practice with small Indian job-work and raw-material vendors — a simple advance field on the PO is MVP-relevant here.

### A.4 What the SME tools deliberately cut (the MVP argument)

| Tool | What it ships | What it omits |
|---|---|---|
| **Katana** | POs, multicurrency, partial receiving + backorders, per-supplier lead times, reorder suggestions → auto-drafted PO to preferred supplier | RFQ, supplier quotations, approval workflows |
| **Zoho Inventory** | PO → Purchase Receive → Bill → Payment; reorder point with preferred vendor | RFQ, quotations, multi-step approval |
| **MRPeasy** | POs auto-filled from per-item-per-vendor "purchase terms" (price + lead time) — two-click PO creation; RFQ exists only as a *status on the PO record*; optional single-step PO approval; tracks two vendor stats (OTD %, incoming-inspection quality) | Separate quotation documents, multi-step approval chains |

Reading: Odoo Community ships RFQs and blanket orders free, yet the successful SaaS competitors for exactly this client segment chose to omit them — those are the first candidates to cut. **None of the three offers multi-step approval chains.**

### A.5 Key sources

ERPNext manuals (purchase-order, purchase-receipt, purchase-invoice, quality-inspection, material-request, auto-creation-of-material-request, supplier-scorecard, procurement-tracker) · Odoo 18/19 purchase docs (rfq, manage, blanket_orders, 3_way_matching) · SAP B1 purchasing review (firebearstudio) · NetSuite procurement guides (brokenrubik, tvarana) + Oracle 3-way-match workflow docs · Microsoft Learn (BC invoice-receipt matching, D365 194Q design) · Katana / Zoho / MRPeasy feature pages · APQC procurement benchmarks (neutral) · ProcureDesk / Precoro / Sievo KPI posts (vendor-published, directional) · ControlHub / Xelix failure-mode writeups (vendor-sponsored, directional) · Procurify over-customization post-mortem · Panorama/Godlan ERP reports (relayed figures, directional) · docs.indiacompliance.app (gst_setup, purchase_transaction) · Taxilla GSTR-2B guide · ClearTax (194C, 43B(h), HSN, GTA RCM) · TDSMan (393(1) renumbering) · full URL list in the research appendix of this plan set.

---

## Appendix B — Open questions for the pilot customer (Kaveri Pumps & Motors, Coimbatore)

Answers reshape P4/P5 configuration and the §18 roadmap ordering; none block P1–P3.

| # | Question | Why it matters / what changes |
|---|---|---|
| B-1 | Does Kaveri **import** anything (bearings? motor components?) — directly or via dealers? | BOE fields (FR-PUR-046) + landed-cost move up from Phase 3 if yes; demo currently assumes dealer-sourced domestic supply. |
| B-2 | Was Kaveri's **preceding-year turnover > ₹10 crore**? | Activates the buyer's 194Q/393(1) duty the demo assumes ON. If below, the accumulator still tracks but deduction is disabled by a `statutory_param` flag. |
| B-3 | Which suppliers are **MSME-registered** — confirm Sri Balaji (Small), Sree Murugan (Micro), Coimbatore Packaging (Micro); are **Udyam certificates on file**, and are there more we haven't flagged? | Drives 43B(h) urgency and the seed accuracy the auditor will check. |
| B-4 | Do **written agreements** exist with each MSME vendor (45-day clock) or not (15-day)? | The clock parameter per supplier (§11.7); the demo assumes Sri Balaji yes, others no. |
| B-5 | Are metals genuinely bought on **rate contracts** today (validity, volumes, renegotiation cycle)? | Confirms blanket-order priority (FR-PUR-011) and the BO-2026-003 seed shape. |
| B-6 | **Single approver** (Venkat) or genuinely two levels today? At what rupee threshold? | Sets `approval_threshold_inr`; a real second level would still be resisted per the over-engineering evidence (§17.5) — but we'd rather know now. |
| B-7 | What **over-receipt tolerance** is acceptable per commodity (castings vs bar stock vs bearings)? | Per-item tolerance values (V-PUR-06); default 0% is strict. |
| B-8 | What are the **advance-payment norms** with foundries/job-workers (%, against PI or PO)? | Shapes the advance field UX and whether Phase-2 A/P down-payment documents are needed sooner. |
| B-9 | Monthly **GTA freight volume and carriers** — and are 194C(6) transporter declarations on file? | RCM seed realism; nil-TDS handling for transporters. |
| B-10 | Which suppliers are **composition dealers** or **unregistered** beyond the seeded two — and is Coimbatore Packaging planning GST registration? | Category mix affects the register and ITC posture; unregistered vendors on the MSME clock are a real edge the CA should confirm. |

---

*— End of blueprint. Companion plans: `ENGINEERING.md` (Module 1), `SMBD.md` (Module 2), `PLANNING.md` (Module 3), `INVENTORY.md` (Module 5), `PRODUCTION.md` (Module 6). Research narrative & sources: Appendix A.*
