"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE HOLLOW BRAIN — a real three-dimensional form, revolving until it is pressed.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The geometry is in `brain-geometry.ts`: a hollow surface of points on a deformed
 * ellipsoid, joined into a wandering filament mesh. This file spins it and draws it.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHY THE SPIN DOES NOT GO THROUGH REACT
 * ───────────────────────────────────────────────────────────────────────────────
 * There are around five hundred elements in this figure. Re-rendering them through React
 * sixty times a second would mean thirty thousand virtual-DOM comparisons a second to
 * express one number changing — the rotation angle — and the main thread would have nothing
 * left for the rest of the sign-in.
 *
 * So the elements are created ONCE by React, and the animation frame writes their
 * coordinates straight onto the DOM nodes through refs. React owns what exists; the loop
 * owns where it is. This is the one place in the product where that trade is correct, and
 * it is correct because the structure never changes — only positions do.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * THE GLOW IS UNCHANGED
 * ───────────────────────────────────────────────────────────────────────────────
 * Same aurora gradient, same stops, same slow sweep, same single Gaussian bloom as the flat
 * version had. Only the geometry underneath it became three-dimensional. That was the
 * point: the light is the product's, and the form is what got better.
 */

import { memo, useEffect, useRef, useState } from "react";
import {
  BRAIN_EDGES,
  BRAIN_MESH,
  BRAIN_POINTS,
  BRAIN_STEM,
  brainViewBox,
  project,
} from "./brain-geometry";
import { BYLINE } from "./xelor-type";

/** Radians per second. A full turn takes about forty seconds — a drift, not a spin. */
const SPIN = 0.16;
/** Camera distance. Lower is a wider lens and a stronger sense of depth. */
const FOV = 3.4;
const SCALE = 118;
const CX = 0;
const CY = 0;

/**
 * Computed once from the geometry rather than written by hand. See `brainViewBox`: the
 * figure is not symmetric about the origin, so a hand-picked box puts it off-centre, and the
 * offset needed is not constant because the silhouette changes as the model turns.
 */
const VIEW_BOX = brainViewBox(SCALE, FOV, 1.0);

/**
 * THE THREE STAGES OF LEAVING.
 *
 *   idle        revolving, waiting
 *   commit      the acknowledgement — 130 ms, and it is not decoration
 *   travelling  the camera goes in
 *
 * `commit` exists because a press that produces nothing for a tenth of a second reads as a
 * press that missed. It is a small inward settle plus the mesh coming to full brightness:
 * the figure gathering itself before the move, which is also the last frame in which the
 * Brain's own light is the brightest thing on screen — the map then grows out of that.
 */
export type BrainPhase = "idle" | "commit" | "travelling";

/**
 * The acknowledgement. 70 ms, down from 130.
 *
 * This is the only part of the journey that is PURELY a pause — the figure barely moves and
 * nothing else has started — so it is the part most readily felt as lag. Long enough to
 * register as an answer to the press, short enough that nobody waits through it.
 */
export const BRAIN_COMMIT_MS = 70;
/**
 * How long the camera spends inside the figure. It was 870, and before that 1750.
 *
 * Halved because the journey read as latency rather than as travel — a screen people pass
 * through every morning cannot spend a second of it watching. The DISTANCE is unchanged;
 * only the time is, so it reads as a faster camera rather than a shorter move.
 */
export const BRAIN_TRAVEL_MS = 480;

/**
 * How far the camera goes. Fifteen, and now eight.
 *
 * At 15× the figure was several screens wide long before the opacity curve had finished with
 * it, and every one of those frames asked the compositor to re-raster a Gaussian-blurred
 * five-hundred-element mesh at a size nobody was looking at. Eight already fills the frame
 * and passes through; the rest was rasterisation nobody could see.
 */
const TRAVEL_SCALE = 8;

