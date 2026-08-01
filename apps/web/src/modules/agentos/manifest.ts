import type { ModuleManifest } from "@spine/registry/manifest";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const agentosManifest: ModuleManifest = {
  key: "agentos",
  name: "Agent OS",
  summary:
    "ONYX mission control: live specialist connections, bounded graph runs, evidence, checkpoints and human approvals.",
  department: "ONYX",
  icon: "Orbit",
  // Agent OS is part of the AI Operations entitlement in this phase.
  licenceKey: "aiops",
  order: 78,
  nav: [
    {
      label: "Decision Commander",
      path: "commander",
      permission: "agentos.run.read",
      icon: "Radar",
      description:
        "See current cross-company risks, the evidence behind them, clear recovery choices and the human decision required next.",
    },
    {
      label: "Approvals",
      path: "approvals",
      permission: "agentos.approval.decide",
      icon: "UserRoundCheck",
      description:
        "Your human approval inbox. See every agent mission waiting for a decision, review the proposed action and approve or reject it with a written note.",
    },
    {
      label: "Mission control",
      path: "command",
      permission: "agentos.run.read",
      icon: "Network",
      description:
        "The live operating surface for ONYX and its six specialist agents. Start a bounded cross-functional review, watch registered ERP capabilities execute, inspect evidence and checkpoints, and approve or reject the final synthesis. The graph and data reads are live; language reasoning is explicitly deterministic until a model provider is connected.",
    },
  ],
  screens: {
    commander: () => import("./screens/commander"),
    approvals: () => import("./screens/approvals"),
    command: () => import("./screens/command"),
  },
  signals: [
    {
      label: "Connected agents",
      permission: "agentos.run.read",
      path: "/agent-os/catalogue",
      reduce: (raw) => {
        if (!isRecord(raw) || !isRecord(raw.data)) return null;
        const agents = raw.data.agents;
        const runtime = raw.data.runtime;
        if (!Array.isArray(agents) || !isRecord(runtime)) return null;
        return {
          value: `${agents.length} of 7`,
          hint: `${String(runtime.providerMode ?? "unknown")} provider · live graph runtime`,
          tone: agents.length === 7 && runtime.status === "live" ? "ok" : "warn",
          fraction: agents.length / 7,
        };
      },
    },
  ],
};
