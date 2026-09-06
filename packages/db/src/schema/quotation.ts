import { date, index, integer, numeric, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * SALES QUOTATION — the front half of the sell side, which this ERP did not have.
 *
 * An order could be taken but not quoted, so every order in the system was entered by
 * retyping something agreed in an email. That is the documented commercial gap, and the cost
 * of it is not typing: it is that the price a customer accepted and the price the company
 * invoiced were held in two different places, with nothing joining them.
 *
 * A quotation is REVISIONED and immutable per revision. Re-pricing supersedes; it never
 * overwrites. The revision the customer accepted has to still be readable after the order
 * ships, because that is the document an argument about price is settled from.
 *
 * Conversion is once. `converted_order_id` is uniquely constrained, so a double-clicked
 * "convert" cannot raise two orders against one acceptance.
 */
export const salesQuotation = pgTable(
  "sales_quotation",
  {
    ...tenantScopedColumns,
    quoteNo: text("quote_no").notNull(),
    revisionNo: integer("revision_no").notNull().default(1),
    /** The revision this one replaced, so the chain is walkable in both directions. */
    supersedesId: uuid("supersedes_id"),
    customerId: uuid("customer_id").notNull(),
    /** The customer's own enquiry reference — how they will refer to it on the phone. */
    enquiryRef: text("enquiry_ref"),
    quoteDate: date("quote_date").notNull(),
    validUntil: date("valid_until").notNull(),
    paymentTerms: text("payment_terms"),
    deliveryTerms: text("delivery_terms"),
    notes: text("notes"),
    subtotal: numeric("subtotal", { precision: 18, scale: 2 }).notNull().default("0"),
    taxTotal: numeric("tax_total", { precision: 18, scale: 2 }).notNull().default("0"),
    grandTotal: numeric("grand_total", { precision: 18, scale: 2 }).notNull().default("0"),
    // draft | sent | accepted | rejected | expired | superseded | converted
    status: text("status").notNull().default("draft"),
    lostReason: text("lost_reason"),
    convertedOrderId: uuid("converted_order_id"),
    convertedSoNo: text("converted_so_no"),
  },
  (t) => [
    unique("uq_quote_tenant_no_rev").on(t.tenantId, t.quoteNo, t.revisionNo),
    unique("uq_quote_converted_order").on(t.tenantId, t.convertedOrderId),
    index("ix_quote_tenant_status").on(t.tenantId, t.status),
    index("ix_quote_tenant_customer").on(t.tenantId, t.customerId),
    index("ix_quote_tenant_valid").on(t.tenantId, t.validUntil),
  ],
);

export const salesQuotationLine = pgTable(
  "sales_quotation_line",
  {
    ...tenantScopedColumns,
    quotationId: uuid("quotation_id").notNull(),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id").notNull(),
    description: text("description"),
    qty: numeric("qty", { precision: 18, scale: 3 }).notNull(),
    uom: text("uom").notNull(),
    rate: numeric("rate", { precision: 18, scale: 2 }).notNull(),
    hsn: text("hsn").notNull(),
    gstRatePct: numeric("gst_rate_pct", { precision: 5, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 18, scale: 2 }).notNull().default("0"),
    requestedDeliveryDate: date("requested_delivery_date"),
  },
  (t) => [
    unique("uq_quoteline_quote_line").on(t.tenantId, t.quotationId, t.lineNo),
    index("ix_quoteline_tenant_quote").on(t.tenantId, t.quotationId),
  ],
);
