import { and, asc, desc, eq, gt, gte, ilike, inArray, lt, ne, or, sql } from "drizzle-orm";
import { schema, type Tx } from "@ind-core/db";
import type { IntentKey } from "@ind-core/platform";

const {
  item,
  warehouse,
  stockBalance,
  stockLedger,
  salesOrder,
  salesOrderLine,
  customer,
  purchaseOrder,
  purchaseOrderLine,
  vendor,
  productionOrder,
  plannedOrder,
  mrpRun,
  maintenanceWorkOrder,
  qmsInspection,
  arOpenItem,
} = schema;

/**
 * THE COPILOT'S ENTIRE ACCESS TO THE DATABASE.
 *
 * Every function here is a hand-written SELECT. No model contributed to any of them, and
 * no model can reach past them — the copilot service can call exactly these and nothing
 * else. That is what makes the safety claims checkable rather than aspirational: the set
 * of things this feature can read is a list a person can sit down and review, and it is
 * this file.
 *
 * Three rules hold everywhere below, and each closes off a different way a read goes wrong:
 *
 *   - EVERY QUERY RUNS ON THE CALLER'S TRANSACTION, so PostgreSQL's row-level fence
 *     applies exactly as it does to a screen. No query mentions tenant_id, because it must
 *     not need to; a query that filtered by hand would still work if the fence were
 *     removed, and would tell us nothing about whether it still stood.
 *   - EVERY QUERY IS CAPPED. `limit` is not a nicety — an uncapped answer is an outage
 *     with good manners, and a copilot is exactly where somebody types "show me
 *     everything".
 *   - EVERY QUERY SELECTS NAMED COLUMNS. `select()` with no argument would leak whatever a
 *     future migration adds to the table into an answer nobody reviewed. Adding a column
 *     to an answer should be a decision.
 *
 * Row identifiers are deliberately absent from the projections. Documents are named by
 * their number, which is what a person would quote anyway.
 */

export interface QueryContext {
  tx: Tx;
  params: Record<string, string | number>;
  cap: number;
  /** Demo "today" is fixed by §7; production passes the real clock. */
  now: Date;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  /** Tables actually read — this is what the answer cites. */
  sources: readonly string[];
  truncated: boolean;
}

type QueryFn = (ctx: QueryContext) => Promise<QueryResult>;

const num = (v: unknown): number => Number(v ?? 0);
const daysParam = (ctx: QueryContext, fallback: number): number => {
  const d = ctx.params.days;
  return typeof d === "number" && d > 0 ? Math.min(365, d) : fallback;
};
const capped = (rows: Record<string, unknown>[], cap: number, sources: readonly string[]): QueryResult => ({
  rows: rows.slice(0, cap),
  sources,
  truncated: rows.length > cap,
});

/* -------------------------------------------------------------------------- */
/*  Inventory                                                                 */
/* -------------------------------------------------------------------------- */

const stockOnHand: QueryFn = async (ctx) => {
  const code = ctx.params.itemCode;
  const rows = await ctx.tx
    .select({
      item: item.itemCode,
      description: item.name,
      warehouse: warehouse.code,
      batch: stockBalance.batch,
      qty: stockBalance.qty,
      uom: item.uom,
    })
    .from(stockBalance)
    .innerJoin(item, eq(item.id, stockBalance.itemId))
    .innerJoin(warehouse, eq(warehouse.id, stockBalance.warehouseId))
    .where(
      and(
        ne(stockBalance.qty, "0"),
        typeof code === "string" ? ilike(item.itemCode, `%${code}%`) : undefined,
      ),
    )
    .orderBy(asc(item.itemCode), asc(warehouse.code))
    .limit(ctx.cap + 1);
  return capped(
    rows.map((r) => ({ ...r, qty: num(r.qty) })),
    ctx.cap,
    ["stock_balance", "item", "warehouse"],
  );
};

const stockByWarehouse: QueryFn = async (ctx) => {
  const wcode = ctx.params.warehouseCode;
  const rows = await ctx.tx
    .select({
      warehouse: warehouse.code,
      warehouseName: warehouse.name,
      item: item.itemCode,
      description: item.name,
      qty: stockBalance.qty,
      uom: item.uom,
    })
    .from(stockBalance)
    .innerJoin(item, eq(item.id, stockBalance.itemId))
    .innerJoin(warehouse, eq(warehouse.id, stockBalance.warehouseId))
    .where(
      and(
        ne(stockBalance.qty, "0"),
        typeof wcode === "string" ? ilike(warehouse.code, `%${wcode}%`) : undefined,
      ),
    )
    .orderBy(asc(warehouse.code), asc(item.itemCode))
    .limit(ctx.cap + 1);
  return capped(
    rows.map((r) => ({ ...r, qty: num(r.qty) })),
    ctx.cap,
    ["stock_balance", "item", "warehouse"],
  );
};

