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
import { api } from "../api/client";
import { orderedModules } from "@modules/registry";
import { moduleAvailability, visibleNav } from "../registry/manifest";
import { Brain, BRAIN_COMMIT_MS, BRAIN_TRAVEL_MS } from "./brain";
import {
  MAP_SETTLE_MS,
  OnyxVoidMap,
  orbitDepartments,
  type VoidDept,
  type VoidRuntime,
} from "./onyx-void-map";
import { NOTE, Wordmark } from "./xelor-type";
import { VoidThemeToggle } from "./void-theme-toggle";


/**
 * THE FLOOR PLAN IS NOT ON THIS SCREEN, AND THAT IS A DECISION RATHER THAN AN OMISSION.
 *
 * The revolving factory lives behind the SIGN-IN FORM — see `login-backdrop.ts` and the
 * Keycloak theme in `infra/keycloak-themes/indcore`. It was tried here too, three ways, and
 * every one of them cost more than it paid:
 *
 *   centred and bright — the Brain sat INSIDE the wireframe and read as noise rather than
 *                        as the subject
 *   centred and dim    — still competing; two figures the same size in the same place
 *                        compete however faint one of them is
 *   low in the frame   — the best of the three and genuinely good-looking, but it forced the
 *                        glow off (this screen already animates ~500 elements a frame, and
 *                        the two loops together drop an ordinary laptop GPU under 30 fps)
 *
 * The void is what makes the Brain read as hollow. Putting a drawing behind a hollow form
 * fills it in. Bringing it back is `mountFloorPlan` from `floorplan-scene.ts` in a ten-line
 * effect — but read the three lines above first.
 */

type Stance = "brain" | "commit" | "travelling" | "onyx";

/**
 * ───────────────────────────────────────────────────────────────────────────────
 * THE JOURNEY, AS FOUR STAGES ON ONE CLOCK
 * ───────────────────────────────────────────────────────────────────────────────
 *
 *   0 ms    the press lands. The Brain settles inward and flares — an acknowledgement, not
 *           decoration: a control that answers nothing at all reads as one that was missed.
 *   70 ms   the camera goes in. The figure scales past the frame and dissolves.
 *   90 ms   the map begins to grow OUT OF THE SAME POINT, while the Brain is still leaving.
 *           This overlap is the entire trick. Two motions that share most of their duration
 *           read as one camera move; the same two played end to end read as a fade between
 *           two pictures, however well eased.
 *   550 ms  the Brain is gone and the last node has stopped. The doors accept a press.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * THIS CLOCK HAS BEEN CUT TWICE, AND THE SECOND CUT WAS THE IMPORTANT ONE
 * ───────────────────────────────────────────────────────────────────────────────
 * It began at 3.37 s — 1.75 s of travel and then a 1.5 s map growth that did not start until
 * the travel had finished. Overlapping the two brought it to 1.28 s, then 1.02 s, both
 * comfortably inside the "0.9–1.5 s" a brief had asked for.
 *
 * Watched rather than measured, it still read as LATENCY. That is worth stating plainly,
 * because the numbers said it was fine: a duration a person will happily sit through the
 * first time is one they resent by the fifth, and this is the screen they pass on the way
 * into work every morning. Meeting the brief and being annoying are not exclusive.
 *
 * So the whole schedule was halved to **550 ms, press to clickable**, and three separate
 * sources of dead time were removed alongside it — see `WARM_AT` for the paint, the memos on
 * `Brain` and `OnyxVoidMap` for the reconciliation, and `TRAVEL_SCALE` and the paused breathe
 * in `brain.tsx` for the rasterisation. Measured before those: motion began 365 ms after it
 * was asked to. After: 137 ms.
 *
 * `SETTLE` is DERIVED from the map's own reveal schedule rather than written down twice.
 * A hand-copied settle time is a number that goes stale the first time somebody adjusts a
 * stagger, and the failure it produces — a door that is clickable a moment before it stops
 * moving — is invisible in review and obvious in a demo.
 */
const COMMIT_MS = BRAIN_COMMIT_MS;
/** When the brain has finished leaving. */
const TRAVEL_MS = COMMIT_MS + BRAIN_TRAVEL_MS;
/** When the map starts growing — 20 ms into the travel, not after it. */
const MAP_IN_AT = 90;
/**
 * WHEN THE MAP IS PAINTED FOR THE FIRST TIME — and it is not when it is shown.
 *
 * The map was mounted from the first frame but kept `visibility: hidden`, which lays out and
 * does NOT paint. So the flip to visible was the first paint of six `foreignObject`s, six
 * nested svgs and a Gaussian filter — and it landed on the exact frame the transitions were
 * meant to begin on. Measured, motion started 365 ms after it was asked to.
 *
 * Half a second after arrival, while the Brain is being looked at and nothing is competing,
 * the map is made visible at zero opacity. The paint is paid then. By the time anybody
 * presses anything there is nothing left to do but composite.
 */
