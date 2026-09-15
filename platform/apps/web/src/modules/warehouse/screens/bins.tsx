"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowRightLeft, Loader2, Search, Warehouse as WarehouseIcon } from "lucide-react";
import { api } from "@spine/api/client";
import { useQuery } from "@spine/data/use-query";
import { Can, useAccess } from "@spine/access/permissions";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { qty as fmtQty } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge, toneFor } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { StockEntryBody, StockEntryResult, StockRow, WarehouseRow } from "../api";
import {
  CAPABILITY_GAPS,
  WAREHOUSE_TYPES,
  parseQty,
  sumQty,
  warehouseApi,
  warehouseTypeLabel,
  warehouseTypeMeaning,
} from "../api";
import { ActionNotice, HonestyNote, LedgerReceipt, useHandlingKey, useInFlight } from "./shared";

/**
 * ============================================================================================
 * LOCATIONS AND PUT-AWAY — WHERE THINGS ARE, AND MOVING THEM SOMEWHERE ELSE.
 * ============================================================================================
 *
 * THE FIRST THING THIS SCREEN HAS TO BE HONEST ABOUT IS ITS OWN NAME.
 *
 * "Bins" is the word a warehouse uses, and this screen is called that in the menu because that
 * is what people will look for. But the finest location this system records is a WAREHOUSE.
 * `stock_balance` is keyed on (tenant, item, warehouse, batch) and there is no rack, no aisle,
 * no shelf and no bin anywhere in the schema or in any endpoint. So a put-away here moves a lot
 * from one location to another location — it does not put it on a shelf, and this screen does
 * not draw a shelf it cannot know about.
 *
 * That distinction is not pedantry. A screen that showed bin coordinates it was quietly making
 * up would send a picker to a rack that has nothing on it, and the picker would conclude the
 * stock was stolen. Naming the limit is what stops that.
 *
 * WHAT A PUT-AWAY ACTUALLY IS HERE: a TRANSFER posted through Inventory's single write path.
 * `POST /stock/entries` with `entryType: "transfer"`, a source and a destination that must
 * differ, and the lot named explicitly so no FIFO resolution happens behind the operator's back
 * — when you are physically moving a specific pallet, the ledger must move that specific lot and
 * not whichever one happens to be oldest.
 *
 * The transfer is the whole movement: minus at the source, plus at the destination, both inside
 * one transaction, and the total on hand across the plant is unchanged by construction. This
 * screen does not hold a balance of its own and never adds one up to display as authoritative —
 * every figure below was read from `/inventory/stock` and is re-read after a posting.
 */

interface MoveForm {
  toWarehouseId: string;
  qty: string;
  remarks: string;
}

const EMPTY_MOVE: MoveForm = { toWarehouseId: "", qty: "", remarks: "" };

