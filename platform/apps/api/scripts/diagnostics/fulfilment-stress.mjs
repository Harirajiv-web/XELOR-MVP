#!/usr/bin/env node
/**
 * THE FULFILMENT STRESS RUN.
 *
 * Drives the mission runtime the way a careless person would, many times, and asserts on
 * INVARIANTS rather than on outcomes. That distinction is the whole design:
 *
 *   An outcome test says "this order should complete on 8 August". It breaks when the
 *   seeded data changes and it tells you nothing about the ninety-nine paths you did not
 *   hand-write.
 *
 *   An invariant says "no mission ever committed an action it did not verify", and "no
 *   mission ever proceeded past its authority without a human". Those must hold for every
 *   combination, and if one ever does not, the run prints the exact scenario that broke it.
 *
 * The permutation is order x tier x decision x disruption-timing x interference, which is
 * 4 x 3 x 3 x 4 x 2 = 288 scenarios before the malformed-input probes. It runs a sampled
 * subset by default so it finishes inside a coffee break; pass --all for the full sweep.
 *
 * Usage:
 *   node apps/api/scripts/diagnostics/fulfilment-stress.mjs [--all] [--runs N]
 */

const API = process.env.API_BASE ?? "http://localhost:3100";
const HDR = {
  "content-type": "application/json",
  "x-xelor-public-demo": "investor-presentation",
  "x-xelor-demo-persona": "priya.sharma",
};

const argv = process.argv.slice(2);
const RUN_ALL = argv.includes("--all");
const LIMIT = Number(argv[argv.indexOf("--runs") + 1]) || (RUN_ALL ? Infinity : 120);

/* ------------------------------------------------------------------- plumbing -- */

async function call(method, path, body) {
  const res = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: HDR,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body is a legitimate answer */ }
  return { status: res.status, body: json };
}

const get = (p) => call("GET", p);
const post = (p, b) => call("POST", p, b);

/* ----------------------------------------------------------------- invariants -- */

const VIOLATIONS = [];
function check(scenario, name, ok, detail) {
  if (!ok) VIOLATIONS.push({ scenario, name, detail });
  return ok;
}

/**
 * Everything that must be true of a mission, whatever route it took to get there.
 *
 * These are the claims the product is sold on. If any of them can be broken by a
 * combination of clicks, the demo is not merely fragile — it is wrong.
 */
function assertInvariants(scenario, m) {
  const actions = m.actions ?? [];
  const steps = m.steps ?? [];

  check(scenario, "no unverified action",
    actions.every((a) => a.status !== "verified" || a.verified === true),
    `${actions.filter((a) => a.status === "verified" && a.verified !== true).length} action(s) marked verified without proof`);

  check(scenario, "no action without a postcondition",
    actions.every((a) => a.verified !== true || a.postcondition !== null),
    "an action was verified with no postcondition recorded");

  check(scenario, "completed means every action verified",
    m.status !== "completed" || actions.every((a) => a.verified === true),
    `completed with ${actions.filter((a) => a.verified !== true).length} unverified action(s)`);

  check(scenario, "completed means an outcome exists",
    m.status !== "completed" || m.outcome !== null,
    "completed with no outcome recorded");

  // The governance claim. A mission that acted while waiting for a human is the one
  // failure that would make the whole demo dishonest.
  check(scenario, "never acted while awaiting approval",
    m.status !== "awaiting_approval" || actions.length === 0,
    `${actions.length} action(s) exist on a mission that is still waiting for a person`);

  check(scenario, "steps are contiguous from 1",
    steps.every((s, i) => s.seq === i + 1),
    `sequence gap: ${steps.map((s) => s.seq).join(",")}`);

  check(scenario, "every step carries a chapter",
    steps.every((s) => typeof s.chapter === "string" && s.chapter.length > 0),
    "a step rendered with no chapter, so it would vanish from the story");

  check(scenario, "every step narrates",
    steps.every((s) => (s.narration ?? "").length > 10),
    "a step produced no sentence for the screen");

  // Narration must be about THIS factory. Prose that would read the same for any input is
  // what makes a demo feel scripted.
  check(scenario, "narration carries checkable numbers",
    steps.filter((s) => s.kind === "observe").every((s) => /\d/.test(s.narration ?? "")),
    "an evidence step narrated with no number in it");

  if (m.plan) {
    check(scenario, "plan has a digest", (m.plan.digest ?? "").length >= 16, "plan digest missing");
    check(scenario, "chosen is among the candidates",
      (m.plan.candidates ?? []).some((c) => c.key === m.plan.chosen?.key),
      "the chosen strategy is not in the candidate list");
    // An IMPOSSIBLE plan must never execute. A plan outside POLICY may execute, but only
    // once a person has said so — which is a different assertion, made below.
    check(scenario, "an impossible plan never executes",
      m.plan.feasible === true || actions.length === 0,
      "actions were committed against a physically impossible plan");
    check(scenario, "a policy breach executes only with a decision",
      (m.plan.chosen?.policyBreaches ?? []).length === 0 ||
        actions.length === 0 ||
        actions.every((a) => a.approvalId !== null),
      "a plan outside policy was executed with nobody's authority on it");
  }

  if (m.outcome) {
    check(scenario, "outcome arithmetic",
      Number(m.outcome.actionsVerified) === Number(m.outcome.actionsTotal),
      `${m.outcome.actionsVerified}/${m.outcome.actionsTotal} verified in a completed outcome`);
    check(scenario, "delivered never exceeds ordered",
      Number(m.outcome.deliveredQty) <= Number(m.outcome.orderedQty) + 1e-9,
      `delivered ${m.outcome.deliveredQty} of ${m.outcome.orderedQty}`);
  }
}

