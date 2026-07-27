import type { ModuleManifest, SignalValue } from "@spine/registry/manifest";
import { inr } from "@spine/format";
import { purchaseApi, isLate } from "./api";

/* --------------------------------------------------------------------------------------
   THE FIGURES THIS MODULE IS WILLING TO PUT ON A DASHBOARD.

   A buyer looks at Purchase to answer one question: what is committed, and what has not
   arrived. So the tiles are a count of open orders, a count of orders past the date the
   vendor promised, and the shape of the order book by status.

   TWO THINGS ARE SAID OUT LOUD RATHER THAN ASSUMED.

   - THE RUPEE FIGURE CARRIES NO TAX. `purchase_order` has no GST fields at all — the total
     is the sum of the line amounts and nothing else (see `PoDetail` in `api.ts`). A bare
     rupee figure on a dashboard is exactly where somebody forgets that and reads it as a
     landed cost, so the hint repeats it every time the number is drawn.
   - THE COUNTS DESCRIBE WHAT WAS READ. The order list is cursor-paged and the API caps a
     page at 100. When there is more behind the cursor the hint says so, because "12 open
     orders" is a dangerous thing to believe when it means "12 of the first 100".

   `isLate` is imported from this module's own `api.ts` rather than restated here, so the
   dashboard's idea of "overdue" is the same one the Purchase orders screen draws. Two
   definitions of late would eventually disagree, and the dashboard would be the one people
   quoted.
   -------------------------------------------------------------------------------------- */

/** The fields the tiles below actually read off a purchase order row. */
interface PoLite {
  status: string;
  expectedDate: string | null;
  totalAmount: number;
}

/** Committed and not yet fully in. A draft commits nothing; a closed order is nobody's wait. */
const OPEN_STATUSES = ["pending_approval", "approved", "partially_received"];

/** The buyer's vocabulary, in the order the Purchase orders screen uses. */
const STATUS_BUCKETS: ReadonlyArray<{ label: string; match: (s: string) => boolean }> = [
  { label: "Draft", match: (s) => s === "draft" },
  { label: "Awaiting approval", match: (s) => s === "pending_approval" },
  { label: "Approved", match: (s) => s === "approved" },
  { label: "Part received", match: (s) => s === "partially_received" },
  { label: "Received", match: (s) => s === "received" },
  { label: "Rejected", match: (s) => s === "rejected" || s === "cancelled" },
];

/**
 * How many orders a tile asks for. 100 is the API's hard cap on `limit` (`listQuerySchema`
 * in `po.controller.ts` — asking for more is a 422, not a bigger page), so this is as
 * complete a picture as one request can give.
 */
const SIGNAL_PAGE = 100;

interface PoPage {
  rows: PoLite[];
  /** True when the API had more orders than this one page could carry. */
  truncated: boolean;
}

/** A `{items, nextCursor}` page, a `{data}` wrapper or a bare array — anything else is not ours. */
function asArray(data: unknown): readonly unknown[] | null {
  if (Array.isArray(data)) return data;
  if (data !== null && typeof data === "object") {
    const bag = data as { items?: unknown; data?: unknown };
    if (Array.isArray(bag.items)) return bag.items;
    if (Array.isArray(bag.data)) return bag.data;
  }
  return null;
}

function poPage(data: unknown): PoPage | null {
  const raw = asArray(data);
  if (!raw) return null;
  const cursor =
    data !== null && typeof data === "object"
      ? (data as { nextCursor?: unknown }).nextCursor
      : null;

  const rows: PoLite[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") return null;
    const row = entry as Record<string, unknown>;
    if (typeof row.status !== "string") return null;
    const amount = typeof row.totalAmount === "number" ? row.totalAmount : Number(row.totalAmount);
    rows.push({
      status: row.status,
      expectedDate: typeof row.expectedDate === "string" ? row.expectedDate : null,
      totalAmount: Number.isFinite(amount) ? amount : 0,
    });
  }
  return { rows, truncated: typeof cursor === "string" && cursor.length > 0 };
}

/**
 * PURCHASE (SPAR, Module 04).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles, runs, and has one fewer item in
 * the sidebar — no route file to clean up, no navigation array to edit, no import left
 * dangling anywhere else.
 *
 * Two of the four screens are `hidden`: routable, but never in the sidebar. A purchase
 * order is reached by clicking the order you were already looking at, and a goods receipt
 * by its document number — neither is a place you navigate to cold. `grn` has no sidebar
 * entry for a second reason as well: the API has no list endpoint for goods receipts, so a
 * menu item pointing at it would open a screen that can only ever say "which one?".
 *
 * This is also the module that demonstrates the licence gate. Kaveri ElectroFab's licence
 * deliberately excludes `purchase`, so signing in as Kaveri shows the "not part of your
 * plan" screen here while Inventory opens normally — a licensing conversation, visibly
 * distinct from a permissions one.
 */
