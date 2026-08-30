import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema, withTenant, type Tx } from "@ind-core/db";
import {
  AppError,
  DeterministicEngine,
  Errors,
  buildPipeline,
  canonicalize,
  currentTenant,
  eventName,
  fmtInr,
  narrateCapacity,
  narrateShortages,
  narrateSuppliers,
  newId,
  type Candidate,
  type IntelligenceEngine,
  type PipelineStage,
  type PlanningEvidence,
  type ShortageLine,
} from "@ind-core/platform";
import { createHash } from "node:crypto";
import { AuditLogService } from "../common/audit-log.service.js";
import { NumberingService, fyCode } from "../common/numbering.service.js";
import { BOM_PROVIDER, type BomProvider } from "../ports/bom.port.js";
import { STOCK_READER, type StockReader } from "../ports/planning-inputs.port.js";
import {
  CUSTOMER_ORDER_WRITER,
  PURCHASE_ORDER_WRITER,
  PRODUCTION_ORDER_WRITER,
  type PurchaseOrderWriter,
  type ProductionOrderWriter,
  type CustomerOrderWriter,
  type CreatedPurchaseOrder,
  type CreatedProductionOrder,
  type CreatedCustomerOrder,
  type CreateFulfilmentCustomerOrderInput,
} from "../ports/fulfilment-docs.port.js";
import {
  AUTONOMY_TIERS,
  SEEDED_DISRUPTION,
  SEEDED_FACTORY,
  SEEDED_SOURCING,
  defaultTermsFor,
  expediteLimitFor,
  type SeededSupplierTerms,
} from "./scenario.js";
import {
  SCENARIOS,
  SCENARIO_BY_KEY,
  SIMULATED_FAULT,
  STEP_RETRY_EVENT,
  TERMS_UPLOAD_EVENT,
  resolveScenarios,
  type OrderProbe,
  type ResolvedScenario,
} from "./scenarios.js";
import { buildTermsCsv, parseSupplierTerms, toBase64, type UploadedSupplierTerm } from "./sourcing-terms.js";

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
  // PURCHASE's and PRODUCTION's own tables, read here and NEVER written here. The mission
  // creates both documents through their modules' ports and then re-reads the rows to prove
  // they exist — a postcondition is only worth having if it is read from the place the
  // document actually lives, not from the answer the writer just handed back.
  purchaseOrder,
  purchaseOrderLine,
  productionOrder,
  dispatch,
  dispatchLine,
  qualityRelease,
  arOpenItem,
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
  /** Server clock, ISO-8601. Null on a step written before 0094 stored them. */
  startedAt: string | null;
  endedAt: string | null;
  evidence: unknown;
  findings: unknown;
  narration: string | null;
  confidence: string | null;
  /**
   * THE THIRTEEN PHASES, FOR THIS STEP ONLY.
   *
   * Trigger → collect → normalise → context → analyse → recommend → explain → approve →
   * execute → verify → update → record → continue. A step emits the phases it genuinely
   * went through and no others: an observe step has no `execute`, and a step that failed
   * while reading the vendor master does not go on to claim it raised anything.
   *
   * Derived in `@ind-core/platform`'s `buildPipeline` from the evidence and findings this
   * step already wrote — never from a second, parallel account of what happened. If the
   * pipeline and the narration could disagree, one of them would be lying and there would
   * be no way to tell which.
   */
  pipeline: PipelineStage[];
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

/**
 * One vendor's worth of a plan, on its way to becoming one purchase order.
 *
 * The planner decides line by line; a vendor is sent a document. This is where those two
 * shapes meet, and it exists as a named type rather than an inline object because the
 * grouping rule — one PO per vendor, every component still pegged to its SO line — is the
 * part a reader needs to find.
 */
interface PoGroup {
  vendorId: string;
  vendorName: string;
  /** Expected total, rounded exactly as PURCHASE will round it. */
  value: number;
  lines: Array<{
    itemCode: string;
    itemId: string;
    salesOrderLineId: string;
    qty: number;
    rate: number;
  }>;
}

/** A purchase order that now exists, with the plan's own labels kept beside it. */
interface CreatedPo extends CreatedPurchaseOrder {
  vendorId: string;
  vendorName: string;
  lineCount: number;
  expectedDate: string;
  lines: PoGroup["lines"];
}

interface LineDemand {
  lineId: string;
  itemId: string;
  itemCode: string;
  qty: number;
  reservedQty: number;
}

export interface ProductionDemand extends LineDemand {
  /** Finished quantity covered by this line's reservation plus still-free finished stock. */
  coveredQty: number;
  /** The exact quantity for this sales-order line that still has to be manufactured. */
  makeQty: number;
}

interface ComponentPeg {
  salesOrderLineId: string;
  qty: number;
}

interface MaterialPlan {
  shortages: ShortageLine[];
  /** Only the uncovered component quantity, allocated to the SO line that caused it. */
  shortagePegs: Map<string, ComponentPeg[]>;
}

interface CreatedWorkOrder extends CreatedProductionOrder {
  itemId: string;
  itemCode: string;
  salesOrderLineId: string;
  qty: number;
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

/**
 * The steps that come after the authority gate.
 *
 * Used by `retry` to decide which status a re-opened mission goes back to. A mission that
 * failed while investigating returns to `planning`; one that failed while acting returns to
 * `executing`, because the authority to act was already granted and re-asking for it would
 * be a second signature for one decision.
 */
const EXECUTE_KEYS: ReadonlySet<string> = new Set(["reserve", "procure", "workorder", "watch", "close"]);

/**
 * Does this look like a master's uuid, or like a sourcing code?
 *
 * `shortagesFor` puts the vendor master's uuid on a supplier when the vendor exists and the
 * scenario's CODE when it does not, so this is how the probe tells "V-GEN" from a real row
 * without a second query per supplier. Only ever used to answer that question.
 */
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The §7 demo universe. Copied from `tenant.middleware.ts`, which guards the same way. */
const DEMO_TENANT_IDS: ReadonlySet<string> = new Set([
  "0192a8c0-0000-7000-8000-000000000001", // 3S Precision Parts Pvt Ltd
  "0192a8c0-0000-7000-8000-000000000002", // Kaveri ElectroFab Industries
]);

/** Marks a plan version superseded because a PERSON refused its strategy, not because the
 *  world changed. The distinction matters: a supplier delay invalidates a plan, whereas
 *  this invalidates an APPROACH, and the approach must not be proposed again. */
const STRATEGY_REFUSED = "operator refused the strategy";

const num = (v: string | number | null | undefined): number => (v == null ? 0 : Number(v));

/**
 * Allocate the same finite finished-stock pool across every order line exactly once.
 *
 * The old mission summed every line's quantity and assigned it to line zero. Besides making
 * the wrong item, it also made a part-stocked order produce the quantity already on the
 * shelf. This function keeps the sales-order line as the unit of demand and shares stock
 * deterministically in line order. `reservedElsewhere` is removed first so another order's
 * promise is never treated as free stock.
 */
export function allocateProductionDemand(
  lines: readonly LineDemand[],
  onHand: ReadonlyMap<string, number>,
  reservedElsewhere: ReadonlyMap<string, number> = new Map(),
): ProductionDemand[] {
  const ownReserved = new Map<string, number>();
  for (const line of lines) {
    ownReserved.set(line.itemId, (ownReserved.get(line.itemId) ?? 0) + Math.min(line.qty, Math.max(0, line.reservedQty)));
  }

  const free = new Map<string, number>();
  for (const line of lines) {
    if (free.has(line.itemId)) continue;
    free.set(
      line.itemId,
      Math.max(
        0,
        (onHand.get(line.itemId) ?? 0) -
          (reservedElsewhere.get(line.itemId) ?? 0) -
          (ownReserved.get(line.itemId) ?? 0),
      ),
    );
  }

  return lines.map((line) => {
    const reserved = Math.min(line.qty, Math.max(0, line.reservedQty));
    const unreserved = Math.max(0, line.qty - reserved);
    const take = Math.min(unreserved, free.get(line.itemId) ?? 0);
    free.set(line.itemId, Math.max(0, (free.get(line.itemId) ?? 0) - take));
    return {
      ...line,
      coveredQty: round3(reserved + take),
      makeQty: round3(Math.max(0, line.qty - reserved - take)),
    };
  });
}

export interface SourcingPegAllocation {
  sourceIndex: number;
  itemCode: string;
  salesOrderLineId: string;
  qty: number;
}

/** Split planner sourcing quantities onto the SO lines whose component demand caused them. */
export function allocateSourcingPegs(
  sourcing: readonly { itemCode: string; qty: number }[],
  pegs: ReadonlyMap<string, readonly ComponentPeg[]>,
): { allocations: SourcingPegAllocation[]; unallocated: Array<{ itemCode: string; qty: number }> } {
  const remaining = new Map(
    [...pegs.entries()].map(([code, rows]) => [code, rows.map((r) => ({ ...r, qty: Math.max(0, r.qty) }))]),
  );
  const allocations: SourcingPegAllocation[] = [];
  const unallocated: Array<{ itemCode: string; qty: number }> = [];

  sourcing.forEach((source, sourceIndex) => {
    let left = Math.max(0, source.qty);
    const queue = remaining.get(source.itemCode) ?? [];
    for (const peg of queue) {
      if (left <= 1e-9) break;
      if (peg.qty <= 1e-9) continue;
      const take = Math.min(left, peg.qty);
      allocations.push({
        sourceIndex,
        itemCode: source.itemCode,
        salesOrderLineId: peg.salesOrderLineId,
        qty: round3(take),
      });
      peg.qty = round3(peg.qty - take);
      left = round3(left - take);
    }
    if (left > 1e-6) unallocated.push({ itemCode: source.itemCode, qty: left });
  });
  return { allocations, unallocated };
}

/** A stream/advance call must yield control at both kinds of durable wait. */
export function isMissionStopStatus(status: string): boolean {
  return ["awaiting_approval", "waiting", "completed", "failed", "cancelled"].includes(status);
}

/** The PO deadline represented by the plan, stable across an idempotent retry. */
export function expectedMaterialDate(planCreatedAt: Date | string, materialReadyDays: number): string {
  const date = typeof planCreatedAt === "string" ? planCreatedAt.slice(0, 10) : planCreatedAt.toISOString().slice(0, 10);
  const out = new Date(`${date}T00:00:00Z`);
  let left = Math.ceil(Math.max(0, materialReadyDays));
  // Same Monday–Saturday factory calendar as the deterministic planner. Kept local because
  // the planner currently exports the candidate, not its calendar helper, from the package
  // root; duplicating seven lines is safer than silently changing a planned working-day
  // deadline into calendar days.
  while (left > 0) {
    out.setUTCDate(out.getUTCDate() + 1);
    if (out.getUTCDay() !== 0) left--;
  }
  return out.toISOString().slice(0, 10);
}

export interface OutcomeGateInput {
  deliveryComplete: boolean;
  qualityComplete: boolean;
  invoiceComplete: boolean;
  unverifiedActions: number;
  onTime: boolean;
  forecastMarginPct: number;
  targetMarginPct: number;
}

/** A mission cannot close on plan values standing in for downstream facts. */
export function evaluateOutcomeGate(input: OutcomeGateInput): {
  downstreamReady: boolean;
  met: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!input.deliveryComplete) reasons.push("ordered quantity has not been dispatched");
  if (!input.qualityComplete) reasons.push("dispatched quantity is not fully covered by quality releases");
  if (!input.invoiceComplete) reasons.push("a dispatch invoice is missing");
  if (input.unverifiedActions > 0) reasons.push(`${input.unverifiedActions} action(s) are unverified`);
  if (!input.onTime) reasons.push("the final dispatch was after the promised date");
  if (input.forecastMarginPct + 1e-9 < input.targetMarginPct) {
    reasons.push(`forecast margin ${input.forecastMarginPct.toFixed(2)}% is below target ${input.targetMarginPct.toFixed(2)}%`);
  }
  const downstreamReady = input.deliveryComplete && input.qualityComplete && input.invoiceComplete;
  return {
    downstreamReady,
    met:
      downstreamReady &&
      input.unverifiedActions === 0 &&
      input.onTime &&
      input.forecastMarginPct + 1e-9 >= input.targetMarginPct,
    reasons,
  };
}

export function actionPersistenceMode(
  existing: { status: string; verified: boolean | null } | null,
): "insert" | "reuse_verified" | "reset_for_retry" {
  if (!existing) return "insert";
  return existing.status === "verified" && existing.verified === true ? "reuse_verified" : "reset_for_retry";
}

