"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Plus, Search, ShieldAlert, Wrench } from "lucide-react";
import { api } from "@spine/api/client";
import { Can } from "@spine/access/permissions";
import { DataTable, type Column } from "@spine/data/data-table";
import { useQuery } from "@spine/data/use-query";
import { date, dateTime, humanise } from "@spine/format";
import type { ScreenProps } from "@spine/registry/manifest";
import { PageHeader } from "@spine/shell/page-header";
import { Empty, ErrorState } from "@spine/states";
import { Disclosure } from "@spine/ui/disclosure";
import { Modal } from "@spine/ui/modal";
import { StatusBadge } from "@spine/ui/status-badge";
import type { SafetyFinding, SafetyKind, SafetyWorkOrder } from "../api";
import {
  daysUntil,
  isFindingOpen,
  isPastDue,
  readSafetyRef,
  safetyApi,
  safetyKindLabel,
  safetyRef,
  SAFETY_KINDS,
  todayIso,
} from "../api";

/**
 * HAZARDS, NEAR-MISSES AND INCIDENTS.
 *
 * The screen a fitter, a supervisor or a visitor uses to say that something is unsafe, and
 * the screen the person who owns it comes back to.
 *
 * WHY THIS WRITES TO THE QUALITY FINDING REGISTER. Because it is the same register. A
 * near-miss and a defect both need containing before they need explaining, both need a
 * cause confirmed before anybody spends money on a fix, and both need somebody to come
 * back later and check the fix worked. Building Safety its own table would have produced a
 * second overdue list, a second owner column, and — the expensive part — a genuine
 * argument about which register is the one an auditor should be shown. There is one.
 *
 * THE ONE THING THIS SCREEN CANNOT DO, and says so rather than hiding it: it cannot close
 * anything. The API closes a finding in exactly one place — when a corrective action
 * against it is verified EFFECTIVE. That is not an omission to be worked around; it is the
 * property that makes the register worth keeping, because it means nothing on it was ever
 * closed by somebody deciding it had gone quiet.
 */
