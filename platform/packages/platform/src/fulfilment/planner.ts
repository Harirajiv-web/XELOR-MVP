/**
 * THE FULFILMENT PLANNER — the part that actually decides.
 *
 * There is no model behind this and that is a deliberate engineering choice, not a
 * placeholder. For a closed domain with exact arithmetic — which is what order fulfilment
 * is — a symbolic planner inherits the soundness of its own search, while a language model
 * introduces goals and actions that were never in the domain. The research is one-sided
 * enough to quote: LLMs "often introduce hallucinated goals and actions and consequently
 * lack the formal reliability of deterministic methods". Nobody wants a confident purchase
 * order for a supplier that does not exist.
 *
 * So this file computes. Every number it produces is derived from evidence the caller read
 * out of the database, and the same evidence always produces the same plan.
 *
 * WHAT MAKES THAT DIFFERENT FROM A SCRIPT, which is the fair question:
 *
 *   A script returns the same answer whatever the world looks like. This returns a
 *   different strategy when the stock is different, a different supplier when the lead time
 *   moves, an infeasible verdict when no option can hit the date, and an escalation when
 *   the margin floor would be breached. Change one row in the seeded factory and the chosen
 *   plan changes with it. That property is testable, and `planner.test.ts` tests it.
 *
 * The language layer sits in `narrate.ts` and is the ONLY part a model would ever replace.
 * That seam is the point: swapping it changes how the plan is explained, never what it is.
 */

/* ------------------------------------------------------------------ evidence -- */

/** A fact the planner is allowed to use, with everything needed to distrust it. */
export interface Fact<T> {
  value: T;
  /** Which table or calculation produced this. */
  source: string;
  /** When it was true. A plan built on a stale snapshot is a plan about the past. */
  asOf: string;
  /** How many rows stood behind it, so "no supplier" and "not checked" differ. */
  rowCount?: number;
}

export interface SupplierOption {
  vendorId: string;
  vendorName: string;
  /** Per unit, in rupees. */
  unitPrice: number;
  leadTimeDays: number;
  /** 0..1, from the vendor's own delivery history. Drives risk, never price. */
  reliability: number;
  /** How many units this vendor can commit to inside the horizon. */
  capacityUnits: number;
  qualified: boolean;
}

export interface ShortageLine {
  itemId: string;
  itemCode: string;
  itemName: string;
  requiredQty: number;
  onHandQty: number;
  /** Already on order and expected inside the horizon. */
  incomingQty: number;
  shortQty: number;
  suppliers: SupplierOption[];
}

export interface PlanningEvidence {
  today: string;
  promisedDate: string;
  orderQty: number;
  unitSellingPrice: number;
  /** Everything the finished good needs, netted. Only shortages are interesting. */
  shortages: ShortageLine[];
  /** Working days the shop floor needs once every component has landed. */
  productionDays: number;
  /** Working days between the last operation and the goods leaving. */
  inspectionDays: number;
  /** Free capacity at the constraining work centre, as a fraction. <1 means overloaded. */
  capacityHeadroom: number;
  /** Everything already spent or committed per unit before any sourcing decision. */
  baseUnitCost: number;
  /** The margin below which this order must not be accepted. */
  marginFloorPct: number;
  /** Rupees of expedite premium this mission may commit without a human. */
  expediteAutonomyLimit: number;
  /**
   * "Suggest only" — ask before committing ANYTHING, whatever the premium is.
   *
   * A separate flag rather than a limit of zero, and the distinction is not academic: it
   * was a live bug. The envelope test is `premium > limit`, and the cheapest strategy has a
   * premium of exactly zero by construction — it is the baseline everything else is
   * measured against. So `0 > 0` is false, and a mission set to "suggest only" sailed
   * through the authority gate and committed a purchase order without asking anybody.
   *
   * Lowest-authority means "propose, do not commit". That is a different rule from a
   * smaller number, and it has to be written as one.
   */
  requireApprovalForAnyCommitment?: boolean;
}

/* ---------------------------------------------------------------- candidates -- */

export type StrategyKey =
  | "primary_supplier"
  | "alternate_expedite"
  | "split_source"
  | "stock_only";

