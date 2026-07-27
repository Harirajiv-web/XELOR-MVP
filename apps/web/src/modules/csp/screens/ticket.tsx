"use client";

import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@spine/data/use-query";
import { Empty, ErrorState, Loading } from "@spine/states";
import { dateTime, humanise, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { TicketComment, TicketDetail, TicketSla, TicketTimelineEvent } from "../api";
import { cspApi } from "../api";
import { slaClockNote, slaTone } from "../sla-clock";

/**
 * ONE TICKET.
 *
 * Reached by clicking a row on the queue; the ticket NUMBER — TKT-2627-00031, the thing a
 * customer reads out on the telephone — arrives as `params[0]` and is what the endpoint is
 * keyed by, so the URL is legible and quotable.
 *
 * READ-ONLY, on purpose and for now. There is no reply box and no "suggest a reply" button
 * here: a drafted reply is a message waiting for a person to own it, and the approval step
 * that makes that safe is a later pass. A half-built version of it would be worse than none.
 *
 * The SLA panel is fetched from `/sla` separately from the ticket body. It answers with the
 * same object the detail already carries, so this is one request more than strictly needed —
 * kept because the clock is the fact most likely to move on its own, and reloading it alone
 * later costs nothing to wire.
 */
export default function TicketScreen({ params }: ScreenProps): React.JSX.Element {
  const ticketNo = params[0];
  const ticket = useQuery<TicketDetail>(ticketNo ? cspApi.ticketPath(ticketNo) : null);
  const sla = useQuery<TicketSla>(ticketNo ? cspApi.ticketSlaPath(ticketNo) : null);

  if (!ticketNo) {
    return (
      <Empty
        title="No ticket chosen"
        body="Open a ticket from the queue to see its clock, its conversation and everything that has happened to it."
        action={<BackLink />}
      />
    );
  }

  if (ticket.error) return <ErrorState error={ticket.error} onRetry={ticket.reload} />;
  if (ticket.loading || !ticket.data) return <Loading label="Loading ticket…" />;

  const t = ticket.data;
  const clock = sla.data ?? t.sla;
  const note = slaClockNote(clock);

  return (
    <div className="flex flex-col gap-4">
      <BackLink />

      <PageHeader
        title={t.ticketNo}
        subtitle={t.subject}
        meta={[
          { label: "Status", value: <StatusBadge status={t.status} /> },
          { label: "SLA", value: <StatusBadge tone={slaTone(clock.state)} label={clock.chip.label} /> },
          { label: "Priority", value: humanise(t.priority) },
          ...(t.reopenCount > 0 ? [{ label: "Reopened", value: `${t.reopenCount}×` }] : []),
        ]}
      />

      {/* THE CLOCK. Given its own panel rather than a table cell because the promise, the
          policy that set it and the reason for the current verdict are what an agent needs
          when a customer disputes it — and a verdict without its reason is an assertion. */}
      <section className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <StatusBadge tone={slaTone(clock.state)} label={clock.chip.label} />
            {note ? (
              <p className="mt-1.5 text-[13px] font-medium text-[var(--text-primary)]">{note}</p>
            ) : null}
            <p className="mt-1 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
              {clock.reason}
            </p>
          </div>
          <dl className="grid shrink-0 grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            <Fact label="Policy" value={clock.policyName ?? "None attached yet"} />
            <Fact label="Promise" value={clock.promise ?? "—"} />
            <Fact label="First response due" value={dateTime(clock.firstResponseDue)} />
            <Fact label="Resolution due" value={dateTime(clock.resolutionDue)} />
            <Fact label="Working time used" value={`${num(clock.consumedMins)} min`} />
          </dl>
        </div>
      </section>

      <section className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Raised" value={dateTime(t.createdAt)} />
          <Fact label="Channel" value={humanise(t.channel)} />
          <Fact label="Category" value={t.categoryCode ? humanise(t.categoryCode) : "Not categorised"} />
          <Fact label="Machine serial" value={t.productSerialNo ?? "Not given"} />
          <Fact
            label="Cover"
            value={t.entitlement.verdict ? humanise(t.entitlement.verdict) : "Not checked"}
          />
          {/* A ticket that became a formal complaint is now Quality's problem as well as
              service's. The number is the link between the two records. */}
          <Fact label="Complaint" value={t.complaintNo ?? "None raised"} />
          <Fact label="Owner" value={t.owner ?? "Unassigned"} mono={Boolean(t.owner)} />
          <Fact label="Team" value={t.teamId ?? "Unassigned"} mono={Boolean(t.teamId)} />
        </dl>

        <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
            What the customer said
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-[var(--text-primary)]">
            {t.description}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Conversation</h2>
        {t.comments.length === 0 ? (
          <Empty
            title="Nothing has been said yet"
            body="Replies and internal notes appear here as the desk works the ticket."
          />
        ) : (
          <ol className="flex flex-col gap-2">
            {t.comments.map((c, i) => (
              <li key={`${c.createdAt}-${i}`}>
                <Comment comment={c} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">History</h2>
        {t.timeline.length === 0 ? (
          <Empty title="No history yet" body="Every status change, assignment and clock event is recorded here." />
        ) : (
          <ol className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)]">
            {t.timeline.map((e, i) => (
              <li
                key={`${e.occurredAt}-${i}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-[var(--border-subtle)] px-3 py-2 text-[13px] last:border-b-0"
              >
                <span className="w-40 shrink-0 text-[12px] text-[var(--text-muted)]">
                  {dateTime(e.occurredAt)}
                </span>
                <span className="text-[var(--text-primary)]">{humanise(e.eventType)}</span>
                {e.fromValue || e.toValue ? (
                  <span className="text-[var(--text-secondary)]">
                    {e.fromValue ? `${humanise(e.fromValue)} → ` : ""}
                    {humanise(e.toValue)}
                  </span>
                ) : null}
                {/* Who did it, and specifically whether it was a person. An entry the model
                    wrote must never be readable as one an agent stands behind. */}
                <span className="ml-auto text-[12px] text-[var(--text-muted)]">
                  {actorLabel(e)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function actorLabel(e: TicketTimelineEvent): string {
  switch (e.actorType) {
    case "ai":
      return "suggested by the assistant";
    case "portal":
      return "by the customer";
    case "system":
      return "by the system";
    default:
      return "by the service desk";
  }
}

function Comment({ comment }: { comment: TicketComment }): React.JSX.Element {
  const internal = comment.visibility === "internal";
  const who =
    comment.authorType === "portal"
      ? "The customer"
      : comment.authorType === "system"
        ? "The system"
        : "The service desk";
  return (
    <article
      className={
        internal
          ? "rounded-[var(--radius-card)] border border-dashed border-[var(--border-input)] bg-[var(--surface-sunken)] p-3"
          : "rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-3"
      }
    >
      <header className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-muted)]">
        <span className="font-semibold text-[var(--text-secondary)]">{who}</span>
        <span>{dateTime(comment.sentAt ?? comment.createdAt)}</span>
        {/* An internal note that looks like a customer reply is how a private remark ends
            up quoted back at you. The treatment differs in border, fill and label. */}
        {internal ? (
          <span className="ml-auto inline-flex items-center gap-1 font-medium">
            <Lock className="h-3 w-3" aria-hidden />
            Internal — the customer cannot see this
          </span>
        ) : null}
      </header>
      <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-5 text-[var(--text-primary)]">
        {comment.body}
      </p>
    </article>
  );
}

function BackLink(): React.JSX.Element {
  return (
    <Link
      href="/csp/tickets"
      className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      All tickets
    </Link>
  );
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd
        className={
          mono
            ? "truncate font-[var(--font-mono)] text-[12px] text-[var(--text-primary)]"
            : "truncate text-[13px] text-[var(--text-primary)]"
        }
      >
        {value}
      </dd>
    </div>
  );
}
