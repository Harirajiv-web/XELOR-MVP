/**
 * ONYX shell material — DELIBERATELY EMPTY.
 *
 * These arrays once held curated investor-demo alerts, a briefing and a set of suggested
 * actions: a machine "recorded as down", a named customer whose material cover was "tight",
 * a purchase order "awaiting authority". None of it was ever read from the tenant's records,
 * so on an empty company the shell was telling people about events that had not happened.
 *
 * An alert that is wrong in the reassuring direction is worse than no alert; an alert that
 * is wrong in the alarming direction teaches people to ignore the bell. Both are worse than
 * silence, so the shell is silent until something real fills these in.
 *
 * The exported names, types and shapes are unchanged: whatever populates them next must come
 * from live, permission-filtered records (`/copilot/ask` and the module APIs already are),
 * decided in code — a date comparison, a row with no end time — never narrated by a model.
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

/** No scripted alerts. The bell stays quiet until a real record earns it. */
export const ONYX_DEMO_ALERTS: readonly OnyxDemoAlert[] = [];

/** No scripted briefing. A brief about a company with no transactions has nothing to say. */
export const ONYX_DEMO_BRIEF: readonly OnyxDemoBriefItem[] = [];

/** No scripted recommendations. ONYX proposes work from evidence or it proposes nothing. */
export const ONYX_DEMO_ACTIONS: readonly OnyxDemoAction[] = [];

/**
 * What ONYX can READ in each context. This is a description of its own capability and its
 * limits — not data about the company — so it stays: it is true of an empty tenant as much
 * as a busy one, and it is what stops a user assuming the assistant can see more than it can.
 */
export const ONYX_CONTEXT_COPY: Readonly<Record<string, string>> = {
  inventory:
    "I can read stock, warehouse balances and recent movements from your permitted records.",
  sales:
    "I can read open customer orders, delivery dates and individual order status.",
  purchase:
    "I can read open purchase orders, receipts and individual order status.",
  production:
    "I can read the current production order book and order progress.",
  planning:
    "I can read shortages, late requirements and what the plan says to buy or make.",
  maintenance: "I can read open maintenance work and recorded breakdowns.",
  quality: "I can read open inspections and their recorded verdicts.",
  accounts:
    "I can read ledger and trial-balance information available to your role.",
  engineering:
    "I can read approved engineering and master-data information available to your role.",
};
