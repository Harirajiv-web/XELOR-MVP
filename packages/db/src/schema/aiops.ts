import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * AI OPERATIONS (ONYX, Module 16) — the control plane for the AI itself.
 *
 * The platform already had a router, a governed feature registry, a hash-chained action log
 * and per-tenant governance. Those are the *mechanism*. This module is the *operations*
 * plane over them: who may turn a feature on, what prompt is serving, which provider
 * answered and from which region, what it cost, whether the eval gate passed, what left the
 * building, and how to stop all of it in under a minute.
 *
 * The organising principle, stated once because everything here follows from it:
 * **the AI cannot ship itself.** Every promotion, rollout and rollback is a human action
 * with a name, a reason and an audit row — the same rule Administration applies to access,
 * applied to the thing that would otherwise change what the system says to everybody.
 */

/* -------------------------------------------------------------------------- */
/*  Providers, models, prices                                                 */
/* -------------------------------------------------------------------------- */

export const aiProvider = pgTable(
  "ai_provider",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // hosted | edge | stub
    /** Where this provider actually serves from. Checked at edit, activation and call time. */
    region: text("region").notNull(),
    endpointRef: text("endpoint_ref"),
    credentialRef: text("credential_ref"),
    status: text("status").notNull().default("active"),
    /** Contractual assertion that golden sets are excluded from training. */
    trainingExclusionConfirmed: boolean("training_exclusion_confirmed").notNull().default(false),
  },
  (t) => [unique("uq_aiprovider_tenant_code").on(t.tenantId, t.code)],
);

export const aiModel = pgTable(
  "ai_model",
  {
    ...tenantScopedColumns,
    providerId: uuid("provider_id").notNull(),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    tier: text("tier").notNull().default("small"), // small | premium | local
    contextTokens: integer("context_tokens"),
    status: text("status").notNull().default("active"),
  },
  (t) => [unique("uq_aimodel_tenant_code").on(t.tenantId, t.code)],
);

