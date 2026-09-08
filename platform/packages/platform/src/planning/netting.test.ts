import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runMrp, pegUpwards, type MrpRunInput } from "./netting.js";
import { bucketHorizon } from "./calendar.js";

/**
 * TC-MRP-01 — the blueprint's hand-verified three-level worked example (PLANNING §20.5).
 *
 * The arithmetic below is copied from the blueprint and NOT recomputed here: that is the
 * whole point of a golden case. It was worked by hand, it agrees with the textbook, and if
 * the engine disagrees with it the engine is wrong.
 *
 * One reconciliation was needed. The blueprint dates its demo "today" at Mon 13 Jul 2026
 * (W29); DECISIONS-V2 §7 — which is binding and wins on conflict — fixes the demo "today"
 * at Mon 20 Jul 2026 (W30). The whole example is therefore shifted forward exactly one
 * week. Every quantity is unchanged; every bucket label is one higher. The past-due beat
 * survives the shift, which is the point of checking it: the casting release lands in W29,
 * the week before today.
 */

const TODAY = "2026-07-20"; // Monday, ISO week 2026-W30 — DECISIONS-V2 §7 demo "today"
const H = bucketHorizon(TODAY, 6); // W30 … W35

const PUMP = "0192a000-0000-7000-8000-000000000001";
const IMPELLER = "0192a000-0000-7000-8000-000000000002";
const CASTING = "0192a000-0000-7000-8000-000000000003";

function baseInput(): MrpRunInput {
  return {
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
        leadTimeWorkingDays: 6, // "1 wk" on a Mon–Sat calendar
        sourceType: "make",
        independentDemand: { [H[1]]: 24, [H[2]]: 20, [H[3]]: 25, [H[4]]: 20, [H[5]]: 20 },
        demandRefs: [
          { bucket: H[1], qty: 24, ref: "SO-1042", kind: "sales_order" },
          { bucket: H[3], qty: 25, ref: "SO-1046", kind: "sales_order" },
        ],
      },
      {
        itemId: IMPELLER,
        itemCode: "IMPELLER-KV50",
        onHand: 30,
        safetyStock: 10,
        lotPolicy: { rule: "L4L" },
        leadTimeWorkingDays: 6,
        sourceType: "make",
      },
      {
        itemId: CASTING,
        itemCode: "CI-CASTING-IMP",
        onHand: 40,
        safetyStock: 15,
        lotPolicy: { rule: "MOQ", lotSize: 50 },
        leadTimeWorkingDays: 12, // "2 wk"
        sourceType: "buy",
      },
    ],
  };
}

const planOf = (r: ReturnType<typeof runMrp>, code: string) => r.plans.find((p) => p.itemCode === code)!;
const qtyByBucket = (r: ReturnType<typeof runMrp>, code: string, field: "grossRequirement" | "plannedReceipt" | "projectedAvailable" | "netRequirement") =>
  planOf(r, code).rows.map((x) => x[field]);

