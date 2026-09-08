import { test } from "node:test";
import assert from "node:assert/strict";
import { accumulate, computeVendorTds, resolveTdsConfig, type TdsConfigRow } from "./tds.js";

/**
 * The configuration below mirrors the seeded rate book, including the Finance Act 2025
 * threshold changes effective 01-Apr-2025. It is duplicated here deliberately: a test that
 * imported the seed would prove the seed agrees with itself.
 */
const CONFIG: TdsConfigRow[] = [
  // 194C — contractors. Unchanged by FA 2025.
  { section: "194C", deducteeType: "individual_huf", ratePct: 1, singlePaymentThreshold: 30000, annualThreshold: 100000, effectiveFrom: "2020-04-01", sourceNote: "s.194C" },
  { section: "194C", deducteeType: "company_firm_other", ratePct: 2, singlePaymentThreshold: 30000, annualThreshold: 100000, effectiveFrom: "2020-04-01", sourceNote: "s.194C" },
  // 194J — professional. FA 2025 raised the threshold from ₹30,000 to ₹50,000.
  { section: "194J", deducteeType: "any", ratePct: 10, singlePaymentThreshold: 30000, annualThreshold: 30000, effectiveFrom: "2020-04-01", effectiveTo: "2025-03-31", sourceNote: "s.194J, pre-FA-2025" },
  { section: "194J", deducteeType: "any", ratePct: 10, singlePaymentThreshold: 50000, annualThreshold: 50000, effectiveFrom: "2025-04-01", sourceNote: "s.194J as amended by the Finance Act 2025" },
  // 194I — rent. FA 2025 moved this to a ₹50,000-per-month test.
  { section: "194I", deducteeType: "any", ratePct: 10, singlePaymentThreshold: 50000, annualThreshold: 600000, effectiveFrom: "2025-04-01", sourceNote: "s.194I as amended by the Finance Act 2025 — ₹50,000 per month" },
];

/* ------------------------------ effective dating --------------------------- */

test("the rate book is read as of the payment date, not as of today", () => {
  const before = resolveTdsConfig(CONFIG, "194J", "any", "2025-03-31");
  const after = resolveTdsConfig(CONFIG, "194J", "any", "2026-07-20");
  assert.equal(before!.annualThreshold, 30000);
  assert.equal(after!.annualThreshold, 50000, "a 2026 bill is judged by the 2026 threshold");
});

test("a row naming the deductee type beats a catch-all", () => {
  const row = resolveTdsConfig(CONFIG, "194C", "individual_huf", "2026-07-20");
  assert.equal(row!.ratePct, 1);
  assert.equal(resolveTdsConfig(CONFIG, "194C", "company_firm_other", "2026-07-20")!.ratePct, 2);
});

/* ------------------------------- who the vendor is ------------------------- */

test("the same invoice withholds different money depending on who the supplier is", () => {
  const base = { section: "194C" as const, base: 40000, paymentDate: "2026-07-20", config: CONFIG };
  const individual = computeVendorTds({ ...base, deducteeType: "individual_huf" });
  const company = computeVendorTds({ ...base, deducteeType: "company_firm_other" });
  assert.equal(individual.amount, 400, "1% for an individual or HUF");
  assert.equal(company.amount, 800, "2% for a company");
});

test("the demo's housekeeping bill: ₹40,000 to Arka at 194C 1% = ₹400", () => {
  const r = computeVendorTds({
    section: "194C",
    deducteeType: "individual_huf",
    base: 40000,
    paymentDate: "2026-07-20",
    config: CONFIG,
  });
  assert.equal(r.applicable, true);
  assert.equal(r.amount, 400);
  assert.match(r.reason, /exceeds the single-payment limit of ₹30,000/);
});

/* --------------------------------- thresholds ------------------------------ */

test("below both thresholds nothing is withheld, and the reason names both", () => {
  const r = computeVendorTds({
    section: "194C",
    deducteeType: "individual_huf",
    base: 9000,
    paymentDate: "2026-07-20",
    config: CONFIG,
    accumulator: { vendorRef: "v1", section: "194C", fiscalYear: "2627", cumulativeBase: 27000 },
  });
  assert.equal(r.applicable, false);
  assert.equal(r.amount, 0);
  assert.match(r.reason, /within the single-payment limit of ₹30,000/);
  assert.match(r.reason, /within the annual limit of ₹1,00,000/);
});

test("TDS is withheld on the taxable value, NEVER on the GST-inclusive total", () => {
  // ₹40,000 + 18% GST = ₹47,200. Withholding on the gross would over-deduct on every bill.
  const r = computeVendorTds({ section: "194C", deducteeType: "individual_huf", base: 40000, paymentDate: "2026-07-20", config: CONFIG });
  assert.equal(r.base, 40000);
  assert.equal(r.amount, 400);
  assert.notEqual(r.amount, 472);
});

/* ---------------------------- the crossing, honestly ----------------------- */

