"use client";

import { useState } from "react";
import {
  Clock,
  Headset,
  Loader2,
  Lock,
  MessageSquare,
  ShieldQuestion,
  SendHorizontal,
} from "lucide-react";
import { api } from "@spine/api/client";
import { AppError } from "@spine/api/errors";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Can } from "@spine/access/permissions";
import { Empty, ErrorState, FieldError, Loading } from "@spine/states";
import { dateTime, humanise, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import {
  costingApi,
  coverageAge,
  coverageTone,
  isOpenTicket,
  slaTone,
  type EntitlementResult,
  type TicketDetail,
  type TicketQueue,
  type TicketSla,
  type TicketView,
} from "../api";

/**
 * SERVICE DESK — a case list WITH a reply box, which is the whole point of this screen.
 *
 * The ticket view in Customer Care & Warranty is deliberately read-only: it says so in its
 * own header, and the reason given there is sound — a drafted reply is a message waiting for
 * somebody to own it, and half of an approval mechanism is worse than none. Closing that gap
 * is one of the two reasons this module exists, so this screen carries the reply.
 *
 * WHAT MAKES THE REPLY SAFE HERE, since no approval table was added:
 *
 *   THE PERSON WRITES IT. There is no draft generator on this screen and no model call
 *   anywhere in this module. The API has an AI drafting endpoint; this screen does not call
 *   it. A reply is somebody's sentence, sent under their own credentials, through
 *   `POST /csp/tickets/:ticketNo/comments` behind `csp.ticket.update`.
 *
 *   PUBLIC AND INTERNAL ARE A DELIBERATE CHOICE, NOT A DEFAULT. `public` reaches the
 *   customer; `internal` never leaves the building. The control asks every time and shows
 *   what each one means, because the expensive mistake is an internal note about a supplier's
 *   quality problem going out on a customer's case.
 *
 *   THE CLOCK IS THE ENGINE'S, NOT THIS SCREEN'S. Every SLA figure is read from
 *   `GET /csp/tickets/:ticketNo/sla` exactly as the engine computed it, including the reason
 *   for the verdict. Nothing here recomputes a deadline, because the party being measured
 *   must not be the party doing the measuring.
 *
 * WHAT THIS SCREEN IS NOT, and it must not be sold as either:
 *
 *   IT IS NOT A STAFFED SERVICE DESK. Nobody is on the other end of this because the software
 *   exists. It records a commitment and shows when the commitment has been missed; who
 *   answers, and how quickly, is a staffing decision this product cannot make.
 *
 *   THE SLA IS A RECORD, NOT A GUARANTEE. The policy and its clock are rows in a database.
 *   A clock running green means the promise has not yet been missed, not that an engineer is
 *   on the way.
 */

const STATUS_FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Every case" },
  { value: "new,triaged,in_progress,pending_customer,reopened", label: "Open cases" },
  { value: "new", label: "Not yet looked at" },
  { value: "pending_customer", label: "Waiting on the customer" },
  { value: "resolved,closed", label: "Finished" },
];

/** The transitions the API's own enum accepts. Anything not here would be a 400. */
const NEXT_STATUSES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "triaged", label: "Triaged" },
  { value: "in_progress", label: "In progress" },
  { value: "pending_customer", label: "Waiting on the customer" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "reopened", label: "Reopened" },
];

