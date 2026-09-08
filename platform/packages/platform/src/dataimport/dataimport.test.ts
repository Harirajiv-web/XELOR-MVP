import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyColumnMapping,
  columnLetter,
  displayCells,
  groupImportRows,
  importTarget,
  inferSheetHeaders,
  isoFromDate,
  sheetRows,
  suggestColumnMapping,
  unmappedColumns,
  unmappedRequiredFields,
  validateImportRow,
  type SheetMatrix,
} from "./index.js";

const customers = importTarget("customers")!;
const items = importTarget("items")!;
const orders = importTarget("sales_orders")!;

describe("header inference", () => {
  it("skips a title row and a blank row to find the real header", () => {
    // The exact shape of a file exported from a plant's own template: a merged title, a
    // blank spacer, then the columns. Taking row 1 on faith names every column after the
    // title and the operator concludes the software is broken.
    const matrix: SheetMatrix = [
      ["CUSTOMER MASTER - JULY 2026", null, null],
      [null, null, null],
      ["Customer Code", "Customer Name", "GST No"],
      ["CUST-BAC", "Bharat Auto Components", "27AAACB2233K1Z9"],
    ];
    const header = inferSheetHeaders(matrix);
    assert.equal(header.headerRowIndex, 2);
    assert.deepEqual(header.headers, ["Customer Code", "Customer Name", "GST No"]);
  });

  it("does not choose a row of numbers as the header", () => {
    const matrix: SheetMatrix = [
      [1, 2, 3],
      ["Item Code", "Name", "Qty"],
      ["PMP-CP50", "Pump", 12],
    ];
    // Both rows are three cells wide, so width alone cannot decide. A header is text.
    assert.equal(inferSheetHeaders(matrix).headerRowIndex, 1);
  });

  it("names a blank heading after its spreadsheet column and de-duplicates repeats", () => {
    const matrix: SheetMatrix = [["Code", null, "Name", "Name"], ["A", "x", "B", "C"]];
    assert.deepEqual(inferSheetHeaders(matrix).headers, [
      "Code",
      "Column B",
      "Name",
      "Name (2)",
    ]);
  });

  it("reports an empty sheet rather than inventing a header for it", () => {
    const header = inferSheetHeaders([[null, null], []]);
    assert.equal(header.headerRowIndex, -1);
    assert.deepEqual(sheetRows([[null, null], []], header), []);
  });

  it("counts column letters past Z", () => {
    assert.equal(columnLetter(0), "A");
    assert.equal(columnLetter(25), "Z");
    assert.equal(columnLetter(26), "AA");
    assert.equal(columnLetter(27), "AB");
  });
});

describe("rows", () => {
  const matrix: SheetMatrix = [
    ["Code", "Name"],
    ["CUST-BAC", "Bharat Auto"],
    [null, null],
    ["CUST-BLO", "BlueOrbit"],
  ];

  it("quotes the spreadsheet row number, not the index of the record", () => {
    const rows = sheetRows(matrix, inferSheetHeaders(matrix));
    assert.deepEqual(
      rows.map((r) => r.rowNo),
      [2, 4],
      "the blank row is skipped but must not shift the numbers of the rows after it",
    );
  });

  it("renders dates and nulls for the preview without every caller re-deciding", () => {
    // Constructed at LOCAL midnight, which is what a spreadsheet library produces for a
    // date cell. Reading it back with toISOString() reported the previous day everywhere
    // ahead of UTC — every date in every imported file, silently, in India.
    const rows = sheetRows(
      [
        ["Date", "Note"],
        [new Date(2026, 6, 20), null],
      ],
      { headerRowIndex: 0, headers: ["Date", "Note"] },
    );
    assert.deepEqual(displayCells(rows[0]!), { Date: "2026-07-20", Note: "" });
  });

  it("reads a date cell by its local calendar components, in any time zone", () => {
    // A date cell never carried a time zone, so 20 July must stay 20 July whether this
    // process runs in Mumbai or Chicago.
    assert.equal(isoFromDate(new Date(2026, 6, 20)), "2026-07-20");
    assert.equal(isoFromDate(new Date(2026, 0, 1, 23, 59)), "2026-01-01");
  });
});

