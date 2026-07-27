import type { ModuleAlert, ModuleManifest, SignalValue } from "@spine/registry/manifest";
import { qty as fmtQty } from "@spine/format";
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

/* ======================================================================================
   WHAT INVENTORY WATCHES FOR.

   One watch, and it is the defect this module already knows it has rather than a number
   dressed up as a warning.

   WHAT IS DELIBERATELY NOT HERE, and why, because the absence is the more useful fact:

   - NO "BELOW REORDER LEVEL" ALERT. There is no endpoint that can answer it. The reorder
     point lives in PLANNING's `planning_policy` table and is served by `/planning/policies`
     under `planning.policy.read`; on-hand lives here and is served by `/inventory/stock`.
     A `ModuleAlertSource` fetches ONE path, so the comparison would have to be assembled in
     the browser out of two responses the viewer may not both be allowed to read — and the
     shapes do not even line up, because a reorder point is per item while a balance row is
     per (item, warehouse, batch). Adding warehouse rows together to get a plant total is
     arithmetic this module refuses to do in a browser. The fix is a server-side endpoint
     inside Inventory that returns on-hand and the reorder point on the same row; until that
     exists, no alert. A low-stock warning computed from parts that were never meant to be
     added is worse than no low-stock warning, because it will be believed.

   - NO "NEGATIVE STOCK" ALERT. It cannot happen. `InventoryService.applyMovement` locks the
     balance row FOR UPDATE and throws INSUFFICIENT_STOCK before it would go below zero, so
     a watch for it would be a permanently silent bell dressed up as vigilance.

   - NO "NOT COUNTED RECENTLY" ALERT. Physical count and reconciliation are not built yet;
     there is no count date on any row to compare against.
   ====================================================================================== */

/** Eight is what a person will read. Past that, one honest line saying how many more. */
const ALERT_CAP = 8;

/** The fields the watch below reads off a stock row. Nothing else is touched. */
interface StockAlertRow {
  itemCode: string;
  itemName: string;
  uom: string;
  warehouseCode: string;
  warehouseName: string;
  batch: string;
  qty: number;
}

/**
 * Narrow, skipping rather than failing.
 *
 * A signal returns null on an unexpected shape because a wrong tile is a wrong headline. A
 * watch is different: one malformed row must not silence the other seven, so a row that
 * does not narrow is dropped and the rest are still read.
 */
function stockAlertRows(data: unknown): readonly StockAlertRow[] {
  const raw = asArray(data);
  if (!raw) return [];
  const rows: StockAlertRow[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    if (typeof r.itemCode !== "string" || typeof r.warehouseCode !== "string") continue;
    const n = Number(r.qty);
    if (!Number.isFinite(n)) continue;
    rows.push({
      itemCode: r.itemCode,
      itemName: typeof r.itemName === "string" ? r.itemName : r.itemCode,
      uom: typeof r.uom === "string" ? r.uom : "",
      warehouseCode: r.warehouseCode,
      warehouseName: typeof r.warehouseName === "string" ? r.warehouseName : r.warehouseCode,
      batch: typeof r.batch === "string" ? r.batch.trim() : "",
      qty: n,
    });
  }
  return rows;
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
      description:
        "What is physically on hand, one line per item, warehouse and batch, added up from the stock ledger — every figure is the sum of posted movements. You cannot type a stock figure here; stock only moves through a receipt, an issue or a transfer. Items with a zero balance are not listed.",
    },
    {
      label: "Warehouses",
      path: "warehouses",
      permission: "inventory.warehouse.read",
      icon: "Warehouse",
      description:
        "Every storage location stock is allowed to sit in, with its code, name and type, read from the warehouse master. Active locations only, and no quantities — this screen says where stock may be kept, not what is in it.",
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
  alerts: [
    /*
     * STOCK THAT IS ON THE SHELF AND CANNOT BE ISSUED.
     *
     * THE VERDICT IS A STRING TEST AND A COMPARISON, both on real columns of
     * `GET /inventory/stock`: `batch` is not empty, and `qty` is greater than zero. Nothing
     * is inferred and no model is asked anything.
     *
     * WHY IT MATTERS, read off the backend rather than assumed. A stock balance is keyed on
     * (item, warehouse, batch) — `applyMovement` in `inventory.service.ts` locks exactly that
     * row. A goods receipt carries the vendor's batch code onto the movement, so batched
     * material creates its own balance row. A production issue does not: `issueComponents` in
     * `production.service.ts` builds its lines with `{itemId, fromWarehouseId, qty}` and no
     * batch at all, which the poster turns into `batch = ""`. So the issue draws on the
     * unbatched row, finds it empty, and is refused with INSUFFICIENT_STOCK while the
     * material sits on the shelf. That is a real open defect, and it is the kind that is only
     * ever discovered at the moment somebody needs the material.
     *
     * `at` is deliberately ABSENT. A balance row carries no timestamp — it is a running
     * total, not an event — and inventing one from the poll would make the panel re-announce
     * the same pallet every ninety seconds.
     */
    {
      permission: "inventory.stock.read",
      path: inventoryApi.stockPath,
      reduce: (data: unknown): readonly ModuleAlert[] => {
        const stranded = stockAlertRows(data)
          .filter((r) => r.batch !== "" && r.qty > 0)
          // Largest quantity first: if only eight can be shown, the eight biggest piles of
          // unreachable material are the eight worth showing.
          .sort((a, b) => b.qty - a.qty);
        if (stranded.length === 0) return [];

        const shown: ModuleAlert[] = stranded.slice(0, ALERT_CAP).map((r) => ({
          // Stable for as long as that batch sits in that warehouse — the three things that
          // identify the balance row, and never the quantity, which changes on every receipt.
          id: `inventory.batch.stranded:${r.itemCode}:${r.warehouseCode}:${r.batch}`,
          severity: "attention" as const,
          title: `${fmtQty(r.qty, r.uom)} of ${r.itemCode} in ${r.warehouseCode} is held under batch ${r.batch}.`,
          body: "A production issue draws on the unbatched balance of an item, so this quantity cannot be issued to a work order as it stands, even though it is physically on the shelf.",
          href: "/inventory/stock",
          evidence: `Stock balance · ${r.itemCode} ${r.itemName} · ${r.warehouseName} (${r.warehouseCode}) · batch ${r.batch} · ${fmtQty(r.qty, r.uom)}.`,
        }));

        // Never truncated silently. A watch that quietly shows eight of thirty has told the
        // reader something false about the size of the problem.
        if (stranded.length > ALERT_CAP) {
          shown.push({
            id: "inventory.batch.stranded:more",
            severity: "attention",
            title: `${stranded.length} batched stock balances cannot be issued to production — the ${ALERT_CAP} largest are listed above.`,
            body: "Every one of them is material that is on the shelf and unreachable from a work order until the issue path is given the batch.",
            href: "/inventory/stock",
            evidence: `Counted over ${stranded.length} stock balance rows with a batch code and a quantity above zero.`,
          });
        }
        return shown;
      },
    },
  ],
};
