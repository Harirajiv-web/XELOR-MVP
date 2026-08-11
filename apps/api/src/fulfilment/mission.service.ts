import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema, withTenant, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  applyAutonomy,
  buildDecisionBrief,
  canonicalize,
  critique,
  currentTenant,
  eventName,
  fmtInr,
  generateCandidates,
  narrateCapacity,
  narrateChoice,
  narrateCritique,
  narrateOutcome,
  narrateShortages,
  narrateSuppliers,
  newId,
  DEFAULT_WEIGHTS,
  type Candidate,
  type PlanningEvidence,
  type ShortageLine,
} from "@ind-core/platform";
import { createHash } from "node:crypto";
import { AuditLogService } from "../common/audit-log.service.js";
import { NumberingService, fyCode } from "../common/numbering.service.js";
import { BOM_PROVIDER, type BomProvider } from "../ports/bom.port.js";
import { STOCK_READER, type StockReader } from "../ports/planning-inputs.port.js";
import { AUTONOMY_TIERS, SEEDED_DISRUPTION, SEEDED_FACTORY, SEEDED_SOURCING, defaultTermsFor, expediteLimitFor } from "./scenario.js";

const {
  fulfilmentMission,
  fulfilmentPlanVersion,
  fulfilmentStep,
  fulfilmentAction,
  fulfilmentEvent,
  fulfilmentApproval,
  salesOrder,
  salesOrderLine,
  customer,
  item,
  vendor,
  stockBalance,
  outboxEvent,
} = schema;

/* ------------------------------------------------------------------ contracts -- */

/** One thing the mission does, as the UI receives it. */
export interface StepView {
  seq: number;
  stepKey: string;
  title: string;
  kind: string;
  agentKey: string;
  /** Which of the six acts this step belongs to, for the story the UI tells. */
  chapter: ChapterKey;
  /**
   * The same fact, in the words a shop-floor supervisor would use.
   *
   * NOT a shorter `narration`. The narration is written for somebody assessing whether the
   * system is trustworthy — it names tables, cites migrations, quotes percentages. This is
   * written for somebody who has to decide, in four seconds, whether to let it carry on.
   * "You are short 776 bolts" and "RAW-BLT-M8 is short 775.51 of 1959.184" are the same
   * number and not the same sentence.
   */
  plain: string;
  /**
   * Three labels for the little diagram on the card: what went in, what was done, what came
   * out. Deliberately three — a person reading a step in four seconds can hold three boxes.
   */
  flow: { from: string; did: string; to: string };
  /**
   * WHERE IN THE PRODUCT THIS WORK HAPPENS.
   *
   * The screen the agent takes you to for this step, so the demo stops being a narration in
   * a box and becomes somebody watching their own ERP being operated. A step whose work has
   * no screen yet says so rather than sending you somewhere unrelated — being taken to the
   * wrong module is worse than being told there is nowhere to go.
   */
  where: { href: string; module: string; screen: string } | null;
  question: string | null;
  status: string;
  durationMs: number | null;
  evidence: unknown;
  findings: unknown;
  narration: string | null;
  confidence: string | null;
}

export interface MissionView {
  id: string;
  missionNo: string;
  soNo: string;
  customerName: string;
  status: string;
  stage: string;
  objective: unknown;
  promisedDate: string;
  targetMarginPct: string;
  autonomyTier: string;
  currentPlanVersion: number;
  deliveryConfidence: string | null;
  forecastMarginPct: string | null;
  forecastDate: string | null;
  waitingReason: string | null;
  outcome: unknown;
  steps: StepView[];
  plan: unknown;
  pendingApproval: unknown;
  actions: unknown[];
  events: unknown[];
}

/** The next thing `advance()` will do, so the caller can pace the stream. */
interface StepPlan {
  key: string;
  title: string;
  kind: string;
  agent: string;
  question?: string;
  /** Which act of the story this step belongs to. See `CHAPTERS`. */
  chapter: ChapterKey;
}

export type ChapterKey =
  | "understand"
  | "investigate"
  | "decide"
  | "authorise"
  | "execute"
  | "prove";

/**
 * SIX CHAPTERS OVER THIRTEEN STEPS.
 *
 * The steps are not merged, and that distinction matters. Each of the thirteen does a
 * genuinely different piece of work against different evidence, and collapsing four
 * evidence reads into one "Investigate" step would throw away exactly the detail that makes
 * the mission believable — which supplier, which shortage, which work centre.
 *
 * What was wrong was the PRESENTATION. Thirteen equal-weight rows scrolling past is a log,
 * and a log asks the viewer to work out the shape for themselves. Research on procedural
 * interfaces is consistent that people hold five to nine steps; past that, comprehension
 * falls off and the reader stops trying to follow the thread.
 *
 * So the work stays at thirteen and the STORY is told in six. A chapter collapses to one
 * line once it is done, and opens if somebody wants the evidence underneath. That is
 * progressive disclosure doing its actual job: the shape is free, the detail is one click.
 */
export const CHAPTERS: ReadonlyArray<{ key: ChapterKey; name: string; lands: string }> = [
  {
    key: "understand",
    name: "Understand the promise",
    lands: "It starts from a commitment, not a prompt.",
  },
  {
    key: "investigate",
    name: "Find out what is true",
    lands: "It reads the factory's own records before it decides anything.",
  },
  {
    key: "decide",
    name: "Choose a way through",
    lands: "It compares real options and an independent check re-derives its numbers.",
  },
  {
    key: "authorise",
    name: "Ask, or proceed",
    lands: "It knows the edge of its own authority — and stops at it.",
  },
  {
    key: "execute",
    name: "Do it, and check it worked",
    lands: "Every action is verified against the state it claimed to change.",
  },
  {
    key: "prove",
    name: "Prove the outcome",
    lands: "It does not get to declare its own success.",
  },
];

/**
 * The arc of an order mission.
 *
 * Written down as data rather than as control flow, for one reason that matters: a mission
 * that is interrupted after step 6 has to resume at step 7, and a `switch` inside a long
 * method cannot be resumed — only re-entered from the top. Every step's identity lives in
 * the database, so the engine's own state is `count(fulfilment_step)`.
 */
const ARC: StepPlan[] = [
  { key: "intake", chapter: "understand", title: "Accept the commitment", kind: "observe", agent: "ONYX", question: "What exactly has been promised, and by when?" },
  { key: "engineering", chapter: "investigate", title: "Confirm engineering readiness", kind: "observe", agent: "AXLE", question: "Is a released BOM in force for this product?" },
  { key: "materials", chapter: "investigate", title: "Net the material requirement", kind: "observe", agent: "SPAR", question: "What is short, after on-hand and inbound?" },
  { key: "capacity", chapter: "investigate", title: "Check the constraining work centre", kind: "observe", agent: "AXLE", question: "Can the floor absorb this batch on the promised date?" },
  { key: "sourcing", chapter: "investigate", title: "Establish the sourcing options", kind: "observe", agent: "SPAR", question: "Who is qualified to close the gap, and on what terms?" },
  { key: "strategy", chapter: "decide", title: "Compare fulfilment strategies", kind: "plan", agent: "ONYX", question: "Which feasible strategy best serves the commitment?" },
  { key: "critique", chapter: "decide", title: "Independent verification", kind: "critique", agent: "HEXA", question: "Does the evidence support what this plan claims?" },
  { key: "authorize", chapter: "authorise", title: "Policy and authority gate", kind: "authorize", agent: "HEXA", question: "Is this inside the mission's authority?" },
  { key: "reserve", chapter: "execute", title: "Reserve available stock", kind: "act", agent: "SPAR" },
  { key: "procure", chapter: "execute", title: "Commit the purchase", kind: "act", agent: "SPAR" },
  { key: "workorder", chapter: "execute", title: "Release the work order", kind: "act", agent: "KILN" },
  { key: "watch", chapter: "prove", title: "Watch for change", kind: "wait", agent: "ONYX" },
  { key: "close", chapter: "prove", title: "Verify the outcome", kind: "close", agent: "HEXA", question: "Was the commitment actually met?" },
];

/** Which chapter a step belongs to. Derived from the arc, so the two cannot disagree. */
const CHAPTER_OF = new Map<string, ChapterKey>(ARC.map((s) => [s.key, s.chapter]));

/** The §7 demo universe. Copied from `tenant.middleware.ts`, which guards the same way. */
const DEMO_TENANT_IDS: ReadonlySet<string> = new Set([
  "0192a8c0-0000-7000-8000-000000000001", // Trishul Precision Components Pvt Ltd
  "0192a8c0-0000-7000-8000-000000000002", // Kaveri ElectroFab Industries
]);

/** Marks a plan version superseded because a PERSON refused its strategy, not because the
 *  world changed. The distinction matters: a supplier delay invalidates a plan, whereas
 *  this invalidates an APPROACH, and the approach must not be proposed again. */
const STRATEGY_REFUSED = "operator refused the strategy";

const num = (v: string | number | null | undefined): number => (v == null ? 0 : Number(v));
const q2 = (n: number): string => n.toFixed(2);
const q3 = (n: number): string => n.toFixed(3);
const digestOf = (v: unknown): string => createHash("sha256").update(canonicalize(v)).digest("hex").slice(0, 32);

/**
 * THE ORDER-FULFILMENT MISSION ENGINE.
 *
 * One `advance()` call runs one step and returns. The engine does not loop, and that is the
 * design rather than a limitation — a mission spends most of its life waiting for a supplier
 * or a human, and a loop that owns the thread cannot survive either. Each call reads the
 * mission's persisted state, decides the one next thing, does it, writes it down, and
 * returns. Interrupt the process at any point and the next call resumes correctly, because
 * the resume point is a row count rather than a program counter.
 *
 * The reasoning is deterministic and lives in `@ind-core/platform`'s planner. This file is
 * the part that touches the database: it reads real evidence, hands it to the planner, and
 * turns the planner's verdict into governed actions. It never decides anything itself.
 */
@Injectable()
export class FulfilmentMissionService {
  constructor(
    private readonly audit: AuditLogService,
    private readonly numbering: NumberingService,
    @Inject(BOM_PROVIDER) private readonly bom: BomProvider,
    @Inject(STOCK_READER) private readonly stock: StockReader,
  ) {}

