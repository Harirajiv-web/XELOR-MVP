import { bigserial, boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * INTEGRATION (HEXA, Module 15) — the edge of the system.
 *
 * Everything here talks to something we do not control: a GST portal, a bank's SFTP drop, a
 * biometric device, a customer's webhook endpoint. That single fact shapes every table:
 *
 *  - **Nothing is assumed to have worked.** `message_log` and `delivery_attempt` record
 *    every attempt separately, because "it failed" and "it timed out and may have
 *    succeeded" need different handling and only the attempt history distinguishes them.
 *  - **Nothing is lost.** A message that exhausts its retries goes to `dead_letter`, never
 *    to /dev/null. A queue somebody has to look at beats a message nobody knows vanished.
 *  - **No secret is stored in the clear.** `credential` holds a KMS-wrapped data key and a
 *    ciphertext reference; there is no plaintext column.
 *  - **Statutory documents get their own tables**, because an IRN has a 30-day window, a
 *    24-hour cancellation and a legal consequence, and none of that fits in a generic
 *    message log.
 *
 * There is deliberately NO AI in this module — the registry carries an explicit null entry
 * (`integrations.no_mvp_ai`). Triaging a failed message is a lookup table, and a model
 * guessing at it would be slower, unauditable, and capable of a confident wrong answer
 * about a tax filing.
 */

/* -------------------------------------------------------------------------- */
/*  Catalogue and connections                                                 */
/* -------------------------------------------------------------------------- */

export const connector = pgTable(
  "connector",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(), // gsp_einvoice_sandbox, tally_csv_export …
    name: text("name").notNull(),
    category: text("category").notNull(), // statutory | bank | accounting | hr_device | ot | generic
    protocol: text("protocol").notNull(), // https | sftp | mqtt | file
    direction: text("direction").notNull(), // inbound | outbound | bidirectional
    version: text("version").notNull().default("1"),
    configSchema: jsonb("config_schema").notNull().default({}),
    capabilities: jsonb("capabilities").notNull().default([]),
    status: text("status").notNull().default("available"),
  },
  (t) => [unique("uq_connector_tenant_code").on(t.tenantId, t.code)],
);

