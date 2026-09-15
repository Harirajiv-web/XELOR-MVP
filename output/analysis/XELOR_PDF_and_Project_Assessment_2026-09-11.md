# XELOR output PDFs and current project assessment

Reviewed 11 September 2026. The central finding is that the product has progressed further than several PDFs acknowledge, while production and customer-outcome evidence remains narrower than the portfolio language suggests. The next development backlog should be based on the integrated implementation, not assembled by combining every historical roadmap.

**Scope and evidence.** Reviewed all five PDFs in `output/pdf` (101 pages), including their content, status language, source references and representative rendered pages. Inspected the active `C:/ORGANISED/XELOR-MVP` checkout and the related `C:/ORGANISED/AIKYANTRA/platform` implementation discovered through `git worktree list`. Fresh checks were limited to the tests and validators below. Existing PDFs, application code, databases and running services were not changed. This assessment does not establish a customer deployment or live vendor interoperability.

**The most important correction: document date and implementation date are different.**

| Material | Source baseline | How to use it now |
|---|---|---|
| [Combined marketplace/mobile blueprint](../pdf/XELOR_COMBINED_MARKETPLACE_MOBILE_SOLUTION_BLUEPRINT.pdf), 32 pages, 30 August | `d329f09be626`, recorded on p32 | Long-term product and control requirements. Reconcile naming, architecture and completed features before estimating its backlog. |
| [Demo upgrade technical blueprint](../pdf/XELOR_DEMO_UPGRADE_TECHNICAL_IMPLEMENTATION_BLUEPRINT.pdf), 28 pages, 31 August | `99460918171f`, recorded in the footer and p28 | Useful demo boundaries, acceptance cases and implementation history. Its separate-product architecture and missing-feature table are superseded in material areas. |
| [Three-solutions overview](../pdf/XELOR_Three_Solutions_Overview.pdf), 5 pages, 8 September | PDF metadata references integrated commit `2e4490b` | Closest to the current product packaging; useful external introduction after qualifying unfinished workflows. |
| [Manufacturing supplier research](../pdf/01_Manufacturing_Supplier_Research.pdf), 12 pages, 10 September | Brochures/media and public supplier sources | Capability landscape and partner-discovery input. It is not an equivalent-product benchmark or proof of supplier results. |
| [Opportunity and roadmap](../pdf/02_AIKYANTRA_XELOR_Opportunity_and_Roadmap.pdf), 24 pages, 10 September | `xelor-phase-2`, `13e8ecf`, explicitly stated on p24 | Retain its pilot and measurement approach; refresh the implementation baseline before adopting its feature priorities. |

The active checkout is `xelor-phase-2` at `13e8ecf` (6 September). The related integrated worktree is `local/four-products` at `2e4490b` (8 September), with canonical source under `C:/ORGANISED/AIKYANTRA/platform`. The September 10 research therefore assesses an older implementation than the September 8 overview. This explains apparently contradictory claims about RFQs, quotations, connectors and mobile support.

The [September 7 consolidation ADR](C:/ORGANISED/AIKYANTRA/docs/00-governance/02-four-product-consolidation.md:7) explicitly replaces divergent product source copies with one canonical platform and four launch profiles: ONYX ERP, XELOR intelligence, SOURCE supplier network, and integrated AIKYANTRA. The three standalone solutions plus an integrated package are consistent with the overview's three-solution portfolio. Pocket is a delivery experience, rather than a fourth standalone domain product.

Do not reopen the old two-codebase/two-schema plan simply because it appears on p12 of the Demo Upgrade PDF. The current ADR preserves tenant isolation, domain ownership, approvals, audit and idempotency. It also explicitly makes no claim of an in-place upgrade from old databases; a real historical-data migration remains separate work.

**What the project actually supports.** “Implemented” below means supported by inspected source; runtime evidence is identified separately.

