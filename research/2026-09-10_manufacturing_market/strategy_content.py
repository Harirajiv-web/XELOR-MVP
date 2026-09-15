"""Editable authored content for the detailed AIKYANTRA strategy report."""
import json
from pathlib import Path
PAGES=[]
def page(title,subtitle,blocks,sources=''):
 PAGES.append(dict(title=title,subtitle=subtitle,blocks=blocks,sources=sources))
def p(text):return dict(type='p',text=text)
def h(text):return dict(type='h',text=text)
def bullets(*items):return dict(type='bullets',items=list(items))
def table(headers,rows,widths=None):return dict(type='table',headers=headers,rows=rows,widths=widths)
def callout(label,text):return dict(type='callout',label=label,text=text)

page('Build the partner around the factory','AIKYANTRA / XELOR opportunity and execution plan | 10 September 2026',[
 callout('RECOMMENDATION','Make AIKYANTRA the accountable technology partner. Use XELOR for intelligence and coordinated action, ONYX where a new operational record system is needed, and qualified specialists for equipment, integration and security.'),
 p('The strongest opportunity is to connect a customer promise to materials, production, quality, delivery and money. The reviewed suppliers each cover useful parts of this chain. AIKYANTRA can combine these into a practical service for a defined manufacturing segment, then expand after proving results.'),
 h('Three priorities'),
 bullets('Close the commercial gap: turn an RFQ and its drawings into a checked cost sheet, approved quotation and traceable job.','Make the existing factory foundation dependable: real input data, simple operator workflows, scans, quality decisions and maintenance closure.','Join purchasing to cash: supplier commitments, receipt/invoice matching, payable dates and an explainable cash view.'),
 h('What this report is based on'),
 p('All 23 supplied photos and both videos; nine supplier groups; official websites, public company social pages and QR/link checks; and a read-only audit of the current XELOR workspace. The companion research PDF gives one page per supplier. This report turns that evidence into recommendations.'),
 p('Working assumption: the first target is a small or midsize discrete manufacturer, such as precision components, job work or industrial equipment. Team capacity, customer segment and budget were not specified. Priorities and timelines below are proposals to validate with a pilot, not delivery commitments.'),
 table(['Reading route','Pages'],[['Current product and supplier comparison','2-5'],['Priorities and detailed capability additions','6-16'],['Partner delivery, packages and market focus','17-19'],['Execution plan, value measurement and acceptance','20-23'],['Evidence references and plain-language glossary','24']],[390,120])
], 'Evidence: supplied media; company research PDF; repository audit at commit 13e8ecf, branch xelor-phase-2. No production deployment or customer outcome was tested.')

page('Start from what XELOR actually has','A source-level baseline, with a clear boundary around demonstrations',[
 p('The current README separates ONYX, the ERP and system of record, from XELOR, the intelligence layer. Older documents sometimes call the combined product XELOR. In this report, “current foundation” means code found in this workspace, including the business workflows used by the intelligence layer.'),
 table(['Status','Evidence and implication'],[
 ['Implemented in source','Customer/orders, BOMs, stock ledger, purchase/receipts, production operations, inspections/CAPA, maintenance, MRP, heuristic finite scheduling, AR/accounting, approvals and mission evidence. These are useful foundations; production readiness was not established.'],
 ['Real but bounded actions','Fulfilment has internal purchase-order and work-order writers and rereads their results. This is stronger than a suggestion-only demo, but is not proof of arbitrary external execution.'],
 ['Demonstration / mock','Factory Intelligence computes OEE, yet its current scenario is configured mockOnly. Factory Connect includes simulated devices and catalogue targets. Working Capital uses hardcoded example figures.'],
 ['Service demonstration','RELAY describes managed-service lifecycle and responsibilities using illustrative data. ACHILES has read-only health probes. Neither proves a staffed service or customer SLA.'],
 ['Planned / not found','Full RFQ/CPQ, engineering change lifecycle, robust mobile/offline scanning, validated prediction, production third-party ERP/device connectors, complete direct-material AP and open marketplace operations.']
 ],[115,395]),
 h('Corrections that matter'),
 bullets('Do not rebuild all scheduling: a finite heuristic scheduler already exists. Extend and validate it.','Do not call all quality “missing”: inspections and CAPA exist. Deepen execution, measurement and genealogy.','Do not advertise all 24 UI modules as 24 finished products. Module count is a navigation measure.'),
 callout('PRODUCT RULE','Mark every customer-facing workflow as live, limited, simulated or planned. Remove sample results from a paid pilot’s performance claims.')
], 'Internal: X1-X8 (reference key on page 24). Read-only inspection; no historical test counts were rerun.')

page('Preserve the foundation; complete the gaps','The next addition should close an entire customer workflow',[
 table(['Area','Current foundation','Useful next layer'],[
 ['Enquiry to order','Customers, orders, credit/tax checks','RFQ documents, cost model, quote versions, commercial approval, accepted-quote handoff'],
 ['Engineering','Items, versioned BOM, basic where-used','Drawing revision, ECO impact, effective dates and acknowledgement at the workstation'],
 ['Plan and produce','MRP, finite heuristic scheduling, operations','Validated constraints, live feedback, operator job tickets and controlled rework'],
 ['Materials','Stock ledger, batches, warehouse types','Bins, scan validation, kit readiness, cycle counting and picking/dispatch tasks'],
 ['Quality','Inspection specifications, NCR/CAPA','Gauge status, in-process capture, supplier loop, genealogy and recall rehearsal'],
 ['Maintenance','PM, work orders, parts and downtime','Technician mobile evidence, condition inputs and verified alert response'],
 ['Finance','AR, receipts, accounting, expenses','Supplier bills/three-way match, real AP, commitments and cash forecast'],
 ['Connectivity','Import/retry patterns and ONYX HTTP port','One supported pilot connector, durable edge buffer, deduplication and reconciliation'],
 ['Safety and security','App permissions, audit, safety flags','EHS workflows and qualified OT-security service; vision only after validation'],
 ['Delivery model','Service and partner concepts','Named people, support coverage, commissioning packs and monthly outcome reviews']
 ],[93,170,247]),
 callout('CHOICE','For an existing ERP customer, integrate the missing operational layer. For a plant without dependable records, deploy the necessary ONYX workflows and establish record ownership first.'),
 p('A supplier’s brochure is evidence of advertised scope. Repository code is evidence of implementation. Neither alone proves a reliable customer deployment. Compare these evidence types openly and require pilot acceptance before claiming equivalence.')
], 'Internal: X1-X10. Supplier scope: all nine profiles in the companion PDF.')

