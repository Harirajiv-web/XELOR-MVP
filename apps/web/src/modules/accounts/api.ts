/**
 * Accounts' own slice of the API. Nothing outside this folder imports it, and it imports
 * nothing from another module — which is what makes the folder deletable.
 */

/** Assets and expenses are debit-natured; liabilities, equity and income are credit-natured. */
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

/**
 * `GET /accounts/trial-balance?asOf=YYYY-MM-DD`. `balanced` is computed on the server to the
 * paisa and is shown rather than assumed — a trial balance that does not visibly foot is the
 * first thing an accountant checks, and the fastest way to lose them.
 *
 * `asOf` is echoed back by the API. The screen displays THAT rather than the date it asked
 * for, so a report can never be labelled with one date and footed to another.
 */
export interface TrialBalance {
  asOf: string;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

/** One row of `GET /accounts/vouchers` — the header only. Lines live on the detail read. */
export interface VoucherSummary {
  id: string;
  voucherNo: string;
  voucherType: string;
  postingDate: string;
  status: string;
  narration: string | null;
  totalDebit: string;
  totalCredit: string;
  /** Which sibling module produced this, or null when somebody keyed it in by hand. */
  sourceModule: string | null;
}

export interface VoucherLine {
  lineNo: number;
  accountCode: string;
  /** NUMERIC(18,2) crosses the wire as a string; it stays a string until it is formatted. */
  debit: string;
  credit: string;
  customerRef: string | null;
  taxHead: string | null;
  taxDirection: string | null;
  memo: string | null;
}

export interface Voucher {
  id: string;
  voucherNo: string;
  voucherType: string;
  postingDate: string;
  /** `posted` or `reversed` — the only two columns a posted voucher may ever change. */
  status: string;
  narration: string | null;
  totalDebit: string;
  totalCredit: string;
  /** This voucher corrects that one — set on a reversal. */
  reversesVoucherId: string | null;
  /** That voucher corrects this one — set on the original once it has been reversed. */
  reversedByVoucherId: string | null;
  /** Why the correction was made. Carried by the reversal, never by the original. */
  reversalReason: string | null;
  lines: VoucherLine[];
}

export const accountsApi = {
  trialBalancePath: "/accounts/trial-balance",
  vouchersPath: "/accounts/vouchers",
  voucherPath: (id: string) => `/accounts/vouchers/${id}`,
  /** The demo world's today. An as-at date is required of any trial balance worth reading. */
  demoToday: "2026-07-20",
} as const;
