"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "../ui/cn";
import { Empty, ErrorState, Loading } from "../states";

/**
 * THE TABLE. Most of this application is this component.
 *
 * Decisions worth defending:
 *
 *   NO ZEBRA STRIPING. Eight status colours are already doing signalling work in these
 *   rows; alternating backgrounds compete with them for the same attention. Hover and a
 *   1px divider are enough to track a row across the screen.
 *
 *   COMFORTABLE DENSITY BY DEFAULT (44px rows), with compact available. The audience is
 *   people in their first weeks off paper and Tally, often on cheap monitors in mixed
 *   factory lighting. A misread quantity in week one costs more trust than a scroll costs
 *   patience — and once they trust it, they can turn density up themselves.
 *
 *   NUMBERS RIGHT, TEXT LEFT, and every numeric cell tabular. A quantity column that does
 *   not line up reads as sloppy, and sloppy reads as "do not trust the total".
 *
 *   "LOAD MORE", NOT PAGE NUMBERS. The API is cursor-paged, which cannot honestly support
 *   jumping to page 7. A page-number control that silently did nothing would be worse than
 *   its absence.
 */

export interface Column<T> {
  key: string;
  header: string;
  /** Right-aligned and tabular. Use for every quantity, amount and count. */
  numeric?: boolean;
  /** Fixed width, e.g. "w-32". */
  width?: string;
  render: (row: T) => ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  loading,
  loadingMore,
  error,
  hasMore,
  onLoadMore,
  onReload,
  empty,
  rowKey,
  onRowClick,
  density = "comfortable",
  caption,
}: {
  rows: readonly T[];
  columns: ReadonlyArray<Column<T>>;
  loading?: boolean;
  loadingMore?: boolean;
  error?: unknown;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onReload?: () => void;
  empty?: ReactNode;
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  density?: "comfortable" | "compact";
  /** Screen-reader description of what the table holds. */
  caption?: string;
}): React.JSX.Element {
  if (error) return <ErrorState error={error} {...(onReload ? { onRetry: onReload } : {})} />;
  if (loading) return <Loading />;
  if (rows.length === 0) return <>{empty ?? <Empty />}</>;

  // MAINDECK's `table.grid`, defined once in globals.css so every one of the sixteen
  // modules picks up the same treatment without editing fifty-one screens.
  const compact = density === "compact";

  return (
    <div className="x-data-card card overflow-hidden" data-demo-target="workspace">
      <div className="overflow-x-auto">
        <table className="grid-table" style={compact ? { fontSize: "12px" } : undefined}>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(c.numeric && "text-right!", c.width)}
                  style={compact ? { padding: "7px 12px" } : undefined}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                className="x-data-row"
                data-demo-target={i === 0 ? "record" : undefined}
                style={{ "--x-row-delay": `${Math.min(i, 12) * 26}ms` } as CSSProperties}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                {...(onRowClick ? { "data-clickable": "" } : {})}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(c.numeric && "text-right tabular-nums")}
                    style={compact ? { padding: "6px 12px" } : undefined}
                    {...(c.numeric ? { "data-numeric": "" } : {})}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] px-3 py-2 text-[12px] text-[var(--text-muted)]">
        {/* Honest about what is on screen. "Showing 50" when there are 4,000 is a lie of
            omission that an operator only discovers by scrolling and finding nothing. */}
        <span>
          {rows.length} {rows.length === 1 ? "record" : "records"} shown
          {hasMore ? " · more available" : ""}
        </span>
        {hasMore && onLoadMore ? (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded-[var(--radius-control)] border border-[var(--border-input)] px-2.5 py-1 font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
