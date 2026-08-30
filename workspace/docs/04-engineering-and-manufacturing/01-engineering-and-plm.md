# IND-CORE Module 01 — Engineering and PLM
## Implementation Blueprint

**Product:** IND-CORE Manufacturing ERP (IND-AI)
**Module:** Engineering / PLM — Items, BOMs, Routings, Revisions, ECR/ECO Change Control, Documents, NPI
**Version:** 1.0 · **Date:** 18 July 2026 · **Status:** Ready for build
**Audience:** Frontend, Backend, AI and Product teams — start immediately from this document.

---

## 1. Module Overview

The Engineering/PLM module is the **system of record for what a product *is* — and how it changes**. It governs item/part masters, multi-level bills of materials (EBOM and MBOM), routings and operations, engineering documents and drawings, and the controlled change process (ECR → ECO/ECN) that ensures Purchase, Planning, Production and Quality all build to the correct, approved revision.

In ERP terms, "Engineering" is the operational layer (Items, BOM, Routing, ECO); "PLM" adds lifecycle stages (concept → design → prototype → release → production → service → obsolescence), revision/version control, document management, and multi-stakeholder approval workflows on top.

### Why this module wins for IND-CORE

The competitive research in PLANNING.html is unambiguous, and independent verification confirms it:

- **ERPNext** has a strong multi-level BOM (alternates, scrap, routing, workstations, BOM Update Tool) but **no first-class ECR/ECO/effectivity engine**. Verified: submitted BOMs cannot be edited (cancel/amend only); the BOM Update Tool has documented correctness issues (does not propagate above the grandparent — GitHub issue #12286; does not update operation costs — issue #25585; a long-open community request for BOM revision tracking — issue #1703). Change control is DIY via the generic workflow engine.
- **Odoo** has the best SME-usable PLM (ECO Kanban stages, role-based approval, auto BOM version bump on apply, side-by-side BoM diff with added/removed/changed colouring) — but it is **Enterprise-only (paid)**, effectivity is a simple date, and CAD relies on third parties (OpenBOM).
- **SAP S/4HANA, Dynamics 365 SCM (ECM with versioned products + product readiness policies), Siemens Teamcenter** are the correctness references — date/parameter effectivity, EBOM↔MBOM reconciliation, mandatory release-readiness checks — at a price and complexity a 20–200-person Indian SME cannot absorb.
- **Katana/Fishbowl** have BOM versioning but no formal change control at all.

**The open lane:** ERPNext-class simplicity and price, *plus* a genuine ECR/ECO/effectivity/approval layer, *plus* AI BOM extraction from drawings — India-native (GST/HSN, job-work BOMs) throughout. That governance layer + AI onboarding is the strategic gap this module owns.

### Scope boundary

| In this module | Not in this module (consumes it) |
|---|---|
| Item master, revisions, lifecycle | Stock ledger (Inventory) |
| EBOM/MBOM, phantoms, alternates, scrap % | MRP explosion runs (Planning) |
| Routings, operations, workstation refs | Work-order execution (Production) |
| ECR/ECO, impact analysis, effectivity | PO amendment (Purchase) |
| Document/drawing vault, versioning | Inspection execution (Quality) |
| NPI projects, prototypes | Quotation engine (SMBD — consumes released BOM cost) |
| BOM cost rollup (standard) | Actual costing/variance (Finance) |

---

## 2. Objectives

1. **Single source of truth** — one approved BOM revision consumed by Purchase, Planning, Production, Quality; nobody builds to an obsolete drawing.
2. **Real change control at SME price** — a lightweight ECR→ECO Kanban flow (Odoo-style usability, SAP-grade correctness on effectivity and audit) that a 30-person shop actually adopts.
3. **Paper-to-digital onboarding in days, not months** — AI BOM extraction from PDF/scanned drawings so day-one value doesn't require re-keying years of Excel BOMs.
4. **Impact before change** — where-used, open PO/WO/stock exposure and ₹ cost delta computed *before* an ECO is approved, with plain-language disposition ("use up 40 in stock, then switch to Rev B from 1 Aug").
5. **India-native** — HSN/GST on every item, job-work/sub-contracting flags on BOM components so Purchase can raise GST-correct job-work challans.
6. **Auditable & compliant** — full who/what/when/why trail, separation of duties, released revisions read-only, optional e-sign — supporting ISO 9001 / IATF 16949 supplier audits.
7. **Fast** — sub-second multi-level explosion on 10-level, 2,000-line BOMs via low-level codes and recursive CTEs.
8. **Feed the platform** — released BOM + routing + effectivity events drive MRP cut-over (Planning) and BOM-costed quoting (SMBD).

**Success metrics (first 6 months of a pilot):** ≥90 % of BOMs digitised via AI extractor with <10 % line correction rate; engineering change cycle time (ECR raise → ECO close) < 7 days median; zero production builds on obsolete revisions; 100 % of released revisions with complete audit trail.

---

## 3. User Personas

| Persona | Example (demo universe) | Goals | Pain today | Primary screens |
|---|---|---|---|---|
| **Design Engineer** | Priya Venkatesan, Kaveri Pumps | Create items/EBOMs, attach drawings, raise ECRs | Excel BOMs, emailing drawings, no revision discipline | Item Master, BOM tree editor, ECR form |
| **Process/Mfg Engineer** | Sandeep Jadhav, Trident Sheet Metal | EBOM→MBOM, routings, scrap %, consumables | MBOM lives in his head; routing times on paper | BOM editor (MBOM), Routing |
| **Engineering Manager** | Rajesh Sharma, Sharma Precision | Approve changes, release revisions, watch pipeline | No visibility of open changes; approvals by phone call | PLM Dashboard, My Approvals, ECO form |
| **Quality Engineer** | Meera Iyer, Kaveri Pumps | Quality gate on spec-affecting ECOs, PPAP/FAI on new revs | Finds out about changes after the fact | My Approvals, Where-Used/Impact |
| **Change/Config Manager** | (larger shops) | Run the change board, effectivity, supersession | Spreadsheet ECN register | Changes Kanban, ECO form, Effectivity calendar |
| **Document Controller** | Kavita Deshmukh, Trident | Controlled drawings, check-in/out, distribution | Uncontrolled copies on the shop floor | Document Vault |
| **Purchase/Prod Planner** | Arjun Nair, Zenith Fasteners | Assess supply impact, consume released BOMs | Surprised by changes mid-PO | Where-Used/Impact, approvals (impact gate) |
| **Costing/Finance** | Deepa Krishnan, Kaveri | Cost impact sign-off, standard-cost update | No cost delta before change | ECO form (cost tab), approvals |
| **Founder/Plant Head** (mobile-first) | Venkat Subramanian, Kaveri MD | Approve ECOs from the floor/phone, KPIs | Everything above, aggregated | My Approvals (mobile), Dashboard |

---

## 4. Functional Requirements

Numbered **FR-ENG-xxx**, grouped. Priority: **M** = MVP, **P2/P3** = roadmap phase. Every FR carries acceptance criteria (AC).

### 4.1 Item Master (FR-ENG-001…019)

| # | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| FR-ENG-001 | Create/edit item with code, name, type (manufactured / purchased / phantom / consumable / service), UOM, description, specs (JSONB key-value) | M | Item saved with unique code per company; type drives allowed behaviours (phantom cannot be purchased) |
| FR-ENG-002 | Configurable part-numbering scheme per item type (prefix + sequence, e.g. `KPM-` for pumps, `RM-` raw material) with manual override | M | Auto-suggested next number; duplicate code rejected with clear error |
| FR-ENG-003 | India fields: HSN code (validated 4/6/8-digit), GST rate, is_job_work_item flag | M | HSN required before an item can be released; GST rate defaulted from HSN master |
| FR-ENG-004 | Multi-UOM: stock UOM + purchase UOM with conversion factor | M | BOM lines and POs convert correctly; conversion factor > 0 enforced |
| FR-ENG-005 | Lifecycle status: Draft → Under Review → Released → On Hold → Obsolete, with allowed-transition matrix | M | Obsolete items blocked from new BOMs/POs/WOs but retained and visible with badge |
| FR-ENG-006 | Item revisions (Rev A, B, C…): every released state is an immutable ITEM_REVISION row | M | Editing a released item's controlled fields is impossible; changes only via ECO creating a new revision |
| FR-ENG-007 | Attach documents/drawings to item (and to a specific revision) | M | Drawing opens in-browser (PDF viewer); version badge shown |
| FR-ENG-008 | Where-used from any item, one click | M | Returns all parent BOMs (all levels) with qty per, level, and BOM status |
| FR-ENG-009 | Item list: search, saved filters, bulk import (CSV/Excel), export | M | 10k items searchable < 300 ms (indexed trigram search on code+name) |
| FR-ENG-010 | Make/buy flags, default supplier ref, lead time (days), std cost, safety-stock hint fields consumed by Planning | M | Fields visible to Planner role; edit rights per RBAC |
| FR-ENG-011 | Supersession link (item A superseded by item B) with effectivity note | P2 | Where-used and MRP warn on superseded items |
| FR-ENG-012 | AI "Find similar parts" on the item form (embedding search) before creating a new code | M (demo) | Top-5 similar items with similarity %, spec-diff summary; user can open or ignore |
| FR-ENG-013 | Item variants (size/material grade matrix) generated from a template | P3 | Variant codes generated per naming rule |

### 4.2 BOM (FR-ENG-020…039)

| # | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| FR-ENG-020 | Multi-level BOM: header (parent item, type EBOM/MBOM, qty, UOM, revision) + lines (component, qty-per, UOM, scrap %, position/ref designator, operation link, phantom flag, alternate group, sequence) | M | 10-level nesting supported; tree renders expand/collapse |
| FR-ENG-021 | Circular-reference prevention at line save (an item cannot appear in its own ancestry, any depth) | M | Attempt rejected with the offending path shown ("KPM-5HP-MB → PMP-CASING-5 → KPM-5HP-MB") |
| FR-ENG-022 | Phantom sub-assemblies blow through in explosion (no WO of their own) | M | Explosion output shows phantom's children at parent level with multiplied qty |
| FR-ENG-023 | Alternate components grouped (alternate_group + priority) | M | Explosion shows primary; alternates listed on demand; Planning can substitute |
| FR-ENG-024 | Scrap % per line inflates required qty in explosion and cost rollup | M | qty_required = qty_per × parent_qty × (1 + scrap_pct/100), rounded per UOM precision |
| FR-ENG-025 | EBOM→MBOM copy with transformation log (add consumables/packaging, set phantoms, scrap, operation assignment) and a reconciliation check listing every EBOM line not represented in MBOM (Teamcenter-style change-summary practice) | P2 | Reconciliation report shows matched/added/dropped lines; sign-off required to release MBOM |
| FR-ENG-026 | Multi-level explosion report (indented + summarised views) with low-level codes | M | Correct aggregated quantities when a component appears at multiple levels; < 1 s for 2,000-line structures |
| FR-ENG-027 | BOM cost rollup: Σ(component std cost × qty inc. scrap) + Σ(operation cost), bottom-up by low-level code | M | Rollup stored on BOM header with timestamp; ₹ formatted; drill-down per level |
| FR-ENG-028 | BOM revision compare (rev-to-rev diff): added / removed / qty-changed / field-changed lines, colour-coded (Odoo-style blue/black/red) | M | Diff computed server-side; identical lines collapsed by default |
| FR-ENG-029 | BOM status: Draft → Under Review → Released → Obsolete; released BOMs immutable | M | Edit attempts on released BOM return 409 with "raise an ECO" action |
| FR-ENG-030 | Job-work flag per BOM line (component issued to vendor for an operation) with vendor ref | M | Flag flows to Purchase for GST job-work challan (ITC-04) planning |
| FR-ENG-031 | BOM import from CSV/Excel with column mapping and validation preview | M | Errors listed per row; partial import blocked |
| FR-ENG-032 | AI BOM extraction from PDF drawing/parts-list (see §13) into a review grid, then commit as Draft BOM | M (demo) | Confidence per line; unmatched components flagged for item-creation or mapping |
| FR-ENG-033 | Variant/configurable "150 %" super-BOM with selection rules | P3 | Config session resolves to a concrete BOM |
| FR-ENG-034 | Reference designators for electronics (Arvind Electro panels): multi-designator per line (R1,R2,R7) with count validation | P2 | Designator count must equal qty for count-type UOMs |

### 4.3 Routing & Operations (FR-ENG-040…049)

| # | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| FR-ENG-040 | Routing per BOM/item: sequenced operations with workstation, setup time, run time per unit, operation cost rate, description | M | Drag-reorder resequences; times numeric ≥ 0 |
| FR-ENG-041 | Attach work instructions/SOPs (documents) to operations | M | Operator view (Production) shows current released instruction |
| FR-ENG-042 | BOM lines can be assigned to an operation (material staged at op) | M | Explosion by operation available to Production |
| FR-ENG-043 | Routing cost feeds rollup: setup amortised over batch qty + run × qty at workstation rate | M | Cost recomputes on rate/time change (draft only) |
| FR-ENG-044 | Sub-contract (job-work) operation type with vendor + processing charge | M | Drives job-work PO in Purchase |
| FR-ENG-045 | Alternate routings per item (primary/alternate) | P2 | Planning selects by availability |

### 4.4 Revisions & Effectivity (FR-ENG-050…059)

| # | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| FR-ENG-050 | Every release creates an immutable ITEM_REVISION (rev_code, status, effective_from/to, eco link, released_by/on) | M | Released revisions never hard-deleted; superseded_by chain intact |
| FR-ENG-051 | Date effectivity on revisions and BOMs: non-overlapping validity windows per item; releasing Rev C with effective_from = D sets Rev B effective_to = D (SAP LO-ECH validity-chain pattern) | M | DB exclusion constraint rejects overlaps; timeline view shows contiguous windows |
| FR-ENG-052 | "Effective BOM as of date X" resolution API used by MRP and WO creation | M | Given item + date (+ optional plant), exactly one released BOM returned or a clear "none effective" error |
| FR-ENG-053 | Plain-language effectivity helper: "Use up remaining stock (~40 pcs, ≈ 12 days at current run rate), then switch to Rev B" with computed suggested date | M | Suggestion editable; stored as both date + narrative |
| FR-ENG-054 | Revision history timeline per item/BOM with diff links and ECO references | M | Every revision row links its ECO and approver trail |
| FR-ENG-055 | Serial/lot/unit effectivity ("from serial no. 00500") | P2 | Effectivity_type enum extended; Production filters by serial |
| FR-ENG-056 | Use-up effectivity (auto cut-over when old-rev stock exhausts, NetSuite-style) | P2 | Inventory event triggers cut-over + notification |

### 4.5 ECR / ECO Change Control (FR-ENG-060…079)

| # | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| FR-ENG-060 | ECR: number, title, problem description, reason code (quality / cost-down / customer / obsolescence / field-failure / safety / process), priority, affected items, proposed change, cost/benefit estimate, attachments, requester | M | ECR number auto (ECR-YYYY-NNNN); required fields validated on submit |
| FR-ENG-061 | ECR state machine: Draft → Submitted → Under Evaluation → Accepted / Rejected / On Hold → Converted (to ECO) / Closed | M | Illegal transitions blocked server-side; every transition logged with actor + comment |
| FR-ENG-062 | ECR evaluation captures impact summary and change-board decision with comment | M | Reject requires a reason; requester notified |
| FR-ENG-063 | Convert accepted ECR → ECO carrying over affected items, description, attachments | M | Link ECR↔ECO bidirectional; one ECR → many ECOs allowed |
| FR-ENG-064 | ECO: number, linked ECR(s), description, affected-items table (item, old rev → new rev, old BOM → new BOM, change type add/modify/delete), effectivity type + date, stock disposition (use-up / rework / scrap) per affected item, approvers, status | M | ECO number auto (ECO-YYYY-NNNN); at least one ECO line to route for approval |
| FR-ENG-065 | ECO state machine: Draft → Impact Analysis → In Approval → Approved → Applied → Closed (+ Rejected, Cancelled) | M | "Apply" allowed only from Approved; apply is atomic (all revisions bump or none) |
| FR-ENG-066 | Impact analysis on ECR/ECO: where-used tree, open POs, open WOs, on-hand + WIP stock per affected item, obsolete-stock value ₹, cost delta old vs new rollup | M | Runs < 5 s; results snapshot stored on the ECO (audit) |
| FR-ENG-067 | ECO apply: creates new item revisions + new BOM revisions in Draft-of-record, sets effectivity windows, supersession links, re-links documents, emits `eco.applied` event to Planning/MRP | M | Idempotent; failure rolls back; event carries affected items + effectivity dates |
| FR-ENG-068 | Changes Kanban board: ECRs and ECOs as cards in status columns, drag to transition (guarded), filters by priority/reason/assignee, aging badge | M | Drag to an illegal column snaps back with explanation |
| FR-ENG-069 | Configurable approval workflow per change type/risk: sequential and parallel steps, role- or user-based, delegate, comment mandatory on reject | M | Workflow template selected on submit; steps visible as a progress rail |
| FR-ENG-070 | My Approvals inbox (web + mobile): pending ECR evaluations, ECO approvals, release requests; approve/reject/delegate with comment; optional e-sign (password re-entry) | M | Action completes in ≤ 2 taps on mobile; inbox count in nav badge |
| FR-ENG-071 | Auto-draft ECO from ECR via AI (affected items, proposed revisions, suggested approvers) — human reviews before save | M (demo) | AI panel clearly marked; nothing persists without explicit user confirmation |
| FR-ENG-072 | Smart approval routing: AI classifies change risk and proposes workflow template | P2 | Suggestion overridable; logged |
| FR-ENG-073 | Change-board metrics: cycle time, first-pass approval rate, aging, ₹ impact per period | M | Dashboard tiles live |
| FR-ENG-074 | Mass change: one ECO replacing component X with Y across N parent BOMs (ERPNext BOM-Update-Tool use case, done correctly — full-depth propagation with new revisions, not in-place mutation) | P2 | Preview of all affected parents; per-parent opt-out |

### 4.6 Documents (FR-ENG-080…089)

| # | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| FR-ENG-080 | Document vault: doc no., title, type (drawing / spec / SOP / test report / certificate), file, version, status (Draft/Released/Obsolete), links to item/revision/ECO/operation | M | Versions immutable once released; latest-released badge |
| FR-ENG-081 | Check-in/check-out with lock owner | M | Second check-out blocked with owner shown |
| FR-ENG-082 | In-browser preview: PDF, images; download original | M | Preview < 2 s for 10 MB PDF |
| FR-ENG-083 | Controlled distribution: obsolete versions watermarked "OBSOLETE" on view/print | P2 | Watermark server-rendered |
| FR-ENG-084 | AI "Extract BOM" button on any drawing document | M (demo) | Launches extraction review flow (§13) |

### 4.7 NPI Projects & Prototypes (FR-ENG-090…095)

| # | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| FR-ENG-090 | Engineering project: name, product/item link, owner, stage (Concept → Design → Prototype → Pre-production → Released), start/target dates, milestones | M (light) | NPI Kanban by stage; overdue badge |
| FR-ENG-091 | Prototype builds: build no., item+revision, test plan ref, result (pass/fail/partial), notes, docs | P2 | Iterations counted per product (KPI) |
| FR-ENG-092 | Gate review checklist per stage transition | P2 | Gate cannot pass with open mandatory items |

### 4.8 Dashboard & Reports (FR-ENG-100…105)

| # | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| FR-ENG-100 | PLM dashboard: KPI cards (open ECRs/ECOs + aging, change cycle time, BOMs pending release, ₹ cost impact this month), charts (change volume by reason — bar; cycle-time trend — line; approval funnel), worklist | M | Loads < 1.5 s; drill-through to registers |
| FR-ENG-101 | Reports: multi-level explosion, where-used, BOM compare, ECR/ECO register with aging, per-item change history, cost rollup & variance, obsolete/EOL list, effectivity calendar, document revision list | M | All exportable CSV/PDF; register filters saveable |
| FR-ENG-102 | Natural-language query bar ("show all BOMs using SEAL-MECH-25 and their open work orders") | P2 | NL → structured query with visible interpretation; read-only |

---

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | Multi-level BOM explosion (10 levels, 2,000 lines) < 1 s p95 (recursive CTE + low-level-code cost rollup; PostgreSQL supports depth/breadth-first CTE search — set an explicit recursion depth guard). Item search < 300 ms on 50k items (pg_trgm). Impact analysis < 5 s. Dashboard < 1.5 s. API p95 < 400 ms for CRUD. |
| **Scalability** | 50k items, 10k BOMs, 500 concurrent users per tenant on a single VM (demo) scaling to modest cluster. Multi-plant/multi-company scoping (`company_id`, `plant_id`) from day one. AI jobs (extraction, embeddings) on background workers so the API stays responsive. |
| **Availability** | 99.5 % business hours (SME tier); graceful degradation — AI features can be down without blocking core PLM; nightly logical backups + WAL archiving; RPO ≤ 15 min, RTO ≤ 4 h. |
| **Data retention & immutability** | **Released revisions, released BOMs, applied ECOs and released documents are NEVER hard-deleted.** Supersede + retain forever (traceability/service). Soft-delete only for Draft objects. Append-only `audit_log` (trigger-based JSONB old/new capture — the postgresql-audit / 2ndQuadrant audit-trigger pattern) retained ≥ 8 years (Indian statutory comfort). |
| **Auditability** | Every state transition and controlled-field change records actor, timestamp, before/after, reason. Approval decisions store comment + optional e-sign hash. |
| **Security** | RBAC (§14), JWT with short-lived access tokens, TLS everywhere, per-tenant row-level scoping, signed URLs for documents. |
| **Localisation** | ₹ formatting (Indian digit grouping 1,23,456.78), IST timestamps, HSN/GST fields first-class; UI copy in English with regional-language assistant on roadmap. |
| **Deployability** | Docker Compose; runs fully on-prem (DPDP-friendly — many auto Tier-2s won't send drawings to cloud); AI degradable to local models later. |
| **Usability** | Plain-language tooltips on every acronym (BOM, ECO, effectivity); mobile-usable approvals and lookups; heavy authoring desktop-only. |

---

## 6. UI/UX Flow

**Design principle (from the IND-CORE design system): worklist-first, guided guarded actions, plain language, AI drafts / human approves.**

### 6.1 Primary journeys

**J1 — Digitise an existing product (onboarding, the wow moment)**
1. Design engineer opens Documents → uploads scanned pump GA drawing + parts list PDF.
2. Clicks **✦ Extract BOM** → background job runs OCR+LLM → review grid opens: extracted lines with confidence chips (green ≥ 90 %, amber 70–89 %, red < 70 %); unmatched components offer "create item" or "map to existing" (similar-part suggestions shown inline).
3. Engineer fixes 3 amber lines, accepts → BOM saved as **Draft** on the item. Nothing entered the system without human review.

**J2 — Build & release a new BOM**
1. Item created (auto part number, HSN prompted) → BOM tree editor: add lines inline (type-ahead component search with "similar part exists" nudge), set qty/UOM/scrap %, drag to re-parent, mark phantoms.
2. Add routing (operations sequenced against workstations); assign BOM lines to operations.
3. **Release** — one guarded action opening the readiness checklist (Dynamics-365-style readiness policy: all lines have valid UOM, no draft components below, cost rolled up, drawing attached, HSN set, routing present for manufactured items). All green → pick effectivity date → routes to approval → on approval, Rev A Released, event emitted.

**J3 — The change loop (the module's heart)**
1. Trigger (customer complaint, cost-down idea) → **ECR** raised with reason code + affected items.
2. Change board sees it on the **Changes Kanban**; evaluator opens **Impact analysis**: where-used tree, open POs/WOs, stock exposure, cost delta — auto-computed, snapshot saved.
3. Accepted → **Convert to ECO** (or ✦ AI auto-draft: affected-items table, new rev codes, suggested approvers, disposition recommendation with rationale — reviewed by a human).
4. ECO routes through the approval rail (Design → Quality → Purchase-impact → Finance-cost → Engineering Manager). Each approver acts from **My Approvals** (phone-friendly).
5. **Apply** — atomic revision bump, effectivity window set ("use up 40, switch 1 Aug"), documents re-issued, `eco.applied` event → Planning re-explodes from the cut-over date.
6. Dashboard cycle-time KPI updates; audit trail complete.

**J4 — Everyone else** — Managers live in My Approvals + Dashboard; planners hit Where-Used from any part in one click; document controller works the vault; founder approves from the phone.

### 6.2 States & feedback conventions

- Status chips everywhere: Draft (grey), Under Review (amber), Released (green), On Hold (blue), Obsolete (red-outline), Rejected (red).
- Read-only surfaces show a lock icon + "Released — changes via ECO" tooltip with a **Raise ECR** shortcut.
- Empty states teach: an empty BOM tree shows "Add your first component — or ✦ extract from a drawing".
- Destructive/irreversible actions (Apply ECO, Release) use confirmation with consequence summary, never a bare "OK".

---

## 7. Screen-by-Screen Design

Every screen from PLANNING §1.4, specified for build. Common chrome: breadcrumbs top-left, command bar top-centre, status chip + primary action top-right, activity/audit drawer on all entity pages.

### 7.1 Item / Part Master

- **Layout:** List view (table: code, name, type, current rev, lifecycle, UOM, HSN, std cost ₹, updated) → detail page with header card (code, name, rev chip, lifecycle chip, primary actions) + tabs: **Overview** (specs, UOMs, make/buy, lead time, HSN/GST, job-work flag) · **Revisions** (timeline) · **BOMs** · **Documents** · **Where-Used** · **Activity**.
- **Key actions:** Create Revision (via ECO), Attach Doc, View Where-Used, ✦ Find Similar Parts, Duplicate as template.
- **States:** Draft (all editable) / Released (controlled fields locked, lock icon) / Obsolete (banner: "Obsolete since 12 Mar 2026 — superseded by IMP-BRZ-5HP Rev A").
- **Mobile:** read-only detail + documents + where-used; no editing.

### 7.2 BOM Tree Editor (the flagship authoring surface)

- **Layout:** Left 70 % — virtualized tree-table (columns: component code+name, qty, UOM, scrap %, operation, phantom, alternate group, job-work, unit cost ₹, ext cost ₹). Right 30 % — context panel for selected line (all fields, alternates list, component preview with thumbnail + where-used link). Header: parent item + rev, BOM type toggle chips (EBOM/MBOM), status chip, rolled-up cost card, actions: **Explode**, **Cost Rollup**, **Compare Revs**, **EBOM→MBOM copy**, **Submit for Release**.
- **Interactions:** inline cell edit (Enter/F2), type-ahead add-row at each level, drag-to-re-parent with drop-target highlighting (circularity checked live — invalid drop targets greyed with tooltip showing the cycle path), right-click context menu (add child, make phantom, replace component, delete draft line), expand/collapse all, keyboard navigation.
- **States:** Draft (full edit) / Under Review (read-only + withdraw) / Released (read-only + "Compare" + "Raise ECR") / diff-mode (colour overlay: green added, red removed, amber changed with old→new inline).
- **Mobile:** view-only collapsible tree; edit disabled with "Editing BOMs is a desktop task".

### 7.3 Routing / Operations

- **Layout:** Left — operation list (drag-sequenced cards: seq, name, workstation, setup min, run min/unit, cost rate, job-work badge). Right — selected operation detail + attached work instructions + BOM lines staged at this op. Footer: routing cost summary (setup amortisation @ default batch, run cost/unit).
- **Actions:** add/reorder ops, attach SOP, mark sub-contract op (vendor + charge), link BOM lines.
- **States:** mirrors BOM status (a routing releases with its BOM).
- **Mobile:** read-only; operators consume instructions via Production module.

### 7.4 ECR Form

- **Layout:** two-column form. Left: ECR no. (auto), title, problem description (rich text), reason code (select), priority, affected items (multi-picker with rev shown), proposed change, attachments. Right rail: status stepper (Draft → Submitted → Evaluation → Decision), cost/benefit estimate fields, requester/date, linked ECOs.
- **Actions:** Submit, Evaluate (opens impact panel), Accept → Convert to ECO, Reject (comment required), Hold. **✦ Analyse impact** button.
- **States:** editable in Draft; locked after submit except evaluator fields.
- **Mobile:** full read + evaluate/decide actions (the change-board member on the move).

### 7.5 ECO / ECN Form

- **Layout:** header (ECO no., title, linked ECR chips, status stepper across the top). Tabs: **Affected Items** (table: item, old rev → new rev, old BOM → new BOM, change type, disposition select use-up/rework/scrap, per-item notes) · **Effectivity** (type: date [MVP] / serial / use-up [P2]; date picker + plain-language helper card showing stock & suggested cut-over) · **Impact** (snapshot: where-used tree, open POs/WOs table, stock value at risk ₹, cost delta card) · **Approvals** (step rail: role, assignee, status, comment, timestamp, e-sign badge) · **Documents** · **Activity**.
- **Actions:** Run Impact Analysis, ✦ AI Draft (fills affected items + dispositions + approver suggestion — review panel before commit), Route for Approval, **Apply** (Approved-only; confirmation lists every revision bump it will perform), Close, Cancel.
- **States:** Draft / Impact / In Approval (read-only except approver actions) / Approved / Applied (fully immutable) / Rejected.
- **Mobile:** read + approve/reject; Apply desktop-only (deliberate friction).

### 7.6 Where-Used / Impact Explorer

- **Layout:** input: item (+ optional rev, as-of date). Results in three stacked panels: **Parent structures** (reverse-explosion tree, qty-per and level), **Open demand** (open POs, WOs, quotes referencing affected BOMs — table with values ₹), **Stock exposure** (on-hand, WIP, at vendors for job-work; obsolete-value estimate). Export + "attach snapshot to ECR/ECO".
- **Mobile:** fully usable read-only (a manager checking blast radius from the floor).

### 7.7 Revision History / Compare

- **Layout:** left — vertical timeline of revisions (rev chip, released date, ECO link, released-by, effectivity window). Select any two → right pane side-by-side header diff + line-level BOM diff (added green / removed red / changed amber with old→new values), field-change list (e.g. scrap 2 % → 3 %).
- **Actions:** export diff PDF (customer/PPAP evidence), open ECO.
- **Mobile:** timeline readable; diff readable in stacked mode.

### 7.8 My Approvals Inbox

- **Layout:** worklist (default landing for approver roles): cards grouped by type (ECO approvals, ECR evaluations, release requests), each with title, requester, age badge, ₹ impact, risk chip. Tap → summary sheet: what changes, impact headline, diff link. Actions: **Approve / Reject (comment) / Delegate**; optional e-sign modal (password re-entry) per workflow config.
- **States:** empty state "Nothing needs you — 🎉"; overdue items float with red age badge.
- **Mobile:** THE primary mobile screen; 2-tap approve; push/WhatsApp-style notification hook (P2).

### 7.9 Document / Drawing Vault

- **Layout:** table (doc no., title, type, version, status, linked item/ECO, checked-out-by) + preview drawer (PDF/image viewer). Filters by type/status/item.
- **Actions:** upload (drag-drop), check-out/check-in, new version, release, distribute, **✦ Extract BOM**.
- **States:** checked-out rows show lock + owner; obsolete versions collapsed under latest with history expander.
- **Mobile:** search + view drawings (shop-floor lookup); no check-in/out.

### 7.10 Engineering Project / NPI Board

- **Layout:** Kanban columns = lifecycle stages (Concept, Design, Prototype, Pre-production, Released). Cards: project name, product thumbnail, owner avatar, target date (overdue red), milestone progress bar. Card → drawer: milestones, gate checklist, linked items/BOMs/protos/docs.
- **Actions:** drag between stages (gate checklist guard, P2), add milestone, link items.
- **Mobile:** board readable; card drawer readable.

### 7.11 PLM Dashboard (module landing for managers)

- **Layout:** Row 1 — KPI cards: *Open ECRs* (with avg age), *Open ECOs*, *Change cycle time (median days, trend delta + sparkline)*, *BOMs pending release*, *₹ cost impact this month*. Row 2 — charts: change volume by reason (bar), cycle-time trend (line), approval funnel (funnel/stacked bar). Row 3 — worklists: my approvals preview, aging changes (> 14 days red), upcoming effectivity cut-overs (calendar strip). Global filter: plant, date range.
- **Mobile:** KPI cards + worklist stack; charts simplified.

---

## 8. Navigation

### 8.1 Left rail (module-level, second-level rail inside IND-CORE's persistent module rail)

```
ENGINEERING
├─ Dashboard        (default for managers)
├─ Items
├─ BOMs
├─ Routings
├─ Changes          (ECR/ECO Kanban + register; badge = my pending)
├─ Documents
└─ Projects         (NPI board)
```

- The module opens on **Dashboard** for manager roles and **My Approvals** for approver-heavy roles (worklist-first); engineers can pin BOMs as their landing.
- **My Approvals** is reachable globally from the top bar bell/inbox icon with count badge (it aggregates across modules platform-wide).

### 8.2 Breadcrumbs & entity graph

Breadcrumbs on every screen reflect the hierarchy **Item → Revision → BOM → BOM line → Routing/Docs** and **ECR → ECO → Affected item**. Examples:

- `Items / KPM-5HP-MB / Rev B / MBOM v2 / Routing`
- `Changes / ECR-2026-0042 / ECO-2026-0031`

Every entity is one click from parents and children: an item header shows chips linking its default BOM, open ECOs, and where-used; an ECO line links both revisions and the diff.

### 8.3 Command bar (global, top-centre)

- **Search:** type-ahead across items, BOMs, ECRs/ECOs, documents, projects (prefix filters: `i:` item, `c:` change, `d:` doc).
- **Ask AI:** natural-language queries ("where is SEAL-MECH-25 used?", "open ECOs older than 2 weeks") → rendered as the corresponding report with the interpreted query shown (P2 for NL; search is MVP).
- **Quick actions:** `+ New Item`, `+ New ECR`, `Upload drawing` from anywhere (keyboard: `Ctrl+K`).

---

## 9. Database Schema (PostgreSQL 16)

Faithful to the PLANNING reference schema, hardened for production. Load-bearing ideas: (1) `bom_line.component_item_id → item` makes the structure self-referencing, enabling both explosion and where-used from one relationship; (2) released revisions are **superseded, never deleted**; (3) date effectivity is enforced with a GiST **exclusion constraint** (no overlapping windows per item — the SAP validity-chain made structural); (4) `item.low_level_code` is maintained for bottom-up cost rollup and MRP ordering.

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- fuzzy item search
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- effectivity exclusion constraints
CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector: similar-part embeddings

-- ============ Reference ============
CREATE TABLE company (
  company_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL,
  gstin         VARCHAR(15),
  state_code    VARCHAR(2)
);

CREATE TABLE plant (
  plant_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id    BIGINT NOT NULL REFERENCES company,
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  city          TEXT, state TEXT,
  UNIQUE (company_id, code)
);

CREATE TABLE uom (
  uom_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          TEXT UNIQUE NOT NULL,          -- NOS, KG, MTR, LTR, SET
  name          TEXT NOT NULL,
  precision     SMALLINT NOT NULL DEFAULT 3
);

CREATE TABLE workstation (
  workstation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plant_id      BIGINT NOT NULL REFERENCES plant,
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,                 -- 'Ace Micromatic VMC-850 #1'
  hourly_rate   NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE (plant_id, code)
);

-- ============ Item & Revision ============
CREATE TABLE item (
  item_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id         BIGINT NOT NULL REFERENCES company,
  item_code          TEXT NOT NULL,
  name               TEXT NOT NULL,
  description        TEXT,
  item_type          TEXT NOT NULL CHECK (item_type IN
                       ('manufactured','purchased','phantom','consumable','service')),
  uom_id             BIGINT NOT NULL REFERENCES uom,
  purchase_uom_id    BIGINT REFERENCES uom,
  uom_conversion     NUMERIC(14,6) CHECK (uom_conversion > 0),
  current_revision   TEXT,                     -- denormalised convenience (e.g. 'B')
  lifecycle_status   TEXT NOT NULL DEFAULT 'draft' CHECK (lifecycle_status IN
                       ('draft','under_review','released','on_hold','obsolete')),
  drawing_no         TEXT,
  default_bom_id     BIGINT,                   -- FK added after bom exists
  is_purchased       BOOLEAN NOT NULL DEFAULT FALSE,
  is_manufactured    BOOLEAN NOT NULL DEFAULT FALSE,
  is_job_work        BOOLEAN NOT NULL DEFAULT FALSE,
  hsn_code           VARCHAR(8) CHECK (hsn_code ~ '^[0-9]{4}([0-9]{2})?([0-9]{2})?$'),
  gst_rate           NUMERIC(5,2),
  lead_time_days     INT DEFAULT 0,
  std_cost           NUMERIC(14,2) DEFAULT 0,
  specs              JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {material:'SS316', ...}
  low_level_code     SMALLINT NOT NULL DEFAULT 0,         -- maintained by trigger/job
  superseded_by_item_id BIGINT REFERENCES item,
  embedding          vector(1024),             -- similar-part search
  created_by         BIGINT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,              -- soft delete: DRAFT items only
  UNIQUE (company_id, item_code)
);
CREATE INDEX ix_item_search ON item USING gin ((item_code || ' ' || name) gin_trgm_ops);
CREATE INDEX ix_item_llc    ON item (company_id, low_level_code);
CREATE INDEX ix_item_embed  ON item USING hnsw (embedding vector_cosine_ops);

CREATE TABLE item_revision (
  revision_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id            BIGINT NOT NULL REFERENCES item,
  rev_code           TEXT NOT NULL,            -- 'A','B','C'
  status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','released','obsolete')),
  effective_from     DATE,
  effective_to       DATE,                     -- open-ended = NULL
  eco_id             BIGINT,                   -- FK added after eco exists
  superseded_by_revision_id BIGINT REFERENCES item_revision,
  change_summary     TEXT,
  released_on        TIMESTAMPTZ,
  released_by        BIGINT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, rev_code),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  -- one revision effective per item per date (released only)
  EXCLUDE USING gist (
    item_id WITH =,
    daterange(effective_from, COALESCE(effective_to,'infinity'::date)) WITH &&
  ) WHERE (status = 'released')
);
CREATE INDEX ix_itemrev_item ON item_revision (item_id, status);

-- ============ BOM ============
CREATE TABLE bom (
  bom_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id        BIGINT NOT NULL REFERENCES item,      -- parent product
  revision_id    BIGINT REFERENCES item_revision,      -- item revision it belongs to
  bom_type       TEXT NOT NULL DEFAULT 'MBOM' CHECK (bom_type IN ('EBOM','MBOM')),
  version        SMALLINT NOT NULL DEFAULT 1,
  status         TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','under_review','released','obsolete')),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  is_default     BOOLEAN NOT NULL DEFAULT FALSE,
  quantity       NUMERIC(14,4) NOT NULL DEFAULT 1 CHECK (quantity > 0),  -- batch qty
  uom_id         BIGINT NOT NULL REFERENCES uom,
  total_cost     NUMERIC(14,2),                        -- last rollup
  cost_rolled_at TIMESTAMPTZ,
  effective_from DATE,
  effective_to   DATE,
  source_bom_id  BIGINT REFERENCES bom,                -- EBOM this MBOM was copied from
  created_by     BIGINT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  EXCLUDE USING gist (                              -- one released default MBOM per item per date
    item_id WITH =, bom_type WITH =,
    daterange(effective_from, COALESCE(effective_to,'infinity'::date)) WITH &&
  ) WHERE (status = 'released' AND is_default)
);
ALTER TABLE item ADD CONSTRAINT fk_item_default_bom
  FOREIGN KEY (default_bom_id) REFERENCES bom (bom_id);
CREATE INDEX ix_bom_item ON bom (item_id, bom_type, status);

CREATE TABLE bom_line (
  bom_line_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bom_id            BIGINT NOT NULL REFERENCES bom ON DELETE CASCADE,  -- draft-only deletes
  component_item_id BIGINT NOT NULL REFERENCES item,   -- ← the self-referencing edge
  qty               NUMERIC(14,6) NOT NULL CHECK (qty > 0),
  uom_id            BIGINT NOT NULL REFERENCES uom,
  scrap_pct         NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (scrap_pct BETWEEN 0 AND 100),
  position_ref      TEXT,                              -- position / ref designator(s)
  operation_id      BIGINT,                            -- FK added after operation
  is_phantom        BOOLEAN NOT NULL DEFAULT FALSE,
  is_job_work       BOOLEAN NOT NULL DEFAULT FALSE,    -- issued to vendor (challan/ITC-04)
  job_work_vendor_ref TEXT,
  alternate_group   TEXT,                              -- lines sharing a group are alternates
  alternate_priority SMALLINT DEFAULT 1,
  sequence          INT NOT NULL DEFAULT 10,
  notes             TEXT
);
CREATE INDEX ix_bomline_bom       ON bom_line (bom_id, sequence);
CREATE INDEX ix_bomline_component ON bom_line (component_item_id);  -- where-used entry point

-- ============ Routing ============
CREATE TABLE routing (
  routing_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bom_id       BIGINT REFERENCES bom,
  item_id      BIGINT NOT NULL REFERENCES item,
  name         TEXT NOT NULL DEFAULT 'Primary',
  is_primary   BOOLEAN NOT NULL DEFAULT TRUE,
  status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','released','obsolete')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE operation (
  operation_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  routing_id       BIGINT NOT NULL REFERENCES routing ON DELETE CASCADE,
  seq              INT NOT NULL,
  name             TEXT NOT NULL,               -- 'CNC turn casing bore'
  workstation_id   BIGINT REFERENCES workstation,
  setup_time_min   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (setup_time_min >= 0),
  run_time_min     NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (run_time_min  >= 0), -- per unit
  op_cost_rate     NUMERIC(12,2),               -- override; else workstation rate
  is_subcontract   BOOLEAN NOT NULL DEFAULT FALSE,
  subcontract_vendor_ref TEXT,
  subcontract_charge NUMERIC(12,2),
  instruction_doc_id BIGINT,                    -- FK added after document
  UNIQUE (routing_id, seq)
);
ALTER TABLE bom_line ADD CONSTRAINT fk_bomline_operation
  FOREIGN KEY (operation_id) REFERENCES operation (operation_id);

-- ============ Change control ============
CREATE TABLE ecr (
  ecr_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id    BIGINT NOT NULL REFERENCES company,
  ecr_no        TEXT NOT NULL,                  -- ECR-2026-0042
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  reason_code   TEXT NOT NULL CHECK (reason_code IN
                  ('quality','cost_down','customer','obsolescence','field_failure',
                   'safety','process','regulatory','other')),
  priority      TEXT NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low','medium','high','critical')),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
                  ('draft','submitted','under_evaluation','accepted','rejected',
                   'on_hold','converted','closed')),
  proposed_change TEXT,
  cost_estimate NUMERIC(14,2),
  benefit       TEXT,
  impact_snapshot JSONB,                        -- frozen impact-analysis result
  requested_by  BIGINT NOT NULL,
  requested_on  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by    BIGINT, decided_on TIMESTAMPTZ, decision_comment TEXT,
  project_id    BIGINT,
  UNIQUE (company_id, ecr_no)
);
CREATE INDEX ix_ecr_status ON ecr (company_id, status, priority);

CREATE TABLE ecr_affected_item (
  id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ecr_id  BIGINT NOT NULL REFERENCES ecr ON DELETE CASCADE,
  item_id BIGINT NOT NULL REFERENCES item,
  UNIQUE (ecr_id, item_id)
);

CREATE TABLE eco (
  eco_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id       BIGINT NOT NULL REFERENCES company,
  eco_no           TEXT NOT NULL,               -- ECO-2026-0031
  ecr_id           BIGINT REFERENCES ecr,
  title            TEXT NOT NULL,
  description      TEXT,
  effectivity_type TEXT NOT NULL DEFAULT 'date'
                     CHECK (effectivity_type IN ('date','serial','lot','use_up')),
  effective_date   DATE,
  effectivity_narrative TEXT,                   -- 'use up 40 pcs, switch from 1 Aug'
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
                     ('draft','impact_analysis','in_approval','approved',
                      'applied','closed','rejected','cancelled')),
  impact_snapshot  JSONB,
  cost_delta       NUMERIC(14,2),
  ai_drafted       BOOLEAN NOT NULL DEFAULT FALSE,
  approved_on      TIMESTAMPTZ, applied_on TIMESTAMPTZ, closed_on TIMESTAMPTZ,
  created_by       BIGINT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, eco_no)
);
ALTER TABLE item_revision ADD CONSTRAINT fk_itemrev_eco
  FOREIGN KEY (eco_id) REFERENCES eco (eco_id);
