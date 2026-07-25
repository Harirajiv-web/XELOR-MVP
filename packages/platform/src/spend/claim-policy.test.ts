import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageAdvances,
  advanceBalance,
  canRequestAdvance,
  evaluateClaimPolicy,
  isOverdue,
  perDiemEntitlement,
  planSettlement,
  resolvePerDiem,
  type AdvanceState,
  type PerDiemRate,
} from "./claim-policy.js";

const RATES: PerDiemRate[] = [
  { gradeCode: "MGR", cityTier: "A", tripType: "domestic", dailyRate: 1800, effectiveFrom: "2026-04-01" },
  { gradeCode: "MGR", cityTier: "B", tripType: "domestic", dailyRate: 1400, effectiveFrom: "2026-04-01" },
  { gradeCode: "ENG", cityTier: "A", tripType: "domestic", dailyRate: 1400, effectiveFrom: "2026-04-01" },
  // An October revision, seeded so the as-of rule has something to prove.
  { gradeCode: "MGR", cityTier: "A", tripType: "domestic", dailyRate: 2000, effectiveFrom: "2026-10-01" },
];

/* --------------------------------- per diem -------------------------------- */

test("the rate is resolved as of the EXPENSE date, so an October revision cannot restate a July trip", () => {
  assert.equal(resolvePerDiem(RATES, { gradeCode: "MGR", cityTier: "A" }, "2026-07-06")!.dailyRate, 1800);
  assert.equal(resolvePerDiem(RATES, { gradeCode: "MGR", cityTier: "A" }, "2026-11-06")!.dailyRate, 2000);
});

test("days are counted inclusively — Monday to Wednesday is three days, and they ate on all three", () => {
  const e = perDiemEntitlement(RATES, { gradeCode: "MGR", cityTier: "A" }, "2026-07-06", "2026-07-08");
  assert.equal(e!.days, 3);
  assert.equal(e!.entitlement, 5400);
  assert.match(e!.rateRef, /^MGR\/A\/domestic@2026-04-01$/, "the exact rate row is recorded for audit");
});

test("a single-day trip is one day, not zero", () => {
  assert.equal(perDiemEntitlement(RATES, { gradeCode: "ENG", cityTier: "A" }, "2026-07-06", "2026-07-06")!.days, 1);
});

test("a grade and tier with no rate returns nothing rather than a default", () => {
  assert.equal(perDiemEntitlement(RATES, { gradeCode: "OPR", cityTier: "C" }, "2026-07-06", "2026-07-08"), null);
});

/* ------------------------------- claim policy ------------------------------ */

const line = (o: Partial<Parameters<typeof evaluateClaimPolicy>[0]["lines"][number]> = {}) => ({
  lineNo: 1,
  expenseHeadCode: "EH-TRV-HTL",
  expenseDate: "2026-07-06",
  amount: 7080,
  hasReceipt: true,
  receiptThreshold: 0,
  reimbursableType: "bill_backed" as const,
  ...o,
});

test("a missing receipt above the head's threshold is a WARNING for the approver, not a refusal", () => {
  const flags = evaluateClaimPolicy({
    claimDate: "2026-07-08",
    submittedOn: "2026-07-08",
    lines: [line({ hasReceipt: false, receiptThreshold: 500, amount: 1200 })],
  });
  const f = flags.find((x) => x.code === "MISSING_RECEIPT");
  assert.ok(f);
  assert.equal(f!.severity, "warn", "the approver can see context the software cannot");
  assert.match(f!.message, /above the ₹500 receipt threshold/);
});

test("an amount UNDER the threshold needs no receipt", () => {
  const flags = evaluateClaimPolicy({
    claimDate: "2026-07-08",
    submittedOn: "2026-07-08",
    lines: [line({ hasReceipt: false, receiptThreshold: 500, amount: 480 })],
  });
  assert.equal(flags.filter((f) => f.code === "MISSING_RECEIPT").length, 0);
});

test("per-diem above the ceiling flags a possible taxable perquisite rather than blocking pay", () => {
  const flags = evaluateClaimPolicy({
    claimDate: "2026-07-08",
    submittedOn: "2026-07-08",
    lines: [line({ reimbursableType: "allowance", amount: 2200, perDiemCeiling: 1800, expenseHeadCode: "EH-TRV-PDM" })],
  });
  const f = flags.find((x) => x.code === "PER_DIEM_EXCEEDED");
  assert.ok(f);
  assert.match(f!.message, /may be a taxable perquisite/);
});

test("a stale expense is flagged; a future-dated one is BLOCKED", () => {
  const stale = evaluateClaimPolicy({
    claimDate: "2026-07-08",
    submittedOn: "2026-09-20",
    lines: [line({ expenseDate: "2026-05-01" })],
  });
  assert.equal(stale.find((f) => f.code === "STALE_EXPENSE")!.severity, "warn");

  const future = evaluateClaimPolicy({
    claimDate: "2026-07-08",
    submittedOn: "2026-07-08",
    lines: [line({ expenseDate: "2026-07-20" })],
  });
  assert.equal(future.find((f) => f.code === "FUTURE_DATED")!.severity, "block", "a receipt from next week is not a receipt");
});

