import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  accumulate,
  computeVendorTds,
  currentTenant,
  eventName,
  fiscalYearOf,
  newId,
  resolveItc,
  splitGst,
  type DeducteeType,
  type ItcEligibility,
  type TdsConfigRow,
  type TdsSection,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { DocumentEditService } from "../../common/document-edit.service.js";
import { ExpNumberingService } from "./exp-numbering.service.js";
import { BudgetService } from "./budget.service.js";
import { PostingService } from "./posting.service.js";
import { COMPANY_GSTIN } from "./claim.service.js";

const {
  purchaseExpense,
  purchaseExpenseLine,
  utilityBillDetail,
  expenseHead,
  tdsConfig,
  tdsAccumulator,
  outboxEvent,
} = schema;

export interface IndirectLineInput {
  expenseHeadCode: string;
  description: string;
  amount: number;
  gstRate?: number;
  hsnSac?: string;
}

export interface CreateIndirectInput {
  docKind: "direct_invoice" | "indirect_pr" | "utility_bill";
  vendorName: string;
  vendorRef?: string;
  vendorGstin?: string | null;
  vendorDeducteeType?: DeducteeType;
  vendorHasPan?: boolean;
  vendorInvoiceNo?: string;
  invoiceDate: string;
  costCentreRef: string;
  lines: IndirectLineInput[];
  utility?: { utilityType: string; meterNo?: string; periodFrom?: string; periodTo?: string; prevReading?: number; currReading?: number };
}

/**
 * INDIRECT SPEND — the vendor invoices that never touch a warehouse.
 *
 * This is where the module's two hardest pieces of tax arithmetic meet on one document:
 *
 *  - **GST** splits into CGST + SGST or into IGST purely on the two-digit state code that
 *    opens each GSTIN. The money the company pays is identical either way; which government
 *    receives it is not, and getting it wrong is the commonest notice in Indian GST.
 *  - **TDS** withholds a slice of the supplier's payment on the TAXABLE VALUE — never on
 *    the GST-inclusive total — at a rate that depends on who the supplier is, against two
 *    thresholds evaluated over a running per-vendor total.
 *
 * When the annual threshold is crossed mid-year, both statutory readings are stored on the
 * document and a finance review is raised. The system computes; it does not choose a tax
 * position on somebody else's behalf.
 */
