import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  ageAdvances,
  advanceBalance,
  canRequestAdvance,
  currentTenant,
  eventName,
  fiscalYearOf,
  isOverdue,
  newId,
  perDiemEntitlement,
  type AdvanceState,
  type CityTier,
  type PerDiemRate,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { DocumentEditService } from "../../common/document-edit.service.js";
import { ExpNumberingService } from "./exp-numbering.service.js";

const { cashAdvance, advanceSettlement, travelRequest, perDiemRate, outboxEvent } = schema;

/**
 * CASH ADVANCES AND TRAVEL.
 *
 * This service owns the module's **one hard refusal**. Everything else here flags and lets
 * a human decide; a new advance while an old one is unsettled past its date is blocked,
 * because cash already handed out and not accounted for is the company's money sitting
 * somewhere unexplained. It is overridable with a recorded reason — but the default is no,
 * and that default is the whole control.
 *
 * Per-diem is resolved **as of the trip date**, and the exact rate row is stamped on the
 * travel request. A rate revised in October must not restate a July trip, and an employee
 * promoted in September must be paid the grade they held when they travelled.
 */
/** A correction to a cash advance. Absent means "leave alone". */
export interface EditAdvanceInput {
  purpose?: string;
  amount?: number;
  neededBy?: string;
  settleBy?: string;
  reason?: string;
}

