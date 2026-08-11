"use client";

import { useState } from "react";
import * as Icons from "lucide-react";
import { cn } from "@spine/ui/cn";
import type { Scenario } from "./scenarios";

/**
 * THE NINE SITUATIONS, PICKED ONE AT A TIME.
 *
 * Nine cards, each with a title, a sentence of what it proves, three things to watch for, the
 * order it will run against and the setup it will perform. That is roughly seventy lines of
 * text, and seventy lines of text on the screen somebody meets FIRST is not a picker — it is
 * a document.
 *
 * So it opens in two moves. Collapsed, a card is a title and one line: enough to choose
 * between them. Opened, it is everything the presenter needs — including, deliberately, the
 * setup steps, because "here is exactly what pressing this will do to your data before the
 * mission starts" is the difference between a demonstration and a conjuring trick. Starting
 * is a second, separate press, so nobody launches a mission while browsing.
 *
 * AN UNAVAILABLE SCENARIO IS SHOWN, NOT HIDDEN. The engine answers `available: false` with
 * the precise record that is missing, and that answer is worth more than a silently shorter
 * list: it says the scenarios are probed against real data rather than staged. It cannot be
 * started, it says why, and it still opens so somebody can read what it would have shown.
 */
export function ScenarioPicker({
  scenarios,
  busyKey,
  onRun,
}: {
  scenarios: readonly Scenario[];
  busyKey: string | null;
  onRun: (key: string) => void;
}): React.JSX.Element | null {
  const [open, setOpen] = useState<string | null>(null);

  // A picker with nothing in it is worse than no picker. This is also the whole of the
  // "degrade gracefully if the endpoint is absent" behaviour: no list, no section.
  if (scenarios.length === 0) return null;

  return (
    <section className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
          Or show me a situation
        </p>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          the same engine, against the order in your own records that actually has the problem
        </p>
      </div>

      <ul className="mt-2 flex flex-col gap-1.5">
        {scenarios.map((s) => {
          const shown = open === s.key;
          const running = busyKey === `scenario:${s.key}`;
          return (
            <li key={s.key} className="rounded-lg border"
              style={{
                borderColor: shown ? "var(--brand)" : "var(--border-subtle)",
                opacity: s.available ? 1 : 0.7,
              }}>
              <button type="button" onClick={() => setOpen(shown ? null : s.key)}
                className="flex w-full items-baseline gap-2 px-2.5 py-2 text-left">
                {s.number ? (
                  <span className="shrink-0 text-[11px] font-bold" style={{ color: "var(--text-muted)" }}>
                    {s.number}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    {s.name}
                  </span>
                  {s.demonstrates ? (
                    <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                      {s.demonstrates}
                    </span>
                  ) : null}
                </span>
                {s.available ? null : (
                  <span className="chip chip-warn shrink-0">not against your data</span>
                )}
                <Icons.ChevronDown
                  className={cn("h-3.5 w-3.5 shrink-0 transition-transform", shown && "rotate-180")}
                  style={{ color: "var(--text-muted)" }} aria-hidden />
              </button>

              {shown ? (
                <div className="flex flex-col gap-2 border-t px-2.5 py-2"
                  style={{ borderColor: "var(--border-subtle)" }}>
                  {/* Always shown, available or not. The API promises this is never empty and
                      it is the most honest line on the card: either which order it found, or
                      exactly which record would have to exist. */}
                  {s.reason ? (
                    <p className="text-[11px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                      {s.reason}
                    </p>
                  ) : null}

                  {s.soNo ? (
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Runs on <b style={{ color: "var(--text-primary)" }}>{s.soNo}</b>
                      {s.customerName ? ` · ${s.customerName}` : ""}
                    </p>
                  ) : null}

                  {s.watchFor.length ? (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.07em]" style={{ color: "var(--text-muted)" }}>
                        Watch for
                      </p>
                      <ul className="mt-0.5 flex flex-col gap-0.5">
                        {s.watchFor.map((w, i) => (
                          <li key={i} className="flex gap-1.5 text-[11px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                            <span aria-hidden style={{ color: "var(--text-muted)" }}>·</span>
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {s.setup.length ? (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.07em]" style={{ color: "var(--text-muted)" }}>
                        What starting it does first
                      </p>
                      <ul className="mt-0.5 flex flex-col gap-0.5">
                        {s.setup.map((w, i) => (
                          <li key={i} className="flex gap-1.5 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                            <span aria-hidden>{i + 1}.</span>
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {s.momentAt ? (
                    <p className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
                      The moment lands at: {s.momentAt}
                    </p>
                  ) : null}

                  {s.available ? (
                    <button type="button" onClick={() => onRun(s.key)} disabled={running}
                      className="self-start rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      style={{ background: "var(--brand)" }}>
                      {running ? "Starting…" : "Start this one"}
                    </button>
                  ) : (
                    <p className="text-[11px] font-semibold" style={{ color: "var(--warn-fg)" }}>
                      Cannot be run against this tenant&rsquo;s records as they stand.
                    </p>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
