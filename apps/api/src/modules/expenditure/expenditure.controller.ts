import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { BudgetService } from "./budget.service.js";
import { ClaimService } from "./claim.service.js";
import { AdvanceService } from "./advance.service.js";
import { IndirectExpenseService } from "./indirect.service.js";
import { AttachmentService } from "./attachment.service.js";
import { PostingService } from "./posting.service.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const claimLineSchema = z.object({
  expenseHeadCode: z.string().min(1),
  expenseDate: z.string().regex(DATE),
  amount: z.number().positive(),
  gstAmount: z.number().nonnegative().optional(),
  merchant: z.string().optional(),
  description: z.string().optional(),
  invoiceRecipientGstin: z.string().nullable().optional(),
  reimbursableType: z.enum(["bill_backed", "allowance"]).optional(),
  attachmentId: z.string().uuid().optional(),
});

const createClaimSchema = z.object({
  employeeRef: z.string().uuid(),
  costCentreRef: z.string().min(1),
  claimDate: z.string().regex(DATE),
  advanceNo: z.string().optional(),
  lines: z.array(claimLineSchema).min(1),
});

const indirectSchema = z.object({
  docKind: z.enum(["direct_invoice", "indirect_pr", "utility_bill"]),
  vendorName: z.string().min(1),
  vendorRef: z.string().uuid().optional(),
  vendorGstin: z.string().nullable().optional(),
  vendorDeducteeType: z.enum(["individual_huf", "company_firm_other"]).optional(),
  vendorHasPan: z.boolean().optional(),
  vendorInvoiceNo: z.string().optional(),
  invoiceDate: z.string().regex(DATE),
  costCentreRef: z.string().min(1),
  lines: z
    .array(
      z.object({
        expenseHeadCode: z.string().min(1),
        description: z.string().min(1),
        amount: z.number().positive(),
        gstRate: z.number().nonnegative().optional(),
        hsnSac: z.string().optional(),
      }),
    )
    .min(1),
  utility: z
    .object({
      utilityType: z.string().min(1),
      meterNo: z.string().optional(),
      periodFrom: z.string().regex(DATE).optional(),
      periodTo: z.string().regex(DATE).optional(),
      prevReading: z.number().nonnegative().optional(),
      currReading: z.number().nonnegative().optional(),
    })
    .optional(),
});

const advanceSchema = z.object({
  employeeRef: z.string().uuid(),
  purpose: z.string().min(1),
  amount: z.number().positive(),
  settleBy: z.string().regex(DATE),
  neededBy: z.string().regex(DATE).optional(),
  travelNo: z.string().optional(),
  asOf: z.string().regex(DATE).optional(),
  hasOverridePermission: z.boolean().optional(),
  overrideReason: z.string().optional(),
});

const travelSchema = z.object({
  employeeRef: z.string().uuid(),
  gradeCode: z.string().min(1),
  costCentreRef: z.string().min(1),
  purpose: z.string().min(1),
  fromCity: z.string().min(1),
  toCity: z.string().min(1),
  cityTier: z.enum(["A", "B", "C"]),
  fromDate: z.string().regex(DATE),
  toDate: z.string().regex(DATE),
  modeOfTravel: z.string().optional(),
  estCost: z.number().nonnegative().optional(),
});

const reviseSchema = z.object({
  costCentreRef: z.string().min(1),
  fiscalYear: z.string().min(4),
  reason: z.string().min(1),
  onDate: z.string().regex(DATE),
  changes: z.array(z.object({ expenseHeadCode: z.string().min(1), newAnnualAmount: z.number().nonnegative() })).min(1),
  acknowledgeConflicts: z.boolean().optional(),
});

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw Errors.validation(r.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  }
  return r.data as z.output<S>;
}

function requireKey(key: string | undefined, what: string): string {
  if (!key) throw Errors.validation([{ field: "Idempotency-Key", message: `required on ${what}` }]);
  return key;
}

/**
 * EXPENDITURE — `/api/v1/expenditure`.
 *
 * `Idempotency-Key` is REQUIRED on every route that reserves budget or moves money:
 * claim submission, indirect-expense submission, and posting retry. Those are the three
 * places where a retried request could commit the same rupees twice, and the database's
 * unique constraint on the consumption ledger is what turns a duplicate into a collision
 * rather than a silent double-reservation.
 */
@Controller("api/v1/expenditure")
export class ExpenditureController {
  constructor(
    private readonly budgets: BudgetService,
    private readonly claims: ClaimService,
    private readonly advances: AdvanceService,
    private readonly indirect: IndirectExpenseService,
    private readonly attachments: AttachmentService,
    private readonly postings: PostingService,
  ) {}

  /* --------------------------------- budgets ------------------------------- */

