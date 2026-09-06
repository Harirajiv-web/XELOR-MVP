"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@spine/api/client";
import { AppError } from "@spine/api/errors";
import { useCursorList } from "@spine/data/use-query";
import { inr, num } from "@spine/format";
import { FieldError } from "@spine/states";
import { Modal } from "@spine/ui/modal";
import type {
  CreateQuotationBody,
  CreateQuotationLine,
  CustomerRow,
  FailureNotice,
  ItemOption,
  QuotationView,
} from "../api";
import { describeFailure, parseNumeric, quotationApi, todayIso } from "../api";
import { FailureNotch } from "./failure-notch";

/**
 * NEW QUOTATION — the document that used to live in an email.
 *
 * A quotation is not yet a financial document, but it is the price the customer will hold
 * this plant to, and when it is accepted it becomes a sales order carrying GST without
 * anybody retyping it. So it is held to the same standard as the order form:
 *
 *   EVERY PICKER IS A PICKER. Customer and item are chosen from real rows fetched from the
 *   systems that own them. There is no field here where somebody types a uuid, because a
 *   uuid typed by a human is a uuid typed wrong.
 *
 *   EVERY SERVER RULE IS MIRRORED, WITH THE MESSAGE NEXT TO THE FIELD. The client check is
 *   not security — the server's runs regardless. It is about belief: a clerk who submits five
 *   times and gets five different refusals concludes the software does not know its own mind,
 *   and after that they stop reading the messages.
 *
 *   THE TOTAL IS COMPUTED THE WAY THE SERVER COMPUTES IT. `priceLines` rounds each line to
 *   two decimals, then rounds that line's tax, then sums. Summing at full precision and
 *   rounding once looks identical on three lines and differs by a paisa on thirty — and a
 *   figure on a create screen that does not match the document it creates is worse than no
 *   figure, because somebody will trust it.
 *
 *   SUBMIT ONCE, AND MEAN IT. ONE Idempotency-Key is pinned for as long as this form is open.
 *   The disabled button stops the double click; the pinned key survives the thing a button
 *   cannot help with — a connection that drops after the server committed, and a clerk who
 *   quite reasonably presses Save again.
 *
 * WHICH ENDPOINTS THIS CALLS, AND WHY THAT IS ALLOWED:
 *   GET  /sales/customers    — SALES' customer master
 *   GET  /engineering/items  — AXLE's item master
 *   POST /sales/quotations   — the quotation endpoint this module is built on
 * The boundary rule is about IMPORTS between module folders, not about which HTTP endpoints
 * a screen calls. This module keeping its own copy of the item list would be the violation.
 */

/**
 * A literal rather than `useId`, because React's generated ids contain colons and this one is
 * used as an IDREF from the footer's submit button. Only one of these dialogs is ever mounted.
 */
const FORM_ID = "new-quotation-form";

/** How long a price holds by default. Thirty days is a convention, and it is editable. */
const DEFAULT_VALIDITY_DAYS = 30;

interface LineDraft {
  /** Stable across re-orders so React does not reuse a row's DOM for a different line. */
  key: string;
  itemId: string;
  uom: string;
  qty: string;
  rate: string;
  hsn: string;
  gstRatePct: string;
  description: string;
}

interface QuotationDraft {
  customerId: string;
  enquiryRef: string;
  quoteDate: string;
  validUntil: string;
  paymentTerms: string;
  deliveryTerms: string;
  notes: string;
  lines: LineDraft[];
}

function newLine(): LineDraft {
  // 18% is the rate most of this plant's finished goods carry. It is a starting point on a
  // field the user can change, never a value sent on a line they did not look at — an
  // unpriced line is refused before submit by `validate` below.
  return {
    key: crypto.randomUUID(),
    itemId: "",
    uom: "",
    qty: "",
    rate: "",
    hsn: "",
    gstRatePct: "18",
    description: "",
  };
}

