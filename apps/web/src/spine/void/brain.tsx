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

import { useEffect, useRef, useState } from "react";
import { BRAIN_EDGES, BRAIN_POINTS, BRAIN_STEM, project } from "./brain-geometry";

/** Radians per second. A full turn takes about forty seconds — a drift, not a spin. */
const SPIN = 0.16;
/** Camera distance. Lower is a wider lens and a stronger sense of depth. */
const FOV = 3.4;
const SCALE = 118;
const CX = 0;
const CY = 0;

export type BrainPhase = "idle" | "travelling";

export function Brain({
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

  const travelling = phase === "travelling";

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
  useEffect(() => {
    let raf = 0;
    let angle = -0.5;
    let last = performance.now();

    const draw = (): void => {
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
        el.setAttribute("opacity", (0.2 + p.depth * 0.75).toFixed(3));
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
        el.setAttribute("opacity", (0.06 + d * 0.42).toFixed(3));
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
  }, [reduced, travelling]);

  return (
    <div className="relative grid h-full w-full place-items-center">
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
        // Round focus ring in the scene's own colour: the product's global rectangle is
        // right on every screen that has edges and wrong on the one that does not.
        className="group relative grid place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5eead4]/70 focus-visible:ring-offset-[10px] focus-visible:ring-offset-[#04060c]"
        style={{
          width: "min(76vmin, 640px)",
          height: "min(76vmin, 640px)",
          transform: travelling ? "scale(15)" : hot && !reduced ? "scale(1.022)" : "scale(1)",
          opacity: travelling ? 0 : 1,
          transition: reduced
            ? "opacity 260ms linear"
            : travelling
              ? // The long flat start of this curve is the slow pull-in; then it commits.
                "transform 1750ms cubic-bezier(.72,0,.22,1), opacity 1750ms cubic-bezier(.9,0,1,.35)"
              : "transform 700ms cubic-bezier(.22,1,.36,1)",
          willChange: "transform, opacity",
        }}
      >
        <svg
          viewBox="-160 -150 320 300"
          className={reduced ? undefined : "ind-brain-breathe"}
          style={{ width: "100%", height: "100%", overflow: "visible" }}
          aria-hidden
        >
          <defs>
            {/* UNCHANGED from the flat version, deliberately. Same five stops, same sweep,
                same single bloom. The light is the product's; only the form moved into
                three dimensions. */}
            <linearGradient
              id="ind-aurora"
              gradientUnits="userSpaceOnUse"
              x1="-140"
              y1="130"
              x2="140"
              y2="-120"
            >
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="26%" stopColor="#2dd4bf" />
              <stop offset="52%" stopColor="#818cf8" />
              <stop offset="76%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#d946ef" />
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

            <radialGradient id="ind-volume">
              <stop offset="0%" stopColor="#5eead4" stopOpacity="0.13" />
              <stop offset="45%" stopColor="#818cf8" stopOpacity="0.09" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
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
            filter={lowPower ? undefined : "url(#ind-bloom)"}
            stroke="url(#ind-aurora)"
            fill="none"
            strokeLinecap="round"
            style={{ opacity: hot ? 1 : 0.92, transition: "opacity 500ms ease" }}
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
        className="pointer-events-none absolute bottom-[11vh] text-center text-[12.5px] font-medium tracking-[0.34em] text-[#8fb3c9] uppercase"
        style={{
          opacity: hot || hinted ? 0.82 : 0,
          transform: hot || hinted ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 900ms ease, transform 900ms cubic-bezier(.22,1,.36,1)",
        }}
      >
        Enter the factory intelligence
      </p>
    </div>
  );
}
