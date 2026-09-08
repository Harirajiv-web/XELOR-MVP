import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptanceReport,
  crossCheckReceipt,
  keywordCategoriser,
  mergeWithFallback,
  validateReceiptDraft,
  type ReceiptDraft,
} from "./receipt.js";

/** The demo's opening beat: the Rajkot hotel invoice on Deepa's OmTek trip. */
const HOTEL: ReceiptDraft = {
  merchant: "Hotel Saurashtra Residency",
  invoiceNo: "HSR/26-27/0412",
  invoiceDate: "2026-07-04",
  supplierGstin: "24AAHFH2811Q1Z3",
  recipientGstin: "27AABCT1234F1Z5",
  placeOfSupplyStateCode: "24",
  taxableValue: 6322,
  cgst: 379,
  sgst: 379,
  igst: 0,
  total: 7080,
  currency: "INR",
  lines: [{ description: "Deluxe room, 2 nights", amount: 6322 }],
  suggestedHeadCode: "EH-TRV-HTL",
};

/* -------------------------- the wholesale rejection ------------------------ */

test("the blueprint's own hotel invoice validates and reconciles", () => {
  assert.equal(validateReceiptDraft(HOTEL).ok, true);
  const x = crossCheckReceipt(HOTEL, { expectedGstRate: 12 });
  assert.deepEqual(x.needsReview, [], x.checks.filter((c) => !c.passed).map((c) => c.detail).join("; "));
  assert.equal(x.clean, true);
  // 6% + 6% of 6,322 = 758.64, printed as 379 + 379 = 758 — inside the ₹1 tolerance.
  assert.equal(HOTEL.cgst + HOTEL.sgst, 758);
  assert.equal(HOTEL.taxableValue + 758, HOTEL.total);
});

test("an UNKNOWN field is fatal, not ignored — a receipt image is untrusted input", () => {
  const r = validateReceiptDraft({ ...HOTEL, approved: true });
  assert.equal(r.ok, false);
  assert.match(r.reason!, /unexpected field 'approved'/);
});

test("a negative amount, an oversized string and a malformed GSTIN are each rejected outright", () => {
  assert.match(validateReceiptDraft({ ...HOTEL, total: -1 }).reason!, /cannot be negative/);
  assert.match(validateReceiptDraft({ ...HOTEL, merchant: "x".repeat(201) }).reason!, /longer than 200/);
  assert.match(validateReceiptDraft({ ...HOTEL, supplierGstin: "24AAHFH2811Q1A3" }).reason!, /not a valid GSTIN/);
  assert.match(validateReceiptDraft({ ...HOTEL, invoiceDate: "04-07-2026" }).reason!, /YYYY-MM-DD/);
  assert.match(validateReceiptDraft({ ...HOTEL, currency: "USD" }).reason!, /only INR receipts/);
  assert.match(validateReceiptDraft("not an object").reason!, /not an object/);
  assert.match(validateReceiptDraft({ ...HOTEL, lines: [{ description: "x", amount: 1, sneaky: true }] }).reason!, /unexpected field 'sneaky'/);
});

/* ------------------------------- cross-checks ------------------------------ */

test("THE CONTRAST SEED: the thermal-print taxi receipt whose lines do not add up", () => {
  // Extraction returns a total of ₹850 while the lines sum to ₹730 — a hallucinated
  // figure that looks entirely plausible on a faded thermal print.
  const taxi: ReceiptDraft = {
    merchant: "Sai Tours & Travels",
    invoiceDate: "2026-07-06",
    supplierGstin: null,
    recipientGstin: null,
    taxableValue: 850,
    cgst: 0,
    sgst: 0,
    igst: 0,
    total: 850,
    currency: "INR",
    lines: [
      { description: "Airport transfer", amount: 480 },
      { description: "Waiting charges", amount: 250 },
    ],
    suggestedHeadCode: "EH-TRV-CONV",
  };
  const x = crossCheckReceipt(taxi);
  assert.equal(x.clean, false);
  assert.ok(x.needsReview.includes("lines"));
  assert.match(x.checks.find((c) => c.field === "lines")!.detail, /sum to ₹730/);
});

test("a failed TOTAL drags every figure it was derived from into review", () => {
  const wrong: ReceiptDraft = { ...HOTEL, total: 7200 };
  const x = crossCheckReceipt(wrong);
  assert.ok(x.needsReview.includes("total"));
  assert.ok(x.needsReview.includes("taxableValue"), "reviewing the total alone is not a review");
  assert.ok(x.needsReview.includes("cgst"));
  assert.ok(x.needsReview.includes("sgst"));
});

test("a GSTIN whose state does not match the place of supply is caught", () => {
  const x = crossCheckReceipt({ ...HOTEL, placeOfSupplyStateCode: "27" });
  assert.ok(x.needsReview.includes("supplierGstin"));
  assert.match(x.checks.find((c) => c.field === "supplierGstin")!.detail, /state code 24 does not match/);
});

