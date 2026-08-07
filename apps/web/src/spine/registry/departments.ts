import type { ModuleManifest } from "./manifest";
import { orderedModules } from "@modules/registry";

/**
 * THE EIGHT AGENTS — seven accountable departments plus ONYX, made visible.
 *
 * Every module already declares its `department`. Until now nothing read it, so the
 * sidebar was sixteen flat groups and the structure existed only in `NAME.md`. It is the
 * organising fact of the whole system and it belongs on screen: departments are cut by
 * SYSTEM-OF-RECORD OWNERSHIP, which is also why a module boundary exists in the code at
 * all. A buyer seeing "Supply Chain owns the stock ledger, and only Supply Chain writes to
 * it" understands the architecture in one sentence.
 *
 * Seven are departments with an owner. ONYX is a COMPONENT — it serves modules across the
 * others and has no business-domain edges of its own, which is precisely why it is
 * horizontal and why its letter is unconstrained.
 *
 * Names are internal engineering identifiers, not customer-facing branding. Four letters
 * each, mineral or industrial, with the departmental initial matching its owner's.
 *
 * SPAR and RASP are anagrams. Accepted knowingly, with one mitigation: neither is ever
 * abbreviated, anywhere — always the full four letters.
 */

/**
 * One blueprint, and what became of it.
 *
 * The correspondence between a specification and the module it shipped as is NOT derivable
 * — `SMBD.md` shipped as `sales`, `INSPECTION.md` as `quality`, `HRM-ATTENDANCE.md` as
 * `hrm`. It has to be written down somewhere, and it is written down here, beside the
 * department that owns both. One fact, one home: this codebase has already paid once for a
 * fact that lived in three places and drifted until 59 endpoints answered 403 to everybody.
 */
export interface Blueprint {
  /** The file under `MVP FILES/`. */
  file: string;
  /**
   * The module key this blueprint shipped as, when it shipped. Compare against the module
   * registry to see whether this build actually contains it — a blueprint with no module
   * present is either a deliberate omission or unfinished work, and which one it is
   * matters commercially.
   */
  moduleKey?: string;
  /**
   * The file does not exist. `ACCOUNTS.md` is the live case: nine modules already emit
   * posting events to an Accounts stub that was never specified. Carried as data rather
   * than quietly omitted, because a card listing it like any other file would present a
   * known hole as finished work.
   */
  missing?: boolean;
}

export interface Department {
  /** The four-letter agent name. Never abbreviated. */
  code: string;
  /** What the department is called in plain words. */
  name: string;
  /** One line: what it is the system of record for. */
  owns: string;
  /** The blueprints it governs, and what each one shipped as. */
  blueprints: readonly Blueprint[];
  /**
   * The accent used for this department's marker. Drawn from MAINDECK's palette, and
   * deliberately NOT the status palette — a department colour must never be mistaken for
   * a document state.
   */
  accent: string;
  /** Lucide icon name. */
  icon: string;
  /** A component rather than a department: horizontal, owns no business domain. */
  component?: boolean;

  /* ------------------------------------------------------------------------
     THE CHARTER, AS THE PITCH DECK STATES IT.

     Transcribed from the Agent Brain view in `AIKYANTRA-Pitch-Deck_2.html` (the `AGENTS`
     and `ONYX` constants inside its embedded demo). Held here rather than written into a
     screen for one reason: the deck and the product were saying different things about the
     same eight agents, and the first investor to open both would find it. There is one
     description of HEXA now, and this is it.

     Where the deck's demo showed a figure it had invented — events on the bus today,
     actions awaiting approval — nothing was copied. Those numbers come from endpoints on
     the dashboard or they do not appear.
     ------------------------------------------------------------------------ */

  /** The single letter on the agent's node. ONYX is the brain and carries a glyph instead. */
  letter: string;
  /** One line, in the deck's voice. "Owns the customer, end to end." */
  tagline: string;
  /** The paragraph a first-time reader gets. */
  blurb: string;
  /** What it can do: an icon name, a title, and the sentence under it. */
  capabilities: readonly { icon: string; title: string; detail: string }[];
  /** The nouns it is the system of record for — chips, not prose. */
  systemOfRecord: readonly string[];
  /**
   * The seams with other agents, named. This is the part of the deck that survives
   * technical due diligence: a boundary is only real if you can say what crosses it.
   */
  contracts: readonly { between: string; through: string }[];
  /**
   * Position on the ring, in degrees, -90 being twelve o'clock. Fixed rather than derived
   * from array order so a department keeps its place on the map when another is added —
   * people navigate this picture by position within a week of using it.
   */
  angle: number;
}

