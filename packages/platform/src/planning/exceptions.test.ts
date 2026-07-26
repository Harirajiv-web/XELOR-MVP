import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateExceptions, severityFor, summarise, type OpenSupply } from "./exceptions.js";
import { runMrp, type MrpRunInput } from "./netting.js";
import { bucketHorizon } from "./calendar.js";

const TODAY = "2026-07-20";
const H = bucketHorizon(TODAY, 6);
const PUMP = "0192a000-0000-7000-8000-000000000001";
const IMPELLER = "0192a000-0000-7000-8000-000000000002";
const CASTING = "0192a000-0000-7000-8000-000000000003";

function run() {
  const input: MrpRunInput = {
    today: TODAY,
    buckets: H,
    bom: [
      { parentItemId: PUMP, componentItemId: IMPELLER, qtyPer: 1, scrapPct: 2 },
      { parentItemId: IMPELLER, componentItemId: CASTING, qtyPer: 1, scrapPct: 5 },
    ],
    items: [
      {
        itemId: PUMP,
        itemCode: "PUMP-KV50",
        onHand: 8,
        safetyStock: 0,
        lotPolicy: { rule: "L4L" },
        leadTimeWorkingDays: 6,
        sourceType: "make",
        independentDemand: { [H[1]!]: 24, [H[2]!]: 20, [H[3]!]: 25, [H[4]!]: 20, [H[5]!]: 20 },
        demandRefs: [
          { bucket: H[1]!, qty: 24, ref: "SO-1042", kind: "sales_order" },
          { bucket: H[3]!, qty: 25, ref: "SO-1046", kind: "sales_order" },
        ],
      },
      { itemId: IMPELLER, itemCode: "IMPELLER-KV50", onHand: 30, safetyStock: 10, lotPolicy: { rule: "L4L" }, leadTimeWorkingDays: 6, sourceType: "make" },
      { itemId: CASTING, itemCode: "CI-CASTING-IMP", onHand: 40, safetyStock: 15, lotPolicy: { rule: "MOQ", lotSize: 50 }, leadTimeWorkingDays: 12, sourceType: "buy" },
    ],
  };
  return runMrp(input);
}

describe("severity comes from consequence, not category", () => {
  it("a customer order outranks the same lateness on a forecast", () => {
    const so = severityFor({ bucketsLate: 1, pegKind: "sales_order", baseline: "medium" });
    const fc = severityFor({ bucketsLate: 1, pegKind: "forecast", baseline: "medium" });
    assert.equal(so, "critical");
    assert.equal(fc, "medium");
  });

  it("an A-class part outranks a C-class one", () => {
    assert.equal(severityFor({ bucketsLate: 0, abc: "A", pegKind: "none", baseline: "medium" }), "high");
    assert.equal(severityFor({ bucketsLate: 0, abc: "C", pegKind: "none", baseline: "medium" }), "low");
  });

  it("never falls off either end of the scale", () => {
    assert.equal(severityFor({ bucketsLate: 9, abc: "A", pegKind: "sales_order", baseline: "critical" }), "critical");
    assert.equal(severityFor({ bucketsLate: 0, abc: "C", pegKind: "forecast", baseline: "low" }), "low");
  });
});

