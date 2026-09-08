import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * SOURCING — the buy-side decision, moved inside the system of record.
 *
 * A purchase order already existed; how the supplier was CHOSEN did not. It lived in a
 * mailbox, and the only durable trace of the most expensive recurring decision a factory
 * makes was the order that came out of it. These tables hold the request, the responses and
 * the award, so a purchase order can answer "why this supplier, at this price, on this date"
 * years later.
 *
 * Deliberately MANUAL. Nothing here fetches a quote, ranks a vendor or picks a winner: a
 * buyer records what suppliers actually sent and the system enforces the governance around
 * it. The intelligence layer sits ABOVE this and is a separate product; an ERP that cannot
 * be run by a person with a phone and a notebook is not a system of record.
 */

/** The request. One part, one quantity, one need date — the unit a supplier can price. */
export const sourcingRfq = pgTable(
  "sourcing_rfq",
  {
    ...tenantScopedColumns,
    rfqNo: text("rfq_no").notNull(),
    title: text("title").notNull(),
    tenderId: uuid("tender_id"),
    tenderLineNo: integer("tender_line_no"),
    itemId: uuid("item_id").notNull(),
    qty: numeric("qty", { precision: 18, scale: 3 }).notNull(),
    uom: text("uom").notNull(),
    /** What the supplier is quoting against. A quote without a revision is an opinion. */
    drawingRev: text("drawing_rev"),
    needDate: date("need_date").notNull(),
    quoteDeadline: date("quote_deadline").notNull(),
    deliveryPlant: text("delivery_plant").notNull(),
    /** The demand this came from — a requisition, an MRP shortage, or a note. */
    originRef: text("origin_ref"),
    notes: text("notes"),
    // draft | issued | evaluation | awarded | closed | cancelled
    status: text("status").notNull().default("draft"),
  },
  (t) => [
    unique("uq_rfq_tenant_no").on(t.tenantId, t.rfqNo),
    index("ix_rfq_tenant_status").on(t.tenantId, t.status),
    index("ix_rfq_tenant_need").on(t.tenantId, t.needDate),
  ],
);

/** Who was asked. A supplier sees only the package it was invited to. */
export const sourcingRfqInvitation = pgTable(
  "sourcing_rfq_invitation",
  {
    ...tenantScopedColumns,
    rfqId: uuid("rfq_id").notNull(),
    vendorId: uuid("vendor_id").notNull(),
    // invited | quoted | declined
    responseStatus: text("response_status").notNull().default("invited"),
  },
  (t) => [
    unique("uq_rfqinv_rfq_vendor").on(t.tenantId, t.rfqId, t.vendorId),
    index("ix_rfqinv_tenant_rfq").on(t.tenantId, t.rfqId),
  ],
);

/**
 * A supplier response, as a REVISION. A resubmitted price never overwrites the one it
 * replaced — the superseded revision is what proves the buyer did not quietly rewrite
 * history after the award.
 */
export const sourcingSupplierQuote = pgTable(
  "sourcing_supplier_quote",
  {
    ...tenantScopedColumns,
    rfqId: uuid("rfq_id").notNull(),
    vendorId: uuid("vendor_id").notNull(),
    revisionNo: integer("revision_no").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).notNull(),
    toolingCost: numeric("tooling_cost", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    freightCost: numeric("freight_cost", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    /** Non-creditable tax only — creditable GST is not a cost and must not inflate a comparison. */
    nonCreditableTax: numeric("non_creditable_tax", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    /** Held rather than recomputed on read: the number the buyer compared must not move later. */
    landedCost: numeric("landed_cost", { precision: 18, scale: 2 }).notNull(),
    moq: numeric("moq", { precision: 18, scale: 3 }),
    leadTimeDays: integer("lead_time_days"),
    promisedDate: date("promised_date"),
    validUntil: date("valid_until"),
    /**
     * pass | conditional | fail — decided by a person against the released specification,
     * BEFORE any score exists. A failed quote is excluded however cheap it is, which is the
     * whole difference between this and ranking a marketplace by price.
     */
    technicalGate: text("technical_gate").notNull().default("pending"),
    gateNote: text("gate_note"),
    // submitted | superseded | withdrawn
    status: text("status").notNull().default("submitted"),
  },
  (t) => [
    unique("uq_squote_rfq_vendor_rev").on(
      t.tenantId,
      t.rfqId,
      t.vendorId,
      t.revisionNo,
    ),
    index("ix_squote_tenant_rfq").on(t.tenantId, t.rfqId),
    index("ix_squote_tenant_status").on(t.tenantId, t.status),
  ],
);

/**
 * The decision. One award per RFQ, enforced in the database, and one purchase order per
 * award — `converted_po_id` carries a unique constraint so a retried conversion cannot
 * commit the company to buying the same thing twice.
 */
export const sourcingAward = pgTable(
  "sourcing_award",
  {
    ...tenantScopedColumns,
    rfqId: uuid("rfq_id").notNull(),
    quoteId: uuid("quote_id").notNull(),
    vendorId: uuid("vendor_id").notNull(),
    /** Why this one. Recorded because the cheapest quote is often not the awarded quote. */
    awardReason: text("award_reason").notNull(),
    landedCost: numeric("landed_cost", { precision: 18, scale: 2 }).notNull(),
    convertedPoId: uuid("converted_po_id"),
    convertedPoNo: text("converted_po_no"),
    // awarded | converted
    status: text("status").notNull().default("awarded"),
  },
  (t) => [
    unique("uq_award_rfq").on(t.tenantId, t.rfqId),
    unique("uq_award_po").on(t.tenantId, t.convertedPoId),
    index("ix_award_tenant_vendor").on(t.tenantId, t.vendorId),
  ],
);

/** A procurement event groups independently priced RFQ lines and their PO awards. */
export const sourcingTender = pgTable(
  "sourcing_tender",
  {
    ...tenantScopedColumns,
    tenderNo: text("tender_no").notNull(),
    title: text("title").notNull(),
    quoteDeadline: date("quote_deadline").notNull(),
    needDate: date("need_date").notNull(),
    deliveryPlant: text("delivery_plant").notNull(),
    notes: text("notes"),
    status: text("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
  },
  (t) => [
    unique("uq_tender_tenant_no").on(t.tenantId, t.tenderNo),
    index("ix_tender_tenant_status").on(t.tenantId, t.status),
  ],
);
