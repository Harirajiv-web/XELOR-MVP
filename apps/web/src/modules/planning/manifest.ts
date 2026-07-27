import type { ModuleManifest, SignalValue } from "@spine/registry/manifest";

/* --------------------------- defensive narrowing ---------------------------- */
/**
 * `reduce` is handed `unknown` — what the network actually returned, not what the type says
 * it should have been. Everything below guards every access and returns null on a shape it
 * does not recognise; null drops the tile silently, which is the right outcome for a
 * decorative figure that must never break the page it decorates.
 */

/** Most planning endpoints answer `{ data: [...] }`; a bare array is accepted too. */
function rowsOf(data: unknown): readonly unknown[] | null {
  if (Array.isArray(data)) return data;
  if (data === null || typeof data !== "object") return null;
  const envelope = data as { data?: unknown; items?: unknown };
  if (Array.isArray(envelope.data)) return envelope.data;
  if (Array.isArray(envelope.items)) return envelope.items;
  return null;
}

function numberAt(source: unknown, key: string): number | null {
  if (source === null || typeof source !== "object") return null;
  const v = (source as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isPastDue(row: unknown): boolean {
  if (row === null || typeof row !== "object") return false;
  return (row as { pastDue?: unknown }).pastDue === true;
}

/**
 * Severity, worst first — the order a planner reads a worklist in, and the same order the
 * Exceptions screen uses. Fixed rather than derived from the payload's keys so the chart
 * does not silently re-order itself between two runs of the same factory.
 */
const SEVERITIES = [
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
] as const;

/**
 * PLANNING / MRP (AXLE, Module 13).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles, runs, and has one fewer item in
 * the sidebar — no route file to clean up, no navigation array to edit, no import left
 * dangling anywhere else.
 *
 * READ-ONLY, on purpose, in this pass. Running MRP, firming an order and converting one are
 * consequential acts — they commit labour or ask a supplier for a price — and they belong
 * behind an approval gate, not behind a button somebody finds by accident while looking at a
 * list.
 */
export const planningManifest: ModuleManifest = {
  key: "planning",
  name: "Planning",
  summary: "What to make, what to buy and by when — with the arithmetic kept.",
  department: "AXLE",
  icon: "CalendarRange",
  licenceKey: "planning",
  order: 35,
  nav: [
    {
      label: "MRP run",
      path: "mrp",
      permission: "planning.mrp.read",
      icon: "Calculator",
    },
    {
      label: "Planned orders",
      path: "planned-orders",
      permission: "planning.mrp.read",
      icon: "ClipboardList",
    },
    {
      label: "Exceptions",
      path: "exceptions",
      permission: "planning.mrp.read",
      icon: "TriangleAlert",
    },
    {
      label: "Demand",
      path: "demand",
      permission: "planning.demand.read",
      icon: "TrendingUp",
    },
    {
      label: "Planning policies",
      path: "policies",
      permission: "planning.policy.read",
      icon: "SlidersHorizontal",
    },
    {
      // The payoff screen, reached by clicking a planned order rather than from the sidebar:
      // it is always about one item in one run, and a sidebar entry would open it with
      // nothing to explain. /planning/explain/<runNo>/<itemCode>.
      label: "Why this order",
      path: "explain",
      permission: "planning.mrp.read",
      icon: "Microscope",
      hidden: true,
    },
  ],
  screens: {
    mrp: () => import("./screens/mrp"),
    // Quoted because a hyphen is not legal in an unquoted object key. The URL segment is the
    // product decision — "planned-orders" is what a planner reads in the address bar — so the
    // key follows it rather than the other way round.
    "planned-orders": () => import("./screens/planned-orders"),
    exceptions: () => import("./screens/exceptions"),
    demand: () => import("./screens/demand"),
    policies: () => import("./screens/policies"),
    explain: () => import("./screens/explain"),
  },
  /**
   * WHAT THE PLAN SAYS, AND WHAT IS WRONG WITH IT.
   *
   * Those are the two questions a planner opens this module with, in that order, so they are
   * the two figures the department dashboard carries — plus the run they both came from, so
   * a reader can tell at a glance whether they are looking at this morning's plan or at one
   * computed a fortnight ago. A count with no run behind it is a number nobody can check.
   *
   * The severity breakdown is a chart on purpose. An exception is a message to a person, and
   * how many of them are shouting is the single most actionable shape in the whole plan: two
   * criticals is a phone call this afternoon, forty is a plan that needs re-cutting. All four
   * buckets are shown even when empty, because "nothing is critical" is information a planner
   * wants stated rather than inferred from an absent row.
   *
   * Every path here is one the module's own screens already call, and every request is a GET.
   * Planning reads; it never writes stock and it does not write anything from a dashboard.
   */
  signals: [
    {
      label: "Planned orders",
      permission: "planning.mrp.read",
      path: "/planning/planned-orders",
      reduce: (data): SignalValue | null => {
        const rows = rowsOf(data);
        if (!rows) return null;
        // `pastDue` means the lead time wanted this order released in a week that has
        // already gone — a fact about physics, and the one thing on this list that cannot be
        // fixed by working faster later.
        const late = rows.filter(isPastDue).length;
        return {
          value: String(rows.length),
          hint:
            rows.length === 0
              ? "nothing short across the horizon"
              : late > 0
                ? `${late} already past the date they had to start`
                : "none past their release date",
          tone: late > 0 ? "warn" : rows.length === 0 ? "ok" : "neutral",
        };
      },
    },
    {
      label: "Open exceptions",
      permission: "planning.mrp.read",
      path: "/planning/exceptions/summary",
      reduce: (data): SignalValue | null => {
        const open = numberAt(data, "openCount");
        if (open === null) return null;
        const bySeverity = (data as { bySeverity?: unknown }).bySeverity;
        const series = SEVERITIES.map((s) => ({
          label: s.label,
          value: numberAt(bySeverity, s.key) ?? 0,
        }));
        const critical = series.find((s) => s.label === "Critical")?.value ?? 0;
        const high = series.find((s) => s.label === "High")?.value ?? 0;
        const total = series.reduce((n, s) => n + s.value, 0);
        return {
          value: String(open),
          hint: open === 0 ? "the plan is clean" : "need a decision",
          tone: critical > 0 ? "bad" : high > 0 ? "warn" : open > 0 ? "neutral" : "ok",
          // Four empty bars say nothing worth the space they take. When there is nothing to
          // break down, the tile falls back to the plain figure on its own.
          ...(total > 0 ? { series } : {}),
        };
      },
    },
    {
      label: "Items planned",
      permission: "planning.mrp.read",
      path: "/planning/mrp/runs/latest",
      reduce: (data): SignalValue | null => {
        // Null is an ANSWER from this endpoint, not a failure: it means MRP has never been
        // run here. There is no figure to show for that, so there is no tile.
        const items = numberAt(data, "itemCount");
        if (items === null) return null;
        const runNo = (data as { runNo?: unknown }).runNo;
        const status = (data as { status?: unknown }).status;
        const label = typeof runNo === "string" && runNo ? runNo : "the latest run";
        const failed = typeof status === "string" && status !== "completed";
        return {
          value: String(items),
          hint: failed ? `${label} — ${String(status)}` : `explained item by item in ${label}`,
          tone: failed ? "bad" : "neutral",
        };
      },
    },
  ],
};
