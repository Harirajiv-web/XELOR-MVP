import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors, type PiiField } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { EmployeeService } from "./employee.service.js";
import { AttendanceService } from "./attendance.service.js";
import { LeaveService } from "./leave.service.js";
import { PayrollService } from "./payroll.service.js";
import { StatutoryConfigService } from "./statutory-config.service.js";
import { PayslipExplainer } from "../../ai/payslip-explainer.js";
import { withTenant } from "@ind-core/db";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

const employeeSchema = z.object({
  empCode: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  employmentType: z.enum(["permanent", "probation", "trainee", "fixed_term", "contract", "apprentice"]),
  fixedTermEndDate: z.string().regex(DATE).optional(),
  dateOfJoining: z.string().regex(DATE),
  ptState: z.string().min(2),
  ptMunicipality: z.string().optional(),
  epfCeilingPolicy: z.enum(["capped_at_15000", "actual"]).optional(),
  locationRef: z.string().uuid().optional(),
  department: z.string().optional(),
  designation: z.string().optional(),
  costCentre: z.string().optional(),
  defaultShiftId: z.string().uuid().optional(),
  reportingManagerId: z.string().uuid().optional(),
});

const piiSchema = z.object({
  field: z.enum(["pan", "aadhaar", "bank_account"]),
  value: z.string().min(1),
});
const revealSchema = z.object({
  field: z.enum(["pan", "aadhaar", "bank_account"]),
  reason: z.string().min(1, "a reason is required to reveal PII"),
});

const punchSchema = z.object({
  deviceId: z.string().min(1),
  empCode: z.string().min(1),
  punchTime: z.string().min(1),
  direction: z.enum(["in", "out", "auto"]).default("auto"),
  source: z.enum(["device", "csv", "mobile", "web", "manual"]).default("device"),
  clientPunchId: z.string().uuid().optional(),
});

const rosterSchema = z.object({
  employeeIds: z.array(z.string().uuid()).min(1),
  from: z.string().regex(DATE),
  to: z.string().regex(DATE),
  shiftCode: z.string().min(1),
  weeklyOffWeekday: z.number().int().min(0).max(6),
});

const processSchema = z.object({
  from: z.string().regex(DATE),
  to: z.string().regex(DATE),
  employeeIds: z.array(z.string().uuid()).optional(),
});

const regSchema = z.object({
  employeeId: z.string().uuid(),
  attDate: z.string().regex(DATE),
  requestedIn: z.string().optional(),
  requestedOut: z.string().optional(),
  reason: z.string().min(1),
});

const leaveSchema = z.object({
  employeeId: z.string().uuid(),
  leaveTypeCode: z.string().min(1),
  fromDate: z.string().regex(DATE),
  toDate: z.string().regex(DATE),
  halfDay: z.boolean().optional(),
  reason: z.string().optional(),
});

const decideSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  approverId: z.string().uuid(),
});

const runSchema = z.object({
  periodMonth: z.string().regex(MONTH),
  payGroup: z.string().optional(),
  periodWorkingDays: z.number().positive().optional(),
});

const approveSchema = z.object({ approverId: z.string().uuid() });
const postSchema = z.object({ postingDate: z.string().regex(DATE).optional() });

function badRequest(issues: { path: (string | number)[]; message: string }[]): never {
  throw Errors.validation(issues.map((i) => ({ field: i.path.join("."), message: i.message })));
}
function requireKey(key?: string): string {
  if (!key) throw Errors.validation([{ field: "Idempotency-Key", message: "header is required on mutations" }]);
  return key;
}

/**
 * HRM & ATTENDANCE (§10). Base path `/api/v1/hrm`.
 *
 * Two absences are deliberate. There is no endpoint that edits a raw punch — a correction
 * is a regularisation, which APPENDS. And there is no endpoint that edits a statutory rate
 * — a change is a new effective-dated row, which the database enforces independently of
 * anything written here.
 */
const editLeaveSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  halfDay: z.boolean().optional(),
  reasonText: z.string().max(500).optional(),
  reason: z.string().trim().min(3, "say why in a few words").optional(),
});