/* ------------------------------------------------------------------- the runs -- */

const DECISIONS = ["approved", "try_another", "rejected"];
const TIERS = ["A2", "A3", "A4"];
const DISRUPT = ["never", "before_plan", "after_plan", "twice"];
const INTERFERE = ["none", "double_start"];

async function runScenario(scenario, orders) {
  const { orderNo, tier, decision, disrupt, interfere } = scenario;
  const order = orders.find((o) => o.soNo === orderNo);
  if (!order) return { skipped: "order not seeded" };

  const started = await post("/fulfilment/missions", { salesOrderId: order.id, tier });
  if (started.status !== 201 && started.status !== 200) {
    return { skipped: `start refused ${started.status} ${started.body?.error?.code ?? ""}` };
  }
  const id = started.body.data.id;

  // A careless double-click. Must not create a second live mission for one commitment.
  if (interfere === "double_start") {
    const again = await post("/fulfilment/missions", { salesOrderId: order.id, tier });
    check(scenario, "double start returns the same mission",
      again.body?.data?.id === id || again.status >= 400,
      `second start produced ${again.body?.data?.id} vs ${id}`);
  }

  if (disrupt === "before_plan") await post(`/fulfilment/missions/${id}/simulate/supplier-delay`);

  for (let i = 0; i < 9; i++) await post(`/fulfilment/missions/${id}/advance`);

  let m = (await get(`/fulfilment/missions/${id}`)).body.data;
  assertInvariants(scenario, m);

  if (disrupt === "after_plan" || disrupt === "twice") {
    await post(`/fulfilment/missions/${id}/simulate/supplier-delay`);
    if (disrupt === "twice") {
      const dup = await post(`/fulfilment/missions/${id}/simulate/supplier-delay`);
      check(scenario, "a repeated event wakes the mission once",
        dup.body?.data?.disposition === "duplicate" || dup.status >= 400,
        `second delivery reported ${dup.body?.data?.disposition}`);
    }
    for (let i = 0; i < 6; i++) await post(`/fulfilment/missions/${id}/advance`);
    m = (await get(`/fulfilment/missions/${id}`)).body.data;
    assertInvariants(scenario, m);
  }

  if (m.pendingApproval) {
    const d = await post(`/fulfilment/approvals/${m.pendingApproval.id}/decide`, {
      decision, note: `stress: ${decision}`,
    });
    check(scenario, "a decision is accepted", d.status < 400, `decide returned ${d.status}`);

    // The same decision twice must not be recorded twice.
    const twice = await post(`/fulfilment/approvals/${m.pendingApproval.id}/decide`, {
      decision, note: "stress: repeat",
    });
    check(scenario, "an approval cannot be decided twice",
      twice.status >= 400, `a second decision returned ${twice.status}`);

    for (let i = 0; i < 8; i++) await post(`/fulfilment/missions/${id}/advance`);
    m = (await get(`/fulfilment/missions/${id}`)).body.data;
    assertInvariants(scenario, m);

    if (decision === "rejected") {
      check(scenario, "a rejection stops the mission",
        m.status === "failed", `rejected but status is ${m.status}`);
    }
  } else {
    // No approval was raised — then the tier must have permitted it.
    check(scenario, "only a permissive tier proceeds alone",
      tier !== "A2" || (m.plan?.chosen?.sourcing ?? []).length === 0,
      "suggest-only committed a purchase without asking");
  }

  return { status: m.status, steps: m.steps.length, actions: (m.actions ?? []).length };
}

