import {
  boolean,
  date,
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
 * THE AUTONOMOUS ORDER-FULFILMENT MISSION (migration 0094).
 *
 * See the migration for why the shape is what it is. The short version: the Agent OS graphs
 * are bounded REVIEWS, and a customer commitment is not a review. It outlives any run, it
 * waits on other people, and its plan is invalidated by things nobody scheduled — so the
 * durable thing has to be the commitment rather than the execution.
 *
 * The columns worth noticing from a reader's point of view are the ones that are kept
 * APART where a smaller design would have merged them:
 *
 *   `executed_at` / `verified_at`   — the capability returned, versus the world actually
 *                                     changed. Merging them is how a mission reports having
 *                                     reserved stock that was never reserved.
 *   `candidates` / `chosen`         — what was considered survives, not just what won. An
 *                                     investor asking "what else did it look at?" is asking
 *                                     the question the whole demo exists to answer.
 *   `impact` on an event            — "we saw it and it did not matter" is a recorded
 *                                     decision, not the same as never having seen it.
 */

/** The commitment. One live mission per sales order — see `uq_fmission_one_live_per_order`. */
export const fulfilmentMission = pgTable(
  "fulfilment_mission",
  {
    ...tenantScopedColumns,
    missionNo: text("mission_no").notNull(),
    salesOrderId: uuid("sales_order_id").notNull(),
    soNo: text("so_no").notNull(),
    customerName: text("customer_name").notNull(),
    /** Promised product, quantity, destination, constraints and completion criteria. */
    objective: jsonb("objective").notNull(),
    promisedDate: date("promised_date").notNull(),
    targetMarginPct: numeric("target_margin_pct", { precision: 9, scale: 4 }).notNull(),
    /** How much this mission may do without asking. A0–A5; see the autonomy matrix. */
    autonomyTier: text("autonomy_tier").notNull().default("A3"),
    status: text("status").notNull().default("planning"),
    stage: text("stage").notNull().default("intake"),
    currentPlanVersion: integer("current_plan_version").notNull().default(0),
    deliveryConfidence: numeric("delivery_confidence", { precision: 5, scale: 2 }),
    forecastMarginPct: numeric("forecast_margin_pct", { precision: 9, scale: 4 }),
    forecastDate: date("forecast_date"),
    nextEventAt: timestamp("next_event_at", { withTimezone: true }),
    waitingReason: text("waiting_reason"),
    outcome: jsonb("outcome"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_fmission_tenant_no").on(t.tenantId, t.missionNo),
    index("ix_fmission_tenant_status").on(t.tenantId, t.status),
  ],
);

/**
 * A frozen executable proposal. Never edited — superseded.
 *
 * `digest` is what an approval binds to. If the plan could be altered after approval, the
 * approval would attest to whatever the plan later became, which is the opposite of what
 * an approval is for. A database trigger enforces the freeze; the digest makes a violation
 * detectable even if the trigger were ever dropped.
 */
export const fulfilmentPlanVersion = pgTable(
  "fulfilment_plan_version",
  {
    ...tenantScopedColumns,
    missionId: uuid("mission_id").notNull(),
    versionNo: integer("version_no").notNull(),
    strategyKey: text("strategy_key").notNull(),
    strategyName: text("strategy_name").notNull(),
    digest: text("digest").notNull(),
    /** Every strategy that was evaluated, feasible or not, with why. */
    candidates: jsonb("candidates").notNull(),
    chosen: jsonb("chosen").notNull(),
    rationale: text("rationale").notNull(),
    tradeOffWeights: jsonb("trade_off_weights").notNull(),
    hardConstraints: jsonb("hard_constraints").notNull(),
    feasible: boolean("feasible").notNull(),
    critique: jsonb("critique"),
    expectedDate: date("expected_date").notNull(),
    expectedCost: numeric("expected_cost", { precision: 18, scale: 2 }).notNull(),
    expectedMarginPct: numeric("expected_margin_pct", { precision: 9, scale: 4 }).notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull(),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    supersedeReason: text("supersede_reason"),
  },
  (t) => [
    unique("uq_fplan_mission_version").on(t.tenantId, t.missionId, t.versionNo),
    index("ix_fplan_tenant_mission").on(t.tenantId, t.missionId),
  ],
);

/** What the mission did, in order — the stream an investor watches. */
export const fulfilmentStep = pgTable(
  "fulfilment_step",
  {
    ...tenantScopedColumns,
    missionId: uuid("mission_id").notNull(),
    planVersionId: uuid("plan_version_id"),
    seq: integer("seq").notNull(),
    stepKey: text("step_key").notNull(),
    title: text("title").notNull(),
    kind: text("kind").notNull(),
    agentKey: text("agent_key").notNull(),
    /** The scoped question this step was asked. Absent for mechanical steps. */
    question: text("question"),
    status: text("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    /** The rows actually read, with their provenance and freshness. */
    evidence: jsonb("evidence"),
    findings: jsonb("findings"),
    narration: text("narration"),
    confidence: numeric("confidence", { precision: 5, scale: 2 }),
    refusedReason: text("refused_reason"),
  },
  (t) => [
    unique("uq_fstep_mission_seq").on(t.tenantId, t.missionId, t.seq),
    index("ix_fstep_tenant_mission").on(t.tenantId, t.missionId, t.seq),
  ],
);

/** A governed change to business state. `executed` and `verified` are separate claims. */
export const fulfilmentAction = pgTable(
  "fulfilment_action",
  {
    ...tenantScopedColumns,
    missionId: uuid("mission_id").notNull(),
    planVersionId: uuid("plan_version_id").notNull(),
    stepId: uuid("step_id"),
    actionNo: text("action_no").notNull(),
    actionType: text("action_type").notNull(),
    targetDomain: text("target_domain").notNull(),
    title: text("title").notNull(),
    params: jsonb("params").notNull(),
    digest: text("digest").notNull(),
    autonomyTier: text("autonomy_tier").notNull(),
    status: text("status").notNull().default("proposed"),
    precondition: jsonb("precondition"),
    approvalId: uuid("approval_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    result: jsonb("result"),
    resultRef: text("result_ref"),
    postcondition: jsonb("postcondition"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verified: boolean("verified"),
    failureReason: text("failure_reason"),
    compensatedAt: timestamp("compensated_at", { withTimezone: true }),
    compensationRef: text("compensation_ref"),
  },
  (t) => [
    unique("uq_faction_tenant_no").on(t.tenantId, t.actionNo),
    unique("uq_faction_idempotency").on(t.tenantId, t.idempotencyKey),
    index("ix_faction_tenant_mission").on(t.tenantId, t.missionId),
  ],
);

/** Something happened. Internal or simulated-external, always with its impact analysis. */
export const fulfilmentEvent = pgTable(
  "fulfilment_event",
  {
    ...tenantScopedColumns,
    missionId: uuid("mission_id"),
    /** Idempotency: the same supplier message delivered twice wakes the mission once. */
    eventKey: text("event_key").notNull(),
    eventName: text("event_name").notNull(),
    source: text("source").notNull(),
    simulated: boolean("simulated").notNull().default(false),
    payload: jsonb("payload").notNull(),
    impact: jsonb("impact"),
    disposition: text("disposition"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    handledAt: timestamp("handled_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_fevent_tenant_key").on(t.tenantId, t.eventKey),
    index("ix_fevent_tenant_mission").on(t.tenantId, t.missionId),
  ],
);

/** A decision brief and its attributable answer. */
export const fulfilmentApproval = pgTable(
  "fulfilment_approval",
  {
    ...tenantScopedColumns,
    missionId: uuid("mission_id").notNull(),
    planVersionId: uuid("plan_version_id").notNull(),
    approvalNo: text("approval_no").notNull(),
    title: text("title").notNull(),
    risk: text("risk").notNull(),
    autonomyTier: text("autonomy_tier").notNull(),
    /** Objective at risk, what changed, options, recommendation, consequences of delay. */
    brief: jsonb("brief").notNull(),
    planDigest: text("plan_digest").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    requestedBy: uuid("requested_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    decision: text("decision"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: uuid("decided_by"),
    decisionNote: text("decision_note"),
  },
  (t) => [
    unique("uq_fapproval_tenant_no").on(t.tenantId, t.approvalNo),
    index("ix_fapproval_tenant_mission").on(t.tenantId, t.missionId),
  ],
);

/** An explicit statement that a quantity passed quality and may ship (migration 0093). */
export const qualityRelease = pgTable(
  "quality_release",
  {
    ...tenantScopedColumns,
    releaseNo: text("release_no").notNull(),
    salesOrderLineId: uuid("sales_order_line_id"),
    productionOrderId: uuid("production_order_id"),
    inspectionId: uuid("inspection_id").notNull(),
    itemId: uuid("item_id").notNull(),
    qtyReleased: numeric("qty_released", { precision: 18, scale: 3 }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }).notNull().defaultNow(),
    releasedBy: uuid("released_by").notNull(),
    /** Which inspection, and on what basis, permitted this quantity to ship. */
    basis: text("basis").notNull(),
  },
  (t) => [
    unique("uq_qrelease_tenant_no").on(t.tenantId, t.releaseNo),
    index("ix_qrelease_tenant_so_line").on(t.tenantId, t.salesOrderLineId),
  ],
);
