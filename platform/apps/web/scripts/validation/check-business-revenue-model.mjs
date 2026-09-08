import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const sourcePath = resolve(root, "docs/reports/xelor-business-revenue-model.html");
const manifestPath = resolve(root, "docs/reports/xelor-business-revenue-model.manifest.json");

const [html, manifestText] = await Promise.all([
  readFile(sourcePath, "utf8"),
  readFile(manifestPath, "utf8"),
]);
const manifest = JSON.parse(manifestText);

const fail = (message) => {
  throw new Error(`Business revenue model check failed: ${message}`);
};
const close = (actual, expected, tolerance = 1e-9) =>
  Math.abs(actual - expected) <= tolerance;
const expect = (condition, message) => {
  if (!condition) fail(message);
};
const expectNeedles = (needles) => {
  for (const needle of needles) {
    expect(html.includes(needle), `report is missing expected value/text: ${needle}`);
  }
};

const { msme, multi_plant: multiPlant, planning_mix: mix } = manifest.key_assumptions;
const fundingCrore = manifest.key_assumptions.funding_ask_crore;
const runwayMonths = manifest.key_assumptions.runway_months;
const msmeWeight = mix.msme_pct / 100;
const multiWeight = mix.multi_plant_pct / 100;
expect(close(msmeWeight + multiWeight, 1), "planning mix must sum to 100%");

const factoriesByEmployment = {
  "100-199": 19623,
  "200-499": 15299,
  "500-999": 6552,
  "1000-1999": 3269,
  "2000-4999": 2120,
  "5000+": 899,
};
const msmeSites = factoriesByEmployment["100-199"];
const multiPlantSites = Object.entries(factoriesByEmployment)
  .filter(([band]) => band !== "100-199")
  .reduce((sum, [, count]) => sum + count, 0);
const tamSites = msmeSites + multiPlantSites;
const samSites = 20046 + 7089;
const tomSites = manifest.key_assumptions.tom_site_assumption;
const somSites = manifest.key_assumptions.five_year_som_site_equivalents;
const blendedAcvLakh =
  msme.recurring_acv_lakh * msmeWeight + multiPlant.recurring_acv_lakh * multiWeight;

const tamMsmeCrore = (msmeSites * msme.recurring_acv_lakh) / 100;
const tamMultiPlantCrore = (multiPlantSites * multiPlant.recurring_acv_lakh) / 100;
const tamCrore = tamMsmeCrore + tamMultiPlantCrore;
const blendedMarketCrore = (sites) => (sites * blendedAcvLakh) / 100;
expect(msmeSites === 19623, "MSME proxy site count");
expect(multiPlantSites === 28139, "Multi-Plant proxy site count");
expect(tamSites === 47762, "two-segment TAM site total");
expect(samSites === 27135, "SAM site total");
expect(close(tamMsmeCrore, 3532.14), "MSME TAM formula");
expect(close(tamMultiPlantCrore, 15195.06), "Multi-Plant TAM formula");
expect(close(tamCrore, 18727.2), "combined TAM formula");
expect(close(blendedAcvLakh, 25.2), "80/20 blended ACV");
expect(close(blendedMarketCrore(samSites), 6838.02), "SAM formula");
expect(close(blendedMarketCrore(tomSites), 1260), "TOM formula");
expect(close(blendedMarketCrore(somSites), 25.2), "SOM formula");

const msmeGrossProfitLakh =
  msme.recurring_acv_lakh * (msme.recurring_gross_margin_target_pct / 100);
const multiPlantGrossProfitLakh =
  multiPlant.recurring_acv_lakh * (multiPlant.recurring_gross_margin_target_pct / 100);
const msmePaybackMonths = msme.cac_target_lakh / (msmeGrossProfitLakh / 12);
const multiPlantPaybackMonths =
  multiPlant.cac_target_lakh / (multiPlantGrossProfitLakh / 12);
expect(close(msmeGrossProfitLakh, 13.5), "MSME annual gross profit");
expect(close(multiPlantGrossProfitLakh, 42.12), "Multi-Plant annual gross profit");
expect(close(msmePaybackMonths, 7.111111111111111), "MSME CAC payback");
expect(close(multiPlantPaybackMonths, 6.267806267806267), "Multi-Plant CAC payback");