export const DEPARTMENTS: readonly Department[] = [
  {
    code: "ONYX",
    name: "AI Operations",
    owns: "The provider-agnostic router, the closed feature registry, prompt lifecycle, eval gates, the cost ledger, PII egress and the kill switch.",
    blueprints: [{ file: "AI-OPERATIONS.md", moduleKey: "aiops" }],
    letter: "✦",
    angle: 0,
    tagline: "The brain. Horizontal, not departmental.",
    blurb:
      "ONYX is the cross-cutting AI component: a provider-agnostic router, a feature registry, prompt lifecycle and eval gates, a cost ledger, PII egress control and a kill switch. It serves every department and owns no business domain of its own — which is precisely why it is a component and not a department.",
    capabilities: [
      {
        icon: "BrainCircuit",
        title: "Reasons across every agent",
        detail:
          "One question, answered from HEXA's masters, SPAR's ledger, KILN's floor and RASP's books at once.",
      },
      {
        icon: "SlidersHorizontal",
        title: "Provider-agnostic routing",
        detail:
          "Local open-weight model by default; cloud burst only for permitted, non-sensitive payloads.",
      },
      {
        icon: "FlaskConical",
        title: "Eval gates before release",
        detail:
          "No prompt reaches production without passing its regression set. Versioned, diffable, revertible.",
      },
      {
        icon: "OctagonX",
        title: "Kill switch and budgets",
        detail:
          "One toggle suspends every agent. Token budget and PII egress enforced per department.",
      },
    ],
    systemOfRecord: [
      "Provider-agnostic router",
      "Feature registry",
      "Prompt lifecycle",
      "Eval gates",
      "Cost ledger",
      "PII egress",
      "Kill switch",
    ],
    contracts: [
      {
        between: "ONYX ↔ HEXA",
        through:
          "AiGovernancePort — opt-out, token budget, kill switch, ai_action_log; the platform AI router sits behind AiPort",
      },
    ],
    accent: "var(--dept-onyx)",
    icon: "BrainCircuit",
    component: true,
  },
  {
    code: "HEXA",
    name: "Platform & Governance",
    owns: "Master data, identity, access control, the workflow engine, the hash-chained audit trail, the event bus and every external connector.",
    blueprints: [
      { file: "GENERAL.md", moduleKey: "general" },
      { file: "ADMINISTRATION.md", moduleKey: "administration" },
      { file: "INTEGRATION.md", moduleKey: "integration" },
    ],
    letter: "H",
    angle: -90,
    tagline: "Depends on nobody. Everything depends on it.",
    blurb:
      "HEXA ships the ground the whole platform stands on — identity, master data, the workflow engine, the hash-chained audit log and every external connector. No other agent re-implements identity, workflow or audit.",
    capabilities: [
      {
        icon: "KeyRound",
        title: "Single identity spine",
        detail:
          "Keycloak OIDC, role and attribute-based access across every module and every plant.",
      },
      {
        icon: "Settings2",
        title: "One workflow engine",
        detail:
          "One approval engine. Any agent can raise a workflow; none of them owns one.",
      },
      {
        icon: "Link2",
        title: "Hash-chained audit",
        detail:
          "Every material action written to a tamper-evident chain — regulator-ready on demand.",
      },
      {
        icon: "Plug",
        title: "Connector fabric",
        detail:
          "Tally, SAP, WhatsApp, the GST portal, shop-floor gateways — one marketplace, one contract.",
      },
    ],
    systemOfRecord: [
      "Master data",
      "Identity, RBAC and ABAC",
      "Workflow engine",
      "Hash-chained audit",
      "Event bus / outbox",
      "External connectors",
    ],
    contracts: [
      {
        between: "HEXA → every agent",
        through:
          "WorkflowExecutor port, AiPort, outbox_event, hash-chained audit_log, Keycloak OIDC",
      },
    ],
    accent: "var(--dept-hexa)",
    icon: "Shield",
  },
  {
    code: "AXLE",
    name: "Product Engineering & Planning",
    owns: "Intent — what the factory means to build and when. Items, BOMs, routings, change control, MPS, MRP and scheduling.",
    blueprints: [
      { file: "ENGINEERING.md", moduleKey: "engineering" },
      { file: "PLANNING.md", moduleKey: "planning" },
    ],
    letter: "A",
    angle: 64.29,
    tagline: "Owns intent — what we build, and when.",
    blurb:
      "AXLE holds the item, BOM and routing masters and the change control that governs them, then turns confirmed demand into MPS, MRP and a finite schedule the floor can actually run.",
    capabilities: [
      {
        icon: "GitBranch",
        title: "Controlled change",
        detail:
          "An ECR is raised, impact-assessed across open orders, then applied as an ECO with an effective date.",
      },
      {
        icon: "CalendarRange",
        title: "Finite scheduling",
        detail:
          "Sequenced against real capacity, changeover matrices and shift patterns — not infinite buckets.",
      },
      {
        icon: "RefreshCw",
        title: "Net-change MRP",
        detail:
          "Replans only what moved. A deviation from KILN triggers a targeted re-run, not a full regeneration.",
      },
      {
        icon: "Ruler",
        title: "Capacity truth",
        detail:
          "Load against available hours per work centre, with the bottleneck named before the week starts.",
      },
    ],
    systemOfRecord: [
      "Item / BOM / routing masters",
      "ECR → ECO change control",
      "MPS",
      "MRP",
      "Capacity",
      "Finite scheduling",
    ],
    contracts: [
      {
        between: "AXLE ↔ KILN",
        through:
          "Planned orders → work orders · prod.wo.produced / .deviation → net-change replan · eng.eco.applied",
      },
      {
        between: "AXLE ↔ SPAR",
        through: "planning.pr.created → the Purchase MR queue",
      },
    ],
    accent: "var(--dept-axle)",
    icon: "Component",
  },
  {
    code: "SPAR",
    name: "Supply Chain",
    owns: "Supplier and material — the vendor master, purchase order to receipt to payment, and the stock ledger itself.",
    blueprints: [
      { file: "PURCHASE.md", moduleKey: "purchase" },
      { file: "INVENTORY.md", moduleKey: "inventory" },
    ],
    letter: "S",
    angle: 12.86,
    tagline: "Owns supplier, material and the stock ledger.",
    blurb:
      "SPAR closes the reorder → requisition → RFQ → PO → GRN → invoice → payment loop inside one department, and owns the single write path to the stock ledger. Nobody else touches stock tables.",
    capabilities: [
      {
        icon: "Mail",
        title: "Compare before you buy",
        detail:
          "RFQ with landed-cost comparison, an award trail, and automatic vendor scorecard feedback.",
      },
      {
        icon: "Inbox",
        title: "One write path",
        detail:
          "POST /api/stock/entries is the only door into the ledger — every movement is attributable.",
      },
      {
        icon: "Package",
        title: "Right-sized stock",
        detail:
          "Reorder points learned from real consumption and supplier lead-time performance.",
      },
      {
        icon: "Handshake",
        title: "Vendor scorecards",
        detail:
          "Delivery, quality and price drift scored continuously; risk flagged before it bites.",
      },
    ],
    systemOfRecord: [
      "Supplier master",
      "PO → GRN → invoice → payment",
      "Stock ledger",
      "Bins and locations",
      "Valuation",
      "Batches",
    ],
    contracts: [
      {
        between: "SPAR ↔ KILN",
        through:
          "POST /api/stock/entries · purchase.grn.submitted · prod.wo.produced — KILN never writes stock tables",
      },
      {
        between: "AXLE ↔ SPAR",
        through:
          "planning.pr.created → the MR queue · grn.posted → lead-time learning",
      },
    ],
    accent: "var(--dept-spar)",
    icon: "Truck",
  },
  {
    code: "MICA",
    name: "Sales & Product Care",
    owns: "The commercial customer relationship — quotations, sales orders, dispatch, product complaints, warranty, AMC and spare requests.",
    blueprints: [
      // SMBD shipped as `sales` — the correspondence is not derivable from either name.
      { file: "SMBD.md", moduleKey: "sales" },
      { file: "CSP.md", moduleKey: "csp" },
    ],
    letter: "M",
    angle: -38.57,
    tagline: "Owns sales and the manufactured-product relationship after delivery.",
    blurb:
      "MICA runs the customer journey from enquiry and quotation through sales order and dispatch, then keeps the manufactured product connected to complaints, warranty, AMC and spares. It does not run the XELOR technology service; operational incidents affecting XELOR belong to RELAY.",
    capabilities: [
      {
        icon: "TrendingUp",
        title: "One order spine",
        detail:
          "Quotation → sales order → dispatch, with win and loss reasons captured at the moment of decision.",
      },
      {
        icon: "Ticket",
        title: "Product care that closes the loop",
        detail:
          "A complaint about a sold product links to KILN's quality investigation and remains visible until corrective work closes.",
      },
      {
        icon: "Tag",
        title: "Quote intelligence",
        detail:
          "Win probability, price-band history and margin-at-risk on every open quotation.",
      },
      {
        icon: "ShieldCheck",
        title: "Warranty and AMC",
        detail:
          "Coverage, claims and renewal exposure tied to the serial that left the plant.",
      },
    ],
    systemOfRecord: [
      "Customer master",
      "Leads and pipeline",
      "Quotations",
      "Sales orders",
      "Tenders",
      "Product cases and complaints",
      "Warranty / AMC",
    ],
    contracts: [
      { between: "MICA ↔ AXLE", through: "so.confirmed → demand lines" },
      {
        between: "MICA ↔ KILN",
        through:
          "csp.complaint.created.v1 → qms.ncr.created.v1 → qms.capa.status_changed.v1",
      },
      {
        between: "MICA ↔ RELAY",
        through:
          "Manufactured-product cases stay with MICA; XELOR application, integration and AI service incidents stay with RELAY, with a reference link only when both are affected",
      },
    ],
    accent: "var(--dept-mica)",
    icon: "Handshake",
  },
  {
    code: "KILN",
    name: "Manufacturing Operations",
    owns: "Execution — work orders, material issue and output, scrap, batch genealogy, quality gates, NCR and CAPA, and asset uptime.",
    blueprints: [
      { file: "PRODUCTION.md", moduleKey: "production" },
      // INSPECTION shipped as `quality`.
      { file: "INSPECTION.md", moduleKey: "quality" },
      { file: "MAINTENANCE.md", moduleKey: "maintenance" },
    ],
    letter: "K",
    angle: 115.71,
    tagline: "Owns execution on the physical spine.",
    blurb:
      "KILN runs work orders, material moves, scrap and batch genealogy, with quality gates firing inside the production flow and maintenance downtime feeding straight back into OEE. One item, one work centre, one work order, one asset.",
    capabilities: [
      {
        icon: "Factory",
        title: "Gated production",
        detail:
          "Inspection gates fire inside the production flow — a batch cannot advance past a failed gate.",
      },
      {
        icon: "Microscope",
        title: "Root cause that holds",
        detail:
          "Defects linked to machine, batch, shift and parameter — with the evidence attached.",
      },
      {
        icon: "Wrench",
        title: "Condition-led maintenance",
        detail:
          "A risk-ranked work queue, spares reserved and an engineer slot booked before the failure.",
      },
      {
        icon: "ScrollText",
        title: "Full genealogy",
        detail:
          "Any batch, machine or complaint traced end to end in minutes, not weeks.",
      },
    ],
    systemOfRecord: [
      "Work orders",
      "Material moves and scrap",
      "Batch genealogy",
      "Quality gates",
      "NCR / CAPA",
      "Calibration",
      "Asset uptime",
    ],
    contracts: [
      {
        between: "SPAR ↔ KILN",
        through:
          "Production is gated off until Inventory hits its 95–99% stock-accuracy target",
      },
      {
        between: "RASP ↔ KILN",
        through:
          "hrm.attendance.day_finalised.v1 and labour-cost/daily → work-order costing",
      },
    ],
    accent: "var(--dept-kiln)",
    icon: "Factory",
  },
  {
    code: "RASP",
    name: "People & Money",
    owns: "Employees, shifts and attendance, payroll and Indian statutory compliance, budgets, indirect spend and the general ledger.",
    blueprints: [
      { file: "HRM-ATTENDANCE.md", moduleKey: "hrm" },
      // Specified, and deliberately NOT in this build. The clearest demonstration the
      // product has that a module is genuinely removable rather than merely described so.
      { file: "EXPENDITURE.md", moduleKey: "expenditure" },
      { file: "ACCOUNTS.md", moduleKey: "accounts", missing: true },
    ],
    letter: "R",
    angle: 167.14,
    tagline: "Owns people and rupees.",
    blurb:
      "RASP holds the employee master, shifts, attendance, payroll and Indian statutory compliance on one side, and budgets, claims, indirect spend and the general ledger on the other — with labour cost flowing into work-order costing.",
    capabilities: [
      {
        icon: "Users",
        title: "Attendance to cost",
        detail:
          "A day finalised in HR becomes labour cost on the work order the same night.",
      },
      {
        icon: "IndianRupee",
        title: "GST-native cash view",
        detail:
          "GSTR-1, 2B and 3B reconciled invoice by invoice; mismatches flagged early.",
      },
      {
        icon: "BarChart3",
        title: "Budget against actual",
        detail:
          "Indirect spend tracked against budget line by line, with commitment visibility.",
      },
      {
        icon: "Landmark",
        title: "Credit readiness",
        detail:
          "A live pack a bank can read — receivables ageing tied to real orders and dispatches.",
      },
    ],
    systemOfRecord: [
      "Employee master",
      "Shifts and attendance",
      "Payroll and Indian statutory",
      "Budgets",
      "Claims",
      "Indirect spend",
      "General ledger",
    ],
    contracts: [
      {
        between: "RASP ↔ SPAR",
        through:
          "Expenditure raises indirect PRs, then hands off to SPAR's PO engine — it has no PO engine of its own",
      },
    ],
    accent: "var(--dept-rasp)",
    icon: "Landmark",
  },
  {
    code: "RELAY",
    name: "Managed Service Operations",
    owns: "The service around XELOR — catalogue, onboarding, monitoring, incidents, requests, change calendar, service levels, customer updates and continual improvement.",
    blueprints: [
      {
        file: "docs/01-agent-os/04-managed-services.md",
        moduleKey: "managed-services",
      },
    ],
    letter: "R",
    angle: -141.43,
    tagline: "Owns the service clock and the customer handoff.",
    blurb:
      "RELAY wraps XELOR in a managed operating service. It coordinates onboarding, event triage, incidents, changes, service levels and reviews, while the affected specialist still diagnoses and repairs its own technology or business domain. That separation prevents a second support desk from quietly duplicating everyone else's work.",
    capabilities: [
      {
        icon: "ListChecks",
        title: "Service by design",
        detail:
          "Turns customer outcomes into a catalogue, coverage model, measurable objectives, escalation paths and an accepted transition plan.",
      },
      {
        icon: "Siren",
        title: "One incident clock",
        detail:
          "Coordinates severity, escalation, timeline and customer updates while the accountable specialist restores its component.",
      },
      {
        icon: "CalendarClock",
        title: "One change calendar",
        detail:
          "Checks collisions, readiness, communications and post-change service health without taking over the technical change.",
      },
      {
        icon: "Presentation",
        title: "Evidence-led improvement",
        detail:
          "Builds service reviews from measured outcomes, repeat failures, capacity, risk and an owned improvement register.",
      },
    ],
    systemOfRecord: [
      "Service catalogue",
      "Transition and acceptance",
      "Service incidents",
      "Requests",
      "Customer change calendar",
      "SLO and SLA evidence",
      "Service reviews",
      "Improvement register",
    ],
    contracts: [
      {
        between: "RELAY ↔ all specialists",
        through:
          "RELAY owns coordination, service clocks and customer communication; the domain owner supplies technical diagnosis, action and closure evidence",
      },
      {
        between: "RELAY ↔ HEXA",
        through:
          "Operational service incident ↔ security or connector record; HEXA alone determines breach, control and transport remediation",
      },
      {
        between: "RELAY ↔ MICA / KILN",
        through:
          "XELOR service cases stay with RELAY; manufactured-product support stays with MICA and physical-asset restoration stays with KILN",
      },
      {
        between: "RELAY ↔ ONYX",
        through:
          "Service-impact signals may start a bounded business mission; AI controls, prompts, provider incidents and the kill switch stay with ONYX",
      },
    ],
    accent: "var(--dept-relay)",
    icon: "Headset",
  },
];

