"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@spine/api/client";
import { AppError } from "@spine/api/errors";
import { useCursorList } from "@spine/data/use-query";
import { FieldError } from "@spine/states";
import { inr, num } from "@spine/format";
import type { CreatePoBody, FailureNotice, ItemOption, PoDetail, VendorRow } from "../api";
import {
  describeFailure,
  lineAmount,
  parseNumeric,
  poTotal,
  purchaseApi,
} from "../api";
import { Modal } from "./modal";
import { ConfirmChanges, localChanges } from "@spine/ui/corrections";
import { FailureNotch } from "./failure-notch";

/**
 * NEW PURCHASE ORDER.
 *
 * This is the form where money starts leaving the company, and it is built field-for-field
 * off `createPoSchema` in `apps/api/src/modules/purchase/po.controller.ts` — not off memory
 * of what a purchase order usually has. The schema accepts exactly five things:
 * `vendorId`, `expectedDate`, `currency`, `remarks` and `lines[{itemId, qty, rate}]`.
 * Everything a buyer might expect and will not find here is called out on the form itself.
 *
 * WHAT THE TOTAL IS. The sum of quantity × rate, and nothing else. A purchase order in this
 * system carries no tax at all: no GST rate, no CGST/SGST/IGST split, no tax amount, no
 * freight and no other charge — there are no columns for any of them. The figure on this
 * form is therefore NOT what the vendor will invoice and NOT a landed cost, and the form
 * says so where the number is, because a figure like this gets pasted into an email within
 * the hour. That sentence stays on screen until the gap is actually closed.
 *
 * ONE IDEMPOTENCY KEY PER OPEN FORM. The spine's client mints a fresh key per call, which
 * stops nothing if the user clicks twice; this form pins ONE key for as long as it is open
 * and passes it on every attempt. A double click, a dropped connection, a retry after a
 * timeout — all of them replay the first answer instead of raising a second purchase order.
 * The button is disabled in flight as well, but the key is what actually makes it safe:
 * disabling a button is a UI convention, and a duplicated purchase order is real money.
 */

interface DraftLine {
  key: string;
  itemId: string;
  qty: string;
  rate: string;
}

let lineSeq = 0;
function blankLine(): DraftLine {
  lineSeq += 1;
  return { key: `line-${lineSeq}`, itemId: "", qty: "", rate: "" };
}

