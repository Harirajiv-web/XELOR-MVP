import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  newId,
  currentTenant,
  eventName,
  deemedWages,
  gratuityProvision,
  overtimePay,
  prorate,
  computeEpf,
  computeEsi,
  computePtHalfYearly,
  computePtMonthly,
  computeTds,
  AppError,
  Errors,
  type EmploymentType,
  type EpfCeilingPolicy,
  type RemunerationComponent,
} from "@ind-core/platform";
import { runIdempotent, fingerprint } from "../../common/idempotency.js";
import { AuditLogService } from "../../common/audit-log.service.js";
import { NumberingService, fyCode } from "../../common/numbering.service.js";
import { ACCOUNTS_POSTER, type AccountsPoster, type PostedJournalLine } from "../../ports/accounts.port.js";
import { AttendanceService } from "./attendance.service.js";
import { StatutoryConfigService } from "./statutory-config.service.js";

const {
  employee,
  employeeSalaryAssignment,
  salaryStructure,
  salaryStructureComponent,
  salaryComponent,
  attendanceDay,
  payrollRun,
  payslip,
  payslipLine,
  statutoryContribution,
  outboxEvent,
} = schema;

const n = (v: string | null | undefined): number => (v == null ? 0 : Number(v));
const m2 = (x: number): string => x.toFixed(2);
const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

/** The GL accounts a payroll journal touches. Seeded as data in the shared chart (0025). */
const PAYROLL_ACCOUNTS = {
  salaries: "5110",
  overtime: "5115",
  employerEpf: "5120",
  employerEsi: "5121",
  salariesPayable: "2210",
  epfPayable: "2410",
  esiPayable: "2411",
  ptPayable: "2412",
  tdsPayable: "2413",
};

