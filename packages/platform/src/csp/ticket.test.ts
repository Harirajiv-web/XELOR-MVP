import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canReopen,
  canTransitionTicket,
  isCustomerVisible,
  pausesClock,
  toPublicTicketView,
  REOPEN_WINDOW_DAYS,
} from "./ticket.js";

/* ------------------------------ who may move it ---------------------------- */

test("only staff triage, start work and resolve", () => {
  assert.equal(canTransitionTicket("new", "triaged", "staff").allowed, true);
  assert.equal(canTransitionTicket("in_progress", "resolved", "staff").allowed, true);

  const byCustomer = canTransitionTicket("in_progress", "resolved", "portal");
  assert.equal(byCustomer.allowed, false);
  assert.equal(byCustomer.code, "TICKET_TRANSITION_FORBIDDEN");
  assert.match(byCustomer.reason!, /not a portal action/);
});

test("closure belongs to the customer or the auto-close job, never to the agent who resolved it", () => {
  assert.equal(canTransitionTicket("resolved", "closed", "portal").allowed, true);
  assert.equal(canTransitionTicket("resolved", "closed", "system").allowed, true);
  assert.equal(
    canTransitionTicket("resolved", "closed", "staff").allowed,
    false,
    "an agent closing their own resolved ticket is marking their own homework — CSAT is the check on that",
  );
});

test("a customer replying resumes the clock; a customer cannot start the work", () => {
  assert.equal(canTransitionTicket("pending_customer", "in_progress", "portal").allowed, true);
  assert.equal(canTransitionTicket("new", "in_progress", "portal").allowed, false);
});

test("impossible moves are impossible whoever asks", () => {
  for (const actor of ["staff", "portal", "system"] as const) {
    const r = canTransitionTicket("new", "closed", actor);
    assert.equal(r.allowed, false);
    assert.equal(r.code, "TICKET_INVALID_TRANSITION");
  }
});

test("only pending_customer stops the clock, and only if the policy says so", () => {
  assert.equal(pausesClock("pending_customer", true), true);
  assert.equal(pausesClock("pending_customer", false), false, "a tenant that does not pause is a valid configuration");
  assert.equal(pausesClock("in_progress", true), false);
});

/* --------------------------------- reopen ---------------------------------- */

test("the customer may reopen inside the window and is told how long is left", () => {
  const r = canReopen({ closedAt: "2026-07-14T10:00:00+05:30", now: "2026-07-18T10:00:00+05:30", actor: "portal" });
  assert.equal(r.allowed, true);
  assert.match(r.reason, /3 day\(s\) left/);
});

test("past the window the refusal carries the path forward, not a dead end", () => {
  const r = canReopen({ closedAt: "2026-07-01T10:00:00+05:30", now: "2026-07-18T10:00:00+05:30", actor: "portal" });
  assert.equal(r.allowed, false);
  assert.equal(r.code, "REOPEN_WINDOW_ELAPSED");
  assert.equal(r.suggestedAction, "create_linked_ticket", "otherwise the customer files an unlinked duplicate");
});

test("a manager is not window-limited", () => {
  const r = canReopen({ closedAt: "2026-01-01T10:00:00+05:30", now: "2026-07-18T10:00:00+05:30", actor: "staff", isManager: true });
  assert.equal(r.allowed, true);
});

test("the window is exactly seven days by default", () => {
  assert.equal(REOPEN_WINDOW_DAYS, 7);
  const edge = canReopen({ closedAt: "2026-07-11T10:00:00+05:30", now: "2026-07-18T10:00:00+05:30", actor: "portal" });
  assert.equal(edge.allowed, true, "the seventh day is still inside");
  const past = canReopen({ closedAt: "2026-07-11T10:00:00+05:30", now: "2026-07-18T10:01:00+05:30", actor: "portal" });
  assert.equal(past.allowed, false);
});

/* ---------------------------- the customer's face -------------------------- */

test("the customer sees a sanitised status, not the desk's vocabulary", () => {
  const v = toPublicTicketView({
    ticketNo: "TKT-2627-00031",
    subject: "Oil leak at pump-shaft seal",
    status: "pending_customer",
    slaState: "paused",
    firstResponseDue: "2026-07-18T13:00:00+05:30",
    resolutionDue: "2026-07-19T13:00:00+05:30",
    complaintStatus: "investigation",
    closedAt: null,
    csatResponded: false,
    now: "2026-07-18T10:00:00+05:30",
  });
  assert.equal(v.statusLabel, "Waiting for your reply");
  assert.equal(
    v.complaintStatusLabel,
    "Under investigation by Quality",
    "true, useful, and reveals neither the NCR number nor who is handling it",
  );
  assert.equal(v.canReopen, false);
  assert.equal(v.canRate, false);
});

test("a closed ticket inside the window offers reopen and a rating exactly once", () => {
  const base = {
    ticketNo: "TKT-2627-00019",
    subject: "Duplicate invoice",
    status: "closed" as const,
    slaState: "met",
    firstResponseDue: null,
    resolutionDue: null,
    complaintStatus: null,
    closedAt: "2026-07-16T10:00:00+05:30",
    now: "2026-07-18T10:00:00+05:30",
  };
  assert.equal(toPublicTicketView({ ...base, csatResponded: false }).canRate, true);
  assert.equal(toPublicTicketView({ ...base, csatResponded: true }).canRate, false, "one response per ticket");
  assert.equal(toPublicTicketView({ ...base, csatResponded: false }).canReopen, true);
});

test("internal notes and unsent AI drafts never count as customer-visible", () => {
  assert.equal(isCustomerVisible({ visibility: "public", authorType: "staff" }), true);
  assert.equal(isCustomerVisible({ visibility: "internal", authorType: "staff" }), false);
  assert.equal(
    isCustomerVisible({ visibility: "public", authorType: "ai_draft" }),
    false,
    "a draft becomes a message only when a human presses send",
  );
});
