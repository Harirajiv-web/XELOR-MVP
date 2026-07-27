import type { ModuleManifest } from "@spine/registry/manifest";

/**
 * ENGINEERING (AXLE, Module 12).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles, runs, and has one fewer item in
 * the sidebar — no route file to clean up, no navigation array to edit, no import left
 * dangling anywhere else.
 */
export const engineeringManifest: ModuleManifest = {
  key: "engineering",
  name: "Engineering",
  summary: "The item master and the bills of material every other module hangs off.",
  department: "AXLE",
  icon: "Component",
  licenceKey: "engineering",
  order: 15,
  nav: [
    {
      label: "Items",
      path: "items",
      permission: "engineering.item.read",
      icon: "Package",
    },
    {
      // There is no list endpoint for bills of material — only `GET /engineering/boms/:id` —
      // so a sidebar entry would open a screen with nothing to ask for. Registered as a
      // hidden route so the URL works when something hands over a BOM id; a route nobody
      // declared 404s in a way indistinguishable from a route that was deleted.
      label: "Bill of material",
      path: "bom",
      permission: "engineering.bom.read",
      icon: "ListTree",
      hidden: true,
    },
  ],
  screens: {
    items: () => import("./screens/items"),
    bom: () => import("./screens/bom"),
  },
};
