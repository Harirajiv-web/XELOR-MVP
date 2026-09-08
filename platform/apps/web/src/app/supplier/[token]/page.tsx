"use client";

import { use, useCallback, useEffect, useState } from "react";

/**
 * THE SUPPLIER'S PAGE — everything a workshop sees, and the only thing they ever see.
 *
 * Deliberately OUTSIDE the `(app)` route group, so it inherits no sidebar, no topbar, no
 * module tree and no session. A supplier is not a user of this ERP and must never be shown
 * one: the page has no navigation at all, because there is nowhere else for them to go.
 *
 * Designed phone-first, because that is where it will actually be opened — from a WhatsApp
 * message, standing next to a machine, on a mid-range Android over patchy signal. Which
 * drives every choice here:
 *
 *   THE REQUEST IS READ-ONLY AND ON TOP. What, how many, by when. If they cannot quote, they
 *   close the page and we have wasted five seconds of theirs, not five minutes.
 *
 *   ONE REQUIRED FIELD. Price. Everything else is optional, because a form that demands nine
 *   values from somebody holding a phone in a workshop is a form that gets abandoned, and an
 *   abandoned form is a quote we never received.
 *
 *   THE TOTAL IS COMPUTED IN FRONT OF THEM. A supplier who cannot see what the buyer will
 *   compare has been asked to bid blind.
 *
 *   NO ACCOUNT, EVER. The link is the identity. There is no password to forget, and nothing
 *   on this page asks them to create one.
 *
 * ON THE FIXED COLOURS, which break this repository's usual rule on purpose: every ERP screen
 * uses theme tokens so it follows the viewer's light/dark choice. This page has no viewer with
 * a choice — it is opened from a WhatsApp message by somebody who has never seen this product
 * and never will again, and it must look identical in every screenshot, on every phone, to
 * everyone. So it commits to one light appearance and states it here, rather than inheriting a
 * theme that has no meaning outside the application shell. Do not "fix" this to tokens.
 */

interface CardPayload {
  buyerName?: string;
  rfqNo?: string;
  itemLabel?: string;
  qty?: string;
  uom?: string;
  needDate?: string;
  quoteDeadline?: string;
  drawingRev?: string | null;
  deliveryPlant?: string;
  notes?: string | null;
}

interface InviteView {
  supplierName: string;
  contactName: string | null;
  card: CardPayload;
  expiresAt: string;
  state: string;
  submitted: { unitPrice: string; landedCost: string; promisedDate: string | null; submittedAt: string } | null;
}

/**
 * SAME-ORIGIN, deliberately. `next.config.ts` rewrites `/api/v1/*` to the API, so the browser
 * never makes a cross-origin request and CORS is not part of the problem at all. Calling the
 * API on its own origin from here fails in a browser even though it works from curl, which is
 * the kind of difference a health check does not catch.
 */
const API = "";

const money = (n: number): string =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "300.000" reads like a machine wrote it. A supplier is quoting for 300. */
const tidyQty = (q?: string): string => (q ? String(Number(q)) : "");

