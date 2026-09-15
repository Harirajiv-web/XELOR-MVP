"use client";

import { useMemo, useState } from "react";
import { CircleAlert, Ruler, Search } from "lucide-react";
import { Can } from "@spine/access/permissions";
import { DataTable, type Column } from "@spine/data/data-table";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { date, dateTime, humanise, num } from "@spine/format";
import type { ScreenProps } from "@spine/registry/manifest";
import { PageHeader } from "@spine/shell/page-header";
import { Empty } from "@spine/states";
import { Disclosure } from "@spine/ui/disclosure";
import { StatusBadge } from "@spine/ui/status-badge";
import type { SafetyAsset, SafetyInspectionSummary } from "../api";
import { isStatutoryExamined, safetyApi, statutoryClassLabel } from "../api";

/**
 * GAUGES & EXAMINED EQUIPMENT — and a refusal, written down.
 *
 * WHAT THIS SCREEN WAS ASKED FOR, AND WHY IT IS NOT THAT.
 *
 * The brief for this screen is a gauge register with validity dates, an overdue state, and
 * the back-trace ISO 9001 7.1.5.2 requires: when an instrument is found out of tolerance,
 * you must determine whether the measurements it already took were affected, which means
 * knowing which measurements those were.
 *
 * Neither half exists in this build, and both absences are total rather than partial:
 *
 *   - NO CALIBRATION DUE DATE. `maintenance_asset` records make, model, serial number,
 *     commissioning date, warranty end and a statutory examination CLASS. It records no
 *     calibration date, no examination date, and no next-due date of any kind. There is
 *     therefore no date to compare today against, and no gauge on this screen can honestly
 *     be shown as in date or overdue.
 *   - NO INSPECTION-TO-GAUGE LINK. `qms_inspection_reading` stores the value, the limits
 *     that applied at the time, the deviation and the verdict. `qms_inspection` stores the
 *     inspector. Neither stores the instrument. The back-trace from a failed gauge to the
 *     lots it passed cannot be produced from this data at all.
 *
 * The tempting thing to do here is to reach for the nearest date-shaped column — an AMC
 * contract's `validTo`, say — and colour a row red when it passes. That would be worse than
 * this screen: an overdue chip that is really a maintenance-contract expiry is a wrong
 * answer delivered confidently, in the one place where a wrong answer means a customer is
 * shipped parts measured with a gauge nobody checked.
 *
 * So the register renders from the real asset master, every claim it cannot support is
 * stated in words on the screen rather than in a comment, and the manifest raises NO ALERT
 * about calibration — because a silent bell would be read as "everything is in date".
 */
