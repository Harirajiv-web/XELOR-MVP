import { test } from "node:test";
import assert from "node:assert/strict";
import {
  availability,
  budgetedFor,
  checkBudget,
  evenDistribution,
  fiscalYearOf,
  periodOf,
  revisionConflicts,
  validateDistribution,
  type BudgetLineSpec,
  type ConsumptionEntry,
} from "./budget.js";

const MRO: BudgetLineSpec = {
  id: "line-mro",
  expenseHeadCode: "EH-MRO-SPR",
  annualAmount: 720000,
  monthlyDistribution: Array.from({ length: 12 }, () => 60000),
  controlAction: "stop",
  basis: "monthly",
};

const TRAVEL: BudgetLineSpec = { ...MRO, id: "line-trv", expenseHeadCode: "EH-TRV-AIR", controlAction: "warn" };
const RENT: BudgetLineSpec = { ...MRO, id: "line-rnt", expenseHeadCode: "EH-RNT-FAC", controlAction: "ignore" };

const entry = (bucket: ConsumptionEntry["bucket"], amount: number, period = 4): ConsumptionEntry => ({
  bucket,
  amount,
  period,
  entryType: amount < 0 ? "reverse" : "reserve",
});

/* --------------------------- the financial year ---------------------------- */

test("April is period 1 and March is period 12 — the Indian financial year, not the calendar", () => {
  assert.equal(periodOf("2026-04-01"), 1);
  assert.equal(periodOf("2026-07-20"), 4);
  assert.equal(periodOf("2027-03-31"), 12);
  assert.equal(fiscalYearOf("2026-07-20"), "2627");
  assert.equal(fiscalYearOf("2026-03-31"), "2526", "March belongs to the year that started the previous April");
});

/* ----------------------------- availability -------------------------------- */

test("availability subtracts money that is committed and money still in an inbox, not just money spent", () => {
  const a = availability(MRO, [entry("actual", 20000), entry("committed", 15000), entry("in_approval", 5000)], 4);
  assert.equal(a.budgeted, 60000);
  assert.equal(a.available, 20000);
  assert.equal(
    a.consumedFraction,
    0.67,
    "a report that counted only the 20,000 posted would say 67% was still available",
  );
});

test("a reversal is a signed row, so rejecting a claim gives the budget back without an update", () => {
  const a = availability(MRO, [entry("in_approval", 25000), entry("in_approval", -25000)], 4);
  assert.equal(a.inApproval, 0);
  assert.equal(a.available, 60000);
});

test("cumulative basis compares a year-to-date allowance against year-to-date spend, not one month's", () => {
  const cumulative: BudgetLineSpec = { ...MRO, basis: "cumulative" };
  const entries = [entry("actual", 50000, 1), entry("actual", 50000, 2), entry("actual", 50000, 3), entry("actual", 40000, 4)];
  const a = availability(cumulative, entries, 4);
  assert.equal(budgetedFor(cumulative, 4), 240000);
  assert.equal(a.actual, 190000, "all four months of spend, matching all four months of budget");
  assert.equal(a.available, 50000, "an April underspend is still available in July under this basis");
});

test("a zero budget with spend against it is fully consumed, not a division by zero", () => {
  const zero: BudgetLineSpec = { ...MRO, monthlyDistribution: Array.from({ length: 12 }, () => 0) };
  assert.equal(availability(zero, [entry("actual", 1)], 4).consumedFraction, Infinity);
  assert.equal(availability(zero, [], 4).consumedFraction, 0);
});

/* ------------------------------ the three actions -------------------------- */

test("a STOP head refuses, and the refusal carries the shortfall and who can override it", () => {
  const r = checkBudget({ line: MRO, entries: [entry("actual", 58000)], period: 4, requested: 80000 });
  assert.equal(r.decision, "block");
  assert.equal(r.availability.available, 2000);
  assert.equal(r.shortfall, 78000);
  assert.deepEqual(r.overrideRoles, ["finance_controller", "cfo"]);
  assert.match(r.reason, /Over budget by ₹78,000/);
});

