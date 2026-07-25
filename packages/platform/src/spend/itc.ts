/**
 * INPUT TAX CREDIT ELIGIBILITY (EXPENDITURE §4.E, V-CLM-06, V-IND-01).
 *
 * Every rupee of GST on a purchase is either recoverable from the government or it is
 * cost. Getting that wrong in either direction is expensive and neither error announces
 * itself: over-claiming produces a demand with interest and penalty at the next audit,
 * under-claiming silently donates working capital.
 *
 * Two independent gates decide it, and BOTH must pass:
 *
 *   1. **The expense head.** CGST Act **s.17(5)** blocks credit on named categories
 *      whatever the paperwork says — food and beverages, motor vehicles under thirteen
 *      seats and rent-a-cab, club and fitness memberships, and goods or services for
 *      personal consumption. The staff lunch is blocked because it is a lunch.
 *
 *   2. **The invoice.** Credit requires a tax invoice carrying the RECIPIENT'S GSTIN.
 *      A B2C cash bill showing GST is a bill on which no credit exists, because the
 *      supplier never reported it against the company. This is the rule employees find
 *      hardest to believe, so the refusal says exactly which gate failed.
 *
 * **A model never sets eligibility.** Receipt extraction may suggest the head; eligibility
 * is then resolved here from the head and the invoice. That is the whole design: the AI
 * reads paper, the code decides money.
 */

export type ItcEligibility =
  | "eligible"
  | "blocked_17_5_food"
  | "blocked_17_5_motor_vehicle"
  | "blocked_17_5_personal"
  | "blocked_17_5_club"
  | "blocked_other"
  | "rcm"
  | "exempt";

/** The statutory reason, in the words an auditor uses. Shown on the ITC register. */
export const ITC_BLOCK_REASON: Readonly<Record<ItcEligibility, string>> = {
  eligible: "Credit available on a tax invoice bearing the company GSTIN.",
  blocked_17_5_food: "Blocked — s.17(5)(b)(i): food and beverages.",
  blocked_17_5_motor_vehicle: "Blocked — s.17(5)(a)/(b): motor vehicles up to thirteen seats and rent-a-cab.",
  blocked_17_5_personal: "Blocked — s.17(5)(g): goods or services for personal consumption.",
  blocked_17_5_club: "Blocked — s.17(5)(b)(ii): club, health and fitness membership.",
  blocked_other: "Blocked — credit not available on this category.",
  rcm: "Reverse charge — the company pays the tax and takes the credit on its own challan.",
  exempt: "No GST charged on this supply, so there is no credit to take.",
};

export interface ItcInput {
  /** The head's default, from the expense-head master. */
  headDefault: ItcEligibility;
  /** The GSTIN printed on the invoice as the RECIPIENT. Absent on a B2C bill. */
  invoiceRecipientGstin?: string | null;
  /** The company's own registration for the place this was bought against. */
  companyGstin: string;
  gstAmount: number;
  /** An explicit downgrade by a human. Upgrades need `itc.override` — see `resolveItc`. */
  manualOverride?: { to: ItcEligibility; reason: string; hasOverridePermission?: boolean };
}

