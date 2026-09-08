"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE ONE CONTROL THE VOID IS ALLOWED TO SHOW.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This screen was built on a rule that it has NO visible controls — the Brain is the call to
 * action and anything else beside it is a second thing to look at on a screen whose whole
 * argument is that there is only one. That rule is being deliberately broken here, once,
 * because the brief asks for a theme control that is available before sign-in and stays
 * available through the Brain and the agent map. A person who set light mode at the front
 * door and cannot change their mind for the rest of the journey has been given a preference,
 * not a control.
 *
 * So it is made as small as a real control can honestly be: three icons, in the scene's own
 * two inks, top-right — the mirror of the wordmark top-left, which is the one position on
 * this screen that already belongs to furniture rather than to the subject.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHY THREE AND NOT TWO
 * ───────────────────────────────────────────────────────────────────────────────
 * The brief asks to respect the operating system on first visit and to persist an explicit
 * choice after that. Those are three states, not two: "light", "dark", and "whatever this
 * machine is set to" — and the third is the right answer for most people, whose laptop
 * already switches at sunset. A two-way switch cannot express it, so the first tap would
 * silently opt somebody out of a decision they had already made somewhere else, with no way
 * back. This is the same three the product's own toggle offers, in the void's clothes.
 *
 * It does NOT re-implement the theme. `useTheme` is the product's, the write goes through
 * the same `setChoice`, and the cross-origin cookie that carries the choice back to the
 * sign-in page is written there. This file is a set of three buttons.
 */

import * as Icons from "lucide-react";
import { useTheme, type ThemeChoice } from "../theme/theme";
import { NOTE } from "./xelor-type";

const OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string; icon: keyof typeof Icons }> = [
  { value: "light", label: "Light", icon: "Sun" },
  { value: "dark", label: "Dark", icon: "Moon" },
  { value: "system", label: "Match my device", icon: "MonitorCog" },
];

export function VoidThemeToggle(): React.JSX.Element {
  const { choice, resolved, setChoice } = useTheme();

  return (
    <div
      /**
       * Top-right, on the clamps the wordmark uses top-left, so the two read as one band of
       * furniture rather than as two things that happen to be near corners. The Brain's own
       * size cap already reserves the bands at the top and bottom of the viewport, which is
       * why this cannot grow into the figure at any window size — see the exclusion-zone note
       * in `brain.tsx`.
       */
      className="absolute top-[clamp(1.75rem,4vh,3rem)] right-[clamp(1.5rem,3.5vw,3rem)] z-20 flex items-center gap-0.5 rounded-full p-0.5"
      style={{
        background: "color-mix(in srgb, var(--void-ink) 7%, transparent)",
        transition: "background 600ms ease",
      }}
      role="radiogroup"
      aria-label="Appearance"
      data-void-theme={resolved}
      data-void-theme-choice={choice}
    >
      {OPTIONS.map((o) => {
        const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[o.icon] ?? Icons.Circle;
        const active = choice === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            // The name says what it DOES and, for "system", what that currently means — a
            // screen reader user on "match my device" otherwise has no way to learn which of
            // the two they are actually looking at.
            aria-label={
              o.value === "system" ? `Match my device — currently ${resolved}` : o.label
            }
            title={o.label}
            onClick={() => setChoice(o.value)}
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--void-focus) focus-visible:ring-offset-2 focus-visible:ring-offset-(--void-bg)"
            style={{
              // The active one is picked out in the scene's accent, not by a filled pill:
              // three filled rectangles in the corner of the void is chrome, and this screen
              // does not have chrome.
              color: active ? "var(--void-focus)" : "var(--void-ink-soft)",
              background: active
                ? "color-mix(in srgb, var(--void-focus) 14%, transparent)"
                : "transparent",
            }}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only" style={NOTE}>
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
