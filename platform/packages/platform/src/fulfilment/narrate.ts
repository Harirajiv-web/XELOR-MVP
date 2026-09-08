import {
  fmtInr,
  type Candidate,
  type Critique,
  type PlanningEvidence,
  type ShortageLine,
} from "./planner.js";

/**
 * THE LANGUAGE LAYER — and the seam where a model would go.
 *
 * Everything upstream of this file decides; this file only says. That separation is what
 * makes the deterministic build honest rather than a mock: swap this module for an LLM and
 * the plan does not change by one rupee, only its phrasing does. Nothing here may compute a
 * number, choose a supplier, or reach a conclusion — it receives them.
 *
 * The writing rule, which is what stops templated text reading as templated text: EVERY
 * SENTENCE MUST CONTAIN A NUMBER THE READER COULD CHECK. Generic connective prose ("the
 * system carefully analysed all available options") is what makes a demo feel scripted,
 * because it would be equally true of any input. "SPAR-4410 is short 46 of 122 castings"
 * could only have been produced by this data.
 *
 * So there are no adjectives about the system's own diligence anywhere in this file.
 */

const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);
const days = (n: number): string => `${n} working ${plural(n, "day")}`;
/**
 * Trailing zeros stripped — but not the number itself.
 *
 * `(0).toFixed(0)` is "0", and `"0".replace(/\.?0+$/, "")` is the empty string. The first
 * version of this shipped a sentence reading "on hand 1183.674, inbound ." — which reads as
 * a rendering fault and is one.
 */
const qty = (n: number): string => {
  if (n === 0) return "0";
  const s = n.toFixed(n % 1 === 0 ? 0 : 3);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};

/* ------------------------------------------------------------------ evidence -- */

/** What the shortage scan found. Reads differently when nothing is short. */
export function narrateShortages(shortages: readonly ShortageLine[]): string {
  const short = shortages.filter((s) => s.shortQty > 1e-9);
  if (shortages.length === 0) return "The order needs no components beyond finished stock.";
  if (short.length === 0) {
    return `All ${shortages.length} ${plural(shortages.length, "component")} are covered by stock and inbound supply. No buying decision is required.`;
  }
  const worst = [...short].sort((a, b) => b.shortQty - a.shortQty)[0]!;
  const others = short.length - 1;
  const tail = others > 0 ? `, and ${others} other ${plural(others, "component")}` : "";
  return (
    `${worst.itemCode} (${worst.itemName}) is short ${qty(worst.shortQty)} of ${qty(worst.requiredQty)}` +
    `${tail}. On hand ${qty(worst.onHandQty)}, inbound ${qty(worst.incomingQty)}.`
  );
}

/** Who could supply the shortage, and on what terms. */
export function narrateSuppliers(shortages: readonly ShortageLine[]): string {
  const short = shortages.filter((s) => s.shortQty > 1e-9);
  if (short.length === 0) return "No sourcing question arises.";
  const line = short[0]!;
  const qualified = line.suppliers.filter((s) => s.qualified);
  if (qualified.length === 0) {
    return `${line.itemCode} has no qualified supplier on record. This cannot be sourced without an engineering decision.`;
  }
  if (qualified.length === 1) {
    const only = qualified[0]!;
    return `${line.itemCode} has one qualified source: ${only.vendorName}, ₹${fmtInr(only.unitPrice)}/unit at ${days(only.leadTimeDays)}. There is no sourcing choice to make.`;
  }
  const byPrice = [...qualified].sort((a, b) => a.unitPrice - b.unitPrice);
  const byLead = [...qualified].sort((a, b) => a.leadTimeDays - b.leadTimeDays);
  const cheap = byPrice[0]!;
  const fast = byLead[0]!;
  if (cheap.vendorId === fast.vendorId) {
    return `${cheap.vendorName} is both the cheapest (₹${fmtInr(cheap.unitPrice)}/unit) and the fastest (${days(cheap.leadTimeDays)}) qualified source for ${line.itemCode}.`;
  }
  const gapDays = cheap.leadTimeDays - fast.leadTimeDays;
  const gapMoney = fast.unitPrice - cheap.unitPrice;
  return (
    `${line.itemCode} has ${qualified.length} qualified sources. ${cheap.vendorName} is ₹${fmtInr(gapMoney)}/unit cheaper; ` +
    `${fast.vendorName} is ${days(gapDays)} faster. That is the trade-off this plan has to settle.`
  );
}

