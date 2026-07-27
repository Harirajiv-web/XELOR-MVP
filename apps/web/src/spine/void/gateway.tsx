"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE GATEWAY — arrival, discovery, and the door into the real product.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ONE ROUTE, TWO STANCES. The Brain and the ONYX map are states of a single component, not
 * two pages. That is the only way to honour "do not use a hard page reload; preserve the
 * sense of continuous space": a router navigation unmounts the brain and mounts the map,
 * and no amount of easing on two separate mounts produces the feeling of travelling
 * THROUGH something. Here the brain is still on screen, still scaling, while the map is
 * already growing out of the point it collapsed into. The two motions overlap, which is
 * what makes it read as one camera move.
 *
 * The URL stays `/` throughout. That is deliberate and it matches the brief: re-entering
 * the ERP after a timeout means walking the journey again — Brain, then ONYX, then a
 * department — so a deep link into the middle of it would be a hole in the very behaviour
 * being asked for.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHAT THIS COMPONENT REFUSES TO WAIT FOR
 * ───────────────────────────────────────────────────────────────────────────────
 * The brain draws the instant the session is known. It does NOT wait for the permissions
 * call — the first frame after signing in is the entire emotional argument of this
 * product, and holding it back for a round trip that only the second stance needs would be
 * paying the most expensive moment for the least important reason.
 *
 * The map needs the access answer, and by the time anybody has looked at the brain and
 * decided to click it, that answer has long since arrived.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccess } from "../access/permissions";
import { orderedModules } from "@modules/registry";
import { moduleAvailability, visibleNav } from "../registry/manifest";
import { IdleWatch } from "../presence/activity";
import { Brain } from "./brain";
import { OnyxVoidMap, orbitDepartments, type VoidDept } from "./onyx-void-map";

type Stance = "brain" | "travelling" | "onyx";

/** How long the camera spends inside the brain before the map has fully arrived. */
const TRAVEL_MS = 1750;
/** When the map starts growing — well before the brain has finished leaving. */
const MAP_IN_AT = 620;

/**
 * Does this machine want the full scene?
 *
 * Two questions, and they are genuinely different. `prefers-reduced-motion` is a PERSON
 * saying "stop moving things", and it is obeyed absolutely — every navigation path stays,
 * the motion goes. Low power is a MACHINE that will stutter through blur filters and
 * animated dash arrays; it keeps the motion and loses the expensive paint. Conflating them
 * would either give a migraine sufferer a blurry scene or give an old office PC a
 * slideshow.
 */
function readCapability(): { reduced: boolean; lowPower: boolean } {
  if (typeof window === "undefined") return { reduced: false, lowPower: false };
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  // Deliberately generous. A false "low power" costs a little beauty; a false "high power"
  // costs a stuttering first impression, and this screen only gets one.
  const lowPower = cores <= 4 || memory <= 4;
  return { reduced, lowPower };
}

