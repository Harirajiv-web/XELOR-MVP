/**
 * PHASE 1's ROWS, TURNED INTO THE FIVE SHAPES PHASE 2 REASONS ABOUT.
 *
 * Five canonical models, one mapper each, all of them written out by hand. There is no
 * field-mapping engine here and there is not going to be one while Phase 2 sits on our own
 * Phase 1, for a reason worth stating plainly: a generic mapper turns "which column becomes
 * `onHandQty`?" into a configuration question, and the answer stops being readable in the
 * code. Sixty lines of explicit assignment can be checked against the schema by anybody in
 * about a minute. A mapping DSL cannot.
 *
 * WHAT THE MAPPERS ACTUALLY DO, since "normalise" can mean anything:
 *
 *   · Postgres NUMERIC comes back from the driver as a STRING, always. `numeric(18,3)`
 *     reads as "1183.674", not 1183.674. Every quantity and every rupee value in this file
 *     is therefore parsed exactly once, here, rather than by whichever caller remembered.
 *     The bug this prevents is not hypothetical: `"12" + 1` is "121".
 *   · A null becomes an explicit zero or an explicit null, never `undefined`, so a missing
 *     value and an absent field cannot be confused downstream.
 *   · Nothing is invented. If Phase 1 does not hold a field, the canonical model does not
 *     have it — which is why `CanonicalSupplier` carries price and lead time from the
 *     sourcing terms and NOT from the vendor master: the vendor table has neither.
 *
 * The input types are structural on purpose (`{ itemCode: string; ... }` rather than
 * `typeof item.$inferSelect`). `@ind-core/platform` is the floor of the dependency graph and
 * may not import `@ind-core/db`; describing the shape it accepts keeps the boundary intact
 * and makes every mapper trivially testable without a database.
 */

/* ------------------------------------------------------------------- numbers -- */

/**
 * A Postgres NUMERIC, as a number.
 *
 * Returns 0 for null/undefined/"" — the right answer for a quantity or a balance, which is
 * what every caller here is asking about. Anything genuinely unknown should be typed
 * `number | null` and handled by the caller rather than passed through this.
 */
export function decimal(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Rupees, to the paisa. Money is compared for equality more often than quantities are. */
export function rupees(v: string | number | null | undefined): number {
  return Math.round((decimal(v) + Number.EPSILON) * 100) / 100;
}

/* ----------------------------------------------------------------- customers -- */

/** Who the promise is to. From Sales · Customers (`customer`). */
export interface CanonicalCustomer {
  id: string;
  code: string;
  name: string;
  /** Null for an unregistered buyer, which is legitimate and not an error. */
  gstin: string | null;
  /** Rupees. 0 means no limit has been set, which is different from a limit of zero. */
  creditLimit: number;
  creditDays: number;
}

export interface Phase1CustomerRow {
  id: string;
  code: string;
  name: string;
  gstin?: string | null;
  creditLimit?: string | number | null;
  creditDays?: number | null;
}

export function toCanonicalCustomer(r: Phase1CustomerRow): CanonicalCustomer {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    gstin: r.gstin ?? null,
    creditLimit: rupees(r.creditLimit),
    creditDays: r.creditDays ?? 0,
  };
}

/* --------------------------------------------------------------------- items -- */

/** A part. From Engineering · Items (`item`). */
export interface CanonicalItem {
  id: string;
  code: string;
  name: string;
  /** raw_material | component | sub_assembly | finished_good | consumable */
  itemType: string;
  uom: string;
  /** Null when Engineering has not costed it. Zero would be a claim; null is the truth. */
  standardCost: number | null;
  purchasable: boolean;
  manufacturable: boolean;
}

export interface Phase1ItemRow {
  id: string;
  itemCode: string;
  name: string;
  itemType?: string | null;
  uom?: string | null;
  standardCost?: string | number | null;
  isPurchasable?: boolean | null;
  isManufacturable?: boolean | null;
}

export function toCanonicalItem(r: Phase1ItemRow): CanonicalItem {
  return {
    id: r.id,
    code: r.itemCode,
    name: r.name,
    itemType: r.itemType ?? "component",
    uom: r.uom ?? "nos",
    // Kept nullable deliberately. An uncosted part and a free part are different facts, and
    // the margin arithmetic is entitled to know which it is looking at.
    standardCost: r.standardCost == null || r.standardCost === "" ? null : rupees(r.standardCost),
    purchasable: r.isPurchasable ?? true,
    manufacturable: r.isManufacturable ?? false,
  };
}

/* ---------------------------------------------------------------- stock lines -- */

/**
 * On-hand for one item in one place. From Inventory · Stock (`stock_balance`).
 *
 * Per warehouse and batch rather than a single total, because that is how the row exists.
 * The mission sums them (see `totalOnHand`) and the sum is a DERIVED number that the
 * pipeline labels as such — a supervisor who is told "you have 1,183" is entitled to ask
 * "where", and the answer has to come from somewhere.
 */
export interface CanonicalStockLine {
  itemId: string;
  warehouseId: string;
  /** "" when the item is not batch-tracked. Not null — the column is NOT NULL DEFAULT ''. */
  batch: string;
  qty: number;
  asOf: string | null;
}

