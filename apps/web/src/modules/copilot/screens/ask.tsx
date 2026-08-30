"use client";

import { useMemo, useRef, useState } from "react";
import { Bot, CheckCircle2, Database, Eye, Lock, Search, Send, Sparkles } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { Empty, ErrorState, Forbidden, Loading, Refusal } from "@spine/states";
import { humanise } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { cn } from "@spine/ui/cn";
import { CopilotAnswerTable } from "@spine/ui/copilot-answer-table";
import { CopilotDepartmentRoute } from "@spine/ui/copilot-department-route";
import { Disclosure } from "@spine/ui/disclosure";
import { api } from "@spine/api/client";
import { AppError } from "@spine/api/errors";
import type { ScreenProps } from "@spine/registry/manifest";
import type { AskResult, Capabilities, CatalogueEntry } from "../api";
import { copilotApi } from "../api";

/**
 * ASK — the copilot.
 *
 * The screen is built around one decision: THE CATALOGUE IS SHOWN, NOT HIDDEN. The
 * copilot answers from a closed list of questions, and a chat box with a blinking cursor
 * and no visible boundary invites exactly the questions it will refuse. A refusal the user
 * was set up for reads as a failure, however calmly it is worded. Putting the whole list on
 * the screen turns the closed intent set from the feature's biggest weakness into its
 * clearest strength: you can see precisely what it knows before you type.
 *
 * The second decision: A SUCCESSFUL ANSWER IS STRUCTURED, NOT NARRATED. The investor-facing
 * response shows the agent/department/module route followed by the answer's actual rows and
 * columns. There is no prose summary, reasoning paragraph or source dump competing with the
 * business data.
 *
 * The third: a REFUSAL USES `<Refusal>`, never `<ErrorState>`. A refusal is the system
 * working as designed. Rendering it in red would teach people to distrust the one behaviour
 * that deserves the most trust.
 */

