import assert from "node:assert/strict";
import test from "node:test";
import { summarizeSupplierEvidence } from "./supplier-performance.service.js";
test("supplier with no transaction evidence has unknown rates", () => {
  const result = summarizeSupplierEvidence([], [], [], []);
  assert.equal(result.evidenceStatus, "unknown");
  assert.equal(result.onTimeRate, null);
  assert.equal(result.rejectionRate, null);
});
test("partial receipts do not count as an on-time completed order", () => {
  const result = summarizeSupplierEvidence(
    [
      {
        id: "a",
        poNo: "A",
        expectedDate: new Date("2026-10-10"),
        status: "received",
      },
      {
        id: "b",
        poNo: "B",
        expectedDate: new Date("2026-10-10"),
        status: "partially_received",
      },
      {
        id: "c",
        poNo: "C",
        expectedDate: new Date("2026-10-10"),
        status: "received",
      },
    ],
    [
      { id: "r1", poId: "a", grnDate: new Date("2026-10-09") },
      { id: "r2", poId: "b", grnDate: new Date("2026-10-08") },
      { id: "r3", poId: "c", grnDate: new Date("2026-10-11") },
    ],
    [
      { grnId: "r1", qty: "100" },
      { grnId: "r2", qty: "10" },
      { grnId: "r3", qty: "100" },
    ],
    [{ refId: "r1", qtyAccepted: "98", qtyRejected: "2" }],
  );
  assert.equal(result.deliverySampleSize, 2);
  assert.equal(result.onTimeRate, 50);
  assert.equal(result.receivedQty, 210);
  assert.equal(result.inspectedQty, 100);
  assert.equal(result.rejectionRate, 2);
});
