/**
 * HOW NUMBERS AND DATES ARE WRITTEN. One place, because an ERP that formats money two
 * different ways on two screens has already lost the argument about whether it can be
 * trusted with the total.
 */

/**
 * Money, in the Indian grouping: ₹18,45,231.50 — lakhs and crores, not thousands.
 *
 * FULL PRECISION, ALWAYS, in tables and documents. An accountant reconciling against a GST
 * return needs the figure that is actually stored, and `NUMERIC(18,2)` stores paise. The
 * lakh/crore abbreviation below exists for dashboards and is deliberately a different
 * function, so nobody reaches for it by accident in a ledger.
 */
export function inr(value: number | string | null | undefined, opts?: { sign?: boolean }): string {
  const n = toNumber(value);
  if (n === null) return "—";
  const negative = n < 0;
  const body = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  // Parentheses for negatives, the convention every Indian accountant already reads from
  // Tally — and, usefully, a signal that survives colour-blindness where red alone does not.
  if (negative) return `(${body})`;
  return opts?.sign && n > 0 ? `+${body}` : body;
}

/**
 * Money for a dashboard tile: ₹42.3 L, ₹2.1 Cr.
 *
 * Never use this where a number must be individually auditable. It must always be paired
 * with the exact figure on hover or focus — an abbreviation that is the ONLY representation
 * of a number is a number the user cannot check.
 */
export function inrShort(value: number | string | null | undefined): string {
  const n = toNumber(value);
  if (n === null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)} L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)} K`;
  return `${sign}₹${abs.toFixed(2)}`;
}

/** A plain number in Indian grouping, no currency symbol. */
export function num(value: number | string | null | undefined, decimals = 0): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

/**
 * A quantity with its unit: "163.2 nos".
 *
 * The unit travels with the value rather than living only in a column header, because
 * these tables get exported, screenshotted and pasted into WhatsApp, and a bare 163.2 in a
 * message is a number nobody can act on.
 */
export function qty(value: number | string | null | undefined, uom?: string | null): string {
  const n = toNumber(value);
  if (n === null) return "—";
  // Trailing zeros dropped: 22.000 reads as false precision on a count of castings.
  const text = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(n);
  return uom ? `${text} ${uom}` : text;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 20-Jul-2026. Unambiguous — 07/08/2026 means two different days on two continents. */
export function date(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** 20-Jul-2026 14:32 — for audit trails and anything where the hour matters. */
export function dateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return `${date(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * "3 days overdue" / "in 5 days" / "today".
 *
 * Relative phrasing ALWAYS accompanies the absolute date, never replaces it. "In 5 days" is
 * what a person acts on; "25-Jul-2026" is what they put in an email, and a screen that
 * shows only the first forces them to do arithmetic to write the second.
 */
export function relativeDays(value: string | Date | null | undefined, from = new Date()): string {
  const d = toDate(value);
  if (!d) return "";
  const days = Math.round((startOfDay(d).getTime() - startOfDay(from).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  return `in ${days} days`;
}

/** Turn `partially_dispatched` into `Partially dispatched`. */
export function humanise(value: string | null | undefined): string {
  if (!value) return "—";
  const s = value.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* --------------------------------- internals -------------------------------- */

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
