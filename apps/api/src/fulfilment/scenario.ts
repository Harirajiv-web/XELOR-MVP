/**
 * THE SYNTHETIC FACTORY — everything the schema does not hold, in one file, labelled.
 *
 * The vendor master carries a code, a name, a GSTIN and payment terms. It does not carry a
 * unit price, a lead time, a reliability history or a capacity commitment, because this
 * product has no sourcing module yet. The planner needs all four.
 *
 * There are two honest ways to handle that and one dishonest one. The dishonest one is to
 * scatter plausible numbers through the service where they read as if they came from the
 * database. The honest ones are to build a sourcing module, or to put every invented number
 * in a single file that says so and tag it in the API response so the UI can label it.
 *
 * This is the second. Every value here is surfaced with `provenance: "seeded"`, the Mission
 * Control screen renders that differently from `"live"`, and §11.3 of the upgrade plan
 * requires exactly that distinction: "The interface should always label synthetic data and
 * simulated events. Investor trust is more valuable than theatrical realism."
 *
 * When a sourcing module lands, this file is deleted and the reads move to it. Nothing else
 * changes, because the planner already takes its evidence as an argument.
 */

export interface SeededSupplierTerms {
  vendorCode: string;
  vendorName: string;
  unitPrice: number;
  leadTimeDays: number;
  /** Delivered-on-time rate. Drives risk scoring, never price. */
  reliability: number;
  capacityUnits: number;
  qualified: boolean;
}

/**
 * Sourcing terms by item code. The two-vendor shape is what makes the demo a decision
 * rather than a lookup: one cheap and slow, one dear and fast, with neither dominating.
 * A planner facing a single vendor has nothing to decide and nothing to explain.
 */
export const SEEDED_SOURCING: Record<string, SeededSupplierTerms[]> = {
  // The casting is the long pole, and deliberately so. A demo where every component has the
  // same lead time has no critical path, and a planner with no critical path has nothing to
  // reason about — it would be choosing on price alone, which is a spreadsheet, not a plan.
  "CST-PX4-CAS": [
    { vendorCode: "V-SUN-01", vendorName: "Sundaram Precision Castings", unitPrice: 1850, leadTimeDays: 18, reliability: 0.92, capacityUnits: 200, qualified: true },
    { vendorCode: "V-MER-01", vendorName: "Meridian Metals & Alloys", unitPrice: 2340, leadTimeDays: 7, reliability: 0.88, capacityUnits: 150, qualified: true },
  ],
  "CMP-PX4-IMP": [
    { vendorCode: "V-ATL-01", vendorName: "Atlas Alloys India", unitPrice: 3200, leadTimeDays: 6, reliability: 0.94, capacityUnits: 300, qualified: true },
    { vendorCode: "V-MER-01", vendorName: "Meridian Metals & Alloys", unitPrice: 3850, leadTimeDays: 4, reliability: 0.88, capacityUnits: 200, qualified: true },
  ],
  "CMP-PX4-SFT": [
    { vendorCode: "V-ATL-01", vendorName: "Atlas Alloys India", unitPrice: 640, leadTimeDays: 5, reliability: 0.94, capacityUnits: 500, qualified: true },
  ],
  "CMP-PX4-SEAL": [
    { vendorCode: "V-DEC-01", vendorName: "Deccan Seals & Gaskets", unitPrice: 1180, leadTimeDays: 6, reliability: 0.9, capacityUnits: 600, qualified: true },
  ],
  "RAW-BLT-M8": [
    { vendorCode: "V-BHR-01", vendorName: "Bharat Fasteners & Hardware", unitPrice: 18, leadTimeDays: 4, reliability: 0.96, capacityUnits: 20_000, qualified: true },
  ],
};

/**
 * The default terms for a component the scenario has not been written for.
 *
 * A single qualified vendor at a middling lead time, deliberately. It keeps an unseeded item
 * from crashing the planner, and it produces NO sourcing choice — so an item that wandered
 * into the demo without terms is visible as a component with nothing to decide, rather than
 * silently inventing a second supplier that does not exist.
 */
export function defaultTermsFor(itemCode: string): SeededSupplierTerms[] {
  return [
    {
      vendorCode: "V-GEN",
      vendorName: "General Supplies Co",
      unitPrice: 500,
      leadTimeDays: 14,
      reliability: 0.85,
      capacityUnits: 10_000,
      qualified: true,
    },
  ];
}

