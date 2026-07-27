/**
 * Purchase's own slice of the API. Nothing outside this folder imports it, and it imports
 * nothing from another module — which is what makes the folder deletable.
 *
 * Every field below was read off `apps/api/src/modules/purchase/purchase.service.ts`
 * rather than inferred from the table names. The lists come back as `{ items, nextCursor }`
 * — the platform's `CursorPage<T>`, which `useCursorList` reads directly, so both list
 * screens are ordinary paged tables with a real "Load more".
 */

/** `GET /purchase/orders` — one row, carrying everything the list needs to render. */
export interface PoSummaryRow {
  id: string;
  poNo: string;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  status: string;
  /** When the vendor promised it. Null when the buyer gave no date. */
  expectedDate: string | null;
  totalAmount: string;
  createdAt: string;
}

/**
 * A line on `GET /purchase/orders/:id`. `receivedQty` is what has actually arrived.
 *
 * The item fields are nullable because `item_id` is a cross-module logical reference with
 * no foreign key behind it — the API left-joins so a line can never vanish from a financial
 * document, which means a line can arrive with its label missing.
 */
export interface PoLineRow {
  id: string;
  lineNo: number;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  uom: string | null;
  qty: string;
  rate: string;
  amount: string;
  receivedQty: string;
}

export interface PoDetail {
  id: string;
  poNo: string;
  vendorId: string;
  vendorName: string;
  status: string;
  poDate: string;
  expectedDate: string | null;
  currency: string;
  /** Sum of line amounts. Tax-exclusive — the order holds no GST fields at all. */
  totalAmount: string;
  workflowInstanceId: string | null;
  lines: PoLineRow[];
}

export interface VendorRow {
  id: string;
  code: string;
  name: string;
  gstin: string | null;
  createdAt: string;
}

/** `batch` is a NOT NULL column defaulting to "" — an unbatched receipt is "", never null. */
export interface GrnLineRow {
  lineNo: number;
  poLineId: string;
  itemId: string;
  qty: string;
  batch: string;
}

export interface GrnDetail {
  id: string;
  grnNo: string;
  poId: string;
  poNo: string;
  vendorId: string;
  warehouseId: string;
  grnDate: string;
  status: string;
  /** The PO's status *after* this receipt: partially_received or received. */
  poStatus: string;
  lines: GrnLineRow[];
  /**
   * Only ever populated on the POST that creates the receipt. `GET /purchase/grns/:id`
   * does not re-derive it, so on this screen it is normally absent — and is rendered only
   * when present rather than faked from the lines.
   */
  stockMovements?: Array<{
    itemId: string;
    warehouseId: string;
    delta: number;
    balanceAfter: number;
  }>;
}

export const purchaseApi = {
  ordersPath: "/purchase/orders",
  orderPath: (id: string): string => `/purchase/orders/${id}`,
  vendorsPath: "/purchase/vendors",
  /** No list endpoint exists for goods receipts — only this by-id read. */
  grnPath: (id: string): string => `/purchase/grns/${id}`,
  /** Rows per page. The API caps `limit` at 100; asking for more is a 422, not a bigger page. */
  pageSize: 50,
} as const;

/**
 * An order is late when the vendor has promised a date that has passed and the goods are
 * not all in. Rejected and cancelled orders are never late — nobody is waiting for them.
 */
export function isLate(expectedDate: string | null, status: string): boolean {
  if (!expectedDate) return false;
  if (["received", "rejected", "cancelled", "draft"].includes(status)) return false;
  const due = new Date(expectedDate);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  return (
    new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() <
    new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  );
}

/**
 * A short, stable stand-in for an id we have no human label for.
 *
 * Purchase returns bare `item_id` UUIDs on its lines — the item code and description live
 * in Engineering and are not joined in. Showing the first segment keeps rows scannable and
 * comparable without pretending it is a part number.
 */
export function shortId(id: string): string {
  return id.slice(0, 8);
}
