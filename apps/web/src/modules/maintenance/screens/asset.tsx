"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { date, dateTime, humanise, inr, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { AssetHistory, AssetHistoryEvent, AssetMeter, AssetRow } from "../api";
import { defaultWindow, maintenanceApi } from "../api";

/**
 * ONE MACHINE, END TO END — the screen the module is bought for.
 *
 * Everything that has happened to this asset in one chronological stream: breakdowns,
 * services, downtime, meter readings and the spares that were drawn. When a customer
 * complains about a pump six months later, this is the answer.
 *
 * The history endpoint REQUIRES `from` and `to`; it builds dates from them directly and
 * fails without. The window is therefore always sent, defaulted to ninety days and visible
 * as two inputs — a report over a window the reader cannot see is a report they cannot
 * check.
 */
export default function AssetScreen(props: ScreenProps): React.JSX.Element {
  const code = props.params[0];
  const [window, setWindow] = useState(defaultWindow);

  const asset = useQuery<AssetRow>(code ? maintenanceApi.assetPath(code) : null);
  const history = useQuery<AssetHistory>(code ? maintenanceApi.assetHistoryPath(code) : null, {
    query: { from: window.from, to: window.to },
  });

  if (!code) {
    return (
      <Empty
        title="No asset chosen"
        body="Open a machine from the asset register to see everything that has happened to it."
      />
    );
  }
  if (asset.loading) return <Loading label="Loading the asset…" />;
  if (asset.error) return <ErrorState error={asset.error} onRetry={asset.reload} />;
  if (!asset.data) return <Empty title="Asset not found" body={`No asset with the code ${code}.`} />;

  const a = asset.data;

  const meterColumns: ReadonlyArray<Column<AssetMeter>> = [
    {
      key: "meterType",
      header: "Meter",
      width: "w-40",
      render: (m) => <span className="font-semibold">{humanise(m.meterType)}</span>,
    },
    {
      key: "currentValue",
      header: "Reading now",
      numeric: true,
      width: "w-40",
      render: (m) => `${num(m.currentValue, 1)} ${m.uom}`,
    },
    {
      key: "dailyRateEst",
      header: "Per day",
      numeric: true,
      width: "w-36",
      // Null is not zero. A rate needs two observed readings, and printing 0 where there is
      // no rate yet would forecast a service that never falls due.
      render: (m) =>
        m.dailyRateEst === null ? (
          <span className="text-[var(--text-secondary)]">not yet known</span>
        ) : (
          `${num(m.dailyRateEst, 2)} ${m.uom}`
        ),
    },
    {
      key: "lastRealReadingAt",
      header: "Last real reading",
      width: "w-48",
      render: (m) => date(m.lastRealReadingAt),
    },
    {
      key: "stale",
      header: "Trustworthy?",
      width: "w-44",
      render: (m) =>
        m.stale ? (
          <StatusBadge tone="overdue" label="Stale — 60 days" />
        ) : (
          <StatusBadge tone="done" label="Current" />
        ),
    },
  ];

  const eventColumns: ReadonlyArray<Column<AssetHistoryEvent>> = [
    {
      key: "at",
      header: "When",
      width: "w-48",
      render: (e) => dateTime(e.at),
    },
    {
      key: "type",
      header: "What happened",
      width: "w-52",
      render: (e) => <StatusBadge tone="unknown" label={humanise(e.type.replace(/\./g, " "))} />,
    },
    {
      key: "ref",
      header: "Document",
      width: "w-44",
      render: (e) => <span className="font-semibold">{e.ref}</span>,
    },
    { key: "detail", header: "Detail", render: (e) => e.detail },
    {
      key: "amount",
      header: "Cost",
      numeric: true,
      width: "w-40",
      // Blank rather than ₹0.00 where an event has no money attached: a meter reading did
      // not cost nothing, it had no cost to report, and those read very differently in a
      // column somebody is adding up by eye.
      render: (e) =>
        e.amount === undefined || e.amount === 0 ? (
          <span className="text-[var(--text-secondary)]">—</span>
        ) : (
          inr(e.amount)
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/maintenance/assets"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Asset register
      </Link>

      <PageHeader
        title={`${a.assetCode} — ${a.name}`}
        subtitle="Everything recorded against this machine: what it is, what its counters read, and every job, stop and part it has seen in the window below."
        actions={
          a.openDowntimeId ? (
            <StatusBadge tone="overdue" label="Down now" />
          ) : (
            <StatusBadge status={a.status} />
          )
        }
      />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--border-subtle)] sm:grid-cols-4">
        <Fact label="Type">{humanise(a.assetType)}</Fact>
        <Fact label="Criticality">{a.criticality ?? "—"}</Fact>
        <Fact label="Where it sits">
          <span className="font-[var(--font-mono)] text-[12px]">{a.path}</span>
        </Fact>
        <Fact label="Statutory class">{humanise(a.statutoryClass)}</Fact>
        <Fact label="Warranty">{a.warrantyActive ? "In warranty" : "Not in warranty"}</Fact>
        <Fact label="AMC">{a.amc ? a.amc.contractRef : "None"}</Fact>
        <Fact label="AMC valid to">{a.amc ? date(a.amc.validTo) : "—"}</Fact>
        <Fact label="Work centre">
          {a.workCenterRef ? (
            <span className="font-[var(--font-mono)] text-[12px]">{a.workCenterRef}</span>
          ) : (
            "Not linked"
          )}
        </Fact>
      </dl>

      <div className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Meters</h2>
        <DataTable
          rows={a.meters}
          columns={meterColumns}
          rowKey={(m) => m.meterType}
          caption="Meters fitted to this asset and how recently each was read"
          empty={
            <Empty
              title="No meters on this machine"
              body="Meters appear here once a run-hour, cycle or stroke counter is fitted to the asset. Without one, its services can only fall due on the calendar."
            />
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">History</h2>
          <div className="flex items-end gap-2">
            <DateField
              label="From"
              value={window.from}
              onChange={(from) => setWindow((w) => ({ ...w, from }))}
            />
            <DateField
              label="To"
              value={window.to}
              onChange={(to) => setWindow((w) => ({ ...w, to }))}
            />
          </div>
        </div>
        <DataTable
          rows={history.data?.events ?? []}
          columns={eventColumns}
          loading={history.loading}
          error={history.error}
          onReload={history.reload}
          rowKey={(e, i) => `${e.at}-${e.type}-${e.ref}-${i}`}
          caption="Everything recorded against this asset inside the chosen window"
          empty={
            <Empty
              title="Nothing happened in this window"
              body={`No work order, stop, meter reading or spare was recorded against ${a.assetCode} between ${date(window.from)} and ${date(window.to)}. Widen the dates to look further back.`}
            />
          }
        />
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-2 text-[13px] text-[var(--text-primary)]"
      />
    </label>
  );
}

/** One labelled fact. Local to this screen — a shared version would be a spine decision. */
function Fact({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="bg-[var(--surface)] px-3 py-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 break-all text-[13px] text-[var(--text-primary)]" data-numeric="">
        {children}
      </dd>
    </div>
  );
}
