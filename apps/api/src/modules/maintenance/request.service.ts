import { Injectable } from "@nestjs/common";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  newId,
  currentTenant,
  eventName,
  resolveSla,
  slaDeadlines,
  AppError,
  Errors,
  type Criticality,
  type Severity,
  type SlaMatrixRow,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { NumberingService, fyCode } from "../../common/numbering.service.js";
import { AssetService } from "./asset.service.js";
import { DowntimeService } from "./downtime.service.js";
import { MwoService } from "./mwo.service.js";

const { maintenanceRequest, maintenanceAsset, maintenanceWorkOrder, criticalitySlaMatrix, assetDowntime, outboxEvent } =
  schema;

export interface SubmitRequestInput {
  assetCode: string;
  severity: Severity;
  symptomCode: string;
  detail?: string;
  lineStopped?: boolean;
  photoKeys?: string[];
  requestedByRef: string;
  occurredAt?: string;
  idempotencyKey: string;
}

export interface RequestView {
  requestNo: string;
  status: string;
  asset: { code: string; name: string; criticality: string | null };
  severity: string;
  symptomCode: string;
  requestedAt: string;
  derived: { priorityPreview: string; slaRespondBy: string; configRef: string };
  acknowledgedAt: string | null;
  slaBreached: boolean;
  downtime: { id: string; startedAt: string } | null;
  duplicateCandidates: Array<{ ref: string; kind: "open_mwo" | "recent_mwo" | "open_request"; detail: string }>;
  mwoNo: string | null;
}

/**
 * REQUEST INTAKE & TRIAGE (MAINTENANCE §11.3).
 *
 * The design brief for this path is unusual and worth restating: it must take twenty
 * seconds on a phone, standing at a stopped machine. So the only mandatory inputs are the
 * asset, a symptom chip and a severity — requester and plant come from the token, priority
 * is derived, and the SLA is computed rather than chosen.
 *
 * Two decisions do the real work:
 *
 *   - **A stopped machine starts the clock BEFORE triage** (FR-MNT-021). The downtime
 *     interval opens in the same transaction as the request. If triage later disagrees,
 *     the interval is CORRECTED with a reason — never deleted. Measuring from the moment
 *     maintenance noticed would measure the wrong thing.
 *   - **The SLA clock starts at request time**, so the person being measured cannot reset
 *     it by taking longer to open the queue.
 */
