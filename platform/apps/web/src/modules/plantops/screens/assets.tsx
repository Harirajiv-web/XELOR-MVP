"use client";

import { useMemo, useState } from "react";
import { Cog, Gauge, RefreshCw, Search } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState } from "@spine/states";
import { date, dateTime, humanise, inr, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { AssetHistory, AssetHistoryEvent, AssetRow } from "../api";
import { plantOpsApi, windowOf } from "../api";

/**
 * THE ASSET REGISTER — the one register the whole package sits on.
 *
 * `maintenance_asset` is the machine everywhere in this product: the row a downtime interval
 * points at, the row a work order is raised against, the row an edge gateway binds its
 * telemetry to, and the row a kWh meter hangs off. That is the entire argument for selling
 * connected factory, maintenance and energy as one package — a plant that buys them
 * separately maintains three lists of the same machines and reconciles them by hand.
 *
 * THE HIERARCHY IS THE SERVER'S. `path` is `/PLANT/AREA/MACHINE`, derived on write and never
 * sent by a client, and this screen indents by `depth` rather than by inferring structure
 * from a naming convention — which is what every spreadsheet version of this register ends
 * up doing, until somebody renames a line.
 *
 * NOTHING HERE CAN BE TYPED. There is no "condition" field, no "status" a supervisor sets.
 * A machine is down because a downtime interval against it has no end time; it is under
 * warranty because a date has not passed. Every column is a consequence of something that
 * was recorded elsewhere, which is why this list can be trusted as the plant's live state
 * rather than read as somebody's morning summary.
 */
export default function PlantAssetsScreen(_props: ScreenProps): React.JSX.Element {
  const [filter, setFilter] = useState("");
  const [criticality, setCriticality] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const assets = useQuery<AssetRow[]>(plantOpsApi.assetsPath, {
    query: { criticality: criticality || undefined },
  });

  const rows = useMemo(() => {
    const all = assets.data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (row) =>
        row.assetCode.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.path.toLowerCase().includes(q),
    );
  }, [assets.data, filter]);

  const down = (assets.data ?? []).filter((row) => row.openDowntimeId !== null);
  const chosen = (assets.data ?? []).find((row) => row.assetCode === selected) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Assets"
        subtitle="Every machine the plant maintains, in the hierarchy it sits in, with what has happened to each."
        meta={[
          { label: "Assets", value: num(assets.data?.length ?? 0) },
          { label: "Down now", value: num(down.length) },
        ]}
        actions={
          <button type="button" className="btn btn-secondary btn-sm" onClick={assets.reload}>
            <RefreshCw className={`h-3.5 w-3.5 ${assets.loading ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by code, name or location…"
            aria-label="Filter assets"
            className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
        <select
          value={criticality}
          onChange={(event) => setCriticality(event.target.value)}
          aria-label="Criticality"
          className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-[13px] text-[var(--text-primary)]"
        >
          <option value="">Every criticality</option>
          <option value="A">A — stops the plant</option>
          <option value="B">B — stops a line</option>
          <option value="C">C — can wait</option>
        </select>
      </div>

      {chosen ? (
        <AssetDossier key={chosen.assetCode} asset={chosen} onClose={() => setSelected(null)} />
      ) : null}

      <DataTable
        rows={rows}
        columns={COLUMNS}
        loading={assets.loading}
        error={assets.error}
        onReload={assets.reload}
        rowKey={(row) => row.id}
        onRowClick={(row) => setSelected(row.assetCode === selected ? null : row.assetCode)}
        caption="The asset register with hierarchy, criticality, live state and meters"
        empty={
          filter || criticality ? (
            <Empty
              title="Nothing matches that filter"
              body="No asset matched. Clear the filter, or widen the criticality."
            />
          ) : (
            <Empty
              title="No assets are registered"
              body="A machine has to exist here before a fault can be reported on it, a stop recorded against it or a meter read from it. The register is built by the maintenance team, not by this screen."
            />
          )
        }
      />
    </div>
  );
}

const COLUMNS: ReadonlyArray<Column<AssetRow>> = [
  {
    key: "asset",
    header: "Machine",
    render: (row) => (
      // Indented by the server's own depth. Inferring structure from a naming convention is
      // what every spreadsheet version of this register does, until somebody renames a line.
      <div className="min-w-0" style={{ paddingLeft: `${Math.min(row.depth, 4) * 14}px` }}>
        <div className="font-semibold text-[var(--text-primary)]">{row.assetCode}</div>
        <div className="truncate text-[12px] text-[var(--text-secondary)]">{row.name}</div>
      </div>
    ),
  },
  {
    key: "path",
    header: "Where it is",
    width: "w-64",
    render: (row) => (
      <div className="min-w-0">
        <div className="truncate font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]">
          {row.path}
        </div>
        <div className="text-[12px] text-[var(--text-muted)]">{humanise(row.assetType)}</div>
      </div>
    ),
  },
  {
    key: "criticality",
    header: "Criticality",
    width: "w-28",
    render: (row) =>
      row.criticality ? (
        <StatusBadge tone="unknown" label={row.criticality} />
      ) : (
        <span className="text-[12px] text-[var(--text-secondary)]">Not classified</span>
      ),
  },
  {
    key: "state",
    header: "State",
    width: "w-48",
    render: (row) => (
      <div className="flex flex-wrap items-center gap-1">
        {/* Down because an interval has no end time — not because anybody said so. */}
        {row.openDowntimeId ? (
          <StatusBadge tone="overdue" label="Down now" />
        ) : (
          <StatusBadge status={row.status} />
        )}
        {row.warrantyActive ? <StatusBadge tone="approved" label="In warranty" /> : null}
        {row.statutoryClass !== "none" ? (
          <StatusBadge tone="pending" label="Statutory" />
        ) : null}
      </div>
    ),
  },
  {
    key: "meters",
    header: "Meters",
    width: "w-56",
    render: (row) =>
      row.meters.length === 0 ? (
        <span className="text-[12px] text-[var(--text-secondary)]">None fitted</span>
      ) : (
        <div className="flex flex-col gap-0.5">
          {row.meters.map((meter) => (
            <div key={meter.meterType} className="text-[12px]">
              <span className="text-[var(--text-primary)]">
                {num(meter.currentValue, 1)} {meter.uom}
              </span>{" "}
              <span className="text-[var(--text-muted)]">{humanise(meter.meterType)}</span>
              {meter.stale ? (
                <span className="text-[var(--warn-ink)]"> · not read recently</span>
              ) : null}
            </div>
          ))}
        </div>
      ),
  },
];

/**
 * ONE MACHINE'S HISTORY, over a window somebody chose.
 *
 * The history route REQUIRES `from` and `to` and refuses without them, so this panel always
 * sends a window rather than letting the server pick — which also means the window is always
 * visible on screen, and nobody has to wonder whether "3 breakdowns" means this year or
 * ever. Ninety days by default; a year is one click away, because an annual pattern is the
 * thing a criticality argument usually turns on.
 *
 * The events are what the plant DID, in one list: repairs, stoppages, services, spares and
 * meter readings. Maintenance's own asset screen shows the same rows — this one exists so a
 * supervisor never has to leave the package to answer "what has been going on with that
 * machine".
 */
function AssetDossier({ asset, onClose }: { asset: AssetRow; onClose: () => void }): React.JSX.Element {
  const [days, setDays] = useState(90);
  const window = useMemo(() => windowOf(days), [days]);
  const history = useQuery<AssetHistory>(plantOpsApi.assetHistoryPath(asset.assetCode), {
    query: { from: window.from, to: window.to },
  });

  const events = useMemo(
    () => [...(history.data?.events ?? [])].sort((a, b) => b.at.localeCompare(a.at)),
    [history.data],
  );
  const stops = events.filter((event) => event.type.startsWith("downtime."));
  const jobs = events.filter((event) => event.type.startsWith("mwo."));
  const spend = events.reduce((sum, event) => sum + (event.amount ?? 0), 0);

  return (
    <div className="x-home-panel">
      <div className="x-home-panel-head flex-wrap">
        <div className="min-w-0">
          <h2 className="x-section-heading">
            {asset.assetCode} &mdash; {asset.name}
          </h2>
          <p>
            {asset.path} · {humanise(asset.assetType)}
            {asset.criticality ? ` · criticality ${asset.criticality}` : ""}
            {asset.amc ? ` · AMC ${asset.amc.contractRef} to ${date(asset.amc.validTo)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* The register says a machine is down; it does not carry the stop's start time,
              so this panel states the fact and leaves "for how long" to the shift board,
              which reads the interval itself. */}
          {asset.openDowntimeId ? <StatusBadge tone="overdue" label="Down now" /> : null}
          <label className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
            Window
            <select
              value={String(days)}
              onChange={(event) => setDays(Number(event.target.value))}
              aria-label="History window"
              className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-[13px] text-[var(--text-primary)]"
            >
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close panel
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Jobs raised" value={num(jobs.length)} hint={`Between ${window.from} and ${window.to}.`} />
          <Metric label="Stoppages" value={num(stops.length)} hint="Every downtime interval that STARTED inside the window." />
          <Metric
            label="Recorded spend"
            value={inr(spend)}
            hint="Job cost snapshots and valued spare issues in this window. Labour still running is not in it."
          />
          <Metric
            label="Meters"
            value={asset.meters.length === 0 ? "None fitted" : num(asset.meters.length)}
            hint={
              asset.meters.some((meter) => meter.stale)
                ? "At least one meter has not been read recently — every forecast off it is a guess."
                : "Readings are cumulative counters, not consumption."
            }
          />
        </div>

        {asset.meters.length > 0 ? (
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-primary)]">
              <Gauge className="h-3.5 w-3.5" aria-hidden />
              Meters
            </h3>
            <div className="overflow-x-auto">
              <table className="x-data-table min-w-[36rem]">
                <thead>
                  <tr>
                    <th>Meter</th>
                    <th>Counter now</th>
                    <th>Observed per day</th>
                    <th>Last actually read</th>
                  </tr>
                </thead>
                <tbody>
                  {asset.meters.map((meter) => (
                    <tr key={meter.meterType}>
                      <td>
                        <strong>{humanise(meter.meterType)}</strong>
                        <div className="text-[11px] text-[var(--text-muted)]">{meter.uom}</div>
                      </td>
                      <td>{num(meter.currentValue, 2)}</td>
                      <td>
                        {/* Null until two readings exist to compare. Not zero — a machine
                            with one reading is not a machine that does not move. */}
                        {meter.dailyRateEst === null
                          ? "Not enough readings to say"
                          : num(meter.dailyRateEst, 2)}
                      </td>
                      <td>
                        {meter.lastRealReadingAt ? dateTime(meter.lastRealReadingAt) : "Never"}
                        {meter.stale ? (
                          <div className="text-[11px] text-[var(--warn-ink)]">
                            Stale — no observed reading in 60 days.
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-primary)]">
            <Cog className="h-3.5 w-3.5" aria-hidden />
            What happened, newest first
          </h3>
          {history.error ? (
            <ErrorState error={history.error} onRetry={history.reload} />
          ) : history.loading ? (
            <p className="text-[13px] text-[var(--text-secondary)]" role="status">
              Reading this machine&rsquo;s record…
            </p>
          ) : events.length === 0 ? (
            <p className="text-[13px] text-[var(--text-secondary)]">
              Nothing was recorded against {asset.assetCode} between {window.from} and{" "}
              {window.to}. That is an answer, not a gap — try a longer window before concluding
              the machine has never needed anything.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="x-data-table min-w-[40rem]">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>What</th>
                    <th>Reference</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={`${event.at}-${event.type}-${event.ref}`}>
                      <td>{dateTime(event.at)}</td>
                      <td>{describeEvent(event)}</td>
                      <td className="font-[var(--font-mono)] text-[11px]">{event.ref}</td>
                      <td>
                        {event.detail}
                        {event.amount !== undefined && event.amount > 0 ? (
                          <div className="text-[11px] text-[var(--text-muted)]">
                            {inr(event.amount)}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The event type in words. Unknown types are shown RAW rather than mapped to something
 * plausible — a new event kind appearing as its own string is obviously new, whereas one
 * quietly rendered as "Maintenance" would be invisible.
 */
function describeEvent(event: AssetHistoryEvent): string {
  if (event.type === "meter.reading") return "Meter reading";
  if (event.type === "spare.issued") return "Spare issued";
  if (event.type === "pm.occurrence") return "Scheduled service";
  if (event.type.startsWith("downtime.")) return `Stoppage (${event.type.slice(9).replace(/_/g, " ")})`;
  if (event.type.startsWith("mwo.")) return `Job (${event.type.slice(4).replace(/_/g, " ")})`;
  return event.type;
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}): React.JSX.Element {
  return (
    <div className="x-stat-card">
      <span className="x-stat-top">{label}</span>
      <strong className="x-stat-value">{value}</strong>
      <p className="x-stat-hint">{hint}</p>
    </div>
  );
}
