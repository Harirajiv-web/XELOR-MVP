/**
 * The WAGE BASE brain (HRM §11.3, HR-44) — the single most consequential piece of
 * arithmetic in the module, and the reason this blueprint carries "the largest V1→V2
 * compliance delta of any module".
 *
 * Since **21 Nov 2025** all four Labour Codes are in force. The Code on Wages s.2(y)
 * definition says: when the EXCLUDED components of remuneration (HRA, OT, conveyance,
 * bonus, special allowance…) exceed 50% of total remuneration, the excess is **added back**
 * to "wages" for PF and gratuity.
 *
 * Every SMB spreadsheet — and most legacy payroll tools — still computes PF on Basic+DA.
 * That is systematic underpayment from day one: interest and damages under EPF §14B, and
 * gratuity shortfalls at exit. This file is the correction, and it is deliberately pure so
 * the number is identical in the payslip, in the test, and in a regulator's recomputation.
 *
 * Nothing here is a rate. Every threshold arrives as effective-dated CONFIG (§9.1) because
 * "no statutory number exists in code, ever" — see stat_wage_definition / stat_ot_config /
 * stat_gratuity_config.
 */

// The canonical `round2` for the platform lives in tax/gst.ts. One public name, one
// implementation — a second copy is how two modules quietly start rounding differently.
import { round2 } from "../tax/gst.js";

/**
 * s.2(y) classification. `included` = Basic + DA + retaining allowance. `excluded` =
 * everything else. This lives on the salary COMPONENT, so the classification is a
 * decision made once by the person who designs the structure, not re-guessed per run.
 */
export type WageClass = "included" | "excluded";

export interface RemunerationComponent {
  code: string;
  name: string;
  /** Rupees earned for the period, AFTER proration. */
  amount: number;
  wageClass: WageClass;
}

/** stat_wage_definition — effective from 2025-11-21, the day the Codes came into force. */
export interface WageDefinitionConfig {
  effectiveFrom: string;
  /** 50 under the Code. A number, from a config row, never a literal in a formula. */
  addbackThresholdPct: number;
}

export interface DeemedWagesResult {
  /** Everything earned this period. */
  total: number;
  /** Basic + DA + retaining allowance. */
  included: number;
  /** total − included. Derived, never summed separately, so the three always reconcile. */
  excluded: number;
  /** addbackThresholdPct% of total. */
  threshold: number;
  /** Only the EXCESS over the threshold is added back — not the whole excluded amount. */
  addback: number;
  /** The PF and gratuity wage base. Equivalently max(included, threshold). */
  deemed: number;
  /** excluded as a percentage of total — what the payslip trace shows the employee. */
  excludedPct: number;
}

/**
 * `deemed = included + max(0, excluded − threshold)`, where `threshold = pct% × total`.
 *
 * Two things about the implementation are deliberate.
 *
 * **It runs in integer paise, not floats.** Every intermediate is scaled to whole paise (and
 * the threshold comparison to hundredths of a paisa) so the arithmetic is exact. Rounding
 * each step in floating point instead makes a 50/50 split at an odd paise total disagree
 * with itself by a paisa — and the boundary case (§15.5 rule 20) is precisely where that
 * matters: excluded == 50% EXACTLY must yield add-back **zero**, not a ±1 artefact.
 * `excluded` is likewise DERIVED as `total − included` rather than summed independently,
 * which is what makes the prorated 15,385/15,384 split land on zero.
 *
 * **The cross-check uses the correct general identity.** At the statutory 50% the result is
 * famously `max(included, 50% × total)` — but that shorthand is a coincidence of the
 * threshold being exactly half. In general it is `max(included, total × (1 − pct/100))`,
 * and that is what is asserted, so a future config row at some other percentage cannot
 * quietly break the invariant.
 */
export function deemedWages(
  components: readonly RemunerationComponent[],
  config: WageDefinitionConfig,
): DeemedWagesResult {
  const paise = (n: number): number => Math.round(n * 100);

  const totalP = components.reduce((a, c) => a + paise(c.amount), 0);
  const includedP = components
    .filter((c) => c.wageClass === "included")
    .reduce((a, c) => a + paise(c.amount), 0);
  const excludedP = totalP - includedP;

  // Work in hundredths of a paisa so a fractional threshold percentage stays exact.
  const CENTI = 100;
  const thresholdC = Math.round(totalP * config.addbackThresholdPct);
  const addbackC = Math.max(0, excludedP * CENTI - thresholdC);
  const deemedC = includedP * CENTI + addbackC;

  // The general identity. A divergence here would be a compliance bug, not a rounding nit,
  // so it fails loudly rather than shipping a wrong PF base to 120 people.
  const viaMax = Math.max(includedP * CENTI, totalP * CENTI - thresholdC);
  if (deemedC !== viaMax) {
    throw new Error(`deemed-wages identity broken: ${deemedC} vs ${viaMax} (centi-paise)`);
  }

  // A half-paisa remainder can only arise from a fractional threshold; round it UP, which
  // resolves in the employee's favour (a higher PF and gratuity base).
  const fromCenti = (c: number): number => round2(Math.ceil(c / CENTI) / 100);

  return {
    total: round2(totalP / 100),
    included: round2(includedP / 100),
    excluded: round2(excludedP / 100),
    threshold: fromCenti(thresholdC),
    addback: fromCenti(addbackC),
    deemed: fromCenti(deemedC),
    excludedPct: totalP === 0 ? 0 : round2((excludedP / totalP) * 100),
  };
}