/** Capacity, said as a consequence rather than as a percentage. */
export function narrateCapacity(headroom: number, productionDays: number): string {
  if (headroom >= 1) {
    return `The constraining work centre has capacity to spare; production holds at ${days(productionDays)}.`;
  }
  const stretched = Math.ceil(productionDays / Math.max(0.2, headroom));
  const lost = stretched - productionDays;
  return (
    `The constraining work centre is at ${Math.round(headroom * 100)}% of the load this order needs, ` +
    `which stretches production from ${days(productionDays)} to ${days(stretched)} — ${days(lost)} of the slack is gone before any supplier is chosen.`
  );
}

/* ---------------------------------------------------------------- comparison -- */

/** Why this candidate won, said against the runner-up rather than in isolation. */
export function narrateChoice(ranked: readonly Candidate[], ev: PlanningEvidence): string {
  const [best, second] = ranked;
  if (!best) return "No strategy could be constructed from the available evidence.";

  if (!best.feasible) {
    return (
      `No feasible strategy exists. The best-scoring option, ${best.name}, still ${best.violations.join(" and ")}. ` +
      `This needs a decision that is not the mission's to make.`
    );
  }

  const head =
    `${best.name}: lands ${best.completionDate}, ` +
    `${best.slackDays >= 0 ? `${days(best.slackDays)} inside` : `${days(Math.abs(best.slackDays))} past`} the ${ev.promisedDate} promise, ` +
    `at ${best.marginPct.toFixed(1)}% margin and ${best.confidence.toFixed(0)}% delivery confidence.`;

  if (!second) return `${head} It was the only feasible strategy the evidence allowed.`;

  // The comparison sentence — the one that proves a choice happened rather than a lookup.
  const dCost = best.totalCost - second.totalCost;
  const dSlack = best.slackDays - second.slackDays;
  const parts: string[] = [];
  if (Math.abs(dCost) > 1) {
    parts.push(dCost > 0 ? `costs ₹${fmtInr(dCost)} more` : `costs ₹${fmtInr(-dCost)} less`);
  }
  if (dSlack !== 0) {
    parts.push(dSlack > 0 ? `arrives ${days(dSlack)} earlier` : `arrives ${days(-dSlack)} later`);
  }
  if (!second.feasible) {
    parts.push(`and ${second.name.toLowerCase()} is not feasible — it ${second.violations[0]}`);
  }
  const versus = parts.length
    ? ` Against ${second.name.toLowerCase()} it ${parts.join(", ")}.`
    : ` It scored ahead of ${second.name.toLowerCase()} on delivery confidence.`;

  return head + versus;
}

/** The verifier's own words. Deliberately blunt when it objects. */
export function narrateCritique(c: Critique): string {
  if (!c.passed) {
    return `${c.objections.length} of ${c.checks.length} checks failed: ${c.objections.join("; ")}. The plan is not cleared to execute.`;
  }
  const sound = `All ${c.checks.length} independent ${plural(c.checks.length, "check")} passed, including recomputing the completion date and the margin from the evidence rather than accepting the plan's own figures.`;
  if (c.escalations.length === 0) return sound;
  // Sound but not permitted — and the sentence has to make that distinction, because
  // "checks passed" followed by a stop reads as a contradiction otherwise.
  return `${sound} The plan is sound but not within this mission's authority: ${c.escalations.join("; ")}.`;
}

/* ------------------------------------------------------------------ approval -- */

export interface DecisionBrief {
  objectiveAtRisk: string;
  whatChanged: string;
  recommendation: string;
  why: string;
  /** The real application surfaces this approval authorises the mission to update. */
  applicationTargets: Array<{ module: string; screen: string }>;
  alternatives: Array<{ name: string; effect: string; feasible: boolean }>;
  ifRejected: string;
  ifDelayed: string;
  evidence: string[];
}

/**
 * The approval request.
 *
 * Written to §10.1's requirement that this must never be a bare "Approve?". The two lines
 * people actually decide on are `ifRejected` and `ifDelayed` — an approver's real question
 * is not "is this good" but "what happens if I say no, and what happens if I go to lunch
 * first". A brief that cannot answer those makes the human a rubber stamp, which is the
 * failure mode a governed system is supposed to prevent.
 */
