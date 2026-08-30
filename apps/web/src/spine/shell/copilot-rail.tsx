"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { api } from "../api/client";
import { AppError } from "../api/errors";
import { useAccess } from "../access/permissions";
import { cn } from "../ui/cn";
import { Disclosure } from "../ui/disclosure";
import { conciseCopilotAnswer } from "../ui/plain-language";

interface Citation {
  intentKey: string;
  intentQuestion: string;
  sources: readonly string[];
  rowCount: number;
  truncated: boolean;
  params?: Record<string, string | number>;
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

type RailTab = "chat" | "alerts" | "briefing" | "actions";

const TABS: readonly {
  key: RailTab;
  label: string;
  icon: Icons.LucideIcon;
}[] = [
  { key: "chat", label: "Chat", icon: Icons.MessageSquare },
  { key: "alerts", label: "Alerts", icon: Icons.Bell },
  { key: "briefing", label: "Brief", icon: Icons.ClipboardList },
  { key: "actions", label: "Actions", icon: Icons.ListChecks },
];

function moduleFromPath(pathname: string): string | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment || segment === "department" || segment === "agentos") return null;
  return segment;
}

/**
 * ONYX is permanent shell furniture: live, permission-checked chat sits beside a curated
 * demo of the wider Alerts → Briefing → Governed Actions experience. The boundary is stated
 * in every demo view and demo actions only navigate to a review surface.
 */
