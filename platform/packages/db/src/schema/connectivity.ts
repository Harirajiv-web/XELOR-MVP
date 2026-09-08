import { index, jsonb, pgTable, text, timestamp, uuid, unique } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

export const manufacturingConnection = pgTable("manufacturing_connection", {
  ...tenantScopedColumns,
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  baseUrl: text("base_url"),
  credentialsEncrypted: text("credentials_encrypted"),
  settings: jsonb("settings").notNull().default({}),
  status: text("status").notNull().default("configured"),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
}, (t) => [unique("uq_manufacturing_connection_tenant_id").on(t.tenantId, t.id), index("ix_manufacturing_connection_tenant_kind").on(t.tenantId, t.kind)]);

export const manufacturingSnapshot = pgTable("manufacturing_snapshot", {
  ...tenantScopedColumns,
  connectionId: uuid("connection_id").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  evidence: jsonb("evidence").notNull(),
  warnings: jsonb("warnings").notNull().default([]),
  fingerprint: text("fingerprint").notNull(),
}, (t) => [index("ix_manufacturing_snapshot_tenant_connection").on(t.tenantId, t.connectionId, t.createdAt), unique("uq_manufacturing_snapshot_tenant_id").on(t.tenantId, t.id)]);

export const manufacturingDecision = pgTable("manufacturing_decision", {
  ...tenantScopedColumns,
  connectionId: uuid("connection_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  decisionType: text("decision_type").notNull(),
  request: jsonb("request").notNull(),
  result: jsonb("result").notNull(),
}, (t) => [index("ix_manufacturing_decision_tenant_time").on(t.tenantId, t.createdAt)]);

export const manufacturingOutcome = pgTable("manufacturing_outcome", {
  ...tenantScopedColumns,
  measurement: jsonb("measurement").notNull(),
}, (t) => [index("ix_manufacturing_outcome_tenant_time").on(t.tenantId, t.createdAt)]);
