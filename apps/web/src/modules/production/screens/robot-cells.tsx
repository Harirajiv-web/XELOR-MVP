"use client";

import { useState } from "react";
import Link from "next/link";
import type { FactoryOperationsProjection, WorkroomMachine } from "@ind-core/platform";
import type { FactoryAssetView, FactoryOverview } from "@ind-core/platform/factory-connect/contracts";
import { useAccess } from "@spine/access/permissions";
import { api } from "@spine/api/client";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import { dateTime, humanise } from "@spine/format";
import { ActionError } from "../components/action-error";
import { useActionKey } from "../components/idempotency";
import {
  cycleTimeLabel,
  oeeFormulaLabel,
  oeePercent,
  workroomScenarioAction,
} from "../factory-operations-view";

const OVERVIEW_PATH = "/integration/factory/views/production";
type FactoryProductionView = Pick<
  FactoryOverview,
  "generatedAt" | "boundary" | "gateways" | "assets" | "operations" | "summary" | "mission"
>;

interface ScenarioResponse {
  status: "accepted" | "duplicate" | "no_change";
  action: "breakdown" | "recover";
  assetCode: string;
  mockOnly: true;
  physicalControllerContacted: false;
  autoPublished: false;
}

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
    header: "Machine, robot or mobile asset",
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

function OeeMetric({ label, value }: { label: string; value: number | null }): React.JSX.Element {
  return (
    <div className="rounded-[8px] bg-[var(--surface-sunken)] px-2.5 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-1 font-[var(--font-mono)] text-[13px] font-semibold text-[var(--text-primary)]">{oeePercent(value)}</dd>
    </div>
  );
}

function MachineOperationsCard({ machine }: { machine: WorkroomMachine }): React.JSX.Element {
  const idealCycle = machine.oee?.inputs.idealCycleSeconds ?? null;
  return (
    <article className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">{machine.name}</h3>
          <p className="font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]">{machine.assetCode} · {machine.workCenterCode ?? "Work centre not configured"}</p>
        </div>
        <StatusBadge tone={stateTone(machine.state)} label={humanise(machine.state)} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <OeeMetric label="Availability" value={machine.oee?.availabilityPct ?? null} />
        <OeeMetric label="Performance" value={machine.oee?.performancePct ?? null} />
        <OeeMetric label="Quality" value={machine.oee?.qualityPct ?? null} />
        <OeeMetric label="OEE" value={machine.oee?.oeePct ?? null} />
      </dl>

      <div className="mt-3 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 text-[11px] leading-5 text-[var(--text-secondary)]">
        <p className="font-[var(--font-mono)] text-[var(--text-primary)]">
          {machine.oee
            ? oeeFormulaLabel(machine.oee)
            : "A × P × Q = shift evidence unavailable"}
        </p>
        <p>{cycleTimeLabel(machine.actualCycleSeconds, idealCycle)}</p>
        {machine.oee ? (
          <p>
            Raw evidence: {machine.oee.inputs.runSeconds ?? "—"}s run / {machine.oee.inputs.plannedProductionSeconds ?? "—"}s planned · {machine.oee.inputs.goodCount ?? "—"} good / {machine.oee.inputs.totalCount ?? "—"} total · shift {machine.oee.shift.code}
          </p>
        ) : null}
      </div>

      {machine.assignment ? (
        <div className="mt-3 rounded-[8px] border border-[var(--status-draft-border)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-[12px]">{machine.assignment.job.orderRef} · {machine.assignment.job.operationCode}</strong>
            <StatusBadge tone="draft" label="Configured mock assignment" />
          </div>
          <p className="mt-1 text-[12px] text-[var(--text-primary)]">{machine.assignment.job.operationName}</p>
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
            {machine.assignment.job.itemCode} · qty {machine.assignment.job.quantity} · priority {machine.assignment.job.priority} · due {dateTime(machine.assignment.job.dueAt)}
          </p>
          <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
            Operator: {machine.assignment.operator.name} ({machine.assignment.operator.employeeCode}) · {machine.assignment.operator.skill}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-[var(--text-muted)]">Basis: {machine.assignment.operator.basis}</p>
        </div>
      ) : (
        <p className="mt-3 rounded-[8px] border border-dashed border-[var(--border-strong)] p-3 text-[11px] text-[var(--text-secondary)]">No configured mock assignment; this machine may be considered only when it is an explicit alternate.</p>
      )}

      <p className="mt-3 text-[10px] text-[var(--text-muted)]">
        Evidence {machine.observedAt ? dateTime(machine.observedAt) : "not observed"} · {machine.evidenceStale ? "stale" : "fresh under simulator policy"} · Maintenance ref {machine.maintenanceAssetRef ?? "none (POC planning alternate)"}
      </p>
    </article>
  );
}

