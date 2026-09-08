export type DecisionConfidenceBand = "high" | "medium" | "low";

export interface DecisionConfidenceInput {
  evidence: readonly {
    domain: string;
    observedAt: string;
  }[];
  causeCount: number;
  recoveryOptionCount: number;
  hasCommitmentDate: boolean;
  hasDefensibleExposure: boolean;
  previousDecisionCount?: number;
  verifiedOutcomeCount?: number;
  now?: string;
}

export interface DecisionConfidence {
  score: number;
  band: DecisionConfidenceBand;
  meaning: string;
  dimensions: {
    evidenceCoverage: number;
    freshness: number;
    completeness: number;
    learningHistory: number;
  };
  strengths: string[];
  gaps: string[];
}

/**
 * Explainable confidence in the evidence behind a decision — never a probability that a
 * proposed action will work. The score is deterministic so the same facts always receive
 * the same assessment and every point can be explained to a reviewer.
 */
export function assessDecisionConfidence(
  input: DecisionConfidenceInput,
): DecisionConfidence {
  const distinctDomains = new Set(input.evidence.map((item) => item.domain)).size;
  const evidenceCoverage = clamp(
    input.evidence.length === 0
      ? 0
      : 35 + Math.min(input.evidence.length, 3) * 15 + Math.min(distinctDomains, 3) * 10,
  );

  const now = Date.parse(input.now ?? new Date().toISOString());
  const freshnessScores = input.evidence
    .map((item) => Date.parse(item.observedAt))
    .filter(Number.isFinite)
    .map((observedAt) => freshnessScore(Math.max(0, now - observedAt)));
  const freshness = freshnessScores.length === 0
    ? 0
    : Math.round(freshnessScores.reduce((sum, score) => sum + score, 0) / freshnessScores.length);

  const completenessChecks = [
    input.evidence.length > 0,
    input.causeCount > 0,
    input.recoveryOptionCount > 0,
    input.hasCommitmentDate || input.hasDefensibleExposure,
  ];
  const completeness = Math.round(
    (completenessChecks.filter(Boolean).length / completenessChecks.length) * 100,
  );

  const previousDecisionCount = input.previousDecisionCount ?? 0;
  const verifiedOutcomeCount = input.verifiedOutcomeCount ?? 0;
  const learningHistory = verifiedOutcomeCount > 0
    ? 100
    : previousDecisionCount > 0
      ? 75
      : 50;

  const score = Math.round(
    evidenceCoverage * 0.35 +
      freshness * 0.25 +
      completeness * 0.25 +
      learningHistory * 0.15,
  );
  const band: DecisionConfidenceBand = score >= 80 ? "high" : score >= 60 ? "medium" : "low";

  const strengths: string[] = [];
  const gaps: string[] = [];
  if (distinctDomains >= 2) strengths.push(`Evidence agrees across ${distinctDomains} business areas.`);
  else if (input.evidence.length > 0) gaps.push("Only one business area currently supports this decision.");
  else gaps.push("No source record currently supports this decision.");
  if (freshness >= 85) strengths.push("The supporting records are current.");
  else gaps.push("Some supporting records should be refreshed before approval.");
  if (input.causeCount > 0 && input.recoveryOptionCount > 0) {
    strengths.push("The cause and human-approved recovery choices are stated.");
  }
  if (!input.hasCommitmentDate && !input.hasDefensibleExposure) {
    gaps.push("No defensible date or monetary exposure is available.");
  }
  if (verifiedOutcomeCount > 0) strengths.push("A verified outcome from this decision is available for learning.");
  else gaps.push("No verified outcome has been recorded for this decision yet.");

  return {
    score,
    band,
    meaning: "Confidence in the available evidence and completeness—not the probability that a recovery action will succeed.",
    dimensions: { evidenceCoverage, freshness, completeness, learningHistory },
    strengths,
    gaps,
  };
}

function freshnessScore(ageMs: number): number {
  const days = ageMs / 86_400_000;
  if (days <= 1) return 100;
  if (days <= 7) return 85;
  if (days <= 30) return 65;
  if (days <= 90) return 40;
  return 20;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
