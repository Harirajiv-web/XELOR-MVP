import { evidenceSchema, type Evidence, type ConnectionSettings, type Credentials, type ConnectionKind } from "./contracts.js";
import { connectorRequest } from "./connector-security.js";

export const CONNECTOR_CATALOG = [
  { kind: "native", name: "XELOR ERP", transport: "Tenant-scoped database reader", mode: "read_only", description: "Orders, unreserved accepted stock and supplier masters from XELOR ERP.", documentationUrl: null },
  { kind: "odoo", name: "Odoo", transport: "Odoo 19 JSON-2", mode: "read_only", description: "API key and external API entitlement required. Reads sales lines, products, stock and suppliers.", documentationUrl: "https://www.odoo.com/documentation/19.0/developer/reference/external_api.html" },
  { kind: "tally", name: "TallyPrime", transport: "XML over HTTP", mode: "read_only", description: "Reads stock-item closing balances from a loaded company. Closing stock is labelled unknown availability because reservations are not supplied.", documentationUrl: "https://help.tallysolutions.com/xml-integration/" },
  { kind: "sap", name: "SAP S/4HANA", transport: "OData V2 / V4", mode: "read_only", description: "Configured read-only OData entity using a bearer token or basic authentication. Choose the entity mapping before importing.", documentationUrl: "https://help.sap.com/docs/SAP_S4HANA_CLOUD/3c916ef10fc240c9afc594b346ffaf77/85043858ea0f9244e10000000a4450e5.html" },
  { kind: "vyapar", name: "Vyapar", transport: "CSV / JSON import", mode: "import", description: "Import exported records using the documented column template. No unverified direct Vyapar API is claimed.", documentationUrl: "https://vyaparapp.in/" },
  { kind: "generic", name: "Other ERP / spreadsheets", transport: "Authenticated JSON push or CSV import", mode: "import", description: "Any system can publish the normalized manufacturing contract through an authenticated import request.", documentationUrl: null },
] as const;

export type AdapterConnection = { kind: ConnectionKind; baseUrl: string | null; settings: ConnectionSettings; credentials: Credentials };
type Row = Record<string, unknown>;
export type ReadEvidence = { evidence: Evidence; warnings: string[] };
function rows(value: unknown): Row[] {
  if (!Array.isArray(value) || value.some((v) => !v || typeof v !== "object" || Array.isArray(v))) throw new Error("Connector did not return a record collection");
  if (value.length > 1000) throw new Error("Connector collection exceeds 1,000 records; narrow the source view");
  return value as Row[];
}
const relationId = (value: unknown) => Array.isArray(value) ? String(value[0]) : String(value ?? "");
const label = (value: unknown) => Array.isArray(value) ? String(value[1]) : typeof value === "string" ? value : null;
const numeric = (value: unknown) => value === null || value === undefined || value === "" || value === false ? null : Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const xmlEscape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
function xmlText(value: string) { return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }

export function parseTallyStock(xml: string): ReadEvidence {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("DTD and XML entities are unsupported");
  if (/<LINEERROR\b|<ERROR\b/i.test(xml)) throw new Error("Tally rejected the export; verify the loaded company and export permissions");
  if (!/<ENVELOPE\b/i.test(xml) || !/<\/ENVELOPE>/i.test(xml) || !/<COLLECTION\b/i.test(xml)) throw new Error("Tally response is not a complete collection envelope");
  const inventory: Evidence["inventory"] = [];
  for (const match of xml.matchAll(/<STOCKITEM\b[^>]*\bNAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi)) {
    const uom = match[2]!.match(/<BASEUNITS>([\s\S]*?)<\/BASEUNITS>/i)?.[1];
    const closing = match[2]!.match(/<CLOSINGBALANCE>\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i)?.[1];
    inventory.push({ itemCode: xmlText(match[1]!), availableQty: null, onHandQty: closing ? numeric(closing.replace(/,/g, "")) : null, uom: uom ? xmlText(uom.trim()) : null });
  }
  return { evidence: evidenceSchema.parse({ inventory }), warnings: ["Tally closing stock is not available-to-promise stock. Import reconciled available quantities to assess commitments.", "Orders, supplier lead times and capacity are not included in this stock-item export."] };
}