export const purchaseManifest: ModuleManifest = {
  key: "purchase",
  name: "Purchase",
  summary: "Vendors, purchase orders and what has actually been received against them.",
  department: "SPAR",
  icon: "ShoppingCart",
  licenceKey: "purchase",
  order: 25,
  nav: [
    {
      label: "Purchase orders",
      path: "orders",
      permission: "purchase.po.read",
      icon: "FileText",
    },
    {
      label: "Vendors",
      path: "vendors",
      permission: "purchase.vendor.read",
      icon: "Truck",
    },
    {
      label: "Purchase order",
      path: "order",
      permission: "purchase.po.read",
      icon: "FileText",
      hidden: true,
    },
    {
      label: "Goods receipt",
      path: "grn",
      permission: "purchase.grn.read",
      icon: "PackageCheck",
      hidden: true,
    },
  ],
  screens: {
    orders: () => import("./screens/orders"),
    vendors: () => import("./screens/vendors"),
    order: () => import("./screens/order"),
    grn: () => import("./screens/grn"),
  },
  signals: [
    /*
     * WHAT IS COMMITTED. Approved-and-waiting, part-received, and still-with-an-approver —
     * the orders somebody is expecting goods against. Drafts commit nothing and are excluded.
     */
    {
      label: "Open orders",
      permission: "purchase.po.read",
      path: purchaseApi.ordersPath,
      query: { limit: SIGNAL_PAGE },
      reduce: (data: unknown): SignalValue | null => {
        const page = poPage(data);
        if (!page) return null;
        const open = page.rows.filter((r) => OPEN_STATUSES.includes(r.status));
        const committed = open.reduce((n, r) => n + r.totalAmount, 0);
        return {
          value: String(open.length),
          hint: `${inr(committed)} committed — purchase orders here carry no tax${
            page.truncated ? " · first 100 orders only" : ""
          }`,
          tone: "neutral",
        };
      },
    },
    /*
     * WHAT HAS NOT ARRIVED. The other half of the buyer's question, and the half that needs
     * a phone call today. Red when anything is late, because an overdue delivery on a
     * dashboard that looks the same as an on-time one has told the reader nothing.
     */
    {
      label: "Past promised date",
      permission: "purchase.po.read",
      path: purchaseApi.ordersPath,
      query: { limit: SIGNAL_PAGE },
      reduce: (data: unknown): SignalValue | null => {
        const page = poPage(data);
        if (!page) return null;
        const open = page.rows.filter((r) => OPEN_STATUSES.includes(r.status));
        const late = open.filter((r) => isLate(r.expectedDate, r.status));
        if (open.length === 0) {
          return { value: "0", hint: "No open orders to chase", tone: "ok", fraction: 0 };
        }
        return {
          value: String(late.length),
          hint:
            late.length > 0
              ? `Of ${open.length} open orders, the vendor's date has passed`
              : `All ${open.length} open orders still within their promised date`,
          tone: late.length > 0 ? "bad" : "ok",
          fraction: late.length / open.length,
        };
      },
    },
    /*
     * THE SHAPE OF THE ORDER BOOK. Where the orders are stuck says more than any single
     * count: a pile in "Awaiting approval" is blocked inside this building, a pile in
     * "Approved" is blocked at the vendor, and those go to two different people.
     */
    {
      label: "Orders by status",
      permission: "purchase.po.read",
      path: purchaseApi.ordersPath,
      query: { limit: SIGNAL_PAGE },
      reduce: (data: unknown): SignalValue | null => {
        const page = poPage(data);
        if (!page || page.rows.length === 0) return null;
        const series = STATUS_BUCKETS.map((b) => ({
          label: b.label,
          value: page.rows.filter((r) => b.match(r.status)).length,
        })).filter((d) => d.value > 0);
        // Anything the buckets did not recognise is shown rather than quietly dropped, so
        // the slices always add up to the total in the middle.
        const counted = series.reduce((n, d) => n + d.value, 0);
        if (counted < page.rows.length) {
          series.push({ label: "Other", value: page.rows.length - counted });
        }
        // One bucket is not a composition — the tile above already said it.
        if (series.length < 2) return null;
        return {
          value: String(page.rows.length),
          hint: page.truncated ? "First 100 orders" : "Purchase orders",
          tone: "neutral",
          series,
        };
      },
    },
  ],
};
