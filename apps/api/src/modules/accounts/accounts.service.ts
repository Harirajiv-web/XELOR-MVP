import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, lte, gte, sql } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  newId,
  currentTenant,
  eventName,
  buildReceiptJournal,
  buildSalesInvoiceJournal,
  naturalBalance,
  reverseLines,
  trialBalanceTotals,
  validateJournal,
  AppError,
  Errors,
  type AccountType,
  type JournalLineInput,
  type TrialBalanceRow,
} from "@ind-core/platform";
import { runIdempotent, fingerprint } from "../../common/idempotency.js";
import { AuditLogService } from "../../common/audit-log.service.js";
import type {
  AccountsPoster,
  CustomerOutstanding,
  PostJournalRequest,
  PostJournalResult,
  RaiseSalesInvoiceInput,
  RaiseSalesInvoiceResult,
} from "../../ports/accounts.port.js";

const {
  glAccount,
  accPeriod,
  journalVoucher,
  journalLine,
  arOpenItem,
  settlement,
  settlementAllocation,
  outboxEvent,
} = schema;

/** The accounts a sales invoice touches. Config in a real tenant; fixed for the demo. */
const INVOICE_ACCOUNTS = {
  receivable: "1310",
  revenue: "4010",
  outputCgst: "2311",
  outputSgst: "2312",
  outputIgst: "2313",
};
const ROUND_OFF_ACCOUNT = "4910";
const DEFAULT_BANK_ACCOUNT = "1210";

export interface PostJournalInput {
  voucherType?: string;
  postingDate?: string;
  narration?: string;
  postingMode?: "sync" | "async" | "manual" | "system";
  sourceModule?: string;
  sourceDocType?: string;
  sourceDocId?: string;
  lines: JournalLineInput[];
}

export interface VoucherView {
  id: string;
  voucherNo: string;
  voucherType: string;
  postingDate: string;
  status: string;
  narration: string | null;
  totalDebit: string;
  totalCredit: string;
  lines: Array<{
    lineNo: number;
    accountCode: string;
    debit: string;
    credit: string;
    customerRef: string | null;
    taxHead: string | null;
    taxDirection: string | null;
    memo: string | null;
  }>;
}

const m2 = (n: number): string => n.toFixed(2);
const numOf = (v: string | null | undefined): number => (v == null ? 0 : Number(v));
const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * ACCOUNTS (RASP, Module 08) — the general ledger, the AR subledger, and the credit
 * exposure every other module asks about.
 *
 * What this service checks, and nothing more (ACCOUNTS §1.3):
 *   1. the journal BALANCES (and the database asserts it again at COMMIT);
 *   2. the period is OPEN;
 *   3. every account EXISTS and is POSTABLE;
 *   4. the instruction is NOT A DUPLICATE.
 * It never recomputes a sibling's arithmetic. If SMBD says the invoice is ₹1,47,500, the
 * ledger says ₹1,47,500 — and if that is wrong, the fix is a reversal, not an edit.
 */
@Injectable()
export class AccountsService implements AccountsPoster {
  constructor(private readonly audit: AuditLogService) {}

  /* ------------------------------ posting core ---------------------------- */

