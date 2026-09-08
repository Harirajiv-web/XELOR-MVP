/**
 * ASSET FAILURE-HISTORY NARRATIVE — the deterministic fact block, the baseline rendering,
 * and the numeric cross-check (MAINTENANCE §13.1, §13.6; TC-16-10).
 *
 * IMPORTANT, AND DELIBERATE: there is **no registered AI feature for Maintenance**.
 * DECISIONS-V2 §4.2 fixes the MVP AI portfolio at a CLOSED registry of eight features, and
 * Maintenance is not one of them. The blueprint proposes four (§13.1–§13.4); the binding
 * document wins on conflict, so what ships here is the half the blueprint calls the
 * *deterministic baseline* — a complete narrative that needs no model at all — plus the
 * guard a model would have to pass. Registering `maintenance.asset_summary` is an ADR
 * against §4.2, not a code change, and the router already refuses the unregistered key at
 * runtime with `AI_FEATURE_NOT_REGISTERED`. That refusal is a demo beat, not a defect.
 *
 * Two guards here go beyond the payslip explainer's, because maintenance text has its own
 * failure modes:
 *
 *   - **No prediction.** The MVP makes no predictive-maintenance claim (§13.5). Any
 *     sentence that forecasts a failure is refused outright, however plausible it reads.
 *   - **No names.** Technician and operator names never leave the platform (NFR-13). The
 *     fact block carries role tokens — "Technician A" — and the UI re-substitutes names
 *     locally for the users permitted to see them.
 */

export interface FailureTally {
  code: string;
  label: string;
  count: number;
}

export interface AssetFactBlock {
  assetCode: string;
  assetName: string;
  periodLabel: string; // "the last 180 days"
  windowFrom: string; // YYYY-MM-DD
  windowTo: string;
  unplannedStops: number;
  unplannedHours: number;
  longestStopHours: number;
  longestStopOn: string | null; // YYYY-MM-DD
  mttrHours: number | null;
  mtbfHours: number | null;
  availabilityPct: number | null;
  /** Failure modes, most frequent first. */
  topModes: readonly FailureTally[];
  /** The component that failed most often, if any one dominates. */
  topComponent: { code: string; name: string; count: number } | null;
  sparesTotal: number;
  topSpareValue: number;
  topSpareLabel: string | null;
  costTotal: number;
  pmDue: number;
  pmCompletedInGrace: number;
  /** Counts, for the "generated from N records" provenance line. */
  sourceCounts: { mwos: number; downtimeRows: number; spareLines: number };
  /** The exact row ids behind every figure — every number hyperlinks to its source. */
  sourceIds: { mwoIds: string[]; downtimeIds: string[] };
}

const inr = (n: number): string =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Math.round(n * 100) / 100);

const hrs = (n: number): string => String(Math.round(n * 10) / 10);

/**
 * The baseline narrative. Complete and correct on its own — this is what the Asset History
 * panel renders, and what any future model would have to beat rather than replace.
 *
 * Note the shape of every sentence: it reports what happened. It never says what to do
 * about it. "Four of six stops were coolant-related" is a fact; "you should service the
 * coolant system monthly" is a maintenance decision, and this module does not make those.
 */
