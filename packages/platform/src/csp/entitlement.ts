/**
 * ENTITLEMENT — "warranty as a gate, not a gift" (CSP §11.5, FR-5.3).
 *
 * The business problem this solves is stated plainly in the blueprint: claims get honoured
 * on goodwill without anyone checking the serial, the purchase date or the contract terms,
 * and the result is a silent drain Finance cannot accrue for. So coverage is a COMPUTED
 * VERDICT with reasons attached, recorded on the ticket, and it is the only thing allowed
 * to authorise a free-of-charge promise — not a reply, and certainly not a model.
 *
 * The deliberate omission is fraud scoring. Serial-reuse and impossible-date rules are
 * deterministic and live here; warranty-fraud ML stays deferred, because accusing a
 * customer of fraud on a model's say-so is a commercial decision no confidence score
 * justifies.
 */

export type CoverageVerdict = "covered_warranty" | "covered_amc" | "partial" | "not_covered";

export interface WarrantyRecord {
  serialNo: string;
  warrantyType: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  coverageTerms: string;
  status: "active" | "expired" | "void";
}

export interface AmcRecord {
  contractNo: string;
  coverageType: "comprehensive" | "non_comprehensive";
  startDate: string;
  endDate: string;
  /** e.g. { visitsPerYear: 4, responseMins: 240, partsIncluded: true } */
  entitlements: { visitsPerYear?: number; responseMins?: number; partsIncluded?: boolean };
  status: "draft" | "active" | "expiring" | "expired" | "renewed" | "cancelled";
  coveredSerials: readonly string[];
}

export interface EntitlementInput {
  serialNo: string;
  /** The date the failure is claimed to have happened — NOT today. */
  onDate: string;
  warranty: WarrantyRecord | null;
  amc: AmcRecord | null;
  /** Every warranty row that names this serial, for the reuse check. */
  allWarrantiesForSerial?: readonly WarrantyRecord[];
  /** When the serial was dispatched, for the impossible-date check. */
  dispatchedOn?: string | null;
}

export interface EntitlementResult {
  verdict: CoverageVerdict;
  reasons: string[];
  warrantyExpiresOn: string | null;
  amcExpiresOn: string | null;
  /** True when parts are chargeable even though labour or visits are covered. */
  partsChargeable: boolean;
  anomalies: Anomaly[];
  /** The sentence an agent can read to the customer without having to interpret anything. */
  summary: string;
}

export interface Anomaly {
  code: "serial_reused" | "claim_before_dispatch" | "claim_in_future" | "warranty_starts_after_end";
  detail: string;
}

const within = (date: string, from: string, to: string): boolean => date >= from && date <= to;

/**
 * Compute coverage.
 *
 * The order is deliberate: an AMC outranks a standard warranty when both apply, because a
 * comprehensive AMC is what the customer is paying extra for and reporting the cheaper
 * cover would understate what they bought. `partial` is a real answer, not a hedge — a
 * non-comprehensive AMC covers the visit and the labour while the parts are chargeable,
 * and telling the customer "covered" or "not covered" would both be wrong.
 */