export function CopilotRail({ onClose }: { onClose: () => void }): React.JSX.Element | null {
  const pathname = usePathname();
  const { can, isLicensed } = useAccess();
  const [tab, setTab] = useState<RailTab>("chat");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Capabilities["canAsk"]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const available = isLicensed("copilot") && can("copilot.question.ask");
  const currentModule = moduleFromPath(pathname);

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    void api
      .get<Capabilities>("/copilot/capabilities")
      .then((capabilities) => {
        if (!cancelled) setSuggestions(capabilities.canAsk);
      })
      .catch(() => {
        // Chat still works when the optional suggestion list cannot be loaded.
      });
    return () => {
      cancelled = true;
    };
  }, [available]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const quickQuestions = useMemo(() => {
    const contextual = currentModule
      ? suggestions.filter((suggestion) => suggestion.module === currentModule)
      : [];
    const chosen = contextual.length > 0 ? contextual : suggestions;
    return chosen.slice(0, 5);
  }, [currentModule, suggestions]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setTab("chat");
      setText("");
      setTurns((previous) => [...previous, { kind: "asked", text: q }]);
      setBusy(true);
      try {
        const result = await api.post<AskResult>("/copilot/ask", { question: q });
        setTurns((previous) => [...previous, { kind: "answer", result }]);
      } catch (error) {
        setTurns((previous) => [
          ...previous,
          {
            kind: "error",
            message:
              error instanceof AppError ? error.message : "ONYX could not be reached.",
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
    <aside className="x-copilot-rail relative flex h-screen flex-col overflow-hidden border-l border-[var(--border-subtle)] bg-[linear-gradient(180deg,var(--surface),var(--bg))]">
      <div className="pointer-events-none absolute -right-16 top-8 h-44 w-44 rounded-full bg-[var(--brand-soft)] opacity-60 blur-3xl" />
      <div className="relative flex min-h-[var(--top)] items-center gap-2.5 border-b border-[var(--border-subtle)] px-3.5">
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border border-[var(--brand-soft)] bg-[linear-gradient(145deg,var(--brand-soft-2),var(--surface))] text-[var(--brand)] shadow-[var(--shadow-sm)]">
          <Icons.Bot className="h-4 w-4" aria-hidden />
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface)] bg-[var(--ok)]" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-bold text-[var(--text-primary)]">
            ONYX Assistant
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[9.5px] text-[var(--text-muted)]">
            <Icons.ShieldCheck className="h-3 w-3 text-[var(--ok-ink)]" aria-hidden />
            Ask about your work · read only
          </p>
        </div>
        {turns.length > 0 ? (
          <button
            type="button"
            onClick={() => setTurns([])}
            title="Start a new conversation"
            aria-label="Start a new ONYX conversation"
            className="ml-auto grid h-8 w-8 place-items-center rounded-[9px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--text-primary)]"
          >
            <Icons.SquarePen className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the copilot"
          className={cn(
            "grid h-8 w-8 place-items-center rounded-[9px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--text-primary)]",
            turns.length === 0 && "ml-auto",
          )}
        >
          <Icons.X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="relative flex items-start gap-1.5 border-b border-[var(--border-subtle)] bg-[var(--surface)] p-2">
        <button
          type="button"
          onClick={() => setTab("chat")}
          aria-pressed={tab === "chat"}
          className={cn(
            "flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-[9px] border px-3 text-[10.5px] font-semibold",
            tab === "chat"
              ? "border-[var(--brand-soft)] bg-[var(--brand-soft-2)] text-[var(--brand)]"
              : "border-transparent text-[var(--text-muted)] hover:bg-[var(--bg)]",
          )}
        >
          <Icons.MessageSquare className="h-3.5 w-3.5" aria-hidden />
          Ask
        </button>
        <details className="group/more relative flex-1">
          <summary className="flex min-h-9 cursor-pointer list-none items-center justify-center gap-1.5 rounded-[9px] border border-[var(--border-subtle)] px-3 text-[10.5px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg)] [&::-webkit-details-marker]:hidden">
            <Icons.LayoutGrid className="h-3.5 w-3.5" aria-hidden />
            {tab === "chat"
              ? "More"
              : TABS.find((item) => item.key === tab)?.label ?? "More"}
            <Icons.ChevronDown className="h-3 w-3 transition-transform group-open/more:rotate-180" aria-hidden />
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-[250px] rounded-[11px] border border-[var(--border-subtle)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-card)]">
            {TABS.filter((item) => item.key !== "chat").map((item) => {
              const TabIcon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={(event) => {
                    setTab(item.key);
                    event.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[11px]",
                    tab === item.key
                      ? "bg-[var(--brand-soft-2)] text-[var(--brand)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg)]",
                  )}
                >
                  <TabIcon className="h-3.5 w-3.5" aria-hidden />
                  {item.key === "briefing" ? "Summary" : item.label}
                </button>
              );
            })}
          </div>
        </details>
      </div>

      <div ref={bodyRef} className="relative flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {tab === "chat" ? (
          <ChatPanel
            turns={turns}
            busy={busy}
            questions={quickQuestions}
            currentModule={currentModule}
            onAsk={ask}
          />
        ) : tab === "alerts" ? (
          <OperationalLinkPanel kind="alerts" />
        ) : tab === "briefing" ? (
          <OperationalLinkPanel kind="briefing" />
        ) : (
          <OperationalLinkPanel kind="actions" />
        )}
      </div>

      {tab === "chat" ? (
        <form
          className="relative border-t border-[var(--border-subtle)] bg-[var(--surface)] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(text);
          }}
        >
          <div className="rounded-[14px] border border-[var(--border-input)] bg-[var(--bg)] p-2 shadow-[var(--shadow-sm)] transition-shadow focus-within:border-[var(--brand)] focus-within:shadow-[0_0_0_3px_var(--brand-soft)]">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void ask(text);
                }
              }}
              maxLength={500}
              rows={2}
              placeholder={
                currentModule
                  ? `Ask ONYX about ${currentModule}…`
                  : "Ask about stock, orders, planning or the shop floor…"
              }
              aria-label="Ask the copilot"
              className="block max-h-28 min-h-[48px] w-full resize-none bg-transparent px-1.5 py-1 text-[12.5px] leading-[1.5] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            <div className="flex items-center gap-2 border-t border-[var(--border-subtle)] px-1 pt-2">
              <span className="flex items-center gap-1 text-[9px] text-[var(--text-muted)]">
                <Icons.Database className="h-3 w-3" aria-hidden />
                Uses your XELOR records
              </span>
              <span className="ml-auto text-[8.5px] tabular-nums text-[var(--text-muted)]">
                {text.length}/500
              </span>
              <button
                type="submit"
                disabled={busy || !text.trim()}
                className="inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-[var(--brand)] px-3 text-[10.5px] font-bold text-[var(--text-on-brand)] transition-colors hover:bg-[var(--brand-hover)] disabled:opacity-45"
              >
                <Icons.Send className="h-3 w-3" aria-hidden />
                Ask
              </button>
            </div>
          </div>
          <p className="mt-1.5 px-1 text-[8.5px] text-[var(--text-muted)]">
            Enter to send · Shift + Enter for a new line
          </p>
        </form>
      ) : (
        <div className="border-t border-[var(--border-subtle)] px-3 py-2 text-[10px] leading-4 text-[var(--text-muted)]">
          These views now open current governed records instead of permanent sample cards.
        </div>
      )}
    </aside>
  );
}

