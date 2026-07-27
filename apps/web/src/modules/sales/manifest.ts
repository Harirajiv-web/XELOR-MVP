import type { ModuleManifest } from "@spine/registry/manifest";
import { humanise, inrShort } from "@spine/format";
import { isPastDue, sumAmounts } from "./api";

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

/** Only what the tiles actually read, so nothing here depends on a field it does not use. */
interface OrderFact {
  status: string;
  requestedDeliveryDate: string | null;
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
      status: row.status,
      requestedDeliveryDate:
        typeof row.requestedDeliveryDate === "string" ? row.requestedDeliveryDate : null,
      grandTotal: typeof row.grandTotal === "string" ? row.grandTotal : "0",
    });
  }
  return out;
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
};
