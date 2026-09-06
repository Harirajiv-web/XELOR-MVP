import type { ModuleManifest } from "@spine/registry/manifest";

/**
 * THE UNIFIED BLUEPRINT — a walkthrough of work that is DESIGNED AND NOT BUILT.
 *
 * This is a non-transactional presentation surface: it must say on every screen that its
 * Source / Flow / Pocket direction has not been engineered. The module is registered only
 * when NEXT_PUBLIC_PUBLIC_DEMO=true, which lets the combined direction be shown without
 * shipping it as an ordinary production module.
 *
 * The rule this module lives by: a figure is either READ FROM THE RUNNING API and labelled
 * live, or it is invented and labelled illustrative. There is no third kind. A prototype
 * that quietly mixes the two teaches its audience to distrust the real screens next to it,
 * and the demo is worth less than the credibility it costs.
 *
 * `licenceKey: "general"` and `general.company.read` deliberately: this is a presentation
 * surface over records the viewer can already see, so it must not invent an entitlement of
 * its own. Delete this folder and its registry entry when the real modules replace it.
 */
export const blueprintManifest: ModuleManifest = {
  key: "blueprint",
  name: "Unified Blueprint",
  summary:
    "The proposed Source, Flow and Pocket surfaces shown end to end — designed, not yet built, and labelled as such on every screen.",
  department: "ONYX",
  icon: "Compass",
  licenceKey: "general",
  order: 5,
  nav: [
    {
      label: "The closed loop",
      path: "loop",
      permission: "general.company.read",
      icon: "Repeat",
      description:
        "The single story the combined product must complete without spreadsheets or retyping: a customer promise becomes a material need, a qualified supplier, a receipt, an inspection, a dispatch and cash. Shows which stages this system runs today and which are still on paper, counted from the demo world you are signed in to.",
    },
    {
      label: "Source — find supply",
      path: "source",
      permission: "general.company.read",
      icon: "Search",
      description:
        "The proposed supplier network: a real shortage becomes a structured RFQ with drawing revision and need date, goes to invited suppliers, returns immutable quote revisions, and is compared on landed cost, delivery feasibility and quality history before one human approves the award. Designed, not built.",
    },
    {
      label: "Flow — quote and collect",
      path: "flow",
      permission: "general.company.read",
      icon: "ReceiptText",
      description:
        "The two commercial gaps this product has today: a customer quotation with revisions that converts into an order without retyping, and a supplier invoice that is duplicate-checked and matched against the purchase order and goods receipt before anybody is paid. Designed, not built.",
    },
    {
      label: "Pocket — the phone",
      path: "pocket",
      permission: "general.company.read",
      icon: "Smartphone",
      description:
        "What each role sees on a phone: the owner's exceptions, the shift's progress, the buyer's closing quotes, and point-of-work capture on the floor. Every tile carries its own freshness, and nothing final is ever committed from a phone that is offline. Designed, not built.",
    },
  ],
  screens: {
    loop: () => import("./screens/loop"),
    source: () => import("./screens/source"),
    flow: () => import("./screens/flow"),
    pocket: () => import("./screens/pocket"),
  },
};
