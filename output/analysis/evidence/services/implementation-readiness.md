# Standalone service implementation readiness

Source audit: 11 September 2026. Scope: current `platform/` implementation; no runtime tests, database writes, or application changes. Paths and line numbers below are repository-relative. “Implemented” means concrete source exists, not a fresh end-to-end verification. Absence statements are bounded to the inspected modules and call sites. This note does not establish customer demand or independently deployable product readiness.

## Main conclusion

Maintenance is the strongest first **ERP add-on pilot**, followed by a narrowly scoped Quality/CAPA package and After-sales Service. Backend breadth is substantially ahead of the customer-facing task journeys. Several screens are read-only; quality document/audit/training pages are static illustrations. Merely promoting them in navigation would overstate readiness.

Keep applications in the boundary-enforced modular monolith. A standalone commercial subscription can run with shared identity, configuration and minimal masters; it does not require splitting services or databases. External-ERP operation is a subsequent adapter/onboarding acceptance gate. Retain XELOR as the system of record, ONYX as optional intelligence and AIKYANTRA as the external supplier network.

## 1. XELOR Maintenance & Reliability — first pilot candidate

**Implemented:** Assets/meters/history (`platform/apps/api/src/modules/maintenance/asset.service.ts:84`, `:275`, `:301`, `:402`); request/MWO domain; assignment/start/hold/handback/completion/closure (`.../maintenance/mwo.service.ts:128`, `:204`, `:257`, `:320`, `:367`, `:389`, `:511`); task results and labour/cost accumulation (`:667`, `:708`, `:773`); PM generation/forecast/missed occurrences (`.../maintenance/pm.service.ts:85`, `:371`, `:507`); reliability and cost reports (`.../maintenance/kpi.service.ts:64`, `:105`, `:167`). Spare issues and returns call Inventory's stock port (`.../maintenance/spares.service.ts:83`, `:176`).

**Packaging blockers:** Current work-order board is a read-only filtered table, with no create/start/close form (`platform/apps/web/src/modules/maintenance/screens/work-orders.tsx:38`). PM screen lists occurrences, with no schedule creation journey (`.../maintenance/screens/pm.tsx:28`). Inspected PM controller exposes generation/forecast/change interval, not first-time schedule creation (`platform/apps/api/src/modules/maintenance/maintenance.controller.ts:483`). Default spares are recorded as planned, not inventory reservations (`.../maintenance/spares.service.ts:258`). Autonomous PM worker scheduling and recovery were not established in this audit; generation endpoints alone are insufficient.

**Owned data:** Asset hierarchy, meters, requests, maintenance work orders, checklist results, PM schedules/occurrences, downtime, cost evidence. **ERP dependencies:** Item master, stock posting, workflow approvals, employee/rate references and optional work-centre mapping. The explicit boundary is documented in `.../maintenance/maintenance.module.ts:11`.

**Minimum sellable slice:** Import/create assets; configure calendar/meter PM; technician daily queue; raise/triage/assign/perform/close work; evidence attachments and costs; explainable reliability reports. Standalone mode needs local minimal asset/parts/person masters and stock adapter or explicitly scoped no-stock consumption records. Later ONYX may explain recurring failures; predictive maintenance is not prerequisite.

**Acceptance:** A new tenant sets up a schedule without database edits; due service generates exactly once through worker restart; technician completes checklist and records labour; spare replay does not double-issue stock; failed stock transaction leaves no false issued state; closure rules hold; figures reproduce from recorded history; tenant/role isolation passes.

## 2. XELOR Quality — narrow CAPA first, advanced QMS later

**Implemented:** Independent inspection opening, readings, completion and manufacturing gates (`platform/apps/api/src/modules/quality/quality.service.ts:278`, `:342`, `:376`, `:448`, `:559`); persisted findings, containment, root cause, corrective action and effectiveness verification (`.../quality/qms-workflow.controller.ts:24`; `.../quality/qms-workflow.service.ts:47`, `:67`, `:75`, `:111`, `:131`, `:140`).

