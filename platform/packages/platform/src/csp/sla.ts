import {
  addBusinessMinutes,
  consumedBusinessMinutes,
  type BusinessCalendar,
  type PauseWindow,
} from "./business-time.js";

/**
 * THE SLA ENGINE (CSP §11.3, FR-3.1 … FR-3.5).
 *
 * Two properties make an SLA number worth putting in front of a customer:
 *
 *   1. **The verdict derives from stored timestamps, not from a timer.** BullMQ delayed
 *      jobs fire on a worker's clock; if that clock drifts, a notification is late. The
 *      VERDICT is computed here from database timestamps on NTP-disciplined hosts, so a
 *      drifting worker can delay an email by seconds and can never corrupt a breach
 *      record. Timer state is derivable; it is never authoritative-in-Redis.
 *   2. **Escalation tiers fire exactly once.** Each tier records that it fired on the
 *      ticket, so a scanner that runs every minute for an hour sends one notification,
 *      not sixty. Idempotence here is the difference between an escalation ladder and
 *      an alert storm that people mute.
 */

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type TicketSlaState =
  | "on_track"
  | "at_risk"
  | "paused"
  | "breached_response"
  | "breached_resolution"
  | "met";

export interface SlaPolicy {
  id: string;
  name: string;
  /** Precedence when several policies match: contract beats category beats priority. */
  appliesTo: "contract" | "category" | "priority";
  matchValue: string;
  responseMins: number;
  resolutionMins: number;
  pauseOnPending: boolean;
  /** Ordered tiers, e.g. 0.8 of the response clock → owner; 1.0 → manager. */
  escalationMatrix: readonly EscalationTier[];
  active: boolean;
}

export interface EscalationTier {
  /** Stable key, recorded on the ticket when fired — this is what makes it once-only. */
  tier: string;
  /** Which clock this tier watches. */
  clock: "response" | "resolution";
  /** Fraction of the allowance at which it fires. 1.0 = at the deadline. */
  atFraction: number;
  notifyRole: string;
}

export const DEFAULT_ESCALATION: readonly EscalationTier[] = [
  { tier: "t80", clock: "response", atFraction: 0.8, notifyRole: "owner" },
  { tier: "t100", clock: "response", atFraction: 1.0, notifyRole: "service_manager" },
  { tier: "res100", clock: "resolution", atFraction: 1.0, notifyRole: "management" },
];

export class SlaPolicyNotFound extends Error {
  constructor(readonly priority: TicketPriority) {
    super(`No active SLA policy matches priority '${priority}'; configure one before triaging.`);
    this.name = "SlaPolicyNotFound";
  }
}

const PRECEDENCE: Record<SlaPolicy["appliesTo"], number> = { contract: 0, category: 1, priority: 2 };

/**
 * Resolve the governing policy. Precedence is **contract > category > priority** (FR-3.1):
 * an OEM's contractual 4-hour line-down commitment must win over the tenant's own default
 * for "urgent", because the contract is the thing with a penalty attached to it.
 */
export function resolveSlaPolicy(
  policies: readonly SlaPolicy[],
  match: { priority: TicketPriority; categoryCode?: string | null; contractRef?: string | null },
): SlaPolicy {
  const candidates = policies.filter((p) => {
    if (!p.active) return false;
    if (p.appliesTo === "contract") return match.contractRef != null && p.matchValue === match.contractRef;
    if (p.appliesTo === "category") return match.categoryCode != null && p.matchValue === match.categoryCode;
    return p.matchValue === match.priority;
  });
  const best = [...candidates].sort((a, b) => PRECEDENCE[a.appliesTo] - PRECEDENCE[b.appliesTo])[0];
  if (!best) throw new SlaPolicyNotFound(match.priority);
  return best;
}

export interface SlaClocks {
  policyId: string;
  policyName: string;
  firstResponseDue: string;
  resolutionDue: string;
  responseAllowanceMins: number;
  resolutionAllowanceMins: number;
  /** The customer-facing promise, in words. */
  promise: string;
}

