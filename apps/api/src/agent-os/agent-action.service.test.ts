import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actionDispatchDeadlineIsOpen,
  actionDispatchMatchesApproval,
  type DispatchActionInput,
} from "./agent-action.service.js";

const input: DispatchActionInput = {
  runId: "run-1",
  nodeId: "dispatch-1",
  approvalNodeId: "approval-1",
  executionToken: "0192a8c0-0000-7000-8000-000000000011",
  agentKey: "KILN",
  targetDomain: "production",
  actionType: "create_work_item",
  title: "Create a governed recovery work item",
  risk: "medium",
  payload: { work: { priority: 1, reason: "blocked" } },
};

const existing = {
  approvalNodeId: input.approvalNodeId,
  agentKey: input.agentKey,
  targetDomain: input.targetDomain,
  actionType: input.actionType,
  title: input.title,
  risk: input.risk,
  executionMode: "governed_work_item",
  payload: { work: { reason: "blocked", priority: 1 } },
  status: "dispatched",
  approvedBy: "0192a8c0-0000-7000-8000-0000000000aa",
};

test("action replay is exact and attributes the human approver, not the resuming operator", () => {
  assert.equal(
    actionDispatchMatchesApproval(
      existing,
      input,
      "0192a8c0-0000-7000-8000-0000000000aa",
    ),
    true,
  );
  assert.equal(
    actionDispatchMatchesApproval(
      existing,
      input,
      "0192a8c0-0000-7000-8000-0000000000bb",
    ),
    false,
  );
  assert.equal(
    actionDispatchMatchesApproval(
      { ...existing, payload: { work: { priority: 2, reason: "blocked" } } },
      input,
      existing.approvedBy,
    ),
    false,
  );
});

test("delayed action dispatch is refused once the mission deadline has passed", () => {
  const deadline = new Date("2026-08-08T12:00:00Z");
  assert.equal(actionDispatchDeadlineIsOpen(deadline, new Date("2026-08-08T11:59:59Z")), true);
  assert.equal(actionDispatchDeadlineIsOpen(deadline, deadline), false);
  assert.equal(actionDispatchDeadlineIsOpen(deadline, new Date("2026-08-08T12:00:01Z")), false);
});
