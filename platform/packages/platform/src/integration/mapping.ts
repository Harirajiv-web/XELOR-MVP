/**
 * FIELD MAPPING (INTEGRATION §9 `field_mapping`, §11).
 *
 * Every integration is, underneath, somebody else's field names turned into ours. The
 * mapping is configuration rather than code because the shape of a bank's ACK file changes
 * without warning and a code deploy is not an acceptable response to that.
 *
 * Two rules that stop a mapping from lying:
 *
 *  - **A required field that maps to nothing FAILS the message.** The tempting alternative
 *    — pass the row through with a null — produces a stock entry with no quantity or a
 *    payment with no beneficiary, and those are discovered days later by a person.
 *  - **A transform that throws FAILS the message.** A transform silently returning the raw
 *    value on error is how a date stays a string all the way into a numeric column.
 */

export type LookupTable = "uqc_codes" | "gst_state_codes" | "tally_ledger_map";

export interface FieldMapping {
  seq: number;
  sourcePath: string;
  canonicalPath: string;
  targetPath?: string | null;
  /** A named transform, not arbitrary code — an integration mapping is not a scripting host. */
  transform?: TransformName | null;
  defaultValue?: string | null;
  isRequired: boolean;
  lookupTable?: LookupTable | null;
}

export type TransformName =
  | "trim"
  | "upper"
  | "lower"
  | "digits_only"
  | "to_number"
  | "to_iso_date"
  | "paise_to_rupees"
  | "rupees_to_paise"
  | "boolean_yn";

