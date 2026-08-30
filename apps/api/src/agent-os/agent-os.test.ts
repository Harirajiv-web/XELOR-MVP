import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_KEYS,
  AppError,
  currentTenant,
  runWithTenant,
  validateAgentGraph,
} from "@ind-core/platform";
import { AgentRegistryService } from "./agent-registry.service.js";
import { AgentGraphEngine } from "./agent-graph.engine.js";
import type { AgentRunRepository } from "./agent-run.repository.js";
import { CapabilityRegistryService } from "./capability-registry.service.js";
import { DeterministicAgentReasoner } from "./agent-reasoner.service.js";
import { GraphRegistryService } from "./graph-registry.service.js";
import {
  AgentOsService,
  agentRunRequestFingerprint,
  agentRunRequestFingerprintCandidates,
} from "./agent-os.service.js";

test("registers every named departmental agent", () => {
  const registry = new AgentRegistryService();
  assert.deepEqual(
    registry.list().map((agent) => agent.key),
    AGENT_KEYS,
  );
});

test("every registered graph funds its declared retry worst case", () => {
  for (const graph of new GraphRegistryService().list()) {
    const maximumDeclaredAttempts = graph.nodes.reduce(
      (total, node) => total + (node.maxAttempts ?? 1),
      0,
    );
    assert.ok(
      graph.maxSteps >= maximumDeclaredAttempts,
      `${graph.key}@${graph.version} has maxSteps=${graph.maxSteps}, expected at least ${maximumDeclaredAttempts}`,
    );
  }
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
  const platformHealth = {
    overview: async () => ({ latest: null, history: [] }),
  };
  const factoryConnect = {
    overview: async () => ({ gateways: [], assets: [], dwell: [], commands: [] }),
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
    platformHealth as never,
    factoryConnect as never,
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
  assert.equal(keys.has("managed-services.service-assurance.read"), true);
  assert.equal(keys.has("platform-health.status.read"), true);
  assert.equal(keys.has("production.factory-connect.read"), true);
  assert.equal(
    listed.filter((capability) => capability.sideEffecting).length,
    1,
  );
  const action = capabilities.get("agent.action.dispatch");
  assert.equal(action.mode, "execute");
  assert.equal(action.sideEffecting, true);
  assert.equal(action.approvalRequired, true);
});

test("Factory flow recovery is evidence-backed, cross-functional and stops at a human gate", () => {
  const graph = new GraphRegistryService().get("factory.flow-recovery");
  assert.equal(validateAgentGraph(graph).valid, true);
  assert.equal(
    graph.nodes.some(
      (node) => node.kind === "capability" && node.capabilityKey === "production.factory-connect.read",
    ),
    true,
  );
  assert.equal(graph.nodes.some((node) => node.kind === "verification"), true);
  assert.equal(graph.nodes.some((node) => node.kind === "approval"), true);
  assert.equal(
    graph.nodes.some(
      (node) => node.kind === "capability" && node.capabilityKey === "agent.action.dispatch",
    ),
    false,
  );
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
        (node) =>
          node.kind === "capability" &&
          node.capabilityKey === "agent.action.dispatch",
      ),
      false,
    );
  }
});

test("Phase 3 connects all agents while ACHILES stays read-only and every execute node follows one human gate", () => {
  const graph = new GraphRegistryService().get(
    "operations.controlled-action-mission",
  );
  assert.equal(validateAgentGraph(graph).valid, true);
  const participating = new Set(
    graph.nodes.flatMap((node) => ("agentKey" in node ? [node.agentKey] : [])),
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
  assert.equal(dispatches.length, 7);
  assert.equal(dispatches.some((node) => node.agentKey === "ACHILES"), false);
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
    graph.nodes.flatMap((node) => ("agentKey" in node ? [node.agentKey] : [])),
  );
  assert.deepEqual([...participating].sort(), [...AGENT_KEYS].sort());
  assert.equal(
    graph.nodes.filter((node) => node.kind === "capability").length,
    8,
  );
});