/** A correction to a travel request. Absent means "leave alone". */
export interface EditTravelInput {
  purpose?: string;
  fromCity?: string;
  toCity?: string;
  fromDate?: string;
  toDate?: string;
  modeOfTravel?: string;
  estCost?: number;
  reason?: string;
}
@Injectable()
export class AdvanceService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly edits: DocumentEditService,
    private readonly numbering: ExpNumberingService,
  ) {}

  /* -------------------------------- advances ------------------------------- */

  async request(input: {
    employeeRef: string;
    purpose: string;
    amount: number;
    settleBy: string;
    neededBy?: string;
    travelNo?: string;
    asOf?: string;
    hasOverridePermission?: boolean;
    overrideReason?: string;
  }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);

    return withTenant(async (tx) => {
      const existing = await this.statesFor(tx, input.employeeRef);
      const gate = canRequestAdvance(existing, asOf, {
        hasOverridePermission: input.hasOverridePermission,
        overrideReason: input.overrideReason,
      });
      if (!gate.allowed) {
        throw new AppError("ADVANCE_OVERDUE_BLOCK", 422, gate.reason, gate.blockingAdvances.map((a) => ({ field: "advanceNo", message: a })));
      }

      const id = newId();
      const advanceNo = await this.numbering.next(tx, "advance", fiscalYearOf(asOf));
      const [trip] = input.travelNo
        ? await tx.select().from(travelRequest).where(eq(travelRequest.travelNo, input.travelNo)).limit(1)
        : [null];

      await tx.insert(cashAdvance).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        advanceNo,
        employeeRef: input.employeeRef,
        purpose: input.purpose,
        amount: input.amount.toFixed(2),
        neededBy: input.neededBy ?? null,
        settleBy: input.settleBy,
        travelRequestId: trip?.id ?? null,
        status: "requested",
      });
      if (trip) await tx.update(travelRequest).set({ advanceId: id, updatedBy: actorId }).where(eq(travelRequest.id, trip.id));

      await this.audit.appendInTx(tx, {
        action: "expenditure.advance.requested",
        entityType: "cash_advance",
        entityId: id,
        data: { advanceNo, amount: input.amount, settleBy: input.settleBy, overridden: gate.overridden },
      });
      return { ...(await this.viewInTx(tx, id)), gate };
    });
  }

  async disburse(advanceNo: string, opts: { amount?: number; at?: string } = {}): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const a = await this.byNoInTx(tx, advanceNo);
      const at = opts.at ? new Date(opts.at) : new Date();
      const amount = opts.amount ?? Number(a.amount);
      if (amount > Number(a.amount)) {
        throw new AppError("ADVANCE_OVERPAY", 422, `Cannot pay ₹${amount} against an advance of ₹${a.amount}.`);
      }
      await tx
        .update(cashAdvance)
        .set({ paidAmount: amount.toFixed(2), status: "disbursed", disbursedAt: at, updatedBy: actorId, updatedAt: at })
        .where(eq(cashAdvance.id, a.id));
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("expenditure", "advance", "disbursed"),
        payload: { advanceNo, employeeRef: a.employeeRef, amount, settleBy: a.settleBy },
        createdAt: at,
      });
      return this.viewInTx(tx, a.id);
    });
  }

  /** Record the employee's refund of an over-advance. Until this lands the advance stays
   *  partially settled — which is what keeps it on the ageing report and on the block. */
  async refund(advanceNo: string, amount: number, at?: string): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const a = await this.byNoInTx(tx, advanceNo);
      const when = at ? new Date(at) : new Date();
      const outstanding = advanceBalance(this.toState(a));
      if (amount > outstanding + 0.001) {
        throw new AppError("ADVANCE_REFUND_EXCEEDS", 422, `₹${amount} is more than the ₹${outstanding} outstanding on ${advanceNo}.`);
      }
      await tx.insert(advanceSettlement).values({
        id: newId(),
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        advanceId: a.id,
        settlementType: "refund",
        amount: amount.toFixed(2),
        settledAt: when,
        note: "refund received from the employee",
      });
      const refunded = Number(a.refundedAmount) + amount;
      const stillOut = Math.round((outstanding - amount) * 100) / 100;
      await tx
        .update(cashAdvance)
        .set({ refundedAmount: refunded.toFixed(2), status: stillOut <= 0 ? "settled" : "partially_settled", updatedBy: actorId, updatedAt: when })
        .where(eq(cashAdvance.id, a.id));
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId,
        name: eventName("expenditure", "advance", "settled"),
        payload: { advanceNo, refunded: amount, outstanding: stillOut },
        createdAt: when,
      });
      return this.viewInTx(tx, a.id);
    });
  }

  /** The ageing report the block is computed from. */
  async aging(asOf?: string): Promise<Record<string, unknown>> {
    const when = asOf ?? new Date().toISOString().slice(0, 10);
    return withTenant(async (tx) => {
      const rows = await tx.select().from(cashAdvance);
      const states = rows.map((r) => this.toState(r));
      return {
        asOf: when,
        buckets: ageAdvances(states, when),
        overdue: states
          .filter((s) => isOverdue(s, when))
          .map((s) => ({ advanceNo: s.advanceNo, outstanding: advanceBalance(s), settleBy: s.settleBy })),
        totalOutstanding:
          Math.round(states.reduce((a, s) => a + Math.max(0, advanceBalance(s)), 0) * 100) / 100,
      };
    });
  }

  /* --------------------------------- travel -------------------------------- */

  async createTravel(input: {
    employeeRef: string;
    gradeCode: string;
    costCentreRef: string;
    purpose: string;
    fromCity: string;
    toCity: string;
    cityTier: CityTier;
    fromDate: string;
    toDate: string;
    modeOfTravel?: string;
    estCost?: number;
  }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    return withTenant(async (tx) => {
      const rates = await this.ratesInTx(tx);
      const entitlement = perDiemEntitlement(rates, { gradeCode: input.gradeCode, cityTier: input.cityTier }, input.fromDate, input.toDate);
      if (!entitlement) {
        throw Errors.notFound(`per-diem rate for grade ${input.gradeCode}, tier ${input.cityTier}, effective ${input.fromDate}`);
      }

      const id = newId();
      const travelNo = await this.numbering.next(tx, "travel", fiscalYearOf(input.fromDate));
      await tx.insert(travelRequest).values({
        id,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        travelNo,
        employeeRef: input.employeeRef,
        costCentreRef: input.costCentreRef,
        purpose: input.purpose,
        fromCity: input.fromCity,
        toCity: input.toCity,
        cityTier: input.cityTier,
        fromDate: input.fromDate,
        toDate: input.toDate,
        modeOfTravel: input.modeOfTravel ?? null,
        estCost: (input.estCost ?? 0).toFixed(2),
        perDiemAmount: entitlement.entitlement.toFixed(2),
        // The exact effective-dated row, stamped on the document. Without it the number
        // cannot be reproduced once the rate is revised, which is the point of dating it.
        perDiemRateRef: entitlement.rateRef,
        status: "draft",
      });
      return {
        travelNo,
        employeeRef: input.employeeRef,
        route: `${input.fromCity} → ${input.toCity}`,
        days: entitlement.days,
        dailyRate: entitlement.dailyRate,
        perDiemAmount: entitlement.entitlement,
        perDiemRateRef: entitlement.rateRef,
        estCost: input.estCost ?? 0,
        status: "draft",
      };
    });
  }

  async approveTravel(travelNo: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [t] = await tx.select().from(travelRequest).where(eq(travelRequest.travelNo, travelNo)).limit(1);
      if (!t) throw Errors.notFound(`travel request ${travelNo}`);
      await tx.update(travelRequest).set({ status: "approved", updatedBy: actorId, updatedAt: new Date() }).where(eq(travelRequest.id, t.id));
      return { travelNo, status: "approved", perDiemAmount: Number(t.perDiemAmount), perDiemRateRef: t.perDiemRateRef };
    });
  }

  /* -------------------------------- helpers -------------------------------- */

  private async byNoInTx(tx: Tx, advanceNo: string) {
    const [a] = await tx.select().from(cashAdvance).where(eq(cashAdvance.advanceNo, advanceNo)).limit(1);
    if (!a) throw Errors.notFound(`advance ${advanceNo}`);
    return a;
  }

  private toState(a: typeof cashAdvance.$inferSelect): AdvanceState {
    return {
      advanceNo: a.advanceNo,
      amount: Number(a.amount),
      paidAmount: Number(a.paidAmount),
      settledAmount: Number(a.settledAmount),
      refundedAmount: Number(a.refundedAmount),
      settleBy: a.settleBy,
      status: a.status as AdvanceState["status"],
    };
  }

  private async statesFor(tx: Tx, employeeRef: string): Promise<AdvanceState[]> {
    const rows = await tx.select().from(cashAdvance).where(eq(cashAdvance.employeeRef, employeeRef));
    return rows.map((r) => this.toState(r));
  }

  private async ratesInTx(tx: Tx): Promise<PerDiemRate[]> {
    const rows = await tx.select().from(perDiemRate);
    return rows.map((r) => ({
      gradeCode: r.gradeCode,
      cityTier: r.cityTier as CityTier,
      tripType: r.tripType as "domestic" | "international",
      dailyRate: Number(r.dailyRate),
      lodgingRate: r.lodgingRate == null ? null : Number(r.lodgingRate),
      mealsRate: r.mealsRate == null ? null : Number(r.mealsRate),
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    }));
  }

  private async viewInTx(tx: Tx, id: string): Promise<Record<string, unknown>> {
    const [a] = await tx.select().from(cashAdvance).where(eq(cashAdvance.id, id)).limit(1);
    const settlements = await tx.select().from(advanceSettlement).where(eq(advanceSettlement.advanceId, id));
    return {
      advanceNo: a!.advanceNo,
      employeeRef: a!.employeeRef,
      purpose: a!.purpose,
      amount: Number(a!.amount),
      paidAmount: Number(a!.paidAmount),
      settledAmount: Number(a!.settledAmount),
      refundedAmount: Number(a!.refundedAmount),
      balance: Number(a!.balance ?? 0),
      settleBy: a!.settleBy,
      status: a!.status,
      settlements: settlements.map((s) => ({ type: s.settlementType, amount: Number(s.amount), at: s.settledAt.toISOString(), note: s.note })),
    };
  }
  /* ------------------------------ corrections ----------------------------- */

  private static readonly EDITABLE_ADVANCE_FIELDS = ["purpose", "amount", "neededBy", "settleBy"] as const;
  private static readonly EDITABLE_TRAVEL_FIELDS = [
    "purpose",
    "fromCity",
    "toCity",
    "fromDate",
    "toDate",
    "modeOfTravel",
    "estCost",
  ] as const;

  /**
   * Correct a cash advance before it is paid out.
   *
   * Once DISBURSED the money has left the account and the refusal says so — the correction
   * is a refund or a reversing entry, both of which leave the disbursement standing as the
   * record of what was actually paid on the day.
   */
  /** By NUMBER — every other route in this module is keyed that way, so these match. */
  async editAdvanceByNo(advanceNo: string, input: Parameters<AdvanceService["editAdvance"]>[1]) {
    const id = await withTenant(async (tx) => (await this.byNoInTx(tx, advanceNo)).id);
    return this.editAdvance(id, input);
  }

  async editAdvancePolicyByNo(advanceNo: string) {
    const id = await withTenant(async (tx) => (await this.byNoInTx(tx, advanceNo)).id);
    return this.advanceEditPolicy(id);
  }

  async editAdvance(advanceId: string, input: EditAdvanceInput) {
    this.edits.requireDocumentId(advanceId, "advance");
    return withTenant(async (tx) => {
      await this.edits.lock(tx, "cash_advance", advanceId);
      const [before] = await tx.select().from(cashAdvance).where(eq(cashAdvance.id, advanceId)).limit(1);
      if (!before) throw Errors.notFound(`advance '${advanceId}'`);

      const patch: Record<string, unknown> = {};
      if (input.purpose !== undefined) patch.purpose = input.purpose;
      if (input.amount !== undefined) {
        if (input.amount <= 0) throw Errors.validation([{ field: "amount", message: "must be > 0" }]);
        patch.amount = input.amount.toFixed(2);
      }
      if (input.neededBy !== undefined) patch.neededBy = input.neededBy;
      if (input.settleBy !== undefined) patch.settleBy = input.settleBy;

      const outcome = await this.edits.apply(tx, {
        docType: "expenditure.advance",
        id: advanceId,
        before: before as unknown as Record<string, unknown>,
        status: before.status,
        patch,
        editableFields: AdvanceService.EDITABLE_ADVANCE_FIELDS,
        reason: input.reason,
      });

      if (!outcome.changed) return before;

      const columns: Record<string, unknown> = { ...outcome.columns };
      // An approved advance whose AMOUNT changed is a different commitment; it goes back.
      if (outcome.reapprovalRequired && before.status === "approved" && input.amount !== undefined) {
        columns.status = "requested";
        columns.workflowInstanceId = null;
      }
      // The outstanding balance is a function of the amount, so it must move with it. An
      // advance is only editable while `requested` or `approved`, so nothing has been paid
      // or settled against it yet and the balance is simply the amount — but it is computed
      // from the components rather than assumed, so this stays correct if the policy ever
      // opens a later state.
      if (input.amount !== undefined) {
        const settled = Number(before.settledAmount ?? 0);
        const refunded = Number(before.refundedAmount ?? 0);
        columns.balance = (input.amount - settled - refunded).toFixed(2);
      }

      await tx.update(cashAdvance).set(columns).where(eq(cashAdvance.id, advanceId));
      const [after] = await tx.select().from(cashAdvance).where(eq(cashAdvance.id, advanceId)).limit(1);
      return after;
    });
  }

  /** Travel requests are keyed by number on every other route too. */
  async editTravelByNo(travelNo: string, input: EditTravelInput) {
    const id = await withTenant(async (tx) => {
      const [row] = await tx
        .select({ id: travelRequest.id })
        .from(travelRequest)
        .where(eq(travelRequest.travelNo, travelNo))
        .limit(1);
      if (!row) throw Errors.notFound(`travel request '${travelNo}'`);
      return row.id;
    });
    return this.editTravel(id, input);
  }

  async editTravelPolicyByNo(travelNo: string) {
    const id = await withTenant(async (tx) => {
      const [row] = await tx
        .select({ id: travelRequest.id })
        .from(travelRequest)
        .where(eq(travelRequest.travelNo, travelNo))
        .limit(1);
      if (!row) throw Errors.notFound(`travel request '${travelNo}'`);
      return row.id;
    });
    return this.travelEditPolicy(id);
  }

  /** Correct or amend a travel request. */
  async editTravel(travelId: string, input: EditTravelInput) {
    this.edits.requireDocumentId(travelId, "travel request");
    return withTenant(async (tx) => {
      await this.edits.lock(tx, "travel_request", travelId);
      const [before] = await tx.select().from(travelRequest).where(eq(travelRequest.id, travelId)).limit(1);
      if (!before) throw Errors.notFound(`travel request '${travelId}'`);

      const patch: Record<string, unknown> = {};
      if (input.purpose !== undefined) patch.purpose = input.purpose;
      if (input.fromCity !== undefined) patch.fromCity = input.fromCity;
      if (input.toCity !== undefined) patch.toCity = input.toCity;
      if (input.fromDate !== undefined) patch.fromDate = input.fromDate;
      if (input.toDate !== undefined) patch.toDate = input.toDate;
      if (input.modeOfTravel !== undefined) patch.modeOfTravel = input.modeOfTravel;
      if (input.estCost !== undefined) patch.estCost = input.estCost.toFixed(2);

      const fromDate = input.fromDate ?? before.fromDate;
      const toDate = input.toDate ?? before.toDate;
      if (toDate < fromDate) {
        throw Errors.validation([{ field: "toDate", message: "a trip cannot end before it starts" }]);
      }

      const outcome = await this.edits.apply(tx, {
        docType: "expenditure.travel",
        id: travelId,
        before: before as unknown as Record<string, unknown>,
        status: before.status,
        patch,
        editableFields: AdvanceService.EDITABLE_TRAVEL_FIELDS,
        reason: input.reason,
      });

      if (!outcome.changed) return before;

      const columns: Record<string, unknown> = { ...outcome.columns };
      if (outcome.reapprovalRequired && ["submitted", "approved"].includes(before.status)) {
        columns.status = "draft";
        columns.workflowInstanceId = null;
      }

      await tx.update(travelRequest).set(columns).where(eq(travelRequest.id, travelId));
      const [after] = await tx.select().from(travelRequest).where(eq(travelRequest.id, travelId)).limit(1);
      return after;
    });
  }

  /** Every correction ever made to this advance / travel request, newest first. */
  async advanceHistory(advanceId: string) {
    return this.edits.history("expenditure.advance", advanceId);
  }
  async travelHistory(travelId: string) {
    return this.edits.history("expenditure.travel", travelId);
  }

  async advanceEditPolicy(advanceId: string) {
    this.edits.requireDocumentId(advanceId, "advance");
    const [row] = await withTenant((tx) =>
      tx.select({ status: cashAdvance.status, revisionNo: cashAdvance.revisionNo })
        .from(cashAdvance).where(eq(cashAdvance.id, advanceId)).limit(1),
    );
    if (!row) throw Errors.notFound(`advance '${advanceId}'`);
    return { ...this.edits.policy("expenditure.advance", row.status), status: row.status, revisionNo: row.revisionNo };
  }

  async travelEditPolicy(travelId: string) {
    this.edits.requireDocumentId(travelId, "travel request");
    const [row] = await withTenant((tx) =>
      tx.select({ status: travelRequest.status, revisionNo: travelRequest.revisionNo })
        .from(travelRequest).where(eq(travelRequest.id, travelId)).limit(1),
    );
    if (!row) throw Errors.notFound(`travel request '${travelId}'`);
    return { ...this.edits.policy("expenditure.travel", row.status), status: row.status, revisionNo: row.revisionNo };
  }

}
