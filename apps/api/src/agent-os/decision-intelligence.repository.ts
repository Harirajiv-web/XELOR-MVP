import { Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, withTenant } from "@ind-core/db";
import { AppError, currentTenant, newId } from "@ind-core/platform";
import { AuditLogService } from "../common/audit-log.service.js";

const {
  agentActionDispatch,
  agentApproval,
  agentRun,
  decisionEvidenceLink,
  decisionOutcomeMetric,
  outboxEvent,
} = schema;

export interface EvidenceLinkInput {
  relationType: string;
  sourceDomain: string;
  sourceType: string;
  sourceId: string;
  sourceRef?: string | null;
  targetDomain: string;
  targetType: string;
  targetId: string;
  targetRef?: string | null;
  observedAt?: string;
  confidence?: number;
  evidence?: Record<string, unknown>;
}

export interface OutcomeInput {
  decisionKey: string;
  missionRunId?: string;
  actionDispatchId?: string;
  metricKey: string;
  label: string;
  unit: string;
  baselineValue?: number;
  targetValue?: number;
  observedValue?: number;
  estimatedValue?: number;
  verifiedValue?: number;
  verificationStatus: "unverified" | "measuring" | "verified" | "disputed";
  attributionStatus: "not_assessed" | "rejected" | "partial" | "supported";
  verificationMethod?: string;
  evidence?: Record<string, unknown>;
}

@Injectable()
export class DecisionIntelligenceRepository {
  constructor(private readonly audit: AuditLogService) {}

  async upsertEvidence(
    decisionKey: string,
    missionRunId: string | undefined,
    links: readonly EvidenceLinkInput[],
  ): Promise<void> {
    if (links.length === 0) return;
    const { tenantId, actorId } = currentTenant();
    await withTenant(async (tx) => {
      for (const link of links) {
        await tx
          .insert(decisionEvidenceLink)
          .values({
            id: newId(),
            tenantId,
            createdBy: actorId,
            updatedBy: actorId,
            decisionKey,
            missionRunId: missionRunId ?? null,
            relationType: link.relationType,
            sourceDomain: link.sourceDomain,
            sourceType: link.sourceType,
            sourceId: link.sourceId,
            sourceRef: link.sourceRef ?? null,
            targetDomain: link.targetDomain,
            targetType: link.targetType,
            targetId: link.targetId,
            targetRef: link.targetRef ?? null,
            observedAt: new Date(link.observedAt ?? Date.now()),
            confidence: String(link.confidence ?? 1),
            evidence: link.evidence ?? {},
          })
          .onConflictDoUpdate({
            target: [
              decisionEvidenceLink.tenantId,
              decisionEvidenceLink.decisionKey,
              decisionEvidenceLink.relationType,
              decisionEvidenceLink.sourceType,
              decisionEvidenceLink.sourceId,
              decisionEvidenceLink.targetType,
              decisionEvidenceLink.targetId,
            ],
            set: {
              missionRunId: missionRunId ?? null,
              sourceRef: link.sourceRef ?? null,
              targetRef: link.targetRef ?? null,
              observedAt: new Date(link.observedAt ?? Date.now()),
              confidence: String(link.confidence ?? 1),
              evidence: link.evidence ?? {},
              updatedBy: actorId,
              updatedAt: new Date(),
            },
          });
      }
      await this.audit.appendInTx(tx, {
        action: "agentos.decision.evidence_linked",
        entityType: "decision",
        // The shared audit ledger deliberately stores UUID entity ids. A decision key is a
        // human-readable composite (for example planning:<uuid>), so the mission is the
        // durable audit entity and the readable key remains in the evidence payload.
        entityId: missionRunId ?? newId(),
        data: { decisionKey, missionRunId: missionRunId ?? null, linkCount: links.length },
      });
    });
  }

