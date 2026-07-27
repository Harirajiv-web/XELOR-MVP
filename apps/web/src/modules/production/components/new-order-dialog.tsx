"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@spine/api/client";
import { AppError } from "@spine/api/errors";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { FieldError, Loading } from "@spine/states";
import type {
  ItemOption,
  ProductionOrderCoreResult,
  WarehouseOption,
} from "../api";
import { productionApi } from "../api";
import { ActionError } from "./action-error";
import { useActionKey } from "./idempotency";
import { Modal } from "./modal";

/**
 * NEW WORK ORDER — MAINDECK's `newRecordModal` shape, over the real create schema.
 *
 * The schema (`production.controller.ts`) wants exactly five things and four of them are
 * mandatory: which item, how many, which warehouse the components come out of, and which
 * warehouse the finished goods go into. `bomId` is the fifth and it is optional, and this
 * form deliberately does NOT send it — see below.
 *
 * EVERY IDENTIFIER IS PICKED, NEVER TYPED. The deck's form had "Product & qty" as a free-text
 * box, which is fine for a demo and is a data-quality incident in a real plant: a work order
 * that names an item the item master has never heard of cannot be exploded, cannot be issued
 * against, and cannot be costed. Items come from Engineering's master and warehouses from
 * Inventory's, both over ordinary GETs.
 *
 * ITEMS WITHOUT A BILL OF MATERIALS ARE NOT OFFERED. The server refuses them every time
 * (`PRODUCTION_NO_BOM`), so listing them would be listing guaranteed rejections. How many were
 * hidden, and why, is said out loud underneath rather than left as a mystery.
 */