export function renderAssetSummary(f: AssetFactBlock): string {
  const parts: string[] = [];

  if (f.unplannedStops === 0) {
    parts.push(`${f.assetName} (${f.assetCode}) had no unplanned stops in ${f.periodLabel}.`);
  } else {
    parts.push(
      `${f.assetName} (${f.assetCode}) had ${f.unplannedStops} unplanned stops in ${f.periodLabel}, ` +
        `losing ${hrs(f.unplannedHours)} hours of production time.`,
    );
  }

  const dominant = f.topModes[0];
  if (dominant && dominant.count > 1) {
    parts.push(
      `The most frequent failure mode was ${dominant.label} (${dominant.code}), recorded ${dominant.count} times.`,
    );
  }
  if (f.topComponent && f.topComponent.count > 1) {
    parts.push(
      `${f.topComponent.count} of them were on the same component, ${f.topComponent.name} (${f.topComponent.code}).`,
    );
  }

  if (f.mttrHours != null) {
    const longest =
      f.longestStopOn != null ? ` the longest stop was ${hrs(f.longestStopHours)} hours on ${f.longestStopOn}.` : "";
    parts.push(`Average restore time was ${hrs(f.mttrHours)} hours;${longest}`);
  }
  if (f.mtbfHours != null && f.availabilityPct != null) {
    parts.push(`Mean time between failures was ${hrs(f.mtbfHours)} hours and availability ${f.availabilityPct}%.`);
  }

  if (f.sparesTotal > 0) {
    const top =
      f.topSpareLabel != null ? `, of which Rs ${inr(f.topSpareValue)} went to ${f.topSpareLabel}` : "";
    parts.push(`Spares on this asset cost Rs ${inr(f.sparesTotal)} over the period${top}.`);
  }
  if (f.costTotal > 0) {
    parts.push(`Total maintenance cost on this asset was Rs ${inr(f.costTotal)}.`);
  }

  if (f.pmDue > 0) {
    parts.push(
      f.pmCompletedInGrace === f.pmDue
        ? `Preventive work is current: all ${f.pmDue} scheduled services were completed inside their grace windows.`
        : `Of ${f.pmDue} preventive services due, ${f.pmCompletedInGrace} were completed inside their grace windows.`,
    );
  }

  return parts.join(" ");
}

/** The provenance line the UI prints under any narrative (§7.7). */
export function provenanceLine(f: AssetFactBlock): string {
  const c = f.sourceCounts;
  return `generated from ${c.mwos} maintenance work orders, ${c.downtimeRows} downtime rows and ${c.spareLines} spare lines`;
}

/** Every figure the narrative may mention, in each form a model might write it. */
export function allowedAssetNumbers(f: AssetFactBlock): Set<string> {
  const values: number[] = [
    f.unplannedStops,
    f.unplannedHours,
    f.longestStopHours,
    f.sparesTotal,
    f.topSpareValue,
    f.costTotal,
    f.pmDue,
    f.pmCompletedInGrace,
    f.sourceCounts.mwos,
    f.sourceCounts.downtimeRows,
    f.sourceCounts.spareLines,
    ...f.topModes.map((m) => m.count),
  ];
  if (f.mttrHours != null) values.push(f.mttrHours);
  if (f.mtbfHours != null) values.push(f.mtbfHours);
  if (f.availabilityPct != null) values.push(f.availabilityPct);
  if (f.topComponent) values.push(f.topComponent.count);

  const forms = new Set<string>();
  for (const v of values) {
    const r = Math.round(v * 100) / 100;
    forms.add(String(r));
    forms.add(r.toFixed(1));
    forms.add(r.toFixed(2));
    forms.add(String(Math.round(r)));
    forms.add(String(Math.round(r * 10) / 10));
    forms.add(inr(r));
    forms.add(inr(r).replace(/,/g, ""));
  }
  // Dates in the window are quotable: they are facts on the record.
  for (const d of [f.windowFrom, f.windowTo, f.longestStopOn]) {
    if (!d) continue;
    forms.add(d);
    for (const seg of d.split("-")) {
      forms.add(seg);
      forms.add(seg.replace(/^0+(?=\d)/, ""));
    }
  }

  // Digits that are part of a NAME or CODE in the fact block — "VMC 850 #1",
  // "AST-PNQ-VMC-01", "20 TR chiller". Quoting the asset one is talking about is not an
  // invented figure, and a guard that forbade it would reject its own baseline.
  const labels = [
    f.assetCode,
    f.assetName,
    f.periodLabel,
    f.topSpareLabel ?? "",
    f.topComponent?.code ?? "",
    f.topComponent?.name ?? "",
    ...f.topModes.flatMap((m) => [m.code, m.label]),
  ];
  for (const label of labels) {
    for (const run of label.matchAll(/\d[\d.]*/g)) {
      forms.add(run[0]);
      forms.add(run[0].replace(/^0+(?=\d)/, ""));
    }
  }
  return forms;
}

