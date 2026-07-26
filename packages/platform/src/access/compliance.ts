import { addDays, daysBetween } from "../time/date.js";

/**
 * COMPLIANCE CLOCKS AND THE AUDIT CHAIN (ADMINISTRATION §9.6, DECISIONS-V2 §3).
 *
 * Three obligations with hard numbers in them, and the numbers are the whole content:
 *
 *  - **CERT-In: six hours.** A reportable cyber incident must be reported within six hours
 *    of *noticing* it — not of it happening, and not of confirming it. The clock starts at
 *    detection, which is why `detected_at` is captured before anybody knows how bad it is.
 *  - **DPDP: seventy-two hours** to intimate the Data Protection Board of a personal-data
 *    breach, and **ninety days** to answer a data-principal request. Both armed now,
 *    enforceable from the DPDP Rules phase-in.
 *  - **MCA Rule 11(g): eight years** of unalterable audit trail.
 *
 * None of these numbers is a constant in a branch anywhere. They are configuration with a
 * floor, and the floor is enforced — a tenant may keep records longer than the statute
 * requires, never shorter.
 */

export const CERT_IN_REPORT_HOURS = 6;
export const DPDP_BOARD_INTIMATION_HOURS = 72;
export const DSR_RESPONSE_DAYS = 90;

/** Statutory minimums. A setting below its floor is refused, not clamped silently. */
export const RETENTION_FLOORS: Readonly<Record<string, number>> = {
  "audit.retention_years": 8, // MCA Rule 11(g)
  "logs.security_min_retention_days": 180, // CERT-In direction
  "logs.pii_access_min_retention_days": 365,
};

export function checkRetentionFloor(key: string, value: number): { ok: boolean; floor: number | null; reason: string } {
  const floor = RETENTION_FLOORS[key];
  if (floor === undefined) return { ok: true, floor: null, reason: `${key} has no statutory floor.` };
  if (value >= floor) return { ok: true, floor, reason: `${value} meets the floor of ${floor}.` };
  return {
    ok: false,
    floor,
    reason: `${key} cannot be set to ${value}: the statutory floor is ${floor}. A tenant may keep records for longer than the law requires, never for less.`,
  };
}

export type IncidentSeverity = "critical" | "high" | "medium" | "low";

export interface IncidentClock {
  detectedAt: string;
  certInDueAt: string;
  certInReportable: boolean;
  dpdpBoardDueAt: string | null;
  /** Hours left against the CERT-In clock at `asOf`; negative when it has passed. */
  certInHoursRemaining: number;
  breached: boolean;
  status: "reported" | "on_track" | "urgent" | "breached" | "not_reportable";
  message: string;
}

/**
 * The dual clock.
 *
 * Both clocks run from DETECTION, and they run in parallel rather than in sequence: the
 * six-hour CERT-In report is not a prerequisite for the seventy-two-hour DPDP intimation,
 * and treating them as a pipeline is how the second deadline is missed while the first is
 * being handled.
 */
export function incidentClock(input: {
  detectedAt: string;
  certInReportable: boolean;
  piiAffected: boolean;
  certInReportedAt?: string | null;
  asOf: string;
}): IncidentClock {
  const detected = Date.parse(input.detectedAt);
  const asOf = Date.parse(input.asOf);
  const certInDue = new Date(detected + CERT_IN_REPORT_HOURS * 3_600_000).toISOString();
  const dpdpDue = input.piiAffected ? new Date(detected + DPDP_BOARD_INTIMATION_HOURS * 3_600_000).toISOString() : null;

  if (!input.certInReportable) {
    return {
      detectedAt: input.detectedAt,
      certInDueAt: certInDue,
      certInReportable: false,
      dpdpBoardDueAt: dpdpDue,
      certInHoursRemaining: 0,
      breached: false,
      status: "not_reportable",
      message: "Not a CERT-In reportable category. The clock is recorded anyway, because the classification can change.",
    };
  }

  if (input.certInReportedAt) {
    const late = Date.parse(input.certInReportedAt) > Date.parse(certInDue);
    return {
      detectedAt: input.detectedAt,
      certInDueAt: certInDue,
      certInReportable: true,
      dpdpBoardDueAt: dpdpDue,
      certInHoursRemaining: Math.round(((Date.parse(certInDue) - Date.parse(input.certInReportedAt)) / 3_600_000) * 10) / 10,
      breached: late,
      status: "reported",
      message: late
        ? `Reported, but AFTER the six-hour deadline. The lateness is part of the record and cannot be edited out.`
        : `Reported within the six-hour window.`,
    };
  }

  const remaining = Math.round(((Date.parse(certInDue) - asOf) / 3_600_000) * 10) / 10;
  const status = remaining < 0 ? "breached" : remaining <= 2 ? "urgent" : "on_track";
  return {
    detectedAt: input.detectedAt,
    certInDueAt: certInDue,
    certInReportable: true,
    dpdpBoardDueAt: dpdpDue,
    certInHoursRemaining: remaining,
    breached: remaining < 0,
    status,
    message:
      remaining < 0
        ? `The six-hour CERT-In deadline passed ${Math.abs(remaining)} hour(s) ago. Report now and record the delay.`
        : `${remaining} hour(s) left to report to CERT-In.${dpdpDue ? ` Personal data is affected, so the Data Protection Board must be intimated by ${dpdpDue.slice(0, 16).replace("T", " ")}.` : ""}`,
  };
}

export interface DsrClock {
  receivedAt: string;
  dueAt: string;
  daysRemaining: number;
  status: "fulfilled" | "on_track" | "approaching" | "overdue" | "refused_statutory_hold";
  message: string;
}

/**
 * The data-principal request clock: ninety days from receipt.
 *
 * Alarms at sixty and eighty days rather than at ninety, because a request that surfaces
 * on day ninety is already late — assembling a person's data across a manufacturing ERP
 * is not a same-day job.
 */
export function dsrClock(input: {
  receivedAt: string;
  status: string;
  statutoryHoldRefs?: string | null;
  asOf: string;
}): DsrClock {
  const dueAt = addDays(input.receivedAt.slice(0, 10), DSR_RESPONSE_DAYS);
  const daysRemaining = daysBetween(input.asOf.slice(0, 10), dueAt);

  if (input.status === "refused_statutory_hold") {
    return {
      receivedAt: input.receivedAt,
      dueAt,
      daysRemaining,
      status: "refused_statutory_hold",
      message: `Refused under a statutory hold${input.statutoryHoldRefs ? ` (${input.statutoryHoldRefs})` : ""}. Erasure cannot override a retention obligation the law imposes — the refusal and its reason are the record.`,
    };
  }
  if (input.status === "fulfilled") {
    return { receivedAt: input.receivedAt, dueAt, daysRemaining, status: "fulfilled", message: `Fulfilled. The 90-day window closed on ${dueAt}.` };
  }
  if (daysRemaining < 0) {
    return { receivedAt: input.receivedAt, dueAt, daysRemaining, status: "overdue", message: `Overdue by ${Math.abs(daysRemaining)} day(s). The 90-day statutory window closed on ${dueAt}.` };
  }
  if (daysRemaining <= 30) {
    return { receivedAt: input.receivedAt, dueAt, daysRemaining, status: "approaching", message: `${daysRemaining} day(s) left. Assembling one person's data across a manufacturing ERP is not a same-day job.` };
  }
  return { receivedAt: input.receivedAt, dueAt, daysRemaining, status: "on_track", message: `${daysRemaining} day(s) left of the 90-day window.` };
}
