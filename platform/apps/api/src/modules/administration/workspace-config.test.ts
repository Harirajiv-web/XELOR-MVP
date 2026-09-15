import assert from "node:assert/strict";
import test from "node:test";
import "reflect-metadata";
import { AppError } from "@ind-core/platform";
import { PERMISSION_KEY } from "../../common/permission.guard.js";
import { WorkspaceConfigController } from "./workspace-config.controller.js";
import { WorkspaceConfigService } from "./workspace-config.service.js";
import { PlatformOpsService } from "./platform-ops.service.js";
import {
  WORKSPACE_CONFIG_KEY, WORKSPACE_DEPARTMENTS, defaultWorkspaceConfig, parseWorkspaceConfig,
  requireWorkspaceIdempotencyKey, workspaceConfigResponse,
} from "./workspace-config.js";

const validationError = (error: unknown) => error instanceof AppError && error.httpStatus === 422;

test("a workspace without a stored setting returns independent complete defaults", () => {
  const response = workspaceConfigResponse();
  assert.equal(response.updatedAt, null);
  assert.equal(response.config.businessLabel, "");
  assert.deepEqual(response.config.visibleDepartments, [...WORKSPACE_DEPARTMENTS]);
  response.config.terminology.item = "Changed locally";
  response.config.visibleDepartments.pop();
  assert.equal(workspaceConfigResponse().config.terminology.item, "Items");
  assert.equal(workspaceConfigResponse().config.visibleDepartments.length, 6);
});

test("saved labels and ordered shortcuts round-trip without changing the selected industry", () => {
  const config = parseWorkspaceConfig({
    ...defaultWorkspaceConfig(), industryPreset: "machinery", businessLabel: "  Workshop A  ",
    terminology: { customer: " Clients ", supplier: "Vendors", item: "Components", workOrder: "Jobs" },
    visibleDepartments: ["operations", "sales"], quickActionOrder: ["work-orders", "quotes"],
  });
  const result = workspaceConfigResponse({ valueType: "json", value: JSON.stringify(config),
    isSecret: false, updatedAt: new Date("2026-09-11T12:00:00Z") });
  assert.equal(result.config.businessLabel, "Workshop A");
  assert.equal(result.config.terminology.customer, "Clients");
  assert.equal(result.config.industryPreset, "machinery");
  assert.deepEqual(result.config.quickActionOrder, ["work-orders", "quotes"]);
  assert.equal(result.updatedAt, "2026-09-11T12:00:00.000Z");
});

test("unknown properties cannot become permission, licence or accounting configuration", () => {
  for (const extra of [{ permissions: ["*" ] }, { modules: ["onyx"] }, { taxRate: 0 },
    { key: "audit.retention" }, { tenantId: "another-tenant" }]) {
    assert.throws(() => parseWorkspaceConfig({ ...defaultWorkspaceConfig(), ...extra }), validationError);
  }
  assert.throws(() => parseWorkspaceConfig({ ...defaultWorkspaceConfig(),
    terminology: { ...defaultWorkspaceConfig().terminology, permission: "Owner" },
  }), validationError);
});

test("only reviewed industry, department and action identifiers are accepted", () => {
  for (const change of [{ industryPreset: "clinical" }, { visibleDepartments: ["administration"] },
    { visibleDepartments: ["maintenance"] }, { quickActionOrder: ["/admin/access/grant"] },
    { quickActionOrder: ["onyx"] }, { schemaVersion: 2 }]) {
    assert.throws(() => parseWorkspaceConfig({ ...defaultWorkspaceConfig(), ...change }), validationError);
  }
});

test("duplicate and excessive choices are rejected while empty navigation choices remain valid", () => {
  for (const change of [{ visibleDepartments: ["sales", "sales"] }, { quickActionOrder: ["quotes", "quotes"] },
    { quickActionOrder: ["quotes", "sales-orders", "customers", "purchase-orders", "suppliers", "stock", "warehouses", "items", "mrp"] }]) {
    assert.throws(() => parseWorkspaceConfig({ ...defaultWorkspaceConfig(), ...change }), validationError);
  }
  const { quickActionOrder: omitted, ...input } = defaultWorkspaceConfig();
  assert.deepEqual(parseWorkspaceConfig({ ...input, visibleDepartments: [] }).quickActionOrder, []);
  assert.deepEqual(parseWorkspaceConfig({ ...input, visibleDepartments: [] }).visibleDepartments, []);
  assert.deepEqual(omitted, []);
});

test("labels accept plain Unicode text and reject markup, controls and excessive lengths", () => {
  assert.equal(parseWorkspaceConfig({ ...defaultWorkspaceConfig(), businessLabel: " Usine & Atelier " }).businessLabel, "Usine & Atelier");
  for (const businessLabel of ["<script>alert(1)</script>", "one\ntwo", "x".repeat(81)]) {
    assert.throws(() => parseWorkspaceConfig({ ...defaultWorkspaceConfig(), businessLabel }), validationError);
  }
  for (const item of ["   ", "x".repeat(33), "<b>Items</b>"]) {
    assert.throws(() => parseWorkspaceConfig({ ...defaultWorkspaceConfig(),
      terminology: { ...defaultWorkspaceConfig().terminology, item },
    }), validationError);
  }
});

test("malformed or secret stored values are reported instead of silently resetting configuration", () => {
  for (const row of [
    { valueType: "json", value: "{broken", isSecret: false },
    { valueType: "json", value: JSON.stringify({ ...defaultWorkspaceConfig(), permissions: ["*"] }), isSecret: false },
    { valueType: "text", value: JSON.stringify(defaultWorkspaceConfig()), isSecret: false },
    { valueType: "json", value: JSON.stringify(defaultWorkspaceConfig()), isSecret: true },
  ]) assert.throws(() => workspaceConfigResponse({ ...row, updatedAt: new Date() }),
    (error: unknown) => error instanceof AppError && error.code === "WORKSPACE_CONFIG_INVALID");
});

test("mutations require a bounded idempotency key before any tenant transaction", async () => {
  const service = new WorkspaceConfigService({} as never);
  for (const key of [undefined, " ", "x".repeat(201), "one\ntwo"]) {
    assert.throws(() => requireWorkspaceIdempotencyKey(key), validationError);
    await assert.rejects(service.save(defaultWorkspaceConfig(), key), validationError);
  }
  assert.equal(requireWorkspaceIdempotencyKey(" retry-1 "), "retry-1");
  await assert.rejects(service.save({ ...defaultWorkspaceConfig(), permissions: ["*"] }, "valid-key"), validationError);
});

test("workspace read and write endpoints retain separate existing RBAC permissions", () => {
  assert.equal(Reflect.getMetadata("path", WorkspaceConfigController), "general/workspace-config");
  assert.deepEqual(Reflect.getMetadata(PERMISSION_KEY, WorkspaceConfigController.prototype.get), ["general.company.read"]);
  assert.deepEqual(Reflect.getMetadata(PERMISSION_KEY, WorkspaceConfigController.prototype.save), ["admin.settings.write"]);
  assert.equal(Reflect.getMetadata("__httpCode__", WorkspaceConfigController.prototype.save), 200);
});

test("the generic administration writer cannot bypass workspace validation", async () => {
  const service = new PlatformOpsService({} as never);
  // This must fail before currentTenant or the database is touched.
  await assert.rejects(service.setSetting(WORKSPACE_CONFIG_KEY, '{"permissions":["*"]}'), validationError);
});
