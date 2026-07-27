import type { ModuleManifest } from "./manifest";
import { orderedModules } from "@modules/registry";

/**
 * THE SEVEN DEPARTMENTS — the organisation this product is built by, made visible.
 *
 * Every module already declares its `department`. Until now nothing read it, so the
 * sidebar was sixteen flat groups and the structure existed only in `NAME.md`. It is the
 * organising fact of the whole system and it belongs on screen: departments are cut by
 * SYSTEM-OF-RECORD OWNERSHIP, which is also why a module boundary exists in the code at
 * all. A buyer seeing "Supply Chain owns the stock ledger, and only Supply Chain writes to
 * it" understands the architecture in one sentence.
 *
 * Six are departments with an owner. ONYX is a COMPONENT — it serves modules across the
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
}

export const DEPARTMENTS: readonly Department[] = [
  {
    code: "ONYX",
    name: "AI Operations",
    owns: "The provider-agnostic router, the closed feature registry, prompt lifecycle, eval gates, the cost ledger, PII egress and the kill switch.",
    blueprints: [{ file: "AI-OPERATIONS.md", moduleKey: "aiops" }],
    accent: "var(--violet)",
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
    accent: "var(--brand)",
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
    accent: "#0f766e",
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
    accent: "var(--gold)",
    icon: "Truck",
  },
  {
    code: "MICA",
    name: "Commercial",
    owns: "The customer — quotations, sales orders, dispatch and invoicing, service tickets, complaints, warranty and AMC.",
    blueprints: [
      // SMBD shipped as `sales` — the correspondence is not derivable from either name.
      { file: "SMBD.md", moduleKey: "sales" },
      { file: "CSP.md", moduleKey: "csp" },
    ],
    accent: "#1d5fd1",
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
    accent: "var(--warn)",
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
    accent: "var(--ok)",
    icon: "Landmark",
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
    };
    out.push({
      department: dept,
      modules: [...mods].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    });
  }

  return out.sort((a, b) => {
    const lowest = (g: DepartmentGroup): number =>
      g.modules.reduce((min, m) => Math.min(min, m.order), Number.POSITIVE_INFINITY);
    return lowest(a) - lowest(b) || a.department.code.localeCompare(b.department.code);
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
export type BlueprintStatus = "installed" | "not_in_build" | "not_written" | "unknown";

export function blueprintStatus(b: Blueprint): BlueprintStatus {
  if (b.missing) return "not_written";
  if (!b.moduleKey) return "unknown";
  return orderedModules().some((m) => m.key === b.moduleKey) ? "installed" : "not_in_build";
}
