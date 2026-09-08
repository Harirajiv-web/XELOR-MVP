"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Package, Truck } from "lucide-react";

/**
 * THE DESK'S VISUAL LANGUAGE.
 *
 * Every card on this portal is built from these pieces, so a number means the same thing on
 * the dashboard, the request card and the detail view. The rules the research kept pointing
 * at, applied literally:
 *
 *   SIZE IS RANK. The landed cost is the biggest thing on a quote card because it is the
 *   thing being compared. Everything else is support.
 *
 *   COLOUR IS URGENCY, NEVER DECORATION. Amber and red appear only where somebody has to act
 *   or has run out of time. A card with no colour is a card with no problem, and that is the
 *   fastest thing a page can say.
 *
 *   A NUMBER CARRIES ITS COMPARISON. "₹15,920" alone is not a fact a buyer can use; "₹15,920,
 *   ₹12,920 below the highest answer" is. Every money figure here can carry its delta.
 */

export const inr = (v: string | number): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};

export const inrExact = (v: string | number): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/** "300.000" is the column talking; a buyer is sourcing 300. */
export const qty = (v: string): string => (Number.isFinite(Number(v)) ? String(Number(v)) : v);

export const shortDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

/** "in 9 days" / "3 days ago" / "today" — a date a person can act on without arithmetic. */
export const relativeDays = (days: number): string => {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
};

export type Tone = "neutral" | "good" | "warn" | "bad" | "brand";

const TONE_CHIP: Record<Tone, string> = {
  neutral: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  good: "bg-[var(--good-bg)] text-[var(--good-fg)]",
  warn: "bg-[var(--warn-soft)] text-[var(--warn-ink)]",
  bad: "bg-[var(--bad-soft)] text-[var(--bad-ink)]",
  brand: "bg-[var(--brand-soft)] text-[var(--brand)]",
};