export interface SourcingDecision {
  itemCode: string;
  vendorName: string;
  vendorId: string;
  qty: number;
  unitPrice: number;
  leadTimeDays: number;
  reliability: number;
}

export interface Candidate {
  key: StrategyKey;
  name: string;
  description: string;
  sourcing: SourcingDecision[];
  /** Working days until every component has landed. The binding constraint. */
  materialReadyDays: number;
  completionDate: string;
  /** Days early (+) or late (−) against the promise. */
  slackDays: number;
  totalCost: number;
  unitCost: number;
  marginPct: number;
  /** Premium over the cheapest feasible sourcing, which is what an approver cares about. */
  expeditePremium: number;
  /** 0..100. Product of supplier reliability, capacity headroom and schedule slack. */
  confidence: number;
  feasible: boolean;
  /** Physical impossibilities. Empty means feasible. No signature overrules these. */
  violations: string[];
  /**
   * Policy positions this plan is outside — a margin floor, a spend limit.
   *
   * Kept apart from `violations` because a person with authority may overrule a policy and
   * may not overrule arithmetic. Merging them meant an approved margin exception looked
   * exactly like executing an impossible plan.
   */
  policyBreaches: string[];
  requiresApproval: boolean;
  approvalReason: string | null;
  score: number;
}

/** How the trade-off is weighted. Exposed so an audience can see why a plan won. */
export interface TradeOffWeights {
  onTime: number;
  margin: number;
  risk: number;
  disruption: number;
}

export const DEFAULT_WEIGHTS: TradeOffWeights = {
  onTime: 0.45,
  margin: 0.25,
  risk: 0.2,
  disruption: 0.1,
};

/* ------------------------------------------------------------------ calendar -- */

/** Working days, Monday to Saturday — an Indian factory works six. */
export function addWorkingDays(from: string, days: number): string {
  const d = new Date(`${from}T00:00:00Z`);
  let left = Math.ceil(days);
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) left--;
  }
  return d.toISOString().slice(0, 10);
}

export function workingDaysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  const sign = b >= a ? 1 : -1;
  const [lo, hi] = sign > 0 ? [a, b] : [b, a];
  let n = 0;
  const cur = new Date(lo);
  while (cur < hi) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    if (cur.getUTCDay() !== 0) n++;
  }
  return n * sign;
}

/* ---------------------------------------------------------------- generation -- */

/**
 * Enumerate the strategies worth evaluating.
 *
 * Not a fixed list of three. The generator asks what the evidence permits: a stock-only
 * plan exists only when nothing is short, a split exists only when two qualified suppliers
 * can between them cover the shortage, and an expedite exists only when some supplier is
 * genuinely faster than the incumbent. A factory with one qualified vendor gets fewer
 * options, and the demo shows fewer — which is the honest behaviour.
 */
export function generateCandidates(ev: PlanningEvidence): Candidate[] {
  const out: Candidate[] = [];
  const shortages = ev.shortages.filter((s) => s.shortQty > 1e-9);

  if (shortages.length === 0) {
    out.push(buildCandidate(ev, "stock_only", "Ship from stock", "Every component is already on hand or inbound; no buying decision is required.", []));
    return rank(out);
  }

  // Cheapest qualified vendor that can cover the whole line on its own.
  const primary = shortages.map((s) => pick(s, (a, b) => a.unitPrice - b.unitPrice)).filter(nonNull);
  if (primary.length === shortages.length) {
    out.push(buildCandidate(ev, "primary_supplier", "Standard procurement",
      "Lowest landed cost from the qualified vendor with the best price, then the normal production sequence.", primary));
  }

  // Fastest qualified vendor, whatever it costs.
  const fastest = shortages.map((s) => pick(s, (a, b) => a.leadTimeDays - b.leadTimeDays)).filter(nonNull);
  const fasterThanPrimary =
    fastest.length === shortages.length &&
    maxLead(fastest) < maxLead(primary);
  if (fasterThanPrimary) {
    out.push(buildCandidate(ev, "alternate_expedite", "Expedite with the faster supplier",
      "Pays a premium to the shortest-lead-time qualified vendor to protect the promised date.", fastest));
  }

  // Split: as much as the cheap vendor can carry, the balance to the fast one.
  const split = shortages.flatMap((s) => splitLine(s));
  const splitIsReal = split.length > shortages.length; // at least one line actually divided
  if (splitIsReal) {
    out.push(buildCandidate(ev, "split_source", "Split sourcing",
      "Takes the cheap vendor's committed capacity and buys only the balance at the premium rate.", split));
  }

  return rank(out);
}