function addDays(iso: string, days: number): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return iso;
  const d = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]) + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function emptyDraft(): QuotationDraft {
  const today = todayIso();
  return {
    customerId: "",
    enquiryRef: "",
    quoteDate: today,
    validUntil: addDays(today, DEFAULT_VALIDITY_DAYS),
    paymentTerms: "",
    deliveryTerms: "",
    notes: "",
    lines: [newLine()],
  };
}

/**
 * The server's rules, restated. Each message is the one the user sees beside the field, and
 * each corresponds to a check in `quotation.controller.ts` or `QuotationService.priceLines`.
 */
function validate(draft: QuotationDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.customerId) errors.customerId = "Choose the customer this price is for.";
  if (!draft.quoteDate) errors.quoteDate = "A quotation needs the date it was raised.";
  if (!draft.validUntil) {
    // The server makes this required for a reason worth repeating on the form.
    errors.validUntil = "A quotation without an expiry is a promise without an end.";
  } else if (draft.quoteDate && draft.validUntil < draft.quoteDate) {
    errors.validUntil = "A quotation cannot expire before the day it was raised.";
  }
  if (draft.enquiryRef.length > 120) errors.enquiryRef = "120 characters at most.";
  if (draft.paymentTerms.length > 240) errors.paymentTerms = "240 characters at most.";
  if (draft.deliveryTerms.length > 240) errors.deliveryTerms = "240 characters at most.";
  if (draft.notes.length > 2000) errors.notes = "2000 characters at most.";

  if (draft.lines.length === 0) errors.lines = "A quotation needs at least one line.";
  draft.lines.forEach((line, i) => {
    const at = (field: string, message: string): void => {
      errors[`lines.${i}.${field}`] = message;
    };
    if (!line.itemId) at("itemId", "Choose an item.");
    const qty = parseNumeric(line.qty);
    if (qty === null) at("qty", "How many.");
    else if (qty <= 0) at("qty", "Quantity must be more than zero.");
    const rate = parseNumeric(line.rate);
    if (rate === null) at("rate", "The price per unit.");
    else if (rate < 0) at("rate", "A rate cannot be negative.");
    if (!line.hsn.trim()) at("hsn", "HSN is needed — it goes on the invoice.");
    const gst = parseNumeric(line.gstRatePct);
    if (gst === null) at("gstRatePct", "The GST rate for this item.");
    else if (gst < 0 || gst > 100) at("gstRatePct", "Between 0 and 100.");
    if (line.description.length > 500) at("description", "500 characters at most.");
  });
  return errors;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The totals, computed exactly as `QuotationService.priceLines` computes them: each line
 * rounded, each line's tax rounded, then summed. Lines that are not yet priced are excluded
 * and counted, so the figure never quietly means less than it appears to.
 */
function draftTotals(draft: QuotationDraft): {
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  incompleteLines: number;
} {
  let subtotal = 0;
  let taxTotal = 0;
  let incompleteLines = 0;
  for (const line of draft.lines) {
    const qty = parseNumeric(line.qty);
    const rate = parseNumeric(line.rate);
    const gst = parseNumeric(line.gstRatePct);
    if (qty === null || rate === null || qty <= 0 || rate < 0) {
      incompleteLines += 1;
      continue;
    }
    const lineTotal = round2(qty * rate);
    subtotal += lineTotal;
    if (gst !== null && gst >= 0) taxTotal += round2((lineTotal * gst) / 100);
  }
  return {
    subtotal: round2(subtotal),
    taxTotal: round2(taxTotal),
    grandTotal: round2(round2(subtotal) + round2(taxTotal)),
    incompleteLines,
  };
}