export default function IncidentsScreen(_props: ScreenProps): React.JSX.Element {
  const findings = useQuery<SafetyFinding[]>(safetyApi.findingsPath);
  const [filter, setFilter] = useState("");
  const [showOpenOnly, setShowOpenOnly] = useState(true);
  const [raising, setRaising] = useState(false);
  const [selectedNo, setSelectedNo] = useState("");

  const safety = useMemo(() => {
    const all = findings.data ?? [];
    return all
      .map((finding) => ({ finding, ref: readSafetyRef(finding.sourceRef) }))
      .filter((row): row is { finding: SafetyFinding; ref: NonNullable<ReturnType<typeof readSafetyRef>> } =>
        row.ref !== null,
      );
  }, [findings.data]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return safety.filter(({ finding, ref }) => {
      if (showOpenOnly && !isFindingOpen(finding)) return false;
      if (!q) return true;
      return (
        finding.findingNo.toLowerCase().includes(q) ||
        finding.title.toLowerCase().includes(q) ||
        finding.description.toLowerCase().includes(q) ||
        finding.ownerRef.toLowerCase().includes(q) ||
        (ref.area?.toLowerCase().includes(q) ?? false) ||
        safetyKindLabel(ref.kind).toLowerCase().includes(q)
      );
    });
  }, [safety, filter, showOpenOnly]);

  const open = safety.filter(({ finding }) => isFindingOpen(finding));
  const overdue = open.filter(({ finding }) => isPastDue(finding.dueDate));
  const uncontained = open.filter(
    ({ finding }) => finding.severity === "critical" && finding.containment === null,
  );
  const selected = safety.find(({ finding }) => finding.findingNo === selectedNo) ?? rows[0];

  const columns: ReadonlyArray<Column<(typeof safety)[number]>> = [
    {
      key: "reference",
      header: "Reference",
      width: "w-44",
      render: ({ finding }) => (
        <div>
          <button
            type="button"
            className="text-left font-[var(--font-mono)] font-semibold text-[var(--brand)] underline-offset-4 hover:underline"
            onClick={() => setSelectedNo(finding.findingNo)}
            aria-label={`Open ${finding.findingNo}`}
          >
            {finding.findingNo}
          </button>
          <p className="text-[11px] text-[var(--text-muted)]">Reported {date(finding.createdAt)}</p>
        </div>
      ),
    },
    {
      key: "kind",
      header: "What was reported",
      width: "w-40",
      render: ({ ref }) => (
        <div>
          <p className="font-semibold text-[var(--text-primary)]">{safetyKindLabel(ref.kind)}</p>
          <p className="text-[11px] text-[var(--text-muted)]">{ref.area ?? "Area not recorded"}</p>
        </div>
      ),
    },
    {
      key: "what",
      header: "Detail",
      render: ({ finding }) => (
        <div>
          <b className="text-[var(--text-primary)]">{finding.title}</b>
          <p className="line-clamp-2 text-[12px] text-[var(--text-secondary)]">{finding.description}</p>
        </div>
      ),
    },
    {
      key: "severity",
      header: "Severity",
      width: "w-28",
      render: ({ finding }) => <StatusBadge status={finding.severity} />,
    },
    {
      key: "stage",
      header: "Stage",
      width: "w-44",
      render: ({ finding }) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={finding.status} />
          {finding.containment === null && isFindingOpen(finding) ? (
            <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              Nothing recorded to make it safe
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "owner",
      header: "Owner / review date",
      width: "w-52",
      render: ({ finding }) => <ReviewDateCell finding={finding} />,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Hazards & incidents"
        subtitle="Hazards, near-misses and incidents, on the same register as quality findings."
        meta={
          safety.length
            ? [
                { label: "Open", value: String(open.length) },
                { label: "Past review date", value: String(overdue.length) },
                { label: "Critical, not contained", value: String(uncontained.length) },
              ]
            : []
        }
        actions={
          <Can permission="quality.inspection.execute">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setRaising(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Report something
            </button>
          </Can>
        }
      />

      <StatutoryBanner />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by reference, area, owner or wording…"
            aria-label="Filter the safety register"
            className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
        </div>
        <label className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={showOpenOnly}
            onChange={(event) => setShowOpenOnly(event.target.checked)}
          />
          Open entries only
        </label>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={findings.loading}
        error={findings.error}
        onReload={findings.reload}
        rowKey={({ finding }) => finding.id}
        caption="Hazards, near-misses and incidents reported through Safety"
        empty={
          filter || !showOpenOnly ? (
            <Empty
              title="Nothing matches"
              body="No entry on the safety register matched that filter. Clearing it shows everything reported."
            />
          ) : (
            <Empty
              title="Nothing reported through Safety yet"
              body="Hazards, near-misses and incidents raised here are filed on the shared non-conformance register under a SAFETY reference. Quality findings raised elsewhere are not shown on this screen."
            />
          )
        }
      />

      {selected ? (
        <FindingDetail
          key={selected.finding.findingNo}
          finding={selected.finding}
          kind={selected.ref.kind}
          area={selected.ref.area}
          onChanged={findings.reload}
        />
      ) : null}

      <Can permission="mnt.mwo.read">
        <SafetyFlaggedWork />
      </Can>

      <Disclosure
        title="How these entries are stored, and what that does not give you"
        hint="Read this before quoting the register to anybody"
      >
        <ul className="ml-4 list-disc space-y-2">
          <li>
            An entry raised here is a row on the shared non-conformance register, filed with a
            reference beginning <code className="font-[var(--font-mono)]">SAFETY/</code>. There is no
            separate incident table in this build, and this module adds none.
          </li>
          <li>
            That reference is a convention this screen applies, not a constraint the database
            enforces. A quality finding whose reference was typed to start with{" "}
            <code className="font-[var(--font-mono)]">SAFETY/</code> would appear on this list.
          </li>
          <li>
            Severity uses the register's own three values — critical, major, minor. They are not
            safety-specific terms and they carry no statutory meaning.
          </li>
          <li>
            Nothing here is evidence of compliance with ISO 9001, IATF 16949 or any other standard,
            and no screen in this module will tell you that you are audit-ready. Keeping records is
            one input to an audit; it is not the audit and it is not a management system.
          </li>
        </ul>
      </Disclosure>

      {raising ? (
        <RaiseDialog
          onClose={() => setRaising(false)}
          onSaved={() => {
            setRaising(false);
            findings.reload();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * THE BANNER THAT HAS TO BE ON THIS SCREEN EVERY TIME SOMEBODY OPENS IT.
 *
 * A workplace injury in an Indian factory is not an administrative matter. §88 of the
 * Factories Act 1948 requires notice to the authorities, the accident register is
 * prescribed (generally Form 18, with state rules varying), and the clock starts when the
 * accident happens rather than when anybody opens a screen.
 *
 * This module does none of that, and the failure mode of not saying so is specific and
 * bad: a supervisor types an incident in here, sees a tidy record with a reference number,
 * and reasonably concludes the reporting is done. It is a banner rather than a line in a
 * help page because the moment it needs to be read is the moment somebody is typing.
 */
function StatutoryBanner(): React.JSX.Element {
  return (
    <div className="x-notice" data-tone="warning" role="note">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">This is not the statutory accident register.</p>
        <p>
          XELOR does not produce Form 18, does not keep the register prescribed under §88 of the
          Factories Act 1948, and does not run the statutory notice clock — which starts when the
          accident happens, not when this screen is opened. Reporting an injury here does not notify
          anybody outside this system. The plant&rsquo;s statutory registers and the people who
          maintain them sit with HRM; the state rules that apply to this site are the authority, not
          this screen.
        </p>
      </div>
    </div>
  );
}

/** Owner and review date, with lateness decided by comparing two dates and nothing else. */
function ReviewDateCell({ finding }: { finding: SafetyFinding }): React.JSX.Element {
  const open = isFindingOpen(finding);
  const late = open && isPastDue(finding.dueDate);
  const days = daysUntil(finding.dueDate);
  return (
    <div>
      <p className="text-[var(--text-primary)]">{finding.ownerRef || "Unassigned"}</p>
      {finding.dueDate === null ? (
        <p className="text-[11px] text-[var(--text-muted)]">No review date set</p>
      ) : late ? (
        <StatusBadge
          tone="overdue"
          label={`${date(finding.dueDate)} · ${Math.abs(days ?? 0)}d late`}
          status="overdue"
        />
      ) : (
        <p className="text-[11px] text-[var(--text-muted)]">
          Review by {date(finding.dueDate)}
          {open && days !== null && days <= 3 ? ` · ${days === 0 ? "today" : `in ${days}d`}` : ""}
        </p>
      )}
    </div>
  );
}

/**
 * One entry, and the two things that can still be recorded against it here.
 *
 * CONTAINMENT is what was done to make the place safe while nobody yet knows why it
 * happened. It comes first because it is the only step with a clock on it.
 *
 * ROOT CAUSE cannot be recorded until containment is, and the API refuses it rather than
 * this screen hiding the button — the refusal is shown, because a disabled control teaches
 * nothing and a refusal with a reason teaches the order of the loop.
 */
function FindingDetail({
  finding,
  kind,
  area,
  onChanged,
}: {
  finding: SafetyFinding;
  kind: SafetyKind;
  area: string | null;
  onChanged: () => void;
}): React.JSX.Element {
  return (
    <section className="x-home-panel" aria-labelledby="safety-finding-detail">
      <div className="x-home-panel-head flex-wrap gap-3">
        <div>
          <h2 id="safety-finding-detail" className="x-section-heading">
            {finding.findingNo} · {finding.title}
          </h2>
          <p>
            {safetyKindLabel(kind)}
            {area ? ` · ${area}` : ""} · reported {dateTime(finding.createdAt)} · owner{" "}
            {finding.ownerRef || "unassigned"}
          </p>
        </div>
        <StatusBadge status={finding.status} />
      </div>

      <div className="space-y-5 p-5">
        <p className="text-[13px] leading-6 text-[var(--text-secondary)]">{finding.description}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <StepCard
            label="Made safe"
            value={finding.containment}
            fallback="Nothing recorded yet. Until it is, nobody reading this register can tell whether the place is safe."
          />
          <StepCard
            label="Confirmed cause"
            value={finding.rootCause}
            fallback="Not confirmed. A corrective action cannot be opened until it is — the API refuses."
          />
        </div>

        <Can permission="quality.disposition.decide">
          <div className="grid gap-4 sm:grid-cols-2">
            <StepForm
              title="Record what was done to make it safe"
              field="containment"
              placeholder="Area barriered off, machine isolated and locked out, spill absorbed and bunded…"
              submitLabel="Record containment"
              path={safetyApi.findingContainPath(finding.findingNo)}
              onSaved={onChanged}
            />
            <StepForm
              title="Record the confirmed cause"
              field="rootCause"
              placeholder="What the investigation established — not the first plausible explanation."
              submitLabel="Confirm cause"
              path={safetyApi.findingRootCausePath(finding.findingNo)}
              onSaved={onChanged}
            />
          </div>
        </Can>

        <div className="x-notice" role="note">
          <div>
            <p className="font-semibold">There is no button here to close this.</p>
            <p>
              An entry closes when a corrective action against it is verified as EFFECTIVE, and in no
              other way. Open Corrective actions to raise one against {finding.findingNo}, record what
              was done, and record the evidence that it worked. A register somebody can close by
              deciding a thing has gone quiet is not worth keeping.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function StepCard({
  label,
  value,
  fallback,
}: {
  label: string;
  value: string | null;
  fallback: string;
}): React.JSX.Element {
  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
        {label}
      </p>
      <p
        className={
          value
            ? "mt-1 text-[13px] leading-6 text-[var(--text-primary)]"
            : "mt-1 text-[12px] leading-6 text-[var(--text-muted)]"
        }
      >
        {value ?? fallback}
      </p>
    </div>
  );
}

/** One narrow POST with one text field. The server's refusal is shown verbatim. */
function StepForm({
  title,
  field,
  placeholder,
  submitLabel,
  path,
  onSaved,
}: {
  title: string;
  field: "containment" | "rootCause";
  placeholder: string;
  submitLabel: string;
  path: string;
  onSaved: () => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get(field) ?? "").trim();
    if (text.length < 3) {
      setError("Write at least a few words. A blank entry on this register is worse than none.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.post(path, { [field]: text });
      form.reset();
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-2" onSubmit={(event) => void submit(event)}>
      <label className="x-field">
        {title}
        <textarea name={field} rows={3} maxLength={2000} placeholder={placeholder} />
      </label>
      {error ? (
        <div role="alert" className="x-notice" data-tone="error">
          {error}
        </div>
      ) : null}
      <button className="btn btn-secondary btn-sm" disabled={busy}>
        {busy ? "Recording…" : submitLabel}
      </button>
    </form>
  );
}

/**
 * Reporting something.
 *
 * The form is short on purpose. The person filling it in is standing somewhere they would
 * rather not be standing, and every extra field is a reason to walk away and tell nobody.
 * Owner and review date are the two that are NOT optional in spirit even though the API
 * allows the date to be absent: an entry with no owner is a note, and an entry with no
 * review date will never appear on an overdue list, which means it will never be looked at
 * again.
 */
function RaiseDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<SafetyKind>("near_miss");
  const help = SAFETY_KINDS.find((k) => k.value === kind)?.help ?? "";

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const text = (key: string): string => String(values.get(key) ?? "").trim();
    setError(null);
    setBusy(true);
    try {
      await api.post(safetyApi.findingsPath, {
        // `manual` is the register's own word for "a person raised this directly" — the
        // other source types all name a document this did not come from.
        sourceType: "manual",
        sourceRef: safetyRef(kind, text("area")),
        title: text("title"),
        description: text("description"),
        severity: text("severity") || "minor",
        ownerRef: text("ownerRef"),
        ...(text("dueDate") ? { dueDate: text("dueDate") } : {}),
      });
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Report a hazard, near miss or incident"
      subtitle="Filed on the shared non-conformance register, with an owner and a date somebody will be asked about."
      onClose={onClose}
      locked={busy}
    >
      <form className="space-y-5" onSubmit={(event) => void submit(event)}>
        <div className="x-form-grid">
          <label className="x-field">
            What are you reporting?
            <select
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as SafetyKind)}
            >
              {SAFETY_KINDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <small>{help}</small>
          </label>
          <label className="x-field">
            Where
            <input name="area" maxLength={80} placeholder="Press shop, bay 3" data-autofocus />
            <small>The area or machine. Kept with the entry so the same place can be counted twice.</small>
          </label>
          <label className="x-field sm:col-span-2">
            In one line
            <input name="title" required minLength={3} maxLength={200} placeholder="Guard interlock bypassed on press 4" />
          </label>
          <label className="x-field sm:col-span-2">
            What happened, or what could happen
            <textarea
              name="description"
              required
              minLength={3}
              rows={3}
              maxLength={2000}
              placeholder="Say what you saw, not what you concluded. The cause is confirmed later, by somebody who has looked."
            />
          </label>
          <label className="x-field">
            How serious
            <select name="severity" defaultValue="minor">
              <option value="critical">Critical</option>
              <option value="major">Major</option>
              <option value="minor">Minor</option>
            </select>
            <small>
              The register&rsquo;s own three values. They carry no statutory meaning and do not decide
              anything automatically.
            </small>
          </label>
          <label className="x-field">
            Owner
            <input name="ownerRef" required maxLength={120} placeholder="Who will deal with this" />
          </label>
          <label className="x-field sm:col-span-2">
            Review by
            <input type="date" name="dueDate" min={todayIso()} />
            <small>
              Without a date this never appears on an overdue list, which in practice means it is
              never looked at again.
            </small>
          </label>
        </div>

        <div className="x-notice" data-tone="warning" role="note">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            If somebody has been hurt, this entry is not the statutory record and filing it notifies
            nobody outside this system. The accident register and the notice required under §88 of the
            Factories Act 1948 are kept elsewhere, to state-specific rules, on a clock that has already
            started.
          </div>
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
            {busy ? "Recording…" : "Record it"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * The other way a safety matter reaches this plant's records: somebody flagged a
 * maintenance job.
 *
 * `isSafetyRelated` is a real column set by `POST /maintenance/work-orders/:no/safety-flag`,
 * and `incidentRef` is the handoff reference that endpoint mints. It is shown here rather
 * than merged into the register above because it genuinely is a different record with a
 * different owner — pretending otherwise would put rows on the safety register that the
 * safety register cannot contain, investigate or close.
 */
function SafetyFlaggedWork(): React.JSX.Element {
  const board = useQuery<SafetyWorkOrder[]>(safetyApi.workOrdersPath);
  const flagged = (board.data ?? []).filter((wo) => wo.isSafetyRelated);

  if (board.error) {
    return (
      <section className="x-home-panel">
        <div className="p-5">
          <ErrorState error={board.error} onRetry={board.reload} />
        </div>
      </section>
    );
  }

  return (
    <section className="x-home-panel" aria-labelledby="safety-flagged-work">
      <div className="x-home-panel-head flex-wrap gap-3">
        <div>
          <h2 id="safety-flagged-work" className="x-section-heading">
            Maintenance work flagged as safety-related
          </h2>
          <p>
            Live work orders somebody marked safety-related. A separate record with a separate owner —
            not an entry on the register above.
          </p>
        </div>
      </div>
      {flagged.length === 0 ? (
        <p className="p-5 text-[13px] text-[var(--text-secondary)]">
          {board.loading
            ? "Reading the maintenance board…"
            : "No live maintenance work is flagged as safety-related."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="x-data-table min-w-[40rem]">
            <thead>
              <tr>
                <th>Work order</th>
                <th>Asset</th>
                <th>Job</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {flagged.map((wo) => (
                <tr key={wo.id}>
                  <td className="font-[var(--font-mono)]">{wo.mwoNo}</td>
                  <td>
                    <b className="text-[var(--text-primary)]">{wo.assetCode}</b>
                    <div className="text-[11px] text-[var(--text-muted)]">{wo.assetName}</div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Wrench className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
                      {wo.title}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={wo.status} />
                    {wo.holdReason ? (
                      <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {humanise(wo.holdReason)}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
