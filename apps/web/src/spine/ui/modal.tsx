"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A MODAL DIALOG — the spine's, now that more than one module needs one.
 *
 * This file used to live in `modules/sales/components/`, with a note saying it belonged
 * here and should move the moment a second module needed a dialog. Three modules had
 * copied it by then (sales, purchase, production) and the copies had already drifted —
 * different focus handling in each, which is exactly the failure the note predicted. The
 * correction feature needs a dialog in a dozen more, so it moved.
 *
 * Shape: a card on a dimmed page, a `.panel-h` title row with a subtitle, a scrolling
 * `.panel-b`, and a footer whose primary action sits on the right. Everything else here is
 * behaviour a static deck did not have to worry about:
 *
 *   NO PORTAL. The dialog renders inline as `position: fixed`. That is only safe because no
 *   ancestor in the app shell creates a containing block (no transform, filter or contain) —
 *   checked, and worth re-checking if the shell ever gains one.
 *
 *   ESCAPE CLOSES, THE BACKDROP DOES NOT. Clicking slightly outside a form is far too easy,
 *   and losing a half-typed five-line order to a stray click is the kind of thing people do
 *   not forgive. Escape is deliberate enough to count, and the caller can still refuse it
 *   while a request is in flight.
 *
 *   FOCUS IS TRAPPED AND RETURNED. Tab cycles inside the dialog; when it closes, focus goes
 *   back to whatever opened it, so a keyboard user is not dropped at the top of the page.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  subtitle,
  onClose,
  /** While true, Escape and the close button do nothing — used to hold a submit in flight. */
  locked = false,
  footer,
  children,
  width = "max-w-3xl",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  locked?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  width?: string;
}): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();

  useEffect(() => {
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // The first control the user needs, not the close button — an autofocused X is a form
    // that opens on its own exit.
    const target =
      panel?.querySelector<HTMLElement>("[data-autofocus]") ??
      panel?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel;
    target?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        if (locked) return;
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [locked, onClose],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--overlay-scrim)] p-4 sm:p-8"
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        className={`card my-auto w-full ${width} shadow-[var(--shadow-lg)]`}
      >
        <div className="panel-h">
          <span className="min-w-0 flex-1">
            <span id={titleId} className="block truncate">
              {title}
            </span>
            {subtitle ? (
              <span id={subtitleId} className="panel-h-sub mt-0.5 block font-normal">
                {subtitle}
              </span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            aria-label="Close"
            className="btn btn-ghost btn-sm shrink-0"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <div className="panel-b max-h-[min(70vh,720px)] overflow-y-auto">{children}</div>

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
