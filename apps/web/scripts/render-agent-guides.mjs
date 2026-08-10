import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * THE XELOR AGENT GUIDE SET.
 *
 * Ten PDFs: one master guide and one per agent. Everything on these pages is taken from
 * the implementation — the capability registry, the graph catalogue, the module services,
 * the migrations and the investor-demo gap register — and not from the pitch deck.
 *
 * That distinction is load-bearing. `apps/web/src/spine/registry/departments.ts` carries the
 * deck's voice and claims ECR/ECO change control, finite scheduling and net-change MRP.
 * None of the three exists. Where the deck and the code disagree, THE CODE WINS, and the
 * limits page says so plainly. A guide that flatters the product is worth nothing in a
 * technical due-diligence room, which is the room these are written for.
 *
 * The agent guides use twelve fixed pages and the master uses thirteen. The renderer throws
 * on any page that overflows its A4 box, so content cannot quietly spill onto an unreviewed
 * page.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const htmlDir = resolve(root, "docs/reports/agent-guides");
const pdfDir = resolve(root, "docs/05-deliverables/agent-guides");
const proofDir = resolve(root, "apps/web/test-results/agent-guide-proofs");

const SNAPSHOT = "8 August 2026";

/* ============================================================================
   SYSTEM FACTS — counted from the implementation, not estimated.
   ============================================================================ */
const SYSTEM = {
  agents: 9,
  capabilities: 19,
  graphs: 7,
  modules: 22,
  permissions: 165,
  copilotIntents: 21,
  aiFeatures: 9,
  sideEffecting: 1,
};

/*
 * The product-module catalogue. This is intentionally more operational than the navigation
 * manifests: it joins what a user sees to the records, services, database controls and
 * cross-module hand-offs that make the module useful. `boundary` prevents a screen or seeded
 * scenario from being presented as a completed production capability.
 */
const MODULES = [
  {
    key: "copilot",
    agent: "ONYX",
    name: "ONYX Copilot",
    purpose:
      "A read-only question surface for factory data. It gives a short answer, names the evidence rows and refuses questions outside its closed catalogue.",
    records:
      "21 registered intents; question, outcome, matched intent, row count, sources, correlation id and optional narration result.",
    screens:
      "Ask; Question log. Main API surfaces: /copilot/capabilities, /copilot/ask and /copilot/history.",
    workflow:
      "Rules match the question first; a model may only help choose among known intents. The user's permission is checked, one hand-written query runs in the tenant transaction, a deterministic answer is rendered, optional narration is provenance-checked, and the event is logged.",
    controls:
      "No SQL generation, no write tool, per-intent permission and row cap, unknown-intent refusal, numeric provenance check, deterministic fallback and an auditable refusal path.",
    handoffs:
      "Reads Sales, Purchase, Inventory, Planning, Production, Quality, Maintenance, Accounts and master-data views through fixed queries; it never owns those records.",
    boundary:
      "The 21 questions are live. General conversation and unrestricted business advice are not; external-model narration is off by default.",
  },
  {
    key: "agentos",
    agent: "ONYX",
    name: "Agent OS",
    purpose:
      "Durable coordination for cross-functional decisions: it runs versioned mission graphs, gathers specialist evidence and pauses at human approval gates.",
    records:
      "Agent definitions, capabilities, graph versions and hashes, runs, node attempts, events, checkpoints, approvals, signals, outcomes and governed work items.",
    screens:
      "Decision Commander; Human Approvals; Mission Command. Catalogue, run, signal, approval, action, memory, knowledge-graph and readiness APIs.",
    workflow:
      "Start from a person, signal or risk; freeze the graph and authority context; run all ready nodes in parallel waves; checkpoint each wave; join evidence; let HEXA verify; wait for the named approver; resume; then publish or dispatch only what the graph permits.",
    controls:
      "Fixed tool allow-lists, user-permission intersection, maximum steps and timeouts, bounded retries, content-hashed graphs, resumable checkpoints and engine-enforced approval ancestry for every effect.",
    handoffs:
      "Coordinates all eight specialists. Domain reads still pass through their normal services, and the single effect writes a governed assignment rather than modifying ERP records. ACHILES has no effectful tool.",
    boundary:
      "Seven mission graphs and durable orchestration are live, including factory-flow recovery. Agent language reasoning is deterministic and dispatched work remains work for a person, not proof of completion.",
  },
  {
    key: "aiops",
    agent: "ONYX",
    name: "AI Operations",
    purpose:
      "The control room for AI features: what is registered, which provider may serve it, what it cost, whether it passed evaluation and when a person must review it.",
    records:
      "Feature registry, provider configuration, governance state, tenant opt-outs, budgets, usage/cost events, evaluations, review items, incidents and a hash-chained AI action log.",
    screens:
      "Connectors; Feature registry; Providers; Evaluations; Cost; Human review; Incidents.",
    workflow:
      "A caller names a registered feature; the router checks global and tenant controls, budget and provider policy; the provider or deterministic fallback runs; input/output metadata and cost are logged; evaluation and human feedback determine whether the feature remains eligible.",
    controls:
      "Closed registry, kill switch, tenant opt-out, budget ceiling, no-ship evaluation gate, privacy mode, deterministic fallback and tamper-evident action logging.",
    handoffs:
      "Supplies governance to Copilot and the domain AI features in Employee Spend, Customer Care & Warranty, HR and master data; receives outcomes and edits for later evaluation.",
    boundary:
      "Governance, registry, cost and evaluation plumbing are live. Provider connectivity is not configured in the demo, and some registered features remain unimplemented or lack golden sets.",
  },
  {
    key: "managed-services",
    agent: "RELAY",
    name: "Managed Services",
    purpose:
      "Wraps XELOR in an understandable service lifecycle: design, transition, operate and improve, with one owner for incident clocks, hand-offs and customer communication.",
    records:
      "Service catalogue and outcomes, lifecycle stages, service incidents, severity and update cadence, customer change calendar, service-review evidence, improvement register and a responsibility/boundary matrix.",
    screens:
      "Service Command Centre; Incidents & Escalation; Changes & Releases; Service Reviews; Responsibility Map. API: /managed-services/overview.",
    workflow:
      "Define a supportable service; transition the customer with acceptance evidence; triage events into one service incident; route technical repair to the accountable specialist; maintain the clock and customer update; verify restoration; turn repeat failure into an owned improvement.",
    controls:
      "One accountable owner per responsibility, permission-gated read capability, human approval before a service brief, no specialist remediation privileges, no security determination, no AI-control override and no contractual credit authority.",
    handoffs:
      "HEXA fixes connectors and owns security; ONYX fixes AI operations and coordinates business missions; MICA owns manufactured-product support; KILN owns factory assets; other specialists fix their own domains. RELAY keeps the service timeline and verifies the customer-facing outcome.",
    boundary:
      "The operating model, agent, graph, API and screens are implemented. The data is explicitly illustrative: there is no staffed 24×7 desk, live ITSM integration, active telemetry pipeline or contractual SLA measurement yet.",
  },
  {
    key: "platform-health",
    agent: "ACHILES",
    name: "Private Platform Assurance",
    purpose:
      "Quietly checks whether XELOR's API, tenant database, event queue, public web application and declared AI runtime are responding, then keeps the evidence private.",
    records:
      "Append-only platform-health runs with tenant, trigger, overall status, component results, latency, start/completion time and total duration.",
    screens:
      "Private status. APIs: /platform-health/overview, /platform-health/run and the secret-protected /internal/platform-health/run scheduler endpoint.",
    workflow:
      "Run deterministic probes with four-second timeouts; classify required and optional failures; save the tenant-isolated result; mark evidence stale after 90 minutes; hand failed evidence to RELAY and the technical owner.",
    controls:
      "Internal-only permissions, tenant RLS, append-only storage, one concurrent sweep, no model judgement, no ERP write, no service restart, no customer message and no action-dispatch capability.",
    handoffs:
      "ACHILES detects and records. RELAY coordinates the incident and customer update. HEXA, ONYX or the affected specialist diagnoses and repairs.",
    boundary:
      "The probes, scheduler paths, permissions, screen and durable history are live MVP capability. It is not a production observability stack, paging service, root-cause engine or autonomous remediation system.",
  },
  {
    key: "general",
    agent: "HEXA",
    name: "Organisation",
    purpose:
      "The legal and operating identity of a tenant: companies, registrations, departments and the document-number series shared by business modules.",
    records:
      "Company master, legal name, base currency, GST registrations, registered addresses, departments and financial-year document sequences.",
    screens:
      "Companies; Departments. Company and registration APIs are also used by tax, numbering and agent context.",
    workflow:
      "A tenant defines its company and registrations; operating modules resolve the correct seller identity and state; document services allocate gapless numbers inside the posting transaction.",
    controls:
      "Tenant RLS, typed permissions, unique registration/document constraints and transaction-safe numbering. Tenant identity never comes from a browser-provided header.",
    handoffs:
      "Feeds Sales tax, Purchase receiving, Accounts, statutory filings, module navigation and HEXA/ONYX company-context capabilities.",
    boundary:
      "Company, registration, department and numbering foundations are live; it is not a full legal-entity consolidation or corporate-secretarial product.",
  },
  {
    key: "administration",
    agent: "HEXA",
    name: "Administration",
    purpose:
      "The evidence and access centre for roles, separation of duties, security posture, incidents, privacy requests, audit integrity and licences.",
    records:
      `${SYSTEM.permissions} permission keys, roles and grants, SoD rules/findings, access simulations, CERT-In incident clocks, privacy requests, audit-chain verification/anchors, retention and licence state.`,
    screens:
      "Roles & access; Segregation; Security posture; Incidents; Privacy; Audit; Licence.",
    workflow:
      "Define a role from catalogue permissions; grant it to a user; scan conflicting role pairs; enforce route guards at request time; append sensitive events; periodically re-hash the audit chain; review open statutory clocks and evidence packs.",
    controls:
      "Catalogue trigger blocks unknown permissions, tenant RLS, server-side guards, named SoD rules, append-only audit, chain verification that identifies the break type and CI permission reconciliation.",
    handoffs:
      "Every module consumes identity and permission decisions. Agent OS uses the same authority context; Integration and AI Operations report incidents and evidence into the control view.",
    boundary:
      "Core access, SoD, audit and incident evidence are live. Row/field policy is mainly a preview, and escalation/delegation automation is not complete.",
  },
  {
    key: "integration",
    agent: "HEXA",
    name: "Integration",
    purpose:
      "A governed place to describe external connections, trace messages and handle failures without pretending an unavailable downstream system is healthy.",
    records:
      "Connector and connection definitions, factory edge gateways, industrial asset bindings, state/location events, dwell intervals, governed machine commands, message attempts, dead letters, circuit state, statutory records and webhook deliveries.",
    screens: "Factory Connect; Connections; Flows; Dead letters; Statutory filings; Webhooks.",
    workflow:
      "Preflight a flow, classify each outcome, retry only transient failures, trip a circuit, and quarantine terminal messages. Factory Connect stores idempotent operational-event records and can evaluate one exact, approved, state/expiry-gated command intent in simulator mode.",
    controls:
      "Idempotency/correlation ids, retry classification, circuit breakers, dead-letter custody, HMAC checks on the separate webhook path, tenant RLS and a closed machine-command catalogue that excludes safety override, raw motion and unverified program upload. Factory telemetry ingestion itself is not yet authenticated as a plant gateway.",
    handoffs:
      "Holds business-integration records and submitted factory-event records; gives KILN robot/cell evidence, AXLE material-dwell context, Agent OS the factory-flow recovery view, and Administration the audit trail.",
    boundary:
      "The resilience rules and Factory Connect schema/API/screens are implemented. OPC UA, MQTT, ROS 2, Cisco Spaces and Splunk are catalogue/reserved targets only. The standalone edge simulator contract is not connected to the API, and the API records a simulated policy result without dispatching to or receiving acknowledgement from a controller.",
  },
  {
    key: "sales",
    agent: "MICA",
    name: "Sales",
    purpose:
      "Turns an accepted customer commitment into a controlled order, dispatch and receivable while preserving the tax and credit decision made at each step.",
    records:
      "Customers, ship-to data, GSTINs, sales orders/lines, credit snapshots and overrides, delivery notes, dispatch quantities, invoices and receivables.",
    screens:
      "Orders; Order detail; Customers. The dashboard highlights overdue promises, today-due orders and credit holds from live order data.",
    workflow:
      "Create or detect a duplicate customer; draft an order; calculate GST from supplier/place-of-supply state; confirm through the credit gate; reserve nothing automatically; dispatch only available stock; create delivery, invoice and receivable in the same transaction.",
    controls:
      "Duplicate detection, immutable credit snapshots, mandatory override reason, server-side tax calculation, dispatch refusal on credit/stock gates, idempotency and atomic stock-plus-invoice posting.",
    handoffs:
      "Reads Engineering items and Accounts exposure; asks Inventory to issue stock; hands dated demand to Planning, invoice data to Accounts and fulfilment context to Customer Care & Warranty.",
    boundary:
      "Order-to-dispatch is live. Leads, opportunities, quotations/tenders, order cancellation, reservations and statutory submission are not complete.",
  },
  {
    key: "csp",
    agent: "MICA",
    name: "Customer Care & Warranty",
    purpose:
      "Keeps after-sales product cases, warranty/AMC entitlement, response timing and customer communication together. XELOR technology incidents remain RELAY's responsibility.",
    records:
      "Customer accounts/users, installed base, warranty/AMC entitlement, product cases, comments, response-target pauses/breaches, complaints, spare requests, knowledge articles, reply drafts and customer feedback.",
    screens:
      "Product cases; Product case detail; Spares & warranty; Product care dashboard; Customer feedback, plus separate customer-portal APIs.",
    workflow:
      "Open and classify a product case; calculate its response clock in business hours; check installed-base entitlement; assign and work the case; require staff review before sending; capture complaint, spare and feedback outcomes.",
    controls:
      "Tenant plus customer-account RLS, business-time recomputation, immutable sent comments, entitlement check, portal/staff permission separation and draft rules that refuse unsupported commitments or leaked internal references.",
    handoffs:
      "Uses Sales customer/order context, Inventory spare availability, Quality complaint/NCR context and AI Operations for triage/reply governance; links to RELAY only when a separate XELOR service incident also affects the customer.",
    boundary:
      "Product cases, response clocks, entitlement, portal isolation and reviewable AI suggestions are live; outbound messaging and automatic warranty population are not integrated.",
  },
  {
    key: "purchase",
    agent: "SPAR",
    name: "Purchase",
    purpose:
      "Controls supplier masters, purchase commitments, approval and receipt of material into the stock ledger.",
    records:
      "Vendors, duplicate candidates, purchase orders/lines/status, W1 approval instances and decisions, goods receipts and receipt references.",
    screens:
      "Orders; Vendors; Order detail; Goods receipt. Dashboard evidence comes from the purchase-order register.",
    workflow:
      "Create/check vendor; draft purchase order; submit into the configured approval route; permit only the resolved approver at each step; receive no more than the approved open quantity; post the receipt through Inventory inside the same transaction.",
    controls:
      "Vendor duplicate evidence, permission and idempotency checks, version-pinned approval, named approver refusal, approved-only receipt, over-receipt prevention and atomic receipt/stock posting.",
    handoffs:
      "Receives buy proposals from Planning, consumes Organisation numbering, calls Inventory for receipt, and provides open supply to Planning and working-capital analysis.",
    boundary:
      "Vendor-to-GRN is live. Supplier invoice, three-way match, AP ageing/payment, receipt accruals and supplier performance are not complete.",
  },
  {
    key: "inventory",
    agent: "SPAR",
    name: "Inventory",
    purpose:
      "The single source of truth for physical stock movement and current on-hand balance by item, warehouse and batch.",
    records:
      "Warehouses, append-only stock entries, movement type/reference/idempotency key, signed quantity, batch/expiry details and row-locked stock balances.",
    screens:
      "Stock; Warehouses. Alerts identify stranded batched stock only when the API can prove it.",
    workflow:
      "A domain port asks for a movement; the service validates the request and idempotency key, serialises competing withdrawals, chooses eligible FIFO batches, locks balances, refuses a negative outcome, appends ledger entries and updates balances atomically.",
    controls:
      "One write path, advisory and row locks, negative-stock refusal, append-only trigger, movement/reference traceability, FIFO batch consumption and tenant RLS.",
    handoffs:
      "Purchase receives, Production issues/receives, Sales dispatches, Quality quarantines/releases and Maintenance consumes/returns spares through this same boundary.",
    boundary:
      "On-hand and the movement ledger are live. No bins, reservations, cycle counting, serial genealogy or full valuation; FIFO chooses the batch, while standard cost remains the valuation basis.",
  },
  {
    key: "engineering",
    agent: "AXLE",
    name: "Engineering",
    purpose:
      "Defines the items a factory buys, makes and sells, and the bills of material that explain what a manufactured item consumes.",
    records:
      "Item master, item type/UOM/status, GST classification, planning policy links, BOM headers/versions and component quantities/scrap factors.",
    screens:
      "Items; BOM detail. The current web module is intentionally narrow and mainly exposes the authoritative product structure.",
    workflow:
      "Create and classify an item; create/version a BOM; validate component references and graph shape; publish the product structure for Planning; snapshot it when Production creates an order.",
    controls:
      "Typed permissions, tenant RLS, active/versioned BOM lookup and cycle detection when Planning derives low-level codes.",
    handoffs:
      "Sales selects sellable items, Purchase selects bought items, Planning explodes BOM demand, Production snapshots components and Quality associates specifications/inspections.",
    boundary:
      "Item/BOM foundations are live. There is no ECR/ECO request, impact assessment, approval, effectivity or revision audit workflow.",
  },
  {
    key: "planning",
    agent: "AXLE",
    name: "Planning",
    purpose:
      "Converts dated demand, stock, open supply, product structure and policy into explainable proposals for what to make or buy and when.",
    records:
      "Planning policies, calendars, forecasts, demand/consumption, MPS, immutable MRP runs/workings, planned orders, pegging, exceptions, requisitions, capacity views and draft schedules.",
    screens: "Factory flow; MRP; Planned orders; Exceptions; Demand; Policies; Explain.",
    workflow:
      "Compute low-level codes; consume forecast with nearby orders; net demand bucket by bucket; apply safety stock and lot-sizing; offset over working days; explode components into release buckets; persist workings/pegs; create ranked exceptions; optionally firm or convert a proposal.",
    controls:
      "Cycle refusal, required work calendar, immutable completed-run workings, upward lot rounding, past-due flagging, plan-to-execution uniqueness and explicit exception acceptance/snooze behavior.",
    handoffs:
      "Reads Sales demand, Engineering BOMs, Inventory balances, Purchase open supply and Production state; the Factory flow view adds KILN-owned dwell evidence without giving AXLE machine authority.",
    boundary:
      "MRP, pegging and explainability are live. Capacity is an infinite-capacity report, scheduling is a draft heuristic, and firmed orders do not yet feed the next run reliably.",
  },
  {
    key: "production",
    agent: "KILN",
    name: "Production",
    purpose:
      "Executes a manufactured order through a pinned material list and ordered operations, then moves finished quantity into stock.",
    records:
      "Production orders, BOM/component snapshot, operation sequence/status, operator/evidence notes, issue movements, completion quantity and finished-goods receipt references.",
    screens:
      "Machines & robot cells with an operational map; Production orders; Order detail with component issue, operation progress and completion actions.",
    workflow:
      "Create from a manufactured item/BOM; snapshot components; define/start/complete operations in predecessor order; issue components through Inventory; require all routed work complete; receive finished goods; expose the full execution trail.",
    controls:
      "Idempotency, predecessor gates, accountable operator/evidence, pinned BOM, all-blockers-at-once completion check, tenant RLS and atomic inventory movements.",
    handoffs:
      "Receives make proposals from Planning, consumes Engineering BOM and Inventory components, joins Factory Connect robot/cell evidence, exposes lots to Quality, and reports execution context to Maintenance and Decision Commander.",
    boundary:
      "Order, operation, issue and receipt workflows are live. The robot-cell screen shows stored demo/API-submitted records; no physical controller or plant protocol adapter is connected. The quality completion gate, scrap posting and detailed genealogy/costing remain incomplete.",
  },
  {
    key: "quality",
    agent: "KILN",
    name: "QMS & Audit",
    purpose:
      "Records inspection evidence and turns defects into controlled findings, corrective actions, training and audit-ready evidence packs.",
    records:
      "Specifications and revisions, sampling plans/snapshots, inspections/readings/verdicts, dispositions, findings/NCRs, CAPAs/actions/effectiveness reviews, documents, training, audits and evidence packs.",
    screens:
      "Overview; Inspections; Documents; Audits; Findings; Corrective actions; Training; Evidence packs; Inspection detail.",
    workflow:
      "Select a sampling plan from lot size; snapshot the plan and applied limits; record readings; calculate pass/reject deterministically; quarantine/release through Inventory; open a finding; investigate cause and actions; let a person judge effectiveness; collect and version audit evidence.",
    controls:
      "Immutable applied limits, critical-defect override, sample derivation, disposition/movement linkage, no-delete history, human-owned CAPA effectiveness and draft-only agent outputs.",
    handoffs:
      "Consumes Production or receipt context, moves held stock through Inventory, informs Service complaints, and supplies KILN/HEXA with traceable evidence for QMS missions.",
    boundary:
      "Inspection and NCR/CAPA depth are live. Automatic production/receipt inspection creation, calibration/gauge management and complete material genealogy are missing.",
  },
  {
    key: "maintenance",
    agent: "KILN",
    name: "Maintenance",
    purpose:
      "Keeps assets safe and available through requests, controlled work, downtime history, preventive schedules and reproducible reliability measures.",
    records:
      "Assets/hierarchy/work-centre links, readings, requests, work orders, labour/tasks/safety flags/spares/external work, downtime intervals/corrections/disputes, PM schedules/occurrences and KPI snapshots.",
    screens:
      "Assets; Asset detail; Work orders; Requests; Downtime; Preventive maintenance; KPIs.",
    workflow:
      "Register an asset; receive/acknowledge/triage a floor request; assign and execute a work order with tasks, labour and spares; record asset downtime from stop to handback; close only after gates pass; generate PM work and calculate reliability from source intervals.",
    controls:
      "Database exclusion prevents overlapping downtime, corrections retain original timestamps, completion reports every missing condition, spare issue uses Inventory, and KPI snapshots are marked stale after relevant corrections.",
    handoffs:
      "Links assets to Production work centres, uses Inventory spares, records external-work purchasing context and feeds KILN/Decision Commander with uptime risk.",
    boundary:
      "Core maintenance workflow and KPIs are live. Factory Connect can store bounded operational-event submissions, but does not authenticate them as sensor/controller-originated evidence; predictive models, certified adapters, shift calendars and automatic external procurement are not complete.",
  },
  {
    key: "accounts",
    agent: "RASP",
    name: "Accounts",
    purpose:
      "The accounting source of truth: balanced, posted journal vouchers, a dated trial balance, receivables, receipts and reversal rather than edit.",
    records:
      "Chart of accounts, vouchers/lines, posting date/status/reference, reversal links/reasons, customer receivables and receipt allocations.",
    screens:
      "Trial balance; Vouchers; Voucher detail. Dashboard values name the as-at date and whether pagination caps the visible count.",
    workflow:
      "A domain prepares a balanced voucher; Accounts validates and posts it; a deferred database check re-sums at commit; invoice postings create receivables; receipts settle oldest first; errors are corrected by an opposite voucher linked to the original.",
    controls:
      "Triple balance checks, append-only posted records, one allowed reversal-link update, idempotency, tenant RLS, dated reporting and synchronous posting for transaction-critical domains.",
    handoffs:
      "Receives Sales invoices and Payroll postings; supplies Sales credit exposure, Employee Spend acknowledgements, RASP finance tools and the working-capital starting point.",
    boundary:
      "General ledger, trial balance, receivables and receipts are live. Period close/reopen, payables, bank reconciliation and full financial statements are incomplete.",
  },
  {
    key: "expenditure",
    agent: "RASP",
    name: "Employee Spend",
    purpose:
      "Controls employee and indirect spend before money leaves by reserving budget at request time and preserving policy, tax and receipt evidence.",
    records:
      "Budgets and signed reservation movements, travel requests, claims/lines, attachments/extraction decisions, advances/refunds, indirect expenses, posting queue, duplicate/AI reports, TDS and ITC registers.",
    screens:
      "Claims; Claim detail. The API also covers budgets, receipts, advances, travel, indirect expense, posting and tax reports.",
    workflow:
      "Check budget under a row lock; create claim/travel/expense; attach and optionally extract a receipt; submit to reserve in-approval budget; approve/reject with policy evidence; move reservation to committed/actual through signed rows; prepare an accounting posting.",
    controls:
      "Atomic reservation ledger, no silent unbudgeted approval, mandatory override reason, duplicate receipt checks, human confirmation of extraction, input-credit and withholding gates, idempotency and approval separation.",
    handoffs:
      "Uses People identity/grade, Organisation financial year, AI Operations for receipt extraction, and is designed to post to Accounts after acknowledgement.",
    boundary:
      "Budget, claim, receipt and policy controls are live. Prepared spend postings are not yet wired end-to-end to the ledger, and cost-centre vocabularies need alignment.",
  },
  {
    key: "hrm",
    agent: "RASP",
    name: "People",
    purpose:
      "Connects accountable employees, attendance and statutory payroll to the work and money records they create.",
    records:
      "Employees, employment/grade/bank/statutory identifiers, punch events, attendance muster and regularisation, leave, payroll runs/payslips, dated statutory rates and posting references.",
    screens: "Employees; Employee detail; Muster; Leave; Statutory.",
    workflow:
      "Capture punches; derive attendance days; hold incomplete days for regularisation; append corrections and replay the day; calculate deemed wages and dated EPF/ESI/professional-tax/withholding; keep preparer and approver separate; post payroll to Accounts in one transaction.",
    controls:
      "Append-only punch correction, no one-punch-as-present shortcut, dated statutory tables, fail-loudly on missing rates, separation of payroll duties, encrypted sensitive fields and synchronous ledger posting.",
    handoffs:
      "Supplies accountable people to workflow, Maintenance, Production and Spend; sends approved payroll postings to Accounts and workforce evidence to RASP.",
    boundary:
      "Employee, attendance and payroll foundations are live. Recruitment, performance, learning depth, biometric-device transport and broader HR lifecycle are not complete.",
  },
  {
    key: "working-capital",
    agent: "RASP",
    name: "Working Capital",
    purpose:
      "A decision workspace that explains cash coming in/out, stock cash, margins, a 13-week outlook, scenarios and finance-readiness evidence in simple language.",
    records:
      "Current screen models for priorities, scenario cards and evidence gaps; live cash-position evidence comes from posted Accounts data and Agent OS capability outputs.",
    screens:
      "Overview; Money in; Money out; Stock holding cash; Margins; 13-week forecast; Scenarios; Finance readiness pack.",
    workflow:
      "Start from posted ledger evidence; bring in customer commitments and stock holding; label assumptions; compare bounded scenarios; prioritise human follow-up; draft an evidence manifest; route the brief through HEXA verification and a human gate.",
    controls:
      "Read/simulate/analyse/draft modes only, no payment or posting capability, source and assumption labelling, human approval in the mission and an explicit boundary note on every tool result.",
    handoffs:
      "Combines Accounts, MICA sales commitments and SPAR stock evidence; publishes a review brief and governed finance work item through Agent OS.",
    boundary:
      "The cash-position read and governed mission are live. Most workspace numbers and three finance tools are illustrative/evidence wrappers, not a complete forecasting, collections or lender-pack engine.",
  },
];

