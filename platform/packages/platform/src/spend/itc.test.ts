import { test } from "node:test";
import assert from "node:assert/strict";
import { isGstinShaped, resolveItc, splitGst } from "./itc.js";

const TRISHUL_PUNE = "27AABCT1234F1Z5";
const TRISHUL_CBE = "33AABCT1234F1Z9";
const HOTEL_GUJARAT = "24AAHFH2811Q1Z3";

/* ------------------------------ the two gates ------------------------------ */

test("a lodging bill addressed to the company gives credit", () => {
  const r = resolveItc({
    headDefault: "eligible",
    invoiceRecipientGstin: TRISHUL_PUNE,
    companyGstin: TRISHUL_PUNE,
    gstAmount: 758,
  });
  assert.equal(r.eligibility, "eligible");
  assert.equal(r.itcAmount, 758);
});

test("the SAME bill without the company GSTIN on it gives nothing — this is the rule people refuse to believe", () => {
  const r = resolveItc({
    headDefault: "eligible",
    invoiceRecipientGstin: null,
    companyGstin: TRISHUL_PUNE,
    gstAmount: 758,
  });
  assert.equal(r.eligibility, "blocked_other");
  assert.equal(r.itcAmount, 0);
  assert.equal(r.blockedByInvoice, true);
  assert.match(r.reason, /B2C bill and the tax on it was never reported against the company/);
});

test("a bill addressed to somebody else's registration is not this company's credit", () => {
  const r = resolveItc({
    headDefault: "eligible",
    invoiceRecipientGstin: "27AAACB2233K1Z9",
    companyGstin: TRISHUL_PUNE,
    gstAmount: 900,
  });
  assert.equal(r.itcAmount, 0);
  assert.equal(r.blockedByInvoice, true);
  assert.match(r.reason, /addressed to 27AAACB2233K1Z9/);
});

test("a statutory block cannot be argued out of with a better invoice", () => {
  for (const head of ["blocked_17_5_food", "blocked_17_5_motor_vehicle", "blocked_17_5_personal", "blocked_17_5_club"] as const) {
    const r = resolveItc({
      headDefault: head,
      invoiceRecipientGstin: TRISHUL_PUNE, // perfect paperwork
      companyGstin: TRISHUL_PUNE,
      gstAmount: 67,
    });
    assert.equal(r.itcAmount, 0, head);
    assert.equal(r.blockedByInvoice, false, "the invoice was fine — the category is the problem");
    assert.match(r.reason, /^Blocked — s\.17\(5\)/, head);
  }
});

test("the demo's own numbers: hotel ₹758 claimed, meals ₹67 blocked, on one trip", () => {
  const hotel = resolveItc({
    headDefault: "eligible",
    invoiceRecipientGstin: TRISHUL_PUNE,
    companyGstin: TRISHUL_PUNE,
    gstAmount: 758,
  });
  const meals = resolveItc({
    headDefault: "blocked_17_5_food",
    invoiceRecipientGstin: TRISHUL_PUNE,
    companyGstin: TRISHUL_PUNE,
    gstAmount: 67,
  });
  assert.equal(hotel.itcAmount + meals.itcAmount, 758);
  assert.match(meals.reason, /food and beverages/);
});

test("an exempt supply has no credit because it had no tax", () => {
  const r = resolveItc({ headDefault: "exempt", invoiceRecipientGstin: TRISHUL_PUNE, companyGstin: TRISHUL_PUNE, gstAmount: 0 });
  assert.equal(r.eligibility, "exempt");
  assert.equal(r.itcAmount, 0);
  assert.match(r.reason, /no GST charged/i);
});

test("reverse charge keeps the credit but on the company's own challan", () => {
  const r = resolveItc({ headDefault: "rcm", invoiceRecipientGstin: null, companyGstin: TRISHUL_PUNE, gstAmount: 900 });
  assert.equal(r.eligibility, "rcm");
  assert.equal(r.itcAmount, 900, "the credit exists — it just does not come through this invoice");
});

/* -------------------------------- overrides -------------------------------- */

