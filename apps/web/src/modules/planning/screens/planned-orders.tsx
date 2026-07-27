"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, humanise, qty, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import { cn } from "@spine/ui/cn";
import type { ScreenProps } from "@spine/registry/manifest";
import type { MrpRunHeader, PlannedOrderRow } from "../api";
import { planningApi } from "../api";

const SOURCES = [
  { value: "", label: "Everything" },
  { value: "make", label: "Make" },
  { value: "buy", label: "Buy" },
] as const;

/**
 * THE PLANNED-ORDER WORKBENCH — read side.
 *
 * A planned order is a SUGGESTION. It costs nothing, commits nobody, and the next
 * regenerative run throws it away and proposes it again. Saying so in the subtitle is not
 * politeness: a planner who thinks this list has already ordered something behaves very
 * differently from one who knows it has not.
 *
 * EVERY ROW IS CLICKABLE, and that is the point of the screen. It opens the run's own
 * week-by-week working for that item — the gross requirement, what was already coming, what
 * was on hand, and the shortfall that produced this number. A planned order nobody can trace
 * back to its demand is a number an operator will not act on, and it is exactly what
 * separates this from the spreadsheet it replaces.
 *
 * The run number is not on these rows, so it is fetched once from `mrp/runs/latest` — the
 * same run the list itself defaults to when no `runNo` is supplied.
 */
export default function PlannedOrdersScreen(_props: ScreenProps): React.JSX.Element {
  const router = useRouter();
  const [source, setSource] = useState<string>("");
  const [filter, setFilter] = useState("");

  const run = useQuery<MrpRunHeader | null>(planningApi.latestRunPath);
  const { data, loading, error, reload } = useQuery<{ data: PlannedOrderRow[] }>(
    planningApi.plannedOrdersPath,
    { query: { sourceType: source } },
  );

  const runNo = run.data?.runNo ?? null;
  const all = useMemo(() => data?.data ?? [], [data]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) => r.itemCode.toLowerCase().includes(q) || r.orderKey.toLowerCase().includes(q),
    );
  }, [all, filter]);

  const lateCount = all.filter((r) => r.pastDue).length;

  const columns: ReadonlyArray<Column<PlannedOrderRow>> = [
    {
      key: "item",
      header: "Item",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.itemCode}</div>
          {/* Why this quantity and not the bare shortage. The lot rule is the single most
              common "the system is wrong" complaint, and it is almost never wrong — it is
              unexplained. So it is in the row, not behind a tooltip. */}
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{r.lotReason}</div>
        </div>
      ),
    },
    {
      key: "sourceType",
      header: "Make / buy",
      width: "w-28",
      render: (r) => <StatusBadge tone="unknown" label={humanise(r.sourceType)} />,
    },
    {
      key: "qty",
      header: "Quantity",
      numeric: true,
      width: "w-32",
      render: (r) => <span className="font-semibold">{qty(r.qty)}</span>,
    },
    {
      key: "release",
      header: "Release",
      width: "w-52",
      // The date AND the relative phrasing. "In 5 days" is what a planner acts on;
      // "27-Jul-2026" is what they put in the email to the supplier, and a screen that shows
      // only one of the two makes them do the arithmetic themselves.
      render: (r) => (
        <div>
          <div className="text-[var(--text-primary)]">{date(r.releaseDate)}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            {r.releaseBucket} · {relativeDays(r.releaseDate)}
          </div>
        </div>
      ),
    },
    {
      key: "needDate",
      header: "Wanted by",
      width: "w-52",
      // The date the material is actually needed, not the week it lands in. "When is this
      // wanted?" is the question the screen gets opened with, and answering it with a bucket
      // label makes a planner do calendar arithmetic to get back to a date they can say out
      // loud to a supplier.
      render: (r) => (
        <div>
          <div className="text-[var(--text-primary)]">{date(r.needDate)}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            {r.receiptBucket} · {relativeDays(r.needDate)}
          </div>
        </div>
      ),
    },
    {
      key: "late",
      header: "Late",
      width: "w-40",
      // `pastDue` means the lead time wanted this order released in a week that has already
      // gone. Kept as its own column rather than folded into the status, because it is a
      // fact about physics and the status is a fact about paperwork.
      render: (r) =>
        r.pastDue ? (
          <div>
            <StatusBadge
              tone="overdue"
              label={`${r.daysLate} day${r.daysLate === 1 ? "" : "s"} late`}
            />
            <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
              wanted {r.computedReleaseBucket}
            </div>
          </div>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      width: "w-44",
      render: (r) => (
        <div>
          <StatusBadge status={r.status} />
          {r.convertedToRef ? (
            <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
              {r.convertedToRef}
            </div>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Planned orders"
        subtitle="What the last MRP run says should be made or bought, and when it has to start. Every line is a suggestion — nothing here has been ordered, and nothing on this screen orders it."
        meta={[
          ...(runNo ? [{ label: "From run", value: runNo }] : []),
          ...(all.length > 0 ? [{ label: "Orders", value: String(all.length) }] : []),
          ...(lateCount > 0 ? [{ label: "Already late", value: String(lateCount) }] : []),
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by item or order key…"
            aria-label="Filter planned orders"
            className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
        {/* Make/buy goes to the server because the two lists go to two different people —
            a shop-floor supervisor and a buyer — and neither wants to scroll past the other's. */}
        <div className="flex items-center gap-1" role="group" aria-label="Filter by source">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSource(s.value)}
              aria-pressed={source === s.value}
              className={cn(
                "h-9 rounded-[var(--radius-control)] border px-3 text-[13px] font-medium transition-colors",
                source === s.value
                  ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "border-[var(--border-input)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading || run.loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.id}
        {...(runNo
          ? { onRowClick: (r: PlannedOrderRow) => router.push(planningApi.explainHref(runNo, r.itemCode)) }
          : {})}
        caption="Planned orders from the latest MRP run"
        empty={
          filter || source ? (
            <Empty
              title="Nothing matches those filters"
              body="No planned order in this run matched. Clear the filters to see the whole plan."
            />
          ) : (
            <Empty
              title="No planned orders"
              body="Planned orders appear here after an MRP run. Either MRP has not been run, or the run found nothing short across the horizon — which is the good outcome."
            />
          )
        }
      />

      {runNo && rows.length > 0 ? (
        <p className="text-[12px] text-[var(--text-muted)]">
          Click any row to see the week-by-week working behind it — the demand, the stock on
          hand, the supply already coming, and the shortfall that produced this quantity.
        </p>
      ) : null}
    </div>
  );
}