const niceDate = (iso?: string | null): string => {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export default function SupplierQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}): React.JSX.Element {
  const { token } = use(params);
  const [invite, setInvite] = useState<InviteView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [unitPrice, setUnitPrice] = useState("");
  const [tooling, setTooling] = useState("");
  const [freight, setFreight] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/v1/supplier/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error?.message ?? "This link does not work.");
        return body as InviteView;
      })
      .then((v) => {
        if (!alive) return;
        setInvite(v);
        if (v.submitted) setSent(true);
      })
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [token]);

  const num = (s: string): number => {
    const n = Number(s.trim());
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const price = num(unitPrice);
  const landed = price + num(tooling) + num(freight);
  const late =
    promisedDate !== "" && invite?.card.needDate ? promisedDate > invite.card.needDate : false;

  const submit = useCallback(async () => {
    if (price <= 0 || sending) return;
    setSending(true);
    setFailure(null);
    try {
      const r = await fetch(`${API}/api/v1/supplier/${encodeURIComponent(token)}/quote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unitPrice: price,
          ...(num(tooling) ? { toolingCost: num(tooling) } : {}),
          ...(num(freight) ? { freightCost: num(freight) } : {}),
          ...(promisedDate ? { promisedDate } : {}),
          ...(note.trim() ? { supplierNote: note.trim() } : {}),
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error?.message ?? "Your price could not be sent.");
      setSent(true);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Your price could not be sent.");
    } finally {
      setSending(false);
    }
  }, [price, sending, token, tooling, freight, promisedDate, note]);

  if (loadError) {
    return (
      <Shell>
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-lg font-semibold text-slate-900">This link does not work</p>
          <p className="mt-2 text-sm text-slate-600">{loadError}</p>
          <p className="mt-4 text-xs text-slate-500">
            Invitation links expire. Ask the buyer to send you a new one.
          </p>
        </div>
      </Shell>
    );
  }

  if (!invite) {
    return (
      <Shell>
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-500">Opening the request…</p>
        </div>
      </Shell>
    );
  }

  const c = invite.card;

  return (
    <Shell>
      {/* The request. Read-only, and first — the decision to quote is made here. */}
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <header className="bg-[#0b3b2e] px-5 py-4 text-white">
          <p className="text-[11px] uppercase tracking-wider opacity-80">Request for quotation</p>
          <h1 className="mt-0.5 text-lg font-semibold leading-snug">{c.itemLabel ?? "Material request"}</h1>
          <p className="mt-1 text-[13px] opacity-90">
            from {c.buyerName ?? "the buyer"} · {c.rfqNo}
          </p>
        </header>

        <dl className="grid grid-cols-2 gap-px bg-slate-200">
          <Fact label="Quantity" value={`${tidyQty(c.qty)} ${c.uom ?? ""}`} strong />
          <Fact label="Needed by" value={niceDate(c.needDate)} strong />
          <Fact label="Drawing revision" value={c.drawingRev ?? "Not specified"} />
          <Fact label="Deliver to" value={c.deliveryPlant ?? "—"} />
        </dl>

        {c.notes ? (
          <p className="border-t border-slate-200 bg-amber-50 px-5 py-3 text-[13px] leading-relaxed text-amber-900">
            {c.notes}
          </p>
        ) : null}
        <p className="border-t border-slate-200 px-5 py-3 text-[12px] text-slate-500">
          Please reply by <b className="text-slate-700">{niceDate(c.quoteDeadline)}</b>.
        </p>
      </section>

      {sent ? (
        <section className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-2xl">✓</div>
          <p className="mt-3 text-lg font-semibold text-slate-900">Your price has been sent</p>
          <p className="mt-1 text-sm text-slate-600">
            {invite.supplierName} — {c.buyerName ?? "the buyer"} can see it now and will be in touch.
          </p>
          {invite.submitted ? (
            <p className="mt-3 text-[13px] text-slate-500">
              You quoted <b className="text-slate-800">₹{invite.submitted.landedCost}</b> landed
              {invite.submitted.promisedDate ? `, delivering ${niceDate(invite.submitted.promisedDate)}` : ""}.
            </p>
          ) : (
            <p className="mt-3 text-[13px] text-slate-500">
              You quoted <b className="text-slate-800">{money(landed)}</b> landed
              {promisedDate ? `, delivering ${niceDate(promisedDate)}` : ""}.
            </p>
          )}
          <p className="mt-4 text-xs text-slate-400">You can close this page.</p>
        </section>
      ) : (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Send your price</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Only the price is required. No account, no sign-up.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <Field
              label="Price per piece"
              required
              prefix="₹"
              value={unitPrice}
              onChange={setUnitPrice}
              hint={c.qty ? `for ${tidyQty(c.qty)} ${c.uom ?? "pieces"}` : undefined}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tooling (one-off)" prefix="₹" value={tooling} onChange={setTooling} />
              <Field label="Freight" prefix="₹" value={freight} onChange={setFreight} />
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-slate-700">
                When can you deliver?
              </span>
              <input
                type="date"
                value={promisedDate}
                onChange={(e) => setPromisedDate(e.target.value)}
                className="h-12 rounded-xl border border-slate-300 px-3 text-[15px] text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
              {/* Said plainly, and it does not block them. A supplier who can only make a late
                  date should still answer — the buyer would rather know than guess. */}
              {late ? (
                <span className="text-[12px] text-amber-700">
                  That is after the {niceDate(c.needDate)} they need it. You can still send it —
                  they may split the order or move the date.
                </span>
              ) : null}
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-slate-700">Anything they should know</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Material grade, minimum order, certification…"
                className="rounded-xl border border-slate-300 p-3 text-[15px] text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </label>
          </div>

          {/* What the buyer will actually compare, shown before they commit to it. */}
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-slate-600">Total landed price</span>
              <span className="text-xl font-semibold text-slate-900">{money(landed)}</span>
            </div>
            <p className="mt-1 text-[12px] text-slate-500">
              Price plus tooling and freight — this is the figure the buyer compares.
            </p>
          </div>

          {failure ? (
            <p className="mt-3 rounded-xl bg-red-50 p-3 text-[13px] text-red-700">{failure}</p>
          ) : null}

          <button
            type="button"
            onClick={submit}
            disabled={price <= 0 || sending}
            className="mt-4 h-14 w-full rounded-xl bg-emerald-700 text-[16px] font-semibold text-white disabled:bg-slate-300"
          >
            {sending ? "Sending…" : "Send my price"}
          </button>
          <p className="mt-2 text-center text-[12px] text-slate-400">
            Sent securely to {c.buyerName ?? "the buyer"}. Your price is not shown to other suppliers.
          </p>
        </section>
      )}
    </Shell>
  );
}

/**
 * Phone-width by default and centred on a desktop, rather than a layout that stretches to
 * 1400px. A quotation form the width of a monitor is harder to read, not easier.
 */
function Shell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6">
      <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-4">
        {children}
        <p className="pb-4 text-center text-[11px] text-slate-400">
          Sent through XELOR Source · you were invited to this request
        </p>
      </div>
    </main>
  );
}

function Fact({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}): React.JSX.Element {
  return (
    <div className="bg-white px-5 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={strong ? "text-[15px] font-semibold text-slate-900" : "text-[14px] text-slate-700"}>
        {value}
      </dd>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  prefix,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  prefix?: string;
  hint?: string;
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      <div className="flex items-center rounded-xl border border-slate-300 focus-within:border-emerald-600">
        {prefix ? <span className="pl-3 text-[15px] text-slate-500">{prefix}</span> : null}
        <input
          // `decimal` rather than `number`: it brings up the numeric keypad on a phone
          // without the spinner arrows a thumb hits by accident.
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-full rounded-xl bg-transparent px-3 text-[15px] text-slate-900 focus:outline-none"
        />
      </div>
      {hint ? <span className="text-[12px] text-slate-500">{hint}</span> : null}
    </label>
  );
}
