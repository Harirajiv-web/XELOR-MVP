/**
 * WHICH COLUMN IS WHICH FIELD.
 *
 * The mapping is the only part of an import the operator genuinely has to think about, and
 * the only part they will get wrong in a way nothing can detect: a file where "Rate" was
 * mapped to the credit limit imports perfectly and is completely false. So the rules here
 * are chosen to make a wrong mapping VISIBLE rather than to make mapping quick.
 *
 *   - The suggestion is a suggestion. Every mapped field stays editable, and the wizard
 *     shows what each column was matched to before anything is validated.
 *   - A field is matched by exact normalised name, then by a known alias, and only then by
 *     containment. Ordered that way because "rate" contains "rate" and so does
 *     "gst rate %", and a contains-first matcher happily maps GST% to the unit price.
 *   - Nothing is guessed twice. A column already claimed by one field cannot be claimed by
 *     another, so a sheet with one "Code" column does not silently populate both the
 *     customer code and the item code.
 *
 * `ColumnMapping` is field -> header, not header -> field. That direction is deliberate: a
 * target has a known, finite set of fields and the file has whatever it has, so keying by
 * field means an unmapped required field is a missing key rather than a search.
 */

import type { ImportTargetSpec } from "./spec.js";
import type { SheetCell, SheetRow } from "./sheet.js";

/** field name -> the column header it reads from. Fields absent from the map are not imported. */
export type ColumnMapping = Readonly<Record<string, string>>;

/** Lowercase, letters and digits only — "GST Rate %" and "gst_rate_pct" become the same thing. */
export function normaliseHeader(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * A starting mapping, matched against the field name, its label and its known aliases.
 *
 * Deliberately conservative: a field with no confident match is left unmapped rather than
 * attached to the nearest-looking column. An unmapped required field stops the import with
 * a clear message; a confidently wrong mapping does not stop anything.
 */
export function suggestColumnMapping(
  headers: readonly string[],
  target: ImportTargetSpec,
): ColumnMapping {
  const claimed = new Set<string>();
  const mapping: Record<string, string> = {};

  const candidates = headers.map((h) => ({ header: h, key: normaliseHeader(h) }));

  const claim = (field: string, header: string): void => {
    mapping[field] = header;
    claimed.add(header);
  };

  // Pass 1 — exact match on the field name, its label, or a declared alias. Required
  // fields go first so a sheet with one ambiguous "Code" column gives it to the field that
  // cannot proceed without it.
  const ordered = [...target.fields].sort(
    (a, b) => Number(b.required) - Number(a.required),
  );
  for (const spec of ordered) {
    const wanted = new Set(
      [spec.field, spec.label, ...(spec.aliases ?? [])].map(normaliseHeader),
    );
    const hit = candidates.find((c) => !claimed.has(c.header) && wanted.has(c.key));
    if (hit) claim(spec.field, hit.header);
  }

  // Pass 2 — containment, and only for fields still unmapped. "Customer Name (English)"
  // never matches exactly and is unmistakably the name column.
  for (const spec of ordered) {
    if (mapping[spec.field]) continue;
    const wanted = [spec.field, spec.label, ...(spec.aliases ?? [])]
      .map(normaliseHeader)
      // Two characters is not a match, it is a coincidence.
      .filter((w) => w.length >= 3);
    const hit = candidates.find(
      (c) =>
        !claimed.has(c.header) &&
        wanted.some((w) => c.key.includes(w) || w.includes(c.key)),
    );
    if (hit) claim(spec.field, hit.header);
  }

  return mapping;
}

/** The raw cell values for one row, keyed by target field. Unmapped fields are absent. */
export function applyColumnMapping(
  row: SheetRow,
  mapping: ColumnMapping,
): Readonly<Record<string, SheetCell>> {
  const out: Record<string, SheetCell> = {};
  for (const [field, header] of Object.entries(mapping)) {
    if (!header) continue;
    const value = row.cells[header];
    out[field] = value === undefined ? null : value;
  }
  return out;
}

/** Required fields with no column behind them. Non-empty means the import cannot start. */
export function unmappedRequiredFields(
  target: ImportTargetSpec,
  mapping: ColumnMapping,
): readonly string[] {
  return target.fields
    .filter((f) => f.required && !mapping[f.field])
    .map((f) => f.field);
}

/**
 * Columns in the file that no field reads.
 *
 * Reported rather than ignored. A sheet carrying a "Credit Limit" column that ended up
 * mapped to nothing is a fact the operator should see before they import, not after
 * somebody asks why every customer has no limit.
 */
export function unmappedColumns(
  headers: readonly string[],
  mapping: ColumnMapping,
): readonly string[] {
  const used = new Set(Object.values(mapping).filter(Boolean));
  return headers.filter((h) => !used.has(h));
}
