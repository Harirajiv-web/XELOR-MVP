import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { inferSheetHeaders, sheetRows } from "@ind-core/platform";
import { MAX_FILE_BYTES, decodeWorkbook, sheetByName } from "./workbook.js";

/**
 * The decoding half. Everything these tests protect was found by running a real file
 * through the endpoint, not by reasoning about the format — which is why the encoding and
 * the type-guessing cases are here and not left to the parser's defaults.
 */

const b64 = (value: string | Buffer): string =>
  (typeof value === "string" ? Buffer.from(value, "utf8") : value).toString("base64");

function xlsxOf(rows: unknown[][], sheetName = "Sheet1"): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), sheetName);
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("workbook decoding", () => {
  it("reads a CSV as UTF-8 so a rupee sign survives", () => {
    // Left to the parser's codepage guess this arrived as "â¹ 3 50 000", and the number
    // coercion downstream then refused a perfectly good credit limit.
    const book = decodeWorkbook(b64("Code,Limit\nCUST-1,₹ 3 50 000\n"));
    const rows = sheetRows(book.sheets[0]!.matrix, inferSheetHeaders(book.sheets[0]!.matrix));
    assert.equal(rows[0]!.cells.Limit, "₹ 3 50 000");
  });

  it("strips the byte-order mark Excel writes on a UTF-8 CSV export", () => {
    // Left in place the BOM becomes part of the first column's NAME, and that column then
    // matches no field on any target — an import that fails for an invisible reason.
    const book = decodeWorkbook(b64("﻿Code,Name\nCUST-1,Acme\n"));
    const header = inferSheetHeaders(book.sheets[0]!.matrix);
    assert.deepEqual(header.headers, ["Code", "Name"]);
  });

  it("does not let the CSV parser guess at dates", () => {
    // THE bug this flag exists for: SheetJS reads 03/04/2026 as 4 March (month-first), and
    // by the time the value reaches the validator the original text is gone, so the
    // day-first rule this product is sold under cannot be applied and the ambiguity cannot
    // even be reported. Cells must arrive as the text the file contains.
    const book = decodeWorkbook(b64("Date\n03/04/2026\n"));
    const rows = sheetRows(book.sheets[0]!.matrix, inferSheetHeaders(book.sheets[0]!.matrix));
    assert.equal(rows[0]!.cells.Date, "03/04/2026");
  });

  it("reads a real .xlsx, every sheet of it", () => {
    const bytes = xlsxOf([["Part No", "Qty"], ["PMP-CP50", 7]], "Stock");
    const book = decodeWorkbook(b64(bytes));
    assert.equal(book.fileKind, "xlsx");
    assert.deepEqual(book.sheets.map((s) => s.name), ["Stock"]);
    const rows = sheetRows(book.sheets[0]!.matrix, inferSheetHeaders(book.sheets[0]!.matrix));
    assert.equal(rows[0]!.cells["Part No"], "PMP-CP50");
    assert.equal(rows[0]!.cells.Qty, 7);
  });

  it("decides the file kind from the bytes, never from the extension", () => {
    // A .csv saved as .xls because that is what the accounts package offered is a file this
    // has to read rather than argue with.
    assert.equal(decodeWorkbook(b64("a,b\n1,2\n")).fileKind, "csv");
  });

  it("accepts a data URL, because that is what FileReader produces", () => {
    const book = decodeWorkbook(`data:text/csv;base64,${b64("a,b\n1,2\n")}`);
    assert.equal(book.sheets.length, 1);
  });

  it("refuses an oversized file with the limit in words", () => {
    const big = "x".repeat(MAX_FILE_BYTES + 1024);
    assert.throws(
      () => decodeWorkbook(b64(big)),
      (error: unknown) => {
        const e = error as { code?: string; httpStatus?: number; message?: string };
        assert.equal(e.code, "IMPORT_FILE_TOO_LARGE");
        assert.equal(e.httpStatus, 413);
        assert.match(e.message ?? "", /64 KB/);
        return true;
      },
    );
  });

  it("names the sheets that exist when asked for one that does not", () => {
    const book = decodeWorkbook(b64(xlsxOf([["a"]], "Stock")));
    assert.throws(
      () => sheetByName(book, "Notes"),
      (error: unknown) => {
        assert.match((error as Error).message ?? "", /validation/i);
        const details = (error as { details?: { message: string }[] }).details ?? [];
        assert.match(details[0]!.message, /This file has: Stock/);
        return true;
      },
    );
  });

  it("refuses an empty body rather than reporting an empty spreadsheet", () => {
    assert.throws(() => decodeWorkbook(""), /validation/i);
  });
});

describe("refusing files that are not spreadsheets", () => {

it("random bytes named .xlsx are refused, not read as a CSV header", () => {
  // Regression: 200 random bytes returned HTTP 200 with a mojibake column heading, and the
  // wizard then offered that heading as something to map "Customer name" onto.
  const junk = Buffer.from([0x1b, 0x2a, 0x6e, 0xc3, 0x00, 0x28, 0x3c, 0x53, 0x91, 0x46,
                            0x47, 0x6d, 0x00, 0x2b, 0x38, 0x60, 0x7d, 0x17, 0xc9, 0x89]);
  assert.throws(() => decodeWorkbook(junk.toString("base64")), /not a spreadsheet/i);
});

it("Tamil and Devanagari headings still read — the guard must not reject Indic text", () => {
  // The reason the check runs on decoded text rather than raw bytes: a byte-level test for
  // the high bit would reject exactly the customers this product is built for.
  const csv = "வாடிக்கையாளர்,ग्राहक का नाम,मूल्य (₹)\nA-1,परीक्षण,1200\n";
  const wb = decodeWorkbook(Buffer.from(csv, "utf8").toString("base64"));
  assert.equal(wb.fileKind, "csv");
  assert.deepEqual(inferSheetHeaders(wb.sheets[0]!.matrix).headers, ["வாடிக்கையாளர்", "ग्राहक का नाम", "मूल्य (₹)"]);
});
});
