"use client";

import { useRef, useState } from "react";
import { Loader2, PackagePlus } from "lucide-react";
import { api } from "@spine/api/client";
import { qty } from "@spine/format";
import { FieldError } from "@spine/states";
import type { ProductionActionResult, ProductionOrderDetail } from "../api";
import { outstanding, productionApi } from "../api";
import { ActionError } from "./action-error";
import { useActionKey } from "./idempotency";
import { Modal } from "./modal";

/**
 * RECORD OUTPUT — what actually came off the line.
 *
 * `POST /production/orders/:id/complete` takes one number: `producedQty`. Everything else the
 * server already knows — which item, which finished-goods store, and whether this closes the
 * order.
 *
 * THE CONSEQUENCE IS SHOWN BEFORE THE BUTTON IS PRESSED. The server closes the order when
 * cumulative output reaches the ordered quantity, and that rule is mirrored here in a plain
 * sentence that updates as the number is typed: "after this, 600 of 600 — the order will be
 * marked Completed". A supervisor should never discover that an order closed by watching it
 * close.
 *
 * OVER-PRODUCTION IS ALLOWED AND SAID OUT LOUD. The API does not cap output at the ordered
 * quantity, so this form does not pretend to either — it warns, and lets it through, because
 * a form that silently refused a real 47th casting would send the operator back to paper.
 *
 * This UI does not build a stock movement and does not call a stock endpoint. The receipt
 * reaches the ledger through Inventory's single write path, server-side (DECISIONS-V2 §5.6).
 */
export function RecordOutputDialog({
  order,
  fgWarehouse,
  onClose,
  onCompleted,
}: {
  order: ProductionOrderDetail;
  /** "FG-01 — Finished goods", or the raw id if the warehouse master is unreadable. */
  fgWarehouse: string;
  onClose: () => void;
  onCompleted: (result: ProductionActionResult) => void;
}): React.JSX.Element {
  const remaining = outstanding(order.qtyToProduce, order.producedQty);
  const [qtyText, setQtyText] = useState(remaining > 0 ? String(remaining) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [touched, setTouched] = useState(false);
  const inFlight = useRef(false);
  const actionKey = useActionKey();

  const value = Number(qtyText);
  const valid = qtyText.trim() !== "" && Number.isFinite(value) && value > 0;

  const ordered = Number(order.qtyToProduce);
  const alreadyDone = Number(order.producedQty);
  const after = valid ? alreadyDone + value : alreadyDone;
  // Mirrors the server's own rule (`newProduced + 1e-9 >= qtyToProduce`), so the sentence on
  // screen and the status the order ends up in can never disagree.
  const willComplete = valid && after + 1e-9 >= ordered;
  const overProducing = valid && value > remaining + 1e-9;

  async function submit(): Promise<void> {
    setTouched(true);
    if (inFlight.current || !valid) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<ProductionActionResult>(
        productionApi.completePath(order.id),
        { producedQty: value },
        // Stable per (order, quantity). A retry of the same number replays; a deliberately
        // different number is a new action and gets a new key, which is why the seed carries
        // the quantity — see `useActionKey`.
        { idempotencyKey: actionKey.keyFor(`complete:${order.id}:${value}`) },
      );
      actionKey.reset();
      onCompleted(result);
    } catch (e) {
      setError(e);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Record output — ${order.orderNo}`}
      subtitle="How many came off the line. This is received into finished goods and posted to the stock ledger."
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost min-h-[42px]"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="record-output"
            className="btn btn-pri min-h-[42px] px-5"
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <PackagePlus className="h-4 w-4" aria-hidden />
            )}
            {busy
              ? "Receiving…"
              : valid
                ? `Receive ${qty(value, order.uom)}`
                : "Receive output"}
          </button>
        </>
      }
    >
      <form
        id="record-output"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-4"
      >
        <ActionError error={error} />

        {/* Where the order stands, before anything is typed. The three numbers a supervisor
            checks against the tally sheet in their hand, in the order they check them. */}
        <div className="kgrid kgrid-3">
          <div className="kpi">
            <div className="kpi-l">Ordered</div>
            <div className="kpi-v">{qty(order.qtyToProduce, order.uom)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">Already produced</div>
            <div className="kpi-v">{qty(order.producedQty, order.uom)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">Still to make</div>
            <div className="kpi-v">{qty(remaining, order.uom)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label field-req" htmlFor="output-qty">
              Quantity produced
            </label>
            <div className="flex items-stretch gap-2">
              <input
                id="output-qty"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                className="field min-h-[48px] text-[17px] font-bold"
                value={qtyText}
                disabled={busy}
                onChange={(e) => setQtyText(e.target.value)}
              />
              <span className="flex min-w-[64px] items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 text-[13px] font-semibold text-[var(--text-secondary)]">
                {order.uom ?? "—"}
              </span>
            </div>
            {touched && !valid ? (
              <FieldError message="Enter how many came off the line — more than zero." />
            ) : null}
          </div>

          <div>
            <span className="field-label">Received into</span>
            <div className="field flex min-h-[48px] items-center bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
              {fgWarehouse}
            </div>
          </div>
        </div>

        {/* The consequence, in words, before the button. */}
        <p className="rounded-[var(--radius-card)] border border-[var(--brand)] bg-[var(--brand-soft-2)] px-3 py-2.5 text-[13px] leading-[1.55] text-[var(--text-secondary)]">
          {valid ? (
            <>
              After this the order reads{" "}
              <b className="text-[var(--text-primary)]">
                {qty(after, order.uom)} of {qty(ordered, order.uom)}
              </b>{" "}
              produced, and{" "}
              {willComplete ? (
                <>
                  will be marked <b className="text-[var(--text-primary)]">Completed</b>.
                </>
              ) : (
                <>
                  stays <b className="text-[var(--text-primary)]">In progress</b> with{" "}
                  <b className="text-[var(--text-primary)]">
                    {qty(ordered - after, order.uom)}
                  </b>{" "}
                  still to make.
                </>
              )}
            </>
          ) : (
            "Enter a quantity to see what this order will read afterwards."
          )}
        </p>

        {overProducing ? (
          <p className="rounded-[var(--radius-card)] border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2.5 text-[13px] leading-[1.55] text-[var(--warn-ink)]">
            <b>That is more than the order asked for.</b> {qty(remaining, order.uom)} were
            outstanding and you have entered {qty(value, order.uom)}. All of it will be received
            into {fgWarehouse} and the order closed — which is correct if the extra pieces are
            real, and worth a second look if the number was mistyped.
          </p>
        ) : null}

        <p className="text-[12px] leading-[1.55] text-[var(--text-muted)]">
          Quality can hold this: if an inspection is open against the order, the receipt is
          refused until it is completed, and a rejected lot cannot be received at all.
        </p>
      </form>
    </Modal>
  );
}
