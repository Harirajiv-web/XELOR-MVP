/**
 * The golden-set eval gate (DECISIONS-V2 §4.1): "every AI feature must pass a
 * golden-set eval gate before it ships — it must beat the deterministic baseline, and
 * a failing gate blocks promotion." This is the pure scoring + gate core (no I/O); the
 * harness that runs a feature's pipeline over cases lives in the app.
 *
 * Two ways a candidate FAILS (mirroring the AI-OPERATIONS Prompt-Studio demo):
 *   1. it does not beat the deterministic baseline on the headline metric, OR
 *   2. a MUST-PASS assertion regresses — even if the headline metric improved.
 */

export interface GoldenCase<I = unknown, E = unknown> {
  id: string;
  input: I;
  expected: E;
}

export interface GoldenSet<I = unknown, E = unknown> {
  featureKey: string;
  datasetVersion: string;
  cases: GoldenCase<I, E>[];
}

/** Binary confusion counts for classification features (e.g. duplicate? yes/no). */
export interface Confusion {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

export function tallyConfusion(pairs: Array<{ expected: boolean; predicted: boolean }>): Confusion {
  const c: Confusion = { tp: 0, fp: 0, tn: 0, fn: 0 };
  for (const { expected, predicted } of pairs) {
    if (expected && predicted) c.tp++;
    else if (!expected && predicted) c.fp++;
    else if (!expected && !predicted) c.tn++;
    else c.fn++;
  }
  return c;
}

export interface PrecisionRecallF1 {
  precision: number;
  recall: number;
  f1: number;
}

export function f1(c: Confusion): PrecisionRecallF1 {
  const precision = c.tp + c.fp === 0 ? 1 : c.tp / (c.tp + c.fp);
  const recall = c.tp + c.fn === 0 ? 1 : c.tp / (c.tp + c.fn);
  const denom = precision + recall;
  return { precision, recall, f1: denom === 0 ? 0 : (2 * precision * recall) / denom };
}

/**
 * MULTI-CLASS SCORING.
 *
 * Binary precision/recall is the wrong instrument for a classifier that picks one of eight
 * categories: a model that answers "support" to everything would look respectable on a
 * yes/no metric while being useless. **Macro-F1** — the unweighted mean of the per-class
 * F1 scores — is the metric CSP's ship gate names, and it is unweighted on purpose: the
 * rare classes (a data-protection rights request) are the ones where being wrong costs
 * the most, so they count as much as the common ones.
 */
export interface ClassScore extends PrecisionRecallF1 {
  label: string;
  support: number;
}

export interface MulticlassScore {
  macroF1: number;
  accuracy: number;
  perClass: ClassScore[];
}

export function macroF1(pairs: Array<{ expected: string; predicted: string }>): MulticlassScore {
  const labels = [...new Set(pairs.flatMap((p) => [p.expected, p.predicted]))].sort();
  const perClass: ClassScore[] = labels.map((label) => {
    const c = tallyConfusion(
      pairs.map((p) => ({ expected: p.expected === label, predicted: p.predicted === label })),
    );
    return { label, support: pairs.filter((p) => p.expected === label).length, ...f1(c) };
  });
  // Classes with no support in the golden set are excluded: scoring a model on a category
  // the set never exercises rewards or punishes it for nothing.
  const scored = perClass.filter((c) => c.support > 0);
  const macro = scored.length === 0 ? 0 : scored.reduce((a, c) => a + c.f1, 0) / scored.length;
  const correct = pairs.filter((p) => p.expected === p.predicted).length;
  return {
    macroF1: Math.round(macro * 10000) / 10000,
    accuracy: pairs.length === 0 ? 0 : Math.round((correct / pairs.length) * 10000) / 10000,
    perClass,
  };
}

export interface GateRule {
  /** display name of the headline metric, e.g. "field-F1". */
  metric: string;
  /** candidate must beat baseline by at least this margin (0 = must be ≥). */
  tolerance: number;
  /** when true, any failed must-pass assertion blocks promotion regardless of metric. */
  requireMustPass: boolean;
}

export interface GateInput {
  candidateMetric: number;
  baselineMetric: number;
  /** identifiers of must-pass assertions that failed, e.g. "case-7:gstin_state_check". */
  mustPassFailures: string[];
  rule: GateRule;
}

export interface GateVerdict {
  pass: boolean;
  delta: number; // candidate - baseline
  reasons: string[]; // human-readable, shown inline on the gate panel
}

export function evaluateGate(g: GateInput): GateVerdict {
  const delta = g.candidateMetric - g.baselineMetric;
  const beatsBaseline = delta >= g.rule.tolerance;
  const mustPassOk = !g.rule.requireMustPass || g.mustPassFailures.length === 0;
  const reasons: string[] = [];

  if (!beatsBaseline) {
    reasons.push(
      `${g.rule.metric} ${g.candidateMetric.toFixed(3)} does not beat baseline ${g.baselineMetric.toFixed(3)} (needs +${g.rule.tolerance})`,
    );
  }
  if (!mustPassOk) {
    reasons.push(`must-pass assertions failed: ${g.mustPassFailures.join(", ")}`);
  }
  const pass = beatsBaseline && mustPassOk;
  if (pass) {
    reasons.push(
      `${g.rule.metric} ${g.candidateMetric.toFixed(3)} ≥ baseline ${g.baselineMetric.toFixed(3)}; all must-pass assertions held`,
    );
  }
  return { pass, delta, reasons };
}