export function buildDecisionBrief(
  chosen: Candidate,
  ranked: readonly Candidate[],
  ev: PlanningEvidence,
  soNo: string,
  customer: string,
): DecisionBrief {
  const fallback = ranked.find((c) => c.key !== chosen.key && c.feasible) ?? null;

  return {
    objectiveAtRisk: `${customer} · ${soNo} — ${qty(ev.orderQty)} units promised ${ev.promisedDate}.`,
    whatChanged: chosen.approvalReason
      ? `The recommended recovery ${chosen.approvalReason}.`
      : "The recommended plan sits outside this mission's autonomy envelope.",
    recommendation: `${chosen.name} — ₹${fmtInr(chosen.totalCost)} total, landing ${chosen.completionDate}.`,
    why:
      `It is the only ${ranked.filter((c) => c.feasible).length > 1 ? "highest-scoring " : ""}feasible option: ` +
      `${chosen.confidence.toFixed(0)}% delivery confidence at ${chosen.marginPct.toFixed(1)}% margin, ` +
      `${chosen.slackDays >= 0 ? `${days(chosen.slackDays)} inside` : `${days(Math.abs(chosen.slackDays))} past`} the promise.`,
    // THESE ARE SCREEN NAMES, and they have to be the ones printed on the screens.
    // The line reads "if approved, this plan updates Purchase → …" and then the tour walks
    // the person onto that very screen, whose heading is "Purchase orders", not "Orders".
    // Naming a screen that does not exist is the one mistake this sentence cannot make, so
    // these strings track the step registry's `where` labels in `mission.service.ts`.
    applicationTargets: [
      { module: "Sales", screen: "Orders" },
      ...(chosen.sourcing.length > 0 ? [{ module: "Purchase", screen: "Purchase orders" }] : []),
      ...(chosen.key !== "stock_only" ? [{ module: "Production", screen: "Work orders" }] : []),
    ],
    alternatives: ranked
      .filter((c) => c.key !== chosen.key)
      .map((c) => ({
        name: c.name,
        effect: c.feasible
          ? `${c.completionDate}, ₹${fmtInr(c.totalCost)}, ${c.marginPct.toFixed(1)}% margin`
          : `not feasible — ${c.violations.join("; ")}`,
        feasible: c.feasible,
      })),
    ifRejected: fallback
      ? `Falls back to ${fallback.name}: ${fallback.completionDate} (${fallback.slackDays >= 0 ? `${days(fallback.slackDays)} inside` : `${days(Math.abs(fallback.slackDays))} past`} the promise), ₹${fmtInr(fallback.totalCost)}.`
      : `There is no feasible fallback. ${soNo} would miss ${ev.promisedDate} and ${customer} would need to be told.`,
    ifDelayed:
      `Every day this waits moves the completion date by a day — the supplier's ` +
      `${chosen.sourcing.reduce((m, s) => Math.max(m, s.leadTimeDays), 0)}-day lead time starts when the order is placed, not when it was proposed.`,
    evidence: [
      `Stock and inbound read from the ledger as at ${ev.today}`,
      `${ev.shortages.filter((s) => s.shortQty > 1e-9).length} component shortage(s) netted against on-hand and open supply`,
      `Vendor prices, lead times and reliability from the supplier master`,
      `Margin floor ${ev.marginFloorPct}% and expedite limit ₹${fmtInr(ev.expediteAutonomyLimit)} from tenant policy`,
    ],
  };
}

/* ------------------------------------------------------------------- outcome -- */

export function narrateOutcome(o: {
  orderedQty: number;
  deliveredQty: number;
  promisedDate: string;
  actualDate: string;
  plannedCost: number;
  actualCost: number;
  marginPct: number;
  targetMarginPct: number;
  autonomousActions: number;
  approvedActions: number;
  planVersions: number;
}): string {
  const onTime = o.actualDate <= o.promisedDate;
  const complete = o.deliveredQty + 1e-9 >= o.orderedQty;
  const costDelta = o.actualCost - o.plannedCost;

  return [
    complete
      ? `${qty(o.deliveredQty)} of ${qty(o.orderedQty)} delivered.`
      : `${qty(o.deliveredQty)} of ${qty(o.orderedQty)} delivered — ${qty(o.orderedQty - o.deliveredQty)} short.`,
    onTime
      ? `Promised ${o.promisedDate}, completed ${o.actualDate}.`
      : `Promised ${o.promisedDate}, completed ${o.actualDate} — late.`,
    Math.abs(costDelta) < 1
      ? `Cost landed on plan at ₹${fmtInr(o.actualCost)}.`
      : `Cost ₹${fmtInr(o.actualCost)} against ₹${fmtInr(o.plannedCost)} planned (${costDelta > 0 ? "+" : "−"}₹${fmtInr(Math.abs(costDelta))}).`,
    `Margin ${o.marginPct.toFixed(1)}% against a ${o.targetMarginPct}% target.`,
    `${o.autonomousActions} ${plural(o.autonomousActions, "action")} taken autonomously, ${o.approvedActions} under human approval, across ${o.planVersions} plan ${plural(o.planVersions, "version")}.`,
  ].join(" ");
}
