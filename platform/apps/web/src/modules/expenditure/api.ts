export interface ExpenseClaimLine {
  lineNo: number;
  head: string | null;
  expenseDate: string;
  merchant: string | null;
  amount: number;
  gstAmount: number;
  itcAmount: number;
  itcEligibility: string | null;
  itcReason: string | null;
  source: string | null;
}

export interface ExpenseClaim {
  claimNo: string;
  status: string;
  employeeRef: string;
  costCentreRef: string;
  claimDate: string;
  totalClaimed: number;
  totalTax: number;
  totalItcEligible: number;
  advanceAdjusted: number;
  netReimbursable: number;
  policyFlags: unknown;
  budgetCheckResult: unknown;
  lines: ExpenseClaimLine[];
}

export const expenditureApi = {
  claimsPath: "/expenditure/claims",
  claimPath: (claimNo: string): string => `/expenditure/claims/${encodeURIComponent(claimNo)}`,
} as const;