const blendedGrossProfitLakh =
  msmeGrossProfitLakh * msmeWeight + multiPlantGrossProfitLakh * multiWeight;
const blendedGrossMargin = blendedGrossProfitLakh / blendedAcvLakh;
const annualizedCashCostCrore = (fundingCrore / runwayMonths) * 12;
const breakEvenArrCrore = annualizedCashCostCrore / blendedGrossMargin;
const breakEvenCustomers = Math.ceil(
  annualizedCashCostCrore / (blendedGrossProfitLakh / 100),
);
expect(close(blendedGrossProfitLakh, 19.224), "blended gross profit per customer");
expect(close(blendedGrossMargin, 0.7628571428571429), "blended gross margin");
expect(close(annualizedCashCostCrore, 6.666666666666667), "annualized cash cost");
expect(close(breakEvenArrCrore, 8.739076154806492), "break-even ARR");
expect(breakEvenCustomers === 35, "break-even customer count");
expect(close(28 * 0.18 + 7 * 0.54, 8.82), "28/7 break-even mix ARR");

const useOfFunds = [5.2, 1.8, 1.2, 0.7, 0.5, 0.6];
expect(
  close(useOfFunds.reduce((sum, value) => sum + value, 0), fundingCrore),
  "use of funds must sum to ₹10Cr",
);

const teamPlan = manifest.investor_team_plan;
const teamFte = teamPlan.workstreams.reduce(
  (sum, workstream) => sum + workstream.fte_at_month_18,
  0,
);
const payrollCrore = teamPlan.workstreams.reduce(
  (sum, workstream) => sum + workstream.payroll_crore,
  0,
);
const otherCashCrore = teamPlan.workstreams.reduce(
  (sum, workstream) => sum + workstream.other_cash_crore,
  0,
);
const teamPlanTotalCrore = teamPlan.workstreams.reduce(
  (sum, workstream) => sum + workstream.total_crore,
  0,
);
expect(teamFte === 15, "month-18 employee count");
expect(close(payrollCrore, 5.45), "18-month payroll allocation");
expect(close(otherCashCrore, 4.55), "18-month non-payroll allocation");
expect(
  close(payrollCrore, teamPlan.employee_cash_cost_crore),
  "employee cash cost summary must match workstreams",
);
expect(
  close(otherCashCrore, teamPlan.non_payroll_cash_crore),
  "non-payroll cash summary must match workstreams",
);
expect(
  close(teamPlan.average_monthly_cash_envelope_lakh, (fundingCrore * 100) / runwayMonths, 0.05),
  "average monthly cash envelope",
);
expect(close(teamPlanTotalCrore, fundingCrore), "team plan must sum to ₹10Cr");
expect(
  close(
    teamPlan.internal_budget_release_crore.reduce((sum, value) => sum + value, 0),
    fundingCrore,
  ),
  "internal budget releases must sum to ₹10Cr",
);
expect(
  teamPlan.headcount_ramp.join(",") === "8,12,15",
  "headcount ramp must be 8 → 12 → 15",
);
expect(
  teamPlan.month_18_recurring_customer_target.join(",") === "16,20",
  "month-18 recurring-customer target must be 16–20",
);
expect(
  teamPlan.month_18_exit_arr_crore.join(",") === "4,5",
  "month-18 exit ARR target must be ₹4–5Cr",
);
expect(
  close((payrollCrore * 100) / teamFte / (runwayMonths / 12), 24.22222222222222),
  "payroll planning ceiling per role-year",
);

const sourceTitles = manifest.external_sources.map((source) => source.title);
expect(sourceTitles.includes("Annual Salary Trends Report 2025-2026"), "Randstad salary source");
expect(sourceTitles.includes("Insights Tracker, October 2025"), "Foundit salary source");
expect(sourceTitles.includes("India Venture Capital Report 2026"), "Bain/IVCA seed source");

