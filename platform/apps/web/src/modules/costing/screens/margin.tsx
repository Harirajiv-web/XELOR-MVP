"use client";

import { useMemo, useState } from "react";
import { Info, Percent, ShieldCheck, TriangleAlert } from "lucide-react";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState } from "@spine/states";
import { date, humanise, inr, num, qty } from "@spine/format";
import { useAccess } from "@spine/access/permissions";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge, toneFor } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import {
  costingApi,
  floorVerdict,
  marginOf,
  round2,
  toNum,
  type ItemRow,
  type ProductionOrderRow,
  type ProductionOrderView,
  type QuotationSummary,
  type QuotationView,
} from "../api";

/**
 * MARGIN & APPROVAL — is this price above the line, and who has to say so.
 *
 * THREE THINGS THIS SCREEN REFUSES TO DO, each of which an ERP is normally happy to do badly:
 *
 * 1. IT DOES NOT MEASURE MARGIN ON THE GST-INCLUSIVE TOTAL. Margin is computed on the
 *    quotation's `subtotal` — the taxable value. GST is collected and paid over; counting it
 *    as revenue inflates every margin on the screen by the tax rate, and an 18% GST line
 *    turns a 6% job into something that reads as comfortable.
 *
 * 2. IT DOES NOT TREAT AN UNKNOWN COST AS ZERO. A quoted item with no standard cost in the
 *    master is counted, named and EXCLUDED, and the margin is withheld while any line is
 *    missing. A margin computed over the lines that happened to have costs is a number that
 *    is always better than the truth, which is precisely the direction a margin screen must
 *    never be wrong in.
 *
 * 3. IT DOES NOT DRAW AN APPROVAL CHAIN. There is no approval-limit table in this database
 *    and this module adds none, so there is no band, no threshold ladder and no named
 *    approver to display. What is real and what IS enforced is the permission:
 *    `POST /sales/quotations/:id/decide` is guarded by `sales.quotation.decide`, and the API
 *    refuses without it whatever any screen draws. So the screen names that permission, says
 *    whether the person reading holds it, and stops. An approval workflow that nothing
 *    enforces is worse than none, because people would rely on it.
 *
 * WHAT THE COST ACTUALLY IS, stated plainly because it decides how much weight these figures
 * can carry: the item master's `standard_cost`, one number per item, with no breakdown into
 * material and conversion and NO AS-OF DATE. It is the only stored cost in this system. The
 * Cost sheet screen builds a fuller one, and that one is not stored either — there is no
 * cost-sheet table — so it cannot be read back here. Both facts are on the screen.
 *
 * ESTIMATED VERSUS ACTUAL. Production orders record what a job was required to consume and
 * what it actually consumed, so the variance below is real. A job MARGIN is not: nothing in
 * this schema links a production order to the order that sold it — no `soRef`, no
 * `quotationId` — so the two are matched by ITEM here, and the screen says so rather than
 * implying a link that does not exist.
 */
