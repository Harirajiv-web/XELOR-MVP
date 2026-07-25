/**
 * The pure GST brain (SMBD §11.2, DECISIONS-V2 §3.4). Every statutory number here is
 * CONFIG, never a constant baked into a code path — the working agreement, and the reason
 * a rate change or a notification date is a data edit rather than a release.
 *
 * Three decisions, all deterministic and testable without a database:
 *   1. WHERE is the supply    — place of supply from the ship-to state (IGST Act).
 *   2. WHICH TAX applies      — intra-state ⇒ CGST + SGST at half rate each;
 *                               inter-state ⇒ IGST at the full rate.
 *   3. WHAT IS OWED           — line taxable value, rate-wise splits, rupee-rounded total.
 *
 * The output carries everything Accounts' e-invoice builder needs to assemble the IRP
 * payload (seller GSTIN, buyer GSTIN, place of supply, HSN, rate-wise splits) so nothing
 * is re-keyed at invoice time.
 */

/** GST state codes (first two digits of a GSTIN). Data, so a new UT is a data edit. */
export const GST_STATE_CODES: Readonly<Record<string, string>> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

/** Unregistered person — the literal the IRP expects when a party has no GSTIN. */
export const URP = "URP";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHECKSUM_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function isValidGstinFormat(gstin: string): boolean {
  const g = gstin?.trim().toUpperCase() ?? "";
  if (!GSTIN_RE.test(g)) return false;
  return GST_STATE_CODES[g.slice(0, 2)] !== undefined;
}

/**
 * The GSTIN check digit (Luhn mod-36 over the first 14 characters). Kept SEPARATE from
 * format validation on purpose: a typo'd-but-well-formed GSTIN is a different failure from
 * a malformed one, and demo/test fixtures are routinely well-formed without being real.
 */
export function gstinChecksumChar(first14: string): string {
  const s = first14.trim().toUpperCase();
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const value = CHECKSUM_ALPHABET.indexOf(s[i]!);
    if (value < 0) return "";
    const factor = i % 2 === 0 ? 1 : 2;
    const product = value * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHECKSUM_ALPHABET[(36 - (sum % 36)) % 36]!;
}

export function isGstinChecksumValid(gstin: string): boolean {
  const g = gstin?.trim().toUpperCase() ?? "";
  if (g.length !== 15) return false;
  return gstinChecksumChar(g.slice(0, 14)) === g[14];
}

export function stateCodeOfGstin(gstin: string): string | null {
  const g = gstin?.trim().toUpperCase() ?? "";
  const code = g.slice(0, 2);
  return GST_STATE_CODES[code] ? code : null;
}

export function stateName(stateCode: string): string | null {
  return GST_STATE_CODES[stateCode] ?? null;
}

/** HSN must be 4, 6 or 8 digits (6-digit reporting is mandatory above ₹5 crore AATO). */
export function isValidHsn(hsn: string): boolean {
  const h = hsn?.trim() ?? "";
  return /^\d+$/.test(h) && (h.length === 4 || h.length === 6 || h.length === 8);
}

/* -------------------------------------------------------------------------- */
/* Statutory configuration — dates and rules that MUST be editable as data.    */
/* -------------------------------------------------------------------------- */

export interface GstConfig {
  /**
   * From this date the IRP requires Ship-to GSTIN on e-invoice / EWB-by-IRN payloads
   * ("URP" when the consignee is unregistered) — DECISIONS-V2 §3.4, ranked risk #1,
   * effective 1 Aug 2026. A date, not an `if (today > …)` buried in a service.
   */
  shipToGstinMandatoryFrom: string; // ISO date
  /**
   * Whether a GSTIN's check digit must verify, not merely its shape.
   *
   * OFF by default, deliberately and with evidence: the canonical §7 demo GSTINs
   * (`27AABCT1234F1Z5`, `33AABCT1234F1Z9`) are well-formed but carry INVALID check digits
   * — they are fictional. Enforcing the checksum globally would make the entire demo
   * universe unusable. Production tenants turn this on; the demo tenant does not. The
   * checksum itself is always computed and available, it is only the REJECTION that is
   * configurable.
   */
  enforceGstinChecksum: boolean;
}