/** Shop-floor and policy constants the schema has no home for yet. */
/**
 * The demo universe's own clock.
 *
 * The seeded world is dated FY 2026-27 with a canonical "today" of 20 July 2026, and the
 * Northstar order was placed on that day. Planning against the wall clock instead would
 * mean every rehearsal produces a shorter runway than the last, until one morning the demo
 * silently starts reporting that nothing is feasible — which is technically correct and
 * completely useless.
 *
 * So a mission plans from the day its commitment was made. In a live system that is the
 * order date too; here it also happens to keep the story stable.
 */
export const SEEDED_FACTORY = {
  /** Working days on the floor for a full batch, at full capacity. */
  productionDays: 6,
  /** Final inspection and release. */
  inspectionDays: 2,
  /** Free capacity at the constraining work centre. Below 1 stretches production. */
  capacityHeadroom: 0.85,
  /** Rupees of expedite premium a mission may commit without a human. */
  expediteAutonomyLimit: 20_000,
  /** The margin this business will not sell below. */
  marginFloorPct: 18,
} as const;

/**
 * HOW MUCH THIS MISSION MAY DO ON ITS OWN.
 *
 * Three tiers, because three is what a person can hold and choose between. The number that
 * actually changes is the rupee value of a commercial commitment the mission may make
 * without a signature — everything else about its behaviour is identical, which is the
 * point: autonomy is a POLICY setting, not a different agent.
 *
 * Why this is on screen rather than in a config file, and why it earns its place:
 *
 *   1. It is the clearest possible statement that a policy kernel exists. "Suggest only"
 *      versus "act within limits" is a sentence anybody understands, and moving the control
 *      visibly changes whether the machine stops for you.
 *   2. It is the demo's safety net. Measured, not assumed: the Northstar order breaches the
 *      envelope and stops for a human, and the BlueOrbit order comes in at zero premium and
 *      24.9% margin, so it proceeds alone. Both are correct. But a presenter who opens the
 *      wrong order loses the human-approval moment, which is the whole message — and turning
 *      the dial to "Suggest only" guarantees the moment on ANY order.
 *
 * A0/A1 (read and analyse) are not offered here because a mission that may not act is not a
 * mission; A5 is not offered because engineering, quality and treasury authority is never
 * delegated, at any setting.
 */
export const AUTONOMY_TIERS = [
  {
    tier: "A2",
    name: "Suggest only",
    detail: "Plans and explains, then waits for a person before committing anything.",
    expediteLimit: 0,
  },
  {
    tier: "A3",
    name: "Act within limits",
    detail: "Takes routine reversible actions alone; asks before material commercial commitments.",
    expediteLimit: 20_000,
  },
  {
    tier: "A4",
    name: "Act and notify",
    detail: "Commits up to ₹5 lakh of premium alone, and tells you afterwards.",
    expediteLimit: 500_000,
  },
] as const;

export type AutonomyTier = (typeof AUTONOMY_TIERS)[number]["tier"];

const LIMIT_BY_TIER = new Map<string, number>(AUTONOMY_TIERS.map((t) => [t.tier, t.expediteLimit]));

/**
 * The rupee envelope for a tier.
 *
 * Falls back to the most RESTRICTIVE limit rather than the default one when a tier is not
 * recognised. An unknown tier means somebody has changed the vocabulary and not this map;
 * erring toward asking a human is recoverable, and erring toward spending is not.
 */
export function expediteLimitFor(tier: string): number {
  return LIMIT_BY_TIER.get(tier) ?? 0;
}

/**
 * The disruption. Fired by the presenter, not by a timer.
 *
 * A timer would make the demo a video: it would happen whether or not the mission had got
 * anywhere, and it would happen identically if the mission had chosen a supplier the delay
 * does not touch. This is keyed to a vendor, so it only bites a plan that actually depends
 * on that vendor — and if the mission chose the other one, the correct behaviour is for the
 * event to be recorded with `no_impact` and change nothing.
 */
export const SEEDED_DISRUPTION = {
  vendorCode: "V-SUN-01",
  vendorName: "Sundaram Precision Castings",
  /** Working days added to the promise the supplier originally made. */
  delayDays: 16,
  message:
    "Furnace relining at our Coimbatore foundry has pushed the 316L pour schedule. " +
    "We can hold your quantity but not your date.",
} as const;
