"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { MusterRow } from "../api";
import { hrmApi } from "../api";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-07" → "Jul 2026". The muster is always talked about by month, never by date range. */
function monthLabel(month: string): string {
  const [year, mm] = month.split("-");
  const name = MONTH_NAMES[Number(mm) - 1];
  return year && name ? `${name} ${year}` : month;
}

/**
 * Day counts carry a half day. Rendering 22 as "22.0" looks like false precision on a
 * number people already count on their fingers, so the decimal appears only when there is one.
 */
function days(value: number): string {
  return num(value, Number.isInteger(value) ? 0 : 1);
}

/**
 * THE ATTENDANCE MUSTER — one month, one row per person.
 *
 * The month is REQUIRED by the API (it answers 400 without one), which is why this screen
 * opens on a month rather than on an empty state waiting for a choice. It defaults to the
 * demo world's current month; changing it re-queries, because a muster is derived from
 * processed days on the server and there is nothing sensible to filter client-side.
 *
 * Every number here is attendance's CONCLUSION, not its punches. The computation from
 * punches to a day's status is deterministic — the same inputs always produce the same
 * output — so a disputed day is re-derived rather than argued about, and a correction is an
 * appended regularisation rather than an edit to what the device recorded.
 */
export default function MusterScreen(_props: ScreenProps): React.JSX.Element {
  const [month, setMonth] = useState<string>(hrmApi.demoMonth);
  const { data, loading, error, reload } = useQuery<MusterRow[]>(hrmApi.musterPath, {
    query: { month },
  });

  // Memoised rather than `data ?? []` inline: the fallback allocates a NEW empty array on
  // every render, so the totals below would recompute on every render instead of when the
  // muster actually changes. Harmless at thirteen employees and not harmless at four
  // hundred, which is the size this screen is for.
  const rows = useMemo(() => data ?? [], [data]);

  const totals = useMemo(() => {
    return rows.reduce(
      (a, r) => ({
        paidDays: a.paidDays + r.summary.paidDays,
        lopDays: a.lopDays + r.summary.lopDays,
        otHours: a.otHours + r.summary.otHours,
        pending: a.pending + r.summary.pendingRegularisations,
      }),
      { paidDays: 0, lopDays: 0, otHours: 0, pending: 0 },
    );
  }, [rows]);

  /**
   * The muster lists everybody on roll whether or not their days have been processed, so
   * an unprocessed month arrives as a full table of zeroes rather than as an empty state.
   * A table of zeroes reads as "nobody came to work", which is a very different and much
   * more alarming claim than "we have not computed this month yet" — hence the notice.
   */
  const nothingProcessed = rows.length > 0 && rows.every((r) => r.days.length === 0);

  const columns: ReadonlyArray<Column<MusterRow>> = [
    {
      key: "employee",
      header: "Employee",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.empCode}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{r.name}</div>
          {/* Surfaced on the person rather than in a column of its own: an unresolved day
              blocks the month lock, which blocks payroll, and whoever is chasing it needs
              the name next to the count. */}
          {r.summary.pendingRegularisations > 0 ? (
            <div className="mt-1">
              <StatusBadge
                tone="pending"
                label={`${r.summary.pendingRegularisations} to resolve`}
              />
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "workingDays",
      header: "Working",
      numeric: true,
      width: "w-24",
      render: (r) => <span className="text-[var(--text-secondary)]">{days(r.summary.workingDays)}</span>,
    },
    {
      key: "present",
      header: "Present",
      numeric: true,
      width: "w-24",
      render: (r) => days(r.summary.presentDays),
    },
    {
      key: "half",
      header: "Half",
      numeric: true,
      width: "w-20",
      render: (r) => days(r.summary.halfDays),
    },
    {
      key: "leave",
      header: "Leave",
      numeric: true,
      width: "w-20",
      render: (r) => days(r.summary.leaveDays),
    },
    {
      key: "absent",
      header: "Absent",
      numeric: true,
      width: "w-20",
      render: (r) => days(r.summary.absentDays),
    },
    {
      key: "paidDays",
      header: "Paid days",
      numeric: true,
      width: "w-28",
      // The number payroll actually multiplies by. It earns the emphasis.
      render: (r) => <span className="font-semibold">{days(r.summary.paidDays)}</span>,
    },
    {
      key: "lop",
      header: "LOP",
      numeric: true,
      width: "w-20",
      render: (r) =>
        r.summary.lopDays > 0 ? (
          <span className="font-semibold text-[var(--status-overdue-text)]">
            {days(r.summary.lopDays)}
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        ),
    },
    {
      key: "ot",
      header: "OT hours",
      numeric: true,
      width: "w-28",
      render: (r) => (r.summary.otHours > 0 ? num(r.summary.otHours, 2) : <span className="text-[var(--text-muted)]">—</span>),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Attendance muster"
        subtitle="One row per person for the month: what the punches worked out to, after shifts, weekly offs, holidays and approved leave were applied."
        meta={
          rows.length > 0
            ? [
                { label: "Month", value: monthLabel(month) },
                { label: "People", value: String(rows.length) },
                { label: "Paid days", value: days(totals.paidDays) },
                { label: "LOP days", value: days(totals.lopDays) },
                { label: "OT hours", value: num(totals.otHours, 2) },
                ...(totals.pending > 0
                  ? [{ label: "To resolve", value: String(totals.pending) }]
                  : []),
              ]
            : []
        }
        actions={
          <label className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
            <span>Month</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value || hrmApi.demoMonth)}
              aria-label="Muster month"
              className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2.5 text-[13px] text-[var(--text-primary)]"
            />
          </label>
        }
      />

      {nothingProcessed ? (
        <p className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2 text-[13px] leading-5 text-[var(--text-secondary)]">
          Everyone on roll is listed, but no day in {monthLabel(month)} has been worked out
          yet — these zeroes mean the month has not been processed, not that nobody came in.
          The figures fill once punches are ingested for the month and the attendance run is
          made over it.
        </p>
      ) : null}

      {totals.pending > 0 ? (
        <p className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2 text-[13px] leading-5 text-[var(--text-secondary)]">
          {totals.pending} day{totals.pending === 1 ? "" : "s"} still waiting on a
          regularisation. The month cannot be locked, and payroll cannot run on it, until
          every one of them has been decided.
        </p>
      ) : null}

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.employeeId}
        caption={`Attendance muster for ${monthLabel(month)}`}
        empty={
          <Empty
            title={`Nothing on the muster for ${monthLabel(month)}`}
            body="The muster fills once punches have been ingested for the month and the days have been processed. Until then there is nothing to show — which is different from everybody being absent."
          />
        }
      />
    </div>
  );
}
