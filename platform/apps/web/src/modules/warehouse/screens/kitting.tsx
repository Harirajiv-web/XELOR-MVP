"use client";

import { useCallback, useMemo, useState } from "react";
import { Loader2, PackageMinus, Wrench } from "lucide-react";
import { api } from "@spine/api/client";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { Can, useAccess } from "@spine/access/permissions";
import { Empty, ErrorState, Loading } from "@spine/states";
import { qty as fmtQty, humanise } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type {
  ProductionOrderDetail,
  ProductionOrderRow,
  StockEntryBody,
  StockEntryLine,
  StockEntryResult,
  StockRow,
  WarehouseRow,
} from "../api";
import {
  CAPABILITY_GAPS,
  outstanding,
  parseQty,
  sumQty,
  warehouseApi,
} from "../api";
import {
  ActionNotice,
  HonestyNote,
  LedgerReceipt,
  useHandlingKey,
  useInFlight,
} from "./shared";

/**
 * ============================================================================================
 * KITTING — GETTING THE RIGHT MATERIAL, IN THE RIGHT LOT, TO THE RIGHT JOB, ONCE.
 * ============================================================================================
 *
 * A kit is the difference between a work order that runs and a work order that stops on its
 * third operation because one bracket was never drawn. The job of this screen is therefore
 * mostly a job of LOOKING: what does this order still need, is it actually in the store it draws
 * from, and which lots are there. Only then does anything move.
 *
 * ------------------------------------------------------------------------------------------
 * THE TWO THINGS THIS SCREEN IS CAREFUL NOT TO PRETEND.
 * ------------------------------------------------------------------------------------------
 *
 * 1. NOTHING HERE RESERVES ANYTHING. There is no reservation record in this platform — no soft
 *    allocation, no hard allocation, nothing that takes a lot out of everyone else's reach. A
 *    shortage shown on this screen is a shortage at the instant it was read, and a dispatch on
 *    the other side of the building can consume the same lot while the storekeeper is walking to
 *    the rack. The ONLY thing that removes stock from everybody else is a posted issue, which is
 *    why the honest advice on this screen is to issue when you physically pick, not before.
 *
 *    A "Reserve" button would be the single most damaging thing that could be added here. It
 *    would be believed, it would be backed by nothing, and the first time two orders were
 *    planned against the same lot the line would stop with a screen insisting the material was
 *    set aside.
 *
 * 2. ISSUING HERE MOVES MATERIAL BUT DOES NOT TICK THE WORK ORDER. Production owns the work
 *    order's `issuedQty` column and updates it through its own endpoint, which needs
 *    `production.order.execute` — a permission this module does not hold and does not ask for.
 *    So an issue posted here is a real, audited, irreversible movement out of the source store
 *    into the ledger, and the work order will still show the component as outstanding.
 *
 *    That is stated on screen, in those words, every time. It is a genuine seam in the product
 *    and the worst possible way to handle it would be to let the operator discover it afterwards.
 *    Where somebody holds Production's permission, Production's own Issue components is the
 *    better route and this screen says so.
 *
 * ------------------------------------------------------------------------------------------
 * REVISION.
 * ------------------------------------------------------------------------------------------
 * A work order pins the BOM version it was exploded from at the moment it was raised, so
 * publishing a new drawing never changes a job already on the floor. The component list below IS
 * that pinned explosion — it is not re-read from the current BOM, and it cannot be. The pinned
 * identifier is shown so a supervisor holding a printed traveller can check the two match.
 *
 * ------------------------------------------------------------------------------------------
 * THE MOVEMENT.
 * ------------------------------------------------------------------------------------------
 * `POST /stock/entries`, `entryType: "issue"`, out of the order's own source warehouse, with a
 * pinned idempotency key so a retry after a dropped connection replays rather than issuing the
 * kit twice. A lot left blank is resolved FIFO by FIRST RECEIPT inside Inventory — by when the
 * stock arrived, not by when it expires; this module holds no expiry data and claims no FEFO.
 */

