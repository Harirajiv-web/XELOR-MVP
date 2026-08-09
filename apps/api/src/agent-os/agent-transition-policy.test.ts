import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AGENT_NODE_EXECUTION_LEASE_MS,
  AGENT_NODE_HEARTBEAT_INTERVAL_MS,
  CANCEL_RUN_SOURCE_STATUSES,
  HALT_RUN_SOURCE_STATUSES,
  LEGACY_AGENT_NODE_STALE_AFTER_MS,
  MAX_REGISTERED_AGENT_GRAPH_TIMEOUT_MS,
  NODE_EXHAUSTION_SOURCE_STATUS,
  NODE_RESULT_SOURCE_STATUS,
  RUN_COMPLETION_SOURCE_STATUS,
  anotherExecutorIsRunning,
  approvalPausedDeadline,
  canFailRunFrom,
  isNodeClaimConflict,
  shouldDeferRunTimeout,
  shouldRestoreApprovalWait,
} from "./agent-transition-policy.js";
import { AppError } from "@ind-core/platform";

test("multi-replica terminal transitions never overwrite another executor's terminal state", () => {
  assert.equal(NODE_RESULT_SOURCE_STATUS, "running");
  assert.equal(NODE_EXHAUSTION_SOURCE_STATUS, "pending");
  assert.equal(RUN_COMPLETION_SOURCE_STATUS, "running");
  assert.equal(canFailRunFrom("running"), true);
  assert.equal(canFailRunFrom("completed"), false);
  assert.equal(canFailRunFrom("failed"), false);
  assert.equal(canFailRunFrom("cancelled"), false);
  assert.equal(MAX_REGISTERED_AGENT_GRAPH_TIMEOUT_MS, 600_000);
  assert.equal(AGENT_NODE_EXECUTION_LEASE_MS, 90_000);
  assert.equal(AGENT_NODE_HEARTBEAT_INTERVAL_MS, 30_000);
  assert.ok(AGENT_NODE_HEARTBEAT_INTERVAL_MS < AGENT_NODE_EXECUTION_LEASE_MS);
  assert.ok(AGENT_NODE_EXECUTION_LEASE_MS < MAX_REGISTERED_AGENT_GRAPH_TIMEOUT_MS);
  assert.equal(LEGACY_AGENT_NODE_STALE_AFTER_MS, 900_000);
  assert.deepEqual(HALT_RUN_SOURCE_STATUSES, [
    "pending",
    "running",
    "waiting_step",
    "waiting_approval",
  ]);
  assert.deepEqual(CANCEL_RUN_SOURCE_STATUSES, [
    ...HALT_RUN_SOURCE_STATUSES,
    "halted",
  ]);
  assert.equal(
    isNodeClaimConflict(new AppError("AGENT_NODE_NOT_READY", 409, "claimed")),
    true,
  );
  assert.equal(isNodeClaimConflict(new Error("other")), false);
  assert.equal(anotherExecutorIsRunning({ a: "succeeded", b: "running" }), true);
  assert.equal(anotherExecutorIsRunning({ a: "succeeded", b: "pending" }), false);
  assert.equal(shouldDeferRunTimeout({ a: "running" }), true);
  assert.equal(shouldDeferRunTimeout({ a: "succeeded", b: "pending" }), false);
  assert.equal(shouldRestoreApprovalWait("halted", { approval: "waiting_approval" }), true);
  assert.equal(shouldRestoreApprovalWait("waiting_approval", { approval: "waiting_approval" }), false);
  assert.equal(
    approvalPausedDeadline(
      new Date("2026-08-08T12:05:00Z"),
      new Date("2026-08-08T12:02:00Z"),
      new Date("2026-08-08T13:02:00Z"),
    ).toISOString(),
    "2026-08-08T13:05:00.000Z",
  );
});
