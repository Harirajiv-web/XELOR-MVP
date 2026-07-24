import {
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
import { tenantScopedColumns } from "./columns.js";

/**
 * ADMINISTRATION's W1 approval engine (DECISIONS-V2 §1.3). Deliberately minimal:
 * states, transitions, approver resolution, and SLA timers ONLY. No branches/sagas.
 * Exposed behind a WorkflowExecutor port so Temporal could replace it later.
 */

// A reusable, VERSIONED approval template. Steps are an ordered list; a running
// instance pins to one version, so publishing a new version never mutates in-flight
// approvals.
export interface WorkflowStep {
  seq: number;
  name: string;
  approverType: "role" | "user";
  approverRef: string; // a role code, or a Keycloak subject
  slaHours: number;
}

export const workflowDefinition = pgTable(
  "workflow_definition",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(), // e.g. po_approval
    version: integer("version").notNull(),
    name: text("name").notNull(),
    subjectType: text("subject_type").notNull(), // what gets approved, e.g. purchase_order
    steps: jsonb("steps").$type<WorkflowStep[]>().notNull(),
  },
  (t) => [unique("uq_wfdef_code_ver").on(t.tenantId, t.code, t.version)],
);

// A live approval in progress for one document (subject).
export const workflowInstance = pgTable(
  "workflow_instance",
  {
    ...tenantScopedColumns,
    definitionId: uuid("definition_id").notNull(), // pins the version (intra-module FK)
    definitionCode: text("definition_code").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(), // logical ref to the document
    currentStepSeq: integer("current_step_seq").notNull(),
    status: text("status").notNull(), // pending | approved | rejected | cancelled
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }), // deadline for the current step
    initiatedBy: uuid("initiated_by").notNull(),
  },
  (t) => [
    index("ix_wfinst_status").on(t.tenantId, t.status),
    index("ix_wfinst_subject").on(t.tenantId, t.subjectType, t.subjectId),
  ],
);

// Tamper-proof, append-only trail of every action on an instance (hash-chained per
// instance, exactly like the audit log). This is the legal record of who signed off.
export const workflowAction = pgTable(
  "workflow_action",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    instanceId: uuid("instance_id").notNull(),
    seq: integer("seq").notNull(), // per-instance chain order
    action: text("action").notNull(), // submit | approve | reject | cancel
    stepSeq: integer("step_seq").notNull(),
    actorId: uuid("actor_id").notNull(),
    comment: text("comment"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    prevHash: char("prev_hash", { length: 64 }).notNull(),
    hash: char("hash", { length: 64 }).notNull(),
  },
  (t) => [unique("uq_wfaction_seq").on(t.tenantId, t.instanceId, t.seq)],
);