/**
 * Rupees, rounded to the paisa the same way PURCHASE rounds a PO line.
 *
 * Deliberately identical arithmetic rather than "close enough": the procure step compares
 * what it expected to commit against what the purchase orders actually total, and two
 * roundings that disagree by a paisa would fail that check on an order that was perfectly
 * correct — which is the kind of false alarm that gets a verification switched off.
 */
const paise = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
/** Append only if it is not already there. Keeps a fault list about faults, not occurrences. */
const note = (into: string[], line: string): void => {
  if (!into.includes(line)) into.push(line);
};

/**
 * "Somebody else is already doing exactly this" — the ONE refusal that is not a failure.
 *
 * `runIdempotent` answers `IDEMPOTENCY_IN_PROGRESS` when a request with the same key is
 * mid-flight. For an HTTP client that is "retry shortly". For an execute step it means a
 * sibling `advance()` — a double-click, an impatient stream, two browser tabs — is at this
 * instant creating the very documents this attempt was about to create.
 *
 * Measured, because it is not obvious: two concurrent advances on one mission both reach
 * `procure`, one raises the purchase order and the other gets this. Recording the loser's
 * experience as a failure marked the mission failed and narrated "nothing was ordered" while
 * a real, correct purchase order carrying that mission's number sat in PURCHASE. The
 * duplicate was prevented — that part worked — but the mission's account of itself was
 * wrong, which is the thing this product cannot get wrong.
 *
 * So the loser writes NOTHING and yields. The winner writes the step. If the winner then
 * dies before writing it, the next advance re-runs the step, the deterministic key replays
 * the documents it already created, and the record catches up. Self-healing, at the cost of
 * one wasted round trip.
 */
function isConcurrentAttempt(e: unknown): boolean {
  return e instanceof AppError && e.code === "IDEMPOTENCY_IN_PROGRESS";
}
/**
 * THE ONE PLACE THE THINKING COMES FROM.
 *
 * `DeterministicEngine` is rules and arithmetic — no model, no API key, nothing leaves the
 * process. It delegates to the planner and the narrator that were already here; it does not
 * hold a second copy of either. What it adds is a seam: this service now asks an INTERFACE
 * for a recommendation, a verification and a decision brief, so a real engine could be
 * swapped in behind `IntelligenceEngine` without this file changing.
 *
 * The observe steps (materials, capacity, sourcing) still call the narrator directly, and
 * that is deliberate rather than an omission: each of them holds only its own slice of the
 * evidence, and building a full `PlanningEvidence` snapshot just to phrase one sentence
 * would be a second database read for a wording.
 *
 * If a model ever sits here, `engine.kind` becomes "model", every step it touched can be
 * labelled on screen, and `verify()` still re-derives the numbers from the evidence. A
 * proposal the deterministic verifier cannot reproduce does not execute, whoever proposed it.
 */
const ENGINE: IntelligenceEngine = new DeterministicEngine();

/**
 * The facts a step VIEW needs that the step ROW does not hold.
 *
 * All three are properties of the mission rather than of the step — which order this is,
 * whether a step has been re-run, and where this mission's supplier terms came from — so
 * they are read once per view instead of once per row.
 */
