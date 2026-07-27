"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, humanise, inr } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { AccountType, TrialBalance, TrialBalanceRow } from "../api";
import { accountsApi } from "../api";

/**
 * Which side an account's balance sits on. A signed number alone is ambiguous here, because
 * "positive" means Dr on an asset and Cr on a liability; an accountant reads Dr/Cr, so that
 * is what the column says.
 */
function side(type: AccountType, balance: number): "Dr" | "Cr" {
  const natural = type === "asset" || type === "expense" ? "Dr" : "Cr";
  if (balance >= 0) return natural;
  return natural === "Dr" ? "Cr" : "Dr";
}

/** Exactly zero prints as an em dash. A column of ₹0.00 is noise between the figures that matter. */
function money(value: number): React.JSX.Element {
  if (value === 0) return <span className="text-[var(--text-muted)]">—</span>;
  return <>{inr(value)}</>;
}

/**
 * THE TRIAL BALANCE.
 *
 * It has to foot, and it has to be SEEN to foot — the totals and the verdict are at the top
 * of the screen, before the detail, because that is the first thing anyone opening this
 * report checks and the only thing that decides whether they believe the rest of it.
 *
 * It balances by construction rather than by luck: every voucher is validated balanced
 * before it is written, and the database asserts it again at COMMIT. So the banner below is
 * not a hopeful calculation, it is a check on a promise that is already enforced twice —
 * which is exactly why it is worth showing.
 *
 * AS AT WHEN is the other half of the question, and the screen must be able to answer it.
 * The date filters on each voucher's POSTING date — the date a transaction is deemed to have
 * happened, which is not the same as when the row was written, because a voucher can be
 * posted into an earlier period that is still open. The heading reports the date the SERVER
 * used, not the one this screen asked for, so the label and the figures cannot disagree.
 */
export default function TrialBalanceScreen(_props: ScreenProps): React.JSX.Element {
  const [asOf, setAsOf] = useState<string>(accountsApi.demoToday);
  const { data, loading, error, reload } = useQuery<TrialBalance>(accountsApi.trialBalancePath, {
    query: { asOf },
  });
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) => r.accountCode.toLowerCase().includes(q) || r.accountName.toLowerCase().includes(q),
    );
  }, [data, filter]);

  const totalDebit = data?.totalDebit ?? 0;
  const totalCredit = data?.totalCredit ?? 0;
  const balanced = data?.balanced ?? false;
  const difference = Math.round((totalDebit - totalCredit) * 100) / 100;

  const columns: ReadonlyArray<Column<TrialBalanceRow>> = [
    {
      key: "account",
      header: "Account",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-[var(--font-mono)] text-[var(--text-primary)]">{r.accountCode}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{r.accountName}</div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      width: "w-36",
      // An account type is a classification, not a workflow state — neutral treatment, so
      // the eight status colours keep meaning what they mean everywhere else.
      render: (r) => <StatusBadge tone="unknown" label={humanise(r.accountType)} />,
    },
    {
      key: "debit",
      header: "Debit",
      numeric: true,
      width: "w-44",
      render: (r) => money(r.debit),
    },
    {
      key: "credit",
      header: "Credit",
      numeric: true,
      width: "w-44",
      render: (r) => money(r.credit),
    },
    {
      key: "balance",
      header: "Balance",
      numeric: true,
      width: "w-48",
      render: (r) =>
        r.balance === 0 ? (
          <span className="text-[var(--text-muted)]">—</span>
        ) : (
          <span className="font-semibold">
            {inr(Math.abs(r.balance))}{" "}
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
              {side(r.accountType, r.balance)}
            </span>
          </span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Trial balance"
        subtitle="Every journal line posted on or before the as-at date, summed by account. Nothing here is typed in — each figure is the total of vouchers you can open and read."
        meta={
          data
            ? [
                // The server's date, not the control's. If the two ever differ, the report
                // says which one produced the figures underneath it.
                { label: "As at", value: date(data.asOf) },
                { label: "Accounts", value: String(data.rows.length) },
                { label: "Total debit", value: inr(totalDebit) },
                { label: "Total credit", value: inr(totalCredit) },
              ]
            : []
        }
        actions={
          <label className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
            <span>As at</span>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value || accountsApi.demoToday)}
              aria-label="Trial balance as-at date"
              className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--text-primary)]"
            />
          </label>
        }
      />

      {/* Only when there is something to foot. "Debits ₹0.00 equal credits ₹0.00" above an
          empty ledger is technically true and reads as a system going through the motions. */}
      {data && data.rows.length > 0 ? (
        <div
          className={
            balanced
              ? "flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-3"
              : "flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-[var(--status-overdue-text)] bg-[var(--surface)] px-4 py-3"
          }
        >
          <StatusBadge
            tone={balanced ? "approved" : "overdue"}
            label={balanced ? "Debits equal credits" : "Out of balance"}
          />
          <p className="text-[13px] leading-5 text-[var(--text-secondary)]">
            {balanced ? (
              <>
                Debits of <strong className="text-[var(--text-primary)]">{inr(totalDebit)}</strong>{" "}
                against credits of{" "}
                <strong className="text-[var(--text-primary)]">{inr(totalCredit)}</strong> — the
                ledger foots to the paisa.
              </>
            ) : (
              <>
                Debits of <strong className="text-[var(--text-primary)]">{inr(totalDebit)}</strong>{" "}
                against credits of{" "}
                <strong className="text-[var(--text-primary)]">{inr(totalCredit)}</strong>, a
                difference of{" "}
                <strong className="text-[var(--status-overdue-text)]">
                  {inr(Math.abs(difference))}
                </strong>
                . Every voucher is checked balanced before it is written and again by the
                database at commit, so this should be impossible — treat it as a fault to
                report, not a figure to adjust.
              </>
            )}
          </p>
        </div>
      ) : null}

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by account code or name…"
          aria-label="Filter accounts"
          className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.accountCode}
        caption="Trial balance by general ledger account"
        empty={
          filter ? (
            <Empty
              title="No account matches that filter"
              body={`No account code or name matched “${filter}”. Clearing the filter shows the full ledger — the totals above are the whole ledger either way.`}
            />
          ) : (
            <Empty
              title={`Nothing posted on or before ${date(data?.asOf ?? asOf)}`}
              body="The trial balance builds itself from posted vouchers. Either nothing has been posted yet, or everything in the ledger was posted after this date — try moving the as-at date forward before concluding the ledger is empty."
            />
          )
        }
      />

      {filter && data ? (
        <p className="text-[12px] leading-5 text-[var(--text-muted)]">
          The filter narrows the rows shown. The totals above are always the whole ledger as
          at {date(data.asOf)} — a trial balance of a subset would not foot, and a report that
          appears not to foot is worse than one that makes you clear a filter.
        </p>
      ) : null}
    </div>
  );
}