describe("TC-MRP-01 — the hand-verified three-level MRP case", () => {
  it("assigns every item the level it is planned at", () => {
    const r = runMrp(baseInput());
    assert.equal(planOf(r, "PUMP-KV50").lowLevelCode, 0);
    assert.equal(planOf(r, "IMPELLER-KV50").lowLevelCode, 1);
    assert.equal(planOf(r, "CI-CASTING-IMP").lowLevelCode, 2);
    // Netted in that order, which is what makes the levels below correct.
    assert.deepEqual(r.plans.map((p) => p.itemCode), ["PUMP-KV50", "IMPELLER-KV50", "CI-CASTING-IMP"]);
  });

  it("level 0 — PUMP-KV50 nets 8 on hand against 24 and plans lot-for-lot", () => {
    const r = runMrp(baseInput());
    assert.deepEqual(qtyByBucket(r, "PUMP-KV50", "grossRequirement"), [0, 24, 20, 25, 20, 20]);
    assert.deepEqual(qtyByBucket(r, "PUMP-KV50", "plannedReceipt"), [0, 16, 20, 25, 20, 20]);
    assert.deepEqual(qtyByBucket(r, "PUMP-KV50", "projectedAvailable"), [8, 0, 0, 0, 0, 0]);
  });

  it("level 0 — releases are one week before the receipt", () => {
    const r = runMrp(baseInput());
    const rel = planOf(r, "PUMP-KV50").plannedOrders.map((o) => `${o.releaseBucket}:${o.qty}`);
    assert.deepEqual(rel, [`${H[0]}:16`, `${H[1]}:20`, `${H[2]}:25`, `${H[3]}:20`, `${H[4]}:20`]);
  });

  it("level 1 — IMPELLER grosses up the pump releases by 2% scrap and rounds up", () => {
    const r = runMrp(baseInput());
    // 16×1/0.98 = 16.33 → 17;  20 → 21;  25 → 26;  20 → 21;  20 → 21
    assert.deepEqual(qtyByBucket(r, "IMPELLER-KV50", "grossRequirement"), [17, 21, 26, 21, 21, 0]);
  });

  it("level 1 — safety stock is a floor the plan settles on, not a buffer it eats", () => {
    const r = runMrp(baseInput());
    assert.deepEqual(qtyByBucket(r, "IMPELLER-KV50", "netRequirement"), [0, 18, 26, 21, 21, 0]);
    assert.deepEqual(qtyByBucket(r, "IMPELLER-KV50", "plannedReceipt"), [0, 18, 26, 21, 21, 0]);
    // 30 on hand absorbs the first bucket; thereafter it holds exactly the 10 of safety stock.
    assert.deepEqual(qtyByBucket(r, "IMPELLER-KV50", "projectedAvailable"), [13, 10, 10, 10, 10, 10]);
  });

  it("level 2 — the MOQ turns a shortfall of 22 into an order of 50", () => {
    const r = runMrp(baseInput());
    // impeller releases 18/26/21/21 in W30..W33, grossed up by 5% casting scrap
    assert.deepEqual(qtyByBucket(r, "CI-CASTING-IMP", "grossRequirement"), [19, 28, 23, 23, 0, 0]);
    assert.deepEqual(qtyByBucket(r, "CI-CASTING-IMP", "netRequirement"), [0, 22, 0, 18, 0, 0]);
    assert.deepEqual(qtyByBucket(r, "CI-CASTING-IMP", "plannedReceipt"), [0, 50, 0, 50, 0, 0]);
    assert.deepEqual(qtyByBucket(r, "CI-CASTING-IMP", "projectedAvailable"), [21, 43, 20, 47, 47, 47]);

    const first = planOf(r, "CI-CASTING-IMP").plannedOrders[0];
    assert.equal(first.netRequirement, 22);
    assert.equal(first.qty, 50);
    assert.match(first.lotReason, /minimum order quantity 50/);
  });

  it("level 2 — the two-week lead time puts the first release in the PAST, and says so", () => {
    const r = runMrp(baseInput());
    const first = planOf(r, "CI-CASTING-IMP").plannedOrders[0];
    assert.equal(first.pastDue, true);
    // Twelve working days before Mon 27 Jul is Mon 13 Jul — the week before today.
    assert.equal(H[0], "2026-W30"); // the horizon really does open on the §7 demo week
    assert.equal(first.computedReleaseDate, "2026-07-13");
    assert.equal(first.computedReleaseBucket, "2026-W29");
    assert.equal(first.daysLate, 6); // six working days, Mon 13 through Sat 18
    // Clamped to today rather than back-dated: a planned order dated last Tuesday is a lie.
    assert.equal(first.releaseDate, TODAY);

    const second = planOf(r, "CI-CASTING-IMP").plannedOrders[1];
    assert.equal(second.pastDue, false);
    assert.equal(second.releaseDate, "2026-07-27");
  });

  it("pegs the casting order all the way up to the sales order that caused it", () => {
    const r = runMrp(baseInput());
    const casting = planOf(r, "CI-CASTING-IMP").plannedOrders[0]!;
    const { chain, demands } = pegUpwards(casting.key, r.plannedOrders);

    // The casting needed in W31 was demanded by the impeller order RELEASED in W31, which
    // is the one RECEIVED in W32 — and that in turn by the pump order received in W33.
    // Each hop moves one bucket later because each lead time moves the release earlier.
    assert.ok(chain.includes(`IMPELLER-KV50@${H[2]}`), `impeller not in chain: ${chain.join(" → ")}`);
    assert.ok(chain.includes(`PUMP-KV50@${H[3]}`), `pump not in chain: ${chain.join(" → ")}`);

    // NOTE — the blueprint's §20.5 prose names SO-1042 at the top of this chain. Its own
    // tables do not support that: SO-1042 is the 24 pumps wanted in the first demand
    // bucket, and that demand is absorbed by impeller stock without ever creating a
    // casting order. The chain that actually reaches this casting is SO-1046. The tables
    // are hand-verified and were followed; the prose sentence is an error in the source.
    assert.ok(demands.some((d) => d.source === "SO-1046"), `expected SO-1046, got ${demands.map((d) => d.source).join(", ")}`);
  });
});

