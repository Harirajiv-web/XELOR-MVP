import type { ModuleManifest } from "@spine/registry/manifest";

export const aiControlManifest: ModuleManifest = {
  key: "aicontrol",
  name: "AI Control Center",
  summary:
    "Choose how independently XELOR's agents may work, stop all automation instantly, and see every live step, wait and approval.",
  department: "ONYX",
  icon: "ShieldAlert",
  licenceKey: "aiops",
  order: 82,
  nav: [
    {
      label: "Control room",
      path: "control",
      permission: "agentos.run.read",
      icon: "Power",
      description:
        "The operational authority over Agent OS. Choose guarded autopilot or human permission before every wave, engage the global kill switch, fall back to the manual ERP, and see what each agent is doing, waiting for and taking time on. Every change is enforced by the API and written to the audit trail.",
    },
  ],
  screens: {
    control: () => import("./screens/control"),
  },
  signals: [
    {
      label: "AI automation",
      permission: "agentos.run.read",
      path: "/agent-os/control",
      reduce: (raw) => {
        if (typeof raw !== "object" || raw === null) return null;
        const data = (raw as { data?: unknown }).data;
        if (typeof data !== "object" || data === null) return null;
        const automation = (data as { automation?: unknown }).automation;
        if (typeof automation !== "object" || automation === null) return null;
        const status = (automation as { status?: unknown }).status;
        if (status !== "active" && status !== "stopped") return null;
        return {
          value: status === "active" ? "Active" : "Stopped",
          hint: status === "active" ? "Control policy enforced" : "Manual ERP remains available",
          tone: status === "active" ? "ok" : "bad",
        };
      },
    },
  ],
};
