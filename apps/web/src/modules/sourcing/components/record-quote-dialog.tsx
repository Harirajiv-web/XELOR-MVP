"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@spine/api/client";
import { inr } from "@spine/format";
import { FieldError } from "@spine/states";
import { Modal } from "@spine/ui/modal";
import {
  describeFailure,
  parseNumeric,
  sourcingApi,
  type FailureNotice,
  type RfqView,
} from "../api";

/**
 * RECORD WHAT A SUPPLIER SENT.
 *
 * This is the manual ERP: nobody's system is integrated, so a buyer types in the answer that
 * arrived by email or over the phone. Two things it is careful about.
 *
 *   THE VENDOR LIST IS THE INVITATION LIST. Only a supplier who was asked can have a quote
 *   recorded, which the server enforces too — a quote from somebody who was never invited is
 *   a quote against a different question.
 *
 *   LANDED COST IS SHOWN AS IT IS TYPED, and it excludes creditable GST on purpose. Tax the
 *   company reclaims is not a cost, and counting it would favour whichever supplier happened
 *   to charge less of something that costs nothing. Only tax that cannot be reclaimed belongs
 *   in a comparison.
 *
 * Re-recording for the same supplier supersedes their previous revision rather than
 * overwriting it, so a price that moved after a conversation is visible as having moved.
 */
export function RecordQuoteDialog({
  rfqId,
  rfq,
  onClose,
  onDone,
}: {
  rfqId: string;
  rfq: RfqView;
  onClose: () => void;
  onDone: () => void;
}): React.JSX.Element {
  const [vendorId, setVendorId] = useState(rfq.invitations[0]?.vendorId ?? "");
  const [unitPrice, setUnitPrice] = useState("");
  const [tooling, setTooling] = useState("");
  const [freight, setFreight] = useState("");
  const [tax, setTax] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [moq, setMoq] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<FailureNotice | null>(null);
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());

  const price = parseNumeric(unitPrice);
  const priceInvalid = unitPrice.trim() !== "" && (price === null || price < 0);
  const canSubmit = vendorId !== "" && price !== null && price >= 0 && !submitting;

  // The same arithmetic the server does, so the number on screen is the number that is stored.
  const landed = useMemo(() => {
    if (price === null) return null;
    return (
      price + (parseNumeric(tooling) ?? 0) + (parseNumeric(freight) ?? 0) + (parseNumeric(tax) ?? 0)
    );
  }, [price, tooling, freight, tax]);

  const late = promisedDate !== "" && promisedDate > rfq.needDate;

  async function submit(): Promise<void> {
    if (!canSubmit || price === null) return;
    setSubmitting(true);
    setFailure(null);
    try {
      const optional = (raw: string, key: string): Record<string, number> => {
        const n = parseNumeric(raw);
        return n === null ? {} : { [key]: n };
      };
      await api.post(
        sourcingApi.quotesPath(rfqId),
        {
          vendorId,
          unitPrice: price,
          ...optional(tooling, "toolingCost"),
          ...optional(freight, "freightCost"),
          ...optional(tax, "nonCreditableTax"),
          ...optional(moq, "moq"),
          ...optional(leadTime, "leadTimeDays"),
          ...(promisedDate ? { promisedDate } : {}),
        },
        { idempotencyKey },
      );
      onDone();
    } catch (err) {
      setFailure(describeFailure(err));
      setSubmitting(false);
    }
  }

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    hint?: string,
    type = "number",
  ): React.JSX.Element => (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-medium text-[var(--text-primary)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => set(e.target.value)}
        className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-[13px] text-[var(--text-primary)]"
      />
      {hint ? <span className="text-[12px] text-[var(--text-muted)]">{hint}</span> : null}
    </label>
  );

  return (
    <Modal
      title={`Record a quote against ${rfq.rfqNo}`}
      subtitle="What the supplier actually sent. Re-recording for the same supplier supersedes their earlier price rather than replacing it."
      onClose={onClose}
      locked={submitting}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-pri" onClick={submit} disabled={!canSubmit}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Record the quote
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

        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-[var(--text-primary)]">Supplier</span>
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-[13px] text-[var(--text-primary)]"
          >
            {rfq.invitations.map((inv) => (
              <option key={inv.vendorId} value={inv.vendorId}>
                {inv.vendorName ?? inv.vendorId}
              </option>
            ))}
          </select>
          <span className="text-[12px] text-[var(--text-muted)]">
            Only suppliers invited to this request can answer it.
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[var(--text-primary)]">
              Unit price (required)
            </span>
            <input
              type="number"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-[13px] text-[var(--text-primary)]"
            />
            {priceInvalid ? <FieldError message="Enter a price of zero or more." /> : null}
          </label>
          {field("Tooling / one-off", tooling, setTooling)}
          {field("Freight", freight, setFreight)}
          {field("Non-creditable tax", tax, setTax, "Only tax the company cannot reclaim.")}
          {field("Promised delivery", promisedDate, setPromisedDate, undefined, "date")}
          {field("Lead time (days)", leadTime, setLeadTime)}
          {field("Minimum order quantity", moq, setMoq)}
        </div>

        {landed !== null ? (
          <p className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-sunken)] p-3 text-[13px] text-[var(--text-secondary)]">
            Landed cost <span className="font-semibold text-[var(--text-primary)]">{inr(landed)}</span>{" "}
            — price plus tooling, freight and non-creditable tax. This is the figure the
            comparison is made on, and it is stored as recorded.
          </p>
        ) : null}

        {late ? (
          <p className="rounded-[var(--radius-control)] border border-[var(--warn)] bg-[var(--warn-soft)] p-3 text-[13px] text-[var(--warn-ink)]">
            That promise is after the need date of {rfq.needDate}. Record it anyway — the
            comparison should show it — but it will almost certainly fail the specification.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