test("a person may always give up a credit; taking one they were not given needs permission", () => {
  const down = resolveItc({
    headDefault: "eligible",
    invoiceRecipientGstin: TRISHUL_PUNE,
    companyGstin: TRISHUL_PUNE,
    gstAmount: 758,
    manualOverride: { to: "blocked_other", reason: "supplier's registration is suspended; not claiming" },
  });
  assert.equal(down.itcAmount, 0);
  assert.equal(down.overrideApplied, true);

  const upNoPerm = resolveItc({
    headDefault: "blocked_17_5_food",
    invoiceRecipientGstin: TRISHUL_PUNE,
    companyGstin: TRISHUL_PUNE,
    gstAmount: 67,
    manualOverride: { to: "eligible", reason: "we want the credit" },
  });
  assert.equal(upNoPerm.itcAmount, 0, "wanting it is not a basis");
  assert.equal(upNoPerm.overrideApplied, false);

  const upWithPerm = resolveItc({
    headDefault: "blocked_other",
    invoiceRecipientGstin: TRISHUL_PUNE,
    companyGstin: TRISHUL_PUNE,
    gstAmount: 500,
    manualOverride: { to: "eligible", reason: "supplier issued a corrected B2B invoice", hasOverridePermission: true },
  });
  assert.equal(upWithPerm.itcAmount, 500);
  assert.equal(upWithPerm.overrideApplied, true);
  assert.match(upWithPerm.reason, /Upgraded .* corrected B2B invoice/);
});

/* -------------------------------- GSTIN shape ------------------------------ */

test("the GSTIN shape check is real, not a length check", () => {
  assert.equal(isGstinShaped(TRISHUL_PUNE), true);
  assert.equal(isGstinShaped(HOTEL_GUJARAT), true);
  assert.equal(isGstinShaped("27AABCT1234F1A5"), false, "the 14th character must be Z");
  assert.equal(isGstinShaped("2AABCT1234F1Z5"), false, "fourteen characters is not a GSTIN");
  assert.equal(isGstinShaped("27aabct1234f1z5"), false, "lower case is not a GSTIN");
  assert.equal(isGstinShaped(null), false);
});

/* ------------------------------ the tax split ------------------------------ */

test("same state splits into halves; different states is one integrated tax", () => {
  const intra = splitGst({ supplierGstin: "27AAAAA0000A1Z5", companyGstin: TRISHUL_PUNE, gstAmount: 7200 });
  assert.deepEqual([intra.cgst, intra.sgst, intra.igst], [3600, 3600, 0]);
  assert.equal(intra.interState, false);

  const inter = splitGst({ supplierGstin: HOTEL_GUJARAT, companyGstin: TRISHUL_PUNE, gstAmount: 9360 });
  assert.deepEqual([inter.cgst, inter.sgst, inter.igst], [0, 0, 9360]);
  assert.equal(inter.interState, true);
  assert.match(inter.reason, /Supplier in state 24, recipient in 27/);
});

test("an odd amount still adds back to the whole — a register one paisa out is a register somebody explains", () => {
  const s = splitGst({ supplierGstin: "27AAAAA0000A1Z5", companyGstin: TRISHUL_PUNE, gstAmount: 100.01 });
  assert.equal(s.cgst, 50);
  assert.equal(s.sgst, 50.01, "the odd paisa goes to SGST rather than evaporating");
  // Compared at paise precision: 50 + 50.01 is 100.00999999999999 as a binary float, which
  // is the artefact the rounding exists to keep out of the ledger in the first place.
  assert.equal(Math.round((s.cgst + s.sgst) * 100) / 100, 100.01);
});

test("the Coimbatore registration changes the answer for the very same supplier", () => {
  const forPune = splitGst({ supplierGstin: "33AAAAA0000A1Z5", companyGstin: TRISHUL_PUNE, gstAmount: 1000 });
  const forCbe = splitGst({ supplierGstin: "33AAAAA0000A1Z5", companyGstin: TRISHUL_CBE, gstAmount: 1000 });
  assert.equal(forPune.igst, 1000, "Tamil Nadu supplier billing the Pune registration is inter-state");
  assert.equal(forCbe.igst, 0, "the same supplier billing the Coimbatore registration is intra-state");
  assert.equal(forCbe.cgst, 500);
});
