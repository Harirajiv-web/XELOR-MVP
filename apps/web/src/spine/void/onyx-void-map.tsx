"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE ONYX MAP, IN THE VOID — where the zoom lands.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Same room as the Brain: the same near-black, the same aurora, no panel edges, no chrome.
 * The reader has just travelled through the inside of the brain and arrived somewhere
 * wider — the continuity is the point, so this scene inherits the Brain's palette and
 * stroke language exactly rather than being a different picture that happens to follow it.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * THE LAYOUT IS NOT INVENTED HERE
 * ───────────────────────────────────────────────────────────────────────────────
 * ONYX at the hub with HEXA, MICA, SPAR, AXLE, KILN and RASP around it, each at the angle
 * the pitch deck's Agent Brain map puts it at, is already a fact in this codebase —
 * `DEPARTMENTS` carries the angle, the letter and the colour, transcribed from the deck.
 * This screen READS that. It is a restyling of an established architecture, which is what
 * was asked for; had it hard-coded its own six positions there would be two layouts to
 * keep in step and they would drift by the second demo.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHAT A NODE IS
 * ───────────────────────────────────────────────────────────────────────────────
 * A door into the real ERP. Clicking HEXA goes to `/department/HEXA` — the existing route,
 * with the existing permission gates, the existing data. Nothing here is a mock, and this
 * component contains no knowledge of what is behind any door beyond its URL.
 *
 * A department the viewer cannot reach is drawn DIMMED AND UNCLICKABLE rather than hidden.
 * On a launcher whose whole message is "this is the whole factory", a missing node would
 * quietly redraw the architecture around one person's permissions.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEPARTMENTS, type Department } from "../registry/departments";

export interface VoidDept {
  dept: Department;
  /** Whether this viewer can open anything inside it. */
  reachable: boolean;
  /** How many modules they can actually see. */
  moduleCount: number;
}