  async listEvidence(decisionKey?: string) {
    return withTenant((tx) =>
      tx
        .select()
        .from(decisionEvidenceLink)
        .where(decisionKey ? eq(decisionEvidenceLink.decisionKey, decisionKey) : undefined)
        .orderBy(desc(decisionEvidenceLink.observedAt))
        .limit(250),
    );
  }

  async recordOutcome(input: OutcomeInput) {
    if (input.verificationStatus === "verified") {
      if (
        input.observedValue === undefined ||
        input.verifiedValue === undefined ||
        !input.verificationMethod?.trim()
      ) {
        throw new AppError(
          "OUTCOME_VERIFICATION_INCOMPLETE",
          422,
          "A verified outcome needs an observed result, verified value and verification method.",
        );
      }
      if (!['partial', 'supported'].includes(input.attributionStatus)) {
        throw new AppError(
          "OUTCOME_ATTRIBUTION_UNSUPPORTED",
          422,
          "Verified value needs supported or partial attribution to the decision.",
        );
      }
    }
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const now = new Date();
      const values = {
        missionRunId: input.missionRunId ?? null,
        actionDispatchId: input.actionDispatchId ?? null,
        label: input.label,
        unit: input.unit,
        baselineValue: decimal(input.baselineValue),
        targetValue: decimal(input.targetValue),
        observedValue: decimal(input.observedValue),
        estimatedValue: money(input.estimatedValue),
        verifiedValue: money(input.verifiedValue),
        verificationStatus: input.verificationStatus,
        attributionStatus: input.attributionStatus,
        verificationMethod: input.verificationMethod ?? null,
        verifiedBy: input.verificationStatus === "verified" ? actorId : null,
        verifiedAt: input.verificationStatus === "verified" ? now : null,
        evidence: input.evidence ?? {},
        updatedBy: actorId,
        updatedAt: now,
      };
      const [row] = await tx
        .insert(decisionOutcomeMetric)
        .values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          decisionKey: input.decisionKey,
          metricKey: input.metricKey,
          ...values,
        })
        .onConflictDoUpdate({
          target: [
            decisionOutcomeMetric.tenantId,
            decisionOutcomeMetric.decisionKey,
            decisionOutcomeMetric.metricKey,
          ],
          set: values,
        })
        .returning();
      await this.audit.appendInTx(tx, {
        action: "agentos.decision.outcome_recorded",
        entityType: "decision_outcome_metric",
        entityId: row!.id,
        data: {
          decisionKey: input.decisionKey,
          metricKey: input.metricKey,
          verificationStatus: input.verificationStatus,
          attributionStatus: input.attributionStatus,
        },
      });
      return row!;
    });
  }

  async listOutcomes(limit = 100) {
    return withTenant((tx) =>
      tx
        .select()
        .from(decisionOutcomeMetric)
        .orderBy(desc(decisionOutcomeMetric.updatedAt))
        .limit(limit),
    );
  }

  async valueSummary() {
    return withTenant(async (tx) => {
      const [summary] = await tx
        .select({
          estimatedValue: sql<string>`coalesce(sum(${decisionOutcomeMetric.estimatedValue}), 0)`,
          verifiedValue: sql<string>`coalesce(sum(case when ${decisionOutcomeMetric.verificationStatus} = 'verified' and ${decisionOutcomeMetric.attributionStatus} in ('supported', 'partial') then ${decisionOutcomeMetric.verifiedValue} else 0 end), 0)`,
          outcomeCount: sql<number>`count(*)::int`,
          verifiedCount: sql<number>`count(*) filter (where ${decisionOutcomeMetric.verificationStatus} = 'verified')::int`,
        })
        .from(decisionOutcomeMetric);
      return {
        estimatedValue: Number(summary?.estimatedValue ?? 0),
        verifiedValue: Number(summary?.verifiedValue ?? 0),
        outcomeCount: summary?.outcomeCount ?? 0,
        verifiedCount: summary?.verifiedCount ?? 0,
        currency: "INR",
        disclosure:
          "Verified value includes only observed outcomes reviewed by a named person with supported or partial attribution.",
      };
    });
  }

  async decisionHistory(decisionKeys: readonly string[]) {
    if (decisionKeys.length === 0) return {};
    return withTenant(async (tx) => {
      const runs = await tx
        .select({ input: agentRun.input })
        .from(agentRun)
        .where(sql`${agentRun.input}->'trigger'->>'mode' = 'decision_commander'`)
        .orderBy(desc(agentRun.createdAt))
        .limit(1_000);
      const outcomes = await tx
        .select({
          decisionKey: decisionOutcomeMetric.decisionKey,
          verificationStatus: decisionOutcomeMetric.verificationStatus,
        })
        .from(decisionOutcomeMetric)
        .where(inArray(decisionOutcomeMetric.decisionKey, [...decisionKeys]));
      const wanted = new Set(decisionKeys);
      const history: Record<string, { previousDecisionCount: number; verifiedOutcomeCount: number }> = {};
      for (const key of decisionKeys) {
        history[key] = { previousDecisionCount: 0, verifiedOutcomeCount: 0 };
      }
      for (const row of runs) {
        const input = record(row.input);
        const trigger = record(input.trigger);
        const key = typeof trigger.riskKey === "string" ? trigger.riskKey : "";
        if (wanted.has(key)) history[key]!.previousDecisionCount++;
      }
      for (const row of outcomes) {
        if (row.verificationStatus === "verified" && history[row.decisionKey]) {
          history[row.decisionKey]!.verifiedOutcomeCount++;
        }
      }
      return history;
    });
  }

  async knowledgeGraph(limit = 250) {
    const links = await withTenant((tx) =>
      tx
        .select()
        .from(decisionEvidenceLink)
        .orderBy(desc(decisionEvidenceLink.observedAt))
        .limit(limit),
    );
    const nodes = new Map<string, { id: string; kind: "decision" | "evidence"; label: string; domain: string }>();
    const edges = new Map<string, { id: string; source: string; target: string; relation: string; observedAt: string }>();
    for (const link of links) {
      const sourceId = `${link.sourceDomain}:${link.sourceType}:${link.sourceId}`;
      const targetId = `${link.targetDomain}:${link.targetType}:${link.targetId}`;
      const decisionId = `risk:${link.decisionKey}`;
      nodes.set(sourceId, { id: sourceId, kind: "evidence", label: link.sourceRef ?? link.sourceId, domain: link.sourceDomain });
      nodes.set(targetId, { id: targetId, kind: "evidence", label: link.targetRef ?? link.targetId, domain: link.targetDomain });
      nodes.set(decisionId, { id: decisionId, kind: "decision", label: link.decisionKey, domain: "agentos" });
      const relationId = `${sourceId}->${targetId}:${link.relationType}`;
      edges.set(relationId, {
        id: relationId,
        source: sourceId,
        target: targetId,
        relation: link.relationType,
        observedAt: link.observedAt.toISOString(),
      });
      const supportId = `${targetId}->${decisionId}:supports`;
      edges.set(supportId, {
        id: supportId,
        source: targetId,
        target: decisionId,
        relation: "supports",
        observedAt: link.observedAt.toISOString(),
      });
    }
    return {
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      summary: {
        rememberedDecisions: new Set(links.map((link) => link.decisionKey)).size,
        relationships: links.length,
        businessAreas: new Set(links.flatMap((link) => [link.sourceDomain, link.targetDomain]).filter((domain) => domain !== "agentos")).size,
      },
    };
  }

  async organizationalMemory(limit = 12) {
    return withTenant(async (tx) => {
      const [countRow] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(agentRun)
        .where(sql`${agentRun.input}->'trigger'->>'mode' = 'decision_commander'`);
      const runs = await tx
        .select({
          id: agentRun.id,
          status: agentRun.status,
          goal: agentRun.goal,
          input: agentRun.input,
          createdAt: agentRun.createdAt,
          completedAt: agentRun.completedAt,
        })
        .from(agentRun)
        .where(sql`${agentRun.input}->'trigger'->>'mode' = 'decision_commander'`)
        .orderBy(desc(agentRun.createdAt))
        .limit(limit);
      if (runs.length === 0) {
        return {
          summary: { decisionsRemembered: 0, withVerifiedOutcome: 0, awaitingHumanDecision: 0, lastDecisionAt: null },
          items: [],
          disclosure: "Memory begins when a governed recovery mission is started; current risks alone are not recorded as decisions.",
        };
      }
      const runIds = runs.map((run) => run.id);
      const approvals = await tx
        .select({
          runId: agentApproval.runId,
          status: agentApproval.status,
          note: agentApproval.decisionNote,
          decidedAt: agentApproval.decidedAt,
        })
        .from(agentApproval)
        .where(inArray(agentApproval.runId, runIds));
      const actions = await tx
        .select({
          runId: agentActionDispatch.runId,
          title: agentActionDispatch.title,
          actionType: agentActionDispatch.actionType,
          status: agentActionDispatch.status,
        })
        .from(agentActionDispatch)
        .where(inArray(agentActionDispatch.runId, runIds));

      const riskKeys = runs
        .map((run) => record(record(run.input).trigger).riskKey)
        .filter((key): key is string => typeof key === "string");
      const outcomes = riskKeys.length === 0
        ? []
        : await tx
            .select({
              decisionKey: decisionOutcomeMetric.decisionKey,
              verificationStatus: decisionOutcomeMetric.verificationStatus,
              verifiedValue: decisionOutcomeMetric.verifiedValue,
              label: decisionOutcomeMetric.label,
            })
            .from(decisionOutcomeMetric)
            .where(inArray(decisionOutcomeMetric.decisionKey, riskKeys));
      const evidence = riskKeys.length === 0
        ? []
        : await tx
            .select({ decisionKey: decisionEvidenceLink.decisionKey })
            .from(decisionEvidenceLink)
            .where(inArray(decisionEvidenceLink.decisionKey, riskKeys));

      const items = runs.map((run) => {
        const input = record(run.input);
        const trigger = record(input.trigger);
        const risk = record(input.risk);
        const decisionKey = typeof trigger.riskKey === "string" ? trigger.riskKey : run.id;
        const approval = approvals.find((row) => row.runId === run.id);
        const action = actions.find((row) => row.runId === run.id);
        const relatedOutcomes = outcomes.filter((row) => row.decisionKey === decisionKey);
        const verified = relatedOutcomes.filter((row) => row.verificationStatus === "verified");
        return {
          missionRunId: run.id,
          decisionKey,
          title: typeof risk.title === "string" ? risk.title : run.goal,
          riskKind: typeof risk.kind === "string" ? risk.kind : null,
          ownerAgent: typeof risk.ownerAgent === "string" ? risk.ownerAgent : "ONYX",
          severityAtDecision: typeof risk.severity === "string" ? risk.severity : null,
          missionStatus: run.status,
          humanDecision: approval?.status ?? "not_reached",
          decisionNote: approval?.note ?? null,
          chosenAction: action ? { title: action.title, actionType: action.actionType, status: action.status } : null,
          evidenceLinks: evidence.filter((row) => row.decisionKey === decisionKey).length,
          outcomeCount: relatedOutcomes.length,
          verifiedOutcomeCount: verified.length,
          verifiedValue: verified.reduce((sum, row) => sum + Number(row.verifiedValue ?? 0), 0),
          learned:
            verified.length > 0
              ? `A named reviewer verified ${verified.length} measured outcome${verified.length === 1 ? "" : "s"}.`
              : "The result has not been verified yet; XELOR will not claim learned value.",
          startedAt: run.createdAt.toISOString(),
          completedAt: run.completedAt?.toISOString() ?? null,
          decidedAt: approval?.decidedAt?.toISOString() ?? null,
        };
      });
      return {
        summary: {
          decisionsRemembered: countRow?.total ?? runs.length,
          withVerifiedOutcome: items.filter((item) => item.verifiedOutcomeCount > 0).length,
          awaitingHumanDecision: items.filter((item) => item.humanDecision === "pending").length,
          lastDecisionAt: items[0]?.startedAt ?? null,
        },
        items,
        disclosure: "Memory is assembled from immutable mission, approval, action, evidence and outcome records. It does not store hidden model reasoning.",
      };
    });
  }

  async operationalSnapshot() {
    const startedAt = Date.now();
    return withTenant(async (tx) => {
      const [runStats] = await tx
        .select({
          total: sql<number>`count(*)::int`,
          active: sql<number>`count(*) filter (where ${agentRun.status} in ('pending','running','waiting_approval'))::int`,
          completed: sql<number>`count(*) filter (where ${agentRun.status} = 'completed')::int`,
          failed: sql<number>`count(*) filter (where ${agentRun.status} = 'failed')::int`,
        })
        .from(agentRun)
        .where(sql`${agentRun.createdAt} >= now() - interval '24 hours'`);
      const [approvalStats] = await tx
        .select({ pending: sql<number>`count(*) filter (where ${agentApproval.status} = 'pending')::int` })
        .from(agentApproval);
      const [actionStats] = await tx
        .select({ dispatched: sql<number>`count(*)::int` })
        .from(agentActionDispatch)
        .where(sql`${agentActionDispatch.dispatchedAt} >= now() - interval '24 hours'`);
      const [outboxStats] = await tx
        .select({
          pending: sql<number>`count(*)::int`,
          retrying: sql<number>`count(*) filter (where ${outboxEvent.attempts} > 0)::int`,
          oldest: sql<Date | null>`min(${outboxEvent.createdAt})`,
        })
        .from(outboxEvent)
        .where(isNull(outboxEvent.publishedAt));
      const [intelligenceStats] = await tx
        .select({
          evidenceLinks: sql<number>`count(distinct ${decisionEvidenceLink.id})::int`,
        })
        .from(decisionEvidenceLink);
      const [outcomeStats] = await tx
        .select({
          outcomes: sql<number>`count(*)::int`,
          verified: sql<number>`count(*) filter (where ${decisionOutcomeMetric.verificationStatus} = 'verified')::int`,
        })
        .from(decisionOutcomeMetric);
      const oldestAgeSeconds = outboxStats?.oldest
        ? Math.max(0, Math.round((Date.now() - new Date(outboxStats.oldest).getTime()) / 1_000))
        : 0;
      return {
        checkedAt: new Date().toISOString(),
        database: { status: "connected", queryMs: Date.now() - startedAt },
        decisionRuntime24h: {
          total: runStats?.total ?? 0,
          active: runStats?.active ?? 0,
          completed: runStats?.completed ?? 0,
          failed: runStats?.failed ?? 0,
        },
        governance: {
          pendingApprovals: approvalStats?.pending ?? 0,
          governedActions24h: actionStats?.dispatched ?? 0,
        },
        eventDelivery: {
          status: oldestAgeSeconds > 300 ? "attention" : "healthy",
          unpublished: outboxStats?.pending ?? 0,
          retrying: outboxStats?.retrying ?? 0,
          oldestAgeSeconds,
        },
        intelligence: {
          evidenceLinks: intelligenceStats?.evidenceLinks ?? 0,
          outcomes: outcomeStats?.outcomes ?? 0,
          verifiedOutcomes: outcomeStats?.verified ?? 0,
        },
        disclosure: "This MVP view measures database reachability, governed missions, approvals, event delivery and evidence records. Distributed traces and infrastructure-wide alerting remain a production hardening step.",
      };
    });
  }
}

function decimal(value: number | undefined): string | null {
  return value === undefined ? null : value.toFixed(4);
}

function money(value: number | undefined): string | null {
  return value === undefined ? null : value.toFixed(2);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
