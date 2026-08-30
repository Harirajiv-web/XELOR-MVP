import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OeeAnalysisInput } from "./contracts.js";
import { calculateOee, OEE_FORMULAS } from "./oee.js";

const BASE: OeeAnalysisInput = {
  customerCode: "3S",
  assetRef: "asset-turn-01",
  assetCode: "AST-PNQ-TRN-01",
  workCenterCode: "WC-LTH01",
  windowLabel: "Shift A · deterministic POC snapshot",
  windowStart: "2026-08-20T00:30:00.000Z",
  windowEnd: "2026-08-20T08:30:00.000Z",
  generatedAt: "2026-08-20T08:31:00.000Z",
  freshnessThresholdSeconds: 300,
  inputs: {
    plannedProductionSeconds: 28_800,
    runSeconds: 25_200,
    idealCycleSeconds: 60,
    totalCount: 360,
    goodCount: 342,
    rejectCount: 18,
  },
  provenance: {
    sourceSystem: "ONYX_POC_MOCK",
    mode: "mock",
    snapshotVersion: "3s-factory-snapshot-v1",
    observedAt: "2026-08-20T08:30:00.000Z",
    recordRefs: ["shift:3s-a-2026-08-20", "machine:AST-PNQ-TRN-01"],
  },
};

function fixture(overrides: Partial<OeeAnalysisInput> = {}): OeeAnalysisInput {
  return {
    ...BASE,
    ...overrides,
    inputs: { ...BASE.inputs, ...overrides.inputs },
    provenance: { ...BASE.provenance, ...overrides.provenance },
  };
}

