import { Injectable } from "@nestjs/common";
import { asc, desc, eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  bucketStart,
  compareRules,
  currentTenant,
  newId,
  scheduleOperations,
  type DispatchRule,
  type PlanCalendar,
  type SchedulableOp,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { PlanNumberingService } from "./plan-numbering.service.js";
import { PlanningPolicyService } from "./policy.service.js";

const { mrpRun, plannedOrder, planSchedule, planScheduleOp, planRoutingOperation, planWorkCentre } = schema;

/**
 * THE SCHEDULE BOARD (tier-1 finite scheduling).
 *
 * MRP says what to make and roughly which week. It does not say which machine, in what
 * order, or whether the week's work physically fits. This does — by simulating a
 * per-machine timeline and picking the next operation by a stated priority rule.
 *
 * It is a HEURISTIC and it is labelled as one everywhere it surfaces. The constraint
 * solver is Phase 3. What ships is the thing planners actually recognise: schedule by
 * earliest due date, and show me what slips.
 *
 * **It never auto-publishes.** A run produces a draft; a manager approves it, by name, and
 * only then does it become the shop's dispatch list. The database enforces that a published
 * schedule carries an approver — a schedule that publishes itself is a machine deciding
 * what a plant works on tonight.
 */
@Injectable()
export class PlanScheduleService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly numbering: PlanNumberingService,
    private readonly policies: PlanningPolicyService,
  ) {}

  /**
   * Build a scheduling proposal from a run's planned MAKE orders.
   *
   * Buy orders are excluded: nothing on the shop floor happens to a purchase order, and
   * loading it onto a machine timeline would be a fiction that makes the board look busier
   * and the plant look worse than it is.
   */
  async propose(input: { runNo?: string; rule?: DispatchRule; hoursPerDay?: number }): Promise<Record<string, unknown>> {
    const rule = input.rule ?? "EDD";
    const hoursPerDay = input.hoursPerDay ?? 8;
    const cal = await this.policies.calendar();
    const calendar: PlanCalendar = { workingDays: cal.workingDays, holidays: cal.holidays };
    const { tenantId, actorId } = currentTenant();

    return withTenant(async (tx) => {
      const run = input.runNo ? await this.runByNo(tx, input.runNo) : await this.latestRun(tx);
      const orders = await tx
        .select()
        .from(plannedOrder)
        .where(eq(plannedOrder.runId, run.id))
        .orderBy(asc(plannedOrder.releaseBucket));
      const makeOrders = orders.filter((o) => o.sourceType === "make" && o.status !== "cancelled");
      if (makeOrders.length === 0) {
        throw new AppError("PLAN_NOTHING_TO_SCHEDULE", 422, `${run.runNo} produced no make orders — there is nothing for the shop floor to sequence.`);
      }

      const routings = await tx.select().from(planRoutingOperation).where(eq(planRoutingOperation.isActive, true));
      const centres = await tx.select().from(planWorkCentre).where(eq(planWorkCentre.isActive, true));
      const centreOf = new Map(centres.map((c) => [c.id, c]));

      const ops: SchedulableOp[] = [];
      const withoutRouting: string[] = [];
      for (const o of makeOrders) {
        const mine = routings.filter((r) => r.itemId === o.itemId).sort((a, b) => a.operationSeq - b.operationSeq);
        if (mine.length === 0) {
          // An item with no routing cannot be sequenced. Silently dropping it makes the
          // board look feasible while a real operation is missing from it.
          withoutRouting.push(o.itemCode);
          continue;
        }
        for (const r of mine) {
          const wc = centreOf.get(r.workCentreId);
          ops.push({
            orderRef: o.orderKey,
            itemCode: o.itemCode,
            seq: r.operationSeq,
            workCentreId: r.workCentreId,
            workCentreCode: wc?.code ?? r.workCentreId,
            hours: Number(r.setupHours) + Number(r.runHoursPerUnit) * Number(o.qty),
            dueDate: o.needDate,
            earliestStart: o.releaseDate,
          });
        }
      }

      if (ops.length === 0) {
        throw new AppError("PLAN_NO_ROUTINGS", 422, `None of the ${makeOrders.length} make order(s) has a routing. Capacity and sequencing need one operation to schedule.`);
      }

      const result = scheduleOperations(ops, { rule, today: bucketStart(run.firstBucket), hoursPerDay, calendar });
      const comparison = compareRules(ops, { today: bucketStart(run.firstBucket), hoursPerDay, calendar });

      const scheduleId = newId();
      const scheduleNo = await this.numbering.next(tx, "schedule", fiscalYearOf(run.planningDate));
      await tx.insert(planSchedule).values({
        id: scheduleId,
        tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        scheduleNo,
        rule,
        planningDate: run.planningDate,
        status: "draft",
        lateOrderCount: result.lateOrderCount,
        totalTardinessDays: result.totalTardinessDays,
        makespanDays: result.makespanDays,
        note: result.note,
      });

      await tx.insert(planScheduleOp).values(
        result.operations.map((o) => ({
          id: newId(),
          tenantId,
          createdBy: actorId,
          updatedBy: actorId,
          scheduleId,
          orderRef: o.orderRef,
          itemCode: o.itemCode,
          operationSeq: o.seq,
          workCentreId: o.workCentreId,
          workCentreCode: o.workCentreCode,
          hours: o.hours.toFixed(2),
          dueDate: o.dueDate,
          startDate: o.startDate,
          endDate: o.endDate,
          startHourOfDay: o.startHourOfDay.toFixed(2),
          endHourOfDay: o.endHourOfDay.toFixed(2),
          daysLate: o.daysLate,
          isLocked: Boolean(o.locked),
        })),
      );

      await this.audit.appendInTx(tx, {
        action: "planning.schedule.proposed",
        entityType: "plan_schedule",
        entityId: scheduleId,
        data: { scheduleNo, rule, operations: result.operations.length, lateOrderCount: result.lateOrderCount },
      });

      return {
        scheduleNo,
        runNo: run.runNo,
        rule,
        status: "draft",
        operationCount: result.operations.length,
        lateOrderCount: result.lateOrderCount,
        totalTardinessDays: result.totalTardinessDays,
        makespanDays: result.makespanDays,
        note: result.note,
        orders: result.orders,
        operations: result.operations,
        // Both rules, side by side: a rule is not better in the abstract, it is better at
        // something, and a planner should pick with their eyes open.
        ruleComparison: comparison,
        itemsWithoutRouting: withoutRouting,
        warning:
          withoutRouting.length > 0
            ? `${withoutRouting.length} item(s) have no routing and are missing from this board: ${withoutRouting.join(", ")}. The schedule is more optimistic than the plant.`
            : null,
      };
    });
  }

  /**
   * Publish a draft — the only way a proposal becomes the shop's dispatch list.
   *
   * The approver's name is required by the database, not just by this method. A schedule
   * that could publish itself would be a heuristic deciding what a plant works on tonight.
   */
  async publish(scheduleNo: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [sched] = await tx.select().from(planSchedule).where(eq(planSchedule.scheduleNo, scheduleNo)).limit(1);
      if (!sched) throw new AppError("PLAN_SCHEDULE_NOT_FOUND", 404, `Schedule ${scheduleNo} does not exist.`);
      if (sched.status === "published") {
        return { scheduleNo, status: "published", replay: true, message: "Already published." };
      }
      if (sched.status === "superseded") {
        throw new AppError("PLAN_SCHEDULE_SUPERSEDED", 409, `${scheduleNo} was superseded by a later proposal.`);
      }

      // Publishing supersedes whatever the shop was working to.
      const previous = await tx.select().from(planSchedule).where(eq(planSchedule.status, "published"));
      for (const p of previous) {
        await tx.update(planSchedule).set({ status: "superseded", updatedBy: actorId, updatedAt: new Date() }).where(eq(planSchedule.id, p.id));
      }

      await tx
        .update(planSchedule)
        .set({ status: "published", approvedBy: actorId, approvedAt: new Date(), updatedBy: actorId, updatedAt: new Date() })
        .where(eq(planSchedule.id, sched.id));

      await this.audit.appendInTx(tx, {
        action: "planning.schedule.published",
        entityType: "plan_schedule",
        entityId: sched.id,
        data: { scheduleNo, rule: sched.rule, supersededCount: previous.length },
      });

      return {
        scheduleNo,
        status: "published",
        replay: false,
        supersededCount: previous.length,
        message: `${scheduleNo} is now the shop's dispatch list. ${previous.length} earlier schedule(s) superseded.`,
      };
    });
  }

  async get(scheduleNo: string): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const [sched] = await tx.select().from(planSchedule).where(eq(planSchedule.scheduleNo, scheduleNo)).limit(1);
      if (!sched) throw new AppError("PLAN_SCHEDULE_NOT_FOUND", 404, `Schedule ${scheduleNo} does not exist.`);
      const ops = await tx
        .select()
        .from(planScheduleOp)
        .where(eq(planScheduleOp.scheduleId, sched.id))
        .orderBy(asc(planScheduleOp.startDate), asc(planScheduleOp.startHourOfDay));
      return { ...sched, operations: ops.map((o) => ({ ...o })) };
    });
  }

  private async runByNo(tx: Tx, runNo: string) {
    const [run] = await tx.select().from(mrpRun).where(eq(mrpRun.runNo, runNo)).limit(1);
    if (!run) throw new AppError("PLAN_RUN_NOT_FOUND", 404, `Planning run ${runNo} does not exist.`);
    return run;
  }

  private async latestRun(tx: Tx) {
    const [run] = await tx.select().from(mrpRun).orderBy(desc(mrpRun.createdAt)).limit(1);
    if (!run) throw new AppError("PLAN_NO_RUN", 404, "No planning run exists yet — there is nothing to schedule.");
    return run;
  }
}

function fiscalYearOf(dateISO: string): string {
  const y = Number(dateISO.slice(0, 4));
  const m = Number(dateISO.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(2)}${String(start + 1).slice(2)}`;
}