function nonNull<T>(v: T | null): v is T {
  return v !== null;
}

function maxLead(rows: SourcingDecision[]): number {
  return rows.reduce((m, r) => Math.max(m, r.leadTimeDays), 0);
}

/** The best qualified supplier for a line under a given ordering, if one can cover it. */
function pick(
  line: ShortageLine,
  by: (a: SupplierOption, b: SupplierOption) => number,
): SourcingDecision | null {
  const able = line.suppliers
    .filter((s) => s.qualified && s.capacityUnits >= line.shortQty)
    .sort(by);
  const chosen = able[0];
  if (!chosen) return null;
  return {
    itemCode: line.itemCode,
    vendorId: chosen.vendorId,
    vendorName: chosen.vendorName,
    qty: line.shortQty,
    unitPrice: chosen.unitPrice,
    leadTimeDays: chosen.leadTimeDays,
    reliability: chosen.reliability,
  };
}

/** Cheap vendor's capacity first, balance to the fastest vendor that can take it. */
function splitLine(line: ShortageLine): SourcingDecision[] {
  const qualified = line.suppliers.filter((s) => s.qualified);
  const cheap = [...qualified].sort((a, b) => a.unitPrice - b.unitPrice)[0];
  const fast = [...qualified].sort((a, b) => a.leadTimeDays - b.leadTimeDays)[0];
  if (!cheap || !fast || cheap.vendorId === fast.vendorId) return [];
  const fromCheap = Math.min(cheap.capacityUnits, line.shortQty);
  const balance = line.shortQty - fromCheap;
  if (balance <= 1e-9 || balance > fast.capacityUnits) return [];
  return [
    { itemCode: line.itemCode, vendorId: cheap.vendorId, vendorName: cheap.vendorName, qty: fromCheap, unitPrice: cheap.unitPrice, leadTimeDays: cheap.leadTimeDays, reliability: cheap.reliability },
    { itemCode: line.itemCode, vendorId: fast.vendorId, vendorName: fast.vendorName, qty: balance, unitPrice: fast.unitPrice, leadTimeDays: fast.leadTimeDays, reliability: fast.reliability },
  ];
}

/* ------------------------------------------------------------------ simulate -- */

/**
 * Compute what a candidate would actually do. Nothing here is estimated by feel.
 *
 * The completion date is the critical path — the LONGEST component lead time, then
 * production, then inspection — because a factory waits for its slowest part, not its
 * average one. Averaging lead times is the single most common way a plan looks fine and
 * lands late.
 */
