"use client";

import Link from "next/link";
import { useState } from "react";
import * as Icons from "lucide-react";
import { cn } from "../ui/cn";
import { Reveal } from "../ui/motion";
import { Disclosure } from "../ui/disclosure";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE AGENT BRAIN — the pitch deck's centrepiece, running on real data.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Transcribed from the Agent Brain view inside `AIKYANTRA-Pitch-Deck_2.html`: a core node
 * with two pulsing rings, satellites on a fixed ring, packets travelling both ways along
 * every spoke, three faint concentric guides, a legend of every node, and a detail card
 * beside it that changes as you click.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHY IT IS ONE COMPONENT AND NOT TWO
 * ───────────────────────────────────────────────────────────────────────────────
 * The deck draws this picture once, for ONYX, with the specialist departments around it. The same
 * picture is the right answer one level down: HEXA with Organisation, Administration and
 * Integration around it says exactly what HEXA is, in the shape a reader has already
 * learned upstairs.
 *
 * So the map takes a CORE and a set of SATELLITES and knows nothing about what they are.
 * `/department/ONYX` hands it the brain and the eight specialist agents; `/department/KILN` hands it
 * KILN and its three modules. One component, one visual grammar, two levels — and a person
 * who learns to read the top one can already read the others.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * WHAT WAS NOT COPIED FROM THE DECK
 * ───────────────────────────────────────────────────────────────────────────────
 * The deck's demo puts four figures above this map, and two of them — "Events on the bus
 * today 18,402" and "Actions awaiting approval 3" — are invented for the demo. They are not
 * here. The strip above this component reads from endpoints or it shows nothing, which is
 * the rule the whole product is built on and the one thing a deck is allowed to do that a
 * product is not.
 */

export interface BrainNode {
  /** Stable id — a department code, or a module key. */
  id: string;
  /** Big label under the node. */
  name: string;
  /** The one or two characters inside the circle. */
  letter: string;
  /** Small line under the name. "6 modules", "12 screens". */
  sub: string;
  accent: string;
  /** Degrees, -90 being twelve o'clock. */
  angle: number;
  /** Lucide icon name for the legend and the detail card. */
  icon: string;

  /* the detail card */
  kicker: string;
  tagline: string;
  blurb: string;
  capabilities: readonly { icon: string; title: string; detail: string }[];
  systemOfRecord: readonly string[];
  contracts: readonly { between: string; through: string }[];
  /** Where this node's own screens live, if it has any. */
  links: readonly { label: string; href: string; icon?: string }[];
  /** "Open HEXA →" — a second level to descend into, when there is one. */
  descend?: { label: string; href: string };
}

export interface BrainCore extends BrainNode {
  /** The word under the core's name. "the brain", "the department". */
  role: string;
}