page('What to learn from each supplier','All nine supplier groups mapped to an AIKYANTRA decision',[
 table(['Supplier / reference','Valuable pattern','Recommended response'],[
 ['CommerceCX / ScaleFluidly','RFQ-cost-quote-order continuity; loading optimisation; governed NPI','Build supervised RFQ/costing first. Integrate loading for frequent shippers. Reuse stage gates; defer clinical workflows.'],
 ['AnjX Solutions','Forecast, inventory and capacity scenarios for SMEs','Improve planning scenarios and measured backtesting. Evaluate specialist algorithms only after real data is ready.'],
 ['Slooze','Procurement decisions, supplier visibility and role-specific guidance','Build supplier RFQ/bid comparison, commitments and exceptions tied to jobs and budgets.'],
 ['Tomax / D3Minds','Connected MES, warehouse, quality and engineering projects','Deepen factory execution and traceability. Use as a functional benchmark for demonstrations.'],
 ['Zeliot / Condense','Reusable real-time data foundation and application delivery','Evaluate as an integration/platform option where workload economics justify it. Own factory workflows.'],
 ['Adventis / OptiMES','Small operations modules plus gateways and maintenance/safety','Use modular packaging. Pilot a gateway/condition workflow with defined compatibility and support.'],
 ['Controlsoft','Physical engineering, panels, commissioning and maintenance','Qualify for an installation/integration partner shortlist. AIKYANTRA retains customer accountability.'],
 ['RheinBrücke / Epicor','ERP extensions plus full implementation and ongoing support','Learn delivery discipline and extend existing ERP. Evaluate partner route for larger ERP programmes.'],
 ['Connectivity / CoSol + Cisco','Industrial connectivity, security and managed infrastructure','Partner for network/OT security and remote access. Keep this distinct from application security.']
 ],[125,175,210]),
 p('These are research-based options, not endorsements or confirmed partnerships. Check customer fit, delivery region, API access, licence economics, data ownership, support and reference projects before selection.')
], 'Primary links: C2/C5; A1/A2; S1/S2; T2/T3; Z1/Z2; B1/B3; B9/B11; B13/B15; K1/K2. Link key on page 24 and companion profiles.')

page('Design one connected customer journey','Commercial promise -> factory execution -> verified financial outcome',[
 dict(type='flow',nodes=['RFQ + drawing','Cost + approve','Plan + buy','Make + inspect','Pack + deliver','Invoice + collect']),
 p('Each step should carry the same job identity, revision, required quantity, due date, responsible person and source evidence. A late supplier delivery must be visible to the planner, supervisor and customer-service owner without separate spreadsheets.'),
 table(['Layer','AIKYANTRA responsibility'],[
 ['Customer workspace','Owner, buyer, planner, operator, inspector and technician see the work relevant to their role. Shared facts; different actions.'],
 ['XELOR intelligence','Detect exceptions, retrieve evidence, compare options, request approval, execute only supported actions and verify the result.'],
 ['Operational workflows','ONYX or the customer’s existing ERP owns agreed records. Quality, maintenance and warehouse actions create traceable transactions.'],
 ['Data and connectivity','Versioned integrations join business records and factory events. Preserve source identity, timestamps, units and quality/freshness status.'],
 ['Plant and infrastructure','Machines, sensors, meters, networks and security remain under documented local control, with qualified installers and support.'],
 ['Delivery and service','Discovery, commissioning, training, incident response and continuous improvement run across all layers.']
 ],[133,377]),
 callout('EXAMPLE','A bearing delivery slips. XELOR identifies affected jobs, checks available stock and a qualified alternative, estimates delivery/margin impact, obtains approval and updates the relevant purchasing/planning workflow. It rereads the result and records unresolved work.'),
 p('The intelligence layer must not create a second uncontrolled stock or financial ledger. Data ownership and reconciliation are part of the product design.')
], 'Synthesis from C2, T2/T3, Z1, B13/B15 and X1-X9; the complete illustrated future journey is a recommendation.')

page('Prioritise by value and readiness','Complete a repeatable workflow before expanding the catalogue',[
 table(['Priority','Deliverable','Why now / dependency'],[
 ['P0: essential','Pilot scope, accurate masters, supported connector/import, roles, backup/restore, real service owner','Every other promise depends on trustworthy data and a recoverable service.'],
 ['P1: first package','RFQ intake, checked costing, quote approval and accepted-order link','Closes a clear revenue workflow gap and can start before machine connectivity. Needs commercial rules and real RFQs.'],
 ['P1: alternative first package','Operator capture, one-line visibility, material scans and quality handoff','Choose instead when downtime, missing WIP or wrong material is the buyer’s main pain. Needs site access and supervision.'],
 ['P2: strengthen','Supplier commitments, AP connection, engineering change, traceability and maintenance closure','Improves delivery reliability and actual cost once the first records are dependable.'],
 ['P3: selective','Forecast/APS depth, energy, loading optimisation, vision or predictive maintenance','Only where the customer has the problem, usable data and a measurable benefit.'],
 ['Later','Open marketplace, broad digital twins, full clinical platforms, autonomous physical control','High scope and validation burden; weak reason to put them in a general MSME starting package.']
 ],[101,190,219]),
 h('How to choose between the first two packages'),
 bullets('High-mix engineer-to-order plant: quotation effort, drawing revisions and margin leakage usually make RFQ a better starting hypothesis. Validate in discovery.','Repetitive production plant: poorly recorded stops, scrap and replenishment may make factory execution the stronger starting hypothesis.','Use customer interviews and a baseline to choose one. Do not attempt both complete packages in a single undersized pilot.'),
 p('Indicative effort bands: small means a contained workflow extension; medium means new records plus UI and integrations; large means site hardware, multiple systems or specialised validation. Estimate actual person-weeks after reviewing the pilot data and code.')
], 'Recommendation based on X1-X10 and the reviewed offerings; not a quantified demand survey.')

