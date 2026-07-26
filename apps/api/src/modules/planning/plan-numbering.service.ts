import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { schema, type Tx } from "@ind-core/db";
import { AppError, currentTenant } from "@ind-core/platform";

const { planNumberSeries } = schema;

export type PlanSeriesKey = "mrp_run" | "schedule" | "requisition";

/**
 * Document numbering for PLANNING.
 *
 * The counter is bumped under `SELECT … FOR UPDATE`, so two planners starting a run in the
 * same second get MRP-2627-00007 and MRP-2627-00008 rather than both getting 00007 and one
 * of them losing to the unique constraint. Gapless numbering matters less here than in a
 * statutory series — a planning run is not a tax document — but a duplicate run number
 * makes two different plans indistinguishable in a conversation, which is worse.
 */
@Injectable()
export class PlanNumberingService {
  async next(tx: Tx, key: PlanSeriesKey, fiscalYear: string): Promise<string> {
    const { tenantId } = currentTenant();
    const rows = await tx.execute<{ id: string; prefix: string; next_number: number; width: number }>(sql`
      select id, prefix, next_number, width
        from plan_number_series
       where tenant_id = ${tenantId} and series_key = ${key} and fiscal_year = ${fiscalYear}
       for update
    `);
    const row = rows.rows[0];
    if (!row) {
      throw new AppError(
        "PLAN_SERIES_MISSING",
        422,
        `No ${key} number series is configured for ${fiscalYear}. Numbering is configuration, not a constant in code.`,
      );
    }
    await tx
      .update(planNumberSeries)
      .set({ nextNumber: row.next_number + 1, updatedAt: new Date() })
      .where(and(eq(planNumberSeries.id, row.id)));
    return `${row.prefix}${String(row.next_number).padStart(row.width, "0")}`;
  }
}
