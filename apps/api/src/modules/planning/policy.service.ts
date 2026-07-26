import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  computeLowLevelCodes,
  CircularBomError,
  currentTenant,
  classifyAbc,
  detectPolicyConflicts,
  newId,
  reorderPolicy,
  safetyStockFor,
  whereUsed,
  type BomEdge,
  type PlanningMethod,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";
import { BOM_GRAPH, type BomGraph } from "../../ports/planning-inputs.port.js";

const { itemPlanningPolicy, planCalendar, planHoliday } = schema;

export interface PolicyRow {
  id: string;
  itemId: string;
  itemCode: string;
  lowLevelCode: number;
  planningMethod: string;
  sourceType: string;
  lotRule: string;
  lotSize: string | null;
  leadTimeWorkingDays: number;
  safetyStock: string;
  abcClass: string | null;
  reorderPoint: string | null;
  isMpsItem: boolean;
}

/**
 * PLANNING POLICY — how each item is replenished, and the level it is planned at.
 *
 * The low-level code is the only field here the planner does not choose. It is DERIVED
 * from the whole bill-of-materials graph, and it has to be recomputed whenever the product
 * structure changes, because a component that gains a new parent one level deeper must
 * move down with it. An item planned at the wrong level is netted before its demand
 * exists, and the run silently under-orders — a failure with no error message and no
 * symptom until the line stops.
 */
@Injectable()
export class PlanningPolicyService {
  constructor(
    private readonly audit: AuditLogService,
    @Inject(BOM_GRAPH) private readonly bomGraph: BomGraph,
  ) {}

  async list(): Promise<PolicyRow[]> {
    return withTenant(async (tx) => this.listInTx(tx));
  }

  async listInTx(tx: Tx): Promise<PolicyRow[]> {
    const rows = await tx
      .select()
      .from(itemPlanningPolicy)
      .where(eq(itemPlanningPolicy.isActive, true))
      .orderBy(asc(itemPlanningPolicy.lowLevelCode), asc(itemPlanningPolicy.itemCode));
    return rows.map((r) => ({
      id: r.id,
      itemId: r.itemId,
      itemCode: r.itemCode,
      lowLevelCode: r.lowLevelCode,
      planningMethod: r.planningMethod,
      sourceType: r.sourceType,
      lotRule: r.lotRule,
      lotSize: r.lotSize,
      leadTimeWorkingDays: r.leadTimeWorkingDays,
      safetyStock: r.safetyStock,
      abcClass: r.abcClass,
      reorderPoint: r.reorderPoint,
      isMpsItem: r.isMpsItem,
    }));
  }

  /**
   * Recompute every item's low-level code from the current BOM graph.
   *
   * A circular bill of materials is rejected here rather than at run time, and the cycle is
   * NAMED. "Circular BOM detected" with nothing else forces a planner to bisect a product
   * structure by hand; "PMP-CP50 → CMP-IMP6 → PMP-CP50" is a thirty-second fix.
   */
  async recomputeLowLevelCodes(): Promise<{ updated: number; levels: Record<string, number> }> {
    const edges = await this.bomGraph.activeBomEdges();
    const bomEdges: BomEdge[] = edges.map((e) => ({ parentItemId: e.parentItemId, componentItemId: e.componentItemId }));

    return withTenant(async (tx) => {
      const policies = await this.listInTx(tx);
      let llc: Map<string, number>;
      try {
        llc = computeLowLevelCodes(policies.map((p) => p.itemId), bomEdges);
      } catch (e) {
        if (e instanceof CircularBomError) {
          const codeOf = new Map(policies.map((p) => [p.itemId, p.itemCode]));
          const named = e.cycle.map((id) => codeOf.get(id) ?? id);
          throw new AppError("PLAN_CIRCULAR_BOM", 422, `The bill of materials contains a cycle: ${named.join(" → ")}. Nothing can be planned until it is broken.`);
        }
        throw e;
      }

      const { actorId } = currentTenant();
      const levels: Record<string, number> = {};
      let updated = 0;
      for (const p of policies) {
        const level = llc.get(p.itemId) ?? 0;
        levels[p.itemCode] = level;
        if (level === p.lowLevelCode) continue;
        await tx
          .update(itemPlanningPolicy)
          .set({ lowLevelCode: level, updatedBy: actorId, updatedAt: new Date() })
          .where(eq(itemPlanningPolicy.id, p.id));
        updated += 1;
      }

      if (updated > 0) {
        await this.audit.appendInTx(tx, {
          action: "planning.llc.recomputed",
          entityType: "item_planning_policy",
          entityId: policies[0]?.id ?? newId(),
          data: { updated, levels },
        });
      }
      return { updated, levels };
    });
  }

  /** Every parent that consumes an item, at any depth — the where-used closure. */
  async whereUsed(itemId: string): Promise<{ itemId: string; parents: { itemId: string; itemCode: string }[] }> {
    const edges = await this.bomGraph.activeBomEdges();
    const parents = whereUsed(itemId, edges.map((e) => ({ parentItemId: e.parentItemId, componentItemId: e.componentItemId })));
    return withTenant(async (tx) => {
      const policies = await this.listInTx(tx);
      const codeOf = new Map(policies.map((p) => [p.itemId, p.itemCode]));
      return { itemId, parents: parents.map((id) => ({ itemId: id, itemCode: codeOf.get(id) ?? id })) };
    });
  }