function BrainInner({
  phase,
  reduced,
  lowPower,
  onActivate,
}: {
  phase: BrainPhase;
  /** The viewer asked their machine to stop moving things. */
  reduced: boolean;
  /** No bloom filter — the shape and the colour survive without it. */
  lowPower: boolean;
  onActivate: () => void;
}): React.JSX.Element {
  const [hinted, setHinted] = useState(false);
  const [hot, setHot] = useState(false);

  const nodeRefs = useRef<(SVGCircleElement | null)[]>([]);
  const edgeRefs = useRef<(SVGLineElement | null)[]>([]);
  const stemRef = useRef<SVGPolylineElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const travelling = phase === "travelling";
  const committing = phase === "commit";
  const leaving = travelling || committing;

  // The cue arrives late and quietly. The brief is explicit that the brain is the call to
  // action; a label appearing with it would be the screen explaining a thing that is
  // supposed to invite a person to find out for themselves.
  useEffect(() => {
    const t = setTimeout(() => setHinted(true), 4200);
    return () => clearTimeout(t);
  }, []);

  /**
   * NOTHING TAKES FOCUS ON ARRIVAL.
   *
   * An earlier version focused the brain so a keyboard user would not have to hunt for it,
   * and that put the product's global focus ring — a rectangle, correct everywhere that has
   * edges — around the figure on every sign-in. This is the only control on the page, so
   * one Tab reaches it, and the ring below is round and in the scene's own light.
   */

  /**
   * THE LOOP. It runs while the brain is idle and stops the moment it is pressed — the
   * figure freezes at whatever angle it had reached, and the travel begins from there,
   * which is what makes the zoom feel like it went into the thing you were looking at
   * rather than into a different picture of it.
   */
  /**
   * THE DEPTH CURVE, READ FROM THE STYLESHEET.
   *
   * `base + span × depth` is how this figure says "that filament is behind this one", and the
   * two numbers belong to the PANEL rather than to the geometry: 6% is a faint grey line on
   * near-black and is nothing at all on near-white, where the far half of the mesh would
   * simply vanish and the form would stop reading as hollow.
   *
   * Read once per theme change rather than once per frame. `getComputedStyle` forces a style
   * flush, and doing that sixty times a second inside a loop whose whole purpose is to avoid
   * touching the main thread would undo the reason this loop exists at all.
   */
  const curve = useRef({ eBase: 0.06, eSpan: 0.42, nBase: 0.2, nSpan: 0.75 });
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    const read = (): void => {
      // Read from THIS element, not from `<html>`. The void's tokens are declared on the
      // `.ind-void` scope — they exist nowhere on the root — so asking the document for them
      // returns empty strings and every value silently falls back to the dark curve. Reading
      // from inside the subtree is what makes the cascade answer.
      const cs = getComputedStyle(hostRef.current ?? document.documentElement);
      const n = (name: string, fallback: number): number => {
        const v = parseFloat(cs.getPropertyValue(name));
        return Number.isFinite(v) ? v : fallback;
      };
      curve.current = {
        eBase: n("--brain-edge-base", 0.06),
        eSpan: n("--brain-edge-span", 0.42),
        nBase: n("--brain-node-base", 0.2),
        nSpan: n("--brain-node-span", 0.75),
      };
      // Nudges the draw loop so a theme switch repaints immediately instead of waiting for
      // the next rotation frame — which, under reduced motion, would be never.
      setThemeTick((t) => t + 1);
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;
    let angle = -0.5;
    let last = performance.now();

    const draw = (): void => {
      const { eBase, eSpan, nBase, nSpan } = curve.current;
      // Projected once per frame and reused by both passes, so a point and the filaments
      // that end on it can never disagree about where it is.
      const flat = BRAIN_POINTS.map((p) => project(p, angle, SCALE, FOV));

      for (let i = 0; i < flat.length; i++) {
        const el = nodeRefs.current[i];
        const p = flat[i];
        if (!el || !p) continue;
        el.setAttribute("cx", (CX + p.x).toFixed(2));
        el.setAttribute("cy", (CY + p.y).toFixed(2));
        // Depth, expressed three ways at once — size, brightness, and (through the edges
        // below) line weight. One cue is a hint; three together read as volume.
        el.setAttribute("r", (0.9 + p.depth * 1.5).toFixed(2));
        el.setAttribute("opacity", (nBase + p.depth * nSpan).toFixed(3));
      }

      for (let i = 0; i < BRAIN_EDGES.length; i++) {
        const el = edgeRefs.current[i];
        const e = BRAIN_EDGES[i];
        if (!el || !e) continue;
        const a = flat[e[0]];
        const b = flat[e[1]];
        if (!a || !b) continue;
        el.setAttribute("x1", (CX + a.x).toFixed(2));
        el.setAttribute("y1", (CY + a.y).toFixed(2));
        el.setAttribute("x2", (CX + b.x).toFixed(2));
        el.setAttribute("y2", (CY + b.y).toFixed(2));
        const d = (a.depth + b.depth) / 2;
        // The far side of a hollow surface is still visible — it has to be, or the form
        // stops being hollow — but it is faint enough that the eye reads it as behind.
        el.setAttribute("opacity", (eBase + d * eSpan).toFixed(3));
        el.setAttribute("stroke-width", (0.35 + d * 0.65).toFixed(2));
      }

      const stem = stemRef.current;
      if (stem) {
        stem.setAttribute(
          "points",
          BRAIN_STEM.map((p) => {
            const q = project(p, angle, SCALE, FOV);
            return `${(CX + q.x).toFixed(2)},${(CY + q.y).toFixed(2)}`;
          }).join(" "),
        );
      }
    };

    // Drawn once immediately, so the very first paint is the brain rather than a cluster of
    // circles sitting at the origin waiting for frame one.
    draw();

    // A person who asked for no motion gets the form, held still, at a three-quarter angle
    // that shows it is a volume. Everything else about the page still works.
    if (reduced) return;

    const tick = (now: number): void => {
      // Advanced by ELAPSED TIME, never by a fixed step per frame. A tab throttled to 10 Hz
      // in the background, or a 120 Hz laptop, would otherwise turn at wildly different
      // speeds — and the person watching would see the brain lurch when they came back to
      // it.
      angle += ((now - last) / 1000) * SPIN;
      last = now;
      draw();
      raf = requestAnimationFrame(tick);
    };

    if (!travelling) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(raf);
    // `themeTick` is in the list on purpose: it is what redraws the held frame when somebody
    // switches theme with reduced motion on, where no other frame is ever coming.
  }, [reduced, travelling, themeTick]);

  return (
    <div ref={hostRef} className="relative grid h-full w-full place-items-center">
      {/*
        THE WORDMARK IS NOT HERE ANY MORE — see `xelor-type.tsx` and the Gateway.

        It used to be a sibling of this button, and it faded out for the travel. Both were
        wrong once the journey became one continuous move: a mark that disappears halfway
        through means the screen briefly belongs to nobody, and a mark owned by the Brain
        cannot survive the Brain leaving. The Gateway renders it above both stances, where it
        holds still for the whole journey the way a name on a wall does.
      */}
      <button
        type="button"
        onClick={onActivate}
        onPointerEnter={() => setHot(true)}
        onPointerLeave={() => setHot(false)}
        onFocus={() => setHot(true)}
        onBlur={() => setHot(false)}
        // A real button, so Enter and Space arrive for free and a screen reader announces a
        // control rather than a graphic.
        aria-label="Enter the factory intelligence"
        // The mesh, as facts. A broken silhouette is invisible from most angles and obvious
        // from exactly one, which is the worst way for a defect to behave — so connectivity
        // is published for the harness to assert instead of being judged from a screenshot.
        data-brain-nodes={BRAIN_MESH.nodes}
        data-brain-edges={BRAIN_MESH.edges}
        data-brain-repairs={BRAIN_MESH.repairEdges}
        // Round focus ring in the scene's own colour: the product's global rectangle is
        // right on every screen that has edges and wrong on the one that does not. Both the
        // ring and its offset are themed — a teal ring on a white void is barely a ring, and
        // an offset painted the wrong background colour is a dark halo on a light page.
        className="group relative grid place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--void-focus) focus-visible:ring-offset-10 focus-visible:ring-offset-(--void-bg)"
        style={{
          /**
           * THE EXCLUSION ZONE, expressed as a size rather than policed as a rule.
           *
           * `min(76vmin, 640px)` alone collides with the text on small and short windows —
           * at 700×500 the figure reaches the wordmark, and at 1366×768 its lower edge
           * overlapped the cue by three pixels. The last two terms reserve the bands the
           * wordmark and the cue occupy, so the Brain cannot grow into either at ANY viewport
           * rather than merely not doing so at the sizes somebody happened to open.
           *
           * PIXELS, NOT `rem`. The first attempt reserved `13rem` and never bound: this app
           * sets a 13.5px root, so it resolved to 592px against a 584px figure and did
           * nothing at all. A reserve for physical space has no business being expressed in a
           * unit that follows the type scale.
           *
           * The cap is 760px rather than the old 640 to hold the figure's apparent size. The
           * viewBox is now computed from the shape the model SWEEPS through a full turn, so
           * nothing is ever clipped — but that box is 416 units against the 320 somebody had
           * picked by hand, and the old one was narrower than the widest frame. The figure
           * used to overflow its own button and only looked right because `overflow` is
           * visible. Framing it honestly made it 28% smaller; the larger button gives that
           * back without letting it spill towards the text again.
           */
          width: "min(82vmin, 760px, calc(100vh - 220px), calc(100vw - 64px))",
          height: "min(82vmin, 760px, calc(100vh - 220px), calc(100vw - 64px))",
          /**
           * THE ACKNOWLEDGEMENT, THEN THE MOVE.
           *
           * `commit` pulls the figure IN by four and a half percent. Backwards before
           * forwards is how a real camera move announces itself, and it is also the only
           * cue in the first tenth of a second that the press landed.
           *
           * The travel is 870 ms rather than the 1750 it was. The old number was chosen when
           * the map waited for the Brain to finish before it started, so the two motions ran
           * end to end and the journey took three and a half seconds — long enough that a
           * demo audience has time to wonder whether something has hung. Now they overlap,
           * so the same distance is covered in half the time and reads as faster AND calmer,
           * because nothing is ever the only thing on screen.
           */
          transform: travelling
            ? `scale(${TRAVEL_SCALE})`
            : committing
              ? "scale(0.955)"
              : hot && !reduced
                ? "scale(1.022)"
                : "scale(1)",
          opacity: travelling ? 0 : 1,
          transition: reduced
            ? "opacity 260ms linear"
            : travelling
              ? // The long flat start of this curve is the slow pull-in; then it commits.
                `transform ${BRAIN_TRAVEL_MS}ms cubic-bezier(.66,0,.24,1), opacity ${BRAIN_TRAVEL_MS}ms cubic-bezier(.9,0,1,.4)`
              : committing
                ? `transform ${BRAIN_COMMIT_MS}ms cubic-bezier(.4,0,.2,1)`
                : "transform 700ms cubic-bezier(.22,1,.36,1)",
          willChange: "transform, opacity",
        }}
      >
        <svg
          viewBox={VIEW_BOX}
          className={reduced ? undefined : "ind-brain-breathe"}
          style={{
            width: "100%",
            height: "100%",
            overflow: "visible",
            /**
             * THE BREATHE IS PAUSED FOR THE TRAVEL, not stopped.
             *
             * It is an eleven-second transform loop on the element INSIDE the one the camera
             * is scaling, and a transform that keeps changing on a child is what stops the
             * compositor caching the parent as a layer — so every frame of the travel was
             * re-rasterising a blurred five-hundred-element mesh instead of scaling a bitmap.
             *
             * `paused` rather than removing the class: removing it snaps the figure back to
             * its unbreathed position, which is a visible jolt at the exact moment the press
             * lands. Pausing holds whatever transform it had reached.
             */
            animationPlayState: leaving ? "paused" : "running",
          }}
          aria-hidden
        >
          <defs>
            {/* UNCHANGED from the flat version, deliberately. Same five stops, same sweep,
                same single bloom. The light is the product's; only the form moved into
                three dimensions. */}
            {/*
              THE SAME SWEEP, A DIFFERENT RAMP PER THEME.

              The stops read CSS variables rather than naming hexes, which is what allows a
              light mode to exist here at all. It is not the dark ramp dimmed: a glow is a
              bright thing and a bright thing on near-white is invisible — cyan-400 measures
              1.5:1 on the light field. The light ramp is the 600/700 level of the identical
              five hues, so the gradient sweeps the same way through the same colours and is
              legible for the opposite reason. See `.ind-void` in globals.css.
            */}
            <linearGradient
              id="ind-aurora"
              gradientUnits="userSpaceOnUse"
              x1="-140"
              y1="130"
              x2="140"
              y2="-120"
            >
              <stop offset="0%" stopColor="var(--void-aurora-1)" />
              <stop offset="26%" stopColor="var(--void-aurora-2)" />
              <stop offset="52%" stopColor="var(--void-aurora-3)" />
              <stop offset="76%" stopColor="var(--void-aurora-4)" />
              <stop offset="100%" stopColor="var(--void-aurora-5)" />
              {!reduced ? (
                <animateTransform
                  attributeName="gradientTransform"
                  type="translate"
                  values="-60 34; 60 -34; -60 34"
                  dur="17s"
                  repeatCount="indefinite"
                />
              ) : null}
            </linearGradient>

            {/* The soft volume the figure sits inside. Both stops are pre-multiplied colours
                in `.ind-void` rather than a colour plus an opacity, because the light theme
                needs a different ALPHA as well as a different hue — a 13% teal that reads as
                depth on near-black reads as a smudge on near-white. */}
            <radialGradient id="ind-volume">
              <stop offset="0%" stopColor="var(--void-core-a)" />
              <stop offset="45%" stopColor="var(--void-core-b)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>

            {!lowPower ? (
              <filter id="ind-bloom" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="5" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ) : null}
          </defs>

          <ellipse cx={0} cy={0} rx={150} ry={128} fill="url(#ind-volume)" />

          <g
            stroke="url(#ind-aurora)"
            fill="none"
            strokeLinecap="round"
            style={{
              // `none` on the light panel, decided in CSS beside every other colour rule
              // rather than here — see `--brain-bloom`. A blurred copy merged back over the
              // original is a glow on black and a grey smear on white.
              filter: lowPower ? "none" : "var(--brain-bloom)",
              // Full brightness on commit as well as on hover: the mesh flaring for a tenth
              // of a second is the light the map is about to be made out of.
              opacity: hot || leaving ? 1 : 0.92,
              transition: committing ? `opacity ${BRAIN_COMMIT_MS}ms linear` : "opacity 500ms ease",
            }}
          >
            {/* the filament mesh — the surface itself */}
            {BRAIN_EDGES.map((_, i) => (
              <line
                key={`e${i}`}
                ref={(el) => {
                  edgeRefs.current[i] = el;
                }}
              />
            ))}

            <polyline
              ref={stemRef}
              strokeWidth={1.1}
              opacity={0.5}
              strokeLinejoin="round"
            />

            {/* the junctions */}
            <g fill="url(#ind-aurora)" stroke="none">
              {BRAIN_POINTS.map((_, i) => (
                <circle
                  key={`n${i}`}
                  ref={(el) => {
                    nodeRefs.current[i] = el;
                  }}
                />
              ))}
            </g>
          </g>
        </svg>
      </button>

      {/* THE CUE. Late, small, out of the way — and immediate on hover or focus, because a
          keyboard user should not wait four seconds to learn what they have landed on. */}
      <p
        // `bottom` clamped in PIXELS rather than a bare `11vh`. On a short window 11vh is
        // barely eighty pixels and the cue climbs into the figure's lower edge; the floor
        // holds it clear, and the ceiling stops it drifting into the middle of a tall one.
        className="pointer-events-none absolute text-center text-[11.5px] text-(--void-ink-soft)"
        style={{
          // The byline step, exactly — same weight and same 0.34em as BY AIKYANTRA on the
          // sign-in page. It was `font-medium` at 12.5px, which is a fifth step in a system
          // that has four.
          ...BYLINE,
          bottom: "clamp(22px, 8vh, 76px)",
          // Gone the instant the press lands. A caption still saying "enter" while the
          // camera is already going in is the screen talking over itself.
          opacity: leaving ? 0 : hot || hinted ? 0.82 : 0,
          transform: hot || hinted ? "translateY(0)" : "translateY(8px)",
          transition: leaving
            ? "opacity 200ms ease"
            : "opacity 900ms ease, transform 900ms cubic-bezier(.22,1,.36,1)",
        }}
      >
        Enter the factory intelligence
      </p>
    </div>
  );
}

/**
 * Memoised for the same reason the map is: of the Gateway's five state changes during the
 * journey, only the two that alter `phase` mean anything here. The other three were
 * re-rendering five hundred and sixty-seven elements — the mesh, the junctions, the stem —
 * for no change at all, in the second where the main thread has the least to spare.
 *
 * `onActivate` is deliberately stable on the Gateway's side so this holds. If it ever starts
 * being rebuilt per render, this memo silently stops working and nothing fails.
 */
export const Brain = memo(BrainInner);
