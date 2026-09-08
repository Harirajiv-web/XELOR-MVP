import type { ModuleAlert, ModuleManifest, SignalValue } from "@spine/registry/manifest";
import { inr, date as fmtDate } from "@spine/format";
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
      description:
        "Every order placed on a supplier, with what has been received against it so far. Receiving goods does not happen here — a goods receipt is a separate document, and stock only moves when one is recorded. An order shown as fully received has had its quantity matched, not merely its delivery promised.",
    },
    {
      label: "Vendors",
      path: "vendors",
      permission: "purchase.vendor.read",
      icon: "Truck",
      description:
        "The supplier master — who the plant is allowed to buy from, with their GSTIN and terms. A vendor is never deleted, only made inactive, because orders and invoices already point at them and the audit trail has to survive a supplier you stopped using.",
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

  /* ==========================================================================
     WHAT PURCHASE INTERRUPTS PEOPLE FOR.
     ==========================================================================

     A buyer finds out an order is late when the line stops. By then the options are an
     expensive one and a worse one. Everything below is decided by comparing the vendor's
     own promised date against today — arithmetic on `expectedDate`, using the same
     `isLate()` the order screen and the dashboard tile already use, so the bell and the
     table can never disagree about which orders are late.

     ONE THING IS SAID OUT LOUD RATHER THAN HIDDEN: only the first hundred orders are read.
     If the API had more, the summary alert says so, because "3 orders are late" from a
     truncated page is a comfortable number and a false one.
     ========================================================================== */
  alerts: [
    {
      /**
       * ALREADY LATE. The vendor's own promise has passed and the goods are not all in.
       * `urgent` rather than `critical`: nothing has stopped yet. A late delivery becomes a
       * stopped line through Inventory and Production, and those two modules raise their own
       * alerts when it does — this one is the warning that precedes theirs.
       */
      permission: "purchase.po.read",
      path: purchaseApi.ordersPath,
      query: { limit: SIGNAL_PAGE },
      reduce: (data: unknown): readonly ModuleAlert[] => alertLateOrders(data),
    },
    {
      /**
       * APPROVED WEEKS AGO AND STILL NOT ACKNOWLEDGED BY THE VENDOR.
       *
       * Deliberately NOT raised, and the reason belongs on the record: this build has no
       * vendor-acknowledgement field and no date on which an order was actually sent. The
       * only thing a browser could do here is guess from `createdAt`, which would produce a
       * confident alert about a fact the system does not hold. Left as a gap for the
       * founder to decide on rather than papered over.
       */
      permission: "purchase.po.read",
      path: purchaseApi.ordersPath,
      query: { limit: SIGNAL_PAGE },
      reduce: (data: unknown): readonly ModuleAlert[] => alertStuckApprovals(data),
    },
  ],
};

/* ------------------------------- the watches ------------------------------- */

/** The house cap: what a person will actually read before scrolling past. */
const ALERT_CAP = 8;

/**
 * The identifying fields an alert needs, which `PoLite` deliberately does not carry —
 * signals need three numbers, an alert needs to name a document and a supplier.
 */
interface PoNamed {
  id: string;
  poNo: string;
  vendorName: string;
  status: string;
  expectedDate: string | null;
  totalAmount: number;
}

function namedOrders(data: unknown): readonly PoNamed[] | null {
  const raw = asArray(data);
  if (!raw) return null;
  const out: PoNamed[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    // A row we cannot name is skipped rather than shown as "an order" — an alert nobody can
    // look up is an interruption with no action attached to it.
    if (typeof r.poNo !== "string" || typeof r.status !== "string") continue;
    const amount = Number(r.totalAmount);
    out.push({
      id: typeof r.id === "string" ? r.id : r.poNo,
      poNo: r.poNo,
      vendorName: typeof r.vendorName === "string" ? r.vendorName : "an unnamed supplier",
      status: r.status,
      expectedDate: typeof r.expectedDate === "string" ? r.expectedDate : null,
      totalAmount: Number.isFinite(amount) ? amount : 0,
    });
  }
  return out;
}

