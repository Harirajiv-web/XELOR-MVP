import { integer, pgTable, smallint, text, unique } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * PLATFORM DOCUMENT NUMBERING (§5).
 *
 * Fifteen call sites across six modules used to build their document number from the last
 * segment of the row's uuid — `SO-358FA43E8CC9`, `MO-E888CA3EE91F`, `INV-C61FFD56B224`.
 * It is unique and it sorts, so nothing failed. Three things were wrong with it anyway:
 *
 *   - **A tax invoice number is regulated.** CGST Rule 46(b) requires a CONSECUTIVE serial
 *     number, not exceeding sixteen characters, unique for a financial year. A uuid
 *     fragment is unique and sixteen characters and is not consecutive, so the series was
 *     not compliant — the one number in the system where that is a legal question rather
 *     than a matter of taste.
 *   - **A document number is read aloud.** A storekeeper quotes a GRN number over a
 *     telephone and a customer quotes an invoice number in an email. `GRN-345C75F7FBFA`
 *     cannot be dictated without spelling it, and cannot be checked by eye against a
 *     printed challan.
 *   - **It carries no year.** `SO-2627-00014` says which financial year's series it belongs
 *     to; the uuid form says nothing, so a register cannot be reconciled by reading it.
 *
 * The counter is a single row per (tenant, doc type, financial year). Allocation is one
 * `UPDATE … RETURNING`, which takes a row lock for the rest of the caller's transaction:
 * two clerks saving in the same millisecond serialise on that row and get consecutive
 * numbers, and — because the increment is inside the caller's transaction — a document
 * that fails to insert does not burn a number that would then be missing from the series
 * for ever. Gaplessness is the requirement; a sequence would not give it.
 *
 * CSP (`csp_document_series`) and EXPENDITURE keep their own equivalent tables. They were
 * built correctly and are covered by their own tests; converting them is churn with
 * regression risk and no user-visible gain, and Expenditure is on hold pending review.
 * They should be folded into this table when either is next opened.
 */
export const documentSeries = pgTable(
  "document_series",
  {
    ...tenantScopedColumns,
    /** sales_order | purchase_order | goods_receipt | production_order | … */
    docType: text("doc_type").notNull(),
    /** SO | PO | GRN | MO | INV | JV | RCPT | DN | INS | DSP | MWO | MR | PRUN */
    prefix: text("prefix").notNull(),
    /** Indian financial year, April-first. 20-Jul-2026 → `2627`. */
    fyCode: text("fy_code").notNull(),
    /** Zero-padding width. 5 keeps INV-2627-00001 at 16 characters — Rule 46(b)'s ceiling. */
    width: smallint("width").notNull().default(5),
    /** The NEXT number to hand out; the one just allocated is this minus one. */
    nextNo: integer("next_no").notNull().default(1),
  },
  (t) => [unique("uq_document_series").on(t.tenantId, t.docType, t.fyCode)],
);
