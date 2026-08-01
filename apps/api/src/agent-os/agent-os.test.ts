import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_KEYS, validateAgentGraph } from "@ind-core/platform";
import { AgentRegistryService } from "./agent-registry.service.js";
import { AgentGraphEngine } from "./agent-graph.engine.js";
import type { AgentRunRepository } from "./agent-run.repository.js";
import { CapabilityRegistryService } from "./capability-registry.service.js";
import { DeterministicAgentReasoner } from "./agent-reasoner.service.js";
import { GraphRegistryService } from "./graph-registry.service.js";

test("registers every named departmental agent", () => {
  const registry = new AgentRegistryService();
  assert.deepEqual(
    registry.list().map((agent) => agent.key),
    AGENT_KEYS,
  );
});

test("foundation mission is bounded, parallel and human-gated", () => {
  const graph = new GraphRegistryService().get(
    "foundation.cross-functional-readiness",
  );
  assert.equal(validateAgentGraph(graph).valid, true);
  const orderRead = graph.nodes.find((node) => node.id === "mica-orders");
  const stockRead = graph.nodes.find((node) => node.id === "spar-stock");
  assert.deepEqual(orderRead?.dependsOn, ["onyx-intake"]);
  assert.deepEqual(stockRead?.dependsOn, ["onyx-intake"]);
  assert.equal(
    graph.nodes.some((node) => node.kind === "approval"),
    true,
  );
  assert.equal(
    graph.nodes.some((node) => node.kind === "verification"),
    true,
  );
});

test("finance and quality capabilities stay separate from the approval-bound action boundary", () => {
  const authorization = { require: async () => undefined };
  const general = {
    listCompanies: async () => ({ items: [], nextCursor: null }),
  };
  const inventory = { onHand: async () => [] };
  const sales = { listOrders: async () => ({ items: [], nextCursor: null }) };
  const planning = { list: async () => [] };
  const production = {
    listOrders: async () => ({ items: [], nextCursor: null }),
  };
  const accounts = {
    listVouchers: async () => ({ items: [], nextCursor: null }),
    trialBalance: async () => ({
      asOf: "2026-07-20",
      rows: [],
      totalDebit: 0,
      totalCredit: 0,
      balanced: true,
    }),
  };
  const quality = {
    listInspections: async () => ({ items: [], nextCursor: null }),
  };
  const actions = { dispatch: async () => ({ status: "dispatched" }) };
  const capabilities = new CapabilityRegistryService(
    authorization as never,
    new AgentRegistryService(),
    general as never,
    inventory as never,
    sales as never,
    planning as never,
    production as never,
    accounts as never,
    quality as never,
    actions as never,
  );
  const listed = capabilities.list();
  const keys = new Set(listed.map((capability) => capability.key));
  assert.equal(keys.has("finance.cash-position.read"), true);
  assert.equal(keys.has("finance.forecast.simulate"), true);
  assert.equal(keys.has("finance.funding-pack.draft"), true);
  assert.equal(keys.has("quality.inspections.read"), true);
  assert.equal(keys.has("quality.evidence.collect"), true);
  assert.equal(keys.has("quality.capa-plan.draft"), true);
  assert.equal(keys.has("quality.audit-pack.draft"), true);
  assert.equal(
    listed.filter((capability) => capability.sideEffecting).length,
    1,
  );
  const action = capabilities.get("agent.action.dispatch");
  assert.equal(action.mode, "execute");
  assert.equal(action.sideEffecting, true);
  assert.equal(action.approvalRequired, true);
});

test("Working Capital and QMS missions are bounded, verified and human-gated", () => {
  const registry = new GraphRegistryService();
  for (const key of [
    "finance.working-capital-review",
    "quality.qms-audit-readiness",
  ]) {
    const graph = registry.get(key);
    assert.equal(validateAgentGraph(graph).valid, true);
    assert.equal(
      graph.nodes.some((node) => node.kind === "verification"),
      true,
    );
    assert.equal(
      graph.nodes.some((node) => node.kind === "approval"),
      true,
    );
    assert.equal(
      graph.nodes.some(
        (node) => node.kind === "capability" && node.capabilityKey === "agent.action.dispatch",
      ),
      false,
    );
  }
});

test("Phase 3 connects all agents and places every execute node after one human gate", () => {
  const graph = new GraphRegistryService().get(
    "operations.controlled-action-mission",
  );
  assert.equal(validateAgentGraph(graph).valid, true);
  const participating = new Set(
    graph.nodes.flatMap((node) =>
      "agentKey" in node ? [node.agentKey] : [],
    ),
  );
  assert.deepEqual([...participating].sort(), [...AGENT_KEYS].sort());
  const approval = graph.nodes.find(
    (node) => node.id === "human-action-approval",
  );
  assert.equal(approval?.kind, "approval");
  const dispatches = graph.nodes.filter(
    (node) =>
      node.kind === "capability" &&
      node.capabilityKey === "agent.action.dispatch",
  );
  assert.equal(dispatches.length, 6);
  assert.equal(
    dispatches.every((node) =>
      node.dependsOn.includes("human-action-approval"),
    ),
    true,
  );
});

