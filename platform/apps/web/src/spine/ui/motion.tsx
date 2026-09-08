"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * MOVEMENT, USED SPARINGLY AND NEVER AS DECORATION.
 *
 * An ERP is read for eight hours a day. Animation that entertains on the first view is
 * something to sit through on the four hundredth, so everything here obeys three rules:
 *
 *   1. IT RUNS ONCE, on arrival. Nothing loops, nothing pulses, nothing draws attention to
 *      itself while somebody is trying to read a number next to it.
 *   2. IT IS SHORT. 240–420ms. Long enough to show where a thing came from, short enough
 *      that a user who already knows the screen is not waiting for it.
 *   3. `prefers-reduced-motion` IS HONOURED IN THE COMPONENT, not only in CSS. A count-up
 *      is JavaScript setting numbers; a media query cannot stop it, so it is checked here
 *      and the final value is rendered immediately instead.
 *
 * The count-up is the one that needs justifying. A figure that races upward is a cliché,
 * and on a financial screen it is worse than a cliché — for a moment the screen displays a
 * number that is not true. So it is used ONLY on the department dashboard's summary tiles,
 * never on a ledger, a quantity or anything an operator might read mid-flight, and it
 * lands on the exact value rather than easing toward it.
 */

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Fade and lift, once, when the element first appears.
 *
 * `delay` staggers a grid so cards arrive in reading order rather than all at once — the
 * effect is that the eye is led through the layout instead of confronted with it. Keep the
 * total stagger under about 300ms; past that it stops reading as one movement and starts
 * reading as a slow page.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}): React.JSX.Element {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(true);
      return;
    }
    const t = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      className={cn("transition-all duration-[320ms] ease-out", className)}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(8px)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * A number that counts up to its value on arrival.
 *
 * Takes the FORMATTED string, not the number: this product formats money in the Indian
 * grouping with lakhs and crores, and re-implementing that here to animate it would put a
 * second formatter in the codebase. Instead the digits inside the string are interpolated
 * and everything else — the ₹, the commas, the "nos", the parentheses on a negative — is
 * left exactly as the formatter produced it.
 */
export function CountUp({ value, className }: { value: string; className?: string }): React.JSX.Element {
  const [text, setText] = useState(() => (prefersReducedMotion() ? value : dim(value)));
  const frame = useRef<number>(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setText(value);
      return;
    }
    const target = Number(value.replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(target)) {
      setText(value);
      return;
    }

    const started = performance.now();
    const DURATION = 420;

    const tick = (now: number): void => {
      const t = Math.min(1, (now - started) / DURATION);
      // Ease-out cubic: fast at the start, settling at the end, so the final value is
      // legible for most of the animation rather than arriving at the last instant.
      const eased = 1 - Math.pow(1 - t, 3);
      if (t >= 1) {
        // Land on the ORIGINAL STRING, never on a re-rendered approximation of it. The
        // displayed figure at rest is exactly what the formatter produced.
        setText(value);
        return;
      }
      setText(scale(value, eased));
      frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value]);

  return (
    <span className={className} data-numeric="">
      {text}
    </span>
  );
}

/** The string with its digits at `f` of their value, punctuation untouched. */
function scale(formatted: string, f: number): string {
  return formatted.replace(/\d+/g, (d) => String(Math.round(Number(d) * f)).padStart(1, "0"));
}

/** The string with its digits zeroed — the first frame. */
function dim(formatted: string): string {
  return formatted.replace(/\d/g, "0");
}

/**
 * A proportion bar that fills on arrival.
 *
 * Always paired with the number it represents, never shown alone. A bar on its own tells
 * you a ratio and hides the magnitude, and "most of them" is not a fact anybody can act on.
 */
export function Meter({
  fraction,
  tone = "neutral",
  className,
}: {
  fraction: number;
  tone?: "neutral" | "ok" | "warn" | "bad";
  className?: string;
}): React.JSX.Element {
  const [width, setWidth] = useState(0);
  const clamped = Math.max(0, Math.min(1, fraction));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setWidth(clamped);
      return;
    }
    const t = setTimeout(() => setWidth(clamped), 60);
    return () => clearTimeout(t);
  }, [clamped]);

  const colour =
    tone === "ok"
      ? "var(--ok)"
      : tone === "warn"
        ? "var(--warn)"
        : tone === "bad"
          ? "var(--bad)"
          : "var(--brand)";

  return (
    <div
      className={cn("h-[5px] w-full overflow-hidden rounded-full bg-[var(--grid)]", className)}
      role="presentation"
    >
      <div
        className="h-full rounded-full transition-[width] duration-[520ms] ease-out"
        style={{ width: `${width * 100}%`, background: colour }}
      />
    </div>
  );
}
