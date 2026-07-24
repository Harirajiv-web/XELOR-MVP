import { boolean, index, integer, numeric, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * ENGINEERING (AXLE, Module 02) — Product Engineering. Owns the ITEM MASTER (the parts/
 * SKU catalogue) and the BILL OF MATERIALS. Every downstream module — Inventory,
 * Purchase, Production — references an item by its logical id (a bare uuid, NO
 * cross-module FK, §1.1). Intra-module FKs (bom_line -> item, bom -> item) are declared.
 */

// One catalogued item: raw material, component, sub-assembly, finished good or
// consumable. `item_code` is the tenant-unique business key; the item-dedup brain also
// guards against near-duplicate NAMES the unique code constraint can't catch.
export const item = pgTable(
  "item",
  {
    ...tenantScopedColumns,
    itemCode: text("item_code").notNull(), // tenant-unique business key
    name: text("name").notNull(),
    description: text("description"),
    itemType: text("item_type").notNull(), // raw_material | component | sub_assembly | finished_good | consumable
    uom: text("uom").notNull(), // unit of measure: nos | kg | ltr | mtr | set ...
    hsnCode: text("hsn_code"), // HSN/SAC for GST (optional at MVP)
    itemGroup: text("item_group"), // free-form category
    isPurchasable: boolean("is_purchasable").notNull().default(true),
    isManufacturable: boolean("is_manufacturable").notNull().default(false),
    isSellable: boolean("is_sellable").notNull().default(false),
    standardCost: numeric("standard_cost", { precision: 18, scale: 2 }), // §5.1 money
  },
  (t) => [unique("uq_item_tenant_code").on(t.tenantId, t.itemCode)],
);

// A versioned recipe for making one item: which components, and how much of each.
// A running production order pins to a BOM version, so publishing a new version never
// changes an in-flight build. Only ONE version is active per item at a time.
export const bom = pgTable(
  "bom",
  {
    ...tenantScopedColumns,
    itemId: uuid("item_id").notNull(), // the manufactured item (intra-module FK -> item)
    version: integer("version").notNull(),
    outputQty: numeric("output_qty", { precision: 18, scale: 3 }).notNull().default("1"),
    uom: text("uom").notNull(), // uom of the produced output
    notes: text("notes"),
  },
  (t) => [
    unique("uq_bom_item_version").on(t.tenantId, t.itemId, t.version),
    index("ix_bom_tenant_item").on(t.tenantId, t.itemId),
  ],
);

// One component line of a BOM: a component item + the quantity consumed per output.
export const bomLine = pgTable(
  "bom_line",
  {
    ...tenantScopedColumns,
    bomId: uuid("bom_id").notNull(), // intra-module FK -> bom
    lineNo: integer("line_no").notNull(),
    componentItemId: uuid("component_item_id").notNull(), // intra-module FK -> item
    qty: numeric("qty", { precision: 18, scale: 3 }).notNull(),
    uom: text("uom").notNull(),
    scrapPct: numeric("scrap_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  },
  (t) => [
    unique("uq_bomline_bom_line").on(t.tenantId, t.bomId, t.lineNo),
    index("ix_bomline_tenant_bom").on(t.tenantId, t.bomId),
  ],
);
