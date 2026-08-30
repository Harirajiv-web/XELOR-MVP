import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addWorkingDays,
  applyAutonomy,
  critique,
  generateCandidates,
  workingDaysBetween,
  type PlanningEvidence,
  type ShortageLine,
} from "./planner.js";
import { buildDecisionBrief, narrateChoice, narrateShortages } from "./narrate.js";

/**
 * The claim under test is not "the planner returns a plan". It is:
 *
 *   THE ANSWER IS A FUNCTION OF THE EVIDENCE.
 *
 * That is the only thing separating a real deterministic planner from a demo script, and it
 * is the thing an investor is entitled to be sceptical about. So most of this file changes
 * exactly one fact about the factory and asserts that the plan changes with it — a different
 * supplier when the lead time moves, an escalation when the margin floor is threatened, an
 * infeasible verdict when no option can hit the date, and fewer options when the factory has
 * fewer qualified vendors.
 *
 * A script passes none of these.
 */

const CASTING = (over: Partial<ShortageLine> = {}): ShortageLine => ({
  itemId: "11111111-1111-7111-8111-111111111111",
  itemCode: "SPAR-4410",
  itemName: "Impeller casting, CF8M",
  requiredQty: 122,
  onHandQty: 76,
  incomingQty: 0,
  shortQty: 46,
  suppliers: [
    { vendorId: "v-kirloskar", vendorName: "Kirloskar Castings", unitPrice: 1850, leadTimeDays: 18, reliability: 0.92, capacityUnits: 60, qualified: true },
    { vendorId: "v-deccan", vendorName: "Deccan Alloys", unitPrice: 2340, leadTimeDays: 7, reliability: 0.88, capacityUnits: 50, qualified: true },
  ],
  ...over,
});

const BASE = (over: Partial<PlanningEvidence> = {}): PlanningEvidence => ({
  today: "2026-07-20",
  promisedDate: "2026-08-19",
  orderQty: 120,
  unitSellingPrice: 14500,
  shortages: [CASTING()],
  productionDays: 6,
  inspectionDays: 2,
  capacityHeadroom: 1,
  baseUnitCost: 9800,
  marginFloorPct: 18,
  expediteAutonomyLimit: 50_000,
  ...over,
});

/* ------------------------------------------------------------------ calendar -- */

test("the calendar works a six-day week", () => {
  // Mon 20 Jul 2026 + 6 working days = Mon 27 Jul (Sunday 26th skipped).
  assert.equal(addWorkingDays("2026-07-20", 6), "2026-07-27");
  assert.equal(workingDaysBetween("2026-07-20", "2026-07-27"), 6);
  assert.equal(workingDaysBetween("2026-07-27", "2026-07-20"), -6);
});

/* ------------------------------------------- the answer follows the evidence -- */

test("with a long runway the cheap supplier wins", () => {
  const ranked = generateCandidates(BASE());
  const best = ranked[0]!;
  assert.equal(best.feasible, true);
  assert.equal(best.sourcing[0]?.vendorName, "Kirloskar Castings", "the cheap vendor should win when there is time");
  assert.ok(best.slackDays >= 0, "expected the promise to be met");
});

test("SHORTEN THE RUNWAY AND THE PLAN CHANGES SUPPLIER — same code, different world", () => {
  // One fact moves: the promise comes forward to 10 Aug. Kirloskar's 18-day lead lands the
  // order on 19 Aug and no longer fits; Deccan's 7-day lead lands it on 6 Aug and does. So
  // the planner must reach for the expensive fast vendor — nothing else about the factory,
  // the code or the weights has changed.
  const tight = generateCandidates(BASE({ promisedDate: "2026-08-10" }));
  const best = tight[0]!;

  assert.equal(best.feasible, true, "a feasible option still exists at 7-day lead time");
  assert.equal(best.sourcing[0]?.vendorName, "Deccan Alloys", "the fast vendor should win when time is short");
  assert.ok(best.totalCost > 0);

  // And the cheap option must still be VISIBLE, marked infeasible with the reason — "why
  // not the cheap one" is the first question anybody asks.
  const cheap = tight.find((c) => c.sourcing[0]?.vendorName === "Kirloskar Castings");
  assert.ok(cheap, "the rejected option must still be shown");
  assert.equal(cheap.feasible, false);
  assert.match(cheap.violations.join(" "), /after the promised date/);
});

test("REMOVE THE SHORTAGE AND IT STOPS BUYING ALTOGETHER", () => {
  const stocked = generateCandidates(BASE({ shortages: [CASTING({ onHandQty: 200, shortQty: 0 })] }));
  assert.equal(stocked.length, 1);
  assert.equal(stocked[0]?.key, "stock_only");
  assert.equal(stocked[0]?.sourcing.length, 0);
  assert.match(narrateShortages([CASTING({ shortQty: 0 })]), /covered by stock/);
});