export function NewPurchaseOrderModal({
  onClose,
  onCreated,
  /**
   * Present when this dialog is CORRECTING a PO rather than raising one.
   *
   * One dialog for both. A separate edit form would drift from this one's validation, and
   * the direction it drifts is always create-strict / edit-lax — which is exactly the wrong
   * way round for a document a vendor is holding.
   */
  editing,
}: {
  onClose: () => void;
  /** Called with the new order's id before this component navigates away. */
  onCreated?: (po: PoDetail) => void;
  editing?: { po: PoDetail; amend: boolean };
}): React.JSX.Element {
  const router = useRouter();
  const isEdit = Boolean(editing);

  // One key for the lifetime of this open form. See the note above — this is the mechanism,
  // not the disabled button.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const [vendorId, setVendorId] = useState(() => editing?.po.vendorId ?? "");
  const [expectedDate, setExpectedDate] = useState(() =>
    editing?.po.expectedDate ? editing.po.expectedDate.slice(0, 10) : "",
  );
  const [remarks, setRemarks] = useState(() => editing?.po.remarks ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() =>
    editing?.po.lines?.length
      ? editing.po.lines.map((l) => ({
          ...blankLine(),
          itemId: l.itemId,
          // NUMERIC arrives as a string and stays one. Parsing it here would turn 1234.10
          // into 1234.1 in the input, which reads as an edit the user did not make.
          qty: String(l.qty).replace(/\.?0+$/, "") || "0",
          rate: String(l.rate),
        }))
      : [blankLine()],
  );

  /** An amendment stops at a confirmation before it is sent. */
  const [pendingReason, setPendingReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [failure, setFailure] = useState<FailureNotice | null>(null);

  const vendors = useCursorList<VendorRow>(purchaseApi.vendorsPath, {
    limit: purchaseApi.pickerPageSize,
  });
  const items = useCursorList<ItemOption>(purchaseApi.itemsPath, {
    limit: purchaseApi.pickerPageSize,
  });

  // The item master belongs to ENGINEERING and carries its own permission. A buyer who may
  // raise orders but may not read items is a real configuration, and the honest answer is to
  // say which permission is missing and let them key the reference in, rather than show a
  // dropdown that is silently empty.
  const itemsForbidden =
    items.error instanceof AppError && items.error.kind === "forbidden"
      ? (items.error.missingPermission ?? "engineering.item.read")
      : null;
  const itemsById = useMemo(
    () => new Map<string, ItemOption>(items.rows.map((i) => [i.id, i] as const)),
    [items.rows],
  );

  const parsedLines = lines.map((l) => ({
    qty: parseNumeric(l.qty) ?? 0,
    rate: parseNumeric(l.rate) ?? 0,
  }));
  const total = poTotal(parsedLines);

  /**
   * Local checks, keyed the way the API keys its own `details` — `vendorId`, `lines.0.qty` —
   * so a server-side rejection and a client-side one land on the same control.
   */
  const localErrors = useMemo<Record<string, string>>(() => {
    const errs: Record<string, string> = {};
    if (!vendorId) errs.vendorId = "Choose the vendor this order is placed on.";
    lines.forEach((l, i) => {
      if (!l.itemId.trim()) errs[`lines.${i}.itemId`] = "Choose an item.";
      const qty = parseNumeric(l.qty);
      if (qty === null) errs[`lines.${i}.qty`] = "Enter a quantity.";
      else if (qty <= 0) errs[`lines.${i}.qty`] = "Quantity must be more than zero.";
      const rate = parseNumeric(l.rate);
      if (rate === null) errs[`lines.${i}.rate`] = "Enter a rate.";
      else if (rate < 0) errs[`lines.${i}.rate`] = "A rate cannot be negative.";
    });
    return errs;
  }, [vendorId, lines]);

  // Server field errors sit on top of the local ones — the server is the authority.
  const shownErrors: Record<string, string> = {
    ...(attempted ? localErrors : {}),
    ...(failure?.fields ?? {}),
  };
  const valid = Object.keys(localErrors).length === 0;

  function setLine(index: number, patch: Partial<DraftLine>): void {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function submit(reason?: string): Promise<void> {
    setAttempted(true);
    if (!valid || submitting) return;
    // An amendment pauses for the confirmation step; a non-null `pendingReason` means the
    // user has already been through it.
    if (editing?.amend && reason === undefined) {
      setPendingReason("");
      return;
    }
    setFailure(null);
    setSubmitting(true);
    try {
      // `vendorId` is absent from the edit body: re-pointing a PO at a different vendor
      // changes who is owed the money, which is a new PO rather than a correction.
      const editBody = {
        lines: lines.map((l) => ({
          itemId: l.itemId.trim(),
          qty: parseNumeric(l.qty) ?? 0,
          rate: parseNumeric(l.rate) ?? 0,
        })),
        ...(expectedDate ? { expectedDate } : {}),
        ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
      };
      const body: CreatePoBody = {
        vendorId,
        lines: lines.map((l) => ({
          itemId: l.itemId.trim(),
          qty: parseNumeric(l.qty) ?? 0,
          rate: parseNumeric(l.rate) ?? 0,
        })),
        // Omitted rather than sent empty. `expectedDate` and `remarks` are optional in the
        // schema, and "" is not the same as absent — an empty string would be parsed into a
        // date and stored as 01-Jan-1970.
        ...(expectedDate ? { expectedDate } : {}),
        ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
      };
      // The amend route sits behind `purchase.po.amend`, a permission a buyer who may fix
      // their own draft does not necessarily hold. Sending an amendment down the plain edit
      // route would be asking the server to accept it under the lower right.
      const po = editing
        ? await api.patch<PoDetail>(
            editing.amend
              ? `${purchaseApi.orderPath(editing.po.id)}/amend`
              : purchaseApi.orderPath(editing.po.id),
            { ...editBody, ...(reason ? { reason } : {}) },
            { idempotencyKey },
          )
        : await api.post<PoDetail>(purchaseApi.ordersPath, body, { idempotencyKey });
      onCreated?.(po);
      onClose();
      if (!editing) router.push(`/purchase/order/${po.id}`);
    } catch (e) {
      setFailure(describeFailure(e, "create"));
    } finally {
      setSubmitting(false);
    }
  }

  if (pendingReason !== null && editing) {
    return (
      <ConfirmChanges
        title={`Amend ${editing.po.poNo}`}
        changes={localChanges(
          {
            expectedDate: editing.po.expectedDate?.slice(0, 10) ?? "",
            remarks: editing.po.remarks ?? "",
            lineCount: editing.po.lines?.length ?? 0,
            totalAmount: editing.po.totalAmount,
          },
          {
            expectedDate,
            remarks,
            lineCount: lines.length,
            totalAmount: lines
              .reduce((sum, l) => sum + (parseNumeric(l.qty) ?? 0) * (parseNumeric(l.rate) ?? 0), 0)
              .toFixed(2),
          },
          ["expectedDate", "remarks", "lineCount", "totalAmount"],
        )}
        reasonRequired
        reapprovalRequired
        busy={submitting}
        onCancel={() => setPendingReason(null)}
        onConfirm={(reason) => void submit(reason)}
      />
    );
  }

  return (
    <Modal
      title={
        isEdit
          ? editing!.amend
            ? `Amend ${editing!.po.poNo}`
            : `Correct ${editing!.po.poNo}`
          : "New purchase order"
      }
      subtitle={
        isEdit
          ? editing!.amend
            ? "This PO has left draft and the vendor may already hold it. Your change needs a reason, and it goes back through approval before anyone is committed to the new version."
            : "This PO is still a draft — change anything you need. What it said before is kept in the change history."
          : "Raised as a draft. Nothing is committed to the vendor until it has been submitted and approved."
      }
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <div className="mr-auto text-[11.5px] text-[var(--text-muted)]">
            {lines.length} {lines.length === 1 ? "line" : "lines"} · order value{" "}
            <span className="font-semibold tabular-nums text-[var(--text-primary)]">
              {inr(total)}
            </span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-pri" onClick={() => void submit()} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Raising order…
              </>
            ) : (
              "Raise draft order"
            )}
          </button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {failure ? <FailureNotch notice={failure} /> : null}

        {/* ---- the header fields, two to a row as the deck has them ---- */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label field-req" htmlFor="po-vendor">
              Vendor
            </label>
            <select
              id="po-vendor"
              className="field"
              value={vendorId}
              disabled={submitting}
              onChange={(e) => setVendorId(e.target.value)}
              aria-invalid={Boolean(shownErrors.vendorId)}
            >
              <option value="">
                {vendors.loading ? "Loading vendors…" : "Choose a vendor…"}
              </option>
              {vendors.rows.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code} — {v.name}
                </option>
              ))}
            </select>
            {shownErrors.vendorId ? <FieldError message={shownErrors.vendorId} /> : null}
            {Boolean(vendors.error) && !vendors.loading ? (
              <p className="mt-1 text-[11.5px] text-[var(--bad-ink)]">
                The vendor list could not be read.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={vendors.reload}
                >
                  Try again
                </button>
              </p>
            ) : null}
            {vendors.hasMore ? (
              // Said plainly rather than hidden. A dropdown showing the first hundred of two
              // hundred vendors, with no sign that the rest exist, is how a buyer concludes a
              // supplier "isn't in the system" and raises a duplicate vendor master.
              <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">
                Showing the first {num(vendors.rows.length)} vendors.{" "}
                <button type="button" className="underline" onClick={vendors.loadMore}>
                  {vendors.loadingMore ? "Loading…" : "Load more"}
                </button>
              </p>
            ) : null}
          </div>

          <div>
            <label className="field-label" htmlFor="po-expected">
              Expected delivery
            </label>
            <input
              id="po-expected"
              type="date"
              className="field"
              value={expectedDate}
              disabled={submitting}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
            <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">
              {/* Not decoration — this is the date the whole order book is judged against. */}
              The date the vendor is promising. Leave it empty only if none was agreed; an
              order with no date is one nobody can chase.
            </p>
          </div>

          <div>
            <span className="field-label">Currency</span>
            <div className="field flex items-center justify-between bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
              <span>INR</span>
              <span className="text-[11px] text-[var(--text-muted)]">fixed</span>
            </div>
            <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">
              {/* The schema does take `currency` (3 characters, defaulting to INR). It is not
                  offered as a control because every money figure in this product is rendered
                  in rupees by a single formatter — a USD order would be stored correctly and
                  then displayed everywhere with a ₹ in front of it. */}
              The order is raised in rupees. Other currencies are accepted by the API but
              would be shown with a ₹ symbol throughout, so they are not offered here.
            </p>
          </div>

          <div>
            <label className="field-label" htmlFor="po-remarks">
              Remarks
            </label>
            <textarea
              id="po-remarks"
              rows={2}
              maxLength={500}
              className="field resize-y"
              value={remarks}
              disabled={submitting}
              placeholder="Anything the approver or the vendor needs to know."
              onChange={(e) => setRemarks(e.target.value)}
            />
            <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">
              {num(remarks.length)} of 500 characters.
            </p>
          </div>
        </div>

        {/* ---- the lines ---- */}
        <div className="card">
          <div className="panel-h">
            <span>Lines</span>
            <span className="panel-h-sub">
              At least one. Quantity × rate, per line — see the note under the total.
            </span>
          </div>
          <div className="panel-b flex flex-col gap-3">
            {itemsForbidden ? (
              <p className="rounded-[var(--radius-control)] border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-[12px] leading-5 text-[var(--warn-ink)]">
                The item list could not be read — it belongs to the item master and needs{" "}
                <code className="font-[var(--font-mono)]">{itemsForbidden}</code>, which you do
                not have. You can still raise the order by pasting an item reference below, but
                ask your administrator for that permission: choosing an item from a list is the
                only way to be sure of what is being ordered.
              </p>
            ) : null}
            {Boolean(items.error) && !itemsForbidden && !items.loading ? (
              <p className="text-[12px] text-[var(--bad-ink)]">
                The item list could not be read.{" "}
                <button type="button" className="underline" onClick={items.reload}>
                  Try again
                </button>
              </p>
            ) : null}

            {lines.map((line, index) => {
              const picked = itemsById.get(line.itemId) ?? null;
              const qty = parseNumeric(line.qty);
              const rate = parseNumeric(line.rate);
              const amount = lineAmount(qty ?? 0, rate ?? 0);
              const itemError = shownErrors[`lines.${index}.itemId`];
              const qtyError = shownErrors[`lines.${index}.qty`];
              const rateError = shownErrors[`lines.${index}.rate`];
              return (
                <div
                  key={line.key}
                  className="grid grid-cols-1 gap-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_9rem_2.25rem] sm:items-start"
                >
                  <div className="min-w-0">
                    <label className="field-label field-req" htmlFor={`${line.key}-item`}>
                      Item
                    </label>
                    {itemsForbidden ? (
                      <input
                        id={`${line.key}-item`}
                        type="text"
                        className="field font-[var(--font-mono)] text-[12px]"
                        placeholder="Item reference (UUID)"
                        value={line.itemId}
                        disabled={submitting}
                        onChange={(e) => setLine(index, { itemId: e.target.value })}
                        aria-invalid={Boolean(itemError)}
                      />
                    ) : (
                      <select
                        id={`${line.key}-item`}
                        className="field"
                        value={line.itemId}
                        disabled={submitting}
                        onChange={(e) => setLine(index, { itemId: e.target.value })}
                        aria-invalid={Boolean(itemError)}
                      >
                        <option value="">
                          {items.loading ? "Loading items…" : "Choose an item…"}
                        </option>
                        {items.rows.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.itemCode} — {i.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {itemError ? <FieldError message={itemError} /> : null}
                  </div>

                  <div>
                    <label className="field-label field-req" htmlFor={`${line.key}-qty`}>
                      Quantity
                    </label>
                    <input
                      id={`${line.key}-qty`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      className="field text-right tabular-nums"
                      value={line.qty}
                      disabled={submitting}
                      onChange={(e) => setLine(index, { qty: e.target.value })}
                      aria-invalid={Boolean(qtyError)}
                    />
                    {/* The unit, from the item that was chosen. A quantity of 3 against a
                        material sold by the kilogram and one sold by the coil are different
                        orders, and the buyer should see which one this is. */}
                    <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
                      {picked?.uom ?? " "}
                    </p>
                    {qtyError ? <FieldError message={qtyError} /> : null}
                  </div>

                  <div>
                    <label className="field-label field-req" htmlFor={`${line.key}-rate`}>
                      Rate
                    </label>
                    <input
                      id={`${line.key}-rate`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      className="field text-right tabular-nums"
                      value={line.rate}
                      disabled={submitting}
                      onChange={(e) => setLine(index, { rate: e.target.value })}
                      aria-invalid={Boolean(rateError)}
                    />
                    {/* Shown, never PREFILLED. Standard cost is an accounting valuation, not
                        a price this vendor has agreed; dropping it into the rate box would
                        turn a reference number into a commitment the moment somebody stops
                        reading. */}
                    <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
                      {picked?.standardCost
                        ? `std ${inr(picked.standardCost)}`
                        : " "}
                    </p>
                    {rateError ? <FieldError message={rateError} /> : null}
                  </div>

                  <div>
                    <span className="field-label">Line value</span>
                    <div className="field bg-transparent text-right font-semibold tabular-nums">
                      {qty === null || rate === null ? "—" : inr(amount)}
                    </div>
                  </div>

                  <div className="flex sm:pt-[1.35rem]">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      // The last line is never removable: `lines` has `.min(1)` on it, and a
                      // form that lets you empty it only to refuse the submit is a trap.
                      disabled={submitting || lines.length === 1}
                      title={
                        lines.length === 1
                          ? "An order needs at least one line"
                          : `Remove line ${index + 1}`
                      }
                      aria-label={`Remove line ${index + 1}`}
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              );
            })}

            <div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={submitting}
                onClick={() => setLines((prev) => [...prev, blankLine()])}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add line
              </button>
              {items.hasMore && !itemsForbidden ? (
                <span className="ml-3 text-[11.5px] text-[var(--text-muted)]">
                  Showing the first {num(items.rows.length)} items.{" "}
                  <button type="button" className="underline" onClick={items.loadMore}>
                    {items.loadingMore ? "Loading…" : "Load more"}
                  </button>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* ---- the live total, and what it is not ---- */}
        <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              Live order value
            </span>
            <span className="text-[19px] font-bold tabular-nums text-[var(--text-primary)]">
              {inr(total)}
            </span>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-5 text-[var(--text-muted)]">
            The sum of quantity × rate. <strong>No tax is included, and none can be</strong> —
            a purchase order in this system holds no GST rate, no CGST/SGST/IGST split and no
            tax amount against a line, and no freight or other charge either. This is not what
            the vendor will invoice and it is not a landed cost. It is the figure that will be
            stored on the order, rounded per line exactly as the server rounds it.
          </p>
          <p className="mt-1 text-[11.5px] leading-5 text-[var(--text-muted)]">
            Payment terms are held on the vendor master, not on the order — the create endpoint
            has no field for them, so they are not asked for here.
          </p>
        </div>
      </form>
    </Modal>
  );
}