export const connection = pgTable(
  "connection",
  {
    ...tenantScopedColumns,
    connectorId: uuid("connector_id").notNull(),
    name: text("name").notNull(),
    environment: text("environment").notNull().default("uat"), // dev | uat | prod
    /**
     * `fake` runs the whole pipeline against an in-process adapter. It is not a mock for
     * tests — it is how a demo, a drill and a chaos exercise run without touching a
     * government sandbox, and how failure injection is possible at all.
     */
    adapterMode: text("adapter_mode").notNull().default("fake"), // real | fake
    endpointUrl: text("endpoint_url"),
    secondaryEndpointUrl: text("secondary_endpoint_url"), // the e-way bill dual portal
    authType: text("auth_type").notNull().default("none"),
    credentialId: uuid("credential_id"),
    config: jsonb("config").notNull().default({}),
    healthStatus: text("health_status").notNull().default("unknown"), // healthy | degraded | down | unknown
    circuitState: text("circuit_state").notNull().default("closed"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    consecutiveSuccesses: integer("consecutive_successes").notNull().default(0),
    circuitOpenedAt: timestamp("circuit_opened_at", { withTimezone: true }),
    lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
  },
  (t) => [unique("uq_connection_tenant_name").on(t.tenantId, t.name)],
);

// KMS envelope encryption. No plaintext column exists, which is the only way to be sure
// nobody added one.
export const credential = pgTable(
  "credential",
  {
    ...tenantScopedColumns,
    label: text("label").notNull(),
    credentialType: text("credential_type").notNull(), // api_key | basic | oauth2 | sftp_key | mtls
    encryptedDataKey: text("encrypted_data_key").notNull(), // KMS-wrapped
    ciphertextRef: text("ciphertext_ref").notNull(), // where the sealed payload lives
    keyVersion: integer("key_version").notNull().default(1),
    rotationPolicyDays: integer("rotation_policy_days"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastRotatedAt: timestamp("last_rotated_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [unique("uq_credential_tenant_label").on(t.tenantId, t.label)],
);

/* -------------------------------------------------------------------------- */
/*  Flows and mappings                                                        */
/* -------------------------------------------------------------------------- */

export const integrationFlow = pgTable(
  "integration_flow",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    triggerType: text("trigger_type").notNull(), // event | schedule | manual | inbound
    triggerConfig: jsonb("trigger_config").notNull().default({}),
    sourceConnectionId: uuid("source_connection_id"),
    targetConnectionId: uuid("target_connection_id"),
    canonicalEntity: text("canonical_entity").notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("draft"), // draft | active | paused | retired
    pauseReason: text("pause_reason"),
    retryPolicy: jsonb("retry_policy").notNull().default({}),
    slaMs: integer("sla_ms"),
    isStatutory: boolean("is_statutory").notNull().default(false),
  },
  (t) => [unique("uq_flow_tenant_code").on(t.tenantId, t.code)],
);

export const fieldMapping = pgTable(
  "field_mapping",
  {
    ...tenantScopedColumns,
    flowId: uuid("flow_id").notNull(),
    seq: integer("seq").notNull(),
    sourcePath: text("source_path").notNull(),
    canonicalPath: text("canonical_path").notNull(),
    targetPath: text("target_path"),
    transformName: text("transform_name"),
    defaultValue: text("default_value"),
    isRequired: boolean("is_required").notNull().default(false),
    lookupTable: text("lookup_table"),
  },
  (t) => [unique("uq_fieldmap_flow_seq").on(t.tenantId, t.flowId, t.seq)],
);

/* -------------------------------------------------------------------------- */
/*  What actually happened                                                    */
/* -------------------------------------------------------------------------- */

export const messageLog = pgTable(
  "message_log",
  {
    ...tenantScopedColumns,
    flowId: uuid("flow_id").notNull(),
    correlationId: text("correlation_id").notNull(),
    direction: text("direction").notNull(),
    entityRef: text("entity_ref"),
    status: text("status").notNull(), // pending | in_flight | success | failed | dead_lettered
    latencyMs: integer("latency_ms"),
    payloadRedacted: jsonb("payload_redacted"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    attemptCount: integer("attempt_count").notNull().default(0),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ix_msglog_tenant_corr").on(t.tenantId, t.correlationId),
    index("ix_msglog_tenant_flow_ts").on(t.tenantId, t.flowId, t.ts),
  ],
);

// Every attempt, separately. "It failed" and "it timed out and may have succeeded" need
// different handling, and only the attempt history tells them apart.
export const deliveryAttempt = pgTable(
  "delivery_attempt",
  {
    ...tenantScopedColumns,
    messageLogId: uuid("message_log_id"),
    webhookDeliveryId: uuid("webhook_delivery_id"),
    attemptNo: integer("attempt_no").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    outcome: text("outcome").notNull(), // success | retryable | fatal
    errorCategory: text("error_category"),
    responseCode: integer("response_code"),
    errorDetail: text("error_detail"),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  },
  (t) => [index("ix_attempt_tenant_msg").on(t.tenantId, t.messageLogId)],
);

export const deadLetter = pgTable(
  "dead_letter",
  {
    ...tenantScopedColumns,
    flowId: uuid("flow_id").notNull(),
    correlationId: text("correlation_id").notNull(),
    sourceRef: text("source_ref"),
    errorCategory: text("error_category").notNull(),
    triageAction: text("triage_action").notNull(), // from the deterministic table
    severity: text("severity").notNull(),
    replayable: boolean("replayable").notNull().default(false),
    /** True when the far side may already have acted on this message. */
    sideEffectPossible: boolean("side_effect_possible").notNull().default(false),
    isStatutory: boolean("is_statutory").notNull().default(false),
    payloadRedacted: jsonb("payload_redacted"),
    attempts: integer("attempts").notNull().default(0),
    status: text("status").notNull().default("new"), // new | retrying | resolved | ignored
    assignedTo: uuid("assigned_to"),
    resolutionNote: text("resolution_note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("ix_dlq_tenant_status").on(t.tenantId, t.status, t.severity)],
);

/* -------------------------------------------------------------------------- */
/*  Webhooks                                                                  */
/* -------------------------------------------------------------------------- */

export const webhookSubscription = pgTable(
  "webhook_subscription",
  {
    ...tenantScopedColumns,
    subscriberName: text("subscriber_name").notNull(),
    targetUrl: text("target_url").notNull(),
    eventNames: jsonb("event_names").notNull().default([]),
    secretCredentialId: uuid("secret_credential_id"),
    previousSecretCredentialId: uuid("previous_secret_credential_id"),
    rotationGraceUntil: timestamp("rotation_grace_until", { withTimezone: true }),
    status: text("status").notNull().default("active"), // active | paused | auto_paused
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
  },
  (t) => [unique("uq_webhooksub_tenant_name").on(t.tenantId, t.subscriberName)],
);

export const webhookDelivery = pgTable(
  "webhook_delivery",
  {
    ...tenantScopedColumns,
    subscriptionId: uuid("subscription_id").notNull(),
    eventId: uuid("event_id").notNull(),
    eventName: text("event_name").notNull(),
    attemptNo: integer("attempt_no").notNull().default(1),
    signatureTs: integer("signature_ts").notNull(),
    responseCode: integer("response_code"),
    responseTimeMs: integer("response_time_ms"),
    status: text("status").notNull().default("retrying"), // delivered | retrying | failed | dead
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_delivery_sub_event").on(t.tenantId, t.subscriptionId, t.eventId),
    index("ix_delivery_tenant_status").on(t.tenantId, t.status),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Statutory pipelines                                                       */
/* -------------------------------------------------------------------------- */

export const einvoiceIrnLog = pgTable(
  "einvoice_irn_log",
  {
    ...tenantScopedColumns,
    invoiceRef: text("invoice_ref").notNull(),
    gstin: text("gstin").notNull(),
    buyerGstin: text("buyer_gstin"),
    /** From 1 Aug 2026 the IRP requires this; 'URP' is valid for an unregistered ship-to. */
    shipToGstin: text("ship_to_gstin"),
    docType: text("doc_type").notNull().default("INV"),
    docDate: date("doc_date").notNull(),
    fy: text("fy").notNull(),
    taxableValue: numeric("taxable_value", { precision: 14, scale: 2 }).notNull(),
    totalValue: numeric("total_value", { precision: 14, scale: 2 }).notNull(),
    status: text("status").notNull().default("pending"),
    irn: text("irn"),
    ackNo: text("ack_no"),
    ackDate: timestamp("ack_date", { withTimezone: true }),
    signedInvoiceRef: text("signed_invoice_ref"),
    signedQrRef: text("signed_qr_ref"),
    // The 30-day window: a cliff, not a slope. Past it the invoice can never be reported.
    windowApplicable: boolean("window_applicable").notNull().default(false),
    windowDeadlineAt: date("window_deadline_at"),
    windowAlertLevel: integer("window_alert_level").notNull().default(0),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    reportedWithinWindow: boolean("reported_within_window"),
    attempts: integer("attempts").notNull().default(0),
    lastIdempotencyKey: text("last_idempotency_key"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    correlationId: text("correlation_id").notNull(),
  },
  (t) => [
    unique("uq_irn_document").on(t.tenantId, t.gstin, t.docType, t.invoiceRef, t.fy),
    index("ix_irn_window").on(t.tenantId, t.windowDeadlineAt),
  ],
);

export const ewaybillLog = pgTable(
  "ewaybill_log",
  {
    ...tenantScopedColumns,
    shipmentRef: text("shipment_ref").notNull(),
    invoiceRef: text("invoice_ref"),
    irn: text("irn"),
    ewbNo: text("ewb_no"),
    consignmentValue: numeric("consignment_value", { precision: 14, scale: 2 }).notNull(),
    distanceKm: integer("distance_km").notNull(),
    validUpto: timestamp("valid_upto", { withTimezone: true }),
    vehicleNo: text("vehicle_no"),
    transporterGstin: text("transporter_gstin"),
    shipToGstin: text("ship_to_gstin"),
    billToState: text("bill_to_state"),
    shipToState: text("ship_to_state"),
    /** Which portal generated it. A bill made on ewb2 must be cancelled on ewb2. */
    portalUsed: text("portal_used").notNull().default("ewb1"),
    status: text("status").notNull().default("pending"),
    closureStatus: text("closure_status").notNull().default("not_closed"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closureRemarks: text("closure_remarks"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    correlationId: text("correlation_id").notNull(),
  },
  (t) => [unique("uq_ewb_tenant_shipment").on(t.tenantId, t.shipmentRef)],
);

/* -------------------------------------------------------------------------- */
/*  Scheduling, telemetry, inbound clients                                    */
/* -------------------------------------------------------------------------- */

export const integrationSchedule = pgTable(
  "integration_schedule",
  {
    ...tenantScopedColumns,
    flowId: uuid("flow_id").notNull(),
    cronExpr: text("cron_expr"),
    intervalSec: integer("interval_sec"),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    blackoutWindows: jsonb("blackout_windows").notNull().default([]),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => [unique("uq_schedule_flow").on(t.tenantId, t.flowId)],
);

export const syncJob = pgTable(
  "sync_job",
  {
    ...tenantScopedColumns,
    flowId: uuid("flow_id").notNull(),
    mode: text("mode").notNull().default("delta"), // delta | full | replay
    watermark: text("watermark"),
    recordsRead: integer("records_read").notNull().default(0),
    recordsWritten: integer("records_written").notNull().default(0),
    recordsFailed: integer("records_failed").notNull().default(0),
    status: text("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    triggeredBy: text("triggered_by").notNull().default("schedule"),
  },
  (t) => [index("ix_syncjob_tenant_flow").on(t.tenantId, t.flowId, t.startedAt)],
);

export const messageMetric = pgTable(
  "message_metric",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    flowId: uuid("flow_id").notNull(),
    minute: timestamp("minute", { withTimezone: true }).notNull(),
    countOk: integer("count_ok").notNull().default(0),
    countErr: integer("count_err").notNull().default(0),
    p50Ms: integer("p50_ms"),
    p95Ms: integer("p95_ms"),
    backlog: integer("backlog").notNull().default(0),
  },
  (t) => [unique("uq_metric_flow_minute").on(t.tenantId, t.flowId, t.minute)],
);

// Inbound API consumers. Distinct from ADMINISTRATION's `api_key`: that one is a person's
// or a device's key into the ERP, this one is a partner system calling the integration
// gateway, with a quota and a rate limit rather than a role.
export const apiClient = pgTable(
  "api_client",
  {
    ...tenantScopedColumns,
    clientId: text("client_id").notNull(),
    name: text("name").notNull(),
    secretHash: text("secret_hash").notNull(),
    authType: text("auth_type").notNull().default("hmac"),
    scopes: jsonb("scopes").notNull().default([]),
    rateLimitPerMin: integer("rate_limit_per_min").notNull().default(60),
    quotaPerDay: integer("quota_per_day").notNull().default(10_000),
    status: text("status").notNull().default("active"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [unique("uq_apiclient_id").on(t.clientId)],
);