| Area | Current integrated implementation | Remaining boundary |
|---|---|---|
| ONYX operating records | Engineering/BOM, planning, stock movements, purchase/receipts, production operations, quality/CAPA, maintenance, sales, AR, expenses and people workflows | Breadth does not prove depth or customer acceptance in every module. Full engineering-change control and advanced warehouse execution remain distinct extensions. |
| Customer quotations | Revisioned quotations, acceptance/rejection and conversion through the Sales owner inside one tenant transaction | Full customer RFQ extraction, drawing-aware costing and CPQ are not established by quotation CRUD/conversion. |
| SOURCE purchasing | RFQs, supplier invitations, responses, technical/commercial gates, awards, multi-line tenders and linked draft purchase orders | A curated tenant supplier network is implemented. Open cross-buyer discovery, publication consent and evidence-specific supplier verification are not a completed marketplace. |
| Supplier outcomes | Posted receipt and inspection evidence contributes to supplier performance; unknown rates remain unknown | A directory entry is not independently verified capability. Sample size and quantity units still matter when comparing performance. |
| External-system intelligence | Bounded Odoo, SAP and Tally read adapters; generic/Vyapar CSV or normalized JSON imports; dated snapshots; source-linked questions and decision records | Requires configured customer endpoints and acceptance. No universal compatibility, automatic field discovery, scheduled synchronization or unrestricted external write-back. |
| Decision logic and AI | Explainable commitment/recovery rules and grounded answers; a separate governed model router with stub/Ollama support | Connected questions return `grounded_rules`. Commitment screening uses supplied capacity, duration and cost assumptions; it is not a complete BOM explosion or multi-machine optimizer. |
| Mobile | Responsive navigation, install manifest, service worker and offline reconnect screen | No offline business writes, scan/capture queue, full Pocket task workflow or native mobile binaries are established. |
| Messaging | Provider adapters, encrypted live notification payloads, concurrency controls and explicit uncertain-delivery states | Preview remains the default. Live delivery configuration, provider acceptance and operational reconciliation require validation; delivered/read webhooks are not implemented. |
| Factory intelligence | OEE arithmetic, evidence validation and controlled recovery review; simulator and ONYX projection paths | No real plant telemetry or predictive-maintenance accuracy was verified. Physical edge commands remain simulator-only. |
| Finance | GL, receivables, receipts and expense accounting | Direct-material supplier invoices, three-way matching, a complete AP lifecycle and supplier payment execution remain missing. Working Capital examples do not establish a live cash-forecast engine. |

Representative implementation evidence: [quotation conversion](C:/ORGANISED/AIKYANTRA/platform/apps/api/src/modules/sales/quotation.service.ts:450), [RFQ award](C:/ORGANISED/AIKYANTRA/platform/apps/api/src/modules/purchase/rfq.service.ts:507), [atomic tender award](C:/ORGANISED/AIKYANTRA/platform/apps/api/src/modules/marketplace/tender.service.ts:240), [supplier schema](C:/ORGANISED/AIKYANTRA/platform/packages/db/src/schema/marketplace.ts:34), [connectivity contract](C:/ORGANISED/AIKYANTRA/platform/docs/07-product/connectivity-contract.md:17), [grounded answers](C:/ORGANISED/AIKYANTRA/platform/apps/api/src/modules/connectivity/grounded-answers.ts:35), [PWA worker](C:/ORGANISED/AIKYANTRA/platform/apps/web/public/sw.js:1), and [accounts schema](C:/ORGANISED/AIKYANTRA/platform/packages/db/src/schema/accounts.ts:99).

**The strongest product case is the connected decision and transaction journey.**

The useful distinction is a requirement linked to supply evidence, an attributable approval, a domain-owned transaction and a recorded outcome. SOURCE's gates and atomic award-to-PO path, and XELOR's explicit treatment of missing/stale evidence, give this argument substance. Neither the number of screens nor the number of named agents establishes customer value.

