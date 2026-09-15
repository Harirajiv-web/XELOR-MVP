"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, Radar, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { api } from "@spine/api/client";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState } from "@spine/states";
import { date, humanise, inr, num, qty as fmtQty } from "@spine/format";
import { useAccess } from "@spine/access/permissions";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge, toneFor } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import {
  engChangeApi,
  isOpenStatus,
  valueAtStandardCost,
  type BomView,
  type ItemRow,
  type PlannedOrderRow,
  type ProductionOrderRow,
  type SalesOrderDetail,
  type SalesOrderRow,
  type StockRow,
  type WhereUsedResponse,
} from "../api";

/**
 * CHANGE IMPACT — the flagship screen, and the only one here that answers a question the
 * product could not previously answer at all.
 *
 * ============================================================================
 * WHAT IT IS FOR
 * ============================================================================
 *
 * Somebody is about to change a part. Before they do, five things need to be known, and
 * today they are known by four phone calls and a walk to the stores:
 *
 *   1. WHERE ELSE IS IT USED — not one level up, every level. A gasket that looks like it
 *      belongs to one pump is usually in three assemblies and the spares kit.
 *   2. WHAT IS MID-BUILD — open production orders are pinned to the OLD revision and will
 *      finish to it, whatever engineering decides this afternoon.
 *   3. WHAT IS PROMISED — the customer orders those builds are covering, and the dates.
 *   4. WHAT IS ON THE SHELF — stock already built or bought to the old revision, which has
 *      to be used, reworked or written off. That decision is the expensive one.
 *   5. WHAT IS STILL TO BE BOUGHT — material not yet committed, which is the cheapest
 *      place to absorb a change and the first thing people forget to look at.
 *
 * Every one of those is computable from endpoints that already exist. None of it is
 * guessed, none of it is cached, and none of it is saved.
 *
 * ============================================================================
 * WHAT IT DOES NOT DO, AND WHY THE BUTTON IS MISSING RATHER THAN BROKEN
 * ============================================================================
 *
 * There is no "Raise change request" button because there is no `change_request` table to
 * raise one in — see the header comment in `../api.ts` for the full list of what the schema
 * does not hold. A button that opened a form, took a description and an effectivity date,
 * and then wrote nothing would be worse than no button: the user would believe a change was
 * on record. The screen therefore states the gap in the place the button would be, which is
 * the only honest version of this screen that can ship today.
 *
 * The assessment is recomputed on every view. That has one genuine advantage worth naming
 * — it is never stale, which a saved assessment always eventually is — and one genuine
 * cost: it cannot be attached to a decision, because there is no decision record. Both are
 * stated on screen.
 *
 * ============================================================================
 * ONE ABSENCE THAT IS A PERMISSION, NOT A GAP
 * ============================================================================
 *
 * Open PURCHASE orders are part of a real impact assessment and are NOT shown here. This
 * module holds no purchase permission — it mints none and borrows none — so it cannot read
 * them. Planned BUY orders from the last MRP run are shown instead, under
 * `planning.mrp.read`, and the difference is printed rather than glossed: a planned buy is
 * material not yet ordered, a purchase order is material already committed to a supplier,
 * and a change costs very different amounts in those two states.
 */

/* -------------------------------------------------------------------------- */
/* Open sales orders, with their lines                                        */
/* -------------------------------------------------------------------------- */

interface SalesProbe {
  orders: readonly SalesOrderDetail[];
  /** Open orders found on the first page but NOT read, because of the cap. */
  notRead: number;
  /** Open orders that exist beyond the first page and were never even listed. */
  beyondFirstPage: boolean;
  loading: boolean;
  error: unknown;
}

/**
 * Read the OPEN sales orders and their lines.
 *
 * `GET /sales/orders` returns totals and a line COUNT but never the lines, so the only way
 * to learn which customer orders contain a part is one detail read per order. That is a
 * real cost, so it is bounded — `salesOrderProbeCap` orders — and the bound is REPORTED.
 *
 * Reporting it is the whole point. An impact assessment that silently stops at twenty-five
 * orders and presents itself as complete is how a change gets approved that should not have
 * been; the number it did not read is more important than the numbers it did.
 *
 * Settled orders are skipped before any detail read: a delivered order cannot be affected
 * by a revision that has not happened yet, and reading it would spend the budget on rows
 * that cannot matter.
 */
