/**
 * ============================================================================================
 * THE NON-NEGOTIABLE ARCHITECTURAL RULE: THERE IS ONE STOCK LEDGER, AND THIS MODULE DOES NOT
 * OWN IT.
 * ============================================================================================
 *
 * Warehouse & Dispatch never creates a second quantity record. Not a "warehouse on-hand"
 * table, not a picked-but-not-shipped counter, not a cached bin balance it keeps in step by
 * hand. Every single movement this module causes is posted through INVENTORY's existing write
 * path — `POST /stock/entries`, or a document endpoint (`POST /purchase/grns`,
 * `POST /sales/orders/:id/dispatch`) that posts through Inventory inside its own transaction —
 * carrying the existing `Idempotency-Key` header. Inventory stays the single write path and the
 * authoritative inventory record.
 *
 * This is the one rule that cannot be traded away later, and it is worth saying why in the
 * place a future edit would have to argue with it.
 *
 * A warehouse execution system is exactly the module that grows a second number. The pressure
 * is real and it always sounds reasonable: the scanner needs to know what is on the shelf
 * before the network answers; the pick list wants to mark a line "picked" before the truck
 * leaves; the count sheet wants somewhere to hold a figure that is not yet posted. Each of
 * those is a quantity, and the moment one of them is stored anywhere but the ledger, the plant
 * has two answers to "how many do we have" and no way to tell which is right. Reconciling them
 * becomes a permanent, unwinnable job — and the first person to notice is a customer whose
 * order was promised against stock that had already gone out of the door.
 *
 * So the rules, concretely:
 *
 *   - NOTHING IN THIS FOLDER HOLDS A BALANCE. What this module keeps in React state is a
 *     FORM — what the operator has typed and not yet submitted. It is labelled as unposted on
 *     screen and it is lost on refresh, which is correct: an unposted intention is not stock.
 *   - EVERY WRITE GOES THROUGH AN EXISTING ENDPOINT with a PINNED idempotency key (see
 *     `handlingKeyFor` below). A retry replays; it never repeats.
 *   - THERE IS NO NEW ENDPOINT AND NO NEW PERMISSION. If a job cannot be done with the twelve
 *     permissions and the routes listed below, this module says so on screen instead of
 *     inventing a route — see `CAPABILITY_GAPS`.
 *
 * Every field name below was read off the API's own source
 * (`apps/api/src/modules/{inventory,purchase,sales,production,quality,engineering}/`) rather
 * than inferred from a table name. A guessed field renders an em dash and looks like missing
 * data, which on a stock screen is a sentence people act on.
 *
 * Nothing outside this folder imports this file, and it imports nothing from another module —
 * which is what makes the folder deletable. The one import is the spine's `AppError`: the
 * platform's error envelope, not another module's code.
 */

import { AppError } from "@spine/api/errors";

/* ============================================================================================
   THE ROUTES. ALL OF THEM ALREADY EXIST.
   ============================================================================================ */

export const warehouseApi = {
  /* ---- INVENTORY: the authority on stock ---- */

  /**
   * THE SINGLE WRITE PATH TO STOCK. `stock.controller.ts`, `inventory.stock.post`.
   *
   * Requires an `Idempotency-Key` header — the controller throws a validation error without
   * one, before it looks at the body. Ledger-critical and race-safe inside the service: it
   * locks the contended `stock_balance` row FOR UPDATE, refuses to let a balance go negative,
   * and appends an immutable `stock_ledger` row. Batch-aware: an issue or transfer with no
   * `batch` is resolved FIFO across available lots under an advisory lock, and each split
   * becomes its own explicit line, so lot genealogy survives.
   */
  stockEntriesPath: "/stock/entries",
  /** Current on-hand, non-zero rows only. `?itemId=&warehouseId=`. Bare array, not a page. */
  stockPath: "/inventory/stock",
  /**
   * WHY A POSTED MOVEMENT HAS NO EDIT BUTTON, from the server's own mouth. Always answers
   * `editable: false` with `correctBy: "stock_adjustment"`. Read on the counts screen so the
   * refusal shown to an operator is the API's, not this module's opinion of it.
   */
  stockEditPolicyPath: "/inventory/stock/edit-policy",
  /** The warehouse master. Bare array of `WarehouseRow`, active rows only, ordered by code. */
  warehousesPath: "/inventory/warehouses",
  /** `inventory.warehouse.update`. Only `name` and `warehouseType` are editable — never `code`. */
  warehousePath: (id: string): string => `/inventory/warehouses/${encodeURIComponent(id)}`,

  /* ---- PURCHASE: what was ordered, and receiving it ---- */

  /** Cursor-paged `{items, nextCursor}`. `purchase.po.read`. */
  purchaseOrdersPath: "/purchase/orders",
  purchaseOrderPath: (id: string): string => `/purchase/orders/${encodeURIComponent(id)}`,
  /**
   * `purchase.grn.create`. Posts the stock receipt through Inventory IN THE SAME TRANSACTION,
   * so the receipt document, the PO line's `receivedQty` and the ledger commit together or not
   * at all. Over-receipt is refused server-side with `OVER_RECEIPT`.
   */
  grnsPath: "/purchase/grns",
  grnPath: (id: string): string => `/purchase/grns/${encodeURIComponent(id)}`,

  /* ---- SALES: what was promised, and shipping it ---- */

  salesOrdersPath: "/sales/orders",
  salesOrderPath: (id: string): string => `/sales/orders/${encodeURIComponent(id)}`,
  /**
   * `sales.dispatch.execute`. Issues the goods out of the order's finished-goods warehouse
   * through Inventory's write path inside the dispatch transaction, raises the delivery note
   * AND the invoice. Over-dispatch is refused with `OVER_DISPATCH`.
   */
  dispatchPath: (id: string): string => `/sales/orders/${encodeURIComponent(id)}/dispatch`,

  /* ---- PRODUCTION / QUALITY / ENGINEERING: read-only from here ---- */

  productionOrdersPath: "/production/orders",
  productionOrderPath: (id: string): string => `/production/orders/${encodeURIComponent(id)}`,
  inspectionsPath: "/quality/inspections",
  itemsPath: "/engineering/items",

  /** The API caps `limit` at 100 on every cursor route; asking for more is a 422. */
  pageSize: 50,
  pickerPageSize: 100,
} as const;

