"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  X,
} from "lucide-react";
import type { ScreenProps } from "@spine/registry/manifest";
import { ErrorState, Loading } from "@spine/states";
import { dateTime, humanise } from "@spine/format";
import { cn } from "@spine/ui/cn";
import {
  agentOsApi,
  type AgentRunSummary,
  type PendingAgentApproval,
} from "../api";

interface ApprovalWithRun {
  approval: PendingAgentApproval;
  run: AgentRunSummary | null;
}

type Decision = "approved" | "rejected";

export default function ApprovalsScreen(_props: ScreenProps): React.JSX.Element {
  const [items, setItems] = useState<readonly ApprovalWithRun[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [outcome, setOutcome] = useState<{
    decision: Decision;
    title: string;
  } | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const [approvals, runs] = await Promise.all([
        agentOsApi.approvals(),
        agentOsApi.runs(100),
      ]);
      const byRun = new Map(runs.map((run) => [run.id, run]));
      setItems(
        approvals.map((approval) => ({
          approval,
          run: byRun.get(approval.runId) ?? null,
        })),
      );
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => void load(), 15_000);
    const onFocus = (): void => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(refresh);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const highRisk = useMemo(
    () =>
      items.filter(({ approval }) =>
        ["high", "critical"].includes(approval.risk.toLowerCase()),
      ).length,
    [items],
  );

  async function decide(item: ApprovalWithRun, decision: Decision): Promise<void> {
    const note = (notes[item.approval.id] ?? "").trim();
    if (note.length < 3 || deciding) return;
    setDeciding(item.approval.id);
    setError(null);
    try {
      await agentOsApi.decide(item.approval.id, decision, note);
      setOutcome({ decision, title: item.approval.title });
      window.dispatchEvent(new Event("xelor:approvals-changed"));
      setNotes((current) => {
        const next = { ...current };
        delete next[item.approval.id];
        return next;
      });
      await load();
    } catch (cause) {
      setError(cause);
    } finally {
      setDeciding(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="relative overflow-hidden rounded-[18px] border border-[color-mix(in_srgb,var(--violet)_24%,var(--border-subtle))] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)] lg:p-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              "radial-gradient(circle at 4% 0%, var(--violet-soft) 0, transparent 38%), radial-gradient(circle at 100% 100%, var(--brand-soft) 0, transparent 32%)",
          }}
          aria-hidden
        />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[var(--violet)] text-white shadow-[var(--shadow-md)]">
              <UserRoundCheck className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--ai-text)]">
                Human in the loop
              </p>
              <h1 className="mt-1 text-[24px] font-extrabold tracking-[-0.025em] text-[var(--text-primary)]">
                Human Approvals
              </h1>
              <p className="mt-1.5 max-w-[70ch] text-[12.5px] leading-5 text-[var(--text-secondary)]">
                Nothing consequential moves forward until an authorised person reviews the
                proposal, records a note and chooses Approve or Reject.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void load();
              }}
              className="btn btn-ghost btn-sm"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
              Refresh
            </button>
            <Link href="/agentos/command" className="btn btn-primary btn-sm">
              <Eye className="h-3.5 w-3.5" aria-hidden />
              Open Mission Control
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3" aria-label="Approval summary">
        <Summary
          icon={Clock3}
          label="Waiting for you"
          value={String(items.length)}
          note="Pending human decisions"
          tone={items.length > 0 ? "wait" : "good"}
        />
        <Summary
          icon={ShieldCheck}
          label="High risk"
          value={String(highRisk)}
          note="Needs extra care before approval"
          tone={highRisk > 0 ? "risk" : "good"}
        />
        <Summary
          icon={UserRoundCheck}
          label="Control"
          value="Human"
          note="AI cannot approve its own work"
          tone="ai"
        />
      </section>

      {outcome ? (
        <div
          role="status"
          className={cn(
            "flex items-start gap-3 rounded-[12px] border px-4 py-3",
            outcome.decision === "approved"
              ? "border-[color-mix(in_srgb,var(--ok)_35%,var(--border-subtle))] bg-[var(--ok-soft)] text-[var(--ok-ink)]"
              : "border-[color-mix(in_srgb,var(--bad)_35%,var(--border-subtle))] bg-[var(--bad-soft)] text-[var(--bad-ink)]",
          )}
        >
          {outcome.decision === "approved" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <div>
            <p className="text-[12px] font-bold">
              {outcome.decision === "approved" ? "Approved" : "Rejected"}: {outcome.title}
            </p>
            <p className="mt-0.5 text-[10.5px] opacity-80">
              Your identity, note and decision time were recorded in the audit trail.
            </p>
          </div>
        </div>
      ) : null}

      {error ? <ErrorState error={error} onRetry={() => void load()} /> : null}
      {loading && items.length === 0 ? <Loading label="Checking for approvals…" /> : null}

      {!loading && !error && items.length === 0 ? (
        <section className="card grid place-items-center px-6 py-14 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--ok-soft)] text-[var(--ok-ink)]">
            <CheckCircle2 className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="mt-3 text-[16px] font-bold text-[var(--text-primary)]">
            No approvals are waiting
          </h2>
          <p className="mt-1 max-w-[54ch] text-[12px] leading-5 text-[var(--text-secondary)]">
            When an agent mission reaches a human gate, it will appear here automatically
            and the Approvals button in the top bar will show the count.
          </p>
          <Link href="/agentos/command" className="btn btn-ghost btn-sm mt-4">
            View missions
          </Link>
        </section>
      ) : null}

      {items.length > 0 ? (
        <section aria-labelledby="pending-approval-heading">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 id="pending-approval-heading" className="text-[15px] font-extrabold text-[var(--text-primary)]">
                Decisions waiting for you
              </h2>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                Oldest request first. Read the exact consequence before deciding.
              </p>
            </div>
            <span className="rounded-full bg-[var(--warn-soft)] px-2.5 py-1 text-[10px] font-bold text-[var(--warn-ink)]">
              {items.length} pending
            </span>
          </div>
          <div className="grid gap-4">
            {items.map((item) => {
              const note = notes[item.approval.id] ?? "";
              const busy = deciding === item.approval.id;
              return (
                <article
                  key={item.approval.id}
                  className="overflow-hidden rounded-[14px] border border-[color-mix(in_srgb,var(--warn)_30%,var(--border-subtle))] bg-[var(--surface)] shadow-[var(--shadow-sm)]"
                >
                  <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] bg-[var(--warn-soft)] px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[color-mix(in_srgb,var(--warn)_30%,var(--border-subtle))] bg-[var(--surface)] px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-[var(--warn-ink)]">
                          Human decision required
                        </span>
                        <span className="text-[10px] font-bold uppercase text-[var(--text-muted)]">
                          {humanise(item.approval.risk)} risk
                        </span>
                      </div>
                      <h3 className="mt-2 text-[15px] font-extrabold text-[var(--text-primary)]">
                        {item.approval.title}
                      </h3>
                      <p className="mt-1 text-[10.5px] text-[var(--text-muted)]">
                        Requested {dateTime(item.approval.createdAt)}
                        {item.run ? ` · ${item.run.goal}` : ""}
                      </p>
                    </div>
                    <Link
                      href="/agentos/command"
                      className="inline-flex shrink-0 items-center gap-1.5 text-[10.5px] font-bold text-[var(--brand)] hover:underline"
                    >
                      Inspect full mission
                      <Eye className="h-3 w-3" aria-hidden />
                    </Link>
                  </div>

                  <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                        What approval allows
                      </p>
                      <p className="mt-2 text-[12.5px] leading-5 text-[var(--text-primary)]">
                        {item.approval.proposedAction}
                      </p>
                      <div className="mt-3 flex gap-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" aria-hidden />
                        <p className="text-[10.5px] leading-4.5 text-[var(--text-secondary)]">
                          Approving only releases the exact action written above. It does not
                          grant the agent wider access or permission to approve later work.
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg)] p-3">
                      <label
                        htmlFor={`approval-note-${item.approval.id}`}
                        className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]"
                      >
                        Your decision note
                      </label>
                      <textarea
                        id={`approval-note-${item.approval.id}`}
                        value={note}
                        onChange={(event) =>
                          setNotes((current) => ({
                            ...current,
                            [item.approval.id]: event.target.value,
                          }))
                        }
                        maxLength={500}
                        rows={3}
                        placeholder="State what you checked and why you approve or reject…"
                        className="mt-2 w-full resize-y rounded-[9px] border border-[var(--border-input)] bg-[var(--surface)] px-3 py-2 text-[12px] leading-5 text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"
                      />
                      <p className="mt-1 text-[9.5px] text-[var(--text-muted)]">
                        Required · saved with your identity · {note.length}/500
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={note.trim().length < 3 || deciding !== null}
                          onClick={() => void decide(item, "rejected")}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] border border-[var(--bad)] bg-[var(--surface)] text-[11px] font-bold text-[var(--bad-ink)] transition-colors hover:bg-[var(--bad-soft)] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={note.trim().length < 3 || deciding !== null}
                          onClick={() => void decide(item, "approved")}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] bg-[var(--ok)] text-[11px] font-bold text-white transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden />
                          {busy ? "Recording…" : "Approve"}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
  note: string;
  tone: "good" | "wait" | "risk" | "ai";
}): React.JSX.Element {
  return (
    <article
      className={cn(
        "rounded-[13px] border p-4",
        tone === "good" && "border-[color-mix(in_srgb,var(--ok)_28%,var(--border-subtle))] bg-[var(--ok-soft)] text-[var(--ok-ink)]",
        tone === "wait" && "border-[color-mix(in_srgb,var(--warn)_28%,var(--border-subtle))] bg-[var(--warn-soft)] text-[var(--warn-ink)]",
        tone === "risk" && "border-[color-mix(in_srgb,var(--bad)_28%,var(--border-subtle))] bg-[var(--bad-soft)] text-[var(--bad-ink)]",
        tone === "ai" && "border-[color-mix(in_srgb,var(--violet)_28%,var(--border-subtle))] bg-[var(--violet-soft)] text-[var(--ai-text)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9.5px] font-extrabold uppercase tracking-[0.11em]">{label}</p>
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <p className="mt-2 text-[23px] font-extrabold">{value}</p>
      <p className="mt-0.5 text-[10.5px] opacity-80">{note}</p>
    </article>
  );
}
