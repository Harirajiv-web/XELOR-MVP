import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { amendableColumns, tenantScopedColumns } from "./columns.js";

/**
 * CSP — CUSTOMER SERVICE PORTAL (MICA, Module 11).
 *
 * This is the only module in the suite whose tables are reachable from the public
 * internet, and every structural decision here follows from that one fact.
 *
 * **The second scoping dimension.** Every table a portal session can reach carries
 * `customer_account_id` alongside `tenant_id`, and the migration puts a RESTRICTIVE
 * row-level policy on it. Tenant isolation answers "is this 3S's row?"; the second
 * dimension answers "is this *this customer's* row?" — so a BlueOrbit engineer with a
 * valid token and a correctly-guessed ticket id still reads nothing, because the database
 * refuses before the application is consulted. Staff sessions leave the setting empty and
 * the restrictive policy becomes a no-op: an agent legitimately sees every customer in
 * their tenant.
 *
 * **One record, two faces.** There is no customer-facing copy of a ticket. The customer
 * and the agent read the same row, and the difference between what they see is a
 * projection (`toPublicTicketView`, `isCustomerVisible`), not a second table that can
 * drift. An internal note is a comment with `visibility = 'internal'`; an unsent AI reply
 * is a comment with `author_type = 'ai_draft'`. Neither is ever selected into the portal
 * view, and neither needs a copy to be kept in step.
 *
 * **The SLA clock is evidence, not a counter.** `csp_ticket` stores the deadlines and the
 * allowances; the *consumed* time is recomputed from `csp_ticket_pause` intervals every
 * time it is asked for. Nothing accumulates minutes into a column, because an accumulated
 * counter cannot be audited after the fact — and an SLA number a customer disputes has to
 * be re-derivable from the record, years later, by someone who was not there.
 *
 * Cross-module references (customer, contact, item, serial, order, invoice, NCR, CAPA,
 * employee) are logical: a uuid or a document number with a comment, never a foreign key
 * across a module boundary.
 */

/* ========================= configuration & routing ======================== */

/**
 * The service-desk working calendar. Business time is computed from this and nothing else.
 *
 * This lives in CSP for now because the platform has no shared calendar master yet; when
 * GENERAL grows one, this table becomes a logical `business_calendar_id` reference and the
 * columns move. The shape is deliberately identical to `BusinessCalendar` in the platform
 * package so that migration is a rename, not a rewrite.
 */
export const cspBusinessCalendar = pgTable(
  "csp_business_calendar",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** 0 = Sunday … 6 = Saturday. Mon–Sat is [1,2,3,4,5,6]; nothing assumes Mon–Fri. */
    workingWeekdays: jsonb("working_weekdays").notNull().default([1, 2, 3, 4, 5]),
    dayStartMinutes: integer("day_start_minutes").notNull().default(540),
    dayEndMinutes: integer("day_end_minutes").notNull().default(1080),
    /** ISO dates that are not worked whatever the weekday. */
    holidays: jsonb("holidays").notNull().default([]),
    utcOffsetMinutes: integer("utc_offset_minutes").notNull().default(330),
  },
  (t) => [unique("uq_csp_calendar_code").on(t.tenantId, t.code)],
);

/** Agent queues. A ticket is owned by a team first and a person second, so an agent going
 *  on leave does not orphan a queue. */
export const cspTeam = pgTable(
  "csp_team",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    emailAlias: text("email_alias"),
  },
  (t) => [unique("uq_csp_team_code").on(t.tenantId, t.code)],
);

/** `employee_ref` is HRM's employee. CSP stores no name, no contact detail and no grade. */
export const cspTeamMember = pgTable(
  "csp_team_member",
  {
    ...tenantScopedColumns,
    teamId: uuid("team_id").notNull(),
    employeeRef: uuid("employee_ref").notNull(),
    isLead: boolean("is_lead").notNull().default(false),
    isManager: boolean("is_manager").notNull().default(false),
  },
  (t) => [unique("uq_csp_team_member").on(t.tenantId, t.teamId, t.employeeRef)],
);

/** Category taxonomy. `code` is the stable key the SLA policy and the AI triage baseline
 *  both match on — the display name is free to change without moving an SLA. */