function toBody(draft: QuotationDraft): CreateQuotationBody {
  const lines: CreateQuotationLine[] = draft.lines.map((line) => ({
    itemId: line.itemId,
    qty: parseNumeric(line.qty) ?? 0,
    rate: parseNumeric(line.rate) ?? 0,
    hsn: line.hsn.trim(),
    gstRatePct: parseNumeric(line.gstRatePct) ?? 0,
    // The unit travels with the line from the moment the item is chosen and is sent with it:
    // the quotation records the unit AGREED, not whatever the master says next year.
    ...(line.uom ? { uom: line.uom } : {}),
    ...(line.description.trim() ? { description: line.description.trim() } : {}),
  }));
  return {
    customerId: draft.customerId,
    quoteDate: draft.quoteDate,
    validUntil: draft.validUntil,
    ...(draft.enquiryRef.trim() ? { enquiryRef: draft.enquiryRef.trim() } : {}),
    ...(draft.paymentTerms.trim() ? { paymentTerms: draft.paymentTerms.trim() } : {}),
    ...(draft.deliveryTerms.trim() ? { deliveryTerms: draft.deliveryTerms.trim() } : {}),
    ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    lines,
  };
}

export function NewQuotationDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (quotation: QuotationView) => void;
}): React.JSX.Element {
  /**
   * ONE KEY, PINNED TO THIS OPEN FORM.
   *
   * `api.post` fingerprints a key per CALL, which does not deduplicate a deliberate second
   * click on a form whose contents have changed. Minting it here instead, once, in a lazy
   * `useState` initialiser, gives the property that is actually wanted: every Save from this
   * form carries the same ticket, so a retry after a timeout replays the first answer. The
   * dialog is unmounted when it closes, so reopening it is genuinely a second quotation.
   */
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState<QuotationDraft>(emptyDraft);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<FailureNotice | null>(null);

  const customers = useCursorList<CustomerRow>(quotationApi.customersPath, {
    limit: quotationApi.pickerPageSize,
  });
  const items = useCursorList<ItemOption>(quotationApi.itemsPath, {
    limit: quotationApi.pickerPageSize,
  });

  // Every edit clears the last server refusal. A message that stays on screen while the thing
  // it complained about is being fixed reads as a message about the new value.
  const patch = useCallback((changes: Partial<QuotationDraft>) => {
    setFailure(null);
    setDraft((d) => ({ ...d, ...changes }));
  }, []);

  const patchLine = useCallback((index: number, changes: Partial<LineDraft>) => {
    setFailure(null);
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l, i) => (i === index ? { ...l, ...changes } : l)),
    }));
  }, []);

  const pickItem = useCallback(
    (index: number, itemId: string) => {
      const chosen = items.rows.find((i) => i.id === itemId);
      patchLine(index, { itemId, uom: chosen?.uom ?? "" });
    },
    [items.rows, patchLine],
  );

  const customer = useMemo(
    () => customers.rows.find((c) => c.id === draft.customerId) ?? null,
    [customers.rows, draft.customerId],
  );

  const clientErrors = useMemo(() => validate(draft), [draft]);
  const totals = useMemo(() => draftTotals(draft), [draft]);

  // Nothing is marked wrong until the first attempt to save — a form that turns red while
  // somebody is still typing the first field is scolding them for not having finished.
  const shown: Record<string, string> = attempted
    ? { ...clientErrors, ...(failure?.fields ?? {}) }
    : (failure?.fields ?? {});
  const problemCount = Object.keys(clientErrors).length;

  async function submit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    setAttempted(true);
    if (problemCount > 0) return;

    setSubmitting(true);
    setFailure(null);
    try {
      const saved = await api.post<QuotationView>(quotationApi.listPath, toBody(draft), {
        idempotencyKey,
      });
      onCreated(saved);
    } catch (err) {
      setFailure(describeFailure(err, "create"));
      setSubmitting(false);
    }
  }

  const dirty =
    Boolean(draft.customerId) ||
    Boolean(draft.enquiryRef.trim()) ||
    draft.lines.some((l) => l.itemId || l.qty.trim() || l.rate.trim() || l.hsn.trim());

  function requestClose(): void {
    if (submitting) return;
    if (dirty && !window.confirm("Discard this quotation? Nothing has been saved.")) return;
    onClose();
  }

  const itemsBlocked = items.error instanceof AppError ? items.error : null;

  return (
    <Modal
      title="New quotation"
      subtitle="A price offered to a customer, with a date it stops being valid. Nothing is committed by it — it becomes an order only when the customer accepts and somebody converts it."
      onClose={requestClose}
      locked={submitting}
      width="max-w-4xl"
      footer={
        <>
          <div className="mr-auto min-w-0">
            <div className="field-label mb-0">Quotation value (incl. GST)</div>
            <div
              className="text-[17px] font-bold tabular-nums text-[var(--text-primary)]"
              data-numeric=""
            >
              {inr(totals.grandTotal)}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={requestClose}
            disabled={submitting}
          >
            Cancel
          </button>
          {/* The Save button lives in the modal's footer, outside the <form>; `form=` is what
              still makes it the form's submit button, so Enter in any field also saves. */}
          <button type="submit" form={FORM_ID} className="btn btn-pri" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              "Save quotation"
            )}
          </button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate>
        {failure ? <FailureNotch notice={failure} /> : null}
        {!failure && attempted && problemCount > 0 ? (
          <div
            role="alert"
            className="mb-4 rounded-[var(--radius-control)] border border-[var(--bad)] bg-[var(--bad-soft)] px-3.5 py-3 text-[13px]"
          >
            <p className="font-semibold text-[var(--bad-ink)]">
              {problemCount === 1 ? "One field needs attention" : `${problemCount} fields need attention`}
            </p>
            <p className="mt-0.5 text-[var(--text-secondary)]">
              Nothing has been sent. Each one is marked below.
            </p>
          </div>
        ) : null}

        {/* ---- who, and how long the price holds --------------------------- */}
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <Field
            label="Customer"
            htmlFor="qt-customer"
            required
            error={shown.customerId}
            hint={
              customer
                ? `${customer.gstin ? `GSTIN ${customer.gstin}` : "Unregistered"} · credit limit ${inr(customer.creditLimit)}`
                : undefined
            }
          >
            <select
              id="qt-customer"
              data-autofocus
              className="field"
              style={badBorder(shown.customerId)}
              aria-invalid={Boolean(shown.customerId)}
              value={draft.customerId}
              disabled={submitting}
              onChange={(e) => patch({ customerId: e.target.value })}
            >
              <option value="">
                {customers.loading ? "Loading customers…" : "Choose a customer…"}
              </option>
              {customers.rows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.code}
                </option>
              ))}
            </select>
            <PickerFooter
              loading={customers.loading}
              error={customers.error}
              hasMore={customers.hasMore}
              loadingMore={customers.loadingMore}
              onLoadMore={customers.loadMore}
              what="customers"
              empty={customers.rows.length === 0}
              emptyHint="No customers yet — one has to exist before a price can be quoted to it."
            />
          </Field>

          <Field
            label="Their enquiry reference"
            htmlFor="qt-enquiry"
            error={shown.enquiryRef}
            hint="What the customer called the request. It is what they will quote on the phone."
          >
            <input
              id="qt-enquiry"
              className="field"
              style={badBorder(shown.enquiryRef)}
              aria-invalid={Boolean(shown.enquiryRef)}
              maxLength={120}
              autoComplete="off"
              value={draft.enquiryRef}
              disabled={submitting}
              onChange={(e) => patch({ enquiryRef: e.target.value })}
            />
          </Field>

          <Field label="Quote date" htmlFor="qt-date" required error={shown.quoteDate}>
            <input
              id="qt-date"
              type="date"
              className="field"
              style={badBorder(shown.quoteDate)}
              aria-invalid={Boolean(shown.quoteDate)}
              value={draft.quoteDate}
              disabled={submitting}
              onChange={(e) => patch({ quoteDate: e.target.value })}
            />
          </Field>

          <Field
            label="Valid until"
            htmlFor="qt-valid"
            required
            error={shown.validUntil}
            hint="The last day this price stands. After it the quotation shows as expired and cannot be accepted — re-price it instead, which supersedes rather than overwrites."
          >
            <input
              id="qt-valid"
              type="date"
              className="field"
              min={draft.quoteDate}
              style={badBorder(shown.validUntil)}
              aria-invalid={Boolean(shown.validUntil)}
              value={draft.validUntil}
              disabled={submitting}
              onChange={(e) => patch({ validUntil: e.target.value })}
            />
          </Field>

          <Field
            label="Payment terms"
            htmlFor="qt-payment"
            error={shown.paymentTerms}
            hint="As offered — “30 days from invoice”, “50% advance”."
          >
            <input
              id="qt-payment"
              className="field"
              style={badBorder(shown.paymentTerms)}
              maxLength={240}
              autoComplete="off"
              value={draft.paymentTerms}
              disabled={submitting}
              onChange={(e) => patch({ paymentTerms: e.target.value })}
            />
          </Field>

          <Field
            label="Delivery terms"
            htmlFor="qt-delivery"
            error={shown.deliveryTerms}
            hint="“Ex-works Chakan”, “FOR customer site” — whatever was actually offered."
          >
            <input
              id="qt-delivery"
              className="field"
              style={badBorder(shown.deliveryTerms)}
              maxLength={240}
              autoComplete="off"
              value={draft.deliveryTerms}
              disabled={submitting}
              onChange={(e) => patch({ deliveryTerms: e.target.value })}
            />
          </Field>
        </div>

        {/* ---- the lines --------------------------------------------------- */}
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
              What has been priced
            </h3>
            <span className="chip chip-grey">
              {draft.lines.length} {draft.lines.length === 1 ? "line" : "lines"}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={submitting}
              onClick={() => {
                setFailure(null);
                setDraft((d) => ({ ...d, lines: [...d.lines, newLine()] }));
              }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add line
            </button>
          </div>

          {itemsBlocked ? (
            <p className="mb-2.5 rounded-[var(--radius-control)] bg-[var(--warn-soft)] px-3 py-2 text-[12px] leading-4 text-[var(--warn-ink)]">
              The item master could not be read
              {itemsBlocked.missingPermission ? (
                <>
                  {" "}
                  — ask your administrator for{" "}
                  <code className="font-[var(--font-mono)]">{itemsBlocked.missingPermission}</code>
                </>
              ) : (
                <>: {itemsBlocked.message}</>
              )}
              . A quoted line has to name a real item, so it cannot be entered until this works.
            </p>
          ) : null}

          {shown.lines ? <FieldError message={shown.lines} /> : null}

          <div className="flex flex-col gap-2.5">
            {draft.lines.map((line, i) => (
              <LineEditor
                key={line.key}
                index={i}
                line={line}
                items={items.rows}
                itemsLoading={items.loading}
                errors={shown}
                disabled={submitting}
                removable={draft.lines.length > 1}
                onPickItem={pickItem}
                onChange={patchLine}
                onRemove={(index) => {
                  setFailure(null);
                  setDraft((d) =>
                    d.lines.length <= 1
                      ? d
                      : { ...d, lines: d.lines.filter((_, j) => j !== index) },
                  );
                }}
              />
            ))}
          </div>

          {items.hasMore ? (
            <p className="mt-2 text-[11px] text-[var(--text-muted)]">
              Showing the first {items.rows.length} items.{" "}
              <button
                type="button"
                className="font-semibold text-[var(--brand)] underline"
                onClick={items.loadMore}
                disabled={items.loadingMore}
              >
                {items.loadingMore ? "Loading…" : "Load more"}
              </button>
            </p>
          ) : null}
        </div>

        <div className="mt-4">
          <Field
            label="Notes to the customer"
            htmlFor="qt-notes"
            error={shown.notes}
            hint="Anything that qualifies the price — tooling excluded, packing at actuals, a lead time that depends on a drawing."
          >
            <textarea
              id="qt-notes"
              className="field"
              rows={2}
              maxLength={2000}
              value={draft.notes}
              disabled={submitting}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </Field>
        </div>

        {/* ---- the running total ------------------------------------------- */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--brand-soft-2)] px-3.5 py-3">
          <div>
            <div className="field-label mb-0.5">Quotation value (incl. GST)</div>
            <div
              className="text-[22px] font-bold tabular-nums tracking-[-0.02em] text-[var(--text-primary)]"
              data-numeric=""
            >
              {inr(totals.grandTotal)}
            </div>
          </div>
          <p className="max-w-md text-[11px] leading-[1.5] text-[var(--text-muted)] sm:text-right">
            {totals.incompleteLines > 0
              ? `${totals.incompleteLines} ${totals.incompleteLines === 1 ? "line is" : "lines are"} not priced yet and ${totals.incompleteLines === 1 ? "is" : "are"} excluded. `
              : ""}
            {inr(totals.subtotal)} before tax, {inr(totals.taxTotal)} GST at the rates typed on
            each line. A quotation applies the rate as quoted; it does not split CGST/SGST from
            IGST — that split is decided on the order, from your registration and the delivery
            state, on the day the order is raised.
          </p>
        </div>
      </form>
    </Modal>
  );
}

