import { z } from "zod";

const text = z.string().trim().min(1).max(200);
const nonnegative = z.number().finite().min(0).max(1e12);
export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Use a real calendar date");
export const connectorKind = z.enum(["native", "odoo", "tally", "sap", "vyapar", "generic"]);
export const connectionSettings = z.object({
  database: text.optional(), company: text.optional(),
  entityPath: z.string().max(400).regex(/^\/[A-Za-z0-9_/$.-]+$/).optional(),
  entity: z.enum(["orders", "inventory", "suppliers"]).optional(),
}).strict();
export const connectionCreate = z.object({
  name: text, kind: connectorKind, baseUrl: z.string().url().max(500).optional(),
  credentials: z.object({ apiKey: z.string().min(1).max(4096).optional(), username: text.optional(), password: z.string().min(1).max(4096).optional() }).strict().optional(),
  settings: connectionSettings.default({}),
}).strict();
export const evidenceSchema = z.object({
  orders: z.array(z.object({ externalId: text, itemCode: text, quantity: nonnegative,
    dueDate: calendarDate.nullable().default(null), unitPrice: nonnegative.nullable().default(null),
    currency: z.string().regex(/^[A-Z]{3}$/).nullable().default(null) }).strict()).max(1000).default([]),
  inventory: z.array(z.object({ itemCode: text, availableQty: nonnegative.nullable().default(null),
    uom: text.nullable().default(null), onHandQty: nonnegative.nullable().optional() }).strict()).max(1000).default([]),
  suppliers: z.array(z.object({ externalId: text, name: text,
    leadDays: z.number().int().min(0).max(3650).nullable().default(null) }).strict()).max(1000).default([]),
}).strict().superRefine((value, ctx) => {
  for (const entity of ["orders", "inventory", "suppliers"] as const) {
    const keys = value[entity].map((row) => "externalId" in row ? row.externalId : row.itemCode);
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: [entity], message: "Duplicate source identifiers; reconcile before importing" });
  }
});
export type Evidence = z.infer<typeof evidenceSchema>;
export type ConnectionSettings = z.infer<typeof connectionSettings>;
export type Credentials = NonNullable<z.infer<typeof connectionCreate>["credentials"]>;
export type ConnectionKind = z.infer<typeof connectorKind>;

export const importRequest = z.object({
  format: z.enum(["json", "csv"]), entity: z.enum(["orders", "inventory", "suppliers"]).optional(),
  content: z.string().min(2).max(1_000_000), observedAt: z.string().datetime({ offset: true }),
}).strict();
export const questionRequest = z.object({ question: z.string().trim().min(3).max(600) }).strict();
export const commitmentRequest = z.object({
  connectionId: z.string().uuid(), orderRef: text, itemCode: text, quantity: nonnegative.positive(),
  dueDate: calendarDate, sellingPrice: nonnegative.positive(), currency: z.string().regex(/^[A-Z]{3}$/),
  productionDays: z.number().int().min(0).max(3650).optional(), capacityConfirmed: z.boolean().optional(),
  materialUnitCost: nonnegative.optional(), conversionCost: nonnegative.optional(),
  procurementLeadDays: z.number().int().min(0).max(3650).optional(), targetMarginPct: z.number().min(0).max(100).default(15),
}).strict();
export const recoveryRequest = z.object({
  connectionId: z.string().uuid(), itemCode: text, quantity: nonnegative.positive(), needDate: calendarDate,
  currency: z.string().regex(/^[A-Z]{3}$/),
  options: z.array(z.object({ name: text, quantity: nonnegative.positive(), unitCost: nonnegative.nullable(),
    freightCost: nonnegative.nullable(), leadDays: z.number().int().min(0).max(3650).nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/) }).strict()).min(1).max(12),
}).strict().refine((v) => new Set(v.options.map((o) => o.name)).size === v.options.length, "Option names must be unique");
export const outcomeRequest = z.object({
  metric: z.enum(["rfq_hours", "buyer_minutes", "emergency_purchases", "on_time_delivery_pct"]),
  kind: z.enum(["baseline", "actual", "estimate"]), scope: text, value: nonnegative,
  sampleSize: z.number().int().min(1).max(10_000_000), periodStart: calendarDate, periodEnd: calendarDate, evidenceRef: text,
}).strict().refine((v) => v.periodEnd >= v.periodStart, "End date must follow start date")
  .refine((v) => v.metric !== "on_time_delivery_pct" || v.value <= 100, "Percentage must not exceed 100");

/** RFC4180-style quoted fields, deliberately bounded and never evaluated as formulas. */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false; let closed = false;
  for (let index = 0; index < content.length; index++) {
    const char = content[index]!;
    if (quoted) {
      if (char === '"' && content[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === '"') {
      if (cell || closed) throw new Error("Invalid CSV quote");
      quoted = true;
    } else if (char === "," || char === "\n" || char === "\r") {
      row.push(cell.trim()); cell = ""; closed = false;
      if (char !== ",") {
        if (char === "\r" && content[index + 1] === "\n") index++;
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else {
      if (closed && char !== " ") throw new Error("Unexpected text after CSV quote");
      if (!closed) cell += char;
    }
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows.length > 1001) throw new Error("Import supports at most 1,000 records");
  return rows;
}

export function parseImport(input: z.infer<typeof importRequest>, now = new Date()): Evidence {
  if (new Date(input.observedAt).getTime() > now.getTime() + 60_000) throw new Error("Observed time cannot be in the future");
  if (input.format === "json") return evidenceSchema.parse(JSON.parse(input.content));
  if (!input.entity) throw new Error("Select the record type for a CSV import");
  const [header, ...rows] = parseCsv(input.content.replace(/^\uFEFF/, ""));
  if (!header?.length || new Set(header).size !== header.length) throw new Error("CSV requires unique column headings");
  const numeric = new Set(["quantity", "unitPrice", "availableQty", "onHandQty", "leadDays"]);
  const records = rows.map((values) => {
    if (values.length !== header.length) throw new Error("CSV row has a different number of columns than its headings");
    return Object.fromEntries(header.map((key, index) => [key, values[index] === "" ? null : numeric.has(key) ? Number(values[index]) : values[index]]));
  });
  return evidenceSchema.parse({ [input.entity]: records });
}