/** Compute both clocks once, at triage, in business time. */
export function computeSlaClocks(
  policy: SlaPolicy,
  startedAt: string,
  calendar: BusinessCalendar,
): SlaClocks {
  return {
    policyId: policy.id,
    policyName: policy.name,
    firstResponseDue: addBusinessMinutes(startedAt, policy.responseMins, calendar),
    resolutionDue: addBusinessMinutes(startedAt, policy.resolutionMins, calendar),
    responseAllowanceMins: policy.responseMins,
    resolutionAllowanceMins: policy.resolutionMins,
    promise: `First response within ${describeMins(policy.responseMins)}`,
  };
}

function describeMins(m: number): string {
  if (m < 60) return `${m} business minutes`;
  const h = Math.round((m / 60) * 10) / 10;
  return `${h} business hour${h === 1 ? "" : "s"}`;
}

export interface SlaEvaluationInput {
  startedAt: string;
  asOf: string;
  pauseWindows: readonly PauseWindow[];
  calendar: BusinessCalendar;
  responseAllowanceMins: number;
  resolutionAllowanceMins: number;
  /** When the agent actually first responded, if they have. */
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  /** True while the ticket sits in `pending_customer` and the policy pauses. */
  isPaused: boolean;
  /** The fraction at which the chip turns amber. */
  atRiskFraction?: number;
}

export interface SlaEvaluation {
  state: TicketSlaState;
  consumedMins: number;
  responseRemainingMins: number;
  resolutionRemainingMins: number;
  responseBreached: boolean;
  resolutionBreached: boolean;
  /** Explains the verdict in one sentence — printed on both faces, so the customer and
   *  the agent are reading the same reasoning, not two different summaries. */
  reason: string;
}

/**
 * Derive the SLA state.
 *
 * `met` is decided by WHEN THE WORK HAPPENED, not by when someone looked: a response
 * delivered inside the window stays "met" for ever, even if the ticket is read a week
 * later. That is why `firstRespondedAt` is compared against the consumed clock rather
 * than against the current time.
 */