page('Add RFQ-to-quotation continuity','Priority P1 | Owner: commercial lead + engineering | Effort: medium to large',[
 h('Smallest useful version'),
 bullets('Receive the customer RFQ and attachments in one record. Record due date, customer revision, parts, quantities, delivery expectations and open questions.','Extract text/tables with source-page links and confidence. A person confirms engineering requirements, units, quantities and ambiguous drawing details.','Build a cost sheet from materials, cycle/setup time, labour, tooling, outsourced work, freight and overhead assumptions. Store supplier-price date and validity.','Compare supplier bids on total comparable cost, quantity, lead time, tooling and payment terms. Keep assumptions visible.','Apply a margin floor and approval limits. Issue a versioned quotation with validity, exclusions and delivery assumptions; link acceptance to the sales order.'),
 h('Extend XELOR’s existing work'),
 p('Reuse customers, item/BOM records, workflow approvals and fulfilment mission evidence. Add RFQ, quote, quote revision and cost-assumption entities rather than placing financial promises only in chat. Link accepted quote lines to job/stock/quality records so actual cost can be compared later.'),
 callout('EXAMPLE','A drawing revision adds a machining step after a quote was drafted. Show the changed requirement, affected cost, revised lead time and required approval before a new quote is issued.'),
 h('Acceptance and value'),
 p('Use a representative set of real RFQs, including revisions and missing data. Trace every critical extracted value to a source or human correction. Prove that outdated quotes cannot be silently overwritten and acceptance creates the correct order only once. Measure median and slow-tail quote turnaround, correction rate and estimated-versus-actual job margin.'),
 p('Defer autonomous geometric interpretation, unsupported win-probability scores and auto-issued commercial commitments. AI can prepare the work; authorised people own the engineering and price decision.')
], 'Supplier reference: CommerceCX C2/C5 and supplied image 13. Current foundation: X2/X7.')

page('Connect procurement to production and cash','Priority P2 | Owner: purchase + finance | Effort: medium to large',[
 h('What to add'),
 bullets('Maintain approved suppliers, capabilities, documents, lead times, contact roles and review/expiry dates. Link supplier performance to actual receipts and defects.','Generate purchase RFQs from job/material demand. Normalise bid units and quantity breaks; compare delivery, payment, tooling, transport and quality terms.','Track PO acknowledgement, promised delivery and changes. Escalate shortages against the affected production jobs, not just a generic late-PO list.','Complete supplier-bill processing or connect the accounting system: match PO, receipt and invoice; route price/quantity exceptions to an authorised person.','Build an AP schedule and a 13-week cash view from real due dates, committed purchases and expected receipts. Separate confirmed entries from scenarios.'),
 h('Build on existing code'),
 p('Purchase orders, GRNs, approval patterns and stock movements already exist. Direct-material AP/three-way matching needs completion or a reliable accounting integration. Working Capital’s attractive sample figures must be replaced with reconciled calculations before they are used in a customer decision.'),
 callout('VALUE','The buyer sees which material will delay a job; the owner sees how an alternate supplier affects margin and cash; accounts sees the approved amount and due date. All three views use the same evidence.'),
 h('Acceptance'),
 p('Demonstrate partial receipts, price variance, duplicate invoice, rejected stock and credit adjustment. Reconcile committed quantities and amounts with the source ledger. Measure supplier on-time delivery, receipt-to-bill effort, exception backlog and forecast error. Payment execution remains outside the pilot unless specifically scoped and controlled.'),
 p('Finance or payment products should be integrated through qualified providers if later needed. A procurement screen does not make AIKYANTRA a financing provider.')
], 'Supplier references: Slooze S1/S2 and CommerceCX image 13. Internal: X2/X8/X9.')

page('Improve planning without replacing what works','Priority P2-P3 | Owner: planner | Effort: medium to large',[
 p('XELOR’s foundation already includes MRP and finite heuristic scheduling. The valuable addition is a plan that matches plant constraints, explains conflicts and responds to reliable actual progress.'),
 table(['Step','Required improvement'],[
 ['Master the constraints','Verify calendars, actual capacity, qualified alternate machines, routing, setup time, tool/fixture availability, skills and subcontract lead times.'],
 ['Make demand explicit','Keep customer orders separate from forecast. Identify assumptions and avoid counting the same demand twice.'],
 ['Test practical scenarios','Compare overtime, alternate machine, split batch, subcontract and changed priority. Show cost, material and delivery consequences.'],
 ['Publish with control','Planner reviews feasibility and uncertainty. Record the schedule version, freeze window and authorised override.'],
 ['Learn from execution','Feed accepted output, stops, rework and material arrivals into the next planning cycle. Record why actual time differs from planned time.']
 ],[122,388]),
 h('Where AnjX is especially useful as a reference'),
 p('Its forecasting, inventory and scenario approach suggests a useful next layer for repeat demand and spare parts. Start with simple, explainable forecasting benchmarks. Evaluate more advanced models against historical holdout periods and service/cash outcomes, not only a headline accuracy number.'),
 callout('VALIDATION','A proposed plan must not allocate a machine, tool or material twice. Test a breakdown, absent operator, late material and urgent order. The planner must understand why a job moved.'),
 p('Track on-time-in-full delivery, schedule adherence, planning effort and expedite cost. Forecast evaluation should state horizon, item mix, data exclusions and error measure. A well-tuned planning rule can be more useful than a model trained on unreliable history.')
], 'Supplier: AnjX A1/A2, RheinBrücke/Epicor B13/B15. Internal: X3 and X5.')