@Injectable()
export class RequestService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly numbering: NumberingService,
    private readonly assets: AssetService,
    private readonly downtime: DowntimeService,
    private readonly mwos: MwoService,
  ) {}

  async submit(input: SubmitRequestInput): Promise<RequestView> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const asset = await this.assets.byCodeInTx(tx, input.assetCode);
      this.assets.assertOperable(asset);
      if (asset.assetType === "plant" || asset.assetType === "area") {
        throw new AppError(
          "ASSET_NOT_MAINTAINABLE",
          422,
          `${asset.assetCode} is a ${asset.assetType} grouping node; raise the request against the machine or component that stopped.`,
        );
      }

      const [dup] = await tx
        .select({ id: maintenanceRequest.id, requestNo: maintenanceRequest.requestNo })
        .from(maintenanceRequest)
        .where(eq(maintenanceRequest.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (dup) return this.view(tx, dup.id);

      const requestedAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
      const asOf = requestedAt.toISOString().slice(0, 10);
      const sla = resolveSla(
        await this.slaMatrix(tx),
        asset.criticality as Criticality,
        input.severity,
        asOf,
      );
      const deadlines = slaDeadlines(requestedAt.toISOString(), sla);

      const id = newId();
      const requestNo = await this.numbering.next(tx, "maintenance_request", fyCode(requestedAt.toISOString()));

      // The clock, before the triage. If this asset is ALREADY down, the request joins the
      // existing interval rather than opening a second one — two operators reporting the
      // same stop must not produce two clocks.
      let downtimeId: string | null = null;
      if (input.severity === "stopped" || input.lineStopped) {
        const open = await this.downtime.openFor(tx, asset.id);
        if (open) {
          downtimeId = open.id;
        } else {
          const dt = await this.downtime.startInTx(tx, {
            assetId: asset.id,
            startedAt: requestedAt.toISOString(),
            kind: "unplanned",
            productionImpacting: true,
            reasonCode: "other",
            source: "request",
            idempotencyKey: `${input.idempotencyKey}:downtime`,
          });
          downtimeId = dt.id;
        }
      }

      await tx.insert(maintenanceRequest).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        requestNo,
        assetId: asset.id,
        requestedByRef: input.requestedByRef,
        requestedAt,
        severity: input.severity,
        symptomCode: input.symptomCode,
        detail: input.detail ?? null,
        photoKeys: (input.photoKeys ?? []) as unknown as object,
        lineStopped: input.lineStopped ?? input.severity === "stopped",
        status: "submitted",
        downtimeId,
        slaRespondBy: new Date(deadlines.respondBy),
        slaConfigRef: sla.configRef,
        idempotencyKey: input.idempotencyKey,
      });

      if (downtimeId) {
        await tx.update(assetDowntime).set({ requestId: id }).where(eq(assetDowntime.id, downtimeId));
      }

      await this.audit.appendInTx(tx, {
        action: "maintenance.request.created",
        entityType: "maintenance_request",
        entityId: id,
        data: { requestNo, assetCode: asset.assetCode, severity: input.severity, symptomCode: input.symptomCode },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("maintenance", "request", "created"),
        payload: { requestNo, assetCode: asset.assetCode, severity: input.severity, priorityPreview: sla.priority },
        createdAt: new Date(),
      });

      return this.view(tx, id);
    });
  }

  /** Acknowledgement is a distinct, timestamped act — it is what the requester sees, and
   *  what the response SLA is actually measured against. */
  async acknowledge(requestNo: string): Promise<RequestView> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const r = await this.byNoInTx(tx, requestNo);
      if (r.acknowledgedAt) return this.view(tx, r.id);
      const now = new Date();
      await tx
        .update(maintenanceRequest)
        .set({
          status: "acknowledged",
          acknowledgedAt: now,
          acknowledgedBy: actorId,
          slaBreached: now > r.slaRespondBy,
          updatedBy: actorId,
          updatedAt: now,
        })
        .where(eq(maintenanceRequest.id, r.id));
      return this.view(tx, r.id);
    });
  }

  /**
   * Triage: create an MWO, merge into an existing one, convert to a PM task, or reject.
   *
   * `FOR UPDATE` on the request row is what makes double-triage from two browser tabs
   * produce one MWO and one loser who sees the resulting state — rather than two work
   * orders on the same fault.
   */
  async triage(
    requestNo: string,
    action:
      | { kind: "create_mwo"; mwoType?: "breakdown" | "corrective"; title?: string; primaryTechRef?: string }
      | { kind: "merge_into_mwo"; mwoNo: string }
      | { kind: "convert_to_pm"; pmsCode: string }
      | { kind: "reject"; reason: string; downtimeDisposition: "keep" | "correct"; correctionNote?: string },
    idempotencyKey: string,
  ): Promise<RequestView> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [locked] = await tx.execute<{ id: string; status: string }>(
        sql`select id, status from maintenance_request where request_no = ${requestNo} for update`,
      ).then((res) => res.rows);
      if (!locked) throw Errors.notFound(`request ${requestNo}`);
      const r = await this.byNoInTx(tx, requestNo);
      if (["mwo_created", "merged", "converted_to_pm", "rejected", "closed"].includes(r.status)) {
        // Not an error: the second tab simply sees what the first one did.
        return this.view(tx, r.id);
      }

      const asset = await tx.select().from(maintenanceAsset).where(eq(maintenanceAsset.id, r.assetId)).limit(1);
      const a = asset[0]!;
      const now = new Date();
      let newStatus = r.status;
      let mwoId: string | null = null;

      if (action.kind === "create_mwo") {
        const sla = resolveSla(
          await this.slaMatrix(tx),
          a.criticality as Criticality,
          r.severity as Severity,
          r.requestedAt.toISOString().slice(0, 10),
        );
        const deadlines = slaDeadlines(r.requestedAt.toISOString(), sla);
        const created = await this.mwos.createInTx(tx, {
          assetId: a.id,
          mwoType: action.mwoType ?? (r.severity === "stopped" ? "breakdown" : "corrective"),
          priority: sla.priority,
          source: "request",
          requestId: r.id,
          title: action.title ?? `${a.assetCode} — ${r.symptomCode.toLowerCase()}`,
          description: r.detail ?? undefined,
          reportedAt: r.requestedAt.toISOString(),
          slaRespondBy: deadlines.respondBy,
          slaRestoreBy: deadlines.restoreBy,
          primaryTechRef: action.primaryTechRef,
          costCentreRef: a.costCentreRef ?? undefined,
          idempotencyKey: `${idempotencyKey}:mwo`,
        });
        mwoId = created.id;
        newStatus = "mwo_created";
        // The interval opened at request time is ADOPTED, not recreated.
        if (r.downtimeId) {
          await tx.update(assetDowntime).set({ mwoId }).where(eq(assetDowntime.id, r.downtimeId));
        }
      } else if (action.kind === "merge_into_mwo") {
        const [target] = await tx
          .select()
          .from(maintenanceWorkOrder)
          .where(eq(maintenanceWorkOrder.mwoNo, action.mwoNo))
          .limit(1);
        if (!target) throw Errors.notFound(`MWO ${action.mwoNo}`);
        if (target.assetId !== a.id) {
          throw new AppError("MWO_ASSET_MISMATCH", 422, `${action.mwoNo} is not on ${a.assetCode}.`);
        }
        if (["closed", "cancelled"].includes(target.status)) {
          throw new AppError("MWO_NOT_OPEN", 422, `${action.mwoNo} is ${target.status} and cannot absorb a new report.`);
        }
        mwoId = target.id;
        newStatus = "merged";
        // Keep the EARLIER start: the machine stopped when it stopped, not when the second
        // person got round to reporting it.
        if (r.downtimeId) {
          const [mine] = await tx.select().from(assetDowntime).where(eq(assetDowntime.id, r.downtimeId)).limit(1);
          const [theirs] = await tx
            .select()
            .from(assetDowntime)
            .where(and(eq(assetDowntime.mwoId, target.id), eq(assetDowntime.assetId, a.id)))
            .orderBy(desc(assetDowntime.startedAt))
            .limit(1);
          if (mine && theirs && mine.id !== theirs.id) {
            const earlier = mine.startedAt <= theirs.startedAt ? mine : theirs;
            const later = earlier.id === mine.id ? theirs : mine;
            await tx
              .update(assetDowntime)
              .set({ supersededBy: earlier.id, endedAt: later.endedAt ?? later.startedAt, updatedBy: actorId })
              .where(eq(assetDowntime.id, later.id));
          }
        }
      } else if (action.kind === "convert_to_pm") {
        newStatus = "converted_to_pm";
      } else {
        if (!action.reason) throw Errors.validation([{ field: "reason", message: "a rejection must say why" }]);
        newStatus = "rejected";
        if (r.downtimeId && action.downtimeDisposition === "correct") {
          // The machine was not actually stopped. The interval is CLOSED at its start and
          // marked corrected, with the reason on the row — it is never deleted, because
          // deleting it would erase the fact that somebody believed the line was down.
          const [dt] = await tx.select().from(assetDowntime).where(eq(assetDowntime.id, r.downtimeId)).limit(1);
          if (dt && !dt.endedAt) {
            await tx
              .update(assetDowntime)
              .set({
                endedAt: new Date(dt.startedAt.getTime() + 60_000),
                corrected: true,
                correctionReason: action.correctionNote ?? `Request ${requestNo} rejected: ${action.reason}`,
                originalStartedAt: dt.startedAt,
                originalEndedAt: null,
                updatedBy: actorId,
                updatedAt: now,
              })
              .where(eq(assetDowntime.id, dt.id));
            await tx.insert(outboxEvent).values({
              id: newId(),
              tenantId,
              name: eventName("maintenance", "downtime", "ended"),
              payload: { downtimeId: dt.id, assetRef: a.id, corrected: true, reason: "request rejected" },
              createdAt: now,
            });
          }
        }
      }

      await tx
        .update(maintenanceRequest)
        .set({
          status: newStatus,
          triagedAt: now,
          triagedBy: actorId,
          mwoId,
          rejectReason: action.kind === "reject" ? action.reason : null,
          updatedBy: actorId,
          updatedAt: now,
        })
        .where(eq(maintenanceRequest.id, r.id));

      await this.audit.appendInTx(tx, {
        action: "maintenance.request.triaged",
        entityType: "maintenance_request",
        entityId: r.id,
        data: { requestNo, decision: action.kind, mwoId },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("maintenance", "request", "triaged"),
        payload: { requestNo, decision: action.kind, status: newStatus },
        createdAt: now,
      });

      return this.view(tx, r.id);
    });
  }

  async queue(state: "untriaged" | "all" = "untriaged"): Promise<RequestView[]> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select({ id: maintenanceRequest.id })
        .from(maintenanceRequest)
        .where(state === "untriaged" ? inArray(maintenanceRequest.status, ["submitted", "acknowledged"]) : undefined)
        .orderBy(desc(maintenanceRequest.requestedAt));
      const out: RequestView[] = [];
      for (const r of rows) out.push(await this.view(tx, r.id));
      return out;
    });
  }

  /* -------------------------------- helpers ------------------------------- */

  private async slaMatrix(tx: Tx): Promise<SlaMatrixRow[]> {
    const rows = await tx.select().from(criticalitySlaMatrix);
    return rows.map((r) => ({
      criticality: r.criticality as Criticality,
      severity: r.severity as Severity,
      priority: r.priority as SlaMatrixRow["priority"],
      respondMinutes: r.respondMinutes,
      restoreMinutes: r.restoreMinutes,
      escalateToRole: r.escalateToRole,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    }));
  }

  private async byNoInTx(tx: Tx, requestNo: string) {
    const [r] = await tx.select().from(maintenanceRequest).where(eq(maintenanceRequest.requestNo, requestNo)).limit(1);
    if (!r) throw Errors.notFound(`request ${requestNo}`);
    return r;
  }

  /**
   * Duplicate candidates are SURFACED, never acted on. §20.4's beat is exactly this: the
   * May work order on the same asset with the same symptom appears as context for the
   * triager, and a human decides whether it is the same fault.
   */
  private async view(tx: Tx, id: string): Promise<RequestView> {
    const [r] = await tx.select().from(maintenanceRequest).where(eq(maintenanceRequest.id, id)).limit(1);
    if (!r) throw Errors.notFound("request");
    const [a] = await tx.select().from(maintenanceAsset).where(eq(maintenanceAsset.id, r.assetId)).limit(1);

    const sla = resolveSla(
      await this.slaMatrix(tx),
      a!.criticality as Criticality,
      r.severity as Severity,
      r.requestedAt.toISOString().slice(0, 10),
    );

    // Duplicate candidates look BOTH ways: at recent work orders on the same asset (the
    // May job with the same symptom, which is context rather than a merge), and at other
    // untriaged requests on it (the second operator reporting the same stop, which usually
    // IS a merge). Surfacing only one of the two is how a queue fills with the same fault.
    const since = new Date(r.requestedAt.getTime() - 90 * 86_400_000);
    const related = await tx
      .select()
      .from(maintenanceWorkOrder)
      .where(and(eq(maintenanceWorkOrder.assetId, r.assetId), gte(maintenanceWorkOrder.reportedAt, since)))
      .orderBy(desc(maintenanceWorkOrder.reportedAt))
      .limit(5);
    const siblingRequests = await tx
      .select()
      .from(maintenanceRequest)
      .where(
        and(
          eq(maintenanceRequest.assetId, r.assetId),
          inArray(maintenanceRequest.status, ["submitted", "acknowledged"]),
        ),
      )
      .orderBy(desc(maintenanceRequest.requestedAt))
      .limit(5);

    const [dt] = r.downtimeId
      ? await tx.select().from(assetDowntime).where(eq(assetDowntime.id, r.downtimeId)).limit(1)
      : [null];
    const [mwo] = r.mwoId
      ? await tx.select({ mwoNo: maintenanceWorkOrder.mwoNo }).from(maintenanceWorkOrder).where(eq(maintenanceWorkOrder.id, r.mwoId)).limit(1)
      : [null];

    return {
      requestNo: r.requestNo,
      status: r.status,
      asset: { code: a!.assetCode, name: a!.name, criticality: a!.criticality },
      severity: r.severity,
      symptomCode: r.symptomCode,
      requestedAt: r.requestedAt.toISOString(),
      derived: { priorityPreview: sla.priority, slaRespondBy: r.slaRespondBy.toISOString(), configRef: r.slaConfigRef },
      acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
      slaBreached: r.slaBreached,
      downtime: dt ? { id: dt.id, startedAt: dt.startedAt.toISOString() } : null,
      duplicateCandidates: [
        ...related
          .filter((m) => m.id !== r.mwoId)
          .map((m) => ({
            ref: m.mwoNo,
            kind: ["closed", "cancelled"].includes(m.status) ? ("recent_mwo" as const) : ("open_mwo" as const),
            detail: `${m.mwoType} on the same asset, ${m.reportedAt.toISOString().slice(0, 10)} — ${m.status}`,
          })),
        ...siblingRequests
          .filter((s) => s.id !== r.id)
          .map((s) => ({
            ref: s.requestNo,
            kind: "open_request" as const,
            detail: `${s.symptomCode} reported on the same asset at ${s.requestedAt.toISOString().slice(11, 16)} — still ${s.status}`,
          })),
      ],
      mwoNo: mwo?.mwoNo ?? null,
    };
  }
}
