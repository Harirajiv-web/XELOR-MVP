import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  buildMps,
  bucketOf,
  checkFence,
  consumeForecast,
  consumptionSummary,
  currentTenant,
  earliestPromise,
  newId,
  type ConsumedBucket,
  type MpsRow,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { DEMAND_SOURCE, STOCK_READER, type DemandSource, type StockReader } from "../../ports/planning-inputs.port.js";

const { planForecast, planDemandLine, mpsRow, itemPlanningPolicy } = schema;

export interface DemandBucketRow {
  bucket: string;
  forecastQty: number;
  orderQty: number;
  netDemand: number;
  consumedQty: number;
  remainingForecast: number;
  unforecastOrderQty: number;
  refs: { ref: string; qty: number; kind: string }[];
}

export interface ItemDemand {
  itemId: string;
  itemCode: string;
  buckets: DemandBucketRow[];
  warnings: string[];
}

/**
 * DEMAND AND THE MASTER PRODUCTION SCHEDULE.
 *
 * Two kinds of independent demand arrive here and must not be added together: what sales
 * actually sold, and what the forecast predicted they would. Real orders CONSUME the
 * forecast they were predicted by; adding them plans the same pump twice and the plant
 * builds inventory nobody asked for.
 *
 * Sales-order demand is read through the DEMAND_SOURCE port at run time and never copied
 * into a table here. A snapshot of somebody else's system of record is a second copy that
 * begins drifting the moment it is written.
 */
@Injectable()
export class DemandService {
  constructor(
    private readonly audit: AuditLogService,
    @Inject(DEMAND_SOURCE) private readonly demand: DemandSource,
    @Inject(STOCK_READER) private readonly stock: StockReader,
  ) {}

  /**
   * Assemble independent demand per item across the horizon.
   *
   * A sales-order line with no requested delivery date is placed in the FIRST bucket and a
   * warning is raised. That is deliberately the pessimistic choice: it makes the order look
   * urgent and puts it on the planner's worklist, which is where an order carrying no
   * promised date belongs. Placing it at the end of the horizon would hide it.
   */
  async assemble(buckets: readonly string[]): Promise<ItemDemand[]> {
    const openDemand = await this.demand.openSalesDemand();

    return withTenant(async (tx) => {
      const policies = await tx.select().from(itemPlanningPolicy).where(eq(itemPlanningPolicy.isActive, true));
      const codeOf = new Map(policies.map((p) => [p.itemId, p.itemCode]));
      const inHorizon = new Set(buckets);
      const first = buckets[0]!;

      const forecasts = await tx.select().from(planForecast).where(eq(planForecast.isActive, true));
      const spares = await tx.select().from(planDemandLine).where(eq(planDemandLine.isActive, true));

      // itemId -> bucket -> accumulators
      const byItem = new Map<string, Map<string, { forecast: number; order: number; refs: { ref: string; qty: number; kind: string }[] }>>();
      const warnings = new Map<string, string[]>();
      const cell = (itemId: string, bucket: string) => {
        if (!byItem.has(itemId)) byItem.set(itemId, new Map());
        const m = byItem.get(itemId)!;
        if (!m.has(bucket)) m.set(bucket, { forecast: 0, order: 0, refs: [] });
        return m.get(bucket)!;
      };
      const warn = (itemId: string, message: string) => {
        if (!warnings.has(itemId)) warnings.set(itemId, []);
        const list = warnings.get(itemId)!;
        if (!list.includes(message)) list.push(message);
      };

      for (const f of forecasts) {
        if (!inHorizon.has(f.bucket)) continue;
        cell(f.itemId, f.bucket).forecast += Number(f.qty);
      }

      for (const d of openDemand) {
        if (!codeOf.has(d.itemId)) continue; // an item with no planning policy is not planned
        let bucket: string;
        if (d.requestedDeliveryDate) {
          bucket = bucketOf(d.requestedDeliveryDate);
          if (!inHorizon.has(bucket)) {
            // Demand behind the horizon is already late; demand beyond it is not this run's
            // business. Both are worth saying out loud rather than dropping.
            if (bucket < first) {
              warn(d.itemId, `${d.ref} wanted ${d.qty} by ${bucket}, which is before the planning horizon opens — it is already overdue.`);
              bucket = first;
            } else {
              continue;
            }
          }
        } else {
          bucket = first;
          warn(d.itemId, `${d.ref} has no requested delivery date — its ${d.qty} is being planned into ${first}. Ask the customer, or the plan is promising a date nobody agreed to.`);
        }
        const c = cell(d.itemId, bucket);
        c.order += d.qty;
        c.refs.push({ ref: d.ref, qty: d.qty, kind: "sales_order" });
      }

      for (const s of spares) {
        if (!inHorizon.has(s.bucket)) continue;
        const c = cell(s.itemId, s.bucket);
        c.order += Number(s.qty);
        c.refs.push({ ref: s.ref, qty: Number(s.qty), kind: "spares" });
      }

      const out: ItemDemand[] = [];
      for (const [itemId, m] of byItem) {
        const rows = buckets.map((b) => ({
          bucket: b,
          forecastQty: m.get(b)?.forecast ?? 0,
          orderQty: m.get(b)?.order ?? 0,
        }));
        const consumed: ConsumedBucket[] = consumeForecast(rows);
        out.push({
          itemId,
          itemCode: codeOf.get(itemId) ?? itemId,
          buckets: consumed.map((c, i) => ({
            bucket: c.bucket,
            forecastQty: c.forecastQty,
            orderQty: c.orderQty,
            netDemand: c.netDemand,
            consumedQty: c.consumedQty,
            remainingForecast: c.remainingForecast,
            unforecastOrderQty: c.unforecastOrderQty,
            refs: m.get(buckets[i]!)?.refs ?? [],
          })),
          warnings: warnings.get(itemId) ?? [],
        });
      }
      return out.sort((a, b) => a.itemCode.localeCompare(b.itemCode));
    });
  }