@Controller("hrm")
export class HrmController {
  constructor(
    private readonly employees: EmployeeService,
    private readonly attendance: AttendanceService,
    private readonly leave: LeaveService,
    private readonly payroll: PayrollService,
    private readonly statutory: StatutoryConfigService,
    private readonly explainer: PayslipExplainer,
  ) {}

  /* ------------------------------- employees ------------------------------ */

  @Post("employees")
  @RequirePermission("hrm.employee.write")
  async createEmployee(@Body() body: unknown) {
    const p = employeeSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.employees.create(p.data);
  }

  @Get("employees")
  @RequirePermission("hrm.employee.read")
  async listEmployees(@Query("limit") limit?: string, @Query("cursor") cursor?: string) {
    return this.employees.list(Math.min(Number(limit ?? 25) || 25, 100), cursor);
  }

  @Get("employees/:id")
  @RequirePermission("hrm.employee.read")
  async getEmployee(@Param("id") id: string) {
    return this.employees.get(id);
  }

  @Post("employees/:id/pii")
  @RequirePermission("hrm.employee.write")
  async setPii(@Param("id") id: string, @Body() body: unknown) {
    const p = piiSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.employees.setPii(id, p.data.field as PiiField, p.data.value);
  }

  /** The audited unmask. A reason is mandatory here, in the guard, AND in the table. */
  @Post("employees/:id/reveal")
  @RequirePermission("hrm.employee.pii_reveal")
  async reveal(@Param("id") id: string, @Body() body: unknown) {
    const p = revealSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.employees.revealPii(id, p.data.field as PiiField, p.data.reason);
  }

  @Get("employees/:id/pii-access-log")
  @RequirePermission("hrm.employee.pii_reveal")
  async accessLog(@Param("id") id: string) {
    return this.employees.accessLog(id);
  }

  /* ------------------------------- attendance ----------------------------- */

  @Post("attendance/punches")
  @RequirePermission("hrm.attendance.ingest")
  async punch(@Body() body: unknown) {
    const p = punchSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.attendance.ingestPunch(p.data);
  }

  @Post("attendance/poll-device")
  @RequirePermission("hrm.attendance.ingest")
  async pollDevice(@Body() body: unknown) {
    const p = z.object({ from: z.string(), to: z.string() }).safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.attendance.pollDevice(p.data.from, p.data.to);
  }

  @Post("roster/bulk")
  @RequirePermission("hrm.roster.write")
  async roster(@Body() body: unknown) {
    const p = rosterSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.attendance.assignRoster(p.data);
  }

  @Post("attendance/process")
  @RequirePermission("hrm.attendance.process")
  async process(@Body() body: unknown) {
    const p = processSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.attendance.processRange(p.data);
  }

  @Get("attendance/muster")
  @RequirePermission("hrm.attendance.read")
  async muster(@Query("month") month: string) {
    if (!MONTH.test(month ?? "")) badRequest([{ path: ["month"], message: "expected YYYY-MM" }]);
    return this.attendance.muster(month);
  }

  @Post("attendance/lock")
  @RequirePermission("hrm.attendance.lock")
  async lock(@Body() body: unknown) {
    const p = z.object({ month: z.string().regex(MONTH) }).safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.attendance.lockMonth(p.data.month);
  }

  @Post("attendance/unlock")
  @RequirePermission("hrm.attendance.lock")
  async unlock(@Body() body: unknown) {
    const p = z.object({ month: z.string().regex(MONTH), reason: z.string().min(1) }).safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.attendance.unlockMonth(p.data.month, p.data.reason);
  }

  @Post("regularisations")
  @RequirePermission("hrm.attendance.regularise")
  async raiseReg(@Body() body: unknown) {
    const p = regSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.attendance.raiseRegularisation(p.data);
  }

  @Post("regularisations/:id/decide")
  @RequirePermission("hrm.attendance.approve")
  async decideReg(@Param("id") id: string, @Body() body: unknown) {
    const p = decideSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.attendance.decideRegularisation(id, p.data.decision, p.data.approverId);
  }

