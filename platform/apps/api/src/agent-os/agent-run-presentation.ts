import type { AgentGraphDefinition } from "@ind-core/platform";
import type { AgentRunState } from "./agent-run.repository.js";

const REDACTION_REASON = "current_actor_lacks_source_permission";

function redactedEvidence(): Record<string, unknown> {
  return { redacted: true, reason: REDACTION_REASON };
}

function requiredPermissionsByNode(
  graph: AgentGraphDefinition,
  permissionByCapability: ReadonlyMap<string, string>,
): Map<string, ReadonlySet<string>> {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const memo = new Map<string, ReadonlySet<string>>();
  const visit = (nodeId: string, visiting = new Set<string>()): ReadonlySet<string> => {
    const cached = memo.get(nodeId);
    if (cached) return cached;
    if (visiting.has(nodeId)) return new Set(["__invalid_graph_cycle__"]);
    const node = nodes.get(nodeId);
    if (!node) return new Set(["__unknown_graph_node__"]);
    const nextVisiting = new Set(visiting).add(nodeId);
    const required = new Set<string>();
    if (node.kind === "capability") {
      required.add(permissionByCapability.get(node.capabilityKey) ?? "__unknown_capability__");
    }
    for (const dependency of node.dependsOn) {
      for (const permission of visit(dependency, nextVisiting)) required.add(permission);
    }
    memo.set(nodeId, required);
    return required;
  };
  for (const node of graph.nodes) visit(node.id);
  return memo;
}

function permitted(required: ReadonlySet<string>, held: ReadonlySet<string>): boolean {
  return [...required].every((permission) => held.has(permission));
}

/**
 * Persisted Agent OS evidence retains its original provenance, but every read is projected
 * through the current caller's domain permissions. `agentos.run.read` grants workflow
 * visibility; it does not grant sales, finance, Factory or other source evidence.
 */
export function presentAgentRunForPermissions(
  state: AgentRunState,
  permissionByCapability: ReadonlyMap<string, string>,
  heldPermissions: ReadonlySet<string>,
) {
  const graph = state.run.graphSnapshot as unknown as AgentGraphDefinition;
  const requiredByNode = requiredPermissionsByNode(graph, permissionByCapability);
  const allRequired = new Set([...requiredByNode.values()].flatMap((permissions) => [...permissions]));
  const mayReadFactoryIntent = graph.key !== "factory.flow-recovery" ||
    heldPermissions.has("factory.command.execute") ||
    heldPermissions.has("factory.connect.read");
  const mayReadRunEvidence = permitted(allRequired, heldPermissions) && mayReadFactoryIntent;
  const nodeMayBeRead = (nodeId: string): boolean =>
    permitted(requiredByNode.get(nodeId) ?? new Set(["__unknown_graph_node__"]), heldPermissions);

  return {
    run: {
      id: state.run.id,
      graphKey: state.run.graphKey,
      graphVersion: state.run.graphVersion,
      goal: state.run.goal,
      input: mayReadRunEvidence ? state.run.input : redactedEvidence(),
      status: state.run.status,
      providerMode: state.run.providerMode,
      maxSteps: state.run.maxSteps,
      consumedSteps: state.run.consumedSteps,
      timeoutAt: state.run.timeoutAt,
      output: mayReadRunEvidence || state.run.output == null
        ? state.run.output
        : redactedEvidence(),
      errorCode: mayReadRunEvidence ? state.run.errorCode : null,
      errorMessage: mayReadRunEvidence ? state.run.errorMessage : null,
      startedAt: state.run.startedAt,
      completedAt: state.run.completedAt,
      createdAt: state.run.createdAt,
    },
    nodes: state.nodes.map((node) => ({
      id: node.id,
      nodeId: node.nodeId,
      nodeName: node.nodeName,
      nodeKind: node.nodeKind,
      agentKey: node.agentKey,
      capabilityKey: node.capabilityKey,
      status: node.status,
      attempt: node.attempt,
      output: nodeMayBeRead(node.nodeId) || node.output == null
        ? node.output
        : redactedEvidence(),
      errorCode: nodeMayBeRead(node.nodeId) ? node.errorCode : null,
      errorMessage: nodeMayBeRead(node.nodeId) ? node.errorMessage : null,
      startedAt: node.startedAt,
      completedAt: node.completedAt,
      createdAt: node.createdAt,
    })),
    approvals: state.approvals.map((approval) => ({
      id: approval.id,
      runId: approval.runId,
      nodeId: approval.nodeId,
      title: approval.title,
      risk: approval.risk,
      proposedAction: approval.proposedAction,
      proposed: nodeMayBeRead(approval.nodeId) && mayReadFactoryIntent
        ? approval.proposed
        : redactedEvidence(),
      status: approval.status,
      decisionNote: nodeMayBeRead(approval.nodeId) && mayReadFactoryIntent
        ? approval.decisionNote
        : null,
      decidedBy: approval.decidedBy,
      decidedAt: approval.decidedAt,
      createdAt: approval.createdAt,
    })),
    events: state.events.map((event) => ({
      id: event.id,
      sequence: event.sequence,
      eventType: event.eventType,
      nodeId: event.nodeId,
      payload: !event.nodeId || nodeMayBeRead(event.nodeId)
        ? event.payload
        : redactedEvidence(),
      createdAt: event.createdAt,
    })),
    checkpoints: state.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      sequence: checkpoint.sequence,
      reason: checkpoint.reason,
      createdAt: checkpoint.createdAt,
    })),
  };
}

/** `/runs` is workflow metadata only; it never returns frozen inputs, outputs or hashes. */
export function presentAgentRunSummary(run: AgentRunState["run"]) {
  return {
    id: run.id,
    graphKey: run.graphKey,
    graphVersion: run.graphVersion,
    goal: run.goal,
    status: run.status,
    providerMode: run.providerMode,
    consumedSteps: run.consumedSteps,
    maxSteps: run.maxSteps,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
  };
}

export function approvalProposalIsVisible(approval: { proposed: unknown }): boolean {
  return !(
    typeof approval.proposed === "object" &&
    approval.proposed !== null &&
    "redacted" in approval.proposed &&
    (approval.proposed as { redacted?: unknown }).redacted === true
  );
}
