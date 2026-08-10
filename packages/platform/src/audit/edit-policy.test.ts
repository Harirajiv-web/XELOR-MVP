import { test } from "node:test";
import assert from "node:assert/strict";
import { editPolicy, checkEdit, editableDocTypes } from "./edit-policy.js";
import { buildChangeSet, diffFields, describeChangeSet } from "./change-set.js";

/**
 * The edit policy is a table, so these tests are mostly about the table being RIGHT rather
 * than the lookup working. The lookup is four lines; the damage lives in the entries.
 *
 * Three failure modes are worth a test each, and all three are silent in production:
 *
 *   1. A status string that does not match the database's CHECK constraint. Falls through
 *      to CLOSED, so the Edit button is dead for every document in that state and nothing
 *      logs an error. `editPolicyStatusVocabulary` pins every list against the constraint
 *      values, copied here by hand from `pg_constraint`.
 *   2. A ledger document that somehow becomes editable. The one outcome the CLOSED tier
 *      exists to prevent, and the only one that is unrecoverable.
 *   3. An amendment accepted without a reason. Produces a revision nobody can explain,
 *      and the row-level CHECK from migration 0089 would reject it anyway — which turns a
 *      clear 422 into a 500.
 */

/* ------------------------------------------------------------------ tiers -- */

test("a draft is corrected freely, with no reason required", () => {
  const v = editPolicy("sales.order", "draft");
  assert.equal(v.tier, "open");
  assert.equal(v.editable, true);
  assert.equal(v.reasonRequired, false);
  assert.equal(v.reapprovalRequired, false);
  assert.equal(checkEdit("sales.order", "draft"), null);
});

test("a confirmed order is an amendment: reason required, credit re-checked", () => {
  const v = editPolicy("sales.order", "confirmed");
  assert.equal(v.tier, "amend");
  assert.equal(v.editable, true);
  assert.equal(v.reasonRequired, true);
  assert.equal(v.reapprovalRequired, true);

  const refusal = checkEdit("sales.order", "confirmed");
  assert.equal(refusal?.code, "EDIT_REASON_REQUIRED");
  assert.equal(refusal?.httpStatus, 422);

  // A reason of only whitespace is not a reason.
  assert.equal(checkEdit("sales.order", "confirmed", "   ")?.code, "EDIT_REASON_REQUIRED");
  assert.equal(checkEdit("sales.order", "confirmed", "customer cut the call-off"), null);
});

test("a dispatched order is closed, and says to raise a credit note", () => {
  const v = editPolicy("sales.order", "dispatched");
  assert.equal(v.tier, "closed");
  assert.equal(v.editable, false);
  assert.equal(v.correctBy, "credit_note");

  const refusal = checkEdit("sales.order", "dispatched", "a very good reason");
  assert.equal(refusal?.code, "DOCUMENT_NOT_EDITABLE");
  assert.equal(refusal?.httpStatus, 409);
  // A reason does NOT unlock a closed document. If it did, the tier would be decorative.
  assert.equal(refusal?.correctBy, "credit_note");
});

/* --------------------------------------------------- the ledger stays shut -- */

test("no ledger or stock document is editable in any state, ever", () => {
  // The whole CLOSED tier exists for these. A regression here is the one failure that
  // cannot be undone: an eight-year statutory record of something that never happened.
  const ledger: Array<[string, string]> = [
    ["accounts.journal", "posted"],
    ["accounts.journal", "reversed"],
    ["accounts.journal", "anything-at-all"],
    ["inventory.stock", "posted"],
    ["inventory.stock", "whatever"],
    ["purchase.grn", "posted"],
  ];

  for (const [docType, status] of ledger) {
    const v = editPolicy(docType, status);
    assert.equal(v.editable, false, `${docType}/${status} must never be editable`);
    assert.equal(checkEdit(docType, status, "reason")?.code, "DOCUMENT_NOT_EDITABLE");
    // A refusal must always say what to do instead. Usually that is a `correctBy` route;
    // for an already-reversed voucher there is no second reversal to offer, and the
    // instruction lives in the sentence ("post the corrected voucher") — so the test
    // requires a way forward in one form or the other, not one particular form.
    assert.ok(
      v.correctBy !== "none" || v.reason.length > 30,
      `${docType}/${status} refuses without telling the user what to do instead`,
    );
  }
});

test("an unknown document type fails closed rather than open", () => {
  const v = editPolicy("nonexistent.thing", "draft");
  assert.equal(v.tier, "closed");
  assert.equal(v.editable, false);
});

test("a known document in an unknown status fails closed", () => {
  // The important case: a status added to the database and not added here. Refusing is
  // recoverable; permitting an edit on a state nobody reasoned about is not.
  const v = editPolicy("sales.order", "some_new_status_nobody_declared");
  assert.equal(v.editable, false);
});

/* ------------------------------------------- the status strings are real -- */

