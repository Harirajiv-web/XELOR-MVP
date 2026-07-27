"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCursorList } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { humanise, qty } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { InspectionRow } from "../api";
import { qualityApi } from "../api";

/**
 * INSPECTIONS — every lot that was judged, and what the judgement was.
 *
 * THREE COLUMNS THAT LOOK SIMILAR AND ARE NOT. The GATE says where in the process this
 * check sits: an incoming rejection sends material back to a supplier, a final rejection
 * stops a despatch, and reading one as the other is an expensive mistake. STAGE says whether
 * the inspector has finished. VERDICT says what the readings decided. Collapsing any two of
 * them would hide the distinction somebody opened this list to find.
 */
export default function InspectionsScreen(_props: ScreenProps): React.JSX.Element {
  const router = useRouter();
  const { rows, loading, loadingMore, error, hasMore, loadMore, reload } =
    useCursorList<InspectionRow>(qualityApi.inspectionsPath);
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.inspectionNo.toLowerCase().includes(q) ||
        r.inspectionType.toLowerCase().includes(q) ||
        r.result.toLowerCase().includes(q) ||
        (r.itemCode ?? "").toLowerCase().includes(q) ||
        (r.itemName ?? "").toLowerCase().includes(q),
    );
  }, [rows, filter]);

  const rejected = rows.filter((r) => r.result === "rejected").length;

  const columns: ReadonlyArray<Column<InspectionRow>> = [
    {
      key: "inspectionNo",
      header: "Inspection",
      width: "w-40",
      render: (r) => <span className="font-semibold">{r.inspectionNo}</span>,
    },
    {
      key: "inspectionType",
      header: "Gate",
      width: "w-36",
      // Where in the process the check sits. A neutral chip: it is a classification, not a
      // state, and it must not compete with the two columns that carry the outcome.
      render: (r) => <StatusBadge tone="unknown" label={humanise(r.inspectionType)} />,
    },
    {
      key: "item",
      header: "Item",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">
            {r.itemCode ?? (
              <span className="font-[var(--font-mono)] text-[12px]">{r.itemRef ?? "—"}</span>
            )}
          </div>
          {r.itemName ? (
            <div className="truncate text-[12px] text-[var(--text-secondary)]">{r.itemName}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "lotQty",
      header: "Lot",
      numeric: true,
      width: "w-32",
      render: (r) => qty(r.lotQty, r.uom),
    },
    {
      key: "sample",
      header: "Sample",
      numeric: true,
      width: "w-24",
      // A blank sample size means no sampling plan applied to this item, not zero samples.
      render: (r) => (r.sampleSize === null ? "—" : String(r.sampleSize)),
    },
    {
      key: "status",
      header: "Stage",
      width: "w-36",
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "result",
      header: "Verdict",
      width: "w-36",
      render: (r) => <StatusBadge status={r.result} />,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Inspections"
        subtitle="Every lot that has been put in front of an inspector, with the gate it was checked at, the sample size the plan called for, and the verdict the readings produced."
        meta={
          rows.length > 0
            ? [
                { label: "Loaded", value: String(rows.length) },
                { label: "Rejected", value: String(rejected) },
              ]
            : []
        }
      />

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter the loaded inspections…"
          aria-label="Filter inspections"
          className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </div>

      <DataTable
        rows={visible}
        columns={columns}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        onReload={reload}
        hasMore={hasMore}
        onLoadMore={loadMore}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/quality/inspection/${r.id}`)}
        caption="Inspections with gate, lot size, sample size and verdict"
        empty={
          filter ? (
            <Empty
              title="Nothing matches that filter"
              body={`No loaded inspection matched “${filter}”. If more pages are available, load them and try again.`}
            />
          ) : (
            <Empty
              title="No inspections yet"
              body="Inspections appear here when a goods receipt or a work order asks for one, or when an inspector opens a first-article or audit check directly."
            />
          )
        }
      />
    </div>
  );
}
