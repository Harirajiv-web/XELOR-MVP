import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  availability,
  checkBudget,
  currentTenant,
  eventName,
  fiscalYearOf,
  newId,
  periodOf,
  revisionConflicts,
  validateDistribution,
  type BudgetLineSpec,
  type CheckResult,
  type ConsumptionEntry,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";

const { budget, budgetLine, budgetConsumption, budgetRevision, expenseHead, outboxEvent } = schema;

export interface ReserveInput {
  costCentreRef: string;
  expenseHeadCode: string;
  onDate: string;
  amount: number;
  docType: string;
  docRef: string;
  idempotencyKey: string;
  callerCanOverride?: boolean;
  overrideReason?: string;
}

/**
 * BUDGETARY CONTROL — check and reserve, in one transaction.
 *
 * The whole module turns on this method, and on one line of SQL inside it: the budget line
 * is selected `FOR UPDATE` before availability is read. Without that lock, two people
 * submitting ₹40,000 against ₹58,000 of remaining budget both read "available" and both
 * pass, and the cost centre is ₹22,000 over with no single document responsible. With it,
 * one waits, reads the other's reservation, and gets a refusal that names the shortfall.
 *
 * The reservation and the approval that follows it are written in the SAME transaction as
 * the caller's document, so a crash between "money reserved" and "document created" rolls
 * back both. Budget held against a document that does not exist is the failure nobody
 * notices until a controller asks why a cost centre looks full.
 */
@Injectable()
export class BudgetService {
  constructor(private readonly audit: AuditLogService) {}

  /* ------------------------------- the check ------------------------------- */

