"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A MODAL — built here because the spine has none yet.
 *
 * NOTE FOR HEXA: this belongs in `src/spine/ui/` once a second module needs it. It lives in
 * Production only so that shipping the work-order actions did not require editing the spine
 * while four other departments were writing into it. Nothing in it is Production-specific.
 *
 * It is MAINDECK's `.overlay` / `.modal` geometry — 640px, 88vh, 14px radius, the same
 * blurred scrim — rebuilt with the design tokens, because those classes live in the deck's
 * stylesheet and not in `globals.css`.
 *
 * The behaviour that matters on a shop floor:
 *
 *   NOTHING CLOSES WHILE A POSTING IS IN FLIGHT. Escape, the scrim and the ✕ are all
 *   disabled once `busy` is true. A supervisor who taps the scrim by accident half a second
 *   after confirming an issue must not be left wondering whether the material moved.
 *   FOCUS IS TRAPPED AND RETURNED. The dialog takes focus on open and hands it back to
 *   whatever opened it, so a keyboard user is never dropped at the top of the page.
 *   THE BODY DOES NOT SCROLL BEHIND IT — on a tablet that reads as the page having jumped.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  subtitle,
  onClose,
  busy = false,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  /** Called for ✕, Escape and a scrim click. Ignored entirely while `busy`. */
  onClose: () => void;
  /** A request is in flight: the dialog refuses to close and the ✕ greys out. */
  busy?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE) ?? null;
    (first ?? panel)?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      restoreTo?.focus();
    };
  }, []);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!busy) onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      // The scrim carries a mousedown (close on click-away) and a keydown (Escape), which
      // `jsx-a11y` would normally want justified. That plugin is not installed in this
      // repo, and a disable comment naming a rule ESLint does not know is itself an error —
      // so the justification lives here instead: the scrim is not the control. Escape and
      // the ✕ button both close this dialog, and both are dead while `busy`.
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(18,32,46,0.5)] p-5 backdrop-blur-[3px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="card flex max-h-[88vh] w-[min(640px,94vw)] flex-col shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-start gap-3 border-b border-[var(--border-subtle)] px-4 py-3.5">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-[15px] font-bold tracking-[-0.01em] text-[var(--text-primary)]"
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-[12px] leading-[1.5] text-[var(--text-muted)]">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-control)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