/** What the storekeeper has typed and not yet issued. Never a balance. */
interface KitLine {
  qty: string;
  batch: string;
}

export default function KittingScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const canPost = can("inventory.stock.post");
  const canSeeStock = can("inventory.stock.read");

  const orders = useCursorList<ProductionOrderRow>(warehouseApi.productionOrdersPath, {
    limit: warehouseApi.pageSize,
  });
  const [orderId, setOrderId] = useState("");
  const detail = useQuery<ProductionOrderDetail>(
    orderId ? warehouseApi.productionOrderPath(orderId) : null,
  );
  const warehouses = useQuery<WarehouseRow[]>(
    can("inventory.warehouse.read") ? warehouseApi.warehousesPath : null,
  );
  const stock = useQuery<StockRow[]>(canSeeStock ? warehouseApi.stockPath : null);

  const [kit, setKit] = useState<Record<string, KitLine>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [posted, setPosted] = useState<StockEntryResult | null>(null);

  const handling = useHandlingKey();
  const inFlight = useInFlight();

  /**
   * Orders worth kitting. `planned` has had nothing drawn; `in_progress` has had some drawn and
   * may still be short. A completed order needs no material and offering it would be offering an
   * action with no purpose.
   */
  const kittable = useMemo(
    () => orders.rows.filter((row) => row.status === "planned" || row.status === "in_progress"),
    [orders.rows],
  );

  const order = detail.data;
  const source = warehouses.data?.find((w) => w.id === order?.sourceWarehouseId) ?? null;

  /** Lots of one part in the order's source store, as the ledger currently has them. */
  const lotsOf = useCallback(
    (itemId: string): readonly StockRow[] =>
      (stock.data ?? []).filter(
        (row) => row.itemId === itemId && row.warehouseId === order?.sourceWarehouseId,
      ),
    [order?.sourceWarehouseId, stock.data],
  );

  const availableOf = useCallback(
    (itemId: string): number => sumQty(lotsOf(itemId).map((r) => r.qty)),
    [lotsOf],
  );

  /**
   * WHAT IS MISSING — arithmetic, nothing else.
   *
   * Short means: what the order still needs exceeds what the source store holds, right now. It is
   * a subtraction against a balance read from the ledger. No model is asked, and a model could
   * not usefully be asked, whether a job can be kitted.
   */
  const components = useMemo(() => {
    if (!order) return [];
    return order.components.map((component) => {
      const still = outstanding(component.requiredQty, component.issuedQty);
      const available = availableOf(component.componentItemId);
      return {
        component,
        still,
        available,
        short: Math.max(0, Math.round((still - available) * 1000) / 1000),
      };
    });
  }, [availableOf, order]);

  const shortages = components.filter((c) => c.short > 0 && c.still > 0);
  const readyLines = components.filter((c) => c.still > 0 && c.short === 0);

  /** Prefill the kit with everything that can actually be drawn. One decision, not twenty. */
  function fillWhatIsAvailable(): void {
    const next: Record<string, KitLine> = {};
    for (const entry of components) {
      if (entry.still <= 0) continue;
      const take = Math.min(entry.still, entry.available);
      if (take <= 0) continue;
      next[entry.component.componentItemId] = {
        qty: String(Math.round(take * 1000) / 1000),
        batch: kit[entry.component.componentItemId]?.batch ?? "",
      };
    }
    setKit(next);
  }

  const body: StockEntryBody | null = useMemo(() => {
    if (!order) return null;
    const lines: StockEntryLine[] = [];
    for (const entry of components) {
      const typed = kit[entry.component.componentItemId];
      if (!typed) continue;
      const amount = parseQty(typed.qty);
      if (amount === null || amount <= 0) continue;
      const batch = typed.batch.trim();
      lines.push({
        itemId: entry.component.componentItemId,
        fromWarehouseId: order.sourceWarehouseId,
        ...(batch ? { batch } : {}),
        qty: amount,
      });
    }
    if (lines.length === 0) return null;
    return {
      entryType: "issue",
      reasonCode: "kitting_to_work_order",
      remarks: `Kitted to ${order.orderNo}`.slice(0, 500),
      lines,
    };
  }, [components, kit, order]);

  async function issue(): Promise<void> {
    if (!body || inFlight.held()) return;
    inFlight.hold();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<StockEntryResult>(warehouseApi.stockEntriesPath, body, {
        // Derived from the kit. Post it twice and the server replays the first answer; the
        // material cannot leave the store twice on one dropped connection.
        idempotencyKey: handling.keyFor("kit", body),
      });
      setPosted(result);
      setKit({});
      stock.reload();
      detail.reload();
    } catch (e) {
      setError(e);
    } finally {
      inFlight.release();
      setBusy(false);
    }
  }

  const labelFor = useCallback(
    (itemId: string, whId: string): { item: string; warehouse: string; uom: string | null } => {
      const component = order?.components.find((c) => c.componentItemId === itemId);
      const wh = warehouses.data?.find((w) => w.id === whId);
      return {
        item: component?.itemCode ?? itemId.slice(0, 8),
        warehouse: wh ? `${wh.code} — ${wh.name}` : whId.slice(0, 8),
        uom: component?.uom ?? null,
      };
    },
    [order, warehouses.data],
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Kitting"
        subtitle="What a work order still needs, whether it is in the store it draws from, and issuing it — once, through the one stock ledger."
        meta={[
          { label: "Orders to kit", value: orders.loading ? "…" : String(kittable.length) },
          { label: "Short components", value: order ? String(shortages.length) : "—" },
        ]}
      />

      <HonestyNote title="Nothing on this screen is reserved." tone="warning">
        <p>{CAPABILITY_GAPS.reservation}</p>
      </HonestyNote>

      <ActionNotice error={error} />

      {posted ? (
        <LedgerReceipt
          title={`Issued to ${order?.orderNo ?? "the work order"}`}
          entryId={posted.entryId}
          lineCount={posted.lineCount}
          movements={posted.movements}
          labelFor={labelFor}
        >
          <p>
            The material has left {source ? `${source.code} — ${source.name}` : "the source store"}{" "}
            and the ledger records it. A line issued without a named lot was split across lots by
            first receipt, which is why there may be more movements below than you typed.
          </p>
          <p className="mt-1">
            <b>The work order still shows these components as outstanding.</b>{" "}
            {CAPABILITY_GAPS.productionIssue}
          </p>
        </LedgerReceipt>
      ) : null}

      {/* ---- which order -------------------------------------------------------------------- */}
      <section className="x-home-panel" aria-labelledby="kit-order-heading">
        <div className="x-home-panel-head flex-wrap gap-3">
          <div>
            <h2 id="kit-order-heading" className="x-section-heading">
              Which job
            </h2>
            <p>
              Planned and in-progress orders only. A finished order needs no material, and one that
              has not been raised has no component list to draw from.
            </p>
          </div>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <label className="x-field">
            Work order
            <select
              value={orderId}
              onChange={(e) => {
                setOrderId(e.target.value);
                setKit({});
                setPosted(null);
                setError(null);
              }}
              aria-label="Work order to kit"
            >
              <option value="">Choose a work order…</option>
              {kittable.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.orderNo} · {row.itemCode ?? row.itemId.slice(0, 8)} ·{" "}
                  {fmtQty(row.qtyToProduce, row.uom)}
                </option>
              ))}
            </select>
            <small>
              {orders.loading
                ? "Reading the floor…"
                : kittable.length === 0
                  ? "No work order is planned or in progress. Production raises these."
                  : `${kittable.length} order${kittable.length === 1 ? "" : "s"} can be kitted.`}
            </small>
          </label>
          {order ? (
            <div className="x-field">
              Drawn from
              <div className="flex min-h-[42px] items-center rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-sunken)] px-3 text-[13px] text-[var(--text-primary)]">
                {source ? `${source.code} — ${source.name}` : order.sourceWarehouseId.slice(0, 8)}
              </div>
              <small>
                Fixed by the work order when it was raised. Material for this job comes out of here
                and nowhere else — this screen cannot point it somewhere different, and should not
                be able to.
              </small>
            </div>
          ) : null}
        </div>
      </section>

      {/* ---- the kit ------------------------------------------------------------------------ */}
      {!orderId ? (
        <Empty
          title="Choose a work order"
          body="Its component list, what is still to draw, and what is actually in the source store will appear here."
        />
      ) : detail.loading ? (
        <Loading label="Reading the work order…" />
      ) : detail.error ? (
        <ErrorState error={detail.error} onRetry={detail.reload} />
      ) : !order ? (
        <Empty title="That work order is no longer readable" body="Choose another from the list." />
      ) : (
        <>
          <section className="x-home-panel" aria-labelledby="kit-list-heading">
            <div className="x-home-panel-head flex-wrap gap-3">
              <div>
                <h2 id="kit-list-heading" className="x-section-heading">
                  {order.orderNo} · {order.itemCode ?? order.itemId.slice(0, 8)}
                </h2>
                <p>
                  Making {fmtQty(order.qtyToProduce, order.uom)}, {fmtQty(order.producedQty, order.uom)}{" "}
                  received so far. Components below are the explosion pinned to this order when it
                  was raised.
                </p>
              </div>
              <StatusBadge status={order.status} />
            </div>

            <div className="flex flex-col gap-4 p-5">
              <div className="x-notice" role="note">
                <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold">This order is pinned to one revision.</p>
                  <p>
                    Bill of materials{" "}
                    <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11px]">
                      {order.bomId}
                    </code>
                    . The list below is that explosion as it stood when the order was raised —
                    publishing a newer drawing does not change a job already on the floor, and this
                    screen does not re-read the current version. Check it against the traveller in
                    your hand before drawing anything.
                  </p>
                </div>
              </div>

              {shortages.length > 0 ? (
                <div className="x-notice" data-tone="warning" role="alert">
                  <div>
                    <p className="font-semibold">
                      {shortages.length} component{shortages.length === 1 ? " is" : "s are"} short in{" "}
                      {source?.code ?? "the source store"}.
                    </p>
                    <p>
                      Shortages are counted against that store only. The part may well be elsewhere
                      in the plant — move it in on the Locations screen first, because an issue
                      draws from this store and nowhere else.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <table className="grid-table min-w-[56rem]">
                  <caption className="sr-only">
                    Components on {order.orderNo}: required, already issued, available and being
                    drawn now
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="w-14">
                        Line
                      </th>
                      <th scope="col">Component</th>
                      <th scope="col" className="w-32 text-right!">
                        Required
                      </th>
                      <th scope="col" className="w-32 text-right!">
                        Already out
                      </th>
                      <th scope="col" className="w-32 text-right!">
                        Still to draw
                      </th>
                      <th scope="col" className="w-32 text-right!">
                        In the store
                      </th>
                      <th scope="col" className="w-36">
                        Drawing now
                      </th>
                      <th scope="col" className="w-44">
                        Lot
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {components.map(({ component, still, available, short }) => {
                      const id = component.componentItemId;
                      const lots = lotsOf(id);
                      const typed = kit[id];
                      const amount = parseQty(typed?.qty ?? "");
                      const overDraw = amount !== null && amount > available;
                      return (
                        <tr key={id}>
                          <td className="tabular-nums" data-numeric="">
                            {component.lineNo}
                          </td>
                          <td>
                            <div className="min-w-0">
                              <div className="font-semibold text-[var(--text-primary)]">
                                {component.itemCode ?? (
                                  <span className="font-[var(--font-mono)] text-[12px]">
                                    {id.slice(0, 8)}
                                  </span>
                                )}
                              </div>
                              {component.itemName ? (
                                <div className="truncate text-[12px] text-[var(--text-secondary)]">
                                  {component.itemName}
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="text-right tabular-nums" data-numeric="">
                            {fmtQty(component.requiredQty, component.uom)}
                          </td>
                          <td className="text-right tabular-nums" data-numeric="">
                            {fmtQty(component.issuedQty, component.uom)}
                          </td>
                          <td
                            className="text-right font-semibold tabular-nums text-[var(--text-primary)]"
                            data-numeric=""
                          >
                            {fmtQty(still, component.uom)}
                          </td>
                          <td className="text-right tabular-nums" data-numeric="">
                            {!canSeeStock ? (
                              <span className="text-[var(--text-muted)]">Not visible</span>
                            ) : short > 0 && still > 0 ? (
                              <span className="font-semibold text-[var(--status-rejected-text)]">
                                {fmtQty(available, component.uom)}
                              </span>
                            ) : (
                              fmtQty(available, component.uom)
                            )}
                          </td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step="0.001"
                              inputMode="decimal"
                              value={typed?.qty ?? ""}
                              disabled={busy || still <= 0}
                              aria-invalid={overDraw}
                              aria-label={`Quantity to draw for ${component.itemCode ?? id}`}
                              onChange={(e) =>
                                setKit((k) => ({
                                  ...k,
                                  [id]: { qty: e.target.value, batch: k[id]?.batch ?? "" },
                                }))
                              }
                              className="h-10 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-right tabular-nums text-[13px] text-[var(--text-primary)]"
                            />
                            {overDraw ? (
                              <span className="mt-1 block text-[11px] text-[var(--status-rejected-text)]">
                                More than the store holds.
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <select
                              value={typed?.batch ?? ""}
                              disabled={busy || still <= 0}
                              aria-label={`Lot to draw for ${component.itemCode ?? id}`}
                              onChange={(e) =>
                                setKit((k) => ({
                                  ...k,
                                  [id]: { qty: k[id]?.qty ?? "", batch: e.target.value },
                                }))
                              }
                              className="h-10 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-[12px] text-[var(--text-primary)]"
                            >
                              <option value="">Any lot — oldest receipt first</option>
                              {lots.map((lot) => (
                                <option key={`${lot.batch}`} value={lot.batch}>
                                  {lot.batch || "Unbatched"} · {fmtQty(lot.qty, lot.uom)}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <HonestyNote title="“Any lot” means oldest receipt, not oldest expiry.">
                <p>{CAPABILITY_GAPS.fefo}</p>
              </HonestyNote>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost min-h-[42px]"
                    disabled={busy || readyLines.length === 0}
                    onClick={fillWhatIsAvailable}
                  >
                    Fill in what the store can give
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost min-h-[42px]"
                    disabled={busy || Object.keys(kit).length === 0}
                    onClick={() => setKit({})}
                  >
                    Clear
                  </button>
                </div>
                <Can
                  permission="inventory.stock.post"
                  fallback={
                    <span className="text-[12px] text-[var(--text-muted)]">
                      Issuing material needs inventory.stock.post.
                    </span>
                  }
                >
                  <button
                    type="button"
                    className="btn btn-pri min-h-[42px] px-5"
                    disabled={busy || body === null || !canPost}
                    onClick={() => void issue()}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <PackageMinus className="h-4 w-4" aria-hidden />
                    )}
                    {busy
                      ? "Issuing…"
                      : body === null
                        ? "Nothing to draw"
                        : `Issue ${body.lines.length} component${body.lines.length === 1 ? "" : "s"}`}
                  </button>
                </Can>
              </div>

              <p className="max-w-prose text-[12px] leading-[1.6] text-[var(--text-secondary)]">
                <b className="text-[var(--text-primary)]">All of it, or none of it.</b> If one line
                is short when the posting reaches the ledger, the whole issue is refused and nothing
                leaves the store. Pressing the button twice is safe — the key is derived from the
                figures above, so a retry after a dropped connection replays rather than issues
                again.
              </p>
            </div>
          </section>

          <HonestyNote title="This issue does not tick the work order." tone="warning">
            <p>{CAPABILITY_GAPS.productionIssue}</p>
            <p className="mt-1">
              The order is currently <b>{humanise(order.status)}</b>, and issuing from here will not
              change that either. What it does change is the stock ledger, permanently and
              audibly — which is the record that decides what the plant actually has.
            </p>
          </HonestyNote>
        </>
      )}
    </div>
  );
}