export default function ServiceDeskScreen(_props: ScreenProps): React.JSX.Element {
  const [statusFilter, setStatusFilter] = useState(STATUS_FILTERS[1]?.value ?? "");
  const [ticketNo, setTicketNo] = useState("");

  const queue = useQuery<TicketQueue>(costingApi.ticketsPath, {
    query: { status: statusFilter || undefined },
  });

  const columns: ReadonlyArray<Column<TicketView>> = [
    {
      key: "ticketNo",
      header: "Case",
      width: "w-48",
      render: (t) => (
        <button
          type="button"
          className="text-left font-semibold text-[var(--brand)] underline-offset-4 hover:underline"
          onClick={() => setTicketNo(t.ticketNo)}
          aria-label={`Open ${t.ticketNo}`}
        >
          {t.ticketNo}
        </button>
      ),
    },
    {
      key: "subject",
      header: "What they said it was",
      render: (t) => (
        <>
          <span className="font-semibold text-[var(--text-primary)]">{t.subject}</span>
          <div className="text-[11px] text-[var(--text-muted)]">
            {humanise(t.channel)} · raised {dateTime(t.createdAt)}
            {t.reopenCount > 0 ? ` · reopened ${t.reopenCount}×` : ""}
          </div>
        </>
      ),
    },
    {
      key: "machine",
      header: "Machine",
      width: "w-44",
      render: (t) =>
        t.productSerialNo ? (
          <span className="font-[var(--font-mono)] text-[12px]">{t.productSerialNo}</span>
        ) : (
          <span className="text-[var(--text-muted)]">Not named</span>
        ),
    },
    {
      key: "cover",
      header: "Cover",
      width: "w-40",
      render: (t) =>
        t.entitlement.verdict ? (
          <StatusBadge
            tone={coverageTone(t.entitlement.verdict)}
            label={humanise(t.entitlement.verdict)}
          />
        ) : t.productSerialNo ? (
          <span className="text-[12px] text-[var(--status-pending-text)]">Not checked</span>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        ),
    },
    {
      key: "status",
      header: "State",
      width: "w-36",
      render: (t) => <StatusBadge status={t.status} />,
    },
    {
      key: "sla",
      header: "Response clock",
      width: "w-44",
      render: (t) => <StatusBadge tone={slaTone(t.sla.state)} label={t.sla.chip.label} />,
    },
  ];

  const rows = queue.data ?? [];
  const open = rows.filter((t) => isOpenTicket(t.status)).length;
  const breached = rows.filter((t) => t.sla.state.startsWith("breached")).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Service desk"
        subtitle="Customer cases, their response clock, and a reply that goes out under your own name."
        meta={[
          { label: "Open", value: num(open) },
          { label: "Past commitment", value: num(breached) },
        ]}
      />

      <div className="x-notice">
        <Headset className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          This software <strong>records</strong> a service commitment; it does not staff one. A
          clock running green means the promise has not yet been missed, not that somebody is
          on their way. Replies are written by people — there is no draft generator on this
          screen and no model call in this module.
        </div>
      </div>

      <label className="block max-w-xs">
        <span className="field-label">Show</span>
        <select
          className="field"
          value={statusFilter}
          aria-label="Filter cases by state"
          onChange={(event) => {
            setStatusFilter(event.target.value);
            setTicketNo("");
          }}
        >
          {STATUS_FILTERS.map((filter) => (
            <option key={filter.label} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>
      </label>

      <DataTable
        rows={rows}
        columns={columns}
        loading={queue.loading}
        error={queue.error}
        onReload={queue.reload}
        rowKey={(t) => t.ticketNo}
        caption="Service cases with the machine, coverage, state and response clock"
        empty={
          <Empty
            title={statusFilter ? "No case in that state" : "No service case has been raised"}
            body={
              statusFilter
                ? "Nothing matches that filter. Choose “Every case” above to see the whole queue."
                : "A case arrives from the customer portal, or is logged here when somebody telephones. The response clock starts when the CUSTOMER raised it, not when an agent found a minute to type it in — so a call logged three hours late is already three hours into its promise."
            }
            icon={<Headset />}
          />
        }
      />

      {ticketNo ? (
        <CaseDetail
          ticketNo={ticketNo}
          onClose={() => setTicketNo("")}
          onChanged={queue.reload}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------- one case --------------------------------- */

function CaseDetail({
  ticketNo,
  onClose,
  onChanged,
}: {
  ticketNo: string;
  onClose: () => void;
  onChanged: () => void;
}): React.JSX.Element {
  const ticket = useQuery<TicketDetail>(costingApi.ticketPath(ticketNo));
  // The clock alone, from the endpoint that reads the ticket row and the policy list and
  // nothing else. Fetched separately from the body because it is the fact most likely to
  // have moved since the queue was drawn.
  const sla = useQuery<TicketSla>(costingApi.ticketSlaPath(ticketNo));

  function refresh(): void {
    ticket.reload();
    sla.reload();
    onChanged();
  }

  return (
    <section className="x-home-panel" aria-labelledby="case-heading">
      <div className="x-home-panel-head flex-wrap gap-3">
        <div className="min-w-0">
          <h2 id="case-heading" className="x-section-heading">
            {ticketNo}
          </h2>
          <p>{ticket.data ? ticket.data.subject : "Reading the case…"}</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="panel-b flex flex-col gap-4">
        {ticket.error ? (
          <ErrorState error={ticket.error} onRetry={ticket.reload} />
        ) : !ticket.data ? (
          <Loading label="Loading the case…" />
        ) : (
          <>
            <ClockPanel clock={sla.data ?? ticket.data.sla} />

            <dl className="flex flex-wrap gap-x-8 gap-y-2">
              <Fact label="State" value={<StatusBadge status={ticket.data.status} />} />
              <Fact label="Priority" value={humanise(ticket.data.priority)} />
              <Fact label="Channel" value={humanise(ticket.data.channel)} />
              <Fact
                label="Category"
                value={ticket.data.categoryCode ? humanise(ticket.data.categoryCode) : "Not categorised"}
              />
              <Fact label="Machine" value={ticket.data.productSerialNo ?? "Not named"} />
              <Fact label="Owner" value={ticket.data.owner ?? "Unassigned"} />
              <Fact label="Complaint" value={ticket.data.complaintNo ?? "None raised"} />
            </dl>

            <EntitlementPanel ticket={ticket.data} onChecked={refresh} />

            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
                What the customer said
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-[var(--text-primary)]">
                {ticket.data.description}
              </p>
            </div>

            <Conversation comments={ticket.data.comments} />

            <ReplyBox ticketNo={ticketNo} onSent={refresh} />

            <MoveCase ticketNo={ticketNo} status={ticket.data.status} onMoved={refresh} />

            <Timeline events={ticket.data.timeline} />
          </>
        )}
      </div>
    </section>
  );
}

function ClockPanel({ clock }: { clock: TicketSla }): React.JSX.Element {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <StatusBadge tone={slaTone(clock.state)} label={clock.chip.label} />
          {/* The REASON, not just the verdict. A verdict without its reason is an assertion,
              and this is the panel an agent reads out when a customer disputes the clock. */}
          <p className="mt-1.5 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
            {clock.reason}
          </p>
        </div>
        <dl className="grid shrink-0 grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          <Fact label="Policy" value={clock.policyName ?? "None attached yet"} />
          <Fact label="Promise" value={clock.promise ?? "None recorded"} />
          <Fact label="First response due" value={dateTime(clock.firstResponseDue)} />
          <Fact label="Resolution due" value={dateTime(clock.resolutionDue)} />
          <Fact label="Working time used" value={`${num(clock.consumedMins)} min`} />
        </dl>
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-5 text-[var(--text-muted)]">
        <Clock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        The clock started when the customer raised the case, not when it was typed in — a call
        logged three hours later is already three hours into its promise. Untriaged cases carry
        no policy, so they have no deadline rather than a generous one.
      </p>
    </div>
  );
}

function EntitlementPanel({
  ticket,
  onChecked,
}: {
  ticket: TicketDetail;
  onChecked: () => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EntitlementResult | null>(null);
  const age = coverageAge(ticket.entitlement.checkedAt);

  async function run(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setResult(
        await api.post<EntitlementResult>(costingApi.entitlementCheckPath(ticket.ticketNo)),
      );
      onChecked();
    } catch (e) {
      setError(
        e instanceof AppError
          ? e.message
          : "The coverage check could not be run. Nothing was changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
            Warranty and AMC
          </h3>
          {ticket.entitlement.verdict ? (
            <p className="mt-1.5 text-[13px]">
              <StatusBadge
                tone={coverageTone(ticket.entitlement.verdict)}
                label={humanise(ticket.entitlement.verdict)}
              />
              <span className="ml-2 text-[12px] text-[var(--text-muted)]">
                determined {dateTime(ticket.entitlement.checkedAt)}
                {age?.stale ? ` — ${age.days} days ago` : ""}
              </span>
            </p>
          ) : (
            <p className="mt-1.5 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
              {ticket.productSerialNo
                ? "Nobody has run the check on this machine, so whether the work is chargeable is currently unknown. Promise nothing until it has been run."
                : "This case names no machine, so there is nothing to check coverage on. A serial number has to be on the case first."}
            </p>
          )}
        </div>
        {ticket.productSerialNo ? (
          <Can
            permission="csp.ticket.update"
            fallback={
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                <Lock className="h-3 w-3" aria-hidden />
                Needs csp.ticket.update
              </span>
            }
          >
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => void run()}
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Checking…
                </>
              ) : (
                <>
                  <ShieldQuestion className="h-3.5 w-3.5" aria-hidden />
                  Check coverage
                </>
              )}
            </button>
          </Can>
        ) : null}
      </div>
      {error ? <FieldError message={error} /> : null}
      {result ? (
        <div className="mt-3 text-[12px] leading-5 text-[var(--text-secondary)]">
          <p className="font-semibold text-[var(--text-primary)]">{result.summary}</p>
          <ul className="mt-1 list-disc pl-5">
            {result.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {result.anomalies.length > 0 ? (
            <p className="mt-1.5 text-[var(--status-pending-text)]">
              {result.anomalies.map((a) => a.detail).join(" ")} An anomaly is flagged for a
              person and never silently flips the verdict — a data-entry error is not fraud.
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="mt-3 text-[11px] leading-5 text-[var(--text-muted)]">
        The determination is made against the DATE OF FAILURE, not today: a failure inside the
        cover period stays covered even when the customer reports it three weeks later.
      </p>
    </div>
  );
}

function Conversation({
  comments,
}: {
  comments: readonly TicketDetail["comments"][number][];
}): React.JSX.Element {
  if (comments.length === 0) {
    return (
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
          Conversation
        </h3>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
          Nothing has been said back yet. The first public reply is what stops the
          first-response clock.
        </p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        Conversation
      </h3>
      <ol className="mt-2 flex flex-col gap-2">
        {comments.map((comment, index) => (
          <li
            key={`${comment.createdAt}-${index}`}
            className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                tone={comment.visibility === "public" ? "approved" : "draft"}
                label={comment.visibility === "public" ? "Sent to customer" : "Internal only"}
              />
              <span className="text-[11px] text-[var(--text-muted)]">
                {humanise(comment.authorType)} · {dateTime(comment.createdAt)}
                {comment.sentAt ? ` · delivered ${dateTime(comment.sentAt)}` : ""}
              </span>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-5 text-[var(--text-primary)]">
              {comment.body}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * THE REPLY BOX — the gap this module was built to close.
 *
 * `<Can>`-gated rather than disabled: somebody who may read a case but not answer it is never
 * shown a box they cannot post from. The visibility choice is explicit every time and
 * defaults to `public` only because that is what the API defaults to; the two options are
 * described in the words that matter — reaches the customer, or does not.
 */
function ReplyBox({
  ticketNo,
  onSent,
}: {
  ticketNo: string;
  onSent: () => void;
}): React.JSX.Element {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"public" | "internal">("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(): Promise<void> {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(costingApi.ticketCommentsPath(ticketNo), { body: text, visibility });
      setBody("");
      onSent();
    } catch (e) {
      setError(
        e instanceof AppError
          ? e.message
          : "The reply was not recorded. Nothing was sent to the customer.",
      );
    } finally {
      // Always re-enabled, including after a failure. A button stuck disabled on an error is
      // a dead screen, and the client's idempotency key is what keeps a second press safe.
      setBusy(false);
    }
  }

  return (
    <Can
      permission="csp.ticket.update"
      fallback={
        <div className="x-notice" data-tone="warning">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            Replying needs <code className="font-[var(--font-mono)]">csp.ticket.update</code>,
            which you do not hold. You can read this case and its clock; answering it belongs
            to somebody else.
          </div>
        </div>
      }
    >
      <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-4">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          Reply
        </h3>
        <textarea
          className="field mt-2 min-h-[7rem]"
          value={body}
          aria-label="Your reply"
          placeholder="Write the reply in your own words. Nothing drafts this for you, and nothing should — a sentence a customer reads should be one a person chose."
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <fieldset className="flex flex-wrap items-center gap-4">
            <legend className="sr-only">Who sees this reply</legend>
            <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-primary)]">
              <input
                type="radio"
                name={`visibility-${ticketNo}`}
                checked={visibility === "public"}
                onChange={() => setVisibility("public")}
              />
              Send to the customer
            </label>
            <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-primary)]">
              <input
                type="radio"
                name={`visibility-${ticketNo}`}
                checked={visibility === "internal"}
                onChange={() => setVisibility("internal")}
              />
              Internal note — never leaves the building
            </label>
          </fieldset>
          <button
            type="button"
            className="btn btn-pri"
            disabled={busy || body.trim().length === 0}
            onClick={() => void send()}
          >
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Recording…
              </>
            ) : (
              <>
                <SendHorizontal className="h-3.5 w-3.5" aria-hidden />
                {visibility === "public" ? "Send reply" : "Save internal note"}
              </>
            )}
          </button>
        </div>
        {error ? <FieldError message={error} /> : null}
        <p className="mt-2 text-[11px] leading-5 text-[var(--text-muted)]">
          A public reply is what stops the first-response clock, and the engine recomputes the
          verdict when it lands. An internal note does not, because the customer has still
          heard nothing.
        </p>
      </div>
    </Can>
  );
}

function MoveCase({
  ticketNo,
  status,
  onMoved,
}: {
  ticketNo: string;
  status: string;
  onMoved: () => void;
}): React.JSX.Element {
  const [next, setNext] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(): Promise<void> {
    if (!next || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(costingApi.ticketStatusPath(ticketNo), {
        status: next,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setNext("");
      setReason("");
      onMoved();
    } catch (e) {
      setError(
        e instanceof AppError
          ? e.message
          : "The case was not moved. It is still where it was.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Can permission="csp.ticket.update">
      <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
          Move the case on
        </h3>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="block w-56">
            <span className="field-label">From {humanise(status)} to</span>
            <select
              className="field"
              value={next}
              aria-label="New state for the case"
              onChange={(event) => setNext(event.target.value)}
            >
              <option value="">Leave it where it is</option>
              {NEXT_STATUSES.filter((option) => option.value !== status).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[16rem] flex-1">
            <span className="field-label">Why (recorded on the case)</span>
            <input
              type="text"
              className="field"
              value={reason}
              aria-label="Reason for moving the case"
              placeholder="e.g. part ordered, awaiting the customer's photograph"
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !next}
            onClick={() => void move()}
          >
            {busy ? "Moving…" : "Move"}
          </button>
        </div>
        {error ? <FieldError message={error} /> : null}
        <p className="mt-2 text-[11px] leading-5 text-[var(--text-muted)]">
          The API decides which moves are legal from the case&apos;s actual state; a refusal
          here is that rule answering, not a fault. Moving a case to{" "}
          <em>waiting on the customer</em> pauses the clock, which is why the reason is
          recorded alongside it.
        </p>
      </div>
    </Can>
  );
}

function Timeline({
  events,
}: {
  events: readonly TicketDetail["timeline"][number][];
}): React.JSX.Element | null {
  if (events.length === 0) return null;
  return (
    <details className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-4">
      <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        Everything that has happened to this case ({events.length})
      </summary>
      <ol className="mt-3 flex flex-col gap-1.5">
        {events.map((event, index) => (
          <li key={`${event.occurredAt}-${index}`} className="text-[12px] leading-5">
            <span className="text-[var(--text-muted)]">{dateTime(event.occurredAt)}</span>{" "}
            <span className="text-[var(--text-primary)]">{humanise(event.eventType)}</span>
            {event.fromValue || event.toValue ? (
              <span className="text-[var(--text-secondary)]">
                {" "}
                — {event.fromValue ?? "nothing"} → {event.toValue ?? "nothing"}
              </span>
            ) : null}
            <span className="text-[var(--text-muted)]"> · by {humanise(event.actorType)}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="text-[12.5px] font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
