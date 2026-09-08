/**
 * WHERE PHASE 2 GETS ITS FACTS — the whole catalogue, in one file, named after our modules.
 *
 * Phase 1 is the ERP: Sales, Engineering, Inventory, Purchase, Production, Planning,
 * Quality, Accounts. It is the system of record and Phase 2 does not change it. Phase 2 is
 * the layer on top that reads Phase 1, works out what is true, recommends, asks, acts
 * through the owning module's own port, verifies and explains.
 *
 * This file is the seam between the two, written out as data so that a reader can answer
 * "where does this number come from?" without opening the mission engine. It holds three
 * lists and they are deliberately different kinds of thing:
 *
 *   1. `PHASE1_SOURCES`  — OUR modules. Real tables, read live, under RLS. `connected: true`
 *                          is a statement of fact about this repository, not a hope.
 *   2. `STANDIN_SOURCES` — the facts Phase 1 does not hold yet (supplier prices, work-centre
 *                          load). Every one of them is labelled where it surfaces, and the
 *                          mission tags the evidence `provenance: "seeded"` so the screen can
 *                          render it differently from a live read.
 *   3. `CONNECTOR_SHELF` — SAP, Tally, Odoo, Dynamics 365, MES/SCADA, Excel/CSV, REST,
 *                          Database. Every one is `connected: false`. They are on the shelf
 *                          because the same Phase 2 layer is designed to sit on somebody
 *                          else's Phase 1 — but NONE of them is wired to anything here, and
 *                          a demo that implied otherwise would be the one lie that makes
 *                          every true thing beside it worthless.
 *
 * WHY THIS IS A HAND-WRITTEN LIST AND NOT A PLUGIN REGISTRY. A generic connector framework
 * would let anyone add a source without touching this file, which sounds like an advantage
 * and is the opposite of what is wanted here: the point of Phase 2 today is that somebody
 * can be shown, in one screen, exactly which of their own records the machine read. Eight
 * concrete rows naming our own tables can be explained in a sentence. A registry of
 * abstract descriptors cannot.
 */

/* --------------------------------------------------------------- the contract -- */

/**
 * Where a single piece of data came from. Shared verbatim with the mission pipeline and
 * with the web client — one vocabulary, so a badge on screen cannot mean something the
 * server did not say.
 */
export type SourceKind =
  /** A real record read from OUR Phase 1 ERP module. */
  | "phase1-erp"
  /** An uploaded spreadsheet. */
  | "file"
  /** A stand-in for an external system that is NOT connected. */
  | "simulated-api"
  /** A human typed it. */
  | "user-input"
  /** Phase 2 computed it; no external system was involved. */
  | "phase2-derived";

/** One of our own Phase 1 modules, as Phase 2 reads it. */
export interface Phase1Source {
  /** Stable key. Used in pipeline stages and by the UI; do not rename casually. */
  key: string;
  /** The module as the product names it on screen. */
  module: string;
  /** The screen or entity inside it. Together these read "Sales · Orders". */
  entity: string;
  kind: SourceKind;
  connected: true;
  /** The actual Postgres tables. Named so a sceptic can go and look. */
  tables: readonly string[];
  /** One line: what this source supplies to a decision. */
  supplies: string;
  /**
   * Which mission steps read it. Empty means the module exists in Phase 1 and the mission
   * does not read it yet — which is a fact worth showing rather than hiding, because the
   * honest answer to "do you use Planning?" is "not yet, and here is what instead".
   */
  readBy: readonly string[];
  /** Set when the mission WRITES here, through that module's own port. Never direct SQL. */
  writtenVia?: string;
}

/** A fact the decision needs that Phase 1 has no table for. */
export interface StandinSource {
  key: string;
  label: string;
  kind: SourceKind;
  connected: false;
  /** Where the number actually comes from today, in this repository. */
  today: string;
  /** What would replace it, and when it stops being a stand-in. */
  replacedBy: string;
  supplies: string;
  readBy: readonly string[];
}

/** A system Phase 2 is designed to sit on and is NOT sitting on here. */
export interface ShelfConnector {
  key: string;
  name: string;
  category: "erp" | "accounting" | "shopfloor" | "file" | "generic";
  connected: false;
  /** What it would supply if it were wired up. One line, concrete. */
  wouldSupply: string;
  /**
   * Anything that IS real about this connector today, stated narrowly. Almost always null.
   * A non-null note must describe a path that genuinely runs, not one that is planned.
   */
  realToday: string | null;
}

/* ---------------------------------------------------------- ours, and connected -- */

