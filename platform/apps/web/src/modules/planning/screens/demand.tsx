"use client";

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { num, qty } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { cn } from "@spine/ui/cn";
import type { ScreenProps } from "@spine/registry/manifest";
import type { DemandItem } from "../api";
import { planningApi } from "../api";

const HORIZONS = [6, 13, 26] as const;

/**
 * THE DEMAND GRID — what the factory has been asked for, week by week.
 *
 * The one thing this screen exists to make visible: REAL ORDERS CONSUME THE FORECAST THEY
 * WERE PREDICTED BY. Adding them together plans the same pump twice and the plant builds
 * inventory nobody asked for, so the cell shows the NET figure large — the number MRP
 * actually explodes — with the orders and the surviving forecast underneath it. A grid that
 * showed only the total would hide the single most expensive mistake in demand planning.
 *
 * The columns are built from the data rather than declared, because the horizon is a choice
 * the user makes on this screen and the bucket labels come back from the server.
 *
 * `buckets` is always sent. It defaults to 6 server-side, but sending it means the control
 * below and the data on screen cannot drift apart.
 */
export default function DemandScreen(_props: ScreenProps): React.JSX.Element {
  const [buckets, setBuckets] = useState<number>(6);

  const { data, loading, error, reload } = useQuery<{ data: DemandItem[] }>(
    planningApi.demandPath,
    { query: { buckets } },
  );

  const rows = useMemo(() => data?.data ?? [], [data]);

  // Every item is assembled over the same horizon, so the first row's labels are the grid's.
  const labels = useMemo(() => rows[0]?.buckets.map((b) => b.bucket) ?? [], [rows]);

  // Warnings are per item but read as one list: "SO-0042 has no requested delivery date" is
  // a message about an order, and repeating it under every item would bury it.
  const warnings = useMemo(
    () => [...new Set(rows.flatMap((r) => r.warnings))],
    [rows],
  );

  const columns: ReadonlyArray<Column<DemandItem>> = [
    {
      key: "item",
      header: "Item",
      width: "w-48",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.itemCode}</div>
          {r.warnings.length > 0 ? (
            <div className="flex items-center gap-1 text-[12px] text-[var(--status-pending-text)]">
              <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
              {r.warnings.length} warning{r.warnings.length === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>
      ),
    },
    ...labels.map(
      (label): Column<DemandItem> => ({
        key: label,
        header: label,
        numeric: true,
        render: (r) => {
          const cell = r.buckets.find((b) => b.bucket === label);
          if (!cell || cell.netDemand === 0) {
            return <span className="text-[var(--text-muted)]">—</span>;
          }
          return (
            <div>
              <div className="font-semibold tabular-nums text-[var(--text-primary)]">
                {num(cell.netDemand, 0)}
              </div>
              <div className="text-[11px] tabular-nums text-[var(--text-secondary)]">
                {num(cell.orderQty, 0)} ord · {num(cell.remainingForecast, 0)} fc
              </div>
            </div>
          );
        },
      }),
    ),
    {
      key: "total",
      header: "Total",
      numeric: true,
      width: "w-28",
      render: (r) => (
        <span className="font-semibold">
          {qty(r.buckets.reduce((sum, b) => sum + b.netDemand, 0))}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Demand"
        subtitle="What has been asked for, by week. Confirmed sales orders eat into the forecast they were predicted by rather than adding to it — the big number in each cell is what MRP will actually plan for."
        meta={rows.length > 0 ? [{ label: "Items with demand", value: String(rows.length) }] : []}
      />

      <div className="flex items-center gap-1" role="group" aria-label="Planning horizon">
        {HORIZONS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setBuckets(h)}
            aria-pressed={buckets === h}
            className={cn(
              "h-9 rounded-[var(--radius-control)] border px-3 text-[13px] font-medium transition-colors",
              buckets === h
                ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                : "border-[var(--border-input)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
            )}
          >
            {h} weeks
          </button>
        ))}
      </div>

      {warnings.length > 0 ? (
        <section className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-primary)]">
            <TriangleAlert className="h-3.5 w-3.5 text-[var(--status-pending-text)]" aria-hidden />
            {warnings.length} thing{warnings.length === 1 ? "" : "s"} the demand does not say
            for itself
          </h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {warnings.map((w) => (
              <li key={w} className="text-[13px] leading-5 text-[var(--text-secondary)]">
                {w}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.itemId}
        density="compact"
        caption="Net independent demand by item and week, after forecast consumption"
        empty={
          <Empty
            title="Nothing has been asked for in this horizon"
            body="Demand appears here from confirmed sales orders, from the planner's forecast, and from spares lines. An item with no planning policy is never planned, so it never shows up here either — check the planning policies if something is missing."
          />
        }
      />
    </div>
  );
}
