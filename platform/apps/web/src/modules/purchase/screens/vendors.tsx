"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, RefreshCw, Search, TrendingUp } from "lucide-react";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState } from "@spine/states";
import { date, humanise } from "@spine/format";
import { useAccess } from "@spine/access/permissions";
import { PageHeader } from "@spine/shell/page-header";
import type { ScreenProps } from "@spine/registry/manifest";
import type { VendorRow, VendorPerformance } from "../api";
import { purchaseApi, vendorPerformancePath } from "../api";

/**
 * VENDORS — the supplier master.
 *
 * Purchase owns this view: existing vendors need no supplier-network membership to see
 * their delivery and incoming-quality evidence.
 */
export default function VendorsScreen(_props: ScreenProps): React.JSX.Element {
  const {
    rows: all,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    reload,
  } = useCursorList<VendorRow>(purchaseApi.vendorsPath, { limit: purchaseApi.pageSize });
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (v) =>
        v.code.toLowerCase().includes(q) ||
        v.name.toLowerCase().includes(q) ||
        (v.gstin?.toLowerCase().includes(q) ?? false),
    );
  }, [all, filter]);
  const selected = all.find((vendor) => vendor.id === selectedId) ?? rows[0];

  const columns: ReadonlyArray<Column<VendorRow>> = [
    {
      key: "code",
      header: "Code",
      width: "w-40",
      render: (v) => <span className="font-semibold">{v.code}</span>,
    },
    { key: "name", header: "Name", render: (v) => <button type="button" className="text-left font-semibold text-[var(--brand)] underline-offset-4 hover:underline" onClick={() => setSelectedId(v.id)} aria-label={`View performance for ${v.name}`}>{v.name}</button> },
    {
      key: "gstin",
      header: "GSTIN",
      width: "w-56",
      // Monospaced because a GSTIN is checked character by character against a paper
      // invoice, and a proportional font makes 1/l and 0/O a coin toss on exactly the
      // fifteen characters that decide whether input credit can be claimed.
      render: (v) =>
        v.gstin ? (
          <span className="font-[var(--font-mono)] text-[12px]">{v.gstin}</span>
        ) : (
          <span className="text-[var(--text-muted)]">Not on record</span>
        ),
    },
    {
      key: "createdAt",
      header: "Added",
      width: "w-36",
      render: (v) => <span className="text-[var(--text-secondary)]">{date(v.createdAt)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Suppliers & performance"
        subtitle="See who delivers on time, review incoming quality, and open the purchase records behind each figure."
      />

      <section className="x-home-panel" aria-labelledby="vendor-performance-heading">
        <div className="x-home-panel-head flex-wrap gap-3">
          <div><h2 id="vendor-performance-heading" className="x-section-heading">Supplier performance</h2><p>Based on your purchase orders, posted receipts and completed incoming inspections.</p></div>
          {all.length > 0 ? <label className="flex min-w-0 flex-col gap-1 text-[12px] text-[var(--text-secondary)]">Review supplier<select aria-label="Review supplier performance" className="h-10 max-w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-3 text-[var(--text-primary)]" value={selected?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>{all.map((vendor) => <option value={vendor.id} key={vendor.id}>{vendor.name} · {vendor.code}</option>)}</select></label> : null}
        </div>
        {selected ? <VendorEvidence key={selected.id} vendor={selected} /> : <div className="p-5 text-[13px] text-[var(--text-secondary)]">{loading ? "Loading suppliers…" : error ? "The supplier list could not be loaded. Retry below." : "Select a supplier once a vendor record is available."}</div>}
        {hasMore ? <p className="px-5 pb-4 text-[12px] text-[var(--text-muted)]">The selector shows loaded suppliers. Load more in the directory below to see the rest.</p> : null}
      </section>

      <h2 className="x-section-heading">Supplier directory</h2>

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name, code or GSTIN…"
          aria-label="Filter vendors"
          className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onReload={reload}
        rowKey={(v) => v.id}
        caption="Vendors with code, name and GSTIN"
        empty={
          filter ? (
            <Empty
              title="Nothing matches that filter"
              body={`No vendor matched “${filter}”.`}
            />
          ) : (
            <Empty
              title="No vendors yet"
              body="Vendors appear here once a supplier is added to the master. A purchase order cannot be raised until one exists."
            />
          )
        }
      />
    </div>
  );
}

function VendorEvidence({ vendor }: { vendor: VendorRow }): React.JSX.Element {
  const { can } = useAccess();
  const query = useQuery<VendorPerformance>(vendorPerformancePath(vendor.id));
  const data = query.data;
  const format = (value: number): string => value.toLocaleString("en-IN", { maximumFractionDigits: 3 });
  if (query.error) return <div className="p-5"><ErrorState error={query.error} onRetry={query.reload} /></div>;
  if (!data) return <p className="p-5 text-[13px] text-[var(--text-secondary)]" role="status">Reading {vendor.name}’s purchase and inspection evidence…</p>;
  return <div className="space-y-5 p-5" aria-busy={query.loading}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[15px] font-semibold text-[var(--text-primary)]">{data.vendor.name}</p><p className="text-[12px] text-[var(--text-muted)]">All recorded history · Read {new Date(data.asOf).toLocaleString("en-IN")}</p></div><button type="button" className="btn btn-secondary btn-sm" disabled={query.loading} onClick={query.reload}><RefreshCw className={`h-3.5 w-3.5 ${query.loading ? "animate-spin" : ""}`} aria-hidden />Refresh evidence</button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <EvidenceStat label="Purchase orders" value={String(data.orders.total)} hint={`${data.receipts.count} posted receipts · ${data.orders.completed} completed orders`} />
      <EvidenceStat label="On-time delivery" value={data.delivery.onTimeRate === null ? "Unknown" : `${data.delivery.onTimeRate}%`} hint={`${data.delivery.onTime} of ${data.delivery.sampleSize} measurable completed orders`} />
      <EvidenceStat label="Awaiting receipt" value={String(data.orders.awaitingReceipt)} hint={`${data.orders.overdue} past the recorded promised date; approved or partially received`} />
      <EvidenceStat label="Quality evidence" value={String(data.quality.inspectionCount)} hint="Completed incoming inspections; rejection rates are shown per material below" />
    </div>
    {data.delivery.sampleSize === 0 || data.delivery.excludedCompleted > 0 || data.quality.excludedInspections > 0 ? <div className="x-notice" data-tone="warning"><div>{data.delivery.sampleSize === 0 ? <p>No completed order has both a promised date and posted receipt evidence, so delivery performance is unknown.</p> : null}{data.delivery.excludedCompleted > 0 ? <p>{data.delivery.excludedCompleted} completed orders are excluded because a promised date or receipt is missing.</p> : null}{data.quality.excludedInspections > 0 ? <p>{data.quality.excludedInspections} inspections lack usable quantities or a matching receipt material and are excluded from rates.</p> : null}</div></div> : null}
    <div><h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">Incoming quality by material</h3>{data.quality.materials.length ? <div className="overflow-x-auto"><table className="x-data-table min-w-[42rem]"><thead><tr><th>Material</th><th>Received</th><th>Accepted / rejected</th><th>Rejection rate</th><th>Inspection evidence</th></tr></thead><tbody>{data.quality.materials.map((material) => <tr key={material.itemId}><td><strong>{material.itemCode ?? "Unlabelled material"}</strong><div className="text-[11px] text-[var(--text-muted)]">{material.itemName ?? "Item master label unavailable"}</div></td><td>{format(material.receivedQty)} {material.uom ?? "(unit unavailable)"}</td><td>{material.inspectionCount ? `${format(material.acceptedQty)} / ${format(material.rejectedQty)} ${material.uom ?? "(unit unavailable)"}` : "Not measured"}</td><td>{material.rejectionRate === null ? "Unknown" : `${material.rejectionRate}%`}</td><td>{material.inspections.length ? <div className="flex flex-col gap-1">{material.inspections.map((inspection) => can("quality.inspection.read") ? <Link className="text-[var(--brand)] underline underline-offset-2" key={inspection.id} href={`/quality/inspection/${inspection.id}`}>{inspection.inspectionNo}</Link> : <span key={inspection.id}>{inspection.inspectionNo}</span>)}</div> : "No usable completed inspection"}</td></tr>)}</tbody></table></div> : <p className="text-[13px] text-[var(--text-secondary)]">No posted receipt lines are available. Quality performance is unknown.</p>}</div>
    <div><h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">Purchase-order evidence</h3>{data.evidence.length ? <div className="overflow-x-auto"><table className="x-data-table min-w-[36rem]"><thead><tr><th>Purchase order</th><th>Promised</th><th>Final posted receipt</th><th>Status</th></tr></thead><tbody>{data.evidence.map((row) => <tr key={row.poId}><td>{can("purchase.po.read") ? <Link className="inline-flex items-center gap-1 text-[var(--brand)] underline underline-offset-2" href={`/purchase/order/${row.poId}`}>{row.poNo}<ArrowUpRight className="h-3 w-3" aria-hidden /></Link> : row.poNo}</td><td>{row.expectedDate ? date(row.expectedDate) : "Not recorded"}</td><td>{row.lastReceiptDate ? date(row.lastReceiptDate) : "No posted receipt"}</td><td>{humanise(row.status)}</td></tr>)}</tbody></table></div> : <p className="text-[13px] text-[var(--text-secondary)]">No purchase orders are recorded for this supplier.</p>}</div>
    <p className="text-[12px] leading-6 text-[var(--text-muted)]">{data.method}</p>
  </div>;
}

function EvidenceStat({ label, value, hint }: { label: string; value: string; hint: string }): React.JSX.Element {
  return <div className="x-stat-card"><span className="x-stat-top">{label}<TrendingUp className="h-4 w-4" aria-hidden /></span><strong className="x-stat-value">{value}</strong><p className="x-stat-hint">{hint}</p></div>;
}
