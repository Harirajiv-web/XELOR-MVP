/**
 * THE SEAM. One interface, one implementation, and the implementation is not a model.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS, SAID PLAINLY, BECAUSE THE HONESTY IS THE PRODUCT
 * ---------------------------------------------------------------------------
 * `DeterministicEngine` is arithmetic and rules. No model is called, no API key exists, no
 * request leaves the process, and nothing here is trained on anything. Every sentence it
 * produces was written by a person in `narrate.ts` and filled with numbers this engine
 * computed in `planner.ts`. When the product says a mission is 86% confident, that number
 * came out of supplier reliability × capacity headroom × schedule slack — it is checkable,
 * and `planner.test.ts` checks it.
 *
 * Nothing in this codebase may claim a model produced a result. If that ever changes, it
 * changes HERE, by adding a second implementation of the interface below — and the label
 * `kind: "model"` then travels with every answer it gives.
 *
 * ---------------------------------------------------------------------------
 * WHY DETERMINISTIC IS THE RIGHT ANSWER HERE, NOT A PLACEHOLDER FOR A REAL ONE
 * ---------------------------------------------------------------------------
 * Order fulfilment in a single factory is a closed domain with exact arithmetic: a finite
 * set of parts, a finite set of qualified vendors, dates that add up or do not, and a margin
 * that is a subtraction. A symbolic planner over that domain inherits the soundness of its
 * own search. A language model over the same domain introduces goals and actions that were
 * never in it — a part number that does not exist, a supplier nobody qualified, a lead time
 * it inferred from a sentence. In a chat window that is a wrong answer. On this screen it is
 * a purchase order.
 *
 * So the split is: THE ENGINE DECIDES, and it decides with rules. The only part a model
 * would improve is the phrasing, and `narrate.ts` is already that part, already isolated,
 * already replaceable without moving a rupee.
 *
 * ---------------------------------------------------------------------------
 * WHERE A REAL ONE WOULD BE SWAPPED IN
 * ---------------------------------------------------------------------------
 * `apps/api/src/fulfilment/mission.service.ts` holds exactly one instance of
 * `IntelligenceEngine` and calls nothing else for its reasoning. A second implementation —
 * say `RouterEngine`, going through the provider-agnostic AI router — would:
 *
 *   · implement the same five methods, and
 *   · report `kind: "model"` plus the model id in `name`, so every step it touched could be
 *     labelled on screen, and
 *   · still be run past `verify()`, which re-derives the numbers from the evidence. A model
 *     that proposes a plan the deterministic verifier cannot reproduce must not execute.
 *
 * That last point is the one that makes the seam worth having. The check does not become
 * optional because the proposer got cleverer.
 */

import {
  DEFAULT_WEIGHTS,
  applyAutonomy,
  critique,
  generateCandidates,
  type Candidate,
  type Critique,
  type PlanningEvidence,
  type TradeOffWeights,
} from "../fulfilment/planner.js";
import {
  buildDecisionBrief,
  narrateCapacity,
  narrateChoice,
  narrateCritique,
  narrateShortages,
  narrateSuppliers,
  type DecisionBrief,
} from "../fulfilment/narrate.js";

/* ------------------------------------------------------------------ contract -- */

/** What `assess()` found in the evidence, before any strategy exists. */
export interface Assessment {
  /** Components that cannot be covered from stock. The reason a plan is needed at all. */
  shortCount: number;
  componentCount: number;
  /** Distinct qualified suppliers across every short component. */
  supplierOptions: number;
  /** True when the constraining work centre cannot give this batch a full run. */
  capacityConstrained: boolean;
  /** One sentence each, from `narrate.ts`. Never computed here. */
  materials: string;
  suppliers: string;
  capacity: string;
}

/** What `recommend()` decided, with everything it rejected still attached. */
export interface Recommendation {
  /** Every strategy considered, best first. Infeasible ones stay in the list, scored down. */
  ranked: Candidate[];
  /** `ranked[0]`, or null when the evidence supports no strategy at all. */
  chosen: Candidate | null;
  /** Why this one, said against the runner-up. */
  rationale: string;
  weights: TradeOffWeights;
}

/** Confidence, and the three things that produced it. */
export interface ConfidenceView {
  /** 0..100. */
  value: number;
  /** What moved it, in words a person can argue with. */
  drivers: string[];
  /** How this number was produced. Never "the model thought so". */
  basis: "deterministic";
}

/** The things the mission asks to have put into words. */
export type ExplainRequest =
  | { of: "materials"; evidence: PlanningEvidence }
  | { of: "suppliers"; evidence: PlanningEvidence }
  | { of: "capacity"; evidence: PlanningEvidence }
  | { of: "choice"; ranked: readonly Candidate[]; evidence: PlanningEvidence }
  | { of: "critique"; critique: Critique };

/**
 * The five things the mission needs from whatever is doing the thinking.
 *
 * Kept to five deliberately. Every method here is called by a named step in the arc, and a
 * method nobody calls is a promise about a future implementation rather than a contract.
 */
export interface IntelligenceEngine {
  /** Human-readable identity. Shown on screen beside anything this engine produced. */
  readonly name: string;
  /** "deterministic" — rules and arithmetic. "model" — a language model was involved. */
  readonly kind: "deterministic" | "model";

  /** What is true right now, before any option is considered. */
  assess(evidence: PlanningEvidence): Assessment;

