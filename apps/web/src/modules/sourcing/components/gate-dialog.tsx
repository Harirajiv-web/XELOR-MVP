"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@spine/api/client";
import { FieldError } from "@spine/states";
import { Modal } from "@spine/ui/modal";
import { describeFailure, sourcingApi, type FailureNotice, type SupplierQuoteView, type TechnicalGate } from "../api";

/**
 * THE TECHNICAL GATE — a person's judgement against the released drawing, recorded before
 * anything is ranked on price.
 *
 * Three answers, and the wording matters because the consequences differ:
 *
 *   PASS         meets the specification as released.
 *   CONDITIONAL  deviates, and somebody has accepted the deviation. The note is REQUIRED —
 *                a conditional pass whose condition was never written down is indistinguishable
 *                from a pass, and it is the one an auditor asks about.
 *   FAIL         cannot be used. The server will refuse to award it however cheap it is, so
 *                this dialog says that plainly rather than letting it be discovered later.
 */
export function GateDialog({
  rfqId,
  quote,
  onClose,
  onDone,
}: {
  rfqId: string;
  quote: SupplierQuoteView;
  onClose: () => void;
  onDone: () => void;
}): React.JSX.Element {
  const [gate, setGate] = useState<Exclude<TechnicalGate, "pending">>(
    quote.technicalGate === "pending" ? "pass" : quote.technicalGate,
  );
  const [note, setNote] = useState(quote.gateNote ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<FailureNotice | null>(null);
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());

  const noteRequired = gate === "conditional";
  const noteMissing = noteRequired && note.trim().length === 0;

  async function submit(): Promise<void> {
    if (noteMissing) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await api.post(
        sourcingApi.gatePath(rfqId, quote.id),
        { gate, ...(note.trim() ? { note: note.trim() } : {}) },
        { idempotencyKey },
      );
      onDone();
    } catch (err) {
      setFailure(describeFailure(err));
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={`Judge ${quote.vendorName ?? "this quote"} against the specification`}
      subtitle="Recorded before any comparison on price. A failed quote cannot be awarded, whatever it costs."
      onClose={onClose}
      locked={submitting}
      width="max-w-xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-pri"
            onClick={submit}
            disabled={submitting || noteMissing}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Record the judgement
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {failure ? (
          <div className="rounded-[var(--radius-control)] border border-[var(--bad)] bg-[var(--bad-soft)] p-3">
            <p className="text-[13px] font-semibold text-[var(--bad-ink)]">{failure.title}</p>
            <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{failure.body}</p>
          </div>
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-medium text-[var(--text-primary)]">
            Against the released drawing, this quote
          </legend>
          {(
            [
              ["pass", "Meets the specification", "No deviation to record."],
              [
                "conditional",
                "Deviates, and the deviation is accepted",
                "Write down what was accepted and by whom — this is the note an auditor reads.",
              ],
              [
                "fail",
                "Cannot meet the specification",
                "It will not be awardable at any price. This is the control working, not a fault.",
              ],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-control)] border border-[var(--border-input)] p-3"
            >
              <input
                type="radio"
                name="technical-gate"
                value={value}
                checked={gate === value}
                onChange={() => setGate(value)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-[var(--text-primary)]">{label}</span>
                <span className="block text-[12px] text-[var(--text-secondary)]">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-[var(--text-primary)]">
            {noteRequired ? "What was accepted, and by whom (required)" : "Note (optional)"}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] p-2 text-[13px] text-[var(--text-primary)]"
            placeholder={
              noteRequired
                ? "e.g. Offers SS316L in place of SS316; engineering accepted on this revision."
                : "Anything worth recording about this judgement."
            }
          />
          {noteMissing ? (
            <FieldError message="A conditional pass needs its condition written down." />
          ) : null}
        </label>
      </div>
    </Modal>
  );
}
