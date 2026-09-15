"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CircleAlert, ClipboardList, LockKeyhole, Plus } from "lucide-react";
import { api } from "@spine/api/client";
import { Can } from "@spine/access/permissions";
import { DataTable, type Column } from "@spine/data/data-table";
import { useQuery } from "@spine/data/use-query";
import { date, dateTime, humanise } from "@spine/format";
import type { ScreenProps } from "@spine/registry/manifest";
import { PageHeader } from "@spine/shell/page-header";
import { Empty, ErrorState } from "@spine/states";
import { Disclosure } from "@spine/ui/disclosure";
import { StatusBadge } from "@spine/ui/status-badge";
import type { SafetyWorkOrder } from "../api";
import { isHeldForPermit, safetyApi } from "../api";

/**
 * PERMITS & GATED WORK.
 *
 * THE HONEST VERSION OF THIS SCREEN, WHICH IS THE ONLY ONE WORTH BUILDING.
 *
 * There is no permit-to-work document in this build. No table, no number series, no issuer,
 * no expiry, no countersignature. A screen that drew a permit register out of nothing would
 * be the single most dangerous thing in this codebase after a faked PPE detection: it would
 * show a maintenance fitter a green row for a permit that does not exist, for work that
 * nobody authorised, on a machine nobody isolated.
 *
 * So this screen shows the REAL evidence that a permit is standing in front of a job, and
 * says plainly where that evidence stops. Two mechanisms, both real columns in the
 * maintenance API:
 *
 *   1. A WORK ORDER HELD FOR A PERMIT. `awaiting_permit` is one of five hold reasons the
 *      maintenance desk can set, and it is the system's only record that a permit gates a
 *      job. The job stops; the downtime clock keeps running; somebody has to go and get the
 *      permit signed.
 *
 *   2. A MANDATORY TASK ON THE JOB. The work order's completion gate refuses to close a job
 *      with an unfinished mandatory task, and it refuses at the API rather than in a form.
 *      So a permit condition recorded as a mandatory task — isolate and lock off, gas-test
 *      before entry, fire watch posted — is not a note. It is a gate the technician cannot
 *      walk past, enforced in the same place every other maintenance rule is enforced.
 *
 * Everything else a permit system has — who issued it, who accepted it, when it expires,
 * who countersigned the hand-back — is absent, and the screen says so rather than implying
 * the two mechanisms above add up to one.
 */
type Scope = "held" | "live" | "handed_back";

const SCOPES: readonly { value: Scope; label: string; hint: string; query?: string }[] = [
  {
    value: "held",
    label: "Held for a permit",
    hint: "Work the maintenance desk has stopped because the permit is not in hand.",
  },
  {
    value: "live",
    label: "All live work",
    hint: "Every open maintenance job, so a permit condition can be added before work starts.",
  },
  {
    value: "handed_back",
    label: "Completed and closed",
    hint: "Recently finished work, with the mandatory checklist it was completed against.",
    query: "completed,closed",
  },
];