/* ========================================================================== */
/* One line                                                                    */
/* ========================================================================== */

function LineEditor({
  index,
  line,
  items,
  itemsLoading,
  errors,
  disabled,
  removable,
  onPickItem,
  onChange,
  onRemove,
}: {
  index: number;
  line: LineDraft;
  items: readonly ItemOption[];
  itemsLoading: boolean;
  errors: Record<string, string>;
  disabled: boolean;
  removable: boolean;
  onPickItem: (index: number, itemId: string) => void;
  onChange: (index: number, changes: Partial<LineDraft>) => void;
  onRemove: (index: number) => void;
}): React.JSX.Element {
  const at = (field: string): string | undefined => errors[`lines.${index}.${field}`];
  const id = (field: string): string => `qt-line-${index}-${field}`;
  const qty = parseNumeric(line.qty);
  const rate = parseNumeric(line.rate);
  const lineTotal = qty !== null && rate !== null && qty > 0 && rate >= 0 ? round2(qty * rate) : null;

  return (
    <fieldset className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3">
      <legend className="sr-only">Line {index + 1}</legend>

      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="chip chip-info">Line {index + 1}</span>
        <span className="flex-1" />
        <span className="text-[12px] tabular-nums text-[var(--text-secondary)]" data-numeric="">
          {lineTotal === null ? "—" : inr(lineTotal)}
          <span className="ml-1 text-[10.5px] text-[var(--text-muted)]">ex-GST</span>
        </span>
        {removable ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onRemove(index)}
            disabled={disabled}
            aria-label={`Remove line ${index + 1}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Item"
          htmlFor={id("item")}
          required
          error={at("itemId")}
          className="sm:col-span-2"
        >
          <select
            id={id("item")}
            className="field"
            style={badBorder(at("itemId"))}
            aria-invalid={Boolean(at("itemId"))}
            value={line.itemId}
            disabled={disabled}
            onChange={(e) => onPickItem(index, e.target.value)}
          >
            <option value="">{itemsLoading ? "Loading items…" : "Choose an item…"}</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.itemCode} — {it.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Quantity" htmlFor={id("qty")} required error={at("qty")}>
          <input
            id={id("qty")}
            className="field text-right tabular-nums"
            style={badBorder(at("qty"))}
            aria-invalid={Boolean(at("qty"))}
            inputMode="decimal"
            autoComplete="off"
            value={line.qty}
            disabled={disabled}
            onChange={(e) => onChange(index, { qty: e.target.value })}
          />
        </Field>

        <Field label="Unit" htmlFor={id("uom")}>
          {/* Read-only: it comes from the item master and is sent with the line, so the
              quotation keeps the unit that was agreed on the day. */}
          <input
            id={id("uom")}
            className="field bg-[var(--bg)] text-[var(--text-secondary)]"
            value={line.uom || "—"}
            readOnly
            tabIndex={-1}
          />
        </Field>

        <Field label="Rate" htmlFor={id("rate")} required error={at("rate")}>
          <input
            id={id("rate")}
            className="field text-right tabular-nums"
            style={badBorder(at("rate"))}
            aria-invalid={Boolean(at("rate"))}
            inputMode="decimal"
            autoComplete="off"
            value={line.rate}
            disabled={disabled}
            onChange={(e) => onChange(index, { rate: e.target.value })}
          />
        </Field>

        <Field
          label="HSN"
          htmlFor={id("hsn")}
          required
          error={at("hsn")}
          // `GET /engineering/items` does not return an HSN code, so it cannot be filled in
          // from the item. Saying why beats a field that looks like it should have populated.
          hint="Typed here — the item master does not return it through this endpoint."
        >
          <input
            id={id("hsn")}
            className="field font-[var(--font-mono)]"
            style={badBorder(at("hsn"))}
            aria-invalid={Boolean(at("hsn"))}
            inputMode="numeric"
            maxLength={8}
            autoComplete="off"
            value={line.hsn}
            disabled={disabled}
            onChange={(e) => onChange(index, { hsn: e.target.value.replace(/\D/g, "") })}
          />
        </Field>

        <Field label="GST %" htmlFor={id("gst")} required error={at("gstRatePct")}>
          <input
            id={id("gst")}
            className="field text-right tabular-nums"
            style={badBorder(at("gstRatePct"))}
            aria-invalid={Boolean(at("gstRatePct"))}
            inputMode="decimal"
            autoComplete="off"
            value={line.gstRatePct}
            disabled={disabled}
            onChange={(e) => onChange(index, { gstRatePct: e.target.value })}
          />
        </Field>

        <Field
          label="Description"
          htmlFor={id("desc")}
          error={at("description")}
          className="sm:col-span-2 lg:col-span-4"
          hint="Optional. What the customer will read on the quotation instead of the master's own name."
        >
          <input
            id={id("desc")}
            className="field"
            style={badBorder(at("description"))}
            maxLength={500}
            autoComplete="off"
            value={line.description}
            disabled={disabled}
            onChange={(e) => onChange(index, { description: e.target.value })}
          />
        </Field>
      </div>

      {lineTotal !== null ? (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
          {num(qty ?? 0, 2)} {line.uom || "units"} at {inr(rate ?? 0)} — {inr(lineTotal)} before
          GST.
        </p>
      ) : null}
    </fieldset>
  );
}

/* ========================================================================== */
/* Small pieces                                                                */
/* ========================================================================== */

/** A red border on an errored control, so colour is never the only signal but is one. */
function badBorder(error?: string): { borderColor: string } | undefined {
  return error ? { borderColor: "var(--bad)" } : undefined;
}

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className={className}>
      <label className={required ? "field-label field-req" : "field-label"} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <FieldError message={error} />
      ) : hint ? (
        <p className="mt-1 text-[11px] leading-[1.45] text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

function PickerFooter({
  loading,
  error,
  hasMore,
  loadingMore,
  onLoadMore,
  what,
  empty,
  emptyHint,
}: {
  loading: boolean;
  error: unknown;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  what: string;
  empty: boolean;
  emptyHint: string;
}): React.JSX.Element | null {
  if (error) {
    const denied = error instanceof AppError ? error.missingPermission : null;
    return (
      <p className="mt-1 text-[11px] leading-4 text-[var(--warn-ink)]">
        The {what} could not be loaded
        {denied ? (
          <>
            {" "}
            — ask your administrator for{" "}
            <code className="font-[var(--font-mono)]">{denied}</code>
          </>
        ) : null}
        .
      </p>
    );
  }
  if (!loading && empty) {
    return <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">{emptyHint}</p>;
  }
  if (!hasMore) return null;
  return (
    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
      There are more {what} than are listed.{" "}
      <button
        type="button"
        className="font-semibold text-[var(--brand)] underline"
        onClick={onLoadMore}
        disabled={loadingMore}
      >
        {loadingMore ? "Loading…" : "Load more"}
      </button>
    </p>
  );
}
