/**
 * TAX DEDUCTED AT SOURCE (EXPENDITURE §4.E, V-IND-02, V-IND-03).
 *
 * TDS is withheld from a supplier's payment and handed to the government on their behalf.
 * Under-deducting makes the company liable for the tax it failed to withhold, plus
 * interest, plus — under s.40(a)(ia) — the disallowance of 30% of the expense itself.
 * Over-deducting takes money out of a small supplier's working capital that they will
 * spend months recovering. Neither error is cheap and neither is visible for a year.
 *
 * Three things make it harder than a percentage:
 *
 *  1. **Two thresholds, not one.** A section fires on a single payment above one limit OR
 *     on the running annual total above another. A vendor billing ₹9,000 a month never
 *     trips the single-payment test and trips the annual one in the eleventh month.
 *
 *  2. **The rate depends on who the supplier IS.** 194C is 1% for an individual or HUF and
 *     2% for a company — so the same invoice from two vendors withholds different money.
 *
 *  3. **The crossing is genuinely ambiguous**, and this module refuses to pretend
 *     otherwise. When the running total crosses the annual threshold mid-year, one reading
 *     of the Act says deduct on this payment only; another says the threshold was always
 *     going to be crossed, so catch up on everything paid so far. **Both figures are
 *     computed and a finance review is raised.** Silently choosing either would be a
 *     software author making a tax position on somebody else's behalf.
 *
 * Every rate and threshold is an effective-dated row from `tds_config`, never a constant
 * here (CLAUDE.md: statutory numbers are config). This file is the arithmetic only.
 */

export type TdsSection = "194C" | "194J" | "194I" | "194Q" | "194H";
export type DeducteeType = "individual_huf" | "company_firm_other";

export interface TdsConfigRow {
  section: TdsSection;
  deducteeType: DeducteeType | "any";
  ratePct: number;
  singlePaymentThreshold: number;
  annualThreshold: number;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string | null;
  /** Where the number comes from. Printed on the TDS register beside the deduction. */
  sourceNote: string;
  /** The Income-tax Act 2025 renumbering, carried so a 2027 register can be reconciled. */
  itAct2025Section?: string | null;
}

/** The running total this vendor has been paid under this section this financial year. */
export interface TdsAccumulator {
  vendorRef: string;
  section: TdsSection;
  fiscalYear: string;
  cumulativeBase: number;
  thresholdCrossedAt?: string | null;
}

export interface TdsResolution {
  applicable: boolean;
  section: TdsSection | null;
  ratePct: number;
  /** The amount the rate is applied to — the taxable value, NOT the GST-inclusive total.
   *  Withholding on the tax as well is one of the commonest and costliest errors. */
  base: number;
  amount: number;
  configRef: string;
  reason: string;
  /** Set on the exact document where the annual threshold is crossed. */
  crossing?: TdsCrossing;
}

export interface TdsCrossing {
  crossedOn: string;
  cumulativeBefore: number;
  cumulativeAfter: number;
  annualThreshold: number;
  /** Deduct only on this payment. */
  prospectiveAmount: number;
  /** Deduct on this payment AND catch up on everything already paid this year. */
  catchUpAmount: number;
  /** Deliberately NOT decided here. */
  requiresFinanceReview: true;
  note: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const fmt = (n: number): string => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);

/** The row in force on a date, for this section and this kind of deductee. */
export function resolveTdsConfig(
  rows: readonly TdsConfigRow[],
  section: TdsSection,
  deducteeType: DeducteeType,
  onDate: string,
): TdsConfigRow | null {
  const candidates = rows.filter(
    (r) =>
      r.section === section &&
      (r.deducteeType === deducteeType || r.deducteeType === "any") &&
      r.effectiveFrom <= onDate &&
      (r.effectiveTo == null || r.effectiveTo >= onDate),
  );
  // A row naming the deductee type beats a catch-all; a later effective date beats an
  // earlier one. Both tie-breaks matter when an amendment is seeded alongside the old row.
  return (
    [...candidates].sort(
      (a, b) =>
        (a.deducteeType === "any" ? 1 : 0) - (b.deducteeType === "any" ? 1 : 0) ||
        b.effectiveFrom.localeCompare(a.effectiveFrom),
    )[0] ?? null
  );
}

/**
 * Compute the deduction for one document.
 *
 * `base` is the taxable value before GST. The Act's own circular is explicit that TDS is
 * deducted on the amount excluding GST where the tax is shown separately, and shipping a
 * system that withholds on the gross would over-deduct on every single invoice.
 */