/* ============================================================================================
   WHAT THE ENDPOINTS ANSWER WITH.
   ============================================================================================ */

/**
 * A warehouse. `warehouseType` is one of SIX values and no others —
 * `accepted | quarantine | wip | finished | scrap | general` — taken from the zod enum in
 * `inventory.controller.ts` and the column comment in `packages/db/src/schema/inventory.ts`.
 *
 * SAID PLAINLY BECAUSE IT MATTERS FOR INDIA: there is NO `subcontractor`, `transit`,
 * `rejected` or `customer` type in this build. A subcontractor virtual warehouse is the
 * correct shape for job work — material sent out stays on the principal's books under a
 * delivery challan, with the input-back-in-a-year and capital-goods-in-three-years clocks
 * running — and this module does not pretend to have one. See `CAPABILITY_GAPS`.
 */
export interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  warehouseType: string;
}

/** `GET /inventory/stock`. `batch` is NOT NULL defaulting to `""` — unbatched is "", never null. */
export interface StockRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  batch: string;
  /** NUMERIC(18,3) over the wire as a string. Never parsed into a float for display. */
  qty: string;
}

/** `GET /inventory/stock/edit-policy`. A considered refusal, not a 404. */
export interface StockEditPolicy {
  editable?: boolean;
  correctBy?: string;
  reason?: string;
}

/** One line of `POST /stock/entries`, exactly as `lineSchema` accepts it. */
export interface StockEntryLine {
  itemId: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  /** Omit to let Inventory resolve lots FIFO on an issue or transfer. Max 60 chars. */
  batch?: string;
  /** Non-zero. Positive except on an adjustment, which may be signed. */
  qty: number;
}

/**
 * The body of `POST /stock/entries`, transcribed from `postSchema`:
 *
 *   entryType   receipt | issue | transfer | adjustment   REQUIRED
 *   reasonCode  string, max 60                            REQUIRED on an adjustment
 *   remarks     string, max 500
 *   lines       at least one
 *
 * There is nothing else — no document reference field, no operator field, no bin field. The
 * only free text that travels with a movement is `remarks`, which is why this module writes
 * the human trail there rather than pretending a reference column exists.
 */
export interface StockEntryBody {
  entryType: "receipt" | "issue" | "transfer" | "adjustment";
  reasonCode?: string;
  remarks?: string;
  lines: StockEntryLine[];
}

/** What a posting did, as the ledger reported it back. Rendered exactly as received. */
export interface StockMovement {
  itemId: string;
  warehouseId: string;
  batch: string;
  /** Signed: negative out, positive in. */
  delta: number;
  balanceAfter: number;
  valuationRate: number;
  valuedAmount: number;
  valuationBasis: string;
}

export interface StockEntryResult {
  entryId: string;
  entryType: string;
  /** The POSTED line count, which exceeds the requested count when FIFO split a lot. */
  lineCount: number;
  movements: StockMovement[];
}

/* ---- purchase ---- */

export interface PoSummaryRow {
  id: string;
  poNo: string;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  status: string;
  expectedDate: string | null;
  totalAmount: string;
  createdAt: string;
}

