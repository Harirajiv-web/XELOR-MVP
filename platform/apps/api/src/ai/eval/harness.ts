import {
  f1,
  macroF1,
  tallyConfusion,
  evaluateGate,
  type GoldenSet,
  type GateRule,
  type GateVerdict,
  type Confusion,
  type MulticlassScore,
  type PrecisionRecallF1,
} from "@ind-core/platform";

/**
 * A feature's eval definition: where its labelled cases come from, and how the
 * DETERMINISTIC BASELINE vs the CANDIDATE (the feature) predict each case. Predictors
 * are pure over the case input (a golden case carries its own context), so the gate is
 * deterministic and needs no database or model spend to run in CI.
 */
export interface EvalSpec<I = unknown> {
  kind?: "binary";
  featureKey: string;
  loadGoldenSet(): Promise<GoldenSet<I, boolean>> | GoldenSet<I, boolean>;
  baseline(input: I): Promise<boolean> | boolean;
  candidate(input: I): Promise<boolean> | boolean;
  /** optional per-case hard assertions; return the ids of the ones that FAILED. */
  mustPass?(input: I, expected: boolean, predicted: boolean): Promise<string[]> | string[];
  rule: GateRule;
}

export interface Scorecard {
  kind: "binary";
  featureKey: string;
  datasetVersion: string;
  cases: number;
  baseline: PrecisionRecallF1 & { confusion: Confusion };
  candidate: PrecisionRecallF1 & { confusion: Confusion };
  mustPassFailures: string[];
  verdict: GateVerdict;
}

/** Run a feature's golden set and produce the scorecard + PASS/FAIL verdict (§4.1). */
export async function runEval<I>(spec: EvalSpec<I>): Promise<Scorecard> {
  const gs = await spec.loadGoldenSet();
  const basePairs: Array<{ expected: boolean; predicted: boolean }> = [];
  const candPairs: Array<{ expected: boolean; predicted: boolean }> = [];
  const mustPassFailures: string[] = [];

  for (const c of gs.cases) {
    const base = await spec.baseline(c.input);
    basePairs.push({ expected: c.expected, predicted: base });
    const cand = await spec.candidate(c.input);
    candPairs.push({ expected: c.expected, predicted: cand });
    if (spec.mustPass) {
      const fails = await spec.mustPass(c.input, c.expected, cand);
      for (const f of fails) mustPassFailures.push(`${c.id}:${f}`);
    }
  }

  const baseConf = tallyConfusion(basePairs);
  const candConf = tallyConfusion(candPairs);
  const baseM = f1(baseConf);
  const candM = f1(candConf);
  const verdict = evaluateGate({
    candidateMetric: candM.f1,
    baselineMetric: baseM.f1,
    mustPassFailures,
    rule: spec.rule,
  });

  return {
    kind: "binary",
    featureKey: gs.featureKey,
    datasetVersion: gs.datasetVersion,
    cases: gs.cases.length,
    baseline: { ...baseM, confusion: baseConf },
    candidate: { ...candM, confusion: candConf },
    mustPassFailures,
    verdict,
  };
}

/* =========================== multi-class gates ============================= */

/**
 * A gate for a feature that picks ONE LABEL FROM A CLOSED SET rather than answering
 * yes/no. Ticket triage is the first: eight categories, and "did it pick the right one"
 * is not a question precision and recall can answer on their own.
 *
 * The headline metric is **macro-F1** — the unweighted mean of the per-class F1 scores.
 * Weighting by support would let a classifier that is excellent on the two common
 * categories and useless on the six rare ones post a fine number, and the rare categories
 * are the ones a human would otherwise have to catch. A DPDP rights request misfiled as
 * "support" is a statutory clock nobody started; there are few of them, and that is
 * exactly why they must count as much as an oil leak.
 */
export interface MulticlassEvalSpec<I = unknown> {
  kind: "multiclass";
  featureKey: string;
  loadGoldenSet(): Promise<GoldenSet<I, string>> | GoldenSet<I, string>;
  baseline(input: I): Promise<string> | string;
  candidate(input: I): Promise<string> | string;
  mustPass?(input: I, expected: string, predicted: string): Promise<string[]> | string[];
  rule: GateRule;
}

export interface MulticlassScorecard {
  kind: "multiclass";
  featureKey: string;
  datasetVersion: string;
  cases: number;
  baseline: MulticlassScore;
  candidate: MulticlassScore;
  mustPassFailures: string[];
  verdict: GateVerdict;
}

export async function runMulticlassEval<I>(spec: MulticlassEvalSpec<I>): Promise<MulticlassScorecard> {
  const gs = await spec.loadGoldenSet();
  const basePairs: Array<{ expected: string; predicted: string }> = [];
  const candPairs: Array<{ expected: string; predicted: string }> = [];
  const mustPassFailures: string[] = [];

  for (const c of gs.cases) {
    basePairs.push({ expected: c.expected, predicted: await spec.baseline(c.input) });
    const cand = await spec.candidate(c.input);
    candPairs.push({ expected: c.expected, predicted: cand });
    if (spec.mustPass) {
      for (const f of await spec.mustPass(c.input, c.expected, cand)) mustPassFailures.push(`${c.id}:${f}`);
    }
  }

  const baseline = macroF1(basePairs);
  const candidate = macroF1(candPairs);
  return {
    kind: "multiclass",
    featureKey: gs.featureKey,
    datasetVersion: gs.datasetVersion,
    cases: gs.cases.length,
    baseline,
    candidate,
    mustPassFailures,
    verdict: evaluateGate({
      candidateMetric: candidate.macroF1,
      baselineMetric: baseline.macroF1,
      mustPassFailures,
      rule: spec.rule,
    }),
  };
}

export type AnyEvalSpec<I = unknown> = EvalSpec<I> | MulticlassEvalSpec<I>;
export type AnyScorecard = Scorecard | MulticlassScorecard;

/** Run whichever kind of gate a feature registered. */
export async function runAnyEval(spec: AnyEvalSpec): Promise<AnyScorecard> {
  return spec.kind === "multiclass" ? runMulticlassEval(spec) : runEval(spec as EvalSpec);
}
