import type { ModuleManifest } from "@spine/registry/manifest";

/**
 * INVENTORY (SPAR, Module 03).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles, runs, and has one fewer item in
 * the sidebar — no route file to clean up, no navigation array to edit, no import left
 * dangling anywhere else.
 */
export const inventoryManifest: ModuleManifest = {
  key: "inventory",
  name: "Inventory",
  summary: "Stock balances and the ledger of every movement that produced them.",
  department: "SPAR",
  icon: "Boxes",
  licenceKey: "inventory",
  order: 30,
  nav: [
    {
      label: "Stock on hand",
      path: "stock",
      permission: "inventory.stock.read",
      icon: "Boxes",
    },
    {
      label: "Warehouses",
      path: "warehouses",
      permission: "inventory.warehouse.read",
      icon: "Warehouse",
    },
  ],
  screens: {
    stock: () => import("./screens/stock"),
    warehouses: () => import("./screens/warehouses"),
  },
};