describe("MRP netting — the rules that stop it lying", () => {
  it("an existing purchase order is treated as fact and reduces the net requirement", () => {
    const input = baseInput();
    input.items[2] = {
      ...input.items[2],
      scheduledReceipts: [{ bucket: H[1], qty: 50, ref: "PO-2201", kind: "purchase_order" }],
    };
    const r = runMrp(input);
    // 28 gross − 50 already coming − 21 available + 15 safety = negative → nothing to order.
    assert.equal(qtyByBucket(r, "CI-CASTING-IMP", "netRequirement")[1], 0);
    assert.equal(qtyByBucket(r, "CI-CASTING-IMP", "plannedReceipt")[1], 0);
    // …and the engine did not redate the PO. It is still in the bucket the buyer put it in,
    // counted where it sits, not where the plan would have preferred it.
    assert.deepEqual(planOf(r, "CI-CASTING-IMP").rows.map((x) => x.scheduledReceipts), [0, 50, 0, 0, 0, 0]);
  });

  it("negative on-hand is floored at zero and reported, never planned around silently", () => {
    const input = baseInput();
    input.items[1] = { ...input.items[1], onHand: -5 };
    const r = runMrp(input);
    const plan = planOf(r, "IMPELLER-KV50");
    assert.equal(plan.openingAvailable, 0);
    assert.match(plan.warnings.join(" "), /cannot be negative/);
  });

  it("allocated stock is not available to the plan", () => {
    const input = baseInput();
    input.items[0] = { ...input.items[0], onHand: 8, allocatedQty: 8 };
    const r = runMrp(input);
    // With all 8 promised elsewhere, the first bucket must plan the full 24.
    assert.equal(qtyByBucket(r, "PUMP-KV50", "plannedReceipt")[1], 24);
  });

  it("a buy item with no lead time is flagged rather than quietly planned as instant", () => {
    const input = baseInput();
    input.items[2] = { ...input.items[2], leadTimeWorkingDays: 0 };
    const r = runMrp(input);
    assert.match(planOf(r, "CI-CASTING-IMP").warnings.join(" "), /no purchase lead time/);
  });

  it("identical input produces an identical plan — a run must be diffable", () => {
    const a = runMrp(baseInput());
    const b = runMrp(baseInput());
    assert.deepEqual(
      a.plannedOrders.map((o) => `${o.key}:${o.qty}:${o.releaseDate}`),
      b.plannedOrders.map((o) => `${o.key}:${o.qty}:${o.releaseDate}`),
    );
  });

  it("demand for an item with no planning policy is reported, not dropped", () => {
    const input = baseInput();
    input.items = input.items.filter((i) => i.itemCode !== "CI-CASTING-IMP");
    const r = runMrp(input);
    assert.match(r.warnings.join(" "), /has no planning policy/);
  });
});
