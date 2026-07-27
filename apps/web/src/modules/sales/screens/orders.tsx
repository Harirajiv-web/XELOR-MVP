"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Can } from "@spine/access/permissions";
import { useCursorList } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { inr, date, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { SalesOrderSummary } from "../api";
import { creditBadge, isPastDue, salesApi, sumAmounts } from "../api";
import { NewOrderDialog } from "../components/new-order-dialog";

/** Once an order has fully shipped, a date that has passed is history, not a problem. */
const SETTLED = new Set(["dispatched", "cancelled", "closed"]);

/**
 * SALES ORDERS — where the factory's day starts.
 *
 * A confirmed order here becomes demand, becomes a plan, becomes a purchase, becomes
 * production, becomes a dispatch. Three columns earn their place by answering the only
 * three questions a plant manager opens this list with:
 *
 *   PROMISED — when did we say, and is that date behind us? Absolute date and relative
 *              phrasing together, because the absolute is what goes in the email to the
 *              customer and the relative is what tells you to send it today.
 *   CREDIT   — is this stuck at OUR end? An order on credit hold is not the customer's
 *              problem, it is waiting on a manager in this building.
 *   STATUS   — how far down the chain has it actually got?
 *
 * "Waiting on us" and "already late" are deliberately different chips. Collapsing them into
 * one amber "pending" is how a status column turns into decoration.
 */
export default function OrdersScreen(_props: ScreenProps): React.JSX.Element {
  const router = useRouter();
  const { rows, loading, loadingMore, error, hasMore, loadMore, reload } =
    useCursorList<SalesOrderSummary>(salesApi.ordersPath, { limit: salesApi.pageSize });
  const [filter, setFilter] = useState("");
  // Unmounted when closed, deliberately: the dialog pins ONE Idempotency-Key for its
  // lifetime, so "closed and reopened" has to mean "a new key, a genuinely new order".
  const [creating, setCreating] = useState(false);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    // Filters what has been LOADED, not what exists. Honest because the table's own footer
    // says how many rows are on screen and whether more are available behind Load more.
    return rows.filter(
      (o) =>
        o.soNo.toLowerCase().includes(q) ||
        o.custPoNo.toLowerCase().includes(q) ||
        (o.customerName ?? "").toLowerCase().includes(q),
    );
  }, [rows, filter]);

  const orderValue = useMemo(() => sumAmounts(rows.map((o) => o.grandTotal)), [rows]);
  const late = useMemo(
    () => rows.filter((o) => !SETTLED.has(o.status) && isPastDue(o.requestedDeliveryDate)).length,
    [rows],
  );

  const columns: ReadonlyArray<Column<SalesOrderSummary>> = [
    {
      key: "order",
      header: "Order",
      width: "w-52",
      render: (o) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{o.soNo}</div>
          {/* Their PO number, not ours. It is what the customer quotes on the phone. */}
          <div className="truncate text-[12px] text-[var(--text-secondary)]">
            Their PO {o.custPoNo}
          </div>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (o) => (
        <div className="min-w-0">
          <div className="truncate text-[var(--text-primary)]">{o.customerName ?? "—"}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">
            {o.customerCode ?? "—"}
          </div>
        </div>
      ),
    },
    {
      key: "promised",
      header: "Promised",
      width: "w-48",
      render: (o) => {
        if (!o.requestedDeliveryDate) {
          // Null is a real answer — some orders are taken with no promised date, and saying
          // so beats a dash that reads as something somebody forgot to type in.
          return <span className="text-[var(--text-secondary)]">No date promised</span>;
        }
        const overdue = !SETTLED.has(o.status) && isPastDue(o.requestedDeliveryDate);
        return (
          <div className="min-w-0">
            <div className="text-[var(--text-primary)]">{date(o.requestedDeliveryDate)}</div>
            {overdue ? (
              // A triangle, not just red text: "already late" has to survive being read by
              // somebody who cannot tell red from grey.
              <StatusBadge
                tone="overdue"
                label={relativeDays(o.requestedDeliveryDate)}
                className="mt-0.5"
              />
            ) : (
              <div className="text-[12px] text-[var(--text-secondary)]">
                {relativeDays(o.requestedDeliveryDate)}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "credit",
      header: "Credit",
      width: "w-40",
      render: (o) => {
        const c = creditBadge(o.creditStatus);
        return <StatusBadge tone={c.tone} label={c.label} />;
      },
    },
    {
      key: "status",
      header: "Status",
      width: "w-44",
      render: (o) => <StatusBadge status={o.status} />,
    },
    {
      key: "value",
      header: "Order value",
      numeric: true,
      width: "w-40",
      render: (o) => <span className="font-semibold">{inr(o.grandTotal)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Sales orders"
        subtitle="Every order the plant has accepted, when it was promised, and how far it has travelled — confirmed, part-shipped or fully dispatched. A confirmed order is what planning and production work from."
        meta={
          rows.length > 0
            ? [
                { label: "Loaded", value: String(rows.length) },
                { label: "Past their date", value: String(late) },
                { label: "Value loaded", value: inr(orderValue) },
              ]
            : []
        }
        actions={
          // Gated, not disabled. Somebody who cannot raise an order is never offered the
          // button — a control that exists only to refuse you is worse than no control, and
          // `Can` denies by default while access is still loading rather than flashing it.
          // The guard here decides what to DRAW; `@RequirePermission("sales.order.create")`
          // on the endpoint is the one that decides what is allowed.
          <Can permission="sales.order.create">
            <button type="button" className="btn btn-pri" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New order
            </button>
          </Can>
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
          placeholder="Filter by order, customer PO or customer…"
          aria-label="Filter sales orders"
          className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </div>

      <DataTable
        rows={shown}
        columns={columns}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onReload={reload}
        onRowClick={(o) => router.push(`/sales/order/${o.id}`)}
        rowKey={(o) => o.id}
        caption="Sales orders with their promised date, credit verdict, status and value"
        empty={
          filter ? (
            <Empty
              title="Nothing matches that filter"
              body={`No loaded order, customer PO or customer matched “${filter}”.`}
            />
          ) : (
            <Empty
              title="No sales orders yet"
              body="Orders appear here once a customer's purchase order has been entered against a customer in the master."
              action={
                <Can permission="sales.order.create">
                  <button type="button" className="btn btn-pri" onClick={() => setCreating(true)}>
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Enter the first order
                  </button>
                </Can>
              }
            />
          )
        }
      />

      {creating ? (
        <NewOrderDialog
          onClose={() => setCreating(false)}
          // Close AND GO TO THE ORDER. A form that saves and leaves you looking at the same
          // empty form teaches people it did not work — so the created document, with its
          // real SO number and its server-computed tax, is what they see next.
          onCreated={(order) => {
            setCreating(false);
            router.push(`/sales/order/${order.id}`);
          }}
        />
      ) : null}
    </div>
  );
}
