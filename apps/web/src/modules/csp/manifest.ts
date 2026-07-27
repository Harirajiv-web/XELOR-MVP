import type { ModuleManifest } from "@spine/registry/manifest";

/**
 * SERVICE / CSP (MICA, Module 08).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles, runs, and has one fewer item in
 * the sidebar — no route file to clean up, no navigation array to edit, no import left
 * dangling anywhere else.
 *
 * `ticket` is hidden: it is reached by clicking a row on `tickets`, so it needs a route but
 * not a menu entry. `/csp/ticket/TKT-2627-00031` resolves to it with the ticket number
 * arriving as `props.params[0]`.
 *
 * The spare-request screen is keyed `spares`, not `spare-requests`. A hyphenated key must
 * be quoted to be legal JavaScript, and `module-check` matches screen keys with a regular
 * expression that only accepts an UNQUOTED identifier — so a hyphenated nav path silently
 * reports as "has no screen registered". The label is what users read; the key is what the
 * gate can see.
 */
export const cspManifest: ModuleManifest = {
  key: "csp",
  name: "Service",
  summary: "Service tickets, their SLA clocks, spare requests and what customers said afterwards.",
  department: "MICA",
  icon: "Headset",
  licenceKey: "csp",
  order: 50,
  nav: [
    {
      label: "Tickets",
      path: "tickets",
      permission: "csp.ticket.read",
      icon: "Ticket",
    },
    {
      label: "Ticket",
      path: "ticket",
      permission: "csp.ticket.read",
      icon: "Ticket",
      hidden: true,
    },
    {
      label: "Spare requests",
      path: "spares",
      permission: "csp.ticket.read",
      icon: "PackageSearch",
    },
    {
      label: "Service dashboard",
      path: "dashboard",
      permission: "csp.dashboard.read",
      icon: "Gauge",
    },
    {
      label: "Customer satisfaction",
      path: "csat",
      permission: "csp.dashboard.read",
      icon: "Smile",
    },
  ],
  screens: {
    tickets: () => import("./screens/tickets"),
    ticket: () => import("./screens/ticket"),
    spares: () => import("./screens/spares"),
    dashboard: () => import("./screens/dashboard"),
    csat: () => import("./screens/csat"),
  },
};
