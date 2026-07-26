import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import { AppError, currentTenant } from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";

const { mrpRun, planException } = schema;

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

export interface ExceptionFilter {
  runNo?: string;
  status?: string;
  severity?: string;
  exceptionType?: string;
  itemCode?: string;
}

/**
 * THE EXCEPTION WORKLIST — the module's home screen.
 *
 * A regenerative run over a real factory produces thousands of planned orders and almost
 * none of them need a human. The exceptions are the actual product: the short list of
 * things that will go wrong unless somebody does something this week.
 *
 * Three rules the actions here enforce:
 *
 *  - **A snooze needs a date.** Otherwise it is a dismissal wearing a friendlier word, and
 *    the thing it was hiding surfaces as a shortage six weeks later.
 *  - **Every action is attributable.** Accepting an exception is a decision about material
 *    and money; the row records who and when, and the database refuses a non-open row that
 *    does not carry both.
 *  - **Accepting does not perform.** Accepting a `release_now` marks the decision; the
 *    conversion is a separate, explicit act. An exception list that silently creates work
 *    orders is a plan that acts, and this system's whole position is that plans do not act.
 */
@Injectable()
export class PlanExceptionService {
  constructor(private readonly audit: AuditLogService) {}

  async list(filter: ExceptionFilter = {}): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const runId = filter.runNo ? (await this.runByNo(tx, filter.runNo)).id : await this.latestRunId(tx);
      if (!runId) return [];
      const rows = await tx.select().from(planException).where(eq(planException.runId, runId));

      return rows
        .filter((r) => (filter.status ? r.status === filter.status : true))
        .filter((r) => (filter.severity ? r.severity === filter.severity : true))
        .filter((r) => (filter.exceptionType ? r.exceptionType === filter.exceptionType : true))
        .filter((r) => (filter.itemCode ? r.itemCode === filter.itemCode : true))
        // Worst first, so a planner works down the page and stops when time runs out.
        .sort(
          (a, b) =>
            SEVERITY_ORDER.indexOf(a.severity as (typeof SEVERITY_ORDER)[number]) -
              SEVERITY_ORDER.indexOf(b.severity as (typeof SEVERITY_ORDER)[number]) ||
            a.itemCode.localeCompare(b.itemCode) ||
            a.exceptionType.localeCompare(b.exceptionType),
        )
        .map((r) => ({ ...r }));
    });
  }

  /** One sentence a plant manager can act on, plus the counts behind it. */
  async summary(runNo?: string): Promise<Record<string, unknown>> {
    const rows = await this.list({ runNo, status: "open" });
    const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    const byType: Record<string, number> = {};
    for (const r of rows) {
      const sev = String(r.severity);
      const type = String(r.exceptionType);
      bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;
      byType[type] = (byType[type] ?? 0) + 1;
    }
    const headline =
      (bySeverity.critical ?? 0) > 0
        ? `${bySeverity.critical} critical exception(s) need a decision today.`
        : (bySeverity.high ?? 0) > 0
          ? `${bySeverity.high} exception(s) need attention this week; nothing is critical.`
          : rows.length > 0
            ? "Nothing urgent — the worklist is routine releases and housekeeping."
            : "The plan is clean: no open exceptions in this horizon.";
    return { openCount: rows.length, bySeverity, byType, headline };
  }

  async accept(exceptionId: string, note?: string): Promise<Record<string, unknown>> {
    return this.transition(exceptionId, "accepted", { note });
  }

  async close(exceptionId: string, note?: string): Promise<Record<string, unknown>> {
    return this.transition(exceptionId, "closed", { note });
  }

  /**
   * Snooze until a date.
   *
   * The date is mandatory and the database enforces it. A snooze with no date is how an
   * uncomfortable exception disappears — and a past-due casting that was snoozed
   * indefinitely in July is a stopped line in August.
   */
  async snooze(exceptionId: string, until: string, note?: string): Promise<Record<string, unknown>> {
    if (!until) {
      throw new AppError("PLAN_SNOOZE_NEEDS_DATE", 422, "A snooze needs a date to wake up on, or it is a dismissal wearing a friendlier word.");
    }
    return this.transition(exceptionId, "snoozed", { note, snoozedUntil: until });
  }

  private async transition(
    exceptionId: string,
    status: "accepted" | "snoozed" | "closed",
    opts: { note?: string; snoozedUntil?: string },
  ): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [row] = await tx.select().from(planException).where(eq(planException.id, exceptionId)).limit(1);
      if (!row) throw new AppError("PLAN_EXCEPTION_NOT_FOUND", 404, "That exception does not exist.");
      if (row.status !== "open" && row.status !== "snoozed") {
        throw new AppError("PLAN_EXCEPTION_SETTLED", 409, `This exception is already ${row.status}.`);
      }

      await tx
        .update(planException)
        .set({
          status,
          snoozedUntil: opts.snoozedUntil ?? null,
          actionedBy: actorId,
          actionedAt: new Date(),
          actionNote: opts.note ?? null,
          updatedBy: actorId,
          updatedAt: new Date(),
        })
        .where(eq(planException.id, exceptionId));

      await this.audit.appendInTx(tx, {
        action: `planning.exception.${status}`,
        entityType: "plan_exception",
        entityId: exceptionId,
        data: { exceptionType: row.exceptionType, itemCode: row.itemCode, ref: row.ref, note: opts.note ?? null, snoozedUntil: opts.snoozedUntil ?? null },
      });

      return {
        id: exceptionId,
        status,
        itemCode: row.itemCode,
        exceptionType: row.exceptionType,
        // Accepting records a decision; it does not perform one. The conversion is a
        // separate, explicit act.
        note:
          status === "accepted"
            ? `Recorded. ${row.suggestion} — do that next; accepting did not do it for you.`
            : status === "snoozed"
              ? `Hidden until ${opts.snoozedUntil}. It will come back.`
              : "Closed.",
      };
    });
  }

  private async runByNo(tx: Tx, runNo: string) {
    const [run] = await tx.select().from(mrpRun).where(eq(mrpRun.runNo, runNo)).limit(1);
    if (!run) throw new AppError("PLAN_RUN_NOT_FOUND", 404, `Planning run ${runNo} does not exist.`);
    return run;
  }

  private async latestRunId(tx: Tx): Promise<string | null> {
    const [run] = await tx.select({ id: mrpRun.id }).from(mrpRun).orderBy(desc(mrpRun.createdAt)).limit(1);
    return run?.id ?? null;
  }

  /** Exceptions still open on a given item, newest run first — the drill-down from a plan row. */
  async forItem(itemCode: string): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select()
        .from(planException)
        .where(and(eq(planException.itemCode, itemCode), eq(planException.status, "open")))
        .orderBy(asc(planException.severity), desc(planException.createdAt));
      return rows.map((r) => ({ ...r }));
    });
  }
}
