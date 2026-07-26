import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { circuitAllows, classifyFailure, nextRetry, recordCircuitResult, DEFAULT_RETRY_POLICY, type CircuitSnapshot } from "./retry.js";
import { deliveryHealth, rotationPlan, signWebhook, verifyWebhook } from "./webhook.js";
import { cancelWindow, choosePortal, ewbValidity, ewbValidityDays, irnIdempotencyKey, recoveryPlan, reportingWindow } from "./einvoice.js";
import { canReplay, redactPayload, summariseDlq, triage, type DlqEntry } from "./dlq.js";
import { applyMapping, applyTransform, dryRun, readPath, TransformError, type FieldMapping } from "./mapping.js";

describe("failure classification", () => {
  it("an auth failure is FATAL — retrying locks the account", () => {
    const c = classifyFailure({ httpStatus: 401 });
    assert.equal(c.outcome, "fatal");
    assert.equal(c.category, "auth");
    assert.match(c.reason, /lock the account/);
  });

  it("a validation failure is FATAL — it will be just as wrong later", () => {
    assert.equal(classifyFailure({ httpStatus: 422 }).outcome, "fatal");
    assert.match(classifyFailure({ httpStatus: 422 }).reason, /just as wrong in thirty seconds/);
  });

  it("a 5xx and a timeout are retryable", () => {
    assert.equal(classifyFailure({ httpStatus: 503 }).outcome, "retryable");
    assert.equal(classifyFailure({ timedOut: true }).category, "timeout");
    assert.match(classifyFailure({ timedOut: true }).reason, /may still have processed it/);
  });

  it("a 409 means it probably already succeeded — fetch, do not resend", () => {
    const c = classifyFailure({ httpStatus: 409 });
    assert.equal(c.outcome, "fatal");
    assert.match(c.reason, /already accepted/);
  });

  it("rate limiting is retryable and honours the server's own delay", () => {
    const c = classifyFailure({ httpStatus: 429, retryAfterSeconds: 30 });
    assert.equal(c.category, "rate_limit");
    assert.equal(c.retryAfterMs, 30_000);
  });

  it("an unrecognised failure is retried once rather than dropped", () => {
    assert.equal(classifyFailure({ message: "something odd" }).outcome, "retryable");
  });
});

describe("backoff", () => {
  const noJitter = () => 0.5; // maps to exactly 0 jitter

  it("doubles, and stops at the policy ceiling", () => {
    const c = classifyFailure({ httpStatus: 503 });
    assert.equal(nextRetry(c, 1, DEFAULT_RETRY_POLICY, noJitter).delayMs, 4_000);
    assert.equal(nextRetry(c, 2, DEFAULT_RETRY_POLICY, noJitter).delayMs, 8_000);
    assert.equal(nextRetry(c, 20, { ...DEFAULT_RETRY_POLICY, maxAttempts: 99 }, noJitter).delayMs, DEFAULT_RETRY_POLICY.maxDelayMs);
  });

  it("the server's Retry-After beats our schedule", () => {
    const c = classifyFailure({ httpStatus: 429, retryAfterSeconds: 45 });
    const d = nextRetry(c, 1, DEFAULT_RETRY_POLICY, noJitter);
    assert.equal(d.delayMs, 45_000);
    assert.match(d.reason, /beats our schedule/);
  });

  it("never retries a fatal failure, whatever the attempt count", () => {
    assert.equal(nextRetry(classifyFailure({ httpStatus: 401 }), 1).shouldRetry, false);
  });

  it("exhausting the budget dead-letters rather than dropping", () => {
    const d = nextRetry(classifyFailure({ httpStatus: 503 }), 5);
    assert.equal(d.shouldRetry, false);
    assert.match(d.reason, /Dead-lettered rather than dropped/);
  });

  it("jitter spreads the retries — without it a recovering system is hit by a wave", () => {
    const c = classifyFailure({ httpStatus: 503 });
    const low = nextRetry(c, 1, DEFAULT_RETRY_POLICY, () => 0).delayMs;
    const high = nextRetry(c, 1, DEFAULT_RETRY_POLICY, () => 1).delayMs;
    assert.ok(low < high, "identical delays would synchronise every retry in the fleet");
    assert.equal(low, 3_200);
    assert.equal(high, 4_800);
  });
});

