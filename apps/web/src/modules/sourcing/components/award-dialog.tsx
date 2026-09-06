"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@spine/api/client";
import { inr } from "@spine/format";
import { FieldError } from "@spine/states";
import { Modal } from "@spine/ui/modal";
import { describeFailure, sourcingApi, type FailureNotice, type SupplierQuoteView } from "../api";

const MIN_REASON = 3;

/**
 * THE AWARD — the moment money is committed to one supplier rather than another.
 *
 * Two things this dialog insists on, both because the alternative is a decision nobody can
 * review a year later:
 *
 *   A REASON, TYPED BY A PERSON. Not a dropdown of tidy options — the useful reason is
 *   usually a sentence about a trade-off ("dearer, but it lands before the build"), and a
 *   dropdown would have quietly replaced it with "lowest cost" on every award.
 *
 *   A DIFFERENT PERSON FROM THE ONE WHO RAISED THE REQUEST. That is enforced by the server,
 *   and the refusal is explained here rather than shown as a bare 403 — a control that looks
 *   like a bug gets worked around.
 *
 * Awarding also raises the purchase order, through Purchase's own service, so it carries the
 * normal approval route and numbering. One award, one order: the database holds that promise.
 */
export function AwardDialog({
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
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<FailureNotice | null>(null);
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());

  const tooShort = reason.trim().length < MIN_REASON;

  async function submit(): Promise<void> {
    if (tooShort) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await api.post(
        sourcingApi.awardPath(rfqId),
        {
          quoteId: quote.id,
          awardReason: reason.trim(),
          ...(quote.promisedDate ? { expectedDate: quote.promisedDate } : {}),
        },
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
      title={`Award to ${quote.vendorName ?? "this supplier"}`}
      subtitle="This raises the purchase order. The reason is kept with the award and is what a review reads."
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
            disabled={submitting || tooShort}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Award and raise the order
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

        <dl className="grid grid-cols-2 gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-sunken)] p-3 text-[13px]">
          <div>
            <dt className="text-[12px] text-[var(--text-muted)]">Landed cost</dt>
            <dd className="font-semibold text-[var(--text-primary)]">{inr(quote.landedCost)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-[var(--text-muted)]">Specification</dt>
            <dd className="text-[var(--text-primary)]">
              {quote.technicalGate === "conditional" ? "Conditional pass" : "Pass"}
            </dd>
          </div>
          {quote.gateNote ? (
            <div className="col-span-2">
              <dt className="text-[12px] text-[var(--text-muted)]">Accepted deviation</dt>
              <dd className="text-[var(--text-secondary)]">{quote.gateNote}</dd>
            </div>
          ) : null}
        </dl>

        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-[var(--text-primary)]">
            Why this supplier (required)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] p-2 text-[13px] text-[var(--text-primary)]"
            placeholder="e.g. Meets the need date with certification; the cheaper quote cannot deliver before the build."
          />
          {tooShort ? (
            <FieldError message="Write down why. This is the sentence a review of this decision will read." />
          ) : null}
        </label>
      </div>
    </Modal>
  );
}
