"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleSlash, Send, Sparkles, X } from "lucide-react";
import { api } from "../api/client";
import { AppError } from "../api/errors";
import { useAccess } from "../access/permissions";
import { cn } from "../ui/cn";

/**
 * THE COPILOT RAIL — always on screen, the way MAINDECK has it.
 *
 * The deck puts the assistant in a permanent 384px column rather than behind a button, and
 * that is a claim about the product rather than a layout preference: an assistant you have
 * to go and find is one people stop finding. It sits beside the work, reads the same data
 * the screen is showing, and answers in place.
 *
 * WHY THIS LIVES IN THE SPINE AND NOT IN THE COPILOT MODULE. The spine may not import a
 * module — that rule is what keeps every module folder deletable — and the rail is present
 * on every screen, so it is shell furniture like the sidebar and the topbar. The Copilot
 * MODULE still owns the full-page Ask screen and the question log; this is the compact
 * companion. The cost is that the `AskResult` shape is declared in two places, which is a
 * real cost and the right trade: the alternative is a spine that knows the name of a module
 * and breaks the moment somebody removes it.
 *
 * When the copilot is not licensed or the user cannot ask, the rail does not render at all.
 * A permanently empty 384px column advertising a feature somebody cannot use is worse than
 * the space it occupies.
 */

interface Citation {
  intentKey: string;
  intentQuestion: string;
  sources: readonly string[];
  rowCount: number;
  truncated: boolean;
  asOf: string;
}

interface AskResult {
  answered: boolean;
  answer: string;
  rows: ReadonlyArray<Record<string, unknown>>;
  citation: Citation | null;
  understanding: { routedBy: string; confidence: number };
  refusal?: { code: string; message: string };
  didYouMean?: ReadonlyArray<{ key: string; question: string }>;
  correlationId: string;
}

interface Capabilities {
  canAsk: ReadonlyArray<{ key: string; question: string; module: string }>;
}

type Turn =
  | { kind: "asked"; text: string }
  | { kind: "answer"; result: AskResult }
  | { kind: "error"; message: string };

export function CopilotRail({ onClose }: { onClose: () => void }): React.JSX.Element | null {
  const { can, isLicensed } = useAccess();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Capabilities["canAsk"]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);

  const available = isLicensed("copilot") && can("copilot.question.ask");

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    void api
      .get<Capabilities>("/copilot/capabilities")
      .then((c) => {
        if (!cancelled) setSuggestions(c.canAsk.slice(0, 6));
      })
      .catch(() => {
        /* The rail degrades to a plain input. A failed suggestion list is not worth an
           error message in a panel the user did not open for that. */
      });
    return () => {
      cancelled = true;
    };
  }, [available]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setText("");
      setTurns((t) => [...t, { kind: "asked", text: q }]);
      setBusy(true);
      try {
        const result = await api.post<AskResult>("/copilot/ask", { question: q });
        setTurns((t) => [...t, { kind: "answer", result }]);
      } catch (e) {
        setTurns((t) => [
          ...t,
          {
            kind: "error",
            message:
              e instanceof AppError ? e.message : "The assistant could not be reached.",
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  if (!available) return null;

  return (
    <aside className="flex h-screen flex-col overflow-hidden border-l border-[var(--border-subtle)] bg-[var(--surface)]">
      <div className="flex min-h-[var(--top)] items-center gap-2.5 border-b border-[var(--border-subtle)] px-3.5">
        <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-[linear-gradient(135deg,#12294f,var(--brand))] text-white">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">IND Copilot</p>
          <p className="flex items-center gap-1 text-[10px] text-[var(--ok-ink)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />
            Reads only · never writes
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the copilot"
          className="ml-auto grid h-8 w-8 place-items-center rounded-[9px] text-[var(--text-muted)] hover:bg-[var(--bg)]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div ref={bodyRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        {turns.length === 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Try asking
            </p>
            {suggestions.length === 0 ? (
              <p className="text-[12px] leading-5 text-[var(--text-muted)]">
                Ask about stock, orders, the plan or the shop floor. The assistant answers
                from a fixed list of questions and refuses anything outside it.
              </p>
            ) : (
              suggestions.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => void ask(s.question)}
                  className="rounded-[9px] border border-[var(--border-subtle)] bg-[var(--bg)] px-2.5 py-2 text-left text-[12px] text-[var(--text-secondary)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
                >
                  {s.question}
                </button>
              ))
            )}
          </div>
        ) : null}

        {turns.map((t, i) =>
          t.kind === "asked" ? (
            <p
              key={i}
              className="max-w-[92%] self-end rounded-[13px_13px_3px_13px] bg-[var(--brand)] px-3 py-2 text-[12.5px] font-medium leading-[1.55] text-white"
            >
              {t.text}
            </p>
          ) : t.kind === "error" ? (
            <p
              key={i}
              className="max-w-[92%] self-start rounded-[3px_13px_13px_13px] border border-[var(--bad-soft)] bg-[var(--bad-soft)] px-3 py-2.5 text-[12.5px] leading-[1.55] text-[var(--bad-ink)]"
            >
              {t.message}
            </p>
          ) : (
            <Answer key={i} result={t.result} onAsk={ask} />
          ),
        )}

        {busy ? (
          <span className="flex gap-1 self-start rounded-[3px_13px_13px_13px] border border-[var(--border-subtle)] bg-[var(--bg)] px-3.5 py-2.5">
            {[0, 1, 2].map((d) => (
              <i
                key={d}
                className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]"
                style={{ animation: `ind-pulse 1.2s ${d * 0.2}s infinite` }}
              />
            ))}
          </span>
        ) : null}
      </div>

      <form
        className="flex gap-2 border-t border-[var(--border-subtle)] p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask about your factory data…"
          aria-label="Ask the copilot"
          className="field bg-[var(--bg)]"
        />
        <button type="submit" disabled={busy || !text.trim()} className="btn btn-pri px-4">
          <Send className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">Ask</span>
        </button>
      </form>
    </aside>
  );
}

