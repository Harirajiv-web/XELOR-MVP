/**
 * THE PLANNING INPUT PORTS.
 *
 * PLANNING owns no masters. It reads demand from SMBD, stock from INVENTORY, the product
 * structure from ENGINEERING, and open supply from PURCHASE and PRODUCTION — and it writes
 * exactly one thing of its own, a plan. That makes it the module with the widest read
 * surface in the system, and therefore the one where a boundary is most likely to dissolve
 * "just this once" into a raw SELECT against somebody else's table.
 *
 * These ports exist so that never happens. Every one of them is READ-ONLY except the two
 * at the bottom, and those two are the whole point of a planned order: turning it into a
 * real document is the moment a plan stops being advice. They are named for the act rather
 * than the module, so that "PLANNING creates work orders" stays a false statement — it
 * asks PRODUCTION to, and PRODUCTION decides how.
 *
 * The alternative — Planning writing a production_order row itself — would make Production
 * a table rather than a module, and every rule Production enforces about component
 * snapshotting and the stock write path would be bypassed by the module with the least
 * business being near it.
 */

// ---------------------------------------------------------------------------
// Demand — SMBD
// ---------------------------------------------------------------------------

export const DEMAND_SOURCE = Symbol("DemandSource");

export interface OpenDemandLine {
  itemId: string;
  /** What is still owed to the customer: ordered minus delivered. */
  qty: number;
  /**
   * When the customer wants it. NULL when the order was taken without a promised date —
   * Planning places that demand in the current bucket and raises a data warning rather
   * than inventing a date the customer never agreed to.
   */
  requestedDeliveryDate: string | null;
  /** The document, for the top of the pegging chain. */
  ref: string;
  customerName: string;
  orderStatus: string;
}

export interface DemandSource {
  /** Confirmed, undelivered sales-order demand. Cancelled and draft orders are not demand. */
  openSalesDemand(): Promise<OpenDemandLine[]>;
}

// ---------------------------------------------------------------------------
// Stock — INVENTORY
// ---------------------------------------------------------------------------

export const STOCK_READER = Symbol("StockReader");

export interface OnHandByItem {
  itemId: string;
  /** Total across every warehouse. */
  qty: number;
}

export interface WarehouseRef {
  id: string;
  code: string;
  warehouseType: string;
}

export interface StockReader {
  /**
   * On-hand per item. Deliberately NOT per warehouse: single-plant MRP nets against what
   * the plant has, and a per-warehouse split here would silently become an allocation
   * policy that nobody wrote down.
   */
  onHandByItem(itemIds: readonly string[]): Promise<OnHandByItem[]>;

  /**
   * The tenant's warehouses, by type.
   *
   * Needed when a planned order becomes a work order: the plan knows what to make, not
   * which shelf to take the components off. Inventory owns that list, so it is read
   * rather than guessed.
   */
  listWarehouseRefs(): Promise<WarehouseRef[]>;
}

// ---------------------------------------------------------------------------
// Product structure — ENGINEERING
// ---------------------------------------------------------------------------

export const BOM_GRAPH = Symbol("BomGraph");

export interface BomGraphEdge {
  parentItemId: string;
  componentItemId: string;
  /** Consumed per ONE unit of parent output — already divided by the BOM's output_qty. */
  qtyPer: number;
  scrapPct: number;
}

export interface BomGraph {
  /**
   * Every active BOM edge in the tenant, in one call.
   *
   * MRP needs the whole graph at once — the low-level code of an item depends on every
   * place it is used, so walking item by item would need the answer before it could ask
   * the question.
   */
  activeBomEdges(): Promise<BomGraphEdge[]>;
}

// ---------------------------------------------------------------------------
// Open supply — PURCHASE and PRODUCTION
// ---------------------------------------------------------------------------

// Two symbols, not one: open supply has two owners, and a single token could only ever be
// bound to one of them. Planning injects both and concatenates — which is also the honest
// picture, because "what is already coming" genuinely is two different modules' answers.
export const PURCHASE_SUPPLY = Symbol("PurchaseSupply");
export const PRODUCTION_SUPPLY = Symbol("ProductionSupply");

export interface OpenSupplyLine {
  itemId: string;
  /** Still to arrive: ordered minus received. */
  qty: number;
  /** When it is currently promised. NULL when nobody committed to a date. */
  dueDate: string | null;
  ref: string;
  kind: "purchase_order" | "production_order";
}

export interface SupplySource {
  /**
   * Supply that already exists and is not yet here.
   *
   * The engine treats every row as FACT at the date it carries. It will never redate one:
   * a purchase order is a commitment somebody made to a supplier, and moving it is a phone
   * call, not a database write (FR-PLN-024).
   */
  openSupply(): Promise<OpenSupplyLine[]>;
}

// ---------------------------------------------------------------------------
// Conversion — the only writes, and the reason planned orders exist
// ---------------------------------------------------------------------------

export const PRODUCTION_ORDER_CREATOR = Symbol("ProductionOrderCreator");

export interface CreateFromPlanInput {
  itemId: string;
  qty: number;
  /** Carried through so the execution document stays inside the pegging graph. */
  plannedOrderKey: string;
  needDate: string;
}

export interface CreatedDocument {
  id: string;
  ref: string;
}

export interface ProductionOrderCreator {
  /**
   * Turn a planned make-order into a real work order.
   *
   * Production decides the BOM version, snapshots the components and owns the stock path.
   * Planning supplies only the what, the how many and the by-when — which is all a plan
   * ever knew.
   */
  createFromPlan(input: CreateFromPlanInput, idempotencyKey: string): Promise<CreatedDocument>;
}
