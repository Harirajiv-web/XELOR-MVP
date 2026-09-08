"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { Can } from "@spine/access/permissions";
import { inr, qty, date, relativeDays, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import { EditButton, DocumentHistory, useEditPolicy } from "@spine/ui/corrections";
import { NewPurchaseOrderModal } from "../components/new-purchase-order";
import type { ScreenProps } from "@spine/registry/manifest";
import type { PoDetail, PoLineRow, PoSubmitResult } from "../api";
import { purchaseApi, isLate, shortId, canSubmitForApproval } from "../api";
import { ApprovalRouted, SubmitForApproval } from "../components/submit-for-approval";

/**
 * ONE PURCHASE ORDER.
 *
 * Reached by clicking a row on the list; `/purchase/order/<id>` gives this screen the id in
 * `params[0]`. There is no sidebar entry, because a specific order is never somewhere you
 * navigate to cold.
 *
 * The screen answers three questions in order, because that is the order a buyer asks them:
 * has it been approved, when did the vendor promise it, and how much of it has actually
 * turned up. The third is why `Received` and `Outstanding` sit next to `Ordered` on every
 * line rather than in a separate receipts view — "we ordered 400 and 250 came" is the fact
 * the storekeeper and the buyer argue about, and it should not require two screens.
 */
export default function OrderScreen(props: ScreenProps): React.JSX.Element {
  const id = props.params[0];
  const { data, loading, error, reload } = useQuery<PoDetail>(
    id ? purchaseApi.orderPath(id) : null,
  );

  // The server decides whether this PO may change, and what to say when it may not. Keeping
  // a copy of that rule here would give the button and the endpoint two chances to disagree.
  const policy = useEditPolicy(id ? purchaseApi.orderEditPolicyPath(id) : null);
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Kept after the submit succeeds. The order is no longer a draft by then, so the strip that
  // did the submitting is gone — and "it worked, and here is where it went" is the half of
  // the answer that would otherwise disappear with it. Declared above every early return,
  // because a hook that runs on some renders and not others is a different component.
  const [routed, setRouted] = useState<PoSubmitResult | null>(null);

  if (!id) {
    return (
      <Empty
        title="No order chosen"
        body="Open a purchase order from the list to see its lines and what has been received against them."
      />
    );
  }
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return <Loading label="Loading purchase order…" />;

  const late = isLate(data.expectedDate, data.status);
  const receivedValue = data.lines.reduce(
    (sum, l) => sum + Number(l.receivedQty) * Number(l.rate),
    0,
  );
  const outstandingLines = data.lines.filter(
    (l) => Number(l.qty) - Number(l.receivedQty) > 0.0001,
  ).length;

  const columns: ReadonlyArray<Column<PoLineRow>> = [
    {
      key: "lineNo",
      header: "#",
      width: "w-12",
      render: (l) => <span className="text-[var(--text-muted)]">{l.lineNo}</span>,
    },
    {
      key: "item",
      header: "Item",
      render: (l) =>
        l.itemCode ? (
          <div className="min-w-0">
            <div className="font-semibold text-[var(--text-primary)]">{l.itemCode}</div>
            <div className="truncate text-[12px] text-[var(--text-secondary)]">{l.itemName}</div>
          </div>
        ) : (
          // The item behind this line no longer resolves. Shown as the raw reference rather
          // than hidden: the line is still a real commitment with a real value on it, and a
          // blank cell would read as a display fault instead of a data one.
          <span
            className="font-[var(--font-mono)] text-[12px] text-[var(--text-muted)]"
            title={l.itemId}
          >
            {shortId(l.itemId)} — item not found
          </span>
        ),
    },
    {
      key: "qty",
      header: "Ordered",
      numeric: true,
      width: "w-32",
      // The unit travels with the number, as it does everywhere else in this product.
      render: (l) => qty(l.qty, l.uom),
    },
    {
      key: "rate",
      header: "Rate",
      numeric: true,
      width: "w-36",
      render: (l) => inr(l.rate),
    },
    {
      key: "amount",
      header: "Value",
      numeric: true,
      width: "w-40",
      render: (l) => <span className="font-semibold">{inr(l.amount)}</span>,
    },
    {
      key: "received",
      header: "Received",
      numeric: true,
      width: "w-32",
      render: (l) => {
        const received = Number(l.receivedQty);
        if (received <= 0) return <span className="text-[var(--text-muted)]">—</span>;
        return qty(l.receivedQty, l.uom);
      },
    },
    {
      key: "outstanding",
      header: "Outstanding",
      numeric: true,
      width: "w-36",
      // The number the buyer chases the vendor about, computed rather than asked for —
      // ordered minus received, on the same row, so nobody does the subtraction by eye.
      render: (l) => {
        const short = Number(l.qty) - Number(l.receivedQty);
        if (short <= 0.0001) return <span className="text-[var(--text-muted)]">—</span>;
        return <span className="font-semibold">{qty(short, l.uom)}</span>;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/purchase/orders"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All purchase orders
      </Link>

      <PageHeader
        title={data.revisionNo > 0 ? `${data.poNo} · rev ${data.revisionNo}` : data.poNo}
        subtitle={`An order placed on ${data.vendorName}. Everything below is what was committed to the supplier and what has physically arrived against it.`}
        actions={
          <div className="flex flex-wrap items-start gap-2">
            <EditButton policy={policy} onEdit={() => setEditing(true)} />
            <button
              type="button"
              className="btn btn-ghost gap-2"
              onClick={() => setShowHistory((v) => !v)}
              aria-expanded={showHistory}
            >
              <History className="h-4 w-4" aria-hidden />
              {showHistory ? "Hide changes" : "Change history"}
            </button>
          </div>
        }
        meta={[
          { label: "Status", value: <StatusBadge status={data.status} /> },
          { label: "Vendor", value: data.vendorName },
          { label: "Raised", value: date(data.poDate) },
          {
            label: "Promised",
            // Relative phrasing ALWAYS beside the absolute date, never instead of it: "5
            // days overdue" is what a buyer acts on, "25-Jul-2026" is what goes in the
            // email chasing it.
            value: data.expectedDate ? (
              <span className="inline-flex items-center gap-2">
                {date(data.expectedDate)}
                {late ? (
                  <StatusBadge tone="overdue" label={relativeDays(data.expectedDate)} />
                ) : (
                  <span className="text-[var(--text-secondary)]">
                    {relativeDays(data.expectedDate)}
                  </span>
                )}
              </span>
            ) : (
              // No date was given to the vendor. Worth saying, because "no promised date"
              // and "not yet late" look identical if you only print a dash.
              <span className="text-[var(--text-muted)]">No date promised</span>
            ),
          },
          { label: "Order value", value: inr(data.totalAmount) },
          { label: "Currency", value: data.currency },
        ]}
      />

      {routed ? <ApprovalRouted result={routed} /> : null}

      {/* ONLY FOR A DRAFT, and only for somebody who may submit one.
          `submitPo` refuses anything that is not a draft with PO_NOT_DRAFT before it touches
          the approval engine, so this control on an approved or already-pending order could
          produce nothing but an error — and a button whose only outcome is a refusal is worse
          than no button. The permission gate decides what to draw; the API's guard is what
          actually enforces it. */}
      {canSubmitForApproval(data.status) ? (
        <Can permission="purchase.po.submit">
          <SubmitForApproval
            po={data}
            onReload={reload}
            onSubmitted={(result) => {
              setRouted(result);
              // Re-read rather than trusting the response we already hold: the status, the
              // workflow instance id and anything else the server decided all come back on
              // the next GET, and this screen should show what the server says it is.
              reload();
            }}
          />
        </Can>
      ) : null}

      {showHistory && id ? (
        <section className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
            Every change made to this purchase order
          </h2>
          <DocumentHistory path={purchaseApi.orderHistoryPath(id)} />
        </section>
      ) : null}

      {editing && policy?.editable ? (
        <NewPurchaseOrderModal
          editing={{ po: data, amend: policy.tier === "amend" }}
          onClose={() => setEditing(false)}
          onCreated={() => {
            setEditing(false);
            // Re-read rather than trusting the response. An amendment past approval sends
            // the PO back to draft, and the header must show that rather than the state the
            // buyer started from.
            reload();
          }}
        />
      ) : null}

      <DataTable
        rows={data.lines}
        columns={columns}
        rowKey={(l) => l.id}
        caption={`Lines on purchase order ${data.poNo}`}
        empty={
          <Empty
            title="This order has no lines"
            body="An order with no lines cannot be submitted for approval — it was saved before anything was added to it."
          />
        }
      />

      <div className="flex flex-wrap items-center justify-end gap-x-8 gap-y-2 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-3 text-[13px]">
        <span className="text-[var(--text-secondary)]">
          Received so far{" "}
          <span className="font-semibold tabular-nums text-[var(--text-primary)]">
            {inr(receivedValue)}
          </span>
        </span>
        <span className="text-[var(--text-secondary)]">
          Lines still outstanding{" "}
          <span className="font-semibold tabular-nums text-[var(--text-primary)]">
            {num(outstandingLines)}
          </span>
        </span>
        <span className="text-[var(--text-primary)]">
          Order total{" "}
          <span className="ml-1 text-[15px] font-bold tabular-nums">{inr(data.totalAmount)}</span>
        </span>
      </div>

      {/* Stated on the screen rather than only in a ticket. Both of these change what a
          reader should conclude from the numbers above, and a total that is quietly
          missing GST is exactly the kind of figure somebody pastes into an email. */}
      <div className="flex flex-col gap-1 text-[12px] leading-5 text-[var(--text-muted)]">
        <p>
          This total is exclusive of tax. A purchase order does not yet carry GST — no rate,
          no CGST/SGST/IGST split and no tax amount are held against a line, so what is shown
          is the sum of quantity × rate.
        </p>
        <p>
          Receipts are shown per line. The individual goods receipt documents behind them are
          not listed on the order — the API does not return their references — so a GRN can
          only be opened directly by its own document link.
        </p>
      </div>
    </div>
  );
}
