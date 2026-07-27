"use client";

import { useState } from "react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, dateTime, humanise, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { DowntimeRow } from "../api";
import { defaultWindow, durationText, maintenanceApi } from "../api";

/**
 * THE DOWNTIME LEDGER — every interval a machine was not available.
 *
 * These rows are Production's OEE input and the denominator of every availability figure in
 * the plant, so two rules govern how they are shown:
 *
 *   EVERY DURATION CARRIES ITS EXACT MINUTE COUNT. "4 h 35 min" is what a person reads;
 *   "275 min exactly" is what they check the total against. The rounded figure never
 *   appears on its own, because a rounded number that cannot be verified is a number
 *   Production will argue with rather than accept.
 *
 *   A CORRECTED OR DISPUTED INTERVAL SAYS SO. Corrections are the one lever that could
 *   quietly flatter every reliability KPI at once; they are retained, never deleted, and
 *   flagged here where somebody reading the numbers will see them.
 *
 * `assetCode`, `from`, `to` and `open` are all optional on the server — but an unfiltered
 * ledger is every stop the plant has ever had, so this screen sends a window by default.
 */
export default function DowntimeScreen(_props: ScreenProps): React.JSX.Element {
  const [window, setWindow] = useState(defaultWindow);
  const [assetCode, setAssetCode] = useState("");
  const [openOnly, setOpenOnly] = useState(false);

  const { data, loading, error, reload } = useQuery<DowntimeRow[]>(maintenanceApi.downtimePath, {
    query: {
      from: window.from,
      to: window.to,
      assetCode: assetCode.trim() || undefined,
      open: openOnly ? "true" : undefined,
    },
  });

  const rows = data ?? [];
  const stillDown = rows.filter((r) => r.endedAt === null).length;
  // Summed here from the same minute counts the table shows, so the total and the rows can
  // never disagree — a header figure computed a second way is how two numbers drift.
  const unplannedMinutes = rows
    .filter((r) => r.kind === "unplanned" && r.productionImpacting)
    .reduce((a, r) => a + (r.durationMinutes ?? 0), 0);

  const columns: ReadonlyArray<Column<DowntimeRow>> = [
    {
      key: "asset",
      header: "Machine",
      width: "w-52",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.assetCode}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{r.assetName}</div>
        </div>
      ),
    },
    {
      key: "startedAt",
      header: "Stopped at",
      width: "w-48",
      render: (r) => dateTime(r.startedAt),
    },
    {
      key: "endedAt",
      header: "Back in service",
      width: "w-48",
      render: (r) =>
        r.endedAt === null ? (
          <StatusBadge tone="progress" label="Still down" />
        ) : (
          dateTime(r.endedAt)
        ),
    },
    {
      key: "duration",
      header: "Duration",
      numeric: true,
      width: "w-44",
      render: (r) => {
        const d = durationText(r.durationMinutes);
        return (
          <div>
            <div className="font-semibold">{d.rounded}</div>
            <div className="text-[12px] text-[var(--text-secondary)]">{d.exact}</div>
          </div>
        );
      },
    },
    {
      key: "kind",
      header: "Kind",
      width: "w-44",
      render: (r) => (
        <div className="min-w-0">
          <div>{humanise(r.kind)}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            {r.productionImpacting ? "counted against production" : "not counted against production"}
          </div>
        </div>
      ),
    },
    {
      key: "reasonCode",
      header: "Reason",
      width: "w-40",
      render: (r) => (r.reasonCode ? humanise(r.reasonCode) : "not stated"),
    },
    {
      key: "source",
      header: "Opened by",
      width: "w-32",
      render: (r) => <StatusBadge tone="unknown" label={humanise(r.source)} />,
    },
    {
      key: "flags",
      header: "Flags",
      width: "w-48",
      render: (r) => (
        <div className="flex flex-wrap items-center gap-1">
          {r.corrected ? <StatusBadge tone="pending" label="Corrected" /> : null}
          {r.disputed ? <StatusBadge tone="hold" label="Disputed" /> : null}
          {!r.corrected && !r.disputed ? (
            <span className="text-[var(--text-secondary)]">—</span>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Downtime"
        subtitle="Every interval a machine was not available, with the exact minutes each one cost. These are the same rows the availability and MTBF figures are computed from."
        meta={
          rows.length > 0
            ? [
                { label: "Intervals", value: String(rows.length) },
                { label: "Still down", value: String(stillDown) },
                {
                  label: "Unplanned hours",
                  value: `${num(unplannedMinutes / 60, 2)} h (${num(unplannedMinutes)} min)`,
                },
              ]
            : []
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
            From
          </span>
          <input
            type="date"
            value={window.from}
            onChange={(e) => setWindow((w) => ({ ...w, from: e.target.value }))}
            className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-2 text-[13px] text-[var(--text-primary)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
            To
          </span>
          <input
            type="date"
            value={window.to}
            onChange={(e) => setWindow((w) => ({ ...w, to: e.target.value }))}
            className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-2 text-[13px] text-[var(--text-primary)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
            Machine
          </span>
          <input
            type="search"
            value={assetCode}
            onChange={(e) => setAssetCode(e.target.value)}
            placeholder="Asset code, exactly"
            aria-label="Asset code"
            className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </label>
        <label className="flex h-9 items-center gap-2 text-[13px] text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
            className="h-4 w-4"
          />
          Only machines still down
        </label>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.id}
        caption="Downtime intervals with exact durations, reason and source"
        empty={
          <Empty
            title="No downtime in this window"
            body={`Nothing was recorded as stopped between ${date(window.from)} and ${date(window.to)}. Intervals appear here when an operator reports a stopped machine, when a breakdown job starts, or when a planned shutdown window opens.`}
          />
        }
      />
    </div>
  );
}
