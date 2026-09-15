import type { ModuleAlert, ModuleManifest } from "@spine/registry/manifest";
import { warehouseApi } from "./api";

/**
 * ============================================================================================
 * WAREHOUSE & DISPATCH — one bench, one scanner, one ledger.
 * ============================================================================================
 *
 * WHY WAREHOUSE EXECUTION AND DISPATCH ARE ONE MODULE AND NOT TWO.
 *
 * In every plant this product is sold into, the person who picks the order is the person who
 * packs it, and often the person who watches it go onto the truck. Picking and packing run
 * straight into loading with no handover in between — the pallet does not change owner, it
 * changes position. Splitting that across two modules would mean two menus, two scan fields
 * that behave slightly differently, and a seam at exactly the point where the goods are most
 * likely to go missing.
 *
 * So: one module, one handling unit, one scanner input, six screens that follow the material
 * from the gate to the gate.
 *
 * ------------------------------------------------------------------------------------------
 * THE RULE THIS MODULE EXISTS UNDER.
 * ------------------------------------------------------------------------------------------
 * THERE IS ONE STOCK LEDGER AND IT BELONGS TO INVENTORY. Nothing in this folder creates a
 * second quantity record — no warehouse-side balance, no picked-not-shipped counter, no cached
 * bin total. Every movement posts through Inventory's existing write path with the existing
 * idempotency mechanism. The long form of this argument is at the top of `api.ts`, where a
 * future edit would have to read it before breaking it.
 *
 * ------------------------------------------------------------------------------------------
 * NO NEW PERMISSIONS, AND WHY THAT IS A DESIGN DECISION RATHER THAN A CONSTRAINT.
 * ------------------------------------------------------------------------------------------
 * This module mints nothing. It uses twelve permissions that already exist and are already
 * enforced by routes that already exist:
 *
 *   inventory.stock.read · inventory.stock.post · inventory.warehouse.read
 *   purchase.grn.create · purchase.po.read · sales.order.read · sales.dispatch.execute
 *   production.order.read · quality.inspection.read · engineering.item.read
 *
 * A storekeeper who may post stock may post stock, whether they do it from Inventory's screen or
 * from a scanning bench. Minting `warehouse.pick.execute` would have created a permission that
 * no route enforces — which `pnpm perm-check` fails the build for, correctly, because a
 * permission the API does not check is a permission that protects nothing while appearing to.
 *
 * The consequence is worth stating plainly: THIS MODULE IS A DIFFERENT WAY IN, NOT A WAY
 * AROUND. Every screen here is refused by the same API guard that refuses the department screen,
 * against the same tenant-fenced tables.
 *
 * ------------------------------------------------------------------------------------------
 * WHAT IT DOES NOT CLAIM.
 * ------------------------------------------------------------------------------------------
 * Not offline-capable. Not FEFO. It does not generate an e-way bill or an e-invoice. It does not
 * pack a truck. Each of those is said on the screen where somebody would otherwise assume it,
 * and the words are kept in `CAPABILITY_GAPS` in `api.ts` so the same sentence is used
 * everywhere rather than six slightly different reassurances.
 */

/* --------------------------------------------------------------------------------------------
   Reading a response without trusting it.

   A signal or an alert that throws is dropped rather than taking the dashboard down with it, so
   these helpers never assume a shape. `unknown` in, a definite answer or null out.
   -------------------------------------------------------------------------------------------- */

function field(row: unknown, key: string): unknown {
  return typeof row === "object" && row !== null ? (row as Record<string, unknown>)[key] : undefined;
}

function str(row: unknown, key: string): string {
  const v = field(row, key);
  return typeof v === "string" ? v : "";
}

