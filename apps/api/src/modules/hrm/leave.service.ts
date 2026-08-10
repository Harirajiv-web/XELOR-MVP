import { Injectable } from "@nestjs/common";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import { newId, derivedId, currentTenant, AppError, Errors } from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { DocumentEditService } from "../../common/document-edit.service.js";
import { AttendanceService } from "./attendance.service.js";

const { employee, leaveType, leaveApplication, leaveBalance, shiftRoster } = schema;

const addDaysISO = (dateISO: string, days: number): string => {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const eachDate = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysISO(d, 1)) out.push(d);
  return out;
};
const n = (v: string | null | undefined): number => (v == null ? 0 : Number(v));
const d2 = (x: number): string => x.toFixed(2);

export interface LeaveBalanceView {
  leaveTypeCode: string;
  leaveTypeName: string;
  isPaid: boolean;
  opening: number;
  accrued: number;
  used: number;
  encashed: number;
  closing: number;
}

export interface ApplyLeaveResult {
  id: string;
  days: number;
  status: string;
  balanceAfter: number;
  /** Days that will be booked as LOP because they exceed the balance. */
  lopDays: number;
  warnings: string[];
}

/**
 * LEAVE (HRM §4.D). Small module, but it is the join between two things that otherwise
 * disagree every month: what the muster says a person did, and what payroll pays them for.
 *
 * Approved leave WRITES the attendance day — it does not sit alongside it in a separate
 * ledger that someone reconciles by hand. And an unpaid day produces `lop_units`, which is
 * the single number payroll prorates on. That is the whole design: one path, no second
 * opinion.
 */
