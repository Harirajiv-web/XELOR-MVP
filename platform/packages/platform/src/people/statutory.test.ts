import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deemedWages,
  gratuityProvision,
  overtimePay,
  prorate,
  checkHoursCaps,
  type GratuityConfig,
  type OtConfig,
  type RemunerationComponent,
  type WageDefinitionConfig,
} from "./wages.js";
import {
  computeEpf,
  computeEsi,
  computePtHalfYearly,
  computePtMonthly,
  computeTds,
  esiContributionPeriod,
  type EpfConfig,
  type EsiConfig,
  type PtConfig,
  type TdsConfig,
} from "./statutory.js";

/**
 * TC-GOLD-* — the published golden vectors (HRM §16.A).
 *
 * These are not invented test numbers. Every expected figure below is copied from the
 * hand-computed payslips in HRM-ATTENDANCE §20.4/§20.5 — Sanjay Patil's add-back, Kavita
 * Rao's exact-50% boundary and §87A rebate, Imran Shaikh's ceiling cap with LOP proration,
 * Priya Deshmukh's slab walk, Lakshmi Subramanian's TN half-yearly PT, and Vikram Jadhav's
 * fixed-term 1-year gratuity vesting.
 *
 * The blueprint calls these "a first-class deliverable and demo asset, not an internal test
 * detail". Treating them that way is what turns "our payroll is Labour-Codes-correct" from
 * a claim into something a CA can re-derive line by line.
 */

/* ---------------------- effective-dated config fixtures -------------------- */
/* These mirror the seeded stat_* rows exactly. Not one rate is a literal in src. */

const WAGE_DEF: WageDefinitionConfig = { effectiveFrom: "2025-11-21", addbackThresholdPct: 50 };

const OT: OtConfig = {
  effectiveFrom: "2025-11-21",
  multiplier: 2.0,
  rateBasis: "gross_26_8",
  dailyHoursCap: 9,
  weeklyHoursCap: 48,
  quarterlyOtCapHours: 75,
};

const EPF: EpfConfig = {
  configRef: "stat_epf_config:2026-05-29",
  effectiveFrom: "2026-05-29", // ceiling re-notified
  wageCeiling: 15000,
  employeePct: 12,
  epsPct: 8.33,
  adminPct: 0.5,
  edliPct: 0.5,
};

const ESI: EsiConfig = {
  configRef: "stat_esi_config:2025-11-21",
  effectiveFrom: "2025-11-21",
  grossThreshold: 21000,
  employeePct: 0.75,
  employerPct: 3.25,
  roundUp: true,
};

const PT_MH: PtConfig = {
  configRef: "stat_pt_slab:MH:2025-04-01",
  state: "MH",
  effectiveFrom: "2025-04-01",
  periodBasis: "monthly",
  slabs: [
    { slabFrom: 0, slabTo: 7500, amount: 0 },
    { slabFrom: 7500.01, slabTo: 10000, amount: 175 },
    { slabFrom: 10000.01, slabTo: null, amount: 200, amountFebruary: 300 },
  ],
  annualCap: 2500,
  womenExemptUpto: 25000,
};

const PT_TN: PtConfig = {
  configRef: "stat_pt_slab:TN:2025-04-01",
  state: "TN",
  effectiveFrom: "2025-04-01",
  periodBasis: "half_yearly",
  municipality: "Coimbatore",
  slabs: [
    { slabFrom: 0, slabTo: 21000, amount: 0 },
    { slabFrom: 21000.01, slabTo: 30000, amount: 135 },
    { slabFrom: 30000.01, slabTo: 45000, amount: 315 },
    { slabFrom: 45000.01, slabTo: 60000, amount: 690 },
    { slabFrom: 60000.01, slabTo: 75000, amount: 1025 },
    { slabFrom: 75000.01, slabTo: null, amount: 1250 },
  ],
  annualCap: 2500,
};