/* -------------------------------------------------------------------------- */
/* Proration and overtime                                                      */
/* -------------------------------------------------------------------------- */

export interface ProrationBasis {
  /** Days the employee is actually paid for (present + paid leave + holidays + offs). */
  paidDays: number;
  /** The denominator. 26 working days on the demo tenant; calendar days is a config choice. */
  periodDays: number;
}

/**
 * Prorate a fixed monthly component by payable days.
 *
 * Monotonic by construction (more paid days can never earn less), which is the property
 * TC-PROP-* asserts. A full month short-circuits so a 26/26 month is byte-identical to the
 * unprorated figure — no 0.004 drift on the common path.
 */
export function prorate(monthlyAmount: number, basis: ProrationBasis): number {
  if (basis.periodDays <= 0) throw new Error("periodDays must be > 0");
  if (basis.paidDays >= basis.periodDays) return round2(monthlyAmount);
  if (basis.paidDays <= 0) return 0;
  return round2((monthlyAmount * basis.paidDays) / basis.periodDays);
}

/** stat_ot_config — the Factories Act rules, held as data so a state variation is an INSERT. */
export interface OtConfig {
  effectiveFrom: string;
  /** 2.0 — "twice the ordinary rate of wages", Factories Act s.59. */
  multiplier: number;
  /** How the ordinary hourly rate is derived. gross/26/8 is the customary Indian basis. */
  rateBasis: "gross_26_8";
  dailyHoursCap: number; // 9
  weeklyHoursCap: number; // 48
  quarterlyOtCapHours: number; // 75, state-overridable
}

/**
 * OT pay at the statutory multiple. Note the irony the blueprint calls out (§1.6 point 4):
 * OT is an EXCLUDED component, so paying it can itself push exclusions past 50% and trigger
 * the very add-back the employer wasn't computing. `deemedWages` above sees that happen.
 */
export function overtimePay(monthlyGross: number, otHours: number, config: OtConfig): number {
  if (otHours <= 0) return 0;
  const hourly = monthlyGross / 26 / 8;
  return round2(hourly * config.multiplier * otHours);
}

/** Factories-Act guardrails (HR-27): warnings, never blocks — the hours were worked. */
export interface HoursWarning {
  rule: "daily_over_cap" | "weekly_over_cap" | "quarterly_ot_cap";
  message: string;
}

export function checkHoursCaps(
  input: { dailyHours?: number; weeklyHours?: number; quarterlyOtHours?: number },
  config: OtConfig,
): HoursWarning[] {
  const out: HoursWarning[] = [];
  if (input.dailyHours != null && input.dailyHours > config.dailyHoursCap) {
    out.push({
      rule: "daily_over_cap",
      message: `${input.dailyHours}h worked exceeds the ${config.dailyHoursCap}h daily cap`,
    });
  }
  if (input.weeklyHours != null && input.weeklyHours > config.weeklyHoursCap) {
    out.push({
      rule: "weekly_over_cap",
      message: `${input.weeklyHours}h worked exceeds the ${config.weeklyHoursCap}h weekly cap`,
    });
  }
  if (input.quarterlyOtHours != null && input.quarterlyOtHours > config.quarterlyOtCapHours) {
    out.push({
      rule: "quarterly_ot_cap",
      message: `${input.quarterlyOtHours} OT hours exceeds the ${config.quarterlyOtCapHours}h quarterly cap`,
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Gratuity (HR-52) — report-only in MVP, but computed on the CORRECTED base    */
/* -------------------------------------------------------------------------- */

/** stat_gratuity_config. */
export interface GratuityConfig {
  effectiveFrom: string;
  factorNum: number; // 15
  factorDen: number; // 26
  vestingYearsDefault: number; // 5
  /** 1 for fixed-term staff — the Labour-Codes correction most SMBs are not accruing. */
  vestingYearsFixedTerm: number;
  taxExemptCap: number; // 2000000
  /** 'deemed_wages'. Recorded so the report can state which base it used. */
  wageBase: "deemed_wages";
}

export interface GratuityProvision {
  /** Monthly accrual = 15/26 × deemed wages × 1/12. */
  monthlyProvision: number;
  /** 1 year for fixed_term, 5 otherwise. */
  vestingYears: number;
  vestingDate: string;
  wageBaseUsed: number;
  basis: "deemed_wages";
}

export type EmploymentType =
  | "permanent"
  | "probation"
  | "trainee"
  | "fixed_term"
  | "contract"
  | "apprentice";

/**
 * A month's gratuity provision on the DEEMED wage base.
 *
 * The vesting horizon branches on employment type: fixed-term employees vest at **1 year**
 * under the Codes, not 5. Provision accrues from month one either way (that is what makes
 * it a provision), but the horizon is what a CFO needs to see next to the number.
 */
export function gratuityProvision(input: {
  deemedWages: number;
  employmentType: EmploymentType;
  dateOfJoining: string;
  config: GratuityConfig;
}): GratuityProvision {
  const { config } = input;
  const vestingYears =
    input.employmentType === "fixed_term" ? config.vestingYearsFixedTerm : config.vestingYearsDefault;
  const doj = new Date(`${input.dateOfJoining}T00:00:00Z`);
  const vest = new Date(doj);
  vest.setUTCFullYear(vest.getUTCFullYear() + vestingYears);

  return {
    monthlyProvision: round2((config.factorNum / config.factorDen) * input.deemedWages * (1 / 12)),
    vestingYears,
    vestingDate: vest.toISOString().slice(0, 10),
    wageBaseUsed: round2(input.deemedWages),
    basis: "deemed_wages",
  };
}