export const PHASE1_SOURCES: readonly Phase1Source[] = [
  {
    key: "sales.orders",
    module: "Sales",
    entity: "Orders",
    kind: "phase1-erp",
    connected: true,
    tables: ["sales_order", "sales_order_line"],
    supplies: "The commitment itself: what was sold, how many, at what rate, and the date it was promised for.",
    readBy: ["intake", "reserve", "procure"],
    writtenVia: "sales_order_line.reserved_qty, written by the reserve step",
  },
  {
    key: "sales.customers",
    module: "Sales",
    entity: "Customers",
    kind: "phase1-erp",
    connected: true,
    tables: ["customer"],
    supplies: "Who the promise is to — the name that appears on the approval brief and on every narration.",
    readBy: ["intake"],
  },
  {
    key: "engineering.items",
    module: "Engineering",
    entity: "Items",
    kind: "phase1-erp",
    connected: true,
    tables: ["item"],
    supplies: "Part numbers, names and units of measure, so a shortage is reported as a part and not as a uuid.",
    readBy: ["materials", "sourcing", "procure"],
  },
  {
    key: "engineering.bom",
    module: "Engineering",
    entity: "Build sheets (BOM)",
    kind: "phase1-erp",
    connected: true,
    tables: ["bom", "bom_line"],
    supplies: "The released structure for the finished good. One active revision per item, so the explosion cannot double-count.",
    readBy: ["engineering", "materials"],
  },
  {
    key: "inventory.stock",
    module: "Inventory",
    entity: "Stock",
    kind: "phase1-erp",
    connected: true,
    tables: ["stock_balance"],
    supplies: "On-hand quantity per item, summed across warehouses — the number the shortage is netted against.",
    readBy: ["materials", "reserve"],
  },
  {
    key: "purchase.vendors",
    module: "Purchase",
    entity: "Vendors",
    kind: "phase1-erp",
    connected: true,
    tables: ["vendor"],
    supplies: "Which suppliers actually exist in this tenant. A plan naming a vendor that is not here stops the mission.",
    readBy: ["sourcing", "procure"],
  },
  {
    key: "purchase.orders",
    module: "Purchase",
    entity: "Purchase orders",
    kind: "phase1-erp",
    connected: true,
    tables: ["purchase_order", "purchase_order_line"],
    supplies: "The documents the mission raises for the material it is short of — read back afterwards to prove they exist.",
    readBy: ["procure"],
    writtenVia: "PURCHASE_ORDER_WRITER port — PURCHASE numbers and approves its own documents",
  },
  {
    key: "production.orders",
    module: "Production",
    entity: "Work orders",
    kind: "phase1-erp",
    connected: true,
    tables: ["production_order"],
    supplies: "The job that goes on the shop-floor list, pegged to the sales order line it was released for.",
    readBy: ["workorder"],
    writtenVia: "PRODUCTION_ORDER_WRITER port — PRODUCTION owns the release",
  },
  {
    key: "planning.exceptions",
    module: "Planning",
    entity: "Plan runs and problems",
    kind: "phase1-erp",
    connected: true,
    tables: ["mrp_run", "planned_order", "plan_exception", "plan_capacity_load"],
    // Deliberately empty `readBy`. Planning is a real Phase 1 module in this product and the
    // mission does NOT read it: the mission nets its own requirement from the BOM and stock
    // because it plans one commitment, whereas a plan run nets the whole factory. Saying so
    // is more useful than quietly implying an integration that is not there.
    supplies: "Nothing to the mission yet — the mission nets its own requirement per commitment. Planning nets the whole factory.",
    readBy: [],
  },
] as const;

/* ------------------------------------------------- ours, and honestly stood in for -- */

export const STANDIN_SOURCES: readonly StandinSource[] = [
  {
    key: "sourcing.terms",
    label: "Supplier commercial terms",
    kind: "simulated-api",
    connected: false,
    today:
      "A seeded table in apps/api/src/fulfilment/scenario.ts (SEEDED_SOURCING). Surfaced with " +
      "provenance \"seeded\" on every step that uses it, and overridable per mission by uploading a spreadsheet.",
    replacedBy: "A sourcing module holding price, lead time, reliability and committed capacity per vendor per item.",
    supplies: "Unit price, lead time, on-time reliability and capacity — the four numbers the strategy comparison turns on.",
    readBy: ["sourcing", "strategy", "critique", "procure"],
  },
  {
    key: "shopfloor.capacity",
    label: "Work-centre load",
    kind: "simulated-api",
    connected: false,
    today: "A seeded constant (SEEDED_FACTORY.capacityHeadroom). No MES or SCADA is connected to this build.",
    replacedBy: "A live work-centre load feed, or Planning's capacity levelling once the mission consumes a plan run.",
    supplies: "How much of the constraining work centre this batch can have, which is what stretches the build days.",
    readBy: ["capacity", "strategy"],
  },
] as const;