const TDS: TdsConfig = {
  configRef: "stat_tds_config:2026-27:new",
  fy: "2026-27",
  regime: "new",
  standardDeduction: 75000,
  slabs: [
    { slabFrom: 0, slabTo: 400000, ratePct: 0 },
    { slabFrom: 400000, slabTo: 800000, ratePct: 5 },
    { slabFrom: 800000, slabTo: 1200000, ratePct: 10 },
    { slabFrom: 1200000, slabTo: 1600000, ratePct: 15 },
    { slabFrom: 1600000, slabTo: 2000000, ratePct: 20 },
    { slabFrom: 2000000, slabTo: 2400000, ratePct: 25 },
    { slabFrom: 2400000, slabTo: null, ratePct: 30 },
  ],
  rebate87aAmount: 60000,
  rebate87aIncomeLimit: 1200000,
  cessPct: 4,
  actReference: "Income-tax Act 2025 (eff. 01-Apr-2026)",
};

const GRATUITY: GratuityConfig = {
  effectiveFrom: "2025-11-21",
  factorNum: 15,
  factorDen: 26,
  vestingYearsDefault: 5,
  vestingYearsFixedTerm: 1,
  taxExemptCap: 2000000,
  wageBase: "deemed_wages",
};

const comp = (
  code: string,
  amount: number,
  wageClass: "included" | "excluded",
): RemunerationComponent => ({ code, name: code, amount, wageClass });

/* ======================= TC-GOLD-01 — deemed wages ======================== */

test("TC-GOLD-01a Sanjay Patil: OT pushes exclusions past 50% and triggers the add-back", () => {
  // §20.4. Structure "TPC Operator O2", gross 19,500, plus 8 OT hours in June.
  const ot = overtimePay(19500, 8, OT);
  assert.equal(ot, 1500, "19,500/26/8 x 2 x 8 = 1,500");

  const dw = deemedWages(
    [
      comp("BASIC", 9750, "included"),
      comp("HRA", 3900, "excluded"),
      comp("SPL", 5850, "excluded"),
      comp("OT", ot, "excluded"),
    ],
    WAGE_DEF,
  );

  assert.equal(dw.total, 21000);
  assert.equal(dw.included, 9750);
  assert.equal(dw.excluded, 11250);
  assert.equal(dw.excludedPct, 53.57);
  assert.equal(dw.threshold, 10500);
  assert.equal(dw.addback, 750, "only the EXCESS over 50% is added back, not all 11,250");
  assert.equal(dw.deemed, 10500, "PF base 10,500 — a Basic+DA engine would have said 9,750");
});

test("TC-GOLD-01b Kavita Rao: exactly 50% excluded produces ZERO add-back, not a rounding artefact", () => {
  const dw = deemedWages(
    [comp("BASIC", 30000, "included"), comp("HRA", 15000, "excluded"), comp("SPL", 15000, "excluded")],
    WAGE_DEF,
  );
  assert.equal(dw.excludedPct, 50);
  assert.equal(dw.addback, 0, "the boundary case: 50% exactly means nothing is added back");
  assert.equal(dw.deemed, 30000);
});

test("TC-GOLD-01c Imran Shaikh: a prorated LOP month splits to 50/50 with no add-back", () => {
  // §20.5. 32,000 gross, 25 paid days of 26 (1 LOP). The blueprint's 15,385/15,384 split.
  const basis = { paidDays: 25, periodDays: 26 };
  const dw = deemedWages(
    [
      comp("BASIC", prorate(16000, basis), "included"),
      comp("HRA", prorate(8000, basis), "excluded"),
      comp("SPL", prorate(8000, basis), "excluded"),
    ],
    WAGE_DEF,
  );
  assert.equal(Math.round(dw.total), 30769, "32,000 x 25/26");
  assert.equal(dw.addback, 0, "a prorated 50/50 structure must not manufacture an add-back");
  assert.equal(Math.round(dw.deemed), 15385);
});

