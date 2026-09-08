import assert from "node:assert/strict";
import { test } from "node:test";
import {
  factoryWorkroomAlternateEvidence,
  factoryWorkroomReplayMatches,
  factoryWorkroomSafetyState,
  factoryWorkroomScenarioIdentity,
} from "./factory-workroom-scenario.js";

test("one Workroom idempotency key deterministically owns two distinct simulator events", () => {
  const first = factoryWorkroomScenarioIdentity("scenario-key-001");
  assert.deepEqual(first, factoryWorkroomScenarioIdentity("scenario-key-001"));
  assert.notEqual(first.sourceEventId, first.alternateSourceEventId);
  assert.notDeepEqual(first, factoryWorkroomScenarioIdentity("scenario-key-002"));
});

test("alternate freshness preserves shift evidence while reasserting every mock-only boundary", () => {
  const evidence = factoryWorkroomAlternateEvidence({
    latestEvidence: {
      mockShift: { code: "A", plannedProductionSeconds: 27_000 },
      calibrationRef: "POC-CAL-1",
      physicalControllerContacted: true,
      autoPublished: true,
    },
    action: "breakdown",
    idempotencyDigest: "a".repeat(64),
    preservedFromStateEventId: "0192a8c0-0092-7000-8000-000000000023",
  });
  assert.deepEqual(evidence.mockShift, { code: "A", plannedProductionSeconds: 27_000 });
  assert.equal(evidence.calibrationRef, "POC-CAL-1");
  assert.equal(evidence.scenarioRole, "explicit_alternate_freshness");
  assert.equal(evidence.physicalControllerContacted, false);
  assert.equal(evidence.autoPublished, false);
});

test("POC recovery always appends an internally safe normal state", () => {
  assert.equal(factoryWorkroomSafetyState("recover", "protective_stop"), "normal");
  assert.equal(factoryWorkroomSafetyState("breakdown", "normal"), "normal");
  assert.equal(factoryWorkroomSafetyState("breakdown", undefined), "normal");
});

test("an exact replay must retain the complete mock-only boundary", () => {
  const expected = {
    action: "breakdown" as const,
    idempotencyDigest: "b".repeat(64),
    scenarioRole: "explicit_alternate_freshness" as const,
  };
  const evidence = {
    source: "3s_workroom_scenario",
    scenario: "3s-workroom-poc",
    scenarioAction: "breakdown",
    scenarioRole: "explicit_alternate_freshness",
    idempotencyDigest: "b".repeat(64),
    mockOnly: true,
    physicalControllerContacted: false,
    autoPublished: false,
  };
  assert.equal(factoryWorkroomReplayMatches(evidence, expected), true);
  assert.equal(
    factoryWorkroomReplayMatches({ ...evidence, physicalControllerContacted: true }, expected),
    false,
  );
  assert.equal(
    factoryWorkroomReplayMatches({ ...evidence, idempotencyDigest: "c".repeat(64) }, expected),
    false,
  );
});
