"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE ONYX MAP, IN THE VOID — where the travel lands.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Same room as the Brain: the same near-black, the same aurora gradient, the same stroke
 * language, no panel edges, no chrome. The reader has just travelled through the inside of
 * the Brain and arrived somewhere wider — the continuity is the point, so this scene
 * inherits the Brain's light rather than being a different picture that happens to follow
 * it.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * THE LAYOUT IS NOT INVENTED HERE
 * ───────────────────────────────────────────────────────────────────────────────
 * ONYX at the hub with HEXA, MICA, SPAR, AXLE, KILN and RASP around it, each at the angle
 * the pitch deck's Agent Brain map puts it at, is already a fact in this codebase —
 * `DEPARTMENTS` carries the angle, the letter and the colour, transcribed from the deck.
 * This screen READS that. Had it hard-coded its own six positions there would be two
 * layouts to keep in step and they would drift by the second demo.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * THE CONNECTIONS ARE STRAIGHT, AND TRIMMED AT BOTH ENDS
 * ───────────────────────────────────────────────────────────────────────────────
 * They used to bow. The argument for the bow was that a curve reads as something grown and
 * a straight line reads as a wiring diagram — which is true, and which turns out to be the
 * wrong thing to optimise on a screen whose job is to say WHO TALKS TO WHOM. A bow leaves
 * the hub on one bearing and arrives on another, so the eye has to follow the whole arc to
 * learn what it joins. Six arcs bulging the same way also crowd their neighbours near the
 * middle, which is precisely where they are already closest.
 *
 * Every path here is `M … L …` and nothing else — no control points exist to bend it. Two
 * consequences worth stating because they are the reason it is unambiguous rather than
 * merely tidy:
 *
 *   · A radial line's BEARING names its destination on its own. Nothing has to be traced.
 *   · Both ends are pulled back into clear air — off the hub ring, off the node ring — so a
 *     connection visibly starts at one agent and stops at another instead of disappearing
 *     under whatever it touches. Ends that vanish under a disc are how you get six lines
 *     that could each belong to anybody.
 *
 * The closest pair of bearings on this layout is 45° after ACHILES joins the eight
 * specialists. `CONNECTIONS` below publishes that figure for the harness rather than
 * leaving it to be eyeballed.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHAT A NODE IS
 * ───────────────────────────────────────────────────────────────────────────────
 * A door into the real ERP. Clicking HEXA goes to `/department/HEXA` — the existing route,
 * with the existing permission gates, the existing data. Nothing here is a mock.
 *
 * A department the viewer cannot reach is drawn DIMMED AND UNCLICKABLE rather than hidden.
 * On a launcher whose whole message is "this is the whole factory", a missing node would
 * quietly redraw the architecture around one person's permissions.
 */

