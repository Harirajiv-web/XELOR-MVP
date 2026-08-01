import { Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@ind-core/db";
import { AppError, currentTenant, newId } from "@ind-core/platform";
import { AuditLogService } from "../common/audit-log.service.js";

const { decisionEvidenceLink, decisionOutcomeMetric } = schema;

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
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
  attributionStatus: "not_assessed" | "unsupported" | "partial" | "supported";
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
}

function decimal(value: number | undefined): string | null {
  return value === undefined ? null : value.toFixed(4);
}

function money(value: number | undefined): string | null {
  return value === undefined ? null : value.toFixed(2);
}
