import type { ModuleManifest } from "@spine/registry/manifest";

/**
 * AI OPERATIONS (ONYX, cross-cutting).
 *
 * Seven read-only screens, and they exist to answer one question a sceptical buyer asks:
 * what stops this thing doing something stupid? How the layer is wired to the rest of the
 * product, what is registered, what it cost, what passed its evaluations, what a human
 * still has to approve, and what can be switched off.
 *
 * The consequential controls — engaging the kill switch, promoting a prompt, changing a
 * rollout stage, accepting a draft — are deliberately ABSENT from this pass. They are the
 * highest-blast-radius actions in the product and they get their own properly gated build,
 * not a button bolted onto a list screen.
 */
export const aiopsManifest: ModuleManifest = {
  key: "aiops",
  name: "AI Operations",
  summary: "The console for the AI itself: what is registered, what it costs, what passed its evaluations, and what a person still has to approve.",
  department: "ONYX",
  icon: "BrainCircuit",
  licenceKey: "aiops",
  order: 80,
  nav: [
    {
      // First, because it is the screen that answers "what IS this layer" before any of the
      // others answer "and is it behaving". A buyer who opens Feature registry cold sees a
      // list of eight keys; the same person who opens the map first sees why there are only
      // eight and what they are wired to.
      label: "Connection map",
      path: "map",
      permission: "aiops.registry.read",
      icon: "Network",
    },
    {
      label: "Feature registry",
      path: "registry",
      permission: "aiops.registry.read",
      icon: "List",
    },
    {
      label: "Providers",
      path: "providers",
      permission: "aiops.registry.read",
      icon: "Server",
    },
    {
      label: "Evaluations",
      path: "evals",
      permission: "aiops.registry.read",
      icon: "FlaskConical",
    },
    {
      label: "Cost & budget",
      path: "cost",
      permission: "aiops.cost.read",
      icon: "IndianRupee",
    },
    {
      label: "Review queue",
      path: "review",
      permission: "aiops.hitl.review",
      icon: "UserCheck",
    },
    {
      label: "AI incidents",
      path: "incidents",
      permission: "aiops.registry.read",
      icon: "ShieldAlert",
    },
  ],
  screens: {
    map: () => import("./screens/map"),
    registry: () => import("./screens/registry"),
    providers: () => import("./screens/providers"),
    evals: () => import("./screens/evals"),
    cost: () => import("./screens/cost"),
    review: () => import("./screens/review"),
    incidents: () => import("./screens/incidents"),
  },
};
