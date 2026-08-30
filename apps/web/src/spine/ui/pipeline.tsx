"use client";

import { useState } from "react";
import {
  Cpu,
  Database,
  FileSpreadsheet,
  FlaskConical,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "./cn";
import {
  LAYER_OF,
  LEGEND_ORDER,
  PHASE_WORD,
  PIPELINE_STATUS,
  clockOf,
  liveStageIndex,
  type Layer,
  type PipelineStage,
  type SourceKind,
} from "./pipeline.logic";

/**
 * THE TWO LAYERS, SAID OUT LOUD ON EVERY ROW.
 *
 * This product is two things stacked. Phase 1 is the ERP — Sales, Inventory, Purchase,
 * Production, Engineering, Planning, Quality, Accounts — and it is the system of record.
 * Phase 2 sits on top of it: it reads Phase 1, works something out, asks a person where
 * authority is required, writes back through Phase 1's own doors, and then re-reads to
 * check that what it claimed actually happened.
 *
 * The single most expensive failure available to that arrangement is a screen where the two
 * look identical. A person who cannot tell "this is what your stock ledger says" from "this
 * is what the engine worked out from it" will eventually act on the second believing it was
 * the first — and they will be entirely reasonable in doing so, because nothing on the
 * screen told them otherwise.
 *
 * So there is ONE visual language, defined here, used by every Phase 2 surface:
 *
 *   Phase 1 · ERP     neutral, grey, named for the module it came from. The record.
 *   Phase 2 engine    violet, the house's AI accent, always the word "deterministic" close
 *                     by. Rules over the records — never a model, and never described as
 *                     one, because no model is involved anywhere in this build.
 *   Person            gold, a seal. A human decided it and their name is on it.
 *   Uploaded file     blue, a spreadsheet. Real data, as old as the day it was saved.
 *   Simulated         amber, loud on purpose. A stand-in for a system this build does NOT
 *                     talk to. Nothing was fetched. Nothing is pretending to be.
 *
 * WHY VIOLET FOR PHASE 2 rather than the brand blue. The house already spends `--ai-text`
 * and `--violet-soft` on machine-produced content everywhere else in the product, and blue
 * is the colour of a button you press. Reusing the existing AI accent means a person who has
 * seen one XELOR screen already knows what the colour means on this one, which is the whole
 * value of having a language rather than a palette.
 *
 * WHY THIS IS NOT `modules/dataimport/source-badge.tsx`. It is the same idea and it
 * deliberately reuses that file's chip classes, its icons and its wording for the two kinds
 * they share (an uploaded file, and simulated data). It cannot IMPORT it: a module may
 * never import another module, and this is needed by the spine itself — the agent bar and
 * the stage panel, which render across eight module screens. `source-badge.tsx` says in its
 * own header that it belongs in the spine and should move here unchanged the moment a second
 * module needs it. When somebody does that move, the `LAYER` table below is where it lands.
 *
 * The rules — the contract's types, the layer mapping, the status vocabulary and the
 * parsing — live in `pipeline.logic.ts` and are re-exported here so callers have one import.
 */

export * from "./pipeline.logic";

/* ------------------------------------------------------------------- layers -- */

export const LAYER: Record<
  Layer,
  { name: string; chip: string; icon: LucideIcon; means: string }
> = {
  phase1: {
    name: "Phase 1 · ERP",
    chip: "chip-grey",
    icon: Database,
    means:
      "A record read straight out of the ONYX ERP — the system of record. Phase 2 did not change it to read it.",
  },
  phase2: {
    name: "Phase 2 engine",
    chip: "chip-violet",
    icon: Cpu,
    means:
      "Worked out by the Phase 2 engine: deterministic rules over the records above. No language model is involved anywhere in this build.",
  },
  human: {
    name: "Person",
    chip: "chip-accent",
    icon: UserCheck,
    means: "A person decided this. The decision is recorded against their name.",
  },
  file: {
    name: "Uploaded file",
    chip: "chip-info",
    icon: FileSpreadsheet,
    means:
      "Read from an uploaded spreadsheet. As current as the moment that file was saved, and no more.",
  },
  external: {
    // "Simulated" as well as "not connected", because this chip has two jobs: it labels a
    // stand-in system on the connector shelf, and it labels a seeded figure on an evidence
    // row. "Not connected" alone reads oddly against a supplier's price; "Simulated" alone
    // could be mistaken for a test copy of something real. Both words, always.
    name: "Simulated · not connected",
    chip: "chip-warn",
    icon: FlaskConical,
    means:
      "A stand-in for an outside system this build does NOT talk to. Nothing was fetched from it and nothing here came out of it.",
  },
};

/* -------------------------------------------------------------- the fragments -- */

/**
 * Which layer a fact belongs to, as a chip.
 *
 * `system` is shown next to the layer name rather than instead of it — "Phase 1 · ERP" says
 * which half of the product this is, "Sales · Orders" says which desk in it. Somebody
 * checking a number needs both, and neither implies the other.
 */
export function LayerChip({
  layer,
  system,
  className,
}: {
  layer: Layer;
  system?: string;
  className?: string;
}): React.JSX.Element {
  const spec = LAYER[layer];
  const Icon = spec.icon;
  return (
    <span
      className={cn("chip", spec.chip, className)}
      // In the DOM as well as in the colour, so a screenshot review, an end-to-end assertion
      // and a screen reader all get the same answer as the person looking at it.
      data-layer={layer}
      title={spec.means}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {spec.name}
      {system ? <span className="font-medium opacity-75">· {system}</span> : null}
    </span>
  );
}

export function SourceChip({
  sourceKind,
  system,
  className,
}: {
  sourceKind: SourceKind;
  system?: string;
  className?: string;
}): React.JSX.Element {
  return <LayerChip layer={LAYER_OF[sourceKind]} system={system} className={className} />;
}

/**
 * The key to the colours, in one line.
 *
 * Deliberately always visible rather than hidden behind a "what do these mean?" link. The
 * standing instruction on this product is LESS on screen — but the one thing a person must
 * never have to hunt for is which of these numbers came from their own factory and which one
 * a machine worked out, so this row earns its height.
 *
 * `dense` is what lets it earn LESS of it. On Mission Control the legend used to take a full
 * row of its own above any content, on a screen whose whole complaint was that the decision
 * fell off the bottom. Dense drops the trailing sentence and prefixes a two-letter label, so
 * the same five chips can ride on an existing heading row instead of costing a new one. The
 * chips themselves are untouched — the distinction survives, only its packaging shrinks.
 */
export function LayerLegend({
  className,
  dense = false,
}: {
  className?: string;
  dense?: boolean;
}): React.JSX.Element {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {dense ? (
        <span
          className="text-[10px] font-bold uppercase tracking-[0.08em]"
          style={{ color: "var(--text-muted)" }}
        >
          Key
        </span>
      ) : null}
      {LEGEND_ORDER.map((l) => (
        <LayerChip key={l} layer={l} />
      ))}
      {dense ? null : (
        <span className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
          every line below says which of these it is
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the rail -- */

/**
 * WHAT IS HAPPENING, PHASE BY PHASE.
 *
 * The standing complaint about machine-run screens, said in as many words: "do not show me
 * only a loading animation followed by a result." A spinner asks for trust and offers
 * nothing to check. This offers the whole path — what was read, out of which system, what
 * was worked out, who decided, what was written, and whether the write was confirmed — and
 * it does it in one strip rather than a page of prose.
 *
 * Two rules keep it from becoming the wall of text it was written to replace:
 *
 *   THE STRIP IS THE WHOLE SHAPE, one pill per phase, and it never scrolls the page — a
 *   long arc scrolls inside itself. Somebody glancing at it gets "seven phases, five done,
 *   one waiting on me" without reading a word.
 *
 *   ONE DETAIL LINE AT A TIME, underneath. The live phase is chosen for you; clicking any
 *   pill moves the detail line to that phase. Thirteen sentences at once is the log this
 *   was written to replace.
 *
 * The caller is expected to remount this per step (`key={step.seq}`), which is what resets
 * the selection when the mission moves on. Keeping that in the parent rather than syncing it
 * in an effect here means there is no window where the strip shows one step's phases with
 * another step's selection.
 */
export function PipelineRail({
  stages,
  className,
}: {
  stages: readonly PipelineStage[];
  className?: string;
}): React.JSX.Element | null {
  const [picked, setPicked] = useState<number | null>(null);

  // The whole graceful-degradation contract in one line: no pipeline, no rail, no error.
  if (stages.length === 0) return null;

  const at = picked !== null && stages[picked] ? picked : liveStageIndex(stages);
  const shown = stages[at];
  if (!shown) return null;

  const tone = PIPELINE_STATUS[shown.status];
  const clock = clockOf(shown.at);

  return (
    <section
      className={cn("rounded-lg", className)}
      style={{ background: "var(--surface-sunken)" }}
      aria-label="What this step is doing, phase by phase"
    >
      <div className="flex items-center gap-1 overflow-x-auto px-2 py-2">
        {stages.map((s, i) => {
          const spec = PIPELINE_STATUS[s.status];
          const here = i === at;
          return (
            <button
              key={`${s.phase}-${i}`}
              type="button"
              onClick={() => setPicked(i)}
              title={`${PHASE_WORD[s.phase]} · ${spec.word}${s.label ? ` — ${s.label}` : ""}`}
              aria-current={here ? "step" : undefined}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[10.5px] font-semibold transition-colors"
              style={{
                background: here ? "var(--surface)" : "transparent",
                color: here ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow: here ? "inset 0 0 0 1px var(--border)" : "none",
                // A phase that never ran is dimmed rather than hidden: "nobody had to be
                // asked" is itself a fact about how the step went.
                opacity: s.status === "skipped" ? 0.55 : 1,
              }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: spec.dot }}
                aria-hidden
              />
              {PHASE_WORD[s.phase]}
            </button>
          );
        })}
      </div>

      <div
        className="flex flex-col gap-1.5 border-t px-3 py-2.5"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <p className="text-[12px] leading-snug" style={{ color: "var(--text-primary)" }}>
          {shown.label || PHASE_WORD[shown.phase]}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <SourceChip sourceKind={shown.sourceKind} system={shown.system} />
          <span className={cn("chip", tone.chip)}>{tone.word}</span>
          {shown.detail ? (
            <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              {shown.detail}
            </span>
          ) : null}
          {clock ? (
            // The server's clock, straight off the stage — not this browser's idea of now.
            <span className="ml-auto text-[10.5px]" style={{ color: "var(--text-muted)" }}>
              {clock}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
