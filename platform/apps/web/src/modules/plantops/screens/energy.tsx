"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, Plug, RefreshCw, Zap } from "lucide-react";
import { api } from "@spine/api/client";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { dateTime, num } from "@spine/format";
import { Can, useAccess } from "@spine/access/permissions";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { AssetMeterRow, AssetRow, FactoryProductionView, FailureNotice } from "../api";
import { describeFailure, elapsedSince, energyMeters, plantOpsApi } from "../api";

/**
 * ENERGY — kWh by plant, line and machine.
 *
 * There is no energy module in this system and there should not be one: a kWh meter is a
 * METER TYPE on the asset register, exactly like run hours and cycles, sitting on the same
 * machine row that a breakdown is raised against. That is what makes "what did that machine
 * cost us last month" a single question rather than a reconciliation between two products.
 *
 * TWO THINGS THIS SCREEN WILL NOT SHOW, AND SAYS SO INSTEAD.
 *
 * 1. kWh PER SHIFT. The nav entry that leads here promises energy per shift, and per shift
 *    is genuinely what a plant wants — the night shift's consumption on the same line is the
 *    comparison that finds compressors left running. It cannot be produced: there is no
 *    shift calendar anywhere in this build, so nothing can say where one shift ends and the
 *    next begins. Splitting a day by three would be arithmetic performed on an assumption,
 *    and the resulting "night shift uses 34% more" would be exactly as true as the guess.
 *    What IS shown is kWh PER DAY, observed between real readings, which is true.
 *
 * 2. COST PER JOB. Allocating energy to a production order needs an allocation method — by
 *    run hours, by cycles, by machine rate, by a metered sub-circuit — and a tariff. Neither
 *    is configured anywhere in this system. A rupee figure against a job would be believed
 *    by whoever quotes the next one.
 *
 * A COUNTER IS NOT A CONSUMPTION. Every kWh meter here is cumulative: the number goes up and
 * never resets. Consumption is the DIFFERENCE between two readings, which is why the useful
 * column is the observed per-day rate and why a meter with one reading shows "not enough
 * readings to say" rather than a zero. This distinction is the single most common mistake in
 * energy reporting and it always flatters the plant that has stopped taking readings.
 */