CREATE INDEX ix_eco_status ON eco (company_id, status);

CREATE TABLE eco_line (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  eco_id           BIGINT NOT NULL REFERENCES eco ON DELETE CASCADE,
  item_id          BIGINT NOT NULL REFERENCES item,
  change_type      TEXT NOT NULL CHECK (change_type IN ('add','modify','delete')),
  old_revision_id  BIGINT REFERENCES item_revision,
  new_revision_id  BIGINT REFERENCES item_revision,
  old_bom_id       BIGINT REFERENCES bom,
  new_bom_id       BIGINT REFERENCES bom,
  disposition_code TEXT CHECK (disposition_code IN ('use_up','rework','scrap','return_vendor')),
  disposition_note TEXT,
  UNIQUE (eco_id, item_id)
);

-- ============ Documents ============
CREATE TABLE document (
  document_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id    BIGINT NOT NULL REFERENCES company,
  doc_no        TEXT NOT NULL,                  -- DOC-DRW-0001
  title         TEXT NOT NULL,
  doc_type      TEXT NOT NULL CHECK (doc_type IN
                  ('drawing','spec','sop','test_report','certificate','datasheet','other')),
  file_ref      TEXT NOT NULL,                  -- object-store key
  mime_type     TEXT, file_size_bytes BIGINT,
  version       SMALLINT NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','released','obsolete')),
  item_id       BIGINT REFERENCES item,
  revision_id   BIGINT REFERENCES item_revision,
  eco_id        BIGINT REFERENCES eco,
  checked_out_by BIGINT, checked_out_at TIMESTAMPTZ,
  extraction_job_id BIGINT,                     -- last AI BOM-extraction run
  created_by    BIGINT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_no, version)
);
ALTER TABLE operation ADD CONSTRAINT fk_op_instruction
  FOREIGN KEY (instruction_doc_id) REFERENCES document (document_id);
