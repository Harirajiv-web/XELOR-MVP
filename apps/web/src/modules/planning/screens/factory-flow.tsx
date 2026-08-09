"use client";

import Link from "next/link";
import type { FactoryDwellView, FactoryOverview } from "@ind-core/platform/factory-connect/contracts";
import { useAccess } from "@spine/access/permissions";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import { dateTime, humanise, num } from "@spine/format";

const OVERVIEW_PATH = "/integration/factory/views/planning";
type FactoryPlanningView = Pick<
  FactoryOverview,
  "generatedAt" | "boundary" | "dwell" | "summary" | "mission"
>;

const dwellColumns: ReadonlyArray<Column<FactoryDwellView>> = [
  {
    key: "tracked",
    header: "Tracked material",
    render: (row) => (
      <div>
        <div className="font-semibold text-[var(--text-primary)]">{row.trackedRef}</div>
        <div className="text-[11px] text-[var(--text-secondary)]">{row.materialRef ?? "Material unknown"} · {row.batchRef ?? "Batch unknown"}</div>
      </div>
    ),
  },
  { key: "zone", header: "Current zone", render: (row) => <span>{row.location?.zoneCode ?? row.zoneCode}</span> },
  {
    key: "dwell",
    header: "Dwell against target",
    render: (row) => (
      <div>
        <div className="font-semibold text-[var(--text-primary)]">{num(row.dwellMinutes)} min</div>
        <div className="text-[11px] text-[var(--text-secondary)]">target ≤ {num(row.expectedMaxMinutes)} min</div>
        <div className="text-[10px] text-[var(--text-muted)]">Entered {dateTime(row.enteredAt)}</div>
      </div>
    ),
  },
  { key: "status", header: "Flow state", render: (row) => <StatusBadge tone={row.status === "exceeded" ? "rejected" : row.status === "active" ? "progress" : "approved"} label={humanise(row.status)} /> },
  {
    key: "work",
    header: "Production consequence",
    render: (row) => (
      <div className="text-[12px]">
        <div>{row.productionOrderRef ?? "No linked production order"}</div>
        <div className="text-[var(--text-secondary)]">{row.exceededByMinutes > 0 ? `${num(row.exceededByMinutes)} min beyond target` : "Inside target"}</div>
      </div>
    ),
  },
  {
    key: "confidence",
    header: "Location evidence",
    render: (row) => (
      <div className="text-[12px]">
        <div>{humanise(row.location?.source ?? "not located")}</div>
        <div className="text-[var(--text-secondary)]">{row.location?.confidence ? `${Math.round(Number(row.location.confidence) * 100)}% confidence` : "No confidence supplied"}</div>
      </div>
    ),
  },
];

export default function FactoryFlowScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const query = useQuery<FactoryPlanningView>(OVERVIEW_PATH);
  if (query.loading && !query.data) return <Loading label="Calculating material dwell…" />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />;
  const data = query.data;
  if (!data) return <Empty title="No material-flow evidence" body="Location events become dwell intervals only after a tracked material enters a defined factory zone." />;

  const participants = new Set(data.mission.specialists);
  const parallelAssessments = ["KILN", "MICA", "SPAR", "AXLE", "RASP"].filter((agent) => participants.has(agent));
  const approvedBranches = ["KILN", "RELAY", "ACHILES"].filter((agent) => participants.has(agent));
  const canReviewMission = can("agentos.run.read");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Factory flow"
        subtitle="How long material, pallets and mobile assets wait between physical operations—and which production work is affected. Location confidence stays visible because a sensor estimate is not an exact fact."
        meta={[
          { label: "Tracked intervals", value: String(data.dwell.length) },
          { label: "Beyond target", value: String(data.summary.exceededDwell) },
          { label: "Constrained assets", value: String(data.summary.constrained) },
          { label: "Evidence as of", value: dateTime(data.generatedAt) },
        ]}
      />
      <div className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">What AXLE can conclude</h2>
        <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">{data.summary.headline} AXLE may assess schedule and alternate routing; it does not move material, release work or command a robot.</p>
      </div>
      <DataTable rows={data.dwell} columns={dwellColumns} loading={query.loading} error={query.error} onReload={query.reload} rowKey={(row) => row.id} caption="Material and mobile-asset dwell intervals" empty={<Empty title="Nothing is waiting beyond a defined zone target" body="This means no active dwell interval has been reported, not that every untracked material movement is on time." />} />
      <section className="rounded-[12px] border border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] p-4" aria-labelledby="factory-recovery-topology">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="factory-recovery-topology" className="text-[13px] font-semibold text-[var(--text-primary)]">Recovery graph: {data.mission.graphKey}</h2>
            <div className="mt-1 text-[11px] text-[var(--text-secondary)]">ONYX bounds the mission and publishes the final verified brief.</div>
          </div>
          {canReviewMission ? (
            <Link href="/agentos/command/factory.flow-recovery" className="btn btn-primary btn-sm">{data.mission.triggerReady ? "Review recovery mission" : "Inspect recovery graph"}</Link>
          ) : (
            <p className="max-w-xs text-[11px] leading-4 text-[var(--text-muted)]">Mission Control requires Agent OS access. This dwell evidence remains available as a read-only planning view.</p>
          )}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[9px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">Parallel evidence</div>
            <div className="mt-1 text-[11px] text-[var(--text-primary)]">{parallelAssessments.join(" · ") || "Registered factory specialists"}</div>
          </div>
          <div className="rounded-[9px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">Evidence join</div>
            <div className="mt-1 text-[11px] text-[var(--text-primary)]">HEXA verifies connector and command boundaries</div>
          </div>
          <div className="rounded-[9px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">Human gate</div>
            <div className="mt-1 text-[11px] text-[var(--text-primary)]">Production supervisor reviews the bounded recovery</div>
          </div>
          <div className="rounded-[9px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">After approval</div>
            <div className="mt-1 text-[11px] text-[var(--text-primary)]">{approvedBranches.join(" · ") || "Registered follow-up branches"} run as gated branches</div>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-4 text-[var(--text-muted)]">{data.mission.approvalBoundary}</p>
      </section>
    </div>
  );
}