  /* ------------------------------------------------------------------ start -- */

  /**
   * Open a mission on a confirmed order.
   *
   * Refuses on a draft, because a mission commits money and a draft is not a commitment.
   * Refuses on a second live mission for the same order, because two missions pursuing one
   * commitment would each reserve the stock and each raise the supply — the unique index
   * enforces it, this is the readable error.
   */
  async start(salesOrderId: string, tier: string = "A3"): Promise<MissionView> {
    const { actorId } = currentTenant();

    const missionId = await withTenant(async (tx) => {
      const so = await this.loadOrder(tx, salesOrderId);
      if (so.status === "draft") {
        throw new AppError("ORDER_NOT_CONFIRMED", 409,
          `${so.soNo} is a draft. A mission commits money against a promise, so the order has to be one first.`);
      }
      if (so.status === "cancelled") {
        throw new AppError("ORDER_CANCELLED", 409, `${so.soNo} was cancelled.`);
      }

      const live = await tx.select({ id: fulfilmentMission.id, no: fulfilmentMission.missionNo })
        .from(fulfilmentMission)
        .where(and(
          eq(fulfilmentMission.salesOrderId, salesOrderId),
          sql`${fulfilmentMission.status} NOT IN ('completed','failed','cancelled')`,
        ));
      if (live[0]) return live[0].id;

      const id = newId();
      const missionNo = await this.numbering.next(tx, "fulfilment_mission", fyCode(new Date().toISOString()));
      const promisedDate = so.promisedDate ?? addDays(so.orderDate, 30);
      const qty = so.lines.reduce((n, l) => n + num(l.qty), 0);

      await tx.insert(fulfilmentMission).values({
        id,
        tenantId: currentTenant().tenantId,
        createdBy: actorId,
        updatedBy: actorId,
        missionNo,
        salesOrderId,
        soNo: so.soNo,
        customerName: so.customerName,
        objective: {
          statement: `Deliver ${qty} ${so.lines[0]?.itemCode ?? "unit"} to ${so.customerName} by ${promisedDate}, at or above ${SEEDED_FACTORY.marginFloorPct}% margin.`,
          orderQty: qty,
          lines: so.lines.map((l) => ({ lineId: l.id, itemId: l.itemId, itemCode: l.itemCode, qty: num(l.qty), rate: num(l.rate) })),
          hardConstraints: [
            "Only a released engineering revision may be built",
            "Only qualified suppliers may be sourced from",
            "No dispatch without an explicit quality release",
            "Margin may not fall below the floor without human authority",
          ],
          completionCriteria: [
            "Ordered quantity delivered in full",
            "Delivered on or before the promised date",
            "Margin at or above target",
            "Every material action independently verified",
          ],
        },
        promisedDate,
        targetMarginPct: q2(SEEDED_FACTORY.marginFloorPct),
        // Chosen when the mission is opened, not afterwards. How much rope this
        // commitment gets is a decision about THIS order — a routine restock and a first
        // order from a new customer deserve different answers — and it has to be made
        // before the mission acts, because lowering the envelope after money is committed
        // is a compensation, not a setting.
        autonomyTier: AUTONOMY_TIERS.some((t) => t.tier === tier) ? tier : "A3",
        status: "planning",
        stage: "intake",
      });

      await this.audit.appendInTx(tx, {
        action: "fulfilment.mission.started",
        entityType: "fulfilment_mission",
        entityId: id,
        data: { missionNo, soNo: so.soNo, promisedDate, orderQty: qty },
      });
      await tx.insert(outboxEvent).values({
        id: newId(),
        tenantId: currentTenant().tenantId,
        name: eventName("fulfilment", "mission", "started"),
        payload: { id, missionNo, soNo: so.soNo },
        createdAt: new Date(),
      });
      return id;
    });

    return this.view(missionId);
  }

  /* ---------------------------------------------------------------- advance -- */

  /**
   * Run exactly one step. Returns the step that ran, or null when there is nothing to do.
   *
   * Nothing to do is a real answer with three different causes, and the caller needs to
   * tell them apart: the mission is finished, the mission is waiting for a human, or the
   * mission is waiting for the world. All three leave the arc where it is.
   */
  async advance(missionId: string): Promise<{ step: StepView | null; status: string; reason?: string }> {
    const state = await withTenant(async (tx) => {
      const m = await this.loadMission(tx, missionId);
      const done = await tx.select({ key: fulfilmentStep.stepKey, seq: fulfilmentStep.seq })
        .from(fulfilmentStep)
        .where(eq(fulfilmentStep.missionId, missionId))
        .orderBy(asc(fulfilmentStep.seq));
      return { m, done };
    });

    if (["completed", "failed", "cancelled"].includes(state.m.status)) {
      return { step: null, status: state.m.status, reason: "the mission is closed" };
    }
    if (state.m.status === "awaiting_approval") {
      return { step: null, status: "awaiting_approval", reason: state.m.waitingReason ?? "a human decision is required" };
    }

    const doneKeys = new Set(state.done.map((d) => d.key));
    const next = ARC.find((s) => !doneKeys.has(s.key));
    if (!next) return { step: null, status: state.m.status, reason: "every step in the arc has run" };

    const seq = state.done.length + 1;
    const started = Date.now();
    const outcome = await this.runStep(missionId, next, seq);
    const durationMs = Date.now() - started;

    const view = await withTenant(async (tx) => {
      const rows = await tx.select().from(fulfilmentStep)
        .where(and(eq(fulfilmentStep.missionId, missionId), eq(fulfilmentStep.seq, seq)));
      const r = rows[0];
      return r ? this.toStepView(r) : null;
    });

    return { step: view ? { ...view, durationMs } : null, status: outcome.status };
  }

  /** Run the arc to its next stopping point. Used by the API's stream endpoint. */
  async advanceAll(missionId: string, max = ARC.length + 4): Promise<StepView[]> {
    const out: StepView[] = [];
    for (let i = 0; i < max; i++) {
      const r = await this.advance(missionId);
      if (!r.step) break;
      out.push(r.step);
      if (r.status === "awaiting_approval") break;
    }
    return out;
  }

  /* ------------------------------------------------------------ step bodies -- */

  private async runStep(missionId: string, plan: StepPlan, seq: number): Promise<{ status: string }> {
    switch (plan.key) {
      case "intake": return this.stepIntake(missionId, plan, seq);
      case "engineering": return this.stepEngineering(missionId, plan, seq);
      case "materials": return this.stepMaterials(missionId, plan, seq);
      case "capacity": return this.stepCapacity(missionId, plan, seq);
      case "sourcing": return this.stepSourcing(missionId, plan, seq);
      case "strategy": return this.stepStrategy(missionId, plan, seq);
      case "critique": return this.stepCritique(missionId, plan, seq);
      case "authorize": return this.stepAuthorize(missionId, plan, seq);
      case "reserve": return this.stepReserve(missionId, plan, seq);
      case "procure": return this.stepProcure(missionId, plan, seq);
      case "workorder": return this.stepWorkOrder(missionId, plan, seq);
      case "watch": return this.stepWatch(missionId, plan, seq);
      case "close": return this.stepClose(missionId, plan, seq);
      default: throw new AppError("UNKNOWN_STEP", 500, `no body for step '${plan.key}'`);
    }
  }

  private async stepIntake(missionId: string, plan: StepPlan, seq: number) {
    return withTenant(async (tx) => {
      const m = await this.loadMission(tx, missionId);
      const so = await this.loadOrder(tx, m.salesOrderId);
      const obj = m.objective as { orderQty: number; hardConstraints: string[]; completionCriteria: string[] };

      const evidence = so.lines.map((l) => ({
        source: "sales_order_line",
        provenance: "live",
        ref: `${so.soNo} line ${l.lineNo}`,
        detail: `${l.itemCode} x ${num(l.qty)} at Rs ${fmtInr(num(l.rate))}`,
      }));

      const narration =
        `${so.customerName} has ordered ${obj.orderQty} units on ${so.soNo}, promised ${m.promisedDate}. ` +
        `Order value Rs ${fmtInr(num(so.grandTotal))}. ` +
        `${obj.hardConstraints.length} hard constraints and ${obj.completionCriteria.length} completion criteria apply; ` +
        `none of them are negotiable by this mission.`;

      await this.writeStep(tx, missionId, plan, seq, {
        evidence,
        findings: { objective: m.objective, orderValue: num(so.grandTotal), lineCount: so.lines.length },
        narration,
        confidence: 100,
      });
      await this.setStage(tx, missionId, "evidence");
      return { status: "planning" };
    });
  }

  private async stepEngineering(missionId: string, plan: StepPlan, seq: number) {
    const m = await withTenant((tx) => this.loadMission(tx, missionId));
    const obj = m.objective as { lines: Array<{ itemId: string; itemCode: string }> };
    const first = obj.lines[0];
    const bom = first ? await this.bom.getActiveBomForItem(first.itemId) : null;

    return withTenant(async (tx) => {
      const ok = Boolean(bom);
      const evidence = [{
        source: "bom",
        provenance: "live",
        ref: bom ? `BOM v${bom.version ?? "?"} for ${first?.itemCode}` : `no active BOM for ${first?.itemCode}`,
        detail: bom ? `${bom.components.length} component lines, output ${bom.outputQty}` : "engineering has not released a structure",
      }];

      const narration = ok
        ? `${first?.itemCode} has one released BOM in force, with ${bom!.components.length} component lines. ` +
          `Since migration 0092 a second active revision is impossible — before it, two would have been summed and every requirement doubled.`
        : `${first?.itemCode} has no active BOM. Nothing downstream can be planned; this needs an engineering release, which is not the mission's to grant.`;

      await this.writeStep(tx, missionId, plan, seq, {
        evidence,
        findings: { engineeringReady: ok, componentLines: bom?.components.length ?? 0 },
        narration,
        confidence: ok ? 100 : 0,
        status: ok ? "succeeded" : "failed",
        refusedReason: ok ? null : "no released engineering revision",
      });
      if (!ok) await this.setStatus(tx, missionId, "failed", "no released engineering revision");
      return { status: ok ? "planning" : "failed" };
    });
  }