  /**
   * The one write path into the ledger. Everything else in this service funnels through
   * it, so the four checks above cannot be skipped by a new caller.
   */
  private async postVoucherInTx(
    tx: Tx,
    input: PostJournalInput & { idempotencyKey: string },
  ): Promise<{ voucherId: string; voucherNo: string; totalDebit: number }> {
    const { tenantId, actorId } = currentTenant();
    const postingDate = input.postingDate ?? new Date().toISOString().slice(0, 10);

    // (4) duplicate? The unique index is the backstop; this makes a replay return the
    // ORIGINAL voucher instead of raising, which is what "idempotent" has to mean here.
    const existing = await tx
      .select()
      .from(journalVoucher)
      .where(eq(journalVoucher.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing[0]) {
      return {
        voucherId: existing[0].id,
        voucherNo: existing[0].voucherNo,
        totalDebit: numOf(existing[0].totalDebit),
      };
    }

    // (1) balanced?
    const v = validateJournal(input.lines);
    if (!v.ok) throw new AppError("UNBALANCED_JOURNAL", 422, v.reason ?? "journal is not valid");

    // (2) period open?
    const periods = await tx
      .select()
      .from(accPeriod)
      .where(and(lte(accPeriod.startsOn, postingDate), gte(accPeriod.endsOn, postingDate)))
      .limit(1);
    const period = periods[0];
    if (!period) {
      throw new AppError("NO_ACCOUNTING_PERIOD", 422, `No accounting period covers ${postingDate}.`);
    }
    if (period.status !== "open") {
      throw new AppError(
        "PERIOD_CLOSED",
        409,
        `Accounting period ${period.code} is closed; post to an open period or reopen it.`,
      );
    }

    // (3) accounts exist and are postable?
    const codes = [...new Set(input.lines.map((l) => l.accountCode))];
    const accounts = await tx.select().from(glAccount).where(inArray(glAccount.code, codes));
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    for (const code of codes) {
      const a = byCode.get(code);
      if (!a) throw new AppError("ACCOUNT_NOT_FOUND", 422, `GL account '${code}' does not exist.`);
      if (!a.isPostable) {
        throw new AppError("ACCOUNT_NOT_POSTABLE", 422, `GL account '${code}' is a header and cannot be posted to.`);
      }
    }

    const voucherId = newId();
    const voucherNo = `${(input.voucherType ?? "journal") === "ar_invoice" ? "INV" : "JV"}-${(voucherId.split("-").pop() ?? voucherId).toUpperCase()}`;
    await tx.insert(journalVoucher).values({
      id: voucherId,
      tenantId,
      createdBy: actorId,
      updatedBy: actorId,
      voucherNo,
      voucherType: input.voucherType ?? "journal",
      postingDate,
      periodId: period.id,
      narration: input.narration ?? null,
      status: "posted",
      postingMode: input.postingMode ?? "manual",
      sourceModule: input.sourceModule ?? null,
      sourceDocType: input.sourceDocType ?? null,
      sourceDocId: input.sourceDocId ?? null,
      idempotencyKey: input.idempotencyKey,
      totalDebit: m2(v.totalDebit),
      totalCredit: m2(v.totalCredit),
    });

    for (const [i, l] of input.lines.entries()) {
      await tx.insert(journalLine).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        voucherId,
        lineNo: i + 1,
        accountCode: l.accountCode,
        debit: m2(l.debit ?? 0),
        credit: m2(l.credit ?? 0),
        customerRef: l.customerRef ?? null,
        vendorRef: l.vendorRef ?? null,
        taxHead: l.taxHead ?? null,
        taxDirection: l.taxDirection ?? null,
        hsnSac: l.hsnSac ?? null,
        memo: l.memo ?? null,
      });
    }

    await this.audit.appendInTx(tx, {
      action: "accounts.voucher.posted",
      entityType: "journal_voucher",
      entityId: voucherId,
      data: {
        voucherNo,
        voucherType: input.voucherType ?? "journal",
        totalDebit: m2(v.totalDebit),
        source: input.sourceDocId ?? null,
      },
    });

