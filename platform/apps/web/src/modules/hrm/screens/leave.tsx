"use client";

import { useState } from "react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { EmployeePage, LeaveBalanceRow } from "../api";
import { hrmApi } from "../api";

/** Leave is counted in days and half days; a whole number should not read as "5.0 days". */
function days(value: number): string {
  return num(value, Number.isInteger(value) ? 0 : 1);
}

/**
 * LEAVE BALANCES — one person, one leave year.
 *
 * The API answers per employee and will not answer without one, so the person is chosen
 * before anything is fetched rather than after an error. That is the honest shape of the
 * endpoint: a leave balance belongs to somebody, and a company-wide leave register is a
 * different report that does not exist yet.
 *
 * The five columns are the whole argument. Opening, accrued, used and encashed each come
 * from somewhere a person can be shown — a carry-forward, a monthly accrual run, an
 * approved application, a settlement — and the closing figure is their arithmetic, computed
 * on the server so this screen and a payslip can never disagree about it.
 */
export default function LeaveScreen(_props: ScreenProps): React.JSX.Element {
  const employees = useQuery<EmployeePage>(hrmApi.employeesPath, { query: { limit: 200 } });
  const [chosen, setChosen] = useState<string>("");

  const list = employees.data?.items ?? [];
  // Falling back to the first person rather than an empty picker: a screen that shows
  // nothing until you operate a control reads as broken to somebody arriving from paper.
  const employeeId = chosen || list[0]?.id || "";
  const employee = list.find((e) => e.id === employeeId);

  const { data, loading, error, reload } = useQuery<LeaveBalanceRow[]>(
    employeeId ? hrmApi.leaveBalancesPath : null,
    { query: { employeeId, year: hrmApi.demoLeaveYear } },
  );

  const columns: ReadonlyArray<Column<LeaveBalanceRow>> = [
    {
      key: "type",
      header: "Leave type",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.leaveTypeCode}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{r.leaveTypeName}</div>
        </div>
      ),
    },
    {
      key: "paid",
      header: "Paid",
      width: "w-32",
      // Whether a leave type is paid decides whether taking it costs the employee money.
      // It is the first thing anyone asks and the last thing that should be inferred.
      render: (r) =>
        r.isPaid ? (
          <StatusBadge tone="approved" label="Paid" />
        ) : (
          <StatusBadge tone="unknown" label="Unpaid" />
        ),
    },
    {
      key: "opening",
      header: "Opening",
      numeric: true,
      width: "w-28",
      render: (r) => <span className="text-[var(--text-secondary)]">{days(r.opening)}</span>,
    },
    {
      key: "accrued",
      header: "Accrued",
      numeric: true,
      width: "w-28",
      render: (r) => days(r.accrued),
    },
    {
      key: "used",
      header: "Used",
      numeric: true,
      width: "w-24",
      render: (r) => days(r.used),
    },
    {
      key: "encashed",
      header: "Encashed",
      numeric: true,
      width: "w-28",
      render: (r) =>
        r.encashed > 0 ? days(r.encashed) : <span className="text-[var(--text-muted)]">—</span>,
    },
    {
      key: "closing",
      header: "In hand",
      numeric: true,
      width: "w-28",
      render: (r) => <span className="font-semibold">{days(r.closing)}</span>,
    },
  ];

  if (employees.error) return <ErrorState error={employees.error} onRetry={employees.reload} />;
  if (employees.loading) return <Loading label="Loading employees…" />;
  if (list.length === 0) {
    return (
      <Empty
        title="No employees on roll"
        body="Leave balances belong to a person. Add employees first and their opening balances and accruals will appear here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Leave balances"
        subtitle="What one person has in hand this leave year, and how they got there — carried forward, accrued, taken, encashed."
        meta={[
          { label: "Leave year", value: hrmApi.demoLeaveYear },
          ...(employee ? [{ label: "Employee", value: employee.empCode }] : []),
        ]}
        actions={
          <label className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
            <span>Employee</span>
            <select
              value={employeeId}
              onChange={(e) => setChosen(e.target.value)}
              aria-label="Employee"
              className="h-9 max-w-[16rem] rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2.5 text-[13px] text-[var(--text-primary)]"
            >
              {list.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.empCode} — {e.name}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {employees.data?.nextCursor ? (
        <p className="text-[12px] leading-5 text-[var(--text-muted)]">
          The picker lists the first {list.length} employees on roll. There are more — a
          dropdown cannot page, so this screen is honest about its ceiling rather than
          quietly omitting people.
        </p>
      ) : null}

      <DataTable
        rows={data ?? []}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.leaveTypeCode}
        caption={`Leave balances for ${employee?.name ?? "the selected employee"}, ${hrmApi.demoLeaveYear}`}
        empty={
          <Empty
            title="No leave balances for this person"
            body={`Nothing has been credited to ${employee?.name ?? "this employee"} for ${hrmApi.demoLeaveYear} yet. Balances appear once an opening balance is loaded or the monthly accrual has been run.`}
          />
        }
      />
    </div>
  );
}
