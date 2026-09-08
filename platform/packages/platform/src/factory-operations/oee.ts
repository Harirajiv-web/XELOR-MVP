/**
 * Deterministic OEE arithmetic for the Factory Operations POC.
 *
 * OEE is only meaningful when all three denominators are evidenced. This function never
 * invents a shift, caps an implausible result, or turns missing data into zero. Instead it
 * returns the components it can prove and a stable warning for every missing or suspicious
 * input. The caller may display those warnings beside the number that depends on them.
 */

export interface OeeInput {
  plannedProductionSeconds?: number | null;
  runSeconds?: number | null;
  idealCycleSeconds?: number | null;
  totalCount?: number | null;
  goodCount?: number | null;
  rejectCount?: number | null;
}

export interface OeeInputsUsed {
  plannedProductionSeconds: number | null;
  runSeconds: number | null;
  idealCycleSeconds: number | null;
  totalCount: number | null;
  goodCount: number | null;
  rejectCount: number | null;
}

export interface OeeResult {
  status: "complete" | "incomplete" | "invalid";
  availabilityPct: number | null;
  performancePct: number | null;
  qualityPct: number | null;
  oeePct: number | null;
  inputs: OeeInputsUsed;
  warnings: string[];
}

interface CheckedNumber {
  value: number | null;
  invalid: boolean;
}

const roundPct = (ratio: number): number =>
  Math.round((ratio * 100 + Number.EPSILON) * 100) / 100;

function nonNegative(
  value: number | null | undefined,
  label: string,
  warnings: string[],
): CheckedNumber {
  if (value === null || value === undefined) return { value: null, invalid: false };
  if (!Number.isFinite(value) || value < 0) {
    warnings.push(`${label} must be a finite, non-negative number.`);
    return { value: null, invalid: true };
  }
  return { value, invalid: false };
}

export function computeOee(input: OeeInput): OeeResult {
  const warnings: string[] = [];
  const planned = nonNegative(input.plannedProductionSeconds, "Planned production time", warnings);
  const run = nonNegative(input.runSeconds, "Run time", warnings);
  const ideal = nonNegative(input.idealCycleSeconds, "Ideal cycle time", warnings);
  const suppliedTotal = nonNegative(input.totalCount, "Total count", warnings);
  const good = nonNegative(input.goodCount, "Good count", warnings);
  const reject = nonNegative(input.rejectCount, "Reject count", warnings);

  let invalid = [planned, run, ideal, suppliedTotal, good, reject].some((entry) => entry.invalid);
  let total = suppliedTotal.value;
  if (total === null && good.value !== null && reject.value !== null) {
    total = good.value + reject.value;
  }
  if (
    suppliedTotal.value !== null &&
    good.value !== null &&
    reject.value !== null &&
    suppliedTotal.value !== good.value + reject.value
  ) {
    invalid = true;
    warnings.push("Total count does not equal good count plus reject count.");
  }
  if (total !== null && good.value !== null && good.value > total) {
    invalid = true;
    warnings.push("Good count cannot be greater than total count.");
  }

  let availabilityPct: number | null = null;
  if (planned.value === null) {
    warnings.push("Planned production time is missing; availability cannot be calculated.");
  } else if (planned.value === 0) {
    warnings.push("Planned production time is zero; availability is not defined.");
  } else if (run.value === null) {
    warnings.push("Run time is missing; availability cannot be calculated.");
  } else {
    availabilityPct = roundPct(run.value / planned.value);
    if (run.value > planned.value) {
      warnings.push("Run time exceeds planned production time; availability is above 100%. Check the shift evidence.");
    }
  }

  let performancePct: number | null = null;
  if (run.value === null || run.value === 0) {
    warnings.push("Positive run time is required to calculate performance.");
  } else if (ideal.value === null || ideal.value === 0) {
    warnings.push("Positive ideal cycle time is required to calculate performance.");
  } else if (total === null) {
    warnings.push("Total count is missing; performance cannot be calculated.");
  } else {
    performancePct = roundPct((ideal.value * total) / run.value);
    if (performancePct > 100) {
      warnings.push("Calculated performance is above 100%; check ideal cycle time and counter evidence.");
    }
  }

  let qualityPct: number | null = null;
  if (total === null) {
    warnings.push("Total count is missing; quality cannot be calculated.");
  } else if (total === 0) {
    warnings.push("Total count is zero; quality is not defined.");
  } else if (good.value === null) {
    warnings.push("Good count is missing; quality cannot be calculated.");
  } else if (good.value <= total) {
    qualityPct = roundPct(good.value / total);
  }

  const allComponents =
    availabilityPct !== null && performancePct !== null && qualityPct !== null;
  let oeePct: number | null = null;
  if (availabilityPct !== null && performancePct !== null && qualityPct !== null) {
    oeePct =
      Math.round(
        ((availabilityPct / 100) * (performancePct / 100) * (qualityPct / 100) * 100 +
          Number.EPSILON) *
          100,
      ) / 100;
  }

  return {
    status: invalid ? "invalid" : allComponents ? "complete" : "incomplete",
    availabilityPct,
    performancePct,
    qualityPct,
    oeePct: invalid ? null : oeePct,
    inputs: {
      plannedProductionSeconds: planned.value,
      runSeconds: run.value,
      idealCycleSeconds: ideal.value,
      totalCount: total,
      goodCount: good.value,
      rejectCount: reject.value,
    },
    warnings,
  };
}
