"use client";

import { useMemo, useState } from "react";
import { CircleCheckBig, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Can } from "@spine/access/permissions";
import { useCursorList } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, qty } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import { StagePanel } from "@spine/ui/stage-panel";
import type { ScreenProps } from "@spine/registry/manifest";
import type { ProductionOrderRow } from "../api";
import { outstanding, productionApi } from "../api";
import { NewWorkOrderDialog } from "../components/new-order-dialog";

/**
 * WORK ORDERS — what the floor has been told to make.
 *
 * Cursor-paged through `useCursorList`: no page numbers, because the API cannot honestly
 * support jumping to page 7, and a Load more that actually loads more rather than a footer
 * that admits there is more and offers no way to reach it.
 *
 * The text filter narrows what is ALREADY LOADED, which is the honest reading of a
 * cursor-paged list and why the placeholder says so. A filter that quietly searched only the
 * first page while looking like it searched everything would be worse than no filter at all.
 *
 * ONE ACTION LIVES HERE: raising a work order, behind `production.order.create`. It creates
 * a document and moves no stock — issuing components and receiving output are on the order's
 * own screen, behind their own permission and their own confirmation. There is no edit: the
 * API has no PATCH for a production order, and this screen does not pretend otherwise.
 */
export default function ProductionOrdersScreen(_props: ScreenProps): React.JSX.Element {
  const router = useRouter();
  const { rows, loading, loadingMore, error, hasMore, loadMore, reload } =
    useCursorList<ProductionOrderRow>(productionApi.ordersPath);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  // The order that was just raised, kept so the screen can NAME it. "Saved" alone is not a
  // confirmation on a shop floor — the number is what gets written on the job card.
  const [raised, setRaised] = useState<{ id: string; orderNo: string } | null>(null);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.orderNo.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        (r.itemCode ?? "").toLowerCase().includes(q) ||
        (r.itemName ?? "").toLowerCase().includes(q),
    );
  }, [rows, filter]);

  const open = rows.filter((r) => r.status !== "completed").length;

  const columns: ReadonlyArray<Column<ProductionOrderRow>> = [
    {
      key: "orderNo",
      header: "Work order",
      width: "w-44",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.orderNo}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">Raised {date(r.createdAt)}</div>
        </div>
      ),
    },
    {
      key: "item",
      header: "Item",
      // The part number, the way the drawing and the stores bin label say it. The internal
      // id shows only where the item master has no row for it — a fault, not a layout.
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">
            {r.itemCode ?? <span className="font-[var(--font-mono)] text-[12px]">{r.itemId}</span>}
          </div>
          {r.itemName ? (
            <div className="truncate text-[12px] text-[var(--text-secondary)]">{r.itemName}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "qtyToProduce",
      header: "Ordered",
      numeric: true,
      width: "w-32",
      render: (r) => qty(r.qtyToProduce, r.uom),
    },
    {
      key: "producedQty",
      header: "Produced",
      numeric: true,
      width: "w-32",
      render: (r) => <span className="font-semibold">{qty(r.producedQty, r.uom)}</span>,
    },
    {
      key: "remaining",
      header: "Still to make",
      numeric: true,
      width: "w-36",
      // Computed here rather than asked of the reader. "600 ordered, 425 produced" makes a
      // supervisor do arithmetic standing at a machine, and they will do it wrong once.
      render: (r) => qty(outstanding(r.qtyToProduce, r.producedQty), r.uom),
    },
    {
      key: "status",
      header: "Status",
      width: "w-40",
      render: (r) => <StatusBadge status={r.status} />,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Work orders"
        subtitle="Every order the plant has been told to make, with how much of it has actually come off the line. Quantities move only when components are issued or output is received."
        meta={
          rows.length > 0
            ? [
                { label: "Loaded", value: String(rows.length) },
                { label: "Not finished", value: String(open) },
              ]
            : []
        }
        actions={
          <Can permission="production.order.create">
            <button
              type="button"
              className="btn btn-pri min-h-[42px]"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New work order
            </button>
          </Can>
        }
      />

      {/* The mission lands here for the "release the work order" step. Absent otherwise. */}
      <StagePanel />

      {raised ? (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-[var(--radius-card)] border border-[var(--ok)] bg-[var(--ok-soft)] px-3 py-2.5 text-[13px] text-[var(--ok-ink)]"
        >
          <CircleCheckBig className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <b>{raised.orderNo}</b> raised. Nothing has left stores yet — open it to issue
            components when the material is drawn.
          </span>
          <Link href={`/production/order/${raised.id}`} className="btn btn-ghost btn-sm shrink-0">
            Open {raised.orderNo}
          </Link>
          <button
            type="button"
            onClick={() => setRaised(null)}
            aria-label="Dismiss"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-control)] transition-colors hover:bg-[var(--surface)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter the loaded orders…"
          aria-label="Filter work orders"
          className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
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
        onRowClick={(r) => router.push(`/production/order/${r.id}`)}
        caption="Production work orders with ordered and produced quantities"
        empty={
          filter ? (
            <Empty
              title="Nothing matches that filter"
              body={`No loaded work order matched “${filter}”. If more pages are available, load them and try again.`}
            />
          ) : (
            <Empty
              title="No work orders yet"
              body="Work orders appear here once a planned order is firmed, or once one is raised directly against an item that has a bill of materials."
              action={
                <Can permission="production.order.create">
                  <button
                    type="button"
                    className="btn btn-pri min-h-[42px]"
                    onClick={() => setCreating(true)}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Raise the first work order
                  </button>
                </Can>
              }
            />
          )
        }
      />

      {creating ? (
        <NewWorkOrderDialog
          onClose={() => setCreating(false)}
          onCreated={(order) => {
            setCreating(false);
            setRaised({ id: order.id, orderNo: order.orderNo });
            // The list is cursor-paged and ordered by creation, so the new order is on the
            // LAST page, not the first. Reloading is honest about that rather than pretending
            // to insert it at the top; the strip above carries the link to it.
            reload();
          }}
        />
      ) : null}
    </div>
  );
}