export function AgentBrain({
  core,
  satellites,
  mapTitle,
}: {
  core: BrainCore;
  satellites: readonly BrainNode[];
  mapTitle: string;
}): React.JSX.Element {
  // The core is selected first, because the page was opened by clicking the core's name.
  const [selectedId, setSelectedId] = useState(core.id);
  const all: readonly BrainNode[] = [core, ...satellites];
  const selected = all.find((n) => n.id === selectedId) ?? core;

  return (
    <div
      className="grid gap-4 [grid-template-columns:minmax(430px,1fr)_minmax(400px,0.95fr)] max-[1250px]:[grid-template-columns:minmax(0,1fr)]"
      data-demo-target="workspace"
    >
      <div className="flex flex-col gap-3">
        <section className="card overflow-hidden">
          <div className="panel-h">
            <span>
              {mapTitle} <span className="panel-h-sub">· click any node</span>
            </span>
            <span className="chip chip-ok">
              <span className="h-[6px] w-[6px] rounded-full bg-[var(--ok)] pulse" />
              Live
            </span>
          </div>
          <div className="p-1.5">
            <BrainMap
              core={core}
              satellites={satellites}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        </section>

        {/* The legend is the map's keyboard route. Everything reachable by clicking a circle
            has to be reachable by tabbing to a button — an SVG node is not a control, and a
            picture that only a mouse can operate excludes people for no reason. */}
        <ul className="grid grid-cols-2 gap-2 max-[520px]:grid-cols-1">
          {all.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => setSelectedId(n.id)}
                aria-pressed={n.id === selectedId}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[11px] border bg-[var(--surface)] px-3 py-2.5 text-left shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5",
                  n.id === selectedId
                    ? "border-[color:var(--node)]"
                    : "border-[var(--border-subtle)] hover:border-[color:var(--node)]",
                )}
                style={
                  {
                    "--node": n.accent,
                    background:
                      n.id === selectedId
                        ? `color-mix(in srgb, ${n.accent} 8%, var(--surface))`
                        : undefined,
                  } as React.CSSProperties
                }
              >
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] text-[11px] font-extrabold text-[var(--text-on-accent)]"
                  style={{ background: n.accent }}
                >
                  {n.letter}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-extrabold tracking-[0.05em] text-[var(--text-primary)]">
                    {n.name}
                  </span>
                  <span className="block truncate text-[10px] text-[var(--text-muted)]">
                    {n.kicker}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <NodeCard node={selected} />
    </div>
  );
}

/* ══════════════════════════════ the map ══════════════════════════════ */