export interface NarrativeGroundingResult {
  ok: boolean;
  reason?: string;
}

/** The MVP makes no predictive claim. A sentence that forecasts is refused (§13.5). */
const BANNED_PREDICTION =
  /\b(will fail|likely to fail|expect(?:ed)? to fail|predict\w*|forecast\w* (?:a )?failure|remaining useful life|imminent|about to break|risk of failure)\b/i;
/** Reporting is not recommending. Maintenance decisions belong to the maintenance manager. */
const BANNED_ADVICE =
  /\b(you should|we recommend|i recommend|recommend(?:ed|ing)? (?:that|replacing|servicing|increasing)|suggest(?:ed)? (?:that|replacing|servicing)|must be replaced|needs? to be replaced|advise)\b/i;
/** Blame is not a finding. */
const BANNED_BLAME =
  /\b(operator error was|negligen\w*|careless\w*|at fault|blame|incompeten\w*|failed to follow)\b/i;
/** Internal vocabulary that must never reach a shop-floor screen. */
const BANNED_JARGON = /\b(fact block|json|payload|prompt|token|schema|tenant_id|sql)\b/i;

/**
 * Accept generated text only if every number in it is already in the fact block, it makes
 * no prediction, gives no advice, apportions no blame, and contains no personal name.
 *
 * `forbiddenNames` is the PII probe (TC-16-10): the caller passes the real technician and
 * operator names that were *deliberately withheld* from the fact block, and any appearance
 * of one is a hard failure — proof that names never make the round trip.
 */
export function checkNarrativeGrounding(
  text: string,
  facts: AssetFactBlock,
  forbiddenNames: readonly string[] = [],
): NarrativeGroundingResult {
  const t = text.trim();
  if (t.length === 0) return { ok: false, reason: "empty" };
  if (t.length > 1200) return { ok: false, reason: "too_long" };

  if (BANNED_PREDICTION.test(t)) return { ok: false, reason: "made_a_prediction" };
  if (BANNED_ADVICE.test(t)) return { ok: false, reason: "gave_advice" };
  if (BANNED_BLAME.test(t)) return { ok: false, reason: "apportioned_blame" };
  if (BANNED_JARGON.test(t)) return { ok: false, reason: "internal_jargon" };

  const lower = t.toLowerCase();
  for (const name of forbiddenNames) {
    for (const part of name.split(/\s+/)) {
      if (part.length < 4) continue;
      if (lower.includes(part.toLowerCase())) return { ok: false, reason: `leaked_person_name:${part}` };
    }
  }

  const allowed = allowedAssetNumbers(facts);
  for (const m of t.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const raw = m[0];
    const bare = raw.replace(/,/g, "");
    if (allowed.has(raw) || allowed.has(bare)) continue;
    const asNum = Number(bare);
    if (
      Number.isFinite(asNum) &&
      (allowed.has(String(asNum)) || allowed.has(asNum.toFixed(1)) || allowed.has(asNum.toFixed(2)))
    ) {
      continue;
    }
    return { ok: false, reason: `ungrounded_number:${raw}` };
  }

  return { ok: true };
}

/**
 * PII minimisation before egress (NFR-13, §13.6). People become stable role tokens in
 * order of first appearance, so a narrative can still say "two technicians" without any
 * payload ever carrying a name.
 */
export function minimisePeople(
  people: readonly { ref: string; role: "technician" | "operator" | "supervisor" }[],
): Map<string, string> {
  const counters: Record<string, number> = { technician: 0, operator: 0, supervisor: 0 };
  const labels: Record<string, string> = {
    technician: "Technician",
    operator: "Operator",
    supervisor: "Supervisor",
  };
  const map = new Map<string, string>();
  for (const p of people) {
    if (map.has(p.ref)) continue;
    const n = counters[p.role]!;
    counters[p.role] = n + 1;
    // Technician A, Technician B, … then Technician 27 past the alphabet.
    const suffix = n < 26 ? String.fromCharCode(65 + n) : String(n + 1);
    map.set(p.ref, `${labels[p.role]} ${suffix}`);
  }
  return map;
}
