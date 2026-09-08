import { addDays, daysBetween } from "../time/date.js";

/**
 * e-INVOICE (IRN) AND e-WAY BILL (INTEGRATION §11, DECISIONS-V2 §3.4).
 *
 * The statutory pipeline is the one integration where a retry can cost real money, so the
 * rules below are not defensive programming — each one exists because the naive behaviour
 * has a specific, expensive failure:
 *
 *  - **GET before you retry.** A timeout on IRN generation does not mean it failed. The
 *    portal may have registered the invoice and lost the response. Blindly re-POSTing
 *    either duplicates the document or burns a cancellation window; fetching by document
 *    reference first is the only safe recovery, and it is why the idempotency key is
 *    derived from the document rather than the attempt.
 *
 *  - **The 30-day reporting window is a cliff, not a slope.** Taxpayers above the AATO
 *    threshold cannot report an invoice older than 30 days — the portal simply refuses,
 *    and the invoice can never be reported at all. So the alerts are early and escalating
 *    (day 20, 25, 28) rather than a single notice on day 29.
 *
 *  - **Cancellation is 24 hours.** After that the only remedy is a credit note, which is a
 *    different document with different accounting. The window is computed and shown rather
 *    than assumed.
 */

export type IrnStatus = "pending" | "generated" | "cancelled" | "failed";

export const IRN_CANCEL_WINDOW_HOURS = 24;
export const IRN_REPORTING_WINDOW_DAYS = 30;
/** Aggregate turnover at or above which the 30-day window applies. */
export const REPORTING_WINDOW_AATO_THRESHOLD = 100_000_000; // ₹10 crore

export type WindowAlertLevel = 0 | 1 | 2 | 3;

export interface ReportingWindow {
  applicable: boolean;
  deadlineAt: string | null;
  daysRemaining: number | null;
  alertLevel: WindowAlertLevel;
  blocked: boolean;
  message: string;
}

/**
 * Where an unreported invoice stands against the 30-day window.
 *
 * Escalating rather than binary: an invoice at day 20 is a task, at day 25 it is somebody's
 * afternoon, and at day 28 it is an emergency. A single alert on day 29 gives an accounts
 * team one working day to fix a problem that may need the customer's cooperation.
 */
export function reportingWindow(input: {
  docDate: string;
  aato: number;
  reportedAt?: string | null;
  asOf: string;
}): ReportingWindow {
  const applicable = input.aato >= REPORTING_WINDOW_AATO_THRESHOLD;
  if (!applicable) {
    return {
      applicable: false,
      deadlineAt: null,
      daysRemaining: null,
      alertLevel: 0,
      blocked: false,
      message: "Below the ₹10 crore turnover threshold — the 30-day reporting window does not apply.",
    };
  }

  const deadline = addDays(input.docDate.slice(0, 10), IRN_REPORTING_WINDOW_DAYS);
  if (input.reportedAt) {
    const inTime = input.reportedAt.slice(0, 10) <= deadline;
    return {
      applicable: true,
      deadlineAt: deadline,
      daysRemaining: null,
      alertLevel: 0,
      blocked: false,
      message: inTime ? `Reported within the window (deadline ${deadline}).` : `Reported AFTER the ${deadline} deadline — the portal should have refused this; check the record.`,
    };
  }

  const daysRemaining = daysBetween(input.asOf.slice(0, 10), deadline);
  const age = IRN_REPORTING_WINDOW_DAYS - daysRemaining;

  if (daysRemaining < 0) {
    return {
      applicable: true,
      deadlineAt: deadline,
      daysRemaining,
      alertLevel: 3,
      blocked: true,
      // This is the failure the alerts exist to prevent, and it has no remedy inside the portal.
      message: `The 30-day window closed on ${deadline}. This invoice can no longer be reported at all — the portal will refuse it. It needs a credit note and a re-issue.`,
    };
  }
  if (age >= 28) {
    return { applicable: true, deadlineAt: deadline, daysRemaining, alertLevel: 3, blocked: false, message: `CRITICAL: ${daysRemaining} day(s) left. After ${deadline} this invoice can never be reported.` };
  }
  if (age >= 25) {
    return { applicable: true, deadlineAt: deadline, daysRemaining, alertLevel: 2, blocked: false, message: `${daysRemaining} day(s) left to report. Escalate now — fixing a rejected invoice can need the customer.` };
  }
  if (age >= 20) {
    return { applicable: true, deadlineAt: deadline, daysRemaining, alertLevel: 1, blocked: false, message: `${daysRemaining} day(s) left of the 30-day reporting window.` };
  }
  return { applicable: true, deadlineAt: deadline, daysRemaining, alertLevel: 0, blocked: false, message: `${daysRemaining} day(s) left of the 30-day reporting window.` };
}

export interface CancelWindow {
  cancellable: boolean;
  hoursRemaining: number;
  deadlineAt: string;
  message: string;
}

export function cancelWindow(ackDate: string, asOf: string): CancelWindow {
  const deadline = new Date(Date.parse(ackDate) + IRN_CANCEL_WINDOW_HOURS * 3_600_000);
  const hoursRemaining = Math.round(((deadline.getTime() - Date.parse(asOf)) / 3_600_000) * 10) / 10;
  return {
    cancellable: hoursRemaining > 0,
    hoursRemaining,
    deadlineAt: deadline.toISOString(),
    message:
      hoursRemaining > 0
        ? `${hoursRemaining} hour(s) left to cancel this IRN.`
        : `The 24-hour cancellation window closed ${Math.abs(hoursRemaining)} hour(s) ago. The only remedy now is a credit note — a different document with different accounting.`,
  };
}