  /* --------------------------------- leave -------------------------------- */

  @Post("leave-applications")
  @RequirePermission("hrm.leave.apply")
  async applyLeave(@Body() body: unknown) {
    const p = leaveSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.leave.apply(p.data);
  }

  /**
   * Correct a leave application, or amend an approved one.
   *
   * AN APPROVED CHANGE GOES BACK TO THE MANAGER. Someone who approved three days did not
   * approve eight, and silently extending an approved absence is the version of this
   * feature that gets it taken away again. The application returns to `applied` and the
   * manager decides on the new dates.
   */
  @Patch("leave-applications/:id")
  @RequirePermission("hrm.leave.update")
  async editLeave(@Param("id") id: string, @Body() body: unknown) {
    const p = editLeaveSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.leave.editLeave(id, p.data);
  }

  /** May this application be edited right now, and what should the user be told if not? */
  @Get("leave-applications/:id/edit-policy")
  @RequirePermission("hrm.leave.read")
  async leaveEditPolicy(@Param("id") id: string) {
    return this.leave.leaveEditPolicy(id);
  }

  /** Every correction ever made to this application, newest first. */
  @Get("leave-applications/:id/history")
  @RequirePermission("hrm.leave.read")
  async leaveHistory(@Param("id") id: string) {
    return { entries: await this.leave.leaveHistory(id) };
  }

  @Post("leave-applications/:id/decide")
  @RequirePermission("hrm.leave.approve")
  async decideLeave(@Param("id") id: string, @Body() body: unknown) {
    const p = decideSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.leave.decide(id, p.data.decision, p.data.approverId);
  }

  /**
   * A leave balance belongs to ONE person; there is no company-wide register behind this
   * route. `employeeId` was typed as required but never checked, so an omitted one reached
   * Drizzle as undefined and came back a 500 — a caller's mistake reported as our fault.
   */
  @Get("leave-balances")
  @RequirePermission("hrm.leave.read")
  async balances(@Query("employeeId") employeeId?: string, @Query("year") year?: string) {
    const p = z.string().uuid().safeParse(employeeId);
    if (!p.success) {
      badRequest([
        { path: ["employeeId"], message: "required — a leave balance belongs to one employee" },
      ]);
    }
    return this.leave.balances(p.data, year ?? "2026-27");
  }

  @Post("leave/accrue")
  @RequirePermission("hrm.leave.accrue")
  async accrue(@Body() body: unknown) {
    const p = z.object({ month: z.string().regex(MONTH) }).safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.leave.accrueMonth(p.data.month);
  }

  /* -------------------------------- payroll ------------------------------- */

  @Post("payroll-runs")
  @RequirePermission("hrm.payroll.prepare")
  async createRun(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = runSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.payroll.createRun(p.data, idk);
  }

  @Post("payroll-runs/:id/lock-attendance")
  @RequirePermission("hrm.payroll.prepare")
  async lockAttendance(@Param("id") id: string) {
    return this.payroll.lockAttendance(id);
  }

  @Post("payroll-runs/:id/compute")
  @RequirePermission("hrm.payroll.prepare")
  async compute(@Param("id") id: string, @Headers("idempotency-key") key?: string) {
    return this.payroll.compute(id, requireKey(key));
  }

  @Post("payroll-runs/:id/submit")
  @RequirePermission("hrm.payroll.prepare")
  async submit(@Param("id") id: string) {
    return this.payroll.submit(id);
  }

  /** Separate permission from `prepare` on purpose — SoD starts at the role. */
  @Post("payroll-runs/:id/approve")
  @RequirePermission("hrm.payroll.approve")
  async approve(@Param("id") id: string, @Body() body: unknown) {
    const p = approveSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.payroll.approve(id, p.data.approverId);
  }

  @Post("payroll-runs/:id/mark-paid")
  @RequirePermission("hrm.payroll.approve")
  async markPaid(@Param("id") id: string) {
    return this.payroll.markPaid(id);
  }