describe("the circuit breaker", () => {
  const closed: CircuitSnapshot = { state: "closed", consecutiveFailures: 0, consecutiveSuccesses: 0, openedAt: null };
  const NOW = "2026-07-20T10:00:00.000Z";

  it("opens after the threshold and then fails fast", () => {
    let s: CircuitSnapshot = closed;
    for (let i = 0; i < 5; i += 1) s = recordCircuitResult(s, "failure", NOW);
    assert.equal(s.state, "open");
    const v = circuitAllows(s, NOW);
    assert.equal(v.allowRequest, false);
    assert.match(v.message, /queued, not lost/);
  });

  it("half-opens after the cool-down and lets ONE probe through", () => {
    let s: CircuitSnapshot = closed;
    for (let i = 0; i < 5; i += 1) s = recordCircuitResult(s, "failure", NOW);
    const later = "2026-07-20T10:02:00.000Z";
    const v = circuitAllows(s, later);
    assert.equal(v.state, "half_open");
    assert.equal(v.allowRequest, true);
  });

  it("a failed probe re-opens immediately", () => {
    const half: CircuitSnapshot = { state: "half_open", consecutiveFailures: 5, consecutiveSuccesses: 0, openedAt: NOW };
    const v = recordCircuitResult(half, "failure", NOW);
    assert.equal(v.state, "open");
    assert.match(v.message, /probe failed/);
  });

  it("closes again after enough successes", () => {
    let s: CircuitSnapshot = { state: "half_open", consecutiveFailures: 5, consecutiveSuccesses: 0, openedAt: NOW };
    s = recordCircuitResult(s, "success", NOW);
    const v = recordCircuitResult(s, "success", NOW);
    assert.equal(v.state, "closed");
  });
});

describe("webhook signing", () => {
  const payload = JSON.stringify({ event: "sales.order.confirmed.v1", id: "SO-1" });
  const secret = "whsec_abc";
  const t = 1_784_000_000;

  it("signs in the t=…,v1=… form and verifies", () => {
    const header = signWebhook(payload, secret, t);
    assert.match(header, /^t=\d+,v1=[0-9a-f]{64}$/);
    assert.equal(verifyWebhook({ payload, header, secret, nowSeconds: t + 5 }).ok, true);
  });

  it("a tampered payload fails", () => {
    const header = signWebhook(payload, secret, t);
    const r = verifyWebhook({ payload: payload + " ", header, secret, nowSeconds: t + 5 });
    assert.equal(r.ok, false);
    assert.equal(r.code, "mismatch");
  });

  it("a replayed OLD message is rejected", () => {
    const header = signWebhook(payload, secret, t);
    const r = verifyWebhook({ payload, header, secret, nowSeconds: t + 900 });
    assert.equal(r.code, "stale");
  });

  it("a FUTURE timestamp is rejected too — otherwise one capture replays forever", () => {
    const header = signWebhook(payload, secret, t + 100_000);
    const r = verifyWebhook({ payload, header, secret, nowSeconds: t });
    assert.equal(r.code, "future");
    assert.match(r.reason, /replays indefinitely/);
  });

  it("the previous secret still verifies during a rotation grace", () => {
    const header = signWebhook(payload, "old_secret", t);
    const r = verifyWebhook({ payload, header, secret: "new_secret", previousSecret: "old_secret", nowSeconds: t + 5 });
    assert.equal(r.ok, true);
    assert.equal(r.matched, "previous");
  });

  it("a malformed header is refused, not guessed at", () => {
    assert.equal(verifyWebhook({ payload, header: "garbage", secret, nowSeconds: t }).code, "malformed");
  });

  it("a rotation states when both secrets stop working", () => {
    const p = rotationPlan({ rotatedAt: "2026-07-20T00:00:00.000Z" });
    assert.equal(p.graceUntil, "2026-07-22T00:00:00.000Z");
    assert.match(p.message, /coordinated outage/);
  });
});