export function checkEntitlement(input: EntitlementInput): EntitlementResult {
  const reasons: string[] = [];
  const anomalies = detectAnomalies(input);

  const w = input.warranty;
  const a = input.amc;

  const warrantyActive =
    w != null && w.status === "active" && within(input.onDate, w.startDate, w.endDate);
  const amcActive =
    a != null &&
    (a.status === "active" || a.status === "expiring") &&
    within(input.onDate, a.startDate, a.endDate) &&
    a.coveredSerials.includes(input.serialNo);

  let verdict: CoverageVerdict;
  let partsChargeable = true;

  if (amcActive && a) {
    if (a.coverageType === "comprehensive" || a.entitlements.partsIncluded) {
      verdict = "covered_amc";
      partsChargeable = false;
      reasons.push(`AMC ${a.contractNo} (comprehensive) covers this serial until ${a.endDate}.`);
    } else {
      verdict = "partial";
      partsChargeable = true;
      reasons.push(
        `AMC ${a.contractNo} (non-comprehensive) covers visits and labour until ${a.endDate}; parts are chargeable.`,
      );
    }
    if (warrantyActive && w) reasons.push(`Standard warranty also runs to ${w.endDate}.`);
  } else if (warrantyActive && w) {
    verdict = "covered_warranty";
    partsChargeable = false;
    reasons.push(`Standard ${w.warrantyType} warranty runs ${w.startDate} to ${w.endDate}.`);
  } else {
    verdict = "not_covered";
    partsChargeable = true;
    if (w && !within(input.onDate, w.startDate, w.endDate)) {
      reasons.push(`Warranty expired on ${w.endDate}; the claim is dated ${input.onDate}.`);
    } else if (w && w.status !== "active") {
      reasons.push(`Warranty record is ${w.status}.`);
    } else if (!w) {
      reasons.push("No warranty record exists for this serial.");
    }
    if (a && !a.coveredSerials.includes(input.serialNo)) {
      reasons.push(`AMC ${a.contractNo} does not list this serial among its covered assets.`);
    } else if (a && !within(input.onDate, a.startDate, a.endDate)) {
      reasons.push(`AMC ${a.contractNo} ran ${a.startDate} to ${a.endDate}.`);
    }
  }

  // An anomaly never silently flips the verdict — it is surfaced for a human. Downgrading
  // coverage automatically because a date looked odd is how a good customer gets refused
  // on a data-entry error.
  for (const an of anomalies) reasons.push(`Anomaly: ${an.detail}`);

  return {
    verdict,
    reasons,
    warrantyExpiresOn: w?.endDate ?? null,
    amcExpiresOn: a?.endDate ?? null,
    partsChargeable,
    anomalies,
    summary: summarise(verdict, partsChargeable, w, a),
  };
}

function summarise(
  verdict: CoverageVerdict,
  partsChargeable: boolean,
  w: WarrantyRecord | null,
  a: AmcRecord | null,
): string {
  switch (verdict) {
    case "covered_warranty":
      return `Covered under warranty until ${w?.endDate}.`;
    case "covered_amc":
      return `Covered under AMC ${a?.contractNo} until ${a?.endDate}, parts included.`;
    case "partial":
      return `Partly covered under AMC ${a?.contractNo}: visit and labour included, parts chargeable.`;
    case "not_covered":
      return partsChargeable ? "Not covered — this will be chargeable." : "Not covered.";
  }
}

/**
 * Deterministic anomaly rules (FR-5.3). Each one describes a physical impossibility or a
 * duplicate, never a judgement about the customer.
 */
export function detectAnomalies(input: EntitlementInput): Anomaly[] {
  const out: Anomaly[] = [];
  const today = new Date().toISOString().slice(0, 10);

  if (input.onDate > today) {
    out.push({ code: "claim_in_future", detail: `the claim is dated ${input.onDate}, which is in the future` });
  }
  if (input.dispatchedOn && input.onDate < input.dispatchedOn) {
    out.push({
      code: "claim_before_dispatch",
      detail: `the claim is dated ${input.onDate} but the serial was dispatched on ${input.dispatchedOn}`,
    });
  }
  if (input.warranty && input.warranty.startDate > input.warranty.endDate) {
    out.push({
      code: "warranty_starts_after_end",
      detail: `warranty start ${input.warranty.startDate} is after its end ${input.warranty.endDate}`,
    });
  }
  const all = input.allWarrantiesForSerial ?? [];
  if (all.length > 1) {
    // Two live warranty records for one serial means the same physical part was sold
    // twice, or a record was duplicated. Either way a person should look.
    const overlapping = all.filter((r) => r.status === "active");
    if (overlapping.length > 1) {
      out.push({
        code: "serial_reused",
        detail: `${overlapping.length} active warranty records exist for serial ${input.serialNo}`,
      });
    }
  }
  return out;
}

/** AMC contracts are flagged `expiring` ahead of renewal so SMBD gets a lead rather than a
 *  lapse. T-60 by default (FR-5.2). */
export function amcRenewalStatus(
  contract: { endDate: string; status: AmcRecord["status"] },
  today: string,
  leadDays = 60,
): { status: AmcRecord["status"]; daysToExpiry: number; shouldEmitLead: boolean } {
  const days = Math.round((Date.parse(`${contract.endDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (contract.status === "cancelled" || contract.status === "renewed") {
    return { status: contract.status, daysToExpiry: days, shouldEmitLead: false };
  }
  if (days < 0) return { status: "expired", daysToExpiry: days, shouldEmitLead: false };
  if (days <= leadDays) {
    return { status: "expiring", daysToExpiry: days, shouldEmitLead: contract.status !== "expiring" };
  }
  return { status: "active", daysToExpiry: days, shouldEmitLead: false };
}
