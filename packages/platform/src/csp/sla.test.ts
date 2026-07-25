import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CALENDAR, type BusinessCalendar } from "./business-time.js";
import {
  computeSlaClocks,
  evaluateSla,
  resolveSlaPolicy,
  slaChip,
  tiersToFire,
  DEFAULT_ESCALATION,
  SlaPolicyNotFound,
  type SlaPolicy,
} from "./sla.js";

const CAL: BusinessCalendar = { ...DEFAULT_CALENDAR, holidays: ["2026-07-20"] };

const policy = (
  id: string,
  appliesTo: SlaPolicy["appliesTo"],
  matchValue: string,
  responseMins: number,
  resolutionMins: number,
): SlaPolicy => ({
  id,
  name: `${appliesTo}:${matchValue}`,
  appliesTo,
  matchValue,
  responseMins,
  resolutionMins,
  pauseOnPending: true,
  escalationMatrix: DEFAULT_ESCALATION,
  active: true,
});

const POLICIES: SlaPolicy[] = [
  policy("p-low", "priority", "low", 480, 4320),
  policy("p-med", "priority", "medium", 480, 2880),
  policy("p-high", "priority", "high", 240, 1440),
  policy("p-urgent", "priority", "urgent", 60, 480),
  policy("c-defect", "category", "product_defect", 120, 960),
  policy("k-ashvamedha", "contract", "AMC-2627-0002", 60, 240),
];

/* ----------------------------- policy precedence --------------------------- */

test("a contract commitment outranks the category, which outranks the priority default", () => {
  assert.equal(resolveSlaPolicy(POLICIES, { priority: "urgent" }).id, "p-urgent");
  assert.equal(resolveSlaPolicy(POLICIES, { priority: "urgent", categoryCode: "product_defect" }).id, "c-defect");
  assert.equal(
    resolveSlaPolicy(POLICIES, { priority: "urgent", categoryCode: "product_defect", contractRef: "AMC-2627-0002" }).id,
    "k-ashvamedha",
    "the OEM's contractual 4-hour commitment is the one with a penalty attached",
  );
});

test("an inactive policy is not a policy", () => {
  const off = POLICIES.map((p) => (p.id === "p-urgent" ? { ...p, active: false } : p));
  assert.throws(() => resolveSlaPolicy(off, { priority: "urgent" }), (e: unknown) => e instanceof SlaPolicyNotFound);
});

test("a contract reference that does not match falls through to the ordinary policy", () => {
  assert.equal(resolveSlaPolicy(POLICIES, { priority: "high", contractRef: "AMC-9999-9999" }).id, "p-high");
});

/* ------------------------------- the clocks -------------------------------- */

test("the clocks are computed once, in business time, with a promise a human can read", () => {
  const c = computeSlaClocks(POLICIES[3]!, "2026-07-16T09:00:00+05:30", CAL);
  assert.equal(c.firstResponseDue, "2026-07-16T04:30:00.000Z", "Thu 10:00 IST");
  // The window is 09:00–18:00, i.e. 540 minutes a day — so 480 minutes still lands on the
  // same day, at 17:00. Assuming an 8-hour day here would have promised the customer a
  // whole extra day.
  assert.equal(c.resolutionDue, "2026-07-16T11:30:00.000Z", "Thu 17:00 IST");
  assert.equal(c.promise, "First response within 1 business hour");
});

/* ------------------------------ state machine ------------------------------ */

const base = {
  startedAt: "2026-07-16T09:00:00+05:30",
  pauseWindows: [] as { from: string; to: string | null }[],
  calendar: CAL,
  responseAllowanceMins: 240,
  resolutionAllowanceMins: 1440,
  firstRespondedAt: null,
  resolvedAt: null,
  isPaused: false,
};

test("a fresh ticket is on track and reports how much of the clock it has used", () => {
  const r = evaluateSla({ ...base, asOf: "2026-07-16T10:00:00+05:30" });
  assert.equal(r.state, "on_track");
  assert.equal(r.consumedMins, 60);
  assert.equal(r.responseRemainingMins, 180);
});

test("the chip turns amber at 80% of a clock, before anyone has broken anything", () => {
  const r = evaluateSla({ ...base, asOf: "2026-07-16T12:15:00+05:30" });
  assert.equal(r.consumedMins, 195);
  assert.equal(r.state, "at_risk");
  assert.equal(slaChip(r.state).tone, "amber");
});

test("a response overdue is breached_response and says which allowance was blown", () => {
  const r = evaluateSla({ ...base, asOf: "2026-07-16T14:00:00+05:30" });
  assert.equal(r.state, "breached_response");
  assert.match(r.reason, /First response allowance of 240/);
  assert.equal(slaChip(r.state).tone, "red");
});