test("TC-GOLD-01d the identity deemed == max(included, 50% of total) holds across the whole range", () => {
  // An odd-paise total is the case that breaks a naive float implementation: at an exact
  // 50/50 split the two forms of the statute disagree by a paisa unless the arithmetic is
  // done in integers.
  for (const total of [47311.37, 21000, 30769.23, 60000.01]) {
    for (let excludedPct = 0; excludedPct <= 100; excludedPct += 1) {
      const excluded = (total * excludedPct) / 100;
      const included = total - excluded;
      const dw = deemedWages(
        [comp("BASIC", included, "included"), comp("SPL", excluded, "excluded")],
        WAGE_DEF,
      );
      const expected = Math.max(dw.included, dw.total / 2);
      assert.ok(
        Math.abs(dw.deemed - expected) <= 0.01,
        `total ${total} at ${excludedPct}%: ${dw.deemed} vs ${expected}`,
      );
      assert.ok(dw.deemed >= dw.included, "deemed wages can never fall below included wages");
      assert.ok(dw.deemed <= dw.total + 0.01, "nor exceed total remuneration");
    }
  }
});

test("TC-GOLD-01e the threshold percentage is config, and the identity generalises past 50%", () => {
  // The famous `max(included, 50% x total)` shorthand is a coincidence of the threshold
  // being exactly half. The engine must hold for any configured percentage.
  const at40: WageDefinitionConfig = { effectiveFrom: "2025-11-21", addbackThresholdPct: 40 };
  const dw = deemedWages(
    [comp("BASIC", 40000, "included"), comp("SPL", 60000, "excluded")],
    at40,
  );
  assert.equal(dw.threshold, 40000, "40% of 1,00,000");
  assert.equal(dw.addback, 20000, "60,000 excluded less the 40,000 threshold");
  assert.equal(dw.deemed, 60000, "= max(included, total x (1 - 40%))");
});

test("prorate is monotonic and a full month is exact", () => {
  assert.equal(prorate(19500, { paidDays: 26, periodDays: 26 }), 19500);
  let prev = -1;
  for (let d = 0; d <= 26; d += 1) {
    const v = prorate(32000, { paidDays: d, periodDays: 26 });
    assert.ok(v >= prev, "more paid days can never earn less");
    prev = v;
  }
});

/* ============================ TC-GOLD-02 — EPF ============================ */

test("TC-GOLD-02a Sanjay: EPF 12% of deemed wages 10,500, employer split EPS 875 / EPF 385", () => {
  const epf = computeEpf({ deemedWages: 10500, policy: "capped_at_15000", config: EPF });
  assert.equal(epf.employeeAmount, 1260, "12% x 10,500 — NOT 12% x 9,750 = 1,170");
  assert.equal(epf.eps, 875, "8.33% x 10,500 = 874.65 -> 875");
  assert.equal(epf.employerEpf, 385, "1,260 - 875");
  assert.equal(epf.admin, 53);
  assert.equal(epf.edli, 53);
  assert.equal(epf.ceilingApplied, false);
  assert.equal(epf.wageBase, 10500);
  assert.equal(epf.configRef, "stat_epf_config:2026-05-29");
});

test("TC-GOLD-02b deemed wages above the ceiling cap at 15,000 -> EPF 1,800", () => {
  for (const dw of [15384.62, 30000, 62500]) {
    const epf = computeEpf({ deemedWages: dw, policy: "capped_at_15000", config: EPF });
    assert.equal(epf.employeeAmount, 1800, `deemed ${dw} caps to the 15,000 ceiling`);
    assert.equal(epf.ceilingApplied, true);
    assert.equal(epf.wageBase, 15000);
  }
});

test("TC-GOLD-02c the 'actual' policy contributes on full wages, but EPS still caps", () => {
  const epf = computeEpf({ deemedWages: 30000, policy: "actual", config: EPF });
  assert.equal(epf.employeeAmount, 3600, "12% x 30,000");
  assert.equal(epf.eps, 1250, "EPS is always on the ceiling-capped wage: 8.33% x 15,000");
  assert.equal(epf.employerEpf, 2350);
});

/* ============================ TC-GOLD-03 — ESI ============================ */

test("TC-GOLD-03a Sanjay: ESI on gross INCLUDING OT, rounded UP", () => {
  const esi = computeEsi({
    grossIncludingOt: 21000,
    grossAtPeriodStart: 19500,
    periodMonth: "2026-06",
    config: ESI,
  });
  assert.equal(esi.employeeAmount, 158, "0.75% x 21,000 = 157.50 -> round UP to 158");
  assert.equal(esi.employerAmount, 683, "3.25% x 21,000 = 682.50 -> 683");
  assert.equal(esi.wageBase, 21000, "the ESI base is gross, deliberately NOT deemed wages");
});

