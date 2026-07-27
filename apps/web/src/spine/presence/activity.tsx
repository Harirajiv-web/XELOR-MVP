"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE SCREEN SAVER — thirty seconds of stillness returns the product to the Brain.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This is a demonstration behaviour before it is a product behaviour: a laptop left open
 * on a stand at an investor meeting should compose itself back into the striking stance
 * rather than sit on whatever screen the last person happened to leave open.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHY IT IS ALLOWED TO REFUSE
 * ───────────────────────────────────────────────────────────────────────────────
 * An idle timer that navigates away is a data-loss machine unless something stops it. A
 * clerk half way through a purchase order, who steps away to check a delivery challan and
 * comes back to an empty brain, has been robbed by a screen saver — and will say so.
 *
 * So the timer can be HELD. Any component with work a person would be upset to lose calls
 * `useHoldsUnsavedWork(true)` while that is true, and the timer does not fire; it re-arms
 * and asks again in another thirty seconds. Every dialog in the product that takes typed
 * input holds it, which also covers the second rule — a confirmation a person is standing
 * in front of is never dismissed out from under them.
 *
 * The count is a NUMBER, not a boolean, because two things can be open at once and the
 * second one closing must not clear the first one's hold.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS BEING THERE
 * ───────────────────────────────────────────────────────────────────────────────
 * Pointer movement, clicks and taps, keys, scrolling, touch, and focus moving — the six
 * things a person does without thinking about them. Listened for in the CAPTURE phase, so
 * a dialog that stops propagation cannot accidentally make the product think the room is
 * empty.
 *
 * The reset is throttled to once a second. `pointermove` fires at the monitor's refresh
 * rate, and rebuilding a timer a hundred and twenty times a second to express "the mouse
 * is still moving" is pure heat.
 */

const IDLE_MS = 30_000;
/** How long the void takes to swallow the screen before the route changes. */
const FADE_MS = 700;

/* ───────────────────────────── the hold registry ───────────────────────────── */

let holds = 0;
const listeners = new Set<() => void>();

function setHolds(next: number): void {
  holds = Math.max(0, next);
  for (const l of listeners) l();
}

/**
 * Declare that this component is holding work a person has not saved.
 *
 * Call it with `true` while a dialog with typed input is open, or while a destructive
 * confirmation is on screen. The idle timer will not navigate away while any hold is
 * active. The hold is released on unmount even if the component forgets, because the
 * cleanup runs either way — a leaked hold would disable the screen saver for the rest of
 * the session, silently, which is the worse of the two failure directions to leave open.
 */
export function useHoldsUnsavedWork(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    setHolds(holds + 1);
    return () => setHolds(holds - 1);
  }, [active]);
}

/* ───────────────────────────── the watcher ───────────────────────────── */

const ACTIVITY_EVENTS = [
  "pointermove",
  "pointerdown",
  "keydown",
  "wheel",
  "scroll",
  "touchstart",
  "focusin",
] as const;

/**
 * Mounted once, inside the authenticated shell. Renders nothing but the veil.
 *
 * `home` is where stillness leads. The gateway passes its own handler instead, because
 * from the ONYX map the return is a state change in the same route rather than a
 * navigation — the whole point of that screen is that it never reloads.
 */
export function IdleWatch({
  onIdle,
  enabled = true,
}: {
  /** What to do when the room has been empty for thirty seconds. */
  onIdle?: () => void;
  enabled?: boolean;
}): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const [leaving, setLeaving] = useState(false);
  const lastReset = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fire = useCallback(() => {
    // Asked, and refused. Re-arm rather than give up: the clerk will finish the order
    // eventually, and the stance should compose itself thirty seconds after they do.
    if (holds > 0) {
      timer.current = setTimeout(fire, IDLE_MS);
      return;
    }
    if (onIdle) {
      onIdle();
      return;
    }
    // The veil first, the navigation after. Changing route and then fading would show the
    // Brain snapping into existence over a half-erased ERP screen, which reads as a fault
    // rather than as the product composing itself.
    setLeaving(true);
    setTimeout(() => router.push("/"), FADE_MS);
  }, [onIdle, router]);

  const arm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fire, IDLE_MS);
  }, [fire]);

  useEffect(() => {
    if (!enabled) return;

    const onActivity = (): void => {
      const now = Date.now();
      if (now - lastReset.current < 1000) return;
      lastReset.current = now;
      arm();
    };

    arm();
    for (const e of ACTIVITY_EVENTS) {
      window.addEventListener(e, onActivity, { capture: true, passive: true });
    }
    // A hold being released is not activity, but it IS the moment the answer to "may I
    // leave" changes. Re-arming here means a dialog closed at second twenty-nine gives the
    // person a fresh thirty rather than vanishing on them a heartbeat later.
    const onHoldChange = (): void => arm();
    listeners.add(onHoldChange);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const e of ACTIVITY_EVENTS) {
        window.removeEventListener(e, onActivity, { capture: true });
      }
      listeners.delete(onHoldChange);
    };
  }, [arm, enabled]);

  // A route change is activity by definition, and it also means the previous screen's
  // timer was measuring the wrong screen.
  useEffect(() => {
    setLeaving(false);
    arm();
  }, [pathname, arm]);

  return (
    <div
      aria-hidden={!leaving}
      // Purely presentational and never in the way: no pointer events, and it is
      // transparent until the moment it is not.
      className="pointer-events-none fixed inset-0 z-[200] bg-[#04060c]"
      style={{
        opacity: leaving ? 1 : 0,
        transition: `opacity ${FADE_MS}ms cubic-bezier(.4,0,.2,1)`,
        visibility: leaving ? "visible" : "hidden",
      }}
    />
  );
}
