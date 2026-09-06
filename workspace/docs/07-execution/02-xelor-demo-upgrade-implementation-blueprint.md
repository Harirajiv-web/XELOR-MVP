# XELOR Demo Upgrade and Technical Implementation Blueprint

Status: implementation contract  
Version: 2.0  
Snapshot: XELOR 9946091, origin/main 216238c, ONYX bd57cd2  
Date: 31 August 2026  
Owners: Product, HEXA, ONYX, AXLE, KILN, SPAR, MICA

This document is the canonical repository source for the upgraded ONYX and XELOR demo.
The shareable PDF is generated from the same decisions. The machine-readable delivery
contract is 03-demo-upgrade-codebase-manifest.json.

## 1. Decision

Build one governed industrial loop with two operational products:

- ONYX is the ERP and system of record. It owns masters, orders, RFQs, quotes, awards,
  purchase orders, stock, production, quality, maintenance, schedules, accounting and
  every final posting.
- XELOR is the intelligence and decision layer. It owns projections, evidence links,
  findings, comparisons, forecasts, recommendations, missions, approvals and outcome
  verification.
- Pocket is a role-specific mobile web experience over the same permissioned APIs. It is
  not a separate authority or database.
- Supplier Connect is an invited participant experience. It never exposes one supplier's
  commercial data to another supplier and never imports marketplace data without consent.

XELOR may ask ONYX to create a draft or review work item through an idempotent command API.
It must not write ONYX tables directly, publish a schedule by itself, or control a PLC,
robot, interlock or other safety function.

## 2. Capability Status

Every demo surface must display one of these states:

| State        | Meaning                                                              |
| ------------ | -------------------------------------------------------------------- |
| LIVE CURRENT | Implemented through a persistent UI, API and database path           |
| DEMO CURRENT | Implemented, but backed by configured fixtures or simulator evidence |
| PROPOSED     | Designed and planned, but not presented as working                   |
| GAP          | Required before pilot or production use                              |

The state is part of the user interface and the presenter script, not a footnote.

## 3. Current Repository Truth

### Implemented now

- A customer order can be entered from Fulfilment Control and can start the existing
  13-stage mission.
- Mission planning reads Sales, Engineering, Inventory and supplier-term evidence.
- Mission authorization can stop at an attributable human approval.
- Narrow document ports create Purchase and Production documents and re-read them as
  postconditions.
- Factory Intelligence reads factory-operations.v1 from ONYX over HTTP.
- XELOR validates the contract, links, timestamps and evidence freshness fail-closed.
- Deterministic code recomputes Availability, Performance, Quality and OEE.
- The factory screen shows machines, work centres, jobs, operators, constraints and work
  at risk.
- XELOR validates an explicit alternate-work-centre proposal supplied by ONYX.
- Approval can create one attributable factory_replan_request review action.

### Demo-only now

- Public-demo builds expose /blueprint/loop, /blueprint/source, /blueprint/flow and
  /blueprint/pocket as an explicitly labelled walkthrough of the proposed upgrade.
- The walkthrough reads up to one live page from existing Sales, Purchase and Quality APIs,
  reports each source as available or unavailable, and labels every invented value
  Illustrative. It is hidden unless NEXT_PUBLIC_PUBLIC_DEMO=true.
- The Factory Intelligence slice is the configured 3s-workroom-poc.
- Machine, operator, job and alternate-work-centre evidence is fixture/simulator data.
- Capacity and supplier terms in the fulfilment story include seeded or uploaded evidence.
- The web experience is responsive, but it is not an installable offline Pocket PWA.
- The Factory Intelligence browser test uses a mocked API and is not a full cross-service
  pilot proof.

### Architecture debt

- apps/api/src/fulfilment/mission.service.ts still imports the local database schema.
- apps/api/src/agent-os/agent-os.module.ts still composes ERP modules inside XELOR.
- Factory Intelligence is the only current slice that proves the intended ONYX-to-XELOR
  HTTP boundary.
- The root README mixes ONYX ports 3000/3001 with XELOR ports 3100/3101.
- origin/main contains workspace/docs/UI:UX.md, which cannot be checked out on Windows.
- The local xelor-phase-2 compatibility commit is not attached to an upstream branch.

