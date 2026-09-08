import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS, resolveScenarios, type OrderProbe } from "./scenarios.js";

/**
 * The claim under test:
 *
 *   A SCENARIO IS AVAILABLE ONLY IF IT CAN GENUINELY OCCUR, AND SAYS WHY WHEN IT CANNOT.
 *
 * That is the whole value of the catalogue. Anybody can write nine rows that say "ready".
 * These tests take a tenant whose data does NOT support a scenario and assert that the row
 * comes back false with a reason somebody could act on — because the failure mode this
 * guards against is a demo that claims to work and falls over in front of an audience.
 */

const PROBE = (over: Partial<OrderProbe> = {}): OrderProbe => ({
  salesOrderId: "0192a8c0-0000-7000-8000-00000000a001",
  soNo: "SO-2627-00004",
  customerName: "Bharat Agro Chemicals",
  orderQty: 24,
  itemCode: "PMP-CP50",
  hasReleasedBom: true,
  componentCount: 4,
  shortCount: 0,
  unresolvedVendors: [],
  unsourceable: [],
  hasLiveMission: false,
  ...over,
});

const by = (key: string, probes: OrderProbe[]) => {
  const hit = resolveScenarios(probes).find((s) => s.key === key);
  assert.ok(hit, `no scenario '${key}'`);
  return hit;
};

test("all nine scenarios are answered, in the order they were asked for", () => {
  const answered = resolveScenarios([PROBE()]);
  assert.equal(answered.length, 9);
  assert.deepEqual(answered.map((s) => s.number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // Every row carries a reason whether it is available or not. An empty reason is a shrug.
  for (const s of answered) assert.ok(s.reason.length > 20, `${s.key} has no usable reason`);
});

test("with no confirmed orders at all, every scenario is unavailable and says what is missing", () => {
  const answered = resolveScenarios([]);
  assert.equal(answered.filter((s) => s.available).length, 0);
  for (const s of answered) {
    assert.equal(s.salesOrderId, null);
    assert.ok(s.reason.length > 20);
  }
});

test("a tenant with nothing short cannot demonstrate a shortage, and does not pretend to", () => {
  const probes = [PROBE({ shortCount: 0 })];
  assert.equal(by("stock-covers-it", probes).available, true);
  assert.equal(by("short-of-material", probes).available, false);
  assert.match(by("short-of-material", probes).reason, /No confirmed order is short/);
  assert.equal(by("recommend-purchase", probes).available, false);
});

test("a tenant that is short can demonstrate the buying scenarios, and picks that order", () => {
  const probes = [PROBE({ shortCount: 2 })];
  const short = by("short-of-material", probes);
  assert.equal(short.available, true);
  assert.equal(short.soNo, "SO-2627-00004");
  assert.match(short.reason, /2 short/);
  assert.equal(by("recommend-purchase", probes).available, true);
  assert.equal(by("stock-covers-it", probes).available, false);
});

test("a shortage whose vendor is not in the master is NOT offered as a purchase demo", () => {
  const probes = [PROBE({ shortCount: 1, unresolvedVendors: ["General Supplies Co (V-GEN)"] })];
  // The mission would genuinely stop at procure. Offering it as the purchase scenario would
  // be advertising a failure as a feature.
  assert.equal(by("recommend-purchase", probes).available, false);
  assert.equal(by("failure-then-retry", probes).available, false);
  // It is still a perfectly good shortage demo.
  assert.equal(by("short-of-material", probes).available, true);
});

test("the missing-information scenario is offered only when something is genuinely missing", () => {
  const healthy = by("missing-information", [PROBE()]);
  assert.equal(healthy.available, false);
  assert.match(healthy.reason, /confirm an order for an item Engineering has not/i);

  const noBom = by("missing-information", [PROBE({ hasReleasedBom: false, componentCount: 0 })]);
  assert.equal(noBom.available, true);
  assert.match(noBom.reason, /no active BOM/);

  const noSupplier = by("missing-information", [PROBE({ shortCount: 1, unsourceable: ["CST-PX4-CAS"] })]);
  assert.equal(noSupplier.available, true);
  assert.match(noSupplier.reason, /CST-PX4-CAS/);
});

test("the human-approval scenario works on any planable order, because the tier guarantees it", () => {
  const s = by("human-approval", [PROBE({ shortCount: 0 })]);
  assert.equal(s.available, true);
  assert.equal(s.tier, "A2");
  assert.ok(s.setup.some((line) => /Suggest only/.test(line)));
});

test("an order with no released BOM cannot run the scenarios that need a plan", () => {
  const probes = [PROBE({ hasReleasedBom: false, componentCount: 0 })];
  assert.equal(by("human-approval", probes).available, false);
  assert.equal(by("recommend-work-order", probes).available, false);
  assert.equal(by("full-audit-trail", probes).available, false);
});

test("an order that already has a live mission is only chosen when nothing else qualifies", () => {
  const busy = PROBE({ soNo: "SO-BUSY", shortCount: 2, hasLiveMission: true });
  const free = PROBE({ salesOrderId: "0192a8c0-0000-7000-8000-00000000a002", soNo: "SO-FREE", shortCount: 2 });
  assert.equal(by("short-of-material", [busy, free]).soNo, "SO-FREE");

  const onlyBusy = by("short-of-material", [busy]);
  assert.equal(onlyBusy.soNo, "SO-BUSY");
  assert.ok(onlyBusy.setup.some((line) => /already has a live mission/.test(line)));
});

test("the two scenarios that set something up say so before they are started", () => {
  const probes = [PROBE({ shortCount: 2 })];
  assert.ok(by("failure-then-retry", probes).setup.some((l) => /simulated fault/i.test(l)));
  assert.ok(by("spreadsheet-source", probes).setup.some((l) => /spreadsheet parser/i.test(l)));
  // And every scenario states which order it will open, first.
  for (const s of resolveScenarios(probes).filter((x) => x.available)) {
    assert.match(s.setup[0] ?? "", /^Opens a mission on/);
  }
});

test("every scenario names what to watch for, so a presenter is not improvising", () => {
  for (const s of SCENARIOS) {
    assert.ok(s.watchFor.length >= 3, `${s.key} gives a presenter nothing to point at`);
    assert.ok(s.demonstrates.length > 40);
  }
});