/* -------------------------------------------------------------- malformed IO -- */

async function probeBadInput() {
  const s = { orderNo: "-", tier: "-", decision: "-", disrupt: "-", interfere: "malformed" };
  const cases = [
    ["GET", "/fulfilment/missions/not-a-uuid", undefined, 404],
    ["GET", "/fulfilment/missions/00000000-0000-7000-8000-000000000000", undefined, 404],
    ["POST", "/fulfilment/missions", { salesOrderId: "nope" }, 422],
    ["POST", "/fulfilment/missions", {}, 422],
    ["POST", "/fulfilment/missions/not-a-uuid/advance", undefined, 404],
    ["POST", "/fulfilment/missions/not-a-uuid/autonomy", { tier: "A3" }, 404],
    // The note has to be VALID here, or body validation answers 422 before the id is ever
    // looked at — which is correct behaviour and a broken probe.
    ["POST", "/fulfilment/approvals/not-a-uuid/decide", { decision: "approved", note: "a real note" }, 404],
    ["POST", "/fulfilment/approvals/00000000-0000-7000-8000-000000000000/decide", { decision: "approved", note: "a real note" }, 404],
  ];
  for (const [method, path, body, want] of cases) {
    const r = await call(method, path, body);
    check(s, `${method} ${path} answers ${want}`, r.status === want, `got ${r.status}`);
    check(s, `${method} ${path} never 500s`, r.status !== 500, "a client mistake became a server error");
  }

  // A tier the engine does not honour must be refused, not silently downgraded.
  const orders = (await get("/fulfilment/startable")).body.data;
  if (orders[0]) {
    const bad = await post("/fulfilment/missions", { salesOrderId: orders[0].id, tier: "A9" });
    check(s, "an unknown autonomy tier is refused", bad.status >= 400, `got ${bad.status}`);
  }
}

/* ---------------------------------------------------------------------- main -- */

const scenarios = [];
for (const orderNo of ["SO-2627-00004", "SO-2627-00002", "SO-2627-00003", "SO-2627-00001"]) {
  for (const tier of TIERS) {
    for (const decision of DECISIONS) {
      for (const disrupt of DISRUPT) {
        for (const interfere of INTERFERE) {
          scenarios.push({ orderNo, tier, decision, disrupt, interfere });
        }
      }
    }
  }
}

// Deterministic spread rather than random, so a failing run is reproducible by index.
const stride = Math.max(1, Math.floor(scenarios.length / Math.min(LIMIT, scenarios.length)));
const chosen = RUN_ALL ? scenarios : scenarios.filter((_, i) => i % stride === 0).slice(0, LIMIT);

console.log(`XELOR fulfilment stress — ${chosen.length} of ${scenarios.length} scenarios against ${API}\n`);

let ok = 0, skipped = 0;
const statuses = {};
const t0 = Date.now();

for (const [i, s] of chosen.entries()) {
  await post("/fulfilment/demo/reset");
  const orders = (await get("/fulfilment/startable")).body?.data ?? [];
  let r;
  try {
    r = await runScenario(s, orders);
  } catch (err) {
    VIOLATIONS.push({ scenario: s, name: "threw", detail: String(err) });
    r = { skipped: "threw" };
  }
  if (r.skipped) { skipped++; }
  else { ok++; statuses[r.status] = (statuses[r.status] ?? 0) + 1; }

  if ((i + 1) % 20 === 0) {
    process.stdout.write(`  ${i + 1}/${chosen.length} · ${VIOLATIONS.length} violation(s)\n`);
  }
}

await probeBadInput();

const secs = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`\nran ${ok}, skipped ${skipped}, in ${secs}s`);
console.log("final states:", Object.entries(statuses).map(([k, v]) => `${k}=${v}`).join("  "));

if (VIOLATIONS.length === 0) {
  console.log("\nINVARIANTS HELD across every scenario.");
  process.exit(0);
}

console.log(`\n${VIOLATIONS.length} INVARIANT VIOLATION(S):\n`);
const grouped = new Map();
for (const v of VIOLATIONS) {
  const list = grouped.get(v.name) ?? [];
  list.push(v);
  grouped.set(v.name, list);
}
for (const [name, list] of grouped) {
  const e = list[0];
  console.log(`  ${name} — ${list.length}x`);
  console.log(`    e.g. ${e.scenario.orderNo} tier=${e.scenario.tier} decision=${e.scenario.decision} disrupt=${e.scenario.disrupt} interfere=${e.scenario.interfere}`);
  console.log(`    ${e.detail}`);
}
process.exit(1);
