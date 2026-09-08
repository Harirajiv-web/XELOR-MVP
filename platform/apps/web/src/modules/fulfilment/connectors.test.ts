import { test } from "node:test";
import assert from "node:assert/strict";
import { SOURCE_CATALOGUE } from "@ind-core/platform";
import { CATEGORY_LABEL, CONNECTORS, normaliseConnectors } from "./connectors";

/**
 * THE ONE CLAIM THIS PRODUCT CANNOT AFFORD TO GET WRONG.
 *
 * A connector shelf is a sales surface, and a sales surface that shows a green dot next to
 * SAP has told a room full of people that we have an SAP integration. We do not. The
 * instruction is verbatim: "Do not create misleading integrations that appear real when they
 * are only mocked."
 *
 * So `connected` is tested like a permission check rather than like a display field: exactly
 * one entry may be true, it must be ours, and no shape of API payload may talk the parser
 * into upgrading a connection that was not explicitly declared.
 */

test("exactly one connector is connected, and it is ours", () => {
  const connected = CONNECTORS.filter((c) => c.connected);
  assert.equal(connected.length, 1);
  assert.equal(connected[0]?.key, "xelor-phase1");
});

test("the fallback shelf names the eight systems it must be able to talk about", () => {
  const keys = CONNECTORS.map((c) => c.key);
  for (const expected of [
    "sap",
    "tally",
    "odoo",
    "dynamics365",
    "mes-scada",
    "excel-csv",
    "rest-api",
    "database",
  ]) {
    assert.ok(keys.includes(expected), `${expected} is missing from the shelf`);
  }
});

test("fallback copy distinguishes the real upload path from seeded capacity", () => {
  const spreadsheet = CONNECTORS.find((c) => c.key === "excel-csv");
  const capacity = CONNECTORS.find((c) => c.key === "mes-scada");
  const xelor = CONNECTORS.find((c) => c.key === "xelor-phase1");
  assert.match(spreadsheet?.note ?? "", /upload an \.xlsx, \.xls or \.csv/i);
  assert.match(spreadsheet?.note ?? "", /re-plan/i);
  assert.match(capacity?.note ?? "", /seeded assumption/i);
  assert.match(xelor?.note ?? "", /supplier terms.*seeded demo data/i);
  assert.doesNotMatch(xelor?.note ?? "", /every figure/i);
});

test("every entry says what it would supply and where the work stands", () => {
  for (const c of CONNECTORS) {
    assert.ok(c.supplies.length > 20, `${c.key} does not say what it supplies`);
    assert.ok(c.note.length > 10, `${c.key} does not say where it stands`);
    assert.ok(c.category in CATEGORY_LABEL, `${c.key} has an unlabelled category`);
    if (!c.connected) {
      // The words a presenter cannot walk past. Every unconnected entry says so in its note,
      // not only in a badge somebody might crop out of a screenshot.
      assert.match(c.note, /not connected/i, `${c.key} does not say it is not connected`);
    }
  }
});

/* ------------------------------------------------------------- served catalogue -- */

test("the exact API source catalogue is reduced to one live ERP plus its shelf", () => {
  const parsed = normaliseConnectors(SOURCE_CATALOGUE);
  assert.equal(parsed?.length, SOURCE_CATALOGUE.shelf.length + 1);
  assert.deepEqual(
    parsed?.filter((connector) => connector.connected).map((connector) => connector.key),
    ["xelor-phase1"],
  );
  assert.deepEqual(
    parsed?.slice(1).map((connector) => connector.key),
    SOURCE_CATALOGUE.shelf.map((connector) => connector.key),
  );

  const spreadsheet = parsed?.find((connector) => connector.key === "excel-csv");
  const capacity = parsed?.find((connector) => connector.key === "mes-scada");
  assert.equal(spreadsheet?.connected, false);
  assert.match(spreadsheet?.note ?? "", /supplier-terms spreadsheet can be uploaded/i);
  assert.match(spreadsheet?.note ?? "", /changes the plan/i);
  assert.match(capacity?.note ?? "", /seeded constant/i);
  assert.match(capacity?.note ?? "", /no MES or SCADA is connected/i);
});

test("the API data envelope is accepted", () => {
  assert.equal(
    normaliseConnectors({ data: SOURCE_CATALOGUE })?.length,
    SOURCE_CATALOGUE.shelf.length + 1,
  );
});

test("an unusable answer falls back rather than emptying the shelf", () => {
  assert.equal(normaliseConnectors(null), null);
  assert.equal(normaliseConnectors({}), null);
  assert.equal(normaliseConnectors([]), null);
  assert.equal(normaliseConnectors({ phase1: [], shelf: [] }), null);
  assert.equal(normaliseConnectors({ phase1: SOURCE_CATALOGUE.phase1 }), null);
});

test("a shelf row cannot turn itself green", () => {
  const parsed = normaliseConnectors({
    ...SOURCE_CATALOGUE,
    shelf: SOURCE_CATALOGUE.shelf.map((connector, index) =>
      index === 0 ? { ...connector, connected: true, status: "connected" } : connector,
    ),
  });
  assert.equal(parsed?.find((connector) => connector.key === "sap")?.connected, false);
});
