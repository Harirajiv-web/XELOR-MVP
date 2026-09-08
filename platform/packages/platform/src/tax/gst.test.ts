import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GST_CONFIG,
  URP,
  checkShipToGstin,
  computeLineTax,
  computeOrderTax,
  gstinChecksumChar,
  isGstinChecksumValid,
  isInterState,
  isValidGstinFormat,
  isValidHsn,
  shipToGstinRequired,
  stateCodeOfGstin,
  validateGstin,
  type TaxableLineInput,
} from "./gst.js";

// The §7 demo tenant's two registrations — the same customer is intra-state from one
// plant and inter-state from the other, which is exactly why two GSTINs were seeded.
const PUNE = "27AABCT1234F1Z5"; // Maharashtra
const CBE = "33AABCT1234F1Z9"; // Tamil Nadu
const REAL = "27AAAFS9876Q1Z3"; // well-formed AND a valid check digit

/* ------------------------------- identity -------------------------------- */

test("a GSTIN's state code drives everything downstream", () => {
  assert.equal(stateCodeOfGstin(PUNE), "27");
  assert.equal(stateCodeOfGstin(CBE), "33");
  assert.equal(stateCodeOfGstin("99AABCT1234F1Z5"), null); // 99 is not a GST state
});

test("format validation rejects malformed GSTINs", () => {
  assert.equal(isValidGstinFormat(PUNE), true);
  assert.equal(isValidGstinFormat("27AABCT1234F1Z"), false); // 14 chars
  assert.equal(isValidGstinFormat("27aabct1234f1z5"), true); // case-insensitive
  assert.equal(isValidGstinFormat("2AABCT1234F1Z55"), false); // bad state digits
});

test("the check digit is computed, and the demo GSTINs fail it", () => {
  // Recorded deliberately: the canonical demo GSTINs are FICTIONAL. This test documents
  // that fact so nobody later 'fixes' the checksum and breaks the whole demo universe.
  assert.equal(isGstinChecksumValid(REAL), true);
  assert.equal(isGstinChecksumValid(PUNE), false);
  assert.equal(gstinChecksumChar(PUNE.slice(0, 14)), "Q");
});

test("checksum REJECTION is configurable, validation is not", () => {
  assert.equal(validateGstin(PUNE).ok, true); // default config: shape only
  assert.equal(validateGstin(PUNE, { ...DEFAULT_GST_CONFIG, enforceGstinChecksum: true }).ok, false);
  assert.equal(validateGstin(REAL, { ...DEFAULT_GST_CONFIG, enforceGstinChecksum: true }).ok, true);
  assert.equal(validateGstin("nonsense").ok, false);
});

test("HSN must be 4, 6 or 8 digits", () => {
  assert.equal(isValidHsn("8413"), true);
  assert.equal(isValidHsn("841370"), true);
  assert.equal(isValidHsn("84137010"), true);
  assert.equal(isValidHsn("84137"), false);
  assert.equal(isValidHsn("84A370"), false);
});

/* --------------------------- place of supply ------------------------------ */

test("same state is intra-state; different state is inter-state", () => {
  assert.equal(isInterState(PUNE, "27"), false); // Pune -> Maharashtra
  assert.equal(isInterState(PUNE, "29"), true); // Pune -> Karnataka
});

test("the SAME customer is taxed differently from each plant", () => {
  assert.equal(isInterState(PUNE, "33"), true); // Pune  -> Tamil Nadu = IGST
  assert.equal(isInterState(CBE, "33"), false); // C'bat -> Tamil Nadu = CGST+SGST
});

/* ------------------------------ the tax ----------------------------------- */

const line = (over: Partial<TaxableLineInput> = {}): TaxableLineInput => ({
  lineNo: 1,
  qty: 10,
  rate: 1000,
  gstRatePct: 18,
  hsn: "8413",
  ...over,
});

test("intra-state splits the rate in half across CGST and SGST", () => {
  const t = computeLineTax(line(), false);
  assert.equal(t.taxableValue, 10000);
  assert.equal(t.cgst, 900);
  assert.equal(t.sgst, 900);
  assert.equal(t.igst, 0);
  assert.equal(t.lineTotal, 11800);
});