describe("column mapping", () => {
  it("matches a plant's own header spellings to fields", () => {
    const mapping = suggestColumnMapping(
      ["Part No.", "Item Name", "Type", "UOM", "Std Cost"],
      items,
    );
    assert.equal(mapping.itemCode, "Part No.");
    assert.equal(mapping.name, "Item Name");
    assert.equal(mapping.itemType, "Type");
    assert.equal(mapping.uom, "UOM");
    assert.equal(mapping.standardCost, "Std Cost");
  });

  it("does not give one column to two fields", () => {
    // "Code" could be the customer code or nothing else; it must not also become the name.
    const mapping = suggestColumnMapping(["Code", "Name"], customers);
    const used = Object.values(mapping);
    assert.equal(new Set(used).size, used.length);
  });

  it("prefers an exact match over a containment match", () => {
    // The trap this ordering exists for: "GST %" contains "gst", and a contains-first
    // matcher maps the tax rate onto the GSTIN field, which then fails validation for a
    // reason that looks nothing like the real mistake.
    const mapping = suggestColumnMapping(
      ["Customer Code", "PO No", "Our GSTIN", "Item Code", "Qty", "Rate", "HSN", "GST %"],
      orders,
    );
    assert.equal(mapping.supplierGstin, "Our GSTIN");
    assert.equal(mapping.gstRatePct, "GST %");
  });

  it("leaves a required field unmapped rather than attaching the nearest column", () => {
    const mapping = suggestColumnMapping(["Something Else"], customers);
    assert.deepEqual([...unmappedRequiredFields(customers, mapping)].sort(), ["code", "name"]);
  });

  it("reports columns the mapping ignores", () => {
    const mapping = suggestColumnMapping(["Code", "Name", "Salesman"], customers);
    assert.deepEqual(unmappedColumns(["Code", "Name", "Salesman"], mapping), ["Salesman"]);
  });

  it("reads a row through the mapping into target fields", () => {
    const row = { rowNo: 2, cells: { "Part No.": "PMP-CP50", Junk: "ignore me" } };
    assert.deepEqual(applyColumnMapping(row, { itemCode: "Part No." }), {
      itemCode: "PMP-CP50",
    });
  });
});

describe("row validation", () => {
  it("accepts a number a human typed, commas and rupee sign included", () => {
    const r = validateImportRow(customers, {
      code: "CUST-BAC",
      name: "Bharat Auto Components",
      creditLimit: "₹ 25,00,000.50",
    });
    assert.equal(r.ok, true);
    assert.equal(r.values.creditLimit, 2500000.5);
  });

  it("reads accounting parentheses as a negative", () => {
    const stock = importTarget("stock_opening")!;
    const r = validateImportRow(stock, {
      itemCode: "PMP-CP50",
      warehouseCode: "WH-ACC",
      qty: "(12)",
    });
    assert.equal(r.values.qty, -12);
  });

  it("refuses a quantity with words in it instead of guessing at the number", () => {
    const stock = importTarget("stock_opening")!;
    const r = validateImportRow(stock, {
      itemCode: "PMP-CP50",
      warehouseCode: "WH-ACC",
      qty: "approx 1200",
    });
    assert.equal(r.ok, false);
    const issue = r.issues.find((i) => i.field === "qty")!;
    assert.equal(issue.kind, "format");
    assert.equal(issue.value, "approx 1200", "the offending text is quoted back");
    assert.equal(r.values.qty, undefined, "nothing is substituted for an unreadable number");
  });

  it("names every problem in the row, not just the first", () => {
    const r = validateImportRow(items, { itemCode: "", name: "", itemType: "widget", uom: "" });
    assert.deepEqual(
      r.issues.map((i) => i.field).sort(),
      ["itemCode", "itemType", "name", "uom"],
      "one upload-fix-upload cycle per bad column is how an operator loses faith in the import",
    );
  });

  it("matches an enum however it was capitalised or spaced", () => {
    const r = validateImportRow(items, {
      itemCode: "PMP-CP50",
      name: "Pump",
      itemType: "Finished Good",
      uom: "nos",
    });
    assert.equal(r.ok, true);
    assert.equal(r.values.itemType, "finished_good");
  });

  it("says which values are allowed when one is not", () => {
    const r = validateImportRow(items, {
      itemCode: "X",
      name: "Y",
      itemType: "widget",
      uom: "nos",
    });
    const issue = r.issues.find((i) => i.field === "itemType")!;
    assert.equal(issue.kind, "not_allowed");
    assert.match(issue.message, /finished_good/);
  });

  it("treats a missing required field differently from an unreadable one", () => {
    const r = validateImportRow(customers, { code: "", name: "Bharat" });
    assert.equal(r.issues[0]!.kind, "missing");
  });

  it("leaves an absent optional field off the payload entirely", () => {
    const r = validateImportRow(customers, { code: "C1", name: "N", gstin: "" });
    assert.equal("gstin" in r.values, false, "an absent field must not become an explicit null");
  });

  it("reads a slash date day-first and flags it when month-first would differ", () => {
    const r = validateImportRow(orders, {
      customerCode: "CUST-BAC",
      custPoNo: "PO-1",
      supplierGstin: "27AABCT1234F1Z5",
      itemCode: "PMP-CP50",
      qty: 10,
      rate: 100,
      hsn: "8413",
      gstRatePct: 18,
      orderDate: "03/04/2026",
    });
    assert.equal(r.values.orderDate, "2026-04-03");
    const flagged = r.issues.find((i) => i.field === "orderDate")!;
    assert.equal(flagged.kind, "ambiguous");
    assert.equal(r.ok, true, "an ambiguous date is reported, not refused");
  });

  it("does not flag a slash date that can only be read one way", () => {
    const r = validateImportRow(orders, {
      customerCode: "CUST-BAC",
      custPoNo: "PO-1",
      supplierGstin: "27AABCT1234F1Z5",
      itemCode: "PMP-CP50",
      qty: 10,
      rate: 100,
      hsn: "8413",
      gstRatePct: 18,
      orderDate: "20/07/2026",
    });
    assert.equal(r.values.orderDate, "2026-07-20");
    assert.equal(r.issues.length, 0);
  });

  it("reads the product's own DD-MMM-YYYY display format", () => {
    const r = validateImportRow(orders, {
      customerCode: "C",
      custPoNo: "P",
      supplierGstin: "27AABCT1234F1Z5",
      itemCode: "I",
      qty: 1,
      rate: 1,
      hsn: "8413",
      gstRatePct: 18,
      requestedDeliveryDate: "20-Jul-2026",
    });
    assert.equal(r.values.requestedDeliveryDate, "2026-07-20");
  });

  it("reads an Excel date serial, including the 1900 leap-year offset", () => {
    const r = validateImportRow(orders, {
      customerCode: "C",
      custPoNo: "P",
      supplierGstin: "27AABCT1234F1Z5",
      itemCode: "I",
      qty: 1,
      rate: 1,
      hsn: "8413",
      gstRatePct: 18,
      orderDate: 46223,
    });
    assert.equal(r.values.orderDate, "2026-07-20");
  });

  it("refuses 31 February rather than rolling it into March", () => {
    const r = validateImportRow(orders, {
      customerCode: "C",
      custPoNo: "P",
      supplierGstin: "27AABCT1234F1Z5",
      itemCode: "I",
      qty: 1,
      rate: 1,
      hsn: "8413",
      gstRatePct: 18,
      orderDate: "31-02-2026",
    });
    assert.equal(r.ok, false);
    assert.equal(r.issues.find((i) => i.field === "orderDate")!.kind, "format");
  });

  it("reads yes/no as a boolean and refuses anything else", () => {
    const ok = validateImportRow(items, {
      itemCode: "X", name: "Y", itemType: "component", uom: "nos", isPurchasable: "Yes",
    });
    assert.equal(ok.values.isPurchasable, true);
    const bad = validateImportRow(items, {
      itemCode: "X", name: "Y", itemType: "component", uom: "nos", isPurchasable: "maybe",
    });
    assert.equal(bad.ok, false);
  });

  it("enforces the same length limit the domain endpoint enforces", () => {
    const r = validateImportRow(customers, { code: "C", name: "x".repeat(201) });
    assert.equal(r.issues.find((i) => i.field === "name")!.kind, "range");
  });

  it("enforces a numeric ceiling — 30% GST is not a rate this country has", () => {
    const r = validateImportRow(orders, {
      customerCode: "C", custPoNo: "P", supplierGstin: "27AABCT1234F1Z5",
      itemCode: "I", qty: 1, rate: 1, hsn: "8413", gstRatePct: 30,
    });
    assert.equal(r.issues.find((i) => i.field === "gstRatePct")!.kind, "range");
  });
});

