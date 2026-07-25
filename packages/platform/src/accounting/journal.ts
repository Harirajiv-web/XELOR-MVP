/**
 * The pure LEDGER brain (ACCOUNTS §9.4). Double-entry is arithmetic, so it lives here:
 * DB-free, deterministic, and identical in the live service and in a test.
 *
 * THE governing rule of the module (ACCOUNTS §1.3): **never re-post what a sibling already
 * valued.** If Inventory says the FIFO consumption was ₹4,650, the ledger says ₹4,650.
 * Accounts validates that a journal BALANCES, that its period is OPEN, that its accounts
 * EXIST and are POSTABLE, and that the instruction is NOT A DUPLICATE. It does not
 * second-guess a sibling's arithmetic and never silently "corrects" it.
 *
 * Everything here therefore takes amounts as GIVEN and only checks their shape.
 */

export interface JournalLineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
  memo?: string;
  /** Dimensions carried on the line so registers are queries, not reconstructions. */
  customerRef?: string | null;
  vendorRef?: string | null;
  taxHead?: "cgst" | "sgst" | "igst" | "cess" | null;
  taxDirection?: "input" | "output" | "rcm" | null;
  hsnSac?: string | null;
}

export interface JournalValidation {
  ok: boolean;
  totalDebit: number;
  totalCredit: number;
  reason?: string;
}

// Not re-exported: the canonical `round2` for the platform lives in tax/gst.ts. Same
// arithmetic, one public name.
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Money compares to the paisa. Anything finer is a rounding artefact, not a difference. */
const PAISA = 0.005;

/**
 * A journal is well-formed when it has at least two lines, every line is on exactly one
 * side, no amount is negative, and the debits equal the credits. This is the same
 * assertion the database makes with a DEFERRED constraint trigger — belt and braces, on
 * purpose: the check here gives a readable error, the trigger makes it impossible.
 */
export function validateJournal(lines: JournalLineInput[]): JournalValidation {
  let totalDebit = 0;
  let totalCredit = 0;

  if (lines.length < 2) {
    return { ok: false, totalDebit: 0, totalCredit: 0, reason: "a journal needs at least two lines" };
  }

  for (const [i, l] of lines.entries()) {
    const d = l.debit ?? 0;
    const c = l.credit ?? 0;
    if (!Number.isFinite(d) || !Number.isFinite(c)) {
      return { ok: false, totalDebit, totalCredit, reason: `line ${i + 1}: amounts must be numbers` };
    }
    if (d < 0 || c < 0) {
      // A negative debit is a credit wearing a disguise; it hides the direction of a
      // posting from every report that sums a column.
      return { ok: false, totalDebit, totalCredit, reason: `line ${i + 1}: amounts cannot be negative` };
    }
    if (d > 0 && c > 0) {
      return { ok: false, totalDebit, totalCredit, reason: `line ${i + 1}: a line is debit OR credit, never both` };
    }
    if (d === 0 && c === 0) {
      return { ok: false, totalDebit, totalCredit, reason: `line ${i + 1}: a zero line posts nothing` };
    }
    if (!l.accountCode) {
      return { ok: false, totalDebit, totalCredit, reason: `line ${i + 1}: accountCode is required` };
    }
    totalDebit = round2(totalDebit + d);
    totalCredit = round2(totalCredit + c);
  }

  if (Math.abs(totalDebit - totalCredit) > PAISA) {
    return {
      ok: false,
      totalDebit,
      totalCredit,
      reason: `journal does not balance: debits ${totalDebit.toFixed(2)} vs credits ${totalCredit.toFixed(2)}`,
    };
  }
  return { ok: true, totalDebit, totalCredit };
}

/**
 * Correction is REVERSAL, never mutation (FR-ACC-006). The reversal is the same lines with
 * the sides swapped, so the pair nets to zero and both remain visible forever.
 */
export function reverseLines(lines: JournalLineInput[]): JournalLineInput[] {
  return lines.map((l) => ({
    ...l,
    debit: l.credit ?? 0,
    credit: l.debit ?? 0,
    memo: l.memo ? `reversal of: ${l.memo}` : "reversal",
  }));
}

