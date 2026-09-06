"use client";

import Link from "next/link";
import { ArrowLeft, CalendarX2, CircleSlash, ShoppingCart } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { date, inr, num, qty, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { QuotationLineView, QuotationView } from "../api";
import { isPriceStale, quotationApi } from "../api";
import { QuotationActions } from "../components/quotation-actions";

/**
 * ONE QUOTATION.
 *
 * Reached by clicking a row on the list; `/quotation/detail/<id>` gives this screen the id in
 * `params[0]`. There is no sidebar entry, because a specific quotation is never somewhere you
 * navigate to cold.
 *
 * The totals are shown AS STORED, not recomputed. `QuotationService.priceLines` rounded each
 * line, then each line's tax, then summed — and it did that on the day the price was quoted.
 * A screen that added the numbers up again its own way would eventually disagree with the
 * document the customer is holding, and the customer's copy is the one that matters.
 */
export default function QuotationDetailScreen({ params }: ScreenProps): React.JSX.Element {
  const quotationId = params[0];
  // ONE request. The quotation carries its customer's name and each line carries its item's
  // code, so this screen never reaches into the customer master to render a heading — which
  // means it works for somebody with quotation access but not customer access, instead of
  // half-rendering behind a 403.
  const { data, loading, error, reload } = useQuery<QuotationView>(
    quotationId ? quotationApi.quotationPath(quotationId) : null,
  );

  const columns: ReadonlyArray<Column<QuotationLineView>> = [
    {
      key: "lineNo",
      header: "#",
      width: "w-12",
      render: (l) => <span className="text-[var(--text-secondary)]">{l.lineNo}</span>,
    },
    {
      key: "item",
      header: "Item",
      // Joined from the item master through Engineering's port. The uuid is kept as the hover
      // title: it is what the row is actually keyed by, and a support call about the wrong
      // part goes faster when the id is one hover away.
      render: (l) => (
        <div className="min-w-0" title={l.itemId}>
          <div className="font-semibold text-[var(--text-primary)]">{l.itemCode ?? "—"}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">
            {l.description ?? l.itemName ?? "This item is no longer in the master"}
          </div>
        </div>
      ),
    },
    {
      key: "hsn",
      header: "HSN",
      width: "w-24",
      render: (l) => <span className="font-[var(--font-mono)] text-[12px]">{l.hsn}</span>,
    },
    {
      key: "qty",
      header: "Quantity",
      numeric: true,
      width: "w-32",
      // The unit travels with the number, as it does everywhere else in this product.
      render: (l) => qty(l.qty, l.uom),
    },
    { key: "rate", header: "Rate", numeric: true, width: "w-32", render: (l) => inr(l.rate) },
    {
      key: "gst",
      header: "GST",
      numeric: true,
      width: "w-24",
      render: (l) => <span className="text-[var(--text-secondary)]">{num(l.gstRatePct, 2)}%</span>,
    },
    {
      key: "promised",
      header: "Offered for",
      width: "w-40",
      render: (l) =>
        l.requestedDeliveryDate ? (
          <span className="text-[var(--text-primary)]">{date(l.requestedDeliveryDate)}</span>
        ) : (
          <span className="text-[var(--text-secondary)]">No date offered</span>
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

  if (!quotationId) {
    return (
      <Empty
        title="No quotation chosen"
        body="Open a quotation from the list to see what was priced, how long the price holds and what became of it."
        action={<BackLink />}
      />
    );
  }
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return <Loading label="Loading quotation…" />;

  const stale = isPriceStale(data);

  return (
    <div className="flex flex-col gap-4">
      <BackLink />

      <PageHeader
        title={data.revisionNo > 1 ? `${data.quoteNo} · revision ${data.revisionNo}` : data.quoteNo}
        subtitle="One quotation as it stands: who it is for, what was priced line by line, how long the price holds, and what became of it."
        meta={[
          { label: "Status", value: <StatusBadge status={data.status} /> },
          { label: "Customer", value: data.customerName ?? "—" },
          { label: "Raised", value: date(data.quoteDate) },
          {
            label: "Price holds until",
            value: (
              <span className="inline-flex items-center gap-2">
                {date(data.validUntil)}
                {stale ? (
                  <StatusBadge tone="overdue" label={relativeDays(data.validUntil)} />
                ) : (
                  <span className="text-[var(--text-secondary)]">
                    {relativeDays(data.validUntil)}
                  </span>
                )}
              </span>
            ),
          },
          { label: "Value", value: inr(data.grandTotal) },
        ]}
      />

      {/* ---- what became of it, said before anything else ------------------- */}
      {data.convertedSoNo ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--ok)] bg-[var(--ok-soft)] px-4 py-3 text-[var(--ok-ink)]">
          <div className="flex gap-2.5">
            <ShoppingCart className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0 text-[12.5px] leading-5">
              <p className="font-semibold">
                This quotation became sales order {data.convertedSoNo}.
              </p>
              <p className="mt-0.5 opacity-90">
                The order was raised through Sales&apos; own service, so it carries the GST
                treatment, the credit check and the numbering a typed order would have. A
                quotation converts once — the database holds a unique constraint on the order
                it became, not merely a check somebody could be talked past.
              </p>
              {data.convertedOrderId ? (
                <Link
                  href={`/sales/order/${data.convertedOrderId}`}
                  className="mt-1.5 inline-flex items-center gap-1.5 font-semibold underline"
                >
                  Open {data.convertedSoNo}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {stale ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--warn)] bg-[var(--warn-soft)] px-4 py-3 text-[var(--warn-ink)]">
          <div className="flex gap-2.5">
            <CalendarX2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0 text-[12.5px] leading-5">
              <p className="font-semibold">
                This price expired on {date(data.validUntil)} — {relativeDays(data.validUntil)}.
              </p>
              <p className="mt-0.5">
                {data.status === "sent"
                  ? "The customer can no longer accept it: the server refuses an acceptance after the validity date, because a price nobody re-checked is not a price this plant should be held to. Re-price it instead — a revision supersedes this one rather than overwriting it, so what they were shown in the first place stays readable."
                  : "Nothing here is wrong; the date has simply passed. Any new conversation about this work needs a fresh revision, which supersedes this one rather than overwriting it."}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {data.status === "rejected" ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-3">
          <div className="flex gap-2.5">
            <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
            <div className="min-w-0 text-[12.5px] leading-5">
              <p className="font-semibold text-[var(--text-primary)]">
                The customer did not accept this quotation.
              </p>
              <p className="mt-0.5 text-[var(--text-secondary)]">
                {data.lostReason ?? "No reason was recorded against it."}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <QuotationActions quotation={data} onChanged={reload} onReload={reload} />

      {/* ---- the facts ------------------------------------------------------ */}
      <section className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Customer" value={data.customerName ?? "—"} />
          <Fact label="Their enquiry reference" value={data.enquiryRef ?? "None given"} />
          <Fact label="Quote date" value={date(data.quoteDate)} />
          <Fact
            label="Price holds until"
            value={`${date(data.validUntil)} (${relativeDays(data.validUntil)})`}
          />
          <Fact label="Payment terms" value={data.paymentTerms ?? "Not stated"} />
          <Fact label="Delivery terms" value={data.deliveryTerms ?? "Not stated"} />
          <Fact label="Lines" value={String(data.lines.length)} />
          <Fact
            label="Revision"
            value={
              data.revisionNo > 1
                ? `${data.revisionNo} — this one supersedes an earlier price`
                : "1 — the original price"
            }
          />
          <Fact
            label="Became"
            value={data.convertedSoNo ?? "Not yet an order"}
            mono={Boolean(data.convertedSoNo)}
          />
        </dl>
        {data.notes ? (
          <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
              Notes to the customer
            </dt>
            <dd className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-[var(--text-primary)]">
              {data.notes}
            </dd>
          </div>
        ) : null}
      </section>

      <DataTable
        rows={data.lines}
        columns={columns}
        rowKey={(l) => l.id}
        density="compact"
        caption={`Lines quoted on ${data.quoteNo}, with quantity, rate, GST rate and line total`}
        empty={
          <Empty
            title="This quotation has no lines"
            body="A quotation with no lines cannot be sent — the API refuses to create one, so a row in this state came from somewhere other than this application."
          />
        }
      />

      <section className="ml-auto w-full max-w-sm rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <dl className="flex flex-col gap-2 text-[13px]">
          <Total label="Before tax" value={inr(data.subtotal)} />
          <Total label="GST at the quoted rates" value={inr(data.taxTotal)} />
          <div className="mt-1 border-t border-[var(--border-subtle)] pt-2">
            <Total label="Quotation total" value={inr(data.grandTotal)} strong />
          </div>
        </dl>
        {/* Stated on the screen rather than only in a ticket. A quotation applies each line's
            quoted rate; the CGST/SGST-against-IGST split is decided on the ORDER, from the
            selling registration and the delivery state, on the day the order is raised. */}
        <p className="mt-3 text-[11px] leading-[1.5] text-[var(--text-muted)]">
          The tax here is each line&apos;s quoted rate applied to that line. It is not yet split
          into CGST, SGST or IGST — that is decided when the order is raised, from the selling
          registration and the place of supply, and it can move the figure by a rupee of
          rounding.
        </p>
      </section>
    </div>
  );
}

function BackLink(): React.JSX.Element {
  return (
    <Link
      href="/quotation/list"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      All quotations
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
      <dt
        className={
          strong ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
        }
      >
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