**Presentation-only / missing:** Documents, audits, training and evidence-pack screens render static `QmsWorkspace` props (`platform/apps/web/src/modules/quality/workspace.tsx:29`; individual screen wrappers at line 5). The configuration contains fixed figures, people, dates and sample claims. Those pages do not prove controlled release, acknowledgment, calibration records, audited evidence exports or actual audit scheduling. Finding and corrective-action pages currently read lists (`.../quality/screens/findings.tsx:15`, `.../quality/screens/corrective-actions.tsx:15`); corresponding task forms are needed.

**Owned data:** Inspection plans/results, findings, actions and effectiveness evidence. **ERP dependencies:** Item and supplier/customer/source references; stock movements for physical dispositions. Document-controlled processes should own documents/revisions/audit plans/competence evidence when implemented; reference HR roles rather than duplicate payroll.

**Minimum sellable slice:** Finding → containment → confirmed root cause → assigned action → completion evidence → independent effectiveness review, with due queues and traceability. Extend to controlled documents and audits after real storage/review/export workflows exist. Standalone CAPA can accept manual/external reference IDs without requiring stock ownership.

**Acceptance:** Non-demo finding can finish the full workflow through UI; closure cannot bypass required evidence; revisions/attachments and approvals are attributable; ineffective action reopens or creates follow-up; cross-tenant/customer links fail closed; exported evidence matches a frozen approved record. Never market the tool as certifying regulatory compliance.

## 3. XELOR Service — promising domain, substantial journey completion

**Implemented:** Ticket creation/replay handling/comments/status/assignment (`platform/apps/api/src/modules/csp/ticket.service.ts:128`, `:289`, `:370`, `:469`); scoped customer API (`.../csp/portal.controller.ts:76`, `:95`, `:121`); entitlement lookup and contract renewal scan (`.../csp/entitlement.service.ts:116`, `:195`); SLA calculation, pause/resume and explicit scan (`.../csp/sla.service.ts:134`, `:185`, `:410`); complaints/KB/CSAT services. Portal invitation and acceptance logic exists (`.../csp/portal.service.ts:43`, `:98`).

**Blockers:** Ticket UI explicitly says read-only and has no reply box (`platform/apps/web/src/modules/csp/screens/ticket.tsx:22`). No customer portal frontend found under `platform/apps` in this audit. Invitation issuance has a controller (`platform/apps/api/src/modules/csp/csp.controller.ts:330`); no production caller of `PortalService.acceptInvite` found. A runtime worker invoking SLA scan was not found; controller exposes manual scan (`:359`). Warranty/contract onboarding and invitation-to-authentication flow need verification/completion. Spare pricing is a placeholder standard cost ×1.4 (`.../csp/spare.service.ts:97`); `reserve` records an externally supplied reservation reference and performs no stock movement (`:146`). No complete fulfil/invoice loop is established. Complaint `applyQmsUpdate` is externally supplied synchronization, not proof that a QMS action actually happened (`.../csp/complaint.service.ts:124`). CSAT issuance API does not prove automatic customer delivery on ticket closure.

**Owned data:** Tickets/conversations, installed-base coverage, service contracts, customer portal membership, SLA clocks/events, KB and CSAT. **ERP dependencies:** Customer IDs, serial/dispatch records, parts catalogue, approved price lists, stock reservation/dispatch and billing. Some data can be imported in standalone mode; writes back must use idempotent owner APIs.

**Minimum sellable slice:** Invite/activate customer; onboard installed base/coverage; submit ticket; agent assigns/replies/resolves; customer sees public-only updates and closes/reopens; worker enforces SLA; one-use CSAT delivered. Offer service desk first; field dispatch, service billing and spare fulfilment require their own acceptance gates.

**Acceptance:** Fresh external user completes invitation/login; customer A cannot enumerate B's assets/tickets/notes; replies are delivered and observable; SLA fires once across restart; internal notes remain private; contract boundaries correctly determine cover; spare request reaches genuine stock fulfilment and invoice, if included in the advertised package.

## 4. XELOR Advanced Quoting & Costing — future development package

**Implemented:** Standard quoted line rates/taxes, immutable revisions, expiry, send/accept and sales-order conversion (`platform/apps/api/src/modules/sales/quotation.service.ts:25`, `:133`, `:232`, `:332`, `:348`, `:434`). Conversion calls SalesService; this is more than a sample quote list.

