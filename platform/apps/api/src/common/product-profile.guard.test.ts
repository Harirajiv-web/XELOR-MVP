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
/**
 * THE SIX CONNECTED PACKAGES (profiles 5-10).
 *
 * Each package reaches the ERP data it extends and nothing else. The failure this guards
 * against is not dramatic: a package whose navigation renders and whose every request then
 * answers 403, or — far worse in the other direction — a maintenance package that can quietly
 * read the customer's quotations because both happen to be add-ons. Both are invisible until
 * somebody looks, so each package is pinned here in both directions: one prefix it must
 * reach, one neighbouring prefix it must not.
 */
test("each connected package reaches its own ERP data and no neighbour's", () => {
  // Plant Operations: machines and maintenance, not the sales ledger.
  assert.equal(canAccessProductRoute("5", "/api/v1/maintenance/work-orders"), true);
  assert.equal(canAccessProductRoute("5", "/api/v1/production/orders"), true);
  assert.equal(canAccessProductRoute("5", "/api/v1/sales/orders"), false);
  assert.equal(canAccessProductRoute("5", "/api/v1/accounts/journals"), false);

  // Quality, Safety & Compliance: inspections and the receipts they gate.
  assert.equal(canAccessProductRoute("6", "/api/v1/quality/inspections"), true);
  assert.equal(canAccessProductRoute("6", "/api/v1/purchase/grns"), true);
  assert.equal(canAccessProductRoute("6", "/api/v1/hrm/payroll"), false);

  // Warehouse & Dispatch: stock movement, both ends of it.
  assert.equal(canAccessProductRoute("7", "/api/v1/inventory/stock/entries"), true);
  assert.equal(canAccessProductRoute("7", "/api/v1/sales/dispatches"), true);
  assert.equal(canAccessProductRoute("7", "/api/v1/accounts/journals"), false);

  // Planning & Engineering: the BOM and the plan it drives.
  assert.equal(canAccessProductRoute("8", "/api/v1/engineering/boms"), true);
  assert.equal(canAccessProductRoute("8", "/api/v1/planning/mrp"), true);
  assert.equal(canAccessProductRoute("8", "/api/v1/csp/tickets"), false);

  // Revenue & Service: the quote and the serial number it becomes.
  assert.equal(canAccessProductRoute("9", "/api/v1/sales/quotations"), true);
  assert.equal(canAccessProductRoute("9", "/api/v1/csp/tickets"), true);
  assert.equal(canAccessProductRoute("9", "/api/v1/maintenance/work-orders"), false);

  // Delivery & Managed Services: the plumbing, never the business records.
  assert.equal(canAccessProductRoute("10", "/api/v1/integration/connectors"), true);
  assert.equal(canAccessProductRoute("10", "/api/v1/platform-health/runs"), true);
  assert.equal(canAccessProductRoute("10", "/api/v1/sales/orders"), false);
});

test("no connected package reaches the supplier network, which belongs to AIKYANTRA", () => {
  for (const phase of ["5", "6", "7", "8", "9", "10"]) {
    assert.equal(canAccessProductRoute(phase, "/api/v1/purchase/network/suppliers"), false);
    assert.equal(canAccessProductRoute(phase, "/api/v1/purchase/tenders"), false);
  }
});

test("every package still answers the common prefixes it needs to boot", () => {
  for (const phase of ["5", "6", "7", "8", "9", "10"]) {
    assert.equal(canAccessProductRoute(phase, "/api/v1/me"), true);
    assert.equal(canAccessProductRoute(phase, "/api/v1/health"), true);
  }
});

test("integrated profile exposes all registered domains and invalid profiles fail closed", () => {
  for (const route of ["sales/orders", "agent-os/runs", "purchase/tenders"]) assert.equal(canAccessProductRoute("4", `/api/v1/${route}`), true);
  assert.equal(canAccessProductRoute("unknown", "/api/v1/sales/orders"), false);
  assert.equal(canAccessProductRoute("2", "/api/v1/me"), true);
});
