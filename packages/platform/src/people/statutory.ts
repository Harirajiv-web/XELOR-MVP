/**
 * The STATUTORY calculators (HRM §9.1, HR-45…HR-48).
 *
 * The rule that shapes this entire file (§2.B objective 9, NFR-13): **statutory rates are
 * data, never code.** Not one rate, slab, ceiling or threshold below is a literal. Every
 * calculator takes its numbers as an effective-dated CONFIG object resolved as-of the
 * payroll period, so a rate change is an INSERT with a new `effective_from` plus a new
 * golden vector — never a code edit, and never a redeploy.
 *
 * That also means a payslip from June 2026 recomputes against June 2026's rates forever,
 * which is the difference between an audit you can answer and one you cannot.
 *
 * Each result carries the `configRef` of the row it used, so `statutory_contribution` can
 * store the provenance of every rupee (HR-45: "wage base and config-row reference").
 */

import { round2 } from "../tax/gst.js";

/** Statutory amounts round to the rupee, but each statute rounds its OWN way. */
const roundNearestRupee = (n: number): number => Math.round(n);
const roundUpRupee = (n: number): number => Math.ceil(n - 1e-9);

export interface StatutoryLine {
  statute: "epf" | "esi" | "pt" | "tds";
  employeeAmount: number;
  employerAmount: number;
  /** The figure the percentage was applied to — printed on the payslip trace. */
  wageBase: number;
  /** Which effective-dated config row produced this. Stored per payslip. */
  configRef: string;
  note?: string;
}

/* -------------------------------------------------------------------------- */
/* EPF (HR-45)                                                                 */
/* -------------------------------------------------------------------------- */

/** stat_epf_config. The ₹15,000 ceiling was re-notified 29 May 2026. */
export interface EpfConfig {
  configRef: string;
  effectiveFrom: string;
  wageCeiling: number; // 15000
  employeePct: number; // 12
  epsPct: number; // 8.33
  adminPct: number; // 0.5
  edliPct: number; // 0.5
}

/** Per employee, because the law permits the choice (HR-01). */
export type EpfCeilingPolicy = "capped_at_15000" | "actual";

export interface EpfResult extends StatutoryLine {
  statute: "epf";
  /** The employer 12% splits into a pension slice and a provident-fund slice. */
  eps: number;
  employerEpf: number;
  admin: number;
  edli: number;
  ceilingApplied: boolean;
}

/**
 * EPF on **deemed wages** — the whole point of the V2 rewrite. A Basic+DA engine would put
 * Sanjay Patil's June PF base at ₹9,750; the Codes put it at ₹10,500.
 *
 * The employer's 12% is not a single number: EPS takes 8.33% of wages capped at the ceiling
 * (the pension scheme's own cap, which applies even under an `actual` policy), and the EPF
 * share is the remainder. Admin and EDLI ride on the capped base too.
 */
