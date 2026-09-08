/**
 * TICKET LIFECYCLE (CSP §4.B FR-2.3/FR-2.4).
 *
 * The transition table is small; the interesting part is WHO may perform each move. CSP is
 * the platform's only internet-facing surface, so "which actor is allowed to make this
 * transition" is a security decision, not a workflow preference:
 *
 *   - Only STAFF may triage, start work, or resolve. A customer cannot mark their own
 *     ticket resolved, and — more importantly — cannot mark it *unresolved* to restart an
 *     SLA clock.
 *   - Only the CUSTOMER (or the auto-close job) closes a resolved ticket. An agent closing
 *     their own resolved ticket would be marking their own homework, and the CSAT survey
 *     that follows closure is the check on that.
 *   - Reopen is window-guarded from the portal and unlimited for a manager.
 */

export type TicketStatus =
  | "new"
  | "triaged"
  | "in_progress"
  | "pending_customer"
  | "resolved"
  | "closed"
  | "reopened";

export type ActorType = "staff" | "portal" | "system";

interface TransitionRule {
  to: TicketStatus;
  actors: readonly ActorType[];
  note: string;
}

export const TICKET_TRANSITIONS: Readonly<Record<TicketStatus, readonly TransitionRule[]>> = {
  new: [
    { to: "triaged", actors: ["staff"], note: "categorised and an SLA policy attached" },
    { to: "in_progress", actors: ["staff"], note: "agent starts work directly" },
  ],
  triaged: [{ to: "in_progress", actors: ["staff"], note: "agent starts work" }],
  in_progress: [
    { to: "pending_customer", actors: ["staff"], note: "awaiting the customer — the clock pauses" },
    { to: "resolved", actors: ["staff"], note: "resolution posted" },
  ],
  pending_customer: [
    { to: "in_progress", actors: ["staff", "portal"], note: "the customer replied — the clock resumes" },
    { to: "resolved", actors: ["staff", "system"], note: "auto-resolved after 7 days of silence (flagged)" },
  ],
  // Closure belongs to the customer or the auto-close job. An agent closing their own
  // resolved ticket is marking their own homework, and CSAT is the check on that.
  resolved: [
    { to: "closed", actors: ["portal", "system"], note: "customer confirms, or auto-close after 72 h" },
    { to: "in_progress", actors: ["staff"], note: "resolution retracted before closure" },
  ],
  closed: [{ to: "reopened", actors: ["portal", "staff"], note: "reopened inside the window" }],
  reopened: [{ to: "in_progress", actors: ["staff"], note: "re-triaged" }],
};

export interface TransitionCheck {
  allowed: boolean;
  code?: "TICKET_INVALID_TRANSITION" | "TICKET_TRANSITION_FORBIDDEN";
  reason?: string;
  note?: string;
}

export function canTransitionTicket(from: TicketStatus, to: TicketStatus, actor: ActorType): TransitionCheck {
  const rule = TICKET_TRANSITIONS[from].find((r) => r.to === to);
  if (!rule) {
    return {
      allowed: false,
      code: "TICKET_INVALID_TRANSITION",
      reason: `A ticket cannot go from '${from}' to '${to}'.`,
    };
  }
  if (!rule.actors.includes(actor)) {
    return {
      allowed: false,
      code: "TICKET_TRANSITION_FORBIDDEN",
      reason: `'${from}' → '${to}' is not a ${actor} action (permitted: ${rule.actors.join(", ")}).`,
    };
  }
  return { allowed: true, note: rule.note };
}

/** Does entering this status stop the SLA clock? Only one does, and only if the policy
 *  says so — a tenant that does not pause on pending customer is a valid configuration. */
export function pausesClock(to: TicketStatus, policyPausesOnPending: boolean): boolean {
  return to === "pending_customer" && policyPausesOnPending;
}

export const REOPEN_WINDOW_DAYS = 7;

export interface ReopenCheck {
  allowed: boolean;
  code?: "REOPEN_WINDOW_ELAPSED";
  reason: string;
  /** The path the UI offers when the window has closed — a linked new ticket, so the
   *  history stays connected instead of the customer starting from nothing. */
  suggestedAction?: "create_linked_ticket";
}

