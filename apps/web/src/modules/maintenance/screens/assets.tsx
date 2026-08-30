"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { AssetRow } from "../api";
import { maintenanceApi } from "../api";

const CRITICALITIES = ["A", "B", "C"] as const;

/**
 * THE ASSET REGISTER — every machine the plant maintains, and which of them are stopped.
 *
 * Returns a bare array; `criticality`, `statutoryClass` and `areaPath` are optional server
 * filters. Criticality is filtered SERVER-side because it is the question a maintenance
 * planner actually asks ("show me the A machines"), and the text box filters client-side
 * because a name search wants to be instant.
 *
 * "Down now" is not a column the server sends: it is `openDowntimeId` being non-null, which
 * means a downtime interval on this machine has no end yet. Naming it plainly matters more
 * than the status word, because `under_maintenance` is derived from exactly that fact.
 */
export default function AssetsScreen(_props: ScreenProps): React.JSX.Element {
  const router = useRouter();
  const [criticality, setCriticality] = useState("");
  const [filter, setFilter] = useState("");

  const { data, loading, error, reload } = useQuery<AssetRow[]>(maintenanceApi.assetsPath, {
    query: { criticality: criticality || undefined },
  });

  const rows = useMemo(() => {
    const all = data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (a) =>
        a.assetCode.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.path.toLowerCase().includes(q),
    );
  }, [data, filter]);

  const down = (data ?? []).filter((a) => a.openDowntimeId !== null).length;

  const columns: ReadonlyArray<Column<AssetRow>> = [
    {
      key: "asset",
      header: "Asset",
      render: (a) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{a.assetCode}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{a.name}</div>
        </div>
      ),
    },
    {
      key: "path",
      header: "Where it sits",
      width: "w-64",
      render: (a) => (
        <span className="font-[var(--font-mono)] text-[12px] text-[var(--text-secondary)]">
          {a.path}
        </span>
      ),
    },
    {
      key: "criticality",
      header: "Criticality",
      width: "w-28",
      // A, B and C are a classification, not a workflow state, so a neutral chip. Colouring
      // an A machine red would say "this one has a problem" when it says "this one matters".
      render: (a) =>
        a.criticality ? <StatusBadge tone="unknown" label={a.criticality} /> : <span>—</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "w-44",
      render: (a) =>
        a.openDowntimeId ? (
          <StatusBadge tone="overdue" label="Down now" />
        ) : (
          <StatusBadge status={a.status} />
        ),
    },
    {
      key: "meters",
      header: "Meter",
      numeric: true,
      width: "w-48",
      // The first meter only. A machine with two counters is rare and the 360 view shows
      // both; crowding the register with them would cost the scan this table exists for.
      render: (a) => {
        const m = a.meters[0];
        if (!m) return <span className="text-[var(--text-secondary)]">—</span>;
        return (
          <span className={m.stale ? "text-[var(--text-muted)]" : undefined}>
            {num(m.currentValue, 1)} {m.uom}
            {m.stale ? " (stale)" : ""}
          </span>
        );
      },
    },
    {
      key: "cover",
      header: "Cover",
      width: "w-36",
      render: (a) =>
        a.warrantyActive ? (
          <StatusBadge tone="approved" label="In warranty" />
        ) : a.amc ? (
          <StatusBadge tone="approved" label="AMC" />
        ) : (
          <span className="text-[var(--text-secondary)]">—</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Assets"
        subtitle="Every machine, area and component the plant maintains, in the hierarchy it actually sits in. A machine shows as down when a downtime interval on it has no end yet."
        meta={
          (data?.length ?? 0) > 0
            ? [
                { label: "Assets", value: String(data?.length ?? 0) },
                { label: "Down now", value: String(down) },
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
            placeholder="Filter by code, name or area…"
            aria-label="Filter assets"
            className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
        <select
          value={criticality}
          onChange={(e) => setCriticality(e.target.value)}
          aria-label="Criticality"
          className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-[13px] text-[var(--text-primary)]"
        >
          <option value="">All criticalities</option>
          {CRITICALITIES.map((c) => (
            <option key={c} value={c}>
              Criticality {c}
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
        rowKey={(a) => a.id}
        onRowClick={(a) => router.push(`/maintenance/asset/${encodeURIComponent(a.assetCode)}`)}
        caption="The maintenance asset register with criticality, status and meter readings"
        empty={
          filter || criticality ? (
            <Empty
              title="Nothing matches that filter"
              body="No asset in the register matched what you asked for. Clear the filters to see everything."
            />
          ) : (
            <Empty
              title="No assets registered"
              body="Assets appear here once the plant, its areas and its machines have been entered. Nothing else in Maintenance can be recorded until at least one machine exists."
            />
          )
        }
      />
    </div>
  );
}
