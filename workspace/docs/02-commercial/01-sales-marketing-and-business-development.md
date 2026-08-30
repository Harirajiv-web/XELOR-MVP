# IND-CORE Module 02 — Sales, Marketing, and Business Development
## Engineering Implementation Blueprint

**Product:** IND-CORE Manufacturing ERP for Indian SMEs (IND-AI)
**Module:** SMBD — the demand-side commercial front-end
**Document status:** Implementation-ready blueprint v1.0 · July 2026
**Source spec:** `PLANNING.html` §Module 2 (2.1–2.13) + cross-cutting design system
**Audience:** Frontend, Backend, AI/ML and Product teams — start immediately from this document

---

## 1. Module Overview

SMBD is the commercial front-end and system of record for everything from **first customer touch to a confirmed, priced Sales Order handed to Planning**. It spans three linked disciplines that in mid-market Indian manufacturers are typically owned by one small commercial team:

| Discipline | Scope inside IND-CORE |
|---|---|
| **Sales** | The transactional funnel — enquiry, quotation, negotiation, order, dispatch coordination, after-sales |
| **Marketing** | Demand generation — campaigns, exhibitions, web/lead capture, nurture, ROI attribution |
| **Business Development** | Structural growth — new customers, new geographies/segments, **tenders/RFQs (GeM, CPPP, IREPS, state portals)**, strategic accounts, sample/PPAP milestones |

**Why this module exists.** In make-to-order (MTO) and engineer-to-order (ETO) Indian SME manufacturing, the *quotation is itself an engineering-costing artifact* — material cost from the BOM, plus process/labour, plus overhead, plus margin. A won order triggers the entire plan → buy → make → ship chain. Without SMBD, demand enters production informally over email/Excel/WhatsApp, breaking traceability, GST compliance, credit control and forecast accuracy.

**Position in IND-CORE.** SMBD consumes the **Engineering** module's Item/BOM/routing masters (the join that makes quotes cost themselves), emits confirmed Sales Orders to **Planning** (MPS/MRP) via the event bus, gates orders through **Accounts** (credit limit, outstanding), reads **Inventory** ATP for delivery promising, and routes complaints to **Quality/QMS**.

**The two green-field differentiators** (verified against 14 platforms in the PLANNING competitive analysis — ERPNext, Odoo, SAP S/4HANA, NetSuite, Dynamics 365, Siemens, DELMIAWorks, Infor, Epicor, IFS, Acumatica, Plex, Katana, Fishbowl):

1. **BOM-costed MTO/ETO quoting as a first-class citizen.** The quote pulls a live cost sheet from Engineering (material + routing/process rates + overhead + margin) with target costing and instant margin simulation. Generic CRMs cannot do this; ERPNext links quotes to items but its estimation is basic; Epicor Kinetic's costing workbench + CPQ is the closest enterprise reference (drag-and-drop cost estimate creation, automatic cost rollups, quote → BOM/Method-of-Manufacture generation — per Epicor Kinetic Estimating & Quoting documentation) but at enterprise price and without India localisation.
2. **Native Indian tender/RFQ management.** GeM/CPPP/IREPS discovery, EMD & bank-guarantee tracking, eligibility/compliance checklists, deadline alarms, L1 outcome logging, and (roadmap) generative bid-response drafting. Essentially absent across all fourteen platforms surveyed.

**India-native throughout:** HSN codes, CGST/SGST/IGST split by place of supply, e-invoice/IRN awareness (₹5-crore AATO mandate), e-way bill at dispatch, MSME/Udyam status on customer and tender records, WhatsApp-first field selling.

---

## 2. Objectives

| # | Objective | Success metric (12 months post-launch at a pilot) |
|---|---|---|
| O1 | Replace Excel/email quoting with BOM-costed quotations | ≥ 90% of quotes issued from IND-CORE; quote prep time from ~2 days to < 2 hours |
| O2 | Single funnel of record: lead → opportunity → quote → SO | 100% of confirmed orders traceable to a quote & opportunity; zero "orphan" production orders |
| O3 | Protect margin at the point of quoting | Live margin visible on every quote line; discount-approval matrix enforced; quoted-vs-actual margin variance < 5% |
| O4 | Enforce credit discipline at order confirmation | 0 SOs confirmed past credit limit without an approval override; DSO improvement measurable in Accounts |
| O5 | Make Indian tender pursuit systematic | All active bids in the tracker; zero missed submission deadlines; EMD/BG exposure visible at all times |
| O6 | Feed Planning a trustworthy demand signal | Confirmed SOs flow to MPS the moment they are confirmed (event, not batch); weighted pipeline feeds S&OP |
| O7 | Prove the AI wedge | Lead scoring live on real data; auto-quote-from-BOM demoable; tender fit-scoring demoable; every AI action human-approved |
| O8 | Match how Indian SME sales actually happens | Quote/OA send over WhatsApp + email in one tap; phone-first pipeline & approvals |

---

## 3. User Personas

### 3.1 Sales Executive / Sales Engineer — "Priya" (primary, daily)
Field-heavy; owns a territory and a set of accounts. Lives in the **Pipeline Kanban** and **Customer 360**. Creates leads at exhibitions from her phone, logs calls/visits, raises quotes *within her discount limit*, chases follow-ups, sends quotes on WhatsApp. Pain today: re-typing specs into Excel quote formats, begging Estimation for costs, not knowing stock/credit status when a customer asks "when can you deliver?"
**Needs:** mobile pipeline, one-tap quote from opportunity, live ATP + credit visibility, WhatsApp send, follow-up reminders.

### 3.2 Sales Manager / Regional Manager — "Suresh" (daily)
Owns the team number. Reviews the weighted pipeline every Monday, approves discounts/quotes above threshold, reassigns leads, sets targets. Pain today: forecast built by copy-pasting from six spreadsheets; discovers margin leaks after the order ships.
**Needs:** team pipeline & forecast dashboard, approval worklist (discount/credit overrides), win/loss analysis, target-vs-achievement.

