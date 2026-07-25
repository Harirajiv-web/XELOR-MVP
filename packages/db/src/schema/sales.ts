import { boolean, date, index, integer, numeric, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * SMBD (MICA, Module 07) — Sales & dispatch: the sell side of the spine.
 *
 * Reconciled to the locked baseline: the blueprint was authored on PG16/FastAPI with
 * BIGINT identities, a separate `smbd.` schema and NUMERIC(14,2). Here it is UUIDv7 PKs,
 * shared schema + `tenant_id` + FORCE RLS, and NUMERIC(18,2) money per DECISIONS-V2 §5.
 *
 * The GST split is computed by the pure platform brain and STORED per line, because an
 * invoice must reproduce the tax that was agreed on the order date — not whatever the
 * rate table says later. item/warehouse ids are cross-module logical refs (§1.1).
 */

export const customer = pgTable(
  "customer",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    gstin: text("gstin"),
    /** GST state code — place-of-supply default, derived from the GSTIN when present. */
    stateCode: text("state_code"),
    /** An unregistered buyer is legitimate; the IRP wants "URP" rather than a blank. */
    isRegistered: boolean("is_registered").notNull().default(true),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    billingAddress: text("billing_address"),
    creditLimit: numeric("credit_limit", { precision: 18, scale: 2 }).notNull().default("0"),
    creditDays: integer("credit_days").notNull().default(30),
  },
  (t) => [
    unique("uq_customer_tenant_code").on(t.tenantId, t.code),
    index("ix_customer_tenant_name").on(t.tenantId, t.name),
  ],
);

export const salesOrder = pgTable(
  "sales_order",
  {
    ...tenantScopedColumns,
    soNo: text("so_no").notNull(),
    customerId: uuid("customer_id").notNull(), // intra-module FK
    custPoNo: text("cust_po_no").notNull(),
    orderDate: date("order_date").notNull(),
    /** The selling registration — a two-GSTIN tenant taxes the same customer differently. */
    supplierGstin: text("supplier_gstin").notNull(),
    billToGstin: text("bill_to_gstin"),
    /** Ship-to, captured at ORDER time: mandatory on the IRP payload from 1 Aug 2026. */
    shipToGstin: text("ship_to_gstin"),
    shipToStateCode: text("ship_to_state_code").notNull(),
    shipToAddress: text("ship_to_address"),
    /** Place of supply for goods = the shipping destination state. */
    placeOfSupply: text("place_of_supply").notNull(),
    isInterState: boolean("is_inter_state").notNull(),
    fgWarehouseId: uuid("fg_warehouse_id"), // dispatch issues from here
    subtotal: numeric("subtotal", { precision: 18, scale: 2 }).notNull().default("0"),
    cgstTotal: numeric("cgst_total", { precision: 18, scale: 2 }).notNull().default("0"),
    sgstTotal: numeric("sgst_total", { precision: 18, scale: 2 }).notNull().default("0"),
    igstTotal: numeric("igst_total", { precision: 18, scale: 2 }).notNull().default("0"),
    roundOff: numeric("round_off", { precision: 18, scale: 2 }).notNull().default("0"),
    grandTotal: numeric("grand_total", { precision: 18, scale: 2 }).notNull().default("0"),
    /** The credit verdict and its three inputs are snapshotted for later audit. */
    creditStatus: text("credit_status").notNull().default("pending"),
    creditLimitSnapshot: numeric("credit_limit_snapshot", { precision: 18, scale: 2 }),
    creditExposureSnapshot: numeric("credit_exposure_snapshot", { precision: 18, scale: 2 }),
    creditOverrideBy: uuid("credit_override_by"),
    creditOverrideReason: text("credit_override_reason"),
    status: text("status").notNull().default("draft"),
  },
  (t) => [
    unique("uq_so_tenant_no").on(t.tenantId, t.soNo),
    // duplicate customer-PO guard: the same PO number twice is almost always a re-key
    unique("uq_so_customer_po").on(t.tenantId, t.customerId, t.custPoNo),
    index("ix_so_tenant_status").on(t.tenantId, t.status),
    index("ix_so_tenant_customer").on(t.tenantId, t.customerId),
  ],
);

export const salesOrderLine = pgTable(
  "sales_order_line",
  {
    ...tenantScopedColumns,
    orderId: uuid("order_id").notNull(), // intra-module FK
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id").notNull(), // logical ref
    qty: numeric("qty", { precision: 18, scale: 3 }).notNull(),
    uom: text("uom"),
    rate: numeric("rate", { precision: 18, scale: 2 }).notNull(),
    discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    hsn: text("hsn").notNull(),
    gstRatePct: numeric("gst_rate_pct", { precision: 5, scale: 2 }).notNull(),
    taxableValue: numeric("taxable_value", { precision: 18, scale: 2 }).notNull(),
    cgst: numeric("cgst", { precision: 18, scale: 2 }).notNull().default("0"),
    sgst: numeric("sgst", { precision: 18, scale: 2 }).notNull().default("0"),
    igst: numeric("igst", { precision: 18, scale: 2 }).notNull().default("0"),
    lineTotal: numeric("line_total", { precision: 18, scale: 2 }).notNull(),
    deliveredQty: numeric("delivered_qty", { precision: 18, scale: 3 }).notNull().default("0"),
  },
  (t) => [
    unique("uq_soline_order_line").on(t.tenantId, t.orderId, t.lineNo),
    index("ix_soline_tenant_order").on(t.tenantId, t.orderId),
  ],
);

/** A dispatch issues stock OUT through Inventory's write path — never by writing stock. */
export const dispatch = pgTable(
  "dispatch",
  {
    ...tenantScopedColumns,
    dispatchNo: text("dispatch_no").notNull(),
    orderId: uuid("order_id").notNull(), // intra-module FK
    dispatchDate: date("dispatch_date").notNull(),
    transporter: text("transporter"),
    vehicleNo: text("vehicle_no"),
    ewayBillNo: text("eway_bill_no"),
    status: text("status").notNull().default("dispatched"),
    /** The stock entry Inventory returned — the audit link for the goods leaving. */
    stockEntryRef: text("stock_entry_ref"),
  },
  (t) => [
    unique("uq_dispatch_tenant_no").on(t.tenantId, t.dispatchNo),
    index("ix_dispatch_tenant_order").on(t.tenantId, t.orderId),
  ],
);

export const dispatchLine = pgTable(
  "dispatch_line",
  {
    ...tenantScopedColumns,
    dispatchId: uuid("dispatch_id").notNull(), // intra-module FK
    orderLineId: uuid("order_line_id").notNull(), // intra-module FK
    itemId: uuid("item_id").notNull(),
    qty: numeric("qty", { precision: 18, scale: 3 }).notNull(),
  },
  (t) => [index("ix_dispatchline_tenant_dispatch").on(t.tenantId, t.dispatchId)],
);
