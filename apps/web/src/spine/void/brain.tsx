"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE HOLLOW BRAIN — the first thing anybody sees after signing in.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Hand-authored SVG, and the choice is load-bearing rather than stylistic.
 *
 *   NOT THREE.JS. A WebGL brain would be a new dependency, a second rendering model
 *   nothing else in this product uses, a blank canvas to a screen reader, and a black
 *   rectangle on a machine with no GPU — which describes a good number of plant office
 *   PCs. This has to survive being demonstrated on somebody else's laptop.
 *
 *   NOT AN IMAGE. It has to be crisp on a projector, tintable, and it has to be zoomed
 *   THROUGH — the transition travels inside the form, and a raster brain becomes mush at
 *   4× let alone 16×.
 *
 *   SVG gives all of it: vector at any scale, a real <button> around it for keyboard and
 *   screen readers, and every animation expressible as `transform` and `opacity`, which
 *   are the two properties a compositor can run without touching the main thread.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * HOLLOW, AND WHY THAT IS THE WHOLE DESIGN
 * ───────────────────────────────────────────────────────────────────────────────
 * Nothing here is filled. The form is a silhouette contour, the fold lines inside it, and
 * a lattice of filaments strung between nodes — all strokes, all partly transparent, so
 * the void shows through and the shape reads as a volume of light rather than an organ.
 * That is also what makes the zoom work: you can travel through it because there is
 * genuinely nothing in the way.
 *
 * The palette is one aurora gradient — cyan, teal, indigo, violet, and a single restrained
 * magenta stop — swept slowly across the whole figure so the colour moves through the
 * form instead of the form moving. Restraint is the brief: no particle field, no bloom
 * storm, nothing that reads as a game engine's demo scene.
 */

import { useEffect, useState } from "react";

/* ────────────────────────────── the geometry ────────────────────────────── */

/**
 * The silhouette, drawn once, facing left. Frontal pole at the left, parietal crown over
 * the top, occipital at the right, cerebellum tucked under it, temporal lobe along the
 * bottom, and a stem below.
 *
 * Authored by hand and then corrected against a screenshot, which is the only way to get
 * a recognisable organic outline — a curve that reads correctly in numbers frequently
 * does not read correctly to an eye.
 */
const SILHOUETTE =
  "M74 168 C70 116 96 74 140 58 C168 48 190 56 214 52 C262 42 314 62 332 108 " +
  "C348 148 338 188 310 208 C300 232 276 246 250 246 C232 258 208 258 190 248 " +
  "C160 254 128 244 108 222 C86 210 76 190 74 168 Z";

/** The longitudinal fissure — the one line that makes a shape read as a brain. */
const FISSURE = "M150 60 C176 92 186 140 178 186 C172 218 178 234 190 248";

/**
 * The folds. Each is a lazy S following the contour inward at a different depth, and each
 * gets its own dash rhythm so the surface never pulses in unison.
 */
const FOLDS: readonly string[] = [
  "M104 96 C132 84 156 96 168 118 C180 140 174 164 156 176",
  "M126 202 C142 186 168 184 186 196 C204 208 210 226 204 242",
  "M206 66 C232 74 246 96 242 120 C238 144 220 158 198 158",
  "M254 60 C284 68 306 90 308 118 C310 144 294 164 270 170",
  "M296 128 C316 140 322 166 310 188 C300 206 280 214 260 210",
  "M242 190 C264 186 284 198 290 218 C294 232 288 244 276 250",
  "M96 140 C112 132 130 138 140 152 C150 166 148 184 136 194",
  "M170 214 C186 206 204 210 214 222 C222 232 222 244 216 252",
];

/** Where the filaments meet. Junctions, spread through the volume rather than on its edge. */
const NODES: readonly [number, number][] = [
  [126, 108], [176, 88], [232, 96], [286, 112], [306, 158],
  [150, 148], [206, 140], [258, 148], [180, 196], [238, 206],
  [122, 182], [282, 196], [204, 236], [156, 224],
];

/**
 * The lattice. Pairs of node indices, chosen to cross the interior rather than trace the
 * rim — the point is to make the inside look occupied by structure and still be see-through.
 */
