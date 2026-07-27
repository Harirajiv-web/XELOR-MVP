import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  newId,
  currentTenant,
  eventName,
  decideGeneration,
  describeSchedule,
  projectMeterDue,
  AppError,
  Errors,
  type DriftPolicy,
  type IntervalUnit,
  type LastOccurrence,
  type MeterState,
  type PmType,
  type ScheduleRule,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { ITEM_PROVIDER, type ItemProvider } from "../../ports/item.port.js";
import { MwoService } from "./mwo.service.js";
import { SparesService } from "./spares.service.js";
import { DowntimeService } from "./downtime.service.js";

const {
  pmSchedule,
  pmOccurrence,
  pmTaskTemplate,
  pmDefaultSpare,
  maintenanceAsset,
  assetMeter,
  maintenanceWorkOrder,
  mwoTask,
  criticalitySlaMatrix,
  outboxEvent,
} = schema;

const n = (v: string | null | undefined): number => (v == null ? 0 : Number(v));

export interface GenerationResult {
  pmsCode: string;
  generated: boolean;
  reason: string;
  occurrenceSeq: number | null;
  dueDate: string | null;
  dueBasis: string | null;
  mwoNo: string | null;
  markedMissed: number[];
  sparesFlagged: boolean;
}

/**
 * THE PM GENERATOR (MAINTENANCE §11.2) — calendar, meter, hybrid and statutory.
 *
 * The decision itself is a pure function in `@ind-core/platform` (`decideGeneration`);
 * this service does the three things a database is needed for: read the schedule and its
 * meter, write ONE occurrence idempotently, and instantiate the work order.
 *
 * Two behaviours matter more than the rest:
 *
 *   - **Idempotency is a unique constraint, not a lock.** `UNIQUE (tenant, schedule,
 *     occurrence_seq)` with `ON CONFLICT DO NOTHING` means a retry, a redeploy, a manual
 *     re-run and two workers racing all produce exactly one occurrence. Losing that race
 *     is normal operation, so it is logged, not raised.
 *   - **Backlog protection never stacks.** A schedule dormant for a year marks the
 *     intervals it slept through as `missed` — visibly, in the compliance denominator —
 *     and generates exactly one current occurrence. Waking up to twelve overdue work
 *     orders is how a PM programme dies for the second time.
 */
