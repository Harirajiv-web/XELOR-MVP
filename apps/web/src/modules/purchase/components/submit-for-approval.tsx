"use client";

import { useState } from "react";
import { Loader2, SendHorizontal, ShieldCheck } from "lucide-react";
import { api } from "@spine/api/client";
import { inr, dateTime } from "@spine/format";
import type { FailureNotice, PoDetail, PoSubmitResult } from "../api";
import { describeFailure, purchaseApi } from "../api";
import { FailureNotch } from "./failure-notch";

/**
 * SUBMIT FOR APPROVAL — the moment a draft becomes a commitment somebody has to sign off.
 *
 * IT IS ONLY EVER DRAWN FOR A DRAFT. `PurchaseService.submitPo` loads the order and throws
 * `PO_NOT_DRAFT` (409) before it touches the workflow engine if the status is anything else,
 * so a Submit button on an approved or already-pending order has exactly one possible
 * outcome: an error. Drawing a control whose only reachable result is a refusal teaches
 * people that the software's buttons are guesses. The caller checks `canSubmitForApproval`;
 * this component re-checks nothing, because there is one rule and it lives in `api.ts` next
 * to the endpoint it guards.
 *
 * It is a strip rather than a header button on purpose. "This is still a draft — nobody has
 * committed to it" is the fact a buyer needs in order to understand why the action exists at
 * all, and the strip is also where a refusal can be shown without wiping the screen.
 *
 * ONE IDEMPOTENCY KEY, held for as long as this component is mounted. The spine's client
 * would otherwise mint a fresh one per call, and a retry after a dropped connection would
 * start a second approval instance for the same order.
 */
export function SubmitForApproval({
  po,
  onSubmitted,
  onReload,
}: {
  po: PoDetail;
  onSubmitted: (result: PoSubmitResult) => void;
  /** Re-read the order — offered when the failure says this page is looking at a stale copy. */
  onReload: () => void;
}): React.JSX.Element {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<FailureNotice | null>(null);

  const emptyOrder = po.lines.length === 0;

  async function submit(): Promise<void> {
    if (submitting) return;
    setFailure(null);
    setSubmitting(true);
    try {
      const result = await api.post<PoSubmitResult>(
        purchaseApi.submitPath(po.id),
        undefined,
        { idempotencyKey },
      );
      onSubmitted(result);
    } catch (e) {
      setFailure(describeFailure(e, "submit"));
    } finally {
      // Always re-enabled, including after a failure — a button stuck disabled on an error is
      // a dead screen, and the idempotency key is what keeps a second press safe.
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div className="panel-b flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">
              This order is still a draft.
            </p>
            <p className="mt-0.5 text-[12px] leading-5 text-[var(--text-muted)]">
              Nothing has been committed to {po.vendorName} yet. Submitting sends it into the
              purchase approval route — {inr(po.totalAmount)} across {po.lines.length}{" "}
              {po.lines.length === 1 ? "line" : "lines"}, exclusive of tax, because a purchase
              order in this system carries no GST at all.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-pri shrink-0"
            // Disabled in flight so a second click cannot fire a second request — belt as
            // well as braces, the braces being the stable idempotency key above.
            disabled={submitting || emptyOrder}
            title={
              emptyOrder
                ? "An order with no lines cannot be submitted"
                : "Send this order for approval"
            }
            onClick={() => void submit()}
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Submitting…
              </>
            ) : (
              <>
                <SendHorizontal className="h-3.5 w-3.5" aria-hidden />
                Submit for approval
              </>
            )}
          </button>
        </div>

        {emptyOrder ? (
          <p className="text-[12px] text-[var(--text-muted)]">
            This order has no lines, so there is nothing to approve.
          </p>
        ) : null}

        {failure ? (
          <FailureNotch notice={failure} onReload={failure.stale ? onReload : undefined} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Where it went. Shown after a successful submit, because "it worked" is not the useful
 * answer — "it is with the stores approver, due Thursday" is. The workflow instance comes
 * back on the same response, so this costs no extra request.
 */
export function ApprovalRouted({ result }: { result: PoSubmitResult }): React.JSX.Element {
  const wf = result.workflow;
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--ok)] bg-[var(--ok-soft)] px-4 py-3 text-[var(--ok-ink)]">
      <div className="flex gap-2.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="text-[12.5px] leading-5">
          <p className="font-semibold">Sent for approval.</p>
          <p className="mt-0.5 opacity-90">
            {wf.currentStepName
              ? `It is now with ${wf.currentStepName} (step ${wf.currentStepSeq} of the ${wf.definitionCode} route).`
              : `It has entered the ${wf.definitionCode} route.`}
            {wf.slaDueAt ? ` A decision is due by ${dateTime(wf.slaDueAt)}.` : ""}
          </p>
          <p className="mt-0.5 opacity-80">
            {/* Said plainly: this screen cannot approve, and neither can this person merely by
                having submitted. Approval is checked against the route's own approver. */}
            Approval is not yours to give from here — the route decides who signs it off.
          </p>
        </div>
      </div>
    </div>
  );
}