## 4. Lessons Applied

### IndiaMART

Adopt supplier reach, searchable capability, location-aware discovery and RFQ simplicity.
Improve it with technical requirement schemas, revision control, qualification evidence,
confidential attachments and a direct connection to MRP and quality. Do not scrape or
republish IndiaMART data.

### Vyapar

Adopt fast daily workflows, readable commercial documents, mobile access, sharing and
offline-aware capture. Improve it with factory roles, plant scope, quality gates, audit,
maker-checker controls and explicit online-only commitments.

### Datastride / Sia

Adopt conversational analysis, live KPI monitoring, anomaly and forecast workflows,
evidence freshness and reusable analytics. Keep ONYX as the transaction authority. Do not
present analytics as ERP/MRP/MES, predictive accuracy, or machine control.

## 5. Demo Purpose

The demo must prove one statement:

> A customer commitment can become a governed supply and factory decision, visible from
> a phone, with source evidence and human control.

The demonstration is not intended to prove marketplace scale, live PLC ingestion,
predictive maintenance accuracy, autonomous purchasing or production readiness.

### Twelve-minute demo sequence

| Step                  | State        | Presenter action                                              | System proof                                                       |
| --------------------- | ------------ | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1. Preflight          | LIVE CURRENT | Rebuild and verify the 3S world                               | Healthy services, known reset state and simulator label            |
| 2. Take order         | LIVE CURRENT | Enter customer PO, item, quantity and due date                | Confirmed Sales order and one idempotent mission                   |
| 3. Explain demand     | LIVE CURRENT | Open BOM, stock and shortage evidence                         | Every quantity links to a source; missing data blocks              |
| 4. Source terms       | PARTIAL      | Upload or use configured supplier terms                       | Current demo compares available terms; no supplier message is sent |
| 5. Authorize          | LIVE CURRENT | Review and decide the plan                                    | Rejection creates no downstream action; approval proceeds once     |
| 6. Create documents   | LIVE CURRENT | Open draft PO and Production order                            | Documents are created through owning module ports                  |
| 7. Phone pulse        | DEMO CURRENT | Open Factory Intelligence at 390 x 844                        | Responsive OEE, jobs, operators, risk and freshness                |
| 8. Simulate breakdown | DEMO CURRENT | Inspect the faulted lathe and at-risk job                     | ONYX evidence is validated and OEE is recomputed                   |
| 9. Compare recovery   | DEMO CURRENT | Review baseline and candidate                                 | Only ONYX's qualified alternate is accepted                        |
| 10. Human decision    | DEMO CURRENT | Approve or reject recovery review                             | One review work item or zero; no schedule mutation                 |
| 11. Audit             | LIVE CURRENT | Open approval and decision evidence                           | Actor, note, source refs, hashes and action reconcile              |
| 12. Roadmap reveal    | PROPOSED     | Open /blueprint/loop and the Source, Flow and Pocket concepts | Clear separation between current and planned capability            |

## 6. Target Runtime Architecture

### ONYX operational plane

ONYX owns:

- master data and participant identity
- customer order and demand
- purchase requisition, RFQ, invitation, quote revision and award
- purchase order, GRN and stock ledger
- production order, operation, assignment and schedule
- inspection, non-conformance, maintenance and downtime
- accounts payable, general ledger and payment controls
- final W1 approvals and authoritative document state

### XELOR intelligence plane

XELOR owns:

- versioned projection cache and watermarks
- evidence graph and source references
- deterministic OEE and scheduling analysis
- sourcing comparison and recommendation
- finding, acknowledgement and false-positive disposition
- model version, evaluation and drift evidence
- missions, approval context and outcome verification

### Boundary

ONYX publishes versioned read projections and accepts narrow idempotent command requests.
XELOR stores ONYX identifiers and evidence snapshots, not duplicate ERP masters. All
commands include an Idempotency-Key, expected version, correlation ID, reason and evidence
digest. ONYX re-authorizes every request under its own permissions and workflow.

## 7. Required Contracts and APIs

Create a generated shared contract package:

