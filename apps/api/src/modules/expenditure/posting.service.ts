import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import { AppError, Errors, currentTenant, eventName, newId } from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { BudgetService } from "./budget.service.js";

const { postingInstruction, expenseClaim, purchaseExpense, outboxEvent } = schema;

/**
 * THE HANDOFF TO ACCOUNTS.
 *
 * Expenditure never writes a general-ledger row. It writes an INSTRUCTION carrying a
 * journal-shaped payload, in the same transaction as the approval that authorised it, and
 * Accounts posts it. The ledger has exactly one writer and this is not it — the same
 * discipline that gives Inventory one stock write path.
 *
 * The idempotency key is `exp:{docType}:{id}:v{n}` and it is UNIQUE in the database, so a
 * relay that delivers twice, a worker that restarts mid-batch, and an operator who presses
 * retry all produce one journal. The acknowledgement carries the voucher reference back,
 * and it is that acknowledgement — not the approval — that flips the budget bucket from
 * `committed` to `actual`. Money is only spent when the ledger says it is.
 */
@Injectable()
export class PostingService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly budgets: BudgetService,
  ) {}

  async requestInTx(
    tx: Tx,
    input: { docType: string; docRef: string; payload: Record<string, unknown>; idempotencyKey: string },
  ): Promise<{ idempotencyKey: string; status: string; replay: boolean }> {
    const { tenantId, actorId } = currentTenant();

    const [existing] = await tx
      .select()
      .from(postingInstruction)
      .where(eq(postingInstruction.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) {
      // A replay returns the original instruction. Posting the same approval twice is the
      // one error in this module that puts a real number in a real ledger.
      return { idempotencyKey: existing.idempotencyKey, status: existing.status, replay: true };
    }

    await tx.insert(postingInstruction).values({
      id: newId(),
      tenantId,
      createdBy: actorId,
      updatedBy: actorId,
      docType: input.docType,
      docRef: input.docRef,
      payload: input.payload as unknown as object,
      idempotencyKey: input.idempotencyKey,
      status: "pending",
    });
    // Same transaction as the state change. Either the document is approved and Accounts
    // has been told, or neither happened.
    await tx.insert(outboxEvent).values({
      id: newId(),
      tenantId,
      name: eventName("expenditure", "posting", "requested"),
      payload: { docType: input.docType, docRef: input.docRef, idempotencyKey: input.idempotencyKey },
      createdAt: new Date(),
    });
    return { idempotencyKey: input.idempotencyKey, status: "pending", replay: false };
  }

  /**
   * Accounts acknowledges. This is the moment the spend becomes `actual`, and it is
   * deliberately NOT the moment of approval: an approval is a decision, a posting is a
   * fact, and a budget that treats them as the same thing reports money as spent that the
   * ledger has never seen.
   */
  async acknowledge(idempotencyKey: string, voucherRef: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [p] = await tx.select().from(postingInstruction).where(eq(postingInstruction.idempotencyKey, idempotencyKey)).limit(1);
      if (!p) throw Errors.notFound(`posting instruction ${idempotencyKey}`);
      if (p.status === "acked") return { idempotencyKey, status: "acked", voucherRef: p.accountsVoucherRef, replay: true };

      const now = new Date();
      await tx
        .update(postingInstruction)
        .set({ status: "acked", accountsVoucherRef: voucherRef, ackedAt: now, updatedBy: actorId, updatedAt: now })
        .where(eq(postingInstruction.id, p.id));

      const flipped = await this.budgets.flipInTx(tx, {
        docType: p.docType,
        docRef: p.docRef,
        from: "committed",
        to: "actual",
        idempotencyKey: `${idempotencyKey}:actual`,
      });

      if (p.docType === "expense_claim") {
        await tx.update(expenseClaim).set({ status: "posted", updatedBy: actorId, updatedAt: now }).where(eq(expenseClaim.claimNo, p.docRef));
      } else if (p.docType === "purchase_expense") {
        await tx.update(purchaseExpense).set({ status: "posted", updatedBy: actorId, updatedAt: now }).where(eq(purchaseExpense.expNo, p.docRef));
      }

      // The audited entity is the posting instruction, not the source document: `docRef` is
      // a human document number ("EXP-2627-00018") and the trail is keyed by row id. The
      // source document is named in `data`, so the chain still reads back to it.
      await this.audit.appendInTx(tx, {
        action: "expenditure.posting.acked",
        entityType: "posting_instruction",
        entityId: p.id,
        data: { docType: p.docType, docRef: p.docRef, idempotencyKey, voucherRef, budgetLinesFlipped: flipped.moved },
      });
      return { idempotencyKey, status: "acked", voucherRef, docRef: p.docRef, budgetLinesFlipped: flipped.moved, replay: false };
    });
  }

  async retry(idempotencyKey: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [p] = await tx.select().from(postingInstruction).where(eq(postingInstruction.idempotencyKey, idempotencyKey)).limit(1);
      if (!p) throw Errors.notFound(`posting instruction ${idempotencyKey}`);
      if (p.status === "acked") {
        throw new AppError("POSTING_ALREADY_ACKED", 409, `${idempotencyKey} was already posted as ${p.accountsVoucherRef}.`);
      }
      await tx
        .update(postingInstruction)
        .set({ status: "pending", attempts: p.attempts + 1, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(postingInstruction.id, p.id));
      return { idempotencyKey, status: "pending", attempts: p.attempts + 1 };
    });
  }

  async list(status?: string): Promise<Array<Record<string, unknown>>> {
    return withTenant(async (tx) => {
      const rows = status
        ? await tx.select().from(postingInstruction).where(eq(postingInstruction.status, status))
        : await tx.select().from(postingInstruction);
      return rows.map((p) => ({
        docType: p.docType,
        docRef: p.docRef,
        idempotencyKey: p.idempotencyKey,
        status: p.status,
        voucherRef: p.accountsVoucherRef,
        attempts: p.attempts,
        payload: p.payload,
      }));
    });
  }
}