function buildCandidate(
  ev: PlanningEvidence,
  key: StrategyKey,
  name: string,
  description: string,
  sourcing: SourcingDecision[],
): Candidate {
  const materialReadyDays = sourcing.reduce((m, s) => Math.max(m, s.leadTimeDays), 0);

  // Capacity headroom below 1 stretches production proportionally: a work centre at 80% of
  // the load it needs takes 1/0.8 as long. Above 1 buys nothing — a free machine does not
  // make a job faster than its cycle time.
  const throughput = Math.min(1, Math.max(0.2, ev.capacityHeadroom));
  const productionDays = ev.productionDays / throughput;

  const totalDays = materialReadyDays + productionDays + ev.inspectionDays;
  const completionDate = addWorkingDays(ev.today, totalDays);
  const slackDays = workingDaysBetween(completionDate, ev.promisedDate);

  const purchaseCost = sourcing.reduce((sum, s) => sum + s.qty * s.unitPrice, 0);
  const totalCost = ev.baseUnitCost * ev.orderQty + purchaseCost;
  const unitCost = totalCost / Math.max(1, ev.orderQty);
  const revenue = ev.unitSellingPrice * ev.orderQty;
  const marginPct = revenue > 0 ? ((revenue - totalCost) / revenue) * 100 : 0;

  // Confidence is a product, not an average — a chain is as strong as its weakest link, and
  // averaging lets one near-certain component hide one that is a coin toss.
  const supplyReliability = sourcing.length
    ? sourcing.reduce((p, s) => p * s.reliability, 1)
    : 1;
  const scheduleConfidence = slackDays >= 0 ? Math.min(1, 0.7 + slackDays * 0.05) : Math.max(0.05, 0.6 + slackDays * 0.12);
  const capacityConfidence = Math.min(1, ev.capacityHeadroom);
  const confidence = round2(supplyReliability * scheduleConfidence * capacityConfidence * 100);

  // FEASIBLE MEANS POSSIBLE, NOT PERMITTED. The two were one flag, and it was wrong in a
  // way a stress run caught: a human approving a margin exception is the entire mechanism
  // by which an under-floor plan is meant to proceed, so "approved, then executed an
  // infeasible plan" was both the correct behaviour and a violated invariant.
  //
  // A missed date is arithmetic — no signature makes 18 days of lead time fit into 9. A
  // margin under the floor is a POLICY position, and policy is exactly what a person with
  // authority is entitled to overrule. So the floor is not a feasibility violation; it is
  // handled in `applyAutonomy`, which turns it into an approval request.
  const violations: string[] = [];
  if (slackDays < 0) violations.push(`lands ${Math.abs(slackDays)} working day(s) after the promised date`);
  for (const s of sourcing) {
    if (!Number.isFinite(s.unitPrice)) violations.push(`${s.itemCode}: no price from ${s.vendorName}`);
  }

  // Recorded separately so the screen can still say WHY a person is being asked, without
  // the plan being branded impossible.
  const policyBreaches: string[] = [];
  if (marginPct < ev.marginFloorPct) {
    policyBreaches.push(`margin ${marginPct.toFixed(1)}% is below the ${ev.marginFloorPct}% floor`);
  }

  return {
    key, name, description, sourcing,
    materialReadyDays,
    completionDate,
    slackDays,
    totalCost: round2(totalCost),
    unitCost: round2(unitCost),
    marginPct: round2(marginPct),
    expeditePremium: 0, // filled by rank(), which needs every candidate to compare against
    confidence,
    feasible: violations.length === 0,
    violations,
    policyBreaches,
    requiresApproval: false,
    approvalReason: null,
    score: 0,
  };
}

/* --------------------------------------------------------------------- score -- */

/**
 * Rank the candidates and decide which need a human.
 *
 * The premium is computed against the CHEAPEST candidate rather than against a budget,
 * because "this costs ₹84,000 more than the alternative" is the sentence an approver can
 * actually act on. A number with no comparison in it is not a decision brief.
 */
export function rank(candidates: Candidate[], weights: TradeOffWeights = DEFAULT_WEIGHTS): Candidate[] {
  if (candidates.length === 0) return [];
  const cheapest = Math.min(...candidates.map((c) => c.totalCost));
  const dearest = Math.max(...candidates.map((c) => c.totalCost));
  const bestSlack = Math.max(...candidates.map((c) => c.slackDays));
  const worstSlack = Math.min(...candidates.map((c) => c.slackDays));

  for (const c of candidates) {
    c.expeditePremium = round2(c.totalCost - cheapest);

    const onTime = c.slackDays >= 0 ? 1 : 0;
    const slackNorm = norm(c.slackDays, worstSlack, bestSlack);
    const costNorm = 1 - norm(c.totalCost, cheapest, dearest);
    const riskNorm = c.confidence / 100;
    // "Disruption" is how far the plan departs from simply buying from one vendor.
    const disruptionNorm = 1 - Math.min(1, (c.sourcing.length - 1) * 0.25);

    c.score = round2(
      (weights.onTime * (onTime * 0.7 + slackNorm * 0.3) +
        weights.margin * costNorm +
        weights.risk * riskNorm +
        weights.disruption * disruptionNorm) * 100,
    );

    // An infeasible candidate is never chosen, but it is still SHOWN — "why not the cheap
    // one?" is the first question anybody asks, and the answer has to be on the screen.
    if (!c.feasible) c.score = round2(c.score - 100);
  }

  return [...candidates].sort((a, b) => b.score - a.score);
}

