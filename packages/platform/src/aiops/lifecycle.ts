/**
 * ROLLOUT, KILL SWITCH AND DRIFT (AI-OPERATIONS §11, NFR-04/NFR-06).
 *
 * The operating half of the module: how a feature is turned on for a tenant, how it is
 * turned off in a hurry, and how anybody notices it has quietly got worse.
 *
 * The kill switch is the one thing here that has to work under conditions where nothing
 * else does. So it is a REFUSAL AT THE CHOKEPOINT — the router declines to route — rather
 * than a config flag each feature is trusted to read. A switch that depends on eight
 * modules honouring it is eight chances to have missed one.
 */

export type RolloutStage = "off" | "internal" | "pilot" | "general" | "rolled_back";

const ORDER: RolloutStage[] = ["off", "internal", "pilot", "general"];

export interface RolloutTransition {
  allowed: boolean;
  from: RolloutStage;
  to: RolloutStage;
  reason: string;
}

/**
 * Rollout moves one step at a time forward, and any distance backward.
 *
 * The asymmetry is deliberate. Going straight from `off` to `general` is how a feature
 * reaches every tenant without ever having been used by anyone who could recognise it
 * misbehaving — and going back must never be the step that needs an argument.
 */
export function checkRollout(from: RolloutStage, to: RolloutStage, opts: { evalPassed: boolean; reason?: string }): RolloutTransition {
  if (from === to) return { allowed: true, from, to, reason: "No change." };

  if (to === "rolled_back" || to === "off") {
    if (!opts.reason?.trim()) {
      return { allowed: false, from, to, reason: "Turning a feature off needs a reason. A feature that went dark with no note gets turned back on by somebody who does not know why it went dark." };
    }
    return { allowed: true, from, to, reason: `Rolled back from ${from}: ${opts.reason}` };
  }

  const fi = ORDER.indexOf(from === "rolled_back" ? "off" : from);
  const ti = ORDER.indexOf(to);
  if (ti < 0 || fi < 0) return { allowed: false, from, to, reason: `Unknown stage transition ${from} → ${to}.` };

  if (ti < fi) return { allowed: true, from, to, reason: `Reduced from ${from} to ${to}.` };
  if (ti - fi > 1) {
    return {
      allowed: false,
      from,
      to,
      reason: `Cannot jump ${from} → ${to}. Go one stage at a time: a feature that reaches every tenant without passing through a pilot has never been used by anybody who could recognise it misbehaving.`,
    };
  }
  if (!opts.evalPassed) {
    return { allowed: false, from, to, reason: `Cannot advance to ${to} without a passing eval gate for the current version.` };
  }
  return { allowed: true, from, to, reason: `Advanced ${from} → ${to} with a passing gate.` };
}

export interface KillSwitchState {
  engaged: boolean;
  engagedAt: string | null;
  engagedBy: string | null;
  reason: string | null;
  /** Scope: the whole tenant, or one feature. */
  featureKey: string | null;
}

export interface KillSwitchVerdict {
  routingAllowed: boolean;
  reason: string;
}

/**
 * The chokepoint check.
 *
 * Called by the router before anything else — before governance, before budget, before the
 * provider is even chosen. Everything the feature does when refused is its own degraded
 * mode, which every feature already has because the registry requires one.
 */
export function killSwitchAllows(state: KillSwitchState, featureKey: string): KillSwitchVerdict {
  if (!state.engaged) return { routingAllowed: true, reason: "Kill switch is not engaged." };
  if (state.featureKey && state.featureKey !== featureKey) {
    return { routingAllowed: true, reason: `Kill switch is engaged for ${state.featureKey} only.` };
  }
  return {
    routingAllowed: false,
    reason: `AI routing is switched off${state.featureKey ? ` for ${state.featureKey}` : " for this tenant"}${state.reason ? `: ${state.reason}` : ""}. The feature falls to its degraded mode — it does not fail.`,
  };
}

export interface KillSwitchProbe {
  featureKey: string;
  refused: boolean;
  elapsedMs: number;
  withinBound: boolean;
  message: string;
}

/**
 * Verify the switch actually works.
 *
 * A kill switch nobody has tried is a belief. The probe sends one real call through the
 * chokepoint and asserts it was refused, within the sixty-second bound the NFR names — and
 * the drill is a release gate rather than a task.
 */
export function evaluateProbe(input: { featureKey: string; refused: boolean; elapsedMs: number; boundMs?: number }): KillSwitchProbe {
  const bound = input.boundMs ?? 60_000;
  const withinBound = input.elapsedMs <= bound;
  return {
    featureKey: input.featureKey,
    refused: input.refused,
    elapsedMs: input.elapsedMs,
    withinBound,
    message: !input.refused
      ? `PROBE FAILED: ${input.featureKey} still routed with the kill switch engaged. The switch is not doing anything.`
      : withinBound
        ? `Refused in ${(input.elapsedMs / 1000).toFixed(1)}s, inside the ${bound / 1000}s bound.`
        : `Refused, but only after ${(input.elapsedMs / 1000).toFixed(1)}s — outside the ${bound / 1000}s bound. A switch that takes two minutes is not an emergency control.`,
  };
}