test("crossing the annual limit mid-year computes BOTH readings and refuses to choose", () => {
  // ₹96,000 already paid this year; this ₹18,000 freight bill takes it past ₹1,00,000.
  const r = computeVendorTds({
    section: "194C",
    deducteeType: "individual_huf",
    base: 18000,
    paymentDate: "2026-07-20",
    config: CONFIG,
    accumulator: { vendorRef: "vega", section: "194C", fiscalYear: "2627", cumulativeBase: 96000 },
  });
  assert.equal(r.applicable, true);
  assert.equal(r.amount, 180, "1% of this bill alone");
  assert.ok(r.crossing);
  assert.equal(r.crossing!.cumulativeBefore, 96000);
  assert.equal(r.crossing!.cumulativeAfter, 114000);
  assert.equal(r.crossing!.prospectiveAmount, 180);
  assert.equal(r.crossing!.catchUpAmount, 1140, "1% of the whole year to date, the other defensible reading");
  assert.equal(r.crossing!.requiresFinanceReview, true);
  assert.match(r.crossing!.note, /this is a tax position, and it belongs to Finance/);
});

test("once crossed, later bills deduct without re-raising the crossing", () => {
  const r = computeVendorTds({
    section: "194C",
    deducteeType: "individual_huf",
    base: 5000,
    paymentDate: "2026-08-20",
    config: CONFIG,
    accumulator: { vendorRef: "vega", section: "194C", fiscalYear: "2627", cumulativeBase: 114000, thresholdCrossedAt: "2026-07-20" },
  });
  assert.equal(r.applicable, true);
  assert.equal(r.amount, 50, "1% of ₹5,000, even though ₹5,000 is under the single-payment limit");
  assert.equal(r.crossing, undefined);
});

test("the accumulator remembers the crossing date once and does not move it", () => {
  const first = accumulate(null, { vendorRef: "vega", section: "194C", fiscalYear: "2627", base: 96000, onDate: "2026-06-10", crossed: false });
  assert.equal(first.thresholdCrossedAt, null);
  const second = accumulate(first, { vendorRef: "vega", section: "194C", fiscalYear: "2627", base: 18000, onDate: "2026-07-20", crossed: true });
  assert.equal(second.cumulativeBase, 114000);
  assert.equal(second.thresholdCrossedAt, "2026-07-20");
  const third = accumulate(second, { vendorRef: "vega", section: "194C", fiscalYear: "2627", base: 5000, onDate: "2026-08-20", crossed: true });
  assert.equal(third.thresholdCrossedAt, "2026-07-20", "the crossing happened once");
});

/* ------------------------------- 194J and 194I ----------------------------- */

test("194J on the FIRST ₹45,000 professional bill withholds nothing under the 2025 threshold", () => {
  // The blueprint's §20.8 deducts ₹4,500 on this bill. Under the Finance Act 2025 the
  // threshold is ₹50,000, so a first bill of ₹45,000 does not reach it. The deduction
  // follows on the NEXT bill, and this is what the seeded accumulator demonstrates.
  const first = computeVendorTds({ section: "194J", deducteeType: "any", base: 45000, paymentDate: "2026-07-20", config: CONFIG });
  assert.equal(first.applicable, false);
  assert.equal(first.amount, 0);
});

test("194J on the second quarter's bill crosses, and the crossing is raised", () => {
  const second = computeVendorTds({
    section: "194J",
    deducteeType: "any",
    base: 45000,
    paymentDate: "2026-10-20",
    config: CONFIG,
    accumulator: { vendorRef: "ca-firm", section: "194J", fiscalYear: "2627", cumulativeBase: 45000 },
  });
  assert.equal(second.applicable, true);
  assert.equal(second.amount, 4500, "10% of this bill");
  assert.equal(second.crossing!.catchUpAmount, 9000, "or 10% of both quarters, if Finance takes the catch-up view");
});

test("194I: ₹1,00,000 monthly rent crosses the ₹50,000-per-month test on the first bill", () => {
  const r = computeVendorTds({ section: "194I", deducteeType: "any", base: 100000, paymentDate: "2026-07-20", config: CONFIG });
  assert.equal(r.amount, 10000, "10% — the blueprint's figure, reached through the current monthly test");
  assert.match(r.reason, /single-payment limit of ₹50,000/);
});

/* ---------------------------------- s.206AA -------------------------------- */

test("a vendor with no PAN is deducted at 20%, and the reason says why", () => {
  const r = computeVendorTds({
    section: "194C",
    deducteeType: "individual_huf",
    base: 40000,
    paymentDate: "2026-07-20",
    config: CONFIG,
    vendorHasPan: false,
  });
  assert.equal(r.ratePct, 20);
  assert.equal(r.amount, 8000);
  assert.match(r.reason, /s\.206AA/);
});

/* ------------------------------ missing config ----------------------------- */

test("a head with no section withholds nothing and says so plainly", () => {
  const r = computeVendorTds({ section: null, deducteeType: "any", base: 40000, paymentDate: "2026-07-20", config: CONFIG });
  assert.equal(r.applicable, false);
  assert.match(r.reason, /carries no TDS section/);
});

test("a section with no configuration in force refuses to guess a rate", () => {
  const r = computeVendorTds({ section: "194Q", deducteeType: "any", base: 6000000, paymentDate: "2026-07-20", config: CONFIG });
  assert.equal(r.applicable, false);
  assert.equal(r.amount, 0);
  assert.match(r.reason, /configure the rate before posting/);
});
