"use client";

import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { api } from "@spine/api/client";
import { inr } from "@spine/format";
import { LayerChip } from "@spine/ui/pipeline";

/**
 * TAKE A NEW ORDER — the demo's first step.
 *
 * Mission Control used to open on a list of orders somebody had seeded, which answers "can
 * it run?" and never answers "is this a recording?". This card answers the second question
 * in the only way it can be answered: a presenter types a customer's PO number in front of
 * the room, the order appears in Phase 1's Sales module, and ONYX picks it up and runs the
 * same thirteen steps on it. Nothing downstream changes — to the mission it is simply a
 * confirmed order like any other.
 *
 * WHY SO FEW FIELDS. A real sales order carries a selling GSTIN, a ship-to state, an HSN
 * code, a GST rate, a warehouse and a price. Asking a presenter for those mid-demo would be
 * a form, not a moment. Every one of them is derived by SALES from what it already knows —
 * the price and tax treatment come from what this part last actually sold for — so the four
 * things asked here are the four a person genuinely decides: who, what, how many, by when.
 * The derived price is SHOWN rather than hidden, because a number that appears on a
 * commitment without being seen is how a demo becomes a misrepresentation.
 *
 * The tier is NOT asked here. It is one screen-level control governing whichever way you
 * start, and duplicating it into this card would let the two disagree.
 */

interface OrderableCustomer {
  id: string;
  code: string;
  name: string;
}

interface OrderableItem {
  id: string;
  itemCode: string;
  name: string;
  uom: string;
  /** Null means this part has never been sold, so there are no terms to carry forward. */
  lastRate: number | null;
  lastHsn: string | null;
  lastGstRatePct: number | null;
}

interface Orderable {
  customers: OrderableCustomer[];
  items: OrderableItem[];
}

export interface NewOrderResult {
  order: { id: string; soNo: string; status: string; grandTotal: number };
  mission: { id: string } | null;
  heldReason?: string;
}

/**
 * A plausible next PO number for the chosen customer.
 *
 * Their numbering, not ours — so it is seeded from the customer's code and the current
 * financial year rather than from our own sequence. A presenter can overwrite it; the point
 * is that the field is never empty and never has to be invented under the lights.
 */
function suggestPoNo(customer: OrderableCustomer | undefined, salt: number): string {
  if (!customer) return "";
  const stem = customer.code.replace(/^CUST-/, "");
  return `${stem}/PO/2026/${1400 + salt}`;
}

