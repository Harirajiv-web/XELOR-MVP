import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, or } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  newId,
  currentTenant,
  eventName,
  encodeCursor,
  decodeCursor,
  AppError,
  Errors,
  type CursorPage,
} from "@ind-core/platform";
import { runIdempotent, fingerprint } from "../../common/idempotency.js";
import { AuditLogService } from "../../common/audit-log.service.js";
import { BOM_PROVIDER, type BomProvider } from "../../ports/bom.port.js";
import { STOCK_POSTER, type StockPoster, type StockMovement } from "../../ports/stock.port.js";

const { productionOrder, productionOrderComponent, outboxEvent } = schema;

export interface CreateProductionOrderInput {
  itemId: string;
  qtyToProduce: number;
  bomId?: string;
  sourceWarehouseId: string;
  fgWarehouseId: string;
}
export interface ProdComponentView {
  lineNo: number;
  componentItemId: string;
  requiredQty: string;
  issuedQty: string;
}
export interface ProductionOrderView {
  id: string;
  orderNo: string;
  itemId: string;
  bomId: string;
  qtyToProduce: string;
  producedQty: string;
  sourceWarehouseId: string;
  fgWarehouseId: string;
  status: string;
  components: ProdComponentView[];
}
export interface ProductionActionResult {
  order: ProductionOrderView;
  stockMovements: Array<{ itemId: string; warehouseId: string; delta: number; balanceAfter: number }>;
}

const q3 = (n: number): string => n.toFixed(3);

/**
 * PRODUCTION — the make cycle. Explodes a BOM into component requirements, then
 * CONSUMES components and PRODUCES finished goods through Inventory's stock write path
 * (STOCK_POSTER port) — never touching stock tables directly (§5.6). Component issue and
 * FG receipt each run as one atomic transaction (§5.5); an issue that can't be covered
 * by stock is refused whole (INSUFFICIENT_STOCK).
 */
@Injectable()
export class ProductionService {
  constructor(
    private readonly audit: AuditLogService,
    @Inject(BOM_PROVIDER) private readonly bom: BomProvider,
    @Inject(STOCK_POSTER) private readonly stock: StockPoster,
  ) {}

  async createOrder(input: CreateProductionOrderInput, idempotencyKey: string): Promise<ProductionOrderView> {
    if (input.qtyToProduce <= 0) {
      throw Errors.validation([{ field: "qtyToProduce", message: "must be > 0" }]);
    }
    const bom = input.bomId
      ? await this.bom.getBomById(input.bomId)
      : await this.bom.getActiveBomForItem(input.itemId);
    if (!bom) {
      throw new AppError("PRODUCTION_NO_BOM", 422, `No BOM found for item '${input.itemId}'.`);
    }
    if (bom.itemId !== input.itemId) {
      throw new AppError("PRODUCTION_BOM_MISMATCH", 422, "The BOM does not produce this item.");
    }
    const result = await runIdempotent(idempotencyKey, fingerprint(input), async () => ({
      status: 201,
      body: await this.doCreate(input, bom),
    }));
    return result.body;
  }

  private async doCreate(
    input: CreateProductionOrderInput,
    bom: NonNullable<Awaited<ReturnType<BomProvider["getBomById"]>>>,
  ): Promise<ProductionOrderView> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date();
    // Explode: required = (componentQty / bomOutput) * qtyToProduce * (1 + scrap%).
    const factor = input.qtyToProduce / (bom.outputQty || 1);
    const components = bom.components.map((c, i) => ({
      id: newId(),
      tenantId,
      createdBy: actorId,
      updatedBy: actorId,
      orderId: "", // set below
      lineNo: i + 1,
      componentItemId: c.componentItemId,
      requiredQty: q3(c.qty * factor * (1 + c.scrapPct / 100)),
    }));

