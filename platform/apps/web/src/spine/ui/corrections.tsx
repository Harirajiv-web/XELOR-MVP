"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, History, Lock, RotateCcw, Loader2 } from "lucide-react";
import { api } from "@spine/api/client";
import { Modal } from "@spine/ui/modal";
import { cn } from "@spine/ui/cn";

/**
 * CORRECTING A MISTAKE — the three pieces of UI every document screen shares.
 *
 * The product could create 222 kinds of thing and change almost none of them, so a wrong
 * quantity was permanent and people worked around it by cancelling and re-keying. This is
 * the front of the fix. The rules all live in the API's edit policy; nothing here decides
 * anything, which is what keeps the button and the endpoint from disagreeing.
 *
 * The three pieces, and the reason each exists rather than being folded into the others:
 *
 *   <EditButton>       asks the server whether this document may change, and when it may
 *                      not, SAYS WHY ON THE BUTTON. A greyed-out control with no
 *                      explanation is the single most common way an ERP teaches people to
 *                      stop trying; "Approved on 4 Aug — use Amend" teaches them the system.
 *
 *   <ConfirmChanges>   shows old → new before anything is written, and collects the reason
 *                      when the document has already been relied on. Someone amending a
 *                      confirmed order should see the two numbers side by side before the
 *                      customer finds out about the second one.
 *
 *   <DocumentHistory>  every correction ever made, from the hash-chained audit trail. This
 *                      is what makes the whole feature safe to offer: an edit that leaves
 *                      no trace is a liability, and an edit that leaves one is a record.
 */

/* ------------------------------------------------------------------ types -- */

export type EditTier = "open" | "amend" | "closed";

export type CorrectionMethod =
  | "reversing_entry"
  | "credit_note"
  | "stock_adjustment"
  | "new_version"
  | "none";

/** Exactly what `GET …/edit-policy` returns. Mirrors the platform's `EditVerdict`. */
export interface EditPolicy {
  tier: EditTier;
  editable: boolean;
  reasonRequired: boolean;
  reapprovalRequired: boolean;
  correctBy: CorrectionMethod;
  reason: string;
  status?: string;
  revisionNo?: number;
}

export interface FieldChange {
  field: string;
  from: string;
  to: string;
  redacted?: boolean;
}

export interface HistoryEntry {
  seq: number;
  at: string;
  actorId: string;
  action: string;
  changeSet: { changes: FieldChange[]; reason?: string; revisionNo?: number };
}

/** What each CLOSED document offers instead of an edit. */
const CORRECTION_LABEL: Record<CorrectionMethod, string> = {
  reversing_entry: "Reverse this entry",
  credit_note: "Raise a credit note",
  stock_adjustment: "Post a stock adjustment",
  new_version: "Publish a new version",
  none: "",
};

/* ------------------------------------------------------------------- hook -- */

/**
 * Ask the server whether this document may be edited.
 *
 * The verdict is NOT computed here, and that is the point. A copy of the policy in the
 * browser would be a second source of truth that drifts — and the direction it drifts is
 * always the same: the button says yes, the endpoint says no, and the user has already
 * filled in the form.
 *
 * `null` while loading, so a caller can render a quiet button rather than flashing a wrong
 * label. Failure resolves to a CLOSED verdict: if we cannot establish that an edit is
 * allowed, we do not offer one.
 */
export function useEditPolicy(path: string | null): EditPolicy | null {
  const [policy, setPolicy] = useState<EditPolicy | null>(null);

  useEffect(() => {
    if (!path) {
      setPolicy(null);
      return;
    }
    let live = true;
    api
      .get<EditPolicy>(path)
      .then((p) => {
        if (live) setPolicy(p);
      })
      .catch(() => {
        if (live) {
          setPolicy({
            tier: "closed",
            editable: false,
            reasonRequired: false,
            reapprovalRequired: false,
            correctBy: "none",
            reason: "We could not check whether this can be edited. Reload and try again.",
          });
        }
      });
    return () => {
      live = false;
    };
  }, [path]);

  return policy;
}

/* ----------------------------------------------------------------- button -- */

/**
 * The Edit button, in all four of its states.
 *
 * Loading, editable-as-draft, editable-as-amendment, and refused. The refused state is the
 * one worth caring about: it stays visible, carries the reason as its tooltip AND as text
 * underneath, and where the API offered a `correctBy` it turns into a button for THAT
 * instead. A dead end is what makes people ring the person who built the system.
 */
