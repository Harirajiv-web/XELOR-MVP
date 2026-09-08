/**
 * IS THIS ROW USABLE, AND IF NOT, WHY — IN WORDS THE PERSON WHO TYPED IT WILL RECOGNISE.
 *
 * A spreadsheet is not a form. Nobody validated it as it was typed, it has been edited by
 * four people over two years, and the quantity column contains "1,200", "1200 nos",
 * "approx 1200" and a blank. So this file does two jobs that are usually conflated, and
 * keeping them apart is the whole design:
 *
 *   COERCION  — what the person plainly meant. "1,200" is twelve hundred. "Yes" is true.
 *               "20-Jul-2026" is a date. Refusing these would be pedantry: the meaning is
 *               not in doubt and the operator cannot see what our parser wanted.
 *   REFUSAL   — what cannot be read at all, or is read but is out of bounds. "approx 1200"
 *               is not a quantity, and no amount of goodwill makes it one. This is reported
 *               against the row and the field, with the offending text quoted back.
 *
 * WHAT IS NEVER DONE: substituting a default for something unreadable. A blank required
 * field does not become 0, an unparseable date does not become today, and an unrecognised
 * item type does not become "component". Every one of those turns a problem the operator
 * could have fixed in thirty seconds into a wrong number nobody will ever question, because
 * it arrived through the same door as the right ones.
 *
 * DATES ARE READ DAY-FIRST. 03/04/2026 is 3 April, not 4 March. This product is sold in
 * India, its own display format is DD-MMM-YYYY, and a spreadsheet exported from Tally or
 * typed by a plant clerk is day-first essentially always. The alternative — guessing per
 * value — produces a file where some dates are read one way and some the other, which is
 * the one outcome worse than being consistently wrong. Where the two readings differ the
 * value is flagged as AMBIGUOUS so the operator sees it before it is committed.
 */

import type { ImportFieldSpec, ImportTargetSpec } from "./spec.js";
import { isoFromDate, type SheetCell } from "./sheet.js";

export type RowIssueKind =
  /** The field is required and the cell is empty. */
  | "missing"
  /** The text cannot be read as the type at all. */
  | "format"
  /** Read fine, but outside what the domain endpoint will accept. */
  | "range"
  /** Read fine, but not one of the permitted values. */
  | "not_allowed"
  /** Read fine, but names something that does not exist in this tenant's data. */
  | "reference"
  /** Read two ways, and the two readings disagree. Imported, but said out loud. */
  | "ambiguous";

export interface RowIssue {
  field: string;
  /** The field's human label — an operator did not name it `gstRatePct`. */
  label: string;
  kind: RowIssueKind;
  message: string;
  /** The offending cell, as it appears in the file. Quoting it back saves a phone call. */
  value: string;
}

export interface RowValidation {
  ok: boolean;
  /** Coerced values, ready to be handed to a domain endpoint. Only present for valid fields. */
  values: Readonly<Record<string, unknown>>;
  issues: readonly RowIssue[];
}

/** An issue that does not stop the row — the operator is told, the row still imports. */
export function isAdvisory(issue: RowIssue): boolean {
  return issue.kind === "ambiguous";
}

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const TRUE_WORDS = new Set(["true", "t", "yes", "y", "1", "on", "✓"]);
const FALSE_WORDS = new Set(["false", "f", "no", "n", "0", "off", "-", "x"]);

function text(cell: SheetCell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return isoFromDate(cell);
  return String(cell).trim();
}

/**
 * A number written by a human.
 *
 * Handles Indian digit grouping ("1,20,000.50"), a currency symbol, a stray unit suffix is
 * NOT handled on purpose — "1200 nos" is refused, because accepting it means deciding that
 * the trailing text was noise, and the next file will have "1200 to 1400" in the same
 * column.
 */
function toNumber(raw: string): number | null {
  const cleaned = raw
    .replace(/[₹\s]/g, "")
    .replace(/,/g, "")
    // Accounting parentheses: (1200) is minus twelve hundred, and a stock sheet from an
    // accounts package will use them.
    .replace(/^\((.*)\)$/, "-$1");
  if (cleaned === "") return null;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

interface ParsedDate {
  iso: string;
  /** True when day-first and month-first readings are both valid and disagree. */
  ambiguous: boolean;
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Rejects 31 February by round-tripping rather than by a table of month lengths.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt.toISOString().slice(0, 10);
}

/**
 * Excel keeps dates as days since 1899-12-30 — a two-day offset that exists because Lotus
 * 1-2-3 believed 1900 was a leap year and every spreadsheet since has had to agree with it.
 * A bare number in a date column is almost always one of these.
 */
function fromExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const ms = Math.round(serial * 86400000);
  const dt = new Date(Date.UTC(1899, 11, 30) + ms);
  return dt.toISOString().slice(0, 10);
}

