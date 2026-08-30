"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useCursorList } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { inr } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { CustomerRow } from "../api";
import { salesApi, sumAmounts } from "../api";

/**
 * CUSTOMERS — the master every order, dispatch and invoice hangs off.
 *
 * The credit limit is on this screen rather than buried in a settings page because it is
 * the number that decides whether an order can be confirmed at all. Somebody looking at
 * why an order is stuck reads it here, and the alternative is asking accounts.
 */
export default function CustomersScreen(_props: ScreenProps): React.JSX.Element {
  const { rows: all, loading, loadingMore, error, hasMore, loadMore, reload } =
    useCursorList<CustomerRow>(salesApi.customersPath, { limit: salesApi.pageSize });
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.gstin ?? "").toLowerCase().includes(q),
    );
  }, [all, filter]);

  const columns: ReadonlyArray<Column<CustomerRow>> = [
    {
      key: "code",
      header: "Code",
      width: "w-32",
      render: (c) => <span className="font-semibold">{c.code}</span>,
    },
    { key: "name", header: "Name", render: (c) => c.name },
    {
      key: "gstin",
      header: "GSTIN",
      width: "w-48",
      // An unregistered buyer is legitimate, not missing data. Saying so beats a dash that
      // looks like somebody forgot to type it in.
      render: (c) =>
        c.gstin ? (
          <span className="font-[var(--font-mono)] text-[12px]">{c.gstin}</span>
        ) : (
          <StatusBadge tone="unknown" label="Unregistered" />
        ),
    },
    {
      key: "state",
      header: "State code",
      width: "w-28",
      render: (c) => <span className="text-[var(--text-secondary)]">{c.stateCode ?? "—"}</span>,
    },
    {
      key: "creditLimit",
      header: "Credit limit",
      numeric: true,
      width: "w-40",
      render: (c) => <span className="font-semibold">{inr(c.creditLimit)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Customers"
        subtitle="Everyone the plant sells to, with the GST registration that decides how they are taxed and the credit limit that decides how much can be owed at once."
        meta={
          all.length > 0
            ? [
                { label: "Loaded", value: String(all.length) },
                { label: "Credit extended", value: inr(sumAmounts(all.map((c) => c.creditLimit))) },
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
          placeholder="Filter by name, code or GSTIN…"
          aria-label="Filter customers"
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
        rowKey={(c) => c.id}
        caption="Customer master with GST registration and credit limit"
        empty={
          filter ? (
            <Empty
              title="Nothing matches that filter"
              body={`No customer matched “${filter}”.`}
            />
          ) : (
            <Empty
              title="No customers yet"
              body="Customers appear here once they have been added to the master. Every sales order, dispatch and invoice is raised against one of them."
            />
          )
        }
      />
    </div>
  );
}