CREATE INDEX ix_document_item ON document (item_id, doc_type, status);

-- ============ Approvals (polymorphic) ============
CREATE TABLE approval_workflow (
  workflow_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id   BIGINT NOT NULL REFERENCES company,
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('ECR','ECO','BOM','DOCUMENT')),
  entity_id    BIGINT NOT NULL,
  template_code TEXT,                           -- 'std_eco','fast_track','quality_critical'
  current_step SMALLINT NOT NULL DEFAULT 1,
  status       TEXT NOT NULL DEFAULT 'in_progress'
                 CHECK (status IN ('in_progress','approved','rejected','cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, created_at)
);
CREATE INDEX ix_wf_entity ON approval_workflow (entity_type, entity_id);

CREATE TABLE approval_step (
  step_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workflow_id  BIGINT NOT NULL REFERENCES approval_workflow ON DELETE CASCADE,
  seq          SMALLINT NOT NULL,
  is_parallel  BOOLEAN NOT NULL DEFAULT FALSE,  -- same seq, all must approve
  role_code    TEXT,                            -- role-based assignment...
  user_id      BIGINT,                          -- ...or explicit user
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected','delegated','skipped')),
  decision_by  BIGINT, decision_on TIMESTAMPTZ,
  comments     TEXT,
  delegated_to BIGINT,
  e_signature  TEXT,                            -- hash(user, entity, ts) when e-sign on
  UNIQUE (workflow_id, seq, COALESCE(role_code,''), COALESCE(user_id,0))
);
CREATE INDEX ix_step_pending ON approval_step (status, user_id) WHERE status = 'pending';

-- ============ Projects & prototypes ============
CREATE TABLE project (
  project_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES company,
  name        TEXT NOT NULL,
  product_item_id BIGINT REFERENCES item,
  stage       TEXT NOT NULL DEFAULT 'concept' CHECK (stage IN
                ('concept','design','prototype','pre_production','released','cancelled')),
  owner_id    BIGINT NOT NULL,
  start_date  DATE, target_date DATE,
  milestones  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE ecr ADD CONSTRAINT fk_ecr_project
  FOREIGN KEY (project_id) REFERENCES project (project_id);

CREATE TABLE prototype (
  prototype_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id   BIGINT REFERENCES project,
  item_id      BIGINT NOT NULL REFERENCES item,
  revision_id  BIGINT REFERENCES item_revision,
  build_no     SMALLINT NOT NULL DEFAULT 1,
  test_plan_doc_id BIGINT REFERENCES document,
  result       TEXT CHECK (result IN ('pass','fail','partial')),
  notes        TEXT,
  built_on     DATE
);

-- ============ AI & audit ============
CREATE TABLE ai_extraction_job (
  job_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id  BIGINT NOT NULL REFERENCES document,
  status       TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','running','review','committed','failed','discarded')),
  raw_result   JSONB,        -- extracted lines + confidences + bounding boxes
  reviewed_by  BIGINT, committed_bom_id BIGINT REFERENCES bom,
  model_ref    TEXT, tokens_used INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (              -- append-only; populated by triggers + app events
  audit_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  BIGINT,
  table_name  TEXT NOT NULL,
  record_id   BIGINT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('insert','update','delete','transition')),
  actor_id    BIGINT,
  old_values  JSONB, new_values JSONB,
  reason      TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_record ON audit_log (table_name, record_id, at DESC);
-- No UPDATE/DELETE grants on audit_log to the app role.
```

### 9.1 Cardinality & design notes

| Relationship | Cardinality | Note |
|---|---|---|
| item → item_revision | 1:M | Immutable once released; exclusion constraint guarantees ≤ 1 released revision effective on any date |
| item → bom | 1:M | Versioned per ECO; `is_default` + effectivity resolve "the" BOM; EBOM and MBOM coexist |
| bom → bom_line | 1:M | `component_item_id → item` is the self-referencing edge for explosion & where-used |
| bom → routing → operation | 1:1..M, 1:M | Routing releases with its BOM |
| ecr → eco | 1:M | One request can spawn several orders |
| eco ↔ item | M:N via eco_line | Line carries old→new revision and old→new BOM plus disposition |
| document ↔ item/eco/operation | M:N-ish via nullable FKs | Adequate at SME scale; junction table if link types multiply |
| approval_workflow | polymorphic | Over ECR/ECO/BOM/DOCUMENT via (entity_type, entity_id) |
| item.low_level_code | derived | Longest path from any root; recomputed on BOM release (see §11.1) |

**Versioning approach (researched):** we deliberately model revisions as **first-class domain rows** (item_revision, bom.version) rather than relying on generic history extensions like SQLAlchemy-Continuum/sqlalchemy-history — effectivity, supersession and approvals must be queryable business objects, not audit shadows. The trigger-based JSONB `audit_log` (postgresql-audit / 2ndQuadrant pattern) complements this for field-level forensics.

---

## 10. API Design

REST, OpenAPI 3.1, base path `/api/v1/eng`. JWT bearer auth; all endpoints tenant-scoped by the token's `company_id`. Errors follow RFC 9457 problem+json. List endpoints support `?page,size,sort,q,filter`.

| Method | Path | Purpose | Key request / response fields |
|---|---|---|---|
| GET | `/items` | Search/list items | q (trigram), type, status, hsn → rows + facets |
| POST | `/items` | Create item | code?, name, type, uom, hsn, specs → item (code auto-assigned if omitted) |
| GET | `/items/{id}` | Item detail | → item + current_revision + default_bom summary |
| PATCH | `/items/{id}` | Edit (Draft-only controlled fields) | changed fields → item; 409 if released field touched |
| POST | `/items/{id}/transition` | Lifecycle transition | to_status, comment → item; 422 on illegal transition |
| GET | `/items/{id}/revisions` | Revision timeline | → [{rev, status, effective_from/to, eco_no, released_by}] |
| GET | `/items/{id}/where-used` | Reverse explosion | depth?, as_of? → tree [{parent, qty_per, level, bom_status}] + open_demand + stock (Inventory/Planning lookups) |
| GET | `/items/{id}/similar` | AI similar parts | limit → [{item, similarity, spec_diff}] |
| GET | `/items/{id}/effective-bom` | Resolve BOM as of date | as_of, bom_type, plant? → bom header or 404 `none_effective` |
| POST | `/boms` | Create BOM (draft) | item_id, bom_type, qty, uom, source_bom_id? → bom |
| GET | `/boms/{id}` | BOM header + tree (1 level or `?depth=n`) | → header, lines[], rollup |
| POST | `/boms/{id}/lines` / PATCH `/boms/{id}/lines/{lid}` / DELETE | Line CRUD (draft only) | component_id, qty, uom, scrap_pct, op, flags → line; 422 with cycle path on circular ref |
| GET | `/boms/{id}/explode` | Multi-level explosion | view=indented\|summarized, qty=N → lines with level, path, qty_required (scrap-inflated), source (phantom-blown) |
| POST | `/boms/{id}/rollup` | Cost rollup | → {material_cost, operation_cost, total, per_level[]}; persists on header |
| GET | `/boms/{id}/diff/{other_id}` | Rev-to-rev diff | → {added[], removed[], changed[{field, old, new}]} |
| POST | `/boms/{id}/copy-to-mbom` | EBOM→MBOM copy | → new draft MBOM + reconciliation report |
| POST | `/boms/{id}/submit` | Submit for release | workflow_template? → approval workflow created |
| POST | `/boms/{id}/release` | Release (post-approval) | effective_from → released bom + revision; runs readiness checklist, 422 with failed checks |
| POST | `/boms/import` | CSV/Excel import | file, mapping → validation report; commit flag |
| CRUD | `/routings`, `/routings/{id}/operations` | Routing & operations | seq, workstation, setup/run, subcontract fields |
| POST | `/ecrs` / GET `/ecrs` / GET `/ecrs/{id}` / PATCH | ECR CRUD | title, description, reason_code, priority, affected_items[] |
| POST | `/ecrs/{id}/transition` | Submit / evaluate / accept / reject / hold | to_status, comment → ecr |
| GET | `/ecrs/{id}/impact` | Impact analysis (also `/ecos/{id}/impact`) | → {where_used, open_pos[], open_wos[], stock[{onhand, wip, value}], cost_delta}; snapshot persisted |
| POST | `/ecrs/{id}/convert` | Convert to ECO | → draft eco (carries items/attachments) |
| POST | `/ecos` / GET / PATCH | ECO CRUD | title, ecr_id, effectivity_type/date, lines[] |
| POST | `/ecos/{id}/ai-draft` | AI auto-draft ECO content | → proposal {lines[], dispositions[], approvers[], rationale} — not persisted until PATCH confirm |
| POST | `/ecos/{id}/submit` | Route for approval | template → workflow |
| POST | `/ecos/{id}/apply` | **Apply ECO (atomic)** | → {new_revisions[], superseded[], effectivity}; emits `eng.eco.applied`; 409 unless status=approved |
| POST | `/ecos/{id}/close` | Close after implementation | → eco |
| GET | `/changes/board` | Kanban data | → columns[{status, cards[{type, no, title, age_days, priority, ₹impact}]}] |
| GET | `/approvals/inbox` | My pending steps | → [{entity, step, title, age, impact}] |
| POST | `/approvals/steps/{id}/decide` | Approve/reject/delegate | decision, comment, delegate_to?, e_sign_password? → step; advances workflow |
| CRUD | `/documents` | Vault | upload (multipart/presigned), doc_type, links |
| POST | `/documents/{id}/checkout` · `/checkin` | Lock/unlock | → lock state; 409 if held |
| POST | `/documents/{id}/extract-bom` | Queue AI extraction | target_item_id? → job {id, status} |
| GET | `/ai/extraction-jobs/{id}` | Poll/review result | → status, lines[{raw_text, matched_item?, qty, uom, confidence, bbox}] |
| POST | `/ai/extraction-jobs/{id}/commit` | Commit reviewed lines | corrected lines[] → draft bom_id |
| CRUD | `/projects`, `/prototypes` | NPI | stage transitions guarded |
| GET | `/dashboard` | KPI payload | → kpis{}, charts{by_reason[], cycle_trend[], funnel[]}, worklists{} |
| GET | `/reports/{name}` | Named reports | params → rows; `Accept: text/csv` for export |
| WS/SSE | `/events/stream` | Live updates | approval decided, kanban moved, extraction done, eco applied |

**Internal events (bus):** `eng.item.released`, `eng.bom.released`, `eng.eco.applied` (payload: affected items, old/new revision ids, effectivity date, dispositions), `eng.item.obsoleted`, `eng.document.released`. Planning/MRP subscribes to schedule the cut-over; SMBD subscribes to refresh quote costs; Purchase subscribes to flag open POs.

---

## 11. Backend Logic

Python 3.12 / FastAPI service `eng-service`; heavy jobs on Redis-backed workers (arq/Celery). Key algorithms:

### 11.1 Low-level codes (LLC)

LLC = the deepest level at which an item appears in any BOM (0 = top). Used to (a) order bottom-up cost rollup and (b) hand Planning correct MRP processing order.

- Recompute incrementally on BOM release/apply: BFS from changed parents downward; `low_level_code = max(existing, parent_llc + 1)`; full rebuild nightly as a safety net (topological pass over `bom_line`, cycle-free by construction because of the circularity guard).

### 11.2 Multi-level explosion

Recursive CTE over released, effective BOMs (research confirms recursive SQL beats app-side iteration; PostgreSQL `SEARCH DEPTH FIRST` gives stable tree ordering; always guard depth):

```sql
WITH RECURSIVE x AS (
  SELECT bl.component_item_id, bl.qty * (1 + bl.scrap_pct/100.0) AS qty_req,
         1 AS lvl, ARRAY[b.item_id, bl.component_item_id] AS path,
         bl.is_phantom
  FROM bom b JOIN bom_line bl USING (bom_id)
  WHERE b.bom_id = :root_bom
  UNION ALL
  SELECT cl.component_item_id, x.qty_req * cl.qty * (1 + cl.scrap_pct/100.0),
         x.lvl + 1, x.path || cl.component_item_id, cl.is_phantom
  FROM x
  JOIN bom cb  ON cb.item_id = x.component_item_id
             AND cb.status = 'released' AND cb.is_default AND cb.bom_type = :bom_type
             AND daterange(cb.effective_from, COALESCE(cb.effective_to,'infinity'::date))
                 @> :as_of::date
  JOIN bom_line cl ON cl.bom_id = cb.bom_id
  WHERE x.lvl < 25                            -- hard depth guard
    AND NOT cl.component_item_id = ANY(x.path) -- belt-and-braces cycle guard
) SEARCH DEPTH FIRST BY component_item_id SET ord
SELECT * FROM x;
```

- **Phantom blow-through:** post-process — phantom nodes contribute children at the parent's level; the phantom itself is excluded from the summarised view.
- **Summarised view:** GROUP BY component over the indented result.
- Cache exploded results per (bom_id, as_of, qty) in Redis, invalidated by `eng.bom.released`/`eng.eco.applied`.

### 11.3 Where-used (reverse explosion)

Same CTE inverted (start `bom_line.component_item_id = :item`, join upward via `bom.item_id`). Enriched by cross-module lookups: open POs (Purchase), open WOs (Planning/Production), on-hand/WIP (Inventory) — via internal REST with a 2 s timeout and graceful "stock data unavailable" degradation.

### 11.4 Cost rollup

Bottom-up by descending LLC: purchased items take `std_cost`; manufactured items = Σ(component cost × qty × (1+scrap)) + Σ(setup/batch_qty + run×rate) per operation (+ subcontract charge). Persist per BOM header with timestamp; expose per-level drill-down. Variance report compares stored rollup vs current.

### 11.5 State machines

Implemented as explicit transition tables (single source of truth shared with frontend via `/meta/state-machines`):

```
ECR: draft→submitted→under_evaluation→{accepted, rejected, on_hold}
     accepted→converted→closed;   on_hold→under_evaluation
ECO: draft→impact_analysis→in_approval→{approved, rejected}
     approved→applied→closed;    draft|impact_analysis→cancelled
BOM: draft→under_review→{released, draft};  released→obsolete (via ECO only)
```

Guards: role check (RBAC §14), separation of duties (creator ≠ deciding approver), payload preconditions (ECO must have ≥1 line + effectivity to submit; impact snapshot required before approval routing). Every transition writes `audit_log(action='transition')`.

### 11.6 ECO apply & effectivity cut-over (the crown jewel)

Single DB transaction:
1. Lock ECO row (`SELECT … FOR UPDATE`); verify status = approved (idempotency: applied → return prior result).
2. For each `eco_line`: create new `item_revision` (status released, `effective_from` = ECO date); set old revision `effective_to` = date and `superseded_by`; release new BOM version, expire old (validity-chain update — the exclusion constraints make an incorrect overlap physically unstorable).
3. Re-link released documents to new revisions; mark superseded drawings for OBSOLETE watermark.
4. Update `item.current_revision`, `default_bom_id`; recompute LLC incrementally; enqueue cost re-rollup for ancestors (where-used walk).
5. Write audit rows; set ECO applied.
6. **After commit**, publish `eng.eco.applied` via transactional outbox (event row written in the same transaction, relayed by a worker — guarantees Planning/MRP never misses a cut-over).

Effectivity semantics for consumers: MRP explodes demand dated < cut-over on the old BOM and ≥ cut-over on the new (date effectivity per APICS practice; serial/lot and use-up in P2 — use-up subscribes to stock-depletion events, NetSuite-style).

### 11.7 Approval engine

Generic over (entity_type, entity_id). Template (per change type/risk) instantiates steps; same-`seq` parallel steps must all approve; any reject fails the workflow and returns entity to its editable state with notification. Delegation re-assigns a step preserving history. E-sign: password re-verification → store `sha256(user_id ‖ entity ‖ decision ‖ ts)` in `approval_step.e_signature`. Escalation job flags steps pending > SLA (dashboard aging + reminder).

### 11.8 Numbering & sequences

Per-company, per-year sequences (`ECR-2026-0042`) using a `sequence_counter` row with `SELECT … FOR UPDATE` (gapless enough for audit; no PostgreSQL sequence gaps in numbers users see).

### 11.9 Background jobs

| Job | Trigger | Notes |
|---|---|---|
| AI BOM extraction | user action | OCR+LLM pipeline (§13.1), status via SSE |
| Embedding upsert | item create/update | description+specs → vector |
| LLC rebuild + cost re-rollup | nightly + on release | safety net |
| Approval SLA escalation | cron 30 min | notifications |
| Effectivity activation | daily 00:05 IST | flips `current_revision` display for dated cut-overs; emits reminder 3 days ahead ("effectivity calendar") |
| Outbox relay | continuous | at-least-once event delivery |

---

## 12. Frontend Components

React 18 + TypeScript + Vite; shadcn/ui primitives; TanStack Query for server state; TanStack Table (headless) + TanStack Virtual for the tree grid — 2025-26 ecosystem reviews consistently rank this the most flexible base for custom tree-tables with inline edit and virtualization; drag-and-drop via `dnd-kit` (react-arborist is the fallback if we want a batteries-included tree, but the BOM grid needs table columns, so headless wins).

### 12.1 Component tree (key branches)

```
<EngineeringModule>
├─ <EngShell>                    // left rail, breadcrumbs, CommandBar (cmdk), SSE provider
├─ routes/
│  ├─ <DashboardPage>            <KpiCard/>×5 <ReasonBarChart/> <CycleTrendChart/> <ApprovalFunnel/> <WorklistPanel/>
│  ├─ <ItemListPage>             <DataTable/> <SavedFilters/> <ImportDialog/>
│  ├─ <ItemDetailPage>           <ItemHeaderCard/> <SpecEditor/> <RevisionTimeline/> <WhereUsedTab/> <SimilarPartsPanel/> <ActivityDrawer/>
│  ├─ <BomEditorPage>
│  │   ├─ <BomTreeGrid>          // TanStack Table + Virtual; rows = flattened visible nodes
│  │   │   ├─ <TreeCell/>        // indent, expander, phantom/jobwork badges
│  │   │   ├─ <EditableCell/>    // qty/scrap/uom; Enter/F2; Zod-validated
│  │   │   ├─ <AddRowTypeahead/> // component search + similar-part nudge
│  │   │   └─ <DragLayer/>       // dnd-kit re-parent; invalid targets greyed (client cycle check)
│  │   ├─ <LinePanel/>           // right context panel
│  │   ├─ <CostRollupCard/> <DiffOverlayToggle/> <ReleaseChecklistDialog/>
│  ├─ <RoutingPage>              <OperationList/> (sortable) <OperationDetail/> <RoutingCostFooter/>
│  ├─ <ChangesBoardPage>         <KanbanBoard/> (dnd-kit columns) <ChangeCard/> <RegisterTable/> toggle
│  ├─ <EcrFormPage> <EcoFormPage>
│  │   ├─ <StatusStepper/> <AffectedItemsTable/> <EffectivityHelper/> <ImpactPanel/>
│  │   ├─ <ApprovalRail/> <AiDraftPanel/>       // proposal diff-view + Accept/Discard
│  ├─ <WhereUsedPage>            <ReverseTree/> <OpenDemandTable/> <StockExposureCards/>
│  ├─ <RevisionComparePage>      <RevTimeline/> <BomDiffView/>    // green/red/amber rows
│  ├─ <ApprovalsInboxPage>       <ApprovalCard/> <DecisionSheet/> <ESignModal/>
│  ├─ <DocumentVaultPage>        <DocTable/> <PdfPreviewDrawer/> <UploadDropzone/> <ExtractBomButton/>
│  ├─ <ExtractionReviewPage>     <ExtractedLinesGrid/>  // confidence chips, bbox hover-highlight on PDF
│  └─ <NpiBoardPage>             <KanbanBoard/> <ProjectDrawer/>
└─ shared/  <StatusChip/> <MoneyINR/> <ConfidenceChip/> <AiButton/> <AuditTrail/> <EmptyState/>
```

### 12.2 State management

- **Server state:** TanStack Query; query keys `['item', id]`, `['bom-tree', bomId, asOf]`, `['board']`, `['inbox']`. Mutations invalidate narrowly; optimistic updates for inline BOM edits with rollback toast on 4xx.
- **Local/UI state:** Zustand slices — `bomEditor` (expanded node set, selection, dirty rows, diff mode), `board` (filters), `commandBar`. No global Redux.
- **Live updates:** SSE (`/events/stream`) → targeted query invalidation (an approval decided elsewhere updates the inbox badge and card in-place).
- **Forms:** react-hook-form + Zod schemas generated from OpenAPI (shared validation vocabulary with Pydantic).
- **Diff highlighting:** server returns structured diff; `<BomDiffView/>` renders row-level classes (`added/removed/changed`) with old→new inline chips — same component reused in ECO preview and Revision Compare.
- **Kanban:** column drop fires `transition` mutation; server rejection animates snap-back with the guard message (illegal transitions are *also* prevented client-side from `/meta/state-machines`).
- **Performance:** virtualize > 200 rows; memoized row models; explosion views stream in pages for giant structures.

---

## 13. AI Features

Trust model (platform-wide): **the AI drafts, a human approves.** Every AI surface is a marked "✦ AI" action, shows its evidence, and never writes to the ERP without an explicit user commit. All AI calls go through a thin internal `ai-gateway` (prompt templates, PII scrubbing, token metering, model fallback), using the Anthropic Claude API (vision-capable model for drawings) + pgvector for embeddings.

### 13.1 BOM extraction from drawings (flagship; MVP demo)

Research grounding: hybrid vision-LLM pipelines on 2D engineering drawings reach ~94–97 % F1 on structured fields (arXiv 2505.01530, 2506.17374); Azure's GPT+Document-Intelligence BOM pipeline reports ~94 % material-extraction accuracy, improved ~5 % by expert-review-driven prompt iteration. Practical implication: **confidence scoring + human review grid is not optional — it is the product.** Accuracy drops on low-res scans and non-standard tables, so we surface per-line confidence and keep the source image adjacent during review.

**Pipeline (background worker):**
1. `POST /documents/{id}/extract-bom` → job queued.
2. Pre-process: PDF → page images (300 dpi); detect parts-list table regions + title block.
3. Claude vision call per region with a structured-output prompt (JSON schema): `{lines:[{pos_no, description, material, qty, uom, drawing_ref, remarks, confidence}] , title_block:{drawing_no, rev, title, material_spec}}`. Low "reasoning temperature" for spatial reads; a second semantic pass normalises UOMs and materials.
4. Entity matching: each extracted description → hybrid search over the item master (pg_trgm lexical + pgvector semantic, RRF-fused) → `matched_item_id` + match score, or "new item" proposal with suggested code/type/HSN.
5. Result stored on `ai_extraction_job.raw_result` (incl. bounding boxes for hover-highlight); status → `review`; SSE notifies.
6. **Review grid:** user corrects/confirms → `commit` creates Draft BOM (+ any new Draft items). Corrections are logged for prompt-iteration analytics (the documented accuracy lever).

**Prompt sketch (extraction):**
```
System: You extract manufacturing parts lists from Indian engineering drawings.
Return ONLY JSON matching the provided schema. If a cell is illegible, set the
field null and confidence ≤ 0.5. Quantities: prefer the QTY column; UOM defaults
NOS unless a unit is printed. Do not invent part numbers.
User: [page image] + [schema] + "Extract the parts list and title block."
```

### 13.2 Similar / duplicate-part search (MVP demo)

- Embed `name + description + canonicalised specs` (e.g. "Hex bolt M6×20 8.8 zinc") on item create/update → `item.embedding` (HNSW index).
- `GET /items/{id}/similar` and the type-ahead nudge in the BOM editor run hybrid retrieval (trigram + cosine, RRF fusion — the 2025-standard pgvector hybrid pattern) with a spec-diff summary generated by the LLM ("same thread/length; grade 8.8 vs 10.9").
- Guardrail: suggestions only; the engineer decides reuse vs new code. KPI: duplicate codes prevented.

### 13.3 Change-impact assistant (MVP demo, deterministic core)

- The **numbers are computed, not generated**: where-used, open PO/WO, stock value, cost delta come from §11.3/11.4 queries.
- The LLM writes the narrative + disposition recommendation from that structured snapshot: "Rework the 12 WIP casings (₹8,400) and use up 40 finished impellers; scrap value avoided ≈ ₹1.9 L; switch Rev B from 1 Aug." Rationale cites the snapshot rows it used.
- Data flow: `impact_snapshot JSONB` → prompt → recommendation stored alongside, flagged `ai_drafted`.

### 13.4 Auto-draft ECO from ECR (MVP demo)

`POST /ecos/{id}/ai-draft`: prompt = ECR text + affected items + their BOM neighbourhood (1-hop graph) + impact snapshot → proposal: affected-items table (change_type, suggested new rev codes), dispositions, effectivity suggestion, approver set. Rendered in `<AiDraftPanel/>` as a reviewable diff; Accept writes fields (marked `ai_drafted=true`), Discard leaves no trace in the ECO.

### 13.5 Smart approval routing (P2)

Few-shot classification of change risk (minor/major/critical) from ECR/ECO text + impact size → recommends workflow template (`fast_track` vs `quality_critical`); logged, overridable. Later: learn from historical cycle times to predict bottleneck approvers.

### 13.6 NL query bar (P2)

NL → tool-calls against read-only report endpoints (never raw SQL); the interpreted query is always displayed ("Showing: where-used for SEAL-MECH-25 + open WOs").

**Cost & privacy notes:** extraction ≈ 2–4 vision calls/drawing (metered per tenant); embeddings are local-DB; on-prem deployments can later swap the gateway to a self-hosted model without app changes (DPDP posture).

---

## 14. Security

### 14.1 RBAC matrix (from PLANNING §1.6, mapped to permission codes)

| Role | Create Item/BOM | Edit MBOM/Routing | Raise ECR | Approve ECO | Release Rev | Doc control |
|---|---|---|---|---|---|---|
| Design Engineer | ✔ (EBOM) | — | ✔ | — | — | attach |
| Process/Mfg Engineer | ✔ | ✔ | ✔ | — | — | attach |
| Engineering Manager | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Quality Engineer | — | view | ✔ | ✔ (quality gate) | — | ✔ |
| Change/Config Manager | — | — | ✔ | ✔ | ✔ | ✔ |
| Document Controller | — | — | — | — | — | ✔ (check-in/out, distribute) |
| Purchase/Prod Planner | — | — | ✔ | ✔ (impact gate) | — | view |
| Costing/Finance | — | — | — | ✔ (cost gate) | — | view |

Permission codes: `eng.item.create`, `eng.bom.edit_ebom`, `eng.bom.edit_mbom`, `eng.routing.edit`, `eng.ecr.create`, `eng.ecr.evaluate`, `eng.eco.approve.{design|quality|impact|cost|final}`, `eng.rev.release`, `eng.doc.control`, `eng.doc.attach`, `eng.*.view`. Roles are permission bundles; tenants can adjust bundles (small shops collapse roles — a 25-person shop's Engineering Manager holds most gates, and the separation-of-duties rule still holds per entity).

### 14.2 Enforcement principles

- **Separation of duties:** an approval step cannot be decided by the entity's creator or by the same user twice across gates on the same workflow (server-checked at `decide`).
- **Released = read-only:** controlled fields of released items/BOMs/routings/documents reject writes at the API and are physically protected by the state machine (changes only via ECO). Applied ECOs immutable.
- **Never hard-delete** released/applied records (NFR); DELETE endpoints work on Draft only and soft-delete.
- **Audit log:** append-only, trigger-populated JSONB before/after + app-level transition events; app DB role has no UPDATE/DELETE on `audit_log`. Viewer UI under `eng.audit.view`.
- **E-signature (optional per tenant):** password re-entry on approve → signature hash stored on the step; exportable evidence pack per ECO (PDF: diff + approvals + signatures) for customer/ISO/IATF audits.
- **AuthN:** JWT access (15 min) + rotating refresh; tokens carry `company_id`, `plant_ids`, role bundle. Per-tenant row scoping in every query (SQLAlchemy global filter); documents via short-lived signed URLs.
- **Transport/storage:** TLS 1.2+; documents encrypted at rest; secrets via env/vault; rate limiting on auth + AI endpoints.
- **DPDP posture:** personal data limited to employee identities; on-prem deploy keeps drawings in-plant; AI gateway scrubs personal identifiers from prompts.

---

## 15. Validation

### 15.1 Field-level (Pydantic + Zod, shared vocabulary)

| Field | Rule |
|---|---|
| item_code | `^[A-Z0-9][A-Z0-9\-\/\.]{1,31}$`, unique per company (case-insensitive) |
| HSN | 4/6/8 digits; required before item release; GST rate ∈ {0, 0.1, 0.25, 3, 5, 12, 18, 28} or custom with warning |
| qty / qty_per | > 0; ≤ UOM precision decimals |
| scrap_pct | 0–100; warn > 25 (“unusually high scrap — confirm”) |
| setup/run time | ≥ 0; run_time warn > 480 min/unit |
| effective dates | `effective_to > effective_from`; effective_from ≥ today for new releases (backdating needs `eng.rev.release` + reason) |
| rev_code | monotonic per item numbering scheme (A→B→C…; no reuse) |
| file uploads | type whitelist (pdf, png, jpg, dxf, dwg, step, xlsx), ≤ 50 MB, AV scan hook |

### 15.2 Business rules

| # | Rule | Enforcement |
|---|---|---|
| V-01 | **Circular BOM prevention** — component may not appear in its own ancestry at any depth | On line save: ancestor-path CTE check; 422 returns the cycle path. Client greys invalid drag targets. Explosion carries belt-and-braces path guard |
| V-02 | **UOM compatibility** — line UOM must equal component stock UOM or have a defined conversion | 422 with conversion hint |
| V-03 | **Effectivity overlap** — ≤ 1 released revision/default BOM effective per item per date | GiST exclusion constraints (§9) + friendly pre-check API so the UI explains before the DB rejects |
| V-04 | **Release readiness checklist** (Dynamics-style readiness policy): all components exist and are not Obsolete; no Draft component below a released parent (warn/block per config); UOMs valid; cost rolled up; HSN present; drawing attached (config); routing present for manufactured items; no empty alternates group | `release` returns per-check pass/fail; UI renders the checklist |
| V-05 | Phantom items cannot be purchased, cannot carry a routing, must have a BOM | Item-type guard + release check |
| V-06 | ECO must have ≥ 1 line, effectivity set, impact snapshot present before `submit` | Transition guard |
| V-07 | ECO apply only from Approved; all its new revisions must still be in Draft-of-record (no side-door releases) | Apply transaction pre-checks |
| V-08 | Obsolete items: blocked from new BOM lines/ECO "add" targets; existing usage flagged in where-used | Line-save guard + report badge |
| V-09 | Alternate group lines must share UOM-compatible components; exactly one priority-1 primary | Group validation on save |
| V-10 | Job-work line requires vendor ref; subcontract operation requires vendor + charge | Conditional requireds |
| V-11 | Reference-designator count must equal qty for count UOMs (electronics) | P2 validator |
| V-12 | Import: all-or-nothing per file after row-level validation report | Import service |

---

## 16. Testing

Pyramid: pytest (unit) → pytest + testcontainers-postgres (integration; real Postgres because exclusion constraints/CTEs can't be faked on SQLite) → Playwright (E2E) → k6 (perf). Target: ≥ 85 % coverage on §11 logic; CI gates on all suites.

### 16.1 Unit (backend)

- `test_explosion_multilevel_quantities` — 4-level pump BOM: aggregated qty correct when SEAL-MECH-25 appears at levels 2 and 3; scrap inflation applied per level.
- `test_explosion_phantom_blowthrough` — phantom hardware-kit children appear at parent level; phantom absent from summarised view.
- `test_explosion_depth_guard_and_cycle_guard` — synthetic deep/cyclic data terminates with error, never hangs.
- `test_circular_bom_rejected_with_path` — direct (A→A), 2-level and 6-level cycles all rejected; path in error payload.
- `test_llc_incremental_update` — inserting a sub-assembly deepens LLC of shared components; nightly rebuild idempotent.
- `test_cost_rollup_bottom_up` — hand-computed 3-level rollup incl. scrap, setup amortisation, subcontract charge matches to the paisa.
- `test_ecr_state_machine_illegal_transitions` — table-driven: every illegal (from, to) pair → 422; legal pairs write audit.
- `test_effectivity_validity_chain` — releasing Rev C from D sets Rev B `effective_to=D`; overlap insert raises exclusion violation.
- `test_bom_diff` — added/removed/qty-changed/field-changed classification, incl. UOM change and alternate-group change.
- `test_separation_of_duties` — creator approving own ECO gate → 403.
- `test_sequence_numbering_concurrency` — 50 parallel ECR creates yield gapless unique numbers.

### 16.2 Integration

- `test_eco_apply_atomic_cutover` — **the flagship**: approved ECO with 2 lines → apply → new revisions released, old superseded with correct `effective_to`, documents re-linked, LLC updated, outbox event row written; inject a failure on line 2 → full rollback, nothing applied, ECO still Approved.
- `test_eco_apply_idempotent` — double-apply returns first result, no duplicate revisions.
- `test_effective_bom_resolution` — `/items/{id}/effective-bom?as_of=` returns old BOM the day before cut-over, new BOM on the day, 404 before first release.
- `test_approval_workflow_parallel_steps` — parallel quality+cost gates: one rejects → workflow rejected, ECO back to Draft, notifications sent.
- `test_release_readiness_blocks` — BOM with draft component + missing HSN fails exactly those checks.
- `test_where_used_with_degraded_inventory` — inventory service down → where-used still returns structure with `stock: unavailable`.
- `test_ai_extraction_commit_creates_draft_only` — committed extraction produces Draft BOM + Draft items; nothing released; corrections persisted on the job.
- `test_audit_log_immutable` — UPDATE/DELETE on audit_log as app role → permission denied.
- `test_rbac_matrix` — parametrised over §14.1: every role × action combination.

### 16.3 E2E (Playwright, demo dataset)

- `e2e_change_loop_happy_path` — raise impeller-material ECR → impact → convert → AI-draft review → approvals (3 roles incl. mobile viewport approve) → apply → verify Rev B effective, diff view correct, dashboard cycle-time updated.
- `e2e_bom_editor_inline_and_drag` — add line via type-ahead (similar-part nudge appears), inline qty edit optimistic + server confirm, drag re-parent, illegal drag (cycle) blocked with tooltip.
- `e2e_extraction_review_flow` — upload parts-list PDF → job completes → fix 2 amber lines → commit → Draft BOM tree matches.
- `e2e_release_guarded` — release attempt with failing checklist blocked; fix; released BOM becomes read-only with Raise-ECR shortcut.
- `e2e_mobile_approvals` — 390 px viewport: inbox → 2-tap approve with comment.

### 16.4 Performance (k6)

- Explosion p95 < 1 s @ 10 levels/2,000 lines, 50 VUs; item search p95 < 300 ms @ 50k items; impact analysis < 5 s; dashboard < 1.5 s; 500 concurrent users mixed workload on the demo VM without error-rate > 0.1 %.

---

## 17. MVP Scope

MVP = investor-demoable vertical slice: Items, multi-level BOM, routing, revisions, lightweight ECR/ECO Kanban, AI BOM-extract demo — on seeded demo data (§20), no real customer backend yet.

| Area | ✅ In MVP | ❌ Out (phase) |
|---|---|---|
| Items | Master, types, HSN/GST, multi-UOM, lifecycle, revisions, search/import, where-used | Variants (P3), supersession automation (P2) |
| BOM | Multi-level tree editor, phantoms, alternates, scrap, job-work flag, explosion, cost rollup, rev diff, CSV import | EBOM→MBOM reconciliation (P2), 150 % super-BOM (P3), mass change tool (P2) |
| Routing | Operations, workstations, times, costs, subcontract op, SOP attach | Alternate routings (P2) |
| Revisions/Effectivity | Immutable revisions, date effectivity + validity chain, plain-language helper, timeline/compare | Serial/lot/unit + use-up effectivity (P2) |
| Change control | ECR + ECO forms, state machines, Kanban board, impact analysis (computed), approval workflows, My Approvals (web+mobile), apply/cut-over, audit trail | Smart routing (P2), CCB cost/benefit analytics (P2), e-sign default-on (config exists) |
| Documents | Vault, versions, check-in/out, PDF preview, links | Watermarked distribution (P2), full DMS folders (P2) |
| NPI | Light project board (stages, milestones) | Gate checklists, prototype tracking (P2) |
| AI | BOM extraction demo (real pipeline, seeded drawings), similar-part search, impact narrative, auto-draft ECO panel | Smart approval routing, NL query, DFM/alternate suggestions (P2/P3) |
| Dashboard | KPI cards + 3 charts + worklists | Custom report builder (P3) |
| Integration | Event emission (`eco.applied` etc.) with stub consumers; SMBD cost feed contract | Live MRP cut-over (when Planning lands), CAD/PDM (P3) |

---

## 18. Future Roadmap

**Phase 2 — Differentiate (post-MVP, aligns with PLANNING build sequence):**
- Full effectivity: serial/lot/unit + use-up (auto cut-over on stock depletion), effectivity calendar with reminders wired to MRP.
- EBOM→MBOM transformation with reconciliation report and sign-off (Teamcenter-inspired change-summary UX).
- Mass-change ECO (component replace across N parents — the ERPNext BOM-Update-Tool use case done with real revisions and full-depth propagation).
- Smart approval routing + approval SLA analytics; WhatsApp/push approval notifications.
- Document distribution control (OBSOLETE watermarking), PPAP/FAI evidence packs; NCR/CAPA→ECR trigger from Quality.
- NL query bar; extraction prompt-iteration loop from review corrections; regional-language tooltips.

**Phase 3 — Lead:**
- Bi-directional CAD/PDM sync (SolidWorks/Inventor/Creo via connector layer; drawing revs → item revs).
- Variant/configurable super-BOM (150 %) with rules feeding SMBD configure-to-order quoting.
- Digital thread: requirement → design → ECO → WO → serial traceability across modules; sustainability/compliance BOM (RoHS/REACH/BIS, carbon per BOM).
- Autonomous change agents drafting ECOs from field-failure/quality signals; DFM hints; should-cost prediction.
- On-prem local-model AI option for drawing extraction (DPDP-max posture).

---

## 19. Technology Stack & Rationale

Shared IND-CORE platform baseline, validated for this module:

| Layer | Choice | Rationale & trade-offs |
|---|---|---|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query/Table | The BOM tree grid demands a headless table with virtualization and custom cells — TanStack Table + Virtual is the 2025-26 consensus base for exactly this (drag-drop/inline-edit built on top; react-arborist as tree fallback). shadcn/ui gives owned, themeable components (ERP information density) vs. opinionated kits. *Vs Next.js:* an authenticated internal app gains nothing from SSR/SEO and pays RSC complexity; Vite SPA keeps the module embeddable in the IND-CORE shell. Revisit Next only if a public marketing/portal surface appears. |
| **Backend** | Python 3.12 + FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2 | Aligns with the existing ind-ai-mvp FastAPI codebase (shared auth, conventions, deploy); first-class OpenAPI for the Zod-typegen pipeline; Python keeps AI pipeline and API in one language. *Vs NestJS:* team/codebase alignment and AI ecosystem outweigh TS-everywhere symmetry; the typed-contract gap is closed by OpenAPI codegen. Domain versioning is explicit tables (§9.1), not ORM history plugins. |
| **Database** | PostgreSQL 16 + pgvector | One engine covers relational integrity (GiST exclusion constraints make effectivity overlaps unstorable — a correctness feature few ERPs get), recursive CTEs for explosion/where-used, JSONB (specs, impact snapshots, audit), trigram search, and vectors (HNSW) for similar-part/hybrid search — no separate vector DB on day one (standard 2025 guidance). |
| **Auth** | JWT access (15 min) + rotating refresh, RBAC claims | Stateless across services; on-prem friendly. *Vs Supabase:* attractive velocity, but self-hosting maturity, RLS-centric model vs our service-layer RBAC, and DPDP on-prem requirement argue for owned FastAPI auth (already exists in ind-ai-mvp). |
| **APIs** | REST (OpenAPI 3.1) + internal event bus (transactional outbox → Redis Streams; upgrade path NATS/RabbitMQ) | REST for CRUD/reports; the outbox guarantees Planning never misses an `eco.applied` cut-over. GraphQL rejected (cache complexity; our aggregates are purpose-built endpoints). |
| **Real-time** | SSE primary (approvals, job status, board moves) + WebSocket where bidirectional needed | SSE is proxy-friendly and reconnect-simple for one-way invalidation signals — most of our needs. |
| **Charts** | Recharts (KPI/bar/line/funnel) + ECharts for heatmaps/dense viz | Recharts = fast React-idiomatic composition for dashboard charts; ECharts (canvas) reserved for effectivity-calendar heatmap and Planning's capacity heatmap — one heavy lib shared platform-wide. |
| **AI** | Anthropic Claude API (vision + text) via internal ai-gateway + pgvector embeddings | Vision-grade extraction per §13 research; gateway isolates prompts/costs and enables later on-prem model swap (DPDP). Embeddings in-DB → hybrid RRF search with zero extra infra. |
| **Workers/cache** | Redis + arq (or Celery) background workers | Extraction, embeddings, LLC rebuild, outbox relay, SLA escalation; Redis doubles as explosion cache. |
| **Deployment** | Docker Compose on a single cloud VM (demo); on-prem capable | One `compose up` = api, workers, postgres, redis, caddy, web. SME/DPDP-friendly; K8s only when multi-tenant SaaS scale demands. Nightly dumps + WAL archiving to object storage. |

---

## 20. Demo Data (Seed — investor-demo grade)

The MVP demos on seeded data; no live customer backend. Shared pilot universe (identical across all module plans): **Sharma Precision Components** (Faridabad — CNC auto components, Tier-2), **Kaveri Pumps & Motors** (Coimbatore — industrial pumps, MTO), **Trident Sheet Metal Works** (Pune — enclosures, ETO), **Zenith Fasteners** (Rajkot — high-tensile fasteners, MTS), **Arvind Electro Controls** (Noida — control panels). Engineering demo focuses on **Kaveri** (deep pump BOM + the flagship ECR/ECO story) and **Trident** (sheet-metal enclosure), with Sharma/Zenith items for similar-part search.

### 20.1 Companies & plants

| company_id | Company | GSTIN (demo) | Plant | City |
|---|---|---|---|---|
| 1 | Kaveri Pumps & Motors Ltd | 33AAACK2140F1Z6 | KPM-CBE-1 | Coimbatore, TN |
| 2 | Trident Sheet Metal Works Pvt Ltd | 27AABCT7712E1ZD | TSM-PUN-1 | Pune (Chakan), MH |
| 3 | Sharma Precision Components Pvt Ltd | 06AADCS3491J1ZR | SPC-FBD-1 | Faridabad, HR |
| 4 | Zenith Fasteners Pvt Ltd | 24AABCZ5618Q1ZL | ZFL-RJK-1 | Rajkot, GJ |
| 5 | Arvind Electro Controls Pvt Ltd | 09AAECA8804C1Z2 | AEC-NOI-1 | Noida, UP |

### 20.2 Workstations (Kaveri & Trident)

| Plant | Code | Workstation | Rate ₹/hr |
|---|---|---|---|
| KPM-CBE-1 | WS-VMC-01 | Ace Micromatic VMC-850 (machining centre) | 850 |
| KPM-CBE-1 | WS-LTH-01 | LMW Smarturn CNC lathe | 700 |
| KPM-CBE-1 | WS-ASM-01 | Pump assembly & test bench | 400 |
| KPM-CBE-1 | WS-BAL-01 | Dynamic balancing machine | 500 |
| TSM-PUN-1 | WS-LSR-01 | TRUMPF TruLaser 3030 fiber laser | 1,800 |
| TSM-PUN-1 | WS-PBR-01 | Amada HFE-M2 press brake | 900 |
| TSM-PUN-1 | WS-WLD-01 | MIG welding bay | 550 |
| TSM-PUN-1 | WS-PWD-01 | Powder-coat line (7-tank PT + booth + oven) | 650 |

### 20.3 Employees (demo users)

| User | Company | Role(s) |
|---|---|---|
| Venkat Subramanian | Kaveri | Managing Director (mobile approver, dashboard) |
| Priya Venkatesan | Kaveri | Design Engineer |
| Meera Iyer | Kaveri | Quality Engineer (quality gate) |
| Deepa Krishnan | Kaveri | Costing/Finance (cost gate) |
| Karthik Raman | Kaveri | Process Engineer / Eng. Manager (release authority) |
| Sandeep Jadhav | Trident | Process/Mfg Engineer |
| Kavita Deshmukh | Trident | Document Controller |
| Nilesh Patil | Trident | Engineering Manager |
| Rajesh Sharma | Sharma Precision | Engineering Manager |
| Arjun Nair | Zenith | Purchase/Prod Planner (impact gate) |
| Farhan Siddiqui | Arvind Electro | Design Engineer (panels) |

### 20.4 Item master extract (Kaveri + Trident + cross-tenant lookalikes)

| Item code | Name | Type | UOM | HSN | GST % | Rev | Std cost ₹ | Notes |
|---|---|---|---|---|---|---|---|---|
| KPM-5HP-MB | Monoblock Pump 5HP KPM-5HP-MB | manufactured | NOS | 8413 | 18 | B | 11,842 | Finished good |
| PMP-CASING-5 | Pump casing CI FG260, 5HP | manufactured | NOS | 8413 | 18 | A | 1,486 | Cast + machined |
| CAST-CI-C5 | CI casting blank, casing 5HP | purchased | NOS | 7325 | 18 | A | 640 | Foundry: Sakthi Castings, CBE |
| IMP-BRZ-5HP | Impeller, bronze LTB2, 5HP | manufactured | NOS | 8413 | 18 | A | 918 | **Subject of ECR-2026-0042** |
| IMP-SS-5HP | Impeller, SS CF8M investment cast, 5HP | manufactured | NOS | 8413 | 18 | A(draft) | 1,054 | Created by ECO-2026-0031 |
| MTR-STR-5HP | Stator-rotor set 5HP 2-pole | purchased | SET | 8503 | 18 | A | 3,150 | Vendor: CG Power |
| SHF-SS410-22 | Pump shaft SS410 Ø22 | manufactured | NOS | 8413 | 18 | A | 396 | Turned on WS-LTH-01 |
| SEAL-MECH-25 | Mechanical seal 25 mm carbon/ceramic | purchased | NOS | 8484 | 18 | A | 210 | Sealol/equiv |
| BRG-6205-ZZ | Ball bearing 6205-ZZ | purchased | NOS | 8482 | 18 | A | 95 | SKF/NBC |
| HW-KIT-5HP | Hardware kit 5HP (phantom) | phantom | SET | 7318 | 18 | A | 74 | Blow-through |
| GSK-NBR-3 | Gasket NBR 3 mm | purchased | NOS | 4016 | 18 | A | 12 | |
| PNT-EPX-BLU | Epoxy paint, KPM blue | consumable | LTR | 3208 | 18 | A | 320 | |
| TSM-ENC-660 | IP54 control enclosure 600×600×210 | manufactured | NOS | 8538 | 18 | A | 3,712 | Trident FG (ETO) |
| SHT-CRCA-16 | CRCA sheet 1.6 mm 2500×1250 | purchased | KG | 7209 | 18 | A | 62/kg | Tata Steelium |
| ENC-DOOR-66 | Enclosure door, formed | manufactured | NOS | 8538 | 18 | A | 486 | Laser + brake |
| ENC-BODY-66 | Enclosure body, welded | manufactured | NOS | 8538 | 18 | A | 1,693 | |
| HNG-CONC-SS | Concealed hinge SS304 | purchased | NOS | 8302 | 18 | A | 48 | |
| LCK-CAM-DBL | Double-bit cam lock | purchased | NOS | 8301 | 18 | A | 86 | |
| GSK-PU-FIP | PU gasket, foam-in-place | consumable | MTR | 3926 | 18 | A | 28/m | IP54 sealing |
| ZF-HTB-M10X40 | Bolt M10×40 gr 10.9 HDG (Zenith) | purchased | NOS | 7318 | 18 | A | 9.8 | Similar-part demo |
| SPC-BSH-2214 | CNC bushing 22×14 EN8 (Sharma) | manufactured | NOS | 8708 | 28 | C | 41 | Similar-part demo |

### 20.5 Multi-level BOM — Kaveri KPM-5HP-MB Rev B (MBOM v2, released, effective 01-Aug-2026)

```
KPM-5HP-MB  Monoblock Pump 5HP                 qty 1 NOS      ₹11,842
├─ 1  PMP-CASING-5   Pump casing (mfg)          1 NOS  scrap 2%   op 20
│   └─ 1.1  CAST-CI-C5  CI casting blank        1 NOS  scrap 4%   (job-work: machining in-house)
├─ 2  IMP-SS-5HP     Impeller SS CF8M (mfg)     1 NOS  scrap 3%   op 20   ← was IMP-BRZ-5HP in Rev A
├─ 3  MTR-STR-5HP    Stator-rotor set           1 SET             op 40
├─ 4  SHF-SS410-22   Pump shaft (mfg)           1 NOS  scrap 2%   op 10
├─ 5  SEAL-MECH-25   Mechanical seal            1 NOS             op 40
├─ 6  BRG-6205-ZZ    Bearing 6205-ZZ            2 NOS             op 40
├─ 7  HW-KIT-5HP     Hardware kit (PHANTOM)     1 SET             op 40
│   ├─ 7.1  ZF-HTB-M10X40  Bolt M10×40          8 NOS   (alt-group FAST-M10: alt = M10×45)
│   └─ 7.2  GSK-NBR-3      Gasket NBR           2 NOS
└─ 8  PNT-EPX-BLU    Epoxy paint                0.4 LTR scrap 10%  op 50
```

**Routing RT-KPM5-MB (released with MBOM v2):**

| Seq | Operation | Workstation | Setup min | Run min/u | Notes |
|---|---|---|---|---|---|
| 10 | Turn shaft & seats | WS-LTH-01 (LMW lathe) | 25 | 12.0 | SOP-KPM-010 |
| 20 | Machine casing bore + face, impeller trim | WS-VMC-01 (VMC-850) | 40 | 18.5 | Fixture F-C5 |
| 30 | Dynamic balance impeller assy | WS-BAL-01 | 10 | 4.0 | ISO 1940 G6.3 |
| 40 | Assemble pump + motor, fit seal | WS-ASM-01 | 15 | 22.0 | Torque chart TC-5HP |
| 50 | Hydro test 1.5× + paint | WS-ASM-01 | 10 | 14.0 | Test cert per unit |

### 20.6 Multi-level BOM — Trident TSM-ENC-660 Rev A (ETO, released)

```
TSM-ENC-660  IP54 enclosure 600×600×210        qty 1 NOS   ₹3,712
├─ 1  ENC-BODY-66   Body, welded (mfg)          1 NOS   op 30
│   └─ 1.1  SHT-CRCA-16  CRCA 1.6mm           9.6 KG  scrap 8%  op 10 (laser nest N-660B)
├─ 2  ENC-DOOR-66   Door, formed (mfg)          1 NOS   op 20
│   └─ 2.1  SHT-CRCA-16  CRCA 1.6mm           3.4 KG  scrap 8%  op 10
├─ 3  HNG-CONC-SS   Concealed hinge             2 NOS   op 40
├─ 4  LCK-CAM-DBL   Cam lock                    1 NOS   op 40
├─ 5  GSK-PU-FIP    PU gasket FIP             2.4 MTR   op 50
└─ 6  (job-work) Powder coat RAL7035  — subcontract op 35, vendor Sai Coaters, ₹210/unit, ITC-04 flagged
```
Routing: 10 Laser cut (WS-LSR-01) → 20 Bend door (WS-PBR-01) → 30 Weld body (WS-WLD-01) → 35 Powder coat (subcontract) → 40 Hardware fit → 50 Gasket + IP54 spray test.

### 20.7 The flagship change story — ECR-2026-0042 → ECO-2026-0031 (Kaveri)

**ECR-2026-0042** · "Impeller material: bronze LTB2 → SS CF8M for borewell variants" · reason: **field_failure** · priority: High · raised 02-Jun-2026 by Priya Venkatesan · affected: IMP-BRZ-5HP, KPM-5HP-MB. *Problem:* 11 warranty returns in 6 months from TN/AP borewell belt — dezincification-type pitting in high-chloride water; seal face damage secondary. *Proposal:* investment-cast CF8M impeller, same hydraulic profile; ~₹136/unit cost increase, warranty claims ↓ ~₹3.2 L/yr.

**Impact snapshot (auto-computed, stored on ECR):**

| Dimension | Result |
|---|---|
| Where-used | IMP-BRZ-5HP → KPM-5HP-MB (1/pump); also KPM-3HP-MB (rev-shared family, flagged) |
| Open WOs | 3 WOs, 46 pumps in WIP on Rev A |
| Open POs | PO-2026-0388: 120 bronze castings @₹412 with Lakshmi Foundry (60 delivered) |
| Stock | 40 finished impellers + 60 castings on hand; exposure ₹49,080 |
| Cost delta | Rollup ₹11,706 → ₹11,842 (+₹136/unit, +1.2 %) |
| AI disposition draft | "Use up 40 finished impellers on non-borewell orders; divert 60 castings to KPM-3HP; amend PO balance 60 → cancel; cut over 01-Aug-2026." |

**ECO-2026-0031** (converted 09-Jun, AI-drafted, human-edited):

| Field | Value |
|---|---|
| Lines | ① add IMP-SS-5HP Rev A (new item + BOM); ② modify KPM-5HP-MB: Rev A → **Rev B**, MBOM v1 → v2 (line 2 swap); disposition: use_up |
| Effectivity | date, **01-Aug-2026**; narrative: "Use up 40 pcs (~3 weeks), then switch to Rev B" |
| Approvals | Design (Priya, 10-Jun ✔) → Quality gate (Meera, 12-Jun ✔ "PPAP level 2 on first SS lot") ∥ Cost gate (Deepa, 12-Jun ✔ "+₹136 absorbed, price hold") → Impact gate (Arjun, 13-Jun ✔) → Final release (Karthik, 14-Jun ✔ e-signed) |
| Status | **Applied 14-Jun-2026** → Rev B released eff. 01-Aug; Rev A effective_to 31-Jul, superseded_by → Rev B; `eng.eco.applied` emitted |
| Cycle time | 12 days (dashboard KPI) |

Also seeded: **ECR-2026-0038** (Trident, customer change: 660 enclosure gland-plate cutout revision — status Under Evaluation, age 9 days, feeds the aging KPI) and **ECR-2026-0044** (Zenith, cost-down: wire rod supplier alternate — Draft).

### 20.8 Documents

| Doc no. | Title | Type | Ver | Status | Linked |
|---|---|---|---|---|---|
| DOC-DRW-0101 | GA drawing, KPM-5HP-MB | drawing | 3 | released | KPM-5HP-MB Rev B / ECO-2026-0031 |
| DOC-DRW-0102 | Impeller CF8M machining drawing | drawing | 1 | released | IMP-SS-5HP Rev A |
| DOC-DRW-0079 | Impeller bronze drawing (superseded) | drawing | 2 | obsolete | IMP-BRZ-5HP |
| DOC-SOP-0040 | Pump assembly & torque SOP | sop | 4 | released | Op 40 RT-KPM5-MB |
| DOC-TRP-0233 | Hydro test report format | test_report | 1 | released | Op 50 |
| DOC-DRW-0201 | TSM-ENC-660 flat-pattern + weldment | drawing | 1 | released | TSM-ENC-660 |
| DOC-DRW-0500 | *Scanned legacy parts list, 7.5HP pump* | drawing | 1 | draft | (AI-extraction demo source) |

### 20.9 AI output examples (seeded for demo)

**BOM extraction result (job #77 on DOC-DRW-0500, status: review):**

```json
{ "title_block": {"drawing_no":"KPM-75-GA-02","rev":"1","title":"7.5HP Monoblock — Parts List","confidence":0.96},
  "lines": [
    {"pos":1,"raw":"CASING C.I. FG260","matched_item":"PMP-CASING-7 (new item proposal)","qty":1,"uom":"NOS","confidence":0.95},
    {"pos":2,"raw":"IMPELLER BRONZE","matched_item":"IMP-BRZ-5HP (72% match — size differs)","qty":1,"uom":"NOS","confidence":0.88},
    {"pos":3,"raw":"MECH. SEAL 25MM","matched_item":"SEAL-MECH-25","qty":1,"uom":"NOS","confidence":0.97},
    {"pos":4,"raw":"BRG 6206ZZ","matched_item":null,"suggestion":"create BRG-6206-ZZ (similar: BRG-6205-ZZ 91%)","qty":2,"uom":"NOS","confidence":0.83},
    {"pos":5,"raw":"SHAFT S.S. — dia illegible","matched_item":null,"qty":1,"uom":"NOS","confidence":0.44,"flag":"low_confidence"}
  ],
  "summary": "14 of 16 lines extracted ≥0.8 confidence; 1 low-confidence line needs review; 2 new item proposals." }
```

**Similar-part search (query: new item "Hex bolt M10 × 40 grade 10.9 zinc"):**

| Hit | Similarity | Spec diff |
|---|---|---|
| ZF-HTB-M10X40 (Zenith) | 0.97 | Coating HDG vs zinc — likely reusable |
| ZF-HTB-M10X45 | 0.91 | Length 45 vs 40 |
| SPC-BSH-2214 | 0.38 | Different family — ignore |
> Suggestion: reuse ZF-HTB-M10X40 — avoid duplicate code. *(1 duplicate prevented this month — KPI tile)*

### 20.10 Alerts / worklist seed (dashboard)

- 🔴 ECR-2026-0038 under evaluation **9 days** (SLA 5) — assigned Nilesh Patil.
- 🟠 Effectivity cut-over in 14 days: KPM-5HP-MB Rev B (01-Aug) — 40 use-up units remaining, burn rate on track.
- 🟠 3 BOMs pending release > 7 days (Trident ETO backlog).
- 🟢 Extraction job #77 awaiting review (Priya).
- KPI cards: Open ECRs **4** (avg age 6.2 d) · Open ECOs **2** · Change cycle time **12 d** (▼ from 19) · BOMs pending release **3** · Cost impact this month **+₹1.63 L invested / ₹3.2 L annual warranty avoided**.

---

## Appendix A — Key research sources

- Odoo PLM ECO/version control (diff colouring, apply-on semantics, effective date): [Odoo 19 ECO docs](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/plm/manage_changes/engineering_change_orders.html), [Odoo version control docs](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/plm/manage_changes/version_control.html)
- ERPNext BOM limitations: [BOM Update Tool docs](https://docs.erpnext.com/docs/user/manual/en/manufacturing/bom-update-tool), GitHub issues [#12286](https://github.com/frappe/erpnext/issues/12286), [#25585](https://github.com/frappe/erpnext/issues/25585), [#1703](https://github.com/frappe/erpnext/issues/1703), [#30960](https://github.com/frappe/erpnext/issues/30960)
- Dynamics 365 ECM: [overview](https://learn.microsoft.com/en-us/dynamics365/supply-chain/engineering-change-management/product-engineering-overview), [product readiness policies](https://learn.microsoft.com/en-us/dynamics365/supply-chain/engineering-change-management/product-readiness), [engineering versions](https://learn.microsoft.com/en-us/dynamics365/supply-chain/engineering-change-management/engineering-versions-product-category)
- Teamcenter EBOM→MBOM reconciliation: [Siemens blog — BOM management in ETO change](https://blogs.sw.siemens.com/teamcenter-manufacturing/2025/02/19/steps-for-effective-bom-management-in-the-eto-change-process/), [Beyond PLM — EBOM to MBOM](https://beyondplm.com/2023/07/30/engineering-to-manufacturing-ebom-to-mbom-process/)
- Effectivity models: [SAP Learning — ECM object changes/validity](https://learning.sap.com/courses/implementing-engineering-change-management-in-sap-s-4hana-cloud-private-edition/performing-object-changes), [OpenBOM — structure & effectivity](https://www.openbom.com/blog/product-structure-effectivity-and-configurations), [Oracle model/unit effectivity](https://docs.oracle.com/cd/E18727_01/doc.121/e13685/T635081T635356.htm)
- Drawing extraction accuracy: [arXiv 2505.01530](https://arxiv.org/abs/2505.01530), [arXiv 2506.17374](https://arxiv.org/pdf/2506.17374), [Microsoft — BOM extraction with GPT + Document Intelligence](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/extracting-boms-from-electrical-drawings-with-ai-azure-openai-gpt-5-4--azure-doc/4506891)
- Frontend grid/tree: [TanStack Table](https://tanstack.com/table/latest), [react data grid comparisons 2025](https://pmbanugo.me/blog/top-best-react-data-grid-table-library), [react-arborist et al.](https://reactscript.com/best-tree-view/)
- Versioned records/audit: [SQLAlchemy-Continuum](https://github.com/sqlalchemy-continuum/sqlalchemy-continuum), [postgresql-audit](https://pypi.org/project/postgresql-audit/)
- Recursive CTE BOM explosion: [PuppyGraph — recursive SQL guide](https://www.puppygraph.com/blog/recursive-sql)
- pgvector hybrid search: [ParadeDB — hybrid search in PostgreSQL](https://www.paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual), [Instaclustr — pgvector hybrid search](https://www.instaclustr.com/education/vector-database/pgvector-hybrid-search-benefits-use-cases-and-quick-tutorial/)

*— End of blueprint —*