export default function EnergyScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const [reading, setReading] = useState<AssetRow | null>(null);

  const assets = useQuery<AssetRow[]>(plantOpsApi.assetsPath);
  const floor = useQuery<FactoryProductionView>(
    can("production.factory-connect.read") ? plantOpsApi.factoryProductionViewPath : null,
  );

  /** Only assets that actually have a kWh meter. A machine without one is not a machine
   *  drawing no power; it is a machine nobody is measuring, and it belongs in neither
   *  column of a consumption table. */
  const metered = useMemo(
    () =>
      (assets.data ?? []).flatMap((asset) => {
        const meters = energyMeters(asset);
        const meter = meters[0];
        return meter ? [{ asset, meter }] : [];
      }),
    [assets.data],
  );

  const rollup = useMemo(() => groupByLine(metered), [metered]);

  const measurable = metered.filter((row) => row.meter.dailyRateEst !== null);
  const perDay = measurable.reduce((sum, row) => sum + (row.meter.dailyRateEst ?? 0), 0);
  const silent = metered.filter((row) => row.meter.stale).length;

  const live = (floor.data?.assets ?? []).filter(
    (row) => row.energyKwh !== null && !row.evidenceStale,
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Energy"
        subtitle="Electricity by plant, line and machine, from the kWh meters on the asset register."
        meta={[
          { label: "Metered machines", value: num(metered.length) },
          { label: "kWh per day observed", value: num(perDay, 1) },
          { label: "Meters gone quiet", value: num(silent) },
        ]}
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              assets.reload();
              floor.reload();
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${assets.loading ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
        }
      />

      {/* The two absences, stated once and plainly, where somebody looking for them will
          read them — rather than left to be discovered as a missing column. */}
      <div className="x-notice" data-tone="warning">
        <div>
          <p>
            <strong>kWh per shift is not shown, and neither is cost per job.</strong> Per-shift
            needs a shift calendar to split a day by, and this build has none; cost per job
            needs an allocation method and a tariff, and neither is configured. The figures
            here are kWh per DAY, observed between real meter readings. Nothing on this screen
            is divided by an assumption.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Observed kWh per day"
          value={measurable.length === 0 ? "Not measurable yet" : num(perDay, 1)}
          hint={
            measurable.length === 0
              ? "No kWh meter has two readings to compare, so no rate can be observed from any of them."
              : `Summed across ${num(measurable.length)} of ${num(metered.length)} metered machines. The other ${num(metered.length - measurable.length)} have too few readings to say.`
          }
        />
        <Tile
          label="Metered machines"
          value={num(metered.length)}
          hint={`Out of ${num(assets.data?.length ?? 0)} assets on the register. A machine with no kWh meter is unmeasured, not idle.`}
        />
        <Tile
          label="Meters gone quiet"
          value={num(silent)}
          hint={
            silent === 0
              ? "Every kWh counter has been read in the last 60 days."
              : "No observed reading in 60 days. A gap in a cumulative counter does not show as a dip — it shows as a bigger jump later."
          }
        />
        <Tile
          label="Reporting live"
          value={
            can("production.factory-connect.read")
              ? floor.loading
                ? "…"
                : num(live.length)
              : "Not visible"
          }
          hint={
            can("production.factory-connect.read")
              ? "Machines whose gateway is sending an energy figure right now, with evidence the server considers fresh."
              : "Live machine energy needs production.factory-connect.read."
          }
        />
      </div>

      <h2 className="x-section-heading">By plant and line</h2>
      <DataTable
        rows={rollup}
        columns={ROLLUP_COLUMNS}
        loading={assets.loading}
        error={assets.error}
        onReload={assets.reload}
        rowKey={(row) => row.key}
        caption="Observed kWh per day, grouped by the plant and line each machine sits under"
        empty={
          <Empty
            title="No machine has a kWh meter"
            body="Energy appears here once a kWh meter exists on a machine in the asset register and somebody has read it at least twice. One reading establishes the counter; the second is what makes a rate."
          />
        }
      />

      <h2 className="x-section-heading">By machine</h2>
      <DataTable
        rows={metered}
        columns={machineColumns(can("mnt.meter.write"), (asset) => setReading(asset))}
        loading={assets.loading}
        error={assets.error}
        onReload={assets.reload}
        rowKey={(row) => row.asset.id}
        caption="Each metered machine with its counter, observed daily rate and last real reading"
        empty={
          <Empty
            title="No machine has a kWh meter"
            body="A kWh meter is a meter type on the asset register — the same machine row a breakdown is raised against."
          />
        }
      />

      {reading ? (
        <RecordReading
          asset={reading}
          onDone={(saved) => {
            setReading(null);
            if (saved) assets.reload();
          }}
        />
      ) : null}

      {can("production.factory-connect.read") ? (
        <>
          <h2 className="x-section-heading">What the connected machines are reporting</h2>
          <div className="x-home-panel">
            <div className="x-home-panel-head">
              <div>
                <h3 className="x-section-heading">Live energy from the gateways</h3>
                <p>
                  A second, independent source: what a machine says it has drawn, as opposed to
                  what somebody wrote down from its meter. Rows the server considers stale are
                  shown as stale rather than being left to look current.
                </p>
              </div>
            </div>
            {(floor.data?.assets ?? []).length === 0 ? (
              <p className="p-5 text-[13px] text-[var(--text-secondary)]">
                {floor.loading
                  ? "Reading the gateways…"
                  : "No machine on this tenant is bound to an edge gateway, so there is no live energy to show."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="x-data-table min-w-[44rem]">
                  <thead>
                    <tr>
                      <th>Machine</th>
                      <th>State</th>
                      <th>Energy reported</th>
                      <th>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(floor.data?.assets ?? []).map((row) => {
                      const seen = elapsedSince(row.observedAt);
                      return (
                        <tr key={row.assetCode}>
                          <td>
                            <strong>{row.assetCode}</strong>
                            <div className="text-[11px] text-[var(--text-muted)]">{row.name}</div>
                          </td>
                          <td>
                            <StatusBadge status={row.state} />
                          </td>
                          <td>
                            {row.energyKwh === null
                              ? "This machine reports no energy figure"
                              : `${num(row.energyKwh, 2)} kWh`}
                          </td>
                          <td>
                            {row.evidenceStale ? (
                              <>
                                <StatusBadge tone="overdue" label="Stale" />
                                <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                                  {seen
                                    ? `Last seen ${seen.text} ago — excluded from every figure above.`
                                    : "Has never reported."}
                                </div>
                              </>
                            ) : (
                              <span className="text-[12px] text-[var(--text-secondary)]">
                                {row.observedAt ? dateTime(row.observedAt) : "—"}
                                {seen ? ` · ${seen.text} ago` : ""}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* --------------------------------- shapes ---------------------------------- */

interface MeteredMachine {
  asset: AssetRow;
  meter: AssetMeterRow;
}

interface LineRollup {
  key: string;
  plant: string;
  line: string;
  machines: number;
  measurable: number;
  perDay: number;
  stale: number;
}

/**
 * Grouped by the FIRST TWO SEGMENTS of the server's own path — plant, then area or line.
 *
 * `path` is `/PLANT/AREA/MACHINE`, built on the server when an asset is created or moved. A
 * machine whose path is shorter than that is grouped as "unplaced" rather than being
 * assigned to the plant it is probably in: a rolled-up figure that quietly includes a
 * machine somebody never located is how a line gets blamed for consumption it never had.
 */
function groupByLine(rows: readonly MeteredMachine[]): readonly LineRollup[] {
  const groups = new Map<string, LineRollup>();
  for (const row of rows) {
    const segments = row.asset.path.split("/").filter((segment) => segment.length > 0);
    const plant = segments[0] ?? "Unplaced";
    const line = segments[1] ?? "No line recorded";
    const key = `${plant}/${line}`;
    const current: LineRollup = groups.get(key) ?? {
      key,
      plant,
      line,
      machines: 0,
      measurable: 0,
      perDay: 0,
      stale: 0,
    };
    current.machines += 1;
    if (row.meter.dailyRateEst !== null) {
      current.measurable += 1;
      current.perDay += row.meter.dailyRateEst;
    }
    if (row.meter.stale) current.stale += 1;
    groups.set(key, current);
  }
  return [...groups.values()].sort(
    (a, b) => b.perDay - a.perDay || a.key.localeCompare(b.key),
  );
}

const ROLLUP_COLUMNS: ReadonlyArray<Column<LineRollup>> = [
  {
    key: "where",
    header: "Plant and line",
    render: (row) => (
      <div className="min-w-0">
        <div className="font-semibold text-[var(--text-primary)]">{row.line}</div>
        <div className="text-[12px] text-[var(--text-secondary)]">{row.plant}</div>
      </div>
    ),
  },
  {
    key: "perDay",
    header: "kWh per day observed",
    numeric: true,
    width: "w-52",
    render: (row) =>
      row.measurable === 0 ? (
        <span className="text-[var(--text-secondary)]">Not measurable</span>
      ) : (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{num(row.perDay, 1)}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            from {num(row.measurable)} of {num(row.machines)} meters
          </div>
        </div>
      ),
  },
  {
    key: "coverage",
    header: "Coverage",
    width: "w-56",
    // Said on the row, not in a footnote. A line total that silently omits three machines
    // is a line total somebody will compare against a bill that does not.
    render: (row) =>
      row.measurable === row.machines ? (
        <StatusBadge tone="approved" label="Every meter counted" />
      ) : (
        <div className="min-w-0">
          <StatusBadge tone="pending" label="Partial" />
          <div className="mt-1 text-[12px] text-[var(--text-secondary)]">
            {num(row.machines - row.measurable)} meter
            {row.machines - row.measurable === 1 ? " has" : "s have"} too few readings to
            contribute.
          </div>
        </div>
      ),
  },
  {
    key: "stale",
    header: "Gone quiet",
    numeric: true,
    width: "w-32",
    render: (row) =>
      row.stale === 0 ? (
        <span className="text-[12px] text-[var(--text-secondary)]">None</span>
      ) : (
        <span className="font-semibold text-[var(--warn-ink)]">{num(row.stale)}</span>
      ),
  },
];

function machineColumns(
  canRead: boolean,
  onRecord: (asset: AssetRow) => void,
): ReadonlyArray<Column<MeteredMachine>> {
  return [
    {
      key: "machine",
      header: "Machine",
      render: (row) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{row.asset.assetCode}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{row.asset.name}</div>
        </div>
      ),
    },
    {
      key: "where",
      header: "Where it is",
      width: "w-64",
      render: (row) => (
        <span className="font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]">
          {row.asset.path}
        </span>
      ),
    },
    {
      key: "counter",
      header: "Counter now",
      numeric: true,
      width: "w-40",
      // The cumulative reading, labelled as one. It is not consumption and the header says so.
      render: (row) => (
        <div className="min-w-0">
          <div>{num(row.meter.currentValue, 2)}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">{row.meter.uom}</div>
        </div>
      ),
    },
    {
      key: "rate",
      header: "kWh per day",
      numeric: true,
      width: "w-44",
      render: (row) =>
        row.meter.dailyRateEst === null ? (
          <span className="text-[var(--text-secondary)]">Not enough readings</span>
        ) : (
          <span className="font-semibold text-[var(--text-primary)]">
            {num(row.meter.dailyRateEst, 2)}
          </span>
        ),
    },
    {
      key: "lastRead",
      header: "Last actually read",
      width: "w-56",
      render: (row) => {
        const quiet = elapsedSince(row.meter.lastRealReadingAt);
        if (row.meter.lastRealReadingAt === null) {
          return <StatusBadge tone="overdue" label="Never read" />;
        }
        return (
          <div className="min-w-0">
            <div>{dateTime(row.meter.lastRealReadingAt)}</div>
            <div className="text-[12px] text-[var(--text-secondary)]">
              {quiet ? `${quiet.text} ago` : ""}
              {row.meter.stale ? " · stale" : ""}
            </div>
          </div>
        );
      },
    },
    {
      key: "record",
      header: "Reading",
      width: "w-36",
      render: (row) =>
        canRead ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onRecord(row.asset)}
          >
            <Plug className="h-3.5 w-3.5" aria-hidden />
            Record
          </button>
        ) : (
          <span className="text-[12px] text-[var(--text-muted)]">Needs mnt.meter.write</span>
        ),
    },
  ];
}

/**
 * RECORD A METER READING.
 *
 * Deliberately the smallest possible form: a machine, a number and a time. The reading is
 * appended, never edited — a correction is a different verb with a reason attached, because
 * the two levers that could quietly flatter a plant's figures are downtime corrections and
 * meter corrections, and both are separately permissioned on the server for exactly that
 * reason.
 *
 * The counter is CUMULATIVE, so a reading lower than the current value is almost always a
 * transcription error rather than a machine running backwards. The server owns that
 * judgement; this form simply says so next to the input rather than guessing on its behalf.
 */
function RecordReading({
  asset,
  onDone,
}: {
  asset: AssetRow;
  onDone: (saved: boolean) => void;
}): React.JSX.Element {
  const current = energyMeters(asset)[0];
  const [value, setValue] = useState("");
  const [at, setAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FailureNotice | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(): Promise<void> {
    if (busy) return;
    setFailure(null);
    setBusy(true);
    try {
      await api.post(plantOpsApi.assetReadingsPath(asset.assetCode), {
        meterType: "kwh",
        readingValue: Number(value),
        readingAt: new Date(at).toISOString(),
        source: "manual",
      });
      setSaved(true);
      onDone(true);
    } catch (error) {
      setFailure(describeFailure(error, "reading"));
    } finally {
      setBusy(false);
    }
  }

  const parsed = Number(value);
  const usable = value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
  const backwards = usable && current !== undefined && parsed < current.currentValue;

  return (
    <Can
      permission="mnt.meter.write"
      fallback={
        <p className="text-[12px] text-[var(--text-muted)]">
          Recording a meter reading needs <code>mnt.meter.write</code>.
        </p>
      }
    >
      <div className="x-home-panel">
        <div className="x-home-panel-head">
          <div>
            <h2 className="x-section-heading">
              Record a kWh reading for {asset.assetCode}
            </h2>
            <p>
              {current
                ? `The counter currently stands at ${num(current.currentValue, 2)} ${current.uom}.`
                : "This machine has no kWh meter on record."}{" "}
              Readings are appended, never overwritten.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="x-field">
              Counter reading
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="The number on the meter"
                aria-label="Counter reading"
              />
              <small>
                The cumulative figure on the display, not the consumption since last time.
              </small>
            </label>
            <label className="x-field">
              Read at
              <input
                type="datetime-local"
                value={at}
                onChange={(event) => setAt(event.target.value)}
                aria-label="Time the meter was read"
              />
              <small>When the meter was read, not when it is being typed in.</small>
            </label>
          </div>

          {backwards ? (
            <div className="x-notice" data-tone="warning">
              <div>
                That is lower than the counter already on record. A kWh counter does not go
                backwards, so this is usually a transcription error — the server will decide,
                and will say why if it refuses.
              </div>
            </div>
          ) : null}

          {failure ? (
            <div
              role="alert"
              className="rounded-[var(--radius-control)] border border-[var(--bad)] bg-[var(--bad-soft)] px-3 py-2.5 text-[12.5px] leading-5 text-[var(--bad-ink)]"
            >
              <p className="font-semibold">{failure.title}</p>
              {failure.body ? <p className="mt-0.5 opacity-90">{failure.body}</p> : null}
              {failure.checklist.map((line) => (
                <p key={line} className="mt-0.5 opacity-90">
                  {line}
                </p>
              ))}
            </div>
          ) : null}

          {saved ? (
            <div className="x-notice">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              <div>
                Recorded. A second reading is what turns a counter into a rate, so the per-day
                figure for {asset.assetCode} may appear only after the next one.
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-pri"
              disabled={busy || !usable}
              onClick={() => void submit()}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Zap className="h-3.5 w-3.5" aria-hidden />
              )}
              Record the reading
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onDone(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Can>
  );
}

function Tile({
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
      <span className="x-stat-top">
        {label}
        <Zap className="h-4 w-4" aria-hidden />
      </span>
      <strong className="x-stat-value">{value}</strong>
      <p className="x-stat-hint">{hint}</p>
    </div>
  );
}
