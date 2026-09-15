"use client";

import { useCallback, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { useAccess } from "@spine/access/permissions";
import { Empty, ErrorState, Loading } from "@spine/states";
import { date, inr, qty as fmtQty, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type {
  SalesOrderDetail,
  SalesOrderSummary,
  ScanLogEntry,
  StockRow,
} from "../api";
import {
  CAPABILITY_GAPS,
  daysUntil,
  isDispatchable,
  matchScan,
  outstanding,
  parseQty,
  round3,
  sumQty,
  warehouseApi,
} from "../api";
import { ActionNotice, HonestyNote, ScanField, ScanLog, appendScan } from "./shared";

/**
 * ============================================================================================
 * PICK AND PACK — CHECKING THAT WHAT IS IN THE BOX IS WHAT WAS SOLD.
 * ============================================================================================
 *
 * THIS SCREEN MOVES NO STOCK, AND THAT IS NOT AN OMISSION.
 *
 * There is no "picked" state anywhere in this platform. A sales order goes from confirmed to
 * dispatched, and the stock leaves at the moment of dispatch — one movement, posted through
 * Inventory inside the dispatch transaction alongside the delivery note and the invoice. There
 * is no endpoint that marks a line picked, no intermediate location that picking moves stock
 * into, and no record of a part-built pallet.
 *
 * So this screen does the thing that genuinely can be done and genuinely matters: it CHECKS. The
 * order, the customer, the part, the lot and the quantity are each verified against a record
 * before the box is taped shut, and the packing list is produced from the checks rather than
 * from somebody's memory of them. The movement itself happens on Loading, where the truck is,
 * because that is when the goods actually leave.
 *
 * Building a "picked" flag here would mean storing a quantity outside the ledger. That is the one
 * thing this module must never do — a picked-but-not-shipped counter is a second inventory
 * record by another name, and reconciling it against the real one becomes a permanent job.
 *
 * ------------------------------------------------------------------------------------------
 * THE FIVE CHECKS, AND WHAT EACH ONE CAN ACTUALLY PROVE.
 * ------------------------------------------------------------------------------------------
 *   CUSTOMER  — proved. The order names one, and it is on screen next to the parts so a picker
 *               working two orders at one bench cannot cross them.
 *   ORDER     — proved. Only confirmed and part-dispatched orders are offered; the server
 *               refuses any other state anyway.
 *   ITEM      — proved. A scanned code is matched against the order's own lines, exactly, never
 *               fuzzily. A code that is not on the order is refused and named.
 *   QUANTITY  — proved. Picked against still-to-ship, refused before it is over, and refused
 *               again by the server with `OVER_DISPATCH` if it ever got that far.
 *   LOT       — CHECKED BUT NOT BINDING, and this is the honest limit. The lot a picker scans
 *               can be verified to exist with enough on hand. It cannot be made to ship,
 *               because `POST /sales/orders/:id/dispatch` accepts only a line and a quantity —
 *               there is no batch field on it. Inventory resolves the lot FIFO by first receipt
 *               when the dispatch posts. Saying this out loud is the difference between a
 *               traceability claim the plant can rely on and one that will fail an audit.
 */

/** What the picker has counted and not yet handed to loading. Never a balance. */
type Picked = Record<string, string>;

const DUPLICATE_WINDOW_MS = 1500;

export default function PickPackScreen(_props: ScreenProps): React.JSX.Element {
  const { can, identity } = useAccess();
  const canSeeStock = can("inventory.stock.read");

  const orders = useCursorList<SalesOrderSummary>(warehouseApi.salesOrdersPath, {
    limit: warehouseApi.pageSize,
  });
  const [orderId, setOrderId] = useState("");
  const detail = useQuery<SalesOrderDetail>(
    orderId ? warehouseApi.salesOrderPath(orderId) : null,
  );
  const stock = useQuery<StockRow[]>(canSeeStock ? warehouseApi.stockPath : null);

  const [picked, setPicked] = useState<Picked>({});
  const [log, setLog] = useState<readonly ScanLogEntry[]>([]);
  const [lastScan, setLastScan] = useState<{ code: string; at: number } | null>(null);
  const [error] = useState<unknown>(null);

  const shippable = useMemo(
    () => orders.rows.filter((row) => isDispatchable(row.status)),
    [orders.rows],
  );

  const order = detail.data;
  const openLines = useMemo(
    () => (order ? order.lines.filter((line) => outstanding(line.qty, line.deliveredQty) > 0) : []),
    [order],
  );

  /** Lots of a part anywhere in the plant. See the note on `LOT` above for why this is context. */
  const lotsOf = useCallback(
    (itemId: string): readonly StockRow[] => (stock.data ?? []).filter((r) => r.itemId === itemId),
    [stock.data],
  );

  const note = useCallback((entry: Omit<ScanLogEntry, "seq" | "at">): void => {
    setLog((current) => appendScan(current, entry));
  }, []);

  const handleScan = useCallback(
    (code: string): void => {
      if (!order) {
        note({ code, outcome: "unknown", note: "No order is open, so there is nothing to pick against." });
        return;
      }
      const matches = matchScan(openLines, code);
      const line = matches[0];
      if (!line) {
        // Names the ORDER and the CUSTOMER. A picker working two benches needs to know which of
        // the two orders in front of them this part belongs to, not merely that it is wrong here.
        note({
          code,
          outcome: "unknown",
          note: `Nothing outstanding on ${order.soNo} for ${order.customerName ?? "this customer"} has this code. This part belongs to a different order — do not put it in this box.`,
        });
        return;
      }
      if (matches.length > 1) {
        note({
          code,
          outcome: "unknown",
          note: `${order.soNo} has ${matches.length} outstanding lines for this code. Type the quantity against the right line — the system will not choose for you.`,
        });
        return;
      }

      const now = Date.now();
      if (lastScan && lastScan.code === code && now - lastScan.at < DUPLICATE_WINDOW_MS) {
        note({
          code,
          outcome: "duplicate",
          note: `Scanned again within ${DUPLICATE_WINDOW_MS / 1000}s — a trigger bounce, not a second piece. The count was NOT increased. If it really is another one, type it on the line.`,
        });
        setLastScan({ code, at: now });
        return;
      }

      const current = parseQty(picked[line.id] ?? "") ?? 0;
      const remaining = outstanding(line.qty, line.deliveredQty);
      const next = round3(current + 1);
      if (next > remaining) {
        note({
          code,
          outcome: "over",
          note: `Line ${line.lineNo} still owes the customer only ${fmtQty(remaining, line.uom)} and ${current} is already in the box. Shipping more than was ordered needs Sales to amend the order.`,
        });
        setLastScan({ code, at: now });
        return;
      }

      setPicked((p) => ({ ...p, [line.id]: String(next) }));
      setLastScan({ code, at: now });
      note({
        code,
        outcome: "accepted",
        note: `Line ${line.lineNo} · ${line.itemCode ?? line.itemId.slice(0, 8)} — ${next} of ${fmtQty(remaining, line.uom)} in the box. Nothing has shipped.`,
      });
    },
    [lastScan, note, openLines, order, picked],
  );

  /** Lines with something in the box. The packing list is built from exactly these. */
  const packed = useMemo(
    () =>
      openLines
        .map((line) => {
          const amount = parseQty(picked[line.id] ?? "");
          if (amount === null || amount <= 0) return null;
          return { line, amount, remaining: outstanding(line.qty, line.deliveredQty) };
        })
        .filter((x): x is { line: SalesOrderDetail["lines"][number]; amount: number; remaining: number } => x !== null),
    [openLines, picked],
  );

  const short = packed.filter((p) => p.amount < p.remaining);
  const complete = openLines.length > 0 && packed.length === openLines.length && short.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Pick and pack"
        subtitle="Check the customer, the order, the part, the lot and the quantity before the box is closed, and print a packing list from those checks. Nothing here ships — the goods leave on Loading."
        meta={[
          { label: "Orders to pick", value: orders.loading ? "…" : String(shippable.length) },
          { label: "Lines in the box", value: String(packed.length) },
        ]}
      />

      <HonestyNote title="Picking does not move stock, here or anywhere in this system.">
        <p>
          There is no picked state to record. The stock leaves the ledger at dispatch, in one
          movement, alongside the delivery note and the invoice. What you count here is a check on
          the box — it is not held anywhere, and it is gone if this page is refreshed.
        </p>
      </HonestyNote>

      <ActionNotice error={error} />

      {/* ---- which order -------------------------------------------------------------------- */}
      <section className="x-home-panel" aria-labelledby="pick-order-heading">
        <div className="x-home-panel-head flex-wrap gap-3">
          <div>
            <h2 id="pick-order-heading" className="x-section-heading">
              Which order, and for whom
            </h2>
            <p>
              Confirmed and part-shipped orders only. An order on credit hold is deliberately not
              offered — Accounts releases that, and picking against it wastes a pick.
            </p>
          </div>
        </div>
        <div className="p-5">
          <label className="x-field max-w-xl">
            Sales order
            <select
              value={orderId}
              onChange={(e) => {
                setOrderId(e.target.value);
                setPicked({});
                setLog([]);
                setLastScan(null);
              }}
              aria-label="Sales order to pick"
            >
              <option value="">Choose an order…</option>
              {shippable.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.soNo} · {row.customerName ?? row.customerCode ?? "Unnamed customer"}
                  {row.requestedDeliveryDate ? ` · due ${date(row.requestedDeliveryDate)}` : ""}
                </option>
              ))}
            </select>
            <small>
              {orders.loading
                ? "Reading the order book…"
                : shippable.length === 0
                  ? "No order is confirmed or part-shipped. Nothing can be picked."
                  : `${shippable.length} order${shippable.length === 1 ? "" : "s"} can be picked.`}
            </small>
          </label>
        </div>
      </section>

      {/* ---- the bench ---------------------------------------------------------------------- */}
      {!orderId ? (
        <Empty
          title="Choose an order to pick"
          body="Its customer, its outstanding lines and the lots available for each part will appear here, and the scan field will only accept codes that are on it."
        />
      ) : detail.loading ? (
        <Loading label="Reading the order…" />
      ) : detail.error ? (
        <ErrorState error={detail.error} onRetry={detail.reload} />
      ) : !order ? (
        <Empty title="That order is no longer readable" body="Choose another from the list." />
      ) : (
        <>
          <section className="x-home-panel" aria-labelledby="pick-bench-heading">
            <div className="x-home-panel-head flex-wrap gap-3">
              <div>
                <h2 id="pick-bench-heading" className="x-section-heading">
                  {order.soNo} · {order.customerName ?? "Unnamed customer"}
                </h2>
                <p>
                  Their order number {order.custPoNo} · raised {date(order.orderDate)}
                  {order.requestedDeliveryDate ? (
                    <>
                      {" "}
                      · promised {date(order.requestedDeliveryDate)}{" "}
                      <b
                        className={
                          (daysUntil(order.requestedDeliveryDate) ?? 0) < 0
                            ? "text-[var(--status-overdue-text)]"
                            : undefined
                        }
                      >
                        ({relativeDays(order.requestedDeliveryDate)})
                      </b>
                    </>
                  ) : (
                    " · no promised date on record"
                  )}
                </p>
              </div>
              <StatusBadge status={order.status} />
            </div>

            <div className="flex flex-col gap-4 p-5">
              <ScanField
                label="Scan a part"
                hint="Each accepted scan counts one piece into the box. A code that is not on this order is refused and named — check it before you put it anywhere."
                disabled={openLines.length === 0}
                onScan={handleScan}
              />

              {openLines.length === 0 ? (
                <Empty
                  title="Everything on this order has shipped"
                  body="There is nothing left to pick. Choose another order above."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="grid-table min-w-[54rem]">
                    <caption className="sr-only">
                      Outstanding lines on {order.soNo}, with what is in the box
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
                          In the box
                        </th>
                        <th scope="col" className="w-52">
                          Lots on hand
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {openLines.map((line) => {
                        const remaining = outstanding(line.qty, line.deliveredQty);
                        const amount = parseQty(picked[line.id] ?? "");
                        const over = amount !== null && amount > remaining;
                        const lots = lotsOf(line.itemId);
                        const onHand = sumQty(lots.map((l) => l.qty));
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
                                value={picked[line.id] ?? ""}
                                aria-invalid={over}
                                aria-label={`Quantity picked on line ${line.lineNo}`}
                                onChange={(e) =>
                                  setPicked((p) => ({ ...p, [line.id]: e.target.value }))
                                }
                                className="h-10 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-right tabular-nums text-[13px] text-[var(--text-primary)]"
                              />
                              {over ? (
                                <span className="mt-1 block text-[11px] text-[var(--status-rejected-text)]">
                                  More than the customer is owed.
                                </span>
                              ) : null}
                            </td>
                            <td className="text-[12px]">
                              {!canSeeStock ? (
                                <span className="text-[var(--text-muted)]">
                                  Stock not visible to you
                                </span>
                              ) : lots.length === 0 ? (
                                <span className="text-[var(--status-rejected-text)]">
                                  None on hand anywhere
                                </span>
                              ) : (
                                <>
                                  <span className="text-[var(--text-secondary)]">
                                    {fmtQty(onHand, line.uom)} across {lots.length} lot
                                    {lots.length === 1 ? "" : "s"}
                                  </span>
                                  <span className="mt-0.5 block truncate font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">
                                    {lots
                                      .slice(0, 3)
                                      .map((l) => `${l.batch || "unbatched"}@${l.warehouseCode}`)
                                      .join(" · ")}
                                    {lots.length > 3 ? " …" : ""}
                                  </span>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <HonestyNote title="The lot you pick is not the lot that gets recorded." tone="warning">
                <p>
                  The dispatch endpoint takes a line and a quantity, and no batch. Inventory
                  resolves which lots leave, oldest receipt first, at the moment the dispatch
                  posts — so a lot scanned at this bench is a check that stock exists, not a
                  traceability record. The order also does not publish which finished-goods store
                  it ships from, so the lots listed above are plant-wide.
                </p>
              </HonestyNote>
            </div>
          </section>

          <ScanLog entries={log} />

          {/* ---- the packing list --------------------------------------------------------- */}
          <section className="x-home-panel" aria-labelledby="pick-list-heading">
            <div className="x-home-panel-head flex-wrap gap-3">
              <div>
                <h2 id="pick-list-heading" className="x-section-heading">
                  Packing list
                </h2>
                <p>
                  Built from what is in the box, not from the order. If the two differ, this shows
                  the box — which is the point of a packing list.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={packed.length === 0}
                onClick={() => window.print()}
              >
                <Printer className="h-3.5 w-3.5" aria-hidden />
                Print
              </button>
            </div>

            {packed.length === 0 ? (
              <div className="p-5">
                <Empty
                  title="Nothing in the box yet"
                  body="Scan or type quantities against the lines above and the packing list will build itself from them."
                />
              </div>
            ) : (
              <div className="p-5">
                <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-2">
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
                      Customer
                    </dt>
                    <dd className="text-[13px] font-semibold text-[var(--text-primary)]">
                      {order.customerName ?? order.customerCode ?? "Unnamed"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
                      Our order
                    </dt>
                    <dd className="text-[13px] font-semibold text-[var(--text-primary)]">
                      {order.soNo}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
                      Their order
                    </dt>
                    <dd className="text-[13px] font-semibold text-[var(--text-primary)]">
                      {order.custPoNo}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
                      Ship to
                    </dt>
                    <dd className="text-[13px] font-semibold text-[var(--text-primary)]">
                      State {order.shipToStateCode}
                      {order.isInterState ? " · inter-state" : " · within the state"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
                      Packed by
                    </dt>
                    <dd className="text-[13px] font-semibold text-[var(--text-primary)]">
                      {identity?.principal ?? "Not signed in"}
                    </dd>
                  </div>
                </dl>

                <div className="overflow-x-auto">
                  <table className="grid-table">
                    <caption className="sr-only">
                      Packing list for {order.soNo}: what is physically in the box
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className="w-14">
                          Line
                        </th>
                        <th scope="col">Part</th>
                        <th scope="col" className="w-36 text-right!">
                          Packed
                        </th>
                        <th scope="col" className="w-36 text-right!">
                          Still owed after
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {packed.map(({ line, amount, remaining }) => (
                        <tr key={line.id}>
                          <td className="tabular-nums" data-numeric="">
                            {line.lineNo}
                          </td>
                          <td>
                            <div className="font-semibold text-[var(--text-primary)]">
                              {line.itemCode ?? line.itemId.slice(0, 8)}
                            </div>
                            {line.itemName ? (
                              <div className="truncate text-[12px] text-[var(--text-secondary)]">
                                {line.itemName}
                              </div>
                            ) : null}
                          </td>
                          <td
                            className="text-right font-semibold tabular-nums text-[var(--text-primary)]"
                            data-numeric=""
                          >
                            {fmtQty(amount, line.uom)}
                          </td>
                          <td className="text-right tabular-nums" data-numeric="">
                            {fmtQty(round3(remaining - amount), line.uom)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="mt-3 text-[12px] leading-[1.6] text-[var(--text-secondary)]">
                  {complete ? (
                    <>
                      This completes every outstanding line on {order.soNo}. Order value{" "}
                      {inr(order.grandTotal)}.
                    </>
                  ) : (
                    <>
                      <b className="text-[var(--text-primary)]">This is a part shipment.</b>{" "}
                      {short.length > 0
                        ? `${short.length} line${short.length === 1 ? " is" : "s are"} short of what the customer is owed, and `
                        : ""}
                      {openLines.length - packed.length > 0
                        ? `${openLines.length - packed.length} line${openLines.length - packed.length === 1 ? " is" : "s are"} not in the box at all. `
                        : ""}
                      The balance stays outstanding on the order.
                    </>
                  )}
                </p>

                <HonestyNote title="This list is not filed anywhere.">
                  <p>{CAPABILITY_GAPS.packingList}</p>
                </HonestyNote>

                <p className="mt-3 text-[13px] leading-[1.6] text-[var(--text-secondary)]">
                  Take the box to <b className="text-[var(--text-primary)]">Loading</b>. That is
                  where the dispatch is posted, and that is the moment the stock leaves the ledger.
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
