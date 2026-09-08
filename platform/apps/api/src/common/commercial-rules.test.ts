import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOpenDeadline,
  awardBlockers,
  landedUnitCost,
} from "./commercial-rules.js";
const request = { qty: "100", needDate: "2026-10-30" };
const quote = {
  technicalGate: "pass",
  gateNote: null,
  moq: "100",
  promisedDate: "2026-10-20",
  validUntil: "2026-10-15",
};
test("landed cost allocates one-off charges over order quantity", () => {
  assert.equal(landedUnitCost(100, 200, 1000, 500, 200), "217.00");
  assert.equal(landedUnitCost(1, 0), "0.00");
  for (const quantity of [0, -1, NaN, Infinity])
    assert.throws(() => landedUnitCost(quantity, 10));
  assert.throws(() => landedUnitCost(10, -1));
});
test("response deadline is inclusive and the following day closes bidding", () => {
  assert.doesNotThrow(() => assertOpenDeadline("2026-10-10", "2026-10-10"));
  assert.throws(() => assertOpenDeadline("2026-10-10", "2026-10-11"));
});
test("fully evidenced on-time quote can be awarded", () =>
  assert.deepEqual(awardBlockers(request, quote, undefined, "2026-10-10"), []));
test("pending, failed and unexplained conditional gates cannot be awarded", () => {
  for (const technicalGate of ["pending", "fail", "conditional"])
    assert.ok(
      awardBlockers(
        request,
        { ...quote, technicalGate },
        undefined,
        "2026-10-10",
      ).length,
    );
  assert.deepEqual(
    awardBlockers(
      request,
      {
        ...quote,
        technicalGate: "conditional",
        gateNote: "Engineering approved deviation D17",
      },
      undefined,
      "2026-10-10",
    ),
    [],
  );
});
test("expired prices, excessive MOQ, missing and late promises remain blocked", () => {
  for (const change of [
    { validUntil: "2026-10-09" },
    { moq: "101" },
    { promisedDate: null },
    { promisedDate: "2026-11-01" },
  ]) {
    assert.ok(
      awardBlockers(request, { ...quote, ...change }, undefined, "2026-10-10")
        .length,
    );
  }
});
test("buyer override cannot hide late supplier promise or invent an earlier date", () => {
  assert.ok(
    awardBlockers(
      request,
      { ...quote, promisedDate: "2026-11-01" },
      "2026-10-20",
      "2026-10-10",
    ).length,
  );
  assert.ok(awardBlockers(request, quote, "2026-10-19", "2026-10-10").length);
  assert.ok(awardBlockers(request, quote, "2026-11-01", "2026-10-10").length);
});
