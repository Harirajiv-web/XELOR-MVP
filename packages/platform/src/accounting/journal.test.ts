import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReceiptJournal,
  buildSalesInvoiceJournal,
  naturalBalance,
  reverseLines,
  trialBalanceTotals,
  validateJournal,
  type JournalLineInput,
} from "./journal.js";

const ACC = {
  receivable: "1310",
  revenue: "4010",
  outputCgst: "2311",
  outputSgst: "2312",
  outputIgst: "2313",
};
const CUST = "0192a8c0-0020-7000-8000-000000000001";

/* ------------------------------ double entry ------------------------------ */

test("a balanced two-line journal is valid", () => {
  const v = validateJournal([
    { accountCode: "1310", debit: 1000 },
    { accountCode: "4010", credit: 1000 },
  ]);
  assert.equal(v.ok, true);
  assert.equal(v.totalDebit, 1000);
  assert.equal(v.totalCredit, 1000);
});

test("an unbalanced journal is refused, with the difference stated", () => {
  const v = validateJournal([
    { accountCode: "1310", debit: 1000 },
    { accountCode: "4010", credit: 900 },
  ]);
  assert.equal(v.ok, false);
  assert.match(v.reason ?? "", /does not balance/);
});

test("a single line is not a journal", () => {
  assert.equal(validateJournal([{ accountCode: "1310", debit: 100 }]).ok, false);
});

test("a line is debit OR credit, never both", () => {
  const v = validateJournal([
    { accountCode: "1310", debit: 100, credit: 100 },
    { accountCode: "4010", credit: 100 },
  ]);
  assert.equal(v.ok, false);
  assert.match(v.reason ?? "", /never both/);
});

test("a negative amount is refused — it is a credit in disguise", () => {
  const v = validateJournal([
    { accountCode: "1310", debit: -100 },
    { accountCode: "4010", credit: -100 },
  ]);
  assert.equal(v.ok, false);
  assert.match(v.reason ?? "", /negative/);
});

test("a zero line posts nothing and is refused", () => {
  const v = validateJournal([
    { accountCode: "1310", debit: 0, credit: 0 },
    { accountCode: "4010", credit: 100 },
  ]);
  assert.equal(v.ok, false);
});

test("balance is judged to the paisa, not to floating-point exactness", () => {
  const v = validateJournal([
    { accountCode: "1310", debit: 0.1 + 0.2 }, // 0.30000000000000004
    { accountCode: "4010", credit: 0.3 },
  ]);
  assert.equal(v.ok, true);
});

/* ------------------------------- reversal --------------------------------- */

test("a reversal swaps the sides and still balances", () => {
  const original: JournalLineInput[] = [
    { accountCode: "1310", debit: 1180, memo: "INV-1 receivable" },
    { accountCode: "4010", credit: 1000 },
    { accountCode: "2311", credit: 180 },
  ];
  const rev = reverseLines(original);
  assert.equal(rev[0]!.credit, 1180);
  assert.equal(rev[0]!.debit, 0);
  assert.equal(validateJournal(rev).ok, true);
  // the pair nets to zero — both remain visible forever
  const net = [...original, ...rev].reduce((a, l) => a + (l.debit ?? 0) - (l.credit ?? 0), 0);
  assert.equal(net, 0);
});

/* ---------------------------- the invoice shape --------------------------- */

test("an intra-state invoice credits BOTH half-rate tax heads", () => {
  const lines = buildSalesInvoiceJournal({
    amounts: { taxableValue: 125000, cgst: 11250, sgst: 11250, igst: 0, grossReceivable: 147500 },
    accounts: ACC,
    customerRef: CUST,
    invoiceNo: "INV-1",
  });
  assert.equal(lines.length, 4); // Dr AR, Cr revenue, Cr CGST, Cr SGST
  assert.equal(validateJournal(lines).ok, true);
  assert.deepEqual(
    lines.filter((l) => l.taxDirection === "output").map((l) => l.taxHead),
    ["cgst", "sgst"],
  );
});

test("an inter-state invoice credits IGST alone", () => {
  const lines = buildSalesInvoiceJournal({
    amounts: { taxableValue: 1500000, cgst: 0, sgst: 0, igst: 270000, grossReceivable: 1770000 },
    accounts: ACC,
    customerRef: CUST,
    invoiceNo: "INV-2",
  });
  assert.equal(lines.length, 3);
  assert.equal(validateJournal(lines).ok, true);
  assert.equal(lines[2]!.taxHead, "igst");
});

test("the receivable carries the customer so the AR ledger is a query", () => {
  const lines = buildSalesInvoiceJournal({
    amounts: { taxableValue: 100, cgst: 9, sgst: 9, igst: 0, grossReceivable: 118 },
    accounts: ACC,
    customerRef: CUST,
    invoiceNo: "INV-3",
  });
  assert.equal(lines[0]!.customerRef, CUST);
});

test("a rupee round-off keeps the voucher balanced without touching the tax", () => {
  // taxable 999.99 + 180.00 tax = 1179.99, invoiced at 1180 => +0.01 round-off
  const lines = buildSalesInvoiceJournal({
    amounts: { taxableValue: 999.99, cgst: 90, sgst: 90, igst: 0, roundOff: 0.01, grossReceivable: 1180 },
    accounts: ACC,
    customerRef: CUST,
    invoiceNo: "INV-4",
    roundOffAccount: "4910",
  });
  const v = validateJournal(lines);
  assert.equal(v.ok, true);
  assert.equal(v.totalDebit, 1180);
  // the tax lines are untouched — they must tie exactly to the GST return
  assert.equal(lines.find((l) => l.taxHead === "cgst")!.credit, 90);
});

test("a receipt is Dr bank / Cr receivable", () => {
  const lines = buildReceiptJournal({
    amount: 147500,
    bankAccount: "1210",
    receivableAccount: "1310",
    customerRef: CUST,
    reference: "RCPT-1",
  });
  assert.equal(validateJournal(lines).ok, true);
  assert.equal(lines[0]!.debit, 147500);
  assert.equal(lines[1]!.credit, 147500);
});

/* ---------------------------- the trial balance --------------------------- */

test("natural balance follows the account's side", () => {
  assert.equal(naturalBalance("asset", 1000, 200), 800);
  assert.equal(naturalBalance("expense", 500, 0), 500);
  assert.equal(naturalBalance("income", 0, 1000), 1000);
  assert.equal(naturalBalance("liability", 100, 900), 800);
});

test("a trial balance built from balanced vouchers is itself balanced", () => {
  const rows = [
    { accountCode: "1310", accountName: "AR", accountType: "asset" as const, debit: 1180, credit: 0, balance: 1180 },
    { accountCode: "4010", accountName: "Sales", accountType: "income" as const, debit: 0, credit: 1000, balance: 1000 },
    { accountCode: "2311", accountName: "CGST", accountType: "liability" as const, debit: 0, credit: 90, balance: 90 },
    { accountCode: "2312", accountName: "SGST", accountType: "liability" as const, debit: 0, credit: 90, balance: 90 },
  ];
  const t = trialBalanceTotals(rows);
  assert.equal(t.balanced, true);
  assert.equal(t.totalDebit, 1180);
  assert.equal(t.totalCredit, 1180);
});