export function EditButton({
  policy,
  onEdit,
  onCorrectInstead,
  label = "Edit",
  className,
}: {
  policy: EditPolicy | null;
  onEdit: () => void;
  /** Called when the user takes the alternative a CLOSED document offers. */
  onCorrectInstead?: (method: CorrectionMethod) => void;
  label?: string;
  className?: string;
}): React.JSX.Element {
  if (!policy) {
    return (
      <button
        type="button"
        disabled
        className={cn("btn btn-ghost gap-2 opacity-60", className)}
        aria-label="Checking whether this can be edited"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {label}
      </button>
    );
  }

  if (!policy.editable) {
    const alternative = CORRECTION_LABEL[policy.correctBy];
    return (
      <div className={cn("flex flex-col items-start gap-1", className)}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            title={policy.reason}
            className="btn btn-ghost gap-2 opacity-55"
          >
            <Lock className="h-4 w-4" aria-hidden />
            {label}
          </button>
          {alternative && onCorrectInstead ? (
            <button
              type="button"
              onClick={() => onCorrectInstead(policy.correctBy)}
              className="btn btn-ghost gap-2"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              {alternative}
            </button>
          ) : null}
        </div>
        {/* The reason in full, not only as a tooltip: a tooltip is invisible on a tablet,
            which is most of the shop floor. */}
        <p className="max-w-prose text-[12px] leading-[1.45] text-[var(--text-muted)]">
          {policy.reason}
        </p>
      </div>
    );
  }

  const amending = policy.tier === "amend";
  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <button
        type="button"
        onClick={onEdit}
        title={policy.reason}
        className={cn("btn gap-2", amending ? "btn-ghost" : "btn-pri")}
      >
        <Pencil className="h-4 w-4" aria-hidden />
        {amending ? "Amend" : label}
        {policy.revisionNo && policy.revisionNo > 0 ? (
          <span className="rounded-full bg-[var(--brand-soft)] px-2 py-[1px] text-[11px] font-semibold text-[var(--brand)]">
            rev {policy.revisionNo}
          </span>
        ) : null}
      </button>
      {amending ? (
        <p className="max-w-prose text-[12px] leading-[1.45] text-[var(--text-muted)]">
          {policy.reason}
        </p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- confirm -- */

/**
 * Show what is about to change, and collect the reason when one is required.
 *
 * Between the form and the request, deliberately. An amendment to a confirmed order is the
 * kind of thing people want to see once more before it goes — and a reason typed while
 * looking at "120 → 96" is a better reason than one typed from memory afterwards.
 *
 * Renders nothing when there is nothing to confirm, so a caller can mount it
 * unconditionally.
 */
export function ConfirmChanges({
  changes,
  reasonRequired,
  reapprovalRequired,
  title = "Confirm this change",
  onCancel,
  onConfirm,
  busy = false,
}: {
  changes: FieldChange[];
  reasonRequired: boolean;
  reapprovalRequired?: boolean;
  title?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  busy?: boolean;
}): React.JSX.Element | null {
  const [reason, setReason] = useState("");
  const enough = !reasonRequired || reason.trim().length >= 3;

  const confirm = useCallback(() => {
    if (enough && !busy) onConfirm(reason.trim());
  }, [enough, busy, onConfirm, reason]);

  if (changes.length === 0) return null;

  return (
    <Modal
      title={title}
      subtitle={`${changes.length} field${changes.length === 1 ? "" : "s"} will change`}
      onClose={onCancel}
      locked={busy}
      width="max-w-2xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Go back
          </button>
          <button
            type="button"
            className="btn btn-pri gap-2"
            onClick={confirm}
            disabled={!enough || busy}
            title={enough ? undefined : "Please say why in a few words"}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save the change
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {reapprovalRequired ? (
          <p className="rounded-[10px] border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-[13px] leading-[1.5] text-[var(--warn-ink)]">
            This document has already been approved. Saving sends it back through approval —
            nobody is committed to the new version until it is approved again.
          </p>
        ) : null}

        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              <th className="border-b border-[var(--border-subtle)] pb-2 pr-3 font-semibold">Field</th>
              <th className="border-b border-[var(--border-subtle)] pb-2 pr-3 font-semibold">Was</th>
              <th className="border-b border-[var(--border-subtle)] pb-2 font-semibold">Becomes</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((c) => (
              <tr key={c.field} className="align-top">
                <td className="border-b border-[var(--border-subtle)] py-2 pr-3 font-medium">
                  {humanField(c.field)}
                </td>
                <td className="border-b border-[var(--border-subtle)] py-2 pr-3 text-[var(--text-muted)] line-through">
                  {c.from}
                </td>
                <td className="border-b border-[var(--border-subtle)] py-2 font-semibold text-[var(--ok-ink)]">
                  {c.to}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {reasonRequired ? (
          <label className="block space-y-1">
            <span className="text-[13px] font-medium">
              Why are you making this change?{" "}
              <span className="text-[var(--bad)]">required</span>
            </span>
            <textarea
              className="field min-h-[72px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer reduced the call-off after the Chakan line stoppage"
              autoFocus
            />
            <span className="block text-[12px] text-[var(--text-muted)]">
              This is kept with the document for good. Months from now it is the only thing that
              explains the number.
            </span>
          </label>
        ) : null}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- history -- */

/**
 * Every correction ever made to one document, newest first.
 *
 * Reads the hash-chained audit trail through the document's own read permission, so
 * whoever may look at SO-0007 may see that its quantity went from 120 to 96 and why —
 * without needing the audit role, which would push people back to asking over WhatsApp.
 */
export function DocumentHistory({ path }: { path: string }): React.JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get<{ entries: HistoryEntry[] }>(path)
      .then((r) => {
        if (live) setEntries(r.entries);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [path]);

  if (failed) {
    return (
      <p className="text-[13px] text-[var(--text-muted)]">
        The change history could not be loaded.
      </p>
    );
  }

  if (!entries) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading the change history…
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
        <History className="h-4 w-4" aria-hidden />
        This document has never been changed since it was created.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {entries.map((e) => {
        const amended = e.action.endsWith(".amended");
        return (
          <li
            key={e.seq}
            className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface)] p-3"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className={cn(
                  "rounded-full px-2 py-[1px] text-[11px] font-semibold",
                  amended
                    ? "bg-[var(--warn-soft)] text-[var(--warn-ink)]"
                    : "bg-[var(--brand-soft)] text-[var(--brand)]",
                )}
              >
                {amended ? "Amended" : "Corrected"}
                {e.changeSet.revisionNo !== undefined ? ` · rev ${e.changeSet.revisionNo}` : ""}
              </span>
              <time className="text-[12px] text-[var(--text-muted)]" dateTime={e.at}>
                {formatWhen(e.at)}
              </time>
            </div>

            <ul className="mt-2 space-y-1">
              {e.changeSet.changes.map((c) => (
                <li key={c.field} className="text-[13px] leading-[1.5]">
                  <span className="font-medium">{humanField(c.field)}</span>
                  {c.redacted ? (
                    <span className="text-[var(--text-muted)]"> changed (value hidden)</span>
                  ) : (
                    <>
                      <span className="text-[var(--text-muted)] line-through"> {c.from}</span>
                      <span className="text-[var(--text-muted)]"> → </span>
                      <span className="font-semibold">{c.to}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>

            {e.changeSet.reason ? (
              <p className="mt-2 border-l-2 border-[var(--border-subtle)] pl-3 text-[13px] italic leading-[1.5] text-[var(--text-muted)]">
                “{e.changeSet.reason}”
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ----------------------------------------------------------------- helpers -- */

/**
 * `custPoNo` → "Cust PO No". A column name is not a label, and the audit trail is read by
 * people who never saw the schema.
 */
function humanField(field: string): string {
  const spaced = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.]/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** DD MMM YYYY, HH:MM — the §7 date convention, in IST, without pulling in a date library. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

/**
 * Compare what the form holds against what the document said, and return only what moved.
 *
 * The same shape the server computes, so the confirmation dialog shows exactly what the
 * audit trail will record. Not a substitute for the server's diff — that one is the record
 * — but showing a user one thing and storing another is its own kind of lie.
 */
export function localChanges<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: readonly (keyof T & string)[],
): FieldChange[] {
  const out: FieldChange[] = [];
  for (const field of fields) {
    if (!(field in after)) continue;
    const from = display(before[field]);
    const to = display(after[field]);
    if (from !== to) out.push({ field, from, to });
  }
  return out;
}

function display(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(empty)";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}