test("the same request passes for someone holding the override, and is marked as overridden", () => {
  const r = checkBudget({
    line: MRO,
    entries: [entry("actual", 58000)],
    period: 4,
    requested: 80000,
    callerCanOverride: true,
  });
  assert.equal(r.decision, "allow");
  assert.equal(r.overridden, true, "the caller must record a reason — the flag is what forces that");
});

test("a WARN head allows and says so; an IGNORE head allows quietly", () => {
  const warn = checkBudget({ line: TRAVEL, entries: [entry("actual", 58000)], period: 4, requested: 80000 });
  assert.equal(warn.decision, "warn");
  assert.equal(warn.shortfall, 78000);
  assert.match(warn.reason, /cost-centre owner is notified/);

  const ignore = checkBudget({ line: RENT, entries: [entry("actual", 58000)], period: 4, requested: 80000 });
  assert.equal(ignore.decision, "allow");
  assert.match(ignore.reason, /not budget-controlled/);
});

test("exactly at the line is allowed — the boundary is inclusive, not a rounding accident", () => {
  const r = checkBudget({ line: MRO, entries: [entry("actual", 10000)], period: 4, requested: 50000 });
  assert.equal(r.decision, "allow");
  assert.equal(r.availability.available, 50000);
  assert.equal(r.shortfall, 0);
});

test("the July demo arc: 80,000 is stopped with 58,000 spent, and passes after the budget is revised", () => {
  const before = checkBudget({ line: MRO, entries: [entry("actual", 58000)], period: 4, requested: 80000 });
  assert.equal(before.decision, "block");

  // Revision v2 adds ₹1,20,000 to the annual line — ₹10,000 a month.
  const revised: BudgetLineSpec = {
    ...MRO,
    annualAmount: 840000,
    monthlyDistribution: Array.from({ length: 12 }, () => 70000),
  };
  const after = checkBudget({ line: revised, entries: [entry("actual", 58000)], period: 4, requested: 12000 });
  assert.equal(after.decision, "allow", "12,000 fits the revised 70,000 line with 58,000 already spent");
});

/* -------------------------------- revisions -------------------------------- */

test("a revision cutting a line below what is already SPENT is returned as a conflict, not refused", () => {
  const conflicts = revisionConflicts(
    [{ line: MRO, newAnnualAmount: 240000, newMonthlyDistribution: Array.from({ length: 12 }, () => 20000) }],
    { "line-mro": [entry("actual", 200000, 1), entry("committed", 100000, 2)] },
    4,
  );
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]!.alreadyConsumed, 300000);
  assert.equal(conflicts[0]!.overCommitBy, 60000, "the money is gone; the budget must be allowed to record that");
});

test("money still sitting in an approval inbox does NOT block a revision — it can still be rejected", () => {
  const conflicts = revisionConflicts(
    [{ line: MRO, newAnnualAmount: 240000, newMonthlyDistribution: Array.from({ length: 12 }, () => 20000) }],
    { "line-mro": [entry("in_approval", 500000, 1)] },
    4,
  );
  assert.deepEqual(conflicts, []);
});

/* ------------------------------ distribution ------------------------------- */

test("the monthly cells must sum to the annual figure", () => {
  assert.equal(validateDistribution(720000, Array.from({ length: 12 }, () => 60000)).ok, true);
  const bad = validateDistribution(720000, Array.from({ length: 12 }, () => 60001));
  assert.equal(bad.ok, false);
  assert.match(bad.reason!, /sum to ₹7,20,012 but the annual amount is ₹7,20,000/);
  assert.equal(validateDistribution(100, [10]).ok, false, "twelve cells, always");
  assert.equal(validateDistribution(100, Array.from({ length: 12 }, () => -1)).ok, false);
});

test("an even split puts the rounding remainder in March so the cells still add up exactly", () => {
  const cells = evenDistribution(100000);
  assert.equal(cells.length, 12);
  assert.equal(validateDistribution(100000, cells).ok, true);
  assert.equal(cells[0], 8333.33);
  // 100000 - 8333.33*11 is 8333.369999999995 in binary floating point. The code rounds to
  // paise, which is the only representation a ledger can carry — so the assertion compares
  // the rounded value rather than re-deriving the artefact.
  assert.equal(cells[11], 8333.37);
});
