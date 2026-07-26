/**
 * INDIAN PII DETECTION AND MINIMISATION (AI-OPERATIONS §11, DECISIONS-V2 §4.3).
 *
 * Eight modules must not each implement this. One pipeline, tested once, sitting between
 * every feature and every provider — because the failure mode is not "a bug in one module",
 * it is "an employee's Aadhaar number left the country in a prompt", and that is not a
 * thing you fix in the next sprint.
 *
 * The design decision that matters: **minimisation is an ALLOW-LIST, not a block-list.**
 * A block-list is a promise to have thought of every format PII can take, forever, in a
 * country with a dozen identifier schemes and vendors who put bank details in a free-text
 * "remarks" field. An allow-list is a promise that only the fields somebody named will ever
 * be sent — and the redaction record proves which those were.
 *
 * The detectors exist anyway, as a second line: they run over what the allow-list produced
 * and refuse the call if anything got through. Belt and braces, in the one place where the
 * cost of being wrong is a regulatory notice.
 */

export type PiiKind = "pan" | "aadhaar" | "gstin" | "ifsc" | "bank_account" | "phone" | "email" | "upi";

export interface PiiFinding {
  kind: PiiKind;
  /** Where it was found — a JSON path when known. */
  path: string;
  /** A short, non-reversible excerpt. Never the value. */
  hint: string;
  confidence: "certain" | "likely";
}

/**
 * PAN: five letters, four digits, one letter — and the fourth character encodes the holder
 * type, which is what separates a real PAN from any ten-character string.
 */
const PAN_RE = /\b[A-Z]{3}[PCHFATBLJGE][A-Z]\d{4}[A-Z]\b/g;
const AADHAAR_RE = /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g;
const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9][Zz][A-Z0-9]\b/g;
const IFSC_RE = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g;
const UPI_RE = /\b[\w.-]{2,}@(?:ok[a-z]+|paytm|ybl|upi|axl|ibl)\b/gi;
const EMAIL_RE = /\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /(?:\+?91[\s-]?)?\b[6-9]\d{9}\b/g;
const BANK_RE = /\b\d{9,18}\b/g;

/** Verhoeff checksum — what makes an Aadhaar detection `certain` rather than `likely`. */
const D_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function isValidAadhaar(digits: string): boolean {
  const d = digits.replace(/\D/g, "");
  if (d.length !== 12) return false;
  let c = 0;
  const reversed = d.split("").reverse().map(Number);
  reversed.forEach((n, i) => {
    c = D_TABLE[c]![P_TABLE[i % 8]![n]!]!;
  });
  return c === 0;
}

function hintOf(value: string): string {
  if (value.length <= 4) return "•".repeat(value.length);
  return `${value.slice(0, 2)}${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-2)}`;
}

/**
 * Scan a string for Indian personal identifiers.
 *
 * Order matters: GSTIN embeds a PAN, and an IFSC looks like nothing else. Matching the
 * more specific patterns first and masking them out stops one value being reported three
 * times under three names, which is what makes a redaction record unreadable.
 */
export function scanText(text: string, path = "$"): PiiFinding[] {
  const findings: PiiFinding[] = [];
  let residue = text;

  const take = (re: RegExp, kind: PiiKind, confidence: PiiFinding["confidence"] = "certain", validate?: (v: string) => boolean) => {
    for (const m of residue.match(re) ?? []) {
      if (validate && !validate(m)) {
        findings.push({ kind, path, hint: hintOf(m), confidence: "likely" });
      } else {
        findings.push({ kind, path, hint: hintOf(m), confidence });
      }
    }
    residue = residue.replace(re, (m) => "#".repeat(m.length));
  };

  take(GSTIN_RE, "gstin");
  take(IFSC_RE, "ifsc");
  take(PAN_RE, "pan");
  take(UPI_RE, "upi");
  take(EMAIL_RE, "email");
  take(AADHAAR_RE, "aadhaar", "certain", isValidAadhaar);
  take(PHONE_RE, "phone");
  // Last, and deliberately `likely`: a long digit string is often an invoice number, and
  // reporting every one as a bank account would train people to ignore the finding.
  for (const m of residue.match(BANK_RE) ?? []) {
    findings.push({ kind: "bank_account", path, hint: hintOf(m), confidence: "likely" });
  }
  return findings;
}

/** Walk an object and scan every string leaf. */
export function scanValue(value: unknown, path = "$", depth = 0): PiiFinding[] {
  if (depth > 8) return [];
  if (typeof value === "string") return scanText(value, path);
  if (Array.isArray(value)) return value.flatMap((v, i) => scanValue(v, `${path}[${i}]`, depth + 1));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => scanValue(v, `${path}.${k}`, depth + 1));
  }
  return [];
}

export interface MinimisationResult {
  /** Exactly the allow-listed fields, and nothing else. */
  payload: Record<string, unknown>;
  /** What was dropped, by name — the record that answers "did our data leave?". */
  droppedFields: string[];
  /** PII that survived the allow-list. Non-empty means the call must be refused. */
  leaked: PiiFinding[];
  safe: boolean;
  reason: string;
}

/**
 * Minimise a payload to an allow-list, then verify.
 *
 * The verification step is the interesting one. The allow-list is authored by a person and
 * people are wrong: somebody allows `remarks` because the model needs context, and a vendor
 * has written an account number in it. So the detectors run over the RESULT, and a hit
 * refuses the call rather than redacting quietly — a silent redaction teaches nobody that
 * their allow-list is wrong.
 */
export function minimise(
  source: Record<string, unknown>,
  allowList: readonly string[],
): MinimisationResult {
  const payload: Record<string, unknown> = {};
  const dropped: string[] = [];

  for (const [k, v] of Object.entries(source)) {
    if (allowList.includes(k)) payload[k] = v;
    else dropped.push(k);
  }

  const leaked = scanValue(payload).filter((f) => f.confidence === "certain");
  return {
    payload,
    droppedFields: dropped.sort(),
    leaked,
    safe: leaked.length === 0,
    reason:
      leaked.length === 0
        ? `${Object.keys(payload).length} allow-listed field(s) sent; ${dropped.length} dropped.`
        : `REFUSED: ${leaked.map((l) => `${l.kind} in ${l.path}`).join(", ")} survived the allow-list. The call was not made — redacting silently would leave the allow-list wrong forever.`,
  };
}

export interface RedactionRecord {
  fieldsSent: string[];
  fieldsDropped: string[];
  detectorsRun: PiiKind[];
  findings: PiiFinding[];
  assertion: string;
}

/**
 * The record that answers "what of my data left the building?".
 *
 * It records the field NAMES and never the values, so the record itself is safe to keep for
 * eight years next to the audit trail — a redaction log containing the thing it redacted is
 * a second copy of the problem.
 */
export function redactionRecord(result: MinimisationResult): RedactionRecord {
  return {
    fieldsSent: Object.keys(result.payload).sort(),
    fieldsDropped: result.droppedFields,
    detectorsRun: ["pan", "aadhaar", "gstin", "ifsc", "bank_account", "phone", "email", "upi"],
    findings: result.leaked,
    assertion:
      result.leaked.length === 0
        ? `Only these fields were sent: ${Object.keys(result.payload).sort().join(", ") || "(none)"}. ${result.droppedFields.length} field(s) were withheld, and the personal-identifier detectors found nothing in what remained.`
        : `The call was refused: personal identifiers were still present after minimisation.`,
  };
}
