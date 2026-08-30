import assert from "node:assert/strict";
import test from "node:test";
import type { ModuleManifest } from "./manifest.js";
import {
  manifestPermissions,
  moduleAvailability,
  visibleNav,
} from "./manifest.js";

const manifest: ModuleManifest = {
  key: "test-module",
  name: "Test module",
  summary: "Exercises grouped navigation permissions.",
  department: "ONYX",
  icon: "Gauge",
  licenceKey: "test-module",
  order: 1,
  nav: [
    {
      label: "Factory intelligence",
      path: "factory-intelligence",
      permission: ["agentos.run.read", "production.factory-connect.read"],
      description: "A grouped-permission route used only by this unit test.",
    },
  ],
  screens: {},
};

test("grouped nav permissions require every permission", () => {
  assert.deepEqual(manifestPermissions(manifest), [
    "agentos.run.read",
    "production.factory-connect.read",
  ]);
  assert.equal(
    visibleNav(manifest, (permission) => permission === "agentos.run.read").length,
    0,
  );
  assert.equal(
    visibleNav(manifest, () => true).length,
    1,
  );
  assert.deepEqual(
    moduleAvailability(manifest, {
      isLicensed: () => true,
      can: (permission) => permission === "agentos.run.read",
    }),
    {
      kind: "no_permission",
      moduleName: "Test module",
      needs: ["agentos.run.read", "production.factory-connect.read"],
    },
  );
});