  /**
   * Compare the ways through and pick one.
   *
   * `refusedStrategies` maps a strategy key to the words a person used when they turned it
   * down. A refused strategy is scored out of contention and STAYS IN THE LIST — deleting
   * it would make the next plan look as though it never considered the obvious option.
   */
  recommend(evidence: PlanningEvidence, refusedStrategies?: ReadonlyMap<string, string>): Recommendation;

  /** Re-derive the plan's numbers from the evidence. The proposer never grades itself. */
  verify(chosen: Candidate, evidence: PlanningEvidence): Critique;

  /** Put something into words. This method — and only this one — a model could own. */
  explain(request: ExplainRequest): string;

  /** How sure, and why. */
  confidence(chosen: Candidate): ConfidenceView;

  /** The approval request a human reads. Never a bare "Approve?". */
  brief(chosen: Candidate, ranked: readonly Candidate[], evidence: PlanningEvidence, soNo: string, customer: string): DecisionBrief;
}

/* ------------------------------------------------------------ the deterministic -- */

/** How far a refused strategy is pushed down. Large enough that nothing outranks a "no". */
const REFUSAL_PENALTY = 1000;

/**
 * The engine this product actually ships.
 *
 * Every method is a delegation. There is no arithmetic in this class and there must not be:
 * the planner and the narrator are unit-tested, and a second copy of a rule here would be
 * the copy that drifts. If a method below ever needs to compute something, the computation
 * belongs in `planner.ts` with a test beside it.
 */
export class DeterministicEngine implements IntelligenceEngine {
  readonly name = "IND deterministic fulfilment engine";
  readonly kind = "deterministic" as const;

  constructor(private readonly weights: TradeOffWeights = DEFAULT_WEIGHTS) {}

  assess(evidence: PlanningEvidence): Assessment {
    const short = evidence.shortages.filter((s) => s.shortQty > 1e-9);
    const suppliers = new Set(
      short.flatMap((s) => s.suppliers.filter((v) => v.qualified).map((v) => v.vendorId)),
    );
    return {
      shortCount: short.length,
      componentCount: evidence.shortages.length,
      supplierOptions: suppliers.size,
      capacityConstrained: evidence.capacityHeadroom < 1,
      materials: narrateShortages(evidence.shortages),
      suppliers: narrateSuppliers(evidence.shortages),
      capacity: narrateCapacity(evidence.capacityHeadroom, evidence.productionDays),
    };
  }

  recommend(evidence: PlanningEvidence, refusedStrategies?: ReadonlyMap<string, string>): Recommendation {
    const all = applyAutonomy(generateCandidates(evidence), evidence);

    for (const c of all) {
      const why = refusedStrategies?.get(c.key);
      if (why === undefined) continue;
      // Scored out of contention, NOT marked infeasible. A strategy a person declined is
      // still perfectly possible — they simply do not want it — and calling it impossible
      // would be the same conflation that lets an approved margin exception look like an
      // illegal execution.
      c.policyBreaches = [...c.policyBreaches, `you turned this down: ${why}`];
      c.score -= REFUSAL_PENALTY;
    }

    const ranked = [...all].sort((a, b) => b.score - a.score);
    return {
      ranked,
      chosen: ranked[0] ?? null,
      rationale: narrateChoice(ranked, evidence),
      weights: this.weights,
    };
  }

  verify(chosen: Candidate, evidence: PlanningEvidence): Critique {
    return critique(chosen, evidence);
  }

  explain(request: ExplainRequest): string {
    switch (request.of) {
      case "materials":
        return narrateShortages(request.evidence.shortages);
      case "suppliers":
        return narrateSuppliers(request.evidence.shortages);
      case "capacity":
        return narrateCapacity(request.evidence.capacityHeadroom, request.evidence.productionDays);
      case "choice":
        return narrateChoice(request.ranked, request.evidence);
      case "critique":
        return narrateCritique(request.critique);
    }
  }

  /**
   * The number, and the three things behind it.
   *
   * The drivers are read off the candidate rather than recomputed, so this can never
   * disagree with the score the planner produced. A confidence figure with no drivers is a
   * mood; one that names the supplier and the slack is an argument.
   */
  confidence(chosen: Candidate): ConfidenceView {
    const drivers: string[] = [];
    const worst = [...chosen.sourcing].sort((a, b) => a.reliability - b.reliability)[0];
    if (worst) {
      drivers.push(
        `weakest supplier on this plan is ${worst.vendorName} at ${Math.round(worst.reliability * 100)}% on-time`,
      );
    }
    drivers.push(
      chosen.slackDays >= 0
        ? `${chosen.slackDays} working day(s) of slack against the promise`
        : `${Math.abs(chosen.slackDays)} working day(s) past the promise`,
    );
    if (!chosen.feasible) drivers.push(`not feasible: ${chosen.violations.join("; ")}`);
    if (chosen.policyBreaches.length > 0) drivers.push(...chosen.policyBreaches);

    return { value: chosen.confidence, drivers, basis: "deterministic" };
  }

  brief(
    chosen: Candidate,
    ranked: readonly Candidate[],
    evidence: PlanningEvidence,
    soNo: string,
    customer: string,
  ): DecisionBrief {
    return buildDecisionBrief(chosen, ranked, evidence, soNo, customer);
  }
}