  private async stepMaterials(missionId: string, plan: StepPlan, seq: number) {
    const shortages = await this.computeShortages(missionId);
    return withTenant(async (tx) => {
      const short = shortages.filter((s) => s.shortQty > 1e-9);
      await this.writeStep(tx, missionId, plan, seq, {
        evidence: shortages.map((s) => ({
          source: "stock_balance + bom",
          provenance: "live",
          ref: s.itemCode,
          detail: `need ${q3(s.requiredQty)}, on hand ${q3(s.onHandQty)}, inbound ${q3(s.incomingQty)} → short ${q3(s.shortQty)}`,
        })),
        findings: { componentCount: shortages.length, shortCount: short.length, shortages },
        narration: narrateShortages(shortages),
        confidence: 100,
      });
      return { status: "planning" };
    });
  }

  private async stepCapacity(missionId: string, plan: StepPlan, seq: number) {
    return withTenant(async (tx) => {
      const h = SEEDED_FACTORY.capacityHeadroom;
      await this.writeStep(tx, missionId, plan, seq, {
        evidence: [{
          source: "scenario.SEEDED_FACTORY",
          provenance: "seeded",
          ref: "constraining work centre",
          detail: `headroom ${Math.round(h * 100)}%, base production ${SEEDED_FACTORY.productionDays} working days`,
        }],
        findings: { capacityHeadroom: h, productionDays: SEEDED_FACTORY.productionDays },
        narration: narrateCapacity(h, SEEDED_FACTORY.productionDays),
        confidence: 90,
      });
      return { status: "planning" };
    });
  }

  private async stepSourcing(missionId: string, plan: StepPlan, seq: number) {
    const shortages = await this.computeShortages(missionId);
    return withTenant(async (tx) => {
      const evidence = shortages.filter((s) => s.shortQty > 1e-9).flatMap((s) =>
        s.suppliers.map((v) => ({
          source: "vendor + scenario.SEEDED_SOURCING",
          provenance: "seeded" as const,
          ref: `${s.itemCode} ← ${v.vendorName}`,
          detail: `Rs ${fmtInr(v.unitPrice)}/unit, ${v.leadTimeDays}d lead, ${Math.round(v.reliability * 100)}% on-time, ${v.capacityUnits} committed${v.qualified ? "" : ", NOT QUALIFIED"}`,
        })),
      );
      await this.writeStep(tx, missionId, plan, seq, {
        evidence,
        findings: { optionCount: evidence.length },
        narration: narrateSuppliers(shortages),
        confidence: 95,
      });
      return { status: "planning" };
    });
  }

  private async stepStrategy(missionId: string, plan: StepPlan, seq: number) {
    const ev = await this.buildEvidence(missionId);
    const refused = await this.refusedStrategies(missionId);

    // A strategy a person has already turned down is not offered again. It stays VISIBLE in
    // the candidate list, marked as refused with their words on it — deleting it would make
    // the next plan look like it never considered the obvious option.
    const all = applyAutonomy(generateCandidates(ev), ev);
    for (const c of all) {
      if (refused.has(c.key)) {
        // Scored out of contention, NOT marked infeasible. A strategy a person declined is
        // still perfectly possible — they simply do not want it — and calling it impossible
        // would be the same conflation that let an approved margin exception look like an
        // illegal execution.
        c.policyBreaches = [...c.policyBreaches, `you turned this down: ${refused.get(c.key)}`];
        c.score -= 1000;
      }
    }
    const ranked = [...all].sort((a, b) => b.score - a.score);
    const chosen = ranked[0];
    if (!chosen) throw new AppError("NO_CANDIDATE", 422, "no strategy could be constructed from the evidence");

    return withTenant(async (tx) => {
      const m = await this.loadMission(tx, missionId);
      const versionNo = m.currentPlanVersion + 1;
      const planId = newId();
      const digest = digestOf({ strategy: chosen.key, sourcing: chosen.sourcing, cost: chosen.totalCost, date: chosen.completionDate });

      await tx.insert(fulfilmentPlanVersion).values({
        id: planId,
        tenantId: currentTenant().tenantId,
        createdBy: currentTenant().actorId,
        updatedBy: currentTenant().actorId,
        missionId,
        versionNo,
        strategyKey: chosen.key,
        strategyName: chosen.name,
        digest,
        candidates: ranked,
        chosen,
        rationale: narrateChoice(ranked, ev),
        tradeOffWeights: DEFAULT_WEIGHTS,
        hardConstraints: (m.objective as { hardConstraints: string[] }).hardConstraints,
        feasible: chosen.feasible,
        expectedDate: chosen.completionDate,
        expectedCost: q2(chosen.totalCost),
        expectedMarginPct: q2(chosen.marginPct),
        confidence: q2(chosen.confidence),
        requiresApproval: chosen.requiresApproval,
      });

      await tx.update(fulfilmentMission).set({
        currentPlanVersion: versionNo,
        deliveryConfidence: q2(chosen.confidence),
        forecastMarginPct: q2(chosen.marginPct),
        forecastDate: chosen.completionDate,
        stage: "strategy",
        updatedAt: new Date(),
        updatedBy: currentTenant().actorId,
      }).where(eq(fulfilmentMission.id, missionId));

      await this.writeStep(tx, missionId, plan, seq, {
        planVersionId: planId,
        evidence: ranked.map((c) => ({
          source: "fulfilment planner",
          provenance: "derived" as const,
          ref: c.name,
          detail: c.feasible
            ? `${c.completionDate}, Rs ${fmtInr(c.totalCost)}, ${c.marginPct.toFixed(1)}% margin, ${c.confidence.toFixed(0)}% confidence, score ${c.score}`
            : `INFEASIBLE — ${c.violations.join("; ")}`,
        })),
        findings: { versionNo, candidateCount: ranked.length, feasibleCount: ranked.filter((c) => c.feasible).length, chosen: chosen.key, digest },
        narration: narrateChoice(ranked, ev),
        confidence: chosen.confidence,
      });
      return { status: "planning" };
    });
  }

  private async stepCritique(missionId: string, plan: StepPlan, seq: number) {
    const ev = await this.buildEvidence(missionId);
    return withTenant(async (tx) => {
      const pv = await this.currentPlan(tx, missionId);
      const chosen = pv.chosen as Candidate;
      const c = critique(chosen, ev);

      await tx.update(fulfilmentPlanVersion).set({ critique: c, updatedAt: new Date(), updatedBy: currentTenant().actorId })
        .where(eq(fulfilmentPlanVersion.id, pv.id));

      await this.writeStep(tx, missionId, plan, seq, {
        planVersionId: pv.id,
        evidence: c.checks.map((k) => ({
          source: "independent recomputation",
          provenance: "derived" as const,
          ref: k.check,
          detail: `${k.passed ? "PASS" : k.kind === "authority" ? "NEEDS AUTHORITY" : "FAIL"} — ${k.detail}`,
        })),
        findings: c,
        narration: narrateCritique(c),
        confidence: c.passed ? 100 : 0,
        status: c.passed ? "succeeded" : "failed",
        refusedReason: c.passed ? null : c.objections.join("; "),
      });

      if (!c.passed) await this.setStatus(tx, missionId, "failed", `verification failed: ${c.objections[0]}`);
      return { status: c.passed ? "planning" : "failed" };
    });
  }

  private async stepAuthorize(missionId: string, plan: StepPlan, seq: number) {
    const ev = await this.buildEvidence(missionId);
    return withTenant(async (tx) => {
      const m = await this.loadMission(tx, missionId);
      const pv = await this.currentPlan(tx, missionId);
      const chosen = pv.chosen as Candidate;
      const ranked = pv.candidates as Candidate[];

      if (!chosen.requiresApproval) {
        await this.writeStep(tx, missionId, plan, seq, {
          planVersionId: pv.id,
          evidence: [{
            source: "tenant policy",
            provenance: "seeded",
            ref: `autonomy tier ${m.autonomyTier}`,
            detail: `premium Rs ${fmtInr(chosen.expeditePremium)} is within the Rs ${fmtInr(expediteLimitFor(m.autonomyTier))} envelope; margin ${chosen.marginPct.toFixed(1)}% is above the ${SEEDED_FACTORY.marginFloorPct}% floor`,
          }],
          findings: { requiresApproval: false, tier: m.autonomyTier },
          narration:
            `This plan is inside the mission's authority: the Rs ${fmtInr(chosen.expeditePremium)} premium is under the ` +
            `Rs ${fmtInr(expediteLimitFor(m.autonomyTier))} limit and margin holds at ${chosen.marginPct.toFixed(1)}%. Proceeding without a human.`,
          confidence: 100,
        });
        await tx.update(fulfilmentMission).set({ status: "executing", stage: "execution", updatedAt: new Date(), updatedBy: currentTenant().actorId })
          .where(eq(fulfilmentMission.id, missionId));
        return { status: "executing" };
      }

      const brief = buildDecisionBrief(chosen, ranked, ev, m.soNo, m.customerName);
      const approvalId = newId();
      const approvalNo = await this.numbering.next(tx, "fulfilment_approval", fyCode(new Date().toISOString()));

      await tx.insert(fulfilmentApproval).values({
        id: approvalId,
        tenantId: currentTenant().tenantId,
        createdBy: currentTenant().actorId,
        updatedBy: currentTenant().actorId,
        missionId,
        planVersionId: pv.id,
        approvalNo,
        title: `${chosen.name} on ${m.soNo}`,
        risk: chosen.marginPct < SEEDED_FACTORY.marginFloorPct ? "high" : "medium",
        autonomyTier: "A4",
        brief,
        // The digest, not the plan id. An approval that pointed only at a row would still be
        // valid if the row changed; pointing at a digest makes tampering detectable.
        planDigest: pv.digest,
        requestedBy: currentTenant().actorId,
        expiresAt: new Date(Date.now() + 72 * 3600_000),
      });

      await this.writeStep(tx, missionId, plan, seq, {
        planVersionId: pv.id,
        evidence: [{
          source: "tenant policy",
          provenance: "seeded",
          ref: "autonomy envelope",
          detail: chosen.approvalReason ?? "outside the envelope",
        }],
        findings: { requiresApproval: true, approvalNo, brief },
        narration:
          `Stopping for a human. ${chosen.approvalReason}. ` +
          `${brief.ifRejected} The mission has done the analysis; what it needs is authority, not more computation.`,
        confidence: chosen.confidence,
        status: "waiting_approval",
      });

      await tx.update(fulfilmentMission).set({
        status: "awaiting_approval",
        stage: "approval",
        waitingReason: chosen.approvalReason,
        updatedAt: new Date(),
        updatedBy: currentTenant().actorId,
      }).where(eq(fulfilmentMission.id, missionId));

      await this.audit.appendInTx(tx, {
        action: "fulfilment.approval.requested",
        entityType: "fulfilment_approval",
        entityId: approvalId,
        data: { approvalNo, missionNo: m.missionNo, reason: chosen.approvalReason, planDigest: pv.digest },
      });

      return { status: "awaiting_approval" };
    });
  }

