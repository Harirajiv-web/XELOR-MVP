"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCursorList } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { Can } from "@spine/access/permissions";
import { inr, date, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import { cn } from "@spine/ui/cn";
import { StagePanel } from "@spine/ui/stage-panel";
import type { ScreenProps } from "@spine/registry/manifest";
import type { PoSummaryRow } from "../api";
import { purchaseApi, isLate } from "../api";
import { NewPurchaseOrderModal } from "../components/new-purchase-order";
import { announceDemoRecordCreated } from "@spine/demo/demo-events";

/**
 * PURCHASE ORDERS — the list a plant manager opens to answer one question: what is
 * committed, and where has it got to.
 *
 * The status tabs are the screen, not decoration. Purchase is where money leaves the
 * company, and the three states that matter are not equally urgent: an order awaiting
 * approval is blocked on somebody inside this building, an approved one is blocked on the
 * vendor, and a partly received one is a delivery that turned up short. Collapsing those
 * into one sortable column makes the reader do the work every single time they look.
 *
 * Everything a row shows arrives ON the row — vendor name, promised date, status, value.
 * There is no second request to the vendor master to turn an id into a name: that would
 * couple this screen to another module for the sake of a string, and would refuse the whole
 * page to a stores clerk who may read orders but not vendors.
 *
 * Filtering is CLIENT-SIDE, for the reason Stock on hand is: narrowing loaded rows in the
 * browser is instant where a round trip per keystroke is not. It applies to what has been
 * loaded, which is also why the tab counts count loaded rows rather than claiming to
 * describe the whole order book.
 */

/** The statuses `purchase_order.status` can hold, grouped the way a buyer thinks about them. */
const TABS: ReadonlyArray<{ key: string; label: string; match: (s: string) => boolean }> = [
  { key: "all", label: "All", match: () => true },
  { key: "pending", label: "Awaiting approval", match: (s) => s === "pending_approval" },
  { key: "approved", label: "Approved", match: (s) => s === "approved" },
  { key: "partial", label: "Part received", match: (s) => s === "partially_received" },
  { key: "received", label: "Received", match: (s) => s === "received" },
  { key: "draft", label: "Draft", match: (s) => s === "draft" },
  { key: "closed", label: "Rejected", match: (s) => s === "rejected" || s === "cancelled" },
];

export default function OrdersScreen(_props: ScreenProps): React.JSX.Element {
  const router = useRouter();
  const {
    rows: all,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    reload,
  } = useCursorList<PoSummaryRow>(purchaseApi.ordersPath, { limit: purchaseApi.pageSize });

  const [tab, setTab] = useState("all");
  const [filter, setFilter] = useState("");
  // The create form is mounted only while open, which is what gives each attempt its own
  // idempotency key — one key per open form, reused across retries within it.
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const active = TABS.find((t) => t.key === tab) ?? TABS[0];
    const q = filter.trim().toLowerCase();
    return all.filter((r) => {
      if (active && !active.match(r.status)) return false;
      if (!q) return true;
      return (
        r.poNo.toLowerCase().includes(q) ||
        r.vendorName.toLowerCase().includes(q) ||
        r.vendorCode.toLowerCase().includes(q)
      );
    });
  }, [all, tab, filter]);

  // The numbers a plant manager is actually looking for, computed over everything loaded
  // rather than over the current tab — a count that changed when you clicked a tab would be
  // answering a different question each time.
  const awaiting = all.filter((r) => r.status === "pending_approval");
  const awaitingValue = awaiting.reduce((sum, r) => sum + Number(r.totalAmount), 0);
  const overdue = all.filter((r) => isLate(r.expectedDate, r.status));

  const columns: ReadonlyArray<Column<PoSummaryRow>> = [
    {
      key: "poNo",
      header: "Order",
      width: "w-44",
      render: (r) => <span className="font-semibold">{r.poNo}</span>,
    },
    {
      key: "vendor",
      header: "Vendor",
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-[var(--text-primary)]">{r.vendorName}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{r.vendorCode}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Approval",
      width: "w-48",
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "expected",
      header: "Promised",
      width: "w-52",
      /*
       * The delivery date and how it stands, together. The absolute date is what goes into
       * the email chasing it; "6 days overdue" is what makes somebody send that email today
       * — and a screen showing only one of the two makes the reader do arithmetic to get
       * the other. Past due takes the overdue tone, a triangle rather than a circle, so it
       * stays distinct from Rejected for a reader who cannot see that both are red.
       */
      render: (r) => {
        if (!r.expectedDate) {
          // Not the same as "not late". An order with no promised date is one nobody can
          // chase, which is worth showing rather than leaving as an empty cell.
          return <span className="text-[var(--text-muted)]">No date promised</span>;
        }
        return (
          <div className="min-w-0">
            <div className="text-[var(--text-primary)]">{date(r.expectedDate)}</div>
            {isLate(r.expectedDate, r.status) ? (
              <StatusBadge tone="overdue" label={relativeDays(r.expectedDate)} className="mt-0.5" />
            ) : (
              <div className="text-[12px] text-[var(--text-secondary)]">
                {relativeDays(r.expectedDate)}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "total",
      header: "Order value",
      numeric: true,
      width: "w-44",
      render: (r) => <span className="font-semibold">{inr(r.totalAmount)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Purchase orders"
        subtitle="Every order placed on a supplier, and where each one has got to — drafted, waiting for approval, approved and awaiting delivery, or received."
        meta={[
          ...(awaiting.length > 0
            ? [
                { label: "Awaiting approval", value: String(awaiting.length) },
                { label: "Value held up", value: inr(awaitingValue) },
              ]
            : []),
          ...(overdue.length > 0
            ? [{ label: "Past promised date", value: String(overdue.length) }]
            : []),
        ]}
        actions={
          // Drawn only for somebody who can actually raise one. The client-side check decides
          // what to DRAW, never what is permitted — the API's guard is the one that matters —
          // but offering a Raise button to a stores clerk who cannot use it wastes a decision
          // they were never allowed to make.
          <Can permission="purchase.po.create">
            <button
              type="button"
              className="btn btn-pri"
              onClick={() => setCreating(true)}
              data-demo-target="action"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New purchase order
            </button>
          </Can>
        }
      />

      {/* The mission lands here for the "commit the purchase" step. Absent otherwise. */}
      <StagePanel />

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const count = all.filter((r) => t.match(r.status)).length;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-pressed={tab === t.key}
              className={cn(
                "h-8 rounded-[var(--radius-control)] border px-3 text-[12px] font-medium transition-colors",
                tab === t.key
                  ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--text-primary)]"
                  : "border-[var(--border-input)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              {t.label}
              {/* The count sits on the tab because "is anything waiting on me?" should be
                  answerable without clicking anything. */}
              <span className="ml-1.5 text-[var(--text-muted)]">{count}</span>
            </button>
          );
        })}
      </div>

      {hasMore ? (
        // The counts above and on the tabs describe what has been LOADED, and saying so is
        // the difference between a summary and a claim. "4 awaiting approval" is a
        // dangerous thing to believe when it means "4 of the first 50".
        <p className="text-[12px] text-[var(--text-muted)]">
          Counts cover the {all.length} orders loaded so far — load more below to include the
          rest.
        </p>
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
          placeholder="Filter by order number or vendor…"
          aria-label="Filter purchase orders"
          className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
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
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/purchase/order/${r.id}`)}
        caption="Purchase orders by number, vendor, approval status, promised date and value"
        empty={
          filter || tab !== "all" ? (
            <Empty
              title="Nothing matches"
              body="No order in this view matched. Clear the filter or choose another status."
            />
          ) : (
            <Empty
              title="No purchase orders yet"
              body="Purchase orders appear here once one is raised against a vendor — from a planning requisition, or directly by a buyer."
              action={
                <Can permission="purchase.po.create">
                  <button
                    type="button"
                    className="btn btn-pri"
                    onClick={() => setCreating(true)}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    New purchase order
                  </button>
                </Can>
              }
            />
          )
        }
      />

      {creating ? (
        <NewPurchaseOrderModal
          onClose={() => setCreating(false)}
          // The form navigates to the new order itself; reloading the list means the row is
          // already there when the user comes back to it.
          onCreated={(order) => {
            announceDemoRecordCreated({
              kind: "purchase-order",
              id: order.id,
              reference: order.poNo,
            });
            reload();
          }}
        />
      ) : null}
    </div>
  );
}