/* The seven registered mission graphs, exactly as `GraphRegistryService` builds them. */
const GRAPHS = [
  {
    key: "factory.flow-recovery",
    name: "Factory flow recovery",
    nodes: 18,
    maxSteps: 24,
    timeout: "300s",
    dispatches: 0,
    shape:
      "KILN reads stored robot and dwell evidence while MICA, SPAR, AXLE and RASP read business consequences; specialists assess; HEXA checks the declared boundary; a production supervisor approves the proposed simulator request; ONYX publishes a brief. The graph has no dispatch node and never contacts a controller.",
  },
  {
    key: "foundation.cross-functional-readiness",
    name: "Cross-functional readiness review",
    nodes: 9,
    maxSteps: 14,
    timeout: "300s",
    dispatches: 0,
    shape:
      "ONYX frames it · MICA and SPAR read in parallel · both assess · join · HEXA verifies · human approves · ONYX synthesises.",
  },
  {
    key: "operations.full-command-review",
    name: "Nine-agent operating review",
    nodes: 21,
    maxSteps: 29,
    timeout: "300s",
    dispatches: 0,
    shape:
      "All eight specialists read their own evidence at once, each assesses, ONYX joins, HEXA verifies four checks, a human approves, ONYX issues the brief.",
  },
  {
    key: "operations.controlled-action-mission",
    name: "Nine-agent controlled action mission",
    nodes: 31,
    maxSteps: 39,
    timeout: "600s",
    dispatches: 7,
    shape:
      "The read-propose-verify-approve-dispatch-verify contract. Eight reads and recommendations, one plan, a preflight, ONE human gate, then six domain work items plus one RELAY service-coordination item and an outcome check. ACHILES remains read-only.",
  },
  {
    key: "finance.working-capital-review",
    name: "Working Capital Review",
    nodes: 9,
    maxSteps: 18,
    timeout: "300s",
    dispatches: 0,
    shape:
      "RASP reads the trial balance, MICA the commitments, SPAR the stock holding; RASP simulates 13 weeks; HEXA verifies; a human approves the brief.",
  },
  {
    key: "quality.qms-audit-readiness",
    name: "QMS & Audit Readiness",
    nodes: 8,
    maxSteps: 18,
    timeout: "300s",
    dispatches: 0,
    shape:
      "KILN reads inspections, collects evidence and drafts a pack; HEXA checks traceability; the quality owner approves; ONYX publishes gaps and owners.",
  },
  {
    key: "managed-services.assurance-review",
    name: "Managed Service Assurance Review",
    nodes: 6,
    maxSteps: 12,
    timeout: "180s",
    dispatches: 0,
    shape:
      "ONYX frames the customer outcome; RELAY reads and assesses service assurance; HEXA verifies evidence and ownership boundaries; a service owner approves; RELAY publishes the brief.",
  },
];

/* ============================================================================
   THE AGENTS.
   ============================================================================ */