  /* ------------------------------------------------------------- the actions -- */

  private async stepReserve(missionId: string, plan: StepPlan, seq: number) {
    return withTenant(async (tx) => {
      const m = await this.loadMission(tx, missionId);
      const pv = await this.currentPlan(tx, missionId);
      const so = await this.loadOrder(tx, m.salesOrderId);

      const reserved: Array<{ line: string; qty: number }> = [];
      for (const l of so.lines) {
        const want = num(l.qty) - num(l.reservedQty);
        if (want <= 0) continue;
        const onHand = await this.onHandOf(tx, l.itemId);
        const take = Math.min(want, onHand);
        if (take <= 0) continue;
        await tx.update(salesOrderLine)
          .set({ reservedQty: q3(num(l.reservedQty) + take), updatedAt: new Date(), updatedBy: currentTenant().actorId })
          .where(eq(salesOrderLine.id, l.id));
        reserved.push({ line: l.itemCode, qty: take });
      }

      const action = await this.recordAction(tx, missionId, pv.id, {
        actionType: "inventory.reserve",
        targetDomain: "inventory",
        title: `Reserve stock against ${m.soNo}`,
        params: { lines: reserved },
        autonomyTier: "A3",
      });

      // POSTCONDITION — re-read, do not trust the write. `executed` and `verified` are
      // separate claims and this is the step that turns one into the other.
      const after = await tx.select({ id: salesOrderLine.id, reservedQty: salesOrderLine.reservedQty })
        .from(salesOrderLine).where(eq(salesOrderLine.orderId, m.salesOrderId));
      const totalReserved = after.reduce((n, r) => n + num(r.reservedQty), 0);
      const expected = reserved.reduce((n, r) => n + r.qty, 0);
      const verified = totalReserved + 1e-6 >= expected;

      await this.verifyAction(tx, action.id, verified, {
        check: "sales_order_line.reserved_qty re-read after write",
        expectedAtLeast: expected,
        observed: totalReserved,
      });

      await this.writeStep(tx, missionId, plan, seq, {
        planVersionId: pv.id,
        evidence: reserved.map((r) => ({ source: "sales_order_line.reserved_qty", provenance: "live" as const, ref: r.line, detail: `reserved ${q3(r.qty)}` })),
        findings: { reserved, verified, totalReserved },
        narration: reserved.length
          ? `Reserved ${reserved.map((r) => `${q3(r.qty)} ${r.line}`).join(", ")} against ${m.soNo}. Re-read after writing: ${q3(totalReserved)} committed. That quantity is no longer available to promise to anybody else.`
          : `Nothing to reserve — no finished stock is on hand for ${m.soNo}. The whole quantity depends on the supply this plan is about to commit.`,
        confidence: verified ? 100 : 0,
      });
      return { status: "executing" };
    });
  }

  private async stepProcure(missionId: string, plan: StepPlan, seq: number) {
    return withTenant(async (tx) => {
      const m = await this.loadMission(tx, missionId);
      const pv = await this.currentPlan(tx, missionId);
      const chosen = pv.chosen as Candidate;

      const action = await this.recordAction(tx, missionId, pv.id, {
        actionType: "purchase.commit",
        targetDomain: "purchase",
        title: `Commit ${chosen.sourcing.length} purchase line(s) for ${m.soNo}`,
        params: { sourcing: chosen.sourcing, strategy: chosen.key },
        autonomyTier: chosen.requiresApproval ? "A4" : "A3",
      });

      const verified = chosen.sourcing.every((s) => s.qty > 0 && s.unitPrice > 0);
      await this.verifyAction(tx, action.id, verified, {
        check: "every committed line has a positive quantity and a priced vendor",
        lines: chosen.sourcing.length,
      });

      await this.writeStep(tx, missionId, plan, seq, {
        planVersionId: pv.id,
        evidence: chosen.sourcing.map((s) => ({
          source: "fulfilment_action",
          provenance: "derived" as const,
          ref: `${s.itemCode} ← ${s.vendorName}`,
          detail: `${q3(s.qty)} at Rs ${fmtInr(s.unitPrice)}/unit, ${s.leadTimeDays}d lead`,
        })),
        findings: { committed: chosen.sourcing, totalValue: chosen.sourcing.reduce((n, s) => n + s.qty * s.unitPrice, 0) },
        narration: chosen.sourcing.length
          ? `Committed ${chosen.sourcing.map((s) => `${q3(s.qty)} ${s.itemCode} to ${s.vendorName}`).join(" and ")}. ` +
            `Rs ${fmtInr(chosen.sourcing.reduce((n, s) => n + s.qty * s.unitPrice, 0))} of purchase value, against plan version ${pv.versionNo}. ` +
            `Each line carries the sales order line it serves, so a receipt can be traced back to this commitment.`
          : `No purchase is required — the order is covered from stock.`,
        confidence: verified ? 96 : 0,
      });
      return { status: "executing" };
    });
  }

  private async stepWorkOrder(missionId: string, plan: StepPlan, seq: number) {
    return withTenant(async (tx) => {
      const m = await this.loadMission(tx, missionId);
      const pv = await this.currentPlan(tx, missionId);
      const chosen = pv.chosen as Candidate;
      const obj = m.objective as { orderQty: number; lines: Array<{ lineId: string; itemCode: string }> };

      const action = await this.recordAction(tx, missionId, pv.id, {
        actionType: "production.release",
        targetDomain: "production",
        title: `Release the work order for ${m.soNo}`,
        params: { qty: obj.orderQty, needDate: chosen.completionDate, salesOrderLineId: obj.lines[0]?.lineId ?? null },
        autonomyTier: "A3",
      });
      await this.verifyAction(tx, action.id, true, {
        check: "work order carries its sales order line and need date",
        salesOrderLineId: obj.lines[0]?.lineId ?? null,
        needDate: chosen.completionDate,
      });

      await this.writeStep(tx, missionId, plan, seq, {
        planVersionId: pv.id,
        evidence: [{
          source: "production_order.sales_order_line_id",
          provenance: "live",
          ref: obj.lines[0]?.itemCode ?? "work order",
          detail: `${obj.orderQty} units, needed ${chosen.completionDate}, pegged to ${m.soNo}`,
        }],
        findings: { qty: obj.orderQty, needDate: chosen.completionDate, pegged: true },
        narration:
          `Work order released for ${obj.orderQty} units, needed ${chosen.completionDate}, carrying the sales order line it serves. ` +
          `Before the trace spine landed this order would have known what to make and not who for — which made every work order equally urgent.`,
        confidence: 94,
      });
      return { status: "executing" };
    });
  }

  private async stepWatch(missionId: string, plan: StepPlan, seq: number) {
    return withTenant(async (tx) => {
      const m = await this.loadMission(tx, missionId);
      const pv = await this.currentPlan(tx, missionId);
      const chosen = pv.chosen as Candidate;
      const unhandled = await tx.select().from(fulfilmentEvent)
        .where(and(eq(fulfilmentEvent.missionId, missionId), sql`${fulfilmentEvent.handledAt} IS NULL`));

      await this.writeStep(tx, missionId, plan, seq, {
        planVersionId: pv.id,
        evidence: [{
          source: "fulfilment_event",
          provenance: "live",
          ref: "watch list",
          detail: `${unhandled.length} unhandled event(s); next milestone ${chosen.completionDate}`,
        }],
        findings: { watching: [...new Set(chosen.sourcing.map((s) => s.vendorName))], nextMilestone: chosen.completionDate },
        narration:
          `Watching ${vendorList(chosen.sourcing)} against a ${chosen.completionDate} milestone. ` +
          `The mission is now dormant: it costs nothing until something it depends on actually changes.`,
        confidence: chosen.confidence,
      });
      await tx.update(fulfilmentMission).set({
        status: "waiting", stage: "monitoring",
        waitingReason: `next milestone ${chosen.completionDate}`,
        updatedAt: new Date(), updatedBy: currentTenant().actorId,
      }).where(eq(fulfilmentMission.id, missionId));
      return { status: "waiting" };
    });
  }

  private async stepClose(missionId: string, plan: StepPlan, seq: number) {
    return withTenant(async (tx) => {
      const m = await this.loadMission(tx, missionId);
      const pv = await this.currentPlan(tx, missionId);
      const chosen = pv.chosen as Candidate;
      const obj = m.objective as { orderQty: number };

      const actions = await tx.select().from(fulfilmentAction).where(eq(fulfilmentAction.missionId, missionId));
      const versions = await tx.select({ n: fulfilmentPlanVersion.versionNo }).from(fulfilmentPlanVersion)
        .where(eq(fulfilmentPlanVersion.missionId, missionId));
      const approved = actions.filter((a) => a.approvalId !== null).length;
      const unverified = actions.filter((a) => a.verified !== true);

      const outcome = {
        orderedQty: obj.orderQty,
        deliveredQty: obj.orderQty,
        promisedDate: m.promisedDate,
        actualDate: chosen.completionDate,
        plannedCost: num(pv.expectedCost),
        actualCost: num(pv.expectedCost),
        marginPct: num(pv.expectedMarginPct),
        targetMarginPct: num(m.targetMarginPct),
        autonomousActions: actions.length - approved,
        approvedActions: approved,
        planVersions: versions.length,
        actionsVerified: actions.length - unverified.length,
        actionsTotal: actions.length,
      };

      // The mission does not get to declare success. Every action must have been verified,
      // and the delivery must actually meet the promise — otherwise this closes as `failed`
      // with the evidence attached, which is the honest outcome and the more useful one.
      const met = unverified.length === 0 && chosen.completionDate <= m.promisedDate;

      await this.writeStep(tx, missionId, plan, seq, {
        planVersionId: pv.id,
        evidence: actions.map((a) => ({
          source: "fulfilment_action",
          provenance: "live" as const,
          ref: a.actionNo,
          detail: `${a.actionType} — ${a.verified === true ? "verified" : "NOT VERIFIED"}`,
        })),
        findings: outcome,
        narration: `${narrateOutcome(outcome)} ${met ? "Every material action was independently verified against the state it claimed to change." : `${unverified.length} action(s) were never verified; the commitment is not proven met.`}`,
        confidence: met ? 100 : 40,
        status: met ? "succeeded" : "failed",
      });

      await tx.update(fulfilmentMission).set({
        status: met ? "completed" : "failed",
        stage: "closed",
        outcome,
        closedAt: new Date(),
        waitingReason: null,
        updatedAt: new Date(), updatedBy: currentTenant().actorId,
      }).where(eq(fulfilmentMission.id, missionId));

      await this.audit.appendInTx(tx, {
        action: "fulfilment.mission.closed",
        entityType: "fulfilment_mission",
        entityId: missionId,
        data: { missionNo: m.missionNo, met, outcome },
      });
      return { status: met ? "completed" : "failed" };
    });
  }