export function OnyxVoidMap({
  departments,
  visible,
  reduced,
  lowPower,
  onReturn,
}: {
  departments: readonly VoidDept[];
  /** Drives the arrival: the map grows out of the point the brain collapsed into. */
  visible: boolean;
  reduced: boolean;
  lowPower: boolean;
  onReturn: () => void;
}): React.JSX.Element {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);

  /**
   * ───────────────────────────────────────────────────────────────────────────────
   * THIS MAP HOLDS STILL. It used to drift.
   * ───────────────────────────────────────────────────────────────────────────────
   *
   * The nodes floated on individual clocks and the whole scene answered the cursor with a
   * parallax tilt. It looked alive, and it was wrong: this is not a scene to be admired, it
   * is a set of six doors, and every one of them was a moving target. Aiming at a thing
   * that slides away from the pointer is a small tax paid on every single use, and it is
   * paid hardest by whoever has the least steady hand.
   *
   * A picture that moves is worth having where there is nothing to click. Here there are
   * six things to click, so it does not move.
   *
   * THE GLOW STAYS. Nothing about the light changed — same aurora gradient, same bloom,
   * same pulses running out along the pathways. What was removed is POSITIONAL motion, the
   * kind that makes a target hard to hit. Light travelling down a wire moves nothing you
   * are trying to press.
   */

  const CX = 500;
  const CY = 340;
  const RX = 340;
  const RY = 218;

  const nodes = departments.map(({ dept, reachable, moduleCount }) => {
    const rad = (dept.angle * Math.PI) / 180;
    return {
      dept,
      reachable,
      moduleCount,
      x: CX + RX * Math.cos(rad),
      y: CY + RY * Math.sin(rad),
    };
  });

  return (
    <div
      className="relative grid h-full w-full place-items-center"
      style={{
        opacity: visible ? 1 : 0,
        // Arrives at the scale the brain left off at, so the two motions read as one
        // continuous travel rather than a fade between two pictures.
        transform: visible ? "scale(1)" : "scale(0.62)",
        transition: reduced
          ? "opacity 300ms linear"
          : "opacity 900ms ease 240ms, transform 1500ms cubic-bezier(.16,1,.3,1) 120ms",
        willChange: "transform, opacity",
      }}
    >
      <div
        className="w-full"
        style={{
          maxWidth: "min(94vw, 1180px)",
        }}
      >
        <svg viewBox="0 0 1000 680" className="block w-full" style={{ overflow: "visible" }}>
          <defs>
            {/* The Brain's aurora, unchanged. Same room, same light. */}
            <linearGradient id="ind-void-aurora" gradientUnits="userSpaceOnUse" x1="80" y1="620" x2="920" y2="60">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="30%" stopColor="#2dd4bf" />
              <stop offset="58%" stopColor="#818cf8" />
              <stop offset="82%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#d946ef" />
              {!reduced ? (
                <animateTransform
                  attributeName="gradientTransform"
                  type="translate"
                  values="-120 60; 120 -60; -120 60"
                  dur="21s"
                  repeatCount="indefinite"
                />
              ) : null}
            </linearGradient>
            <radialGradient id="ind-void-core">
              <stop offset="0%" stopColor="#5eead4" stopOpacity="0.16" />
              <stop offset="55%" stopColor="#818cf8" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
            </radialGradient>
            {!lowPower ? (
              <filter id="ind-void-bloom" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4.5" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ) : null}
          </defs>

          <ellipse cx={CX} cy={CY} rx={430} ry={300} fill="url(#ind-void-core)" />

          <g filter={lowPower ? undefined : "url(#ind-void-bloom)"}>
            {/* THE PATHWAYS. Bowed rather than straight — a curve reads as something grown
                and alive, a straight line reads as a wiring diagram, and this scene is
                deliberately the first of those. */}
            {nodes.map(({ dept, x, y, reachable }, i) => {
              const mx = CX + (x - CX) * 0.5 + (y - CY) * 0.13;
              const my = CY + (y - CY) * 0.5 - (x - CX) * 0.13;
              const d = `M${CX} ${CY} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
              return (
                <g key={`path-${dept.code}`}>
                  <path
                    id={`ind-void-path-${i}`}
                    d={d}
                    fill="none"
                    stroke="url(#ind-void-aurora)"
                    strokeWidth={hovered === dept.code ? 1.9 : 1}
                    opacity={reachable ? (hovered === dept.code ? 0.95 : 0.42) : 0.16}
                    style={{ transition: "stroke-width 350ms ease, opacity 350ms ease" }}
                  />
                  {/* A pulse travelling OUT from ONYX — the brain reaching into a
                      department. Only where the door actually opens: a pulse running to a
                      node the viewer cannot enter would be the scene telling a small lie
                      about their own access. */}
                  {!reduced && !lowPower && reachable ? (
                    <circle r={2.6} fill="url(#ind-void-aurora)" opacity={0.9}>
                      <animateMotion
                        dur={`${(4.6 + i * 0.55).toFixed(2)}s`}
                        repeatCount="indefinite"
                        rotate="auto"
                      >
                        <mpath href={`#ind-void-path-${i}`} />
                      </animateMotion>
                      <animate
                        attributeName="opacity"
                        values="0;0.95;0.95;0"
                        keyTimes="0;0.15;0.8;1"
                        dur={`${(4.6 + i * 0.55).toFixed(2)}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  ) : null}
                </g>
              );
            })}

            {/* the hub */}
            <g transform={`translate(${CX},${CY})`}>
              {!reduced ? (
                <circle r={62} fill="none" stroke="url(#ind-void-aurora)" strokeWidth={1} opacity={0.4}>
                  <animate attributeName="r" values="52;76" dur="4.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.42;0" dur="4.4s" repeatCount="indefinite" />
                </circle>
              ) : null}
              <circle r={52} fill="none" stroke="url(#ind-void-aurora)" strokeWidth={1.6} opacity={0.9} />
              <circle r={44} fill="#050810" opacity={0.55} />
              <text
                y={-2}
                textAnchor="middle"
                className="text-[20px] font-extrabold"
                style={{ fill: "url(#ind-void-aurora)", letterSpacing: "0.1em" }}
              >
                ONYX
              </text>
              <text
                y={17}
                textAnchor="middle"
                className="text-[9px]"
                style={{ fill: "#7f9bb5", letterSpacing: "0.22em" }}
              >
                THE BRAIN
              </text>
            </g>
          </g>

          {/* ───────────────────────────── the six doors ───────────────────────────── */}
          {nodes.map(({ dept, x, y, reachable, moduleCount }) => {
            const on = hovered === dept.code;
            return (
              // Fixed. A node is exactly where it was the last time this person looked.
              <g key={dept.code} transform={`translate(${x.toFixed(2)},${y.toFixed(2)})`}>
                <g style={{ opacity: reachable ? 1 : 0.34 }}>
                  <foreignObject x={-92} y={-64} width={184} height={150} overflow="visible">
                    <div className="grid place-items-center">
                      <button
                        type="button"
                        disabled={!reachable}
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
                        className="grid cursor-pointer place-items-center rounded-full outline-offset-8 disabled:cursor-not-allowed"
                        style={{
                          width: 118,
                          height: 118,
                          transform: on && reachable ? "scale(1.07)" : "scale(1)",
                          transition: "transform 420ms cubic-bezier(.22,1,.36,1)",
                        }}
                      >
                        <svg viewBox="0 0 118 118" width={118} height={118} aria-hidden>
                          {on && reachable && !reduced ? (
                            <circle cx={59} cy={59} r={44} fill={dept.accent} opacity={0.12} />
                          ) : null}
                          <circle
                            cx={59}
                            cy={59}
                            r={36}
                            fill="#050810"
                            fillOpacity={0.6}
                            stroke="url(#ind-void-aurora)"
                            strokeWidth={on && reachable ? 2 : 1.2}
                            opacity={on && reachable ? 1 : 0.72}
                            strokeDasharray={reachable ? undefined : "4 5"}
                          />
                          <text
                            x={59}
                            y={68}
                            textAnchor="middle"
                            className="text-[26px] font-extrabold"
                            style={{ fill: dept.accent }}
                          >
                            {dept.letter}
                          </text>
                        </svg>
                      </button>

                      {/* The name is always legible; the sentence under it arrives on
                          hover or focus. The brief asks for the label to be revealed —
                          revealing the NAME too would leave six anonymous rings, which is
                          mystery at the cost of usefulness. */}
                      <p className="mt-1 text-center text-[13px] font-bold tracking-[0.18em] text-[#dbe7f2]">
                        {dept.code}
                      </p>
                      <p
                        className="pointer-events-none max-w-[168px] text-center text-[10.5px] leading-[1.45] text-[#8fb3c9]"
                        style={{
                          opacity: on ? 0.95 : 0,
                          transform: on ? "translateY(0)" : "translateY(-4px)",
                          transition: "opacity 380ms ease, transform 380ms ease",
                        }}
                      >
                        {reachable ? dept.name : "No access"}
                      </p>
                    </div>
                  </foreignObject>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* The way back. Discreet, always reachable by keyboard, and Escape does the same —
          a person who has just been shown a striking picture must never feel they have
          been trapped one level below it. */}
      <button
        type="button"
        onClick={onReturn}
        className="absolute bottom-[6vh] inline-flex items-center gap-2 rounded-full border border-[#1d2a3d] bg-[#070b14]/70 px-4 py-2 text-[11px] font-semibold tracking-[0.2em] text-[#7f9bb5] uppercase transition-colors hover:border-[#2dd4bf] hover:text-[#5eead4]"
      >
        Return to intelligence
        <span className="text-[9px] tracking-normal opacity-60">Esc</span>
      </button>
    </div>
  );
}

/** Every department the deck names, in the deck's own order, minus the brain itself. */
export function orbitDepartments(): readonly Department[] {
  return DEPARTMENTS.filter((d) => d.code !== "ONYX");
}