test("REMOVE THE SECOND VENDOR AND THERE IS NO CHOICE TO MAKE", () => {
  const oneVendor = CASTING({
    suppliers: [CASTING().suppliers[0]!],
  });
  const ranked = generateCandidates(BASE({ shortages: [oneVendor] }));
  assert.equal(ranked.length, 1, "one qualified vendor cannot produce an expedite or a split");
  assert.equal(ranked[0]?.key, "primary_supplier");
});

test("DISQUALIFY THE CHEAP VENDOR AND IT IS NOT USED, however good the price", () => {
  const line = CASTING();
  line.suppliers[0]!.qualified = false;
  const ranked = generateCandidates(BASE({ shortages: [line] }));
  for (const c of ranked) {
    for (const s of c.sourcing) {
      assert.notEqual(s.vendorId, "v-kirloskar", "an unqualified vendor was sourced from");
    }
  }
});

test("a vendor short of capacity forces the split rather than a false promise", () => {
  // Neither vendor can cover 90 alone; together they can.
  const line = CASTING({ shortQty: 90, requiredQty: 166 });
  line.suppliers[0]!.capacityUnits = 60;
  line.suppliers[1]!.capacityUnits = 50;
  const ranked = generateCandidates(BASE({ shortages: [line] }));

  const split = ranked.find((c) => c.key === "split_source");
  assert.ok(split, "a split should be offered when no single vendor can cover the shortage");
  assert.equal(split.sourcing.length, 2);
  assert.ok(Math.abs(split.sourcing.reduce((n, s) => n + s.qty, 0) - 90) < 1e-6, "the split must cover the whole shortage");

  // And nothing may ask a vendor for more than it committed.
  for (const s of split.sourcing) {
    const v = line.suppliers.find((x) => x.vendorId === s.vendorId)!;
    assert.ok(s.qty <= v.capacityUnits + 1e-9, `${s.vendorName} was asked for more than it committed`);
  }
});

test("CAPACITY PRESSURE MOVES THE DATE — production is not a constant", () => {
  // Compared strategy-for-strategy, deliberately. Taking `ranked[0]` from each run would
  // compare a Kirloskar plan against a Deccan one and measure the planner's reaction to the
  // squeeze rather than the squeeze itself — which is a real effect, but not this one.
  const pick = (headroom: number) =>
    generateCandidates(BASE({ capacityHeadroom: headroom })).find((c) => c.key === "primary_supplier")!;

  const roomy = pick(1);
  const tight = pick(0.6);
  assert.equal(roomy.completionDate, "2026-08-19");
  assert.equal(tight.completionDate, "2026-08-24", "6 production days at 60% headroom is 10, not 6");
  assert.ok(tight.confidence < roomy.confidence, "and an overloaded work centre must lower confidence");
});

/* ------------------------------------------------------------------ autonomy -- */

test("a premium inside the envelope is taken alone; outside it, a human is asked", () => {
  // Deccan over Kirloskar on 46 castings is 46 x (2340 - 1850) = Rs 22,540 of premium. The
  // envelope is set just under that, so the mission must stop and ask.
  const ev = BASE({ promisedDate: "2026-08-10", expediteAutonomyLimit: 20_000 });
  const ranked = applyAutonomy(generateCandidates(ev), ev);
  const best = ranked[0]!;
  assert.equal(best.expeditePremium, 22_540);
  assert.equal(best.requiresApproval, true, "the expedite premium should exceed the Rs 20,000 envelope");
  assert.match(best.approvalReason ?? "", /premium/);

  // Raise the envelope and the same plan proceeds without asking. The policy is the
  // variable, not the plan — which is exactly the property an autonomy tier should have.
  const generous = { ...ev, expediteAutonomyLimit: 10_000_000 };
  const free = applyAutonomy(generateCandidates(generous), generous)[0]!;
  assert.equal(free.requiresApproval, false);
});

test("SUGGEST-ONLY asks even when the premium is zero — a zero limit could not express this", () => {
  // The bug this pins, found by running the demo rather than by reading the code:
  // "suggest only" was implemented as an envelope of ₹0, and the envelope test is
  // `premium > limit`. The CHEAPEST candidate has a premium of exactly zero by
  // construction — it is the baseline the others are measured against — so `0 > 0` was
  // false and the mission committed a purchase order without asking anybody.
  const ev = BASE({ expediteAutonomyLimit: 0, requireApprovalForAnyCommitment: true });
  const ranked = applyAutonomy(generateCandidates(ev), ev);

  const cheapest = ranked.find((c) => c.expeditePremium === 0);
  assert.ok(cheapest, "there must be a candidate with no premium — that is the baseline");
  assert.equal(cheapest.requiresApproval, true, "suggest-only must ask even at zero premium");
  assert.match(cheapest.approvalReason ?? "", /suggest only/);

  // And every other candidate too: none of them may commit alone at this tier.
  for (const c of ranked.filter((x) => x.sourcing.length > 0)) {
    assert.equal(c.requiresApproval, true, `${c.name} committed without authority`);
  }
});

