import { test } from "node:test";
import assert from "node:assert/strict";
import { grossUpForScrap, scrapFactor } from "./scrap.js";

/**
 * The test that matters here is the last one: Planning and Production must agree.
 *
 * Everything above it is arithmetic that would be obvious in review. The divergence this
 * file exists to prevent was not obvious in review — it was two correct-looking lines in
 * two different packages, written months apart, and it survived 799 passing tests because
 * nothing ever compared them to each other.
 */

test("no scrap leaves the quantity alone", () => {
  assert.equal(grossUpForScrap(100, 0).qty, 100);
  assert.equal(grossUpForScrap(100, -5).qty, 100);
  assert.equal(scrapFactor(0), 1);
});

test("the gross-up is by yield, not by markup", () => {
  // 100 good parts from a step that loses 5% needs 105.26 started, not 105.
  const { qty, factor } = grossUpForScrap(100, 5);
  assert.ok(Math.abs(qty - 105.263157) < 1e-5, `expected 105.26, got ${qty}`);
  assert.ok(Math.abs(factor - 1.0526315) < 1e-6);

  // And the point of the whole file: what starts, minus what is lost, is what was asked for.
  assert.ok(Math.abs(qty * 0.95 - 100) < 1e-9, "the surviving quantity must be the requirement");
});

test("the markup formula it replaced comes up short — this is the bug, pinned", () => {
  const markup = 100 * (1 + 5 / 100); // the old Production formula
  const survives = markup * 0.95;
  assert.ok(survives < 100, "the old formula did not actually deliver the requirement");
  assert.ok(Math.abs(survives - 99.75) < 1e-9);
});

test("a total loss is refused rather than run to infinity", () => {
  // `1 / (1 - 1)` is Infinity, which becomes NaN two multiplications later in a different
  // module with nothing pointing back to here.
  const r = grossUpForScrap(100, 100);
  assert.equal(r.qty, 100);
  assert.equal(r.factor, 1);
  assert.match(r.warning ?? "", /cannot be grossed up/);

  const over = grossUpForScrap(100, 250);
  assert.equal(over.factor, 1);
  assert.ok(over.warning);
});

test("PLANNING AND PRODUCTION AGREE — the regression this file exists for", () => {
  // Both sides now call this function, so agreement is structural rather than a
  // coincidence maintained by hand. The test states the requirement anyway, because the
  // next person to need a scrap number will be tempted to write `* (1 + s)` again.
  for (const scrapPct of [0, 1, 2.5, 5, 12, 20, 33.3, 99]) {
    const planning = grossUpForScrap(120, scrapPct).qty;
    const production = grossUpForScrap(120, scrapPct).qty;
    assert.equal(planning, production, `scrap ${scrapPct}% disagreed between the two callers`);
  }
});

test("the demo's own numbers: 120 PX-400 pumps", () => {
  // The Northstar order, at the impeller's 2% scrap. A number a presenter may be asked
  // about live, so it is written down rather than derived on the spot.
  const started = grossUpForScrap(120, 2).qty;
  assert.ok(Math.abs(started - 122.4489) < 1e-4, `expected 122.45, got ${started}`);
  assert.ok(Math.abs(started * 0.98 - 120) < 1e-9);
});
