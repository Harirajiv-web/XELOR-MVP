import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, inArray, or, sql } from "drizzle-orm";
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
import { NumberingService, fyCode } from "../../common/numbering.service.js";
import {
  STOCK_READER,
  type StockReader,
  type SupplySource,
  type OpenSupplyLine,
  type ProductionOrderCreator,
  type CreateFromPlanInput,
  type CreatedDocument,
} from "../../ports/planning-inputs.port.js";
import { BOM_PROVIDER, type BomProvider } from "../../ports/bom.port.js";
import { STOCK_POSTER, type StockPoster, type StockMovement } from "../../ports/stock.port.js";
import { INSPECTION_GATE, type InspectionGate } from "../../ports/inspection.port.js";
import { ITEM_PROVIDER, type ItemProvider, type ItemSpec } from "../../ports/item.port.js";

const { productionOrder, productionOrderComponent, outboxEvent } = schema;

export interface CreateProductionOrderInput {
  itemId: string;
  qtyToProduce: number;
  bomId?: string;
  sourceWarehouseId: string;
  fgWarehouseId: string;
}
/**
 * The item master fields every read path carries.
 *
 * A shop-floor screen that shows a UUID where a part number belongs is not a usable screen —
 * a supervisor who cannot match a line on the display to the drawing in their hand goes back
 * to paper, and they are right to. `null` only when the id resolves to no item at all, which
 * is a data fault worth seeing rather than hiding behind a blank.
 */
export interface ItemNaming {
  itemCode: string | null;
  itemName: string | null;
  uom: string | null;
}

export interface ProdComponentCore {
  lineNo: number;
  componentItemId: string;
  requiredQty: string;
  issuedQty: string;
}
export interface ProdComponentView extends ProdComponentCore, ItemNaming {}

/**
 * The order as this module's own tables hold it — no cross-module lookup involved.
 *
 * Write paths return THIS. Naming an item means calling ENGINEERING through the item port,
 * and that port opens its own connection: doing it inside `withTenant` would hold two pool
 * slots at once, and `DB_POOL_MAX` is 10. Five concurrent issues would deadlock the pool on
 * the ledger-critical path. The read paths enrich after the transaction has closed instead.
 */
export interface ProductionOrderCore {
  id: string;
  orderNo: string;
  itemId: string;
  bomId: string;
  qtyToProduce: string;
  producedQty: string;
  sourceWarehouseId: string;
  fgWarehouseId: string;
  status: string;
  /** When the order was raised. The MVP schema carries no promised or due date — see
   *  `openSupply()`, which reports the same absence to Planning rather than inventing one. */
  createdAt: string;
  updatedAt: string;
  components: ProdComponentCore[];
}

/** What a GET answers: the order, with every item named. */
export interface ProductionOrderView extends ItemNaming {
  id: string;
  orderNo: string;
  itemId: string;
  bomId: string;
  qtyToProduce: string;
  producedQty: string;
  sourceWarehouseId: string;
  fgWarehouseId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  components: ProdComponentView[];
}

export interface ProductionActionResult {
  order: ProductionOrderCore;
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
export class ProductionService implements SupplySource, ProductionOrderCreator {
  constructor(
    private readonly audit: AuditLogService,
    private readonly numbering: NumberingService,
    @Inject(BOM_PROVIDER) private readonly bom: BomProvider,
    @Inject(STOCK_POSTER) private readonly stock: StockPoster,
    @Inject(INSPECTION_GATE) private readonly inspection: InspectionGate,
    @Inject(STOCK_READER) private readonly warehouses: StockReader,
    // ENGINEERING owns the item master; this module only ever READS a code and a unit from
    // it, through the shared port — never a module→module import, never a raw SELECT (§1.1).
    @Inject(ITEM_PROVIDER) private readonly items: ItemProvider,
  ) {}

