import assert from "node:assert/strict";
import { test } from "node:test";
import "reflect-metadata";
import { PERMISSION_KEY } from "../../common/permission.guard.js";
import { IntegrationController } from "./integration.controller.js";
import {
  projectFactoryCommandEvidence,
  projectFactoryOperationsView,
  projectFactoryOverview,
} from "./factory-overview-projection.js";

const FULL_OVERVIEW: Readonly<Record<string, unknown>> = {
  generatedAt: "2026-08-08T00:00:00.000Z",
  boundary: "simulator only",
  gateways: [{ code: "EDGE-1" }],
  assets: [{ assetCode: "ROBOT-1" }],
  dwell: [{ trackedRef: "PALLET-1" }],
  commands: [{ commandKey: "MC-1" }],
  operations: {
    schemaVersion: "factory-operations.v1",
    demo: { mockOnly: true },
    customer: { code: "3S" },
    source: { projection: "factory_operations" },
    freshness: { generatedAt: "2026-08-08T00:00:00.000Z" },
    summary: { machineCount: 1 },
    machines: [{ assetCode: "AST-PNQ-VMC-01" }],
    atRiskJobs: [],
    replanProposals: [],
    privateEvidence: "must not cross the endpoint",
  },
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
  assert.deepEqual(Object.keys(production), ["generatedAt", "boundary", "gateways", "assets", "operations", "summary", "mission"]);
  assert.equal("commands" in production, false);
  assert.equal("dwell" in production, false);

  const planning = projectFactoryOverview(FULL_OVERVIEW, "planning");
  assert.deepEqual(Object.keys(planning), ["generatedAt", "boundary", "dwell", "summary", "mission"]);
  assert.equal("gateways" in planning, false);
  assert.equal("assets" in planning, false);
  assert.equal("commands" in planning, false);
  assert.equal("operations" in planning, false);
});

test("the Factory Operations endpoint has an explicit, stable allowlist", () => {
  const operations = projectFactoryOperationsView(FULL_OVERVIEW);
  assert.deepEqual(Object.keys(operations), [
    "schemaVersion",
    "demo",
    "customer",
    "source",
    "freshness",
    "summary",
    "machines",
    "atRiskJobs",
    "replanProposals",
  ]);
  assert.equal("privateEvidence" in operations, false);
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
    Reflect.getMetadata(PERMISSION_KEY, prototype.factoryOperationsView),
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
  assert.equal(
    Reflect.getMetadata(PERMISSION_KEY, prototype.simulate3sWorkroom),
    "factory.scenario.execute",
  );
  assert.equal(
    Reflect.getMetadata(PERMISSION_KEY, prototype.ingestFactoryState),
    "factory.telemetry.ingest",
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

test("the 3S Workroom controller keeps one idempotency identity and delegates the exact action", async () => {
  let received: unknown = null;
  const controller = new IntegrationController(
    null as never,
    null as never,
    null as never,
    null as never,
    {
      simulate3sWorkroom: async (input: unknown) => {
        received = input;
        return { status: "accepted" };
      },
    } as never,
  );

  await assert.rejects(
    controller.simulate3sWorkroom("header-key-01", {
      action: "breakdown",
      idempotencyKey: "body-key-001",
    }),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "VALIDATION_FAILED",
  );
  await controller.simulate3sWorkroom("same-key-001", {
    action: "recover",
    idempotencyKey: "same-key-001",
  });
  assert.deepEqual(received, { action: "recover", idempotencyKey: "same-key-001" });
});
