"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleCheck, CircleX, Loader2, SendHorizontal, ShoppingCart } from "lucide-react";
import { api } from "@spine/api/client";
import { AppError } from "@spine/api/errors";
import { useCursorList } from "@spine/data/use-query";
import { Can } from "@spine/access/permissions";
import { date, inr } from "@spine/format";
import { FieldError } from "@spine/states";
import { Modal } from "@spine/ui/modal";
import type { CompanyOption, FailureNotice, GstRegistrationOption, QuotationView } from "../api";
import { canConvert, canDecide, canSend, describeFailure, quotationApi } from "../api";
import { FailureNotch } from "./failure-notch";

/**
 * WHAT CAN BE DONE TO A QUOTATION, AND WHEN.
 *
 * Four actions, each drawn only in the state the API will actually accept it in — `canSend`,
 * `canDecide` and `canConvert` in `api.ts` state those rules once, next to the endpoints that
 * enforce them. A Send button on a sent quotation has exactly one reachable outcome, and a
 * control whose only possible result is a refusal teaches people that this software's buttons
 * are guesses.
 *
 * Each action is `<Can>`-gated rather than disabled. A person who cannot record a customer's
 * answer is never offered the button; a greyed-out control that exists only to refuse them is
 * worse than no control at all. The guard decides what to DRAW — `@RequirePermission` on the
 * endpoint is what decides what is allowed.
 *
 * EVERY ACTION PINS ITS OWN IDEMPOTENCY KEY, and they are deliberately not shared. The server
 * fingerprints the body against the key, so one key across Send and Accept would come back as
 * `IDEMPOTENCY_KEY_MISMATCH` on the second action. One key per action, held for as long as
 * that control is on screen, means a retry after a dropped connection replays the first
 * answer instead of doing the thing twice.
 */
