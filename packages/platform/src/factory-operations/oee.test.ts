import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeOee } from "./oee.js";

describe("deterministic factory OEE", () => {
  it("computes availability × performance × quality without rounding the inputs", () => {
    const result = computeOee({
      plannedProductionSeconds: 100,
      runSeconds: 80,
      idealCycleSeconds: 2,
      totalCount: 32,
      goodCount: 30,
      rejectCount: 2,
    });
    assert.deepEqual(
      {
        status: result.status,
        availabilityPct: result.availabilityPct,
        performancePct: result.performancePct,
        qualityPct: result.qualityPct,
        oeePct: result.oeePct,
      },
      {
        status: "complete",
        availabilityPct: 80,
        performancePct: 80,
        qualityPct: 93.75,
        oeePct: 60,
      },
    );
    assert.deepEqual(result.warnings, []);
  });

  it("derives total count from independently evidenced good and reject counters", () => {
    const result = computeOee({
      plannedProductionSeconds: 100,
      runSeconds: 80,
      idealCycleSeconds: 2,
      goodCount: 30,
      rejectCount: 2,
    });
    assert.equal(result.inputs.totalCount, 32);
    assert.equal(result.status, "complete");
  });

  it("returns an incomplete result instead of inventing planned production time", () => {
    const result = computeOee({ runSeconds: 80, idealCycleSeconds: 2, goodCount: 30, rejectCount: 2 });
    assert.equal(result.status, "incomplete");
    assert.equal(result.availabilityPct, null);
    assert.equal(result.oeePct, null);
    assert.ok(result.warnings.some((warning) => warning.includes("Planned production time is missing")));
  });

  it("does not divide by zero for an idle, zero-output shift", () => {
    const result = computeOee({
      plannedProductionSeconds: 100,
      runSeconds: 0,
      idealCycleSeconds: 2,
      totalCount: 0,
      goodCount: 0,
      rejectCount: 0,
    });
    assert.equal(result.availabilityPct, 0);
    assert.equal(result.performancePct, null);
    assert.equal(result.qualityPct, null);
    assert.equal(result.oeePct, null);
    assert.equal(result.status, "incomplete");
  });

  it("marks negative and non-finite evidence invalid", () => {
    const negative = computeOee({
      plannedProductionSeconds: 100,
      runSeconds: -1,
      idealCycleSeconds: 2,
      totalCount: 10,
      goodCount: 10,
      rejectCount: 0,
    });
    const infinite = computeOee({
      plannedProductionSeconds: Number.POSITIVE_INFINITY,
      runSeconds: 10,
      idealCycleSeconds: 2,
      totalCount: 5,
      goodCount: 5,
      rejectCount: 0,
    });
    assert.equal(negative.status, "invalid");
    assert.equal(negative.oeePct, null);
    assert.equal(infinite.status, "invalid");
  });

  it("refuses inconsistent counters rather than picking the convenient total", () => {
    const result = computeOee({
      plannedProductionSeconds: 100,
      runSeconds: 80,
      idealCycleSeconds: 2,
      totalCount: 40,
      goodCount: 30,
      rejectCount: 2,
    });
    assert.equal(result.status, "invalid");
    assert.equal(result.oeePct, null);
    assert.ok(result.warnings.includes("Total count does not equal good count plus reject count."));
  });

  it("refuses a good counter greater than total output", () => {
    const result = computeOee({
      plannedProductionSeconds: 100,
      runSeconds: 80,
      idealCycleSeconds: 2,
      totalCount: 20,
      goodCount: 21,
    });
    assert.equal(result.status, "invalid");
    assert.equal(result.qualityPct, null);
    assert.equal(result.oeePct, null);
  });

  it("does not cap performance above 100 percent and names the anomaly", () => {
    const result = computeOee({
      plannedProductionSeconds: 100,
      runSeconds: 40,
      idealCycleSeconds: 2,
      totalCount: 24,
      goodCount: 24,
      rejectCount: 0,
    });
    assert.equal(result.performancePct, 120);
    assert.equal(result.status, "complete");
    assert.ok(result.warnings.some((warning) => warning.includes("performance is above 100%")));
  });

  it("does not cap availability when run time exceeds the supplied shift", () => {
    const result = computeOee({
      plannedProductionSeconds: 80,
      runSeconds: 100,
      idealCycleSeconds: 2,
      totalCount: 40,
      goodCount: 40,
      rejectCount: 0,
    });
    assert.equal(result.availabilityPct, 125);
    assert.ok(result.warnings.some((warning) => warning.includes("availability is above 100%")));
  });

  it("is byte-for-byte deterministic for the same evidence", () => {
    const input = Object.freeze({
      plannedProductionSeconds: 28_800,
      runSeconds: 24_000,
      idealCycleSeconds: 600,
      goodCount: 37,
      rejectCount: 1,
    });
    assert.deepEqual(computeOee(input), computeOee(input));
  });
});
