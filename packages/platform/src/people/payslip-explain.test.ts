import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkPayslipGrounding,
  renderPayslipExplanation,
  type PayslipTrace,
} from "./payslip-explain.js";

/**
 * TC-AI-* (HRM §16.K) — the eval gate for `hrm.payslip_explainer`.
 *
 * Sanjay Patil's June payslip is the fixture, because it is the one where the s.2(y)
 * add-back actually bites. Every rejection case below is a failure mode a small local model
 * demonstrably produces; the same discipline recorded in `dedup-verdict.ts` applies here,
 * with two additions specific to a payslip: it may not judge whether the pay is correct,
 * and it may not give advice.
 */

const SANJAY: PayslipTrace = {
  periodLabel: "June 2026",
  employeeName: "Sanjay Patil",
  paidDays: 26,
  lopDays: 0,
  otHours: 8,
  otPay: 1500,
  gross: 21000,
  includedWages: 9750,
  excludedWages: 11250,
  excludedPct: 53.57,
  thresholdAt50: 10500,
  addback: 750,
  deemedWages: 10500,
  pfWageBase: 10500,
  pfCeiling: 15000,
  statutory: [
    { statute: "epf", amount: 1260, wageBase: 10500 },
    { statute: "esi", amount: 158, wageBase: 21000 },
    { statute: "pt", amount: 200, wageBase: 21000 },
    { statute: "tds", amount: 0, wageBase: 177000 },
  ],
  totalDeduction: 1618,
  netPay: 19382,
};

/* --------------------------- the template baseline ------------------------ */

test("the deterministic template explains the add-back without any model", () => {
  const text = renderPayslipExplanation(SANJAY);
  assert.match(text, /26 days/);
  assert.match(text, /Rs 21,000/, "Indian digit grouping, not 21,000 the western way");
  assert.match(text, /53\.57%/);
  assert.match(text, /Rs 750 is counted back/);
  assert.match(text, /Rs 10,500 rather than on your basic of Rs 9,750/);
  assert.match(text, /leaving Rs 19,382 net/);
  // It must be self-grounding: the baseline always passes its own gate.
  assert.equal(checkPayslipGrounding(text, SANJAY).ok, true);
});

test("the template states plainly when nothing is added back", () => {
  const kavita: PayslipTrace = {
    ...SANJAY,
    employeeName: "Kavita Rao",
    otHours: 0,
    otPay: 0,
    gross: 60000,
    includedWages: 30000,
    excludedWages: 30000,
    excludedPct: 50,
    thresholdAt50: 30000,
    addback: 0,
    deemedWages: 30000,
    pfWageBase: 15000,
    statutory: [
      { statute: "epf", amount: 1800, wageBase: 15000 },
      { statute: "pt", amount: 200, wageBase: 60000 },
    ],
    totalDeduction: 2000,
    netPay: 58000,
  };
  const text = renderPayslipExplanation(kavita);
  assert.match(text, /nothing is added back/);
  assert.match(text, /ceiling of Rs 15,000/, "and it explains why the base is not 30,000");
  assert.equal(checkPayslipGrounding(text, kavita).ok, true);
});

/* ----------------------------- the grounding gate ------------------------- */

test("a well-grounded rewrite is accepted", () => {
  const ok = checkPayslipGrounding(
    "Your pay for June 2026 was Rs 21,000 across 26 days, with Rs 1,500 of that being overtime. " +
      "Because allowances made up 53.57% of the total, Rs 750 was moved back into wages, making the provident fund base Rs 10,500. " +
      "After Rs 1,618 of deductions you take home Rs 19,382.",
    SANJAY,
  );
  assert.equal(ok.ok, true);
});

test("an INVENTED figure is rejected, however plausible", () => {
  const r = checkPayslipGrounding("Your provident fund of Rs 1,265 was worked out on Rs 10,500.", SANJAY);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /ungrounded_number:1,265/);
});

test("a small invented number is caught too — this is the failure a 3B model produced", () => {
  const r = checkPayslipGrounding("There are 12 components on this payslip totalling Rs 21,000.", SANJAY);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /ungrounded_number:12/);
});

test("ADVICE is refused: a Tier-3 feature explains, it never tells the employee what to do", () => {
  for (const bad of [
    "Your net pay is Rs 19,382. You should contact HR if this looks low.",
    "Rs 750 was added back. We recommend you check your allowance structure.",
    "Please contact your payroll officer about the Rs 1,260 deduction.",
  ]) {
    const r = checkPayslipGrounding(bad, SANJAY);
    assert.equal(r.ok, false, bad);
    assert.match(r.reason ?? "", /gave_advice/);
  }
});

test("a JUDGEMENT about correctness is refused — that sentence is a legal event", () => {
  for (const bad of [
    "Your provident fund of Rs 1,260 appears to be incorrect.",
    "You have been underpaid by Rs 750 this month.",
    "There is a discrepancy of Rs 750 in your wages.",
  ]) {
    const r = checkPayslipGrounding(bad, SANJAY);
    assert.equal(r.ok, false, bad);
    assert.match(r.reason ?? "", /judged_correctness/);
  }
});

test("internal vocabulary never reaches an employee", () => {
  const r = checkPayslipGrounding("The deemed_wages field is Rs 10,500.", SANJAY);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /internal_jargon/);
});

test("a truncated sentence with a dangling quote is refused", () => {
  const r = checkPayslipGrounding('Allowances outside "wages came to Rs 11,250.', SANJAY);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /unbalanced_quotes/);
});

test("an empty or runaway reply is refused", () => {
  assert.equal(checkPayslipGrounding("   ", SANJAY).ok, false);
  assert.equal(checkPayslipGrounding("Rs 21,000. ".repeat(200), SANJAY).ok, false);
});

test("the same figure is accepted however it is formatted", () => {
  for (const form of ["21000", "21,000", "21000.00"]) {
    assert.equal(checkPayslipGrounding(`Your gross was Rs ${form}.`, SANJAY).ok, true, form);
  }
});