export const cspTicketCategory = pgTable(
  "csp_ticket_category",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    parentId: uuid("parent_id"), // intra-module FK: legal
    name: text("name").notNull(),
    defaultTeamId: uuid("default_team_id"),
    defaultPriority: text("default_priority").notNull().default("medium"),
    isPortalVisible: boolean("is_portal_visible").notNull().default(true),
    /** Raising this category creates a linked complaint and hands off to Quality. */
    createsComplaint: boolean("creates_complaint").notNull().default(false),
    sortOrder: smallint("sort_order").notNull().default(0),
  },
  (t) => [unique("uq_csp_category_code").on(t.tenantId, t.code)],
);

/**
 * SLA definitions. Precedence when several match is **contract > category > priority**
 * (`resolveSlaPolicy`): an OEM's contractual four-hour line-down commitment outranks the
 * tenant's own default for "urgent", because the contract is the one with a penalty
 * attached to it.
 */
export const cspSlaPolicy = pgTable(
  "csp_sla_policy",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    appliesTo: text("applies_to").notNull(), // contract | category | priority
    matchValue: text("match_value").notNull(),
    responseMins: integer("response_mins").notNull(),
    resolutionMins: integer("resolution_mins").notNull(),
    calendarId: uuid("calendar_id").notNull(), // intra-module FK: legal
    pauseOnPending: boolean("pause_on_pending").notNull().default(true),
    /** Ordered tiers: `[{tier, clock, atFraction, notifyRole}]`. Each fires exactly once
     *  per ticket — the fired markers live on `csp_ticket.escalation_fired`. */
    escalationMatrix: jsonb("escalation_matrix").notNull().default([]),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    unique("uq_csp_sla_code").on(t.tenantId, t.code),
    index("ix_csp_sla_match").on(t.tenantId, t.appliesTo, t.matchValue),
  ],
);

/**
 * Per-tenant document numbering. TKT-2627-00031 is a number a customer quotes on the
 * phone, so it is allocated from a counter under a row lock rather than derived from a
 * uuid suffix — gapless, ordered, and stable for the life of the financial year.
 */
export const cspDocumentSeries = pgTable(
  "csp_document_series",
  {
    ...tenantScopedColumns,
    docType: text("doc_type").notNull(), // ticket | complaint | spare_request
    prefix: text("prefix").notNull(), // TKT | CMP | SPR
    fyCode: text("fy_code").notNull(), // 2627
    width: smallint("width").notNull().default(5),
    nextNo: integer("next_no").notNull().default(1),
  },
  (t) => [unique("uq_csp_series").on(t.tenantId, t.docType, t.fyCode)],
);

/* ============================ portal identity ============================= */

/**
 * The business record of a portal principal. The credential itself lives in Keycloak's
 * portal realm — this table never stores a password, and `keycloak_sub` is the only link.
 *
 * `customer_account_id` here is the source of the whole second dimension: it is minted
 * from the Keycloak organization the user belongs to, server-side, and is never accepted
 * from a request.
 */