describe("webhook delivery health", () => {
  it("auto-pauses a dead endpoint", () => {
    const h = deliveryHealth({ status: "active", consecutiveFailures: 19, lastOutcome: "failure" });
    assert.equal(h.shouldAutoPause, true);
    assert.equal(h.status, "auto_paused");
    assert.match(h.message, /denial-of-service/);
  });

  it("a success un-pauses and resets the counter", () => {
    const h = deliveryHealth({ status: "auto_paused", consecutiveFailures: 25, lastOutcome: "success" });
    assert.equal(h.status, "active");
    assert.equal(h.consecutiveFailures, 0);
  });
});

describe("the 30-day e-invoice reporting window", () => {
  const BIG = 150_000_000; // ₹15 crore

  it("does not apply below the ₹10 crore threshold", () => {
    const w = reportingWindow({ docDate: "2026-07-01", aato: 50_000_000, asOf: "2026-07-29" });
    assert.equal(w.applicable, false);
    assert.equal(w.alertLevel, 0);
  });

  it("escalates at day 20, 25 and 28 rather than warning once at the end", () => {
    assert.equal(reportingWindow({ docDate: "2026-07-01", aato: BIG, asOf: "2026-07-10" }).alertLevel, 0);
    assert.equal(reportingWindow({ docDate: "2026-07-01", aato: BIG, asOf: "2026-07-21" }).alertLevel, 1);
    assert.equal(reportingWindow({ docDate: "2026-07-01", aato: BIG, asOf: "2026-07-26" }).alertLevel, 2);
    assert.equal(reportingWindow({ docDate: "2026-07-01", aato: BIG, asOf: "2026-07-29" }).alertLevel, 3);
  });

  it("past the deadline the invoice can NEVER be reported — and says so", () => {
    const w = reportingWindow({ docDate: "2026-07-01", aato: BIG, asOf: "2026-08-05" });
    assert.equal(w.blocked, true);
    assert.match(w.message, /can no longer be reported at all/);
    assert.match(w.message, /credit note/);
  });

  it("a reported invoice records whether it made the window", () => {
    const w = reportingWindow({ docDate: "2026-07-01", aato: BIG, reportedAt: "2026-07-15", asOf: "2026-08-01" });
    assert.match(w.message, /within the window/);
  });
});

describe("IRN recovery — the rule that stops duplicate filings", () => {
  it("a TIMEOUT means fetch, never resend", () => {
    const p = recoveryPlan({ status: "pending", timedOut: true, attempts: 1 });
    assert.equal(p.action, "get_by_document");
    assert.match(p.reason, /NOT the same as failing/);
  });

  it("a duplicate-IRN error code means fetch the existing one", () => {
    assert.equal(recoveryPlan({ status: "failed", timedOut: false, errorCode: "2150", attempts: 1 }).action, "get_by_document");
  });

  it("a 4xx rejection stops and asks for a human", () => {
    assert.equal(recoveryPlan({ status: "failed", timedOut: false, httpStatus: 400, attempts: 1 }).action, "stop_and_review");
  });

  it("a plain transient failure may be resubmitted", () => {
    assert.equal(recoveryPlan({ status: "failed", timedOut: false, httpStatus: 503, attempts: 1 }).action, "retry_submit");
  });

  it("the idempotency key is derived from the DOCUMENT, not the attempt", () => {
    const a = irnIdempotencyKey({ gstin: "27AABCT1234F1Z5", docType: "INV", invoiceRef: "INV-1", fy: "2026-27" });
    const b = irnIdempotencyKey({ gstin: "27AABCT1234F1Z5", docType: "INV", invoiceRef: "INV-1", fy: "2026-27" });
    assert.equal(a, b, "attempt two must present the same key or the gateway sees a second invoice");
  });

  it("the 24-hour cancellation window is computed, not assumed", () => {
    const w = cancelWindow("2026-07-20T09:00:00.000Z", "2026-07-20T20:00:00.000Z");
    assert.equal(w.cancellable, true);
    assert.equal(w.hoursRemaining, 13);
    const closed = cancelWindow("2026-07-20T09:00:00.000Z", "2026-07-22T09:00:00.000Z");
    assert.equal(closed.cancellable, false);
    assert.match(closed.message, /credit note/);
  });
});