page('Turn factory visibility into useful daily work','Priority P1 alternative | Owner: production supervisor | Effort: medium + site work',[
 h('One line, one daily routine'),
 bullets('Show the operator the released job, correct drawing/work instruction, quantity and inspection requirement. Support start, pause, complete, reject and reason capture.','Start with manual counts and a small number of validated signals. Connect machine counters only after units, resets, timestamps and job assignment are understood.','Give the supervisor a shift board: target, accepted output, stops, top losses and unresolved actions. Capture the owner and due time of each response.','Link good output to finished/WIP stock; link rejected output to quality disposition; link downtime requiring repair to maintenance.'),
 h('Make OEE honest'),
 p('OEE = availability x performance x quality. Define planned production time, run time, ideal cycle and total/good count for each comparable process. Missing inputs produce an “insufficient data” state rather than an invented percentage. Reconcile counters and prevent overlapping downtime from being counted twice.'),
 callout('CURRENT GAP','OEE calculation exists in source, but the current Factory Intelligence scenario is explicitly a mock. The first deliverable is dependable input and operational use, not another OEE dashboard.'),
 h('Acceptance'),
 p('Prove a complete shift: start job, pause for an explained stop, record a reject, complete inspection and post accepted output. Simulate a lost connection and counter reset. Reconcile the shift board to work-order and stock totals. Agree signal freshness and data coverage with the customer.'),
 p('Measure unplanned-stop hours, accepted output, scrap, manual reporting effort and unresolved actions. Compare similar product/shift conditions. Higher measured downtime after better capture may reveal old losses; it is not automatically worse performance.')
], 'Supplier: Tomax T2, Adventis B1/B3, Zeliot Z1/Z2. Internal: X4/X5.')

page('Join engineering changes, quality and traceability','Priority P2 | Owner: engineering + quality | Effort: medium to large',[
 h('Engineering control'),
 p('Add a drawing/document lifecycle and engineering change request/order. Show affected BOMs, quotations, open orders, bought material and work in progress. Define the effective revision and capture shop-floor acknowledgement. Preserve old records when a new revision is released.'),
 h('Quality at the point of work'),
 bullets('Show the correct inspection plan for that operation and revision. Capture measurement, gauge, operator, time, lot and disposition.','Warn or block use of an overdue gauge according to the customer’s quality rules. Add calibration records and evidence.','Open nonconformance from failed checks; contain affected stock; assign action and verify effectiveness through the existing CAPA foundation.','Connect supplier defects, internal rework and customer complaints. Add an 8D-style customer response when the target segment requires it.'),
 h('Trace the product in both directions'),
 p('Link supplier heat/lot to receipt, component issue, operation, inspection, finished serial/lot and customer shipment. Keep rework, splits, merges and scrap visible. Existing batch/ledger records are the starting point; a full recall graph is still an addition.'),
 callout('ACCEPTANCE EXERCISE','Choose a suspect supplier lot. Identify stock still on hand, all affected jobs and shipped lots, relevant inspection evidence and the customer list. Rehearse containment without corrupting the ledger.'),
 p('Measure first-pass yield, repeat defects, rework hours and trace-query completeness/time. Add SPC only after stable definitions and measurement quality exist. APQP/PPAP, full PLM and regulated validation are segment-specific extensions, not automatic parts of every MSME package.'),
 p('CommerceCX’s pharma material offers useful patterns for approval gates and records. Full clinical research and cell/gene therapy operations would require a separate product strategy and specialist validation.')
], 'Supplier: Tomax T3; CommerceCX C4/C7 and images 14-15. Internal: X3/X6.')

page('Make warehouse and dispatch traceable','Priority P1-P2 | Owner: stores + logistics | Effort: medium',[
 table(['Workflow','Smallest valuable addition'],[
 ['Receive and locate','Scan item/lot, validate PO and quantity, capture quality hold, print identifier and choose bin/location.'],
 ['Count and replenish','Cycle counts with controlled adjustments; low-stock and production-line replenishment tasks; clear ownership.'],
 ['Kit and issue','Reserve material to a job, check correct revision/lot, show missing components and record the issue once.'],
 ['Handle WIP/rework','Retain lot identity through partial completion, movement, rework, scrap and return.'],
 ['Pick, pack and dispatch','Validate customer/order/item/lot/quantity; produce packing labels and dispatch evidence; update the order and inventory consistently.']
 ],[120,390]),
 h('Start with scans people can use'),
 p('Use a phone/tablet or existing scanner where suitable. Test labels under actual lighting, dust and handling. A scan should populate a transaction with clear confirmation and error messages, not merely open a generic webpage.'),
 h('Where loading optimisation fits'),
 p('CommerceCX LogisticCX is relevant when recurring container or truck loads create meaningful cost. First capture dimensions, weight, quantity, orientation, stackability, unloading order and loading constraints. A 3D picture alone does not prove a safe or executable load.'),
 callout('ACCEPTANCE','Use a wrong lot, duplicate scan, damaged label, partial pick and network interruption. Verify that no duplicate stock movement occurs and all exceptions are resolved with an audit record.'),
 p('Measure inventory accuracy, picking errors, kit-related stoppages and dispatch delay. For a loading pilot, compare the proposed plan with actual execution and agreed freight/labour results. Defer forklift optimisation and complex robotics until volume and infrastructure justify them.')
 ,h('After delivery: service, returns and spares'),
 p('For equipment makers, extend the shipped serial/lot record into warranty, service requests, approved returns and spare-parts demand. Connect recurring field failures to quality and engineering changes. Begin with complaint/return ownership and traceability; add a customer portal or field-service scheduling when volume justifies it.')
], 'Supplier: Tomax supplied image 21; CommerceCX C6 and image 16. Internal: X4/X6/X9.')

