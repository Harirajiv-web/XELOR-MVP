"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useCursorList } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { humanise, inr } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { ItemRow } from "../api";
import { engineeringApi } from "../api";

/**
 * THE ITEM MASTER.
 *
 * Every other module points at rows on this screen: stock is stock OF an item, a purchase
 * order buys one, a BOM consumes one, a work order makes one. That is why it is the first
 * thing in this module and why the code is the loudest thing in the row — an item nobody can
 * find by its code is an item somebody re-creates under a second code, and then the factory
 * has two part numbers for one part.
 *
 * Cursor-paged through `useCursorList`, which reads the platform's `CursorPage<T>` envelope.
 * There is no page number and cannot honestly be one; "Load more" is what a keyset cursor
 * actually supports.
 *
 * The filter is CLIENT-SIDE, over the pages already loaded, and that is a stated limit
 * rather than an oversight: it is instant where a round trip per keystroke is not, and it
 * stops being right somewhere in the thousands, at which point it becomes a query parameter.
 * The change would be contained to this file, because nothing else knows how the filter
 * works.
 */
export default function ItemsScreen(_props: ScreenProps): React.JSX.Element {
  const router = useRouter();
  const {
    rows: all,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    reload,
  } = useCursorList<ItemRow>(engineeringApi.itemsPath);
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) =>
        r.itemCode.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        r.itemType.toLowerCase().includes(q),
    );
  }, [all, filter]);

  const columns: ReadonlyArray<Column<ItemRow>> = [
    {
      key: "item",
      header: "Item",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.itemCode}</div>
          {/* The name is what it is called; the description is what it IS. Both, because a
              storekeeper searches by one and confirms with the other. */}
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{r.name}</div>
          {r.description ? (
            <div className="truncate text-[12px] text-[var(--text-muted)]">{r.description}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      width: "w-44",
      // An item type is a classification, not a workflow state, so it gets the neutral
      // treatment. Borrowing the eight status colours here would teach a storekeeper that
      // green means "good part" instead of "completed".
      render: (r) => <StatusBadge tone="unknown" label={humanise(r.itemType)} />,
    },
    {
      key: "uom",
      header: "Unit",
      width: "w-24",
      // The unit is a column of its own rather than only travelling with quantities, because
      // this is the screen where somebody decides whether a casting is counted in nos or kg —
      // and getting that wrong once poisons every stock figure downstream.
      render: (r) => <span className="text-[var(--text-secondary)]">{r.uom}</span>,
    },
    {
      key: "bom",
      header: "Made from",
      width: "w-36",
      // The difference between a part this factory MAKES and one it BUYS, visible without
      // opening anything — and a way through to the recipe when there is one. An item master
      // with no route to the bill of material is a dead end at exactly the moment somebody
      // asks what a part is made of.
      render: (r) =>
        r.defaultBomId ? (
          <span className="text-[var(--brand)] underline decoration-dotted underline-offset-2">
            {r.bomCount > 1 ? `${r.bomCount} versions` : "Bill of material"}
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        ),
    },
    {
      key: "standardCost",
      header: "Standard cost",
      numeric: true,
      width: "w-40",
      render: (r) => (r.standardCost === null ? "—" : inr(r.standardCost)),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Items"
        subtitle="Every part this factory buys, makes or sells, registered once. Nothing else in the system can refer to a part that is not on this list."
        meta={all.length > 0 ? [{ label: "Loaded", value: String(all.length) }] : []}
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
          placeholder="Filter by code, description or type…"
          aria-label="Filter items"
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
        rowKey={(r) => r.id}
        // Only rows that HAVE a bill of material go anywhere. A row that looks clickable and
        // does nothing teaches people the table is broken.
        onRowClick={(r) => {
          if (r.defaultBomId) router.push(engineeringApi.bomHref(r.defaultBomId));
        }}
        caption="The item master: code, description, type, unit of measure, bill of material and standard cost"
        empty={
          filter ? (
            <Empty
              title="Nothing matches that filter"
              body={`No item code, description or type matched “${filter}” in the rows loaded so far. Load more to search further.`}
            />
          ) : (
            <Empty
              title="No items yet"
              body="The item master is empty. Items appear here as they are registered — and until one exists, nothing can be stocked, bought, planned or made against it."
            />
          )
        }
      />
    </div>
  );
}
