import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { canAccessProductRoute } from "../../common/product-profile.guard.js";
import { PERMISSION_KEY } from "../../common/permission.guard.js";
import { VendorController } from "./vendor.controller.js";
import { buildVendorPerformance, type VendorPerformanceInput } from "./vendor-performance.js";

const at = new Date("2026-09-11T12:00:00Z");
const base = (): VendorPerformanceInput => ({
  tenantId: "tenant-a", vendor: { id: "v1", tenantId: "tenant-a", code: "V1", name: "Supplier A" }, orders: [], receipts: [], lines: [], inspections: [], items: [],
});
const order = (id: string, status = "received", expectedDate: Date | null = new Date("2026-09-10")) => ({ id, tenantId: "tenant-a", vendorId: "v1", poNo: id, status, expectedDate });
const receipt = (id: string, poId: string, day = "2026-09-09") => ({ id, tenantId: "tenant-a", vendorId: "v1", poId, grnDate: new Date(day), status: "posted" });

test("a supplier with no receipts or inspections is unknown, not a perfect score", () => {
  const data = buildVendorPerformance(base(), at);
  assert.equal(data.delivery.onTimeRate, null);
  assert.deepEqual(data.quality.materials, []);
  assert.equal(data.receipts.count, 0);
});

test("delivery counts final receipts of completed orders and discloses incomplete evidence", () => {
  const input = base();
  input.orders = [order("on-time"), order("late"), order("partial", "partially_received"), order("undated", "received", null), order("no-receipt")];
  input.receipts = [receipt("r1", "on-time"), receipt("r2", "late"), receipt("r3", "late", "2026-09-11"), receipt("r4", "partial"), receipt("r5", "undated")];
  const data = buildVendorPerformance(input, at);
  assert.deepEqual(data.delivery, { sampleSize: 2, onTime: 1, onTimeRate: 50, excludedCompleted: 2 });
  assert.equal(data.orders.awaitingReceipt, 1);
  assert.equal(data.orders.overdue, 1);
  assert.equal(data.evidence.find((row) => row.poNo === "late")?.lastReceiptDate, "2026-09-11T00:00:00.000Z");
});

test("foreign-tenant and other-vendor records cannot enter the response or denominators", () => {
  const input = base();
  input.orders = [order("own"), { ...order("foreign"), tenantId: "tenant-b" }, { ...order("another-vendor"), vendorId: "v2" }];
  input.receipts = [receipt("own-receipt", "own"), receipt("foreign-receipt", "foreign"), { ...receipt("wrong-tenant", "own"), tenantId: "tenant-b" }, { ...receipt("wrong-vendor", "own"), vendorId: "v2" }];
  input.lines = [{ tenantId: "tenant-b", grnId: "own-receipt", itemId: "secret-item", qty: "10" }];
  input.inspections = [{ tenantId: "tenant-b", id: "secret", inspectionNo: "secret", receiptId: "own-receipt", itemId: "secret-item", acceptedQty: "0", rejectedQty: "100" }];
  const data = buildVendorPerformance(input, at);
  assert.equal(data.orders.total, 1);
  assert.equal(data.receipts.count, 1);
  assert.equal(data.quality.inspectionCount, 0);
  assert.deepEqual(data.quality.materials, []);
  assert.equal(JSON.stringify(data).includes("secret"), false);
  assert.throws(() => buildVendorPerformance({ ...input, vendor: { ...input.vendor, tenantId: "tenant-b" } }, at), /vendor/i);
});

test("quality stays per material; pending quantity evidence is not converted into zero rejection", () => {
  const input = base();
  input.orders = [order("A")]; input.receipts = [receipt("r1", "A")];
  input.lines = [{ tenantId: "tenant-a", grnId: "r1", itemId: "kg", qty: "1000" }, { tenantId: "tenant-a", grnId: "r1", itemId: "pieces", qty: "10" }, { tenantId: "tenant-a", grnId: "r1", itemId: "unknown", qty: "7" }];
  input.items = [{ id: "kg", itemCode: "STEEL", name: "Steel", uom: "kg", standardCost: 1 }, { id: "pieces", itemCode: "BOLT", name: "Bolt", uom: "nos", standardCost: 1 }];
  input.inspections = [
    { tenantId: "tenant-a", id: "i1", inspectionNo: "I1", receiptId: "r1", itemId: "kg", acceptedQty: "900", rejectedQty: "100" },
    { tenantId: "tenant-a", id: "i2", inspectionNo: "I2", receiptId: "r1", itemId: "pieces", acceptedQty: "5", rejectedQty: "5" },
    { tenantId: "tenant-a", id: "i3", inspectionNo: "I3", receiptId: "r1", itemId: "unknown", acceptedQty: null, rejectedQty: null },
    { tenantId: "tenant-a", id: "i4", inspectionNo: "I4", receiptId: "r1", itemId: "unmatched", acceptedQty: "1", rejectedQty: "0" },
  ];
  const data = buildVendorPerformance(input, at);
  assert.equal(data.quality.materials.find((row) => row.itemId === "kg")?.rejectionRate, 10);
  assert.equal(data.quality.materials.find((row) => row.itemId === "pieces")?.rejectionRate, 50);
  assert.equal(data.quality.materials.find((row) => row.itemId === "unknown")?.rejectionRate, null);
  assert.equal(data.quality.excludedInspections, 2);
  assert.equal("rejectionRate" in data.quality, false);
  assert.equal("receivedQty" in data.evidence[0]!, false);
});

test("unposted receipts never count as delivery or quality evidence", () => {
  const input = base(); input.orders = [order("A")]; input.receipts = [{ ...receipt("r1", "A"), status: "draft" }];
  const data = buildVendorPerformance(input, at);
  assert.equal(data.delivery.onTimeRate, null);
  assert.equal(data.delivery.excludedCompleted, 1);
});

test("internal vendor report retains ERP access and purchase permission without opening the network", () => {
  const path = "/api/v1/purchase/vendors/01900000-0000-7000-8000-000000000001/performance";
  assert.equal(canAccessProductRoute("1", path), true);
  assert.equal(canAccessProductRoute("2", path), false);
  assert.equal(canAccessProductRoute("1", "/api/v1/purchase/network/suppliers"), false);
  assert.deepEqual(Reflect.getMetadata(PERMISSION_KEY, VendorController.prototype.vendorPerformance), ["purchase.vendor.read"]);
});

test("vendor report rejects malformed IDs before calling a service", async () => {
  let called = false;
  const controller = new VendorController({} as never, { get: async () => { called = true; return {}; } } as never);
  await assert.rejects(controller.vendorPerformance("not-a-uuid"));
  assert.equal(called, false);
});