  async createOrder(input: CreateProductionOrderInput, idempotencyKey: string): Promise<ProductionOrderCore> {
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
  ): Promise<ProductionOrderCore> {
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
      const orderNo = await this.numbering.next(tx, "production_order", fyCode(new Date().toISOString()));
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

    // THE QUALITY GATE (INSPECTION §1.2). The gate belongs to Production because Production
    // owns the transaction — but the inspection record belongs to Quality, so we ASK through
    // the port rather than reading its tables. `state: 'none'` means nobody requested an
    // inspection for this order, and the order completes exactly as it always did: wiring
    // the gate in never retroactively blocks work that was never meant to be inspected.
    const gate = await this.inspection.gateStatus("manufacture", orderId);
    if (gate.state === "pending" || gate.state === "in_progress") {
      throw new AppError(
        "INSPECTION_PENDING",
        409,
        `Inspection ${gate.inspectionNo} for this order is ${gate.state}; finished goods are held until it is completed.`,
      );
    }
    if (gate.state === "completed" && gate.result === "rejected") {
      throw new AppError(
        "INSPECTION_REJECTED",
        409,
        `Inspection ${gate.inspectionNo} rejected this lot; it cannot be received into finished goods. Disposition it in Quality.`,
      );
    }

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

  // ---- SupplySource port (read by PLANNING) ----

  /**
   * Work orders that are open on the floor — supply already in motion.
   *
   * A production order carries no promised date in the MVP schema, so `dueDate` is null and
   * Planning treats it as supply available in the current bucket. That is optimistic, and
   * it is reported rather than hidden: the alternative — inventing a date from the order's
   * creation timestamp — would produce a confident number with nothing behind it.
   */
  async openSupply(): Promise<OpenSupplyLine[]> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select({
          itemId: productionOrder.itemId,
          qtyToProduce: productionOrder.qtyToProduce,
          producedQty: productionOrder.producedQty,
          orderNo: productionOrder.orderNo,
        })
        .from(productionOrder)
        .where(
          and(
            inArray(productionOrder.status, ["planned", "in_progress"]),
            eq(productionOrder.isActive, true),
            sql`${productionOrder.qtyToProduce} > ${productionOrder.producedQty}`,
          ),
        )
        .orderBy(asc(productionOrder.orderNo));

      return rows.map((r) => ({
        itemId: r.itemId,
        qty: Number(r.qtyToProduce) - Number(r.producedQty),
        dueDate: null,
        ref: r.orderNo,
        kind: "production_order" as const,
      }));
    });
  }

  // ---- ProductionOrderCreator port (called by PLANNING) ----

  /**
   * Turn a planned make-order into a real work order.
   *
   * Planning supplies the what, the how many and the by-when — all a plan ever knew. Every
   * decision that makes this a manufacturing document rather than a row stays here: which
   * BOM version to pin, how to snapshot the components, which warehouses to issue from and
   * receive into. Letting Planning write a `production_order` directly would make this
   * module a table, and quietly bypass every rule it enforces.
   */
  async createFromPlan(input: CreateFromPlanInput, idempotencyKey: string): Promise<CreatedDocument> {
    const warehouses = await this.defaultWarehouses();
    const view = await this.createOrder(
      {
        itemId: input.itemId,
        qtyToProduce: input.qty,
        sourceWarehouseId: warehouses.source,
        fgWarehouseId: warehouses.fg,
      },
      idempotencyKey,
    );
    return { id: view.id, ref: view.orderNo };
  }

  /**
   * The warehouses a planned order is executed against when the plan did not name any.
   *
   * The plan legitimately does not know: single-plant MRP nets against total on-hand and
   * has no view of which shelf it sits on. Picking the first accepted and finished-goods
   * warehouses is a defensible default and a documented limitation — multi-warehouse
   * planning is where this becomes a real routing decision.
   */
  private async defaultWarehouses(): Promise<{ source: string; fg: string }> {
    const list = await this.warehouses.listWarehouseRefs();
    const source = list.find((w) => w.warehouseType === "accepted");
    const fg = list.find((w) => w.warehouseType === "finished");
    if (!source || !fg) {
      throw new AppError(
        "PROD_NO_DEFAULT_WAREHOUSE",
        422,
        "Converting a planned order needs an 'accepted' and a 'finished' warehouse; the plant has not defined both.",
      );
    }
    return { source: source.id, fg: fg.id };
  }

  async getOrder(orderId: string): Promise<ProductionOrderView> {
    // Read, THEN name — the item lookup crosses a module boundary onto its own connection,
    // so it happens after this transaction has released its pool slot.
    const core = await withTenant((tx) => this.viewInTx(tx, orderId));
    return this.nameItems(core);
  }

  async listOrders(limit: number, cursor?: string): Promise<CursorPage<Omit<ProductionOrderView, "components">>> {
    const page = await withTenant(async (tx) => {
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
          updatedAt: productionOrder.updatedAt,
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
      const rowsOnPage = rows.slice(0, limit);
      const last = rowsOnPage.at(-1);
      const nextCursor =
        rows.length > limit && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null;

      // `created_at` used to be stripped here, on the reasoning that it was only the cursor
      // key. It left a work-order list with no time in it at all — a supervisor could not
      // tell this morning's order from last month's. It is the raised date and it belongs
      // in the answer.
      return {
        items: rowsOnPage.map(({ createdAt, updatedAt, ...r }) => ({
          ...r,
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        })),
        nextCursor,
      };
    });

    // ONE batched item lookup for the whole page, outside the transaction — not one per row,
    // and not while holding a connection.
    const specs = await this.itemSpecs(page.items.map((r) => r.itemId));
    return {
      items: page.items.map((r) => ({ ...r, ...naming(specs.get(r.itemId)) })),
      nextCursor: page.nextCursor,
    };
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

  private async viewInTx(tx: Tx, orderId: string): Promise<ProductionOrderCore> {
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
        createdAt: productionOrder.createdAt,
        updatedAt: productionOrder.updatedAt,
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

    const { createdAt, updatedAt, ...rest } = o;
    return {
      ...rest,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      components,
    };
  }

  /**
   * Put item codes, names and units onto an order. Called AFTER the transaction has closed,
   * never inside one — see `ProductionOrderCore`.
   *
   * ONE lookup for the finished good and every component together: a per-line call would be
   * a query per component on a screen a supervisor keeps open all day.
   */
  private async nameItems(core: ProductionOrderCore): Promise<ProductionOrderView> {
    const specs = await this.itemSpecs([
      core.itemId,
      ...core.components.map((c) => c.componentItemId),
    ]);
    return {
      ...core,
      ...naming(specs.get(core.itemId)),
      components: core.components.map((c) => ({ ...c, ...naming(specs.get(c.componentItemId)) })),
    };
  }

  /** Item codes, names and units by id. De-duplicated, and a no-op on an empty list. */
  private async itemSpecs(itemIds: readonly string[]): Promise<Map<string, ItemSpec>> {
    const unique = [...new Set(itemIds)];
    if (unique.length === 0) return new Map();
    const specs = await this.items.getItems(unique);
    return new Map(specs.map((s) => [s.id, s]));
  }
}

/** An item id that resolves to nothing yields nulls, never a thrown read. */
function naming(spec: ItemSpec | undefined): ItemNaming {
  return {
    itemCode: spec?.itemCode ?? null,
    itemName: spec?.name ?? null,
    uom: spec?.uom ?? null,
  };
}

function movements(ms: StockMovement[]): ProductionActionResult["stockMovements"] {
  return ms.map((m) => ({ itemId: m.itemId, warehouseId: m.warehouseId, delta: m.delta, balanceAfter: m.balanceAfter }));
}
