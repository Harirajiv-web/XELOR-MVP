import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalFactoryStateReplay } from "./factory-telemetry-integrity.js";

const event = {
  sourceEventId: "EDGE-42",
  observedAt: "2026-08-08T12:00:00.000Z",
  state: "running",
  safetyState: "normal",
  cycleTimeSeconds: 12.5,
  goodCount: 4,
  energyKwh: 2,
  evidence: { source: "simulator", sequence: 42 },
};

test("telemetry idempotency accepts only an identical canonical payload", () => {
  const stored = canonicalFactoryStateReplay({
    ...event,
    observedAt: new Date(event.observedAt),
    cycleTimeSeconds: "12.500",
    energyKwh: "2.0000",
    evidence: { sequence: 42, source: "simulator" },
  });
  assert.equal(canonicalFactoryStateReplay(event), stored);
  assert.notEqual(canonicalFactoryStateReplay({ ...event, state: "faulted" }), stored);
  assert.notEqual(
    canonicalFactoryStateReplay({ ...event, observedAt: "2026-08-08T12:00:01.000Z" }),
    stored,
  );
});
