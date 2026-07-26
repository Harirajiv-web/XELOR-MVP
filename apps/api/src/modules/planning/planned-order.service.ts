import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import { AppError, currentTenant, eventName, newId } from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { PlanNumberingService } from "./plan-numbering.service.js";
import { PRODUCTION_ORDER_CREATOR, type ProductionOrderCreator } from "../../ports/planning-inputs.port.js";

const { mrpRun, plannedOrder, plannedOrderPeg, purchaseRequisition, outboxEvent } = schema;

export interface PlannedOrderRow {
  id: string;
  orderKey: string;
  itemCode: string;
  sourceType: string;
  qty: string;
  lotRule: string;
  lotReason: string;
  receiptBucket: string;
  releaseBucket: string;
  releaseDate: string;
  computedReleaseBucket: string;
  pastDue: boolean;
  daysLate: number;
  status: string;
  convertedToKind: string | null;
  convertedToRef: string | null;
}

/**
 * THE PLANNED-ORDER WORKBENCH.
 *
 * A planned order is a suggestion. It costs nothing, commits nobody and disappears on the
 * next regenerative run — which is exactly what makes MRP safe to re-run every night.
 *
 * FIRMING is the moment that changes. A firmed order survives the next run and enters it
 * as a scheduled receipt, so the engine plans around it instead of re-deciding it. That is
 * a human saying "this one is real now", and it is the last cheap step.
 *
 * CONVERTING is the expensive one: it creates a work order or a requisition, and from that
 * point the plant has committed labour or a supplier has been asked for a price. Two
 * guards sit on it, both enforced in the database rather than here, because a guard in an
 * application is a guard one code path can miss:
 *   - a planned order may be converted exactly once (`uq_plannedorder_conversion`), and
 *   - one requisition per planned order (`uq_purchreq_planned_order`).
 * Converting twice builds the same pump twice, and nothing downstream notices until the
 * stock does not move.
 */