test("a Sunday expense is INFORMATIONAL — weekend work is ordinary in a factory", () => {
  const flags = evaluateClaimPolicy({
    claimDate: "2026-07-13",
    submittedOn: "2026-07-13",
    lines: [line({ expenseDate: "2026-07-12" })], // a Sunday
  });
  assert.equal(flags.find((f) => f.code === "NON_WORKING_DAY")!.severity, "info");
});

test("a clean claim raises nothing at all", () => {
  assert.deepEqual(
    evaluateClaimPolicy({ claimDate: "2026-07-08", submittedOn: "2026-07-08", lines: [line()] }),
    [],
  );
});

/* -------------------------------- advances --------------------------------- */

const ADV: AdvanceState = {
  advanceNo: "ADV-2627-00003",
  amount: 15000,
  paidAmount: 15000,
  settledAmount: 0,
  refundedAmount: 0,
  settleBy: "2026-07-20",
  status: "disbursed",
};

test("the module's ONE hard block: a new advance while an old one is overdue", () => {
  const r = canRequestAdvance([ADV], "2026-07-25");
  assert.equal(r.allowed, false);
  assert.equal(r.code, "ADVANCE_OVERDUE_BLOCK");
  assert.match(r.reason, /ADV-2627-00003 \(₹15,000 since 2026-07-20\)/);
});

test("before the settle-by date there is no block", () => {
  assert.equal(canRequestAdvance([ADV], "2026-07-18").allowed, true);
});

test("the block is overridable, and the override is recorded", () => {
  const r = canRequestAdvance([ADV], "2026-07-25", {
    hasOverridePermission: true,
    overrideReason: "Customer escalation in Chennai; settlement in progress.",
  });
  assert.equal(r.allowed, true);
  assert.equal(r.overridden, true);
  assert.match(r.reason, /Customer escalation in Chennai/);
});

test("an override without a reason is not an override", () => {
  assert.equal(canRequestAdvance([ADV], "2026-07-25", { hasOverridePermission: true }).allowed, false);
});

/* ------------------------------- settlement -------------------------------- */

test("the demo's settlement: ₹13,650 claimed against a ₹15,000 advance leaves ₹1,350 refundable", () => {
  const p = planSettlement(ADV, 13650);
  assert.equal(p.adjustedAgainstClaim, 13650);
  assert.equal(p.refundDue, 1350);
  assert.equal(p.reimburseDue, 0);
  assert.equal(p.newStatus, "partially_settled");
  assert.match(p.explanation, /₹1,350 is refundable by the employee/);
});

test("a claim larger than the advance reimburses the difference — never a negative payout", () => {
  const p = planSettlement(ADV, 18000);
  assert.equal(p.adjustedAgainstClaim, 15000);
  assert.equal(p.reimburseDue, 3000);
  assert.equal(p.refundDue, 0);
  assert.equal(p.newStatus, "settled");
});

test("an exact settlement closes it", () => {
  const p = planSettlement(ADV, 15000);
  assert.equal(p.refundDue, 0);
  assert.equal(p.reimburseDue, 0);
  assert.equal(p.newStatus, "settled");
});

test("the balance is what was paid less what came back, and a settled advance is not overdue", () => {
  const partly: AdvanceState = { ...ADV, settledAmount: 13650, status: "partially_settled" };
  assert.equal(advanceBalance(partly), 1350);
  assert.equal(isOverdue(partly, "2026-07-25"), true);

  const done: AdvanceState = { ...partly, refundedAmount: 1350, status: "settled" };
  assert.equal(advanceBalance(done), 0);
  assert.equal(isOverdue(done, "2026-12-25"), false, "a zero balance is never overdue, whatever the date");
});

test("ageing buckets outstanding advances by how far past their settle-by date they are", () => {
  const buckets = ageAdvances(
    [
      { ...ADV, advanceNo: "A1", settleBy: "2026-07-30" },
      { ...ADV, advanceNo: "A2", settleBy: "2026-07-10" },
      { ...ADV, advanceNo: "A3", settleBy: "2026-06-20" },
      { ...ADV, advanceNo: "A5", settleBy: "2026-05-01" },
      { ...ADV, advanceNo: "A4", settledAmount: 15000 },
    ],
    "2026-07-25",
  );
  assert.equal(buckets.current.count, 1);
  assert.equal(buckets["1-30"].count, 1);
  assert.equal(buckets["31-60"].count, 1, "35 days past its date");
  assert.equal(buckets["60+"].count, 1, "85 days past its date");
  assert.equal(buckets.current.amount, 15000);
  assert.equal(
    buckets.current.count + buckets["1-30"].count + buckets["31-60"].count + buckets["60+"].count,
    4,
    "the settled advance is not outstanding",
  );
});
