import type { ModuleManifest, SignalValue } from "@spine/registry/manifest";
import { num, qty } from "@spine/format";
import { outstanding } from "./api";

/**
 * PRODUCTION (KILN, Module 05).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles, runs, and has one fewer item in
 * the sidebar.
 *
 * `order` is hidden: it is the work order opened by clicking a row, routable at
 * `/production/order/<id>` but never a sidebar entry of its own.
 */
export const productionManifest: ModuleManifest = {
  key: "production",
  name: "Production",
  summary: "Work orders on the floor, and the components each one consumes.",
  department: "KILN",
  icon: "Factory",
  licenceKey: "production",
  order: 45,
  nav: [
    {
      label: "Work orders",
      path: "orders",
      permission: "production.order.read",
      icon: "Hammer",
      description:
        "Every order the plant has been told to make, with how much of it has actually come off the line. Recording output here does NOT move stock — Inventory owns the only path stock can move through, and a supervisor who believes otherwise will count the same parts twice. Quantities change when components are issued or finished goods are received, never by typing a number on this screen.",
    },
    {
      label: "Work order",
      path: "order",
      permission: "production.order.read",
      icon: "Hammer",
      hidden: true,
    },
  ],
  screens: {
    orders: () => import("./screens/orders"),
    order: () => import("./screens/order"),
  },
  /**
   * TWO FIGURES, AND NEITHER OF THEM IS "LATE".
   *
   * A production order in this schema carries a raised date and nothing else — no promised
   * date, no due date. The order screens already refuse to imply lateness for that reason,
   * and a dashboard tile is not a loophole in that refusal: "open" here means not finished,
   * which is a fact, and no tile turns it into a judgement the data cannot support.
   *
   * Both read the same list the Work orders screen reads, capped at the 100 the endpoint
   * allows in one page. The hint says when there are more, because a count that is silently
   * a partial count is the kind of number people plan against once and never trust again.
   */
  signals: [
    {
      label: "Work orders open",
      permission: "production.order.read",
      path: "/production/orders",
      query: { limit: 100 },
      reduce: (data) => reduceOpenOrders(data),
    },
    {
      label: "Still to make",
      permission: "production.order.read",
      path: "/production/orders",
      query: { limit: 100 },
      reduce: (data) => reduceOutstandingQty(data),
    },
  ],
};

/* ------------------------------ the reducers ------------------------------- */

/**
 * The shape a tile needs off a work order — deliberately smaller than `ProductionOrderRow`.
 * A signal reads `unknown` off the wire, so it narrows to the four fields it actually uses
 * and returns null on anything else rather than trusting a type assertion.
 */
interface OrderFigures {
  status: string;
  qtyToProduce: string;
  producedQty: string;
  uom: string | null;
}

interface OrderPage {
  rows: OrderFigures[];
  /** The endpoint said there is another page — so every count here is a floor, not a total. */
  truncated: boolean;
}

function readOrders(data: unknown): OrderPage | null {
  if (typeof data !== "object" || data === null) return null;
  const envelope = data as { items?: unknown; nextCursor?: unknown };
  // `{items, nextCursor}` is what this endpoint answers; a bare array is accepted too, so an
  // envelope change does not silently blank the tile. Anything else is not readable here.
  const raw: unknown[] | null = Array.isArray(data)
    ? data
    : Array.isArray(envelope.items)
      ? envelope.items
      : null;
  if (raw === null) return null;

  const rows: OrderFigures[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const r = entry as Record<string, unknown>;
    if (typeof r.status !== "string") return null;
    rows.push({
      status: r.status,
      qtyToProduce: typeof r.qtyToProduce === "string" ? r.qtyToProduce : "0",
      producedQty: typeof r.producedQty === "string" ? r.producedQty : "0",
      uom: typeof r.uom === "string" ? r.uom : null,
    });
  }
  return { rows, truncated: typeof envelope.nextCursor === "string" };
}

/** Not finished, out of what is on the list. "Not finished" is the only claim being made. */
function reduceOpenOrders(data: unknown): SignalValue | null {
  const page = readOrders(data);
  if (page === null) return null;
  const open = page.rows.filter((r) => r.status !== "completed").length;
  const total = page.rows.length;
  if (total === 0) return { value: "0", hint: "no work orders raised yet", tone: "neutral" };
  return {
    value: num(open),
    hint: page.truncated
      ? `not finished, of the first ${num(total)} orders`
      : `not finished, of ${num(total)} orders`,
    tone: "neutral",
    fraction: open / total,
  };
}

/**
 * How much is still to come off the line, WITH ITS UNIT.
 *
 * Quantities are grouped by unit of measure and only one group is shown, because 400 nos of
 * castings and 90 kg of bar stock do not add up to 490 of anything. The hint says when
 * another unit was left out, so the figure is never quietly a partial one.
 */
function reduceOutstandingQty(data: unknown): SignalValue | null {
  const page = readOrders(data);
  if (page === null) return null;

  const byUom = new Map<string, { qty: number; orders: number }>();
  let unitUnknown = 0;
  for (const r of page.rows) {
    if (r.status === "completed") continue;
    const left = outstanding(r.qtyToProduce, r.producedQty);
    if (left <= 0) continue;
    if (r.uom === null) {
      unitUnknown += 1;
      continue;
    }
    const group = byUom.get(r.uom) ?? { qty: 0, orders: 0 };
    byUom.set(r.uom, { qty: group.qty + left, orders: group.orders + 1 });
  }

  if (byUom.size === 0) {
    // Nothing left to make, or nothing to say. A quantity with no unit behind it is the one
    // thing this tile will not print, so an item master that named no unit drops the tile.
    if (unitUnknown > 0) return null;
    if (page.rows.length === 0) {
      return { value: "0", hint: "no work orders raised yet", tone: "neutral" };
    }
    return { value: "0", hint: "every work order on the list is finished", tone: "ok" };
  }

  // The unit that the most orders are measured in — largest quantity breaks a tie.
  const [top] = [...byUom.entries()].sort(
    (a, b) => b[1].orders - a[1].orders || b[1].qty - a[1].qty || a[0].localeCompare(b[0]),
  );
  if (!top) return null;
  const [uom, group] = top;

  const others: string[] = [];
  if (byUom.size > 1) others.push("other units counted separately");
  if (unitUnknown > 0) others.push(`${num(unitUnknown)} with no unit on the item master`);

  return {
    value: qty(group.qty, uom),
    hint:
      others.length > 0
        ? `across ${num(group.orders)} open orders · ${others.join(" · ")}`
        : `across ${num(group.orders)} open orders`,
    tone: "neutral",
  };
}