@Injectable()
export class PmService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly mwos: MwoService,
    private readonly spares: SparesService,
    private readonly downtime: DowntimeService,
    // ENGINEERING owns the item master. Read here — BEFORE the generator's transaction opens
    // — so a spare's code can be written onto its work-order line without the reservation
    // path ever holding two pool connections at once. See `defaultSpareCodes()`.
    @Inject(ITEM_PROVIDER) private readonly items: ItemProvider,
  ) {}

  /** Run the generator across every active schedule, as the hourly worker does. */
  async generateAll(today: string): Promise<GenerationResult[]> {
    const spareCodes = await this.defaultSpareCodes();
    return withTenant(async (tx) => {
      const schedules = await tx
        .select({ pmsCode: pmSchedule.pmsCode })
        .from(pmSchedule)
        .where(eq(pmSchedule.status, "active"))
        .orderBy(asc(pmSchedule.pmsCode));
      const out: GenerationResult[] = [];
      for (const s of schedules) out.push(await this.generateInTx(tx, s.pmsCode, today, spareCodes));
      return out;
    });
  }

  async generate(pmsCode: string, today: string): Promise<GenerationResult> {
    const spareCodes = await this.defaultSpareCodes();
    return withTenant((tx) => this.generateInTx(tx, pmsCode, today, spareCodes));
  }

  /**
   * Item code for every default spare any schedule names, resolved BEFORE the generator's
   * transaction opens.
   *
   * Two sequential connections, never two at once: one short read for the item ids, then one
   * batched call across the module boundary. Doing this inside the generator's transaction —
   * which is where it used to live, one `getItem` per spare line — meant holding a second
   * pool slot on every line, and `DB_POOL_MAX` is 10.
   *
   * The whole table is read rather than the one schedule's rows: `pm_default_spare` is a
   * small configuration table, and one query beats threading a schedule filter through a
   * path that also serves `generateAll`.
   */
  private async defaultSpareCodes(): Promise<ReadonlyMap<string, string>> {
    const itemRefs = await withTenant(async (tx) => {
      const rows = await tx.select({ itemRef: pmDefaultSpare.itemRef }).from(pmDefaultSpare);
      return [...new Set(rows.map((r) => r.itemRef))];
    });
    if (itemRefs.length === 0) return new Map();
    const specs = await this.items.getItems(itemRefs);
    return new Map(specs.map((s) => [s.id, s.itemCode]));
  }

  private async generateInTx(
    tx: Tx,
    pmsCode: string,
    today: string,
    spareCodes: ReadonlyMap<string, string>,
  ): Promise<GenerationResult> {
    const { tenantId, actorId } = currentTenant();
    const s = await this.byCodeInTx(tx, pmsCode);

    const none = (reason: string): GenerationResult => ({
      pmsCode,
      generated: false,
      reason,
      occurrenceSeq: null,
      dueDate: null,
      dueBasis: null,
      mwoNo: null,
      markedMissed: [],
      sparesFlagged: false,
    });

    if (s.status !== "active") return none(`schedule is ${s.status}`);
    if (s.validFrom > today) return none(`not valid until ${s.validFrom}`);
    if (s.validTo != null && s.validTo < today) return none(`expired on ${s.validTo}`);
    if (!s.assetId) return none("fleet schedules (no asset) are post-MVP");

    const [last] = await tx
      .select()
      .from(pmOccurrence)
      .where(eq(pmOccurrence.pmScheduleId, s.id))
      .orderBy(desc(pmOccurrence.occurrenceSeq))
      .limit(1);

    const openOccurrences = await tx
      .select({ id: pmOccurrence.id, occurrenceSeq: pmOccurrence.occurrenceSeq })
      .from(pmOccurrence)
      .where(and(eq(pmOccurrence.pmScheduleId, s.id), inArray(pmOccurrence.status, ["scheduled", "generated", "in_progress"])))
      .orderBy(asc(pmOccurrence.occurrenceSeq));

    let meter: MeterState | undefined;
    if (s.meterType) {
      const [m] = await tx
        .select()
        .from(assetMeter)
        .where(and(eq(assetMeter.assetId, s.assetId), eq(assetMeter.meterType, s.meterType)))
        .limit(1);
      if (!m) return none(`asset has no ${s.meterType} meter`);
      meter = {
        currentValue: n(m.currentValue),
        dailyRateEst: m.dailyRateEst == null ? null : n(m.dailyRateEst),
        lastRealReadingAt: m.lastRealReadingAt?.toISOString().slice(0, 10) ?? null,
      };
    }

    const rule = this.toRule(s);
    const lastOcc: LastOccurrence | null = last
      ? {
          occurrenceSeq: last.occurrenceSeq,
          dueDate: last.dueDate,
          completedAt: last.completedAt?.toISOString() ?? null,
          status: last.status as LastOccurrence["status"],
        }
      : null;

    const decision = decideGeneration(rule, {
      last: lastOcc,
      meter,
      today,
      openOccurrences: openOccurrences.length,
      maxOpen: s.maxOpenOccurrences,
    });

    if (!decision.generate) return none(decision.reason);

    // The same due point twice is not a backlog — it is the same service.
    //
    // A calendar schedule advances its due date off the last occurrence, so re-running the
    // generator is naturally a no-op. A METER schedule does not: `last_generated_meter`
    // only advances when the work is completed, so an unmoved meter recomputes the very
    // same threshold. Without this check, running the generator twice on a Tuesday marks
    // the morning's occurrence "missed" and issues a duplicate work order for the identical
    // 12,000-hour service — backlog protection firing on a backlog that does not exist.
    if (last && ["scheduled", "generated", "in_progress"].includes(last.status)) {
      const sameDuePoint =
        (decision.dueMeterValue != null && last.dueMeterValue != null && n(last.dueMeterValue) === decision.dueMeterValue) ||
        (decision.dueMeterValue == null && decision.dueDate != null && last.dueDate === decision.dueDate);
      if (sameDuePoint) {
        return none(
          `occurrence ${last.occurrenceSeq} is already open for this due point (${last.dueMeterValue != null ? `${n(last.dueMeterValue)} meter units` : last.dueDate})`,
        );
      }
    }

    // Backlog protection: the oldest open occurrence becomes `missed` and stays in the
    // compliance denominator. Hiding it would make the tile flatter and useless.
    const markedMissed: number[] = [];
    if (openOccurrences.length >= s.maxOpenOccurrences) {
      const oldest = openOccurrences[0]!;
      await tx
        .update(pmOccurrence)
        .set({ status: "missed", updatedBy: actorId, updatedAt: new Date() })
        .where(eq(pmOccurrence.id, oldest.id));
      markedMissed.push(oldest.occurrenceSeq);
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("maintenance", "pm", "missed"),
        payload: { pmsCode, occurrenceSeq: oldest.occurrenceSeq },
        createdAt: new Date(),
      });
    }

    const seq = (last?.occurrenceSeq ?? 0) + 1 + decision.skippedIntervals;
    // Every interval the catch-up guard stepped over is recorded as missed, so a schedule
    // that slept for a year leaves a visible trail rather than a silent gap.
    for (let i = 0; i < decision.skippedIntervals; i += 1) {
      const skippedSeq = (last?.occurrenceSeq ?? 0) + 1 + i;
      await tx
        .insert(pmOccurrence)
        .values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          pmScheduleId: s.id,
          assetId: s.assetId,
          occurrenceSeq: skippedSeq,
          dueDate: null,
          dueBasis: decision.dueBasis,
          status: "missed",
          graceDaysSnapshot: s.graceDays,
        })
        .onConflictDoNothing({ target: [pmOccurrence.tenantId, pmOccurrence.pmScheduleId, pmOccurrence.occurrenceSeq] });
      markedMissed.push(skippedSeq);
    }

    const occId = newId();
    const inserted = await tx
      .insert(pmOccurrence)
      .values({
        id: occId,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        pmScheduleId: s.id,
        assetId: s.assetId,
        occurrenceSeq: seq,
        dueDate: decision.dueDate,
        dueMeterValue: decision.dueMeterValue?.toFixed(4) ?? null,
        dueBasis: decision.dueBasis,
        generatedAt: new Date(),
        status: "generated",
        graceDaysSnapshot: s.graceDays,
        competentPersonRef: s.requiresCompetentPerson ? null : null,
      })
      .onConflictDoNothing({ target: [pmOccurrence.tenantId, pmOccurrence.pmScheduleId, pmOccurrence.occurrenceSeq] })
      .returning({ id: pmOccurrence.id });

    if (inserted.length === 0) {
      // Another worker won the race. That is the constraint doing its job, not an error.
      return { ...none("occurrence already generated (idempotent no-op)"), markedMissed };
    }

    const mwo = await this.instantiateMwoInTx(tx, s, occId, seq, decision.dueDate, today);
    await tx
      .update(pmOccurrence)
      .set({ mwoId: mwo.id, updatedBy: actorId })
      .where(eq(pmOccurrence.id, occId));

    // Default spares become planned lines and stores is told early — the point of lead
    // time is that the part is in the crib before the technician walks over.
    const defaults = await tx.select().from(pmDefaultSpare).where(eq(pmDefaultSpare.pmScheduleId, s.id));
    let sparesFlagged = false;
    if (defaults.length > 0) {
      const res = await this.spares.reserveForOccurrence(
        tx,
        mwo.id,
        mwo.mwoNo,
        defaults.map((d) => ({
          itemRef: d.itemRef,
          uom: d.uom,
          qty: n(d.qty),
          itemCode: spareCodes.get(d.itemRef) ?? null,
        })),
      );
      sparesFlagged = res.unavailable.length > 0 || res.reserved > 0;
      await tx
        .update(pmOccurrence)
        .set({ sparesReserved: res.unavailable.length === 0, sparesNote: res.unavailable.join(", ") || null })
        .where(eq(pmOccurrence.id, occId));
    }

    await this.audit.appendInTx(tx, {
      action: "maintenance.pm.generated",
      entityType: "pm_occurrence",
      entityId: occId,
      data: { pmsCode, occurrenceSeq: seq, dueDate: decision.dueDate, dueBasis: decision.dueBasis, mwoNo: mwo.mwoNo, markedMissed },
    });
    await tx.insert(outboxEvent).values({
      id: newId(),
      tenantId,
      name: eventName("maintenance", "pm", "due"),
      payload: { pmsCode, occurrenceSeq: seq, dueDate: decision.dueDate, dueBasis: decision.dueBasis, mwoNo: mwo.mwoNo },
      createdAt: new Date(),
    });
    if (s.pmType === "statutory") {
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("maintenance", "statutory-exam", "due"),
        payload: { pmsCode, statutoryRef: s.statutoryRef, dueDate: decision.dueDate, mwoNo: mwo.mwoNo },
        createdAt: new Date(),
      });
    }
    // A planned window published BEFORE the shutdown is the whole point: Planning nets the
    // capacity out in advance instead of explaining the shortfall afterwards.
    if (decision.dueDate && s.estDurationMin) {
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("maintenance", "downtime", "planned"),
        payload: { assetId: s.assetId, dueDate: decision.dueDate, durationMinutes: s.estDurationMin, mwoNo: mwo.mwoNo },
        createdAt: new Date(),
      });
    }

    return {
      pmsCode,
      generated: true,
      reason: decision.reason,
      occurrenceSeq: seq,
      dueDate: decision.dueDate,
      dueBasis: decision.dueBasis,
      mwoNo: mwo.mwoNo,
      markedMissed,
      sparesFlagged,
    };
  }

  /**
   * The deterministic meter forecast, exposed on its own so the PM Schedules screen can
   * show the projected date, the rate it came from, and a stale-meter warning instead of a
   * confidently wrong date.
   */
  async forecast(pmsCode: string, today: string): Promise<{
    pmsCode: string;
    description: string;
    dueMeterValue: number | null;
    currentValue: number | null;
    dailyRateEst: number | null;
    projectedDate: string | null;
    triggerDate: string | null;
    stale: boolean;
    note: string;
  }> {
    return withTenant(async (tx) => {
      const s = await this.byCodeInTx(tx, pmsCode);
      const description = describeSchedule(this.toRule(s));
      if (!s.meterType || !s.assetId) {
        return {
          pmsCode,
          description,
          dueMeterValue: null,
          currentValue: null,
          dailyRateEst: null,
          projectedDate: null,
          triggerDate: null,
          stale: false,
          note: "calendar schedule — the due date is the calendar, not a forecast",
        };
      }
      const [m] = await tx
        .select()
        .from(assetMeter)
        .where(and(eq(assetMeter.assetId, s.assetId), eq(assetMeter.meterType, s.meterType)))
        .limit(1);
      if (!m) throw Errors.notFound(`meter ${s.meterType}`);

      const projected = projectMeterDue(
        {
          intervalMeterValue: n(s.intervalMeterValue),
          lastGeneratedMeter: s.lastGeneratedMeter == null ? null : n(s.lastGeneratedMeter),
          generateOnForecast: s.generateOnForecast,
        },
        {
          currentValue: n(m.currentValue),
          dailyRateEst: m.dailyRateEst == null ? null : n(m.dailyRateEst),
          lastRealReadingAt: m.lastRealReadingAt?.toISOString().slice(0, 10) ?? null,
        },
        today,
      );
      const triggerDate = projected.projectedDate
        ? new Date(Date.parse(`${projected.projectedDate}T00:00:00Z`) - s.leadDays * 86_400_000).toISOString().slice(0, 10)
        : null;

      return {
        pmsCode,
        description,
        dueMeterValue: projected.dueMeterValue,
        currentValue: n(m.currentValue),
        dailyRateEst: m.dailyRateEst == null ? null : n(m.dailyRateEst),
        projectedDate: projected.projectedDate,
        triggerDate,
        stale: projected.stale,
        note: projected.stale
          ? "meter stale — no observed reading in 60 days, so no date is projected"
          : projected.crossed
            ? "the meter has already crossed the threshold"
            : `${Math.round((projected.dueMeterValue - n(m.currentValue)) * 100) / 100} units to go at ${m.dailyRateEst ?? "?"} per day`,
      };
    });
  }

  /** Skipping counts AGAINST compliance and says why. A skip with no reason is how a PM
   *  programme quietly becomes optional. */
  async skip(pmsCode: string, occurrenceSeq: number, reason: string): Promise<{ pmsCode: string; occurrenceSeq: number; status: string }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const s = await this.byCodeInTx(tx, pmsCode);
      const [occ] = await tx
        .select()
        .from(pmOccurrence)
        .where(and(eq(pmOccurrence.pmScheduleId, s.id), eq(pmOccurrence.occurrenceSeq, occurrenceSeq)))
        .limit(1);
      if (!occ) throw Errors.notFound(`occurrence ${occurrenceSeq} of ${pmsCode}`);
      await tx
        .update(pmOccurrence)
        .set({ status: "skipped", skipReason: reason, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(pmOccurrence.id, occ.id));
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("maintenance", "pm", "skipped"),
        payload: { pmsCode, occurrenceSeq, reason },
        createdAt: new Date(),
      });
      return { pmsCode, occurrenceSeq, status: "skipped" };
    });
  }

  /**
   * Changing an interval, drift policy or checklist on an ACTIVE schedule is a governance
   * event, not an edit — and a statutory schedule can never be set to floating at all
   * (the database refuses it; this refuses it earlier, with a sentence).
   */
  async changeInterval(
    pmsCode: string,
    change: { intervalValue?: number; intervalUnit?: IntervalUnit; driftPolicy?: DriftPolicy },
  ): Promise<{ pmsCode: string; status: string; note: string }> {
    return withTenant(async (tx) => {
      const s = await this.byCodeInTx(tx, pmsCode);
      if (s.pmType === "statutory" && change.driftPolicy === "floating") {
        throw new AppError(
          "STATUTORY_DRIFT_IMMUTABLE",
          422,
          `${pmsCode} is a statutory examination under ${s.statutoryRef ?? "the Factories Act"}; its interval stays on the calendar and cannot float with when the work is done.`,
        );
      }
      if (s.status === "active") {
        throw new AppError(
          "PM_SCHEDULE_LOCKED",
          409,
          `${pmsCode} is active: interval, drift and checklist changes route through approval, not a direct edit. Pause the schedule or raise the change for approval.`,
        );
      }
      const { actorId } = currentTenant();
      await tx
        .update(pmSchedule)
        .set({
          intervalValue: change.intervalValue ?? s.intervalValue,
          intervalUnit: change.intervalUnit ?? s.intervalUnit,
          driftPolicy: change.driftPolicy ?? s.driftPolicy,
          updatedBy: actorId,
          updatedAt: new Date(),
        })
        .where(eq(pmSchedule.id, s.id));
      return { pmsCode, status: s.status, note: "draft schedule updated directly" };
    });
  }

  async listOccurrences(filter: { pmsCode?: string; status?: string[] } = {}): Promise<
    Array<{ pmsCode: string; occurrenceSeq: number; dueDate: string | null; dueBasis: string | null; status: string; mwoNo: string | null; withinGrace: boolean | null }>
  > {
    return withTenant(async (tx) => {
      const conds = [];
      if (filter.pmsCode) {
        const s = await this.byCodeInTx(tx, filter.pmsCode);
        conds.push(eq(pmOccurrence.pmScheduleId, s.id));
      }
      if (filter.status) conds.push(inArray(pmOccurrence.status, filter.status));
      const rows = await tx
        .select({
          occurrenceSeq: pmOccurrence.occurrenceSeq,
          dueDate: pmOccurrence.dueDate,
          dueBasis: pmOccurrence.dueBasis,
          status: pmOccurrence.status,
          withinGrace: pmOccurrence.completedWithinGrace,
          pmsCode: pmSchedule.pmsCode,
          mwoNo: maintenanceWorkOrder.mwoNo,
        })
        .from(pmOccurrence)
        .innerJoin(pmSchedule, eq(pmSchedule.id, pmOccurrence.pmScheduleId))
        .leftJoin(maintenanceWorkOrder, eq(maintenanceWorkOrder.id, pmOccurrence.mwoId))
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(asc(pmSchedule.pmsCode), asc(pmOccurrence.occurrenceSeq));
      return rows;
    });
  }

  /** FR-MNT-107 — the artefact an inspector asks for under s.28/s.29. */
  async statutoryRegister(): Promise<
    Array<{
      assetCode: string;
      assetName: string;
      statutoryClass: string;
      statutoryRef: string | null;
      dueDate: string | null;
      examinedOn: string | null;
      competentPersonRef: string | null;
      result: string;
      mwoNo: string | null;
    }>
  > {
    return withTenant(async (tx) => {
      const rows = await tx
        .select({
          assetCode: maintenanceAsset.assetCode,
          assetName: maintenanceAsset.name,
          statutoryClass: maintenanceAsset.statutoryClass,
          statutoryRef: pmSchedule.statutoryRef,
          dueDate: pmOccurrence.dueDate,
          completedAt: pmOccurrence.completedAt,
          status: pmOccurrence.status,
          competentPersonRef: pmOccurrence.competentPersonRef,
          mwoNo: maintenanceWorkOrder.mwoNo,
          mwoCompetent: maintenanceWorkOrder.competentPersonRef,
        })
        .from(pmOccurrence)
        .innerJoin(pmSchedule, eq(pmSchedule.id, pmOccurrence.pmScheduleId))
        .innerJoin(maintenanceAsset, eq(maintenanceAsset.id, pmOccurrence.assetId))
        .leftJoin(maintenanceWorkOrder, eq(maintenanceWorkOrder.id, pmOccurrence.mwoId))
        .where(eq(pmSchedule.pmType, "statutory"))
        .orderBy(asc(maintenanceAsset.assetCode), asc(pmOccurrence.dueDate));
      return rows.map((r) => ({
        assetCode: r.assetCode,
        assetName: r.assetName,
        statutoryClass: r.statutoryClass,
        statutoryRef: r.statutoryRef,
        dueDate: r.dueDate,
        examinedOn: r.completedAt?.toISOString().slice(0, 10) ?? null,
        competentPersonRef: r.competentPersonRef ?? r.mwoCompetent ?? null,
        result: r.status,
        mwoNo: r.mwoNo,
      }));
    });
  }

  /* -------------------------------- helpers ------------------------------- */

  private toRule(s: typeof pmSchedule.$inferSelect): ScheduleRule {
    const rule: ScheduleRule = { pmType: s.pmType as PmType, leadDays: s.leadDays };
    if (s.intervalValue != null && s.intervalUnit && s.anchorDate && s.driftPolicy) {
      rule.calendar = {
        intervalValue: s.intervalValue,
        intervalUnit: s.intervalUnit as IntervalUnit,
        anchorDate: s.anchorDate,
        driftPolicy: s.driftPolicy as DriftPolicy,
      };
    }
    if (s.meterType && s.intervalMeterValue != null) {
      rule.meter = {
        intervalMeterValue: n(s.intervalMeterValue),
        lastGeneratedMeter: s.lastGeneratedMeter == null ? null : n(s.lastGeneratedMeter),
        generateOnForecast: s.generateOnForecast,
      };
    }
    return rule;
  }

  private async byCodeInTx(tx: Tx, pmsCode: string) {
    const [s] = await tx.select().from(pmSchedule).where(eq(pmSchedule.pmsCode, pmsCode)).limit(1);
    if (!s) throw Errors.notFound(`PM schedule ${pmsCode}`);
    return s;
  }

  /** Instantiate the work order and pin the checklist TEMPLATE VERSION onto its tasks, so
   *  a revision to the template never rewrites a job already on the floor (FR-MNT-056). */
  private async instantiateMwoInTx(
    tx: Tx,
    s: typeof pmSchedule.$inferSelect,
    occurrenceId: string,
    seq: number,
    dueDate: string | null,
    today: string,
  ): Promise<{ id: string; mwoNo: string }> {
    const { tenantId, actorId } = currentTenant();
    const [asset] = await tx.select().from(maintenanceAsset).where(eq(maintenanceAsset.id, s.assetId!)).limit(1);

    // Preventive work is priced off the criticality matrix at severity 'degraded' — a
    // service due is not a machine down, and pretending otherwise floods the P1 queue.
    const [slaRow] = await tx
      .select()
      .from(criticalitySlaMatrix)
      .where(and(eq(criticalitySlaMatrix.criticality, asset!.criticality ?? "C"), eq(criticalitySlaMatrix.severity, "degraded")))
      .orderBy(desc(criticalitySlaMatrix.effectiveFrom))
      .limit(1);

    const plannedStart = dueDate ? new Date(`${dueDate}T09:00:00+05:30`) : new Date(`${today}T09:00:00+05:30`);
    const plannedEnd = new Date(plannedStart.getTime() + (s.estDurationMin ?? 60) * 60_000);

    const created = await this.mwos.createInTx(tx, {
      assetId: s.assetId!,
      mwoType: s.pmType === "statutory" ? "statutory" : "preventive",
      priority: slaRow?.priority ?? "P3",
      source: "pm_occurrence",
      pmOccurrenceId: occurrenceId,
      title: `${s.name} (occurrence ${seq})`,
      description: s.statutoryRef ? `Statutory examination under ${s.statutoryRef}` : s.name,
      reportedAt: new Date().toISOString(),
      plannedStart: plannedStart.toISOString(),
      plannedEnd: plannedEnd.toISOString(),
      costCentreRef: asset?.costCentreRef ?? undefined,
      idempotencyKey: `pm:${s.id}:${seq}`,
    });

    const template = await tx
      .select()
      .from(pmTaskTemplate)
      .where(and(eq(pmTaskTemplate.pmScheduleId, s.id), eq(pmTaskTemplate.version, s.templateVersion)))
      .orderBy(asc(pmTaskTemplate.sequence));
    for (const t of template) {
      await tx.insert(mwoTask).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        mwoId: created.id,
        sequence: t.sequence,
        instruction: t.instruction,
        safetyNote: t.safetyNote,
        resultType: t.resultType,
        expectedMin: t.expectedMin,
        expectedMax: t.expectedMax,
        uom: t.uom,
        isMandatory: t.isMandatory,
        templateVersion: s.templateVersion,
      });
    }
    return created;
  }
}
