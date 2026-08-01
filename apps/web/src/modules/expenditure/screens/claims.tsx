"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, inr } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { ExpenseClaim } from "../api";
import { expenditureApi } from "../api";

export default function ExpenseClaimsScreen(_props: ScreenProps): React.JSX.Element {
  const router = useRouter();
  const { data, loading, error, reload } = useQuery<ExpenseClaim[]>(expenditureApi.claimsPath);
  const columns: ReadonlyArray<Column<ExpenseClaim>> = [
    { key: "claim", header: "Claim", width: "w-48", render: (row) => <div><b className="font-[var(--font-mono)] text-[var(--text-primary)]">{row.claimNo}</b><p className="text-[12px] text-[var(--text-secondary)]">{date(row.claimDate)}</p></div> },
    { key: "employee", header: "Employee", render: (row) => <div><p className="font-[var(--font-mono)] text-[12px] text-[var(--text-primary)]">{row.employeeRef}</p><p className="text-[12px] text-[var(--text-secondary)]">{row.costCentreRef}</p></div> },
    { key: "status", header: "Status", width: "w-36", render: (row) => <StatusBadge status={row.status} /> },
    { key: "lines", header: "Receipts", numeric: true, width: "w-24", render: (row) => String(row.lines.length) },
    { key: "claimed", header: "Claimed", numeric: true, width: "w-40", render: (row) => inr(row.totalClaimed) },
    { key: "payable", header: "Reimbursable", numeric: true, width: "w-44", render: (row) => <b>{inr(row.netReimbursable)}</b> },
  ];

  return <div className="flex flex-col gap-4">
    <PageHeader title="Expense claims" subtitle="Employee spend as submitted, budget-checked and approved. Open a claim to see the receipts, recoverable GST, policy findings and exact reimbursement." />
    <DataTable rows={data ?? []} columns={columns} loading={loading} error={error} onReload={reload} rowKey={(row) => row.claimNo} onRowClick={(row) => router.push(`/expenditure/claim/${encodeURIComponent(row.claimNo)}`)} caption="Employee expense claims" empty={<Empty title="No claims recorded" body="Claims appear here once an employee records the first receipt line." />} />
  </div>;
}
