import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { amendableColumns, tenantScopedColumns } from "./columns.js";

/**
 * EXPENDITURE (RASP, Module 12) — the money going out that is not a purchase order.
 *
 * PURCHASE buys things that arrive in a warehouse. This module handles everything else a
 * factory actually spends money on: an engineer's hotel bill, the housekeeping AMC, the
 * electricity, the auditor's fee, the rent. It is where budgetary control lives, where TDS
 * is withheld, and where input tax credit is decided.
 *
 * Three structural positions, each of which is the reason a column exists:
 *
 * **1. Availability is a ledger, not a report.** `budget_consumption` is append-only and
 * carries a signed amount in one of three buckets. A budget check reads that ledger under
 * a row lock; it never sums journals. The difference matters because the money that will
 * blow a cost centre is already committed on approved documents, and a report that counts
 * only posted spend says everything is fine right up to the month it does not.
 *
 * **2. Expenditure never writes a general-ledger row.** It writes a `posting_instruction`
 * with a journal-shaped payload and an idempotency key, in the same transaction as the
 * approval, and ACCOUNTS posts it. The ledger has exactly one writer and this is not it.
 *
 * **3. Nothing an AI extracts becomes money without a person.** A receipt draft lives on
 * `exp_attachment.parsed_fields` with its per-field confidence. It becomes a claim line
 * only through the confirm endpoint, and the line then carries `source = 'ai_assisted'`
 * with every edit the human made recorded beside it — because the edit rate is the only
 * honest measure of whether the feature earns its cost.
 *
 * Cross-module references (cost centre, employee, vendor, GL account, purchase order) are
 * logical: a uuid or a document number with a comment, never a foreign key across a
 * module boundary.
 */

/* ============================ masters & config ============================= */

/**
 * The spend catalogue. This is where a category's tax behaviour is DECLARED rather than
 * decided per document — the GST rate, the s.17(5) block, the TDS section, and the receipt
 * threshold all hang off the head, so a policy change is one row and not a code change.
 */
export const expenseHead = pgTable(
  "expense_head",
  {
    ...tenantScopedColumns,
    code: text("code").notNull(),
    name: text("name").notNull(),
    glAccountRef: uuid("gl_account_ref"), // logical ref → Accounts chart
    capexFlag: boolean("capex_flag").notNull().default(false),
    gstRate: numeric("gst_rate", { precision: 5, scale: 2 }),
    /** The s.17(5) position. `resolveItc` never infers this — it reads it. */
    itcEligibility: text("itc_eligibility").notNull().default("eligible"),
    defaultTdsSection: text("default_tds_section"),
    /** Above this, a bill-backed line needs a receipt or it raises a policy flag. */
    receiptThreshold: numeric("receipt_threshold", { precision: 18, scale: 2 }).notNull().default("0"),
    policyGroup: jsonb("policy_group").notNull().default({}),
    /** The deterministic baseline for AI #1's auto-categorisation, and the thing the model
     *  has to beat in the golden-set gate. Configuration, not a hard-coded dictionary. */
    categoryKeywords: jsonb("category_keywords").notNull().default([]),
  },
  (t) => [unique("uq_exp_head_code").on(t.tenantId, t.code)],
);

/**
 * The TDS rate book. Effective-dated and append-only, exactly like HRM's statutory tables:
 * a July deduction must still be reproducible in a 2029 assessment, so a rate is never
 * edited — a change is a new row with a new `effective_from`.
 */
