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

export interface ProductionOrderDetail extends ProductionOrderRow {
  components: ProductionComponentRow[];
}

export const productionApi = {
  ordersPath: "/production/orders",
  orderPath: (id: string): string => `/production/orders/${id}`,
} as const;

/** Outstanding on a line or an order. Subtraction on strings needs a deliberate crossing. */
export function outstanding(required: string, done: string): number {
  return Math.max(Number(required) - Number(done), 0);
}
