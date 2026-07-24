import {
  bigint,
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Platform tables (DECISIONS-V2 §5.2) — owned centrally by HEXA (GENERAL/ADMIN),
 * cross-referenced by every module, NEVER redefined elsewhere.
 */

// The tenant registry is deliberately NOT tenant-scoped and NOT under RLS (§5.2).
export const tenant = pgTable("tenant", {
  id: uuid("id").primaryKey(),
  legalName: text("legal_name").notNull(),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Transactional outbox (§5.4): staged in the same tx as the domain write.
export const outboxEvent = pgTable(
  "outbox_event",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(), // module.entity.verb.vN
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    attempts: bigint("attempts", { mode: "number" }).notNull().default(0),
  },
  (t) => [index("ix_outbox_unpublished").on(t.tenantId, t.createdAt)],
);

// Hash-chained, append-only audit log (§3.3): 8-year, non-disableable. The
// prev_hash/hash pair is the tamper-evidence; UPDATE/DELETE are blocked by trigger.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    seq: bigint("seq", { mode: "number" }).notNull(), // per-tenant monotonic chain order
    actorId: uuid("actor_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    data: jsonb("data").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    prevHash: char("prev_hash", { length: 64 }).notNull(),
    hash: char("hash", { length: 64 }).notNull(),
  },
  (t) => [unique("uq_audit_tenant_seq").on(t.tenantId, t.seq)],
);

// The "no-duplicates notebook" (DECISIONS-V2 §5.3 Idempotency-Key). One row per
// (tenant, key): remembers a fingerprint of the request + the answer already given,
// so a retried request replays that answer instead of doing the work twice.
export const idempotencyKey = pgTable(
  "idempotency_key",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    key: text("key").notNull(), // the client's Idempotency-Key header value
    fingerprint: char("fingerprint", { length: 64 }).notNull(), // sha256 of the request body
    status: text("status").notNull(), // pending | completed
    responseStatus: integer("response_status"), // the saved HTTP status
    responseBody: jsonb("response_body"), // the saved answer
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("uq_idem_tenant_key").on(t.tenantId, t.key)],
);

// Consumer-side dedup ledger for the outbox relay (§5.4). One row per (consumer,
// event) actually handled; the unique key turns a redelivery into a no-op, so the
// bus's at-least-once guarantee becomes an exactly-once EFFECT. Append-only.
export const eventConsumption = pgTable(
  "event_consumption",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    consumer: text("consumer").notNull(), // logical subscriber name
    eventId: uuid("event_id").notNull(), // the outbox_event id acknowledged
    eventName: text("event_name").notNull(), // module.entity.verb.vN
    consumedAt: timestamp("consumed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("uq_event_consumption").on(t.tenantId, t.consumer, t.eventId)],
);

// Every AI action is logged (§4.3), even explanation calls. Hash-chained per tenant
// (seq/prev_hash/hash), append-only, non-disableable — the same tamper-evidence the
// audit log and workflow trail carry. Content hashes (input/output) keep prompts and
// PII out of the log while proving what was sent/returned.
export const aiActionLog = pgTable(
  "ai_action_log",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    seq: bigint("seq", { mode: "number" }).notNull(), // per-tenant chain order
    featureKey: text("feature_key").notNull(), // must exist in the closed registry (§4.2)
    actorId: uuid("actor_id").notNull(),
    inputHash: char("input_hash", { length: 64 }).notNull(),
    outputHash: char("output_hash", { length: 64 }),
    decision: jsonb("decision"),
    model: text("model"), // concrete model id used (e.g. stub-deterministic, gpt-5-nano)
    tier: text("tier"), // small | premium
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
    outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
    degraded: boolean("degraded").notNull().default(false),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    prevHash: char("prev_hash", { length: 64 }).notNull(),
    hash: char("hash", { length: 64 }).notNull(),
  },
  (t) => [unique("uq_ai_action_tenant_seq").on(t.tenantId, t.seq)],
);