describe("deterministic OEE", () => {
  it("publishes every raw input, formula and component behind the 3S result", () => {
    const result = calculateOee(BASE);

    assert.equal(result.status, "complete");
    assert.deepEqual(result.rawInputs, BASE.inputs);
    assert.deepEqual(result.formulas, OEE_FORMULAS);
    assert.deepEqual(
      {
        availability: result.availability.percent,
        performance: result.performance.percent,
        quality: result.quality.percent,
        oee: result.oee.percent,
      },
      { availability: 87.5, performance: 85.71, quality: 95, oee: 71.25 },
    );
    assert.equal(result.oee.ratio, 0.7125);
    assert.equal(result.freshness.ageSeconds, 60);
    assert.equal(result.freshness.status, "fresh");
    assert.deepEqual(result.provenance.recordRefs, BASE.provenance.recordRefs);
  });

  it("uses ONYX's shift label without inventing interval bounds the source does not expose", () => {
    const result = calculateOee(fixture({ windowStart: null, windowEnd: null }));

    assert.equal(result.status, "complete");
    assert.deepEqual(result.window, {
      label: "Shift A · deterministic POC snapshot",
      start: null,
      end: null,
    });
    assert.ok(
      result.warnings.some(
        (item) => item.code === "WINDOW_BOUNDS_UNAVAILABLE" && item.severity === "info",
      ),
    );
  });

  it("returns the same result for the same facts and never edits its input", () => {
    const input = fixture();
    const before = structuredClone(input);
    const first = calculateOee(input);
    const second = calculateOee(input);

    assert.deepEqual(first, second);
    assert.deepEqual(input, before);
    assert.notEqual(first.rawInputs, input.inputs);
    assert.notEqual(first.provenance.recordRefs, input.provenance.recordRefs);
  });

  it("labels the mock POC and makes confidence a data-quality score, not a prediction", () => {
    const result = calculateOee(BASE);

    assert.match(result.disclosure, /illustrative mock/i);
    assert.match(result.disclosure, /not live machine telemetry/i);
    assert.match(result.disclosure, /no machine command/i);
    assert.equal(result.confidence.basis, "deterministic_data_quality_not_prediction");
    assert.equal(result.confidence.dimensions.representativeness, 0);
    assert.equal(result.confidence.band, "medium");
    assert.ok(result.warnings.some((item) => item.code === "MOCK_DATA" && item.severity === "info"));
  });

  it("keeps zero denominators unavailable instead of emitting NaN or Infinity", () => {
    const result = calculateOee(
      fixture({
        inputs: {
          plannedProductionSeconds: 0,
          runSeconds: 0,
          idealCycleSeconds: 60,
          totalCount: 0,
          goodCount: 0,
          rejectCount: 0,
        },
      }),
    );

    assert.equal(result.status, "insufficient_data");
    assert.equal(result.availability.ratio, null);
    assert.equal(result.performance.ratio, null);
    assert.equal(result.quality.ratio, null);
    assert.equal(result.oee.ratio, null);
    assert.ok(result.warnings.some((item) => item.code === "ZERO_PLANNED_PRODUCTION_TIME"));
    assert.ok(result.warnings.some((item) => item.code === "ZERO_RUN_TIME"));
    assert.ok(result.warnings.some((item) => item.code === "ZERO_TOTAL_COUNT"));
    assert.doesNotMatch(JSON.stringify(result), /Infinity|NaN/);
  });

  it("treats a valid zero good count as 0% quality and 0% OEE", () => {
    const result = calculateOee(
      fixture({ inputs: { ...BASE.inputs, goodCount: 0, rejectCount: 360 } }),
    );

    assert.equal(result.status, "complete");
    assert.equal(result.quality.percent, 0);
    assert.equal(result.oee.percent, 0);
  });

  it("does not invent a composite when any required source value is missing", () => {
    const result = calculateOee(
      fixture({ inputs: { ...BASE.inputs, idealCycleSeconds: null, rejectCount: null } }),
    );

    assert.equal(result.status, "insufficient_data");
    assert.equal(result.availability.percent, 87.5, "independent components remain explainable");
    assert.equal(result.performance.percent, null);
    assert.equal(result.oee.percent, null);
    assert.ok(result.warnings.some((item) => item.code === "MISSING_IDEAL_CYCLE_SECONDS"));
    assert.ok(result.confidence.score < calculateOee(BASE).confidence.score);
  });

  it("rejects non-finite, negative and fractional source values without throwing", () => {
    const result = calculateOee(
      fixture({
        inputs: {
          plannedProductionSeconds: Number.NaN,
          runSeconds: -1,
          idealCycleSeconds: Number.POSITIVE_INFINITY,
          totalCount: 10.5,
          goodCount: 9,
          rejectCount: 1,
        },
      }),
    );

    assert.equal(result.status, "invalid_data");
    assert.equal(result.availability.status, "unavailable");
    assert.equal(result.performance.status, "unavailable");
    assert.equal(result.quality.status, "unavailable");
    assert.ok(result.warnings.some((item) => item.code === "INVALID_PLANNED_PRODUCTION_SECONDS"));
    assert.ok(result.warnings.some((item) => item.code === "NEGATIVE_RUN_SECONDS"));
    assert.ok(result.warnings.some((item) => item.code === "INVALID_IDEAL_CYCLE_SECONDS"));
    assert.ok(result.warnings.some((item) => item.code === "FRACTIONAL_TOTAL_COUNT"));
  });

  it("refuses goodCount above totalCount", () => {
    const result = calculateOee(
      fixture({ inputs: { ...BASE.inputs, totalCount: 100, goodCount: 101, rejectCount: 0 } }),
    );

    assert.equal(result.status, "invalid_data");
    assert.equal(result.quality.status, "unavailable");
    assert.equal(result.oee.status, "unavailable");
    assert.ok(result.warnings.some((item) => item.code === "GOOD_COUNT_EXCEEDS_TOTAL"));
  });

  it("retains impossible raw ratios, warns, and caps only the safe composite inputs", () => {
    const result = calculateOee(
      fixture({
        inputs: {
          plannedProductionSeconds: 100,
          runSeconds: 120,
          idealCycleSeconds: 2,
          totalCount: 100,
          goodCount: 100,
          rejectCount: 0,
        },
      }),
    );

    assert.equal(result.availability.rawRatio, 1.2);
    assert.equal(result.availability.ratio, 1);
    assert.equal(result.performance.rawRatio, 1.666667);
    assert.equal(result.performance.ratio, 1);
    assert.equal(result.oee.ratio, 1);
    assert.equal(result.oee.rawRatio, 2);
    assert.equal(result.oee.wasCapped, true);
    assert.ok(result.warnings.some((item) => item.code === "AVAILABILITY_ABOVE_100_PERCENT"));
    assert.ok(result.warnings.some((item) => item.code === "PERFORMANCE_ABOVE_100_PERCENT"));
  });

  it("shows the quality component but withholds composite OEE when counters do not reconcile", () => {
    const result = calculateOee(
      fixture({ inputs: { ...BASE.inputs, totalCount: 360, goodCount: 340, rejectCount: 10 } }),
    );

    assert.equal(result.status, "invalid_data");
    assert.equal(result.quality.percent, 94.44);
    assert.equal(result.oee.percent, null);
    assert.ok(result.warnings.some((item) => item.code === "COUNTS_NOT_RECONCILED"));
  });

  it("makes stale and future observations explicit", () => {
    const fresh = calculateOee(BASE);
    const stale = calculateOee(
      fixture({ provenance: { ...BASE.provenance, observedAt: "2026-08-20T08:20:00.000Z" } }),
    );
    const future = calculateOee(
      fixture({ provenance: { ...BASE.provenance, observedAt: "2026-08-20T08:32:00.000Z" } }),
    );

    assert.equal(stale.freshness.status, "stale");
    assert.equal(stale.freshness.ageSeconds, 660);
    assert.ok(stale.warnings.some((item) => item.code === "STALE_EVIDENCE"));
    assert.ok(stale.confidence.score < fresh.confidence.score);
    assert.equal(future.freshness.status, "future");
    assert.equal(future.freshness.ageSeconds, -60);
    assert.ok(future.warnings.some((item) => item.code === "OBSERVATION_IN_FUTURE"));
  });

  it("flags invalid timestamps, interval order and provenance while preserving raw facts", () => {
    const result = calculateOee(
      fixture({
        windowStart: "2026-08-20T09:00:00.000Z",
        windowEnd: "2026-08-20T08:00:00.000Z",
        generatedAt: "not-a-time",
        provenance: {
          ...BASE.provenance,
          sourceSystem: "",
          snapshotVersion: "",
          observedAt: "also-not-a-time",
          recordRefs: [],
        },
      }),
    );

    assert.equal(result.status, "invalid_data");
    assert.equal(result.freshness.status, "unknown");
    assert.equal(result.freshness.ageSeconds, null);
    assert.ok(result.warnings.some((item) => item.code === "INVALID_WINDOW_ORDER"));
    assert.ok(result.warnings.some((item) => item.code === "INVALID_GENERATED_AT"));
    assert.ok(result.warnings.some((item) => item.code === "INVALID_OBSERVED_AT"));
    assert.ok(result.warnings.some((item) => item.code === "MISSING_SOURCE_SYSTEM"));
    assert.ok(result.warnings.some((item) => item.code === "MISSING_SNAPSHOT_VERSION"));
    assert.ok(result.warnings.some((item) => item.code === "MISSING_RECORD_REFS"));
    assert.deepEqual(result.rawInputs, BASE.inputs);
  });

  it("rejects a half-supplied interval instead of guessing the other bound", () => {
    const result = calculateOee(fixture({ windowStart: null }));

    assert.equal(result.status, "invalid_data");
    assert.ok(result.warnings.some((item) => item.code === "INCOMPLETE_WINDOW_BOUNDS"));
  });

  it("uses and discloses the five-minute freshness default", () => {
    const result = calculateOee(fixture({ freshnessThresholdSeconds: undefined }));
    assert.equal(result.freshness.thresholdSeconds, 300);

    const invalid = calculateOee(fixture({ freshnessThresholdSeconds: 0 }));
    assert.equal(invalid.freshness.thresholdSeconds, 300);
    assert.ok(invalid.warnings.some((item) => item.code === "INVALID_FRESHNESS_THRESHOLD"));
  });
});