test("TC-GOLD-03b contribution-period lock-in holds cover even when gross crosses mid-period", () => {
  // Eligible at the April period start at 19,500; June's earned gross of 21,000 does not
  // end cover — eligibility is judged once per contribution period.
  const june = computeEsi({
    grossIncludingOt: 21000,
    grossAtPeriodStart: 19500,
    periodMonth: "2026-06",
    config: ESI,
  });
  assert.equal(june.eligible, true);
  assert.equal(june.contributionPeriod, "apr_sep");
  assert.match(june.note ?? "", /eligibility is locked at period start/);

  // ...and it holds the other way too: above the threshold at period start means no cover
  // that period, whatever happens later.
  const imran = computeEsi({
    grossIncludingOt: 30769.24,
    grossAtPeriodStart: 32000,
    periodMonth: "2026-06",
    config: ESI,
  });
  assert.equal(imran.eligible, false);
  assert.equal(imran.employeeAmount, 0);
});

test("TC-GOLD-03c contribution periods are Apr-Sep and Oct-Mar", () => {
  assert.equal(esiContributionPeriod("2026-04"), "apr_sep");
  assert.equal(esiContributionPeriod("2026-09"), "apr_sep");
  assert.equal(esiContributionPeriod("2026-10"), "oct_mar");
  assert.equal(esiContributionPeriod("2027-03"), "oct_mar");
});

/* ============================= TC-GOLD-04 — PT ============================ */

test("TC-GOLD-04a Maharashtra: 200/month, 300 in February, summing to exactly the 2,500 cap", () => {
  let ytd = 0;
  const months = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
  const amounts = months.map((m) => {
    const r = computePtMonthly({ monthlyGross: 19500, calendarMonth: m, ytdDeducted: ytd, config: PT_MH });
    ytd += r.employeeAmount;
    return r.employeeAmount;
  });
  assert.equal(amounts[10], 300, "February carries its own rate");
  assert.equal(ytd, 2500, "11 x 200 + 300 = the 2,500 statutory annual cap, exactly");
});

test("TC-GOLD-04b the annual cap clips the last instalment rather than overshooting", () => {
  const r = computePtMonthly({ monthlyGross: 19500, calendarMonth: 3, ytdDeducted: 2400, config: PT_MH });
  assert.equal(r.employeeAmount, 100, "only 100 of headroom remains under the 2,500 cap");
});

test("TC-GOLD-04c Maharashtra slabs: nil, 175, 200", () => {
  const at = (g: number): number =>
    computePtMonthly({ monthlyGross: g, calendarMonth: 6, ytdDeducted: 0, config: PT_MH }).employeeAmount;
  assert.equal(at(7000), 0);
  assert.equal(at(9000), 175);
  assert.equal(at(12000), 200);
  // The women's exemption threshold is CONFIG, pending MH-notification verification.
  const women = computePtMonthly({
    monthlyGross: 9000,
    calendarMonth: 6,
    gender: "female",
    ytdDeducted: 0,
    config: PT_MH,
  });
  assert.equal(women.employeeAmount, 0);
});

test("TC-GOLD-04d Lakshmi (TN): half-yearly 1,250 deducted as 208 x 5 + a 210 true-up", () => {
  const halfYearGross = 20500 * 6; // 1,23,000
  const monthly = [1, 2, 3, 4, 5, 6].map(
    (monthInHalf) => computePtHalfYearly({ halfYearGross, monthInHalf, config: PT_TN }).employeeAmount,
  );
  assert.deepEqual(monthly, [208, 208, 208, 208, 208, 210]);
  assert.equal(
    monthly.reduce((a, b) => a + b, 0),
    1250,
    "the true-up exists so the half-year sums exactly to the liability",
  );
});

/* ============================ TC-GOLD-05 — TDS =========================== */

test("TC-GOLD-05a Kavita: tax 12,250 fully wiped by the s.87A rebate -> TDS nil", () => {
  const tds = computeTds({ annualGross: 720000, ytdTaxDeducted: 0, remainingMonths: 12, config: TDS });
  assert.equal(tds.annualTaxableIncome, 645000, "7,20,000 less the 75,000 standard deduction");
  assert.equal(tds.taxBeforeRebate, 12250, "5% of (6,45,000 - 4,00,000)");
  assert.equal(tds.rebateApplied, 12250, "rebate capped at the tax due, not the full 60,000");
  assert.equal(tds.employeeAmount, 0);
});