/* -------------------------------------------------------------------------- */
/* Journal shapes. Amounts arrive already valued by the owning module.         */
/* -------------------------------------------------------------------------- */

export interface InvoiceAccounts {
  receivable: string; // e.g. 1310 Trade Receivables
  revenue: string; // 4010 Sales - Manufactured Goods
  outputCgst: string;
  outputSgst: string;
  outputIgst: string;
}

export interface SalesInvoiceAmounts {
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff?: number;
  grossReceivable: number;
}

/**
 * The sales invoice: Dr Trade Receivables (gross) / Cr Revenue (taxable) + Cr each output
 * tax head that actually applies. The rate-wise split arrives from SMBD — Accounts records
 * the tax, it does not decide it.
 *
 * A rupee round-off (SMBD rounds the invoice total to the rupee) is posted to the revenue
 * side so the voucher balances to the paisa without disturbing the tax figures, which must
 * tie exactly to the GST return.
 */
export function buildSalesInvoiceJournal(input: {
  amounts: SalesInvoiceAmounts;
  accounts: InvoiceAccounts;
  customerRef: string;
  invoiceNo: string;
  roundOffAccount?: string;
}): JournalLineInput[] {
  const { amounts: a, accounts, customerRef, invoiceNo } = input;
  const lines: JournalLineInput[] = [
    {
      accountCode: accounts.receivable,
      debit: round2(a.grossReceivable),
      customerRef,
      memo: `${invoiceNo} receivable`,
    },
    { accountCode: accounts.revenue, credit: round2(a.taxableValue), customerRef, memo: `${invoiceNo} revenue` },
  ];
  const tax = (code: string, amount: number, head: "cgst" | "sgst" | "igst"): void => {
    if (round2(amount) > 0) {
      lines.push({
        accountCode: code,
        credit: round2(amount),
        customerRef,
        taxHead: head,
        taxDirection: "output",
        memo: `${invoiceNo} output ${head.toUpperCase()}`,
      });
    }
  };
  tax(accounts.outputCgst, a.cgst, "cgst");
  tax(accounts.outputSgst, a.sgst, "sgst");
  tax(accounts.outputIgst, a.igst, "igst");

  const roundOff = round2(a.roundOff ?? 0);
  if (roundOff !== 0 && input.roundOffAccount) {
    // grand = taxable + tax + roundOff, so a POSITIVE round-off is extra income.
    if (roundOff > 0) lines.push({ accountCode: input.roundOffAccount, credit: roundOff, memo: `${invoiceNo} round-off` });
    else lines.push({ accountCode: input.roundOffAccount, debit: -roundOff, memo: `${invoiceNo} round-off` });
  }
  return lines;
}

/** A customer receipt: Dr Bank / Cr Trade Receivables. */
export function buildReceiptJournal(input: {
  amount: number;
  bankAccount: string;
  receivableAccount: string;
  customerRef: string;
  reference: string;
}): JournalLineInput[] {
  return [
    { accountCode: input.bankAccount, debit: round2(input.amount), memo: `${input.reference} received` },
    {
      accountCode: input.receivableAccount,
      credit: round2(input.amount),
      customerRef: input.customerRef,
      memo: `${input.reference} settled`,
    },
  ];
}

/* -------------------------------------------------------------------------- */

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  debit: number;
  credit: number;
  /** Net in the account's NATURAL direction: positive means a normal balance. */
  balance: number;
}

/** Assets and expenses are debit-natured; liabilities, equity and income are credit-natured. */
export function naturalBalance(type: AccountType, debit: number, credit: number): number {
  return type === "asset" || type === "expense" ? round2(debit - credit) : round2(credit - debit);
}

/** A trial balance is in balance when total debits equal total credits — always, by construction. */
export function trialBalanceTotals(rows: TrialBalanceRow[]): {
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
} {
  const totalDebit = round2(rows.reduce((a, r) => a + r.debit, 0));
  const totalCredit = round2(rows.reduce((a, r) => a + r.credit, 0));
  return { totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) <= PAISA };
}