export const cspPortalUser = pgTable(
  "csp_portal_user",
  {
    ...tenantScopedColumns,
    customerAccountId: uuid("customer_account_id").notNull(), // logical ref → SMBD customer
    contactRef: uuid("contact_ref"), // logical ref → SMBD contact
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    phone: text("phone"),
    role: text("role").notNull().default("customer_user"), // customer_user | customer_admin
    status: text("status").notNull().default("invited"), // invited|active|suspended|locked|deactivated
    keycloakSub: text("keycloak_sub"),
    keycloakOrgId: text("keycloak_org_id"),
    /** DPDP notice acceptance. Points at the PLATFORM consent record — CSP links, never
     *  duplicates, and re-consent appends a new row rather than editing this one. */
    consentRecordId: uuid("consent_record_id"),
    consentVersion: text("consent_version"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    failedLoginCount: smallint("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    /** Set when a DPDP erasure is approved: personal fields are pseudonymised in place and
     *  the ticket history survives on its statutory-retention basis. */
    erasedAt: timestamp("erased_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_csp_portal_email").on(t.tenantId, t.email),
    index("ix_csp_portal_account").on(t.tenantId, t.customerAccountId),
  ],
);

/** The invite audit trail. The live token lifecycle is Keycloak's; this is the business
 *  record of who invited whom, when, and whether it was accepted. Only the HASH is kept. */
export const cspPortalInvite = pgTable(
  "csp_portal_invite",
  {
    ...tenantScopedColumns,
    customerAccountId: uuid("customer_account_id").notNull(),
    email: text("email").notNull(),
    contactRef: uuid("contact_ref"),
    tokenHash: text("token_hash").notNull(),
    invitedRole: text("invited_role").notNull().default("customer_user"),
    keycloakOrgId: text("keycloak_org_id"),
    invitedByRef: uuid("invited_by_ref").notNull(), // logical ref → HRM employee
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("ix_csp_invite_account").on(t.tenantId, t.customerAccountId),
    unique("uq_csp_invite_token").on(t.tenantId, t.tokenHash),
  ],
);

/* ================================ the case =============================== */

/**
 * The core case record — one row, two faces.
 *
 * `entitlement_result` is a CACHE of the entitlement engine's verdict, kept so a reply can
 * cite it and so the desk does not re-run a warranty determination on every page load. It
 * carries `entitlement_checked_at`: a verdict without the moment it was reached is not
 * evidence, and coverage that expired last week must not read as coverage today.
 */
export const cspTicket = pgTable(
  "csp_ticket",
  {
    ...tenantScopedColumns,
    ...amendableColumns,
    customerAccountId: uuid("customer_account_id").notNull(),
    ticketNo: text("ticket_no").notNull(),
    contactRef: uuid("contact_ref"), // logical ref → SMBD contact
    portalUserId: uuid("portal_user_id"), // null for phone/manual channel
    /** Logical reference to the dispatched machine. Inventory does not yet carry a serial
     *  register in this prototype, so the serial is stored as the text a customer reads
     *  off the nameplate — the warranty registry is keyed the same way. */
    productSerialNo: text("product_serial_no"),
    itemRef: uuid("item_ref"), // logical ref → Engineering item
    channel: text("channel").notNull().default("portal"), // portal|phone|email|whatsapp
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    categoryId: uuid("category_id"),
    priority: text("priority").notNull().default("medium"),
    severity: text("severity"),
    status: text("status").notNull().default("new"),

    // ---- the SLA clock: deadlines and allowances stored, consumption derived ----
    slaPolicyId: uuid("sla_policy_id"),
    slaCalendarId: uuid("sla_calendar_id"),
    slaState: text("sla_state").notNull().default("on_track"),
    responseAllowanceMins: integer("response_allowance_mins"),
    resolutionAllowanceMins: integer("resolution_allowance_mins"),
    firstResponseDue: timestamp("first_response_due", { withTimezone: true }),
    firstRespondedAt: timestamp("first_responded_at", { withTimezone: true }),
    resolutionDue: timestamp("resolution_due", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** Per-tier fired markers, e.g. `["t80"]`. What makes escalation once-only. */
    escalationFired: jsonb("escalation_fired").notNull().default([]),

    teamId: uuid("team_id"),
    ownerEmployeeRef: uuid("owner_employee_ref"),
    /** Optimistic lock for the claim race: two agents pressing "assign to me" produce one
     *  owner and one 409, not a silent last-write-wins. */
    assignedVersion: integer("assigned_version").notNull().default(0),

    complaintId: uuid("complaint_id"),
    entitlementResult: text("entitlement_result"),
    entitlementCheckedAt: timestamp("entitlement_checked_at", { withTimezone: true }),

    /** `{suggested_category, suggested_priority, sentiment, confidence, model, rationale,
     *  accepted_by?, overridden_fields?[]}`. A SUGGESTION — never auto-applied. */
    aiTriage: jsonb("ai_triage"),

    reopenCount: smallint("reopen_count").notNull().default(0),
    reopenedAfterCsat: boolean("reopened_after_csat").notNull().default(false),
    linkedTicketId: uuid("linked_ticket_id"),
    idempotencyKeyHash: text("idempotency_key_hash"),
  },
  (t) => [
    unique("uq_csp_ticket_no").on(t.tenantId, t.ticketNo),
    index("ix_ticket_queue").on(t.tenantId, t.status, t.teamId),
    index("ix_ticket_portal_list").on(t.tenantId, t.customerAccountId, t.createdAt),
    index("ix_ticket_owner").on(t.tenantId, t.ownerEmployeeRef, t.status),
  ],
);

/**
 * Pause intervals — the raw material the SLA verdict is recomputed from.
 *
 * The blueprint models these as a `tstzrange[]` on the ticket. They are a table here for
 * one reason: an array can hold two overlapping ranges and nothing notices, whereas a
 * btree_gist EXCLUDE constraint on this table makes a ticket paused twice over the same
 * minute *unrepresentable* — the same arbiter Maintenance uses for downtime. Double-paused
 * minutes would be subtracted twice, and the ticket would appear to have consumed less of
 * its clock than it did.
 */
export const cspTicketPause = pgTable(
  "csp_ticket_pause",
  {
    ...tenantScopedColumns,
    customerAccountId: uuid("customer_account_id").notNull(),
    ticketId: uuid("ticket_id").notNull(),
    pausedAt: timestamp("paused_at", { withTimezone: true }).notNull(),
    resumedAt: timestamp("resumed_at", { withTimezone: true }),
    reason: text("reason").notNull().default("pending_customer"),
  },
  (t) => [index("ix_csp_pause_ticket").on(t.tenantId, t.ticketId)],
);

/** Threaded replies and internal notes. One table, one thread; `visibility` and
 *  `author_type` decide which face a row appears on. */
export const cspTicketComment = pgTable(
  "csp_ticket_comment",
  {
    ...tenantScopedColumns,
    customerAccountId: uuid("customer_account_id").notNull(),
    ticketId: uuid("ticket_id").notNull(),
    body: text("body").notNull(),
    visibility: text("visibility").notNull().default("public"), // public | internal
    authorType: text("author_type").notNull(), // staff | portal | system | ai_draft
    authorRef: uuid("author_ref"),
    /** An `ai_draft` row that a human sent: the moment it stopped being a draft, and who
     *  made it a statement the company had made. Null on every unsent draft. */
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentByRef: uuid("sent_by_ref"),
    /** Provenance for a drafted reply: model, source (template vs model), gate verdict. */
    aiProvenance: jsonb("ai_provenance"),
  },
  (t) => [index("ix_csp_comment_ticket").on(t.tenantId, t.ticketId, t.createdAt)],
);

/** Files. `scan_status` starts `pending`; only `clean` is ever served, and the portal DTO
 *  filters on it — an unscanned upload is invisible rather than merely unlinked. */
export const cspTicketAttachment = pgTable(
  "csp_ticket_attachment",
  {
    ...tenantScopedColumns,
    customerAccountId: uuid("customer_account_id").notNull(),
    ticketId: uuid("ticket_id").notNull(),
    commentId: uuid("comment_id"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    s3Key: text("s3_key").notNull(),
    scanStatus: text("scan_status").notNull().default("pending"), // pending | clean | blocked
    uploadedByType: text("uploaded_by_type").notNull(), // staff | portal
    uploadedByRef: uuid("uploaded_by_ref"),
  },
  (t) => [index("ix_csp_attach_ticket").on(t.tenantId, t.ticketId)],
);

/**
 * The timeline. Append-only, at the grant and at a trigger.
 *
 * This is the table an SLA dispute is settled from: every status change, assignment,
 * pause, resume, escalation and AI decision, with who did it and when. If it could be
 * edited it would settle nothing.
 */
export const cspTicketEvent = pgTable(
  "csp_ticket_event",
  {
    ...tenantScopedColumns,
    customerAccountId: uuid("customer_account_id").notNull(),
    ticketId: uuid("ticket_id").notNull(),
    eventType: text("event_type").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    actorType: text("actor_type").notNull(), // staff | portal | system | ai
    actorRef: uuid("actor_ref"),
    detail: jsonb("detail"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_csp_event_ticket").on(t.tenantId, t.ticketId, t.occurredAt)],
);

/* ========================== complaints & quality ========================== */

/**
 * A defect complaint and its hand-off to Quality.
 *
 * `ncr_ref` and `capa_ref` are logical references to QMS documents, and they are the
 * things the customer must never see: the portal reads `disposition`/`status` through a
 * label map ("Under investigation by Quality") that reveals neither the number nor the
 * engineer. The hand-off itself is an outbox event, so raising a complaint and telling
 * Quality about it either both happen or neither does.
 */
export const cspComplaint = pgTable(
  "csp_complaint",
  {
    ...tenantScopedColumns,
    customerAccountId: uuid("customer_account_id").notNull(),
    complaintNo: text("complaint_no").notNull(),
    ticketId: uuid("ticket_id").notNull(),
    productSerialNo: text("product_serial_no"),
    batchRef: text("batch_ref"),
    itemRef: uuid("item_ref"),
    failureSymptom: text("failure_symptom").notNull(),
    inServiceDate: date("in_service_date"),
    severity: text("severity").notNull().default("major"),
    disposition: text("disposition"),
    status: text("status").notNull().default("open"), // open|investigation|corrective_action|closed
    qmsSyncStatus: text("qms_sync_status").notNull().default("pending"),
    ncrRef: text("ncr_ref"),
    capaRef: text("capa_ref"),
    capaProgressPct: smallint("capa_progress_pct"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closureOverrideBy: uuid("closure_override_by"),
    closureOverrideReason: text("closure_override_reason"),
  },
  (t) => [
    unique("uq_csp_complaint_no").on(t.tenantId, t.complaintNo),
    index("ix_csp_complaint_ticket").on(t.tenantId, t.ticketId),
  ],
);

/* ========================= entitlement: warranty & AMC ==================== */

/** The warranty registry, one row per serial per cover. Auto-created on dispatch when
 *  SMBD publishes a shipped serial; manual entry is the exception and is marked as such. */
export const cspWarranty = pgTable(
  "csp_warranty",
  {
    ...tenantScopedColumns,
    customerAccountId: uuid("customer_account_id").notNull(),
    serialNo: text("serial_no").notNull(),
    itemRef: uuid("item_ref"),
    warrantyType: text("warranty_type").notNull().default("standard_12m"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    coverageTerms: text("coverage_terms"),
    status: text("status").notNull().default("active"), // active | expired | void
    source: text("source").notNull().default("auto_dispatch"), // auto_dispatch | manual
    salesOrderRef: text("sales_order_ref"),
    dispatchedOn: date("dispatched_on"),
  },
  (t) => [
    index("ix_csp_warranty_serial").on(t.tenantId, t.serialNo),
    index("ix_csp_warranty_account").on(t.tenantId, t.customerAccountId),
  ],
);

/** AMC header. `entitlements` is `{visitsPerYear, responseMins?, partsIncluded}` — the
 *  parts flag is what separates a `covered_amc` verdict from a `partial` one. */
export const cspAmcContract = pgTable(
  "csp_amc_contract",
  {
    ...tenantScopedColumns,
    customerAccountId: uuid("customer_account_id").notNull(),
    contractNo: text("contract_no").notNull(),
    coverageType: text("coverage_type").notNull(), // comprehensive | non_comprehensive
    entitlements: jsonb("entitlements").notNull().default({}),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    renewalDate: date("renewal_date"),
    annualValue: numeric("annual_value", { precision: 18, scale: 2 }),
    status: text("status").notNull().default("active"), // active|expiring|expired|renewed|cancelled
    /** Set when the T-60 renewal lead has gone to SMBD. Present so it goes ONCE, not
     *  nightly for two months — the difference between a lead and a nuisance. */
    renewalLeadEmittedAt: timestamp("renewal_lead_emitted_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_csp_amc_no").on(t.tenantId, t.contractNo),
    index("ix_csp_amc_account").on(t.tenantId, t.customerAccountId, t.status),
  ],
);

export const cspAmcContractAsset = pgTable(
  "csp_amc_contract_asset",
  {
    ...tenantScopedColumns,
    customerAccountId: uuid("customer_account_id").notNull(),
    contractId: uuid("contract_id").notNull(),
    serialNo: text("serial_no").notNull(),
    itemRef: uuid("item_ref"),
    siteLabel: text("site_label"),
  },
  (t) => [unique("uq_csp_amc_asset").on(t.tenantId, t.contractId, t.serialNo)],
);

/* ============================== spare requests =========================== */

/**
 * A customer's request for a part.
 *
 * Note what is absent: no quantity on hand, no bin, no valuation. CSP asks Inventory
 * whether the part exists and reserves it through the reservation reference — it never
 * reads or writes stock. `is_warranty` is the entitlement engine's verdict copied onto the
 * request, not a checkbox the customer ticks.
 */
export const cspSpareRequest = pgTable(
  "csp_spare_request",
  {
    ...tenantScopedColumns,
    ...amendableColumns,
    customerAccountId: uuid("customer_account_id").notNull(),
    requestNo: text("request_no").notNull(),
    ticketId: uuid("ticket_id"),
    itemRef: uuid("item_ref").notNull(), // logical ref → Engineering item
    itemCode: text("item_code").notNull(),
    qty: numeric("qty", { precision: 12, scale: 3 }).notNull(),
    uom: text("uom").notNull().default("nos"),
    isWarranty: text("is_warranty").notNull().default("not_covered"),
    unitPrice: numeric("unit_price", { precision: 18, scale: 2 }),
    lineAmount: numeric("line_amount", { precision: 18, scale: 2 }),
    /** The GSTIN the goods actually ship to. Separate from the billing GSTIN because from
     *  1 Aug 2026 the e-invoice carries the ship-to registration explicitly (§3). */
    shipToGstin: text("ship_to_gstin"),
    shipToAddress: text("ship_to_address"),
    status: text("status").notNull().default("submitted"), // submitted|quoted|reserved|fulfilled|closed|rejected
    reservationRef: text("reservation_ref"),
    fulfilmentRef: text("fulfilment_ref"),
  },
  (t) => [
    unique("uq_csp_spare_no").on(t.tenantId, t.requestNo),
    index("ix_csp_spare_account").on(t.tenantId, t.customerAccountId, t.status),
  ],
);

/* ============================== knowledge base =========================== */

/**
 * KB articles. `search_tsv` is GENERATED from the title and body, so an article that is
 * edited cannot fall out of the index — and `embedding` is provisioned now (pgvector,
 * nullable) so the fast-follow RAG assistant is a backfill rather than a migration on a
 * live table.
 *
 * Visibility is enforced by RLS, not only by a WHERE clause: a portal session sees
 * published public articles and nothing else, whatever the query says.
 *
 * `search_tsv` (generated) and `embedding vector(384)` exist in SQL and are deliberately
 * absent here: Drizzle cannot express either, and declaring them would invite application
 * code to write to a column the database maintains.
 */
export const cspKbArticle = pgTable(
  "csp_kb_article",
  {
    ...tenantScopedColumns,
    articleCode: text("article_code").notNull(),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    category: text("category"),
    productModelTags: jsonb("product_model_tags").notNull().default([]),
    visibility: text("visibility").notNull().default("internal"), // internal | public
    version: smallint("version").notNull().default(1),
    status: text("status").notNull().default("draft"), // draft|review|published|archived
    viewCount: integer("view_count").notNull().default(0),
    helpfulCount: integer("helpful_count").notNull().default(0),
    notHelpfulCount: integer("not_helpful_count").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    authorEmployeeRef: uuid("author_employee_ref"),
  },
  (t) => [unique("uq_csp_kb_code").on(t.tenantId, t.articleCode)],
);

/* =================================== CSAT ================================ */

/** Survey issuance. The token is stored as a HASH and purged at 90 days; a survey link is
 *  a bearer credential to write on a ticket, and is treated as one. */
export const cspCsatSurvey = pgTable(
  "csp_csat_survey",
  {
    ...tenantScopedColumns,
    customerAccountId: uuid("customer_account_id").notNull(),
    ticketId: uuid("ticket_id").notNull(),
    portalUserId: uuid("portal_user_id"),
    tokenHash: text("token_hash").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_csp_csat_ticket").on(t.tenantId, t.ticketId),
    unique("uq_csp_csat_token").on(t.tenantId, t.tokenHash),
  ],
);

/** One response per survey — enforced by the unique key, not by the UI hiding a button. */
export const cspCsatResponse = pgTable(
  "csp_csat_response",
  {
    ...tenantScopedColumns,
    customerAccountId: uuid("customer_account_id").notNull(),
    surveyId: uuid("survey_id").notNull(),
    ticketId: uuid("ticket_id").notNull(),
    csatScore: smallint("csat_score").notNull(),
    comment: text("comment"),
    /** AI-tagged, nullable, and never used to change a score — only to route a follow-up. */
    sentiment: text("sentiment"),
    followupTaskCreated: boolean("followup_task_created").notNull().default(false),
  },
  (t) => [unique("uq_csp_csat_response").on(t.tenantId, t.surveyId)],
);

/* =========================== abuse & security telemetry ================== */

/**
 * Rate-limit trips, lockouts, CAPTCHA challenges, scope-denial 404s and AV quarantines.
 *
 * This is the portal's security ledger and part of the CERT-In evidence pack, so it is
 * append-only and deliberately NOT scoped to a customer account: a principal probing for
 * other customers' tickets must appear in the tenant's security view, not be hidden by the
 * very isolation it is testing.
 */
export const cspAbuseEvent = pgTable(
  "csp_abuse_event",
  {
    ...tenantScopedColumns,
    eventType: text("event_type").notNull(),
    principalType: text("principal_type").notNull(), // portal | staff | anonymous
    principalRef: text("principal_ref"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    details: jsonb("details").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_abuse_time").on(t.tenantId, t.occurredAt)],
);
