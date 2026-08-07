"use client";

import { Star } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { ErrorState, Loading } from "@spine/states";
import { num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { CsatSummary } from "../api";
import { cspApi } from "../api";

/**
 * CUSTOMER SATISFACTION.
 *
 * The response RATE sits next to the average deliberately. A 4.8 from three replies out of
 * ninety surveys is not a good score, it is a small sample of the people who were willing
 * to answer — and a screen that shows only the average invites exactly that mistake.
 *
 * Open follow-ups are counted because a low score is meant to CREATE WORK. Three stars or
 * fewer raises a follow-up when the response is recorded; a satisfaction number that is
 * filed and never acted on is a metric, not a feedback loop.
 */
export default function CsatScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<CsatSummary>(cspApi.csatReportPath);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return <Loading label="Loading satisfaction scores…" />;

  const scored = Object.values(data.distribution).reduce((a, b) => a + b, 0);
  const largest = Math.max(1, ...Object.values(data.distribution));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Customer feedback"
        subtitle="What customers said after an after-sales product case was closed, how many replied and which low scores still need follow-up."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Average score"
          value={data.averageCsat == null ? "—" : `${num(data.averageCsat, 1)} / 5`}
          note={
            data.averageCsat == null
              ? "Nobody has answered a survey yet"
              : `From ${num(data.responded)} ${data.responded === 1 ? "reply" : "replies"}`
          }
        />
        <Tile
          label="Response rate"
          value={`${num(data.responseRatePct, 1)}%`}
          note={`${num(data.responded)} answered of ${num(data.sent)} sent`}
        />
        <Tile
          label="Follow-ups open"
          value={num(data.openFollowUps)}
          note="Raised automatically at three stars or fewer"
        />
        <Tile
          label="Unhappy comments"
          value={num(data.negativeVerbatims)}
          note="Tagged negative when the response was written"
        />
      </div>

      <section className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <h2 className="mb-3 text-[13px] font-semibold text-[var(--text-primary)]">
          How the scores fell
        </h2>
        {scored === 0 ? (
          <p className="text-[13px] text-[var(--text-secondary)]">
            No survey has been answered yet. Scores appear here once a closed product case's survey
            comes back.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {/* Five down to one: the eye lands on the top row first, and the row that needs
                to be seen is not the one with the most stars. */}
            {["5", "4", "3", "2", "1"].map((score) => {
              const count = data.distribution[score] ?? 0;
              return (
                <li key={score} className="flex items-center gap-3 text-[13px]">
                  <span className="flex w-16 shrink-0 items-center gap-1 text-[var(--text-secondary)]">
                    {score}
                    <Star className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                    <span
                      className="block h-full rounded-full bg-[var(--brand)]"
                      style={{ width: `${Math.round((count / largest) * 100)}%` }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right font-semibold tabular-nums" data-numeric="">
                    {num(count)}
                    <span className="ml-1 font-normal text-[var(--text-muted)]">
                      {Math.round((count / scored) * 100)}%
                    </span>
                  </span>
                  {/* A score at or below three is the threshold that creates work, so it is
                      marked here as well — the distribution is where a manager sees it. */}
                  <span className="w-24 shrink-0">
                    {Number(score) <= 3 && count > 0 ? (
                      <StatusBadge tone="pending" label="Follow up" />
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}): React.JSX.Element {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        {label}
      </div>
      <div
        className="mt-1 text-[24px] font-bold leading-8 tabular-nums text-[var(--text-primary)]"
        data-numeric=""
      >
        {value}
      </div>
      {note ? <div className="mt-0.5 text-[12px] text-[var(--text-secondary)]">{note}</div> : null}
    </div>
  );
}