test("Phase 2 command review connects ONYX to every specialist agent", () => {
  const graph = new GraphRegistryService().get(
    "operations.full-command-review",
  );
  assert.equal(validateAgentGraph(graph).valid, true);
  const participating = new Set(
    graph.nodes.flatMap((node) =>
      "agentKey" in node ? [node.agentKey] : [],
    ),
  );
  assert.deepEqual([...participating].sort(), [...AGENT_KEYS].sort());
  assert.equal(
    graph.nodes.filter((node) => node.kind === "capability").length,
    6,
  );
});

test("offline reasoner reports deterministic mode and evidence rather than hidden reasoning", async () => {
  const agents = new AgentRegistryService();
  const graph = new GraphRegistryService().get(
    "foundation.cross-functional-readiness",
  );
  const node = graph.nodes.find(
    (candidate) => candidate.id === "mica-assessment",
  );
  assert.ok(node);
  const output = await new DeterministicAgentReasoner().complete({
    agent: agents.get("MICA"),
    node,
    goal: "Assess current commitments",
    missionInput: {},
    dependencies: { "mica-orders": { items: [{ id: "one" }, { id: "two" }] } },
  });
  assert.equal(output.providerMode, "deterministic");
  assert.equal(output.evidence[0]?.recordCount, 2);
  assert.equal(output.confidence, 1);
});

test("engine runs parallel evidence waves, pauses, resumes and completes after approval", async () => {
  const graph = new GraphRegistryService().get(
    "foundation.cross-functional-readiness",
  );
  const state = {
    run: {
      id: "0192a8c0-0059-7000-8000-000000000001",
      status: "pending",
      graphSnapshot: graph,
      goal: "Assess cross-functional readiness",
      input: {},
      timeoutAt: new Date(Date.now() + 60_000),
    },
    nodes: graph.nodes.map((node) => ({
      nodeId: node.id,
      status: "pending",
      attempt: 0,
      output: null,
    })),
    approvals: [],
    events: [],
    checkpoints: [],
  };
  const calls: string[] = [];
  const repository = {
    get: async () => state,
    recoverInterruptedNodes: async () => 0,
    markRunRunning: async () => {
      state.run.status = "running";
    },
    statusRecord: () =>
      Object.fromEntries(state.nodes.map((node) => [node.nodeId, node.status])),
    outputRecord: () =>
      Object.fromEntries(state.nodes.map((node) => [node.nodeId, node.output])),
    startNode: async (_runId: string, nodeId: string) => {
      const node = state.nodes.find(
        (candidate) => candidate.nodeId === nodeId,
      )!;
      node.status = "running";
      node.attempt++;
    },
    succeedNode: async (_runId: string, nodeId: string, output: unknown) => {
      const node = state.nodes.find(
        (candidate) => candidate.nodeId === nodeId,
      )!;
      node.status = "succeeded";
      node.output = output;
    },
    skipNode: async (_runId: string, nodeId: string) => {
      state.nodes.find((candidate) => candidate.nodeId === nodeId)!.status =
        "skipped";
    },
    waitForApproval: async (_runId: string, nodeId: string) => {
      state.nodes.find((candidate) => candidate.nodeId === nodeId)!.status =
        "waiting_approval";
      state.run.status = "waiting_approval";
    },
    checkpoint: async () => undefined,
    retryNode: async () => undefined,
    failNode: async (_runId: string, nodeId: string) => {
      state.nodes.find((candidate) => candidate.nodeId === nodeId)!.status =
        "failed";
    },
    failRun: async () => {
      state.run.status = "failed";
    },
    completeRun: async () => {
      state.run.status = "completed";
    },
  };
  const capabilityDescriptors = {
    "sales.orders.read": {
      executionBoundary: "domain_service",
      sideEffecting: false,
    },
    "inventory.on-hand.read": {
      executionBoundary: "domain_service",
      sideEffecting: false,
    },
  } as const;
  const capabilities = {
    invoke: async (_agent: string, key: keyof typeof capabilityDescriptors) => {
      calls.push(key);
      return key === "sales.orders.read"
        ? { items: [{ id: "SO-1" }], nextCursor: null }
        : [{ itemCode: "PX-400", qty: "12.000" }];
    },
    get: (key: keyof typeof capabilityDescriptors) => ({
      ...capabilityDescriptors[key],
      key,
    }),
  };
  const engine = new AgentGraphEngine(
    {
      check: async () => ({ allowed: true }),
      recordUsage: async () => undefined,
    },
    repository as unknown as AgentRunRepository,
    new AgentRegistryService(),
    capabilities as never,
    new DeterministicAgentReasoner(),
  );

  const paused = await engine.execute(state.run.id);
  assert.equal(paused.run.status, "waiting_approval");
  assert.deepEqual(calls.sort(), [
    "inventory.on-hand.read",
    "sales.orders.read",
  ]);
  assert.equal(
    state.nodes.find((node) => node.nodeId === "hexa-verification")?.status,
    "succeeded",
  );

  const approvalNode = state.nodes.find(
    (node) => node.nodeId === "human-approval",
  )!;
  approvalNode.status = "succeeded";
  approvalNode.output = { decision: { approved: true } };
  const completed = await engine.execute(state.run.id);
  assert.equal(completed.run.status, "completed");
  assert.equal(
    state.nodes.find((node) => node.nodeId === "onyx-synthesis")?.status,
    "succeeded",
  );
});
