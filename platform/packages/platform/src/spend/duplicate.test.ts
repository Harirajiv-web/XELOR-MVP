import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectReceiptDuplicates,
  detectSplitPattern,
  exactDuplicates,
  merchantSimilarity,
  normaliseMerchant,
  shouldHoldForReview,
  type ReceiptFingerprint,
} from "./duplicate.js";

const fp = (o: Partial<ReceiptFingerprint>): ReceiptFingerprint => ({
  attachmentId: "att-1",
  docRef: "EXP-2627-00011",
  claimantRef: "emp-deepa",
  sha256: "aaa",
  merchant: "Hotel Saurashtra Residency",
  invoiceNo: "HSR/26-27/0412",
  invoiceDate: "2026-07-04",
  amount: 7080,
  ...o,
});

/* --------------------------------- tier 1 ---------------------------------- */

test("the same image file on two claims is a fact, and both documents are named", () => {
  const found = exactDuplicates(fp({ attachmentId: "att-2", docRef: "EXP-2627-00019" }), [fp({})]);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.kind, "exact_image");
  assert.equal(found[0]!.severity, "certain");
  assert.deepEqual(found[0]!.documents, ["EXP-2627-00019", "EXP-2627-00011"]);
  assert.equal(found[0]!.action, "flag_for_approver", "even a certainty only flags");
});

test("the same file claimed by a DIFFERENT person is called out as such", () => {
  const found = exactDuplicates(
    fp({ attachmentId: "att-2", docRef: "EXP-2627-00019", claimantRef: "emp-kavita" }),
    [fp({})],
  );
  assert.equal(found[0]!.crossClaimant, true);
  assert.match(found[0]!.reason, /claimed by a different person/);
});

/* --------------------------------- tier 2 ---------------------------------- */

test("an invoice number is unique by law, so the same one twice is near-certain", () => {
  const found = detectReceiptDuplicates(
    fp({ attachmentId: "att-2", docRef: "EXP-2627-00019", sha256: "bbb", amount: 7080 }),
    [fp({})],
  );
  assert.equal(found[0]!.kind, "same_invoice_no");
  assert.equal(found[0]!.severity, "certain");
  assert.match(found[0]!.reason, /unique by law/);
});

test("a re-photographed bill — same merchant, date and amount, different bytes — is PROBABLE, not certain", () => {
  const found = detectReceiptDuplicates(
    fp({ attachmentId: "att-2", docRef: "EXP-2627-00019", sha256: "bbb", invoiceNo: null }),
    [fp({ invoiceNo: null })],
  );
  assert.equal(found[0]!.kind, "near_duplicate");
  assert.ok(["probable", "possible"].includes(found[0]!.severity));
  assert.match(found[0]!.reason, /Different image file, so this is a judgement call/);
});

test("two identical taxi fares a week apart are NOT flagged — that is an ordinary Tuesday", () => {
  const found = detectReceiptDuplicates(
    fp({ attachmentId: "att-2", sha256: "bbb", invoiceNo: null, merchant: "Sai Travels", invoiceDate: "2026-07-13", amount: 480 }),
    [fp({ invoiceNo: null, merchant: "Sai Travels", invoiceDate: "2026-07-06", amount: 480 })],
  );
  assert.deepEqual(found, []);
});

test("a different amount at the same merchant on the same day is not a duplicate", () => {
  const found = detectReceiptDuplicates(
    fp({ attachmentId: "att-2", sha256: "bbb", invoiceNo: null, amount: 5200 }),
    [fp({ invoiceNo: null, amount: 7080 })],
  );
  assert.deepEqual(found, []);
});

test("a merchant name is normalised enough to survive OCR and shop-front spelling", () => {
  assert.equal(normaliseMerchant("Hotel Saurashtra Residency Pvt. Ltd."), "saurashtra residency");
  assert.equal(merchantSimilarity("Hotel Saurashtra Residency", "SAURASHTRA RESIDENCY PVT LTD"), 1);
  assert.ok(merchantSimilarity("Sai Tours & Travels", "Sai Travels") >= 0.5);
  assert.equal(merchantSimilarity("Indian Oil", "Bharat Petroleum"), 0);
});

test("an exact match is not ALSO reported as a near match — one finding per pair", () => {
  const found = detectReceiptDuplicates(fp({ attachmentId: "att-2", docRef: "EXP-2627-00019" }), [fp({})]);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.kind, "exact_image");
});

/* --------------------------------- tier 3 ---------------------------------- */

test("four receipts just under the limit on one evening is a pattern worth ASKING about", () => {
  const meals = [480, 495, 470, 490].map((amount, i) =>
    fp({
      attachmentId: `m${i}`,
      docRef: `EXP-2627-000${20 + i}`,
      claimantRef: `emp-${i}`,
      sha256: `h${i}`,
      merchant: "Barbeque Nation",
      invoiceNo: `BN/${i}`,
      invoiceDate: "2026-07-10",
      amount,
    }),
  );
  const found = detectSplitPattern(meals, { threshold: 500 });
  assert.equal(found.length, 1);
  assert.equal(found[0]!.kind, "split_pattern");
  assert.equal(found[0]!.severity, "possible", "capped — this is the finding most likely to be wrong about a person");
  assert.equal(found[0]!.crossClaimant, true);
  assert.match(found[0]!.reason, /also the shape of 4 people splitting one bill/);
  assert.match(found[0]!.reason, /Worth asking; not worth assuming/);
});

test("two receipts is not a pattern, and neither is one well under the limit", () => {
  const two = [480, 495].map((amount, i) =>
    fp({ attachmentId: `m${i}`, sha256: `h${i}`, merchant: "Barbeque Nation", invoiceDate: "2026-07-10", amount }),
  );
  assert.deepEqual(detectSplitPattern(two, { threshold: 500 }), []);

  const small = [100, 120, 90].map((amount, i) =>
    fp({ attachmentId: `s${i}`, sha256: `g${i}`, merchant: "Chai Point", invoiceDate: "2026-07-10", amount }),
  );
  assert.deepEqual(detectSplitPattern(small, { threshold: 500 }), [], "₹100 teas are not an avoidance pattern");
});

/* ------------------------------- the disposition --------------------------- */

test("nothing in this module ever rejects anything", () => {
  const all = [
    ...detectReceiptDuplicates(fp({ attachmentId: "att-2", docRef: "EXP-2627-00019" }), [fp({})]),
    ...detectSplitPattern(
      [480, 495, 470].map((amount, i) =>
        fp({ attachmentId: `m${i}`, sha256: `h${i}`, merchant: "Barbeque Nation", invoiceDate: "2026-07-10", amount }),
      ),
      { threshold: 500 },
    ),
  ];
  assert.ok(all.length >= 2);
  for (const f of all) assert.equal(f.action, "flag_for_approver");
});

test("a certain finding holds the document for a second look; a weak one does not", () => {
  assert.equal(shouldHoldForReview(exactDuplicates(fp({ attachmentId: "att-2" }), [fp({})])), true);
  assert.equal(
    shouldHoldForReview(
      detectSplitPattern(
        [480, 495, 470].map((amount, i) =>
          fp({ attachmentId: `m${i}`, sha256: `h${i}`, merchant: "Barbeque Nation", invoiceDate: "2026-07-10", amount }),
        ),
        { threshold: 500 },
      ),
    ),
    false,
    "a split pattern is a question for the approver, not a hold",
  );
});
