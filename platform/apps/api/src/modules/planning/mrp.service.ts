import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  bucketHorizon,
  bucketOf,
  computeLoad,
  currentTenant,
  eventName,
  generateExceptions,
  newId,
  runMrp,
  summarise,
  type LotRule,
  type MrpItemInput,
  type MrpRunResult,
  type OpenSupply,
  type PlanCalendar,
  type RoutingOperation,
  type ShiftPattern,
  type SourceType,
  type WorkCentre,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { PlanNumberingService } from "./plan-numbering.service.js";
import { PlanningPolicyService } from "./policy.service.js";
import { DemandService } from "./demand.service.js";
import {
  BOM_GRAPH,
  PRODUCTION_SUPPLY,
  PURCHASE_SUPPLY,
  STOCK_READER,
  type BomGraph,
  type StockReader,
  type SupplySource,
} from "../../ports/planning-inputs.port.js";

const {
  itemPlanningPolicy,
  mrpRun,
  mrpRunItem,
  mrpRunBucket,
  plannedOrder,
  plannedOrderPeg,
  planException,
  planCapacityLoad,
  planWorkCentre,
  planShift,
  planWcDowntime,
  planRoutingOperation,
  outboxEvent,
} = schema;

export interface RunMrpInput {
  /** The date the plan is computed AS OF. Defaults to today. */
  planningDate?: string;
  horizonBuckets?: number;
  /** Skip the capacity pass. The netting is the same either way; this only skips the load report. */
  skipCapacity?: boolean;
}

export interface MrpRunSummary {
  runNo: string;
  runId: string;
  planningDate: string;
  firstBucket: string;
  lastBucket: string;
  itemCount: number;
  plannedOrderCount: number;
  exceptionCount: number;
  durationMs: number;
  warnings: string[];
  headline: string;
}

const q3 = (n: number): string => n.toFixed(3);
const h2 = (n: number): string => n.toFixed(2);

/**
 * THE MRP RUN.
 *
 * The netting itself is a pure function in the platform — it takes demand, stock, policy
 * and a bill of materials, and returns a plan. This service is the shell around it: gather
 * the inputs from five other modules through their ports, run the engine, and persist the
 * answer *along with its working*.
 *
 * Persisting the working is the decision worth defending. A cache of planned orders would
 * be a third of the rows and would answer every question a planner asks this week. It
 * would answer none of the questions asked in November, when somebody wants to know why
 * fifty castings were bought in July — and that is the only question anybody ever asks of
 * a plan. So `mrp_run_bucket` keeps the gross, the net and the projected available for
 * every item in every bucket, and the database refuses to let any of it be edited.
 *
 * The run is SYNCHRONOUS. The blueprint specifies an async job with SSE progress
 * (§10.1), which matters at ten thousand items; at pilot scale the whole run is faster
 * than the round trip that would poll it. The engine is already isolated behind a pure
 * function, so moving it onto the BullMQ queue later changes this file and nothing else.
 */
