"use client";

import { useEffect, useState } from "react";
import * as Icons from "lucide-react";

/**
 * WHAT THIS SCREEN SHOWS — the first thing on every screen in the product.
 *
 * The people this is for have run a factory on paper, on Excel and on Tally, and are being
 * handed fifty-three screens at once. The expensive failure is not that somebody cannot
 * find a screen; it is that they find one, read it confidently, and read it wrong — a
 * planner treating a projected balance as stock on hand, a storekeeper treating a reserved
 * quantity as available. One sentence at the top saying what the numbers ARE, and where
 * they came from, is the cheapest fix for the most expensive mistake in the product.
 *
 * DRAWN BY THE ROUTE, NOT BY THE SCREEN. Fifty-three screens each remembering to describe
 * themselves means the fifty-fourth will not, and the one that forgets will be somebody's
 * first. The route reads the description off the nav entry, so a screen physically cannot
 * ship without one — `pnpm module-check` fails the build if a visible entry has no
 * description.
 *
 * NOT A MODAL, NOT A TOUR, NOT A COACHMARK. Those interrupt, are dismissed on reflex, and
 * are then gone for the one week the person actually needed them. This sits in the page,
 * says its piece, and can be turned off once — and turned back on, which is the part
 * products usually forget.
 */

const KEY = "indcore.screen-notes";

function readHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "hidden";
  } catch {
    return false;
  }
}

export function ScreenNote({
  moduleKey,
  moduleName,
  screenKey,
  label,
  description,
}: {
  moduleKey: string;
  moduleName: string;
  screenKey: string;
  label: string;
  description?: string;
}): React.JSX.Element | null {
  // Starts visible and is corrected on mount. That order matters: if it started hidden and
  // appeared a frame later, every screen in the product would visibly jump as the note
  // pushed the table down. Better to show it and remove it than to add it after the fact.
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(readHidden());
  }, []);

  function persist(next: boolean): void {
    setHidden(next);
    try {
      window.localStorage.setItem(KEY, next ? "hidden" : "shown");
    } catch {
      // A browser that refuses to remember still gets the change for this session.
    }
  }

  // A screen with no description shows nothing rather than an empty band. The build check
  // is what stops that happening; this is the belt to its braces.
  if (!description) return null;

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => persist(false)}
        className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--brand)]"
      >
        <Icons.HelpCircle className="h-3.5 w-3.5" aria-hidden />
        What does this screen show?
      </button>
    );
  }

  return (
    <aside
      // A landmark with a name, so a screen-reader user can jump straight past the
      // explanation on their four-hundredth visit without hearing it again.
      aria-label={`About ${moduleName} — ${label}`}
      data-screen={`${moduleKey}/${screenKey}`}
      className="mb-3.5 flex items-start gap-2.5 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] px-3.5 py-2.5 shadow-[var(--shadow-sm)]"
    >
      <span className="mt-[1px] grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-[var(--brand-soft)]">
        <Icons.Info className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden />
      </span>
      <p className="min-w-0 flex-1 text-[12px] leading-[1.55] text-[var(--text-secondary)]">
        <b className="font-semibold text-[var(--text-primary)]">{label} — </b>
        {description}
      </p>
      <button
        type="button"
        onClick={() => persist(true)}
        title="Hide these explanations on every screen. You can bring them back from the link that replaces this one."
        aria-label="Hide screen explanations"
        className="-mr-1 -mt-0.5 shrink-0 rounded-[6px] p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--text-primary)]"
      >
        <Icons.X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </aside>
  );
}