test("suggest-only asks before reserving stock even when there is nothing to buy", () => {
  // A stock-only plan buys nothing, but it still reserves inventory for this customer and
  // changes what every other order can promise. At suggest-only authority that operational
  // commitment belongs behind the same explicit confirmation as a purchase.
  const ev = BASE({
    shortages: [CASTING({ onHandQty: 200, shortQty: 0 })],
    expediteAutonomyLimit: 0,
    requireApprovalForAnyCommitment: true,
  });
  const ranked = applyAutonomy(generateCandidates(ev), ev);
  assert.equal(ranked[0]?.sourcing.length, 0);
  assert.equal(ranked[0]?.requiresApproval, true);
  assert.match(ranked[0]?.approvalReason ?? "", /reserving stock/i);
});

test("a margin under the floor always asks, whatever the premium", () => {
  const ev = BASE({ unitSellingPrice: 11_600, expediteAutonomyLimit: 10_000_000 });
  const ranked = applyAutonomy(generateCandidates(ev), ev);
  assert.equal(ranked[0]?.requiresApproval, true);
  assert.match(ranked[0]?.approvalReason ?? "", /floor/);
});

test("when nothing is feasible it escalates rather than picking the least bad", () => {
  // Promised before even the fastest supplier could deliver.
  const ev = BASE({ promisedDate: "2026-07-22" });
  const ranked = generateCandidates(ev);
  assert.ok(ranked.every((c) => !c.feasible), "no option should be feasible here");
  assert.match(narrateChoice(ranked, ev), /No feasible strategy exists/);
});

/* ------------------------------------------------------------------ critique -- */

test("the critic recomputes the date instead of believing the plan", () => {
  const ev = BASE();
  const best = generateCandidates(ev)[0]!;
  assert.equal(critique(best, ev).passed, true);

  // Forge the plan's claimed date. The critic must catch it — this is the check that stops
  // a planner grading its own homework.
  const forged = { ...best, completionDate: "2026-07-25" };
  const c = critique(forged, ev);
  assert.equal(c.passed, false);
  assert.match(c.objections.join(" "), /plan claims 2026-07-25/);
});

test("the critic catches a plan that does not cover the shortage", () => {
  const ev = BASE();
  const best = generateCandidates(ev)[0]!;
  const underBought = { ...best, sourcing: [{ ...best.sourcing[0]!, qty: 10 }] };
  const c = critique(underBought, ev);
  assert.equal(c.passed, false);
  assert.match(c.objections.join(" "), /short 46 and the plan only buys 10/);
});

/* ----------------------------------------------------------------- narration -- */

test("every narrated sentence carries a checkable number", () => {
  const ev = BASE();
  const ranked = generateCandidates(ev);
  const text = `${narrateShortages(ev.shortages)} ${narrateChoice(ranked, ev)}`;

  // The anti-scripting rule from narrate.ts, enforced: prose that would read the same for
  // any factory is prose that proves nothing.
  assert.match(text, /SPAR-4410/);
  assert.match(text, /\d/);
  assert.ok(!/carefully|thorough|comprehensive|intelligently/i.test(text), "narration must not praise itself");
});

test("the comparison sentence names the runner-up — proof a choice was made", () => {
  const ev = BASE();
  const line = narrateChoice(generateCandidates(ev), ev);
  assert.match(line, /Against /, "the winning plan must be justified against an alternative");
});

test("the decision brief names the application surfaces the approved plan will update", () => {
  const buyingEvidence = BASE();
  const buyingPlans = generateCandidates(buyingEvidence);
  const buyingBrief = buildDecisionBrief(
    buyingPlans[0]!, buyingPlans, buyingEvidence, "SO-DEMO", "Demo customer",
  );
  // The names are asserted literally because they must equal what the step registry in
  // `mission.service.ts` prints on those screens. A drift here is a card that promises to
  // update a screen the product does not have.
  assert.deepEqual(buyingBrief.applicationTargets, [
    { module: "Sales", screen: "Orders" },
    { module: "Purchase", screen: "Purchase orders" },
    { module: "Production", screen: "Work orders" },
  ]);

  const stockEvidence = BASE({ shortages: [CASTING({ onHandQty: 200, shortQty: 0 })] });
  const stockPlans = generateCandidates(stockEvidence);
  const stockBrief = buildDecisionBrief(
    stockPlans[0]!, stockPlans, stockEvidence, "SO-DEMO", "Demo customer",
  );
  assert.deepEqual(stockBrief.applicationTargets, [{ module: "Sales", screen: "Orders" }]);
});

/* ----------------------------------------------------- determinism, on purpose -- */

test("the same evidence always produces the same plan, byte for byte", () => {
  // Reproducibility is the whole reason this is not a model. An investor demo that answers
  // differently on the second run is a demo nobody can rehearse.
  const a = JSON.stringify(generateCandidates(BASE()));
  const b = JSON.stringify(generateCandidates(BASE()));
  assert.equal(a, b);
});
