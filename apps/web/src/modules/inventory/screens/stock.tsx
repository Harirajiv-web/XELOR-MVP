"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { qty } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import type { ScreenProps } from "@spine/registry/manifest";
import type { StockRow } from "../api";
import { inventoryApi } from "../api";

/**
 * STOCK ON HAND — the reference screen.
 *
 * Every list screen in this product follows this shape, so it is worth reading once:
 * a `PageHeader` saying where you are and what you are looking at, a filter that narrows
 * without a round trip, and a `DataTable` that handles loading, error, empty and paging so
 * no screen invents its own version of those four.
 *
 * The filtering is CLIENT-SIDE here, deliberately and with a limit. Stock balances for one
 * plant are hundreds of rows, and filtering them in the browser is instant where a server
 * round trip per keystroke is not. That stops being true somewhere in the thousands, at
 * which point this becomes a query parameter — the change is contained to this file
 * because nothing else knows how the filter works.
 */
export default function StockScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<StockRow[]>(inventoryApi.stockPath);
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const all = data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) =>
        r.itemCode.toLowerCase().includes(q) ||
        r.itemName.toLowerCase().includes(q) ||
        r.warehouseCode.toLowerCase().includes(q),
    );
  }, [data, filter]);

  const totalLines = data?.length ?? 0;

  const columns: ReadonlyArray<Column<StockRow>> = [
    {
      key: "item",
      header: "Item",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.itemCode}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{r.itemName}</div>
        </div>
      ),
    },
    {
      key: "warehouse",
      header: "Warehouse",
      width: "w-56",
      render: (r) => (
        <div>
          <div className="text-[var(--text-primary)]">{r.warehouseCode}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{r.warehouseName}</div>
        </div>
      ),
    },
    {
      key: "batch",
      header: "Batch",
      width: "w-32",
      // An empty batch is shown as an em dash rather than blank: blank looks like the
      // column failed to load, and a storekeeper cannot tell those apart.
      render: (r) => (
        <span className="text-[var(--text-secondary)]">{r.batch ? r.batch : "—"}</span>
      ),
    },
    {
      key: "qty",
      header: "On hand",
      numeric: true,
      width: "w-40",
      // The unit travels with the number. These tables get screenshotted into WhatsApp,
      // and "163.2" with the unit left behind in a header is a number nobody can act on.
      render: (r) => <span className="font-semibold">{qty(r.qty, r.uom)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Stock on hand"
        subtitle="Live balances from the stock ledger. Every quantity here is the sum of posted movements — nothing is entered directly."
        meta={
          totalLines > 0
            ? [{ label: "Lines", value: String(totalLines) }]
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
          placeholder="Filter by item or warehouse…"
          aria-label="Filter stock"
          className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r, i) => `${r.itemId}-${r.warehouseId}-${r.batch ?? ""}-${i}`}
        caption="Stock on hand by item, warehouse and batch"
        empty={
          filter ? (
            <Empty
              title="Nothing matches that filter"
              body={`No item or warehouse matched “${filter}”.`}
            />
          ) : (
            <Empty
              title="No stock on hand"
              body="Nothing has been received into any warehouse yet. Stock appears here once a goods receipt or an opening balance is posted."
            />
          )
        }
      />
    </div>
  );
}