export default function CalibrationScreen(_props: ScreenProps): React.JSX.Element {
  const assets = useQuery<SafetyAsset[]>(safetyApi.assetsPath);
  const [filter, setFilter] = useState("");
  const [examinedOnly, setExaminedOnly] = useState(false);

  const all = useMemo(() => assets.data ?? [], [assets.data]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return all.filter((asset) => {
      if (examinedOnly && !isStatutoryExamined(asset)) return false;
      if (!q) return true;
      return (
        asset.assetCode.toLowerCase().includes(q) ||
        asset.name.toLowerCase().includes(q) ||
        asset.path.toLowerCase().includes(q) ||
        statutoryClassLabel(asset.statutoryClass).toLowerCase().includes(q)
      );
    });
  }, [all, filter, examinedOnly]);

  const examined = all.filter(isStatutoryExamined);
  const staleMeters = all.filter((asset) => asset.meters.some((meter) => meter.stale));

  const columns: ReadonlyArray<Column<SafetyAsset>> = [
    {
      key: "code",
      header: "Code",
      width: "w-36",
      render: (asset) => (
        <span className="font-[var(--font-mono)] font-semibold text-[var(--text-primary)]">
          {asset.assetCode}
        </span>
      ),
    },
    {
      key: "name",
      header: "Equipment",
      render: (asset) => (
        <div>
          <b className="text-[var(--text-primary)]">{asset.name}</b>
          <p className="text-[11px] text-[var(--text-muted)]">{asset.path}</p>
        </div>
      ),
    },
    {
      key: "kind",
      header: "Kind",
      width: "w-36",
      render: (asset) => (
        <div>
          <p>{humanise(asset.assetType)}</p>
          <p className="text-[11px] text-[var(--text-muted)]">
            {asset.criticality ? `Criticality ${asset.criticality}` : "No criticality set"}
          </p>
        </div>
      ),
    },
    {
      key: "statutory",
      header: "Periodic examination class",
      width: "w-56",
      render: (asset) =>
        isStatutoryExamined(asset) ? (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge tone="pending" status="examined" label="Examined class" />
            <span className="text-[11px] text-[var(--text-secondary)]">
              {statutoryClassLabel(asset.statutoryClass)}
            </span>
          </div>
        ) : (
          <span className="text-[var(--text-muted)]">Not classified</span>
        ),
    },
    {
      key: "validity",
      header: "Calibration validity",
      width: "w-52",
      // The only column on the screen that matters to the brief, and it says the same thing
      // on every row on purpose. A blank cell would read as "nothing to report".
      render: () => (
        <span className="text-[var(--text-muted)]">Not recorded anywhere in this build</span>
      ),
    },
    {
      key: "meters",
      header: "Counters",
      width: "w-48",
      render: (asset) =>
        asset.meters.length === 0 ? (
          <span className="text-[var(--text-muted)]">None</span>
        ) : (
          <div className="flex flex-col items-start gap-1">
            {asset.meters.map((meter) => (
              <span key={meter.meterType} className="text-[11px]">
                <b className="text-[var(--text-primary)]">{humanise(meter.meterType)}</b>{" "}
                <span className="tabular-nums">{num(meter.currentValue, 1)}</span> {meter.uom}
                {meter.stale ? (
                  <span className="ml-1 text-[var(--text-muted)]">
                    · last real reading {date(meter.lastRealReadingAt)}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Gauges & examined equipment"
        subtitle="The equipment register, with every claim it cannot support named on the screen."
        meta={
          all.length
            ? [
                { label: "Equipment", value: num(all.length) },
                { label: "Under periodic examination", value: num(examined.length) },
                { label: "With a stale counter", value: num(staleMeters.length) },
                { label: "With a calibration date", value: "0" },
              ]
            : []
        }
      />

      <NoValidityBanner />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 max-w-sm flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by code, name, location or class…"
            aria-label="Filter the equipment register"
            className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
        <label className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={examinedOnly}
            onChange={(event) => setExaminedOnly(event.target.checked)}
          />
          Only equipment under a periodic-examination class
        </label>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={assets.loading}
        error={assets.error}
        onReload={assets.reload}
        rowKey={(asset) => asset.id}
        caption="Equipment register, with Factories Act periodic-examination classes"
        empty={
          filter || examinedOnly ? (
            <Empty
              title="Nothing matches"
              body="No equipment matched that filter. A measuring instrument only appears here if somebody recorded it as an asset — there is no separate gauge register in this build."
            />
          ) : (
            <Empty
              title="No equipment recorded"
              body="This register reads the maintenance asset master. Gauges are not a distinct record type in this build: an instrument appears here only if it was recorded as an asset like any other."
            />
          )
        }
      />

      <Can permission="quality.inspection.read">
        <BackTracePanel />
      </Can>

      <Disclosure title="What this screen does not do, and why not">
        <ul className="ml-4 list-disc space-y-2">
          <li>
            <b>No calibration due dates, and so no overdue state.</b> The equipment record has no
            calibration or examination date of any kind. Nothing here is shown as in date, and nothing
            is shown as overdue, because there is no date to compare today against.
          </li>
          <li>
            <b>No alert, deliberately.</b> This module raises no calibration warning at all. A bell
            that stayed quiet because no date existed would be read as every gauge being in date, and
            an alert that is wrong in the reassuring direction is worse than none.
          </li>
          <li>
            <b>No back-trace.</b> ISO 9001 7.1.5.2 asks what happens to earlier results when an
            instrument is found out of tolerance. A recorded reading stores the value, the limits that
            applied and the inspector — never the instrument. The link does not exist, and it is not
            guessable from what is stored.
          </li>
          <li>
            <b>No SPC, Cp, Cpk or MSA.</b> Not omitted for time: a capability index computed from an
            unqualified measurement system is a number that looks like proof and is not. Stable
            characteristic definitions and a measurement-system study come first. Where this product
            shows readings at all, it calls them recorded readings.
          </li>
          <li>
            <b>Nothing here is certification.</b> A periodic-examination class says which regime a
            machine falls under. It does not say an examination happened, and no screen in this module
            asserts compliance with ISO 9001, IATF 16949 or the Factories Act.
          </li>
        </ul>
      </Disclosure>
    </div>
  );
}

function NoValidityBanner(): React.JSX.Element {
  return (
    <div className="x-notice" data-tone="warning" role="note">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">
          No calibration or examination date is recorded against equipment in this build.
        </p>
        <p>
          That is why the validity column says the same thing on every row and why nothing here is
          coloured overdue. Whatever schedule this plant keeps for its gauges and its §28, §29 and §31
          examinations, this system does not hold it and cannot tell you that anything is due. Treat
          the list below as a register of what exists, and nothing more.
        </p>
      </div>
    </div>
  );
}

/**
 * THE BACK-TRACE, SIZED RATHER THAN FAKED.
 *
 * The question ISO 9001 7.1.5.2 makes somebody answer is "which results did this gauge
 * produce since it was last known good". This build cannot answer it, because no reading
 * records an instrument.
 *
 * What it CAN do is say honestly how big the manual job would be. The completed inspections
 * below are the whole population somebody would have to review by hand, with the earliest
 * and latest dates that bound it. That is a real count of real rows, it is useful the first
 * time a gauge is found out of tolerance, and it is emphatically not a back-trace — which
 * is why the heading says so twice.
 */
function BackTracePanel(): React.JSX.Element {
  const inspections = useCursorList<SafetyInspectionSummary>(safetyApi.inspectionsPath, {
    limit: safetyApi.pageSize,
  });

  const completed = inspections.rows.filter((row) => row.status === "completed");
  const dates = completed
    .map((row) => row.completedAt)
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort();
  const earliest = dates[0] ?? null;
  const latest = dates[dates.length - 1] ?? null;
  const inspectors = new Set(
    completed.map((row) => row.inspectorRef).filter((value): value is string => Boolean(value)),
  );

  return (
    <section className="x-home-panel" aria-labelledby="back-trace">
      <div className="x-home-panel-head flex-wrap gap-3">
        <div>
          <h2 id="back-trace" className="x-section-heading">
            If a gauge is found out of tolerance — the manual review, sized
          </h2>
          <p>
            This is not a back-trace. It is the number of completed inspections somebody would have to
            review by hand, because no reading records which instrument took it.
          </p>
        </div>
        <Ruler className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
      </div>

      <div className="space-y-5 p-5">
        {inspections.error ? (
          <p className="text-[13px] text-[var(--text-secondary)]">
            The inspection list could not be read, so the size of the review cannot be stated.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label="Completed inspections"
                value={inspections.loading ? "…" : num(completed.length)}
                hint={
                  inspections.hasMore
                    ? `at least this many — the first ${safetyApi.pageSize} were read`
                    : "the whole population to review"
                }
              />
              <Stat
                label="Earliest"
                value={earliest ? date(earliest) : "—"}
                hint={earliest ? dateTime(earliest) : "No completed inspection recorded"}
              />
              <Stat
                label="Latest"
                value={latest ? date(latest) : "—"}
                hint={latest ? dateTime(latest) : "No completed inspection recorded"}
              />
              <Stat
                label="Distinct inspectors"
                value={num(inspectors.size)}
                hint="Who took the readings. The instrument they used is not recorded."
              />
            </div>

            <div className="x-notice" data-tone="warning" role="note">
              <div>
                <p className="font-semibold">Why this cannot be narrowed to one gauge.</p>
                <p>
                  A recorded reading stores the measured value, the specification limits that applied
                  at the moment of measurement, the deviation and the pass/fail verdict. It does not
                  store the instrument, and neither does the inspection header. Narrowing the review to
                  the lots one gauge touched needs an inspection-to-gauge link that this build does not
                  have — adding it is a schema change, not a screen change, and no screen should paper
                  over that by guessing.
                </p>
              </div>
            </div>

            {inspections.hasMore ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={inspections.loadingMore}
                onClick={inspections.loadMore}
              >
                {inspections.loadingMore ? "Reading…" : "Read more inspections"}
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function Stat({
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
