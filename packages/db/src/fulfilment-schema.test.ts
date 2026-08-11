import assert from "node:assert/strict";
import test from "node:test";
import {
  FULFILMENT_EVENT_DISPOSITIONS,
  fulfilmentEvent,
  type FulfilmentEventDisposition,
} from "./schema/fulfilment.js";

// Compile-time regression: if the column ever widens back to `string`, this expected error
// disappears and TypeScript fails the test build.
// @ts-expect-error migration 0094 does not permit lifecycle labels in disposition
const invalidDisposition: typeof fulfilmentEvent.$inferInsert.disposition = "armed";
void invalidDisposition;

test("fulfilment event disposition exposes exactly migration 0094's impact vocabulary", () => {
  const expected: FulfilmentEventDisposition[] = [
    "no_impact",
    "deterministic",
    "replan",
    "escalate",
  ];
  assert.deepEqual(FULFILMENT_EVENT_DISPOSITIONS, expected);
  assert.deepEqual(fulfilmentEvent.disposition.enumValues, expected);
});