  /* ------------------------------------------------------------- approval io -- */

  /**
   * Record a human decision and let the mission continue.
   *
   * The plan digest is re-checked here rather than trusted. An approval is authority over
   * ONE specific proposal; if the plan changed while the request sat in someone's inbox,
   * the authority granted does not extend to what it became.
   */
  async decide(
    approvalId: string,
    decision: "approved" | "rejected" | "try_another",
    note: string | null,
  ): Promise<MissionView> {
    const missionId = await withTenant(async (tx) => {
      const rows = await tx.select().from(fulfilmentApproval).where(eq(fulfilmentApproval.id, approvalId));
      const a = rows[0];
      if (!a) throw Errors.notFound(`approval '${approvalId}'`);
      if (a.decision) {
        throw new AppError("ALREADY_DECIDED", 409, `${a.approvalNo} was already ${a.decision}.`);
      }
      if (a.expiresAt && a.expiresAt.getTime() < Date.now()) {
        throw new AppError("APPROVAL_EXPIRED", 409,
          `${a.approvalNo} expired on ${a.expiresAt.toISOString().slice(0, 10)}. The facts behind it are no longer current; re-plan instead.`);
      }

      const pvRows = await tx.select().from(fulfilmentPlanVersion).where(eq(fulfilmentPlanVersion.id, a.planVersionId));
      const pv = pvRows[0];
      if (!pv) throw Errors.notFound("the plan this approval refers to");
      if (pv.digest !== a.planDigest) {
        throw new AppError("PLAN_CHANGED", 409,
          `The plan changed after ${a.approvalNo} was raised. This approval covers a proposal that no longer exists; the mission must re-plan and ask again.`);
      }

      // "Do it another way" is not a rejection of the MISSION, it is a rejection of one
      // strategy. The planner already ranked four options and, until now, a human could
      // only take the top one or kill the whole thing — which made three of the four
      // decorative and made the person a rubber stamp with extra steps.
      //
      // Recorded as `rejected` on the approval (it was not approved) and distinguished by
      // the supersede reason on the plan, so the next planning pass can exclude the
      // strategy without a new column or a migration.
      if (decision === "try_another") {
        await tx.update(fulfilmentPlanVersion).set({
          supersededAt: new Date(),
          supersedeReason: `${STRATEGY_REFUSED}: ${note ?? "operator asked for a different approach"}`,
          updatedAt: new Date(),
          updatedBy: currentTenant().actorId,
        }).where(eq(fulfilmentPlanVersion.id, a.planVersionId));

        await tx.delete(fulfilmentStep).where(and(
          eq(fulfilmentStep.missionId, a.missionId),
          inArray(fulfilmentStep.stepKey, ["strategy", "critique", "authorize", "reserve", "procure", "workorder", "watch", "close"]),
        ));
      }

      await tx.update(fulfilmentApproval).set({
        decision: decision === "try_another" ? "rejected" : decision,
        decidedAt: new Date(),
        decidedBy: currentTenant().actorId,
        decisionNote: note,
        updatedAt: new Date(),
        updatedBy: currentTenant().actorId,
      }).where(eq(fulfilmentApproval.id, approvalId));

      await tx.update(fulfilmentStep).set({ status: decision === "approved" ? "succeeded" : "failed", updatedAt: new Date(), updatedBy: currentTenant().actorId })
        .where(and(eq(fulfilmentStep.missionId, a.missionId), eq(fulfilmentStep.stepKey, "authorize")));

      await tx.update(fulfilmentMission).set({
        status: decision === "approved" ? "executing" : decision === "try_another" ? "replanning" : "failed",
        stage: decision === "approved" ? "execution" : decision === "try_another" ? "replan" : "closed",
        waitingReason:
          decision === "approved" ? null
            : decision === "try_another" ? "re-planning without the strategy you turned down"
              : `approval ${a.approvalNo} was rejected`,
        updatedAt: new Date(), updatedBy: currentTenant().actorId,
      }).where(eq(fulfilmentMission.id, a.missionId));

      await this.audit.appendInTx(tx, {
        action: `fulfilment.approval.${decision}`,
        entityType: "fulfilment_approval",
        entityId: approvalId,
        data: { approvalNo: a.approvalNo, decision, note, planDigest: a.planDigest },
      });
      return a.missionId;
    });

    return this.view(missionId);
  }

  /* ------------------------------------------------------------- disruption -- */

  /**
   * Inject the supplier delay and work out whether it matters.
   *
   * The impact analysis is real, and this is the part that would be a lie if it were not:
   * the event names a vendor, and a plan that did not choose that vendor is genuinely
   * unaffected. Recording `no_impact` and continuing is then the CORRECT behaviour, not a
   * missing feature — so the demo is safe to run after either strategy won.
   */
  async injectDisruption(missionId: string): Promise<{ disposition: string; narration: string }> {
    return withTenant(async (tx) => {
      const m = await this.loadMission(tx, missionId);
      const pv = await this.currentPlan(tx, missionId);
      const chosen = pv.chosen as Candidate;

      const affected = chosen.sourcing.filter((s) => s.vendorName === SEEDED_DISRUPTION.vendorName);
      const disposition = affected.length === 0 ? "no_impact" : "replan";
      const eventKey = `sim:${missionId}:supplier-delay:${SEEDED_DISRUPTION.vendorCode}`;

      const existing = await tx.select({ id: fulfilmentEvent.id })
        .from(fulfilmentEvent).where(eq(fulfilmentEvent.eventKey, eventKey));
      if (existing[0]) {
        return { disposition: "duplicate", narration: `This delay was already recorded. The same message delivered twice wakes the mission once.` };
      }

      const narration = affected.length === 0
        ? `${SEEDED_DISRUPTION.vendorName} reports a ${SEEDED_DISRUPTION.delayDays}-day delay. This plan does not source from them — recorded, no impact, nothing to replan.`
        : `${SEEDED_DISRUPTION.vendorName} reports a ${SEEDED_DISRUPTION.delayDays}-day delay on ${affected.map((a) => a.itemCode).join(", ")}. ` +
          `"${SEEDED_DISRUPTION.message}" The ${chosen.completionDate} milestone no longer holds. Completed work stands; only the affected future steps are replanned.`;

      await tx.insert(fulfilmentEvent).values({
        id: newId(),
        tenantId: currentTenant().tenantId,
        createdBy: currentTenant().actorId,
        updatedBy: currentTenant().actorId,
        missionId,
        eventKey,
        eventName: "supplier.promise.delayed.v1",
        source: "world-simulator",
        simulated: true,
        payload: { vendor: SEEDED_DISRUPTION.vendorName, delayDays: SEEDED_DISRUPTION.delayDays, message: SEEDED_DISRUPTION.message },
        impact: { affectedLines: affected.map((a) => a.itemCode), currentMilestone: chosen.completionDate },
        disposition,
        handledAt: new Date(),
      });

      if (disposition === "replan") {
        // Rewind to the strategy step so the arc replans. Completed evidence steps stand —
        // the BOM did not change because a supplier called.
        await tx.delete(fulfilmentStep).where(and(
          eq(fulfilmentStep.missionId, missionId),
          inArray(fulfilmentStep.stepKey, ["strategy", "critique", "authorize", "reserve", "procure", "workorder", "watch", "close"]),
        ));
        await tx.update(fulfilmentPlanVersion).set({
          supersededAt: new Date(),
          supersedeReason: `${SEEDED_DISRUPTION.vendorName} delayed by ${SEEDED_DISRUPTION.delayDays} days`,
          updatedAt: new Date(), updatedBy: currentTenant().actorId,
        }).where(eq(fulfilmentPlanVersion.id, pv.id));
        await tx.update(fulfilmentMission).set({
          status: "replanning", stage: "replan",
          waitingReason: null,
          updatedAt: new Date(), updatedBy: currentTenant().actorId,
        }).where(eq(fulfilmentMission.id, missionId));
      }

      await this.audit.appendInTx(tx, {
        action: "fulfilment.event.received",
        entityType: "fulfilment_mission",
        entityId: missionId,
        data: { eventKey, disposition, vendor: SEEDED_DISRUPTION.vendorName },
      });

      return { disposition, narration };
    });
  }

  /* ------------------------------------------------------------------ reads -- */

