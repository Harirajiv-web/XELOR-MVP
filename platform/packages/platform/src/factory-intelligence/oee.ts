import type {
  FactoryEvidenceMode,
  FactoryIntelligenceWarning,
  OeeAnalysis,
  OeeAnalysisInput,
  OeeDataConfidence,
  OeeFreshness,
  OeeMetricResult,
} from "./contracts.js";

export const OEE_FORMULAS = {
  availability: "runSeconds / plannedProductionSeconds",
  performance: "(idealCycleSeconds * totalCount) / runSeconds",
  quality: "goodCount / totalCount",
  oee: "availability * performance * quality",
} as const;

const DEFAULT_FRESHNESS_THRESHOLD_SECONDS = 300;
const CORE_INPUT_FIELDS = new Set([
  "plannedProductionSeconds",
  "runSeconds",
  "idealCycleSeconds",
  "totalCount",
  "goodCount",
  "rejectCount",
]);

/**
 * Calculate explainable OEE from one production interval.
 *
 * The function has no clock, database or model dependency. Ratios above one are retained as
 * `rawRatio`, flagged, and capped for the safe composite. Missing denominators remain null;
 * they are never converted to zero or infinity just to keep a dashboard tile populated.
 */
export function calculateOee(input: OeeAnalysisInput): OeeAnalysis {
  const warnings: FactoryIntelligenceWarning[] = [];
  const rawInputs = { ...input.inputs };

  validateScope(input, warnings);
  const freshness = assessFreshness(input, warnings);
  validateProvenance(input, warnings);

  const planned = validateMeasure(
    "plannedProductionSeconds",
    rawInputs.plannedProductionSeconds,
    { integer: false },
    warnings,
  );
  const run = validateMeasure("runSeconds", rawInputs.runSeconds, { integer: false }, warnings);
  const ideal = validateMeasure(
    "idealCycleSeconds",
    rawInputs.idealCycleSeconds,
    { integer: false },
    warnings,
  );
  const total = validateMeasure("totalCount", rawInputs.totalCount, { integer: true }, warnings);
  let good = validateMeasure("goodCount", rawInputs.goodCount, { integer: true }, warnings);
  let reject = validateMeasure("rejectCount", rawInputs.rejectCount, { integer: true }, warnings);

  if (good != null && total != null && good > total) {
    warning(
      warnings,
      "GOOD_COUNT_EXCEEDS_TOTAL",
      "error",
      "goodCount",
      `goodCount ${good} cannot exceed totalCount ${total}.`,
    );
    good = null;
  }
  if (reject != null && total != null && reject > total) {
    warning(
      warnings,
      "REJECT_COUNT_EXCEEDS_TOTAL",
      "error",
      "rejectCount",
      `rejectCount ${reject} cannot exceed totalCount ${total}.`,
    );
    reject = null;
  }
  if (good != null && reject != null && total != null && good + reject !== total) {
    warning(
      warnings,
      good + reject > total ? "COUNTS_OVER_RECONCILED" : "COUNTS_NOT_RECONCILED",
      "error",
      "rejectCount",
      `goodCount + rejectCount is ${good + reject}, while totalCount is ${total}. OEE quality still uses goodCount / totalCount, but the source counts need review.`,
    );
  }

  if (planned === 0) {
    warning(
      warnings,
      "ZERO_PLANNED_PRODUCTION_TIME",
      "warning",
      "plannedProductionSeconds",
      "Availability is undefined when plannedProductionSeconds is zero.",
    );
  }
  if (run === 0) {
    warning(
      warnings,
      "ZERO_RUN_TIME",
      "warning",
      "runSeconds",
      "Availability can be zero, but performance is undefined because runSeconds is its denominator.",
    );
  }
  if (ideal === 0) {
    warning(
      warnings,
      "ZERO_IDEAL_CYCLE_TIME",
      "warning",
      "idealCycleSeconds",
      "Performance is unavailable because idealCycleSeconds must be greater than zero.",
    );
  }
  if (total === 0) {
    warning(
      warnings,
      "ZERO_TOTAL_COUNT",
      "warning",
      "totalCount",
      "Quality is undefined when no units were counted in the interval.",
    );
  }

  const availability =
    planned != null && planned > 0 && run != null
      ? calculatedMetric(
          run / planned,
          OEE_FORMULAS.availability,
          "Share of planned production time during which the asset ran.",
          "AVAILABILITY_ABOVE_100_PERCENT",
          "runSeconds exceeds plannedProductionSeconds; the raw ratio is retained and the safe ratio is capped at 100%.",
          warnings,
          "runSeconds",
        )
      : unavailableMetric(
          OEE_FORMULAS.availability,
          "Needs finite runSeconds and plannedProductionSeconds greater than zero.",
        );

  const performance =
    run != null && run > 0 && ideal != null && ideal > 0 && total != null
      ? calculatedMetric(
          (ideal * total) / run,
          OEE_FORMULAS.performance,
          "Actual output rate compared with the configured ideal cycle rate.",
          "PERFORMANCE_ABOVE_100_PERCENT",
          "Ideal-cycle output exceeds recorded run time; verify the cycle standard or counters. The raw ratio is retained and the safe ratio is capped at 100%.",
          warnings,
          "idealCycleSeconds",
        )
      : unavailableMetric(
          OEE_FORMULAS.performance,
          "Needs idealCycleSeconds greater than zero, finite totalCount, and runSeconds greater than zero.",
        );

  const quality =
    total != null && total > 0 && good != null
      ? calculatedMetric(
          good / total,
          OEE_FORMULAS.quality,
          "Share of counted units recorded as good output.",
          "QUALITY_ABOVE_100_PERCENT",
          "goodCount exceeds totalCount; verify the counters.",
          warnings,
          "goodCount",
        )
      : unavailableMetric(
          OEE_FORMULAS.quality,
          "Needs finite goodCount and totalCount greater than zero.",
        );

  const calculatedOee = compositeMetric(availability, performance, quality);
  const coreInputInvalid = warnings.some(
    (item) => item.severity === "error" && item.field != null && CORE_INPUT_FIELDS.has(item.field),
  );
  const oee = coreInputInvalid
    ? unavailableMetric(
        OEE_FORMULAS.oee,
        "Composite OEE is withheld because one or more core source inputs failed validation.",
      )
    : calculatedOee;
  const hasInvalidData = warnings.some((item) => item.severity === "error");
  const status = hasInvalidData
    ? "invalid_data"
    : oee.status === "calculated"
      ? "complete"
      : "insufficient_data";

  const confidence = assessOeeConfidence({
    warnings,
    freshness,
    mode: input.provenance.mode,
    provenanceComplete:
      input.provenance.sourceSystem.trim().length > 0 &&
      input.provenance.snapshotVersion.trim().length > 0 &&
      input.provenance.recordRefs.length > 0,
    oeeAvailable: oee.status === "calculated",
  });

  return {
    status,
    customerCode: input.customerCode,
    assetRef: input.assetRef,
    assetCode: input.assetCode,
    workCenterCode: input.workCenterCode,
    window: { label: input.windowLabel, start: input.windowStart, end: input.windowEnd },
    rawInputs,
    formulas: OEE_FORMULAS,
    availability,
    performance,
    quality,
    oee,
    freshness,
    confidence,
    warnings,
    provenance: {
      ...input.provenance,
      recordRefs: [...input.provenance.recordRefs],
    },
    disclosure: disclosureFor(input.customerCode, input.provenance.mode, input.provenance.sourceSystem),
  };
}

