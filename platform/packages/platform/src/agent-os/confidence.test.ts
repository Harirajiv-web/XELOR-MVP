import assert from "node:assert/strict";
import test from "node:test";
import { assessDecisionConfidence } from "./confidence.js";

const now = "2026-08-03T12:00:00.000Z";

test("rates fresh cross-domain evidence with a verified outcome as high confidence", () => {
  const result = assessDecisionConfidence({
    evidence: [
      { domain: "sales", observedAt: now },
      { domain: "planning", observedAt: "2026-08-03T10:00:00.000Z" },
    ],
    causeCount: 1,
    recoveryOptionCount: 3,
    hasCommitmentDate: true,
    hasDefensibleExposure: true,
    previousDecisionCount: 1,
    verifiedOutcomeCount: 1,
    now,
  });

  assert.equal(result.band, "high");
  assert.ok(result.score >= 80);
  assert.match(result.meaning, /not the probability/i);
  assert.ok(result.strengths.some((item) => /business areas/i.test(item)));
});

test("exposes evidence gaps instead of manufacturing certainty", () => {
  const result = assessDecisionConfidence({
    evidence: [],
    causeCount: 0,
    recoveryOptionCount: 0,
    hasCommitmentDate: false,
    hasDefensibleExposure: false,
    now,
  });

  assert.equal(result.band, "low");
  assert.ok(result.score < 60);
  assert.ok(result.gaps.some((item) => /no source record/i.test(item)));
  assert.ok(result.gaps.some((item) => /no defensible date/i.test(item)));
});

test("penalises stale evidence deterministically", () => {
  const fresh = assessDecisionConfidence({
    evidence: [{ domain: "quality", observedAt: now }],
    causeCount: 1,
    recoveryOptionCount: 1,
    hasCommitmentDate: true,
    hasDefensibleExposure: false,
    now,
  });
  const stale = assessDecisionConfidence({
    evidence: [{ domain: "quality", observedAt: "2025-01-01T00:00:00.000Z" }],
    causeCount: 1,
    recoveryOptionCount: 1,
    hasCommitmentDate: true,
    hasDefensibleExposure: false,
    now,
  });

  assert.ok(fresh.score > stale.score);
  assert.equal(fresh.dimensions.freshness, 100);
  assert.equal(stale.dimensions.freshness, 20);
});
