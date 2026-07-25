import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  advanceBalance,
  currentTenant,
  evaluateClaimPolicy,
  eventName,
  fiscalYearOf,
  newId,
  planSettlement,
  resolveItc,
  type AdvanceState,
  type ItcEligibility,
  type PolicyFlag,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { ExpNumberingService } from "./exp-numbering.service.js";
import { BudgetService } from "./budget.service.js";
import { PostingService } from "./posting.service.js";

const {
  expenseClaim,
  expenseClaimLine,
  expenseHead,
  cashAdvance,
  advanceSettlement,
  expAttachment,
  outboxEvent,
} = schema;

export interface ClaimLineInput {
  expenseHeadCode: string;
  expenseDate: string;
  amount: number;
  gstAmount?: number;
  merchant?: string;
  description?: string;
  /** The GSTIN printed on the invoice as the recipient. Absent on a B2C cash bill. */
  invoiceRecipientGstin?: string | null;
  reimbursableType?: "bill_backed" | "allowance";
  attachmentId?: string;
  source?: "manual" | "ai_assisted";
  aiConfidence?: Record<string, number>;
  aiUserEdits?: Record<string, { extracted: unknown; final: unknown }>;
  perDiemCeiling?: number | null;
}

export interface CreateClaimInput {
  employeeRef: string;
  costCentreRef: string;
  claimDate: string;
  advanceNo?: string;
  lines: ClaimLineInput[];
}

/**
 * EXPENSE CLAIMS.
 *
 * Submission is ONE transaction and the order inside it is the design:
 *
 *     policy flags → budget check-and-reserve (row-locked) → status change → outbox event
 *
 * If the budget refuses, nothing was written — no half-submitted claim, no orphan
 * reservation, no event announcing something that did not happen. If it passes, the money
 * is reserved and the document exists together or not at all.
 *
 * Two decisions worth stating:
 *
 *  - **ITC is resolved here, per line, from the head and the invoice.** A receipt-extraction
 *    model may suggest which head a line belongs to; it never sets eligibility. The AI reads
 *    paper, the code decides money.
 *  - **Policy findings are flags, not refusals** — except a future-dated expense, which is
 *    not a judgement call. An approver can see context the software cannot, and a system
 *    that refuses a missing receipt teaches people to stop claiming rather than to attach
 *    receipts.
 */