    return withTenant(async (tx) => {
      const id = newId();
      const orderNo = `MO-${(id.split("-").pop() ?? id).toUpperCase()}`;
      await tx.insert(productionOrder).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        orderNo,
        itemId: input.itemId,
        bomId: bom.bomId,
        qtyToProduce: q3(input.qtyToProduce),
        sourceWarehouseId: input.sourceWarehouseId,
        fgWarehouseId: input.fgWarehouseId,
        status: "planned",
      });
      await tx.insert(productionOrderComponent).values(components.map((c) => ({ ...c, orderId: id })));
      await this.audit.appendInTx(tx, {
        action: "production.order.created",
        entityType: "production_order",
        entityId: id,
        data: { orderNo, itemId: input.itemId, bomId: bom.bomId, qty: q3(input.qtyToProduce) },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("production", "order", "created"),
        payload: { id, orderNo, itemId: input.itemId },
        createdAt: now,
      });
      return this.viewInTx(tx, id);
    });
  }

  /** Issue (consume) all outstanding components from the source warehouse — atomically. */
  async issueComponents(orderId: string, idempotencyKey: string): Promise<ProductionActionResult> {
    const result = await runIdempotent(idempotencyKey, fingerprint({ orderId, op: "issue" }), async () => ({
      status: 201,
      body: await this.doIssue(orderId),
    }));
    return result.body;
  }

  private async doIssue(orderId: string): Promise<ProductionActionResult> {
    const { actorId } = currentTenant();
    const now = new Date();
    return withTenant(async (tx) => {
      const order = await this.loadOrder(tx, orderId);
      if (order.status !== "planned") {
        throw new AppError("PRODUCTION_NOT_PLANNED", 409, `Order is ${order.status}; components already issued.`);
      }
      const comps = await tx
        .select({
          id: productionOrderComponent.id,
          componentItemId: productionOrderComponent.componentItemId,
          requiredQty: productionOrderComponent.requiredQty,
          issuedQty: productionOrderComponent.issuedQty,
        })
        .from(productionOrderComponent)
        .where(eq(productionOrderComponent.orderId, orderId));

      const lines = comps
        .map((c) => ({ c, outstanding: Number(c.requiredQty) - Number(c.issuedQty) }))
        .filter((x) => x.outstanding > 1e-9)
        .map((x) => ({
          itemId: x.c.componentItemId,
          fromWarehouseId: order.sourceWarehouseId,
          qty: x.outstanding,
        }));

      // ONE atomic issue — if any component is short, the whole issue is refused.
      const post = await this.stock.postInTx(tx, {
        entryType: "issue",
        remarks: `production issue ${order.orderNo}`,
        lines,
      });

      for (const c of comps) {
        await tx
          .update(productionOrderComponent)
          .set({ issuedQty: c.requiredQty, updatedBy: actorId, updatedAt: now })
          .where(eq(productionOrderComponent.id, c.id));
      }
      await tx
        .update(productionOrder)
        .set({ status: "in_progress", updatedBy: actorId, updatedAt: now })
        .where(eq(productionOrder.id, orderId));
      await this.audit.appendInTx(tx, {
        action: "production.order.issued",
        entityType: "production_order",
        entityId: orderId,
        data: { orderNo: order.orderNo, components: lines.length },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId: order.tenantId,
        name: eventName("production", "order", "issued"),
        payload: { id: orderId, orderNo: order.orderNo },
        createdAt: now,
      });
      return { order: await this.viewInTx(tx, orderId), stockMovements: movements(post.movements) };
    });
  }

  /** Produce finished goods into the FG warehouse — atomically. */
  async complete(orderId: string, producedQty: number, idempotencyKey: string): Promise<ProductionActionResult> {
    if (producedQty <= 0) throw Errors.validation([{ field: "producedQty", message: "must be > 0" }]);
    const result = await runIdempotent(idempotencyKey, fingerprint({ orderId, producedQty, op: "complete" }), async () => ({
      status: 201,
      body: await this.doComplete(orderId, producedQty),
    }));
    return result.body;
  }

  private async doComplete(orderId: string, producedQty: number): Promise<ProductionActionResult> {
    const { actorId } = currentTenant();
    const now = new Date();
    return withTenant(async (tx) => {
      const order = await this.loadOrder(tx, orderId);
      if (order.status !== "in_progress") {
        throw new AppError("PRODUCTION_NOT_IN_PROGRESS", 409, `Order is ${order.status}; issue components first.`);
      }
      const post = await this.stock.postInTx(tx, {
        entryType: "receipt",
        remarks: `production output ${order.orderNo}`,
        lines: [{ itemId: order.itemId, toWarehouseId: order.fgWarehouseId, qty: producedQty }],
      });
      const newProduced = Number(order.producedQty) + producedQty;
      const status = newProduced + 1e-9 >= Number(order.qtyToProduce) ? "completed" : "in_progress";
      await tx
        .update(productionOrder)
        .set({ producedQty: q3(newProduced), status, updatedBy: actorId, updatedAt: now })
        .where(eq(productionOrder.id, orderId));
      await this.audit.appendInTx(tx, {
        action: "production.order.completed",
        entityType: "production_order",
        entityId: orderId,
        data: { orderNo: order.orderNo, producedQty: q3(producedQty), status },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId: order.tenantId,
        name: eventName("production", "order", "completed"),
        payload: { id: orderId, orderNo: order.orderNo, producedQty: q3(producedQty) },
        createdAt: now,
      });
      return { order: await this.viewInTx(tx, orderId), stockMovements: movements(post.movements) };
    });
  }

  async getOrder(orderId: string): Promise<ProductionOrderView> {
    return withTenant((tx) => this.viewInTx(tx, orderId));
  }

  async listOrders(limit: number, cursor?: string): Promise<CursorPage<Omit<ProductionOrderView, "components">>> {
    return withTenant(async (tx) => {
      const keyset = cursor ? decodeCursor(cursor) : null;
      const rows = await tx
        .select({
          id: productionOrder.id,
          orderNo: productionOrder.orderNo,
          itemId: productionOrder.itemId,
          bomId: productionOrder.bomId,
          qtyToProduce: productionOrder.qtyToProduce,
          producedQty: productionOrder.producedQty,
          sourceWarehouseId: productionOrder.sourceWarehouseId,
          fgWarehouseId: productionOrder.fgWarehouseId,
          status: productionOrder.status,
          createdAt: productionOrder.createdAt,
        })
        .from(productionOrder)
        .where(
          keyset
            ? and(
                eq(productionOrder.isActive, true),
                or(
                  gt(productionOrder.createdAt, new Date(keyset.createdAt)),
                  and(eq(productionOrder.createdAt, new Date(keyset.createdAt)), gt(productionOrder.id, keyset.id)),
                ),
              )
            : eq(productionOrder.isActive, true),
        )
        .orderBy(asc(productionOrder.createdAt), asc(productionOrder.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const nextCursor =
        rows.length > limit && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null;
      return {
        items: page.map(({ createdAt, ...r }) => r),
        nextCursor,
      };
    });
  }

  private async loadOrder(
    tx: Tx,
    orderId: string,
  ): Promise<{
    id: string;
    tenantId: string;
    orderNo: string;
    itemId: string;
    status: string;
    qtyToProduce: string;
    producedQty: string;
    sourceWarehouseId: string;
    fgWarehouseId: string;
  }> {
    const [o] = await tx
      .select({
        id: productionOrder.id,
        tenantId: productionOrder.tenantId,
        orderNo: productionOrder.orderNo,
        itemId: productionOrder.itemId,
        status: productionOrder.status,
        qtyToProduce: productionOrder.qtyToProduce,
        producedQty: productionOrder.producedQty,
        sourceWarehouseId: productionOrder.sourceWarehouseId,
        fgWarehouseId: productionOrder.fgWarehouseId,
      })
      .from(productionOrder)
      .where(eq(productionOrder.id, orderId))
      .limit(1);
    if (!o) throw Errors.notFound("production order");
    return o;
  }

  private async viewInTx(tx: Tx, orderId: string): Promise<ProductionOrderView> {
    const [o] = await tx
      .select({
        id: productionOrder.id,
        orderNo: productionOrder.orderNo,
        itemId: productionOrder.itemId,
        bomId: productionOrder.bomId,
        qtyToProduce: productionOrder.qtyToProduce,
        producedQty: productionOrder.producedQty,
        sourceWarehouseId: productionOrder.sourceWarehouseId,
        fgWarehouseId: productionOrder.fgWarehouseId,
        status: productionOrder.status,
      })
      .from(productionOrder)
      .where(eq(productionOrder.id, orderId))
      .limit(1);
    if (!o) throw Errors.notFound("production order");
    const components = await tx
      .select({
        lineNo: productionOrderComponent.lineNo,
        componentItemId: productionOrderComponent.componentItemId,
        requiredQty: productionOrderComponent.requiredQty,
        issuedQty: productionOrderComponent.issuedQty,
      })
      .from(productionOrderComponent)
      .where(eq(productionOrderComponent.orderId, orderId))
      .orderBy(asc(productionOrderComponent.lineNo));
    return { ...o, components };
  }
}

function movements(ms: StockMovement[]): ProductionActionResult["stockMovements"] {
  return ms.map((m) => ({ itemId: m.itemId, warehouseId: m.warehouseId, delta: m.delta, balanceAfter: m.balanceAfter }));
}