@Injectable()
export class MrpService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly numbering: PlanNumberingService,
    private readonly policies: PlanningPolicyService,
    private readonly demand: DemandService,
    @Inject(BOM_GRAPH) private readonly bomGraph: BomGraph,
    @Inject(STOCK_READER) private readonly stock: StockReader,
    @Inject(PURCHASE_SUPPLY) private readonly purchaseSupply: SupplySource,
    @Inject(PRODUCTION_SUPPLY) private readonly productionSupply: SupplySource,
  ) {}

  async run(input: RunMrpInput = {}): Promise<MrpRunSummary> {
    const startedAt = Date.now();
    const planningDate = input.planningDate ?? new Date().toISOString().slice(0, 10);
    const horizonBuckets = input.horizonBuckets ?? 6;
    if (horizonBuckets < 1 || horizonBuckets > 104) {
      throw new AppError("PLAN_HORIZON_INVALID", 422, "The planning horizon must be between 1 and 104 buckets.");
    }
    const buckets = bucketHorizon(planningDate, horizonBuckets);

    // Levels first: an item netted at the wrong level is netted before its demand exists.
    await this.policies.recomputeLowLevelCodes();

    const cal = await this.policies.calendar();
    const calendar: PlanCalendar = { workingDays: cal.workingDays, holidays: cal.holidays };

    const [edges, demandRows, purchaseOpen, productionOpen] = await Promise.all([
      this.bomGraph.activeBomEdges(),
      this.demand.assemble(buckets),
      this.purchaseSupply.openSupply(),
      this.productionSupply.openSupply(),
    ]);

    const policyRows = await this.policies.list();
    // Reorder-point items are deliberately absent from the explosion: they are replenished
    // by a trigger, and netting them too is the double-ordering this system refuses.
    const planned = policyRows.filter((p) => p.planningMethod === "mrp");
    if (planned.length === 0) {
      throw new AppError("PLAN_NOTHING_TO_PLAN", 422, "No item is set to be planned by MRP. Nothing would be computed.");
    }

    const onHand = await this.stock.onHandByItem(planned.map((p) => p.itemId));
    const onHandOf = new Map(onHand.map((o) => [o.itemId, o.qty]));

    const openSupplyRows = [...purchaseOpen, ...productionOpen];
    const supplyByItem = new Map<string, typeof openSupplyRows>();
    for (const s of openSupplyRows) {
      if (!supplyByItem.has(s.itemId)) supplyByItem.set(s.itemId, []);
      supplyByItem.get(s.itemId)!.push(s);
    }

    const demandOf = new Map(demandRows.map((d) => [d.itemId, d]));
    const policyDetail = await this.policyDetail(planned.map((p) => p.itemId));

    const items: MrpItemInput[] = planned.map((p) => {
      const d = demandOf.get(p.itemId);
      const detail = policyDetail.get(p.itemId)!;
      const independentDemand: Record<string, number> = {};
      const demandRefs: { bucket: string; qty: number; ref: string; kind: "sales_order" | "forecast" | "spares" }[] = [];
      for (const b of d?.buckets ?? []) {
        if (b.netDemand > 0) independentDemand[b.bucket] = b.netDemand;
        for (const r of b.refs) {
          demandRefs.push({ bucket: b.bucket, qty: r.qty, ref: r.ref, kind: r.kind as "sales_order" | "forecast" | "spares" });
        }
      }

      return {
        itemId: p.itemId,
        itemCode: p.itemCode,
        onHand: onHandOf.get(p.itemId) ?? 0,
        safetyStock: Number(p.safetyStock),
        leadTimeWorkingDays: p.leadTimeWorkingDays,
        sourceType: p.sourceType as SourceType,
        lowLevelCode: p.lowLevelCode,
        uomPrecision: detail.uomPrecision,
        lotPolicy: {
          rule: p.lotRule as LotRule,
          lotSize: p.lotSize == null ? null : Number(p.lotSize),
          minOrderQty: detail.minOrderQty,
          annualDemand: detail.annualDemand,
          orderCost: detail.orderCost,
          holdingCost: detail.holdingCost,
          uomPrecision: detail.uomPrecision,
        },
        independentDemand,
        demandRefs,
        scheduledReceipts: (supplyByItem.get(p.itemId) ?? []).map((s) => ({
          // Supply with no promised date is treated as arriving in the first bucket. That
          // is the optimistic reading and it is flagged below, because the alternative —
          // dropping it — plans a second order for material already paid for.
          bucket: s.dueDate ? bucketOf(s.dueDate) : buckets[0]!,
          qty: s.qty,
          ref: s.ref,
          kind: s.kind,
        })),
      };
    });

    const result = runMrp({ today: planningDate, buckets, items, bom: edges.map((e) => ({ parentItemId: e.parentItemId, componentItemId: e.componentItemId, qtyPer: e.qtyPer, scrapPct: e.scrapPct })), calendar });

    // Demand-side warnings (no delivery date, demand behind the horizon) belong on the
    // worklist too, not only in a log line.
    const demandWarnings = demandRows.flatMap((d) =>
      d.warnings.map((message) => ({ itemId: d.itemId, itemCode: d.itemCode, message })),
    );
    const undatedSupply = openSupplyRows.filter((s) => s.dueDate === null);
    const supplyWarnings = undatedSupply.map((s) => ({
      itemId: s.itemId,
      itemCode: planned.find((p) => p.itemId === s.itemId)?.itemCode ?? s.itemId,
      message: `${s.ref} carries no promised date — it is being counted as available now, which is the optimistic reading.`,
      suggestion: "Get a date from the supplier or the shop floor; until then the plan is more confident than the facts.",
    }));

    const abcByItemId = Object.fromEntries(planned.filter((p) => p.abcClass).map((p) => [p.itemId, p.abcClass as "A" | "B" | "C"]));
    const openSupplyForExceptions: OpenSupply[] = openSupplyRows.map((s) => ({
      ref: s.ref,
      kind: s.kind,
      itemId: s.itemId,
      itemCode: planned.find((p) => p.itemId === s.itemId)?.itemCode ?? s.itemId,
      qty: s.qty,
      dueBucket: s.dueDate ? bucketOf(s.dueDate) : buckets[0]!,
    }));

    const exceptions = generateExceptions(result, {
      abcByItemId,
      openSupply: openSupplyForExceptions,
      dataWarnings: [...demandWarnings, ...supplyWarnings],
    });

    const capacity = input.skipCapacity ? [] : await this.capacityFor(result, buckets, calendar);
    const durationMs = Date.now() - startedAt;

    return withTenant(async (tx) => {
      const runId = newId();
      const runNo = await this.numbering.next(tx, "mrp_run", fiscalYearOf(planningDate));
      const { tenantId, actorId } = currentTenant();

      await tx.insert(mrpRun).values({
        id: runId,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        runNo,
        runType: "regenerative",
        planningDate,
        horizonBuckets,
        firstBucket: buckets[0]!,
        lastBucket: buckets[buckets.length - 1]!,
        status: "completed",
        itemCount: result.plans.length,
        plannedOrderCount: result.plannedOrders.length,
        exceptionCount: exceptions.length,
        durationMs,
        // Everything that could change the answer, so the run can be re-derived exactly.
        params: {
          horizonBuckets,
          calendar: { code: cal.code, workingDays: cal.workingDays, holidays: cal.holidays },
          itemsPlanned: planned.length,
          openSupplyRows: openSupplyRows.length,
          demandRows: demandRows.length,
        } as unknown as object,
        warnings: [...result.warnings, ...supplyWarnings.map((w) => w.message)] as unknown as object,
      });

      for (const plan of result.plans) {
        await tx.insert(mrpRunItem).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          runId,
          itemId: plan.itemId,
          itemCode: plan.itemCode,
          lowLevelCode: plan.lowLevelCode,
          sourceType: plan.sourceType,
          openingAvailable: q3(plan.openingAvailable),
          safetyStock: q3(plan.safetyStock),
          warnings: plan.warnings as unknown as object,
        });

        await tx.insert(mrpRunBucket).values(
          plan.rows.map((r, i) => ({
            id: newId(),
            tenantId,
            createdBy: actorId,
            updatedBy: actorId,
            runId,
            itemId: plan.itemId,
            bucket: r.bucket,
            bucketSeq: i,
            grossRequirement: q3(r.grossRequirement),
            scheduledReceipts: q3(r.scheduledReceipts),
            projectedAvailableOpening: q3(r.projectedAvailableOpening),
            netRequirement: q3(r.netRequirement),
            plannedReceipt: q3(r.plannedReceipt),
            projectedAvailable: q3(r.projectedAvailable),
          })),
        );
      }

      const orderIdOf = new Map<string, string>();
      for (const o of result.plannedOrders) {
        const id = newId();
        orderIdOf.set(o.key, id);
        await tx.insert(plannedOrder).values({
          id,
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          runId,
          orderKey: o.key,
          itemId: o.itemId,
          itemCode: o.itemCode,
          sourceType: o.sourceType,
          qty: q3(o.qty),
          netRequirement: q3(o.netRequirement),
          lotRule: o.lotRule,
          lotReason: o.lotReason,
          receiptBucket: o.receiptBucket,
          needDate: o.needDate,
          releaseBucket: o.releaseBucket,
          releaseDate: o.releaseDate,
          computedReleaseBucket: o.computedReleaseBucket,
          computedReleaseDate: o.computedReleaseDate,
          pastDue: o.pastDue,
          daysLate: o.daysLate,
          status: "planned",
        });
      }

      // The pegging graph, written once with the orders and never edited: a reasoning that
      // can be revised afterwards is not a reasoning.
      for (const o of result.plannedOrders) {
        if (o.pegs.length === 0) continue;
        await tx.insert(plannedOrderPeg).values(
          o.pegs
            .filter((p) => p.qty > 0)
            .map((p) => ({
              id: newId(),
              tenantId,
              createdBy: actorId,
              updatedBy: actorId,
              plannedOrderId: orderIdOf.get(o.key)!,
              runId,
              sourceKind: p.kind,
              sourceRef: p.source,
              qty: q3(p.qty),
            })),
        );
      }

      if (exceptions.length > 0) {
        await tx.insert(planException).values(
          exceptions.map((e) => ({
            id: newId(),
            tenantId,
            createdBy: actorId,
            updatedBy: actorId,
            runId,
            exceptionType: e.type,
            severity: e.severity,
            itemId: e.itemId,
            itemCode: e.itemCode,
            ref: e.ref,
            message: e.message,
            suggestion: e.suggestion,
            currentBucket: e.currentBucket ?? null,
            suggestedBucket: e.suggestedBucket ?? null,
            bucketsMoved: e.bucketsMoved ?? null,
            pegKind: e.pegKind,
            pegRef: e.pegRef ?? null,
            status: "open" as const,
          })),
        );
      }

      if (capacity.length > 0) {
        await tx.insert(planCapacityLoad).values(
          capacity.map((c) => ({
            id: newId(),
            tenantId,
            createdBy: actorId,
            updatedBy: actorId,
            runId,
            workCentreId: c.workCentreId,
            workCentreCode: c.workCentreCode,
            bucket: c.bucket,
            availableHours: h2(c.availableHours),
            loadHours: h2(c.loadHours),
            loadPct: c.loadPct === null ? null : h2(c.loadPct),
            status: c.status,
            overloadHours: h2(c.overloadHours),
          })),
        );
      }

      await this.audit.appendInTx(tx, {
        action: "planning.mrp.completed",
        entityType: "mrp_run",
        entityId: runId,
        data: {
          runNo,
          planningDate,
          itemCount: result.plans.length,
          plannedOrderCount: result.plannedOrders.length,
          exceptionCount: exceptions.length,
          durationMs,
        },
      });

      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("planning", "mrp-run", "completed"),
        payload: { runId, runNo, planningDate, plannedOrderCount: result.plannedOrders.length, exceptionCount: exceptions.length },
        createdAt: new Date(),
      });

      return {
        runNo,
        runId,
        planningDate,
        firstBucket: buckets[0]!,
        lastBucket: buckets[buckets.length - 1]!,
        itemCount: result.plans.length,
        plannedOrderCount: result.plannedOrders.length,
        exceptionCount: exceptions.length,
        durationMs,
        warnings: result.warnings,
        headline: summarise(exceptions).headline,
      };
    });
  }

  /**
   * The infinite-capacity load report.
   *
   * MRP planned every one of these orders as though the plant had unlimited hours. This is
   * the pass that says where that assumption breaks — it changes nothing, and it is the
   * only place the plan is compared against physics.
   */
  private async capacityFor(result: MrpRunResult, buckets: readonly string[], calendar: PlanCalendar) {
    return withTenant(async (tx) => {
      const centres = await tx.select().from(planWorkCentre).where(eq(planWorkCentre.isActive, true)).orderBy(asc(planWorkCentre.code));
      if (centres.length === 0) return [];
      const shifts = await tx.select().from(planShift).where(eq(planShift.isActive, true));
      const downtime = await tx.select().from(planWcDowntime).where(eq(planWcDowntime.isActive, true));
      const routings = await tx.select().from(planRoutingOperation).where(eq(planRoutingOperation.isActive, true));

      const workCentres: WorkCentre[] = centres.map((c) => {
        const mine: ShiftPattern[] = shifts
          .filter((s) => s.workCentreId === c.id)
          .map((s) => ({ hours: Number(s.hours), days: (s.days as number[]) ?? [1, 2, 3, 4, 5, 6] }));
        const dt: Record<string, number> = {};
        for (const d of downtime.filter((x) => x.workCentreId === c.id)) dt[d.bucket] = Number(d.hours);
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          machineCount: c.machineCount,
          shifts: mine,
          utilisation: Number(c.utilisationPct),
          efficiency: Number(c.efficiencyPct),
          isBottleneck: c.isBottleneck,
          downtime: dt,
        };
      });

      const ops: RoutingOperation[] = routings.map((r) => ({
        itemId: r.itemId,
        operationSeq: r.operationSeq,
        workCentreId: r.workCentreId,
        setupHours: Number(r.setupHours),
        runHoursPerUnit: Number(r.runHoursPerUnit),
      }));

      return computeLoad({
        workCentres,
        routings: ops,
        // Load lands in the bucket the work is RELEASED in, not the bucket it is received
        // in — the machine is busy while the order is being made, not when it is finished.
        orders: result.plannedOrders.map((o) => ({ ref: o.key, itemId: o.itemId, itemCode: o.itemCode, qty: o.qty, bucket: o.releaseBucket })),
        buckets,
        calendar,
      });
    });
  }

  private async policyDetail(itemIds: readonly string[]) {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(itemPlanningPolicy).where(eq(itemPlanningPolicy.isActive, true));
      const wanted = new Set(itemIds);
      const out = new Map<string, { uomPrecision: number; minOrderQty: number | null; annualDemand: number | null; orderCost: number | null; holdingCost: number | null }>();
      for (const r of rows) {
        if (!wanted.has(r.itemId)) continue;
        out.set(r.itemId, {
          uomPrecision: r.uomPrecision,
          minOrderQty: r.minOrderQty == null ? null : Number(r.minOrderQty),
          annualDemand: r.annualDemand == null ? null : Number(r.annualDemand),
          orderCost: r.orderCost == null ? null : Number(r.orderCost),
          holdingCost: r.holdingCost == null ? null : Number(r.holdingCost),
        });
      }
      return out;
    });
  }

  /* ------------------------------- reading it back ------------------------ */

  async latestRun(): Promise<Record<string, unknown> | null> {
    return withTenant(async (tx) => {
      const [run] = await tx.select().from(mrpRun).orderBy(desc(mrpRun.createdAt)).limit(1);
      return run ? { ...run } : null;
    });
  }

  async getRun(runNo: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const run = await this.runByNo(tx, runNo);
      const itemsRows = await tx.select().from(mrpRunItem).where(eq(mrpRunItem.runId, run.id)).orderBy(asc(mrpRunItem.lowLevelCode), asc(mrpRunItem.itemCode));
      const bucketRows = await tx.select().from(mrpRunBucket).where(eq(mrpRunBucket.runId, run.id)).orderBy(asc(mrpRunBucket.bucketSeq));
      return {
        ...run,
        items: itemsRows.map((i) => ({
          ...i,
          rows: bucketRows.filter((b) => b.itemId === i.itemId).map((b) => ({ ...b })),
        })),
      };
    });
  }

  /** The per-bucket working for one item — "why fifty?", answered without re-running anything. */
  async explainItem(runNo: string, itemCode: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const run = await this.runByNo(tx, runNo);
      const [item] = await tx
        .select()
        .from(mrpRunItem)
        .where(and(eq(mrpRunItem.runId, run.id), eq(mrpRunItem.itemCode, itemCode)))
        .limit(1);
      if (!item) throw new AppError("PLAN_ITEM_NOT_IN_RUN", 404, `${itemCode} was not planned in ${runNo}.`);

      const rows = await tx
        .select()
        .from(mrpRunBucket)
        .where(and(eq(mrpRunBucket.runId, run.id), eq(mrpRunBucket.itemId, item.itemId)))
        .orderBy(asc(mrpRunBucket.bucketSeq));

      const orders = await tx
        .select()
        .from(plannedOrder)
        .where(and(eq(plannedOrder.runId, run.id), eq(plannedOrder.itemId, item.itemId)))
        .orderBy(asc(plannedOrder.receiptBucket));

      return {
        runNo,
        itemCode,
        lowLevelCode: item.lowLevelCode,
        openingAvailable: item.openingAvailable,
        safetyStock: item.safetyStock,
        warnings: item.warnings,
        rows: rows.map((r) => ({
          bucket: r.bucket,
          grossRequirement: r.grossRequirement,
          scheduledReceipts: r.scheduledReceipts,
          projectedAvailableOpening: r.projectedAvailableOpening,
          netRequirement: r.netRequirement,
          plannedReceipt: r.plannedReceipt,
          projectedAvailable: r.projectedAvailable,
          // The arithmetic, in words, for the row that actually ordered something.
          working:
            Number(r.netRequirement) > 0
              ? `${r.grossRequirement} wanted − ${r.scheduledReceipts} already coming − ${r.projectedAvailableOpening} on hand + ${item.safetyStock} safety stock = ${r.netRequirement} short.`
              : `${r.grossRequirement} wanted, covered by ${r.projectedAvailableOpening} on hand and ${r.scheduledReceipts} already coming — nothing to order.`,
        })),
        plannedOrders: orders.map((o) => ({ ...o })),
      };
    });
  }

  async runByNo(tx: Tx, runNo: string) {
    const [run] = await tx.select().from(mrpRun).where(eq(mrpRun.runNo, runNo)).limit(1);
    if (!run) throw new AppError("PLAN_RUN_NOT_FOUND", 404, `Planning run ${runNo} does not exist.`);
    return run;
  }

  async capacityReport(runNo: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const run = await this.runByNo(tx, runNo);
      const rows = await tx
        .select()
        .from(planCapacityLoad)
        .where(eq(planCapacityLoad.runId, run.id))
        .orderBy(asc(planCapacityLoad.workCentreCode), asc(planCapacityLoad.bucket));
      const overloaded = rows.filter((r) => r.status === "red" || r.status === "no_capacity");
      return {
        runNo,
        rows: rows.map((r) => ({ ...r })),
        overloadedCount: overloaded.length,
        headline:
          overloaded.length === 0
            ? "Every work centre fits its load inside the horizon."
            : `${overloaded.length} work-centre week(s) are loaded beyond capacity. MRP planned them as if the plant had unlimited hours; it does not.`,
      };
    });
  }

}

/** FY label used by the number series: 1 April to 31 March, so July 2026 is 2627. */
function fiscalYearOf(dateISO: string): string {
  const y = Number(dateISO.slice(0, 4));
  const m = Number(dateISO.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(2)}${String(start + 1).slice(2)}`;
}
