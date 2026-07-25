import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, not, sql } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  newId,
  currentTenant,
  eventName,
  canTransition,
  describeHold,
  evaluateCompletionGate,
  holdStopsDowntimeClock,
  labourAmount,
  labourHours,
  requiresClosureApproval,
  resolveLabourRate,
  rollUpCost,
  AppError,
  Errors,
  type CompletionGateFailure,
  type HoldReason,
  type LabourRateConfig,
  type MwoStatus,
  type MwoType,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { WORKFLOW_EXECUTOR, type WorkflowExecutor } from "../../ports/workflow.port.js";
import { DowntimeService } from "./downtime.service.js";

const {
  maintenanceWorkOrder,
  maintenanceAsset,
  maintenanceTechnician,
  maintenanceLabourRate,
  mwoTask,
  mwoLabour,
  mwoSpare,
  mwoExternalCost,
  assetDowntime,
  amcContract,
  amcContractAsset,
  pmOccurrence,
  outboxEvent,
} = schema;

const n = (v: string | null | undefined): number => (v == null ? 0 : Number(v));

/** The closure-approval band. Config, not a constant — overridable per tenant. */
export const DEFAULT_CLOSURE_THRESHOLD = 25000;

export interface CreateMwoInput {
  assetId: string;
  mwoType: MwoType;
  priority: string;
  source: "request" | "pm_occurrence" | "manual" | "inspection_finding";
  requestId?: string;
  pmOccurrenceId?: string;
  title: string;
  description?: string;
  reportedAt: string;
  plannedStart?: string;
  plannedEnd?: string;
  slaRespondBy?: string;
  slaRestoreBy?: string;
  primaryTechRef?: string;
  costCentreRef?: string;
  competentPersonRef?: string;
  idempotencyKey: string;
}

export interface MwoView {
  id: string;
  mwoNo: string;
  assetCode: string;
  assetName: string;
  mwoType: string;
  priority: string;
  status: string;
  title: string;
  primaryTechRef: string | null;
  reportedAt: string;
  actualStart: string | null;
  actualEnd: string | null;
  slaRestoreBy: string | null;
  slaBreached: boolean;
  holdReason: string | null;
  isSafetyRelated: boolean;
  amc: { contractRef: string; validTo: string; coverageType: string } | null;
  warrantyActive: boolean;
  cost: { labour: number; spares: number; external: number; total: number; computedAt: string | null };
  tasks: Array<{ sequence: number; instruction: string; isMandatory: boolean; resultValue: string | null; isPass: boolean | null; completedAt: string | null }>;
  labour: Array<{ employeeRef: string; workType: string; startedAt: string; endedAt: string | null; hours: number | null; ratePerHour: number | null; rateSource: string | null; amount: number | null }>;
  spares: Array<{ id: string; itemCode: string | null; qtyPlanned: number; qtyIssued: number; issueStatus: string; stockEntryRef: string | null; valuedAmount: number }>;
  external: Array<{ sourceDocRef: string; amount: number; description: string | null }>;
  openDowntimeId: string | null;
  approval: { required: boolean; reason: string | null; workflowInstanceId: string | null };
}

/**
 * THE MAINTENANCE WORK ORDER (MAINTENANCE §11.1, §4.C).
 *
 * Not the manufacturing work order. Different table, different series, different
 * permission root — see the module header and `naming-check`.
 *
 * The load-bearing behaviour is the COMPLETION GATE. Everything the reliability views need
 * is something a technician at the end of a shift would rather skip, so the gate refuses
 * completion until the failure is coded, the mandatory checklist is done, the machine has
 * actually been handed back, and somebody's time is on the job — and it reports all of
 * those at once, with the exact task and field, rather than one refusal at a time.
 *
 * The second is HANDBACK. It exists as its own action, before completion, because real
 * technicians give the machine back and write their notes afterwards. Closing the downtime
 * clock when the paperwork is finished would overstate every downtime figure in the plant
 * by however long the paperwork takes.
 */