  /** How well orders and forecast are reconciling — a conversation opener, not a grade. */
  async consumption(buckets: readonly string[]): Promise<Record<string, unknown>[]> {
    const demand = await this.assemble(buckets);
    return demand.map((d) => ({
      itemCode: d.itemCode,
      ...consumptionSummary(
        d.buckets.map((b) => ({
          bucket: b.bucket,
          forecastQty: b.forecastQty,
          orderQty: b.orderQty,
          consumedQty: b.consumedQty,
          remainingForecast: b.remainingForecast,
          netDemand: b.netDemand,
          unforecastOrderQty: b.unforecastOrderQty,
        })),
      ),
    }));
  }

  /** Set or replace a forecast cell. */
  async setForecast(input: { itemId: string; bucket: string; qty: number; note?: string }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    if (input.qty < 0) throw Errors.validation([{ field: "qty", message: "a forecast cannot be negative" }]);
    return withTenant(async (tx) => {
      const [policy] = await tx.select().from(itemPlanningPolicy).where(eq(itemPlanningPolicy.itemId, input.itemId)).limit(1);
      if (!policy) throw Errors.notFound(`planning policy for item ${input.itemId}`);

      const rows = await tx
        .select()
        .from(planForecast)
        .where(eq(planForecast.itemId, input.itemId))
        .orderBy(asc(planForecast.bucket));
      const match = rows.find((r) => r.bucket === input.bucket);

      if (match) {
        await tx
          .update(planForecast)
          .set({ qty: input.qty.toFixed(3), note: input.note ?? match.note, updatedBy: actorId, updatedAt: new Date() })
          .where(eq(planForecast.id, match.id));
      } else {
        await tx.insert(planForecast).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          itemId: input.itemId,
          itemCode: policy.itemCode,
          bucket: input.bucket,
          qty: input.qty.toFixed(3),
          source: "manual",
          note: input.note ?? null,
        });
      }
      return { itemCode: policy.itemCode, bucket: input.bucket, qty: input.qty };
    });
  }

  /* ------------------------------- the MPS -------------------------------- */

  /**
   * Build the MPS grid for an item, live, from the stored receipts and the current demand.
   *
   * The ATP row is the one the sales desk quotes from, and it is deliberately NOT the
   * projected on-hand: stock already promised to a customer is on hand and unavailable at
   * the same time.
   */
  async mps(itemId: string, buckets: readonly string[]): Promise<Record<string, unknown>> {
    const demand = await this.assemble(buckets);
    const [onHandRow] = await this.stock.onHandByItem([itemId]);

    return withTenant(async (tx) => {
      const [policy] = await tx.select().from(itemPlanningPolicy).where(eq(itemPlanningPolicy.itemId, itemId)).limit(1);
      if (!policy) throw Errors.notFound(`planning policy for item ${itemId}`);
      if (!policy.isMpsItem) {
        throw new AppError("PLAN_NOT_MPS_ITEM", 422, `${policy.itemCode} is not an MPS item. Only items scheduled at the top level carry a master production schedule.`);
      }

      const stored = await tx.select().from(mpsRow).where(eq(mpsRow.itemId, itemId));
      const receiptOf = new Map(stored.map((r) => [r.bucket, Number(r.mpsReceiptQty)]));
      const mine = demand.find((d) => d.itemId === itemId);

      const rows = buildMps({
        onHand: Number(onHandRow?.qty ?? 0),
        demandTimeFenceBuckets: policy.demandTimeFenceBuckets,
        planningTimeFenceBuckets: policy.planningTimeFenceBuckets,
        rows: buckets.map((b) => {
          const d = mine?.buckets.find((x) => x.bucket === b);
          return {
            bucket: b,
            mpsReceiptQty: receiptOf.get(b) ?? 0,
            forecastQty: d?.forecastQty ?? 0,
            orderQty: d?.orderQty ?? 0,
          };
        }),
      });

      return { itemId, itemCode: policy.itemCode, onHand: Number(onHandRow?.qty ?? 0), rows };
    });
  }

  /** "When can I promise twelve more?" — answered with a week, or an honest no. */
  async promise(itemId: string, qty: number, buckets: readonly string[]): Promise<Record<string, unknown>> {
    const grid = (await this.mps(itemId, buckets)) as { itemCode: string; rows: MpsRow[] };
    return { itemCode: grid.itemCode, qty, ...earliestPromise(grid.rows, qty) };
  }

  /**
   * Change an MPS receipt.
   *
   * A frozen bucket refuses the change unless the caller has the role AND supplies a
   * reason. The reason is not paperwork: it is the only record of why the plant tore up a
   * schedule it had already committed material against.
   */
  async setMpsReceipt(input: {
    itemId: string;
    bucket: string;
    qty: number;
    buckets: readonly string[];
    hasOverrideRole?: boolean;
    overrideReason?: string;
  }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const grid = (await this.mps(input.itemId, input.buckets)) as { itemCode: string; rows: MpsRow[] };
    const row = grid.rows.find((r) => r.bucket === input.bucket);
    if (!row) throw Errors.notFound(`MPS bucket ${input.bucket}`);

    const verdict = checkFence(row, input.qty, { hasOverrideRole: input.hasOverrideRole, overrideReason: input.overrideReason });
    if (!verdict.allowed) {
      throw new AppError("PLAN_FENCE_VIOLATION", 409, verdict.reason);
    }

    return withTenant(async (tx) => {
      const existing = await tx.select().from(mpsRow).where(eq(mpsRow.itemId, input.itemId));
      const match = existing.find((r) => r.bucket === input.bucket);
      const overrideFields = verdict.requiresOverride
        ? { overrideBy: actorId, overrideReason: input.overrideReason ?? null }
        : {};

      if (match) {
        await tx
          .update(mpsRow)
          .set({ mpsReceiptQty: input.qty.toFixed(3), updatedBy: actorId, updatedAt: new Date(), ...overrideFields })
          .where(eq(mpsRow.id, match.id));
      } else {
        await tx.insert(mpsRow).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          itemId: input.itemId,
          itemCode: grid.itemCode,
          bucket: input.bucket,
          mpsReceiptQty: input.qty.toFixed(3),
          fence: row.fence,
          ...overrideFields,
        });
      }

      await this.audit.appendInTx(tx, {
        action: "planning.mps.changed",
        entityType: "mps_row",
        entityId: match?.id ?? newId(),
        data: {
          itemCode: grid.itemCode,
          bucket: input.bucket,
          from: row.mpsReceiptQty,
          to: input.qty,
          fence: row.fence,
          override: verdict.requiresOverride,
          reason: input.overrideReason ?? null,
        },
      });

      return { itemCode: grid.itemCode, bucket: input.bucket, qty: input.qty, fence: row.fence, ...verdict };
    });
  }
}