test("TC-GOLD-05b Priya: above the 12L limit, no rebate, 93,750 + 4% cess = 8,125/month", () => {
  const tds = computeTds({ annualGross: 1500000, ytdTaxDeducted: 0, remainingMonths: 12, config: TDS });
  assert.equal(tds.annualTaxableIncome, 1425000);
  assert.equal(tds.taxBeforeRebate, 93750, "20,000 + 40,000 + 15% of 2,25,000");
  assert.equal(tds.rebateApplied, 0, "total income exceeds the 12,00,000 s.87A limit");
  assert.equal(tds.cess, 3750);
  assert.equal(tds.annualTax, 97500);
  assert.equal(tds.employeeAmount, 8125);
});

test("TC-GOLD-05c the s.87A cliff: one rupee over the limit costs the whole rebate", () => {
  const under = computeTds({
    annualGross: 1200000 + 75000,
    ytdTaxDeducted: 0,
    remainingMonths: 12,
    config: TDS,
  });
  const over = computeTds({
    annualGross: 1200000 + 75000 + 1,
    ytdTaxDeducted: 0,
    remainingMonths: 12,
    config: TDS,
  });
  assert.equal(under.annualTaxableIncome, 1200000);
  assert.equal(under.employeeAmount, 0, "at exactly 12L the rebate still applies");
  assert.ok(over.employeeAmount > 0, "a rupee above the limit and the full tax becomes payable");
  assert.equal(over.rebateApplied, 0);
});

test("TC-GOLD-05d Sanjay pays no TDS — annualised earnings fall below the first slab", () => {
  const tds = computeTds({ annualGross: 19500 * 12, ytdTaxDeducted: 0, remainingMonths: 12, config: TDS });
  assert.equal(tds.employeeAmount, 0);
  assert.equal(tds.taxBeforeRebate, 0, "2,34,000 - 75,000 sits under the 4,00,000 slab floor");
});

test("TDS already deducted is netted off across the remaining months", () => {
  const tds = computeTds({ annualGross: 1500000, ytdTaxDeducted: 24375, remainingMonths: 9, config: TDS });
  assert.equal(tds.employeeAmount, 8125, "(97,500 - 24,375) / 9");
});

/* ================= TC-GOLD-06 — the demo payslips, end to end ============= */

test("TC-GOLD-06 Sanjay Patil's June 2026 payslip reconciles to the last rupee", () => {
  const ot = overtimePay(19500, 8, OT);
  const dw = deemedWages(
    [
      comp("BASIC", 9750, "included"),
      comp("HRA", 3900, "excluded"),
      comp("SPL", 5850, "excluded"),
      comp("OT", ot, "excluded"),
    ],
    WAGE_DEF,
  );
  const epf = computeEpf({ deemedWages: dw.deemed, policy: "capped_at_15000", config: EPF });
  const esi = computeEsi({
    grossIncludingOt: dw.total,
    grossAtPeriodStart: 19500,
    periodMonth: "2026-06",
    config: ESI,
  });
  const pt = computePtMonthly({ monthlyGross: dw.total, calendarMonth: 6, ytdDeducted: 400, config: PT_MH });
  const tds = computeTds({ annualGross: 19500 * 12, ytdTaxDeducted: 0, remainingMonths: 12, config: TDS });

  const deductions = epf.employeeAmount + esi.employeeAmount + pt.employeeAmount + tds.employeeAmount;
  assert.equal(deductions, 1618, "1,260 + 158 + 200 + 0");
  assert.equal(dw.total - deductions, 19382, "net pay");

  const employerCost = epf.employeeAmount + epf.admin + epf.edli + esi.employerAmount;
  assert.equal(employerCost, 2049, "1,260 + 53 + 53 + 683");

  const g = gratuityProvision({
    deemedWages: dw.deemed,
    employmentType: "permanent",
    dateOfJoining: "2021-06-01",
    config: GRATUITY,
  });
  assert.equal(Math.round(g.monthlyProvision), 505, "15/26 x 10,500 x 1/12");
  assert.equal(g.vestingYears, 5);
});

