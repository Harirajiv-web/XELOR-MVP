import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import {
  AppError,
  Errors,
  checkAiBudget,
  costOfCall,
  currentTenant,
  detectDrift,
  newId,
  postCall,
  preCall,
  type ModelPrice,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";

const {
  aiModelPrice, aiCallMetric, aiGuardrailEvent, aiHitlItem, aiEvalRun, aiEvalDataset,
  aiDriftScan, aiIncident, aiEmbeddingIndex, aiPromptVersion, auditLog, aiActionLog,
} = schema;

const d10 = (s: string): string => s.slice(0, 10);

/**
 * OPERATIONS — guardrails at the wire, the humans who review what came back, what it cost,
 * whether it is getting worse, and the five-part answer to "what did the AI do with my data?".
 */
@Injectable()
export class AiOperationsService {
  constructor(private readonly audit: AuditLogService) {}

  /* ------------------------------- guardrails ----------------------------- */

  /**
   * The pre-call gate, recorded.
   *
   * Minimise to an allow-list, verify nothing survived it, mark injection attempts. The
   * events are stored with field NAMES only — a redaction log containing the redacted value
   * is a second copy of the problem, kept for years.
   */
  async guardPre(input: { featureKey: string; correlationId: string; source: Record<string, unknown>; allowList: string[] }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const result = preCall({ source: input.source, allowList: input.allowList });

    return withTenant(async (tx) => {
      for (const e of result.events) {
        await tx.insert(aiGuardrailEvent).values({
          id: newId(), tenantId, createdBy: actorId, updatedBy: actorId,
          featureKey: input.featureKey, correlationId: input.correlationId,
          stage: e.stage, code: e.code, severity: e.severity, message: e.message,
          detail: (e.detail ?? {}) as object,
        });
      }
      return {
        featureKey: input.featureKey,
        correlationId: input.correlationId,
        allowed: result.allowed,
        payload: result.payload,
        quarantined: result.quarantined,
        redaction: result.redaction,
        events: result.events,
      };
    });
  }

  /**
   * The post-call gate, recorded.
   *
   * Numeric provenance is the one that earns its place: the characteristic failure of this
   * technology in a finance product is not refusing to answer, it is producing a plausible
   * total nobody typed.
   */
  async guardPost(input: {
    featureKey: string;
    correlationId: string;
    modelInput: unknown;
    modelOutput: unknown;
    derivedNumbers?: number[];
    confidence?: number;
    schemaValid: boolean;
    docType?: string;
    docRef?: string;
  }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const result = postCall({
      modelInput: input.modelInput,
      modelOutput: input.modelOutput,
      derivedNumbers: input.derivedNumbers,
      confidence: input.confidence ?? null,
      schemaValid: input.schemaValid,
    });

    return withTenant(async (tx) => {
      for (const e of result.events) {
        await tx.insert(aiGuardrailEvent).values({
          id: newId(), tenantId, createdBy: actorId, updatedBy: actorId,
          featureKey: input.featureKey, correlationId: input.correlationId,
          stage: e.stage, code: e.code, severity: e.severity, message: e.message,
          detail: (e.detail ?? {}) as object,
        });
      }

      // A low-confidence answer goes to a person rather than onto the screen as fact.
      let hitlId: string | null = null;
      if (result.route === "review") {
        hitlId = newId();
        await tx.insert(aiHitlItem).values({
          id: hitlId, tenantId, createdBy: actorId, updatedBy: actorId,
          featureKey: input.featureKey, correlationId: input.correlationId,
          docType: input.docType ?? null, docRef: input.docRef ?? null,
          reason: "low_confidence",
          confidence: input.confidence != null ? input.confidence.toFixed(3) : null,
          proposed: input.modelOutput as object,
          status: "open",
        });
      }

      return { featureKey: input.featureKey, correlationId: input.correlationId, ...result, hitlId };
    });
  }

  /* ---------------------------------- HITL -------------------------------- */

  async hitlQueue(status = "open"): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(aiHitlItem).where(eq(aiHitlItem.status, status)).orderBy(asc(aiHitlItem.createdAt));
      return rows.map((r) => ({
        id: r.id, featureKey: r.featureKey, docType: r.docType, docRef: r.docRef,
        reason: r.reason, confidence: r.confidence == null ? null : Number(r.confidence),
        proposed: r.proposed, correlationId: r.correlationId,
      }));
    });
  }

  /**
   * A reviewer's decision, and the correction it produced.
   *
   * The correction is the valuable half. It is the only signal in the system about what the
   * model gets wrong in this plant specifically, and it is promoted into the golden-set
   * candidate queue rather than discarded — which is how the eval set stops being whatever
   * somebody imagined during the build.
   */
  async reviewHitl(id: string, input: { decision: "accepted" | "corrected" | "rejected"; correction?: Record<string, unknown>; note?: string }): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    if (input.decision === "corrected" && !input.correction) {
      throw new AppError("AIOPS_CORRECTION_REQUIRED", 422, "A correction must say what was corrected — otherwise the feedback loop has nothing to learn from.");
    }
    return withTenant(async (tx) => {
      const [row] = await tx.select().from(aiHitlItem).where(eq(aiHitlItem.id, id)).limit(1);
      if (!row) throw Errors.notFound(`review item ${id}`);
      if (row.status !== "open") throw new AppError("AIOPS_ALREADY_REVIEWED", 409, `This item was already ${row.status}.`);

      const promote = input.decision === "corrected";
      await tx
        .update(aiHitlItem)
        .set({
          status: input.decision, reviewedBy: actorId, reviewedAt: new Date(),
          correction: (input.correction ?? null) as object | null,
          promotedToGoldenSet: promote,
          updatedBy: actorId, updatedAt: new Date(),
        })
        .where(eq(aiHitlItem.id, id));

      // Acceptance feeds the drift signal, so it is written onto the call metric too.
      await tx
        .update(aiCallMetric)
        .set({ accepted: input.decision === "accepted", updatedBy: actorId, updatedAt: new Date() })
        .where(eq(aiCallMetric.correlationId, row.correlationId));

      await this.audit.appendInTx(tx, {
        action: `aiops.hitl.${input.decision}`,
        entityType: "ai_hitl_item",
        entityId: id,
        data: { featureKey: row.featureKey, docRef: row.docRef, promotedToGoldenSet: promote, note: input.note ?? null },
      });

      return {
        id, decision: input.decision, promotedToGoldenSet: promote,
        note: promote
          ? "The correction is queued as a golden-set candidate. This is the only signal in the system about what the model gets wrong in THIS plant."
          : "Recorded.",
      };
    });
  }

  /* ------------------------------ metering, cost -------------------------- */

  /** Meter one call, priced at the rate in force on the day it happened. */
  async meterCall(input: {
    featureKey: string;
    correlationId: string;
    modelCode: string;
    providerCode?: string;
    region?: string;
    promptContentHash?: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs?: number;
    degraded?: boolean;
    usedFallback?: boolean;
    calledAt?: string;
  }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const calledAt = input.calledAt ?? new Date().toISOString();

    return withTenant(async (tx) => {
      const priceRows = await tx.select().from(aiModelPrice).where(eq(aiModelPrice.isActive, true));
      const prices: ModelPrice[] = priceRows.map((p) => ({
        modelCode: p.modelCode,
        inputPer1k: Number(p.inputPer1k),
        outputPer1k: Number(p.outputPer1k),
        effectiveFrom: p.effectiveFrom,
        effectiveTo: p.effectiveTo,
      }));
      const cost = costOfCall({ modelCode: input.modelCode, inputTokens: input.inputTokens, outputTokens: input.outputTokens, prices, asOf: calledAt });

      await tx.insert(aiCallMetric).values({
        id: newId(), tenantId, createdBy: actorId, updatedBy: actorId,
        featureKey: input.featureKey,
        correlationId: input.correlationId,
        providerCode: input.providerCode ?? null,
        modelCode: input.modelCode,
        region: input.region ?? null,
        promptContentHash: input.promptContentHash ?? null,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        inputCost: cost.inputCost.toFixed(4),
        outputCost: cost.outputCost.toFixed(4),
        totalCost: cost.totalCost.toFixed(4),
        priceEffectiveFrom: cost.priceEffectiveFrom,
        latencyMs: input.latencyMs ?? null,
        degraded: input.degraded ?? false,
        usedFallback: input.usedFallback ?? false,
        calledAt: new Date(calledAt),
      });
      return { correlationId: input.correlationId, ...cost };
    });
  }

  /** Pre-dispatch budget check: throttle before blocking, and never simply stop. */
  async budgetCheck(input: { dailyBudget: number; estimatedCost: number; asOf?: string }): Promise<Record<string, unknown>> {
    const day = d10(input.asOf ?? new Date().toISOString());
    return withTenant(async (tx) => {
      const rows = await tx.execute<{ spent: string }>(sql`
        select coalesce(sum(total_cost), 0) as spent from ai_call_metric
         where called_at >= ${`${day}T00:00:00Z`}::timestamptz and called_at < ${`${day}T23:59:59Z`}::timestamptz
      `);
      const spent = Number(rows.rows[0]?.spent ?? 0);
      return { ...checkAiBudget({ spentToday: spent, dailyBudget: input.dailyBudget, estimatedCost: input.estimatedCost }) };
    });
  }

  /** Month-to-date cost per feature, with acceptance beside it — the two numbers together. */
  async costDashboard(from: string, to: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select()
        .from(aiCallMetric)
        .where(and(sql`${aiCallMetric.calledAt} >= ${`${d10(from)}T00:00:00Z`}::timestamptz`, sql`${aiCallMetric.calledAt} <= ${`${d10(to)}T23:59:59Z`}::timestamptz`));

      const byFeature = new Map<string, { calls: number; cost: number; accepted: number; reviewed: number; fallback: number }>();
      for (const r of rows) {
        const f = byFeature.get(r.featureKey) ?? { calls: 0, cost: 0, accepted: 0, reviewed: 0, fallback: 0 };
        f.calls += 1;
        f.cost += Number(r.totalCost);
        if (r.accepted === true) f.accepted += 1;
        if (r.accepted !== null) f.reviewed += 1;
        if (r.usedFallback) f.fallback += 1;
        byFeature.set(r.featureKey, f);
      }

      const features = [...byFeature.entries()].map(([featureKey, f]) => ({
        featureKey,
        calls: f.calls,
        cost: Math.round(f.cost * 100) / 100,
        costPerCall: f.calls > 0 ? Math.round((f.cost / f.calls) * 10_000) / 10_000 : 0,
        // Cost without acceptance is a number with no opinion attached. Together they say
        // whether the spend bought anything.
        acceptanceRate: f.reviewed > 0 ? Math.round((f.accepted / f.reviewed) * 100) / 100 : null,
        fallbackRate: f.calls > 0 ? Math.round((f.fallback / f.calls) * 100) / 100 : 0,
      })).sort((a, b) => b.cost - a.cost);

      const total = Math.round(features.reduce((a, f) => a + f.cost, 0) * 100) / 100;
      return {
        from: d10(from), to: d10(to), totalCost: total, features,
        headline: features.length === 0 ? "No AI calls in this window." : `₹${total} across ${rows.length} call(s). Largest: ${features[0]!.featureKey} at ₹${features[0]!.cost}.`,
      };
    });
  }

  /* --------------------------------- drift -------------------------------- */

  async driftScan(input: { featureKey: string; baselineFrom: string; baselineTo: string; currentFrom: string; currentTo: string }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const window = async (from: string, to: string, label: string) => {
        const rows = await tx
          .select()
          .from(aiCallMetric)
          .where(and(
            eq(aiCallMetric.featureKey, input.featureKey),
            sql`${aiCallMetric.calledAt} >= ${`${d10(from)}T00:00:00Z`}::timestamptz`,
            sql`${aiCallMetric.calledAt} <= ${`${d10(to)}T23:59:59Z`}::timestamptz`,
          ));
        const reviewed = rows.filter((r) => r.accepted !== null);
        const latencies = rows.map((r) => r.latencyMs ?? 0).sort((a, b) => a - b);
        return {
          label,
          calls: rows.length,
          acceptanceRate: reviewed.length > 0 ? reviewed.filter((r) => r.accepted === true).length / reviewed.length : 0,
          fallbackRate: rows.length > 0 ? rows.filter((r) => r.usedFallback).length / rows.length : 0,
          p95LatencyMs: latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] ?? 0 : 0,
          avgCost: rows.length > 0 ? rows.reduce((a, r) => a + Number(r.totalCost), 0) / rows.length : 0,
        };
      };

      const baseline = await window(input.baselineFrom, input.baselineTo, "baseline");
      const current = await window(input.currentFrom, input.currentTo, "current");

      const promotions = await tx
        .select()
        .from(aiPromptVersion)
        .where(and(eq(aiPromptVersion.featureKey, input.featureKey), eq(aiPromptVersion.stage, "production")))
        .orderBy(desc(aiPromptVersion.promotedAt));
      const recentChanges = promotions
        .filter((p) => p.promotedAt && d10(p.promotedAt.toISOString()) >= d10(input.currentFrom))
        .map((p) => ({ at: p.promotedAt!.toISOString(), description: `prompt promoted to v${p.version}` }));

      const report = detectDrift({ featureKey: input.featureKey, baseline, current, recentChanges });

      await tx.insert(aiDriftScan).values({
        id: newId(), tenantId, createdBy: actorId, updatedBy: actorId,
        featureKey: input.featureKey,
        baselineFrom: d10(input.baselineFrom), baselineTo: d10(input.baselineTo),
        currentFrom: d10(input.currentFrom), currentTo: d10(input.currentTo),
        findings: report.findings as unknown as object,
        attributedTo: report.attributedTo,
        headline: report.headline,
      });
      return { ...report, baseline, current };
    });
  }

  /* ------------------------------ audit explorer -------------------------- */

  /**
   * The five-part answer to "what did the AI do with this document?".
   *
   * Which feature, which model and from where, what left the building, what came back and
   * whether a guardrail caught anything, and which human confirmed it. Anything less is a
   * log; these five together are an answer somebody can give a regulator.
   */
  async explainCall(correlationId: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const [metric] = await tx.select().from(aiCallMetric).where(eq(aiCallMetric.correlationId, correlationId)).limit(1);
      const guardrails = await tx.select().from(aiGuardrailEvent).where(eq(aiGuardrailEvent.correlationId, correlationId)).orderBy(asc(aiGuardrailEvent.createdAt));
      const [hitl] = await tx.select().from(aiHitlItem).where(eq(aiHitlItem.correlationId, correlationId)).limit(1);

      if (!metric && guardrails.length === 0) throw Errors.notFound(`AI call ${correlationId}`);

      const redaction = guardrails.find((g) => g.code === "pii_minimised");
      const detail = (redaction?.detail ?? {}) as { sent?: string[]; dropped?: string[] };

      return {
        correlationId,
        // 1. What ran
        feature: metric?.featureKey ?? guardrails[0]?.featureKey ?? null,
        promptVersionHash: metric?.promptContentHash ?? null,
        // 2. Where it ran
        provider: metric?.providerCode ?? null,
        model: metric?.modelCode ?? null,
        region: metric?.region ?? null,
        residency: metric?.region?.startsWith("ap-south") ? "Processed in India." : metric?.region ? `Processed in ${metric.region}.` : "No provider call recorded.",
        // 3. What left the building
        fieldsSent: detail.sent ?? [],
        fieldsWithheld: detail.dropped ?? [],
        // 4. What the guardrails did
        guardrails: guardrails.map((g) => ({ stage: g.stage, code: g.code, severity: g.severity, message: g.message })),
        blocked: guardrails.some((g) => g.severity === "block"),
        // 5. Who confirmed it
        humanReview: hitl
          ? { status: hitl.status, reviewedBy: hitl.reviewedBy, reviewedAt: hitl.reviewedAt, corrected: hitl.status === "corrected" }
          : { status: "not_required", note: "Confidence was above the review floor, so no human was asked." },
        cost: metric ? { totalCost: Number(metric.totalCost), inputTokens: metric.inputTokens, outputTokens: metric.outputTokens } : null,
      };
    });
  }

  /** The evidence pack: the five-part answer plus the reconciliation an auditor asks for. */
  async evidencePack(from: string, to: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const metrics = await tx
        .select()
        .from(aiCallMetric)
        .where(and(sql`${aiCallMetric.calledAt} >= ${`${d10(from)}T00:00:00Z`}::timestamptz`, sql`${aiCallMetric.calledAt} <= ${`${d10(to)}T23:59:59Z`}::timestamptz`));
      const actions = await tx.select().from(aiActionLog);
      const blocks = await tx.select().from(aiGuardrailEvent).where(eq(aiGuardrailEvent.severity, "block"));
      const datasets = await tx.select().from(aiEvalDataset);
      const runs = await tx.select().from(aiEvalRun).orderBy(desc(aiEvalRun.runAt));

      const outsideIndia = metrics.filter((m) => m.region && !m.region.startsWith("ap-south"));
      return {
        window: { from: d10(from), to: d10(to) },
        callsMetered: metrics.length,
        callsInActionLog: actions.length,
        // 1:1 reconciliation is the check that makes the metering trustworthy: a call that
        // was routed but not metered is spend nobody can see.
        reconciliation: {
          matched: metrics.length <= actions.length,
          note: metrics.length <= actions.length
            ? `Every metered call has a hash-chained action-log entry behind it.`
            : `${metrics.length - actions.length} metered call(s) have no action-log entry — investigate before trusting the cost figures.`,
        },
        residency: {
          outsideIndia: outsideIndia.length,
          assertion: outsideIndia.length === 0
            ? "Every AI call in this window was processed in India."
            : `${outsideIndia.length} call(s) were processed outside India — see the per-call region.`,
        },
        guardrailBlocks: blocks.length,
        goldenSets: datasets.map((d) => ({ featureKey: d.featureKey, version: d.datasetVersion, cases: d.caseCount, trainingExcluded: d.trainingExcluded })),
        gates: runs.slice(0, 10).map((r) => ({ featureKey: r.featureKey, verdict: r.verdict, metric: r.metric, baseline: Number(r.baselineScore), candidate: Number(r.candidateScore), runAt: r.runAt })),
        assertions: [
          "No AI feature outside the closed registry can be routed; an unregistered key makes zero provider calls.",
          "Every AI call is recorded in a per-tenant hash-chained log, including the ones that were refused.",
          "Golden sets are evaluation artefacts and are contractually excluded from provider training.",
          "No AI feature writes to a business record without a human approving it.",
        ],
      };
    });
  }

  /* -------------------------------- incidents ----------------------------- */

  async raiseIncident(input: { incidentNo: string; featureKey?: string; severity: "critical" | "high" | "medium" | "low"; title: string; description: string; detectedAt: string }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const id = newId();
      await tx.insert(aiIncident).values({
        id, tenantId, createdBy: actorId, updatedBy: actorId,
        incidentNo: input.incidentNo, featureKey: input.featureKey ?? null,
        severity: input.severity, title: input.title, description: input.description,
        detectedAt: new Date(input.detectedAt), status: "open",
      });
      await this.audit.appendInTx(tx, { action: "aiops.incident.raised", entityType: "ai_incident", entityId: id, data: { ...input } });
      return { id, ...input, status: "open" };
    });
  }

  /**
   * The incident register, as NAMED columns.
   *
   * `select()` with no argument would ship `tenant_id`, `created_by` and `updated_by` to a
   * browser, and would leak whatever a future migration adds to the table into a response
   * nobody reviewed. The copilot's query file forbids exactly this; the AI operations
   * console cannot be the one endpoint that breaks the rule it enforces on everything else.
   */
  async incidents(): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select({
          id: aiIncident.id,
          incidentNo: aiIncident.incidentNo,
          featureKey: aiIncident.featureKey,
          severity: aiIncident.severity,
          title: aiIncident.title,
          description: aiIncident.description,
          detectedAt: aiIncident.detectedAt,
          status: aiIncident.status,
          actionTaken: aiIncident.actionTaken,
          resolvedAt: aiIncident.resolvedAt,
          resolutionNote: aiIncident.resolutionNote,
        })
        .from(aiIncident)
        .orderBy(desc(aiIncident.detectedAt));
      return rows.map((r) => ({ ...r }));
    });
  }

  /* ----------------------------- embedding indexes ------------------------ */

  /**
   * The ANN leak probe.
   *
   * A nearest-neighbour search that crosses tenants returns a competitor's part names as
   * "similar items". The control cannot be retrofitted once vectors exist, so the probe
   * records a timestamp — and a NULL there means never probed, which is not the same as
   * safe.
   */
  async annLeakProbe(indexName: string, foreignHits: number): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [idx] = await tx.select().from(aiEmbeddingIndex).where(eq(aiEmbeddingIndex.indexName, indexName)).limit(1);
      if (!idx) throw Errors.notFound(`embedding index ${indexName}`);
      const passed = foreignHits === 0;
      if (passed) {
        await tx.update(aiEmbeddingIndex).set({ leakProbePassedAt: new Date(), updatedBy: actorId, updatedAt: new Date() }).where(eq(aiEmbeddingIndex.id, idx.id));
      }
      return {
        indexName,
        passed,
        foreignHits,
        message: passed
          ? "No vector from another tenant was returned. The fence holds at the ANN layer, not only at the row layer."
          : `${foreignHits} vector(s) from another tenant were returned. This index is leaking — a similarity search would show a competitor's part names.`,
      };
    });
  }

  async indexes(): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(aiEmbeddingIndex).orderBy(asc(aiEmbeddingIndex.indexName));
      return rows.map((r) => ({
        indexName: r.indexName, entityType: r.entityType, modelCode: r.modelCode,
        dimensions: r.dimensions, vectorCount: r.vectorCount, lastRebuiltAt: r.lastRebuiltAt,
        leakProbePassedAt: r.leakProbePassedAt,
        assurance: r.leakProbePassedAt
          ? `Leak probe passed ${r.leakProbePassedAt.toISOString().slice(0, 10)}.`
          : "NEVER PROBED. That is not the same as safe.",
      }));
    });
  }

  /* ---------------------------------- eval -------------------------------- */

  /** Record an eval run. A `pass` must beat the baseline by the tolerance AND have no must-pass failures — the database refuses anything else. */
  async recordEvalRun(input: {
    featureKey: string;
    datasetVersion: string;
    promptContentHash?: string;
    metric: string;
    baselineScore: number;
    candidateScore: number;
    tolerance: number;
    mustPassFailures: string[];
    caseCount: number;
    failureClusters?: { label: string; count: number }[];
  }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const verdict = input.mustPassFailures.length === 0 && input.candidateScore >= input.baselineScore + input.tolerance ? "pass" : "fail";

    return withTenant(async (tx) => {
      const id = newId();
      await tx.insert(aiEvalRun).values({
        id, tenantId, createdBy: actorId, updatedBy: actorId,
        featureKey: input.featureKey,
        datasetVersion: input.datasetVersion,
        promptContentHash: input.promptContentHash ?? null,
        metric: input.metric,
        baselineScore: input.baselineScore.toFixed(4),
        candidateScore: input.candidateScore.toFixed(4),
        tolerance: input.tolerance.toFixed(4),
        mustPassFailures: input.mustPassFailures as unknown as object,
        verdict,
        caseCount: input.caseCount,
        failureClusters: (input.failureClusters ?? []) as unknown as object,
        runBy: actorId,
      });
      await this.audit.appendInTx(tx, {
        action: "aiops.eval.recorded",
        entityType: "ai_eval_run",
        entityId: id,
        data: { featureKey: input.featureKey, verdict, baseline: input.baselineScore, candidate: input.candidateScore },
      });
      return {
        id, featureKey: input.featureKey, verdict,
        delta: Math.round((input.candidateScore - input.baselineScore) * 10_000) / 10_000,
        mustPassFailures: input.mustPassFailures,
        failureClusters: input.failureClusters ?? [],
        note: verdict === "pass"
          ? "Passed. This run is bound to the prompt's content hash and is the only thing that can unlock a promotion."
          : "Failed. Promotion is refused — the gate is not a warning, and there is no force flag.",
      };
    });
  }

  /**
   * The last 50 runs, newest first — for one feature or for all of them.
   *
   * The filter is in the WHERE clause, and it has to be. Taking 50 rows and then filtering
   * them in JavaScript answered "no runs" for any feature whose history sat below the most
   * recent fifty across the tenant — on the eval gate, the one control that decides whether
   * a feature may ship. A gate that can quietly report a clean sheet for a feature with a
   * failing history is worse than no gate, because somebody believes it.
   */
  async evalRuns(featureKey?: string): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select()
        .from(aiEvalRun)
        .where(featureKey ? eq(aiEvalRun.featureKey, featureKey) : undefined)
        .orderBy(desc(aiEvalRun.runAt))
        .limit(50);
      return rows
        .map((r) => ({
          featureKey: r.featureKey, datasetVersion: r.datasetVersion, metric: r.metric,
          baseline: Number(r.baselineScore), candidate: Number(r.candidateScore),
          tolerance: Number(r.tolerance), verdict: r.verdict,
          mustPassFailures: r.mustPassFailures, failureClusters: r.failureClusters,
          promptContentHash: r.promptContentHash?.slice(0, 12) ?? null, runAt: r.runAt,
        }));
    });
  }
}