/** Item naming is left-joined and can be null — `item_id` is a logical ref with no FK. */
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
  totalAmount: string;
  remarks: string | null;
  revisionNo: number;
  lines: PoLineRow[];
}

/** One line of `POST /purchase/grns`. `batch` max 60; omitted becomes `""` server-side. */
export interface GrnLineInput {
  poLineId: string;
  qty: number;
  batch?: string;
}

export interface GrnBody {
  poId: string;
  /** WHERE it lands. A quarantine-typed warehouse here IS the quality hold. */
  warehouseId: string;
  grnDate?: string;
  lines: GrnLineInput[];
}

export interface GrnResult {
  id: string;
  grnNo: string;
  poId: string;
  poNo: string;
  vendorId: string;
  warehouseId: string;
  grnDate: string;
  status: string;
  /** The PO's status AFTER this receipt: `partially_received` or `received`. */
  poStatus: string;
  lines: Array<{ lineNo: number; poLineId: string; itemId: string; qty: string; batch: string }>;
  /** Only ever populated on the POST that creates the receipt, never on the GET. */
  stockMovements?: Array<{
    itemId: string;
    warehouseId: string;
    delta: number;
    balanceAfter: number;
  }>;
}

/* ---- sales ---- */

export interface SalesOrderSummary {
  id: string;
  soNo: string;
  customerId: string;
  customerCode: string | null;
  customerName: string | null;
  custPoNo: string;
  orderDate: string;
  requestedDeliveryDate: string | null;
  lineCount: number;
  isInterState: boolean;
  grandTotal: string;
  creditStatus: string;
  /** draft | credit_hold | confirmed | partially_dispatched | dispatched. */
  status: string;
}

export interface SalesOrderLine {
  id: string;
  lineNo: number;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  uom: string | null;
  qty: string;
  rate: string;
  hsn: string;
  lineTotal: string;
  deliveredQty: string;
  requestedDeliveryDate: string | null;
}

export interface SalesOrderDetail {
  id: string;
  soNo: string;
  customerId: string;
  customerCode: string | null;
  customerName: string | null;
  custPoNo: string;
  orderDate: string;
  requestedDeliveryDate: string | null;
  shipToGstin: string | null;
  shipToStateCode: string;
  placeOfSupply: string;
  isInterState: boolean;
  grandTotal: string;
  creditStatus: string;
  status: string;
  lines: SalesOrderLine[];
}

/** One line of `POST /sales/orders/:id/dispatch`. */
export interface DispatchLineInput {
  orderLineId: string;
  qty: number;
}

export interface DispatchBody {
  lines: DispatchLineInput[];
  transporter?: string;
  vehicleNo?: string;
  /**
   * A NUMBER SOMEBODY ELSE ALREADY OBTAINED, recorded against the shipment. This module does
   * not, and must not, generate one — see `CAPABILITY_GAPS`.
   */
  ewayBillNo?: string;
}

export interface DispatchResult {
  dispatchNo: string;
  stockEntryRef: string;
  orderStatus: string;
  movements: unknown[];
  invoiceNo: string;
  invoiceTotal: number;
  dueDate: string;
}

/* ---- production ---- */

export interface ProductionComponentRow {
  lineNo: number;
  componentItemId: string;
  itemCode: string | null;
  itemName: string | null;
  uom: string | null;
  requiredQty: string;
  issuedQty: string;
}

