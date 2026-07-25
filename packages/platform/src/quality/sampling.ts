/**
 * The pure QUALITY brain (INSPECTION §4.B, §9.2). Three deterministic decisions that must
 * be identical in the live service, in the eval harness and in a courtroom:
 *
 *   1. HOW MANY to inspect  — resolveSampling(): lot size + plan → sample size, Ac, Re.
 *   2. IS ONE READING GOOD  — evaluateReading(): value vs the SNAPSHOTTED spec limits.
 *   3. IS THE LOT GOOD      — decideLotVerdict(): defectives vs Ac/Re.
 *
 * All pure and DB-free. Sampling tables are CONFIGURATION (a tenant loads a customer-
 * mandated plan without a release), so the ISO 2859-1-style band table is data, not code.
 *
 * Note there is deliberately NO model here. The closed 8-feature AI registry (§4.2) has no
 * quality feature, so Inspection ships zero AI in the MVP: an unregistered feature_key is a
 * hard reject at the router. Quality's intelligence is arithmetic, and that is the point —
 * an OEM auditor can re-derive every number by hand.
 */

export type SamplingStandard =
  | "iso_2859_1_style"
  | "fixed_n"
  | "percentage"
  | "hundred_percent"
  | "c_equals_zero";

/** One lot-size band of an ISO 2859-1-style table: lot range → sample size, Ac, Re. */
export interface SamplingBand {
  lotFrom: number;
  lotTo: number;
  codeLetter?: string;
  n: number;
  ac: number;
  re: number;
}

export interface SamplingPlan {
  code: string;
  standard: SamplingStandard;
  aql?: number | null;
  inspectionLevel?: string | null;
  fixedN?: number | null;
  percentage?: number | null;
  planTable?: SamplingBand[];
}

export interface SamplingResult {
  sampleSize: number;
  acceptNumber: number;
  rejectNumber: number;
  codeLetter?: string;
  /** The human-readable derivation, STORED on the inspection so the number is defensible. */
  rationale: string;
}

const ceilInt = (n: number): number => Math.max(0, Math.ceil(n - 1e-9));

/**
 * Resolve how many pieces to inspect and the accept/reject numbers for a lot.
 * Sample size never exceeds the lot: inspecting 32 pieces of a lot of 10 is nonsense.
 */
export function resolveSampling(plan: SamplingPlan, lotQty: number): SamplingResult {
  const lot = Math.max(0, Math.floor(lotQty));

  switch (plan.standard) {
    case "hundred_percent":
      return {
        sampleSize: lot,
        acceptNumber: 0,
        rejectNumber: 1,
        rationale: `100% inspection: all ${lot} piece(s) checked, any defective rejects the lot.`,
      };

    case "c_equals_zero": {
      // Zero-acceptance: any defective in the sample rejects. Sample from the table if
      // present, else fall back to the whole lot.
      const band = findBand(plan.planTable, lot);
      const n = Math.min(lot, band?.n ?? lot);
      return {
        sampleSize: n,
        acceptNumber: 0,
        rejectNumber: 1,
        codeLetter: band?.codeLetter,
        rationale:
          `c=0 plan '${plan.code}': lot ${lot} → sample ${n}, accept on 0 defectives, ` +
          `reject on 1. No defective is acceptable.`,
      };
    }

    case "fixed_n": {
      const n = Math.min(lot, Math.max(0, plan.fixedN ?? 0));
      return {
        sampleSize: n,
        acceptNumber: 0,
        rejectNumber: 1,
        rationale: `Fixed sample plan '${plan.code}': ${n} piece(s) from a lot of ${lot}.`,
      };
    }

    case "percentage": {
      const pct = Math.max(0, plan.percentage ?? 0);
      const n = Math.min(lot, ceilInt((lot * pct) / 100));
      return {
        sampleSize: n,
        acceptNumber: 0,
        rejectNumber: 1,
        rationale: `Percentage plan '${plan.code}': ${pct}% of lot ${lot} → ${n} piece(s), rounded up.`,
      };
    }

    case "iso_2859_1_style": {
      const band = findBand(plan.planTable, lot);
      if (!band) {
        throw new Error(
          `sampling plan '${plan.code}' has no band covering lot size ${lot} — ` +
            `the plan table must cover every lot size it will be asked about`,
        );
      }
      const n = Math.min(lot, band.n);
      const level = plan.inspectionLevel ? `, level ${plan.inspectionLevel}` : "";
      const aql = plan.aql != null ? `, AQL ${plan.aql}` : "";
      return {
        sampleSize: n,
        acceptNumber: band.ac,
        rejectNumber: band.re,
        codeLetter: band.codeLetter,
        rationale:
          `ISO 2859-1 style plan '${plan.code}'${aql}${level}: lot ${lot} falls in band ` +
          `${band.lotFrom}-${band.lotTo}${band.codeLetter ? ` (code ${band.codeLetter})` : ""} ` +
          `→ sample ${n}, accept ≤${band.ac} defective(s), reject ≥${band.re}.`,
      };
    }
  }
}

