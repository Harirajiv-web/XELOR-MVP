import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const htmlDir = resolve(root, "docs/reports/agent-guides");
const pdfDir = resolve(root, "XELOR_AGENT_GUIDES");
const proofDir = resolve(root, "apps/web/test-results/agent-guide-proofs");

const agents = [
  {
    id: "onyx",
    name: "ONYX",
    label: "Supervisor",
    colour: "#7758e8",
    pale: "#f0edff",
    tagline: "The mission coordinator",
    summary: "Turns a business goal into a controlled plan, assigns the right specialists, joins their evidence and presents one understandable result.",
    owns: [
      ["ONYX Copilot", "The user-facing place to ask a cross-business question and follow the answer."],
      ["Agent OS", "The run engine, mission graphs, checkpoints, approval waits and recovery records."],
      ["AI Operations", "The shared AI feature catalogue, providers, evaluations, costs, reviews, incidents and kill switch."],
    ],
    prefixes: ["agent.*", "workflow.*", "general.*"],
    delegates: ["HEXA", "MICA", "SPAR", "AXLE", "KILN", "RASP"],
    tools: [
      ["general.companies.read", "Read", "Company master", "general.company.read", "No"],
    ],
    receives: ["A user goal", "Signals from dashboards or Decision Commander", "Evidence returned by all specialists", "Approval and verification status"],
    produces: ["A scoped mission", "A joined evidence pack", "A prioritised plan", "A final outcome with limits and next steps"],
    handoffs: [
      ["HEXA", "Checks whether the mission is allowed and whether approval evidence is valid."],
      ["All specialists", "Sends only the work relevant to each agent and waits for their evidence."],
      ["Human approver", "Explains the proposed action before anything effectful can proceed."],
    ],
    exampleTitle: "Can we safely promise the urgent pump order?",
    example: [
      "ONYX frames the question and asks MICA for the customer commitment, SPAR for supply, AXLE for the plan, KILN for production/quality, RASP for money impact and HEXA for control status.",
      "The engine runs independent reads together, stores a checkpoint, then ONYX joins the facts into one readiness view.",
      "If work must be assigned, HEXA checks the action plan, a person approves it, and each specialist receives a governed work item. ONYX reports what actually happened.",
    ],
    controls: ["Cannot grant itself or another agent extra permission", "Cannot bypass the human approval node", "Cannot write directly to a business table", "Every run, node, event and checkpoint is retained"],
    live: ["Registered mission graphs", "Parallel evidence collection", "Durable checkpoints and recovery", "Cross-functional synthesis", "Approval-bound action dispatch"],
    limits: ["Reasoning is deterministic today", "No external model API is active", "No external connector is active", "Dispatched actions are governed work items, not direct ERP mutations"],
  },
  {
    id: "hexa",
    name: "HEXA",
    label: "Governance",
    colour: "#2876d2",
    pale: "#eaf4ff",
    tagline: "The control and trust layer",
    summary: "Protects identity, permissions, policy, budgets, approvals and audit evidence so every mission stays inside the user’s authority.",
    owns: [
      ["Organisation", "Company and organisation setup used to give every record the right business context."],
      ["Administration", "Users, roles, permissions, separation of duties, security and compliance controls."],
      ["Integration", "Reliable connections, retries, idempotency, circuit breakers, webhooks and adapter health."],
    ],
    prefixes: ["agent.*", "workflow.*", "governance.*", "general.*"],
    delegates: [],
    tools: [
      ["general.companies.read", "Read", "Company master", "general.company.read", "No"],
      ["agent.action.dispatch", "Execute", "Governed work item", "agentos.run.operate", "Yes"],
    ],
    receives: ["Verified user and tenant identity", "Requested capability and permission", "Proposed action plan", "Approval record and audit context"],
    produces: ["Allow or refuse result", "Preflight and post-verification evidence", "Approval requirement", "Tamper-evident audit trail"],
    handoffs: [
      ["ONYX", "Returns a clear control decision and the evidence behind it."],
      ["Every specialist", "Applies the same tenant, RBAC and approval boundary to its calls."],
      ["Human approver", "Preserves who approved what, when, and for which exact plan."],
    ],
    exampleTitle: "Is this controlled action genuinely authorised?",
    example: [
      "HEXA checks the signed-in user, tenant, requested permission, graph version and action plan before approval is requested.",
      "The run pauses. A recorded human decision applies only to the exact waiting approval node and its mission context.",
      "After dispatch, HEXA checks the stored work items and audit events; ONYX only receives a verified status, not an unsupported success claim.",
    ],
    controls: ["Tenant is taken from verified identity, never a casual request header", "Agent calls repeat the user’s RBAC check", "Side effects require approval in the graph ancestry", "Audit and dispatch records are append-only"],
    live: ["RBAC and tenant fencing", "Approval preflight and verification", "Budgets, opt-out and kill switch", "Audit evidence", "Resilient integration patterns"],
    limits: ["External connectors are not active in the demo runtime", "Governance can allow or block work; it does not replace a human owner", "Policy quality still depends on correct role and workflow configuration"],
  },
  {
    id: "mica",
    name: "MICA",
    label: "Commercial",
    colour: "#d94b77",
    pale: "#fff0f5",
    tagline: "The customer commitment specialist",
    summary: "Explains what customers ordered, what was promised, what has shipped and what service or warranty obligation remains.",
    owns: [
      ["Sales", "Customers, GST-aware orders, credit checks, requested delivery dates and dispatch."],
      ["Service / CSP", "Customer-isolated tickets, SLA clocks, warranty, complaints, spares, knowledge and reviewable reply drafts."],
    ],
    prefixes: ["sales.*", "customer.*", "agent.*"],
    delegates: [],
    tools: [
      ["sales.orders.read", "Read", "Sales orders", "sales.order.read", "No"],
      ["agent.action.dispatch", "Execute", "Governed work item", "agentos.run.operate", "Yes"],
    ],
    receives: ["Customer order and requested date", "Credit and dispatch state", "Ticket, SLA and entitlement state", "Supply/plan/quality answers from peer agents"],
    produces: ["Commitment view", "Customer-risk evidence", "Commercial follow-up work item", "Clear statement of what is and is not yet promised"],
    handoffs: [
      ["AXLE", "Passes dated customer demand into planning."],
      ["SPAR + KILN", "Uses availability, production and quality evidence before calling a promise safe."],
      ["RASP", "Shares order, credit, receivable and collection context."],
    ],
    exampleTitle: "Which customer promise is at risk?",
    example: [
      "MICA reads open sales orders and keeps the customer’s requested date visible instead of inventing a new date.",
      "ONYX joins that commitment with AXLE’s exception, SPAR’s material position and KILN’s production/inspection state.",
      "MICA can receive an approved follow-up work item, but the current Agent OS does not silently edit the sales order or message the customer.",
    ],
    controls: ["Customer portal rows have both tenant and customer-account isolation", "Sent replies are frozen and drafts cannot make promises", "Dispatch depends on inventory and quality gates", "Commercial actions still inherit user RBAC"],
    live: ["Sales-order evidence", "GST and credit rules", "Dispatch controls", "SLA and warranty computation", "Customer risk contribution to missions"],
    limits: ["Agent OS currently exposes sales-order read, not every Sales/CSP screen", "No automatic customer email or portal message", "Work items require a human owner to complete downstream work"],
  },
  {
    id: "spar",
    name: "SPAR",
    label: "Supply",
    colour: "#c77b13",
    pale: "#fff7e8",
    tagline: "The material availability specialist",
    summary: "Explains what stock exists, what has been ordered from suppliers and where material shortages threaten a plan or promise.",
    owns: [
      ["Purchase", "Vendors, approval-bound purchase orders and goods receipts."],
      ["Inventory", "Warehouses, stock balances and the append-only movement ledger behind the single stock write path."],
    ],
    prefixes: ["inventory.*", "purchase.*", "supplier.*", "agent.*"],
    delegates: [],
    tools: [
      ["inventory.on-hand.read", "Read", "Stock on hand", "inventory.stock.read", "No"],
      ["agent.action.dispatch", "Execute", "Governed work item", "agentos.run.operate", "Yes"],
    ],
    receives: ["On-hand and warehouse position", "Purchase-order and GRN status", "AXLE material requirements", "KILN component demand"],
    produces: ["Availability evidence", "Shortage and supplier-risk explanation", "Procurement/warehouse work item", "Traceable source references"],
    handoffs: [
      ["AXLE", "Compares supply facts with planned material needs."],
      ["KILN", "Shows whether components can be issued for production."],
      ["RASP", "Exposes purchasing and inventory pressure affecting cash."],
    ],
    exampleTitle: "Will material arrive before production needs it?",
    example: [
      "SPAR reads current on-hand stock. The wider Purchase module also holds approved orders and receipts, while Agent OS deliberately exposes a narrower live read surface today.",
      "AXLE supplies the needed-by date and KILN supplies the production context; ONYX joins these facts without making SPAR guess outside its domain.",
      "An approved expedite action becomes an append-only work item. A buyer still reviews and performs the actual supplier action.",
    ],
    controls: ["Only Inventory owns the stock write path", "Balance rows are locked during posting and cannot go negative", "Stock movement history is append-only", "Purchase approval remains behind workflow"],
    live: ["On-hand evidence", "Warehouse and stock ledger foundation", "PO approval and GRN flow", "Supply contribution to cross-functional missions"],
    limits: ["Purchase-order read is present in the product but not yet an Agent OS capability", "No live supplier connector", "No autonomous PO creation or stock adjustment"],
  },
  {
    id: "axle",
    name: "AXLE",
    label: "Planning",
    colour: "#5365d9",
    pale: "#eef0ff",
    tagline: "The product and plan specialist",
    summary: "Connects what the product needs with what demand requires, then explains what to make, what to buy and which dates or capacities are at risk.",
    owns: [
      ["Engineering", "Item masters and bills of material—the product definition used by the rest of the plant."],
      ["Planning", "Forecast, dated demand, MRP, planned orders, capacity, schedules and exceptions."],
    ],
    prefixes: ["engineering.*", "planning.*", "agent.*"],
    delegates: [],
    tools: [
      ["planning.planned-orders.read", "Read", "MRP planned orders", "planning.mrp.read", "No"],
      ["agent.action.dispatch", "Execute", "Governed work item", "agentos.run.operate", "Yes"],
    ],
    receives: ["Customer dates from MICA", "BOM and item definition", "Stock/supply from SPAR", "Capacity and execution state from KILN"],
    produces: ["Planned-order evidence", "Date and capacity exceptions", "Planning work item", "A traceable explanation from demand to proposal"],
    handoffs: [
      ["MICA", "Translates customer dates into demand without changing the promise."],
      ["SPAR", "Separates buy needs from available material."],
      ["KILN", "Shares make requirements and receives execution/capacity truth."],
    ],
    exampleTitle: "What should we make or buy, and by when?",
    example: [
      "AXLE uses dated demand, forecast consumption, the multi-level BOM, stock, open supply, lead times and working-day calendars to produce planned orders.",
      "Completed MRP workings are frozen so a later reviewer can see why a proposal existed. Exceptions expose impossible or late dates rather than hiding them.",
      "Agent OS reads the resulting planned orders. Conversion into a real purchase or production order remains a controlled business step.",
    ],
    controls: ["Completed MRP run details are immutable", "One planned order cannot be converted twice", "MRP planning and reorder-point planning cannot silently overlap", "Past-impossible release dates are surfaced, not backdated"],
    live: ["BOM-based planning foundation", "Planned-order read", "MRP and capacity logic", "Planning exceptions", "Demand-to-plan traceability"],
    limits: ["Agent OS exposes planned-order read, not every planning calculation", "No automatic order conversion", "Plan quality depends on dates, lead times, stock and BOM master data"],
  },
  {
    id: "kiln",
    name: "KILN",
    label: "Operations & Quality",
    colour: "#168e87",
    pale: "#e9fbf8",
    tagline: "The execution, quality and uptime specialist",
    summary: "Explains what the plant is making, whether it passes quality controls and whether machines can keep the schedule running.",
    owns: [
      ["Production", "Orders, snapshotted component requirements, issue, completion and finished-goods receipt."],
      ["QMS & Audit", "Sampling, inspections, dispositions, evidence, CAPA and audit readiness."],
      ["Maintenance", "Assets, work orders, downtime, preventive maintenance and reliability measures."],
    ],
    prefixes: ["production.*", "quality.*", "maintenance.*", "agent.*"],
    delegates: [],
    tools: [
      ["production.orders.read", "Read", "Production orders", "production.order.read", "No"],
      ["quality.inspections.read", "Read", "Inspection state", "quality.inspection.read", "No"],
      ["quality.evidence.collect", "Analyse", "Evidence register", "quality.inspection.read", "No"],
      ["quality.audit-plan.draft", "Draft", "Audit plan", "quality.inspection.read", "No"],
      ["quality.capa-plan.draft", "Draft", "CAPA plan", "quality.inspection.read", "No"],
      ["quality.audit-pack.draft", "Draft", "Audit pack", "quality.inspection.read", "No"],
      ["agent.action.dispatch", "Execute", "Governed work item", "agentos.run.operate", "Yes"],
    ],
    receives: ["Planned make requirement", "Material readiness", "Production and inspection records", "Asset downtime and PM signals"],
    produces: ["Execution and readiness evidence", "Quality gap analysis", "Reviewable audit/CAPA drafts", "Operations work item"],
    handoffs: [
      ["AXLE", "Returns real execution and capacity facts to the plan."],
      ["SPAR", "Uses the controlled inventory path for component issue and finished stock."],
      ["MICA", "Provides production and quality evidence behind a customer commitment."],
    ],
    exampleTitle: "Can this production order finish and pass inspection?",
    example: [
      "KILN reads the production order and inspection state, then connects downtime or preventive-maintenance risk from its broader module ownership.",
      "Quality calculations and lot verdicts are code-based. KILN can collect evidence and create drafts, but a draft is clearly labelled and remains reviewable.",
      "Production cannot mark a controlled completion as good stock unless the required quality gate and inventory posting rules are satisfied.",
    ],
    controls: ["Production uses a BOM snapshot for reproducibility", "Quality limits and sampling context are snapshotted", "Issued stock and dispositions require traceable stock references", "Asset downtime intervals cannot overlap"],
    live: ["Production-order and inspection reads", "Quality evidence and drafting tools", "Quality-gated production", "Downtime/PM foundation", "Operations contribution to missions"],
    limits: ["Maintenance reads are not yet exposed as separate Agent OS capabilities", "Draft plans and packs are not approvals", "No autonomous production, disposition or maintenance closeout"],
  },
  {
    id: "rasp",
    name: "RASP",
    label: "Finance & Working Capital",
    colour: "#2a9160",
    pale: "#ecfaf2",
    tagline: "The money and people-impact specialist",
    summary: "Explains the accounting truth, cash pressure, collections, expenditure and payroll consequences behind an operating decision.",
    owns: [
      ["Accounts", "Append-only journals, general ledger, receivables, settlements and period control."],
      ["Working Capital", "Cash position, forecast simulation, collection priorities and reviewable funding-pack drafts."],
      ["Employee Spend", "Budgets, reservations, claims, advances, GST/TDS checks and posting instructions."],
      ["People / HRM", "Attendance, wages, payroll, statutory calculation and accounting handoff."],
    ],
    prefixes: ["accounts.*", "finance.*", "expenditure.*", "hrm.*", "agent.*"],
    delegates: [],
    tools: [
      ["accounts.vouchers.read", "Read", "Accounting vouchers", "accounts.ledger.read", "No"],
      ["finance.cash-position.read", "Read", "Cash position", "accounts.ledger.read", "No"],
      ["finance.forecast.simulate", "Simulate", "Cash forecast", "accounts.ledger.read", "No"],
      ["finance.collections.prioritise", "Analyse", "Collection queue", "accounts.ledger.read", "No"],
      ["finance.funding-pack.draft", "Draft", "Funding pack", "accounts.ledger.read", "No"],
      ["agent.action.dispatch", "Execute", "Governed work item", "agentos.run.operate", "Yes"],
    ],
    receives: ["Ledger and receivable records", "Orders, purchasing and inventory pressure", "Budget/spend commitments", "Payroll and statutory outcomes"],
    produces: ["Accounting and cash evidence", "Scenario—not prediction—results", "Collection priority", "Reviewable funding draft or finance work item"],
    handoffs: [
      ["MICA", "Connects customer commitments with credit, invoices and collections."],
      ["SPAR + AXLE + KILN", "Shows the cash effect of supply, planning and plant choices."],
      ["HEXA", "Uses approval and separation-of-duties controls for sensitive money work."],
    ],
    exampleTitle: "What is the cash impact of this operating plan?",
    example: [
      "RASP reads ledger-backed cash and voucher evidence, then can run a clearly labelled forecast simulation using stated assumptions.",
      "It prioritises collections using reproducible facts and can draft a funding pack. Drafts and scenarios are never presented as booked accounting truth.",
      "Any follow-up dispatch remains an approved work item; journal posting, payment and payroll stay inside their controlled module workflows.",
    ],
    controls: ["Journals are balanced, append-only and reversed rather than edited", "Closed periods are respected", "Budget availability includes committed and in-approval money", "Statutory rate rows are effective-dated and retained"],
    live: ["Voucher and cash reads", "Forecast simulation", "Collections prioritisation", "Funding-pack drafting", "Ledger/spend/payroll foundations"],
    limits: ["A simulation is not a forecast guarantee", "Funding packs require finance review", "No autonomous posting, payment, collection contact or payroll release"],
  },
];

