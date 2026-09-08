/**
 * WHAT CHANGED — the before/after record an edit leaves behind.
 *
 * An audit row saying "someone edited SO-0007" is nearly worthless: the question a
 * reviewer actually asks, months later, is *what did it say before*. So an edit writes a
 * field-level change set, and the change set is what gets hashed into the chain (§3.3).
 *
 * Three rules the shape enforces:
 *
 *   1. ONLY WHAT MOVED. Echoing the whole document doubles the audit table and buries the
 *      one field that mattered. Fields that are equal are dropped.
 *
 *   2. NO SECRETS IN THE TRAIL. The audit log is readable by anyone with the audit
 *      permission, which is a wider group than the people who may read a salary or a PAN.
 *      Sensitive fields record THAT they changed and never the values.
 *
 *   3. STABLE TEXT. Values are stringified deterministically, because the hash chain must
 *      produce the same digest for the same change on any machine. `NUMERIC(18,2)` money
 *      arrives as a string already and stays one — a float round-trip would silently
 *      rewrite ₹1,234.10.
 */

/** One field that moved. `from`/`to` are display strings, never raw objects. */
export interface FieldChange {
  readonly field: string;
  readonly from: string;
  readonly to: string;
  /** True when the values were withheld because the field is sensitive. */
  readonly redacted?: boolean;
}

export interface ChangeSet {
  readonly changes: readonly FieldChange[];
  /** Set when the caller supplied one — required for an `amend`. */
  readonly reason?: string;
  /** The document's revision after this change, when the document is revisioned. */
  readonly revisionNo?: number;
}

/**
 * Fields whose VALUES never enter the audit trail. Matched case-insensitively against the
 * field name's segments, so `pan`, `employee.pan` and `panNumber` all match.
 *
 * This list is deliberately blunt. A field wrongly redacted costs a reviewer one extra
 * query; a salary wrongly published cannot be taken back.
 */
const SENSITIVE = [
  "pan",
  "aadhaar",
  "aadhar",
  "uan",
  "esic",
  "bankaccount",
  "accountnumber",
  "ifsc",
  "salary",
  "ctc",
  "grosspay",
  "netpay",
  "basicpay",
  "password",
  "secret",
  "token",
  "apikey",
  "otp",
  "dob",
  "dateofbirth",
];

function isSensitive(field: string): boolean {
  const flat = field.toLowerCase().replace(/[^a-z]/g, "");
  return SENSITIVE.some((s) => flat.includes(s));
}

/**
 * Render a value the way it will be READ, not the way it is stored.
 *
 * `null` and `undefined` both become "(empty)" rather than "null", because the audit trail
 * is read by people who did not write the schema.
 */
function render(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, Object.keys(value as object).sort());
    } catch {
      return "(unreadable)";
    }
  }
  return String(value);
}

/**
 * Compare two versions of a document and return only the fields that moved.
 *
 * `fields` names what to compare. Passing it explicitly — rather than diffing every key —
 * keeps `updated_at` and `updated_by` out of every change set, and means adding a column
 * cannot quietly start leaking it into the audit trail.
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const field of fields) {
    // A field the caller did not supply is a field the caller is not changing. This is
    // what makes PATCH semantics work: absent means "leave alone", not "set to null".
    if (!(field in after)) continue;

    const from = render(before[field]);
    const to = render(after[field]);
    if (from === to) continue;

    if (isSensitive(field)) {
      changes.push({ field, from: "(redacted)", to: "(redacted)", redacted: true });
    } else {
      changes.push({ field, from, to });
    }
  }

  return changes;
}

/**
 * Build the change set an audit append will carry.
 *
 * Returns `null` when nothing moved — and the caller should then do nothing at all, not
 * write an empty audit row. "User pressed Save and changed nothing" is not an event worth
 * eight years of storage, and a chain full of them makes the real edits harder to find.
 */
export function buildChangeSet(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
  opts?: { reason?: string | null; revisionNo?: number },
): ChangeSet | null {
  const changes = diffFields(before, after, fields);
  if (changes.length === 0) return null;

  return {
    changes,
    ...(opts?.reason?.trim() ? { reason: opts.reason.trim() } : {}),
    ...(opts?.revisionNo !== undefined ? { revisionNo: opts.revisionNo } : {}),
  };
}

/**
 * One line per change, for a UI that wants to show the edit without formatting it itself.
 * Used by the confirm-the-change step and by the document History tab.
 */
export function describeChangeSet(set: ChangeSet): string[] {
  return set.changes.map((c) =>
    c.redacted
      ? `${c.field} changed (value hidden)`
      : `${c.field}: ${c.from} → ${c.to}`,
  );
}