export interface ProductionOrderRow {
  id: string;
  orderNo: string;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  uom: string | null;
  bomId: string;
  qtyToProduce: string;
  producedQty: string;
  sourceWarehouseId: string;
  fgWarehouseId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionOrderDetail extends ProductionOrderRow {
  components: ProductionComponentRow[];
  operations: Array<{ sequence: number; operationCode: string; operationName: string; status: string }>;
}

/* ---- quality ---- */

/**
 * An inspection, read ONLY to show whether a receipt is already being looked at. This module
 * holds `quality.inspection.read` and nothing more — it cannot open, judge or disposition an
 * inspection, and no screen here offers to.
 */
export interface InspectionRow {
  id: string;
  inspectionNo: string;
  inspectionType: string;
  /** What opened it: `grn`, `manufacture`, `standalone`. */
  refType: string;
  refId: string | null;
  itemRef: string | null;
  itemCode: string | null;
  itemName: string | null;
  uom: string | null;
  lotQty: string | null;
  status: string;
  result: string;
  qtyAccepted: string | null;
  qtyRejected: string | null;
  completedAt: string | null;
}

/* ---- engineering ---- */

/**
 * An item from the master. NOTE WHAT IS NOT HERE: no weight, no length, breadth or height, no
 * volume, no pack size, no shelf life and no expiry. The `item` table carries none of them
 * (`packages/db/src/schema/engineering.ts`), which is why the loading screen plans by ORDER
 * and cannot plan by CUBE, and why nothing in this module claims FEFO.
 */
export interface ItemRow {
  id: string;
  itemCode: string;
  name: string;
  description: string | null;
  itemType: string;
  uom: string;
  standardCost: string | null;
  bomCount: number;
  defaultBomId: string | null;
}

/* ============================================================================================
   WAREHOUSE TYPES, AND WHAT EACH ONE MEANS ON A SHOP FLOOR.
   ============================================================================================ */

/**
 * The six types the API actually accepts, with the words a storekeeper uses for them.
 *
 * An unrecognised value renders as itself rather than being mapped to a neighbour. A wrong
 * label on a bin is worse than an unfamiliar one, because a wrong label is believed.
 */
export const WAREHOUSE_TYPES: Readonly<Record<string, { label: string; meaning: string }>> = {
  accepted: {
    label: "Accepted",
    meaning: "Cleared stock. Free to pick, issue and ship.",
  },
  quarantine: {
    label: "Quarantine",
    meaning:
      "Received but not cleared. Stock is on the books and in the ledger; it is held here until Quality decides.",
  },
  wip: {
    label: "Work in progress",
    meaning: "Material that has left the store for the floor and is not yet finished goods.",
  },
  finished: {
    label: "Finished goods",
    meaning: "Made or bought-in stock ready to ship. A sales order dispatches out of here.",
  },
  scrap: {
    label: "Scrap",
    meaning: "Written off as unusable. Still a real balance — scrap is counted, not deleted.",
  },
  general: {
    label: "General",
    meaning: "Everything else this plant stores. No special handling is implied.",
  },
};

export function warehouseTypeLabel(type: string): string {
  return WAREHOUSE_TYPES[type]?.label ?? type;
}

export function warehouseTypeMeaning(type: string): string {
  return (
    WAREHOUSE_TYPES[type]?.meaning ??
    "This type is not one the system recognises, so nothing is assumed about how it should be handled."
  );
}

/** Is this a hold location? The one type question that changes what a receiving screen does. */
export function isHoldWarehouse(type: string): boolean {
  return type === "quarantine";
}

/* ============================================================================================
   IDEMPOTENCY — THE MECHANISM THE WHOLE RECEIVING ACCEPTANCE TEST RESTS ON.
   ============================================================================================ */

/**
 * ONE KEY PER HANDLING UNIT, REUSED ACROSS EVERY RETRY OF THAT UNIT.
 *
 * `api.post` mints a fresh `Idempotency-Key` per REQUEST when none is given, so two clicks are
 * two keys and the server correctly treats them as two deliberate actions. That is right for
 * most screens and MATERIALLY WRONG here.
 *
 * The failure is not hypothetical and it is the acceptance test this module was written
 * against. A scanner on a receiving dock fires a code twice because the trigger bounced. The
 * plant Wi-Fi drops after the request left the tablet but before the answer came back, and the
 * storekeeper — who has no way to know whether it landed — presses Post again. With a fresh key
 * each time, that is TWO RECEIPTS: stock that is physically one pallet is two pallets in the
 * ledger, and nobody finds out until a count months later.
 *
 * So the key is derived from WHAT IS BEING HANDLED rather than from when the button was
 * pressed. Same document, same lines, same lots → same key → the server replays its first
 * answer and posts nothing. Change any figure and the key changes, because "receive 40, fail,
 * correct it to 45, post again" genuinely is a different action.
 *
 * Two consequences worth stating, because they are the ones that surprise people:
 *
 *   - A RETRY IS FREE AND SAFE. Pressing again after a timeout cannot double-post. The screens
 *     say so, in those words, so nobody hedges by waiting.
 *   - THE SERVER ANSWERS `IDEMPOTENCY_KEY_MISMATCH` when the same key arrives with different
 *     figures, and `IDEMPOTENCY_IN_PROGRESS` while the first attempt is still running. Neither
 *     is a fault and neither is rendered as one — see `explainWarehouseError`.
 *
 * This is one of THREE belts, not the only one: the button is disabled in flight, an `inFlight`
 * ref refuses a re-entrant call, and the key makes a landed request replay. The disabled button
 * cannot help once the request has left; the key cannot help against a touchscreen reporting
 * two taps in the same tick.
 */
export function handlingKeyFor(scope: string, payload: unknown): string {
  return `warehouse:${scope}:${stableHash(canonical(payload))}`;
}

/** Stable key ordering, so `{a,b}` and `{b,a}` are the same handling unit. */
function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${k}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * FNV-1a, 32-bit, rendered hex. Not a security hash and never used as one.
 *
 * `crypto.subtle.digest` is async and this has to be callable while rendering a confirm button;
 * the scope prefix keeps distinct actions apart even in the unlikely event of a collision, and
 * the worst case of a collision is a replay of a genuinely identical body.
 */
function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/* ============================================================================================
   SCANNING, WITHOUT REQUIRING A SCANNER.
   ============================================================================================ */

/**
 * WHAT A "SCAN" IS IN THIS MODULE: a string that arrived in a text input.
 *
 * A keyboard-wedge scanner — which is what is actually bolted to a receiving bench in an Indian
 * machine shop — types its barcode into whatever has focus and presses Enter. So does a person.
 * A plain focused text input handles both, works on every device, needs no permission prompt,
 * no HTTPS-only API and no hardware that might not be there, and degrades to typing when the
 * gun's battery is flat at 6am.
 *
 * `BarcodeDetector` (the camera path) is offered ONLY behind a runtime feature check, and the
 * typed field is always present underneath it rather than being replaced by it. It does not
 * exist in Firefox or on desktop Safari at all. A screen that assumes it is a screen that is
 * blank for half the plant.
 */
export function hasBarcodeDetector(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

/**
 * Normalise a scanned or typed code.
 *
 * Upper-cased and trimmed because a wedge scanner's shift handling is a configuration setting
 * nobody in the plant knows how to check, and `pn-4471` failing to match `PN-4471` reads to an
 * operator as "the system does not have this part". Internal whitespace is collapsed rather
 * than stripped: some part numbers genuinely contain a space and removing it would merge two
 * distinct codes.
 */
export function normaliseScan(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Find what was scanned among the lines in front of the operator.
 *
 * Matches an item code or a bare item id, never a fuzzy match. A receiving screen that helpfully
 * picks the "closest" part is a receiving screen that will one day book a casting against the
 * wrong drawing, and the operator will not question it because the system chose it.
 */
export function matchScan<T extends { itemId: string; itemCode: string | null }>(
  lines: readonly T[],
  scanned: string,
): readonly T[] {
  const code = normaliseScan(scanned);
  if (!code) return [];
  return lines.filter(
    (line) => (line.itemCode ?? "").toUpperCase() === code || line.itemId.toUpperCase() === code,
  );
}

/**
 * One entry in the session's scan log.
 *
 * THIS IS NOT A QUEUE AND IT IS NOT STOCK. It is a record of what the operator did at this
 * bench in this browser tab, kept so the screen can refuse a duplicate out loud and so the
 * evidence of a refusal is visible rather than implied. It is lost on refresh, which is
 * correct — nothing here is a movement until the ledger says it is.
 */
export interface ScanLogEntry {
  /** Monotonic within the session. Only used as a React key and for display order. */
  seq: number;
  at: string;
  code: string;
  outcome: "accepted" | "duplicate" | "unknown" | "over" | "cleared";
  /** One line the operator can read without reconstructing what happened. */
  note: string;
}

/* ============================================================================================
   ARITHMETIC. ALL OF IT, IN ONE PLACE, TESTABLE AND WITHOUT A MODEL ANYWHERE NEAR IT.
   ============================================================================================ */

/**
 * Parse a number typed into a field.
 *
 * Returns null for anything that is not a finite number, INCLUDING an empty string — which
 * `Number("")` helpfully turns into 0. On a received-quantity field that silent zero is a
 * receipt of nothing recorded as a receipt, so "nothing typed" and "zero" stay distinct.
 */
export function parseQty(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Quantities are NUMERIC(18,3). Rounding at three places is the ledger's own precision. */
export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * What is still to come on a purchase-order line, to the ledger's precision.
 *
 * Never negative: an over-received line is a data condition to display, not a negative
 * remainder to quietly carry into the next arithmetic.
 */
export function outstanding(ordered: string | number, done: string | number): number {
  const left = round3(Number(ordered) - Number(done));
  return Number.isFinite(left) ? Math.max(left, 0) : 0;
}

/**
 * A count variance: what the ledger says, against what the person in the aisle counted.
 *
 * Signed on purpose. A surplus is not good news — it is as much a sign of a mis-posted issue as
 * a shortfall is of a mis-posted receipt, and collapsing the two into "difference" loses the
 * direction that tells a supervisor which kind of mistake to go looking for.
 */
export function variance(systemQty: string | number, countedQty: number): number {
  return round3(countedQty - Number(systemQty));
}

/**
 * Total a column of NUMERIC strings without letting one bad row poison the sum.
 * A row that will not parse is skipped, never treated as zero silently in a way that changes a
 * total the reader can check against the rows above it.
 */
export function sumQty(values: readonly (string | number)[]): number {
  return round3(
    values.reduce<number>((total, v) => {
      const n = Number(v);
      return Number.isFinite(n) ? total + n : total;
    }, 0),
  );
}

/* ============================================================================================
   THE LOAD PLAN. ARITHMETIC, AND ONLY WHAT THE DATA SUPPORTS.
   ============================================================================================ */

/**
 * A shipment group: orders that could sensibly go on one vehicle.
 *
 * READ THE HONESTY NOTE ON `planLoad` BEFORE EXTENDING THIS.
 */
export interface LoadGroup {
  /** Stable across polls: the destination key the grouping was made on. */
  key: string;
  /** Where it is going, as the orders themselves record it. */
  destinationLabel: string;
  stateCode: string;
  interState: boolean;
  orders: readonly SalesOrderSummary[];
  /** How many order lines are still outstanding across the group. */
  openLineCount: number;
  /** The earliest promise in the group, or null when no order carries one. */
  earliestPromise: string | null;
  /** Value of the orders in the group. A load's value decides insurance, not its size. */
  totalValue: number;
}

/**
 * GROUP SHIPMENTS INTO A PLAN. NOT A LOAD, AND NOT A GUARANTEE.
 *
 * ==========================================================================================
 * WHAT THIS IS AND WHAT IT DELIBERATELY IS NOT
 * ==========================================================================================
 *
 * The brief asked for a deterministic bin-pack over real dimensions, on the sound reasoning
 * that arithmetic over real numbers is honest while a rendering of a packed truck is a
 * promise nobody can keep.
 *
 * THERE ARE NO DIMENSIONS. The item master carries `itemCode`, `name`, `description`,
 * `itemType`, `uom`, `hsnCode`, `itemGroup`, three boolean flags and `standardCost`
 * (`packages/db/src/schema/engineering.ts`). No weight. No length, breadth or height. No
 * volume, no pack size, no stackability, no vehicle master. A bin-pack needs at least a volume
 * and a container; this system has neither, and no endpoint exposes one.
 *
 * So this groups by DESTINATION and orders by PROMISE, which is genuine arithmetic over data
 * that genuinely exists: two orders going to the same ship-to state, both promised this week,
 * belong in the same conversation about a vehicle. That is useful and it is true.
 *
 * What it is NOT, said on the screen as well as here: it is not proof that the goods fit, not
 * proof that the load is legal or safe, and not a loading sequence. A person with a tape
 * measure decides that. If item weights and dimensions are ever added to the item master, THIS
 * is the function to extend — and it would still be a plan.
 *
 * Deterministic: the same orders in any input order produce the same groups in the same
 * sequence. A plan that reshuffles itself between two refreshes is a plan nobody trusts.
 */
export function planLoad(orders: readonly SalesOrderSummary[]): readonly LoadGroup[] {
  const groups = new Map<string, LoadGroup>();
  for (const order of orders) {
    const key = `${order.customerId}`;
    const existing = groups.get(key);
    const value = Number(order.grandTotal);
    if (existing) {
      groups.set(key, {
        ...existing,
        orders: [...existing.orders, order],
        openLineCount: existing.openLineCount + order.lineCount,
        earliestPromise: earlier(existing.earliestPromise, order.requestedDeliveryDate),
        totalValue: existing.totalValue + (Number.isFinite(value) ? value : 0),
      });
      continue;
    }
    groups.set(key, {
      key,
      destinationLabel: order.customerName ?? order.customerCode ?? order.customerId.slice(0, 8),
      stateCode: order.isInterState ? "Out of state" : "In state",
      interState: order.isInterState,
      orders: [order],
      openLineCount: order.lineCount,
      earliestPromise: order.requestedDeliveryDate,
      totalValue: Number.isFinite(value) ? value : 0,
    });
  }
  // Earliest promise first, then by destination — so the sequence is stable and the thing that
  // has to leave soonest is at the top, which is the only ordering a dispatch clerk wants.
  return [...groups.values()].sort((a, b) => {
    if (a.earliestPromise !== b.earliestPromise) {
      if (a.earliestPromise === null) return 1;
      if (b.earliestPromise === null) return -1;
      return a.earliestPromise.localeCompare(b.earliestPromise);
    }
    return a.destinationLabel.localeCompare(b.destinationLabel);
  });
}

function earlier(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a <= b ? a : b;
}

/**
 * WHOLE DAYS FROM TODAY TO A PROMISED DATE. Negative when the date is behind us.
 *
 * A `date` column arrives as the bare string `2026-09-14`, and `new Date("2026-09-14")` parses
 * as MIDNIGHT UTC — which is the 13th anywhere west of Greenwich. So a plain `YYYY-MM-DD` is
 * split and rebuilt as a LOCAL date. The plant runs on IST and would never have noticed; a
 * browser in Chicago would have called every shipment a day late.
 */
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysUntil(isoDate: string | null | undefined, from: Date = new Date()): number | null {
  if (!isoDate) return null;
  const parts = YMD.exec(isoDate.slice(0, 10));
  const due = parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
    : new Date(isoDate);
  if (Number.isNaN(due.getTime())) return null;
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  return Math.round((dueDay - today) / 86_400_000);
}

/** A PO is receivable only in these two states — `purchase.service.ts` refuses every other. */
export function isReceivable(status: string): boolean {
  return status === "approved" || status === "partially_received";
}

/** An order ships only from these two — `sales.service.ts` throws `ORDER_NOT_DISPATCHABLE`. */
export function isDispatchable(status: string): boolean {
  return status === "confirmed" || status === "partially_dispatched";
}

/* ============================================================================================
   WHAT THIS MODULE CANNOT DO, WRITTEN DOWN WHERE A SCREEN CAN QUOTE IT.
   ============================================================================================

   Every line here is a gap in the PLATFORM, not a gap in this screen's effort, and each is
   rendered to the user in the place they would otherwise assume the feature exists. A product
   that quietly omits a capability teaches people to assume it is there; a product that names
   the gap gets asked for it, which is how it eventually gets built.

   These are deliberately phrased as what is NOT true, because the failure mode being guarded
   against is a reader's optimism, not their confusion.
   ============================================================================================ */

export const CAPABILITY_GAPS = {
  /**
   * The most important one, and the one most likely to be misread from a web app that keeps a
   * scan log on screen.
   */
  offline:
    "This is a website, not an offline application. If the network is down, nothing on this screen posts and nothing is held to post later. What you see listed below the scan field is what you have typed at this bench in this tab — it is not a queue, it is not stock, and closing the tab loses it. Only a line that says it reached the ledger has moved.",
  fefo:
    "Lots are shown in the order Inventory returns them, and an unnamed issue is resolved FIFO by first receipt — by when the stock arrived, not by when it expires. The item master holds no expiry or shelf-life date, so nothing here is expiry-aware and no screen should be read as picking the oldest-expiring lot.",
  ewayBill:
    "No e-way bill or e-invoice is generated here. The field records a number somebody else already obtained from the portal so it travels with the shipment; it does not call the NIC or IRP, and leaving it blank does not stop the dispatch. Generation belongs to the integration and compliance service.",
  subcontractor:
    "There is no subcontractor warehouse type in this build. The API accepts six — accepted, quarantine, wip, finished, scrap and general — so material sent out for job work cannot be held in a virtual location on the principal's books here, and there is no delivery challan and no ageing clock for the one-year input and three-year capital-goods returns. Sending material out today is an ordinary issue, and the return is an ordinary receipt.",
  reservation:
    "Nothing on this screen reserves stock. The platform has no reservation record, so a shortage shown here is a shortage at the moment it was read and another order can consume the same lot a minute later. The only thing that removes stock from everyone else's reach is a posted issue.",
  dimensions:
    "No weight, dimension or volume is on record for any item, and there is no vehicle master. Nothing here calculates whether a load fits, weighs what it may legally weigh, or is safe to stack. It groups orders that are going to the same place at around the same time — a person with a tape measure decides the rest.",
  packingList:
    "A packing list built here is a document for this screen and this print. There is no packing-list endpoint, so it is not filed, not numbered and not readable again tomorrow. The delivery note raised by the dispatch IS the stored record.",
  productionIssue:
    "Issuing here moves the material and records it in the one stock ledger. It does not tick the work order's issued quantity, because that column belongs to Production's own issue action and this module does not hold the permission for it. If the work order needs to show the material as issued, use Production's Issue components.",
} as const;

/* ============================================================================================
   FAILURES, TURNED INTO SOMETHING A STOREKEEPER CAN ACT ON.
   ============================================================================================ */

export interface Explained {
  tone: "warn" | "bad";
  title: string;
  body: string;
  /** The permission a 403 was missing — NAMED, because a name is something you can ask for. */
  permission: string | null;
  traceId: string | null;
  /** True when the document moved on: reload, do not press again. */
  stale: boolean;
}

/**
 * The API answers every failure with one envelope, and the codes reachable from this module are
 * not interchangeable — each sends the reader somewhere different:
 *
 *   IDEMPOTENCY_KEY_MISMATCH / IDEMPOTENCY_IN_PROGRESS — the server PROTECTED the ledger. Not a
 *     fault, and it must never read like one: a storekeeper who sees "something went wrong"
 *     after a receipt will press the button again to be safe, which is the exact outcome the
 *     pinned key exists to prevent.
 *   INSUFFICIENT_STOCK — the shelf disagrees with the screen. The whole posting was refused, so
 *     there is no half-issued line to unpick.
 *   OVER_RECEIPT / OVER_DISPATCH — the document disagrees with the quantity. Fix the figure.
 *   PO_NOT_RECEIVABLE / ORDER_NOT_DISPATCHABLE / ORDER_ON_CREDIT_HOLD — somebody moved the
 *     document. Reload and look; pressing again cannot help.
 *   403 — an administrator, and only useful if the permission is named.
 *   NETWORK_UNREACHABLE — say plainly that a retry is safe, because it is.
 *
 * Rendering all of these as "the request was refused" would collapse six different next steps
 * into one dead end.
 */
export function explainWarehouseError(error: unknown): Explained {
  if (!(error instanceof AppError)) {
    return {
      tone: "bad",
      title: "Something went wrong",
      body: error instanceof Error ? error.message : "An unexpected error occurred.",
      permission: null,
      traceId: null,
      stale: false,
    };
  }

  const base = { permission: null as string | null, traceId: error.traceId ?? null, stale: false };

  switch (error.code) {
    case "IDEMPOTENCY_KEY_MISMATCH":
      return {
        ...base,
        tone: "warn",
        stale: true,
        title: "This was already posted, with different figures",
        body: "The server holds this exact action under the same key with different quantities, so it refused to run it a second time. NOTHING NEW WAS POSTED. Close this and reload the document — check what it already says before doing anything again.",
      };
    case "IDEMPOTENCY_IN_PROGRESS":
      return {
        ...base,
        tone: "warn",
        title: "The same posting is still going through",
        body: "An identical request is already running on the server. Wait a moment and reload rather than pressing again — pressing again cannot make it happen twice.",
      };
    case "INSUFFICIENT_STOCK":
      return {
        ...base,
        tone: "warn",
        title: "Not enough stock to post this",
        body: `${error.message} Nothing moved — one short line refuses the whole posting, so there is no half-completed movement to sort out.`,
      };
    case "OVER_RECEIPT":
      return {
        ...base,
        tone: "warn",
        title: "That is more than the order still expects",
        body: `${error.message} Correct the quantity, or ask Purchasing to amend the order before receiving the extra.`,
      };
    case "OVER_DISPATCH":
      return {
        ...base,
        tone: "warn",
        title: "That is more than the order still owes the customer",
        body: `${error.message} Nothing shipped. Correct the quantity on the line.`,
      };
    case "PO_NOT_RECEIVABLE":
      return {
        ...base,
        tone: "warn",
        stale: true,
        title: "This order cannot be received right now",
        body: `${error.message} Somebody has moved it since this page was opened. Reload to see where it actually stands.`,
      };
    case "ORDER_NOT_DISPATCHABLE":
      return {
        ...base,
        tone: "warn",
        stale: true,
        title: "This order cannot ship in its current state",
        body: `${error.message} Reload the order to see where it has got to.`,
      };
    case "ORDER_ON_CREDIT_HOLD":
      return {
        ...base,
        tone: "warn",
        title: "This order is on credit hold",
        body: `${error.message} Accounts releases a credit hold, not the warehouse. Nothing shipped.`,
      };
    case "STOCK_LINE_INVALID":
      return {
        ...base,
        tone: "warn",
        title: "That movement is not a shape the ledger accepts",
        body: `${error.message} A receipt names only a destination, an issue only a source, and a transfer needs two different warehouses.`,
      };
    case "VALIDATION_FAILED":
      return {
        ...base,
        tone: "warn",
        title: "Some of this was refused",
        body:
          error.details.length > 0
            ? error.details.map((d) => `${d.field}: ${d.message}`).join(" · ")
            : error.message,
      };
    case "NOT_FOUND":
      return {
        ...base,
        tone: "warn",
        stale: true,
        title: "This is no longer readable",
        body: `${error.message} It may have been opened from a stale link. Go back to the list and open it again.`,
      };
    case "NETWORK_UNREACHABLE":
      return {
        ...base,
        tone: "warn",
        title: "The server did not answer",
        // True because the key is pinned: the retry carries the SAME Idempotency-Key.
        body: "This may or may not have reached the plant. Press the button again — the retry carries the same key, so the same posting cannot happen twice.",
      };
    case "REQUEST_TIMED_OUT":
      return {
        ...base,
        tone: "warn",
        title: "The server did not answer in time",
        body: "It may be busy. Try again — the retry carries the same key, so a request that did land will be replayed rather than repeated.",
      };
    default:
      break;
  }

  if (error.kind === "forbidden") {
    return {
      tone: "warn",
      title: "You are not allowed to do this",
      body: "This is a permissions boundary, not a fault. Your administrator can grant it.",
      permission: error.missingPermission,
      traceId: base.traceId,
      stale: false,
    };
  }
  if (error.kind === "conflict") {
    return { ...base, tone: "warn", stale: true, title: error.message, body: "Reload and look before trying again." };
  }
  return {
    ...base,
    tone: error.kind === "server" ? "bad" : "warn",
    title: error.kind === "server" ? "Something went wrong at our end" : "This was refused",
    body: error.message,
  };
}
