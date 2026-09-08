"use client";

import type { FactoryOverview } from "@ind-core/platform/factory-connect/contracts";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import { dateTime, humanise } from "@spine/format";
import { integrationApi } from "../api";

type Gateway = FactoryOverview["gateways"][number];
type CommandRecord = FactoryOverview["commands"][number];
type FactoryIntegrationView = Pick<
  FactoryOverview,
  "generatedAt" | "boundary" | "gateways" | "commands" | "summary"
>;

function healthTone(status: string): "approved" | "pending" | "rejected" | "unknown" {
  if (status === "healthy") return "approved";
  if (status === "degraded") return "pending";
  if (status === "down") return "rejected";
  return "unknown";
}

function commandTone(status: string): "approved" | "progress" | "pending" | "rejected" | "unknown" {
  if (["acknowledged", "completed", "succeeded"].includes(status)) return "approved";
  if (["accepted", "dispatched", "running"].includes(status)) return "progress";
  if (["pending", "queued"].includes(status)) return "pending";
  if (["failed", "rejected", "expired"].includes(status)) return "rejected";
  return "unknown";
}

const gatewayColumns: ReadonlyArray<Column<Gateway>> = [
  {
    key: "gateway",
    header: "Configured gateway",
    render: (gateway) => (
      <div>
        <div className="font-semibold text-[var(--text-primary)]">{gateway.name}</div>
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]">{gateway.code}</div>
      </div>
    ),
  },
  {
    key: "location",
    header: "Factory boundary",
    render: (gateway) => <span>{gateway.siteCode} · {gateway.zoneCode ?? "All zones"}</span>,
  },
  {
    key: "mode",
    header: "Connection mode",
    render: (gateway) => (
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge tone={gateway.deploymentMode === "simulator" ? "draft" : "progress"} label={humanise(gateway.deploymentMode)} />
        <StatusBadge tone={gateway.commandMode === "governed" ? "approved" : "unknown"} label={humanise(gateway.commandMode)} />
      </div>
    ),
  },
  {
    key: "health",
    header: "Reported health",
    render: (gateway) => <StatusBadge tone={healthTone(gateway.healthStatus)} label={humanise(gateway.healthStatus)} />,
  },
  {
    key: "heartbeat",
    header: "Evidence freshness",
    render: (gateway) => (
      <div className="text-[12px]">
        <div>{gateway.lastHeartbeatAt ? dateTime(gateway.lastHeartbeatAt) : "No heartbeat reported"}</div>
        <div className="text-[var(--text-secondary)]">
          {humanise(gateway.heartbeatSource)} · gateway {gateway.softwareVersion || "version unknown"}
        </div>
      </div>
    ),
  },
  {
    key: "capabilities",
    header: "Declared capabilities",
    render: (gateway) => (
      <div className="flex max-w-xl flex-wrap gap-1">
        {gateway.capabilities.map((capability) => (
          <code key={capability} className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-[var(--font-mono)] text-[10px] text-[var(--text-secondary)]">
            {capability}
          </code>
        ))}
      </div>
    ),
  },
];

const commandColumns: ReadonlyArray<Column<CommandRecord>> = [
  {
    key: "command",
    header: "Governed command",
    render: (command) => (
      <div>
        <div className="font-[var(--font-mono)] text-[11px] font-semibold text-[var(--text-primary)]">{command.commandKey}</div>
        <code className="text-[10px] text-[var(--text-secondary)]">{command.capability}</code>
      </div>
    ),
  },
  {
    key: "status",
    header: "Recorded outcome",
    render: (command) => <StatusBadge tone={commandTone(command.status)} label={humanise(command.status)} />,
  },
  {
    key: "mode",
    header: "Evaluation boundary",
    render: (command) => (
      <StatusBadge
        tone={command.simulated ? "draft" : "progress"}
        label={command.simulated ? "Simulator policy" : "Edge record"}
      />
    ),
  },
  {
    key: "approval",
    header: "Approval reference",
    render: (command) => <code className="text-[10px] text-[var(--text-secondary)]">{command.approvalRef}</code>,
  },
  {
    key: "created",
    header: "Recorded at",
    render: (command) => <span className="text-[12px] text-[var(--text-secondary)]">{dateTime(command.createdAt)}</span>,
  },
];

export default function FactoryConnectScreen(_props: ScreenProps): React.JSX.Element {
  const query = useQuery<FactoryIntegrationView>(integrationApi.factoryOverviewPath);
  if (query.loading && !query.data) return <Loading label="Reading factory gateways…" />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />;
  const data = query.data;
  if (!data) return <Empty title="No factory evidence returned" body="Configure a factory gateway before expecting machine or material-flow evidence." />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Factory Connect"
        subtitle="Configured simulator and edge bindings with their latest reported evidence. The shipped simulator evaluates only named, approval-bound capabilities without contacting hardware; a future certified edge adapter would still leave safety authority with local controllers."
        meta={[
          { label: "Gateways", value: String(data.gateways.length) },
          { label: "Bound assets", value: String(data.summary.assets) },
          { label: "Need attention", value: String(data.summary.constrained) },
          { label: "Evidence as of", value: dateTime(data.generatedAt) },
        ]}
      />

      <div className="rounded-[12px] border border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] p-4 text-[12px] leading-5 text-[var(--text-primary)]">
        <strong>Execution boundary:</strong> {data.boundary}
      </div>

      <DataTable
        rows={data.gateways}
        columns={gatewayColumns}
        loading={query.loading}
        error={query.error}
        onReload={query.reload}
        rowKey={(gateway) => gateway.code}
        caption="Configured factory gateway bindings and their declared capability boundaries"
        empty={<Empty title="No gateway binding configured" body="Start with one read-only gateway binding for one robot cell; do not connect the cloud directly to a controller." />}
      />

      <section className="flex flex-col gap-3" aria-labelledby="factory-command-ledger">
        <div>
          <h2 id="factory-command-ledger" className="text-[14px] font-semibold text-[var(--text-primary)]">Governed command ledger</h2>
          <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">Read-only evidence recorded by ONYX's simulator policy evaluation. It does not represent an edge dispatch, controller acknowledgement or physical execution.</p>
        </div>
        <DataTable
          rows={data.commands}
          columns={commandColumns}
          loading={query.loading}
          error={query.error}
          onReload={query.reload}
          rowKey={(command) => command.commandKey}
          caption="Governed factory command-policy evidence"
          empty={<Empty title="No governed commands recorded" body="Read-only telemetry can operate without commands. A row appears only after a bounded command has been recorded." />}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-3" aria-labelledby="connector-boundaries">
        <h2 id="connector-boundaries" className="sr-only">Connector boundaries</h2>
        {[
          ["Read first", "OPC UA, MQTT, REST/webhooks and vendor adapters begin with state, alarm, cycle and location evidence."],
          ["Govern narrowly", "Command requests are named capabilities with approval, expected state, idempotency and expiry. The shipped path evaluates them in the simulator only."],
          ["Safety stays local", "Emergency stops, guards, raw motion, safety PLC changes and unverified program uploads are never ONYX capabilities."],
        ].map(([title, body]) => (
          <article key={title} className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</h3>
            <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">{body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