  @Get("budget-check")
  @RequirePermission("expenditure.budget.read")
  async budgetCheck(
    @Query("costCentreRef") costCentreRef: string,
    @Query("expenseHeadCode") expenseHeadCode: string,
    @Query("onDate") onDate: string,
  ) {
    return this.budgets.availabilityFor(costCentreRef, expenseHeadCode, onDate);
  }

  @Get("budgets/consumption")
  @RequirePermission("expenditure.budget.read")
  async consumption(
    @Query("costCentreRef") costCentreRef: string,
    @Query("expenseHeadCode") expenseHeadCode: string,
    @Query("fiscalYear") fiscalYear: string,
  ) {
    return this.budgets.consumption(costCentreRef, expenseHeadCode, fiscalYear);
  }

  /** A revision that would cut a line below what is already spent returns 409 with the
   *  conflicts; `acknowledgeConflicts` is the explicit "I have seen this" step. */
  @Post("budgets/revise")
  @RequirePermission("expenditure.budget.manage")
  async revise(@Body() body: unknown) {
    return this.budgets.revise(parse(reviseSchema, body));
  }

  /* --------------------------------- claims -------------------------------- */

  @Post("claims")
  @RequirePermission("expenditure.claim.create")
  async createClaim(@Body() body: unknown) {
    return this.claims.create(parse(createClaimSchema, body));
  }

  @Post("claims/:claimNo/lines")
  @RequirePermission("expenditure.claim.create")
  async addLine(@Param("claimNo") claimNo: string, @Body() body: unknown) {
    return this.claims.addLine(claimNo, parse(claimLineSchema, body));
  }

  @Post("claims/:claimNo/submit")
  @RequirePermission("expenditure.claim.create")
  async submitClaim(
    @Param("claimNo") claimNo: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
  ) {
    const input = parse(
      z.object({ submittedOn: z.string().regex(DATE).optional(), callerCanOverride: z.boolean().optional(), overrideReason: z.string().optional() }),
      body ?? {},
    );
    return this.claims.submit(claimNo, { ...input, idempotencyKey: requireKey(key, "claim submission") });
  }

  @Post("claims/:claimNo/approve")
  @RequirePermission("expenditure.claim.approve")
  async approveClaim(@Param("claimNo") claimNo: string, @Query("at") at?: string) {
    return this.claims.approve(claimNo, { at });
  }

  @Post("claims/:claimNo/reject")
  @RequirePermission("expenditure.claim.approve")
  async rejectClaim(@Param("claimNo") claimNo: string, @Body() body: unknown) {
    const input = parse(z.object({ reason: z.string().min(1) }), body);
    return this.claims.reject(claimNo, input.reason);
  }

  @Get("claims")
  @RequirePermission("expenditure.claim.read")
  async listClaims(@Query("employeeRef") employeeRef?: string, @Query("status") status?: string) {
    return this.claims.list({ employeeRef, status });
  }

  @Get("claims/:claimNo")
  @RequirePermission("expenditure.claim.read")
  async claimDetail(@Param("claimNo") claimNo: string) {
    return this.claims.detail(claimNo);
  }

  /* ------------------------- receipts: AI #1 and AI #4 --------------------- */

  @Post("attachments")
  @RequirePermission("expenditure.claim.create")
  async registerAttachment(@Body() body: unknown) {
    const input = parse(
      z.object({
        fileName: z.string().min(1),
        mime: z.string().min(1),
        sizeBytes: z.number().int().positive(),
        sha256: z.string().min(16),
        uploadedByRef: z.string().uuid().optional(),
        fingerprint: z
          .object({
            merchant: z.string(),
            invoiceNo: z.string().nullable().optional(),
            invoiceDate: z.string().regex(DATE),
            amount: z.number().nonnegative(),
            docRef: z.string(),
            claimantRef: z.string(),
          })
          .optional(),
      }),
      body,
    );
    return this.attachments.register(input);
  }

  @Post("attachments/:id/extract")
  @RequirePermission("expenditure.claim.create")
  async extract(@Param("id") id: string, @Body() body: unknown) {
    const input = parse(
      z.object({
        text: z.string().min(1),
        hint: z.record(z.unknown()).optional(),
        confidence: z.record(z.number()).optional(),
        fallback: z.record(z.unknown()).optional(),
        expectedGstRate: z.number().nullable().optional(),
      }),
      body,
    );
    return this.attachments.extract(id, input as never);
  }

  /** The human gate. This is the ONLY route from an extraction draft to a claim line. */
  @Post("attachments/:id/confirm")
  @RequirePermission("expenditure.claim.create")
  async confirm(@Param("id") id: string, @Body() body: unknown) {
    const input = parse(
      z.object({
        claimNo: z.string().min(1),
        expenseHeadCode: z.string().min(1),
        expenseDate: z.string().regex(DATE),
        amount: z.number().positive(),
        gstAmount: z.number().nonnegative().optional(),
        merchant: z.string().optional(),
        invoiceRecipientGstin: z.string().nullable().optional(),
        description: z.string().optional(),
      }),
      body,
    );
    return this.attachments.confirm(id, input);
  }