export default function PermitsScreen(_props: ScreenProps): React.JSX.Element {
  const [scope, setScope] = useState<Scope>("held");
  const [selectedNo, setSelectedNo] = useState("");
  const scopeConfig = SCOPES.find((entry) => entry.value === scope) ?? SCOPES[0]!;

  // Two different requests, not one filtered list: the maintenance board's default is live
  // work, and completed jobs are only returned when they are asked for by name.
  const board = useQuery<SafetyWorkOrder[]>(safetyApi.workOrdersPath, {
    query: scopeConfig.query ? { status: scopeConfig.query } : {},
  });

  const all = useMemo(() => board.data ?? [], [board.data]);
  const rows = useMemo(
    () => (scope === "held" ? all.filter((wo) => isHeldForPermit(wo)) : all),
    [all, scope],
  );

  const held = all.filter((wo) => isHeldForPermit(wo));
  const heldAndBreached = held.filter((wo) => wo.slaBreached);
  const selected = rows.find((wo) => wo.mwoNo === selectedNo) ?? rows[0];

  const columns: ReadonlyArray<Column<SafetyWorkOrder>> = [
    {
      key: "mwo",
      header: "Work order",
      width: "w-44",
      render: (wo) => (
        <div>
          <button
            type="button"
            className="text-left font-[var(--font-mono)] font-semibold text-[var(--brand)] underline-offset-4 hover:underline"
            onClick={() => setSelectedNo(wo.mwoNo)}
            aria-label={`Open ${wo.mwoNo}`}
          >
            {wo.mwoNo}
          </button>
          <p className="text-[11px] text-[var(--text-muted)]">{humanise(wo.mwoType)}</p>
        </div>
      ),
    },
    {
      key: "asset",
      header: "Asset",
      width: "w-52",
      render: (wo) => (
        <div>
          <b className="text-[var(--text-primary)]">{wo.assetCode}</b>
          <p className="text-[11px] text-[var(--text-muted)]">{wo.assetName}</p>
        </div>
      ),
    },
    {
      key: "job",
      header: "Job",
      render: (wo) => (
        <div>
          <p className="text-[var(--text-primary)]">{wo.title}</p>
          <p className="text-[11px] text-[var(--text-muted)]">
            {wo.primaryTechRef ? `Assigned to ${wo.primaryTechRef}` : "Nobody assigned"}
            {wo.isSafetyRelated ? " · flagged safety-related" : ""}
          </p>
        </div>
      ),
    },
    {
      key: "gate",
      header: "Derived gate state",
      width: "w-48",
      render: (wo) => <GateCell wo={wo} />,
    },
    {
      key: "timing",
      header: "Raised / restore by",
      width: "w-48",
      render: (wo) => (
        <div>
          <p className="text-[12px] text-[var(--text-secondary)]">{date(wo.reportedAt)}</p>
          {wo.slaRestoreBy ? (
            wo.slaBreached ? (
              <StatusBadge tone="overdue" status="overdue" label={`Past ${date(wo.slaRestoreBy)}`} />
            ) : (
              <p className="text-[11px] text-[var(--text-muted)]">
                Restore by {date(wo.slaRestoreBy)}
              </p>
            )
          ) : (
            <p className="text-[11px] text-[var(--text-muted)]">No restore time set</p>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Permits & gated work"
        subtitle="Maintenance work a permit is standing in front of, read from the work orders themselves."
        meta={
          all.length
            ? [
                { label: "Held for a permit", value: String(held.length) },
                { label: "Held and past restore time", value: String(heldAndBreached.length) },
                { label: "In this view", value: String(rows.length) },
              ]
            : []
        }
      />

      <NoPermitRecordBanner />

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Which maintenance work to show"
      >
        {SCOPES.map((entry) => (
          <button
            key={entry.value}
            type="button"
            className={entry.value === scope ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
            aria-pressed={entry.value === scope}
            onClick={() => {
              setScope(entry.value);
              setSelectedNo("");
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <p className="-mt-2 text-[12px] text-[var(--text-muted)]">{scopeConfig.hint}</p>

      <DataTable
        rows={rows}
        columns={columns}
        loading={board.loading}
        error={board.error}
        onReload={board.reload}
        rowKey={(wo) => wo.id}
        caption="Maintenance work orders and the permit evidence recorded against them"
        empty={
          scope === "held" ? (
            <Empty
              title="No job is waiting on a permit"
              body="A job appears here when the maintenance desk puts it on hold with the reason “awaiting permit”. That is the only record in this build that a permit gates a job; nothing here issues one."
            />
          ) : (
            <Empty
              title="Nothing in this view"
              body="No maintenance work order matched. Live work and completed work are two different requests to the maintenance API, not one list filtered."
            />
          )
        }
      />

      {selected ? <PermitConditions key={selected.mwoNo} mwoNo={selected.mwoNo} /> : null}

      <Disclosure
        title="What a permit system has that this does not"
        hint="Read before treating this screen as a permit register"
      >
        <ul className="ml-4 list-disc space-y-2">
          <li>
            <b>No permit document.</b> There is no permit number, no issuer, no acceptor, no
            countersignature and no expiry time anywhere in this build. Nothing on this screen was
            issued by anybody.
          </li>
          <li>
            <b>The gate states are derived.</b> &ldquo;Not issued&rdquo;, &ldquo;work under way&rdquo;
            and &ldquo;handed back&rdquo; are read off the work order&rsquo;s status and hold reason.
            They describe the JOB, not a permit, and they will be wrong about the permit whenever the
            hold reason is not kept current.
          </li>
          <li>
            <b>Isolation and lock-off are not verified.</b> A mandatory task saying the machine was
            isolated is somebody&rsquo;s tick. This system has no connection to the isolation itself.
          </li>
          <li>
            <b>Nothing expires.</b> A real permit runs out at the end of a shift. Nothing here has a
            clock, so no alert in this module can tell you a permit has lapsed — and the bell staying
            quiet must not be read as one being valid.
          </li>
        </ul>
      </Disclosure>
    </div>
  );
}

function NoPermitRecordBanner(): React.JSX.Element {
  return (
    <div className="x-notice" data-tone="warning" role="note">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">This is not a permit register, and it does not issue permits.</p>
        <p>
          Everything below is read from maintenance work orders. A job shows here as gated because
          the maintenance desk put it on hold with the reason &ldquo;awaiting permit&rdquo;, or
          because a permit condition was recorded against it as a mandatory task. The paper permit,
          the isolation, the gas test and the hand-back remain exactly where they are today.
        </p>
      </div>
    </div>
  );
}

/**
 * The derived state, drawn so that it cannot be mistaken for a permit's own lifecycle.
 *
 * Every label names the WORK ORDER. There is no "Issued" chip, because nothing in this
 * build issues anything — the nearest true statement is that the job is no longer being
 * held for a permit, which is what "Not held" says.
 */
function GateCell({ wo }: { wo: SafetyWorkOrder }): React.JSX.Element {
  if (isHeldForPermit(wo)) {
    return (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge tone="hold" status="on_hold" label="Held — no permit" />
        <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          Work stopped
        </span>
      </div>
    );
  }
  if (wo.actualEnd !== null) {
    return (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge tone="done" status="completed" label="Machine handed back" />
        <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {dateTime(wo.actualEnd)}
        </span>
      </div>
    );
  }
  if (wo.actualStart !== null) {
    return (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge tone="progress" status="in_progress" label="Work under way" />
        <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          Started {dateTime(wo.actualStart)}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge status={wo.status} />
      {wo.holdReason ? (
        <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {humanise(wo.holdReason)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The checklist a job cannot be completed without — and the one place this module writes
 * something that genuinely blocks work.
 *
 * `POST /maintenance/work-orders/:no/tasks` with `isMandatory: true` adds a line to the
 * work order's completion gate. That gate lives in the maintenance service and refuses the
 * whole completion, naming the task, so a permit condition added here cannot be skipped by
 * a technician at the end of a shift who would rather go home. It is enforced in the same
 * transaction as every other maintenance rule rather than in this form, which is the only
 * reason it is worth offering.
 */
function PermitConditions({ mwoNo }: { mwoNo: string }): React.JSX.Element {
  const detail = useQuery<SafetyWorkOrder>(safetyApi.workOrderPath(mwoNo));
  const wo = detail.data;

  if (detail.error) {
    return (
      <section className="x-home-panel">
        <div className="p-5">
          <ErrorState error={detail.error} onRetry={detail.reload} />
        </div>
      </section>
    );
  }

  const tasks = wo?.tasks ?? [];
  const mandatory = tasks.filter((task) => task.isMandatory);
  const outstanding = mandatory.filter((task) => task.completedAt === null);
  const failed = mandatory.filter((task) => task.isPass === false);

  return (
    <section className="x-home-panel" aria-labelledby="permit-conditions">
      <div className="x-home-panel-head flex-wrap gap-3">
        <div>
          <h2 id="permit-conditions" className="x-section-heading">
            {mwoNo} · conditions on the job
          </h2>
          <p>
            {wo
              ? `${wo.assetCode} ${wo.assetName} · ${wo.title}`
              : "Reading the work order…"}
          </p>
        </div>
        {mandatory.length > 0 ? (
          <StatusBadge
            tone={failed.length > 0 ? "rejected" : outstanding.length > 0 ? "pending" : "done"}
            status={failed.length > 0 ? "failed" : outstanding.length > 0 ? "pending" : "completed"}
            label={
              failed.length > 0
                ? `${failed.length} failed`
                : outstanding.length > 0
                  ? `${outstanding.length} outstanding`
                  : "All signed off"
            }
          />
        ) : null}
      </div>

      <div className="space-y-5 p-5">
        {tasks.length === 0 ? (
          <p className="text-[13px] text-[var(--text-secondary)]" aria-busy={detail.loading}>
            {detail.loading
              ? "Reading the work order…"
              : "No task is recorded against this job. Nothing is gating its completion."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="x-data-table min-w-[36rem]">
              <thead>
                <tr>
                  <th className="w-12">#</th>
                  <th>Condition</th>
                  <th className="w-32">Mandatory</th>
                  <th className="w-44">Signed off</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.sequence}>
                    <td className="tabular-nums">{task.sequence}</td>
                    <td>{task.instruction}</td>
                    <td>
                      {task.isMandatory ? (
                        <span className="inline-flex items-center gap-1 text-[var(--text-primary)]">
                          <LockKeyhole className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Blocks completion
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">Advisory</span>
                      )}
                    </td>
                    <td>
                      {task.completedAt === null ? (
                        <span className="text-[var(--text-muted)]">Not yet</span>
                      ) : (
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge
                            tone={task.isPass === false ? "rejected" : "done"}
                            status={task.isPass === false ? "failed" : "completed"}
                            label={task.isPass === false ? "Not OK" : "OK"}
                          />
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {dateTime(task.completedAt)}
                            {task.resultValue ? ` · ${task.resultValue}` : ""}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Can permission="mnt.mwo.write">
          <AddConditionForm mwoNo={mwoNo} onSaved={detail.reload} />
        </Can>

        <p className="text-[12px] leading-6 text-[var(--text-muted)]">
          Signing a condition off is done by the technician on the job, in Maintenance, and needs the
          execution permission for that work order. It is deliberately not on this screen: the person
          who sets a permit condition should not be the person who ticks it.
        </p>
      </div>
    </section>
  );
}

function AddConditionForm({
  mwoNo,
  onSaved,
}: {
  mwoNo: string;
  onSaved: () => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const instruction = String(values.get("instruction") ?? "").trim();
    const safetyNote = String(values.get("safetyNote") ?? "").trim();
    if (instruction.length < 3) {
      setError("Say what has to be done, in words a technician can act on without asking.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.post(safetyApi.workOrderTasksPath(mwoNo), {
        instruction,
        // Mandatory, always. An advisory permit condition is a note, and this form exists
        // precisely because a note is not a gate.
        isMandatory: true,
        resultType: "ok_not_ok",
        ...(safetyNote ? { safetyNote } : {}),
      });
      form.reset();
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That condition could not be added.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4"
      onSubmit={(event) => void submit(event)}
    >
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 shrink-0 text-[var(--brand)]" aria-hidden />
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
          Add a permit condition to {mwoNo}
        </h3>
      </div>
      <p className="text-[12px] leading-6 text-[var(--text-secondary)]">
        Recorded as a mandatory task. The maintenance API refuses to complete this work order while it
        is outstanding, and names it in the refusal.
      </p>
      <div className="x-form-grid">
        <label className="x-field sm:col-span-2">
          What must be done before or during the work
          <input
            name="instruction"
            required
            minLength={3}
            maxLength={300}
            placeholder="Isolate at the local disconnect and fit a personal lock before opening the guard"
          />
        </label>
        <label className="x-field sm:col-span-2">
          Note for whoever does it
          <textarea
            name="safetyNote"
            rows={2}
            maxLength={500}
            placeholder="The hazard this condition exists for, and what to do if it cannot be met."
          />
        </label>
      </div>
      {error ? (
        <div role="alert" className="x-notice" data-tone="error">
          {error}
        </div>
      ) : null}
      <button className="btn btn-primary btn-sm" disabled={busy}>
        <Plus className="h-3.5 w-3.5" aria-hidden />
        {busy ? "Adding…" : "Add condition"}
      </button>
    </form>
  );
}
