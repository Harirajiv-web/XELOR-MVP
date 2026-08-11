import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEPARTMENT_OF,
  ROLE_OF,
  STATUS_TONE,
  WRITES_INTO,
  nextStepFor,
  stageName,
  stageStatusFor,
  stampFor,
  systemsFor,
  type Chapter,
  type MissionAction,
  type MissionView,
  type StepView,
} from "./stage-panel.logic";

/**
 * THE STAGE PANEL'S RULES, PINNED.
 *
 * The panel is the screen that tells somebody what a machine is doing to their factory, and
 * every one of its failures is silent — a wrong department, a status that says "completed"
 * while a decision is still waiting, a "writes to" pointing at the module the step actually
 * READ. None of those throw. None of them show up in a build. They just quietly say the
 * wrong thing to somebody who has no other way of checking.
 *
 * The mapping is pure and closed, so it can be pinned exactly, and that is what these do.
 * They deliberately assert on the ENGINE'S OWN vocabulary — `succeeded`, `waiting_approval`,
 * `replanning`, the thirteen step keys — because that is the contract that breaks when
 * somebody renames a status in `mission.service.ts` without looking at the web app.
 */

/* ------------------------------------------------------------------ fixtures -- */

function step(over: Partial<StepView> = {}): StepView {
  return {
    seq: 3,
    stepKey: "materials",
    title: "Net the material requirement",
    kind: "observe",
    agentKey: "SPAR",
    chapter: "investigate",
    plain: "You are short 776 bolts.",
    flow: { from: "12 parts needed", did: "Checked your stock", to: "3 short" },
    where: { href: "/inventory/stock", module: "Inventory", screen: "Stock" },
    status: "succeeded",
    ...over,
  };
}

function mission(over: Partial<MissionView> = {}): MissionView {
  return {
    id: "m1",
    missionNo: "MIS-2627-00001",
    soNo: "SO-2627-00006",
    customerName: "Bharat Auto Components Pvt Ltd",
    status: "planning",
    stage: "intake",
    waitingReason: null,
    steps: [step()],
    actions: [],
    pendingApproval: null,
    ...over,
  };
}

function action(over: Partial<MissionAction> = {}): MissionAction {
  return {
    targetDomain: "purchase",
    actionType: "purchase.commit",
    title: "Commit 2 purchase line(s)",
    status: "executed",
    executedAt: "2026-08-11T09:15:30.000Z",
    verifiedAt: null,
    verified: null,
    resultRef: null,
    failureReason: null,
    ...over,
  };
}

const CHAPTERS: Chapter[] = [
  { key: "understand", name: "Understand the promise", lands: "It starts from a commitment." },
  { key: "investigate", name: "Find out what is true", lands: "It reads the factory's records." },
  { key: "decide", name: "Choose a way through", lands: "It compares real options." },
  { key: "authorise", name: "Ask, or proceed", lands: "It knows the edge of its authority." },
  { key: "execute", name: "Do it, and check it worked", lands: "Every action is verified." },
  { key: "prove", name: "Prove the outcome", lands: "It does not declare its own success." },
];

/* ------------------------------------------------------------------- status -- */

test("a refused or failed step outranks every other signal", () => {
  // Even with an approval pending, which would otherwise win — a step that did not happen
  // is the one thing nobody may be allowed to scroll past.
  const m = mission({ pendingApproval: { id: "a1" }, status: "replanning" });
  assert.equal(stageStatusFor(m, step({ status: "failed" })), "failed");
  assert.equal(stageStatusFor(m, step({ status: "refused" })), "failed");
});

test("a pending approval reads as 'requires review', never 'completed'", () => {
  // THE BUG THIS PINS: the engine writes the authorise step as `succeeded` the moment it
  // has RAISED the question. Reporting that as completed tells somebody their decision has
  // already been taken.
  const m = mission({ status: "waiting_approval", pendingApproval: { id: "a1" } });
  const s = step({ stepKey: "authorize", kind: "authorize", status: "succeeded", chapter: "authorise" });
  assert.equal(stageStatusFor(m, s), "requires review");
});

test("an authorise step with nothing pending reads as 'approved'", () => {
  const m = mission({ status: "executing", pendingApproval: null });
  const s = step({ stepKey: "authorize", kind: "authorize", status: "succeeded" });
  assert.equal(stageStatusFor(m, s), "approved");
});

test("a mission sent back for another plan reads as 'retrying'", () => {
  assert.equal(stageStatusFor(mission({ status: "replanning" }), step()), "retrying");
});

test("a mission watching for change reads as 'waiting', not 'completed'", () => {
  // The watch step is written `succeeded` while the mission sits on it for days. "Completed"
  // would say the mission is finished when it is standing by.
  const m = mission({ status: "waiting", waitingReason: "watching for supplier change" });
  assert.equal(stageStatusFor(m, step({ stepKey: "watch", kind: "wait" })), "waiting");
});

test("an ordinary finished step reads as 'completed'", () => {
  assert.equal(stageStatusFor(mission(), step({ status: "succeeded" })), "completed");
});

test("a step still running reads as 'in progress'", () => {
  assert.equal(stageStatusFor(mission(), step({ status: "running" })), "in progress");
});

