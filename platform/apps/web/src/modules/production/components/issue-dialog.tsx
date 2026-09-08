"use client";

import { useRef, useState } from "react";
import { Loader2, PackageMinus } from "lucide-react";
import { api } from "@spine/api/client";
import { qty } from "@spine/format";
import type { ProductionActionResult, ProductionOrderDetail } from "../api";
import { outstanding, productionApi } from "../api";
import { ActionError } from "./action-error";
import { useActionKey } from "./idempotency";
import { Modal } from "./modal";

/**
 * ISSUE COMPONENTS — the confirmation, before anything moves.
 *
 * `POST /production/orders/:id/issue` takes NO BODY. It consumes every outstanding component
 * line, out of the order's source warehouse, in one transaction. That makes this dialog's
 * only real job the one thing a shop floor most needs and most products skip: showing what is
 * about to happen, line by line, with units, BEFORE asking anybody to confirm.
 *
 * A supervisor who taps "Issue" and watches material disappear from a store they did not
 * expect has learned that this screen cannot be trusted, and they are right.
 *
 * ALL OR NOTHING is said explicitly, because it is genuinely reassuring and it is genuinely
 * true: if one line is short, the whole posting is refused and no material moves. There is no
 * half-issued order to unpick afterwards.
 *
 * This UI does not build a stock movement and does not call a stock endpoint. Issuing reaches
 * the ledger through Inventory's single write path, inside Production's own transaction,
 * server-side (DECISIONS-V2 §5.6).
 */
export function IssueComponentsDialog({
  order,
  sourceWarehouse,
  onClose,
  onIssued,
}: {
  order: ProductionOrderDetail;
  /** "RM-01 — Raw material store", or the raw id if the warehouse master is unreadable. */
  sourceWarehouse: string;
  onClose: () => void;
  onIssued: (result: ProductionActionResult) => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const inFlight = useRef(false);
  const actionKey = useActionKey();

  const lines = order.components
    .map((c) => ({ ...c, left: outstanding(c.requiredQty, c.issuedQty) }))
    .filter((c) => c.left > 0);

  async function submit(): Promise<void> {
    // Belt and braces: the button is disabled while in flight, and a double-fire from a
    // touchscreen that reports two taps still cannot get past this.
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<ProductionActionResult>(
        productionApi.issuePath(order.id),
        undefined,
        // Stable across retries. Issuing twice because a tablet lost signal is real material
        // gone from the ledger — see `useActionKey`.
        { idempotencyKey: actionKey.keyFor(`issue:${order.id}`) },
      );
      actionKey.reset();
      onIssued(result);
    } catch (e) {
      setError(e);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Issue components — ${order.orderNo}`}
      subtitle="Consumes every outstanding line in one posting. Check the quantities before confirming."
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn btn-ghost min-h-[42px]" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-pri min-h-[42px] px-5"
            onClick={() => void submit()}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <PackageMinus className="h-4 w-4" aria-hidden />
            )}
            {/* The button says what it does, not "Confirm". A verb plus a count plus a
                place is a sentence somebody can check before their finger lands. */}
            {busy
              ? "Issuing…"
              : lines.length === 0
                ? "Start the order"
                : `Issue ${lines.length} ${lines.length === 1 ? "line" : "lines"}`}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ActionError error={error} />

        <p className="text-[13px] leading-[1.55] text-[var(--text-secondary)]">
          {lines.length > 0 ? (
            <>
              These{" "}
              <b className="text-[var(--text-primary)]">
                {lines.length} {lines.length === 1 ? "line" : "lines"}
              </b>{" "}
              come out of{" "}
              <b className="text-[var(--text-primary)]">{sourceWarehouse}</b> and the order moves
              to <b className="text-[var(--text-primary)]">In progress</b>.
            </>
          ) : (
            <>
              Every component on this order is already issued. Confirming only moves it to{" "}
              <b className="text-[var(--text-primary)]">In progress</b> — no material leaves{" "}
              {sourceWarehouse}.
            </>
          )}
        </p>

        {lines.length > 0 ? (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="grid-table">
                <caption className="sr-only">
                  Components about to be issued against {order.orderNo}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Component</th>
                    <th scope="col" className="text-right! w-32">
                      Required
                    </th>
                    <th scope="col" className="text-right! w-32">
                      Issued
                    </th>
                    <th scope="col" className="text-right! w-36">
                      Issuing now
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((c) => (
                    <tr key={c.lineNo}>
                      <td>
                        <div className="min-w-0">
                          <div className="font-semibold text-[var(--text-primary)]">
                            {c.itemCode ?? (
                              <span className="font-[var(--font-mono)] text-[12px]">
                                {c.componentItemId}
                              </span>
                            )}
                          </div>
                          {c.itemName ? (
                            <div className="truncate text-[12px] text-[var(--text-secondary)]">
                              {c.itemName}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="text-right tabular-nums" data-numeric="">
                        {qty(c.requiredQty, c.uom)}
                      </td>
                      <td className="text-right tabular-nums" data-numeric="">
                        {qty(c.issuedQty, c.uom)}
                      </td>
                      <td
                        className="text-right font-semibold tabular-nums text-[var(--text-primary)]"
                        data-numeric=""
                      >
                        {qty(c.left, c.uom)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <p className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2.5 text-[12px] leading-[1.55] text-[var(--text-secondary)]">
          <b className="text-[var(--text-primary)]">All of it, or none of it.</b> If any one line
          is short in {sourceWarehouse}, the whole issue is refused and nothing moves — there is
          no half-issued order to sort out afterwards. This is posted to the stock ledger and
          audited; it cannot be reversed from this screen.
        </p>
      </div>
    </Modal>
  );
}
