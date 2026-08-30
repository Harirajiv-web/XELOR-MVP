"use client";

import { ChevronRight, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * One disclosure pattern for secondary information throughout ONYX.
 *
 * The title tells people what they will reveal before they click. Native `<details>` keeps
 * it keyboard accessible, remembers no surprising global state and works without JavaScript.
 */
export function Disclosure({
  title,
  hint,
  children,
  defaultOpen = false,
  className,
  icon = true,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  icon?: boolean;
}): React.JSX.Element {
  return (
    <details
      open={defaultOpen || undefined}
      className={cn(
        "group/disclosure rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface)]",
        className,
      )}
    >
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] [&::-webkit-details-marker]:hidden">
        {icon ? <Info className="h-3.5 w-3.5 shrink-0 text-[var(--brand)]" aria-hidden /> : null}
        <span>{title}</span>
        {hint ? (
          <span className="min-w-0 flex-1 truncate text-[11px] font-normal text-[var(--text-muted)]">
            {hint}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform group-open/disclosure:rotate-90"
          aria-hidden
        />
      </summary>
      <div className="border-t border-[var(--border-subtle)] px-3 py-3 text-[12px] leading-5 text-[var(--text-secondary)]">
        {children}
      </div>
    </details>
  );
}
