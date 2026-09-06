"use client";

import type { ReactNode } from "react";
import { FlaskConical, Radio, WifiOff } from "lucide-react";

/**
 * The two labels this module exists to keep honest.
 *
 * `Live` may only sit beside a number that came from `readLiveWorld()`. `Illustrative` sits
 * beside everything else. There is no unlabelled figure anywhere in this module, because an
 * unlabelled figure on a prototype screen is read as real by every audience that has just
 * been shown four screens of real ones.
 */

export function Live({ readAt }: { readAt: string }): ReactNode {
  const at = new Date(readAt);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-[var(--good-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--good-fg)]"
      title={`Read from this system at ${at.toLocaleTimeString()}`}
    >
      <Radio className="h-3 w-3" aria-hidden />
      Live
    </span>
  );
}

export function Unavailable({
  label = "Source unavailable",
}: {
  label?: string;
}): ReactNode {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bad-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--bad-ink)]">
      <WifiOff className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

export function Illustrative(): ReactNode {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--warn-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--warn-ink)]">
      <FlaskConical className="h-3 w-3" aria-hidden />
      Illustrative
    </span>
  );
}

/** The banner every screen in this module opens with. Not dismissible, on purpose. */
export function PrototypeBanner({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <div className="rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)] p-4">
      <p className="text-sm font-semibold text-[var(--warn-ink)]">
        Designed, not built
      </p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{children}</p>
    </div>
  );
}

export function Screen({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          {title}
        </h1>
        <p className="max-w-3xl text-sm text-[var(--text-secondary)]">{lead}</p>
      </header>
      {children}
    </div>
  );
}

export function Card({
  title,
  note,
  children,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
        {note}
      </div>
      {children}
    </section>
  );
}

/** A left-to-right chain of stages. Wraps on a narrow screen rather than scrolling sideways. */
export function Chain({
  steps,
}: {
  steps: readonly { label: string; state: "today" | "proposed" | "paper" }[];
}): ReactNode {
  const tone = {
    today: "border-[var(--good-fg)] bg-[var(--good-bg)] text-[var(--good-fg)]",
    proposed:
      "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]",
    paper:
      "border-[var(--border-strong)] bg-[var(--surface-sunken)] text-[var(--text-muted)]",
  } as const;

  return (
    <ol className="flex flex-wrap items-stretch gap-2">
      {steps.map((s) => (
        <li
          key={s.label}
          className={`flex min-w-[9rem] flex-1 flex-col justify-center rounded-md border px-3 py-2 text-xs font-medium ${tone[s.state]}`}
        >
          {s.label}
          <span className="mt-1 text-[10px] font-normal opacity-80">
            {s.state === "today"
              ? "runs today"
              : s.state === "proposed"
                ? "proposed"
                : "still manual"}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A phone-shaped frame, so a mobile concept is never mistaken for a desktop screen. */
export function Phone({
  chrome,
  title,
  subtitle,
  children,
}: {
  chrome: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="w-full max-w-[20rem] overflow-hidden rounded-[1.75rem] border-4 border-[var(--border-strong)] bg-[var(--surface)]">
      <p className="bg-[var(--surface-sunken)] px-3 py-1.5 text-center text-[10px] text-[var(--text-muted)]">
        {chrome}
      </p>
      <div className="bg-[var(--brand)] px-4 py-3">
        <p className="text-sm font-semibold text-[var(--text-on-brand)]">
          {title}
        </p>
        <p className="text-[11px] text-[var(--text-on-brand)] opacity-90">
          {subtitle}
        </p>
      </div>
      <div className="flex flex-col gap-3 p-4">{children}</div>
      <p className="border-t border-[var(--border)] px-3 py-2 text-center text-[10px] tracking-wide text-[var(--text-muted)]">
        HOME · WORK · SCAN · ALERTS · MORE
      </p>
    </div>
  );
}

export function Tile({
  value,
  label,
  tone = "plain",
}: {
  value: string;
  label: string;
  tone?: "plain" | "warn" | "bad";
}): ReactNode {
  const cls = {
    plain: "text-[var(--text-primary)]",
    warn: "text-[var(--warn-ink)]",
    bad: "text-[var(--bad-ink)]",
  } as const;
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2">
      <p className={`text-lg font-semibold ${cls[tone]}`}>{value}</p>
      <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
    </div>
  );
}