/**
 * Reopening is time-boxed for the customer and unlimited for a manager (FR-2.4).
 *
 * The window exists so a ticket cannot be resurrected months later to reset an SLA
 * clock — but refusing outright would push the customer into filing an unlinked
 * duplicate, so the refusal carries the linked-ticket path with it.
 */
export function canReopen(input: {
  closedAt: string;
  now: string;
  actor: ActorType;
  isManager?: boolean;
  windowDays?: number;
}): ReopenCheck {
  if (input.actor === "staff" && input.isManager) {
    return { allowed: true, reason: "Manager reopen — not window-limited." };
  }
  const days = input.windowDays ?? REOPEN_WINDOW_DAYS;
  const elapsedMs = Date.parse(input.now) - Date.parse(input.closedAt);
  const withinWindow = elapsedMs <= days * 86_400_000;
  if (withinWindow) {
    const daysLeft = Math.max(0, Math.ceil((days * 86_400_000 - elapsedMs) / 86_400_000));
    return { allowed: true, reason: `Inside the ${days}-day reopen window (${daysLeft} day(s) left).` };
  }
  return {
    allowed: false,
    code: "REOPEN_WINDOW_ELAPSED",
    reason: `The ${days}-day reopen window closed on ${new Date(Date.parse(input.closedAt) + days * 86_400_000).toISOString().slice(0, 10)}.`,
    suggestedAction: "create_linked_ticket",
  };
}

/**
 * What a portal user is allowed to see of a ticket.
 *
 * The customer and the agent share one record and two faces (§1), and this function is
 * the boundary between them. Internal notes, the owning agent's identity, cost fields and
 * the raw quality investigation never cross it — a complaint under investigation reads as
 * "Under investigation by Quality", which is true, useful, and reveals nothing about the
 * NCR or who is handling it.
 */
export interface TicketPublicView {
  ticketNo: string;
  subject: string;
  status: TicketStatus;
  statusLabel: string;
  slaState: string;
  firstResponseDue: string | null;
  resolutionDue: string | null;
  complaintStatusLabel: string | null;
  canReopen: boolean;
  canRate: boolean;
}

const CUSTOMER_STATUS_LABEL: Record<TicketStatus, string> = {
  new: "Received",
  triaged: "Received",
  in_progress: "In progress",
  pending_customer: "Waiting for your reply",
  resolved: "Resolved — please confirm",
  closed: "Closed",
  reopened: "Reopened",
};

const COMPLAINT_STATUS_LABEL: Record<string, string> = {
  open: "Logged with Quality",
  investigation: "Under investigation by Quality",
  corrective_action: "Corrective action in progress",
  closed: "Quality investigation closed",
};

export function toPublicTicketView(t: {
  ticketNo: string;
  subject: string;
  status: TicketStatus;
  slaState: string;
  firstResponseDue: string | null;
  resolutionDue: string | null;
  complaintStatus: string | null;
  closedAt: string | null;
  csatResponded: boolean;
  now: string;
}): TicketPublicView {
  return {
    ticketNo: t.ticketNo,
    subject: t.subject,
    status: t.status,
    statusLabel: CUSTOMER_STATUS_LABEL[t.status],
    slaState: t.slaState,
    firstResponseDue: t.firstResponseDue,
    resolutionDue: t.resolutionDue,
    // Sanitised: the customer learns that Quality has it, never the NCR number or the
    // engineer's findings.
    complaintStatusLabel: t.complaintStatus ? (COMPLAINT_STATUS_LABEL[t.complaintStatus] ?? "With Quality") : null,
    canReopen:
      t.status === "closed" && t.closedAt != null && canReopen({ closedAt: t.closedAt, now: t.now, actor: "portal" }).allowed,
    canRate: t.status === "closed" && !t.csatResponded,
  };
}

/** Comment visibility. `internal` never leaves the desk; `ai_draft` is a comment that has
 *  been generated but not sent, and is invisible to the customer until an agent sends it. */
export type CommentVisibility = "public" | "internal";
export type CommentAuthorType = "staff" | "portal" | "system" | "ai_draft";

export function isCustomerVisible(c: { visibility: CommentVisibility; authorType: CommentAuthorType }): boolean {
  return c.visibility === "public" && c.authorType !== "ai_draft";
}
