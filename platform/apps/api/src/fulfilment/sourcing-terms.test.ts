import { test } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "@ind-core/platform";
import { buildTermsCsv, parseSupplierTerms, toBase64, type UploadedSupplierTerm } from "./sourcing-terms.js";

/**
 * The claim under test: a supplier price list written by a person parses, and one that is
 * wrong is REFUSED rather than partly imported.
 *
 * The second half is the one that matters. A price list with three unreadable lines is a
 * file somebody exported wrongly; quietly sourcing from the seven that parsed produces a
 * plan missing a supplier for no visible reason, which is the worst of both outcomes.
 */

const sheet = (text: string) => parseSupplierTerms(toBase64(text));

const ROW = (over: Partial<UploadedSupplierTerm> = {}): UploadedSupplierTerm => ({
  itemCode: "CMP-CAS50",
  vendorCode: "V-MER-01",
  vendorName: "Meridian Metals & Alloys",
  unitPrice: 530,
  leadTimeDays: 12,
  reliability: 0.85,
  capacityUnits: 10_000,
  qualified: true,
  ...over,
});

test("a plain price list parses into quoted terms", () => {
  const parsed = sheet(
    "item_code,vendor_code,vendor_name,unit_price,lead_time_days,reliability,capacity_units,qualified\n" +
    "CMP-CAS50,V-MER-01,Meridian Metals,530,12,88,5000,yes\n" +
    "CMP-SFT20,V-ATL-01,Atlas Alloys,610,9,94,5000,yes\n",
  );
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.itemCodes, ["CMP-CAS50", "CMP-SFT20"]);
  assert.equal(parsed.rows[0]!.unitPrice, 530);
  assert.equal(parsed.rows[0]!.leadTimeDays, 12);
  // 88 is a percentage; the planner wants a fraction.
  assert.equal(parsed.rows[0]!.reliability, 0.88);
});

test("headings as a person writes them are accepted", () => {
  const parsed = sheet(
    "Part No,Supplier Code,Supplier Name,Price,Lead time (days),On-time %\n" +
    "CMP-CAS50,V-MER-01,Meridian Metals,\"₹ 1,850.00\",18,92\n",
  );
  assert.equal(parsed.rows.length, 1);
  // Rupee sign and thousands separator stripped: this is what an emailed price list holds.
  assert.equal(parsed.rows[0]!.unitPrice, 1850);
  assert.equal(parsed.rows[0]!.reliability, 0.92);
});

test("a missing required column is refused, naming the spellings that would work", () => {
  assert.throws(
    () => sheet("item_code,vendor_code,lead_time_days\nCMP-CAS50,V-MER-01,12\n"),
    (e: unknown) => e instanceof AppError && /unitPrice/.test(JSON.stringify(e)),
  );
});

test("one unreadable row refuses the whole file, with the spreadsheet's own row number", () => {
  assert.throws(
    () =>
      sheet(
        "item_code,vendor_code,unit_price,lead_time_days\n" +
        "CMP-CAS50,V-MER-01,530,12\n" +
        "CMP-SFT20,V-ATL-01,about six hundred,9\n",
      ),
    (e: unknown) => e instanceof AppError && /row 3/.test(JSON.stringify(e)),
  );
});

test("a file with a header and no rows is refused rather than treated as 'no suppliers'", () => {
  assert.throws(
    () => sheet("item_code,vendor_code,unit_price,lead_time_days\n"),
    (e: unknown) => e instanceof AppError && /no data rows/.test(JSON.stringify(e)),
  );
});

test("no capacity column means unlimited, not zero", () => {
  // A zero would make every candidate infeasible for a reason the file never stated.
  const parsed = sheet("item_code,vendor_code,unit_price,lead_time_days\nCMP-CAS50,V-MER-01,530,12\n");
  assert.equal(parsed.rows[0]!.capacityUnits, Number.MAX_SAFE_INTEGER);
  assert.equal(parsed.rows[0]!.qualified, true);
});

test("what this build generates is what this build reads back", () => {
  // The scenario's generated file and a real upload go through the same parser. If that
  // ever stops being true, the demo stops proving anything about the upload path.
  const rows = [ROW(), ROW({ itemCode: "CMP-SEAL20", vendorCode: "V-DEC-01", vendorName: "Deccan Seals, Pune", unitPrice: 1180, leadTimeDays: 4 })];
  const parsed = sheet(buildTermsCsv(rows));
  assert.equal(parsed.rows.length, 2);
  // The vendor name with a comma in it did not shift every column after it.
  assert.equal(parsed.rows[1]!.vendorName, "Deccan Seals, Pune");
  assert.equal(parsed.rows[1]!.unitPrice, 1180);
  assert.equal(parsed.rows[0]!.reliability, 0.85);
});

test("the same file twice hashes the same, so a re-upload is one source and not two", () => {
  const csv = buildTermsCsv([ROW()]);
  assert.equal(sheet(csv).bytesHash, sheet(csv).bytesHash);
  assert.notEqual(sheet(csv).bytesHash, sheet(buildTermsCsv([ROW({ unitPrice: 531 })])).bytesHash);
});
