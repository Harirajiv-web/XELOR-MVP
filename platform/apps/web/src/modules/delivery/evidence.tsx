"use client";

import type { ReactNode } from "react";
import { FileWarning, Info, ShieldAlert, TrendingUp } from "lucide-react";
import { notStored } from "./api";

/**
 * THE FOUR THINGS EVERY SCREEN IN THIS MODULE HAS TO BE ABLE TO SAY.
 *
 * This package is the easiest one in the product to oversell, and the reason is structural
 * rather than a matter of tone: a delivery service is mostly people, so almost everything
 * worth showing about it is a COMMITMENT rather than a RECORD. A commitment rendered as a
 * tidy panel is visually indistinguishable from a commitment that has been met, and a
 * reader has no way to tell which they are looking at unless the screen tells them.
 *
 * So the distinction is a component rather than a convention:
 *
 *   <Recorded>   this came out of a table; here is which one, so you can check it
 *   <NotStored>  this is a structure to fill in; nothing here is saved anywhere
 *   <Bound>      this names a limit of what the software can do, permanently
 *   <NeverClaim> this is a sentence nobody may say on the strength of this screen
 *
 * A screen that uses a `<div>` where one of these belongs is a screen that will, eventually
 * and by accident, present a template as a fact. That is the specific failure this file
 * exists to make hard.
 */

/**
 * This came from a record. Name the source so the claim can be checked.
 *
 * `source` is the endpoint or the table, written plainly — "read from
 * /integration/connections" — not a vague "live data" badge. The point of provenance is
 * that somebody can go and look.
 */
export function Recorded({
  source,
  children,
}: {
  source: string;
  children?: ReactNode;
}): React.JSX.Element {
  return (
    <p className="flex items-start gap-1.5 text-[11px] leading-[1.6] text-[var(--text-muted)]">
      <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      <span>
        <span className="font-semibold text-[var(--text-secondary)]">Recorded · </span>
        {source}
        {children ? <> {children}</> : null}
      </span>
    </p>
  );
}

/**
 * Nothing on this panel is saved. The most important component in the module.
 *
 * Amber rather than red on purpose: a template is not an error, it is the correct output of
 * a system that has honestly not been given a table for this. Red would teach people to
 * dismiss it, and this is the one notice they must never learn to dismiss.
 */
export function NotStored({
  what,
  where,
  children,
}: {
  /** The thing that is not stored: "The stop criteria below". */
  what: string;
  /** Where the binding record actually lives: "the signed engagement letter". */
  where: string;
  children?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="x-notice" data-tone="warning">
      <FileWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        {/* The sentence itself comes from `notStored()` so there is exactly one copy of it.
            Written freehand per screen it would be softened by whoever edits last, and
            softening is the direction the pressure always runs in a services package. */}
        <p>
          <strong>Not stored.</strong> {notStored(what, where)}
        </p>
        {children ? <div className="mt-1.5">{children}</div> : null}
      </div>
    </div>
  );
}

/** A permanent limit of the software. Stated where it would otherwise be discovered late. */
export function Bound({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="x-notice">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

/**
 * A sentence nobody may say on the strength of this screen.
 *
 * Written as the forbidden claim itself rather than as guidance, because "be careful about
 * SLA language" is advice and "we do not have a 4-hour response SLA" is a fact somebody can
 * repeat to a customer. The second one survives being read quickly.
 */
export function NeverClaim({
  claim,
  because,
}: {
  claim: string;
  because: string;
}): React.JSX.Element {
  return (
    <div className="x-notice" data-tone="error">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p>
          <strong>Do not say “{claim}”.</strong> {because}
        </p>
      </div>
    </div>
  );
}

/** A panel. The module's only container, so every screen reads the same way. */
export function Panel({
  title,
  lede,
  actions,
  children,
}: {
  title: string;
  lede?: string;
  actions?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  const headingId = `delivery-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className="x-home-panel" aria-labelledby={headingId}>
      <div className="x-home-panel-head flex-wrap gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="x-section-heading">
            {title}
          </h2>
          {lede ? <p>{lede}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

/** One headline figure with the sentence that says what it is out of. */
export function Stat({
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
        <TrendingUp className="h-4 w-4" aria-hidden />
      </span>
      <strong className="x-stat-value">{value}</strong>
      <p className="x-stat-hint">{hint}</p>
    </div>
  );
}

/**
 * A field of a structured artefact: the label, the instruction, and the blank.
 *
 * The blank is deliberately a blank rather than an input. An input invites typing, typing
 * invites the belief that something was saved, and nothing here is saved. What this is for
 * is to be read out in a meeting and written down somewhere that is.
 */
export function Field({
  label,
  instruction,
  children,
}: {
  label: string;
  instruction: string;
  children?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="rounded-[var(--radius-control)] border border-dashed border-[var(--border-input)] bg-[var(--surface-sunken)] p-3">
      <p className="text-[12px] font-semibold text-[var(--text-primary)]">{label}</p>
      <p className="mt-1 text-[11.5px] leading-[1.6] text-[var(--text-secondary)]">{instruction}</p>
      {children ? <div className="mt-2 text-[11.5px] leading-[1.6] text-[var(--text-muted)]">{children}</div> : null}
    </div>
  );
}

/** A label/value pair, for facts read out of a record. */
export function Fact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="text-[12.5px] leading-[1.5] text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}