describe("e-way bill", () => {
  it("validity is one day per 200 km, and always at least one", () => {
    assert.equal(ewbValidityDays(150), 1);
    assert.equal(ewbValidityDays(200), 1);
    assert.equal(ewbValidityDays(201), 2);
    assert.equal(ewbValidityDays(60, true), 3, "over-dimensional cargo is 1 day per 20 km");
  });

  it("an expired bill is a detention risk, and the message says so", () => {
    const v = ewbValidity({ generatedAt: "2026-07-20T06:00:00.000Z", distanceKm: 180, asOf: "2026-07-23T06:00:00.000Z" });
    assert.equal(v.expired, true);
    assert.match(v.message, /detention risk/);
  });

  it("failover to the secondary portal is RECORDED, because cancellation must use the same portal", () => {
    const c = choosePortal({ ewb1Healthy: false, ewb2Healthy: true });
    assert.equal(c.portal, "ewb2");
    assert.equal(c.failedOver, true);
    assert.match(c.message, /must also be cancelled on ewb2/);
  });

  it("with both portals down the document is queued, not lost", () => {
    assert.match(choosePortal({ ewb1Healthy: false, ewb2Healthy: false }).message, /queued; it is not lost/);
  });
});

describe("dead-letter triage — deterministic, which is the whole point", () => {
  const entry = (over: Partial<DlqEntry> = {}): DlqEntry => ({
    id: "d1", flowCode: "gsp_einvoice", correlationId: "c1", errorCategory: "downstream",
    attempts: 5, status: "new", sideEffectPossible: false, isStatutory: false, ...over,
  });

  it("every category maps to a stated action", () => {
    for (const cat of ["validation", "auth", "transform", "timeout", "rate_limit", "downstream", "unknown"] as const) {
      assert.ok(triage(cat).suggestedAction.length > 20, cat);
    }
  });

  it("a validation failure is NOT replayable — fix the document instead", () => {
    const v = canReplay(entry({ errorCategory: "validation" }));
    assert.equal(v.allowed, false);
    assert.match(v.reason, /Fix the source document/);
  });

  it("a TIMEOUT with a possible side effect is refused outright", () => {
    const v = canReplay(entry({ errorCategory: "timeout", sideEffectPossible: true }));
    assert.equal(v.allowed, false);
    assert.match(v.reason, /cannot be withdrawn/);
  });

  it("a statutory replay is allowed but demands explicit confirmation", () => {
    const v = canReplay(entry({ errorCategory: "downstream", isStatutory: true }));
    assert.equal(v.allowed, true);
    assert.equal(v.requiresConfirmation, true);
    assert.match(v.reason, /visible to a regulator/);
  });

  it("a settled entry cannot be replayed at all", () => {
    assert.equal(canReplay(entry({ status: "resolved" })).allowed, false);
  });

  it("the summary separates what can be batched from what needs a person", () => {
    const s = summariseDlq([
      entry({ errorCategory: "downstream" }),
      entry({ errorCategory: "timeout", sideEffectPossible: true }),
      entry({ errorCategory: "auth" }),
    ]);
    assert.equal(s.total, 3);
    assert.equal(s.replayableNow, 2);
    assert.equal(s.needsHumanFirst, 1);
    assert.match(s.headline, /critical/);
  });

  it("redaction removes credentials before a payload is stored for a year", () => {
    const r = redactPayload({ user: "a", password: "p", nested: { apiKey: "k", ifsc: "HDFC0001", qty: 5 } }) as Record<string, unknown>;
    assert.equal(r.password, "[redacted]");
    assert.equal((r.nested as Record<string, unknown>).apiKey, "[redacted]");
    assert.equal((r.nested as Record<string, unknown>).ifsc, "[redacted]");
    assert.equal((r.nested as Record<string, unknown>).qty, 5);
  });
});

