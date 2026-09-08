# Investor demo — Capability gaps and limitations

Written while building the Northstar PX-400 demo (July 2026), with implementation status
updated on 1 August 2026. Three kinds of finding, kept
apart because they need different decisions:

- **A — capabilities that do not exist.** The brief assumed them; there is no table, no
  endpoint and no screen. These are roadmap items.
- **B — things that exist but nobody can see.** Built, reachable by API, no user interface.
- **C — defects found by building the story.** Each one was hit, diagnosed and worked around
  in the seeder. Each has a fix.

Nothing here was inferred from documentation. Everything was found by trying to do it.

> **Demo-readiness update:** A4 (operation execution), A5 (persisted NCR/CAPA), B1
> (Employee Spend UI), C1 (FIFO batch allocation), C2 (safe database-conflict responses),
> C4/C5 (idempotency and validation) and C6 (credit-decision visibility) are now implemented
> and acceptance-tested. A1, A2, A3 and A6 remain production-roadmap items and are not claimed
> in the investor story.

---

## A · Capabilities the demo brief assumes, which do not exist

### A1 · Opportunity / lead — *no pipeline before the order*
The brief names **MICA-OPP-10482**. There is no opportunity or lead table, no stage, no
probability, no owner, no conversion. Sales begins at the order: somebody has already decided
to buy before XELOR knows they exist.

**Consequence for the demo:** the story starts one step later than the brief describes.
**Consequence for the product:** XELOR cannot answer "what is in the funnel" — which is
usually the first question a managing director asks a sales system.

### A2 · Quotation — *no priced offer*
The brief names **QT-10482**. An order can only be entered as an order. There is no quotation
document, no validity date, no revision history, no accept-to-order conversion. The pricing,
tax and credit logic all exist; there is simply nowhere to apply them before commitment.

This is the more painful of the two. In MSME manufacturing the quotation *is* the sales
process — most of the negotiation happens in it, and quote-to-order conversion rate is the
number the business runs on.

### A3 · Engineering change control (ECR/ECO) — *the outcome, not the change*
The brief names **AXLE-ECO-2407**. A BOM carries a `version` integer and a `notes` field, so
the *result* of a change can be recorded. The change itself cannot: there is no change
request, no impact assessment, no approval route, no effectivity date, no where-used analysis,
no disposition of stock built to the old revision.

For a pump maker shipping to process industries this is a certification issue as much as an
engineering one. "Which revision was in the unit we shipped in August" is currently
unanswerable.

### A4 · Per-operation work-order tracking — **resolved for the demo path**
Production orders now carry ordered operation records with predecessor gating, accountable
operators, start/completion times, accepted/rejected quantities and evidence notes. A
production order cannot complete while a routed operation remains incomplete. The Northstar
order has four completed, attributable operations visible on the production screen.

### A5 · NCR and CAPA — **resolved for the demo path**
The rejected inspection now creates a persisted NCR with containment, root cause and linked
CAPA. Corrective work can complete without silently self-closing effectiveness review; the
final effectiveness decision remains explicitly human-owned. The customer complaint and the
twelve quarantined units point to the same quality thread.

### A6 · Supplier invoice and payment — *the purchase cycle stops at the receipt*
Purchase runs requisition → order → approval → goods receipt, and then ends. There is no
supplier invoice against a purchase order, no three-way match, no payment run, no ageing for
direct material. (`purchase_expense` covers *indirect* spend; accounts payable for material
does not exist.)

Meridian's 750 kg arrived and was inspected. Nobody can pay for it.

---

## B · Built, but with no way to see it — resolved for the demo path

### B1 · Expenditure user interface — **resolved**
Employee Spend is now a registered web module with live claim and budget views. Claim
**EXP-2627-00011** is visible with its three lines, reconciled total and FY 2026-27 budget
decision. The module participates in the same permission catalogue and module-isolation gate
as the other 18 product modules.

---

## C · Defects found while building the story

### C1 · Batch-tracked stock consumption — **resolved**
The single stock write path now locks and consumes eligible batches FIFO when no batch is
nominated, records every split explicitly and refuses before posting when aggregate batch
stock is insufficient. Unit tests cover oldest-first choice, multi-batch splits, empty
balances and insufficient quantity.