export function evaluateSla(input: SlaEvaluationInput): SlaEvaluation {
  const atRisk = input.atRiskFraction ?? 0.8;

  const consumedNow = consumedBusinessMinutes({
    startedAt: input.startedAt,
    asOf: input.asOf,
    pauseWindows: input.pauseWindows,
    calendar: input.calendar,
  });

  const consumedAtResponse =
    input.firstRespondedAt == null
      ? null
      : consumedBusinessMinutes({
          startedAt: input.startedAt,
          asOf: input.firstRespondedAt,
          pauseWindows: input.pauseWindows,
          calendar: input.calendar,
        });
  const consumedAtResolution =
    input.resolvedAt == null
      ? null
      : consumedBusinessMinutes({
          startedAt: input.startedAt,
          asOf: input.resolvedAt,
          pauseWindows: input.pauseWindows,
          calendar: input.calendar,
        });

  const responseBreached =
    consumedAtResponse != null
      ? consumedAtResponse > input.responseAllowanceMins
      : consumedNow > input.responseAllowanceMins;
  const resolutionBreached =
    consumedAtResolution != null
      ? consumedAtResolution > input.resolutionAllowanceMins
      : consumedNow > input.resolutionAllowanceMins;

  const responseRemainingMins = round3(input.responseAllowanceMins - (consumedAtResponse ?? consumedNow));
  const resolutionRemainingMins = round3(input.resolutionAllowanceMins - (consumedAtResolution ?? consumedNow));

  // Order matters: a resolved-inside-both-clocks ticket is `met` regardless of what the
  // wall clock says now, and a paused ticket reports `paused` rather than counting down.
  if (consumedAtResolution != null && !responseBreached && !resolutionBreached) {
    return {
      state: "met",
      consumedMins: consumedAtResolution,
      responseRemainingMins,
      resolutionRemainingMins,
      responseBreached: false,
      resolutionBreached: false,
      reason: `Resolved after ${consumedAtResolution} business minutes, inside both clocks.`,
    };
  }
  if (resolutionBreached) {
    return {
      state: "breached_resolution",
      consumedMins: consumedNow,
      responseRemainingMins,
      resolutionRemainingMins,
      responseBreached,
      resolutionBreached: true,
      reason: `Resolution allowance of ${input.resolutionAllowanceMins} business minutes exceeded.`,
    };
  }
  if (responseBreached) {
    return {
      state: "breached_response",
      consumedMins: consumedNow,
      responseRemainingMins,
      resolutionRemainingMins,
      responseBreached: true,
      resolutionBreached: false,
      reason: `First response allowance of ${input.responseAllowanceMins} business minutes exceeded.`,
    };
  }
  if (input.isPaused) {
    return {
      state: "paused",
      consumedMins: consumedNow,
      responseRemainingMins,
      resolutionRemainingMins,
      responseBreached: false,
      resolutionBreached: false,
      reason: "Waiting on the customer — the clock is stopped and will resume on their reply.",
    };
  }

  const worstFraction = Math.max(
    input.responseAllowanceMins === 0 ? 0 : (consumedAtResponse ?? consumedNow) / input.responseAllowanceMins,
    input.resolutionAllowanceMins === 0 ? 0 : consumedNow / input.resolutionAllowanceMins,
  );
  return {
    state: worstFraction >= atRisk ? "at_risk" : "on_track",
    consumedMins: consumedNow,
    responseRemainingMins,
    resolutionRemainingMins,
    responseBreached: false,
    resolutionBreached: false,
    reason:
      worstFraction >= atRisk
        ? `${Math.round(worstFraction * 100)}% of an SLA clock consumed.`
        : `${Math.round(worstFraction * 100)}% of the SLA clock consumed.`,
  };
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export interface EscalationDecision {
  tier: string;
  clock: "response" | "resolution";
  notifyRole: string;
  atMinutes: number;
}

/**
 * Which escalation tiers should fire on this pass.
 *
 * `alreadyFired` is the per-ticket marker set. A tier already in it is never returned
 * again — so the one-minute scanner is safe to run for ever, and a redeploy that replays
 * a batch does not re-notify a manager about a breach they acknowledged yesterday.
 */
export function tiersToFire(input: {
  tiers: readonly EscalationTier[];
  consumedMins: number;
  responseAllowanceMins: number;
  resolutionAllowanceMins: number;
  alreadyFired: readonly string[];
  /** A paused ticket does not escalate: the delay is the customer's, not the agent's. */
  isPaused: boolean;
}): EscalationDecision[] {
  if (input.isPaused) return [];
  const fired = new Set(input.alreadyFired);
  const out: EscalationDecision[] = [];
  for (const t of input.tiers) {
    if (fired.has(t.tier)) continue;
    const allowance = t.clock === "response" ? input.responseAllowanceMins : input.resolutionAllowanceMins;
    const threshold = allowance * t.atFraction;
    if (input.consumedMins >= threshold) {
      out.push({ tier: t.tier, clock: t.clock, notifyRole: t.notifyRole, atMinutes: round3(threshold) });
    }
  }
  return out;
}

/** The chip both faces render. Kept here so the portal and the desk cannot disagree about
 *  what colour a ticket is — the customer sees the same countdown the agent does. */
export function slaChip(state: TicketSlaState): { label: string; tone: "green" | "amber" | "red" | "grey" } {
  switch (state) {
    case "met":
      return { label: "Met", tone: "green" };
    case "on_track":
      return { label: "On track", tone: "green" };
    case "at_risk":
      return { label: "At risk", tone: "amber" };
    case "paused":
      return { label: "Paused — awaiting your reply", tone: "grey" };
    case "breached_response":
      return { label: "Response overdue", tone: "red" };
    case "breached_resolution":
      return { label: "Resolution overdue", tone: "red" };
  }
}
