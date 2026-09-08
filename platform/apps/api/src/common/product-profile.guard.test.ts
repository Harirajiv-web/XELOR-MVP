import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessProductRoute } from "./product-profile.guard.js";

test("ERP package allows transactional records and excludes supplier network and AI control", () => {
  assert.equal(canAccessProductRoute("1", "/api/v1/sales/orders"), true);
  assert.equal(canAccessProductRoute("1", "/api/v1/purchase/rfqs"), true);
  assert.equal(canAccessProductRoute("1", "/api/v1/purchase/network/suppliers"), false);
  assert.equal(canAccessProductRoute("1", "/api/v1/agent-os/runs"), false);
});
test("standalone AI and supplier products expose their own HTTP capabilities", () => {
  assert.equal(canAccessProductRoute("2", "/api/v1/connectivity/connections"), true);
  assert.equal(canAccessProductRoute("2", "/api/v1/hrm/payroll"), false);
  assert.equal(canAccessProductRoute("2", "/api/v1/dataimport/jobs"), false);
  assert.equal(canAccessProductRoute("2", "/api/v1/ai/governance/state"), true);
  assert.equal(canAccessProductRoute("3", "/api/v1/purchase/tenders"), true);
  assert.equal(canAccessProductRoute("3", "/api/v1/supplier/invitation/quote"), true);
  assert.equal(canAccessProductRoute("3", "/api/v1/accounts/journals"), false);
});
test("integrated profile exposes all registered domains and invalid profiles fail closed", () => {
  for (const route of ["sales/orders", "agent-os/runs", "purchase/tenders"]) assert.equal(canAccessProductRoute("4", `/api/v1/${route}`), true);
  assert.equal(canAccessProductRoute("unknown", "/api/v1/sales/orders"), false);
  assert.equal(canAccessProductRoute("2", "/api/v1/me"), true);
});
