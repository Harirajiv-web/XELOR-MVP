import type { ModuleManifest, SignalValue } from "@spine/registry/manifest";
import { inventoryApi } from "./api";

/* --------------------------------------------------------------------------------------
   THE FIGURES THIS MODULE IS WILLING TO PUT ON A DASHBOARD.

   Two rules govern everything below, and both are about honesty rather than tidiness.

   1. NO VALUE IS TOTALLED ACROSS UNITS. `GET /inventory/stock` returns a quantity and a
      unit per line — kilograms, litres, numbers, metres. Adding those together produces a
      figure that looks authoritative and means nothing, and a dashboard is precisely where
      somebody would quote it. The endpoint returns no valuation, so no rupee figure appears
      here at all. What IS countable is lines, items and warehouses, so that is what is shown.

   2. EVERY `reduce` ASSUMES NOTHING. It is handed `unknown` and narrows its way to the two
      or three fields it uses, returning null the moment the shape is not what it expects.
      A null drops the tile silently, which is the correct outcome: a decorative figure must
      never be able to break the page it decorates.
   -------------------------------------------------------------------------------------- */

/** The fields the tiles below actually read off a stock row. Nothing else is touched. */
interface StockLite {
  itemId: string;
  warehouseCode: string;
}

/** A bare array, a `{items}` page or a `{data}` wrapper — anything else is not our shape. */
function asArray(data: unknown): readonly unknown[] | null {
  if (Array.isArray(data)) return data;
  if (data !== null && typeof data === "object") {
    const bag = data as { items?: unknown; data?: unknown };
    if (Array.isArray(bag.items)) return bag.items;
    if (Array.isArray(bag.data)) return bag.data;
  }
  return null;
}

function stockRows(data: unknown): StockLite[] | null {
  const raw = asArray(data);
  if (!raw) return null;
  const rows: StockLite[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") return null;
    const row = entry as Record<string, unknown>;
    if (typeof row.itemId !== "string" || typeof row.warehouseCode !== "string") return null;
    rows.push({ itemId: row.itemId, warehouseCode: row.warehouseCode });
  }
  return rows;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * INVENTORY (SPAR, Module 03).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles, runs, and has one fewer item in
 * the sidebar — no route file to clean up, no navigation array to edit, no import left
 * dangling anywhere else.
 */
export const inventoryManifest: ModuleManifest = {
  key: "inventory",
  name: "Inventory",
  summary: "Stock balances and the ledger of every movement that produced them.",
  department: "SPAR",
  icon: "Boxes",
  licenceKey: "inventory",
  order: 30,
  nav: [
    {
      label: "Stock on hand",
      path: "stock",
      permission: "inventory.stock.read",
      icon: "Boxes",
    },
    {
      label: "Warehouses",
      path: "warehouses",
      permission: "inventory.warehouse.read",
      icon: "Warehouse",
    },
  ],
  screens: {
    stock: () => import("./screens/stock"),
    warehouses: () => import("./screens/warehouses"),
  },
  signals: [
    /*
     * HOW MUCH IS ON HAND, COUNTED THE ONLY WAY IT CAN HONESTLY BE COUNTED.
     *
     * A "stock line" is one (item, warehouse, batch) balance that is not zero — the row the
     * Stock on hand screen draws. Counting lines, items and warehouses says something true
     * about the size of the balance sheet without ever adding a kilogram to a litre.
     */
    {
      label: "Stock lines",
      permission: "inventory.stock.read",
      path: inventoryApi.stockPath,
      reduce: (data: unknown): SignalValue | null => {
        const rows = stockRows(data);
        if (!rows) return null;
        if (rows.length === 0) {
          return { value: "0", hint: "Nothing on hand in any warehouse", tone: "neutral" };
        }
        const items = new Set(rows.map((r) => r.itemId)).size;
        const warehouses = new Set(rows.map((r) => r.warehouseCode)).size;
        return {
          value: String(rows.length),
          hint: `${plural(items, "item", "items")} in ${plural(warehouses, "warehouse", "warehouses")}`,
          tone: "neutral",
        };
      },
    },
    /* Where stock is allowed to be. Read from the warehouse master, not inferred from balances. */
    {
      label: "Warehouses",
      permission: "inventory.warehouse.read",
      path: inventoryApi.warehousesPath,
      reduce: (data: unknown): SignalValue | null => {
        const raw = asArray(data);
        if (!raw) return null;
        const types = new Set<string>();
        for (const entry of raw) {
          if (entry === null || typeof entry !== "object") return null;
          const row = entry as Record<string, unknown>;
          if (typeof row.code !== "string") return null;
          if (typeof row.warehouseType === "string") types.add(row.warehouseType);
        }
        return {
          value: String(raw.length),
          hint:
            types.size > 0
              ? `${plural(types.size, "storage type", "storage types")} in use`
              : "Active storage locations",
          tone: "neutral",
        };
      },
    },
    /*
     * WHERE THE STOCK ACTUALLY SITS.
     *
     * Line counts per warehouse, not quantities — same reason as above. Dropped entirely
     * when only one warehouse holds anything, because a one-slice composition is a fact the
     * first tile already stated.
     */
    {
      label: "Stock by warehouse",
      permission: "inventory.stock.read",
      path: inventoryApi.stockPath,
      reduce: (data: unknown): SignalValue | null => {
        const rows = stockRows(data);
        if (!rows) return null;
        const byWarehouse = new Map<string, number>();
        for (const r of rows) {
          byWarehouse.set(r.warehouseCode, (byWarehouse.get(r.warehouseCode) ?? 0) + 1);
        }
        if (byWarehouse.size < 2) return null;
        const ranked = [...byWarehouse.entries()]
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value);
        // Capped so the chart stays readable, with the remainder kept rather than dropped —
        // a composition whose slices do not add up to its total is worse than no chart.
        const series =
          ranked.length > 5
            ? [
                ...ranked.slice(0, 4),
                {
                  label: `Other ${ranked.length - 4} warehouses`,
                  value: ranked.slice(4).reduce((n, d) => n + d.value, 0),
                },
              ]
            : ranked;
        return { value: String(rows.length), hint: "Stock lines", tone: "neutral", series };
      },
    },
  ],
};