export function QuotationActions({
  quotation,
  onChanged,
  onReload,
}: {
  quotation: QuotationView;
  /** Called after a successful action — the caller re-reads rather than trusting a response. */
  onChanged: () => void;
  /** Offered inside a failure that says this page is looking at a copy that has moved on. */
  onReload: () => void;
}): React.JSX.Element | null {
  const [sendKey] = useState(() => crypto.randomUUID());
  const [acceptKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState<"send" | "accept" | null>(null);
  const [failure, setFailure] = useState<FailureNotice | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [converting, setConverting] = useState(false);

  const showSend = canSend(quotation.status);
  const showDecide = canDecide(quotation.status);
  const showConvert = canConvert(quotation);

  async function run(
    what: "send" | "accept",
    path: string,
    body: unknown,
    idempotencyKey: string,
  ): Promise<void> {
    if (busy) return;
    setFailure(null);
    setBusy(what);
    try {
      await api.post(path, body, { idempotencyKey });
      onChanged();
    } catch (e) {
      setFailure(describeFailure(e, what === "send" ? "send" : "decide"));
    } finally {
      // Always re-enabled, including after a failure. A button stuck disabled on an error is
      // a dead screen, and the pinned key is what keeps a second press safe.
      setBusy(null);
    }
  }

  if (!showSend && !showDecide && !showConvert && !failure) return null;

  return (
    <div className="card">
      <div className="panel-b flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">
              {showSend
                ? "This quotation has not been sent yet."
                : showDecide
                  ? "Waiting on the customer."
                  : "The customer has accepted this price."}
            </p>
            <p className="mt-0.5 text-[12px] leading-5 text-[var(--text-muted)]">
              {showSend
                ? `Nothing has left the building. Sending records the moment the price stopped being ours and became theirs — ${inr(quotation.grandTotal)} including GST, held until ${date(quotation.validUntil)}.`
                : showDecide
                  ? `Record what they actually said. An answer is theirs, not ours — accepting after ${date(quotation.validUntil)} is refused, because a price nobody re-checked is not a price this plant should be held to.`
                  : "Converting raises the sales order through Sales' own service, so it gets the GST treatment, the credit check, the numbering and the audit trail exactly as a typed order would. Nothing about it is special because it came from a quotation."}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {showSend ? (
              <Can permission="sales.quotation.send">
                <button
                  type="button"
                  className="btn btn-pri"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("send", quotationApi.sendPath(quotation.id), undefined, sendKey)
                  }
                >
                  {busy === "send" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      Sending…
                    </>
                  ) : (
                    <>
                      <SendHorizontal className="h-3.5 w-3.5" aria-hidden />
                      Send to customer
                    </>
                  )}
                </button>
              </Can>
            ) : null}

            {showDecide ? (
              <Can permission="sales.quotation.decide">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy !== null}
                  onClick={() => setRejecting(true)}
                >
                  <CircleX className="h-3.5 w-3.5" aria-hidden />
                  They said no
                </button>
                <button
                  type="button"
                  className="btn btn-pri"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(
                      "accept",
                      quotationApi.decidePath(quotation.id),
                      { decision: "accepted" },
                      acceptKey,
                    )
                  }
                >
                  {busy === "accept" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      Recording…
                    </>
                  ) : (
                    <>
                      <CircleCheck className="h-3.5 w-3.5" aria-hidden />
                      They accepted
                    </>
                  )}
                </button>
              </Can>
            ) : null}

            {showConvert ? (
              <Can permission="sales.quotation.convert">
                <button
                  type="button"
                  className="btn btn-pri"
                  disabled={busy !== null}
                  onClick={() => setConverting(true)}
                >
                  <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
                  Turn into a sales order
                </button>
              </Can>
            ) : null}
          </div>
        </div>

        {failure ? (
          <FailureNotch notice={failure} onReload={failure.stale ? onReload : undefined} />
        ) : null}
      </div>

      {/* Both are unmounted when closed, deliberately: each pins ONE Idempotency-Key for its
          lifetime, so "closed and reopened" has to mean a new key and a genuinely new attempt. */}
      {rejecting ? (
        <RejectDialog
          quotation={quotation}
          onClose={() => setRejecting(false)}
          onDone={() => {
            setRejecting(false);
            onChanged();
          }}
          onReload={onReload}
        />
      ) : null}

      {converting ? (
        <ConvertDialog
          quotation={quotation}
          onClose={() => setConverting(false)}
          onDone={() => {
            setConverting(false);
            onChanged();
          }}
          onReload={onReload}
        />
      ) : null}
    </div>
  );
}

/* ========================================================================== */
/* They said no                                                                */
/* ========================================================================== */

/**
 * The API accepts a blank `lostReason`. This form does not, and the difference is deliberate:
 * a lost quotation with no reason on it is a row that teaches nobody anything, and the one
 * moment somebody actually knows why is the moment they are recording it. Being stricter than
 * the server is safe in this direction — the server still refuses everything it refused
 * before — and it is stated here rather than left as a surprise.
 */
function RejectDialog({
  quotation,
  onClose,
  onDone,
  onReload,
}: {
  quotation: QuotationView;
  onClose: () => void;
  onDone: () => void;
  onReload: () => void;
}): React.JSX.Element {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<FailureNotice | null>(null);

  const error =
    reason.trim().length === 0
      ? "Say why it was lost — price, lead time, a competitor, a specification we could not meet."
      : reason.length > 500
        ? "500 characters at most."
        : null;

  async function submit(): Promise<void> {
    setAttempted(true);
    if (error || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await api.post(
        quotationApi.decidePath(quotation.id),
        { decision: "rejected", lostReason: reason.trim() },
        { idempotencyKey },
      );
      onDone();
    } catch (e) {
      setFailure(describeFailure(e, "decide"));
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={`${quotation.quoteNo} was not accepted`}
      subtitle="Recording the customer's answer. The quotation stays exactly as it was — the price, the lines and the revision are all still readable afterwards."
      onClose={() => {
        if (!submitting) onClose();
      }}
      locked={submitting}
      width="max-w-lg"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-pri"
            disabled={submitting}
            onClick={() => void submit()}
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Recording…
              </>
            ) : (
              "Record as lost"
            )}
          </button>
        </>
      }
    >
      {failure ? (
        <FailureNotch notice={failure} onReload={failure.stale ? onReload : undefined} />
      ) : null}
      <label className="field-label field-req" htmlFor="qt-lost-reason">
        Why it was lost
      </label>
      <textarea
        id="qt-lost-reason"
        data-autofocus
        className="field"
        rows={3}
        maxLength={500}
        value={reason}
        disabled={submitting}
        aria-invalid={Boolean(attempted && error)}
        style={attempted && error ? { borderColor: "var(--bad)" } : undefined}
        onChange={(e) => {
          setFailure(null);
          setReason(e.target.value);
        }}
      />
      {attempted && error ? (
        <FieldError message={error} />
      ) : (
        <p className="mt-1 text-[11px] leading-[1.45] text-[var(--text-muted)]">
          Required here, though the API would accept a blank one. A lost quotation with no
          reason against it is the one record that could have told somebody what to change.
        </p>
      )}
    </Modal>
  );
}

