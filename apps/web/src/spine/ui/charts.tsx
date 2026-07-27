"use client";

import { useEffect, useState } from "react";
import { cn } from "./cn";

/**
 * CHARTS, HAND-AUTHORED IN SVG.
 *
 * No charting library, and the reason is not weight. These are three small, fixed shapes —
 * a bar row, a donut, a sparkline — and a library brings a general layout engine, a scale
 * system and a theme layer to draw them. What it does NOT bring is the thing this product
 * needs most: a guarantee that the number under the picture is the number in the picture.
 * Hand-drawn, the value is rendered as text beside the mark, from the same variable.
 *
 * THE RULES EVERY CHART HERE FOLLOWS:
 *   - The figure is always written out. A chart is an accelerator for a number, never a
 *     replacement for it — an ERP user who cannot read the exact value off the screen will
 *     go and find it somewhere else, and trust the somewhere else instead.
 *   - Colour is never the only encoding. Every series is labelled in text.
 *   - Nothing animates on a loop. Growth runs once on arrival and stops.
 *   - Bars start at zero. A truncated axis makes a 3% move look like a collapse, which is
 *     the single most common way a chart lies without anybody intending it to.
 */

function reduced(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useGrown(): boolean {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    if (reduced()) {
      setGrown(true);
      return;
    }
    const t = setTimeout(() => setGrown(true), 60);
    return () => clearTimeout(t);
  }, []);
  return grown;
}

export interface Datum {
  label: string;
  value: number;
  /** Optional override; otherwise the value is printed as-is. */
  display?: string;
  tone?: "neutral" | "ok" | "warn" | "bad";
}

const TONE: Record<string, string> = {
  neutral: "var(--brand)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--bad)",
};

/**
 * Shades of one hue, for a series whose categories carry no meaning of their own —
 * warehouses, states, causes.
 *
 * Emphatically NOT the status palette. Colouring "Maharashtra" green and "Tamil Nadu" red
 * would invent a judgement the data never made, and a reader who has learned that green
 * means good in this product would believe it. Where a slice genuinely has a meaning, the
 * module says so by setting `tone`; where it does not, these are visually distinct and
 * semantically silent.
 */
const RAMP = [
  "var(--brand)",
  "color-mix(in srgb, var(--brand) 72%, var(--ramp-mix))",
  "color-mix(in srgb, var(--brand) 50%, var(--ramp-mix))",
  "color-mix(in srgb, var(--brand) 34%, var(--ramp-mix))",
  "color-mix(in srgb, var(--brand) 22%, var(--ramp-mix))",
];

/** The colour for a slice: the module's tone if it set one, otherwise a silent shade. */
function fill(d: Datum, index: number, anyToned: boolean): string {
  if (anyToned) return TONE[d.tone ?? "neutral"] ?? TONE.neutral!;
  return RAMP[index % RAMP.length] ?? TONE.neutral!;
}

/**
 * Horizontal bars — the workhorse.
 *
 * Horizontal rather than vertical on purpose: category labels here are words like
 * "Partially dispatched" and "Awaiting approval", and a vertical chart either truncates
 * them or rotates them 45°, which is harder to read than the data it is labelling.
 */
export function BarRows({
  data,
  className,
  max: maxOverride,
}: {
  data: readonly Datum[];
  className?: string;
  max?: number;
}): React.JSX.Element {
  const grown = useGrown();
  // Scaled against the largest bar, and always from zero.
  const max = maxOverride ?? Math.max(1, ...data.map((d) => d.value));
  const anyToned = data.some((d) => d.tone && d.tone !== "neutral");

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {data.map((d, i) => (
        <div key={d.label} className="flex items-center gap-2.5 text-[11.5px]">
          <span className="w-[104px] shrink-0 truncate text-[var(--text-secondary)]" title={d.label}>
            {d.label}
          </span>
          <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-[var(--grid)]">
            <span
              className="block h-full rounded-full transition-[width] duration-[520ms] ease-out"
              style={{
                width: grown ? `${(d.value / max) * 100}%` : "0%",
                // Staggered so the rows fill in reading order rather than as one block.
                transitionDelay: `${i * 45}ms`,
                background: fill(d, i, anyToned),
              }}
            />
          </span>
          <span
            className="w-[54px] shrink-0 text-right font-semibold text-[var(--text-primary)]"
            data-numeric=""
          >
            {d.display ?? d.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * A donut for a composition — how a total splits.
 *
 * Deliberately capped at five slices, because past that the arcs become too similar to
 * compare by eye and a bar chart does the job better. The total sits in the middle, which
 * is the one figure a reader actually wants from a composition.
 */
export function Donut({
  data,
  total,
  totalLabel,
  size = 128,
}: {
  data: readonly Datum[];
  /** The centre figure, already formatted. */
  total: string;
  totalLabel?: string;
  size?: number;
}): React.JSX.Element {
  const grown = useGrown();
  const slices = data.slice(0, 5);
  const sum = slices.reduce((n, d) => n + d.value, 0) || 1;
  // If ANY slice was given a meaning, all of them are read semantically. If none was, the
  // whole series is drawn in a silent ramp — mixing the two would be the worst outcome.
  const anyToned = slices.some((d) => d.tone && d.tone !== "neutral");

  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${totalLabel ?? "Total"} ${total}. ${slices
          .map((d) => `${d.label} ${d.value}`)
          .join(", ")}`}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--grid)" strokeWidth={stroke} />
        {slices.map((d, i) => {
          const portion = d.value / sum;
          const dash = grown ? portion * c : 0;
          const el = (
            <circle
              key={d.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={fill(d, i, anyToned)}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset * c}
              // Rotated so the first slice starts at twelve o'clock, which is where every
              // reader assumes it starts.
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              className="transition-[stroke-dasharray] duration-[600ms] ease-out"
            />
          );
          offset += portion;
          return el;
        })}
        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          className="fill-[var(--text-primary)] text-[15px] font-bold"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {total}
        </text>
        {totalLabel ? (
          <text
            x="50%"
            y="61%"
            textAnchor="middle"
            className="fill-[var(--text-muted)] text-[8.5px] font-bold uppercase tracking-[0.08em]"
          >
            {totalLabel}
          </text>
        ) : null}
      </svg>

      {/* The legend carries the figures, so the donut never has to be measured by eye. */}
      <ul className="flex min-w-0 flex-col gap-1.5 text-[11.5px]">
        {slices.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: fill(d, i, anyToned) }}
            />
            <span className="truncate text-[var(--text-secondary)]">{d.label}</span>
            <span className="ml-auto font-semibold text-[var(--text-primary)]" data-numeric="">
              {d.display ?? d.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A sparkline — shape only, for a tile too small to carry an axis.
 *
 * Because it has no axis it must ALWAYS sit beside the current value in text, and it is
 * never the only representation of a trend anybody has to act on.
 */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  tone = "neutral",
}: {
  data: readonly number[];
  width?: number;
  height?: number;
  tone?: "neutral" | "ok" | "warn" | "bad";
}): React.JSX.Element | null {
  const grown = useGrown();
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / span) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className="shrink-0 overflow-visible"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={TONE[tone]}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        // Drawn on rather than faded in: the line traces its own shape, which reads as the
        // data arriving instead of as a decoration appearing.
        style={{
          strokeDasharray: 400,
          strokeDashoffset: grown ? 0 : 400,
          transition: "stroke-dashoffset 700ms ease-out",
        }}
      />
    </svg>
  );
}
