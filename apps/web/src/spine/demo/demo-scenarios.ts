export type DemoPhase =
  | "Discover"
  | "Capture"
  | "Digitise"
  | "Validate"
  | "Trigger"
  | "Investigate"
  | "Calculate"
  | "Coordinate"
  | "Govern"
  | "Human decision"
  | "Execute"
  | "Verify"
  | "Close";

export interface DemoStep {
  phase: DemoPhase;
  title: string;
  path: string;
  body: string;
  presenterLine: string;
  agents: string[];
}

export interface DemoScenario {
  id: string;
  title: string;
  category: string;
  severity: "Urgent" | "High" | "Medium";
  duration: string;
  problem: string;
  decision: string;
  outcome: string;
  icon: string;
  accent: string;
  scale?: "full";
  /** Whether the named record is seeded in the live demo database or narration-only. */
  evidenceMode?: "live" | "illustrative";
  demoRecord?: {
    reference: string;
    subject: string;
    facts: readonly { label: string; value: string }[];
  };
  steps: DemoStep[];
}

/**
 * Presenter guidance only: it navigates and explains but never writes ERP state. The exported
 * Northstar journey is backed by the API seeder and marked live; narration-only scenarios stay
 * in this source file for future work but are not selectable in the investor build.
 */
const focusedDemoScenarios: DemoScenario[] = [
  {
    id: "delivery-recovery",
    title: "Protect the Northstar delivery",
    category: "Live investor journey",
    severity: "Urgent",
    duration: "8–10 min",
    problem: "Northstar ordered 120 PX-400 pumps worth ₹74.34 lakh for 4 September. Twelve of the first forty are quarantined, the sole annealing furnace lost 4.5 hours and the remaining material plan is constrained.",
    decision: "Protect the customer promise without bypassing quality, hiding cost or letting AI approve its own plan.",
    outcome: "One evidence-linked recovery plan, one named human decision and six attributable work items—with every source record still available for challenge.",
    icon: "PackageCheck",
    accent: "#2563eb",
    scale: "full",
    evidenceMode: "live",
    demoRecord: {
      reference: "NPS/PO/10482",
      subject: "Northstar Process Systems · PX-400 delivery commitment",
      facts: [
        { label: "Order", value: "120 PX-400 pumps · ₹74.34 lakh" },
        { label: "Promise", value: "04-Sep-2026" },
        { label: "Current position", value: "28 dispatched · 12 quarantined · 80 remaining" },
        { label: "Control", value: "Human approval required before governed actions" },
      ],
    },
    steps: [
      { phase: "Trigger", title: "Open the decision, not a module", path: "/agentos/commander", body: "The live commander puts Northstar first because its open customer commitment and rejected PX-400 inspection are connected. The guided story then drills into planning, maintenance and finance records without pretending every relationship is already automated.", presenterLine: "A conventional ERP shows separate records. XELOR begins with the decision and keeps every supporting claim open to challenge.", agents: ["ONYX", "MICA", "KILN", "AXLE", "SPAR", "RASP", "HEXA"] },
      { phase: "Investigate", title: "Prove the customer commitment", path: "/sales/orders", body: "Open the live Northstar order: 120 PX-400 pumps, ₹74.34 lakh, IGST, a 4 September promise and the exact credit-limit and exposure snapshots behind the human override.", presenterLine: "The system refused the order first; a person accepted the commercial risk with a recorded reason.", agents: ["MICA", "RASP"] },
      { phase: "Calculate", title: "Expose the material and capacity constraint", path: "/planning/exceptions", body: "The live MRP run expands the three-level PX-400 BOM into shortages, dates and capacity exceptions. Quantities and dates come from deterministic planning logic.", presenterLine: "Software calculates the facts. AI connects and explains them.", agents: ["AXLE", "SPAR"] },
      { phase: "Verify", title: "Keep rejected units out of supply", path: "/quality/inspections", body: "The final inspection records 0.034 mm shaft runout against a 0.020 mm limit. Twelve units remain quarantined and traceable instead of being treated as available stock.", presenterLine: "Received or produced never automatically means usable.", agents: ["KILN", "SPAR"] },
      { phase: "Investigate", title: "Connect the factory constraint", path: "/maintenance/work-orders", body: "Furnace 02—the only 316L annealing route—lost vacuum, cost 4.5 hours and has preventive work due inside the remaining Northstar build.", presenterLine: "The delivery risk includes the machine that makes the promise feasible.", agents: ["KILN", "AXLE"] },
      { phase: "Govern", title: "Follow the recorded financial consequence", path: "/accounts/vouchers", body: "The partial dispatch raised its accounting document through the same transaction as the stock movement. XELOR shows recorded value and deliberately refuses to turn unsupported rates into a loss claim.", presenterLine: "We follow posted financial evidence—and say ‘not available’ where a defensible value does not exist.", agents: ["RASP", "MICA", "HEXA"] },
      { phase: "Human decision", title: "Approve the exact recovery boundary", path: "/agentos/approvals", body: "The approver sees source evidence, proposed work, owners, reversibility and expected outcome. The graph cannot reach an action node without this attributable gate.", presenterLine: "AI can prepare and coordinate the decision. It cannot approve its own work.", agents: ["HEXA", "Human approver"] },
      { phase: "Execute", title: "Dispatch governed work in parallel", path: "/agentos/command", body: "After approval, six specialist work items enter the append-only dispatch ledger. This is an internal governed action boundary—not a claim that an external supplier message or payment was sent.", presenterLine: "Every action has an approved ancestor, a responsible specialist and a verification step.", agents: ["ONYX", "MICA", "SPAR", "AXLE", "KILN", "RASP", "HEXA"] },
      { phase: "Close", title: "Finish on tamper-evident proof", path: "/administration/audit", body: "The stored verifier re-walks the hash-chained audit trail and distinguishes an edited row, a replaced link and a deleted sequence. The demonstration ends on evidence, not animation.", presenterLine: "One decision, seven departments, minutes instead of a day of calls and spreadsheets.", agents: ["HEXA", "ONYX"] },
    ],
  },
  {
    id: "supplier-delay",
    title: "Recover from a supplier delay",
    category: "Supply Chain",
    severity: "High",
    duration: "6–8 min",
    problem: "A supplier moves a critical bearing delivery back by nine days, putting two production orders at risk.",
    decision: "Expedite, use alternate stock or reschedule production.",
    outcome: "The least disruptive plan with cost and customer impact made visible.",
    icon: "Truck",
    accent: "#7c3aed",
    demoRecord: {
      reference: "DEMO-PO-2087",
      subject: "Koyo Bearings · delayed critical supply",
      facts: [
        { label: "Purchase order", value: "480 BRG-6205 bearings" },
        { label: "Supplier change", value: "29-Jul to 07-Aug-2026" },
        { label: "Exposure", value: "2 production orders · 1 customer promise" },
        { label: "Decision window", value: "Approve recovery by 15:00 today" },
      ],
    },
    steps: [
      { phase: "Trigger", title: "Supplier change creates a mission", path: "/purchase/orders", body: "A fictional supplier confirmation changes. ONYX scopes the mission to the affected purchase line, plants and dates.", presenterLine: "The change is detected at its source and bounded before analysis begins.", agents: ["ONYX", "SPAR"] },
      { phase: "Investigate", title: "Measure current cover", path: "/inventory/stock", body: "SPAR checks on-hand, reserved, in-transit and approved substitute stock without changing reservations.", presenterLine: "The agent sees only authorized inventory facts and keeps the ledger untouched.", agents: ["SPAR"] },
      { phase: "Calculate", title: "Propagate the delay", path: "/planning/exceptions", body: "Planning logic calculates which orders and dates are affected. AI groups the exceptions and explains the dependency chain.", presenterLine: "The schedule engine produces dates; AI turns them into a decision-ready story.", agents: ["AXLE", "MICA"] },
      { phase: "Coordinate", title: "Compare production options", path: "/production/orders", body: "ONYX combines supplier, material and production results into expedite, substitute and resequence options.", presenterLine: "Every option shows the trade-off across departments.", agents: ["ONYX", "SPAR", "AXLE"] },
      { phase: "Govern", title: "Check the financial impact", path: "/working-capital/margins", body: "RASP compares premium freight against lost margin and HEXA verifies sourcing and spend-control policy.", presenterLine: "The fastest option is not automatically the best option.", agents: ["RASP", "HEXA"] },
      { phase: "Human decision", title: "Approve the recovery action", path: "/agentos/approvals", body: "The responsible buyer or plant manager would approve one exact action with a written note. Demo Mode submits nothing.", presenterLine: "Authority and intent are explicit before execution can begin.", agents: ["HEXA", "Human approver"] },
    ],
  },
  {
    id: "machine-breakdown",
    title: "Respond to a critical machine breakdown",
    category: "Factory Operations",
    severity: "Urgent",
    duration: "6–8 min",
    problem: "CNC-07 stops during the night shift and threatens today's production plan.",
    decision: "Repair now, move work or change the production sequence.",
    outcome: "A controlled recovery plan with downtime, delivery and margin impact understood.",
    icon: "Wrench",
    accent: "#ea580c",
    demoRecord: {
      reference: "DEMO-DT-CNC07",
      subject: "CNC-07 · unplanned spindle stoppage",
      facts: [
        { label: "Stopped", value: "31-Jul-2026 · 02:18" },
        { label: "Current downtime", value: "5 h 42 min" },
        { label: "Work exposed", value: "WO-1842 and WO-1846 · 360 units" },
        { label: "Safe alternative", value: "CNC-04 available from 14:00" },
      ],
    },
    steps: [
      { phase: "Trigger", title: "Downtime threshold is crossed", path: "/maintenance/downtime", body: "A fictional machine event starts a mission when downtime exceeds the agreed limit. ONYX records scope and desired outcome.", presenterLine: "A machine event can start the same governed mission as a human request.", agents: ["ONYX", "AXLE"] },
      { phase: "Investigate", title: "Review asset history", path: "/maintenance/assets", body: "AXLE reviews prior faults, maintenance status and open work while KILN checks any linked safety or quality controls.", presenterLine: "The team gets context before anyone recommends a repair.", agents: ["AXLE", "KILN"] },
      { phase: "Calculate", title: "Calculate schedule exposure", path: "/production/orders", body: "Production logic identifies operations assigned to CNC-07 and quantifies late-order risk.", presenterLine: "Exact order impact comes from production rules, not model estimation.", agents: ["AXLE", "MICA"] },
      { phase: "Coordinate", title: "Build recovery options", path: "/planning/exceptions", body: "ONYX compares repair, alternate-machine and resequencing plans with constraints attached.", presenterLine: "The system presents choices rather than silently taking control.", agents: ["ONYX", "AXLE", "SPAR"] },
      { phase: "Govern", title: "Check commercial impact", path: "/working-capital/margins", body: "RASP values overtime, lost output and delivery penalties; HEXA checks safety and spending limits.", presenterLine: "Cost, policy and safety are evaluated together.", agents: ["RASP", "HEXA"] },
      { phase: "Human decision", title: "Authorize the recovery plan", path: "/agentos/approvals", body: "A maintenance or plant leader would approve the precise work and owner. No action is executed during this guided demo.", presenterLine: "The approval is easy to find and impossible to confuse with a suggestion.", agents: ["HEXA", "Human approver"] },
    ],
  },
  {
    id: "quality-capa",
    title: "Contain a failed quality inspection",
    category: "Quality",
    severity: "Urgent",
    duration: "7–9 min",
    problem: "An incoming steel batch fails hardness inspection after some material has already been reserved for production.",
    decision: "Contain the batch, protect production and open the right corrective action.",
    outcome: "Traceable containment, root-cause ownership and an audit-ready evidence pack.",
    icon: "ShieldCheck",
    accent: "#dc2626",
    demoRecord: {
      reference: "DEMO-NCR-0317",
      subject: "Batch STL-24-0719 · hardness failure",
      facts: [
        { label: "Inspection", value: "61 HRC measured · 58 HRC maximum" },
        { label: "Quantity", value: "640 kg received · 220 kg reserved" },
        { label: "Locations", value: "Incoming bay and Production Store A" },
        { label: "Immediate control", value: "Batch held · release blocked" },
      ],
    },
    steps: [
      { phase: "Trigger", title: "Inspection failure starts containment", path: "/quality/inspections", body: "A fictional failed result starts a quality mission. KILN limits scope to the batch and related orders.", presenterLine: "The mission begins with containment and a clear boundary.", agents: ["ONYX", "KILN"] },
      { phase: "Investigate", title: "Trace the nonconformance", path: "/quality/findings", body: "KILN assembles inspection, supplier, receipt and reservation evidence while SPAR traces physical locations.", presenterLine: "Every conclusion remains linked to its source evidence.", agents: ["KILN", "SPAR"] },
      { phase: "Calculate", title: "Find affected production", path: "/production/orders", body: "Rules identify which orders consumed or reserved the batch and calculate the exposure.", presenterLine: "Traceability produces a bounded impact list in seconds.", agents: ["AXLE", "KILN"] },
      { phase: "Coordinate", title: "Create corrective work", path: "/quality/corrective-actions", body: "ONYX joins containment, replacement supply and root-cause tasks into an owned plan.", presenterLine: "Containment and prevention are separated, owned and timed.", agents: ["ONYX", "KILN", "SPAR"] },
      { phase: "Govern", title: "Verify competence and evidence", path: "/quality/training", body: "HEXA checks required authority, training and segregation before any release recommendation.", presenterLine: "The system checks whether the person is allowed and qualified to act.", agents: ["HEXA", "KILN"] },
      { phase: "Human decision", title: "Review the evidence pack", path: "/quality/evidence-packs", body: "The quality manager gets one audit-ready package and would decide release, return or scrap. Demo Mode remains read-only.", presenterLine: "The final decision is simple because the evidence trail is already assembled.", agents: ["HEXA", "Human approver"] },
    ],
  },
  {
    id: "cash-collection",
    title: "Prevent a short-term cash squeeze",
    category: "Finance",
    severity: "High",
    duration: "6–8 min",
    problem: "Two large customers are likely to pay late while payroll and a supplier run fall in the same week.",
    decision: "Prioritize collections and payments without damaging key relationships.",
    outcome: "A explainable cash plan with focused actions and finance approval.",
    icon: "IndianRupee",
    accent: "#059669",
    demoRecord: {
      reference: "DEMO-CASH-W32",
      subject: "Week 32 · projected cash buffer breach",
      facts: [
        { label: "Forecast low", value: "₹18.4 L on 08-Aug-2026" },
        { label: "Policy buffer", value: "₹25.0 L" },
        { label: "Receipts at risk", value: "₹31.8 L across 2 customers" },
        { label: "Committed outflow", value: "₹42.6 L payroll and suppliers" },
      ],
    },
    steps: [
      { phase: "Trigger", title: "Cash threshold is forecast to fall", path: "/working-capital/cash-forecast", body: "A fictional 14-day forecast moves below the policy buffer. ONYX opens a finance-scoped mission.", presenterLine: "The warning arrives early enough to choose—not merely react.", agents: ["ONYX", "RASP"] },
      { phase: "Investigate", title: "Find likely late receipts", path: "/working-capital/money-in", body: "RASP ranks receivables using invoice facts and payment behavior; MICA adds customer context.", presenterLine: "The collection team sees where attention is most useful.", agents: ["RASP", "MICA"] },
      { phase: "Calculate", title: "Recalculate the cash position", path: "/working-capital/cash-forecast", body: "Deterministic cash rules recalculate daily balances and confidence ranges. AI explains the drivers.", presenterLine: "The numbers remain finance-grade; AI makes them understandable.", agents: ["RASP"] },
      { phase: "Coordinate", title: "Compare safe responses", path: "/working-capital/scenarios", body: "ONYX compares targeted collections, payment timing and funding options with relationship impact shown.", presenterLine: "The finance team can compare choices before changing anything.", agents: ["ONYX", "RASP", "MICA"] },
      { phase: "Govern", title: "Prepare a decision-ready pack", path: "/working-capital/finance-pack", body: "HEXA checks policy, owner and evidence; the pack records assumptions and the recommended response.", presenterLine: "Management gets one concise pack, with the detail available when needed.", agents: ["RASP", "HEXA"] },
      { phase: "Human decision", title: "Finance approves exact actions", path: "/agentos/approvals", body: "The authorized finance leader would approve selected actions individually. The demonstration cannot post, promise or reschedule anything.", presenterLine: "Demo safety and business approval are both visible here.", agents: ["HEXA", "Human approver"] },
    ],
  },
  {
    id: "demand-spike",
    title: "Handle an unexpected demand spike",
    category: "Planning",
    severity: "High",
    duration: "6–8 min",
    problem: "A customer doubles next month's demand for a fast-moving product, creating component and capacity shortages.",
    decision: "Decide what can be promised, purchased and produced profitably.",
    outcome: "A feasible plan with shortages, spend and working-capital impact exposed.",
    icon: "ChartNoAxesCombined",
    accent: "#0891b2",
    demoRecord: {
      reference: "DEMO-DEM-AUG",
      subject: "PX-400 family · August demand increase",
      facts: [
        { label: "Demand change", value: "1,200 to 2,400 assemblies" },
        { label: "Material gap", value: "1,180 bearings · 620 seals" },
        { label: "Capacity gap", value: "146 machine hours" },
        { label: "Decision", value: "Promise, source and fund the feasible quantity" },
      ],
    },
    steps: [
      { phase: "Trigger", title: "Demand changes beyond tolerance", path: "/planning/demand", body: "A fictional forecast change crosses the planning tolerance. ONYX scopes the mission to one product family and horizon.", presenterLine: "The platform responds to the exception, not every harmless fluctuation.", agents: ["ONYX", "MICA"] },
      { phase: "Investigate", title: "Run material planning", path: "/planning/mrp", body: "AXLE uses lead times, bills of material and capacity to calculate shortages and dates.", presenterLine: "Planning rules do the math; agents coordinate the response.", agents: ["AXLE", "SPAR"] },
      { phase: "Calculate", title: "Confirm usable stock", path: "/inventory/stock", body: "SPAR separates available, reserved, quality-held and incoming quantities.", presenterLine: "A quantity is not called available unless the ledger says it can be used.", agents: ["SPAR", "KILN"] },
      { phase: "Coordinate", title: "Build the supply response", path: "/purchase/orders", body: "ONYX combines purchase, transfer, production and customer-allocation options.", presenterLine: "Sales, supply and production see the same set of options.", agents: ["ONYX", "SPAR", "AXLE", "MICA"] },
      { phase: "Govern", title: "Test the cash impact", path: "/working-capital/stock-cash", body: "RASP shows inventory cash tied up, margin and downside; HEXA checks sourcing and spend policy.", presenterLine: "Growth is tested for cash and margin before it becomes a promise.", agents: ["RASP", "HEXA"] },
      { phase: "Human decision", title: "Approve promise and purchase", path: "/agentos/approvals", body: "The correct commercial and purchasing authorities would approve their exact parts. Demo Mode performs neither action.", presenterLine: "Different decisions go to the right people instead of one blanket approval.", agents: ["HEXA", "Human approver"] },
    ],
  },
  {
    id: "audit-readiness",
    title: "Prepare for a customer audit",
    category: "Compliance",
    severity: "Medium",
    duration: "7–9 min",
    problem: "A key customer schedules an audit in five days and evidence is spread across documents, training and corrective actions.",
    decision: "Close critical gaps and assemble a trustworthy evidence package.",
    outcome: "A prioritized readiness plan and traceable audit pack.",
    icon: "ClipboardCheck",
    accent: "#4f46e5",
    demoRecord: {
      reference: "DEMO-AUD-0826",
      subject: "Apex Mobility · process and quality audit",
      facts: [
        { label: "Audit date", value: "05-Aug-2026 · five days away" },
        { label: "Scope", value: "Receiving, machining, inspection and CAPA" },
        { label: "Evidence status", value: "42 complete · 3 gaps" },
        { label: "Highest risk", value: "2 overdue training renewals" },
      ],
    },
    steps: [
      { phase: "Trigger", title: "Audit notice creates the mission", path: "/quality/audits", body: "A fictional audit date and scope start a bounded readiness mission.", presenterLine: "The audit scope becomes the mission boundary.", agents: ["ONYX", "KILN"] },
      { phase: "Investigate", title: "Check controlled documents", path: "/quality/documents", body: "KILN checks document versions, owners and review dates against the audit scope.", presenterLine: "The agent finds gaps but cannot quietly rewrite controlled documents.", agents: ["KILN", "HEXA"] },
      { phase: "Calculate", title: "Verify training coverage", path: "/quality/training", body: "Rules calculate required-versus-completed training and flag only relevant gaps.", presenterLine: "The result is a precise list, not a generic compliance warning.", agents: ["KILN"] },
      { phase: "Coordinate", title: "Prioritize open findings", path: "/quality/findings", body: "ONYX groups findings by audit risk, due date and owner and creates a focused closure sequence.", presenterLine: "The team sees what matters before the audit and who owns it.", agents: ["ONYX", "KILN"] },
      { phase: "Govern", title: "Assemble auditable evidence", path: "/quality/evidence-packs", body: "HEXA verifies provenance, timestamps and completeness without altering source records.", presenterLine: "The evidence pack points back to the records that prove each claim.", agents: ["HEXA", "KILN"] },
      { phase: "Human decision", title: "Accept the readiness plan", path: "/agentos/approvals", body: "The quality leader would accept owners and due dates for remaining high-risk gaps. Demo Mode records no decision.", presenterLine: "Accountability stays human and visible.", agents: ["HEXA", "Human approver"] },
    ],
  },
  {
    id: "customer-complaint",
    title: "Resolve a customer quality complaint",
    category: "Customer & Quality",
    severity: "High",
    duration: "7–9 min",
    problem: "A customer reports a leaking assembly and provides a serial number from a recently shipped batch.",
    decision: "Define containment, customer response and corrective action from verified traceability.",
    outcome: "Fast customer communication and a defensible root-cause workflow.",
    icon: "MessagesSquare",
    accent: "#db2777",
    demoRecord: {
      reference: "DEMO-CPL-0144",
      subject: "Apex Mobility · leaking PX-400 assembly",
      facts: [
        { label: "Serial number", value: "PX4-260718-0441" },
        { label: "Reported", value: "31-Jul-2026 · customer line stopped" },
        { label: "Trace result", value: "Batch ASM-0718 · 38 units potentially exposed" },
        { label: "Customer update", value: "Human review required before sending" },
      ],
    },
    steps: [
      { phase: "Trigger", title: "Complaint is classified", path: "/csp/tickets", body: "A fictional urgent complaint starts a mission tied to one customer, item and serial number.", presenterLine: "Customer urgency is translated into a controlled internal mission.", agents: ["ONYX", "MICA"] },
      { phase: "Investigate", title: "Open the quality finding", path: "/quality/findings", body: "KILN gathers complaint evidence and checks for similar findings without changing the record.", presenterLine: "Patterns are surfaced while the source evidence stays intact.", agents: ["KILN", "MICA"] },
      { phase: "Calculate", title: "Trace the affected batch", path: "/quality/inspections", body: "Traceability rules link the serial number to batch, inspection, material and production evidence.", presenterLine: "The possible exposure is bounded by records, not guesswork.", agents: ["KILN", "SPAR"] },
      { phase: "Coordinate", title: "Check design and material context", path: "/engineering/items", body: "ONYX combines specification, change and quality evidence into containment and root-cause options.", presenterLine: "Quality and engineering work from the same facts.", agents: ["ONYX", "KILN", "AXLE"] },
      { phase: "Govern", title: "Own the corrective action", path: "/quality/corrective-actions", body: "HEXA verifies owners, deadlines and required approvals for containment and prevention tasks.", presenterLine: "Every action has an owner, due date and evidence requirement.", agents: ["HEXA", "KILN"] },
      { phase: "Human decision", title: "Prepare the customer response", path: "/copilot/ask", body: "Copilot can draft a plain-language response grounded in the assembled evidence, but a person reviews and sends it outside Demo Mode.", presenterLine: "AI helps communicate; the accountable person remains the sender.", agents: ["MICA", "Human reviewer"] },
    ],
  },
  {
    id: "inventory-trace",
    title: "Investigate an inventory mismatch",
    category: "Inventory & Controls",
    severity: "High",
    duration: "6–8 min",
    problem: "A cycle count finds 240 fewer units than the ledger for a controlled component used in customer assemblies.",
    decision: "Locate the variance, protect traceability and correct only with evidence.",
    outcome: "A reconciled chain of movement with controlled financial correction.",
    icon: "ScanSearch",
    accent: "#0f766e",
    demoRecord: {
      reference: "DEMO-IV-0092",
      subject: "BRG-6205 · warehouse count mismatch",
      facts: [
        { label: "Ledger quantity", value: "1,248 units" },
        { label: "Physical count", value: "1,224 units · 24 short" },
        { label: "Last matching event", value: "GRN-260728-019 · 480 received" },
        { label: "Control", value: "No adjustment until evidence is approved" },
      ],
    },
    steps: [
      { phase: "Trigger", title: "Count variance starts investigation", path: "/inventory/stock", body: "A fictional variance exceeds tolerance. ONYX limits the mission to the item, locations and count window.", presenterLine: "The system investigates before anyone adjusts stock.", agents: ["ONYX", "SPAR"] },
      { phase: "Investigate", title: "Compare warehouse locations", path: "/inventory/warehouses", body: "SPAR reviews authorized movement and location evidence across the warehouse.", presenterLine: "The agent follows the material trail without editing it.", agents: ["SPAR"] },
      { phase: "Calculate", title: "Reconcile receiving evidence", path: "/purchase/grn", body: "Rules compare received, accepted, rejected and moved quantities and expose the first mismatch.", presenterLine: "Reconciliation is deterministic and repeatable.", agents: ["SPAR", "KILN"] },
      { phase: "Coordinate", title: "Check inspection disposition", path: "/quality/inspections", body: "ONYX joins warehouse and quality evidence to distinguish loss, timing and disposition errors.", presenterLine: "The team sees cause hypotheses with their supporting evidence.", agents: ["ONYX", "KILN", "SPAR"] },
      { phase: "Govern", title: "Review financial effect", path: "/accounts/vouchers", body: "RASP calculates valuation impact; HEXA checks adjustment authority and segregation of duties.", presenterLine: "A stock change cannot bypass the financial control behind it.", agents: ["RASP", "HEXA"] },
      { phase: "Human decision", title: "Approve a specific correction", path: "/agentos/approvals", body: "An authorized person would approve the exact quantity, location, reason and evidence. The demo never posts an adjustment.", presenterLine: "Specific approval prevents a broad permission from becoming a blank cheque.", agents: ["HEXA", "Human approver"] },
    ],
  },
  {
    id: "cyber-recovery",
    title: "Contain a factory integration incident",
    category: "Security & Resilience",
    severity: "Urgent",
    duration: "7–9 min",
    problem: "Unusual activity appears on a shop-floor integration account while production is running.",
    decision: "Contain the connection, preserve evidence and keep essential operations safe.",
    outcome: "A reversible response, verified recovery and complete audit trail.",
    icon: "ShieldAlert",
    accent: "#b91c1c",
    demoRecord: {
      reference: "DEMO-SEC-0731",
      subject: "Warehouse integration · unusual credential activity",
      facts: [
        { label: "Signal", value: "19 failed calls followed by one success" },
        { label: "Identity", value: "svc-warehouse-sync" },
        { label: "Affected reach", value: "Inventory receipt read and delivery write" },
        { label: "Safe response", value: "Time-bound isolation with rollback" },
      ],
    },
    steps: [
      { phase: "Trigger", title: "Security signal opens an incident", path: "/administration/incidents", body: "A fictional anomaly starts a security-scoped mission. ONYX records severity, boundary and business outcome.", presenterLine: "Security response begins without giving AI unrestricted control.", agents: ["ONYX", "HEXA"] },
      { phase: "Investigate", title: "Preserve the audit trail", path: "/administration/audit", body: "HEXA correlates identity, time and action evidence while preserving the original log.", presenterLine: "Evidence is collected before containment changes the environment.", agents: ["HEXA"] },
      { phase: "Calculate", title: "Check affected authority", path: "/administration/roles", body: "Permission rules calculate the account's exact reach and identify exposed operations.", presenterLine: "Impact is based on effective permissions, not assumptions.", agents: ["HEXA"] },
      { phase: "Coordinate", title: "Choose reversible containment", path: "/integration/connections", body: "ONYX compares isolate, rotate credentials and monitor options, including production impact and rollback steps.", presenterLine: "Reversible controls come first wherever possible.", agents: ["ONYX", "HEXA", "AXLE"] },
      { phase: "Govern", title: "Verify the response plan", path: "/agentos/command", body: "HEXA checks specificity, authority, evidence and post-action verification before proposing execution.", presenterLine: "The plan includes how success will be proven and how repetition is prevented.", agents: ["HEXA", "ONYX"] },
      { phase: "Human decision", title: "Authorize containment", path: "/agentos/approvals", body: "The security owner would approve an exact, time-bounded action. Demo Mode cannot disable, rotate or change any connection.", presenterLine: "Even in an incident, the demo remains completely non-invasive.", agents: ["HEXA", "Human approver"] },
    ],
  },
];

/**
 * Investor mode intentionally exposes one story. The other narration-only scenarios remain
 * source material for future workshops, but competing customers, dates and unsupported
 * capabilities must not appear in the canonical investment demonstration.
 */
export const demoScenarios: DemoScenario[] = [focusedDemoScenarios[0]!];