test("a response delivered inside the window stays met, however late anyone reads it", () => {
  const r = evaluateSla({
    ...base,
    asOf: "2026-07-24T09:00:00+05:30", // a week later
    firstRespondedAt: "2026-07-16T11:00:00+05:30",
    resolvedAt: "2026-07-16T15:00:00+05:30",
  });
  assert.equal(r.state, "met", "the verdict is decided by when the work happened, not by when it is inspected");
  assert.equal(r.consumedMins, 360);
});

test("a paused ticket reports paused rather than counting down towards a breach", () => {
  const r = evaluateSla({
    ...base,
    asOf: "2026-07-16T16:00:00+05:30",
    pauseWindows: [{ from: "2026-07-16T10:00:00+05:30", to: null }],
    isPaused: true,
  });
  assert.equal(r.state, "paused");
  assert.equal(r.consumedMins, 60, "only the hour before the customer was asked counts");
  assert.match(slaChip(r.state).label, /awaiting your reply/);
});

test("time spent waiting on the customer cannot breach the agent's clock", () => {
  const withPause = evaluateSla({
    ...base,
    asOf: "2026-07-16T17:00:00+05:30",
    pauseWindows: [{ from: "2026-07-16T10:00:00+05:30", to: "2026-07-16T16:00:00+05:30" }],
  });
  assert.equal(withPause.consumedMins, 120);
  assert.equal(withPause.state, "on_track");

  const withoutPause = evaluateSla({ ...base, asOf: "2026-07-16T17:00:00+05:30" });
  assert.equal(withoutPause.state, "breached_response", "the same wall-clock time, without the pause, is a breach");
});

test("resolution overdue outranks response overdue in the reported state", () => {
  const r = evaluateSla({
    ...base,
    asOf: "2026-07-21T17:00:00+05:30",
    resolutionAllowanceMins: 480,
  });
  assert.equal(r.state, "breached_resolution");
  assert.equal(r.responseBreached, true, "both are true; the more serious one is what the chip shows");
});

test("a ticket resolved after breaching does not launder itself into 'met'", () => {
  const r = evaluateSla({
    ...base,
    asOf: "2026-07-17T12:00:00+05:30",
    firstRespondedAt: "2026-07-16T16:00:00+05:30", // 420 min consumed, allowance 240
    resolvedAt: "2026-07-16T17:00:00+05:30",
  });
  assert.equal(r.state, "breached_response");
});

/* ------------------------------- escalation -------------------------------- */

test("tiers fire when their fraction of the clock is consumed", () => {
  const fired = tiersToFire({
    tiers: DEFAULT_ESCALATION,
    consumedMins: 200,
    responseAllowanceMins: 240,
    resolutionAllowanceMins: 1440,
    alreadyFired: [],
    isPaused: false,
  });
  assert.deepEqual(fired.map((f) => f.tier), ["t80"]);
  assert.equal(fired[0]!.notifyRole, "owner");
  assert.equal(fired[0]!.atMinutes, 192);
});

test("a tier already fired never fires again, however often the scanner runs", () => {
  const args = {
    tiers: DEFAULT_ESCALATION,
    consumedMins: 300,
    responseAllowanceMins: 240,
    resolutionAllowanceMins: 1440,
    isPaused: false,
  };
  assert.deepEqual(tiersToFire({ ...args, alreadyFired: [] }).map((f) => f.tier), ["t80", "t100"]);
  assert.deepEqual(tiersToFire({ ...args, alreadyFired: ["t80"] }).map((f) => f.tier), ["t100"]);
  assert.deepEqual(tiersToFire({ ...args, alreadyFired: ["t80", "t100"] }), [], "a one-minute scanner is not an alert storm");
});

test("a paused ticket escalates to nobody — the delay belongs to the customer", () => {
  const fired = tiersToFire({
    tiers: DEFAULT_ESCALATION,
    consumedMins: 5000,
    responseAllowanceMins: 240,
    resolutionAllowanceMins: 1440,
    alreadyFired: [],
    isPaused: true,
  });
  assert.deepEqual(fired, []);
});

test("the resolution tier watches the resolution clock, not the response one", () => {
  const fired = tiersToFire({
    tiers: DEFAULT_ESCALATION,
    consumedMins: 1440,
    responseAllowanceMins: 240,
    resolutionAllowanceMins: 1440,
    alreadyFired: ["t80", "t100"],
    isPaused: false,
  });
  assert.deepEqual(fired.map((f) => f.tier), ["res100"]);
  assert.equal(fired[0]!.notifyRole, "management");
});