  @Post("payroll-runs/:id/post-journal")
  @RequirePermission("hrm.payroll.post")
  async postJournal(@Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = postSchema.safeParse(body ?? {});
    if (!p.success) badRequest(p.error.issues);
    return this.payroll.postJournal(id, idk, p.data.postingDate);
  }

  @Get("payroll-runs/:id/variance")
  @RequirePermission("hrm.payroll.read")
  async variance(@Param("id") id: string, @Query("thresholdPct") threshold?: string) {
    return this.payroll.variance(id, Number(threshold ?? 10) || 10);
  }

  @Get("payroll-runs/:id/payslips/:employeeId")
  @RequirePermission("hrm.payroll.read")
  async payslip(@Param("id") id: string, @Param("employeeId") employeeId: string) {
    return this.payroll.payslipFor(id, employeeId);
  }

  /**
   * `hrm.payslip_explainer` (AI #7, Tier-3 advisory-only). The trace is built from the
   * stored payslip; the AI layer only re-words it, and degrades to the deterministic
   * template whenever it cannot.
   */
  @Post("payroll-runs/:id/payslips/:employeeId/explain")
  @RequirePermission("hrm.payroll.read")
  async explainPayslip(@Param("id") id: string, @Param("employeeId") employeeId: string) {
    const slip = await this.payroll.payslipFor(id, employeeId);
    const run = await this.payroll.getRun(id);
    const ot = slip.lines.find((l) => l.code === "OT");
    const epfCfg = await withTenant((tx) => this.statutory.epf(tx, run.periodMonth));
    const result = await this.explainer.explain({
      periodLabel: new Date(`${run.periodMonth}T00:00:00Z`).toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
      employeeName: slip.name,
      paidDays: slip.paidDays,
      lopDays: slip.lopDays,
      otHours: slip.otHours,
      otPay: ot?.amount ?? 0,
      gross: slip.gross,
      includedWages: slip.deemedWages.includedWages,
      excludedWages: slip.deemedWages.excludedWages,
      excludedPct: slip.deemedWages.excludedPct,
      thresholdAt50: slip.deemedWages.thresholdAt50,
      addback: slip.deemedWages.addback,
      deemedWages: slip.deemedWages.deemedWages,
      pfWageBase: slip.deemedWages.pfWageBase,
      pfCeiling: epfCfg.wageCeiling,
      statutory: slip.statutory.map((s) => ({
        statute: s.statute as "epf" | "esi" | "pt" | "tds",
        amount: s.employee,
        wageBase: s.wageBase,
      })),
      totalDeduction: slip.totalDeduction,
      netPay: slip.netPay,
    });
    return { ...result, featureKey: "hrm.payslip_explainer", riskTier: 3 };
  }

  @Get("payroll-runs/:id/exports/:type")
  @RequirePermission("hrm.payroll.read")
  async exports(@Param("id") id: string, @Param("type") type: string) {
    if (type === "epf-ecr") return { format: "text", content: await this.payroll.exportEcr(id) };
    if (type === "bank-advice") return { format: "csv", content: await this.payroll.exportBankAdvice(id) };
    if (type === "gratuity-provision") return { format: "json", rows: await this.payroll.gratuityProvisionReport(id) };
    badRequest([{ path: ["type"], message: "expected epf-ecr | bank-advice | gratuity-provision" }]);
  }

  /* --------------------------- statutory config --------------------------- */

  /** Visibly append-only (§7.10): there is a read, and there is no edit affordance. */
  @Get("statutory-config")
  @RequirePermission("hrm.statutory.read")
  async statutoryTimeline() {
    return withTenant((tx) => this.statutory.timeline(tx));
  }

  /* ---------------------------- internal reads ---------------------------- */

  /** Production's labour-cost feed (contract with Module 05). */
  @Get("internal/labour-cost/daily")
  @RequirePermission("hrm.attendance.read")
  async labourCost(@Query("date") date: string) {
    if (!DATE.test(date ?? "")) badRequest([{ path: ["date"], message: "expected YYYY-MM-DD" }]);
    return this.attendance.labourCostDaily(date);
  }
}
