"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A MODAL — built here, in Purchase, because the spine does not have one yet.
 *
 * TO BE PROMOTED TO `src/spine/ui/` once a second module needs it. Nothing in this file is
 * specific to a purchase order, and sixteen modules each growing their own dialog is exactly
 * how a product ends up with four different Escape-key behaviours. It is written to be lifted
 * unchanged: no purchase imports, no purchase vocabulary. Until then it stays inside this
 * folder, which is the rule — a module may not reach into another module's code, and the
 * spine is not this department's to edit.
 *
 * The behaviour is MAINDECK's `modal()`: a dimmed backdrop, a centred card with a titled
 * header, a scrolling body and a footer that holds the actions. Three deliberate departures
 * from the usual dialog reflexes:
 *
 *   NO PORTAL. `react-dom` is not among the imports this module is allowed, and it does not
 *   need one — nothing in the shell creates a containing block, so `position: fixed` escapes
 *   the layout on its own.
 *
 *   THE BACKDROP DOES NOT CLOSE IT. Every other application does. But the thing inside this
 *   one is a half-typed purchase order, and losing six lines of item codes because a cursor
 *   slipped at the edge of the card is not a trade worth making for a click's convenience.
 *   Escape and Cancel close it; both are deliberate acts.
 *
 *   ESCAPE IS IGNORED WHILE BUSY. A request is in flight against a system that is about to
 *   commit money. Closing the window does not cancel it, so a dialog that vanished mid-write
 *   would leave the user believing nothing happened.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  busy = false,
  footer,
  children,
  labelledById = "ind-modal-title",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** While true, Escape and the close button are inert — a write is in flight. */
  busy?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  labelledById?: string;
}): React.JSX.Element {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusTo = useRef<Element | null>(null);

  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  // Escape closes; Tab is kept inside the card. The trap is not decoration — a keyboard user
  // who tabs past the last button lands on the page behind an open dialog, where every
  // control is one they cannot see the state of.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const card = cardRef.current;
      if (!card) return;
      const focusable = card.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [close]);

  // Hold the page still behind the dialog, and hand focus back to whatever opened it when it
  // goes — otherwise the user is returned to the top of the document every time.
  useEffect(() => {
    restoreFocusTo.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const firstField = cardRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button",
    );
    firstField?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      const target = restoreFocusTo.current;
      if (target instanceof HTMLElement) target.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--overlay-scrim)] p-4 sm:p-8"
      // Not `onClick={close}`. See the note above: a half-typed order does not get thrown
      // away by a stray click.
      aria-hidden={false}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        className="card my-auto w-full max-w-3xl shadow-[var(--shadow-lg)]"
      >
        <div className="panel-h">
          <div className="min-w-0">
            <div id={labelledById} className="truncate">
              {title}
            </div>
            {subtitle ? <div className="panel-h-sub mt-0.5">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label="Close"
            className="btn btn-ghost btn-sm shrink-0"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <div className="panel-b max-h-[calc(100vh-14rem)] overflow-y-auto">{children}</div>

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
