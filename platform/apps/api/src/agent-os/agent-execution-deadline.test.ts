import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError, type AgentGraphDefinition } from "@ind-core/platform";
import { AgentGraphEngine } from "./agent-graph.engine.js";
import { AgentRegistryService } from "./agent-registry.service.js";
import type { AgentRunRepository } from "./agent-run.repository.js";
import { DeterministicAgentReasoner } from "./agent-reasoner.service.js";

test("a hung capability cannot renew past or defeat the mission deadline", async () => {
  const graph: AgentGraphDefinition = {
    key: "deadline.hung-capability",
    version: 1,
    name: "Hung capability deadline",
    description: "Proves a claimed node remains bounded.",
    maxSteps: 2,
    timeoutSeconds: 1,
    nodes: [{
      id: "hung-read",
      name: "Hung read",
      kind: "capability",
      agentKey: "MICA",
      capabilityKey: "sales.orders.read",
      input: {},
      dependsOn: [],
    }],
  };
  const state = {
    run: {
      id: "0192a8c0-0059-7000-8000-0000000000d1",
      status: "pending",
      graphSnapshot: graph,
      goal: "Bound the hung read",
      input: {},
      timeoutAt: new Date(Date.now() + 40),
    },
    nodes: [{ nodeId: "hung-read", status: "pending", attempt: 0, output: null }],
    approvals: [],
    events: [],
    checkpoints: [],
  };
  const node = state.nodes[0]!;
  const repository = {
    get: async () => state,
    recoverInterruptedNodes: async () => 0,
    markRunRunning: async () => {
      state.run.status = "running";
    },
    statusRecord: () => ({ "hung-read": node.status }),
    outputRecord: () => ({ "hung-read": node.output }),
    startNode: async () => {
      node.status = "running";
      node.attempt += 1;
      return "0192a8c0-0059-7000-8000-0000000000d2";
    },
    heartbeatNode: async () => true,
    failNode: async () => {
      node.status = "failed";
    },
    retryNode: async () => {
      node.status = "pending";
    },
    checkpoint: async () => undefined,
    failRun: async () => {
      state.run.status = "failed";
    },
  };
  const capabilities = {
    get: () => ({
      executionBoundary: "domain_service",
      sideEffecting: false,
    }),
    invoke: async () => new Promise<never>(() => undefined),
  };
  const engine = new AgentGraphEngine(
    { check: async () => ({ allowed: true }), recordUsage: async () => undefined },
    repository as unknown as AgentRunRepository,
    new AgentRegistryService(),
    capabilities as never,
    new DeterministicAgentReasoner(),
    {
      runtimeGate: async () => ({ allowed: true, reason: null }),
      allowWave: async () => true,
    } as never,
  );

  const started = Date.now();
  const result = await engine.execute(state.run.id);
  assert.equal(result.run.status, "failed");
  assert.equal(node.status, "failed");
  assert.ok(Date.now() - started < 500, "hung capability escaped its deadline");
});

test("an unexpected exhausted step budget terminally fails the run", async () => {
  const graph: AgentGraphDefinition = {
    key: "budget.exhausted",
    version: 1,
    name: "Exhausted budget",
    description: "Proves a rolled-back node claim cannot strand a run.",
    maxSteps: 1,
    timeoutSeconds: 60,
    nodes: [{
      id: "read",
      name: "Read",
      kind: "capability",
      agentKey: "MICA",
      capabilityKey: "sales.orders.read",
      input: {},
      dependsOn: [],
    }],
  };
  const state = {
    run: {
      id: "0192a8c0-0059-7000-8000-0000000000e1",
      status: "pending",
      graphSnapshot: graph,
      goal: "Stop safely",
      input: {},
      timeoutAt: new Date(Date.now() + 60_000),
    },
    nodes: [{ nodeId: "read", status: "pending", attempt: 0, output: null }],
    approvals: [],
    events: [],
    checkpoints: [],
  };
  const node = state.nodes[0]!;
  let exhaustedNodeCalls = 0;
  const repository = {
    get: async () => state,
    recoverInterruptedNodes: async () => 0,
    markRunRunning: async () => {
      state.run.status = "running";
    },
    statusRecord: () => ({ read: node.status }),
    outputRecord: () => ({ read: node.output }),
    startNode: async () => {
      throw new AppError(
        "AGENT_STEP_BUDGET_EXHAUSTED",
        409,
        "The mission step budget is exhausted.",
      );
    },
    exhaustPendingNode: async () => {
      exhaustedNodeCalls += 1;
      node.status = "failed";
    },
    checkpoint: async () => undefined,
    failRun: async () => {
      state.run.status = "failed";
    },
  };
  const engine = new AgentGraphEngine(
    { check: async () => ({ allowed: true }), recordUsage: async () => undefined },
    repository as unknown as AgentRunRepository,
    new AgentRegistryService(),
    {
      get: () => ({ executionBoundary: "domain_service", sideEffecting: false }),
      invoke: async () => ({ items: [] }),
    } as never,
    new DeterministicAgentReasoner(),
    {
      runtimeGate: async () => ({ allowed: true, reason: null }),
      allowWave: async () => true,
    } as never,
  );

  const result = await engine.execute(state.run.id);
  assert.equal(exhaustedNodeCalls, 1);
  assert.equal(node.status, "failed");
  assert.equal(result.run.status, "failed");
});
