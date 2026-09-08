"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Can } from "@spine/access/permissions";
import { announceDemoRecordCreated } from "@spine/demo/demo-events";
import { useCursorList } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, inr, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { QuotationSummary } from "../api";
import {
  EXPIRING_SOON_DAYS,
  daysUntil,
  isAwaitingAnswer,
  quotationApi,
  sumAmounts,
} from "../api";
import { NewQuotationDialog } from "../components/new-quotation-dialog";

/**
 * QUOTATIONS — the price before it is an order.
 *
 * This list answers the three questions a salesperson opens it with, and nothing else:
 *
 *   WHO AND HOW MUCH  — the customer and the value, so the book can be scanned by size.
 *   HOW LONG LEFT     — `valid until` with the days remaining beside it. A quotation is the
 *                       one document in this product that goes bad by itself, and the day it
 *                       does the price can no longer be accepted.
 *   WHERE IT GOT TO   — sent, accepted, lost, or converted with the order number it became.
 *
 * "Expired" and "rejected" are deliberately different chips. One means the customer said no;
 * the other means nobody asked them in time, and the second is a failure of this office
 * rather than of the price. Collapsing them into one amber pill would hide the difference
 * that decides what somebody does next.
 */
export default function QuotationListScreen(_props: ScreenProps): React.JSX.Element {
  const router = useRouter();
  const { rows, loading, loadingMore, error, hasMore, loadMore, reload } =
    useCursorList<QuotationSummary>(quotationApi.listPath, { limit: quotationApi.pageSize });
  const [filter, setFilter] = useState("");
  // Unmounted when closed, deliberately: the dialog pins ONE Idempotency-Key for its
  // lifetime, so "closed and reopened" has to mean a new key and a genuinely new quotation.
  const [creating, setCreating] = useState(false);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    // Filters what has been LOADED, not what exists. Honest because the table's own footer
    // says how many rows are on screen and whether more are available behind Load more.
    return rows.filter(
      (row) =>
        row.quoteNo.toLowerCase().includes(q) ||
        (row.customerName ?? "").toLowerCase().includes(q) ||
        (row.convertedSoNo ?? "").toLowerCase().includes(q),
    );
  }, [rows, filter]);

  const live = useMemo(() => rows.filter(isAwaitingAnswer), [rows]);
  const liveValue = useMemo(() => sumAmounts(live.map((r) => r.grandTotal)), [live]);
  const expiringSoon = useMemo(
    () =>
      live.filter((r) => {
        const days = daysUntil(r.validUntil);
        return days !== null && days >= 0 && days <= EXPIRING_SOON_DAYS;
      }).length,
    [live],
  );

  const columns: ReadonlyArray<Column<QuotationSummary>> = [
    {
      key: "quote",
      header: "Quotation",
      width: "w-52",
      render: (q) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">
            {q.quoteNo}
            {/* A re-price supersedes rather than overwrites, so the same quote number can
                exist at several revisions. Showing which one this is stops a conversation
                about "the quotation" meaning two different prices. */}
            {q.revisionNo > 1 ? (
              <span className="ml-1.5 font-[var(--font-mono)] text-[11px] font-bold text-[var(--text-muted)]">
                r{q.revisionNo}
              </span>
            ) : null}
          </div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">
            Raised {date(q.quoteDate)}
          </div>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (q) => (
        <div className="min-w-0 truncate text-[var(--text-primary)]">{q.customerName ?? "—"}</div>
      ),
    },
    {
      key: "validUntil",
      header: "Price holds until",
      width: "w-48",
      render: (q) => {
        const days = daysUntil(q.validUntil);
        const soon = !q.expired && days !== null && days >= 0 && days <= EXPIRING_SOON_DAYS;
        return (
          <div className="min-w-0">
            <div className="text-[var(--text-primary)]">{date(q.validUntil)}</div>
            {q.expired ? (
              // A triangle, not just red text: "this price is no longer on offer" has to
              // survive being read by somebody who cannot tell red from grey.
              <StatusBadge
                tone="overdue"
                label={relativeDays(q.validUntil)}
                className="mt-0.5"
              />
            ) : soon ? (
              <StatusBadge tone="pending" label={relativeDays(q.validUntil)} className="mt-0.5" />
            ) : (
              <div className="text-[12px] text-[var(--text-secondary)]">
                {relativeDays(q.validUntil)}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      width: "w-44",
      render: (q) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={q.status} />
          {/* Expiry is a fact ABOUT a sent quotation, not a status the document holds — the
              server computes it from the date on every read. Two chips, because "they have
              not answered" and "they can no longer say yes" are different problems. */}
          {q.expired && q.status === "sent" ? (
            <span className="chip chip-warn">Price expired</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "became",
      header: "Became",
      width: "w-40",
      render: (q) =>
        q.convertedSoNo ? (
          <span className="chip chip-ok">{q.convertedSoNo}</span>
        ) : (
          <span className="text-[12px] text-[var(--text-muted)]">—</span>
        ),
    },
    {
      key: "value",
      header: "Value",
      numeric: true,
      width: "w-40",
      render: (q) => <span className="font-semibold">{inr(q.grandTotal)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Quotations"
        subtitle="Every price this plant has offered, how long each one holds, and which of them became orders."
        meta={
          rows.length > 0
            ? [
                { label: "Loaded", value: String(rows.length) },
                { label: "Awaiting an answer", value: String(live.length) },
                { label: "Expiring within a week", value: String(expiringSoon) },
                { label: "Value out there", value: inr(liveValue) },
              ]
            : []
        }
        actions={
          // Gated, not disabled. Somebody who cannot quote a price is never offered the
          // button — a control that exists only to refuse you is worse than no control, and
          // `Can` denies by default while access is still loading rather than flashing it.
          <Can permission="sales.quotation.create">
            <button
              type="button"
              className="btn btn-pri"
              onClick={() => setCreating(true)}
              data-demo-target="action"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New quotation
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
          placeholder="Filter by quotation, customer or order number…"
          aria-label="Filter quotations"
          className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
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
        onRowClick={(q) => router.push(`/quotation/detail/${q.id}`)}
        rowKey={(q) => q.id}
        caption="Quotations with the customer, how long the price holds, the status and the value"
        empty={
          filter ? (
            <Empty
              title="Nothing matches that filter"
              body={`No loaded quotation, customer or order number matched “${filter}”.`}
            />
          ) : (
            <Empty
              title="No quotations yet"
              body="A quotation is a price offered to a customer with a date it stops being valid. Nothing is committed by one — it becomes an order only when the customer accepts it and somebody converts it."
              action={
                <Can permission="sales.quotation.create">
                  <button type="button" className="btn btn-pri" onClick={() => setCreating(true)}>
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Quote the first price
                  </button>
                </Can>
              }
            />
          )
        }
      />

      {creating ? (
        <NewQuotationDialog
          onClose={() => setCreating(false)}
          // Close AND GO TO THE QUOTATION. A form that saves and leaves you looking at the
          // same empty form teaches people it did not work — so the created document, with
          // its real quote number and its server-computed totals, is what they see next.
          onCreated={(quotation) => {
            // Unlocks the guided demo's Next button. It never advances by itself — the
            // presenter still has to open the saved quotation and talk about it first.
            announceDemoRecordCreated({
              kind: "quotation",
              id: quotation.id,
              reference: quotation.quoteNo,
            });
            setCreating(false);
            router.push(`/quotation/detail/${quotation.id}`);
          }}
        />
      ) : null}
    </div>
  );
}
