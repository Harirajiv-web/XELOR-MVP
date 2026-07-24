import type { AiUsage } from "@ind-core/platform";

/**
 * The AI governance contract (DECISIONS-V2 §4.3). Before ANY model call the router
 * asks governance whether it may proceed; after a call it reports usage against the
 * tenant's token budget. In the full product this port is owned by Administration
 * (AI-OPERATIONS §1.2: "Module 09 never writes governance policy"); here it lives in
 * the shared spine and Administration will take ownership when it lands.
 *
 * A1 ships a permissive default; A2 replaces it with the real kill-switch / opt-out /
 * budget implementation — same interface, so the router never changes.
 */
export interface AiGovernanceDecision {
  allowed: boolean;
  /** machine reason when refused: kill_switch | opt_out | budget_exhausted | consent. */
  reason?: string;
  /** tokens left in today's budget, when known. */
  budgetRemaining?: number;
}

export interface AiGovernance {
  /** Gate a call for one feature in the CURRENT tenant context. */
  check(featureKey: string): Promise<AiGovernanceDecision>;
  /** Report actual usage after a successful call (best-effort accounting). */
  recordUsage(featureKey: string, usage: AiUsage): Promise<void>;
}
