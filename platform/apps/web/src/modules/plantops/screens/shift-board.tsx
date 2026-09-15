"use client";

import { useMemo } from "react";
import { Activity, AlertTriangle, RefreshCw, Timer, TrendingUp } from "lucide-react";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { dateTime, humanise, num, relativeDays } from "@spine/format";
import { useAccess } from "@spine/access/permissions";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type {
  DowntimeRow,
  FactoryProductionView,
  MwoRow,
  ParetoRow,
  ProductionOrderRow,
} from "../api";
import { elapsedSince, numeric, plantOpsApi, REPORT_WINDOW_DAYS, windowOf } from "../api";

/**
 * THE SHIFT BOARD — the first five minutes of a supervisor's shift.
 *
 * The question this screen answers is not "how is the plant performing", which is a
 * quarterly question with a report attached. It is "what do I have to deal with before
 * anybody asks me", and that has four parts: what is stopped, what is still to make, where
 * the lost hours have been going, and which jobs are late and whose they are.
 *
 * WHAT IT REFUSES TO SHOW, AND WHY THAT IS THE MOST IMPORTANT DECISION HERE.
 *
 * Every shift board ever demonstrated leads with "output today against target". This one
 * does not, because the data cannot support it: a production order in this system carries
 * no due date, no shift and no daily plan. The only timestamps on it are when it was raised
 * and when it was last changed — and "last changed" moves when somebody edits a warehouse.
 * Summing produced quantity for orders touched today and calling it today's output would be
 * wrong by exactly the amount that makes it dangerous: close enough to be believed.
 *
 * So the board shows the OPEN BOOK instead — every live order's made-against-committed,
 * which is exactly true — and says out loud, once, why the daily figure is absent. The fix
 * is a due date on a production order, not a clever reading of `updatedAt` here.
 *
 * PERMISSIONS ARE CHECKED BEFORE EACH REQUEST, not after. A panel the viewer may not see is
 * never fetched (`useQuery(null)`), so somebody without the reliability report gets a board
 * with one fewer panel rather than a 403 rendered as a broken screen.
 */
