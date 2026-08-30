import { createHash } from "node:crypto";

export type FactoryWorkroomScenarioAction = "breakdown" | "recover";

export function factoryWorkroomScenarioIdentity(idempotencyKey: string): {
  idempotencyDigest: string;
  sourceEventId: string;
  alternateSourceEventId: string;
} {
  const idempotencyDigest = createHash("sha256").update(idempotencyKey, "utf8").digest("hex");
  return {
    idempotencyDigest,
    sourceEventId: `workroom-3s-${idempotencyDigest}`,
    alternateSourceEventId: `workroom-3s-alternate-${idempotencyDigest}`,
  };
}

export function factoryWorkroomSafetyState(
  action: FactoryWorkroomScenarioAction,
  latestSafetyState: string | null | undefined,
): string {
  return action === "recover" ? "normal" : (latestSafetyState ?? "normal");
}

export function factoryWorkroomReplayMatches(
  evidence: unknown,
  expected: {
    action: FactoryWorkroomScenarioAction;
    idempotencyDigest: string;
    scenarioRole: "constrained_machine" | "explicit_alternate_freshness";
  },
): boolean {
  if (typeof evidence !== "object" || evidence === null || Array.isArray(evidence)) return false;
  const row = evidence as Record<string, unknown>;
  return row.source === "3s_workroom_scenario" &&
    row.scenario === "3s-workroom-poc" &&
    row.scenarioAction === expected.action &&
    row.scenarioRole === expected.scenarioRole &&
    row.idempotencyDigest === expected.idempotencyDigest &&
    row.mockOnly === true &&
    row.physicalControllerContacted === false &&
    row.autoPublished === false;
}

export function factoryWorkroomAlternateEvidence(input: {
  latestEvidence: Readonly<Record<string, unknown>>;
  action: FactoryWorkroomScenarioAction;
  idempotencyDigest: string;
  preservedFromStateEventId: string | null;
}): Record<string, unknown> {
  return {
    ...input.latestEvidence,
    source: "3s_workroom_scenario",
    mockOnly: true,
    scenario: "3s-workroom-poc",
    scenarioAction: input.action,
    scenarioRole: "explicit_alternate_freshness",
    idempotencyDigest: input.idempotencyDigest,
    preservedFromStateEventId: input.preservedFromStateEventId,
    physicalControllerContacted: false,
    autoPublished: false,
    boundary: "Mock idle-alternate observation only; no physical controller or schedule was contacted.",
  };
}