export function NewWorkOrderDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (order: ProductionOrderCoreResult) => void;
}): React.JSX.Element {
  const items = useCursorList<ItemOption>(productionApi.itemsPath, { limit: 100 });
  const warehouses = useQuery<WarehouseOption[]>(productionApi.warehousesPath);

  const [itemId, setItemId] = useState("");
  const [qtyText, setQtyText] = useState("");
  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [fgWarehouseId, setFgWarehouseId] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [touched, setTouched] = useState(false);
  const inFlight = useRef(false);
  const actionKey = useActionKey();

  const makeable = useMemo(() => items.rows.filter((i) => i.bomCount > 0), [items.rows]);
  const hiddenCount = items.rows.length - makeable.length;
  const selectedItem = makeable.find((i) => i.id === itemId) ?? null;

  // Sensible defaults the moment the warehouse list lands: components come out of an
  // "accepted" store and finished goods go into a "finished" one, which is what these types
  // mean. Still both editable — a plant with two accepted stores has a real choice to make.
  useEffect(() => {
    const list = warehouses.data;
    if (!list || list.length === 0) return;
    setSourceWarehouseId((current) => current || pick(list, "accepted"));
    setFgWarehouseId((current) => current || pick(list, "finished"));
  }, [warehouses.data]);

  const qtyValue = Number(qtyText);
  const qtyValid = qtyText.trim() !== "" && Number.isFinite(qtyValue) && qtyValue > 0;

  const serverFields = error instanceof AppError ? error.byField() : {};
  const fieldError = (name: string, local: string | null): string | null =>
    (touched ? local : null) ?? serverFields[name] ?? null;

  async function submit(): Promise<void> {
    setTouched(true);
    if (inFlight.current) return;
    if (!itemId || !qtyValid || !sourceWarehouseId || !fgWarehouseId) return;

    const body = {
      itemId,
      qtyToProduce: qtyValue,
      sourceWarehouseId,
      fgWarehouseId,
    };

    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<ProductionOrderCoreResult>(
        productionApi.ordersPath,
        body,
        // Stable across retries of THIS order — see `useActionKey`. A dropped response on a
        // create is two work orders for the same job otherwise.
        { idempotencyKey: actionKey.keyFor(JSON.stringify(body)) },
      );
      actionKey.reset();
      onCreated(created);
    } catch (e) {
      setError(e);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New work order"
      subtitle="Tells the floor what to make and how much of it. Nothing leaves stores until components are issued."
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn-ghost min-h-[42px]" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            form="new-work-order"
            className="btn btn-pri min-h-[42px] px-5"
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? "Raising…" : "Raise work order"}
          </button>
        </>
      }
    >
      <form
        id="new-work-order"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-4"
      >
        {/* Inline, above the fields — never a page takeover. Whatever has been typed stays
            typed: a form that clears itself on a refusal is a form people stop trusting with
            a number they had to walk to a machine to read. */}
        <ActionError error={error} />

        {/* A master that will not load is named where the field is, so the reader can tell
            "no items exist" apart from "you may not read the item master". */}
        {items.error ? <ActionError error={items.error} /> : null}
        {warehouses.error ? <ActionError error={warehouses.error} /> : null}

        {items.loading || warehouses.loading ? (
          <Loading label="Loading items and warehouses…" />
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* ---- what is being made ---- */}
          <div className="sm:col-span-2">
            <label className="field-label field-req" htmlFor="wo-item">
              Item to make
            </label>
            <select
              id="wo-item"
              className="field min-h-[44px]"
              value={itemId}
              disabled={busy}
              onChange={(e) => setItemId(e.target.value)}
            >
              <option value="">Choose an item…</option>
              {makeable.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.itemCode} — {i.name} ({i.uom})
                </option>
              ))}
            </select>
            <FieldHelp>
              {makeable.length === 0 && !items.loading
                ? "No item in this plant has a released bill of materials, so there is nothing that can be made yet."
                : hiddenCount > 0
                  ? `${hiddenCount} more ${hiddenCount === 1 ? "item is" : "items are"} not shown: they have no released bill of materials, so a work order against them would be refused.`
                  : "Only items with a released bill of materials can be made."}
            </FieldHelp>
            {items.hasMore ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm mt-1.5"
                onClick={items.loadMore}
                disabled={items.loadingMore || busy}
              >
                {items.loadingMore ? "Loading…" : "Load more items"}
              </button>
            ) : null}
            <FieldErrorLine message={fieldError("itemId", itemId ? null : "Choose the item this order makes.")} />
          </div>

          {/* ---- how many ---- */}
          <div>
            <label className="field-label field-req" htmlFor="wo-qty">
              Quantity to produce
            </label>
            <div className="flex items-stretch gap-2">
              <input
                id="wo-qty"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                className="field min-h-[44px] text-[15px] font-semibold"
                value={qtyText}
                disabled={busy}
                onChange={(e) => setQtyText(e.target.value)}
              />
              {/* The unit hangs off the number rather than living in the label — a bare 45
                  on a shop-floor screen is a number nobody can act on. */}
              <span className="flex min-w-[64px] items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 text-[13px] font-semibold text-[var(--text-secondary)]">
                {selectedItem?.uom ?? "—"}
              </span>
            </div>
            <FieldErrorLine
              message={fieldError(
                "qtyToProduce",
                qtyValid ? null : "Enter how many are to be made — more than zero.",
              )}
            />
          </div>

          {/* ---- which recipe (read-only, deliberately) ---- */}
          <div>
            <span className="field-label">Bill of materials</span>
            <div className="field flex min-h-[44px] items-center bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
              {selectedItem
                ? selectedItem.bomCount === 1
                  ? "The item's released bill of materials"
                  : `Latest of ${selectedItem.bomCount} released versions`
                : "Chosen from the item"}
            </div>
            {/* The API accepts a specific `bomId`, but nothing exposes the list of versions for
                an item, so a picker here would be a box with one option in it pretending to be
                a choice. The server pins the active version and the order carries it. */}
            <FieldHelp>
              The active version is pinned when the order is raised. Choosing an older version
              is not available yet.
            </FieldHelp>
          </div>

          {/* ---- where material moves ---- */}
          <div>
            <label className="field-label field-req" htmlFor="wo-source">
              Issue components from
            </label>
            <select
              id="wo-source"
              className="field min-h-[44px]"
              value={sourceWarehouseId}
              disabled={busy}
              onChange={(e) => setSourceWarehouseId(e.target.value)}
            >
              <option value="">Choose a store…</option>
              {(warehouses.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
            <FieldErrorLine
              message={fieldError(
                "sourceWarehouseId",
                sourceWarehouseId ? null : "Choose the store the components come out of.",
              )}
            />
          </div>

          <div>
            <label className="field-label field-req" htmlFor="wo-fg">
              Receive finished goods into
            </label>
            <select
              id="wo-fg"
              className="field min-h-[44px]"
              value={fgWarehouseId}
              disabled={busy}
              onChange={(e) => setFgWarehouseId(e.target.value)}
            >
              <option value="">Choose a store…</option>
              {(warehouses.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
            <FieldErrorLine
              message={fieldError(
                "fgWarehouseId",
                fgWarehouseId ? null : "Choose the store the output goes into.",
              )}
            />
          </div>
        </div>

        <p className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2.5 text-[12px] leading-[1.55] text-[var(--text-secondary)]">
          Saving explodes the bill of materials into component requirements against this order.
          <b className="text-[var(--text-primary)]"> No stock moves yet.</b> Components leave the
          store when someone issues them, and finished goods appear when someone records output —
          both from the order&rsquo;s own screen, and both audited.
        </p>
      </form>
    </Modal>
  );
}

function pick(list: readonly WarehouseOption[], type: string): string {
  return list.find((w) => w.warehouseType === type)?.id ?? "";
}

function FieldHelp({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="mt-1 text-[11.5px] leading-[1.45] text-[var(--text-muted)]">{children}</p>;
}

function FieldErrorLine({ message }: { message: string | null }): React.JSX.Element | null {
  return message ? <FieldError message={message} /> : null;
}
