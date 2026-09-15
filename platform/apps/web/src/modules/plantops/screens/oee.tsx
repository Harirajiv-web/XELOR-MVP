"use client";

import { useMemo, useState } from "react";
import { CircleSlash, Gauge, Info, RefreshCw } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { ErrorState, Loading } from "@spine/states";
import { dateTime, num } from "@spine/format";
import { useAccess } from "@spine/access/permissions";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { AssetRow, FactoryProductionView, KpiResponse, OeeFactor } from "../api";
import {
  assessOee,
  availabilityFactor,
  performanceFactor,
  plantOpsApi,
  qualityFactor,
  windowOf,
} from "../api";

/**
 * OEE — AND THE REASON THIS SCREEN USUALLY SHOWS NOTHING.
 *
 * Overall Equipment Effectiveness is availability × performance × quality. It is the number
 * every competing product puts in its largest font, and it is the number most likely to be
 * quietly fabricated, because the three factors come from three different places and almost
 * no plant instruments all three.
 *
 * The fabrication is never deliberate. It happens like this: availability is measured,
 * quality is measured, performance is not — so performance is "assumed 100%" somewhere in a
 * configuration screen nobody remembers opening, and the product of the other two is
 * displayed as OEE. The figure is plausible, it trends, people plan around it, and it is
 * describing a plant that does not exist. Two years later somebody discovers the assumption
 * and every historic comparison is worthless.
 *
 * THIS SCREEN CANNOT DO THAT, and the reason is structural rather than a matter of care:
 * the multiplication lives in `assessOee` in `api.ts`, which returns null unless all three
 * factors are present. There is no code path here that can print a percentage from two
 * measurements and an assumption. When a factor is missing the screen says which one, and
 * what would have to exist for it to be computed — because "we do not measure performance"
 * is a genuinely useful thing for a plant to be told, and far more useful than a number.
 *
 * In this build performance is the one that is missing, always: nothing in the system
 * records a standard cycle time per unit. Telemetry reports the cycle time a machine is
 * ACHIEVING, which is the numerator with no denominator. Schedule adherence exists on the
 * reliability report and is deliberately not substituted — "finished when planned" and "ran
 * at rate" are different claims, and a plant told the second when it was given the first
 * optimises the wrong thing.
 */
