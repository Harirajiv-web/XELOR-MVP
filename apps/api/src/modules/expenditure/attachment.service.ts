import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  Errors,
  acceptanceReport,
  currentTenant,
  detectReceiptDuplicates,
  detectSplitPattern,
  newId,
  shouldHoldForReview,
  type Confidence,
  type ExtractionOutcome,
  type HeadKeywordSpec,
  type ReceiptDraft,
  type ReceiptFingerprint,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { ReceiptExtractor } from "../../ai/receipt-extractor.js";
import { ClaimService } from "./claim.service.js";

const { expAttachment, expenseHead, expenseClaim, expenseClaimLine } = schema;

/**
 * RECEIPTS — upload, extraction (AI #1), duplicate detection (AI #4), and the confirm step
 * that is the only route from a model's output to a rupee on a claim.
 *
 * The `confirm` method is the module's most important boundary and it is deliberately
 * boring: it takes the fields a HUMAN accepted, records what they changed, and calls the
 * ordinary claim-line path. There is no other way for extracted data to become a claim
 * line, so "the AI posted something wrong" is not a failure mode that exists — the worst
 * case is a corrected field.
 */
@Injectable()
export class AttachmentService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly extractor: ReceiptExtractor,
    private readonly claims: ClaimService,
  ) {}

  /**
   * Register an uploaded receipt and run duplicate detection immediately.
   *
   * Detection happens at UPLOAD, not at approval, so the person attaching a receipt they
   * have already claimed finds out at once rather than in an approver's queue a week later.
   * Note that a duplicate is never refused: both documents are named on the flag and a
   * human decides.
   */
  async register(input: {
    fileName: string;
    mime: string;
    sizeBytes: number;
    /** The file's own hash — the registered deterministic baseline for AI #4. */
    sha256: string;
    objectKey?: string;
    uploadedByRef?: string;
    /** Enough to fingerprint it for the fuzzy tier, if extraction has already run. */
    fingerprint?: { merchant: string; invoiceNo?: string | null; invoiceDate: string; amount: number; docRef: string; claimantRef: string };
  }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const id = newId();
      await tx.insert(expAttachment).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        objectKey: input.objectKey ?? `s3://receipts/${id}`,
        fileName: input.fileName,
        mime: input.mime,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        uploadedByRef: input.uploadedByRef ?? actorId,
        extractionStatus: "none",
      });

      const flags = input.fingerprint
        ? await this.detectReceiptDuplicatesInTx(tx, {
            attachmentId: id,
            sha256: input.sha256,
            ...input.fingerprint,
          })
        : [];
      if (flags.length > 0) {
        await tx.update(expAttachment).set({ duplicateFlags: flags as unknown as object, updatedBy: actorId }).where(eq(expAttachment.id, id));
        await this.audit.appendInTx(tx, {
          action: "expenditure.receipt.duplicate_flagged",
          entityType: "exp_attachment",
          entityId: id,
          data: { findings: flags.length, kinds: flags.map((f) => f.kind), holdForReview: shouldHoldForReview(flags) },
        });
      }

      return {
        attachmentId: id,
        fileName: input.fileName,
        sha256: input.sha256,
        duplicateFlags: flags,
        holdForReview: shouldHoldForReview(flags),
      };
    });
  }

  /** Run AI #1 and store the draft. Nothing here reaches a claim. */
  async extract(
    attachmentId: string,
    input: { text: string; hint?: ReceiptDraft; confidence?: Confidence; fallback?: Partial<ReceiptDraft>; expectedGstRate?: number | null },
  ): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const a = await this.byIdInTx(tx, attachmentId);
      const heads = await this.headKeywords(tx);
      const result = await this.extractor.extract({ ...input, heads });

      await tx
        .update(expAttachment)
        .set({
          parsedFields: result.degraded ? null : ({ ...result.draft, confidence: result.confidence, model: result.model } as unknown as object),
          extractionStatus: result.degraded ? "failed" : result.usedFallback ? "fallback" : "extracted",
          needsReview: result.needsReview as unknown as object,
          usedFallback: result.usedFallback,
          updatedBy: actorId,
          updatedAt: new Date(),
        })
        .where(eq(expAttachment.id, a.id));

      return {
        attachmentId,
        status: result.degraded ? "failed" : result.usedFallback ? "fallback" : "extracted",
        degraded: result.degraded,
        draft: result.degraded ? null : result.draft,
        needsReview: result.needsReview,
        checks: result.checks,
        divergent: result.divergent,
        suggestedHead: result.suggestedHeadCode,
        suggestedHeadConfidence: result.suggestedHeadConfidence,
        model: result.model,
        message: result.degraded
          ? "Extraction is unavailable — enter the receipt manually. Nothing is lost; this is the path that always worked."
          : result.needsReview.length > 0
            ? `${result.needsReview.length} field(s) need a look before this can be added to a claim.`
            : "Every cross-check reconciled.",
      };
    });
  }

  /**
   * THE HUMAN GATE.
   *
   * The caller passes the values a person accepted. Anything they changed from the draft is
   * recorded field by field, and the resulting claim line carries `source = 'ai_assisted'`
   * with both the confidence and the edits — which is what makes the acceptance dashboard
   * an honest measurement rather than a vanity metric.
   */
  async confirm(
    attachmentId: string,
    input: {
      claimNo: string;
      expenseHeadCode: string;
      expenseDate: string;
      amount: number;
      gstAmount?: number;
      merchant?: string;
      invoiceRecipientGstin?: string | null;
      description?: string;
    },
  ): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    const edits = await withTenant(async (tx) => {
      const a = await this.byIdInTx(tx, attachmentId);
      const draft = (a.parsedFields ?? null) as (ReceiptDraft & { confidence?: Confidence }) | null;
      if (!draft) throw Errors.validation([{ field: "attachmentId", message: "there is no extraction draft to confirm" }]);

      // What did the human change? This diff is the metric.
      const diff: Record<string, { extracted: unknown; final: unknown }> = {};
      const compare = (field: string, extracted: unknown, final: unknown): void => {
        if (extracted == null && final == null) return;
        if (String(extracted) !== String(final)) diff[field] = { extracted, final };
      };
      compare("merchant", draft.merchant, input.merchant ?? draft.merchant);
      compare("invoiceDate", draft.invoiceDate, input.expenseDate);
      compare("total", draft.total, input.amount);
      compare("gst", Math.round((draft.cgst + draft.sgst + draft.igst) * 100) / 100, input.gstAmount ?? 0);

      await tx
        .update(expAttachment)
        .set({ extractionStatus: "confirmed", updatedBy: actorId, updatedAt: new Date() })
        .where(eq(expAttachment.id, a.id));
      await this.audit.appendInTx(tx, {
        action: "expenditure.receipt.confirmed",
        entityType: "exp_attachment",
        entityId: a.id,
        data: { claimNo: input.claimNo, editedFields: Object.keys(diff), fieldsPresented: 4 },
      });
      return { diff, confidence: draft.confidence ?? {}, attachmentDbId: a.id };
    });

    const claim = await this.claims.addLine(input.claimNo, {
      expenseHeadCode: input.expenseHeadCode,
      expenseDate: input.expenseDate,
      amount: input.amount,
      gstAmount: input.gstAmount,
      merchant: input.merchant,
      description: input.description,
      invoiceRecipientGstin: input.invoiceRecipientGstin ?? null,
      attachmentId: edits.attachmentDbId,
      source: "ai_assisted",
      aiConfidence: edits.confidence as Record<string, number>,
      aiUserEdits: edits.diff,
    });

    return { claim, editedFields: Object.keys(edits.diff), edits: edits.diff };
  }

  /** The employee declined the draft entirely and typed it in. Recorded, because a decline
   *  rate is as much a measurement as an acceptance rate. */
  async decline(attachmentId: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const a = await this.byIdInTx(tx, attachmentId);
      await tx.update(expAttachment).set({ extractionStatus: "declined", updatedBy: actorId }).where(eq(expAttachment.id, a.id));
      return { attachmentId, status: "declined" };
    });
  }

  /* ---------------------------- AI #4, on demand --------------------------- */

  /**
   * Sweep the whole attachment set for split-claim patterns. Run on a queue in production;
   * exposed here so the demo can show the finding and, more importantly, show the wording —
   * every one of these says "worth asking; not worth assuming".
   */
  async duplicateSweep(threshold = 500): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const prints = await this.fingerprintsInTx(tx);
      const splits = detectSplitPattern(prints, { threshold });
      const pairwise = prints.flatMap((p) => detectReceiptDuplicates(p, prints.filter((q) => q.attachmentId !== p.attachmentId)));
      // Each pair is found from both ends; keep one.
      const seen = new Set<string>();
      const unique = pairwise.filter((f) => {
        const key = [...f.attachments].sort().join("|") + f.kind;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return {
        attachmentsScanned: prints.length,
        findings: [...unique, ...splits],
        holdForReview: shouldHoldForReview([...unique, ...splits]),
        note: "Every finding is a flag for the approver. Nothing in this module rejects a claim.",
      };
    });
  }

  /** The AI-acceptance dashboard: acceptance rate WITH the field edit rate beside it. */
  async acceptance(): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(expAttachment);
      const lines = await tx.select().from(expenseClaimLine);
      const editsByAttachment = new Map(
        lines.filter((l) => l.attachmentId).map((l) => [l.attachmentId!, (l.aiUserEdits ?? {}) as Record<string, { extracted: unknown; final: unknown }>]),
      );
      const outcomes: ExtractionOutcome[] = rows
        .filter((r) => r.extractionStatus !== "none")
        .map((r) => ({
          attachmentId: r.id,
          confirmed: r.extractionStatus === "confirmed",
          usedFallback: r.usedFallback,
          edits: editsByAttachment.get(r.id) ?? {},
          fieldsPresented: 4,
        }));
      return {
        feature: "expenditure.receipt_extraction",
        ...acceptanceReport(outcomes),
        note: "Acceptance rate alone flatters the feature — a user who confirms after correcting four fields has done the work by hand. The field edit rate is the honest measure.",
      };
    });
  }

  /* -------------------------------- helpers -------------------------------- */

  private async byIdInTx(tx: Tx, id: string) {
    const [a] = await tx.select().from(expAttachment).where(eq(expAttachment.id, id)).limit(1);
    if (!a) throw Errors.notFound(`attachment ${id}`);
    return a;
  }

  private async headKeywords(tx: Tx): Promise<HeadKeywordSpec[]> {
    const rows = await tx.select().from(expenseHead);
    return rows.map((h) => ({ code: h.code, name: h.name, keywords: (h.categoryKeywords ?? []) as string[] }));
  }

  private async fingerprintsInTx(tx: Tx): Promise<ReceiptFingerprint[]> {
    const rows = await tx.select().from(expAttachment);
    const claims = await tx.select().from(expenseClaim);
    const claimById = new Map(claims.map((c) => [c.id, c]));
    return rows
      .filter((r) => r.parsedFields != null)
      .map((r) => {
        const p = r.parsedFields as unknown as ReceiptDraft;
        const claim = r.linkedDocRef ? claimById.get(r.linkedDocRef) : undefined;
        return {
          attachmentId: r.id,
          docRef: claim?.claimNo ?? r.fileName,
          claimantRef: claim?.employeeRef ?? (r.uploadedByRef ?? "unknown"),
          sha256: r.sha256,
          merchant: p.merchant,
          invoiceNo: p.invoiceNo ?? null,
          invoiceDate: p.invoiceDate,
          amount: p.total,
        };
      });
  }

  private async detectReceiptDuplicatesInTx(
    tx: Tx,
    candidate: { attachmentId: string; sha256: string; merchant: string; invoiceNo?: string | null; invoiceDate: string; amount: number; docRef: string; claimantRef: string },
  ) {
    const existing = await this.fingerprintsInTx(tx);
    return detectReceiptDuplicates(candidate as ReceiptFingerprint, existing);
  }
}