const FILAMENTS: readonly [number, number][] = [
  [0, 5], [1, 5], [1, 6], [2, 6], [2, 7], [3, 7], [3, 4], [4, 11],
  [5, 6], [6, 7], [5, 8], [6, 8], [7, 9], [8, 9], [8, 12], [9, 12],
  [10, 5], [10, 13], [13, 8], [11, 9], [0, 10], [12, 13],
];

/** The stem, and the small flare where it leaves the mass. */
const STEM = "M206 250 C208 268 202 284 194 296";

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
  /** No blur filters, no dash animation — the shape and the colour survive. */
  lowPower: boolean;
  onActivate: () => void;
}): React.JSX.Element {
  const [hinted, setHinted] = useState(false);
  const [hot, setHot] = useState(false);

  // The cue arrives late and quietly. The brief is explicit that the brain is the call to
  // action; a label that appears with it would be the screen explaining a thing that is
  // supposed to invite a person to find out for themselves.
  useEffect(() => {
    const t = setTimeout(() => setHinted(true), 4200);
    return () => clearTimeout(t);
  }, []);

  /**
   * NOTHING IS FOCUSED ON ARRIVAL, and that is a correction rather than an omission.
   *
   * The first version focused the brain after 400 ms so a keyboard user would not have to
   * hunt for it. Photographed, that put a hard rectangular focus ring around the figure on
   * every single sign-in — the product's global focus treatment, doing exactly its job, in
   * the one place a rectangle destroys the scene. A mouse user was being shown a keyboard
   * affordance they had not asked for, on the frame that has to carry the whole first
   * impression.
   *
   * It costs a keyboard user nothing: this is the only control on the page, so the first
   * Tab lands on it, and then the ring appears — round, in the scene's own light, below.
   */
  const travelling = phase === "travelling";

  return (
    <div className="relative grid h-full w-full place-items-center">
      <button
        type="button"
        onClick={onActivate}
        onPointerEnter={() => setHot(true)}
        onPointerLeave={() => setHot(false)}
        onFocus={() => setHot(true)}
        onBlur={() => setHot(false)}
        // A real button, so Enter and Space arrive for free, the focus ring is the
        // product's own, and a screen reader announces a control rather than a graphic.
        aria-label="Enter the factory intelligence"
        // The focus ring is ROUND and in the scene's own colour. The product's global ring
        // is a 2px rectangle with an 8px radius, which is right on every screen that has
        // edges and wrong on the one that does not — it drew a hard blue box around the
        // brain. This replaces it rather than removing it: still 2px, still unmistakable,
        // still there for exactly the person it is for.
        className="group relative grid place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5eead4]/70 focus-visible:ring-offset-[10px] focus-visible:ring-offset-[#04060c]"
        style={{
          width: "min(74vmin, 620px)",
          height: "min(74vmin, 620px)",
          // The whole travel happens on this one element: one transform, one opacity, no
          // layout, nothing the main thread has to lay out mid-flight.
          transform: travelling
            ? "scale(15)"
            : hot && !reduced
              ? "scale(1.022)"
              : "scale(1)",
          opacity: travelling ? 0 : 1,
          transition: reduced
            ? "opacity 260ms linear"
            : travelling
              ? // Slow pull-in lives in the curve's long flat start, then it accelerates
                // away — the feeling of a camera committing rather than cutting.
                "transform 1750ms cubic-bezier(.72,0,.22,1), opacity 1750ms cubic-bezier(.9,0,1,.35)"
              : "transform 700ms cubic-bezier(.22,1,.36,1)",
          willChange: "transform, opacity",
        }}
      >
        <svg
          // Cropped to the figure, not to the canvas it was drawn on. The first pass used
          // the full 400×340 authoring box, so a third of the frame was empty space and
          // the brain sat small in the middle of its own button — it looked like a diagram
          // on a slide rather than a presence in a room.
          viewBox="52 30 316 292"
          className={reduced ? undefined : "ind-brain-breathe"}
          style={{ width: "100%", height: "100%", overflow: "visible" }}
          aria-hidden
        >
          <defs>
            {/* ONE aurora, swept across the whole figure. Because every stroke references
                the same gradient in userSpace, the colour belongs to the SCENE rather than
                to each path — so it travels through the form as the sweep moves, which is
                what an aurora actually does. */}
            <linearGradient
              id="ind-aurora"
              gradientUnits="userSpaceOnUse"
              x1="40"
              y1="300"
              x2="380"
              y2="30"
            >
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="26%" stopColor="#2dd4bf" />
              <stop offset="52%" stopColor="#818cf8" />
              <stop offset="76%" stopColor="#a78bfa" />
              {/* The one magenta stop, kept to the far end so it tints rather than shouts. */}
              <stop offset="100%" stopColor="#d946ef" />
              {!reduced ? (
                <animateTransform
                  attributeName="gradientTransform"
                  type="translate"
                  values="-70 40; 70 -40; -70 40"
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

            {/* The volumetric bloom. A real blur is the single most expensive thing on this
                page, so there is exactly one, at a modest radius, and a weak machine does
                not get it at all — the figure is legible without it. */}
            {!lowPower ? (
              <filter id="ind-bloom" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="7" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ) : null}
          </defs>

          {/* the faint volume the form sits inside */}
          <ellipse cx="203" cy="152" rx="185" ry="150" fill="url(#ind-volume)" />

          <g
            filter={lowPower ? undefined : "url(#ind-bloom)"}
            fill="none"
            stroke="url(#ind-aurora)"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              opacity: hot ? 1 : 0.9,
              transition: "opacity 500ms ease",
            }}
          >
            {/* the filaments, behind everything: structure seen through the surface */}
            <g strokeWidth={0.7} opacity={0.4}>
              {FILAMENTS.map(([a, b], i) => {
                const from = NODES[a];
                const to = NODES[b];
                if (!from || !to) return null;
                return (
                  <line
                    key={`f${i}`}
                    x1={from[0]}
                    y1={from[1]}
                    x2={to[0]}
                    y2={to[1]}
                    strokeDasharray={reduced || lowPower ? undefined : "2 7"}
                  >
                    {!reduced && !lowPower ? (
                      // A signal moving along the filament. Slow, and each one on its own
                      // clock — a lattice that flashes in time reads as a loading bar.
                      <animate
                        attributeName="stroke-dashoffset"
                        from="0"
                        to="-45"
                        dur={`${(5.5 + (i % 7) * 0.8).toFixed(1)}s`}
                        repeatCount="indefinite"
                      />
                    ) : null}
                  </line>
                );
              })}
            </g>

            {/* the junctions */}
            <g>
              {NODES.map(([x, y], i) => (
                <circle
                  key={`n${i}`}
                  cx={x}
                  cy={y}
                  r={1.9}
                  fill="url(#ind-aurora)"
                  stroke="none"
                  opacity={0.85}
                >
                  {!reduced && !lowPower ? (
                    <animate
                      attributeName="opacity"
                      values="0.35;0.95;0.35"
                      dur={`${(4 + (i % 5) * 1.1).toFixed(1)}s`}
                      repeatCount="indefinite"
                    />
                  ) : null}
                </circle>
              ))}
            </g>

            {/* the folds */}
            <g strokeWidth={1.15} opacity={0.62}>
              {FOLDS.map((d, i) => (
                <path key={`g${i}`} d={d} />
              ))}
            </g>

            {/* the fissure and the stem */}
            <path d={FISSURE} strokeWidth={1.35} opacity={0.72} />
            <path d={STEM} strokeWidth={1.35} opacity={0.5} />

            {/* the silhouette last, so it sits over the lattice and holds the shape */}
            <path d={SILHOUETTE} strokeWidth={1.7} opacity={0.95} />
          </g>
        </svg>
      </button>

      {/* THE CUE. Late, small, and out of the way — and it appears on hover or focus
          immediately, because a keyboard user should not have to wait four seconds to be
          told what the thing they have just landed on does. */}
      <p
        className="pointer-events-none absolute bottom-[13vh] text-center text-[12.5px] font-medium tracking-[0.34em] text-[#8fb3c9] uppercase"
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
