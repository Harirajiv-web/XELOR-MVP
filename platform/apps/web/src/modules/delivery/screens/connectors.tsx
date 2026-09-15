"use client";

import { useMemo, useState } from "react";
import { RefreshCw, Search, Send } from "lucide-react";
import { api } from "@spine/api/client";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, FieldError } from "@spine/states";
import { dateTime, humanise, num } from "@spine/format";
import { StatusBadge } from "@spine/ui/status-badge";
import { Disclosure } from "@spine/ui/disclosure";
import { Can, useAccess } from "@spine/access/permissions";
import { PageHeader } from "@spine/shell/page-header";
import type { ScreenProps } from "@spine/registry/manifest";
import {
  ageLabel,
  circuitLabel,
  circuitTone,
  deliveryApi,
  durationLabel,
  interoperabilityClaim,
  recoveryDesk,
  severityTone,
  sourceSystemBound,
  type ConnectionRow,
  type DataEnvelope,
  type DlqEntryRow,
  type DlqSummary,
  type FlowRow,
  type MessageTrace,
  type WebhookRow,
} from "../api";
import { Bound, Fact, NeverClaim, NotStored, Panel, Recorded, Stat } from "../evidence";

/**
 * CONNECTORS — the data-operations console, and the most real screen in this package.
 *
 * Everything on it comes out of a table. The connection's health and circuit state, the
 * consecutive-failure count, every flow's status and the reason any is paused, the backlog
 * of dead-lettered messages with the deterministic verdict on whether each may be replayed,
 * the delivery attempts behind one correlation id. None of it is illustrative and none of it
 * needed a new endpoint — the integration module already keeps all of it, because a pipeline
 * that cannot say what it did is a pipeline nobody can operate.
 *
 * ---------------------------------------------------------------------------
 * THE THREE THINGS THIS SCREEN IS CAREFUL ABOUT
 * ---------------------------------------------------------------------------
 *
 * 1. LAST SUCCESSFUL SYNC IS NOT A FIELD THIS API RETURNS, AND IT IS NOT INVENTED.
 *    `/integration/connections` answers with health, circuit state, adapter mode, endpoint
 *    and consecutive failures. It does NOT answer with a per-connection timestamp of the
 *    last successful call. The obvious move is to show one anyway — derived from "healthy",
 *    or from whenever the page was loaded — and it is exactly the wrong move: a freshness
 *    figure that is actually a page-load time is worse than no figure, because an operations
 *    person will use it to decide that data is current. So this screen says the field does
 *    not exist and offers the thing that does: a correlation trace, which carries real
 *    timestamps for real messages and can be quoted.
 *
 * 2. A RECOVERY OWNER IS DERIVED FROM THE FAILURE CATEGORY, NOT INVENTED PER ENTRY.
 *    An open dead letter carries no owner field — the assignment is written only when
 *    somebody resolves it. Showing a name against an unassigned entry would make people stop
 *    looking for a real owner. What the category genuinely determines is which DESK can fix
 *    it: a mapping fault is engineering, an auth fault needs a credential nobody here holds.
 *    That is what `recoveryDesk()` returns, and it is labelled as derived.
 *
 * 3. REPLAY IS GUARDED BY THE SERVER, AND THIS SCREEN SHOWS THE GUARD RATHER THAN
 *    ROUTING AROUND IT. `replayAllowed`, `replayRequiresConfirmation` and `replayVerdict`
 *    are computed server-side by the deterministic triage table. A timeout against a system
 *    that may already have acted is refused outright; a statutory document requires an
 *    explicit confirmation, because a duplicate filing is visible to a regulator and cannot
 *    be quietly withdrawn. The button is disabled with the server's own reason shown, so an
 *    operator learns the rule rather than discovering it as an error.
 */