export function NewOrderForm({
  tier,
  onStarted,
}: {
  tier: string;
  onStarted: (result: NewOrderResult) => void;
}): React.JSX.Element {
  const [choices, setChoices] = useState<Orderable | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("40");
  const [custPoNo, setCustPoNo] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await api.get<{ data: Orderable }>("/fulfilment/orderable");
        if (!live) return;
        setChoices(res.data);
        setCustomerId(res.data.customers[0]?.id ?? "");
        // Default to a part that HAS been sold, so the common path needs no extra typing.
        const sellable = res.data.items.find((i) => i.lastRate !== null) ?? res.data.items[0];
        setItemId(sellable?.id ?? "");
      } catch {
        if (live) setError("Could not load the customers and parts to choose between.");
      }
    })();
    return () => { live = false; };
  }, []);

  const customer = choices?.customers.find((c) => c.id === customerId);
  const item = choices?.items.find((i) => i.id === itemId);

  // Seeded once per customer rather than held in state, so switching customer refreshes the
  // suggestion and typing over it is never undone by an unrelated re-render.
  useEffect(() => {
    setCustPoNo(suggestPoNo(customer, customer ? customer.code.length : 0));
  }, [customer]);

  useEffect(() => {
    if (due) return;
    // Six weeks out: far enough that the plan has something to schedule inside, near enough
    // that the demo's shortages and lead times still bite. A date the presenter can change.
    const d = new Date("2026-08-20T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 42);
    setDue(d.toISOString().slice(0, 10));
  }, [due]);

  const qtyNum = Number(qty);
  const lineValue = useMemo(() => {
    if (!item?.lastRate || !Number.isFinite(qtyNum)) return null;
    const taxable = item.lastRate * qtyNum;
    const gst = taxable * ((item.lastGstRatePct ?? 0) / 100);
    return { taxable, gst, total: taxable + gst };
  }, [item, qtyNum]);

  const noTerms = item !== undefined && item.lastRate === null;
  const canSubmit =
    !busy && !!customerId && !!itemId && !noTerms
    && Number.isFinite(qtyNum) && qtyNum > 0 && custPoNo.trim().length > 0;

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      // Derived from what is being ordered, never from the clock: pressing the button twice
      // must return the first order rather than commit the customer to a second one.
      const key = `new-order-${customerId}-${custPoNo.trim()}`;
      const res = await api.post<{ data: NewOrderResult }>(
        "/fulfilment/orders",
        {
          customerId,
          custPoNo: custPoNo.trim(),
          tier,
          lines: [{ itemId, qty: qtyNum, requestedDeliveryDate: due || undefined }],
        },
        { idempotencyKey: key },
      );
      onStarted(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not raise the order.");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border px-2.5 py-2 text-[13px]";
  const fieldStyle = {
    borderColor: "var(--border-input)",
    background: "var(--surface-data)",
    color: "var(--text-primary)",
  };
  const label = "block text-[11px] font-semibold";
  const labelStyle = { color: "var(--text-muted)" };

  return (
    <section
      className="rounded-2xl border p-4"
      style={{ borderColor: "var(--brand)", background: "var(--surface)" }}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          A customer just sent an order
        </h2>
        <LayerChip layer="phase1" system="Sales · Orders" />
      </div>
      <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
        Type it in. It becomes a real order in Sales, and I start work on it straight away.
      </p>

      {choices === null ? (
        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <div>
              <label className={label} style={labelStyle} htmlFor="no-customer">Customer</label>
              <select id="no-customer" className={`${field} mt-1`} style={fieldStyle}
                value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                {choices.customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} style={labelStyle} htmlFor="no-po">Their order number</label>
              <input id="no-po" className={`${field} mt-1`} style={fieldStyle}
                value={custPoNo} onChange={(e) => setCustPoNo(e.target.value)}
                placeholder="e.g. BAC/PO/2026/1401" />
            </div>
            <div className="sm:col-span-2">
              <label className={label} style={labelStyle} htmlFor="no-item">What they want</label>
              <select id="no-item" className={`${field} mt-1`} style={fieldStyle}
                value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {choices.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.itemCode} — {i.name}{i.lastRate === null ? " (never sold)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} style={labelStyle} htmlFor="no-qty">How many</label>
              <input id="no-qty" type="number" min="1" className={`${field} mt-1`} style={fieldStyle}
                value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div>
              <label className={label} style={labelStyle} htmlFor="no-due">Promised by</label>
              <input id="no-due" type="date" className={`${field} mt-1`} style={fieldStyle}
                value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>

          {/* The derived commercials, shown. A price that lands on a commitment without
              anybody seeing it is the one thing a live demo must not do. */}
          {lineValue && item ? (
            <p className="mt-2.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              At {inr(item.lastRate ?? 0)} each — what this part last sold for — that is{" "}
              <strong style={{ color: "var(--text-primary)" }}>{inr(lineValue.total)}</strong>{" "}
              including {item.lastGstRatePct}% GST.
            </p>
          ) : null}

          {noTerms ? (
            <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px]" style={{ color: "var(--warn-fg)" }}>
              <Icons.TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {item?.itemCode} has never been sold, so there is no price or GST rate to carry
              forward. Pick another part, or raise this one in Sales where the terms can be typed.
            </p>
          ) : null}

          {error ? (
            <p className="mt-2.5 text-[11.5px]" style={{ color: "var(--bad-fg)" }} role="alert">{error}</p>
          ) : null}

          <button type="button" onClick={() => void submit()} disabled={!canSubmit}
            data-testid="new-order-submit"
            className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-bold text-[var(--action-ink)] disabled:opacity-50"
            style={{ background: "var(--action)" }}>
            {busy ? (
              <><Icons.Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Raising the order…</>
            ) : (
              <><Icons.FilePlus2 className="h-4 w-4" aria-hidden /> Take this order and start work</>
            )}
          </button>
        </>
      )}
    </section>
  );
}