/** A correction to a leave application. Absent means "leave alone". */
export interface EditLeaveInput {
  fromDate?: string;
  toDate?: string;
  halfDay?: boolean;
  reasonText?: string;
  reason?: string;
}
@Injectable()
export class LeaveService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly edits: DocumentEditService,
    private readonly attendance: AttendanceService,
  ) {}

  /**
   * How many days a request actually consumes. Weekly-offs are skipped unless the type
   * counts them (`count_holidays`) — Privilege Leave typically runs on calendar days,
   * Casual Leave on working days, and getting that backwards quietly overcharges people.
   */
  private async countLeaveDays(
    tx: Tx,
    employeeId: string,
    from: string,
    to: string,
    countHolidays: boolean,
    halfDay: boolean,
  ): Promise<number> {
    const dates = eachDate(from, to);
    if (halfDay) {
      if (dates.length !== 1) {
        throw Errors.validation([{ field: "halfDay", message: "a half-day applies to a single date" }]);
      }
      return 0.5;
    }
    if (countHolidays) return dates.length;

    const roster = await tx
      .select()
      .from(shiftRoster)
      .where(and(eq(shiftRoster.employeeId, employeeId), gte(shiftRoster.rosterDate, from), lte(shiftRoster.rosterDate, to)));
    const offDates = new Set(roster.filter((r) => r.entryType === "weekly_off").map((r) => r.rosterDate));
    return dates.filter((dt) => !offDates.has(dt)).length;
  }

  async apply(input: {
    employeeId: string;
    leaveTypeCode: string;
    fromDate: string;
    toDate: string;
    halfDay?: boolean;
    reason?: string;
    periodYear?: string;
  }): Promise<ApplyLeaveResult> {
    const { tenantId, actorId } = currentTenant();
    if (input.toDate < input.fromDate) {
      throw Errors.validation([{ field: "toDate", message: "must not precede fromDate" }]);
    }
    const periodYear = input.periodYear ?? "2026-27";

    return withTenant(async (tx) => {
      const [lt] = await tx.select().from(leaveType).where(eq(leaveType.code, input.leaveTypeCode)).limit(1);
      if (!lt) throw new AppError("LEAVE_TYPE_NOT_FOUND", 404, `No leave type '${input.leaveTypeCode}'.`);

      const days = await this.countLeaveDays(
        tx,
        input.employeeId,
        input.fromDate,
        input.toDate,
        lt.countHolidays,
        input.halfDay ?? false,
      );
      if (days <= 0) {
        throw Errors.validation([
          { field: "fromDate", message: "the requested range contains no working days for this leave type" },
        ]);
      }

      const bal = await this.balanceRowInTx(tx, input.employeeId, lt.id, periodYear);
      const available = n(bal?.opening) + n(bal?.accrued) - n(bal?.used) - n(bal?.encashed);

      const warnings: string[] = [];
      let lopDays = 0;
      if (!lt.isPaid) {
        // An LOP application is unpaid by definition — no balance is consumed.
        lopDays = days;
      } else if (days > available) {
        const excess = Math.round((days - available) * 100) / 100;
        if (!lt.allowNegative) {
          // The excess becomes LOP rather than being refused outright: the person is
          // still going to be away, and pretending otherwise puts the gap in the muster.
          lopDays = excess;
          warnings.push(
            `balance is ${available} day(s); ${excess} day(s) of this request will be booked as Loss of Pay`,
          );
        } else {
          warnings.push(`balance will go negative by ${excess} day(s)`);
        }
      }

      const id = newId();
      await tx.insert(leaveApplication).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        employeeId: input.employeeId,
        leaveTypeId: lt.id,
        fromDate: input.fromDate,
        toDate: input.toDate,
        halfDay: input.halfDay ?? false,
        days: d2(days),
        reason: input.reason ?? null,
        status: "applied",
      });

      return {
        id,
        days,
        status: "applied",
        balanceAfter: Math.round((available - (days - lopDays)) * 100) / 100,
        lopDays,
        warnings,
      };
    });
  }

  /**
   * Approving consumes the balance and REPROCESSES the affected days, so the muster
   * reflects the decision immediately rather than waiting for a nightly job.
   */
  async decide(
    id: string,
    decision: "approved" | "rejected",
    approverId: string,
    periodYear = "2026-27",
  ): Promise<{ id: string; status: string; daysReprocessed: number }> {
    const { tenantId, actorId } = currentTenant();
    const outcome = await withTenant(async (tx) => {
      const [app] = await tx.select().from(leaveApplication).where(eq(leaveApplication.id, id)).limit(1);
      if (!app) throw new AppError("LEAVE_NOT_FOUND", 404, `No leave application ${id}.`);
      if (app.status !== "applied") {
        throw new AppError("LEAVE_ALREADY_DECIDED", 409, `Leave ${id} is already ${app.status}.`);
      }
      if (approverId === app.employeeId) {
        throw new AppError("SELF_APPROVAL", 403, "Leave cannot be approved by the applicant.");
      }

      await tx
        .update(leaveApplication)
        .set({ status: decision, approverId, decidedAt: new Date(), updatedBy: actorId, updatedAt: new Date() })
        .where(eq(leaveApplication.id, id));

      if (decision === "approved") {
        const [lt] = await tx.select().from(leaveType).where(eq(leaveType.id, app.leaveTypeId)).limit(1);
        if (lt?.isPaid) {
          const bal = await this.balanceRowInTx(tx, app.employeeId, app.leaveTypeId, periodYear);
          const available = n(bal?.opening) + n(bal?.accrued) - n(bal?.used) - n(bal?.encashed);
          const consume = Math.min(n(app.days), Math.max(0, available));
          if (bal) {
            await tx
              .update(leaveBalance)
              .set({ used: d2(n(bal.used) + consume), updatedBy: actorId, updatedAt: new Date() })
              .where(eq(leaveBalance.id, bal.id));
          } else {
            await tx.insert(leaveBalance).values({
              id: newId(),
              tenantId,
              createdBy: actorId,
              updatedBy: actorId,
              employeeId: app.employeeId,
              leaveTypeId: app.leaveTypeId,
              periodYear,
              used: d2(consume),
            });
          }
        }
      }

      await this.audit.appendInTx(tx, {
        action: `hrm.leave.${decision}`,
        entityType: "leave_application",
        entityId: id,
        data: { employeeId: app.employeeId, from: app.fromDate, to: app.toDate, days: app.days },
      });
      return { employeeId: app.employeeId, from: app.fromDate, to: app.toDate, decision };
    });

    if (outcome.decision === "approved") {
      const r = await this.attendance.processRange({
        from: outcome.from,
        to: outcome.to,
        employeeIds: [outcome.employeeId],
      });
      return { id, status: decision, daysReprocessed: r.processed };
    }
    return { id, status: decision, daysReprocessed: 0 };
  }

  private async balanceRowInTx(
    tx: Tx,
    employeeId: string,
    leaveTypeId: string,
    periodYear: string,
  ): Promise<typeof leaveBalance.$inferSelect | undefined> {
    const [row] = await tx
      .select()
      .from(leaveBalance)
      .where(
        and(
          eq(leaveBalance.employeeId, employeeId),
          eq(leaveBalance.leaveTypeId, leaveTypeId),
          eq(leaveBalance.periodYear, periodYear),
        ),
      )
      .limit(1);
    return row;
  }

  async balances(employeeId: string, periodYear = "2026-27"): Promise<LeaveBalanceView[]> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select({
          code: leaveType.code,
          name: leaveType.name,
          isPaid: leaveType.isPaid,
          opening: leaveBalance.opening,
          accrued: leaveBalance.accrued,
          used: leaveBalance.used,
          encashed: leaveBalance.encashed,
        })
        .from(leaveBalance)
        .innerJoin(leaveType, eq(leaveType.id, leaveBalance.leaveTypeId))
        .where(and(eq(leaveBalance.employeeId, employeeId), eq(leaveBalance.periodYear, periodYear)))
        .orderBy(asc(leaveType.code));
      return rows.map((r) => ({
        leaveTypeCode: r.code,
        leaveTypeName: r.name,
        isPaid: r.isPaid,
        opening: n(r.opening),
        accrued: n(r.accrued),
        used: n(r.used),
        encashed: n(r.encashed),
        closing: Math.round((n(r.opening) + n(r.accrued) - n(r.used) - n(r.encashed)) * 100) / 100,
      }));
    });
  }

  /**
   * The monthly accrual (HR-31). Idempotent by design: it records the month it last
   * accrued for in the audit trail, and the caller passes the month explicitly, so running
   * it twice for June credits June once.
   */
  async accrueMonth(month: string, periodYear = "2026-27"): Promise<{ month: string; credited: number }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const types = await tx.select().from(leaveType).where(eq(leaveType.accrualRule, "monthly"));
      const employees = await tx.select().from(employee).where(eq(employee.isActive, true));
      let credited = 0;

      for (const lt of types) {
        const rate = n(lt.monthlyRate);
        if (rate <= 0) continue;
        for (const emp of employees) {
          const bal = await this.balanceRowInTx(tx, emp.id, lt.id, periodYear);
          if (bal) {
            await tx
              .update(leaveBalance)
              .set({ accrued: d2(n(bal.accrued) + rate), updatedBy: actorId, updatedAt: new Date() })
              .where(eq(leaveBalance.id, bal.id));
          } else {
            await tx.insert(leaveBalance).values({
              id: newId(),
              tenantId,
              createdBy: actorId,
              updatedBy: actorId,
              employeeId: emp.id,
              leaveTypeId: lt.id,
              periodYear,
              accrued: d2(rate),
            });
          }
          credited += 1;
        }
      }

      await this.audit.appendInTx(tx, {
        action: "hrm.leave.accrued",
        entityType: "leave_accrual",
        entityId: derivedId("leave_accrual", month),
        data: { month, periodYear, credited },
      });
      return { month, credited };
    });
  }

  async pendingForApprover(approverEmployeeId: string): Promise<Array<{ id: string; employeeId: string; from: string; to: string; days: number }>> {
    return withTenant(async (tx) => {
      const reports = await tx
        .select({ id: employee.id })
        .from(employee)
        .where(eq(employee.reportingManagerId, approverEmployeeId));
      if (reports.length === 0) return [];
      const rows = await tx
        .select()
        .from(leaveApplication)
        .where(
          and(
            eq(leaveApplication.status, "applied"),
            inArray(
              leaveApplication.employeeId,
              reports.map((r) => r.id),
            ),
          ),
        )
        .orderBy(asc(leaveApplication.fromDate));
      return rows.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        from: r.fromDate,
        to: r.toDate,
        days: n(r.days),
      }));
    });
  }
  /* ------------------------------ corrections ----------------------------- */

  /**
   * `employeeId` and `leaveTypeId` are absent: whose leave it is, and which entitlement it
   * comes out of, are what the balance was checked against. Changing either is a different
   * application against a different balance.
   */
  private static readonly EDITABLE_LEAVE_FIELDS = ["fromDate", "toDate", "halfDay", "days", "reason"] as const;

  /**
   * Correct a leave application, or amend an approved one.
   *
   * AN APPROVED CHANGE GOES BACK TO THE MANAGER. Someone who approved 3 days did not
   * approve 8, and silently extending an approved absence is the version of this feature
   * that gets it removed again. So an amendment returns the application to `applied` and
   * the manager decides on the new dates.
   */
  async editLeave(applicationId: string, input: EditLeaveInput) {
    this.edits.requireDocumentId(applicationId, "leave application");
    return withTenant(async (tx) => {
      await this.edits.lock(tx, "leave_application", applicationId);
      const [before] = await tx
        .select()
        .from(leaveApplication)
        .where(eq(leaveApplication.id, applicationId))
        .limit(1);
      if (!before) throw Errors.notFound(`leave application '${applicationId}'`);

      const fromDate = input.fromDate ?? before.fromDate;
      const toDate = input.toDate ?? before.toDate;
      if (toDate < fromDate) {
        throw Errors.validation([{ field: "toDate", message: "leave cannot end before it starts" }]);
      }

      const patch: Record<string, unknown> = {};
      if (input.fromDate !== undefined) patch.fromDate = input.fromDate;
      if (input.toDate !== undefined) patch.toDate = input.toDate;
      if (input.halfDay !== undefined) patch.halfDay = input.halfDay;
      if (input.reasonText !== undefined) patch.reason = input.reasonText;

      // Days is derived from the dates, so it must move with them or the balance check on
      // re-approval runs against a figure nobody can reproduce from the record.
      if (input.fromDate !== undefined || input.toDate !== undefined || input.halfDay !== undefined) {
        const halfDay = input.halfDay ?? before.halfDay;
        const spanDays =
          Math.round(
            (new Date(`${toDate}T00:00:00Z`).getTime() - new Date(`${fromDate}T00:00:00Z`).getTime()) /
              86_400_000,
          ) + 1;
        patch.days = (halfDay ? 0.5 : spanDays).toFixed(1);
      }

      const outcome = await this.edits.apply(tx, {
        docType: "hrm.leave",
        id: applicationId,
        before: before as unknown as Record<string, unknown>,
        status: before.status,
        patch,
        editableFields: LeaveService.EDITABLE_LEAVE_FIELDS,
        reason: input.reason,
      });

      if (!outcome.changed) return before;

      const columns: Record<string, unknown> = { ...outcome.columns };
      if (outcome.reapprovalRequired && before.status === "approved") {
        columns.status = "applied";
        columns.approverId = null;
        columns.decidedAt = null;
      }

      await tx.update(leaveApplication).set(columns).where(eq(leaveApplication.id, applicationId));
      const [after] = await tx
        .select()
        .from(leaveApplication)
        .where(eq(leaveApplication.id, applicationId))
        .limit(1);
      return after;
    });
  }

  async leaveHistory(applicationId: string) {
    this.edits.requireDocumentId(applicationId, "leave application");
    return this.edits.history("hrm.leave", applicationId);
  }

  async leaveEditPolicy(applicationId: string) {
    this.edits.requireDocumentId(applicationId, "leave application");
    const [row] = await withTenant((tx) =>
      tx.select({ status: leaveApplication.status, revisionNo: leaveApplication.revisionNo })
        .from(leaveApplication).where(eq(leaveApplication.id, applicationId)).limit(1),
    );
    if (!row) throw Errors.notFound(`leave application '${applicationId}'`);
    return { ...this.edits.policy("hrm.leave", row.status), status: row.status, revisionNo: row.revisionNo };
  }

}