**Missing advanced layer:** The input takes a caller-supplied rate. This service does not establish configurable product rules, option compatibility, materials/labour/machine/tooling costing, target-margin approval or extraction from engineering drawings. Standard quotations must stay in XELOR core.

**Owned data:** Option/rule versions, estimating assumptions, cost sheets, approval evidence and quote versions. **ERP dependencies:** Customers, item/BOM/routing, standard/actual costs, taxes and order conversion. Standalone product needs importable masters and external quote-to-order adapter.

**Minimum/acceptance:** Start structured cost sheets for one manufacturing segment. Deterministic configuration/cost calculation; invalid combinations blocked; cost/rule revisions retained; low-margin approval enforced; accepted revision converts once with matching totals; ONYX extraction is a reviewed draft with source attribution, never silent pricing authority.

## 5. XELOR Warehouse Execution — extension of stock ledger, not current WMS

**Implemented:** Idempotent posting, batch-aware allocation and locked item/warehouse withdrawal (`platform/apps/api/src/modules/inventory/inventory.service.ts:102`, `:115`, `:260`, `:303`); warehouse and on-hand views (`:425`, `:437`); goods receipts update stock atomically (`.../purchase/purchase.service.ts:1140`, `:1221`).

**Missing advanced layer:** Inspected inventory domain does not establish scan-driven receiving, location-directed put-away, pick waves, packing, cycle counts, offline replay or expiry-aware FEFO. Warehouse records are not evidence of those workflows.

**Owned data:** Execution tasks, scan evidence, bin hierarchy, handling units and inventory ownership rules. **ERP dependencies:** Items/UOM, receipts, orders, batches and the authoritative stock ledger. Avoid duplicate stock balances. If external ERP owns stock, define reconciliation and authoritative posting before standalone sale.

**Minimum/acceptance:** Receive → scan label/location → put-away → pick/pack against order. Replay/offline synchronization cannot duplicate movements; wrong SKU/lot/location is rejected; partial receipts/picks reconcile; stock remains explainable. Keep basic inventory in core.

## 6. Planning and Connected Factory — ERP-dependent / pilot-only

**Planning:** MRP-backed scheduling is a persisted finite-scheduling heuristic with rule comparisons and human publish approval (`platform/apps/api/src/modules/planning/schedule.service.ts:22`, `:50`, `:112`). It is explicitly not a general constraint optimizer. Standalone planning requires imported demand/BOM/routings/capacity/calendars and stable output/writeback contracts. Minimum: compare two scenarios without changing published plan; expose missing routings; explicit approval; detect stale inputs; measure feasible delivery outcomes against baseline.

**Factory:** Factory Connect explicitly supports simulator policy evaluation, and fails closed for physical dispatch until authenticated claim/ack transport exists (`platform/apps/api/src/modules/integration/factory-connect.service.ts:136`, `:984`, `:1071`; UI disclaimer `platform/apps/web/src/modules/integration/screens/factory-connect.tsx:142`). Do not sell controller execution, IoT deployment or digital twins as shipped. First paid pilot should be read-only telemetry with real gateway authentication, timestamps, stale/offline handling and count reconciliation. Keep safety/control authority local; physical commands are a separate engineering project.

## Core foundations and commercial boundary

Direct-material invoice matching is a core ERP gap to evaluate independently of add-on branding: Purchase has PO/GRN/stock integration; Accounts inspection found sales AR/journals (`platform/apps/api/src/modules/accounts/accounts.service.ts:312`); expenditure invoices explicitly cover indirect spend that never touches a warehouse (`.../expenditure/indirect.service.ts:61`). The latter is not evidence of PO–GRN–vendor-invoice three-way matching. Do not split essential purchasing completeness into a premium add-on by accident.

For every offering, a release gate must cover fresh-tenant setup, role/tenant isolation, actual read/write journey, persistence after reload/restart, licensing on API and UI, realistic sample-free data, import/export, recoverable integration failures, and measurable customer outcome. The inspected source is an investment starting point; it is not a substitute for those verifications.