const BY_CODE = new Map(DEPARTMENTS.map((d) => [d.code, d]));

export function department(code: string): Department | undefined {
  return BY_CODE.get(code);
}

export interface DepartmentGroup {
  department: Department;
  modules: readonly ModuleManifest[];
}

/**
 * Group modules under their owning department, in sidebar order.
 *
 * The group's position is taken from the LOWEST `order` among its own modules rather than
 * from a second hand-written list. One ordering fact, not two that can disagree — the same
 * reasoning that put every permission in a single registry after three copies of that list
 * drifted far enough to 403 every user in the system.
 *
 * A department with no visible modules does not appear at all. That is the point of the
 * three gates: a company that did not buy Maintenance should not be told a Manufacturing
 * Operations department exists and is empty.
 */
export function groupByDepartment(
  modules: readonly ModuleManifest[],
): readonly DepartmentGroup[] {
  const groups = new Map<string, ModuleManifest[]>();
  for (const m of modules) {
    const list = groups.get(m.department);
    if (list) list.push(m);
    else groups.set(m.department, [m]);
  }

  const out: DepartmentGroup[] = [];
  for (const [code, mods] of groups) {
    const dept = BY_CODE.get(code) ?? {
      // A module naming a department nobody registered still has to render. Showing the
      // raw code is honest and self-diagnosing; silently dropping the module would hide a
      // whole area of the product because of a typo in one manifest.
      code,
      name: code,
      owns: "This module names a department that is not in the department registry.",
      blueprints: [],
      accent: "var(--text-muted)",
      icon: "CircleHelp",
      // The charter fields say plainly that there is no charter, rather than leaving the
      // agent map to render a nameless node with empty sections under it.
      letter: "?",
      angle: 0,
      tagline: "Not registered.",
      blurb:
        `A module declares "${code}" as its owning department, but no department with that ` +
        `code is registered. Either the manifest has a typo or a department was removed ` +
        `without its modules being reassigned. Both are worth fixing; neither should hide ` +
        `the module.`,
      capabilities: [],
      systemOfRecord: [],
      contracts: [],
    };
    out.push({
      department: dept,
      modules: [...mods].sort(
        (a, b) => a.order - b.order || a.name.localeCompare(b.name),
      ),
    });
  }

  return out.sort((a, b) => {
    const lowest = (g: DepartmentGroup): number =>
      g.modules.reduce(
        (min, m) => Math.min(min, m.order),
        Number.POSITIVE_INFINITY,
      );
    return (
      lowest(a) - lowest(b) ||
      a.department.code.localeCompare(b.department.code)
    );
  });
}