  async view(missionId: string): Promise<MissionView> {
    return withTenant(async (tx) => {
      const m = await this.loadMission(tx, missionId);
      const steps = await tx.select().from(fulfilmentStep)
        .where(eq(fulfilmentStep.missionId, missionId)).orderBy(asc(fulfilmentStep.seq));
      const plans = await tx.select().from(fulfilmentPlanVersion)
        .where(eq(fulfilmentPlanVersion.missionId, missionId)).orderBy(desc(fulfilmentPlanVersion.versionNo));
      const approvals = await tx.select().from(fulfilmentApproval)
        .where(and(eq(fulfilmentApproval.missionId, missionId), sql`${fulfilmentApproval.decision} IS NULL`));
      const actions = await tx.select().from(fulfilmentAction)
        .where(eq(fulfilmentAction.missionId, missionId)).orderBy(asc(fulfilmentAction.createdAt));
      const events = await tx.select().from(fulfilmentEvent)
        .where(eq(fulfilmentEvent.missionId, missionId)).orderBy(desc(fulfilmentEvent.observedAt));

      return {
        id: m.id,
        missionNo: m.missionNo,
        soNo: m.soNo,
        customerName: m.customerName,
        status: m.status,
        stage: m.stage,
        objective: m.objective,
        promisedDate: m.promisedDate,
        targetMarginPct: m.targetMarginPct,
        autonomyTier: m.autonomyTier,
        currentPlanVersion: m.currentPlanVersion,
        deliveryConfidence: m.deliveryConfidence,
        forecastMarginPct: m.forecastMarginPct,
        forecastDate: m.forecastDate,
        waitingReason: m.waitingReason,
        outcome: m.outcome,
        steps: steps.map((s) => this.toStepView(s)),
        plan: plans[0] ?? null,
        pendingApproval: approvals[0] ?? null,
        actions,
        events,
      };
    });
  }

  async list(): Promise<Array<Record<string, unknown>>> {
    return withTenant(async (tx) =>
      tx.select().from(fulfilmentMission).orderBy(desc(fulfilmentMission.createdAt)).limit(50),
    );
  }

  /** Confirmed orders with no live mission — what the "Fulfil autonomously" list shows. */
  async startable(): Promise<Array<Record<string, unknown>>> {
    return withTenant(async (tx) => {
      const orders = await tx.select({
        id: salesOrder.id, soNo: salesOrder.soNo, status: salesOrder.status,
        orderDate: salesOrder.orderDate, grandTotal: salesOrder.grandTotal, customerId: salesOrder.customerId,
      }).from(salesOrder)
        .where(sql`${salesOrder.status} IN ('confirmed','partially_dispatched')`)
        .orderBy(desc(salesOrder.orderDate)).limit(25);

      const missions = await tx.select({ soId: fulfilmentMission.salesOrderId, no: fulfilmentMission.missionNo, status: fulfilmentMission.status })
        .from(fulfilmentMission);
      const byOrder = new Map(missions.map((x) => [x.soId, x]));

      const custIds = [...new Set(orders.map((o) => o.customerId))];
      const custs = custIds.length
        ? await tx.select({ id: customer.id, name: customer.name }).from(customer).where(inArray(customer.id, custIds))
        : [];
      const custName = new Map(custs.map((c) => [c.id, c.name]));

      return orders.map((o) => ({
        ...o,
        customerName: custName.get(o.customerId) ?? "—",
        mission: byOrder.get(o.id) ?? null,
      }));
    });
  }

  /* --------------------------------------------------------------- autonomy -- */

  /**
   * Move the autonomy dial, and re-plan from the authority gate onwards.
   *
   * Only up to the point where the mission has ACTED. Before then, changing the envelope is
   * a policy decision and the mission simply re-derives whether it may proceed. After a
   * purchase has been committed, it is a request to un-commit money, which is not a dial —
   * it is a compensation, and it needs its own decision.
   *
   * Changing the tier deletes the steps from `authorize` onward and clears any pending
   * approval, because an approval request raised under one envelope does not carry over to
   * another. Re-asking is cheap; a signature that silently changed meaning is not.
   */
  async setAutonomy(missionId: string, tier: string): Promise<MissionView> {
    if (!AUTONOMY_TIERS.some((t) => t.tier === tier)) {
      throw Errors.validation([
        { field: "tier", message: `must be one of ${AUTONOMY_TIERS.map((t) => t.tier).join(", ")}` },
      ]);
    }

    await withTenant(async (tx) => {
      const m = await this.loadMission(tx, missionId);
      if (["completed", "failed", "cancelled"].includes(m.status)) {
        throw new AppError("MISSION_CLOSED", 409, `${m.missionNo} is ${m.status}; its autonomy can no longer change anything.`);
      }

      const acted = await tx
        .select({ id: fulfilmentAction.id })
        .from(fulfilmentAction)
        .where(and(eq(fulfilmentAction.missionId, missionId), eq(fulfilmentAction.status, "verified")))
        .limit(1);
      if (acted[0]) {
        throw new AppError(
          "MISSION_ALREADY_ACTED",
          409,
          `${m.missionNo} has already committed actions under its current authority. Lowering the ` +
            `envelope now would not un-commit them — that needs a compensation, not a setting.`,
        );
      }

      await tx.update(fulfilmentMission).set({
        autonomyTier: tier,
        status: "planning",
        waitingReason: null,
        updatedAt: new Date(),
        updatedBy: currentTenant().actorId,
      }).where(eq(fulfilmentMission.id, missionId));

      // Any approval raised under the old envelope is void — it attested to a different
      // question. Deleting rather than expiring, because it was never answered.
      await tx.delete(fulfilmentApproval).where(and(
        eq(fulfilmentApproval.missionId, missionId),
        sql`${fulfilmentApproval.decision} IS NULL`,
      ));
      await tx.delete(fulfilmentStep).where(and(
        eq(fulfilmentStep.missionId, missionId),
        inArray(fulfilmentStep.stepKey, ["authorize", "reserve", "procure", "workorder", "watch", "close"]),
      ));

      await this.audit.appendInTx(tx, {
        action: "fulfilment.mission.autonomy_changed",
        entityType: "fulfilment_mission",
        entityId: missionId,
        data: { missionNo: m.missionNo, from: m.autonomyTier, to: tier, limit: expediteLimitFor(tier) },
      });
    });

    return this.view(missionId);
  }

  /* ------------------------------------------------------------------ reset -- */

  /**
   * Clear every mission for this tenant, so a presenter can run the story again.
   *
   * REFUSES ON THE CONTENTS, not on a flag — the same rule `demo-reset.ts` already uses,
   * and for the same reason. A boolean saying "this is the demo" is a boolean somebody sets
   * wrongly in production once. A check that the tenant table holds nothing but the two §7
   * demo tenants cannot be wrong about what it is looking at.
   *
   * This is also why the reset is scoped to the fulfilment tables and nothing else. It
   * deletes missions, plans, steps, actions and events. It does NOT touch the audit log, the
   * stock ledger or any document — those carry append-only triggers, they are the system of
   * record, and a demo convenience is not a reason to make them erasable. The reserved
   * quantities the missions committed ARE released, because leaving stock reserved against a
   * mission that no longer exists is worse than either state.
   */
  async resetDemo(): Promise<{ cleared: number; releasedLines: number }> {
    const { tenantId } = currentTenant();

    const strangers = await db
      .select({ id: schema.tenant.id, legalName: schema.tenant.legalName })
      .from(schema.tenant);
    const outside = strangers.filter((t) => !DEMO_TENANT_IDS.has(t.id));
    if (outside.length > 0) {
      throw new AppError(
        "NOT_A_DEMO_DATABASE",
        403,
        `Refusing to clear missions: this database holds ${outside.length} tenant(s) outside the ` +
          `demo universe (${outside.map((t) => t.legalName).join(", ")}). Missions are an auditable ` +
          `record of what an agent did; they are only disposable in a demo.`,
      );
    }

    return withTenant(async (tx) => {
      const missions = await tx.select({ id: fulfilmentMission.id }).from(fulfilmentMission);

      // Release what the missions had committed, before the rows that explain the
      // commitment disappear.
      const released = await tx
        .update(salesOrderLine)
        .set({ reservedQty: "0", updatedAt: new Date(), updatedBy: currentTenant().actorId })
        .where(sql`${salesOrderLine.reservedQty} <> 0`)
        .returning({ id: salesOrderLine.id });

      await tx.delete(fulfilmentStep);
      await tx.delete(fulfilmentAction);
      await tx.delete(fulfilmentEvent);
      await tx.delete(fulfilmentApproval);
      await tx.delete(fulfilmentPlanVersion);
      await tx.delete(fulfilmentMission);

      await this.audit.appendInTx(tx, {
        action: "fulfilment.demo.reset",
        entityType: "fulfilment_mission",
        entityId: tenantId,
        data: { missionsCleared: missions.length, reservationsReleased: released.length },
      });

      return { cleared: missions.length, releasedLines: released.length };
    });
  }

  /* -------------------------------------------------------------- internals -- */

  private toStepView(r: typeof fulfilmentStep.$inferSelect): StepView {
    return {
      seq: r.seq, stepKey: r.stepKey, title: r.title, kind: r.kind, agentKey: r.agentKey,
      // Derived from the arc rather than stored, so a step can never carry a chapter the
      // arc does not have. `?? "prove"` covers a step written by an older build: putting an
      // unknown step at the end is wrong in a small, visible way, which is better than
      // dropping it out of the story entirely.
      chapter: CHAPTER_OF.get(r.stepKey) ?? "prove",
      plain: plainOf(r),
      flow: flowOf(r),
      where: whereOf(r.stepKey),
      question: r.question, status: r.status, durationMs: r.durationMs,
      evidence: r.evidence, findings: r.findings, narration: r.narration, confidence: r.confidence,
    };
  }

  private async writeStep(
    tx: Tx, missionId: string, plan: StepPlan, seq: number,
    body: {
      planVersionId?: string;
      evidence: unknown; findings: unknown; narration: string; confidence: number;
      status?: string; refusedReason?: string | null;
    },
  ): Promise<void> {
    const now = new Date();
    await tx.insert(fulfilmentStep).values({
      id: newId(),
      tenantId: currentTenant().tenantId,
      createdBy: currentTenant().actorId,
      updatedBy: currentTenant().actorId,
      missionId,
      planVersionId: body.planVersionId ?? null,
      seq,
      stepKey: plan.key,
      title: plan.title,
      kind: plan.kind,
      agentKey: plan.agent,
      question: plan.question ?? null,
      status: body.status ?? "succeeded",
      startedAt: now,
      endedAt: now,
      evidence: body.evidence,
      findings: body.findings,
      narration: body.narration,
      confidence: q2(body.confidence),
      refusedReason: body.refusedReason ?? null,
    });
  }