export default function ShiftBoardScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const window = useMemo(() => windowOf(REPORT_WINDOW_DAYS), []);

  // Open intervals only, with NO date window: a machine stopped six weeks ago is still
  // stopped, and a windowed query would quietly drop the worst row on the board.
  const stops = useQuery<DowntimeRow[]>(plantOpsApi.downtimePath, { query: { open: "true" } });
  const orders = useCursorList<ProductionOrderRow>(plantOpsApi.productionOrdersPath, { limit: 50 });
  const jobs = useQuery<MwoRow[]>(can("mnt.mwo.read") ? plantOpsApi.workOrdersPath : null);
  const losses = useQuery<ParetoRow[]>(
    can("mnt.report.read") ? plantOpsApi.downtimeParetoPath : null,
    { query: { scopeType: "tenant", from: window.from, to: window.to } },
  );
  const floor = useQuery<FactoryProductionView>(
    can("production.factory-connect.read") ? plantOpsApi.factoryProductionViewPath : null,
  );

  const openStops = useMemo(
    () => (stops.data ?? []).filter((row) => row.endedAt === null),
    [stops.data],
  );
  const liveOrders = useMemo(
    () => orders.rows.filter((row) => !FINISHED.has(row.status.toLowerCase())),
    [orders.rows],
  );
  const lateJobs = useMemo(
    () =>
      (jobs.data ?? [])
        .filter((row) => row.slaBreached && !FINISHED.has(row.status.toLowerCase()))
        .sort((a, b) => (a.slaRestoreBy ?? "").localeCompare(b.slaRestoreBy ?? "")),
    [jobs.data],
  );

  // Committed and made across the live book. Quantities arrive as NUMERIC strings; an
  // unreadable one is counted as unreadable rather than as zero.
  const book = liveOrders.reduce(
    (acc, row) => {
      const target = numeric(row.qtyToProduce);
      const made = numeric(row.producedQty);
      if (target === null || made === null) return { ...acc, unreadable: acc.unreadable + 1 };
      return { ...acc, target: acc.target + target, made: acc.made + made, unreadable: acc.unreadable };
    },
    { target: 0, made: 0, unreadable: 0 },
  );

  const impacting = openStops.filter((row) => row.productionImpacting).length;
  const unowned = openStops.filter((row) => row.mwoId === null).length;
  const machines = floor.data?.assets ?? [];
  const reporting = machines.filter((row) => !row.evidenceStale);

  function reloadAll(): void {
    stops.reload();
    orders.reload();
    jobs.reload();
    losses.reload();
    floor.reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Shift board"
        subtitle="What is stopped, what is still to make, where the lost hours went, and which jobs are late."
        meta={[
          { label: "Stopped now", value: num(openStops.length) },
          { label: "Open orders", value: num(liveOrders.length) },
          ...(can("mnt.mwo.read") ? [{ label: "Jobs late", value: num(lateJobs.length) }] : []),
        ]}
        actions={
          <button type="button" className="btn btn-secondary btn-sm" onClick={reloadAll}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Refresh
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Stopped right now"
          icon={<Timer className="h-4 w-4" aria-hidden />}
          value={stops.loading ? "…" : num(openStops.length)}
          hint={
            openStops.length === 0
              ? "Every machine with a downtime interval has an end time on it."
              : `${num(impacting)} stopping production · ${num(unowned)} with no maintenance job raised`
          }
        />
        <Stat
          label="Made against committed"
          icon={<TrendingUp className="h-4 w-4" aria-hidden />}
          value={
            orders.loading
              ? "…"
              : liveOrders.length === 0
                ? "No open orders"
                : `${num(book.made)} / ${num(book.target)}`
          }
          hint={`Across ${num(liveOrders.length)} open production order${
            liveOrders.length === 1 ? "" : "s"
          }. Not a daily figure — see the note below.${
            book.unreadable > 0 ? ` ${num(book.unreadable)} order(s) had an unreadable quantity.` : ""
          }`}
        />
        <Stat
          label="Jobs past their deadline"
          icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
          value={can("mnt.mwo.read") ? (jobs.loading ? "…" : num(lateJobs.length)) : "Not visible"}
          hint={
            can("mnt.mwo.read")
              ? "The server's finding against a restore deadline derived from each machine's criticality."
              : "Needs mnt.mwo.read."
          }
        />
        <Stat
          label="Machines reporting"
          icon={<Activity className="h-4 w-4" aria-hidden />}
          value={
            can("production.factory-connect.read")
              ? floor.loading
                ? "…"
                : machines.length === 0
                  ? "None connected"
                  : `${num(reporting.length)} / ${num(machines.length)}`
              : "Not visible"
          }
          hint={
            can("production.factory-connect.read")
              ? machines.length === 0
                ? "No machine is bound to a gateway on this tenant."
                : `${num(reporting.filter((row) => row.state === "running").length)} of the reporting machines are running. A machine that is not reporting is not counted as anything.`
              : "Needs production.factory-connect.read."
          }
        />
      </div>

      {/* Said once, plainly, rather than left for somebody to discover by trusting a number
          that was never there. */}
      <div className="x-notice" data-tone="warning">
        <div>
          <p>
            <strong>There is no output-against-target figure on this board.</strong> A
            production order in this system carries no due date and no shift, so nothing here
            can say which of the quantity above was made today. The figures shown are the live
            book: every open order&rsquo;s produced quantity against what it was raised for.
          </p>
        </div>
      </div>

      <h2 className="x-section-heading">Stopped right now</h2>
      <DataTable
        rows={openStops}
        columns={STOP_COLUMNS}
        loading={stops.loading}
        error={stops.error}
        onReload={stops.reload}
        rowKey={(row) => row.id}
        caption="Open downtime intervals with the machine, how long it has been stopped and whether a job owns it"
        empty={
          <Empty
            title="Nothing is stopped"
            body="Every downtime interval recorded against a machine has an end time on it. A machine appears here the moment a stop is opened against it, and leaves when somebody says when it came back."
          />
        }
      />

      <h2 className="x-section-heading">Open production orders</h2>
      <DataTable
        rows={liveOrders}
        columns={ORDER_COLUMNS}
        loading={orders.loading}
        loadingMore={orders.loadingMore}
        error={orders.error}
        hasMore={orders.hasMore}
        onLoadMore={orders.loadMore}
        onReload={orders.reload}
        rowKey={(row) => row.id}
        caption="Open production orders with quantity made against quantity committed"
        empty={
          <Empty
            title="No production order is open"
            body="Completed and cancelled orders are hidden here. An order appears the moment it is raised, whether or not any material has been issued to it."
          />
        }
      />

      {can("mnt.report.read") ? (
        <>
          <h2 className="x-section-heading">
            Where the lost hours went &mdash; last {REPORT_WINDOW_DAYS} days
          </h2>
          <DataTable
            rows={losses.data ?? []}
            columns={LOSS_COLUMNS}
            loading={losses.loading}
            error={losses.error}
            onReload={losses.reload}
            rowKey={(row) => row.key}
            caption="Downtime hours by reason code over the reporting window"
            empty={
              <Empty
                title="No downtime was recorded in this window"
                body={`Nothing stopped between ${window.from} and ${window.to}, or nothing that stopped was given a reason code. Reason codes are set when a stop is recorded, not afterwards.`}
              />
            }
          />
        </>
      ) : null}

      {can("mnt.mwo.read") ? (
        <>
          <h2 className="x-section-heading">Jobs past their restore deadline</h2>
          <DataTable
            rows={lateJobs}
            columns={JOB_COLUMNS}
            loading={jobs.loading}
            error={jobs.error}
            onReload={jobs.reload}
            rowKey={(row) => row.id}
            caption="Maintenance jobs the server has marked as past their restore deadline, with the technician assigned"
            empty={
              <Empty
                title="No job is past its deadline"
                body="Every live maintenance job is either inside the restore time derived from its machine's criticality, or has no deadline set."
              />
            }
          />
        </>
      ) : null}
    </div>
  );
}

