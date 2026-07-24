import { index, integer, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * INVENTORY (SPAR, Module) — the stock ledger and the SINGLE WRITE PATH to stock
 * (DECISIONS-V2 §5.6): every stock movement goes through Inventory's POST /api/stock/
 * entries; Production and others never write stock tables directly. Ledger writes are
 * ledger-critical: synchronous, in one transaction, race-safe via SELECT ... FOR UPDATE
 * on the contended balance row (§5.5) — never on the event bus.
 *
 * item_id is a CROSS-MODULE logical reference (a bare uuid, no FK — §1.1). warehouse_id
 * is an intra-module FK.
 */

export const warehouse = pgTable(
  "warehouse",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    warehouseType: text("warehouse_type").notNull(), // accepted | quarantine | wip | finished | scrap | general
  },
  (t) => [unique("uq_warehouse_tenant_code").on(t.tenantId, t.code)],
);

// The running on-hand balance per (item, warehouse, batch). THIS is the contended row
// locked FOR UPDATE during posting, so concurrent postings serialise and stock can
// never go negative by a race. batch = '' means "no batch" (keeps the unique key simple).
export const stockBalance = pgTable(
  "stock_balance",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    itemId: uuid("item_id").notNull(), // cross-module logical ref (no FK)
    warehouseId: uuid("warehouse_id").notNull(), // intra-module FK -> warehouse
    batch: text("batch").notNull().default(""),
    qty: numeric("qty", { precision: 18, scale: 3 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("uq_stock_balance").on(t.tenantId, t.itemId, t.warehouseId, t.batch)],
);

// The append-only stock ledger: one signed row per movement (+ in, − out). The
// authoritative history; balances are its running sum. Never updated or deleted.
export const stockLedger = pgTable(
  "stock_ledger",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    itemId: uuid("item_id").notNull(),
    warehouseId: uuid("warehouse_id").notNull(),
    batch: text("batch").notNull().default(""),
    qty: numeric("qty", { precision: 18, scale: 3 }).notNull(), // signed
    entryId: uuid("entry_id").notNull(), // intra-module FK -> stock_entry
    entryType: text("entry_type").notNull(), // receipt | issue | transfer | adjustment
    reasonCode: text("reason_code"),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").notNull(),
  },
  (t) => [index("ix_stockledger_tenant_item_wh").on(t.tenantId, t.itemId, t.warehouseId)],
);

// The stock-entry document (header) that posts to the ledger.
export const stockEntry = pgTable("stock_entry", {
  ...tenantScopedColumns,
  entryType: text("entry_type").notNull(), // receipt | issue | transfer | adjustment
  reasonCode: text("reason_code"), // required for adjustments
  remarks: text("remarks"),
  postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockEntryLine = pgTable(
  "stock_entry_line",
  {
    ...tenantScopedColumns,
    entryId: uuid("entry_id").notNull(), // intra-module FK -> stock_entry
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id").notNull(), // cross-module logical ref
    fromWarehouseId: uuid("from_warehouse_id"), // issue/transfer source
    toWarehouseId: uuid("to_warehouse_id"), // receipt/transfer/adjustment target
    batch: text("batch").notNull().default(""),
    qty: numeric("qty", { precision: 18, scale: 3 }).notNull(), // magnitude (signed only for adjustment)
  },
  (t) => [unique("uq_stockentryline").on(t.tenantId, t.entryId, t.lineNo)],
);