const agents = [
  /* ------------------------------------------------------------------ ONYX */
  {
    id: "onyx",
    name: "ONYX",
    label: "Supervisor",
    colour: "#7758e8",
    pale: "#f0edff",
    tagline: "The mission coordinator",
    summary:
      "Turns a business goal into a bounded plan, assigns the right specialists, joins their evidence and presents one understandable result.",
    owns: [
      [
        "ONYX Copilot",
        "Where a person asks a question in plain words. 21 registered questions, each declaring its own permission.",
      ],
      [
        "Agent OS",
        "The run engine: mission graphs, parallel waves, checkpoints, approval waits and recovery.",
      ],
      [
        "AI Operations",
        "The closed feature registry, the provider router, evaluations, the cost ledger and the kill switch.",
      ],
    ],
    moduleKeys: ["copilot", "agentos", "aiops"],
    coordination:
      "Copilot handles one bounded question; Agent OS handles a cross-functional mission; AI Operations governs any model-assisted feature. They share identity, permissions, logging and refusal rules, but they do not share a hidden general-purpose action channel.",
    prefixes: ["agent.", "workflow.", "general."],
    delegates: ["HEXA", "MICA", "SPAR", "AXLE", "KILN", "RASP", "RELAY", "ACHILES"],
    tools: [
      [
        "general.companies.read",
        "Read",
        "Company masters",
        "general.company.read",
        "No",
      ],
    ],
    extraSurface: `
      <h3 style="margin-top:14px">The Copilot's separate surface — 21 questions, and no twenty-second</h3>
      <p style="font-size:10.8px">A mission is not the only way in. The Copilot answers a fixed list of questions, each tied to one hand-written query and one permission. Anything outside the list is refused rather than improvised.</p>
      <table><thead><tr><th>Area</th><th>Questions</th><th>Examples of what can be asked</th></tr></thead><tbody>
        <tr><td>Planning</td><td>4</td><td>What to buy, what to make, what is past due, where the shortages are</td></tr>
        <tr><td>Stock</td><td>3</td><td>On hand, by warehouse, recent movements</td></tr>
        <tr><td>Sales</td><td>3</td><td>Open orders, one order's status, what is due soon</td></tr>
        <tr><td>Purchase</td><td>3</td><td>Open orders, one order's status, what is awaiting receipt</td></tr>
        <tr><td>Master data</td><td>3</td><td>Find an item, a vendor or a customer</td></tr>
        <tr><td>Production</td><td>2</td><td>Open orders, one order's status</td></tr>
        <tr><td>Quality · Maintenance · Accounts</td><td>3</td><td>Pending inspections, open work orders, what is outstanding</td></tr>
      </tbody></table>`,
    receives: [
      "A goal, a Decision Commander risk or an ERP signal",
      "Evidence returned by every specialist",
      "HEXA's verification result",
      "The human approval decision",
    ],
    produces: [
      "A scoped, versioned mission run",
      "A joined evidence pack",
      "A coordinated plan",
      "A final outcome naming its own limits",
    ],
    pipelineLead:
      "ONYX has two surfaces. The Copilot answers one question from one module. Agent OS runs a mission across many. Both refuse in the same way: there is no endpoint that takes free text and runs it.",
    pipeline: [
      [
        "Understand",
        "Rules first. A model is asked only when the rules cannot decide, and its answer is checked against the closed list of 21 intents before it counts.",
      ],
      [
        "Authorise",
        "The matched question declares a permission and the asker must hold it — the same check the equivalent screen makes, so the Copilot is never a side door.",
      ],
      [
        "Retrieve",
        "One hand-written SELECT, on the caller's own transaction, under the caller's own tenant. The model is not in this step and cannot reach it.",
      ],
      [
        "Render",
        "From a template. Numbers on screen are numbers from the rows.",
      ],
      [
        "Narrate",
        "Optional and OFF by default. A model may re-word the answer and is held to numeric provenance; if it fails, the plain answer is shown.",
      ],
      [
        "Log",
        "Every question, answered or refused, with what it read and how many rows.",
      ],
    ],
    rules: [
      [
        "The coordinator is the least powerful agent",
        "ONYX holds one read capability and is NOT on the allow-list for agent.action.dispatch. It can convene the mission; it cannot act in the business.",
      ],
      [
        "The registry is closed",
        "A call for an AI feature key outside the registered set is rejected at the router with AI_FEATURE_NOT_REGISTERED before a token is spent.",
      ],
      [
        "Refusal is auditable",
        "A governance refusal is itself logged to the hash-chained AI action log, then fails closed so the caller drops to its deterministic mode.",
      ],
      [
        "Narration cannot invent a number",
        "Every digit in a narrated answer must trace to a retrieved row, or the template answer is shown instead.",
      ],
    ],
    example: {
      title: "“Should we ship the twelve held pumps anyway to make the date?”",
      steps: [
        "The Copilot refuses. This is not a judgement the model got right — there is no endpoint that takes a question and runs it, none that takes SQL, and none that writes. The read-only promise is kept by there being nothing to call.",
        "Asked instead for what it does hold — “how much PMP-PX400 do we have” — it answers from stock_balance, item and warehouse, and cites all three.",
        "For the cross-functional version of the question, ONYX starts a mission instead: the relevant specialists read their own evidence in parallel, HEXA verifies, a person approves, and only then is a brief published.",
      ],
    },
    live: [
      "21 permission-checked Copilot questions",
      "7 registered mission graphs",
      "Parallel waves, checkpoints and recovery",
      "Signal and Decision Commander mission triggers",
      "Closed AI registry with kill switch and cost ledger",
    ],
    limits: [
      "Language reasoning is deterministic; no external model API is active",
      "ONYX cannot dispatch an action — it is not on the allow-list",
      "Narration is off by default",
      "The Copilot answers 21 questions, not any question",
    ],
    sources: [
      "apps/api/src/agent-os/agent-graph.engine.ts",
      "apps/api/src/modules/copilot/copilot.service.ts",
      "packages/platform/src/ai/feature-registry.ts",
    ],
  },

  /* ------------------------------------------------------------------ HEXA */
  {
    id: "hexa",
    name: "HEXA",
    label: "Governance",
    colour: "#2876d2",
    pale: "#eaf4ff",
    tagline: "The control and trust layer",
    summary:
      "Holds identity, tenant isolation, permissions, approvals and the tamper-evident record, so every mission stays inside the authority of the person who started it.",
    owns: [
      [
        "Organisation & master data",
        "Companies, registrations and the numbering series every document draws from.",
      ],
      [
        "Administration",
        `${SYSTEM.permissions} permissions, roles, separation of duties, factory-command authority, audit verification and the auditor pack.`,
      ],
      [
        "Integration",
        "Retry classification, circuit breakers, dead-letter triage and signed webhooks.",
      ],
    ],
    moduleKeys: ["general", "administration", "integration"],
    coordination:
      "Organisation supplies the legal and numbering context, Administration decides who may do what and proves the trail, and Integration carries external failures as explicit state. Together they are the control plane used by every business module and every agent run.",
    prefixes: ["agent.", "workflow.", "governance.", "general."],
    delegates: [],
    tools: [
      [
        "general.companies.read",
        "Read",
        "Company masters",
        "general.company.read",
        "No",
      ],
      [
        "agent.action.dispatch",
        "Execute",
        "Governed work item",
        "agentos.run.operate",
        "Yes",
      ],
    ],
    receives: [
      "A verified token",
      "The requested capability and permission",
      "The proposed action plan",
      "The recorded human decision",
    ],
    produces: [
      "Allow or refuse, with the evidence",
      "Preflight and post-execution verification",
      "An approval requirement",
      "A hash-chained, append-only trail",
    ],
    pipelineLead:
      "Four independent gates stand between a request and a row. Each is enforced by machinery rather than by wording, and three of the four are checked by CI on every build.",
    pipeline: [
      [
        "Identity",
        "The tenant comes from a signature-verified Keycloak token's groups claim — never a request header. A proxy header is exactly the attack CVE-2025-29927 describes.",
      ],
      [
        "Tenant fence",
        "withTenant() opens the transaction and sets app.current_tenant transaction-locally. Every tenant table has FORCE RLS; an unset tenant resolves to NULL and matches nothing.",
      ],
      [
        "Permission",
        `${SYSTEM.permissions} keys shaped module.entity.action, typed at compile time. A permission that is not in the catalogue cannot even be granted — a trigger refuses the insert.`,
      ],
      [
        "Approval",
        "W1 resolves the approver from data — a named user or a role — and refuses anyone else by name with 403. The definition version is pinned, so publishing v2 never rewrites an approval in flight.",
      ],
      [
        "Record",
        "Each audit row is sha256(previous hash + the canonicalised entry), sequenced per tenant. The append-only trigger fires for the schema owner too.",
      ],
    ],
    rules: [
      [
        "app_user owns nothing and cannot bypass RLS",
        "The API connects as a NOBYPASSRLS role that owns no table, so FORCE RLS is a real backstop rather than decoration.",
      ],
      [
        "The chain names how it broke",
        "Verification distinguishes a deleted row (sequence gap), a replaced row (link mismatch) and an edited row (hash mismatch) — and stores the verdict, because “we verify nightly” is a claim and a dated row is evidence.",
      ],
      [
        "Ledger-critical writes never ride the bus",
        "Stock, journals and budget commit synchronously in the caller's transaction. The outbox carries side effects only.",
      ],
      [
        "CI enforces the fence",
        `db:rls-check asserts FORCE RLS and that a policy really keys on app.current_tenant; a two-tenant leak probe proves it live; perm-check reconciles all ${SYSTEM.permissions} permissions against the registry.`,
      ],
    ],
    example: {
      title: "Can this persona open another department?",
      steps: [
        "Signed in as mica.commercial, the other six accountable departments are visibly shut — shown and dimmed, not hidden, because pretending they do not exist would redraw the company.",
        "Typing /department/SPAR into the address bar does not help. The SERVER refuses: the same token asking the API for another department's data gets 403, resolved from grants in tenant-fenced tables.",
        "Nothing in between could be edited in a browser's developer tools, because nothing in between is making the decision.",
      ],
    },
    live: [
      "FORCE RLS on every tenant table, CI-verified",
      `${SYSTEM.permissions} typed permissions with a catalogue trigger`,
      "W1 approvals with a hash-chained trail",
      "Audit verification, anchoring and the auditor pack",
      "Circuit breakers, DLQ triage and signed webhooks as pure, tested logic",
    ],
    limits: [
      "Inactive users, roles and grants are filtered by the runtime guard as well as the access simulator",
      "W1 has no cancel, no delegation and no escalation; the SLA is a pull query with no timer",
      "Row-scope and field masking are reachable only through the access preview, not applied by list endpoints",
      "No live external or OT transport is wired: webhook/Factory paths store or evaluate local records, while vendor and plant adapters remain catalogue/reserved work",
    ],
    sources: [
      "apps/api/src/common/tenant.middleware.ts",
      "packages/platform/src/audit/hash-chain.ts",
      "apps/api/src/modules/workflow/w1.service.ts",
    ],
  },

  /* ------------------------------------------------------------------ MICA */
  {
    id: "mica",
    name: "MICA",
    label: "Sales & Product Care",
    colour: "#d94b77",
    pale: "#fff0f5",
    tagline: "The customer commitment specialist",
    summary:
      "Explains what a customer ordered, what was promised, what has shipped, and which manufactured-product warranty or after-sales obligation remains open.",
    owns: [
      [
        "Sales",
        "Customers, GST-aware orders, the credit gate, dispatch and the invoice it raises.",
      ],
      [
        "Customer Care & Warranty",
        "Product cases isolated by customer account, a business-time response clock, warranty and AMC entitlement, and reviewable reply drafts.",
      ],
    ],
    moduleKeys: ["sales", "csp"],
    coordination:
      "Sales records what was promised and fulfilled; Customer Care & Warranty records what happened to the manufactured product after delivery. MICA links the same customer, order, installed base and quality evidence. RELAY separately owns operational incidents with XELOR itself.",
    prefixes: ["sales.", "customer.", "agent."],
    delegates: [],
    tools: [
      ["sales.orders.read", "Read", "Sales orders", "sales.order.read", "No"],
      [
        "agent.action.dispatch",
        "Execute",
        "Governed work item",
        "agentos.run.operate",
        "Yes",
      ],
    ],
    receives: [
      "Customer orders and requested dates",
      "Credit exposure and dispatch state",
      "Product-case, response-target and entitlement state",
      "Supply, plan and quality answers from peers",
    ],
    produces: [
      "What is actually committed",
      "Where a promise is at risk, and why",
      "A commercial follow-up work item",
      "A clear line between promised and not yet promised",
    ],
    pipelineLead:
      "The sales pipeline starts at the order. There is no lead, no opportunity and no quotation — by the time XELOR sees a customer, somebody has already decided to buy.",
    pipeline: [
      [
        "Customer",
        "Created against a duplicate check; a suspected duplicate returns 409 with the evidence rather than a silent second record. Carries a credit limit and credit days.",
      ],
      [
        "Order (draft)",
        "Tax is decided, not chosen: the supplier and place-of-supply GSTINs give the state codes, and one inter-state test drives IGST or CGST+SGST for every line.",
      ],
      [
        "Confirm — the credit gate",
        "Exposure = receivables outstanding + other confirmed orders. Over the limit does NOT throw; it sets credit_hold. An override needs a written reason, and the database refuses an override without one.",
      ],
      [
        "Dispatch",
        "Here the hold bites. Four gates plus stock: a short balance aborts the whole dispatch in the same transaction, including the invoice.",
      ],
      [
        "Invoice",
        "Raised through the Accounts port inside that same transaction. Tax is recomputed for the shipped subset only; Accounts records what Sales calculated and never recalculates it.",
      ],
      [
        "Product care",
        "A product case runs a business-time response clock — Mon–Sat 09:00–18:00 — re-derived from pause intervals, never accumulated into a column.",
      ],
    ],
    rules: [
      [
        "The credit gate stops the goods, not the paperwork",
        "Failing the check sets credit_hold and lets the order exist. Dispatch is what refuses — which is where the money actually leaves.",
      ],
      [
        "A portal row is fenced twice",
        "Fourteen CSP tables carry a RESTRICTIVE policy on customer_account_id as well as tenant_id, and a staff session writes the setting to empty on every transaction so a pooled connection cannot carry the last request's customer.",
      ],
      [
        "A draft cannot promise anything",
        "Reply drafting is refused for commitments, liability admissions, leaked NCR or CAPA numbers, coverage claims with no entitlement check, and any number not already in the thread.",
      ],
      [
        "A sent reply is frozen",
        "An AI draft is a comment that is structurally forbidden a sent timestamp. Sending rewrites the author to staff; a trigger then freezes the body, and comments are never deleted.",
      ],
    ],
    example: {
      title: "The Northstar order, and a control that fires",
      steps: [
        "SO-2627-00004 — 120 PX-400 at ₹52,500, customer reference NPS/PO/10482. Gujarat, so IGST rather than CGST+SGST: the system worked that out from the two GSTINs and nobody chose it.",
        "₹74.34 lakh against a ₹45 lakh limit put the order on credit_hold. It is now override, and the reason is ON the order — eleven of eleven invoices paid within terms, an MD-approved temporary limit, a board note reference.",
        "Later the customer reports a seal weep on TKT-2627-00015. The AI proposed a category and a person accepted it; the AI drafted a reply and a person edited and sent it. The proposal and the acceptance are two separate recorded acts.",
      ],
    },
    live: [
      "GST place-of-supply and the tax split",
      "The credit gate with snapshotted limit and exposure",
      "Dispatch, delivery notes and the invoice",
      "Business-time product response target, warranty and AMC entitlement",
      "Triage and reply drafting as suggestions only",
    ],
    limits: [
      "No lead, opportunity, quotation or tender — the largest commercial gap",
      "No order cancellation path, though the status exists",
      "No quality gate on dispatch, and no e-way bill or e-invoice submission from Sales",
      "Nothing writes warranty rows — they exist only from seed data",
    ],
    sources: [
      "apps/api/src/modules/sales/sales.service.ts",
      "packages/platform/src/tax/gst.ts",
      "packages/platform/src/csp/business-time.ts",
    ],
  },

  /* ------------------------------------------------------------------ SPAR */
  {
    id: "spar",
    name: "SPAR",
    label: "Supply",
    colour: "#c77b13",
    pale: "#fff7e8",
    tagline: "The material availability specialist",
    summary:
      "Explains what stock exists, what has been ordered from suppliers, and where a shortage threatens a plan or a promise.",
    owns: [
      [
        "Purchase",
        "Vendors, approval-bound purchase orders and goods receipts.",
      ],
      [
        "Inventory",
        "Warehouses, balances, and the append-only movement ledger behind the single stock write path.",
      ],
    ],
    moduleKeys: ["purchase", "inventory"],
    coordination:
      "Purchase creates an approved supply commitment; Inventory records the physical consequence. A receipt is useful only when both succeed in one transaction, and downstream modules move stock through Inventory rather than maintaining their own balances.",
    prefixes: ["inventory.", "purchase.", "supplier.", "agent."],
    delegates: [],
    tools: [
      [
        "inventory.on-hand.read",
        "Read",
        "Stock on hand",
        "inventory.stock.read",
        "No",
      ],
      [
        "agent.action.dispatch",
        "Execute",
        "Governed work item",
        "agentos.run.operate",
        "Yes",
      ],
    ],
    receives: [
      "On-hand balances by item and warehouse",
      "Open purchase orders and receipts",
      "Material requirements from AXLE",
      "Component demand from KILN",
    ],
    produces: [
      "What is actually available",
      "Where the shortage is, and whose order it threatens",
      "A procurement or stores work item",
      "Traceable references back to the ledger",
    ],
    pipelineLead:
      "SPAR owns the one thing every other module depends on and none of them may touch: the stock ledger. Five modules move stock, and all five go through one door.",
    pipeline: [
      [
        "Vendor",
        "Created against the same duplicate brain Sales uses — exact code, exact GSTIN, or a trigram name similarity above 0.3 returns 409 with the candidates.",
      ],
      [
        "Purchase order",
        "Created as a draft, then submitted into W1. The seeded route is two steps: stores review, then admin sign-off. Signing as the wrong one is refused by name.",
      ],
      [
        "Goods receipt",
        "Only an approved order can be received, and never beyond what remains. The receipt and its stock movement are ONE transaction — stock posts first, so a shortage rolls the whole document back.",
      ],
      [
        "The single write path",
        "POST /stock/entries, permission inventory.stock.post, Idempotency-Key required. Purchase, Production, Sales, Quality and Maintenance all reach it through a port; none imports Inventory.",
      ],
      [
        "The ledger",
        "Every movement is appended and signed by quantity. Balances are updated under a row lock, and a negative result is refused rather than recorded.",
      ],
    ],
    rules: [
      [
        "Stock cannot go negative",
        "The balance row is locked FOR UPDATE, the delta applied, and a result below zero refused with INSUFFICIENT_STOCK naming what was available.",
      ],
      [
        "Withdrawals for one item and warehouse are serialised",
        "An advisory lock is taken before batches are even chosen, so two concurrent issues cannot both plan against the same lot.",
      ],
      [
        "The ledger is append-only",
        "A trigger refuses UPDATE and DELETE and the grants are revoked — for the schema owner as well. This is why the demo rebuilds rather than deletes.",
      ],
      [
        "Three independent walls, not one",
        "ESLint boundaries fail the build on a cross-module import, the port is a symbol with no concrete class behind it, and the ledger is append-only in the database.",
      ],
    ],
    example: {
      title: "Buying the metal, two signatures at a time",
      steps: [
        "PO-2627-00003 — 750 kg of SS 316L bright bar from Meridian Metals at ₹2,88,750. The remarks carry the award: Meridian at ₹385/kg against Atlas Alloys at ₹394/kg.",
        "Two different people signed it. The stores in-charge reviewed, the administrator approved, and the trail is hash-chained per instance.",
        "The receipt landed the heat in Pune Stores. After the first tranche was machined, 485 kg of the 750 is still there — and the ledger says exactly where the rest went.",
      ],
    },
    live: [
      "The single stock write path with FIFO batch consumption",
      "Append-only ledger with row-locked balances",
      "Vendor duplicate detection",
      "Two-step purchase approval through W1",
      "Gapless per-financial-year document numbering",
    ],
    limits: [
      "The cycle stops at the receipt — no supplier invoice, no three-way match, no payment, no ageing for direct material",
      "A goods receipt posts stock but raises no accrual journal",
      "Valuation is standard cost only; FIFO governs which batch moves, not what it is worth",
      "No bins below warehouse, no serial tracking, no reservations, no cycle count",
    ],
    sources: [
      "apps/api/src/modules/inventory/inventory.service.ts",
      "apps/api/src/ports/stock.port.ts",
      "apps/api/src/modules/purchase/purchase.service.ts",
    ],
  },

  /* ------------------------------------------------------------------ AXLE */
  {
    id: "axle",
    name: "AXLE",
    label: "Planning",
    colour: "#5365d9",
    pale: "#eef0ff",
    tagline: "The product and plan specialist",
    summary:
      "Connects what the product is made of with what demand requires, then says what to make, what to buy, by when — and which dates cannot be met.",
    owns: [
      [
        "Engineering",
        "The item master and bills of material. Four endpoints in total, and no change control.",
      ],
      [
        "Planning",
        "Forecast, MPS, MRP, planned orders, exceptions, a capacity load report and a draft schedule.",
      ],
    ],
    moduleKeys: ["engineering", "planning"],
    coordination:
      "Engineering defines what a product is; Planning applies demand, stock, supply, calendars and policy to decide what must happen by date. Production receives proposals and a pinned structure, so later master-data changes cannot rewrite work already released.",
    prefixes: ["engineering.", "planning.", "agent."],
    delegates: [],
    tools: [
      [
        "planning.planned-orders.read",
        "Read",
        "Planned orders",
        "planning.mrp.read",
        "No",
      ],
      [
        "agent.action.dispatch",
        "Execute",
        "Governed work item",
        "agentos.run.operate",
        "Yes",
      ],
    ],
    receives: [
      "Dated customer demand from MICA",
      "The BOM graph and item policies",
      "Stock and open supply from SPAR",
      "Execution reality from KILN",
    ],
    produces: [
      "Planned orders with their full arithmetic",
      "Exceptions ranked by consequence",
      "A planning work item",
      "A traceable line from demand to proposal",
    ],
    pipelineLead:
      "One MRP run, eight steps. It is a pure function: the service gathers inputs through ports, calls the engine, and stores the answer WITH its working — because the question asked in November is always “why did we buy fifty castings in July?”",
    pipeline: [
      [
        "Levels first",
        "Low-level codes are derived by topological sort. An item netted at the wrong level is netted before its demand exists. A cycle is refused outright, naming the loop in item codes rather than database ids.",
      ],
      [
        "The calendar",
        "Every lead time is offset over a working-day calendar — Mon–Sat by default. No calendar, no run: a two-week lead time quoted by a foundry means twelve working days, not fourteen.",
      ],
      [
        "Demand",
        "Per bucket, demand = max(forecast, orders), after an order has consumed the forecast nearest to it in time. A line with no requested date lands in the FIRST bucket with a warning, because burying it at the end of the horizon would hide it.",
      ],
      [
        "Netting",
        "Item by item, up the levels: Net = Gross − Scheduled − Available(t−1) + Safety Stock. Safety stock is a floor the plan refuses to eat into, not a buffer it may borrow from.",
      ],
      [
        "Lot sizing",
        "Six rules, and every one of them rounds UP. A rule that can return less than the shortfall has quietly turned a sizing policy into a stockout.",
      ],
      [
        "Offsetting",
        "The release date is walked backwards over working days. A date already in the past is clamped to today and FLAGGED — never back-dated, because a planned order dated last Tuesday is a lie that makes the horizon look feasible.",
      ],
      [
        "Explosion",
        "Components land in the parent's RELEASE bucket, not its receipt bucket — they are needed when it starts, not when it finishes. Scrap is a gross-up rather than a markup: 5% scrap divides by 0.95, it does not multiply by 1.05.",
      ],
    ],
    rules: [
      [
        "A completed run is immutable",
        "The per-bucket arithmetic is the answer to why something was bought. Triggers refuse UPDATE and DELETE on the workings, and a completed run cannot be reopened — make a new one.",
      ],
      [
        "A plan cannot be ordered twice",
        "A unique index ties one planned order to one execution document. The application check is only the friendly error; the database is what actually prevents it.",
      ],
      [
        "MRP and reorder point cannot both hold an item",
        "A CHECK constraint forbids it outright — it is the commonest silent source of excess inventory.",
      ],
      [
        "Accepting an exception does not perform it",
        "The reply is literally “do that next; accepting did not do it for you”. A snooze without a date is a dismissal wearing a friendlier word, and is refused.",
      ],
    ],
    example: {
      title: "What the plan says has to happen",
      steps: [
        "PMP-PX400 is an impeller, a shaft, a casing, two cartridge seals and sixteen bolts — and the impeller and shaft have their own BOMs underneath, so the explosion runs two levels deep.",
        "120 pumps pull roughly 707 kg of 316L through those two levels. The bar has a sixteen-working-day lead time and a 250 kg minimum, which is why the exception exists at all.",
        "The run shows its work per bucket, in words: “120 wanted − 40 already coming − 15 on hand + 10 safety stock = 75 short.” A planner accepted one exception with a note that Meridian confirmed the balance heat.",
      ],
    },
    live: [
      "Multi-level netting with pegging back to the originating order",
      "Low-level codes and cycle detection",
      "Six lot-sizing rules and working-day offsetting",
      "Seven exception types ranked by consequence",
      "Immutable run workings and an explain-in-words view",
      "Factory flow view links dwell exceptions to planning consequence without granting machine authority",
    ],
    limits: [
      "No ECR/ECO change control — a BOM records the result of a change, never the change",
      "MRP is infinite-capacity; the capacity pass is a report that changes nothing",
      "Finite scheduling is a labelled heuristic and always lands as a draft — it never publishes itself",
      "Firming a planned order does not yet feed it back into the next run",
    ],
    sources: [
      "packages/platform/src/planning/netting.ts",
      "apps/api/src/modules/planning/mrp.service.ts",
      "packages/platform/src/planning/exceptions.ts",
      "apps/web/src/modules/planning/screens/factory-flow.tsx",
    ],
  },

  /* ------------------------------------------------------------------ KILN */
  {
    id: "kiln",
    name: "KILN",
    label: "Operations & Quality",
    colour: "#168e87",
    pale: "#e9fbf8",
    tagline: "The execution, quality and uptime specialist",
    summary:
      "Explains what the plant is making, whether it passes inspection, and whether the machines will still be there tomorrow.",
    owns: [
      [
        "Production",
        "Orders, a snapshotted component list, operations with predecessor gating, issue and finished-goods receipt.",
      ],
      [
        "Quality & QMS",
        "Sampling, readings, lot verdicts, dispositions, and the NCR → CAPA chain.",
      ],
      [
        "Maintenance",
        "Assets, work orders, the downtime clock, preventive schedules and reliability KPIs.",
      ],
    ],
    moduleKeys: ["production", "quality", "maintenance"],
    coordination:
      "Production records the work, Quality decides whether the result is acceptable, and Maintenance explains whether the equipment can sustain the plan. Inventory movements are shared evidence, while quality and downtime conclusions remain deterministic and human-accountable.",
    prefixes: ["production.", "quality.", "maintenance.", "agent."],
    delegates: [],
    tools: [
      [
        "production.factory-connect.read",
        "Read",
        "Robot, AMR, gateway and material-dwell evidence",
        "factory.connect.read",
        "No",
      ],
      [
        "production.orders.read",
        "Read",
        "Production orders",
        "production.order.read",
        "No",
      ],
      [
        "quality.inspections.read",
        "Read",
        "Inspection evidence",
        "quality.inspection.read",
        "No",
      ],
      [
        "quality.evidence.collect",
        "Analyse",
        "Evidence view",
        "quality.inspection.read",
        "No",
      ],
      [
        "quality.audit-plan.draft",
        "Draft",
        "Audit checklist",
        "quality.inspection.read",
        "No",
      ],
      [
        "quality.capa-plan.draft",
        "Draft",
        "Investigation draft",
        "quality.inspection.read",
        "No",
      ],
      [
        "quality.audit-pack.draft",
        "Draft",
        "Evidence manifest",
        "quality.inspection.read",
        "No",
      ],
      [
        "agent.action.dispatch",
        "Execute",
        "Governed work item",
        "agentos.run.operate",
        "Yes",
      ],
    ],
    receives: [
      "What the plan says to make",
      "Whether components can be issued",
      "Readings, verdicts and dispositions",
      "Downtime and preventive-maintenance signals",
      "Stored robot, AMR and material-dwell records from Factory Connect",
    ],
    produces: [
      "Whether the order can finish",
      "Where the quality evidence is thin",
      "Reviewable audit and CAPA drafts",
      "An operations work item",
    ],
    pipelineLead:
      "Three cycles that share one rule: the record is made where the work happens, and the arithmetic that judges it is code, not a model. No AI feature is registered for Quality or Maintenance, deliberately.",
    pipeline: [
      [
        "Make — explode once",
        "At order creation the BOM is exploded into a component list and pinned. A later BOM revision cannot rewrite a job already on the floor.",
      ],
      [
        "Make — issue and operate",
        "Components leave stores through Inventory's write path. Operations run in sequence: one cannot start while its predecessor is open, and completing one needs an accountable operator and an evidence note.",
      ],
      [
        "Make — complete",
        "Finished goods are received into stock. A production order cannot complete while any routed operation is still open.",
      ],
      [
        "Check — sample",
        "Lot size selects a sample from a plan table. The derivation is stored in words on the inspection, so a later reader sees why eight and not five.",
      ],
      [
        "Check — judge",
        "Limits are SNAPSHOTTED onto each reading. A later spec revision must never silently change the verdict of a historical inspection. One critical failure rejects the lot regardless of the accept number.",
      ],
      [
        "Check — dispose",
        "A rejected lot moves warehouse to warehouse through the same stock path, and 'executed' without a movement reference is unrepresentable.",
      ],
      [
        "Keep running",
        "Downtime measures the ASSET, not the paperwork — the clock starts when the line stops, often before anyone triages it, and stops at handback rather than at closure.",
      ],
    ],
    rules: [
      [
        "Overlapping downtime is impossible, not discouraged",
        "A database exclusion constraint is the arbiter. The service's job on a collision is not to prevent it but to translate it into “join the existing interval”.",
      ],
      [
        "Downtime is corrected, never deleted",
        "The original timestamps are retained through every correction, and affected KPI snapshots are flagged stale rather than silently recomputed.",
      ],
      [
        "Zero failures means null, not zero",
        "MTBF and MTTR are null when nothing broke, and with no shift calendar availability is null too — 24×7 is never assumed.",
      ],
      [
        "The completion gate reports every reason at once",
        "A blocked work order returns all unmet conditions together, so a technician does not discover them one at a time.",
      ],
    ],
    example: {
      title: "The twelve that did not pass",
      steps: [
        "Three work orders in the order the metal moved: 45 impellers, 45 shafts, then 40 finished pumps from the received heat.",
        "At final inspection eight units were sampled. One measured 0.034 mm of shaft runout at the seal face against a 0.020 mm limit. Runout is classed CRITICAL here — a 316L process pump that weeps is a customer incident, not a quality one — so the lot was rejected.",
        "Twelve units from that machining setup went to quarantine. Finished goods shows 28, not 40, and there is a ledger entry saying exactly where the other twelve went. Separately, Furnace 02 — the plant's only annealing route for 316L — lost vacuum mid-build: 4.5 hours, ₹1,855, cause recorded as seal wear found by the operator.",
      ],
    },
    live: [
      "Operations with predecessor gating and accountable evidence",
      "Snapshotted sampling plans and spec limits",
      "Critical-defect override on the lot verdict",
      "NCR → CAPA with a human-owned effectiveness decision",
      "Downtime, preventive schedules and reproducible KPIs",
      "Stored Factory Connect demo evidence for robot cells, AMRs, gateways and material dwell",
      "A governed factory-flow recovery mission with HEXA verification and a production-supervisor gate; the separate API result is a simulator policy evaluation only",
    ],
    limits: [
      "The manufacturing quality gate is built but unarmed — nothing creates the inspection it reads, so it never fires as shipped",
      "Purchase does not wire the receipt-side inspection gate either",
      "Rejected quantity is recorded on the operation but posts no scrap movement",
      "No calibration or gauge management, and no batch genealogy written from Production",
      "No physical robot, PLC or safety controller is connected; the standalone edge simulator is not wired to the Factory Connect API",
      "The ERP never replaces a robot controller, safety PLC, interlock, emergency stop or certified cell logic",
    ],
    sources: [
      "apps/api/src/modules/production/production.service.ts",
      "packages/platform/src/quality/sampling.ts",
      "packages/platform/src/maintenance/reliability.ts",
      "packages/platform/src/factory-connect/contracts.ts",
      "apps/api/src/modules/integration/factory-connect.service.ts",
      "apps/edge/src/runtime.ts",
    ],
  },

  /* ------------------------------------------------------------------ RASP */
  {
    id: "rasp",
    name: "RASP",
    label: "Finance & People",
    colour: "#2a9160",
    pale: "#ecfaf2",
    tagline: "The money and workforce specialist",
    summary:
      "Explains the accounting truth, the cash position, what is already committed, and the payroll consequence behind an operating decision.",
    owns: [
      [
        "Accounts",
        "Append-only journals, the trial balance, receivables, receipts and reversal.",
      ],
      [
        "Employee spend",
        "Budgets held as a reservation ledger, claims, advances, and the input-credit and withholding gates.",
      ],
      [
        "People",
        "Attendance from punches, deemed wages under the Code on Wages, payroll and the posting back to the ledger.",
      ],
      [
        "Working capital",
        "A cash-position read that is real. The forecast, collection and funding-pack screens are illustrative — see page 11.",
      ],
    ],
    moduleKeys: ["accounts", "expenditure", "hrm", "working-capital"],
    coordination:
      "Accounts is the posted truth; Employee Spend and People create controlled obligations and postings; Working Capital turns the available evidence into reviewable priorities and scenarios. RASP must label the difference between a ledger fact, an assumption and an illustrative demo value.",
    prefixes: ["accounts.", "finance.", "expenditure.", "hrm.", "agent."],
    delegates: [],
    tools: [
      [
        "accounts.vouchers.read",
        "Read",
        "Journal vouchers",
        "accounts.ledger.read",
        "No",
      ],
      [
        "finance.cash-position.read",
        "Read",
        "Trial balance",
        "accounts.ledger.read",
        "No",
      ],
      [
        "finance.forecast.simulate",
        "Simulate",
        "13-week scenario",
        "accounts.ledger.read",
        "No",
      ],
      [
        "finance.collections.prioritise",
        "Analyse",
        "Review queue",
        "accounts.ledger.read",
        "No",
      ],
      [
        "finance.funding-pack.draft",
        "Draft",
        "Draft manifest",
        "accounts.ledger.read",
        "No",
      ],
      [
        "agent.action.dispatch",
        "Execute",
        "Governed work item",
        "agentos.run.operate",
        "Yes",
      ],
    ],
    receives: [
      "Journals, receivables and receipts",
      "Order, purchasing and stock pressure",
      "Budget commitments and claims",
      "Attendance and payroll outcomes",
    ],
    produces: [
      "The accounting position, as posted",
      "A scenario clearly labelled as a scenario",
      "A collection priority order",
      "A finance work item or a reviewable draft",
    ],
    pipelineLead:
      "Money moves in one direction only. A journal is never edited — it is reversed and re-posted — the budget counts money the moment somebody asks for it, and every statutory rate is a dated row rather than a number in the code.",
    pipeline: [
      [
        "Post",
        "Balance is checked three times over: in the calculation, as a column constraint, and again by a deferred trigger that re-sums the lines at commit. A voucher that does not balance cannot exist.",
      ],
      [
        "Correct",
        "There is no edit. A wrong voucher is reversed by an opposite one carrying the reason, so the mistake survives its own correction. The database permits exactly one update — writing the reversal link.",
      ],
      [
        "Receive",
        "An invoice becomes a receivable due on the invoice date plus the customer's credit days. Receipts settle oldest first, and the remainder is the exposure MICA's credit gate reads.",
      ],
      [
        "Commit — the reservation ledger",
        "Available = budgeted − actual − committed − in-approval. Money is counted when it is requested, not when it is spent, which is why two people cannot both spend the same last ₹50,000.",
      ],
      [
        "Move the reservation",
        "in_approval → committed on approval, committed → actual on the accounting acknowledgement — written as two signed rows, never an update. Summing the column IS the balance.",
      ],
      [
        "Attend",
        "Punches become attendance days. One punch is never silently counted as present; it is held for regularisation, and a correction appends fresh punches and replays the day rather than overwriting a figure.",
      ],
      [
        "Pay",
        "Attendance becomes deemed wages, then EPF, ESI, professional tax and withholding — each resolved from the rate in force at month end and stamped onto the payslip. Payroll posts to the ledger synchronously, in one transaction.",
      ],
    ],
    rules: [
      [
        "Reversal, not correction",
        "An append-only trigger makes editing a posted journal impossible rather than merely discouraged — and it fires for the schema owner too.",
      ],
      [
        "The reservation is taken under a row lock",
        "The budget line is locked before availability is even read, inside the caller's transaction, so a crash between “money reserved” and “document created” rolls both back together.",
      ],
      [
        "An unbudgeted spend warns; it never passes silently",
        "A missing budget line returns a warning with a zero availability and the words “this spend is unbudgeted” — not a quiet approval.",
      ],
      [
        "A blocked spend can be overridden, but never anonymously",
        "An override without a written reason is refused outright: an override nobody can read afterwards is no control at all.",
      ],
      [
        "Some tax positions are not the software's to take",
        "When a withholding threshold is crossed mid-year there are two defensible readings. The system computes BOTH, marks the document for finance review, and refuses to choose — because that is a tax position and it belongs to a person.",
      ],
      [
        "A missing statutory rate fails loudly",
        "Payroll stops rather than guessing. A wrong provident-fund deduction is a debt with interest attached, so no rate is ever assumed.",
      ],
    ],
    example: {
      title: "What the order actually did to the books",
      steps: [
        "Dispatching 28 of the 120 pumps raised INV-2627-00002 in the same transaction as the goods-out movement — the stock and the receivable cannot disagree, because they commit together or not at all.",
        "Northstar paid ₹10 lakh against it. The balance is what the credit gate will read the next time this customer orders.",
        "The quality engineer's trip to Northstar's works was budget-checked ON SUBMISSION against the FY 2026-27 travel budget, not after the money had gone. The three people who built the pumps were rostered, and their attendance came from punches rather than a spreadsheet.",
      ],
    },
    live: [
      "Balanced, append-only double-entry with reversal",
      "Trial balance as at a posting date, and the receivables subledger",
      "Budget reservation across three buckets, under a row lock",
      "Deemed wages, EPF, ESI, professional tax and withholding from dated rate rows",
      "Payroll posted to the ledger synchronously, with preparer and approver kept separate",
    ],
    limits: [
      "The working-capital screens are illustrative, not live — the forecast, collection queue and funding pack carry no arithmetic behind them",
      "Of the four finance tools, only the cash-position read computes anything; the other three return evidence with a boundary note",
      "There is no way to close or reopen an accounting period, and no payables subledger",
      "Employee-spend postings are prepared but not wired through to the ledger — payroll's are",
      "The employee and budget cost-centre vocabularies do not overlap, so a claim can read as unbudgeted when a budget exists",
    ],
    sources: [
      "apps/api/src/modules/accounts/accounts.service.ts",
      "apps/api/src/modules/expenditure/budget.service.ts",
      "apps/api/src/modules/hrm/payroll.service.ts",
    ],
  },

  /* ----------------------------------------------------------------- RELAY */
  {
    id: "relay",
    name: "RELAY",
    label: "Managed Services",
    colour: "#0f766e",
    pale: "#e8f7f4",
    tagline: "The service clock and customer hand-off",
    summary:
      "Coordinates the service around XELOR—from design and onboarding to incidents, changes, service reviews and improvement—while the accountable specialist still performs the technical work.",
    owns: [
      [
        "Managed-service design",
        "Service catalogue, outcomes, coverage, severity, SLO/SLA definitions, responsibilities, continuity and exit.",
      ],
      [
        "Transition",
        "Discovery, monitoring coverage, runbooks, contacts, acceptance and hypercare.",
      ],
      [
        "Service operation",
        "Event triage, one incident clock, escalation, request coordination, customer updates and one change calendar.",
      ],
      [
        "Service improvement",
        "Problem follow-up, service reviews, capacity evidence and an owned improvement register.",
      ],
    ],
    moduleKeys: ["managed-services"],
    coordination:
      "RELAY owns coordination, elapsed time and customer communication. HEXA, ONYX, MICA, SPAR, AXLE, KILN or RASP remains the technical/business owner for its domain and must supply closure evidence. A human owns contracts, credits and material promises.",
    prefixes: ["managed-services.", "agent."],
    delegates: [],
    tools: [
      [
        "managed-services.service-assurance.read",
        "Read",
        "Service catalogue, incidents, changes, reviews and ownership boundaries",
        "managed_services.overview.read",
        "No",
      ],
      [
        "agent.action.dispatch",
        "Execute",
        "Governed service-coordination work item",
        "agentos.run.operate",
        "Yes",
      ],
    ],
    receives: [
      "Customer outcomes and entitlement",
      "Operational signals and user contacts",
      "Specialist diagnosis and restoration evidence",
      "Approved changes and human decisions",
    ],
    produces: [
      "One service incident and clock",
      "A named specialist hand-off",
      "A timed customer update",
      "A verified service brief and improvement action",
    ],
    pipelineLead:
      "Managed Services is the work that begins before go-live and continues after it. RELAY turns technology components into one supportable customer service without creating a second copy of every specialist team.",
    pipeline: [
      [
        "Design",
        "Agree customer outcomes, catalogue, coverage, severity, service indicators/objectives, responsibilities, continuity and exit. A human approves price and contract.",
      ],
      [
        "Transition",
        "Discover the environment, connect data, prove monitoring, validate access, write runbooks, rehearse escalation, accept the service and run hypercare.",
      ],
      [
        "Detect and triage",
        "Turn a signal or contact into one service record; identify customer impact, urgency, affected component, evidence and the next update time.",
      ],
      [
        "Coordinate restoration",
        "Send technical diagnosis to the accountable specialist. RELAY keeps the incident clock, escalation, timeline and customer message; it does not fix the component.",
      ],
      [
        "Control change",
        "Join specialist changes into one customer calendar, check collision and readiness, send approved notices and verify service after the window.",
      ],
      [
        "Close with proof",
        "The specialist supplies restoration evidence. RELAY verifies the customer-facing outcome before closure; repeated failure creates a problem/improvement record.",
      ],
      [
        "Review and improve",
        "Measure service objectives, explain misses, review incidents/requests/changes/capacity and agree the next improvement with an owner and date.",
      ],
    ],
    rules: [
      [
        "One task, one accountable owner",
        "RELAY owns service coordination. It never duplicates a connector incident, AI incident, product-support case or machine-maintenance work order as its own technical record.",
      ],
      [
        "The customer measure comes first",
        "A component metric is evidence, not automatically an SLA. A production measure must declare the user outcome, observation window, target, exclusions and source.",
      ],
      [
        "Security and AI controls stay separate",
        "HEXA alone makes breach/reportability decisions. ONYX AI Operations alone changes provider, prompt, evaluation, autonomy or kill-switch state.",
      ],
      [
        "Closure needs two truths",
        "The specialist proves the component is restored; RELAY separately proves the agreed service outcome is restored and the customer update is complete.",
      ],
      [
        "Commercial authority remains human",
        "RELAY may calculate and assemble breach evidence. It cannot grant an SLA credit, sign a contract or make an unapproved delivery commitment.",
      ],
      [
        "Coverage is a staffing claim",
        "The product must not say 24×7 until shifts, on-call, backups and escalation have been staffed and rehearsed.",
      ],
    ],
    example: {
      title: "An ERP connector falls behind its freshness objective",
      note: "Illustrative operating-model data, clearly labelled in the product",
      steps: [
        "RELAY records one P2 service incident, names the affected Integration Assurance outcome, starts the response clock and schedules the next customer update. It does not create a second HEXA connector record.",
        "HEXA Integration owns queue diagnosis, circuit state, dead-letter evidence, retry and technical recovery. RELAY owns severity, escalation, timeline and the plain-language description of customer impact.",
        "When throughput recovers, HEXA supplies technical evidence. RELAY verifies that data freshness is inside the agreed objective, issues the customer update and only then closes the service outcome.",
        "If the failure repeats, RELAY opens a problem/improvement item with a named owner. A material change still follows the customer change calendar, HEXA control checks and any required human approval.",
      ],
    },
    live: [
      "RELAY in the nine-agent registry and visible department map",
      "Shared four-stage lifecycle and non-overlapping responsibility model",
      "Permission-gated API and five-screen Managed Services workspace",
      "Read-only service-assurance capability",
      "Dedicated HEXA-verified, human-gated assurance graph",
      "One approval-bound service-coordination item in the larger action mission",
    ],
    limits: [
      "The catalogue, incidents, changes, review and measures are seeded illustrative data—not live customer evidence",
      "No staffed 24×7 desk, on-call roster, paging or customer communications channel is operating",
      "No ITSM adapter, OpenTelemetry ingestion, automatic correlation or production service data tables exist yet",
      "No contractual SLA, service credit calculation or customer entitlement engine is active",
      "RELAY coordinates; it does not autonomously repair another agent's domain",
    ],
    sources: [
      "packages/platform/src/managed-services/operating-model.ts",
      "apps/api/src/modules/managed-services/",
      "apps/api/src/agent-os/graph-registry.service.ts",
      "docs/01-agent-os/04-managed-services.md",
      "ISO/IEC 20000-1 — iso.org/standard/70636.html",
      "NIST SP 800-61 Rev. 3 — csrc.nist.gov/pubs/sp/800/61/r3/final",
      "Google SRE SLO guidance — sre.google/sre-book/service-level-objectives/",
      "OpenTelemetry — opentelemetry.io/docs/what-is-opentelemetry/",
    ],
  },

  /* --------------------------------------------------------------- ACHILES */
  {
    id: "achiles",
    name: "ACHILES",
    label: "Platform Assurance",
    colour: "#2563a8",
    pale: "#eaf3fb",
    tagline: "The quiet platform heartbeat",
    summary:
      "Privately checks whether XELOR is responding, preserves the result history and hands failed evidence to the people and agents responsible for incident coordination and repair.",
    owns: [
      [
        "Private platform status",
        "A single internal answer to whether XELOR is working, degraded or unavailable.",
      ],
      [
        "Hourly deterministic checks",
        "Fixed probes for the API, tenant database, event queue, public web application and declared AI runtime.",
      ],
      [
        "Availability evidence history",
        "Append-only component results, latency, trigger, timestamps, freshness and overall status.",
      ],
    ],
    moduleKeys: ["platform-health"],
    coordination:
      "ACHILES detects and records only. RELAY owns incident severity, clock and customer updates. HEXA, ONYX or the affected specialist owns diagnosis and repair. A person keeps control of high-impact decisions.",
    prefixes: ["platform-health."],
    delegates: [],
    tools: [
      [
        "platform-health.status.read",
        "Read",
        "Latest private status, freshness and append-only history",
        "platform_health.overview.read",
        "No",
      ],
    ],
    receives: [
      "Hourly scheduler trigger",
      "Authorised internal operator trigger",
      "Configured private service endpoints",
      "Tenant identity and access context",
    ],
    produces: [
      "Healthy, degraded or unavailable status",
      "Per-component pass/fail evidence and latency",
      "Freshness warning after 90 minutes",
      "A bounded hand-off to RELAY and the technical owner",
    ],
    pipelineLead:
      "ACHILES is deliberately simpler than a general AI agent. It answers one operational question using explicit technical probes, records exactly what happened and stops before diagnosis or repair.",
    pipeline: [
      [
        "Wake privately",
        "An internal interval or secret-protected external scheduler starts one sweep. A second overlapping sweep is refused.",
      ],
      [
        "Enter tenant context",
        "Each active tenant is checked inside its own identity and row-level-security boundary.",
      ],
      [
        "Probe fixed components",
        "Check API, PostgreSQL, Valkey and the configured web URL with explicit timeouts. Declare the AI runtime mode without inventing an external model result.",
      ],
      [
        "Classify honestly",
        "A required failure means unavailable; an optional failure means degraded; an unconfigured optional endpoint is shown as not configured, never passed.",
      ],
      [
        "Preserve evidence",
        "Insert one immutable run with component details, latencies, trigger and timestamps. The latest 24 are shown to authorised operators.",
      ],
      [
        "Hand off and stop",
        "Failed evidence goes to RELAY and the relevant technical owner. ACHILES does not diagnose, restart, repair, message a customer or close an incident.",
      ],
    ],
    rules: [
      [
        "Evidence, not an AI guess",
        "Platform state comes from deterministic probes with timeouts. No language model decides whether XELOR is healthy.",
      ],
      [
        "Private by permission",
        "Only xelor_admin, it_admin and demo_admin receive the view/run permissions; ordinary customer roles do not see the module.",
      ],
      [
        "Observation is not remediation",
        "The allow-list contains one read capability and no agent.action.dispatch entry.",
      ],
      [
        "Missing is not healthy",
        "An endpoint that was not configured is labelled not configured. A check older than 90 minutes is labelled stale.",
      ],
      [
        "Every tenant remains separate",
        "The scheduler enters explicit tenant context and the database applies row-level security before reading or saving evidence.",
      ],
      [
        "One failure does not hide the rest",
        "A failed tenant check is counted as unavailable while the sweep continues across the other active tenants.",
      ],
    ],
    example: {
      title: "An authorised operator checks the demo before a meeting",
      steps: [
        "The operator opens ACHILES → Private status and presses Run private check now. Ordinary customer roles cannot open this screen.",
        "The API and tenant database pass. Valkey returns PONG. The configured public web page returns a healthy HTTP response. Each result carries measured latency.",
        "ACHILES records one manual observation and the screen changes to XELOR is working. The new append-only row appears above earlier hourly observations.",
        "If a component fails, the screen says degraded or needs attention. ACHILES records the evidence and stops; RELAY and the technical owner take over from there.",
      ],
    },
    live: [
      "ACHILES as the ninth and final agent in the registry, map, catalogue and guided agent tour",
      "Permission-gated Private Platform Assurance module and manual check",
      "Hourly in-process scheduler for long-running deployments",
      "Secret-protected scheduler endpoint and Vercel cron declaration",
      "Real API, PostgreSQL, Valkey and web probes with bounded timeouts",
      "Tenant-fenced append-only result table, freshness state and latest-24 history",
      "Read-only Agent OS capability in both nine-agent mission graphs",
    ],
    limits: [
      "No production telemetry aggregation, distributed tracing, paging or on-call integration",
      "No root-cause diagnosis, predictive anomaly model or automatic remediation",
      "No customer-facing status page or outbound notification channel",
      "A simple endpoint response does not prove every business workflow is correct",
      "Exact hourly execution depends on the selected host or external scheduler supporting that cadence",
    ],
    sources: [
      "apps/api/src/modules/platform-health/",
      "apps/web/src/modules/platform-health/",
      "packages/db/src/schema/platform-health.ts",
      "packages/db/migrations/0070_achiles_platform_health.sql",
      "apps/api/src/agent-os/capability-registry.service.ts",
      "docs/01-agent-os/05-achiles-platform-assurance.md",
    ],
  },
];

