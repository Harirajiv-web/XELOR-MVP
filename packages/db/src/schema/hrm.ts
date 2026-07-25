import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * HRM & ATTENDANCE (RASP, Module 09) — the people-and-pay backbone.
 *
 * The module fixes one pipeline as a single auditable flow (§1):
 *   punch → attendance day → payable days/OT → DEEMED WAGES → payroll → payslip → GL.
 *
 * Two structural decisions run through the whole file.
 *
 * 1. **Statutory rates are data.** The `stat_*` tables below are platform-global (no
 *    tenant_id — the law is the same for everyone) and effective-dated. They are
 *    append-only at the GRANT level: a rate change is an INSERT with a new
 *    `effective_from`, never an UPDATE. That is what lets a June-2026 payslip recompute
 *    against June-2026's rates forever.
 *
 * 2. **Every payslip stores its own working.** The deemed-wages block, each line's
 *    formula snapshot and wage-class snapshot, and each statutory row's wage base and
 *    `config_ref` are all persisted. A payslip is therefore self-explaining years later,
 *    without needing the code or the config that produced it.
 */

/* ========================================================================== */
/* Statutory configuration — platform-global, effective-dated, append-only     */
/* ========================================================================== */

const statColumns = {
  id: uuid("id").primaryKey(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  /** Provenance for the number: the notification, circular or FAQ it came from. */
  sourceNote: text("source_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").notNull(),
};

/** s.2(y) Code on Wages. Effective 21 Nov 2025 — the day the four Codes came into force. */
export const statWageDefinition = pgTable("stat_wage_definition", {
  ...statColumns,
  addbackThresholdPct: numeric("addback_threshold_pct", { precision: 5, scale: 2 }).notNull(),
});

/** EPF. Ceiling ₹15,000, re-notified 29 May 2026. */
export const statEpfConfig = pgTable("stat_epf_config", {
  ...statColumns,
  wageCeiling: numeric("wage_ceiling", { precision: 12, scale: 2 }).notNull(),
  employeePct: numeric("employee_pct", { precision: 5, scale: 2 }).notNull(),
  epsPct: numeric("eps_pct", { precision: 5, scale: 2 }).notNull(),
  adminPct: numeric("admin_pct", { precision: 5, scale: 2 }).notNull(),
  edliPct: numeric("edli_pct", { precision: 5, scale: 2 }).notNull(),
});

/** ESI. Gross threshold ₹21,000, with Apr–Sep / Oct–Mar contribution-period lock-in. */
export const statEsiConfig = pgTable("stat_esi_config", {
  ...statColumns,
  grossThreshold: numeric("gross_threshold", { precision: 12, scale: 2 }).notNull(),
  employeePct: numeric("employee_pct", { precision: 5, scale: 2 }).notNull(),
  employerPct: numeric("employer_pct", { precision: 5, scale: 2 }).notNull(),
  roundUp: boolean("round_up").notNull().default(true),
});

/**
 * Professional tax — a STATE tax, so even the period basis is a column. Adding Karnataka
 * or West Bengal is a row, not a release.
 */
export const statPtSlab = pgTable(
  "stat_pt_slab",
  {
    ...statColumns,
    state: text("state").notNull(),
    periodBasis: text("period_basis").notNull(), // monthly | half_yearly
    municipality: text("municipality"),
    slabFrom: numeric("slab_from", { precision: 12, scale: 2 }).notNull(),
    slabTo: numeric("slab_to", { precision: 12, scale: 2 }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    /** Maharashtra charges ₹300 in February so the year totals exactly ₹2,500. */
    amountFebruary: numeric("amount_february", { precision: 12, scale: 2 }),
    annualCap: numeric("annual_cap", { precision: 12, scale: 2 }).notNull(),
    /** Threshold itself is config — the MH women's exemption is pending notification. */
    womenExemptUpto: numeric("women_exempt_upto", { precision: 12, scale: 2 }),
  },
  (t) => [index("ix_ptslab_state").on(t.state, t.effectiveFrom)],
);

/** TDS, new regime FY 2026-27. */
export const statTdsConfig = pgTable("stat_tds_config", {
  ...statColumns,
  fy: text("fy").notNull(),
  regime: text("regime").notNull(),
  standardDeduction: numeric("standard_deduction", { precision: 12, scale: 2 }).notNull(),
  rebate87aAmount: numeric("rebate_87a_amount", { precision: 12, scale: 2 }).notNull(),
  rebate87aIncomeLimit: numeric("rebate_87a_income_limit", { precision: 14, scale: 2 }).notNull(),
  cessPct: numeric("cess_pct", { precision: 5, scale: 2 }).notNull(),
  /** IT Act 2025 renumbering took effect 1 Apr 2026; registers label both. */
  actReference: text("act_reference").notNull(),
});

export const statTdsSlab = pgTable(
  "stat_tds_slab",
  {
    ...statColumns,
    fy: text("fy").notNull(),
    regime: text("regime").notNull(),
    slabFrom: numeric("slab_from", { precision: 14, scale: 2 }).notNull(),
    slabTo: numeric("slab_to", { precision: 14, scale: 2 }),
    ratePct: numeric("rate_pct", { precision: 5, scale: 2 }).notNull(),
  },
  (t) => [index("ix_tdsslab_fy").on(t.fy, t.regime, t.slabFrom)],
);

/** Gratuity — 15/26, and the DUAL vesting horizon the Codes introduced. */
export const statGratuityConfig = pgTable("stat_gratuity_config", {
  ...statColumns,
  factorNum: integer("factor_num").notNull(),
  factorDen: integer("factor_den").notNull(),
  vestingYearsDefault: integer("vesting_years_default").notNull(),
  /** 1 for fixed-term staff. Most SMBs are not accruing this at all. */
  vestingYearsFixedTerm: integer("vesting_years_fixed_term").notNull(),
  taxExemptCap: numeric("tax_exempt_cap", { precision: 14, scale: 2 }).notNull(),
  wageBase: text("wage_base").notNull(), // deemed_wages
});

/** Overtime — Factories Act s.59 double rate, plus the hour caps. */
export const statOtConfig = pgTable("stat_ot_config", {
  ...statColumns,
  multiplier: numeric("multiplier", { precision: 5, scale: 2 }).notNull(),
  rateBasis: text("rate_basis").notNull(), // gross_26_8
  dailyHoursCap: numeric("daily_hours_cap", { precision: 5, scale: 2 }).notNull(),
  weeklyHoursCap: numeric("weekly_hours_cap", { precision: 5, scale: 2 }).notNull(),
  quarterlyOtCapHours: numeric("quarterly_ot_cap_hours", { precision: 6, scale: 2 }).notNull(),
});

/* ========================================================================== */
/* Employee master                                                             */
/* ========================================================================== */

export const employee = pgTable(
  "employee",
  {
    ...tenantScopedColumns,
    empCode: text("emp_code").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    gender: text("gender"),
    employmentType: text("employment_type").notNull(),
    /** Required when employmentType = fixed_term; drives the 1-year gratuity horizon. */
    fixedTermEndDate: date("fixed_term_end_date"),
    dateOfJoining: date("date_of_joining").notNull(),
    probationEndDate: date("probation_end_date"),
    status: text("status").notNull().default("active"),
    /** Encrypted envelopes (AES-256-GCM, tenant+field bound). NEVER plaintext. */
    panEnc: text("pan_enc"),
    aadhaarEnc: text("aadhaar_enc"),
    bankAccountEnc: text("bank_account_enc"),
    bankIfsc: text("bank_ifsc"),
    uan: text("uan"),
    esicNumber: text("esic_number"),
    /** Drives PT slab resolution; TN also needs the municipality. */
    ptState: text("pt_state").notNull(),
    ptMunicipality: text("pt_municipality"),
    epfCeilingPolicy: text("epf_ceiling_policy").notNull().default("capped_at_15000"),
    /** Logical refs to GENERAL (plant = the GST registration) and self. No cross-module FK. */
    locationRef: uuid("location_ref"),
    department: text("department"),
    designation: text("designation"),
    costCentre: text("cost_centre"),
    defaultShiftId: uuid("default_shift_id"),
    reportingManagerId: uuid("reporting_manager_id"),
    /** DPDP purpose registry, inline: legal basis is s.7 legitimate use, no consent. */
    piiLegalBasis: text("pii_legal_basis").notNull().default("legitimate_use_employment"),
    piiNoticeVersion: text("pii_notice_version"),
  },
  (t) => [
    unique("uq_employee_tenant_code").on(t.tenantId, t.empCode),
    index("ix_employee_tenant_status").on(t.tenantId, t.status),
    index("ix_employee_tenant_location").on(t.tenantId, t.locationRef),
  ],
);

/** Effective-dated placement/compensation history — never an in-place overwrite. */
export const employeeJobHistory = pgTable(
  "employee_job_history",
  {
    ...tenantScopedColumns,
    employeeId: uuid("employee_id").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    changeType: text("change_type").notNull(), // hire|promotion|transfer|comp|exit
    department: text("department"),
    designation: text("designation"),
    costCentre: text("cost_centre"),
    monthlyGross: numeric("monthly_gross", { precision: 12, scale: 2 }),
    note: text("note"),
  },
  (t) => [index("ix_jobhistory_tenant_emp").on(t.tenantId, t.employeeId, t.effectiveFrom)],
);

/**
 * Every unmask of a PII field, with the reason the viewer typed. DPDP Rule 6 access logs,
 * ≥1-year retention. Append-only at the grant.
 */
export const piiAccessLog = pgTable(
  "pii_access_log",
  {
    ...tenantScopedColumns,
    employeeId: uuid("employee_id").notNull(),
    field: text("field").notNull(),
    viewedBy: uuid("viewed_by").notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason").notNull(),
  },
  (t) => [index("ix_piiaccess_tenant_emp").on(t.tenantId, t.employeeId, t.viewedAt)],
);

/* ========================================================================== */
/* Shifts, roster, punches, attendance                                         */
/* ========================================================================== */

export const shift = pgTable(
  "shift",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    breakMinutes: integer("break_minutes").notNull().default(30),
    graceMinutes: integer("grace_minutes").notNull().default(10),
    /** Stored, not inferred from end<=start, so a night shift is auditable as a decision. */
    isNight: boolean("is_night").notNull().default(false),
    otAfterMinutes: integer("ot_after_minutes").notNull().default(480),
    halfDayThresholdMinutes: integer("half_day_threshold_minutes").notNull().default(240),
  },
  (t) => [unique("uq_shift_tenant_code").on(t.tenantId, t.code)],
);

export const shiftRoster = pgTable(
  "shift_roster",
  {
    ...tenantScopedColumns,
    employeeId: uuid("employee_id").notNull(),
    rosterDate: date("roster_date").notNull(),
    shiftId: uuid("shift_id"),
    /** Weekly-off is a first-class entry type, never inferred from Sunday. */
    entryType: text("entry_type").notNull().default("shift"),
    status: text("status").notNull().default("published"),
    isOtPlanned: boolean("is_ot_planned").notNull().default(false),
    workCentreRef: uuid("work_centre_ref"),
  },
  (t) => [
    // A B→C same-day double roster is structurally impossible.
    unique("uq_roster_tenant_emp_date").on(t.tenantId, t.employeeId, t.rosterDate),
    index("ix_roster_tenant_date").on(t.tenantId, t.rosterDate),
  ],
);

/** The raw punch store. Append-only: nothing is ever edited or deleted, only added. */
export const biometricPunch = pgTable(
  "biometric_punch",
  {
    ...tenantScopedColumns,
    deviceId: text("device_id").notNull(),
    empCode: text("emp_code").notNull(),
    employeeId: uuid("employee_id"),
    punchTime: timestamp("punch_time", { withTimezone: true }).notNull(),
    direction: text("direction").notNull().default("auto"),
    source: text("source").notNull().default("device"),
    /** Reserved for the offline kiosk: the CLIENT generates this so a queued punch
     *  survives store-and-forward without the API needing a breaking change (NFR-12). */
    clientPunchId: uuid("client_punch_id"),
    importBatchId: uuid("import_batch_id"),
    processed: boolean("processed").notNull().default(false),
  },
  (t) => [
    unique("uq_punch_tenant_device_emp_time").on(t.tenantId, t.deviceId, t.empCode, t.punchTime),
    index("ix_punch_tenant_emp_time").on(t.tenantId, t.empCode, t.punchTime),
  ],
);

export const attendanceDay = pgTable(
  "attendance_day",
  {
    ...tenantScopedColumns,
    employeeId: uuid("employee_id").notNull(),
    attDate: date("att_date").notNull(),
    shiftId: uuid("shift_id"),
    firstIn: timestamp("first_in", { withTimezone: true }),
    lastOut: timestamp("last_out", { withTimezone: true }),
    workedHours: numeric("worked_hours", { precision: 6, scale: 2 }).notNull().default("0"),
    otHours: numeric("ot_hours", { precision: 6, scale: 2 }).notNull().default("0"),
    lateMinutes: integer("late_minutes").notNull().default(0),
    status: text("status").notNull(),
    lopUnits: numeric("lop_units", { precision: 4, scale: 2 }).notNull().default("0"),
    payableUnits: numeric("payable_units", { precision: 4, scale: 2 }).notNull().default("0"),
    exceptions: jsonb("exceptions").$type<string[]>().notNull().default([]),
    leaveApplicationId: uuid("leave_application_id"),
    workCentreRef: uuid("work_centre_ref"),
    /** Set when the month is locked for payroll. A locked day cannot be reprocessed. */
    locked: boolean("locked").notNull().default(false),
  },
  (t) => [
    unique("uq_attendance_tenant_emp_date").on(t.tenantId, t.employeeId, t.attDate),
    index("ix_attendance_tenant_date").on(t.tenantId, t.attDate),
    index("ix_attendance_tenant_status").on(t.tenantId, t.status),
  ],
);

export const regularisationRequest = pgTable(
  "regularisation_request",
  {
    ...tenantScopedColumns,
    employeeId: uuid("employee_id").notNull(),
    attDate: date("att_date").notNull(),
    requestedIn: timestamp("requested_in", { withTimezone: true }),
    requestedOut: timestamp("requested_out", { withTimezone: true }),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    approverId: uuid("approver_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("ix_reg_tenant_status").on(t.tenantId, t.status, t.attDate)],
);

/* ========================================================================== */
/* Leave                                                                       */
/* ========================================================================== */

export const leaveType = pgTable(
  "leave_type",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    isPaid: boolean("is_paid").notNull().default(true),
    accrualRule: text("accrual_rule").notNull().default("monthly"), // monthly|annual|on_join|none
    monthlyRate: numeric("monthly_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    annualQuota: numeric("annual_quota", { precision: 6, scale: 2 }).notNull().default("0"),
    carryForwardCap: numeric("carry_forward_cap", { precision: 6, scale: 2 }).notNull().default("0"),
    encashable: boolean("encashable").notNull().default(false),
    allowNegative: boolean("allow_negative").notNull().default(false),
    countHolidays: boolean("count_holidays").notNull().default(false),
  },
  (t) => [unique("uq_leavetype_tenant_code").on(t.tenantId, t.code)],
);

export const leaveApplication = pgTable(
  "leave_application",
  {
    ...tenantScopedColumns,
    employeeId: uuid("employee_id").notNull(),
    leaveTypeId: uuid("leave_type_id").notNull(),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    halfDay: boolean("half_day").notNull().default(false),
    days: numeric("days", { precision: 5, scale: 2 }).notNull(),
    reason: text("reason"),
    status: text("status").notNull().default("applied"),
    approverId: uuid("approver_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("ix_leaveapp_tenant_emp").on(t.tenantId, t.employeeId, t.fromDate)],
);

export const leaveBalance = pgTable(
  "leave_balance",
  {
    ...tenantScopedColumns,
    employeeId: uuid("employee_id").notNull(),
    leaveTypeId: uuid("leave_type_id").notNull(),
    periodYear: text("period_year").notNull(), // 2026-27
    opening: numeric("opening", { precision: 6, scale: 2 }).notNull().default("0"),
    accrued: numeric("accrued", { precision: 6, scale: 2 }).notNull().default("0"),
    used: numeric("used", { precision: 6, scale: 2 }).notNull().default("0"),
    encashed: numeric("encashed", { precision: 6, scale: 2 }).notNull().default("0"),
  },
  (t) => [
    unique("uq_leavebal_tenant_emp_type_year").on(t.tenantId, t.employeeId, t.leaveTypeId, t.periodYear),
  ],
);

/* ========================================================================== */
/* Salary structures                                                           */
/* ========================================================================== */

export const salaryComponent = pgTable(
  "salary_component",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    componentType: text("component_type").notNull(), // earning | deduction
    calcType: text("calc_type").notNull().default("fixed"), // fixed | percentage | formula
    isTaxable: boolean("is_taxable").notNull().default(true),
    /**
     * THE s.2(y) classification. Decided once, by whoever designs the structure, rather
     * than re-guessed every run — which is exactly how spreadsheets get it wrong.
     */
    wageClass: text("wage_class").notNull(), // included | excluded
    glAccountCode: text("gl_account_code"),
    sequence: integer("sequence").notNull().default(0),
  },
  (t) => [unique("uq_salcomp_tenant_code").on(t.tenantId, t.code)],
);

export const salaryStructure = pgTable(
  "salary_structure",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    status: text("status").notNull().default("active"), // draft|active|superseded
  },
  (t) => [unique("uq_salstruct_tenant_code").on(t.tenantId, t.code)],
);

export const salaryStructureComponent = pgTable(
  "salary_structure_component",
  {
    ...tenantScopedColumns,
    structureId: uuid("structure_id").notNull(),
    componentId: uuid("component_id").notNull(),
    /** Percentage OF MONTHLY GROSS when calcType = percentage; a rupee amount when fixed. */
    valuePct: numeric("value_pct", { precision: 6, scale: 3 }),
    valueAmount: numeric("value_amount", { precision: 12, scale: 2 }),
    sequence: integer("sequence").notNull().default(0),
  },
  (t) => [
    unique("uq_salstructcomp").on(t.tenantId, t.structureId, t.componentId),
    index("ix_salstructcomp_tenant_struct").on(t.tenantId, t.structureId),
  ],
);

export const employeeSalaryAssignment = pgTable(
  "employee_salary_assignment",
  {
    ...tenantScopedColumns,
    employeeId: uuid("employee_id").notNull(),
    structureId: uuid("structure_id").notNull(),
    monthlyGross: numeric("monthly_gross", { precision: 12, scale: 2 }).notNull(),
    ctc: numeric("ctc", { precision: 14, scale: 2 }),
    effectiveFrom: date("effective_from").notNull(),
    status: text("status").notNull().default("active"),
  },
  (t) => [
    unique("uq_salassign_tenant_emp_from").on(t.tenantId, t.employeeId, t.effectiveFrom),
    index("ix_salassign_tenant_emp").on(t.tenantId, t.employeeId),
  ],
);

/* ========================================================================== */
/* Payroll                                                                     */
/* ========================================================================== */

export const payrollRun = pgTable(
  "payroll_run",
  {
    ...tenantScopedColumns,
    runNo: text("run_no").notNull(),
    payGroup: text("pay_group").notNull().default("MONTHLY"),
    periodMonth: date("period_month").notNull(), // first of month
    status: text("status").notNull().default("draft"),
    /** Denominator for proration — 26 working days on the demo tenant. */
    periodWorkingDays: numeric("period_working_days", { precision: 5, scale: 2 }).notNull(),
    totalGross: numeric("total_gross", { precision: 14, scale: 2 }).notNull().default("0"),
    totalDeduction: numeric("total_deduction", { precision: 14, scale: 2 }).notNull().default("0"),
    totalNet: numeric("total_net", { precision: 14, scale: 2 }).notNull().default("0"),
    totalEmployerCost: numeric("total_employer_cost", { precision: 14, scale: 2 }).notNull().default("0"),
    /** SHA256 of the attendance snapshot, assignments, config rows and inputs (§9.4). */
    inputsHash: text("inputs_hash"),
    preparedBy: uuid("prepared_by").notNull(),
    /** Enforced <> preparedBy by a DB CHECK as well as a service guard (NFR-09). */
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    glVoucherId: uuid("gl_voucher_id"),
    glVoucherNo: text("gl_voucher_no"),
  },
  (t) => [
    unique("uq_payrollrun_tenant_group_period").on(t.tenantId, t.payGroup, t.periodMonth),
    unique("uq_payrollrun_tenant_no").on(t.tenantId, t.runNo),
    index("ix_payrollrun_tenant_status").on(t.tenantId, t.status),
  ],
);

export const payslip = pgTable(
  "payslip",
  {
    ...tenantScopedColumns,
    payrollRunId: uuid("payroll_run_id").notNull(),
    employeeId: uuid("employee_id").notNull(),
    paidDays: numeric("paid_days", { precision: 5, scale: 2 }).notNull(),
    lopDays: numeric("lop_days", { precision: 5, scale: 2 }).notNull().default("0"),
    otHours: numeric("ot_hours", { precision: 6, scale: 2 }).notNull().default("0"),
    gross: numeric("gross", { precision: 12, scale: 2 }).notNull(),
    // ---- the deemed-wages block (s.2(y)) — all five figures persisted, per HR-44 ----
    totalRemuneration: numeric("total_remuneration", { precision: 12, scale: 2 }).notNull(),
    includedWages: numeric("included_wages", { precision: 12, scale: 2 }).notNull(),
    excludedWages: numeric("excluded_wages", { precision: 12, scale: 2 }).notNull(),
    deemedWagesAddback: numeric("deemed_wages_addback", { precision: 12, scale: 2 }).notNull(),
    deemedWages: numeric("deemed_wages", { precision: 12, scale: 2 }).notNull(),
    pfWageBase: numeric("pf_wage_base", { precision: 12, scale: 2 }).notNull(),
    gratuityWageBase: numeric("gratuity_wage_base", { precision: 12, scale: 2 }).notNull(),
    gratuityProvision: numeric("gratuity_provision", { precision: 12, scale: 2 }).notNull().default("0"),
    gratuityVestingDate: date("gratuity_vesting_date"),
    // --------------------------------------------------------------------------------
    totalDeduction: numeric("total_deduction", { precision: 12, scale: 2 }).notNull(),
    employerCost: numeric("employer_cost", { precision: 12, scale: 2 }).notNull().default("0"),
    netPay: numeric("net_pay", { precision: 12, scale: 2 }).notNull(),
    status: text("status").notNull().default("computed"),
  },
  (t) => [
    unique("uq_payslip_tenant_run_emp").on(t.tenantId, t.payrollRunId, t.employeeId),
    index("ix_payslip_tenant_emp").on(t.tenantId, t.employeeId),
  ],
);

export const payslipLine = pgTable(
  "payslip_line",
  {
    ...tenantScopedColumns,
    payslipId: uuid("payslip_id").notNull(),
    componentCode: text("component_code").notNull(),
    componentName: text("component_name").notNull(),
    lineType: text("line_type").notNull(), // earning | deduction
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    baseForCalc: numeric("base_for_calc", { precision: 12, scale: 2 }),
    /** How this line was derived, frozen at compute time so the trace survives config change. */
    formulaSnapshot: text("formula_snapshot"),
    wageClassSnapshot: text("wage_class_snapshot"),
    sequence: integer("sequence").notNull().default(0),
  },
  (t) => [index("ix_payslipline_tenant_payslip").on(t.tenantId, t.payslipId, t.sequence)],
);

export const statutoryContribution = pgTable(
  "statutory_contribution",
  {
    ...tenantScopedColumns,
    payslipId: uuid("payslip_id").notNull(),
    statute: text("statute").notNull(), // epf | esi | pt | tds
    employeeAmount: numeric("employee_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    employerAmount: numeric("employer_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    /** Two statutes, two bases, one payslip — so each row records the base it used. */
    wageBase: numeric("wage_base", { precision: 12, scale: 2 }).notNull().default("0"),
    /** Which effective-dated config row produced this figure. */
    configRef: text("config_ref").notNull(),
    detail: jsonb("detail"),
    note: text("note"),
  },
  (t) => [
    unique("uq_statcontrib_tenant_payslip_statute").on(t.tenantId, t.payslipId, t.statute),
    index("ix_statcontrib_tenant_statute").on(t.tenantId, t.statute),
  ],
);
