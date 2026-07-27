"use client";

import type { ReactNode } from "react";

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
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[20px] font-bold leading-7 tracking-[-0.01em] text-[var(--text-primary)]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
            {subtitle}
          </p>
        ) : null}
        {meta.length > 0 ? (
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
            {meta.map((m) => (
              <div key={m.label} className="flex items-baseline gap-1.5">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
                  {m.label}
                </dt>
                <dd className="text-[13px] text-[var(--text-primary)]" data-numeric="">
                  {m.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