/** A correction to an indirect expense. Absent means "leave alone". */
export interface EditIndirectInput {
  vendorInvoiceNo?: string;
  invoiceDate?: string;
  costCentreRef?: string;
  reason?: string;
}
@Injectable()
export class IndirectExpenseService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly edits: DocumentEditService,
    private readonly numbering: ExpNumberingService,
    private readonly budgets: BudgetService,
    private readonly postings: PostingService,
  ) {}

  async create(input: CreateIndirectInput): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    // A vendor invoice with no lines has no taxable value, so no GST split and no TDS base.
    // Refuse it rather than book a zero-value document that later reconciles against nothing.
    if (input.lines.length === 0) {
      throw new AppError("EXP_NO_LINES", 422, "A vendor invoice must carry at least one line.");
    }
    return withTenant(async (tx) => {
      const id = newId();
      const expNo = await this.numbering.next(tx, "indirect", fiscalYearOf(input.invoiceDate));
      const heads = await this.headMap(tx);

      let basic = 0;
      let gstTotal = 0;
      let itcTotal = 0;
      let tdsSection: TdsSection | null = null;
      let lineNo = 0;
      const lineRows: (typeof purchaseExpenseLine.$inferInsert)[] = [];

      for (const l of input.lines) {
        lineNo += 1;
        const head = heads.get(l.expenseHeadCode);
        if (!head) throw Errors.notFound(`expense head ${l.expenseHeadCode}`);
        const rate = l.gstRate ?? Number(head.gstRate ?? 0);
        const gst = Math.round(((l.amount * rate) / 100) * 100) / 100;
        const itc = resolveItc({
          headDefault: head.itcEligibility as ItcEligibility,
          // A vendor invoice is addressed to the company by construction — that is what
          // makes it a B2B invoice. The employee-claim path is where the B2C case bites.
          invoiceRecipientGstin: input.vendorGstin ? COMPANY_GSTIN : null,
          companyGstin: COMPANY_GSTIN,
          gstAmount: gst,
        });

        // Held, not written. The header carries totals and a TDS base that only exist once
        // every line has been priced, so the header must be inserted first — and the child
        // FK is not deferrable, so writing the lines here would point at a row that does
        // not exist yet.
        lineRows.push({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          purchaseExpenseId: id,
          lineNo,
          expenseHeadId: head.id,
          description: l.description,
          amount: l.amount.toFixed(2),
          gstRate: rate ? rate.toFixed(2) : null,
          gstAmount: gst.toFixed(2),
          itcEligibility: itc.eligibility,
          itcAmount: itc.itcAmount.toFixed(2),
          hsnSac: l.hsnSac ?? null,
          costCentreRef: input.costCentreRef,
        });

        basic = Math.round((basic + l.amount) * 100) / 100;
        gstTotal = Math.round((gstTotal + gst) * 100) / 100;
        itcTotal = Math.round((itcTotal + itc.itcAmount) * 100) / 100;
        if (!tdsSection && head.defaultTdsSection) tdsSection = head.defaultTdsSection as TdsSection;
      }

      // GST split by place of supply.
      const split = input.vendorGstin
        ? splitGst({ supplierGstin: input.vendorGstin, companyGstin: COMPANY_GSTIN, gstAmount: gstTotal })
        : { cgst: 0, sgst: 0, igst: 0, interState: false, reason: "Vendor is unregistered — no GST charged." };

      // TDS, on the taxable value, against the running per-vendor total.
      const deducteeType = input.vendorDeducteeType ?? "company_firm_other";
      const config = await this.tdsConfigInTx(tx);
      const fy = fiscalYearOf(input.invoiceDate);
      const vendorKey = input.vendorRef ?? deterministicVendorRef(input.vendorName);
      const priorAcc = await this.accumulatorInTx(tx, vendorKey, tdsSection, fy);
      const tds = computeVendorTds({
        section: tdsSection,
        deducteeType,
        base: basic,
        paymentDate: input.invoiceDate,
        config,
        accumulator: priorAcc,
        vendorHasPan: input.vendorHasPan ?? true,
      });

      await tx.insert(purchaseExpense).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        expNo,
        docKind: input.docKind,
        vendorRef: input.vendorRef ?? null,
        vendorName: input.vendorName,
        vendorGstin: input.vendorGstin ?? null,
        vendorDeducteeType: deducteeType,
        vendorHasPan: input.vendorHasPan ?? true,
        vendorInvoiceNo: input.vendorInvoiceNo ?? null,
        invoiceDate: input.invoiceDate,
        costCentreRef: input.costCentreRef,
        basicAmount: basic.toFixed(2),
        cgst: split.cgst.toFixed(2),
        sgst: split.sgst.toFixed(2),
        igst: split.igst.toFixed(2),
        totalItcEligible: itcTotal.toFixed(2),
        tdsSection: tds.section,
        tdsRate: tds.applicable ? tds.ratePct.toFixed(3) : null,
        tdsBase: tds.base.toFixed(2),
        tdsAmount: tds.amount.toFixed(2),
        tdsConfigRef: tds.amount > 0 ? tds.configRef : null,
        tdsCrossing: (tds.crossing ?? null) as unknown as object,
        status: "draft",
      });

      await tx.insert(purchaseExpenseLine).values(lineRows);

      if (input.utility) {
        const units =
          input.utility.currReading != null && input.utility.prevReading != null
            ? input.utility.currReading - input.utility.prevReading
            : null;
        await tx.insert(utilityBillDetail).values({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          purchaseExpenseId: id,
          utilityType: input.utility.utilityType,
          meterNo: input.utility.meterNo ?? null,
          periodFrom: input.utility.periodFrom ?? null,
          periodTo: input.utility.periodTo ?? null,
          prevReading: input.utility.prevReading?.toFixed(3) ?? null,
          currReading: input.utility.currReading?.toFixed(3) ?? null,
          unitsConsumed: units?.toFixed(3) ?? null,
        });
      }

      // Roll the accumulator forward, whether or not this bill was deducted — the running
      // total is what makes the eleventh-month crossing happen at all.
      if (tdsSection) {
        await this.upsertAccumulator(tx, vendorKey, tdsSection, fy, basic, input.invoiceDate, Boolean(tds.crossing), expNo, priorAcc);
      }

      await this.audit.appendInTx(tx, {
        action: "expenditure.indirect.created",
        entityType: "purchase_expense",
        entityId: id,
        data: { expNo, vendor: input.vendorName, basic, gst: gstTotal, tds: tds.amount, tdsSection: tds.section },
      });

      return { ...(await this.viewInTx(tx, id)), gstSplitReason: split.reason, tdsReason: tds.reason };
    });
  }

  async submit(expNo: string, opts: { idempotencyKey: string; callerCanOverride?: boolean; overrideReason?: string }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    if (!opts.idempotencyKey) throw Errors.validation([{ field: "Idempotency-Key", message: "required on indirect-expense submission" }]);
    const keyHash = createHash("sha256").update(opts.idempotencyKey).digest("hex");

    return withTenant(async (tx) => {
      const pe = await this.byNoInTx(tx, expNo);
      if (pe.idempotencyKeyHash === keyHash) return this.viewInTx(tx, pe.id);
      if (!["draft", "blocked"].includes(pe.status)) {
        throw new AppError("INDIRECT_NOT_SUBMITTABLE", 422, `${expNo} is ${pe.status}.`);
      }

      const lines = await tx.select().from(purchaseExpenseLine).where(eq(purchaseExpenseLine.purchaseExpenseId, pe.id));
      const heads = await this.headMap(tx);
      const codeById = new Map([...heads.values()].map((h) => [h.id, h.code]));

      const byHead = new Map<string, number>();
      for (const l of lines) {
        const code = codeById.get(l.expenseHeadId) ?? "?";
        byHead.set(code, Math.round(((byHead.get(code) ?? 0) + Number(l.amount)) * 100) / 100);
      }

      const results: Record<string, unknown>[] = [];
      for (const [headCode, amount] of byHead) {
        const r = await this.budgets.checkAndReserveInTx(tx, {
          costCentreRef: pe.costCentreRef,
          expenseHeadCode: headCode,
          onDate: pe.invoiceDate ?? new Date().toISOString().slice(0, 10),
          amount,
          docType: "purchase_expense",
          docRef: expNo,
          idempotencyKey: `indirect:${expNo}:${headCode}`,
          callerCanOverride: opts.callerCanOverride,
          overrideReason: opts.overrideReason,
        });
        results.push({ expenseHeadCode: headCode, decision: r.decision, available: r.availability.available, shortfall: r.shortfall, reason: r.reason });
      }

      const now = new Date();
      await tx
        .update(purchaseExpense)
        .set({ status: "in_approval", budgetCheckResult: results as unknown as object, idempotencyKeyHash: keyHash, updatedBy: actorId, updatedAt: now })
        .where(eq(purchaseExpense.id, pe.id));
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("expenditure", "indirect", "submitted"),
        payload: { expNo, vendor: pe.vendorName, basic: Number(pe.basicAmount) },
        createdAt: now,
      });
      return { ...(await this.viewInTx(tx, pe.id)), budget: results };
    });
  }

  async approve(expNo: string, opts: { at?: string } = {}): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const pe = await this.byNoInTx(tx, expNo);
      if (pe.status !== "in_approval") throw new AppError("INDIRECT_NOT_IN_APPROVAL", 422, `${expNo} is ${pe.status}.`);
      const at = opts.at ? new Date(opts.at) : new Date();

      await this.budgets.flipInTx(tx, {
        docType: "purchase_expense",
        docRef: expNo,
        from: "in_approval",
        to: "committed",
        idempotencyKey: `indirect:${expNo}:commit`,
      });
      await tx.update(purchaseExpense).set({ status: "approved", approvedAt: at, updatedBy: actorId, updatedAt: at }).where(eq(purchaseExpense.id, pe.id));

      const posting = await this.postings.requestInTx(tx, {
        docType: "purchase_expense",
        docRef: expNo,
        payload: await this.journalFor(tx, pe.id),
        idempotencyKey: `exp:purchase_expense:${pe.id}:v1`,
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("expenditure", "indirect", "approved"),
        payload: { expNo, postingRef: posting.idempotencyKey },
        createdAt: at,
      });
      return { ...(await this.viewInTx(tx, pe.id)), posting };
    });
  }

  async detail(expNo: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const pe = await this.byNoInTx(tx, expNo);
      return this.viewInTx(tx, pe.id);
    });
  }

  async list(): Promise<Array<Record<string, unknown>>> {
    return withTenant(async (tx) => {
      const rows = await tx.select({ id: purchaseExpense.id }).from(purchaseExpense).orderBy(purchaseExpense.expNo);
      const out: Array<Record<string, unknown>> = [];
      for (const r of rows) out.push(await this.viewInTx(tx, r.id));
      return out;
    });
  }

  /** The TDS register — every deduction with the effective-dated row that produced it. */
  async tdsRegister(fiscalYear: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(purchaseExpense);
      const deductions = rows
        .filter((r) => Number(r.tdsAmount) > 0)
        .map((r) => ({
          expNo: r.expNo,
          vendor: r.vendorName,
          section: r.tdsSection,
          ratePct: Number(r.tdsRate ?? 0),
          base: Number(r.tdsBase),
          amount: Number(r.tdsAmount),
          configRef: r.tdsConfigRef,
          crossing: r.tdsCrossing,
        }));
      const accumulators = await tx.select().from(tdsAccumulator).where(eq(tdsAccumulator.fiscalYear, fiscalYear));
      return {
        fiscalYear,
        deductions,
        totalWithheld: Math.round(deductions.reduce((a, d) => a + d.amount, 0) * 100) / 100,
        bySection: groupSum(deductions.map((d) => [d.section ?? "—", d.amount])),
        accumulators: accumulators.map((a) => ({
          vendorRef: a.vendorRef,
          section: a.section,
          cumulativeBase: Number(a.cumulativeBase),
          thresholdCrossedAt: a.thresholdCrossedAt,
          crossingDocRef: a.crossingDocRef,
        })),
        pendingFinanceReview: deductions.filter((d) => d.crossing != null).map((d) => d.expNo),
      };
    });
  }

  /** The ITC register — what is recoverable, what is blocked, and why for every rupee. */
  async itcRegister(): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const lines = await tx.select().from(purchaseExpenseLine);
      const heads = await this.headMap(tx);
      const codeById = new Map([...heads.values()].map((h) => [h.id, h.code]));
      const rows = lines.map((l) => ({
        head: codeById.get(l.expenseHeadId),
        gst: Number(l.gstAmount),
        itc: Number(l.itcAmount),
        eligibility: l.itcEligibility,
      }));
      const gst = Math.round(rows.reduce((a, r) => a + r.gst, 0) * 100) / 100;
      const itc = Math.round(rows.reduce((a, r) => a + r.itc, 0) * 100) / 100;
      return {
        gstCharged: gst,
        itcRecoverable: itc,
        blocked: Math.round((gst - itc) * 100) / 100,
        byEligibility: groupSum(rows.map((r) => [r.eligibility, r.gst])),
      };
    });
  }

  /* -------------------------------- helpers -------------------------------- */

  private async byNoInTx(tx: Tx, expNo: string) {
    const [pe] = await tx.select().from(purchaseExpense).where(eq(purchaseExpense.expNo, expNo)).limit(1);
    if (!pe) throw Errors.notFound(`indirect expense ${expNo}`);
    return pe;
  }

  private async headMap(tx: Tx) {
    const rows = await tx.select().from(expenseHead);
    return new Map(rows.map((h) => [h.code, h]));
  }

  private async tdsConfigInTx(tx: Tx): Promise<TdsConfigRow[]> {
    const rows = await tx.select().from(tdsConfig);
    return rows.map((r) => ({
      section: r.section as TdsSection,
      deducteeType: r.deducteeType as TdsConfigRow["deducteeType"],
      ratePct: Number(r.ratePct),
      singlePaymentThreshold: Number(r.singlePaymentThreshold),
      annualThreshold: Number(r.annualThreshold),
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      sourceNote: r.sourceNote,
      itAct2025Section: r.itAct2025Section,
    }));
  }

  private async accumulatorInTx(tx: Tx, vendorRef: string, section: TdsSection | null, fy: string) {
    if (!section) return null;
    const [a] = await tx
      .select()
      .from(tdsAccumulator)
      .where(and(eq(tdsAccumulator.vendorRef, vendorRef), eq(tdsAccumulator.section, section), eq(tdsAccumulator.fiscalYear, fy)))
      .limit(1);
    if (!a) return null;
    return {
      vendorRef: a.vendorRef,
      section: a.section as TdsSection,
      fiscalYear: a.fiscalYear,
      cumulativeBase: Number(a.cumulativeBase),
      thresholdCrossedAt: a.thresholdCrossedAt,
    };
  }

  private async upsertAccumulator(
    tx: Tx,
    vendorRef: string,
    section: TdsSection,
    fy: string,
    base: number,
    onDate: string,
    crossed: boolean,
    docRef: string,
    prior: Awaited<ReturnType<IndirectExpenseService["accumulatorInTx"]>>,
  ): Promise<void> {
    const { tenantId, actorId } = currentTenant();
    const next = accumulate(prior, { vendorRef, section, fiscalYear: fy, base, onDate, crossed });
    const [existing] = await tx
      .select()
      .from(tdsAccumulator)
      .where(and(eq(tdsAccumulator.vendorRef, vendorRef), eq(tdsAccumulator.section, section), eq(tdsAccumulator.fiscalYear, fy)))
      .limit(1);
    if (existing) {
      await tx
        .update(tdsAccumulator)
        .set({
          cumulativeBase: next.cumulativeBase.toFixed(2),
          thresholdCrossedAt: next.thresholdCrossedAt ?? null,
          crossingDocRef: next.thresholdCrossedAt ? (existing.crossingDocRef ?? docRef) : null,
          updatedBy: actorId,
          updatedAt: new Date(),
        })
        .where(eq(tdsAccumulator.id, existing.id));
    } else {
      await tx.insert(tdsAccumulator).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        vendorRef,
        section,
        fiscalYear: fy,
        cumulativeBase: next.cumulativeBase.toFixed(2),
        thresholdCrossedAt: next.thresholdCrossedAt ?? null,
        crossingDocRef: next.thresholdCrossedAt ? docRef : null,
      });
    }
  }

  /**
   * The journal. The worked example from §11.6, generalised: expense debits net of
   * recoverable GST, the recoverable GST split by direction, TDS credited to the payable,
   * and the vendor credited with what they are actually paid.
   */
  private async journalFor(tx: Tx, id: string): Promise<Record<string, unknown>> {
    const [pe] = await tx.select().from(purchaseExpense).where(eq(purchaseExpense.id, id)).limit(1);
    const lines = await tx.select().from(purchaseExpenseLine).where(eq(purchaseExpenseLine.purchaseExpenseId, id));
    const heads = await this.headMap(tx);
    const codeById = new Map([...heads.values()].map((h) => [h.id, h.code]));

    const debits: Array<{ account: string; amount: number; note: string }> = [];
    for (const l of lines) {
      const recoverable = Number(l.itcAmount);
      const blockedGst = Math.round((Number(l.gstAmount) - recoverable) * 100) / 100;
      debits.push({
        account: codeById.get(l.expenseHeadId) ?? "EH-UNKNOWN",
        amount: Math.round((Number(l.amount) + blockedGst) * 100) / 100,
        note: blockedGst > 0 ? "expense including non-recoverable GST" : "expense, net of recoverable GST",
      });
    }
    if (Number(pe!.cgst) > 0) debits.push({ account: "GST-ITC-CGST", amount: Number(pe!.cgst), note: "input credit" });
    if (Number(pe!.sgst) > 0) debits.push({ account: "GST-ITC-SGST", amount: Number(pe!.sgst), note: "input credit" });
    if (Number(pe!.igst) > 0) debits.push({ account: "GST-ITC-IGST", amount: Number(pe!.igst), note: "input credit" });

    const gross = Math.round((Number(pe!.basicAmount) + Number(pe!.cgst) + Number(pe!.sgst) + Number(pe!.igst)) * 100) / 100;
    const tds = Number(pe!.tdsAmount);
    return {
      docType: "purchase_expense",
      docRef: pe!.expNo,
      date: pe!.invoiceDate,
      costCentreRef: pe!.costCentreRef,
      debits,
      credits: [
        ...(tds > 0 ? [{ account: `TDS-${pe!.tdsSection}-PAYABLE`, amount: tds, note: `withheld at ${pe!.tdsRate}% under s.${pe!.tdsSection}` }] : []),
        { account: `AP-${pe!.vendorName}`, amount: Math.round((gross - tds) * 100) / 100, note: "payable to the vendor, net of TDS" },
      ],
    };
  }

  private async viewInTx(tx: Tx, id: string): Promise<Record<string, unknown>> {
    const [pe] = await tx.select().from(purchaseExpense).where(eq(purchaseExpense.id, id)).limit(1);
    const lines = await tx.select().from(purchaseExpenseLine).where(eq(purchaseExpenseLine.purchaseExpenseId, id)).orderBy(purchaseExpenseLine.lineNo);
    const heads = await this.headMap(tx);
    const codeById = new Map([...heads.values()].map((h) => [h.id, h.code]));
    const gross =
      Number(pe!.basicAmount) + Number(pe!.cgst) + Number(pe!.sgst) + Number(pe!.igst);
    return {
      expNo: pe!.expNo,
      docKind: pe!.docKind,
      vendor: pe!.vendorName,
      vendorGstin: pe!.vendorGstin,
      status: pe!.status,
      costCentreRef: pe!.costCentreRef,
      invoiceDate: pe!.invoiceDate,
      basicAmount: Number(pe!.basicAmount),
      cgst: Number(pe!.cgst),
      sgst: Number(pe!.sgst),
      igst: Number(pe!.igst),
      totalItcEligible: Number(pe!.totalItcEligible),
      tds: {
        section: pe!.tdsSection,
        ratePct: pe!.tdsRate == null ? null : Number(pe!.tdsRate),
        base: Number(pe!.tdsBase),
        amount: Number(pe!.tdsAmount),
        configRef: pe!.tdsConfigRef,
        crossing: pe!.tdsCrossing,
      },
      grossAmount: Math.round(gross * 100) / 100,
      netPayable: Math.round((gross - Number(pe!.tdsAmount)) * 100) / 100,
      budgetCheckResult: pe!.budgetCheckResult,
      lines: lines.map((l) => ({
        lineNo: l.lineNo,
        head: codeById.get(l.expenseHeadId),
        description: l.description,
        amount: Number(l.amount),
        gstAmount: Number(l.gstAmount),
        itcAmount: Number(l.itcAmount),
        itcEligibility: l.itcEligibility,
      })),
    };
  }

  /* ------------------------------ corrections ----------------------------- */

  /**
   * The money fields are absent from this list on purpose. Basic amount, GST and TDS are
   * computed together — changing one without the others produces an expense whose tax does
   * not follow from its value, which is the shape of every ITC mismatch notice ever issued.
   * A wrong amount is corrected by cancelling and re-entering, or after posting by a
   * reversing entry.
   */
  private static readonly EDITABLE_INDIRECT_FIELDS = [
    "vendorInvoiceNo",
    "invoiceDate",
    "costCentreRef",
  ] as const;

  /** Correct an indirect expense, or withdraw one from approval to amend it. */
  /** By NUMBER — every other route in this module is keyed that way, so these match. */
  async editIndirectByNo(expNo: string, input: Parameters<IndirectExpenseService["editIndirect"]>[1]) {
    const id = await withTenant(async (tx) => (await this.byNoInTx(tx, expNo)).id);
    return this.editIndirect(id, input);
  }

  async editIndirectPolicyByNo(expNo: string) {
    const id = await withTenant(async (tx) => (await this.byNoInTx(tx, expNo)).id);
    return this.indirectEditPolicy(id);
  }

  async editIndirect(expenseId: string, input: EditIndirectInput) {
    this.edits.requireDocumentId(expenseId, "indirect expense");
    return withTenant(async (tx) => {
      await this.edits.lock(tx, "purchase_expense", expenseId);
      const [before] = await tx.select().from(purchaseExpense).where(eq(purchaseExpense.id, expenseId)).limit(1);
      if (!before) throw Errors.notFound(`indirect expense '${expenseId}'`);

      const patch: Record<string, unknown> = {};
      if (input.vendorInvoiceNo !== undefined) patch.vendorInvoiceNo = input.vendorInvoiceNo;
      if (input.invoiceDate !== undefined) patch.invoiceDate = input.invoiceDate;
      if (input.costCentreRef !== undefined) patch.costCentreRef = input.costCentreRef;

      const outcome = await this.edits.apply(tx, {
        docType: "expenditure.indirect",
        id: expenseId,
        before: before as unknown as Record<string, unknown>,
        status: before.status,
        patch,
        editableFields: IndirectExpenseService.EDITABLE_INDIRECT_FIELDS,
        reason: input.reason,
      });

      if (!outcome.changed) return before;

      const columns: Record<string, unknown> = { ...outcome.columns };
      if (outcome.reapprovalRequired && ["submitted", "in_approval", "blocked"].includes(before.status)) {
        columns.status = "draft";
        columns.workflowInstanceId = null;
      }

      await tx.update(purchaseExpense).set(columns).where(eq(purchaseExpense.id, expenseId));
      const [after] = await tx.select().from(purchaseExpense).where(eq(purchaseExpense.id, expenseId)).limit(1);
      return after;
    });
  }

  async indirectHistory(expenseId: string) {
    return this.edits.history("expenditure.indirect", expenseId);
  }

  async indirectEditPolicy(expenseId: string) {
    this.edits.requireDocumentId(expenseId, "indirect expense");
    const [row] = await withTenant((tx) =>
      tx.select({ status: purchaseExpense.status, revisionNo: purchaseExpense.revisionNo })
        .from(purchaseExpense).where(eq(purchaseExpense.id, expenseId)).limit(1),
    );
    if (!row) throw Errors.notFound(`indirect expense '${expenseId}'`);
    return { ...this.edits.policy("expenditure.indirect", row.status), status: row.status, revisionNo: row.revisionNo };
  }

}

function groupSum(pairs: Array<[string, number]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of pairs) out[k] = Math.round(((out[k] ?? 0) + v) * 100) / 100;
  return out;
}

/** A stable stand-in vendor id for demo vendors that have no Purchase master row yet. */
function deterministicVendorRef(name: string): string {
  const h = createHash("sha256").update(name).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-7${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;

}
