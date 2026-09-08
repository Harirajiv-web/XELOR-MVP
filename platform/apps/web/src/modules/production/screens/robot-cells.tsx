"use client";

import Link from "next/link";
import type { FactoryAssetView, FactoryOverview } from "@ind-core/platform/factory-connect/contracts";
import { useAccess } from "@spine/access/permissions";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import { dateTime, humanise } from "@spine/format";

const OVERVIEW_PATH = "/integration/factory/views/production";
type FactoryProductionView = Pick<
  FactoryOverview,
  "generatedAt" | "boundary" | "gateways" | "assets" | "summary" | "mission"
>;

function stateTone(state: string): "approved" | "progress" | "pending" | "rejected" | "unknown" {
  if (state === "running") return "progress";
  if (state === "idle") return "approved";
  if (["blocked", "protective_stop"].includes(state)) return "pending";
  if (["faulted", "offline"].includes(state)) return "rejected";
  return "unknown";
}

function mapNumber(attributes: Record<string, unknown>, key: string, fallback: number): number {
  const value = attributes[key];
  const coordinate = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(92, Math.max(8, coordinate));
}

function fallbackPosition(index: number): { left: number; top: number } {
  return {
    left: 18 + (index % 4) * 21,
    top: 27 + (Math.floor(index / 4) % 3) * 25,
  };
}

const assetColumns: ReadonlyArray<Column<FactoryAssetView>> = [
  {
    key: "asset",
    header: "Robot or mobile asset",
    render: (asset) => (
      <div>
        <div className="font-semibold text-[var(--text-primary)]">{asset.name}</div>
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]">{asset.assetCode} · {humanise(asset.assetKind)}</div>
      </div>
    ),
  },
  {
    key: "state",
    header: "Last reported state",
    render: (asset) => (
      <div>
        <StatusBadge tone={stateTone(asset.state)} label={humanise(asset.state)} />
        <div className="mt-1 text-[10px] text-[var(--text-secondary)]">
          {asset.observedAt ? `Observed ${dateTime(asset.observedAt)}` : "Observation time unavailable"}
        </div>
      </div>
    ),
  },
  {
    key: "work",
    header: "Latest reported work",
    render: (asset) => (
      <div className="text-[12px]">
        <div>{asset.productionOrderRef ?? "No production order"}</div>
        <div className="text-[var(--text-secondary)]">{asset.activeProgram ?? "No active program"}</div>
      </div>
    ),
  },
  {
    key: "evidence",
    header: "Operational evidence",
    render: (asset) => (
      <div className="text-[12px]">
        <div>{asset.goodCount ?? 0} good · {asset.rejectCount ?? 0} rejected</div>
        <div className="text-[var(--text-secondary)]">{asset.energyKwh ?? "—"} kWh · safety {humanise(asset.safetyState)}</div>
      </div>
    ),
  },
  {
    key: "connection",
    header: "Controller boundary",
    render: (asset) => (
      <div className="text-[12px]">
        <div>{asset.connectorCode}</div>
        <div className="text-[var(--text-secondary)]">{humanise(asset.adapterMode)} · {humanise(asset.commandMode)} · {asset.gatewayCode ?? "gateway unreported"}</div>
      </div>
    ),
  },
];

export default function RobotCellsScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const query = useQuery<FactoryProductionView>(OVERVIEW_PATH);
  if (query.loading && !query.data) return <Loading label="Reading robot cells…" />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />;
  const data = query.data;
  if (!data) return <Empty title="No robot-cell evidence" body="Configure one read-only factory gateway binding before adding controlled actions." />;

  const siteCodes = [...new Set([...data.gateways.map((gateway) => gateway.siteCode), ...data.assets.map((asset) => asset.siteCode)].filter(Boolean))];
  const siteLabel = siteCodes.length === 0 ? "Factory site not reported" : siteCodes.join(" · ");
  const deploymentModes = [...new Set(data.gateways.map((gateway) => gateway.deploymentMode).filter(Boolean))];
  const canReviewMission = can("agentos.run.read");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Machines & robot cells"
        subtitle="Latest reported operational evidence linked to production work. Each row is a configured simulator or edge binding, not proof of a live physical connection or execution; the robot controller and safety PLC remain the final authority."
        meta={[
          { label: "Bound assets", value: String(data.summary.assets) },
          { label: "Constrained", value: String(data.summary.constrained) },
          { label: "Dwell breaches", value: String(data.summary.exceededDwell) },
          { label: "Evidence as of", value: dateTime(data.generatedAt) },
        ]}
      />

      <section className="overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-sunken)]" aria-labelledby="factory-map-title">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3">
          <div>
            <h2 id="factory-map-title" className="text-[14px] font-semibold text-[var(--text-primary)]">{siteLabel} · operational floor</h2>
            <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">Operational map, not a safety-presence system</p>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {deploymentModes.length > 0 ? deploymentModes.map((mode) => (
              <StatusBadge key={mode} tone={mode === "simulator" ? "draft" : "progress"} label={humanise(mode)} />
            )) : <StatusBadge tone="unknown" label="Mode unreported" />}
          </div>
        </div>
        <div className="relative min-h-[300px] bg-[linear-gradient(var(--border-subtle)_1px,transparent_1px),linear-gradient(90deg,var(--border-subtle)_1px,transparent_1px)] bg-[size:32px_32px]">
          <div className="absolute inset-x-[8%] top-[14%] h-[31%] rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface-raised)]/80 p-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Machine shop</div>
          <div className="absolute inset-x-[8%] bottom-[10%] h-[25%] rounded-[12px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-raised)]/70 p-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Stores → staging → line</div>
          {data.assets.map((asset, index) => {
            const fallback = fallbackPosition(index);
            const left = mapNumber(asset.attributes, "mapX", fallback.left);
            const top = mapNumber(asset.attributes, "mapY", fallback.top);
            return (
              <div key={asset.assetCode} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%`, top: `${top}%` }}>
                <div className="rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface-overlay)] px-3 py-2 shadow-[var(--shadow-card)]">
                  <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden /><strong className="text-[11px]">{asset.assetCode}</strong></div>
                  <div className="mt-1"><StatusBadge tone={stateTone(asset.state)} label={humanise(asset.state)} /></div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <DataTable rows={data.assets} columns={assetColumns} loading={query.loading} error={query.error} onReload={query.reload} rowKey={(asset) => asset.assetCode} caption="Configured machine, robot-cell and mobile-asset bindings" empty={<Empty title="No assets bound" body="Bind a controller identity through Factory Connect before it can appear here." />} />

      <section className="rounded-[12px] border border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">{data.mission.triggerReady ? "Factory-flow recovery is ready for review" : "Factory-flow recovery graph"}</h2>
            <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">{data.mission.goal}</p>
            <p className="mt-2 text-[11px] leading-4 text-[var(--text-muted)]">{data.mission.approvalBoundary}</p>
          </div>
          {canReviewMission ? (
            <Link href="/agentos/command/factory.flow-recovery" className="btn btn-primary btn-sm">{data.mission.triggerReady ? "Review recovery mission" : "Inspect recovery graph"}</Link>
          ) : (
            <p className="max-w-xs text-[11px] leading-4 text-[var(--text-muted)]">Mission Control requires Agent OS access. This factory evidence remains available as a read-only operating view.</p>
          )}
        </div>
      </section>
    </div>
  );
}
