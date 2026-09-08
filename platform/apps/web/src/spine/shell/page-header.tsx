"use client";

import type { ReactNode } from "react";
import { pageSummary, plainTitle } from "../ui/plain-language";

/**
 * The header every screen starts with: what you are looking at, and the facts that qualify
 * it.
 *
 * The `subtitle` is not decoration. Most people arriving at these screens have used paper
 * and Tally, and one sentence saying what a screen actually contains — "live balances from
 * the stock ledger; nothing is entered directly" — prevents the most expensive category of
 * misunderstanding, which is someone confidently reading the wrong thing.
 */
export function PageHeader({
  title,
  subtitle,
  meta = [],
  actions,
}: {
  title: string;
  subtitle?: string;
  meta?: ReadonlyArray<{ label: string; value: ReactNode }>;
  actions?: ReactNode;
}): React.JSX.Element {
  const shownTitle = plainTitle(title);
  // MAINDECK's `.mhead` / `.msub`: a 19px title on one line with its actions, the sentence
  // underneath in muted 12px. The actions sit on the title row rather than below it, so the
  // primary action of a screen is always in the same place on every screen.
  return (
    <header className="x-page-header" data-demo-target="screen">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[19px] font-bold tracking-[-0.01em] text-[var(--text-primary)]">
          {shownTitle}
        </h1>
        <span className="flex-1" />
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {subtitle ? (
        <p className="mt-1 text-[12px] leading-[1.5] text-[var(--text-muted)]">
          {pageSummary(title)}
        </p>
      ) : null}
      {meta.length > 0 ? (
        <dl className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1">
          {meta.map((m) => (
            <div key={m.label} className="flex items-baseline gap-1.5">
              <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
                {m.label}
              </dt>
              <dd className="text-[12.5px] font-semibold text-[var(--text-primary)]" data-numeric="">
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  );
}
