import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { schema, type Tx } from "@ind-core/db";
import { AppError } from "@ind-core/platform";

const { expDocumentSeries } = schema;

export type ExpDocType = "claim" | "travel" | "advance" | "indirect" | "batch";

/**
 * Document numbering for EXP / TRV / ADV / RMB.
 *
 * The same `UPDATE … RETURNING` under a row lock the CSP series uses: two people creating a
 * claim in the same millisecond serialise on one row and get consecutive numbers, and a
 * document that fails to insert does not burn a number that is then missing for ever.
 *
 * Claims and indirect expenses deliberately SHARE the `EXP-2627` prefix on separate
 * counters, which is what §20 describes — a finance team reads one series for "money out
 * that is not a PO", whether it started as somebody's hotel bill or a vendor's invoice.
 */
@Injectable()
export class ExpNumberingService {
  async next(tx: Tx, docType: ExpDocType, fyCode: string): Promise<string> {
    const rows = await tx
      .update(expDocumentSeries)
      .set({ nextNo: sql`${expDocumentSeries.nextNo} + 1`, updatedAt: new Date() })
      .where(and(eq(expDocumentSeries.docType, docType), eq(expDocumentSeries.fyCode, fyCode)))
      .returning({ prefix: expDocumentSeries.prefix, width: expDocumentSeries.width, allocated: expDocumentSeries.nextNo });
    const row = rows[0];
    if (!row) {
      throw new AppError(
        "EXP_SERIES_NOT_CONFIGURED",
        422,
        `No ${docType} numbering series is configured for FY ${fyCode}.`,
      );
    }
    return `${row.prefix}-${fyCode}-${String(row.allocated - 1).padStart(row.width, "0")}`;
  }
}