function BrainMap({
  core,
  satellites,
  selectedId,
  onSelect,
}: {
  core: BrainCore;
  satellites: readonly BrainNode[];
  selectedId: string;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  const CX = 330;
  const CY = 300;
  // 205 is the deck's radius for six satellites. Held for six, opened out slightly for
  // fewer so three do not huddle against the core, and pulled in for more so eight labels
  // do not run into each other.
  const R = satellites.length <= 3 ? 195 : satellites.length <= 6 ? 205 : 215;

  const nodes = satellites.map((s) => {
    const rad = (s.angle * Math.PI) / 180;
    return { s, x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
  });

  /**
   * THE VIEWBOX IS MEASURED, NOT FIXED.
   *
   * The deck hard-codes 660×600 because it only ever draws six satellites. This component
   * draws three for KILN and six for ONYX, and a fixed square box gave KILN a panel that was
   * two-thirds empty — the picture shrank to fit a frame sized for a bigger picture.
   *
   * So the box is computed from what is actually on the canvas: the node circles plus the
   * two lines of text under them, the core plus its outermost pulse, and a little air. Three
   * satellites now produce a wide short box that fills the panel; six produce the deck's
   * proportions, because with six the numbers work out to roughly what it hard-coded.
   */
  const PAD = 14;
  const LABEL_HALF = 62; // half the width of the widest label under a node
  const xs = nodes
    .flatMap(({ x }) => [x - LABEL_HALF, x + LABEL_HALF])
    .concat([CX - 82, CX + 82]);
  const ys = nodes
    .flatMap(({ y }) => [y - 44, y + 70])
    .concat([CY - 82, CY + 82]);
  let minX = Math.min(...xs) - PAD;
  let minY = Math.min(...ys) - PAD;
  let boxW = Math.max(...xs) - minX + PAD;
  let boxH = Math.max(...ys) - minY + PAD;

  /**
   * …but the measured box is CLAMPED to a sane shape.
   *
   * Measuring alone overcorrected: SPAR has two modules, they sit opposite each other, and
   * the fitted box came out tall and narrow — so the map scaled up to fill a panel that is
   * wider than it is tall, and two nodes rendered the size of saucers. A picture that
   * changes scale depending on how many things are in it is a picture that looks broken on
   * whichever page has the fewest.
   *
   * The panel is always wider than tall, so the box is too: never narrower than 1.25:1,
   * never wider than 2:1. The extra is added symmetrically, which keeps the core centred.
   */
  const MIN_ASPECT = 1.25;
  const MAX_ASPECT = 2;
  if (boxW / boxH < MIN_ASPECT) {
    const want = boxH * MIN_ASPECT;
    minX -= (want - boxW) / 2;
    boxW = want;
  } else if (boxW / boxH > MAX_ASPECT) {
    const want = boxW / MAX_ASPECT;
    minY -= (want - boxH) / 2;
    boxH = want;
  }

  return (
    <svg
      viewBox={`${minX.toFixed(0)} ${minY.toFixed(0)} ${boxW.toFixed(0)} ${boxH.toFixed(0)}`}
      preserveAspectRatio="xMidYMid meet"
      className="block max-h-[62vh] w-full"
      role="img"
      aria-label={`${core.name} at the centre, with ${satellites
        .map((s) => s.name)
        .join(", ")} around it. The same information is in the list below.`}
    >
      <defs>
        <radialGradient id="brain-field">
          <stop offset="0%" stopColor={core.accent} stopOpacity="0.20" />
          <stop offset="100%" stopColor={core.accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* the field, then three guide rings — depth, at almost no ink */}
      <circle cx={CX} cy={CY} r={250} fill="url(#brain-field)" />
      {[96, 126, 158].map((r) => (
        <circle
          key={r}
          cx={CX}
          cy={CY}
          r={r}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={1}
          opacity={0.55}
        />
      ))}

      {/* THE CURVE BETWEEN NEIGHBOURS, bowing through the centre. In the deck this is what
          makes the picture read as a mesh rather than a hub — and it is honest here for the
          same reason it is there: these agents genuinely do have contracts with each other,
          and every one of them is named on the cards. */}
      {nodes.map(({ x, y }, i) => {
        const next = nodes[(i + 1) % nodes.length];
        if (!next || nodes.length < 3) return null;
        return (
          <path
            key={`ring-${i}`}
            d={`M${x.toFixed(1)} ${y.toFixed(1)} Q${CX} ${CY} ${next.x.toFixed(1)} ${next.y.toFixed(1)}`}
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth={1}
            opacity={0.5}
          />
        );
      })}

      {/* the spokes, each an id'd path so a packet can be told to follow it */}
      {nodes.map(({ s, x, y }, i) => (
        <path
          key={`spoke-${s.id}`}
          id={`brain-spoke-${i}`}
          d={`M${CX} ${CY} L${x.toFixed(1)} ${y.toFixed(1)}`}
          fill="none"
          stroke={s.accent}
          strokeWidth={selectedId === s.id ? 2 : 1}
          opacity={selectedId === s.id ? 0.85 : 0.28}
        />
      ))}

      {/* PACKETS, BOTH WAYS. Outward is a question going to an agent; inward is the answer
          and its evidence coming back. Two speeds and an offset start per spoke, so the
          traffic reads as several independent conversations rather than one metronome.
          `prefers-reduced-motion` is honoured by the global rule in globals.css. */}
      {nodes.map(({ s }, i) => (
        <g key={`packet-${s.id}`}>
          <circle r={3.4} fill={s.accent}>
            <animateMotion
              dur={`${(2.6 + i * 0.42).toFixed(2)}s`}
              repeatCount="indefinite"
              rotate="auto"
            >
              <mpath href={`#brain-spoke-${i}`} />
            </animateMotion>
          </circle>
          <circle r={2.4} fill={s.accent} opacity={0.55}>
            <animateMotion
              dur={`${(3.4 + i * 0.31).toFixed(2)}s`}
              begin={`-${(1.1 + i * 0.2).toFixed(2)}s`}
              repeatCount="indefinite"
              keyPoints="1;0"
              keyTimes="0;1"
              calcMode="linear"
            >
              <mpath href={`#brain-spoke-${i}`} />
            </animateMotion>
          </circle>
        </g>
      ))}

      {/* ───────────────────────────── satellites ───────────────────────────── */}
      {nodes.map(({ s, x, y }) => {
        const on = selectedId === s.id;
        return (
          <g
            key={`node-${s.id}`}
            transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}
            onClick={() => onSelect(s.id)}
            className="cursor-pointer"
          >
            <circle r={42} fill={s.accent} opacity={on ? 0.16 : 0.07} />
            <circle
              r={30}
              fill="var(--surface)"
              stroke={s.accent}
              strokeWidth={on ? 2.4 : 1.6}
            />
            <text
              y={7}
              textAnchor="middle"
              className="text-[19px] font-extrabold"
              style={{ fill: s.accent }}
            >
              {s.letter}
            </text>
            <text
              y={49}
              textAnchor="middle"
              className="fill-[var(--text-primary)] text-[12.5px] font-bold"
            >
              {s.name}
            </text>
            <text
              y={64}
              textAnchor="middle"
              className="fill-[var(--text-muted)] text-[10px]"
            >
              {s.sub}
            </text>
          </g>
        );
      })}

      {/* ─────────────────────────────── the core ──────────────────────────── */}
      <g
        transform={`translate(${CX},${CY})`}
        onClick={() => onSelect(core.id)}
        className="cursor-pointer"
      >
        {/* Two rings breathing out of phase. This is the only looping animation on the page
            and it sits on the one thing that is genuinely always running. */}
        <circle
          r={74}
          fill="none"
          stroke={core.accent}
          strokeWidth={1}
          opacity={0.35}
        >
          <animate
            attributeName="r"
            values="60;80"
            dur="3.2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.4;0"
            dur="3.2s"
            repeatCount="indefinite"
          />
        </circle>
        <circle
          r={74}
          fill="none"
          stroke={core.accent}
          strokeWidth={1}
          opacity={0.35}
        >
          <animate
            attributeName="r"
            values="60;80"
            dur="3.2s"
            begin="-1.6s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.4;0"
            dur="3.2s"
            begin="-1.6s"
            repeatCount="indefinite"
          />
        </circle>
        <circle
          r={56}
          fill={`color-mix(in srgb, ${core.accent} 92%, black)`}
          stroke={core.accent}
          strokeWidth={selectedId === core.id ? 2.5 : 1.5}
        />
        <text
          y={-4}
          textAnchor="middle"
          className="fill-[var(--text-on-accent)] text-[22px] font-extrabold"
        >
          {core.letter}
        </text>
        <text
          y={22}
          textAnchor="middle"
          className="fill-[var(--text-on-accent)] text-[15px] font-extrabold"
          style={{ letterSpacing: "0.06em" }}
        >
          {core.name}
        </text>
        <text y={38} textAnchor="middle" className="text-[9.5px] fill-[var(--text-on-accent)]/70">
          {core.role}
        </text>
      </g>
    </svg>
  );
}

/* ══════════════════════════ the detail card ══════════════════════════ */

function NodeCard({ node }: { node: BrainNode }): React.JSX.Element {
  const Icon =
    (Icons as unknown as Record<string, Icons.LucideIcon>)[node.icon] ??
    Icons.Circle;

  return (
    <Reveal key={node.id}>
      <article
        className="card flex h-full flex-col overflow-hidden"
        style={{
          borderColor: `color-mix(in srgb, ${node.accent} 35%, var(--border-subtle))`,
        }}
      >
        <header
          className="flex items-center gap-3 px-4 py-3.5"
          style={{
            background: `linear-gradient(120deg, color-mix(in srgb, ${node.accent} 12%, var(--surface)), var(--surface))`,
            borderBottom: `1px solid color-mix(in srgb, ${node.accent} 25%, var(--border-subtle))`,
          }}
        >
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] text-[var(--text-on-accent)] shadow-[var(--shadow-sm)]"
            style={{ background: node.accent }}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <b className="block truncate text-[17px] font-extrabold tracking-[0.02em] text-[var(--text-primary)]">
              {node.name}
            </b>
            <span className="block truncate text-[11.5px] text-[var(--text-muted)]">
              {node.kicker}
            </span>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-3.5 p-4">
          <p
            className="border-l-[3px] pl-3 text-[13px] font-semibold leading-[1.5] text-[var(--text-primary)]"
            style={{ borderColor: node.accent }}
          >
            {node.tagline}
          </p>
          {node.blurb ? (
            <Disclosure title="Overview">
              <p>{node.blurb}</p>
            </Disclosure>
          ) : null}

          {node.capabilities.length > 0 ? (
            <Disclosure
              title="What this area can do"
              hint={`${node.capabilities.length} items`}
            >
              <ul className="flex flex-col gap-2">
                {node.capabilities.map((c) => {
                  const CapIcon =
                    (Icons as unknown as Record<string, Icons.LucideIcon>)[
                      c.icon
                    ] ?? Icons.Circle;
                  return (
                    <li
                      key={c.title}
                      className="flex items-start gap-2.5 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2.5"
                    >
                      <span
                        className="mt-[1px] grid h-6 w-6 shrink-0 place-items-center rounded-[7px]"
                        style={{
                          background: `color-mix(in srgb, ${node.accent} 14%, transparent)`,
                        }}
                      >
                        <CapIcon
                          className="h-3.5 w-3.5"
                          style={{ color: node.accent }}
                          aria-hidden
                        />
                      </span>
                      <span className="min-w-0">
                        <b className="block text-[12px] font-bold text-[var(--text-primary)]">
                          {c.title}
                        </b>
                        <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-[var(--text-secondary)]">
                          {c.detail}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Disclosure>
          ) : null}

          {node.systemOfRecord.length > 0 ? (
            <Disclosure
              title="What this area manages"
              hint={`${node.systemOfRecord.length} items`}
            >
              <ul className="flex flex-wrap gap-1.5">
                {node.systemOfRecord.map((o) => (
                  <li
                    key={o}
                    className="rounded-full border px-2.5 py-1 text-[10.5px] font-semibold"
                    style={{
                      borderColor: `color-mix(in srgb, ${node.accent} 30%, var(--border-subtle))`,
                      color: node.accent,
                      background: `color-mix(in srgb, ${node.accent} 7%, transparent)`,
                    }}
                  >
                    {o}
                  </li>
                ))}
              </ul>
            </Disclosure>
          ) : null}

          {node.links.length > 0 ? (
            <>
              <SectionLabel>
                Pages{" "}
                <span className="chip chip-grey">{node.links.length}</span>
              </SectionLabel>
              <ul className="grid grid-cols-2 gap-1.5 max-[560px]:grid-cols-1">
                {node.links.map((l) => {
                  const LinkIcon =
                    (Icons as unknown as Record<string, Icons.LucideIcon>)[
                      l.icon ?? ""
                    ] ?? Icons.ArrowRight;
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-2 text-[11.5px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                        style={{ borderColor: undefined }}
                      >
                        <LinkIcon
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: node.accent }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {l.label}
                        </span>
                        <Icons.ArrowRight
                          className="h-3 w-3 shrink-0 opacity-50"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}

          {node.contracts.length > 0 ? (
            <Disclosure
              title="How it works with other areas"
              hint={`${node.contracts.length} connections`}
            >
              <ul className="flex flex-col gap-1.5">
                {node.contracts.map((c) => (
                  <li
                    key={c.between}
                    className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2"
                  >
                    <b className="block text-[11px] font-extrabold tracking-[0.04em] text-[var(--text-primary)]">
                      {c.between}
                    </b>
                    <span className="mt-0.5 block text-[11px] leading-[1.5] text-[var(--text-muted)]">
                      {c.through}
                    </span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          ) : null}

          {node.descend ? (
            <Link
              href={node.descend.href}
              className="btn btn-pri mt-auto justify-center"
              style={{ background: node.accent }}
            >
              {node.descend.label}
              <Icons.ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      </article>
    </Reveal>
  );
}

function SectionLabel({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <p className="flex items-center gap-2 border-t border-[var(--border-subtle)] pt-3 text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-muted)]">
      {children}
    </p>
  );
}