export const DEFAULT_GST_CONFIG: GstConfig = {
  shipToGstinMandatoryFrom: "2026-08-01",
  enforceGstinChecksum: false,
};

export interface GstinValidation {
  ok: boolean;
  stateCode: string | null;
  formatOk: boolean;
  checksumOk: boolean;
  reason?: string;
}

/** The one call a service should make: shape always, check digit per tenant config. */
export function validateGstin(gstin: string, config: GstConfig = DEFAULT_GST_CONFIG): GstinValidation {
  const g = gstin?.trim().toUpperCase() ?? "";
  const formatOk = isValidGstinFormat(g);
  const checksumOk = formatOk && isGstinChecksumValid(g);
  if (!formatOk) {
    return { ok: false, stateCode: null, formatOk, checksumOk, reason: `'${gstin}' is not a valid GSTIN.` };
  }
  if (config.enforceGstinChecksum && !checksumOk) {
    return {
      ok: false,
      stateCode: stateCodeOfGstin(g),
      formatOk,
      checksumOk,
      reason: `GSTIN '${g}' has an invalid check digit (expected '${gstinChecksumChar(g.slice(0, 14))}').`,
    };
  }
  return { ok: true, stateCode: stateCodeOfGstin(g), formatOk, checksumOk };
}

/** Is Ship-to GSTIN mandatory for a document dated `docDate`? */
export function shipToGstinRequired(docDate: string, config: GstConfig = DEFAULT_GST_CONFIG): boolean {
  return docDate >= config.shipToGstinMandatoryFrom;
}

export interface ShipToCheck {
  ok: boolean;
  /** The value to put in ShipDtls.Gstin — the GSTIN, or "URP" when unregistered. */
  value: string | null;
  reason?: string;
}

/**
 * Validate the ship-to party for the IRP payload. Once the mandate is live, a blank
 * ship-to GSTIN is a hard failure at ORDER time — long before the invoice is built —
 * because that is the only point where a human can still ask the customer for it.
 */
export function checkShipToGstin(input: {
  docDate: string;
  shipToGstin?: string | null;
  shipToIsRegistered: boolean;
  config?: GstConfig;
}): ShipToCheck {
  const { docDate, shipToIsRegistered } = input;
  const raw = input.shipToGstin?.trim().toUpperCase() ?? "";
  const required = shipToGstinRequired(docDate, input.config ?? DEFAULT_GST_CONFIG);

  if (!shipToIsRegistered) {
    // Unregistered consignee: the literal "URP" is what the IRP expects. Recorded ALWAYS,
    // not only once the mandate is live — it is valid either side of the date, and a field
    // that changes meaning on 1 Aug is a field somebody forgets to backfill.
    return { ok: true, value: URP };
  }
  if (!raw) {
    return required
      ? {
          ok: false,
          value: null,
          reason:
            `Ship-to GSTIN is mandatory on documents dated ${input.config?.shipToGstinMandatoryFrom ?? DEFAULT_GST_CONFIG.shipToGstinMandatoryFrom} ` +
            `or later (use "${URP}" if the consignee is unregistered).`,
        }
      : { ok: true, value: null };
  }
  if (raw !== URP && !isValidGstinFormat(raw)) {
    return { ok: false, value: null, reason: `Ship-to GSTIN '${raw}' is not a valid GSTIN.` };
  }
  return { ok: true, value: raw };
}

/* -------------------------------------------------------------------------- */
/* The tax computation itself.                                                 */
/* -------------------------------------------------------------------------- */

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
/** Invoice grand totals are rounded to the rupee; the difference is shown as round-off. */
export const roundRupee = (n: number): number => Math.round(n);

export interface TaxableLineInput {
  lineNo: number;
  qty: number;
  rate: number; // unit price
  discountPct?: number;
  gstRatePct: number; // 0 | 5 | 12 | 18 | 28
  hsn: string;
}

export interface TaxedLine {
  lineNo: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;
}

/**
 * Place of supply for GOODS is the shipping destination state. Intra-state when it equals
 * the supplier's registration state — which is why a two-GSTIN tenant matters: the SAME
 * customer is intra-state from one plant and inter-state from the other.
 */
export function isInterState(supplierGstin: string, placeOfSupplyStateCode: string): boolean {
  const supplierState = stateCodeOfGstin(supplierGstin);
  if (!supplierState) throw new Error(`supplier GSTIN '${supplierGstin}' has no valid state code`);
  return supplierState !== placeOfSupplyStateCode;
}

