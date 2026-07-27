import type { ModuleManifest } from "@spine/registry/manifest";

/**
 * INTEGRATION (HEXA).
 *
 * The edge: everything that leaves the building or arrives from outside it. Two of these
 * screens — Connections and Dead letters — are where an operations person actually lives on
 * a bad morning, which is why both are built to be readable at a glance rather than
 * explored.
 */
export const integrationManifest: ModuleManifest = {
  key: "integration",
  name: "Integration",
  summary: "Connections to the outside world, the flows that use them, and everything that failed to arrive.",
  department: "HEXA",
  icon: "Plug",
  licenceKey: "integration",
  order: 110,
  nav: [
    {
      label: "Connections",
      path: "connections",
      permission: "integration.connector.read",
      icon: "Cable",
    },
    {
      label: "Flows",
      path: "flows",
      permission: "integration.flow.read",
      icon: "Workflow",
    },
    {
      label: "Dead letters",
      path: "dead-letters",
      permission: "integration.message.read",
      icon: "MailWarning",
    },
    {
      label: "Statutory filings",
      path: "filings",
      permission: "integration.statutory.read",
      icon: "FileCheck",
    },
    {
      label: "Webhooks",
      path: "webhooks",
      permission: "integration.webhook.manage",
      icon: "Webhook",
    },
  ],
  screens: {
    connections: () => import("./screens/connections"),
    flows: () => import("./screens/flows"),
    "dead-letters": () => import("./screens/dead-letters"),
    filings: () => import("./screens/filings"),
    webhooks: () => import("./screens/webhooks"),
  },
};