test("IGST and CGST/SGST on one supply cannot both be right", () => {
  const x = crossCheckReceipt({ ...HOTEL, igst: 758 });
  assert.ok(x.needsReview.includes("igst"));
  assert.match(x.checks.find((c) => c.field === "igst")!.detail, /cannot both apply/);
});

test("uneven CGST and SGST halves are caught", () => {
  const x = crossCheckReceipt({ ...HOTEL, cgst: 500, sgst: 258 });
  assert.ok(x.needsReview.includes("cgst"));
  assert.match(x.checks.find((c) => c.field === "cgst")!.detail, /splits evenly/);
});

test("the tax must equal the rate times the taxable value", () => {
  const x = crossCheckReceipt(HOTEL, { expectedGstRate: 18 });
  assert.ok(x.needsReview.includes("taxableValue"));
  assert.match(x.checks.find((c) => c.field === "taxableValue")!.detail, /18% of ₹6322 = ₹1137.96, but the receipt shows ₹758/);
});

test("low confidence sends a field to review even when the arithmetic is perfect", () => {
  const x = crossCheckReceipt(HOTEL, { confidence: { merchant: 0.55, total: 0.96 }, confidenceFloor: 0.85 });
  assert.ok(x.needsReview.includes("merchant"));
  assert.ok(!x.needsReview.includes("total"));
});

test("a supplier's own rounding of up to a rupee is tolerated, and two rupees is not", () => {
  assert.equal(crossCheckReceipt({ ...HOTEL, total: 7081 }).clean, true);
  assert.equal(crossCheckReceipt({ ...HOTEL, total: 7082 }).clean, false);
});

/* ------------------------------ categorisation ----------------------------- */

const HEADS = [
  { code: "EH-TRV-HTL", name: "Travel — Lodging", keywords: ["hotel", "residency", "inn", "lodge", "room"] },
  { code: "EH-TRV-CONV", name: "Local conveyance", keywords: ["travels", "taxi", "cab", "auto", "transfer"] },
  { code: "EH-TRV-MEA", name: "Travel — Meals", keywords: ["restaurant", "cafe", "dhaba", "meal"] },
  { code: "EH-PRF-FEE", name: "Professional fees", keywords: ["consult", "chartered", "advocate", "audit"] },
];

test("the deterministic categoriser reads the merchant name, which carries most of the signal", () => {
  const hotel = keywordCategoriser({ merchant: "Hotel Saurashtra Residency", lines: HOTEL.lines }, HEADS);
  assert.equal(hotel.headCode, "EH-TRV-HTL");
  assert.ok(hotel.confidence > 0.6, `two keywords matched: ${hotel.matched.join(", ")}`);

  const taxi = keywordCategoriser({ merchant: "Sai Tours & Travels", lines: [{ description: "Airport transfer", amount: 480 }] }, HEADS);
  assert.equal(taxi.headCode, "EH-TRV-CONV");
});

test("an unrecognised merchant returns NOTHING with low confidence, not a guess", () => {
  const r = keywordCategoriser({ merchant: "Kirloskar Brothers" }, HEADS);
  assert.equal(r.headCode, null);
  assert.equal(r.confidence, 0.2);
});

/* -------------------------------- the fallback ----------------------------- */

test("the deterministic fallback WINS on numbers, and the disagreement is shown, not hidden", () => {
  const model: ReceiptDraft = { ...HOTEL, taxableValue: 6322, total: 7200 };
  const merged = mergeWithFallback(model, { taxableValue: 6322, total: 7080 });
  assert.equal(merged.merged.total, 7080, "the fallback was called BECAUSE the model's arithmetic failed");
  assert.deepEqual(merged.divergent, ["total"]);
  assert.equal(merged.usedFallback, true);
});

/* ------------------------------ honest metrics ----------------------------- */

test("the acceptance dashboard reports the EDIT rate beside the headline", () => {
  const r = acceptanceReport([
    { attachmentId: "a1", confirmed: true, usedFallback: false, edits: {}, fieldsPresented: 7 },
    { attachmentId: "a2", confirmed: true, usedFallback: true, edits: { total: { extracted: 850, final: 730 } }, fieldsPresented: 7 },
    { attachmentId: "a3", confirmed: true, usedFallback: false, edits: { merchant: { extracted: "x", final: "y" }, total: { extracted: 1, final: 2 } }, fieldsPresented: 7 },
    { attachmentId: "a4", confirmed: false, usedFallback: false, edits: {}, fieldsPresented: 7 },
  ]);
  assert.equal(r.acceptanceRatePct, 75);
  assert.equal(
    r.fieldEditRatePct,
    10.7,
    "three edits across 28 presented fields — the number the headline cannot be quoted without",
  );
  assert.equal(r.fallbackRatePct, 25);
  assert.deepEqual(r.mostEditedFields[0], { field: "total", edits: 2 });
});

test("no drafts is a zero rate, not a division by zero", () => {
  const r = acceptanceReport([]);
  assert.equal(r.acceptanceRatePct, 0);
  assert.equal(r.fieldEditRatePct, 0);
});
