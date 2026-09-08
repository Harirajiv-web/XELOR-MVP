import { Errors, type SheetCell, type SheetMatrix } from "@ind-core/platform";
import { decodeWorkbook } from "../modules/dataimport/workbook.js";

/**
 * SUPPLIER TERMS FROM A SPREADSHEET — the one non-ERP source that genuinely feeds a plan.
 *
 * Phase 1 has no price or lead-time master. It has a vendor master (code, name, GSTIN,
 * payment terms) and nothing commercial, because this product has no sourcing module yet.
 * Every mission therefore gets those four numbers from somewhere outside the ERP, and until
 * now that somewhere was a seeded table in `scenario.ts`, labelled `provenance: "seeded"`
 * wherever it surfaced.
 *
 * This adds the other honest answer, and it is the one a factory would actually recognise:
 * the price list is a spreadsheet. Upload it against a mission and the mission re-plans from
 * it — a different price changes the chosen supplier, a different lead time changes the
 * completion date, and the sourcing step's pipeline row changes from "seeded" to the name of
 * the file. That is a real integration with a real file format, scoped to one thing.
 *
 * WHAT THIS IS NOT. It is not an Excel connector. Nothing else about a mission can be
 * uploaded, and the connector shelf keeps Excel/CSV marked NOT CONNECTED with this one path
 * called out by name. A narrow path that works is worth more than a broad one that is
 * demonstrated with a screenshot.
 *
 * The decoding is `decodeWorkbook`'s, deliberately: it is the only file in this API that
 * knows what an .xlsx is, it already handles .xlsx / .xls / .csv, it already caps the size
 * and the cell count, and it already decodes text as UTF-8 rather than guessing a codepage.
 * A second spreadsheet reader in this repository would be a second set of those decisions.
 */

/** One quoted supply, as the sheet gives it. The four numbers Phase 1 does not hold. */
export interface UploadedSupplierTerm {
  itemCode: string;
  vendorCode: string;
  vendorName: string;
  unitPrice: number;
  leadTimeDays: number;
  /** 0..1. A column written as a percentage is converted, see `readReliability`. */
  reliability: number;
  capacityUnits: number;
  qualified: boolean;
}

export interface ParsedSupplierTerms {
  rows: UploadedSupplierTerm[];
  sheetName: string;
  /** sha256 of the raw bytes. The same file uploaded twice is one source, not two. */
  bytesHash: string;
  byteSize: number;
  fileKind: string;
  /** Distinct item codes the sheet quotes for. Shown back so a wrong file is obvious. */
  itemCodes: string[];
}

/**
 * The columns, and the spellings accepted for each.
 *
 * Explicit rather than fuzzy-matched. A price list is a file somebody's supplier emailed
 * them, so the header will be "Lead time (days)" as often as "lead_time_days" — but an
 * inference engine that guesses which column is the price is exactly the kind of clever that
 * silently books a purchase order at the reliability figure.
 */
const COLUMNS = {
  itemCode: ["itemcode", "item", "partcode", "partno", "partnumber", "component"],
  vendorCode: ["vendorcode", "suppliercode", "vendor", "supplier"],
  vendorName: ["vendorname", "suppliername", "name"],
  unitPrice: ["unitprice", "price", "rate", "unitrate", "priceperunit"],
  leadTimeDays: ["leadtimedays", "leadtime", "leaddays", "days"],
  reliability: ["reliability", "ontime", "ontimepct", "otif"],
  capacityUnits: ["capacityunits", "capacity", "committedcapacity", "monthlycapacity"],
  qualified: ["qualified", "approved", "isqualified"],
} as const;

type ColumnKey = keyof typeof COLUMNS;

/** Lower-cased and stripped of everything but letters and digits. "Lead time (days)" → "leadtimedays". */
const normaliseHeader = (v: SheetCell): string => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const cellText = (v: SheetCell): string => (v == null ? "" : String(v).trim());

/**
 * A number out of a cell that might be text.
 *
 * Rupee signs, thousands separators and stray spaces are stripped, because a price list
 * written by a person contains "₹ 1,850.00" and refusing it would be pedantry. Anything that
 * is still not a number after that is reported as a row error rather than silently zeroed —
 * a price of zero is a real value and must not be what a typo produces.
 */
