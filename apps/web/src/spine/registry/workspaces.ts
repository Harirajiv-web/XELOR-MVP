import type { ModuleManifest } from "./manifest";

/**
 * WHAT YOU ARE TRYING TO DO — the sidebar's organising fact.
 *
 * The sidebar used to group by owning DEPARTMENT, which is the right answer to "who is
 * accountable for this code" and the wrong answer to "where do I click". It produced nine
 * groups of wildly uneven weight — ONYX held five modules, ACHILES held one — and 132 nav
 * entries under them. Nobody reads 132 of anything.
 *
 * Research on information architecture puts the workable ceiling at around eight top-level
 * groups: below that, unrelated concerns get forced into one bucket and findability suffers;
 * above it, the cross-references between groups start to break the user's flow. Hick's law
 * does the rest — a flat list of twenty-three choices is not a menu, it is a delay.
 *
 * So this file holds ONE mapping, from module key to the job it serves. Deliberately a
 * lookup table rather than a `workspace` field on every manifest:
 *
 *   · twenty-three manifests stay untouched, so nothing about a module's own contract
 *     changes because the navigation was reorganised;
 *   · the DEPARTMENT stays exactly as it was, because it is still true — the department
 *     pages, the agent map and the ownership story all keep working;
 *   · and the grouping can be re-argued by editing one array, which is what will actually
 *     happen the first time somebody watches a customer look for something.
 *
 * A module that appears in no workspace still renders, under "Everything else". Silently
 * dropping a whole area of the product because somebody forgot a line here would be a far
 * worse failure than an untidy group.
 */

export interface Workspace {
  code: string;
  /** What a person would call it. Not a department name, not a noun-phrase from the schema. */
  name: string;
  /** One line, shown under the heading. Says what you come here to DO. */
  purpose: string;
  /** Lucide icon name. */
  icon: string;
  /** CSS custom property. Never a literal colour — see the theming rule in CLAUDE.md. */
  accent: string;
  /** Module keys, in the order they should appear. */
  modules: readonly string[];
}

export const WORKSPACES: readonly Workspace[] = [
  {
    code: "mission",
    name: "Mission Control",
    purpose: "Give XELOR an order and watch it run. This is the operating system itself.",
    icon: "Radar",
    accent: "var(--dept-onyx)",
    // First, and alone at the top, because it is the product. Everything below it is the
    // substrate the missions act on — which is the entire argument this demo is making.
    modules: ["fulfilment", "agentos", "copilot", "aicontrol"],
  },
  {
    code: "demand",
    name: "Orders & Customers",
    purpose: "What has been promised, to whom, and how well it is being served.",
    icon: "Handshake",
    accent: "var(--dept-mica)",
    modules: ["sales", "csp"],
  },
  {
    code: "define",
    name: "Design & Plan",
    purpose: "What the product is made of, and what has to happen to build it.",
    icon: "DraftingCompass",
    accent: "var(--dept-axle)",
    // `planning`, not `critical`. Worth recording, because the wrong key here is INVISIBLE:
    // an unknown key silently matches no module, and the real module falls through to
    // "Everything else" at the bottom of the sidebar — present, findable, and quietly in
    // the wrong place. `critical` is a severity band declared inside the planning module
    // (`planning/manifest.ts:139`), and a first-match grep for `key:` finds it before the
    // manifest's own key nineteen lines further down.
    modules: ["engineering", "planning"],
  },
  {
    code: "supply",
    name: "Buy & Store",
    purpose: "Getting the material in, and knowing exactly what is on the shelf.",
    icon: "PackageSearch",
    accent: "var(--dept-spar)",
    modules: ["purchase", "inventory"],
  },
  {
    code: "make",
    name: "Make & Prove",
    purpose: "Building it, proving it meets spec, and keeping the machines running.",
    icon: "Factory",
    accent: "var(--dept-kiln)",
    modules: ["production", "quality", "maintenance"],
  },
  {
    code: "money",
    name: "Money & People",
    purpose: "What it cost, what is owed, what is owned, and who did the work.",
    icon: "IndianRupee",
    accent: "var(--dept-rasp)",
    modules: ["accounts", "working-capital", "expenditure", "hrm"],
  },
  {
    code: "platform",
    name: "Platform",
    purpose: "The company record, who may see what, and how XELOR itself is running.",
    icon: "Settings2",
    accent: "var(--dept-hexa)",
    // Managed Services and Platform Health live here rather than in their own groups: they
    // are how XELOR is operated, not how the factory is. Two departments, one job.
    modules: ["general", "administration", "integration", "aiops", "managed-services", "platform-health"],
  },
];

const WORKSPACE_OF = new Map<string, Workspace>();
for (const w of WORKSPACES) {
  for (const key of w.modules) WORKSPACE_OF.set(key, w);
}

/** Where an unplaced module goes. Visible, and visibly unplaced. */
const ORPHANAGE: Workspace = {
  code: "other",
  name: "Everything else",
  purpose: "Modules that have not been given a home in the navigation yet.",
  icon: "CircleHelp",
  accent: "var(--text-muted)",
  modules: [],
};

export interface WorkspaceGroup {
  workspace: Workspace;
  modules: readonly ModuleManifest[];
}

/**
 * Group the modules this person may actually open, by the job they serve.
 *
 * Order within a group follows THIS file, not the module's own `order`. That is the whole
 * point of the change: `order` encodes a global ranking across twenty-three modules, which
 * is exactly the flat list being replaced. A group with two modules should show them in the
 * order a person would use them, and only this file knows what that order is.
 *
 * An empty group does not render. A company that did not licence Maintenance should not be
 * shown a "Make & Prove" heading with nothing under it.
 */
export function groupByWorkspace(
  modules: readonly ModuleManifest[],
): readonly WorkspaceGroup[] {
  const byKey = new Map(modules.map((m) => [m.key, m]));
  const out: WorkspaceGroup[] = [];

  for (const w of WORKSPACES) {
    const present = w.modules
      .map((key) => byKey.get(key))
      .filter((m): m is ModuleManifest => m !== undefined);
    if (present.length > 0) out.push({ workspace: w, modules: present });
  }

  const placed = new Set(WORKSPACES.flatMap((w) => w.modules));
  const orphans = modules.filter((m) => !placed.has(m.key));
  if (orphans.length > 0) {
    out.push({
      workspace: ORPHANAGE,
      modules: [...orphans].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    });
  }

  return out;
}

export function workspaceOf(moduleKey: string): Workspace {
  return WORKSPACE_OF.get(moduleKey) ?? ORPHANAGE;
}