const plan = [
  {
    openingMsme: 0,
    exitMsme: 6,
    openingMulti: 0,
    exitMulti: 2,
    msmePilots: 12,
    multiPilots: 4,
    expectedTotalRevenueCrore: 2.24,
  },
  {
    openingMsme: 6,
    exitMsme: 24,
    openingMulti: 2,
    exitMulti: 6,
    msmePilots: 30,
    multiPilots: 8,
    expectedTotalRevenueCrore: 7.48,
  },
  {
    openingMsme: 24,
    exitMsme: 60,
    openingMulti: 6,
    exitMulti: 15,
    msmePilots: 60,
    multiPilots: 18,
    expectedTotalRevenueCrore: 18.81,
  },
];
for (const year of plan) {
  const newMsme = year.exitMsme - year.openingMsme;
  const newMulti = year.exitMulti - year.openingMulti;
  const recurringRevenueCrore =
    (((year.openingMsme + year.exitMsme) / 2) * msme.recurring_acv_lakh +
      ((year.openingMulti + year.exitMulti) / 2) * multiPlant.recurring_acv_lakh) /
    100;
  const implementationRevenueCrore =
    (newMsme * msme.implementation_fee_lakh +
      newMulti * multiPlant.implementation_fee_lakh) /
    100;
  const nonConvertingPilotRevenueCrore =
    ((year.msmePilots - newMsme) * msme.pilot_fee_lakh +
      (year.multiPilots - newMulti) * multiPlant.pilot_fee_lakh) /
    100;
  const totalRevenueCrore =
    recurringRevenueCrore + implementationRevenueCrore + nonConvertingPilotRevenueCrore;
  expect(
    close(totalRevenueCrore, year.expectedTotalRevenueCrore),
    `three-year revenue plan ending with ${year.exitMsme + year.exitMulti} customers`,
  );
}

const agentPrices = Object.values(manifest.per_agent_pricing_lakh);
const msmeAgentTotal = agentPrices.reduce((sum, price) => sum + price.msme, 0);
const multiPlantAgentTotal = agentPrices.reduce(
  (sum, price) => sum + price.multi_plant,
  0,
);
expect(agentPrices.length === 9, "exactly nine per-agent prices");
expect(close(msmeAgentTotal, 21), "MSME per-agent total");
expect(close(multiPlantAgentTotal, 63), "Multi-Plant per-agent total");
expect(close(1 - msme.recurring_acv_lakh / msmeAgentTotal, 1 / 7), "MSME bundle discount");
expect(
  close(1 - multiPlant.recurring_acv_lakh / multiPlantAgentTotal, 1 / 7),
  "Multi-Plant bundle discount",
);
expect(
  close(
    manifest.per_agent_pricing_lakh.ONYX.msme +
      manifest.per_agent_pricing_lakh.HEXA.msme +
      manifest.per_agent_pricing_lakh.ACHILES.msme,
    6,
  ),
  "MSME Control Foundation price",
);

expect(manifest.model_version === "2026-08-09-v3.1", "manifest model version");
expect(
  html.includes(`data-model-version="${manifest.model_version}"`),
  "HTML/manifest model version alignment",
);
expectNeedles([
  "₹18L",
  "₹54L",
  "₹23L",
  "₹78L",
  "₹18,727Cr",
  "₹6,838Cr",
  "₹1,260Cr",
  "₹25.2Cr",
  "7.1 months",
  "6.3 months",
  "35 blended customers",
  "₹18.81Cr",
  "₹21.0L/year",
  "₹63.0L/year",
  "14.3%",
  "₹10.00",
  "₹5.45Cr",
  "₹4.55Cr",
  "₹5.20Cr",
  "15 employees",
  "8 → 12 → 15",
  "16–20 recurring customers",
  "₹4–5Cr exit ARR",
  "Employee cash cost",
  "Total / share",
  "₹3.80Cr · 38%",
  "₹10.00Cr · 100%",
  "₹17.04–26.27L",
  "₹20.14–30.13L",
  "₹17.38–25.91L",
  "803 Indian seed deals",
  "US$3M",
  "100%",
]);

/* ---------------------------------------------------------------------------
 * v3.1 — SECTION 12 (India price sensitivity) AND SECTION 13 (investor view)
 * ---------------------------------------------------------------------------
 * These two sections exist to be argued with by an investor, so every number in
 * them is recomputed here from its stated inputs rather than trusted as typed.
 * The v3.0 assertions above are deliberately untouched: the price decision was
 * to HOLD ₹18L and ₹54L, so TAM, SAM, TOM, SOM, blended ACV, unit economics and
 * the ₹10Cr team plan must all still reproduce exactly.
 */
const india = manifest.india_price_sensitivity;
const investor = manifest.investor_view;
expect(Boolean(india) && Boolean(investor), "v3.1 manifest blocks are missing");

