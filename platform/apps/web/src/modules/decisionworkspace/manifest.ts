import type { ModuleManifest } from "@spine/registry/manifest";

export const decisionworkspaceManifest: ModuleManifest = {
  key: "decisionworkspace", name: "Decision workspace", summary: "Check delivery commitments, compare recovery choices and record measured outcomes using source evidence.", department: "ONYX", icon: "Compass", licenceKey: "integration", order: 2,
  nav: [{ label: "Decision workspace", path: "workspace", permission: "integration.connector.read", icon: "Compass", description: "Use dated source evidence to check a customer commitment, compare recovery options and ask questions. Record baseline and actual outcomes separately from estimates." }],
  screens: {
    workspace: () => import("./screens/workspace"),
  },
  signals: [{ label: "Recent decision reviews", permission: "integration.connector.read", path: "/connectivity/decisions", reduce: (raw) => { const rows = (raw as { data?: unknown })?.data; return Array.isArray(rows) ? { value: String(rows.length), hint: "Latest saved reviews · decisions remain under human control", tone: "neutral" } : null; } }],
};
