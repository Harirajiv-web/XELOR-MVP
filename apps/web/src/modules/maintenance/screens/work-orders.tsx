"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { dateTime, humanise, inr, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { MwoRow } from "../api";
import { maintenanceApi } from "../api";

/** The eight states a maintenance work order can be in. Sending none means "live work". */
const STATUSES = [
  "draft",
  "approved",
  "assigned",
  "in_progress",
  "on_hold",
  "completed",
  "closed",
  "cancelled",
] as const;

/**
 * THE MAINTENANCE WORK ORDER BOARD.
 *
 * Not Production's work order — a different document, a different number series, a different
 * permission root. Nothing on this screen touches a manufacturing order.
 *
 * With no `status` parameter the server returns LIVE work only: closed and cancelled jobs
 * are excluded. That default is the right one for a fitter at the start of a shift and the
 * wrong one for a manager reviewing last month, so the filter says out loud which of the two
 * you are looking at rather than leaving "why is that job missing" as an exercise.
 */
export default function MaintenanceWorkOrdersScreen(_props: ScreenProps): React.JSX.Element {
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("");

  const { data, loading, error, reload } = useQuery<MwoRow[]>(maintenanceApi.workOrdersPath, {
    query: { status: status || undefined },
  });

  const rows = useMemo(() => {
    const all = data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (m) =>
        m.mwoNo.toLowerCase().includes(q) ||
        m.assetCode.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q),
    );
  }, [data, filter]);

  const breached = (data ?? []).filter((m) => m.slaBreached).length;
  const safety = (data ?? []).filter((m) => m.isSafetyRelated).length;

  const columns: ReadonlyArray<Column<MwoRow>> = [
    {
      key: "mwoNo",
      header: "Work order",
      width: "w-40",
      render: (m) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{m.mwoNo}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">{humanise(m.mwoType)}</div>
        </div>
      ),
    },
    {
      key: "asset",
      header: "Machine",
      width: "w-52",
      render: (m) => (
        <div className="min-w-0">
          <div className="text-[var(--text-primary)]">{m.assetCode}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{m.assetName}</div>
        </div>
      ),
    },
    { key: "title", header: "Job", render: (m) => m.title },
    {
      key: "priority",
      header: "Priority",
      width: "w-24",
      // P1..P4 is a classification, not a state — a neutral chip, so it does not compete
      // with the status column that actually tells you what is happening.
      render: (m) => <StatusBadge tone="unknown" label={m.priority} />,
    },
    {
      key: "restoreBy",
      header: "Restore by",
      width: "w-52",
      // Absolute date AND the relative phrase. "In 2 days" is what a planner acts on;
      // "22-Jul-2026 18:00" is what they put in a message to the production supervisor.
      render: (m) =>
        m.slaRestoreBy === null ? (
          <span className="text-[var(--text-secondary)]">no deadline set</span>
        ) : (
          <div className="min-w-0">
            <div>{dateTime(m.slaRestoreBy)}</div>
            <div className="text-[12px] text-[var(--text-secondary)]">
              {relativeDays(m.slaRestoreBy)}
            </div>
          </div>
        ),
    },
    {
      key: "status",
      header: "Status",
      width: "w-44",
      render: (m) => (
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge status={m.status} />
          {m.slaBreached ? <StatusBadge tone="overdue" label="SLA missed" /> : null}
          {m.isSafetyRelated ? <StatusBadge tone="rejected" label="Safety" /> : null}
        </div>
      ),
    },
    {
      key: "cost",
      header: "Cost so far",
      numeric: true,
      width: "w-36",
      render: (m) => inr(m.cost.total),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Maintenance work orders"
        subtitle="Jobs raised against machines — breakdowns, corrective work, services and statutory examinations. This is not the same document as a production work order."
        meta={
          (data?.length ?? 0) > 0
            ? [
                { label: "Jobs", value: String(data?.length ?? 0) },
                { label: "SLA missed", value: String(breached) },
                { label: "Safety-related", value: String(safety) },
              ]
            : []
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by work order, machine or job…"
            aria-label="Filter maintenance work orders"
            className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Status"
          className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-2 text-[13px] text-[var(--text-primary)]"
        >
          <option value="">Live work (closed and cancelled hidden)</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanise(s)} only
            </option>
          ))}
        </select>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(m) => m.id}
        caption="Maintenance work orders with priority, restore deadline and cost to date"
        empty={
          filter || status ? (
            <Empty
              title="Nothing matches that filter"
              body="No work order matched what you asked for. Clear the filters, or switch the status back to live work."
            />
          ) : (
            <Empty
              title="No open maintenance work"
              body="Work orders appear here when a maintenance request is triaged into one, or when a preventive schedule falls due and generates one."
            />
          )
        }
      />
    </div>
  );
}
