"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Lock,
  LogOut,
  Play,
  PlusCircle,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { api } from "@spine/api/client";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { dateTime, humanise, inr, num, relativeDays } from "@spine/format";
import { Can, useAccess } from "@spine/access/permissions";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { AssetRow, FailureNotice, MwoRow, PlantOpsAction, RequestRow } from "../api";
import { describeFailure, elapsedSince, plantOpsApi, rosterFromWorkOrders } from "../api";

/**
 * MAINTENANCE WORK, WITH THE BUTTONS THAT MOVE IT.
 *
 * The Maintenance module already lists these jobs. It cannot start one, hand a machine back,
 * complete a job or close it — that board is a report. THIS screen is the gap the connected
 * package exists to close: the same rows, plus the six actions that make a maintenance
 * system a system rather than a record of what somebody did in a notebook.
 *
 * HOW A JOB IS ACTUALLY CREATED, which is worth stating because it surprises people.
 *
 * There is no "create work order" endpoint, and that is a design decision on the backend
 * rather than an oversight. A maintenance job starts as a REPORT from the floor — an
 * operator saying "this is making a noise" — and becomes a job when the maintenance desk
 * triages it. Keeping the two separate is what preserves the original symptom: reliability
 * analysis reads what the operator said, not what the fitter concluded afterwards, and a
 * system that let you type a diagnosis straight into a work order would destroy the only
 * evidence of the raw fault.
 *
 * So "Report a fault" below posts a request and then triages it, in that order, as two
 * calls — because that is what the server does and pretending otherwise would hide the
 * request from the person who raised it.
 *
 * WHAT THIS SCREEN CANNOT OFFER, and why the inputs look the way they do:
 *
 *   - THE PERSON. Starting a job books somebody's time, and the route wants an employee
 *     UUID. No endpoint reachable with maintenance permissions lists employees, so the
 *     picker offers the people ALREADY recorded against live jobs — recovered from evidence
 *     — and accepts a ref typed in for anybody else. It is explicitly not an employee master.
 *   - THE FAILURE CODES. Completing a breakdown needs a mode, a cause and a detection
 *     method, each resolved against the tenant's own code list, which no route publishes.
 *     They are typed, and a code the server cannot find comes back named.
 *
 * Both are recorded as gaps in `api.ts` rather than papered over here.
 */