export interface ItcResult {
  eligibility: ItcEligibility;
  /** The rupees actually creditable. Zero whenever eligibility is anything but `eligible`. */
  itcAmount: number;
  reason: string;
  /** True when the head allowed credit and the invoice did not. */
  blockedByInvoice: boolean;
  overrideApplied: boolean;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** GSTIN shape: 2-digit state, 5-letter + 4-digit + 1-letter PAN, entity code, 'Z', check. */
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function isGstinShaped(value: string | null | undefined): boolean {
  return typeof value === "string" && GSTIN_RE.test(value);
}

const BLOCKED = new Set<ItcEligibility>([
  "blocked_17_5_food",
  "blocked_17_5_motor_vehicle",
  "blocked_17_5_personal",
  "blocked_17_5_club",
  "blocked_other",
  "exempt",
]);

/** The permitted directions of a manual change: only ever DOWNWARD without permission. */
const RANK: Readonly<Record<ItcEligibility, number>> = {
  eligible: 3,
  rcm: 2,
  blocked_other: 1,
  blocked_17_5_food: 1,
  blocked_17_5_motor_vehicle: 1,
  blocked_17_5_personal: 1,
  blocked_17_5_club: 1,
  exempt: 0,
};

/**
 * Resolve eligibility and the creditable amount.
 *
 * The order is deliberate. A statutory block is checked FIRST and cannot be argued out of
 * by producing a better invoice — a hotel dinner on a company-GSTIN invoice is still a
 * dinner. Only a head that permits credit then has to satisfy the invoice rule.
 */
export function resolveItc(input: ItcInput): ItcResult {
  const gst = round2(Math.max(0, input.gstAmount));

  // 1. The statutory block. Nothing overrides this without the override permission.
  if (BLOCKED.has(input.headDefault)) {
    const applied = tryOverride(input, input.headDefault);
    if (applied) return applied;
    return {
      eligibility: input.headDefault,
      itcAmount: 0,
      reason: ITC_BLOCK_REASON[input.headDefault],
      blockedByInvoice: false,
      overrideApplied: false,
    };
  }

  // 2. Reverse charge: the credit exists but arrives through the company's own challan,
  //    not through this invoice, so it is tracked separately rather than claimed here.
  if (input.headDefault === "rcm") {
    return {
      eligibility: "rcm",
      itcAmount: gst,
      reason: ITC_BLOCK_REASON.rcm,
      blockedByInvoice: false,
      overrideApplied: false,
    };
  }

  // 3. The invoice rule. This is the one that surprises people.
  const recipient = input.invoiceRecipientGstin ?? null;
  if (!isGstinShaped(recipient)) {
    const applied = tryOverride(input, "blocked_other");
    if (applied) return applied;
    return {
      eligibility: "blocked_other",
      itcAmount: 0,
      reason:
        "No credit: the invoice does not carry the company GSTIN, so this is a B2C bill and the tax on it was never reported against the company.",
      blockedByInvoice: true,
      overrideApplied: false,
    };
  }
  if (recipient !== input.companyGstin) {
    const applied = tryOverride(input, "blocked_other");
    if (applied) return applied;
    return {
      eligibility: "blocked_other",
      itcAmount: 0,
      reason: `No credit: the invoice is addressed to ${recipient}, which is not this company's registration (${input.companyGstin}).`,
      blockedByInvoice: true,
      overrideApplied: false,
    };
  }

  const applied = tryOverride(input, "eligible");
  if (applied) return applied;
  return {
    eligibility: "eligible",
    itcAmount: gst,
    reason: ITC_BLOCK_REASON.eligible,
    blockedByInvoice: false,
    overrideApplied: false,
  };
}

/**
 * A manual change, applied only where it is allowed.
 *
 * **Downgrades are always permitted** — a person deciding not to claim a credit costs the
 * company money and nobody else, and there are real reasons to do it. **Upgrades require
 * `itc.override`** and a reason, and land on the ITC register as an override row, because
 * claiming a credit the rules did not give you is the direction with a penalty attached.
 */
function tryOverride(input: ItcInput, computed: ItcEligibility): ItcResult | null {
  const o = input.manualOverride;
  if (!o || o.to === computed) return null;
  const isUpgrade = RANK[o.to] > RANK[computed];
  if (isUpgrade && !o.hasOverridePermission) return null;
  const gst = round2(Math.max(0, input.gstAmount));
  return {
    eligibility: o.to,
    itcAmount: o.to === "eligible" || o.to === "rcm" ? gst : 0,
    reason: `${isUpgrade ? "Upgraded" : "Reduced"} from ${computed} by a person: ${o.reason}`,
    blockedByInvoice: false,
    overrideApplied: true,
  };
}

/* --------------------------- CGST/SGST vs IGST ----------------------------- */

export interface GstSplit {
  cgst: number;
  sgst: number;
  igst: number;
  interState: boolean;
  reason: string;
}

/**
 * Split GST by place of supply.
 *
 * The two-digit state code that opens a GSTIN is the whole decision: same state means the
 * tax divides into central and state halves, different states means one integrated tax.
 * Getting it wrong does not change the money the company pays — it changes which
 * government it pays, which is why it is the single most common notice in Indian GST.
 */
export function splitGst(input: { supplierGstin: string; companyGstin: string; gstAmount: number }): GstSplit {
  const gst = round2(Math.max(0, input.gstAmount));
  const supplierState = input.supplierGstin.slice(0, 2);
  const companyState = input.companyGstin.slice(0, 2);
  const interState = supplierState !== companyState;
  if (interState) {
    return {
      cgst: 0,
      sgst: 0,
      igst: gst,
      interState: true,
      reason: `Supplier in state ${supplierState}, recipient in ${companyState} — inter-state, so IGST.`,
    };
  }
  // The halves must add back to the whole: rounding both down loses a paisa on odd
  // amounts, and a register that is one paisa out is a register somebody has to explain.
  const half = Math.floor((gst / 2) * 100) / 100;
  return {
    cgst: half,
    sgst: round2(gst - half),
    igst: 0,
    interState: false,
    reason: `Both parties in state ${companyState} — intra-state, so CGST + SGST.`,
  };
}
