import {
  f1,
  tallyConfusion,
  evaluateGate,
  type GoldenSet,
  type GateRule,
  type GateVerdict,
  type Confusion,
  type PrecisionRecallF1,
} from "@ind-core/platform";

/**
 * A feature's eval definition: where its labelled cases come from, and how the
 * DETERMINISTIC BASELINE vs the CANDIDATE (the feature) predict each case. Predictors
 * are pure over the case input (a golden case carries its own context), so the gate is
 * deterministic and needs no database or model spend to run in CI.
 */
export interface EvalSpec<I = unknown> {
  featureKey: string;
  loadGoldenSet(): Promise<GoldenSet<I, boolean>> | GoldenSet<I, boolean>;
  baseline(input: I): Promise<boolean> | boolean;
  candidate(input: I): Promise<boolean> | boolean;
  /** optional per-case hard assertions; return the ids of the ones that FAILED. */
  mustPass?(input: I, expected: boolean, predicted: boolean): Promise<string[]> | string[];
  rule: GateRule;
}

export interface Scorecard {
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
    featureKey: gs.featureKey,
    datasetVersion: gs.datasetVersion,
    cases: gs.cases.length,
    baseline: { ...baseM, confusion: baseConf },
    candidate: { ...candM, confusion: candConf },
    mustPassFailures,
    verdict,
  };
}