const stockRecentMovements: QueryFn = async (ctx) => {
  const code = ctx.params.itemCode;
  const since = new Date(ctx.now.getTime() - daysParam(ctx, 30) * 86_400_000);
  const rows = await ctx.tx
    .select({
      when: stockLedger.postedAt,
      item: item.itemCode,
      warehouse: warehouse.code,
      movement: stockLedger.entryType,
      reason: stockLedger.reasonCode,
      qty: stockLedger.qty,
    })
    .from(stockLedger)
    .innerJoin(item, eq(item.id, stockLedger.itemId))
    .innerJoin(warehouse, eq(warehouse.id, stockLedger.warehouseId))
    .where(
      and(
        gte(stockLedger.postedAt, since),
        typeof code === "string" ? ilike(item.itemCode, `%${code}%`) : undefined,
      ),
    )
    .orderBy(desc(stockLedger.postedAt))
    .limit(ctx.cap + 1);
  return capped(
    rows.map((r) => ({ ...r, qty: num(r.qty) })),
    ctx.cap,
    ["stock_ledger", "item", "warehouse"],
  );
};

/* -------------------------------------------------------------------------- */
/*  Sales                                                                     */
/* -------------------------------------------------------------------------- */

/** Open = confirmed or part-shipped. A draft is not an order anyone is waiting for. */
const OPEN_SO = ["confirmed", "partially_dispatched", "credit_hold"] as const;

const salesOpenOrders: QueryFn = async (ctx) => {
  const rows = await ctx.tx
    .select({
      order: salesOrder.soNo,
      customer: customer.name,
      theirPoNo: salesOrder.custPoNo,
      orderDate: salesOrder.orderDate,
      status: salesOrder.status,
      value: salesOrder.grandTotal,
    })
    .from(salesOrder)
    .innerJoin(customer, eq(customer.id, salesOrder.customerId))
    .where(inArray(salesOrder.status, [...OPEN_SO]))
    .orderBy(asc(salesOrder.orderDate), asc(salesOrder.soNo))
    .limit(ctx.cap + 1);
  return capped(
    rows.map((r) => ({ ...r, value: num(r.value) })),
    ctx.cap,
    ["sales_order", "customer"],
  );
};

const salesOrderStatus: QueryFn = async (ctx) => {
  const docNo = String(ctx.params.docNo ?? "");
  const rows = await ctx.tx
    .select({
      order: salesOrder.soNo,
      customer: customer.name,
      status: salesOrder.status,
      creditStatus: salesOrder.creditStatus,
      orderDate: salesOrder.orderDate,
      line: salesOrderLine.lineNo,
      item: item.itemCode,
      ordered: salesOrderLine.qty,
      delivered: salesOrderLine.deliveredQty,
      dueDate: salesOrderLine.requestedDeliveryDate,
      lineValue: salesOrderLine.lineTotal,
    })
    .from(salesOrder)
    .innerJoin(customer, eq(customer.id, salesOrder.customerId))
    .innerJoin(salesOrderLine, eq(salesOrderLine.orderId, salesOrder.id))
    .innerJoin(item, eq(item.id, salesOrderLine.itemId))
    .where(eq(salesOrder.soNo, docNo))
    .orderBy(asc(salesOrderLine.lineNo))
    .limit(ctx.cap + 1);
  return capped(
    rows.map((r) => ({
      ...r,
      ordered: num(r.ordered),
      delivered: num(r.delivered),
      lineValue: num(r.lineValue),
      outstanding: num(r.ordered) - num(r.delivered),
    })),
    ctx.cap,
    ["sales_order", "sales_order_line", "customer", "item"],
  );
};