export function computeVendorTds(input: {
  section: TdsSection | null;
  deducteeType: DeducteeType;
  /** Taxable value, excluding GST. */
  base: number;
  paymentDate: string;
  config: readonly TdsConfigRow[];
  accumulator?: TdsAccumulator | null;
  /** A vendor who has furnished no PAN is deducted at the higher of the rate or 20%
   *  (s.206AA). Passing this makes the higher rate explicit rather than a surprise. */
  vendorHasPan?: boolean;
}): TdsResolution {
  const base = round2(Math.max(0, input.base));
  if (!input.section) {
    return {
      applicable: false,
      section: null,
      ratePct: 0,
      base,
      amount: 0,
      configRef: "—",
      reason: "This expense head carries no TDS section.",
    };
  }

  const cfg = resolveTdsConfig(input.config, input.section, input.deducteeType, input.paymentDate);
  if (!cfg) {
    return {
      applicable: false,
      section: input.section,
      ratePct: 0,
      base,
      amount: 0,
      configRef: "—",
      reason: `No ${input.section} configuration is effective on ${input.paymentDate}; configure the rate before posting.`,
    };
  }

  const configRef = `${cfg.section}/${cfg.deducteeType}@${cfg.effectiveFrom}`;
  const before = round2(input.accumulator?.cumulativeBase ?? 0);
  const after = round2(before + base);

  const singleTrips = base > cfg.singlePaymentThreshold;
  const annualAlreadyTripped = before > cfg.annualThreshold || Boolean(input.accumulator?.thresholdCrossedAt);
  const annualTripsNow = !annualAlreadyTripped && after > cfg.annualThreshold;

  // s.206AA: no PAN, no concessional rate.
  const effectiveRate = input.vendorHasPan === false ? Math.max(cfg.ratePct, 20) : cfg.ratePct;
  const rateNote =
    input.vendorHasPan === false ? ` Rate raised to 20% under s.206AA — the vendor has furnished no PAN.` : "";

  if (!singleTrips && !annualAlreadyTripped && !annualTripsNow) {
    return {
      applicable: false,
      section: cfg.section,
      ratePct: effectiveRate,
      base,
      amount: 0,
      configRef,
      reason:
        `No deduction: ₹${fmt(base)} is within the single-payment limit of ₹${fmt(cfg.singlePaymentThreshold)} ` +
        `and the year-to-date total of ₹${fmt(after)} is within the annual limit of ₹${fmt(cfg.annualThreshold)}.`,
    };
  }

  const amount = round2((base * effectiveRate) / 100);

  if (annualTripsNow && !singleTrips) {
    const catchUp = round2((after * effectiveRate) / 100);
    return {
      applicable: true,
      section: cfg.section,
      ratePct: effectiveRate,
      base,
      amount,
      configRef,
      reason:
        `Annual limit of ₹${fmt(cfg.annualThreshold)} crossed on this bill (year to date ₹${fmt(before)} → ₹${fmt(after)}).` +
        rateNote,
      crossing: {
        crossedOn: input.paymentDate,
        cumulativeBefore: before,
        cumulativeAfter: after,
        annualThreshold: cfg.annualThreshold,
        prospectiveAmount: amount,
        catchUpAmount: catchUp,
        requiresFinanceReview: true,
        note:
          `Two defensible readings: deduct ₹${fmt(amount)} on this payment alone, or deduct ₹${fmt(catchUp)} ` +
          `by catching up on the ₹${fmt(before)} already paid this year. The system computes both and does not choose — ` +
          `this is a tax position, and it belongs to Finance.`,
      },
    };
  }

  return {
    applicable: true,
    section: cfg.section,
    ratePct: effectiveRate,
    base,
    amount,
    configRef,
    reason: singleTrips
      ? `₹${fmt(base)} exceeds the single-payment limit of ₹${fmt(cfg.singlePaymentThreshold)}.${rateNote}`
      : `The annual limit of ₹${fmt(cfg.annualThreshold)} was already crossed this year.${rateNote}`,
  };
}

/** Roll the accumulator forward. Returns a NEW row — the ledger discipline again: the
 *  running total is derived from documents, and this is the projection of them. */
export function accumulate(
  prior: TdsAccumulator | null,
  input: { vendorRef: string; section: TdsSection; fiscalYear: string; base: number; onDate: string; crossed: boolean },
): TdsAccumulator {
  return {
    vendorRef: input.vendorRef,
    section: input.section,
    fiscalYear: input.fiscalYear,
    cumulativeBase: round2((prior?.cumulativeBase ?? 0) + Math.max(0, input.base)),
    thresholdCrossedAt: prior?.thresholdCrossedAt ?? (input.crossed ? input.onDate : null),
  };
}