function validateScope(input: OeeAnalysisInput, warnings: FactoryIntelligenceWarning[]): void {
  const requiredText: Array<[string, string]> = [
    ["customerCode", input.customerCode],
    ["assetRef", input.assetRef],
    ["assetCode", input.assetCode],
    ["workCenterCode", input.workCenterCode],
    ["windowLabel", input.windowLabel],
  ];
  for (const [field, value] of requiredText) {
    if (value.trim().length === 0) {
      warning(warnings, `MISSING_${toCode(field)}`, "error", field, `${field} is required.`);
    }
  }

  if (input.windowStart === null && input.windowEnd === null) {
    warning(
      warnings,
      "WINDOW_BOUNDS_UNAVAILABLE",
      "info",
      "windowStart",
      `ONYX supplied the window label "${input.windowLabel}" but no authoritative interval timestamps; none were inferred.`,
    );
  } else if (input.windowStart === null || input.windowEnd === null) {
    warning(
      warnings,
      "INCOMPLETE_WINDOW_BOUNDS",
      "error",
      input.windowStart === null ? "windowStart" : "windowEnd",
      "windowStart and windowEnd must either both be supplied or both be null.",
    );
  } else {
    const start = Date.parse(input.windowStart);
    const end = Date.parse(input.windowEnd);
    if (!Number.isFinite(start)) {
      warning(warnings, "INVALID_WINDOW_START", "error", "windowStart", "windowStart must be a valid ISO instant.");
    }
    if (!Number.isFinite(end)) {
      warning(warnings, "INVALID_WINDOW_END", "error", "windowEnd", "windowEnd must be a valid ISO instant.");
    }
    if (Number.isFinite(start) && Number.isFinite(end) && end <= start) {
      warning(warnings, "INVALID_WINDOW_ORDER", "error", "windowEnd", "windowEnd must be after windowStart.");
    }
  }
}