export function computeLineTax(line: TaxableLineInput, interState: boolean): TaxedLine {
  if (line.qty <= 0) throw new Error(`line ${line.lineNo}: qty must be > 0`);
  if (line.rate < 0) throw new Error(`line ${line.lineNo}: rate must be >= 0`);
  const disc = line.discountPct ?? 0;
  if (disc < 0 || disc >= 100) throw new Error(`line ${line.lineNo}: discount must be 0..99.99`);

  const taxableValue = round2(line.qty * line.rate * (1 - disc / 100));
  // Half the rate to CGST and half to SGST — computed from the rate, never hardcoded.
  const cgst = interState ? 0 : round2((taxableValue * line.gstRatePct) / 200);
  const sgst = interState ? 0 : round2((taxableValue * line.gstRatePct) / 200);
  const igst = interState ? round2((taxableValue * line.gstRatePct) / 100) : 0;

  return {
    lineNo: line.lineNo,
    taxableValue,
    cgst,
    sgst,
    igst,
    lineTotal: round2(taxableValue + cgst + sgst + igst),
  };
}

export interface OrderTaxTotals {
  interState: boolean;
  placeOfSupply: string;
  lines: TaxedLine[];
  subtotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  /** subtotal + tax before rupee rounding. */
  netTotal: number;
  /** The rupee round-off shown as its own line on the document. */
  roundOff: number;
  grandTotal: number;
  /** Rate-wise split, which is what the IRP payload and GSTR-1 both want. */
  rateWise: Array<{ gstRatePct: number; taxableValue: number; cgst: number; sgst: number; igst: number }>;
}

/**
 * Totals for a whole document. A CHECK constraint in the schema guarantees a document is
 * never both intra- and inter-state; this function is why it can never happen in the first
 * place — one `interState` decision drives every line.
 */
export function computeOrderTax(input: {
  supplierGstin: string;
  placeOfSupplyStateCode: string;
  lines: TaxableLineInput[];
}): OrderTaxTotals {
  if (input.lines.length === 0) throw new Error("a document must have at least one line");
  for (const l of input.lines) {
    if (!isValidHsn(l.hsn)) {
      throw new Error(`line ${l.lineNo}: HSN '${l.hsn}' must be 4, 6 or 8 digits`);
    }
  }
  if (!GST_STATE_CODES[input.placeOfSupplyStateCode]) {
    throw new Error(`place of supply '${input.placeOfSupplyStateCode}' is not a GST state code`);
  }

  const interState = isInterState(input.supplierGstin, input.placeOfSupplyStateCode);
  const lines = input.lines.map((l) => computeLineTax(l, interState));

  const sum = (pick: (t: TaxedLine) => number): number => round2(lines.reduce((a, t) => a + pick(t), 0));
  const subtotal = sum((t) => t.taxableValue);
  const cgstTotal = sum((t) => t.cgst);
  const sgstTotal = sum((t) => t.sgst);
  const igstTotal = sum((t) => t.igst);
  const taxTotal = round2(cgstTotal + sgstTotal + igstTotal);
  const netTotal = round2(subtotal + taxTotal);
  const grandTotal = roundRupee(netTotal);

  const byRate = new Map<number, { gstRatePct: number; taxableValue: number; cgst: number; sgst: number; igst: number }>();
  input.lines.forEach((src, i) => {
    const t = lines[i]!;
    const b = byRate.get(src.gstRatePct) ?? {
      gstRatePct: src.gstRatePct,
      taxableValue: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
    };
    b.taxableValue = round2(b.taxableValue + t.taxableValue);
    b.cgst = round2(b.cgst + t.cgst);
    b.sgst = round2(b.sgst + t.sgst);
    b.igst = round2(b.igst + t.igst);
    byRate.set(src.gstRatePct, b);
  });

  return {
    interState,
    placeOfSupply: input.placeOfSupplyStateCode,
    lines,
    subtotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    taxTotal,
    netTotal,
    roundOff: round2(grandTotal - netTotal),
    grandTotal,
    rateWise: [...byRate.values()].sort((a, b) => a.gstRatePct - b.gstRatePct),
  };
}