function ChatPanel({
  turns,
  busy,
  questions,
  currentModule,
  onAsk,
}: {
  turns: readonly Turn[];
  busy: boolean;
  questions: Capabilities["canAsk"];
  currentModule: string | null;
  onAsk: (question: string) => Promise<void>;
}): React.JSX.Element {
  return (
    <>
      {turns.length === 0 ? (
        <div className="flex flex-col gap-3">
          <section className="overflow-hidden rounded-[16px] border border-[var(--brand-soft)] bg-[linear-gradient(145deg,var(--brand-soft-2),var(--surface))] p-4 shadow-[var(--shadow-sm)]">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[var(--brand)] text-[var(--text-on-brand)] shadow-[0_10px_24px_-12px_var(--brand)]">
                <Icons.Sparkles className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-[9.5px] font-extrabold uppercase tracking-[0.13em] text-[var(--brand)]">
                  {currentModule ? `${currentModule} workspace` : "Factory-wide workspace"}
                </p>
                <h2 className="mt-1 text-[15px] font-bold tracking-[-0.01em] text-[var(--text-primary)]">
                  What can I help you with?
                </h2>
              </div>
            </div>
            <p className="mt-3 text-[11.5px] leading-[1.6] text-[var(--text-secondary)]">
              Choose a suggested question or type your own below.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {[
                { icon: Icons.Eye, label: "Read only" },
                { icon: Icons.ShieldCheck, label: "Your access" },
                { icon: Icons.Database, label: "Cited" },
              ].map((item) => {
                const AssuranceIcon = item.icon;
                return (
                  <span
                    key={item.label}
                    className="flex min-w-0 items-center justify-center gap-1 rounded-[8px] border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface)_78%,transparent)] px-1.5 py-1.5 text-[8.5px] font-bold text-[var(--text-muted)]"
                  >
                    <AssuranceIcon className="h-3 w-3 shrink-0 text-[var(--brand)]" aria-hidden />
                    {item.label}
                  </span>
                );
              })}
            </div>
          </section>
          <p className="flex items-center gap-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Suggested questions
            <span className="h-px flex-1 bg-[var(--border-subtle)]" />
          </p>
          {questions.length === 0 ? (
            <p className="rounded-[12px] border border-dashed border-[var(--border-input)] p-3 text-[11.5px] leading-5 text-[var(--text-muted)]">
              Ask about stock, orders, planning or the shop floor.
            </p>
          ) : (
            questions.map((suggestion, index) => (
              <button
                key={suggestion.key}
                type="button"
                onClick={() => void onAsk(suggestion.question)}
                className="group flex items-center gap-2.5 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2.5 text-left text-[11.5px] font-medium leading-[1.4] text-[var(--text-secondary)] shadow-[var(--shadow-sm)] transition-all hover:-translate-y-px hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] bg-[var(--surface-sunken)] text-[9px] font-bold tabular-nums text-[var(--text-muted)] group-hover:bg-[var(--brand-soft)] group-hover:text-[var(--brand)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{suggestion.question}</span>
                <Icons.ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </button>
            ))
          )}
        </div>
      ) : null}

      {turns.map((turn, index) =>
        turn.kind === "asked" ? (
          <p
            key={index}
            className="max-w-[92%] self-end rounded-[13px_13px_3px_13px] bg-[var(--brand)] px-3 py-2 text-[12.5px] font-medium leading-[1.55] text-[var(--text-on-brand)]"
          >
            {turn.text}
          </p>
        ) : turn.kind === "error" ? (
          <p
            key={index}
            className="max-w-[92%] self-start rounded-[3px_13px_13px_13px] border border-[var(--bad-soft)] bg-[var(--bad-soft)] px-3 py-2.5 text-[12.5px] leading-[1.55] text-[var(--bad-ink)]"
          >
            {turn.message}
          </p>
        ) : (
          <Answer key={index} result={turn.result} onAsk={onAsk} />
        ),
      )}

      {busy ? (
        <span className="flex gap-1 self-start rounded-[3px_13px_13px_13px] border border-[var(--border-subtle)] bg-[var(--bg)] px-3.5 py-2.5">
          {[0, 1, 2].map((delay) => (
            <i
              key={delay}
              className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]"
              style={{ animation: `ind-pulse 1.2s ${delay * 0.2}s infinite` }}
            />
          ))}
        </span>
      ) : null}
    </>
  );
}