export function Chip({
  tone = "neutral",
  children,
  icon: Icon,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: typeof Package;
}): React.JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_CHIP[tone]}`}
    >
      {Icon ? <Icon className="h-3 w-3" aria-hidden /> : null}
      {children}
    </span>
  );
}

/** A headline figure. `sub` is where the comparison lives — never leave a number alone. */
export function Kpi({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}): React.JSX.Element {
  const accent: Record<Tone, string> = {
    neutral: "text-[var(--text-primary)]",
    good: "text-[var(--good-fg)]",
    warn: "text-[var(--warn-ink)]",
    bad: "text-[var(--bad-ink)]",
    brand: "text-[var(--brand)]",
  };
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className={`mt-0.5 text-[26px] font-semibold leading-none ${accent[tone]}`}>{value}</p>
      {sub ? <p className="mt-1.5 text-[12px] text-[var(--text-secondary)]">{sub}</p> : null}
    </div>
  );
}

/**
 * How many invited suppliers have answered. A bar rather than "2 of 5" alone, because the
 * shape of a thin response is the thing a buyer needs to notice without reading.
 */
export function ResponseBar({
  invited,
  responded,
}: {
  invited: number;
  responded: number;
}): React.JSX.Element {
  const pct = invited > 0 ? Math.min(100, Math.round((responded / invited) * 100)) : 0;
  const tone = responded === 0 ? "bad" : responded < invited ? "warn" : "good";
  const fill: Record<string, string> = {
    bad: "bg-[var(--bad-ink)]",
    warn: "bg-[var(--warn-ink)]",
    good: "bg-[var(--good-fg)]",
  };
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-[var(--text-muted)]">Answers</span>
        <span className="text-[12px] font-medium text-[var(--text-primary)]">
          {responded} of {invited}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        <div className={`h-full rounded-full ${fill[tone]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * THE MATERIAL, as the thing being bought rather than a row of fields.
 *
 * Part code, name, quantity and the date it is needed, in that order — which is the order a
 * buyer reads them in and the order a supplier is asked to price them.
 */
export function MaterialBlock({
  itemCode,
  itemName,
  quantity,
  uom,
  drawingRev,
  needDate,
  daysToNeed,
  compact,
}: {
  itemCode: string | null;
  itemName: string | null;
  quantity: string;
  uom: string;
  drawingRev: string | null;
  needDate: string;
  daysToNeed: number;
  compact?: boolean;
}): React.JSX.Element {
  const urgent = daysToNeed <= 7;
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
        <Package className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-[var(--font-mono)] text-[13px] font-semibold text-[var(--text-primary)]">
          {itemCode ?? "—"}
        </p>
        <p className="truncate text-[12px] text-[var(--text-secondary)]">{itemName ?? ""}</p>
        {!compact ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Chip tone="brand">
              {qty(quantity)} {uom}
            </Chip>
            {drawingRev ? <Chip>Rev {drawingRev}</Chip> : null}
            <Chip tone={urgent ? "warn" : "neutral"} icon={CalendarClock}>
              {shortDate(needDate)} · {relativeDays(daysToNeed)}
            </Chip>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A QUOTE, as a card.
 *
 * The landed cost is the biggest element because it is what is being compared. Directly
 * beneath it is the one fact that can make the price irrelevant: whether the promise beats
 * the need date. A card whose delivery fails is dimmed and struck — the buyer should not have
 * to read a chip to know they cannot use it.
 */
export function QuoteCard({
  supplierName,
  landedCost,
  unitPrice,
  toolingCost,
  freightCost,
  promisedDate,
  leadTimeDays,
  meetsNeedDate,
  technicalGate,
  gateNote,
  supplierNote,
  onRequest,
  awarded,
  savingsVsHighest,
  rank,
  actions,
}: {
  supplierName: string;
  landedCost: string;
  unitPrice: string;
  toolingCost: string;
  freightCost: string;
  promisedDate: string | null;
  leadTimeDays: number | null;
  meetsNeedDate: boolean | null;
  technicalGate: string | null;
  gateNote: string | null;
  supplierNote: string | null;
  onRequest: boolean;
  awarded: boolean;
  savingsVsHighest: string | null;
  rank?: number;
  actions?: ReactNode;
}): React.JSX.Element {
  const late = meetsNeedDate === false;
  const failed = technicalGate === "fail";
  const unusable = late || failed;

  return (
    <article
      className={`flex flex-col rounded-xl border bg-[var(--surface)] p-4 ${
        awarded
          ? "border-[var(--good-fg)] ring-1 ring-[var(--good-fg)]"
          : unusable
            ? "border-[var(--border)] opacity-65"
            : "border-[var(--border)]"
      }`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-sunken)] text-[13px] font-semibold text-[var(--text-secondary)]">
            {supplierName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p
              className={`truncate text-[14px] font-semibold text-[var(--text-primary)] ${
                unusable ? "line-through" : ""
              }`}
            >
              {supplierName}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {awarded ? (
                <Chip tone="good" icon={CheckCircle2}>
                  Awarded
                </Chip>
              ) : null}
              {onRequest ? (
                <Chip tone="neutral">On the request</Chip>
              ) : (
                // A price that arrived from outside the building and has not been accepted
                // into the buyer's own books yet. It can be compared but not awarded.
                <Chip tone="brand">From the network</Chip>
              )}
              {technicalGate && technicalGate !== "pending" ? (
                <Chip
                  tone={
                    technicalGate === "pass" ? "good" : technicalGate === "conditional" ? "warn" : "bad"
                  }
                >
                  {technicalGate === "pass"
                    ? "Meets spec"
                    : technicalGate === "conditional"
                      ? "Conditional"
                      : "Failed spec"}
                </Chip>
              ) : null}
            </div>
          </div>
        </div>
        {rank ? (
          <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]">
            #{rank}
          </span>
        ) : null}
      </header>

      <div className="mt-3">
        <p className="text-[24px] font-semibold leading-none text-[var(--text-primary)]">
          {inr(landedCost)}
        </p>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          landed · {inr(unitPrice)}/pc
          {Number(toolingCost) > 0 ? ` + ${inr(toolingCost)} tooling` : ""}
          {Number(freightCost) > 0 ? ` + ${inr(freightCost)} freight` : ""}
        </p>
        {savingsVsHighest && Number(savingsVsHighest) > 0 ? (
          <p className="mt-1 text-[12px] text-[var(--good-fg)]">
            {inr(savingsVsHighest)} below the highest answer
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-1.5 border-t border-[var(--border-subtle)] pt-3">
        <Truck className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
        {promisedDate ? (
          late ? (
            <span className="text-[12px] font-medium text-[var(--bad-ink)]">
              {shortDate(promisedDate)} — after the need date
            </span>
          ) : (
            <span className="text-[12px] text-[var(--text-secondary)]">
              {shortDate(promisedDate)}
              {leadTimeDays ? ` · ${leadTimeDays} day lead` : ""}
            </span>
          )
        ) : (
          <span className="text-[12px] text-[var(--text-muted)]">no delivery date given</span>
        )}
      </div>

      {gateNote || supplierNote ? (
        <p className="mt-2 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-2 text-[12px] italic leading-relaxed text-[var(--text-secondary)]">
          “{gateNote ?? supplierNote}”
        </p>
      ) : null}

      {unusable ? (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-[var(--bad-ink)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {failed
            ? "Failed the specification — cannot be awarded at any price."
            : "Cannot deliver before the material is needed."}
        </p>
      ) : null}

      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </article>
  );
}

/** The lane a request sits in, and what that lane is called in plain words. */
export const STAGE_LABEL: Record<string, string> = {
  draft: "Not sent yet",
  out_to_market: "Waiting for answers",
  evaluating: "Answers in — deciding",
  awarded: "Awarded",
  closed: "Closed",
};

export const STAGE_TONE: Record<string, Tone> = {
  draft: "neutral",
  out_to_market: "warn",
  evaluating: "brand",
  awarded: "good",
  closed: "neutral",
};