- packages/contracts/src/common/envelope.ts
- packages/contracts/src/onyx/factory-operations.v2.ts
- packages/contracts/src/onyx/fulfilment-context.v1.ts
- packages/contracts/src/onyx/sourcing.v1.ts
- packages/contracts/src/onyx/commands.v1.ts
- packages/contracts/src/events/
- packages/contracts/openapi/onyx-v1.yaml
- packages/contracts/asyncapi/domain-events.yaml

### ONYX read projections

- GET /api/v1/projections/factory/sites/:siteCode/operations
- GET /api/v1/projections/fulfilment/orders/:orderId
- GET /api/v1/sourcing/requirements/:id
- GET /api/v1/sourcing/rfqs/:id/quotes

Every projection supplies schemaVersion, sourceSystem, generatedAt, observedAt, watermark,
ETag, evidenceRefs and freshness.

### ONYX command requests

- POST /api/v1/sourcing/requirements
- POST /api/v1/sourcing/rfqs
- POST /api/v1/sourcing/rfqs/:id/publish
- POST /api/v1/sourcing/awards/:id/recommend
- POST /api/v1/sourcing/awards/:id/decide
- POST /api/v1/planning/replan-reviews
- POST /api/v1/maintenance/inspection-requests
- POST /api/v1/purchase/grns/drafts
- POST /api/v1/purchase/grns/:id/post

Draft capture and final posting remain separate endpoints. Final posting is online-only.

## 8. Domain Events

Reuse ONYX's transactional outbox. Required event contracts include:

- planning.requisition.raised.v1
- sourcing.rfq.published.v1
- sourcing.quote.submitted.v1
- sourcing.award.approved.v1
- purchase.po.approved.v1
- purchase.grn.posted.v1
- production.operation.started.v1
- production.operation.blocked.v1
- production.operation.completed.v1
- factory.asset-state.changed.v1
- factory.shift-kpi.closed.v1
- quality.inspection.completed.v1
- maintenance.downtime.started.v1
- maintenance.downtime.ended.v1
- planning.schedule.published.v1

Consumers deduplicate by event ID and preserve correlation and causation IDs. Stock and
ledger correctness remains synchronous inside ONYX transactions.

## 9. Data Model Changes

### ONYX sourcing

Add schema ownership for:

- sourcing_requirement
- supplier_candidate_snapshot
- rfq
- rfq_invitation
- supplier_quote and immutable revisions
- supplier_quote_line
- sourcing_award
- vendor_item_capability
- supplier_performance_snapshot

The selected supplier links to the existing vendor record. Buyer private, supplier private,
published network and participant-transaction data remain separate.

### ONYX factory operations

Replace configured JSON evidence with explicit:

- factory_shift_instance
- asset_work_assignment
- asset_work_center_qualification
- asset_counter_aggregate
- factory_projection_checkpoint

Retain low-rate accepted state events in ONYX. Keep high-frequency raw telemetry at the
edge or historian and publish only governed aggregates.

### XELOR intelligence

Add:

- intelligence_projection_cache
- intelligence_finding
- intelligence_recommendation
- intelligence_model_version
- intelligence_evaluation

Reuse current decision evidence and outcome tables instead of duplicating them.

Migration numbers are allocated only when the owning branch merges. Parallel branches must
not independently claim the same migration number.

## 10. Mobile Pocket

### Phase 1

Build a read-first installable PWA:

- Owner Pulse
- Plant Today
- Buyer Worklist
- Receiving Queue
- Approval Inbox
- Factory Intelligence

Each screen displays tenant, plant, role, online state, last synchronization time, evidence
freshness and fixture/simulator status.

### Phase 2

Allow offline drafts only:

- production quantity and rejection capture
- maintenance observation
- inspection capture
- GRN draft
- media evidence

Every queued draft carries a stable idempotency key and source entity version. The server
rechecks permission, tenant, plant, document version and workflow state on reconnect.

Never queue offline approvals, stock postings, quality releases, payments, schedule
publication or machine commands. The service worker must not cache tokens or unrestricted
API responses, and logout must purge user-scoped local data.

## 11. Permissions and Segregation of Duties

Add permissions:

- sourcing.requirement.create, read and submit
- sourcing.rfq.create, read and publish
- sourcing.quote.read and respond
- sourcing.award.recommend and approve
- purchase.invoice.create, read, match and approve
- factory.operations.read
- factory.assignment.write
- intelligence.factory.read
- intelligence.sourcing.run
- intelligence.finding.acknowledge