/* -------------------------------------------------------------------------- */
/*  Drift                                                                     */
/* -------------------------------------------------------------------------- */

export interface DriftWindow {
  label: string;
  calls: number;
  acceptanceRate: number;
  fallbackRate: number;
  p95LatencyMs: number;
  avgCost: number;
}

export type DriftDimension = "acceptance" | "fallback" | "latency" | "cost";

export interface DriftFinding {
  dimension: DriftDimension;
  baseline: number;
  current: number;
  changePct: number;
  severity: "critical" | "high" | "medium";
  message: string;
}

export interface DriftReport {
  featureKey: string;
  findings: DriftFinding[];
  /** The change most likely to have caused it, when one lines up. */
  attributedTo: string | null;
  headline: string;
}

/**
 * Compare two windows and report what moved.
 *
 * Acceptance rate is the primary signal and it is deliberately the one weighted hardest:
 * latency and cost are somebody's inconvenience, and a falling acceptance rate is the
 * product quietly becoming wrong while every dashboard stays green.
 */
export function detectDrift(input: {
  featureKey: string;
  baseline: DriftWindow;
  current: DriftWindow;
  /** Promotions/changes in the window, newest first — for attribution. */
  recentChanges?: readonly { at: string; description: string }[];
  minCalls?: number;
}): DriftReport {
  const findings: DriftFinding[] = [];
  const minCalls = input.minCalls ?? 20;

  if (input.current.calls < minCalls) {
    return {
      featureKey: input.featureKey,
      findings: [],
      attributedTo: null,
      headline: `Only ${input.current.calls} call(s) in the window — too few to say anything. Reporting drift from a handful of calls is how a team learns to ignore drift alerts.`,
    };
  }

  const pct = (from: number, to: number): number => (from === 0 ? (to === 0 ? 0 : 100) : Math.round(((to - from) / from) * 1000) / 10);

  const accDrop = input.baseline.acceptanceRate - input.current.acceptanceRate;
  if (accDrop >= 0.05) {
    findings.push({
      dimension: "acceptance",
      baseline: input.baseline.acceptanceRate,
      current: input.current.acceptanceRate,
      changePct: pct(input.baseline.acceptanceRate, input.current.acceptanceRate),
      severity: accDrop >= 0.15 ? "critical" : "high",
      message: `Users are accepting ${Math.round(accDrop * 100)} percentage points less of what this feature produces. Nothing else on the dashboard would show this.`,
    });
  }

  const fbRise = input.current.fallbackRate - input.baseline.fallbackRate;
  if (fbRise >= 0.1) {
    findings.push({
      dimension: "fallback",
      baseline: input.baseline.fallbackRate,
      current: input.current.fallbackRate,
      changePct: pct(input.baseline.fallbackRate, input.current.fallbackRate),
      severity: fbRise >= 0.3 ? "high" : "medium",
      message: `The deterministic fallback is answering ${Math.round(fbRise * 100)} points more often. The feature still works; it is increasingly not the AI doing it.`,
    });
  }

  if (input.baseline.p95LatencyMs > 0 && input.current.p95LatencyMs > input.baseline.p95LatencyMs * 1.5) {
    findings.push({
      dimension: "latency",
      baseline: input.baseline.p95LatencyMs,
      current: input.current.p95LatencyMs,
      changePct: pct(input.baseline.p95LatencyMs, input.current.p95LatencyMs),
      severity: "medium",
      message: `p95 latency is up ${pct(input.baseline.p95LatencyMs, input.current.p95LatencyMs)}%.`,
    });
  }

  if (input.baseline.avgCost > 0 && input.current.avgCost > input.baseline.avgCost * 1.5) {
    findings.push({
      dimension: "cost",
      baseline: input.baseline.avgCost,
      current: input.current.avgCost,
      changePct: pct(input.baseline.avgCost, input.current.avgCost),
      severity: "medium",
      message: `Average cost per call is up ${pct(input.baseline.avgCost, input.current.avgCost)}% — usually a routing change or longer inputs.`,
    });
  }

  // Attribution is offered, not asserted: the most recent change is a lead, not a cause.
  const attributedTo = findings.length > 0 && input.recentChanges?.length ? input.recentChanges[0]!.description : null;

  const worst = findings.find((f) => f.severity === "critical") ?? findings[0];
  return {
    featureKey: input.featureKey,
    findings: findings.sort((a, b) => rank(a.severity) - rank(b.severity)),
    attributedTo,
    headline:
      findings.length === 0
        ? `${input.featureKey} is stable across ${input.current.calls} calls.`
        : `${input.featureKey}: ${worst!.message}${attributedTo ? ` Most recent change in the window: ${attributedTo} — a lead, not a proven cause.` : ""}`,
  };
}

function rank(s: DriftFinding["severity"]): number {
  return s === "critical" ? 0 : s === "high" ? 1 : 2;
}
