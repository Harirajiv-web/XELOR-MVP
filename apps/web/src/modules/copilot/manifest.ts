import type { ModuleManifest } from "@spine/registry/manifest";

/**
 * COPILOT (ONYX, cross-cutting).
 *
 * Two screens: the place a question is asked, and the log of every question that was ever
 * asked. The second is not an afterthought — it is what makes the first auditable, and for
 * a compliance officer it is the more important of the two.
 */
export const copilotManifest: ModuleManifest = {
  key: "copilot",
  name: "Copilot",
  summary: "Ask questions about your own data. It reads, cites what it read, and cannot change anything.",
  department: "ONYX",
  icon: "Sparkles",
  licenceKey: "copilot",
  order: 5,
  nav: [
    {
      label: "Ask",
      path: "ask",
      permission: "copilot.question.ask",
      icon: "MessageSquare",
    },
    {
      label: "Question log",
      path: "log",
      permission: "copilot.log.read",
      icon: "History",
    },
  ],
  screens: {
    ask: () => import("./screens/ask"),
    log: () => import("./screens/log"),
  },
};