test("editPolicyStatusVocabulary — every declared status exists in the database", () => {
  // Copied from `pg_constraint` (SELECT pg_get_constraintdef(oid) ... LIKE '%status%').
  // If a migration changes a status vocabulary, this fails and points at the policy entry
  // that has to move with it — rather than the Edit button quietly going dead.
  const DB_STATUSES: Record<string, readonly string[]> = {
    "sales.order": ["draft", "confirmed", "credit_hold", "partially_dispatched", "dispatched", "cancelled"],
    "purchase.po": ["draft", "pending_approval", "approved", "rejected", "partially_received", "received", "cancelled"],
    "production.order": ["planned", "in_progress", "completed", "cancelled"],
    "quality.inspection": ["pending", "in_progress", "completed", "cancelled"],
    "maintenance.request": [
      "submitted", "acknowledged", "triaged", "mwo_created", "merged", "converted_to_pm", "rejected", "closed",
    ],
    "maintenance.workorder": [
      "draft", "approved", "assigned", "in_progress", "on_hold", "completed", "closed", "cancelled",
    ],
    "expenditure.claim": [
      "draft", "submitted", "in_approval", "returned", "approved", "rejected", "posted", "paid", "cancelled",
    ],
    "expenditure.travel": ["draft", "submitted", "approved", "rejected", "in_trip", "claimed", "cancelled"],
    "expenditure.advance": ["requested", "approved", "disbursed", "partially_settled", "settled", "cancelled"],
    "expenditure.indirect": [
      "draft", "submitted", "in_approval", "approved", "rejected", "po_raised", "posted", "paid", "blocked", "cancelled",
    ],
    "hrm.leave": ["applied", "approved", "rejected", "cancelled"],
    "accounts.journal": ["posted", "reversed"],
    "csp.ticket": ["new", "triaged", "in_progress", "pending_customer", "resolved", "closed", "reopened"],
    "csp.spare": ["submitted", "quoted", "reserved", "fulfilled", "closed", "rejected"],
  };

  for (const [docType, statuses] of Object.entries(DB_STATUSES)) {
    for (const status of statuses) {
      const v = editPolicy(docType, status);
      // Every real status must produce a DELIBERATE verdict — one with a reason written
      // for it — not the generic "no rule declared" fallback.
      assert.ok(
        v.reason.length > 0 && !v.reason.includes("has no edit rule"),
        `${docType} has no rule for the real status "${status}"`,
      );
    }
  }
});

test("every document type with a policy is reachable", () => {
  const types = editableDocTypes();
  assert.ok(types.length >= 20, `expected the full document set, got ${types.length}`);
  assert.ok(types.includes("sales.order"));
  assert.ok(types.includes("accounts.journal"));
  // Sorted, so the list is diffable when a document is added.
  assert.deepEqual([...types], [...types].sort());
});

/* ------------------------------------------------------------ change sets -- */

test("only the fields that actually moved appear in the change set", () => {
  const before = { qty: "120.000", rate: "450.00", remarks: "urgent" };
  const after = { qty: "96.000", rate: "450.00" };
  const changes = diffFields(before, after, ["qty", "rate", "remarks"]);

  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.field, "qty");
  assert.equal(changes[0]?.from, "120.000");
  assert.equal(changes[0]?.to, "96.000");
});

test("a field the caller did not send is left alone, not treated as null", () => {
  // This is what makes PATCH semantics safe: a form that edits one field sends one field,
  // and the twelve it did not load must not be blanked.
  const before = { a: "1", b: "2" };
  const changes = diffFields(before, { a: "9" }, ["a", "b"]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.field, "a");
});

test("saving an unchanged form writes nothing at all", () => {
  const set = buildChangeSet({ qty: "120" }, { qty: "120" }, ["qty"]);
  assert.equal(set, null);
});

test("sensitive values never enter the audit trail", () => {
  const set = buildChangeSet(
    { basicPay: "45000.00", panNumber: "ABCDE1234F", name: "R Kumar" },
    { basicPay: "52000.00", panNumber: "ZZZZZ9999Z", name: "R Kumar Iyer" },
    ["basicPay", "panNumber", "name"],
  );

  assert.ok(set);
  const bySensitivity = Object.fromEntries(set.changes.map((c) => [c.field, c]));

  // The fact of the change is recorded; the values are not.
  assert.equal(bySensitivity.basicPay?.redacted, true);
  assert.equal(bySensitivity.basicPay?.from, "(redacted)");
  assert.equal(bySensitivity.panNumber?.redacted, true);
  assert.ok(!JSON.stringify(set).includes("ABCDE1234F"), "a PAN reached the audit trail");
  assert.ok(!JSON.stringify(set).includes("45000.00"), "a salary reached the audit trail");

  // A non-sensitive field beside them is still recorded in full.
  assert.equal(bySensitivity.name?.redacted, undefined);
  assert.equal(bySensitivity.name?.to, "R Kumar Iyer");
});

test("an empty value reads as (empty), not as null", () => {
  // The audit trail is read by people who did not write the schema.
  const set = buildChangeSet({ remarks: null }, { remarks: "chase the vendor" }, ["remarks"]);
  assert.equal(set?.changes[0]?.from, "(empty)");
});

test("the reason and the revision travel with the change set", () => {
  const set = buildChangeSet({ qty: "120" }, { qty: "96" }, ["qty"], {
    reason: "  customer reduced the call-off  ",
    revisionNo: 3,
  });
  assert.equal(set?.reason, "customer reduced the call-off");
  assert.equal(set?.revisionNo, 3);
});

test("a change set describes itself in one line per field", () => {
  const set = buildChangeSet({ qty: "120", rate: "450.00" }, { qty: "96", rate: "460.00" }, [
    "qty",
    "rate",
  ]);
  assert.ok(set);
  assert.deepEqual(describeChangeSet(set), ["qty: 120 → 96", "rate: 450.00 → 460.00"]);
});

test("money is compared as a string, never as a float", () => {
  // `NUMERIC(18,2)` does not survive a float round-trip. A diff that parsed these would
  // report a change between two values that are the same rupee.
  const set = buildChangeSet({ amount: "1234.10" }, { amount: "1234.10" }, ["amount"]);
  assert.equal(set, null);
});