function assessFreshness(input: OeeAnalysisInput, warnings: FactoryIntelligenceWarning[]): OeeFreshness {
  const threshold =
    input.freshnessThresholdSeconds == null
      ? DEFAULT_FRESHNESS_THRESHOLD_SECONDS
      : Number.isFinite(input.freshnessThresholdSeconds) && input.freshnessThresholdSeconds > 0
        ? input.freshnessThresholdSeconds
        : DEFAULT_FRESHNESS_THRESHOLD_SECONDS;
  if (
    input.freshnessThresholdSeconds != null &&
    (!Number.isFinite(input.freshnessThresholdSeconds) || input.freshnessThresholdSeconds <= 0)
  ) {
    warning(
      warnings,
      "INVALID_FRESHNESS_THRESHOLD",
      "warning",
      "freshnessThresholdSeconds",
      `freshnessThresholdSeconds must be positive; ${DEFAULT_FRESHNESS_THRESHOLD_SECONDS} seconds was used.`,
    );
  }

  const generated = Date.parse(input.generatedAt);
  const observed = Date.parse(input.provenance.observedAt);
  if (!Number.isFinite(generated) || !Number.isFinite(observed)) {
    if (!Number.isFinite(generated)) {
      warning(warnings, "INVALID_GENERATED_AT", "error", "generatedAt", "generatedAt must be a valid ISO instant.");
    }
    if (!Number.isFinite(observed)) {
      warning(
        warnings,
        "INVALID_OBSERVED_AT",
        "error",
        "provenance.observedAt",
        "provenance.observedAt must be a valid ISO instant.",
      );
    }
    return {
      generatedAt: input.generatedAt,
      observedAt: input.provenance.observedAt,
      ageSeconds: null,
      thresholdSeconds: threshold,
      status: "unknown",
    };
  }

  const ageSeconds = round3((generated - observed) / 1000);
  if (ageSeconds < 0) {
    warning(
      warnings,
      "OBSERVATION_IN_FUTURE",
      "warning",
      "provenance.observedAt",
      `The source observation is ${Math.abs(ageSeconds)} second(s) after generatedAt; check clock alignment.`,
    );
    return {
      generatedAt: input.generatedAt,
      observedAt: input.provenance.observedAt,
      ageSeconds,
      thresholdSeconds: threshold,
      status: "future",
    };
  }
  if (ageSeconds > threshold) {
    warning(
      warnings,
      "STALE_EVIDENCE",
      "warning",
      "provenance.observedAt",
      `Evidence is ${ageSeconds} second(s) old, beyond the ${threshold}-second freshness threshold.`,
    );
  }
  return {
    generatedAt: input.generatedAt,
    observedAt: input.provenance.observedAt,
    ageSeconds,
    thresholdSeconds: threshold,
    status: ageSeconds > threshold ? "stale" : "fresh",
  };
}

