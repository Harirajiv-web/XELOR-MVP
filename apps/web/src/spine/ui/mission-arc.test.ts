import { test } from "node:test";
import assert from "node:assert/strict";
import { arcTotal, parseMeta, stepCounter } from "./mission-arc";

/**
 * "STEP 4 OF WHAT?" — pinned, because the wrong answer is a confident one.
 *
 * Four places used to answer with the literal `13`. The arc is thirteen steps today and the
 * number lives in the mission engine; the moment a step is added, or a rejected plan sends a
 * mission back through the authority gate, every one of those literals becomes a lie on the
 * most trust-sensitive screen in the product.
 *
 * The rule these tests hold: the denominator comes from the server or from the mission, it
 * is allowed to be UNKNOWN, and an unknown denominator is stated plainly rather than
 * guessed. A missing fact is survivable. A plausible wrong one is not.
 */

test("the arc length is read from whichever field the service serves", () => {
  assert.equal(parseMeta({ totalSteps: 13 }).totalSteps, 13);
  assert.equal(parseMeta({ arc: [{}, {}, {}] }).totalSteps, 3);
  assert.equal(parseMeta({ totalSteps: 15, arc: [{}, {}] }).totalSteps, 15);
});

test("a service that serves neither leaves the total unknown rather than guessing", () => {
  assert.equal(parseMeta({}).totalSteps, null);
  assert.equal(parseMeta(null).totalSteps, null);
  assert.equal(parseMeta({ chapters: [] }).totalSteps, null);
  assert.equal(parseMeta({ totalSteps: 0 }).totalSteps, null);
  assert.equal(parseMeta({ totalSteps: "thirteen" }).totalSteps, null);
});

test("chapters survive a payload with junk in it", () => {
  const meta = parseMeta({
    chapters: [{ key: "understand", name: "Understand the promise", lands: "…" }, null, "decide"],
  });
  assert.equal(meta.chapters.length, 1);
  assert.equal(meta.chapters[0]?.key, "understand");
});

test("a replanned mission past the served total widens the total, never shortens it", () => {
  // Fifteen steps run against an arc the service calls thirteen. "Step 15 of 13" is the
  // reading this prevents.
  assert.equal(arcTotal(13, [{ seq: 14 }, { seq: 15 }]), 15);
  assert.equal(arcTotal(13, [{ seq: 4 }]), 13);
  assert.equal(arcTotal(null, [{ seq: 4 }]), 4);
  assert.equal(arcTotal(null, []), null);
});

test("an unknown total is said plainly, not filled in", () => {
  assert.equal(stepCounter(4, 13), "Step 4 of 13");
  assert.equal(stepCounter(4, null), "Step 4");
  // A total that cannot be true for this step is not shown at all.
  assert.equal(stepCounter(14, 13), "Step 14");
});
