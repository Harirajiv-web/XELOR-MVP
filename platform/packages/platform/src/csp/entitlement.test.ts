import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amcRenewalStatus,
  checkEntitlement,
  detectAnomalies,
  type AmcRecord,
  type WarrantyRecord,
} from "./entitlement.js";

const SERIAL = "SR-SFT-26-0452";

const WARRANTY: WarrantyRecord = {
  serialNo: SERIAL,
  warrantyType: "standard_12m",
  startDate: "2026-03-12",
  endDate: "2027-03-12",
  coverageTerms: "Manufacturing defects, parts and labour",
  status: "active",
};

const COMPREHENSIVE: AmcRecord = {
  contractNo: "AMC-2627-0002",
  coverageType: "comprehensive",
  startDate: "2025-09-01",
  endDate: "2026-08-31",
  entitlements: { visitsPerYear: 4, responseMins: 240, partsIncluded: true },
  status: "active",
  coveredSerials: [SERIAL],
};

const NON_COMPREHENSIVE: AmcRecord = {
  ...COMPREHENSIVE,
  contractNo: "AMC-2627-0005",
  coverageType: "non_comprehensive",
  entitlements: { visitsPerYear: 2, partsIncluded: false },
  startDate: "2026-04-01",
  endDate: "2027-03-31",
};

/* --------------------------------- verdicts -------------------------------- */

test("an in-date warranty covers the claim, with the dates in the reason", () => {
  const r = checkEntitlement({ serialNo: SERIAL, onDate: "2026-07-18", warranty: WARRANTY, amc: null });
  assert.equal(r.verdict, "covered_warranty");
  assert.equal(r.partsChargeable, false);
  assert.equal(r.warrantyExpiresOn, "2027-03-12");
  assert.match(r.summary, /Covered under warranty until 2027-03-12/);
});

test("an expired warranty is not covered, and says when it ran out", () => {
  const r = checkEntitlement({
    serialNo: SERIAL,
    onDate: "2027-06-01",
    warranty: WARRANTY,
    amc: null,
  });
  assert.equal(r.verdict, "not_covered");
  assert.equal(r.partsChargeable, true);
  assert.match(r.reasons.join(" "), /expired on 2027-03-12/);
});

test("a comprehensive AMC outranks the standard warranty — it is what the customer paid extra for", () => {
  const r = checkEntitlement({ serialNo: SERIAL, onDate: "2026-07-18", warranty: WARRANTY, amc: COMPREHENSIVE });
  assert.equal(r.verdict, "covered_amc");
  assert.equal(r.partsChargeable, false);
  assert.match(r.reasons.join(" "), /Standard warranty also runs to 2027-03-12/, "the lesser cover is still reported");
});

test("a non-comprehensive AMC is PARTIAL — telling the customer 'covered' would be wrong", () => {
  const r = checkEntitlement({ serialNo: SERIAL, onDate: "2026-07-18", warranty: null, amc: NON_COMPREHENSIVE });
  assert.equal(r.verdict, "partial");
  assert.equal(r.partsChargeable, true);
  assert.match(r.summary, /visit and labour included, parts chargeable/);
});

test("an AMC that does not list the serial does not cover the serial", () => {
  const r = checkEntitlement({
    serialNo: "SR-OTHER-99",
    onDate: "2026-07-18",
    warranty: null,
    amc: COMPREHENSIVE,
  });
  assert.equal(r.verdict, "not_covered");
  assert.match(r.reasons.join(" "), /does not list this serial/);
});

test("a serial with nothing at all against it says so plainly", () => {
  const r = checkEntitlement({ serialNo: "SR-UNKNOWN", onDate: "2026-07-18", warranty: null, amc: null });
  assert.equal(r.verdict, "not_covered");
  assert.match(r.reasons.join(" "), /No warranty record exists/);
  assert.match(r.summary, /chargeable/);
});

test("the claim is judged on the DATE OF FAILURE, not on today", () => {
  // Reported today, but the failure happened while the warranty was live.
  const r = checkEntitlement({ serialNo: SERIAL, onDate: "2027-03-01", warranty: WARRANTY, amc: null });
  assert.equal(r.verdict, "covered_warranty");
});

/* -------------------------------- anomalies -------------------------------- */

test("a claim dated before the machine was dispatched is flagged, not silently refused", () => {
  const r = checkEntitlement({
    serialNo: SERIAL,
    onDate: "2026-02-01",
    warranty: WARRANTY,
    amc: null,
    dispatchedOn: "2026-03-12",
  });
  assert.equal(r.anomalies[0]!.code, "claim_before_dispatch");
  assert.equal(r.verdict, "not_covered", "the warranty had not started — the verdict stands on its own");
  assert.match(r.reasons.join(" "), /Anomaly:/);
});

test("two live warranty records for one serial means somebody should look", () => {
  const a = detectAnomalies({
    serialNo: SERIAL,
    onDate: "2026-07-18",
    warranty: WARRANTY,
    amc: null,
    allWarrantiesForSerial: [WARRANTY, { ...WARRANTY, startDate: "2026-05-01", endDate: "2027-05-01" }],
  });
  assert.equal(a[0]!.code, "serial_reused");
  assert.match(a[0]!.detail, /2 active warranty records/);
});

test("an anomaly never silently flips a good verdict — a data-entry error is not fraud", () => {
  const r = checkEntitlement({
    serialNo: SERIAL,
    onDate: "2026-07-18",
    warranty: WARRANTY,
    amc: null,
    allWarrantiesForSerial: [WARRANTY, { ...WARRANTY, startDate: "2026-05-01" }],
  });
  assert.equal(r.verdict, "covered_warranty", "flagged for a human, still covered");
  assert.equal(r.anomalies.length, 1);
});

test("a warranty whose dates are back to front is caught", () => {
  const a = detectAnomalies({
    serialNo: SERIAL,
    onDate: "2026-07-18",
    warranty: { ...WARRANTY, startDate: "2027-03-12", endDate: "2026-03-12" },
    amc: null,
  });
  assert.ok(a.some((x) => x.code === "warranty_starts_after_end"));
});

/* ------------------------------ AMC renewal -------------------------------- */

test("an AMC inside the lead window flips to expiring and emits a renewal lead exactly once", () => {
  const first = amcRenewalStatus({ endDate: "2026-08-31", status: "active" }, "2026-07-18");
  assert.equal(first.status, "expiring");
  assert.equal(first.daysToExpiry, 44);
  assert.equal(first.shouldEmitLead, true);

  const second = amcRenewalStatus({ endDate: "2026-08-31", status: "expiring" }, "2026-07-19");
  assert.equal(second.shouldEmitLead, false, "the lead goes to SMBD once, not nightly for two months");
});

test("outside the window nothing happens; past the end date it is simply expired", () => {
  assert.equal(amcRenewalStatus({ endDate: "2027-03-31", status: "active" }, "2026-07-18").status, "active");
  assert.equal(amcRenewalStatus({ endDate: "2026-06-30", status: "active" }, "2026-07-18").status, "expired");
  assert.equal(amcRenewalStatus({ endDate: "2026-06-30", status: "active" }, "2026-07-18").shouldEmitLead, false);
});

test("a cancelled or already-renewed contract is left alone", () => {
  assert.equal(amcRenewalStatus({ endDate: "2026-08-31", status: "cancelled" }, "2026-07-18").shouldEmitLead, false);
  assert.equal(amcRenewalStatus({ endDate: "2026-08-31", status: "renewed" }, "2026-07-18").status, "renewed");
});
