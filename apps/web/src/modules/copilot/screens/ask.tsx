"use client";

import { useMemo, useRef, useState } from "react";
import { Database, Eye, Lock, Search, Send } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Forbidden, Loading, Refusal } from "@spine/states";
import { date, dateTime, humanise, inr, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { cn } from "@spine/ui/cn";
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
 * The second decision: EVIDENCE IS NOT BEHIND A DISCLOSURE. The rows an answer was drawn
 * from, and the tables they came from, sit under the answer where a screenshot catches
 * them. An answer nobody can check is a rumour, and this product's entire claim is that its
 * answers are checkable.
 *
 * The third: a REFUSAL USES `<Refusal>`, never `<ErrorState>`. A refusal is the system
 * working as designed. Rendering it in red would teach people to distrust the one behaviour
 * that deserves the most trust.
 */

/**
 * Money columns in the copilot's hand-written queries, by name.
 *
 * A list rather than a heuristic on the value: the queries are a closed, reviewed set
 * (`apps/api/src/modules/copilot/queries.ts`), so the money columns can be enumerated. A
 * rule like "any number over a thousand is rupees" would eventually put a ₹ in front of a
 * quantity of washers, and a wrong currency symbol is believed.
 */
const MONEY_KEYS = new Set(["value", "lineValue", "outstanding", "creditLimit", "standardCost", "rate", "gross"]);

/** Dates arrive as ISO strings — JSON has no date type. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]|$)/;

function cell(key: string, value: unknown): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-[var(--text-muted)]">—</span>;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (MONEY_KEYS.has(key)) return inr(value);
    return num(value, Number.isInteger(value) ? 0 : 2);
  }
  if (typeof value === "string") {
    if (MONEY_KEYS.has(key)) return inr(value);
    // A bare date renders as a date; a timestamp keeps its hour, because "when did this
    // move" is a question about the shift as much as the day.
    if (ISO_DATE.test(value)) return value.length > 10 ? dateTime(value) : date(value);
    return value;
  }
  return JSON.stringify(value);
}

/** Columns are the union of the keys the query returned, in the order it returned them. */
function columnsOf(rows: ReadonlyArray<Record<string, unknown>>): ReadonlyArray<Column<Record<string, unknown>>> {
  const keys: string[] = [];
  for (const row of rows) {
    for (const k of Object.keys(row)) if (!keys.includes(k)) keys.push(k);
  }
  return keys.map((k) => ({
    key: k,
    header: humanise(k),
    numeric: MONEY_KEYS.has(k) || rows.some((r) => typeof r[k] === "number"),
    render: (r: Record<string, unknown>) => cell(k, r[k]),
  }));
}

export default function AskScreen(_props: ScreenProps): React.JSX.Element {
  const capabilities = useQuery<Capabilities>(copilotApi.capabilitiesPath);
  const catalogue = useQuery<CatalogueEntry[]>(copilotApi.cataloguePath);

  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<unknown>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Ask"
        subtitle="Type a question about your own factory data and get the answer with the rows it came from. It reads a fixed list of questions — nothing here can change a record."
      />

      {/* The three promises, on the screen rather than in a brochure. All three are
          properties of the backend: there is no write path in the copilot module, every
          question is authorised against the asker's permissions before retrieval, and every
          answer carries the tables it read. */}
      <div className="grid gap-2 sm:grid-cols-3">
        <Assurance
          icon={<Eye className="h-3.5 w-3.5" aria-hidden />}
          title="It only reads"
          body="There is no create, edit, approve or cancel anywhere in this module. Ask it to change something and it says so."
        />
        <Assurance
          icon={<Lock className="h-3.5 w-3.5" aria-hidden />}
          title="Your access, nothing more"
          body="Every question is checked against your own permissions first. It cannot show you what your screens would not."
        />
        <Assurance
          icon={<Database className="h-3.5 w-3.5" aria-hidden />}
          title="Every answer is sourced"
          body="You get the tables it read and the rows it read, beside the answer. Nothing is summarised out of sight."
        />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          {/* maxLength is the same 500-character ceiling the API enforces. Stopping an
              over-long paste here is kinder than refusing it after a round trip. */}
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
            placeholder="How much PMP-CP50 do we have?"
            aria-label="Your question"
            className="h-10 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] pl-8 pr-3 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
        <button
          type="submit"
          disabled={asking || question.trim().length === 0}
          className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--brand)] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--brand-hover)] disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
          {asking ? "Asking…" : "Ask"}
        </button>
      </form>

      {asking ? <Loading label="Reading your data…" /> : null}

      {forbidden ? (
        <Forbidden needs={forbidden.missingPermission ?? "copilot.question.ask"} what="the copilot" />
      ) : askError ? (
        <ErrorState error={askError} onRetry={() => void ask(question)} />
      ) : null}

      {result && !asking ? <Answer result={result} onPick={(q, k) => void ask(q, k)} /> : null}

      {/* The catalogue, always visible — before the first question and after every answer. */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">What you can ask</h2>
          <p className="mt-0.5 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
            This is the whole list. The copilot answers these questions and refuses everything else —
            adding one is a code change with a review, which is what keeps the list worth trusting.
          </p>
        </div>

        {catalogue.loading || capabilities.loading ? (
          <Loading label="Loading the catalogue…" />
        ) : catalogue.error ? (
          <ErrorState error={catalogue.error} onRetry={catalogue.reload} />
        ) : grouped.length === 0 ? (
          <Empty
            title="No questions are registered"
            body="The question catalogue is empty, which means the copilot can answer nothing at all. That is a build problem rather than a data one."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {grouped.map(([module, entries]) => (
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
                            "w-full rounded-[var(--radius-control)] px-2 py-1.5 text-left text-[13px] leading-5 transition-colors",
                            may
                              ? "text-[var(--text-primary)] hover:bg-[var(--brand-soft-2)]"
                              : "cursor-not-allowed text-[var(--text-muted)]",
                          )}
                        >
                          {entry.question}
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
  onPick,
}: {
  result: AskResult;
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

  const citation = result.citation;
  const rows = result.rows;
  const columns = columnsOf(rows);

  return (
    <section className="flex flex-col gap-3">
      <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <p className="whitespace-pre-wrap text-[14px] leading-6 text-[var(--text-primary)]">{result.answer}</p>
      </div>

      {citation ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 text-[12px] leading-5 text-[var(--text-secondary)]">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
            Evidence
          </div>
          <p>
            Understood as <span className="text-[var(--text-primary)]">“{citation.intentQuestion}”</span>
            {" — "}
            {result.understanding.routedBy === "model"
              ? "matched by the assistant, then re-checked against the catalogue"
              : "matched by the rules, with no model involved"}
            {` (confidence ${result.understanding.confidence.toFixed(2)}).`}
          </p>
          {Object.keys(citation.params).length > 0 ? (
            <p className="mt-1">
              Filters read from your question:{" "}
              {Object.entries(citation.params).map(([k, v]) => (
                <code
                  key={k}
                  className="mr-1 rounded bg-[var(--surface)] px-1 py-0.5 font-[var(--font-mono)] text-[11px] text-[var(--text-primary)]"
                >
                  {k} = {String(v)}
                </code>
              ))}
            </p>
          ) : null}
          <p className="mt-1">
            Read from{" "}
            {citation.sources.map((s) => (
              <code
                key={s}
                className="mr-1 rounded bg-[var(--surface)] px-1 py-0.5 font-[var(--font-mono)] text-[11px] text-[var(--text-primary)]"
              >
                {s}
              </code>
            ))}
            — {citation.rowCount} {citation.rowCount === 1 ? "row" : "rows"} as of {dateTime(citation.asOf)}.
            {citation.truncated ? " The row cap trimmed this answer; there are more." : ""}
          </p>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(_r, i) => `${result.correlationId}-${i}`}
          density="compact"
          caption="The rows this answer was drawn from"
        />
      ) : (
        <Empty
          title="No rows matched"
          body="The query ran and returned nothing. That is an answer rather than a failure — but if you expected something, check the filters above."
        />
      )}
    </section>
  );
}