@Injectable()
export class PlannedOrderService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly numbering: PlanNumberingService,
    @Inject(PRODUCTION_ORDER_CREATOR) private readonly production: ProductionOrderCreator,
  ) {}

  async list(filter: { runNo?: string; status?: string; sourceType?: string; releaseBucket?: string } = {}): Promise<PlannedOrderRow[]> {
    return withTenant(async (tx) => {
      const runId = filter.runNo ? (await this.runByNo(tx, filter.runNo)).id : (await this.latestRunId(tx));
      if (!runId) return [];
      const rows = await tx
        .select()
        .from(plannedOrder)
        .where(eq(plannedOrder.runId, runId))
        .orderBy(asc(plannedOrder.releaseBucket), asc(plannedOrder.itemCode));
      return rows
        .filter((r) => (filter.status ? r.status === filter.status : true))
        .filter((r) => (filter.sourceType ? r.sourceType === filter.sourceType : true))
        .filter((r) => (filter.releaseBucket ? r.releaseBucket === filter.releaseBucket : true))
        .map((r) => this.toRow(r));
    });
  }

  /**
   * The pegging chain: why this order exists, all the way up to the demand that caused it.
   *
   * This is the single most asked question of any MRP system, and answering it is why the
   * peg rows are written with the order rather than reconstructed later. A chain rebuilt
   * from a re-run is a chain that can disagree with the order it explains.
   */
  async peg(orderKey: string, runNo?: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const runId = runNo ? (await this.runByNo(tx, runNo)).id : await this.latestRunId(tx);
      if (!runId) throw new AppError("PLAN_NO_RUN", 404, "No planning run exists yet.");

      const all = await tx.select().from(plannedOrder).where(eq(plannedOrder.runId, runId));
      const byKey = new Map(all.map((o) => [o.orderKey, o]));
      const start = byKey.get(orderKey);
      if (!start) throw new AppError("PLAN_ORDER_NOT_FOUND", 404, `Planned order ${orderKey} is not in this run.`);

      const pegs = await tx.select().from(plannedOrderPeg).where(eq(plannedOrderPeg.runId, runId));
      const pegsOf = new Map<string, typeof pegs>();
      for (const p of pegs) {
        if (!pegsOf.has(p.plannedOrderId)) pegsOf.set(p.plannedOrderId, []);
        pegsOf.get(p.plannedOrderId)!.push(p);
      }

      const chain: Record<string, unknown>[] = [];
      const demands: { ref: string; kind: string; qty: string }[] = [];
      const seen = new Set<string>();
      const queue = [orderKey];

      while (queue.length > 0) {
        const key = queue.shift()!;
        if (seen.has(key)) continue;
        seen.add(key);
        const order = byKey.get(key);
        if (!order) continue;
        chain.push({
          orderKey: order.orderKey,
          itemCode: order.itemCode,
          qty: order.qty,
          sourceType: order.sourceType,
          releaseBucket: order.releaseBucket,
          receiptBucket: order.receiptBucket,
          pastDue: order.pastDue,
        });
        for (const p of pegsOf.get(order.id) ?? []) {
          if (p.sourceKind === "planned_order") queue.push(p.sourceRef);
          else demands.push({ ref: p.sourceRef, kind: p.sourceKind, qty: p.qty });
        }
      }

      const narrative =
        demands.length > 0
          ? `${start.qty} ${start.itemCode} is needed because ${demands.map((d) => `${d.ref} (${d.kind.replace("_", " ")})`).join(", ")} — through ${chain.length - 1} level(s) of the bill of materials.`
          : `${start.qty} ${start.itemCode} has no independent demand pegged to it inside this horizon.`;

      return { orderKey, chain, demands, narrative };
    });
  }

  /**
   * Firm a planned order: it survives the next regenerative run.
   *
   * The engine will then see it as a scheduled receipt at the date it carries and plan
   * around it — including raising a reschedule exception if the plan later disagrees with
   * it, which is the honest way to handle a commitment a human made.
   */
  async firm(orderKey: string, runNo?: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const order = await this.orderByKey(tx, orderKey, runNo);
      if (order.status === "converted") {
        throw new AppError("PLAN_ALREADY_CONVERTED", 409, `${orderKey} has already become ${order.convertedToRef}.`);
      }
      if (order.status === "firmed") {
        return { orderKey, status: "firmed", replay: true, message: "Already firmed." };
      }
      await tx
        .update(plannedOrder)
        .set({ status: "firmed", firmedBy: actorId, firmedAt: new Date(), updatedBy: actorId, updatedAt: new Date() })
        .where(eq(plannedOrder.id, order.id));

      await this.audit.appendInTx(tx, {
        action: "planning.planned_order.firmed",
        entityType: "planned_order",
        entityId: order.id,
        data: { orderKey, itemCode: order.itemCode, qty: order.qty, releaseBucket: order.releaseBucket },
      });

      return {
        orderKey,
        status: "firmed",
        replay: false,
        message: `${order.qty} ${order.itemCode} is firmed for release in ${order.releaseBucket}. The next MRP run will plan around it instead of re-deciding it.`,
      };
    });
  }

  /**
   * Convert a planned order into the real document it was always proposing.
   *
   * A make order goes to PRODUCTION through the port — that module decides the BOM version,
   * snapshots the components and owns the stock path. A buy order becomes a purchase
   * requisition here, because Planning owns the requisition and PURCHASE owns what happens
   * to it afterwards: this module does not raise purchase orders.
   */
  async convert(orderKey: string, idempotencyKey: string, opts: { runNo?: string; suggestedVendorRef?: string } = {}): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();

    // The production port creates its document in its own transaction, so the check and
    // the write cannot be one atomic step here. The database's unique index on the
    // conversion is what actually prevents a double conversion; this is the friendly error.
    const preflight = await withTenant(async (tx) => this.orderByKey(tx, orderKey, opts.runNo));
    if (preflight.status === "converted") {
      throw new AppError("PLAN_ALREADY_CONVERTED", 409, `${orderKey} has already become ${preflight.convertedToKind} ${preflight.convertedToRef}.`);
    }
    if (preflight.status === "cancelled") {
      throw new AppError("PLAN_ORDER_CANCELLED", 409, `${orderKey} was cancelled and cannot be converted.`);
    }

    if (preflight.sourceType === "make") {
      const created = await this.production.createFromPlan(
        { itemId: preflight.itemId, qty: Number(preflight.qty), plannedOrderKey: orderKey, needDate: preflight.needDate },
        idempotencyKey,
      );
      return withTenant(async (tx) => {
        await this.markConverted(tx, preflight.id, "production_order", created.ref);
        await this.audit.appendInTx(tx, {
          action: "planning.planned_order.converted",
          entityType: "planned_order",
          entityId: preflight.id,
          data: { orderKey, kind: "production_order", ref: created.ref, qty: preflight.qty, itemCode: preflight.itemCode },
        });
        await tx.insert(outboxEvent).values({
          id: newId(),
          tenantId,
          name: eventName("planning", "planned-order", "converted"),
          payload: { orderKey, kind: "production_order", ref: created.ref, itemCode: preflight.itemCode },
          createdAt: new Date(),
        });
        return {
          orderKey,
          kind: "production_order",
          ref: created.ref,
          message: `${preflight.qty} ${preflight.itemCode} is now work order ${created.ref}. Production owns it from here.`,
        };
      });
    }

    return withTenant(async (tx) => {
      const reqNo = await this.numbering.next(tx, "requisition", fiscalYearOf(preflight.needDate));
      const reqId = newId();
      await tx.insert(purchaseRequisition).values({
        id: reqId,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        reqNo,
        plannedOrderId: preflight.id,
        itemId: preflight.itemId,
        itemCode: preflight.itemCode,
        qty: preflight.qty,
        needDate: preflight.needDate,
        releaseDate: preflight.releaseDate,
        suggestedVendorRef: opts.suggestedVendorRef ?? null,
        status: "open",
        note: preflight.pastDue
          ? `Released late: the lead time wanted this order in ${preflight.computedReleaseBucket}. Ask for a pull-in of ${preflight.daysLate} working day(s).`
          : null,
      });

      await this.markConverted(tx, preflight.id, "purchase_requisition", reqNo);
      await this.audit.appendInTx(tx, {
        action: "planning.planned_order.converted",
        entityType: "planned_order",
        entityId: preflight.id,
        data: { orderKey, kind: "purchase_requisition", ref: reqNo, qty: preflight.qty, itemCode: preflight.itemCode },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("planning", "requisition", "raised"),
        payload: { reqNo, itemId: preflight.itemId, itemCode: preflight.itemCode, qty: preflight.qty, needDate: preflight.needDate },
        createdAt: new Date(),
      });

      return {
        orderKey,
        kind: "purchase_requisition",
        ref: reqNo,
        message: `${preflight.qty} ${preflight.itemCode} is now requisition ${reqNo}, waiting for Purchase to raise an order against it.`,
      };
    });
  }

  /** Convert several at once — the bulk action the exception worklist offers. */
  async convertBulk(orderKeys: readonly string[], idempotencyKeyPrefix: string, runNo?: string): Promise<Record<string, unknown>> {
    const converted: Record<string, unknown>[] = [];
    const refused: { orderKey: string; reason: string }[] = [];
    for (const key of orderKeys) {
      try {
        converted.push(await this.convert(key, `${idempotencyKeyPrefix}:${key}`, { runNo }));
      } catch (e) {
        // One bad order must not abandon the rest — a planner clearing a worklist wants
        // the twelve that worked, and a named reason for the one that did not.
        refused.push({ orderKey: key, reason: e instanceof AppError ? e.message : String(e) });
      }
    }
    return { convertedCount: converted.length, refusedCount: refused.length, converted, refused };
  }

  async cancel(orderKey: string, reason: string, runNo?: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    if (!reason.trim()) throw new AppError("PLAN_CANCEL_NEEDS_REASON", 422, "Cancelling a planned order needs a reason — the next run will propose it again otherwise.");
    return withTenant(async (tx) => {
      const order = await this.orderByKey(tx, orderKey, runNo);
      if (order.status === "converted") {
        throw new AppError("PLAN_ALREADY_CONVERTED", 409, `${orderKey} already became ${order.convertedToRef}; cancel that document instead.`);
      }
      await tx
        .update(plannedOrder)
        .set({ status: "cancelled", updatedBy: actorId, updatedAt: new Date() })
        .where(eq(plannedOrder.id, order.id));
      await this.audit.appendInTx(tx, {
        action: "planning.planned_order.cancelled",
        entityType: "planned_order",
        entityId: order.id,
        data: { orderKey, reason },
      });
      return { orderKey, status: "cancelled", reason };
    });
  }

  async requisitions(status?: string): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(purchaseRequisition).orderBy(asc(purchaseRequisition.needDate));
      return rows.filter((r) => (status ? r.status === status : true)).map((r) => ({ ...r }));
    });
  }

  /** Firmed orders re-enter the next run as scheduled receipts rather than being re-decided. */
  async firmedAsScheduledReceipts(runNo?: string): Promise<{ itemId: string; bucket: string; qty: number; ref: string }[]> {
    return withTenant(async (tx) => {
      const runId = runNo ? (await this.runByNo(tx, runNo)).id : await this.latestRunId(tx);
      if (!runId) return [];
      const rows = await tx
        .select()
        .from(plannedOrder)
        .where(and(eq(plannedOrder.runId, runId), inArray(plannedOrder.status, ["firmed", "converted"])));
      return rows.map((r) => ({ itemId: r.itemId, bucket: r.receiptBucket, qty: Number(r.qty), ref: r.orderKey }));
    });
  }

  /* --------------------------------- helpers ------------------------------ */

  private async markConverted(tx: Tx, id: string, kind: "production_order" | "purchase_requisition", ref: string): Promise<void> {
    const { actorId } = currentTenant();
    await tx
      .update(plannedOrder)
      .set({ status: "converted", convertedToKind: kind, convertedToRef: ref, convertedAt: new Date(), updatedBy: actorId, updatedAt: new Date() })
      .where(eq(plannedOrder.id, id));
  }

  private async orderByKey(tx: Tx, orderKey: string, runNo?: string) {
    const runId = runNo ? (await this.runByNo(tx, runNo)).id : await this.latestRunId(tx);
    if (!runId) throw new AppError("PLAN_NO_RUN", 404, "No planning run exists yet.");
    const [order] = await tx
      .select()
      .from(plannedOrder)
      .where(and(eq(plannedOrder.runId, runId), eq(plannedOrder.orderKey, orderKey)))
      .limit(1);
    if (!order) throw new AppError("PLAN_ORDER_NOT_FOUND", 404, `Planned order ${orderKey} is not in this run.`);
    return order;
  }

  private async runByNo(tx: Tx, runNo: string) {
    const [run] = await tx.select().from(mrpRun).where(eq(mrpRun.runNo, runNo)).limit(1);
    if (!run) throw new AppError("PLAN_RUN_NOT_FOUND", 404, `Planning run ${runNo} does not exist.`);
    return run;
  }

  private async latestRunId(tx: Tx): Promise<string | null> {
    const [run] = await tx.select({ id: mrpRun.id }).from(mrpRun).orderBy(desc(mrpRun.createdAt)).limit(1);
    return run?.id ?? null;
  }

  private toRow(r: typeof plannedOrder.$inferSelect): PlannedOrderRow {
    return {
      id: r.id,
      orderKey: r.orderKey,
      itemCode: r.itemCode,
      sourceType: r.sourceType,
      qty: r.qty,
      lotRule: r.lotRule,
      lotReason: r.lotReason,
      receiptBucket: r.receiptBucket,
      releaseBucket: r.releaseBucket,
      releaseDate: r.releaseDate,
      computedReleaseBucket: r.computedReleaseBucket,
      pastDue: r.pastDue,
      daysLate: r.daysLate,
      status: r.status,
      convertedToKind: r.convertedToKind,
      convertedToRef: r.convertedToRef,
    };
  }
}

function fiscalYearOf(dateISO: string): string {
  const y = Number(dateISO.slice(0, 4));
  const m = Number(dateISO.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(2)}${String(start + 1).slice(2)}`;
}