export const tdsConfig = pgTable(
  "tds_config",
  {
    ...tenantScopedColumns,
    section: text("section").notNull(), // 194C | 194J | 194I | 194Q | 194H
    deducteeType: text("deductee_type").notNull().default("any"),
    ratePct: numeric("rate_pct", { precision: 6, scale: 3 }).notNull(),
    singlePaymentThreshold: numeric("single_payment_threshold", { precision: 18, scale: 2 }).notNull(),
    annualThreshold: numeric("annual_threshold", { precision: 18, scale: 2 }).notNull(),
    /** The Income-tax Act 2025 renumbering, carried so a later register reconciles. */
    itAct2025Section: text("it_act_2025_section"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    /** Where the number comes from. Printed beside the deduction on the TDS register. */
    sourceNote: text("source_note").notNull(),
  },
  (t) => [index("ix_tds_cfg").on(t.tenantId, t.section, t.effectiveFrom)],
);

/** Per vendor × section × financial year. The reason a ₹9,000-a-month vendor starts being
 *  deducted in the eleventh month rather than never. */
export const tdsAccumulator = pgTable(
  "tds_accumulator",
  {
    ...tenantScopedColumns,
    vendorRef: uuid("vendor_ref").notNull(), // logical ref → Purchase vendor
    section: text("section").notNull(),
    fiscalYear: text("fiscal_year").notNull(),
    cumulativeBase: numeric("cumulative_base", { precision: 18, scale: 2 }).notNull().default("0"),
    thresholdCrossedAt: date("threshold_crossed_at"),
    crossingDocRef: text("crossing_doc_ref"),
  },
  (t) => [unique("uq_tds_accum").on(t.tenantId, t.vendorRef, t.section, t.fiscalYear)],
);

/** Grade × city tier × trip type, effective-dated. Resolved as of the EXPENSE date, so a
 *  revision in October cannot restate a July trip. */
export const perDiemRate = pgTable(
  "per_diem_rate",
  {
    ...tenantScopedColumns,
    gradeCode: text("grade_code").notNull(),
    cityTier: text("city_tier").notNull(), // A | B | C
    tripType: text("trip_type").notNull().default("domestic"),
    dailyRate: numeric("daily_rate", { precision: 18, scale: 2 }).notNull(),
    lodgingRate: numeric("lodging_rate", { precision: 18, scale: 2 }),
    mealsRate: numeric("meals_rate", { precision: 18, scale: 2 }),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
  },
  (t) => [index("ix_perdiem").on(t.tenantId, t.gradeCode, t.cityTier, t.effectiveFrom)],
);

/** Effective-dated currency rates. Applied as of the EXPENSE date, and the row id is stored
 *  on the document so a submitted claim is never restated by a later rate move. */
export const fxRate = pgTable(
  "fx_rate",
  {
    ...tenantScopedColumns,
    currency: text("currency").notNull(),
    rateToInr: numeric("rate_to_inr", { precision: 18, scale: 6 }).notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    source: text("source").notNull().default("manual"),
  },
  (t) => [index("ix_fx").on(t.tenantId, t.currency, t.effectiveFrom)],
);

/* ================================ budgets ================================== */

export const budget = pgTable(
  "budget",
  {
    ...tenantScopedColumns,
    fiscalYear: text("fiscal_year").notNull(),
    costCentreRef: text("cost_centre_ref").notNull(),
    projectRef: text("project_ref"),
    budgetType: text("budget_type").notNull().default("opex"),
    basis: text("basis").notNull().default("monthly"), // monthly | cumulative
    versionNo: smallint("version_no").notNull().default(1),
    status: text("status").notNull().default("draft"),
    workflowInstanceId: uuid("workflow_instance_id"),
  },
  (t) => [unique("uq_budget_ver").on(t.tenantId, t.fiscalYear, t.costCentreRef, t.versionNo)],
);

export const budgetLine = pgTable(
  "budget_line",
  {
    ...tenantScopedColumns,
    budgetId: uuid("budget_id").notNull(),
    expenseHeadId: uuid("expense_head_id").notNull(),
    annualAmount: numeric("annual_amount", { precision: 18, scale: 2 }).notNull(),
    /** Twelve cells, April-first. A CHECK enforces the count AND that they sum to the
     *  annual figure — a budget whose own cells do not add up is unreconcilable later. */
    monthlyDistribution: jsonb("monthly_distribution").notNull(),
    controlAction: text("control_action").notNull().default("warn"), // stop | warn | ignore
    applicableDocs: jsonb("applicable_docs").notNull().default(["expense_claim", "purchase_expense"]),
  },
  (t) => [unique("uq_budget_line").on(t.tenantId, t.budgetId, t.expenseHeadId)],
);

export const budgetRevision = pgTable(
  "budget_revision",
  {
    ...tenantScopedColumns,
    budgetId: uuid("budget_id").notNull(),
    fromVersion: smallint("from_version").notNull(),
    toVersion: smallint("to_version").notNull(),
    reason: text("reason").notNull(),
    changedLines: jsonb("changed_lines").notNull().default([]),
    /** Lines cut below what is already spent. Must be acknowledged, never silently
     *  applied — the money is gone and somebody has to have seen that. */
    commitmentConflicts: jsonb("commitment_conflicts").notNull().default([]),
    acknowledgedBy: uuid("acknowledged_by"),
  },
  (t) => [index("ix_budget_rev").on(t.tenantId, t.budgetId)],
);

/**
 * THE RESERVATION LEDGER — the source of truth for availability.
 *
 * Append-only at the grant and at a trigger. Every row is signed, so a rejection is a
 * negative row rather than an update, and the sequence of decisions survives. The
 * idempotency key is unique, so a retried submit cannot reserve the same money twice.
 */
export const budgetConsumption = pgTable(
  "budget_consumption",
  {
    ...tenantScopedColumns,
    budgetLineId: uuid("budget_line_id").notNull(),
    period: smallint("period").notNull(), // 1..12, April = 1
    bucket: text("bucket").notNull(), // in_approval | committed | actual
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    docType: text("doc_type").notNull(),
    docRef: text("doc_ref").notNull(),
    entryType: text("entry_type").notNull(), // reserve | flip | reverse
    idempotencyKey: text("idempotency_key").notNull(),
    note: text("note"),
  },
  (t) => [
    unique("uq_budget_consumption_idem").on(t.tenantId, t.idempotencyKey),
    index("ix_budget_consumption").on(t.tenantId, t.budgetLineId, t.period, t.bucket),
  ],
);

/* ============================== expense claims ============================= */

export const expenseClaim = pgTable(
  "expense_claim",
  {
    ...tenantScopedColumns,
    ...amendableColumns,
    claimNo: text("claim_no").notNull(),
    employeeRef: uuid("employee_ref").notNull(), // logical ref → HRM employee
    claimDate: date("claim_date").notNull(),
    costCentreRef: text("cost_centre_ref").notNull(),
    projectRef: text("project_ref"),
    advanceId: uuid("advance_id"),
    currency: text("currency").notNull().default("INR"),
    fxRateId: uuid("fx_rate_id"),
    totalClaimed: numeric("total_claimed", { precision: 18, scale: 2 }).notNull().default("0"),
    totalTax: numeric("total_tax", { precision: 18, scale: 2 }).notNull().default("0"),
    totalItcEligible: numeric("total_itc_eligible", { precision: 18, scale: 2 }).notNull().default("0"),
    advanceAdjusted: numeric("advance_adjusted", { precision: 18, scale: 2 }).notNull().default("0"),
    /** GENERATED, and CHECKed non-negative. When the advance exceeds the claim the
     *  difference is a refund receivable from the employee — a different thing from a
     *  negative payout that silently becomes a payroll deduction nobody agreed to. */
    netReimbursable: numeric("net_reimbursable", { precision: 18, scale: 2 }),
    status: text("status").notNull().default("draft"),
    policyFlags: jsonb("policy_flags").notNull().default([]),
    budgetCheckResult: jsonb("budget_check_result"),
    workflowInstanceId: uuid("workflow_instance_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    idempotencyKeyHash: text("idempotency_key_hash"),
  },
  (t) => [
    unique("uq_claim_no").on(t.tenantId, t.claimNo),
    index("ix_claim_emp").on(t.tenantId, t.employeeRef, t.status),
  ],
);

export const expenseClaimLine = pgTable(
  "expense_claim_line",
  {
    ...tenantScopedColumns,
    claimId: uuid("claim_id").notNull(),
    lineNo: smallint("line_no").notNull(),
    expenseHeadId: uuid("expense_head_id").notNull(),
    expenseDate: date("expense_date").notNull(),
    merchant: text("merchant"),
    description: text("description"),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    gstAmount: numeric("gst_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    itcAmount: numeric("itc_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    itcEligibility: text("itc_eligibility").notNull().default("eligible"),
    itcReason: text("itc_reason"),
    reimbursableType: text("reimbursable_type").notNull().default("bill_backed"),
    distanceKm: numeric("distance_km", { precision: 12, scale: 2 }),
    ratePerKm: numeric("rate_per_km", { precision: 12, scale: 2 }),
    attachmentId: uuid("attachment_id"),
    costCentreRef: text("cost_centre_ref"),
    policyFlags: jsonb("policy_flags").notNull().default([]),
    /** `manual` or `ai_assisted`. The tag is what makes the acceptance dashboard possible. */
    source: text("source").notNull().default("manual"),
    aiConfidence: jsonb("ai_confidence"),
    /** field → { extracted, final } for everything the human changed. The honest metric. */
    aiUserEdits: jsonb("ai_user_edits"),
  },
  (t) => [unique("uq_claim_line_no").on(t.tenantId, t.claimId, t.lineNo)],
);

/* ========================== travel & cash advances ========================= */

export const travelRequest = pgTable(
  "travel_request",
  {
    ...tenantScopedColumns,
    ...amendableColumns,
    travelNo: text("travel_no").notNull(),
    employeeRef: uuid("employee_ref").notNull(),
    costCentreRef: text("cost_centre_ref").notNull(),
    purpose: text("purpose").notNull(),
    fromCity: text("from_city").notNull(),
    toCity: text("to_city").notNull(),
    cityTier: text("city_tier").notNull().default("B"),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    modeOfTravel: text("mode_of_travel"),
    estCost: numeric("est_cost", { precision: 18, scale: 2 }).notNull().default("0"),
    perDiemAmount: numeric("per_diem_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    /** The exact effective-dated rate row used, so the entitlement is reproducible. */
    perDiemRateRef: text("per_diem_rate_ref"),
    advanceId: uuid("advance_id"),
    claimId: uuid("claim_id"),
    status: text("status").notNull().default("draft"),
    workflowInstanceId: uuid("workflow_instance_id"),
  },
  (t) => [unique("uq_travel_no").on(t.tenantId, t.travelNo)],
);

export const cashAdvance = pgTable(
  "cash_advance",
  {
    ...tenantScopedColumns,
    ...amendableColumns,
    advanceNo: text("advance_no").notNull(),
    employeeRef: uuid("employee_ref").notNull(),
    purpose: text("purpose").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    paidAmount: numeric("paid_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    settledAmount: numeric("settled_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    refundedAmount: numeric("refunded_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    /** GENERATED from the three above — a balance that is maintained by hand is a balance
     *  that disagrees with its own components on the day somebody needs it. */
    balance: numeric("balance", { precision: 18, scale: 2 }),
    neededBy: date("needed_by"),
    /** Mandatory. The whole overdue-block control hangs off this one date. */
    settleBy: date("settle_by").notNull(),
    travelRequestId: uuid("travel_request_id"),
    status: text("status").notNull().default("requested"),
    workflowInstanceId: uuid("workflow_instance_id"),
    disbursedAt: timestamp("disbursed_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_advance_no").on(t.tenantId, t.advanceNo),
    index("ix_advance_emp").on(t.tenantId, t.employeeRef, t.status),
  ],
);

export const advanceSettlement = pgTable(
  "advance_settlement",
  {
    ...tenantScopedColumns,
    advanceId: uuid("advance_id").notNull(),
    claimId: uuid("claim_id"),
    settlementType: text("settlement_type").notNull(), // claim_adjust | refund
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
  },
  (t) => [index("ix_adv_settle").on(t.tenantId, t.advanceId)],
);

/* ============================= indirect spend ============================== */

export const purchaseExpense = pgTable(
  "purchase_expense",
  {
    ...tenantScopedColumns,
    ...amendableColumns,
    expNo: text("exp_no").notNull(),
    docKind: text("doc_kind").notNull(), // direct_invoice | indirect_pr | utility_bill
    vendorRef: uuid("vendor_ref"), // logical ref → Purchase vendor
    vendorName: text("vendor_name").notNull(),
    vendorGstin: text("vendor_gstin"),
    vendorDeducteeType: text("vendor_deductee_type").notNull().default("company_firm_other"),
    vendorHasPan: boolean("vendor_has_pan").notNull().default(true),
    vendorInvoiceNo: text("vendor_invoice_no"),
    invoiceDate: date("invoice_date"),
    costCentreRef: text("cost_centre_ref").notNull(),
    fulfilment: text("fulfilment").notNull().default("received"),
    poRef: text("po_ref"),
    basicAmount: numeric("basic_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    cgst: numeric("cgst", { precision: 18, scale: 2 }).notNull().default("0"),
    sgst: numeric("sgst", { precision: 18, scale: 2 }).notNull().default("0"),
    igst: numeric("igst", { precision: 18, scale: 2 }).notNull().default("0"),
    totalItcEligible: numeric("total_itc_eligible", { precision: 18, scale: 2 }).notNull().default("0"),
    tdsSection: text("tds_section"),
    tdsRate: numeric("tds_rate", { precision: 6, scale: 3 }),
    tdsBase: numeric("tds_base", { precision: 18, scale: 2 }).notNull().default("0"),
    tdsAmount: numeric("tds_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    /** The exact effective-dated config row used, so a 2029 assessment can reproduce it. */
    tdsConfigRef: text("tds_config_ref"),
    /** Populated on the document where the annual threshold is crossed. Carries BOTH
     *  statutory readings and the finance-review flag — the system does not choose. */
    tdsCrossing: jsonb("tds_crossing"),
    budgetCheckResult: jsonb("budget_check_result"),
    status: text("status").notNull().default("draft"),
    workflowInstanceId: uuid("workflow_instance_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    idempotencyKeyHash: text("idempotency_key_hash"),
  },
  (t) => [
    unique("uq_purchase_expense_no").on(t.tenantId, t.expNo),
    index("ix_purchase_expense_vendor").on(t.tenantId, t.vendorRef, t.status),
  ],
);

export const purchaseExpenseLine = pgTable(
  "purchase_expense_line",
  {
    ...tenantScopedColumns,
    purchaseExpenseId: uuid("purchase_expense_id").notNull(),
    lineNo: smallint("line_no").notNull(),
    expenseHeadId: uuid("expense_head_id").notNull(),
    description: text("description").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    gstRate: numeric("gst_rate", { precision: 5, scale: 2 }),
    gstAmount: numeric("gst_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    itcEligibility: text("itc_eligibility").notNull().default("eligible"),
    itcAmount: numeric("itc_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    hsnSac: text("hsn_sac"),
    costCentreRef: text("cost_centre_ref"),
    allocation: jsonb("allocation"),
    source: text("source").notNull().default("manual"),
    aiConfidence: jsonb("ai_confidence"),
  },
  (t) => [unique("uq_pe_line_no").on(t.tenantId, t.purchaseExpenseId, t.lineNo)],
);

/** A 1:1 extension for utilities — the meter reading is what makes a ₹/unit anomaly
 *  computable, and that anomaly is arithmetic rather than AI (§13.3). */
export const utilityBillDetail = pgTable(
  "utility_bill_detail",
  {
    ...tenantScopedColumns,
    purchaseExpenseId: uuid("purchase_expense_id").notNull(),
    utilityType: text("utility_type").notNull(),
    meterNo: text("meter_no"),
    periodFrom: date("period_from"),
    periodTo: date("period_to"),
    prevReading: numeric("prev_reading", { precision: 18, scale: 3 }),
    currReading: numeric("curr_reading", { precision: 18, scale: 3 }),
    unitsConsumed: numeric("units_consumed", { precision: 18, scale: 3 }),
  },
  (t) => [unique("uq_utility_detail").on(t.tenantId, t.purchaseExpenseId)],
);

export const recurringExpense = pgTable(
  "recurring_expense",
  {
    ...tenantScopedColumns,
    templateCode: text("template_code").notNull(),
    expenseHeadId: uuid("expense_head_id").notNull(),
    vendorRef: uuid("vendor_ref"),
    vendorName: text("vendor_name").notNull(),
    costCentreRef: text("cost_centre_ref").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    gstRate: numeric("gst_rate", { precision: 5, scale: 2 }),
    frequency: text("frequency").notNull(), // monthly | quarterly | annual
    nextRunDate: date("next_run_date").notNull(),
    endDate: date("end_date"),
    /** Auto-post is capped, and a template firing against a Stop budget produces a
     *  BLOCKED draft with a notification — never a silent posting. */
    autoPost: boolean("auto_post").notNull().default(false),
    autoPostCeiling: numeric("auto_post_ceiling", { precision: 18, scale: 2 }),
    lastGeneratedRef: text("last_generated_ref"),
    status: text("status").notNull().default("active"),
  },
  (t) => [unique("uq_recurring_code").on(t.tenantId, t.templateCode)],
);

/* ====================== reimbursement & posting handoff ==================== */

export const reimbursementBatch = pgTable(
  "reimbursement_batch",
  {
    ...tenantScopedColumns,
    batchNo: text("batch_no").notNull(),
    payMode: text("pay_mode").notNull().default("bank_transfer"),
    status: text("status").notNull().default("draft"),
    totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    idempotencyKeyHash: text("idempotency_key_hash"),
  },
  (t) => [unique("uq_reimb_batch_no").on(t.tenantId, t.batchNo)],
);

export const reimbursement = pgTable(
  "reimbursement",
  {
    ...tenantScopedColumns,
    batchId: uuid("batch_id").notNull(),
    claimId: uuid("claim_id").notNull(),
    grossAmount: numeric("gross_amount", { precision: 18, scale: 2 }).notNull(),
    advanceAdjusted: numeric("advance_adjusted", { precision: 18, scale: 2 }).notNull().default("0"),
    netAmount: numeric("net_amount", { precision: 18, scale: 2 }).notNull(),
    bankRef: text("bank_ref"),
    payrollPeriod: text("payroll_period"),
    paidDate: date("paid_date"),
    status: text("status").notNull().default("pending"),
  },
  (t) => [unique("uq_reimb_claim").on(t.tenantId, t.batchId, t.claimId)],
);

/**
 * The handoff to Accounts. Expenditure writes the journal-shaped payload here in the same
 * transaction as the approval; the relay delivers it; Accounts posts and acknowledges with
 * a voucher reference, and the acknowledgement flips the budget bucket to `actual`.
 *
 * The idempotency key is unique, so a replayed delivery cannot double-post a journal.
 */
export const postingInstruction = pgTable(
  "posting_instruction",
  {
    ...tenantScopedColumns,
    docType: text("doc_type").notNull(),
    docRef: text("doc_ref").notNull(),
    payload: jsonb("payload").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("pending"), // pending|sent|acked|failed
    accountsVoucherRef: text("accounts_voucher_ref"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    ackedAt: timestamp("acked_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_posting_idem").on(t.tenantId, t.idempotencyKey),
    index("ix_posting_status").on(t.tenantId, t.status),
  ],
);

/* ================================ attachments ============================== */

/**
 * Receipt metadata and the AI #1 extraction draft.
 *
 * `sha256` is the registered deterministic baseline for duplicate detection and it is
 * INDEXED rather than unique: the same file appearing twice must be *detected and flagged*,
 * not refused at the point of upload. Refusing would hide the second claim rather than
 * surface it, and the approver needs to see both documents.
 */
export const expAttachment = pgTable(
  "exp_attachment",
  {
    ...tenantScopedColumns,
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    /** The extraction draft: fields, per-field confidence, model, and the hashes of the
     *  prompt and response — never the prompt itself, which contains the document. */
    parsedFields: jsonb("parsed_fields"),
    extractionStatus: text("extraction_status").notNull().default("none"),
    /** Fields the cross-checks demoted. Nothing here reaches a claim line unreviewed. */
    needsReview: jsonb("needs_review").notNull().default([]),
    usedFallback: boolean("used_fallback").notNull().default(false),
    linkedDocType: text("linked_doc_type"),
    linkedDocRef: text("linked_doc_ref"),
    uploadedByRef: uuid("uploaded_by_ref"),
    /** Duplicate findings, as flags for the approver. Never an auto-rejection. */
    duplicateFlags: jsonb("duplicate_flags").notNull().default([]),
  },
  (t) => [
    index("ix_attachment_sha").on(t.tenantId, t.sha256),
    index("ix_attachment_doc").on(t.tenantId, t.linkedDocType, t.linkedDocRef),
  ],
);

/** Per-tenant document numbering for EXP / TRV / ADV, allocated under a row lock. */
export const expDocumentSeries = pgTable(
  "exp_document_series",
  {
    ...tenantScopedColumns,
    docType: text("doc_type").notNull(), // claim | travel | advance | indirect | batch
    prefix: text("prefix").notNull(),
    fyCode: text("fy_code").notNull(),
    width: smallint("width").notNull().default(5),
    nextNo: integer("next_no").notNull().default(1),
  },
  (t) => [unique("uq_exp_series").on(t.tenantId, t.docType, t.fyCode)],
);