// Effective-dated, append-only in spirit: a price change is a new row, so a call made in
// May is still costed at May's rate when the report is run in September.
export const aiModelPrice = pgTable(
  "ai_model_price",
  {
    ...tenantScopedColumns,
    modelCode: text("model_code").notNull(),
    inputPer1k: numeric("input_per_1k", { precision: 12, scale: 4 }).notNull(),
    outputPer1k: numeric("output_per_1k", { precision: 12, scale: 4 }).notNull(),
    currency: text("currency").notNull().default("INR"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    sourceNote: text("source_note").notNull(),
  },
  (t) => [index("ix_aiprice_tenant_model").on(t.tenantId, t.modelCode, t.effectiveFrom)],
);

/* -------------------------------------------------------------------------- */
/*  Routing                                                                   */
/* -------------------------------------------------------------------------- */

export const aiRoutePolicy = pgTable(
  "ai_route_policy",
  {
    ...tenantScopedColumns,
    featureKey: text("feature_key").notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("draft"), // draft | active | retired
    allowedRegions: jsonb("allowed_regions").notNull().default([]),
    activatedBy: uuid("activated_by"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
  },
  (t) => [unique("uq_airoute_feature_version").on(t.tenantId, t.featureKey, t.version)],
);

export const aiRouteStep = pgTable(
  "ai_route_step",
  {
    ...tenantScopedColumns,
    policyId: uuid("policy_id").notNull(),
    stepOrder: integer("step_order").notNull(),
    kind: text("kind").notNull(), // model | deterministic
    providerCode: text("provider_code"),
    modelCode: text("model_code"),
    region: text("region"),
    /** What the deterministic step does, in words a person can check. */
    fallbackDescription: text("fallback_description"),
  },
  (t) => [unique("uq_airoutestep").on(t.tenantId, t.policyId, t.stepOrder)],
);

/* -------------------------------------------------------------------------- */
/*  Prompts                                                                   */
/* -------------------------------------------------------------------------- */

export const aiPromptVersion = pgTable(
  "ai_prompt_version",
  {
    ...tenantScopedColumns,
    featureKey: text("feature_key").notNull(),
    version: integer("version").notNull(),
    stage: text("stage").notNull().default("draft"), // draft | staged | production | rolled_back | retired
    template: text("template").notNull(),
    declaredVariables: jsonb("declared_variables").notNull().default([]),
    outputSchema: text("output_schema"),
    /** Content-addressed: "which prompt produced this answer" has an answer. */
    contentHash: text("content_hash").notNull(),
    authorId: uuid("author_id").notNull(),
    approverId: uuid("approver_id"),
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
    rollbackReason: text("rollback_reason"),
    changeSummary: text("change_summary"),
  },
  (t) => [
    unique("uq_aiprompt_feature_version").on(t.tenantId, t.featureKey, t.version),
    unique("uq_aiprompt_hash").on(t.tenantId, t.featureKey, t.contentHash),
    index("ix_aiprompt_stage").on(t.tenantId, t.featureKey, t.stage),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Evaluation                                                                */
/* -------------------------------------------------------------------------- */

export const aiEvalDataset = pgTable(
  "ai_eval_dataset",
  {
    ...tenantScopedColumns,
    featureKey: text("feature_key").notNull(),
    datasetVersion: text("dataset_version").notNull(),
    description: text("description").notNull(),
    caseCount: integer("case_count").notNull().default(0),
    /**
     * Golden sets are EVALUATION artefacts, never training data — and the contract term
     * excluding them from provider training is recorded here rather than assumed.
     */
    trainingExcluded: boolean("training_excluded").notNull().default(true),
  },
  (t) => [unique("uq_aidataset").on(t.tenantId, t.featureKey, t.datasetVersion)],
);

// A run is the gate. Its verdict decides whether a prompt may be promoted, and it is bound
// to the exact content hash it was run against — a pass for a previous version proves
// nothing about this one.
export const aiEvalRun = pgTable(
  "ai_eval_run",
  {
    ...tenantScopedColumns,
    featureKey: text("feature_key").notNull(),
    datasetVersion: text("dataset_version").notNull(),
    promptContentHash: text("prompt_content_hash"),
    metric: text("metric").notNull(),
    baselineScore: numeric("baseline_score", { precision: 6, scale: 4 }).notNull(),
    candidateScore: numeric("candidate_score", { precision: 6, scale: 4 }).notNull(),
    tolerance: numeric("tolerance", { precision: 6, scale: 4 }).notNull(),
    mustPassFailures: jsonb("must_pass_failures").notNull().default([]),
    verdict: text("verdict").notNull(), // pass | fail
    caseCount: integer("case_count").notNull().default(0),
    failureClusters: jsonb("failure_clusters").notNull().default([]),
    runBy: uuid("run_by").notNull(),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_aievalrun_feature").on(t.tenantId, t.featureKey, t.runAt)],
);

/* -------------------------------------------------------------------------- */
/*  Guardrails, HITL, metering                                                */
/* -------------------------------------------------------------------------- */

export const aiGuardrailEvent = pgTable(
  "ai_guardrail_event",
  {
    ...tenantScopedColumns,
    featureKey: text("feature_key").notNull(),
    correlationId: text("correlation_id").notNull(),
    stage: text("stage").notNull(), // pre | post
    code: text("code").notNull(),
    severity: text("severity").notNull(), // block | degrade | note
    message: text("message").notNull(),
    /** Field NAMES and digests only. Never a value — this table is kept for years. */
    detail: jsonb("detail").notNull().default({}),
  },
  (t) => [index("ix_aiguard_tenant_feature").on(t.tenantId, t.featureKey, t.createdAt)],
);

export const aiHitlItem = pgTable(
  "ai_hitl_item",
  {
    ...tenantScopedColumns,
    featureKey: text("feature_key").notNull(),
    correlationId: text("correlation_id").notNull(),
    docType: text("doc_type"),
    docRef: text("doc_ref"),
    reason: text("reason").notNull(), // low_confidence | guardrail_degrade | policy
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    proposed: jsonb("proposed").notNull(),
    status: text("status").notNull().default("open"), // open | accepted | corrected | rejected
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** What the human changed, field by field — the feedback that becomes a golden case. */
    correction: jsonb("correction"),
    /** Set when a correction is promoted into the golden-set candidate queue. */
    promotedToGoldenSet: boolean("promoted_to_golden_set").notNull().default(false),
  },
  (t) => [index("ix_aihitl_tenant_status").on(t.tenantId, t.status, t.featureKey)],
);

// Per-call metering. One row per routed call, reconciling 1:1 with `ai_action_log`.
export const aiCallMetric = pgTable(
  "ai_call_metric",
  {
    ...tenantScopedColumns,
    featureKey: text("feature_key").notNull(),
    correlationId: text("correlation_id").notNull(),
    actionLogSeq: integer("action_log_seq"),
    providerCode: text("provider_code"),
    modelCode: text("model_code"),
    region: text("region"),
    promptContentHash: text("prompt_content_hash"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    inputCost: numeric("input_cost", { precision: 14, scale: 4 }).notNull().default("0"),
    outputCost: numeric("output_cost", { precision: 14, scale: 4 }).notNull().default("0"),
    totalCost: numeric("total_cost", { precision: 14, scale: 4 }).notNull().default("0"),
    priceEffectiveFrom: date("price_effective_from"),
    latencyMs: integer("latency_ms"),
    degraded: boolean("degraded").notNull().default(false),
    usedFallback: boolean("used_fallback").notNull().default(false),
    accepted: boolean("accepted"),
    calledAt: timestamp("called_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ix_aimetric_tenant_feature").on(t.tenantId, t.featureKey, t.calledAt),
    unique("uq_aimetric_correlation").on(t.tenantId, t.correlationId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Rollout, kill switch, incidents, drift                                    */
/* -------------------------------------------------------------------------- */

export const aiFeatureRollout = pgTable(
  "ai_feature_rollout",
  {
    ...tenantScopedColumns,
    featureKey: text("feature_key").notNull(),
    stage: text("stage").notNull().default("off"), // off | internal | pilot | general | rolled_back
    changedBy: uuid("changed_by"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason"),
    lastEvalRunId: uuid("last_eval_run_id"),
  },
  (t) => [unique("uq_airollout_feature").on(t.tenantId, t.featureKey)],
);

export const aiKillSwitch = pgTable(
  "ai_kill_switch",
  {
    ...tenantScopedColumns,
    /** Null means the whole tenant. */
    featureKey: text("feature_key"),
    engaged: boolean("engaged").notNull().default(false),
    engagedBy: uuid("engaged_by"),
    engagedAt: timestamp("engaged_at", { withTimezone: true }),
    reason: text("reason"),
    releasedBy: uuid("released_by"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (t) => [unique("uq_aikill_scope").on(t.tenantId, t.featureKey)],
);

// The drill, recorded. A kill switch nobody has tried is a belief.
export const aiKillSwitchProbe = pgTable(
  "ai_kill_switch_probe",
  {
    ...tenantScopedColumns,
    featureKey: text("feature_key").notNull(),
    refused: boolean("refused").notNull(),
    elapsedMs: integer("elapsed_ms").notNull(),
    withinBound: boolean("within_bound").notNull(),
    message: text("message").notNull(),
    probedBy: uuid("probed_by").notNull(),
    probedAt: timestamp("probed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_aiprobe_tenant_time").on(t.tenantId, t.probedAt)],
);

export const aiIncident = pgTable(
  "ai_incident",
  {
    ...tenantScopedColumns,
    incidentNo: text("incident_no").notNull(),
    featureKey: text("feature_key"),
    severity: text("severity").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("open"),
    actionTaken: text("action_taken"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
  },
  (t) => [unique("uq_aiincident_no").on(t.tenantId, t.incidentNo)],
);

export const aiDriftScan = pgTable(
  "ai_drift_scan",
  {
    ...tenantScopedColumns,
    featureKey: text("feature_key").notNull(),
    baselineFrom: date("baseline_from").notNull(),
    baselineTo: date("baseline_to").notNull(),
    currentFrom: date("current_from").notNull(),
    currentTo: date("current_to").notNull(),
    findings: jsonb("findings").notNull().default([]),
    attributedTo: text("attributed_to"),
    headline: text("headline").notNull(),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_aidrift_tenant_feature").on(t.tenantId, t.featureKey, t.scannedAt)],
);

// Vector indexes, with the tenant fence that cannot be retrofitted. An ANN search that
// crosses tenants returns a competitor's part names as "similar items".
export const aiEmbeddingIndex = pgTable(
  "ai_embedding_index",
  {
    ...tenantScopedColumns,
    indexName: text("index_name").notNull(),
    entityType: text("entity_type").notNull(),
    modelCode: text("model_code").notNull(),
    dimensions: integer("dimensions").notNull(),
    vectorCount: integer("vector_count").notNull().default(0),
    lastRebuiltAt: timestamp("last_rebuilt_at", { withTimezone: true }),
    /** Set by the ANN leak probe. Null means never probed, which is not the same as safe. */
    leakProbePassedAt: timestamp("leak_probe_passed_at", { withTimezone: true }),
  },
  (t) => [unique("uq_aiindex_name").on(t.tenantId, t.indexName)],
);
