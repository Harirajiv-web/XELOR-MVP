"use client";

import { FileSpreadsheet, FlaskConical, PlugZap } from "lucide-react";
import { cn } from "@spine/ui/cn";

/**
 * WHERE THIS DATA CAME FROM, SAID OUT LOUD.
 *
 * The most expensive thing a screen in this product can do is show three numbers that look
 * identical when one is live from a connected plant system, one is a file somebody uploaded
 * on Tuesday, and one is demo data invented to make a screenshot look busy. A person who
 * cannot tell them apart will eventually make a decision on the wrong one — and will be
 * entirely reasonable in doing so, because nothing on the screen told them.
 *
 * Three kinds, and they are deliberately hard to confuse with one another:
 *
 *   connected  a live link to a real system. The only badge that means "this is what the
 *              other system says right now".
 *   file       an uploaded spreadsheet. A snapshot of what was true when it was saved,
 *              which may have been last month.
 *   demo       simulated or seeded data. Loud on purpose — an amber warning chip, not a
 *              neutral one, because a demo figure that reads as real is the single worst
 *              outcome available to this product's credibility.
 *
 * BELONGS IN THE SPINE, LIVES HERE FOR NOW. A module may not import another module, so the
 * moment a second module needs this badge it should move to `spine/ui/` unchanged and both
 * import it from there. It is deliberately written with no dependency on anything in this
 * folder so that move is a file rename.
 */

export type SourceKind = "connected" | "file" | "demo";

const KINDS: Record<
  SourceKind,
  { icon: typeof PlugZap; chip: string; defaultLabel: string }
> = {
  connected: {
    icon: PlugZap,
    chip: "chip-ok",
    defaultLabel: "Connected source",
  },
  file: {
    icon: FileSpreadsheet,
    // Informational, not reassuring. An uploaded file is real data, and it is also as old
    // as the moment it was saved.
    chip: "chip-info",
    defaultLabel: "Uploaded file",
  },
  demo: {
    icon: FlaskConical,
    chip: "chip-warn",
    defaultLabel: "Demo data — not real",
  },
};

export function SourceBadge({
  kind,
  label,
  detail,
  className,
}: {
  kind: SourceKind;
  /** Overrides the default wording — usually the file name or the connection's name. */
  label?: string;
  /** One short qualifier after the label: "2.4 KB", "read 4 minutes ago". */
  detail?: string;
  className?: string;
}): React.JSX.Element {
  const spec = KINDS[kind];
  const Icon = spec.icon;
  return (
    <span
      className={cn("chip", spec.chip, className)}
      // The kind is in the DOM as well as in the colour, so a screenshot review, an e2e
      // assertion and a screen reader all get the same answer as the person looking at it.
      data-source-kind={kind}
      title={
        kind === "demo"
          ? "Simulated data, generated for demonstration. Nothing here came from a real system."
          : kind === "file"
            ? "Read from an uploaded file. It is as current as the moment that file was saved."
            : "Live from a configured connection to a real system."
      }
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label ?? spec.defaultLabel}
      {detail ? (
        <span className="font-medium opacity-75">· {detail}</span>
      ) : null}
    </span>
  );
}

/** Bytes as a person reads them. Used beside a file badge, where the exact number matters. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
}