/**
 * The idempotency key for an IRN submission.
 *
 * Derived from the DOCUMENT, never from the attempt. That is the whole point: attempt two
 * of the same invoice must present the same key, so the gateway can recognise it as the
 * same submission rather than a second invoice.
 */
export function irnIdempotencyKey(input: { gstin: string; docType: string; invoiceRef: string; fy: string }): string {
  return `irn:${input.gstin}:${input.docType}:${input.invoiceRef}:${input.fy}`;
}

export type RecoveryAction = "get_by_document" | "retry_submit" | "stop_and_review" | "none";

export interface RecoveryPlan {
  action: RecoveryAction;
  reason: string;
}

/**
 * What to do after a failed or ambiguous IRN attempt.
 *
 * A timeout is the dangerous case and it is treated as "unknown", not "failed" — because
 * the two are indistinguishable from here and only one of them is safe to retry blindly.
 */
export function recoveryPlan(input: {
  status: IrnStatus;
  timedOut: boolean;
  httpStatus?: number | null;
  errorCode?: string | null;
  attempts: number;
}): RecoveryPlan {
  if (input.status === "generated") return { action: "none", reason: "The IRN already exists; nothing to do." };
  if (input.status === "cancelled") return { action: "none", reason: "This document was cancelled. A new document is needed, not a retry." };

  if (input.timedOut || input.httpStatus === 504 || input.httpStatus === 502) {
    return {
      action: "get_by_document",
      reason: "The request timed out, which is NOT the same as failing. The portal may hold an IRN for this document already — fetch by document reference before sending anything.",
    };
  }
  // Duplicate-IRN codes mean the portal already has it; the IRN is retrievable, not lost.
  if (input.errorCode && /^(2150|2172|2283)$/.test(input.errorCode)) {
    return { action: "get_by_document", reason: `The portal reports this document is already registered (${input.errorCode}). Fetch the existing IRN rather than generating a second one.` };
  }
  if (input.attempts >= 5) {
    return { action: "stop_and_review", reason: "Five attempts have failed. Something is wrong with the document or the credential; more attempts will not discover which." };
  }
  if (input.httpStatus && input.httpStatus >= 400 && input.httpStatus < 500) {
    return { action: "stop_and_review", reason: `The portal rejected the payload (${input.httpStatus}). It will reject it identically next time.` };
  }
  return { action: "retry_submit", reason: "Transient failure with no sign the portal saw the document. Safe to submit again with the same idempotency key." };
}

/* -------------------------------------------------------------------------- */
/*  e-Way bill                                                                */
/* -------------------------------------------------------------------------- */

export type EwbStatus = "pending" | "generated" | "part_b_updated" | "cancelled" | "expired" | "failed";

/** Distance bands: 1 day per 200 km (over-dimensional cargo is 1 per 20 km). */
export function ewbValidityDays(distanceKm: number, overDimensional = false): number {
  const perDay = overDimensional ? 20 : 200;
  return Math.max(1, Math.ceil(distanceKm / perDay));
}

export interface EwbValidity {
  validUpto: string;
  daysValid: number;
  expired: boolean;
  message: string;
}

export function ewbValidity(input: { generatedAt: string; distanceKm: number; overDimensional?: boolean; asOf: string }): EwbValidity {
  const days = ewbValidityDays(input.distanceKm, input.overDimensional);
  const validUpto = new Date(Date.parse(input.generatedAt) + days * 86_400_000).toISOString();
  const expired = Date.parse(input.asOf) > Date.parse(validUpto);
  return {
    validUpto,
    daysValid: days,
    expired,
    message: expired
      ? `Expired on ${validUpto.slice(0, 10)}. A vehicle moving on an expired e-way bill is a detention risk, and extension is only possible while it is still valid.`
      : `Valid until ${validUpto.slice(0, 10)} — ${days} day(s) for ${input.distanceKm} km.`,
  };
}

export type Portal = "ewb1" | "ewb2";

export interface PortalChoice {
  portal: Portal;
  failedOver: boolean;
  message: string;
}

/**
 * Dual-portal selection.
 *
 * The second portal exists because the first one has scheduled and unscheduled downtime,
 * and a truck at a gate cannot wait for it. Failover is recorded on the document — an
 * e-way bill generated on the secondary portal must be *cancelled* on the secondary
 * portal, and losing that fact is how a cancellation silently fails.
 */
export function choosePortal(health: { ewb1Healthy: boolean; ewb2Healthy: boolean }): PortalChoice {
  if (health.ewb1Healthy) return { portal: "ewb1", failedOver: false, message: "Primary portal healthy." };
  if (health.ewb2Healthy) {
    return {
      portal: "ewb2",
      failedOver: true,
      message: "Primary portal is down — using the secondary. This is recorded on the document, because a bill generated on ewb2 must also be cancelled on ewb2.",
    };
  }
  return { portal: "ewb1", failedOver: false, message: "Both portals are unreachable. The document is queued; it is not lost." };
}