### 3.3 Marketing Executive — "Karthik" (weekly-cyclical)
Runs exhibitions (the #1 lead source for SME manufacturers), email/telecalling campaigns, the website enquiry form. Pain today: cannot prove which campaign produced which order.
**Needs:** campaign master with budget, bulk lead import (exhibition scans/CSV), web-to-lead endpoint, cost-per-lead and campaign-ROI attribution through to closed orders.

### 3.4 BD / Tender Cell Executive — "Arjun" (daily during bid season)
Watches GeM/CPPP/IREPS/state portals, decides bid/no-bid, assembles eligibility documents, arranges EMD/bank guarantees, tracks submission deadlines to the minute, logs L1 outcomes, and pursues long-cycle new-customer development (sample approval → PPAP/first-article → rate contract). Pain today: deadlines on a whiteboard; EMD money forgotten and unrecovered; each bid assembled from scratch.
**Needs:** tender tracker with countdown alerts, EMD/BG ledger, reusable compliance-document checklist, bid-vs-win analytics, tender↔opportunity linkage.

### 3.5 Estimation / Costing Engineer — "Meena" (per-quote)
Builds the number behind every non-standard quote: explodes the BOM, applies current material rates, computes process time × machine/labour rates, adds scrap/yield and overhead, proposes margin. Maintains the rate masters. Desktop-only power user. Pain today: Excel cost sheets that drift from the released BOM revision.
**Needs:** BOM explosion pulled live from Engineering, editable rate masters, cost-sheet versioning tied to quote revisions, target-costing (work backwards from a target price), approval stamp on cost sheets.

### 3.6 Management — "R. Krishnamurthy, MD" (weekly, read-mostly)
Wants the business on one screen: order book vs plan, weighted pipeline, win rate, customer concentration risk, tender exposure (EMD/BG money locked), receivables flags. Consumes dashboards and AI summaries ("why is this account at risk?"), approves the largest discounts.
**Needs:** read-across dashboard, KPI cards with trends, drill-down to any deal, mobile summary.

---

## 4. Functional Requirements

Requirements are numbered `FR-SMBD-xxx`, grouped by domain. Priority: **M** = MVP, **P2** = Phase 2, **P3** = Phase 3 (aligned with the PLANNING build sequence: Phase 1 quote-from-BOM core → Phase 2 tender management → Phase 3 auto-quote/generative).

### 4.1 Leads & Enquiries

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-SMBD-001 | Create/edit/list leads with: source, campaign link, company, contact (name/phone/email), industry, region/state, product interest, status (`new / contacted / qualified / disqualified / converted`), score, owner | M | Lead saved with mandatory company + (phone or email); appears in owner's lead list ≤ 1 s; status transitions audited |
| FR-SMBD-002 | Multi-source capture: manual, CSV/Excel import (exhibition lists), public web-to-lead API endpoint | M | Import of a 500-row CSV maps columns, reports per-row errors, creates ≤ 500 leads; web-to-lead POST creates a lead with `source='website'` and fires an assignment notification |
| FR-SMBD-003 | Duplicate detection on create/import: fuzzy match on company name + exact match on phone/email/GSTIN | M | A lead matching an existing lead/customer shows a "possible duplicate" panel with merge/link/ignore options; imports report duplicate counts |
| FR-SMBD-004 | Lead qualification & conversion: one action converts a qualified lead into Customer (or links to existing) + Contact + Opportunity | M | Post-conversion, lead is read-only with links to the created records; campaign attribution carried onto the opportunity |
| FR-SMBD-005 | Lead assignment rules by territory/product line; manual reassign by manager | P2 | New lead auto-assigned per rule; reassignment notifies old and new owner |
| FR-SMBD-006 | AI lead score (0–100) with reason chips, refreshed on data change | M (demo model) | Score badge visible on lead list/kanban; clicking shows top contributing factors; score never blocks any user action |

### 4.2 Opportunities & Pipeline

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-SMBD-010 | Opportunity record: customer, name, value (₹), stage, probability %, expected close date, product lines, competitor, source/campaign, owner, next action + date | M | All fields editable per role; value & stage changes are audit-logged with timestamp+user |
| FR-SMBD-011 | Kanban pipeline board (default landing view): configurable stages, default `Enquiry → Qualified → Quoted → Negotiation → Won / Lost`; drag-drop between stages | M | Drag persists ≤ 500 ms (optimistic UI); column headers show count + Σ value + Σ weighted value; stage change can require a reason (e.g., Lost reason mandatory) |
| FR-SMBD-012 | Stage-probability defaults (e.g., Qualified 20%, Quoted 50%, Negotiation 70%) overridable per deal; weighted value = value × probability | M | Moving a card updates probability to stage default unless manually pinned; weighted pipeline totals recompute instantly |
| FR-SMBD-013 | Won/Lost closure with reasons (price, delivery, spec, relationship, competitor) feeding win/loss reports | M | Closing to Lost without a reason is blocked; Won prompts "Create Quotation→SO conversion" if a quote exists |
| FR-SMBD-014 | Activity timeline per opportunity (calls, emails, meetings, tasks, WhatsApp sends) with due dates and overdue flags | M | Activities polymorphic (also on Lead/Customer/Quote/Tender); "my overdue follow-ups" worklist on dashboard |
| FR-SMBD-015 | Long-cycle BD milestones on opportunities: sample sent, sample approved, PPAP/FAI submitted, rate contract | P2 | Milestone checklist visible on opportunity; milestone dates reportable |

### 4.3 Estimation & Costing (the differentiator)

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-SMBD-020 | Cost sheet builder: select an Item with a released BOM → system explodes multi-level BOM from Engineering and prices every material line from rate masters (purchase price list / last PO / standard rate, in that fallback order) | M | For a 3-level BOM of ≤ 200 components, explosion + pricing completes ≤ 3 s; each line shows source of rate; unresolved rates flagged red, never silently zero |
| FR-SMBD-021 | Process/conversion cost: routing operations × (machine-hour rate + labour rate) from rate masters; setup cost amortised over quote qty | M | Editing quote qty re-amortises setup cost; per-operation cost visible |
| FR-SMBD-022 | Overhead % (factory + admin, configurable), scrap/yield %, packing & freight, then margin % → suggested unit price. Full breakup stored: material / process / overhead / other / margin | M | Cost sheet totals = Σ components within ₹0.01; breakup snapshot is immutable once the quote revision is sent |
| FR-SMBD-023 | Target costing mode: enter target price → engine back-solves achievable margin and highlights the gap vs cost | M | Toggling target mode shows margin % turning red below configurable floor (e.g., 12%) |
| FR-SMBD-024 | Live margin simulation: changing any rate, qty, discount or price instantly recomputes line & quote margin | M | Recompute is client-side ≤ 100 ms; server re-validates on save |
| FR-SMBD-025 | Rate masters CRUD (material rates, machine-hour rates, labour rates, overhead sets) with effective dates and edit audit | M | Estimation role only; historical quotes retain the rates they were costed at |
| FR-SMBD-026 | Cost-sheet approval by Estimation before a quote above a value threshold can be sent | P2 | Unapproved cost sheet blocks "Send" on quotes > threshold; approval stamps user+time |

### 4.4 Quotations

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-SMBD-030 | Quotation builder opened from an opportunity (or standalone): header (customer, contact, valid-till, currency, incoterm, payment terms, lead time, T&C template) + lines (item/spec, qty, UOM, **linked bom_id + cost**, unit price, discount %, HSN, tax rate) | M | Creating from opportunity pre-fills customer/contact/products; each line with a BOM link shows cost & margin chip; HSN auto-filled from item master |
| FR-SMBD-031 | GST computation per line and in summary: CGST+SGST when place of supply state = supplier state, IGST otherwise (per IGST Act place-of-supply rules); totals show taxable value, CGST, SGST, IGST, grand total; rounding per line half-up to 2 dp, invoice-total rounding to nearest rupee | M | See test cases §16; switching shipping address across state lines flips the tax split automatically |
| FR-SMBD-032 | Revisioning: quote number stays constant, `Rev 0/1/2…` increments; a new revision snapshots the old one read-only; only the latest revision is actionable | M | Register shows revision count; diff view highlights changed lines/prices between revisions |
| FR-SMBD-033 | Discount governance: per-role max discount %; exceeding routes the quote to approval (manager → management tiers) and blocks send until approved | M | A 12% discount by a rep with 10% limit sets status `pending_approval`, notifies manager, and the Send/PDF-final actions are disabled |
| FR-SMBD-034 | Quote PDF: branded techno-commercial format — company GSTIN header, line table with HSN & GST split, cost-free customer view, amount in words (Indian numbering — lakh/crore), T&C, signature block; internal variant with cost/margin visible | M | PDF renders < 3 s; ₹ and Indian digit grouping (1,23,45,678) correct; internal variant never sendable to customer |
| FR-SMBD-035 | Send & track: email and WhatsApp send (template message with PDF), status trail `draft → pending_approval → sent → negotiation → won / lost / expired` | M (WhatsApp P2, stub in MVP) | Send logs an Activity; status auto-flips to `expired` past valid-till date via scheduled job |
| FR-SMBD-036 | Quotation register: saved filters, quote-aging highlight (> X days in `sent`), expiring-soon flag (≤ 7 days validity), bulk follow-up task creation | M | Register loads 5,000 quotes with virtualised scroll; aging cells colour-coded |
| FR-SMBD-037 | Price lists: customer-specific and quantity-slab pricing auto-suggests unit price on quote lines | P2 | If a price-list rate exists for customer+item+qty slab, it pre-fills and is labelled "price list"; manual override allowed within discount rules |
| FR-SMBD-038 | Multi-currency quotes & export fields (LC terms, SEZ/deemed export flags) | P3 | Currency + exchange-rate snapshot on quote; GST behaviour per export rules |

### 4.5 Sales Orders (Order Acknowledgement)

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-SMBD-040 | One-click conversion of a **won** quote → Sales Order, carrying lines, prices, taxes, customer PO no./date; inline **credit check + ATP check** run during conversion | M | Conversion dialog shows: credit status (limit, outstanding, this order, verdict), and per-line ATP (stock now / free-to-promise date); user confirms or aborts; SO number issued as `SO-YYYY-NNNN` |
| FR-SMBD-041 | Credit gate: if outstanding + order value > credit limit ⇒ SO created in `credit_hold`, requires Accounts/Manager override with reason; overrides audited | M | A blocked SO cannot emit the Planning event until released; override reason mandatory |
| FR-SMBD-042 | Line-wise delivery schedule (multiple promised dates per line), billing & shipping GSTIN/addresses (place of supply may differ from billing), advance/payment terms | M | Each SO line carries promised_date; shipping address drives place of supply and re-derives tax split from the quote if different |
| FR-SMBD-043 | On confirmation, publish `smbd.sales_order.confirmed` event (SO header+lines) to the internal event bus for Planning (MPS/MRP) and Inventory (reservation) | M | Event emitted exactly-once (outbox pattern); Planning demo consumer visibly receives it |
| FR-SMBD-044 | Amendments: post-confirmation qty/date changes create an amendment record and re-emit a `sales_order.amended` event; price changes above tolerance need approval | P2 | Amendment history visible on SO; Planning notified |
| FR-SMBD-045 | Order Acknowledgement PDF + WhatsApp/email send to customer | M | OA PDF mirrors quote format with PO reference & delivery schedule |

### 4.6 Marketing & Campaigns

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-SMBD-050 | Campaign master: name, type (exhibition/email/digital/telecalling/referral), channel, budget, start/end, status, target description | M | CRUD with role Marketing; open campaigns selectable as lead source |
| FR-SMBD-051 | Campaign ROI attribution: leads generated, qualified %, opportunities created, orders won, revenue attributed, cost-per-lead, ROI multiple — computed from the lead→opp→SO chain | M | Campaign detail shows the funnel with live counts; revenue = Σ SO totals of orders whose opportunity's lead carries the campaign_id |
| FR-SMBD-052 | Bulk lead import into a campaign (exhibition badge-scan CSV) with dedupe report | M | Same engine as FR-SMBD-002, campaign pre-linked |
| FR-SMBD-053 | Email nurture sequences & templates; unsubscribe handling | P3 | Out of MVP; design DB to allow later `campaign_message` tables |

### 4.7 Tenders & BD (India-specific differentiator)

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-SMBD-060 | Tender tracker record: portal (GeM/CPPP/IREPS/state/OEM), tender ref, buyer/PSU, category, estimated value, bid value, EMD amount & mode (online/BG/FDR/**exempt-MSME**), BG/PBG references with expiry, submission deadline (date+time), opening date, status pipeline `Discovered → Bid/No-Bid → Prep → Submitted → Technical Eval → Financial (L1) → Awarded / Lost / Cancelled`, owner, linked opportunity | M | Full CRUD; status changes audited; Awarded prompts SO/opportunity creation; per GeM norms EMD is typically 1–5% of estimated value with MSE/Udyam exemptions — the EMD-exempt flag with Udyam cert reference models this |
| FR-SMBD-061 | Compliance/eligibility checklist per tender: templated document list (Udyam cert, GST returns, turnover/CA cert, past-performance POs, authorization, technical datasheets), each item `pending/ready/uploaded/submitted`, completion % | M | Checklist template cloneable; tender card shows completion ring; submission blocked-warning if items pending |
| FR-SMBD-062 | Deadline alerts: T-7d, T-3d, T-24h, T-4h notifications to owner + BD head via in-app + email (+ WhatsApp P2); daily digest of upcoming deadlines | M | Scheduled job fires alerts; alert log visible; no tender with a future deadline may lack an owner |
| FR-SMBD-063 | EMD/BG exposure ledger: money locked in EMDs and guarantees by status, refund tracking (refund due after award/rejection), PBG expiry watch | M | Dashboard KPI "EMD/BG exposure ₹"; refund-overdue list |
| FR-SMBD-064 | Two-cover bid model (CPPP pattern): technical & financial cover contents tracked separately; L1 result capture (our rank, L1 price, delta %) | P2 | Win/loss vs L1-delta analytics per buyer/category |
| FR-SMBD-065 | AI tender discovery & fit-scoring: scheduled scan of portal feeds/keywords → suggested tenders with capability fit-score and reasons; human accepts into tracker | P2 (demo in MVP with seeded data) | Suggested list separate from tracker; accept/dismiss trains relevance |

### 4.8 Dispatch coordination

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-SMBD-070 | Dispatch record against SO (lines+qty): planned vs promised vs actual date, packing list reference, transporter, LR no., vehicle no., e-way bill no. & validity, status `planned → packed → dispatched → delivered` | M | Partial dispatches supported (delivered_qty accumulates on SO lines); SO auto-closes when all lines delivered |
| FR-SMBD-071 | E-way bill fields captured for movements > ₹50,000 (number, date, validity, transporter GSTIN); generation itself lives in Accounts/compliance service — SMBD stores references | M | Dispatch save warns if consignment value > ₹50,000 and e-way bill no. empty |
| FR-SMBD-072 | On-time-dispatch metric: promised vs actual per SO line, aggregated to customer & dashboard | M | OTD % on dashboard and Customer 360 |
| FR-SMBD-073 | Dispatch notification to customer (email/WhatsApp: items, LR no., ETA) | P2 | Uses same notification service as quotes |

### 4.9 Customer master & Customer 360

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-SMBD-080 | Customer master: legal name, GSTIN(s) (multi-registration ready), PAN, MSME/Udyam status & number, customer group, territory, price list, credit limit ₹, credit days, payment terms, owner; multiple addresses (billing/shipping with state codes) and contacts | M | GSTIN validated (format + checksum, §15); PAN cross-checked as chars 3–12 of GSTIN; state derived from GSTIN prefix |
| FR-SMBD-081 | Customer 360 hub: header KPIs (lifetime revenue, outstanding, credit utilisation, OTD %, last order) + tabs: Overview, Contacts, Opportunities, Quotations, Orders, Dispatches, Ledger/Outstanding (from Accounts), Complaints (from Quality), Activities, Price list | M | Every child record one click away (breadcrumb pattern per design system); tabs lazy-load |
| FR-SMBD-082 | Churn/at-risk signal on account: declining order frequency, aging receivables, open complaints → risk badge + AI narrative | P2 (demo in MVP) | Risk badge with "why" explanation; never auto-actions |

### 4.10 Reporting & dashboards

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-SMBD-090 | SMBD dashboard: KPI cards (weighted pipeline ₹, quote conversion %, order book ₹ vs target, win rate %, tender EMD/BG exposure ₹) each with trend delta + sparkline; charts: funnel by stage, win/loss reasons bar, sales-vs-plan trend line, customer-concentration donut | M | Loads ≤ 2 s on seed data; every chart clicks through to its register |
| FR-SMBD-091 | Reports: pipeline by stage/owner/aging; win/loss analysis; quote conversion & aging & cycle time; sales vs target; customer concentration (top-N share); tender pipeline & win rate; marketing ROI; margin quote-vs-actual; on-time dispatch; GST-ready order/dispatch registers (CSV/Excel export) | M subset (pipeline, conversion, tender, ROI) / P2 rest | Each report filterable + exportable; numbers reconcile with registers |

---

## 5. Non-functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Performance | P95 API latency < 300 ms for list/detail; Kanban drag persist < 500 ms; BOM cost explosion (200 components, 3 levels) < 3 s; quote PDF < 3 s; dashboard < 2 s |
| NFR-02 | Scale (SME-calibrated) | 200 concurrent users/tenant; 100k leads, 50k quotes, 20k SOs, 5k tenders per tenant without degradation; registers virtualised, server-side pagination beyond 200 rows |
| NFR-03 | Availability | 99.5% business-hours availability for single-VM demo deployment; graceful degradation — AI/notification outages never block CRUD |
| NFR-04 | Data integrity | No hard deletes of quotations, SOs, cost sheets, tenders (soft-delete/void with audit); quote revisions immutable once sent; monetary values `NUMERIC(14,2)`, quantities `NUMERIC(12,3)` — never floats |
| NFR-05 | Auditability | All create/update/status-change on commercial documents logged (who/when/what-diff) in append-only audit trail; discount and credit overrides always carry a reason |
| NFR-06 | Security & privacy | RBAC + territory scoping (§14); DPDP-friendly: on-prem deployable, PII (contact phone/email) access-logged, AI calls strip PII where feasible; TLS everywhere; JWT with short-lived access tokens |
| NFR-07 | Localisation | ₹ with Indian digit grouping (##,##,###); date `DD-MM-YYYY` display; IST default timezone; amount-in-words in Indian system (lakh/crore); UI copy in plain language with tooltips for every acronym (BOM, ATP, EMD…) per the design system; Hindi/regional strings P3 |
| NFR-08 | Compliance readiness | GST fields (GSTIN, HSN, place of supply, tax splits) structurally correct so Accounts can generate e-invoice (IRN via IRP/GSP) and e-way bill without re-keying; 24-hour IRN-cancellation and 30-day reporting constraints respected downstream |
| NFR-09 | Mobile | Pipeline, approvals, account lookup, WhatsApp send usable on 360 px-wide viewports; estimation & registers desktop-optimised |
| NFR-10 | Extensibility | Event-driven module boundaries (outbox → bus); polymorphic Activity model; checklist templates data-driven; stage lists configurable without code |
| NFR-11 | Observability | Structured logs with request IDs; metrics on costing-engine latency, event-publish lag, notification delivery; Sentry-class error tracking |
| NFR-12 | Offline tolerance | Read-mostly mobile views cache last data; queued activity logging when offline (P2) |

---

## 6. UI/UX Flow

### 6.1 Core principle (from the design system)
**Worklist-first, Kanban-centred, guided-guarded actions.** SMBD opens on the **Pipeline Kanban** for sales roles (the view its primary user needs first). Every consequential action — send a quote, convert to SO, submit a bid — is a *single deliberate action with an inline readiness check* (approval status, credit, ATP, checklist completion). Every acronym carries a hover tooltip. The AI drafts; a human approves — surfaced as a consistent "✦ AI" button that proposes and shows evidence, never writing without a click.

### 6.2 The golden path (deal left-to-right)

```
Exhibition/Web/Referral                        ┌────────────────────────────┐
        │                                      │  GeM/CPPP portal discovery │
        ▼                                      └──────────┬─────────────────┘
   [LEAD] ──qualify──► [OPPORTUNITY on Kanban] ◄──link────┘ (Tender ↔ Opp)
                              │ drag: Enquiry → Qualified → Quoted → Negotiation
                              │
                    "Create Quotation" (from opp — customer/products pre-filled)
                              ▼
                    [QUOTE BUILDER]
                      ├─ add line → pick Item → BOM auto-linked
                      ├─ "✦ Cost from BOM" → explodes BOM + routing,
                      │    prices from rate masters → cost sheet panel
                      ├─ margin slider / target price ⇄ live margin chips
                      ├─ GST auto-split (place of supply)
                      ├─ discount > limit? → approval worklist → approved
                      └─ Send: PDF → Email / WhatsApp  (Rev 0,1,2…)
                              │  won
                              ▼
                    "Convert to Sales Order"  ← ONE CLICK, with inline:
                      ├─ ① Credit check   (limit − outstanding vs order value)
                      ├─ ② ATP check      (per line: stock / promise date)
                      └─ ③ Confirm → SO-2026-NNNN + OA PDF
                              │
                              ▼  event: smbd.sales_order.confirmed
                    [PLANNING (MPS/MRP)]  [INVENTORY (reserve)]  [ACCOUNTS]
                              │
                    [DISPATCH] promised vs actual, e-way bill ref → OTD metric
```

### 6.3 Flow narratives

**A. Salesperson's Monday (mobile or desktop).** Login → Pipeline Kanban with "Needs me now" strip on top: overdue follow-ups, quotes expiring ≤ 7 days, quotes pending my approval, SOs on credit hold. Drag a deal from *Qualified* → *Quoted*: the app offers "Create quotation now?". Cards show value, weighted value, lead-score/win-probability badge, days-in-stage (amber > 14 d, red > 30 d).

**B. Quote from opportunity (the differentiator flow).** From the opportunity, **Create Quotation** opens the builder with customer, contact, and product-interest lines pre-filled. Adding a line by Item auto-attaches the released BOM (`bom_id`). The **cost panel** (right rail, desktop) shows material/process/overhead stack per line and blended quote margin; the rep sees *price and margin move together* as they type discounts. Below margin floor the chip turns red and — if beyond their discount limit — the primary button changes from **Send** to **Submit for approval**. Estimation can be invited into the same quote ("Request costing") for ETO lines with no BOM yet.

**C. Won → SO in one click.** Marking the opportunity/quote *Won* opens the conversion dialog: capture customer PO no./date, confirm delivery schedule per line, then two automatic inline checks render as pass/warn/fail rows — Credit (limit ₹, outstanding ₹, this order ₹, verdict) and ATP (per line: available now, or free-to-promise date from Inventory/Planning). Fail on credit ⇒ SO saves in `credit_hold` with an override path. Confirm ⇒ SO number, OA PDF, event to Planning — all in one screen, per the "guided guarded actions" principle.

**D. Tender pursuit.** BD sees the Tender board (or list) sorted by deadline; countdown chips (T-3d amber, T-24h red). Opening a tender shows the compliance checklist ring, EMD status, linked opportunity, and documents. "Mark Submitted" requires deadline not passed and warns on incomplete checklist. Award ⇒ prompt to create/convert the linked opportunity to SO and start PBG tracking.

**E. Mobile-first jobs** (per design system): pipeline browsing + drag, quote approval, account lookup, **WhatsApp send**, tender deadline alerts. Desktop-only: estimation/cost sheets, rate masters, bulk imports, report building.

### 6.4 Interaction standards
- **Tables** (quotation register, tender tracker, lead list): saved filters, sticky headers, inline edit where safe, bulk actions (assign, follow-up task), row-detail drawer before full navigation.
- **Forms:** two-column desktop, single-column mobile; required markers; inline validation (GSTIN checksum as-you-type); embedded AI-draft panels.
- **KPI cards:** one big number + plain-language label + trend delta + sparkline.
- **Empty states** teach the flow ("No quotes yet — create one from an opportunity so costs flow in automatically").
- **Undo over confirm** for low-risk actions (stage drag has 5-s undo toast); explicit confirm only for guarded actions (send, convert, submit bid).

---

## 7. Screen-by-Screen Design

Every screen from PLANNING §2.4, expanded to build-ready detail. Global chrome on all screens: left module rail (IND-CORE modules) → SMBD second-level rail (§8) → breadcrumb → global command bar (search + "ask AI").

### 7.1 Lead — list + detail

| Aspect | Specification |
|---|---|
| **Layout** | List view: filter bar (status, source, campaign, owner, score band, region) + table with columns: Company · Contact · Source/Campaign · Region · Product interest · Score badge · Status pill · Owner · Age · Last activity. Toggle: table ⇄ kanban-by-status. Detail: drawer from row click; full page for edit. |
| **Fields** | source (enum), campaign_id, company, contact name/designation/phone/email, industry, region/state, product interest (multi-select from item groups), status, score (read-only badge + reasons), owner, notes, next-action date |
| **Actions** | New lead · Import CSV (mapping wizard → dedupe report) · Qualify → Convert (wizard: match-or-create Customer, create Contact, create Opportunity with value/stage) · Disqualify (reason) · Reassign · Log activity · WhatsApp/call/email tap-outs (mobile) |
| **States** | New (blue) / Contacted / Qualified (green) / Disqualified (grey, reason on hover) / Converted (locked, links out). Duplicate-suspect banner state. Empty state → "Add your first lead or import an exhibition list". |
| **Mobile** | Card list with score badge and one-thumb actions: call, WhatsApp, log note, qualify. "Add lead" as 4-field quick form (company, name, phone, interest) for exhibition floors — completes in < 20 s. |

### 7.2 Opportunity / Pipeline (Kanban) — the landing view

| Aspect | Specification |
|---|---|
| **Layout** | Top: "Needs me now" strip (overdue follow-ups, expiring quotes, pending approvals) + KPI mini-cards (my pipeline ₹, weighted ₹, closing this month). Board: horizontal-scroll columns per stage, header = stage name + count + Σ value + Σ weighted. Cards: customer, opportunity name, ₹ value, probability %, expected close, owner avatar, next-action chip, days-in-stage dot, ✦ win-probability badge, tender-link icon if bid-driven. |
| **Fields (detail page)** | All FR-SMBD-010 fields + linked quotes (with revisions), activities timeline, milestones (P2), AI panel: win probability + "why", next-best-action suggestion, follow-up draft. |
| **Actions** | Drag between stages (optimistic, 5-s undo) · New opportunity · Create Quotation (primary CTA once stage ≥ Qualified) · Mark Won (routes to SO conversion if quote exists) · Mark Lost (reason mandatory) · Log activity · Filters: owner/team, territory, value band, close month, product line. Board/table/forecast view toggle. |
| **States** | Card ages colour the left border (fresh/amber > 14 d/red > 30 d). Lost cards collapse into a footer group. Stalled state = no activity 21 d → auto "at-risk" chip. |
| **Mobile** | Single-column stage pager (swipe between stages), long-press drag to move stage; card tap → action sheet: call, WhatsApp, log, quote, won/lost. This is the field-sales home screen. |

### 7.3 Quotation Builder

| Aspect | Specification |
|---|---|
| **Layout** | Header band: customer + billing/shipping (place-of-supply chip), quote no. + **Rev n**, date, valid-till, currency, incoterm, payment terms, lead time, status pill. Body: **line grid** (item/spec description, qty, UOM, BOM chip, unit cost, unit price, discount %, HSN, GST %, line total, margin chip). Right rail (desktop): **Cost & margin panel** — stacked bar material/process/OH/margin for selected line + blended quote margin gauge + target-price input. Footer: subtotal, discount, taxable value, CGST/SGST/IGST rows, grand total, amount-in-words. Tabs below: T&C (template picker), internal notes, revision history (diff), activity. |
| **Key fields** | Per FR-SMBD-030/031/032; `bom_id` visible as a chip per line ("KPM-150 BOM Rev C ✓ costed"), tax template auto from place of supply. |
| **Actions** | Add line (item search → BOM auto-link) · **✦ Cost from BOM** (per line or all) · ✦ Draft full quote from opportunity (AI, §13) · Margin/target-price simulation · Save draft · Submit for approval (auto-shown when discount/margin rules trip) · Approve/Reject (manager) · Generate PDF (customer / internal variant) · **Send — Email / WhatsApp** · Create Revision · Mark Won/Lost · Duplicate. |
| **States** | `draft` (editable) → `pending_approval` (locked, approval banner) → `approved` → `sent` (locked; revise to change) → `won` / `lost` / `expired` (auto by validity job). Costing states per line: not-costed (grey) / costed (green, timestamp + rate-master version) / stale (amber — BOM revision or rates changed since costing, "re-cost" nudge). |
| **Mobile** | Read + approve + send only (view PDF, approve with PIN/biometric re-auth, send via WhatsApp/email, add note). Line editing and costing are desktop-only by design. |

### 7.4 Sales Order / OA

| Aspect | Specification |
|---|---|
| **Layout** | Header: SO no., status pill, quote ref (→ link), customer PO no./date, order date, credit-status chip, totals. Sections: lines with delivery schedule (qty, rate, promised date, delivered qty progress bar), billing/shipping GSTIN + addresses, terms/advance, dispatch list (linked), amendment history (P2), events log (Planning hand-off receipt). |
| **Actions** | Convert-from-quote wizard (credit + ATP inline checks) · Confirm (fires event) · Release credit hold (privileged, reason) · OA PDF · Send OA (email/WhatsApp) · Create Dispatch · Amend (P2) · Cancel (reason; blocked once dispatched). |
| **States** | `draft → credit_hold → confirmed → in_progress (Planning ack) → partially_dispatched → completed → cancelled`. Credit-hold shows the failed check verbatim: "Outstanding ₹18.2L + this order ₹9.4L exceeds limit ₹25L". |
| **Mobile** | Status lookup + credit-release approval + OA share. |

### 7.5 Customer 360 — the hub

| Aspect | Specification |
|---|---|
| **Layout** | Header: name, group/territory, MSME badge, owner; KPI cards: lifetime revenue, outstanding ₹ (credit-utilisation bar vs limit), open pipeline ₹, OTD %, last order date, churn-risk badge with ✦ "why". Tabs: **Overview** (timeline + AI account summary) · Contacts · Opportunities · Quotations · Orders · Dispatches · Ledger/Outstanding (read from Accounts) · Complaints (read from Quality) · Activities · Price list & terms. |
| **Fields** | Master per FR-SMBD-080 incl. GSTIN(s) with state decode, PAN, MSME/Udyam no., credit limit/days, payment terms, addresses (billing/shipping, state codes), contacts (primary flag). |
| **Actions** | Edit master (GSTIN checksum validated) · New opportunity/quote from here · Log activity · ✦ Summarise account · ✦ Draft follow-up · Statement share (P2 portal). |
| **States** | Active / dormant (no order 180 d — grey wash + reactivation nudge) / credit-blocked (red banner) / at-risk (amber ✦ badge). |
| **Mobile** | Header + click-to-call/WhatsApp contacts + last 5 orders/quotes + outstanding — the pre-meeting lookup screen. |

### 7.6 Campaigns

| Aspect | Specification |
|---|---|
| **Layout** | List: cards per campaign (type icon, dates, budget vs spend, leads, CPL, ROI×). Detail: funnel visual **Leads → Qualified → Opportunities → Won ₹**, spend fields, lead list tab, import tab. |
| **Fields** | FR-SMBD-050 + actual spend, target segment notes. |
| **Actions** | New campaign · Import leads (CSV wizard) · Copy web-to-lead endpoint/snippet · Close campaign (locks attribution). |
| **States** | Planned / Active / Completed / Cancelled. ROI shows "—" until first attributed order (no fake zeros). |
| **Mobile** | Read-only cards + funnel. |

### 7.7 BD / Tender Tracker

| Aspect | Specification |
|---|---|
| **Layout** | Default: table sorted by deadline with countdown chips; toggle to status board. Columns: Tender ref · Portal badge (GeM/CPPP/IREPS/State/OEM) · Buyer · Est. value · Bid value · **EMD** (₹ / "Exempt-MSME") · Deadline countdown · Checklist ring % · Status · Owner. Detail page: summary card, **compliance checklist** (templated items with status + file refs), EMD/BG panel (amount, mode, instrument ref, expiry, refund status), two-cover contents (P2), L1 result capture, linked opportunity, activity log, documents. Top strip: KPI cards — bids in flight, EMD/BG exposure ₹, win rate, deadlines this week. |
| **Actions** | New tender (or accept from ✦ discovery feed) · Bid/No-Bid decision (records rationale) · Checklist item tick/upload · Record EMD payment / BG issue · Mark Submitted (deadline + checklist guard) · Record technical result · Record L1 result (our rank, L1 price, delta %) · Mark Awarded → create/convert opportunity + PBG entry · Mark Lost/Cancelled · Track EMD refund. |
| **States** | Discovered / No-Bid (kept for analytics) / Prep / Submitted / Technical Eval / Financial-L1 / Awarded / Lost / Cancelled; EMD sub-states paid → refund-due → refunded / forfeited; PBG active → expiring (60-d amber) → released. |
| **Mobile** | Deadline worklist + alert acknowledgements + checklist ticks; document assembly desktop-only. |

### 7.8 Estimation / Costing workbench (desktop-only)

| Aspect | Specification |
|---|---|
| **Layout** | Left: item + BOM revision picker with **BOM explosion tree** (multi-level, qty-rolled). Centre grid: per component — qty/unit, scrap %, rate (editable, source-labelled: price-list / last-PO / standard / manual), amount. Below: **operations grid** from routing — operation, machine, setup min, run min/unit, machine rate ₹/hr, labour rate ₹/hr, amount. Right: **cost-sheet summary** — material, process, overhead % (picker for overhead set), packing/freight, other, subtotal cost, margin % ⇄ target price (bidirectional), suggested unit price, cost-per-unit at quote qty. |
| **Actions** | Explode & auto-price ("Cost it") · Override any rate (flagged + audited) · Change qty (setup re-amortised) · Save cost sheet version · Approve (Estimation role) · Push to quote line (writes unit cost + breakup snapshot, stamps rate-master version) · Compare versions. |
| **States** | Draft / Approved / Pushed-to-quote (immutable snapshot) / Stale (upstream BOM or rate change — banner offering re-cost as a *new version*). Unpriceable components highlighted red with "no rate found" — blocks push until resolved or manually rated. |

### 7.9 Dispatch / Delivery

| Aspect | Specification |
|---|---|
| **Layout** | Worklist of confirmed SO lines due for dispatch (promised-date sorted, late in red). Dispatch form: SO ref, lines+qty (≤ open qty), packing list no., transporter, LR no., vehicle no., **e-way bill no. + validity**, planned/actual date. |
| **Actions** | Create dispatch (full/partial) · Mark packed/dispatched/delivered · Print packing list · Notify customer (P2 WhatsApp) · Jump to Accounts invoice. |
| **States** | Planned / Packed / Dispatched / Delivered; SO line progress bars update; e-way-bill-missing warning when consignment > ₹50,000 (statutory threshold for movement of goods). |
| **Mobile** | Status updates + delivered confirmation from the field. |

### 7.10 SMBD Dashboard

KPI cards: **Weighted pipeline ₹ · Quote conversion % · Order book ₹ vs target · Win rate % · Tender EMD/BG exposure ₹** (each: big number, plain label, trend delta, sparkline). Charts: funnel by stage; win/loss-reasons bar; sales-vs-plan trend; customer-concentration donut (top-5 share). Worklist strip: expiring quotes, overdue follow-ups, credit-hold SOs, tender deadlines ≤ 7 d. Manager filter: team/person/territory/period. Every element clicks through to its register.

---

## 8. Navigation

Second-level rail inside SMBD (order fixed per PLANNING §2.12):

```
SMBD
├── Leads            (list/kanban, import)
├── Pipeline         ← DEFAULT LANDING for sales roles (Kanban)
├── Quotations       (register + builder)
├── Sales Orders     (register + OA + dispatch worklist)
├── Customers        (list + Customer 360)
├── Campaigns
├── Tenders          (tracker + EMD/BG ledger)   ← default landing for BD role
└── Dashboard        ← default landing for Management role
    ⚙ Setup (role-gated): stages, discount matrix, rate masters, overhead sets,
      T&C templates, checklist templates, targets, notification channels
```

Rules: role-based default landing (Sales → Pipeline, BD → Tenders, Marketing → Campaigns, Management → Dashboard, Estimation → Costing worklist under Quotations). Breadcrumbs on every screen; any entity is one click from parents/children (Customer ↔ Opportunity ↔ Quote ↔ SO ↔ Dispatch). Global command bar supports entity search (`QTN-2026-0142`, "Jain Irrigation") and AI queries ("open quotes above ₹10 lakh expiring this week"). Estimation/Costing opens contextually from a quote line and from the Setup rail (rate masters) rather than occupying a top-level slot — it is a workbench, not a register.

---

## 9. Database Schema (PostgreSQL 16)

Implements the PLANNING §2.5 reference model verbatim in structure, hardened with types, constraints and indexes, plus the `cost_sheet` extension that the Estimation workbench requires. Cross-module FKs (`item`, `bom` → Engineering; `app_user` → platform auth) are logical FKs into those schemas. Money is `NUMERIC(14,2)`, quantities `NUMERIC(12,3)`. All tables carry `created_at/created_by/updated_at/updated_by` (omitted below for brevity, added by a shared mixin) and soft-delete via `is_deleted` where noted.

```sql
CREATE SCHEMA IF NOT EXISTS smbd;

-- ============ ENUMS ============
CREATE TYPE smbd.lead_status    AS ENUM ('new','contacted','qualified','disqualified','converted');
CREATE TYPE smbd.opp_stage      AS ENUM ('enquiry','qualified','quoted','negotiation','won','lost');
CREATE TYPE smbd.quote_status   AS ENUM ('draft','pending_approval','approved','sent','won','lost','expired','void');
CREATE TYPE smbd.so_status      AS ENUM ('draft','credit_hold','confirmed','in_progress','partially_dispatched','completed','cancelled');
CREATE TYPE smbd.tender_status  AS ENUM ('discovered','no_bid','prep','submitted','technical_eval','financial_l1','awarded','lost','cancelled');
CREATE TYPE smbd.activity_type  AS ENUM ('call','email','meeting','task','whatsapp','note');
CREATE TYPE smbd.emd_mode       AS ENUM ('online','bank_guarantee','fdr','dd','exempt_msme','none');

-- ============ CAMPAIGN ============  (Campaign 1:M Lead)
CREATE TABLE smbd.campaign (
  campaign_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('exhibition','email','digital','telecalling','referral','other')),
  channel       TEXT,
  budget        NUMERIC(14,2) DEFAULT 0 CHECK (budget >= 0),
  actual_spend  NUMERIC(14,2) DEFAULT 0 CHECK (actual_spend >= 0),
  start_date    DATE NOT NULL,
  end_date      DATE,
  status        TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','completed','cancelled')),
  CONSTRAINT chk_campaign_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

-- ============ CUSTOMER ============  (converted leads point here; 1:M Contact/Opportunity)
CREATE TABLE smbd.customer (
  customer_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           TEXT NOT NULL,
  gstin          CHAR(15) UNIQUE,          -- NULL for unregistered; format+checksum enforced in app layer
  pan            CHAR(10),                 -- must equal substr(gstin,3,10) when both present (app check)
  msme_status    TEXT NOT NULL DEFAULT 'none' CHECK (msme_status IN ('none','micro','small','medium')),
  udyam_no       TEXT,                     -- e.g. UDYAM-TN-06-0012345
  customer_group TEXT,                     -- OEM / EPC / Government / Distributor / Export
  territory      TEXT,
  state_code     CHAR(2),                  -- derived from GSTIN chars 1-2; drives place-of-supply default
  price_list_id  BIGINT,                    -- FK added after price_list is created (see ALTER below)
  credit_limit   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  credit_days    INT NOT NULL DEFAULT 0 CHECK (credit_days BETWEEN 0 AND 365),
  payment_terms  TEXT,
  owner_id       BIGINT NOT NULL REFERENCES core.app_user(user_id),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT chk_gstin_format CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')
);
CREATE INDEX idx_customer_owner     ON smbd.customer(owner_id);
CREATE INDEX idx_customer_territory ON smbd.customer(territory);
CREATE INDEX idx_customer_name_trgm ON smbd.customer USING gin (name gin_trgm_ops);  -- duplicate detection

CREATE TABLE smbd.customer_address (          -- billing/shipping; shipping drives place of supply
  address_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id  BIGINT NOT NULL REFERENCES smbd.customer(customer_id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('billing','shipping')),
  line1        TEXT NOT NULL, line2 TEXT, city TEXT NOT NULL,
  state_code   CHAR(2) NOT NULL,             -- GST state code, e.g. 33 = Tamil Nadu
  pincode      CHAR(6) NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  gstin        CHAR(15),                     -- branch registration if different
  is_default   BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_addr_customer ON smbd.customer_address(customer_id);

-- ============ CONTACT ============  (Customer 1:M Contact)
CREATE TABLE smbd.contact (
  contact_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id  BIGINT NOT NULL REFERENCES smbd.customer(customer_id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  designation  TEXT,
  email        TEXT,
  phone        TEXT,                         -- E.164; WhatsApp target
  primary_flag BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_contact_customer ON smbd.contact(customer_id);
CREATE UNIQUE INDEX uq_contact_primary ON smbd.contact(customer_id) WHERE primary_flag;  -- one primary per customer

-- ============ LEAD ============  (Campaign 1:M Lead; Lead → Customer/Contact/Opportunity on conversion)
CREATE TABLE smbd.lead (
  lead_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id    BIGINT REFERENCES smbd.campaign(campaign_id),
  source         TEXT NOT NULL CHECK (source IN ('campaign','exhibition','website','referral','tender_portal','cold_call','import','other')),
  company        TEXT NOT NULL,
  contact_name   TEXT, designation TEXT, email TEXT, phone TEXT,
  industry       TEXT,
  region         TEXT, state_code CHAR(2),
  product_interest TEXT[],
  status         smbd.lead_status NOT NULL DEFAULT 'new',
  score          SMALLINT CHECK (score BETWEEN 0 AND 100),   -- AI-written, human-read
  score_reasons  JSONB,
  owner_id       BIGINT NOT NULL REFERENCES core.app_user(user_id),
  converted_customer_id BIGINT REFERENCES smbd.customer(customer_id),
  converted_opp_id      BIGINT,              -- FK added after opportunity table
  is_deleted     BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_lead_owner_status ON smbd.lead(owner_id, status);
CREATE INDEX idx_lead_campaign     ON smbd.lead(campaign_id);
CREATE INDEX idx_lead_company_trgm ON smbd.lead USING gin (company gin_trgm_ops);
CREATE INDEX idx_lead_phone        ON smbd.lead(phone) WHERE phone IS NOT NULL;   -- exact dup check
CREATE INDEX idx_lead_email        ON smbd.lead(lower(email)) WHERE email IS NOT NULL;

-- ============ OPPORTUNITY ============  (Customer 1:M Opportunity 1:M Quotation)
CREATE TABLE smbd.opportunity (
  opp_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id    BIGINT NOT NULL REFERENCES smbd.customer(customer_id),
  lead_id        BIGINT REFERENCES smbd.lead(lead_id),
  name           TEXT NOT NULL,
  value          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (value >= 0),
  stage          smbd.opp_stage NOT NULL DEFAULT 'enquiry',
  probability    SMALLINT NOT NULL DEFAULT 10 CHECK (probability BETWEEN 0 AND 100),
  probability_pinned BOOLEAN NOT NULL DEFAULT FALSE,          -- user override vs stage default
  expected_close DATE,
  competitor     TEXT,
  source         TEXT,
  loss_reason    TEXT,                       -- mandatory when stage='lost' (app-enforced)
  next_action    TEXT, next_action_date DATE,
  owner_id       BIGINT NOT NULL REFERENCES core.app_user(user_id),
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  win_probability_ai SMALLINT CHECK (win_probability_ai BETWEEN 0 AND 100),
  is_deleted     BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE smbd.lead ADD CONSTRAINT fk_lead_conv_opp
  FOREIGN KEY (converted_opp_id) REFERENCES smbd.opportunity(opp_id);
CREATE INDEX idx_opp_customer     ON smbd.opportunity(customer_id);
CREATE INDEX idx_opp_owner_stage  ON smbd.opportunity(owner_id, stage) WHERE status = 'open';  -- Kanban query
CREATE INDEX idx_opp_close_month  ON smbd.opportunity(expected_close) WHERE status = 'open';   -- forecast feed

-- ============ PRICE LIST ============  (Customer → Price_List; slabs per item)
CREATE TABLE smbd.price_list (
  pricelist_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  currency     CHAR(3) NOT NULL DEFAULT 'INR',
  valid_from   DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);
ALTER TABLE smbd.customer ADD CONSTRAINT fk_customer_pricelist
  FOREIGN KEY (price_list_id) REFERENCES smbd.price_list(pricelist_id);

CREATE TABLE smbd.price_list_item (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pricelist_id BIGINT NOT NULL REFERENCES smbd.price_list(pricelist_id) ON DELETE CASCADE,
  item_id      BIGINT NOT NULL REFERENCES eng.item(item_id),
  qty_slab_min NUMERIC(12,3) NOT NULL DEFAULT 0,   -- rate applies from this qty upward
  rate         NUMERIC(14,2) NOT NULL CHECK (rate >= 0),
  UNIQUE (pricelist_id, item_id, qty_slab_min)
);

-- ============ QUOTATION ============  (revisioned: quote_no constant, rev_no increments)
CREATE TABLE smbd.quotation (
  quote_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quote_no       TEXT NOT NULL,               -- QTN-2026-0142
  rev_no         SMALLINT NOT NULL DEFAULT 0 CHECK (rev_no >= 0),
  opp_id         BIGINT REFERENCES smbd.opportunity(opp_id),
  customer_id    BIGINT NOT NULL REFERENCES smbd.customer(customer_id),
  contact_id     BIGINT REFERENCES smbd.contact(contact_id),
  quote_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_till     DATE NOT NULL,
  currency       CHAR(3) NOT NULL DEFAULT 'INR',
  incoterm       TEXT,                        -- EXW/FOR/CIF...
  payment_terms  TEXT,
  lead_time_days INT,
  place_of_supply CHAR(2) NOT NULL,           -- GST state code of delivery
  supplier_state  CHAR(2) NOT NULL,           -- our registration's state (multi-plant ready)
  subtotal       NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  cgst_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total      NUMERIC(14,2) GENERATED ALWAYS AS (cgst_total + sgst_total + igst_total) STORED,
  grand_total    NUMERIC(14,2) NOT NULL DEFAULT 0,
  status         smbd.quote_status NOT NULL DEFAULT 'draft',
  approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by    BIGINT REFERENCES core.app_user(user_id),
  approved_at    TIMESTAMPTZ,
  terms_template TEXT,
  owner_id       BIGINT NOT NULL REFERENCES core.app_user(user_id),
  is_latest_rev  BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT chk_validity CHECK (valid_till >= quote_date),
  CONSTRAINT chk_gst_exclusive CHECK (          -- intra-state XOR inter-state, never both
    (igst_total = 0) OR (cgst_total = 0 AND sgst_total = 0)),
  UNIQUE (quote_no, rev_no)
);
CREATE UNIQUE INDEX uq_quote_latest ON smbd.quotation(quote_no) WHERE is_latest_rev;  -- one actionable rev
CREATE INDEX idx_quote_customer ON smbd.quotation(customer_id);
CREATE INDEX idx_quote_status   ON smbd.quotation(status) WHERE is_latest_rev;
CREATE INDEX idx_quote_expiring ON smbd.quotation(valid_till) WHERE status = 'sent' AND is_latest_rev;

-- ============ QUOTATION_LINE ============  (bom_id → Engineering: the join that makes quotes cost themselves)
CREATE TABLE smbd.quotation_line (
  qline_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quote_id     BIGINT NOT NULL REFERENCES smbd.quotation(quote_id) ON DELETE CASCADE,
  line_no      SMALLINT NOT NULL,
  item_id      BIGINT NOT NULL REFERENCES eng.item(item_id),
  bom_id       BIGINT REFERENCES eng.bom(bom_id),      -- released BOM revision this line was costed against
  description  TEXT,                                    -- spec text; may extend item description
  qty          NUMERIC(12,3) NOT NULL CHECK (qty > 0),
  uom          TEXT NOT NULL,
  unit_cost    NUMERIC(14,2),                           -- from cost sheet push; NULL = not costed
  unit_price   NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  discount_pct NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  hsn_code     VARCHAR(8)    NOT NULL,                  -- 4/6/8-digit HSN
  gst_rate     NUMERIC(5,2)  NOT NULL CHECK (gst_rate IN (0, 0.1, 0.25, 3, 5, 12, 18, 28)),
  taxable_value NUMERIC(14,2) NOT NULL DEFAULT 0,       -- qty*price*(1-disc)
  line_cost    NUMERIC(14,2),                           -- unit_cost * qty
  margin_pct   NUMERIC(6,2),                            -- (taxable_value - line_cost)/taxable_value*100
  cost_sheet_id BIGINT,                                 -- FK to cost_sheet added below
  UNIQUE (quote_id, line_no)
);
CREATE INDEX idx_qline_quote ON smbd.quotation_line(quote_id);
CREATE INDEX idx_qline_item  ON smbd.quotation_line(item_id);   -- "quotes for this item" + win-rate-by-product

-- ============ COST_SHEET (IND-CORE extension) ============  (snapshot behind each costed line)
CREATE TABLE smbd.cost_sheet (
  cost_sheet_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id        BIGINT NOT NULL REFERENCES eng.item(item_id),
  bom_id         BIGINT NOT NULL REFERENCES eng.bom(bom_id),
  version        SMALLINT NOT NULL DEFAULT 1,
  basis_qty      NUMERIC(12,3) NOT NULL,                -- quote qty used for setup amortisation
  material_cost  NUMERIC(14,2) NOT NULL DEFAULT 0,      -- per unit
  process_cost   NUMERIC(14,2) NOT NULL DEFAULT 0,
  overhead_pct   NUMERIC(5,2)  NOT NULL DEFAULT 0,
  overhead_cost  NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_cost     NUMERIC(14,2) NOT NULL DEFAULT 0,      -- packing, freight
  total_cost     NUMERIC(14,2) NOT NULL DEFAULT 0,
  margin_pct     NUMERIC(6,2)  NOT NULL DEFAULT 0,
  suggested_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  rate_master_version TEXT,                             -- audit: which rates costed this
  detail         JSONB NOT NULL,                        -- exploded component & operation lines w/ rate sources
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','pushed','stale')),
  approved_by    BIGINT REFERENCES core.app_user(user_id),
  UNIQUE (item_id, bom_id, version, basis_qty)
);
ALTER TABLE smbd.quotation_line ADD CONSTRAINT fk_qline_costsheet
  FOREIGN KEY (cost_sheet_id) REFERENCES smbd.cost_sheet(cost_sheet_id);

-- ============ SALES_ORDER ============  (Quotation → Sales_Order 1:M SO_Line)
CREATE TABLE smbd.sales_order (
  so_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  so_no          TEXT NOT NULL UNIQUE,                  -- SO-2026-0087
  quote_id       BIGINT REFERENCES smbd.quotation(quote_id),
  customer_id    BIGINT NOT NULL REFERENCES smbd.customer(customer_id),
  cust_po_no     TEXT NOT NULL,
  po_date        DATE NOT NULL,
  order_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date  DATE,                                   -- header-level; lines may override
  billing_address_id  BIGINT REFERENCES smbd.customer_address(address_id),
  shipping_address_id BIGINT REFERENCES smbd.customer_address(address_id),
  place_of_supply CHAR(2) NOT NULL,
  credit_status  TEXT NOT NULL DEFAULT 'pending' CHECK (credit_status IN ('pending','passed','hold','override')),
  credit_override_by BIGINT REFERENCES core.app_user(user_id),
  credit_override_reason TEXT,
  advance_pct    NUMERIC(5,2) DEFAULT 0,
  subtotal       NUMERIC(14,2) NOT NULL DEFAULT 0,
  cgst_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
  total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  status         smbd.so_status NOT NULL DEFAULT 'draft',
  UNIQUE (customer_id, cust_po_no)                       -- duplicate-PO guard
);
CREATE INDEX idx_so_customer ON smbd.sales_order(customer_id);
CREATE INDEX idx_so_status   ON smbd.sales_order(status);

CREATE TABLE smbd.so_line (
  soline_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  so_id         BIGINT NOT NULL REFERENCES smbd.sales_order(so_id) ON DELETE CASCADE,
  line_no       SMALLINT NOT NULL,
  item_id       BIGINT NOT NULL REFERENCES eng.item(item_id),
  qty           NUMERIC(12,3) NOT NULL CHECK (qty > 0),
  uom           TEXT NOT NULL,
  rate          NUMERIC(14,2) NOT NULL,
  hsn_code      VARCHAR(8) NOT NULL,
  gst_rate      NUMERIC(5,2) NOT NULL,
  promised_date DATE NOT NULL,
  delivered_qty NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (delivered_qty >= 0 AND delivered_qty <= qty),
  UNIQUE (so_id, line_no)
);
CREATE INDEX idx_soline_so       ON smbd.so_line(so_id);
CREATE INDEX idx_soline_promised ON smbd.so_line(promised_date) WHERE delivered_qty < qty;  -- dispatch worklist

-- ============ DISPATCH (extension for §7.9) ============
CREATE TABLE smbd.dispatch (
  dispatch_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  so_id        BIGINT NOT NULL REFERENCES smbd.sales_order(so_id),
  dispatch_no  TEXT NOT NULL UNIQUE,                     -- DSP-2026-0031
  planned_date DATE, actual_date DATE,
  transporter  TEXT, lr_no TEXT, vehicle_no TEXT,
  eway_bill_no VARCHAR(12), eway_bill_valid_till DATE,
  packing_list_ref TEXT,
  status       TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','packed','dispatched','delivered')),
  lines        JSONB NOT NULL                            -- [{soline_id, qty}]
);
CREATE INDEX idx_dispatch_so ON smbd.dispatch(so_id);

-- ============ ACTIVITY ============  (polymorphic over Lead/Opp/Customer/Quote/Tender)
CREATE TABLE smbd.activity (
  activity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ref_type    TEXT NOT NULL CHECK (ref_type IN ('lead','opportunity','customer','quotation','sales_order','tender')),
  ref_id      BIGINT NOT NULL,
  type        smbd.activity_type NOT NULL,
  subject     TEXT NOT NULL,
  due_at      TIMESTAMPTZ,
  done_at     TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  owner_id    BIGINT NOT NULL REFERENCES core.app_user(user_id),
  notes       TEXT
);
CREATE INDEX idx_activity_ref   ON smbd.activity(ref_type, ref_id);         -- timeline query
CREATE INDEX idx_activity_owner ON smbd.activity(owner_id, due_at) WHERE status = 'open';  -- "my follow-ups"

-- ============ TENDER ============  (Tender ↔ Opportunity)
CREATE TABLE smbd.tender (
  tender_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal        TEXT NOT NULL CHECK (portal IN ('gem','cppp','ireps','state','oem','other')),
  tender_ref    TEXT NOT NULL,                           -- e.g. GEM/2026/B/4412873
  buyer         TEXT NOT NULL,                           -- PSU / department / OEM
  category      TEXT,
  est_value     NUMERIC(14,2),
  bid_value     NUMERIC(14,2),
  emd_amount    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (emd_amount >= 0),
  emd_mode      smbd.emd_mode NOT NULL DEFAULT 'none',
  emd_paid_on   DATE, emd_refund_due BOOLEAN NOT NULL DEFAULT FALSE, emd_refunded_on DATE,
  bg_ref        TEXT,                                    -- bid-security / PBG instrument no.
  bg_expiry     DATE,
  deadline      TIMESTAMPTZ NOT NULL,                    -- submission cut-off (date+time, IST)
  opening_date  TIMESTAMPTZ,
  checklist     JSONB NOT NULL DEFAULT '[]',             -- [{item, status, file_ref}]
  l1_price      NUMERIC(14,2), our_rank SMALLINT,
  status        smbd.tender_status NOT NULL DEFAULT 'discovered',
  no_bid_reason TEXT,
  fit_score_ai  SMALLINT CHECK (fit_score_ai BETWEEN 0 AND 100),
  owner_id      BIGINT NOT NULL REFERENCES core.app_user(user_id),
  opp_id        BIGINT REFERENCES smbd.opportunity(opp_id),
  UNIQUE (portal, tender_ref)
);
CREATE INDEX idx_tender_deadline ON smbd.tender(deadline)
  WHERE status IN ('discovered','prep');                 -- deadline-alert job scans this
CREATE INDEX idx_tender_status   ON smbd.tender(status);

-- ============ OUTBOX (event hand-off, §11.6) ============
CREATE TABLE smbd.event_outbox (
  event_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type  TEXT NOT NULL,                             -- smbd.sales_order.confirmed, ...
  aggregate   TEXT NOT NULL, aggregate_id BIGINT NOT NULL,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
CREATE INDEX idx_outbox_unpublished ON smbd.event_outbox(created_at) WHERE published_at IS NULL;
```

**Cardinality notes (per PLANNING §2.5):**
- `campaign 1:M lead`; a lead converts into `customer` + `contact` + `opportunity` (links retained on the lead — attribution survives conversion).
- `customer 1:M opportunity 1:M quotation` — quotation is **revisioned**: (`quote_no`, `rev_no`) unique, one row per revision, partial-unique index guarantees exactly one actionable latest revision.
- `quotation 1:M quotation_line`; **`quotation_line.bom_id → eng.bom` is the join that makes quotes cost themselves** — cost sheets snapshot the explosion so historical quotes keep their economics even after BOM/rate changes.
- `quotation → sales_order 1:M so_line`; `so_line.delivered_qty` accumulates from `dispatch` rows.
- `customer → price_list` (M:1) with qty-slab rows; `activity` is polymorphic via (`ref_type`,`ref_id`) — no FK, integrity enforced in the service layer, indexed for timeline reads; `tender ↔ opportunity` optional 1:1.
- Requires extensions: `pg_trgm` (dup detection), `pgvector` (AI embeddings, separate `ai` schema).

---

## 10. API Design

Base path `/api/v1/smbd`. REST + OpenAPI (FastAPI auto-docs). JWT bearer auth; every endpoint enforces RBAC + territory scoping (§14). List endpoints support `?page,size,sort,q` + saved-filter params. Errors follow RFC 9457 problem+json.

| # | Method & Path | Purpose | Notes |
|---|---|---|---|
| 1 | `GET/POST /leads` · `GET/PATCH/DELETE /leads/{id}` | Lead CRUD | POST runs dup detection, returns `duplicates[]` warnings |
| 2 | `POST /leads/import` | CSV/Excel bulk import | multipart; async job; returns `job_id` → progress via SSE |
| 3 | `POST /public/web-to-lead` | Website enquiry capture | API-key + rate-limited; no JWT |
| 4 | `POST /leads/{id}/convert` | Lead → Customer+Contact+Opportunity | body: match existing customer or create; transactional |
| 5 | `GET /pipeline` | Kanban payload: stages + cards + Σ/weighted Σ | single round-trip for board render |
| 6 | `GET/POST /opportunities` · `GET/PATCH /opportunities/{id}` | Opportunity CRUD | |
| 7 | `POST /opportunities/{id}/stage` | Drag-drop stage move | body: `{stage, loss_reason?}`; validates transition; returns new probability |
| 8 | `GET/POST /customers` · `GET/PATCH /customers/{id}` | Customer CRUD | GSTIN checksum validated server-side |
| 9 | `GET /customers/{id}/360` | Aggregated 360 payload (KPIs + tab counts) | tabs page separately |
| 10 | `GET /customers/{id}/credit-check?order_value=` | **Credit gate**: limit, outstanding (from Accounts), verdict | used inline by SO conversion; < 500 ms |
| 11 | `GET/POST /quotes` · `GET/PATCH /quotes/{id}` | Quotation CRUD (draft only editable) | POST accepts `opp_id` to pre-fill |
| 12 | `POST /quotes/{id}/cost` | **Quote costing: explodes BOM + routing via Engineering, prices from rate masters, computes margin** | body: `{lines: [qline_id] \| 'all', overhead_set, margin_pct \| target_price}`; returns cost sheet per line with rate sources; persists `cost_sheet` rows |
| 13 | `GET /items/{id}/bom-cost?qty=&bom_id=` | Raw cost explosion for the Estimation workbench | powers workbench before a quote exists |
| 14 | `POST /quotes/{id}/submit-approval` · `POST /quotes/{id}/approve` · `/reject` | Discount approval flow | approve/reject manager+; reason on reject |
| 15 | `POST /quotes/{id}/revise` | New revision (rev_no+1), old locked | copies lines; returns new quote_id |
| 16 | `GET /quotes/{id}/pdf?variant=customer\|internal` | **Quote PDF** (WeasyPrint render) | internal variant role-gated (shows cost/margin) |
| 17 | `POST /quotes/{id}/send` | Email/WhatsApp send | body: `{channels:['email','whatsapp'], contact_id}`; logs Activity; flips status to `sent` |
| 18 | `POST /quotes/{id}/convert-to-so` | **One-click won-quote → SO**; runs credit + ATP inline, returns check results; `confirm=true` finalises | 409 with check-detail when credit fails (unless `override` + privilege) |
| 19 | `GET /atp?item_id=&qty=&date=` | **ATP check** proxy to Inventory/Planning | per-line array variant: `POST /atp/batch` |
| 20 | `GET/POST /sales-orders` · `GET/PATCH /sales-orders/{id}` | SO CRUD | confirm action: `POST /sales-orders/{id}/confirm` → outbox event |
| 21 | `POST /sales-orders/{id}/release-credit-hold` | Privileged override | body: `{reason}` mandatory; audited |
| 22 | `GET /sales-orders/{id}/oa-pdf` · `POST /sales-orders/{id}/send` | OA document + send | |
| 23 | `GET/POST /dispatches` · `PATCH /dispatches/{id}` | Dispatch CRUD + status | validates qty ≤ open; e-way-bill warning > ₹50k |
| 24 | `GET/POST /campaigns` · `GET /campaigns/{id}/roi` | Campaign CRUD + attributed funnel/ROI | ROI computed from lead→opp→SO chain |
| 25 | `GET/POST /tenders` · `GET/PATCH /tenders/{id}` | Tender CRUD | status transitions validated (no skip to `awarded` from `discovered`) |
| 26 | `PATCH /tenders/{id}/checklist` | Tick/upload checklist items | file refs to document store |
| 27 | `GET /tenders/alerts?window=7d` | **Tender deadline alerts** feed (in-app worklist) | scheduled job also pushes email/WhatsApp at T-7d/3d/24h/4h |
| 28 | `GET /tenders/exposure` | EMD/BG exposure ledger + refund-overdue list | dashboard KPI source |
| 29 | `GET/POST /rate-masters/…` | Material/machine/labour/overhead rate CRUD | Estimation role; effective-dated |
| 30 | `GET/POST /activities` · `PATCH /activities/{id}` | Polymorphic activity log | `?ref_type=&ref_id=` timeline |
| 31 | `GET /dashboard` | KPI cards + chart datasets in one payload | per-role scoping applied |
| 32 | `GET /reports/{report}` | pipeline, win-loss, quote-conversion, sales-vs-target, concentration, tender, roi, otd | `?format=json\|csv\|xlsx` |
| 33 | `POST /ai/lead-score/{lead_id}` · batch | Recompute score, returns score + reasons | writes `score`, `score_reasons` |
| 34 | `POST /ai/quote-draft` | **Auto-quotation**: from `{opp_id}` propose lines + BOM cost + price | returns draft for human review — never auto-sends |
| 35 | `POST /ai/tender-fit/{tender_id}` | Fit-score + reasons vs capability profile | |
| 36 | `POST /ai/assistant` | Conversational: NL → scoped query/summary/draft | SSE streaming; tool-calls limited to read + draft |
| 37 | `GET /events/stream` | SSE: approvals, alerts, kanban updates | WebSocket upgrade path P2 |

**Conventions:** monetary fields as strings in JSON to avoid float drift (`"grand_total": "1234567.89"`); idempotency keys on POST conversion/confirm endpoints; all mutating endpoints emit audit records; costing endpoint returns `rate_source` per component (`price_list | last_po | standard | manual`) so the UI can label provenance.

---

## 11. Backend Logic

### 11.1 Costing engine (the heart of the module)

Service: `smbd/services/costing.py`. Pure-function core (deterministic, unit-testable) + thin orchestration that reads Engineering and rate masters.

```
unit_material_cost = Σ over exploded BOM components:
                       component_qty_per_unit × (1 + scrap_pct) × material_rate
                     where material_rate resolves in order:
                       ① purchase price list (effective-dated) → ② last PO rate → ③ standard rate → ④ FLAG (no silent zero)

unit_process_cost  = Σ over routing operations:
                       (run_min/60) × (machine_rate + labour_rate)
                     + (setup_min/60) × (machine_rate + labour_rate) / basis_qty      -- setup amortised

unit_overhead      = (unit_material_cost + unit_process_cost) × overhead_pct         -- factory+admin set
unit_other         = packing + freight (per-unit or amortised lump)
unit_total_cost    = material + process + overhead + other

suggested_price    = unit_total_cost / (1 − margin_pct/100)          -- margin on price, not markup on cost
target mode        : margin_pct = (target_price − unit_total_cost) / target_price × 100
```

Rules: multi-level BOM explosion is recursive with cycle detection (delegated to Engineering's explode API, cached per `bom_id+revision` in Redis, TTL 10 min, invalidated by `eng.bom.released` events); every component carries its `rate_source`; result persisted as an immutable `cost_sheet` (JSONB detail) and referenced by the quote line — re-costing creates a *new version*, never mutates. A `stale` marker is set on cost sheets when a consumed BOM revision or rate master changes (event-driven), driving the amber "re-cost" nudge in the UI. This mirrors Epicor Kinetic's costing-workbench pattern (rollups with audit and variance before posting) at SME scale.

### 11.2 GST computation (place of supply)

Service: `smbd/services/gst.py`. Per the IGST Act: **intra-state** (place of supply state == supplier registration state) ⇒ CGST + SGST at rate/2 each; **inter-state** ⇒ IGST at full rate. Place of supply for goods = shipping destination state (from shipping address `state_code`; defaults from customer GSTIN prefix).

```
line.taxable_value = round2(qty × unit_price × (1 − discount_pct/100))
if place_of_supply == supplier_state:
    line.cgst = round2(taxable_value × gst_rate/200)   # half-rate each
    line.sgst = round2(taxable_value × gst_rate/200)
    line.igst = 0
else:
    line.igst = round2(taxable_value × gst_rate/100); line.cgst = line.sgst = 0
header totals = Σ lines;  grand_total = round0(subtotal − discount + tax_total)   # rupee rounding, "round-off" line shown
```

The DB `chk_gst_exclusive` constraint guarantees a document is never both. HSN is mandatory on every line (validated 4/6/8 digits — 6-digit reporting is mandatory for AATO > ₹5 crore). SMBD stores everything the Accounts module's e-invoice service needs to build the IRP JSON (Seller/Buyer GSTIN, POS, HSN, rate-wise splits) so no re-keying happens at invoice time — IRN generation itself (via GSP/IRP API, with its 24-hour cancellation window and 30-day reporting limit for AATO ≥ ₹10 crore) lives in Accounts.

### 11.3 Quotation revisioning
`POST /quotes/{id}/revise`: in one transaction — verify caller owns latest rev; set `is_latest_rev=false` on current; insert new row with `rev_no+1`, copied lines (cost-sheet references carried, marked for freshness re-check); status `draft`. Sent revisions are immutable (server rejects PATCH on any rev with status ≥ `sent`). Diff endpoint compares line sets by `item_id` for the revision-history UI. Numbering: `QTN-{FY}-{seq}` where FY is April-March Indian fiscal year (`2026` = FY 2026-27), sequence from a per-FY Postgres sequence.

### 11.4 Discount approval & credit gate
- **Discount matrix** (config table): role → max line-discount % and max blended-margin floor. On quote save/submit, the engine computes the trip condition; if tripped ⇒ `approval_required=true`, status `pending_approval`, notification to the approver chain (Sales Manager → Management by threshold bands). Approvals stamp user+time and unlock Send.
- **Credit gate** at SO conversion/confirmation: `outstanding` fetched from Accounts (`GET /accounts/customers/{id}/outstanding`, cached 5 min, bypass-cache on confirm). Verdict: `pass` if `outstanding + order_total ≤ credit_limit` and no overdue > `credit_days + grace`; else `hold`. Hold ⇒ SO persists in `credit_hold`, cannot emit the Planning event; release requires `credit.override` permission + reason (audited). All three inputs (limit, outstanding, order value) are snapshotted onto the SO for later audit.

### 11.5 ATP check
Proxy to Inventory/Planning: for each line, `available_now = on_hand − reserved`; if short, promise date = earliest of (open production order completion, MRP-planned receipt) + buffer. SMBD renders verdicts (`in-stock / partial / make-to-order with date`) and stores the promised dates on SO lines. In MVP demo mode this reads a seeded availability table; the interface (`AtpProvider` protocol) is swapped for the real Planning service in Phase 2 — same contract.

### 11.6 SO → Planning hand-off (event-driven)
Transactional-outbox pattern: SO confirmation writes the SO **and** an `event_outbox` row in the same transaction; a background worker (Redis-backed, e.g. arq/Celery beat) publishes to the internal event bus (Redis Streams in the demo; NATS/RabbitMQ-ready) with at-least-once delivery + consumer idempotency keys. Events: `smbd.sales_order.confirmed` (header+lines payload), `smbd.sales_order.amended`, `smbd.sales_order.cancelled`, `smbd.quotation.won`, plus consumed events `eng.bom.released` (stale-cost marking) and `accounts.payment.received` (credit refresh).

### 11.7 Forecast / weighted-pipeline feed
Nightly job materialises `smbd.pipeline_snapshot` (date, owner, stage, Σ value, Σ weighted value = Σ value×probability, expected-close bucket). Exposed as `GET /reports/pipeline-forecast` and published monthly to Planning's S&OP intake (`smbd.forecast.updated` event) — weighted pipeline by item family/month, explicitly labelled *unconfirmed demand* so Planning treats it as forecast, not orders.

### 11.8 Scheduled jobs
| Job | Schedule | Action |
|---|---|---|
| Quote expiry | daily 00:30 IST | `sent` quotes past `valid_till` → `expired`; notify owner |
| Tender deadline alerts | every 15 min | scan `idx_tender_deadline`; fire T-7d/3d/24h/4h notifications (dedup via alert log) |
| EMD refund watch | daily | tenders `lost/awarded` with `emd_refund_due` and no `emd_refunded_on` after 30 d → worklist |
| BG/PBG expiry watch | daily | `bg_expiry` within 60 d → notify BD + Accounts |
| Pipeline snapshot | nightly | §11.7 |
| Stale-cost sweep | on event + nightly | mark cost sheets stale on BOM/rate change |
| Churn signals | weekly | order-frequency/receivable/complaint features → at-risk flags (§13.5) |

### 11.9 Notification service
Single internal interface `notify(user|contact, template, channel[in_app,email,whatsapp], payload)`; channel adapters: in-app (SSE + table), SMTP, WhatsApp BSP adapter (§19). Templates versioned; WhatsApp business-initiated messages must use pre-approved templates (Meta rule) — template names mirrored in config. All sends logged as Activities where customer-facing.

---

## 12. Frontend Components

React 18 + TypeScript component inventory (shadcn/ui + Tailwind base; TanStack Query for server state, TanStack Table for registers). Feature-folder layout `src/features/smbd/*`.

| Component | Key props/state | Behaviour notes |
|---|---|---|
| `PipelineBoard` | stages[], cards[], filters | **dnd-kit** based Kanban (chosen over hello-pangea/dnd for touch sensors + virtualisation flexibility; hello-pangea acceptable fallback for speed — see §19). Optimistic stage move via `useMutation` + rollback; column virtualisation > 50 cards; 5-s undo toast |
| `DealCard` | opportunity summary | value/weighted, ✦ win-prob badge, age border, next-action chip, tender icon; memoised |
| `NeedsMeNowStrip` | worklist items | SSE-fed; approval/expiry/deadline chips deep-link |
| `QuoteBuilder` | quote, lines, costPanel | Container for grid + panel + footer; server as source of truth, client mirror of tax/margin math for < 100 ms feedback |
| `QuoteLineGrid` | editable rows | TanStack Table + controlled inputs; per-row BOM chip, margin chip (green/amber/red vs floor); keyboard-first entry |
| `CostMarginPanel` | selected line cost sheet | Stacked bar (material/process/OH/margin), margin ⇄ price bidirectional slider, target-price input; **live margin simulation** debounced 150 ms |
| `GstSummaryFooter` | lines, POS, supplier state | Renders CGST/SGST vs IGST rows + round-off + amount-in-words (Indian numbering util `toIndianWords`, `formatINR` with ##,##,### grouping) |
| `ApprovalBanner` | quote/SO approval state | Shows trip reason ("Discount 12% > your 10% limit"), approver, CTA by role |
| `ConvertToSoDialog` | quote, checks | Stepper: PO details → credit check row → ATP rows (per line pass/warn/fail) → confirm; renders 409 detail on credit fail with override path |
| `Customer360Tabs` | customerId | Lazy-loaded tab routes; header KPI cards; churn badge with ✦ "why" popover |
| `LeadImportWizard` | file, mapping, report | Column-mapping step, dedupe-report step, async job progress (SSE) |
| `TenderTracker` | tenders, view | Deadline-sorted table ⇄ status board toggle; countdown chips (amber T-3d, red T-24h) |
| `TenderChecklist` | checklist[] | Templated items, tick/upload, completion ring; blocks "Mark Submitted" warning |
| `EmdExposureCard` | ledger | KPI + drill list (paid/refund-due/forfeited) |
| `CostingWorkbench` | item, bom, rates | Desktop-only route: explosion tree (virtualised), component & operation grids, summary rail; rate-source labels; version compare |
| `DashboardKpiCard` | value, delta, spark | Shared design-system card (big number, plain label, sparkline — Recharts) |
| `FunnelChart` / `WinLossBar` / `ConcentrationDonut` / `SalesTrendLine` | datasets | Recharts; click-through to registers |
| `ActivityTimeline` | refType, refId | Polymorphic; inline quick-log (call/note/WhatsApp) |
| `WhatsAppSendSheet` | doc, contacts | Mobile bottom-sheet: pick contact, preview template + PDF, send; falls back to `wa.me` share intent in MVP stub |
| `AiPanel` | context, action | The consistent "✦ AI" surface: proposal + evidence + Approve/Discard; streams via SSE |
| `GstinInput` | value | Masked input, live format+checksum validation, state-name decode chip |
| `RegisterTable` | columns, savedFilters | Shared: sticky header, saved filters, bulk actions, row drawer, CSV export, virtual scroll |

Routing (`react-router`): `/smbd` → role-based redirect; `/smbd/pipeline`, `/smbd/leads`, `/smbd/quotes/:id(rev tab)`, `/smbd/orders/:id`, `/smbd/customers/:id/:tab`, `/smbd/campaigns/:id`, `/smbd/tenders/:id`, `/smbd/dashboard`, `/smbd/costing/:itemId`. Mobile: same routes, responsive layouts; PWA install for field sales.

---

## 13. AI Features

**Trust model (design-system rule): the AI drafts, a human approves.** Every AI surface shows its evidence and never writes to the ERP without a click. All calls go through a backend `ai_gateway` service (prompt templates versioned in-repo, request/response logged, PII minimised — contact phone/email masked before leaving the boundary; on-prem/local-model deployable for DPDP-sensitive customers).

### 13.1 Lead scoring
- **MVP (demo-honest):** transparent weighted-rules model — source quality, industry fit, region, product-interest match, engagement recency, company-size hint → 0–100 + reason chips. Labelled "rule-based score" in UI.
- **Phase 2:** logistic-regression/gradient-boosted model trained on won/lost history (features above + activity counts + response latency), the approach Odoo's predictive lead scoring popularised at SME price. Retrain weekly job; scores + top-3 SHAP-style reasons written to `lead.score/score_reasons`.
- **Data flow:** lead upsert → score job (async, < 5 s) → badge on UI. Never blocks or auto-disqualifies.

### 13.2 Quote-win prediction & next-best-action
Features: customer history (win rate, repeat), quote margin vs segment norm, revision count, days-in-negotiation, competitor presence, activity cadence. Output: win-probability on quote/opportunity + at-risk flags ("no activity 14 d, validity expires in 5 d") feeding the Needs-Me-Now strip. Next-best-action = template suggestions (call, revise validity, escalate discount approval) — patterned on D365's Sales Qualification Agent next-best-action grid (Microsoft, 2025 wave 2), but strictly suggest-only.

### 13.3 Auto-quotation from BOM (differentiator)
Flow: `POST /ai/quote-draft {opp_id}` → gateway assembles context (opportunity products, customer terms/price-list history, matching items with released BOMs, costing-engine output per line) → Claude drafts: line selection + qty interpretation from enquiry text, commercial terms, cover note. **The numbers never come from the LLM** — prices/costs are computed by the deterministic costing engine (§11.1); the LLM arranges, explains, and drafts prose. Response renders in the AiPanel as a draft quote diff; user approves → normal draft quote created. Prompt sketch:

```
System: You are the quotation assistant for {company}. You must not invent prices,
costs, HSN codes or GST rates — use only the COSTED_LINES provided. Output JSON
per schema QuoteDraft. Flag any enquiry item you could not match to an item code.
User: ENQUIRY_TEXT … / CUSTOMER_PROFILE … / COSTED_LINES[…] / TERMS_LIBRARY[…]
```

### 13.4 Tender discovery, fit-scoring & response drafting (differentiator)
- **Discovery (P2):** scheduled fetchers pull GeM/CPPP public search feeds + keyword/CPV-category subscriptions; normalised into a *suggested tenders* inbox (never auto-added to tracker).
- **Fit-scoring:** capability profile (our items, HSN/categories, turnover band, MSE/Udyam status, past wins by buyer) embedded via pgvector; tender text embedded and matched; Claude composes a 0–100 fit score + reasons (eligibility gaps highlighted: "requires ₹25 Cr turnover — we qualify via MSE exemption? verify clause 4.2"). Human accepts → tracker row with `fit_score_ai`.
- **Response drafting (P3):** generative first-draft of technical compliance sheet + bid cover letter from checklist + product datasheets (RAG over document store); estimator and BD approve every page.
- **MVP demo:** seeded suggested-tender list + fit scores over demo capability profile (§20).

### 13.5 Churn / at-risk account alerts
Weekly job computes per-customer signals: order-frequency slope (this-year vs trailing), receivables aging breach, open complaints, quote-decline streak. Rule thresholds set the badge; Claude generates the **account-at-risk narrative** on demand ("✦ why is this account at risk") citing the exact signals (numbers passed in context — no invention). Suggested play: reactivation call script draft.

### 13.6 Conversational assistant
`POST /ai/assistant` — tool-calling over a *read-only + draft-only* toolset: `search_quotes`, `search_orders`, `pipeline_summary`, `account_summary`, `draft_followup`, `draft_whatsapp`. Queries like "open quotes above ₹10 lakh expiring this week", "summarise Jain Irrigation", "draft a follow-up for QTN-2026-0142". RBAC/territory scoping applied inside each tool (the model never sees data the user couldn't). Responses stream (SSE) into the command-bar panel; any draft ends in an Approve button.

### 13.7 Guardrails summary
No AI write-path to commercial documents; numeric fields always computed, never generated; prompts + completions logged 90 d for audit; per-tenant AI on/off switch; graceful degradation (AI outage ⇒ badges hide, CRUD unaffected); embeddings stored in `ai.embedding` (pgvector) keyed by entity, refreshed on update events.

---

## 14. Security

### 14.1 Roles × permissions (RBAC)

| Capability | Sales Exec | Sales Mgr | Marketing | BD/Tender | Estimation | Management | Accounts (x-module) |
|---|---|---|---|---|---|---|---|
| Leads CRUD | Own/territory | Team | All (create/import) | — | — | Read | — |
| Opportunities | Own/territory | Team + reassign | Read | Own (tender-linked) | Read | Read all | — |
| Quotes create/edit | Own, ≤ discount limit | Team + approve tier-1 | — | Own | Cost fields | Approve tier-2 | Read |
| Internal (cost) PDF variant | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ |
| Cost sheets / rate masters | Read own-quote result | Read | — | Read | **Full** | Read | — |
| SO confirm | Own (credit-pass only) | Team | — | Own | — | Read | — |
| Credit-hold release | ✗ | Limit-band | ✗ | ✗ | ✗ | ✓ | ✓ |
| Customers master edit | Own | Team | Read | Read | Read | Read | Credit fields |
| Campaigns | Read | Read | **Full** | Read | — | Read | — |
| Tenders | Read | Read | Read | **Full** | Costing support | Read | EMD/BG entries |
| Dashboards/reports | Own scope | Team scope | Marketing | BD scope | — | **All** | Finance |
| Setup (stages, matrices, templates) | ✗ | Partial | Templates | Checklist templates | Rate masters | ✓ | ✗ |

Implementation: permission strings (`smbd.quote.approve.tier1`, `smbd.credit.override`, …) attached to roles; FastAPI dependency `require(perm)`; row-level scoping injected into every query via a `ScopedQuery` helper: `owner_id = me` OR `territory IN my_territories` OR team-subtree for managers (closure table on the org hierarchy). Territory is a first-class column on customer/lead/opportunity.

### 14.2 Approval matrices (data-driven, Setup-editable)
- **Discount:** e.g. Exec ≤ 10% line & margin ≥ 15%; Manager ≤ 18% & margin ≥ 10%; Management unlimited (logged). Trip ⇒ `pending_approval` chain.
- **Credit override bands:** Manager ≤ 120% of limit; Management/Accounts beyond. Reason mandatory, immutable audit row.
- **Cost-sheet approval:** quotes > configurable value require Estimation-approved cost sheets (P2).

### 14.3 Platform security
JWT access (15 min) + rotating refresh (7 d, httpOnly); optional TOTP for approver roles; re-auth (PIN/biometric on mobile) for approve/override actions. Audit: append-only `core.audit_log` (actor, entity, action, before/after diff, IP, ts) for all commercial-document mutations — quotations/SOs never hard-deleted (`void` status). PII: contact phone/email visible per role, exports watermarked + logged; DPDP-aligned data-principal deletion honoured by anonymising contacts, never breaking document trails. Public web-to-lead endpoint: API key + rate limit + honeypot field. WhatsApp/Email adapters keep provider tokens in server-side secrets (never in client), per-tenant.

---

## 15. Validation Rules

| # | Rule | Layer(s) |
|---|---|---|
| V1 | **GSTIN**: 15 chars matching `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$` **plus Luhn-mod-36 checksum** on char 15; state code (chars 1–2) must be a valid GST state code and sets `state_code` | UI (as-you-type) + API (Pydantic validator) + DB regex CHECK |
| V2 | **PAN** `^[A-Z]{5}[0-9]{4}[A-Z]$`; when GSTIN present, PAN must equal GSTIN chars 3–12 | UI + API |
| V3 | **HSN presence**: every quotation/SO line requires HSN (4/6/8 digits, numeric); 6-digit minimum warning for AATO > ₹5 Cr tenants | API + DB NOT NULL |
| V4 | **GST rate** ∈ {0, 0.1, 0.25, 3, 5, 12, 18, 28}; document-level intra/inter-state exclusivity (`chk_gst_exclusive`) | API + DB CHECK |
| V5 | **Quote validity**: `valid_till ≥ quote_date`; default +30 d; Send blocked if already past; expiry job flips status | API + DB CHECK + job |
| V6 | **Discount limits**: line `discount_pct` ≤ role cap unless approval granted; blended margin ≥ configured floor or approval | API (matrix engine); UI pre-warns |
| V7 | **Duplicate lead**: on create/import — exact match on phone/lower(email)/GSTIN, trigram similarity ≥ 0.55 on company vs leads+customers ⇒ warn with merge/link options; import report lists dup rows | API + pg_trgm indexes |
| V8 | **Duplicate customer PO**: unique (customer_id, cust_po_no) — friendly error suggests opening the existing SO | DB UNIQUE + API |
| V9 | **Qty/price sanity**: qty > 0; unit_price ≥ 0; delivered_qty ≤ ordered qty; dispatch qty ≤ open qty | DB CHECK + API |
| V10 | **Stage/status transitions**: only legal moves (e.g. quote `sent→won/lost/expired`; tender cannot jump `discovered→awarded`); Lost requires reason | API state machine |
| V11 | **Credit fields**: credit_limit ≥ 0; credit_days 0–365; SO confirm requires credit verdict recorded | DB + API |
| V12 | **Tender**: deadline must be future on create; `emd_mode='exempt_msme'` requires customer/self Udyam no. recorded; Mark-Submitted blocked after deadline (hard) and warned on checklist < 100% | API |
| V13 | **Pincode** `^[1-9][0-9]{5}$`; phone normalised to E.164 (+91 default) | UI + API |
| V14 | **Immutability**: sent quote revisions, pushed cost sheets and confirmed-SO tax fields reject edits | API guards |
| V15 | **Amount consistency**: header totals recomputed server-side from lines on every save; client values never trusted | API |

---

## 16. Testing Strategy

Unit (pytest, pure services) → API (httpx + test Postgres via testcontainers) → E2E (Playwright) → load (k6 on pipeline/costing endpoints). Target: costing & GST services 100% branch coverage. Concrete cases:

### 16.1 GST split correctness
| Case | Input | Expected |
|---|---|---|
| T-GST-01 intra-state | Supplier TN (33), ship-to TN (33), line ₹1,00,000 taxable @18% | CGST ₹9,000 + SGST ₹9,000, IGST 0 |
| T-GST-02 inter-state | Supplier TN (33), ship-to MH (27), same line | IGST ₹18,000, CGST=SGST=0 |
| T-GST-03 bill-to ≠ ship-to | Bill-to Delhi (07), ship-to TN (33), supplier TN | Intra-state split (place of supply = 33 destination of goods) |
| T-GST-04 rounding | Line 3 × ₹333.33 @18%, disc 2.5% | taxable ₹975.00 (round-half-up 2 dp); tax splits sum to header within ₹0.01; grand total rupee-rounded with round-off line |
| T-GST-05 mixed rates | Lines @12% and @18% inter-state | IGST per line-rate; header = Σ lines exactly |
| T-GST-06 exclusivity | Attempt to save doc with CGST>0 and IGST>0 | DB CHECK + API 422 |

### 16.2 BOM cost rollup into quote
| Case | Input | Expected |
|---|---|---|
| T-COST-01 3-level rollup | BOM: casting (12 kg × ₹190/kg, scrap 3%) + impeller sub-BOM + 6 ops routing | material = Σ leaf qty×(1+scrap)×rate; process = Σ (run+amortised setup)×rates; totals match hand-computed fixture within ₹0.01 |
| T-COST-02 rate fallback | Component with no price-list rate but last-PO rate | rate_source='last_po'; no zero-rate lines |
| T-COST-03 unpriceable | Component with no rate anywhere | flagged red; push-to-quote blocked (422) |
| T-COST-04 setup amortisation | Same BOM, qty 10 vs 100 | unit process cost strictly lower at 100; setup/qty math exact |
| T-COST-05 margin/target | cost ₹10,000, margin 20% | price ₹12,500 (margin-on-price); target ₹11,500 ⇒ margin 13.04% |
| T-COST-06 snapshot immutability | Re-release BOM after quote costed | old quote line keeps original cost_sheet; sheet marked `stale`; re-cost creates v2 |
| T-COST-07 quote margin chips | unit_cost ₹8,000, price ₹10,000, disc 5% | taxable ₹9,500, margin 15.79%, chip amber if floor 16% |

### 16.3 Credit gate
| Case | Input | Expected |
|---|---|---|
| T-CRED-01 pass | limit ₹25L, outstanding ₹10L, order ₹9.4L | verdict pass; SO confirmable; snapshot stored |
| T-CRED-02 block | limit ₹25L, outstanding ₹18.2L, order ₹9.4L | 409 with detail; SO saved `credit_hold`; **no Planning event emitted** |
| T-CRED-03 override | hold + manager release with reason | status confirmed; audit row has actor+reason; event emitted once |
| T-CRED-04 override w/o permission | Sales Exec attempts release | 403 |
| T-CRED-05 stale cache | payment posted, cache 5-min old, confirm | confirm path bypasses cache, fresh outstanding used |

### 16.4 Tender deadline alerts
| Case | Input | Expected |
|---|---|---|
| T-TEN-01 alert ladder | deadline now+8d, advance clock | alerts exactly at T-7d, T-3d, T-24h, T-4h; no duplicates (alert log dedup) |
| T-TEN-02 submitted stops alerts | mark Submitted at T-2d | T-24h/T-4h suppressed |
| T-TEN-03 past-deadline guard | Mark Submitted after deadline | hard block 422 |
| T-TEN-04 EMD exemption | emd_mode exempt_msme without Udyam no. | 422 |
| T-TEN-05 exposure ledger | 3 tenders: EMD paid ₹4.5L + BG ₹12L + refunded ₹2L | exposure = ₹16.5L; refunded excluded; refund-overdue listed after 30 d |

### 16.5 Others (selection)
Revisioning (single latest rev enforced; edit-sent rejected); duplicate-lead trigram thresholds (fixture: "Jain Irigation Sys" ≈ "Jain Irrigation Systems Ltd"); one-click conversion E2E (Playwright: won quote → dialog → checks → SO → outbox row → demo consumer receives event); Kanban drag optimistic-rollback on 500; PDF snapshot tests (₹ grouping, amount-in-words "₹ Twelve Lakh Fifty Thousand only", HSN column, internal-variant gating); RBAC matrix sweep (each role × each endpoint fixture); load: `POST /quotes/{id}/cost` P95 < 3 s at 20 concurrent costings of the 200-component fixture.

---

## 17. MVP Scope

MVP = investor-demoable vertical slice proving the two differentiators, on seed data (§20), aligned with build-sequence Phase 1.

### In scope
- Leads: CRUD, CSV import + dedupe, qualify→convert, rule-based lead scoring with reason chips (demo model)
- Pipeline Kanban landing view: drag-drop, weighted totals, Needs-Me-Now strip, Won/Lost with reasons
- Customer master (GSTIN/PAN/MSME validation, credit fields, addresses) + Customer 360 (Overview/Contacts/Opps/Quotes/Orders/Activities tabs; Ledger/Complaints tabs stubbed with seed data)
- **BOM-costed quotation builder**: cost-from-BOM against seeded Engineering BOMs + rate masters, live margin simulation, target costing, GST split by place of supply, revisioning, discount-approval flow, customer/internal PDF, email send + WhatsApp share-intent stub
- **One-click won-quote → SO** with inline credit check (seeded outstanding) + ATP check (seeded availability) + credit-hold/override; OA PDF; `sales_order.confirmed` outbox event with a visible demo consumer
- Dispatch record (manual) with e-way-bill reference fields + OTD metric
- Campaigns: master + import + funnel/ROI attribution
- **Tender tracker (demo)**: full CRUD, checklist, EMD/BG ledger, deadline countdown + alert job, seeded GeM tender; AI fit-score on seeded suggestions
- Dashboard: 5 KPI cards + 4 charts, role-scoped; quotation register + tender tracker with saved filters
- AI: lead scoring (rules), ✦ account summary, ✦ follow-up draft, conversational assistant over seed data (read+draft only)
- RBAC + territory scoping, audit log, validations §15

### Out of scope (MVP)
- Live GeM/CPPP scraping/API integration (seeded discovery feed instead); e-invoice IRN & e-way-bill generation (Accounts module, Phase 2 — fields captured now); real WhatsApp BSP send (share-intent stub); price lists w/ slabs (P2); CTO configurator; multi-currency/export docs; commissions/targets engine (target vs achievement chart on seed only); customer portal; email nurture automation; amendments workflow; ML-trained scoring (rules only); generative tender responses; offline mobile.

**MVP demo script (10 min):** exhibition lead import → score badges → qualify to opportunity → drag to Quoted → quote builder pulls KPM-150 BOM cost (show breakup + margin slider) → 12% discount trips approval → manager approves on phone → WhatsApp/PDF send → mark Won → one-click SO (credit warn on second deal!) → event lands in Planning console → tender deadline alert fires → dashboard.

---

## 18. Future Roadmap

| Phase | Timeline | Items |
|---|---|---|
| **Phase 2 — Differentiate** | +1–2 quarters | Real **WhatsApp Business API flows** (approved templates: quote send, OA, dispatch alert, payment reminder; two-way inbox → activity log) via BSP; price lists & slabs; live ATP from Inventory/Planning; ML lead scoring + quote-win model; tender **discovery fetchers** (GeM/CPPP feeds) + fit-scoring GA; two-cover bid model + L1 analytics; amendments; cost-sheet approvals; commissions & targets; churn model GA; e-invoice/e-way-bill hand-off live with Accounts (GSP integration); WebSocket real-time board |
| **Phase 3 — Lead** | +3–4 quarters | **Customer portal** (order status, quotes, complaints, statements, payments); **generative tender-response drafting** (RAG over compliance library, human-approved); **drawing/3D-model → cost estimate** (vision: extract features from 2D drawings/STEP → routing/material suggestion → costing engine); CTO **product configurator** driving auto-BOM + auto-quote; **agentic SDR** (autonomous qualification & follow-up within guardrails, D365-agent-style with research-only default mode); voice-to-CRM logging (field visits, regional languages); live commodity-price margin simulation; multi-currency/export & LC docs; regional-language UI |
| **Continuous** | — | Win/loss learning loop into pricing suggestions; e-BG tracking as GeM digitises guarantees; ONDC/B2B marketplace channel exploration |

---

## 19. Technology Stack & Rationale

Shared IND-CORE platform baseline (validated below), plus SMBD-specific picks.

| Layer | Choice | Rationale & trade-offs |
|---|---|---|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query/Table | Largest hiring pool; shadcn/ui gives owned, themeable components matching the design system (vs MUI's heavier opinionation); TanStack Table is the right engine for register-heavy ERP UIs; TanStack Query removes bespoke cache code. Trade-off: no SSR (Next.js) — acceptable for an authenticated app; revisit only if a public customer portal needs SEO. |
| **Kanban DnD** | **dnd-kit** (primary) | Actively maintained, sensor-based (mouse/touch/keyboard — critical for the phone-first pipeline), works with virtualised columns; hello-pangea/dnd (the maintained react-beautiful-dnd fork) is the simpler fallback but trades flexibility for simplicity (2025-26 React DnD comparisons, LogRocket/Puck). Decision: dnd-kit, accepting slightly more wiring. |
| **Backend** | Python 3.12 + FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2 | Aligns with the existing ind-ai-mvp FastAPI codebase (shared auth, conventions, deploy); Pydantic v2 validators host GSTIN/HSN rules once for API+docs; async SQLAlchemy 2 handles the read-heavy registers. Trade-off vs Node/NestJS: single-language AI tooling and team continuity win; vs Django: FastAPI's OpenAPI-first + async fits better. |
| **Database** | PostgreSQL 16 + `pg_trgm` + `pgvector` | One engine for OLTP, fuzzy dup-detection and AI embeddings — no separate vector DB to operate on a single VM; partial/covering indexes shown in §9 carry the register queries. JSONB for checklist/cost-detail keeps schema honest where structure varies. |
| **Cache/queue/workers** | Redis 7 + arq (or Celery) workers; Redis Streams as MVP event bus | One dependency covers cache (outstanding, BOM explosions), scheduled jobs (§11.8) and the outbox publisher. Trade-off: Redis Streams < NATS/RabbitMQ for fan-out guarantees — fine single-node; the outbox pattern means the bus is swappable without touching business code. |
| **Auth** | JWT access (15 min) + rotating refresh + RBAC/territory scoping; TOTP for approvers | Stateless APIs, mobile-friendly; on-prem needs no external IdP (DPDP-friendly); OIDC bridge later if a customer mandates AD. |
| **APIs** | REST + OpenAPI; internal event bus (outbox) | REST for CRUD-shaped ERP resources + generated TS client; events decouple SMBD→Planning (§11.6). GraphQL rejected: adds complexity without register-UI benefit. |
| **Real-time** | SSE first (worklists, AI streaming, import progress); WebSocket in P2 for multi-user board presence | SSE is proxy-friendly and trivial on FastAPI; board conflicts are rare at SME concurrency. |
| **Charts** | Recharts (dashboard KPIs/funnel/donut/trend) + ECharts for heavy/exotic (concentration treemaps, future Gantt) | Recharts = fastest React DX for the standard set; ECharts canvas rendering scales to dense data and matches Planning's Gantt/heatmap needs — one skill shared across modules. |
| **AI** | Anthropic Claude API via backend `ai_gateway` + pgvector embeddings; prompt registry in-repo | Claude for drafting/summarising/tool-calling (assistant, quote-draft, tender narratives); deterministic engines own all numbers. On-prem story: gateway abstraction allows local models for DPDP-sensitive tenants; embeddings local via pgvector either way. |
| **PDF generation** | **WeasyPrint** (server-side HTML/CSS→PDF) with Jinja2 templates | Quote/OA formats are print-CSS documents (headers, page numbers, HSN tables) — WeasyPrint's @page/flex/grid support fits, pure-Python, no browser dependency (2025 PDF-stack comparisons); same template renders customer vs internal variant. Alternatives: react-pdf (client-side — wrong place for a server-of-record document, no reuse for email/WhatsApp attachment); Playwright/headless-Chromium (heavier op footprint on a single VM — keep as fallback if templates outgrow WeasyPrint CSS support); Typst (fast but a niche skill). |
| **WhatsApp Business API** | BSP adapter interface; recommend **MSG91 or AiSensy** for pilot (low/no platform markup, INR billing, quick onboarding), **Gupshup** as enterprise option; direct **Meta Cloud API** possible but BSPs simplify template approval & webhook ops | India 2025-26 provider scan: MSG91 ~₹500/mo with no markup over Meta rates; AiSensy ~₹999/mo fast activation; Interakt ~₹2.1k; Gupshup ~₹4k+ enterprise-grade. Meta per-message pricing (marketing ~₹0.86; service messages free in 24-h window) makes transactional quote/OA/dispatch notifications near-free. Build against our own `WhatsAppProvider` interface so BSP choice is per-tenant config. |
| **E-invoice / IRP integration** | Phase-2, in **Accounts** module: GSP/ASP route (ClearTax/Masters India/Cygnet-class) over direct NIC IRP APIs; SMBD's job is structural readiness (GSTIN, HSN, POS, rate-wise splits captured at quote/SO) | ₹5-crore AATO mandate makes many pilot customers liable; GSP sandboxes, retries and schema updates outsource compliance churn; direct IRP APIs need registration+2FA ops (mandatory MFA since Apr 2025) and 30-day reporting window handling (AATO ≥ ₹10 Cr). E-way bill fields captured at dispatch (§7.9) feed the same service. |
| **Deployment** | Docker Compose (api, worker, web, postgres, redis, caddy) on a single cloud VM for demo; on-prem capable (DPDP-friendly); GitHub Actions CI (ruff/mypy/pytest/Playwright); nightly pg_dump + WAL | Matches IND-AI's positioning: SMEs often demand on-prem/DC-lite; Compose keeps ops learnable; Kubernetes deferred until multi-tenant SaaS scale demands it. |

---

## 20. Demo Data (Seed for MVP)

The MVP has no real backend data — this seed set is investor-demo-grade and uses the **shared IND-CORE pilot universe** (identical across all module plans): Sharma Precision Components (Faridabad), **Kaveri Pumps & Motors (Coimbatore)**, Trident Sheet Metal Works (Pune), Zenith Fasteners (Rajkot), Arvind Electro Controls (Noida). SMBD is demoed **from inside Kaveri Pumps & Motors Ltd, selling to its end-customers**. All GSTINs/registration numbers below are format-valid but fictitious. Seed loader: `backend/seeds/smbd_seed.py` (idempotent, `--reset` flag).

### 20.1 Demo tenant — the pilot running IND-CORE

| Field | Value |
|---|---|
| Company | **Kaveri Pumps & Motors Ltd**, SIDCO Industrial Estate, Coimbatore, Tamil Nadu — industrial pumps, **make-to-order** |
| GSTIN / State | `33AAACK5643P1ZM` / 33 (Tamil Nadu) — supplier state for GST logic |
| PAN / Udyam | `AAACK5643P` / `UDYAM-TN-06-0034812` (**Small** — drives MSE tender exemptions) |
| Products (Engineering items with released BOMs) | `KPM-150` 150 mm submersible borewell pump (BOM Rev C, 34 components, 6 routing ops) · `KES-80` end-suction centrifugal pump 80×65-200 (BOM Rev B) · `KVS-50` vertical multistage pump 50 bar (BOM Rev A) · spares kits |
| FY 2026-27 target | ₹18.0 Cr order intake; H1 achieved ₹6.4 Cr |

### 20.2 Employees (app users)

| User | Role | Scope / limits |
|---|---|---|
| V. Natarajan | Management (MD) | All dashboards; final discount & credit authority |
| Suresh Venkataraman | Sales Manager | Team pipeline; approves discount > 10%; credit release ≤ 120% limit |
| Priya Raghavan | Sales Executive | Territory: TN + Kerala; discount ≤ 10%, margin floor 15% |
| Ravi Shankar | Sales Executive | Territory: West (MH/GJ); same limits |
| Karthik Subramanian | Marketing | Campaigns, imports, web-to-lead |
| Arjun Nair | BD / Tender Cell | Tenders, EMD/BG, long-cycle accounts |
| Meena Krishnan | Estimation Engineer | Cost sheets, rate masters |

### 20.3 End-customers (Kaveri's customers, with GSTIN & credit)

| Customer | City / State (code) | GSTIN | Group | MSME | Credit limit | Credit days | Outstanding (seed) | Owner |
|---|---|---|---|---|---|---|---|---|
| Jain Irrigation Systems Ltd | Jalgaon, Maharashtra (27) | `27AAACJ0126E1ZL` | OEM | None (large) | ₹40,00,000 | 45 | ₹16,90,000 | Ravi |
| L&T Construction — WET IC | Chennai, TN (33); project sites pan-India | `33AAACL0140P1Z3` | EPC | None (large) | ₹60,00,000 | 60 | ₹22,50,000 | Priya |
| TWAD Board (TN Water Supply & Drainage) | Chennai, TN (33) | `33AAAGT0567Q1ZD` | Government | — | ₹25,00,000 | 30 | ₹4,10,000 | Priya |
| UP Jal Nigam (Rural) | Lucknow, UP (09) | `09AAALU0198C1Z6` | Government | — | ₹25,00,000 | 30 | ₹0 | Arjun |
| Megha Engineering & Infrastructures (MEIL) | Hyderabad, Telangana (36) | `36AABCM4390R1ZX` | EPC | None (large) | ₹35,00,000 | 45 | **₹18,20,000** ← credit-breach demo | Ravi |
| Sree Annapoorna Agro Foods | Coimbatore, TN (33) | `33AADCS1129F1ZP` | End user | Small | ₹8,00,000 | 30 | ₹1,35,000 | Priya |

### 20.4 Campaign + leads

**Campaign CAM-2026-04 — "IFAT India 2026" (Water & Wastewater Expo, Mumbai, 15–17 Apr 2026)** · type: exhibition · budget ₹8,50,000 · spend ₹8,10,000 · status: completed.

**ROI (attributed through lead→opp→SO chain):** 62 leads → 21 qualified (34%) → 11 opportunities ₹1.86 Cr → 3 won ₹38.2 L revenue · cost/lead ₹13,065 · lead→order 4.8% · **ROI 4.7×**.

Sample leads (of 62 seeded):

| Lead | Company | Contact | State | Product interest | Status | Score ✦ (top reason) | Owner |
|---|---|---|---|---|---|---|---|
| LD-1041 | Vasudha Agro Farms | Anil Deshmukh, Director | MH | KPM-150 | Qualified → converted | 82 (irrigation segment, budget stated) | Ravi |
| LD-1044 | Coastal Aqua Ventures | Sameera Kutty, Proc. Mgr | KL | KES-80 | Contacted | 74 (active project, near-term need) | Priya |
| LD-1047 | Shakti Constructions | R. Gupta, Purchase Head | UP | KVS-50 | New | 55 (EPC, no timeline yet) | Ravi |
| LD-1052 | Nandi Textiles Processing | K. Bhaskar, Maint. Head | TN | KES-80 + spares | Qualified → converted | 79 (replacement cycle due) | Priya |
| LD-1058 | GreenGrid Solar Parks | Mohit Jain, SCM | RJ | KPM-150 (solar pumping) | Disqualified (budget mismatch) | 31 | Ravi |

### 20.5 Opportunity pipeline (Kanban seed)

| Opp | Customer | Description | Value ₹ | Stage | Win % | Weighted ₹ | Expected close | Next action | Owner |
|---|---|---|---|---|---|---|---|---|---|
| OPP-2026-031 | Jain Irrigation | 25× KPM-150, drip-irrigation project Ph-2 | 25,51,750 | **Won** | 100 | — | Won 08-Jul-2026 | → SO-2026-0087 | Ravi |
| OPP-2026-034 | TWAD Board | 8× KES-80, Salem water-supply scheme | 11,70,560 | Negotiation | 70 | 8,19,392 | 30-Jul-2026 | L1 negotiation meeting 22-Jul | Priya |
| OPP-2026-036 | L&T Construction | 12× KVS-50, Amaravati water project (ship-to AP) | 30,86,880 | Quoted | 50 | 15,43,440 | 20-Aug-2026 | Follow up QTN-2026-0151 | Priya |
| OPP-2026-029 | MEIL | 40× KPM-150, lift-irrigation package | 41,30,000 | Negotiation | 70 | 28,91,000 | 05-Aug-2026 | ⚠ credit review before SO | Ravi |
| OPP-2026-038 | Nandi Textiles | 3× KES-80 + spares AMC | 4,60,000 | Qualified | 20 | 92,000 | Sep-2026 | Send budgetary quote | Priya |
| OPP-2026-040 | UP Jal Nigam | GeM bid: 500 submersible pumps | 4,38,00,000 | Quoted (bid submitted-prep) | 35 | 1,53,30,000 | 15-Sep-2026 | Tender TND-2026-012 checklist | Arjun |
| OPP-2026-027 | Coastal Aqua | 6× KES-80 seawater variant | 8,90,000 | Enquiry | 10 | 89,000 | Oct-2026 | Site visit 25-Jul | Priya |

Open pipeline ₹4.97 Cr · **weighted ₹2.08 Cr** · closing this quarter ₹0.72 Cr weighted.

### 20.6 BOM-costed quotations (the differentiator, with full breakup)

**QTN-2026-0142 · Rev 1 — Jain Irrigation (won → SO-2026-0087)** · 25 nos `KPM-150` · inter-state TN(33)→MH(27) ⇒ **IGST 18%** · valid till 31-Jul-2026 · FOR Jalgaon · 30% advance, balance against PI · lead time 6 weeks.

Per-unit cost sheet CS-0091 v2 (BOM Rev C, basis qty 25, rate-master v2026-07-01, approved by Meena):

| Cost element | Detail | ₹ / unit |
|---|---|---|
| Material | CF8 SS casting 12.4 kg @ ₹412/kg (incl. 3% scrap) ₹5,109 · impeller sub-BOM ₹6,840 · 12.5 HP motor (bought-out, last-PO) ₹28,900 · SS shaft + sleeve ₹4,120 · mech. seal + bearings ₹5,610 · hardware/paint ₹1,721 | **52,300** |
| Process | CNC turning 38 min + VMC 22 min @ ₹780/hr blended · winding & assembly 55 min @ ₹420/hr · testing 25 min @ ₹520/hr · setup ₹6,200/25 amortised ₹248 | **9,800** |
| Overhead | 12% factory+admin on (M+P) | **7,452** |
| Packing & freight | wooden crate + FOR freight share | **1,200** |
| **Total cost** | | **70,752** |
| Margin | 18.2% on price | **15,748** |
| **Unit price** | | **86,500** |

Quote totals: taxable **₹21,62,500** · IGST 18% **₹3,89,250** · **grand total ₹25,51,750** ("Rupees Twenty-Five Lakh Fifty-One Thousand Seven Hundred and Fifty only") · HSN `84137010` · blended margin 18.2% (Rev 0 was ₹88,900/unit @ 20.4%; Rev 1 issued after negotiation, approved by Suresh — discount 2.7% > Ravi's authority).

**QTN-2026-0147 · Rev 0 — TWAD Board** · 8 nos `KES-80` @ ₹1,24,000 · intra-state TN→TN ⇒ **CGST 9% + SGST 9%** · valid till 25-Jul-2026 ⚠ expiring · unit cost ₹1,01,180 (material 74,600 / process 12,400 / OH 10,440 / packing 3,740) · margin 18.4%. Totals: taxable **₹9,92,000** · CGST **₹89,280** · SGST **₹89,280** · **grand ₹11,70,560** · HSN `84137096`.

**QTN-2026-0151 · Rev 0 — L&T Construction** · 12 nos `KVS-50` @ ₹2,18,000 · bill-to Chennai (33), **ship-to Amaravati, AP (37)** ⇒ place of supply 37 ⇒ **IGST 18%** (bill-to ≠ ship-to demo) · unit cost ₹1,74,900 · margin 19.8% · taxable **₹26,16,000** · IGST **₹4,70,880** · **grand ₹30,86,880** · status `sent`, aging 11 days.

Seed JSON for one costed line (shape the costing endpoint returns):

```json
{
  "qline_id": 4021, "quote_no": "QTN-2026-0142", "rev_no": 1, "line_no": 1,
  "item": "KPM-150", "bom_id": 118, "bom_rev": "C", "qty": "25", "uom": "NOS",
  "hsn_code": "84137010", "gst_rate": "18.00",
  "unit_cost": "70752.00", "unit_price": "86500.00", "discount_pct": "0.00",
  "taxable_value": "2162500.00", "margin_pct": "18.21",
  "cost_sheet": {
    "id": 91, "version": 2, "basis_qty": "25", "rate_master_version": "2026-07-01",
    "material_cost": "52300.00", "process_cost": "9800.00",
    "overhead_pct": "12.00", "overhead_cost": "7452.00", "other_cost": "1200.00",
    "total_cost": "70752.00", "status": "pushed",
    "detail": [
      {"component": "CASTING-CF8-VOL", "qty_kg": "12.4", "scrap_pct": "3.0",
       "rate": "412.00", "rate_source": "price_list", "amount": "5109.00"},
      {"component": "MOTOR-12.5HP-3PH", "qty": "1", "rate": "28900.00",
       "rate_source": "last_po", "amount": "28900.00"}
    ]
  }
}
```

### 20.7 Sales orders

| SO | Quote | Customer | PO ref | Value (incl. GST) | Credit check (seed) | Status | Delivery |
|---|---|---|---|---|---|---|---|
| **SO-2026-0087** | QTN-2026-0142 R1 | Jain Irrigation | `JISL/PO/26-27/4471` dt 08-Jul | ₹25,51,750 | **Hold:** outstanding ₹16.9 L + order ₹25.5 L = ₹42.4 L > limit ₹40 L → released by Suresh with reason "JISL payment of ₹14 L cleared 09-Jul, confirmed by Accounts" (override demo) | Confirmed → event to Planning | 2 lots: 15 nos 20-Aug, 10 nos 05-Sep |
| **SO-2026-0079** | QTN-2026-0135 R0 | Sree Annapoorna | `SAAF/PUR/118` dt 12-Jun | ₹3,66,800 | Pass | Partially dispatched (DSP-2026-0031, e-way bill `391082446120` valid till 21-Jul, OTD on time) | 2× KES-80 delivered, 1 open |
| **SO-2026-0090 (blocked demo)** | draft from OPP-2026-029 | MEIL | `MEIL/LI/26/0912` | ₹41,30,000 | **HOLD: outstanding ₹18.2 L + order ₹41.3 L > limit ₹35 L** | `credit_hold` — awaiting MD | — |

### 20.8 Tenders (BD demo)

| Field | TND-2026-012 (primary demo) | TND-2026-009 |
|---|---|---|
| Portal / ref | **GeM** · `GEM/2026/B/6642817` | CPPP · `2026_TWAD_118234_1` (two-cover) |
| Buyer | UP Jal Nigam (Rural) — 500 nos 150 mm submersible pumps, boring-well scheme | TWAD Board — pump-house refurbishment, Salem |
| Est. / bid value | ₹4.60 Cr / ₹4.38 Cr | ₹92 L / prep |
| **EMD** | **₹4,50,000 · paid online 02-Jul-2026** (≈1% of est. value, per GeM norms) | **Exempt — MSE (Udyam-TN-06-0034812 uploaded)** |
| BG / PBG | PBG 3% ₹13.14 L required on award (SBI Coimbatore, draft ready) | — |
| **Deadline** | **05-Aug-2026 15:00 IST** — countdown 18 d; alerts T-7d 29-Jul, T-3d 02-Aug, T-24h, T-4h | 12-Aug-2026 11:00 IST |
| Checklist | 9 items, **7 ready (78%)**: Udyam ✓, GST returns ✓, CA turnover cert ✓, past-performance POs ✓, MII declaration ✓, datasheets ✓, BIS/test certs ✓, **authorised-signatory DSC pending**, **solvency certificate pending** | 4/8 ready |
| Status / owner | Prep · Arjun | Prep · Arjun |
| ✦ Fit score | **81/100** — "HSN 8413 match; qty within capacity (≈84 units/month vs 90 capacity); MSE price-preference (L1+15% match rule) applies; risk: 8-week delivery clause vs 10-week standard lead time" | 66/100 |

**EMD/BG exposure KPI (seed): ₹4.50 L EMD locked + ₹0 BG active = ₹4.50 L** · 1 refund due (TND-2026-005, lost 12-Jun, EMD ₹85,000 — refund overdue 36 days → worklist).

### 20.9 Alerts & Needs-Me-Now seed

| Alert | Detail | Audience |
|---|---|---|
| Quote expiring | QTN-2026-0147 (TWAD, ₹11.7 L) validity ends **25-Jul — 7 days** | Priya, Suresh |
| Credit breach | SO-2026-0090 (MEIL ₹41.3 L) on **credit hold** — outstanding ₹18.2 L, limit ₹35 L | Suresh, Natarajan, Accounts |
| Tender deadline | GEM/2026/B/6642817 — **T-7d on 29-Jul**; 2 checklist items pending | Arjun, Natarajan |
| EMD refund overdue | TND-2026-005 ₹85,000 — 36 days since loss | Arjun, Accounts |
| Stalled deal | OPP-2026-027 (Coastal Aqua) — no activity 21 days | Priya |
| Quote aging | QTN-2026-0151 (L&T) sent 11 days, no response — ✦ follow-up draft ready | Priya |

### 20.10 AI output examples (seeded transcripts)

**✦ Account-at-risk narrative — MEIL (churn/credit signals):**
> "MEIL is showing 3 risk signals. (1) **Receivables:** ₹18.2 L outstanding, of which ₹9.6 L is 52 days past due against 45-day terms. (2) **Order frequency:** 1 order in the last 2 quarters vs 4 in the same period last year (−75%). (3) **Blocked demand:** a ₹41.3 L order (SO-2026-0090) is on credit hold, and their lift-irrigation package has an alternate bidder (Kirloskar quoted, per opportunity notes). Suggested play: MD-level call this week; propose 50% advance + LC for the new order to unlock the hold; do not extend the limit until the 52-day invoice clears. — Sources: Accounts ledger 17-Jul, OPP-2026-029 activity log."

**✦ Drafted follow-up (QTN-2026-0151, for Priya's approval — email/WhatsApp):**
> "Dear Rajan sir, greetings from Kaveri Pumps. Sharing a quick reminder on our offer QTN-2026-0151 (Rev 0) dated 07-Jul for 12 nos KVS-50 vertical multistage pumps for the Amaravati WTP package — ₹30.87 L incl. 18% IGST, FOR site, 6-week delivery. The offer is valid till 06-Aug. We can hold current motor prices if the order is placed by month-end; copper prices are trending up. May I call on Thursday 11 AM to close the technical points on the mechanical-seal spec? — Priya Raghavan, Kaveri Pumps & Motors, Coimbatore." *(Approve · Edit · Discard)*

**✦ Assistant query demo:** "open quotes above ₹10 lakh expiring this week" → table: QTN-2026-0147 (TWAD, ₹11.7 L, 25-Jul) — with buttons *Draft follow-up* · *Extend validity (new revision)*.

---

*End of blueprint. Companion plans: `ENGINEERING.md` (Items/BOM/routing this module consumes), `PLANNING.md` (MPS/MRP consuming the `sales_order.confirmed` event). Sources consulted during research: ERPNext/Frappe selling & India-compliance docs; Odoo CRM 19 documentation (predictive lead scoring, pipeline); Epicor Kinetic estimating/quoting & costing-workbench material; Microsoft Dynamics 365 Sales 2025 release-wave agent documentation; GeM/CPPP portal guides and EMD/MSE-exemption explainers; NIC IRP/GSP e-invoicing guides (₹5 Cr threshold, 2025 MFA & 30-day rules); Meta WhatsApp Business pricing and India BSP comparisons (MSG91, AiSensy, Interakt, Gupshup); React DnD library comparisons (dnd-kit, hello-pangea/dnd); PDF-stack comparisons (WeasyPrint, Typst, headless-Chromium). No URLs are reproduced here to avoid link rot; retrieve current versions when implementing compliance-sensitive items.*