/**
 * Which modules THIS BUILD actually contains, per department.
 *
 * The accessor exists because a module folder may not import `@modules/registry` — the
 * boundary rule allows that import from the spine, the registry itself and the routes, and
 * nowhere else. That rule is what keeps a module folder deletable, so the answer is not to
 * weaken it for one screen; it is for the spine, which already assembles the sidebar from
 * exactly this data, to expose it.
 *
 * INSTALLED, not visible: this is the registry unfiltered by licence or permission, which
 * is the right answer for a screen describing how the product is organised. What a
 * particular person can open is a different question, and the sidebar already answers it.
 */
export function installedByDepartment(): readonly DepartmentGroup[] {
  return groupByDepartment(orderedModules());
}

/**
 * What happened to a blueprint: is the module it specified actually in this build?
 *
 * The three answers are commercially different and must not be collapsed:
 *   `installed`     — specified and shipped.
 *   `not_in_build`  — specified, shipped once, and left out of this build by decision.
 *                     This is the demonstration that a module is genuinely removable.
 *   `not_written`   — the specification itself does not exist. Unfinished work, not a
 *                     packaging choice.
 * `unknown` is for a blueprint with no module key recorded, and it deliberately claims
 * NOTHING. A missing correspondence must never be able to invent a gap that is not there —
 * under-reporting is recoverable, and telling a buyer a module is absent when it is present
 * is not.
 */
export type BlueprintStatus =
  "installed" | "not_in_build" | "not_written" | "unknown";

export function blueprintStatus(b: Blueprint): BlueprintStatus {
  if (b.missing) return "not_written";
  if (!b.moduleKey) return "unknown";
  return orderedModules().some((m) => m.key === b.moduleKey)
    ? "installed"
    : "not_in_build";
}