  /**
   * The conflict guard, run across the whole catalogue.
   *
   * The worst conflict — MRP *and* a reorder point on the same item — is refused outright
   * by the database, so it cannot exist in a row written through this system. This still
   * checks for it, because data arrives from Tally imports and spreadsheets too, and the
   * check has to run before the insert that would reject it, not after.
   */
  async conflicts(): Promise<ReturnType<typeof detectPolicyConflicts>> {
    const edges = await this.bomGraph.activeBomEdges();
    const hasBom = new Set(edges.map((e) => e.parentItemId));
    return withTenant(async (tx) => {
      const policies = await this.listInTx(tx);
      return detectPolicyConflicts(
        policies.map((p) => ({
          itemId: p.itemId,
          itemCode: p.itemCode,
          method: p.planningMethod as PlanningMethod,
          hasReorderPoint: p.reorderPoint != null,
          isMrpPlanned: p.planningMethod === "mrp",
          hasBom: hasBom.has(p.itemId),
          safetyStock: Number(p.safetyStock),
          reorderPoint: p.reorderPoint == null ? undefined : Number(p.reorderPoint),
          leadTimeWorkingDays: p.leadTimeWorkingDays,
          abc: (p.abcClass ?? undefined) as "A" | "B" | "C" | undefined,
        })),
      );
    });
  }

  /**
   * Propose a safety stock from demand and lead-time variability.
   *
   * A PROPOSAL. It is never written by this call, because a safety stock is money sitting
   * on a shelf and the decision to spend it belongs to a person (§11.10 — "batch job writes
   * proposals; planner approves").
   */
  async proposeSafetyStock(input: {
    itemId: string;
    meanDemand: number;
    demandStdDev: number;
    meanLeadTime: number;
    leadTimeStdDev: number;
    serviceLevel?: number;
    historyPeriods?: number;
  }): Promise<Record<string, unknown>> {
    return withTenant(async (tx) => {
      const [policy] = await tx.select().from(itemPlanningPolicy).where(eq(itemPlanningPolicy.itemId, input.itemId)).limit(1);
      if (!policy) throw Errors.notFound(`planning policy for item ${input.itemId}`);

      const level = input.serviceLevel ?? Number(policy.serviceLevel ?? 0.95);
      const proposal = safetyStockFor({
        meanDemand: input.meanDemand,
        demandStdDev: input.demandStdDev,
        meanLeadTime: input.meanLeadTime,
        leadTimeStdDev: input.leadTimeStdDev,
        serviceLevel: level,
        historyPeriods: input.historyPeriods,
      });

      const current = Number(policy.safetyStock);
      return {
        itemCode: policy.itemCode,
        currentSafetyStock: current,
        proposedSafetyStock: proposal.safetyStock,
        change: Math.round((proposal.safetyStock - current) * 1000) / 1000,
        ...proposal,
        status: "proposal",
        note: "Not applied. A safety stock is money on a shelf; raising it is a decision, not a calculation.",
      };
    });
  }

  /** The reorder point for a non-MRP item, with the arithmetic shown. */
  async reorderFor(itemId: string, meanDemand: number, leadTimePeriods: number): Promise<ReturnType<typeof reorderPolicy>> {
    return withTenant(async (tx) => {
      const [policy] = await tx.select().from(itemPlanningPolicy).where(eq(itemPlanningPolicy.itemId, itemId)).limit(1);
      if (!policy) throw Errors.notFound(`planning policy for item ${itemId}`);
      return reorderPolicy({
        itemId,
        itemCode: policy.itemCode,
        method: policy.planningMethod as PlanningMethod,
        meanDemand,
        leadTimePeriods,
        safetyStock: Number(policy.safetyStock),
        annualDemand: policy.annualDemand == null ? undefined : Number(policy.annualDemand),
        orderCost: policy.orderCost == null ? undefined : Number(policy.orderCost),
        holdingCost: policy.holdingCost == null ? undefined : Number(policy.holdingCost),
        maxLevel: policy.maxLevel == null ? undefined : Number(policy.maxLevel),
      });
    });
  }

  /** ABC by annual consumption value — Pareto, not quantity. */
  async abcClassification(values: readonly { itemId: string; annualValue: number }[]): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const policies = await this.listInTx(tx);
      const codeOf = new Map(policies.map((p) => [p.itemId, p.itemCode]));
      const rows = classifyAbc(values.map((v) => ({ itemId: v.itemId, itemCode: codeOf.get(v.itemId) ?? v.itemId, annualValue: v.annualValue })));
      return rows.map((r) => ({ ...r }));
    });
  }

  /** The working-day calendar every lead-time offset is walked over. */
  async calendar(): Promise<{ workingDays: number[]; holidays: string[]; code: string }> {
    return withTenant(async (tx) => {
      const [cal] = await tx.select().from(planCalendar).where(eq(planCalendar.isDefault, true)).limit(1);
      if (!cal) {
        // A tenant with no calendar would otherwise silently plan on a seven-day week and
        // promise the plant a day it never works.
        throw new AppError("PLAN_NO_CALENDAR", 422, "No default planning calendar is configured. Every lead time is offset over it, so planning cannot run without one.");
      }
      const holidays = await tx.select().from(planHoliday).where(eq(planHoliday.calendarId, cal.id)).orderBy(asc(planHoliday.holidayDate));
      return {
        code: cal.code,
        workingDays: (cal.workingDays as number[]) ?? [1, 2, 3, 4, 5, 6],
        holidays: holidays.map((h) => h.holidayDate),
      };
    });
  }
}
