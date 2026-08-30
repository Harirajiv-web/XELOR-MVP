import type { ModuleAlert, ModuleManifest } from "@spine/registry/manifest";
import { date, humanise, inr, inrShort, relativeDays } from "@spine/format";
import { daysUntil, isPastDue, sumAmounts } from "./api";

/* ---------------------- what the dashboard tiles read ----------------------- */

/**
 * Once an order has fully shipped, a date behind it is history rather than a problem. The
 * same set the orders screen uses — a dashboard and the list it links to must not disagree
 * about what "open" means.
 */
const SETTLED = new Set(["dispatched", "cancelled", "closed"]);

/** The journey an order makes, so a composition reads in the order work travels. */
const PIPELINE = ["draft", "credit_hold", "confirmed", "partially_dispatched", "dispatched"];

function stage(status: string): number {
  const i = PIPELINE.indexOf(status);
  return i === -1 ? PIPELINE.length : i;
}

/**
 * Only what the tiles and the watches actually read, so nothing here depends on a field it
 * does not use. Every one of these is a column `GET /sales/orders` genuinely returns —
 * `SalesService.listOrders` builds exactly this row and nothing more.
 */
interface OrderFact {
  id: string;
  soNo: string;
  customerName: string | null;
  custPoNo: string;
  orderDate: string | null;
  status: string;
  requestedDeliveryDate: string | null;
  creditStatus: string;
  grandTotal: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * The cursor envelope, in all three spellings that exist in this codebase (`items`, `data`,
 * or a bare array). `reduce` is handed `unknown`, and a shape it does not recognise must
 * produce `null` rather than a guess — the tile then vanishes instead of showing a wrong
 * number, which is the right trade for something decorative.
 */
function pageRows(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data as unknown[];
  if (!isRecord(data)) return null;
  if (Array.isArray(data.items)) return data.items as unknown[];
  if (Array.isArray(data.data)) return data.data as unknown[];
  return null;
}

function hasMorePages(data: unknown): boolean {
  return isRecord(data) && typeof data.nextCursor === "string" && data.nextCursor !== "";
}

function orderFacts(data: unknown): OrderFact[] | null {
  const raw = pageRows(data);
  if (raw === null) return null;
  const out: OrderFact[] = [];
  for (const row of raw) {
    // One unrecognisable row means the endpoint is not what this tile was written against,
    // so the whole figure is abandoned rather than quietly computed from a subset of it.
    if (!isRecord(row) || typeof row.status !== "string") return null;
    out.push({
      id: typeof row.id === "string" ? row.id : "",
      soNo: typeof row.soNo === "string" ? row.soNo : "",
      customerName: typeof row.customerName === "string" ? row.customerName : null,
      custPoNo: typeof row.custPoNo === "string" ? row.custPoNo : "",
      orderDate: typeof row.orderDate === "string" ? row.orderDate : null,
      status: row.status,
      requestedDeliveryDate:
        typeof row.requestedDeliveryDate === "string" ? row.requestedDeliveryDate : null,
      creditStatus: typeof row.creditStatus === "string" ? row.creditStatus : "",
      grandTotal: typeof row.grandTotal === "string" ? row.grandTotal : "0",
    });
  }
  return out;
}

/* ------------------------- what the watches read ---------------------------- */

/**
 * WHAT SALES WATCHES FOR, AND WHY IT IS ARITHMETIC.
 *
 * Three watches, all reading the one endpoint the orders screen reads, all gated on the
 * permission that endpoint enforces. The alert centre issues ONE request for the three of
 * them, because it deduplicates by path and query before it fetches.
 *
 * Every verdict below is a comparison, in this file, against a date or a status column:
 *
 *   PAST ITS PROMISED DATE   `daysUntil(requestedDeliveryDate) < 0` and the order is not
 *                            settled. That date is the earliest promise still outstanding
 *                            across the order's UNDELIVERED lines — `listOrders` computes it
 *                            by skipping every line where `deliveredQty >= qty` — so an
 *                            order stops being late the moment the late line actually ships,
 *                            rather than staying red until somebody closes it.
 *   PROMISED TODAY           `daysUntil(...) === 0`. This is the founder's case: a dispatch
 *                            promised for today that has not moved.
 *   STOPPED AT OUR END       `creditStatus === "hold"` or `status === "credit_hold"`. Not a
 *                            date at all — a column, read as it stands.
 *
 * No model is asked whether an order is late (DECISIONS-V2 §4). A model asked to judge will
 * occasionally decide a thing is fine because the sentence read better, and an alert that is
 * wrong in the reassuring direction is worse than no alert.
 *
 * TWO HONEST LIMITS, stated rather than hidden:
 *  - The endpoint caps `limit` at 100, so a tenant with more orders is watched on its first
 *    page. It orders OLDEST FIRST, which happens to be the right page — the oldest orders
 *    are where the missed promises are — and the summary line says so when the page is full.
 *  - "Not moved" here means "not fully dispatched". Sales holds no lorry, no gate pass and no
 *    e-way bill; a claim about a vehicle would be a claim this module cannot evidence.
 */
const ALERT_CAP = 8;

/** Was this order settled before the date passed? Then a date behind it is history. */
function isOpen(o: OrderFact): boolean {
  return !SETTLED.has(o.status);
}

/** Enough of a row to name a document and link to it. Anything less cannot be an alert. */
function isNameable(o: OrderFact): boolean {
  return o.soNo !== "" && o.id !== "";
}

/** A `NUMERIC` string as a number, with a bad row worth nothing rather than NaN. */
function amountOf(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** "3S Precision Parts" — or the customer's own PO when the name did not come. */
function who(o: OrderFact): string {
  if (o.customerName) return o.customerName;
  return o.custPoNo ? `the customer on PO ${o.custPoNo}` : "the customer";
}

/** The row this was read from, named so a person can go and check it. */
function orderEvidence(o: OrderFact): string {
  const promised = o.requestedDeliveryDate
    ? `promised ${date(o.requestedDeliveryDate)}`
    : "no promised date on file";
  return `Sales order ${o.soNo}, ${promised}, their PO ${o.custPoNo || "—"}, ${inr(o.grandTotal)} incl. GST.`;
}

/**
 * The worst few, plus one line admitting how many more there are.
 *
 * NEVER A SILENT TRUNCATION. A panel that shows eight of twenty-three and says nothing is
 * teaching somebody that eight is the whole problem, and they will plan their day on it.
 */
function capped(
  all: readonly ModuleAlert[],
  summary: { id: string; title: (total: number) => string; body: string; href: string },
): readonly ModuleAlert[] {
  if (all.length <= ALERT_CAP) return all;
  const shown = all.slice(0, ALERT_CAP);
  return [
    ...shown,
    {
      id: summary.id,
      severity: "attention",
      title: summary.title(all.length),
      body: summary.body,
      href: summary.href,
      evidence: `Counted across the ${all.length} matching orders on this page of GET /sales/orders.`,
    },
  ];
}

/**
 * SALES / SMBD (MICA, Module 07).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles, runs, and has one fewer item in
 * the sidebar — no route file to clean up, no navigation array to edit, no import left
 * dangling anywhere else.
 *
 * `order` is hidden: it is a detail screen reached by clicking a row on `orders`, so it
 * needs a route but not a menu entry. `/sales/order/<id>` resolves to it with the id
 * arriving as `props.params[0]`.
 */
export const salesManifest: ModuleManifest = {
  key: "sales",
  name: "Sales",
  summary: "Customers, their orders, and what each order has cost them and committed us to.",
  department: "MICA",
  icon: "Receipt",
  licenceKey: "sales",
  order: 40,
  nav: [
    {
      label: "Sales orders",
      path: "orders",
      permission: "sales.order.read",
      icon: "FileText",
      description:
        "Every order the plant has accepted, one row each, with the promised date, the credit verdict, how far it has travelled and its value including GST. The promised date shown is the earliest one still outstanding across the lines that have not shipped, so an order stops looking late when the late line goes out. You can raise a new order here; you cannot mark one dispatched — that happens against the order itself.",
    },
    {
      label: "Sales order",
      path: "order",
      permission: "sales.order.read",
      icon: "FileText",
      hidden: true,
    },
    {
      label: "Customers",
      path: "customers",
      permission: "sales.customer.read",
      icon: "Users",
      description:
        "The customer master every order, dispatch and invoice is raised against: code, name, GSTIN, state and credit limit. The GSTIN is what decides CGST+SGST or IGST, and the credit limit is what the order-confirmation gate checks against. This screen lists them only — it does not show what a customer currently owes, which lives in Accounts.",
    },
  ],
  screens: {
    orders: () => import("./screens/orders"),
    order: () => import("./screens/order"),
    customers: () => import("./screens/customers"),
  },
  /**
   * WHAT THE DEPARTMENT DASHBOARD SHOWS FOR SALES.
   *
   * A plant manager glancing at MICA is asking one question — WHAT IS PROMISED, AND WHEN.
   * So the two headlines are a count of orders not yet fully dispatched and a count of those
   * whose promised date is already behind us, with the pipeline underneath as a shape.
   *
   * All three read `GET /sales/orders`, the same endpoint the orders screen reads, under the
   * same permission the endpoint enforces. Nothing here is a new query invented for a tile.
   */
  signals: [
    {
      label: "Open orders",
      permission: "sales.order.read",
      path: "/sales/orders",
      // The API caps `limit` at 100 and rejects more. It orders OLDEST first, so on a tenant
      // with more than a hundred orders this is the first page and not the whole book — the
      // hint says "the first N" in that case rather than implying it counted everything.
      query: { limit: 100 },
      reduce: (data) => {
        const rows = orderFacts(data);
        if (rows === null) return null;
        if (rows.length === 0) {
          return { value: "0", hint: "No orders entered yet", tone: "neutral" };
        }
        const open = rows.filter((o) => !SETTLED.has(o.status));
        // Sales orders CARRY TAX; a purchase order does not. Saying so on the tile is what
        // stops somebody reading this figure next to Purchase's and treating them as a pair.
        const committed = inrShort(sumAmounts(open.map((o) => o.grandTotal)));
        const scope = hasMorePages(data) ? `of the first ${rows.length}` : `of ${rows.length}`;
        return {
          value: String(open.length),
          hint: `${scope} orders · ${committed} incl. GST still to ship`,
          tone: "neutral",
          fraction: open.length / rows.length,
        };
      },
    },
    {
      label: "Past promised date",
      permission: "sales.order.read",
      path: "/sales/orders",
      query: { limit: 100 },
      reduce: (data) => {
        const rows = orderFacts(data);
        if (rows === null) return null;
        const open = rows.filter((o) => !SETTLED.has(o.status));
        if (open.length === 0) {
          return { value: "0", hint: "Nothing open to be late", tone: "neutral" };
        }
        // The same day-granularity comparison the orders screen uses, imported rather than
        // rewritten: a tile that disagrees with the list it links to is worse than no tile.
        const late = open.filter((o) => isPastDue(o.requestedDeliveryDate)).length;
        // Orders taken with no promised date cannot be late and are not silently counted as
        // on time either — ZERO IS A REAL ANSWER, and it has to read as one.
        const undated = open.filter((o) => o.requestedDeliveryDate === null).length;
        const dated = open.length - undated;
        return {
          value: String(late),
          hint:
            late > 0
              ? `of ${open.length} open — each one a customer already waiting`
              : undated > 0
                ? `All ${dated} dated orders inside their promise · ${undated} with no date`
                : `All ${open.length} open orders are inside their promise`,
          tone: late > 0 ? "bad" : "ok",
          fraction: late / open.length,
        };
      },
    },
    {
      label: "Orders by status",
      permission: "sales.order.read",
      path: "/sales/orders",
      query: { limit: 100 },
      reduce: (data) => {
        const rows = orderFacts(data);
        if (rows === null || rows.length === 0) return null;
        const counts = new Map<string, number>();
        for (const o of rows) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
        // Pipeline order, not count order: this is a composition of one journey, and reading
        // it in the sequence work actually travels is the whole point of drawing it.
        const series = [...counts.entries()]
          .sort(([sa, ca], [sb, cb]) => stage(sa) - stage(sb) || cb - ca)
          .map(([status, value]) => ({ label: humanise(status), value }));
        return { value: String(rows.length), hint: "orders loaded", series };
      },
    },
  ],
  /**
   * WHAT SALES TELLS EVERYBODY ABOUT, WHETHER OR NOT THEY OPEN SALES.
   *
   * See the block above `ALERT_CAP` for the arithmetic. Each `id` is built from the SO
   * NUMBER, so the same late order is the same alert on every poll and "I have read this"
   * survives a refresh — an id carrying a timestamp would re-announce the same order every
   * ninety seconds until somebody muted the bell.
   */
  alerts: [
    {
      /**
       * ALREADY LATE. The promise is broken, not about to break, which is why these outrank
       * everything else this module says. Ranked by how long ago the promise fell due, so
       * the customer who has been waiting longest is at the top.
       */
      permission: "sales.order.read",
      path: "/sales/orders",
      query: { limit: 100 },
      reduce: (data) => {
        const rows = orderFacts(data);
        if (rows === null) return [];
        const late = rows
          .filter(isNameable)
          .filter(isOpen)
          .map((o) => ({ o, days: daysUntil(o.requestedDeliveryDate) }))
          .filter((r): r is { o: OrderFact; days: number } => r.days !== null && r.days < 0)
          .sort((a, b) => a.days - b.days);

        const alerts = late.map(({ o, days }): ModuleAlert => {
          // The reason it is stuck is worth more than the fact that it is stuck, and on a
          // held order the reason is inside this building rather than at the customer's.
          const stuck =
            o.creditStatus === "hold" || o.status === "credit_hold"
              ? " It is on credit hold, so it is waiting on somebody here, not on the customer."
              : o.status === "draft"
                ? " It was never confirmed, so planning and production have never seen it."
                : o.status === "partially_dispatched"
                  ? " Part of it has shipped; the rest has not."
                  : "";
          return {
            id: `sales.order.overdue.${o.soNo}`,
            severity: "critical",
            title: `${o.soNo} is ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} past its promised date`,
            body: `${who(o)} was promised ${date(o.requestedDeliveryDate)} and it has not fully shipped.${stuck}`,
            href: `/sales/order/${o.id}`,
            // The stamp of the EVENT — the day the promise fell due — never the poll.
            at: o.requestedDeliveryDate ?? undefined,
            evidence: orderEvidence(o),
          };
        });

        return capped(alerts, {
          id: "sales.order.overdue.more",
          title: (total) =>`${total} orders are past their promised date`,
          body: `The ${ALERT_CAP} that have been waiting longest are listed above. The rest are on the orders screen, sorted by promised date.`,
          href: "/sales/orders",
        });
      },
    },
    {
      /**
       * DUE TODAY. Still inside the promise, and it stops being so at midnight — which is
       * exactly the window in which somebody can still do something about it.
       *
       * TOMORROW IS DELIBERATELY NOT HERE. An order promised for tomorrow is not a problem,
       * and a bell that rings for things that are fine is a bell people turn off.
       */
      permission: "sales.order.read",
      path: "/sales/orders",
      query: { limit: 100 },
      reduce: (data) => {
        const rows = orderFacts(data);
        if (rows === null) return [];
        const dueToday = rows
          .filter(isNameable)
          .filter(isOpen)
          .filter((o) => daysUntil(o.requestedDeliveryDate) === 0)
          // Biggest commitment first: if only some of today's promises can be met, the
          // person deciding which should be looking at the money.
          .sort((a, b) => Number(b.grandTotal) - Number(a.grandTotal));

        const alerts = dueToday.map(
          (o): ModuleAlert => ({
            id: `sales.order.due-today.${o.soNo}`,
            severity: "urgent",
            title: `${o.soNo} is promised for today and has not shipped`,
            body: `${who(o)} expects ${inrShort(Number(o.grandTotal))} of goods today. Status is ${humanise(o.status).toLowerCase()}; after midnight this becomes a missed promise.`,
            href: `/sales/order/${o.id}`,
            at: o.requestedDeliveryDate ?? undefined,
            evidence: orderEvidence(o),
          }),
        );

        return capped(alerts, {
          id: "sales.order.due-today.more",
          title: (total) =>`${total} orders are promised for today`,
          body: `The ${ALERT_CAP} largest by value are listed above. The orders screen shows every one of them with its promised date.`,
          href: "/sales/orders",
        });
      },
    },
    {
      /**
       * STOPPED AT OUR END.
       *
       * The credit gate is a control, not a suggestion — an order it has held does not reach
       * planning, is not made and cannot ship, and the only person who can move it is
       * somebody in this building holding `sales.order.confirm`. That is a different fact
       * from a late order and it gets its own line, EXCEPT where the order is already late:
       * there the overdue alert above carries the credit reason in its body, so one order
       * does not produce two rows saying overlapping things.
       */
      permission: "sales.order.read",
      path: "/sales/orders",
      query: { limit: 100 },
      reduce: (data) => {
        const rows = orderFacts(data);
        if (rows === null) return [];
        const held = rows
          .filter(isNameable)
          .filter(isOpen)
          .filter((o) => o.creditStatus === "hold" || o.status === "credit_hold")
          // Already reported, with the hold named in its body.
          .filter((o) => !isPastDue(o.requestedDeliveryDate))
          .sort((a, b) => (a.orderDate ?? "").localeCompare(b.orderDate ?? ""));

        const alerts = held.map((o): ModuleAlert => {
          const promise = o.requestedDeliveryDate
            ? `It is promised ${date(o.requestedDeliveryDate)} — ${relativeDays(o.requestedDeliveryDate)}.`
            : "No delivery date was promised on it.";
          return {
            id: `sales.order.credit-hold.${o.soNo}`,
            severity: "urgent",
            title: `${o.soNo} is held by the credit gate`,
            body: `${inrShort(Number(o.grandTotal))} for ${who(o)} cannot be confirmed, planned or made until somebody clears or overrides the hold. ${promise}`,
            href: `/sales/order/${o.id}`,
            // When we took the order — the clock that has been running on this one.
            at: o.orderDate ?? undefined,
            evidence: orderEvidence(o),
          };
        });

        return capped(alerts, {
          id: "sales.order.credit-hold.more",
          title: (total) =>`${total} orders are sitting on credit hold`,
          body: `The ${ALERT_CAP} oldest are listed above. Every one of them is revenue this plant has agreed to and cannot yet start.`,
          href: "/sales/orders",
        });
      },
    },
  ],
};