/**
 * One answer, with its evidence.
 *
 * The citation is rendered ALWAYS and never behind a disclosure. It is the product's
 * central claim — the assistant shows what it read — and a claim you have to click to
 * verify is a claim most people never verify.
 */
function Answer({
  result,
  onAsk,
}: {
  result: AskResult;
  onAsk: (q: string) => Promise<void>;
}): React.JSX.Element {
  // A refusal is NEVER styled as an error. It is the system working as designed, and if
  // refusals looked like failures users would learn to distrust the single behaviour that
  // deserves the most trust.
  if (!result.answered) {
    return (
      <div className="max-w-[92%] self-start rounded-[3px_13px_13px_13px] border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2.5">
        <p className="flex gap-2 text-[12.5px] leading-[1.55] text-[var(--text-primary)]">
          <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
          {result.refusal?.message ?? result.answer}
        </p>
        {result.didYouMean && result.didYouMean.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Did you mean
            </p>
            {result.didYouMean.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => void onAsk(d.question)}
                className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-1.5 text-left text-[12px] text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                {d.question}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const cols = result.rows.length > 0 ? Object.keys(result.rows[0] ?? {}) : [];

  return (
    <div className="max-w-full self-start rounded-[3px_13px_13px_13px] border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2.5">
      <p className="text-[12.5px] leading-[1.55] text-[var(--text-primary)]">{result.answer}</p>

      {result.rows.length > 0 ? (
        <div className="mt-2 overflow-x-auto rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface)]">
          <table className="grid-table">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} scope="col">
                    {c.replace(/([a-z])([A-Z])/g, "$1 $2")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, 8).map((r, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c}>{String(r[c] ?? "—")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {result.citation ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Read from
          </span>
          {result.citation.sources.map((s) => (
            <code
              key={s}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-0.5 font-[var(--font-mono)] text-[9.5px] font-bold text-[var(--text-muted)]"
            >
              {s}
            </code>
          ))}
          {/* Truncation is stated. A capped list presented as a complete one is the
              quietest way for a correct system to mislead somebody. */}
          {result.citation.truncated ? (
            <span className="chip chip-gold">First {result.citation.rowCount} shown</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