@Injectable()
export class ClaimService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly numbering: ExpNumberingService,
    private readonly budgets: BudgetService,
    private readonly postings: PostingService,
  ) {}

  /* --------------------------------- create -------------------------------- */

  async create(input: CreateClaimInput): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const id = newId();
      const claimNo = await this.numbering.next(tx, "claim", fiscalYearOf(input.claimDate));

      const [advance] = input.advanceNo
        ? await tx.select().from(cashAdvance).where(eq(cashAdvance.advanceNo, input.advanceNo)).limit(1)
        : [null];

      await tx.insert(expenseClaim).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        claimNo,
        employeeRef: input.employeeRef,
        claimDate: input.claimDate,
        costCentreRef: input.costCentreRef,
        advanceId: advance?.id ?? null,
        status: "draft",
      });

      let lineNo = 0;
      for (const l of input.lines) {
        lineNo += 1;
        await this.insertLine(tx, id, lineNo, l, input.costCentreRef);
      }
      await this.recomputeTotals(tx, id);
      await this.audit.appendInTx(tx, {
        action: "expenditure.claim.created",
        entityType: "expense_claim",
        entityId: id,
        data: { claimNo, employeeRef: input.employeeRef, lines: lineNo },
      });
      return this.viewInTx(tx, id);
    });
  }

  /** Add a line to a draft — the path a confirmed receipt extraction lands on. */
  async addLine(claimNo: string, line: ClaimLineInput): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const c = await this.byNoInTx(tx, claimNo);
      if (!["draft", "returned"].includes(c.status)) {
        throw new AppError("CLAIM_NOT_EDITABLE", 422, `${claimNo} is ${c.status} and can no longer be edited.`);
      }
      const existing = await tx.select().from(expenseClaimLine).where(eq(expenseClaimLine.claimId, c.id));
      await this.insertLine(tx, c.id, existing.length + 1, line, c.costCentreRef);
      await this.recomputeTotals(tx, c.id);
      return this.viewInTx(tx, c.id);
    });
  }

  /* --------------------------------- submit -------------------------------- */

  async submit(
    claimNo: string,
    opts: { idempotencyKey: string; submittedOn?: string; callerCanOverride?: boolean; overrideReason?: string } = { idempotencyKey: "" },
  ): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    if (!opts.idempotencyKey) {
      throw Errors.validation([{ field: "Idempotency-Key", message: "required on claim submission" }]);
    }
    const keyHash = createHash("sha256").update(opts.idempotencyKey).digest("hex");

    return withTenant(async (tx) => {
      const c = await this.byNoInTx(tx, claimNo);
      // A replayed submit returns the original result rather than reserving twice.
      if (c.idempotencyKeyHash === keyHash) return this.viewInTx(tx, c.id);
      if (!["draft", "returned"].includes(c.status)) {
        throw new AppError("CLAIM_NOT_SUBMITTABLE", 422, `${claimNo} is ${c.status}.`);
      }

      const submittedOn = opts.submittedOn ?? new Date().toISOString().slice(0, 10);
      const lines = await tx.select().from(expenseClaimLine).where(eq(expenseClaimLine.claimId, c.id)).orderBy(expenseClaimLine.lineNo);
      if (lines.length === 0) throw Errors.validation([{ field: "lines", message: "a claim needs at least one line" }]);

      // 1. Policy.
      const heads = await this.headMap(tx);
      const flags: PolicyFlag[] = evaluateClaimPolicy({
        claimDate: c.claimDate,
        submittedOn,
        lines: lines.map((l) => {
          const head = [...heads.values()].find((h) => h.id === l.expenseHeadId);
          return {
            lineNo: l.lineNo,
            expenseHeadCode: head?.code ?? "?",
            expenseDate: l.expenseDate,
            amount: Number(l.amount),
            hasReceipt: l.attachmentId != null,
            receiptThreshold: Number(head?.receiptThreshold ?? 0),
            reimbursableType: l.reimbursableType as "bill_backed" | "allowance",
            perDiemCeiling: null,
          };
        }),
      });
      const blocking = flags.filter((f) => f.severity === "block");
      if (blocking.length > 0) {
        throw new AppError("CLAIM_POLICY_BLOCK", 422, blocking.map((f) => f.message).join(" "), blocking.map((f) => ({ field: `line ${f.lineNo}`, message: f.message })));
      }

      // 2. Budget — one reservation per head, row-locked, in this same transaction.
      const byHead = new Map<string, number>();
      for (const l of lines) {
        const head = [...heads.values()].find((h) => h.id === l.expenseHeadId);
        const code = head?.code ?? "?";
        byHead.set(code, Math.round(((byHead.get(code) ?? 0) + Number(l.amount)) * 100) / 100);
      }
      const budgetResults: Record<string, unknown>[] = [];
      for (const [headCode, amount] of byHead) {
        const r = await this.budgets.checkAndReserveInTx(tx, {
          costCentreRef: c.costCentreRef,
          expenseHeadCode: headCode,
          onDate: c.claimDate,
          amount,
          docType: "expense_claim",
          docRef: claimNo,
          idempotencyKey: `claim:${claimNo}:${headCode}`,
          callerCanOverride: opts.callerCanOverride,
          overrideReason: opts.overrideReason,
        });
        budgetResults.push({ expenseHeadCode: headCode, decision: r.decision, available: r.availability.available, shortfall: r.shortfall, reason: r.reason });
      }

      // 3. The state change and the announcement, in the same transaction as the money.
      const now = new Date();
      await tx
        .update(expenseClaim)
        .set({
          status: "in_approval",
          submittedAt: now,
          policyFlags: flags as unknown as object,
          budgetCheckResult: budgetResults as unknown as object,
          idempotencyKeyHash: keyHash,
          updatedBy: actorId,
          updatedAt: now,
        })
        .where(eq(expenseClaim.id, c.id));

      await this.audit.appendInTx(tx, {
        action: "expenditure.claim.submitted",
        entityType: "expense_claim",
        entityId: c.id,
        data: { claimNo, total: Number(c.totalClaimed), flags: flags.length, budget: budgetResults },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("expenditure", "claim", "submitted"),
        payload: { claimNo, employeeRef: c.employeeRef, costCentreRef: c.costCentreRef, total: Number(c.totalClaimed), flags: flags.length },
        createdAt: now,
      });

      return { ...(await this.viewInTx(tx, c.id)), policyFlags: flags, budget: budgetResults };
    });
  }

  /* -------------------------------- approve -------------------------------- */

  /**
   * Final approval. Three things happen together or none of them do: the reservation flips
   * from `in_approval` to `committed`, the advance (if any) is settled, and the journal
   * payload is written to `posting_instruction` for Accounts to post.
   */
  async approve(claimNo: string, opts: { at?: string } = {}): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const c = await this.byNoInTx(tx, claimNo);
      if (c.status !== "in_approval") {
        throw new AppError("CLAIM_NOT_IN_APPROVAL", 422, `${claimNo} is ${c.status}.`);
      }
      const at = opts.at ? new Date(opts.at) : new Date();

      await this.budgets.flipInTx(tx, {
        docType: "expense_claim",
        docRef: claimNo,
        from: "in_approval",
        to: "committed",
        idempotencyKey: `claim:${claimNo}:commit`,
      });

      // Settle the advance, if the claim carries one.
      let settlement: Record<string, unknown> | null = null;
      if (c.advanceId) {
        const [adv] = await tx.select().from(cashAdvance).where(eq(cashAdvance.id, c.advanceId)).limit(1);
        if (adv) {
          const state: AdvanceState = {
            advanceNo: adv.advanceNo,
            amount: Number(adv.amount),
            paidAmount: Number(adv.paidAmount),
            settledAmount: Number(adv.settledAmount),
            refundedAmount: Number(adv.refundedAmount),
            settleBy: adv.settleBy,
            status: adv.status as AdvanceState["status"],
          };
          const plan = planSettlement(state, Number(c.totalClaimed));
          await tx.insert(advanceSettlement).values({
            id: newId(),
            tenantId,
            createdBy: actorId,
            updatedBy: actorId,
            advanceId: adv.id,
            claimId: c.id,
            settlementType: "claim_adjust",
            amount: plan.adjustedAgainstClaim.toFixed(2),
            settledAt: at,
            note: plan.explanation,
          });
          await tx
            .update(cashAdvance)
            .set({
              settledAmount: (Number(adv.settledAmount) + plan.adjustedAgainstClaim).toFixed(2),
              status: plan.newStatus,
              updatedBy: actorId,
              updatedAt: at,
            })
            .where(eq(cashAdvance.id, adv.id));
          await tx
            .update(expenseClaim)
            .set({ advanceAdjusted: plan.adjustedAgainstClaim.toFixed(2), updatedBy: actorId, updatedAt: at })
            .where(eq(expenseClaim.id, c.id));
          settlement = { ...plan, advanceNo: adv.advanceNo, balanceAfter: advanceBalance({ ...state, settledAmount: state.settledAmount + plan.adjustedAgainstClaim }) };
        }
      }

      await tx.update(expenseClaim).set({ status: "approved", approvedAt: at, updatedBy: actorId, updatedAt: at }).where(eq(expenseClaim.id, c.id));

      // The journal payload — written here, posted by Accounts. Expenditure never writes GL.
      const posting = await this.postings.requestInTx(tx, {
        docType: "expense_claim",
        docRef: claimNo,
        payload: await this.journalFor(tx, c.id),
        idempotencyKey: `exp:expense_claim:${c.id}:v1`,
      });

      await this.audit.appendInTx(tx, {
        action: "expenditure.claim.approved",
        entityType: "expense_claim",
        entityId: c.id,
        data: { claimNo, total: Number(c.totalClaimed), settlement },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("expenditure", "claim", "approved"),
        payload: { claimNo, total: Number(c.totalClaimed), postingRef: posting.idempotencyKey },
        createdAt: at,
      });

      return { ...(await this.viewInTx(tx, c.id)), settlement, posting };
    });
  }

  async reject(claimNo: string, reason: string): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const c = await this.byNoInTx(tx, claimNo);
      // The reservation is given back as a signed negative row — never an edit, never a
      // delete. Six months later the ledger still shows that it was held and released.
      await this.budgets.reverseInTx(tx, {
        docType: "expense_claim",
        docRef: claimNo,
        idempotencyKey: `claim:${claimNo}:reject`,
        reason: `claim rejected: ${reason}`,
      });
      await tx.update(expenseClaim).set({ status: "rejected", updatedBy: actorId, updatedAt: new Date() }).where(eq(expenseClaim.id, c.id));
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("expenditure", "claim", "rejected"),
        payload: { claimNo, reason },
        createdAt: new Date(),
      });
      return this.viewInTx(tx, c.id);
    });
  }

  /* --------------------------------- reads --------------------------------- */

  async detail(claimNo: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const c = await this.byNoInTx(tx, claimNo);
      return this.viewInTx(tx, c.id);
    });
  }

  async list(filter: { employeeRef?: string; status?: string } = {}): Promise<Array<Record<string, unknown>>> {
    return withTenant(async (tx) => {
      const clauses = [];
      if (filter.employeeRef) clauses.push(eq(expenseClaim.employeeRef, filter.employeeRef));
      if (filter.status) clauses.push(eq(expenseClaim.status, filter.status));
      const rows = await tx
        .select({ id: expenseClaim.id })
        .from(expenseClaim)
        .where(clauses.length ? and(...clauses) : undefined)
        .orderBy(expenseClaim.claimNo);
      const out: Array<Record<string, unknown>> = [];
      for (const r of rows) out.push(await this.viewInTx(tx, r.id));
      return out;
    });
  }

  /* -------------------------------- helpers -------------------------------- */

  async byNoInTx(tx: Tx, claimNo: string) {
    const [c] = await tx.select().from(expenseClaim).where(eq(expenseClaim.claimNo, claimNo)).limit(1);
    if (!c) throw Errors.notFound(`claim ${claimNo}`);
    return c;
  }

  private async headMap(tx: Tx) {
    const rows = await tx.select().from(expenseHead);
    return new Map(rows.map((h) => [h.code, h]));
  }

  private async insertLine(tx: Tx, claimId: string, lineNo: number, l: ClaimLineInput, claimCostCentre: string): Promise<void> {
    const { tenantId, actorId } = currentTenant();
    const heads = await this.headMap(tx);
    const head = heads.get(l.expenseHeadCode);
    if (!head) throw Errors.notFound(`expense head ${l.expenseHeadCode}`);

    // The ITC decision. Note the company GSTIN is the Pune registration for this prototype;
    // in production it is resolved from the cost centre's place of supply.
    const itc = resolveItc({
      headDefault: head.itcEligibility as ItcEligibility,
      invoiceRecipientGstin: l.invoiceRecipientGstin ?? null,
      companyGstin: COMPANY_GSTIN,
      gstAmount: l.gstAmount ?? 0,
    });

    await tx.insert(expenseClaimLine).values({
      id: newId(),
      tenantId,
      createdBy: actorId,
      updatedBy: actorId,
      claimId,
      lineNo,
      expenseHeadId: head.id,
      expenseDate: l.expenseDate,
      merchant: l.merchant ?? null,
      description: l.description ?? null,
      amount: l.amount.toFixed(2),
      gstAmount: (l.gstAmount ?? 0).toFixed(2),
      itcAmount: itc.itcAmount.toFixed(2),
      itcEligibility: itc.eligibility,
      itcReason: itc.reason,
      reimbursableType: l.reimbursableType ?? "bill_backed",
      attachmentId: l.attachmentId ?? null,
      costCentreRef: claimCostCentre,
      source: l.source ?? "manual",
      aiConfidence: (l.aiConfidence ?? null) as unknown as object,
      aiUserEdits: (l.aiUserEdits ?? null) as unknown as object,
    });

    if (l.attachmentId) {
      await tx
        .update(expAttachment)
        .set({ extractionStatus: "confirmed", linkedDocType: "expense_claim", linkedDocRef: claimId, updatedBy: actorId })
        .where(eq(expAttachment.id, l.attachmentId));
    }
  }

  private async recomputeTotals(tx: Tx, claimId: string): Promise<void> {
    const { actorId } = currentTenant();
    const lines = await tx.select().from(expenseClaimLine).where(eq(expenseClaimLine.claimId, claimId));
    const r2 = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);
    await tx
      .update(expenseClaim)
      .set({
        totalClaimed: r2(lines.reduce((a, l) => a + Number(l.amount), 0)),
        totalTax: r2(lines.reduce((a, l) => a + Number(l.gstAmount), 0)),
        totalItcEligible: r2(lines.reduce((a, l) => a + Number(l.itcAmount), 0)),
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(expenseClaim.id, claimId));
  }

  /**
   * The journal payload. Expense debits per head, the recoverable GST debited to the ITC
   * account, the advance adjusted, and the employee credited with what is actually payable.
   * Blocked GST is NOT split out — it is part of the expense, which is exactly what being
   * blocked means.
   */
  private async journalFor(tx: Tx, claimId: string): Promise<Record<string, unknown>> {
    const [c] = await tx.select().from(expenseClaim).where(eq(expenseClaim.id, claimId)).limit(1);
    const lines = await tx.select().from(expenseClaimLine).where(eq(expenseClaimLine.claimId, claimId)).orderBy(expenseClaimLine.lineNo);
    const heads = await this.headMap(tx);
    const byCode = new Map<string, string>([...heads.values()].map((h) => [h.id, h.code]));

    const debits: Array<{ account: string; amount: number; note: string }> = [];
    for (const l of lines) {
      const gross = Number(l.amount);
      const recoverable = Number(l.itcAmount);
      debits.push({
        account: byCode.get(l.expenseHeadId) ?? "EH-UNKNOWN",
        amount: Math.round((gross - recoverable) * 100) / 100,
        note: recoverable > 0 ? "net of recoverable GST" : `GST not recoverable — ${l.itcReason ?? "blocked"}`,
      });
      if (recoverable > 0) debits.push({ account: "GST-ITC", amount: recoverable, note: `input credit on line ${l.lineNo}` });
    }
    return {
      docType: "expense_claim",
      docRef: c!.claimNo,
      date: c!.claimDate,
      costCentreRef: c!.costCentreRef,
      debits,
      credits: [
        ...(Number(c!.advanceAdjusted) > 0
          ? [{ account: "EMPLOYEE-ADVANCE", amount: Number(c!.advanceAdjusted), note: "advance adjusted against this claim" }]
          : []),
        { account: "EMPLOYEE-PAYABLE", amount: Number(c!.netReimbursable ?? 0), note: "net reimbursable" },
      ],
    };
  }

  private async viewInTx(tx: Tx, id: string): Promise<Record<string, unknown>> {
    const [c] = await tx.select().from(expenseClaim).where(eq(expenseClaim.id, id)).limit(1);
    const lines = await tx.select().from(expenseClaimLine).where(eq(expenseClaimLine.claimId, id)).orderBy(expenseClaimLine.lineNo);
    const heads = await this.headMap(tx);
    const codeById = new Map([...heads.values()].map((h) => [h.id, h.code]));
    return {
      claimNo: c!.claimNo,
      status: c!.status,
      employeeRef: c!.employeeRef,
      costCentreRef: c!.costCentreRef,
      claimDate: c!.claimDate,
      totalClaimed: Number(c!.totalClaimed),
      totalTax: Number(c!.totalTax),
      totalItcEligible: Number(c!.totalItcEligible),
      advanceAdjusted: Number(c!.advanceAdjusted),
      netReimbursable: Number(c!.netReimbursable ?? 0),
      policyFlags: c!.policyFlags,
      budgetCheckResult: c!.budgetCheckResult,
      lines: lines.map((l) => ({
        lineNo: l.lineNo,
        head: codeById.get(l.expenseHeadId),
        expenseDate: l.expenseDate,
        merchant: l.merchant,
        amount: Number(l.amount),
        gstAmount: Number(l.gstAmount),
        itcAmount: Number(l.itcAmount),
        itcEligibility: l.itcEligibility,
        itcReason: l.itcReason,
        source: l.source,
      })),
    };
  }
}

/** Trishul's Pune-Chakan registration — the §7 demo universe's primary GSTIN. In production
 *  this is resolved from the cost centre's place of supply, which is why it is one
 *  constant in one place rather than a literal scattered through the ITC calls. */
export const COMPANY_GSTIN = "27AABCT1234F1Z5";