    return { voucherId, voucherNo, totalDebit: v.totalDebit };
  }

  /** Post a manual/system journal standalone. */
  async postJournal(input: PostJournalInput, idempotencyKey: string): Promise<VoucherView> {
    const result = await runIdempotent(idempotencyKey, fingerprint({ ...input, op: "post-journal" }), async () => ({
      status: 201,
      body: await withTenant(async (tx) => {
        const { voucherId } = await this.postVoucherInTx(tx, { ...input, idempotencyKey });
        return this.viewInTx(tx, voucherId);
      }),
    }));
    return result.body;
  }

  /**
   * Contract with any module that has already valued a set of postings — HRM's payroll
   * journal (HR-51) is the first. Runs inside the caller's transaction and through the
   * same `postVoucherInTx` single write path, so the four checks cannot be skipped and a
   * replay returns the ORIGINAL voucher rather than double-posting.
   */
  async postJournalInTx(tx: Tx, input: PostJournalRequest): Promise<PostJournalResult> {
    return this.postVoucherInTx(tx, {
      voucherType: input.voucherType,
      postingDate: input.postingDate,
      narration: input.narration,
      postingMode: "sync",
      sourceModule: input.sourceModule,
      sourceDocType: input.sourceDocType,
      sourceDocId: input.sourceDocId,
      idempotencyKey: `${input.sourceModule}:${input.sourceDocType}:${input.sourceDocId}`,
      lines: input.lines,
    });
  }

  /* --------------------------- the sales invoice -------------------------- */

  /**
   * Contract #6 with SMBD. The amounts arrive already valued; this method decides only
   * which accounts they land in and that the resulting voucher balances.
   */
  async raiseSalesInvoiceInTx(tx: Tx, input: RaiseSalesInvoiceInput): Promise<RaiseSalesInvoiceResult> {
    const { tenantId, actorId } = currentTenant();
    const invoiceDate = input.invoiceDate ?? new Date().toISOString().slice(0, 10);
    const a = input.amounts;

    // One invoice per source document, forever: a retried dispatch must not double-bill.
    const prior = await tx
      .select()
      .from(arOpenItem)
      .where(and(eq(arOpenItem.dispatchRef, input.dispatchRef ?? ""), eq(arOpenItem.customerRef, input.customerId)))
      .limit(1);
    if (prior[0] && input.dispatchRef) {
      const v = (await tx.select().from(journalVoucher).where(eq(journalVoucher.id, prior[0].voucherId)).limit(1))[0]!;
      return {
        invoiceNo: prior[0].invoiceNo,
        voucherNo: v.voucherNo,
        voucherId: v.id,
        grossReceivable: numOf(prior[0].grossReceivable),
        dueDate: prior[0].dueDate,
      };
    }

    const lines = buildSalesInvoiceJournal({
      amounts: a,
      accounts: INVOICE_ACCOUNTS,
      customerRef: input.customerId,
      invoiceNo: input.sourceDocId,
      roundOffAccount: ROUND_OFF_ACCOUNT,
    });

    const posted = await this.postVoucherInTx(tx, {
      voucherType: "ar_invoice",
      postingDate: invoiceDate,
      narration: `Sales invoice against ${input.soRef ?? input.sourceDocId}`,
      postingMode: "sync",
      sourceModule: "smbd",
      sourceDocType: input.sourceDocType,
      sourceDocId: input.sourceDocId,
      idempotencyKey: `ar_invoice:${input.sourceDocType}:${input.sourceDocId}`,
      lines,
    });

    const invoiceNo = posted.voucherNo;
    const dueDate = addDays(invoiceDate, input.paymentTermsDays ?? 30);
    await tx.insert(arOpenItem).values({
      id: newId(),
      tenantId,
      createdBy: actorId,
      updatedBy: actorId,
      invoiceNo,
      invoiceDate,
      customerRef: input.customerId,
      customerNameCache: input.customerName ?? null,
      soRef: input.soRef ?? null,
      dispatchRef: input.dispatchRef ?? null,
      voucherId: posted.voucherId,
      taxableValue: m2(a.taxableValue),
      taxCgst: m2(a.cgst),
      taxSgst: m2(a.sgst),
      taxIgst: m2(a.igst),
      grossReceivable: m2(a.grossReceivable),
      dueDate,
      status: "open",
    });

    await tx.insert(outboxEvent).values({
      id: newId(),
      tenantId,
      name: eventName("accounts", "invoice", "raised"),
      payload: {
        invoiceNo,
        voucherNo: posted.voucherNo,
        customerId: input.customerId,
        grossReceivable: m2(a.grossReceivable),
      },
      createdAt: new Date(),
    });

    return {
      invoiceNo,
      voucherNo: posted.voucherNo,
      voucherId: posted.voucherId,
      grossReceivable: a.grossReceivable,
      dueDate,
    };
  }

  /* ------------------------------- receipts ------------------------------- */

  /**
   * Money in. Allocates against the customer's oldest open invoices first, posts
   * Dr Bank / Cr Trade Receivables, and lets Inventory-style GENERATED arithmetic keep the
   * outstanding honest — `outstanding` is a generated column, so it cannot drift.
   */
  async recordReceipt(
    input: { customerId: string; amount: number; reference?: string; bankAccountCode?: string; receiptDate?: string },
    idempotencyKey: string,
  ): Promise<{ settlementNo: string; voucherNo: string; allocated: Array<{ invoiceNo: string; amount: number }>; unallocated: number }> {
    const result = await runIdempotent(idempotencyKey, fingerprint({ ...input, op: "receipt" }), async () => ({
      status: 201,
      body: await this.doRecordReceipt(input, idempotencyKey),
    }));
    return result.body;
  }

  private async doRecordReceipt(
    input: { customerId: string; amount: number; reference?: string; bankAccountCode?: string; receiptDate?: string },
    idempotencyKey: string,
  ): Promise<{ settlementNo: string; voucherNo: string; allocated: Array<{ invoiceNo: string; amount: number }>; unallocated: number }> {
    if (input.amount <= 0) throw Errors.validation([{ field: "amount", message: "must be > 0" }]);
    const { tenantId, actorId } = currentTenant();
    const receiptDate = input.receiptDate ?? new Date().toISOString().slice(0, 10);
    const bank = input.bankAccountCode ?? DEFAULT_BANK_ACCOUNT;

    return withTenant(async (tx) => {
      const open = await tx
        .select()
        .from(arOpenItem)
        .where(and(eq(arOpenItem.customerRef, input.customerId), inArray(arOpenItem.status, ["open", "partly_paid"])))
        .orderBy(asc(arOpenItem.dueDate), asc(arOpenItem.invoiceDate));

      const posted = await this.postVoucherInTx(tx, {
        voucherType: "receipt",
        postingDate: receiptDate,
        narration: `Receipt ${input.reference ?? ""} from customer`.trim(),
        postingMode: "manual",
        idempotencyKey: `receipt:${idempotencyKey}`,
        lines: buildReceiptJournal({
          amount: input.amount,
          bankAccount: bank,
          receivableAccount: INVOICE_ACCOUNTS.receivable,
          customerRef: input.customerId,
          reference: input.reference ?? "receipt",
        }),
      });

      const settlementId = newId();
      const settlementNo = `RCPT-${(settlementId.split("-").pop() ?? settlementId).toUpperCase()}`;
      await tx.insert(settlement).values({
        id: settlementId,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        settlementNo,
        settlementType: "receipt",
        settlementDate: receiptDate,
        partyRef: input.customerId,
        amount: m2(input.amount),
        bankAccountCode: bank,
        reference: input.reference ?? null,
        voucherId: posted.voucherId,
      });

      // Oldest-first allocation. Anything left over stays on account, visible as
      // `unallocated` rather than silently vanishing.
      let left = input.amount;
      const allocated: Array<{ invoiceNo: string; amount: number }> = [];
      for (const inv of open) {
        if (left <= 0.005) break;
        const due = numOf(inv.grossReceivable) - numOf(inv.receivedAmount);
        if (due <= 0.005) continue;
        const apply = Math.min(due, left);
        await tx.insert(settlementAllocation).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          settlementId,
          arOpenItemId: inv.id,
          amount: m2(apply),
        });
        const newReceived = numOf(inv.receivedAmount) + apply;
        await tx
          .update(arOpenItem)
          .set({
            receivedAmount: m2(newReceived),
            status: newReceived + 0.005 >= numOf(inv.grossReceivable) ? "settled" : "partly_paid",
            updatedBy: actorId,
            updatedAt: new Date(),
          })
          .where(eq(arOpenItem.id, inv.id));
        allocated.push({ invoiceNo: inv.invoiceNo, amount: apply });
        left -= apply;
      }

      await this.audit.appendInTx(tx, {
        action: "accounts.receipt.recorded",
        entityType: "settlement",
        entityId: settlementId,
        data: { settlementNo, amount: m2(input.amount), allocations: allocated.length },
      });
      // SMBD's credit gate listens for this to refresh exposure (contract #6).
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("accounts", "payment", "received"),
        payload: { settlementNo, customerId: input.customerId, amount: m2(input.amount) },
        createdAt: new Date(),
      });

      return { settlementNo, voucherNo: posted.voucherNo, allocated, unallocated: Math.max(0, Math.round(left * 100) / 100) };
    });
  }

  /* ------------------------------ the reversal ---------------------------- */

  /** Correction is a reversal voucher, never an edit — the database enforces it too. */
  async reverseVoucher(voucherId: string, reason: string, idempotencyKey: string): Promise<VoucherView> {
    const result = await runIdempotent(
      idempotencyKey,
      fingerprint({ voucherId, reason, op: "reverse" }),
      async () => ({ status: 201, body: await this.doReverse(voucherId, reason, idempotencyKey) }),
    );
    return result.body;
  }

  private async doReverse(voucherId: string, reason: string, idempotencyKey: string): Promise<VoucherView> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const original = (await tx.select().from(journalVoucher).where(eq(journalVoucher.id, voucherId)).limit(1))[0];
      if (!original) throw new AppError("VOUCHER_NOT_FOUND", 404, `No voucher ${voucherId}.`);
      if (original.status === "reversed") {
        throw new AppError("ALREADY_REVERSED", 409, `Voucher ${original.voucherNo} is already reversed.`);
      }
      const lines = await tx
        .select()
        .from(journalLine)
        .where(eq(journalLine.voucherId, voucherId))
        .orderBy(asc(journalLine.lineNo));

      const reversed = reverseLines(
        lines.map((l) => ({
          accountCode: l.accountCode,
          debit: numOf(l.debit),
          credit: numOf(l.credit),
          customerRef: l.customerRef,
          vendorRef: l.vendorRef,
          taxHead: (l.taxHead ?? null) as JournalLineInput["taxHead"],
          taxDirection: (l.taxDirection ?? null) as JournalLineInput["taxDirection"],
          memo: l.memo ?? undefined,
        })),
      );

      const posted = await this.postVoucherInTx(tx, {
        voucherType: "reversal",
        postingDate: new Date().toISOString().slice(0, 10),
        narration: `Reversal of ${original.voucherNo}: ${reason}`,
        postingMode: "manual",
        idempotencyKey: `reversal:${idempotencyKey}`,
        lines: reversed,
      });

      // The ONLY mutation the ledger permits — and only these two columns, enforced by a
      // trigger. Everything else about a posted voucher is immutable forever.
      await tx
        .update(journalVoucher)
        .set({ status: "reversed", reversedByVoucherId: posted.voucherId })
        .where(eq(journalVoucher.id, voucherId));

      await this.audit.appendInTx(tx, {
        action: "accounts.voucher.reversed",
        entityType: "journal_voucher",
        entityId: voucherId,
        data: { original: original.voucherNo, reversal: posted.voucherNo, reason },
      });
      return this.viewInTx(tx, posted.voucherId);
    });
  }

  /* ------------------------------- AR reads ------------------------------- */

  async getCustomerOutstanding(customerId: string): Promise<CustomerOutstanding> {
    return withTenant((tx) => this.getCustomerOutstandingInTx(tx, customerId));
  }

  async getCustomerOutstandingInTx(tx: Tx, customerId: string): Promise<CustomerOutstanding> {
    const rows = await tx
      .select()
      .from(arOpenItem)
      .where(and(eq(arOpenItem.customerRef, customerId), inArray(arOpenItem.status, ["open", "partly_paid"])))
      .orderBy(asc(arOpenItem.dueDate));
    const outstanding = rows.reduce((a, r) => a + numOf(r.outstanding), 0);
    return {
      customerId,
      outstanding: Math.round(outstanding * 100) / 100,
      openInvoices: rows.length,
      oldestDueDate: rows[0]?.dueDate ?? null,
    };
  }

  /* ---------------------------- the trial balance ------------------------- */

  async trialBalance(): Promise<{ rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number; balanced: boolean }> {
    return withTenant(async (tx) => {
      const sums = await tx
        .select({
          accountCode: journalLine.accountCode,
          debit: sql<string>`sum(${journalLine.debit})`,
          credit: sql<string>`sum(${journalLine.credit})`,
        })
        .from(journalLine)
        .groupBy(journalLine.accountCode);
      const accounts = await tx.select().from(glAccount);
      const byCode = new Map(accounts.map((a) => [a.code, a]));

      const rows: TrialBalanceRow[] = sums
        .map((s) => {
          const acc = byCode.get(s.accountCode);
          const type = (acc?.accountType ?? "asset") as AccountType;
          const debit = numOf(s.debit);
          const credit = numOf(s.credit);
          return {
            accountCode: s.accountCode,
            accountName: acc?.name ?? s.accountCode,
            accountType: type,
            debit: Math.round(debit * 100) / 100,
            credit: Math.round(credit * 100) / 100,
            balance: naturalBalance(type, debit, credit),
          };
        })
        .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

      return { rows, ...trialBalanceTotals(rows) };
    });
  }

  async getVoucher(voucherId: string): Promise<VoucherView> {
    return withTenant((tx) => this.viewInTx(tx, voucherId));
  }

  private async viewInTx(tx: Tx, voucherId: string): Promise<VoucherView> {
    const v = (await tx.select().from(journalVoucher).where(eq(journalVoucher.id, voucherId)).limit(1))[0];
    if (!v) throw new AppError("VOUCHER_NOT_FOUND", 404, `No voucher ${voucherId}.`);
    const lines = await tx
      .select()
      .from(journalLine)
      .where(eq(journalLine.voucherId, voucherId))
      .orderBy(asc(journalLine.lineNo));
    return {
      id: v.id,
      voucherNo: v.voucherNo,
      voucherType: v.voucherType,
      postingDate: v.postingDate,
      status: v.status,
      narration: v.narration,
      totalDebit: v.totalDebit,
      totalCredit: v.totalCredit,
      lines: lines.map((l) => ({
        lineNo: l.lineNo,
        accountCode: l.accountCode,
        debit: l.debit,
        credit: l.credit,
        customerRef: l.customerRef,
        taxHead: l.taxHead,
        taxDirection: l.taxDirection,
        memo: l.memo,
      })),
    };
  }
}
