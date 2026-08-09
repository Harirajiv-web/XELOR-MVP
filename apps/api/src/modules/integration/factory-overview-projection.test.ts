import assert from "node:assert/strict";
import { test } from "node:test";
import "reflect-metadata";
import { PERMISSION_KEY } from "../../common/permission.guard.js";
import { IntegrationController } from "./integration.controller.js";
import {
  projectFactoryCommandEvidence,
  projectFactoryOverview,
} from "./factory-overview-projection.js";

const FULL_OVERVIEW: Readonly<Record<string, unknown>> = {
  generatedAt: "2026-08-08T00:00:00.000Z",
  boundary: "simulator only",
  gateways: [{ code: "EDGE-1" }],
  assets: [{ assetCode: "ROBOT-1" }],
  dwell: [{ trackedRef: "PALLET-1" }],
  commands: [{ commandKey: "MC-1" }],
  summary: { assets: 1 },
  mission: { graphKey: "factory.flow-recovery" },
};

test("department Factory views expose only their allowlisted evidence fields", () => {
  const integration = projectFactoryOverview(FULL_OVERVIEW, "integration");
  assert.deepEqual(Object.keys(integration), ["generatedAt", "boundary", "gateways", "commands", "summary"]);
  assert.equal("assets" in integration, false);
  assert.equal("dwell" in integration, false);
  assert.equal("mission" in integration, false);

  const production = projectFactoryOverview(FULL_OVERVIEW, "production");
  assert.deepEqual(Object.keys(production), ["generatedAt", "boundary", "gateways", "assets", "summary", "mission"]);
  assert.equal("commands" in production, false);
  assert.equal("dwell" in production, false);

  const planning = projectFactoryOverview(FULL_OVERVIEW, "planning");
  assert.deepEqual(Object.keys(planning), ["generatedAt", "boundary", "dwell", "summary", "mission"]);
  assert.equal("gateways" in planning, false);
  assert.equal("assets" in planning, false);
  assert.equal("commands" in planning, false);
});

test("each department Factory route requires its own scoped permission", () => {
  const prototype = IntegrationController.prototype;
  assert.equal(
    Reflect.getMetadata(PERMISSION_KEY, prototype.integrationFactoryView),
    "integration.factory-connect.read",
  );
  assert.equal(
    Reflect.getMetadata(PERMISSION_KEY, prototype.productionFactoryView),
    "production.factory-connect.read",
  );
  assert.equal(
    Reflect.getMetadata(PERMISSION_KEY, prototype.planningFactoryView),
    "planning.factory-flow.read",
  );
  assert.equal(
    Reflect.getMetadata(PERMISSION_KEY, prototype.factoryOverview),
    "factory.connect.read",
  );
  assert.equal(
    Reflect.getMetadata(PERMISSION_KEY, prototype.factoryCommandEvidence),
    "factory.command.execute",
  );
});

test("command reload evidence omits the approval identifier", () => {
  const command = projectFactoryCommandEvidence({
    commandKey: "MC-1",
    capability: "robot.pause_after_cycle",
    status: "completed",
    simulated: true,
    approvalRef: "abcdef12-3456-4789-abcd-ef1234567890",
    createdAt: new Date("2026-08-08T00:00:00.000Z"),
    result: { physicalControllerContacted: false },
    parameters: { reasonCode: "BLOCKED" },
  });
  assert.deepEqual(Object.keys(command ?? {}), [
    "commandKey",
    "capability",
    "status",
    "simulated",
    "createdAt",
    "result",
  ]);
  assert.equal("approvalRef" in (command ?? {}), false);
  assert.equal("parameters" in (command ?? {}), false);
});
