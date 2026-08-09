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

expect(manifest.model_version === "2026-08-08-v3", "manifest model version");
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

process.stdout.write(
  `Business revenue model v3 verified: ₹${msme.recurring_acv_lakh}L MSME ACV, ` +
    `₹${multiPlant.recurring_acv_lakh}L Multi-Plant ACV, ₹${tamCrore.toLocaleString("en-IN")}Cr TAM, ` +
    `${breakEvenCustomers} blended break-even customers, ${teamFte} employees, ${agentPrices.length} agent prices.\n`,
);