/* Which nodes each agent owns, per graph — counted from the graph definitions. */
const MISSION_ROLES = {
  ONYX: [
    [
      "Factory flow recovery",
      "Frames the constrained-cell goal and publishes the recovery brief after approval",
    ],
    [
      "Cross-functional readiness",
      "Frames the mission, then writes the final synthesis after approval",
    ],
    [
      "Nine-agent operating review",
      "Frames it, then issues the command brief",
    ],
    [
      "Controlled action mission",
      "Frames it, builds the action plan, publishes the outcome",
    ],
    ["Working Capital Review", "Sets the horizon, then publishes the brief"],
    [
      "QMS & Audit Readiness",
      "Sets the audit scope, then publishes gaps and owners",
    ],
    [
      "Managed Service Assurance",
      "Frames the customer outcome and decisions reserved for people",
    ],
  ],
  HEXA: [
    [
      "Factory flow recovery",
      "Checks tenant evidence, the named allow-list and the declared local-control boundary; it does not query a controller or certify safety",
    ],
    [
      "Cross-functional readiness",
      "Verifies policy and evidence before the human gate",
    ],
    [
      "Nine-agent operating review",
      "Reads company context, assesses control, runs four checks",
    ],
    [
      "Controlled action mission",
      "Context, assessment, preflight, one dispatch, outcome verification — 5 nodes",
    ],
    [
      "Working Capital Review",
      "Verifies every figure ties to source and no posting occurred",
    ],
    [
      "QMS & Audit Readiness",
      "Verifies traceability and that no AI decided a result",
    ],
    [
      "Managed Service Assurance",
      "Verifies evidence, one-owner boundaries and reserved decisions",
    ],
  ],
  MICA: [
    ["Factory flow recovery", "Reads commitments and assesses customer impact without changing a promise"],
    [
      "Cross-functional readiness",
      "Reads sales orders, then assesses commitments",
    ],
    [
      "Nine-agent operating review",
      "Reads orders, then the commercial assessment",
    ],
    [
      "Controlled action mission",
      "Reads, recommends, and dispatches the commitment-recovery item",
    ],
    [
      "Working Capital Review",
      "Reads customer commitments feeding the cash view",
    ],
    ["QMS & Audit Readiness", "Not involved"],
    [
      "Managed Service Assurance",
      "Not involved; manufactured-product support stays with MICA",
    ],
  ],
  SPAR: [
    ["Factory flow recovery", "Reads material position and assesses an internal-movement recovery"],
    ["Cross-functional readiness", "Reads stock, then assesses supply"],
    [
      "Nine-agent operating review",
      "Reads the stock position, then the supply assessment",
    ],
    [
      "Controlled action mission",
      "Reads, recommends, and dispatches the shortage-recovery item",
    ],
    ["Working Capital Review", "Reads the stock holding cash"],
    ["QMS & Audit Readiness", "Not involved"],
    [
      "Managed Service Assurance",
      "Not involved unless a service issue requires supply evidence",
    ],
  ],
  AXLE: [
    ["Factory flow recovery", "Reads the plan and assesses capacity, sequence and alternate routing"],
    ["Cross-functional readiness", "Not involved"],
    [
      "Nine-agent operating review",
      "Reads planned orders, then the planning assessment",
    ],
    [
      "Controlled action mission",
      "Reads, recommends, and dispatches the capacity scenario",
    ],
    ["Working Capital Review", "Not involved"],
    ["QMS & Audit Readiness", "Not involved"],
    [
      "Managed Service Assurance",
      "Not involved unless a service issue requires plan evidence",
    ],
  ],
  KILN: [
    ["Factory flow recovery", "Reads stored robot and dwell evidence and explains recovery constraints; it neither determines local safety nor dispatches a machine command"],
    ["Cross-functional readiness", "Not involved"],
    [
      "Nine-agent operating review",
      "Reads production, then the operations assessment",
    ],
    [
      "Controlled action mission",
      "Reads, recommends, and dispatches the execution priority",
    ],
    ["Working Capital Review", "Not involved"],
    [
      "QMS & Audit Readiness",
      "Owns four of eight nodes — read, collect, draft the pack, explain the gaps",
    ],
    [
      "Managed Service Assurance",
      "Not involved; physical asset restoration remains KILN work",
    ],
  ],
  RASP: [
    ["Factory flow recovery", "Reads finance evidence and states only evidenced downtime exposure"],
    ["Cross-functional readiness", "Not involved"],
    [
      "Nine-agent operating review",
      "Reads vouchers, then the finance assessment",
    ],
    [
      "Controlled action mission",
      "Reads, recommends, and dispatches the financial guardrail",
    ],
    [
      "Working Capital Review",
      "Owns three of nine nodes — cash position, 13-week simulation, the analysis",
    ],
    ["QMS & Audit Readiness", "Not involved"],
    [
      "Managed Service Assurance",
      "Not involved; validates financial effects only when requested",
    ],
  ],
  RELAY: [
    ["Factory flow recovery", "Coordinates only XELOR service impact; factory maintenance remains KILN's"],
    ["Cross-functional readiness", "Not involved"],
    [
      "Nine-agent operating review",
      "Reads service assurance and assesses incidents, changes and customer communication",
    ],
    [
      "Controlled action mission",
      "Reads service exposure, recommends coordination and receives one approval-bound work item",
    ],
    ["Working Capital Review", "Not involved"],
    ["QMS & Audit Readiness", "Not involved"],
    [
      "Managed Service Assurance",
      "Reads and assesses service evidence, then publishes the human-approved service brief",
    ],
  ],
  ACHILES: [
    ["Factory flow recovery", "Preserves the boundary: reports XELOR health and never assesses or commands the robot"],
    ["Cross-functional readiness", "Not involved"],
    [
      "Nine-agent operating review",
      "Reads private platform status and assesses availability and evidence freshness",
    ],
    [
      "Controlled action mission",
      "Reads and assesses platform health, then remains read-only after the human gate",
    ],
    ["Working Capital Review", "Not involved"],
    ["QMS & Audit Readiness", "Not involved"],
    [
      "Managed Service Assurance",
      "Not a graph participant; supplies private detection evidence upstream of RELAY",
    ],
  ],
};