const WARM_AT = 500;
/**
 * THE BACKSTOP, NOT THE SCHEDULE.
 *
 * The map now reports its own stillness through `transitionend`, because a timer set to the
 * sum of the delays is a PREDICTION and the thing being predicted varies: measured on a
 * software renderer the reveal started 170 ms late and ended 400 ms late, and the timer was
 * opening the doors while they were visibly still moving.
 *
 * This exists only for the case where that event never arrives — an interrupted transition
 * emits nothing — so it is set generously. A door that opens late is a wait; a scene with no
 * doors at all is a dead end.
 */
const SETTLE_BACKSTOP_MS = MAP_IN_AT + MAP_SETTLE_MS * 2;

/**
 * What the journey is SCHEDULED to take, published for the harness.
 *
 * Two different things were being conflated by one assertion: whether somebody had slowed the
 * design down, and whether the machine measuring it was busy. On a software renderer the same
 * unchanged build timed anywhere from 641 ms to 983 ms, so a threshold tight enough to catch a
 * real regression also failed on a loaded VM — and a threshold loose enough to be stable
 * caught nothing.
 *
 * So they are separated. This number is the design, and it cannot drift without somebody
 * editing a constant. The measured one is the machine, and it is allowed to be noisy.
 */
const JOURNEY_MS = MAP_IN_AT + MAP_SETTLE_MS;

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
  /**
   * The authenticated entry point is the Brain.
   *
   * It is the visual handshake between authentication and the operating system: sign-in
   * establishes who is present, the Brain establishes what ONYX is, and activating it
   * reveals the catalogue-backed nine-agent topology. Starting in `onyx` skipped that
   * handshake entirely and left the Brain mounted but permanently hidden.
   */
  const [stance, setStance] = useState<Stance>("brain");
  // Deliberately NOT derived from `stance`. The map has to start growing while the stance is
  // still `travelling` — that overlap is the transition — so "is the map arriving" and "where
  // is the camera" are two facts, and collapsing them into one would force the map to wait.
  const [mapIn, setMapIn] = useState(false);
  const [settled, setSettled] = useState(false);
  const [warm, setWarm] = useState(false);
  const [cap, setCap] = useState({ reduced: false, lowPower: false });
  const [runtime, setRuntime] = useState<VoidRuntime>({
    state: "checking",
    providerMode: null,
    connectedAgentKeys: [],
  });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /**
   * The stance, readable synchronously.
   *
   * `enter` used to close over `stance`, which meant a NEW function on every one of the four
   * stance changes, which meant the memoised Brain re-rendered on all of them anyway — the
   * memo would have been decoration. The guard needs the current value at click time, not at
   * render time, so a ref is the honest way to hold it.
   */
  const stanceRef = useRef<Stance>("brain");

  useEffect(() => {
    setCap(readCapability());
  }, []);

  useEffect(() => {
    if (!ready || !can("agentos.run.read")) return;
    let cancelled = false;
    void api
      .get<{
        data: {
          runtime: { status: string; providerMode: string };
          agents: Array<{ key: string }>;
        };
      }>("/agent-os/catalogue")
      .then((response) => {
        if (cancelled) return;
        setRuntime({
          state: response.data.runtime.status === "live" ? "live" : "unavailable",
          providerMode: response.data.runtime.providerMode,
          connectedAgentKeys: response.data.agents.map((agent) => agent.key),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setRuntime({
            state: "unavailable",
            providerMode: null,
            connectedAgentKeys: [],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ready, can]);

  // Pay the map's first paint while the Brain is being looked at. See `WARM_AT`.
  useEffect(() => {
    const t = setTimeout(() => setWarm(true), WARM_AT);
    return () => clearTimeout(t);
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

  /** Both halves of the stance, always together — the state React renders from and the ref
      `enter` reads. Two writers for one fact is how they drift. */
  const go = useCallback((s: Stance) => {
    stanceRef.current = s;
    setStance(s);
  }, []);

  const enter = useCallback(() => {
    if (stanceRef.current !== "brain") return;
    if (cap.reduced) {
      // No camera move, no stagger, no draw-on. The destination is identical, the
      // information arrives in the same order, and the doors still wait for the fade to
      // finish before they accept a press — the person asked for less motion, not for less
      // product and not for a target that appears under their cursor.
      go("onyx");
      setMapIn(true);
      after(420, () => setSettled(true));
      return;
    }
    go("commit");
    after(COMMIT_MS, () => go("travelling"));
    after(MAP_IN_AT, () => setMapIn(true));
    after(TRAVEL_MS, () => go("onyx"));
    after(SETTLE_BACKSTOP_MS, () => setSettled(true));
  }, [cap.reduced, after, go]);

  /** The map's own report that it has stopped moving. Idempotent — it fires per property. */
  const markSettled = useCallback(() => setSettled(true), []);

  const back = useCallback(() => {
    router.push("/agentos/commander");
  }, [router]);

  // Escape from the entry topology opens the operational surface behind the same network.
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
  const reach = useMemo(() => {
    const open = ready
      ? orderedModules().filter((m) => moduleAvailability(m, { isLicensed, can }) === null)
      : [];
    const forCode = (code: string): { reachable: boolean; moduleCount: number } => {
      const mine = open.filter((m) => m.department === code && visibleNav(m, can).length > 0);
      return { reachable: mine.length > 0, moduleCount: mine.length };
    };
    return {
      departments: orbitDepartments().map((dept) => ({ dept, ...forCode(dept.code) })),
      /**
       * ONYX ASKS THE SAME QUESTION ABOUT ITSELF.
       *
       * `/department/ONYX` needs no permission — it describes structure, and the route says
       * so. But every other node on this map is lit only when there is something behind it,
       * and a hub that always invites you in while its six satellites are honest about
       * access would be the one place the picture lies. It owns `aiops`; that is its gate.
       */
      onyx: forCode("ONYX"),
    };
  }, [ready, can, isLicensed]);

  const departments: readonly VoidDept[] = reach.departments;
  const noDoors = ready && !reach.onyx.reachable && departments.every((d) => !d.reachable);

  return (
    <main
      /**
       * THE VOID, NOW IN TWO THEMES.
       *
       * `ind-void` carries its own palette — background, inks, the five aurora stops, the
       * seven agent hues, the mark glow — declared once per theme in `globals.css` and
       * switched by the `data-theme` attribute the boot script writes before first paint.
       * Nothing in this file names a colour, which is what lets a light mode exist at all:
       * the previous version had `#04060c` written into the class list, and a hex in a
       * screen is a theme that can only ever have one value.
       *
       * The scene is still not a page. `--void-bg` is deliberately a shade cooler and deeper
       * than the product's `--bg` in light, and near-black rather than pure in dark, because
       * #000 on an OLED panel is a hole with hard edges where the glow stops.
       *
       * The 600 ms colour transition is what makes the switch a change of light rather than
       * a cut. It is on `background-color` alone: putting it on `all` would drag every
       * transform in the scene through the same easing and the Brain would swim.
       */
      className="ind-void relative h-screen w-screen overflow-hidden"
      style={{
        background: "var(--void-bg)",
        transition: "background-color 600ms ease",
      }}
      // The scheduled journey, as a fact rather than as something a harness re-derives. See
      // `JOURNEY_MS`: this is the design; what a stopwatch reads is the machine.
      data-journey-ms={JOURNEY_MS}
    >
      {/* Two enormous, almost invisible aurora washes. They are what stops the background
          reading as a flat rectangle, and at this opacity they cost one composited layer. */}
      {!cap.lowPower ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 h-[120vmax] w-[120vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: "var(--void-wash-a)", transition: "background 600ms ease" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-[-20vmax] right-[-20vmax] h-[70vmax] w-[70vmax] rounded-full"
            style={{ background: "var(--void-wash-b)", transition: "background 600ms ease" }}
          />
        </>
      ) : null}

      {/* ────────────────────────────── the mark on the wall ────────────────────────────
          Above both stances and outside both, so it is the one thing that does not move for
          the whole journey. Owned by neither: a mark that belongs to the Brain cannot
          survive the Brain leaving, and one that fades for the travel leaves the screen
          belonging to nobody at exactly the moment it is meant to feel like one system. */}
      <Wordmark />

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
          phase={stance === "brain" ? "idle" : stance === "commit" ? "commit" : "travelling"}
          reduced={cap.reduced}
          lowPower={cap.lowPower}
          onActivate={enter}
        />
      </div>

      {/* ──────────────────────────────── the map ──────────────────────────────── */}
      {/* Mounted from the first frame, hidden rather than absent. Building six nodes, six
          pathways and a hub mid-travel would put a layout pass in the one second of this
          product that cannot afford one — so the work is done while the Brain is still being
          looked at, and the transition only has to reveal what already exists.

          `inert` until SETTLED, not until visible. A door that accepts a press while it is
          still sliding into place is a door somebody misses, and this scene's whole claim is
          that the six of them are exactly where they were last time. */}
      <div
        className="absolute inset-0"
        style={{
          pointerEvents: settled ? "auto" : "none",
          // `warm ||` is the whole pre-warm: half a second after arrival this flips to
          // visible while the map itself is still at zero opacity, so the first paint
          // happens in idle time rather than on the frame the transition needs.
          visibility: warm || mapIn ? "visible" : "hidden",
        }}
        aria-hidden={!settled}
        inert={!settled}
      >
        <OnyxVoidMap
          departments={departments}
          onyx={reach.onyx}
          visible={mapIn}
          settled={settled}
          onSettled={markSettled}
          reduced={cap.reduced}
          lowPower={cap.lowPower}
          onReturn={back}
          runtime={runtime}
        />
      </div>

      {/*
        THE MIRROR OF THE WORDMARK, and the one control this screen shows. Outside both
        stances for the same reason the wordmark is: a preference that disappears when the
        Brain leaves is a preference you can only set in one place.

        AFTER both stances in the DOM, though it is drawn top-right. It was before them, and
        that put an appearance setting ahead of the Brain in the tab order — so the first
        thing a keyboard user reached on a screen whose entire argument is "there is one thing
        here to press" was a theme switch. Absolute positioning means the order costs nothing
        visually and decides everything about the order somebody meets it in.
      */}
      <VoidThemeToggle />

      {/* The one honest thing to say when the journey leads nowhere. It replaces the map's
          invitation rather than sitting alongside it, because six dimmed rings with no
          explanation is a person concluding the product is broken. */}
      {noDoors && settled ? (
        // The one place the tracked-capital voice is set aside. Three lines of explanation
        // in a wide-tracked uppercase is a poster; this is somebody being told why the
        // screen they are looking at is empty, and it has to read as a sentence.
        <p
          className="pointer-events-none absolute bottom-[16vh] left-1/2 max-w-[46ch] -translate-x-1/2 text-center text-[12.5px] leading-[1.6] text-(--void-ink-soft)"
          style={{ fontWeight: NOTE.fontWeight, letterSpacing: "0.01em" }}
        >
          You are signed in, but no department is both licensed for this company and
          permitted for your role. Your administrator can grant you access.
        </p>
      ) : null}

      {/*
        ═══════════════════════════════════════════════════════════════════════════════
        THE IDLE TIMER IS GONE, AND THE COMMENT THAT USED TO BE HERE DESCRIBED BEHAVIOUR
        THAT NO LONGER EXISTED.
        ═══════════════════════════════════════════════════════════════════════════════
        It read: "Stillness on the map returns to the Brain — a state change, not a
        navigation, so the scene never reloads." That was true when `back` swapped a stance.
        It has not been true since `back` became a deliberate route transition: with
        `IDLE_MS` at 30 seconds, THIRTY SECONDS OF NOT TOUCHING THE MOUSE NAVIGATED THE USER
        OFF THIS SCREEN.

        That is bad on any screen and specifically wrong on this one. This is the product's
        entrance and the frame somebody stands in front of while they talk about it — the
        investor walkthrough in `docs/02-investor-demo/` has a presenter describing the
        nine-agent topology out loud, which takes considerably longer than half a minute.
        The page moving on its own mid-sentence reads as a crash.

        A launcher does not decide where you go. Both real ways in remain, and both are
        deliberate: press the ONYX hub, or press "Open Decision Commander" (Escape does
        the same). The authenticated shell no longer mounts any idle navigation.
      */}

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
        className="sr-only focus:not-sr-only focus:absolute focus:bottom-4 focus:left-1/2 focus:-translate-x-1/2 focus:rounded-full focus:border focus:border-(--void-focus) focus:bg-(--void-bg) focus:px-4 focus:py-2 focus:text-[12px] focus:text-(--void-focus)"
      >
        Skip the intelligence layer and open the ERP
      </button>
    </main>
  );
}