export function normalizeSap(value: unknown, entity: "orders" | "inventory" | "suppliers"): ReadEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SAP response must be an OData object");
  const document = value as { value?: unknown; d?: { results?: unknown; __next?: unknown }; "@odata.nextLink"?: unknown };
  const records = rows(document.value ?? document.d?.results);
  const warnings: string[] = [];
  if (document["@odata.nextLink"] || document.d?.__next) throw new Error("SAP returned a paginated collection. Configure a bounded view or import the complete export; partial evidence is refused.");
  if (entity === "orders" && records.some((r) => !(r.SalesOrder ?? r.PurchaseOrder) || !(r.SalesOrderItem ?? r.PurchaseOrderItem))) throw new Error("SAP order view must include document and line identifiers");
  const evidence = entity === "suppliers" ? evidenceSchema.parse({ suppliers: records.map((r) => ({ externalId: r.BusinessPartner ?? r.Supplier, name: r.BusinessPartnerFullName ?? r.SupplierName ?? r.OrganizationBPName1, leadDays: null })) })
    : entity === "orders" ? evidenceSchema.parse({ orders: records.map((r) => ({ externalId: `${String(r.SalesOrder ?? r.PurchaseOrder)}/${String(r.SalesOrderItem ?? r.PurchaseOrderItem)}`, itemCode: r.Material ?? r.Product, quantity: numeric(r.OrderQuantity ?? r.RequestedQuantity), dueDate: typeof r.RequestedDeliveryDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.RequestedDeliveryDate) ? r.RequestedDeliveryDate.slice(0, 10) : null, unitPrice: numeric(r.NetPriceAmount), currency: r.TransactionCurrency ?? r.DocumentCurrency ?? null })) })
      : evidenceSchema.parse({ inventory: records.map((r) => ({ itemCode: r.Material ?? r.Product, availableQty: numeric(r.AvailableQuantity), uom: r.MaterialBaseUnit ?? r.BaseUnit ?? null })) });
  if (entity === "inventory") warnings.push("Only an explicit AvailableQuantity field is treated as available stock. Map a reconciled SAP view or import available quantities; physical stock alone is insufficient.");
  warnings.push(`This SAP view includes ${entity} only; other manufacturing evidence must be supplied separately.`);
  return { evidence, warnings };
}

export async function readExternalEvidence(connection: AdapterConnection): Promise<ReadEvidence> {
  if (!connection.baseUrl) throw new Error("Set a connector endpoint first");
  const { kind, settings, credentials, baseUrl } = connection;
  if (kind === "odoo") {
    if (!credentials.apiKey) throw new Error("Odoo requires an API key");
    const headers: Record<string, string> = { "content-type": "application/json", Authorization: `bearer ${credentials.apiKey}` };
    if (settings.database) headers["X-Odoo-Database"] = settings.database;
    const read = async (model: string, fields: string[], domain: unknown[]) => rows(JSON.parse(await connectorRequest(baseUrl, `/json/2/${model}/search_read`, { method: "POST", headers, body: JSON.stringify({ domain, fields, limit: 1000, order: "id asc" }) })));
    const products = await read("product.product", ["id", "default_code", "uom_id", "free_qty"], [["active", "=", true]]);
    const orderLines = await read("sale.order.line", ["id", "product_id", "product_uom_qty", "qty_delivered", "price_unit", "currency_id"], [["state", "in", ["sale", "done"]], ["display_type", "=", false]]);
    const suppliers = await read("res.partner", ["id", "name"], [["supplier_rank", ">", 0], ["active", "=", true]]);
    if ([products, orderLines, suppliers].some((collection) => collection.length === 1000)) throw new Error("Odoo returned the 1,000-record limit. Use a scoped export to avoid partial evidence.");
    const codeById = new Map(products.map((p) => [String(p.id), typeof p.default_code === "string" && p.default_code ? p.default_code : `odoo:${String(p.id)}`]));
    const evidence = evidenceSchema.parse({
      inventory: products.map((p) => ({ itemCode: codeById.get(String(p.id)), availableQty: numeric(p.free_qty), uom: label(p.uom_id) })),
      orders: orderLines.map((r) => ({ externalId: String(r.id), itemCode: codeById.get(relationId(r.product_id)) ?? `odoo:${relationId(r.product_id)}`, quantity: Math.max(0, Number(r.product_uom_qty) - Number(r.qty_delivered)), unitPrice: numeric(r.price_unit), currency: label(r.currency_id), dueDate: null })),
      suppliers: suppliers.map((r) => ({ externalId: String(r.id), name: r.name, leadDays: null })),
    });
    return { evidence, warnings: ["Odoo line-level promised dates, BOM capacity and supplier lead times are not included. Confirm them in decision assumptions."] };
  }
  if (kind === "tally") {
    const company = settings.company ? `<SVCURRENTCOMPANY>${xmlEscape(settings.company)}</SVCURRENTCOMPANY>` : "";
    const body = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>XelorStock</ID></HEADER><BODY><DESC><STATICVARIABLES>${company}<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="XelorStock"><TYPE>StockItem</TYPE><FETCH>Name,ClosingBalance,BaseUnits</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
    return parseTallyStock(await connectorRequest(baseUrl, "", { method: "POST", headers: { "content-type": "text/xml; charset=utf-8", accept: "application/xml" }, body }));
  }
  if (kind === "sap") {
    if (!settings.entityPath || !settings.entity) throw new Error("SAP requires an OData entity path and entity mapping");
    const authorization = credentials.apiKey ? `Bearer ${credentials.apiKey}` : credentials.username && credentials.password ? `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}` : null;
    if (!authorization) throw new Error("SAP requires an API token or configured service-account credentials");
    const response = await connectorRequest(baseUrl, `${settings.entityPath}?$format=json&$top=1000`, { headers: { Authorization: authorization } });
    return normalizeSap(JSON.parse(response), settings.entity);
  }
  throw new Error("Use the authenticated import endpoint for this connector");
}