expect(
  india.verdict === "price_holds_label_and_cash_shape_do_not",
  "the v3.1 price decision must remain HOLD",
);
expect(
  close(msme.recurring_acv_lakh, 18) && close(multiPlant.recurring_acv_lakh, 54),
  "v3.1 must not change the headline ACVs it concluded were defensible",
);

// Per-seat normalisation — a comparison device, never an invoice metric (§12.1).
const perUserMonth = (seats) => (msme.recurring_acv_lakh * 100000) / seats / 12;
for (const [seats, expected] of Object.entries(india.xelor_per_user_month_at_seats)) {
  expect(close(perUserMonth(Number(seats)), expected, 0.5), `₹18L per user/month at ${seats} seats`);
}
expect(
  close((perUserMonth(40) / india.bc_essentials_inr_per_user_month) * 100, india.share_of_bc_essentials_at_40_seats_pct, 0.05),
  "XELOR as a share of Business Central Essentials at 40 seats",
);
// Business Central annual cost at the seat counts actually printed in §4 and §12.
expect(close((india.bc_essentials_inr_per_user_month * 12 * 30) / 1e5, 23.96, 0.01), "BC Essentials 30 seats");
expect(close((india.bc_premium_inr_per_user_month * 12 * 30) / 1e5, 32.94, 0.01), "BC Premium 30 seats");
expect(close((india.bc_essentials_inr_per_user_month * 12 * 20) / 1e5, 15.97, 0.01), "BC Essentials 20 seats");
expect(close((india.bc_premium_inr_per_user_month * 12 * 20) / 1e5, 21.96, 0.01), "BC Premium 20 seats");

// The floor test — the price breaks exactly one employment band down (§12.2).
const shareOfProxy = (lakh, proxyCrore) => (lakh * 100000) / (proxyCrore * 1e7) * 100;
expect(close(shareOfProxy(18, india.band_100_199.profit_proxy_crore), 4.0, 0.05), "₹18L vs 100–199 proxy");
expect(close(shareOfProxy(23, india.band_100_199.profit_proxy_crore), 5.1, 0.05), "₹23L vs 100–199 proxy");
expect(close(shareOfProxy(18, india.band_50_99.profit_proxy_crore), 11.1, 0.05), "₹18L vs 50–99 proxy");
expect(close(shareOfProxy(23, india.band_50_99.profit_proxy_crore), 14.2, 0.05), "₹23L vs 50–99 proxy");
expect(close(shareOfProxy(78, india.band_50_99.profit_proxy_crore), 48.1, 0.05), "₹78L vs 50–99 proxy");
expect(
  india.qualification_floor.min_employees === 100 && india.qualification_floor.min_turnover_crore === 50,
  "the qualification floor the floor test implies",
);

// Prove-then-Ramp must stay revenue-neutral. If a future edit turns it into a
// discount, these two lines are what catches it.
const ramp = india.prove_then_ramp;
const peakRampLakh = (ramp.quarterly_subscription_lakh * 100000 + ramp.implementation_monthly_inr) / 1e5;
expect(close(peakRampLakh, ramp.peak_outflow_ramp_lakh, 0.001), "Prove-then-Ramp peak outflow");
expect(
  close(((ramp.peak_outflow_today_lakh - peakRampLakh) / ramp.peak_outflow_today_lakh) * 100, ramp.peak_reduction_pct, 0.05),
  "peak-outflow reduction",
);
const collectedToday = 3 + 2 + msme.recurring_acv_lakh * 2;
const collectedRamp = 3 + (ramp.implementation_monthly_inr * 12) / 1e5 + msme.recurring_acv_lakh * 2;
expect(close(collectedToday, ramp.collected_24_months_today_lakh, 0.01), "24-month collections today");
expect(close(collectedRamp, ramp.collected_24_months_ramp_lakh, 0.001), "24-month collections under the ramp");
expect(
  collectedRamp >= collectedToday,
  "Prove-then-Ramp must never collect LESS than the current terms — that would be a discount wearing a premium's label",
);
expect(
  close(((msme.recurring_acv_lakh * 100000 * 0.75) / 2 * (ramp.rbi_walr_pct / 100)) / (msme.recurring_acv_lakh * 100000) * 100, ramp.float_cost_pct_of_acv, 0.05),
  "float cost as a share of ACV",
);

