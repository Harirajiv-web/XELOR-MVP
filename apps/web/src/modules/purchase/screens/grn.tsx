"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { qty, date, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { GrnDetail, GrnLineRow } from "../api";
import { purchaseApi, shortId } from "../api";

/**
 * ONE GOODS RECEIPT.
 *
 * There is no list endpoint for goods receipts, so this screen is registered but not in the
 * sidebar: `/purchase/grn/<id>` works, nothing navigates to it. Registering it anyway is
 * deliberate — the URL is what a receipt gets referred to by, in a support call or an
 * email, and a route that 404s because no menu points at it is a broken link with an
 * explanation rather than a working one.
 *
 * What this document is: the moment stock legally arrived. Posting it moved the stock
 * ledger through Inventory's single write path in the same transaction that wrote these
 * lines, which is why there is no "post to stock" step to look for — if this document
 * exists, the stock moved.
 */
export default function GrnScreen(props: ScreenProps): React.JSX.Element {
  const id = props.params[0];
  const { data, loading, error, reload } = useQuery<GrnDetail>(id ? purchaseApi.grnPath(id) : null);

  if (!id) {
    return (
      <Empty
        title="No goods receipt chosen"
        body="A goods receipt is opened by its own document link. There is no list of receipts yet — what was received against an order is shown on the order itself, line by line."
      />
    );
  }
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return <Loading label="Loading goods receipt…" />;

  const totalQty = data.lines.reduce((sum, l) => sum + Number(l.qty), 0);
  const batched = data.lines.filter((l) => l.batch !== "").length;

  const columns: ReadonlyArray<Column<GrnLineRow>> = [
    {
      key: "lineNo",
      header: "#",
      width: "w-12",
      render: (l) => <span className="text-[var(--text-muted)]">{l.lineNo}</span>,
    },
    {
      key: "item",
      header: "Item",
      render: (l) => (
        <span
          className="font-[var(--font-mono)] text-[12px] text-[var(--text-secondary)]"
          title={l.itemId}
        >
          {shortId(l.itemId)}
        </span>
      ),
    },
    {
      key: "batch",
      header: "Batch",
      width: "w-44",
      /*
       * Batch is shown exactly as it was received, and the empty case is named rather than
       * dashed. It matters more here than anywhere else in the product: a receipt against a
       * batch creates its own stock balance row keyed on (item, warehouse, batch), and the
       * production issue path currently asks for the unbatched row — so material received
       * under a batch code sits in a place production cannot draw from. That is a known
       * open backend defect, not something this screen should hide by normalising the two
       * cases into one label.
       */
      render: (l) =>
        l.batch ? (
          <span className="font-[var(--font-mono)] text-[12px]">{l.batch}</span>
        ) : (
          <span className="text-[var(--text-muted)]">No batch</span>
        ),
    },
    {
      key: "qty",
      header: "Received",
      numeric: true,
      width: "w-36",
      render: (l) => <span className="font-semibold">{qty(l.qty)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/purchase/order/${data.poId}`}
        className="inline-flex w-fit items-center gap-1.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Purchase order {data.poNo}
      </Link>

      <PageHeader
        title={data.grnNo}
        subtitle={`What physically arrived against purchase order ${data.poNo}, and the stock it created. Posting this receipt moved the stock ledger in the same transaction.`}
        meta={[
          { label: "Receipt", value: <StatusBadge status={data.status} /> },
          { label: "Order now", value: <StatusBadge status={data.poStatus} /> },
          { label: "Received on", value: date(data.grnDate) },
          {
            label: "Into warehouse",
            // The warehouse name lives in Inventory and is not joined into this response,
            // so the reference is shown as a reference.
            value: (
              <span className="font-[var(--font-mono)] text-[12px]" title={data.warehouseId}>
                {shortId(data.warehouseId)}
              </span>
            ),
          },
          { label: "Lines", value: num(data.lines.length) },
          { label: "Total received", value: num(totalQty, 3) },
        ]}
      />

      <DataTable
        rows={data.lines}
        columns={columns}
        rowKey={(l, i) => `${l.poLineId}-${l.batch}-${i}`}
        caption={`Lines received on goods receipt ${data.grnNo}`}
        empty={
          <Empty
            title="This receipt has no lines"
            body="A goods receipt cannot be posted without at least one line, so an empty one means the document was written by something other than the receipt path."
          />
        }
      />

      {data.stockMovements && data.stockMovements.length > 0 ? (
        // Only ever present on the response that creates the receipt; a plain read does not
        // re-derive it. Rendered when it is there, never reconstructed from the lines —
        // a balance figure that was inferred rather than posted is the one thing the stock
        // ledger exists to prevent.
        <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
          <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
            Stock posted by this receipt
          </h2>
          <ul className="mt-2 flex flex-col gap-1 text-[13px] text-[var(--text-secondary)]">
            {data.stockMovements.map((m, i) => (
              <li key={`${m.itemId}-${m.warehouseId}-${i}`} className="tabular-nums">
                <span className="font-[var(--font-mono)] text-[12px]">{shortId(m.itemId)}</span>
                {" — "}
                {num(m.delta, 3)} in, balance now {num(m.balanceAfter, 3)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {batched > 0 ? (
        <p className="text-[12px] leading-5 text-[var(--text-muted)]">
          {batched === data.lines.length
            ? "Every line on this receipt carries a batch code."
            : `${num(batched)} of ${num(data.lines.length)} lines carry a batch code.`}{" "}
          Batched stock is held as its own balance, separate from unbatched stock of the same
          item in the same warehouse.
        </p>
      ) : null}
    </div>
  );
}
