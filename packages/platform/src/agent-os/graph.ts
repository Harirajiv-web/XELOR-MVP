import {
  AGENT_KEYS,
  type AgentGraphDefinition,
  type AgentNodeStatus,
  type GraphValidationResult,
} from "./types.js";

const TERMINAL_NODE_STATUSES = new Set<AgentNodeStatus>([
  "succeeded",
  "skipped",
  "cancelled",
]);

/**
 * Validate the immutable structure before a graph can be registered or persisted.
 * Runtime data never alters this structure, which keeps a run reproducible.
 */
export function validateAgentGraph(
  graph: AgentGraphDefinition,
): GraphValidationResult {
  const errors: string[] = [];
  if (!graph.key.trim()) errors.push("graph key is required");
  if (!Number.isInteger(graph.version) || graph.version < 1)
    errors.push("graph version must be >= 1");
  if (!Number.isInteger(graph.maxSteps) || graph.maxSteps < 1)
    errors.push("maxSteps must be >= 1");
  if (!Number.isInteger(graph.timeoutSeconds) || graph.timeoutSeconds < 1) {
    errors.push("timeoutSeconds must be >= 1");
  }
  if (graph.nodes.length === 0)
    errors.push("graph must contain at least one node");
  if (graph.nodes.length > graph.maxSteps)
    errors.push("graph contains more nodes than maxSteps");

  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (!node.id.trim()) errors.push("node id is required");
    if (ids.has(node.id)) errors.push(`duplicate node id '${node.id}'`);
    ids.add(node.id);
    if ("agentKey" in node && !AGENT_KEYS.includes(node.agentKey)) {
      errors.push(
        `node '${node.id}' names unknown agent '${String(node.agentKey)}'`,
      );
    }
    if (
      node.maxAttempts !== undefined &&
      (!Number.isInteger(node.maxAttempts) ||
        node.maxAttempts < 1 ||
        node.maxAttempts > 5)
    ) {
      errors.push(`node '${node.id}' maxAttempts must be between 1 and 5`);
    }
  }

  for (const node of graph.nodes) {
    for (const dep of node.dependsOn) {
      if (!ids.has(dep))
        errors.push(`node '${node.id}' depends on missing node '${dep}'`);
      if (dep === node.id)
        errors.push(`node '${node.id}' cannot depend on itself`);
    }
    if (node.condition && !ids.has(node.condition.nodeId)) {
      errors.push(
        `node '${node.id}' condition references missing node '${node.condition.nodeId}'`,
      );
    }
    if (node.kind === "branch" && !ids.has(node.sourceNodeId)) {
      errors.push(
        `branch '${node.id}' references missing source '${node.sourceNodeId}'`,
      );
    }
  }

  // Kahn's algorithm catches cycles without executing any node.
  const remaining = new Map(
    graph.nodes.map((n) => [n.id, new Set(n.dependsOn)]),
  );
  let removed = 0;
  while (remaining.size > 0) {
    const roots = [...remaining]
      .filter(([, deps]) => deps.size === 0)
      .map(([id]) => id);
    if (roots.length === 0) break;
    for (const root of roots) {
      remaining.delete(root);
      removed++;
      for (const deps of remaining.values()) deps.delete(root);
    }
  }
  if (removed !== graph.nodes.length)
    errors.push("graph contains a dependency cycle");

  return { valid: errors.length === 0, errors };
}

/** Nodes returned together are safe to execute as one parallel wave. */
export function readyAgentNodes(
  graph: AgentGraphDefinition,
  statuses: Readonly<Record<string, AgentNodeStatus>>,
): readonly string[] {
  return graph.nodes
    .filter((node) => (statuses[node.id] ?? "pending") === "pending")
    .filter((node) =>
      node.dependsOn.every((dep) =>
        TERMINAL_NODE_STATUSES.has(statuses[dep] ?? "pending"),
      ),
    )
    .map((node) => node.id);
}

export function valueAtPath(value: unknown, path?: string): unknown {
  if (!path) return value;
  let current: unknown = value;
  for (const segment of path.split(".")) {
    if (
      typeof current !== "object" ||
      current === null ||
      !(segment in current)
    )
      return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function conditionMatches(
  condition: { path?: string; equals: unknown },
  sourceOutput: unknown,
): boolean {
  return Object.is(valueAtPath(sourceOutput, condition.path), condition.equals);
}
