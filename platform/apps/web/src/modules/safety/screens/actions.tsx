"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CheckCheck, Link2, Plus, Search, ShieldCheck } from "lucide-react";
import { api } from "@spine/api/client";
import { Can } from "@spine/access/permissions";
import { DataTable, type Column } from "@spine/data/data-table";
import { useQuery } from "@spine/data/use-query";
import { date, dateTime, humanise, num } from "@spine/format";
import type { ScreenProps } from "@spine/registry/manifest";
import { PageHeader } from "@spine/shell/page-header";
import { Empty } from "@spine/states";
import { Disclosure } from "@spine/ui/disclosure";
import { Modal } from "@spine/ui/modal";
import { StatusBadge } from "@spine/ui/status-badge";
import type {
  SafetyChainVerification,
  SafetyCorrectiveAction,
  SafetyFinding,
} from "../api";
import {
  daysUntil,
  isActionOpen,
  isFindingOpen,
  isPastDue,
  readSafetyRef,
  safetyApi,
  safetyKindLabel,
  todayIso,
} from "../api";

/**
 * CORRECTIVE ACTIONS — the reason Quality and Safety are one module.
 *
 * This is the screen the whole package is built around, and it is built around one claim:
 * a defect and a near-miss are the same problem wearing different clothes. Both were
 * noticed by somebody. Both need making safe before anybody understands them. Both need a
 * cause CONFIRMED rather than guessed, because the first plausible explanation is usually
 * "operator error" and acting on that fixes nothing. Both need an owner, a date, and — the
 * step everyone skips — somebody coming back afterwards to check the fix actually worked.
 *
 * Most systems build that loop twice, once in a QMS and once in an EHS module, and the
 * second copy is always the worse one. This screen is the single queue. The Origin column
 * is the entire argument made visible: the same list, the same owner column, the same
 * overdue arithmetic, with a chip saying whether this row started life as a rejected lot or
 * as somebody nearly losing a hand.
 *
 * TWO COLUMNS THAT LOOK REDUNDANT AND ARE NOT.
 *
 *   `completionEvidence` — what somebody did.
 *   `effectivenessEvidence` — the proof it worked, judged against criteria written down
 *   BEFORE the work started.
 *
 * The API keeps them apart, refuses to close an action on the first alone, and leaves an
 * action verified INEFFECTIVE open with its finding still open. That is the difference
 * between a corrective-action register and a to-do list with better paperwork, and it is
 * why this screen shows both columns even when one is empty on every row.
 */
type Origin = "safety" | "quality" | "unknown";

type ActionRow = {
  action: SafetyCorrectiveAction;
  finding: SafetyFinding | null;
  origin: Origin;
  originLabel: string;
};

const ORIGIN_FILTERS: readonly { value: "all" | Origin; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "safety", label: "From safety" },
  { value: "quality", label: "From quality" },
];