function validateProvenance(input: OeeAnalysisInput, warnings: FactoryIntelligenceWarning[]): void {
  if (input.provenance.sourceSystem.trim().length === 0) {
    warning(
      warnings,
      "MISSING_SOURCE_SYSTEM",
      "error",
      "provenance.sourceSystem",
      "A source system is required for numeric provenance.",
    );
  }
  if (input.provenance.snapshotVersion.trim().length === 0) {
    warning(
      warnings,
      "MISSING_SNAPSHOT_VERSION",
      "error",
      "provenance.snapshotVersion",
      "A snapshot version is required so the calculation can be replayed.",
    );
  }
  if (input.provenance.recordRefs.length === 0) {
    warning(
      warnings,
      "MISSING_RECORD_REFS",
      "warning",
      "provenance.recordRefs",
      "No source record references were supplied for drill-through evidence.",
    );
  }
  if (input.provenance.mode !== "live") {
    warning(
      warnings,
      `${input.provenance.mode.toUpperCase()}_DATA`,
      "info",
      "provenance.mode",
      `${input.provenance.mode} evidence is illustrative and must not be described as live factory telemetry.`,
    );
  }
}

function validateMeasure(
  field: keyof OeeAnalysisInput["inputs"],
  value: number | null,
  options: { integer: boolean },
  warnings: FactoryIntelligenceWarning[],
): number | null {
  if (value == null) {
    warning(warnings, `MISSING_${toCode(field)}`, "warning", field, `${field} was not supplied.`);
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    warning(warnings, `INVALID_${toCode(field)}`, "error", field, `${field} must be a finite number.`);
    return null;
  }
  if (value < 0) {
    warning(warnings, `NEGATIVE_${toCode(field)}`, "error", field, `${field} cannot be negative.`);
    return null;
  }
  if (options.integer && !Number.isInteger(value)) {
    warning(warnings, `FRACTIONAL_${toCode(field)}`, "error", field, `${field} must be a whole-unit count.`);
    return null;
  }
  return value;
}

function calculatedMetric(
  rawRatio: number,
  formula: string,
  explanation: string,
  capWarningCode: string,
  capWarningMessage: string,
  warnings: FactoryIntelligenceWarning[],
  capWarningField: string,
): OeeMetricResult {
  const wasCapped = rawRatio > 1;
  if (wasCapped) {
    warning(warnings, capWarningCode, "warning", capWarningField, capWarningMessage);
  }
  const ratio = clamp01(rawRatio);
  return {
    status: "calculated",
    ratio: round6(ratio),
    rawRatio: round6(rawRatio),
    percent: round2(ratio * 100),
    wasCapped,
    formula,
    explanation,
  };
}

function unavailableMetric(formula: string, explanation: string): OeeMetricResult {
  return {
    status: "unavailable",
    ratio: null,
    rawRatio: null,
    percent: null,
    wasCapped: false,
    formula,
    explanation,
  };
}

function compositeMetric(
  availability: OeeMetricResult,
  performance: OeeMetricResult,
  quality: OeeMetricResult,
): OeeMetricResult {
  if (availability.ratio == null || performance.ratio == null || quality.ratio == null) {
    return unavailableMetric(
      OEE_FORMULAS.oee,
      "OEE remains unavailable until Availability, Performance and Quality are all calculable.",
    );
  }
  const ratio = availability.ratio * performance.ratio * quality.ratio;
  const rawRatio =
    (availability.rawRatio ?? availability.ratio) *
    (performance.rawRatio ?? performance.ratio) *
    (quality.rawRatio ?? quality.ratio);
  return {
    status: "calculated",
    ratio: round6(ratio),
    rawRatio: round6(rawRatio),
    percent: round2(ratio * 100),
    wasCapped: availability.wasCapped || performance.wasCapped || quality.wasCapped,
    formula: OEE_FORMULAS.oee,
    explanation: "Availability × Performance × Quality, using the safe component ratios shown above.",
  };
}