describe("field mapping", () => {
  const MAPPINGS: FieldMapping[] = [
    { seq: 1, sourcePath: "Item.Code", canonicalPath: "itemCode", isRequired: true, transform: "trim" },
    { seq: 2, sourcePath: "Item.Qty", canonicalPath: "qty", isRequired: true, transform: "to_number" },
    { seq: 3, sourcePath: "Item.Unit", canonicalPath: "uom", isRequired: true, lookupTable: "uqc_codes" },
    { seq: 4, sourcePath: "Doc.Date", canonicalPath: "docDate", isRequired: true, transform: "to_iso_date" },
    { seq: 5, sourcePath: "Item.Remark", canonicalPath: "remark", isRequired: false, defaultValue: "—" },
  ];
  const LOOKUPS = { uqc_codes: { PCS: "NOS", NOS: "NOS", KGS: "KGS" } };

  it("reads nested and indexed paths", () => {
    assert.equal(readPath({ a: { b: [{ c: 7 }] } }, "a.b[0].c"), 7);
    assert.equal(readPath({ a: null }, "a.b"), undefined);
  });

  it("maps a good record and applies defaults", () => {
    const r = applyMapping({ Item: { Code: " IMP-6 ", Qty: "12", Unit: "PCS" }, Doc: { Date: "20/07/2026" } }, MAPPINGS, LOOKUPS);
    assert.equal(r.ok, true);
    assert.deepEqual(r.output, { itemCode: "IMP-6", qty: 12, uom: "NOS", docDate: "2026-07-20", remark: "—" });
    assert.deepEqual(r.appliedDefaults, ["remark"]);
  });

  it("a MISSING required field fails the message instead of writing a null", () => {
    const r = applyMapping({ Item: { Code: "X", Unit: "PCS" }, Doc: { Date: "20/07/2026" } }, MAPPINGS, LOOKUPS);
    assert.equal(r.ok, false);
    assert.deepEqual(r.missingRequired, ["qty"]);
    assert.match(r.summary, /not passed on with holes in it/);
  });

  it("an unmapped lookup code is a failure, not a pass-through", () => {
    const r = applyMapping({ Item: { Code: "X", Qty: "1", Unit: "DOZEN" }, Doc: { Date: "20/07/2026" } }, MAPPINGS, LOOKUPS);
    assert.equal(r.ok, false);
    assert.match(r.errors[0]!.message, /two different units of the same thing/);
  });

  it("dd/mm/yyyy is read as Indian, never as American", () => {
    assert.equal(applyTransform("to_iso_date", "03/04/2026"), "2026-04-03");
    assert.throws(() => applyTransform("to_iso_date", "not a date"), TransformError);
    assert.throws(() => applyTransform("to_number", "twelve"), /not a number/);
  });

  it("money converts without floating-point drift", () => {
    assert.equal(applyTransform("rupees_to_paise", "1234.56"), 123456);
    assert.equal(applyTransform("paise_to_rupees", "123456"), 1234.56);
  });

  it("a dry run finds the ONE bad path rather than four unrelated problems", () => {
    const samples = [
      { Item: { Code: "A", Qty: "1", Unit: "PCS" }, Doc: { Date: "01/07/2026" } },
      { Item: { Code: "B", Qty: "2", Unit: "PCS" }, Doc: {} },
      { Item: { Code: "C", Qty: "3", Unit: "PCS" }, Doc: {} },
    ];
    const d = dryRun(samples, MAPPINGS, LOOKUPS);
    assert.equal(d.okCount, 1);
    assert.equal(d.failedCount, 2);
    assert.equal(d.worstFields[0]!.path, "docDate");
    assert.match(d.headline, /one mis-typed source path/);
  });
});