function useOpenSalesOrders(enabled: boolean): SalesProbe {
  const [state, setState] = useState<Omit<SalesProbe, "loading" | "error">>({
    orders: [],
    notRead: 0,
    beyondFirstPage: false,
  });
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const page = await api.get<{ items?: SalesOrderRow[]; nextCursor?: string | null }>(
          engChangeApi.salesOrdersPath,
          { query: { limit: 100 }, signal: controller.signal },
        );
        const rows = Array.isArray(page.items) ? page.items : [];
        const open = rows.filter((row) => isOpenStatus(row.status));
        const toRead = open.slice(0, engChangeApi.salesOrderProbeCap);
        const details: SalesOrderDetail[] = [];
        for (const row of toRead) {
          if (controller.signal.aborted) return;
          details.push(
            await api.get<SalesOrderDetail>(engChangeApi.salesOrderPath(row.id), {
              signal: controller.signal,
            }),
          );
        }
        if (controller.signal.aborted) return;
        setState({
          orders: details,
          notRead: open.length - toRead.length,
          beyondFirstPage: typeof page.nextCursor === "string" && page.nextCursor.length > 0,
        });
      } catch (failure) {
        if (controller.signal.aborted || (failure as Error)?.name === "AbortError") return;
        setError(failure);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [enabled]);

  return { ...state, loading, error };
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