export default function ActionsScreen(_props: ScreenProps): React.JSX.Element {
  const actions = useQuery<SafetyCorrectiveAction[]>(safetyApi.correctiveActionsPath);
  const findings = useQuery<SafetyFinding[]>(safetyApi.findingsPath);
  const [origin, setOrigin] = useState<"all" | Origin>("all");
  const [filter, setFilter] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const [selectedNo, setSelectedNo] = useState("");
  const [raising, setRaising] = useState(false);

  /**
   * The join that makes the Origin column honest.
   *
   * A corrective action carries its finding's NUMBER and TITLE but not its source, so the
   * origin cannot be read off the action alone. Rather than guess from the title — which
   * would be a model's kind of reasoning dressed up as code — the finding list is loaded
   * and matched by number. An action whose finding is not on the loaded list is labelled
   * `unknown` and says so, instead of being quietly counted as quality.
   */
  const rows = useMemo<readonly ActionRow[]>(() => {
    const byNo = new Map((findings.data ?? []).map((finding) => [finding.findingNo, finding]));
    return (actions.data ?? []).map((action) => {
      const finding = byNo.get(action.findingNo) ?? null;
      if (finding === null) {
        return { action, finding: null, origin: "unknown", originLabel: "Source not loaded" };
      }
      const safety = readSafetyRef(finding.sourceRef);
      return safety
        ? {
            action,
            finding,
            origin: "safety",
            originLabel: `${safetyKindLabel(safety.kind)}${safety.area ? ` · ${safety.area}` : ""}`,
          }
        : {
            action,
            finding,
            origin: "quality",
            originLabel: `${humanise(finding.sourceType)} · ${finding.sourceRef}`,
          };
    });
  }, [actions.data, findings.data]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((row) => {
      if (origin !== "all" && row.origin !== origin) return false;
      if (openOnly && !isActionOpen(row.action)) return false;
      if (!q) return true;
      return (
        row.action.capaNo.toLowerCase().includes(q) ||
        row.action.title.toLowerCase().includes(q) ||
        row.action.ownerRef.toLowerCase().includes(q) ||
        row.action.findingNo.toLowerCase().includes(q) ||
        row.action.findingTitle.toLowerCase().includes(q) ||
        row.originLabel.toLowerCase().includes(q)
      );
    });
  }, [rows, origin, openOnly, filter]);

  const open = rows.filter((row) => isActionOpen(row.action));
  const overdue = open.filter((row) => isPastDue(row.action.dueDate));
  const awaitingReview = rows.filter((row) => row.action.status === "effectiveness_review");
  const ineffective = rows.filter((row) => row.action.effectivenessResult === "ineffective");
  const fromSafety = open.filter((row) => row.origin === "safety");
  const selected = visible.find((row) => row.action.capaNo === selectedNo) ?? visible[0];

  const columns: ReadonlyArray<Column<ActionRow>> = [
    {
      key: "action",
      header: "Action",
      width: "w-56",
      render: (row) => (
        <div>
          <button
            type="button"
            className="text-left font-[var(--font-mono)] font-semibold text-[var(--brand)] underline-offset-4 hover:underline"
            onClick={() => setSelectedNo(row.action.capaNo)}
            aria-label={`Open ${row.action.capaNo}`}
          >
            {row.action.capaNo}
          </button>
          <p className="text-[12px] text-[var(--text-primary)]">{row.action.title}</p>
        </div>
      ),
    },
    {
      key: "origin",
      header: "Arising from",
      width: "w-64",
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <OriginChip origin={row.origin} />
          <span className="font-[var(--font-mono)] text-[11px] text-[var(--text-secondary)]">
            {row.action.findingNo}
          </span>
          <span className="line-clamp-1 text-[11px] text-[var(--text-muted)]">
            {row.originLabel}
          </span>
        </div>
      ),
    },
    {
      key: "owner",
      header: "Owner / due",
      width: "w-48",
      render: (row) => <DueCell action={row.action} />,
    },
    {
      key: "stage",
      header: "Stage",
      width: "w-40",
      render: (row) => <StatusBadge status={row.action.status} />,
    },
    {
      key: "effectiveness",
      header: "Did it work?",
      width: "w-56",
      render: (row) => <EffectivenessCell action={row.action} />,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Corrective actions"
        subtitle="One queue for defects and incidents, with the same owner, date and effectiveness check on every row."
        meta={
          rows.length
            ? [
                { label: "Open", value: num(open.length) },
                { label: "Overdue", value: num(overdue.length) },
                { label: "From safety", value: num(fromSafety.length) },
                { label: "Awaiting effectiveness", value: num(awaitingReview.length) },
                { label: "Verified ineffective", value: num(ineffective.length) },
              ]
            : []
        }
        actions={
          <Can permission="quality.disposition.decide">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setRaising(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Open an action
            </button>
          </Can>
        }
      />

      <div className="x-notice" role="note">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">One engine, two doors.</p>
          <p>
            A rejected lot and a near miss run the same loop — raise, contain, confirm the cause, act,
            prove it worked — so they run on the same register and appear in this one list. The Origin
            column says which door a row came in through. It is not evidence of compliance with any
            standard, and nothing on this screen makes anybody audit-ready.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by where the action came from">
          {ORIGIN_FILTERS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              className={entry.value === origin ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
              aria-pressed={entry.value === origin}
              onClick={() => setOrigin(entry.value)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 max-w-sm flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by action, finding, owner or area…"
            aria-label="Filter corrective actions"
            className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
        <label className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(event) => setOpenOnly(event.target.checked)}
          />
          Open actions only
        </label>
      </div>

      <DataTable
        rows={visible}
        columns={columns}
        loading={actions.loading}
        error={actions.error}
        onReload={() => {
          actions.reload();
          findings.reload();
        }}
        rowKey={(row) => row.action.id}
        caption="Corrective actions arising from quality findings and safety incidents"
        empty={
          filter || origin !== "all" || openOnly ? (
            <Empty
              title="Nothing matches"
              body="No corrective action matched that filter. Clearing it shows every action ever raised, from both origins."
            />
          ) : (
            <Empty
              title="No corrective action raised yet"
              body="An action can only be opened against a finding whose root cause has been confirmed. That order is enforced by the API, not by this screen."
            />
          )
        }
      />

      {selected ? (
        <ActionDetail
          key={selected.action.capaNo}
          row={selected}
          onChanged={() => {
            actions.reload();
            findings.reload();
          }}
        />
      ) : null}

      <Can permission="admin.audit.read">
        <EvidenceChain />
      </Can>

      <Disclosure title="How an action closes, and what closing it does not mean">
        <ul className="ml-4 list-disc space-y-2">
          <li>
            Recording completion moves an action to <b>effectiveness review</b>. It does not close it,
            and it does not close the finding underneath it.
          </li>
          <li>
            Verifying it <b>effective</b> closes both. Verifying it <b>ineffective</b> closes neither —
            the action stays on this list and the finding stays open, because the problem is still
            there.
          </li>
          <li>
            Effectiveness criteria are written when the action is opened, before anybody knows whether
            it will work. Criteria written afterwards are a description of the outcome, not a test of
            it.
          </li>
          <li>
            A closed action is evidence that this plant noticed something and did something. It is not
            evidence of a management system, not certification against ISO 9001 or IATF 16949, and not
            a statement that an audit would pass.
          </li>
        </ul>
      </Disclosure>

      {raising ? (
        <RaiseActionDialog
          findings={(findings.data ?? []).filter(
            (finding) => finding.rootCause !== null && isFindingOpen(finding),
          )}
          onClose={() => setRaising(false)}
          onSaved={() => {
            setRaising(false);
            actions.reload();
            findings.reload();
          }}
        />
      ) : null}
    </div>
  );
}

/** Safety or quality, or an honest admission that the source row was not loaded. */
function OriginChip({ origin }: { origin: Origin }): React.JSX.Element {
  if (origin === "safety") {
    return <span className="chip chip-warn shrink-0 uppercase">Safety</span>;
  }
  if (origin === "quality") {
    return <span className="chip chip-info shrink-0 uppercase">Quality</span>;
  }
  return <span className="chip chip-grey shrink-0 uppercase">Unknown</span>;
}

function DueCell({ action }: { action: SafetyCorrectiveAction }): React.JSX.Element {
  const late = isActionOpen(action) && isPastDue(action.dueDate);
  const days = daysUntil(action.dueDate);
  return (
    <div>
      <p className="text-[var(--text-primary)]">{action.ownerRef || "Unassigned"}</p>
      {late ? (
        <StatusBadge
          tone="overdue"
          status="overdue"
          label={`${date(action.dueDate)} · ${Math.abs(days ?? 0)}d late`}
        />
      ) : (
        <p className="text-[11px] text-[var(--text-muted)]">
          Due {date(action.dueDate)}
          {isActionOpen(action) && days !== null && days >= 0 && days <= 3
            ? ` · ${days === 0 ? "today" : `in ${days}d`}`
            : ""}
        </p>
      )}
    </div>
  );
}

function EffectivenessCell({ action }: { action: SafetyCorrectiveAction }): React.JSX.Element {
  if (action.effectivenessResult === "effective") {
    return (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge tone="done" status="verified" label="Verified effective" />
        <span className="text-[10px] text-[var(--text-muted)]">
          {action.verifiedAt ? dateTime(action.verifiedAt) : "Date not recorded"}
        </span>
      </div>
    );
  }
  if (action.effectivenessResult === "ineffective") {
    return (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge tone="rejected" status="ineffective" label="Did not work" />
        <span className="text-[10px] text-[var(--text-muted)]">Finding still open</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge
        tone={action.completedAt === null && action.completionEvidence === null ? "pending" : "progress"}
        status={action.completionEvidence === null ? "pending" : "in_progress"}
        label={action.completionEvidence === null ? "Not yet checked" : "Awaiting check"}
      />
      <span className="line-clamp-1 text-[10px] text-[var(--text-muted)]">
        {action.effectivenessCriteria}
      </span>
    </div>
  );
}

/**
 * One action, its finding, and the two decisions left to record.
 *
 * The finding's own containment and confirmed cause are shown above the action rather than
 * linked to, because the question somebody asks at an effectiveness review is always "does
 * this fix address the cause that was confirmed" — and that comparison only works if both
 * are on the screen at the same time.
 */
function ActionDetail({ row, onChanged }: { row: ActionRow; onChanged: () => void }): React.JSX.Element {
  const { action, finding, origin, originLabel } = row;
  return (
    <section className="x-home-panel" aria-labelledby="action-detail">
      <div className="x-home-panel-head flex-wrap gap-3">
        <div>
          <h2 id="action-detail" className="x-section-heading">
            {action.capaNo} · {action.title}
          </h2>
          <p>
            Against {action.findingNo} — {action.findingTitle} · {originLabel} · owner{" "}
            {action.ownerRef || "unassigned"} · due {date(action.dueDate)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <OriginChip origin={origin} />
          <StatusBadge status={action.status} />
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Panel label="What was made safe at the time">
            {finding?.containment ?? "Not recorded on the finding."}
          </Panel>
          <Panel label="Confirmed cause">
            {finding?.rootCause ?? "Not recorded on the finding."}
          </Panel>
          <Panel label="The action">{action.actionPlan}</Panel>
          <Panel label="How it will be judged">{action.effectivenessCriteria}</Panel>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Panel label="Completion evidence">
            {action.completionEvidence ?? "Nothing recorded. The action has not been done."}
          </Panel>
          <Panel label="Effectiveness evidence">
            {action.effectivenessEvidence ??
              "Nobody has checked yet. Completing an action is not proof that it worked."}
          </Panel>
        </div>

        <Can permission="quality.disposition.decide">
          {action.status === "closed" ? (
            <p className="text-[12px] text-[var(--text-muted)]">
              This action is closed. Closed records are not editable — the register is append-only and
              a corrected verdict is a new action, not a rewritten one.
            </p>
          ) : action.status === "effectiveness_review" ? (
            <VerifyForm capaNo={action.capaNo} onSaved={onChanged} />
          ) : (
            <CompleteForm capaNo={action.capaNo} onSaved={onChanged} />
          )}
        </Can>
      </div>
    </section>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-[13px] leading-6 text-[var(--text-primary)]">{children}</p>
    </div>
  );
}

function CompleteForm({ capaNo, onSaved }: { capaNo: string; onSaved: () => void }): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const evidence = String(new FormData(form).get("completionEvidence") ?? "").trim();
    if (evidence.length < 3) {
      setError("Name what was done and what shows it was done. “Completed” proves nothing.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.post(safetyApi.correctiveActionCompletePath(capaNo), {
        completionEvidence: evidence,
      });
      form.reset();
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)] p-4"
      onSubmit={(event) => void submit(event)}
    >
      <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Record what was done</h3>
      <p className="text-[12px] leading-6 text-[var(--text-secondary)]">
        This moves {capaNo} to effectiveness review. It does not close it, and it does not close the
        finding — somebody still has to check the fix worked.
      </p>
      <label className="x-field">
        Completion evidence
        <textarea
          name="completionEvidence"
          rows={3}
          maxLength={2000}
          placeholder="Guard interlock replaced and function-tested on 12 Sep; work instruction WI-14 reissued at rev C; both signed off by the shift engineer."
        />
      </label>
      {error ? (
        <div role="alert" className="x-notice" data-tone="error">
          {error}
        </div>
      ) : null}
      <button className="btn btn-secondary btn-sm" disabled={busy}>
        {busy ? "Recording…" : "Record completion"}
      </button>
    </form>
  );
}