import { memo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { DEPARTMENTS, type Department } from "../registry/departments";
import { BYLINE, HUB, MARK, NAME, NOTE } from "./xelor-type";

export interface VoidDept {
  dept: Department;
  /** Whether this viewer can open anything inside it. */
  reachable: boolean;
  /** How many modules they can actually see. */
  moduleCount: number;
}

export interface VoidRuntime {
  state: "checking" | "live" | "unavailable";
  providerMode: string | null;
  connectedAgentKeys: readonly string[];
}

/* ─────────────────────────────── the geometry ─────────────────────────────── */

const CX = 500;
const CY = 340;
/** Elliptical rather than circular: a 16:9 window is wider than it is tall and so is this. */
const RX = 340;
const RY = 218;
/** The hub ring, and the ring around a department. Connections stop clear of both. */
const HUB_R = 54;
const NODE_R = 37;
/** The clear air at each end of a connection. Small, and it is what makes an end an end. */
const GAP = 11;
/** The pressable disc. Comfortably past the 44-unit floor for a pointer target. */
const DISC = 108;
/**
 * HOW FAR A HIT AREA REACHES PAST THE RING IT LOOKS LIKE.
 *
 * A department's disc is 54 units of radius around a 37-unit ring — half again as large as
 * the thing you are aiming at, which is why they feel easy. The hub was given a flat ten
 * units of padding instead, so its ring, being bigger, ended up with a target only a fifth
 * larger than itself. Aim at the ONYX ring the way you aim at a department ring — a little
 * wide — and a department registers while the hub does not.
 *
 * Expressed as the same RATIO rather than as another hand-picked pad, so the two cannot
 * drift apart again when either ring is resized.
 */
const HIT_RATIO = DISC / 2 / NODE_R;
const HUB_HIT = Math.round(HUB_R * HIT_RATIO);
/**
 * The caption box, square and centred on the node. Square matters: the caption may be
 * anchored above OR below by the radial rule, and an asymmetric box would put one of the two
 * arrangements closer to its ring than the other.
 */
const BOX = 208;

/**
 * A viewBox unit, expressed as a length the CONTROL LAYER can use.
 *
 * The svg is `viewBox="0 0 1000 680"` at `width:100%` with auto height, so it always renders
 * at exactly 1000:680 with no letterboxing and one viewBox unit is always 1/1000th of the
 * layer's width. `cqw` is 1% of that width, so a unit is 0.1cqw — and every size written this
 * way tracks the drawing through a resize without anything measuring anything.
 *
 * It has to be a container query unit rather than `vw`: the map is capped by THREE terms
 * (`min(94vw, 1180px, (100vh - 160px) * 1.4706)`) and on most windows the binding one is not
 * the viewport width, so `vw` would drift away from the picture exactly when the picture was
 * being clamped.
 */
const cq = (units: number): string => `${(units / 10).toFixed(4)}cqw`;

export interface Connection {
  code: string;
  /** `M x1 y1 L x2 y2`. Two commands, no control points — straightness by construction. */
  d: string;
  /** Needed for the draw-on reveal: the dash pattern is the whole segment. */
  length: number;
  /** Bearing from the hub, in degrees. Published so ambiguity can be measured, not judged. */
  bearing: number;
}

/**
 * Where each department sits, and the trimmed segment that joins it to ONYX.
 *
 * Exported because the transition harness asserts on it directly: a claim like "no two
 * connections are closer than 40°" belongs to the geometry, and reading it off a screenshot
 * would be measuring the renderer instead of the layout.
 */
export function mapLayout(codes: readonly string[]): {
  points: Record<string, { x: number; y: number }>;
  connections: Connection[];
  minBearingGap: number;
} {
  const points: Record<string, { x: number; y: number }> = {};
  const connections: Connection[] = [];

  for (const code of codes) {
    const dept = DEPARTMENTS.find((d) => d.code === code);
    if (!dept) continue;
    const rad = (dept.angle * Math.PI) / 180;
    const x = CX + RX * Math.cos(rad);
    const y = CY + RY * Math.sin(rad);
    points[code] = { x, y };

    const dx = x - CX;
    const dy = y - CY;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const x1 = CX + ux * (HUB_R + GAP);
    const y1 = CY + uy * (HUB_R + GAP);
    const x2 = x - ux * (NODE_R + GAP);
    const y2 = y - uy * (NODE_R + GAP);
    connections.push({
      code,
      d: `M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)}`,
      length: Math.hypot(x2 - x1, y2 - y1),
      bearing: (Math.atan2(dy, dx) * 180) / Math.PI,
    });
  }

  // The smallest angle between any two connections. Straight radial lines can only be
  // confused with each other when their bearings converge, so this one number is the whole
  // ambiguity question for this layout.
  let minBearingGap = 360;
  for (let i = 0; i < connections.length; i++) {
    for (let j = i + 1; j < connections.length; j++) {
      const a = connections[i];
      const b = connections[j];
      if (!a || !b) continue;
      let gap = Math.abs(a.bearing - b.bearing) % 360;
      if (gap > 180) gap = 360 - gap;
      minBearingGap = Math.min(minBearingGap, gap);
    }
  }
  return { points, connections, minBearingGap };
}

/* ─────────────────────────────── the reveal ──────────────────────────────── */

/**
 * THE NETWORK ARRIVES OUT OF THE HUB, IN ORDER, AND THEN IT STOPS.
 *
 * The hub resolves first — it is what the camera flew into. Then each connection DRAWS
 * outward from it, and each node rides out along the line that had just reached its place.
 * That order is the argument the screen is making: ONYX is not one of nine equal things in
 * a ring, it is the supervisor the eight specialists hang off.
 *
 * Delays are per element rather than a chain of timers. A timer chain re-renders React six
 * times during the most performance-sensitive second of the product; a transition-delay is
 * handed to the compositor once and costs the main thread nothing after that.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * THESE NUMBERS WERE HALVED, ON PURPOSE
 * ───────────────────────────────────────────────────────────────────────────────
 * The journey was 1.28 s and then 1.02 s, both chosen against a "0.9–1.5 s" brief. Watched
 * rather than measured, it read as LATENCY: the press lands, and then you wait. A transition
 * you are willing to sit through once is one you resent by the fifth sign-in, and this is a
 * screen people pass through every morning.
 *
 * So the whole schedule is now 460 ms of reveal starting 130 ms after the press — 590 ms,
 * click to clickable. The stages and their order are untouched; only the clock moved. What
 * was lost is the pause between them, which was the part being read as lag.
 */
const STAGGER = 22;
const HUB_MS = 240;
const LINE_AT = 45;
const LINE_MS = 230;
const NODE_AT = 70;
const NODE_MS = 280;
const LABEL_AT = 150;
const LABEL_MS = 180;
/**
 * The last thing to finish — a MAXIMUM over every schedule, not the one that happens to be
 * written last.
 *
 * This was `LABEL_AT + … + LABEL_MS` on the assumption that the label, arriving last, also
 * finishes last. It does not: the label starts 120 ms after its node but runs 140 ms shorter,
 * so the NODE is what stops last, by twenty milliseconds. Twenty milliseconds of a door
 * accepting a press while it is still sliding — invisible to read, and the harness caught it
 * on the first run. Taking the max means adjusting any one stage cannot reintroduce it.
 */
export const MAP_SETTLE_MS = Math.max(
  HUB_MS,
  LINE_AT + 7 * STAGGER + LINE_MS,
  NODE_AT + 7 * STAGGER + NODE_MS,
  LABEL_AT + 7 * STAGGER + LABEL_MS,
);

/** The hub's own door. ONYX owns `aiops`, so its reachability is that module's. */
export interface VoidHub {
  reachable: boolean;
  moduleCount: number;
}

function OnyxVoidMapInner({
  departments,
  onyx,
  visible,
  settled,
  onSettled,
  reduced,
  lowPower,
  onReturn,
  runtime,
}: {
  departments: readonly VoidDept[];
  /** ONYX itself — a door like the other six, not a decoration at the centre of them. */
  onyx: VoidHub;
  /** Begin arriving. Set while the Brain is still leaving, so the two motions overlap. */
  visible: boolean;
  /** Everything has stopped moving. Only now do the doors accept a press. */
  settled: boolean;
  /**
   * Reported by the scene when the last node's own transition ends, rather than predicted
   * by a timer. See the handler below — the two are not the same number under load.
   */
  onSettled: () => void;
  reduced: boolean;
  lowPower: boolean;
  onReturn: () => void;
  runtime: VoidRuntime;
}): React.JSX.Element {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [hubOn, setHubOn] = useState(false);

  /**
   * ───────────────────────────────────────────────────────────────────────────────
   * ONCE ARRIVED, THIS MAP HOLDS STILL.
   * ───────────────────────────────────────────────────────────────────────────────
   * The nodes used to float on individual clocks and the scene answered the cursor with a
   * parallax tilt. It looked alive, and it was wrong: this is a set of six doors, and every
   * one of them was a moving target. Aiming at a thing that slides away from the pointer is
   * a tax paid on every single use, hardest by whoever has the least steady hand.
   *
   * What moves is LIGHT, not position — the aurora sweep, and one pulse running out along
   * each open pathway. Light travelling down a wire moves nothing you are trying to press.
   */

  const { connections, minBearingGap } = mapLayout(
    departments.map((d) => d.dept.code),
  );
  const byCode = new Map(connections.map((c) => [c.code, c]));

  const nodes = departments.map(({ dept, reachable, moduleCount }, i) => {
    const rad = (dept.angle * Math.PI) / 180;
    return {
      /**
       * A CAPTION SITS ON THE SIDE AWAY FROM ONYX. ALWAYS.
       *
       * Every label used to hang below its ring, which is fine for five of the six and
       * wrong for HEXA: HEXA is directly above the hub, so "below its ring" is BETWEEN the
       * ring and the hub, and its own connection ran straight through the word. Measured,
       * not noticed — the line and the caption are both faint and pale and the eye reads
       * them as one smudge rather than as a collision.
       *
       * The rule is radial rather than a special case for HEXA: the label goes on the far
       * side of the node from the centre, so nothing can ever be between a ring and its own
       * wire. It also happens to look deliberate — the top three caption above, the bottom
       * three below, symmetrically.
       */
      labelAbove: Math.sin(rad) < 0,
      dept,
      reachable,
      moduleCount,
      i,
      x: CX + RX * Math.cos(rad),
      y: CY + RY * Math.sin(rad),
      link: byCode.get(dept.code),
    };
  });

  /**
   * REDUCED MOTION IS NOT "THE SAME THING, SLOWER".
   *
   * Every from-state below — the node sitting at the hub, the pathway drawn back to nothing
   * — is POSITIONAL, and positional is precisely what somebody who set that preference asked
   * to be rid of. So when `reduced` is set there is no from-state at all: the finished
   * picture, arriving on opacity alone, in one step, in the same order it would otherwise
   * have been assembled. Same information, same destination, nothing travels.
   *
   * `anim` is the switch, and it is read in one place per element so a from-state cannot be
   * added later without going past it.
   */
  const anim = !reduced;
  const ease = "cubic-bezier(.16,1,.3,1)";
  const step = (at: number, ms: number, i: number, prop: string): string =>
    anim
      ? `${prop} ${ms}ms ${ease} ${at + i * STAGGER}ms`
      : `${prop} 240ms linear`;

  /**
   * A CORRECTION THAT WAS NOT NEEDED, AND THE MEASUREMENT THAT SAID SO.
   *
   * Tracked text is famously centred wrong: `letter-spacing` puts a gap after EVERY glyph
   * including the last, so the advance width an anchor centres on is one whole tracking wider
   * than the ink, and the ink sits half a tracking to the left. Reasoning from that, ONYX was
   * given a +2.1 unit nudge and each HTML label a compensating left pad.
   *
   * Measured, on both rulers — `getExtentOfChar` for the glyph box and `getBBox` for the
   * layout box — with the nudge applied ONYX's ink sat 2.10 units RIGHT of its hub. Which is
   * exactly the size of the nudge: this engine had already centred it, and the correction was
   * the only thing making it wrong. The HTML labels came out the same way, 0.21 units off
   * before the pad and 1.41 after.
   *
   * Both are gone. The reasoning is sound and is not the point — an engine's actual behaviour
   * outranks it, and a defect introduced by fixing an imaginary one is still a defect.
   */

  return (
    <div
      className="relative grid h-full w-full place-items-center"
      style={{
        opacity: visible ? 1 : 0,
        transition: reduced ? "opacity 260ms linear" : "opacity 420ms ease-out",
      }}
    >
      {/*
        THE MAP IS CAPPED BY HEIGHT AS WELL AS BY WIDTH, and the second cap is the one that
        was missing. `min(94vw, 1180px)` alone sizes a 1000 × 680 picture from the width only,
        so on a 1366 × 768 window it asked for 1180 across and therefore 802 down — thirty-four
        pixels TALLER than the window it was drawn in. AXLE's caption ran under the way back
        and the bottom of the scene was simply off the screen. It looked fine at 1920 × 1080,
        which is the only size anybody had opened.

        `(100vh - 160px) × 1.4706` is the same 1000 : 680 ratio read the other way: the widest
        this picture may be if it is to fit the height it has been given, less the two bands
        that belong to the window rather than to the map — the wordmark above, the way back
        below. Three terms, and whichever binds is the one that was going to clip.
      */}
      {/* `relative` is load-bearing now: the control layer below the svg is `absolute
          inset-0` of THIS box, which is the box the svg fills exactly. */}
      <div
        className="relative w-full"
        style={{
          maxWidth: "min(94vw, 1180px, calc((100vh - 160px) * 1.4706))",
        }}
      >
        <svg
          viewBox="0 0 1000 680"
          className="block w-full"
          style={{ overflow: "visible" }}
          // Facts the transition harness reads instead of inferring. Straightness in
          // particular cannot be judged from a picture: a barely-bowed quadratic looks
          // straight at demo size and is not.
          data-onyx-connections={connections.length}
          data-onyx-min-bearing-gap={
            connections.length > 1 ? minBearingGap.toFixed(2) : "0"
          }
        >
          <defs>
            {/* The Brain's aurora, unchanged. Same room, same light. */}
            <linearGradient
              id="ind-void-aurora"
              gradientUnits="userSpaceOnUse"
              x1="80"
              y1="620"
              x2="920"
              y2="60"
            >
              <stop offset="0%" stopColor="var(--void-aurora-1)" />
              <stop offset="30%" stopColor="var(--void-aurora-2)" />
              <stop offset="58%" stopColor="var(--void-aurora-3)" />
              <stop offset="82%" stopColor="var(--void-aurora-4)" />
              <stop offset="100%" stopColor="var(--void-aurora-5)" />
              {/*
                Gated on `visible`, and that is a consequence of the pre-warm rather than a
                style choice. The Gateway now makes this scene VISIBLE at zero opacity half a
                second after arrival, so its first paint is paid in idle time — but a SMIL
                animation in a visible subtree keeps ticking whether or not anything can be
                seen, and an endless gradient sweep behind a transparent layer is main-thread
                work spent on nothing, for as long as somebody leaves the Brain open.

                Mounting it when the map arrives costs one element. `visibility: hidden` used
                to hide this problem; making the paint cheap uncovered it.
              */}
              {!reduced && visible ? (
                <animateTransform
                  attributeName="gradientTransform"
                  type="translate"
                  values="-120 60; 120 -60; -120 60"
                  dur="21s"
                  repeatCount="indefinite"
                />
              ) : null}
            </linearGradient>

            {/* Hub-sized, not scene-sized. The wash used to be a 430×300 ellipse covering
                most of the picture, which is a lot of paint to say "there is light here"
                when the Gateway is already laying two aurora fields behind this. Shrinking
                it to the hub does the one job that is actually this component's: marking
                which of the nine agents the other eight answer to. */}
            <radialGradient id="ind-void-core">
              <stop offset="0%" stopColor="var(--void-core-a)" />
              <stop offset="60%" stopColor="var(--void-core-b)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>

            {!lowPower ? (
              <filter
                id="ind-void-bloom"
                x="-30%"
                y="-30%"
                width="160%"
                height="160%"
              >
                {/* 3.2, down from 4.5. The old radius was doing the work of a glow AND of a
                    fill; with the panels gone underneath the type it was only smearing. */}
                <feGaussianBlur stdDeviation="3.2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ) : null}
          </defs>

          {/* ─────────────────────────── the connections ─────────────────────────── */}
          <g style={{ filter: lowPower ? "none" : "var(--map-bloom)" }}>
            {nodes.map(({ dept, reachable, link, i }) => {
              if (!link) return null;
              const on = hovered === dept.code;
              const connected = runtime.connectedAgentKeys.includes(dept.code);
              return (
                <g key={`link-${dept.code}`}>
                  <path
                    id={`ind-void-path-${dept.code}`}
                    d={link.d}
                    fill="none"
                    stroke="url(#ind-void-aurora)"
                    strokeWidth={on && reachable ? 1.8 : 0.9}
                    strokeLinecap="round"
                    opacity={
                      reachable
                        ? connected || runtime.state === "checking"
                          ? on
                            ? 0.95
                            : 0.52
                          : 0.2
                        : 0.14
                    }
                    style={{
                      /**
                       * THE DRAW-ON. One dash the length of the whole segment, walked back
                       * to zero — the line grows out of ONYX rather than switching on.
                       *
                       * In `style` rather than as a presentation attribute, and that is not a
                       * preference. A CSS transition animates a computed CSS value; a
                       * presentation attribute only feeds that value at the very bottom of the
                       * cascade, and whether changing one starts a transition has never been
                       * reliable across engines. Written as a style it is an ordinary CSS
                       * property change and it transitions the way every other one here does.
                       *
                       * No dash at all under reduced motion: a line that draws itself is
                       * motion, whatever it is made of.
                       */
                      strokeDasharray: anim
                        ? link.length.toFixed(2)
                        : undefined,
                      strokeDashoffset:
                        anim && !visible ? link.length.toFixed(2) : 0,
                      transition: [
                        step(LINE_AT, LINE_MS, i, "stroke-dashoffset"),
                        "stroke-width 300ms ease",
                        "opacity 300ms ease",
                      ].join(", "),
                    }}
                    data-straight="M-L"
                  />
                  {/* A pulse travelling OUT from ONYX along the same straight segment — the
                      brain reaching into a department. Only where the door actually opens: a
                      pulse running to a node the viewer cannot enter would be the scene
                      telling a small lie about their own access. Held back until the network
                      has settled, so nothing is in flight while the lines are still drawing. */}
                  {settled &&
                  !reduced &&
                  !lowPower &&
                  reachable &&
                  (connected || runtime.state === "checking") ? (
                    <circle r={2.2} fill="url(#ind-void-aurora)" opacity={0.85}>
                      <animateMotion
                        dur={`${(5 + i * 0.6).toFixed(2)}s`}
                        repeatCount="indefinite"
                      >
                        <mpath href={`#ind-void-path-${dept.code}`} />
                      </animateMotion>
                      <animate
                        attributeName="opacity"
                        values="0;0.9;0.9;0"
                        keyTimes="0;0.18;0.78;1"
                        dur={`${(5 + i * 0.6).toFixed(2)}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  ) : null}
                </g>
              );
            })}
          </g>

          {/* ───────────────────────────────── the hub ──────────────────────────────── */}
          {/*
            Positioned through the CSS `transform` property rather than the SVG attribute,
            and with `transform-origin` pinned to the viewBox origin. That combination is
            what makes `translate(500px,340px) scale(s)` scale about the hub itself and
            interpolate cleanly — an unpinned origin resolves against the element's own
            bounding box, which moves as the figure does, and the reveal drifts.
          */}
          <g
            style={{
              transform:
                anim && !visible
                  ? `translate(${CX}px, ${CY}px) scale(0.55)`
                  : `translate(${CX}px, ${CY}px) scale(1)`,
              transformOrigin: "0px 0px",
              opacity: visible ? 1 : 0,
              transition: anim
                ? `transform ${HUB_MS}ms ${ease}, opacity ${HUB_MS}ms ease-out`
                : "opacity 240ms linear",
            }}
          >
            <circle r={150} fill="url(#ind-void-core)" />
            <g style={{ filter: lowPower ? "none" : "var(--map-bloom)" }}>
              {/* One breathing ring, and only one. The inner `#050810` disc that used to sit
                  under the type is gone: nothing crosses the hub's interior any more, because
                  every connection now stops a clear eleven units outside this ring. A panel
                  that hides nothing is decoration. */}
              {/* Gated on `settled` for the same reason as the aurora sweep above, plus one
                  of its own: a ring pulsing outward while the hub is still growing INTO place
                  is two motions arguing about which one the eye should follow. */}
              {settled && !reduced && !lowPower ? (
                <circle
                  r={HUB_R}
                  fill="none"
                  stroke="url(#ind-void-aurora)"
                  strokeWidth={0.9}
                >
                  <animate
                    attributeName="r"
                    values="54;78"
                    dur="4.8s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.3;0"
                    dur="4.8s"
                    repeatCount="indefinite"
                  />
                </circle>
              ) : null}
              {/* The accent on approach, exactly as a department node answers the pointer.
                  ONYX now IS a door, so it has to behave like one. */}
              {hubOn && onyx.reachable && !reduced ? (
                <circle
                  r={HUB_R + 12}
                  fill="var(--dept-onyx)"
                  opacity="var(--hub-halo-alpha)"
                />
              ) : null}
              {/* Tagged because it is the ring a HAND aims at, and the harness has to be able
                  to tell it apart from the pulse above (whose radius sweeps 54→78) and the
                  hover halo (which is not always there). Measuring the wrong one made the hub
                  look under-sized by a third when it was not. */}
              <circle
                data-onyx-ring
                r={HUB_R}
                fill="none"
                stroke="url(#ind-void-aurora)"
                strokeWidth={hubOn && onyx.reachable ? 2.3 : 1.5}
                opacity={hubOn && onyx.reachable ? 1 : 0.9}
                strokeDasharray={onyx.reachable ? undefined : "5 6"}
                style={{
                  transition: "stroke-width 300ms ease, opacity 300ms ease",
                }}
              />
              {/* The focal point of the whole map, in the XELOR face at its UNBOLDED step —
                  see `HUB`. It is the hub because of where it sits and how big it is, not
                  because it was the heaviest thing on screen.

                  `color` as well as `fill`: the glow class reads `currentColor`, and an SVG
                  `fill` does not set that. The mark's own light is the aurora, so the halo is
                  taken from the middle of the ramp rather than from one end of it. */}
              <text
                y={-3}
                textAnchor="middle"
                className="ind-mark-glow"
                style={{
                  ...HUB,
                  fill: "url(#ind-void-aurora)",
                  color: "var(--void-aurora-3)",
                  fontSize: 24,
                }}
                data-onyx-hub
              >
                ONYX
              </text>
              <text
                y={17}
                textAnchor="middle"
                style={{ ...BYLINE, fill: "var(--void-ink-soft)", fontSize: 8 }}
              >
                The Brain
              </text>
            </g>

            {/*
              THE HUB NAMES ITSELF ON APPROACH, exactly as the six do.

              This is not decoration. Every department answers the pointer twice — its ring
              brightens AND its full name appears — and the hub answered only once, so the one
              node that had just become a door was also the only one that did not behave like
              one. Somebody hovering it got a slightly thicker ring and no promise that
              anything was behind it.

              Outside the bloom group: this is small type, and a Gaussian blur merged under
              8-unit letters turns them to fog.
            */}
            <text
              y={HUB_R + 26}
              textAnchor="middle"
              data-onyx-hint
              style={{
                ...NOTE,
                fill: "var(--void-ink-soft)",
                // 8.5 was the smallest type on the map and it names the product's main
                // door. 10 is still subordinate to the department captions above it.
                fontSize: 10,
                opacity: hubOn && settled ? 0.9 : 0,
                transition: "opacity 300ms ease",
              }}
            >
              {onyx.reachable ? "Open Decision Commander" : "No access"}
            </text>

            {/*
              ═══════════════════════════════════════════════════════════════════════
              THE HUB IS A DOOR — an invisible button laid over the drawing, not a
              rebuild of it.
              ═══════════════════════════════════════════════════════════════════════
              ONYX was the only thing on this map you could not press, which made the
              centre of a picture about the brain the one part of it that did nothing.
              It now opens `/department/ONYX` — the AI Operations page, which already
              exists and already knows it is special (it is the one department whose
              satellites are the other six).

              WHY AN OVERLAY RATHER THAN A `<button>` AROUND THE ARTWORK. The rings and
              the wordmark are painted with `url(#ind-void-aurora)`, a gradient declared
              in `userSpaceOnUse` against THIS svg's coordinates. Moving them inside a
              `foreignObject`'s nested svg re-bases that user space and the colour
              changes — visibly, and for no reason the reader could name. So the drawing
              stays exactly where it is and a transparent real button sits on top of it.
              Enter and Space arrive for free, a screen reader announces a control, and
              the focus ring is a real focus ring rather than something drawn by hand.

              Sized by `HUB_HIT` — the same ring-to-target ratio a department gets — and NOT
              to the 150-unit core glow. Both bounds matter: too tight and it misses presses
              aimed a little wide, which is exactly how this shipped the first time; too loose
              and it swallows presses meant for the pathways behind it.
            */}
            {/* The hub's own button now lives in the HTML control layer below the svg, for
                the reason written at the top of `<ControlLayer>`. The artwork stays here. */}
          </g>
        </svg>

        {/*
          ══════════════════════════════════════════════════════════════════════════════
          THE CONTROL LAYER. Every real <button> and every caption in this scene, as HTML,
          sitting ON the drawing rather than inside it.
          ══════════════════════════════════════════════════════════════════════════════

          These were `foreignObject`s until a Safari screenshot arrived with all six
          departments piled on the SVG origin, their captions overprinting each other into
          "MACA" and "SKAN". The hub artwork and the connecting lines — SVG-native children
          of the same CSS-transformed groups — were positioned correctly in the same frame.
          That difference is the whole diagnosis: WebKit did not carry the group's CSS
          `transform` into its `foreignObject` descendants, so every node fell back to (0,0).

          It could not be reproduced here. Playwright's WebKitGTK build places the nodes
          correctly and the geometry spec passes against the OLD code, so the trigger is in
          Safari's own compositing path on macOS rather than in WebKit generally. Rather
          than chase a bug that only appears on hardware this repository cannot run, the fix
          removes the construct: there is no `foreignObject` anywhere in this scene now.

          The mapping is exact and needs no measurement. The svg is `viewBox="0 0 1000 680"`
          at `width:100%` with auto height, so it renders at precisely 1000:680 with no
          letterboxing — a viewBox unit is always 0.1% of this layer's width. `left`/`top` in
          percent place a node; `cqw` sizes it. Both track the svg through every resize for
          free, which is what `foreignObject` was buying and the only thing it was buying.
        */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ containerType: "inline-size" } as CSSProperties}
        >
          {/*
            ONYX'S OWN DOOR. Transparent, over the artwork rather than around it: the rings
            and the wordmark are painted with `url(#ind-void-aurora)`, declared
            `userSpaceOnUse` against the svg's coordinates, and wrapping them in a control
            would re-base that user space and shift the colour for no reason a reader could
            name. So the drawing stays put and a real button sits on top — Enter and Space
            arrive for free, a screen reader announces a control, and the focus ring is a
            real focus ring rather than something drawn by hand.

            Sized by `HUB_HIT`, the same ring-to-target ratio a department gets, and NOT to
            the 150-unit core glow. Both bounds matter: too tight and it misses presses aimed
            a little wide, which is exactly how this shipped the first time; too loose and it
            swallows presses meant for the pathways behind it.
          */}
          <button
            type="button"
            disabled={!onyx.reachable || !settled}
            onClick={() => router.push("/agentos/commander")}
            onPointerEnter={() => setHubOn(true)}
            onPointerLeave={() => setHubOn(false)}
            onFocus={() => setHubOn(true)}
            onBlur={() => setHubOn(false)}
            aria-label={
              onyx.reachable
                ? `ONYX Decision Commander. The live decision room connected to eight specialist agents. Opens ${onyx.moduleCount} module${onyx.moduleCount === 1 ? "" : "s"}.`
                : "ONYX Decision Commander. You do not have access to this surface."
            }
            className="pointer-events-auto absolute cursor-pointer rounded-full border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--void-focus) focus-visible:ring-offset-4 focus-visible:ring-offset-(--void-bg) disabled:cursor-default"
            style={{
              left: `${(CX / 1000) * 100}%`,
              top: `${(CY / 680) * 100}%`,
              width: cq(HUB_HIT * 2),
              height: cq(HUB_HIT * 2),
              transform: "translate(-50%, -50%)",
              opacity: visible ? 1 : 0,
            }}
          />

          {/* ─────────────────────────────── the specialist doors ─────────────────────────────── */}
          {nodes.map(
            ({ dept, x, y, reachable, moduleCount, i, labelAbove }) => {
              const on = hovered === dept.code;
              const last = i === nodes.length - 1;
              const connected = runtime.connectedAgentKeys.includes(dept.code);
              // Declared once and placed on whichever side the radial rule chose, so the two
              // arrangements cannot drift into being two different labels.
              const nameLine = (
                <p
                  className="pointer-events-none text-center text-(--void-ink-soft)"
                  style={{
                    ...NOTE,
                    maxWidth: cq(186),
                    fontSize: cq(8.5),
                    marginBlock: cq(6),
                    opacity: on && settled ? 0.9 : 0,
                    transition: "opacity 300ms ease",
                  }}
                >
                  {reachable ? dept.name : "No access"}
                </p>
              );

              return (
                // A ZERO-SIZED POINT AT THE NODE, with everything below placed against it.
                // The drawn ring and the geometry the connections were trimmed against are then
                // the same circle by construction, which is the only way they stay that way.
                <div
                  key={dept.code}
                  className="absolute"
                  style={{
                    left: `${(x / 1000) * 100}%`,
                    top: `${(y / 680) * 100}%`,
                    width: 0,
                    height: 0,
                  }}
                >
                  {/*
                  Rides out from the hub along the line that has just reached its place.
                  Starting AT the hub rather than fading in place is the whole reason the
                  network reads as having come out of the Brain.

                  THE LAST NODE REPORTS THAT THE SCENE HAS STOPPED. It used to be a
                  `setTimeout` in the Gateway set to the sum of the delays above, which is
                  right only if the transitions start the instant they are asked to. Measured
                  on a software renderer they start 170 ms late and finish 400 ms late, so the
                  timer was declaring the doors open while they were visibly still sliding — a
                  fixed prediction of a variable event. `transitionend` is the event itself;
                  the Gateway keeps a long backstop in case it never fires.
                */}
                  <div
                    className="absolute"
                    style={{
                      left: 0,
                      top: 0,
                      width: 0,
                      height: 0,
                      transform:
                        anim && !visible
                          ? `translate(${cq(CX - x)}, ${cq(CY - y)}) scale(0.4)`
                          : "translate(0px, 0px) scale(1)",
                      // Runtime connection and screen permission are different facts. A
                      // connected specialist stays visually connected even when this viewer
                      // cannot open that department; the button remains disabled and the
                      // caption still says "No access". Dimming the whole node previously made
                      // a live 9/9 graph look partially disconnected.
                      opacity: visible
                        ? connected
                          ? 1
                          : reachable
                            ? 0.72
                            : 0.32
                        : 0,
                      transition: [
                        step(NODE_AT, NODE_MS, i, "transform"),
                        step(NODE_AT, NODE_MS, i, "opacity"),
                      ].join(", "),
                    }}
                    onTransitionEnd={
                      last
                        ? (e) => {
                            if (e.target !== e.currentTarget) return;
                            if (
                              e.propertyName !== "transform" &&
                              e.propertyName !== "opacity"
                            )
                              return;
                            // Also fires on the way OUT, when the map is folding back into the
                            // hub. That is the opposite of settled.
                            if (visible) onSettled();
                          }
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      disabled={!reachable || !settled}
                      onClick={() => router.push(`/department/${dept.code}`)}
                      onPointerEnter={() => setHovered(dept.code)}
                      onPointerLeave={() => setHovered(null)}
                      onFocus={() => setHovered(dept.code)}
                      onBlur={() => setHovered(null)}
                      aria-label={
                        reachable
                          ? `${dept.code} — ${dept.name}. ${dept.tagline} Opens ${moduleCount} module${moduleCount === 1 ? "" : "s"}.`
                          : `${dept.code} — ${dept.name}. You do not have access to this department.`
                      }
                      // Round focus ring in the scene's own light. The product's global ring
                      // is a rectangle — right on every screen that has edges, wrong on the
                      // two that do not.
                      className="pointer-events-auto absolute grid cursor-pointer place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--void-focus) focus-visible:ring-offset-4 focus-visible:ring-offset-(--void-bg) disabled:cursor-default"
                      style={{
                        left: 0,
                        top: 0,
                        width: cq(DISC),
                        height: cq(DISC),
                        transform:
                          on && reachable && settled
                            ? "translate(-50%, -50%) scale(1.06)"
                            : "translate(-50%, -50%) scale(1)",
                        transition: `transform 360ms ${ease}`,
                      }}
                    >
                      <svg
                        viewBox={`0 0 ${DISC} ${DISC}`}
                        width="100%"
                        height="100%"
                        aria-hidden
                      >
                        {/* The accent appears on approach and nowhere else. Six coloured
                          haloes burning at rest is the "excess glow" this pass was asked
                          to take out; one under the pointer is an answer to the pointer. */}
                        {on && reachable && !reduced ? (
                          <circle
                            cx={DISC / 2}
                            cy={DISC / 2}
                            r={NODE_R + 9}
                            fill={dept.accent}
                            // Halved on the light panel — a dark accent at 13% over near-white
                            // is a grey blob rather than a coloured halo. See globals.css.
                            opacity="var(--node-halo-alpha)"
                          />
                        ) : null}
                        <circle
                          data-dept-ring
                          cx={DISC / 2}
                          cy={DISC / 2}
                          r={NODE_R}
                          fill="none"
                          stroke="url(#ind-void-aurora)"
                          strokeWidth={
                            connected || (on && reachable) ? 1.9 : 1.1
                          }
                          opacity={connected || (on && reachable) ? 1 : 0.7}
                          // A door that will not open says so in its own outline, before
                          // anybody reaches for it.
                          strokeDasharray={
                            connected || reachable ? undefined : "4 5"
                          }
                          style={{
                            transition:
                              "stroke-width 300ms ease, opacity 300ms ease",
                          }}
                        />
                        {connected ? (
                          <>
                            {/* Tokens, not `#34d399`. This scene has a LIGHT theme and a
                              hard-coded mint dot was being drawn on a near-white panel in
                              it; `--ok` resolves per theme and in dark resolves to very
                              nearly the hex that was here. */}
                            <circle
                              cx={DISC / 2 + NODE_R * 0.72}
                              cy={DISC / 2 - NODE_R * 0.72}
                              r={5}
                              fill="var(--ok)"
                              stroke="var(--void-bg)"
                              strokeWidth={2}
                            />
                            <circle
                              cx={DISC / 2 + NODE_R * 0.72}
                              cy={DISC / 2 - NODE_R * 0.72}
                              r={8}
                              fill="none"
                              stroke="var(--ok)"
                              strokeWidth={1}
                              opacity={0.45}
                            />
                          </>
                        ) : null}
                        {/* THE DEPARTMENT'S MARK, WITH ITS OWN LIGHT.
                          `color` carries the accent so `.ind-mark-glow` can read it as
                          `currentColor` — one CSS rule serves all specialists and nothing here
                          needs to know which agent it is drawing. A halo in dark, a tight
                          coloured shadow in light; see globals.css for why those are
                          different effects rather than the same one at two strengths.

                          A door nobody can open does not glow. The halo says "this is
                          live", and saying that about a department the viewer has no
                          access to is the scene telling a small lie about their own
                          permissions. */}
                        <text
                          x={DISC / 2}
                          y={DISC / 2 + 9}
                          textAnchor="middle"
                          className={
                            connected || reachable ? "ind-mark-glow" : undefined
                          }
                          style={{
                            ...MARK,
                            fill: dept.accent,
                            color: dept.accent,
                            fontSize: 25,
                            letterSpacing: 0,
                          }}
                        >
                          {dept.letter}
                        </text>
                      </svg>
                    </button>

                    {/*
                    THE CAPTION BLOCK, anchored on the outward side. Its height is the same
                    whichever side it is on and whether or not the name is showing — the
                    name is hidden with opacity, never with display, so approaching a node
                    cannot shift the word beneath it. A label that jumps when you point at
                    it is a label you have to read twice.

                    When it sits ABOVE, the code is the LAST child so it stays adjacent to
                    the ring and the name reads outward from it. Below, the order is simply
                    reversed. In both cases the primary label is the one nearest the thing
                    it names.
                  */}
                    <div
                      className="pointer-events-none absolute flex flex-col items-center"
                      style={{
                        left: 0,
                        width: cq(BOX),
                        transform: "translateX(-50%)",
                        ...(labelAbove
                          ? { bottom: cq(DISC / 2 - 8) }
                          : { top: cq(DISC / 2 - 8) }),
                      }}
                    >
                      {labelAbove ? nameLine : null}
                      {/* The code is always legible; the department's full name arrives on
                        hover or focus. Revealing the CODE too would leave six anonymous
                        rings — mystery at the cost of usefulness. */}
                      <p
                        className="text-center text-(--void-ink)"
                        style={{
                          ...NAME,
                          fontSize: cq(12),
                          opacity: visible ? 1 : 0,
                          transition: step(LABEL_AT, LABEL_MS, i, "opacity"),
                        }}
                      >
                        {dept.code}
                      </p>
                      {labelAbove ? null : nameLine}
                    </div>
                  </div>
                </div>
              );
            },
          )}
        </div>
      </div>

      {/*
        THE RUNTIME PILL — the one place this scene states a fact rather than draws a shape.

        TWO THINGS CHANGED HERE, and both were defects rather than preferences.

        THE COLOURS WERE LITERAL. `#34d399`, `#f59e0b`, `#f87171` and the mint glow were
        written into the component, which is the one thing `CLAUDE.md` says a screen may
        never do — and the cost was not theoretical: this scene has a LIGHT theme, and a
        dark-mode mint dot was being drawn on a near-white panel in it. `--ok` / `--warn` /
        `--bad` already resolve per theme, and in dark they resolve to very nearly the hexes
        that were hard-coded, so the dark scene is unchanged and the light one is fixed.

        THE TYPE WAS 9px. This pill carries the sentence the whole screen exists to justify
        — "9/9 agents connected" (ONYX plus its eight specialists) — and it was the
        smallest text in the product. 11px with
        the same tracking is still quiet and is actually readable in a bright plant office.
      */}
      <div
        className="pointer-events-none absolute top-[clamp(74px,9vh,108px)] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] text-(--void-ink-soft) backdrop-blur-md"
        style={{
          ...NOTE,
          borderColor:
            "color-mix(in srgb, var(--void-ink-soft) 20%, transparent)",
          background: "color-mix(in srgb, var(--void-bg) 72%, transparent)",
          letterSpacing: "0.13em",
          opacity: settled ? 0.9 : 0,
          transition: "opacity 400ms ease",
        }}
        aria-live="polite"
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background:
              runtime.state === "live"
                ? "var(--ok)"
                : runtime.state === "checking"
                  ? "var(--warn)"
                  : "var(--bad)",
            boxShadow:
              runtime.state === "live"
                ? "0 0 10px color-mix(in srgb, var(--ok) 80%, transparent)"
                : "none",
          }}
        />
        {runtime.state === "live"
          ? `${runtime.connectedAgentKeys.length}/${departments.length + 1} agents connected · ${runtime.providerMode ?? "provider"}`
          : runtime.state === "checking"
            ? "Verifying Agent OS connections"
            : "Agent runtime unavailable"}
      </div>

      {/* The way back. Discreet, always reachable by keyboard, and Escape does the same — a
          person who has just been shown a striking picture must never feel they have been
          trapped one level below it. Borderless now: a pill outline down here was the last
          rectangle in a scene whose whole argument is that it has no edges. */}
      {/*
        THE ALWAYS-VISIBLE WAY IN. The hub is the primary door and names itself on approach,
        but a door you have to hover to discover is not "a clear action" — so this is the one
        the brief's §8 requirement actually rests on, and it was 10px at 75% opacity.

        It stays BORDERLESS on purpose. A pill outline down here would be the last rectangle
        in a scene whose whole argument is that it has no edges, and clarity was never the
        outline's job — it is size, contrast and hit area. 11px, 92% opacity, and a taller
        target: 11px type with `py-2.5` measures ~44px, which is the floor this brief asks
        for on a primary control.
      */}
      <button
        type="button"
        onClick={onReturn}
        className="absolute bottom-[clamp(22px,6vh,64px)] inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[11px] text-(--void-ink-soft) transition-colors hover:text-(--void-focus) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--void-focus) focus-visible:ring-offset-4 focus-visible:ring-offset-(--void-bg)"
        style={{
          ...NOTE,
          letterSpacing: "0.24em",
          opacity: settled ? 0.92 : 0,
          transition: "opacity 400ms ease, color 200ms ease",
        }}
      >
        Open Decision Commander
        <span className="text-[10px] tracking-normal opacity-55">Esc</span>
      </button>
    </div>
  );
}

/**
 * MEMOISED, AND IT IS ABOUT LATENCY RATHER THAN TIDINESS.
 *
 * The Gateway changes state five times during the journey — commit, travel, map-in, onyx,
 * settled — and only two of those five change anything this component renders. Without a
 * memo it reconciled six `foreignObject`s, six nested svgs and their captions on all five,
 * three of them for nothing, during the exact window in which the transitions are trying to
 * start. The Gateway holds every other prop stable (`departments` is a `useMemo`, the two
 * callbacks are `useCallback`) specifically so this can bite.
 */
export const OnyxVoidMap = memo(OnyxVoidMapInner);

/** Every department the deck names, in the deck's own order, minus the brain itself. */
export function orbitDepartments(): readonly Department[] {
  return DEPARTMENTS.filter((d) => d.code !== "ONYX");
}