  async checkAndReserveInTx(tx: Tx, input: ReserveInput): Promise<CheckResult & { reserved: boolean; budgetLineId: string | null }> {
    const { tenantId, actorId } = currentTenant();
    const period = periodOf(input.onDate);

    const line = await this.lockLine(tx, input.costCentreRef, input.expenseHeadCode, fiscalYearOf(input.onDate));
    if (!line) {
      // No budget line is NOT a silent pass. A cost centre with no budget for a head is a
      // configuration gap, and passing everything through it is how a budget stops meaning
      // anything — but refusing would block the demo's first ever expense, so it warns.
      return {
        decision: "warn",
        availability: { budgeted: 0, actual: 0, committed: 0, inApproval: 0, available: 0, consumedFraction: 0 },
        requested: input.amount,
        shortfall: input.amount,
        reason: `No FY ${fiscalYearOf(input.onDate)} budget line exists for ${input.expenseHeadCode} on ${input.costCentreRef}; this spend is unbudgeted.`,
        overridden: false,
        reserved: false,
        budgetLineId: null,
      };
    }

    const entries = await this.entriesInTx(tx, line.id);
    const result = checkBudget({
      line: line.spec,
      entries,
      period,
      requested: input.amount,
      callerCanOverride: input.callerCanOverride,
    });

    if (result.decision === "block") {
      throw new AppError("BUDGET_STOP", 422, result.reason, [
        { field: "available", message: String(result.availability.available) },
        { field: "requested", message: String(result.requested) },
        { field: "shortfall", message: String(result.shortfall) },
        { field: "override_roles", message: (result.overrideRoles ?? []).join(",") },
      ]);
    }

    if (result.overridden && !input.overrideReason) {
      throw Errors.validation([
        { field: "overrideReason", message: "a budget override must record why — an override nobody can read afterwards is no control at all" },
      ]);
    }

    await tx.insert(budgetConsumption).values({
      id: newId(),
      tenantId,
      createdBy: actorId,
      updatedBy: actorId,
      budgetLineId: line.id,
      period,
      bucket: "in_approval",
      amount: input.amount.toFixed(2),
      docType: input.docType,
      docRef: input.docRef,
      entryType: "reserve",
      idempotencyKey: input.idempotencyKey,
      note: result.overridden ? `override: ${input.overrideReason}` : null,
    });

    if (result.decision === "warn" || result.overridden) {
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("expenditure", "budget", result.overridden ? "stop-overridden" : "warn"),
        payload: {
          costCentreRef: input.costCentreRef,
          expenseHeadCode: input.expenseHeadCode,
          docRef: input.docRef,
          requested: input.amount,
          available: result.availability.available,
          shortfall: result.shortfall,
          overrideReason: input.overrideReason ?? null,
        },
        createdAt: new Date(),
      });
    }
    if (result.overridden) {
      await this.audit.appendInTx(tx, {
        action: "expenditure.budget.stop_overridden",
        entityType: "budget_line",
        entityId: line.id,
        data: {
          docRef: input.docRef,
          requested: input.amount,
          available: result.availability.available,
          reason: input.overrideReason,
        },
      });
    }

    return { ...result, reserved: true, budgetLineId: line.id };
  }

  /**
   * Move a reservation between buckets. `in_approval → committed` on final approval,
   * `committed → actual` on the Accounts acknowledgement.
   *
   * Two signed rows, never an update — the ledger is append-only, so the history of a
   * commitment is readable end to end rather than being the last state anyone wrote.
   */
  async flipInTx(
    tx: Tx,
    input: { docType: string; docRef: string; from: "in_approval" | "committed"; to: "committed" | "actual"; idempotencyKey: string },
  ): Promise<{ moved: number }> {
    const { tenantId, actorId } = currentTenant();
    const rows = await tx
      .select()
      .from(budgetConsumption)
      .where(and(eq(budgetConsumption.docRef, input.docRef), eq(budgetConsumption.bucket, input.from)));
    const live = this.netByLineAndPeriod(rows);
    let moved = 0;
    for (const [key, amount] of live) {
      if (amount === 0) continue;
      const [budgetLineId, periodStr] = key.split("|");
      const period = Number(periodStr);
      await tx.insert(budgetConsumption).values([
        {
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          budgetLineId: budgetLineId!,
          period,
          bucket: input.from,
          amount: (-amount).toFixed(2),
          docType: input.docType,
          docRef: input.docRef,
          entryType: "flip",
          idempotencyKey: `${input.idempotencyKey}:out:${budgetLineId}:${period}`,
        },
        {
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          budgetLineId: budgetLineId!,
          period,
          bucket: input.to,
          amount: amount.toFixed(2),
          docType: input.docType,
          docRef: input.docRef,
          entryType: "flip",
          idempotencyKey: `${input.idempotencyKey}:in:${budgetLineId}:${period}`,
        },
      ]);
      moved += 1;
    }
    return { moved };
  }

  /** Give the budget back when a document is rejected or cancelled — a signed negative row
   *  in the bucket that currently holds it. */
  async reverseInTx(tx: Tx, input: { docType: string; docRef: string; idempotencyKey: string; reason: string }): Promise<{ reversed: number }> {
    const { tenantId, actorId } = currentTenant();
    const rows = await tx.select().from(budgetConsumption).where(eq(budgetConsumption.docRef, input.docRef));
    const byBucket = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.budgetLineId}|${r.period}|${r.bucket}`;
      byBucket.set(key, Math.round(((byBucket.get(key) ?? 0) + Number(r.amount)) * 100) / 100);
    }
    let reversed = 0;
    for (const [key, amount] of byBucket) {
      if (amount <= 0) continue;
      const [budgetLineId, periodStr, bucket] = key.split("|");
      await tx.insert(budgetConsumption).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        budgetLineId: budgetLineId!,
        period: Number(periodStr),
        bucket: bucket as "in_approval" | "committed" | "actual",
        amount: (-amount).toFixed(2),
        docType: input.docType,
        docRef: input.docRef,
        entryType: "reverse",
        idempotencyKey: `${input.idempotencyKey}:rev:${budgetLineId}:${periodStr}:${bucket}`,
        note: input.reason,
      });
      reversed += 1;
    }
    return { reversed };
  }

  /* --------------------------------- reads --------------------------------- */

  async availabilityFor(costCentreRef: string, expenseHeadCode: string, onDate: string) {
    return withTenant(async (tx) => {
      const line = await this.findLine(tx, costCentreRef, expenseHeadCode, fiscalYearOf(onDate));
      if (!line) throw Errors.notFound(`budget line for ${expenseHeadCode} on ${costCentreRef}`);
      const entries = await this.entriesInTx(tx, line.id);
      return {
        costCentreRef,
        expenseHeadCode,
        period: periodOf(onDate),
        controlAction: line.spec.controlAction,
        ...availability(line.spec, entries, periodOf(onDate)),
      };
    });
  }

  async consumption(costCentreRef: string, expenseHeadCode: string, fiscalYear: string) {
    return withTenant(async (tx) => {
      const line = await this.findLine(tx, costCentreRef, expenseHeadCode, fiscalYear);
      if (!line) throw Errors.notFound(`budget line for ${expenseHeadCode} on ${costCentreRef}`);
      const rows = await tx
        .select()
        .from(budgetConsumption)
        .where(eq(budgetConsumption.budgetLineId, line.id))
        .orderBy(budgetConsumption.createdAt);
      return rows.map((r) => ({
        period: r.period,
        bucket: r.bucket,
        amount: Number(r.amount),
        entryType: r.entryType,
        docType: r.docType,
        docRef: r.docRef,
        note: r.note,
        at: r.createdAt.toISOString(),
      }));
    });
  }

  /* ------------------------------- revisions ------------------------------- */

  /**
   * Revise a budget. Conflicts — lines cut below what is already spent or committed — are
   * RETURNED for acknowledgement rather than refused, because the money is already gone and
   * the budget must be allowed to record reality. What cannot happen is the cut going
   * through with nobody having seen it: the CHECK constraint on `budget_revision` refuses a
   * row carrying conflicts without an acknowledger.
   */
  async revise(input: {
    costCentreRef: string;
    fiscalYear: string;
    reason: string;
    changes: Array<{ expenseHeadCode: string; newAnnualAmount: number }>;
    acknowledgeConflicts?: boolean;
    onDate: string;
  }) {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [current] = await tx
        .select()
        .from(budget)
        .where(
          and(
            eq(budget.costCentreRef, input.costCentreRef),
            eq(budget.fiscalYear, input.fiscalYear),
            eq(budget.status, "active"),
          ),
        )
        .limit(1);
      if (!current) throw Errors.notFound(`active FY ${input.fiscalYear} budget for ${input.costCentreRef}`);

      const proposed: Array<{ line: BudgetLineSpec; newAnnualAmount: number; newMonthlyDistribution: number[] }> = [];
      const entriesByLine: Record<string, ConsumptionEntry[]> = {};

      for (const c of input.changes) {
        const line = await this.findLine(tx, input.costCentreRef, c.expenseHeadCode, input.fiscalYear);
        if (!line) throw Errors.notFound(`budget line for ${c.expenseHeadCode}`);
        const cells = evenTwelve(c.newAnnualAmount);
        const v = validateDistribution(c.newAnnualAmount, cells);
        if (!v.ok) throw Errors.validation([{ field: "monthlyDistribution", message: v.reason! }]);
        proposed.push({ line: line.spec, newAnnualAmount: c.newAnnualAmount, newMonthlyDistribution: cells });
        entriesByLine[line.spec.id] = await this.entriesInTx(tx, line.id);
      }

      const conflicts = revisionConflicts(proposed, entriesByLine, periodOf(input.onDate));
      if (conflicts.length > 0 && !input.acknowledgeConflicts) {
        throw new AppError(
          "BUDGET_REVISION_CONFLICT",
          409,
          `${conflicts.length} line(s) would be cut below what is already spent or committed. Acknowledge to proceed — existing commitments are never retro-cancelled.`,
          conflicts.map((c) => ({
            field: c.expenseHeadCode,
            message: `proposed ₹${c.proposedAmount}, already consumed ₹${c.alreadyConsumed}, over-committed by ₹${c.overCommitBy}`,
          })),
        );
      }

      const nextVersion = current.versionNo + 1;
      await tx.update(budget).set({ status: "revised", updatedBy: actorId, updatedAt: new Date() }).where(eq(budget.id, current.id));
      const newBudgetId = newId();
      await tx.insert(budget).values({
        id: newBudgetId,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        fiscalYear: current.fiscalYear,
        costCentreRef: current.costCentreRef,
        projectRef: current.projectRef,
        budgetType: current.budgetType,
        basis: current.basis,
        versionNo: nextVersion,
        status: "active",
      });

      // Every line moves to the new version; the changed ones move at their new amount.
      const oldLines = await tx.select().from(budgetLine).where(eq(budgetLine.budgetId, current.id));
      const changeByHead = new Map(input.changes.map((c) => [c.expenseHeadCode, c.newAnnualAmount]));
      for (const ol of oldLines) {
        const [head] = await tx.select().from(expenseHead).where(eq(expenseHead.id, ol.expenseHeadId)).limit(1);
        const newAmount = changeByHead.get(head?.code ?? "") ?? Number(ol.annualAmount);
        const cells = changeByHead.has(head?.code ?? "") ? evenTwelve(newAmount) : (ol.monthlyDistribution as number[]);
        const newLineId = newId();
        await tx.insert(budgetLine).values({
          id: newLineId,
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          budgetId: newBudgetId,
          expenseHeadId: ol.expenseHeadId,
          annualAmount: newAmount.toFixed(2),
          monthlyDistribution: cells as unknown as object,
          controlAction: ol.controlAction,
          applicableDocs: ol.applicableDocs,
        });
        // The consumption already booked follows the line into the new version — otherwise
        // a revision would silently hand the cost centre its whole budget back.
        const carried = await tx.select().from(budgetConsumption).where(eq(budgetConsumption.budgetLineId, ol.id));
        for (const c of carried) {
          await tx.insert(budgetConsumption).values({
            id: newId(),
            tenantId,
            createdBy: actorId,
            updatedBy: actorId,
            budgetLineId: newLineId,
            period: c.period,
            bucket: c.bucket,
            amount: c.amount,
            docType: c.docType,
            docRef: c.docRef,
            entryType: "flip",
            idempotencyKey: `carry:v${nextVersion}:${c.id}`,
            note: `carried from budget version ${current.versionNo}`,
          });
        }
      }

      await tx.insert(budgetRevision).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        budgetId: newBudgetId,
        fromVersion: current.versionNo,
        toVersion: nextVersion,
        reason: input.reason,
        changedLines: input.changes as unknown as object,
        commitmentConflicts: conflicts as unknown as object,
        acknowledgedBy: conflicts.length > 0 ? actorId : null,
      });
      await this.audit.appendInTx(tx, {
        action: "expenditure.budget.revised",
        entityType: "budget",
        entityId: newBudgetId,
        data: { costCentreRef: input.costCentreRef, fromVersion: current.versionNo, toVersion: nextVersion, reason: input.reason, conflicts: conflicts.length },
      });

      return { costCentreRef: input.costCentreRef, fromVersion: current.versionNo, toVersion: nextVersion, conflicts };
    });
  }

  /* -------------------------------- helpers -------------------------------- */

  /** THE LOCK. Everything else in this service is bookkeeping around this one line. */
  private async lockLine(tx: Tx, costCentreRef: string, headCode: string, fiscalYear: string) {
    const rows = await tx.execute<{ id: string }>(sql`
      select bl.id
        from budget_line bl
        join budget b on b.id = bl.budget_id
        join expense_head h on h.id = bl.expense_head_id
       where b.cost_centre_ref = ${costCentreRef}
         and b.fiscal_year = ${fiscalYear}
         and b.status = 'active'
         and h.code = ${headCode}
       for update of bl
    `);
    const id = rows.rows[0]?.id;
    if (!id) return null;
    return this.loadLine(tx, id);
  }

  private async findLine(tx: Tx, costCentreRef: string, headCode: string, fiscalYear: string) {
    const rows = await tx.execute<{ id: string }>(sql`
      select bl.id from budget_line bl
        join budget b on b.id = bl.budget_id
        join expense_head h on h.id = bl.expense_head_id
       where b.cost_centre_ref = ${costCentreRef} and b.fiscal_year = ${fiscalYear}
         and b.status = 'active' and h.code = ${headCode}
    `);
    const id = rows.rows[0]?.id;
    return id ? this.loadLine(tx, id) : null;
  }

  private async loadLine(tx: Tx, id: string): Promise<{ id: string; spec: BudgetLineSpec }> {
    const [bl] = await tx.select().from(budgetLine).where(eq(budgetLine.id, id)).limit(1);
    const [b] = await tx.select().from(budget).where(eq(budget.id, bl!.budgetId)).limit(1);
    const [h] = await tx.select().from(expenseHead).where(eq(expenseHead.id, bl!.expenseHeadId)).limit(1);
    return {
      id,
      spec: {
        id,
        expenseHeadCode: h!.code,
        annualAmount: Number(bl!.annualAmount),
        monthlyDistribution: (bl!.monthlyDistribution as number[]).map(Number),
        controlAction: bl!.controlAction as BudgetLineSpec["controlAction"],
        basis: b!.basis as BudgetLineSpec["basis"],
      },
    };
  }

  private async entriesInTx(tx: Tx, budgetLineId: string): Promise<ConsumptionEntry[]> {
    const rows = await tx.select().from(budgetConsumption).where(eq(budgetConsumption.budgetLineId, budgetLineId));
    return rows.map((r) => ({
      bucket: r.bucket as ConsumptionEntry["bucket"],
      amount: Number(r.amount),
      period: r.period,
      entryType: r.entryType as ConsumptionEntry["entryType"],
    }));
  }

  private netByLineAndPeriod(rows: Array<{ budgetLineId: string; period: number; amount: string }>): Map<string, number> {
    const m = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.budgetLineId}|${r.period}`;
      m.set(key, Math.round(((m.get(key) ?? 0) + Number(r.amount)) * 100) / 100);
    }
    return m;
  }
}

function evenTwelve(annual: number): number[] {
  const cell = Math.floor((annual / 12) * 100) / 100;
  const cells = Array.from({ length: 12 }, () => cell);
  cells[11] = Math.round((annual - cell * 11) * 100) / 100;
  return cells;
}