function OperationalLinkPanel({ kind }: { kind: Exclude<RailTab, "chat"> }): React.JSX.Element {
  const content = {
    alerts: { icon: Icons.Radar, title: "Current risks", body: "See risks calculated from current sales, supply, planning, quality and maintenance records.", href: "/agentos/commander", action: "Open Decision Commander" },
    briefing: { icon: Icons.ClipboardList, title: "Live decision brief", body: "The commander gives one short summary with source records and clear next choices.", href: "/agentos/commander", action: "Open current brief" },
    actions: { icon: Icons.UserRoundCheck, title: "Human decisions", body: "See only the governed actions that are genuinely waiting for an authorised person.", href: "/agentos/approvals", action: "Open approval inbox" },
  }[kind];
  const Icon = content.icon;
  return (
    <div className="grid flex-1 place-items-center px-3 py-8 text-center">
      <div>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-[14px] bg-[var(--brand-soft)] text-[var(--brand)]"><Icon className="h-5 w-5" aria-hidden /></span>
        <h3 className="mt-3 text-[14px] font-bold text-[var(--text-primary)]">{content.title}</h3>
        <p className="mt-1 max-w-[28ch] text-[11px] leading-5 text-[var(--text-secondary)]">{content.body}</p>
        <Link href={content.href} className="btn btn-primary btn-sm mt-4">{content.action}<Icons.ArrowRight className="h-3 w-3" aria-hidden /></Link>
      </div>
    </div>
  );
}

