import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMps, checkFence, earliestPromise } from "./mps.js";
import { consumeForecast, consumptionSummary } from "./forecast.js";

/**
 * The demand and MPS tables are PLANNING §20.4, shifted one week to the DECISIONS-V2 §7
 * demo date the same way the MRP golden case is.
 */
const DEMAND = [
  { bucket: "2026-W31", forecastQty: 20, orderQty: 24 },
  { bucket: "2026-W32", forecastQty: 20, orderQty: 18 },
  { bucket: "2026-W33", forecastQty: 20, orderQty: 25 },
  { bucket: "2026-W34", forecastQty: 20, orderQty: 10 },
  { bucket: "2026-W35", forecastQty: 20, orderQty: 0 },
];

describe("forecast consumption", () => {
  it("demand is max(Forecast, Orders) — never the sum", () => {
    const rows = consumeForecast(DEMAND);
    assert.deepEqual(rows.map((r) => r.netDemand), [24, 20, 25, 20, 20]);
    // Adding them would plan 44 pumps in the first bucket for 24 real ones.
    assert.notEqual(rows[0]!.netDemand, 44);
  });

  it("real orders consume the forecast they were predicted by", () => {
    const rows = consumeForecast(DEMAND);
    assert.equal(rows[0]!.consumedQty, 20); // 24 ordered against 20 forecast: all 20 consumed
    assert.equal(rows[0]!.remainingForecast, 0);
    assert.equal(rows[1]!.consumedQty, 20);
  });

  it("an order reaches into the neighbouring bucket's forecast rather than double-counting", () => {
    const rows = consumeForecast([
      { bucket: "W1", forecastQty: 0, orderQty: 10 },
      { bucket: "W2", forecastQty: 10, orderQty: 0 },
    ]);
    // The W1 order consumed W2's forecast through the forward window…
    assert.equal(rows[1]!.remainingForecast, 0);
    assert.equal(rows[0]!.unforecastOrderQty, 0);
    // …but per-bucket demand is still max(F,O), so W2 keeps its own forecast figure.
    assert.deepEqual(rows.map((r) => r.netDemand), [10, 10]);
  });

  it("orders with no forecast anywhere in reach are reported, not absorbed", () => {
    const rows = consumeForecast([{ bucket: "W1", forecastQty: 0, orderQty: 30 }]);
    assert.equal(rows[0]!.unforecastOrderQty, 30);
    assert.match(consumptionSummary(rows).note, /no forecast behind them/);
  });

  it("summarises consumption as a fraction, not a grade", () => {
    const s = consumptionSummary(consumeForecast(DEMAND));
    assert.equal(s.forecastTotal, 100);
    assert.equal(s.orderTotal, 77);
    assert.equal(s.consumedTotal, 77);
    assert.equal(s.consumedFraction, 0.77);
  });
});

describe("the master production schedule", () => {
  const MPS = {
    onHand: 8,
    rows: [
      { bucket: "2026-W31", mpsReceiptQty: 16, forecastQty: 20, orderQty: 24 },
      { bucket: "2026-W32", mpsReceiptQty: 20, forecastQty: 20, orderQty: 18 },
      { bucket: "2026-W33", mpsReceiptQty: 25, forecastQty: 20, orderQty: 25 },
      { bucket: "2026-W34", mpsReceiptQty: 20, forecastQty: 20, orderQty: 10 },
      { bucket: "2026-W35", mpsReceiptQty: 20, forecastQty: 20, orderQty: 0 },
    ],
    demandTimeFenceBuckets: 1,
    planningTimeFenceBuckets: 3,
  };

  it("reproduces the blueprint's projected on-hand row", () => {
    const rows = buildMps(MPS);
    assert.deepEqual(rows.map((r) => r.projectedOnHand), [0, 0, 0, 0, 0]);
  });

  it("reproduces the blueprint's discrete ATP row", () => {
    const rows = buildMps(MPS);
    // 8 + 16 − 24 = 0 · 20 − 18 = 2 · 25 − 25 = 0 · 20 − 10 = 10 · 20 − 0 = 20
    assert.deepEqual(rows.map((r) => r.atp), [0, 2, 0, 10, 20]);
  });

  it("ATP is NOT projected on-hand — it answers a different question", () => {
    const rows = buildMps(MPS);
    // Both are 0 in W33, but for opposite reasons: stock will be zero, and everything
    // arriving is already sold. Quoting on-hand to a customer promises the same pump twice.
    assert.equal(rows[3]!.projectedOnHand, 0);
    assert.equal(rows[3]!.atp, 10);
  });

  it("stock already promised is not available to promise again", () => {
    const rows = buildMps({ ...MPS, allocatedQty: 8 });
    assert.equal(rows[0]!.atp, -8);
    assert.match(rows[0]!.warnings.join(" "), /more is committed than will be available/);
  });

  it("answers the salesperson's actual question with a week", () => {
    const rows = buildMps(MPS);
    const p = earliestPromise(rows, 12);
    assert.equal(p.bucket, "2026-W34"); // 0 + 2 + 0 + 10 = 12
    assert.match(p.message, /can be promised by 2026-W34/);
  });

  it("says so plainly when the horizon cannot cover the ask", () => {
    const p = earliestPromise(buildMps(MPS), 500);
    assert.equal(p.bucket, null);
    assert.match(p.message, /needs the schedule extended/);
  });

  it("marks the fences the blueprint specifies", () => {
    const rows = buildMps(MPS);
    assert.deepEqual(rows.map((r) => r.fence), ["frozen", "firm", "firm", "free", "free"]);
  });

  it("a frozen bucket cannot be changed without a named override", () => {
    const rows = buildMps(MPS);
    const blocked = checkFence(rows[0]!, 20);
    assert.equal(blocked.allowed, false);
    assert.match(blocked.reason, /material is already committed/);

    const noReason = checkFence(rows[0]!, 20, { hasOverrideRole: true });
    assert.equal(noReason.allowed, false, "the role alone is not enough — the reason is the record");

    const allowed = checkFence(rows[0]!, 20, { hasOverrideRole: true, overrideReason: "Customer pulled SO-1042 in by a week." });
    assert.equal(allowed.allowed, true);
    assert.match(allowed.reason, /Customer pulled SO-1042/);
  });

  it("a free bucket changes without ceremony", () => {
    const rows = buildMps(MPS);
    assert.equal(checkFence(rows[4]!, 30).allowed, true);
    assert.equal(checkFence(rows[4]!, 30).requiresOverride, false);
  });

  it("negative on-hand is floored and reported", () => {
    const rows = buildMps({ ...MPS, onHand: -4 });
    assert.match(rows[0]!.warnings.join(" "), /cannot be negative/);
  });
});
