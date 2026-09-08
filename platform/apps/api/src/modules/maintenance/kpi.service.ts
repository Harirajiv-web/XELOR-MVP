import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  newId,
  currentTenant,
  computeReliability,
  downtimePareto,
  renderAssetSummary,
  provenanceLine,
  checkNarrativeGrounding,
  Errors,
  type AssetFactBlock,
  type DowntimeInterval,
  type KpiWindow,
  type ReliabilityResult,
} from "@ind-core/platform";

const {
  assetDowntime,
  maintenanceAsset,
  maintenanceWorkOrder,
  maintenanceKpiSnapshot,
  mwoSpare,
  mwoLabour,
  mwoExternalCost,
  pmOccurrence,
  failureCode,
  downtimeReasonCode,
} = schema;

const n = (v: string | null | undefined): number => (v == null ? 0 : Number(v));

/**
 * A plant's scheduled hours come from General's shift calendar. GENERAL does not own one
 * yet in this prototype, so the caller supplies it and the KPI carries a note saying where
 * it came from. What this module will NOT do is assume 24x7: an availability figure
 * computed against an invented denominator is worse than no figure, because it is
 * believable. `null` renders as "Needs shift calendar" and links to the setup screen.
 */
export interface KpiRequest {
  scopeType: "asset" | "area" | "plant" | "tenant";
  scopeCode?: string;
  from: string;
  to: string;
  scheduledHours: number | null;
}

export interface KpiResponse extends ReliabilityResult {
  scope: { type: string; ref: string | null; label: string };
  period: { start: string; end: string };
  cost: { labour: number; spares: number; external: number; total: number };
  scheduledHoursSource: string;
  computedAt: string;
}

@Injectable()
export class KpiService {
  /**
   * Compute a window. Everything here is a read plus one call into the platform's
   * reliability function — deliberately, so a chart and a tile can never be computed by
   * two different pieces of arithmetic (§11.5).
   */
  async compute(req: KpiRequest): Promise<KpiResponse> {
    return withTenant(async (tx) => {
      const scope = await this.resolveScope(tx, req);
      const window: KpiWindow = { from: req.from, to: req.to, openIntervalCutoff: new Date().toISOString() };

      const intervals = await this.intervalsInTx(tx, scope.assetIds, req);
      const occurrences = await this.occurrencesInTx(tx, scope.assetIds, req);
      const mwos = await this.mwosInTx(tx, scope.assetIds, req);

      const result = computeReliability({
        window,
        scheduledHours: req.scheduledHours,
        intervals,
        occurrences,
        plannedMwos: mwos
          .filter((m) => m.mwoType === "preventive" || m.mwoType === "statutory")
          .map((m) => ({
            id: m.mwoNo,
            plannedEnd: m.plannedEnd?.toISOString() ?? null,
            actualEnd: m.actualEnd?.toISOString() ?? null,
          })),
      });

      const cost = await this.costInTx(tx, mwos.map((m) => m.id));

      return {
        ...result,
        scope: { type: req.scopeType, ref: scope.ref, label: scope.label },
        period: { start: req.from, end: req.to },
        cost,
        scheduledHoursSource:
          req.scheduledHours == null
            ? "not configured — General does not yet own a shift calendar in this build"
            : "supplied by the caller (General shift calendar, once it exists)",
        computedAt: new Date().toISOString(),
      };
    });
  }

