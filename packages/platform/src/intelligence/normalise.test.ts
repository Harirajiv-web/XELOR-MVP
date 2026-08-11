import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decimal,
  lineValue,
  rupees,
  toCanonicalCustomer,
  toCanonicalItem,
  toCanonicalOrderLine,
  toCanonicalStockLine,
  toCanonicalSupplier,
  totalOnHand,
} from "./normalise.js";

/**
 * The claim under test is narrow and it is the one that actually bites:
 *
 *   PHASE 1 HANDS BACK STRINGS, AND EVERY NUMBER PHASE 2 REASONS WITH IS A NUMBER.
 *
 * Postgres NUMERIC arrives from the driver as text — "1183.674", not 1183.674 — so a
 * mapper that forgets one field produces `"12" + 1 === "121"` three steps later, in a
 * quantity a purchase order is raised against. The rest of these tests pin the two
 * distinctions the models deliberately keep: uncosted is not free, and a vendor that is not
 * in the master is not silently given an id.
 */

/* ------------------------------------------------------------------- numbers -- */

test("decimal parses what the driver actually returns", () => {
  assert.equal(decimal("1183.674"), 1183.674);
  assert.equal(decimal(42), 42);
  assert.equal(decimal(null), 0);
  assert.equal(decimal(undefined), 0);
  assert.equal(decimal(""), 0);
  // Not NaN. A NaN quantity propagates silently through every subsequent sum.
  assert.equal(decimal("not a number"), 0);
});

test("rupees rounds to the paisa the way the money columns do", () => {
  assert.equal(rupees("1234.567"), 1234.57);
  assert.equal(rupees("0.005"), 0.01);
  assert.equal(rupees(null), 0);
});

/* ----------------------------------------------------------------- customers -- */

test("a customer's credit terms survive as numbers, and an unregistered buyer keeps a null GSTIN", () => {
  const c = toCanonicalCustomer({
    id: "cust-1",
    code: "CUST-NS",
    name: "Northstar Process Systems",
    gstin: null,
    creditLimit: "350000.00",
    creditDays: 45,
  });
  assert.equal(c.creditLimit, 350000);
  assert.equal(c.creditDays, 45);
  assert.equal(c.gstin, null);
});

/* --------------------------------------------------------------------- items -- */

test("an uncosted item keeps a null standard cost — uncosted is not free", () => {
  const uncosted = toCanonicalItem({ id: "i1", itemCode: "CMP-CAS50", name: "Casing" });
  assert.equal(uncosted.standardCost, null);

  const costed = toCanonicalItem({ id: "i2", itemCode: "CMP-IMP6", name: "Impeller", standardCost: "500.00" });
  assert.equal(costed.standardCost, 500);
});

test("item defaults are the schema's defaults, not invented ones", () => {
  const i = toCanonicalItem({ id: "i1", itemCode: "RAW-BLT-M8", name: "M8 bolt" });
  assert.equal(i.uom, "nos");
  assert.equal(i.itemType, "component");
  assert.equal(i.purchasable, true);
  assert.equal(i.manufacturable, false);
});

/* ---------------------------------------------------------------------- stock -- */

test("on-hand sums across warehouses and batches, and ignores other items", () => {
  const lines = [
    toCanonicalStockLine({ itemId: "A", warehouseId: "W1", qty: "100.000" }),
    toCanonicalStockLine({ itemId: "A", warehouseId: "W2", batch: "B-77", qty: "83.674" }),
    toCanonicalStockLine({ itemId: "B", warehouseId: "W1", qty: "9999.000" }),
  ];
  assert.equal(totalOnHand(lines, "A"), 183.674);
  assert.equal(totalOnHand(lines, "C"), 0);
  // A non-batch-tracked row carries "", never null: the column is NOT NULL DEFAULT ''.
  assert.equal(lines[0]!.batch, "");
});

test("stock as-of becomes an ISO string whichever way the driver hands it over", () => {
  const d = new Date("2026-07-20T04:30:00.000Z");
  assert.equal(toCanonicalStockLine({ itemId: "A", warehouseId: "W1", updatedAt: d }).asOf, d.toISOString());
  assert.equal(toCanonicalStockLine({ itemId: "A", warehouseId: "W1" }).asOf, null);
});

/* ------------------------------------------------------------------ suppliers -- */

test("a supplier that IS in the vendor master takes the master's id and name", () => {
  const v = toCanonicalSupplier(
    { vendorCode: "V-SUN-01", vendorName: "Sundaram Castings", unitPrice: 1850, leadTimeDays: 18, reliability: 0.92, capacityUnits: 200, qualified: true },
    { id: "0192a8c0-0000-7000-8000-0000000000aa", code: "V-SUN-01", name: "Sundaram Precision Castings" },
  );
  assert.equal(v.vendorId, "0192a8c0-0000-7000-8000-0000000000aa");
  // The document goes out under the registered name, not the one the price list spelled.
  assert.equal(v.vendorName, "Sundaram Precision Castings");
  assert.equal(v.inVendorMaster, true);
  assert.equal(v.termsFrom, "seeded");
});

test("a supplier that is NOT in the master says so, and falls back to its code", () => {
  const v = toCanonicalSupplier(
    { vendorCode: "V-GEN", vendorName: "General Supplies Co", unitPrice: 500, leadTimeDays: 14, reliability: 0.85, capacityUnits: 10, qualified: true },
    null,
  );
  assert.equal(v.inVendorMaster, false);
  assert.equal(v.vendorId, "V-GEN");
});

test("terms uploaded on a spreadsheet are labelled as such, and reliability is clamped", () => {
  const v = toCanonicalSupplier(
    { vendorCode: "V-ATL-01", vendorName: "Atlas Alloys", unitPrice: 3200.456, leadTimeDays: 6.4, reliability: 1.4, capacityUnits: 300, qualified: true },
    null,
    "spreadsheet",
  );
  assert.equal(v.termsFrom, "spreadsheet");
  assert.equal(v.reliability, 1);
  assert.equal(v.unitPrice, 3200.46);
  assert.equal(v.leadTimeDays, 6);
});

/* ---------------------------------------------------------------- order lines -- */

test("an order line arrives as numbers, with the item code joined in", () => {
  const l = toCanonicalOrderLine(
    { id: "l1", lineNo: 1, itemId: "i1", qty: "120.000", rate: "14500.00", deliveredQty: "0.000", reservedQty: "0.000", uom: "nos" },
    "PMP-PX400",
  );
  assert.equal(l.qty, 120);
  assert.equal(l.rate, 14500);
  assert.equal(l.itemCode, "PMP-PX400");
  assert.equal(l.openQty, 120);
  assert.equal(lineValue(l), 1_740_000);
});

test("open quantity nets delivered and reserved, and never goes negative", () => {
  const partly = toCanonicalOrderLine({ id: "l1", lineNo: 1, itemId: "i1", qty: "40", deliveredQty: "28", reservedQty: "4" });
  assert.equal(partly.openQty, 8);

  // Over-delivery is a real thing on a shop floor, and it does not mean negative work left.
  const over = toCanonicalOrderLine({ id: "l2", lineNo: 2, itemId: "i1", qty: "10", deliveredQty: "12" });
  assert.equal(over.openQty, 0);
});

test("a line whose item could not be joined shows a question mark, never a uuid", () => {
  const l = toCanonicalOrderLine({ id: "l1", lineNo: 1, itemId: "0192a8c0-0000-7000-8000-000000000009", qty: "1" });
  assert.equal(l.itemCode, "?");
});