function CopyAnswer({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        const copy = navigator.clipboard?.writeText(text);
        if (copy) {
          void copy
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            })
            .catch(() => {
              // Clipboard policy can refuse writes in embedded or insecure contexts.
            });
        }
      }}
      className="inline-flex h-7 items-center gap-1 rounded-[8px] px-2 text-[9.5px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--text-primary)]"
    >
      {copied ? (
        <Icons.Check className="h-3 w-3 text-[var(--ok-ink)]" aria-hidden />
      ) : (
        <Icons.Copy className="h-3 w-3" aria-hidden />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Answer({
  result,
  onAsk,
}: {
  result: AskResult;
  onAsk: (question: string) => Promise<void>;
}): React.JSX.Element {
  if (!result.answered) {
    return (
      <article className="w-full self-start overflow-hidden rounded-[14px] border border-[var(--accent-line)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-2 border-b border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 py-2">
          <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-[var(--surface)] text-[var(--accent-ink)]">
            <Icons.ShieldAlert className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span>
            <span className="block text-[10.5px] font-bold text-[var(--text-primary)]">
              Guardrail response
            </span>
            <span className="block text-[8.5px] uppercase tracking-[0.09em] text-[var(--accent-ink)]">
              {result.refusal?.code?.replace(/_/g, " ") ?? "Needs clarification"}
            </span>
          </span>
        </div>
        <p className="px-3 py-3 text-[12px] leading-[1.6] text-[var(--text-primary)]">
          {result.refusal?.message ?? result.answer}
        </p>
        {result.didYouMean && result.didYouMean.length > 0 ? (
          <div className="flex flex-col gap-1.5 border-t border-[var(--border-subtle)] bg-[var(--bg)] p-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Try one of these grounded questions
            </p>
            {result.didYouMean.map((suggestion) => (
              <button
                key={suggestion.key}
                type="button"
                onClick={() => void onAsk(suggestion.question)}
                className="flex items-center gap-2 rounded-[9px] border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-2 text-left text-[11px] text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                <Icons.CornerDownRight className="h-3 w-3 shrink-0" aria-hidden />
                {suggestion.question}
              </button>
            ))}
          </div>
        ) : null}
      </article>
    );
  }

  const columns = result.rows.length > 0 ? Object.keys(result.rows[0] ?? {}) : [];
  const confidence = Math.max(0, Math.min(1, result.understanding.confidence));
  const asOf = result.citation?.asOf
    ? new Date(result.citation.asOf).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <article className="w-full self-start overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[linear-gradient(120deg,var(--brand-soft-2),var(--surface))] px-3 py-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[var(--brand)] text-[var(--text-on-brand)]">
          <Icons.Sparkles className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span>
          <span className="block text-[10.5px] font-bold text-[var(--text-primary)]">
            ONYX answer
          </span>
          <span className="flex items-center gap-1 text-[8.5px] uppercase tracking-[0.08em] text-[var(--ok-ink)]">
            <Icons.BadgeCheck className="h-3 w-3" aria-hidden />
            Evidence-backed
          </span>
        </span>
        <span className="ml-auto">
          <CopyAnswer text={result.answer} />
        </span>
      </div>
      <p className="whitespace-pre-wrap px-3.5 py-3 text-[12.5px] font-medium leading-[1.65] text-[var(--text-primary)]">
        {conciseCopilotAnswer(result.answer, result.rows.length)}
      </p>

      {result.rows.length > 0 ? (
        <div className="px-3 pb-3">
          <Disclosure
            title="Records used"
            hint={`${result.citation?.rowCount ?? result.rows.length} records`}
          >
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              <Icons.Rows3 className="h-3 w-3" aria-hidden />
              Records read
            </span>
            <span className="text-[9px] tabular-nums text-[var(--text-muted)]">
              Showing {Math.min(result.rows.length, 8)} of {result.citation?.rowCount ?? result.rows.length}
            </span>
          </div>
          <div className="overflow-x-auto rounded-[9px] border border-[var(--border-subtle)] bg-[var(--surface)]">
            <table className="grid-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col">
                    {column.replace(/([a-z])([A-Z])/g, "$1 $2")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, 8).map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((column) => (
                    <td key={column}>{String(row[column] ?? "—")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </Disclosure>
        </div>
      ) : null}

      {result.citation ? (
        <div className="px-3 pb-3">
          <Disclosure title="How this answer was found" hint="Sources and checks">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-[var(--ok-soft)] text-[var(--ok-ink)]">
              <Icons.ScanSearch className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span>
              <span className="block text-[9.5px] font-bold uppercase tracking-[0.09em] text-[var(--text-primary)]">
                Evidence trail
              </span>
              <span className="block text-[8.5px] text-[var(--text-muted)]">
                {result.understanding.routedBy === "model"
                  ? "AI matched, then catalogue verified"
                  : "Deterministically matched"}{" "}
                · {Math.round(confidence * 100)}% confidence
              </span>
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface)]">
            <span
              className="block h-full rounded-full bg-[var(--ok)]"
              style={{ width: `${Math.round(confidence * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-[10.5px] leading-[1.5] text-[var(--text-secondary)]">
            Understood as <b className="font-semibold text-[var(--text-primary)]">“{result.citation.intentQuestion}”</b>
          </p>
          {result.citation.params && Object.keys(result.citation.params).length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(result.citation.params).map(([key, value]) => (
                <code
                  key={key}
                  className="rounded-[6px] bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)] text-[8.5px] text-[var(--text-secondary)]"
                >
                  {key}={String(value)}
                </code>
              ))}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[8.5px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Sources
            </span>
            {result.citation.sources.map((source) => (
              <code
                key={source}
                className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-0.5 font-[var(--font-mono)] text-[8.5px] font-bold text-[var(--text-muted)]"
              >
                {source}
              </code>
            ))}
            {result.citation.truncated ? (
              <span className="chip chip-accent">Row cap applied</span>
            ) : null}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 text-[8.5px] text-[var(--text-muted)]">
            <span>{asOf ? `As of ${asOf}` : "Current permitted records"}</span>
            <code className="font-[var(--font-mono)]">trace {result.correlationId.slice(0, 8)}</code>
          </div>
          </Disclosure>
        </div>
      ) : null}
    </article>
  );
}
