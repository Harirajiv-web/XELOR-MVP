"use client";

import Link from "next/link";
import { ArrowLeft, BadgeIndianRupee, Bot, Calculator, UserRoundCheck } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { date, humanise, inr } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import { Disclosure } from "@spine/ui/disclosure";
import type { ScreenProps } from "@spine/registry/manifest";
import type { ExpenseClaim, ExpenseClaimLine } from "../api";
import { expenditureApi } from "../api";

export default function ExpenseClaimScreen({ params }: ScreenProps): React.JSX.Element {
  const claimNo = params[0] ? decodeURIComponent(params[0]) : null;
  const { data, loading, error, reload } = useQuery<ExpenseClaim>(claimNo ? expenditureApi.claimPath(claimNo) : null);
  if (!claimNo) return <Empty title="No claim chosen" body="Open a claim from the register to inspect its evidence." />;
  if (loading) return <Loading label="Loading the expense evidence…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Empty title="Claim not found" body="This claim is no longer readable." />;

  const columns: ReadonlyArray<Column<ExpenseClaimLine>> = [
    { key: "line", header: "#", width: "w-12", render: (row) => row.lineNo },
    { key: "expense", header: "Receipt", render: (row) => <div><b className="text-[var(--text-primary)]">{row.merchant ?? row.head ?? "Expense"}</b><p className="text-[12px] text-[var(--text-secondary)]">{row.head ?? "Unclassified"} · {date(row.expenseDate)}</p></div> },
    { key: "source", header: "Captured", width: "w-28", render: (row) => <span className="text-[12px]">{humanise(row.source)}</span> },
    { key: "amount", header: "Amount", numeric: true, width: "w-36", render: (row) => inr(row.amount) },
    { key: "gst", header: "GST", numeric: true, width: "w-32", render: (row) => inr(row.gstAmount) },
    { key: "itc", header: "Recoverable GST", numeric: true, width: "w-40", render: (row) => <div><b>{inr(row.itcAmount)}</b><p className="text-[11px] text-[var(--text-secondary)]">{humanise(row.itcEligibility)}</p></div> },
  ];

  return <div className="flex flex-col gap-4">
    <Link href="/expenditure/claims" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />All claims</Link>
    <PageHeader title={data.claimNo} subtitle="The stored claim result. The screen does not recalculate tax, policy, budget or reimbursement." meta={[{ label: "Status", value: <StatusBadge status={data.status} /> }, { label: "Claimed", value: inr(data.totalClaimed) }, { label: "Reimbursable", value: inr(data.netReimbursable) }]} />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Evidence icon={Calculator} label="Deterministic calculation" value={inr(data.totalClaimed)} note="Sum of stored receipt lines" />
      <Evidence icon={BadgeIndianRupee} label="GST credit by code" value={inr(data.totalItcEligible)} note={`${inr(data.totalTax)} tax shown on receipts`} />
      <Evidence icon={UserRoundCheck} label="Human-controlled result" value={humanise(data.status)} note={`${inr(data.advanceAdjusted)} advance adjusted`} />
      <Evidence icon={Bot} label="AI boundary" value="Extraction only" note="AI may read a receipt; code decides money" />
    </section>
    <DataTable rows={data.lines} columns={columns} rowKey={(row) => String(row.lineNo)} caption="Receipt lines and stored GST treatment" empty={<Empty title="No receipt lines" body="A valid claim requires at least one line." />} />
    <div className="grid gap-3 lg:grid-cols-2">
      <Disclosure title="Budget check stored at submission" hint="Not recalculated today" defaultOpen><pre className="overflow-auto whitespace-pre-wrap font-[var(--font-mono)] text-[11px]">{JSON.stringify(data.budgetCheckResult ?? { result: "No budget result stored" }, null, 2)}</pre></Disclosure>
      <Disclosure title="Policy findings" hint="Flags are evidence for the approver" defaultOpen><pre className="overflow-auto whitespace-pre-wrap font-[var(--font-mono)] text-[11px]">{JSON.stringify(data.policyFlags ?? [], null, 2)}</pre></Disclosure>
    </div>
  </div>;
}

function Evidence({ icon: Icon, label, value, note }: { icon: typeof Calculator; label: string; value: string; note: string }): React.JSX.Element {
  return <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]"><div className="flex items-start justify-between"><div><p className="text-[9px] font-extrabold uppercase tracking-[.09em] text-[var(--text-muted)]">{label}</p><p className="mt-2 text-[18px] font-extrabold text-[var(--text-primary)]">{value}</p></div><Icon className="h-4 w-4 text-[var(--brand)]" aria-hidden /></div><p className="mt-1 text-[10px] text-[var(--text-secondary)]">{note}</p></div>;
}