export default function BinsScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const canPost = can("inventory.stock.post");

  const warehouses = useQuery<WarehouseRow[]>(warehouseApi.warehousesPath);
  const [warehouseId, setWarehouseId] = useState("");
  const [filter, setFilter] = useState("");

  // `/inventory/stock` answers a bare array, not a cursor page, so `useQuery` is right here and
  // `useCursorList` would be pretending at a pagination the endpoint does not offer.
  const stock = useQuery<StockRow[]>(warehouseApi.stockPath, {
    query: warehouseId ? { warehouseId } : {},
  });

  const [moving, setMoving] = useState<StockRow | null>(null);
  const [form, setForm] = useState<MoveForm>(EMPTY_MOVE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [posted, setPosted] = useState<StockEntryResult | null>(null);

  const handling = useHandlingKey();
  const inFlight = useInFlight();

  const rows = useMemo(() => {
    const all = stock.data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (row) =>
        row.itemCode.toLowerCase().includes(q) ||
        row.itemName.toLowerCase().includes(q) ||
        row.batch.toLowerCase().includes(q) ||
        row.warehouseCode.toLowerCase().includes(q),
    );
  }, [filter, stock.data]);

  /**
   * A location's live picture, read off the same rows the table shows.
   *
   * Counted from `/inventory/stock`, never accumulated locally between refreshes, so the tile
   * and the table can never disagree with each other — which is the failure that teaches people
   * to stop believing the tiles.
   */
  const perWarehouse = useMemo(() => {
    const all = stock.data ?? [];
    const byId = new Map<string, { lines: number; lots: Set<string> }>();
    for (const row of all) {
      const current = byId.get(row.warehouseId) ?? { lines: 0, lots: new Set<string>() };
      current.lines += 1;
      if (row.batch) current.lots.add(row.batch);
      byId.set(row.warehouseId, current);
    }
    return byId;
  }, [stock.data]);

  const labelFor = useCallback(
    (itemId: string, whId: string): { item: string; warehouse: string; uom: string | null } => {
      const row = (stock.data ?? []).find((r) => r.itemId === itemId);
      const wh = warehouses.data?.find((w) => w.id === whId);
      return {
        item: row?.itemCode ?? itemId.slice(0, 8),
        warehouse: wh ? `${wh.code} — ${wh.name}` : whId.slice(0, 8),
        uom: row?.uom ?? null,
      };
    },
    [stock.data, warehouses.data],
  );

  function startMove(row: StockRow): void {
    setMoving(row);
    setForm(EMPTY_MOVE);
    setError(null);
    setPosted(null);
  }

  const moveBody: StockEntryBody | null = useMemo(() => {
    if (!moving) return null;
    const amount = parseQty(form.qty);
    if (amount === null || amount <= 0) return null;
    if (!form.toWarehouseId || form.toWarehouseId === moving.warehouseId) return null;
    return {
      entryType: "transfer",
      remarks:
        form.remarks.trim() ||
        `Put-away from ${moving.warehouseCode}${moving.batch ? ` lot ${moving.batch}` : ""}`,
      lines: [
        {
          itemId: moving.itemId,
          fromWarehouseId: moving.warehouseId,
          toWarehouseId: form.toWarehouseId,
          // The lot is named EXPLICITLY. An unnamed transfer is resolved FIFO server-side, which
          // is right for an anonymous issue and wrong when somebody is carrying a specific pallet.
          batch: moving.batch,
          qty: amount,
        },
      ],
    };
  }, [form, moving]);

  async function postMove(): Promise<void> {
    if (!moveBody || inFlight.held()) return;
    inFlight.hold();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<StockEntryResult>(warehouseApi.stockEntriesPath, moveBody, {
        idempotencyKey: handling.keyFor("putaway", moveBody),
      });
      setPosted(result);
      setMoving(null);
      setForm(EMPTY_MOVE);
      stock.reload();
    } catch (e) {
      setError(e);
    } finally {
      inFlight.release();
      setBusy(false);
    }
  }

  const available = moving ? Number(moving.qty) : 0;
  const requested = parseQty(form.qty);
  const tooMuch = requested !== null && requested > available;

  const columns: ReadonlyArray<Column<StockRow>> = [
    {
      key: "item",
      header: "Part",
      render: (row) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{row.itemCode}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{row.itemName}</div>
        </div>
      ),
    },
    {
      key: "warehouse",
      header: "Location",
      width: "w-56",
      render: (row) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{row.warehouseCode}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{row.warehouseName}</div>
        </div>
      ),
    },
    {
      key: "batch",
      header: "Lot",
      width: "w-44",
      render: (row) =>
        row.batch ? (
          <span className="font-[var(--font-mono)] text-[12px]">{row.batch}</span>
        ) : (
          // Not blank. A blank cell reads as "not loaded"; unbatched is a real, different answer.
          <span className="text-[var(--text-muted)]">Unbatched</span>
        ),
    },
    {
      key: "qty",
      header: "On hand",
      numeric: true,
      width: "w-40",
      render: (row) => <span className="font-semibold">{fmtQty(row.qty, row.uom)}</span>,
    },
    {
      key: "move",
      header: "",
      width: "w-32",
      render: (row) => (
        <Can permission="inventory.stock.post">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => startMove(row)}
            aria-label={`Move ${row.itemCode} out of ${row.warehouseCode}`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
            Move
          </button>
        </Can>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Locations & put-away"
        subtitle="Every location this plant stores stock in, what is in each one, and moving a lot from one to another. Balances are read from the stock ledger; nothing on this screen holds a figure of its own."
        meta={[
          { label: "Locations", value: warehouses.loading ? "…" : String((warehouses.data ?? []).length) },
          { label: "Stock lines shown", value: stock.loading ? "…" : String(rows.length) },
        ]}
      />

      <HonestyNote title="The smallest place this system knows is a location, not a bin.">
        <p>
          Stock is held against a warehouse and a lot. There is no rack, aisle or shelf anywhere in
          this build, so a put-away moves a lot between locations — it does not record which shelf
          it went on, and nothing here will tell a picker where in the building to walk.
        </p>
      </HonestyNote>

      <ActionNotice error={error} />

      {posted ? (
        <LedgerReceipt
          title="Moved"
          entryId={posted.entryId}
          lineCount={posted.lineCount}
          movements={posted.movements}
          labelFor={labelFor}
        >
          <p>
            One transfer, posted as a pair of movements in a single transaction. The total on hand
            across the plant is unchanged — a transfer takes from one location and gives to another,
            and cannot do one without the other.
          </p>
        </LedgerReceipt>
      ) : null}

      {/* ---- the locations themselves ------------------------------------------------------- */}
      <section className="x-home-panel" aria-labelledby="bins-locations-heading">
        <div className="x-home-panel-head flex-wrap gap-3">
          <div>
            <h2 id="bins-locations-heading" className="x-section-heading">
              Locations and what each type means
            </h2>
            <p>
              The type is what decides how stock in a location is treated. Six exist in this build
              and no others can be set.
            </p>
          </div>
        </div>
        {warehouses.loading ? (
          <Loading label="Reading the location master…" />
        ) : warehouses.error ? (
          <div className="p-5">
            <ErrorState error={warehouses.error} onRetry={warehouses.reload} />
          </div>
        ) : (warehouses.data ?? []).length === 0 ? (
          <div className="p-5">
            <Empty
              title="No locations yet"
              body="Stock cannot be received anywhere until at least one warehouse exists in the master."
            />
          </div>
        ) : (
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {(warehouses.data ?? []).map((w) => {
              const stats = perWarehouse.get(w.id);
              const selected = warehouseId === w.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWarehouseId(selected ? "" : w.id)}
                  aria-pressed={selected}
                  className={`x-stat-card text-left ${
                    selected ? "border-[var(--brand)] ring-1 ring-[var(--brand)]" : ""
                  }`}
                >
                  <span className="x-stat-top">
                    {w.code}
                    <WarehouseIcon className="h-4 w-4" aria-hidden />
                  </span>
                  <strong className="x-stat-value text-[18px]">{w.name}</strong>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status={w.warehouseType}
                      tone={
                        w.warehouseType === "quarantine"
                          ? "hold"
                          : w.warehouseType === "scrap"
                            ? "rejected"
                            : toneFor(w.warehouseType)
                      }
                      label={warehouseTypeLabel(w.warehouseType)}
                    />
                    {WAREHOUSE_TYPES[w.warehouseType] ? null : (
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Unrecognised type — shown as recorded
                      </span>
                    )}
                  </span>
                  {/* Spans, not paragraphs: the whole tile is a button, and a button may only
                      contain phrasing content. A <p> in here is invalid HTML that browsers
                      silently reparent, which moves the text out of the clickable area. */}
                  <span className="x-stat-hint block">{warehouseTypeMeaning(w.warehouseType)}</span>
                  <span className="x-stat-hint block">
                    {warehouseId && !selected
                      ? "Filtered out — clear the selection to count this one."
                      : stats
                        ? `${stats.lines} stock line${stats.lines === 1 ? "" : "s"}${
                            stats.lots.size > 0 ? ` · ${stats.lots.size} lot${stats.lots.size === 1 ? "" : "s"}` : ""
                          }`
                        : stock.loading
                          ? "Counting…"
                          : "Nothing on hand"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- the move form ------------------------------------------------------------------ */}
      {moving ? (
        <section className="x-home-panel" aria-labelledby="bins-move-heading">
          <div className="x-home-panel-head">
            <div>
              <h2 id="bins-move-heading" className="x-section-heading">
                Move {moving.itemCode}
                {moving.batch ? ` · lot ${moving.batch}` : " · unbatched"}
              </h2>
              <p>
                Out of {moving.warehouseCode} — {moving.warehouseName}. There is{" "}
                {fmtQty(moving.qty, moving.uom)} on hand there right now.
              </p>
            </div>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            <label className="x-field">
              Move to
              <select
                value={form.toWarehouseId}
                onChange={(e) => setForm((f) => ({ ...f, toWarehouseId: e.target.value }))}
                aria-label="Destination location"
              >
                <option value="">Choose a location…</option>
                {(warehouses.data ?? [])
                  .filter((w) => w.id !== moving.warehouseId)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name} ({warehouseTypeLabel(w.warehouseType)})
                    </option>
                  ))}
              </select>
              <small>
                A transfer needs two different locations. The source is excluded from this list
                because the server refuses a transfer to the same place.
              </small>
            </label>
            <label className="x-field">
              How much
              <input
                type="number"
                min={0}
                max={available}
                step="0.001"
                inputMode="decimal"
                value={form.qty}
                aria-invalid={tooMuch}
                onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
              />
              <small>
                {tooMuch
                  ? `Only ${fmtQty(available, moving.uom)} is in ${moving.warehouseCode}. The ledger refuses a movement that would take a balance below zero.`
                  : `Up to ${fmtQty(available, moving.uom)}. Part of a lot can be moved — the rest stays where it is.`}
              </small>
            </label>
            <label className="x-field">
              Why (optional)
              <input
                type="text"
                maxLength={500}
                value={form.remarks}
                placeholder="Put-away to the pick face"
                onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
              />
              <small>
                Travels on the stock entry and stays on the record. This is the only free text a
                movement carries.
              </small>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 px-5 pb-5">
            <button
              type="button"
              className="btn btn-ghost min-h-[42px]"
              disabled={busy}
              onClick={() => {
                setMoving(null);
                setForm(EMPTY_MOVE);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-pri min-h-[42px] px-5"
              disabled={busy || moveBody === null || tooMuch || !canPost}
              onClick={() => void postMove()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ArrowRightLeft className="h-4 w-4" aria-hidden />
              )}
              {busy ? "Moving…" : "Post the move"}
            </button>
          </div>
        </section>
      ) : null}

      {/* ---- what is on hand ---------------------------------------------------------------- */}
      <h2 className="x-section-heading">
        {warehouseId
          ? `On hand in ${warehouses.data?.find((w) => w.id === warehouseId)?.code ?? "this location"}`
          : "On hand everywhere"}
      </h2>

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by part, lot or location…"
          aria-label="Filter stock"
          className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={stock.loading}
        error={stock.error}
        onReload={stock.reload}
        rowKey={(row) => `${row.itemId}:${row.warehouseId}:${row.batch}`}
        caption="Stock on hand by part, location and lot"
        empty={
          filter ? (
            <Empty title="Nothing matches that filter" body={`No stock line matched “${filter}”.`} />
          ) : (
            <Empty
              title="Nothing on hand here"
              body="Only non-zero balances are listed. A location with nothing in it is not an error — it is an answer."
            />
          )
        }
      />

      {rows.length > 0 ? (
        <p className="text-[12px] leading-[1.6] text-[var(--text-muted)]">
          {rows.length} line{rows.length === 1 ? "" : "s"} shown. Quantities are summed here only to
          describe what is on screen — {fmtQty(sumQty(rows.map((r) => r.qty)))} across mixed units of
          measure is not a meaningful total and is not offered as one.
        </p>
      ) : null}

      {!canPost ? (
        <HonestyNote title="You can look, but not move.">
          <p>
            Moving stock needs <code>inventory.stock.post</code>, which you do not hold. Every figure
            on this screen is readable; the Move buttons are not drawn rather than drawn and then
            refused.
          </p>
        </HonestyNote>
      ) : null}

      <HonestyNote title="Nothing here is reserved.">
        <p>{CAPABILITY_GAPS.reservation}</p>
      </HonestyNote>
    </div>
  );
}
