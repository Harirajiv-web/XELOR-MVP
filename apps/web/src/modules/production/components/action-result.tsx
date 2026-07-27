"use client";

import { CircleCheckBig, X } from "lucide-react";
import { qty } from "@spine/format";
import type { ProductionActionResult } from "../api";

/**
 * WHAT ACTUALLY HAPPENED, after the fact — the receipt.
 *
 * Both endpoints answer with the stock movements they caused, and the balance each item was
 * left at. Printing them is the difference between "it said it worked" and "here is the row
 * that moved and what is on the shelf now". On a shop floor that is what stops somebody
 * walking to the stores to check, and it is what makes a wrong posting visible in seconds
 * rather than at the next stock count.
 *
 * These figures are RENDERED, not computed: they are the ledger's own answer, echoed back.
 * This module never writes stock and never builds a movement (DECISIONS-V2 §5.6).
 */
export function ActionResultStrip({
  kind,
  result,
  nameItem,
  nameWarehouse,
  onDismiss,
}: {
  kind: "issue" | "complete";
  result: ProductionActionResult;
  /** Item id → what the drawing calls it, and in what unit. */
  nameItem: (itemId: string) => { code: string; uom: string | null };
  nameWarehouse: (warehouseId: string) => string;
  onDismiss: () => void;
}): React.JSX.Element {
  const movements = result.stockMovements;
  const status = result.order.status;

  return (
    <div
      role="status"
      className="flex gap-2.5 rounded-[var(--radius-card)] border border-[var(--ok)] bg-[var(--ok-soft)] p-3 text-[13px] leading-5 text-[var(--ok-ink)]"
    >
      <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {kind === "issue"
            ? `Components issued against ${result.order.orderNo}`
            : `Output received against ${result.order.orderNo}`}
        </p>
        <p className="mt-0.5">
          {kind === "issue"
            ? `${movements.length} ${movements.length === 1 ? "line" : "lines"} posted to the stock ledger.`
            : `Produced so far: ${result.order.producedQty} of ${result.order.qtyToProduce}.`}{" "}
          The order is now{" "}
          <b>{status === "in_progress" ? "In progress" : status === "completed" ? "Completed" : status}</b>.
        </p>

        {movements.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1">
            {movements.map((m, i) => {
              const item = nameItem(m.itemId);
              return (
                <li
                  key={`${m.itemId}-${m.warehouseId}-${i}`}
                  className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]"
                  data-numeric=""
                >
                  <span className="font-semibold">{item.code}</span>
                  <span className="tabular-nums">
                    {m.delta < 0 ? "−" : "+"}
                    {qty(Math.abs(m.delta), item.uom)}
                  </span>
                  <span className="opacity-80">
                    in {nameWarehouse(m.warehouseId)} — {qty(m.balanceAfter, item.uom)} on hand
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-control)] transition-colors hover:bg-[var(--surface)]"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