page('Close maintenance work; then add prediction and energy','Priority P2, advanced analytics P3 | Owner: maintenance | Effort: medium + hardware',[
 h('Make the maintenance foundation operational'),
 bullets('Clean the asset register, failure codes, criticality, preventive tasks and spare-parts mapping. Record downtime against an asset and affected operation.','Give technicians a mobile work order with checklist, isolation/permit reference, photos, readings, parts used and completion evidence.','Convert a useful condition alert into an assigned work request with priority and due date. Close it only with a recorded inspection/action result.','Review recurring faults, overdue PM, repeat failures, parts shortages and repair time with the production supervisor.'),
 h('Earn the predictive claim'),
 p('Add vibration, temperature, current or other signals only for a defined failure mechanism and asset group. Partner for sensors and interpretation. Establish a labelled history and validation method. Measure useful warning lead time, false alarms, missed events and whether the team acted. Until then, call the feature condition monitoring or threshold alerts.'),
 h('Energy and utilities can be a separate small pilot'),
 p('Meter the relevant equipment or line. Identify idle-load waste and unusual use; calculate energy per accepted unit when job attribution is reliable. Start with electricity or compressed air where the customer already suspects losses. Add water/effluent workflows only for a relevant process plant.'),
 callout('ACCEPTANCE','Demonstrate alert -> owned work -> parts/action -> verified closure -> downtime record. For energy, reconcile meter totals and state the allocation method before assigning cost to a job.'),
 p('Track planned-maintenance completion, repeat failures, unplanned downtime and maintenance effort. Distinguish avoided cost from extra saleable output. Existing software PM and KPI functions should be hardened rather than recreated.')
], 'Supplier: Adventis B3/B4/B23; Tomax T2/T5; Controlsoft B9. Internal: X6 and X10.')

page('Treat factory safety and security as distinct workstreams','Priority P0 for basic controls; specialist extensions by customer need',[
 table(['Area','What AIKYANTRA should provide','Specialist boundary'],[
 ['Application security','Roles, least privilege, approval controls, audit, tenant separation, tested recovery and change handling','Validate actual deployment; source code controls alone are not a security audit.'],
 ['OT network security','Maintain an asset/connection register and approved access/change records in the customer workspace','Partner for passive discovery, network segmentation, industrial monitoring and secure vendor access.'],
 ['EHS workflows','Hazard and incident records, near misses, permits/checklists, actions, training evidence and review dates','Plant safety owner approves the process and required controls.'],
 ['Vision alerts','If justified, route camera detections to trained human review and track outcomes','Validate lighting, PPE types, occlusion, false alarms and missed detections with a specialist.'],
 ['Remote support','Named access request, approval, time limit, purpose and service ticket; record closure','Security partner configures secure access and revocation. Local plant authority remains explicit.']
 ],[107,211,192]),
 p('Connectivity/CoSol and Cisco show the gap between securing a web application and securing factory networks. Adventis shows how EHS can share asset and work records with maintenance. These are complementary capabilities, not interchangeable certifications.'),
 callout('OPERATING BOUNDARY','The first factory integration should collect data and support human decisions. Autonomous machine actuation and emergency protection are separate engineering scopes with explicit site/OEM approval and validation.'),
 h('Acceptance'),
 p('Review a vendor-access session end to end, including expiry/revocation and an incident escalation. Rehearse restoration from backup. For EHS, trace an incident through assigned action and review. Never describe a camera or software installation as guaranteeing a hazard-free or certified plant.')
], 'Primary: Cisco Cyber Vision / Secure Equipment Access (K2/K3); Connectivity K1; Adventis B1. Internal: X5/X10.')

page('Productise integration and data quality','Priority P0 | Owner: integration lead | Effort: medium to large',[
 p('An MSME will judge the system by whether it agrees with the shop floor and accounting records. A reusable, supported integration is a product in its own right.'),
 table(['Requirement','Practical implementation'],[
 ['Record ownership','For each customer, item, BOM, order, stock and invoice, name the authoritative system and allowed write path.'],
 ['Versioned mapping','Record external IDs, units, currencies, time zones and revision rules. Validate inputs and quarantine uncertain records.'],
 ['Reliable delivery','Use durable queues/buffers, explicit acknowledgements, retries, idempotency keys and duplicate protection.'],
 ['Reconciliation','Compare source and destination counts, quantities and values; assign exceptions with a retry/review trail.'],
 ['Device resilience','Handle reconnects, counter resets, missing timestamps and stale signals. Store source and ingest times separately.'],
 ['Supportability','Show connector health, last successful sync, backlog and failure owner. Provide controlled replay and rollback procedures.']
 ],[125,385]),
 h('Choose a narrow first connector'),
 p('Use the actual pilot’s ERP/accounting version and machine/controller. A checked file import may be a sensible start when real-time exchange is not needed. Do not promise universal SAP, Tally, Odoo or Dynamics compatibility because an integration catalogue contains a name.'),
 h('Where Zeliot fits'),
 p('Condense is worth evaluating when live data, many integrations and ongoing platform operations become material. Compare cloud, platform licence, engineering and support cost for the actual workload. Avoid imposing enterprise streaming economics on a small one-line pilot.'),
 callout('RELEASE GATE','Prove repeated import, partial failure, duplicate delivery, outage recovery, stale data and reconciliation on the customer’s real data. Only then label the connector supported.')
], 'Supplier: Zeliot Z1/Z5; Adventis B4; RheinBrücke B21. Internal: X5/X9.')