/* ============================================================================
   RENDERING
   ============================================================================ */
const esc = (v) =>
  String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const pills = (items) =>
  `<div class="pills">${items.map((x) => `<span>${esc(x)}</span>`).join("")}</div>`;
const bullets = (items) =>
  `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
const cards = (items, cls = "grid-2") =>
  `<div class="${cls}">${items.map(([t, d]) => `<article class="card"><h3>${esc(t)}</h3><p>${esc(d)}</p></article>`).join("")}</div>`;
const flow = (items) =>
  `<div class="flow">${items.map((x, i) => `${i ? '<span class="arrow">→</span>' : ""}<div class="flow-block">${x}</div>`).join("")}</div>`;
const steps = (items) =>
  `<div class="steps">${items.map(([t, d]) => `<div class="step"><div><b>${esc(t)}</b><p>${esc(d)}</p></div></div>`).join("")}</div>`;
const moduleCode = (m) => {
  const api =
    m.key === "agentos"
      ? "apps/api/src/agent-os/"
      : m.key === "working-capital"
        ? "apps/api/src/agent-os/capability-registry.service.ts"
        : `apps/api/src/modules/${m.key}/`;
  return `apps/web/src/modules/${m.key}/manifest.ts · ${api}`;
};
const moduleDetail = (m) => `
  <article class="module-detail">
    <div class="module-title"><b>${esc(m.name)}</b><span>${esc(m.agent)} module · ${esc(m.key)}</span></div>
    <div class="module-line"><strong>Purpose</strong><p>${esc(m.purpose)}</p></div>
    <div class="module-line"><strong>Core records</strong><p>${esc(m.records)}</p></div>
    <div class="module-line"><strong>User surface</strong><p>${esc(m.screens)}</p></div>
    <div class="module-line"><strong>End-to-end flow</strong><p>${esc(m.workflow)}</p></div>
    <div class="module-line"><strong>Enforced controls</strong><p>${esc(m.controls)}</p></div>
    <div class="module-line"><strong>Inputs and outputs</strong><p>${esc(m.handoffs)}</p></div>
    <div class="module-line boundary"><strong>Current boundary</strong><p>${esc(m.boundary)}</p></div>
    <div class="module-line code-map"><strong>Primary code map</strong><p>${esc(moduleCode(m))}</p></div>
  </article>`;

const css = `
  :root { --ink:#132238; --muted:#5f6f83; --line:#dfe5ed; --paper:#fff; --navy:#101d31; }
  * { box-sizing:border-box; }
  html, body { margin:0; padding:0; background:#dfe4ec; color:var(--ink); font-family:Inter,Arial,sans-serif; }
  @page { size:A4; margin:0; }
  .page { width:210mm; height:297mm; padding:16mm 16mm 14mm; margin:8mm auto; background:var(--paper); position:relative; overflow:hidden; page-break-after:always; }
  .page:last-child { page-break-after:auto; }
  @media print { html,body{background:#fff}.page{margin:0} }
  h1,h2,h3,p { margin-top:0; }
  h1 { font-size:35px; line-height:1.03; letter-spacing:-1.2px; margin-bottom:8px; }
  h2 { font-size:25px; line-height:1.1; letter-spacing:-.5px; margin-bottom:6px; }
  h3 { font-size:13.5px; line-height:1.25; margin-bottom:5px; }
  p,li,td,th { font-size:11.8px; line-height:1.5; }
  p { color:var(--muted); margin-bottom:8px; }
  ul { margin:5px 0 0; padding-left:17px; }
  li { margin-bottom:6px; color:#33445a; }
  small { font-size:9px; color:#67758a; font-weight:500; }
  .eyebrow { color:var(--accent); font-size:9.5px; letter-spacing:1.7px; text-transform:uppercase; font-weight:800; margin-bottom:9px; }
  .lead { font-size:16px; line-height:1.45; max-width:158mm; color:#34465d; }
  .rule { height:3px; width:24mm; background:var(--accent); margin:10px 0 15px; border-radius:4px; }
  .section-head { display:flex; justify-content:space-between; gap:9mm; align-items:flex-end; border-bottom:1px solid var(--line); padding-bottom:7px; margin-bottom:12px; }
  .section-head p { max-width:74mm; text-align:right; margin:0; font-size:11px; }
  .footer { position:absolute; left:16mm; right:16mm; bottom:7mm; display:flex; justify-content:space-between; color:#8994a5; font-size:7.5px; border-top:1px solid #e7ebf0; padding-top:3px; }
  .cover { background:linear-gradient(145deg,var(--navy) 0 60%,var(--accent) 60% 100%); color:white; }
  .cover p { color:#d7dfec; }
  .cover .eyebrow { color:#fff; opacity:.8; margin-top:14mm; }
  .cover h1 { font-size:52px; max-width:142mm; margin-top:38mm; }
  .cover .lead { color:#e8edf5; font-size:16px; max-width:132mm; }
  .cover .cover-note { position:absolute; bottom:26mm; left:16mm; width:112mm; padding:11px 13px; border:1px solid #ffffff42; border-radius:12px; background:#ffffff0d; font-size:9.5px; line-height:1.5; }
  .cover .footer { color:#d6dfed; border-color:#ffffff25; }
  .big-mark { position:absolute; right:10mm; bottom:17mm; font-size:70px; line-height:.9; font-weight:900; color:#ffffff18; writing-mode:vertical-rl; transform:rotate(180deg); }
  .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .grid-3 { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
  .card { border:1px solid var(--line); border-radius:9px; padding:10px 12px; background:#fff; break-inside:avoid; }
  .card h3 { color:var(--accent); }
  .card p { margin:0; font-size:10.8px; line-height:1.48; }
  .tint { background:var(--pale); border-color:color-mix(in srgb,var(--accent) 20%,white); }
  .callout { border-left:4px solid var(--accent); background:var(--pale); padding:12px 14px; border-radius:0 9px 9px 0; margin:11px 0; }
  .callout strong { display:block; font-size:12px; margin-bottom:4px; color:var(--ink); }
  .callout p { margin:0; font-size:11.2px; line-height:1.5; }
  .pills { display:flex; flex-wrap:wrap; gap:6px; margin:7px 0 11px; }
  .pills span { font-size:9.2px; font-weight:700; border:1px solid var(--line); border-radius:99px; padding:5px 9px; background:#fff; color:#4b5b70; }
  .flow { display:flex; align-items:stretch; gap:4px; margin:14px 0; }
  .flow-block { flex:1; min-width:0; min-height:52px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; border:1px solid var(--line); border-top:4px solid var(--accent); border-radius:8px; padding:6px; font-size:9.8px; font-weight:750; background:#fff; }
  .arrow { display:flex; align-items:center; color:var(--accent); font-size:16px; }
  .swim { display:grid; grid-template-columns:30mm 1fr; border:1px solid var(--line); border-radius:9px; overflow:hidden; margin:8px 0; }
  .swim .who { background:var(--pale); color:var(--accent); font-weight:800; padding:9px; font-size:10.5px; }
  .swim .what { padding:9px; font-size:10.5px; color:#33445a; }
  table { width:100%; border-collapse:collapse; margin-top:8px; table-layout:fixed; }
  th { color:#fff; background:var(--accent); text-align:left; font-size:9.2px; padding:7px; }
  td { border-bottom:1px solid var(--line); padding:7px; font-size:9.8px; vertical-align:top; overflow-wrap:anywhere; }
  tr:nth-child(even) td { background:#f8fafc; }
  .cap-table th:nth-child(1){width:27%}.cap-table th:nth-child(2){width:11%}.cap-table th:nth-child(3){width:21%}.cap-table th:nth-child(4){width:26%}.cap-table th:nth-child(5){width:15%}
  .mission-table th:nth-child(1){width:34%}
  .matrix th:nth-child(1){width:26%}.matrix th:nth-child(2){width:10%}.matrix th:nth-child(3){width:15%}.matrix th:nth-child(4){width:26%}.matrix th:nth-child(5){width:23%}
  .steps { display:grid; gap:8px; counter-reset:step; }
  .step { display:grid; grid-template-columns:9mm 1fr; gap:9px; align-items:start; border:1px solid var(--line); border-radius:8px; padding:9px 11px; }
  .step:before { counter-increment:step; content:counter(step); width:7.5mm; height:7.5mm; border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--accent); color:white; font-weight:800; font-size:10px; }
  .step b { font-size:11.5px; color:var(--ink); }
  .step p { margin:2px 0 0; font-size:11px; line-height:1.48; }
  .plain .step { grid-template-columns:1fr; }
  .plain .step:before { content:none; }
  .stat-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:13px 0; }
  .stat { background:var(--navy); color:#fff; border-radius:9px; padding:12px; }
  .stat b { display:block; font-size:25px; color:#fff; }
  .stat span { font-size:9px; color:#c8d1de; }
  .agent-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; }
  .agent-card { border:1px solid var(--line); border-left:6px solid var(--c); padding:9px 11px; border-radius:8px; }
  .agent-card b { color:var(--c); font-size:12px; }
  .agent-card p { margin:3px 0 0; font-size:10px; line-height:1.45; }
  .stack { display:grid; gap:7px; margin:12px auto; max-width:162mm; }
  .stack-row { border:1px solid var(--line); border-left:6px solid var(--accent); padding:10px 13px; border-radius:8px; display:flex; justify-content:space-between; gap:14px; }
  .stack-row b { font-size:11.5px; }
  .stack-row span { font-size:10.2px; color:var(--muted); text-align:right; }
  .truth { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .truth > div { border-radius:9px; padding:13px; border:1px solid var(--line); }
  .truth .yes { border-top:5px solid #2a9160; }.truth .no { border-top:5px solid #d94b4b; }
  .truth h3 { font-size:12.5px; }
  .truth li { font-size:10.8px; }
  .glossary td:first-child { width:27%; font-weight:800; color:var(--accent); }
  .source { font-family:ui-monospace,Menlo,monospace; font-size:9.4px; overflow-wrap:anywhere; }
  .mini { font-size:10px; line-height:1.5; }
  .graph-card { border:1px solid var(--line); border-radius:9px; padding:10px 12px; margin-bottom:8px; border-left:5px solid var(--accent); }
  .graph-card b { font-size:12px; }
  .graph-card .meta { font-family:ui-monospace,Menlo,monospace; font-size:9px; color:#7a879a; margin:3px 0 4px; }
  .graph-card p { margin:0; font-size:10.6px; line-height:1.45; }
  .module-detail { border:1px solid var(--line); border-radius:10px; overflow:hidden; margin-bottom:10px; break-inside:avoid; }
  .module-title { display:flex; justify-content:space-between; align-items:baseline; gap:10px; padding:8px 10px; color:#fff; background:var(--accent); }
  .module-title b { font-size:12.5px; }.module-title span { font-size:8.5px; opacity:.84; }
  .module-line { display:grid; grid-template-columns:28mm 1fr; border-top:1px solid var(--line); }
  .module-line strong { padding:5px 8px; font-size:8.8px; color:var(--accent); background:#f7f9fc; }
  .module-line p { padding:5px 8px; margin:0; font-size:9.1px; line-height:1.35; color:#405066; }
  .module-line.boundary strong,.module-line.boundary p { background:var(--pale); }
  .module-line.code-map p { font-family:ui-monospace,Menlo,monospace; font-size:8.2px; }
  .master-module-map td { padding:5px 6px; font-size:8.9px; line-height:1.28; }
  .master-module-map .callout { margin:7px 0; padding:9px 12px; }
`;

const footer = (title, page) =>
  `<div class="footer"><span>XELOR · ${esc(title)}</span><span>${page}</span></div>`;
const page = (accent, pale, title, n, body, extra = "") =>
  `<section class="page ${extra}" style="--accent:${accent};--pale:${pale}">${body}${footer(title, n)}</section>`;
const documentShell = (title, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;
const heading = (kicker, title, note = "") =>
  `<header class="section-head"><div><div class="eyebrow">${esc(kicker)}</div><h2>${esc(title)}</h2></div>${note ? `<p>${esc(note)}</p>` : ""}</header>`;

function agentGuide(a) {
  const title = `${a.name} agent guide`;
  const p = [];
  const ownedModules = a.moduleKeys.map((key) =>
    MODULES.find((m) => m.key === key),
  );
  if (ownedModules.some((m) => !m))
    throw new Error(`${a.name} references an unknown product module`);
  const splitAt = Math.ceil(ownedModules.length / 2);
  const modulePages = [
    ownedModules.slice(0, splitAt),
    ownedModules.slice(splitAt),
  ];

  /* 01 — cover */
  p.push(
    page(
      a.colour,
      a.pale,
      title,
      "01",
      `
    <div class="eyebrow">XELOR agent handbook · built from the implementation</div>
    <h1>${a.name}<br>${esc(a.label)}</h1><div class="rule"></div>
    <p class="lead">${esc(a.tagline)}. ${esc(a.summary)}</p>
    <div class="cover-note"><b>Who this is for:</b> product, engineering, operations and anyone who has to explain XELOR to somebody else.<br><b>What it covers:</b> the work ${a.name} reasons about, the rules it cannot break, the exact tools it can call, and what is honestly not built yet.<br><b>Truth standard:</b> the repository as it stands on ${SNAPSHOT}.</div>
    <div class="big-mark">${a.name}</div>`,
      "cover",
    ),
  );

  /* 02 — at a glance */
  p.push(
    page(
      a.colour,
      a.pale,
      title,
      "02",
      `
    ${heading("01 · At a glance", `What ${a.name} is for`, "A role with a fixed tool list, not a general assistant")}
    <div class="callout"><strong>In one sentence</strong><p>${esc(a.summary)}</p></div>
    <div class="stat-grid">
      <div class="stat"><b>${a.owns.length}</b><span>business areas it speaks for</span></div>
      <div class="stat"><b>${a.tools.length}</b><span>tools it can actually call</span></div>
      <div class="stat"><b>${a.prefixes.length}</b><span>capability families allowed</span></div>
      <div class="stat"><b>${a.delegates.length}</b><span>agents it may delegate to</span></div>
    </div>
    ${cards(
      [
        ["What reaches it", a.receives.join(" · ")],
        ["What it hands back", a.produces.join(" · ")],
      ],
      "grid-2",
    )}
    <h3 style="margin-top:13px">Capability families it is allowed to touch</h3>${pills(a.prefixes)}
    <div class="callout"><strong>Ownership and authority are not the same thing</strong><p>The areas above are where ${a.name} is the right specialist to ask. The tool table on page 8 is the much smaller set it can invoke at runtime. Owning a business area does not grant runtime power over it — and for ONYX, the supervisor, the gap between the two is the widest in the system.</p></div>`,
    ),
  );

  /* 03–04 — module deep dive */
  p.push(
    page(
      a.colour,
      a.pale,
      title,
      "03",
      `
    ${heading("02 · Module deep dive · 1 of 2", `What sits behind ${a.name}`, "Records, screens, workflow, controls and hand-offs")}
    ${modulePages[0].map(moduleDetail).join("")}
    <div class="callout"><strong>How to read these module pages</strong><p>“Live” means the records, service rules and user/API surface exist in this repository. It does not mean every surrounding enterprise process is complete. The boundary row names what remains illustrative, manual, simulate-driven or outside the MVP.</p></div>`,
    ),
  );

  p.push(
    page(
      a.colour,
      a.pale,
      title,
      "04",
      `
    ${heading("02 · Module deep dive · 2 of 2", `How ${a.name}'s modules connect`, "A module owns its records; the agent explains the combined evidence")}
    ${modulePages[1].map(moduleDetail).join("")}
    <div class="callout"><strong>Cross-module coordination</strong><p>${esc(a.coordination)}</p></div>
    ${flow(a.moduleKeys.map((key) => MODULES.find((m) => m.key === key).name).concat([`${a.name}<br><small>bounded evidence</small>`, "ONYX / person<br><small>decision</small>"]))}`,
    ),
  );

  /* 05 — the domain pipeline */
  const readable = a.tools.filter((t) => t[1] !== "Execute");
  p.push(
    page(
      a.colour,
      a.pale,
      title,
      "05",
      `
    ${heading("03 · The work itself", `How ${a.name}'s world actually runs`, "The business pipeline, not the agent plumbing")}
    <p class="lead" style="font-size:13px;margin-bottom:12px">${esc(a.pipelineLead)}</p>
    ${steps(a.pipeline)}
    <div class="callout"><strong>How much of this ${a.name} can actually see</strong><p>Of everything above, ${a.name} can read exactly ${readable.length === 1 ? "one thing" : `${readable.length} things`} directly — ${readable.map((t) => t[2].toLowerCase()).join(", ")}. The rest of this pipeline is context for judging what it reads; it is not data the agent can reach. Where a mission needs more, it asks the specialist who owns it or it says the evidence is missing.</p></div>`,
    ),
  );

  /* 06 — the rules */
  p.push(
    page(
      a.colour,
      a.pale,
      title,
      "06",
      `
    ${heading("04 · The rules underneath", "What the code will not let anyone do", "Enforced by constraints and locks, not by wording")}
    ${cards(a.rules, "grid-2")}
    <div class="callout" style="margin-top:13px"><strong>Why this page matters more than the agent pages</strong><p>An agent is only as trustworthy as the system it reads. Every rule here holds whether the request came from a person, a screen, a seeder or ${a.name} — which is precisely why an agent can be given a read tool without also being given a way to do damage.</p></div>
    <h3 style="margin-top:12px">Where these rules are kept</h3>
    ${a.sources.map((s) => `<div class="card source" style="margin:5px 0">${esc(s)}</div>`).join("")}`,
    ),
  );

  /* 07 — runtime contract */
  p.push(
    page(
      a.colour,
      a.pale,
      title,
      "07",
      `
    ${heading("05 · Runtime contract", `How ${a.name} takes part in a mission`, "The engine controls order, parallelism and recovery")}
    ${flow(["Person or signal", "ONYX<br><small>scope the mission</small>", `${a.name}<br><small>${esc(a.label)}</small>`, "Capability registry<br><small>allow-listed tool</small>", "Domain service<br><small>business rules</small>", "Tenant data<br><small>+ audit</small>"])}
    <div class="grid-2">
      <article class="card tint"><h3>1 · Scope</h3><p>ONYX turns the goal into a run against a frozen graph version, with a fixed tenant, user, step budget and timeout.</p></article>
      <article class="card tint"><h3>2 · Authorise</h3><p>Two checks, both required: the tool must be on ${a.name}'s allow-list, and the signed-in person must independently hold the permission.</p></article>
      <article class="card tint"><h3>3 · Execute</h3><p>A registered domain service does the work under the same rules a screen would face. There is no general SQL doorway.</p></article>
      <article class="card tint"><h3>4 · Preserve</h3><p>Inputs, outputs, events and a checkpoint after every wave, so the run can be explained or resumed.</p></article>
    </div>
    <div class="callout"><strong>An agent can narrow authority, never widen it</strong><p>${a.delegates.length ? `${a.name} may delegate only to ${a.delegates.join(", ")}.` : `${a.name} is a specialist and delegates to nobody.`} Because the permission check is repeated against the requesting person, a mission can never reach data that person could not have opened themselves.</p></div>`,
    ),
  );

  /* 08 — callable surface */
  p.push(
    page(
      a.colour,
      a.pale,
      title,
      "08",
      `
    ${heading("06 · Exact callable surface", `Everything ${a.name} can call`, "This table is the complete list — there is no other door")}
    <table class="cap-table"><thead><tr><th>Capability</th><th>Mode</th><th>What comes back</th><th>Permission required</th><th>Needs approval</th></tr></thead><tbody>${a.tools
      .map((r) => `<tr>${r.map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>
    <div class="grid-2" style="margin-top:11px">
      <article class="card"><h3>Read · Analyse · Simulate</h3><p>Return evidence or a reproducible view. Nothing in the business changes.</p></article>
      <article class="card"><h3>Draft</h3><p>Produce reviewable content that is labelled a draft and can never present itself as an approved outcome.</p></article>
      <article class="card"><h3>Execute</h3><p>The only side-effecting mode in the whole system, and the only one that requires an approved human gate above it.</p></article>
      <article class="card"><h3>Both locks must open</h3><p>The agent's allow-list AND the person's permission. Either one failing is a refusal.</p></article>
    </div>
    ${
      a.tools.some((t) => t[0] === "agent.action.dispatch")
        ? `<div class="callout"><strong>What “dispatch” does and does not do</strong><p>It appends a governed work item naming the responsible specialist, the approval it came from and the exact payload. It does not change a sales order, a stock balance, a production order, a journal or a customer message — a person still does that work.</p></div>`
        : `<div class="callout"><strong>${a.name} cannot act in the business at all</strong><p>There is no execute capability on this list, and ${a.name} is not on the allow-list for the one that exists. The agent that coordinates every mission is the only one that cannot cause an effect — which is the point, not an oversight.</p></div>`
    }
    ${a.extraSurface ?? ""}`,
    ),
  );

  /* 09 — mission participation */
  p.push(
    page(
      a.colour,
      a.pale,
      title,
      "09",
      `
    ${heading("07 · In the seven missions", `Where ${a.name} actually appears`, "Node by node, from the registered graph definitions")}
    <table class="mission-table"><thead><tr><th>Mission graph</th><th>What ${esc(a.name)} does in it</th></tr></thead><tbody>${MISSION_ROLES[
      a.name
    ]
      .map(([g, r]) => `<tr><td><b>${esc(g)}</b></td><td>${esc(r)}</td></tr>`)
      .join("")}</tbody></table>
    <div class="callout" style="margin-top:12px"><strong>Reading this honestly</strong><p>“Not involved” is not a limitation, it is the design. A mission asks only the specialists whose evidence it needs, and a specialist cannot add itself to a graph at runtime. The graph is written down, versioned and content-hashed before the run starts.</p></div>
    <h3 style="margin-top:12px">The shape every mission shares</h3>
    ${flow(["Goal", "Parallel reads", "Assessments", "Join", "HEXA verify", "Human gate", "Outcome"])}`,
    ),
  );

  /* 10 — worked example */
  p.push(
    page(
      a.colour,
      a.pale,
      title,
      "10",
      `
    ${heading("08 · Worked example", a.example.title, a.example.note ?? "Real records from the running demo, not an illustration")}
    <div class="steps plain">${a.example.steps.map((x) => `<div class="step"><div><p style="font-size:9.8px">${esc(x)}</p></div></div>`).join("")}</div>
    <div class="callout"><strong>The sentence to say out loud</strong><p>“${a.name} contributes evidence from its own area, with the source records behind it and its limits stated. It does not claim an action is done until the system has recorded and verified it.”</p></div>
    <h3 style="margin-top:12px">Fair questions to ask while watching</h3>
    ${bullets(["Which records is this answer standing on?", "Which permission was checked, and against whom?", "Is this a recorded fact, a simulation, a draft, or a completed result?", "Would this step have waited for a person?", "What happens if the service restarts halfway through?"])}`,
    ),
  );

  /* 11 — boundaries + honest limits */
  p.push(
    page(
      a.colour,
      a.pale,
      title,
      "11",
      `
    ${heading("09 · What is real", "Live today, and deliberately not", "The second column is the one worth reading")}
    <div class="truth">
      <div class="yes"><h3>Working now</h3>${bullets(a.live)}</div>
      <div class="no"><h3>Not built — stated plainly</h3>${bullets(a.limits)}</div>
    </div>
    <div class="stack">
      <div class="stack-row"><b>Identity boundary</b><span>Verified token → tenant and actor</span></div>
      <div class="stack-row"><b>Authority boundary</b><span>Agent allow-list AND the person's permission</span></div>
      <div class="stack-row"><b>Action boundary</b><span>Side effects need an approved ancestor node</span></div>
      <div class="stack-row"><b>Data boundary</b><span>Domain service over a tenant-fenced database</span></div>
      <div class="stack-row"><b>Evidence boundary</b><span>Append-only runs, events, checkpoints and audit</span></div>
    </div>
    <p class="mini">Gaps are listed because a guide that hides them fails the first hour of technical due diligence. Every item on the right is either a roadmap decision or a known defect, and both are recorded in the project's own capability-gap register.</p>`,
    ),
  );

  /* 12 — quick reference */
  p.push(
    page(
      a.colour,
      a.pale,
      title,
      "12",
      `
    ${heading("10 · Quick reference", `${a.name} on one page`, "For explaining the agent to somebody new")}
    ${cards(
      [
        ["Its job", a.summary],
        ["Speaks for", a.owns.map((x) => x[0]).join(", ")],
        ["Takes in", a.receives.join(" · ")],
        ["Gives back", a.produces.join(" · ")],
        ["Can call", a.tools.map((x) => x[0]).join(", ")],
        ["Cannot do", a.limits.slice(0, 3).join(" · ")],
      ],
      "grid-2",
    )}
    <h3 style="margin-top:12px">Words used on these pages</h3>
    <table class="glossary"><tbody>
      <tr><td>Agent</td><td>A named specialist with a fixed, allow-listed set of tools — not a process that can roam.</td></tr>
      <tr><td>Capability</td><td>One registered operation with a declared mode, owner and required permission.</td></tr>
      <tr><td>Mission graph</td><td>A versioned recipe: which steps run, which run together, where it waits for a person.</td></tr>
      <tr><td>Checkpoint</td><td>A stored snapshot after each wave, used to explain a run and to resume it safely.</td></tr>
      <tr><td>Governed work item</td><td>An approved, append-only assignment for a human team — not the business change itself.</td></tr>
    </tbody></table>`,
    ),
  );

  return documentShell(`${a.name} — XELOR agent guide`, p.join(""));
}

function masterGuide() {
  const accent = "#7758e8";
  const pale = "#f0edff";
  const title = "XELOR agent system master guide";
  const p = [];

  p.push(
    page(
      accent,
      pale,
      title,
      "01",
      `
    <div class="eyebrow">XELOR system handbook · built from the implementation</div>
    <h1>The XELOR<br>agent system</h1><div class="rule"></div>
    <p class="lead">Nine agents, nineteen tools and seven missions — and the machinery that keeps all of it inside the authority of the person who asked.</p>
    <div class="cover-note"><b>Covers:</b> what XELOR is, the nine agents, the architecture, every capability, all seven mission graphs, how a run actually executes, the trust model, and what is honestly not built.<br><b>Companion set:</b> one guide per agent.<br><b>Truth standard:</b> the repository as it stands on ${SNAPSHOT}.</div>
    <div class="big-mark">MASTER</div>`,
      "cover",
    ),
  );

  p.push(
    page(
      accent,
      pale,
      title,
      "02",
      `
    ${heading("01 · The idea", "What XELOR is", "A manufacturing system of record, with a controlled layer that reads across it")}
    <div class="callout"><strong>The plain version</strong><p>A factory's information sits in separate places — orders, stock, plans, the shop floor, quality, machines, money, people. Each has its own rules and each is right about its own subject. What nobody has is one honest answer to a question that crosses all of them. XELOR's agents exist for that question, and for nothing else: they do not replace the modules, they read them under the asker's own permissions and put the pieces side by side.</p></div>
    <div class="stat-grid">
      <div class="stat"><b>${SYSTEM.agents}</b><span>named agents</span></div>
      <div class="stat"><b>${SYSTEM.modules}</b><span>product modules</span></div>
      <div class="stat"><b>${SYSTEM.capabilities}</b><span>registered tools</span></div>
      <div class="stat"><b>${SYSTEM.graphs}</b><span>mission graphs</span></div>
    </div>
    ${flow(["Business records", "Module rules", "Registered tools", "Specialists", "ONYX joins", "Human decides"])}
    <div class="grid-2">
      <article class="card"><h3>The modules stay in charge</h3><p>Sales owns orders, Inventory owns stock, Accounts owns journals. An agent calls those services; it never gets its own copy of the data or its own way in.</p></article>
      <article class="card"><h3>The agents make the crossing visible</h3><p>Each contributes only what its own area can prove. ONYX joins it, HEXA checks it, and a person decides anything with a consequence.</p></article>
    </div>`,
    ),
  );

  p.push(
    page(
      accent,
      pale,
      title,
      "03",
      `
    ${heading("02 · The team", "Nine agents, one system", "Each has a full companion guide")}
    <div class="agent-grid">
      ${agents.map((a) => `<article class="agent-card" style="--c:${a.colour}"><b>${a.name} · ${esc(a.label)}</b><p>${esc(a.summary)}</p></article>`).join("")}
    </div>
    <div class="callout"><strong>The counterintuitive part, and the best proof the design is real</strong><p>ONYX is the supervisor, and it is the LEAST powerful agent in the system. It holds one read tool and is not on the allow-list for the one capability that can cause an effect. It can convene a mission and write the summary; it cannot touch the business. A design where the coordinator accumulates power is the failure everyone expects from agent systems — this one gives it the smallest surface of all.</p></div>
    <h3 style="margin-top:11px">How authority is distributed</h3>
    ${cards(
      [
        [
          "One supervisor",
          "ONYX is the only agent that may delegate. The eight specialists cannot recruit each other or widen their own role.",
        ],
        [
          "One control layer",
          "HEXA verifies before and after the human gate, and applies the same tenant, permission and approval rules to everybody.",
        ],
      ],
      "grid-2",
    )}`,
    ),
  );

  p.push(
    page(
      accent,
      pale,
      title,
      "04",
      `
    ${heading("03 · Module map", "Twenty-two modules under nine agents", "The master gives the map; the agent guides explain each module in depth")}
    <table><thead><tr><th>Agent</th><th>Modules</th><th>What the group contributes</th></tr></thead><tbody>
      ${agents.map((a) => `<tr><td><b>${a.name}</b><br><span class="mini">${esc(a.label)}</span></td><td>${a.moduleKeys.map((key) => esc(MODULES.find((m) => m.key === key).name)).join(" · ")}</td><td>${esc(a.coordination)}</td></tr>`).join("")}
    </tbody></table>
    <div class="callout"><strong>One ownership rule prevents a great deal of confusion</strong><p>The module that owns a record is the only place allowed to change it. A mission can combine Sales, stock, plan, quality, finance and service evidence, but it does not create a second cross-functional copy. The agent layer coordinates decisions; domain services remain the system of record.</p></div>`,
      "master-module-map",
    ),
  );

  p.push(
    page(
      accent,
      pale,
      title,
      "05",
      `
    ${heading("04 · Operating loop", "How the modules complete one factory story", "Control and evidence travel with the transaction")}
    ${flow(["MICA<br><small>customer promise</small>", "AXLE<br><small>product + plan</small>", "SPAR<br><small>supply + stock</small>", "KILN<br><small>make + check</small>", "MICA / RASP<br><small>deliver + account</small>", "RELAY<br><small>assure service</small>"])}
    <div class="grid-2">
      <article class="card"><h3>1 · Commit</h3><p>Sales stores the dated customer promise, GST result and credit decision. Planning receives demand; it does not reinterpret the order.</p></article>
      <article class="card"><h3>2 · Plan and supply</h3><p>Engineering defines the BOM. Planning nets demand against stock and supply. Purchase approves a commitment; Inventory records the physical receipt.</p></article>
      <article class="card"><h3>3 · Execute and prove</h3><p>Production pins components and operations. Quality snapshots the limits it judged. Maintenance preserves the uptime evidence behind delivery risk.</p></article>
      <article class="card"><h3>4 · Deliver and account</h3><p>Dispatch posts stock-out and the invoice together. Accounts holds the receivable and later receipt; MICA's Customer Care & Warranty keeps the manufactured-product obligation after delivery.</p></article>
      <article class="card tint"><h3>HEXA surrounds every step</h3><p>Verified identity, tenant fence, permission, approval and audit apply before the business service is allowed to touch a record.</p></article>
      <article class="card tint"><h3>ONYX crosses the loop safely</h3><p>It asks the eight specialists for evidence, joins their answers and waits for the person. It does not take ownership away from any module.</p></article>
      <article class="card tint"><h3>RELAY keeps the service whole</h3><p>It owns onboarding, incident clocks, hand-offs, customer updates, the change calendar and reviews; the affected specialist still owns the technical fix.</p></article>
      <article class="card tint"><h3>ACHILES watches quietly</h3><p>It checks platform availability, records private evidence and stops. RELAY coordinates any incident; the technical owner diagnoses and repairs.</p></article>
    </div>
    <div class="callout"><strong>The Northstar proof</strong><p>The seeded evidence follows one 120-unit PX-400 customer order through MRP, purchase, three production orders, a rejected inspection, 12 quarantined units, 28 dispatched units, an invoice, a receipt, a manufactured-product case, employee spend and a Decision Commander approval. The same identifiers reconcile across the modules.</p></div>`,
    ),
  );

  p.push(
    page(
      accent,
      pale,
      title,
      "06",
      `
    ${heading("05 · Architecture", "How a question reaches trusted data", "Every layer narrows what is possible and keeps the evidence")}
    ${flow(["Person / signal", "Mission", "Specialist", "Registry", "Domain service", "Tenant data", "Audit"])}
    <div class="stack">
      <div class="stack-row"><b>Experience</b><span>Copilot, dashboards, Decision Commander</span></div>
      <div class="stack-row"><b>Coordination</b><span>Graph catalogue, runtime, waves, joins, checkpoints</span></div>
      <div class="stack-row"><b>Governance</b><span>Identity, tenant fence, permissions, approval, kill switch, audit</span></div>
      <div class="stack-row"><b>Capability</b><span>A closed registry of ${SYSTEM.capabilities} operations</span></div>
      <div class="stack-row"><b>Business</b><span>Sales, stock, planning, production, quality, maintenance, finance, people</span></div>
      <div class="stack-row"><b>Managed service</b><span>Catalogue, transition, incident/change coordination, customer communication, improvement</span></div>
      <div class="stack-row"><b>Platform assurance</b><span>Private deterministic checks, freshness and append-only availability history</span></div>
      <div class="stack-row"><b>Data</b><span>Tenant-fenced PostgreSQL, append-only ledgers, durable run records</span></div>
    </div>
    <div class="callout"><strong>There is no database agent</strong><p>An agent cannot write a query. It names a registered capability; the runtime checks who is asking and whether they may; the capability calls a service whose rules are already in force. The reason the Copilot can refuse “ship the held units anyway” is not good judgement — it is that no endpoint exists that would take such an instruction.</p></div>`,
    ),
  );

  p.push(
    page(
      accent,
      pale,
      title,
      "07",
      `
    ${heading("06 · Every tool", `All ${SYSTEM.capabilities} capabilities`, "The complete registry — nothing else is callable")}
    <table class="matrix"><thead><tr><th>Capability</th><th>Mode</th><th>Who may call</th><th>What it returns</th><th>Permission</th></tr></thead><tbody>
      <tr><td>general.companies.read</td><td>Read</td><td>HEXA, ONYX</td><td>Company masters</td><td>general.company.read</td></tr>
      <tr><td>sales.orders.read</td><td>Read</td><td>MICA</td><td>Sales orders</td><td>sales.order.read</td></tr>
      <tr><td>inventory.on-hand.read</td><td>Read</td><td>SPAR</td><td>Stock balances</td><td>inventory.stock.read</td></tr>
      <tr><td>planning.planned-orders.read</td><td>Read</td><td>AXLE</td><td>Planned orders</td><td>planning.mrp.read</td></tr>
      <tr><td>production.orders.read</td><td>Read</td><td>KILN</td><td>Production orders</td><td>production.order.read</td></tr>
      <tr><td>production.factory-connect.read</td><td>Read</td><td>KILN</td><td>Robot, AMR, gateway and material-dwell evidence</td><td>factory.connect.read</td></tr>
      <tr><td>quality.inspections.read</td><td>Read</td><td>KILN</td><td>Inspections</td><td>quality.inspection.read</td></tr>
      <tr><td>accounts.vouchers.read</td><td>Read</td><td>RASP</td><td>Journal vouchers</td><td>accounts.ledger.read</td></tr>
      <tr><td>finance.cash-position.read</td><td>Read</td><td>RASP</td><td>Trial balance</td><td>accounts.ledger.read</td></tr>
      <tr><td>quality.evidence.collect</td><td>Analyse</td><td>KILN</td><td>Evidence view</td><td>quality.inspection.read</td></tr>
      <tr><td>finance.collections.prioritise</td><td>Analyse</td><td>RASP</td><td>Review queue</td><td>accounts.ledger.read</td></tr>
      <tr><td>finance.forecast.simulate</td><td>Simulate</td><td>RASP</td><td>13-week scenario</td><td>accounts.ledger.read</td></tr>
      <tr><td>quality.audit-plan.draft</td><td>Draft</td><td>KILN</td><td>Audit checklist</td><td>quality.inspection.read</td></tr>
      <tr><td>quality.capa-plan.draft</td><td>Draft</td><td>KILN</td><td>Investigation draft</td><td>quality.inspection.read</td></tr>
      <tr><td>quality.audit-pack.draft</td><td>Draft</td><td>KILN</td><td>Evidence manifest</td><td>quality.inspection.read</td></tr>
      <tr><td>finance.funding-pack.draft</td><td>Draft</td><td>RASP</td><td>Draft manifest</td><td>accounts.ledger.read</td></tr>
      <tr><td>managed-services.service-assurance.read</td><td>Read</td><td>RELAY</td><td>Service assurance view</td><td>managed_services.overview.read</td></tr>
      <tr><td>platform-health.status.read</td><td>Read</td><td>ACHILES</td><td>Private platform status and history</td><td>platform_health.overview.read</td></tr>
      <tr><td><b>agent.action.dispatch</b></td><td><b>Execute</b></td><td>HEXA, MICA, SPAR, AXLE, KILN, RASP, RELAY</td><td>Governed work item</td><td>agentos.run.operate</td></tr>
    </tbody></table>
    <div class="callout"><strong>${SYSTEM.capabilities - SYSTEM.sideEffecting} of ${SYSTEM.capabilities} cannot change anything</strong><p>Exactly one capability has a side effect, and a test asserts that count so it cannot drift. That one requires an approved human gate above it in the graph, and the engine checks the ancestry itself rather than trusting the capability to behave. Note also that ONYX and ACHILES are absent from the execute row.</p></div>`,
    ),
  );

  p.push(
    page(
      accent,
      pale,
      title,
      "08",
      `
    ${heading("07 · The seven missions", "Every registered graph", `${GRAPHS.reduce((total, graph) => total + graph.nodes, 0)} nodes in total, all written down before any run starts`)}
    ${GRAPHS.map((g) => `<div class="graph-card"><b>${esc(g.name)}</b><div class="meta">${esc(g.key)} · ${g.nodes} nodes · step budget ${g.maxSteps} · timeout ${g.timeout} · ${g.dispatches} dispatch node${g.dispatches === 1 ? "" : "s"}</div><p>${esc(g.shape)}</p></div>`).join("")}
    <div class="callout"><strong>${SYSTEM.graphs - 1} of ${SYSTEM.graphs} cannot act at all</strong><p>Only the controlled action mission contains dispatch nodes, and it has seven — six domain work items plus one RELAY coordination item, every one structurally downstream of a single human gate. Every remaining graph reads, analyses, drafts and explains. Tests assert that the Factory Flow, Working Capital, QMS and Managed Service Assurance missions contain no dispatch node.</p></div>`,
    ),
  );

  p.push(
    page(
      accent,
      pale,
      title,
      "09",
      `
    ${heading("08 · How a run works", "The execution rules, in plain terms", "The same engine drives all seven missions")}
    ${steps([
      [
        "Everything ready runs together",
        "The engine takes every node whose dependencies are finished and runs that whole wave at once. Eight specialists reading their evidence is one wave, not eight trips.",
      ],
      [
        "A checkpoint after every wave",
        "Progress is written down as it happens, so a run can be explained afterwards and resumed rather than restarted.",
      ],
      [
        "Retries are bounded",
        "A node may be given a second attempt, never more than five, and the limit is validated when the graph is registered rather than at runtime.",
      ],
      [
        "Failure stops the mission",
        "A failed node, a timeout, or a state where nothing can progress ends the run and says so. It does not invent a result to keep things moving.",
      ],
      [
        "Interrupted work is recovered honestly",
        "If the process dies mid-node, that node is returned to pending on resume and re-run — with its attempt count preserved, so recovery cannot be used to escape the retry budget.",
      ],
      [
        "Approval pauses everything",
        "An approval node parks the run. The decision belongs to that exact node in that exact mission and cannot be reused elsewhere.",
      ],
      [
        "Effects need an approved ancestor",
        "Before a side-effecting node runs, the engine walks the graph upward looking for an approval that actually returned yes. No ancestor, no execution — checked by the engine, not by the tool.",
      ],
    ])}`,
    ),
  );

  p.push(
    page(
      accent,
      pale,
      title,
      "10",
      `
    ${heading("09 · Trust model", "Why the person stays in control", "Five boundaries, on every mission, with no exceptions")}
    <div class="stack">
      <div class="stack-row"><b>1 · Identity</b><span>A verified token decides the tenant and the actor</span></div>
      <div class="stack-row"><b>2 · Authority</b><span>The agent's allow-list AND the person's own permission</span></div>
      <div class="stack-row"><b>3 · Action</b><span>A side effect needs an approved ancestor node</span></div>
      <div class="stack-row"><b>4 · Business rules</b><span>The normal domain service still decides what is legal</span></div>
      <div class="stack-row"><b>5 · Evidence</b><span>Runs, nodes, events, checkpoints and audit all persist</span></div>
    </div>
    <div class="grid-2">
      <article class="card"><h3>Failure is visible</h3><p>A failed node, a timeout or a deadlock is recorded and the run stops. Nothing is smoothed over to keep a demo comfortable.</p></article>
      <article class="card"><h3>Recovery is real</h3><p>Checkpoints let an interrupted run continue without pretending the interrupted step had finished.</p></article>
      <article class="card"><h3>AI is fenced separately</h3><p>The governed registry has ${SYSTEM.aiFeatures} routable entries: eight canonical features plus the read-only Copilot still marked <code>in_eval</code>. A separate non-routable Integrations null declaration makes the absence of Integration AI explicit. A kill switch, budgets and evaluation gates constrain promotion.</p></article>
      <article class="card"><h3>Code decides, people approve</h3><p>Tax, stock, quality verdicts, payroll and accounting are arithmetic. A model may phrase an explanation; it never sets the number.</p></article>
    </div>
    <div class="callout"><strong>Where the guarantees are actually kept</strong><p>Continuous integration re-proves the tenant fence on every build, a live two-tenant probe tries to read across the boundary and fails, and all ${SYSTEM.permissions} permissions are reconciled against the routes that demand them. These are gates, not intentions.</p></div>`,
    ),
  );

  p.push(
    page(
      accent,
      pale,
      title,
      "11",
      `
    ${heading("10 · Demo deployment", "How the shareable build is packaged", "Railway-ready five-service topology; no live cloud URL is claimed")}
    ${flow(["Public browser", "Next.js web", "NestJS API", "PostgreSQL", "Valkey"])}
    <div class="stack">
      <div class="stack-row"><b>Web service</b><span>Dynamic Railway port · routes API calls to the public API URL</span></div>
      <div class="stack-row"><b>API service</b><span>Waits for PostgreSQL · migrates · seeds/checkpoints once · starts HTTP</span></div>
      <div class="stack-row"><b>Worker service</b><span>Consumes the transactional outbox independently from the API</span></div>
      <div class="stack-row"><b>PostgreSQL</b><span>Custom demo image with extensions, application role and all durable records</span></div>
      <div class="stack-row"><b>Valkey</b><span>Redis-compatible cache/coordination service, not the source of business truth</span></div>
    </div>
    <div class="grid-2">
      <article class="card"><h3>Public-demo identity</h3><p>The hosted demo opens without the former sign-in screen. An explicit public-demo mode maps a small, fixed persona list to seeded tenant permissions; normal bearer-token checks remain the default outside that mode.</p></article>
      <article class="card"><h3>Repeatable boot</h3><p>Deployment scripts wait for dependencies, apply all migrations, seed only when the checkpoint is absent, and expose liveness/readiness endpoints. Restarts do not blindly rebuild the database.</p></article>
    </div>
    <div class="callout"><strong>Current status</strong><p>The repository contains Railway Dockerfiles, service descriptors, a Compose-equivalent topology and a deployment runbook. A production domain or confirmed public Railway URL is not present in the working directory, so the honest state is “deployment-ready demo packaging”, not “currently hosted”.</p></div>`,
    ),
  );

  p.push(
    page(
      accent,
      pale,
      title,
      "12",
      `
    ${heading("11 · The honest boundary", "What this build does and does not do", "Say the right-hand column out loud before anyone finds it")}
    <div class="truth">
      <div class="yes"><h3>Live in the repository</h3>${bullets([
        "Nine agents with fixed allow-lists",
        `${SYSTEM.capabilities} registered capabilities, one of them effectful`,
        `${SYSTEM.graphs} versioned, content-hashed mission graphs`,
        "Parallel waves, checkpoints, bounded retries, recovery",
        "Tenant fencing and permissions, proven by CI",
        "Approval gates with an append-only trail",
        "Idempotent, approval-bound work-item dispatch",
        "Hash-chained audit with a real verifier",
      ])}</div>
      <div class="no"><h3>Not claimed</h3>${bullets([
        "No external model API is active — reasoning is deterministic",
        "No external connector is live; integration is simulate-driven",
        "No general SQL tool, and no way to create one at runtime",
        "No agent can widen the asking person's permissions",
        "No automatic customer message, payment or posting",
        "A dispatched work item is never described as completed work",
        "No quotation, lead or engineering change control exists",
        "The purchase cycle stops at the goods receipt",
      ])}</div>
    </div>
    <div class="callout"><strong>The one-line disclosure</strong><p>Orchestration, ERP reads, approval gates and governed dispatch are live. Language reasoning is deterministic, and no external model API or connector is active.</p></div>`,
    ),
  );

  p.push(
    page(
      accent,
      pale,
      title,
      "13",
      `
    ${heading("12 · The guide set", "Where to read further", "The master stays short; each agent has its own handbook")}
    <div class="agent-grid">${agents
      .map(
        (a) =>
          `<article class="agent-card" style="--c:${a.colour}"><b>${a.name} · ${esc(a.label)}</b><p>${esc(a.owns.map((x) => x[0]).join(", "))}</p></article>`,
      )
      .join("")}</div>
    <p class="mini" style="margin-top:9px">Each guide follows the same twelve pages: purpose, two module deep dives, the end-to-end business pipeline, enforced rules, runtime contract, exact tools, mission participation, a worked example, honest limits and a quick reference.</p>
    <h3 style="margin-top:11px">Shared glossary</h3>
    <table class="glossary"><tbody>
      <tr><td>Agent</td><td>A named specialist with a fixed, allow-listed tool surface.</td></tr>
      <tr><td>Capability</td><td>One registered operation with a mode, an owner and a required permission.</td></tr>
      <tr><td>Mission graph</td><td>A versioned recipe for steps, parallel work, joins and approval gates.</td></tr>
      <tr><td>Checkpoint</td><td>A durable progress snapshot used for explanation and recovery.</td></tr>
      <tr><td>Governed work item</td><td>An approved, append-only assignment — not the business change itself.</td></tr>
      <tr><td>Verified value</td><td>An observed result with its method recorded, kept distinct from an estimate.</td></tr>
    </tbody></table>
    <p class="mini" style="margin-top:8px">Sources: the capability registry, graph catalogue and run engine; the module services and migrations; the managed-service blueprint; automated tests; ISO/IEC 20000-1, ITIL practice guidance, NIST SP 800-61 Rev. 3, Google SRE SLO guidance and OpenTelemetry. The Cisco CoSol HTML supplied by the user informed the managed-service presentation pattern, not XELOR's implementation claims. Snapshot: ${SNAPSHOT}.</p>`,
    ),
  );

  return documentShell("XELOR agent system — master guide", p.join(""));
}

await mkdir(htmlDir, { recursive: true });
await mkdir(pdfDir, { recursive: true });
await mkdir(proofDir, { recursive: true });

const reports = [
  {
    id: "master",
    html: masterGuide(),
    pdf: "00_XELOR_AGENT_SYSTEM_MASTER_GUIDE.pdf",
  },
  ...agents.map((agent, index) => ({
    id: agent.id,
    html: agentGuide(agent),
    pdf: `${String(index + 1).padStart(2, "0")}_${agent.name}_AGENT_GUIDE.pdf`,
  })),
];

const browser = await chromium.launch();
try {
  for (const report of reports) {
    const htmlPath = resolve(htmlDir, `${report.id}.html`);
    const normalizedHtml = report.html.replace(/[ \t]+$/gm, "");
    await writeFile(htmlPath, normalizedHtml, "utf8");
    const browserPage = await browser.newPage({
      viewport: { width: 1120, height: 1584 },
      deviceScaleFactor: 1,
    });
    await browserPage.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    const overflow = await browserPage.locator(".page").evaluateAll((pages) =>
      pages
        .map((node, index) => ({
          page: index + 1,
          overflowX: node.scrollWidth - node.clientWidth,
          overflowY: node.scrollHeight - node.clientHeight,
        }))
        .filter((x) => x.overflowX > 1 || x.overflowY > 1),
    );
    if (overflow.length)
      throw new Error(
        `${report.id} has page overflow: ${JSON.stringify(overflow)}`,
      );
    await browserPage.emulateMedia({ media: "print" });
    await browserPage.pdf({
      path: resolve(pdfDir, report.pdf),
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    for (const number of report.id === "master"
      ? [1, 5, 6, 7, 9]
      : [1, 3, 4, 6]) {
      await browserPage
        .locator(".page")
        .nth(number - 1)
        .screenshot({ path: resolve(proofDir, `${report.id}-${number}.png`) });
    }
    await browserPage.close();
    process.stdout.write(`Rendered ${report.pdf}\n`);
  }
} finally {
  await browser.close();
}

const sha256 = async (path) =>
  createHash("sha256").update(await readFile(path)).digest("hex");
const rendererPath = fileURLToPath(import.meta.url);
const renderManifest = {
  version: 1,
  renderer: relative(root, rendererPath).replaceAll("\\", "/"),
  rendererSha256: await sha256(rendererPath),
  artifacts: await Promise.all(
    reports.map(async (report) => {
      const sourcePath = resolve(htmlDir, `${report.id}.html`);
      const pdfPath = resolve(pdfDir, report.pdf);
      return {
        id: report.id,
        source: relative(root, sourcePath).replaceAll("\\", "/"),
        sourceSha256: await sha256(sourcePath),
        pdf: relative(root, pdfPath).replaceAll("\\", "/"),
        pdfSha256: await sha256(pdfPath),
      };
    }),
  ),
};
await writeFile(
  resolve(htmlDir, "render-manifest.json"),
  `${JSON.stringify(renderManifest, null, 2)}\n`,
  "utf8",
);

process.stdout.write(`Guide set ready in ${pdfDir}\n`);