function assessOeeConfidence(input: {
  warnings: readonly FactoryIntelligenceWarning[];
  freshness: OeeFreshness;
  mode: FactoryEvidenceMode;
  provenanceComplete: boolean;
  oeeAvailable: boolean;
}): OeeDataConfidence {
  const coreWarnings = input.warnings.filter((item) => item.field != null && CORE_INPUT_FIELDS.has(item.field));
  const inputValidity = clampScore(
    100 -
      coreWarnings.reduce(
        (penalty, item) => penalty + (item.severity === "error" ? 25 : item.severity === "warning" ? 12 : 0),
        0,
      ),
  );
  const freshness =
    input.freshness.status === "fresh"
      ? 100
      : input.freshness.status === "stale"
        ? 40
        : 0;
  const provenance = input.provenanceComplete ? 100 : 40;
  const representativeness: Record<FactoryEvidenceMode, number> = {
    live: 100,
    simulator: 50,
    manual: 35,
    mock: 0,
  };
  const score = clampScore(
    inputValidity * 0.4 +
      freshness * 0.2 +
      provenance * 0.1 +
      representativeness[input.mode] * 0.3,
  );
  const band = score >= 90 ? "high" : score >= 60 ? "medium" : "low";
  const strengths: string[] = [];
  const gaps: string[] = [];
  if (inputValidity === 100) strengths.push("All six source inputs passed structural validation.");
  else gaps.push("One or more source inputs are missing, inconsistent or invalid.");
  if (input.freshness.status === "fresh") strengths.push("The observation is inside the stated freshness threshold.");
  else gaps.push(`Evidence freshness is ${input.freshness.status}.`);
  if (input.provenanceComplete) strengths.push("Snapshot and source record references support replay.");
  else gaps.push("Numeric provenance is incomplete.");
  if (input.mode === "live") strengths.push("The adapter labels this evidence as live.");
  else gaps.push(`The adapter labels this evidence as ${input.mode}, so it is not representative of a live connection.`);
  if (!input.oeeAvailable) gaps.push("Composite OEE is unavailable until every component has a valid denominator.");
  return {
    score,
    band,
    basis: "deterministic_data_quality_not_prediction",
    meaning: "Confidence describes source validity, freshness and provenance—not the probability of machine performance or replan success.",
    dimensions: {
      inputValidity,
      freshness,
      provenance,
      representativeness: representativeness[input.mode],
    },
    strengths,
    gaps,
  };
}

function disclosureFor(customerCode: string, mode: FactoryEvidenceMode, sourceSystem: string): string {
  const source = sourceSystem.trim().length > 0 ? sourceSystem : "an unlabelled source";
  if (mode === "live") {
    return `${customerCode} OEE was calculated from facts labelled live by ${source}. This analysis issued no machine command and changed no schedule.`;
  }
  return `${customerCode} OEE is an illustrative ${mode} calculation from ${source}, not live machine telemetry. This analysis issued no machine command and changed no schedule.`;
}

function warning(
  warnings: FactoryIntelligenceWarning[],
  code: string,
  severity: FactoryIntelligenceWarning["severity"],
  field: string | null,
  message: string,
): void {
  warnings.push({ code, severity, field, message });
}

function toCode(field: string): string {
  return field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function round2(value: number): number {
  const result = Math.round((value + Number.EPSILON) * 100) / 100;
  return result === 0 ? 0 : result;
}

function round3(value: number): number {
  const result = Math.round((value + Number.EPSILON) * 1000) / 1000;
  return result === 0 ? 0 : result;
}

function round6(value: number): number {
  const result = Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
  return result === 0 ? 0 : result;
}
