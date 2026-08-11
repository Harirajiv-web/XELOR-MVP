/**
 * WHAT PHASE 2 IS SITTING ON — and, much more importantly, what it is NOT.
 *
 * Phase 2 is an intelligence layer. It reads a system of record, works something out, asks a
 * person, writes back through that system's own doors and re-reads to check. In this build
 * the system of record is XELOR's own Phase 1 ERP, and that connection is real: the mission
 * engine queries the sales, inventory, purchase, production and engineering tables directly
 * and writes through those modules' own service interfaces.
 *
 * The same layer could sit on somebody else's ERP. That is the actual commercial argument —
 * a factory already running SAP or Tally does not want a second ERP, it wants the
 * intelligence — and it deserves to be on screen. What it does NOT deserve is a green dot.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE, in the user's own words: "Do not create misleading
 * integrations that appear real when they are only mocked." So every entry below carries
 * `connected`, exactly one entry is true, and the screen renders the false ones as plainly
 * unavailable rather than as a greyed-out coming-soon tease. Nobody watching this demo
 * should be able to leave the room believing we have an SAP connector.
 *
 * The list is served by `GET /fulfilment/sources` and read from here only when that request
 * fails — see `normaliseConnectors`. Either way the honesty is structural: the screen cannot
 * draw a "connected" badge for anything on the connector shelf.
 */

export type ConnectorCategory =
  | "erp"
  | "accounting"
  | "shopfloor"
  | "file"
  | "api"
  | "database";

export interface Connector {
  key: string;
  name: string;
  category: ConnectorCategory;
  /** True ONLY for a link this build genuinely reads and writes through. */
  connected: boolean;
  /** One line: what this system would supply Phase 2. */
  supplies: string;
  /** The state of the work, said plainly. Shown verbatim; never softened into a promise. */
  note: string;
}

export const CATEGORY_LABEL: Record<ConnectorCategory, string> = {
  erp: "ERP",
  accounting: "Accounting",
  shopfloor: "Shop floor",
  file: "Spreadsheet",
  api: "Service",
  database: "Database",
};

/**
 * The shelf, in the order it reads best: ours first because it is the only live one, then
 * the systems an Indian MSME plant actually runs, then the three generic ways in.
 */
export const CONNECTORS: readonly Connector[] = [
  {
    key: "xelor-phase1",
    name: "XELOR Phase 1 ERP",
    category: "erp",
    connected: true,
    supplies:
      "Sales orders, stock and reservations, purchase orders and receipts, work orders, BOMs and routings, quality results, ledger postings.",
    note:
      "Live system of record for those ERP documents. Supplier terms can come from a mission spreadsheet or seeded demo data, and work-centre capacity is seeded; neither is presented as a Phase 1 record.",
  },
  {
    key: "sap",
    name: "SAP",
    category: "erp",
    connected: false,
    supplies:
      "Sales documents, MRP results, stock and reservations, purchase requisitions and orders, production orders.",
    note: "Not connected. No SAP system is reachable from this build and nothing on any screen came from one.",
  },
  {
    key: "tally",
    name: "Tally",
    category: "accounting",
    connected: false,
    supplies:
      "Masters, vouchers, outstanding receivables and payables, GST registers, stock summaries.",
    note: "Not connected. An importer specification is an open governance item; no code reads Tally today.",
  },
  {
    key: "odoo",
    name: "Odoo",
    category: "erp",
    connected: false,
    supplies: "Sales, purchase, inventory moves, manufacturing orders and BOMs.",
    note: "Not connected. Nothing in this build talks to an Odoo instance.",
  },
  {
    key: "dynamics365",
    name: "Dynamics 365",
    category: "erp",
    connected: false,
    supplies: "Sales orders, released products, on-hand inventory, production orders.",
    note: "Not connected. Nothing in this build talks to Dynamics.",
  },
  {
    key: "mes-scada",
    name: "MES / SCADA",
    category: "shopfloor",
    connected: false,
    supplies:
      "Machine states, cycle counts, downtime reasons, live work-centre load — the readings that would let a mission see a delay before a person reports it.",
    note:
      "Not connected. Work-centre capacity in this build is a seeded assumption; no MES or SCADA reading supplies it.",
  },
  {
    key: "excel-csv",
    name: "Excel / CSV",
    category: "file",
    connected: false,
    supplies:
      "Whatever a plant keeps in spreadsheets — supplier price lists, lead times, manual stock counts.",
    note:
      "Not connected as a general integration. One narrow path is live: a mission can upload an .xlsx, .xls or .csv supplier-terms file and re-plan from it. Other spreadsheet data is not read by a mission.",
  },
  {
    key: "rest-api",
    name: "REST API",
    category: "api",
    connected: false,
    supplies: "Any system that can answer HTTP — a bespoke MES, a supplier portal, a WMS.",
    note: "Not connected. There is no generic outbound connector in this build, and one has not been built for any customer.",
  },
  {
    key: "database",
    name: "Database (direct read)",
    category: "database",
    connected: false,
    supplies:
      "A read-only replica of an existing system, for plants whose ERP has no usable API.",
    note: "Not connected. Phase 2 reads XELOR's own database only, under the same row-level security as every other module.",
  },
];