/** Statuses that take a document off the live board. Lower-cased before comparison. */
const FINISHED = new Set(["completed", "cancelled", "canceled", "closed"]);

/* -------------------------------- columns ---------------------------------- */

const STOP_COLUMNS: ReadonlyArray<Column<DowntimeRow>> = [
  {
    key: "asset",
    header: "Machine",
    width: "w-56",
    render: (row) => (
      <div className="min-w-0">
        <div className="font-semibold text-[var(--text-primary)]">{row.assetCode}</div>
        <div className="truncate text-[12px] text-[var(--text-secondary)]">{row.assetName}</div>
      </div>
    ),
  },
  {
    key: "since",
    header: "Stopped for",
    width: "w-44",
    render: (row) => {
      // Elapsed time, not a duration. `durationMinutes` is null while a stop is open, and
      // this column says how long the clock has been running — not how long the stop was.
      const elapsed = elapsedSince(row.startedAt);
      return (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">
            {elapsed ? elapsed.text : "Start time unreadable"}
          </div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            since {dateTime(row.startedAt)}
          </div>
        </div>
      );
    },
  },
  {
    key: "reason",
    header: "Reason",
    render: (row) => (
      <div className="min-w-0">
        <div>{row.reasonCode ? humanise(row.reasonCode) : "No reason recorded"}</div>
        <div className="text-[12px] text-[var(--text-secondary)]">
          {humanise(row.kind)} · recorded by {humanise(row.source)}
        </div>
      </div>
    ),
  },
  {
    key: "owner",
    header: "Owned by a job",
    width: "w-52",
    render: (row) =>
      row.mwoId ? (
        <StatusBadge tone="progress" label="Job raised" />
      ) : (
        // The fact the whole board exists for: the clock is running and nobody owns it.
        <div className="min-w-0">
          <StatusBadge tone="overdue" label="No job" />
          <div className="mt-1 text-[12px] text-[var(--text-secondary)]">
            Nobody is assigned and no restore deadline is running.
          </div>
        </div>
      ),
  },
  {
    key: "impact",
    header: "Production",
    width: "w-36",
    render: (row) =>
      row.productionImpacting ? (
        <StatusBadge tone="rejected" label="Stopped" />
      ) : (
        <StatusBadge tone="unknown" label="Not impacting" />
      ),
  },
];