/* ========================================================================== */
/* Turn it into a sales order                                                  */
/* ========================================================================== */

/**
 * Two facts the quotation does not hold, and the order cannot be raised without: the
 * customer's own PO number, and which of this company's GST registrations is selling. The
 * second decides the place of supply and therefore whether the order carries IGST or
 * CGST + SGST, which is why it is asked rather than assumed.
 */
function ConvertDialog({
  quotation,
  onClose,
  onDone,
  onReload,
}: {
  quotation: QuotationView;
  onClose: () => void;
  onDone: () => void;
  onReload: () => void;
}): React.JSX.Element {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [custPoNo, setCustPoNo] = useState("");
  const [supplierGstin, setSupplierGstin] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<FailureNotice | null>(null);

  // The tenant's own registrations. A salesperson may well not hold `general.company.read`,
  // so this list failing is an ORDINARY outcome rather than an error — the field degrades
  // from a picker to a typed GSTIN, which the server validates either way.
  const companies = useCursorList<CompanyOption>(quotationApi.companiesPath, {
    limit: quotationApi.pickerPageSize,
  });

  const registrations = useMemo<Array<GstRegistrationOption & { company: string }>>(
    () => companies.rows.flatMap((c) => c.registrations.map((r) => ({ ...r, company: c.legalName }))),
    [companies.rows],
  );

  // One registration means there is no choice to make, so it is made. Several is a real
  // decision — it changes the place of supply and therefore the tax — and stays unanswered.
  useEffect(() => {
    if (supplierGstin) return;
    const only = registrations.length === 1 ? registrations[0] : undefined;
    if (only) setSupplierGstin(only.gstin);
  }, [registrations, supplierGstin]);

  const errors: Record<string, string> = {};
  if (!custPoNo.trim()) errors.custPoNo = "The customer's own order number, as they wrote it.";
  else if (custPoNo.trim().length > 60) errors.custPoNo = "60 characters at most.";
  if (supplierGstin.trim().length !== 15) {
    errors.supplierGstin = "A GSTIN is exactly 15 characters.";
  }
  const shown: Record<string, string> = attempted
    ? { ...errors, ...(failure?.fields ?? {}) }
    : (failure?.fields ?? {});

  async function submit(): Promise<void> {
    setAttempted(true);
    if (Object.keys(errors).length > 0 || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await api.post(
        quotationApi.convertPath(quotation.id),
        { custPoNo: custPoNo.trim(), supplierGstin: supplierGstin.trim().toUpperCase() },
        { idempotencyKey },
      );
      onDone();
    } catch (e) {
      setFailure(describeFailure(e, "convert"));
      setSubmitting(false);
    }
  }

  const registrationsUnavailable =
    !companies.loading && (Boolean(companies.error) || registrations.length === 0);
  const denied = companies.error instanceof AppError ? companies.error.missingPermission : null;

  return (
    <Modal
      title={`Turn ${quotation.quoteNo} into a sales order`}
      subtitle="The lines, quantities, rates, HSN codes and GST rates come across exactly as quoted. Two things the quotation does not hold are needed before an order can exist."
      onClose={() => {
        if (!submitting) onClose();
      }}
      locked={submitting}
      width="max-w-lg"
      footer={
        <>
          <div className="mr-auto min-w-0">
            <div className="field-label mb-0">Order value</div>
            <div
              className="text-[15px] font-bold tabular-nums text-[var(--text-primary)]"
              data-numeric=""
            >
              {inr(quotation.grandTotal)}
            </div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-pri"
            disabled={submitting}
            onClick={() => void submit()}
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Raising the order…
              </>
            ) : (
              "Raise the sales order"
            )}
          </button>
        </>
      }
    >
      {failure ? (
        <FailureNotch notice={failure} onReload={failure.stale ? onReload : undefined} />
      ) : null}

      <div className="flex flex-col gap-3.5">
        <div>
          <label className="field-label field-req" htmlFor="qt-cust-po">
            Their PO number
          </label>
          <input
            id="qt-cust-po"
            data-autofocus
            className="field"
            maxLength={60}
            autoComplete="off"
            value={custPoNo}
            disabled={submitting}
            aria-invalid={Boolean(shown.custPoNo)}
            style={shown.custPoNo ? { borderColor: "var(--bad)" } : undefined}
            onChange={(e) => {
              setFailure(null);
              setCustPoNo(e.target.value);
            }}
          />
          {shown.custPoNo ? (
            <FieldError message={shown.custPoNo} />
          ) : (
            <p className="mt-1 text-[11px] leading-[1.45] text-[var(--text-muted)]">
              What the customer calls this order. It is what they will quote on the phone, and
              the order refuses a duplicate of it against the same customer.
            </p>
          )}
        </div>

        <div>
          <label className="field-label field-req" htmlFor="qt-supplier-gstin">
            Selling GSTIN
          </label>
          {registrationsUnavailable ? (
            <input
              id="qt-supplier-gstin"
              className="field font-[var(--font-mono)] uppercase"
              maxLength={15}
              autoComplete="off"
              placeholder="27AABCT1234F1Z5"
              value={supplierGstin}
              disabled={submitting}
              aria-invalid={Boolean(shown.supplierGstin)}
              style={shown.supplierGstin ? { borderColor: "var(--bad)" } : undefined}
              onChange={(e) => {
                setFailure(null);
                setSupplierGstin(e.target.value.toUpperCase());
              }}
            />
          ) : (
            <select
              id="qt-supplier-gstin"
              className="field"
              value={supplierGstin}
              disabled={submitting}
              aria-invalid={Boolean(shown.supplierGstin)}
              style={shown.supplierGstin ? { borderColor: "var(--bad)" } : undefined}
              onChange={(e) => {
                setFailure(null);
                setSupplierGstin(e.target.value);
              }}
            >
              <option value="">
                {companies.loading ? "Loading registrations…" : "Choose a registration…"}
              </option>
              {registrations.map((r) => (
                <option key={r.id} value={r.gstin}>
                  {r.placeName} · {r.gstin} · {r.company}
                </option>
              ))}
            </select>
          )}
          {shown.supplierGstin ? (
            <FieldError message={shown.supplierGstin} />
          ) : (
            <p className="mt-1 text-[11px] leading-[1.45] text-[var(--text-muted)]">
              {registrationsUnavailable
                ? denied
                  ? `Your registrations could not be listed (needs ${denied}), so type the GSTIN this order is sold from.`
                  : "Your registrations could not be listed, so type the GSTIN this order is sold from."
                : "Which of your plants is selling. It decides the place of supply, and therefore whether the order carries IGST or CGST + SGST."}
            </p>
          )}
        </div>

        <p className="rounded-[var(--radius-control)] bg-[var(--surface-sunken)] px-3 py-2 text-[11.5px] leading-[1.55] text-[var(--text-muted)]">
          The order is raised through Sales&apos; own service, so it goes through the credit
          gate like any other. If the customer is over their limit the order will be created
          and held — the conversion is not a way round that check.
        </p>
      </div>
    </Modal>
  );
}