describe("grouping rows into documents", () => {
  const row = (rowNo: number, values: Record<string, unknown>) => ({ rowNo, values });

  it("gives a master one group per row", () => {
    const groups = groupImportRows(customers, [row(2, { code: "A" }), row(3, { code: "B" })]);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map((g) => g.rows.length), [1, 1]);
  });

  it("folds repeated header values into one order with many lines", () => {
    const groups = groupImportRows(orders, [
      row(2, { customerCode: "CUST-BAC", custPoNo: "PO-77", itemCode: "A", qty: 10 }),
      row(3, { customerCode: "CUST-BAC", custPoNo: "PO-77", itemCode: "B", qty: 5 }),
      row(4, { customerCode: "CUST-BLO", custPoNo: "PO-88", itemCode: "A", qty: 2 }),
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0]!.rows.length, 2);
    assert.equal(groups[0]!.header.custPoNo, "PO-77");
    assert.equal(groups[1]!.rows.length, 1);
  });

  it("treats a case difference in the key as the same document", () => {
    const groups = groupImportRows(orders, [
      row(2, { customerCode: "CUST-BAC", custPoNo: "PO-77" }),
      row(3, { customerCode: "cust-bac", custPoNo: "po-77" }),
    ]);
    assert.equal(groups.length, 1, "two orders for one PO number is the failure this prevents");
  });

  it("refuses a group whose rows disagree about the document", () => {
    const groups = groupImportRows(orders, [
      row(2, { customerCode: "CUST-BAC", custPoNo: "PO-77", orderDate: "2026-07-20" }),
      row(3, { customerCode: "CUST-BAC", custPoNo: "PO-77", orderDate: "2026-07-25" }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.conflicts.length, 1);
    assert.match(groups[0]!.conflicts[0]!.message, /Rows 2 and 3/);
  });

  it("keeps groups in the order the file presents them", () => {
    const groups = groupImportRows(orders, [
      row(2, { customerCode: "B", custPoNo: "2" }),
      row(3, { customerCode: "A", custPoNo: "1" }),
      row(4, { customerCode: "B", custPoNo: "2" }),
    ]);
    assert.deepEqual(groups.map((g) => g.header.customerCode), ["B", "A"]);
  });
});