export function computeEpf(input: {
  deemedWages: number;
  policy: EpfCeilingPolicy;
  config: EpfConfig;
}): EpfResult {
  const { config } = input;
  const cappedBase = Math.min(input.deemedWages, config.wageCeiling);
  const base = input.policy === "actual" ? input.deemedWages : cappedBase;

  const employee = roundNearestRupee((config.employeePct / 100) * base);
  // EPS is always on the ceiling-capped wage — the pension scheme caps regardless of policy.
  const eps = roundNearestRupee((config.epsPct / 100) * cappedBase);
  const employerTotal = roundNearestRupee((config.employeePct / 100) * base);
  const employerEpf = employerTotal - eps;
  const admin = roundNearestRupee((config.adminPct / 100) * cappedBase);
  const edli = roundNearestRupee((config.edliPct / 100) * cappedBase);

  return {
    statute: "epf",
    employeeAmount: employee,
    employerAmount: employerTotal,
    wageBase: round2(base),
    configRef: config.configRef,
    eps,
    employerEpf,
    admin,
    edli,
    ceilingApplied: input.policy === "capped_at_15000" && input.deemedWages > config.wageCeiling,
    note:
      input.policy === "capped_at_15000" && input.deemedWages > config.wageCeiling
        ? `deemed wages ${round2(input.deemedWages)} capped at the ${config.wageCeiling} ceiling`
        : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* ESI (HR-46)                                                                 */
/* -------------------------------------------------------------------------- */

/** stat_esi_config. */
export interface EsiConfig {
  configRef: string;
  effectiveFrom: string;
  grossThreshold: number; // 21000
  employeePct: number; // 0.75
  employerPct: number; // 3.25
  /** ESI rounds UP to the next rupee, unlike EPF. The law says so; we do not tidy it. */
  roundUp: boolean;
}

/**
 * The contribution period lock-in that trips up every spreadsheet: eligibility is judged
 * ONCE, on gross at the start of the contribution period (Apr–Sep or Oct–Mar), and then
 * HOLDS for the whole period in both directions. Crossing ₹21,000 in June does not end
 * cover in June; it ends at the next period boundary.
 */
export function esiContributionPeriod(month: string): "apr_sep" | "oct_mar" {
  const m = Number(month.slice(5, 7));
  return m >= 4 && m <= 9 ? "apr_sep" : "oct_mar";
}

export function esiEligibleAtPeriodStart(grossAtPeriodStart: number, config: EsiConfig): boolean {
  return grossAtPeriodStart <= config.grossThreshold;
}

export interface EsiResult extends StatutoryLine {
  statute: "esi";
  eligible: boolean;
  contributionPeriod: "apr_sep" | "oct_mar";
}

/**
 * ESI's base is **gross remuneration including OT** — deliberately NOT deemed wages. Two
 * statutes, two wage bases, in the same payslip: that is exactly why each contribution row
 * stores the base it used rather than leaving a reader to infer it.
 */
export function computeEsi(input: {
  grossIncludingOt: number;
  grossAtPeriodStart: number;
  periodMonth: string;
  config: EsiConfig;
}): EsiResult {
  const { config } = input;
  const contributionPeriod = esiContributionPeriod(input.periodMonth);
  const eligible = esiEligibleAtPeriodStart(input.grossAtPeriodStart, config);
  const r = config.roundUp ? roundUpRupee : roundNearestRupee;

  if (!eligible) {
    return {
      statute: "esi",
      employeeAmount: 0,
      employerAmount: 0,
      wageBase: 0,
      configRef: config.configRef,
      eligible: false,
      contributionPeriod,
      note: `gross ${round2(input.grossAtPeriodStart)} exceeded the ${config.grossThreshold} threshold at ${contributionPeriod} period start`,
    };
  }

  return {
    statute: "esi",
    employeeAmount: r((config.employeePct / 100) * input.grossIncludingOt),
    employerAmount: r((config.employerPct / 100) * input.grossIncludingOt),
    wageBase: round2(input.grossIncludingOt),
    configRef: config.configRef,
    eligible: true,
    contributionPeriod,
    note:
      input.grossIncludingOt >= config.grossThreshold
        ? `cover continues for the ${contributionPeriod} period despite gross ${round2(input.grossIncludingOt)} — eligibility is locked at period start`
        : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Professional Tax (HR-47) — state law, so the shape itself is configurable    */
/* -------------------------------------------------------------------------- */

/**
 * stat_pt_slab. PT is a STATE tax: Maharashtra charges monthly (with a February
 * anomaly), Tamil Nadu charges half-yearly per municipality. Rather than branch on a
 * hard-coded state list, the *period basis* is itself a config field — so adding Karnataka
 * or West Bengal is a row, not a release.
 */
export interface PtSlab {
  slabFrom: number;
  slabTo: number | null;
  amount: number;
  /** Maharashtra charges ₹300 in February so the year totals exactly ₹2,500. */
  amountFebruary?: number;
}

export interface PtConfig {
  configRef: string;
  state: string; // MH | TN | ...
  effectiveFrom: string;
  periodBasis: "monthly" | "half_yearly";
  slabs: PtSlab[];
  /** MH: ₹2,500. The statutory annual maximum, checked rather than assumed. */
  annualCap: number;
  /** MH exemption for women below a threshold; the threshold is config, pending notification. */
  womenExemptUpto?: number;
  municipality?: string;
}

export interface PtResult extends StatutoryLine {
  statute: "pt";
  periodBasis: "monthly" | "half_yearly";
  state: string;
}

function slabFor(slabs: PtSlab[], amount: number): PtSlab | undefined {
  return slabs.find((s) => amount >= s.slabFrom && (s.slabTo == null || amount <= s.slabTo));
}

/**
 * Monthly PT (Maharashtra shape).
 *
 * `monthIndexInFy` (1 = April) exists so February gets its own amount without this function
 * needing to know what a financial year is. `ytdDeducted` enforces the annual cap by
 * clipping the last instalment rather than trusting the slabs to sum correctly.
 */
export function computePtMonthly(input: {
  monthlyGross: number;
  calendarMonth: number; // 1-12
  gender?: "male" | "female" | "other";
  ytdDeducted: number;
  config: PtConfig;
}): PtResult {
  const { config } = input;
  const base: PtResult = {
    statute: "pt",
    employeeAmount: 0,
    employerAmount: 0,
    wageBase: round2(input.monthlyGross),
    configRef: config.configRef,
    periodBasis: "monthly",
    state: config.state,
  };

  if (
    config.womenExemptUpto != null &&
    input.gender === "female" &&
    input.monthlyGross <= config.womenExemptUpto
  ) {
    return { ...base, note: `exempt: women up to ${config.womenExemptUpto} in ${config.state}` };
  }

  const slab = slabFor(config.slabs, input.monthlyGross);
  if (!slab) return { ...base, note: "no slab matched — nil" };

  const isFebruary = input.calendarMonth === 2;
  let amount = isFebruary && slab.amountFebruary != null ? slab.amountFebruary : slab.amount;

  // The annual cap is a hard statutory ceiling, so it clips rather than warns.
  const headroom = Math.max(0, config.annualCap - input.ytdDeducted);
  if (amount > headroom) amount = headroom;

  return {
    ...base,
    employeeAmount: amount,
    note: isFebruary && slab.amountFebruary != null ? "February rate applies" : undefined,
  };
}

/**
 * Half-yearly PT (Tamil Nadu shape), deducted monthly so the employee's pay is smooth.
 *
 * The instalment is `1/6` of the half-year liability for months 1–5, and the SIXTH month
 * is the remainder — a true-up, not another sixth. That is what makes ₹1,250 come out as
 * 208×5 + 210 instead of 208×6 = ₹1,248 and a ₹2 shortfall nobody notices until the
 * inspector does.
 */
export function computePtHalfYearly(input: {
  halfYearGross: number;
  monthInHalf: number; // 1..6
  config: PtConfig;
}): PtResult {
  const { config } = input;
  const slab = slabFor(config.slabs, input.halfYearGross);
  const liability = slab?.amount ?? 0;

  const instalment = Math.floor(liability / 6);
  const amount = input.monthInHalf >= 6 ? liability - instalment * 5 : instalment;

  return {
    statute: "pt",
    employeeAmount: amount,
    employerAmount: 0,
    wageBase: round2(input.halfYearGross),
    configRef: config.configRef,
    periodBasis: "half_yearly",
    state: config.state,
    note:
      input.monthInHalf >= 6
        ? `sixth-month true-up: ${liability} half-yearly less ${instalment * 5} already deducted`
        : `1/6 instalment of ${liability} half-yearly${config.municipality ? ` (${config.municipality})` : ""}`,
  };
}

/* -------------------------------------------------------------------------- */
/* TDS (HR-48) — new regime, FY 2026-27                                        */
/* -------------------------------------------------------------------------- */

export interface TdsSlab {
  slabFrom: number;
  slabTo: number | null;
  ratePct: number;
}

/** stat_tds_config + stat_tds_slab. */
export interface TdsConfig {
  configRef: string;
  fy: string; // 2026-27
  regime: "new";
  standardDeduction: number; // 75000
  slabs: TdsSlab[];
  rebate87aAmount: number; // 60000
  rebate87aIncomeLimit: number; // 1200000
  cessPct: number; // 4
  /** The Income-tax Act 2025 renumbering took effect 1 Apr 2026; registers label both. */
  actReference: string;
}

export interface TdsResult extends StatutoryLine {
  statute: "tds";
  annualGross: number;
  annualTaxableIncome: number;
  taxBeforeRebate: number;
  rebateApplied: number;
  cess: number;
  annualTax: number;
  remainingMonths: number;
}

/** Walk the slabs. Each slab taxes only the income that falls INSIDE it. */
function slabTax(taxableIncome: number, slabs: TdsSlab[]): number {
  let tax = 0;
  for (const s of slabs) {
    const upper = s.slabTo ?? Number.POSITIVE_INFINITY;
    if (taxableIncome <= s.slabFrom) break;
    const inSlab = Math.min(taxableIncome, upper) - s.slabFrom;
    if (inSlab > 0) tax += (inSlab * s.ratePct) / 100;
  }
  return round2(tax);
}

/**
 * Monthly TDS under the new regime.
 *
 * §87A is the cliff that makes or breaks a payslip: at ₹12,00,000 of total income the
 * ₹60,000 rebate wipes the tax out entirely; a rupee over and the whole computed tax is
 * payable. Kavita Rao's demo payslip sits under it (tax ₹12,250 → nil) and Priya
 * Deshmukh's sits over it (₹93,750 + cess → ₹8,125/month). Both are golden vectors.
 *
 * The rebate is tested on TOTAL INCOME — i.e. after the standard deduction, which is how
 * the section reads — and the limit is a config value, not a constant.
 */
export function computeTds(input: {
  /** Projected annual taxable earnings BEFORE the standard deduction. */
  annualGross: number;
  ytdTaxDeducted: number;
  remainingMonths: number;
  config: TdsConfig;
}): TdsResult {
  const { config } = input;
  const taxable = Math.max(0, round2(input.annualGross - config.standardDeduction));
  const taxBeforeRebate = slabTax(taxable, config.slabs);

  const rebateApplied =
    taxable <= config.rebate87aIncomeLimit ? Math.min(config.rebate87aAmount, taxBeforeRebate) : 0;
  const afterRebate = Math.max(0, round2(taxBeforeRebate - rebateApplied));
  const cess = round2((afterRebate * config.cessPct) / 100);
  const annualTax = round2(afterRebate + cess);

  const months = Math.max(1, input.remainingMonths);
  const monthly = roundNearestRupee(Math.max(0, annualTax - input.ytdTaxDeducted) / months);

  return {
    statute: "tds",
    employeeAmount: monthly,
    employerAmount: 0,
    wageBase: taxable,
    configRef: config.configRef,
    annualGross: round2(input.annualGross),
    annualTaxableIncome: taxable,
    taxBeforeRebate,
    rebateApplied,
    cess,
    annualTax,
    remainingMonths: months,
    // The note branches on the INCOME TEST, not on whether a rebate happened to be
    // applied: someone below the first slab owes nothing, and telling them their income
    // "exceeds the limit" would be both wrong and alarming.
    note:
      taxable > config.rebate87aIncomeLimit
        ? `no s.87A rebate: total income ${taxable} exceeds ${config.rebate87aIncomeLimit} — ${config.actReference}`
        : rebateApplied > 0
          ? `s.87A rebate ${rebateApplied} applied (total income ${taxable} within the ${config.rebate87aIncomeLimit} limit) — ${config.actReference}`
          : `no tax is due before any s.87A rebate (total income ${taxable}) — ${config.actReference}`,
  };
}
