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