/**
 * The verdict that closes the loop, with the "it did not work" answer given equal weight.
 *
 * Both buttons submit the same form. There is no default and no primary styling on
 * "effective", because a verification screen whose easy path is "yes" produces a register
 * where everything worked.
 */
function VerifyForm({ capaNo, onSaved }: { capaNo: string; onSaved: () => void }): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState("");

  async function verify(effective: boolean): Promise<void> {
    const text = evidence.trim();
    if (text.length < 3) {
      setError("Say what you checked and what you found. A verdict with no evidence is an opinion.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.post(safetyApi.correctiveActionVerifyPath(capaNo), { effective, evidence: text });
      setEvidence("");
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That verdict could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)] p-4">
      <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
        Did it work? — verify {capaNo}
      </h3>
      <p className="text-[12px] leading-6 text-[var(--text-secondary)]">
        Judge it against the criteria written when the action was opened, not against how much work it
        took. &ldquo;Effective&rdquo; closes the action and the finding behind it.
        &ldquo;Ineffective&rdquo; closes neither, and that is the correct answer whenever the problem
        is still there.
      </p>
      <label className="x-field">
        What you checked, and what you found
        <textarea
          rows={3}
          maxLength={2000}
          value={evidence}
          onChange={(event) => setEvidence(event.target.value)}
          placeholder="Four weeks of shift checks since the change, no recurrence, interlock function test passed on each of 12 audits."
        />
      </label>
      {error ? (
        <div role="alert" className="x-notice" data-tone="error">
          {error}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() => void verify(true)}
        >
          <CheckCheck className="h-3.5 w-3.5" aria-hidden />
          It worked — close it
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() => void verify(false)}
        >
          It did not work — keep it open
        </button>
      </div>
    </div>
  );
}