export default function AskScreen(_props: ScreenProps): React.JSX.Element {
  const capabilities = useQuery<Capabilities>(copilotApi.capabilitiesPath);
  const catalogue = useQuery<CatalogueEntry[]>(copilotApi.cataloguePath);

  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<unknown>(null);
  const [catalogueFilter, setCatalogueFilter] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  /** Which catalogue entries this user's own permissions allow. */
  const allowed = useMemo(
    () => new Set((capabilities.data?.canAsk ?? []).map((c) => c.key)),
    [capabilities.data],
  );

  const grouped = useMemo(() => {
    const byModule = new Map<string, CatalogueEntry[]>();
    for (const entry of catalogue.data ?? []) {
      const list = byModule.get(entry.module) ?? [];
      list.push(entry);
      byModule.set(entry.module, list);
    }
    return [...byModule.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalogue.data]);

  const filteredGrouped = useMemo(() => {
    const needle = catalogueFilter.trim().toLowerCase();
    if (!needle) return grouped;
    return grouped
      .map(([module, entries]) => [
        module,
        entries.filter((entry) =>
          [entry.question, entry.module, ...entry.examples].join(" ").toLowerCase().includes(needle),
        ),
      ] as const)
      .filter(([, entries]) => entries.length > 0);
  }, [catalogueFilter, grouped]);

  async function ask(text: string, intentKey?: string): Promise<void> {
    const asked = text.trim();
    if (!asked || asking) return;
    setAsking(true);
    setAskError(null);
    try {
      const answer = await api.post<AskResult>(copilotApi.askPath, {
        question: asked,
        ...(intentKey ? { intentKey } : {}),
      });
      setResult(answer);
    } catch (e) {
      // Only a transport or authorisation failure lands here. A question the copilot will
      // not answer comes back 200 with a refusal in the body, and is rendered as one.
      setResult(null);
      setAskError(e);
    } finally {
      setAsking(false);
    }
  }

  /**
   * Clicking a suggestion.
   *
   * A question needing a parameter — "what is the status of SO-2627-00001" — is put in the
   * box rather than sent, because sending it would produce an immediate "I need the order
   * number", which is a worse first impression than a half-typed question. Everything else
   * is asked straight away, naming the intent so the router does not have to guess at a
   * sentence the user did not actually write.
   */
  function pick(entry: CatalogueEntry): void {
    const needsParam = entry.parameters.some((p) => p.required);
    const seed = entry.examples[0] ?? entry.question;
    if (needsParam) {
      setQuestion(seed);
      inputRef.current?.focus();
      return;
    }
    setQuestion(entry.question);
    void ask(entry.question, entry.key);
  }

  const forbidden = askError instanceof AppError && askError.kind === "forbidden" ? askError : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Ask ONYX"
        subtitle="A governed factory analyst that identifies the right business agent and returns the answer as a table."
      />

      <section className="relative overflow-hidden rounded-[calc(var(--radius-card)+4px)] border border-[var(--border-subtle)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(circle at 12% 5%, var(--brand-soft) 0, transparent 36%), radial-gradient(circle at 92% 100%, var(--brand-soft-2) 0, transparent 34%)",
          }}
          aria-hidden
        />
        <div className="relative grid gap-5 p-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(220px,0.7fr)] lg:p-5">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--brand)] shadow-[var(--shadow-subtle)]">
                <Bot className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">ONYX analyst</h2>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--status-success-border)] bg-[var(--status-success-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--status-success)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                    Live
                  </span>
                </div>
                <p className="text-[12px] text-[var(--text-secondary)]">
                  Ask about your business in everyday words.
                </p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
              }}
              className="rounded-[var(--radius-card)] border border-[var(--border-input)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-subtle)] focus-within:border-[var(--brand)]"
            >
              {/* maxLength is the same 500-character ceiling the API enforces. */}
              <textarea
                ref={inputRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(question);
                  }
                }}
                maxLength={500}
                rows={3}
                placeholder="Ask about stock, orders, suppliers, production or exceptions…"
                aria-label="Your question"
                className="min-h-20 w-full resize-none bg-transparent px-2 py-2 text-[14px] leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
              <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] px-1 pt-2">
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                  <Sparkles className="h-3 w-3 text-[var(--brand)]" aria-hidden />
                  Enter to ask · Shift+Enter for a new line · {question.length}/500
                </span>
                <button
                  type="submit"
                  disabled={asking || question.trim().length === 0}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--brand)] px-4 text-[12px] font-semibold text-[var(--text-on-brand)] shadow-[var(--shadow-subtle)] transition-all hover:bg-[var(--brand-hover)] disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden />
                  {asking ? "Reading…" : "Ask ONYX"}
                </button>
              </div>
            </form>
          </div>

          <Disclosure title="How ONYX works" className="self-center">
            <div className="grid gap-2">
              <Assurance
                icon={<Eye className="h-3.5 w-3.5" aria-hidden />}
                title="Read-only"
                body="It cannot change your records."
              />
              <Assurance
                icon={<Lock className="h-3.5 w-3.5" aria-hidden />}
                title="Uses your access"
                body="It only reads information you may open."
              />
              <Assurance
                icon={<Database className="h-3.5 w-3.5" aria-hidden />}
                title="Shows its sources"
                body="You can check where each answer came from."
              />
            </div>
          </Disclosure>
        </div>
      </section>

      {asking ? <Loading label="Reading your data…" /> : null}

      {forbidden ? (
        <Forbidden needs={forbidden.missingPermission ?? "copilot.question.ask"} what="the copilot" />
      ) : askError ? (
        <ErrorState error={askError} onRetry={() => void ask(question)} />
      ) : null}

      {result && !asking ? (
        <Answer
          result={result}
          catalogue={catalogue.data ?? []}
          onPick={(q, k) => void ask(q, k)}
        />
      ) : null}

      <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Questions ONYX can answer</h2>
            <p className="mt-0.5 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
              Choose one or search the full list · {allowed.size} available to you.
            </p>
          </div>
          <label className="relative min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden />
            <input
              value={catalogueFilter}
              onChange={(e) => setCatalogueFilter(e.target.value)}
              placeholder="Find a question"
              aria-label="Filter available questions"
              className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
            />
          </label>
        </div>

        {catalogue.loading || capabilities.loading ? (
          <Loading label="Loading the catalogue…" />
        ) : catalogue.error ? (
          <ErrorState error={catalogue.error} onRetry={catalogue.reload} />
        ) : filteredGrouped.length === 0 ? (
          <Empty
            title={catalogueFilter ? "No matching questions" : "No questions are registered"}
            body={catalogueFilter ? "Try another word or clear the filter." : "The governed question catalogue is empty."}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredGrouped.map(([module, entries]) => (
              <div
                key={module}
                className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-3"
              >
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
                  {humanise(module)}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {entries.map((entry) => {
                    const may = allowed.has(entry.key);
                    return (
                      <li key={entry.key}>
                        <button
                          type="button"
                          disabled={!may}
                          onClick={() => pick(entry)}
                          className={cn(
                            "group flex w-full items-start gap-2 rounded-[var(--radius-control)] border border-transparent px-2.5 py-2 text-left text-[13px] leading-5 transition-all",
                            may
                              ? "text-[var(--text-primary)] hover:border-[var(--border-subtle)] hover:bg-[var(--brand-soft-2)]"
                              : "cursor-not-allowed text-[var(--text-muted)]",
                          )}
                        >
                          <CheckCircle2 className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", may ? "text-[var(--brand)]" : "text-[var(--text-muted)]")} aria-hidden />
                          <span>{entry.question}
                          {/* Naming the permission rather than greying the row out silently:
                              in a factory of forty people they already know who grants it. */}
                          {may ? null : (
                            <span className="mt-0.5 block text-[12px]">
                              Needs{" "}
                              <code className="rounded bg-[var(--surface-sunken)] px-1 py-0.5 font-[var(--font-mono)] text-[11px]">
                                {entry.needsPermission}
                              </code>
                            </span>
                          )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Assurance({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}): React.JSX.Element {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-3">
      <div className="flex items-center gap-1.5 text-[var(--brand)]">
        {icon}
        <span className="text-[12px] font-semibold uppercase tracking-[0.04em]">{title}</span>
      </div>
      <p className="mt-1 text-[12px] leading-[18px] text-[var(--text-secondary)]">{body}</p>
    </div>
  );
}

/**
 * The answer, in its three shapes.
 *
 * Refused and clarify share the calm treatment; only the wording differs. Both offer a way
 * forward — the alternatives it considered, or the list below — because a dead end is what
 * makes people stop asking.
 */
function Answer({
  result,
  catalogue,
  onPick,
}: {
  result: AskResult;
  catalogue: readonly CatalogueEntry[];
  onPick: (question: string, intentKey: string) => void;
}): React.JSX.Element {
  if (!result.answered) {
    const alternatives = result.didYouMean ?? [];
    return (
      <Refusal
        message={result.answer}
        because={result.refusal ? `Refused as ${result.refusal.code.toLowerCase().replace(/_/g, " ")}.` : undefined}
        nextStep={
          alternatives.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {alternatives.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => onPick(a.question, a.key)}
                  className="rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--brand-soft-2)]"
                >
                  {a.question}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-[var(--text-secondary)]">
              The list below is everything it can answer. Nothing outside it will work, whatever the wording.
            </p>
          )
        }
      />
    );
  }

  const intentKey = result.understanding.intentKey ?? result.citation?.intentKey;
  const moduleKey = catalogue.find((entry) => entry.key === intentKey)?.module;

  return (
    <section data-testid="copilot-answer" className="flex flex-col gap-3">
      <CopilotDepartmentRoute moduleKey={moduleKey} />
      <CopilotAnswerTable rows={result.rows} />
    </section>
  );
}
