"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@spine/api/client";
import { useCursorList } from "@spine/data/use-query";
import { FieldError } from "@spine/states";
import { Modal } from "@spine/ui/modal";
import {
  describeFailure,
  isoInDays,
  parseNumeric,
  sourcingApi,
  type FailureNotice,
  type ItemOption,
  type RfqView,
  type VendorRow,
} from "../api";

const DEFAULT_NEED_DAYS = 30;
const DEFAULT_DEADLINE_DAYS = 7;

/**
 * NEW REQUEST FOR QUOTATION.
 *
 * The whole value of a structured RFQ is that every supplier is answering the SAME question,
 * so the fields here are the ones that make two answers comparable: the part, the quantity,
 * the drawing revision they are pricing against, and the date the material is actually
 * needed. A request without those gets three answers that cannot be put side by side.
 *
 * At least two suppliers, deliberately. One quote is a price, not a comparison — the server
 * accepts a single invitation because a sole-source part is real, but the form nudges towards
 * a field worth comparing.
 *
 * ONE Idempotency-Key is pinned for as long as this form is open, so a dropped connection
 * after the server committed does not become a second request when somebody presses Save again.
 */
export function NewRfqDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (rfq: RfqView) => void;
}): React.JSX.Element {
  const { rows: items } = useCursorList<ItemOption>(sourcingApi.itemsPath, {
    limit: sourcingApi.pickerPageSize,
  });
  const { rows: vendors } = useCursorList<VendorRow>(sourcingApi.vendorsPath, {
    limit: sourcingApi.pickerPageSize,
  });

  const [title, setTitle] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [drawingRev, setDrawingRev] = useState("");
  const [needDate, setNeedDate] = useState(isoInDays(DEFAULT_NEED_DAYS));
  const [quoteDeadline, setQuoteDeadline] = useState(isoInDays(DEFAULT_DEADLINE_DAYS));
  const [deliveryPlant, setDeliveryPlant] = useState("Pune");
  const [notes, setNotes] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<FailureNotice | null>(null);
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());

  const item = useMemo(() => items.find((i) => i.id === itemId), [items, itemId]);
  const quantity = parseNumeric(qty);
  // The server enforces this too; mirroring it here means the refusal appears next to the
  // field that caused it rather than as a banner after a round trip.
  const deadlineAfterNeed = quoteDeadline > needDate;
  const canSubmit =
    title.trim() !== "" &&
    itemId !== "" &&
    quantity !== null &&
    quantity > 0 &&
    chosen.length > 0 &&
    !deadlineAfterNeed &&
    !submitting;

  function toggle(vendorId: string): void {
    setChosen((prev) =>
      prev.includes(vendorId) ? prev.filter((v) => v !== vendorId) : [...prev, vendorId],
    );
  }

  async function submit(): Promise<void> {
    if (!canSubmit || quantity === null) return;
    setSubmitting(true);
    setFailure(null);
    try {
      const created = await api.post<RfqView>(
        sourcingApi.listPath,
        {
          title: title.trim(),
          itemId,
          qty: quantity,
          uom: item?.uom ?? "nos",
          ...(drawingRev.trim() ? { drawingRev: drawingRev.trim() } : {}),
          needDate,
          quoteDeadline,
          deliveryPlant: deliveryPlant.trim() || "Pune",
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          vendorIds: chosen,
        },
        { idempotencyKey },
      );
      onCreated(created);
    } catch (err) {
      setFailure(describeFailure(err));
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="New request for quotation"
      subtitle="One part, one quantity, one need date — the unit a supplier can actually price."
      onClose={onClose}
      locked={submitting}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-pri" onClick={submit} disabled={!canSubmit}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Raise the request
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
          <span className="text-[13px] font-medium text-[var(--text-primary)]">
            What is being asked for
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. CP-50 casing body — 240 off against the Q3 pump build"
            className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-[13px] text-[var(--text-primary)]"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[var(--text-primary)]">Part</span>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-[13px] text-[var(--text-primary)]"
            >
              <option value="">Choose a part…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.itemCode} — {i.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[var(--text-primary)]">
              Quantity {item ? `(${item.uom})` : ""}
            </span>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-[13px] text-[var(--text-primary)]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[var(--text-primary)]">
              Drawing revision
            </span>
            <input
              type="text"
              value={drawingRev}
              onChange={(e) => setDrawingRev(e.target.value)}
              placeholder="e.g. CAS50-D-REV-C"
              className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-[13px] text-[var(--text-primary)]"
            />
            <span className="text-[12px] text-[var(--text-muted)]">
              A quote against an unnamed revision is an opinion.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[var(--text-primary)]">Deliver to</span>
            <input
              type="text"
              value={deliveryPlant}
              onChange={(e) => setDeliveryPlant(e.target.value)}
              className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-[13px] text-[var(--text-primary)]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[var(--text-primary)]">
              Material needed by
            </span>
            <input
              type="date"
              value={needDate}
              onChange={(e) => setNeedDate(e.target.value)}
              className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-[13px] text-[var(--text-primary)]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[var(--text-primary)]">
              Quotes close on
            </span>
            <input
              type="date"
              value={quoteDeadline}
              onChange={(e) => setQuoteDeadline(e.target.value)}
              className="h-9 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-[13px] text-[var(--text-primary)]"
            />
            {deadlineAfterNeed ? (
              <FieldError message="Quotes have to close on or before the need date — otherwise it is a wish, not a schedule." />
            ) : null}
          </label>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-medium text-[var(--text-primary)]">
            Invite suppliers ({chosen.length} chosen)
          </legend>
          <p className="text-[12px] text-[var(--text-muted)]">
            One quote is a price. Two or more is a comparison, and only an invited supplier can
            answer.
          </p>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-[var(--radius-control)] border border-[var(--border-input)] p-2">
            {vendors.map((v) => (
              <label key={v.id} className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input type="checkbox" checked={chosen.includes(v.id)} onChange={() => toggle(v.id)} />
                <span className="text-[var(--text-primary)]">{v.name}</span>
              </label>
            ))}
            {vendors.length === 0 ? (
              <p className="text-[12px] text-[var(--text-muted)]">No suppliers on the vendor master yet.</p>
            ) : null}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-[var(--text-primary)]">
            What the supplier needs to know
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Material grade, test method, certification required…"
            className="rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] p-2 text-[13px] text-[var(--text-primary)]"
          />
        </label>
      </div>
    </Modal>
  );
}
