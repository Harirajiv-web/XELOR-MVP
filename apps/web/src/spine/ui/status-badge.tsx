"use client";

import {
  ArrowRightCircle,
  CircleCheck,
  CircleCheckBig,
  CircleSlash,
  Clock,
  PauseCircle,
  PenLine,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "./cn";
import { humanise } from "../format";

/**
 * THE STATUS BADGE — and the reason there are eight of them, not two.
 *
 * The deck this design came from collapsed "on hold", "pending approval", "awaiting
 * approval", "in progress", "watch", "expiring", "idle" and "due soon" onto a single amber
 * chip. On a purchase-order list that turns the most useful column on the screen into
 * decoration: a plant manager scanning it cannot tell "waiting for ME" from "waiting for
 * somebody else" from "already late", which is the only thing they opened the list to find
 * out.
 *
 * EVERY BADGE CARRIES AN ICON. Not styling — it is the mechanism. Protanopia and
 * deuteranopia pull red, amber and green toward one another whatever hex you choose, so
 * hue can never be sufficient for eight states; the icon is what actually distinguishes
 * them, and the colour makes it fast for everyone else. Where two states share a hue they
 * differ in shape or fill as well: Draft is a dashed outline and On hold is a solid fill;
 * Rejected is a circle and Overdue is a triangle.
 *
 * A variant without an icon is deliberately not offered.
 */

export type StatusTone =
  | "draft"
  | "pending"
  | "approved"
  | "progress"
  | "done"
  | "hold"
  | "rejected"
  | "overdue"
  | "unknown";

const TONES: Record<
  StatusTone,
  { icon: ComponentType<{ className?: string }>; className: string }
> = {
  draft: {
    icon: PenLine,
    // Dashed, unfilled: "not yet a real document" is legible before the colour registers.
    className:
      "text-[var(--status-draft-text)] border border-dashed border-[var(--status-draft-border)] bg-transparent",
  },
  pending: {
    icon: Clock,
    className: "text-[var(--status-pending-text)] bg-[var(--status-pending-bg)]",
  },
  approved: {
    icon: CircleCheck,
    className: "text-[var(--status-approved-text)] bg-[var(--status-approved-bg)]",
  },
  progress: {
    icon: ArrowRightCircle,
    className: "text-[var(--status-progress-text)] bg-[var(--status-progress-bg)]",
  },
  done: {
    // A visually heavier check than Approved — "finished" outranks "allowed to proceed".
    icon: CircleCheckBig,
    className: "text-[var(--status-done-text)] bg-[var(--status-done-bg)]",
  },
  hold: {
    icon: PauseCircle,
    // Same hue family as Draft, solid fill and no dash — the treatment is the difference.
    className: "text-[var(--status-hold-text)] bg-[var(--status-hold-bg)]",
  },
  rejected: {
    icon: XCircle,
    className: "text-[var(--status-rejected-text)] bg-[var(--status-rejected-bg)]",
  },
  overdue: {
    // A TRIANGLE, where Rejected is a circle. Both are red; the shape is what separates
    // them for someone who cannot see that they are red.
    icon: TriangleAlert,
    className:
      "text-[var(--status-overdue-text)] bg-[var(--status-overdue-bg)] border border-[var(--status-overdue-text)]",
  },
  unknown: {
    icon: CircleSlash,
    className: "text-[var(--text-muted)] bg-[var(--surface-sunken)]",
  },
};

/**
 * Map a backend status string to a tone.
 *
 * Kept generous on purpose: sixteen modules use their own vocabulary, and a status this
 * function has never seen renders as `unknown` with the raw label showing — visibly
 * unstyled rather than silently mis-coloured. A wrong colour is worse than no colour,
 * because a wrong colour is believed.
 */
export function toneFor(status: string | null | undefined): StatusTone {
  const s = (status ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return "unknown";
  if (/^(draft|new|created)$/.test(s)) return "draft";
  if (/(pending|awaiting|submitted|for_approval|requested|planned|open)/.test(s)) return "pending";
  if (/^(approved|confirmed|released|active|accepted)$/.test(s)) return "approved";
  if (/(in_progress|issued|started|running|partially|wip|picking)/.test(s)) return "progress";
  if (/^(completed|complete|done|closed|received|dispatched|delivered|posted|paid|settled)$/.test(s))
    return "done";
  if (/(hold|paused|suspended|blocked|frozen|credit_hold)/.test(s)) return "hold";
  if (/(rejected|cancelled|canceled|failed|void|reversed|refused)/.test(s)) return "rejected";
  if (/(overdue|breached|late|past_due|expired)/.test(s)) return "overdue";
  return "unknown";
}

export function StatusBadge({
  status,
  tone,
  label,
  className,
}: {
  status?: string | null;
  /** Override the inferred tone — for a computed state like "3 days late". */
  tone?: StatusTone;
  /** Override the displayed text. */
  label?: string;
  className?: string;
}): React.JSX.Element {
  const resolved = tone ?? toneFor(status);
  const { icon: Icon, className: toneClass } = TONES[resolved];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-semibold uppercase tracking-[0.04em]",
        toneClass,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {label ?? humanise(status)}
    </span>
  );
}
