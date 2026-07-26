/**
 * FIELD MASKING (ADMINISTRATION §9.4 `field_permission`).
 *
 * Applied on the way OUT, to the whole row, before it becomes JSON. Hiding a field in the
 * UI leaves it in the payload, and the payload is one devtools tab away from the person it
 * was hidden from.
 *
 * The four accesses are ordered by how much they reveal, and when two roles disagree the
 * MOST RESTRICTIVE wins. That is the opposite of how permissions combine — a permission is
 * a grant and grants add up, a mask is a restriction and restrictions must not be
 * cancellable by holding one more role. Otherwise the way to see a masked salary is to
 * collect roles until one of them forgets to mask it.
 */

export type FieldAccess = "hidden" | "masked" | "read_only" | "editable";

const RESTRICTIVENESS: Record<FieldAccess, number> = { hidden: 0, masked: 1, read_only: 2, editable: 3 };

export interface FieldRule {
  docType: string;
  fieldName: string;
  access: FieldAccess;
  /** e.g. `last4`, `initials`, `redact` — how a `masked` value is rendered. */
  maskFormat?: string | null;
}

/** The most restrictive rule per field, which is how conflicting role rules resolve. */
export function resolveFieldRules(docType: string, rules: readonly FieldRule[]): Map<string, FieldRule> {
  const out = new Map<string, FieldRule>();
  for (const r of rules) {
    if (r.docType !== docType) continue;
    const existing = out.get(r.fieldName);
    if (!existing || RESTRICTIVENESS[r.access] < RESTRICTIVENESS[existing.access]) {
      out.set(r.fieldName, r);
    }
  }
  return out;
}

/** Render a value under a mask format. Unknown formats redact rather than reveal. */
export function maskValue(value: unknown, format?: string | null): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  switch (format) {
    case "last4":
      return s.length <= 4 ? "•".repeat(s.length) : `${"•".repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
    case "initials":
      return s
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => `${w[0]!.toUpperCase()}.`)
        .join(" ");
    case "domain_only": {
      const at = s.indexOf("@");
      return at > 0 ? `•••@${s.slice(at + 1)}` : "•••";
    }
    case "amount_band": {
      const n = Number(s);
      if (!Number.isFinite(n)) return "•••";
      // A band still supports "is this large?" without disclosing the figure.
      const mag = Math.abs(n);
      if (mag === 0) return "0";
      const digits = Math.floor(Math.log10(mag));
      const lower = 10 ** digits;
      return `${lower.toLocaleString("en-IN")}–${(lower * 10).toLocaleString("en-IN")}`;
    }
    default:
      // An unrecognised format must not fall through to the raw value. Redacting a field
      // nobody meant to redact is a support ticket; revealing one is a breach.
      return "•••";
  }
}

export interface MaskedRow {
  row: Record<string, unknown>;
  /** Fields removed entirely. */
  hidden: string[];
  /** Fields replaced with a masked rendering. */
  masked: string[];
  /** Fields the user may see but not change. */
  readOnly: string[];
}

export function applyFieldRules(row: Record<string, unknown>, resolved: Map<string, FieldRule>): MaskedRow {
  const out: Record<string, unknown> = {};
  const hidden: string[] = [];
  const masked: string[] = [];
  const readOnly: string[] = [];

  for (const [k, v] of Object.entries(row)) {
    const rule = resolved.get(k);
    if (!rule || rule.access === "editable") {
      out[k] = v;
      continue;
    }
    if (rule.access === "hidden") {
      hidden.push(k);
      continue; // the key does not appear at all — its absence is the point
    }
    if (rule.access === "masked") {
      out[k] = maskValue(v, rule.maskFormat);
      masked.push(k);
      continue;
    }
    out[k] = v;
    readOnly.push(k);
  }

  return { row: out, hidden: hidden.sort(), masked: masked.sort(), readOnly: readOnly.sort() };
}

/** What a user is allowed to WRITE — masked and read-only fields are refused, not ignored. */
export function rejectUnwritableFields(
  patch: Record<string, unknown>,
  resolved: Map<string, FieldRule>,
): { ok: boolean; refused: { field: string; access: FieldAccess }[]; reason: string } {
  const refused: { field: string; access: FieldAccess }[] = [];
  for (const k of Object.keys(patch)) {
    const rule = resolved.get(k);
    if (rule && rule.access !== "editable") refused.push({ field: k, access: rule.access });
  }
  if (refused.length === 0) return { ok: true, refused, reason: "Every field in this change is writable by this user." };
  return {
    ok: false,
    refused: refused.sort((a, b) => a.field.localeCompare(b.field)),
    // Silently dropping the field would be worse: the user believes the change saved.
    reason: `Refused: ${refused.map((r) => `${r.field} is ${r.access}`).join(", ")}. The change was not applied — dropping the field silently would look like it saved.`,
  };
}
