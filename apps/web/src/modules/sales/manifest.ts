import type { ModuleManifest } from "@spine/registry/manifest";

/**
 * SALES / SMBD (MICA, Module 07).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles, runs, and has one fewer item in
 * the sidebar — no route file to clean up, no navigation array to edit, no import left
 * dangling anywhere else.
 *
 * `order` is hidden: it is a detail screen reached by clicking a row on `orders`, so it
 * needs a route but not a menu entry. `/sales/order/<id>` resolves to it with the id
 * arriving as `props.params[0]`.
 */
export const salesManifest: ModuleManifest = {
  key: "sales",
  name: "Sales",
  summary: "Customers, their orders, and what each order has cost them and committed us to.",
  department: "MICA",
  icon: "Receipt",
  licenceKey: "sales",
  order: 40,
  nav: [
    {
      label: "Sales orders",
      path: "orders",
      permission: "sales.order.read",
      icon: "FileText",
    },
    {
      label: "Sales order",
      path: "order",
      permission: "sales.order.read",
      icon: "FileText",
      hidden: true,
    },
    {
      label: "Customers",
      path: "customers",
      permission: "sales.customer.read",
      icon: "Users",
    },
  ],
  screens: {
    orders: () => import("./screens/orders"),
    order: () => import("./screens/order"),
    customers: () => import("./screens/customers"),
  },
};
