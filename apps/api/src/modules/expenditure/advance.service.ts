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
@Injectable()
export class AdvanceService {
  constructor(
    private readonly audit: AuditLogService,
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
}
