import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalMachineCommandIntent,
  factoryCommandExecutionBoundary,
  machineCommandVerdict,
  normalizeMachineCommandIntent,
  normalizeMachineCommandParameters,
} from "./contracts.js";

const now = "2026-08-08T12:00:00.000Z";
const base = {
  capability: "robot.pause_after_cycle",
  policy: {
    allowlistedCapabilities: ["robot.pause_after_cycle"],
    requiresApproval: true,
    forbidden: ["safety.override"],
  },
  approvalRef: "approval-42",
  expiresAt: "2026-08-08T12:10:00.000Z",
  now,
  requiredState: "running",
  observedState: "running",
  observedAt: "2026-08-08T11:59:15.000Z",
  safetyState: "normal",
};

describe("machine command contracts", () => {
  it("allows only a named, approved, fresh, safe current-state command", () => {
    assert.equal(machineCommandVerdict(base).allowed, true);
  });

  it("rejects arbitrary motion even when an asset policy contains it", () => {
    assert.equal(
      machineCommandVerdict({
        ...base,
        capability: "motion.jog",
        policy: { ...base.policy, allowlistedCapabilities: ["motion.jog"] },
      }).allowed,
      false,
    );
  });

  it("rejects stale evidence, unsafe state, wrong state, expiry and excessive TTL", () => {
    assert.equal(machineCommandVerdict({ ...base, observedAt: "2026-08-08T11:50:00Z" }).allowed, false);
    assert.equal(machineCommandVerdict({ ...base, safetyState: "interlock_open" }).allowed, false);
    assert.equal(machineCommandVerdict({ ...base, observedState: "blocked" }).allowed, false);
    assert.equal(machineCommandVerdict({ ...base, expiresAt: now }).allowed, false);
    assert.equal(machineCommandVerdict({ ...base, expiresAt: "2026-08-08T12:16:00Z" }).allowed, false);
  });

  it("enforces exact per-capability parameter objects", () => {
    assert.deepEqual(
      normalizeMachineCommandParameters("robot.job.enqueue", {
        productionOrderRef: " PO-42 ",
        jobId: " JOB-7 ",
      }),
      {
        valid: true,
        value: { jobId: "JOB-7", productionOrderRef: "PO-42" },
      },
    );
    assert.equal(
      normalizeMachineCommandParameters("robot.job.enqueue", {
        jobId: "JOB-7",
        velocity: 99,
      }).valid,
      false,
    );
    assert.equal(
      normalizeMachineCommandParameters("maintenance.inspection.request", {
        inspectionType: "anything",
      }).valid,
      false,
    );
  });

  it("normalises an exact intent into stable canonical approval evidence", () => {
    const first = normalizeMachineCommandIntent(
      {
        assetCode: " ROBOT-CELL-03 ",
        capability: "robot.job.enqueue",
        parameters: { productionOrderRef: "PO-42", jobId: "JOB-7" },
        requiredState: "idle",
        expiresAt: "2026-08-08T12:10:00Z",
      },
      { now },
    );
    const second = normalizeMachineCommandIntent(
      {
        expiresAt: "2026-08-08T12:10:00.000Z",
        requiredState: "idle",
        parameters: { jobId: "JOB-7", productionOrderRef: "PO-42" },
        capability: "robot.job.enqueue",
        assetCode: "ROBOT-CELL-03",
      },
      { now },
    );
    assert.equal(first.valid, true);
    assert.equal(second.valid, true);
    if (!first.valid || !second.valid) return;
    assert.equal(canonicalMachineCommandIntent(first.value), canonicalMachineCommandIntent(second.value));
  });

  it("rejects unknown intent fields and capability/state combinations", () => {
    assert.equal(
      normalizeMachineCommandIntent(
        {
          assetCode: "AMR-07",
          capability: "amr.route.dispatch",
          parameters: { routeId: "ROUTE-1" },
          requiredState: "running",
          expiresAt: "2026-08-08T12:10:00Z",
          rawVelocity: 4,
        },
        { now },
      ).valid,
      false,
    );
    assert.equal(
      normalizeMachineCommandIntent(
        {
          assetCode: "AMR-07",
          capability: "amr.route.dispatch",
          parameters: { routeId: "ROUTE-1" },
          requiredState: "idle",
          expiresAt: "2026-08-08",
        },
        { now },
      ).valid,
      false,
    );
  });

  it("allows one-person simulation but refuses every physical edge path", () => {
    assert.deepEqual(factoryCommandExecutionBoundary("simulator", false), {
      allowed: true,
      simulated: true,
    });
    assert.equal(factoryCommandExecutionBoundary("edge", false).allowed, false);
    assert.equal(factoryCommandExecutionBoundary("edge", true).allowed, false);
    assert.equal(
      factoryCommandExecutionBoundary("edge", false).allowed
        ? ""
        : factoryCommandExecutionBoundary("edge", false).code,
      "FACTORY_APPROVAL_SELF_EXECUTION",
    );
    assert.equal(
      factoryCommandExecutionBoundary("edge", true).allowed
        ? ""
        : factoryCommandExecutionBoundary("edge", true).code,
      "FACTORY_EDGE_TRANSPORT_UNAVAILABLE",
    );
  });
});