interface StepContext {
  soNo: string;
  /** stepKey → the attempt number now showing, and the failure the retry recovered from. */
  retries: Map<string, { attempt: number; previousFailure: string | null }>;
  terms: { from: "seeded" | "spreadsheet"; file: string | null };
}

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
    // The two write ports. Interfaces, not services: this class cannot reach past
    // `createPurchaseOrder` into PO amendments or approvals even if a later step wanted to.
    @Inject(PURCHASE_ORDER_WRITER) private readonly purchaseWriter: PurchaseOrderWriter,
    @Inject(PRODUCTION_ORDER_WRITER) private readonly productionWriter: ProductionOrderWriter,
    // The order the mission is ABOUT, rather than one it produces. Same reasoning as the
    // two above: the mission asks SALES to take an order and never learns how Sales does it.
    @Inject(CUSTOMER_ORDER_WRITER) private readonly orderWriter: CustomerOrderWriter,
  ) {}

  /* ------------------------------------------------------- take a new order -- */

  /**
   * Take a customer's order and immediately open a mission on it.
   *
   * THIS IS THE DEMO'S FIRST STEP, and it exists to answer a question a seeded row cannot.
   * Picking an order off a list proves the engine runs; typing a customer's PO number in
   * front of the room and watching ONYX pick it up proves the engine is not a recording.
   * Nothing after this changes — the same thirteen steps run on the order that was just
   * created, because to the mission it is simply a confirmed order like any other.
   *
   * The two halves are deliberately NOT one transaction. SALES commits the order when SALES
   * is ready, and only then is there something to open a mission on; wrapping both would put
   * the mission in charge of when another module's document becomes durable (see the port).
   * The visible consequence is honest: if the credit gate holds the order, the order exists
   * and the mission does not, and the caller is told exactly that.
   */
  async startFromNewOrder(
    input: CreateFulfilmentCustomerOrderInput,
    tier: string = "A3",
    idempotencyKey?: string,
  ): Promise<{ order: CreatedCustomerOrder; mission: MissionView | null; heldReason?: string }> {
    // Derived from the request, never from the clock: replaying the same order must return
    // the first one rather than raise a second commitment against the same customer PO.
    const key = idempotencyKey ?? `mission-new-order-${input.customerId}-${input.custPoNo}`;
    const order = await this.orderWriter.createConfirmedOrder(input, key);

    if (order.status === "draft" || order.status === "cancelled") {
      return {
        order,
        mission: null,
        heldReason:
          `${order.soNo} was raised but is ${order.status}, so no mission was opened. `
          + "A mission commits money against a promise, and this order is not one yet.",
      };
    }
    return { order, mission: await this.start(order.id, tier) };
  }

  /**
   * The customers and parts the "new order" form chooses between.
   *
   * Both lists come through the same port as the write, so the form can never offer a
   * choice the write would then reject. `lastRate` is carried so the form can show what the
   * part last sold for rather than asking a presenter to invent a price mid-demo — and so
   * an item that has NEVER sold is visibly the one that needs terms typing in.
   */
  async orderableChoices(): Promise<{
    customers: Array<{ id: string; code: string; name: string }>;
    items: Array<{
      id: string; itemCode: string; name: string; uom: string;
      lastRate: number | null; lastHsn: string | null; lastGstRatePct: number | null;
    }>;
    tiers: typeof AUTONOMY_TIERS;
  }> {
    const [customers, items] = await Promise.all([
      this.orderWriter.listOrderableCustomers(),
      this.orderWriter.listSellableItems(),
    ]);
    return { customers, items, tiers: AUTONOMY_TIERS };
  }

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
      const linePromise = so.lines.map((l) => `${q3(num(l.qty))} ${l.itemCode}`).join(", ");

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
          statement: `Deliver ${linePromise || `${qty} unit`} to ${so.customerName} by ${promisedDate}, at or above ${SEEDED_FACTORY.marginFloorPct}% margin.`,
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
    if (state.m.status === "waiting") {
      // Waiting is a durable state, not a decorative step on the way to a fabricated
      // closure. A supplier/production/quality/dispatch event must wake the mission; an SSE
      // loop is not an event and may not advance it merely because the browser stayed open.
      return { step: null, status: "waiting", reason: state.m.waitingReason ?? "the mission is waiting for a downstream event" };
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
      if (!r) return null;
      return this.toStepView(r, await this.stepContext(tx, missionId, state.m.soNo));
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
      if (isMissionStopStatus(r.status)) break;
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
    // One released structure per finished-good line. Checking only line zero let a
    // multi-line order pass engineering and then either build the wrong item or fail much
    // later in PRODUCTION, after PURCHASE had already committed its materials.
    const structures = await Promise.all(
      obj.lines.map(async (line) => ({ line, bom: await this.bom.getActiveBomForItem(line.itemId) })),
    );

    return withTenant(async (tx) => {
      const missing = structures.filter((s) => !s.bom).map((s) => s.line.itemCode);
      const ok = structures.length > 0 && missing.length === 0;
      const evidence = structures.map(({ line, bom }) => ({
        source: "bom",
        provenance: "live",
        ref: bom ? `BOM v${bom.version ?? "?"} for ${line.itemCode}` : `no active BOM for ${line.itemCode}`,
        detail: bom ? `${bom.components.length} component lines, output ${bom.outputQty}` : "engineering has not released a structure",
      }));

      const narration = ok
        ? `${structures.map((s) => s.line.itemCode).join(", ")} ${structures.length === 1 ? "has" : "each have"} one released BOM in force. ` +
          `Every customer-order line was checked separately; none of their quantities was assigned to a different finished good.`
        : `${missing.join(", ") || "The order"} has no active BOM. Nothing downstream can be planned for that line; ` +
          `this needs an engineering release, which is not the mission's to grant.`;

      await this.writeStep(tx, missionId, plan, seq, {
        evidence,
        findings: {
          engineeringReady: ok,
          checkedLines: structures.length,
          missingItems: missing,
          componentLines: structures.reduce((n, s) => n + (s.bom?.components.length ?? 0), 0),
        },
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

    // THE ENGINE DECIDES; THIS FILE RECORDS. A strategy a person has already turned down is
    // handed in rather than filtered out here: the engine scores it out of contention and
    // keeps it VISIBLE in the candidate list with their words on it, because deleting it
    // would make the next plan look as though it never considered the obvious option.
    const rec = ENGINE.recommend(ev, refused);
    const ranked = rec.ranked;
    const chosen = rec.chosen;
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
        rationale: rec.rationale,
        tradeOffWeights: rec.weights,
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
        narration: rec.rationale,
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
      // Independent by construction: it re-derives the date, the cost and the margin from
      // the evidence rather than reading the plan's own claims back to itself.
      const c = ENGINE.verify(chosen, ev);

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
        narration: ENGINE.explain({ of: "critique", critique: c }),
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

      const brief = ENGINE.brief(chosen, ranked, ev, m.soNo, m.customerName);
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
      const demand = await this.lineDemandInTx(tx, m.salesOrderId);

      const reserved: Array<{ lineId: string; line: string; qty: number; total: number }> = [];
      for (const l of demand) {
        const take = Math.max(0, l.coveredQty - l.reservedQty);
        if (take <= 1e-9) continue;
        await tx.update(salesOrderLine)
          .set({ reservedQty: q3(l.coveredQty), updatedAt: new Date(), updatedBy: currentTenant().actorId })
          .where(eq(salesOrderLine.id, l.lineId));
        reserved.push({ lineId: l.lineId, line: l.itemCode, qty: take, total: l.coveredQty });
      }

      const action = await this.recordAction(tx, missionId, pv.id, {
        actionType: "inventory.reserve",
        targetDomain: "inventory",
        title: `Reserve stock against ${m.soNo}`,
        params: {
          lines: demand.map((l) => ({ salesOrderLineId: l.lineId, itemId: l.itemId, reservedQty: l.coveredQty })),
        },
        autonomyTier: "A3",
      });

      // POSTCONDITION — re-read, do not trust the write. `executed` and `verified` are
      // separate claims and this is the step that turns one into the other.
      const after = await tx.select({ id: salesOrderLine.id, reservedQty: salesOrderLine.reservedQty })
        .from(salesOrderLine).where(eq(salesOrderLine.orderId, m.salesOrderId));
      const totalReserved = after.reduce((n, r) => n + num(r.reservedQty), 0);
      const observed = new Map(after.map((r) => [r.id, num(r.reservedQty)]));
      const expected = demand.reduce((n, r) => n + r.coveredQty, 0);
      const verified = demand.every((l) => (observed.get(l.lineId) ?? 0) + 1e-6 >= l.coveredQty);

      await this.verifyAction(tx, action.id, verified, {
        check: "sales_order_line.reserved_qty re-read after write",
        expectedAtLeast: expected,
        observed: totalReserved,
      });

      await this.writeStep(tx, missionId, plan, seq, {
        planVersionId: pv.id,
        evidence: demand.map((r) => ({
          source: "sales_order_line.reserved_qty",
          provenance: "live" as const,
          ref: `${r.itemCode} · ${r.lineId}`,
          detail: `ordered ${q3(r.qty)}, covered ${q3(r.coveredQty)}, still to make ${q3(r.makeQty)}`,
        })),
        findings: { reserved, lineDemand: demand, verified, totalReserved },
        narration: reserved.length
          ? `Reserved ${reserved.map((r) => `${q3(r.qty)} ${r.line}`).join(", ")} against ${m.soNo}. Re-read after writing: ${q3(totalReserved)} committed. That quantity is no longer available to promise to anybody else.`
          : demand.some((l) => l.coveredQty > 1e-9)
            ? `No additional reservation was needed. ${q3(totalReserved)} units were already reserved across ${m.soNo}; each line's uncovered balance remains its own production demand.`
            : `Nothing to reserve — no free finished stock is available for ${m.soNo}. Each line's uncovered quantity depends on the supply this plan is about to commit.`,
        confidence: verified ? 100 : 0,
      });
      return { status: "executing" };
    });
  }

  /**
   * COMMIT THE PURCHASE.
   *
   * This step used to write a `fulfilment_action` saying it had bought the material and
   * stop there. No `purchase_order` row was ever created, so the mission's own narration
   * ("Committed 775 RAW-BLT-M8 to Bharat Fasteners") described a document that did not
   * exist anywhere in the product it was being demonstrated inside. That is the one kind of
   * untruth this system cannot afford, because everything else it claims rests on its
   * account of itself being checkable.
   *
   * ---------------------------------------------------------------------------
   * THREE PHASES, AND THE PHASE BOUNDARY IS A TRANSACTION BOUNDARY
   * ---------------------------------------------------------------------------
   *   1. READ   — one `withTenant`, closed before anything else happens.
   *   2. CREATE — the port, which opens its OWN transaction per document.
   *   3. WRITE  — a second `withTenant` recording the action, the postcondition and the step.
   *
   * The shape is forced, not stylistic. `withTenant` opens a transaction on a pooled
   * connection and `PurchaseService.createPo` opens another; calling the port from inside an
   * open block therefore holds two of ten pool slots for the duration and, with a handful of
   * concurrent missions, deadlocks the pool waiting for connections that the waiting
   * transactions are themselves holding. Read, close, call, reopen.
   *
   * ---------------------------------------------------------------------------
   * ONE PURCHASE ORDER PER VENDOR
   * ---------------------------------------------------------------------------
   * The plan reasons in LINES (this component, from that supplier, at that price); a vendor
   * receives a DOCUMENT. Five lines across three vendors is three purchase orders — not one
   * with three suppliers on it, which nobody can act on, and not five with one line each,
   * which is three phone calls' work turned into five.
   *
   * ---------------------------------------------------------------------------
   * THE IDEMPOTENCY KEY IS WHAT STOPS THE VENDOR GETTING THE ORDER TWICE
   * ---------------------------------------------------------------------------
   * Derived from mission + plan version + vendor, and from nothing that varies between
   * attempts. If this step dies after raising two of three purchase orders — a deploy, a
   * dropped connection, an impatient second click — the re-run replays the two and raises
   * only the third. The plan VERSION is in the key on purpose: a replan is a different
   * commitment and must be allowed to produce a different document, and without the version
   * the second plan would collide with the first key under a different request body and be
   * rejected outright (`IDEMPOTENCY_MISMATCH`) mid-demo.
   */
  private async stepProcure(missionId: string, plan: StepPlan, seq: number) {
    /* ---- phase 1: read everything the documents will need, then let the tx go ---- */
    const ctx = await withTenant(async (tx) => {
      const m = await this.loadMission(tx, missionId);
      const pv = await this.currentPlan(tx, missionId);
      const chosen = pv.chosen as Candidate;
      const [so] = await tx
        .select({ soNo: salesOrder.soNo })
        .from(salesOrder)
        .where(eq(salesOrder.id, m.salesOrderId));

      // The planner speaks in CODES, because that is the vocabulary of the sourcing
      // scenario; a document needs uuids. Both masters are read once here rather than once
      // per line — the vendor master of an MSME is a few hundred rows, and a query per
      // sourcing line inside a loop is the shape that turns into a hundred round trips the
      // week somebody seeds a real catalogue.
      const vendors = await tx.select({ id: vendor.id, code: vendor.code, name: vendor.name }).from(vendor);
      const codes = [...new Set(chosen.sourcing.map((s) => s.itemCode))];
      const items = codes.length
        ? await tx.select({ id: item.id, code: item.itemCode }).from(item).where(inArray(item.itemCode, codes))
        : [];

      // A FAULT SOMEBODY ARMED ON PURPOSE (demo scenario 8), and the only invented failure
      // in the product. It is one row in `fulfilment_event` with `simulated: true`, it is
      // consumed once, and the step that trips over it says in its own narration that
      // PURCHASE was never called. A correctly configured tenant has no broken purchase path
      // to borrow, and faking one silently would poison every honest thing on this screen.
      const armed = await tx
        .select({ id: fulfilmentEvent.id })
        .from(fulfilmentEvent)
        .where(and(
          eq(fulfilmentEvent.missionId, missionId),
          eq(fulfilmentEvent.eventName, SIMULATED_FAULT.eventName),
          sql`${fulfilmentEvent.handledAt} IS NULL`,
        ))
        .limit(1);

      return {
        m, pv, chosen,
        soNo: so?.soNo ?? m.soNo,
        vendors, items,
        armedFaultId: armed[0]?.id ?? null,
      };
    });

    const { m, pv, chosen } = ctx;
    const uploaded = await this.uploadedTermsFor(missionId);
    const material = await this.materialPlanForOrder(m.salesOrderId, uploaded);
    const pegged = allocateSourcingPegs(chosen.sourcing, material.shortagePegs);
    const vendorById = new Map(ctx.vendors.map((v) => [v.id, v]));
    const vendorByCode = new Map(ctx.vendors.map((v) => [v.code, v]));
    const itemByCode = new Map(ctx.items.map((i) => [i.code, i]));

    // Grouped by vendor id. Every line carries the common plan material-ready deadline;
    // that is the date by which all vendors must have put the required material on site.
    const groups = new Map<string, PoGroup>();
    const unresolved: string[] = [];

    for (const miss of pegged.unallocated) {
      note(
        unresolved,
        `${q3(miss.qty)} ${miss.itemCode} cannot be pegged to a sales-order line; the plan and the line-level BOM demand disagree`,
      );
    }
    const pegsBySource = new Map<number, SourcingPegAllocation[]>();
    for (const allocation of pegged.allocations) {
      const list = pegsBySource.get(allocation.sourceIndex) ?? [];
      list.push(allocation);
      pegsBySource.set(allocation.sourceIndex, list);
    }

    for (const [sourceIndex, s] of chosen.sourcing.entries()) {
      // `SourcingDecision.vendorId` holds the master's uuid when the vendor exists and the
      // scenario's CODE when it does not — see the fallback in `computeShortages`. Both are
      // tried, in that order, so the id path stays the normal one and the code path only
      // catches a scenario vendor that was never seeded.
      const v = vendorById.get(s.vendorId) ?? vendorByCode.get(s.vendorId);
      const it = itemByCode.get(s.itemCode);
      if (!v) {
        // Recorded once per missing MASTER, not once per line that wanted it. Four bolts
        // and a seal from the same absent vendor is one problem stated once, not the same
        // sentence printed five times in a row on the step card.
        note(unresolved, `vendor '${s.vendorName}' (${s.vendorId}) is not in this tenant's vendor master`);
        continue;
      }
      if (!it) {
        note(unresolved, `item code '${s.itemCode}' is not in this tenant's item master`);
        continue;
      }
      const allocations = pegsBySource.get(sourceIndex) ?? [];
      if (s.qty > 1e-9 && allocations.length === 0) {
        note(unresolved, `${q3(s.qty)} ${s.itemCode} has no customer-order line peg`);
        continue;
      }
      const g = groups.get(v.id) ?? { vendorId: v.id, vendorName: v.name, value: 0, lines: [] };
      for (const allocation of allocations) {
        g.lines.push({
          itemCode: s.itemCode,
          itemId: it.id,
          salesOrderLineId: allocation.salesOrderLineId,
          qty: allocation.qty,
          rate: s.unitPrice,
        });
        g.value = paise(g.value + paise(allocation.qty * s.unitPrice));
      }
      groups.set(v.id, g);
    }

    // A CODE THAT WILL NOT RESOLVE STOPS THE STEP. It would be one line of code to skip the
    // offending sourcing decision and carry on, and the result would be a mission that
    // reports a completed purchase while one component was silently never ordered — a
    // shortage nobody finds until the line stops. Failing here is loud, correct, and
    // recoverable by seeding the master the plan is asking for.
    if (unresolved.length > 0) {
      return withTenant(async (tx) => {
        await this.writeStep(tx, missionId, plan, seq, {
          planVersionId: pv.id,
          evidence: unresolved.map((u) => ({
            source: "vendor + item master",
            provenance: "live" as const,
            ref: "unresolved reference",
            detail: u,
          })),
          findings: { purchaseOrders: [], committed: chosen.sourcing, totalValue: 0, unresolved, verified: false },
          narration:
            `Nothing was ordered. The plan names ${unresolved.length} reference${unresolved.length === 1 ? "" : "s"} this tenant's masters do not hold: ` +
            `${unresolved.join("; ")}. Raising the rest and quietly dropping the unresolvable line would leave ` +
            `${ctx.soNo} short of a component with no record of why, so the mission stops instead.`,
          confidence: 0,
          status: "failed",
          refusedReason: "the plan names a vendor or an item this tenant does not have",
        });
        await this.setStatus(tx, missionId, "failed", "the plan names a vendor or an item this tenant does not have");
        return { status: "failed" };
      });
    }

    /* ---- phase 2: the real documents, each in its own transaction ---- */
    const wanted = [...groups.values()];
    // This is the material-ready date of the plan version being executed, not `SO date +
    // lead time`. An old customer order may be planned today; dating its PO from the order
    // date can make the expected receipt precede the document that promises it. Anchoring
    // to plan creation is also stable across an idempotent retry.
    const planMaterialReadyDate = expectedMaterialDate(pv.createdAt, chosen.materialReadyDays);
    const expectedValue = paise(wanted.reduce((n, g) => n + g.value, 0));
    const created: CreatedPo[] = [];
    let failure: string | null = null;

    // Nothing is even attempted while a fault is armed. Calling PURCHASE and then throwing
    // its answer away would leave real documents behind a step that reports a failure.
    for (const g of ctx.armedFaultId === null ? wanted : []) {
      const key = `fulfil:${missionId}:v${pv.versionNo}:procure:${g.vendorId}`;
      try {
        const po = await this.purchaseWriter.createPurchaseOrder(
          {
            vendorId: g.vendorId,
            expectedDate: planMaterialReadyDate,
            remarks: `${m.missionNo} · ${ctx.soNo} — raised by the fulfilment mission on plan v${pv.versionNo}`,
            lines: g.lines.map((l) => ({
              itemId: l.itemId,
              qty: l.qty,
              rate: l.rate,
              salesOrderLineId: l.salesOrderLineId,
            })),
          },
          key,
        );
        created.push({
          ...po,
          vendorId: g.vendorId,
          vendorName: g.vendorName,
          lineCount: g.lines.length,
          expectedDate: planMaterialReadyDate,
          lines: g.lines,
        });
      } catch (e) {
        // A sibling advance is raising these same orders right now. Yield to it without
        // writing anything — see `isConcurrentAttempt`.
        if (isConcurrentAttempt(e)) return { status: "executing" };
        // Stop at the first refusal rather than pressing on. Whatever PURCHASE objected to
        // — a vendor gone inactive, a duplicate ticket, an item it will not price — the
        // remaining orders are part of the same plan and the same reason is likely to apply.
        failure = `${g.vendorName}: ${e instanceof Error ? e.message : String(e)}`;
        break;
      }
    }
    if (ctx.armedFaultId !== null && wanted.length > 0) failure = SIMULATED_FAULT.reason;

    /* ---- phase 3: record what actually happened, and prove it ---- */
    return withTenant(async (tx) => {
      // One shot. The retry finds no armed fault and raises the documents for real, which is
      // the whole point of the scenario: the second attempt is not a different code path.
      if (ctx.armedFaultId !== null && failure === SIMULATED_FAULT.reason) {
        await tx.update(fulfilmentEvent).set({
          disposition: "deterministic",
          handledAt: new Date(),
          impact: { lifecycle: "fired", step: SIMULATED_FAULT.stepKey, planVersion: pv.versionNo, documentsPrevented: wanted.length },
          updatedAt: new Date(),
          updatedBy: currentTenant().actorId,
        }).where(eq(fulfilmentEvent.id, ctx.armedFaultId));
      }

      const totalValue = paise(created.reduce((n, c) => n + c.totalValue, 0));
      const action = await this.recordAction(tx, missionId, pv.id, {
        actionType: "purchase.commit",
        targetDomain: "purchase",
        title: created.length
          ? `Raise ${created.length} purchase order(s) for ${ctx.soNo}`
          : `Commit ${chosen.sourcing.length} purchase line(s) for ${ctx.soNo}`,
        params: {
          sourcing: chosen.sourcing,
          strategy: chosen.key,
          materialReadyDate: planMaterialReadyDate,
          purchaseOrders: wanted.map((g) => ({ vendorId: g.vendorId, lines: g.lines })),
        },
        result: {
          purchaseOrders: created.map((c) => ({ id: c.id, poNo: c.poNo, vendorName: c.vendorName, value: c.totalValue })),
          failure,
        },
        autonomyTier: chosen.requiresApproval ? "A4" : "A3",
      });

      // POSTCONDITION — re-read PURCHASE's own table, not the answer the port handed back.
      // A writer reporting its own success is a claim; the row being there afterwards is
      // evidence, and this is the step that turns `executed` into `verified`.
      const rows = created.length
        ? await tx
            .select({
              id: purchaseOrder.id,
              poNo: purchaseOrder.poNo,
              vendorId: purchaseOrder.vendorId,
              status: purchaseOrder.status,
              expectedDate: purchaseOrder.expectedDate,
              remarks: purchaseOrder.remarks,
              totalAmount: purchaseOrder.totalAmount,
            })
            .from(purchaseOrder)
            .where(inArray(purchaseOrder.id, created.map((c) => c.id)))
        : [];
      const poLines = created.length
        ? await tx
            .select({
              poId: purchaseOrderLine.poId,
              itemId: purchaseOrderLine.itemId,
              qty: purchaseOrderLine.qty,
              rate: purchaseOrderLine.rate,
              salesOrderLineId: purchaseOrderLine.salesOrderLineId,
            })
            .from(purchaseOrderLine)
            .where(inArray(purchaseOrderLine.poId, created.map((c) => c.id)))
        : [];
      const byId = new Map(rows.map((r) => [r.id, r]));
      const observedValue = paise(rows.reduce((n, r) => n + num(r.totalAmount), 0));
      // A paisa of tolerance per document, and no more. Both sides round the same way, so
      // this only absorbs float noise — a genuinely different total is a different order.
      const valueHolds = Math.abs(observedValue - expectedValue) <= 0.01 * Math.max(1, rows.length);
      const semanticFaults: string[] = [];
      const lineKey = (l: { itemId: string; salesOrderLineId: string | null; qty: number | string; rate: number | string }) =>
        `${l.itemId}|${l.salesOrderLineId ?? "none"}|${q3(num(l.qty))}|${q2(num(l.rate))}`;
      for (const expected of created) {
        const header = byId.get(expected.id);
        if (!header) {
          semanticFaults.push(`${expected.poNo} was not found after creation`);
          continue;
        }
        if (header.vendorId !== expected.vendorId) semanticFaults.push(`${header.poNo} is on a different vendor`);
        if (header.status !== "draft") semanticFaults.push(`${header.poNo} is ${header.status}, expected draft`);
        if (header.expectedDate?.toISOString().slice(0, 10) !== expected.expectedDate) {
          semanticFaults.push(`${header.poNo} does not carry material-ready date ${expected.expectedDate}`);
        }
        if (!(header.remarks ?? "").includes(m.missionNo) || !(header.remarks ?? "").includes(ctx.soNo)) {
          semanticFaults.push(`${header.poNo} remarks lost the mission/order trace`);
        }
        const expectedLines = expected.lines.map((l) => lineKey(l)).sort();
        const observedLines = poLines.filter((l) => l.poId === expected.id).map((l) => lineKey(l)).sort();
        if (JSON.stringify(expectedLines) !== JSON.stringify(observedLines)) {
          semanticFaults.push(`${header.poNo} item/quantity/rate/sales-order-line pegs do not match the plan`);
        }
      }
      const verified =
        failure === null &&
        rows.length === wanted.length &&
        valueHolds &&
        semanticFaults.length === 0;
      const refusal = failure ?? (verified ? null : semanticFaults.join("; ") || "purchase-order postcondition did not hold");

      await this.verifyAction(tx, action.id, verified, {
        check: "purchase_order and purchase_order_line re-read: vendor, date, status, value, item, quantity, rate and SO-line peg",
        expectedOrders: wanted.length,
        observedOrders: rows.length,
        expectedValue: q2(expectedValue),
        observedValue: q2(observedValue),
        materialReadyDate: planMaterialReadyDate,
        semanticFaults,
        poNos: rows.map((r) => r.poNo),
        failure: refusal,
      });

      const evidence = created.map((c) => ({
        source: "purchase_order",
        provenance: "live" as const,
        ref: byId.get(c.id)?.poNo ?? c.poNo,
        detail:
          `${c.vendorName} — ${c.lineCount} line(s), Rs ${fmtInr(num(byId.get(c.id)?.totalAmount ?? c.totalValue))}, ` +
          `status ${byId.get(c.id)?.status ?? c.status}`,
      }));

      const narration = failure === SIMULATED_FAULT.reason
        ? `Nothing was ordered, and nothing was attempted. ${SIMULATED_FAULT.reason} ` +
          `${wanted.length} purchase order(s) worth Rs ${fmtInr(expectedValue)} are still owed to this plan. ` +
          `The mission is not going to report documents that do not exist — retry the step and it will run again ` +
          `from the same evidence, against the same idempotency keys.`
        : refusal !== null
        ? `Stopped part-way. ${created.length === 0 ? "No purchase order was raised" : `${created.length} purchase order(s) were raised (${created.map((c) => c.poNo).join(", ")})`} ` +
          `but the purchase commitment could not be verified — ${refusal}. The rest of this plan's material is NOT proven on order. ` +
          `A half-placed order reported as a completed one is worse than a stopped mission, so this stops.`
        : created.length
          ? `Raised ${created.length} purchase order${created.length === 1 ? "" : "s, one per vendor"}: ` +
            `${created.map((c) => `${c.poNo} on ${c.vendorName} for Rs ${fmtInr(c.totalValue)}`).join("; ")}. ` +
            `Rs ${fmtInr(totalValue)} of purchase value against plan version ${pv.versionNo}, each document carrying ` +
            `${m.missionNo} and ${ctx.soNo} in its remarks. Re-read from purchase_order afterwards: ${rows.length} document(s) ` +
            `totalling Rs ${fmtInr(observedValue)}. They are DRAFTS — the stores-to-admin approval workflow still stands between ` +
            `this and a commitment to the vendor, because a mission may decide what to buy and may not sign for it.`
          : `No purchase is required — the order is covered from stock.`;

      await this.writeStep(tx, missionId, plan, seq, {
        planVersionId: pv.id,
        evidence,
        findings: {
          // The real documents, by number. `committed` stays beside them because the
          // sourcing decision is still what a reader wants to see explained.
          purchaseOrders: created.map((c) => ({ poNo: c.poNo, vendorName: c.vendorName, value: c.totalValue })),
          committed: chosen.sourcing,
          totalValue,
          vendorCount: wanted.length,
          verified,
          failure: refusal,
        },
        narration,
        confidence: verified ? 96 : 0,
        status: verified ? "succeeded" : "failed",
        refusedReason: refusal,
      });

      if (!verified) {
        await this.setStatus(tx, missionId, "failed", `purchase order creation/verification failed — ${refusal}`);
        return { status: "failed" };
      }
      return { status: "executing" };
    });
  }

  /**
   * RELEASE THE WORK ORDER — a real `production_order`, not a sentence about one.
   *
   * Same three phases and the same reason as `stepProcure`: read, then call the port (which
   * opens its own transaction), then record and verify.
   *
   * The postcondition used to be the literal `true`. It recorded a `check` string describing
   * something nobody had looked at, which is worse than no check at all — a verification
   * that cannot fail teaches everyone downstream to trust a column that means nothing. It is
   * now a re-read of the created row asserting that it exists, that it carries the sales
   * order line it was released for, and that it is for the quantity the plan committed to.
   */
  private async stepWorkOrder(missionId: string, plan: StepPlan, seq: number) {
    /* ---- phase 1: read ---- */
    const ctx = await withTenant(async (tx) => {
      const m = await this.loadMission(tx, missionId);
      const pv = await this.currentPlan(tx, missionId);
      return {
        m,
        pv,
        chosen: pv.chosen as Candidate,
        demand: await this.lineDemandInTx(tx, m.salesOrderId),
      };
    });
    const { pv, chosen } = ctx;
    const wanted = ctx.demand.filter((line) => line.makeQty > 1e-9);

    /* ---- phase 2: one real document per sales-order line that is not covered by stock ---- */
    const created: CreatedWorkOrder[] = [];
    let failure: string | null = null;
    for (const line of wanted) {
      // The SO line is in the key. A retry replays line 1 and can still raise line 2 after
      // line 2's first attempt failed; it can never aggregate both lines into a duplicate
      // line-zero work order.
      const key = `fulfil:${missionId}:v${pv.versionNo}:workorder:${line.lineId}`;
      try {
        const order = await this.productionWriter.createProductionOrder(
          {
            itemId: line.itemId,
            qty: line.makeQty,
            salesOrderLineId: line.lineId,
            needDate: chosen.completionDate,
          },
          key,
        );
        created.push({
          ...order,
          itemId: line.itemId,
          itemCode: line.itemCode,
          salesOrderLineId: line.lineId,
          qty: line.makeQty,
        });
      } catch (e) {
        if (isConcurrentAttempt(e)) return { status: "executing" };
        failure = `${line.itemCode} / ${line.lineId}: ${e instanceof Error ? e.message : String(e)}`;
        break;
      }
    }

    /* ---- phase 3: record and prove ---- */
    return withTenant(async (tx) => {
      const action = await this.recordAction(tx, missionId, pv.id, {
        actionType: "production.release",
        targetDomain: "production",
        title: `Release ${wanted.length} work order(s) for ${ctx.m.soNo}`,
        params: {
          needDate: chosen.completionDate,
          workOrders: wanted.map((line) => ({
            itemId: line.itemId,
            qty: line.makeQty,
            salesOrderLineId: line.lineId,
          })),
        },
        result: {
          productionOrders: created.map((o) => ({ id: o.id, orderNo: o.orderNo, salesOrderLineId: o.salesOrderLineId })),
          failure,
        },
        autonomyTier: "A3",
      });

      // POSTCONDITION — the row itself, read back out of PRODUCTION's table. The claim being
      // checked is not "a work order exists" but "a work order exists AND it knows which
      // customer commitment it serves", because the second is the part that would silently
      // regress: `createFromPlan` accepted `salesOrderLineId` for a release and dropped it on
      // the floor for months without a single test noticing.
      const rows = created.length
        ? await tx
            .select({
              id: productionOrder.id,
              orderNo: productionOrder.orderNo,
              itemId: productionOrder.itemId,
              status: productionOrder.status,
              qtyToProduce: productionOrder.qtyToProduce,
              salesOrderLineId: productionOrder.salesOrderLineId,
              needDate: productionOrder.needDate,
            })
            .from(productionOrder)
            .where(inArray(productionOrder.id, created.map((o) => o.id)))
        : [];
      const rowsById = new Map(rows.map((r) => [r.id, r]));
      const semanticFaults: string[] = [];
      for (const expected of created) {
        const row = rowsById.get(expected.id);
        if (!row) {
          semanticFaults.push(`${expected.orderNo} was not found after creation`);
          continue;
        }
        if (row.itemId !== expected.itemId) semanticFaults.push(`${row.orderNo} is for the wrong finished good`);
        if (row.salesOrderLineId !== expected.salesOrderLineId) semanticFaults.push(`${row.orderNo} lost its sales-order-line peg`);
        if (Math.abs(num(row.qtyToProduce) - expected.qty) >= 1e-6) semanticFaults.push(`${row.orderNo} has the wrong quantity`);
        if (row.needDate !== chosen.completionDate) semanticFaults.push(`${row.orderNo} has the wrong need date`);
        if (row.status !== "planned") semanticFaults.push(`${row.orderNo} is ${row.status}, expected planned`);
      }
      const verified =
        failure === null &&
        rows.length === wanted.length &&
        semanticFaults.length === 0;
      const refusal = failure ?? (verified ? null : semanticFaults.join("; ") || "production-order postcondition did not hold");

      await this.verifyAction(tx, action.id, verified, {
        check: "production_order re-read per SO line: item, quantity, demand peg, need date and planned status",
        expectedOrders: wanted.length,
        observedOrders: rows.length,
        productionOrderNos: rows.map((r) => r.orderNo),
        semanticFaults,
        failure: refusal,
      });

      const narration = refusal
        ? `${created.length === 0 ? "No work order was released" : `${created.length} work order(s) were released (${created.map((o) => o.orderNo).join(", ")})`}, ` +
          `but the complete line-level release could not be verified: ${refusal}. ${ctx.m.soNo} stops rather than treating a partial shop-floor release as complete.`
        : created.length > 0
          ? `Released ${created.length} work order(s), one for each uncovered customer-order line: ` +
            `${created.map((o) => `${o.orderNo} · ${q3(o.qty)} ${o.itemCode}`).join("; ")}. ` +
            `Each was re-read with its item, quantity, need date and sales-order-line peg intact.`
          : `No work order is required. Finished stock reservations cover every line on ${ctx.m.soNo}; zero production documents were created.`;

      await this.writeStep(tx, missionId, plan, seq, {
        planVersionId: pv.id,
        evidence: rows.length
          ? rows.map((row) => ({
              source: "production_order",
              provenance: "live" as const,
              ref: row.orderNo,
              detail:
                `${q3(num(row.qtyToProduce))} units, status ${row.status}, need date ${row.needDate ?? "—"}, ` +
                `pegged to sales order line ${row.salesOrderLineId ?? "none"}`,
            }))
          : [{
              source: "production_order",
              provenance: "live" as const,
              ref: wanted.length === 0 ? "not required" : "not created",
              detail: wanted.length === 0 ? "every sales-order line is covered by reserved finished stock" : refusal ?? "the work order was not created",
            }],
        findings: {
          productionOrders: rows.map((r) => ({
            id: r.id,
            orderNo: r.orderNo,
            itemId: r.itemId,
            qty: num(r.qtyToProduce),
            salesOrderLineId: r.salesOrderLineId,
            needDate: r.needDate,
          })),
          lineDemand: ctx.demand,
          verified,
          failure: refusal,
        },
        narration,
        confidence: verified ? 94 : 0,
        status: verified ? "succeeded" : "failed",
        refusedReason: refusal,
      });

      if (!verified) {
        await this.setStatus(tx, missionId, "failed", refusal);
        return { status: "failed" };
      }
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
      const actions = await tx.select().from(fulfilmentAction).where(eq(fulfilmentAction.missionId, missionId));
      const versions = await tx.select({ n: fulfilmentPlanVersion.versionNo }).from(fulfilmentPlanVersion)
        .where(eq(fulfilmentPlanVersion.missionId, missionId));
      const approved = actions.filter((a) => a.approvalId !== null).length;
      const unverified = actions.filter((a) => a.verified !== true);
      const orderLines = await tx
        .select({
          id: salesOrderLine.id,
          itemId: salesOrderLine.itemId,
          qty: salesOrderLine.qty,
          deliveredQty: salesOrderLine.deliveredQty,
        })
        .from(salesOrderLine)
        .where(eq(salesOrderLine.orderId, m.salesOrderId));
      const dispatches = await tx
        .select({ id: dispatch.id, no: dispatch.dispatchNo, date: dispatch.dispatchDate, status: dispatch.status })
        .from(dispatch)
        .where(eq(dispatch.orderId, m.salesOrderId));
      const dispatchLines = dispatches.length
        ? await tx
            .select({ dispatchId: dispatchLine.dispatchId, orderLineId: dispatchLine.orderLineId, qty: dispatchLine.qty })
            .from(dispatchLine)
            .where(inArray(dispatchLine.dispatchId, dispatches.map((d) => d.id)))
        : [];
      const releases = orderLines.length
        ? await tx
            .select({ lineId: qualityRelease.salesOrderLineId, releaseNo: qualityRelease.releaseNo, qty: qualityRelease.qtyReleased })
            .from(qualityRelease)
            .where(inArray(qualityRelease.salesOrderLineId, orderLines.map((l) => l.id)))
        : [];
      const invoices = await tx
        .select({ invoiceNo: arOpenItem.invoiceNo, dispatchRef: arOpenItem.dispatchRef, gross: arOpenItem.grossReceivable })
        .from(arOpenItem)
        .where(eq(arOpenItem.soRef, m.soNo));

      const dispatchedByLine = new Map<string, number>();
      for (const row of dispatchLines) {
        dispatchedByLine.set(row.orderLineId, (dispatchedByLine.get(row.orderLineId) ?? 0) + num(row.qty));
      }
      const releasedByLine = new Map<string, number>();
      for (const row of releases) {
        if (!row.lineId) continue;
        releasedByLine.set(row.lineId, (releasedByLine.get(row.lineId) ?? 0) + num(row.qty));
      }
      const orderedQty = orderLines.reduce((n, l) => n + num(l.qty), 0);
      const deliveredQty = orderLines.reduce((n, l) => n + num(l.deliveredQty), 0);
      const deliveryComplete =
        orderLines.length > 0 &&
        dispatches.length > 0 &&
        orderLines.every((l) =>
          num(l.deliveredQty) + 1e-6 >= num(l.qty) &&
          (dispatchedByLine.get(l.id) ?? 0) + 1e-6 >= num(l.deliveredQty),
        );
      const qualityComplete =
        deliveryComplete &&
        orderLines.every((l) => (releasedByLine.get(l.id) ?? 0) + 1e-6 >= num(l.deliveredQty));
      const invoiceRefs = new Set(invoices.map((i) => i.dispatchRef));
      const invoiceComplete =
        dispatches.length > 0 &&
        dispatches.every((d) => invoiceRefs.has(d.no));
      const actualDate = dispatches
        .map((d) => d.date)
        .sort()
        .at(-1) ?? null;
      const forecastMarginPct = num(pv.expectedMarginPct);
      const targetMarginPct = num(m.targetMarginPct);
      const gate = evaluateOutcomeGate({
        deliveryComplete,
        qualityComplete,
        invoiceComplete,
        unverifiedActions: unverified.length,
        onTime: actualDate !== null && actualDate <= m.promisedDate,
        forecastMarginPct,
        targetMarginPct,
      });

      const outcome = {
        orderedQty,
        deliveredQty,
        promisedDate: m.promisedDate,
        actualDate,
        plannedCost: num(pv.expectedCost),
        // No production-cost roll-up exists yet. Null is an honest missing fact; copying
        // planned cost here used to manufacture an "actual" margin from the proposal.
        actualCost: null,
        forecastMarginPct,
        targetMarginPct,
        targetMarginMet: forecastMarginPct + 1e-9 >= targetMarginPct,
        invoicedGross: invoices.reduce((n, i) => n + num(i.gross), 0),
        dispatches: dispatches.map((d) => ({ dispatchNo: d.no, date: d.date, status: d.status })),
        qualityReleases: releases.map((r) => ({ releaseNo: r.releaseNo, salesOrderLineId: r.lineId, qty: num(r.qty) })),
        autonomousActions: actions.length - approved,
        approvedActions: approved,
        planVersions: versions.length,
        actionsVerified: actions.length - unverified.length,
        actionsTotal: actions.length,
        reasons: gate.reasons,
      };

      if (!gate.downstreamReady) {
        // Do not write the close step: the arc must still have a close step to run after a
        // real dispatch/quality/invoice event wakes it. Writing a "waiting" close row would
        // mark it done because resume is row-based.
        const reason = `outcome not yet proven — ${gate.reasons.join("; ")}`;
        await tx.update(fulfilmentMission).set({
          status: "waiting",
          stage: "monitoring",
          waitingReason: reason,
          outcome,
          closedAt: null,
          updatedAt: new Date(),
          updatedBy: currentTenant().actorId,
        }).where(eq(fulfilmentMission.id, missionId));
        return { status: "waiting" };
      }

      await this.writeStep(tx, missionId, plan, seq, {
        planVersionId: pv.id,
        evidence: [
          ...dispatches.map((d) => ({
            source: "dispatch + dispatch_line",
            provenance: "live" as const,
            ref: d.no,
            detail: `${d.status} on ${d.date}`,
          })),
          ...releases.map((r) => ({
            source: "quality_release",
            provenance: "live" as const,
            ref: r.releaseNo,
            detail: `${q3(num(r.qty))} released against SO line ${r.lineId ?? "none"}`,
          })),
          ...invoices.map((i) => ({
            source: "ar_open_item",
            provenance: "live" as const,
            ref: i.invoiceNo,
            detail: `dispatch ${i.dispatchRef ?? "none"}, gross Rs ${fmtInr(num(i.gross))}`,
          })),
          ...actions.map((a) => ({
            source: "fulfilment_action",
            provenance: "live" as const,
            ref: a.actionNo,
            detail: `${a.actionType} — ${a.verified === true ? "verified" : "NOT VERIFIED"}`,
          })),
        ],
        findings: outcome,
        narration: gate.met
          ? `${q3(deliveredQty)} of ${q3(orderedQty)} units were dispatched by ${actualDate}; quality releases and invoices were re-read for every dispatch. ` +
            `The plan's ${q2(forecastMarginPct)}% forecast is at or above the ${q2(targetMarginPct)}% target, and every mission action is verified.`
          : `The real dispatch, quality and invoice records exist, but the mission did not meet every commitment: ${gate.reasons.join("; ")}.`,
        confidence: gate.met ? 100 : 40,
        status: gate.met ? "succeeded" : "failed",
        refusedReason: gate.met ? null : gate.reasons.join("; "),
      });

      await tx.update(fulfilmentMission).set({
        status: gate.met ? "completed" : "failed",
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
        data: { missionNo: m.missionNo, met: gate.met, outcome },
      });
      return { status: gate.met ? "completed" : "failed" };
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
      const ctx = await this.stepContext(tx, missionId, m.soNo);

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
        steps: steps.map((s) => this.toStepView(s, ctx)),
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

      // The picker says "Open" for an existing mission, so it needs the mission's id — a
      // business number and a status cannot reopen anything. Order newest-first and keep the
      // first mission per sales order: completed/failed missions may coexist with a later
      // rerun, and presenting an arbitrary older attempt is how an "Open" button used to
      // restart at step one instead of restoring the state shown beside it.
      const missions = await tx.select({
        id: fulfilmentMission.id,
        soId: fulfilmentMission.salesOrderId,
        no: fulfilmentMission.missionNo,
        status: fulfilmentMission.status,
      })
        .from(fulfilmentMission)
        .orderBy(desc(fulfilmentMission.createdAt));
      const byOrder = new Map<string, { id: string; soId: string; no: string; status: string }>();
      for (const mission of missions) {
        if (!byOrder.has(mission.soId)) byOrder.set(mission.soId, mission);
      }

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


  /* ------------------------------------------------------------------ retry -- */

  /**
   * RE-RUN THE LAST STEP THAT FAILED.
   *
   * A mission stops when a step fails, and until now the only way past that was to start
   * again — which throws away twelve steps of correct work because the thirteenth hit a
   * vendor on credit hold. Retrying is the ordinary operational answer, and it is safe here
   * for a reason that is worth stating: every execute step derives its idempotency key from
   * the mission, the plan version and the vendor, and from nothing that varies between
   * attempts. So a re-run replays the documents that were already created and raises only
   * the ones that were not. The vendor does not get the order twice.
   *
   * THE ORIGINAL FAILURE IS NOT SWALLOWED. The failed step row is removed — it has to be,
   * because the arc's resume point is a row count and a failed row would make the mission
   * think that step was done — but before it goes, the failure is written to the event log
   * and to the hash-chained audit trail. The re-run's own pipeline then opens with a
   * `retrying` row carrying the reason the first attempt failed. A retry that quietly
   * produced a clean-looking mission would be the most dangerous feature in this product.
   */
  async retry(missionId: string): Promise<{
    step: StepView | null;
    status: string;
    retried: { stepKey: string; seq: number; attempt: number; previousFailure: string };
  }> {
    const prep = await withTenant(async (tx) => {
      const m = await this.loadMission(tx, missionId);

      const failed = await tx
        .select()
        .from(fulfilmentStep)
        .where(and(eq(fulfilmentStep.missionId, missionId), eq(fulfilmentStep.status, "failed")))
        .orderBy(desc(fulfilmentStep.seq))
        .limit(1);
      const f = failed[0];
      if (!f) {
        throw new AppError("NOTHING_TO_RETRY", 409,
          `${m.missionNo} has no failed step. Retry re-runs a step that refused; it is not a way to run a step again for a different answer.`);
      }
      const plan = ARC.find((a) => a.key === f.stepKey);
      if (!plan) {
        throw new AppError("UNKNOWN_STEP", 500, `step '${f.stepKey}' is not in this build's arc, so it cannot be re-run`);
      }

      // A REJECTED APPROVAL IS NOT A FAULT, AND RETRY MUST NOT BECOME A WAY PAST A PERSON.
      // The authority gate only ever records "failed" because somebody said no — the step
      // itself cannot fail technically, since a write that threw would have rolled the whole
      // step back and left no row. Re-running it would raise a fresh approval and ask the
      // same question again until the answer changed, which is precisely the behaviour a
      // governed system exists to prevent.
      if (f.stepKey === "authorize") {
        throw new AppError("NOT_RETRYABLE", 409,
          `${m.missionNo} stopped because a person declined the plan, which is a decision and not a failure. ` +
          `Ask for a different approach on the approval, or change the mission's autonomy tier — either re-plans. ` +
          `Retry re-runs a step that broke; it is not a way to ask somebody the same question twice.`);
      }

      // How many times this step has already been retried, from the event log. Counted in
      // JS rather than with a jsonb predicate: a mission has a handful of events, and a
      // query nobody can read is a poor trade for a scan of five rows.
      const priorEvents = await tx
        .select({ payload: fulfilmentEvent.payload })
        .from(fulfilmentEvent)
        .where(and(eq(fulfilmentEvent.missionId, missionId), eq(fulfilmentEvent.eventName, STEP_RETRY_EVENT)));
      const prior = priorEvents.filter((e) => String((e.payload as Record<string, unknown>).stepKey ?? "") === f.stepKey).length;
      const attempt = prior + 2; // the original run was attempt 1

      const previousFailure = f.refusedReason ?? f.narration ?? "no reason was recorded";

      await tx.insert(fulfilmentEvent).values({
        id: newId(),
        tenantId: currentTenant().tenantId,
        createdBy: currentTenant().actorId,
        updatedBy: currentTenant().actorId,
        missionId,
        eventKey: `retry:${missionId}:${f.stepKey}:${attempt}`,
        eventName: STEP_RETRY_EVENT,
        source: "operator",
        simulated: false,
        payload: { lifecycle: "retried", stepKey: f.stepKey, seq: f.seq, attempt, previousFailure },
        impact: { rewoundToSeq: f.seq, stepsDiscarded: f.stepKey },
        disposition: "deterministic",
        handledAt: new Date(),
      });

      await this.audit.appendInTx(tx, {
        action: "fulfilment.step.retried",
        entityType: "fulfilment_mission",
        entityId: missionId,
        data: { missionNo: m.missionNo, stepKey: f.stepKey, seq: f.seq, attempt, previousFailure },
      });

      // The failed row and anything after it. The arc resumes on a row count, so leaving the
      // failed row in place would make the engine believe that step had already run.
      await tx.delete(fulfilmentStep).where(and(
        eq(fulfilmentStep.missionId, missionId),
        gte(fulfilmentStep.seq, f.seq),
      ));

      // A failed mission is a closed one. Re-opening it is the point of a retry, so the
      // closure is undone explicitly rather than left for `setStatus` to overwrite later.
      await tx.update(fulfilmentMission).set({
        status: EXECUTE_KEYS.has(f.stepKey) ? "executing" : "planning",
        waitingReason: null,
        closedAt: null,
        updatedAt: new Date(),
        updatedBy: currentTenant().actorId,
      }).where(eq(fulfilmentMission.id, missionId));

      return { plan, seq: f.seq, attempt, previousFailure, soNo: m.soNo, stepKey: f.stepKey };
    });

    const outcome = await this.runStep(missionId, prep.plan, prep.seq);

    const step = await withTenant(async (tx) => {
      const rows = await tx.select().from(fulfilmentStep)
        .where(and(eq(fulfilmentStep.missionId, missionId), eq(fulfilmentStep.seq, prep.seq)));
      const r = rows[0];
      if (!r) return null;
      return this.toStepView(r, await this.stepContext(tx, missionId, prep.soNo));
    });

    return {
      step,
      status: outcome.status,
      retried: { stepKey: prep.stepKey, seq: prep.seq, attempt: prep.attempt, previousFailure: prep.previousFailure },
    };
  }

  /* -------------------------------------------------------------- scenarios -- */

  /**
   * The nine demo scenarios, answered against THIS tenant's actual records.
   *
   * Every row is probed rather than asserted: the catalogue explodes the BOM for each
   * confirmed order, nets it against live stock and resolves the suppliers, then reports
   * which order each scenario should run on — or reports that it cannot run, and what
   * record somebody would have to create for it to.
   *
   * That costs a handful of queries per order, which is why it is capped. It is worth it:
   * a scenario list that claims a demo works when the data has moved underneath it is worse
   * than no list at all, because it fails in front of an audience rather than in a console.
   */
  async scenarios(): Promise<ResolvedScenario[]> {
    return resolveScenarios(await this.probeOrders());
  }

  /**
   * Set a scenario up so that it genuinely occurs, and open the mission.
   *
   * Everything this does is one of three things: choosing WHICH order (from the probe),
   * choosing the autonomy tier, and — for two scenarios — recording a source or a fault as
   * an event. It never changes how a step behaves. If a scenario is unavailable, this
   * refuses with the same reason the catalogue gave rather than forcing it.
   */
  async startScenario(key: string): Promise<{ scenario: ResolvedScenario; mission: MissionView; did: string[] }> {
    const spec = SCENARIO_BY_KEY.get(key);
    if (!spec) {
      throw Errors.notFound(`scenario '${key}'. Known scenarios: ${SCENARIOS.map((x) => x.key).join(", ")}`);
    }
    const resolved = (await this.scenarios()).find((r) => r.key === key);
    if (!resolved || !resolved.available || !resolved.salesOrderId) {
      throw new AppError("SCENARIO_UNAVAILABLE", 409, resolved?.reason ?? `scenario '${key}' cannot run against this tenant's data`);
    }

    const did: string[] = [];
    const opened = await this.start(resolved.salesOrderId, spec.tier);
    // `start` is idempotent: a second call on an order that already has a live mission
    // returns THAT mission rather than opening a second one. Saying "opened" in that case
    // would be the first inaccurate sentence of the demo.
    did.push(
      opened.steps.length > 0
        ? `${opened.missionNo} on ${opened.soNo} for ${opened.customerName} was already running — ${opened.steps.length} step(s) in. It was returned rather than a second mission opened.`
        : `Opened ${opened.missionNo} on ${opened.soNo} for ${opened.customerName} at tier ${spec.tier}.`,
    );

    // A returned mission keeps the tier it was opened at, and scenario 6 is only guaranteed
    // BY the tier. Moving the dial is a real, audited operation with its own refusal — it
    // will not lower an envelope after money has been committed — so the outcome is
    // reported either way rather than assumed.
    if (opened.autonomyTier !== spec.tier) {
      try {
        await this.setAutonomy(opened.id, spec.tier);
        did.push(`Moved the autonomy dial from ${opened.autonomyTier} to ${spec.tier}, discarding the steps from the authority gate onward so it re-derives.`);
      } catch (e) {
        did.push(
          `Could not move the autonomy dial to ${spec.tier}: ${e instanceof Error ? e.message : String(e)} ` +
          `This scenario may not stop where it is meant to.`,
        );
      }
    }

    if (key === "failure-then-retry") {
      did.push(await this.armSimulatedFault(opened.id));
      if (opened.steps.some((st) => st.stepKey === SIMULATED_FAULT.stepKey)) {
        did.push(
          `This mission has ALREADY run the ${SIMULATED_FAULT.stepKey} step, so the armed fault has nothing left to bite. ` +
          `Reset the demo, or run this scenario on an order that has no mission yet.`,
        );
      }
    }

    if (key === "spreadsheet-source") {
      did.push(await this.loadDemoPriceList(opened.id));
    }

    did.push("Nothing else was changed. Run the mission and the scenario happens on its own.");
    return { scenario: resolved, mission: await this.view(opened.id), did };
  }

  /**
   * Arm the one simulated fault — scenario 8, and nothing else in the product.
   *
   * Recorded as `simulated: true` on an event the procure step reads, so it is visible in
   * the mission's own event list before it fires, visible again after, and impossible to
   * mistake for a genuine refusal from PURCHASE.
   */
  private async armSimulatedFault(missionId: string): Promise<string> {
    return withTenant(async (tx) => {
      const eventKey = `fault:${missionId}:${SIMULATED_FAULT.stepKey}`;
      const existing = await tx.select({ id: fulfilmentEvent.id, handled: fulfilmentEvent.handledAt })
        .from(fulfilmentEvent).where(eq(fulfilmentEvent.eventKey, eventKey));
      if (existing[0]) {
        return existing[0].handled
          ? "A fault was already armed on this mission and has already fired; it is one-shot and will not fire again."
          : "A fault was already armed on this mission's purchase step; arming it twice changes nothing.";
      }

      await tx.insert(fulfilmentEvent).values({
        id: newId(),
        tenantId: currentTenant().tenantId,
        createdBy: currentTenant().actorId,
        updatedBy: currentTenant().actorId,
        missionId,
        eventKey,
        eventName: SIMULATED_FAULT.eventName,
        source: "world-simulator",
        simulated: true,
        payload: { lifecycle: "armed", step: SIMULATED_FAULT.stepKey, reason: SIMULATED_FAULT.reason, oneShot: true },
        impact: { willPrevent: "every purchase order on the next attempt at the procure step" },
        disposition: null,
      });

      await this.audit.appendInTx(tx, {
        action: "fulfilment.demo.fault_armed",
        entityType: "fulfilment_mission",
        entityId: missionId,
        data: { step: SIMULATED_FAULT.stepKey, simulated: true },
      });

      return "Armed ONE simulated fault on the purchase step. It is labelled simulated, it fires once, and the retry runs the real path.";
    });
  }

  /**
   * Generate a supplier price list for this mission's short components, and read it in.
   *
   * The file is generated rather than uploaded so the scenario runs without a presenter
   * having a spreadsheet to hand — and it is recorded as `origin: "scenario-generated"`, so
   * nothing on screen can suggest a person supplied it. It goes through the SAME parser a
   * real .xlsx upload goes through.
   *
   * The numbers are the seeded terms with one stated transformation: two days quicker and
   * six percent dearer. That is what makes the demonstration mean anything — the plan has to
   * visibly move when the file is read, and a file that agreed with the seeded table in
   * every particular would prove only that the upload endpoint returned 200.
   */
  private async loadDemoPriceList(missionId: string): Promise<string> {
    const shortages = await this.computeShortages(missionId);
    const rows: UploadedSupplierTerm[] = [];
    for (const s of shortages.filter((x) => x.shortQty > 1e-9)) {
      for (const t of SEEDED_SOURCING[s.itemCode] ?? []) {
        rows.push({
          itemCode: s.itemCode,
          vendorCode: t.vendorCode,
          vendorName: t.vendorName,
          unitPrice: Math.round(t.unitPrice * 1.06),
          leadTimeDays: Math.max(1, t.leadTimeDays - 2),
          reliability: t.reliability,
          capacityUnits: t.capacityUnits,
          qualified: t.qualified,
        });
      }
    }
    if (rows.length === 0) {
      throw new AppError("SCENARIO_UNAVAILABLE", 409,
        "This order is short of components that have no seeded supplier terms to build a price list from.");
    }

    const filename = "supplier-price-list.csv";
    const result = await this.ingestSupplierTerms(missionId, filename, toBase64(buildTermsCsv(rows)), "scenario-generated");
    return `Generated ${filename} — ${result.rowCount} quoted line(s) across ${result.itemCodes.length} component(s), ` +
      `two days quicker and 6% dearer than the seeded terms, and read it through the real spreadsheet parser.`;
  }

  /* ------------------------------------------------------ the spreadsheet source -- */

  /**
   * Take a supplier price list and make it THIS mission's sourcing terms.
   *
   * Phase 1 has no price or lead-time master, so these four numbers always come from outside
   * the ERP. This lets them come from the file a factory actually has, and the mission
   * re-plans from it: the steps from `sourcing` onward are discarded so the sourcing step
   * genuinely re-reads, rather than the new file quietly applying to a plan that was built
   * before it arrived.
   *
   * REFUSED ONCE THE MISSION HAS COMMITTED ANYTHING. New terms cannot un-raise a purchase
   * order. That needs a compensation and a person, not a re-plan.
   */
  async ingestSupplierTerms(
    missionId: string,
    filename: string,
    fileBase64: string,
    origin: "uploaded" | "scenario-generated" = "uploaded",
  ): Promise<{ duplicate: boolean; rowCount: number; itemCodes: string[]; filename: string; replanned: boolean }> {
    // Parsed BEFORE the transaction opens. A file that will not parse must not have left a
    // half-rewound mission behind it.
    const parsed = parseSupplierTerms(fileBase64);

    return withTenant(async (tx) => {
      const m = await this.loadMission(tx, missionId);
      if (["completed", "failed", "cancelled"].includes(m.status)) {
        throw new AppError("MISSION_CLOSED", 409, `${m.missionNo} is ${m.status}; new supplier terms cannot change anything now.`);
      }

      const acted = await tx.select({ id: fulfilmentAction.id })
        .from(fulfilmentAction)
        .where(and(eq(fulfilmentAction.missionId, missionId), eq(fulfilmentAction.status, "verified")))
        .limit(1);
      if (acted[0]) {
        throw new AppError("MISSION_ALREADY_ACTED", 409,
          `${m.missionNo} has already committed documents under its current terms. A new price list does not un-raise a ` +
          `purchase order — that needs a compensation, not a re-plan.`);
      }

      const eventKey = `terms:${missionId}:${parsed.bytesHash.slice(0, 16)}`;
      const dup = await tx.select({ id: fulfilmentEvent.id }).from(fulfilmentEvent).where(eq(fulfilmentEvent.eventKey, eventKey));
      if (dup[0]) {
        return { duplicate: true, rowCount: parsed.rows.length, itemCodes: parsed.itemCodes, filename, replanned: false };
      }

      await tx.insert(fulfilmentEvent).values({
        id: newId(),
        tenantId: currentTenant().tenantId,
        createdBy: currentTenant().actorId,
        updatedBy: currentTenant().actorId,
        missionId,
        eventKey,
        eventName: TERMS_UPLOAD_EVENT,
        source: origin === "uploaded" ? "spreadsheet-upload" : "demo-scenario",
        // A file a person uploaded is not simulated. One this build generated for a demo is.
        simulated: origin !== "uploaded",
        payload: {
          filename,
          origin,
          sheetName: parsed.sheetName,
          fileKind: parsed.fileKind,
          byteSize: parsed.byteSize,
          bytesHash: parsed.bytesHash,
          itemCodes: parsed.itemCodes,
          rows: parsed.rows,
        },
        impact: { lifecycle: "accepted", supersedes: "seeded sourcing terms", forItemCodes: parsed.itemCodes },
        disposition: "deterministic",
        handledAt: new Date(),
      });

      // Rewind to sourcing so the file is genuinely read. Evidence gathered before it —
      // the order, the BOM, the stock — is untouched: a price list does not change what is
      // on the shelf.
      const rewound = await tx.delete(fulfilmentStep).where(and(
        eq(fulfilmentStep.missionId, missionId),
        inArray(fulfilmentStep.stepKey, ["sourcing", "strategy", "critique", "authorize", "reserve", "procure", "workorder", "watch", "close"]),
      )).returning({ id: fulfilmentStep.id });

      await tx.delete(fulfilmentApproval).where(and(
        eq(fulfilmentApproval.missionId, missionId),
        sql`${fulfilmentApproval.decision} IS NULL`,
      ));

      const pv = await tx.select({ id: fulfilmentPlanVersion.id })
        .from(fulfilmentPlanVersion)
        .where(and(eq(fulfilmentPlanVersion.missionId, missionId), sql`${fulfilmentPlanVersion.supersededAt} IS NULL`));
      for (const v of pv) {
        await tx.update(fulfilmentPlanVersion).set({
          supersededAt: new Date(),
          supersedeReason: `supplier terms replaced by ${filename}`,
          updatedAt: new Date(),
          updatedBy: currentTenant().actorId,
        }).where(eq(fulfilmentPlanVersion.id, v.id));
      }

      await tx.update(fulfilmentMission).set({
        status: "planning",
        stage: "evidence",
        waitingReason: null,
        updatedAt: new Date(),
        updatedBy: currentTenant().actorId,
      }).where(eq(fulfilmentMission.id, missionId));

      await this.audit.appendInTx(tx, {
        action: "fulfilment.sourcing.terms_uploaded",
        entityType: "fulfilment_mission",
        entityId: missionId,
        data: { filename, origin, rows: parsed.rows.length, itemCodes: parsed.itemCodes, bytesHash: parsed.bytesHash },
      });

      return { duplicate: false, rowCount: parsed.rows.length, itemCodes: parsed.itemCodes, filename, replanned: rewound.length > 0 };
    });
  }

  /** A blank price list in the shape this endpoint accepts, for somebody to fill in. */
  supplierTermsTemplate(): { filename: string; csv: string } {
    return {
      filename: "supplier-terms-template.csv",
      csv: buildTermsCsv([
        { itemCode: "CMP-CAS50", vendorCode: "V-MER-01", vendorName: "Meridian Metals & Alloys", unitPrice: 500, leadTimeDays: 14, reliability: 0.85, capacityUnits: 10_000, qualified: true },
      ]),
    };
  }

  /**
   * This mission's uploaded terms, keyed by item code.
   *
   * The LATEST upload wins outright rather than merging with the ones before it. Merging
   * price lists is a sourcing decision — which quote is current? — and this is not the place
   * to make it silently.
   */
  private async uploadedTermsFor(missionId: string): Promise<Map<string, SeededSupplierTerms[]> | null> {
    const rows = await withTenant((tx) =>
      tx.select({ payload: fulfilmentEvent.payload })
        .from(fulfilmentEvent)
        .where(and(eq(fulfilmentEvent.missionId, missionId), eq(fulfilmentEvent.eventName, TERMS_UPLOAD_EVENT)))
        .orderBy(desc(fulfilmentEvent.observedAt))
        .limit(1),
    );
    const payload = rows[0]?.payload as { rows?: UploadedSupplierTerm[] } | undefined;
    const quoted = payload?.rows ?? [];
    if (quoted.length === 0) return null;

    const byItem = new Map<string, SeededSupplierTerms[]>();
    for (const r of quoted) {
      const list = byItem.get(r.itemCode) ?? [];
      list.push({
        vendorCode: r.vendorCode,
        vendorName: r.vendorName,
        unitPrice: r.unitPrice,
        leadTimeDays: r.leadTimeDays,
        reliability: r.reliability,
        capacityUnits: r.capacityUnits,
        qualified: r.qualified,
      });
      byItem.set(r.itemCode, list);
    }
    return byItem;
  }

  /**
   * What each confirmed order would do if a mission were opened on it.
   *
   * Read-only and mission-free: it explodes the BOM, nets it against stock and resolves the
   * suppliers exactly as a mission would, without writing anything. Capped, because this
   * runs a BOM explosion and a stock read per order and the answer is only used to choose a
   * demo starting point.
   */
  private async probeOrders(limit = 6): Promise<OrderProbe[]> {
    const orders = await this.startable();
    const out: OrderProbe[] = [];

    for (const o of orders.slice(0, limit)) {
      const salesOrderId = String(o.id);
      const detail = await withTenant(async (tx) => this.loadOrder(tx, salesOrderId));
      const first = detail.lines[0];
      if (!first) continue;

      const orderQty = detail.lines.reduce((n, l) => n + num(l.qty), 0);
      const material = await this.materialPlanForOrder(salesOrderId);
      const shortages = material.shortages;
      const short = shortages.filter((x) => x.shortQty > 1e-9);
      const structures = await Promise.all(detail.lines.map((l) => this.bom.getActiveBomForItem(l.itemId)));

      // A supplier the vendor master does not hold keeps its CODE where a uuid would be —
      // see `shortagesFor`. That is the same fact `stepProcure` refuses on, read here
      // before a mission is opened rather than after one has stopped.
      const unresolved = new Set<string>();
      const unsourceable: string[] = [];
      for (const line of short) {
        const qualified = line.suppliers.filter((v) => v.qualified);
        if (qualified.length === 0) unsourceable.push(line.itemCode);
        for (const v of qualified) {
          if (!UUID_LIKE.test(v.vendorId)) unresolved.add(`${v.vendorName} (${v.vendorId})`);
        }
      }

      const mission = o.mission as { status?: string } | null;
      out.push({
        salesOrderId,
        soNo: String(o.soNo),
        customerName: String(o.customerName ?? "—"),
        orderQty,
        itemCode: detail.lines.map((l) => l.itemCode).join(", "),
        hasReleasedBom: structures.every((b) => b !== null),
        componentCount: shortages.length,
        shortCount: short.length,
        unresolvedVendors: [...unresolved],
        unsourceable,
        hasLiveMission: mission !== null && !["completed", "failed", "cancelled"].includes(mission?.status ?? ""),
      });
    }

    return out;
  }

  /* -------------------------------------------------------------- internals -- */

  private toStepView(r: typeof fulfilmentStep.$inferSelect, ctx: StepContext): StepView {
    const retry = ctx.retries.get(r.stepKey);
    const at = r.startedAt ?? r.endedAt;
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
      // WHEN THE STEP ACTUALLY RAN, as the server saw it.
      //
      // The table has stored these since 0094; the view simply never passed them on, so
      // every consumer that wanted a timestamp had to fall back on the time the BROWSER
      // happened to receive the row. That is a different fact wearing the same label — it
      // drifts with network latency, and on a re-read of a finished mission it reports
      // "now" for work that ran yesterday. An audit trail whose clock is the reader's is
      // not an audit trail.
      startedAt: r.startedAt ? r.startedAt.toISOString() : null,
      endedAt: r.endedAt ? r.endedAt.toISOString() : null,
      evidence: r.evidence, findings: r.findings, narration: r.narration, confidence: r.confidence,
      // Derived from what this step recorded, plus the three mission-level facts the row
      // cannot know: which order it is, whether this run is a retry, and where the supplier
      // terms came from.
      pipeline: buildPipeline({
        stepKey: r.stepKey,
        status: r.status,
        at: at ? at.toISOString() : null,
        evidence: r.evidence,
        findings: r.findings,
        refusedReason: r.refusedReason,
        soNo: ctx.soNo,
        attempt: retry?.attempt ?? 1,
        previousFailure: retry?.previousFailure ?? null,
        termsFrom: ctx.terms.from,
        termsFile: ctx.terms.file,
      }),
    };
  }

  /**
   * The mission-level facts every step view needs, read once.
   *
   * Both come out of the event log rather than out of new columns, and that is the reason
   * a retry and a spreadsheet upload are recorded as events at all: `fulfilment_event`
   * already holds "something happened to this mission, here is what and when", which is
   * exactly what both of these are. A migration adding `attempt_no` to `fulfilment_step`
   * would store the same fact in a second place.
   */
  private async stepContext(tx: Tx, missionId: string, soNo: string): Promise<StepContext> {
    const rows = await tx
      .select({ name: fulfilmentEvent.eventName, payload: fulfilmentEvent.payload, at: fulfilmentEvent.observedAt })
      .from(fulfilmentEvent)
      .where(and(
        eq(fulfilmentEvent.missionId, missionId),
        inArray(fulfilmentEvent.eventName, [STEP_RETRY_EVENT, TERMS_UPLOAD_EVENT]),
      ))
      .orderBy(asc(fulfilmentEvent.observedAt));

    const retries = new Map<string, { attempt: number; previousFailure: string | null }>();
    let terms: StepContext["terms"] = { from: "seeded", file: null };

    for (const r of rows) {
      const p = (r.payload ?? {}) as Record<string, unknown>;
      if (r.name === STEP_RETRY_EVENT) {
        const key = String(p.stepKey ?? "");
        const attempt = Number(p.attempt ?? 2);
        const previous = p.previousFailure == null ? null : String(p.previousFailure);
        const held = retries.get(key);
        // The LATEST attempt wins. A step retried twice shows attempt 3 and the failure the
        // third run was recovering from, not the first one.
        if (!held || attempt >= held.attempt) retries.set(key, { attempt, previousFailure: previous });
      } else {
        terms = { from: "spreadsheet", file: p.filename == null ? null : String(p.filename) };
      }
    }
    return { soNo, retries, terms };
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
    a: {
      actionType: string; targetDomain: string; title: string; params: unknown; autonomyTier: string;
      /**
       * What the action actually produced — the document numbers, once there are any.
       *
       * Was a hardcoded `{ ok: true }`, which was true of every action ever taken and
       * therefore said nothing. An action row that names PO-2627-00014 is auditable; one
       * that says `ok` is a claim with no way to check it.
       */
      result?: unknown;
    },
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

    const digest = digestOf({ type: a.actionType, params: a.params, plan: planVersionId });
    const idempotencyKey = `${missionId}:${a.actionType}:${digest}`;
    const existing = await tx
      .select({
        id: fulfilmentAction.id,
        actionNo: fulfilmentAction.actionNo,
        digest: fulfilmentAction.digest,
        status: fulfilmentAction.status,
        verified: fulfilmentAction.verified,
      })
      .from(fulfilmentAction)
      .where(eq(fulfilmentAction.idempotencyKey, idempotencyKey))
      .limit(1);
    const prior = existing[0] ?? null;
    const mode = actionPersistenceMode(prior);

    if (prior) {
      if (prior.digest !== digest) throw Errors.idempotencyMismatch();
      if (mode === "reset_for_retry") {
        // One logical action keeps one row across attempts. A failed procure/work-order
        // step used to leave this unique key behind, so retry created the missing domain
        // document and then died forever trying to INSERT the same action key. Resetting
        // the unverified row lets the new postcondition replace the failed attempt while
        // the retry event/audit entry preserves why the earlier attempt stopped.
        await tx.update(fulfilmentAction).set({
          title: a.title,
          params: a.params as object,
          autonomyTier: a.autonomyTier,
          approvalId: granted[0]?.id ?? null,
          status: "executed",
          executedAt: new Date(),
          result: (a.result ?? { ok: true }) as object,
          postcondition: null,
          verifiedAt: null,
          verified: null,
          failureReason: null,
          updatedAt: new Date(),
          updatedBy: currentTenant().actorId,
        }).where(eq(fulfilmentAction.id, prior.id));
      }
      return { id: prior.id, actionNo: prior.actionNo, digest };
    }

    const id = newId();
    const actionNo = await this.numbering.next(tx, "fulfilment_action", fyCode(new Date().toISOString()));
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
      idempotencyKey,
      executedAt: new Date(),
      result: (a.result ?? { ok: true }) as object,
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
    /**
     * THE DATE THE CUSTOMER WAS ACTUALLY PROMISED.
     *
     * This was hardcoded `null`, so `start` always fell through to `orderDate + 30` and
     * every mission ever run planned backwards from a date nobody had agreed to. The lines
     * carried the real promise the whole time — SALES has stored `requestedDeliveryDate`
     * since the order form learned to ask for it — and nothing read it.
     *
     * It is not a cosmetic field. The promise is what the whole plan is scheduled backwards
     * from: it decides whether a supplier's lead time fits, whether the work centre can
     * absorb the batch, and whether the mission's verdict is feasible or infeasible. A
     * mission planning to a guess can call an order comfortable that is in fact already late.
     *
     * EARLIEST across the lines, not latest: an order is promised by the date its soonest
     * line is due, and planning to the last one silently misses every line before it. Null
     * stays a real answer — some orders genuinely carry no promise — and `start` keeps its
     * fallback for exactly those.
     */
    const promises = lines
      .map((l) => l.requestedDeliveryDate)
      .filter((d): d is string => typeof d === "string" && d.length > 0)
      .sort();

    return {
      ...so,
      customerName: cust[0]?.name ?? "—",
      promisedDate: (promises[0] ?? null) as string | null,
      lines: lines.map((l) => ({ ...l, itemCode: byId.get(l.itemId)?.code ?? "?", itemName: byId.get(l.itemId)?.name ?? "?" })),
    };
  }

  private async onHandOf(tx: Tx, itemId: string): Promise<number> {
    const rows = await tx.select({ qty: stockBalance.qty }).from(stockBalance).where(eq(stockBalance.itemId, itemId));
    return rows.reduce((n, r) => n + num(r.qty), 0);
  }

  /**
   * The exact finished-good quantity left to make on each order line.
   *
   * Reads physical stock and reservations in the same tenant transaction. Stock is grouped
   * by item before allocation, so two lines for the same finished good cannot both consume
   * the same five units on hand.
   */
  private async lineDemandInTx(tx: Tx, salesOrderId: string): Promise<ProductionDemand[]> {
    const order = await this.loadOrder(tx, salesOrderId);
    const lines: LineDemand[] = order.lines.map((l) => ({
      lineId: l.id,
      itemId: l.itemId,
      itemCode: l.itemCode,
      qty: num(l.qty),
      reservedQty: num(l.reservedQty),
    }));
    const itemIds = [...new Set(lines.map((l) => l.itemId))];
    if (itemIds.length === 0) return [];

    const stock = await tx
      .select({ itemId: stockBalance.itemId, qty: stockBalance.qty })
      .from(stockBalance)
      .where(inArray(stockBalance.itemId, itemIds));
    const onHand = new Map<string, number>();
    for (const row of stock) onHand.set(row.itemId, (onHand.get(row.itemId) ?? 0) + num(row.qty));

    // Reservations on every OTHER order consume ATP before this mission gets a turn.
    const other = await tx
      .select({ itemId: salesOrderLine.itemId, reservedQty: salesOrderLine.reservedQty })
      .from(salesOrderLine)
      .where(and(
        inArray(salesOrderLine.itemId, itemIds),
        sql`${salesOrderLine.orderId} <> ${salesOrderId}`,
        sql`${salesOrderLine.reservedQty} > 0`,
      ));
    const reservedElsewhere = new Map<string, number>();
    for (const row of other) {
      reservedElsewhere.set(row.itemId, (reservedElsewhere.get(row.itemId) ?? 0) + num(row.reservedQty));
    }
    return allocateProductionDemand(lines, onHand, reservedElsewhere);
  }

  /**
   * Explode every uncovered finished-good line, aggregate common components once, then net
   * the shared component stock once. The peg list survives the aggregation so PURCHASE can
   * still write one vendor document while every PO line names the customer line it serves.
   */
  private async materialPlanForOrder(
    salesOrderId: string,
    uploaded: ReadonlyMap<string, SeededSupplierTerms[]> | null = null,
  ): Promise<MaterialPlan> {
    const demand = await withTenant((tx) => this.lineDemandInTx(tx, salesOrderId));
    const structures = await Promise.all(
      demand
        .filter((l) => l.makeQty > 1e-9)
        .map(async (line) => ({ line, bom: await this.bom.getActiveBomForItem(line.itemId) })),
    );

    const componentDemand = new Map<string, { required: number; pegs: ComponentPeg[] }>();
    for (const { line, bom } of structures) {
      // Engineering records and stops on this fault before planning. Skipping here avoids
      // inventing a BOM merely to make a scenario probe return a number.
      if (!bom) continue;
      const factor = line.makeQty / (Number(bom.outputQty) || 1);
      for (const component of bom.components) {
        const required = component.qty * factor *
          (component.scrapPct > 0 && component.scrapPct < 100 ? 1 / (1 - component.scrapPct / 100) : 1);
        const held = componentDemand.get(component.componentItemId) ?? { required: 0, pegs: [] };
        held.required += required;
        held.pegs.push({ salesOrderLineId: line.lineId, qty: required });
        componentDemand.set(component.componentItemId, held);
      }
    }

    return withTenant(async (tx) => {
      const componentIds = [...componentDemand.keys()];
      const items = componentIds.length
        ? await tx
            .select({ id: item.id, code: item.itemCode, name: item.name })
            .from(item)
            .where(inArray(item.id, componentIds))
        : [];
      const byId = new Map(items.map((i) => [i.id, i]));
      const vendors = await tx.select({ id: vendor.id, code: vendor.code }).from(vendor);
      const vendorByCode = new Map(vendors.map((v) => [v.code, v]));
      const shortages: ShortageLine[] = [];
      const shortagePegs = new Map<string, ComponentPeg[]>();

      for (const [componentItemId, requirement] of componentDemand) {
        const meta = byId.get(componentItemId);
        const code = meta?.code ?? componentItemId.slice(0, 8);
        const onHand = await this.onHandOf(tx, componentItemId);
        const shortQty = round3(Math.max(0, requirement.required - onHand));
        let stockLeft = onHand;
        const pegs: ComponentPeg[] = [];
        for (const peg of requirement.pegs) {
          const covered = Math.min(stockLeft, peg.qty);
          stockLeft = Math.max(0, stockLeft - covered);
          const short = round3(Math.max(0, peg.qty - covered));
          if (short > 1e-9) pegs.push({ salesOrderLineId: peg.salesOrderLineId, qty: short });
        }
        // Reconcile only float/3-decimal rounding onto the final peg; a larger difference
        // would be a real calculation fault and is left for `allocateSourcingPegs` to stop.
        const pegTotal = round3(pegs.reduce((n, p) => n + p.qty, 0));
        const delta = round3(shortQty - pegTotal);
        if (pegs.length > 0 && Math.abs(delta) <= 0.002) pegs[pegs.length - 1]!.qty = round3(pegs[pegs.length - 1]!.qty + delta);
        shortagePegs.set(code, pegs);

        const terms = uploaded?.get(code) ?? SEEDED_SOURCING[code] ?? defaultTermsFor(code);
        shortages.push({
          itemId: componentItemId,
          itemCode: code,
          itemName: meta?.name ?? code,
          requiredQty: round3(requirement.required),
          onHandQty: round3(onHand),
          incomingQty: 0,
          shortQty,
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
      return { shortages, shortagePegs };
    });
  }

  /** BOM explosion netted against real on-hand, with this mission's sourcing terms attached. */
  private async computeShortages(missionId: string): Promise<ShortageLine[]> {
    const m = await withTenant((tx) => this.loadMission(tx, missionId));
    const uploaded = await this.uploadedTermsFor(missionId);
    return (await this.materialPlanForOrder(m.salesOrderId, uploaded)).shortages;
  }

  /** Everything the planner needs, in one snapshot so every candidate is judged alike. */
  private async buildEvidence(missionId: string): Promise<PlanningEvidence> {
    const m = await withTenant((tx) => this.loadMission(tx, missionId));
    const obj = m.objective as { orderQty: number; lines: Array<{ qty: number; rate: number }> };
    const shortages = await this.computeShortages(missionId);

    // The planner still scores one order-level candidate, so a multi-item order is expressed
    // as total units at a revenue-weighted unit price. Taking line zero's rate made every
    // other line free (or priced like the first one) in the margin calculation.
    const sellingPrice = obj.orderQty > 0
      ? obj.lines.reduce((n, l) => n + num(l.qty) * num(l.rate), 0) / obj.orderQty
      : 0;
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
      // "I compared 1 ways of doing this. 1 can hit your date, and I have picked the best of
      // them." A demo is judged on sentences like that one. When there is exactly one option
      // the plural is wrong twice over and "the best of them" is a claim about a set of one.
      const tried = n(f.candidateCount);
      const ways = `${tried} way${tried === 1 ? "" : "s"} of doing this`;
      if (ok === 0) return `I compared ${ways} and none of them can hit your date. Somebody needs to decide what gives.`;
      if (tried === 1) return `There is only one way to do this, and it can hit your date.`;
      if (ok === 1) return `I compared ${ways}. Only one can hit your date, so that is the one I have picked.`;
      return `I compared ${ways}. ${ok} can hit your date, and I have picked the best of them.`;
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
      // Counted from the DOCUMENTS now, not from the sourcing lines. Three lines across two
      // vendors is two purchase orders, and telling a supervisor there are three would not
      // match the two pieces of paper that turn up in the approval queue.
      const pos = (f.purchaseOrders ?? []) as Array<Record<string, unknown>>;
      const lines = (f.committed ?? []) as Array<Record<string, unknown>>;
      if (lines.length === 0 && pos.length === 0) return `Nothing to buy — the order is covered from your own stock.`;
      if (pos.length === 0) return `I could not raise the purchase orders for this job, so nothing has been ordered.`;
      return `I have raised ${pos.length} purchase order${pos.length === 1 ? "" : "s"} worth ₹${fmtInr(Number(f.totalValue ?? 0))} — ${pos.map((p) => String(p.poNo)).join(", ")}. ${pos.length === 1 ? "It is a draft" : "They are drafts"} until somebody approves them.`;
    }
    case "workorder": {
      if (!f.productionOrderNo) return `No job went on the shop-floor list, so nothing is being built for this order yet.`;
      return `Job ${String(f.productionOrderNo)} is on the shop-floor list for ${n(f.qty)} units, needed by ${String(f.needDate ?? "the promised date")}. It knows which customer it is for.`;
    }
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
    case "procure": {
      const pos = (f.purchaseOrders ?? []) as Array<Record<string, unknown>>;
      return { from: "What you are short of", did: "Raised the purchase orders", to: `${pos.length} PO${pos.length === 1 ? "" : "s"}, ₹${fmtInr(Number(f.totalValue ?? 0))}` };
    }
    case "workorder":
      return { from: "The plan", did: "Released the work order", to: f.productionOrderNo ? `${String(f.productionOrderNo)}, ${n(f.qty)} units` : `${n(f.qty)} units to build` };
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
