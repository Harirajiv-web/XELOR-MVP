/**
 * ROUTING, RESIDENCY AND COST (AI-OPERATIONS §11, FR-AIO-010..019, FR-AIO-050..059).
 *
 * A routing chain is an ordered list of ways to answer, ending — always — in a step that
 * needs no model at all. That last step is the design: a feature whose chain can be
 * exhausted is a feature that breaks when a provider has an outage, and a manufacturing ERP
 * cannot stop taking receipts because somebody else's API is down.
 *
 * Residency is checked in three places (edit, activation, call) rather than one, because
 * the failure is not "a request went to the wrong region" — it is "requests went to the
 * wrong region for six weeks and nobody looked", and only the call-time check catches a
 * provider that quietly changed where it serves from.
 */

export type RouteStepKind = "model" | "deterministic";

export interface RouteStep {
  order: number;
  kind: RouteStepKind;
  providerCode?: string | null;
  modelCode?: string | null;
  /** Where this provider actually serves from. */
  region?: string | null;
  /** What the deterministic step does, in words a person can check. */
  fallbackDescription?: string | null;
}

export interface RoutePolicy {
  featureKey: string;
  steps: readonly RouteStep[];
  /** Regions this tenant permits. Empty means unconstrained. */
  allowedRegions: readonly string[];
}

export interface RouteValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a chain before it can be activated.
 *
 * The last-step rule is absolute. Everything else about routing is a preference; a chain
 * with no deterministic tail is a feature with an outage waiting in it.
 */
export function validateRoute(policy: RoutePolicy): RouteValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const steps = [...policy.steps].sort((a, b) => a.order - b.order);

  if (steps.length === 0) {
    errors.push("A routing chain with no steps cannot answer anything.");
    return { ok: false, errors, warnings };
  }

  const last = steps[steps.length - 1]!;
  if (last.kind !== "deterministic") {
    errors.push(
      "The last step of every chain must be deterministic. A chain that can be exhausted is a feature that stops working when somebody else's API does, and a plant cannot stop taking receipts for that.",
    );
  }
  if (last.kind === "deterministic" && !last.fallbackDescription) {
    errors.push("The deterministic step must say what it does. 'Falls back' is not an answer to 'what happens when the model is off?'.");
  }

  for (const s of steps) {
    if (s.kind === "model" && (!s.providerCode || !s.modelCode)) {
      errors.push(`Step ${s.order} is a model step with no provider or model.`);
    }
    if (s.kind === "model" && policy.allowedRegions.length > 0) {
      if (!s.region) {
        errors.push(`Step ${s.order} (${s.providerCode}) does not declare a region, and this tenant restricts residency. An undeclared region cannot be checked.`);
      } else if (!policy.allowedRegions.includes(s.region)) {
        errors.push(`Step ${s.order} serves from ${s.region}, which is not in this tenant's permitted regions (${policy.allowedRegions.join(", ")}).`);
      }
    }
  }

  const modelSteps = steps.filter((s) => s.kind === "model");
  if (modelSteps.length === 1) {
    warnings.push("Only one model step: a single provider outage drops this feature straight to its deterministic fallback. Acceptable, but know it.");
  }
  const seen = new Set(steps.map((s) => s.order));
  if (seen.size !== steps.length) errors.push("Step orders must be unique.");

  return { ok: errors.length === 0, errors, warnings };
}

export interface AttemptOutcome {
  order: number;
  kind: RouteStepKind;
  providerCode: string | null;
  ok: boolean;
  reason: string;
}

export interface RouteResult {
  servedBy: RouteStep;
  attempts: AttemptOutcome[];
  degraded: boolean;
  /** True when the deterministic step answered. */
  usedFallback: boolean;
  message: string;
}

/**
 * Walk the chain until something answers.
 *
 * Attribution is kept for every attempt, not just the winner. "The call succeeded" hides
 * the fact that the primary provider failed nine times out of ten this hour, and that is
 * precisely the signal drift detection needs.
 */
export function route(
  policy: RoutePolicy,
  probe: (step: RouteStep) => { ok: boolean; reason: string },
): RouteResult {
  const steps = [...policy.steps].sort((a, b) => a.order - b.order);
  const attempts: AttemptOutcome[] = [];

  for (const step of steps) {
    // Residency is re-checked AT CALL TIME. A provider that quietly changed where it serves
    // from is exactly the case the edit-time check cannot catch.
    if (step.kind === "model" && policy.allowedRegions.length > 0 && step.region && !policy.allowedRegions.includes(step.region)) {
      attempts.push({ order: step.order, kind: step.kind, providerCode: step.providerCode ?? null, ok: false, reason: `Refused at call time: ${step.providerCode} is serving from ${step.region}, outside this tenant's permitted regions.` });
      continue;
    }
    const r = probe(step);
    attempts.push({ order: step.order, kind: step.kind, providerCode: step.providerCode ?? null, ok: r.ok, reason: r.reason });
    if (r.ok) {
      const usedFallback = step.kind === "deterministic";
      return {
        servedBy: step,
        attempts,
        degraded: usedFallback || attempts.length > 1,
        usedFallback,
        message: usedFallback
          ? `Answered by the deterministic step after ${attempts.length - 1} model step(s) failed: ${step.fallbackDescription}. The user still got an answer.`
          : attempts.length === 1
            ? `Answered by ${step.providerCode}/${step.modelCode}.`
            : `Answered by ${step.providerCode}/${step.modelCode} after ${attempts.length - 1} earlier step(s) failed.`,
      };
    }
  }

  // Unreachable when validateRoute has been enforced, which is the point of enforcing it.
  return {
    servedBy: steps[steps.length - 1]!,
    attempts,
    degraded: true,
    usedFallback: false,
    message: "Every step failed, including the deterministic one. This chain should not have been activatable.",
  };
}