/** Read `a.b[0].c` out of a nested object. */
export function readPath(source: unknown, path: string): unknown {
  const parts = path.split(".").flatMap((p) => {
    const m = p.match(/^([^[\]]+)((\[\d+\])*)$/);
    if (!m) return [p];
    const idxs = [...(m[2] ?? "").matchAll(/\[(\d+)\]/g)].map((x) => x[1]!);
    return [m[1]!, ...idxs];
  });
  let cur: unknown = source;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function writePath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const p = parts[i]!;
    if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

export class TransformError extends Error {
  constructor(readonly transform: string, readonly value: unknown, message: string) {
    super(message);
    this.name = "TransformError";
  }
}

/** Named transforms. Each one THROWS on bad input rather than passing the raw value through. */
export function applyTransform(name: TransformName, value: unknown): unknown {
  const s = value == null ? "" : String(value);
  switch (name) {
    case "trim":
      return s.trim();
    case "upper":
      return s.trim().toUpperCase();
    case "lower":
      return s.trim().toLowerCase();
    case "digits_only":
      return s.replace(/\D/g, "");
    case "to_number": {
      const n = Number(s.replace(/,/g, "").trim());
      if (!Number.isFinite(n)) throw new TransformError(name, value, `'${s}' is not a number. Passing it through would put text into a numeric column.`);
      return n;
    }
    case "to_iso_date": {
      const t = s.trim();
      // dd/mm/yyyy and dd-mm-yyyy are what Indian systems actually emit, and reading them
      // as mm/dd silently produces a valid-looking wrong date for eleven days a month.
      const dmy = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (dmy) {
        const [, d, m, y] = dmy;
        const iso = `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
        if (Number.isNaN(Date.parse(iso))) throw new TransformError(name, value, `'${t}' is not a real date.`);
        return iso;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
      throw new TransformError(name, value, `'${t}' is not a recognised date. Expected dd/mm/yyyy or yyyy-mm-dd — never mm/dd, which silently produces a wrong date eleven days a month.`);
    }
    case "paise_to_rupees": {
      const n = Number(s);
      if (!Number.isFinite(n)) throw new TransformError(name, value, `'${s}' is not an amount.`);
      return Math.round(n) / 100;
    }
    case "rupees_to_paise": {
      const n = Number(s);
      if (!Number.isFinite(n)) throw new TransformError(name, value, `'${s}' is not an amount.`);
      return Math.round(n * 100);
    }
    case "boolean_yn":
      return /^(y|yes|true|1)$/i.test(s.trim());
  }
}

export interface MappingResult {
  ok: boolean;
  output: Record<string, unknown>;
  /** Every required field that mapped to nothing. */
  missingRequired: string[];
  errors: { path: string; message: string }[];
  appliedDefaults: string[];
  summary: string;
}

/**
 * Run a mapping over one source record.
 *
 * Collects EVERY failure rather than stopping at the first. A mapping being configured for
 * the first time is usually wrong in four places, and finding them one deploy at a time is
 * how a two-hour job becomes a two-day one.
 */
export function applyMapping(
  source: unknown,
  mappings: readonly FieldMapping[],
  lookups: Partial<Record<LookupTable, Record<string, string>>> = {},
): MappingResult {
  const output: Record<string, unknown> = {};
  const missingRequired: string[] = [];
  const errors: { path: string; message: string }[] = [];
  const appliedDefaults: string[] = [];

  for (const m of [...mappings].sort((a, b) => a.seq - b.seq)) {
    let value = readPath(source, m.sourcePath);

    if (value === undefined || value === null || value === "") {
      if (m.defaultValue != null) {
        value = m.defaultValue;
        appliedDefaults.push(m.canonicalPath);
      } else if (m.isRequired) {
        // Deliberately a failure, not a null. A stock entry with no quantity is discovered
        // days later by a person, and by then the source file is gone.
        missingRequired.push(m.canonicalPath);
        continue;
      } else {
        continue;
      }
    }

    if (m.lookupTable) {
      const table = lookups[m.lookupTable] ?? {};
      const mapped = table[String(value)];
      if (mapped === undefined) {
        errors.push({
          path: m.canonicalPath,
          message: `'${String(value)}' is not in the ${m.lookupTable} lookup. Passing an unmapped code through is how 'NOS' and 'PCS' end up as two different units of the same thing.`,
        });
        continue;
      }
      value = mapped;
    }

    if (m.transform) {
      try {
        value = applyTransform(m.transform, value);
      } catch (e) {
        errors.push({ path: m.canonicalPath, message: e instanceof TransformError ? e.message : String(e) });
        continue;
      }
    }

    writePath(output, m.canonicalPath, value);
  }

  const ok = missingRequired.length === 0 && errors.length === 0;
  return {
    ok,
    output,
    missingRequired,
    errors,
    appliedDefaults,
    summary: ok
      ? `Mapped ${mappings.length} field(s)${appliedDefaults.length ? `, ${appliedDefaults.length} from defaults` : ""}.`
      : `Refused: ${missingRequired.length} required field(s) missing${errors.length ? `, ${errors.length} transform/lookup failure(s)` : ""}. The message was not passed on with holes in it.`,
  };
}

/**
 * Dry-run a mapping over a sample, without sending anything.
 *
 * The point of a pre-flight is to find the four things that are wrong before the first real
 * message, not after it. It reports per-row results and the fields that failed most often —
 * which is almost always one mis-typed source path rather than four unrelated problems.
 */
export function dryRun(
  samples: readonly unknown[],
  mappings: readonly FieldMapping[],
  lookups: Partial<Record<LookupTable, Record<string, string>>> = {},
): {
  rows: MappingResult[];
  okCount: number;
  failedCount: number;
  worstFields: { path: string; failures: number }[];
  headline: string;
} {
  const rows = samples.map((s) => applyMapping(s, mappings, lookups));
  const okCount = rows.filter((r) => r.ok).length;
  const tally = new Map<string, number>();
  for (const r of rows) {
    for (const p of r.missingRequired) tally.set(p, (tally.get(p) ?? 0) + 1);
    for (const e of r.errors) tally.set(e.path, (tally.get(e.path) ?? 0) + 1);
  }
  const worstFields = [...tally.entries()]
    .map(([path, failures]) => ({ path, failures }))
    .sort((a, b) => b.failures - a.failures);

  return {
    rows,
    okCount,
    failedCount: rows.length - okCount,
    worstFields,
    headline:
      okCount === rows.length
        ? `All ${rows.length} sample row(s) map cleanly.`
        : `${rows.length - okCount} of ${rows.length} sample rows would fail. ${worstFields[0] ? `Start with '${worstFields[0].path}' — it fails on ${worstFields[0].failures} of them, which usually means one mis-typed source path rather than several unrelated problems.` : ""}`,
  };
}
