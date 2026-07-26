import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyLotRule, economicOrderQty } from "./lotsize.js";

describe("lot sizing", () => {
  it("L4L orders exactly the shortfall", () => {
    const r = applyLotRule(22, { rule: "L4L" });
    assert.equal(r.qty, 22);
    assert.equal(r.overage, 0);
  });

  it("MOQ lifts a small shortfall to the supplier's minimum", () => {
    const r = applyLotRule(22, { rule: "MOQ", lotSize: 50 });
    assert.equal(r.qty, 50);
    assert.equal(r.overage, 28);
    assert.match(r.reason, /minimum order quantity 50/);
  });

  it("MOQ does not cap a shortfall that already exceeds it", () => {
    const r = applyLotRule(80, { rule: "MOQ", lotSize: 50 });
    assert.equal(r.qty, 80, "an MOQ is a floor, never a ceiling");
  });

  it("MULT rounds up to the next multiple, never down", () => {
    assert.equal(applyLotRule(51, { rule: "MULT", lotSize: 25 }).qty, 75);
    assert.equal(applyLotRule(50, { rule: "MULT", lotSize: 25 }).qty, 50, "an exact multiple must not be bumped");
  });

  it("FOQ orders MORE THAN ONE fixed batch when one is not enough", () => {
    // The trap: returning a single 40 against a shortfall of 90 turns a sizing policy into
    // a shortage of 50 that nothing else will ever report.
    const r = applyLotRule(90, { rule: "FOQ", lotSize: 40 });
    assert.equal(r.qty, 120);
    assert.match(r.reason, /3 batches/);
  });

  it("EOQ is the textbook square root, and shows its working", () => {
    // D=1200, S=500, H=15 → sqrt(2·1200·500/15) = sqrt(80000) ≈ 282.84
    const eoq = economicOrderQty(1200, 500, 15)!;
    assert.ok(Math.abs(eoq - 282.842) < 0.01);
    const r = applyLotRule(50, { rule: "EOQ", annualDemand: 1200, orderCost: 500, holdingCost: 15 });
    assert.equal(r.qty, 283);
    assert.match(r.reason, /Economic order quantity 283/);
  });

  it("EOQ with a missing input falls back to the shortfall AND SAYS SO", () => {
    const r = applyLotRule(50, { rule: "EOQ", annualDemand: 1200, orderCost: 500 });
    assert.equal(r.qty, 50);
    assert.match(r.reason, /one is missing/, "a silent fallback to L4L would hide a misconfigured item");
  });

  it("EOQ never orders less than the shortfall", () => {
    const r = applyLotRule(500, { rule: "EOQ", annualDemand: 1200, orderCost: 500, holdingCost: 15 });
    assert.equal(r.qty, 500);
  });

  it("POQ covers the buckets ahead as well as this one", () => {
    const r = applyLotRule(10, { rule: "POQ", lotSize: 3 }, [12, 8, 20]);
    assert.equal(r.qty, 30); // this bucket's 10 plus the next two: 12 + 8
    assert.match(r.reason, /covering 3 buckets/);
  });

  it("respects UOM precision — metres are not integers", () => {
    const r = applyLotRule(14.2001, { rule: "L4L", uomPrecision: 3 });
    assert.equal(r.qty, 14.201);
    assert.equal(applyLotRule(14.2001, { rule: "L4L", uomPrecision: 0 }).qty, 15);
  });

  it("a zero or negative net requirement orders nothing", () => {
    assert.equal(applyLotRule(0, { rule: "MOQ", lotSize: 50 }).qty, 0);
    assert.equal(applyLotRule(-5, { rule: "MOQ", lotSize: 50 }).qty, 0);
  });

  it("a supplier floor applies on top of whatever the rule decided", () => {
    const r = applyLotRule(10, { rule: "L4L", minOrderQty: 25 });
    assert.equal(r.qty, 25);
    assert.match(r.reason, /supplier minimum/);
  });

  it("never returns negative zero, which would make an unchanged plan look changed", () => {
    assert.ok(!Object.is(applyLotRule(0, { rule: "L4L" }).qty, -0));
  });
});
