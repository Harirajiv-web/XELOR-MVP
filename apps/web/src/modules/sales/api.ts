/**
 * Sales' own slice of the API. Nothing outside this folder imports it, and it imports
 * nothing from another module — which is what makes the folder deletable.
 */

/** Money and quantities arrive as strings — `NUMERIC(18,2)` does not survive a float. */
export interface SalesOrderLineView {
  id: string;
  lineNo: number;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  uom: string | null;
  qty: string;
  rate: string;
  hsn: string;
  gstRatePct: string;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  lineTotal: string;
  deliveredQty: string;
  requestedDeliveryDate: string | null;
}

/** A row on the list. The API returns summaries here — no lines, and no need for them. */
export interface SalesOrderSummary {
  id: string;
  soNo: string;
  customerId: string;
  customerCode: string | null;
  customerName: string | null;
  custPoNo: string;
  orderDate: string;
  /** The earliest promise still outstanding, or null once everything has shipped. */
  requestedDeliveryDate: string | null;
  lineCount: number;
  isInterState: boolean;
  grandTotal: string;
  /** pending | passed | hold | override — the credit gate's verdict, snapshotted. */
  creditStatus: string;
  /** draft | credit_hold | confirmed | partially_dispatched | dispatched. */
  status: string;
}

export interface SalesOrderView {
  id: string;
  soNo: string;
  customerId: string;
  customerCode: string | null;
  customerName: string | null;
  custPoNo: string;
  orderDate: string;
  requestedDeliveryDate: string | null;
  supplierGstin: string;
  billToGstin: string | null;
  shipToGstin: string | null;
  shipToStateCode: string;
  placeOfSupply: string;
  isInterState: boolean;
  subtotal: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  roundOff: string;
  grandTotal: string;
  creditStatus: string;
  creditLimitSnapshot: string | null;
  creditExposureSnapshot: string | null;
  status: string;
  lines: SalesOrderLineView[];
}

export interface CustomerRow {
  id: string;
  code: string;
  name: string;
  gstin: string | null;
  stateCode: string | null;
  creditLimit: string;
}

/**
 * An item as the New-order form needs it, from ENGINEERING's list endpoint.
 *
 * A SALES SCREEN CALLING AN ENGINEERING ENDPOINT IS FINE, and the distinction is worth
 * stating once because it will come up in every create form after this one. The boundary
 * rule is about IMPORTS between module FOLDERS — `modules/sales/` may not import
 * `modules/engineering/`, because that is what would stop either folder from being
 * deletable. It says nothing about HTTP: an order line names an item, the item master is
 * Engineering's system of record, and the sanctioned way to read somebody else's master is
 * to ask their endpoint for it. The alternative — Sales keeping its own copy of the item
 * list — is the actual boundary violation.
 *
 * `GET /engineering/items` does NOT return `hsnCode`, so HSN is typed on the line. See the
 * note on the form.
 */
export interface ItemOption {
  id: string;
  itemCode: string;
  name: string;
  itemType: string;
  uom: string;
}

/** One of the tenant's own GST registrations — GENERAL's `GstRegistrationRow`. */
export interface GstRegistrationOption {
  id: string;
  gstin: string;
  stateCode: string;
  /** "Pune-Chakan", "Coimbatore" — the registered place of business, i.e. the plant. */
  placeName: string;
}

/** A company with the places it is registered to trade from — GENERAL's list row. */
export interface CompanyOption {
  id: string;
  legalName: string;
  registrations: GstRegistrationOption[];
}

/** A warehouse, from INVENTORY. Returned as a bare array, not a cursor page. */
export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
  warehouseType: string;
}

export const salesApi = {
  ordersPath: "/sales/orders",
  orderPath: (id: string): string => `/sales/orders/${id}`,
  customersPath: "/sales/customers",
  /**
   * Endpoints the New-order form reads to fill its pickers. Other modules' HTTP surfaces,
   * deliberately — see `ItemOption` above for why that is not a boundary breach.
   */
  itemsPath: "/engineering/items",
  companiesPath: "/general/companies",
  warehousesPath: "/inventory/warehouses",
  /** `listQuerySchema` caps `limit` at 100 and rejects anything above it. */
  pageSize: 50,
  /** Pickers pull the largest page the API allows, then filter what has been loaded. */
  pickerPageSize: 100,
} as const;

/**
 * WHOLE DAYS FROM TODAY TO A PROMISED DATE. Negative when the date is behind us.
 *
 * `null` when there is no date or it cannot be read — which is a different answer from
 * zero, and the callers all treat it that way rather than assuming "today".
 *
 * TWO THINGS ARE DELIBERATE HERE.
 *
 * A `date` column arrives as the bare string `2026-07-20`, and `new Date("2026-07-20")`
 * is parsed as MIDNIGHT UTC — which is the 19th in any timezone west of Greenwich. So a
 * plain `YYYY-MM-DD` is split and rebuilt as a LOCAL date instead. The plant runs on IST
 * and would never have noticed; a browser in Chicago would have called every order one day
 * later than it is.
 *
 * And the comparison is at DAY granularity against the BROWSER'S today, never a fixed
 * date. An order promised for today is not late at nine in the morning, and a screen that
 * says it is teaches people to ignore the column by lunchtime.
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

/** Is a promised delivery date already behind us? One definition, used by list and tile. */
export function isPastDue(isoDate: string | null): boolean {
  const days = daysUntil(isoDate);
  return days !== null && days < 0;
}

/**
 * The credit gate, in the four words a person reading a list needs.
 *
 * Kept out of `toneFor` because a credit verdict is not a document status: "hold" here
 * means the order is stopped at OUR end waiting for a manager, which is a different fact
 * from an order the customer has not confirmed, and the two must not share a chip.
 */
export function creditBadge(creditStatus: string): { tone: "pending" | "approved" | "hold"; label: string } {
  switch (creditStatus) {
    case "passed":
      return { tone: "approved", label: "Within limit" };
    case "hold":
      return { tone: "hold", label: "On hold" };
    case "override":
      return { tone: "pending", label: "Override" };
    default:
      return { tone: "pending", label: "Not checked" };
  }
}

/** Sum a column of `NUMERIC` strings without letting a bad row poison the total. */
export function sumAmounts(values: readonly string[]): number {
  return values.reduce((total, v) => {
    const n = Number(v);
    return Number.isFinite(n) ? total + n : total;
  }, 0);
}