// §13 — runway has no buffer, and the two break-even bases are different numbers.
expect(
  close((fundingCrore * 100) / teamPlan.average_monthly_cash_envelope_lakh, investor.runway_months_actual, 0.01),
  "actual runway is 17.99 months, not a round 18",
);
expect(
  investor.breakeven_month18_cost_base.customers === breakEvenCustomers,
  "§8's break-even must stay the month-18-cost-base figure the v3.0 model computes",
);
// Year-3 cost base in LAKH ÷ blended gross profit per customer in LAKH.
const y3CostLakh = investor.year3_operating_cost_crore * 100;
const y3BreakEven = Math.ceil(y3CostLakh / blendedGrossProfitLakh);
expect(
  y3BreakEven === investor.breakeven_year3_cost_base.customers,
  `Year-3-cost-base break-even should be ${y3BreakEven}`,
);
const y3Mix = investor.breakeven_year3_cost_base;
expect(
  close(y3Mix.msme * 0.18 + y3Mix.multi_plant * 0.54, y3Mix.arr_crore, 0.01),
  "Year-3 break-even ARR must reconcile to its own customer mix",
);
expect(y3Mix.msme + y3Mix.multi_plant === y3Mix.customers, "Year-3 break-even mix must sum to its customer count");
expect(
  investor.cumulative_loss_to_breakeven_crore > fundingCrore && investor.series_a_structurally_required === true,
  "if cumulative loss exceeds the raise, the plan must say a Series A is structurally required",
);

// Cutting the price is a different company, not a discount (§12.8).
// Rounded to the nearest customer, matching how §12.8 prints them.
for (const [acvLakh, customers] of [[25.2, 397], [9, 1111], [6, 1667]]) {
  expect(Math.round(10000 / acvLakh) === customers, `customers needed for ₹100Cr ARR at ₹${acvLakh}L`);
}
expect(close((1667 * msme.cac_target_lakh) / 100, 133.36, 0.5), "acquisition cost of 1,667 customers at the plan's own CAC");

expectNeedles([
  "12. Is this price right for a price-sensitive India?",
  "13. The investor&rsquo;s point of view",
  "₹6,655",
  "₹3,750",
  "56.3%",
  "0.24%",
  "14.2%",
  "48.1%",
  "₹4.674L",
  "&minus;75.4%",
  "₹41.088L",
  "8.53%",
  "17.99",
  "100+",
  "133&times;",
  "2.75&times;",
  "₹133Cr in acquisition alone",
  "DENOMINATOR UNSOURCED",
  "₹410/month",
  "Anchor correction (v3.1)",
]);
// THE FOUR RETIRED CLAIMS MAY APPEAR ONLY WHERE THEY ARE BEING RETIRED.
//
// §12.5 quotes each one verbatim in order to kill it, so a naive "must not appear"
// check fails on the very table that does the killing. What actually matters is that
// none of them leaks back into the argument: each may occur exactly once, and that
// occurrence must sit inside the retirement table.
const retirementStart = html.indexOf("12.5 Four claims that must be retired");
const retirementEnd = html.indexOf("Standing rule:", retirementStart);
expect(retirementStart > 0 && retirementEnd > retirementStart, "§12.5 retirement table is missing");
const retirementTable = html.slice(retirementStart, retirementEnd);
for (const claim of ["31&ndash;62%", "₹1,500/employee", "12% of Indian MSMEs", "2% of revenue"]) {
  const total = html.split(claim).length - 1;
  const inTable = retirementTable.split(claim).length - 1;
  expect(total > 0, `retired claim is no longer documented as retired: ${claim}`);
  expect(
    total === inTable,
    `retired claim appears outside §12.5, where it would read as an argument: ${claim}`,
  );
}

process.stdout.write(
  `Business revenue model v${manifest.version} verified: ₹${msme.recurring_acv_lakh}L MSME ACV, ` +
    `₹${multiPlant.recurring_acv_lakh}L Multi-Plant ACV, ₹${tamCrore.toLocaleString("en-IN")}Cr TAM, ` +
    `${breakEvenCustomers} break-even customers at the month-18 cost base and ${y3BreakEven} at the Year-3 base, ` +
    `${teamFte} employees, ${agentPrices.length} agent prices, ${manifest.external_sources.length} sources; ` +
    `price decision HOLD.\n`,
);