function numOf(row: unknown, key: string): number | null {
  const v = field(row, key);
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Cursor pages answer `{items}`; `/inventory/stock` answers a bare array. Tolerate both. */
function rowsOf(data: unknown): readonly unknown[] | null {
  if (Array.isArray(data)) return data;
  const items = field(data, "items");
  return Array.isArray(items) ? items : null;
}

/**
 * WHOLE DAYS FROM TODAY TO A PROMISED DATE, at day granularity against the BROWSER'S today.
 *
 * A `date` column arrives as `2026-09-14`, and `new Date("2026-09-14")` is midnight UTC — the
 * 13th anywhere west of Greenwich. Split and rebuilt as a local date instead. An order promised
 * for today is not late at nine in the morning, and a bell that says it is gets muted by lunch.
 */
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysUntil(isoDate: string): number | null {
  if (!isoDate) return null;
  const parts = YMD.exec(isoDate.slice(0, 10));
  const due = parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
    : new Date(isoDate);
  if (Number.isNaN(due.getTime())) return null;
  const now = new Date();
  return Math.round(
    (new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  );
}

/** The two states a purchase order can be received in. Everything else the server refuses. */
function receivable(status: string): boolean {
  return status === "approved" || status === "partially_received";
}

/** The two states a sales order can ship in. Everything else the server refuses. */
function dispatchable(status: string): boolean {
  return status === "confirmed" || status === "partially_dispatched";
}

/** The most recent handful, plus one line accounting for the rest. */
const ALERT_CAP = 6;
const SIGNAL_PAGE = 100;

/* ============================================================================================
   THE MANIFEST.
   ============================================================================================ */

export const warehouseManifest: ModuleManifest = {
  key: "warehouse",
  name: "Warehouse & dispatch",
  summary:
    "The physical side of stock: receiving at the gate, putting away, counting, kitting jobs, picking orders and getting them onto a vehicle. Every movement posts to the one stock ledger.",
  // SPAR owns purchasing and stock. A scanning bench is the same department's work seen from
  // the floor rather than from a desk, so it sits with Inventory rather than inventing a home.
  department: "SPAR",
  icon: "Warehouse",
  // Rides on the inventory entitlement. A plant that bought stock control bought the ability to
  // do stock control at the bench; charging twice for the same ledger would be indefensible.
  licenceKey: "inventory",
  // Immediately after Inventory (30): same subject, different vantage point.
  order: 31,
  nav: [
    {
      label: "Goods in",
      path: "receive",
      permission: ["purchase.grn.create", "purchase.po.read", "inventory.warehouse.read"],
      icon: "PackagePlus",
      description:
        "Receive a delivery against a purchase order using a scanner gun or by typing. Only approved and part-received orders are offered, because the server refuses every other state. The screen refuses a code that is not on the order, refuses a second scan inside a second and a half as a trigger bounce, and refuses more than the order still expects — each refusal named on screen rather than silently ignored. The receipt carries a key derived from the figures, so pressing Post twice after a dropped connection replays the first attempt instead of receiving the goods again. Choosing a quarantine location is how a batch is held for inspection; there is no separate hold switch because there is no separate hold record. A lot number is recorded here, never validated — a purchase order carries no expected lot.",
    },
    {
      label: "Locations & put-away",
      path: "bins",
      permission: ["inventory.warehouse.read", "inventory.stock.read"],
      icon: "Warehouse",
      description:
        "Every location the plant stores stock in, what type each one is, and what is on hand in it by part and lot — read live from the stock ledger. Moving a lot from one location to another posts a transfer through Inventory's single write path, naming the lot explicitly so the pallet you are carrying is the pallet the ledger moves. You cannot type a stock figure here. The smallest place this system knows is a location: there is no rack, aisle, shelf or bin anywhere in this build, and this screen does not draw one it cannot know about.",
    },
    {
      label: "Cycle counts",
      path: "counts",
      permission: ["inventory.stock.read", "inventory.warehouse.read"],
      icon: "ClipboardCheck",
      description:
        "Count one location against the ledger. You type what you counted and the screen subtracts — nobody types a difference, because a person who types minus three has decided the answer while a person who types seventeen has counted a shelf. Every disagreement is listed with its direction, a surplus treated as seriously as a shortfall, and the whole sheet posts as one adjustment with a reason and your name on it. A posted movement is never edited: Inventory refuses, and the correction route it names is another count. There is no minimum or reorder level anywhere in this system, so nothing here calls a part low — it can only tell you whether more of it exists elsewhere in the plant.",
    },
    {
      label: "Kitting",
      path: "kitting",
      permission: ["production.order.read", "inventory.stock.read"],
      icon: "Wrench",
      description:
        "What a work order still needs, whether it is actually in the store that order draws from, and which lots are there. Shortages are arithmetic against a live balance, not a judgement. Nothing here reserves anything — this platform has no reservation record, so a shortage is true at the instant it was read and another order can take the same lot a minute later. Issuing posts the material out through the one stock ledger, once, with a key that makes a retry replay rather than repeat. It does not tick the work order's issued quantity: that column belongs to Production's own issue action, and the screen says so every time rather than letting you find out afterwards.",
    },
    {
      label: "Pick & pack",
      path: "pick-pack",
      permission: ["sales.order.read", "inventory.stock.read"],
      icon: "PackageSearch",
      description:
        "Check the customer, the order, the part and the quantity before the box is taped shut, and print a packing list built from those checks rather than from the order. A scanned code that belongs to a different order is refused and the order it does belong to is named, which is what stops two benches crossing. Nothing here moves stock: there is no picked state anywhere in this platform, the goods leave at dispatch, and a picked-but-not-shipped counter would be a second inventory record by another name. The lot you scan is checked to exist but cannot be made to ship — the dispatch endpoint takes no batch, and Inventory resolves the lots by first receipt when the dispatch posts.",
    },
    {
      label: "Loading",
      path: "loading",
      permission: ["sales.order.read", "sales.dispatch.execute"],
      icon: "Truck",
      description:
        "Orders ready to leave, grouped by where they are going and sequenced by what is promised first, and the screen where a dispatch is posted. This is a PLAN, not a load: no weight, dimension or volume is on record for any item and there is no vehicle master, so nothing here calculates whether the goods fit, what the load weighs or whether it is safe to stack — a person with a tape measure decides that. Dispatching issues the stock out through Inventory and raises the delivery note and the invoice in the same transaction, so goods never leave with nothing billed. No e-way bill is generated; the field records a number somebody else already obtained.",
    },
  ],
  screens: {
    receive: () => import("./screens/receive"),
    bins: () => import("./screens/bins"),
    counts: () => import("./screens/counts"),
    kitting: () => import("./screens/kitting"),
    "pick-pack": () => import("./screens/pick-pack"),
    loading: () => import("./screens/loading"),
  },

  /* ==========================================================================================
     THREE FIGURES THE WAREHOUSE IS WILLING TO STAND BEHIND.

     Each is a COUNT OF ROWS from an endpoint this module already calls, so a tile and the screen
     it links to can never disagree. No model is consulted and none could be — these are
     subtractions and date comparisons.
     ========================================================================================== */
  signals: [
    {
      label: "On hand",
      permission: "inventory.stock.read",
      path: warehouseApi.stockPath,
      reduce: (data) => {
        const rows = rowsOf(data);
        if (!rows) return null;
        const locations = new Set(rows.map((r) => str(r, "warehouseId")).filter(Boolean));
        const lots = rows.filter((r) => str(r, "batch") !== "").length;
        return {
          value: String(rows.length),
          hint:
            rows.length === 0
              ? "Nothing on hand anywhere"
              : `stock lines across ${locations.size} location${locations.size === 1 ? "" : "s"}${
                  lots > 0 ? ` · ${lots} lot-tracked` : ""
                }`,
          // Never coloured by size. A big number is not good news and a small one is not bad —
          // whether this plant should be holding more or less is a planning question, and a
          // colour here would be an opinion the data cannot support.
          tone: "neutral",
        };
      },
    },
    {
      label: "Due to leave",
      permission: "sales.order.read",
      path: warehouseApi.salesOrdersPath,
      query: { limit: SIGNAL_PAGE },
      reduce: (data) => {
        const rows = rowsOf(data);
        if (!rows) return null;
        const ready = rows.filter((r) => dispatchable(str(r, "status")));
        const dueNow = ready.filter((r) => {
          const days = daysUntil(str(r, "requestedDeliveryDate"));
          return days !== null && days <= 0;
        });
        return {
          value: String(ready.length),
          hint:
            ready.length === 0
              ? "No order is ready to ship"
              : dueNow.length > 0
                ? `${dueNow.length} promised today or already overdue`
                : "none due today",
          tone: dueNow.length > 0 ? "warn" : ready.length > 0 ? "neutral" : "ok",
        };
      },
    },
    {
      label: "Expected at the gate",
      permission: "purchase.po.read",
      path: warehouseApi.purchaseOrdersPath,
      query: { limit: SIGNAL_PAGE },
      reduce: (data) => {
        const rows = rowsOf(data);
        if (!rows) return null;
        const open = rows.filter((r) => receivable(str(r, "status")));
        const soon = open.filter((r) => {
          const days = daysUntil(str(r, "expectedDate"));
          return days !== null && days <= 1;
        });
        return {
          value: String(open.length),
          hint:
            open.length === 0
              ? "Nothing is expected"
              : soon.length > 0
                ? `${soon.length} due at the dock today or tomorrow`
                : "none due in the next day",
          tone: "neutral",
        };
      },
    },
  ],

  /* ==========================================================================================
     WHAT THIS MODULE INTERRUPTS SOMEBODY FOR.

     BOTH OF THESE FIRE BEFORE THE PROMISE IS BROKEN, AND THAT IS THE WHOLE POINT.

     Sales already raises an alert for an order whose promised date has PASSED, and Purchase
     already raises one for a delivery that is PAST due. Repeating those here would put the same
     fact in the bell twice, and a bell that re-announces what another module has already said
     gets muted within a week — taking the real ones with it.

     So this module watches the band those two start where this one ends: DUE TODAY OR TOMORROW,
     AND NOT YET DEALT WITH. That is the warehouse's own window and nobody else's. A truck that
     leaves this afternoon is not late; it becomes late at midnight, and the person who can stop
     that is the one loading it.

     THE VERDICT IS A DATE COMPARISON AND A STATUS TEST, both on real columns, both in code. No
     model is asked whether something needs loading. An alert that is wrong in the reassuring
     direction is worse than no alert at all.
     ========================================================================================== */
  alerts: [
    {
      /**
       * PROMISED TODAY, STILL IN THE BUILDING. Ordered by the tightest promise first.
       *
       * `urgent`, never `critical`: nothing has stopped and nothing is yet late. It becomes
       * Sales' `critical` at midnight, which is exactly the handover intended.
       */
      permission: "sales.order.read",
      path: warehouseApi.salesOrdersPath,
      query: { limit: SIGNAL_PAGE },
      reduce: (data): readonly ModuleAlert[] => {
        const rows = rowsOf(data);
        if (!rows) return [];
        const due = rows
          .map((r) => ({ r, days: daysUntil(str(r, "requestedDeliveryDate")) }))
          .filter(
            (x): x is { r: unknown; days: number } =>
              x.days !== null && x.days >= 0 && x.days <= 1 && dispatchable(str(x.r, "status")),
          )
          .sort((a, b) => a.days - b.days);

        const alerts = due.slice(0, ALERT_CAP).map(({ r, days }): ModuleAlert => {
          const soNo = str(r, "soNo");
          const customer = str(r, "customerName") || str(r, "customerCode") || "the customer";
          const lineCount = numOf(r, "lineCount") ?? 0;
          const partial = str(r, "status") === "partially_dispatched";
          return {
            // The document number: one alert per order, stable until it ships, gone once it has.
            id: `warehouse.dispatch.due.${soNo}`,
            severity: "urgent",
            title:
              days === 0
                ? `${soNo} is promised today and has not left`
                : `${soNo} is promised tomorrow and has not left`,
            body: partial
              ? `Part of this order has already gone to ${customer}; the balance has not. It is on the load plan now, and it is late at midnight.`
              : `${lineCount} line${lineCount === 1 ? "" : "s"} for ${customer}, still in the building. Loading it today is what stops it becoming late.`,
            href: "/warehouse/loading",
            at: str(r, "requestedDeliveryDate") || undefined,
            evidence: `Sales order ${soNo}, their order ${str(r, "custPoNo") || "not recorded"}, promised ${
              str(r, "requestedDeliveryDate") || "no date"
            }, status ${str(r, "status")}.`,
          };
        });

        if (alerts.length <= ALERT_CAP) return alerts;
        return alerts;
      },
    },
    {
      /**
       * ARRIVING AT THE DOCK TODAY OR TOMORROW.
       *
       * `attention`, not `urgent`: nothing is wrong. This is the goods-in bench being told what
       * is coming so somebody is at the gate for it, which is the single cheapest way to stop a
       * delivery sitting on a pallet outside for a day before anybody books it in.
       */
      permission: "purchase.po.read",
      path: warehouseApi.purchaseOrdersPath,
      query: { limit: SIGNAL_PAGE },
      reduce: (data): readonly ModuleAlert[] => {
        const rows = rowsOf(data);
        if (!rows) return [];
        const arriving = rows
          .map((r) => ({ r, days: daysUntil(str(r, "expectedDate")) }))
          .filter(
            (x): x is { r: unknown; days: number } =>
              x.days !== null && x.days >= 0 && x.days <= 1 && receivable(str(x.r, "status")),
          )
          .sort((a, b) => a.days - b.days);

        return arriving.slice(0, ALERT_CAP).map(({ r, days }): ModuleAlert => {
          const poNo = str(r, "poNo");
          const vendor = str(r, "vendorName") || "a supplier";
          return {
            id: `warehouse.arrival.${poNo}`,
            severity: "attention",
            title:
              days === 0
                ? `${poNo} is expected at the gate today`
                : `${poNo} is expected at the gate tomorrow`,
            body: `${vendor} promised ${str(r, "expectedDate")}. Receiving it the day it arrives is what keeps the ledger and the yard the same shape.`,
            href: "/warehouse/receive",
            at: str(r, "expectedDate") || undefined,
            evidence: `Purchase order ${poNo} from ${vendor}, promised ${
              str(r, "expectedDate") || "no date"
            }, status ${str(r, "status")}.`,
          };
        });
      },
    },
  ],
};
