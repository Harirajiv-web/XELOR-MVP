import assert from "node:assert/strict";
import { test } from "node:test";
import {
  presentAgentRunForPermissions,
  presentAgentRunSummary,
} from "./agent-run-presentation.js";

const graph = {
  key: "factory.flow-recovery",
  version: 1,
  name: "Factory test",
  description: "test",
  maxSteps: 4,
  timeoutSeconds: 60,
  nodes: [
    {
      id: "factory-read",
      name: "Factory read",
      kind: "capability",
      agentKey: "KILN",
      capabilityKey: "production.factory-connect.read",
      input: {},
      dependsOn: [],
    },
    {
      id: "approval",
      name: "Approval",
      kind: "approval",
      title: "Approve",
      risk: "medium",
      proposedAction: "Review simulator intent",
      dependsOn: ["factory-read"],
    },
  ],
};

const state = {
  run: {
    id: "run-1",
    graphKey: graph.key,
    graphVersion: 1,
    goal: "Review Factory recovery",
    input: { factoryCommand: { assetCode: "SECRET-CELL", capability: "robot.pause_after_cycle" } },
    graphSnapshot: graph,
    status: "waiting_approval",
    providerMode: "deterministic",
    maxSteps: 4,
    consumedSteps: 2,
    timeoutAt: new Date(),
    output: { result: "SECRET-CELL" },
    errorCode: null,
    errorMessage: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
  },
  nodes: [
    {
      id: "node-1",
      nodeId: "factory-read",
      nodeName: "Factory read",
      nodeKind: "capability",
      agentKey: "KILN",
      capabilityKey: "production.factory-connect.read",
      status: "succeeded",
      attempt: 1,
      output: { data: { assets: [{ assetCode: "SECRET-CELL" }] } },
      errorCode: null,
      errorMessage: null,
      startedAt: new Date(),
      completedAt: new Date(),
      createdAt: new Date(),
    },
    {
      id: "node-2",
      nodeId: "approval",
      nodeName: "Approval",
      nodeKind: "approval",
      agentKey: null,
      capabilityKey: null,
      status: "waiting_approval",
      attempt: 1,
      output: null,
      errorCode: null,
      errorMessage: null,
      startedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
    },
  ],
  approvals: [
    {
      id: "approval-1",
      runId: "run-1",
      nodeId: "approval",
      title: "Approve",
      risk: "medium",
      proposedAction: "Review simulator intent",
      proposed: { factoryCommand: { assetCode: "SECRET-CELL" } },
      status: "pending",
      decisionNote: null,
      decidedBy: null,
      decidedAt: null,
      createdAt: new Date(),
    },
  ],
  events: [],
  checkpoints: [],
} as never;

const permissions = new Map([
  ["production.factory-connect.read", "production.factory-connect.read"],
]);

test("agentos.run.read alone cannot read persisted Factory evidence or exact intent", () => {
  const view = presentAgentRunForPermissions(state, permissions, new Set(["agentos.run.read"]));
  assert.deepEqual(view.run.input, {
    redacted: true,
    reason: "current_actor_lacks_source_permission",
  });
  assert.deepEqual(view.nodes[0]?.output, {
    redacted: true,
    reason: "current_actor_lacks_source_permission",
  });
  assert.deepEqual(view.approvals[0]?.proposed, {
    redacted: true,
    reason: "current_actor_lacks_source_permission",
  });
});

test("Production read reveals its node evidence but not an exact executable intent", () => {
  const view = presentAgentRunForPermissions(
    state,
    permissions,
    new Set(["agentos.run.read", "production.factory-connect.read"]),
  );
  assert.deepEqual(view.run.input, {
    redacted: true,
    reason: "current_actor_lacks_source_permission",
  });
  assert.deepEqual(view.nodes[0]?.output, state.nodes[0].output);
  assert.equal((view.approvals[0]?.proposed as { redacted?: unknown }).redacted, true);
});

test("Factory command authority reveals the exact approval intent", () => {
  const view = presentAgentRunForPermissions(
    state,
    permissions,
    new Set([
      "agentos.run.read",
      "production.factory-connect.read",
      "factory.command.execute",
    ]),
  );
  assert.equal((view.run.input as { factoryCommand?: unknown }).factoryCommand != null, true);
  assert.deepEqual(view.approvals[0]?.proposed, state.approvals[0].proposed);
});

test("run lists expose only explicit workflow summary fields", () => {
  const summary = presentAgentRunSummary({
    ...state.run,
    idempotencyKey: "secret-replay-key",
    requestFingerprint: "secret-hash",
  } as never);
  assert.deepEqual(Object.keys(summary), [
    "id",
    "graphKey",
    "graphVersion",
    "goal",
    "status",
    "providerMode",
    "consumedSteps",
    "maxSteps",
    "createdAt",
    "completedAt",
  ]);
  assert.equal("input" in summary, false);
  assert.equal("output" in summary, false);
  assert.equal("graphSnapshot" in summary, false);
  assert.equal("idempotencyKey" in summary, false);
});
