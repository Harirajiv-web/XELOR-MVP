import type { ModuleManifest } from "@spine/registry/manifest";

export const connectivityManifest: ModuleManifest = {
  key: "connectivity", name: "Connections", summary: "Bring evidence from your ERP and spreadsheets into one reviewable workspace.", department: "HEXA", icon: "Cable", licenceKey: "integration", order: 1,
  nav: [{ label: "Connections", path: "connections", permission: "integration.connector.read", icon: "Cable", description: "Connect a supported ERP or import a dated file. Test access, refresh evidence and inspect exactly which records were received." }],
  screens: {
    connections: () => import("./screens/connections"),
  },
  signals: [{ label: "Connected data sources", permission: "integration.connector.read", path: "/connectivity/connections", reduce: (raw) => {
    const rows = (raw as { data?: unknown })?.data;
    if (!Array.isArray(rows)) return null;
    const withEvidence = rows.filter((row: { latestSnapshot?: unknown }) => row.latestSnapshot != null).length;
    return { value: String(withEvidence), hint: `${rows.length} configured · ${withEvidence} with imported evidence`, tone: withEvidence ? "ok" : "neutral" };
  } }],
};
