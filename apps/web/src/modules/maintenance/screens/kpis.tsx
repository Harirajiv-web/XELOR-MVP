"use client";

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty, ErrorState, Loading } from "@spine/states";
import { date, dateTime, inr, inrShort, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import type { ScreenProps } from "@spine/registry/manifest";
import type { KpiResponse, ParetoRow } from "../api";
import { defaultWindow, maintenanceApi } from "../api";

const SCOPES = [
  { value: "tenant", label: "The whole company" },
  { value: "plant", label: "One plant (and everything under it)" },
  { value: "area", label: "One area (and everything under it)" },
  { value: "asset", label: "One machine" },
] as const;

/**
 * RELIABILITY KPIs — the numbers a plant manager judges the maintenance team on.
 *
 * Three rules, and they are the whole screen:
 *
 *   A NUMBER THAT CANNOT HONESTLY BE COMPUTED IS NOT SHOWN AS A NUMBER. Availability
 *   without a shift calendar has no denominator; MTBF with no failures has no divisor. The
 *   server returns null for those and a note saying why, and this screen renders the note.
 *   A believable wrong figure is worse than a missing one, because nobody checks it.
 *
 *   EVERY ABBREVIATION IS PAIRED WITH THE EXACT FIGURE. ₹4.20 L is what fits on a tile;
 *   ₹4,20,318.00 is what somebody reconciles against. Both, always, on the same tile.
 *
 *   THE FORMULA IS ON THE SCREEN. "Your MTBF is wrong" is an argument that ends the moment
 *   the arithmetic is visible next to the answer, which is why the server ships the formulas
 *   and the input counts alongside the numbers rather than only the numbers.
 *
 * `from` and `to` are REQUIRED by both endpoints — they are validated against `YYYY-MM-DD`
 * and the request fails without them — so the window is always sent and always visible.
 */
export default function KpisScreen(_props: ScreenProps): React.JSX.Element {
  const [window, setWindow] = useState(defaultWindow);
  const [scopeType, setScopeType] = useState("tenant");
  const [scopeCode, setScopeCode] = useState("");
  const [scheduledHours, setScheduledHours] = useState("");

  const query = {
    scopeType,
    scopeCode: scopeType === "tenant" ? undefined : scopeCode.trim() || undefined,
    from: window.from,
    to: window.to,
    scheduledHours: scheduledHours.trim() || undefined,
  };

  const kpi = useQuery<KpiResponse>(maintenanceApi.kpisPath, { query });
  const pareto = useQuery<ParetoRow[]>(maintenanceApi.downtimeParetoPath, { query });

  const paretoRows = pareto.data ?? [];
  const paretoHours = paretoRows.reduce((a, r) => a + r.hours, 0);

  const paretoColumns: ReadonlyArray<Column<ParetoRow>> = [
    {
      key: "label",
      header: "Reason",
      render: (r) => <span className="font-semibold">{r.label}</span>,
    },
    {
      key: "hours",
      header: "Hours lost",
      numeric: true,
      width: "w-40",
      render: (r) => (
        <div>
          <div className="font-semibold">{num(r.hours, 2)} h</div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            {num(Math.round(r.hours * 60))} min exactly
          </div>
        </div>
      ),
    },
    {
      key: "count",
      header: "Stops",
      numeric: true,
      width: "w-28",
      render: (r) => num(r.count),
    },
    {
      key: "share",
      header: "Share of the loss",
      numeric: true,
      width: "w-40",
      // Computed from the rows on screen, so the shares and the hours can never disagree.
      render: (r) =>
        paretoHours > 0 ? `${num((r.hours / paretoHours) * 100, 1)}%` : "—",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reliability KPIs"
        subtitle="How much production time the plant lost, how often machines failed, how long they took to fix, and what it cost — all computed from the downtime ledger, not entered by anyone."
        meta={
          kpi.data
            ? [
                { label: "Scope", value: kpi.data.scope.label },
                {
                  label: "Period",
                  value: `${date(kpi.data.period.start)} to ${date(kpi.data.period.end)}`,
                },
              ]
            : []
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        <Field label="From">
          <input
            type="date"
            value={window.from}
            onChange={(e) => setWindow((w) => ({ ...w, from: e.target.value }))}
            className={CONTROL}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={window.to}
            onChange={(e) => setWindow((w) => ({ ...w, to: e.target.value }))}
            className={CONTROL}
          />
        </Field>
        <Field label="Scope">
          <select
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value)}
            className={CONTROL}
          >
            {SCOPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        {scopeType !== "tenant" ? (
          <Field label="Asset code">
            <input
              type="search"
              value={scopeCode}
              onChange={(e) => setScopeCode(e.target.value)}
              placeholder="Asset code, exactly"
              className={CONTROL}
            />
          </Field>
        ) : null}
        <Field label="Scheduled hours">
          <input
            type="number"
            min={0}
            value={scheduledHours}
            onChange={(e) => setScheduledHours(e.target.value)}
            placeholder="from the shift calendar"
            className={CONTROL}
          />
        </Field>
      </div>

      {kpi.loading ? <Loading label="Computing the window…" /> : null}
      {kpi.error ? <ErrorState error={kpi.error} onRetry={kpi.reload} /> : null}

      {kpi.data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="Unplanned downtime"
              value={`${num(kpi.data.downtimeUnplannedHours, 2)} h`}
              exact={`${num(Math.round(kpi.data.downtimeUnplannedHours * 60))} minutes`}
            />
            <Tile
              label="Planned downtime"
              value={`${num(kpi.data.downtimePlannedHours, 2)} h`}
              exact={`${num(Math.round(kpi.data.downtimePlannedHours * 60))} minutes`}
            />
            <Tile
              label="Failures"
              value={num(kpi.data.failureCount)}
              exact="unplanned stops that hit production"
            />
            <Tile
              label="Operating hours"
              value={kpi.data.operatingHours === null ? null : `${num(kpi.data.operatingHours, 2)} h`}
              missing="Needs the shift calendar — scheduled hours were not supplied."
            />
            <Tile
              label="Mean time between failures"
              value={kpi.data.mtbfHours === null ? null : `${num(kpi.data.mtbfHours, 2)} h`}
              exact={kpi.data.mtbfHours === null ? undefined : `${kpi.data.mtbfHours} hours exactly`}
              missing="Not computable in this window — it needs scheduled hours and at least one failure."
            />
            <Tile
              label="Mean time to repair"
              value={kpi.data.mttrHours === null ? null : `${num(kpi.data.mttrHours, 2)} h`}
              exact={kpi.data.mttrHours === null ? undefined : `${kpi.data.mttrHours} hours exactly`}
              missing="Not computable — no failure was recorded in this window."
            />
            <Tile
              label="Availability"
              value={
                kpi.data.availabilityPct === null ? null : `${num(kpi.data.availabilityPct, 2)}%`
              }
              exact={
                kpi.data.availabilityPct === null
                  ? undefined
                  : `${kpi.data.availabilityPct}% exactly`
              }
              missing="Needs the shift calendar. Assuming 24×7 would produce a believable wrong number."
            />
            <Tile
              label="PM compliance"
              value={
                kpi.data.pmCompliancePct === null ? null : `${num(kpi.data.pmCompliancePct, 2)}%`
              }
              exact={`${num(kpi.data.pmCompletedInGrace)} of ${num(kpi.data.pmDueCount)} services done within grace`}
              missing="No preventive service fell due in this window."
            />
            <Tile
              label="Schedule adherence"
              value={
                kpi.data.scheduleAdherencePct === null
                  ? null
                  : `${num(kpi.data.scheduleAdherencePct, 2)}%`
              }
              missing="No planned job in this window had a planned end to be measured against."
            />
            <Tile
              label="Maintenance cost"
              value={inrShort(kpi.data.cost.total)}
              exact={inr(kpi.data.cost.total)}
            />
            <Tile
              label="Labour and spares"
              value={inrShort(kpi.data.cost.labour + kpi.data.cost.spares)}
              exact={`${inr(kpi.data.cost.labour)} labour, ${inr(kpi.data.cost.spares)} spares`}
            />
            <Tile
              label="Outside contractors"
              value={inrShort(kpi.data.cost.external)}
              exact={inr(kpi.data.cost.external)}
            />
          </div>

          {kpi.data.notes.length > 0 ? (
            <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3">
              <div className="flex gap-2.5">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                <ul className="flex flex-col gap-1 text-[13px] leading-5 text-[var(--text-secondary)]">
                  {kpi.data.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {/* Folded away rather than omitted. Nobody needs the arithmetic until the moment
              somebody disputes a figure — and at that moment they need it immediately. */}
          <details className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-3 text-[13px]">
            <summary className="cursor-pointer font-semibold text-[var(--text-primary)]">
              How each of these was worked out
            </summary>
            <dl className="mt-3 flex flex-col gap-2">
              {Object.entries(kpi.data.formulas).map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
                    {k.replace(/_/g, " ")}
                  </dt>
                  <dd className="break-all font-[var(--font-mono)] text-[12px] text-[var(--text-secondary)]">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[12px] leading-5 text-[var(--text-secondary)]">
              Computed at {dateTime(kpi.data.computedAt)} from{" "}
              {num(kpi.data.inputs.downtimeRowIds.length)} downtime rows,{" "}
              {num(kpi.data.inputs.occurrenceIds.length)} preventive services and{" "}
              {num(kpi.data.inputs.mwoIds.length)} work orders. Scheduled hours:{" "}
              {kpi.data.scheduledHoursSource}.
            </p>
            <p className="mt-1 break-all font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">
              {kpi.data.inputsDigest}
            </p>
          </details>
        </>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
          Where the hours went
        </h2>
        <DataTable
          rows={paretoRows}
          columns={paretoColumns}
          loading={pareto.loading}
          error={pareto.error}
          onReload={pareto.reload}
          rowKey={(r) => r.key}
          caption="Downtime hours grouped by reason, largest first"
          empty={
            <Empty
              title="No downtime to break down"
              body={`Nothing was recorded as stopped between ${date(window.from)} and ${date(window.to)} in this scope, so there are no hours to attribute.`}
            />
          }
        />
      </div>
    </div>
  );
}

const CONTROL =
  "h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]";

function Field({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * One figure. A null `value` renders the `missing` sentence instead of a dash — "why is
 * this blank" is the question a dash always produces, and it is answerable here.
 */
function Tile({
  label,
  value,
  exact,
  missing,
}: {
  label: string;
  value: string | null;
  exact?: string;
  missing?: string;
}): React.JSX.Element {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
        {label}
      </div>
      {value === null ? (
        <p className="mt-1 text-[13px] leading-5 text-[var(--text-secondary)]">
          {missing ?? "Not computable in this window."}
        </p>
      ) : (
        <>
          <div
            className="mt-1 text-[22px] font-bold leading-7 text-[var(--text-primary)]"
            data-numeric=""
          >
            {value}
          </div>
          {exact ? (
            <div className="mt-0.5 text-[12px] text-[var(--text-secondary)]">{exact}</div>
          ) : null}
        </>
      )}
    </div>
  );
}