/** Whole days between a date and today, negative when the date has passed. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;
  const t = new Date();
  const dueMid = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const todayMid = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  return Math.round((dueMid - todayMid) / 86_400_000);
}

function alertLateOrders(data: unknown): readonly ModuleAlert[] {
  const rows = namedOrders(data);
  if (rows === null) return [];

  const late = rows
    .filter((r) => OPEN_STATUSES.includes(r.status))
    // NOT an order still awaiting approval, even though `isLate()` would happily call it
    // late. PO-2627-00003 in the demo data is both 25 days past its date AND unapproved, and
    // without this line it raises two alerts for one fact — "the supplier is late" and "we
    // never placed it" — which contradict each other in the same panel. The second watch
    // below owns that case, because it is the true one: nobody is late except us.
    .filter((r) => r.status !== "pending_approval")
    .filter((r) => isLate(r.expectedDate, r.status))
    .map((r) => ({ r, days: daysUntil(r.expectedDate) ?? 0 }))
    // Longest overdue first. Not by value: the buyer chasing suppliers works the phone in
    // order of how long each one has been ignoring us.
    .sort((a, b) => a.days - b.days);

  const alerts: ModuleAlert[] = late.slice(0, ALERT_CAP).map(({ r, days }) => {
    const overdue = Math.abs(days);
    const part = r.status === "partially_received";
    return {
      id: `purchase.po.late.${r.poNo}`,
      severity: "urgent",
      title: `${r.poNo} is ${overdue} ${overdue === 1 ? "day" : "days"} past the promised date`,
      body: `${r.vendorName} promised ${fmtDate(r.expectedDate)} for ${inr(r.totalAmount)}. ${
        part
          ? "Part of it has been received; the balance has not."
          : "Nothing has been received against it."
      }`,
      href: "/purchase/orders",
      // The stamp is the date the promise fell due, never the moment of the poll — that is
      // what lets the panel sort by how long each supplier has been late.
      at: r.expectedDate ?? undefined,
      evidence: `Purchase order ${r.poNo} on ${r.vendorName}, expected ${fmtDate(r.expectedDate)}, status ${r.status.replace(/_/g, " ")}.`,
    };
  });

  if (late.length > ALERT_CAP) {
    alerts.push({
      id: "purchase.po.late.more",
      severity: "attention",
      title: `${late.length} purchase orders are past their promised date`,
      body: `The ${ALERT_CAP} that have been waiting longest are listed above; the orders screen has the rest. Only the first ${SIGNAL_PAGE} orders were read, so this count is a floor, not a total.`,
      href: "/purchase/orders",
      evidence: `${late.length} open orders have an expected date earlier than today.`,
    });
  }
  return alerts;
}

/**
 * An order sitting with an approver while its own promised date runs out.
 *
 * This is the honest version of "an approved order nobody sent". The system does not record
 * when an order was transmitted to a vendor or whether the vendor acknowledged it, so that
 * question cannot be answered here. What CAN be answered is narrower and still useful: an
 * order that is still awaiting approval although the date it was meant to arrive is already
 * close or past. Nobody is chasing that supplier, because from the supplier's side there is
 * nothing to chase — the order was never placed.
 */
function alertStuckApprovals(data: unknown): readonly ModuleAlert[] {
  const rows = namedOrders(data);
  if (rows === null) return [];

  const stuck = rows
    .filter((r) => r.status === "pending_approval")
    .map((r) => ({ r, days: daysUntil(r.expectedDate) }))
    .filter((x): x is { r: PoNamed; days: number } => x.days !== null && x.days <= 3)
    .sort((a, b) => a.days - b.days);

  const alerts: ModuleAlert[] = stuck.slice(0, ALERT_CAP).map(({ r, days }) => ({
    id: `purchase.po.unapproved.${r.poNo}`,
    severity: days < 0 ? "urgent" : "attention",
    title:
      days < 0
        ? `${r.poNo} was due ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ago and is still awaiting approval`
        : `${r.poNo} is due in ${days} ${days === 1 ? "day" : "days"} and is still awaiting approval`,
    body: `${inr(r.totalAmount)} to ${r.vendorName}. Until somebody approves it the order has not been placed, so the supplier is not late — we are.`,
    href: "/purchase/orders",
    at: r.expectedDate ?? undefined,
    evidence: `Purchase order ${r.poNo}, status pending approval, expected ${fmtDate(r.expectedDate)}.`,
  }));

  if (stuck.length > ALERT_CAP) {
    alerts.push({
      id: "purchase.po.unapproved.more",
      severity: "attention",
      title: `${stuck.length} orders are awaiting approval with their delivery date in sight`,
      body: `The ${ALERT_CAP} closest to their date are listed above.`,
      href: "/purchase/orders",
      evidence: `${stuck.length} orders are pending approval with an expected date within three days or already passed.`,
    });
  }
  return alerts;
}
