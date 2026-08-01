/**
 * Production's own slice of the API. Nothing outside this folder imports it, and it imports
 * nothing from another module — which is what makes the folder deletable.
 *
 * The list route is cursor-paged under the platform's `{items, nextCursor}` envelope, which
 * `useCursorList` reads directly — so these screens page properly rather than asking for a
 * fixed ceiling and hoping it covers the shift.
 */

/**
 * Item master fields, resolved server-side through Engineering's item port.
 *
 * Null only where an id resolves to no item at all — a data fault worth seeing. Everywhere
 * else the screens print the code and hang the unit off every quantity, because a supervisor
 * who cannot match a line on the display to the drawing in their hand goes back to paper.
 */
export interface ItemNaming {
  itemCode: string | null;
  itemName: string | null;
  uom: string | null;
}

export interface ProductionOrderRow extends ItemNaming {
  id: string;
  orderNo: string;
  itemId: string;
  bomId: string;
  /** NUMERIC(18,3) over the wire — a string, so no float ever rounds a casting count. */
  qtyToProduce: string;
  producedQty: string;
  sourceWarehouseId: string;
  fgWarehouseId: string;
  status: string;
  /** When the order was raised. The schema carries no promised or due date, so nothing on
   *  these screens claims one — "late" is a question this data cannot answer yet. */
  createdAt: string;
  updatedAt: string;
}

export interface ProductionComponentRow extends ItemNaming {
  lineNo: number;
  componentItemId: string;
  requiredQty: string;
  issuedQty: string;
}

export interface ProductionOperationRow {
  sequence: number;
  operationCode: string;
  operationName: string;
  workCenterRef: string | null;
  status: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  operatorRef: string | null;
  inputQty: string | null;
  outputQty: string;
  rejectedQty: string;
  evidenceNote: string | null;
}

export interface ProductionOrderDetail extends ProductionOrderRow {
  components: ProductionComponentRow[];
  operations: ProductionOperationRow[];
}

/**
 * What an issue or a completion did to the stock ledger, as the endpoint reported it back.
 *
 * READ ONLY, and rendered exactly as received. Production never writes stock: both actions
 * reach the ledger through Inventory's single write path, inside Production's own
 * transaction, and this screen only ever prints the receipt. Nothing in this module builds a
 * stock movement or calls a stock endpoint (DECISIONS-V2 §5.6).
 */
export interface StockMovementResult {
  itemId: string;
  warehouseId: string;
  /** Negative on an issue, positive on a receipt. */
  delta: number;
  balanceAfter: number;
}

/** The order as the WRITE paths return it — the module's own columns, without item naming. */
export interface ProductionOrderCoreResult {
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
  components: Array<{
    lineNo: number;
    componentItemId: string;
    requiredQty: string;
    issuedQty: string;
  }>;
  operations: ProductionOperationRow[];
}

export interface ProductionActionResult {
  order: ProductionOrderCoreResult;
  stockMovements: StockMovementResult[];
}

/**
 * An item the plant can be told to make. From ENGINEERING's item master, read over HTTP like
 * any other screen would — never a cross-module import.
 *
 * `bomCount` is why this list is filtered rather than shown whole: an order raised against an
 * item with no active bill of materials is refused by the server every time, so offering it
 * would be offering a guaranteed rejection.
 */
export interface ItemOption {
  id: string;
  itemCode: string;
  name: string;
  itemType: string;
  uom: string;
  bomCount: number;
  defaultBomId: string | null;
}

/** A warehouse to issue from or receive into. From INVENTORY's warehouse master. */
export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
  warehouseType: string;
}

export const productionApi = {
  ordersPath: "/production/orders",
  orderPath: (id: string): string => `/production/orders/${id}`,
  /** Consume every outstanding component line, in one posting. `production.order.execute`. */
  issuePath: (id: string): string => `/production/orders/${id}/issue`,
  /** Receive output into finished goods. `production.order.execute`. */
  completePath: (id: string): string => `/production/orders/${id}/complete`,
  addOperationPath: (id: string): string => `/production/orders/${id}/operations`,
  startOperationPath: (id: string, sequence: number): string =>
    `/production/orders/${id}/operations/${sequence}/start`,
  completeOperationPath: (id: string, sequence: number): string =>
    `/production/orders/${id}/operations/${sequence}/complete`,
  /**
   * Masters the create form picks from. Both are GETs against other modules' read
   * endpoints — the create schema wants two warehouse UUIDs and an item UUID, and typing a
   * part number into a free-text box is how you get a work order for an item that does not
   * exist.
   */
  itemsPath: "/engineering/items",
  warehousesPath: "/inventory/warehouses",
} as const;

/** Outstanding on a line or an order. Subtraction on strings needs a deliberate crossing. */
export function outstanding(required: string, done: string): number {
  return Math.max(Number(required) - Number(done), 0);
}