page('Give workers simple tools and AI a clear job','Priority P1-P2 | Owner: product + plant champion | Effort: medium',[
 h('Worker experience'),
 bullets('Build touch-friendly task flows: start/finish a job, scan material, record inspection, raise a fault and complete maintenance. Use the plant’s working languages where discovery shows need.','Show only the current task, correct instructions and required evidence. Design for gloves, shared devices, noisy areas and short training sessions.','Support offline capture only with a durable queue, clear pending/synced status and supervised conflict resolution. A responsive website is not automatically an offline application.','Start with a tested web/PWA approach if it meets the site needs. Build a native app only when device integration, resilience or deployment requirements justify it.'),
 h('Useful AI tasks'),
 table(['Task','Required behaviour'],[
 ['Read and prepare','Draft RFQ fields, supplier comparison or maintenance summary with sources and uncertainty.'],
 ['Explain an exception','Identify the evidence behind a late job, shortage, defect or cash risk; distinguish known facts from inference.'],
 ['Compare options','Calculate consequences using governed rules and current data. Explain missing inputs.'],
 ['Act within authority','Use an existing supported executor, obtain required approval, reread the result and record an outcome.'],
 ['Know when to stop','Escalate when data is stale, permissions fail or the action is unsupported. Preserve a usable manual path.']
 ],[128,382]),
 p('The existing agent governance, evidence and approval patterns are an advantage to preserve. Add useful capabilities to that common structure instead of creating separate ungoverned chatbots for every module.'),
 callout('SUCCESS TEST','An operator can finish the core task reliably after practical training, and a manager can explain every AI-assisted business action from its records.')
], 'Supplier: CommerceCX image 13; Adventis image 10; Tomax image 21. Internal: X7/X9 and operator-workflow source inspection.')

page('Make end-to-end delivery a real service','AIKYANTRA owns the outcome even when specialists do part of the work',[
 table(['Stage','Named accountability','Customer deliverable'],[
 ['Discover','Solution owner + plant sponsor','Process walk, systems/assets, pain baseline and fixed pilot scope'],
 ['Design','Solution owner + domain/integration leads','Workflow, record ownership, hardware list, access plan and acceptance criteria'],
 ['Implement','Delivery lead; qualified installer for site work','Configured workflows, clean masters, connected devices, reconciled data and commissioning evidence'],
 ['Train and stabilise','Plant champion + customer-success lead','Role training, open-issue log, fallback procedure and acceptance sign-off'],
 ['Operate','Service owner + contracted support partners','Coverage calendar, ticket triage, monitoring, recovery and escalation'],
 ['Improve','Account owner + plant sponsor','Monthly outcomes, support cost, adoption review and next justified improvement']
 ],[94,167,249]),
 h('What to build, buy and partner for'),
 bullets('Build/own: common workflow and evidence model, approvals, manufacturing decision logic, connector contracts, customer experience and delivery method.','Buy/integrate: appropriate accounting/ERP, commodity OCR, cloud, identity, monitoring and ticketing. Do not recreate mature tools without a customer reason.','Partner: PLC/SCADA/DCS engineering, electrical panels, meters/sensors, OT security, specialist vision, robotics and regulated validation.'),
 callout('PARTNER AGREEMENT','Specify region, skills, lead time, acceptance tests, response coverage, escalation, warranty, access handling and who pays for rework. Give the customer one AIKYANTRA delivery owner.'),
 p('RELAY can become the operating workspace, but its present demonstration is not a staffed service. Begin with a curated partner and connector catalogue. Add an open marketplace only when installation quality, entitlement, support and commercial settlement can be operated consistently.')
], 'Supplier references: Controlsoft B9/B11, RheinBrücke B13, Connectivity K1. Internal: X10.')

page('Sell understandable packages with visible cost','Commercial design hypotheses, not researched vendor price quotes',[
 table(['Package','Customer promise','Scope and success measure'],[
 ['Assess','Know which problem to fix first','Site/data/process review; baseline; scoped business case and pilot acceptance plan'],
 ['Quote to Job','Prepare and approve a dependable quote faster','RFQ, checked costing, revision/approval and accepted-order link; measure turnaround and corrections'],
 ['Factory Execution','Know what is happening and close the action','One line, operator input, selected signals, quality/material handoff; measure coverage, losses and closure'],
 ['Cash and Control','See supplier commitments and cash consequences','Receipt/invoice exception flow, accounting connection and forecast; measure reconciliation and error'],
 ['Operate and Improve','Keep the service useful after go-live','Named support coverage, connector monitoring, restore drills, training and monthly outcome review']
 ],[114,154,242]),
 h('Show the full cost'),
 p('Separate diagnostic/pilot, implementation, hardware/installation, software/site subscription, connectors, cloud/AI usage and support. State inclusions, volume assumptions, travel, third-party licences and change requests. Give customers data export and an agreed exit/handover process.'),
 h('Set price from delivery economics and customer value'),
 p('One-time cost = discovery + configuration + data cleanup + integration + installation + training. Monthly cost = hosting/licences + support labour + monitoring + partner coverage + model usage. Test the price against credible benefit and willingness to pay; do not set it by copying unverified competitor percentages.'),
 callout('SCOPE RULE','A small module can have substantial installation or support cost. Price the complete working outcome and put a boundary around custom development.'),
 p('Public monetary pricing was generally unavailable. Zeliot’s calculator separates platform and cloud cost, so its advertised entry figure is not an all-in factory deployment quote. No vendor-price ranking is justified by this research.')
], 'Commercial synthesis; public model evidence: Tomax T1, Zeliot Z5 and reviewed supplier pages.')

page('Choose one entry segment; adapt the package','A practical starting hypothesis for manufacturing MSMEs',[
 table(['Plant type','Likely first problem to test','Product emphasis'],[
 ['Precision / job-work components','RFQ effort, revisions, due dates and lot history','Quote to Job; routing/cost assumptions; ECO; basic traceability'],
 ['Pumps / machinery / engineer-to-order','BOM changes, purchased parts, project dependencies','Engineering/project gates; procurement commitments; job margin; delivery risk'],
 ['Repetitive parts / assembly','Stoppages, replenishment, scrap and shift reporting','Factory Execution; OEE with valid inputs; kitting; in-process quality'],
 ['Export-heavy manufacturer','Dispatch preparation and recurring load cost','Traceable packing and dispatch first; constrained load optimisation where justified'],
 ['Process / food / chemical','Batch process, utilities, hazards and process quality','Separate discovery and specialist design; recipe/batch, EHS and instrument needs change scope'],
 ['Regulated pharma / clinical','Validation and domain-specific records','Partner-led specialist offering; do not extend generic MSME claims into clinical operations']
 ],[135,177,198]),
 h('Recommended starting point'),
 p('Pick one accessible discrete-manufacturing plant with a committed owner, a daily user champion and a measurable bottleneck. A complex but observable workflow is more useful than an impressive demo with no accountable user.'),
 h('Qualify the pilot'),
 bullets('Can the customer provide representative records and permit process observation?','Can a named person approve master data, costs, quality rules and acceptance?','Is there one workflow whose benefit can be measured within the pilot period?','Can the plant operate a fallback if the new workflow or connector is unavailable?'),
 p('This segment order is a strategic recommendation, not a market-size study. Confirm willingness to pay, competition, sales cycle and field-service reach before choosing a broader market.')
], 'Inference from supplier scope and XELOR baseline; no TAM or customer-demand survey conducted.')