describe("the exception worklist", () => {
  it("raises past-due against the casting the lead time cannot reach", () => {
    const ex = generateExceptions(run(), { abcByItemId: { [CASTING]: "B" } });
    const pastDue = ex.find((e) => e.type === "past_due");
    assert.ok(pastDue, "the two-week casting lead time must produce a past-due exception");
    assert.equal(pastDue.itemCode, "CI-CASTING-IMP");
    assert.match(pastDue.message, /2026-W29 — that week has passed/);
    assert.match(pastDue.suggestion, /pull in 6 working day/);
  });

  it("every exception names something to DO, not just something that is wrong", () => {
    const ex = generateExceptions(run());
    for (const e of ex) {
      assert.ok(e.suggestion.length > 10, `${e.type} has no actionable suggestion`);
      assert.ok(e.ref.length > 0, `${e.type} has no reference to act on`);
    }
  });

  it("tells the planner what to release this week", () => {
    const ex = generateExceptions(run());
    const release = ex.filter((e) => e.type === "release_now");
    assert.ok(release.length > 0);
    assert.ok(release.some((e) => /work order/.test(e.suggestion)), "make items convert to work orders");
    assert.ok(release.every((e) => e.currentBucket !== undefined));
  });

  it("asks for a pull-in when a purchase order lands after the plan needs it", () => {
    const supply: OpenSupply[] = [
      { ref: "PO-2201", kind: "purchase_order", itemId: CASTING, itemCode: "CI-CASTING-IMP", qty: 30, dueBucket: H[4]! },
    ];
    const ex = generateExceptions(run(), { openSupply: supply });
    const pull = ex.find((e) => e.type === "reschedule_in");
    assert.ok(pull, "a PO due after the shortage must be flagged");
    assert.equal(pull.ref, "PO-2201");
    assert.match(pull.suggestion, /pull-in of \d+ week/);
    assert.ok((pull.bucketsMoved ?? 0) < 0);
  });

  it("asks to push out a purchase order that arrives long before it is needed", () => {
    const supply: OpenSupply[] = [
      { ref: "PO-2188", kind: "purchase_order", itemId: CASTING, itemCode: "CI-CASTING-IMP", qty: 75, dueBucket: H[0]! },
    ];
    const ex = generateExceptions(run(), { openSupply: supply, rescheduleToleranceBuckets: 0 });
    const push = ex.find((e) => e.type === "reschedule_out");
    assert.ok(push);
    assert.match(push.suggestion, /stop paying to hold it/);
  });

  it("flags supply with no demand behind it at all", () => {
    const supply: OpenSupply[] = [
      { ref: "PO-2195", kind: "purchase_order", itemId: "0192a000-0000-7000-8000-00000000ffff", itemCode: "CI-CASTING-CSG", qty: 60, dueBucket: H[2]! },
    ];
    const ex = generateExceptions(run(), { openSupply: supply });
    const excess = ex.find((e) => e.type === "excess");
    assert.ok(excess);
    assert.match(excess.message, /no demand pegged to it/);
  });

  it("never proposes to change a supplier's commitment on its own", () => {
    const supply: OpenSupply[] = [
      { ref: "PO-2201", kind: "purchase_order", itemId: CASTING, itemCode: "CI-CASTING-IMP", qty: 30, dueBucket: H[4]! },
    ];
    const ex = generateExceptions(run(), { openSupply: supply });
    // Every row about open supply is a SUGGESTION carrying both dates — the engine states
    // where it wants the supply and leaves the phone call to a person.
    for (const e of ex.filter((x) => x.ref === "PO-2201")) {
      assert.ok(e.currentBucket && e.suggestedBucket, "both the current and the wanted date must be shown");
      assert.match(e.suggestion, /Ask|Push/);
    }
  });

  it("surfaces item-master data problems as low-severity housekeeping", () => {
    const r = run();
    r.plans[2]!.warnings.push("CI-CASTING-IMP has no purchase lead time — 7-day default used.");
    const ex = generateExceptions(r);
    const dw = ex.find((e) => e.type === "data_warning");
    assert.ok(dw);
    assert.equal(dw.severity, "low");
  });

  it("sorts worst first so the page can be worked top-down", () => {
    const ex = generateExceptions(run(), { abcByItemId: { [CASTING]: "A" } });
    const order = ["critical", "high", "medium", "low"];
    let last = -1;
    for (const e of ex) {
      const at = order.indexOf(e.severity);
      assert.ok(at >= last, `${e.severity} appeared after a lower severity`);
      last = at;
    }
  });

  it("summarises in one sentence a plant manager can act on", () => {
    const s = summarise(generateExceptions(run()));
    assert.ok(s.total > 0);
    assert.match(s.headline, /critical|attention|routine/);
    assert.equal(
      s.bySeverity.critical + s.bySeverity.high + s.bySeverity.medium + s.bySeverity.low,
      s.total,
      "the severity counts must add up to the total",
    );
  });

  it("says the plan is clean when it is", () => {
    const s = summarise([]);
    assert.equal(s.total, 0);
    assert.match(s.headline, /no exceptions/);
  });
});
