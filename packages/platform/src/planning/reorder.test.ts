import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyAbc, detectPolicyConflicts, reorderPolicy, safetyStockFor, zForServiceLevel } from "./reorder.js";

describe("safety stock", () => {
  it("uses the statistical formula from the spec", () => {
    // Z=1.645, LT=2, σd=10, d=40, σLT=0.5
    // sqrt(2·100 + 1600·0.25) = sqrt(200 + 400) = sqrt(600) = 24.4949 → ×1.645 = 40.294
    const r = safetyStockFor({ meanDemand: 40, demandStdDev: 10, meanLeadTime: 2, leadTimeStdDev: 0.5, serviceLevel: 0.95, historyPeriods: 52 });
    assert.equal(r.z, 1.645);
    assert.ok(Math.abs(r.safetyStock - 40.294) < 0.01, `got ${r.safetyStock}`);
  });

  it("names which uncertainty is actually driving the buffer", () => {
    const supplierProblem = safetyStockFor({ meanDemand: 100, demandStdDev: 1, meanLeadTime: 2, leadTimeStdDev: 1, serviceLevel: 0.95, historyPeriods: 52 });
    assert.equal(supplierProblem.dominantDriver, "lead_time");
    assert.match(supplierProblem.explanation, /SUPPLIER is unreliable/);

    const demandProblem = safetyStockFor({ meanDemand: 10, demandStdDev: 30, meanLeadTime: 4, leadTimeStdDev: 0.01, serviceLevel: 0.95, historyPeriods: 52 });
    assert.equal(demandProblem.dominantDriver, "demand");
    assert.match(demandProblem.explanation, /demand varies/);
  });

  it("flags a figure computed from too little history rather than presenting it as fact", () => {
    const r = safetyStockFor({ meanDemand: 40, demandStdDev: 10, meanLeadTime: 2, leadTimeStdDev: 0.5, serviceLevel: 0.95, historyPeriods: 8 });
    assert.equal(r.confident, false);
    assert.match(r.explanation, /below the 26 needed/);
  });

  it("rounds an undefined service level DOWN rather than inventing a multiplier", () => {
    const z = zForServiceLevel(0.97);
    assert.equal(z.z, 1.645); // the 0.95 step, not an interpolation
    assert.match(z.note, /rather than interpolating/);
  });
});

describe("reorder points", () => {
  it("covers the demand that will arrive while the order is in transit", () => {
    const r = reorderPolicy({
      itemId: "i1",
      itemCode: "MECH-SEAL-25",
      method: "reorder_point",
      meanDemand: 30,
      leadTimePeriods: 2,
      safetyStock: 48,
      annualDemand: 1560,
      orderCost: 400,
      holdingCost: 31,
    });
    assert.equal(r.demandDuringLeadTime, 60);
    assert.equal(r.reorderPoint, 108);
    assert.ok(r.orderQty !== null && r.orderQty > 0);
    assert.match(r.explanation, /Raise an order when stock falls to 108/);
  });

  it("min/max derives a sensible maximum when none is given", () => {
    const r = reorderPolicy({ itemId: "i2", itemCode: "WASHER-8", method: "min_max", meanDemand: 100, leadTimePeriods: 1, safetyStock: 50 });
    assert.equal(r.reorderPoint, 150);
    assert.ok((r.maxLevel ?? 0) > r.reorderPoint);
  });
});

describe("the conflict guard", () => {
  const base = { hasBom: false, safetyStock: 0, leadTimeWorkingDays: 6 };

  it("catches the double-ordering trap — MRP AND a reorder point on the same item", () => {
    const c = detectPolicyConflicts([
      { ...base, itemId: "i1", itemCode: "MOTOR-5HP", method: "mrp", hasReorderPoint: true, isMrpPlanned: true },
    ]);
    assert.equal(c.length, 1);
    assert.equal(c[0]!.severity, "critical");
    assert.match(c[0]!.message, /ordered twice/);
  });

  it("catches a manufactured item planned by reorder point — its components never see the demand", () => {
    const c = detectPolicyConflicts([
      { ...base, itemId: "i2", itemCode: "IMPELLER-KV50", method: "reorder_point", hasReorderPoint: true, isMrpPlanned: false, hasBom: true },
    ]);
    assert.ok(c.some((x) => /components will never see the demand/.test(x.message)));
  });

  it("catches a maximum level at or below the reorder point", () => {
    const c = detectPolicyConflicts([
      { ...base, itemId: "i3", itemCode: "GLAND-20", method: "min_max", hasReorderPoint: true, isMrpPlanned: false, reorderPoint: 100, maxLevel: 90 },
    ]);
    assert.ok(c.some((x) => /at or below its reorder point/.test(x.message)));
  });

  it("catches safety stock buffering a lead time of zero", () => {
    const c = detectPolicyConflicts([
      { ...base, itemId: "i4", itemCode: "OIL-68", method: "reorder_point", hasReorderPoint: true, isMrpPlanned: false, safetyStock: 40, leadTimeWorkingDays: 0 },
    ]);
    assert.ok(c.some((x) => /buffering a risk it does not have/.test(x.message)));
  });

  it("is quiet when the policies are coherent", () => {
    const c = detectPolicyConflicts([
      { ...base, itemId: "i5", itemCode: "PUMP-KV50", method: "mrp", hasReorderPoint: false, isMrpPlanned: true, hasBom: true },
    ]);
    assert.deepEqual(c, []);
  });

  it("sorts the worst first, because a planner works down the page", () => {
    const c = detectPolicyConflicts([
      { ...base, itemId: "i6", itemCode: "ZZ", method: "reorder_point", hasReorderPoint: true, isMrpPlanned: false, safetyStock: 5, leadTimeWorkingDays: 0 },
      { ...base, itemId: "i7", itemCode: "AA", method: "mrp", hasReorderPoint: true, isMrpPlanned: true },
    ]);
    assert.equal(c[0]!.severity, "critical");
  });
});

describe("ABC classification", () => {
  it("classifies by annual VALUE, not by quantity", () => {
    const rows = classifyAbc([
      { itemId: "a", itemCode: "PUMP-KV50", annualValue: 8_000_000 },
      { itemId: "b", itemCode: "MOTOR-5HP", annualValue: 1_200_000 },
      { itemId: "c", itemCode: "WASHER-8", annualValue: 50_000 },
      { itemId: "d", itemCode: "GREASE", annualValue: 20_000 },
    ]);
    assert.equal(rows[0]!.abc, "A");
    assert.equal(rows[0]!.itemCode, "PUMP-KV50");
    assert.equal(rows.find((r) => r.itemCode === "GREASE")!.abc, "C");
  });

  it("a single dominant item lands in A alone, not dragging the catalogue with it", () => {
    const rows = classifyAbc([
      { itemId: "a", itemCode: "BIG", annualValue: 900 },
      { itemId: "b", itemCode: "SMALL1", annualValue: 60 },
      { itemId: "c", itemCode: "SMALL2", annualValue: 40 },
    ]);
    // BIG alone is 90% of value; classifying on the share BEFORE each item keeps it alone in A.
    assert.deepEqual(rows.map((r) => r.abc), ["A", "B", "C"]);
  });

  it("survives a catalogue with no value at all", () => {
    const rows = classifyAbc([{ itemId: "a", itemCode: "X", annualValue: 0 }]);
    assert.equal(rows[0]!.abc, "A");
    assert.equal(rows[0]!.cumulativeShare, 0);
  });
});