/* ------------------------------------------------------------- the shelf, honest -- */

/**
 * NOT CONNECTED. Every row. This list exists because the same Phase 2 layer is meant to sit
 * on a factory's existing systems as easily as it sits on ours — that is a real product
 * claim and it deserves to be shown. What it does not deserve is a green light next to it.
 *
 * If any of these is ever wired up, it moves OUT of this list. Nothing here should ever
 * gain a `connected: true`; the type forbids it on purpose.
 */
export const CONNECTOR_SHELF: readonly ShelfConnector[] = [
  {
    key: "sap",
    name: "SAP",
    category: "erp",
    connected: false,
    wouldSupply: "Sales orders, material master, stock and purchase documents from ECC or S/4 — read-only, via OData or a staging extract.",
    realToday: null,
  },
  {
    key: "tally",
    name: "Tally",
    category: "accounting",
    connected: false,
    wouldSupply: "Ledgers, stock items and vouchers — the books most Indian MSMEs actually keep.",
    realToday: null,
  },
  {
    key: "odoo",
    name: "Odoo",
    category: "erp",
    connected: false,
    wouldSupply: "Sale orders, BoMs, stock quants and purchase orders over its JSON-RPC API.",
    realToday: null,
  },
  {
    key: "dynamics365",
    name: "Dynamics 365",
    category: "erp",
    connected: false,
    wouldSupply: "Sales, inventory and procurement entities via Dataverse.",
    realToday: null,
  },
  {
    key: "mes-scada",
    name: "MES / SCADA",
    category: "shopfloor",
    connected: false,
    wouldSupply: "Live work-centre load, machine state and production confirmations — the one feed that would replace the seeded capacity number.",
    realToday: null,
  },
  {
    key: "excel-csv",
    name: "Excel / CSV",
    category: "file",
    connected: false,
    wouldSupply: "Whatever the factory keeps in spreadsheets: price lists, opening stock, vendor masters, part lists.",
    // Narrow, and true. Stated rather than rounded up to "connected", because one working
    // path is not an integration.
    realToday:
      "One narrow path is real: a supplier-terms spreadsheet can be uploaded to a mission and it changes the plan. " +
      "Nothing else is imported into a mission this way.",
  },
  {
    key: "rest-api",
    name: "REST API",
    category: "generic",
    connected: false,
    wouldSupply: "Any system that can answer HTTP — the fallback when a plant's software has no named connector.",
    realToday: null,
  },
  {
    key: "database",
    name: "Database",
    category: "generic",
    connected: false,
    wouldSupply: "A read-only replica of the plant's own database, when there is no API at all.",
    realToday: null,
  },
] as const;

/* ------------------------------------------------------------------- one object -- */

/** The whole catalogue, for the endpoint and the connector shelf screen. */
export interface SourceCatalogue {
  phase1: readonly Phase1Source[];
  standins: readonly StandinSource[];
  shelf: readonly ShelfConnector[];
  /** Counts, precomputed so a header cannot disagree with the list under it. */
  summary: {
    connected: number;
    standin: number;
    notConnected: number;
  };
}

export const SOURCE_CATALOGUE: SourceCatalogue = {
  phase1: PHASE1_SOURCES,
  standins: STANDIN_SOURCES,
  shelf: CONNECTOR_SHELF,
  summary: {
    connected: PHASE1_SOURCES.length,
    standin: STANDIN_SOURCES.length,
    notConnected: CONNECTOR_SHELF.length,
  },
};

/** "Sales · Orders" — the label the pipeline puts in `system`. One spelling, everywhere. */
export function sourceLabel(key: string): string {
  const p = PHASE1_SOURCES.find((s) => s.key === key);
  if (p) return `${p.module} · ${p.entity}`;
  const s = STANDIN_SOURCES.find((x) => x.key === key);
  if (s) return s.label;
  return key;
}

/** The kind a source claims to be. Unknown keys are Phase 2's own work, never a live read. */
export function sourceKindOf(key: string): SourceKind {
  const p = PHASE1_SOURCES.find((s) => s.key === key);
  if (p) return p.kind;
  const s = STANDIN_SOURCES.find((x) => x.key === key);
  if (s) return s.kind;
  return "phase2-derived";
}