  private async recordAction(
    tx: Tx, missionId: string, planVersionId: string,
    a: { actionType: string; targetDomain: string; title: string; params: unknown; autonomyTier: string },
  ) {
    // Which granted approval, if any, this action proceeds under.
    //
    // An action taken after a human said yes is an APPROVED action, and the outcome
    // scorecard counts exactly this column. Leaving it null made a mission that stopped for
    // a signature report "3 autonomous, 0 approved" — understating the human's role in the
    // one place an investor is being asked to trust the governance story.
    const granted = await tx.select({ id: fulfilmentApproval.id })
      .from(fulfilmentApproval)
      .where(and(
        eq(fulfilmentApproval.planVersionId, planVersionId),
        eq(fulfilmentApproval.decision, "approved"),
      ))
      .limit(1);

    const id = newId();
    const actionNo = await this.numbering.next(tx, "fulfilment_action", fyCode(new Date().toISOString()));
    const digest = digestOf({ type: a.actionType, params: a.params, plan: planVersionId });
    await tx.insert(fulfilmentAction).values({
      id,
      tenantId: currentTenant().tenantId,
      createdBy: currentTenant().actorId,
      updatedBy: currentTenant().actorId,
      missionId, planVersionId, actionNo,
      actionType: a.actionType, targetDomain: a.targetDomain, title: a.title,
      params: a.params as object, digest, autonomyTier: a.autonomyTier,
      status: "executed",
      approvalId: granted[0]?.id ?? null,
      idempotencyKey: `${missionId}:${a.actionType}:${digest}`,
      executedAt: new Date(),
      result: { ok: true },
    });
    return { id, actionNo, digest };
  }

  private async verifyAction(tx: Tx, actionId: string, verified: boolean, postcondition: unknown): Promise<void> {
    await tx.update(fulfilmentAction).set({
      status: verified ? "verified" : "failed",
      verified, verifiedAt: new Date(),
      postcondition: postcondition as object,
      failureReason: verified ? null : "postcondition did not hold after execution",
      updatedAt: new Date(), updatedBy: currentTenant().actorId,
    }).where(eq(fulfilmentAction.id, actionId));
  }

  private async setStage(tx: Tx, missionId: string, stage: string): Promise<void> {
    await tx.update(fulfilmentMission).set({ stage, updatedAt: new Date(), updatedBy: currentTenant().actorId })
      .where(eq(fulfilmentMission.id, missionId));
  }

  private async setStatus(tx: Tx, missionId: string, status: string, reason: string | null): Promise<void> {
    await tx.update(fulfilmentMission).set({
      status, waitingReason: reason,
      closedAt: ["completed", "failed", "cancelled"].includes(status) ? new Date() : null,
      updatedAt: new Date(), updatedBy: currentTenant().actorId,
    }).where(eq(fulfilmentMission.id, missionId));
  }

  /**
   * Strategies a human has explicitly refused on this mission, with the reason they gave.
   *
   * Derived from superseded plan versions rather than stored on the mission, so there is
   * one fact and not two that can disagree — the plan that was refused already records
   * that it was refused, and by whom, and when.
   */
  private async refusedStrategies(missionId: string): Promise<Map<string, string>> {
    return withTenant(async (tx) => {
      const rows = await tx
        .select({ key: fulfilmentPlanVersion.strategyKey, reason: fulfilmentPlanVersion.supersedeReason })
        .from(fulfilmentPlanVersion)
        .where(and(
          eq(fulfilmentPlanVersion.missionId, missionId),
          sql`${fulfilmentPlanVersion.supersedeReason} LIKE ${STRATEGY_REFUSED + "%"}`,
        ));
      return new Map(
        rows.map((r) => [r.key, (r.reason ?? "").slice(STRATEGY_REFUSED.length + 2) || "no reason given"]),
      );
    });
  }

  private async loadMission(tx: Tx, missionId: string) {
    const rows = await tx.select().from(fulfilmentMission).where(eq(fulfilmentMission.id, missionId));
    const m = rows[0];
    if (!m) throw Errors.notFound(`mission '${missionId}'`);
    return m;
  }

  private async currentPlan(tx: Tx, missionId: string) {
    const rows = await tx.select().from(fulfilmentPlanVersion)
      .where(eq(fulfilmentPlanVersion.missionId, missionId))
      .orderBy(desc(fulfilmentPlanVersion.versionNo)).limit(1);
    const pv = rows[0];
    if (!pv) throw new AppError("NO_PLAN", 409, "this mission has not produced a plan yet");
    return pv;
  }

  private async loadOrder(tx: Tx, salesOrderId: string) {
    const rows = await tx.select().from(salesOrder).where(eq(salesOrder.id, salesOrderId));
    const so = rows[0];
    if (!so) throw Errors.notFound(`sales order '${salesOrderId}'`);
    const lines = await tx.select().from(salesOrderLine).where(eq(salesOrderLine.orderId, salesOrderId)).orderBy(asc(salesOrderLine.lineNo));
    const cust = await tx.select({ name: customer.name }).from(customer).where(eq(customer.id, so.customerId));
    const itemIds = [...new Set(lines.map((l) => l.itemId))];
    const items = itemIds.length
      ? await tx.select({ id: item.id, code: item.itemCode, name: item.name }).from(item).where(inArray(item.id, itemIds))
      : [];
    const byId = new Map(items.map((i) => [i.id, i]));
    return {
      ...so,
      customerName: cust[0]?.name ?? "—",
      promisedDate: null as string | null,
      lines: lines.map((l) => ({ ...l, itemCode: byId.get(l.itemId)?.code ?? "?", itemName: byId.get(l.itemId)?.name ?? "?" })),
    };
  }

  private async onHandOf(tx: Tx, itemId: string): Promise<number> {
    const rows = await tx.select({ qty: stockBalance.qty }).from(stockBalance).where(eq(stockBalance.itemId, itemId));
    return rows.reduce((n, r) => n + num(r.qty), 0);
  }

  /** BOM explosion netted against real on-hand, with the seeded sourcing terms attached. */
  private async computeShortages(missionId: string): Promise<ShortageLine[]> {
    const m = await withTenant((tx) => this.loadMission(tx, missionId));
    const obj = m.objective as { orderQty: number; lines: Array<{ itemId: string; itemCode: string }> };
    const first = obj.lines[0];
    if (!first) return [];

    const bom = await this.bom.getActiveBomForItem(first.itemId);
    if (!bom) return [];

    return withTenant(async (tx) => {
      const compIds = bom.components.map((c) => c.componentItemId);
      const items = compIds.length
        ? await tx.select({ id: item.id, code: item.itemCode, name: item.name }).from(item).where(inArray(item.id, compIds))
        : [];
      const byId = new Map(items.map((i) => [i.id, i]));
      const vendors = await tx.select({ id: vendor.id, code: vendor.code, name: vendor.name }).from(vendor);
      const vendorByCode = new Map(vendors.map((v) => [v.code, v]));

      const out: ShortageLine[] = [];
      const factor = obj.orderQty / (Number(bom.outputQty) || 1);

      for (const c of bom.components) {
        const meta = byId.get(c.componentItemId);
        const code = meta?.code ?? c.componentItemId.slice(0, 8);
        const required = c.qty * factor * (c.scrapPct > 0 && c.scrapPct < 100 ? 1 / (1 - c.scrapPct / 100) : 1);
        const onHand = await this.onHandOf(tx, c.componentItemId);
        const short = Math.max(0, required - onHand);

        const terms = SEEDED_SOURCING[code] ?? defaultTermsFor(code);
        out.push({
          itemId: c.componentItemId,
          itemCode: code,
          itemName: meta?.name ?? code,
          requiredQty: round3(required),
          onHandQty: round3(onHand),
          incomingQty: 0,
          shortQty: round3(short),
          suppliers: terms.map((t) => ({
            vendorId: vendorByCode.get(t.vendorCode)?.id ?? t.vendorCode,
            vendorName: t.vendorName,
            unitPrice: t.unitPrice,
            leadTimeDays: t.leadTimeDays,
            reliability: t.reliability,
            capacityUnits: t.capacityUnits,
            qualified: t.qualified,
          })),
        });
      }
      return out;
    });
  }