export default function PlantWorkOrdersScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const board = useQuery<MwoRow[]>(plantOpsApi.workOrdersPath, {
    query: { status: status || undefined },
  });
  const assets = useQuery<AssetRow[]>(can("mnt.asset.read") ? plantOpsApi.assetsPath : null);

  const rows = useMemo(() => {
    const all = board.data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (row) =>
        row.mwoNo.toLowerCase().includes(q) ||
        row.assetCode.toLowerCase().includes(q) ||
        row.assetName.toLowerCase().includes(q) ||
        row.title.toLowerCase().includes(q),
    );
  }, [board.data, filter]);

  const roster = useMemo(() => rosterFromWorkOrders(board.data ?? []), [board.data]);
  const job = (board.data ?? []).find((row) => row.mwoNo === selected) ?? null;

  const breached = (board.data ?? []).filter((row) => row.slaBreached).length;
  const stoppedMachines = (board.data ?? []).filter((row) => row.openDowntimeId !== null).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Work orders"
        subtitle="Maintenance jobs, and the actions that move them from reported to closed."
        meta={[
          { label: "Jobs", value: num(board.data?.length ?? 0) },
          { label: "Past deadline", value: num(breached) },
          { label: "Machines still down", value: num(stoppedMachines) },
        ]}
        actions={
          <>
            <Can permission={["mnt.request.create", "mnt.request.triage"]}>
              <button
                type="button"
                className="btn btn-pri btn-sm"
                onClick={() => setReporting((open) => !open)}
              >
                <PlusCircle className="h-3.5 w-3.5" aria-hidden />
                {reporting ? "Close the report form" : "Report a fault"}
              </button>
            </Can>
            <button type="button" className="btn btn-secondary btn-sm" onClick={board.reload}>
              <RefreshCw className={`h-3.5 w-3.5 ${board.loading ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </button>
          </>
        }
      />

      {reporting ? (
        <ReportFault
          assets={assets.data ?? []}
          assetsReadable={can("mnt.asset.read")}
          roster={roster}
          onDone={(mwoNo) => {
            setReporting(false);
            board.reload();
            if (mwoNo) setSelected(mwoNo);
          }}
        />
      ) : null}

      {job ? (
        <JobPanel key={job.mwoNo} job={job} roster={roster} onChanged={board.reload} onClose={() => setSelected(null)} />
      ) : null}

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
            placeholder="Filter by job, machine or fault…"
            aria-label="Filter work orders"
            className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Status"
          className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-[13px] text-[var(--text-primary)]"
        >
          {/* The server's own default excludes closed and cancelled. Said out loud, because
              "why is that job missing" is otherwise an exercise for the reader. */}
          <option value="">Live work (closed and cancelled hidden)</option>
          {MWO_STATUSES.map((value) => (
            <option key={value} value={value}>
              {humanise(value)} only
            </option>
          ))}
        </select>
      </div>

      <DataTable
        rows={rows}
        columns={COLUMNS}
        loading={board.loading}
        error={board.error}
        onReload={board.reload}
        rowKey={(row) => row.id}
        onRowClick={(row) => setSelected(row.mwoNo === selected ? null : row.mwoNo)}
        caption="Maintenance work orders with priority, restore deadline, machine state and cost to date"
        empty={
          filter || status ? (
            <Empty
              title="Nothing matches that filter"
              body="No job matched what you asked for. Clear the filter, or switch the status back to live work."
            />
          ) : (
            <Empty
              title="No open maintenance work"
              body="Jobs appear here when a reported fault is triaged into one, or when a preventive schedule falls due and generates one. Report a fault above to start that journey."
            />
          )
        }
      />
    </div>
  );
}

const MWO_STATUSES = [
  "draft",
  "approved",
  "assigned",
  "in_progress",
  "on_hold",
  "completed",
  "closed",
  "cancelled",
] as const;

const COLUMNS: ReadonlyArray<Column<MwoRow>> = [
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
    width: "w-52",
    render: (row) => (
      <div className="min-w-0">
        <div className="text-[var(--text-primary)]">{row.assetCode}</div>
        <div className="truncate text-[12px] text-[var(--text-secondary)]">{row.assetName}</div>
      </div>
    ),
  },
  { key: "title", header: "Fault", render: (row) => row.title },
  {
    key: "priority",
    header: "Priority",
    width: "w-24",
    // A classification, not a state — a neutral chip, so it does not compete with the
    // status column that says what is actually happening.
    render: (row) => <StatusBadge tone="unknown" label={row.priority} />,
  },
  {
    key: "restoreBy",
    header: "Restore by",
    width: "w-48",
    render: (row) =>
      row.slaRestoreBy === null ? (
        <span className="text-[var(--text-secondary)]">No deadline set</span>
      ) : (
        <div className="min-w-0">
          <div>{dateTime(row.slaRestoreBy)}</div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            {relativeDays(row.slaRestoreBy)}
          </div>
        </div>
      ),
  },
  {
    key: "status",
    header: "State",
    width: "w-52",
    render: (row) => (
      <div className="flex flex-wrap items-center gap-1">
        <StatusBadge status={row.status} />
        {row.slaBreached ? <StatusBadge tone="overdue" label="Deadline missed" /> : null}
        {row.isSafetyRelated ? <StatusBadge tone="rejected" label="Safety" /> : null}
        {row.openDowntimeId ? <StatusBadge tone="overdue" label="Machine down" /> : null}
      </div>
    ),
  },
  {
    key: "cost",
    header: "Cost so far",
    numeric: true,
    width: "w-36",
    render: (row) => inr(row.cost.total),
  },
];

/* =============================== the journey ================================ */

/**
 * REPORT A FAULT, AND TURN IT INTO A JOB.
 *
 * Two calls, deliberately visible as two: `POST /maintenance/requests` records what the
 * operator saw, and `POST /maintenance/requests/{no}/triage` decides what to do about it.
 * If the second fails the first still stands — the report is in the queue, the response
 * clock is running against the desk, and this panel says so rather than implying nothing
 * happened.
 *
 * Severity `stopped` OPENS A DOWNTIME CLOCK on the server, or joins the one already
 * running. That is a consequential side effect of a dropdown, so it is stated on the form
 * rather than discovered afterwards from a reliability figure.
 */
function ReportFault({
  assets,
  assetsReadable,
  roster,
  onDone,
}: {
  assets: readonly AssetRow[];
  assetsReadable: boolean;
  roster: readonly string[];
  onDone: (mwoNo: string | null) => void;
}): React.JSX.Element {
  const [assetCode, setAssetCode] = useState("");
  const [severity, setSeverity] = useState<"stopped" | "degraded" | "cosmetic">("degraded");
  const [symptomCode, setSymptomCode] = useState("");
  const [detail, setDetail] = useState("");
  const [reportedBy, setReportedBy] = useState(roster[0] ?? "");
  const [mwoType, setMwoType] = useState<"breakdown" | "corrective">("corrective");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FailureNotice | null>(null);
  const [raised, setRaised] = useState<{ requestNo: string; mwoNo: string | null } | null>(null);

  // Only maintainable things. The server refuses a request against a plant or an area —
  // "the line is broken" is not something a fitter can be sent to — so those are not offered.
  const machines = assets.filter(
    (row) => row.assetType === "machine" || row.assetType === "component",
  );

  async function submit(): Promise<void> {
    if (busy) return;
    setFailure(null);
    setBusy(true);
    let requestNo: string | null = raised?.requestNo ?? null;
    let action: PlantOpsAction = "raise";
    try {
      if (requestNo === null) {
        const request = await api.post<RequestRow>(plantOpsApi.requestsPath, {
          assetCode,
          severity,
          symptomCode: symptomCode.trim(),
          detail: detail.trim() === "" ? undefined : detail.trim(),
          requestedByRef: reportedBy.trim(),
        });
        requestNo = request.requestNo;
        setRaised({ requestNo, mwoNo: null });
      }
      action = "triage";
      const triaged = await api.post<RequestRow>(plantOpsApi.requestTriagePath(requestNo), {
        kind: "create_mwo",
        mwoType,
        title: symptomCode.trim() || undefined,
      });
      setRaised({ requestNo, mwoNo: triaged.mwoNo });
      onDone(triaged.mwoNo);
    } catch (error) {
      setFailure(describeFailure(error, action));
    } finally {
      // Always re-enabled, including after a refusal. A button stuck disabled on an error is
      // a dead screen, and the client's idempotency key is what keeps a second press safe.
      setBusy(false);
    }
  }

  const ready = assetCode !== "" && symptomCode.trim() !== "" && reportedBy.trim() !== "";

  return (
    <div className="x-home-panel">
      <div className="x-home-panel-head">
        <div>
          <h2 className="x-section-heading">Report a fault</h2>
          <p>
            This records what was seen on the floor, then turns it into a job. The report is
            kept as it was written — reliability analysis reads the operator&rsquo;s words, not
            the fitter&rsquo;s conclusion.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">
        {!assetsReadable ? (
          <div className="x-notice" data-tone="warning">
            <Lock className="h-4 w-4 shrink-0" aria-hidden />
            <div>
              Machines cannot be listed without <code>mnt.asset.read</code>. The code can still
              be typed below if you know it.
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="x-field">
            Machine
            {machines.length > 0 ? (
              <select
                value={assetCode}
                onChange={(event) => setAssetCode(event.target.value)}
                aria-label="Machine the fault is on"
              >
                <option value="">Choose a machine…</option>
                {machines.map((row) => (
                  <option key={row.id} value={row.assetCode}>
                    {row.assetCode} · {row.name}
                    {row.openDowntimeId ? " (already down)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={assetCode}
                onChange={(event) => setAssetCode(event.target.value)}
                placeholder="Asset code, e.g. CNC-04"
                aria-label="Machine the fault is on"
              />
            )}
            <small>Only machines and components — a plant or an area cannot be repaired.</small>
          </label>

          <label className="x-field">
            Severity
            <select
              value={severity}
              onChange={(event) =>
                setSeverity(event.target.value as "stopped" | "degraded" | "cosmetic")
              }
              aria-label="Severity"
            >
              <option value="stopped">Stopped — it will not run</option>
              <option value="degraded">Degraded — running, but not right</option>
              <option value="cosmetic">Cosmetic — no effect on the work</option>
            </select>
            <small>
              {severity === "stopped"
                ? "This STARTS A DOWNTIME CLOCK on the machine, or joins the one already running. Every availability figure in the plant counts from it."
                : "No downtime clock is opened. The priority and the response deadline are derived from this and the machine's criticality."}
            </small>
          </label>

          <label className="x-field">
            Symptom
            <input
              type="text"
              value={symptomCode}
              onChange={(event) => setSymptomCode(event.target.value)}
              placeholder="e.g. COOLANT-LEAK"
              aria-label="Symptom"
            />
            <small>What was observed, not what is wrong with it. Also used as the job title.</small>
          </label>

          <label className="x-field">
            Reported by
            {roster.length > 0 ? (
              <select
                value={reportedBy}
                onChange={(event) => setReportedBy(event.target.value)}
                aria-label="Reported by"
              >
                {roster.map((ref) => (
                  <option key={ref} value={ref}>
                    {ref}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={reportedBy}
                onChange={(event) => setReportedBy(event.target.value)}
                placeholder="Employee reference (UUID)"
                aria-label="Reported by"
              />
            )}
            <small>
              People already recorded on live jobs. This is not an employee list — no endpoint
              in this permission set has one — so a new joiner has to be typed in.
            </small>
          </label>

          <label className="x-field">
            Job type
            <select
              value={mwoType}
              onChange={(event) => setMwoType(event.target.value as "breakdown" | "corrective")}
              aria-label="Job type"
            >
              <option value="corrective">Corrective — fix it when it can be scheduled</option>
              <option value="breakdown">Breakdown — it is stopped now</option>
            </select>
            <small>
              A breakdown job opens a downtime interval when it is started, if one is not
              already open on the machine.
            </small>
          </label>

          <label className="x-field xl:col-span-3">
            What happened
            <textarea
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              rows={2}
              placeholder="Optional. What was heard, seen or smelled, and when."
              aria-label="What happened"
            />
          </label>
        </div>

        {failure ? <FailureNotch notice={failure} /> : null}

        {raised ? (
          <div className="x-notice">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            <div>
              Report <strong>{raised.requestNo}</strong> was recorded.
              {raised.mwoNo ? (
                <>
                  {" "}
                  It is now job <strong>{raised.mwoNo}</strong>, selected below.
                </>
              ) : (
                " It has not yet been turned into a job — press again to triage it. The report itself is safe and the response clock is running."
              )}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-pri"
            disabled={busy || !ready || raised?.mwoNo != null}
            onClick={() => void submit()}
          >
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Recording…
              </>
            ) : (
              <>
                <PlusCircle className="h-3.5 w-3.5" aria-hidden />
                {raised ? "Turn it into a job" : "Record it and raise a job"}
              </>
            )}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => onDone(null)}>
            Cancel
          </button>
          {!ready ? (
            <span className="text-[12px] text-[var(--text-muted)]">
              A machine, a symptom and who reported it are all needed.
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * ONE JOB, AND WHAT CAN BE DONE TO IT RIGHT NOW.
 *
 * Only the actions the job's current state actually permits are drawn. Offering "Close" on a
 * job that has not been completed has exactly one possible outcome — a refusal — and a
 * button whose only reachable result is an error teaches people that this software's buttons
 * are guesses. The state machine lives on the server; this panel mirrors it and re-reads the
 * board after every write rather than guessing what the new state is.
 *
 * HANDBACK IS A SEPARATE ACTION FROM COMPLETE, and that is not a nicety. Downtime measures
 * the MACHINE, not the paperwork: a technician gives the machine back and writes their notes
 * afterwards, and closing the downtime clock when the notes are finished would overstate
 * every downtime figure in the plant by however long the notes take.
 */
function JobPanel({
  job,
  roster,
  onChanged,
  onClose,
}: {
  job: MwoRow;
  roster: readonly string[];
  onChanged: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const [employeeRef, setEmployeeRef] = useState(job.primaryTechRef ?? roster[0] ?? "");
  const [failureMode, setFailureMode] = useState("");
  const [failureCause, setFailureCause] = useState("");
  const [detection, setDetection] = useState("");
  const [busy, setBusy] = useState<PlantOpsAction | null>(null);
  const [failure, setFailure] = useState<FailureNotice | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const canStart = ["draft", "approved", "assigned", "on_hold"].includes(job.status);
  const canComplete = job.status === "in_progress";
  const canClose = job.status === "completed";
  const needsCodes = job.mwoType === "breakdown" || job.mwoType === "corrective";
  const down = elapsedSince(job.actualStart ?? job.reportedAt);

  async function run(action: PlantOpsAction, call: () => Promise<unknown>, note: string): Promise<void> {
    if (busy !== null) return;
    setFailure(null);
    setDone(null);
    setBusy(action);
    try {
      await call();
      setDone(note);
      onChanged();
    } catch (error) {
      setFailure(describeFailure(error, action));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="x-home-panel">
      <div className="x-home-panel-head flex-wrap">
        <div className="min-w-0">
          <h2 className="x-section-heading">
            {job.mwoNo} &mdash; {job.title}
          </h2>
          <p>
            {job.assetCode} · {job.assetName} · reported {dateTime(job.reportedAt)}
            {down ? ` · open ${down.text}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={job.status} />
          {job.openDowntimeId ? <StatusBadge tone="overdue" label="Machine still down" /> : null}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close panel
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Fact label="Priority" value={job.priority} />
          <Fact
            label="Restore by"
            value={job.slaRestoreBy ? dateTime(job.slaRestoreBy) : "No deadline set"}
            hint={job.slaBreached ? "The server has marked this deadline as missed." : undefined}
          />
          <Fact
            label="Time booked"
            value={
              job.labour.length === 0
                ? "Nobody's time yet"
                : `${num(job.labour.reduce((sum, row) => sum + (row.hours ?? 0), 0), 2)} h`
            }
            hint={`${job.labour.length} labour record${job.labour.length === 1 ? "" : "s"}. Completion is refused with none.`}
          />
          <Fact label="Cost so far" value={inr(job.cost.total)} hint={`Labour ${inr(job.cost.labour)} · spares ${inr(job.cost.spares)} · external ${inr(job.cost.external)}`} />
        </div>

        {job.tasks.length > 0 ? (
          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">Checklist</h3>
            <div className="overflow-x-auto">
              <table className="x-data-table min-w-[34rem]">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Instruction</th>
                    <th>Result</th>
                    <th>Done</th>
                  </tr>
                </thead>
                <tbody>
                  {job.tasks.map((task) => (
                    <tr key={task.sequence}>
                      <td>{task.sequence}</td>
                      <td>
                        {task.instruction}
                        {task.isMandatory ? (
                          <div className="text-[11px] text-[var(--text-muted)]">
                            Mandatory — completion is refused until this is recorded.
                          </div>
                        ) : null}
                      </td>
                      <td>{task.resultValue ?? "Not recorded"}</td>
                      <td>{task.completedAt ? dateTime(task.completedAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <Can
          permission="mnt.mwo.execute"
          fallback={
            <p className="text-[12px] text-[var(--text-muted)]">
              Starting, handing back and completing a job need <code>mnt.mwo.execute</code>.
            </p>
          }
        >
          <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="x-field">
                Whose time
                {roster.length > 0 ? (
                  <select
                    value={employeeRef}
                    onChange={(event) => setEmployeeRef(event.target.value)}
                    aria-label="Technician"
                  >
                    {roster.map((ref) => (
                      <option key={ref} value={ref}>
                        {ref}
                        {ref === job.primaryTechRef ? " (assigned)" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={employeeRef}
                    onChange={(event) => setEmployeeRef(event.target.value)}
                    placeholder="Employee reference (UUID)"
                    aria-label="Technician"
                  />
                )}
                <small>Starting the job opens a labour record against this person.</small>
              </label>

              {canComplete && needsCodes ? (
                <>
                  <label className="x-field">
                    Failure mode
                    <input
                      type="text"
                      value={failureMode}
                      onChange={(event) => setFailureMode(event.target.value)}
                      placeholder="e.g. EXT-LEAK"
                      aria-label="Failure mode code"
                    />
                    <small>Required on a {job.mwoType} job.</small>
                  </label>
                  <label className="x-field">
                    Cause
                    <input
                      type="text"
                      value={failureCause}
                      onChange={(event) => setFailureCause(event.target.value)}
                      placeholder="e.g. SEAL-WEAR"
                      aria-label="Failure cause code"
                    />
                    <small>From the plant&rsquo;s own code list; no endpoint publishes it.</small>
                  </label>
                  <label className="x-field">
                    How it was found
                    <input
                      type="text"
                      value={detection}
                      onChange={(event) => setDetection(event.target.value)}
                      placeholder="e.g. OPR-OBS"
                      aria-label="Detection code"
                    />
                    <small>An unknown code comes back named, not as a generic refusal.</small>
                  </label>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canStart ? (
                <button
                  type="button"
                  className="btn btn-pri btn-sm"
                  disabled={busy !== null || employeeRef.trim() === ""}
                  onClick={() =>
                    void run(
                      "start",
                      () =>
                        api.post(
                          job.status === "on_hold"
                            ? plantOpsApi.mwoResumePath(job.mwoNo)
                            : plantOpsApi.mwoStartPath(job.mwoNo),
                          { employeeRef: employeeRef.trim() },
                        ),
                      job.status === "on_hold"
                        ? "Resumed. The clock on this person's time is running again."
                        : "Started. A labour record is open and, on a breakdown, a downtime interval was opened if one was not already.",
                    )
                  }
                >
                  {busy === "start" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Play className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {job.status === "on_hold" ? "Resume" : "Start"}
                </button>
              ) : null}

              {job.openDowntimeId ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(
                      "handback",
                      () => api.post(plantOpsApi.mwoHandbackPath(job.mwoNo), {}),
                      "Machine handed back. The downtime clock is closed; the job stays open for the paperwork.",
                    )
                  }
                >
                  {busy === "handback" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Hand the machine back
                </button>
              ) : null}

              {canComplete ? (
                <button
                  type="button"
                  className="btn btn-pri btn-sm"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(
                      "complete",
                      () =>
                        api.post(plantOpsApi.mwoCompletePath(job.mwoNo), {
                          failureModeCode: failureMode.trim() || undefined,
                          failureCauseCode: failureCause.trim() || undefined,
                          detectionCode: detection.trim() || undefined,
                        }),
                      "Completed. The cost snapshot is frozen; above the closure threshold or on safety work an approval has been opened.",
                    )
                  }
                >
                  {busy === "complete" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Complete
                </button>
              ) : null}
            </div>
          </div>
        </Can>

        {canClose ? (
          <Can
            permission="mnt.mwo.close"
            fallback={
              <p className="text-[12px] text-[var(--text-muted)]">
                This job is completed and waiting to be closed. Closing needs{" "}
                <code>mnt.mwo.close</code>.
              </p>
            }
          >
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn btn-pri btn-sm"
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    "close",
                    () => api.post(plantOpsApi.mwoClosePath(job.mwoNo), {}),
                    "Closed. The database refuses every later edit to this job.",
                  )
                }
              >
                {busy === "close" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Lock className="h-3.5 w-3.5" aria-hidden />
                )}
                Close the job
              </button>
              <span className="text-[12px] text-[var(--text-muted)]">
                {job.approval.required
                  ? `This job needs an approval first: ${job.approval.reason ?? "policy"}.`
                  : "Closing is final — the cost snapshot is frozen and no later edit is accepted."}
              </span>
            </div>
          </Can>
        ) : null}

        {failure ? <FailureNotch notice={failure} /> : null}
        {done ? (
          <div className="x-notice">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            <div>{done}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-0.5 text-[13px] font-semibold text-[var(--text-primary)]">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] leading-5 text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

/**
 * A refused write, shown INSIDE the thing the user was doing.
 *
 * The spine's `ErrorState` takes over a whole screen, which is right when a page could not
 * load and wrong here: the form is still full of the technician's typing, and replacing it
 * to say a failure code was not found throws that away. Purchase has a near-identical strip;
 * the two are duplicated rather than shared because a module may never import from another
 * module — deleting Purchase must not break this screen. It belongs in `spine/states` the
 * third time somebody needs it.
 */
function FailureNotch({ notice }: { notice: FailureNotice }): React.JSX.Element {
  const warn = notice.missingPermission !== null || notice.stale;
  return (
    <div
      role="alert"
      className={
        warn
          ? "rounded-[var(--radius-control)] border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2.5 text-[var(--warn-ink)]"
          : "rounded-[var(--radius-control)] border border-[var(--bad)] bg-[var(--bad-soft)] px-3 py-2.5 text-[var(--bad-ink)]"
      }
    >
      <div className="flex gap-2.5">
        {notice.missingPermission ? (
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 text-[12.5px] leading-5">
          <p className="font-semibold">{notice.title}</p>
          {notice.body ? <p className="mt-0.5 opacity-90">{notice.body}</p> : null}
          {notice.checklist.length > 0 ? (
            <ul className="mt-1.5 list-disc pl-5">
              {notice.checklist.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {notice.missingPermission ? (
            <p className="mt-1.5">
              <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11.5px]">
                {notice.missingPermission}
              </code>
            </p>
          ) : null}
          {notice.traceId ? (
            <p className="mt-1.5 opacity-80">
              Reference{" "}
              <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11.5px]">
                {notice.traceId}
              </code>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