test("every status in the vocabulary has a tone, and no tone is orphaned", () => {
  // Adding a status without a tone would render an unstyled chip; a tone with no status is
  // dead weight that outlives the state it was for.
  const statuses = [
    "waiting",
    "in progress",
    "requires review",
    "approved",
    "completed",
    "failed",
    "retrying",
  ] as const;
  for (const s of statuses) {
    assert.ok(STATUS_TONE[s], `no tone defined for "${s}"`);
    assert.match(STATUS_TONE[s].fg, /^var\(--/, `"${s}" must use a token, never a literal colour`);
    assert.match(STATUS_TONE[s].bg, /^var\(--/, `"${s}" must use a token, never a literal colour`);
  }
  assert.deepEqual(Object.keys(STATUS_TONE).sort(), [...statuses].sort());
});

/* --------------------------------------------------------- source and target -- */

test("an observe step READS the named module and writes only to the mission", () => {
  const { source, destination, verb } = systemsFor(step({ kind: "observe" }));
  assert.equal(source, "Inventory → Stock");
  assert.equal(destination, "XELOR mission record");
  assert.equal(verb, "fetched");
});

test("an act step WRITES to the named module — the opposite direction", () => {
  // The direction is the whole point of the two cells. Getting it backwards would say the
  // agent had read a purchase order it in fact created.
  const s = step({
    stepKey: "procure",
    kind: "act",
    where: { href: "/purchase/orders", module: "Purchase", screen: "Purchase orders" },
  });
  const { source, destination, verb } = systemsFor(s);
  assert.equal(source, "XELOR mission record · plan");
  assert.equal(destination, "Purchase → Purchase orders");
  assert.equal(verb, "created");
});

test("reserving stock updates rather than creates", () => {
  const s = step({ stepKey: "reserve", kind: "act" });
  assert.equal(systemsFor(s).verb, "updated");
});

test("a step with nowhere to point still names a source", () => {
  // `whereOf` returns null for the three steps whose work is the mission's own. An empty
  // cell would read as a bug; naming the mission is the honest answer.
  const { source, destination } = systemsFor(step({ kind: "critique", where: null }));
  assert.equal(source, "XELOR mission record · plan");
  assert.equal(destination, "XELOR mission record");
});

/* ---------------------------------------------------------------- timestamps -- */

test("a real server timestamp is labelled 'Executed'", () => {
  const stamp = stampFor(action({ executedAt: "2026-08-11T09:15:30.000Z" }), null);
  assert.equal(stamp.label, "Executed");
  assert.notEqual(stamp.value, "—");
});

test("a browser sighting is labelled 'Seen', never 'Executed'", () => {
  // THE POINT OF THIS TEST. Ten of the thirteen steps carry no server time, and the panel
  // must never present a browser clock as the server's record of when something happened.
  const stamp = stampFor(null, Date.UTC(2026, 7, 11, 9, 15, 30));
  assert.equal(stamp.label, "Seen");
});

test("with neither, the cell says so rather than inventing a time", () => {
  assert.deepEqual(stampFor(null, null), { label: "Time", value: "—" });
});

/* --------------------------------------------------------------- what's next -- */

test("a pending approval says the next move is the reader's", () => {
  const next = nextStepFor(mission({ pendingApproval: { id: "a1" } }), step(), CHAPTERS);
  assert.match(next, /Your decision/);
});

test("a closed mission promises nothing further", () => {
  assert.match(nextStepFor(mission({ status: "completed" }), step(), CHAPTERS), /closed/);
});

test("a failed mission quotes the reason it stopped", () => {
  const m = mission({ status: "failed", waitingReason: "the supplier withdrew the quote" });
  assert.equal(nextStepFor(m, step(), CHAPTERS), "the supplier withdrew the quote");
});

test("mid-mission it names the next ACT, and does not claim to know the next step", () => {
  // The API serves the six chapters and not the thirteen-step arc, so naming a step title
  // would be a guess. Several acts run to three or four steps; "next is X" would be wrong
  // more often than right.
  const next = nextStepFor(mission(), step({ chapter: "investigate" }), CHAPTERS);
  assert.match(next, /then choose a way through/);
  assert.doesNotMatch(next, /Net the material|Check the constraining/);
});

test("the chapter list being unavailable does not break the next line", () => {
  // A reader without `agentos.run.read` gets a 403 from /fulfilment/meta. That costs this
  // one sentence and must not cost the panel.
  assert.ok(nextStepFor(mission(), step(), []).length > 0);
});

/* ------------------------------------------------------------------- labels -- */

test("the stage is named from the served chapter list when it is available", () => {
  assert.equal(stageName("investigate", CHAPTERS, "intake"), "Find out what is true");
});

test("without the chapter list the stage falls back to a readable word", () => {
  assert.equal(stageName("investigate", [], "intake"), "Investigate");
  assert.equal(stageName("", [], "monitoring"), "Monitoring");
  assert.equal(stageName("", [], ""), "—");
});

test("every agent the mission arc uses has a department and a role", () => {
  // The arc in `mission.service.ts` names exactly these five. An agent missing here renders
  // an em dash where the accountable department should be.
  for (const agent of ["ONYX", "HEXA", "SPAR", "AXLE", "KILN"]) {
    assert.ok(DEPARTMENT_OF[agent], `no department for ${agent}`);
    assert.ok(ROLE_OF[agent], `no role for ${agent}`);
  }
});

test("only the three acting steps claim to write, and each into a distinct domain", () => {
  // `targetDomain` is the key an action row is matched back to its step by. The match is
  // only sound while these stay unique — see the note on WRITES_INTO.
  assert.deepEqual(Object.keys(WRITES_INTO).sort(), ["procure", "reserve", "workorder"]);
  const domains = Object.values(WRITES_INTO);
  assert.equal(new Set(domains).size, domains.length, "two steps claiming one domain is an ambiguous match");
});
