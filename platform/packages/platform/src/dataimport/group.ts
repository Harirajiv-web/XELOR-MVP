/**
 * ROWS BACK INTO DOCUMENTS.
 *
 * A spreadsheet is flat and a sales order is not. An order with three lines is three rows
 * that repeat the customer and the PO number, and turning those back into one document with
 * three lines is the step that decides whether an import produces a factory's real order
 * book or three hundred one-line orders nobody can dispatch.
 *
 * Two rules, and the second one exists because of what real files contain:
 *
 * 1. ROWS SHARING THE GROUP KEY BECOME ONE DOCUMENT, and they succeed or fail together. A
 *    partially-created order — two of three lines, because line 3 named a part that does
 *    not exist — is a commitment to the customer that nobody made. The group is the unit.
 *
 * 2. HEADER FIELDS MUST AGREE ACROSS THE GROUP. The same PO number appearing with two
 *    different order dates is not a formatting quirk; it means either the sheet has two
 *    different orders under one number, or somebody edited one row and not the others.
 *    Taking the first row's value silently is how the wrong date reaches a customer's
 *    acknowledgement, so a disagreement is reported and the group is refused.
 *
 * Targets without `groupBy` — every master, and opening stock — get one group per row, so
 * the caller has a single code path and no special case for "documents that are just rows".
 */

import type { ImportTargetSpec } from "./spec.js";
import type { RowIssue } from "./validate.js";

export interface GroupableRow {
  /** The spreadsheet row number, carried through so an error still points at what they see. */
  rowNo: number;
  values: Readonly<Record<string, unknown>>;
}

export interface RowGroup {
  /** Stable within one import: the group-key values joined, or the row number when ungrouped. */
  key: string;
  /** Document-level values, taken from the first row and verified identical across the group. */
  header: Readonly<Record<string, unknown>>;
  rows: readonly GroupableRow[];
  /** Disagreements between rows that claim to be the same document. Non-empty refuses the group. */
  conflicts: readonly RowIssue[];
}

function keyOf(row: GroupableRow, fields: readonly string[]): string {
  return fields
    .map((f) => {
      const v = row.values[f];
      // Case-folded: "cust-bac" and "CUST-BAC" on two rows of the same sheet are one
      // customer, and treating them as two produces two orders for one PO number.
      const text = v === undefined || v === null ? "" : String(v).trim().toLowerCase();
      // Escaped before it is joined. Without this "AB" + "C" and "A" + "BC" produce the
      // same key, and two unrelated customers' orders quietly become one document.
      return text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
    })
    .join("|");
}

/**
 * Group rows the way the target says its documents are shaped.
 *
 * Order is preserved: groups come back in the order their first row appears in the file, so
 * a summary reads down the sheet the way the operator does.
 */
export function groupImportRows(
  target: ImportTargetSpec,
  rows: readonly GroupableRow[],
): readonly RowGroup[] {
  const groupBy = target.groupBy;
  if (!groupBy || groupBy.length === 0) {
    return rows.map((row) => ({
      key: String(row.rowNo),
      header: row.values,
      rows: [row],
      conflicts: [],
    }));
  }

  const byKey = new Map<string, GroupableRow[]>();
  for (const row of rows) {
    const key = keyOf(row, groupBy);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }

  const headerFields = target.headerFields ?? groupBy;
  const out: RowGroup[] = [];
  for (const [key, bucket] of byKey) {
    const first = bucket[0]!;
    const conflicts: RowIssue[] = [];
    for (const field of headerFields) {
      const spec = target.fields.find((f) => f.field === field);
      const expected = first.values[field];
      for (const row of bucket.slice(1)) {
        const actual = row.values[field];
        if (String(actual ?? "") === String(expected ?? "")) continue;
        conflicts.push({
          field,
          label: spec?.label ?? field,
          kind: "not_allowed",
          message:
            `Rows ${first.rowNo} and ${row.rowNo} are the same document but disagree on ` +
            `${spec?.label ?? field} ("${String(expected ?? "")}" vs "${String(actual ?? "")}"). ` +
            `Make them match, or give them different reference numbers.`,
          value: String(actual ?? ""),
        });
      }
    }
    out.push({
      key,
      header: first.values,
      rows: bucket,
      conflicts,
    });
  }
  return out;
}