function ReplanPanel({ operations }: { operations: FactoryOperationsProjection }): React.JSX.Element {
  if (operations.atRiskJobs.length === 0) {
    return (
      <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
        <h3 className="text-[13px] font-semibold">No configured job is currently at risk</h3>
        <p className="mt-1 text-[11px] text-[var(--text-secondary)]">The breakdown control creates mock fault evidence so the deterministic alternate-machine proposal can be reviewed end to end.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {operations.atRiskJobs.map((job) => {
        const proposal = operations.replanProposals.find((row) => row.jobId === job.jobId);
        return (
          <article key={`${job.jobId}:${job.assetCode}`} className="rounded-[10px] border border-[var(--status-pending-border)] bg-[var(--status-pending-bg)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold">{job.orderRef} at risk</h3>
              <StatusBadge tone="pending" label={humanise(job.state)} />
            </div>
            <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{job.reason}</p>
            {proposal ? (
              <div className="mt-3 rounded-[8px] bg-[var(--surface-raised)] p-3 text-[11px] leading-5">
                <p className="font-semibold">
                  {proposal.status === "proposed"
                    ? `Proposal: ${proposal.fromAssetCode} → ${proposal.toAssetCode}`
                    : "Proposal blocked: no eligible alternate"}
                </p>
                <p className="text-[var(--text-secondary)]">{proposal.reason}</p>
                <p className="mt-1 font-[var(--font-mono)] text-[10px] text-[var(--text-muted)]">Rule: {proposal.deterministicRule}</p>
                <p className="mt-1 text-[10px] font-semibold text-[var(--text-muted)]">Human approval required · proposal only · not auto-published</p>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export default function RobotCellsScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const query = useQuery<FactoryProductionView>(OVERVIEW_PATH);
  const actionKey = useActionKey();
  const [scenarioPending, setScenarioPending] = useState(false);
  const [scenarioError, setScenarioError] = useState<unknown>(null);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResponse | null>(null);
  if (query.loading && !query.data) return <Loading label="Reading robot cells…" />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />;
  const data = query.data;
  if (!data) return <Empty title="No robot-cell evidence" body="Configure one read-only factory gateway binding before adding controlled actions." />;

  const siteCodes = [...new Set([...data.gateways.map((gateway) => gateway.siteCode), ...data.assets.map((asset) => asset.siteCode)].filter(Boolean))];
  const siteLabel = siteCodes.length === 0 ? "Factory site not reported" : siteCodes.join(" · ");
  const deploymentModes = [...new Set(data.gateways.map((gateway) => gateway.deploymentMode).filter(Boolean))];
  const canReviewMission = can("agentos.run.read");
  const canSimulateWorkroom = can("factory.scenario.execute");
  const scenarioMachine = data.operations?.machines.find(
    (machine) => machine.assetCode === "AST-PNQ-TRN-01",
  );
  const scenarioAction = workroomScenarioAction(scenarioMachine?.state);

  async function runWorkroomScenario(): Promise<void> {
    if (!scenarioMachine || scenarioPending) return;
    setScenarioPending(true);
    setScenarioError(null);
    setScenarioResult(null);
    const seed = `${scenarioAction}:${scenarioMachine.assetCode}:${scenarioMachine.state}:${scenarioMachine.observedAt ?? "unobserved"}`;
    const idempotencyKey = actionKey.keyFor(seed);
    try {
      const result = await api.post<ScenarioResponse>(
        "/integration/factory/simulator/3s/workroom",
        { action: scenarioAction, idempotencyKey },
        { idempotencyKey },
      );
      setScenarioResult(result);
      actionKey.reset();
      query.reload();
    } catch (error) {
      setScenarioError(error);
    } finally {
      setScenarioPending(false);
    }
  }

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

      {data.operations ? (
        <section className="overflow-hidden rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface-sunken)]" aria-labelledby="workroom-title">
          <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="workroom-title" className="text-[16px] font-semibold text-[var(--text-primary)]">3S Factory Operations · Workroom POC</h2>
                  <StatusBadge tone="draft" label="Mock only" />
                </div>
                <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{data.operations.demo.boundary}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/production/orders" className="btn btn-secondary btn-sm">Production orders</Link>
                <Link href="/hrm/employees" className="btn btn-secondary btn-sm">HR operators</Link>
                <Link href="/planning/planned-orders" className="btn btn-secondary btn-sm">Planning</Link>
                <Link href="/maintenance/downtime" className="btn btn-secondary btn-sm">Maintenance</Link>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-[var(--border-subtle)] bg-[var(--border-subtle)] sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Machines", data.operations.summary.machineCount],
                ["Assigned jobs", data.operations.summary.assignedJobCount],
                ["Constrained", data.operations.summary.constrainedMachineCount],
                ["Jobs at risk", data.operations.summary.atRiskJobCount],
                ["Replan proposals", data.operations.summary.replanProposalCount],
                ["Average OEE", oeePercent(data.operations.summary.averageOeePct)],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-[var(--surface-raised)] p-3">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</dt>
                  <dd className="mt-1 text-[16px] font-semibold text-[var(--text-primary)]">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="p-4">
            <div className="grid gap-3 xl:grid-cols-2">
              {data.operations.machines.map((machine) => (
                <MachineOperationsCard key={machine.assetCode} machine={machine} />
              ))}
            </div>

            <div className="mt-4 rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface-raised)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <h3 className="text-[14px] font-semibold">Deterministic breakdown → replan walkthrough</h3>
                  <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
                    The control appends mock state evidence for the 3S turning centre. A fault marks its configured replay job at risk and proposes only its explicitly configured WC-LTH02 alternate. Recovery restores the mock running state. Neither action contacts equipment, assigns an operator, changes a manufacturing order, or publishes a schedule.
                  </p>
                </div>
                {canSimulateWorkroom && scenarioMachine ? (
                  <button
                    type="button"
                    className={scenarioAction === "breakdown" ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm"}
                    disabled={scenarioPending}
                    onClick={() => void runWorkroomScenario()}
                  >
                    {scenarioPending
                      ? "Appending mock evidence…"
                      : scenarioAction === "breakdown"
                        ? "Simulate lathe breakdown"
                        : "Recover mock lathe"}
                  </button>
                ) : (
                  <p className="max-w-xs text-[11px] text-[var(--text-muted)]">The mock control requires the existing factory telemetry permission. This screen remains readable without it.</p>
                )}
              </div>
              <div className="mt-3"><ActionError error={scenarioError} /></div>
              {scenarioResult ? (
                <p role="status" className="mt-3 rounded-[8px] bg-[var(--status-approved-bg)] p-3 text-[11px] text-[var(--status-approved-text)]">
                  Mock {scenarioResult.action} evidence {scenarioResult.status}. Physical controller contacted: no. Schedule auto-published: no.
                </p>
              ) : null}
              <div className="mt-4"><ReplanPanel operations={data.operations} /></div>
            </div>

            <p className="mt-3 text-[10px] leading-4 text-[var(--text-muted)]">
              Assignment evidence is a configured POC replay snapshot. Follow the links above for the current Production, HR, Planning and Maintenance records; those modules remain authoritative and this view writes to none of them.
            </p>
          </div>
        </section>
      ) : null}

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