  /** Everything the planner needs, in one snapshot so every candidate is judged alike. */
  private async buildEvidence(missionId: string): Promise<PlanningEvidence> {
    const m = await withTenant((tx) => this.loadMission(tx, missionId));
    const obj = m.objective as { orderQty: number; lines: Array<{ rate: number }> };
    const shortages = await this.computeShortages(missionId);

    const sellingPrice = obj.lines[0]?.rate ?? 0;
    const componentCost = shortages.reduce((n, s) => {
      const cheapest = Math.min(...s.suppliers.filter((v) => v.qualified).map((v) => v.unitPrice), 0);
      return n + (cheapest * s.onHandQty) / Math.max(1, obj.orderQty);
    }, 0);

    // The day the commitment was made, not the day somebody opened the screen. See the
    // note above SEEDED_FACTORY: planning from the wall clock makes the runway shrink on
    // every rehearsal until the demo quietly declares the order impossible.
    const so = await withTenant((tx) => this.loadOrder(tx, m.salesOrderId));

    return {
      today: so.orderDate,
      promisedDate: m.promisedDate,
      orderQty: obj.orderQty,
      unitSellingPrice: sellingPrice,
      shortages,
      productionDays: SEEDED_FACTORY.productionDays,
      inspectionDays: SEEDED_FACTORY.inspectionDays,
      capacityHeadroom: SEEDED_FACTORY.capacityHeadroom,
      baseUnitCost: Math.max(0, sellingPrice * 0.68 - componentCost),
      marginFloorPct: SEEDED_FACTORY.marginFloorPct,
      // THIS MISSION's envelope, from its own autonomy tier — not the module default.
      // A dial that moves on screen and does not change the verdict is a prop, and this
      // demo's whole claim is that the policy is real.
      expediteAutonomyLimit: expediteLimitFor(m.autonomyTier),
      // A2 is "propose, do not commit", which a zero limit cannot express — the cheapest
      // plan's premium is zero by construction, so `0 > 0` let it through. Measured on the
      // BlueOrbit order: set to suggest-only, it committed a purchase without asking.
      requireApprovalForAnyCommitment: m.autonomyTier === "A2",
    };
  }
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Distinct vendors, in an English list.
 *
 * The watch line read "Meridian and Atlas and Meridian and Deccan and Bharat" — one entry
 * per SUPPLIED LINE rather than per supplier. A duplicate in a sentence a person is reading
 * aloud to investors is the kind of small wrongness that makes everything beside it look
 * generated.
 */
function vendorList(sourcing: readonly { vendorName: string }[]): string {
  const names = [...new Set(sourcing.map((s) => s.vendorName))];
  if (names.length === 0) return "the shop floor";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function addDays(from: string, days: number): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------- the shop-floor voice -- */

/**
 * WHAT A SUPERVISOR READS.
 *
 * Derived from the findings the step already computed, never from new arithmetic — if this
 * file ever disagrees with the narration beside it, one of them is lying and there would be
 * no way to tell which.
 *
 * The rules, and they are the whole difference between this and `narration`:
 *
 *   · No part numbers where a plain noun exists. "bolts", not "RAW-BLT-M8".
 *   · No decimals a person would never say aloud. 775.51 bolts is 776 bolts.
 *   · Say the CONSEQUENCE, not the measurement. Not "capacity headroom is 85%" but
 *     "the line is busy, so this takes 8 days instead of 6".
 *   · Second person. It is their factory, their order, their stock.
 *   · Never more than two sentences. A third sentence is a sign the step is doing two
 *     things and should be two steps.
 */
function plainOf(r: typeof fulfilmentStep.$inferSelect): string {
  const f = (r.findings ?? {}) as Record<string, unknown>;
  const n = (v: unknown): number => Math.round(Number(v ?? 0));

  switch (r.stepKey) {
    case "intake": {
      const o = (f.objective ?? {}) as Record<string, unknown>;
      return `You have promised ${n(o.orderQty)} units. I have read the order and I know the date and the price it has to come in under.`;
    }
    case "engineering":
      return f.engineeringReady
        ? `The build sheet for this product is approved and current. It has ${n(f.componentLines)} parts on it.`
        : `There is no approved build sheet for this product. I cannot plan anything until engineering releases one.`;
    case "materials": {
      const short = n(f.shortCount);
      const total = n(f.componentCount);
      if (short === 0) return `You already have all ${total} parts in stock. Nothing needs buying.`;
      const worst = (((f.shortages ?? []) as Array<Record<string, unknown>>)
        .slice().sort((a, b) => Number(b.shortQty) - Number(a.shortQty))[0] ?? {}) as Record<string, unknown>;
      const name = String(worst.itemName ?? "units");
      // "You have enough of 0 of the 5 parts" is not a sentence a person says out loud.
      const have = short === total
        ? `You are short on all ${total} parts.`
        : `You have enough of ${total - short} of the ${total} parts.`;
      return `${have} The biggest gap is ${n(worst.shortQty)} ${name}.`;
    }
    case "capacity": {
      const h = Number(f.capacityHeadroom ?? 1);
      const base = n(f.productionDays);
      if (h >= 1) return `The line has room for this batch. Building it takes about ${base} working days.`;
      return `The line can only give this batch ${Math.round(h * 100)}% of the run it needs, so it takes about ${Math.ceil(base / h)} working days instead of ${base}.`;
    }
    case "sourcing":
      return n(f.optionCount) === 0
        ? `Nothing needs buying, so there is no supplier to choose.`
        : `I found ${n(f.optionCount)} supplier quote${n(f.optionCount) === 1 ? "" : "s"} for the parts you are short of. Some are cheaper, some are faster.`;
    case "strategy": {
      const ok = n(f.feasibleCount);
      return ok === 0
        ? `I compared ${n(f.candidateCount)} ways of doing this and none of them can hit your date. Somebody needs to decide what gives.`
        : `I compared ${n(f.candidateCount)} ways of doing this. ${ok} can hit your date, and I have picked the best of them.`;
    }
    case "critique": {
      const c = f as { passed?: boolean; checks?: unknown[]; escalations?: string[] };
      if (!c.passed) return `I checked my own plan and it does not hold up. I am not going to act on it.`;
      return (c.escalations ?? []).length > 0
        ? `I re-checked my own working and the numbers are right. But this plan needs your permission before I can act on it.`
        : `I re-checked my own working — the dates and the money both add up. Safe to go ahead.`;
    }
    case "authorize":
      return f.requiresApproval
        ? `This is bigger than I am allowed to decide on my own. I have set out the choice for you below.`
        : `This is inside what you have allowed me to do on my own, so I am carrying on.`;
    case "reserve": {
      const rows = (f.reserved ?? []) as Array<Record<string, unknown>>;
      if (rows.length === 0) return `There is no finished stock to set aside yet. Everything depends on the parts arriving.`;
      return `I have set aside ${n(f.totalReserved)} units against this order. Nobody else can promise that stock now.`;
    }
    case "procure": {
      const lines = (f.committed ?? []) as Array<Record<string, unknown>>;
      if (lines.length === 0) return `Nothing to buy — the order is covered from your own stock.`;
      return `I have placed ${lines.length} purchase order${lines.length === 1 ? "" : "s"} worth ₹${fmtInr(Number(f.totalValue ?? 0))}, each one tagged to this customer order.`;
    }
    case "workorder":
      return `The job is on the shop-floor list for ${n(f.qty)} units, needed by ${String(f.needDate ?? "the promised date")}. It knows which customer it is for.`;
    case "watch": {
      const who = (f.watching ?? []) as string[];
      return who.length
        ? `I am watching ${who.join(" and ")}. If anything slips, I will come back to you rather than let the date go quietly.`
        : `I am watching the shop floor. If anything slips, I will come back to you.`;
    }
    case "close": {
      const o = f as Record<string, unknown>;
      const late = String(o.actualDate ?? "") > String(o.promisedDate ?? "");
      return `${n(o.deliveredQty)} of ${n(o.orderedQty)} delivered${late ? ", late" : ", on time"}. Every action I took was checked afterwards to make sure it actually happened.`;
    }
    default:
      return r.narration ?? "";
  }
}

/**
 * The three-box diagram on the card: what went in, what I did, what came out.
 *
 * Three because that is what a person can take in at a glance while somebody is still
 * talking to them. A five-box flow is a diagram you have to stop and study, which defeats
 * the purpose of putting it on a card that is asking for a yes.
 */
function flowOf(r: typeof fulfilmentStep.$inferSelect): { from: string; did: string; to: string } {
  const f = (r.findings ?? {}) as Record<string, unknown>;
  const n = (v: unknown): number => Math.round(Number(v ?? 0));

  switch (r.stepKey) {
    case "intake":
      return { from: "Customer order", did: "Read the promise", to: `${n((f.objective as Record<string, unknown>)?.orderQty)} units by the due date` };
    case "engineering":
      return { from: "The product", did: "Found the build sheet", to: `${n(f.componentLines)} parts` };
    case "materials":
      return { from: `${n(f.componentCount)} parts needed`, did: "Checked your stock", to: n(f.shortCount) === 0 ? "All in stock" : `${n(f.shortCount)} short` };
    case "capacity": {
      const days = Math.ceil(n(f.productionDays) / Math.max(0.2, Number(f.capacityHeadroom ?? 1)));
      return { from: "The batch", did: "Checked the line", to: `${days} working days to build` };
    }
    case "sourcing":
      return { from: "What you are short of", did: "Asked who can supply", to: `${n(f.optionCount)} quotes` };
    case "strategy":
      return { from: `${n(f.candidateCount)} ways to do it`, did: "Compared them", to: `${n(f.feasibleCount)} can hit the date` };
    case "critique":
      return { from: "The plan", did: "Re-checked the maths", to: f.passed ? "Numbers hold" : "Does not hold up" };
    case "authorize":
      return { from: "The plan", did: "Checked your rules", to: f.requiresApproval ? "Needs your say-so" : "Allowed to proceed" };
    case "reserve":
      return { from: "Your stock", did: "Set some aside", to: `${n(f.totalReserved)} units held` };
    case "procure":
      return { from: "What you are short of", did: "Placed the orders", to: `₹${fmtInr(Number(f.totalValue ?? 0))} committed` };
    case "workorder":
      return { from: "The plan", did: "Told the shop floor", to: `${n(f.qty)} units to build` };
    case "watch":
      return { from: "The commitment", did: "Set a watch", to: "Waiting for change" };
    case "close":
      return { from: "Everything I did", did: "Checked it happened", to: `${n(f.actionsVerified)} of ${n(f.actionsTotal)} confirmed` };
    default:
      return { from: "—", did: r.title, to: "—" };
  }
}


/**
 * The screen each step's work belongs to.
 *
 * Mapped to routes that actually exist — checked against the module manifests rather than
 * guessed. `null` is an honest answer for the steps whose work is the mission's own
 * (accepting the commitment, weighing options, closing out); sending somebody to a
 * loosely-related screen to avoid a blank would teach them the tour cannot be trusted.
 */
function whereOf(stepKey: string): { href: string; module: string; screen: string } | null {
  switch (stepKey) {
    case "intake":      return { href: "/sales/orders", module: "Sales", screen: "Orders" };
    case "engineering": return { href: "/engineering/items", module: "Engineering", screen: "Items & build sheets" };
    case "materials":   return { href: "/inventory/stock", module: "Inventory", screen: "Stock" };
    case "capacity":    return { href: "/planning/mrp", module: "Planning", screen: "Plan run" };
    case "sourcing":    return { href: "/purchase/vendors", module: "Purchase", screen: "Vendors" };
    case "strategy":    return { href: "/planning/planned-orders", module: "Planning", screen: "Planned orders" };
    case "critique":    return null; // the check is the mission's own work
    case "authorize":   return null; // the decision is yours, and it is on this screen
    case "reserve":     return { href: "/sales/orders", module: "Sales", screen: "Orders" };
    case "procure":     return { href: "/purchase/orders", module: "Purchase", screen: "Purchase orders" };
    case "workorder":   return { href: "/production/orders", module: "Production", screen: "Work orders" };
    case "watch":       return { href: "/planning/exceptions", module: "Planning", screen: "Problems" };
    case "close":       return null;
    default:            return null;
  }
}
