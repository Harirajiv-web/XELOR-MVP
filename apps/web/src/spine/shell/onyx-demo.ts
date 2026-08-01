/**
 * Curated investor-demo material for ONYX.
 *
 * These records deliberately live in one file, carry a `Demo scenario` label in the UI,
 * and never pass through a write endpoint. They make the intended product experience
 * demonstrable while keeping it impossible to mistake a scripted recommendation for a
 * live ERP fact. Chat remains live and evidence-backed through `/copilot/ask`.
 */

export interface OnyxDemoAlert {
  id: string;
  severity: "critical" | "urgent" | "attention";
  module: string;
  title: string;
  detail: string;
  evidence: string;
  href: string;
}

export interface OnyxDemoBriefItem {
  label: string;
  value: string;
  tone: "bad" | "warn" | "ok" | "info";
  detail: string;
  href: string;
}

export interface OnyxDemoAction {
  id: string;
  owner: "ONYX" | "SPAR" | "KILN" | "MICA" | "AXLE";
  title: string;
  reason: string;
  impact: string;
  authority: string;
  href: string;
}

export const ONYX_DEMO_ALERTS: readonly OnyxDemoAlert[] = [
  {
    id: "cnc-03-down",
    severity: "critical",
    module: "maintenance",
    title: "CNC-03 is recorded as down",
    detail: "The open downtime event can put today’s pump-casing sequence at risk.",
    evidence: "Maintenance downtime · demo scenario",
    href: "/maintenance/downtime",
  },
  {
    id: "northstar-material",
    severity: "urgent",
    module: "planning",
    title: "Northstar material cover is tight",
    detail: "Two planned requirements need supply review before the protected delivery window.",
    evidence: "Planning exceptions · demo scenario",
    href: "/planning/exceptions",
  },
  {
    id: "po-awaiting",
    severity: "attention",
    module: "purchase",
    title: "A purchase order is awaiting authority",
    detail: "Review commercial terms and evidence before releasing the order.",
    evidence: "Purchase approvals · demo scenario",
    href: "/purchase/orders",
  },
];

export const ONYX_DEMO_BRIEF: readonly OnyxDemoBriefItem[] = [
  {
    label: "Delivery",
    value: "At risk",
    tone: "bad",
    detail: "The Northstar commitment needs a cross-functional recovery review.",
    href: "/agentos/command",
  },
  {
    label: "Shop floor",
    value: "1 constraint",
    tone: "warn",
    detail: "CNC-03 downtime is the scenario’s primary production constraint.",
    href: "/maintenance/downtime",
  },
  {
    label: "Supply",
    value: "2 reviews",
    tone: "warn",
    detail: "Material cover and an awaiting purchase order need human attention.",
    href: "/planning/exceptions",
  },
  {
    label: "Governance",
    value: "Ready",
    tone: "ok",
    detail: "ONYX can prepare a governed six-domain recovery review for approval.",
    href: "/agentos/command",
  },
];

export const ONYX_DEMO_ACTIONS: readonly OnyxDemoAction[] = [
  {
    id: "northstar-review",
    owner: "ONYX",
    title: "Start the Northstar recovery review",
    reason: "Delivery, maintenance, supply, quality, commercial and finance evidence must converge.",
    impact: "Produces one governed recommendation with evidence and a named human gate.",
    authority: "Plant Head",
    href: "/agentos/command",
  },
  {
    id: "cnc-review",
    owner: "KILN",
    title: "Review the CNC-03 maintenance response",
    reason: "An open downtime event is the scenario’s most immediate operational constraint.",
    impact: "Prepares the maintenance decision; it does not close or create a work order.",
    authority: "Maintenance Manager",
    href: "/maintenance/downtime",
  },
  {
    id: "po-review",
    owner: "SPAR",
    title: "Review the awaiting purchase order",
    reason: "Material cover is tight and commercial authority is still required.",
    impact: "Opens the real purchase workspace for a human decision.",
    authority: "Purchase Approver",
    href: "/purchase/orders",
  },
];

export const ONYX_CONTEXT_COPY: Readonly<Record<string, string>> = {
  inventory: "I can read stock, warehouse balances and recent movements from your permitted records.",
  sales: "I can read open customer orders, delivery dates and individual order status.",
  purchase: "I can read open purchase orders, receipts and individual order status.",
  production: "I can read the current production order book and order progress.",
  planning: "I can read shortages, late requirements and what the plan says to buy or make.",
  maintenance: "I can read open maintenance work and recorded breakdowns.",
  quality: "I can read open inspections and their recorded verdicts.",
  accounts: "I can read ledger and trial-balance information available to your role.",
  engineering: "I can read approved engineering and master-data information available to your role.",
};
