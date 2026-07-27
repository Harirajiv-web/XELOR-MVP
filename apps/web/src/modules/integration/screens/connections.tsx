"use client";

import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { humanise, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { ConnectionRow, ConnectorRow, DataEnvelope } from "../api";
import { circuitLabel, circuitTone, integrationApi } from "../api";

/**
 * CONNECTIONS — what this system is wired to, and whether the wire is carrying anything.
 *
 * The circuit breaker is the column that matters and it is deliberately verbose. "Open"
 * reads backwards to anybody who has not wired a house — an open circuit is one where
 * NOTHING flows — so the badge says what it means rather than what it is called, and the
 * consecutive-failure count sits beside it because that is the number that moved it.
 *
 * The breaker lives on the connection row, not in a process. An in-memory breaker stops
 * being a breaker the moment there are two processes: each discovers the same outage
 * separately, and the far side gets double the traffic it was being protected from.
 *
 * Below, the connectors this build ships that nobody has configured yet — the answer to
 * "can it talk to Tally?" without anybody having to ask an engineer.
 */
export default function ConnectionsScreen(_props: ScreenProps): React.JSX.Element {
  const connections = useQuery<DataEnvelope<ConnectionRow>>(integrationApi.connectionsPath);
  const connectors = useQuery<DataEnvelope<ConnectorRow>>(integrationApi.connectorsPath);

  const connectionRows = connections.data?.data ?? [];
  const configured = new Set(connectionRows.map((c) => c.connector));
  const unconfigured = (connectors.data?.data ?? []).filter((c) => !configured.has(c.code));
  const broken = connectionRows.filter((c) => c.circuitState === "open").length;

  const connectionColumns: ReadonlyArray<Column<ConnectionRow>> = [
    {
      key: "name",
      header: "Connection",
      render: (c) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{c.name}</div>
          <div className="truncate font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]">
            {c.connector} · {c.environment}
          </div>
        </div>
      ),
    },
    {
      key: "circuit",
      header: "Circuit breaker",
      width: "w-60",
      // Badge + count + a plain sentence. Three carriers for one fact, because this is the
      // cell somebody reads sideways at 7 a.m. and colour alone would not survive that.
      render: (c) => (
        <div className="min-w-0">
          <StatusBadge tone={circuitTone(c.circuitState)} label={circuitLabel(c.circuitState)} />
          {c.consecutiveFailures > 0 ? (
            <div className="mt-1 text-[12px] font-semibold text-[var(--status-overdue-text)]">
              {num(c.consecutiveFailures)} failure
              {c.consecutiveFailures === 1 ? "" : "s"} in a row
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "health",
      header: "Health",
      width: "w-36",
      render: (c) => (
        <StatusBadge
          tone={
            c.healthStatus === "down"
              ? "rejected"
              : c.healthStatus === "degraded"
                ? "pending"
                : "approved"
          }
          label={humanise(c.healthStatus)}
        />
      ),
    },
    {
      key: "adapterMode",
      header: "Mode",
      width: "w-44",
      // `fake` is stated loudly. A connection that looks configured and quietly sends
      // nothing is the single most expensive misunderstanding available on this screen.
      render: (c) =>
        c.adapterMode === "fake" ? (
          <StatusBadge tone="draft" label="Fake — nothing sent" />
        ) : (
          <StatusBadge tone="progress" label={humanise(c.adapterMode)} />
        ),
    },
    {
      key: "endpoint",
      header: "Endpoint",
      render: (c) => (
        <div className="min-w-0">
          <div className="truncate font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]">
            {c.endpointUrl ?? "—"}
          </div>
          {c.secondaryEndpointUrl ? (
            <div className="truncate font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">
              fallback: {c.secondaryEndpointUrl}
            </div>
          ) : null}
          <div className="text-[12px] text-[var(--text-muted)]">
            {c.credential ? `Credential: ${c.credential}` : "No credential attached"}
          </div>
        </div>
      ),
    },
  ];

  const connectorColumns: ReadonlyArray<Column<ConnectorRow>> = [
    {
      key: "name",
      header: "Connector",
      render: (c) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{c.name}</div>
          <div className="truncate font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]">
            {c.code}
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      width: "w-36",
      render: (c) => <StatusBadge tone="unknown" label={humanise(c.category)} />,
    },
    {
      key: "protocol",
      header: "How it talks",
      width: "w-44",
      render: (c) => (
        <span className="font-[var(--font-mono)] text-[12px]">
          {c.protocol} · {c.direction}
        </span>
      ),
    },
    {
      key: "capabilities",
      header: "What it can do",
      render: (c) => (
        <div className="flex flex-wrap gap-1">
          {(c.capabilities ?? []).map((cap) => (
            <code
              key={cap}
              className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11px] text-[var(--text-primary)]"
            >
              {cap}
            </code>
          ))}
          {(c.capabilities ?? []).length === 0 ? (
            <span className="text-[var(--text-secondary)]">—</span>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Connections"
        subtitle="Every outside system this plant is wired to, and whether calls are currently going out. A connection whose circuit is open is not sending anything — the breaker tripped so that a failing portal stops costing thirty seconds a document."
        meta={
          connectionRows.length > 0
            ? [
                { label: "Connections", value: String(connectionRows.length) },
                { label: "Circuit open", value: String(broken) },
              ]
            : []
        }
      />

      <DataTable
        rows={connectionRows}
        columns={connectionColumns}
        loading={connections.loading}
        error={connections.error}
        onReload={connections.reload}
        rowKey={(c) => c.name}
        caption="Configured connections and their circuit-breaker state"
        empty={
          <Empty
            title="Nothing is wired up"
            body="A connection appears here once a connector is configured with an endpoint and a credential. With none, this system talks to nothing outside itself."
          />
        }
      />

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Available, not yet configured
          </h2>
          <p className="mt-0.5 max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">
            Connectors this build ships that nobody has set up. They are what the system
            <em> could</em> talk to — the answer to &ldquo;can it send to the bank?&rdquo;
            without asking an engineer.
          </p>
        </div>

        <DataTable
          rows={unconfigured}
          columns={connectorColumns}
          loading={connectors.loading}
          error={connectors.error}
          onReload={connectors.reload}
          rowKey={(c) => c.code}
          density="compact"
          caption="Connectors available but not configured"
          empty={
            <Empty
              title="Everything available is already configured"
              body="Every connector this build ships has a connection against it. New ones appear here when the platform adds them."
            />
          }
        />
      </div>
    </div>
  );
}
