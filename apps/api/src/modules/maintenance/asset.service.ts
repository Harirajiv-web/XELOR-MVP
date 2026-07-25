import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  newId,
  currentTenant,
  eventName,
  trailingDailyRate,
  AppError,
  Errors,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";

const {
  maintenanceAsset,
  maintenanceAssetHistory,
  assetMeter,
  assetMeterReading,
  assetDowntime,
  maintenanceWorkOrder,
  mwoSpare,
  pmOccurrence,
  amcContract,
  amcContractAsset,
  outboxEvent,
} = schema;

const n = (v: string | null | undefined): number => (v == null ? 0 : Number(v));

export interface CreateAssetInput {
  assetCode: string;
  name: string;
  assetType: "plant" | "area" | "machine" | "component";
  parentAssetCode?: string;
  criticality?: "A" | "B" | "C";
  criticalityReason?: string;
  make?: string;
  model?: string;
  serialNo?: string;
  commissionedOn?: string;
  locationRef?: string;
  costCentreRef?: string;
  workCenterRef?: string;
  warrantyEndDate?: string;
  statutoryClass?: "none" | "hoist_lift_s28" | "lifting_tackle_s29" | "pressure_plant_s31" | "other";
  competentPersonRef?: string;
}

export interface AssetView {
  id: string;
  assetCode: string;
  name: string;
  assetType: string;
  path: string;
  depth: number;
  criticality: string | null;
  status: string;
  workCenterRef: string | null;
  statutoryClass: string;
  warrantyActive: boolean;
  openDowntimeId: string | null;
  meters: Array<{ meterType: string; uom: string; currentValue: number; dailyRateEst: number | null; lastRealReadingAt: string | null; stale: boolean }>;
  amc: { contractRef: string; vendorName: string | null; validTo: string; coverageType: string } | null;
}

/**
 * ASSET SERVICE (MAINTENANCE §11.1) — the hierarchy, the meters, and the 360 history.
 *
 * Two rules shape everything here:
 *
 *   - **The path is derived, never accepted.** A client sends a parent code; the server
 *     computes `path` and `depth` and rebuilds the whole subtree in one transaction on a
 *     move. A hierarchy a client can write is a hierarchy that will develop a cycle.
 *   - **A meter's `current_value` is a projection.** Readings append; the projection is
 *     recomputed from them; a database trigger asserts the two agree. It is the Inventory
 *     ledger lesson applied to a counter that decides when a service falls due.
 */
@Injectable()
export class AssetService {
  constructor(private readonly audit: AuditLogService) {}

  /* -------------------------------- master -------------------------------- */

  async create(input: CreateAssetInput): Promise<AssetView> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      let path = `/${input.assetCode}`;
      let depth = 0;
      let parentId: string | null = null;

      if (input.parentAssetCode) {
        const parent = await this.byCodeInTx(tx, input.parentAssetCode);
        parentId = parent.id;
        depth = parent.depth + 1;
        path = `${parent.path}/${input.assetCode}`;
        // Depth is not decoration: it is what keeps "component of a component of a
        // component" from becoming a tree nobody can report on.
        if (depth > 3) {
          throw new AppError(
            "ASSET_DEPTH_EXCEEDED",
            422,
            `The hierarchy is plant → area → machine → component; '${input.parentAssetCode}' is already at depth ${parent.depth}.`,
          );
        }
      }

      if ((input.assetType === "machine" || input.assetType === "component") && !input.criticality) {
        throw Errors.validation([
          { field: "criticality", message: "a machine or component needs a criticality — it drives the SLA and the PM policy" },
        ]);
      }