### C2 · Duplicate-key violations escape as `500 INTERNAL` — **resolved**
Direct and ORM-wrapped PostgreSQL `23505` errors now map to the canonical safe 409 envelope.
The regression suite covers direct, nested and unrelated application errors. The original
failure examples were:

| Constraint | Endpoint | What the caller actually did |
|---|---|---|
| `uq_claim_idem` | `POST /expenditure/claims/:no/submit` | Replayed a submit key |
| `uq_ewb_tenant_shipment` | `POST /integration/ewaybill/generate` | Re-billed a shipment |
| `uq_aimetric_correlation` | `POST /aiops/metrics` | Re-metered a correlation id |
| `uq_incident_tenant_no` | `POST /admin/incidents` | Re-raised an incident number |

Every one of these means *"you have already done this"*, and every one of them tells the
caller *"something broke on our side"*. A retrying client cannot distinguish a duplicate from
a fault, which is precisely what the `Idempotency-Key` convention exists to prevent. One
mapping in the exception filter fixes all four and any future one.

### C3 · Two cost-centre vocabularies that do not overlap
The **employee** master uses `CC-PRD`, `CC-QC`, `CC-OPS`, `CC-PUR`, `CC-STR`, `CC-MNT`.
The **budget** master uses `CC-PNQ-PROD`, `CC-PNQ-MNT`, `CC-ADM`, `CC-SLS`, `CC-CBE-PROD`.

A claim keyed to the claimant's own cost centre therefore finds no budget at all and reports
the spend as unbudgeted — a correct answer to a question nobody meant to ask, and one that
would be read as "the budget check does not work". Neither vocabulary is wrong; there is just
no cost-centre master that both refer to.

### C4 · Maintenance task/start idempotency — **resolved**
Work-order start and task addition now require an idempotency key and replay the original
result instead of duplicating labour clocks or checklist rows.

### C5 · Raw maintenance/expenditure parameters — **resolved**
Maintenance start/sign-off bodies and expenditure budget queries now pass through zod
validation. Missing or malformed fields produce a clean validation response rather than 500.

### C6 · Sales-order credit snapshots — **resolved**
The API and order screen expose the credit limit, existing exposure and exposure including
this order as separate decision-time facts.

### C7 · A sampling plan gap is refused correctly, and had no answer for bulk material
Opening an incoming inspection on a 750 kg heat was refused: `SAMPLING_PLAN_GAP — the plan
table must cover every lot size it will be asked about`. That refusal is right, and the
message is a good one. But the only seeded plan was an ISO 2859-1 attribute plan whose bands
stop at 500 — a sampling model for counting defective *articles*, which a tonne of bar stock
is not. Resolved by configuration (a `fixed_n` three-specimen plan), not code. Worth knowing
that no bulk-material sampling plan ships by default.

---

## What was substituted, and what it cost

| The brief asked for | What the demo shows | Why |
|---|---|---|
| MICA-OPP-10482 | *(nothing)* | A1 — no opportunity exists |
| QT-10482 | *(nothing)* | A2 — no quotation exists |
| SO-10482 | **SO-2627-00004**, customer ref **NPS/PO/10482** | Numbers come from the gapless FY series inside the document's own transaction |
| SPAR-PR-7719 | A requisition converted from a real planned order | Same |
| PO-7719 / GRN-7719 | **PO-2627-00003** / **GRN-2627-00002**, vendor quote ref **MMA-Q-7719** | Same |
| Batch RM-316L-2407 | FIFO allocation with explicit ledger splits | C1 resolved |
| AXLE-ECO-2407 | *(nothing)* | A3 — no change control exists |
| KILN-WO-10482 | **MO-2627-00004** | Same as SO |
| RASP-OPS-0726 | The roster, muster and live Employee Spend claim | B1 resolved |
| HEXA-GOV-024 | **HEXA-GOV-024** on the incident register | Kept verbatim — that register takes a caller-supplied number |

---

## Original top three — current status

1. **C1 — batch consumption:** resolved and regression-tested.
2. **B1 — Employee Spend screens:** resolved and registered.
3. **A2 — quotations:** remains the largest commercial production-roadmap gap.

A4 (per-operation tracking) and A5 (NCR/CAPA) now have persisted, investor-demo-ready
workflows. Deeper MES/8D breadth remains roadmap scope and is not overstated in the demo.