/**
 * Opening an action.
 *
 * The finding selector lists only findings whose root cause has been CONFIRMED, because
 * the API refuses the rest and a form that offers a choice the server will reject teaches
 * people that the system is arbitrary. The refusal is still shown if it happens — the list
 * is a courtesy, not the enforcement.
 */
function RaiseActionDialog({
  findings,
  onClose,
  onSaved,
}: {
  findings: readonly SafetyFinding[];
  onClose: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const text = (key: string): string => String(values.get(key) ?? "").trim();
    setError(null);
    setBusy(true);
    try {
      await api.post(safetyApi.correctiveActionsPath, {
        findingNo: text("findingNo"),
        title: text("title"),
        actionPlan: text("actionPlan"),
        ownerRef: text("ownerRef"),
        dueDate: text("dueDate"),
        effectivenessCriteria: text("effectivenessCriteria"),
      });
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That action could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Open a corrective action"
      subtitle="Against a finding whose cause has been confirmed — from either origin."
      onClose={onClose}
      locked={busy}
    >
      {findings.length === 0 ? (
        <div className="space-y-4">
          <div className="x-notice" data-tone="warning" role="note">
            <div>
              No open finding has a confirmed root cause, so no corrective action can be opened. Record
              the containment and then the confirmed cause on the finding first — the API refuses this
              order the other way round, deliberately: an action chosen before the cause is understood
              fixes the symptom.
            </div>
          </div>
          <div className="flex justify-end">
            <button className="btn btn-secondary" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={(event) => void submit(event)}>
          <div className="x-form-grid">
            <label className="x-field sm:col-span-2">
              Against which finding
              <select name="findingNo" required defaultValue="" data-autofocus>
                <option value="" disabled>
                  Choose a finding…
                </option>
                {findings.map((finding) => {
                  const safety = readSafetyRef(finding.sourceRef);
                  return (
                    <option key={finding.id} value={finding.findingNo}>
                      {finding.findingNo} · {safety ? safetyKindLabel(safety.kind) : "Quality"} ·{" "}
                      {finding.title}
                    </option>
                  );
                })}
              </select>
              <small>Only findings with a confirmed root cause are listed; the API refuses the rest.</small>
            </label>
            <label className="x-field sm:col-span-2">
              The action, in one line
              <input name="title" required minLength={3} maxLength={200} />
            </label>
            <label className="x-field sm:col-span-2">
              What will be done
              <textarea name="actionPlan" required minLength={3} rows={3} maxLength={2000} />
            </label>
            <label className="x-field">
              Owner
              <input name="ownerRef" required maxLength={120} />
            </label>
            <label className="x-field">
              Due by
              <input type="date" name="dueDate" required min={todayIso()} />
            </label>
            <label className="x-field sm:col-span-2">
              How you will know it worked
              <textarea name="effectivenessCriteria" required minLength={3} rows={2} maxLength={1000} />
              <small>
                Written now, before the work starts. Criteria written afterwards describe the outcome
                rather than test it.
              </small>
            </label>
          </div>
          {error ? (
            <div role="alert" className="x-notice" data-tone="error">
              {error}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy}>
              <Plus className="h-4 w-4" aria-hidden />
              {busy ? "Opening…" : "Open the action"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/**
 * THE EVIDENCE UNDER THE EVIDENCE.
 *
 * Every step of this loop appends to a hash-chained audit log, and the platform can verify
 * that chain has not been altered. That verification is the last link of the package the
 * module name promises — raise, contain, investigate, act, evidence, AUDIT — and it is
 * shown here rather than described, because "tamper-evident" is a claim and a verification
 * record is a fact.
 *
 * It is read-only and permission-gated. This screen does not trigger a verification: the
 * run belongs to Administration, and a verifier anybody can invoke from the screen whose
 * records it verifies is not much of a verifier.
 */
function EvidenceChain(): React.JSX.Element {
  const query = useQuery<{ data: SafetyChainVerification[] }>(safetyApi.auditVerificationsPath, {
    query: { chain: "audit_log" },
  });
  const rows = query.data?.data ?? [];
  const latest = rows[0];

  return (
    <Disclosure
      title="Where these records live"
      hint={
        latest
          ? latest.intact
            ? `Audit chain verified intact on ${date(latest.verifiedAt)}`
            : `Audit chain reported a break on ${date(latest.verifiedAt)}`
          : "Audit chain — no verification run recorded"
      }
    >
      <div className="space-y-3">
        <p>
          Every containment, confirmed cause, completion and effectiveness verdict on this screen
          appends a row to a hash-chained audit log that cannot be edited in place — the append-only
          trigger fires for the schema owner too. Administration runs the verifier; the most recent
          runs are below.
        </p>
        {rows.length === 0 ? (
          <p className="text-[var(--text-muted)]">
            {query.loading
              ? "Reading the verification history…"
              : "No verification has been run against the audit chain in this tenant. The chain exists; nobody has checked it yet, and this screen does not check it for you."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="x-data-table min-w-[34rem]">
              <thead>
                <tr>
                  <th>Verified</th>
                  <th>Range</th>
                  <th>Rows checked</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((run) => (
                  <tr key={run.id}>
                    <td>{dateTime(run.verifiedAt)}</td>
                    <td className="tabular-nums">
                      {run.fromSeq} – {run.toSeq}
                    </td>
                    <td className="tabular-nums">{num(run.rowsChecked)}</td>
                    <td>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge
                          tone={run.intact ? "done" : "rejected"}
                          status={run.intact ? "intact" : "broken"}
                          label={run.intact ? "Intact" : humanise(run.breakKind)}
                        />
                        <span className="text-[10px] text-[var(--text-muted)]">{run.message}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="flex items-start gap-2 text-[var(--text-muted)]">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          An intact chain says these records have not been altered since they were written. It says
          nothing about whether they were true when they were written, and it is not a certification
          of anything.
        </p>
      </div>
    </Disclosure>
  );
}
