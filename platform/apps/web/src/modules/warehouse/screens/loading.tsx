"use client";

import { useCallback, useMemo, useState } from "react";
import { Loader2, MapPin, Truck } from "lucide-react";
import { api } from "@spine/api/client";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { Can, useAccess } from "@spine/access/permissions";
import { Empty, ErrorState, Loading as LoadingState } from "@spine/states";
import { date, inr, qty as fmtQty, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type {
  DispatchBody,
  DispatchResult,
  SalesOrderDetail,
  SalesOrderSummary,
} from "../api";
import {
  CAPABILITY_GAPS,
  daysUntil,
  isDispatchable,
  outstanding,
  parseQty,
  planLoad,
  warehouseApi,
} from "../api";
import { ActionNotice, HonestyNote, useHandlingKey, useInFlight } from "./shared";

/**
 * ============================================================================================
 * LOADING — A PLAN FOR THE TRUCK, AND THE MOMENT THE GOODS ACTUALLY LEAVE.
 * ============================================================================================
 *
 * ------------------------------------------------------------------------------------------
 * THIS IS A PLAN. IT IS NOT A GUARANTEE, AND IT IS NOT A LOAD.
 * ------------------------------------------------------------------------------------------
 * The word is used deliberately and repeatedly, on screen as well as here, because the failure
 * mode of a screen like this is not that it is wrong — it is that it is believed. A dispatch
 * clerk who is shown a "load" will stop measuring. A transport supervisor who is shown a picture
 * of a packed truck will stop counting. Neither of them will go back to checking once they have
 * stopped, and the first time the goods do not fit, the delay costs more than the screen ever
 * saved.
 *
 * So what is below is a GROUPING and a SEQUENCE, computed from data that genuinely exists:
 * orders that are going to the same customer, ordered by the earliest promise still outstanding.
 * That is real arithmetic and it answers a real question — which orders belong in the same
 * conversation about a vehicle, and which one has to leave first.
 *
 * ------------------------------------------------------------------------------------------
 * WHY THERE IS NO BIN-PACK, AND WHY THAT IS THE RIGHT ANSWER RATHER THAN A MISSING FEATURE.
 * ------------------------------------------------------------------------------------------
 * A deterministic bin-pack over real dimensions would be honest arithmetic. There ARE no
 * dimensions. The item master carries a code, a name, a description, a type, a unit of measure,
 * an HSN code, a group, three flags and a standard cost. No weight. No length, breadth or
 * height. No volume, no pack size, no stackability. There is no vehicle master either — nothing
 * anywhere records that the plant has a 32-foot container or a tempo.
 *
 * A pack computed from that would be a pack computed from invented numbers, and it would look
 * exactly as convincing as a real one. So this screen does not compute one, does not draw a 3D
 * truck, and says why in the place somebody would look for it. If weights and dimensions are
 * ever added to the item master, `planLoad` in `api.ts` is the function to extend — and the
 * result would still be a plan.
 *
 * ------------------------------------------------------------------------------------------
 * THE ONE THING THIS SCREEN ACTUALLY DOES TO THE LEDGER.
 * ------------------------------------------------------------------------------------------
 * `POST /sales/orders/:id/dispatch`. It issues the goods out of the order's finished-goods store
 * through INVENTORY's single write path, inside the dispatch transaction, and raises the delivery
 * note and the invoice in the same commit. This screen builds a document body and does not build
 * a stock movement.
 *
 * The idempotency key is pinned to the lines being shipped, so a dispatch posted twice because a
 * yard tablet lost signal replays rather than shipping the order twice — which, on a dispatch,
 * would also raise a second invoice.
 */

/** What the clerk has typed against one order and not yet dispatched. Never a balance. */
type DispatchForm = Record<string, string>;

export default function LoadingScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const canDispatch = can("sales.dispatch.execute");

  const orders = useCursorList<SalesOrderSummary>(warehouseApi.salesOrdersPath, {
    limit: warehouseApi.pageSize,
  });

  const [orderId, setOrderId] = useState("");
  const detail = useQuery<SalesOrderDetail>(
    orderId ? warehouseApi.salesOrderPath(orderId) : null,
  );

  const [lines, setLines] = useState<DispatchForm>({});
  const [transporter, setTransporter] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [ewayBillNo, setEwayBillNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [posted, setPosted] = useState<DispatchResult | null>(null);

  const handling = useHandlingKey();
  const inFlight = useInFlight();

  const shippable = useMemo(
    () => orders.rows.filter((row) => isDispatchable(row.status)),
    [orders.rows],
  );

  /** Deterministic: the same orders always produce the same groups in the same sequence. */
  const groups = useMemo(() => planLoad(shippable), [shippable]);

  const order = detail.data;
  const openLines = useMemo(
    () => (order ? order.lines.filter((line) => outstanding(line.qty, line.deliveredQty) > 0) : []),
    [order],
  );

  function openOrder(id: string): void {
    setOrderId(id);
    setLines({});
    setPosted(null);
    setError(null);
  }

  /** Ship everything still owed on every line. The common case, in one press. */
  const shipAll = useCallback((): void => {
    const next: DispatchForm = {};
    for (const line of openLines) {
      next[line.id] = String(outstanding(line.qty, line.deliveredQty));
    }
    setLines(next);
  }, [openLines]);

  const body: DispatchBody | null = useMemo(() => {
    if (!order) return null;
    const out: DispatchBody["lines"] = [];
    for (const line of openLines) {
      const amount = parseQty(lines[line.id] ?? "");
      if (amount === null || amount <= 0) continue;
      out.push({ orderLineId: line.id, qty: amount });
    }
    if (out.length === 0) return null;
    return {
      lines: out,
      ...(transporter.trim() ? { transporter: transporter.trim() } : {}),
      ...(vehicleNo.trim() ? { vehicleNo: vehicleNo.trim() } : {}),
      ...(ewayBillNo.trim() ? { ewayBillNo: ewayBillNo.trim() } : {}),
    };
  }, [ewayBillNo, lines, openLines, order, transporter, vehicleNo]);

  /** Typed past what the customer is owed. Refused here, and again by the server. */
  const overLines = useMemo(
    () =>
      openLines.filter((line) => {
        const amount = parseQty(lines[line.id] ?? "");
        return amount !== null && amount > outstanding(line.qty, line.deliveredQty);
      }),
    [lines, openLines],
  );

  async function dispatch(): Promise<void> {
    if (!body || !order || inFlight.held()) return;
    inFlight.hold();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<DispatchResult>(warehouseApi.dispatchPath(order.id), body, {
        // Pinned to the order AND the lines. A retry after a dropped connection replays; it
        // cannot ship the goods twice or raise a second invoice.
        idempotencyKey: handling.keyFor(`dispatch:${order.id}`, body),
      });
      setPosted(result);
      setLines({});
      detail.reload();
      orders.reload();
    } catch (e) {
      setError(e);
    } finally {
      inFlight.release();
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Loading"
        subtitle="Orders grouped by where they are going and sequenced by what is promised first — a plan for the vehicle, and the screen where a dispatch is actually posted."
        meta={[
          { label: "Orders ready", value: orders.loading ? "…" : String(shippable.length) },
          { label: "Destinations", value: orders.loading ? "…" : String(groups.length) },
        ]}
      />

      {/* THE BANNER THAT MUST NOT BE REMOVED. See the reasoning at the top of this file. */}
      <div className="x-notice" data-tone="warning" role="note">
        <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">This is a load PLAN, not a load.</p>
          <p>{CAPABILITY_GAPS.dimensions}</p>
        </div>
      </div>

      <ActionNotice error={error} />

      {posted ? (
        <section
          className="rounded-[var(--radius-card)] border border-[var(--status-approved-text)] bg-[var(--status-approved-bg)] p-4"
          role="status"
          aria-live="polite"
        >
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">
            Dispatched — delivery note {posted.dispatchNo}
          </p>
          <p className="mt-1 text-[12px] leading-[1.6] text-[var(--text-secondary)]">
            The goods left the ledger and the invoice was raised in the same transaction. Invoice{" "}
            <b className="text-[var(--text-primary)]">{posted.invoiceNo}</b> for{" "}
            <b className="text-[var(--text-primary)]">{inr(posted.invoiceTotal)}</b>, due{" "}
            {date(posted.dueDate)}. The order is now {posted.orderStatus.replace(/_/g, " ")}.
          </p>
          <p className="mt-1.5 text-[12px] text-[var(--text-secondary)]">
            Stock entry{" "}
            <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11px]">
              {posted.stockEntryRef}
            </code>{" "}
            — {posted.movements.length} movement{posted.movements.length === 1 ? "" : "s"} posted
            through Inventory. Which lots left was resolved by first receipt at the moment of
            posting.
          </p>
        </section>
      ) : null}

      {/* ---- the plan ----------------------------------------------------------------------- */}
      {orders.loading ? (
        <LoadingState label="Reading the order book…" />
      ) : orders.error ? (
        <ErrorState error={orders.error} onRetry={orders.reload} />
      ) : groups.length === 0 ? (
        <Empty
          title="Nothing is ready to leave"
          body="Only confirmed and part-shipped orders can be dispatched. An order on credit hold is not offered here — Accounts releases that, not the yard."
        />
      ) : (
        <section className="x-home-panel" aria-labelledby="load-plan-heading">
          <div className="x-home-panel-head flex-wrap gap-3">
            <div>
              <h2 id="load-plan-heading" className="x-section-heading">
                Grouped by destination, earliest promise first
              </h2>
              <p>
                Same customer, same conversation about a vehicle. The order of the groups is the
                order things are due — it is not a loading sequence and not a route.
              </p>
            </div>
          </div>

          <ul className="divide-y divide-[var(--border-subtle)]">
            {groups.map((group, index) => {
              const late = (daysUntil(group.earliestPromise) ?? 0) < 0 && group.earliestPromise !== null;
              return (
                <li key={group.key} className="p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
                        <span className="text-[var(--text-muted)] tabular-nums">{index + 1}.</span>
                        <MapPin className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
                        {group.destinationLabel}
                        <StatusBadge
                          status={group.interState ? "inter_state" : "in_state"}
                          tone={group.interState ? "pending" : "approved"}
                          label={group.stateCode}
                        />
                      </p>
                      <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                        {group.orders.length} order{group.orders.length === 1 ? "" : "s"} ·{" "}
                        {group.openLineCount} line{group.openLineCount === 1 ? "" : "s"} ·{" "}
                        {inr(group.totalValue)}
                        {group.earliestPromise ? (
                          <>
                            {" "}
                            · earliest promise {date(group.earliestPromise)}{" "}
                            <b className={late ? "text-[var(--status-overdue-text)]" : undefined}>
                              ({relativeDays(group.earliestPromise)})
                            </b>
                          </>
                        ) : (
                          " · no promised date on any of these orders"
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {group.orders.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => openOrder(row.id)}
                        aria-pressed={orderId === row.id}
                        className={`btn btn-ghost btn-sm ${
                          orderId === row.id ? "border-[var(--brand)] text-[var(--brand)]" : ""
                        }`}
                      >
                        {row.soNo} · {row.lineCount} line{row.lineCount === 1 ? "" : "s"} ·{" "}
                        {inr(row.grandTotal)}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>

          {orders.hasMore ? (
            <div className="border-t border-[var(--border-subtle)] px-5 py-3">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={orders.loadMore}
                disabled={orders.loadingMore}
              >
                {orders.loadingMore ? "Loading…" : "Load more orders into the plan"}
              </button>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                The plan groups the orders that have been loaded. Orders still on the server are not
                in it yet — which is worth knowing before concluding a destination has only one.
              </p>
            </div>
          ) : null}
        </section>
      )}

      {/* ---- the dispatch ------------------------------------------------------------------- */}
      {orderId ? (
        detail.loading ? (
          <LoadingState label="Reading the order…" />
        ) : detail.error ? (
          <ErrorState error={detail.error} onRetry={detail.reload} />
        ) : !order ? (
          <Empty title="That order is no longer readable" body="Pick another from the plan above." />
        ) : (
          <section className="x-home-panel" aria-labelledby="load-dispatch-heading">
            <div className="x-home-panel-head flex-wrap gap-3">
              <div>
                <h2 id="load-dispatch-heading" className="x-section-heading">
                  Dispatch {order.soNo} · {order.customerName ?? "Unnamed customer"}
                </h2>
                <p>
                  Their order {order.custPoNo}. This is the moment the goods leave the ledger and
                  the invoice is raised — both in one transaction, neither without the other.
                </p>
              </div>
              <StatusBadge status={order.status} />
            </div>

            <div className="flex flex-col gap-4 p-5">
              {openLines.length === 0 ? (
                <Empty
                  title="Everything on this order has already shipped"
                  body="There is nothing left to dispatch."
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="grid-table min-w-[44rem]">
                      <caption className="sr-only">
                        Lines on {order.soNo} still to ship, and what is going on this vehicle
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col" className="w-14">
                            Line
                          </th>
                          <th scope="col">Part</th>
                          <th scope="col" className="w-32 text-right!">
                            Ordered
                          </th>
                          <th scope="col" className="w-32 text-right!">
                            Already gone
                          </th>
                          <th scope="col" className="w-32 text-right!">
                            Still owed
                          </th>
                          <th scope="col" className="w-36">
                            Going now
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {openLines.map((line) => {
                          const remaining = outstanding(line.qty, line.deliveredQty);
                          const amount = parseQty(lines[line.id] ?? "");
                          const over = amount !== null && amount > remaining;
                          return (
                            <tr key={line.id}>
                              <td className="tabular-nums" data-numeric="">
                                {line.lineNo}
                              </td>
                              <td>
                                <div className="min-w-0">
                                  <div className="font-semibold text-[var(--text-primary)]">
                                    {line.itemCode ?? (
                                      <span className="font-[var(--font-mono)] text-[12px]">
                                        {line.itemId.slice(0, 8)}
                                      </span>
                                    )}
                                  </div>
                                  {line.itemName ? (
                                    <div className="truncate text-[12px] text-[var(--text-secondary)]">
                                      {line.itemName}
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                              <td className="text-right tabular-nums" data-numeric="">
                                {fmtQty(line.qty, line.uom)}
                              </td>
                              <td className="text-right tabular-nums" data-numeric="">
                                {fmtQty(line.deliveredQty, line.uom)}
                              </td>
                              <td
                                className="text-right font-semibold tabular-nums text-[var(--text-primary)]"
                                data-numeric=""
                              >
                                {fmtQty(remaining, line.uom)}
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min={0}
                                  max={remaining}
                                  step="0.001"
                                  inputMode="decimal"
                                  value={lines[line.id] ?? ""}
                                  disabled={busy}
                                  aria-invalid={over}
                                  aria-label={`Quantity dispatched on line ${line.lineNo}`}
                                  onChange={(e) =>
                                    setLines((l) => ({ ...l, [line.id]: e.target.value }))
                                  }
                                  className="h-10 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-right tabular-nums text-[13px] text-[var(--text-primary)]"
                                />
                                {over ? (
                                  <span className="mt-1 block text-[11px] text-[var(--status-rejected-text)]">
                                    More than the customer is owed.
                                  </span>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="x-field">
                      Transporter
                      <input
                        type="text"
                        value={transporter}
                        disabled={busy}
                        placeholder="Who is carrying it"
                        onChange={(e) => setTransporter(e.target.value)}
                      />
                      <small>Recorded on the delivery note. Optional.</small>
                    </label>
                    <label className="x-field">
                      Vehicle number
                      <input
                        type="text"
                        value={vehicleNo}
                        disabled={busy}
                        placeholder="MH 12 AB 1234"
                        onChange={(e) => setVehicleNo(e.target.value)}
                        className="font-[var(--font-mono)]"
                      />
                      <small>
                        Recorded as typed — it is not checked against any register, so type it off
                        the plate.
                      </small>
                    </label>
                    <label className="x-field">
                      E-way bill number
                      <input
                        type="text"
                        value={ewayBillNo}
                        disabled={busy}
                        placeholder="If one has been obtained"
                        onChange={(e) => setEwayBillNo(e.target.value)}
                        className="font-[var(--font-mono)]"
                      />
                      <small>
                        A number somebody else already got from the portal. Nothing here generates
                        one.
                      </small>
                    </label>
                  </div>

                  <HonestyNote title="No e-way bill or e-invoice is generated here.">
                    <p>{CAPABILITY_GAPS.ewayBill}</p>
                  </HonestyNote>

                  {overLines.length > 0 ? (
                    <div className="x-notice" data-tone="error" role="alert">
                      <div>
                        <p className="font-semibold">
                          {overLines.length} line{overLines.length === 1 ? " is" : "s are"} over what
                          the customer is owed.
                        </p>
                        <p>
                          The server refuses an over-dispatch outright, so this is stopped here
                          rather than sent to fail. Correct the figure, or ask Sales to amend the
                          order.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-ghost min-h-[42px]"
                        disabled={busy || openLines.length === 0}
                        onClick={shipAll}
                      >
                        Ship everything still owed
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost min-h-[42px]"
                        disabled={busy || Object.keys(lines).length === 0}
                        onClick={() => setLines({})}
                      >
                        Clear
                      </button>
                    </div>
                    <Can
                      permission="sales.dispatch.execute"
                      fallback={
                        <span className="text-[12px] text-[var(--text-muted)]">
                          Dispatching needs sales.dispatch.execute.
                        </span>
                      }
                    >
                      <button
                        type="button"
                        className="btn btn-pri min-h-[42px] px-5"
                        disabled={busy || body === null || overLines.length > 0 || !canDispatch}
                        onClick={() => void dispatch()}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Truck className="h-4 w-4" aria-hidden />
                        )}
                        {busy
                          ? "Dispatching…"
                          : body === null
                            ? "Nothing on the vehicle"
                            : `Dispatch ${body.lines.length} line${body.lines.length === 1 ? "" : "s"}`}
                      </button>
                    </Can>
                  </div>

                  <p className="max-w-prose text-[12px] leading-[1.6] text-[var(--text-secondary)]">
                    <b className="text-[var(--text-primary)]">
                      This raises an invoice as well as moving the stock.
                    </b>{" "}
                    Both happen in one transaction, so a dispatch never leaves goods gone with
                    nothing billed. Pressing the button twice is safe — the key is derived from the
                    lines above, so a retry after a dropped connection replays rather than shipping
                    and invoicing the order a second time.
                  </p>
                </>
              )}
            </div>
          </section>
        )
      ) : null}
    </div>
  );
}