function readNumber(v: SheetCell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const text = cellText(v).replace(/[₹,\s]/g, "");
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reliability as a fraction, whichever way it was written.
 *
 * A supplier scorecard says 92%; a spreadsheet exported from one says 0.92; a person typing
 * it in says 92. All three mean the same thing and all three arrive here. Anything above 1
 * is read as a percentage — which is safe, because a reliability above 100% is not a number
 * anybody meant.
 */
function readReliability(v: SheetCell): number | null {
  const n = readNumber(v);
  if (n === null) return null;
  const frac = n > 1 ? n / 100 : n;
  return frac >= 0 && frac <= 1 ? frac : null;
}

/** "yes"/"y"/"true"/"1" is qualified. A BLANK is qualified — the sheet is a list of quotes. */
function readQualified(v: SheetCell): boolean {
  const text = cellText(v).toLowerCase();
  if (text === "") return true;
  return ["y", "yes", "true", "1", "qualified", "approved"].includes(text);
}

/**
 * The sheet, as rows the planner can use.
 *
 * Refuses the whole file rather than importing the good rows out of it. A price list with
 * three unreadable lines is a file somebody exported wrongly, and quietly sourcing from the
 * seven that parsed would produce a plan that is missing a supplier for no visible reason.
 */
export function parseSupplierTerms(fileBase64: string): ParsedSupplierTerms {
  const book = decodeWorkbook(fileBase64);
  const sheet = book.sheets[0];
  if (!sheet) throw Errors.validation([{ field: "file", message: "this file contains no sheets" }]);

  const matrix: SheetMatrix = sheet.matrix;
  const headerIndex = matrix.findIndex((row) => row.some((c) => cellText(c) !== ""));
  const header = headerIndex >= 0 ? matrix[headerIndex] : undefined;
  if (!header) {
    throw Errors.validation([{ field: "file", message: `sheet "${sheet.name}" is empty` }]);
  }

  // Column position by name, resolved once. A missing REQUIRED column is a file-level
  // problem and is reported as one, naming the spellings this build accepts.
  const at: Partial<Record<ColumnKey, number>> = {};
  header.forEach((cell, i) => {
    const h = normaliseHeader(cell);
    for (const key of Object.keys(COLUMNS) as ColumnKey[]) {
      if (at[key] === undefined && (COLUMNS[key] as readonly string[]).includes(h)) at[key] = i;
    }
  });

  const required: ColumnKey[] = ["itemCode", "vendorCode", "unitPrice", "leadTimeDays"];
  const missing = required.filter((k) => at[k] === undefined);
  if (missing.length > 0) {
    throw Errors.validation(
      missing.map((k) => ({
        field: k,
        message: `no column for ${k}. Accepted headings: ${(COLUMNS[k] as readonly string[]).join(", ")}`,
      })),
    );
  }

  const rows: UploadedSupplierTerm[] = [];
  const problems: Array<{ field: string; message: string }> = [];

  for (let r = headerIndex + 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.every((c) => cellText(c) === "")) continue;
    const line = r + 1; // 1-based, so it matches the row number in the person's spreadsheet
    const cell = (k: ColumnKey): SheetCell => {
      const i = at[k];
      return i === undefined ? null : row[i] ?? null;
    };

    const itemCode = cellText(cell("itemCode"));
    const vendorCode = cellText(cell("vendorCode"));
    const unitPrice = readNumber(cell("unitPrice"));
    const leadTimeDays = readNumber(cell("leadTimeDays"));

    // Every complaint about this row is collected before any of them is reported. A person
    // fixing a price list wants the whole row's worth of problems in one pass, not the first
    // one, then the next one after they upload it again.
    const reliability = at.reliability === undefined ? 0.85 : readReliability(cell("reliability"));
    const rowProblems: string[] = [];
    if (itemCode === "") rowProblems.push("no item code");
    if (vendorCode === "") rowProblems.push("no vendor code");
    if (unitPrice === null || unitPrice < 0) rowProblems.push(`unit price "${cellText(cell("unitPrice"))}" is not a number`);
    if (leadTimeDays === null || leadTimeDays < 0) rowProblems.push(`lead time "${cellText(cell("leadTimeDays"))}" is not a number of days`);
    if (reliability === null) rowProblems.push(`reliability "${cellText(cell("reliability"))}" is not a percentage or a fraction`);

    if (rowProblems.length > 0 || unitPrice === null || leadTimeDays === null || reliability === null) {
      for (const message of rowProblems) problems.push({ field: `row ${line}`, message });
      continue;
    }

    const capacity = at.capacityUnits === undefined ? Number.MAX_SAFE_INTEGER : readNumber(cell("capacityUnits"));

    rows.push({
      itemCode,
      vendorCode,
      vendorName: cellText(cell("vendorName")) || vendorCode,
      unitPrice,
      leadTimeDays: Math.round(leadTimeDays),
      reliability,
      // No capacity column means "as much as you want", not "none". A zero here would make
      // every candidate infeasible for a reason the file never stated.
      capacityUnits: capacity === null || capacity <= 0 ? Number.MAX_SAFE_INTEGER : capacity,
      qualified: readQualified(cell("qualified")),
    });
  }

  if (problems.length > 0) throw Errors.validation(problems.slice(0, 20));
  if (rows.length === 0) {
    throw Errors.validation([{ field: "file", message: `sheet "${sheet.name}" has a header and no data rows` }]);
  }

  return {
    rows,
    sheetName: sheet.name,
    bytesHash: book.bytesHash,
    byteSize: book.byteSize,
    fileKind: book.fileKind,
    itemCodes: [...new Set(rows.map((r) => r.itemCode))],
  };
}

/* --------------------------------------------------------- the demo's own file -- */

export const TERMS_TEMPLATE_HEADER = [
  "item_code",
  "vendor_code",
  "vendor_name",
  "unit_price",
  "lead_time_days",
  "reliability",
  "capacity_units",
  "qualified",
] as const;

/**
 * A supplier-terms sheet, as CSV text.
 *
 * CSV rather than binary .xlsx for one reason: a checked-in binary fixture is a file nobody
 * can read in a diff, and the parser above treats all three formats identically — a real
 * .xlsx upload goes through exactly the same code path as this does. The scenario that uses
 * this records `origin: "scenario-generated"` on the event, so nothing on screen can imply a
 * person uploaded it.
 *
 * Quoting is deliberately minimal and deliberately correct: a vendor name with a comma in it
 * ("Meridian Metals & Alloys, Pune") would otherwise shift every column after it.
 */
export function buildTermsCsv(rows: readonly UploadedSupplierTerm[]): string {
  const esc = (v: string | number | boolean): string => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [TERMS_TEMPLATE_HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        esc(r.itemCode),
        esc(r.vendorCode),
        esc(r.vendorName),
        esc(r.unitPrice),
        esc(r.leadTimeDays),
        esc(Math.round(r.reliability * 100)),
        esc(r.capacityUnits === Number.MAX_SAFE_INTEGER ? "" : r.capacityUnits),
        esc(r.qualified ? "yes" : "no"),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Base64, because the upload endpoint takes a file the same way every other one does. */
export function toBase64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}