test("TC-GOLD-06 Kavita, Imran and Priya reconcile to the blueprint's comparison table", () => {
  // Kavita Rao — 60,000, exact 50% boundary, s.87A wipes the tax.
  const kavita = deemedWages(
    [comp("BASIC", 30000, "included"), comp("HRA", 15000, "excluded"), comp("SPL", 15000, "excluded")],
    WAGE_DEF,
  );
  const kEpf = computeEpf({ deemedWages: kavita.deemed, policy: "capped_at_15000", config: EPF });
  const kEsi = computeEsi({
    grossIncludingOt: 60000,
    grossAtPeriodStart: 60000,
    periodMonth: "2026-06",
    config: ESI,
  });
  const kTds = computeTds({ annualGross: 720000, ytdTaxDeducted: 0, remainingMonths: 12, config: TDS });
  assert.equal(kEsi.eligible, false, "gross above 21,000 — no ESI");
  assert.equal(kEpf.employeeAmount + 200 + kTds.employeeAmount, 2000, "1,800 + 200 PT + 0 TDS");
  assert.equal(60000 - 2000, 58000, "net pay");

  // Imran Shaikh — 1 LOP day, ceiling cap.
  const basis = { paidDays: 25, periodDays: 26 };
  const imran = deemedWages(
    [
      comp("BASIC", prorate(16000, basis), "included"),
      comp("HRA", prorate(8000, basis), "excluded"),
      comp("SPL", prorate(8000, basis), "excluded"),
    ],
    WAGE_DEF,
  );
  const iEpf = computeEpf({ deemedWages: imran.deemed, policy: "capped_at_15000", config: EPF });
  assert.equal(iEpf.employeeAmount, 1800);
  assert.equal(Math.round(imran.total) - (1800 + 200), 28769, "net pay");

  // Priya Deshmukh — the slab walk.
  const priya = deemedWages(
    [comp("BASIC", 62500, "included"), comp("HRA", 31250, "excluded"), comp("SPL", 31250, "excluded")],
    WAGE_DEF,
  );
  const pEpf = computeEpf({ deemedWages: priya.deemed, policy: "capped_at_15000", config: EPF });
  const pTds = computeTds({ annualGross: 1500000, ytdTaxDeducted: 0, remainingMonths: 12, config: TDS });
  assert.equal(pEpf.employeeAmount + 200 + pTds.employeeAmount, 10125);
  assert.equal(125000 - 10125, 114875, "net pay");
});

test("TC-GOLD-06 Vikram Jadhav vests gratuity at ONE year because he is fixed-term", () => {
  const fixed = gratuityProvision({
    deemedWages: 9100,
    employmentType: "fixed_term",
    dateOfJoining: "2026-04-01",
    config: GRATUITY,
  });
  assert.equal(fixed.vestingYears, 1, "the Labour-Codes correction most SMBs are not accruing");
  assert.equal(fixed.vestingDate, "2027-04-01");

  const permanent = gratuityProvision({
    deemedWages: 9100,
    employmentType: "permanent",
    dateOfJoining: "2026-04-01",
    config: GRATUITY,
  });
  assert.equal(permanent.vestingYears, 5);
  assert.equal(permanent.vestingDate, "2031-04-01");
  assert.equal(
    fixed.monthlyProvision,
    permanent.monthlyProvision,
    "the monthly provision is the same; only the horizon differs",
  );
  assert.equal(fixed.basis, "deemed_wages");
});

/* ------------------------- Factories Act guardrails ----------------------- */

test("hours caps warn but never block — the hours were worked either way", () => {
  assert.deepEqual(checkHoursCaps({ dailyHours: 8, weeklyHours: 46 }, OT), []);
  const w = checkHoursCaps({ dailyHours: 10.5, weeklyHours: 52, quarterlyOtHours: 80 }, OT);
  assert.deepEqual(
    w.map((x) => x.rule),
    ["daily_over_cap", "weekly_over_cap", "quarterly_ot_cap"],
  );
});