export interface Phase1StockRow {
  itemId: string;
  warehouseId: string;
  batch?: string | null;
  qty?: string | number | null;
  updatedAt?: Date | string | null;
}

export function toCanonicalStockLine(r: Phase1StockRow): CanonicalStockLine {
  return {
    itemId: r.itemId,
    warehouseId: r.warehouseId,
    batch: r.batch ?? "",
    qty: decimal(r.qty),
    asOf: r.updatedAt == null ? null : r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
  };
}

/** Everything on hand for one item, across warehouses and batches. */
export function totalOnHand(lines: readonly CanonicalStockLine[], itemId: string): number {
  return lines.filter((l) => l.itemId === itemId).reduce((n, l) => n + l.qty, 0);
}

/* ----------------------------------------------------------------- suppliers -- */

/**
 * A supplier, as a sourcing decision needs one.
 *
 * TWO SOURCES MEET HERE AND THE MODEL SAYS SO. Identity — id, code, name — comes from
 * Purchase · Vendors, which is a real Phase 1 table. Commercial terms — price, lead time,
 * reliability, capacity — come from the sourcing terms, which Phase 1 has no table for at
 * all. `termsFrom` records which stand-in supplied them so the screen can label it, and so
 * nobody later reads a lead time off this object believing the vendor master held one.
 */
export interface CanonicalSupplier {
  /** The vendor master's uuid when the vendor exists; the sourcing code when it does not. */
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  /** True only when a `vendor` row was actually found. A false here stops the procure step. */
  inVendorMaster: boolean;
  unitPrice: number;
  leadTimeDays: number;
  /** 0..1 delivered-on-time. Drives risk scoring, never price. */
  reliability: number;
  capacityUnits: number;
  qualified: boolean;
  /** "seeded" — the checked-in terms table. "spreadsheet" — an uploaded price list. */
  termsFrom: "seeded" | "spreadsheet";
}

export interface Phase1VendorRow {
  id: string;
  code: string;
  name: string;
}

/** The four numbers Phase 1 does not hold, whatever supplied them. */
export interface SupplierTermsRow {
  vendorCode: string;
  vendorName: string;
  unitPrice: number;
  leadTimeDays: number;
  reliability: number;
  capacityUnits: number;
  qualified: boolean;
}

export function toCanonicalSupplier(
  terms: SupplierTermsRow,
  master: Phase1VendorRow | null,
  termsFrom: "seeded" | "spreadsheet" = "seeded",
): CanonicalSupplier {
  return {
    vendorId: master?.id ?? terms.vendorCode,
    vendorCode: terms.vendorCode,
    // The master's name wins when there is one: the document goes out under the name the
    // vendor is registered as, not the name a price list happened to spell.
    vendorName: master?.name ?? terms.vendorName,
    inVendorMaster: master !== null,
    unitPrice: rupees(terms.unitPrice),
    leadTimeDays: Math.max(0, Math.round(terms.leadTimeDays)),
    reliability: clamp01(terms.reliability),
    capacityUnits: Math.max(0, terms.capacityUnits),
    qualified: terms.qualified,
    termsFrom,
  };
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/* --------------------------------------------------------------- order lines -- */

/** One line of the commitment. From Sales · Orders (`sales_order_line`). */
export interface CanonicalOrderLine {
  id: string;
  lineNo: number;
  itemId: string;
  /** Filled from Engineering · Items; "?" when the join found nothing, never a uuid. */
  itemCode: string;
  qty: number;
  uom: string;
  /** Per unit, before tax. The number the margin is computed against. */
  rate: number;
  deliveredQty: number;
  reservedQty: number;
  /** Still to promise: ordered, less what is already delivered or committed. Never below 0. */
  openQty: number;
  requestedDeliveryDate: string | null;
}

export interface Phase1OrderLineRow {
  id: string;
  lineNo: number;
  itemId: string;
  qty?: string | number | null;
  uom?: string | null;
  rate?: string | number | null;
  deliveredQty?: string | number | null;
  reservedQty?: string | number | null;
  requestedDeliveryDate?: string | null;
}

export function toCanonicalOrderLine(r: Phase1OrderLineRow, itemCode = "?"): CanonicalOrderLine {
  const qty = decimal(r.qty);
  const delivered = decimal(r.deliveredQty);
  const reserved = decimal(r.reservedQty);
  return {
    id: r.id,
    lineNo: r.lineNo,
    itemId: r.itemId,
    itemCode,
    qty,
    uom: r.uom ?? "nos",
    rate: rupees(r.rate),
    deliveredQty: delivered,
    reservedQty: reserved,
    // Clamped at zero. An over-delivered line is a real thing in a factory and it does not
    // mean there is negative work left to do.
    openQty: Math.max(0, qty - delivered - reserved),
    requestedDeliveryDate: r.requestedDeliveryDate ?? null,
  };
}

/** Line total before tax, rounded the way Sales rounds it. */
export function lineValue(l: CanonicalOrderLine): number {
  return rupees(l.qty * l.rate);
}
