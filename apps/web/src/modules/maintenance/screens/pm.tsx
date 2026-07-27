"use client";

import { useState } from "react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, humanise, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { PmOccurrenceRow } from "../api";
import { maintenanceApi } from "../api";

const STATUSES = ["scheduled", "generated", "in_progress", "completed", "skipped", "missed"] as const;

/**
 * THE PREVENTIVE SCHEDULE — every service that has fallen due, and what became of it.
 *
 * `missed` and `skipped` rows stay in this list on purpose. They are in the compliance
 * denominator, and a schedule that hid the services nobody did would produce a very
 * flattering tile and a plant full of unserviced machines. A PM programme dies the second
 * time when waking it up produces twelve overdue jobs at once; that is why the generator
 * marks the intervals it slept through rather than stacking them.
 *
 * `withinGrace` is null until the work is completed — not false. "Not finished yet" and
 * "finished late" are different facts and only one of them is a failure.
 */
export default function PmScreen(_props: ScreenProps): React.JSX.Element {
  const [status, setStatus] = useState("");
  const [pmsCode, setPmsCode] = useState("");

  const { data, loading, error, reload } = useQuery<PmOccurrenceRow[]>(
    maintenanceApi.pmOccurrencesPath,
    { query: { status: status || undefined, pmsCode: pmsCode.trim() || undefined } },
  );

  const rows = data ?? [];
  const missed = rows.filter((r) => r.status === "missed").length;
  const outstanding = rows.filter((r) =>
    ["scheduled", "generated", "in_progress"].includes(r.status),
  ).length;

  const columns: ReadonlyArray<Column<PmOccurrenceRow>> = [
    {
      key: "pmsCode",
      header: "Schedule",
      width: "w-44",
      render: (o) => <span className="font-semibold">{o.pmsCode}</span>,
    },
    {
      key: "occurrenceSeq",
      header: "Service no.",
      numeric: true,
      width: "w-28",
      render: (o) => o.occurrenceSeq,
    },
    {
      key: "dueDate",
      header: "Due",
      width: "w-52",
      // The absolute date and the relative phrase together. A service due "in 5 days" is
      // what a planner schedules around; "01-Aug-2026" is what they write to the vendor.
      render: (o) =>
        o.dueDate === null ? (
          <span className="text-[var(--text-secondary)]">no date — meter-based</span>
        ) : (
          <div className="min-w-0">
            <div>{date(o.dueDate)}</div>
            <div className="text-[12px] text-[var(--text-secondary)]">{relativeDays(o.dueDate)}</div>
          </div>
        ),
    },
    {
      key: "dueBasis",
      header: "Why it is due",
      width: "w-40",
      render: (o) => (o.dueBasis ? humanise(o.dueBasis) : "—"),
    },
    {
      key: "status",
      header: "Status",
      width: "w-40",
      render: (o) => <StatusBadge status={o.status} />,
    },
    {
      key: "withinGrace",
      header: "On time?",
      width: "w-44",
      render: (o) =>
        o.withinGrace === null ? (
          <span className="text-[var(--text-secondary)]">not finished</span>
        ) : o.withinGrace ? (
          <StatusBadge tone="done" label="Within grace" />
        ) : (
          <StatusBadge tone="overdue" label="Outside grace" />
        ),
    },
    {
      key: "mwoNo",
      header: "Work order",
      width: "w-36",
      render: (o) =>
        o.mwoNo ? (
          <span className="font-semibold">{o.mwoNo}</span>
        ) : (
          <span className="text-[var(--text-secondary)]">none raised</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Preventive schedule"
        subtitle="Every service the plant's schedules have called for, including the ones that were missed or skipped — those stay here because they count against compliance."
        meta={
          rows.length > 0
            ? [
                { label: "Services", value: String(rows.length) },
                { label: "Still outstanding", value: String(outstanding) },
                { label: "Missed", value: String(missed) },
              ]
            : []
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
            Schedule
          </span>
          <input
            type="search"
            value={pmsCode}
            onChange={(e) => setPmsCode(e.target.value)}
            placeholder="Schedule code, exactly"
            aria-label="Schedule code"
            className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
            Status
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-2 text-[13px] text-[var(--text-primary)]"
          >
            <option value="">Every status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(o) => `${o.pmsCode}-${o.occurrenceSeq}`}
        caption="Preventive maintenance occurrences with due date, status and the work order raised"
        empty={
          status || pmsCode ? (
            <Empty
              title="Nothing matches that filter"
              body="No service occurrence matched what you asked for. Clear the filters to see the whole schedule."
            />
          ) : (
            <Empty
              title="No services due yet"
              body="Occurrences appear here once a preventive schedule is active and the generator runs — either on the calendar, or when a machine's meter crosses its service interval."
            />
          )
        }
      />
    </div>
  );
}