test("inter-state charges the full rate as IGST", () => {
  const t = computeLineTax(line(), true);
  assert.equal(t.igst, 1800);
  assert.equal(t.cgst, 0);
  assert.equal(t.sgst, 0);
  assert.equal(t.lineTotal, 11800);
});

test("a document is never both intra- and inter-state", () => {
  const totals = computeOrderTax({
    supplierGstin: PUNE,
    placeOfSupplyStateCode: "29",
    lines: [line(), line({ lineNo: 2, gstRatePct: 12 })],
  });
  assert.equal(totals.interState, true);
  assert.equal(totals.cgstTotal + totals.sgstTotal, 0);
  assert.ok(totals.igstTotal > 0);
});

test("discount reduces the taxable value before tax", () => {
  const t = computeLineTax(line({ discountPct: 10 }), false);
  assert.equal(t.taxableValue, 9000);
  assert.equal(t.cgst, 810);
});

test("totals are rupee-rounded and the difference is kept as round-off", () => {
  // 3 x 333.33 = 999.99 taxable, 18% = 180.00 -> net 1179.99 -> grand 1180, round-off +0.01
  const totals = computeOrderTax({
    supplierGstin: PUNE,
    placeOfSupplyStateCode: "27",
    lines: [line({ qty: 3, rate: 333.33 })],
  });
  assert.equal(totals.subtotal, 999.99);
  assert.equal(totals.netTotal, 1179.99);
  assert.equal(totals.grandTotal, 1180);
  assert.equal(totals.roundOff, 0.01);
});

test("rate-wise splits are produced for the e-invoice payload", () => {
  const totals = computeOrderTax({
    supplierGstin: PUNE,
    placeOfSupplyStateCode: "27",
    lines: [line(), line({ lineNo: 2, gstRatePct: 12 }), line({ lineNo: 3, gstRatePct: 18 })],
  });
  assert.equal(totals.rateWise.length, 2);
  assert.equal(totals.rateWise[0]!.gstRatePct, 12);
  assert.equal(totals.rateWise[1]!.taxableValue, 20000); // both 18% lines merged
});

test("a bad HSN or an unknown place of supply is refused, never guessed", () => {
  assert.throws(
    () => computeOrderTax({ supplierGstin: PUNE, placeOfSupplyStateCode: "27", lines: [line({ hsn: "84" })] }),
    /HSN/,
  );
  assert.throws(
    () => computeOrderTax({ supplierGstin: PUNE, placeOfSupplyStateCode: "99", lines: [line()] }),
    /not a GST state code/,
  );
});

/* ---------------------- the 1 Aug 2026 ship-to mandate --------------------- */

test("the ship-to mandate switches on at its notified date, from config", () => {
  assert.equal(shipToGstinRequired("2026-07-31"), false);
  assert.equal(shipToGstinRequired("2026-08-01"), true);
  // and the date itself is data, not a constant
  assert.equal(shipToGstinRequired("2026-07-31", { ...DEFAULT_GST_CONFIG, shipToGstinMandatoryFrom: "2026-07-01" }), true);
});

test("after the mandate a registered consignee MUST carry a ship-to GSTIN", () => {
  const before = checkShipToGstin({ docDate: "2026-07-31", shipToIsRegistered: true, shipToGstin: "" });
  assert.equal(before.ok, true);
  const after = checkShipToGstin({ docDate: "2026-08-01", shipToIsRegistered: true, shipToGstin: "" });
  assert.equal(after.ok, false);
  assert.match(after.reason ?? "", /mandatory/);
});

test("an unregistered consignee is satisfied by URP", () => {
  const r = checkShipToGstin({ docDate: "2026-08-01", shipToIsRegistered: false });
  assert.equal(r.ok, true);
  assert.equal(r.value, URP);
});

test("URP is recorded on BOTH sides of the mandate date, never left blank", () => {
  // A field whose meaning changes on 1 Aug is a field somebody forgets to backfill.
  const before = checkShipToGstin({ docDate: "2026-07-25", shipToIsRegistered: false });
  assert.equal(before.value, URP);
});

test("a malformed ship-to GSTIN is refused outright", () => {
  const r = checkShipToGstin({ docDate: "2026-08-01", shipToIsRegistered: true, shipToGstin: "27JUNK" });
  assert.equal(r.ok, false);
});
