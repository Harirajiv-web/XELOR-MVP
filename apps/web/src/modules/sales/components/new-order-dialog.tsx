"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { api } from "@spine/api/client";
import { AppError } from "@spine/api/errors";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { inr } from "@spine/format";
import { FieldError } from "@spine/states";
import type {
  CompanyOption,
  CustomerRow,
  GstRegistrationOption,
  ItemOption,
  SalesOrderView,
  WarehouseOption,
} from "../api";
import { salesApi } from "../api";
import {
  describeCreateFailure,
  draftTotals,
  emptyOrderDraft,
  lineTaxableValue,
  newLineDraft,
  toCreateOrderBody,
  validateOrderDraft,
  type CreateFailure,
  type DraftContext,
  type OrderDraft,
  type OrderLineDraft,
} from "../order-draft";
import { FailureNotch } from "./failure-notch";
import { Modal } from "./modal";

/**
 * NEW SALES ORDER — the first write path in this application.
 *
 * A sales order is a financial document. It carries GST, it becomes demand for planning, and
 * once it is confirmed it commits a factory to making something. So the standard this form
 * sets is not "collect the fields and let the server sort it out":
 *
 *   EVERY PICKER IS A PICKER. Customer, item, selling registration and warehouse are all
 *   chosen from real rows fetched from the systems that own them. There is no field in this
 *   form where somebody types a uuid, because a uuid typed by a human is a uuid typed wrong.
 *
 *   EVERY SERVER RULE IS MIRRORED, IN `order-draft.ts`, WITH A MESSAGE NEXT TO THE FIELD.
 *   The client check is not security — the server's is, and it runs regardless. It is about
 *   belief: a clerk who submits five times and gets five different refusals concludes the
 *   software does not know its own mind, and after that they stop reading the messages.
 *
 *   THE TOTAL IS LABELLED EX-GST AND SAID TO BE INDICATIVE. The tax is the platform's to
 *   compute, on the order date, from the registration and the delivery state. This form adds
 *   qty × rate so a person can check the figure against the customer's PO before saving; it
 *   never dresses that up as the amount the order will carry.
 *
 *   SUBMIT ONCE, AND MEAN IT. ONE Idempotency-Key is pinned for as long as this form is
 *   open, and every Save sends that same key. The disabled button stops the double click;
 *   the pinned key is what survives the thing the button cannot help with — a connection
 *   that drops after the server committed, and a clerk who quite reasonably presses Save
 *   again. That second request replays the first answer instead of raising a second order.
 *   Behind both, DUPLICATE_CUSTOMER_PO is the last backstop.
 *
 *   This matters more here than almost anywhere: a duplicate confirmed order becomes
 *   duplicate demand, becomes a duplicate plan, becomes material somebody actually buys.
 *
 * WHICH ENDPOINTS THIS CALLS, AND WHY THAT IS ALLOWED:
 *   GET  /sales/customers      — ours
 *   GET  /engineering/items    — AXLE's item master
 *   GET  /general/companies    — HEXA's companies, for the tenant's own GST registrations
 *   GET  /inventory/warehouses — SPAR's warehouses, for the finished-goods source
 *   POST /sales/orders         — ours
 * The module boundary this app enforces is about IMPORTS between module folders, not about
 * which HTTP endpoints a screen calls. Sales reading Engineering's item list over HTTP is
 * the sanctioned way to read another module's master; Sales keeping its own copy of the item
 * list would be the actual violation.
 */

/**
 * A literal rather than `useId`, because React's generated ids contain colons and this one
 * is used as an IDREF from the footer's submit button. Only one of these dialogs is ever
 * mounted, so a fixed id cannot collide.
 */
const FORM_ID = "new-sales-order-form";

