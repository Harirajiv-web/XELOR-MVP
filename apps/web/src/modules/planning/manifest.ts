import type { ModuleManifest } from "@spine/registry/manifest";

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
};