Use the variadic RequirePermission form for routes requiring all permissions. The requester
cannot approve its own sourcing award. Supplier access is scoped by tenant plus supplier
account, following the CSP tenant-plus-customer pattern. Mobile grants no additional
authority.

## 12. Feature Flags and Demo Fixtures

Required flags:

- SUPPLIER_DIRECTORY_MODE=fixture|live
- FACTORY_EVIDENCE_MODE=simulator|edge|mixed
- FACTORY_OPERATIONS_CONTRACT=v1|v2
- XELOR_POCKET_ENABLED=false|true
- XELOR_POCKET_OFFLINE_DRAFTS=false|true
- SOURCING_RFQ_ENABLED=false|true
- AI_PROVIDER=stub|ollama|hosted

Production startup refuses fixture, simulator and public-demo modes. Demo data moves from
runtime services into apps/api/scripts/demo/ fixtures and names its evidenceMode in every
response.

## 13. Codebase Change Map

### Shared contracts

Create packages/contracts and generate producer and consumer validation from one schema.
Contract changes merge before ONYX producer and XELOR consumer changes.

### ONYX

- Add apps/api/src/modules/sourcing/
- Add apps/web/src/modules/sourcing/
- Add packages/db/src/schema/sourcing.ts
- Extend integration factory projections to factory-operations.v2
- Add explicit factory assignment and qualification tables
- Add accounts payable and three-way-match only after the demo sourcing loop is stable

### XELOR

- Add apps/api/src/integrations/onyx/
- Replace direct fulfilment database reads with typed ONYX clients
- Remove ERP module imports from the production Agent OS composition
- Generalize FactoryIntelligenceService by tenant, site and window
- Move 3S constants to demo fixtures
- Add apps/api/src/intelligence/factory/ and sourcing/
- Add packages/db/src/schema/intelligence.ts
- Add apps/web/src/modules/pocket/
- Add service worker, local draft outbox, sync policy and push handling

### Demo walkthrough implemented now

- apps/web/src/modules/blueprint/ is an explicitly non-transactional presentation surface.
- apps/web/src/modules/registry.ts includes it only when NEXT_PUBLIC_PUBLIC_DEMO=true.
- Its live figures use existing APIs and display source failure rather than converting it
  into a false zero.
- Its proposed Source, Flow and Pocket content is always labelled Designed, not built and
  Illustrative.

### Current implementation anchors

- apps/api/src/agent-os/factory-intelligence.controller.ts
- apps/api/src/agent-os/factory-intelligence.service.ts
- apps/api/src/agent-os/onyx-factory-intelligence.http-adapter.ts
- apps/api/src/ports/onyx-factory-intelligence.port.ts
- packages/platform/src/factory-intelligence/contracts.ts
- packages/platform/src/factory-intelligence/oee.ts
- packages/platform/src/factory-intelligence/replan.ts
- apps/web/src/modules/agentos/screens/factory-intelligence.tsx
- apps/web/src/modules/fulfilment/new-order-form.tsx
- apps/api/src/fulfilment/mission.service.ts

## 14. Verification Gates

### Contracts

- provider contract and consumer fixture tests
- unsupported version fails closed
- stale, future and malformed evidence is explicit
- idempotent command replay creates one effect

### RFQ

- only active qualified suppliers are invited
- invitation and quote data is isolated by tenant and supplier account
- quote revisions are immutable
- MOQ, validity, lead time, tax and capacity are normalized
- award recommendation and approval are separate authorities
- one approved award produces one draft PO

### Mobile

- 390 x 844, 768 x 1024 and 1440 x 900 have no horizontal overflow
- operator roles cannot see cost or margin
- every KPI shows freshness and source mode
- offline reconnect produces one event
- conflict and revoked-session paths fail visibly
- online-only actions are absent offline

### OEE

- missing, zero, invalid and contradictory inputs never become plausible KPIs
- raw values, formulas, record references and timestamps remain visible
- confidence means data quality, not failure probability

### Replanning

- no ONYX proposal means blocked
- unqualified or stale alternate means blocked
- baseline and candidate results are deterministic
- approval is mandatory
- no schedule mutation or physical command occurs

### Security and audit