export function NewOrderDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (order: SalesOrderView) => void;
}): React.JSX.Element {
  const bannerRef = useRef<HTMLDivElement>(null);

  /**
   * ONE KEY, PINNED TO THIS OPEN FORM.
   *
   * `api.post` mints a fresh key per CALL, which does not deduplicate anything: two clicks
   * are two keys and two orders. Minting it here instead, once, in a lazy `useState`
   * initialiser, gives the property that is actually wanted — every Save from this form
   * carries the same ticket, so a retry after a timeout replays the first answer.
   *
   * The dialog is unmounted when it closes, so opening the form again produces a new key
   * and a deliberate second order is genuinely a second order. A FAILED attempt releases the
   * ticket server-side (`runIdempotent` deletes its claim when the work throws), so editing
   * a refused order and saving again works normally; the key only holds fast once an order
   * has actually been created.
   */
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());

  const [draft, setDraft] = useState<OrderDraft>(() => emptyOrderDraft());
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<CreateFailure | null>(null);
  const [shipElsewhere, setShipElsewhere] = useState(false);

  /* ---------------------------- the real rows --------------------------- */

  const customers = useCursorList<CustomerRow>(salesApi.customersPath, {
    limit: salesApi.pickerPageSize,
  });
  const items = useCursorList<ItemOption>(salesApi.itemsPath, {
    limit: salesApi.pickerPageSize,
  });
  // The tenant's own registrations. A sales clerk may well not hold `general.company.read`,
  // so this list failing is an ORDINARY outcome, not an error — the field degrades to a
  // typed GSTIN rather than blocking the order. See `SupplierGstinField`.
  const companies = useCursorList<CompanyOption>(salesApi.companiesPath, {
    limit: salesApi.pickerPageSize,
  });
  // A bare array, not a cursor page, and optional on the order — so if this 403s the field
  // simply is not offered.
  const warehouses = useQuery<WarehouseOption[]>(salesApi.warehousesPath);

  const registrations = useMemo<Array<GstRegistrationOption & { company: string }>>(
    () =>
      companies.rows.flatMap((c) =>
        c.registrations.map((r) => ({ ...r, company: c.legalName })),
      ),
    [companies.rows],
  );

  const customer = useMemo(
    () => customers.rows.find((c) => c.id === draft.customerId) ?? null,
    [customers.rows, draft.customerId],
  );

  const ctx = useMemo<DraftContext>(
    () => ({
      customerStateCode: customer?.stateCode ?? null,
      customerGstin: customer?.gstin ?? null,
    }),
    [customer],
  );

  /* ------------------------------- editing ------------------------------ */

  // Every mutation clears the last server refusal. A message that stays on screen while the
  // thing it complained about is being fixed reads as a message about the new value.
  const patch = useCallback((changes: Partial<OrderDraft>) => {
    setFailure(null);
    setDraft((d) => ({ ...d, ...changes }));
  }, []);

  const patchLine = useCallback((index: number, changes: Partial<OrderLineDraft>) => {
    setFailure(null);
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l, i) => (i === index ? { ...l, ...changes } : l)),
    }));
  }, []);

  const addLine = useCallback(() => {
    setFailure(null);
    setDraft((d) => ({ ...d, lines: [...d.lines, newLineDraft()] }));
  }, []);

  const removeLine = useCallback((index: number) => {
    setFailure(null);
    setDraft((d) =>
      d.lines.length <= 1 ? d : { ...d, lines: d.lines.filter((_, i) => i !== index) },
    );
  }, []);

  // One registration means there is no choice to make, so it is made. Several is a real
  // decision — it changes the place of supply and therefore the tax — and stays unanswered.
  useEffect(() => {
    if (draft.supplierGstin) return;
    const only = registrations.length === 1 ? registrations[0] : undefined;
    if (only) patch({ supplierGstin: only.gstin });
  }, [registrations, draft.supplierGstin, patch]);

  const pickItem = useCallback(
    (index: number, itemId: string) => {
      const chosen = items.rows.find((i) => i.id === itemId);
      // The unit travels with the line from the moment the item is chosen, and is sent with
      // it: the order records the unit AGREED, not whatever the master says next year.
      patchLine(index, { itemId, uom: chosen?.uom ?? "" });
    },
    [items.rows, patchLine],
  );

  /* ------------------------------ validation ---------------------------- */

  const clientErrors = useMemo(() => validateOrderDraft(draft, ctx), [draft, ctx]);
  const totals = useMemo(() => draftTotals(draft, ctx), [draft, ctx]);

  // Nothing is marked wrong until the first attempt to save — a form that turns red while
  // somebody is still typing the first field is scolding them for not having finished.
  // Server-side field messages always show, because those are about what was submitted.
  const shown: Record<string, string> = attempted
    ? { ...clientErrors, ...(failure?.fields ?? {}) }
    : (failure?.fields ?? {});

  const clientProblemCount = Object.keys(clientErrors).length;

  useEffect(() => {
    if (failure) bannerRef.current?.scrollIntoView({ block: "nearest" });
  }, [failure]);

  /* -------------------------------- submit ------------------------------ */

  async function submit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    setAttempted(true);
    if (clientProblemCount > 0) {
      bannerRef.current?.scrollIntoView({ block: "nearest" });
      return;
    }

    setSubmitting(true);
    setFailure(null);
    try {
      // The form's own key overrides the one `api.post` would mint per call — see the note
      // on `idempotencyKey` above. This is the difference between a retry that replays and a
      // retry that raises a second sales order.
      const created = await api.post<SalesOrderView>(
        salesApi.ordersPath,
        toCreateOrderBody(draft),
        { idempotencyKey },
      );
      onCreated(created);
    } catch (err) {
      setFailure(describeCreateFailure(err));
      setSubmitting(false);
    }
  }

  const dirty = useMemo(
    () =>
      Boolean(
        draft.customerId ||
          draft.custPoNo.trim() ||
          draft.requestedDeliveryDate.trim() ||
          draft.lines.some((l) => l.itemId || l.qty.trim() || l.rate.trim() || l.hsn.trim()),
      ),
    [draft],
  );

  const requestClose = useCallback(() => {
    if (submitting) return;
    if (dirty && !window.confirm("Discard this order? Nothing has been saved.")) return;
    onClose();
  }, [dirty, submitting, onClose]);

  /* -------------------------------- render ------------------------------ */

  const itemsBlocked = items.error instanceof AppError ? items.error : null;

  return (
    <Modal
      title="New sales order"
      subtitle="Entered against a customer in the master. GST is computed and fixed by the system when the order is saved."
      onClose={requestClose}
      locked={submitting}
      width="max-w-4xl"
      footer={
        <>
          <div className="mr-auto min-w-0">
            <div className="field-label mb-0">Order value (ex-GST)</div>
            <div
              className="text-[17px] font-bold tabular-nums text-[var(--text-primary)]"
              data-numeric=""
            >
              {inr(totals.subtotal)}
            </div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={requestClose} disabled={submitting}>
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
              "Save order"
            )}
          </button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate>
        {/* Failures land HERE, inside the form, never as a full-page state — see the note on
            `FailureNotch`. Every keystroke the user has made is still on screen underneath. */}
        <div ref={bannerRef}>
          {failure ? (
            <FailureNotch
              title={failure.title}
              body={failure.body}
              missingPermission={failure.missingPermission}
              traceId={failure.traceId}
            />
          ) : null}
          {!failure && attempted && clientProblemCount > 0 ? (
            <FailureNotch
              title={
                clientProblemCount === 1
                  ? "One field needs attention"
                  : `${clientProblemCount} fields need attention`
              }
              body="Nothing has been sent. Each one is marked below."
            />
          ) : null}
        </div>

        {/* ---- who and when ------------------------------------------------ */}
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <Field
            label="Customer"
            htmlFor="so-customer"
            required
            error={shown.customerId}
            hint={
              customer
                ? `${customer.gstin ? `GSTIN ${customer.gstin}` : "Unregistered"} · credit limit ${inr(customer.creditLimit)}`
                : undefined
            }
          >
            <select
              id="so-customer"
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
              emptyHint="No customers yet — one has to exist before an order can be raised against it."
              empty={customers.rows.length === 0}
            />
          </Field>

          <Field
            label="Their PO number"
            htmlFor="so-po"
            required
            error={shown.custPoNo}
            hint="What the customer calls this order. It is what they will quote on the phone."
          >
            <input
              id="so-po"
              className="field"
              style={badBorder(shown.custPoNo)}
              aria-invalid={Boolean(shown.custPoNo)}
              value={draft.custPoNo}
              disabled={submitting}
              maxLength={64}
              autoComplete="off"
              onChange={(e) => patch({ custPoNo: e.target.value })}
            />
          </Field>

          <Field label="Order date" htmlFor="so-date" required error={shown.orderDate}>
            <input
              id="so-date"
              type="date"
              className="field"
              style={badBorder(shown.orderDate)}
              aria-invalid={Boolean(shown.orderDate)}
              value={draft.orderDate}
              disabled={submitting}
              onChange={(e) => patch({ orderDate: e.target.value })}
            />
          </Field>

          <Field
            label="Promised delivery"
            htmlFor="so-promised"
            error={shown.requestedDeliveryDate}
            hint="Applies to every line unless a line says otherwise. Leave blank if the customer gave no date — planning will treat it as due now and flag it, which is honest. A date invented here cannot be told apart from one you actually promised."
          >
            <input
              id="so-promised"
              type="date"
              className="field"
              // The browser refuses an earlier date, the form refuses it, the service refuses
              // it, and a trigger refuses it. Four layers, because a date before the order
              // date lands the demand in a bucket that has already passed and nothing can
              // clear it.
              min={draft.orderDate}
              style={badBorder(shown.requestedDeliveryDate)}
              aria-invalid={Boolean(shown.requestedDeliveryDate)}
              value={draft.requestedDeliveryDate}
              disabled={submitting}
              onChange={(e) => patch({ requestedDeliveryDate: e.target.value })}
            />
          </Field>

          <SupplierGstinField
            value={draft.supplierGstin}
            error={shown.supplierGstin}
            disabled={submitting}
            registrations={registrations}
            loading={companies.loading}
            loadError={companies.error}
            onChange={(v) => patch({ supplierGstin: v })}
          />

          {warehouses.error ? null : (
            <Field
              label="Ship from (finished goods)"
              htmlFor="so-warehouse"
              error={shown.fgWarehouseId}
              hint="Optional here, required before the order can be dispatched."
            >
              <select
                id="so-warehouse"
                className="field"
                value={draft.fgWarehouseId}
                disabled={submitting}
                onChange={(e) => patch({ fgWarehouseId: e.target.value })}
              >
                <option value="">
                  {warehouses.loading ? "Loading warehouses…" : "Decide later"}
                </option>
                {(warehouses.data ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {/* ---- ship-to, only when it differs -------------------------------- */}
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-3.5">
          {shipElsewhere ? (
            <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
              <div className="sm:col-span-2 flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden />
                <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                  Delivering somewhere other than the billing address
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={submitting}
                  onClick={() => {
                    setShipElsewhere(false);
                    patch({ shipToStateCode: "", shipToGstin: "", shipToAddress: "" });
                  }}
                >
                  Use the customer&apos;s address
                </button>
              </div>

              <Field
                label="Delivery state code"
                htmlFor="so-shipstate"
                error={shown.shipToStateCode}
                hint="Two digits — 27 Maharashtra, 33 Tamil Nadu. For goods this is the place of supply, so it decides IGST against CGST + SGST."
              >
                <input
                  id="so-shipstate"
                  className="field font-[var(--font-mono)]"
                  style={badBorder(shown.shipToStateCode)}
                  aria-invalid={Boolean(shown.shipToStateCode)}
                  inputMode="numeric"
                  maxLength={2}
                  value={draft.shipToStateCode}
                  disabled={submitting}
                  onChange={(e) => patch({ shipToStateCode: e.target.value.replace(/\D/g, "") })}
                />
              </Field>

              <Field
                label="Ship-to GSTIN"
                htmlFor="so-shipgstin"
                error={shown.shipToGstin}
                hint="The consignee's registration, or URP if they have none. Mandatory on the e-invoice payload from the date the platform has configured — captured now because this is the last point somebody can still ask the customer for it."
              >
                <input
                  id="so-shipgstin"
                  className="field font-[var(--font-mono)] uppercase"
                  style={badBorder(shown.shipToGstin)}
                  aria-invalid={Boolean(shown.shipToGstin)}
                  maxLength={15}
                  autoComplete="off"
                  value={draft.shipToGstin}
                  disabled={submitting}
                  onChange={(e) => patch({ shipToGstin: e.target.value.toUpperCase() })}
                />
              </Field>

              <Field label="Delivery address" htmlFor="so-shipaddr" className="sm:col-span-2">
                <textarea
                  id="so-shipaddr"
                  className="field"
                  rows={2}
                  value={draft.shipToAddress}
                  disabled={submitting}
                  onChange={(e) => patch({ shipToAddress: e.target.value })}
                />
              </Field>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-[var(--text-secondary)]">
                {customer
                  ? customer.stateCode
                    ? `Delivering to the customer's registered address in state ${customer.stateCode}.`
                    : "This customer has no GSTIN, so the delivery state has to be given."
                  : "Delivery defaults to the customer's registered address."}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={submitting}
                onClick={() => setShipElsewhere(true)}
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                Deliver elsewhere
              </button>
            </div>
          )}
        </div>

        {/* ---- the lines ---------------------------------------------------- */}
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
              What they have ordered
            </h3>
            <span className="chip chip-grey">
              {draft.lines.length} {draft.lines.length === 1 ? "line" : "lines"}
            </span>
            <span className="flex-1" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={addLine} disabled={submitting}>
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
              . An order line has to name a real item, so it cannot be entered until this works.
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
                orderDate={draft.orderDate}
                inheritedDate={draft.requestedDeliveryDate}
                onPickItem={pickItem}
                onChange={patchLine}
                onRemove={removeLine}
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

        {/* ---- the running total ------------------------------------------- */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--brand-soft-2)] px-3.5 py-3">
          <div>
            <div className="field-label mb-0.5">Order value (ex-GST)</div>
            <div
              className="text-[22px] font-bold tabular-nums tracking-[-0.02em] text-[var(--text-primary)]"
              data-numeric=""
            >
              {inr(totals.subtotal)}
            </div>
          </div>
          <p className="max-w-md text-[11px] leading-[1.5] text-[var(--text-muted)] sm:text-right">
            {totals.incompleteLines > 0
              ? `${totals.incompleteLines} ${totals.incompleteLines === 1 ? "line is" : "lines are"} not priced yet and ${totals.incompleteLines === 1 ? "is" : "are"} excluded. `
              : ""}
            {totals.interState === null
              ? "GST is added when the order is saved — the system fixes the split from your registration and the delivery state."
              : `Indicative GST ${inr(totals.indicativeTax)} as ${totals.interState ? "IGST" : "CGST + SGST"}. `}
            {totals.interState === null
              ? ""
              : "The exact tax and the rupee round-off are computed and confirmed by the system on saving — this figure is a check against the customer's PO, not the order total."}
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
  orderDate,
  inheritedDate,
  onPickItem,
  onChange,
  onRemove,
}: {
  index: number;
  line: OrderLineDraft;
  items: readonly ItemOption[];
  itemsLoading: boolean;
  errors: Record<string, string>;
  disabled: boolean;
  removable: boolean;
  orderDate: string;
  inheritedDate: string;
  onPickItem: (index: number, itemId: string) => void;
  onChange: (index: number, changes: Partial<OrderLineDraft>) => void;
  onRemove: (index: number) => void;
}): React.JSX.Element {
  const at = (field: string): string | undefined => errors[`lines.${index}.${field}`];
  const taxable = lineTaxableValue(line);
  const id = (field: string): string => `so-line-${index}-${field}`;

  return (
    <fieldset className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3">
      <legend className="sr-only">Line {index + 1}</legend>

      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="chip chip-info">Line {index + 1}</span>
        <span className="flex-1" />
        <span className="text-[12px] tabular-nums text-[var(--text-secondary)]" data-numeric="">
          {taxable === null ? "—" : inr(taxable)}
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
            Remove
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
        <Field
          label="Item"
          htmlFor={id("item")}
          required
          error={at("itemId")}
          className="col-span-2 sm:col-span-4"
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
            type="number"
            className="field text-right tabular-nums"
            style={badBorder(at("qty"))}
            aria-invalid={Boolean(at("qty"))}
            // Three decimals, because `qty` is stored as NUMERIC(_,3) and a quantity that
            // silently rounds on the way in is the worst kind of wrong.
            step="0.001"
            min="0"
            value={line.qty}
            disabled={disabled}
            onChange={(e) => onChange(index, { qty: e.target.value })}
          />
        </Field>

        <Field label="Rate" htmlFor={id("rate")} required error={at("rate")}>
          <input
            id={id("rate")}
            type="number"
            className="field text-right tabular-nums"
            style={badBorder(at("rate"))}
            aria-invalid={Boolean(at("rate"))}
            step="0.01"
            min="0"
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
          hint={at("hsn") ? undefined : "4, 6 or 8 digits"}
        >
          <input
            id={id("hsn")}
            className="field font-[var(--font-mono)]"
            style={badBorder(at("hsn"))}
            aria-invalid={Boolean(at("hsn"))}
            inputMode="numeric"
            maxLength={8}
            value={line.hsn}
            disabled={disabled}
            onChange={(e) => onChange(index, { hsn: e.target.value.replace(/\D/g, "") })}
          />
        </Field>

        <Field label="GST %" htmlFor={id("gst")} required error={at("gstRatePct")}>
          <input
            id={id("gst")}
            type="number"
            className="field text-right tabular-nums"
            style={badBorder(at("gstRatePct"))}
            aria-invalid={Boolean(at("gstRatePct"))}
            // A NUMBER, not a dropdown of slabs. The notified rates are statutory data and
            // do not belong hardcoded in a screen; the list below is a browser SUGGESTION,
            // not a constraint, and the server accepts anything from 0 to 28.
            list={`${id("gst")}-slabs`}
            step="0.01"
            min="0"
            max="28"
            value={line.gstRatePct}
            disabled={disabled}
            onChange={(e) => onChange(index, { gstRatePct: e.target.value })}
          />
          <datalist id={`${id("gst")}-slabs`}>
            <option value="0" />
            <option value="5" />
            <option value="12" />
            <option value="18" />
            <option value="28" />
          </datalist>
        </Field>

        <Field label="Discount %" htmlFor={id("disc")} error={at("discountPct")}>
          <input
            id={id("disc")}
            type="number"
            className="field text-right tabular-nums"
            style={badBorder(at("discountPct"))}
            aria-invalid={Boolean(at("discountPct"))}
            step="0.01"
            min="0"
            max="99.99"
            value={line.discountPct}
            disabled={disabled}
            onChange={(e) => onChange(index, { discountPct: e.target.value })}
          />
        </Field>

        <Field
          label="Promised for this line"
          htmlFor={id("promised")}
          error={at("requestedDeliveryDate")}
          className="col-span-2"
          hint={
            at("requestedDeliveryDate")
              ? undefined
              : inheritedDate
                ? `Blank uses the order's date, ${inheritedDate}.`
                : "Blank means no date was promised for this line."
          }
        >
          <input
            id={id("promised")}
            type="date"
            className="field"
            min={orderDate}
            style={badBorder(at("requestedDeliveryDate"))}
            aria-invalid={Boolean(at("requestedDeliveryDate"))}
            value={line.requestedDeliveryDate}
            disabled={disabled}
            onChange={(e) => onChange(index, { requestedDeliveryDate: e.target.value })}
          />
        </Field>

        <Field label="Unit" htmlFor={id("uom")}>
          {/* Read-only: it comes from the item master and is sent with the line so the order
              keeps the unit that was agreed on the day. */}
          <input
            id={id("uom")}
            className="field bg-[var(--bg)] text-[var(--text-secondary)]"
            value={line.uom || "—"}
            readOnly
            tabIndex={-1}
          />
        </Field>
      </div>
    </fieldset>
  );
}

/* ========================================================================== */
/* The selling registration — a picker when it can be, a field when it cannot   */
/* ========================================================================== */

function SupplierGstinField({
  value,
  error,
  disabled,
  registrations,
  loading,
  loadError,
  onChange,
}: {
  value: string;
  error?: string;
  disabled: boolean;
  registrations: ReadonlyArray<GstRegistrationOption & { company: string }>;
  loading: boolean;
  loadError: unknown;
  onChange: (value: string) => void;
}): React.JSX.Element {
  const multipleCompanies = new Set(registrations.map((r) => r.company)).size > 1;

  // The company list is HEXA's and needs `general.company.read`, which a sales clerk very
  // plausibly does not hold. That is not a reason to stop them taking an order — so the
  // control degrades from a picker to a typed GSTIN, checked for shape here and validated
  // properly by the server either way.
  if (!loading && (loadError || registrations.length === 0)) {
    const denied = loadError instanceof AppError ? loadError.missingPermission : null;
    return (
      <Field
        label="Selling GSTIN"
        htmlFor="so-supplier"
        required
        error={error}
        hint={
          denied
            ? `Your registrations could not be listed (needs ${denied}), so type the GSTIN this order is sold from.`
            : "Which of your GST registrations is selling. It decides the place of supply, and therefore the tax."
        }
      >
        <input
          id="so-supplier"
          className="field font-[var(--font-mono)] uppercase"
          style={badBorder(error)}
          aria-invalid={Boolean(error)}
          maxLength={15}
          autoComplete="off"
          placeholder="27AABCT1234F1Z5"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
      </Field>
    );
  }

  return (
    <Field
      label="Selling GSTIN"
      htmlFor="so-supplier"
      required
      error={error}
      hint="Which plant is selling. It decides the place of supply, and therefore whether this is IGST or CGST + SGST."
    >
      <select
        id="so-supplier"
        className="field"
        style={badBorder(error)}
        aria-invalid={Boolean(error)}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{loading ? "Loading registrations…" : "Choose a registration…"}</option>
        {registrations.map((r) => (
          <option key={r.id} value={r.gstin}>
            {r.placeName} · {r.gstin}
            {multipleCompanies ? ` · ${r.company}` : ""}
          </option>
        ))}
      </select>
    </Field>
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

