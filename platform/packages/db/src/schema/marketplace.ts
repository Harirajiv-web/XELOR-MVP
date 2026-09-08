import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * THE SUPPLIER NETWORK — carrying a request OUT to people who do not use this ERP, and
 * carrying their answers back in.
 *
 * Sourcing already held the buying decision, but it assumed the quotes arrived somehow. This
 * is the "somehow": a request is published to matching suppliers, each one is sent a message
 * with a link, and the link opens a page where they can answer in under a minute without an
 * account, an app, or a login they will forget.
 *
 * The design constraint that shapes everything here: A SUPPLIER WILL NOT SIGN UP. They are a
 * small workshop with a phone. If answering costs them a registration, they do not answer,
 * and an RFQ with no answers is worse than a phone call. So the supplier's identity is the
 * signed link itself — scoped to one request, one supplier, and an expiry.
 */

/**
 * A supplier on the network. Deliberately NOT the ERP's `vendor` table: a vendor is somebody
 * this factory already buys from, and the point of a network is to reach people it does not.
 * `vendor_id` links the two once a network supplier becomes an approved vendor.
 */
export const networkSupplier = pgTable(
  "network_supplier",
  {
    ...tenantScopedColumns,
    supplierCode: text("supplier_code").notNull(),
    name: text("name").notNull(),
    /** What they can actually make. Matching is on these, not on a free-text search. */
    categories: jsonb("categories").notNull().default([]),
    city: text("city"),
    stateCode: text("state_code"),
    gstin: text("gstin"),
    contactName: text("contact_name"),
    /** E.164, because that is what every messaging API demands and what a typo breaks. */
    whatsappE164: text("whatsapp_e164"),
    email: text("email"),
    /** Once they are also an approved vendor, an award can raise a PO against them. */
    vendorId: uuid("vendor_id"),
    // invited | active | suspended
    status: text("status").notNull().default("active"),
    notes: text("notes"),
  },
  (t) => [
    unique("uq_netsupplier_code").on(t.tenantId, t.supplierCode),
    index("ix_netsupplier_status").on(t.tenantId, t.status),
  ],
);

/** One publication of one RFQ to the network. An RFQ can be broadcast more than once. */
export const rfqBroadcast = pgTable(
  "rfq_broadcast",
  {
    ...tenantScopedColumns,
    rfqId: uuid("rfq_id").notNull(),
    rfqNo: text("rfq_no").notNull(),
    /** Frozen at publication: what the suppliers were actually shown, whatever changes later. */
    cardPayload: jsonb("card_payload").notNull(),
    supplierCount: integer("supplier_count").notNull().default(0),
    // published | closed
    status: text("status").notNull().default("published"),
    closesAt: timestamp("closes_at", { withTimezone: true }),
  },
  (t) => [index("ix_rfqbroadcast_rfq").on(t.tenantId, t.rfqId)],
);

/**
 * One supplier's invitation to one broadcast, and the only thing that authenticates them.
 *
 * The invite lookup stores only a SHA-256 hash. Outbox payloads contain the delivery link:
 * live delivery encrypts those payloads with NOTIFY_ENCRYPTION_KEY. Preview mode without
 * that key retains readable links, so its database must be treated as credential-bearing.
 */
export const rfqInvite = pgTable(
  "rfq_invite",
  {
    ...tenantScopedColumns,
    broadcastId: uuid("broadcast_id").notNull(),
    rfqId: uuid("rfq_id").notNull(),
    supplierId: uuid("supplier_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    // sent | opened | quoted | declined | expired
    state: text("state").notNull().default("sent"),
    declineReason: text("decline_reason"),
  },
  (t) => [
    unique("uq_rfqinvite_broadcast_supplier").on(
      t.tenantId,
      t.broadcastId,
      t.supplierId,
    ),
    unique("uq_rfqinvite_token").on(t.tenantId, t.tokenHash),
    index("ix_rfqinvite_rfq").on(t.tenantId, t.rfqId),
  ],
);

/**
 * EVERY MESSAGE THIS SYSTEM MEANT TO SEND, whether or not it left the building.
 *
 * A row is written BEFORE any provider is called, and the provider's answer is written back
 * onto it. That ordering is the point: with `NOTIFY_PROVIDER=preview` nothing is sent and
 * every row still exists, fully rendered, so the exact message a supplier would receive can
 * be read on screen. A messaging integration you cannot see the output of is one you find
 * out about from the customer who got the wrong text.
 */
export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    ...tenantScopedColumns,
    // whatsapp | email
    channel: text("channel").notNull(),
    /** Phone in E.164 or an email address, as the channel requires. */
    recipient: text("recipient").notNull(),
    recipientName: text("recipient_name"),
    // rfq_invitation | quote_received | award_notice
    template: text("template").notNull(),
    subject: text("subject"),
    /** The card, rendered. What a person would actually read. */
    body: text("body").notNull(),
    /** The structured values the card was rendered from, for re-rendering or a real template. */
    variables: jsonb("variables").notNull().default({}),
    linkUrl: text("link_url"),
    encryptedPayload: text("encrypted_payload"),
    relatedType: text("related_type"),
    relatedId: uuid("related_id"),
    // preview | smtp | whatsapp_cloud
    provider: text("provider").notNull(),
    // pending | previewed | sent | failed
    status: text("status").notNull().default("pending"),
    providerMessageId: text("provider_message_id"),
    failureReason: text("failure_reason"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    index("ix_outbox_tenant_status").on(t.tenantId, t.status),
    index("ix_outbox_tenant_related").on(
      t.tenantId,
      t.relatedType,
      t.relatedId,
    ),
  ],
);

/**
 * What a supplier typed into the portal.
 *
 * Held separately from `sourcing_supplier_quote` on purpose. This is an untrusted submission
 * from outside the building; the sourcing quote is a record inside the buyer's own books. The
 * submission is copied into a sourcing quote when it is accepted, and `sourcing_quote_id`
 * carries a unique constraint so one submission cannot become two quotes.
 */
export const networkQuoteSubmission = pgTable(
  "network_quote_submission",
  {
    ...tenantScopedColumns,
    inviteId: uuid("invite_id").notNull(),
    rfqId: uuid("rfq_id").notNull(),
    supplierId: uuid("supplier_id").notNull(),
    unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).notNull(),
    toolingCost: numeric("tooling_cost", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    freightCost: numeric("freight_cost", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    landedCost: numeric("landed_cost", { precision: 18, scale: 2 }).notNull(),
    /** The supplier's own promise. The single most decision-relevant field on the form. */
    promisedDate: text("promised_date"),
    leadTimeDays: integer("lead_time_days"),
    moq: numeric("moq", { precision: 18, scale: 3 }),
    supplierNote: text("supplier_note"),
    sourcingQuoteId: uuid("sourcing_quote_id"),
    // received | accepted_into_sourcing
    status: text("status").notNull().default("received"),
  },
  (t) => [
    unique("uq_netquote_invite").on(t.tenantId, t.inviteId),
    unique("uq_netquote_sourcing").on(t.tenantId, t.sourcingQuoteId),
    index("ix_netquote_rfq").on(t.tenantId, t.rfqId),
  ],
);