/**
 * Decide whether the winning candidate is inside the mission's own authority.
 *
 * Two separate reasons to stop, and they are different questions: spending more than the
 * envelope allows is a COMMERCIAL decision, and accepting a margin under the floor is a
 * POLICY exception. Collapsing them into one "needs approval" flag loses the sentence the
 * approver needs to read.
 */
export function applyAutonomy(candidates: Candidate[], ev: PlanningEvidence): Candidate[] {
  for (const c of candidates) {
    const reasons: string[] = [];

    // Lowest authority: propose, never commit. Checked FIRST and independently of the
    // premium, because the cheapest plan's premium is zero by definition and `0 > 0` would
    // wave it straight through — which is exactly what happened before this existed.
    if (ev.requireApprovalForAnyCommitment) {
      reasons.push(
        c.sourcing.length > 0
          ? `this mission is set to suggest only, and the plan commits ₹${fmtInr(c.totalCost)} of purchase`
          : "this mission is set to suggest only, and reserving stock for the order is an operational commitment",
      );
    }

    if (c.expeditePremium > ev.expediteAutonomyLimit) {
      reasons.push(
        `the ₹${fmtInr(c.expeditePremium)} premium exceeds the ₹${fmtInr(ev.expediteAutonomyLimit)} this mission may commit alone`,
      );
    }
    if (c.marginPct < ev.marginFloorPct) {
      reasons.push(`margin ${c.marginPct.toFixed(1)}% is under the ${ev.marginFloorPct}% floor`);
    }
    c.requiresApproval = reasons.length > 0;
    c.approvalReason = reasons.length ? reasons.join(", and ") : null;
  }
  return candidates;
}

/* ------------------------------------------------------------------ critique -- */

export interface Critique {
  passed: boolean;
  checks: Array<{ check: string; passed: boolean; detail: string; kind: "validity" | "authority" }>;
  /** Things that make the plan WRONG. Any one of these stops the mission. */
  objections: string[];
  /**
   * Things the plan cannot do on its own authority.
   *
   * Kept apart from `objections` after a run where adding the margin-floor check to the
   * verifier killed the mission outright — which is precisely backwards. A margin under the
   * floor is not a defective plan; it is a plan that needs a person to say yes. Collapsing
   * the two means the verifier answers a question that belongs to the approval gate, and
   * the human never gets asked.
   */
  escalations: string[];
}

/**
 * The independent check, run against the EVIDENCE rather than against the plan's own claims.
 *
 * This exists because a planner that grades its own homework will always pass. Every check
 * here re-derives a number from `ev` and compares it to what the candidate asserted — so a
 * bug in `buildCandidate` shows up as a disagreement rather than as a confident wrong plan
 * that agrees with itself.
 */
