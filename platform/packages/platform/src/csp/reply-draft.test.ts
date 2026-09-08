import { test } from "node:test";
import assert from "node:assert/strict";
import {
  availableTemplates,
  cannedReplyTemplate,
  checkReplyDraft,
  summariseThread,
  DRAFT_BANNER,
  type ReplyContext,
} from "./reply-draft.js";

const CTX: ReplyContext = {
  ticketNo: "TKT-2627-00031",
  subject: "Oil leak at pump-shaft seal",
  customerName: "BlueOrbit Pumps Pvt Ltd",
  status: "in_progress",
  slaPromise: "First response within 4 business hours",
  publicThread: [
    { author: "customer", body: "Seal weeping on the shaft, line is down since 06:00." },
    { author: "agent", body: "Thank you — we are looking at this now." },
  ],
  entitlementResult: null,
  knownNumbers: [6],
};

/* ------------------------------- the baseline ------------------------------ */

test("the canned templates are a complete reply with no model involved", () => {
  const d = cannedReplyTemplate("acknowledge", CTX);
  assert.match(d.body, /TKT-2627-00031/);
  assert.match(d.body, /First response within 4 business hours/);
  assert.equal(d.source, "canned_template");
  assert.equal(d.sent, false, "a draft is never sent by the thing that wrote it");
  assert.equal(d.banner, DRAFT_BANNER);
});

test("every template is safe to send as written", () => {
  for (const kind of availableTemplates()) {
    const d = cannedReplyTemplate(kind as never, CTX);
    const g = checkReplyDraft(d.body, CTX);
    assert.equal(g.ok, true, `${kind} failed its own gate: ${g.reason}`);
  }
});

test("an unknown template is a programming error, not a blank reply", () => {
  assert.throws(() => cannedReplyTemplate("nonsense" as never, CTX), /unknown canned template/);
});

/* -------------------------------- the gate --------------------------------- */

test("a COMMITMENT is refused — a model has no standing to promise a replacement", () => {
  for (const bad of [
    "We will replace the seal free of charge and dispatch it tomorrow.",
    "This will be repaired at no cost to you.",
    "We guarantee a resolution by Friday.",
    "We will refund the full amount.",
  ]) {
    const r = checkReplyDraft(bad, CTX);
    assert.equal(r.ok, false, bad);
    assert.equal(r.reason, "made_a_commitment", bad);
  }
});

test("a LIABILITY verdict is refused — that belongs to Quality, not to a reply", () => {
  for (const bad of [
    "This is a manufacturing defect on our side.",
    "We accept liability for the failure.",
    "This was caused by misuse by your operators.",
  ]) {
    const r = checkReplyDraft(bad, CTX);
    assert.equal(r.ok, false, bad);
    assert.equal(r.reason, "decided_liability", bad);
  }
});

test("internal context never leaks into a customer-facing sentence", () => {
  for (const bad of [
    "As per the internal note, we have escalated to the manager.",
    "NCR-2627-0044 has been raised for this batch.",
    "Our cost price on this part is lower than the quote.",
  ]) {
    const r = checkReplyDraft(bad, CTX);
    assert.equal(r.ok, false, bad);
    assert.equal(r.reason, "leaked_internal_context", bad);
  }
});

test("the model may not answer as a model", () => {
  const r = checkReplyDraft("As an AI language model I cannot confirm coverage.", CTX);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "broke_persona");
});

test("claiming coverage requires an entitlement check to have actually run", () => {
  const claim = "Good news — this shaft is covered under warranty, so there is nothing to pay.";
  // Even ignoring the commitment wording, the coverage claim itself is refused when no
  // entitlement verdict exists on the ticket.
  assert.equal(checkReplyDraft("This part is covered under warranty.", CTX).reason, "claimed_coverage_without_an_entitlement_check");
  assert.equal(checkReplyDraft(claim, CTX).ok, false);

  const checked: ReplyContext = { ...CTX, entitlementResult: "covered_warranty" };
  assert.equal(
    checkReplyDraft("This part is covered under warranty.", checked).ok,
    true,
    "once the entitlement engine has said so, repeating it is reporting, not promising",
  );
});

test("a figure that is not on the ticket cannot appear in the reply", () => {
  const r = checkReplyDraft("We have shipped 6 units; the balance 42 will follow.", CTX);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "ungrounded_number:42");
});

test("figures the customer can already read are quotable", () => {
  const withThread: ReplyContext = {
    ...CTX,
    publicThread: [{ author: "customer", body: "Seal weeping since 06:00 on 6 machines." }],
  };
  assert.equal(checkReplyDraft("We understand 6 machines are affected since 06:00.", withThread).ok, true);
});

test("an empty or oversized draft is refused before anything else is examined", () => {
  assert.equal(checkReplyDraft("   ", CTX).reason, "empty");
  assert.equal(checkReplyDraft("x".repeat(1501), CTX).reason, "too_long");
});

test("an ordinary, careful reply passes", () => {
  const good =
    "Thank you for the update on TKT-2627-00031. Our engineer has reviewed the photographs and we are " +
    "checking the seating of the seal against the assembly record. We will come back to you on this request " +
    "as soon as that check is complete.";
  assert.deepEqual(checkReplyDraft(good, CTX), { ok: true });
});

/* ------------------------------ summarisation ------------------------------ */

test("the thread summary is assembled from the record, so it is never wrong", () => {
  const s = summariseThread({ ...CTX, entitlementResult: "covered_warranty" });
  assert.match(s, /TKT-2627-00031/);
  assert.match(s, /1 message from the customer, 1 from the desk/);
  assert.match(s, /Entitlement check: covered warranty/);
  assert.match(s, /Last update was from the agent/);
});

test("summarising an empty thread does not invent one", () => {
  const s = summariseThread({ ...CTX, publicThread: [], entitlementResult: null });
  assert.match(s, /0 messages from the customer, 0 from the desk/);
  assert.doesNotMatch(s, /Last update/);
});
