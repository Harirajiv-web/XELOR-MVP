import type { ModuleManifest } from "@spine/registry/manifest";

/**
 * PRODUCTION (KILN, Module 05).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles, runs, and has one fewer item in
 * the sidebar.
 *
 * `order` is hidden: it is the work order opened by clicking a row, routable at
 * `/production/order/<id>` but never a sidebar entry of its own.
 */
export const productionManifest: ModuleManifest = {
  key: "production",
  name: "Production",
  summary: "Work orders on the floor, and the components each one consumes.",
  department: "KILN",
  icon: "Factory",
  licenceKey: "production",
  order: 45,
  nav: [
    {
      label: "Work orders",
      path: "orders",
      permission: "production.order.read",
      icon: "Hammer",
    },
    {
      label: "Work order",
      path: "order",
      permission: "production.order.read",
      icon: "Hammer",
      hidden: true,
    },
  ],
  screens: {
    orders: () => import("./screens/orders"),
    order: () => import("./screens/order"),
  },
};