/* -------------------------------------------------------------------------- */
/*  Cost                                                                      */
/* -------------------------------------------------------------------------- */

export interface ModelPrice {
  modelCode: string;
  /** ₹ per 1,000 input tokens. */
  inputPer1k: number;
  outputPer1k: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

/**
 * Resolve the price that was in force ON THE DAY OF THE CALL.
 *
 * Costing yesterday's calls at today's price is how a cost report stops matching the
 * invoice, and the difference is discovered during a budget conversation rather than
 * before one.
 */
export function priceAsOf(prices: readonly ModelPrice[], modelCode: string, asOf: string): ModelPrice | null {
  const day = asOf.slice(0, 10);
  const candidates = prices
    .filter((p) => p.modelCode === modelCode)
    .filter((p) => p.effectiveFrom <= day && (!p.effectiveTo || p.effectiveTo >= day))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return candidates[0] ?? null;
}

export interface CallCost {
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  priceEffectiveFrom: string | null;
  note: string;
}

export function costOfCall(input: {
  modelCode: string;
  inputTokens: number;
  outputTokens: number;
  prices: readonly ModelPrice[];
  asOf: string;
}): CallCost {
  const price = priceAsOf(input.prices, input.modelCode, input.asOf);
  if (!price) {
    return {
      inputTokens: input.inputTokens, outputTokens: input.outputTokens,
      inputCost: 0, outputCost: 0, totalCost: 0, priceEffectiveFrom: null,
      // Zero is recorded honestly rather than guessed, and the gap is visible in the report.
      note: `No price on record for ${input.modelCode} on ${input.asOf.slice(0, 10)}. The call is metered at zero and flagged — a guessed price is worse than a missing one, because it reconciles.`,
    };
  }
  const inputCost = round4((input.inputTokens / 1000) * price.inputPer1k);
  const outputCost = round4((input.outputTokens / 1000) * price.outputPer1k);
  return {
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    inputCost,
    outputCost,
    totalCost: round4(inputCost + outputCost),
    priceEffectiveFrom: price.effectiveFrom,
    note: `Priced at the rate in force on ${input.asOf.slice(0, 10)} (effective ${price.effectiveFrom}).`,
  };
}

export interface BudgetVerdict {
  allowed: boolean;
  spent: number;
  budget: number;
  remaining: number;
  action: "allow" | "throttle" | "block";
  message: string;
}

/**
 * Pre-dispatch budget enforcement.
 *
 * The throttle band exists so that hitting a budget degrades the service instead of ending
 * it. At 90% the premium tier is refused and the cheap one still answers; only at 100% does
 * the feature fall to its deterministic step. A budget that goes from "fine" to "off" with
 * nothing in between produces an outage that looks like a bug.
 */
export function checkAiBudget(input: {
  spentToday: number;
  dailyBudget: number;
  estimatedCost: number;
  throttleAtPct?: number;
}): BudgetVerdict {
  const throttleAt = input.throttleAtPct ?? 90;
  const projected = input.spentToday + input.estimatedCost;
  const remaining = round4(Math.max(0, input.dailyBudget - input.spentToday));
  const pct = input.dailyBudget > 0 ? (projected / input.dailyBudget) * 100 : 0;

  if (input.dailyBudget <= 0) {
    return { allowed: true, spent: input.spentToday, budget: input.dailyBudget, remaining: 0, action: "allow", message: "No daily budget configured for this tenant." };
  }
  if (projected > input.dailyBudget) {
    return {
      allowed: false, spent: input.spentToday, budget: input.dailyBudget, remaining, action: "block",
      message: `Daily AI budget of ₹${input.dailyBudget} would be exceeded. The feature falls to its deterministic step — it does not stop working.`,
    };
  }
  if (pct >= throttleAt) {
    return {
      allowed: true, spent: input.spentToday, budget: input.dailyBudget, remaining, action: "throttle",
      message: `${Math.round(pct)}% of the daily budget. Premium routing is refused; the small model still answers.`,
    };
  }
  return { allowed: true, spent: input.spentToday, budget: input.dailyBudget, remaining, action: "allow", message: `₹${remaining} of ₹${input.dailyBudget} remaining today.` };
}

function round4(n: number): number {
  const r = Math.round(n * 10_000) / 10_000;
  return r === 0 ? 0 : r;
}
