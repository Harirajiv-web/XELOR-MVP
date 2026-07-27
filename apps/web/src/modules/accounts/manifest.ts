import { date, inr, inrShort, num } from "@spine/format";
import type { ModuleManifest } from "@spine/registry/manifest";
import { accountsApi } from "./api";

/**
 * ACCOUNTS (RASP, Module 08).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles, runs, and has one fewer item in
 * the sidebar — no route file to clean up, no navigation array to edit, no import left
 * dangling anywhere else.
 *
 * `"trial-balance"` is quoted because a hyphen is not legal in an unquoted JavaScript object
 * key. `module-check` accepts the quotes, so the URL is the one an accountant would expect
 * to see rather than one bent around a parser.
 */

/* ------------------------------ dashboard signals ------------------------------ */

interface TrialBalanceHead {
  asOf: string | null;
  accounts: number;
  totalDebit: number;
  totalCredit: number;
  /** null when the server did not say. The tile then decides from the two totals alone. */
  balanced: boolean | null;
}

/**
 * The trial balance, narrowed from `unknown`.
 *
 * Only the fields a tile may read, and each is checked to be the type it claims. A signal
 * runs against whatever the endpoint actually returned, so anything that is not
 * recognisably a trial balance returns null and the tile silently does not appear — a
 * decorative figure must never break the page it decorates, and a WRONG figure about
 * whether the ledger foots would be worse than no figure at all.
 */
function trialBalanceOf(data: unknown): TrialBalanceHead | null {
  if (data === null || typeof data !== "object") return null;
  const o = data as {
    asOf?: unknown;
    rows?: unknown;
    totalDebit?: unknown;
    totalCredit?: unknown;
    balanced?: unknown;
  };
  if (typeof o.totalDebit !== "number" || !Number.isFinite(o.totalDebit)) return null;
  if (typeof o.totalCredit !== "number" || !Number.isFinite(o.totalCredit)) return null;
  return {
    asOf: typeof o.asOf === "string" ? o.asOf : null,
    accounts: Array.isArray(o.rows) ? o.rows.length : 0,
    totalDebit: o.totalDebit,
    totalCredit: o.totalCredit,
    balanced: typeof o.balanced === "boolean" ? o.balanced : null,
  };
}

/** The cursor envelope, in both spellings, plus a bare array. */
function rowsOf(data: unknown): readonly unknown[] | null {
  if (Array.isArray(data)) return data;
  if (data !== null && typeof data === "object") {
    const o = data as { items?: unknown; data?: unknown };
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return null;
}

export const accountsManifest: ModuleManifest = {
  key: "accounts",
  name: "Accounts",
  summary: "The general ledger: every posted voucher, and the trial balance they add up to.",
  department: "RASP",
  icon: "Landmark",
  licenceKey: "accounts",
  order: 70,
  nav: [
    {
      label: "Trial balance",
      path: "trial-balance",
      permission: "accounts.ledger.read",
      icon: "BookOpen",
    },
    {
      label: "Vouchers",
      path: "vouchers",
      permission: "accounts.ledger.read",
      icon: "ReceiptText",
    },
    {
      // Reached by clicking a row on Vouchers, and from links carrying a voucher id in
      // other modules — which is where most vouchers are born. Routable, never in the sidebar.
      label: "Voucher",
      path: "voucher",
      permission: "accounts.ledger.read",
      hidden: true,
    },
  ],
  screens: {
    "trial-balance": () => import("./screens/trial-balance"),
    vouchers: () => import("./screens/vouchers"),
    voucher: () => import("./screens/voucher"),
  },
  /**
   * WHETHER THE LEDGER FOOTS IS THE FIRST THING AN ACCOUNTANT CHECKS, so it is the first
   * thing this module volunteers. It balances by construction — every voucher is validated
   * balanced before it is written and the database asserts it again at COMMIT — which is
   * exactly why showing it is worth doing: the tile is a visible check on a promise that is
   * already enforced twice, not a hopeful calculation.
   *
   * The as-at date is named on the tile. A financial figure without the date it was struck
   * at is a figure somebody will quote at the wrong meeting.
   */
  signals: [
    {
      label: "Ledger",
      permission: "accounts.ledger.read",
      path: accountsApi.trialBalancePath,
      query: { asOf: accountsApi.demoToday },
      reduce: (data) => {
        const tb = trialBalanceOf(data);
        if (tb === null) return null;
        // Nothing posted on or before the date. "Balanced" over an empty ledger is
        // technically true and reads as a system going through the motions.
        if (tb.accounts === 0) return null;
        // Rounded to the paisa, which is the unit NUMERIC(18,2) actually stores.
        const difference = Math.round((tb.totalDebit - tb.totalCredit) * 100) / 100;
        // The server's verdict and this one have to agree. If they ever disagree, that is
        // itself the fault, and the honest thing to show is the difference, not the word.
        const foots = difference === 0 && tb.balanced !== false;
        const asAt = tb.asOf === null ? "" : ` as at ${date(tb.asOf)}`;
        return foots
          ? { value: "Balanced", hint: `Debits equal credits${asAt}`, tone: "ok" }
          : {
              // Full precision, never abbreviated: an out-of-balance ledger is reconciled
              // to the paisa or it is not reconciled.
              value: inr(Math.abs(difference)),
              hint: `Debits less credits${asAt} — report it, do not adjust it`,
              tone: "bad",
            };
      },
    },
    {
      label: "Posted",
      permission: "accounts.ledger.read",
      path: accountsApi.trialBalancePath,
      query: { asOf: accountsApi.demoToday },
      reduce: (data) => {
        const tb = trialBalanceOf(data);
        if (tb === null || tb.accounts === 0) return null;
        return {
          // Abbreviated for the tile, with the exact figure written out underneath it. An
          // abbreviation that is the only representation of a number cannot be checked.
          value: inrShort(tb.totalDebit),
          hint: `${inr(tb.totalDebit)} debited across ${num(tb.accounts)} account${tb.accounts === 1 ? "" : "s"}`,
          tone: "neutral",
        };
      },
    },
    {
      label: "Vouchers",
      permission: "accounts.ledger.read",
      path: accountsApi.vouchersPath,
      // 100 is the API's ceiling; past it the figure is a page rather than a register, and
      // the tile says "100+" rather than quietly reporting the ledger as smaller than it is.
      query: { limit: 100 },
      reduce: (data) => {
        const rows = rowsOf(data);
        if (rows === null) return null;
        const more =
          data !== null &&
          typeof data === "object" &&
          typeof (data as { nextCursor?: unknown }).nextCursor === "string";
        const reversed = rows.filter(
          (r) => r !== null && typeof r === "object" && (r as { status?: unknown }).status === "reversed",
        ).length;
        return {
          value: more ? `${num(rows.length)}+` : num(rows.length),
          // A reversal is how the ledger corrects itself — both rows survive, nothing is
          // erased — so the count is normal bookkeeping and never a warning colour.
          hint: reversed > 0 ? `${num(reversed)} since reversed` : "In the register, newest first",
          tone: "neutral",
        };
      },
    },
  ],
};
