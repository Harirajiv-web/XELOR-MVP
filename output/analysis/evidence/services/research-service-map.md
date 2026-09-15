# Research evidence for XELOR services and optional applications

Research review: 11 September 2026. This note maps all nine supplier groups to an ERP-first product strategy. It is a research interpretation, not a current code inventory or a release-readiness assessment.

Current naming is authoritative: **XELOR is the ERP and system of record; ONYX provides intelligence; AIKYANTRA provides the supplier network.** The old naming and source baseline in Report 02 are historical and must not determine current implementation decisions.

## Evidence and coverage

- **R1:** [Manufacturing Supplier Research](../../../pdf/01_Manufacturing_Supplier_Research.pdf), all 12 pages reviewed. Supplier profiles occupy pages 2-10; pages 11-12 record media/link coverage and limitations.
- **R2:** [AIKYANTRA-XELOR Opportunity and Roadmap](../../../pdf/02_AIKYANTRA_XELOR_Opportunity_and_Roadmap.pdf), all 24 pages reviewed. Source inventory was based on commit `13e8ecf`, not today's consolidated application. Use its workflow proposals and delivery lessons; independently inspect current source before calling a feature missing.
- Selected primary product pages were opened again on 11 September 2026; links appear beside the relevant claims below. No vendors were contacted, forms submitted, demo accounts used or customer results independently tested.

Page references below mean the physical PDF page, matching the displayed page number. Vendor claims, the report authors' recommendations, and our proposed packaging remain distinct.

## What each supplier contributes

| Supplier and PDF evidence | Advertised or reported pattern | Proposed response for our products |
|---|---|---|
| **CommerceCX / ScaleFluidly**, R1 p. 2; R2 pp. 7, 11-12 | Commercial add-ons join configurations, pricing, quote versions, approvals and orders. Separate logistics and pharmaceutical offerings solve different problems. | Develop **XELOR Quoting & Costing** around checked cost sheets and margin decisions. Consider **Dispatch & Loading** when actual shipment volume warrants it. Reuse project stage gates; partner for clinical or therapy workflows. |
| **AnjX**, R1 p. 3; R2 p. 9 | Forecasting, stock decisions, production planning and scenarios; brochure describes modular cloud packaging and continuing support. | Offer **Advanced Planning** as an ERP extension first. ONYX explains alternatives and uncertainty. Evaluate specialist algorithms on customer history against a simple baseline; cloud packaging is not evidence of prediction quality. |
| **Slooze**, R1 p. 4; R2 p. 8 | Procurement covers suppliers, contracts, budgets, alternatives, commitments, risk and role-specific decision views. Rule Canvas suggests configuration as a visible capability. | Strengthen **AIKYANTRA Sourcing & Supplier Collaboration**; connect to XELOR purchasing and commitments. Build rules/configuration once across the platform. Integrate qualified providers if payments or financing later enter scope. |
| **Tomax / D3Minds**, R1 p. 5; R2 pp. 10-13 | Separate MES, warehouse, quality, assets and engineering/project capabilities connected through common records. Quality extends into documents, calibration, training, audits and customer complaints. | Strong reference for **Maintenance**, **Quality**, **Warehouse Execution**, **Projects & Engineering Change**, and **Connected Factory** workspaces. Avoid turning every feature within those applications into another separately branded product. |
| **Zeliot / Condense**, R1 p. 6; R2 p. 15 | Managed streaming, connectors, transformations, operational applications and governance; deployment in the customer's cloud. | Productize **Integration & Data Operations** around supported connections, reconciliation and recovery. Own business workflows and source contracts; evaluate a streaming partner only when system count, throughput and economics justify it. |
| **Adventis / OptiMES**, R1 p. 7; R2 pp. 10, 13-14 | Distinct production, safety, maintenance and inventory modules in the brochure; gateways and a separately presented CMMS on the website. | Use clearly named optional applications and shared assets. **Maintenance** is a strong candidate; **Safety & Permits** is a later industry extension. Partner for gateways and validated sensing/vision. |
| **Controlsoft**, R1 p. 8; R2 p. 17 | Survey, instrumentation, automation engineering, installation, commissioning and ongoing maintenance are services in their own right. | Offer **Factory Setup & Commissioning** with qualified field partners. XELOR delivery owns the customer handoff, acceptance evidence and escalation. This is a professional service, not a new ERP software module. |
| **RheinBrücke / Epicor**, R1 p. 9; R2 pp. 17-19 | ERP plus distinct extensions, migration, implementation, training and managed support. Breadth includes projects, multi-site operations, energy, CPQ and worker guidance. | Keep XELOR core complete, make advanced options clear, and sell **Implementation & Adoption** explicitly. Use industry packages for manufacturing differences. Larger specialist ERP integrations can involve qualified delivery partners. |
| **Connectivity / CoSol + Cisco**, R1 p. 10; R2 p. 14 | Networks, inventories, segmentation, controlled remote access and managed operations; subscription/rental infrastructure models. | Offer partner-delivered **Managed Infrastructure & OT Support** when a customer needs it. Keep plant-network work distinct from essential application permissions, audit and backups. |