  /** Persist a snapshot with its `inputs_digest`, so a recompute over the same rows can be
   *  proved byte-identical rather than asserted to be (TC-16-06). */
  async snapshot(req: KpiRequest): Promise<{ scope: string; period: string; inputsDigest: string; reproduced: boolean }> {
    const { tenantId, actorId } = currentTenant();
    const computed = await this.compute(req);
    return withTenant(async (tx) => {
      const scope = await this.resolveScope(tx, req);
      const [existing] = await tx
        .select()
        .from(maintenanceKpiSnapshot)
        .where(
          and(
            eq(maintenanceKpiSnapshot.scopeType, req.scopeType),
            eq(maintenanceKpiSnapshot.periodStart, req.from),
            eq(maintenanceKpiSnapshot.periodEnd, req.to),
            scope.ref ? eq(maintenanceKpiSnapshot.scopeRef, scope.ref) : sql`scope_ref is null`,
          ),
        )
        .limit(1);

      const values = {
        scheduledHours: computed.scheduledHours?.toFixed(3) ?? null,
        downtimeUnplannedHours: computed.downtimeUnplannedHours.toFixed(3),
        downtimePlannedHours: computed.downtimePlannedHours.toFixed(3),
        failureCount: computed.failureCount,
        mtbfHours: computed.mtbfHours?.toFixed(3) ?? null,
        mttrHours: computed.mttrHours?.toFixed(3) ?? null,
        availabilityPct: computed.availabilityPct?.toFixed(4) ?? null,
        pmDueCount: computed.pmDueCount,
        pmCompletedInGrace: computed.pmCompletedInGrace,
        pmCompliancePct: computed.pmCompliancePct?.toFixed(4) ?? null,
        scheduleAdherencePct: computed.scheduleAdherencePct?.toFixed(4) ?? null,
        costLabour: computed.cost.labour.toFixed(2),
        costSpares: computed.cost.spares.toFixed(2),
        costExternal: computed.cost.external.toFixed(2),
        computedAt: new Date(),
        staleSinceCorrection: false,
        inputsDigest: computed.inputsDigest,
      };

      const reproduced = existing != null && existing.inputsDigest === computed.inputsDigest;
      if (existing) {
        await tx
          .update(maintenanceKpiSnapshot)
          .set({ ...values, updatedBy: actorId })
          .where(eq(maintenanceKpiSnapshot.id, existing.id));
      } else {
        await tx.insert(maintenanceKpiSnapshot).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          scopeType: req.scopeType,
          scopeRef: scope.ref,
          periodStart: req.from,
          periodEnd: req.to,
          ...values,
        });
      }
      return { scope: scope.label, period: `${req.from}..${req.to}`, inputsDigest: computed.inputsDigest, reproduced };
    });
  }

  /** Downtime Pareto with the row ids behind every bar (§7.8: every chart drills down). */
  async pareto(req: KpiRequest): Promise<Array<{ key: string; label: string; hours: number; count: number; ids: string[] }>> {
    return withTenant(async (tx) => {
      const scope = await this.resolveScope(tx, req);
      const intervals = await this.intervalsInTx(tx, scope.assetIds, req);
      const codes = await tx.select().from(downtimeReasonCode);
      const labels = Object.fromEntries(codes.map((c) => [c.code, c.label]));
      return downtimePareto(intervals, { from: req.from, to: req.to }, labels);
    });
  }

  /** The payoff for enforcing failure codes at closure (FR-MNT-108). */
  async failurePareto(req: KpiRequest): Promise<Array<{ code: string; label: string; count: number; mwoNos: string[] }>> {
    return withTenant(async (tx) => {
      const scope = await this.resolveScope(tx, req);
      const rows = await tx
        .select({ mwoNo: maintenanceWorkOrder.mwoNo, code: failureCode.code, label: failureCode.label })
        .from(maintenanceWorkOrder)
        .innerJoin(failureCode, eq(failureCode.id, maintenanceWorkOrder.failureModeId))
        .where(
          and(
            inArray(maintenanceWorkOrder.assetId, scope.assetIds),
            gte(maintenanceWorkOrder.reportedAt, new Date(`${req.from}T00:00:00+05:30`)),
            lte(maintenanceWorkOrder.reportedAt, new Date(`${req.to}T23:59:59+05:30`)),
          ),
        );
      const acc = new Map<string, { code: string; label: string; count: number; mwoNos: string[] }>();
      for (const r of rows) {
        const e = acc.get(r.code) ?? { code: r.code, label: r.label, count: 0, mwoNos: [] };
        e.count += 1;
        e.mwoNos.push(r.mwoNo);
        acc.set(r.code, e);
      }
      return [...acc.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
    });
  }

  /**
   * The asset narrative (§13.1) — the DETERMINISTIC path, which is the only path that
   * ships.
   *
   * DECISIONS-V2 §4.2 fixes the MVP AI portfolio at a closed registry of eight features
   * and Maintenance is not among them, so there is no model call here: what the blueprint
   * calls the deterministic baseline IS the product. The grounding gate ships with it, and
   * the response reports whether the rendered text passes its own check — the same gate a
   * future `maintenance.asset_summary` would have to survive, once an ADR opens the
   * registry to it.
   */
  async assetSummary(
    assetCode: string,
    req: { from: string; to: string; scheduledHours: number | null },
  ): Promise<{ facts: AssetFactBlock; summary: string; provenance: string; grounded: boolean; aiStatus: string }> {
    return withTenant(async (tx) => {
      const [asset] = await tx.select().from(maintenanceAsset).where(eq(maintenanceAsset.assetCode, assetCode)).limit(1);
      if (!asset) throw Errors.notFound(`asset ${assetCode}`);

      const kpiReq: KpiRequest = { scopeType: "asset", scopeCode: assetCode, from: req.from, to: req.to, scheduledHours: req.scheduledHours };
      const intervals = await this.intervalsInTx(tx, [asset.id], kpiReq);
      const occurrences = await this.occurrencesInTx(tx, [asset.id], kpiReq);
      const mwos = await this.mwosInTx(tx, [asset.id], kpiReq);
      const reliability = computeReliability({
        window: { from: req.from, to: req.to },
        scheduledHours: req.scheduledHours,
        intervals,
        occurrences,
      });
      const cost = await this.costInTx(tx, mwos.map((m) => m.id));

      const unplanned = intervals.filter((i) => i.kind === "unplanned" && i.productionImpacting);
      const durations = unplanned.map((i) => ({
        id: i.id,
        hours: i.endedAt ? (Date.parse(i.endedAt) - Date.parse(i.startedAt)) / 3_600_000 : 0,
        on: i.startedAt.slice(0, 10),
      }));
      const longest = durations.sort((a, b) => b.hours - a.hours)[0];

      const modes = await tx
        .select({ code: failureCode.code, label: failureCode.label })
        .from(maintenanceWorkOrder)
        .innerJoin(failureCode, eq(failureCode.id, maintenanceWorkOrder.failureModeId))
        .where(inArray(maintenanceWorkOrder.id, mwos.map((m) => m.id).length > 0 ? mwos.map((m) => m.id) : [asset.id]));
      const modeTally = new Map<string, { code: string; label: string; count: number }>();
      for (const m of modes) {
        const e = modeTally.get(m.code) ?? { code: m.code, label: m.label, count: 0 };
        e.count += 1;
        modeTally.set(m.code, e);
      }

      const components = await tx
        .select({ code: maintenanceAsset.assetCode, name: maintenanceAsset.name })
        .from(maintenanceWorkOrder)
        .innerJoin(maintenanceAsset, eq(maintenanceAsset.id, maintenanceWorkOrder.failedComponentId))
        .where(inArray(maintenanceWorkOrder.id, mwos.map((m) => m.id).length > 0 ? mwos.map((m) => m.id) : [asset.id]));
      const compTally = new Map<string, { code: string; name: string; count: number }>();
      for (const c of components) {
        const e = compTally.get(c.code) ?? { code: c.code, name: c.name, count: 0 };
        e.count += 1;
        compTally.set(c.code, e);
      }

      const spares = mwos.length
        ? await tx.select().from(mwoSpare).where(inArray(mwoSpare.mwoId, mwos.map((m) => m.id)))
        : [];
      const issued = spares.filter((s) => s.issueStatus === "issued");
      const topSpare = [...issued].sort((a, b) => n(b.valuedAmount) - n(a.valuedAmount))[0];

      const facts: AssetFactBlock = {
        assetCode: asset.assetCode,
        assetName: asset.name,
        periodLabel: `${req.from} to ${req.to}`,
        windowFrom: req.from,
        windowTo: req.to,
        unplannedStops: reliability.failureCount,
        unplannedHours: reliability.downtimeUnplannedHours,
        longestStopHours: longest ? Math.round(longest.hours * 100) / 100 : 0,
        longestStopOn: longest?.on ?? null,
        mttrHours: reliability.mttrHours,
        mtbfHours: reliability.mtbfHours,
        availabilityPct: reliability.availabilityPct,
        topModes: [...modeTally.values()].sort((a, b) => b.count - a.count),
        topComponent: [...compTally.values()].sort((a, b) => b.count - a.count)[0] ?? null,
        sparesTotal: Math.round(issued.reduce((a, s) => a + n(s.valuedAmount), 0) * 100) / 100,
        topSpareValue: topSpare ? n(topSpare.valuedAmount) : 0,
        topSpareLabel: topSpare?.itemCodeCache ?? null,
        costTotal: cost.total,
        pmDue: reliability.pmDueCount,
        pmCompletedInGrace: reliability.pmCompletedInGrace,
        sourceCounts: { mwos: mwos.length, downtimeRows: intervals.length, spareLines: spares.length },
        sourceIds: { mwoIds: mwos.map((m) => m.mwoNo), downtimeIds: intervals.map((i) => i.id) },
      };

      const summary = renderAssetSummary(facts);
      // The baseline is checked against its own gate. If the deterministic text could not
      // pass, the gate is wrong — and it is better to learn that here than the first time
      // a model's output is measured against it.
      const grounding = checkNarrativeGrounding(summary, facts);

      return {
        facts,
        summary,
        provenance: provenanceLine(facts),
        grounded: grounding.ok,
        aiStatus:
          "deterministic — no AI feature is registered for Maintenance in the closed DECISIONS-V2 §4.2 registry; registering one is an ADR, not a code change",
      };
    });
  }

  /* -------------------------------- helpers ------------------------------- */

  private async resolveScope(
    tx: Tx,
    req: KpiRequest,
  ): Promise<{ ref: string | null; label: string; assetIds: string[] }> {
    if (req.scopeType === "tenant" || !req.scopeCode) {
      const rows = await tx.select({ id: maintenanceAsset.id }).from(maintenanceAsset);
      return { ref: null, label: "whole tenant", assetIds: rows.map((r) => r.id) };
    }
    const [a] = await tx.select().from(maintenanceAsset).where(eq(maintenanceAsset.assetCode, req.scopeCode)).limit(1);
    if (!a) throw Errors.notFound(`asset ${req.scopeCode}`);
    if (req.scopeType === "asset") return { ref: a.id, label: a.assetCode, assetIds: [a.id] };
    // An area's or plant's numbers ROLL UP the subtree — a component's downtime belongs to
    // its machine, and a machine's to its area (FR-MNT-091).
    const subtree = await tx
      .select({ id: maintenanceAsset.id })
      .from(maintenanceAsset)
      .where(sql`${maintenanceAsset.path} = ${a.path} or ${maintenanceAsset.path} like ${`${a.path}/%`}`);
    return { ref: a.id, label: `${a.assetCode} (subtree)`, assetIds: subtree.map((r) => r.id) };
  }

  private async intervalsInTx(tx: Tx, assetIds: string[], req: KpiRequest): Promise<DowntimeInterval[]> {
    if (assetIds.length === 0) return [];
    // A generous fetch window: an interval that STARTED before the period can still
    // contribute hours to it, so filtering on start alone would lose the month-end case.
    const fetchFrom = new Date(`${req.from}T00:00:00+05:30`);
    fetchFrom.setUTCDate(fetchFrom.getUTCDate() - 31);
    const rows = await tx
      .select()
      .from(assetDowntime)
      .where(
        and(
          inArray(assetDowntime.assetId, assetIds),
          gte(assetDowntime.startedAt, fetchFrom),
          lte(assetDowntime.startedAt, new Date(`${req.to}T23:59:59+05:30`)),
        ),
      )
      .orderBy(asc(assetDowntime.startedAt));
    return rows.map((r) => ({
      id: r.id,
      assetId: r.assetId,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      kind: r.downtimeKind as "unplanned" | "planned",
      productionImpacting: r.productionImpacting,
      reasonCode: r.reasonCode,
      mwoId: r.mwoId,
    }));
  }

  private async occurrencesInTx(tx: Tx, assetIds: string[], req: KpiRequest) {
    if (assetIds.length === 0) return [];
    const rows = await tx
      .select()
      .from(pmOccurrence)
      .where(
        and(
          inArray(pmOccurrence.assetId, assetIds),
          gte(pmOccurrence.dueDate, req.from),
          lte(pmOccurrence.dueDate, req.to),
        ),
      );
    return rows.map((r) => ({
      id: r.id,
      dueDate: r.dueDate!,
      graceDays: r.graceDaysSnapshot ?? 0,
      status: r.status as "scheduled" | "generated" | "in_progress" | "completed" | "skipped" | "missed",
      completedAt: r.completedAt?.toISOString() ?? null,
    }));
  }

  private async mwosInTx(tx: Tx, assetIds: string[], req: KpiRequest) {
    if (assetIds.length === 0) return [];
    return tx
      .select()
      .from(maintenanceWorkOrder)
      .where(
        and(
          inArray(maintenanceWorkOrder.assetId, assetIds),
          gte(maintenanceWorkOrder.reportedAt, new Date(`${req.from}T00:00:00+05:30`)),
          lte(maintenanceWorkOrder.reportedAt, new Date(`${req.to}T23:59:59+05:30`)),
        ),
      )
      .orderBy(desc(maintenanceWorkOrder.reportedAt));
  }

  private async costInTx(tx: Tx, mwoIds: string[]): Promise<{ labour: number; spares: number; external: number; total: number }> {
    if (mwoIds.length === 0) return { labour: 0, spares: 0, external: 0, total: 0 };
    const labour = await tx.select({ amount: mwoLabour.amount }).from(mwoLabour).where(inArray(mwoLabour.mwoId, mwoIds));
    const spares = await tx
      .select({ valuedAmount: mwoSpare.valuedAmount, issueStatus: mwoSpare.issueStatus })
      .from(mwoSpare)
      .where(inArray(mwoSpare.mwoId, mwoIds));
    const external = await tx.select({ amount: mwoExternalCost.amount }).from(mwoExternalCost).where(inArray(mwoExternalCost.mwoId, mwoIds));

    const l = Math.round(labour.reduce((a, r) => a + n(r.amount), 0) * 100) / 100;
    const s =
      Math.round(spares.filter((r) => r.issueStatus === "issued" || r.issueStatus === "returned").reduce((a, r) => a + n(r.valuedAmount), 0) * 100) / 100;
    const e = Math.round(external.reduce((a, r) => a + n(r.amount), 0) * 100) / 100;
    return { labour: l, spares: s, external: e, total: Math.round((l + s + e) * 100) / 100 };
  }
}
