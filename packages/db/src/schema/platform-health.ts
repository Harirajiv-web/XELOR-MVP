import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * Append-only evidence from ACHILES platform checks.
 *
 * This is deliberately separate from RELAY's customer-facing incident model. ACHILES
 * observes technical availability and latency; RELAY decides how an observed failure is
 * coordinated and communicated. Keeping the raw check as immutable evidence prevents a
 * later status update from rewriting what the monitor actually saw.
 */
export const platformHealthRun = pgTable(
  "platform_health_run",
  {
    ...tenantScopedColumns,
    trigger: text("trigger").notNull(),
    overallStatus: text("overall_status").notNull(),
    summary: text("summary").notNull(),
    checks: jsonb("checks").notNull().default([]),
    durationMs: integer("duration_ms").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("ix_platformhealth_tenant_time").on(t.tenantId, t.completedAt),
    index("ix_platformhealth_tenant_status").on(
      t.tenantId,
      t.overallStatus,
      t.completedAt,
    ),
  ],
);