- RLS leak probes cover buyer, invited supplier, uninvited supplier and support roles
- approval rejection dispatches zero actions
- approval success dispatches exactly one action
- actor, note, evidence digest and action ID reconcile
- no token, secret or unnecessary PII enters evidence or logs

### Cross-service demo

Add one real-stack test proving:

ONYX projection -> XELOR validation -> human approval -> ONYX review work item -> audit
verification.

## 15. Delivery Sequence

### D0 - Demo integrity, one sprint

- keep the Unified Blueprint walkthrough behind NEXT_PUBLIC_PUBLIC_DEMO=true
- verify /blueprint/loop, /blueprint/source, /blueprint/flow and /blueprint/pocket at desktop
  and phone widths
- correct repository ports, naming and Windows path
- attach xelor-phase-2 to a protected upstream
- add generated contracts and compatibility tests
- generalize the factory v2 simulator contract
- add real-stack Factory Intelligence E2E
- capture desktop and 390 x 844 screenshots

### D1 - Sourcing loop, two to three sprints

- 8 to 12 consented fixture suppliers
- requirement, RFQ, invitation, quote revision, comparison and award
- supplier portal with scoped access
- independent award approval
- one award-to-draft-PO conversion

### D2 - Mobile visibility, one to two sprints

- read-only Pocket PWA
- owner, supervisor, buyer and receiving roles
- freshness, deep links and push notifications
- offline draft outbox only after online workflows pass

### D3 - Pilot telemetry, two to four sprints per factory

- one edge adapter
- two to three machines
- shadow-mode OEE
- reconciliation and data-quality SLA
- false-positive disposition and operator feedback

### D4 - Controlled recovery

- approval-linked planning work item first
- schedule publication only after measured accuracy, rollback and authority testing
- physical machine control remains out of scope

## 16. Branch and Delivery Rules

Protect main and onyx-phase-1. Use paired feature branches:

- feat/contract-*
- feat/onyx-sourcing
- feat/xelor-sourcing-intelligence
- feat/xelor-pocket
- feat/onyx-factory-v2
- feat/xelor-factory-v2

Merge shared contract, ONYX producer and XELOR consumer in that order behind flags. Every
cross-product pull request requires provider tests, consumer fixtures, RLS leak tests,
permission checks, idempotency replay, evidence/audit verification and mobile viewport
proof.

Long term, place both deployables on one protected monorepo branch with separate apps,
deployments and databases. Product-as-branch makes contract drift and combined CI failures
too easy.

## 17. Mandatory Demo Disclosures

- Factory data is configured simulator evidence, not live PLC or MES data.
- OEE is deterministic arithmetic. Confidence describes source quality.
- Supplier terms are seeded or uploaded; no actual RFQ outreach occurs today.
- Phone support is responsive web, not an offline PWA or native application.
- Recovery approval creates a planning review only.
- Clean ONYX-to-XELOR HTTP separation currently exists only for Factory Intelligence.
- The browser Factory Intelligence test mocks its API.
- No predictive-maintenance accuracy, autonomous purchasing, schedule publication or
  machine control is claimed.

## 18. Definition of Demo-Ready

The upgrade is demo-ready only when:

1. The source tree has no ambiguous ONYX/XELOR ownership for the demonstrated paths.
2. Demo reset and verification run from a clean database.
3. Every fixture and simulator value is visibly labelled.
4. Order creation is persistent and idempotent.
5. All derived numbers expose source records and freshness.
6. Approval rejection creates zero downstream actions.
7. Approval success creates one bounded draft or review.
8. Desktop and phone viewports pass without overlap.
9. The cross-service Factory Intelligence test uses real ONYX and XELOR processes.
10. The presenter can state every limitation without contradicting the interface.

## 19. Definition of Pilot-Ready

Pilot-ready additionally requires:

- service-to-service identity rather than public-demo credentials
- one real edge connector and measured data-quality SLA
- invited supplier onboarding and real RFQ responses
- BFF or HttpOnly cookie authentication for customer-facing mobile use
- observability for projection lag, contract failures, event deduplication and sync conflicts
- backup, restore, retention, DPDP and security review
- measured OEE reconciliation and alert false-positive rate
- rollback for every proposed schedule or commercial action