const ORDER_COLUMNS: ReadonlyArray<Column<ProductionOrderRow>> = [
  {
    key: "orderNo",
    header: "Order",
    width: "w-40",
    render: (row) => (
      <div className="min-w-0">
        <div className="font-semibold text-[var(--text-primary)]">{row.orderNo}</div>
        <div className="text-[12px] text-[var(--text-secondary)]">
          raised {relativeDays(row.createdAt)}
        </div>
      </div>
    ),
  },
  {
    key: "item",
    header: "Making",
    render: (row) => (
      <div className="min-w-0">
        <div>{row.itemCode ?? "Item code unresolved"}</div>
        <div className="truncate text-[12px] text-[var(--text-secondary)]">
          {row.itemName ?? "The item master could not name this part"}
        </div>
      </div>
    ),
  },
  {
    key: "made",
    header: "Made / committed",
    numeric: true,
    width: "w-48",
    render: (row) => {
      const made = numeric(row.producedQty);
      const target = numeric(row.qtyToProduce);
      if (made === null || target === null) {
        return <span className="text-[var(--text-secondary)]">Quantity unreadable</span>;
      }
      return (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">
            {num(made, 3)} / {num(target, 3)}
          </div>
          <div className="text-[12px] text-[var(--text-secondary)]">{row.uom ?? "unit unavailable"}</div>
        </div>
      );
    },
  },
  {
    key: "status",
    header: "Status",
    width: "w-40",
    render: (row) => <StatusBadge status={row.status} />,
  },
];

const LOSS_COLUMNS: ReadonlyArray<Column<ParetoRow>> = [
  {
    key: "label",
    header: "Reason",
    render: (row) => (
      <div className="min-w-0">
        <div className="font-semibold text-[var(--text-primary)]">{row.label}</div>
        <div className="font-[var(--font-mono)] text-[11px] text-[var(--text-muted)]">{row.key}</div>
      </div>
    ),
  },
  { key: "hours", header: "Hours lost", numeric: true, width: "w-36", render: (row) => num(row.hours, 1) },
  { key: "count", header: "Stoppages", numeric: true, width: "w-32", render: (row) => num(row.count) },
  {
    key: "evidence",
    header: "Evidence",
    width: "w-56",
    // The interval ids behind the figure. A total nobody can trace back to rows is a total
    // that gets argued with instead of acted on.
    render: (row) => (
      <span className="text-[12px] text-[var(--text-secondary)]">
        {num(row.ids.length)} downtime interval{row.ids.length === 1 ? "" : "s"}
      </span>
    ),
  },
];

const JOB_COLUMNS: ReadonlyArray<Column<MwoRow>> = [
  {
    key: "mwoNo",
    header: "Job",
    width: "w-40",
    render: (row) => (
      <div className="min-w-0">
        <div className="font-semibold text-[var(--text-primary)]">{row.mwoNo}</div>
        <div className="text-[12px] text-[var(--text-secondary)]">{humanise(row.mwoType)}</div>
      </div>
    ),
  },
  {
    key: "asset",
    header: "Machine",
    width: "w-48",
    render: (row) => (
      <div className="min-w-0">
        <div>{row.assetCode}</div>
        <div className="truncate text-[12px] text-[var(--text-secondary)]">{row.assetName}</div>
      </div>
    ),
  },
  { key: "title", header: "Job", render: (row) => row.title },
  {
    key: "owner",
    header: "Assigned to",
    width: "w-56",
    render: (row) =>
      row.primaryTechRef ? (
        <span className="font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]">
          {row.primaryTechRef}
        </span>
      ) : (
        <StatusBadge tone="overdue" label="Nobody" />
      ),
  },
  {
    key: "restoreBy",
    header: "Was due back",
    width: "w-52",
    render: (row) => {
      if (row.slaRestoreBy === null) {
        return <span className="text-[var(--text-secondary)]">No deadline set</span>;
      }
      const late = elapsedSince(row.slaRestoreBy);
      return (
        <div className="min-w-0">
          <div>{dateTime(row.slaRestoreBy)}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            {late ? `${late.text} ago` : relativeDays(row.slaRestoreBy)}
          </div>
        </div>
      );
    },
  },
  {
    key: "state",
    header: "State",
    width: "w-48",
    render: (row) => (
      <div className="flex flex-wrap items-center gap-1">
        <StatusBadge status={row.status} />
        {row.isSafetyRelated ? <StatusBadge tone="rejected" label="Safety" /> : null}
        {/* The machine is still stopped even though the job is open — the two clocks are
            separate, and this is the one production cares about. */}
        {row.openDowntimeId ? <StatusBadge tone="overdue" label="Machine still down" /> : null}
      </div>
    ),
  },
];

/* --------------------------------- pieces ---------------------------------- */

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="x-stat-card">
      <span className="x-stat-top">
        {label}
        {icon}
      </span>
      <strong className="x-stat-value">{value}</strong>
      <p className="x-stat-hint">{hint}</p>
    </div>
  );
}
