import type { ModuleManifest } from "@spine/registry/manifest";

/**
 * AUTONOMOUS FULFILMENT — the phase-2 surface.
 *
 * Deliberately its own module rather than a screen bolted onto Agent OS. Agent OS runs
 * bounded cross-functional REVIEWS that start and finish inside a minute; this runs a
 * customer COMMITMENT that outlives any single run, waits on suppliers and people, and
 * gets replanned when the world moves. Putting them in one module would mean one nav
 * group whose two halves obey different rules about what "done" means.
 */
export const fulfilmentManifest: ModuleManifest = {
  key: "fulfilment",
  name: "Autonomous Fulfilment",
  summary:
    "Give XELOR an approved order and it plans, commits, watches and verifies the whole fulfilment — asking a person only where authority is genuinely required.",
  department: "ONYX",
  icon: "Target",
  licenceKey: "aiops",
  order: 77,
  nav: [
    {
      label: "Mission Control",
      path: "control",
      permission: "agentos.run.read",
      icon: "Radar",
      description:
        "Start a fulfilment mission on a confirmed order and watch it work: the evidence it reads, the strategies it compares, the independent verification of its own claims, the point where it stops for a human, and the outcome it proves at the end. Every figure is labelled live, derived or seeded.",
    },
  ],
  screens: {
    control: () => import("./screens/control"),
  },
};
