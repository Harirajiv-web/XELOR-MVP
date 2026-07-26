import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { schema, type Tx } from "@ind-core/db";
import { AppError } from "@ind-core/platform";

const { documentSeries } = schema;

/**
 * Every document type that draws a number from the shared series. Adding a member here
 * without seeding its row is caught at once and loudly — `next()` refuses rather than
 * inventing a fallback, because a document that quietly numbers itself outside the series
 * is exactly the row an auditor finds and nobody can explain.
 */
export type DocSeriesType =
  | "sales_order"
  | "delivery_note"
  | "purchase_order"
  | "goods_receipt"
  | "production_order"
  | "inspection"
  | "disposition"
  | "voucher_journal"
  | "voucher_invoice"
  | "receipt"
  | "maintenance_request"
  | "maintenance_work_order"
  | "payroll_run";

/**
 * Shared, gapless, per-financial-year document numbering (see `document_series`).
 *
 * Allocates INSIDE the caller's transaction, like AuditLogService appends: the number and
 * the document commit together or neither does.
 */
@Injectable()
export class NumberingService {
  async next(tx: Tx, docType: DocSeriesType, fyCode: string): Promise<string> {
    const rows = await tx
      .update(documentSeries)
      .set({ nextNo: sql`${documentSeries.nextNo} + 1`, updatedAt: new Date() })
      .where(and(eq(documentSeries.docType, docType), eq(documentSeries.fyCode, fyCode)))
      .returning({
        prefix: documentSeries.prefix,
        width: documentSeries.width,
        allocated: documentSeries.nextNo,
      });
    const row = rows[0];
    if (!row) {
      throw new AppError(
        "DOC_SERIES_NOT_CONFIGURED",
        422,
        `No ${docType} numbering series is configured for FY ${fyCode}. ` +
          `Configure the series before creating documents in that year.`,
      );
    }
    // nextNo is the value AFTER the increment; the number just handed out is one less.
    const allocated = row.allocated - 1;
    return `${row.prefix}-${fyCode}-${String(allocated).padStart(row.width, "0")}`;
  }
}

/**
 * Indian financial year code for a date: April to March. 20-Jul-2026 → `2627`,
 * 15-Feb-2027 → `2627`, 01-Apr-2027 → `2728`.
 */
export function fyCode(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(2)}${String(start + 1).slice(2)}`;
}

/** FY code for right now — the common case at a create endpoint. */
export function currentFyCode(): string {
  return fyCode(new Date().toISOString());
}