page('Run a focused 90-day pilot','Sequence is conditional on team, access, data and technical readiness',[
 table(['Period','Work','Exit evidence'],[
 ['Days 1-15','Select one plant and one outcome. Observe work, audit data, inventory simulated features, agree scope and baseline.','Named sponsor/champion; data and asset register; pilot scope; system ownership; success and stop criteria'],
 ['Days 16-30','Validate technical design and current code. Clean masters; configure roles; build needed import/connector and core task flow.','Reconciled test records; permissions; failure/recovery plan; demonstrable user workflow'],
 ['Days 31-45','Complete exception paths, field setup if included, role training and shadow run.','Users perform representative cases; duplicates/outages handled; backup restore demonstrated'],
 ['Days 46-75','Run bounded live work with authorised approvals. Review data quality, usage, failures and support effort weekly.','Timestamped records; reconciled totals; issue ownership; comparison periods and service labour'],
 ['Days 76-90','Review customer benefit, unresolved issues and delivery economics. Document reusable setup.','Customer acceptance or corrective plan; measured outcome; support cost; expand/fix/stop decision']
 ],[91,221,198]),
 h('Keep the pilot narrow'),
 p('For Quote to Job, cover a defined RFQ family and its order handoff. For Factory Execution, cover one line/area and a defined job/quality/material flow. Add a second package only if capacity and acceptance evidence support it.'),
 callout('STOP OR RESET','If core data cannot be reconciled, users cannot complete work, or no accountable customer owner exists, fix the prerequisite before adding AI or expanding to more machines.'),
 p('Schedule changes should follow evidence. Hardware lead times, ERP access and source-code readiness can move these windows. The report does not assume every proposed module can be built in 90 days.')
], 'Execution recommendation built on the source audit and supplier delivery lessons.')

page('Expand over a year through reusable delivery','Milestones are conditional; staffing shown as roles, not current headcount',[
 table(['Stage','Expansion','Release condition'],[
 ['First quarter','One accepted workflow at one pilot plant','Reliable user completion, reconciled data, recoverability and measured service cost'],
 ['Second quarter','Repeat at another similar plant; add traceability/quality or procurement depth','Reuse configuration/connector with less delivery effort and no hidden data divergence'],
 ['Third quarter','Add one advanced option: planning, energy, condition monitoring or loading','Customer problem and data justify it; specialist delivery and validation agreed'],
 ['Fourth quarter','Broaden within the selected segment; strengthen managed support and partner catalogue','Service margin, support coverage, onboarding quality and customer retention justify expansion']
 ],[90,225,195]),
 h('Minimum responsibilities to cover'),
 bullets('Product/solution owner: customer workflow, priorities and acceptance.','Manufacturing domain lead: engineering, planning, quality and operational definitions.','Application engineers: backend/records, frontend/worker experience and meaningful validation.','Integration/edge lead: ERP/device connection, data quality and recovery.','Customer-success/service owner: training, adoption, incidents and outcome review.','Qualified field/security partners: site installation, networks and specialist scope.'),
 p('One person may cover multiple roles in an early team, but every role needs allocated time. Do not plan several independent modules as if the same engineer and domain lead can deliver all of them simultaneously.'),
 callout('REUSE TARGET','Build a repeatable deployment kit: discovery checklist, master templates, connector configuration, acceptance cases, training materials and service runbook. Track hours saved on the next installation.'),
 p('Keep platform work tied to delivery: feature entitlements, configuration, audit, export, versioned upgrades and partner access. A marketplace becomes useful after the service catalogue is repeatable, not before.')
], 'Recommended operating plan; no current team capacity or delivery budget was supplied.')

page('Measure value without double counting','Agree operational evidence and financial interpretation with the customer',[
 table(['Outcome','Measure','Evidence discipline'],[
 ['Quote speed','Median and 90th-percentile receipt-to-approved-quote time','Compare similar RFQ complexity; count missing-information pauses explicitly'],
 ['Delivery','On-time-in-full shipments / due shipments','Freeze promised-date policy; do not move dates to improve the result'],
 ['Factory reliability','Unplanned stop hours; valid event coverage; action closure','Use comparable operating time/product mix; exclude overlapping stops'],
 ['Quality / material','First-pass yield, rework hours, stock agreement, picking errors','Use actual inspection, movement and physical-count records'],
 ['Cash','Collections, slow-stock release, forecast error','Reconcile ledger/bank evidence; separate assumptions from actual cash'],
 ['Service economics','Implementation hours and support hours/site/month','Include partner, hosting and issue-resolution cost, not only licence revenue']
 ],[96,185,229]),
 h('Illustrative example only - not a forecast'),
 p('Suppose comparable RFQs fall from 3 hours to 1.5 hours each, with 40 RFQs a month. That releases 60 hours/month. At an assumed loaded cost of Rs 500/hour, the capacity value is Rs 30,000/month. It becomes a cash saving only if overtime, outsourcing or another actual cost falls; otherwise it is freed capacity.'),
 p('Suppose validated reductions in scrap and overtime total Rs 35,000/month and recurring software/service cost is Rs 15,000/month. Net recurring benefit is Rs 20,000/month. An assumed Rs 180,000 setup cost then has a simple payback of 9 months, before tax, financing and other effects. Replace every input with customer evidence.'),
 callout('KEEP BENEFITS SEPARATE','Cash savings, released working capital, freed staff capacity and extra contribution from saleable output are different. Do not count the same recovered machine hour as all four.'),
 p('No supplier’s advertised percentage has been used as AIKYANTRA’s expected return. Establish baseline, comparison window, data coverage, confounding changes and customer sign-off before publishing a case study.')
], 'Illustrative arithmetic authored for this report; supplier results remain vendor claims. Measurement recommendations draw on XELOR transaction/evidence design.')

