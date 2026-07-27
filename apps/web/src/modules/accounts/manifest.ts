import type { ModuleManifest } from "@spine/registry/manifest";

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
};