export default function OeeScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const [days, setDays] = useState(30);
  const [scopeCode, setScopeCode] = useState("");
  /**
   * Scheduled hours, typed by a person, because there is no shift calendar in this build
   * and availability is unanswerable without a denominator. The server records where the
   * figure came from and reports it back as `scheduledHoursSource`, which this screen
   * prints — an entered denominator is a defensible input, an invented one is not.
   */
  const [scheduledHours, setScheduledHours] = useState("");

  const window = useMemo(() => windowOf(days), [days]);

  const assets = useQuery<AssetRow[]>(can("mnt.asset.read") ? plantOpsApi.assetsPath : null);
  const kpis = useQuery<KpiResponse>(plantOpsApi.kpisPath, {
    query: {
      scopeType: scopeCode ? "asset" : "tenant",
      scopeCode: scopeCode || undefined,
      from: window.from,
      to: window.to,
      scheduledHours: scheduledHours.trim() === "" ? undefined : scheduledHours.trim(),
    },
  });
  const floor = useQuery<FactoryProductionView>(plantOpsApi.factoryProductionViewPath);

  const selectedAsset = (assets.data ?? []).find((row) => row.assetCode === scopeCode) ?? null;

  /**
   * The telemetry rows inside the chosen scope.
   *
   * `maintenanceAssetRef` is the join that makes the package one register rather than two:
   * a bound machine points at the maintenance asset it IS. When a scope is chosen and the
   * telemetry carries no such link, the rows are excluded rather than assumed to belong —
   * counting another line's output towards this machine's quality is exactly the error
   * class this screen exists to avoid.
   */
  const machines = useMemo(() => {
    const all = floor.data?.assets ?? [];
    if (!selectedAsset) return all;
    return all.filter(
      (row) =>
        row.maintenanceAssetRef === selectedAsset.id || row.assetCode === selectedAsset.assetCode,
    );
  }, [floor.data, selectedAsset]);

  const assessment = useMemo(
    () =>
      assessOee({
        availability: availabilityFactor(kpis.data),
        performance: performanceFactor(machines),
        quality: qualityFactor(machines),
      }),
    [kpis.data, machines],
  );

  const loading = kpis.loading || floor.loading;
  const error = kpis.error ?? floor.error;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="OEE"
        subtitle="Availability, performance and quality — each with the rows it came from, or the reason it cannot be computed."
        meta={[
          { label: "Scope", value: selectedAsset ? selectedAsset.assetCode : "Whole plant" },
          { label: "Window", value: `${window.from} → ${window.to}` },
        ]}
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              kpis.reload();
              floor.reload();
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="x-field max-w-[16rem] flex-1">
          Machine
          <select
            value={scopeCode}
            onChange={(event) => setScopeCode(event.target.value)}
            aria-label="Machine to measure"
          >
            <option value="">Whole plant</option>
            {(assets.data ?? [])
              .filter((row) => row.assetType === "machine" || row.assetType === "component")
              .map((row) => (
                <option key={row.id} value={row.assetCode}>
                  {row.assetCode} · {row.name}
                </option>
              ))}
          </select>
          {can("mnt.asset.read") ? null : <small>Needs mnt.asset.read to list machines.</small>}
        </label>

        <label className="x-field max-w-[14rem] flex-1">
          Window
          <select
            value={String(days)}
            onChange={(event) => setDays(Number(event.target.value))}
            aria-label="Reporting window"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </label>

        <label className="x-field max-w-[18rem] flex-1">
          Scheduled hours in this window
          <input
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            value={scheduledHours}
            onChange={(event) => setScheduledHours(event.target.value)}
            placeholder="Leave empty — availability is then unanswerable"
            aria-label="Scheduled hours in this window"
          />
          <small>
            There is no shift calendar in this build, so nothing can supply this. Left empty,
            availability is reported as unanswerable rather than assumed to be 24&times;7.
          </small>
        </label>
      </div>

      {error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            kpis.reload();
            floor.reload();
          }}
        />
      ) : loading ? (
        <Loading label="Reading the downtime ledger and the machine signals…" />
      ) : (
        <>
          <Composite
            oee={assessment.oee}
            missing={assessment.missing}
            scope={selectedAsset ? `${selectedAsset.assetCode} — ${selectedAsset.name}` : "the whole plant"}
          />

          <h2 className="x-section-heading">The three factors</h2>
          <div className="grid gap-3 lg:grid-cols-3">
            <FactorCard title="Availability" factor={assessment.availability} />
            <FactorCard title="Performance" factor={assessment.performance} />
            <FactorCard title="Quality" factor={assessment.quality} />
          </div>

          <h2 className="x-section-heading">What these were read from</h2>
          <div className="x-home-panel">
            <div className="x-home-panel-head">
              <div>
                <h3 className="x-section-heading">Evidence</h3>
                <p>
                  Every figure above traces to rows on this list. Nothing here was entered by
                  hand except the scheduled hours, and that is labelled where it is used.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="x-data-table min-w-[40rem]">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>What it gave</th>
                    <th>As of</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>Downtime ledger</strong>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        /maintenance/reports/kpis
                      </div>
                    </td>
                    <td>
                      {kpis.data
                        ? `${num(kpis.data.downtimeUnplannedHours, 1)} h unplanned, ${num(
                            kpis.data.downtimePlannedHours,
                            1,
                          )} h planned, ${num(kpis.data.failureCount)} failure${
                            kpis.data.failureCount === 1 ? "" : "s"
                          }. Scheduled hours: ${kpis.data.scheduledHoursSource}.`
                        : "Not read."}
                    </td>
                    <td>{kpis.data ? dateTime(kpis.data.computedAt) : "—"}</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Machine signals</strong>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        /integration/factory/views/production
                      </div>
                    </td>
                    <td>
                      {machines.length === 0
                        ? "No connected machine falls inside this scope."
                        : `${num(machines.filter((row) => !row.evidenceStale).length)} of ${num(
                            machines.length,
                          )} machines reporting fresh evidence. Machines that are not reporting are excluded, never counted as perfect.`}
                    </td>
                    <td>{floor.data ? dateTime(floor.data.generatedAt) : "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {kpis.data && kpis.data.notes.length > 0 ? (
              <div className="border-t border-[var(--border-subtle)] px-5 py-4">
                <p className="text-[12px] font-semibold text-[var(--text-primary)]">
                  What the reliability report said it could not answer
                </p>
                <ul className="mt-1.5 list-disc pl-5 text-[12px] leading-6 text-[var(--text-secondary)]">
                  {kpis.data.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {floor.data ? (
              <p className="border-t border-[var(--border-subtle)] px-5 py-3 text-[11px] leading-5 text-[var(--text-muted)]">
                {floor.data.boundary}
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The composite, which is a percentage or an explanation — never both and never neither.
 *
 * The "cannot be computed" case is given the larger, calmer treatment on purpose. It is not
 * an error state: the plant is running perfectly well, and what is missing is an instrument,
 * not a system. Rendering it as a red failure would teach people to click past it, which is
 * how the assumption gets switched back on.
 */
function Composite({
  oee,
  missing,
  scope,
}: {
  oee: number | null;
  missing: readonly string[];
  scope: string;
}): React.JSX.Element {
  if (oee !== null) {
    return (
      <div className="x-home-panel">
        <div className="flex flex-wrap items-center gap-6 p-6">
          <div>
            <span className="x-stat-top">
              OEE for {scope}
              <Gauge className="h-4 w-4" aria-hidden />
            </span>
            <strong className="x-stat-value">{num(oee * 100, 1)}%</strong>
            <p className="x-stat-hint">
              Availability × performance × quality, all three measured. The three cards below
              show what each was computed from.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="x-home-panel">
      <div className="flex flex-col gap-3 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <CircleSlash className="h-6 w-6 text-[var(--text-muted)]" aria-hidden />
          <div className="min-w-0">
            <p className="text-[16px] font-semibold text-[var(--text-primary)]">
              OEE cannot be computed for {scope}.
            </p>
            <p className="mt-1 text-[13px] leading-6 text-[var(--text-secondary)]">
              {missing.length === 1
                ? `${missing[0]} is not measured, and OEE is the product of all three factors.`
                : `${missing.join(" and ")} are not measured, and OEE is the product of all three factors.`}{" "}
              No figure is shown, and none is estimated — a believable wrong OEE is worse than
              no OEE, because nobody checks a number that looks right.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {missing.map((name) => (
            <StatusBadge key={name} tone="unknown" label={`${name} missing`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** One factor: the number and its basis, or the absence and what would fill it. */
function FactorCard({ title, factor }: { title: string; factor: OeeFactor }): React.JSX.Element {
  const measured = factor.value !== null;
  return (
    <div className="x-stat-card flex flex-col gap-2">
      <span className="x-stat-top">
        {title}
        {measured ? (
          <Gauge className="h-4 w-4" aria-hidden />
        ) : (
          <Info className="h-4 w-4" aria-hidden />
        )}
      </span>
      {measured ? (
        <strong className="x-stat-value">{num(factor.value! * 100, 1)}%</strong>
      ) : (
        // Words, not a dash and not a zero. A dash reads as "loading" and a zero is a lie.
        <strong className="x-stat-value text-[var(--text-muted)] text-[20px]!">
          Insufficient data
        </strong>
      )}
      <p className="x-stat-hint">{factor.basis}</p>
      {factor.wouldNeed ? (
        <p className="x-stat-hint border-t border-[var(--border-subtle)] pt-2">
          <strong className="text-[var(--text-secondary)]">What is missing:</strong>{" "}
          {factor.wouldNeed}
        </p>
      ) : null}
    </div>
  );
}
