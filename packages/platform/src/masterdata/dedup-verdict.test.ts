import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkGrounding,
  decideDuplicateVerdict,
  renderDeterministicReason,
  type DedupVerdict,
} from "./dedup-verdict.js";
import { detectDuplicates, type MasterRecord } from "./dedup.js";

/**
 * These guard the two things a human must be able to trust in an AI explanation:
 * the CONCLUSION (decided here in code, never by a model) and the GROUNDING (nothing
 * shown that is not in the evidence). Every case below is a failure a local 3B model
 * actually produced during evaluation on 25 Jul 2026.
 */

const G_MH = "27AABCT1234F1Z5";
const G_TN = "33AABCT1234F1Z9";

function verdictFor(candidate: MasterRecord, existing: MasterRecord[]): DedupVerdict {
  const matches = detectDuplicates(candidate, existing);
  assert.ok(matches.length > 0, "scenario must produce a match to explain");
  return decideDuplicateVerdict(candidate, matches[0]!, {});
}

/* ----------------------------- the conclusion ----------------------------- */

test("identical GSTIN concludes SAME", () => {
  const v = verdictFor({ legalName: "Trishul Precision", gstin: G_MH }, [
    { id: "e1", legalName: "Trishul Precision Pvt Ltd", gstin: G_MH },
  ]);
  assert.equal(v.conclusion, "same");
  assert.match(v.action, /Merge/);
});

test("conflicting GSTINs conclude DIFFERENT even when the names are near-identical", () => {
  const v = verdictFor({ legalName: "Shree Balaji Engineering Works", gstin: G_MH }, [
    { id: "e2", legalName: "Shree Balaji Engineering Work", gstin: G_TN },
  ]);
  assert.equal(v.conclusion, "different");
  assert.match(v.action, /Keep both/);
});

test("no strong identifier concludes UNPROVEN — a close name is never proof", () => {
  const v = verdictFor({ legalName: "Sri Venkateswara Tools" }, [
    { id: "e3", legalName: "Sri Venkateswara Tool" },
  ]);
  assert.equal(v.conclusion, "unproven");
});

test("an identifier present on only one side cannot be compared", () => {
  const v = verdictFor({ legalName: "Anand Auto Parts", gstin: G_MH }, [
    { id: "e4", legalName: "Anand Auto Parts Private Limited" },
  ]);
  assert.equal(v.conclusion, "unproven");
});

test("a matching GSTIN outranks unrelated names", () => {
  const v = verdictFor({ legalName: "Kaveri Pumps and Motors", gstin: G_TN }, [
    { id: "e5", legalName: "Kaveri ElectroFab Industries", gstin: G_TN },
  ]);
  assert.equal(v.conclusion, "same");
});

/* ------------------------------ the grounding ----------------------------- */

const sameVerdict = (): DedupVerdict =>
  verdictFor({ legalName: "Trishul Precision", gstin: G_MH }, [
    { id: "e1", legalName: "Trishul Precision Pvt Ltd", gstin: G_MH },
  ]);

const unprovenVerdict = (): DedupVerdict =>
  verdictFor({ legalName: "Sri Venkateswara Tools" }, [
    { id: "e3", legalName: "Sri Venkateswara Tool" },
  ]);

test("the deterministic reason is always itself grounded", () => {
  for (const v of [sameVerdict(), unprovenVerdict()]) {
    assert.equal(checkGrounding(renderDeterministicReason(v), v).ok, true);
  }
});

test("an invented GSTIN is rejected", () => {
  const v = sameVerdict();
  const r = checkGrounding("Both records carry GST number 29AAAAA9999Z1Z9.", v);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /ungrounded/);
});

test("an invented short number is rejected", () => {
  const v = unprovenVerdict();
  const r = checkGrounding("The names differ by only 12 characters out of 30.", v);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /ungrounded_number/);
});

test("a similarity percentage re-read as a difference is rejected", () => {
  const v = verdictFor({ legalName: "Kaveri Pumps and Motors", gstin: G_TN }, [
    { id: "e5", legalName: "Kaveri ElectroFab Industries", gstin: G_TN },
  ]);
  const r = checkGrounding("Their names differ by only 17%.", v);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /percentage_reinterpreted/);
});

test("a hedged claim of sameness still contradicts an UNPROVEN verdict", () => {
  const v = unprovenVerdict();
  const r = checkGrounding("The records likely refer to the same entity.", v);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "contradicts_verdict");
});

test("text truncated mid-name is rejected", () => {
  const v = sameVerdict();
  const r = checkGrounding('The names are 100% similar ("Trishul Precision" vs "Trishul Pvt.', v);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "unbalanced_quotes");
});

test("internal verdict tokens must not leak to the user", () => {
  const v = sameVerdict();
  assert.equal(checkGrounding("The GST number is a MATCH.", v).ok, false);
});

test("'different' as ordinary English is allowed — only the shouted token is not", () => {
  const v = verdictFor({ legalName: "Shree Balaji Engineering Works", gstin: G_MH }, [
    { id: "e2", legalName: "Shree Balaji Engineering Work", gstin: G_TN },
  ]);
  assert.equal(checkGrounding("The two GST numbers are different.", v).ok, true);
});
