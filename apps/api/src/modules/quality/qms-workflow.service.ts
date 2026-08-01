import { Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { schema, withTenant } from "@ind-core/db";
import { currentTenant, eventName, newId, AppError, Errors } from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { currentFyCode, NumberingService } from "../../common/numbering.service.js";
import { fingerprint, runIdempotent } from "../../common/idempotency.js";

const { qmsFinding, qmsCorrectiveAction, qmsInspection, outboxEvent } = schema;

export interface CreateFindingInput {
  sourceType: "inspection" | "audit" | "complaint" | "supplier" | "manual";
  sourceRef: string;
  inspectionId?: string;
  title: string;
  description: string;
  severity: "critical" | "major" | "minor";
  ownerRef: string;
  dueDate?: string;
}

export interface CreateCapaInput {
  findingNo: string;
  title: string;
  actionPlan: string;
  ownerRef: string;
  dueDate: string;
  effectivenessCriteria: string;
}

@Injectable()
export class QmsWorkflowService {
  constructor(private readonly audit: AuditLogService, private readonly numbering: NumberingService) {}

  async listFindings() {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(qmsFinding).where(eq(qmsFinding.isActive, true)).orderBy(desc(qmsFinding.createdAt));
      const inspectionIds = [...new Set(rows.map((row) => row.inspectionId).filter((id): id is string => Boolean(id)))];
      const inspections = inspectionIds.length
        ? await tx.select({ id: qmsInspection.id, inspectionNo: qmsInspection.inspectionNo }).from(qmsInspection)
        : [];
      const inspectionById = new Map(inspections.map((row) => [row.id, row.inspectionNo]));
      return rows.map((row) => ({ ...row, inspectionNo: row.inspectionId ? inspectionById.get(row.inspectionId) ?? null : null }));
    });
  }

  async createFinding(input: CreateFindingInput, key: string) {
    const result = await runIdempotent(key, fingerprint({ operation: "qms.finding.create", input }), async () => ({ status: 201, body: await this.createFindingOnce(input, key) }));
    return result.body;
  }

  private async createFindingOnce(input: CreateFindingInput, key: string) {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      if (input.inspectionId) {
        const inspection = (await tx.select({ id: qmsInspection.id }).from(qmsInspection).where(eq(qmsInspection.id, input.inspectionId)).limit(1))[0];
        if (!inspection) throw Errors.notFound("inspection");
      }
      const id = newId();
      const findingNo = await this.numbering.next(tx, "quality_finding", currentFyCode());
      await tx.insert(qmsFinding).values({ id, tenantId, createdBy: actorId, updatedBy: actorId, findingNo, ...input, inspectionId: input.inspectionId ?? null, dueDate: input.dueDate ?? null, idempotencyKey: key });
      await this.audit.appendInTx(tx, { action: "quality.finding.created", entityType: "qms_finding", entityId: id, data: { findingNo, sourceType: input.sourceType, sourceRef: input.sourceRef, severity: input.severity } });
      return (await tx.select().from(qmsFinding).where(eq(qmsFinding.id, id)).limit(1))[0]!;
    });
  }

  async contain(findingNo: string, containment: string, key: string) {
    return this.mutateFinding(findingNo, key, "contain", async (tx, finding, actorId) => {
      const now = new Date();
      await tx.update(qmsFinding).set({ containment, containedAt: now, status: "contained", updatedAt: now, updatedBy: actorId }).where(eq(qmsFinding.id, finding.id));
      return { containment };
    });
  }

  async confirmRootCause(findingNo: string, rootCause: string, key: string) {
    return this.mutateFinding(findingNo, key, "root-cause", async (tx, finding, actorId) => {
      if (!finding.containment) throw new AppError("QMS_CONTAINMENT_REQUIRED", 409, "Contain the finding before confirming its root cause.");
      const now = new Date();
      await tx.update(qmsFinding).set({ rootCause, rootCauseConfirmedBy: actorId, rootCauseConfirmedAt: now, status: "cause_confirmed", updatedAt: now, updatedBy: actorId }).where(eq(qmsFinding.id, finding.id));
      return { rootCause };
    });
  }

  private async mutateFinding(
    findingNo: string,
    key: string,
    operation: string,
    mutation: (tx: Parameters<Parameters<typeof withTenant>[0]>[0], finding: typeof qmsFinding.$inferSelect, actorId: string) => Promise<Record<string, unknown>>,
  ) {
    const result = await runIdempotent(key, fingerprint({ operation: `qms.finding.${operation}`, findingNo }), async () => ({
      status: 200,
      body: await withTenant(async (tx) => {
        const finding = (await tx.select().from(qmsFinding).where(eq(qmsFinding.findingNo, findingNo)).limit(1))[0];
        if (!finding) throw Errors.notFound(`finding ${findingNo}`);
        const { actorId } = currentTenant();
        const change = await mutation(tx, finding, actorId);
        await this.audit.appendInTx(tx, { action: `quality.finding.${operation}`, entityType: "qms_finding", entityId: finding.id, data: { findingNo, ...change } });
        return (await tx.select().from(qmsFinding).where(eq(qmsFinding.id, finding.id)).limit(1))[0]!;
      }),
    }));
    return result.body;
  }

  async listCapas() {
    return withTenant(async (tx) => {
      const rows = await tx.select({ capa: qmsCorrectiveAction, findingNo: qmsFinding.findingNo, findingTitle: qmsFinding.title }).from(qmsCorrectiveAction).innerJoin(qmsFinding, eq(qmsFinding.id, qmsCorrectiveAction.findingId)).where(eq(qmsCorrectiveAction.isActive, true)).orderBy(desc(qmsCorrectiveAction.createdAt));
      return rows.map((row) => ({ ...row.capa, findingNo: row.findingNo, findingTitle: row.findingTitle }));
    });
  }

  async createCapa(input: CreateCapaInput, key: string) {
    const result = await runIdempotent(key, fingerprint({ operation: "qms.capa.create", input }), async () => ({ status: 201, body: await this.createCapaOnce(input, key) }));
    return result.body;
  }

  private async createCapaOnce(input: CreateCapaInput, key: string) {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const finding = (await tx.select().from(qmsFinding).where(eq(qmsFinding.findingNo, input.findingNo)).limit(1))[0];
      if (!finding) throw Errors.notFound(`finding ${input.findingNo}`);
      if (!finding.rootCause) throw new AppError("QMS_ROOT_CAUSE_REQUIRED", 409, "Confirm the root cause before opening corrective action.");
      const id = newId();
      const capaNo = await this.numbering.next(tx, "corrective_action", currentFyCode());
      await tx.insert(qmsCorrectiveAction).values({ id, tenantId, createdBy: actorId, updatedBy: actorId, capaNo, findingId: finding.id, title: input.title, actionPlan: input.actionPlan, ownerRef: input.ownerRef, dueDate: input.dueDate, effectivenessCriteria: input.effectivenessCriteria, idempotencyKey: key, status: "in_progress" });
      await tx.update(qmsFinding).set({ status: "action_active", updatedBy: actorId, updatedAt: new Date() }).where(eq(qmsFinding.id, finding.id));
      await this.audit.appendInTx(tx, { action: "quality.capa.created", entityType: "qms_corrective_action", entityId: id, data: { capaNo, findingNo: input.findingNo, effectivenessCriteria: input.effectivenessCriteria } });
      return (await tx.select().from(qmsCorrectiveAction).where(eq(qmsCorrectiveAction.id, id)).limit(1))[0]!;
    });
  }

  async completeCapa(capaNo: string, completionEvidence: string, key: string) {
    return this.mutateCapa(capaNo, key, "completed", async (tx, capa, actorId) => {
      const now = new Date();
      await tx.update(qmsCorrectiveAction).set({ completionEvidence, completedAt: now, status: "effectiveness_review", updatedAt: now, updatedBy: actorId }).where(eq(qmsCorrectiveAction.id, capa.id));
      await tx.update(qmsFinding).set({ status: "effectiveness_review", updatedAt: now, updatedBy: actorId }).where(eq(qmsFinding.id, capa.findingId));
      return { completionEvidence };
    });
  }

  async verifyCapa(capaNo: string, effective: boolean, evidence: string, key: string) {
    return this.mutateCapa(capaNo, key, "effectiveness-verified", async (tx, capa, actorId) => {
      if (capa.status !== "effectiveness_review") throw new AppError("QMS_CAPA_NOT_READY", 409, `${capaNo} is not awaiting effectiveness review.`);
      const now = new Date();
      await tx.update(qmsCorrectiveAction).set({ effectivenessResult: effective ? "effective" : "ineffective", effectivenessEvidence: evidence, verifiedBy: actorId, verifiedAt: now, status: effective ? "closed" : "ineffective", updatedAt: now, updatedBy: actorId }).where(eq(qmsCorrectiveAction.id, capa.id));
      if (effective) await tx.update(qmsFinding).set({ status: "closed", closedAt: now, closedBy: actorId, closureReason: `CAPA ${capaNo} verified effective: ${evidence}`, updatedAt: now, updatedBy: actorId }).where(eq(qmsFinding.id, capa.findingId));
      return { effective, evidence };
    });
  }

  private async mutateCapa(
    capaNo: string,
    key: string,
    operation: string,
    mutation: (tx: Parameters<Parameters<typeof withTenant>[0]>[0], capa: typeof qmsCorrectiveAction.$inferSelect, actorId: string) => Promise<Record<string, unknown>>,
  ) {
    const result = await runIdempotent(key, fingerprint({ operation: `qms.capa.${operation}`, capaNo }), async () => ({ status: 200, body: await withTenant(async (tx) => {
      const capa = (await tx.select().from(qmsCorrectiveAction).where(eq(qmsCorrectiveAction.capaNo, capaNo)).limit(1))[0];
      if (!capa) throw Errors.notFound(`CAPA ${capaNo}`);
      const { actorId, tenantId } = currentTenant();
      const change = await mutation(tx, capa, actorId);
      await this.audit.appendInTx(tx, { action: `quality.capa.${operation}`, entityType: "qms_corrective_action", entityId: capa.id, data: { capaNo, ...change } });
      await tx.insert(outboxEvent).values({ id: newId(), tenantId, name: eventName("quality", "capa", operation), payload: { capaNo }, createdAt: new Date() });
      return (await tx.select().from(qmsCorrectiveAction).where(eq(qmsCorrectiveAction.id, capa.id)).limit(1))[0]!;
    }) }));
    return result.body;
  }
}