  @Post("attachments/:id/decline")
  @RequirePermission("expenditure.claim.create")
  async decline(@Param("id") id: string) {
    return this.attachments.decline(id);
  }

  @Get("reports/duplicate-sweep")
  @RequirePermission("expenditure.claim.approve")
  async duplicateSweep(@Query("threshold") threshold?: string) {
    return this.attachments.duplicateSweep(threshold ? Number(threshold) : 500);
  }

  @Get("reports/ai-acceptance")
  @RequirePermission("expenditure.budget.read")
  async aiAcceptance() {
    return this.attachments.acceptance();
  }

  /* ------------------------------ advances & travel ------------------------ */

  @Post("advances")
  @RequirePermission("expenditure.claim.create")
  async requestAdvance(@Body() body: unknown) {
    return this.advances.request(parse(advanceSchema, body));
  }

  @Post("advances/:advanceNo/disburse")
  @RequirePermission("expenditure.claim.approve")
  async disburse(@Param("advanceNo") advanceNo: string, @Body() body: unknown) {
    const input = parse(z.object({ amount: z.number().positive().optional(), at: z.string().optional() }), body ?? {});
    return this.advances.disburse(advanceNo, input);
  }

  @Post("advances/:advanceNo/refund")
  @RequirePermission("expenditure.claim.approve")
  async refund(@Param("advanceNo") advanceNo: string, @Body() body: unknown) {
    const input = parse(z.object({ amount: z.number().positive(), at: z.string().optional() }), body);
    return this.advances.refund(advanceNo, input.amount, input.at);
  }

  @Get("advances/aging")
  @RequirePermission("expenditure.budget.read")
  async aging(@Query("asOf") asOf?: string) {
    return this.advances.aging(asOf);
  }

  @Post("travel-requests")
  @RequirePermission("expenditure.claim.create")
  async createTravel(@Body() body: unknown) {
    return this.advances.createTravel(parse(travelSchema, body));
  }

  @Post("travel-requests/:travelNo/approve")
  @RequirePermission("expenditure.claim.approve")
  async approveTravel(@Param("travelNo") travelNo: string) {
    return this.advances.approveTravel(travelNo);
  }

  /* ------------------------------ indirect spend --------------------------- */

  @Post("indirect-expenses")
  @RequirePermission("expenditure.indirect.create")
  async createIndirect(@Body() body: unknown) {
    return this.indirect.create(parse(indirectSchema, body));
  }

  @Post("indirect-expenses/:expNo/submit")
  @RequirePermission("expenditure.indirect.create")
  async submitIndirect(@Param("expNo") expNo: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const input = parse(z.object({ callerCanOverride: z.boolean().optional(), overrideReason: z.string().optional() }), body ?? {});
    return this.indirect.submit(expNo, { ...input, idempotencyKey: requireKey(key, "indirect-expense submission") });
  }

  @Post("indirect-expenses/:expNo/approve")
  @RequirePermission("expenditure.indirect.approve")
  async approveIndirect(@Param("expNo") expNo: string, @Query("at") at?: string) {
    return this.indirect.approve(expNo, { at });
  }

  @Get("indirect-expenses")
  @RequirePermission("expenditure.claim.read")
  async listIndirect() {
    return this.indirect.list();
  }

  @Get("indirect-expenses/:expNo")
  @RequirePermission("expenditure.claim.read")
  async indirectDetail(@Param("expNo") expNo: string) {
    return this.indirect.detail(expNo);
  }

  /* --------------------------------- postings ------------------------------ */

  @Get("postings")
  @RequirePermission("expenditure.budget.read")
  async postings_(@Query("status") status?: string) {
    return this.postings.list(status);
  }

  /** Accounts calls this back with the voucher reference; the ack is what flips the budget
   *  bucket from committed to actual. */
  @Post("postings/:key/ack")
  @RequirePermission("expenditure.posting.manage")
  async ack(@Param("key") key: string, @Body() body: unknown) {
    const input = parse(z.object({ voucherRef: z.string().min(1) }), body);
    return this.postings.acknowledge(key, input.voucherRef);
  }

  @Post("postings/:key/retry")
  @RequirePermission("expenditure.posting.manage")
  async retry(@Param("key") key: string, @Headers("idempotency-key") retryKey?: string) {
    requireKey(retryKey, "posting retry");
    return this.postings.retry(key);
  }

  /* --------------------------------- reports ------------------------------- */

  @Get("reports/tds-register")
  @RequirePermission("expenditure.budget.read")
  async tdsRegister(@Query("fiscalYear") fiscalYear: string) {
    return this.indirect.tdsRegister(fiscalYear ?? "2627");
  }

  @Get("reports/itc-register")
  @RequirePermission("expenditure.budget.read")
  async itcRegister() {
    return this.indirect.itcRegister();
  }
}
