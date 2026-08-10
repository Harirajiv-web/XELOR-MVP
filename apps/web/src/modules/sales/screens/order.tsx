"use client";

import { useState } from "react";
import { ArrowLeft, History } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { inr, num, qty, date, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import { EditButton, DocumentHistory, useEditPolicy } from "@spine/ui/corrections";
import { NewOrderDialog } from "../components/new-order-dialog";
import type { ScreenProps } from "@spine/registry/manifest";
import type { SalesOrderLineView, SalesOrderView } from "../api";
import { creditBadge, isPastDue, salesApi } from "../api";

/**
 * ONE SALES ORDER.
 *
 * Reached by clicking a row on the list; the id arrives as `params[0]`, which is why this
 * screen is registered but hidden from the sidebar — there is no useful "open a sales
 * order" menu item, only "open THIS sales order".
 *
 * The tax block is shown as stored, not recomputed. The GST split was decided by the
 * platform's tax brain on the day the order was taken and written onto each line; a screen
 * that added the numbers up again would eventually disagree with the invoice, and the
 * invoice is the document that goes to the government.
 */
export default function OrderScreen({ params }: ScreenProps): React.JSX.Element {
  const orderId = params[0];
  // ONE request. The order carries its customer's name and each line carries its item's
  // code and unit, so this screen no longer reaches into the customer master to render a
  // heading — which also means it works for somebody with order access but not customer
  // access, instead of half-rendering behind a 403.
  const { data, loading, error, reload } = useQuery<SalesOrderView>(
    orderId ? salesApi.orderPath(orderId) : null,
  );

  // The server decides whether this order may change, and what to say when it may not. A
  // copy of that rule here would be a second source of truth, and the direction it drifts
  // is always the same: the button says yes, the endpoint says no, and the user has
  // already filled in the form.
  const policy = useEditPolicy(orderId ? salesApi.orderEditPolicyPath(orderId) : null);
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const columns: ReadonlyArray<Column<SalesOrderLineView>> = [
    {
      key: "lineNo",
      header: "#",
      width: "w-12",
      render: (l) => <span className="text-[var(--text-secondary)]">{l.lineNo}</span>,
    },
    {
      key: "item",
      header: "Item",
      // Joined from the item master through Engineering's port. The uuid is kept as the
      // hover title: it is what the row is actually keyed by, and a support call about the
      // wrong part goes faster when the id is one hover away.
      render: (l) => (
        <div className="min-w-0" title={l.itemId}>
          <div className="font-semibold text-[var(--text-primary)]">{l.itemCode ?? "—"}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">
            {l.itemName ?? "This item is no longer in the master"}
          </div>
        </div>
      ),
    },
    {
      key: "promised",
      header: "Promised",
      width: "w-40",
      // Per LINE, because that is where the promise actually lives — one order can carry
      // three dates, and the list's single date is only the earliest of them.
      render: (l) => {
        if (!l.requestedDeliveryDate) {
          return <span className="text-[var(--text-secondary)]">—</span>;
        }
        const outstanding = Number(l.deliveredQty) < Number(l.qty);
        const overdue = outstanding && isPastDue(l.requestedDeliveryDate);
        return (
          <div className="min-w-0">
            <div className="text-[var(--text-primary)]">{date(l.requestedDeliveryDate)}</div>
            {overdue ? (
              <StatusBadge
                tone="overdue"
                label={relativeDays(l.requestedDeliveryDate)}
                className="mt-0.5"
              />
            ) : (
              <div className="text-[12px] text-[var(--text-secondary)]">
                {relativeDays(l.requestedDeliveryDate)}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "hsn",
      header: "HSN",
      width: "w-24",
      render: (l) => <span className="font-[var(--font-mono)] text-[12px]">{l.hsn}</span>,
    },
    {
      key: "qty",
      header: "Ordered",
      numeric: true,
      width: "w-32",
      // The unit travels with the number now that the endpoint returns it.
      render: (l) => qty(l.qty, l.uom),
    },
    {
      key: "delivered",
      header: "Delivered",
      numeric: true,
      width: "w-32",
      // The gap between ordered and delivered is what dispatch still owes the customer.
      render: (l) => (
        <span
          className={
            Number(l.deliveredQty) >= Number(l.qty)
              ? "text-[var(--text-secondary)]"
              : "font-semibold text-[var(--text-primary)]"
          }
        >
          {qty(l.deliveredQty, l.uom)}
        </span>
      ),
    },
    { key: "rate", header: "Rate", numeric: true, width: "w-32", render: (l) => inr(l.rate) },
    {
      key: "taxable",
      header: "Taxable",
      numeric: true,
      width: "w-36",
      render: (l) => inr(l.taxableValue),
    },
    {
      key: "tax",
      header: "GST",
      numeric: true,
      width: "w-40",
      render: (l) => (
        <div>
          <div>{inr(Number(l.cgst) + Number(l.sgst) + Number(l.igst))}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            {Number(l.igst) > 0 ? `IGST ${num(l.gstRatePct, 2)}%` : `CGST + SGST ${num(l.gstRatePct, 2)}%`}
          </div>
        </div>
      ),
    },
    {
      key: "lineTotal",
      header: "Line total",
      numeric: true,
      width: "w-40",
      render: (l) => <span className="font-semibold">{inr(l.lineTotal)}</span>,
    },
  ];

  if (!orderId) {
    return (
      <Empty
        title="No order chosen"
        body="Open a sales order from the list to see its lines, tax split and delivery position."
        action={<BackLink />}
      />
    );
  }

  const credit = data ? creditBadge(data.creditStatus) : null;

  return (
    <div className="flex flex-col gap-4">
      <BackLink />

      <PageHeader
        title={data ? data.soNo : "Sales order"}
        subtitle="One order as it stands: who it is for, what was agreed line by line, the GST that was fixed on the order date, and how much of it has shipped."
        actions={
          data ? (
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
          ) : null
        }
        meta={
          data
            ? [
                { label: "Status", value: <StatusBadge status={data.status} /> },
                ...(credit ? [{ label: "Credit", value: <StatusBadge tone={credit.tone} label={credit.label} /> }] : []),
                { label: "Order value", value: inr(data.grandTotal) },
              ]
            : []
        }
      />

      {data ? (
        <section className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Fact
              label="Customer"
              value={
                data.customerName
                  ? `${data.customerName}${data.customerCode ? ` (${data.customerCode})` : ""}`
                  : "—"
              }
            />
            <Fact label="Their PO number" value={data.custPoNo} />
            <Fact label="Order date" value={date(data.orderDate)} />
            <Fact
              label="Next promise due"
              value={
                data.requestedDeliveryDate
                  ? `${date(data.requestedDeliveryDate)} (${relativeDays(data.requestedDeliveryDate)})`
                  : "No date promised"
              }
            />
            <Fact label="Selling GSTIN" value={data.supplierGstin} mono />
            <Fact label="Bill-to GSTIN" value={data.billToGstin ?? "Unregistered"} mono />
            {/* Mandatory on the IRP payload from 1 Aug 2026, which is why it is captured at
                order time — the last moment somebody can still ask the customer for it. */}
            <Fact label="Ship-to GSTIN" value={data.shipToGstin ?? "Not captured"} mono />
            <Fact label="Place of supply" value={`State ${data.placeOfSupply}`} />
            <Fact
              label="Supply type"
              value={data.isInterState ? "Inter-state — IGST" : "Intra-state — CGST + SGST"}
            />
            <Fact label="Lines" value={String(data.lines.length)} />
            <Fact
              label="Credit limit at decision"
              value={data.creditLimitSnapshot == null ? "Not assessed" : inr(data.creditLimitSnapshot)}
            />
            <Fact
              label="Existing exposure at decision"
              value={data.creditExposureSnapshot == null ? "Not assessed" : inr(data.creditExposureSnapshot)}
            />
            <Fact
              label="Exposure including this order"
              value={
                data.creditExposureSnapshot == null
                  ? "Not assessed"
                  : inr(Number(data.creditExposureSnapshot) + Number(data.grandTotal))
              }
            />
          </dl>
        </section>
      ) : null}

      {showHistory && orderId ? (
        <section className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
            Every change made to this order
          </h2>
          <DocumentHistory path={salesApi.orderHistoryPath(orderId)} />
        </section>
      ) : null}

      {editing && data && policy?.editable ? (
        <NewOrderDialog
          editing={{ order: data, amend: policy.tier === "amend" }}
          onClose={() => setEditing(false)}
          onCreated={() => {
            setEditing(false);
            // Re-read rather than trusting the response: an amendment can change the STATUS
            // too (a confirmed order goes back to draft for the credit re-check), and the
            // header must show that rather than the state the user started from.
            reload();
          }}
        />
      ) : null}

      <DataTable
        rows={data?.lines ?? []}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(l) => l.id}
        density="compact"
        caption="Order lines with quantity, rate, GST and delivered position"
        empty={<Empty title="This order has no lines" body="An order without lines cannot be confirmed or shipped." />}
      />

      {data ? (
        <section className="ml-auto w-full max-w-sm rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
          <dl className="flex flex-col gap-2 text-[13px]">
            <Total label="Taxable value" value={inr(data.subtotal)} />
            {/* Both halves of the split are shown even when one is zero: a blank row reads
                as "not loaded", and an accountant checking a return needs to see the zero. */}
            <Total label="CGST" value={inr(data.cgstTotal)} />
            <Total label="SGST" value={inr(data.sgstTotal)} />
            <Total label="IGST" value={inr(data.igstTotal)} />
            <Total label="Round off" value={inr(data.roundOff)} />
            <div className="mt-1 border-t border-[var(--border-subtle)] pt-2">
              <Total label="Order total" value={inr(data.grandTotal)} strong />
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function BackLink(): React.JSX.Element {
  return (
    <Link
      href="/sales/orders"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      All sales orders
    </Link>
  );
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd
        className={
          mono
            ? "truncate font-[var(--font-mono)] text-[13px] text-[var(--text-primary)]"
            : "truncate text-[13px] text-[var(--text-primary)]"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function Total({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}>
        {label}
      </dt>
      <dd
        className={
          strong
            ? "font-semibold tabular-nums text-[var(--text-primary)]"
            : "tabular-nums text-[var(--text-primary)]"
        }
        data-numeric=""
      >
        {value}
      </dd>
    </div>
  );
}
