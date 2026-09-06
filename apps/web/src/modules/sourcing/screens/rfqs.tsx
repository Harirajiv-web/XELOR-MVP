"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Can } from "@spine/access/permissions";
import { announceDemoRecordCreated } from "@spine/demo/demo-events";
import { useCursorList } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, num, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import { sourcingApi, type RfqSummary } from "../api";
import { NewRfqDialog } from "../components/new-rfq-dialog";

/**
 * REQUESTS FOR QUOTATION — the buying decision, before it is a purchase order.
 *
 * The three questions a buyer opens this with:
 *
 *   WHAT AM I BUYING AND WHEN IS IT NEEDED — the part and the need date, because everything
 *                                            else on the row is only interesting against it.
 *   HAS ANYBODY ANSWERED                   — invited against quoted. A request with one
 *                                            answer is not a comparison, and the row says so
 *                                            rather than looking the same as one with four.
 *   IS IT DECIDED                          — the status, and the supplier who won.
 */
export default function RfqListScreen(_props: ScreenProps): React.JSX.Element {
  const router = useRouter();
  const { rows, loading, loadingMore, error, hasMore, loadMore, reload } =
    useCursorList<RfqSummary>(sourcingApi.listPath, { limit: sourcingApi.pageSize });
  const [filter, setFilter] = useState("");
  // Unmounted when closed, deliberately: the dialog pins ONE Idempotency-Key for its
  // lifetime, so "closed and reopened" has to mean a new key and a genuinely new request.
  const [creating, setCreating] = useState(false);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.rfqNo.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        (r.awardedVendorName ?? "").toLowerCase().includes(q),
    );
  }, [rows, filter]);

  const open = useMemo(
    () => rows.filter((r) => r.status === "draft" || r.status === "issued" || r.status === "evaluation"),
    [rows],
  );
  const unanswered = useMemo(() => open.filter((r) => r.quotedCount === 0).length, [open]);

  const columns: ReadonlyArray<Column<RfqSummary>> = [
    {
      key: "rfq",
      header: "Request",
      width: "w-56",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.rfqNo}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{r.title}</div>
        </div>
      ),
    },
    {
      key: "qty",
      header: "Quantity",
      width: "w-32",
      render: (r) => (
        <span className="text-[var(--text-primary)]">
          {num(r.qty)} {r.uom}
        </span>
      ),
    },
    {
      key: "needed",
      header: "Needed by",
      width: "w-44",
      render: (r) => (
        <div className="min-w-0">
          <div className="text-[var(--text-primary)]">{date(r.needDate)}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">{relativeDays(r.needDate)}</div>
        </div>
      ),
    },
    {
      key: "answers",
      header: "Answers",
      width: "w-40",
      render: (r) => (
        // Invited AND answered, never just a count of quotes. Three quotes out of three is a
        // comparison; three out of nine is a comparison with six suppliers who said nothing,
        // and a buyer should be able to see which one they are looking at.
        <div className="min-w-0">
          <div className="text-[var(--text-primary)]">
            {r.quotedCount} of {r.invitedCount}
          </div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            {r.quotedCount === 0 ? "no supplier has answered" : "suppliers answered"}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "w-40",
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "awarded",
      header: "Awarded to",
      render: (r) =>
        r.awardedVendorName ? (
          <span className="chip chip-ok">{r.awardedVendorName}</span>
        ) : (
          <span className="text-[12px] text-[var(--text-muted)]">—</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Requests for quotation"
        subtitle="What was asked, who answered, and the recorded reason one supplier was chosen."
        meta={
          rows.length > 0
            ? [
                { label: "Loaded", value: String(rows.length) },
                { label: "Still being decided", value: String(open.length) },
                { label: "Awaiting a first answer", value: String(unanswered) },
              ]
            : []
        }
        actions={
          <Can permission="purchase.rfq.create">
            <button
              type="button"
              className="btn btn-pri"
              onClick={() => setCreating(true)}
              data-demo-target="action"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New request
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
          placeholder="Filter by request number, part or supplier…"
          aria-label="Filter requests for quotation"
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
        onRowClick={(r) => router.push(`/sourcing/detail/${r.id}`)}
        rowKey={(r) => r.id}
        caption="Requests for quotation with the quantity, need date, how many suppliers answered and who won"
        empty={
          filter ? (
            <Empty
              title="Nothing matches that filter"
              body={`No loaded request, part or supplier matched “${filter}”.`}
            />
          ) : (
            <Empty
              title="No requests yet"
              body="A request for quotation asks several suppliers to price the same part, against the same drawing revision and the same need date — so their answers can be compared on more than price."
              action={
                <Can permission="purchase.rfq.create">
                  <button type="button" className="btn btn-pri" onClick={() => setCreating(true)}>
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Raise the first request
                  </button>
                </Can>
              }
            />
          )
        }
      />

      {creating ? (
        <NewRfqDialog
          onClose={() => setCreating(false)}
          onCreated={(rfq) => {
            announceDemoRecordCreated({ kind: "rfq", id: rfq.id, reference: rfq.rfqNo });
            setCreating(false);
            router.push(`/sourcing/detail/${rfq.id}`);
          }}
        />
      ) : null}
    </div>
  );
}