/** Apr–Mar. June 2026 is month 3 of FY 2026-27. */
function fiscalYearOf(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m >= 4 ? `${y}-${String((y + 1) % 100).padStart(2, "0")}` : `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}
function fyMonthIndex(month: string): number {
  const m = Number(month.slice(5, 7));
  return m >= 4 ? m - 3 : m + 9; // Apr = 1 … Mar = 12
}
function monthEnd(month: string): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

const TRANSITIONS: Record<string, string[]> = {
  draft: ["attendance_locked"],
  attendance_locked: ["computed"],
  computed: ["under_review", "computed"], // recompute stays put
  under_review: ["approved", "computed"], // sending back for recompute is legal
  approved: ["paid"],
  paid: ["posted"],
  posted: ["closed"],
  closed: [],
};

export interface PayslipView {
  id: string;
  employeeId: string;
  empCode: string;
  name: string;
  paidDays: number;
  lopDays: number;
  otHours: number;
  gross: number;
  deemedWages: {
    totalRemuneration: number;
    includedWages: number;
    excludedWages: number;
    excludedPct: number;
    thresholdAt50: number;
    addback: number;
    deemedWages: number;
    pfWageBase: number;
  };
  lines: Array<{ code: string; name: string; type: string; amount: number; wageClass: string | null; formula: string | null }>;
  statutory: Array<{ statute: string; employee: number; employer: number; wageBase: number; configRef: string; note: string | null }>;
  totalDeduction: number;
  netPay: number;
  employerCost: number;
  gratuity: { provision: number; vestingDate: string | null; basis: string };
}

/**
 * PAYROLL (HRM §4.E) — the demo spine, and the module's reason to exist.
 *
 * The compute order is FIXED and is the whole compliance argument (§11.4):
 *
 *   earnings → prorate by payable days → OT at 2× → DEEMED WAGES (s.2(y)) → EPF → ESI → PT → TDS
 *
 * Deemed wages sits deliberately in the middle. Everything before it decides what was
 * earned; everything after it depends on the wage BASE the Codes define, not on Basic+DA.
 * Sanjay Patil's June payslip is the case that makes the difference visible: eight hours of
 * overtime push exclusions to 53.57%, ₹750 is added back, and his PF base becomes ₹10,500
 * instead of ₹9,750 — ₹90 of employee PF that a spreadsheet silently underpays, every
 * month, with interest and damages accruing under EPF §14B.
 *
 * Every figure is persisted with its working: the five deemed-wages numbers, each line's
 * formula and wage-class snapshot, and each statutory row's wage base and `config_ref`.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly numbering: NumberingService,
    private readonly statutory: StatutoryConfigService,
    private readonly attendance: AttendanceService,
    @Inject(ACCOUNTS_POSTER) private readonly accounts: AccountsPoster,
  ) {}

  /* ----------------------------- state machine ---------------------------- */

  private assertTransition(from: string, to: string, runNo: string): void {
    if (!(TRANSITIONS[from] ?? []).includes(to)) {
      throw new AppError(
        "PAYROLL_RUN_INVALID_STATE",
        409,
        `Run ${runNo} is ${from}; ${to} is not a permitted transition.`,
      );
    }
  }

  async createRun(
    input: { periodMonth: string; payGroup?: string; periodWorkingDays?: number },
    idempotencyKey: string,
  ): Promise<{ id: string; runNo: string; status: string; periodMonth: string }> {
    const result = await runIdempotent(idempotencyKey, fingerprint({ ...input, op: "payroll-run" }), async () => ({
      status: 201,
      body: await this.doCreateRun(input),
    }));
    return result.body;
  }

  private async doCreateRun(input: {
    periodMonth: string;
    payGroup?: string;
    periodWorkingDays?: number;
  }): Promise<{ id: string; runNo: string; status: string; periodMonth: string }> {
    const { tenantId, actorId } = currentTenant();
    if (!/^\d{4}-\d{2}$/.test(input.periodMonth)) {
      throw Errors.validation([{ field: "periodMonth", message: "expected YYYY-MM" }]);
    }
    return withTenant(async (tx) => {
      const id = newId();
      // The run belongs to the PAYROLL MONTH's financial year, not to the month it is
      // processed in: a March run prepared in April is FY 2526's, and the register reads
      // that way too.
      const runNo = await this.numbering.next(tx, "payroll_run", fyCode(`${input.periodMonth}-01`));
      await tx.insert(payrollRun).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        runNo,
        payGroup: input.payGroup ?? "MONTHLY",
        periodMonth: `${input.periodMonth}-01`,
        status: "draft",
        periodWorkingDays: m2(input.periodWorkingDays ?? 26),
        preparedBy: actorId,
      });
      await this.audit.appendInTx(tx, {
        action: "hrm.payroll_run.created",
        entityType: "payroll_run",
        entityId: id,
        data: { runNo, periodMonth: input.periodMonth },
      });
      return { id, runNo, status: "draft", periodMonth: input.periodMonth };
    });
  }

  /** Freeze the month, then move the run forward. The lock is what makes compute stable. */
  async lockAttendance(runId: string): Promise<{ runNo: string; status: string; lockedDays: number }> {
    const run = await this.loadRun(runId);
    this.assertTransition(run.status, "attendance_locked", run.runNo);
    const month = run.periodMonth.slice(0, 7);
    const lock = await this.attendance.lockMonth(month);
    return withTenant(async (tx) => {
      await tx
        .update(payrollRun)
        .set({ status: "attendance_locked", updatedAt: new Date() })
        .where(eq(payrollRun.id, runId));
      await this.audit.appendInTx(tx, {
        action: "hrm.payroll_run.attendance_locked",
        entityType: "payroll_run",
        entityId: runId,
        data: { runNo: run.runNo, month, lockedDays: lock.lockedDays },
      });
      return { runNo: run.runNo, status: "attendance_locked", lockedDays: lock.lockedDays };
    });
  }

  /* -------------------------------- compute ------------------------------- */

  async compute(runId: string, idempotencyKey: string): Promise<{ runNo: string; status: string; payslips: number; totals: { gross: number; deduction: number; net: number; employerCost: number }; replayed: boolean }> {
    const result = await runIdempotent(idempotencyKey, fingerprint({ runId, op: "payroll-compute" }), async () => ({
      status: 200,
      body: await this.doCompute(runId),
    }));
    return { ...result.body, replayed: result.replayed };
  }

  private async doCompute(runId: string): Promise<{ runNo: string; status: string; payslips: number; totals: { gross: number; deduction: number; net: number; employerCost: number } }> {
    const { tenantId, actorId } = currentTenant();
    const run = await this.loadRun(runId);
    if (run.status !== "attendance_locked" && run.status !== "computed" && run.status !== "under_review") {
      throw new AppError(
        "PAYROLL_RUN_INVALID_STATE",
        409,
        `Run ${run.runNo} is ${run.status}; compute requires a locked (or already computed) run.`,
      );
    }

    const month = run.periodMonth.slice(0, 7);
    const asOf = monthEnd(month);
    const fy = fiscalYearOf(month);
    const periodDays = n(run.periodWorkingDays);

    return withTenant(async (tx) => {
      // --- the rate book, resolved ONCE for the period, as-of its end date --------------
      // Sequential: a Drizzle transaction is a single pg client, so these must not overlap.
      const wageDef = await this.statutory.wageDefinition(tx, asOf);
      const epfCfg = await this.statutory.epf(tx, asOf);
      const esiCfg = await this.statutory.esi(tx, asOf);
      const tdsCfg = await this.statutory.tds(tx, asOf, fy);
      const gratuityCfg = await this.statutory.gratuity(tx, asOf);
      const otCfg = await this.statutory.ot(tx, asOf);
      const configPrint = JSON.stringify({ wageDef, epfCfg, esiCfg, tdsCfg, gratuityCfg, otCfg });

      const employees = await tx.select().from(employee).where(eq(employee.isActive, true)).orderBy(asc(employee.empCode));
      const assignments = await tx
        .select()
        .from(employeeSalaryAssignment)
        .where(and(eq(employeeSalaryAssignment.status, "active"), lte(employeeSalaryAssignment.effectiveFrom, asOf)));
      const structures = await tx.select().from(salaryStructure);
      const structComponents = await tx
        .select({
          structureId: salaryStructureComponent.structureId,
          valuePct: salaryStructureComponent.valuePct,
          valueAmount: salaryStructureComponent.valueAmount,
          sequence: salaryStructureComponent.sequence,
          code: salaryComponent.code,
          name: salaryComponent.name,
          componentType: salaryComponent.componentType,
          wageClass: salaryComponent.wageClass,
          calcType: salaryComponent.calcType,
        })
        .from(salaryStructureComponent)
        .innerJoin(salaryComponent, eq(salaryComponent.id, salaryStructureComponent.componentId))
        .orderBy(asc(salaryStructureComponent.sequence));

      const attendance = await tx
        .select()
        .from(attendanceDay)
        .where(and(gte(attendanceDay.attDate, `${month}-01`), lte(attendanceDay.attDate, asOf)));

      // `inputs_hash` covers the attendance snapshot, the assignments and the CONFIG ROWS.
      // A rate change between two computes therefore changes the hash, which is what makes
      // "unchanged inputs → byte-identical payslips" a meaningful claim (NFR-02).
      const inputsHash = createHash("sha256")
        .update(
          JSON.stringify({
            attendance: attendance.map((a) => [a.employeeId, a.attDate, a.status, a.payableUnits, a.lopUnits, a.otHours]),
            assignments: assignments.map((a) => [a.employeeId, a.structureId, a.monthlyGross, a.effectiveFrom]),
            config: configPrint,
            periodDays,
          }),
        )
        .digest("hex");

      // Prior payslips in the FY drive the PT annual cap, the TDS already deducted, and
      // how many months remain to spread the balance over.
      const priorRuns = await tx
        .select()
        .from(payrollRun)
        .where(and(ne(payrollRun.id, runId), gte(payrollRun.periodMonth, `${fy.slice(0, 4)}-04-01`), lte(payrollRun.periodMonth, asOf)));
      const priorRunIds = priorRuns.map((r) => r.id);
      const priorSlips = priorRunIds.length
        ? await tx.select().from(payslip).where(inArray(payslip.payrollRunId, priorRunIds))
        : [];
      const priorContribs = priorSlips.length
        ? await tx
            .select()
            .from(statutoryContribution)
            .where(inArray(statutoryContribution.payslipId, priorSlips.map((p) => p.id)))
        : [];

      // Recompute is a full replace while the run is still open. The database refuses this
      // outright once the run is approved (trg_payslip_guard), so this path can only ever
      // rewrite a run nobody has signed off.
      const existing = await tx.select({ id: payslip.id }).from(payslip).where(eq(payslip.payrollRunId, runId));
      if (existing.length > 0) {
        await tx.delete(payslip).where(eq(payslip.payrollRunId, runId));
      }

      let totalGross = 0;
      let totalDeduction = 0;
      let totalNet = 0;
      let totalEmployerCost = 0;
      let slipCount = 0;

      for (const emp of employees) {
        const assignment = assignments
          .filter((a) => a.employeeId === emp.id)
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
        if (!assignment) continue; // nobody is paid without an active salary assignment

        const structure = structures.find((s) => s.id === assignment.structureId);
        if (!structure) throw new AppError("SALARY_STRUCTURE_MISSING", 422, `Employee ${emp.empCode} has no structure.`);
        const comps = structComponents.filter((c) => c.structureId === structure.id);

        const myDays = attendance.filter((a) => a.employeeId === emp.id);
        const paidDays = round2(myDays.reduce((a, d) => a + n(d.payableUnits), 0));
        const lopDays = round2(myDays.reduce((a, d) => a + n(d.lopUnits), 0));
        const otHours = round2(myDays.reduce((a, d) => a + n(d.otHours), 0));
        const monthlyGross = n(assignment.monthlyGross);

        // --- 1. earnings, prorated by PAYABLE DAYS -----------------------------------
        const basis = { paidDays, periodDays };
        const remuneration: RemunerationComponent[] = [];
        const lines: Array<{ code: string; name: string; type: string; amount: number; wageClass: string | null; formula: string; sequence: number }> = [];

        for (const c of comps) {
          if (c.componentType !== "earning") continue;
          const full = c.valuePct != null ? round2((monthlyGross * n(c.valuePct)) / 100) : n(c.valueAmount);
          const earned = prorate(full, basis);
          remuneration.push({ code: c.code, name: c.name, amount: earned, wageClass: c.wageClass as "included" | "excluded" });
          lines.push({
            code: c.code,
            name: c.name,
            type: "earning",
            amount: earned,
            wageClass: c.wageClass,
            formula:
              c.valuePct != null
                ? `${c.valuePct}% of monthly gross ${m2(monthlyGross)} = ${m2(full)}, prorated ${paidDays}/${periodDays}`
                : `fixed ${m2(full)}, prorated ${paidDays}/${periodDays}`,
            sequence: c.sequence,
          });
        }

        // --- 2. overtime at the Factories-Act double rate ----------------------------
        const otPay = overtimePay(monthlyGross, otHours, otCfg);
        if (otPay > 0) {
          remuneration.push({ code: "OT", name: "Overtime (2x)", amount: otPay, wageClass: "excluded" });
          lines.push({
            code: "OT",
            name: "Overtime (2x)",
            type: "earning",
            amount: otPay,
            wageClass: "excluded",
            formula: `${m2(monthlyGross)}/26/8 x ${otCfg.multiplier} x ${otHours}h = ${m2(otPay)}`,
            sequence: 90,
          });
        }

        // --- 3. DEEMED WAGES (s.2(y)) — the hinge of the whole computation ------------
        const dw = deemedWages(remuneration, wageDef);

        // --- 4. statutory, in the fixed order EPF -> ESI -> PT -> TDS ------------------
        const epf = computeEpf({
          deemedWages: dw.deemed,
          policy: emp.epfCeilingPolicy as EpfCeilingPolicy,
          config: epfCfg,
        });
        const esi = computeEsi({
          grossIncludingOt: dw.total,
          // Eligibility is judged on the CONTRACTUAL gross at the contribution-period
          // start, never on what happened to be earned this month.
          grossAtPeriodStart: monthlyGross,
          periodMonth: month,
          config: esiCfg,
        });

        const myPriorSlipIds = new Set(priorSlips.filter((p) => p.employeeId === emp.id).map((p) => p.id));
        const priorFor = (statute: string): number =>
          priorContribs
            .filter((c) => myPriorSlipIds.has(c.payslipId) && c.statute === statute)
            .reduce((a, c) => a + n(c.employeeAmount), 0);

        const ptCfg = await this.statutory.pt(tx, asOf, emp.ptState, emp.ptMunicipality);
        const pt =
          ptCfg.periodBasis === "half_yearly"
            ? computePtHalfYearly({
                halfYearGross: monthlyGross * 6,
                monthInHalf: ((fyMonthIndex(month) - 1) % 6) + 1,
                config: ptCfg,
              })
            : computePtMonthly({
                monthlyGross: dw.total,
                calendarMonth: Number(month.slice(5, 7)),
                gender: (emp.gender ?? undefined) as "male" | "female" | "other" | undefined,
                ytdDeducted: priorFor("pt"),
                config: ptCfg,
              });

        // Months already RUN in this FY, not months elapsed: the balance can only be
        // spread over the months this system will actually process.
        const monthsAlreadyRun = myPriorSlipIds.size;
        const tds = computeTds({
          annualGross: monthlyGross * 12,
          ytdTaxDeducted: priorFor("tds"),
          remainingMonths: 12 - monthsAlreadyRun,
          config: tdsCfg,
        });

        // --- 5. totals ---------------------------------------------------------------
        const deduction = epf.employeeAmount + esi.employeeAmount + pt.employeeAmount + tds.employeeAmount;
        const netPay = round2(dw.total - deduction);
        const employerCost = round2(epf.employerAmount + epf.admin + epf.edli + esi.employerAmount);

        const gratuity = gratuityProvision({
          deemedWages: dw.deemed,
          employmentType: emp.employmentType as EmploymentType,
          dateOfJoining: emp.dateOfJoining,
          config: gratuityCfg,
        });

        const slipId = newId();
        await tx.insert(payslip).values({
          id: slipId,
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          payrollRunId: runId,
          employeeId: emp.id,
          paidDays: m2(paidDays),
          lopDays: m2(lopDays),
          otHours: m2(otHours),
          gross: m2(dw.total),
          totalRemuneration: m2(dw.total),
          includedWages: m2(dw.included),
          excludedWages: m2(dw.excluded),
          deemedWagesAddback: m2(dw.addback),
          deemedWages: m2(dw.deemed),
          pfWageBase: m2(epf.wageBase),
          gratuityWageBase: m2(dw.deemed),
          gratuityProvision: m2(gratuity.monthlyProvision),
          gratuityVestingDate: gratuity.vestingDate,
          totalDeduction: m2(deduction),
          employerCost: m2(employerCost),
          netPay: m2(netPay),
          status: "computed",
        });

        for (const l of lines) {
          await tx.insert(payslipLine).values({
            id: newId(),
            tenantId,
            createdBy: actorId,
            updatedBy: actorId,
            payslipId: slipId,
            componentCode: l.code,
            componentName: l.name,
            lineType: l.type,
            amount: m2(l.amount),
            baseForCalc: m2(monthlyGross),
            formulaSnapshot: l.formula,
            wageClassSnapshot: l.wageClass,
            sequence: l.sequence,
          });
        }

        const contribs = [
          { r: epf, detail: { eps: epf.eps, employerEpf: epf.employerEpf, admin: epf.admin, edli: epf.edli } },
          { r: esi, detail: { eligible: esi.eligible, contributionPeriod: esi.contributionPeriod } },
          { r: pt, detail: { periodBasis: pt.periodBasis, state: pt.state } },
          {
            r: tds,
            detail: {
              annualTaxableIncome: tds.annualTaxableIncome,
              taxBeforeRebate: tds.taxBeforeRebate,
              rebateApplied: tds.rebateApplied,
              cess: tds.cess,
              annualTax: tds.annualTax,
              remainingMonths: tds.remainingMonths,
            },
          },
        ];
        for (const c of contribs) {
          await tx.insert(statutoryContribution).values({
            id: newId(),
            tenantId,
            createdBy: actorId,
            updatedBy: actorId,
            payslipId: slipId,
            statute: c.r.statute,
            employeeAmount: m2(c.r.employeeAmount),
            employerAmount: m2(c.r.employerAmount),
            wageBase: m2(c.r.wageBase),
            configRef: c.r.configRef,
            detail: c.detail,
            note: c.r.note ?? null,
          });
        }

        totalGross = round2(totalGross + dw.total);
        totalDeduction = round2(totalDeduction + deduction);
        totalNet = round2(totalNet + netPay);
        totalEmployerCost = round2(totalEmployerCost + employerCost);
        slipCount += 1;
      }

      await tx
        .update(payrollRun)
        .set({
          status: "computed",
          inputsHash,
          totalGross: m2(totalGross),
          totalDeduction: m2(totalDeduction),
          totalNet: m2(totalNet),
          totalEmployerCost: m2(totalEmployerCost),
          updatedBy: actorId,
          updatedAt: new Date(),
        })
        .where(eq(payrollRun.id, runId));

      await this.audit.appendInTx(tx, {
        action: "hrm.payroll_run.computed",
        entityType: "payroll_run",
        entityId: runId,
        data: { runNo: run.runNo, payslips: slipCount, inputsHash, totalNet: m2(totalNet) },
      });

      return {
        runNo: run.runNo,
        status: "computed",
        payslips: slipCount,
        totals: { gross: totalGross, deduction: totalDeduction, net: totalNet, employerCost: totalEmployerCost },
      };
    });
  }

  /* --------------------------- review and approval ------------------------ */

  async submit(runId: string): Promise<{ runNo: string; status: string }> {
    const run = await this.loadRun(runId);
    this.assertTransition(run.status, "under_review", run.runNo);
    return withTenant(async (tx) => {
      await tx.update(payrollRun).set({ status: "under_review", updatedAt: new Date() }).where(eq(payrollRun.id, runId));
      return { runNo: run.runNo, status: "under_review" };
    });
  }

  /**
   * Approval, with segregation of duties (NFR-09). The service refuses the preparer, and
   * a CHECK constraint on `payroll_run` refuses them again — so a direct SQL statement
   * that bypasses this method still cannot approve its own work.
   */
  async approve(runId: string, approverId: string): Promise<{ runNo: string; status: string; approvedBy: string }> {
    const run = await this.loadRun(runId);
    this.assertTransition(run.status, "approved", run.runNo);
    if (approverId === run.preparedBy) {
      throw new AppError(
        "SEGREGATION_OF_DUTIES",
        403,
        `Run ${run.runNo} was prepared by this user; approval requires a different person.`,
      );
    }
    return withTenant(async (tx) => {
      await tx
        .update(payrollRun)
        .set({ status: "approved", approvedBy: approverId, approvedAt: new Date(), updatedAt: new Date() })
        .where(eq(payrollRun.id, runId));
      await this.audit.appendInTx(tx, {
        action: "hrm.payroll_run.approved",
        entityType: "payroll_run",
        entityId: runId,
        data: { runNo: run.runNo, preparedBy: run.preparedBy, approvedBy: approverId },
      });
      return { runNo: run.runNo, status: "approved", approvedBy: approverId };
    });
  }

  async markPaid(runId: string): Promise<{ runNo: string; status: string }> {
    const run = await this.loadRun(runId);
    this.assertTransition(run.status, "paid", run.runNo);
    return withTenant(async (tx) => {
      await tx.update(payrollRun).set({ status: "paid", updatedAt: new Date() }).where(eq(payrollRun.id, runId));
      return { runNo: run.runNo, status: "paid" };
    });
  }

  /* ------------------------------ the GL journal -------------------------- */

  async postJournal(
    runId: string,
    idempotencyKey: string,
    postingDate?: string,
  ): Promise<{ runNo: string; status: string; voucherNo: string; totalDebit: number; replayed: boolean }> {
    const result = await runIdempotent(idempotencyKey, fingerprint({ runId, postingDate, op: "payroll-post" }), async () => ({
      status: 201,
      body: await this.doPostJournal(runId, postingDate),
    }));
    return { ...result.body, replayed: result.replayed };
  }

  /**
   * HR-51. Salary cost by nature, statutory liabilities by statute, net pay as a payable —
   * posted SYNCHRONOUSLY through the Accounts port in one transaction, with the outbox
   * event written in the same transaction. The event notifies; it does not post.
   *
   * The journal is assembled from what the payslips already say. HRM does not re-derive a
   * single rupee here, which is the same boundary Accounts enforces from its side.
   */
  private async doPostJournal(
    runId: string,
    postingDate?: string,
  ): Promise<{ runNo: string; status: string; voucherNo: string; totalDebit: number }> {
    const { tenantId } = currentTenant();
    const run = await this.loadRun(runId);

    // REPLAY. "post-journal replay yields exactly one GL journal" (NFR-02) has to mean the
    // second call SUCCEEDS and points at the same voucher — refusing the transition would
    // make a retried request look like a failure. The debit total is reconstructed from
    // the run's own stored figures rather than by reading Accounts' tables, which HRM must
    // not do.
    if (run.status === "posted" && run.glVoucherNo) {
      return {
        runNo: run.runNo,
        status: "posted",
        voucherNo: run.glVoucherNo,
        totalDebit: round2(n(run.totalGross) + n(run.totalEmployerCost)),
      };
    }
    this.assertTransition(run.status, "posted", run.runNo);

    return withTenant(async (tx) => {
      const slips = await tx.select().from(payslip).where(eq(payslip.payrollRunId, runId));
      if (slips.length === 0) throw new AppError("NO_PAYSLIPS", 422, `Run ${run.runNo} has no payslips to post.`);
      const contribs = await tx
        .select()
        .from(statutoryContribution)
        .where(inArray(statutoryContribution.payslipId, slips.map((s) => s.id)));
      const otLines = await tx
        .select()
        .from(payslipLine)
        .where(and(inArray(payslipLine.payslipId, slips.map((s) => s.id)), eq(payslipLine.componentCode, "OT")));

      const sum = (xs: number[]): number => round2(xs.reduce((a, b) => a + b, 0));
      const byStatute = (statute: string, field: "employeeAmount" | "employerAmount"): number =>
        sum(contribs.filter((c) => c.statute === statute).map((c) => n(c[field])));

      const otTotal = sum(otLines.map((l) => n(l.amount)));
      const grossTotal = sum(slips.map((s) => n(s.gross)));
      const netTotal = sum(slips.map((s) => n(s.netPay)));

      const epfEmployee = byStatute("epf", "employeeAmount");
      const epfEmployer = byStatute("epf", "employerAmount");
      const epfAdminEdli = sum(
        contribs
          .filter((c) => c.statute === "epf")
          .map((c) => {
            const d = (c.detail ?? {}) as { admin?: number; edli?: number };
            return (d.admin ?? 0) + (d.edli ?? 0);
          }),
      );
      const esiEmployee = byStatute("esi", "employeeAmount");
      const esiEmployer = byStatute("esi", "employerAmount");
      const ptTotal = byStatute("pt", "employeeAmount");
      const tdsTotal = byStatute("tds", "employeeAmount");
      const employerEpfCost = round2(epfEmployer + epfAdminEdli);

      const lines: PostedJournalLine[] = [
        { accountCode: PAYROLL_ACCOUNTS.salaries, debit: round2(grossTotal - otTotal), memo: `${run.runNo} salaries` },
        ...(otTotal > 0 ? [{ accountCode: PAYROLL_ACCOUNTS.overtime, debit: otTotal, memo: `${run.runNo} overtime` }] : []),
        ...(employerEpfCost > 0
          ? [{ accountCode: PAYROLL_ACCOUNTS.employerEpf, debit: employerEpfCost, memo: `${run.runNo} employer EPF` }]
          : []),
        ...(esiEmployer > 0
          ? [{ accountCode: PAYROLL_ACCOUNTS.employerEsi, debit: esiEmployer, memo: `${run.runNo} employer ESI` }]
          : []),
        { accountCode: PAYROLL_ACCOUNTS.salariesPayable, credit: netTotal, memo: `${run.runNo} net pay` },
        ...(epfEmployee + employerEpfCost > 0
          ? [{ accountCode: PAYROLL_ACCOUNTS.epfPayable, credit: round2(epfEmployee + employerEpfCost), memo: `${run.runNo} EPF payable` }]
          : []),
        ...(esiEmployee + esiEmployer > 0
          ? [{ accountCode: PAYROLL_ACCOUNTS.esiPayable, credit: round2(esiEmployee + esiEmployer), memo: `${run.runNo} ESI payable` }]
          : []),
        ...(ptTotal > 0 ? [{ accountCode: PAYROLL_ACCOUNTS.ptPayable, credit: ptTotal, memo: `${run.runNo} PT payable` }] : []),
        ...(tdsTotal > 0 ? [{ accountCode: PAYROLL_ACCOUNTS.tdsPayable, credit: tdsTotal, memo: `${run.runNo} TDS payable` }] : []),
      ];

      const posted = await this.accounts.postJournalInTx(tx, {
        voucherType: "payroll",
        // Salaries for a month are paid — and posted — in the following month. The caller
        // supplies the pay date; the ledger then refuses it if that period is closed.
        postingDate: postingDate ?? monthEnd(run.periodMonth.slice(0, 7)),
        narration: `Payroll ${run.runNo} for ${run.periodMonth.slice(0, 7)}`,
        sourceModule: "hrm",
        sourceDocType: "payroll_run",
        sourceDocId: run.runNo,
        lines,
      });

      await tx
        .update(payrollRun)
        .set({
          status: "posted",
          glVoucherId: posted.voucherId,
          glVoucherNo: posted.voucherNo,
          updatedAt: new Date(),
        })
        .where(eq(payrollRun.id, runId));

      await this.audit.appendInTx(tx, {
        action: "hrm.payroll_run.posted",
        entityType: "payroll_run",
        entityId: runId,
        data: { runNo: run.runNo, voucherNo: posted.voucherNo, totalDebit: posted.totalDebit },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        // Kebab-case per DECISIONS-V2 section 5.4 (blueprint 10.G writes `payroll_run`).
        name: eventName("hrm", "payroll-run", "completed"),
        payload: {
          runNo: run.runNo,
          period: run.periodMonth.slice(0, 7),
          voucherNo: posted.voucherNo,
          totalNet: m2(netTotal),
        },
        createdAt: new Date(),
      });

      return { runNo: run.runNo, status: "posted", voucherNo: posted.voucherNo, totalDebit: posted.totalDebit };
    });
  }

  /* -------------------------------- reads --------------------------------- */

  private async loadRun(runId: string): Promise<typeof payrollRun.$inferSelect> {
    return withTenant(async (tx) => {
      const [row] = await tx.select().from(payrollRun).where(eq(payrollRun.id, runId)).limit(1);
      if (!row) throw new AppError("PAYROLL_RUN_NOT_FOUND", 404, `No payroll run ${runId}.`);
      return row;
    });
  }

  async getRun(runId: string): Promise<typeof payrollRun.$inferSelect> {
    return this.loadRun(runId);
  }

  /** The payslip, with the whole deemed-wages trace the employee is entitled to see. */
  async payslipFor(runId: string, employeeId: string): Promise<PayslipView> {
    return withTenant(async (tx) => {
      const [slip] = await tx
        .select()
        .from(payslip)
        .where(and(eq(payslip.payrollRunId, runId), eq(payslip.employeeId, employeeId)))
        .limit(1);
      if (!slip) throw new AppError("PAYSLIP_NOT_FOUND", 404, "No payslip for this employee in this run.");
      const [emp] = await tx.select().from(employee).where(eq(employee.id, employeeId)).limit(1);
      const lines = await tx
        .select()
        .from(payslipLine)
        .where(eq(payslipLine.payslipId, slip.id))
        .orderBy(asc(payslipLine.sequence));
      const contribs = await tx
        .select()
        .from(statutoryContribution)
        .where(eq(statutoryContribution.payslipId, slip.id))
        .orderBy(asc(statutoryContribution.statute));

      const total = n(slip.totalRemuneration);
      return {
        id: slip.id,
        employeeId,
        empCode: emp?.empCode ?? "",
        name: emp ? [emp.firstName, emp.lastName].filter(Boolean).join(" ") : "",
        paidDays: n(slip.paidDays),
        lopDays: n(slip.lopDays),
        otHours: n(slip.otHours),
        gross: n(slip.gross),
        deemedWages: {
          totalRemuneration: total,
          includedWages: n(slip.includedWages),
          excludedWages: n(slip.excludedWages),
          excludedPct: total === 0 ? 0 : round2((n(slip.excludedWages) / total) * 100),
          thresholdAt50: round2(total / 2),
          addback: n(slip.deemedWagesAddback),
          deemedWages: n(slip.deemedWages),
          pfWageBase: n(slip.pfWageBase),
        },
        lines: lines.map((l) => ({
          code: l.componentCode,
          name: l.componentName,
          type: l.lineType,
          amount: n(l.amount),
          wageClass: l.wageClassSnapshot,
          formula: l.formulaSnapshot,
        })),
        statutory: contribs.map((c) => ({
          statute: c.statute,
          employee: n(c.employeeAmount),
          employer: n(c.employerAmount),
          wageBase: n(c.wageBase),
          configRef: c.configRef,
          note: c.note,
        })),
        totalDeduction: n(slip.totalDeduction),
        netPay: n(slip.netPay),
        employerCost: n(slip.employerCost),
        gratuity: {
          provision: n(slip.gratuityProvision),
          vestingDate: slip.gratuityVestingDate,
          basis: "deemed_wages",
        },
      };
    });
  }

  /**
   * Month-over-month variance (HR-50). **Deterministic rules only** — the V1 idea of an AI
   * anomaly narrative was dropped under the DECISIONS-V2 AI scope, and a payroll officer
   * signing off on ₹7 lakh of net pay deserves arithmetic, not prose.
   */
  async variance(runId: string, thresholdPct = 10): Promise<Array<{ empCode: string; field: string; previous: number; current: number; deltaPct: number }>> {
    const run = await this.loadRun(runId);
    return withTenant(async (tx) => {
      const prevMonth = new Date(`${run.periodMonth}T00:00:00Z`);
      prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1);
      const [prevRun] = await tx
        .select()
        .from(payrollRun)
        .where(and(eq(payrollRun.payGroup, run.payGroup), eq(payrollRun.periodMonth, prevMonth.toISOString().slice(0, 10))))
        .limit(1);
      if (!prevRun) return [];

      const cur = await tx.select().from(payslip).where(eq(payslip.payrollRunId, runId));
      const prev = await tx.select().from(payslip).where(eq(payslip.payrollRunId, prevRun.id));
      const emps = await tx.select().from(employee);
      const byEmp = new Map(prev.map((p) => [p.employeeId, p]));
      const code = new Map(emps.map((e) => [e.id, e.empCode]));

      const out: Array<{ empCode: string; field: string; previous: number; current: number; deltaPct: number }> = [];
      for (const c of cur) {
        const p = byEmp.get(c.employeeId);
        if (!p) continue;
        for (const field of ["gross", "netPay", "totalDeduction", "deemedWages"] as const) {
          const before = n(p[field]);
          const after = n(c[field]);
          if (before === 0) continue;
          const deltaPct = round2(((after - before) / before) * 100);
          if (Math.abs(deltaPct) >= thresholdPct) {
            out.push({ empCode: code.get(c.employeeId) ?? "", field, previous: before, current: after, deltaPct });
          }
        }
      }
      return out;
    });
  }

  /* ------------------------------- exports -------------------------------- */

  /**
   * The EPFO ECR text file (HR-53) — generated, not assembled. Note the wage columns: they
   * carry the DEEMED wage base, which is the entire point. An ECR filed on Basic+DA is a
   * self-reported underpayment.
   */
  async exportEcr(runId: string): Promise<string> {
    return withTenant(async (tx) => {
      const slips = await tx.select().from(payslip).where(eq(payslip.payrollRunId, runId));
      const emps = await tx.select().from(employee);
      const byId = new Map(emps.map((e) => [e.id, e]));
      const contribs = slips.length
        ? await tx
            .select()
            .from(statutoryContribution)
            .where(and(inArray(statutoryContribution.payslipId, slips.map((s) => s.id)), eq(statutoryContribution.statute, "epf")))
        : [];
      const epfBySlip = new Map(contribs.map((c) => [c.payslipId, c]));

      const rows = slips.map((s) => {
        const e = byId.get(s.employeeId);
        const c = epfBySlip.get(s.id);
        const detail = (c?.detail ?? {}) as { eps?: number; employerEpf?: number };
        const pfWages = Math.round(n(s.pfWageBase));
        return [
          e?.uan ?? "",
          [e?.firstName, e?.lastName].filter(Boolean).join(" "),
          Math.round(n(s.gross)), // gross wages
          pfWages, // EPF wages — the DEEMED base
          pfWages, // EPS wages
          pfWages, // EDLI wages
          Math.round(n(c?.employeeAmount ?? "0")),
          Math.round(detail.eps ?? 0),
          Math.round(detail.employerEpf ?? 0),
          Math.round(n(s.lopDays)), // NCP days
          0, // refund of advances
        ].join("#~#");
      });
      return rows.join("\n");
    });
  }

  /** Bank advice (HR-54): a generic CSV, because host-to-host is post-MVP. */
  async exportBankAdvice(runId: string): Promise<string> {
    return withTenant(async (tx) => {
      const run = await this.loadRun(runId);
      const slips = await tx.select().from(payslip).where(eq(payslip.payrollRunId, runId));
      const emps = await tx.select().from(employee);
      const byId = new Map(emps.map((e) => [e.id, e]));
      const header = "emp_code,name,ifsc,amount,narration";
      const rows = slips.map((s) => {
        const e = byId.get(s.employeeId);
        return [
          e?.empCode ?? "",
          `"${[e?.firstName, e?.lastName].filter(Boolean).join(" ")}"`,
          e?.bankIfsc ?? "",
          m2(n(s.netPay)),
          `"Salary ${run.periodMonth.slice(0, 7)}"`,
        ].join(",");
      });
      return [header, ...rows].join("\n");
    });
  }

  /** The gratuity provision note (HR-52) — dual vesting horizons, side by side. */
  async gratuityProvisionReport(runId: string): Promise<Array<{ empCode: string; employmentType: string; deemedWages: number; monthlyProvision: number; vestingDate: string | null }>> {
    return withTenant(async (tx) => {
      const slips = await tx.select().from(payslip).where(eq(payslip.payrollRunId, runId));
      const emps = await tx.select().from(employee);
      const byId = new Map(emps.map((e) => [e.id, e]));
      return slips
        .map((s) => {
          const e = byId.get(s.employeeId);
          return {
            empCode: e?.empCode ?? "",
            employmentType: e?.employmentType ?? "",
            deemedWages: n(s.deemedWages),
            monthlyProvision: n(s.gratuityProvision),
            vestingDate: s.gratuityVestingDate,
          };
        })
        .sort((a, b) => a.empCode.localeCompare(b.empCode));
    });
  }
}
