import type { ModuleManifest, SignalValue } from "@spine/registry/manifest";
import { inrShort } from "@spine/format";
import type { ExpenseClaim } from "./api";

function claimsOf(data: unknown): ExpenseClaim[] | null {
  if (!Array.isArray(data)) return null;
  return data.every((row) => typeof row === "object" && row !== null && typeof (row as ExpenseClaim).claimNo === "string")
    ? data as ExpenseClaim[]
    : null;
}

function awaitingClaims(data: unknown): SignalValue | null {
  const claims = claimsOf(data);
  if (!claims) return null;
  const awaiting = claims.filter((claim) => ["submitted", "in_approval"].includes(claim.status));
  return {
    value: String(awaiting.length),
    hint: awaiting.length === 0 ? "no employee reimbursement waiting" : `${inrShort(awaiting.reduce((sum, claim) => sum + claim.netReimbursable, 0))} awaiting a person`,
    tone: awaiting.length > 0 ? "warn" : "ok",
  };
}

export const expenditureManifest: ModuleManifest = {
  key: "expenditure",
  name: "Employee Spend",
  summary: "Travel and employee claims, with budget, policy, GST credit and approval evidence together.",
  department: "RASP",
  icon: "WalletCards",
  licenceKey: "expenditure",
  order: 69,
  nav: [
    {
      label: "Expense claims",
      path: "claims",
      permission: "expenditure.claim.read",
      icon: "ReceiptIndianRupee",
      description: "Employee claims and every receipt line behind them. Budget checks, policy flags, GST-credit treatment, advances and the resulting reimbursement are stored on the claim rather than recalculated by this screen.",
    },
    {
      label: "Expense claim",
      path: "claim",
      permission: "expenditure.claim.read",
      hidden: true,
    },
  ],
  screens: {
    claims: () => import("./screens/claims"),
    claim: () => import("./screens/claim"),
  },
  signals: [
    {
      label: "Claims awaiting approval",
      permission: "expenditure.claim.read",
      path: "/expenditure/claims",
      reduce: awaitingClaims,
    },
  ],
};