export default function ConnectorsScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const connections = useQuery<DataEnvelope<ConnectionRow>>(deliveryApi.connectionsPath);
  const flows = useQuery<DataEnvelope<FlowRow>>(
    can("integration.flow.read") ? deliveryApi.flowsPath : null,
  );
  const dlq = useQuery<DlqSummary>(
    can("integration.message.read") ? deliveryApi.dlqPath : null,
  );

  const connectionRows = connections.data?.data ?? [];
  const flowRows = flows.data?.data ?? [];
  // Memoised so the empty-array fallback does not become a new identity on every render —
  // it is both a `useMemo` dependency below and a prop on the recovery table.
  const entries = useMemo(() => dlq.data?.entries ?? [], [dlq.data]);

  const down = connectionRows.filter((c) => c.circuitState === "open");
  const degraded = connectionRows.filter(
    (c) => c.circuitState === "half_open" || (c.circuitState !== "open" && c.consecutiveFailures > 0),
  );
  const pausedFlows = flowRows.filter((f) => f.status !== "active");

  /** Backlog per flow, counted off the real dead letters rather than estimated. */
  const backlogByFlow = useMemo(() => {
    const counts = new Map<string, { total: number; needsHuman: number; statutory: number }>();
    for (const entry of entries) {
      const current = counts.get(entry.flowCode) ?? { total: 0, needsHuman: 0, statutory: 0 };
      current.total += 1;
      if (!entry.replayAllowed) current.needsHuman += 1;
      if (entry.isStatutory) current.statutory += 1;
      counts.set(entry.flowCode, current);
    }
    return [...counts.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [entries]);

  const connectionColumns: ReadonlyArray<Column<ConnectionRow>> = [
    {
      key: "name",
      header: "Connection",
      width: "w-56",
      render: (row) => (
        <div>
          <strong className="text-[var(--text-primary)]">{row.name}</strong>
          <div className="font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">
            {row.connector} · {row.environment}
          </div>
        </div>
      ),
    },
    {
      key: "mode",
      header: "What it is",
      width: "w-44",
      render: (row) => {
        const claim = interoperabilityClaim(row.adapterMode);
        return (
          <div>
            <StatusBadge tone={row.adapterMode === "fake" ? "draft" : "progress"} label={claim.label} />
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
              {row.endpointUrl ? row.endpointUrl : "No endpoint recorded"}
            </div>
          </div>
        );
      },
    },
    {
      key: "health",
      header: "Health",
      width: "w-36",
      render: (row) => <StatusBadge status={row.healthStatus} />,
    },
    {
      key: "circuit",
      header: "Traffic",
      width: "w-44",
      render: (row) => (
        <div>
          <StatusBadge tone={circuitTone(row.circuitState)} label={circuitLabel(row.circuitState)} />
          <div className="mt-1 text-[11px] text-[var(--text-muted)]">
            {row.consecutiveFailures > 0
              ? `${row.consecutiveFailures} consecutive failure${row.consecutiveFailures === 1 ? "" : "s"}`
              : "No consecutive failures"}
          </div>
        </div>
      ),
    },
    {
      key: "credential",
      header: "Credential",
      width: "w-40",
      render: (row) =>
        row.credential ? (
          <span className="text-[var(--text-secondary)]">{row.credential}</span>
        ) : (
          <span className="text-[var(--text-muted)]">None configured</span>
        ),
    },
    {
      key: "bound",
      header: "Bound",
      render: (row) => {
        const bound = sourceSystemBound(row.connector, row.environment);
        return (
          <div className="space-y-1 text-[var(--text-secondary)]">
            {row.note ? <p>{row.note}</p> : null}
            {bound ? <p className="text-[var(--text-primary)]">{bound}</p> : null}
            {!row.note && !bound ? (
              <span className="text-[var(--text-muted)]">No bound recorded for this adapter</span>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Connector console"
        subtitle="Live connection health, circuit state, the recovery backlog with the server's own verdict on what may safely be sent again, and an end-to-end trace for any correlation id."
        meta={[
          { label: "Connections", value: String(connectionRows.length) },
          { label: "Blocked", value: down.length > 0 ? String(down.length) : "None" },
          { label: "In recovery", value: dlq.data ? num(dlq.data.total) : "—" },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Connections blocked"
          value={String(down.length)}
          hint="Circuit open — the breaker is refusing calls rather than spending thirty seconds per document rediscovering the same outage."
        />
        <Stat
          label="Showing failures"
          value={String(degraded.length)}
          hint="Trialling or carrying consecutive failures. Not yet blocked, and the window in which somebody can still act quietly."
        />
        <Stat
          label="Flows paused"
          value={String(pausedFlows.length)}
          hint="Paused deliberately, each with a recorded reason. A paused flow with no reason is one nobody dares restart."
        />
        <Stat
          label="In the recovery queue"
          value={dlq.data ? num(dlq.data.total) : "—"}
          hint={
            dlq.data
              ? `${dlq.data.needsHumanFirst} need a person before anything is sent again; ${dlq.data.replayableNow} may be replayed now.`
              : "Needs integration.message.read."
          }
        />
      </div>

      <Bound>
        <p>
          <strong>
            This API does not record a per-connection “last successful sync” time, so none is
            shown.
          </strong>{" "}
          A connection row carries health, circuit state, adapter mode and a consecutive
          failure count — not a timestamp. Inventing one from the page-load time would give an
          operations person a freshness figure they would act on, and it would be wrong in the
          reassuring direction. Real timestamps live on messages: trace a correlation id below
          and every attempt is dated.
        </p>
      </Bound>

      <Panel
        title="Connections"
        lede="Every configured instance, its health, whether traffic is flowing, and what may honestly be said about it."
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={connections.loading}
            onClick={connections.reload}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${connections.loading ? "animate-spin" : ""}`}
              aria-hidden
            />
            Re-read
          </button>
        }
      >
        <DataTable
          rows={connectionRows}
          columns={connectionColumns}
          loading={connections.loading}
          error={connections.error}
          onReload={connections.reload}
          rowKey={(row) => row.name}
          caption="Configured connections with health, circuit state and adapter bounds"
          empty={
            <Empty
              title="No connection is configured"
              body="Connections are created as part of integration setup. Until one exists there is nothing to operate, and no claim can be made about exchanging records with any external system."
            />
          }
        />
        <Recorded source="read from /integration/connections (integration.connector.read). The circuit breaker lives on the connection row, not in a process — two API processes discovering the same outage separately would double the traffic the far side is being protected from." />
      </Panel>

      {can("integration.flow.read") ? (
        <Panel
          title="Flows"
          lede="What each connection is carrying, whether it is running, and the declared time budget."
        >
          <div className="overflow-x-auto">
            <table className="x-data-table min-w-[44rem]">
              <caption className="sr-only">
                Integration flows with status, statutory marking and declared SLA
              </caption>
              <thead>
                <tr>
                  <th scope="col">Flow</th>
                  <th scope="col">Carries</th>
                  <th scope="col">Status</th>
                  <th scope="col">Time budget</th>
                  <th scope="col">Mappings</th>
                </tr>
              </thead>
              <tbody>
                {flowRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-[var(--text-secondary)]">
                      {flows.loading ? "Reading the flows…" : "No flow is configured."}
                    </td>
                  </tr>
                ) : (
                  flowRows.map((flow) => (
                    <tr key={flow.code}>
                      <td>
                        <strong>{flow.name}</strong>
                        <div className="font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">
                          {flow.code}
                        </div>
                      </td>
                      <td>
                        {humanise(flow.canonicalEntity)}
                        {flow.isStatutory ? (
                          <StatusBadge className="ml-1.5" tone="overdue" label="Statutory" />
                        ) : null}
                      </td>
                      <td>
                        <StatusBadge status={flow.status} />
                        {flow.pauseReason ? (
                          <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                            {flow.pauseReason}
                          </div>
                        ) : null}
                      </td>
                      <td>{durationLabel(flow.slaMs)}</td>
                      <td className="tabular-nums">{flow.mappingCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Bound>
            <p>
              <strong>A declared time budget is not a service level.</strong> The{" "}
              <code className="font-[var(--font-mono)]">slaMs</code> above is what the flow was
              configured to aim at. It commits nobody to being awake when it is missed, and it
              does not become a response commitment until named people with named hours are
              behind it — see the support record.
            </p>
          </Bound>
          <Recorded source="read from /integration/flows (integration.flow.read)" />
        </Panel>
      ) : null}

      {can("integration.message.read") ? (
        <>
          <Panel
            title="Recovery backlog"
            lede={dlq.data?.headline ?? "The dead-letter queue, grouped by the flow that produced it."}
            actions={
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={dlq.loading}
                onClick={dlq.reload}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${dlq.loading ? "animate-spin" : ""}`} aria-hidden />
                Re-read
              </button>
            }
          >
            {dlq.error ? (
              <ErrorState error={dlq.error} onRetry={dlq.reload} />
            ) : backlogByFlow.length === 0 ? (
              <p className="text-[13px] text-[var(--text-secondary)]">
                {dlq.loading
                  ? "Reading the recovery queue…"
                  : "Nothing is dead-lettered. Every message that has been sent either arrived or is still within its retry schedule."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="x-data-table min-w-[36rem]">
                  <caption className="sr-only">Pending recovery records grouped by flow</caption>
                  <thead>
                    <tr>
                      <th scope="col">Flow</th>
                      <th scope="col">Pending records</th>
                      <th scope="col">Need a person first</th>
                      <th scope="col">Statutory</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backlogByFlow.map(([flowCode, counts]) => (
                      <tr key={flowCode}>
                        <td className="font-[var(--font-mono)]">{flowCode}</td>
                        <td className="tabular-nums">{num(counts.total)}</td>
                        <td className="tabular-nums">
                          {counts.needsHuman > 0 ? (
                            <strong className="text-[var(--status-rejected-text)]">
                              {num(counts.needsHuman)}
                            </strong>
                          ) : (
                            "0"
                          )}
                        </td>
                        <td className="tabular-nums">{num(counts.statutory)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Recorded source="read from /integration/dlq (integration.message.read). Nothing is dropped — a message that exhausts its retries lands here, because a message nobody knows vanished is the only outcome worse than a failed one." />
          </Panel>

          <RecoveryQueue entries={entries} onChanged={dlq.reload} loading={dlq.loading} />
          <TracePanel />
        </>
      ) : (
        <Panel title="Recovery backlog" lede="The dead-letter queue and the replay controls.">
          <p className="text-[13px] text-[var(--text-secondary)]">
            This section needs <code className="font-[var(--font-mono)]">integration.message.read</code>.
            Without it the backlog cannot be seen, which means the failure count quoted in any
            service review would have to come from somebody's recollection.
          </p>
        </Panel>
      )}

      <Can permission="integration.webhook.manage">
        <WebhookPanel />
      </Can>

      <NeverClaim
        claim="the connectors are monitored"
        because="This console shows the state of every connection and the full recovery backlog whenever somebody opens it. It does not page anybody, it does not run overnight, and it does not staff a rota. Monitoring is a person watching or an alert reaching someone who is on duty — the software records what happened and who may fix it, and it cannot supply the person."
      />
    </div>
  );
}

/* ========================================================================== */
/* The recovery queue, with the server's replay verdict shown as the guard.     */
/* ========================================================================== */

function RecoveryQueue({
  entries,
  onChanged,
  loading,
}: {
  entries: readonly DlqEntryRow[];
  onChanged: () => void;
  loading: boolean;
}): React.JSX.Element {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState<string>("");
  const [done, setDone] = useState<string>("");

  async function act(entry: DlqEntryRow, action: "replay" | "resolve"): Promise<void> {
    setBusyId(entry.id);
    setError("");
    setDone("");
    try {
      if (action === "replay") {
        await api.post(deliveryApi.dlqReplayPath(entry.id), {
          // The confirmation flag is passed only when the SERVER said it is required, so a
          // statutory replay is still a deliberate act rather than a default the UI supplies.
          confirmStatutory: entry.replayRequiresConfirmation,
        });
        setDone(`${entry.correlationId} has been queued to send again.`);
      } else {
        await api.post(deliveryApi.dlqResolvePath(entry.id), {
          note: `Closed from the delivery console without resending. Category ${entry.category}; the recorded triage was: ${entry.suggestedAction}`,
        });
        setDone(`${entry.correlationId} is closed. Nothing was sent.`);
      }
      onChanged();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The request could not be completed. The entry is unchanged.",
      );
    } finally {
      setBusyId("");
    }
  }

  const columns: ReadonlyArray<Column<DlqEntryRow>> = [
    {
      key: "correlation",
      header: "Record",
      width: "w-56",
      render: (entry) => (
        <div>
          <span className="font-[var(--font-mono)] text-[12px] font-semibold">
            {entry.correlationId}
          </span>
          <div className="text-[11px] text-[var(--text-muted)]">{entry.flowCode}</div>
        </div>
      ),
    },
    {
      key: "failure",
      header: "Why it stopped",
      width: "w-48",
      render: (entry) => (
        <div>
          <StatusBadge tone={severityTone(entry.severity)} label={humanise(entry.category)} />
          {entry.isStatutory ? (
            <StatusBadge className="ml-1.5" tone="overdue" label="Statutory" />
          ) : null}
          {entry.sideEffectPossible ? (
            <div className="mt-1 text-[11px] text-[var(--status-rejected-text)]">
              The far side may already have acted on this
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "owner",
      header: "Who can fix it",
      width: "w-56",
      render: (entry) => {
        const desk = recoveryDesk(entry.category);
        return (
          <div>
            <strong className="text-[var(--text-primary)]">{desk.desk}</strong>
            <div className="mt-1 text-[11px] leading-[1.6] text-[var(--text-muted)]">{desk.why}</div>
          </div>
        );
      },
    },
    {
      key: "verdict",
      header: "What the server allows",
      render: (entry) => (
        <div className="space-y-1">
          <p className="text-[var(--text-secondary)]">{entry.replayVerdict}</p>
          <p className="text-[11px] text-[var(--text-muted)]">{entry.suggestedAction}</p>
        </div>
      ),
    },
    {
      key: "act",
      header: "Action",
      width: "w-44",
      render: (entry) => (
        <Can
          permission="integration.dlq.replay"
          fallback={
            <span className="text-[11px] text-[var(--text-muted)]">
              Needs integration.dlq.replay
            </span>
          }
        >
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!entry.replayAllowed || busyId === entry.id || loading}
              onClick={() => void act(entry, "replay")}
              title={entry.replayVerdict}
            >
              <Send className="h-3.5 w-3.5" aria-hidden />
              {entry.replayRequiresConfirmation ? "Confirm & send again" : "Send again"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busyId === entry.id || loading}
              onClick={() => void act(entry, "resolve")}
            >
              Close without sending
            </button>
          </div>
        </Can>
      ),
    },
  ];

  return (
    <Panel
      title="Records waiting for recovery"
      lede="Each with the deterministic verdict on whether it may be sent again — computed by the triage table, not by a model."
    >
      {error ? <FieldError message={error} /> : null}
      {done ? (
        <p className="text-[12px] text-[var(--text-secondary)]" role="status">
          {done}
        </p>
      ) : null}

      <DataTable
        rows={entries}
        columns={columns}
        loading={loading}
        rowKey={(entry) => entry.id}
        caption="Dead-lettered records with recovery desk and replay verdict"
        empty={
          <Empty
            title="Nothing is waiting for recovery"
            body="Every message either arrived or is still inside its retry schedule. This is the state the console exists to confirm, not just the state it reports when something is wrong."
          />
        }
      />

      <Disclosure title="Why a replay can be refused, and why that refusal is not overridable here">
        <p>
          A dead-letter queue that replays anything on one click is a way to submit the same
          invoice to a tax portal four times. Unlike most mistakes in an ERP, that one is
          visible to a regulator and cannot be quietly undone, so the rule is enforced on the
          server and this screen shows it rather than working around it.
        </p>
        <p className="mt-2">
          Three refusals in particular: a message that failed to TRANSFORM never reached the
          wire, and replaying it runs the same broken mapping. A TIMEOUT against a system that
          may already have processed it is refused outright — the document's current state has
          to be read first. A STATUTORY document is allowed but demands an explicit
          confirmation, which is why that button reads differently.
        </p>
        <p className="mt-2">
          Closing without sending writes a note against the entry. The note is required by the
          server, because without one the same failure is diagnosed from scratch three months
          later by somebody who was not here.
        </p>
      </Disclosure>

      <NotStored
        what="The assignment of a named recovery owner"
        where="whatever rota or ticket system the engagement actually runs on"
      >
        <p>
          A dead letter carries an owner only once it has been resolved. The desk shown above
          is derived from the failure category — which genuinely determines who CAN fix it —
          and is labelled as derived. A name invented against an open entry is worse than no
          name, because somebody stops looking for the real one.
        </p>
      </NotStored>

      <Recorded source="entries and verdicts read from /integration/dlq; actions post to /integration/dlq/:id/replay and /resolve (integration.dlq.replay). Every replay is written to the audit trail with the category and whether it was confirmed." />
    </Panel>
  );
}

/* ========================================================================== */
/* The trace panel — the only place on this screen with real timestamps.        */
/* ========================================================================== */

function TracePanel(): React.JSX.Element {
  const [input, setInput] = useState("");
  const [correlationId, setCorrelationId] = useState("");
  const trace = useQuery<MessageTrace>(
    correlationId ? deliveryApi.tracePath(correlationId) : null,
  );

  const first = trace.data?.messages[0];

  return (
    <Panel
      title="Trace one record end to end"
      lede="The only dated evidence on this screen. Every attempt, its outcome and the response the far side gave."
    >
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setCorrelationId(input.trim());
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[12px] text-[var(--text-secondary)]">
          Correlation id
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden
            />
            <input
              type="search"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="cor-…"
              aria-label="Correlation id to trace"
              className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 font-[var(--font-mono)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>
        </label>
        <button type="submit" className="btn btn-secondary btn-sm" disabled={!input.trim()}>
          Trace
        </button>
      </form>

      {!correlationId ? (
        <p className="text-[13px] text-[var(--text-secondary)]">
          Take a correlation id from the recovery queue above, or from a document somebody is
          asking about. The trace answers the question a connector console otherwise cannot:
          when did this actually move, and what did the far side say.
        </p>
      ) : trace.error ? (
        <ErrorState error={trace.error} onRetry={trace.reload} />
      ) : !trace.data ? (
        <p className="text-[13px] text-[var(--text-secondary)]" role="status">
          Reading the trace for {correlationId}…
        </p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Last movement">
              {first ? `${dateTime(first.ts)} · ${ageLabel(first.ts)}` : "No message recorded"}
            </Fact>
            <Fact label="Flow">{first ? first.flowCode : "—"}</Fact>
            <Fact label="Status">{first ? <StatusBadge status={first.status} /> : "—"}</Fact>
            <Fact label="Attempts">{trace.data.attempts.length}</Fact>
          </dl>

          <div className="overflow-x-auto">
            <table className="x-data-table min-w-[36rem]">
              <caption className="sr-only">Delivery attempts for this correlation id</caption>
              <thead>
                <tr>
                  <th scope="col">Attempt</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Response</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {trace.data.attempts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-[var(--text-secondary)]">
                      No delivery attempt is recorded against this correlation id.
                    </td>
                  </tr>
                ) : (
                  trace.data.attempts.map((attempt) => (
                    <tr key={attempt.attemptNo}>
                      <td className="tabular-nums">{attempt.attemptNo}</td>
                      <td>
                        <StatusBadge status={attempt.outcome} />
                      </td>
                      <td className="tabular-nums">{attempt.responseCode ?? "—"}</td>
                      <td>
                        {attempt.detail ?? (
                          <span className="text-[var(--text-muted)]">Nothing recorded</span>
                        )}
                        {attempt.category ? (
                          <div className="text-[11px] text-[var(--text-muted)]">
                            {humanise(attempt.category)}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {trace.data.messages.length > 0 ? (
            <div>
              <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">
                Messages
              </h3>
              <ul className="space-y-1.5 text-[12px] leading-[1.6] text-[var(--text-secondary)]">
                {trace.data.messages.map((message, index) => (
                  <li key={`${message.ts}-${index}`}>
                    <span className="font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">
                      {dateTime(message.ts)}
                    </span>{" "}
                    {humanise(message.direction)} · {message.flowCode} ·{" "}
                    <StatusBadge status={message.status} />
                    {message.entityRef ? (
                      <span className="ml-1 text-[var(--text-muted)]">{message.entityRef}</span>
                    ) : null}
                    {message.errorMessage ? (
                      <div className="text-[var(--status-rejected-text)]">
                        {message.errorMessage}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Recorded
            source={`read from /integration/messages/trace/${correlationId} (integration.message.read)`}
          />
        </>
      )}
    </Panel>
  );
}

/* ========================================================================== */

function WebhookPanel(): React.JSX.Element {
  const webhooks = useQuery<DataEnvelope<WebhookRow>>(deliveryApi.webhooksPath);
  const rows = webhooks.data?.data ?? [];
  const failing = rows.filter((row) => row.status !== "active" || row.consecutiveFailures > 0);

  return (
    <Panel
      title="Outbound subscribers"
      lede="Where this platform pushes events, and which of those destinations are refusing them."
    >
      {rows.length === 0 ? (
        <p className="text-[13px] text-[var(--text-secondary)]">
          {webhooks.loading
            ? "Reading the subscribers…"
            : "No webhook subscriber is configured. Nothing is being pushed out of this tenant."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="x-data-table min-w-[40rem]">
            <caption className="sr-only">Webhook subscribers with status and failure counts</caption>
            <thead>
              <tr>
                <th scope="col">Subscriber</th>
                <th scope="col">Events</th>
                <th scope="col">Status</th>
                <th scope="col">Deliveries</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.subscriberName}>
                  <td>
                    <strong>{row.subscriberName}</strong>
                    <div className="text-[11px] text-[var(--text-muted)]">{row.targetUrl}</div>
                  </td>
                  <td>{row.eventNames.join(", ")}</td>
                  <td>
                    <StatusBadge status={row.status} />
                    {row.consecutiveFailures > 0 ? (
                      <div className="mt-1 text-[11px] text-[var(--status-rejected-text)]">
                        {row.consecutiveFailures} consecutive failure
                        {row.consecutiveFailures === 1 ? "" : "s"}
                      </div>
                    ) : null}
                  </td>
                  <td className="tabular-nums">{num(row.deliveries)}</td>
                  <td>
                    {row.note ?? <span className="text-[var(--text-muted)]">—</span>}
                    {row.rotationGraceUntil ? (
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Secret rotation grace until {dateTime(row.rotationGraceUntil)}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {failing.length > 0 ? (
        <Bound>
          <p>
            <strong>
              {failing.length} subscriber{failing.length === 1 ? " is" : "s are"} not
              accepting deliveries.
            </strong>{" "}
            A subscriber that auto-paused stopped because the destination kept refusing, which
            is usually a change at the customer's end rather than a fault here. It needs
            somebody at the receiving organisation, and that person is not on this side of the
            contract.
          </p>
        </Bound>
      ) : null}
      <Recorded source="read from /integration/webhooks (integration.webhook.manage)" />
    </Panel>
  );
}