export function Gateway(): React.JSX.Element {
  const router = useRouter();
  const { can, isLicensed, ready } = useAccess();
  const [stance, setStance] = useState<Stance>("brain");
  const [cap, setCap] = useState({ reduced: false, lowPower: false });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setCap(readCapability());
  }, []);

  // Every timer this component starts, cleared on the way out. A stance transition left
  // running after unmount sets state on a component that is gone, and in this component
  // that would mean the map arriving over whatever screen replaced it.
  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const enter = useCallback(() => {
    if (stance !== "brain") return;
    if (cap.reduced) {
      // No camera move. The destination is identical and it is reached the same way — the
      // person asked for less motion, not for less product.
      setStance("onyx");
      return;
    }
    setStance("travelling");
    after(MAP_IN_AT, () => setStance((s) => (s === "travelling" ? "travelling" : s)));
    after(TRAVEL_MS, () => setStance("onyx"));
  }, [stance, cap.reduced, after]);

  const back = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    setStance("brain");
  }, []);

  // Escape from the map returns to the Brain, from anywhere on the scene.
  useEffect(() => {
    if (stance === "brain") return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stance, back]);

  /**
   * WHICH DOORS ACTUALLY OPEN.
   *
   * A department is reachable when this viewer has at least one licensed module inside it
   * with at least one screen they may open — the same three gates the sidebar and the
   * route both apply, asked here in advance so nobody is invited through a door that will
   * answer 403 on the other side.
   */
  const departments: readonly VoidDept[] = useMemo(() => {
    const open = ready
      ? orderedModules().filter((m) => moduleAvailability(m, { isLicensed, can }) === null)
      : [];
    return orbitDepartments().map((dept) => {
      const mine = open.filter((m) => m.department === dept.code && visibleNav(m, can).length > 0);
      return { dept, reachable: mine.length > 0, moduleCount: mine.length };
    });
  }, [ready, can, isLicensed]);

  const noDoors = ready && departments.every((d) => !d.reachable);

  return (
    <main
      // THE VOID. Not a token — the product's `--bg` is a page colour that has to hold
      // black text, and this scene is the one surface in the whole application that is not
      // a page. Near-black rather than pure, because #000 on an OLED panel is a hole with
      // hard edges where the glow stops.
      className="relative h-screen w-screen overflow-hidden bg-[#04060c]"
      style={{ colorScheme: "dark" }}
    >
      {/* Two enormous, almost invisible aurora washes. They are what stops the background
          reading as a flat rectangle, and at this opacity they cost one composited layer. */}
      {!cap.lowPower ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[120vmax] w-[120vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(45,212,191,0.055) 0%, rgba(129,140,248,0.035) 38%, transparent 66%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-[20vmax] -top-[20vmax] h-[70vmax] w-[70vmax] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(167,139,250,0.05) 0%, transparent 62%)",
            }}
          />
        </>
      ) : null}

      {/* ─────────────────────────────── the brain ─────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          pointerEvents: stance === "brain" ? "auto" : "none",
          visibility: stance === "onyx" ? "hidden" : "visible",
        }}
        // Hidden from assistive technology the moment it is no longer the thing on screen,
        // so a screen reader never offers "Enter the factory intelligence" to somebody who
        // is already standing in the map.
        aria-hidden={stance !== "brain"}
        inert={stance !== "brain"}
      >
        <Brain
          phase={stance === "brain" ? "idle" : "travelling"}
          reduced={cap.reduced}
          lowPower={cap.lowPower}
          onActivate={enter}
        />
      </div>

      {/* ──────────────────────────────── the map ──────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          pointerEvents: stance === "onyx" ? "auto" : "none",
          visibility: stance === "brain" ? "hidden" : "visible",
        }}
        aria-hidden={stance === "brain"}
        inert={stance === "brain"}
      >
        <OnyxVoidMap
          departments={departments}
          visible={stance === "onyx"}
          reduced={cap.reduced}
          lowPower={cap.lowPower}
          onReturn={back}
        />
      </div>

      {/* The one honest thing to say when the journey leads nowhere. It replaces the map's
          invitation rather than sitting alongside it, because six dimmed rings with no
          explanation is a person concluding the product is broken. */}
      {noDoors && stance === "onyx" ? (
        <p className="pointer-events-none absolute bottom-[16vh] left-1/2 max-w-[46ch] -translate-x-1/2 text-center text-[12.5px] leading-[1.6] text-[#8fb3c9]">
          You are signed in, but no department is both licensed for this company and
          permitted for your role. Your administrator can grant you access.
        </p>
      ) : null}

      {/* Stillness on the map returns to the Brain — a state change, not a navigation, so
          the scene never reloads. The Brain stance arms no timer: it is already the place
          stillness leads to, and a timer that fires to put you where you are is a wasted
          wake-up every thirty seconds for as long as the laptop is open. */}
      <IdleWatch enabled={stance !== "brain"} onIdle={back} />

      {/* The escape hatch for a keyboard user who lands here and wants the plain product.
          Deliberately the last thing in the tab order and invisible until focused: the
          brief forbids visible controls on this stance, and a person who cannot see the
          scene at all must still be able to get past it. */}
      <button
        type="button"
        onClick={() => {
          const first = orderedModules().find(
            (m) => moduleAvailability(m, { isLicensed, can }) === null,
          );
          const nav = first ? visibleNav(first, can)[0] : undefined;
          if (first && nav) router.push(`/${first.key}/${nav.path}`);
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:bottom-4 focus:left-1/2 focus:-translate-x-1/2 focus:rounded-full focus:border focus:border-[#2dd4bf] focus:bg-[#070b14] focus:px-4 focus:py-2 focus:text-[12px] focus:text-[#5eead4]"
      >
        Skip the intelligence layer and open the ERP
      </button>
    </main>
  );
}