function findBand(table: SamplingBand[] | undefined, lot: number): SamplingBand | undefined {
  return (table ?? []).find((b) => lot >= b.lotFrom && lot <= b.lotTo);
}

/* --------------------------------------------------------------------------- */

export interface SpecLimits {
  /** Upper spec limit; null means unbounded above. */
  usl?: number | null;
  /** Lower spec limit; null means unbounded below. */
  lsl?: number | null;
}

export interface ReadingEvaluation {
  withinSpec: boolean;
  /** Signed distance OUTSIDE the nearer limit; 0 when in spec. Positive = above USL. */
  deviation: number;
}

/**
 * Judge one measurement against the limits that applied AT INSPECTION TIME. The caller
 * snapshots those limits onto the reading row, so a later spec revision can never silently
 * flip the verdict of a historical inspection (INSPECTION §9.3).
 */
export function evaluateReading(value: number, limits: SpecLimits): ReadingEvaluation {
  const { usl, lsl } = limits;
  if (!Number.isFinite(value)) return { withinSpec: false, deviation: 0 };
  if (usl != null && value > usl) return { withinSpec: false, deviation: round6(value - usl) };
  if (lsl != null && value < lsl) return { withinSpec: false, deviation: round6(value - lsl) };
  return { withinSpec: true, deviation: 0 };
}

/** An attribute (go / no-go) check needs no limits — the inspector's boolean IS the verdict. */
export function evaluateAttribute(conforming: boolean): ReadingEvaluation {
  return { withinSpec: conforming, deviation: 0 };
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/* --------------------------------------------------------------------------- */

export type LotVerdict = "accepted" | "rejected";

export interface LotDecision {
  verdict: LotVerdict;
  defectiveSamples: number;
  sampleSize: number;
  /** Why, in words — stored on the inspection alongside the sampling rationale. */
  rationale: string;
}

/**
 * Decide the lot from the sample. A sample piece is defective if ANY characteristic
 * measured on it is out of spec (one bad bore fails the piece, not just the bore).
 *
 * A CRITICAL characteristic out of spec rejects the lot outright regardless of Ac — an
 * AQL is an acceptable-quality *level*, never a licence to ship a critical defect.
 */
export function decideLotVerdict(input: {
  /** One entry per sample piece per characteristic. */
  readings: Array<{ sampleNo: number; withinSpec: boolean; defectClass?: string | null }>;
  sampleSize: number;
  acceptNumber: number;
  rejectNumber: number;
}): LotDecision {
  const { readings, sampleSize, acceptNumber, rejectNumber } = input;

  const criticalFail = readings.some((r) => !r.withinSpec && r.defectClass === "critical");
  const defectiveSampleNos = new Set(readings.filter((r) => !r.withinSpec).map((r) => r.sampleNo));
  const defectiveSamples = defectiveSampleNos.size;

  if (criticalFail) {
    return {
      verdict: "rejected",
      defectiveSamples,
      sampleSize,
      rationale:
        `Rejected: a CRITICAL characteristic is out of specification. A critical defect ` +
        `rejects the lot regardless of the accept number (${acceptNumber}).`,
    };
  }
  if (defectiveSamples >= rejectNumber) {
    return {
      verdict: "rejected",
      defectiveSamples,
      sampleSize,
      rationale:
        `Rejected: ${defectiveSamples} defective piece(s) in a sample of ${sampleSize}, ` +
        `which meets the reject number (${rejectNumber}).`,
    };
  }
  return {
    verdict: "accepted",
    defectiveSamples,
    sampleSize,
    rationale:
      `Accepted: ${defectiveSamples} defective piece(s) in a sample of ${sampleSize}, ` +
      `within the accept number (${acceptNumber}).`,
  };
}