page('Use acceptance gates and targeted vendor checks','Turn broad promises into reviewable demonstrations',[
 table(['Gate','Evidence required before customer release'],[
 ['Workflow','Real users complete normal and exception cases with correct records, approvals and ownership.'],
 ['Data','Required masters are approved; critical values trace to a source; source/destination totals reconcile.'],
 ['Resilience','Repeated requests, duplicate scans, partial failures, reconnects and restore are tested. Pending work is visible.'],
 ['Access and action','Permissions, tenant separation and approval limits hold in the deployment; supported writes are reread and recorded.'],
 ['Adoption and service','Plant champion trained; fallback available; named service owner, coverage and escalation are operating.'],
 ['Value','Baseline and measurement method agreed; results distinguish evidence, assumptions and actual benefit.']
 ],[105,405]),
 h('Supplier-specific demonstrations to request later'),
 bullets('CommerceCX: a real revised RFQ through checked costing, approval and ERP/order handoff; a physically constrained loading case if relevant.','AnjX / Slooze: historical data with declared holdout/assumptions; shortage or supplier change reflected in material, schedule and cash decisions.','Tomax / Adventis: one connected job across machine/operator input, inspection, maintenance and inventory; outage and false-alert behaviour.','Zeliot: actual source protocols and schema changes, throughput/cost estimate, replay/recovery and ownership of custom connectors.','Controlsoft / Connectivity: comparable commissioned project, local response, installation scope, access handling, acceptance and warranty.','RheinBrücke: exact ERP/add-on licences, migration/integration scope, delivery effort, training, support and total cost.'),
 p('Ask for shipped-versus-roadmap status, customer references, API/version documentation and product-specific security evidence. None of these supplier follow-ups were sent during this research.'),
 callout('DECISION','Expand only when the workflow works, people use it, records reconcile, service can support it and the customer accepts the outcome.')
], 'Derived from the observed brochure/public-evidence gaps and the source-level XELOR baseline.')

page('Evidence key and plain-language glossary','Trace the recommendations back to suppliers and the current workspace',[
 p('Research date: 10 September 2026. Repository: xelor-phase-2, commit 13e8ecf (6 September). Source code was inspected read-only; no live factory, external ERP deployment, model benchmark, security audit or customer outcome was verified.'),
 table(['Internal key','Representative source locations'],[
 ['X1 - positioning','README.md:1; apps/web/src/modules/registry.ts:46'],
 ['X2 - commercial/fulfilment','apps/api/src/modules/sales/sales.service.ts:390; apps/api/src/fulfilment/fulfilment.module.ts:20'],
 ['X3 - engineering/planning','apps/api/src/modules/engineering/engineering.service.ts:311; apps/api/src/modules/planning/schedule.service.ts:22; policy.service.ts:136'],
 ['X4 - production/inventory','apps/api/src/modules/production/production.service.ts:415; apps/api/src/modules/inventory/inventory.service.ts:184'],
 ['X5 - factory boundary','apps/api/src/agent-os/factory-intelligence.service.ts:477; packages/platform/src/factory-intelligence/oee.ts:15; docs/01-agent-os/06-factory-connect.md:9'],
 ['X6 - quality/maintenance','apps/api/src/modules/quality/qms-workflow.service.ts:47; apps/api/src/modules/maintenance/maintenance.controller.ts:184'],
 ['X7 - agent controls','apps/api/src/agent-os/agent-control.service.ts:17; agent-authorization.service.ts:17'],
 ['X8 - finance boundary','apps/web/src/modules/working-capital/workspace.tsx:30; apps/api/src/modules/accounts/accounts.service.ts:318'],
 ['X9 - integration','apps/api/src/modules/dataimport/dataimport.service.ts:53; apps/api/src/modules/integration/message.service.ts:108'],
 ['X10 - service boundary','apps/api/src/modules/managed-services/managed-services.service.ts:7; apps/api/src/modules/platform-health/platform-health.service.ts:39']
 ],[112,398]),
 p('Supplier source IDs refer to the linked profile sources in the companion PDF and the detailed research ledgers saved in the research folder. Full internal evidence and limitations are in xelor_baseline.md. The content is a research and product strategy assessment, not a claim that any vendor or AIKYANTRA has delivered every advertised capability.'),
 p('<b>RFQ</b> request for quotation; <b>CPQ</b> configure, price, quote; <b>BOM</b> bill of materials; <b>MRP</b> material requirements planning; <b>APS</b> advanced planning/scheduling; <b>MES</b> shop-floor execution software; <b>WMS</b> warehouse management; <b>QMS</b> quality management; <b>CAPA</b> corrective/preventive action; <b>CMMS</b> maintenance management; <b>OEE</b> availability x performance x quality; <b>EHS</b> environment, health and safety; <b>OT</b> operational technology; <b>IIoT</b> connected industrial devices; <b>AP/AR</b> supplier payables/customer receivables; <b>ECO</b> engineering change order; <b>SPC</b> statistical process control.')
], 'Authored synthesis and recommendations are explicitly separated from supplier claims and repository facts.')

if __name__=='__main__':
 root=Path(__file__).resolve().parent
 (root/'strategy_pages.json').write_text(json.dumps(PAGES,indent=2,ensure_ascii=False),encoding='utf8')
 print(f'Prepared {len(PAGES)} strategy pages')