export function critique(chosen: Candidate, ev: PlanningEvidence): Critique {
  const checks: Critique["checks"] = [];
  const objections: string[] = [];
  const escalations: string[] = [];

  const add = (
    check: string,
    passed: boolean,
    detail: string,
    kind: "validity" | "authority" = "validity",
  ) => {
    checks.push({ check, passed, detail, kind });
    if (!passed) (kind === "authority" ? escalations : objections).push(detail);
  };

  // 1. Every shortage is actually covered by the sourcing plan.
  for (const s of ev.shortages.filter((x) => x.shortQty > 1e-9)) {
    const bought = chosen.sourcing.filter((d) => d.itemCode === s.itemCode).reduce((n, d) => n + d.qty, 0);
    add(
      `coverage of ${s.itemCode}`,
      bought + 1e-6 >= s.shortQty,
      bought + 1e-6 >= s.shortQty
        ? `${s.itemCode}: short ${fmt3(s.shortQty)}, buying ${fmt3(bought)}`
        : `${s.itemCode} is short ${fmt3(s.shortQty)} and the plan only buys ${fmt3(bought)}`,
    );
  }

  // 2. Every chosen vendor is qualified. A price advantage is not a qualification.
  for (const d of chosen.sourcing) {
    const line = ev.shortages.find((s) => s.itemCode === d.itemCode);
    const vendor = line?.suppliers.find((v) => v.vendorId === d.vendorId);
    add(
      `${d.vendorName} is qualified for ${d.itemCode}`,
      Boolean(vendor?.qualified),
      vendor?.qualified
        ? `${d.vendorName} is an approved source for ${d.itemCode}`
        : `${d.vendorName} is NOT a qualified source for ${d.itemCode}`,
    );
  }

  // 3. No vendor is being asked for more than it said it could supply.
  for (const d of chosen.sourcing) {
    const vendor = ev.shortages.find((s) => s.itemCode === d.itemCode)?.suppliers.find((v) => v.vendorId === d.vendorId);
    const within = !vendor || d.qty <= vendor.capacityUnits + 1e-6;
    add(
      `${d.vendorName} capacity for ${d.itemCode}`,
      within,
      within
        ? `${fmt3(d.qty)} is within ${d.vendorName}'s committed ${fmt3(vendor?.capacityUnits ?? 0)}`
        : `${d.vendorName} was asked for ${fmt3(d.qty)} but committed only ${fmt3(vendor?.capacityUnits ?? 0)}`,
    );
  }

  // 4. The date the plan claims is the date its own lead times produce.
  const recomputed = addWorkingDays(
    ev.today,
    chosen.sourcing.reduce((m, s) => Math.max(m, s.leadTimeDays), 0) +
      ev.productionDays / Math.min(1, Math.max(0.2, ev.capacityHeadroom)) +
      ev.inspectionDays,
  );
  add(
    "completion date is arithmetic, not assertion",
    recomputed === chosen.completionDate,
    recomputed === chosen.completionDate
      ? `independently recomputed to ${recomputed}`
      : `plan claims ${chosen.completionDate}; the evidence gives ${recomputed}`,
  );

  // 5. The promise is actually met.
  add(
    "promised date is met",
    chosen.slackDays >= 0,
    chosen.slackDays >= 0
      ? `${chosen.slackDays} working day(s) of slack against ${ev.promisedDate}`
      : `misses ${ev.promisedDate} by ${Math.abs(chosen.slackDays)} working day(s)`,
  );

  // 6. The margin floor holds.
  //
  // Added after a run where the verifier reported "all 17 checks passed" on a plan the
  // planner had already marked infeasible. Both were right — the date was fine and the
  // margin was not — but a verifier silent on half the feasibility test reads as a verifier
  // that missed something. Anything `feasible` depends on has to be re-derived here, or the
  // two disagree in public.
  const recomputedMargin = ev.unitSellingPrice > 0
    ? ((ev.unitSellingPrice * ev.orderQty - chosen.totalCost) / (ev.unitSellingPrice * ev.orderQty)) * 100
    : 0;
  add(
    "margin floor holds",
    recomputedMargin >= ev.marginFloorPct,
    recomputedMargin >= ev.marginFloorPct
      ? `${recomputedMargin.toFixed(1)}% against a ${ev.marginFloorPct}% floor`
      : `${recomputedMargin.toFixed(1)}% is below the ${ev.marginFloorPct}% floor — this needs authority, not a better plan`,
    "authority",
  );

  // `passed` means "this plan is sound", not "this plan may proceed". A plan can be entirely
  // valid and still require a signature; that is the next gate's question.
  return { passed: objections.length === 0, checks, objections, escalations };
}

/* --------------------------------------------------------------------- utils -- */

function norm(v: number, lo: number, hi: number): number {
  if (hi - lo < 1e-9) return 1;
  return (v - lo) / (hi - lo);
}
const round2 = (n: number): number => Math.round(n * 100) / 100;
const fmt3 = (n: number): string => n.toFixed(3).replace(/\.?0+$/, "");

/** Indian digit grouping — 12,45,678 rather than 1,245,678. */
export function fmtInr(n: number): string {
  const [whole = "0"] = Math.round(Math.abs(n)).toString().split(".");
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${n < 0 ? "-" : ""}${grouped}`;
}