const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const pills = (items) => `<div class="pills">${items.map((x) => `<span>${esc(x)}</span>`).join("")}</div>`;
const bullets = (items) => `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
const cards = (items, cls = "grid-2") => `<div class="${cls}">${items.map(([title, text]) => `<article class="card"><h3>${esc(title)}</h3><p>${esc(text)}</p></article>`).join("")}</div>`;
const flow = (items) => `<div class="flow">${items.map((x, i) => `${i ? '<span class="arrow">→</span>' : ''}<div class="flow-block">${x}</div>`).join("")}</div>`;
const architecture = (agent) => flow([
  "Person or signal",
  "ONYX<br><small>scope + coordinate</small>",
  `${agent.name}<br><small>${esc(agent.label)}</small>`,
  "Capability registry<br><small>allow-listed tool</small>",
  "Domain service<br><small>business rules</small>",
  "Tenant data + audit",
]);
const sourcePaths = {
  ONYX: ["packages/platform/src/agent-os/types.ts", "apps/api/src/agent-os/agent-graph.engine.ts", "apps/api/src/agent-os/graph-registry.service.ts"],
  HEXA: ["apps/api/src/agent-os/capability-registry.service.ts", "apps/api/src/agent-os/agent-action.service.ts", "apps/api/src/agent-os/agent-authorization.service.ts"],
  MICA: ["apps/api/src/modules/sales/", "apps/api/src/modules/csp/", "apps/api/src/agent-os/capability-registry.service.ts"],
  SPAR: ["apps/api/src/modules/inventory/", "apps/api/src/modules/purchase/", "apps/api/src/ports/stock.port.ts"],
  AXLE: ["apps/api/src/modules/engineering/", "apps/api/src/modules/planning/", "packages/platform/src/planning/"],
  KILN: ["apps/api/src/modules/production/", "apps/api/src/modules/quality/", "apps/api/src/modules/maintenance/"],
  RASP: ["apps/api/src/modules/accounts/", "apps/api/src/modules/expenditure/", "apps/api/src/modules/hrm/"],
};

const css = `
  :root { --ink:#132238; --muted:#5f6f83; --line:#dfe5ed; --paper:#fff; --navy:#101d31; }
  * { box-sizing:border-box; }
  html, body { margin:0; padding:0; background:#dfe4ec; color:var(--ink); font-family:Inter,Arial,sans-serif; }
  @page { size:A4; margin:0; }
  .page { width:210mm; height:297mm; padding:17mm 17mm 15mm; margin:8mm auto; background:var(--paper); position:relative; overflow:hidden; page-break-after:always; }
  .page:last-child { page-break-after:auto; }
  @media print { html,body{background:#fff}.page{margin:0} }
  h1,h2,h3,p { margin-top:0; }
  h1 { font-size:35px; line-height:1.03; letter-spacing:-1.2px; margin-bottom:8px; }
  h2 { font-size:24px; line-height:1.1; letter-spacing:-.5px; margin-bottom:7px; }
  h3 { font-size:12.5px; line-height:1.25; margin-bottom:5px; }
  p,li,td,th { font-size:10.5px; line-height:1.48; }
  p { color:var(--muted); margin-bottom:8px; }
  ul { margin:5px 0 0; padding-left:18px; }
  li { margin-bottom:5px; color:#33445a; }
  small { font-size:8px; color:#67758a; font-weight:500; }
  .eyebrow { color:var(--accent); font-size:9px; letter-spacing:1.7px; text-transform:uppercase; font-weight:800; margin-bottom:9px; }
  .lead { font-size:15px; line-height:1.45; max-width:155mm; color:#34465d; }
  .rule { height:3px; width:24mm; background:var(--accent); margin:10px 0 16px; border-radius:4px; }
  .section-head { display:flex; justify-content:space-between; gap:10mm; align-items:flex-end; border-bottom:1px solid var(--line); padding-bottom:8px; margin-bottom:13px; }
  .section-head p { max-width:74mm; text-align:right; margin:0; }
  .footer { position:absolute; left:17mm; right:17mm; bottom:7mm; display:flex; justify-content:space-between; color:#8994a5; font-size:7.5px; border-top:1px solid #e7ebf0; padding-top:3px; }
  .cover { background:linear-gradient(145deg,var(--navy) 0 60%,var(--accent) 60% 100%); color:white; }
  .cover p { color:#d7dfec; }
  .cover .eyebrow { color:#fff; opacity:.8; margin-top:15mm; }
  .cover h1 { font-size:52px; max-width:142mm; margin-top:40mm; }
  .cover .lead { color:#e8edf5; font-size:17px; max-width:132mm; }
  .cover .cover-note { position:absolute; bottom:27mm; left:17mm; width:106mm; padding:12px 14px; border:1px solid #ffffff42; border-radius:12px; background:#ffffff0d; font-size:10px; line-height:1.5; }
  .cover .footer { color:#d6dfed; border-color:#ffffff25; }
  .big-mark { position:absolute; right:11mm; bottom:18mm; font-size:72px; line-height:.9; font-weight:900; color:#ffffff18; writing-mode:vertical-rl; transform:rotate(180deg); }
  .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
  .grid-3 { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
  .card { border:1px solid var(--line); border-radius:10px; padding:10px 11px; background:#fff; break-inside:avoid; }
  .card h3 { color:var(--accent); }
  .card p { margin:0; font-size:9.5px; }
  .tint { background:var(--pale); border-color:color-mix(in srgb,var(--accent) 20%,white); }
  .callout { border-left:4px solid var(--accent); background:var(--pale); padding:11px 13px; border-radius:0 10px 10px 0; margin:10px 0; }
  .callout strong { display:block; font-size:11px; margin-bottom:4px; }
  .callout p { margin:0; }
  .pills { display:flex; flex-wrap:wrap; gap:5px; margin:7px 0 12px; }
  .pills span { font-size:8px; font-weight:700; border:1px solid var(--line); border-radius:99px; padding:4px 7px; background:#fff; color:#4b5b70; }
  .flow { display:flex; align-items:stretch; gap:5px; margin:14px 0; }
  .flow-block { flex:1; min-width:0; min-height:49px; display:flex; align-items:center; justify-content:center; text-align:center; border:1px solid var(--line); border-top:4px solid var(--accent); border-radius:8px; padding:6px; font-size:9px; font-weight:750; background:#fff; }
  .arrow { display:flex; align-items:center; color:var(--accent); font-size:16px; }
  .swim { display:grid; grid-template-columns:30mm 1fr; border:1px solid var(--line); border-radius:10px; overflow:hidden; margin:8px 0; }
  .swim .who { background:var(--pale); color:var(--accent); font-weight:800; padding:9px; font-size:9px; }
  .swim .what { padding:9px; font-size:9px; color:#33445a; }
  table { width:100%; border-collapse:collapse; margin-top:8px; table-layout:fixed; }
  th { color:#fff; background:var(--accent); text-align:left; font-size:8px; padding:7px; }
  td { border-bottom:1px solid var(--line); padding:7px; font-size:8.2px; vertical-align:top; overflow-wrap:anywhere; }
  tr:nth-child(even) td { background:#f8fafc; }
  .cap-table th:nth-child(1){width:28%}.cap-table th:nth-child(2){width:11%}.cap-table th:nth-child(3){width:22%}.cap-table th:nth-child(4){width:25%}.cap-table th:nth-child(5){width:14%}
  .steps { counter-reset:step; display:grid; gap:7px; }
  .step { display:grid; grid-template-columns:10mm 1fr; gap:8px; align-items:start; border:1px solid var(--line); border-radius:9px; padding:8px; }
  .step:before { counter-increment:step; content:counter(step); width:8mm; height:8mm; border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--accent); color:white; font-weight:800; font-size:9px; }
  .step p { margin:0; font-size:9.5px; }
  .stat-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:12px 0; }
  .stat { background:var(--navy); color:#fff; border-radius:10px; padding:11px; }
  .stat b { display:block; font-size:22px; color:#fff; }
  .stat span { font-size:8px; color:#c8d1de; }
  .agent-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:7px; }
  .agent-card { border:1px solid var(--line); border-left:6px solid var(--c); padding:8px 10px; border-radius:8px; }
  .agent-card b { color:var(--c); font-size:11px; }
  .agent-card p { margin:2px 0 0; font-size:8.8px; }
  .lane { display:grid; grid-template-columns:23mm 1fr; align-items:stretch; border-bottom:1px solid var(--line); }
  .lane:last-child { border-bottom:0; }
  .lane-name { padding:7px; font-size:8px; font-weight:800; color:#fff; background:var(--c); display:flex; align-items:center; }
  .lane-work { padding:7px; display:flex; gap:5px; align-items:center; font-size:8.5px; }
  .lane-work span { padding:5px 7px; border:1px solid var(--line); border-radius:6px; background:#fff; }
  .lane-work i { color:#9aa5b4; font-style:normal; }
  .stack { display:grid; gap:6px; margin:12px auto; max-width:155mm; }
  .stack-row { border:1px solid var(--line); border-left:6px solid var(--accent); padding:9px 12px; border-radius:8px; display:flex; justify-content:space-between; gap:15px; }
  .stack-row b { font-size:10px; }
  .stack-row span { font-size:8.5px; color:var(--muted); text-align:right; }
  .truth { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .truth > div { border-radius:10px; padding:12px; border:1px solid var(--line); }
  .truth .yes { border-top:5px solid #2a9160; }.truth .no { border-top:5px solid #d94b4b; }
  .glossary td:first-child { width:28%; font-weight:800; color:var(--accent); }
  .source { font-family:ui-monospace,Menlo,monospace; font-size:7.8px; overflow-wrap:anywhere; }
  .mini { font-size:8.5px; }
`;

const footer = (title, page) => `<div class="footer"><span>XELOR · ${esc(title)}</span><span>${page}</span></div>`;
const page = (accent, pale, title, n, body, extra = "") => `<section class="page ${extra}" style="--accent:${accent};--pale:${pale}">${body}${footer(title, n)}</section>`;
const documentShell = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;
const heading = (kicker, title, note = "") => `<header class="section-head"><div><div class="eyebrow">${esc(kicker)}</div><h2>${esc(title)}</h2></div>${note ? `<p>${esc(note)}</p>` : ""}</header>`;

function agentGuide(a) {
  const title = `${a.name} agent guide`;
  const toolRows = a.tools.map((row) => `<tr>${row.map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("");
  const pages = [];
  pages.push(page(a.colour, a.pale, title, "01", `
    <div class="eyebrow">XELOR agent handbook · implementation-based</div>
    <h1>${a.name}<br>${esc(a.label)}</h1><div class="rule"></div>
    <p class="lead">${esc(a.tagline)}. ${esc(a.summary)}</p>
    <div class="cover-note"><b>Made for:</b> product, engineering, operations and business teams.<br><b>Reading time:</b> about 12 minutes.<br><b>Truth standard:</b> describes the repository as implemented on 1 August 2026.</div>
    <div class="big-mark">${a.name}</div>`, "cover"));

  pages.push(page(a.colour, a.pale, title, "02", `
    ${heading("01 · At a glance", `What ${a.name} is here to do`, "A role, not an all-powerful chatbot")}
    <div class="callout"><strong>In one sentence</strong><p>${esc(a.summary)}</p></div>
    <div class="stat-grid">
      <div class="stat"><b>${a.owns.length}</b><span>product areas grouped here</span></div>
      <div class="stat"><b>${a.tools.length}</b><span>registered callable tools</span></div>
      <div class="stat"><b>${a.prefixes.length}</b><span>allowed capability prefixes</span></div>
      <div class="stat"><b>${a.delegates.length}</b><span>agents it may delegate to</span></div>
    </div>
    ${cards([["Receives", a.receives.join(" · ")],["Produces", a.produces.join(" · ")]], "grid-2")}
    <h3 style="margin-top:14px">Allowed capability families</h3>${pills(a.prefixes)}
    <div class="callout"><strong>The key distinction</strong><p>The product-area grouping below shows where ${a.name} contributes across XELOR. The callable-tool table later shows the smaller, exact surface Agent OS can invoke today. Product ownership does not automatically create runtime authority.</p></div>`));

  pages.push(page(a.colour, a.pale, title, "03", `
    ${heading("02 · Product grouping", `The business areas under ${a.name}`, "Business ownership is broader than today’s Agent OS tools")}
    ${cards(a.owns, a.owns.length > 2 ? "grid-2" : "grid-2")}
    <div style="margin-top:15px" class="callout"><strong>How to read this grouping</strong><p>${a.name} is the named specialist when a mission needs facts or analysis from these areas. Each module still owns its own rules, records and write paths. The agent coordinates through registered services; it does not become the database owner.</p></div>
    <h3 style="margin-top:15px">What remains true underneath</h3>
    ${bullets(["Each module keeps its own business rules and permissions.", "Cross-module work passes through narrow ports or registered capabilities.", "Tenant isolation, audit and workflow apply regardless of which agent is speaking.", "A readable agent answer never replaces the source record."])}
  `));

  pages.push(page(a.colour, a.pale, title, "04", `
    ${heading("03 · Runtime contract", `How ${a.name} participates in a mission`, "The mission engine controls order, parallel work and recovery")}
    ${architecture(a)}
    <div class="grid-2">
      <article class="card tint"><h3>1 · Scope</h3><p>ONYX turns the goal into a versioned graph run with a fixed tenant, user, limits and expected outputs.</p></article>
      <article class="card tint"><h3>2 · Authorise</h3><p>The capability registry checks that ${a.name} is allowed to call the named tool; RBAC repeats the user permission check.</p></article>
      <article class="card tint"><h3>3 · Execute safely</h3><p>The registered domain service performs the operation. The agent never receives a general SQL doorway.</p></article>
      <article class="card tint"><h3>4 · Preserve evidence</h3><p>Inputs, outputs, node events and checkpoints are stored so the mission can be explained or recovered.</p></article>
    </div>
    <div class="callout"><strong>Delegation</strong><p>${a.delegates.length ? `${a.name} may delegate only to: ${a.delegates.join(", ")}.` : `${a.name} is a specialist and does not delegate to other agents in the current registry.`}</p></div>
  `));

  pages.push(page(a.colour, a.pale, title, "05", `
    ${heading("04 · Exact callable surface", `What ${a.name} can call today`, "Every row is explicitly registered and permission-checked")}
    <table class="cap-table"><thead><tr><th>Capability key</th><th>Mode</th><th>Result</th><th>User permission</th><th>Approval?</th></tr></thead><tbody>${toolRows}</tbody></table>
    <div class="callout"><strong>What “dispatch” means</strong><p>If listed, <span class="source">agent.action.dispatch</span> appends a governed work item for a named specialist. It does not directly change a sales order, stock balance, production order, journal, payment or customer message.</p></div>
    <div class="grid-2">
      <article class="card"><h3>Read / analyse / simulate</h3><p>Returns evidence or a reproducible view. No business record is changed.</p></article>
      <article class="card"><h3>Draft</h3><p>Creates reviewable proposed content. A draft is never labelled as an approved or completed business outcome.</p></article>
      <article class="card"><h3>Execute</h3><p>Effectful at the Agent OS level and therefore requires an approved ancestor node.</p></article>
      <article class="card"><h3>Permission</h3><p>The agent’s allow-list and the signed-in user’s RBAC must both allow the call.</p></article>
    </div>`));

  pages.push(page(a.colour, a.pale, title, "06", `
    ${heading("05 · Coordination", `Who ${a.name} works with`, "Specialists exchange evidence through ONYX, not hidden side conversations")}
    ${a.handoffs.map(([who, what]) => `<div class="swim"><div class="who">${esc(who)}</div><div class="what">${esc(what)}</div></div>`).join("")}
    <h3 style="margin-top:16px">A complete controlled mission</h3>
    ${flow(["Goal", "Parallel reads", "Specialist assessments", "ONYX joins", "HEXA preflight", "Human approval", "Work items", "Verify + report"])}
    <div class="callout"><strong>Why this structure matters</strong><p>Each agent stays accountable for its own facts. ONYX combines them, HEXA checks control evidence, and a person controls the decision boundary. This prevents one fluent answer from quietly becoming authority over the whole company.</p></div>
  `));

  pages.push(page(a.colour, a.pale, title, "07", `
    ${heading("06 · Worked example", a.exampleTitle, "A realistic presentation path from question to controlled outcome")}
    <div class="steps">${a.example.map((x) => `<div class="step"><p>${esc(x)}</p></div>`).join("")}</div>
    <div class="callout"><strong>What the presenter should say</strong><p>“${a.name} contributes verified domain evidence, with source references and limitations. It does not claim that a proposed or dispatched action is complete until the controlled system records and verifies the outcome.”</p></div>
    <h3 style="margin-top:14px">Useful questions to ask during the demo</h3>
    ${bullets([`Which source records support ${a.name}’s answer?`, "What permission was checked?", "Is this a fact, a simulation, a draft or a completed result?", "Would this step wait for human approval?", "What happens if a node times out or the service restarts?"])}
  `));

  pages.push(page(a.colour, a.pale, title, "08", `
    ${heading("07 · Safety and boundaries", `How ${a.name} stays trustworthy`, "Controls are enforced in the runtime and modules, not left to prompt wording")}
    ${cards(a.controls.map((x, i) => [`Control ${i + 1}`, x]), "grid-2")}
    <div class="stack">
      <div class="stack-row"><b>Identity boundary</b><span>Verified user + tenant</span></div>
      <div class="stack-row"><b>Authority boundary</b><span>Agent allow-list + user RBAC</span></div>
      <div class="stack-row"><b>Action boundary</b><span>Approval ancestry for side effects</span></div>
      <div class="stack-row"><b>Data boundary</b><span>Domain service + tenant-fenced database</span></div>
      <div class="stack-row"><b>Evidence boundary</b><span>Append-only run, event and audit records</span></div>
    </div>
  `));

  pages.push(page(a.colour, a.pale, title, "09", `
    ${heading("08 · Implementation truth", `What is live—and what is not`, "This page prevents the demo from overclaiming")}
    <div class="truth">
      <div class="yes"><h3>Live in the repository</h3>${bullets(a.live)}</div>
      <div class="no"><h3>Deliberate current limits</h3>${bullets(a.limits)}</div>
    </div>
    <div class="callout"><strong>Runtime disclosure</strong><p>Orchestration, ERP reads, approval gates and governed action dispatch are live. Language reasoning is deterministic; no external model API or connector is active.</p></div>
    <h3 style="margin-top:13px">Primary implementation references</h3>
    ${sourcePaths[a.name].map((x) => `<div class="card source" style="margin:6px 0">${esc(x)}</div>`).join("")}
    <p class="mini" style="margin-top:9px">This guide is a plain-language operating map, not an API contract. The code, migrations and automated tests remain the binding technical source.</p>
  `));

  pages.push(page(a.colour, a.pale, title, "10", `
    ${heading("09 · Quick reference", `${a.name} in one page`, "Use this page when explaining the agent to a new team member")}
    ${cards([
      ["Job", a.summary],
      ["Owns", a.owns.map((x) => x[0]).join(", ")],
      ["Receives", a.receives.join(" · ")],
      ["Returns", a.produces.join(" · ")],
      ["Can call", a.tools.map((x) => x[0]).join(", ")],
      ["Cannot do", a.limits.join(" · ")],
    ], "grid-2")}
    <h3 style="margin-top:14px">Plain-language glossary</h3>
    <table class="glossary"><tbody>
      <tr><td>Agent</td><td>A named specialist role with an allow-listed set of tools—not a free-roaming process.</td></tr>
      <tr><td>Capability</td><td>One registered operation with an input, output, owner, mode and required permission.</td></tr>
      <tr><td>Graph</td><td>A versioned mission recipe showing order, parallel steps, joins and approvals.</td></tr>
      <tr><td>Checkpoint</td><td>A stored progress snapshot used for explanation and safe recovery.</td></tr>
      <tr><td>Governed work item</td><td>An append-only assignment created after approval; it is not the final business mutation.</td></tr>
    </tbody></table>
  `));
  return documentShell(`${a.name} — XELOR agent guide`, pages.join(""));
}

function masterGuide() {
  const accent = "#7758e8";
  const pale = "#f0edff";
  const title = "XELOR agent system master guide";
  const pages = [];
  pages.push(page(accent, pale, title, "01", `
    <div class="eyebrow">XELOR system handbook · implementation-based</div>
    <h1>The XELOR<br>agent system</h1><div class="rule"></div>
    <p class="lead">A plain-language master guide to the seven agents, their product groupings, and the controlled way they coordinate to turn business questions into evidence-backed work.</p>
    <div class="cover-note"><b>Includes:</b> agent map, architecture blocks, mission flow, collaboration examples, human-control model and current runtime boundary.<br><b>Companion set:</b> one detailed guide for each agent.</div>
    <div class="big-mark">MASTER</div>`, "cover"));

  pages.push(page(accent, pale, title, "02", `
    ${heading("01 · Product model", "What XELOR is", "A manufacturing operating system with a controlled multi-agent coordination layer")}
    <div class="callout"><strong>The simple explanation</strong><p>XELOR connects customer commitments, material, plans, plant execution, quality, maintenance, money, people and governance. Its agents do not replace these modules; they help a user ask one cross-functional question and receive one traceable, controlled answer.</p></div>
    <div class="stat-grid">
      <div class="stat"><b>7</b><span>named agents</span></div><div class="stat"><b>19</b><span>grouped product modules</span></div><div class="stat"><b>16</b><span>registered capabilities</span></div><div class="stat"><b>5</b><span>versioned mission graphs</span></div>
    </div>
    ${flow(["Business records", "Module rules", "Registered capabilities", "Specialist agents", "ONYX coordination", "Controlled outcome"])}
    <div class="grid-2">
      <article class="card"><h3>Modules remain the source of truth</h3><p>Sales owns orders, Inventory owns stock, Accounts owns journals, and so on. Agents call those controlled services.</p></article>
      <article class="card"><h3>Agents make cross-functional work understandable</h3><p>Each agent supplies its own evidence; ONYX joins it, and HEXA protects the decision boundary.</p></article>
    </div>
  `));

  pages.push(page(accent, pale, title, "03", `
    ${heading("02 · Agent map", "Seven agents, one coordinated system", "Each summary is intentionally brief; the companion PDFs hold the detail")}
    <div class="agent-grid">
      ${agents.map((a) => `<article class="agent-card" style="--c:${a.colour}"><b>${a.name} · ${esc(a.label)}</b><p>${esc(a.summary)}</p><p><strong>Grouping:</strong> ${esc(a.owns.map((x) => x[0]).join(", "))}</p></article>`).join("")}
    </div>
    <div class="callout"><strong>The shape of the team</strong><p>ONYX is the only delegating supervisor. HEXA is the shared control layer. MICA, SPAR, AXLE, KILN and RASP are business specialists. A specialist cannot quietly recruit another agent or widen its own role.</p></div>
  `));

  pages.push(page(accent, pale, title, "04", `
    ${heading("03 · Architecture", "How a question reaches trusted business data", "Every block narrows authority and preserves evidence")}
    ${flow(["Person / alert", "ONYX mission", "Named specialist", "Capability registry", "Domain service", "Tenant database", "Audit + outcome"])}
    <div class="stack">
      <div class="stack-row"><b>Experience layer</b><span>Copilot, dashboard and Decision Commander</span></div>
      <div class="stack-row"><b>Coordination layer</b><span>Graph catalogue, runtime, nodes, joins and checkpoints</span></div>
      <div class="stack-row"><b>Governance layer</b><span>Identity, tenant, RBAC, approval, budget, kill switch and audit</span></div>
      <div class="stack-row"><b>Capability layer</b><span>Closed registry of read, analyse, simulate, draft and execute operations</span></div>
      <div class="stack-row"><b>Business layer</b><span>Sales, stock, planning, production, quality, finance and other domain services</span></div>
      <div class="stack-row"><b>Data layer</b><span>Tenant-fenced PostgreSQL, append-only ledgers and durable run records</span></div>
    </div>
    <div class="callout"><strong>No direct database agent</strong><p>An agent cannot compose arbitrary SQL. It receives a named capability, the runtime checks authority, and the capability calls an existing business service whose rules remain in force.</p></div>
  `));

  pages.push(page(accent, pale, title, "05", `
    ${heading("04 · Mission lifecycle", "How the agents coordinate from goal to outcome", "Independent work runs together; dependent work waits for evidence")}
    <div class="lane" style="--c:#7758e8"><div class="lane-name">ONYX</div><div class="lane-work"><span>Scope goal</span><i>→</i><span>Delegate</span><i>→</i><span>Join evidence</span><i>→</i><span>Plan</span><i>→</i><span>Final outcome</span></div></div>
    <div class="lane" style="--c:#d94b77"><div class="lane-name">MICA</div><div class="lane-work"><span>Customer + order</span><i>→</i><span>Commercial assessment</span><i>→</i><span>Approved work item</span></div></div>
    <div class="lane" style="--c:#c77b13"><div class="lane-name">SPAR</div><div class="lane-work"><span>Stock + supply</span><i>→</i><span>Supply assessment</span><i>→</i><span>Approved work item</span></div></div>
    <div class="lane" style="--c:#5365d9"><div class="lane-name">AXLE</div><div class="lane-work"><span>Planned orders</span><i>→</i><span>Planning assessment</span><i>→</i><span>Approved work item</span></div></div>
    <div class="lane" style="--c:#168e87"><div class="lane-name">KILN</div><div class="lane-work"><span>Production + quality</span><i>→</i><span>Operations assessment</span><i>→</i><span>Approved work item</span></div></div>
    <div class="lane" style="--c:#2a9160"><div class="lane-name">RASP</div><div class="lane-work"><span>Cash + ledger</span><i>→</i><span>Finance assessment</span><i>→</i><span>Approved work item</span></div></div>
    <div class="lane" style="--c:#2876d2"><div class="lane-name">HEXA</div><div class="lane-work"><span>Continuous controls</span><i>→</i><span>Preflight</span><i>→</i><span>Human gate</span><i>→</i><span>Post-verify</span></div></div>
    <div class="callout"><strong>Runtime behaviour</strong><p>Ready nodes run in parallel waves. After each wave, XELOR stores a checkpoint. Failed nodes, timeouts or deadlocks stop the run safely; interrupted nodes can be recovered without pretending they completed.</p></div>
  `));

  pages.push(page(accent, pale, title, "06", `
    ${heading("05 · Controlled action", "What happens when a mission needs follow-up work", "The demo has approval-bound dispatch, not silent autonomous ERP writes")}
    <div class="steps">
      <div class="step"><p><b>Read.</b> The six live business reads gather company, order, stock, planned-order, production, inspection and finance evidence where required.</p></div>
      <div class="step"><p><b>Assess.</b> Specialists explain their own area. ONYX combines the evidence into a proposed cross-functional action plan.</p></div>
      <div class="step"><p><b>Preflight.</b> HEXA checks the user, tenant, permission, graph context and proposed action before any approval request.</p></div>
      <div class="step"><p><b>Approve.</b> The graph pauses for a human. Approval belongs to that exact waiting node and mission context.</p></div>
      <div class="step"><p><b>Dispatch.</b> Approved specialist assignments are appended as governed work items; retries do not duplicate them.</p></div>
      <div class="step"><p><b>Verify.</b> HEXA verifies records and audit evidence; ONYX reports the observed outcome and any remaining limits.</p></div>
    </div>
    <div class="callout"><strong>Investor-demo wording</strong><p>Say “the system has created approved, traceable work for the responsible teams.” Do not say “the agents changed every ERP record automatically,” because that is deliberately outside the current runtime.</p></div>
  `));

  pages.push(page(accent, pale, title, "07", `
    ${heading("06 · Collaboration examples", "How the groupings make one business answer", "The value comes from joined evidence, not seven isolated chat windows")}
    ${cards([
      ["Delivery promise", "MICA supplies the customer date; SPAR the material; AXLE the plan; KILN execution and quality; RASP the cash effect; HEXA the controls; ONYX gives one readiness answer."],
      ["Quality and audit readiness", "KILN gathers inspections and drafts evidence/CAPA/audit packs. SPAR traces incoming material, AXLE the product/plan context, HEXA the approvals, and ONYX the readiness gaps."],
      ["Working-capital review", "RASP leads cash, vouchers, scenarios and collections. MICA adds receivables context, SPAR purchasing/inventory pressure, AXLE planned demand, KILN operating impact, and HEXA control evidence."],
      ["Full command review", "ONYX runs a broad operational view, keeps specialist facts separate, highlights conflicts and publishes a prioritised evidence-backed summary."],
    ], "grid-2")}
    <h3 style="margin-top:15px">Five registered graph recipes</h3>
    ${bullets(["Foundation cross-functional readiness", "Full command review", "Controlled action mission", "Finance working-capital review", "Quality QMS/audit readiness"])}
  `));

  pages.push(page(accent, pale, title, "08", `
    ${heading("07 · Trust model", "Why the user remains in control", "Five boundaries apply to every mission")}
    <div class="stack">
      <div class="stack-row"><b>1 · Identity</b><span>Verified token determines the user and tenant</span></div>
      <div class="stack-row"><b>2 · Authority</b><span>Agent allow-list AND the user’s permission must pass</span></div>
      <div class="stack-row"><b>3 · Action</b><span>Side effects need an approved ancestor node</span></div>
      <div class="stack-row"><b>4 · Business rules</b><span>The normal domain service remains in charge</span></div>
      <div class="stack-row"><b>5 · Evidence</b><span>Runs, nodes, events, checkpoints, approvals and audit persist</span></div>
    </div>
    <div class="grid-2">
      <article class="card"><h3>Failure is explicit</h3><p>The graph records a failed node, timeout or deadlock and stops. It does not fabricate a successful answer to keep the presentation smooth.</p></article>
      <article class="card"><h3>Recovery is durable</h3><p>Stored checkpoints let a run recover interrupted work with idempotent capability rules and visible history.</p></article>
      <article class="card"><h3>AI is governed</h3><p>A closed feature registry, provider router, opt-out, budget, kill switch, evaluation gate and hash-chained log surround AI use.</p></article>
      <article class="card"><h3>Code and humans decide</h3><p>Deterministic code applies accounting, quality, tax, stock and workflow rules. A person controls approval-bound action.</p></article>
    </div>
  `));

  pages.push(page(accent, pale, title, "09", `
    ${heading("08 · Current implementation boundary", "What the MVP honestly demonstrates", "A strong demo is clear about the boundary between live, controlled and future")}
    <div class="truth">
      <div class="yes"><h3>Live now</h3>${bullets(["Seven registered agent identities and prefixes", "Sixteen allow-listed capabilities", "Five versioned mission graphs", "Parallel nodes, joins, checkpoints and recovery", "RBAC, tenant fencing, approval waits and audit", "Read, analyse, simulate and draft tools", "Approval-bound, idempotent work-item dispatch", "Decision Commander evidence joins and outcome attribution"])} </div>
      <div class="no"><h3>Not claimed</h3>${bullets(["No external model API is active", "No external connector is active", "Language reasoning is deterministic", "No general-purpose direct SQL tool", "No agent can widen the user’s permission", "No automatic customer message, payment or posting", "No dispatched work item is described as completed business work", "No simulation or draft is labelled as fact"])} </div>
    </div>
    <div class="callout"><strong>The one-line disclosure</strong><p>Orchestration, ERP reads, approval gates and governed action dispatch are live. Language reasoning is deterministic; no external model API or connector is active.</p></div>
  `));

  pages.push(page(accent, pale, title, "10", `
    ${heading("09 · Guide set", "Where to go for detail", "The master stays short; each agent has its own complete handbook")}
    <div class="agent-grid">${agents.map((a) => `<article class="agent-card" style="--c:${a.colour}"><b>${a.name} guide</b><p>Role, grouped modules, runtime contract, exact callable tools, handoffs, worked example, safety controls and implementation limits.</p></article>`).join("")}</div>
    <h3 style="margin-top:14px">Shared glossary</h3>
    <table class="glossary"><tbody>
      <tr><td>Agent</td><td>A named specialist with an allow-listed tool surface.</td></tr>
      <tr><td>Capability</td><td>One registered operation with mode, owner and required user permission.</td></tr>
      <tr><td>Mission graph</td><td>A versioned recipe for steps, parallel work, joins and approval gates.</td></tr>
      <tr><td>Checkpoint</td><td>A durable progress snapshot for explanation and recovery.</td></tr>
      <tr><td>Governed work item</td><td>An approved, append-only assignment—not a direct mutation of the business record.</td></tr>
      <tr><td>Verified value</td><td>An observed result with method and supported/partial attribution; distinct from an estimate.</td></tr>
    </tbody></table>
    <p class="mini" style="margin-top:10px">Research basis: runtime types, capability registry, graph catalogue and runtime, action dispatch, Decision Commander, AI spine, module services, schema migrations, tests and product documentation in this repository. Snapshot: 1 August 2026.</p>
  `));
  return documentShell("XELOR agent system — master guide", pages.join(""));
}

await mkdir(htmlDir, { recursive: true });
await mkdir(pdfDir, { recursive: true });
await mkdir(proofDir, { recursive: true });

const reports = [
  { id: "master", html: masterGuide(), pdf: "00_XELOR_AGENT_SYSTEM_MASTER_GUIDE.pdf" },
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
    await writeFile(htmlPath, report.html, "utf8");
    const browserPage = await browser.newPage({ viewport: { width: 1120, height: 1584 }, deviceScaleFactor: 1 });
    await browserPage.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    const overflow = await browserPage.locator(".page").evaluateAll((pages) => pages.map((node, index) => ({
      page: index + 1,
      overflowX: node.scrollWidth - node.clientWidth,
      overflowY: node.scrollHeight - node.clientHeight,
    })).filter((x) => x.overflowX > 1 || x.overflowY > 1));
    if (overflow.length) throw new Error(`${report.id} has page overflow: ${JSON.stringify(overflow)}`);
    await browserPage.emulateMedia({ media: "print" });
    await browserPage.pdf({
      path: resolve(pdfDir, report.pdf),
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    for (const number of report.id === "master" ? [1, 3, 4, 6, 9] : [1, 5, 9]) {
      await browserPage.locator(".page").nth(number - 1).screenshot({ path: resolve(proofDir, `${report.id}-${number}.png`) });
    }
    await browserPage.close();
    process.stdout.write(`Rendered ${report.pdf}\n`);
  }
} finally {
  await browser.close();
}

process.stdout.write(`Guide set ready in ${pdfDir}\n`);
