import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideLotVerdict,
  evaluateReading,
  resolveSampling,
  type SamplingPlan,
} from "./sampling.js";

/** A trimmed ISO 2859-1 General Level II / AQL 1.0 style table, as configuration. */
const ISO: SamplingPlan = {
  code: "AQL-1.0-II",
  standard: "iso_2859_1_style",
  aql: 1.0,
  inspectionLevel: "II",
  planTable: [
    { lotFrom: 2, lotTo: 8, codeLetter: "A", n: 2, ac: 0, re: 1 },
    { lotFrom: 9, lotTo: 15, codeLetter: "B", n: 3, ac: 0, re: 1 },
    { lotFrom: 16, lotTo: 25, codeLetter: "C", n: 5, ac: 0, re: 1 },
    { lotFrom: 26, lotTo: 50, codeLetter: "D", n: 8, ac: 0, re: 1 },
    { lotFrom: 51, lotTo: 90, codeLetter: "E", n: 13, ac: 0, re: 1 },
    { lotFrom: 91, lotTo: 150, codeLetter: "F", n: 20, ac: 1, re: 2 },
    { lotFrom: 151, lotTo: 280, codeLetter: "G", n: 32, ac: 1, re: 2 },
    { lotFrom: 281, lotTo: 500, codeLetter: "H", n: 50, ac: 2, re: 3 },
  ],
};

/* ------------------------------- how many -------------------------------- */

test("lot size selects the band, not a supervisor's habit", () => {
  assert.equal(resolveSampling(ISO, 100).sampleSize, 20);
  assert.equal(resolveSampling(ISO, 200).sampleSize, 32);
  assert.equal(resolveSampling(ISO, 300).sampleSize, 50);
});

test("accept and reject numbers come from the band", () => {
  const r = resolveSampling(ISO, 300);
  assert.equal(r.acceptNumber, 2);
  assert.equal(r.rejectNumber, 3);
  assert.equal(r.codeLetter, "H");
});

test("the derivation is stored in words, so an auditor can re-check it", () => {
  const r = resolveSampling(ISO, 100);
  assert.match(r.rationale, /AQL 1/);
  assert.match(r.rationale, /91-150/);
  assert.match(r.rationale, /sample 20/);
});

test("the sample never exceeds the lot", () => {
  // Band D asks for 8, but there are only 30 pieces... and band A asks for 2 of a lot of 2.
  assert.equal(resolveSampling(ISO, 30).sampleSize, 8);
  assert.equal(resolveSampling({ ...ISO, code: "X" }, 2).sampleSize, 2);
  assert.equal(resolveSampling({ code: "F5", standard: "fixed_n", fixedN: 5 }, 3).sampleSize, 3);
});

test("a lot size outside every band is an error, never a silent guess", () => {
  assert.throws(() => resolveSampling(ISO, 5000), /no band covering lot size 5000/);
});

test("percentage plans round the sample UP", () => {
  const plan: SamplingPlan = { code: "P10", standard: "percentage", percentage: 10 };
  assert.equal(resolveSampling(plan, 11).sampleSize, 2); // 1.1 -> 2
  assert.equal(resolveSampling(plan, 100).sampleSize, 10);
});

test("100% and c=0 plans never accept a defective", () => {
  const full = resolveSampling({ code: "ALL", standard: "hundred_percent" }, 40);
  assert.equal(full.sampleSize, 40);
  assert.equal(full.acceptNumber, 0);
  const cz = resolveSampling({ code: "CZ", standard: "c_equals_zero", planTable: ISO.planTable }, 100);
  assert.equal(cz.acceptNumber, 0);
  assert.equal(cz.rejectNumber, 1);
});

/* ----------------------------- is it good -------------------------------- */

test("a reading inside both limits passes with no deviation", () => {
  assert.deepEqual(evaluateReading(50.01, { usl: 50.05, lsl: 49.95 }), {
    withinSpec: true,
    deviation: 0,
  });
});

test("deviation is the signed distance outside the nearer limit", () => {
  assert.deepEqual(evaluateReading(50.08, { usl: 50.05, lsl: 49.95 }), {
    withinSpec: false,
    deviation: 0.03,
  });
  assert.deepEqual(evaluateReading(49.9, { usl: 50.05, lsl: 49.95 }), {
    withinSpec: false,
    deviation: -0.05,
  });
});

test("exactly on the limit is IN spec", () => {
  assert.equal(evaluateReading(50.05, { usl: 50.05, lsl: 49.95 }).withinSpec, true);
  assert.equal(evaluateReading(49.95, { usl: 50.05, lsl: 49.95 }).withinSpec, true);
});

test("a one-sided limit leaves the other side unbounded", () => {
  assert.equal(evaluateReading(0.2, { usl: 1.6, lsl: null }).withinSpec, true);
  assert.equal(evaluateReading(2.0, { usl: 1.6, lsl: null }).withinSpec, false);
});

/* ------------------------------ is the lot ------------------------------- */

const r = (sampleNo: number, withinSpec: boolean, defectClass = "major") => ({
  sampleNo,
  withinSpec,
  defectClass,
});

test("defectives within the accept number accept the lot", () => {
  const d = decideLotVerdict({
    readings: [r(1, true), r(2, true), r(3, false)],
    sampleSize: 20,
    acceptNumber: 1,
    rejectNumber: 2,
  });
  assert.equal(d.verdict, "accepted");
  assert.equal(d.defectiveSamples, 1);
});

test("reaching the reject number rejects the lot", () => {
  const d = decideLotVerdict({
    readings: [r(1, false), r(2, false), r(3, true)],
    sampleSize: 20,
    acceptNumber: 1,
    rejectNumber: 2,
  });
  assert.equal(d.verdict, "rejected");
  assert.equal(d.defectiveSamples, 2);
});

test("one piece failing two characteristics is ONE defective piece", () => {
  const d = decideLotVerdict({
    readings: [r(1, false), r(1, false), r(2, true)],
    sampleSize: 20,
    acceptNumber: 1,
    rejectNumber: 2,
  });
  assert.equal(d.defectiveSamples, 1);
  assert.equal(d.verdict, "accepted");
});

test("a CRITICAL defect rejects the lot even inside the accept number", () => {
  const d = decideLotVerdict({
    readings: [r(1, false, "critical")],
    sampleSize: 50,
    acceptNumber: 2,
    rejectNumber: 3,
  });
  assert.equal(d.verdict, "rejected");
  assert.match(d.rationale, /CRITICAL/);
});

test("a clean sample accepts and says so", () => {
  const d = decideLotVerdict({
    readings: [r(1, true), r(2, true)],
    sampleSize: 8,
    acceptNumber: 0,
    rejectNumber: 1,
  });
  assert.equal(d.verdict, "accepted");
  assert.match(d.rationale, /0 defective/);
});
