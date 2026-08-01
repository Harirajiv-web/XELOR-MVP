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

/** Versioned, immutable-at-runtime execution plans registered by the application. */
export const agentGraphDefinition = pgTable(
  "agent_graph_definition",
  {
    ...tenantScopedColumns,
    graphKey: text("graph_key").notNull(),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    spec: jsonb("spec").notNull(),
    contentHash: text("content_hash").notNull(),
    status: text("status").notNull().default("active"),
  },
  (t) => [
    unique("uq_agentgraph_tenant_key_version").on(
      t.tenantId,
      t.graphKey,
      t.version,
    ),
    index("ix_agentgraph_tenant_status").on(t.tenantId, t.status),
  ],
);

/** One durable attempt to achieve a user goal through a frozen graph version. */
export const agentRun = pgTable(
  "agent_run",
  {
    ...tenantScopedColumns,
    graphKey: text("graph_key").notNull(),
    graphVersion: integer("graph_version").notNull(),
    goal: text("goal").notNull(),
    input: jsonb("input").notNull().default({}),
    graphSnapshot: jsonb("graph_snapshot").notNull(),
    status: text("status").notNull().default("pending"),
    providerMode: text("provider_mode").notNull().default("deterministic"),
    maxSteps: integer("max_steps").notNull(),
    consumedSteps: integer("consumed_steps").notNull().default(0),
    timeoutAt: timestamp("timeout_at", { withTimezone: true }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    output: jsonb("output"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_agentrun_tenant_idem").on(t.tenantId, t.idempotencyKey),
    index("ix_agentrun_tenant_status_time").on(
      t.tenantId,
      t.status,
      t.createdAt,
    ),
  ],
);

/** Current status and structured evidence for one graph node. */
export const agentNodeRun = pgTable(
  "agent_node_run",
  {
    ...tenantScopedColumns,
    runId: uuid("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    nodeName: text("node_name").notNull(),
    nodeKind: text("node_kind").notNull(),
    agentKey: text("agent_key"),
    capabilityKey: text("capability_key"),
    status: text("status").notNull().default("pending"),
    attempt: integer("attempt").notNull().default(0),
    input: jsonb("input").notNull().default({}),
    output: jsonb("output"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_agentnode_run_node").on(t.tenantId, t.runId, t.nodeId),
    index("ix_agentnode_run_status").on(t.tenantId, t.runId, t.status),
  ],
);

/** Append-only snapshots used to explain and resume execution after a process restart. */
export const agentCheckpoint = pgTable(
  "agent_checkpoint",
  {
    ...tenantScopedColumns,
    runId: uuid("run_id").notNull(),
    sequence: integer("sequence").notNull(),
    reason: text("reason").notNull(),
    state: jsonb("state").notNull(),
  },
  (t) => [
    unique("uq_agentcheckpoint_run_seq").on(t.tenantId, t.runId, t.sequence),
    index("ix_agentcheckpoint_run_time").on(t.tenantId, t.runId, t.createdAt),
  ],
);

/** A human decision boundary. Proposed actions remain data until this row is approved. */
export const agentApproval = pgTable(
  "agent_approval",
  {
    ...tenantScopedColumns,
    runId: uuid("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    title: text("title").notNull(),
    risk: text("risk").notNull(),
    proposedAction: text("proposed_action").notNull(),
    proposed: jsonb("proposed").notNull(),
    status: text("status").notNull().default("pending"),
    decisionNote: text("decision_note"),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_agentapproval_run_node").on(t.tenantId, t.runId, t.nodeId),
    index("ix_agentapproval_tenant_status").on(
      t.tenantId,
      t.status,
      t.createdAt,
    ),
  ],
);

/** Append-only operational trace; payloads contain structured metadata, not chain-of-thought. */
export const agentRunEvent = pgTable(
  "agent_run_event",
  {
    ...tenantScopedColumns,
    runId: uuid("run_id").notNull(),
    sequence: integer("sequence").notNull(),
    eventType: text("event_type").notNull(),
    nodeId: text("node_id"),
    payload: jsonb("payload").notNull().default({}),
  },
  (t) => [
    unique("uq_agentevent_run_seq").on(t.tenantId, t.runId, t.sequence),
    index("ix_agentevent_run_time").on(t.tenantId, t.runId, t.createdAt),
  ],
);

/**
 * Immutable proof that an approved agent action crossed the execution boundary.
 *
 * Phase 3 deliberately dispatches governed work items instead of granting a model arbitrary
 * transaction access. A domain-specific executor can consume one of these records later;
 * the approval, originating mission, responsible agent and exact payload remain attributable.
 */
export const agentActionDispatch = pgTable(
  "agent_action_dispatch",
  {
    ...tenantScopedColumns,
    runId: uuid("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    approvalNodeId: text("approval_node_id").notNull(),
    agentKey: text("agent_key").notNull(),
    targetDomain: text("target_domain").notNull(),
    actionType: text("action_type").notNull(),
    title: text("title").notNull(),
    risk: text("risk").notNull(),
    executionMode: text("execution_mode").notNull().default("governed_work_item"),
    payload: jsonb("payload").notNull().default({}),
    status: text("status").notNull().default("dispatched"),
    approvedBy: uuid("approved_by").notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_agentaction_run_node").on(t.tenantId, t.runId, t.nodeId),
    index("ix_agentaction_tenant_time").on(
      t.tenantId,
      t.dispatchedAt,
    ),
  ],
);

/**
 * A durable, tenant-fenced relationship between business evidence used by a decision.
 * Source systems keep ownership of their records; this stores provenance and the reason
 * two records matter together, never a private copy of the complete source document.
 */
export const decisionEvidenceLink = pgTable(
  "decision_evidence_link",
  {
    ...tenantScopedColumns,
    decisionKey: text("decision_key").notNull(),
    missionRunId: uuid("mission_run_id"),
    relationType: text("relation_type").notNull(),
    sourceDomain: text("source_domain").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceRef: text("source_ref"),
    targetDomain: text("target_domain").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    targetRef: text("target_ref"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull().default("1"),
    evidence: jsonb("evidence").notNull().default({}),
  },
  (t) => [
    unique("uq_decisionevidence_relationship").on(
      t.tenantId,
      t.decisionKey,
      t.relationType,
      t.sourceType,
      t.sourceId,
      t.targetType,
      t.targetId,
    ),
    index("ix_decisionevidence_tenant_decision").on(t.tenantId, t.decisionKey),
    index("ix_decisionevidence_tenant_source").on(t.tenantId, t.sourceDomain, t.sourceType, t.sourceId),
  ],
);

/**
 * A value claim is not a marketing number. It starts as a baseline/target, then records an
 * observed result and explicit verification state. Only verified rows count as value XELOR
 * can report to a customer.
 */
export const decisionOutcomeMetric = pgTable(
  "decision_outcome_metric",
  {
    ...tenantScopedColumns,
    decisionKey: text("decision_key").notNull(),
    missionRunId: uuid("mission_run_id"),
    actionDispatchId: uuid("action_dispatch_id"),
    metricKey: text("metric_key").notNull(),
    label: text("label").notNull(),
    unit: text("unit").notNull(),
    baselineValue: numeric("baseline_value", { precision: 20, scale: 4 }),
    targetValue: numeric("target_value", { precision: 20, scale: 4 }),
    observedValue: numeric("observed_value", { precision: 20, scale: 4 }),
    estimatedValue: numeric("estimated_value", { precision: 20, scale: 2 }),
    verifiedValue: numeric("verified_value", { precision: 20, scale: 2 }),
    verificationStatus: text("verification_status").notNull().default("unverified"),
    attributionStatus: text("attribution_status").notNull().default("not_assessed"),
    verificationMethod: text("verification_method"),
    verifiedBy: uuid("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    evidence: jsonb("evidence").notNull().default({}),
  },
  (t) => [
    unique("uq_decisionoutcome_metric").on(t.tenantId, t.decisionKey, t.metricKey),
    index("ix_decisionoutcome_tenant_status").on(t.tenantId, t.verificationStatus, t.createdAt),
    index("ix_decisionoutcome_tenant_run").on(t.tenantId, t.missionRunId),
  ],
);