function toDate(cell: SheetCell): ParsedDate | null {
  if (cell instanceof Date) {
    return { iso: isoFromDate(cell), ambiguous: false };
  }
  if (typeof cell === "number") {
    const s = fromExcelSerial(cell);
    return s === null ? null : { iso: s, ambiguous: false };
  }
  const raw = text(cell);
  if (raw === "") return null;

  // ISO first — unambiguous by construction, and what a system-generated export produces.
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (isoMatch) {
    const s = iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    return s === null ? null : { iso: s, ambiguous: false };
  }

  // 20-Jul-2026 / 20 July 2026 — the product's own display format, and never ambiguous.
  const named = /^(\d{1,2})[-/ ]([A-Za-z]{3,})[-/ ](\d{2,4})$/.exec(raw);
  if (named) {
    const month = MONTHS[named[2]!.slice(0, 3).toLowerCase()];
    if (month === undefined) return null;
    const year = Number(named[3]);
    const s = iso(year < 100 ? 2000 + year : year, month, Number(named[1]));
    return s === null ? null : { iso: s, ambiguous: false };
  }

  const numeric = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(raw);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const yRaw = Number(numeric[3]);
    const year = yRaw < 100 ? 2000 + yRaw : yRaw;
    const dayFirst = iso(year, b, a);
    const monthFirst = iso(year, a, b);
    if (dayFirst === null) {
      // Only one reading works — take it, and it is not a guess.
      return monthFirst === null ? null : { iso: monthFirst, ambiguous: false };
    }
    return { iso: dayFirst, ambiguous: monthFirst !== null && monthFirst !== dayFirst };
  }

  return null;
}

function toBoolean(cell: SheetCell): boolean | null {
  if (typeof cell === "boolean") return cell;
  const raw = text(cell).toLowerCase();
  if (raw === "") return null;
  if (TRUE_WORDS.has(raw)) return true;
  if (FALSE_WORDS.has(raw)) return false;
  return null;
}

/** "Finished Good", "finished-good" and "FINISHED_GOOD" are the same permitted value. */
function matchEnum(raw: string, allowed: readonly string[]): string | undefined {
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return allowed.find((a) => a.toLowerCase().replace(/[^a-z0-9]/g, "") === key);
}

function issue(
  spec: ImportFieldSpec,
  kind: RowIssueKind,
  message: string,
  value: string,
): RowIssue {
  return { field: spec.field, label: spec.label, kind, message, value };
}

/**
 * One field, coerced and checked.
 *
 * Returns `undefined` for a value to mean "absent" — which is different from null and from
 * zero, and the difference matters: an absent optional field is left off the payload
 * entirely so the domain endpoint applies its own default, rather than being sent an
 * explicit null it would have to interpret.
 */
function readField(
  spec: ImportFieldSpec,
  cell: SheetCell | undefined,
): { value?: unknown; issues: RowIssue[] } {
  const raw = text(cell ?? null);
  if (raw === "") {
    if (spec.required) {
      return {
        issues: [issue(spec, "missing", `${spec.label} is required and this row has none.`, "")],
      };
    }
    return { issues: [] };
  }

  switch (spec.type) {
    case "text": {
      if (spec.max !== undefined && raw.length > spec.max) {
        return {
          issues: [
            issue(
              spec,
              "range",
              `${spec.label} is ${raw.length} characters; the limit is ${spec.max}.`,
              raw,
            ),
          ],
        };
      }
      return { value: raw, issues: [] };
    }
    case "number":
    case "integer": {
      const n = toNumber(raw);
      if (n === null) {
        return {
          issues: [issue(spec, "format", `${spec.label} is not a number.`, raw)],
        };
      }
      if (spec.type === "integer" && !Number.isInteger(n)) {
        return {
          issues: [issue(spec, "format", `${spec.label} must be a whole number.`, raw)],
        };
      }
      if (spec.min !== undefined && n < spec.min) {
        return {
          issues: [issue(spec, "range", `${spec.label} cannot be below ${spec.min}.`, raw)],
        };
      }
      if (spec.max !== undefined && n > spec.max) {
        return {
          issues: [issue(spec, "range", `${spec.label} cannot be above ${spec.max}.`, raw)],
        };
      }
      return { value: n, issues: [] };
    }
    case "boolean": {
      const b = toBoolean(cell ?? null);
      if (b === null) {
        return {
          issues: [
            issue(spec, "format", `${spec.label} should read yes or no.`, raw),
          ],
        };
      }
      return { value: b, issues: [] };
    }
    case "date": {
      const d = toDate(cell ?? null);
      if (d === null) {
        return {
          issues: [
            issue(
              spec,
              "format",
              `${spec.label} is not a date this can read. Use 2026-07-20 or 20-Jul-2026.`,
              raw,
            ),
          ],
        };
      }
      const issues = d.ambiguous
        ? [
            issue(
              spec,
              "ambiguous",
              `Read as ${d.iso} (day first). Written month-first this would be a different date — ` +
                `check before importing.`,
              raw,
            ),
          ]
        : [];
      return { value: d.iso, issues };
    }
    case "enum": {
      const allowed = spec.enumValues ?? [];
      const hit = matchEnum(raw, allowed);
      if (hit === undefined) {
        return {
          issues: [
            issue(
              spec,
              "not_allowed",
              `${spec.label} must be one of: ${allowed.join(", ")}.`,
              raw,
            ),
          ],
        };
      }
      return { value: hit, issues: [] };
    }
  }
}

/**
 * A whole row against a target.
 *
 * Every field is read even after one has failed. Stopping at the first problem is how an
 * operator ends up doing five upload-fix-upload cycles for a file with five bad columns,
 * and each cycle costs them more confidence in the import than the errors do.
 */
export function validateImportRow(
  target: ImportTargetSpec,
  mapped: Readonly<Record<string, SheetCell>>,
): RowValidation {
  const values: Record<string, unknown> = {};
  const issues: RowIssue[] = [];

  for (const spec of target.fields) {
    const result = readField(spec, mapped[spec.field]);
    if (result.value !== undefined) values[spec.field] = result.value;
    issues.push(...result.issues);
  }

  return { ok: issues.every(isAdvisory), values, issues };
}