export default function MarginScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const mayReadItems = can("engineering.item.read");
  const mayReadProduction = can("production.order.read");
  const mayDecide = can("sales.quotation.decide");

  const quotes = useCursorList<QuotationSummary>(costingApi.quotationsPath, { limit: 50 });
  const items = useCursorList<ItemRow>(mayReadItems ? costingApi.itemsPath : null, {
    limit: costingApi.pageSize,
  });

  const [quoteId, setQuoteId] = useState("");
  const [floorText, setFloorText] = useState("20");
  const floorPct = toNum(floorText) ?? 0;

  const detail = useQuery<QuotationView>(quoteId ? costingApi.quotationPath(quoteId) : null);

  const itemById = useMemo(
    () => new Map(items.rows.map((row) => [row.id, row])),
    [items.rows],
  );

  const priced = useMemo(() => pricedLines(detail.data, itemById), [detail.data, itemById]);

  const columns: ReadonlyArray<Column<QuotationSummary>> = [
    {
      key: "quoteNo",
      header: "Quotation",
      width: "w-44",
      render: (q) => (
        <button
          type="button"
          className="text-left font-semibold text-[var(--brand)] underline-offset-4 hover:underline"
          onClick={() => setQuoteId(q.id)}
          aria-label={`Check the margin on ${q.quoteNo}`}
        >
          {q.quoteNo}
          {q.revisionNo > 1 ? ` r${q.revisionNo}` : ""}
        </button>
      ),
    },
    {
      key: "customerName",
      header: "Customer",
      render: (q) => q.customerName ?? "Customer record unavailable",
    },
    {
      key: "quoteDate",
      header: "Raised",
      width: "w-32",
      render: (q) => <span className="text-[var(--text-secondary)]">{date(q.quoteDate)}</span>,
    },
    {
      key: "validUntil",
      header: "Holds until",
      width: "w-36",
      render: (q) =>
        q.expired ? (
          <StatusBadge tone="overdue" label={`Expired ${date(q.validUntil)}`} />
        ) : (
          <span className="text-[var(--text-secondary)]">{date(q.validUntil)}</span>
        ),
    },
    {
      key: "status",
      header: "State",
      width: "w-36",
      render: (q) => <StatusBadge status={q.status} />,
    },
    {
      key: "grandTotal",
      header: "Value with GST",
      numeric: true,
      width: "w-40",
      render: (q) => <span className="x-money">{inr(q.grandTotal)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Margin & approval"
        subtitle="What a quotation leaves after cost, measured on taxable value, against a floor you set."
        meta={[
          { label: "Floor", value: `${num(floorPct, 2)}%` },
          {
            label: "You may record a decision",
            value: mayDecide ? "Yes" : "No",
          },
        ]}
      />

      <div className="x-notice">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          The floor below is <strong>typed here and stored nowhere</strong> — this system holds
          no margin-policy table and this module adds none. It is a threshold for the
          comparison on this screen, not a rule the API will enforce on anyone else. The one
          thing that IS enforced is the permission named further down.
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="block w-48">
          <span className="field-label">Margin floor (%)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="any"
            className="field"
            value={floorText}
            aria-label="Margin floor percentage"
            onChange={(event) => setFloorText(event.target.value)}
          />
        </label>
        <p className="max-w-prose flex-1 text-[12px] leading-5 text-[var(--text-muted)]">
          Measured on the quotation&apos;s taxable value, not its GST-inclusive total. A floor
          applied to the wrong base is a floor that quietly passes jobs it should stop.
        </p>
      </div>

      <h2 className="x-section-heading">Quotations</h2>

      <DataTable
        rows={quotes.rows}
        columns={columns}
        loading={quotes.loading}
        loadingMore={quotes.loadingMore}
        error={quotes.error}
        hasMore={quotes.hasMore}
        onLoadMore={quotes.loadMore}
        onReload={quotes.reload}
        rowKey={(q) => q.id}
        caption="Quotations with their customer, dates, state and value"
        empty={
          <Empty
            title="No quotation has been raised yet"
            body="Margin is measured against a priced document. Raise a quotation in Quotations and it appears here — with its cost read from the item master, and the lines that have no cost named rather than counted as free."
            icon={<Percent />}
          />
        }
      />

      {quoteId ? (
        <section className="x-home-panel" aria-labelledby="margin-detail-heading">
          <div className="x-home-panel-head flex-wrap gap-3">
            <div>
              <h2 id="margin-detail-heading" className="x-section-heading">
                {detail.data ? detail.data.quoteNo : "Reading the quotation…"}
              </h2>
              <p>
                Cost is the item master&apos;s standard cost — one figure per item, no
                breakdown, no date. It is the only cost this database stores.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setQuoteId("")}
            >
              Close
            </button>
          </div>

          <div className="panel-b flex flex-col gap-4">
            {detail.error ? (
              <ErrorState error={detail.error} onRetry={detail.reload} />
            ) : !detail.data ? (
              <p className="text-[13px] text-[var(--text-secondary)]" role="status">
                Reading the quotation&apos;s lines…
              </p>
            ) : !mayReadItems ? (
              <div className="x-notice" data-tone="warning">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div>
                  Reading a cost needs{" "}
                  <code className="font-[var(--font-mono)]">engineering.item.read</code>, which
                  you do not hold. The quotation&apos;s value is shown above; no margin can be
                  computed for you, and none is guessed.
                </div>
              </div>
            ) : (
              <MarginVerdict
                quotation={detail.data}
                priced={priced}
                floorPct={floorPct}
                mayDecide={mayDecide}
                hasMoreItems={items.hasMore}
                onLoadMoreItems={items.loadMore}
                loadingMoreItems={items.loadingMore}
              />
            )}
          </div>
        </section>
      ) : null}

      <h2 className="x-section-heading">Estimated against actual, on the shop floor</h2>

      {mayReadProduction ? (
        <JobVariance itemById={itemById} mayReadItems={mayReadItems} />
      ) : (
        <div className="x-notice" data-tone="warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            Comparing an estimate against what a job actually consumed needs{" "}
            <code className="font-[var(--font-mono)]">production.order.read</code>, which you do
            not hold. Nothing is shown rather than a partial figure.
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- the margin verdict ---------------------------- */

interface PricedLine {
  id: string;
  label: string;
  qty: number;
  uom: string;
  rate: number;
  revenue: number;
  unitCost: number | null;
  cost: number | null;
}

function pricedLines(
  quotation: QuotationView | null,
  itemById: ReadonlyMap<string, ItemRow>,
): PricedLine[] {
  if (!quotation) return [];
  return quotation.lines.map((line) => {
    const lineQty = toNum(line.qty) ?? 0;
    const rate = toNum(line.rate) ?? 0;
    const unitCost = toNum(itemById.get(line.itemId)?.standardCost ?? null);
    return {
      id: line.id,
      label: `${line.itemCode ?? "Item removed from the master"} — ${line.itemName ?? line.description ?? "no description"}`,
      qty: lineQty,
      uom: line.uom,
      rate,
      revenue: round2(lineQty * rate),
      unitCost,
      cost: unitCost === null ? null : round2(lineQty * unitCost),
    };
  });
}

function MarginVerdict({
  quotation,
  priced,
  floorPct,
  mayDecide,
  hasMoreItems,
  onLoadMoreItems,
  loadingMoreItems,
}: {
  quotation: QuotationView;
  priced: readonly PricedLine[];
  floorPct: number;
  mayDecide: boolean;
  hasMoreItems: boolean;
  onLoadMoreItems: () => void;
  loadingMoreItems: boolean;
}): React.JSX.Element {
  const uncosted = priced.filter((line) => line.cost === null);
  const taxable = toNum(quotation.subtotal) ?? 0;
  const totalCost = uncosted.length
    ? null
    : round2(priced.reduce((sum, line) => sum + (line.cost ?? 0), 0));
  const margin = totalCost === null ? null : marginOf(taxable, totalCost);
  const verdict = floorVerdict(margin, floorPct);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="grid-table min-w-[48rem]">
          <caption className="sr-only">
            Each quoted line with its revenue, the item master&apos;s cost and the margin it
            leaves
          </caption>
          <thead>
            <tr>
              <th scope="col">Line</th>
              <th scope="col">Quantity</th>
              <th scope="col" className="text-right!">
                Rate
              </th>
              <th scope="col" className="text-right!">
                Revenue
              </th>
              <th scope="col" className="text-right!">
                Standard cost
              </th>
              <th scope="col" className="text-right!">
                Margin
              </th>
            </tr>
          </thead>
          <tbody>
            {priced.map((line) => {
              const lineMargin = line.cost === null ? null : marginOf(line.revenue, line.cost);
              return (
                <tr key={line.id}>
                  <td>{line.label}</td>
                  <td>{qty(line.qty, line.uom)}</td>
                  <td className="text-right tabular-nums">{inr(line.rate)}</td>
                  <td className="text-right tabular-nums">{inr(line.revenue)}</td>
                  <td className="text-right tabular-nums">
                    {line.cost === null ? (
                      <span className="text-[var(--status-overdue-text)]">No cost on record</span>
                    ) : (
                      inr(line.cost)
                    )}
                  </td>
                  <td className="text-right tabular-nums">
                    {lineMargin ? `${num(lineMargin.pct, 1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
            <tr data-total="">
              <td>Quotation, on taxable value</td>
              <td />
              <td />
              <td className="text-right tabular-nums">{inr(quotation.subtotal)}</td>
              <td className="text-right tabular-nums">
                {totalCost === null ? "Incomplete" : inr(totalCost)}
              </td>
              <td className="text-right tabular-nums">
                {margin ? `${num(margin.pct, 2)}%` : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {uncosted.length > 0 ? (
        <div className="x-notice" data-tone="error">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <strong>
              No margin is shown for this quotation, and that is the answer rather than a
              failure.
            </strong>{" "}
            {uncosted.length} line{uncosted.length === 1 ? "" : "s"} —{" "}
            {uncosted.map((line) => line.label).join("; ")} — {uncosted.length === 1 ? "has" : "have"}{" "}
            no standard cost in the item master, or the item is not in the page of the master
            loaded so far. A margin over only the costed lines would be higher than the truth
            every time.
            {hasMoreItems ? (
              <>
                {" "}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm mt-2"
                  onClick={onLoadMoreItems}
                  disabled={loadingMoreItems}
                >
                  {loadingMoreItems ? "Loading…" : "Load more of the item master"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            label="Taxable value"
            value={inr(quotation.subtotal)}
            hint={`GST of ${inr(quotation.taxTotal)} is excluded — it is collected and paid over, not earned.`}
          />
          <Tile
            label="Cost at standard"
            value={inr(totalCost)}
            hint="The item master's standard cost per quoted item. No breakdown and no as-of date exist for it."
          />
          <Tile
            label="Margin"
            value={margin ? `${num(margin.pct, 2)}%` : "—"}
            hint={margin ? `${inr(margin.amount)} on ${inr(margin.revenue)}` : "—"}
          />
          <Tile
            label={`Against a ${num(floorPct, 2)}% floor`}
            value={
              verdict === "below" ? "Below" : verdict === "at" ? "At the floor" : verdict === "above" ? "Above" : "—"
            }
            hint={
              verdict === "below"
                ? "This price does not clear the floor entered on this screen."
                : "This price clears the floor entered on this screen."
            }
          />
        </div>
      )}

      {/* THE APPROVAL STATEMENT. Deliberately a sentence, not a workflow — see the file
          header. It names the permission the API genuinely checks and says whether the person
          reading holds it, and offers no button that would imply anything more. */}
      <div className="x-notice" data-tone={verdict === "below" ? "warning" : undefined}>
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          {verdict === "below" ? (
            <>
              <strong>This price is below the floor you entered.</strong> There is no
              approval-limit table in this system, so nothing here can route it to anybody.
              What is real: recording the customer&apos;s answer to {quotation.quoteNo} requires{" "}
              <code className="font-[var(--font-mono)]">sales.quotation.decide</code>, which the
              API enforces on the endpoint itself.{" "}
              {mayDecide
                ? "You hold it — which means the decision, and the margin behind it, is yours."
                : "You do not hold it, so the decision belongs to somebody who does."}
            </>
          ) : (
            <>
              Recording the customer&apos;s answer to {quotation.quoteNo} requires{" "}
              <code className="font-[var(--font-mono)]">sales.quotation.decide</code>.{" "}
              {mayDecide ? "You hold it." : "You do not hold it."} Quotations owns that action;
              this screen only measures what the price leaves. A quotation that has
              {quotation.expired ? " " : " not "}expired
              {quotation.expired
                ? ` — it stopped holding on ${date(quotation.validUntil)} — cannot be accepted at all until it is revised.`
                : ` holds until ${date(quotation.validUntil)}.`}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* --------------------------- estimated versus actual ------------------------- */

function JobVariance({
  itemById,
  mayReadItems,
}: {
  itemById: ReadonlyMap<string, ItemRow>;
  mayReadItems: boolean;
}): React.JSX.Element {
  const orders = useCursorList<ProductionOrderRow>(costingApi.productionOrdersPath, {
    limit: 50,
  });
  const [orderId, setOrderId] = useState("");
  const detail = useQuery<ProductionOrderView>(
    orderId ? costingApi.productionOrderPath(orderId) : null,
  );

  const rows = detail.data?.components ?? [];
  const missing = rows.filter(
    (component) => toNum(itemById.get(component.componentItemId)?.standardCost ?? null) === null,
  );
  const estimated = missing.length
    ? null
    : round2(
        rows.reduce(
          (sum, component) =>
            sum +
            (toNum(component.requiredQty) ?? 0) *
              (toNum(itemById.get(component.componentItemId)?.standardCost ?? null) ?? 0),
          0,
        ),
      );
  const actual = missing.length
    ? null
    : round2(
        rows.reduce(
          (sum, component) =>
            sum +
            (toNum(component.issuedQty) ?? 0) *
              (toNum(itemById.get(component.componentItemId)?.standardCost ?? null) ?? 0),
          0,
        ),
      );

  if (orders.error) return <ErrorState error={orders.error} onRetry={orders.reload} />;

  if (!orders.loading && orders.rows.length === 0) {
    return (
      <Empty
        title="No production order has been raised yet"
        body="A job's actual consumption is recorded when components are issued to a production order. Until one exists there is nothing to compare an estimate against, and nothing is shown in its place."
      />
    );
  }

  return (
    <section className="x-home-panel" aria-labelledby="variance-heading">
      <div className="x-home-panel-head flex-wrap gap-3">
        <div>
          <h2 id="variance-heading" className="x-section-heading">
            What a job was estimated to consume, and what it did
          </h2>
          <p>
            Matched to a quotation by ITEM, never by a recorded link — this schema holds no
            reference from a production order back to the order that sold it.
          </p>
        </div>
        <label className="flex min-w-0 flex-col gap-1 text-[12px] text-[var(--text-secondary)]">
          Production order
          <select
            className="field h-10"
            value={orderId}
            aria-label="Production order to compare"
            onChange={(event) => setOrderId(event.target.value)}
          >
            <option value="">{orders.loading ? "Loading…" : "Choose a job…"}</option>
            {orders.rows.map((order) => (
              <option key={order.id} value={order.id}>
                {order.orderNo} · {order.itemCode ?? "item unavailable"} ·{" "}
                {humanise(order.status)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="panel-b flex flex-col gap-4">
        {!orderId ? (
          <p className="text-[13px] text-[var(--text-secondary)]">
            Choose a job above. Its components are shown with what the bill of material
            required and what was actually issued to the floor.
          </p>
        ) : detail.error ? (
          <ErrorState error={detail.error} onRetry={detail.reload} />
        ) : !detail.data ? (
          <p className="text-[13px] text-[var(--text-secondary)]" role="status">
            Reading the job&apos;s components…
          </p>
        ) : (
          <>
            <dl className="flex flex-wrap gap-x-8 gap-y-2">
              <Fact label="Job" value={detail.data.orderNo} />
              <Fact label="Product" value={detail.data.itemCode ?? "Item unavailable"} />
              <Fact
                label="To produce"
                value={qty(detail.data.qtyToProduce, detail.data.uom ?? undefined)}
              />
              <Fact
                label="Produced"
                value={qty(detail.data.producedQty, detail.data.uom ?? undefined)}
              />
              <Fact
                label="State"
                value={<StatusBadge tone={toneFor(detail.data.status)} status={detail.data.status} />}
              />
            </dl>

            <div className="overflow-x-auto">
              <table className="grid-table min-w-[44rem]">
                <caption className="sr-only">
                  Components with required and issued quantities and their cost at standard
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Component</th>
                    <th scope="col">Required</th>
                    <th scope="col">Issued</th>
                    <th scope="col" className="text-right!">
                      At standard, required
                    </th>
                    <th scope="col" className="text-right!">
                      At standard, issued
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((component) => {
                    const unit = toNum(
                      itemById.get(component.componentItemId)?.standardCost ?? null,
                    );
                    const required = toNum(component.requiredQty) ?? 0;
                    const issued = toNum(component.issuedQty) ?? 0;
                    return (
                      <tr key={component.lineNo}>
                        <td>
                          {component.itemCode ?? "Item unavailable"}
                          <div className="text-[11px] text-[var(--text-muted)]">
                            {component.itemName ?? "No name on the item master"}
                          </div>
                        </td>
                        <td>{qty(required, component.uom ?? undefined)}</td>
                        <td>{qty(issued, component.uom ?? undefined)}</td>
                        <td className="text-right tabular-nums">
                          {unit === null ? "—" : inr(round2(required * unit))}
                        </td>
                        <td className="text-right tabular-nums">
                          {unit === null ? "—" : inr(round2(issued * unit))}
                        </td>
                      </tr>
                    );
                  })}
                  <tr data-total="">
                    <td>Material cost at standard</td>
                    <td />
                    <td />
                    <td className="text-right tabular-nums">
                      {estimated === null ? "Incomplete" : inr(estimated)}
                    </td>
                    <td className="text-right tabular-nums">
                      {actual === null ? "Incomplete" : inr(actual)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {!mayReadItems ? (
              <p className="text-[12px] leading-5 text-[var(--text-muted)]">
                Costing these quantities needs{" "}
                <code className="font-[var(--font-mono)]">engineering.item.read</code>. The
                quantities are shown; the money is not.
              </p>
            ) : missing.length > 0 ? (
              <div className="x-notice" data-tone="warning">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div>
                  {missing.length} component{missing.length === 1 ? "" : "s"} on this job{" "}
                  {missing.length === 1 ? "has" : "have"} no standard cost in the item master,
                  so neither total is shown. The quantities above are still exactly what was
                  required and what was issued.
                </div>
              </div>
            ) : estimated !== null && actual !== null ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Tile
                  label="Estimated material"
                  value={inr(estimated)}
                  hint="What the bill of material required for this job, at the master's standard cost."
                />
                <Tile
                  label="Actual material"
                  value={inr(actual)}
                  hint="What was actually issued to the floor, at the same standard cost."
                />
                <Tile
                  label="Variance"
                  value={inr(round2(actual - estimated), { sign: true })}
                  hint={
                    actual > estimated
                      ? "The job consumed more than the bill of material said it would. A quote built on the BOM was optimistic by this much."
                      : actual < estimated
                        ? "The job consumed less than planned — or has not finished issuing yet. Check the job state above before reading this as a saving."
                        : "Issued exactly what was required."
                  }
                />
              </div>
            ) : null}

            <p className="text-[12px] leading-6 text-[var(--text-muted)]">
              This is a MATERIAL variance, not a job margin. Turning it into a margin needs a
              selling price, and nothing in this schema links this production order to the
              order or quotation that sold it — there is no such column. Matching by item code
              is a reasonable human judgement; it is not a fact the database asserts, and this
              screen will not print it as one.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------- pieces ---------------------------------- */

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}): React.JSX.Element {
  return (
    <div className="x-stat-card">
      <span className="x-stat-top">{label}</span>
      <strong className="x-stat-value x-money">{value}</strong>
      <p className="x-stat-hint">{hint}</p>
    </div>
  );
}

function Fact({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="text-[12.5px] font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
