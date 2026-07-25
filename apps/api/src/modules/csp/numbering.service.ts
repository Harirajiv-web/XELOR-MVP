import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { schema, type Tx } from "@ind-core/db";
import { AppError } from "@ind-core/platform";

const { cspDocumentSeries } = schema;

export type CspDocType = "ticket" | "complaint" | "spare_request";

/**
 * Document numbering.
 *
 * TKT-2627-00031 is a number a customer reads out on the telephone, so it is allocated
 * from a counter rather than derived from a uuid suffix: gapless, ordered, and stable for
 * the life of the financial year.
 *
 * The allocation is a single `UPDATE … RETURNING`, which takes a row lock for the duration
 * of the enclosing transaction. Two agents creating a ticket in the same millisecond
 * therefore serialise on that one row and get consecutive numbers — and because the update
 * is part of the caller's transaction, a ticket that fails to insert does not consume a
 * number that would then be missing for ever.
 */
@Injectable()
export class NumberingService {
  async next(tx: Tx, docType: CspDocType, fyCode: string): Promise<string> {
    const rows = await tx
      .update(cspDocumentSeries)
      .set({ nextNo: sql`${cspDocumentSeries.nextNo} + 1`, updatedAt: new Date() })
      .where(and(eq(cspDocumentSeries.docType, docType), eq(cspDocumentSeries.fyCode, fyCode)))
      .returning({
        prefix: cspDocumentSeries.prefix,
        width: cspDocumentSeries.width,
        allocated: cspDocumentSeries.nextNo,
      });
    const row = rows[0];
    if (!row) {
      throw new AppError(
        "CSP_SERIES_NOT_CONFIGURED",
        422,
        `No ${docType} numbering series is configured for FY ${fyCode}; configure one before creating documents.`,
      );
    }
    // `nextNo` is the value AFTER the increment, so the number just allocated is one less.
    const allocated = row.allocated - 1;
    return `${row.prefix}-${fyCode}-${String(allocated).padStart(row.width, "0")}`;
  }
}

/** FY code for a date: Indian financial year, April to March. 20-Jul-2026 → `2627`. */
export function fyCodeFor(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const startYear = m >= 4 ? y : y - 1;
  return `${String(startYear).slice(2)}${String(startYear + 1).slice(2)}`;
}
