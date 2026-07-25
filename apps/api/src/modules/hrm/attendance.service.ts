import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  newId,
  derivedId,
  currentTenant,
  eventName,
  processAttendanceDay,
  summariseMonth,
  DEFAULT_ATTENDANCE_POLICY,
  AppError,
  Errors,
  type AttendanceDayResult,
  type DayContext,
  type MonthSummary,
  type PunchRecord,
  type ShiftDef,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { BIOMETRIC_DEVICE, type BiometricDevice, type DevicePunch } from "../../ports/biometric.port.js";

const {
  employee,
  shift,
  shiftRoster,
  biometricPunch,
  attendanceDay,
  regularisationRequest,
  leaveApplication,
  leaveType,
  outboxEvent,
} = schema;

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

const monthBounds = (month: string): { from: string; to: string } => {
  const from = `${month}-01`;
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return { from, to: d.toISOString().slice(0, 10) };
};

export interface IngestResult {
  status: "accepted" | "duplicate";
  adapter?: string;
}

export interface MusterRow {
  employeeId: string;
  empCode: string;
  name: string;
  days: Array<{ date: string; status: string; otHours: number; exceptions: string[] }>;
  summary: MonthSummary;
}

/**
 * ATTENDANCE (HRM §4.C) — capture, processing, muster and lock.
 *
 * The arithmetic lives in `@ind-core/platform` as a pure function; this service does the
 * three things a database is needed for: collect the punches append-only, feed the engine a
 * complete DayContext (roster, holiday, leave, neighbouring shifts), and persist the result.
 *
 * Reprocessing is therefore always safe. That property is not a nicety — it is what lets a
 * disputed day be re-derived instead of argued about, and what lets a regularisation be an
 * APPENDED corrective punch rather than an edit to what the device recorded.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly audit: AuditLogService,
    @Inject(BIOMETRIC_DEVICE) private readonly device: BiometricDevice,
  ) {}

  /* ------------------------------ punch ingest ---------------------------- */

  /**
   * The device-agnostic ingest (HR-20). Idempotent on (tenant, device, employee, instant):
   * a duplicate is REPORTED, not raised, because at-least-once delivery from a device
   * bridge is normal operation rather than an error condition.
   */
  async ingestPunch(input: DevicePunch): Promise<IngestResult> {
    return withTenant((tx) => this.ingestInTx(tx, input));
  }

  private async ingestInTx(tx: Tx, input: DevicePunch): Promise<IngestResult> {
    const { tenantId, actorId } = currentTenant();
    const [emp] = await tx.select().from(employee).where(eq(employee.empCode, input.empCode)).limit(1);
    if (!emp) {
      // Every rejected punch is accounted for (§15.3 rule 11) — never silently dropped.
      throw new AppError("UNKNOWN_EMP_CODE", 422, `No employee with code '${input.empCode}'.`);
    }
    const inserted = await tx
      .insert(biometricPunch)
      .values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        deviceId: input.deviceId,
        empCode: input.empCode,
        employeeId: emp.id,
        punchTime: new Date(input.punchTime),
        direction: input.direction,
        source: input.source,
        clientPunchId: input.clientPunchId ?? null,
      })
      .onConflictDoNothing({
        target: [biometricPunch.tenantId, biometricPunch.deviceId, biometricPunch.empCode, biometricPunch.punchTime],
      })
      .returning({ id: biometricPunch.id });
    return { status: inserted.length > 0 ? "accepted" : "duplicate" };
  }

  /** Pull a window from whatever adapter is bound to the port and ingest it. */
  async pollDevice(fromIso: string, toIso: string): Promise<{ adapter: string; polled: number; accepted: number; duplicates: number }> {
    const punches = await this.device.poll(fromIso, toIso);
    let accepted = 0;
    let duplicates = 0;
    await withTenant(async (tx) => {
      for (const p of punches) {
        const r = await this.ingestInTx(tx, p);
        if (r.status === "accepted") accepted += 1;
        else duplicates += 1;
      }
    });
    return { adapter: this.device.adapterName, polled: punches.length, accepted, duplicates };
  }

  /* -------------------------------- roster -------------------------------- */

  /**
   * Bulk-assign a shift over a date range with rotational weekly-offs.
   *
   * `weeklyOffDays` are indices into the range, not "Sundays" — a rotational off is a
   * roster ENTRY, and inferring it from the calendar is the assumption that breaks every
   * three-shift factory (§15.2 rule 6).
   */
  async assignRoster(input: {
    employeeIds: string[];
    from: string;
    to: string;
    shiftCode: string;
    weeklyOffWeekday: number; // 0=Sunday .. 6=Saturday
  }): Promise<{ assigned: number; weeklyOffs: number }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [sh] = await tx.select().from(shift).where(eq(shift.code, input.shiftCode)).limit(1);
      if (!sh) throw new AppError("SHIFT_NOT_FOUND", 404, `No shift '${input.shiftCode}'.`);

      let assigned = 0;
      let weeklyOffs = 0;
      for (const employeeId of input.employeeIds) {
        for (const date of eachDate(input.from, input.to)) {
          const isOff = new Date(`${date}T00:00:00Z`).getUTCDay() === input.weeklyOffWeekday;
          await tx
            .insert(shiftRoster)
            .values({
              id: newId(),
              tenantId,
              createdBy: actorId,
              updatedBy: actorId,
              employeeId,
              rosterDate: date,
              shiftId: isOff ? null : sh.id,
              entryType: isOff ? "weekly_off" : "shift",
              status: "published",
            })
            .onConflictDoNothing({
              target: [shiftRoster.tenantId, shiftRoster.employeeId, shiftRoster.rosterDate],
            });
          if (isOff) weeklyOffs += 1;
          else assigned += 1;
        }
      }
      return { assigned, weeklyOffs };
    });
  }

  /* ---------------------------- the processing loop ----------------------- */

  /**
   * Recompute attendance for a date range. Pure in, pure out: this method loads the world,
   * calls the engine, and writes the answer. It never adjusts a number itself.
   *
   * Days already locked for payroll are SKIPPED and counted, not raised on — a reprocess
   * that overlaps a closed month should be a no-op with a report, not a failure.
   */
  async processRange(input: {
    from: string;
    to: string;
    employeeIds?: string[];
  }): Promise<{ processed: number; skippedLocked: number; pendingRegularisations: number }> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const employees = await tx
        .select()
        .from(employee)
        .where(
          input.employeeIds?.length
            ? and(eq(employee.isActive, true), inArray(employee.id, input.employeeIds))
            : eq(employee.isActive, true),
        );
      const shifts = await tx.select().from(shift);
      const shiftById = new Map(shifts.map((s) => [s.id, s]));

      // Widen the punch window by a day either side: a C-shift out-punch belongs to the
      // PREVIOUS attendance date, and the first day of the range may need the one before it.
      const rosterRows = await tx
        .select()
        .from(shiftRoster)
        .where(and(gte(shiftRoster.rosterDate, addDaysISO(input.from, -1)), lte(shiftRoster.rosterDate, addDaysISO(input.to, 1))));
      const rosterByKey = new Map(rosterRows.map((r) => [`${r.employeeId}|${r.rosterDate}`, r]));

      const punches = await tx
        .select()
        .from(biometricPunch)
        .where(
          and(
            gte(biometricPunch.punchTime, new Date(`${addDaysISO(input.from, -1)}T00:00:00Z`)),
            lte(biometricPunch.punchTime, new Date(`${addDaysISO(input.to, 2)}T00:00:00Z`)),
          ),
        )
        .orderBy(asc(biometricPunch.punchTime));
      const punchesByEmp = new Map<string, PunchRecord[]>();
      for (const p of punches) {
        const list = punchesByEmp.get(p.empCode) ?? [];
        list.push({
          punchTime: p.punchTime.toISOString(),
          direction: p.direction as PunchRecord["direction"],
          source: p.source as PunchRecord["source"],
        });
        punchesByEmp.set(p.empCode, list);
      }

      // Approved leave, with its type's paid flag — this is what turns an absence into
      // either a paid day or an LOP unit that payroll will prorate on.
      const leaves = await tx
        .select({
          employeeId: leaveApplication.employeeId,
          fromDate: leaveApplication.fromDate,
          toDate: leaveApplication.toDate,
          halfDay: leaveApplication.halfDay,
          id: leaveApplication.id,
          code: leaveType.code,
          isPaid: leaveType.isPaid,
        })
        .from(leaveApplication)
        .innerJoin(leaveType, eq(leaveType.id, leaveApplication.leaveTypeId))
        .where(
          and(
            eq(leaveApplication.status, "approved"),
            lte(leaveApplication.fromDate, input.to),
            gte(leaveApplication.toDate, input.from),
          ),
        );

      const locked = await tx
        .select({ employeeId: attendanceDay.employeeId, attDate: attendanceDay.attDate })
        .from(attendanceDay)
        .where(
          and(eq(attendanceDay.locked, true), gte(attendanceDay.attDate, input.from), lte(attendanceDay.attDate, input.to)),
        );
      const lockedKeys = new Set(locked.map((l) => `${l.employeeId}|${l.attDate}`));

      let processed = 0;
      let skippedLocked = 0;
      let pending = 0;

      for (const emp of employees) {
        const empPunches = punchesByEmp.get(emp.empCode) ?? [];
        for (const date of eachDate(input.from, input.to)) {
          if (lockedKeys.has(`${emp.id}|${date}`)) {
            skippedLocked += 1;
            continue;
          }
          const roster = rosterByKey.get(`${emp.id}|${date}`);
          if (!roster) continue; // unrostered day — nothing to compute

          const sh = roster.shiftId ? shiftById.get(roster.shiftId) : undefined;
          const leave = leaves.find((l) => l.employeeId === emp.id && l.fromDate <= date && l.toDate >= date);

          const ctx: DayContext = {
            attDate: date,
            entryType: roster.entryType as "shift" | "weekly_off",
            // Holiday calendars belong to GENERAL; §20.3 records no MH/TN holiday in June,
            // so the demo month legitimately has an empty calendar.
            isHoliday: false,
            ...(sh ? { shift: this.toShiftDef(sh) } : {}),
            ...(leave ? { leave: { leaveTypeCode: leave.code, isPaid: leave.isPaid, halfDay: leave.halfDay } } : {}),
            ...this.neighbourWindows(emp.id, date, rosterByKey, shiftById),
          };

          const result = processAttendanceDay(ctx, empPunches, DEFAULT_ATTENDANCE_POLICY);
          if (result.status === "pending_reg") pending += 1;

          await tx
            .insert(attendanceDay)
            .values({
              id: newId(),
              tenantId,
              createdBy: actorId,
              updatedBy: actorId,
              employeeId: emp.id,
              attDate: date,
              shiftId: roster.shiftId,
              firstIn: result.firstIn ? new Date(result.firstIn) : null,
              lastOut: result.lastOut ? new Date(result.lastOut) : null,
              workedHours: result.workedHours.toFixed(2),
              otHours: result.otHours.toFixed(2),
              lateMinutes: result.lateMinutes,
              status: result.status,
              lopUnits: result.lopUnits.toFixed(2),
              payableUnits: result.payableUnits.toFixed(2),
              exceptions: result.exceptions,
              leaveApplicationId: leave?.id ?? null,
            })
            .onConflictDoUpdate({
              target: [attendanceDay.tenantId, attendanceDay.employeeId, attendanceDay.attDate],
              set: {
                shiftId: roster.shiftId,
                firstIn: result.firstIn ? new Date(result.firstIn) : null,
                lastOut: result.lastOut ? new Date(result.lastOut) : null,
                workedHours: result.workedHours.toFixed(2),
                otHours: result.otHours.toFixed(2),
                lateMinutes: result.lateMinutes,
                status: result.status,
                lopUnits: result.lopUnits.toFixed(2),
                payableUnits: result.payableUnits.toFixed(2),
                exceptions: result.exceptions,
                leaveApplicationId: leave?.id ?? null,
                updatedBy: actorId,
                updatedAt: new Date(),
              },
            });
          processed += 1;
        }
      }

      return { processed, skippedLocked, pendingRegularisations: pending };
    });
  }

  private toShiftDef(s: typeof shift.$inferSelect): ShiftDef {
    return {
      code: s.code,
      startTime: s.startTime.slice(0, 5),
      endTime: s.endTime.slice(0, 5),
      breakMinutes: s.breakMinutes,
      graceMinutes: s.graceMinutes,
      isNight: s.isNight,
      otAfterMinutes: s.otAfterMinutes,
      halfDayThresholdMinutes: s.halfDayThresholdMinutes,
    };
  }

  /** Bound the pairing window with the adjacent rostered shifts (§15.2 rule 7). */
  private neighbourWindows(
    employeeId: string,
    date: string,
    rosterByKey: Map<string, typeof shiftRoster.$inferSelect>,
    shiftById: Map<string, typeof shift.$inferSelect>,
  ): { prevShiftEndsAt?: string; nextShiftStartsAt?: string } {
    const out: { prevShiftEndsAt?: string; nextShiftStartsAt?: string } = {};
    const prev = rosterByKey.get(`${employeeId}|${addDaysISO(date, -1)}`);
    const next = rosterByKey.get(`${employeeId}|${addDaysISO(date, 1)}`);
    const prevShift = prev?.shiftId ? shiftById.get(prev.shiftId) : undefined;
    const nextShift = next?.shiftId ? shiftById.get(next.shiftId) : undefined;
    if (prev && prevShift) {
      const endDate = prevShift.isNight ? date : prev.rosterDate;
      out.prevShiftEndsAt = `${endDate}T${prevShift.endTime.slice(0, 5)}:00+05:30`;
    }
    if (next && nextShift) {
      out.nextShiftStartsAt = `${next.rosterDate}T${nextShift.startTime.slice(0, 5)}:00+05:30`;
    }
    return out;
  }

  /* ------------------------------ muster + lock --------------------------- */

  async muster(month: string, employeeIds?: string[]): Promise<MusterRow[]> {
    const { from, to } = monthBounds(month);
    return withTenant(async (tx) => {
      const employees = await tx
        .select()
        .from(employee)
        .where(
          employeeIds?.length
            ? and(eq(employee.isActive, true), inArray(employee.id, employeeIds))
            : eq(employee.isActive, true),
        )
        .orderBy(asc(employee.empCode));
      const rows = await tx
        .select()
        .from(attendanceDay)
        .where(and(gte(attendanceDay.attDate, from), lte(attendanceDay.attDate, to)))
        .orderBy(asc(attendanceDay.attDate));

      return employees.map((emp) => {
        const mine = rows.filter((r) => r.employeeId === emp.id);
        const results: AttendanceDayResult[] = mine.map((r) => ({
          attDate: r.attDate,
          status: r.status as AttendanceDayResult["status"],
          firstIn: r.firstIn?.toISOString() ?? null,
          lastOut: r.lastOut?.toISOString() ?? null,
          workedHours: Number(r.workedHours),
          otHours: Number(r.otHours),
          lateMinutes: r.lateMinutes,
          lopUnits: Number(r.lopUnits),
          payableUnits: Number(r.payableUnits),
          exceptions: r.exceptions,
          shiftCode: null,
        }));
        return {
          employeeId: emp.id,
          empCode: emp.empCode,
          name: [emp.firstName, emp.lastName].filter(Boolean).join(" "),
          days: mine.map((r) => ({
            date: r.attDate,
            status: r.status,
            otHours: Number(r.otHours),
            exceptions: r.exceptions,
          })),
          summary: summariseMonth(results),
        };
      });
    });
  }

  /**
   * Freeze the month for payroll (HR-26). Blocked while ANY regularisation is pending —
   * locking a month with an unresolved day would silently pay someone for nothing, or
   * nothing for something.
   */
  async lockMonth(month: string): Promise<{ month: string; lockedDays: number }> {
    const { from, to } = monthBounds(month);
    const { tenantId } = currentTenant();
    return withTenant(async (tx) => {
      const pending = await tx
        .select({ id: regularisationRequest.id })
        .from(regularisationRequest)
        .where(
          and(
            eq(regularisationRequest.status, "pending"),
            gte(regularisationRequest.attDate, from),
            lte(regularisationRequest.attDate, to),
          ),
        );
      if (pending.length > 0) {
        throw new AppError(
          "REGULARISATIONS_PENDING",
          409,
          `${pending.length} regularisation(s) are still pending for ${month}; resolve them before locking.`,
        );
      }
      const unresolved = await tx
        .select({ id: attendanceDay.id })
        .from(attendanceDay)
        .where(
          and(eq(attendanceDay.status, "pending_reg"), gte(attendanceDay.attDate, from), lte(attendanceDay.attDate, to)),
        );
      if (unresolved.length > 0) {
        throw new AppError(
          "ATTENDANCE_UNRESOLVED",
          409,
          `${unresolved.length} day(s) in ${month} are Pending-Regularisation; every day must be resolved before the month can be locked.`,
        );
      }

      const locked = await tx
        .update(attendanceDay)
        .set({ locked: true })
        .where(and(gte(attendanceDay.attDate, from), lte(attendanceDay.attDate, to), eq(attendanceDay.locked, false)))
        .returning({ id: attendanceDay.id });

      await this.audit.appendInTx(tx, {
        action: "hrm.attendance.month_locked",
        entityType: "attendance_month",
        entityId: derivedId("attendance_month", month),
        data: { month, lockedDays: locked.length },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        // DECISIONS-V2 section 5.4 mandates kebab-case segments, and it wins on conflict;
        // the blueprint section 10.G spells this `month_locked`. Same event, platform spelling.
        name: eventName("hrm", "attendance", "month-locked"),
        payload: { month, lockedDays: locked.length },
        createdAt: new Date(),
      });
      return { month, lockedDays: locked.length };
    });
  }

  /** The explicit, audited unlock. A changed month after this needs a full recompute. */
  async unlockMonth(month: string, reason: string): Promise<{ month: string; unlockedDays: number }> {
    if (!reason?.trim()) throw Errors.validation([{ field: "reason", message: "required to unlock a month" }]);
    const { from, to } = monthBounds(month);
    return withTenant(async (tx) => {
      const rows = await tx
        .update(attendanceDay)
        .set({ locked: false })
        .where(and(gte(attendanceDay.attDate, from), lte(attendanceDay.attDate, to), eq(attendanceDay.locked, true)))
        .returning({ id: attendanceDay.id });
      await this.audit.appendInTx(tx, {
        action: "hrm.attendance.month_unlocked",
        entityType: "attendance_month",
        entityId: derivedId("attendance_month", month),
        data: { month, unlockedDays: rows.length, reason: reason.trim() },
      });
      return { month, unlockedDays: rows.length };
    });
  }

  /* ---------------------------- regularisation ---------------------------- */

  async raiseRegularisation(input: {
    employeeId: string;
    attDate: string;
    requestedIn?: string;
    requestedOut?: string;
    reason: string;
  }): Promise<{ id: string; status: string }> {
    const { tenantId, actorId } = currentTenant();
    if (!input.requestedIn && !input.requestedOut) {
      throw Errors.validation([{ field: "requestedIn", message: "a corrected in or out time is required" }]);
    }
    return withTenant(async (tx) => {
      const id = newId();
      await tx.insert(regularisationRequest).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        employeeId: input.employeeId,
        attDate: input.attDate,
        requestedIn: input.requestedIn ? new Date(input.requestedIn) : null,
        requestedOut: input.requestedOut ? new Date(input.requestedOut) : null,
        reason: input.reason,
        status: "pending",
      });
      return { id, status: "pending" };
    });
  }

  /**
   * Approving a regularisation APPENDS corrective punches and replays the day. It never
   * writes a corrected attendance figure directly — which is why the resulting row is
   * provably identical to one rebuilt from scratch, and why the raw punch store can stay
   * append-only and still be the source of truth.
   */
  async decideRegularisation(
    id: string,
    decision: "approved" | "rejected",
    approverId: string,
  ): Promise<{ id: string; status: string; reprocessed: boolean }> {
    const { actorId } = currentTenant();
    const outcome = await withTenant(async (tx) => {
      const [req] = await tx.select().from(regularisationRequest).where(eq(regularisationRequest.id, id)).limit(1);
      if (!req) throw new AppError("REGULARISATION_NOT_FOUND", 404, `No regularisation ${id}.`);
      if (req.status !== "pending") {
        throw new AppError("REGULARISATION_DECIDED", 409, `Regularisation ${id} is already ${req.status}.`);
      }

      await tx
        .update(regularisationRequest)
        .set({ status: decision, approverId, decidedAt: new Date(), updatedBy: actorId, updatedAt: new Date() })
        .where(eq(regularisationRequest.id, id));

      if (decision === "approved") {
        const [emp] = await tx.select().from(employee).where(eq(employee.id, req.employeeId)).limit(1);
        if (!emp) throw new AppError("EMPLOYEE_NOT_FOUND", 404, "Employee no longer exists.");
        for (const [ts, direction] of [
          [req.requestedIn, "in"],
          [req.requestedOut, "out"],
        ] as const) {
          if (!ts) continue;
          await this.ingestInTx(tx, {
            deviceId: "REGULARISATION",
            empCode: emp.empCode,
            punchTime: ts.toISOString(),
            direction,
            // 'manual' marks the provenance for ever: this punch came from a human.
            source: "manual",
          });
        }
      }

      await this.audit.appendInTx(tx, {
        action: `hrm.attendance.regularisation.${decision}`,
        entityType: "regularisation_request",
        entityId: id,
        data: { employeeId: req.employeeId, attDate: req.attDate, reason: req.reason },
      });
      return { employeeId: req.employeeId, attDate: req.attDate, decision };
    });

    if (outcome.decision === "approved") {
      await this.processRange({
        from: outcome.attDate,
        to: outcome.attDate,
        employeeIds: [outcome.employeeId],
      });
      return { id, status: decision, reprocessed: true };
    }
    return { id, status: decision, reprocessed: false };
  }

  /** Finalised days feed Production's labour costing (contract with Module 05). */
  async labourCostDaily(date: string): Promise<Array<{ employeeId: string; workedHours: number; otHours: number }>> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select()
        .from(attendanceDay)
        .where(and(eq(attendanceDay.attDate, date), inArray(attendanceDay.status, ["present", "half"])));
      return rows.map((r) => ({
        employeeId: r.employeeId,
        workedHours: Number(r.workedHours),
        otHours: Number(r.otHours),
      }));
    });
  }

  /** The muster's exception counts, for the dashboard tiles. */
  async exceptionCounts(month: string): Promise<Record<string, number>> {
    const { from, to } = monthBounds(month);
    return withTenant(async (tx) => {
      const rows = await tx
        .select({ status: attendanceDay.status, n: sql<string>`count(*)` })
        .from(attendanceDay)
        .where(and(gte(attendanceDay.attDate, from), lte(attendanceDay.attDate, to)))
        .groupBy(attendanceDay.status);
      return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
    });
  }
}