const salesDueSoon: QueryFn = async (ctx) => {
  const days = daysParam(ctx, 14);
  const until = new Date(ctx.now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const rows = await ctx.tx
    .select({
      order: salesOrder.soNo,
      customer: customer.name,
      item: item.itemCode,
      dueDate: salesOrderLine.requestedDeliveryDate,
      ordered: salesOrderLine.qty,
      delivered: salesOrderLine.deliveredQty,
    })
    .from(salesOrderLine)
    .innerJoin(salesOrder, eq(salesOrder.id, salesOrderLine.orderId))
    .innerJoin(customer, eq(customer.id, salesOrder.customerId))
    .innerJoin(item, eq(item.id, salesOrderLine.itemId))
    .where(
      and(
        inArray(salesOrder.status, [...OPEN_SO]),
        // Only lines with something still to ship. A fully delivered line is not "due".
        gt(sql`${salesOrderLine.qty} - ${salesOrderLine.deliveredQty}`, sql`0`),
        lt(salesOrderLine.requestedDeliveryDate, until),
      ),
    )
    .orderBy(asc(salesOrderLine.requestedDeliveryDate))
    .limit(ctx.cap + 1);
  return capped(
    rows.map((r) => ({
      ...r,
      ordered: num(r.ordered),
      delivered: num(r.delivered),
      stillToShip: num(r.ordered) - num(r.delivered),
    })),
    ctx.cap,
    ["sales_order", "sales_order_line", "customer", "item"],
  );
};

/* -------------------------------------------------------------------------- */
/*  Purchase                                                                  */
/* -------------------------------------------------------------------------- */

const OPEN_PO = ["draft", "pending_approval", "approved", "partially_received"] as const;

const purchaseOpenOrders: QueryFn = async (ctx) => {
  const rows = await ctx.tx
    .select({
      order: purchaseOrder.poNo,
      vendor: vendor.name,
      status: purchaseOrder.status,
      orderDate: purchaseOrder.poDate,
      expected: purchaseOrder.expectedDate,
      value: purchaseOrder.totalAmount,
    })
    .from(purchaseOrder)
    .innerJoin(vendor, eq(vendor.id, purchaseOrder.vendorId))
    .where(inArray(purchaseOrder.status, [...OPEN_PO]))
    .orderBy(asc(purchaseOrder.expectedDate), asc(purchaseOrder.poNo))
    .limit(ctx.cap + 1);
  return capped(
    rows.map((r) => ({ ...r, value: num(r.value) })),
    ctx.cap,
    ["purchase_order", "vendor"],
  );
};

const purchaseOrderStatus: QueryFn = async (ctx) => {
  const docNo = String(ctx.params.docNo ?? "");
  const rows = await ctx.tx
    .select({
      order: purchaseOrder.poNo,
      vendor: vendor.name,
      status: purchaseOrder.status,
      expected: purchaseOrder.expectedDate,
      line: purchaseOrderLine.lineNo,
      item: item.itemCode,
      ordered: purchaseOrderLine.qty,
      received: purchaseOrderLine.receivedQty,
      rate: purchaseOrderLine.rate,
    })
    .from(purchaseOrder)
    .innerJoin(vendor, eq(vendor.id, purchaseOrder.vendorId))
    .innerJoin(purchaseOrderLine, eq(purchaseOrderLine.poId, purchaseOrder.id))
    .innerJoin(item, eq(item.id, purchaseOrderLine.itemId))
    .where(eq(purchaseOrder.poNo, docNo))
    .orderBy(asc(purchaseOrderLine.lineNo))
    .limit(ctx.cap + 1);
  return capped(
    rows.map((r) => ({
      ...r,
      ordered: num(r.ordered),
      received: num(r.received),
      rate: num(r.rate),
      stillDue: num(r.ordered) - num(r.received),
    })),
    ctx.cap,
    ["purchase_order", "purchase_order_line", "vendor", "item"],
  );
};

const purchaseAwaitingReceipt: QueryFn = async (ctx) => {
  const rows = await ctx.tx
    .select({
      order: purchaseOrder.poNo,
      vendor: vendor.name,
      item: item.itemCode,
      expected: purchaseOrder.expectedDate,
      ordered: purchaseOrderLine.qty,
      received: purchaseOrderLine.receivedQty,
    })
    .from(purchaseOrderLine)
    .innerJoin(purchaseOrder, eq(purchaseOrder.id, purchaseOrderLine.poId))
    .innerJoin(vendor, eq(vendor.id, purchaseOrder.vendorId))
    .innerJoin(item, eq(item.id, purchaseOrderLine.itemId))
    .where(
      and(
        inArray(purchaseOrder.status, ["approved", "partially_received"]),
        gt(sql`${purchaseOrderLine.qty} - ${purchaseOrderLine.receivedQty}`, sql`0`),
      ),
    )
    .orderBy(asc(purchaseOrder.expectedDate))
    .limit(ctx.cap + 1);
  return capped(
    rows.map((r) => ({
      ...r,
      ordered: num(r.ordered),
      received: num(r.received),
      stillDue: num(r.ordered) - num(r.received),
    })),
    ctx.cap,
    ["purchase_order", "purchase_order_line", "vendor", "item"],
  );
};

/* -------------------------------------------------------------------------- */
/*  Production                                                                */
/* -------------------------------------------------------------------------- */

const productionOpenOrders: QueryFn = async (ctx) => {
  const rows = await ctx.tx
    .select({
      order: productionOrder.orderNo,
      item: item.itemCode,
      description: item.name,
      status: productionOrder.status,
      toProduce: productionOrder.qtyToProduce,
      produced: productionOrder.producedQty,
    })
    .from(productionOrder)
    .innerJoin(item, eq(item.id, productionOrder.itemId))
    .where(inArray(productionOrder.status, ["planned", "in_progress", "issued"]))
    .orderBy(asc(productionOrder.orderNo))
    .limit(ctx.cap + 1);
  return capped(
    rows.map((r) => ({
      ...r,
      toProduce: num(r.toProduce),
      produced: num(r.produced),
      remaining: num(r.toProduce) - num(r.produced),
    })),
    ctx.cap,
    ["production_order", "item"],
  );
};

const productionOrderStatus: QueryFn = async (ctx) => {
  const docNo = String(ctx.params.docNo ?? "");
  const rows = await ctx.tx
    .select({
      order: productionOrder.orderNo,
      item: item.itemCode,
      description: item.name,
      status: productionOrder.status,
      toProduce: productionOrder.qtyToProduce,
      produced: productionOrder.producedQty,
    })
    .from(productionOrder)
    .innerJoin(item, eq(item.id, productionOrder.itemId))
    .where(eq(productionOrder.orderNo, docNo))
    .limit(ctx.cap + 1);
  return capped(
    rows.map((r) => ({
      ...r,
      toProduce: num(r.toProduce),
      produced: num(r.produced),
      remaining: num(r.toProduce) - num(r.produced),
    })),
    ctx.cap,
    ["production_order", "item"],
  );
};

/* -------------------------------------------------------------------------- */
/*  Planning                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Planned orders are only meaningful from the LATEST completed run. An older run's
 * suggestions are a photograph of a plant that has since bought, made and shipped things —
 * showing them mixed together would answer "what should I buy" with last week's answer as
 * well as this week's, and nothing in the output would say which was which.
 */
async function latestRunId(tx: Tx): Promise<string | null> {
  const [run] = await tx
    .select({ id: mrpRun.id })
    .from(mrpRun)
    .where(eq(mrpRun.status, "completed"))
    .orderBy(desc(mrpRun.planningDate), desc(mrpRun.runNo))
    .limit(1);
  return run?.id ?? null;
}

function plannedOrdersBySource(source: "buy" | "make"): QueryFn {
  return async (ctx) => {
    const runId = await latestRunId(ctx.tx);
    if (!runId) return { rows: [], sources: ["mrp_run", "planned_order"], truncated: false };
    const rows = await ctx.tx
      .select({
        item: plannedOrder.itemCode,
        qty: plannedOrder.qty,
        needBy: plannedOrder.needDate,
        releaseOn: plannedOrder.releaseDate,
        lotRule: plannedOrder.lotRule,
        status: plannedOrder.status,
        pastDue: plannedOrder.pastDue,
      })
      .from(plannedOrder)
      .where(and(eq(plannedOrder.runId, runId), eq(plannedOrder.sourceType, source)))
      .orderBy(asc(plannedOrder.releaseDate), asc(plannedOrder.itemCode))
      .limit(ctx.cap + 1);
    return capped(
      rows.map((r) => ({ ...r, qty: num(r.qty) })),
      ctx.cap,
      ["planned_order", "mrp_run"],
    );
  };
}

const planningPastDue: QueryFn = async (ctx) => {
  const runId = await latestRunId(ctx.tx);
  if (!runId) return { rows: [], sources: ["mrp_run", "planned_order"], truncated: false };
  const rows = await ctx.tx
    .select({
      item: plannedOrder.itemCode,
      buyOrMake: plannedOrder.sourceType,
      qty: plannedOrder.qty,
      neededBy: plannedOrder.needDate,
      shouldHaveStarted: plannedOrder.computedReleaseDate,
      daysLate: plannedOrder.daysLate,
    })
    .from(plannedOrder)
    .where(and(eq(plannedOrder.runId, runId), eq(plannedOrder.pastDue, true)))
    .orderBy(desc(plannedOrder.daysLate), asc(plannedOrder.itemCode))
    .limit(ctx.cap + 1);
  return capped(
    rows.map((r) => ({ ...r, qty: num(r.qty), daysLate: num(r.daysLate) })),
    ctx.cap,
    ["planned_order", "mrp_run"],
  );
};

/**
 * "What are we short of" is answered from the PLAN, not from a stock query. A bare
 * comparison of stock against safety stock would call an item short while a purchase order
 * for it lands tomorrow — technically true and operationally useless. A planned order that
 * must be released today or earlier is the honest reading of "short".
 */
const planningShortages: QueryFn = async (ctx) => {
  const runId = await latestRunId(ctx.tx);
  if (!runId) return { rows: [], sources: ["mrp_run", "planned_order"], truncated: false };
  const today = ctx.now.toISOString().slice(0, 10);
  const rows = await ctx.tx
    .select({
      item: plannedOrder.itemCode,
      buyOrMake: plannedOrder.sourceType,
      qtyNeeded: plannedOrder.qty,
      neededBy: plannedOrder.needDate,
      actByToBeOnTime: plannedOrder.computedReleaseDate,
      alreadyLate: plannedOrder.pastDue,
    })
    .from(plannedOrder)
    .where(
      and(
        eq(plannedOrder.runId, runId),
        eq(plannedOrder.status, "planned"),
        or(eq(plannedOrder.pastDue, true), lt(plannedOrder.computedReleaseDate, today)),
      ),
    )
    .orderBy(asc(plannedOrder.computedReleaseDate), asc(plannedOrder.itemCode))
    .limit(ctx.cap + 1);
  return capped(
    rows.map((r) => ({ ...r, qtyNeeded: num(r.qtyNeeded) })),
    ctx.cap,
    ["planned_order", "mrp_run"],
  );
};

/* -------------------------------------------------------------------------- */
/*  Maintenance, quality, accounts, masters                                   */
/* -------------------------------------------------------------------------- */

const maintenanceOpenWorkOrders: QueryFn = async (ctx) => {
  const rows = await ctx.tx
    .select({
      workOrder: maintenanceWorkOrder.mwoNo,
      title: maintenanceWorkOrder.title,
      type: maintenanceWorkOrder.mwoType,
      priority: maintenanceWorkOrder.priority,
      status: maintenanceWorkOrder.status,
      reportedAt: maintenanceWorkOrder.reportedAt,
      restoreBy: maintenanceWorkOrder.slaRestoreBy,
      slaBreached: maintenanceWorkOrder.slaBreached,
    })
    .from(maintenanceWorkOrder)
    .where(ne(maintenanceWorkOrder.status, "closed"))
    .orderBy(asc(maintenanceWorkOrder.slaRestoreBy), asc(maintenanceWorkOrder.mwoNo))
    .limit(ctx.cap + 1);
  return capped(rows as Record<string, unknown>[], ctx.cap, ["maintenance_work_order"]);
};

const qualityPendingInspections: QueryFn = async (ctx) => {
  const rows = await ctx.tx
    .select({
      inspection: qmsInspection.inspectionNo,
      type: qmsInspection.inspectionType,
      status: qmsInspection.status,
      result: qmsInspection.result,
      lotQty: qmsInspection.lotQty,
      sampleSize: qmsInspection.sampleSize,
      accepted: qmsInspection.qtyAccepted,
      rejected: qmsInspection.qtyRejected,
    })
    .from(qmsInspection)
    .where(ne(qmsInspection.status, "closed"))
    .orderBy(asc(qmsInspection.inspectionNo))
    .limit(ctx.cap + 1);
  return capped(
    rows.map((r) => ({
      ...r,
      lotQty: num(r.lotQty),
      accepted: num(r.accepted),
      rejected: num(r.rejected),
    })),
    ctx.cap,
    ["qms_inspection"],
  );
};

const accountsOutstanding: QueryFn = async (ctx) => {
  const rows = await ctx.tx
    .select({
      invoice: arOpenItem.invoiceNo,
      customer: arOpenItem.customerNameCache,
      invoiceDate: arOpenItem.invoiceDate,
      dueDate: arOpenItem.dueDate,
      gross: arOpenItem.grossReceivable,
      received: arOpenItem.receivedAmount,
      outstanding: arOpenItem.outstanding,
      status: arOpenItem.status,
    })
    .from(arOpenItem)
    .where(gt(arOpenItem.outstanding, "0"))
    .orderBy(asc(arOpenItem.dueDate))
    .limit(ctx.cap + 1);
  return capped(
    rows.map((r) => ({
      ...r,
      gross: num(r.gross),
      received: num(r.received),
      outstanding: num(r.outstanding),
    })),
    ctx.cap,
    ["ar_open_item"],
  );
};

const masterFindItem: QueryFn = async (ctx) => {
  const term = String(ctx.params.itemCode ?? "");
  const rows = await ctx.tx
    .select({
      item: item.itemCode,
      description: item.name,
      type: item.itemType,
      uom: item.uom,
      hsn: item.hsnCode,
      standardCost: item.standardCost,
    })
    .from(item)
    .where(term ? or(ilike(item.itemCode, `%${term}%`), ilike(item.name, `%${term}%`)) : undefined)
    .orderBy(asc(item.itemCode))
    .limit(ctx.cap + 1);
  return capped(
    rows.map((r) => ({ ...r, standardCost: num(r.standardCost) })),
    ctx.cap,
    ["item"],
  );
};

const masterFindVendor: QueryFn = async (ctx) => {
  const term = String(ctx.params.partyName ?? "");
  const rows = await ctx.tx
    .select({
      code: vendor.code,
      vendor: vendor.name,
      gstin: vendor.gstin,
      paymentTerms: vendor.paymentTerms,
    })
    .from(vendor)
    .where(term ? or(ilike(vendor.name, `%${term}%`), ilike(vendor.code, `%${term}%`)) : undefined)
    .orderBy(asc(vendor.name))
    .limit(ctx.cap + 1);
  return capped(rows as Record<string, unknown>[], ctx.cap, ["vendor"]);
};

const masterFindCustomer: QueryFn = async (ctx) => {
  const term = String(ctx.params.partyName ?? "");
  const rows = await ctx.tx
    .select({
      code: customer.code,
      customer: customer.name,
      gstin: customer.gstin,
      state: customer.stateCode,
      creditLimit: customer.creditLimit,
      creditDays: customer.creditDays,
    })
    .from(customer)
    .where(term ? or(ilike(customer.name, `%${term}%`), ilike(customer.code, `%${term}%`)) : undefined)
    .orderBy(asc(customer.name))
    .limit(ctx.cap + 1);
  return capped(
    rows.map((r) => ({ ...r, creditLimit: num(r.creditLimit) })),
    ctx.cap,
    ["customer"],
  );
};

/* -------------------------------------------------------------------------- */
/*  The map — the complete set of reads the copilot can perform               */
/* -------------------------------------------------------------------------- */

export const COPILOT_QUERIES: Readonly<Record<IntentKey, QueryFn>> = {
  "stock.on_hand": stockOnHand,
  "stock.by_warehouse": stockByWarehouse,
  "stock.recent_movements": stockRecentMovements,
  "sales.open_orders": salesOpenOrders,
  "sales.order_status": salesOrderStatus,
  "sales.due_soon": salesDueSoon,
  "purchase.open_orders": purchaseOpenOrders,
  "purchase.order_status": purchaseOrderStatus,
  "purchase.awaiting_receipt": purchaseAwaitingReceipt,
  "production.open_orders": productionOpenOrders,
  "production.order_status": productionOrderStatus,
  "planning.what_to_buy": plannedOrdersBySource("buy"),
  "planning.what_to_make": plannedOrdersBySource("make"),
  "planning.past_due": planningPastDue,
  "planning.shortages": planningShortages,
  "maintenance.open_work_orders": maintenanceOpenWorkOrders,
  "quality.pending_inspections": qualityPendingInspections,
  "accounts.outstanding": accountsOutstanding,
  "master.find_item": masterFindItem,
  "master.find_vendor": masterFindVendor,
  "master.find_customer": masterFindCustomer,
};