The supplier research supports learning across commercial intake, execution, connectivity and field delivery. Its nine suppliers span different product and service categories, so their feature lists should not be scored as if they were interchangeable competitors. Selected primary-source checks agreed with the report's descriptions of modular deployment/licensing, separated infrastructure costs, SCADA integration and bounded remote access: [Tomax](https://www.tomaxdigital.com/), [Zeliot](https://www.zeliot.in/pricing), [Adventis OptiMES](https://adventis.tech/optimes/), and [Cisco SEA](https://www.cisco.com/c/en/us/products/collateral/security/industrial-security/secure-equipment-access/sec-equipment-access-ds.html). These checks do not verify advertised savings, customer success or partner agreements.

Report 02's most reusable recommendations are one plant, one measurable workflow, clear record ownership, named implementation/support responsibilities, reconciled records, exception-path tests and a conditional pilot. Its proposed first package is a hypothesis: it includes no customer interviews, willingness-to-pay validation or allocated delivery budget. Team-size and 90-day statements across the PDFs should not be treated as current commitments.

**Material corrections and unfinished work, in priority order.**

1. **Establish one current capability register.** Attach repository/worktree, commit, date, status, test evidence, limitations and owner to every sales/demo claim. Refresh Report 02 pp2–3 and 6, Demo Upgrade p6 and its D1/D2 workstreams, and the Combined Blueprint's architecture/ownership map. Reclassify existing quotations, RFQs, adapters and PWA installation as implemented with limits. Preserve advanced CPQ, AP, offline capture and live telemetry as separate unfinished work.
2. **Generalize authenticated customer onboarding.** The canonical [tenant-group mapping](C:/ORGANISED/AIKYANTRA/platform/apps/api/src/common/tenant-groups.ts:4) still hardcodes `trishul` and `kaveri`. A real customer needs governed tenant/organization provisioning and membership, followed by deployment-specific tenant and role tests. The web app also retains tokens in browser session storage; the PDF's proposed BFF/HttpOnly-session design is not implemented merely because it is drawn in the blueprint.
3. **Finish one customer integration and workflow.** Use the existing adapter/import and business services. Reconcile identities, units, stock availability, dates and revisions against a real source. Exercise expiry, stale data, partial failure, retry, rollback and unauthorized access. A local transport fixture is not customer-system interoperability.
4. **Qualify the end-to-end commercial promise.** Three Solutions p3 says “purchase to payment,” while complete direct-material AP/payment execution is absent. Narrow the present promise or complete supplier invoice, match, approval, settlement and reconciliation before using that phrase without qualification. Keep synthetic statutory identifiers distinct from actual GSP/government acknowledgements.
5. **Separate basic mobile support from Pocket completion.** Keep installability and reconnect behavior as implemented. Design the next operator/stores/quality task around a selected plant's real devices and connectivity. Offline capture requires an explicit draft queue, stable operation IDs, version/conflict handling and server confirmation; installation alone supplies none of these.
6. **Make wider SOURCE and factory expansion evidence-driven.** Supplier publication/verification, an open network, durable machine telemetry and advanced prediction each require different data, operations and acceptance evidence. They should not all become prerequisites for the first narrowly scoped pilot.

There is also a concrete UI mismatch to fix before enabling supplier delivery: the [network message screen](C:/ORGANISED/AIKYANTRA/platform/apps/web/src/modules/network/screens/messages.tsx:125) always says that nothing has been sent and no live sender is configured. That is accurate for the default preview demo but would remain on screen when real providers are configured. Derive the disclosure from provider and message state, including uncertain delivery.

**PDF quality and communication.**

The three-solutions overview is the clearest external introduction: concise portfolio separation, readable diagrams and explicit limitations on rule-based decisions and notification previews. Its broad ERP language needs the finance qualification above. It would also benefit from a visible “implementation status as of” note rather than keeping the commit only in metadata.