test("RELAY service assurance is bounded, verified and human-gated", () => {
  const graph = new GraphRegistryService().get(
    "managed-services.assurance-review",
  );
  assert.equal(validateAgentGraph(graph).valid, true);
  assert.equal(
    graph.nodes.some((node) => "agentKey" in node && node.agentKey === "RELAY"),
    true,
  );
  assert.equal(
    graph.nodes.some(
      (node) =>
        node.kind === "capability" &&
        node.capabilityKey === "agent.action.dispatch",
    ),
    false,
  );
  assert.equal(
    graph.nodes.some((node) => node.kind === "verification"),
    true,
  );
  assert.equal(
    graph.nodes.some((node) => node.kind === "approval"),
    true,
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

test("commander retries keep one fingerprint even when observation timestamps move", async () => {
  const fingerprints: string[] = [];
  let observation = 0;
  const graph = new GraphRegistryService().get(
    "operations.controlled-action-mission",
  );
  const repository = {
    create: async (input: { requestFingerprint: string }) => {
      fingerprints.push(input.requestFingerprint);
      return {
        runId: "0192a8c0-0059-7000-8000-000000000099",
        replayed: fingerprints.length > 1,
      };
    },
  };
  const engine = {
    execute: async () => ({
      run: {
        id: "0192a8c0-0059-7000-8000-000000000099",
        graphKey: graph.key,
        graphVersion: graph.version,
        graphSnapshot: graph,
        goal: "Resolve SO-1 safely",
        input: {},
        status: "waiting_approval",
        providerMode: "deterministic",
        maxSteps: graph.maxSteps,
        consumedSteps: 1,
        timeoutAt: new Date(Date.now() + 60_000),
        output: null,
        errorCode: null,
        errorMessage: null,
        startedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
      },
      nodes: [],
      approvals: [],
      events: [],
      checkpoints: [],
    }),
  };
  const decisions = {
    risk: async () => ({
      key: "delivery:so-1",
      kind: "delivery",
      severity: "high",
      title: "SO-1",
      plainSummary: "Customer date needs review.",
      ownerAgent: "MICA",
      status: "needs_decision",
      commitmentDate: "2026-08-04",
      daysToCommitment: 1,
      exposure: { amount: 100, currency: "INR", basis: "Order value." },
      causes: ["Supply is short."],
      recoveryOptions: [],
      evidence: [
        {
          domain: "sales",
          entityType: "sales_order",
          entityId: "so-1",
          reference: "SO-1",
          label: "Order",
          detail: "Open",
          observedAt: new Date(Date.now() + observation++).toISOString(),
        },
      ],
      confidence: {
        score: 70,
        band: "medium",
        meaning: "Evidence confidence.",
        dimensions: {
          evidenceCoverage: 60,
          freshness: 100,
          completeness: 75,
          learningHistory: 50,
        },
        strengths: [],
        gaps: [],
      },
    }),
    persistRiskEvidence: async () => undefined,
  };
  const service = new AgentOsService(
    {} as never,
    { get: () => graph, contentHash: () => "graph-hash" } as never,
    {
      currentActorPermissions: async () => new Set<string>(),
      permissionByCapability: () => new Map<string, string>(),
    } as never,
    { mode: "deterministic" } as never,
    repository as never,
    engine as never,
    {} as never,
    decisions as never,
    {} as never,
    { assertRuntimeActive: async () => undefined } as never,
  );

  await service.startCommanderRisk("delivery:so-1", "stable-retry-key");
  await service.startCommanderRisk("delivery:so-1", "stable-retry-key");
  assert.equal(fingerprints.length, 2);
  assert.equal(fingerprints[0], fingerprints[1]);
});

test("run fingerprints ignore recursively reordered object properties", () => {
  const base = {
    graphKey: "operations.controlled-action-mission",
    graphVersion: 3,
    goal: "Resolve the same governed risk",
  };
  assert.equal(
    agentRunRequestFingerprint({
      ...base,
      input: { outer: { alpha: 1, beta: { first: true, second: false } } },
    }),
    agentRunRequestFingerprint({
      ...base,
      input: { outer: { beta: { second: false, first: true }, alpha: 1 } },
    }),
  );
  const [canonical, legacy] = agentRunRequestFingerprintCandidates({
    ...base,
    input: { outer: { alpha: 1, beta: 2 } },
  });
  assert.match(canonical, /^v2:[a-f0-9]{64}$/);
  assert.match(legacy, /^[a-f0-9]{64}$/);
  assert.notEqual(canonical, legacy, "legacy unversioned rows retain a replay alias");
});

test("a linked mission cannot support a verified outcome until it is completed", async () => {
  let missionStatus = "waiting_approval";
  let recorded = 0;
  const service = new AgentOsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      get: async () => ({ run: { status: missionStatus } }),
    } as never,
    {} as never,
    {} as never,
    {
      recordOutcome: async () => {
        recorded += 1;
        return { verificationStatus: "verified" };
      },
    } as never,
    {} as never,
    {} as never,
  );
  const input = {
    decisionKey: "planning:test",
    missionRunId: "0192a8c0-0059-7000-8000-000000000099",
    metricKey: "work_items_verified",
    label: "Work items verified",
    unit: "work_items",
    observedValue: 1,
    verifiedValue: 0,
    verificationStatus: "verified" as const,
    attributionStatus: "supported" as const,
    verificationMethod: "Completed mission ledger inspection.",
  };

  await assert.rejects(
    service.recordOutcome(input),
    (error: unknown) =>
      error instanceof AppError && error.code === "OUTCOME_MISSION_INCOMPLETE",
  );
  assert.equal(recorded, 0);

  missionStatus = "completed";
  assert.deepEqual(await service.recordOutcome(input), {
    verificationStatus: "verified",
  });
  assert.equal(recorded, 1);
});

test("an approval-only actor decides while approved execution resumes as the run creator", async () => {
  const tenantId = "0192a8c0-0000-7000-8000-000000000001";
  const starterId = "0192a8c0-0000-7000-8000-0000000000a1";
  const approverId = "0192a8c0-0000-7000-8000-0000000000a2";
  const graph = {
    key: "approval.sod-regression",
    version: 1,
    name: "Approval SoD regression",
    description: "Prove approval and execution identities stay distinct.",
    maxSteps: 1,
    timeoutSeconds: 60,
    nodes: [{
      id: "approval",
      name: "Human approval",
      kind: "approval",
      title: "Approve",
      risk: "medium",
      proposedAction: "Resume approved work",
      dependsOn: [],
    }],
  };
  const approval = {
    id: "0192a8c0-0059-7000-8000-0000000000a3",
    runId: "0192a8c0-0059-7000-8000-0000000000a4",
    nodeId: "approval",
    title: "Approve",
    risk: "medium",
    proposedAction: "Resume approved work",
    proposed: { bounded: true },
    status: "pending",
    decisionNote: null,
    decidedBy: null,
    decidedAt: null,
    createdAt: new Date(),
  };
  const state = {
    run: {
      id: approval.runId,
      graphKey: graph.key,
      graphVersion: graph.version,
      graphSnapshot: graph,
      goal: "Resume the separately approved work",
      input: {},
      status: "waiting_approval",
      providerMode: "deterministic",
      maxSteps: 1,
      consumedSteps: 1,
      timeoutAt: new Date(Date.now() + 60_000),
      output: null,
      errorCode: null,
      errorMessage: null,
      startedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
      createdBy: starterId,
    },
    nodes: [{
      id: "0192a8c0-0059-7000-8000-0000000000a5",
      nodeId: "approval",
      nodeName: "Human approval",
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
    }],
    approvals: [approval],
    events: [],
    checkpoints: [],
  };
  let executionActor: string | null = null;
  const projectionActors: string[] = [];
  const repository = {
    pendingApprovals: async () => [approval],
    get: async () => state,
    decideApproval: async () => {
      approval.status = "approved";
      approval.decidedBy = approverId;
      approval.decidedAt = new Date();
      return { runId: approval.runId, nodeId: approval.nodeId, approved: true };
    },
  };
  const service = new AgentOsService(
    {} as never,
    {} as never,
    {
      currentActorPermissions: async () => {
        projectionActors.push(currentTenant().actorId);
        return new Set<string>();
      },
      permissionByCapability: () => new Map<string, string>(),
    } as never,
    { mode: "deterministic" } as never,
    repository as never,
    {
      execute: async () => {
        executionActor = currentTenant().actorId;
        return state;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    { assertRuntimeActive: async () => undefined } as never,
  );

  await runWithTenant(
    { tenantId, actorId: approverId, principal: "staff" },
    () => service.decideApproval(approval.id, "approved", "Approved separately"),
  );

  assert.equal(executionActor, starterId);
  assert.deepEqual(projectionActors, [approverId, approverId]);
  assert.equal(approval.decidedBy, approverId);
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
    restoreApprovalWait: async () => {
      if (state.run.status !== "halted") return false;
      state.run.status = "waiting_approval";
      return true;
    },
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
    {
      runtimeGate: async () => ({ allowed: true, reason: null }),
      allowWave: async () => true,
    } as never,
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

  // A kill switch may halt the run while its approval node remains waiting. Once control
  // is released, execution restores the run lifecycle so the same attributable decision
  // can still be made instead of deadlocking in `halted` forever.
  state.run.status = "halted";
  const restored = await engine.execute(state.run.id);
  assert.equal(restored.run.status, "waiting_approval");

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

/**
 * Build the engine harness used by the two authorization-boundary tests below.
 *
 * `deny` names the capability whose invocation raises the per-operator RBAC refusal that
 * AgentAuthorizationService throws when the running user does not hold the permission.
 */
function missionHarness(deny: string, denySideEffecting = false) {
  const graph = new GraphRegistryService().get(
    "operations.controlled-action-mission",
  );
  const state = {
    run: {
      id: "0192a8c0-0070-7000-8000-000000000001",
      status: "pending",
      graphSnapshot: graph,
      goal: "Resolve the delivery commitment safely",
      input: {},
      timeoutAt: new Date(Date.now() + 60_000),
    },
    nodes: graph.nodes.map((node) => ({
      nodeId: node.id,
      status: "pending",
      attempt: 0,
      output: null as unknown,
    })),
    approvals: [],
    events: [],
    checkpoints: [],
  };
  const find = (nodeId: string) =>
    state.nodes.find((candidate) => candidate.nodeId === nodeId)!;
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
      const node = find(nodeId);
      node.status = "running";
      node.attempt++;
    },
    succeedNode: async (_runId: string, nodeId: string, output: unknown) => {
      const node = find(nodeId);
      node.status = "succeeded";
      node.output = output;
    },
    // Mirrors the real repository: a started node can still be skipped, and the reason is
    // recorded rather than discarded.
    skipNode: async (_runId: string, nodeId: string, reason: string) => {
      const node = find(nodeId);
      node.status = "skipped";
      node.output = { reason };
    },
    waitForApproval: async (_runId: string, nodeId: string) => {
      find(nodeId).status = "waiting_approval";
      state.run.status = "waiting_approval";
    },
    checkpoint: async () => undefined,
    retryNode: async (_runId: string, nodeId: string) => {
      find(nodeId).status = "pending";
    },
    failNode: async (_runId: string, nodeId: string) => {
      find(nodeId).status = "failed";
    },
    failRun: async () => {
      state.run.status = "failed";
    },
    completeRun: async () => {
      state.run.status = "completed";
    },
  };
  const capabilities = {
    invoke: async (_agent: string, key: string) => {
      if (key === deny) {
        throw new AppError(
          "AGENT_TOOL_FORBIDDEN",
          403,
          `The requesting user is not permitted to use capability '${key}'.`,
        );
      }
      return { items: [] };
    },
    get: (key: string) => ({
      key,
      executionBoundary: "domain_service",
      sideEffecting: key === deny ? denySideEffecting : false,
    }),
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
  return { engine, state, find };
}

test("a read-only evidence source the operator may not read is skipped, not fatal, and the mission still reaches its human gate", async () => {
  // The regression this locks down: ACHILES' platform health is ONYX-internal and a plant
  // operations lead deliberately cannot read it, so the ACHILES capability raised a 403 and
  // failed the ENTIRE mission. The decision a named person was waiting to approve was lost
  // to a permission they were never meant to hold.
  const { engine, state, find } = missionHarness("platform-health.status.read");

  const paused = await engine.execute(state.run.id);

  assert.equal(paused.run.status, "waiting_approval");
  // Skipped, with the reason on the record — the mission says it did not see this source
  // rather than implying it did.
  assert.equal(find("achiles-health").status, "skipped");
  assert.deepEqual(find("achiles-health").output, {
    reason: "capability_not_permitted",
  });
  // Nothing to reason over, so no assessment is invented from an empty evidence set.
  assert.equal(find("achiles-assessment").status, "skipped");
  assert.deepEqual(find("achiles-assessment").output, {
    reason: "dependencies_skipped",
  });
  // The seven specialists the operator IS entitled to still ran, and the join proceeded.
  assert.equal(find("relay-assessment").status, "succeeded");
  assert.equal(find("recommendation-join").status, "succeeded");
  assert.equal(find("hexa-preflight").status, "succeeded");
  assert.equal(find("human-action-approval").status, "waiting_approval");
});

test("a refused SIDE-EFFECTING capability still stops the mission", async () => {
  // The other half of the boundary. Skipping is only ever safe for a read. A capability
  // that ACTS and is refused is a control that fired, and the run must stop rather than
  // quietly carry on having dispatched nothing.
  const { engine, state, find } = missionHarness("sales.orders.read", true);

  const halted = await engine.execute(state.run.id);

  assert.equal(halted.run.status, "failed");
  assert.equal(find("mica-orders").status, "failed");
});