These are partner categories and evaluation candidates, not endorsements, established commercial relationships or commitments to use those suppliers.

## Current primary-source packaging checks

- **Tomax QMS explicitly advertises purchase as a standalone application or within its platform.** This directly supports the proposed packaging model. Its quality catalogue also connects supplier, factory and customer quality. [Tomax QMS](https://www.tomaxdigital.com/products/enterprise-quality-management-system).
- **Tomax's main site advertises modular purchase, subscription or perpetual licensing, and cloud, on-premise or hybrid deployment.** These are published options, not proof that every configuration has the same features or economics. [Tomax platform](https://www.tomaxdigital.com/).
- **CommerceCX presents ScaleFluidly as a unified or modular offering and PriceCX as an add-on to existing commercial systems.** Its catalogue lists versioning, approvals, templates, administration and integration. The Salesforce architecture described for PriceCX should not be generalized to every product. [CommerceCX products](https://commercecx.com/products.html).
- **Adventis has a dedicated CMMS product page** covering assigned/completed maintenance work, monitoring, dashboards, telemetry, alerts and report export. This supports a separate maintenance proposition; it does not establish independent licensing or a production service-level commitment. [Adventis CMMS](https://adventis.tech/cmms/).
- **Condense advertises managed deployment in the customer's cloud.** Its calculator separates infrastructure costs from a platform licence and varies with workload. This is useful for explaining full operating cost; it does not provide a comparable small-factory quotation. [Zeliot platform](https://www.zeliot.in/), [pricing model](https://www.zeliot.in/pricing).
- **CoSol advertises service desk, managed network/security operations, field services, subscriptions and infrastructure rental.** This supports an ongoing service proposition in addition to software. No customer-specific coverage or SLA was verified. [CoSol services](https://cosol.in/services).

## Candidate catalogue and the defensible boundary

“Standalone potential” below means a distinct buyer, workflow and outcome are identifiable. It does not mean the present application can already be deployed or sold independently. An optional XELOR entitlement and a product that operates with another ERP are separate delivery stages.

| Candidate | Standalone potential and first promise | What must remain connected to XELOR | Build, integrate or partner |
|---|---|---|---|
| **XELOR Maintenance & Reliability** | High conceptual fit: a maintenance team can manage assets, scheduled work, failures, parts and closure. Evidence: R1 pp. 5, 7; R2 p. 13. | Parts stock, purchasing, costs, production downtime and shared asset identity. Basic breakdown recording should still work in the ERP. | Build the application from current foundations; partner for sensing and equipment diagnosis. |
| **XELOR Quality & Audit** | High: inspections/CAPA plus controlled documents, audits, calibration, skills and customer/supplier loops. R1 p. 5; R2 p. 11. | Required manufacturing inspections, receipt holds and stock disposition remain part of the core workflow; advanced governance can be optional. | Build connected workflows; use specialists for regulated validation and advanced domain templates. |
| **XELOR After-sales & Service** | High conceptual fit for equipment makers: complaint/return ownership, installed assets, warranty, spares and service history. R1 p. 5; explicit extension in R2 p. 12. | Delivered serial/lot, customer, parts, invoicing and quality feedback. | Build a focused service application; investigate scheduling/mobile needs with users. Standalone recommendation is our synthesis, not a separately verified vendor SKU. |
| **XELOR Quoting & Costing** | High: a commercial/engineering team can prepare configurations, cost assumptions, revisions, approvals and customer-ready quotes. R1 p. 2; R2 p. 7. | Ordinary quotations/orders remain core. The premium boundary is sophisticated configuration, costing and pricing, with accepted orders handed back once. | Build costing and governed workflows; integrate OCR/document tools. Validate drawing interpretation separately. |
| **XELOR Projects & Engineering Change** | Medium-high: engineering teams manage milestones, dependencies, design changes, releases and cost. R1 pp. 2, 5, 9; R2 pp. 11, 19. | Shared items/BOMs, order commitments, work in progress and approved revisions. | Build reusable project/change models; use industry templates. Full PLM or regulated clinical products require separate scope. |
| **AIKYANTRA Sourcing & Supplier Collaboration** | High: supplier discovery/qualification, RFQs, comparable bids, promises and performance. R1 p. 4; R2 p. 8. | XELOR owns internal purchasing/receipts and commitments; supplier evidence should be visible at purchase decisions. | Extend the existing brand; integrate actual external-provider connections when justified. |
| **XELOR Advanced Planning** | Medium: planners test feasible capacity/material scenarios with declared costs and assumptions. R1 p. 3; R2 p. 9. | Core MRP/scheduling and orders stay usable. Requires calendars, routings, skills, stock and reliable actual progress. | ERP add-on first; evaluate algorithms through backtesting, not AI branding. |
| **XELOR Warehouse Execution** | Medium: stores teams receive, put away, count, replenish, kit and dispatch through scans. R1 pp. 5, 9; R2 p. 12. | One stock ledger; no disconnected second quantity record. Basic inventory/receipts/issues stay core. | Build scanning/task workflows; integrate validated scanners/labels and durable offline capture when needed. |
| **XELOR Connected Factory** | Medium with substantial installation dependency: job/shift visibility, operator tasks and accepted machine signals. R1 pp. 5-7; R2 p. 10. | Released jobs, production quantities, quality and maintenance events. | Build execution and evidence; partner for edge hardware and plant integration. Keep manual workflows usable. |
| **Energy & Utilities** | Selective but distinct: measure line/asset consumption, unusual usage and energy per accepted unit. R1 p. 9; R2 p. 13. | Job attribution, equipment hierarchy and cost allocation. | Small partner-assisted meter pilot before a broader package. Do not imply carbon or regulatory reporting automatically follows. |
| **Dispatch & Loading** | Selective: dispatch teams validate packing and plan physically feasible recurring loads. R1 p. 2; R2 p. 12. | Orders, item dimensions/weights, constraints, lots and dispatch records. | Integrate a specialist optimizer when the economics justify it; build the ERP handoff and execution checks. |
| **Safety & Permits** | Selective industry application: hazards, permits, incidents, actions and training. R1 p. 7; R2 p. 14. | Assets, work orders, people and approved site processes. | Build workflow with domain input; partner for camera detection, process safety and site validation. |
| **Integration & Data Operations** | High service fit: configure and operate supported business/device connections, recover failures and reconcile records. R1 p. 6; R2 p. 15. | Essential ERP data integrity stays core. Charge for additional integrations and operating scope, not ordinary correctness. | Own record contracts/reconciliation; integrate platforms and qualified connectors as justified. |

ONYX adds supervised analysis, explanation and approved actions across these applications. It should not be required for ordinary maintenance, purchasing, inspections or stock transactions to work (R2 p. 16, interpreted under current naming).

## Service packages around the applications

The research supports selling delivery, not just application access. R2 pp. 17-18 proposes discovery, design, implementation, training, operation and improvement as accountable stages. Translate that into three clearly scoped offers:

1. **Setup & Adoption:** process discovery, industry configuration, master-data cleanup, migration, role setup, training, acceptance and handover. Use fixed scope or milestone-based fees after discovery; label custom work separately.
2. **Factory Connectivity & Commissioning:** asset/protocol register, approved hardware, installation, validated mapping, outages/recovery and commissioning evidence. Quote hardware, field labour, travel and third-party licences separately. Use a qualified local field partner and one named delivery owner.
3. **Operate & Improve:** connector monitoring, application support, incident ownership, restore exercises, refresher training and outcome reviews. Recurring service scope must state coverage, response/restore targets, customer duties and exclusions. Infrastructure/OT operations should be separately scoped with a qualified partner.

A service dashboard alone does not constitute staffed support. Define real coverage and escalation before selling a service commitment. External specialist access needs agreed scope and expiry. Provide data export and an exit/handover path (R2 pp. 14, 17-18, 23).

## Pricing and deployment hypotheses

These are proposed model types, **not recommended prices or established entitlements**:

- Keep a clear XELOR core subscription; price optional applications by an understandable unit such as site, active team or managed assets after customer validation. Avoid an unpredictable charge for every screen or mandatory task.
- Separate one-time setup from recurring software and service fees. Define connectors, AI usage, hardware, cloud hosting, travel, custom changes and third-party licences explicitly. R2 p. 18 supports this separation.
- Start with one supportable deployment model. Offer customer-cloud or on-premise packages only after backup, patching, upgrades, telemetry and responsibility boundaries are operationally proven. A working local demo is not evidence of that support model.
- Tomax's perpetual option is a vendor precedent, not an instruction to adopt it. Model maintenance/support economics before promising perpetual licences or unrestricted customization.
- Do not estimate returns from vendor marketing percentages. Measure quote turnaround, stock agreement, action closure, downtime, defects and service labour using customer baselines; keep released capacity, cash savings and working-capital changes separate (R2 p. 22).

## Presentation improvements implied by the research

Each candidate needs one visible identity, target user, entry page, setup path, task queue, supported workflow and measurable outcome. A hidden tab with a useful calculation is not yet a well-presented application. R1's modular supplier pages and R2 pp. 5, 16 support role-specific journeys; this presentation prescription is our inference.

Use business labels such as “Maintenance & Reliability” and “Supplier Performance,” then connect their records directly to the ERP task that creates the need. Publish a capabilities catalogue showing what is included, optional and still in development. Retain one source of truth for stock, financial commitments and master data; an add-on must not create a competing ledger (R2 pp. 5, 15).

Before promotion, demonstrate one normal case and one exception across the full application: assigned owner, approved changes, evidence, recovery, connected ERP record and export. First prioritize exposing and joining working functionality; then complete gaps that prevent the promised outcome. The present source audit must determine which candidates qualify (R2 pp. 20-23).

## Limits and prioritization

Research alone supports **Maintenance, Quality, Quoting & Costing, and AIKYANTRA** as particularly recognizable application propositions. **After-sales** also has strong conceptual separation, but its ranking should rely more on current implementation and customer demand than on this supplier sample. **Projects & Engineering Change** deserves a separate evaluation, especially for engineer-to-order businesses.

Start specialist/hardware options through bounded pilots. Clinical workflows, autonomous machine control, broad digital twins, predictive maintenance and large open marketplaces are not generic ERP starting features (R2 pp. 6, 11, 13-14, 19-21).

The PDFs are vendor/public-source research, not a market-size study, willingness-to-pay survey or comparative production benchmark. The reviewed case studies, savings, certifications and support statements remain limited to their evidence. These files were preserved unchanged. No source-code changes, production tests or partner outreach were performed for this note.