The two research reports are readable and explicit about evidence quality. Representative dense tables and appendix pages rendered without clipping or overlap. Their smallest footnotes are about 8 pt and will be less comfortable in print. The supplier report's 139 links and roadmap's 61 links provide useful traceability, but link quantity is not evidence of independent validation.

The 32- and 28-page blueprints contain useful constraints, acceptance cases and ownership material, but overlap considerably and need visible supersession labels. The Demo Upgrade p15 phone concepts have a specific layout defect: action buttons overlap the lower alert cards in all three mockups, confirmed visually and from PDF coordinates. Architecture labels and dense tables should receive a final layout pass when the content is revised. This assessment does not claim every page is free of visual defects.

**Fresh verification on 11 September.**

| Checkout | Check | Result and meaning |
|---|---|---|
| XELOR-MVP | Web unit tests | 63 passed; zero failed or skipped. |
| XELOR-MVP | Web TypeScript, incremental output disabled | Passed. |
| XELOR-MVP | Web lint | Passed. |
| XELOR-MVP | Module validator | Passed: 25 registered modules including conditional Blueprint; 58 unique navigation permissions. |
| XELOR-MVP | Demo upgrade manifest validator | Passed: 8 workstreams, 36 proposed paths. This validates the planning manifest, not implementation of the proposed paths. |
| XELOR-MVP | Revenue-model validator | Arithmetic passed; pricing decision remains HOLD. |
| XELOR-MVP | Technical-report facts validator | Failed with 54 findings. These combine genuine document/render-manifest drift, conditional-module ambiguity, historical-count comparisons and regex false positives. They are not 54 application defects. |
| AIKYANTRA/platform | Connectivity tests | 25 passed: evidence/decision rules, parser contracts, credential encryption, destination restrictions, local HTTP transport and grounded answers. |
| AIKYANTRA/platform | Commercial/supplier/notification tests | 13 passed: landed cost, deadlines, award blockers, supplier evidence, notification encryption and injected provider behavior. No recipients contacted. |

The original checkout's facts validator is a failing constituent of its `report-data-check`/CI chain; full CI was not executed. Examples of real drift include report constants of 19 capabilities/7 graphs against 20/8 and missing render-manifest coverage. Examples of overmatching include interpreting “Phase 1 modules” as one module and comparing a historical “+6 migrations” statement with the current total. Repair the validator and authoritative data together; changing all prose to satisfy a noisy regex would create new inaccuracies.

Command details and scope notes are saved in [frontend check evidence](evidence/frontend-check-results.md); the complete failing-validator output is in [technical-report diagnostics](evidence/technical-report-facts-output.txt).

The integrated [September 7 verification report](C:/ORGANISED/AIKYANTRA/deliverables/Verification-2026-09-07.md:3) separately reports 1,124 passing tests, RLS checks and running-API scenarios. Those are historical recorded results, not a full-suite rerun in this review. Database migrations, reset/seed commands, a full production build, live email/WhatsApp, customer ERP calls, physical-device certification and a live factory trial were not performed here.

**Recommended next delivery slice.**

First reconcile the documents and canonical code, then choose one buyer-supported pilot. Based on source readiness, the lowest-new-build candidate is an invited sourcing journey: requirement → supplier response → technical/commercial review → independent award → draft PO approval → receipt/inspection → supplier outcome. Use an existing ERP connector/import when that is the buyer's system of record. This is a readiness-based recommendation, not demonstrated market demand.

If the chosen plant's main problem is quotation effort, extend the existing quotation workflow with the missing intake/costing controls. If it is production visibility, select one line and add dependable operator or machine evidence. Measure response time, approved-order/receipt correctness, on-time accepted supply, user completion and support hours. Agree baselines and acceptance first; keep saved staff time, cash savings and working-capital release distinct, as Report 02 pp22–23 already recommends.

The result of the next phase should be one accepted, repeatable customer workflow and a current capability record. This provides a firmer basis for the next module, the next plant and the next external claim.
