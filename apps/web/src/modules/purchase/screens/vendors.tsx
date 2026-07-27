"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useCursorList } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import type { ScreenProps } from "@spine/registry/manifest";
import type { VendorRow } from "../api";
import { purchaseApi } from "../api";

/**
 * VENDORS — the supplier master.
 *
 * Deliberately plain. This is a reference list, not a working screen: it exists so a buyer
 * can check that a supplier is on the system and that its GSTIN is the one on the invoice
 * in their hand, before an order is raised against it.
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

  const columns: ReadonlyArray<Column<VendorRow>> = [
    {
      key: "code",
      header: "Code",
      width: "w-40",
      render: (v) => <span className="font-semibold">{v.code}</span>,
    },
    { key: "name", header: "Name", render: (v) => v.name },
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
        title="Vendors"
        subtitle="Every supplier this company can raise a purchase order against, with the GSTIN each one bills under."
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
          aria-label="Filter vendors"
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