@Injectable()
export class MwoService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly downtime: DowntimeService,
    @Inject(WORKFLOW_EXECUTOR) private readonly workflow: WorkflowExecutor,
  ) {}

  /* ------------------------------- creation ------------------------------- */

  async create(input: CreateMwoInput): Promise<MwoView> {
    return withTenant(async (tx) => {
      const created = await this.createInTx(tx, input);
      return this.view(tx, created.id);
    });
  }

  async createInTx(tx: Tx, input: CreateMwoInput): Promise<{ id: string; mwoNo: string }> {
    const { tenantId, actorId } = currentTenant();

    const [dup] = await tx
      .select({ id: maintenanceWorkOrder.id, mwoNo: maintenanceWorkOrder.mwoNo })
      .from(maintenanceWorkOrder)
      .where(eq(maintenanceWorkOrder.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (dup) return dup;

    const [asset] = await tx.select().from(maintenanceAsset).where(eq(maintenanceAsset.id, input.assetId)).limit(1);
    if (!asset) throw Errors.notFound("asset");
    if (asset.status === "decommissioned") {
      throw new AppError("ASSET_DECOMMISSIONED", 422, `${asset.assetCode} is decommissioned and cannot take new work.`);
    }

    const id = newId();
    // MWO- series, allocated from a counter of its own. The production order's WO- series
    // is a different counter entirely and the two can never collide (§9.2, naming-check).
    const mwoNo = `MWO-${(id.split("-").pop() ?? id).toUpperCase()}`;
    const amcId = await this.activeAmcFor(tx, asset.id, input.reportedAt.slice(0, 10));

    await tx.insert(maintenanceWorkOrder).values({
      id,
      tenantId,
      createdBy: actorId,
      updatedBy: actorId,
      mwoNo,
      assetId: asset.id,
      mwoType: input.mwoType,
      priority: input.priority,
      status: input.primaryTechRef ? "assigned" : "approved",
      source: input.source,
      requestId: input.requestId ?? null,
      pmOccurrenceId: input.pmOccurrenceId ?? null,
      title: input.title,
      description: input.description ?? null,
      costCentreRef: input.costCentreRef ?? asset.costCentreRef ?? null,
      primaryTechRef: input.primaryTechRef ?? null,
      reportedAt: new Date(input.reportedAt),
      plannedStart: input.plannedStart ? new Date(input.plannedStart) : null,
      plannedEnd: input.plannedEnd ? new Date(input.plannedEnd) : null,
      slaRespondBy: input.slaRespondBy ? new Date(input.slaRespondBy) : null,
      slaRestoreBy: input.slaRestoreBy ? new Date(input.slaRestoreBy) : null,
      respondedAt: input.primaryTechRef ? new Date() : null,
      competentPersonRef: input.competentPersonRef ?? null,
      amcContractId: amcId,
      idempotencyKey: input.idempotencyKey,
    });

    await this.audit.appendInTx(tx, {
      action: "maintenance.mwo.created",
      entityType: "maintenance_work_order",
      entityId: id,
      data: { mwoNo, assetCode: asset.assetCode, mwoType: input.mwoType, priority: input.priority, source: input.source },
    });
    await tx.insert(outboxEvent).values({
      id: newId(),
      tenantId,
      name: eventName("maintenance", "mwo", "created"),
      payload: { mwoNo, assetCode: asset.assetCode, mwoType: input.mwoType, priority: input.priority },
      createdAt: new Date(),
    });

    return { id, mwoNo };
  }

  /* ------------------------------- lifecycle ------------------------------ */

  async assign(mwoNo: string, primaryTechRef: string): Promise<MwoView> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, mwoNo);
      this.assertOpen(m);
      const now = new Date();
      await tx
        .update(maintenanceWorkOrder)
        .set({
          primaryTechRef,
          status: m.status === "draft" || m.status === "approved" ? "assigned" : m.status,
          respondedAt: m.respondedAt ?? now,
          slaBreached: m.slaRespondBy != null && (m.respondedAt ?? now) > m.slaRespondBy,
          updatedBy: actorId,
          updatedAt: now,
        })
        .where(eq(maintenanceWorkOrder.id, m.id));
      await this.audit.appendInTx(tx, {
        action: "maintenance.mwo.assigned",
        entityType: "maintenance_work_order",
        entityId: m.id,
        data: { mwoNo, primaryTechRef, previousTech: m.primaryTechRef },
      });
      return this.view(tx, m.id);
    });
  }

  /** Priority override is a separately granted permission AND a logged reason — one of the
   *  two levers that could quietly flatter the SLA numbers (§14.3). */
  async setPriority(mwoNo: string, priority: string, reason: string): Promise<MwoView> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, mwoNo);
      this.assertOpen(m);
      await tx
        .update(maintenanceWorkOrder)
        .set({ priority, priorityOverrideReason: reason, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(maintenanceWorkOrder.id, m.id));
      await this.audit.appendInTx(tx, {
        action: "maintenance.mwo.prioritised",
        entityType: "maintenance_work_order",
        entityId: m.id,
        data: { mwoNo, from: m.priority, to: priority, reason },
      });
      return this.view(tx, m.id);
    });
  }

  /**
   * Start work. Server-timestamped, opens a labour row, and — for a breakdown on an asset
   * that is not already down — opens the downtime interval. If the asset IS already down,
   * this job JOINS that interval rather than opening a second clock.
   */
  async start(mwoNo: string, employeeRef: string, at?: string): Promise<MwoView> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, mwoNo);
      this.assertTransition(m.status as MwoStatus, "in_progress");
      const now = at ? new Date(at) : new Date();

      const open = await this.downtime.openFor(tx, m.assetId);
      if (!open && m.mwoType === "breakdown") {
        const dt = await this.downtime.startInTx(tx, {
          assetId: m.assetId,
          startedAt: now.toISOString(),
          kind: "unplanned",
          productionImpacting: true,
          reasonCode: "mechanical",
          source: "mwo",
          mwoId: m.id,
          idempotencyKey: `${m.id}:start-downtime`,
        });
        void dt;
      } else if (open && !open.mwoId) {
        await tx.update(assetDowntime).set({ mwoId: m.id }).where(eq(assetDowntime.id, open.id));
      }

      await this.openLabourInTx(tx, m.id, employeeRef, now.toISOString(), "repair");

      await tx
        .update(maintenanceWorkOrder)
        .set({
          status: "in_progress",
          actualStart: m.actualStart ?? now,
          respondedAt: m.respondedAt ?? now,
          holdReason: null,
          updatedBy: actorId,
          updatedAt: now,
        })
        .where(eq(maintenanceWorkOrder.id, m.id));

      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId: currentTenant().tenantId,
        name: eventName("maintenance", "mwo", "started"),
        payload: { mwoNo, employeeRef, at: now.toISOString() },
        createdAt: now,
      });
      return this.view(tx, m.id);
    });
  }

  /**
   * Put the job on hold. The response states, in plain English, whether the downtime clock
   * keeps running — and for `awaiting_production_window` it actually STOPS it, because the
   * machine is back with production even though the paperwork is not finished.
   */
  async hold(mwoNo: string, reason: HoldReason, note?: string): Promise<MwoView & { downtimeNote: string }> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, mwoNo);
      this.assertTransition(m.status as MwoStatus, "on_hold");
      const now = new Date();

      await this.closeOpenLabourInTx(tx, m.id, now.toISOString());

      if (holdStopsDowntimeClock(reason)) {
        const open = await this.downtime.openFor(tx, m.assetId);
        if (open) await this.downtime.endInTx(tx, open.id, now.toISOString());
      }

      await tx
        .update(maintenanceWorkOrder)
        .set({ status: "on_hold", holdReason: reason, holdNote: note ?? null, heldAt: now, updatedBy: actorId, updatedAt: now })
        .where(eq(maintenanceWorkOrder.id, m.id));
      await this.audit.appendInTx(tx, {
        action: "maintenance.mwo.held",
        entityType: "maintenance_work_order",
        entityId: m.id,
        data: { mwoNo, reason, note: note ?? null, clockStopped: holdStopsDowntimeClock(reason) },
      });

      const view = await this.view(tx, m.id);
      return { ...view, downtimeNote: describeHold(reason) };
    });
  }

  async resume(mwoNo: string, employeeRef: string): Promise<MwoView> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, mwoNo);
      this.assertTransition(m.status as MwoStatus, "in_progress");
      const now = new Date();
      await this.openLabourInTx(tx, m.id, employeeRef, now.toISOString(), "repair");
      await tx
        .update(maintenanceWorkOrder)
        .set({ status: "in_progress", holdReason: null, holdNote: null, updatedBy: actorId, updatedAt: now })
        .where(eq(maintenanceWorkOrder.id, m.id));
      return this.view(tx, m.id);
    });
  }

  /** "Machine handed back" — the moment that ends the downtime interval, deliberately
   *  separate from and earlier than completion (§6.2 step 5). */
  async handback(mwoNo: string, at?: string): Promise<{ mwoNo: string; downtimeClosed: string | null; durationMinutes: number | null }> {
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, mwoNo);
      const open = await this.downtime.openFor(tx, m.assetId);
      if (!open) return { mwoNo, downtimeClosed: null, durationMinutes: null };
      const closed = await this.downtime.endInTx(tx, open.id, at ?? new Date().toISOString());
      await this.audit.appendInTx(tx, {
        action: "maintenance.mwo.handback",
        entityType: "maintenance_work_order",
        entityId: m.id,
        data: { mwoNo, downtimeId: closed.id, durationMinutes: closed.durationMinutes },
      });
      return { mwoNo, downtimeClosed: closed.id, durationMinutes: closed.durationMinutes };
    });
  }

  /**
   * Complete. Runs the gate; on failure returns EVERY unmet condition (422
   * `MWO_COMPLETION_BLOCKED`) so the UI renders a checklist with jump links rather than a
   * generic toast. On success the cost snapshot is frozen and, above the threshold or on a
   * safety-related job, a W1 approval instance is opened.
   */
  async complete(
    mwoNo: string,
    input: {
      failureModeCode?: string;
      failureCauseCode?: string;
      detectionCode?: string;
      failedComponentCode?: string;
      competentPersonRef?: string;
      closureThreshold?: number;
      at?: string;
    } = {},
  ): Promise<MwoView> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, mwoNo);
      this.assertTransition(m.status as MwoStatus, "completed");
      const now = input.at ? new Date(input.at) : new Date();

      const codes = await this.resolveFailureCodes(tx, input);
      const competentPersonRef = input.competentPersonRef ?? m.competentPersonRef;

      // Close any labour still running before the gate counts it.
      await this.closeOpenLabourInTx(tx, m.id, now.toISOString());

      const tasks = await tx.select().from(mwoTask).where(eq(mwoTask.mwoId, m.id)).orderBy(asc(mwoTask.sequence));
      const labour = await tx.select().from(mwoLabour).where(eq(mwoLabour.mwoId, m.id));
      const openDt = await tx
        .select({ id: assetDowntime.id })
        .from(assetDowntime)
        .where(and(eq(assetDowntime.assetId, m.assetId), isNull(assetDowntime.endedAt)));

      const failures: CompletionGateFailure[] = evaluateCompletionGate({
        mwoType: m.mwoType as MwoType,
        tasks: tasks.map((t) => ({
          sequence: t.sequence,
          instruction: t.instruction,
          isMandatory: t.isMandatory,
          completedAt: t.completedAt?.toISOString() ?? null,
        })),
        openDowntimeIds: openDt.map((d) => d.id),
        failureModeId: codes.failureModeId ?? m.failureModeId,
        failureCauseId: codes.failureCauseId ?? m.failureCauseId,
        detectionId: codes.detectionId ?? m.detectionId,
        requiresCompetentPerson: m.mwoType === "statutory",
        competentPersonRef,
        labourRowCount: labour.length,
      });

      if (failures.length > 0) {
        throw new AppError(
          "MWO_COMPLETION_BLOCKED",
          422,
          `${mwoNo} cannot be completed yet — ${failures.length} condition(s) unmet.`,
          failures.map((f) => ({
            field: f.gate,
            message:
              f.gate === "mandatory_task_incomplete"
                ? `task ${f.taskSeq}: ${f.instruction}`
                : f.gate === "failure_code_required"
                  ? `${f.field} is required on a ${m.mwoType} work order`
                  : (f.hint ?? f.gate),
          })),
        );
      }

      const snapshot = await this.recomputeCostInTx(tx, m.id);
      const approval = requiresClosureApproval(
        snapshot,
        m.isSafetyRelated,
        input.closureThreshold ?? DEFAULT_CLOSURE_THRESHOLD,
      );

      await tx
        .update(maintenanceWorkOrder)
        .set({
          status: "completed",
          actualEnd: now,
          failureModeId: codes.failureModeId ?? m.failureModeId,
          failureCauseId: codes.failureCauseId ?? m.failureCauseId,
          detectionId: codes.detectionId ?? m.detectionId,
          failedComponentId: codes.failedComponentId ?? m.failedComponentId,
          competentPersonRef,
          approvalRequiredReason: approval.reason,
          updatedBy: actorId,
          updatedAt: now,
        })
        .where(eq(maintenanceWorkOrder.id, m.id));

      // The PM occurrence this job came from is closed WITH it, inside the same
      // transaction, so compliance can never drift from the work that was actually done.
      if (m.pmOccurrenceId) await this.completeOccurrenceInTx(tx, m.pmOccurrenceId, now);

      if (approval.required) {
        const instance = await this.workflow.start(
          { definitionCode: "mwo_closure_approval", subjectType: "maintenance_work_order", subjectId: m.id },
          `${m.id}:closure`,
        );
        await tx
          .update(maintenanceWorkOrder)
          .set({ workflowInstanceId: instance.id })
          .where(eq(maintenanceWorkOrder.id, m.id));
      }

      await this.audit.appendInTx(tx, {
        action: "maintenance.mwo.completed",
        entityType: "maintenance_work_order",
        entityId: m.id,
        data: { mwoNo, cost: snapshot, approvalRequired: approval.required, reason: approval.reason },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("maintenance", "mwo", "completed"),
        payload: { mwoNo, costTotal: snapshot.costTotal, approvalRequired: approval.required },
        createdAt: now,
      });

      return this.view(tx, m.id);
    });
  }

  /** Terminal. Freezes the cost snapshot; the database refuses every later edit. */
  async close(mwoNo: string): Promise<MwoView> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, mwoNo);
      this.assertTransition(m.status as MwoStatus, "closed");

      if (m.workflowInstanceId) {
        const wf = await this.workflow.get(m.workflowInstanceId);
        if (wf.instance.status !== "approved") {
          throw new AppError(
            "MWO_APPROVAL_PENDING",
            409,
            `${mwoNo} needs approval before closure (${m.approvalRequiredReason ?? "policy"}); the workflow is ${wf.instance.status}.`,
          );
        }
      }

      const now = new Date();
      await tx
        .update(maintenanceWorkOrder)
        .set({ status: "closed", closedAt: now, updatedBy: actorId, updatedAt: now })
        .where(eq(maintenanceWorkOrder.id, m.id));

      // An AMC-covered visit counts against the contract, which is what makes the renewal
      // conversation evidence-based rather than a negotiation about impressions.
      if (m.amcContractId && (m.mwoType === "preventive" || m.mwoType === "statutory")) {
        await tx
          .update(amcContract)
          .set({ visitsUsed: sql`${amcContract.visitsUsed} + 1`, updatedBy: actorId })
          .where(eq(amcContract.id, m.amcContractId));
      }

      await this.audit.appendInTx(tx, {
        action: "maintenance.mwo.closed",
        entityType: "maintenance_work_order",
        entityId: m.id,
        data: { mwoNo, costTotal: n(m.costTotal) },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("maintenance", "mwo", "closed"),
        payload: { mwoNo, costTotal: n(m.costTotal), assetId: m.assetId },
        createdAt: now,
      });
      return this.view(tx, m.id);
    });
  }

  async cancel(mwoNo: string, reason: string): Promise<MwoView> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, mwoNo);
      this.assertTransition(m.status as MwoStatus, "cancelled");
      const now = new Date();
      // Cancelling closes any downtime THIS job opened. It reverses nothing in Inventory:
      // a spare that was drawn stays drawn, and a return is a separate receipt.
      const opened = await tx
        .select()
        .from(assetDowntime)
        .where(and(eq(assetDowntime.mwoId, m.id), isNull(assetDowntime.endedAt)));
      for (const d of opened) await this.downtime.endInTx(tx, d.id, now.toISOString());
      await this.closeOpenLabourInTx(tx, m.id, now.toISOString());

      await tx
        .update(maintenanceWorkOrder)
        .set({ status: "cancelled", cancelReason: reason, updatedBy: actorId, updatedAt: now })
        .where(eq(maintenanceWorkOrder.id, m.id));
      await this.audit.appendInTx(tx, {
        action: "maintenance.mwo.cancelled",
        entityType: "maintenance_work_order",
        entityId: m.id,
        data: { mwoNo, reason, downtimeClosed: opened.length },
      });
      return this.view(tx, m.id);
    });
  }

  /** Safety flag hands the INCIDENT to Inspection (M08), which owns that register. This
   *  module records only the hand-off reference and never builds an incident record. */
  async flagSafety(mwoNo: string, note: string): Promise<{ mwoNo: string; incidentRef: string }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, mwoNo);
      const incidentRef = `INS-HANDOFF-${(m.id.split("-").pop() ?? m.id).toUpperCase()}`;
      await tx
        .update(maintenanceWorkOrder)
        .set({ isSafetyRelated: true, incidentRef, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(maintenanceWorkOrder.id, m.id));
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("maintenance", "mwo", "safety-flagged"),
        payload: { mwoNo, incidentRef, note, assetId: m.assetId },
        createdAt: new Date(),
      });
      await this.audit.appendInTx(tx, {
        action: "maintenance.mwo.safety_flagged",
        entityType: "maintenance_work_order",
        entityId: m.id,
        data: { mwoNo, incidentRef, note },
      });
      return { mwoNo, incidentRef };
    });
  }

  /* --------------------------------- tasks -------------------------------- */

  async addTask(
    mwoNo: string,
    task: { instruction: string; isMandatory?: boolean; resultType?: string; expectedMin?: number; expectedMax?: number; uom?: string; safetyNote?: string },
  ): Promise<{ sequence: number }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, mwoNo);
      const [last] = await tx
        .select({ sequence: mwoTask.sequence })
        .from(mwoTask)
        .where(eq(mwoTask.mwoId, m.id))
        .orderBy(desc(mwoTask.sequence))
        .limit(1);
      const sequence = (last?.sequence ?? 0) + 1;
      await tx.insert(mwoTask).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        mwoId: m.id,
        sequence,
        instruction: task.instruction,
        safetyNote: task.safetyNote ?? null,
        resultType: task.resultType ?? "ok_not_ok",
        expectedMin: task.expectedMin?.toFixed(4) ?? null,
        expectedMax: task.expectedMax?.toFixed(4) ?? null,
        uom: task.uom ?? null,
        isMandatory: task.isMandatory ?? true,
      });
      return { sequence };
    });
  }

  /** A numeric result is judged against the range stored ON THE TASK, so a template
   *  revision cannot retroactively change whether a past reading passed. */
  async recordTaskResult(mwoNo: string, sequence: number, value: string): Promise<{ sequence: number; isPass: boolean | null }> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, mwoNo);
      const [t] = await tx
        .select()
        .from(mwoTask)
        .where(and(eq(mwoTask.mwoId, m.id), eq(mwoTask.sequence, sequence)))
        .limit(1);
      if (!t) throw Errors.notFound(`task ${sequence} on ${mwoNo}`);

      let isPass: boolean | null = null;
      if (t.resultType === "numeric") {
        const v = Number(value);
        if (!Number.isFinite(v)) {
          throw Errors.validation([{ field: "value", message: `task ${sequence} expects a number` }]);
        }
        const lo = t.expectedMin == null ? -Infinity : n(t.expectedMin);
        const hi = t.expectedMax == null ? Infinity : n(t.expectedMax);
        isPass = v >= lo && v <= hi;
      } else if (t.resultType === "ok_not_ok") {
        isPass = /^(ok|pass|yes|true)$/i.test(value.trim());
      }

      await tx
        .update(mwoTask)
        .set({ resultValue: value, isPass, completedBy: actorId, completedAt: new Date(), updatedBy: actorId })
        .where(eq(mwoTask.id, t.id));
      return { sequence, isPass };
    });
  }

  /* --------------------------------- labour ------------------------------- */

  /**
   * Close a labour row and value it at the AS-OF rate.
   *
   * The rate is resolved for the WORK DATE, HRM-first. A rise granted in October therefore
   * cannot restate a job done in July — the same discipline the payroll rate book uses,
   * for the same reason.
   */
  async stopLabour(mwoNo: string, employeeRef: string, at?: string): Promise<{ hours: number; ratePerHour: number; amount: number; rateSource: string }> {
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, mwoNo);
      const closed = await this.closeOpenLabourInTx(tx, m.id, at ?? new Date().toISOString(), employeeRef);
      if (closed.length === 0) throw new AppError("NO_OPEN_LABOUR", 422, `No open labour row for that technician on ${mwoNo}.`);
      await this.recomputeCostInTx(tx, m.id);
      const r = closed[0]!;
      return { hours: r.hours, ratePerHour: r.ratePerHour, amount: r.amount, rateSource: r.rateSource };
    });
  }

  /** Back-entered labour: allowed, but flagged and reasoned, and visibly marked in the
   *  audit trail. The overlap constraint still applies — a fitter cannot be in two places
   *  retrospectively either. */
  async addLabour(
    mwoNo: string,
    input: { employeeRef: string; startedAt: string; endedAt: string; workType?: string; backdateReason?: string; note?: string },
  ): Promise<{ hours: number; amount: number; ratePerHour: number; rateSource: string }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, mwoNo);
      const rate = await this.resolveRateInTx(tx, input.employeeRef, input.startedAt.slice(0, 10));
      const hours = labourHours(input.startedAt, input.endedAt);
      const amount = labourAmount(hours, rate.ratePerHour);
      const id = newId();
      try {
        await tx.transaction(async (t) => {
          await t.insert(mwoLabour).values({
            id,
            tenantId,
            createdBy: actorId,
            updatedBy: actorId,
            mwoId: m.id,
            employeeRef: input.employeeRef,
            workType: input.workType ?? "repair",
            startedAt: new Date(input.startedAt),
            endedAt: new Date(input.endedAt),
            trade: rate.trade,
            grade: rate.grade,
            rateSource: rate.source,
            rateConfigRef: rate.configRef,
            ratePerHour: rate.ratePerHour.toFixed(2),
            amount: amount.toFixed(2),
            isBackdated: true,
            backdateReason: input.backdateReason ?? "entered after the fact",
            note: input.note ?? null,
          });
        });
      } catch (e) {
        if ((e as { code?: string }).code === "23P01") {
          throw new AppError(
            "LABOUR_OVERLAP",
            409,
            `That technician already has labour recorded overlapping ${input.startedAt} – ${input.endedAt}. A fitter cannot be in two places.`,
          );
        }
        throw e;
      }
      await this.recomputeCostInTx(tx, m.id);
      return { hours, amount, ratePerHour: rate.ratePerHour, rateSource: rate.source };
    });
  }

  /* ---------------------------------- cost -------------------------------- */

  async recomputeCost(mwoNo: string): Promise<{ mwoNo: string; costLabour: number; costSpares: number; costExternal: number; costTotal: number }> {
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, mwoNo);
      const s = await this.recomputeCostInTx(tx, m.id);
      return { mwoNo, ...s };
    });
  }

  async recomputeCostInTx(tx: Tx, mwoId: string): Promise<{ costLabour: number; costSpares: number; costExternal: number; costTotal: number }> {
    const { actorId } = currentTenant();
    const labour = await tx.select({ amount: mwoLabour.amount }).from(mwoLabour).where(eq(mwoLabour.mwoId, mwoId));
    const spares = await tx
      .select({ valuedAmount: mwoSpare.valuedAmount, issueStatus: mwoSpare.issueStatus })
      .from(mwoSpare)
      .where(eq(mwoSpare.mwoId, mwoId));
    const external = await tx.select({ amount: mwoExternalCost.amount }).from(mwoExternalCost).where(eq(mwoExternalCost.mwoId, mwoId));

    const snapshot = rollUpCost({
      labour: labour.map((l) => ({ amount: l.amount == null ? null : n(l.amount) })),
      // Only what INVENTORY actually posted counts. A planned line is a plan.
      spares: spares.filter((s) => s.issueStatus === "issued" || s.issueStatus === "returned").map((s) => ({ valuedAmount: n(s.valuedAmount) })),
      external: external.map((e) => ({ amount: n(e.amount) })),
    });

    await tx
      .update(maintenanceWorkOrder)
      .set({
        costLabour: snapshot.costLabour.toFixed(2),
        costSpares: snapshot.costSpares.toFixed(2),
        costExternal: snapshot.costExternal.toFixed(2),
        costComputedAt: new Date(),
        updatedBy: actorId,
      })
      .where(eq(maintenanceWorkOrder.id, mwoId));
    return snapshot;
  }

  /** External demand: an EVENT to Expenditure/Purchase. Maintenance never books a bill. */
  async requestExternalWork(
    mwoNo: string,
    input: { estimatedAmount: number; description: string; vendorRef?: string },
  ): Promise<{ mwoNo: string; demandRef: string; amcContractRef: string | null }> {
    const { tenantId } = currentTenant();
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, mwoNo);
      const [amc] = m.amcContractId
        ? await tx.select().from(amcContract).where(eq(amcContract.id, m.amcContractId)).limit(1)
        : [null];
      const demandRef = `EXTREQ-${(newId().split("-").pop() ?? "").toUpperCase()}`;
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("maintenance", "external-work", "requested"),
        payload: {
          demandRef,
          mwoNo,
          assetId: m.assetId,
          costCentreRef: m.costCentreRef,
          estimatedAmount: input.estimatedAmount,
          description: input.description,
          vendorRef: input.vendorRef ?? amc?.vendorRef ?? null,
          amcContractRef: amc?.contractRef ?? null,
        },
        createdAt: new Date(),
      });
      await this.audit.appendInTx(tx, {
        action: "maintenance.external_work.requested",
        entityType: "maintenance_work_order",
        entityId: m.id,
        data: { demandRef, estimatedAmount: input.estimatedAmount, vendorRef: input.vendorRef ?? amc?.vendorRef ?? null },
      });
      return { mwoNo, demandRef, amcContractRef: amc?.contractRef ?? null };
    });
  }

  /** Mirror an actual back from Expenditure/Purchase. Idempotent on the event id, so a
   *  redelivered event is a no-op rather than a double charge. */
  async recordExternalActual(input: {
    mwoNo: string;
    sourceModule: "expenditure" | "purchase";
    sourceDocRef: string;
    amount: number;
    description?: string;
    vendorRef?: string;
    eventId: string;
  }): Promise<{ mwoNo: string; recorded: boolean; costTotal: number }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, input.mwoNo);
      const inserted = await tx
        .insert(mwoExternalCost)
        .values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          mwoId: m.id,
          vendorRef: input.vendorRef ?? null,
          sourceModule: input.sourceModule,
          sourceDocRef: input.sourceDocRef,
          amount: input.amount.toFixed(2),
          description: input.description ?? null,
          recognisedAt: new Date(),
          eventId: input.eventId,
        })
        .onConflictDoNothing({ target: [mwoExternalCost.tenantId, mwoExternalCost.eventId] })
        .returning({ id: mwoExternalCost.id });
      const snapshot = await this.recomputeCostInTx(tx, m.id);
      return { mwoNo: input.mwoNo, recorded: inserted.length > 0, costTotal: snapshot.costTotal };
    });
  }

  /* -------------------------------- reads --------------------------------- */

  async get(mwoNo: string): Promise<MwoView> {
    return withTenant(async (tx) => {
      const m = await this.byNoInTx(tx, mwoNo);
      return this.view(tx, m.id);
    });
  }

  async board(filter: { status?: string[]; assignee?: string; assetId?: string } = {}): Promise<MwoView[]> {
    return withTenant(async (tx) => {
      // The board shows live work by default; an explicit status filter replaces that,
      // which is how a manager reviews last month's closed jobs.
      const conds = [
        filter.status
          ? inArray(maintenanceWorkOrder.status, filter.status)
          : not(inArray(maintenanceWorkOrder.status, ["closed", "cancelled"])),
      ];
      if (filter.assignee) conds.push(eq(maintenanceWorkOrder.primaryTechRef, filter.assignee));
      if (filter.assetId) conds.push(eq(maintenanceWorkOrder.assetId, filter.assetId));
      const rows = await tx
        .select({ id: maintenanceWorkOrder.id })
        .from(maintenanceWorkOrder)
        .where(and(...conds))
        .orderBy(asc(maintenanceWorkOrder.priority), asc(maintenanceWorkOrder.slaRestoreBy));
      const out: MwoView[] = [];
      for (const r of rows) out.push(await this.view(tx, r.id));
      return out;
    });
  }

  /* -------------------------------- helpers ------------------------------- */

  async byNoInTx(tx: Tx, mwoNo: string) {
    const [m] = await tx.select().from(maintenanceWorkOrder).where(eq(maintenanceWorkOrder.mwoNo, mwoNo)).limit(1);
    if (!m) throw Errors.notFound(`MWO ${mwoNo}`);
    return m;
  }

  private assertOpen(m: { mwoNo: string; status: string }): void {
    if (["closed", "cancelled"].includes(m.status)) {
      throw new AppError("MWO_NOT_OPEN", 409, `${m.mwoNo} is ${m.status} and is frozen.`);
    }
  }

  private assertTransition(from: MwoStatus, to: MwoStatus): void {
    if (!canTransition(from, to)) {
      throw new AppError("MWO_INVALID_TRANSITION", 409, `A maintenance work order cannot go from '${from}' to '${to}'.`);
    }
  }

  private async openLabourInTx(tx: Tx, mwoId: string, employeeRef: string, startedAt: string, workType: string): Promise<void> {
    const { tenantId, actorId } = currentTenant();
    const [already] = await tx
      .select({ id: mwoLabour.id })
      .from(mwoLabour)
      .where(and(eq(mwoLabour.mwoId, mwoId), eq(mwoLabour.employeeRef, employeeRef), isNull(mwoLabour.endedAt)))
      .limit(1);
    if (already) return; // starting twice is a double-tap, not a second job

    try {
      await tx.transaction(async (t) => {
        await t.insert(mwoLabour).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          mwoId,
          employeeRef,
          workType,
          startedAt: new Date(startedAt),
        });
      });
    } catch (e) {
      if ((e as { code?: string }).code === "23P01") {
        throw new AppError(
          "LABOUR_OVERLAP",
          409,
          "That technician is already recorded as working on another job at this time. Stop the other job first.",
        );
      }
      throw e;
    }
  }

  private async closeOpenLabourInTx(
    tx: Tx,
    mwoId: string,
    at: string,
    employeeRef?: string,
  ): Promise<Array<{ hours: number; ratePerHour: number; amount: number; rateSource: string }>> {
    const { actorId } = currentTenant();
    const conds = [eq(mwoLabour.mwoId, mwoId), isNull(mwoLabour.endedAt)];
    if (employeeRef) conds.push(eq(mwoLabour.employeeRef, employeeRef));
    const open = await tx.select().from(mwoLabour).where(and(...conds));

    const out: Array<{ hours: number; ratePerHour: number; amount: number; rateSource: string }> = [];
    for (const l of open) {
      const rate = await this.resolveRateInTx(tx, l.employeeRef, l.startedAt.toISOString().slice(0, 10));
      const hours = labourHours(l.startedAt.toISOString(), at);
      const amount = labourAmount(hours, rate.ratePerHour);
      await tx
        .update(mwoLabour)
        .set({
          endedAt: new Date(at),
          trade: rate.trade,
          grade: rate.grade,
          rateSource: rate.source,
          rateConfigRef: rate.configRef,
          ratePerHour: rate.ratePerHour.toFixed(2),
          amount: amount.toFixed(2),
          updatedBy: actorId,
        })
        .where(eq(mwoLabour.id, l.id));
      out.push({ hours, ratePerHour: rate.ratePerHour, amount, rateSource: rate.source });
    }
    return out;
  }

  private async resolveRateInTx(
    tx: Tx,
    employeeRef: string,
    workDate: string,
  ): Promise<{ ratePerHour: number; source: "hrm" | "local_config"; configRef: string; trade: string; grade: string | null }> {
    const [tech] = await tx
      .select()
      .from(maintenanceTechnician)
      .where(eq(maintenanceTechnician.employeeRef, employeeRef))
      .limit(1);
    if (!tech) {
      throw new AppError(
        "TECHNICIAN_NOT_REGISTERED",
        422,
        `No maintenance trade is registered for that employee, so their time cannot be valued. Add a technician profile first.`,
      );
    }
    const rows = await tx.select().from(maintenanceLabourRate);
    const configs: LabourRateConfig[] = rows.map((r) => ({
      trade: r.trade,
      grade: r.grade,
      ratePerHour: n(r.ratePerHour),
      otMultiplier: n(r.otMultiplier),
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      source: "local_config",
    }));
    const resolved = resolveLabourRate(configs, tech.trade, tech.grade, workDate);
    return { ...resolved, trade: tech.trade, grade: tech.grade };
  }

  private async resolveFailureCodes(
    tx: Tx,
    input: { failureModeCode?: string; failureCauseCode?: string; detectionCode?: string; failedComponentCode?: string },
  ): Promise<{ failureModeId: string | null; failureCauseId: string | null; detectionId: string | null; failedComponentId: string | null }> {
    const codeId = async (code: string | undefined, kind: string): Promise<string | null> => {
      if (!code) return null;
      const [row] = await tx
        .select({ id: schema.failureCode.id })
        .from(schema.failureCode)
        .where(and(eq(schema.failureCode.code, code), eq(schema.failureCode.kind, kind)))
        .limit(1);
      if (!row) throw Errors.notFound(`failure ${kind} '${code}'`);
      return row.id;
    };
    const failureModeId = await codeId(input.failureModeCode, "mode");
    const failureCauseId = await codeId(input.failureCauseCode, "cause");
    const detectionId = await codeId(input.detectionCode, "detection");
    let failedComponentId: string | null = null;
    if (input.failedComponentCode) {
      const [c] = await tx
        .select({ id: maintenanceAsset.id })
        .from(maintenanceAsset)
        .where(eq(maintenanceAsset.assetCode, input.failedComponentCode))
        .limit(1);
      if (!c) throw Errors.notFound(`component ${input.failedComponentCode}`);
      failedComponentId = c.id;
    }
    return { failureModeId, failureCauseId, detectionId, failedComponentId };
  }

  private async completeOccurrenceInTx(tx: Tx, occurrenceId: string, at: Date): Promise<void> {
    const { actorId } = currentTenant();
    const [occ] = await tx.select().from(pmOccurrence).where(eq(pmOccurrence.id, occurrenceId)).limit(1);
    if (!occ || !occ.dueDate) return;
    const grace = occ.graceDaysSnapshot ?? 0;
    const graceEnd = new Date(`${occ.dueDate}T00:00:00+05:30`);
    graceEnd.setUTCDate(graceEnd.getUTCDate() + grace + 1);
    await tx
      .update(pmOccurrence)
      .set({
        status: "completed",
        completedAt: at,
        completedWithinGrace: at < graceEnd,
        updatedBy: actorId,
        updatedAt: at,
      })
      .where(eq(pmOccurrence.id, occurrenceId));
  }

  private async activeAmcFor(tx: Tx, assetId: string, onDate: string): Promise<string | null> {
    const rows = await tx
      .select({ id: amcContract.id, validFrom: amcContract.validFrom, validTo: amcContract.validTo })
      .from(amcContractAsset)
      .innerJoin(amcContract, eq(amcContract.id, amcContractAsset.amcContractId))
      .where(eq(amcContractAsset.assetId, assetId));
    const hit = rows.find((r) => r.validFrom <= onDate && r.validTo >= onDate);
    return hit?.id ?? null;
  }

  async view(tx: Tx, mwoId: string): Promise<MwoView> {
    const [m] = await tx.select().from(maintenanceWorkOrder).where(eq(maintenanceWorkOrder.id, mwoId)).limit(1);
    if (!m) throw Errors.notFound("MWO");
    const [a] = await tx.select().from(maintenanceAsset).where(eq(maintenanceAsset.id, m.assetId)).limit(1);
    const tasks = await tx.select().from(mwoTask).where(eq(mwoTask.mwoId, mwoId)).orderBy(asc(mwoTask.sequence));
    const labour = await tx.select().from(mwoLabour).where(eq(mwoLabour.mwoId, mwoId)).orderBy(asc(mwoLabour.startedAt));
    const spares = await tx.select().from(mwoSpare).where(eq(mwoSpare.mwoId, mwoId));
    const external = await tx.select().from(mwoExternalCost).where(eq(mwoExternalCost.mwoId, mwoId));
    const [open] = await tx
      .select({ id: assetDowntime.id })
      .from(assetDowntime)
      .where(and(eq(assetDowntime.assetId, m.assetId), isNull(assetDowntime.endedAt)))
      .limit(1);
    const [amc] = m.amcContractId
      ? await tx.select().from(amcContract).where(eq(amcContract.id, m.amcContractId)).limit(1)
      : [null];

    const today = new Date().toISOString().slice(0, 10);
    return {
      id: m.id,
      mwoNo: m.mwoNo,
      assetCode: a!.assetCode,
      assetName: a!.name,
      mwoType: m.mwoType,
      priority: m.priority,
      status: m.status,
      title: m.title,
      primaryTechRef: m.primaryTechRef,
      reportedAt: m.reportedAt.toISOString(),
      actualStart: m.actualStart?.toISOString() ?? null,
      actualEnd: m.actualEnd?.toISOString() ?? null,
      slaRestoreBy: m.slaRestoreBy?.toISOString() ?? null,
      slaBreached: m.slaBreached,
      holdReason: m.holdReason,
      isSafetyRelated: m.isSafetyRelated,
      amc: amc ? { contractRef: amc.contractRef, validTo: amc.validTo, coverageType: amc.coverageType } : null,
      warrantyActive: a!.warrantyEndDate != null && a!.warrantyEndDate >= today,
      cost: {
        labour: n(m.costLabour),
        spares: n(m.costSpares),
        external: n(m.costExternal),
        total: n(m.costTotal),
        computedAt: m.costComputedAt?.toISOString() ?? null,
      },
      tasks: tasks.map((t) => ({
        sequence: t.sequence,
        instruction: t.instruction,
        isMandatory: t.isMandatory,
        resultValue: t.resultValue,
        isPass: t.isPass,
        completedAt: t.completedAt?.toISOString() ?? null,
      })),
      labour: labour.map((l) => ({
        employeeRef: l.employeeRef,
        workType: l.workType,
        startedAt: l.startedAt.toISOString(),
        endedAt: l.endedAt?.toISOString() ?? null,
        hours: l.hours == null ? null : n(l.hours),
        ratePerHour: l.ratePerHour == null ? null : n(l.ratePerHour),
        rateSource: l.rateSource,
        amount: l.amount == null ? null : n(l.amount),
      })),
      spares: spares.map((s) => ({
        id: s.id,
        itemCode: s.itemCodeCache,
        qtyPlanned: n(s.qtyPlanned),
        qtyIssued: n(s.qtyIssued),
        issueStatus: s.issueStatus,
        stockEntryRef: s.stockEntryRef,
        valuedAmount: n(s.valuedAmount),
      })),
      external: external.map((e) => ({ sourceDocRef: e.sourceDocRef, amount: n(e.amount), description: e.description })),
      openDowntimeId: open?.id ?? null,
      approval: {
        required: m.approvalRequiredReason != null,
        reason: m.approvalRequiredReason,
        workflowInstanceId: m.workflowInstanceId,
      },
    };
  }
}
