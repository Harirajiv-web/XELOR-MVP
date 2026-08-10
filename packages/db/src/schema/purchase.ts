import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { amendableColumns, tenantScopedColumns } from "./columns.js";

/**
 * PURCHASE (SPAR, Module 04) — procurement. Owns the VENDOR master, PURCHASE ORDERS
 * (approved through the W1 engine via the WorkflowExecutor port), and GOODS RECEIPTS
 * (which post stock through Inventory's single write path). item_id / vendor references
 * to other modules are logical uuids (no cross-module FK, §1.1); intra-module FKs
 * (po_line → po, grn → po …) are declared.
 */

// A supplier we buy from. A master — so it reuses the shared master-dedup brain.
export const vendor = pgTable(
  "vendor",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(), // tenant-unique business key
    name: text("name").notNull(),
    gstin: text("gstin"), // 15-char GSTIN (optional at MVP)
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    address: text("address"),
    paymentTerms: text("payment_terms"), // free-form for MVP, e.g. "Net 30"
  },
  (t) => [unique("uq_vendor_tenant_code").on(t.tenantId, t.code)],
);

// A purchase order. Submitted for approval through the W1 engine (via the
// WorkflowExecutor port); the linked instance id is stored so the PO reflects the
// approval outcome. vendor_id is an intra-module FK; item_id on lines is a logical ref.
export const purchaseOrder = pgTable(
  "purchase_order",
  {
    ...tenantScopedColumns,
    ...amendableColumns,
    poNo: text("po_no").notNull(),
    vendorId: uuid("vendor_id").notNull(), // intra-module FK -> vendor
    status: text("status").notNull(), // draft | pending_approval | approved | rejected | partially_received | received | cancelled
    poDate: timestamp("po_date", { withTimezone: true }).notNull().defaultNow(),
    expectedDate: timestamp("expected_date", { withTimezone: true }),
    currency: text("currency").notNull().default("INR"),
    totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    remarks: text("remarks"),
    workflowInstanceId: uuid("workflow_instance_id"), // the W1 approval instance (once submitted)
  },
  (t) => [
    unique("uq_po_tenant_no").on(t.tenantId, t.poNo),
    index("ix_po_tenant_status").on(t.tenantId, t.status),
    index("ix_po_tenant_vendor").on(t.tenantId, t.vendorId),
  ],
);

export const purchaseOrderLine = pgTable(
  "purchase_order_line",
  {
    ...tenantScopedColumns,
    poId: uuid("po_id").notNull(), // intra-module FK -> purchase_order
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id").notNull(), // cross-module logical ref (no FK, §1.1)
    qty: numeric("qty", { precision: 18, scale: 3 }).notNull(),
    rate: numeric("rate", { precision: 18, scale: 2 }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    receivedQty: numeric("received_qty", { precision: 18, scale: 3 }).notNull().default("0"),
  },
  (t) => [unique("uq_poline_po_line").on(t.tenantId, t.poId, t.lineNo)],
);

// A goods receipt against a PO. Posting a GRN records stock through Inventory's single
// write path (STOCK_POSTER port) in the SAME transaction — the doc, the PO line updates,
// and the stock ledger all commit atomically. warehouse_id is a cross-module ref (no FK).
export const grn = pgTable(
  "grn",
  {
    ...tenantScopedColumns,
    grnNo: text("grn_no").notNull(),
    poId: uuid("po_id").notNull(), // intra-module FK -> purchase_order
    vendorId: uuid("vendor_id").notNull(), // denormalised snapshot
    warehouseId: uuid("warehouse_id").notNull(), // received into (Inventory warehouse; logical ref)
    grnDate: timestamp("grn_date", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("posted"),
  },
  (t) => [unique("uq_grn_tenant_no").on(t.tenantId, t.grnNo), index("ix_grn_tenant_po").on(t.tenantId, t.poId)],
);

export const grnLine = pgTable(
  "grn_line",
  {
    ...tenantScopedColumns,
    grnId: uuid("grn_id").notNull(), // intra-module FK -> grn
    lineNo: integer("line_no").notNull(),
    poLineId: uuid("po_line_id").notNull(), // intra-module FK -> purchase_order_line
    itemId: uuid("item_id").notNull(), // logical ref
    qty: numeric("qty", { precision: 18, scale: 3 }).notNull(),
    batch: text("batch").notNull().default(""),
  },
  (t) => [unique("uq_grnline_grn_line").on(t.tenantId, t.grnId, t.lineNo)],
);
