import assert from "node:assert/strict";
import test from "node:test";
import "reflect-metadata";
import { PERMISSION_KEY } from "../common/permission.guard.js";
import { FactoryIntelligenceController } from "./factory-intelligence.controller.js";

test("Factory Intelligence endpoint requires both Agent OS and factory evidence access", async () => {
  const expected = {
    schemaVersion: "xelor-factory-intelligence.v1",
    boundary: {
      scheduleMutationPerformed: false,
      physicalCommandIssued: false,
    },
  };
  const controller = new FactoryIntelligenceController({
    overview: async () => expected,
  } as never);

  assert.deepEqual(
    Reflect.getMetadata(
      PERMISSION_KEY,
      FactoryIntelligenceController.prototype.overview,
    ),
    ["agentos.run.read", "production.factory-connect.read"],
  );
  assert.deepEqual(await controller.overview(), { data: expected });
});