      const id = newId();
      await tx.insert(maintenanceAsset).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        assetCode: input.assetCode,
        name: input.name,
        assetType: input.assetType,
        parentAssetId: parentId,
        path,
        depth,
        criticality: input.criticality ?? null,
        criticalityReason: input.criticalityReason ?? null,
        make: input.make ?? null,
        model: input.model ?? null,
        serialNo: input.serialNo ?? null,
        commissionedOn: input.commissionedOn ?? null,
        locationRef: input.locationRef ?? null,
        costCentreRef: input.costCentreRef ?? null,
        workCenterRef: input.workCenterRef ?? null,
        warrantyEndDate: input.warrantyEndDate ?? null,
        statutoryClass: input.statutoryClass ?? "none",
        competentPersonRef: input.competentPersonRef ?? null,
        qrPayload: `IND-CORE:asset:${input.assetCode}`,
      });

      await this.audit.appendInTx(tx, {
        action: "maintenance.asset.created",
        entityType: "maintenance_asset",
        entityId: id,
        data: { assetCode: input.assetCode, assetType: input.assetType, criticality: input.criticality ?? null },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("maintenance", "asset", "created"),
        payload: { id, assetCode: input.assetCode, workCenterRef: input.workCenterRef ?? null },
        createdAt: new Date(),
      });

      return this.viewInTx(tx, id);
    });
  }

  async get(assetCode: string): Promise<AssetView> {
    return withTenant(async (tx) => {
      const a = await this.byCodeInTx(tx, assetCode);
      return this.viewInTx(tx, a.id);
    });
  }

  async list(filter: { criticality?: string; statutoryClass?: string; areaPath?: string } = {}): Promise<AssetView[]> {
    return withTenant(async (tx) => {
      const conds = [eq(maintenanceAsset.isActive, true)];
      if (filter.criticality) conds.push(eq(maintenanceAsset.criticality, filter.criticality));
      if (filter.statutoryClass) conds.push(eq(maintenanceAsset.statutoryClass, filter.statutoryClass));
      const rows = await tx
        .select({ id: maintenanceAsset.id })
        .from(maintenanceAsset)
        .where(
          filter.areaPath
            ? and(...conds, sql`${maintenanceAsset.path} like ${`${filter.areaPath}%`}`)
            : and(...conds),
        )
        .orderBy(asc(maintenanceAsset.path));
      const out: AssetView[] = [];
      for (const r of rows) out.push(await this.viewInTx(tx, r.id));
      return out;
    });
  }

  /**
   * Link an asset to a Production work center. A work center may back at most ONE active
   * asset — a second link would split a machine's failure history in two, which is why the
   * database refuses it and this method names the other asset in the refusal.
   */
  async linkWorkCenter(assetCode: string, workCenterRef: string): Promise<AssetView> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const a = await this.byCodeInTx(tx, assetCode);
      const [clash] = await tx
        .select({ assetCode: maintenanceAsset.assetCode })
        .from(maintenanceAsset)
        .where(and(eq(maintenanceAsset.workCenterRef, workCenterRef), eq(maintenanceAsset.isActive, true)))
        .limit(1);
      if (clash && clash.assetCode !== assetCode) {
        throw new AppError(
          "WORK_CENTER_ALREADY_LINKED",
          409,
          `Work center ${workCenterRef} is already linked to ${clash.assetCode}.`,
        );
      }
      await this.appendHistoryInTx(tx, a.id, "work_center_link", { workCenterRef: a.workCenterRef }, { workCenterRef }, null);
      await tx
        .update(maintenanceAsset)
        .set({ workCenterRef, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(maintenanceAsset.id, a.id));
      return this.viewInTx(tx, a.id);
    });
  }

  /** Effective-dated move. The subtree's paths are rebuilt in the SAME transaction, so an
   *  interrupted move can never leave half a hierarchy pointing at the old parent. */
  async move(assetCode: string, newParentCode: string, reason: string): Promise<AssetView> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const a = await this.byCodeInTx(tx, assetCode);
      const parent = await this.byCodeInTx(tx, newParentCode);
      if (parent.path.startsWith(`${a.path}/`) || parent.id === a.id) {
        throw new AppError("ASSET_CYCLE", 422, `Moving ${assetCode} under ${newParentCode} would create a cycle.`);
      }
      const oldPath = a.path;
      const newPath = `${parent.path}/${a.assetCode}`;
      const depthShift = parent.depth + 1 - a.depth;

      await this.appendHistoryInTx(tx, a.id, "move", { path: oldPath }, { path: newPath }, reason);
      await tx.execute(sql`
        update maintenance_asset
           set path = ${newPath} || substring(path from ${oldPath.length + 1}),
               depth = depth + ${depthShift},
               updated_by = ${actorId}, updated_at = now()
         where path = ${oldPath} or path like ${`${oldPath}/%`}
      `);
      await tx
        .update(maintenanceAsset)
        .set({ parentAssetId: parent.id, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(maintenanceAsset.id, a.id));
      return this.viewInTx(tx, a.id);
    });
  }

  async decommission(assetCode: string, reason: string): Promise<{ assetCode: string; status: string; closedDowntime: number }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const a = await this.byCodeInTx(tx, assetCode);
      const open = await tx
        .select({ id: assetDowntime.id })
        .from(assetDowntime)
        .where(and(eq(assetDowntime.assetId, a.id), isNull(assetDowntime.endedAt)));
      const now = new Date();
      for (const o of open) {
        await tx.update(assetDowntime).set({ endedAt: now, updatedBy: actorId }).where(eq(assetDowntime.id, o.id));
      }
      await this.appendHistoryInTx(tx, a.id, "decommission", { status: a.status }, { status: "decommissioned" }, reason);
      await tx
        .update(maintenanceAsset)
        .set({ status: "decommissioned", updatedBy: actorId, updatedAt: now })
        .where(eq(maintenanceAsset.id, a.id));
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("maintenance", "asset", "decommissioned"),
        payload: { assetCode, reason },
        createdAt: now,
      });
      return { assetCode, status: "decommissioned", closedDowntime: open.length };
    });
  }

  /* -------------------------------- meters -------------------------------- */

  async addMeter(assetCode: string, meterType: string, uom: string, openingValue = 0): Promise<{ meterId: string }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const a = await this.byCodeInTx(tx, assetCode);
      const id = newId();
      await tx.insert(assetMeter).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        assetId: a.id,
        meterType,
        uom,
        currentValue: openingValue.toFixed(4),
      });
      return { meterId: id };
    });
  }

  /**
   * Append a reading and re-derive the projection.
   *
   * A reading BELOW the current value is rejected (`METER_READING_REGRESSION`) unless the
   * meter declares a rollover or the reading is an explicit, reasoned correction. Without
   * that rule a mistyped digit silently postpones a service by two thousand hours.
   */
  async addReading(input: {
    assetCode: string;
    meterType: string;
    readingValue: number;
    readingAt: string;
    source?: "manual" | "event" | "estimated";
    sourceRef?: string;
    isCorrection?: boolean;
    correctionReason?: string;
  }): Promise<{ meterType: string; currentValue: number; dailyRateEst: number | null; isEstimated: boolean }> {
    const { tenantId, actorId } = currentTenant();
    const source = input.source ?? "manual";
    return withTenant(async (tx) => {
      const a = await this.byCodeInTx(tx, input.assetCode);
      const [m] = await tx
        .select()
        .from(assetMeter)
        .where(and(eq(assetMeter.assetId, a.id), eq(assetMeter.meterType, input.meterType)))
        .limit(1);
      if (!m) throw Errors.notFound(`meter ${input.meterType} on ${input.assetCode}`);

      const current = n(m.currentValue);
      const rollover = m.rolloverAt == null ? null : n(m.rolloverAt);
      const isCorrection = input.isCorrection ?? false;
      if (input.readingValue < current && !isCorrection) {
        const wrapped = rollover != null && input.readingValue + rollover >= current;
        if (!wrapped) {
          throw new AppError(
            "METER_READING_REGRESSION",
            422,
            `Reading ${input.readingValue} is below the current ${current} on ${input.assetCode}/${input.meterType}. Flag it as a correction with a reason, or declare a rollover on the meter.`,
          );
        }
      }
      if (isCorrection && !input.correctionReason) {
        throw Errors.validation([{ field: "correctionReason", message: "a meter correction must say why" }]);
      }

      const readingAt = new Date(input.readingAt);
      await tx.insert(assetMeterReading).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        meterId: m.id,
        readingValue: input.readingValue.toFixed(4),
        readingAt,
        source,
        sourceRef: input.sourceRef ?? null,
        isEstimated: source === "estimated",
        isCorrection,
        correctionReason: input.correctionReason ?? null,
      });

      // Recompute the projection and the trailing rate from OBSERVED readings only —
      // an estimate may move a forecast, but it must never become the meter's truth.
      const observed = await tx
        .select({ readingValue: assetMeterReading.readingValue, readingAt: assetMeterReading.readingAt })
        .from(assetMeterReading)
        .where(and(eq(assetMeterReading.meterId, m.id), eq(assetMeterReading.isEstimated, false)))
        .orderBy(asc(assetMeterReading.readingAt));
      const latestAny = await tx
        .select({ readingValue: assetMeterReading.readingValue, readingAt: assetMeterReading.readingAt })
        .from(assetMeterReading)
        .where(eq(assetMeterReading.meterId, m.id))
        .orderBy(desc(assetMeterReading.readingAt), desc(assetMeterReading.createdAt))
        .limit(1);

      const rate = trailingDailyRate(
        observed.slice(-6).map((r) => ({ readingValue: n(r.readingValue), readingAt: r.readingAt.toISOString() })),
      );
      const latest = latestAny[0];
      const lastReal = observed.at(-1);

      await tx
        .update(assetMeter)
        .set({
          currentValue: latest ? n(latest.readingValue).toFixed(4) : m.currentValue,
          lastReadingAt: latest ? latest.readingAt : m.lastReadingAt,
          lastRealReadingAt: lastReal ? lastReal.readingAt : m.lastRealReadingAt,
          dailyRateEst: rate == null ? null : rate.toFixed(4),
          updatedBy: actorId,
          updatedAt: new Date(),
        })
        .where(eq(assetMeter.id, m.id));

      return {
        meterType: input.meterType,
        currentValue: latest ? n(latest.readingValue) : current,
        dailyRateEst: rate,
        isEstimated: source === "estimated",
      };
    });
  }

  /* ------------------------------ the 360 view ---------------------------- */

  /**
   * FR-MNT-106 — "the screen that makes the module worth buying": everything that has
   * happened to one machine, in one chronological stream, each row linking to its document.
   */
  async history(
    assetCode: string,
    window: { from: string; to: string },
  ): Promise<{
    asset: { assetCode: string; name: string; criticality: string | null };
    events: Array<{ at: string; type: string; ref: string; detail: string; amount?: number }>;
  }> {
    return withTenant(async (tx) => {
      const a = await this.byCodeInTx(tx, assetCode);
      const from = new Date(`${window.from}T00:00:00+05:30`);
      const to = new Date(`${window.to}T23:59:59+05:30`);
      const events: Array<{ at: string; type: string; ref: string; detail: string; amount?: number }> = [];

      const mwos = await tx
        .select()
        .from(maintenanceWorkOrder)
        .where(and(eq(maintenanceWorkOrder.assetId, a.id), gte(maintenanceWorkOrder.reportedAt, from), lte(maintenanceWorkOrder.reportedAt, to)));
      for (const m of mwos) {
        events.push({
          at: m.reportedAt.toISOString(),
          type: `mwo.${m.mwoType}`,
          ref: m.mwoNo,
          detail: `${m.title} — ${m.status}`,
          amount: n(m.costTotal),
        });
      }

      const dts = await tx
        .select()
        .from(assetDowntime)
        .where(and(eq(assetDowntime.assetId, a.id), gte(assetDowntime.startedAt, from), lte(assetDowntime.startedAt, to)));
      for (const d of dts) {
        events.push({
          at: d.startedAt.toISOString(),
          type: `downtime.${d.downtimeKind}`,
          ref: d.id,
          detail: `${d.reasonCode ?? "unspecified"} — ${d.durationMinutes == null ? "still open" : `${(d.durationMinutes / 60).toFixed(1)} h`}${d.corrected ? " (corrected)" : ""}`,
        });
      }

      const meters = await tx.select({ id: assetMeter.id, meterType: assetMeter.meterType }).from(assetMeter).where(eq(assetMeter.assetId, a.id));
      for (const m of meters) {
        const readings = await tx
          .select()
          .from(assetMeterReading)
          .where(and(eq(assetMeterReading.meterId, m.id), gte(assetMeterReading.readingAt, from), lte(assetMeterReading.readingAt, to)));
        for (const r of readings) {
          events.push({
            at: r.readingAt.toISOString(),
            type: "meter.reading",
            ref: m.meterType,
            detail: `${n(r.readingValue)}${r.isEstimated ? " (estimated)" : ""}`,
          });
        }
      }

      const occs = await tx.select().from(pmOccurrence).where(eq(pmOccurrence.assetId, a.id));
      for (const o of occs) {
        if (!o.dueDate || o.dueDate < window.from || o.dueDate > window.to) continue;
        events.push({
          at: `${o.dueDate}T00:00:00.000Z`,
          type: "pm.occurrence",
          ref: `seq ${o.occurrenceSeq}`,
          detail: `${o.status}${o.completedWithinGrace === false ? " (outside grace)" : ""}`,
        });
      }

      const mwoIds = mwos.map((m) => m.id);
      if (mwoIds.length > 0) {
        const spares = await tx.select().from(mwoSpare).where(inArray(mwoSpare.mwoId, mwoIds));
        for (const s of spares) {
          if (s.issueStatus !== "issued") continue;
          const parent = mwos.find((m) => m.id === s.mwoId)!;
          events.push({
            at: s.createdAt.toISOString(),
            type: "spare.issued",
            ref: parent.mwoNo,
            detail: `${s.itemCodeCache ?? s.itemRef} × ${n(s.qtyIssued)}`,
            amount: n(s.valuedAmount),
          });
        }
      }

      events.sort((x, y) => x.at.localeCompare(y.at));
      return { asset: { assetCode: a.assetCode, name: a.name, criticality: a.criticality }, events };
    });
  }

  /* -------------------------------- helpers ------------------------------- */

  async byCodeInTx(tx: Tx, assetCode: string) {
    const [a] = await tx.select().from(maintenanceAsset).where(eq(maintenanceAsset.assetCode, assetCode)).limit(1);
    if (!a) throw Errors.notFound(`asset ${assetCode}`);
    return a;
  }

  /** A decommissioned asset accepts no new work; its history stays fully readable. */
  assertOperable(a: { assetCode: string; status: string }): void {
    if (a.status === "decommissioned") {
      throw new AppError("ASSET_DECOMMISSIONED", 422, `${a.assetCode} is decommissioned and cannot take new work.`);
    }
  }

  private async appendHistoryInTx(
    tx: Tx,
    assetId: string,
    changeType: string,
    fromValue: unknown,
    toValue: unknown,
    reason: string | null,
  ): Promise<void> {
    const { tenantId, actorId } = currentTenant();
    await tx.insert(maintenanceAssetHistory).values({
      id: newId(),
      tenantId,
      createdBy: actorId,
      updatedBy: actorId,
      assetId,
      changeType,
      fromValue: fromValue as object,
      toValue: toValue as object,
      reason,
      effectiveFrom: new Date(),
    });
    await this.audit.appendInTx(tx, {
      action: `maintenance.asset.${changeType}`,
      entityType: "maintenance_asset",
      entityId: assetId,
      data: { from: fromValue, to: toValue, reason },
    });
  }

  async viewInTx(tx: Tx, assetId: string): Promise<AssetView> {
    const [a] = await tx.select().from(maintenanceAsset).where(eq(maintenanceAsset.id, assetId)).limit(1);
    if (!a) throw Errors.notFound("asset");

    const meters = await tx.select().from(assetMeter).where(eq(assetMeter.assetId, assetId));
    const [open] = await tx
      .select({ id: assetDowntime.id })
      .from(assetDowntime)
      .where(and(eq(assetDowntime.assetId, assetId), isNull(assetDowntime.endedAt)))
      .limit(1);

    const [amc] = await tx
      .select({
        contractRef: amcContract.contractRef,
        vendorNameCache: amcContract.vendorNameCache,
        validTo: amcContract.validTo,
        coverageType: amcContract.coverageType,
      })
      .from(amcContractAsset)
      .innerJoin(amcContract, eq(amcContract.id, amcContractAsset.amcContractId))
      .where(eq(amcContractAsset.assetId, assetId))
      .limit(1);

    const today = new Date().toISOString().slice(0, 10);
    const staleBefore = new Date(Date.now() - 60 * 86_400_000);

    return {
      id: a.id,
      assetCode: a.assetCode,
      name: a.name,
      assetType: a.assetType,
      path: a.path,
      depth: a.depth,
      criticality: a.criticality,
      status: a.status,
      workCenterRef: a.workCenterRef,
      statutoryClass: a.statutoryClass,
      warrantyActive: a.warrantyEndDate != null && a.warrantyEndDate >= today,
      openDowntimeId: open?.id ?? null,
      meters: meters.map((m) => ({
        meterType: m.meterType,
        uom: m.uom,
        currentValue: n(m.currentValue),
        dailyRateEst: m.dailyRateEst == null ? null : n(m.dailyRateEst),
        lastRealReadingAt: m.lastRealReadingAt?.toISOString() ?? null,
        stale: m.lastRealReadingAt == null || m.lastRealReadingAt < staleBefore,
      })),
      amc: amc
        ? {
            contractRef: amc.contractRef,
            vendorName: amc.vendorNameCache,
            validTo: amc.validTo,
            coverageType: amc.coverageType,
          }
        : null,
    };
  }
}