export default function ImpactScreen(_props: ScreenProps): React.JSX.Element {
  const {
    rows: allItems,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    reload,
  } = useCursorList<ItemRow>(engChangeApi.itemsPath, { limit: engChangeApi.pageSize });
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return allItems;
    return allItems.filter(
      (item) =>
        item.itemCode.toLowerCase().includes(needle) ||
        item.name.toLowerCase().includes(needle),
    );
  }, [allItems, filter]);

  const selected = allItems.find((item) => item.id === selectedId) ?? rows[0];

  const columns: ReadonlyArray<Column<ItemRow>> = [
    {
      key: "itemCode",
      header: "Part",
      width: "w-48",
      render: (item) => (
        <button
          type="button"
          className="text-left font-semibold text-[var(--brand)] underline-offset-4 hover:underline"
          onClick={() => setSelectedId(item.id)}
          aria-label={`Assess a revision change to ${item.itemCode}`}
        >
          {item.itemCode}
        </button>
      ),
    },
    { key: "name", header: "Description", render: (item) => item.name },
    {
      key: "itemType",
      header: "Type",
      width: "w-40",
      render: (item) => <span className="text-[var(--text-secondary)]">{humanise(item.itemType)}</span>,
    },
    {
      key: "bomCount",
      header: "Live BOMs",
      width: "w-32",
      numeric: true,
      // Two live bills is the state in which "the current revision" has two right answers.
      // Flagged in the list rather than only on the detail, because this is the column a
      // change controller scans the list for.
      render: (item) =>
        item.bomCount > 1 ? (
          <StatusBadge tone="pending" label={`${item.bomCount} live`} />
        ) : (
          <span className="text-[var(--text-secondary)]">{item.bomCount}</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Change impact"
        subtitle="Everything a revision change to a part would touch, read live from bills of material, open orders and stock. Nothing on this screen is saved."
      />

      <div className="x-notice" data-tone="warning">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <p>
            <strong>This assessment is not recorded anywhere.</strong> There is no change-request
            table in this system, so a change cannot be raised, numbered, assessed on the record,
            approved, given an effectivity date, or acknowledged on the shop floor. What you see
            below is recomputed from live records every time it is opened.
          </p>
          <p className="mt-1.5">
            That makes it always current and impossible to attach to a decision. Print it, or copy
            the figures into whatever your change process uses today.
          </p>
        </div>
      </div>

      {selected ? (
        <ImpactAssessment key={selected.id} item={selected} />
      ) : (
        <p className="text-[13px] text-[var(--text-secondary)]" role="status">
          {loading
            ? "Loading the part list…"
            : error
              ? "The part list could not be loaded. Retry below."
              : "Select a part below to assess a revision change to it."}
        </p>
      )}

      <h2 className="x-section-heading">Parts</h2>

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by part code or description…"
          aria-label="Filter parts"
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
        rowKey={(item) => item.id}
        caption="Parts, with how many live bills of material each has"
        empty={
          filter ? (
            <Empty title="Nothing matches that filter" body={`No part matched “${filter}”.`} />
          ) : (
            <Empty
              title="No parts yet"
              body="Parts appear here once the item master has rows. A revision change needs something to change."
            />
          )
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The assessment                                                             */
/* -------------------------------------------------------------------------- */

function ImpactAssessment({ item }: { item: ItemRow }): React.JSX.Element {
  const { can } = useAccess();

  // Every read below is gated by passing `null` instead of a path. The permission is checked
  // BEFORE the request rather than after: a 403 in the console on behalf of someone who was
  // never allowed to look is noise, and a panel that renders empty because of it is worse —
  // it reads as "there is none of this", which on an impact assessment is a sentence people
  // act on. Each panel says which of the two it is.
  const canWhereUsed = can("planning.policy.read");
  const canBom = can("engineering.bom.read");
  const canProduction = can("production.order.read");
  const canSales = can("sales.order.read");
  const canStock = can("inventory.stock.read");
  const canPlan = can("planning.mrp.read");

  const whereUsed = useQuery<WhereUsedResponse>(
    canWhereUsed ? engChangeApi.whereUsedPath(item.id) : null,
  );
  const currentBom = useQuery<BomView>(
    canBom && item.defaultBomId ? engChangeApi.bomPath(item.defaultBomId) : null,
  );
  const stock = useQuery<StockRow[]>(canStock ? engChangeApi.stockPath : null, {
    query: { itemId: item.id },
  });
  const production = useCursorList<ProductionOrderRow>(
    canProduction ? engChangeApi.productionOrdersPath : null,
    { limit: 100 },
  );
  const planned = useQuery<{ data?: PlannedOrderRow[] }>(
    canPlan ? engChangeApi.plannedOrdersPath : null,
  );
  const sales = useOpenSalesOrders(canSales);

  /**
   * The affected set: this part, plus every parent that consumes it at ANY depth.
   *
   * The closure is what makes this an assessment rather than a lookup. One level up answers
   * "which assembly is this in"; the closure answers "what do I have to stop", and those are
   * different questions with different answers whenever a sub-assembly is involved.
   */
  // Wrapped rather than read inline: `?? []` produces a fresh array on every render, which
  // would make every memo below it recompute on every render and defeat the point of them.
  const parents = useMemo(() => whereUsed.data?.parents ?? [], [whereUsed.data]);
  const affectedItemIds = useMemo(
    () => new Set<string>([item.id, ...parents.map((parent) => parent.itemId)]),
    [item.id, parents],
  );
  const affectedItemCodes = useMemo(
    () => new Set<string>([item.itemCode, ...parents.map((parent) => parent.itemCode)]),
    [item.itemCode, parents],
  );

  const openProduction = useMemo(
    () => production.rows.filter((row) => affectedItemIds.has(row.itemId) && isOpenStatus(row.status)),
    [production.rows, affectedItemIds],
  );

  const affectedSales = useMemo(
    () =>
      sales.orders
        .map((order) => ({
          order,
          lines: order.lines.filter((line) => affectedItemIds.has(line.itemId)),
        }))
        .filter((entry) => entry.lines.length > 0),
    [sales.orders, affectedItemIds],
  );

  const plannedRows = useMemo(() => planned.data?.data ?? [], [planned.data]);
  const plannedBuy = useMemo(
    () =>
      plannedRows.filter(
        (row) => affectedItemCodes.has(row.itemCode) && row.sourceType === "buy" && row.status !== "cancelled",
      ),
    [plannedRows, affectedItemCodes],
  );
  const plannedMake = useMemo(
    () =>
      plannedRows.filter(
        (row) => affectedItemCodes.has(row.itemCode) && row.sourceType === "make" && row.status !== "cancelled",
      ),
    [plannedRows, affectedItemCodes],
  );

  const stockRows = stock.data ?? [];
  const stockTotal = stockRows.reduce((total, row) => total + Number(row.qty), 0);
  const stockValue = valueAtStandardCost(stockTotal, item.standardCost);

  const refreshAll = useCallback((): void => {
    whereUsed.reload();
    currentBom.reload();
    stock.reload();
    production.reload();
    planned.reload();
  }, [whereUsed, currentBom, stock, production, planned]);

  /**
   * Production orders read only the FIRST hundred. Said out loud wherever the number is
   * shown, because "no open orders are affected" and "no open orders are affected in the
   * hundred I looked at" are different statements and only one of them is safe to act on.
   */
  const productionTruncated = production.hasMore;

  return (
    <section className="x-home-panel" aria-labelledby="impact-heading">
      <div className="x-home-panel-head flex-wrap gap-3">
        <div>
          <h2 id="impact-heading" className="x-section-heading">
            If {item.itemCode} changed revision
          </h2>
          <p>
            {item.name} · {humanise(item.itemType)} · measured in {item.uom}
            {currentBom.data ? ` · current bill is version ${currentBom.data.version}` : ""}
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refreshAll}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Recompute
        </button>
      </div>

      <div className="space-y-5 p-5">
        {item.bomCount > 1 ? (
          <div className="x-notice" data-tone="warning">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              <strong>{item.itemCode} has {item.bomCount} live bills of material.</strong> Publishing
              a revision does not retire the one before it, so every live version is in the
              bill-of-materials graph that the where-used closure below is computed over. Some of
              these parents may be reached through a revision nobody builds any more.
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <ImpactStat
            label="Parent assemblies"
            value={canWhereUsed ? String(parents.length) : "Not visible"}
            hint={
              canWhereUsed
                ? "Every assembly that consumes this part at any depth, over live bills of material"
                : "Needs planning.policy.read"
            }
          />
          <ImpactStat
            label="Open builds"
            value={canProduction ? String(openProduction.length) : "Not visible"}
            hint={
              canProduction
                ? `Production orders fixed to the current revision${productionTruncated ? " — first 100 orders only" : ""}`
                : "Needs production.order.read"
            }
          />
          <ImpactStat
            label="Customer orders"
            value={canSales ? String(affectedSales.length) : "Not visible"}
            hint={
              canSales
                ? sales.notRead > 0 || sales.beyondFirstPage
                  ? `Of the open orders read; ${sales.notRead} more were not opened`
                  : "Open orders containing this part or an assembly that uses it"
                : "Needs sales.order.read"
            }
          />
          <ImpactStat
            label="Stock on hand"
            value={canStock ? fmtQty(stockTotal, item.uom) : "Not visible"}
            hint={
              canStock
                ? stockValue === null
                  ? `Across ${stockRows.length} balance row(s); no standard cost on record to value it`
                  : `Across ${stockRows.length} balance row(s) · about ${inr(stockValue)} at standard cost`
                : "Needs inventory.stock.read"
            }
          />
          <ImpactStat
            label="Planned buys"
            value={canPlan ? String(plannedBuy.length) : "Not visible"}
            hint={
              canPlan
                ? "Material suggested but not yet ordered — the cheapest place to absorb a change"
                : "Needs planning.mrp.read"
            }
          />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* 1. WHERE ELSE IS IT USED                                          */}
        {/* ---------------------------------------------------------------- */}
        <Panel
          title="Where else this part is used"
          note="The transitive where-used closure over every live bill of material — not one level up. An assembly appears here whether it consumes the part directly or through a sub-assembly."
        >
          {!canWhereUsed ? (
            <Denied needs="planning.policy.read" what="the where-used closure" />
          ) : whereUsed.error ? (
            <ErrorState error={whereUsed.error} onRetry={whereUsed.reload} />
          ) : whereUsed.loading ? (
            <Waiting>Walking the bill-of-materials graph…</Waiting>
          ) : parents.length === 0 ? (
            <p className="text-[13px] text-[var(--text-secondary)]">
              Nothing consumes {item.itemCode}. Either it is a top-level product, or no live bill of
              material references it. A change to it affects only what is made FROM it, which is
              nothing.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {parents.map((parent) => (
                <li key={parent.itemId}>
                  <span className="chip bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                    {parent.itemCode}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ---------------------------------------------------------------- */}
        {/* 2. WHAT IS MID-BUILD                                              */}
        {/* ---------------------------------------------------------------- */}
        <Panel
          title="Open builds that would finish to the old revision"
          note="A production order pins the exact bill it was exploded from and an active bill cannot be edited in place, so these orders will be built to today's revision whatever is decided now. Each one is a decision: let it run, or stop it."
        >
          {!canProduction ? (
            <Denied needs="production.order.read" what="open production orders" />
          ) : production.error ? (
            <ErrorState error={production.error} onRetry={production.reload} />
          ) : production.loading ? (
            <Waiting>Reading open production orders…</Waiting>
          ) : openProduction.length === 0 ? (
            <p className="text-[13px] text-[var(--text-secondary)]">
              No open production order is for this part or for an assembly that uses it
              {productionTruncated ? ", in the first 100 orders read" : ""}. Nothing is mid-build
              against the revision you are about to change.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="x-data-table min-w-[40rem]">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Building</th>
                    <th>Quantity</th>
                    <th>Raised</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {openProduction.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <strong>{order.orderNo}</strong>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          Pinned to bill {order.bomId.slice(0, 8)}…
                        </div>
                      </td>
                      <td>
                        {order.itemCode ?? "Unlabelled part"}
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {order.itemId === item.id ? "This part" : "Assembly that uses it"}
                        </div>
                      </td>
                      <td>
                        {fmtQty(order.qtyToProduce, order.uom)}
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {fmtQty(order.producedQty, order.uom)} made so far
                        </div>
                      </td>
                      <td>{date(order.createdAt)}</td>
                      <td>
                        <StatusBadge status={order.status} tone={toneFor(order.status)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* ---------------------------------------------------------------- */}
        {/* 3. WHAT IS PROMISED                                               */}
        {/* ---------------------------------------------------------------- */}
        <Panel
          title="Customer orders those builds are promised against"
          note="The sales order list carries no line detail, so each open order has to be opened to see what is on it. Only open orders are read, and only up to a cap — the number not read is stated rather than rounded away."
        >
          {!canSales ? (
            <Denied needs="sales.order.read" what="customer orders" />
          ) : sales.error ? (
            <ErrorState error={sales.error} />
          ) : sales.loading ? (
            <Waiting>Opening each open customer order to read its lines…</Waiting>
          ) : (
            <>
              {affectedSales.length === 0 ? (
                <p className="text-[13px] text-[var(--text-secondary)]">
                  No open customer order that was read contains this part or an assembly that uses
                  it.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="x-data-table min-w-[44rem]">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Customer</th>
                        <th>Affected lines</th>
                        <th>Next promise</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {affectedSales.map(({ order, lines }) => (
                        <tr key={order.id}>
                          <td>
                            <strong>{order.soNo}</strong>
                            <div className="text-[11px] text-[var(--text-muted)]">
                              Their PO {order.custPoNo || "not recorded"}
                            </div>
                          </td>
                          <td>
                            {order.customerName ?? "Unnamed customer"}
                            <div className="text-[11px] text-[var(--text-muted)]">
                              {order.customerCode ?? "no code"}
                            </div>
                          </td>
                          <td>
                            {lines.map((line) => (
                              <div key={line.id}>
                                {line.itemCode ?? "Unlabelled part"} —{" "}
                                {fmtQty(line.qty, line.uom)}
                                {Number(line.deliveredQty) > 0
                                  ? ` (${fmtQty(line.deliveredQty, line.uom)} shipped)`
                                  : ""}
                              </div>
                            ))}
                          </td>
                          <td>
                            {order.requestedDeliveryDate
                              ? date(order.requestedDeliveryDate)
                              : "No promise recorded"}
                          </td>
                          <td>
                            <StatusBadge status={order.status} tone={toneFor(order.status)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {sales.notRead > 0 || sales.beyondFirstPage ? (
                <p className="mt-3 text-[12px] text-[var(--warn-ink)]">
                  {sales.notRead > 0
                    ? `${sales.notRead} further open order(s) were listed but not opened, so their lines were not checked.`
                    : ""}{" "}
                  {sales.beyondFirstPage
                    ? "There are also open orders beyond the first hundred, which were not listed at all."
                    : ""}{" "}
                  This part of the assessment is incomplete by that much.
                </p>
              ) : null}
            </>
          )}
        </Panel>

        {/* ---------------------------------------------------------------- */}
        {/* 4. WHAT IS ON THE SHELF                                           */}
        {/* ---------------------------------------------------------------- */}
        <Panel
          title="Stock already built or bought to the current revision"
          note="Live balances from the stock ledger. Nothing here records a disposition — there is no field for use-up, rework or scrap anywhere in this schema, so that decision has to be made and carried somewhere else."
        >
          {!canStock ? (
            <Denied needs="inventory.stock.read" what="stock balances" />
          ) : stock.error ? (
            <ErrorState error={stock.error} onRetry={stock.reload} />
          ) : stock.loading ? (
            <Waiting>Reading stock balances…</Waiting>
          ) : stockRows.length === 0 ? (
            <p className="text-[13px] text-[var(--text-secondary)]">
              No stock of {item.itemCode} is on hand, so there is nothing built to the old revision
              to use up, rework or write off. That is the cheapest state a change can happen in.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="x-data-table min-w-[36rem]">
                <thead>
                  <tr>
                    <th>Warehouse</th>
                    <th>Batch</th>
                    <th>Quantity</th>
                    <th>At standard cost</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((row) => {
                    const value = valueAtStandardCost(row.qty, item.standardCost);
                    return (
                      <tr key={`${row.warehouseId}:${row.batch}`}>
                        <td>
                          <strong>{row.warehouseCode}</strong>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            {row.warehouseName}
                          </div>
                        </td>
                        <td>{row.batch || "No batch"}</td>
                        <td>{fmtQty(row.qty, row.uom)}</td>
                        <td>{value === null ? "No standard cost on record" : inr(value)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* ---------------------------------------------------------------- */}
        {/* 5. WHAT IS STILL TO BE BOUGHT                                     */}
        {/* ---------------------------------------------------------------- */}
        <Panel
          title="Material suggested but not yet ordered"
          note="Planned orders from the last MRP run. A planned buy is a suggestion nobody has committed to a supplier yet, which is the cheapest place a revision change can land. PURCHASE ORDERS ARE NOT SHOWN: this module holds no purchase permission, so material already committed to a supplier is outside what it can read."
        >
          {!canPlan ? (
            <Denied needs="planning.mrp.read" what="the planned orders from the last MRP run" />
          ) : planned.error ? (
            <ErrorState error={planned.error} onRetry={planned.reload} />
          ) : planned.loading ? (
            <Waiting>Reading the last plan…</Waiting>
          ) : plannedBuy.length === 0 && plannedMake.length === 0 ? (
            <p className="text-[13px] text-[var(--text-secondary)]">
              The last MRP run planned nothing for this part or for any assembly that uses it. Note
              that this says nothing about purchase orders already placed, which this module cannot
              read.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="x-data-table min-w-[40rem]">
                <thead>
                  <tr>
                    <th>Part</th>
                    <th>Kind</th>
                    <th>Quantity</th>
                    <th>Wanted by</th>
                    <th>Release</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {[...plannedBuy, ...plannedMake].map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.itemCode}</strong>
                        <div className="text-[11px] text-[var(--text-muted)]">{row.lotReason}</div>
                      </td>
                      <td>{row.sourceType === "buy" ? "Buy" : "Make"}</td>
                      <td>{num(row.qty, 3)}</td>
                      <td>{date(row.needDate)}</td>
                      <td>
                        {date(row.releaseDate)}
                        {row.pastDue ? (
                          <div className="text-[11px] text-[var(--bad-ink)]">
                            {row.daysLate} day(s) past due
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <StatusBadge status={row.status} tone={toneFor(row.status)} />
                        {row.convertedToRef ? (
                          <div className="text-[11px] text-[var(--text-muted)]">
                            Already {row.convertedToKind ?? "converted"} as {row.convertedToRef}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* ---------------------------------------------------------------- */}
        {/* WHERE THE BUTTON IS NOT                                           */}
        {/* ---------------------------------------------------------------- */}
        <div className="x-notice">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p>
              <strong>The next step of this journey does not exist yet.</strong> A change request
              would normally be raised from here, routed for approval, given a date or a serial
              number it becomes effective at, and acknowledged by the shop floor. None of those can
              be stored: the engineering schema is three tables — items, bills and bill lines — and
              none of them has a field for any of it.
            </p>
            <p className="mt-1.5">
              What CAN be done today: publish the new revision as a new bill version through
              Engineering, and let production orders pin it from then on. Orders already open keep
              the revision they were exploded from, which is exactly what the table above lists.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

function ImpactStat({
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
      <span className="x-stat-top">
        {label}
        <Radar className="h-4 w-4" aria-hidden />
      </span>
      <strong className="x-stat-value">{value}</strong>
      <p className="x-stat-hint">{hint}</p>
    </div>
  );
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="mb-2.5 mt-1 max-w-[80ch] text-[11px] leading-[1.7] text-[var(--text-muted)]">
        {note}
      </p>
      {children}
    </div>
  );
}

/**
 * A panel somebody may not see.
 *
 * Names the permission rather than saying "access denied". The three gates that hide things
 * in this product — installed, licensed, permitted — send a user to three different people,
 * and a message that collapses them helps nobody find the one who can fix it.
 */
function Denied({ needs, what }: { needs: string; what: string }): React.JSX.Element {
  return (
    <p className="text-[13px] text-[var(--text-secondary)]">
      You cannot see {what}: it needs <code className="font-[var(--font-mono)] text-[12px]">{needs}</code>,
      which your role does not hold. This part of the assessment is missing, not empty — do not read
      the figures above as complete.
    </p>
  );
}

function Waiting({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="text-[13px] text-[var(--text-secondary)]" role="status">
      {children}
    </p>
  );
}
