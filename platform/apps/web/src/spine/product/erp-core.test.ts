import assert from "node:assert/strict";
import test from "node:test";
import { INSTALLED_MODULES } from "@modules/registry";
import type { ModuleManifest } from "../registry/manifest";
import { erpCoreManifest } from "./erp-core";

function installed(key: string): ModuleManifest {
  const manifest = INSTALLED_MODULES.find((entry) => entry.key === key);
  assert.ok(manifest, `${key} must exist in the actual installed registry`);
  return manifest;
}

const coreRoutes: Readonly<Record<string, readonly string[]>> = {
  general: ["companies"],
  quality: ["inspections", "inspection"],
  production: ["orders", "order"],
  planning: ["mrp", "planned-orders", "exceptions", "demand", "policies", "explain"],
};

for (const [key, expected] of Object.entries(coreRoutes)) {
  test(`${key}: actual navigation and routable screens contain only the core workflow`, () => {
    const source = installed(key);
    const projected = erpCoreManifest(source);
    assert.deepEqual(projected.nav.map((entry) => entry.path), expected);
    assert.deepEqual(Object.keys(projected.screens).sort(), [...expected].sort());
    for (const path of expected) {
      const sourceEntry = source.nav.find((entry) => entry.path === path);
      const projectedEntry = projected.nav.find((entry) => entry.path === path);
      assert.ok(sourceEntry, `${key}/${path} must be declared by the source manifest`);
      assert.ok(source.screens[path], `${key}/${path} must have a real screen loader`);
      assert.strictEqual(projectedEntry, sourceEntry, "permissions and hidden-detail state survive");
      assert.strictEqual(projected.screens[path], source.screens[path], "keep the real loader");
    }
  });
}

test("new add-on routes cannot silently enter a constrained ERP module", () => {
  for (const key of Object.keys(coreRoutes)) {
    const source = installed(key);
    const loader = Object.values(source.screens)[0]!;
    const withExtra: ModuleManifest = {
      ...source,
      nav: [...source.nav, {
        label: "Future optional feature",
        path: "future-addon",
        permission: "some.privileged.permission",
        hidden: true,
      }],
      screens: { ...source.screens, "future-addon": loader },
    };
    const projected = erpCoreManifest(withExtra);
    assert.ok(!projected.nav.some((entry) => entry.path === "future-addon"));
    assert.equal(projected.screens["future-addon"], undefined);
    assert.equal(withExtra.screens["future-addon"], loader, "the shared source retains the route");
  }
});

test("projection leaves source manifests intact and retains access and data contracts", () => {
  for (const source of INSTALLED_MODULES) {
    const frozen: ModuleManifest = Object.freeze({
      ...source,
      nav: Object.freeze(source.nav.map((entry) => Object.freeze({ ...entry }))),
      screens: Object.freeze({ ...source.screens }),
    });
    const before = { ...frozen };
    const projected = erpCoreManifest(frozen);
    assert.notStrictEqual(projected, frozen);
    assert.deepEqual(frozen, before);
    for (const field of ["key", "licenceKey", "department", "order", "signals"] as const) {
      assert.strictEqual(projected[field], frozen[field], `${source.key}: preserve ${field}`);
    }
    if (source.key !== "inventory") assert.strictEqual(projected.alerts, source.alerts);
  }
});

test("core inventory suppresses the obsolete batch-issue alert without changing other products", () => {
  const inventory = installed("inventory");
  const originalAlerts = inventory.alerts;
  assert.ok(originalAlerts?.length, "exercise the existing inventory watch");
  assert.deepEqual(erpCoreManifest(inventory).alerts, []);
  assert.strictEqual(inventory.alerts, originalAlerts);
  assert.ok(inventory.alerts?.length);
});

test("ERP labels name business work while unrestricted module screens stay available", () => {
  assert.equal(erpCoreManifest(installed("engineering")).name, "Items & BOMs");
  assert.equal(erpCoreManifest(installed("planning")).name, "Material planning");
  assert.equal(erpCoreManifest(installed("quality")).name, "Inspections");
  assert.equal(erpCoreManifest(installed("purchase")).name, "Purchasing");
  const sales = installed("sales");
  const projected = erpCoreManifest(sales);
  assert.deepEqual(projected.nav, sales.nav);
  assert.deepEqual(projected.screens, sales.screens);
  assert.equal(projected.name, sales.name);
});