/**
 * The API's source catalogue, if it serves one — otherwise null, and the caller uses the
 * list above. The endpoint intentionally returns richer data than this screen needs:
 * individual Phase 1 sources, explicit stand-ins, and the external connector shelf. This
 * function reduces that contract to one XELOR system-of-record card plus the shelf.
 *
 * Written to be suspicious of its input rather than trusting. The endpoint is being built by
 * a different piece of work running alongside this one, so this has to survive three
 * situations without ever showing a broken screen: the endpoint is missing (a 404, handled
 * by the caller), it answers with a shape nobody agreed on, or it answers with a good list
 * that has one bad row in it.
 *
 * THE ONE THING IT WILL NOT DO IS UPGRADE A SHELF CONNECTION. Rows in `shelf` are always
 * rendered NOT CONNECTED, even if a malformed response adds a truthy status. A real
 * integration belongs in the API's connected source list, not on the shelf.
 */
export function normaliseConnectors(data: unknown): Connector[] | null {
  const outer = record(data);
  const catalogue = record(outer?.data) ?? outer;
  const phase1 = array(catalogue?.phase1);
  const standins = array(catalogue?.standins);
  const shelf = array(catalogue?.shelf);
  if (!phase1?.length || !shelf?.length) return null;

  const connectedSources = phase1.filter((item) => {
    const source = record(item);
    return source?.connected === true && source.kind === "phase1-erp";
  });
  if (connectedSources.length !== phase1.length) return null;

  const base = CONNECTORS[0];
  if (!base) return null;
  const out: Connector[] = [
    {
      ...base,
      note:
        `Live system of record: the mission service reports ${connectedSources.length} connected Phase 1 source ` +
        `area${connectedSources.length === 1 ? "" : "s"}. Supplier terms and work-centre capacity remain explicitly labelled outside those records.`,
    },
  ];

  const fallback = new Map(CONNECTORS.map((connector) => [connector.key, connector]));
  const capacityToday = standins
    ?.map(record)
    .find((source) => source?.key === "shopfloor.capacity");

  for (const item of shelf) {
    const source = record(item);
    const key = str(source?.key);
    const name = str(source?.name);
    if (!source || !key || !name) continue;
    const local = fallback.get(key);
    const realToday = str(source.realToday);
    const capacityClaim = key === "mes-scada" ? str(capacityToday?.today) : null;
    out.push({
      key,
      name,
      category: connectorCategory(str(source.category), key),
      connected: false,
      supplies: str(source.wouldSupply) ?? local?.supplies ?? "No source contract was supplied.",
      note: capacityClaim
        ? `Not connected. ${capacityClaim}`
        : realToday
          ? `Not connected as a general integration. ${realToday}`
          : local?.note ?? "Not connected. No live path is present in this build.",
    });
  }
  return out.length > 1 ? out : null;
}

function connectorCategory(category: string | null, key: string): ConnectorCategory {
  if (category && category in CATEGORY_LABEL) return category as ConnectorCategory;
  if (key === "database") return "database";
  return "api";
}

function array(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
