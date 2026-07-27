import type { ModuleManifest } from "@spine/registry/manifest";

/**
 * PURCHASE (SPAR, Module 04).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles, runs, and has one fewer item in
 * the sidebar — no route file to clean up, no navigation array to edit, no import left
 * dangling anywhere else.
 *
 * Two of the four screens are `hidden`: routable, but never in the sidebar. A purchase
 * order is reached by clicking the order you were already looking at, and a goods receipt
 * by its document number — neither is a place you navigate to cold. `grn` has no sidebar
 * entry for a second reason as well: the API has no list endpoint for goods receipts, so a
 * menu item pointing at it would open a screen that can only ever say "which one?".
 *
 * This is also the module that demonstrates the licence gate. Kaveri ElectroFab's licence
 * deliberately excludes `purchase`, so signing in as Kaveri shows the "not part of your
 * plan" screen here while Inventory opens normally — a licensing conversation, visibly
 * distinct from a permissions one.
 */
export const purchaseManifest: ModuleManifest = {
  key: "purchase",
  name: "Purchase",
  summary: "Vendors, purchase orders and what has actually been received against them.",
  department: "SPAR",
  icon: "ShoppingCart",
  licenceKey: "purchase",
  order: 25,
  nav: [
    {
      label: "Purchase orders",
      path: "orders",
      permission: "purchase.po.read",
      icon: "FileText",
    },
    {
      label: "Vendors",
      path: "vendors",
      permission: "purchase.vendor.read",
      icon: "Truck",
    },
    {
      label: "Purchase order",
      path: "order",
      permission: "purchase.po.read",
      icon: "FileText",
      hidden: true,
    },
    {
      label: "Goods receipt",
      path: "grn",
      permission: "purchase.grn.read",
      icon: "PackageCheck",
      hidden: true,
    },
  ],
  screens: {
    orders: () => import("./screens/orders"),
    vendors: () => import("./screens/vendors"),
    order: () => import("./screens/order"),
    grn: () => import("./screens/grn"),
  },
};
