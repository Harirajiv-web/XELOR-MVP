import assert from "node:assert/strict";
import test from "node:test";
import {
  conditionMatches,
  readyAgentNodes,
  validateAgentGraph,
  valueAtPath,
} from "./graph.js";
import type { AgentGraphDefinition } from "./types.js";

const graph: AgentGraphDefinition = {
  key: "test.graph",
  version: 1,
  name: "Test graph",
  description: "Exercises parallel readiness and approval dependencies.",
  maxSteps: 6,
  timeoutSeconds: 60,
  nodes: [
    {
      id: "intake",
      name: "Intake",
      kind: "agent",
      agentKey: "ONYX",
      instruction: "Accept.",
      dependsOn: [],
    },
    {
      id: "sales",
      name: "Sales",
      kind: "agent",
      agentKey: "MICA",
      instruction: "Read.",
      dependsOn: ["intake"],
    },
    {
      id: "stock",
      name: "Stock",
      kind: "agent",
      agentKey: "SPAR",
      instruction: "Read.",
      dependsOn: ["intake"],
    },
    {
      id: "approve",
      name: "Approve",
      kind: "approval",
      title: "Approve",
      risk: "low",
      proposedAction: "Continue",
      dependsOn: ["sales", "stock"],
    },
  ],
};

test("validates a bounded acyclic graph", () => {
  assert.deepEqual(validateAgentGraph(graph), { valid: true, errors: [] });
});

test("rejects dependency cycles", () => {
  const cyclic: AgentGraphDefinition = {
    ...graph,
    nodes: [
      {
        id: "a",
        name: "A",
        kind: "transform",
        operation: "merge",
        dependsOn: ["b"],
      },
      {
        id: "b",
        name: "B",
        kind: "transform",
        operation: "merge",
        dependsOn: ["a"],
      },
    ],
  };
  assert.equal(validateAgentGraph(cyclic).valid, false);
  assert.match(validateAgentGraph(cyclic).errors.join(" "), /cycle/);
});

test("rejects unbounded retry counts", () => {
  const invalid: AgentGraphDefinition = {
    ...graph,
    nodes: graph.nodes.map((node, index) =>
      index === 0 ? { ...node, maxAttempts: 99 } : node,
    ),
  };
  assert.equal(validateAgentGraph(invalid).valid, false);
  assert.match(validateAgentGraph(invalid).errors.join(" "), /maxAttempts/);
});

test("returns independent nodes in the same execution wave", () => {
  assert.deepEqual(readyAgentNodes(graph, { intake: "succeeded" }), [
    "sales",
    "stock",
  ]);
});

test("reads and compares structured condition values", () => {
  const output = { decision: { approved: true } };
  assert.equal(valueAtPath(output, "decision.approved"), true);
  assert.equal(
    conditionMatches({ path: "decision.approved", equals: true }, output),
    true,
  );
});
