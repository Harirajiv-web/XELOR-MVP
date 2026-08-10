import { index, integer, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { amendableColumns, tenantScopedColumns } from "./columns.js";

/**
 * PRODUCTION (KILN, Module 05) — manufacturing. A production order consumes BOM
 * components (issued from a source warehouse) and produces a finished good (received
 * into an FG warehouse) — BOTH through Inventory's single stock write path (§5.6);
 * Production never writes stock itself. item_id / bom_id / warehouse ids are
 * cross-module logical refs (no FK, §1.1). Component requirements are exploded and
 * SNAPSHOTTED at creation, so later BOM edits never disturb a running order.
 */
export const productionOrder = pgTable(
  "production_order",
  {
    ...tenantScopedColumns,
    ...amendableColumns,
    orderNo: text("order_no").notNull(),
    itemId: uuid("item_id").notNull(), // the finished good to make
    bomId: uuid("bom_id").notNull(), // the BOM used (pinned)
    qtyToProduce: numeric("qty_to_produce", { precision: 18, scale: 3 }).notNull(),
    producedQty: numeric("produced_qty", { precision: 18, scale: 3 }).notNull().default("0"),
    sourceWarehouseId: uuid("source_warehouse_id").notNull(), // components issued from
    fgWarehouseId: uuid("fg_warehouse_id").notNull(), // finished goods received into
    status: text("status").notNull(), // planned | in_progress | completed | cancelled
  },
  (t) => [
    unique("uq_prodorder_tenant_no").on(t.tenantId, t.orderNo),
    index("ix_prodorder_tenant_status").on(t.tenantId, t.status),
  ],
);

export const productionOrderComponent = pgTable(
  "production_order_component",
  {
    ...tenantScopedColumns,
    orderId: uuid("order_id").notNull(), // intra-module FK -> production_order
    lineNo: integer("line_no").notNull(),
    componentItemId: uuid("component_item_id").notNull(), // logical ref
    requiredQty: numeric("required_qty", { precision: 18, scale: 3 }).notNull(),
    issuedQty: numeric("issued_qty", { precision: 18, scale: 3 }).notNull().default("0"),
  },
  (t) => [unique("uq_prodcomp_order_line").on(t.tenantId, t.orderId, t.lineNo)],
);

/**
 * The executable route through a production order. Operations are deliberately owned by
 * Production (not Maintenance): they describe how a product is made, who ran each step,
 * and the measured output/reject quantity at that step. The timestamps and evidence note
 * make the route useful in a demo without pretending to be a machine-data integration.
 */
export const productionOperation = pgTable(
  "production_operation",
  {
    ...tenantScopedColumns,
    orderId: uuid("order_id").notNull(), // intra-module FK -> production_order
    sequence: integer("sequence").notNull(),
    operationCode: text("operation_code").notNull(),
    operationName: text("operation_name").notNull(),
    workCenterRef: text("work_center_ref"),
    status: text("status").notNull().default("queued"), // queued | in_progress | completed | blocked
    plannedStart: timestamp("planned_start", { withTimezone: true }),
    plannedEnd: timestamp("planned_end", { withTimezone: true }),
    actualStart: timestamp("actual_start", { withTimezone: true }),
    actualEnd: timestamp("actual_end", { withTimezone: true }),
    operatorRef: text("operator_ref"),
    inputQty: numeric("input_qty", { precision: 18, scale: 3 }),
    outputQty: numeric("output_qty", { precision: 18, scale: 3 }).notNull().default("0"),
    rejectedQty: numeric("rejected_qty", { precision: 18, scale: 3 }).notNull().default("0"),
    evidenceNote: text("evidence_note"),
  },
  (t) => [
    unique("uq_prodop_order_sequence").on(t.tenantId, t.orderId, t.sequence),
    index("ix_prodop_tenant_status").on(t.tenantId, t.status),
  ],
);
