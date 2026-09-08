import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { calendarDate, commitmentRequest, evidenceSchema, importRequest, outcomeRequest, parseCsv, parseImport, recoveryRequest } from "./contracts.js";
import { assessCommitment, compareOutcomes, compareRecovery } from "./decision-rules.js";
import { answerFromEvidence } from "./grounded-answers.js";
import { normalizeSap, parseTallyStock, readExternalEvidence } from "./adapters.js";
import { blockedAddress, connectorRequest, decryptCredentials, encryptCredentials, validateConnectorUrl } from "./connector-security.js";

const now = new Date("2026-09-07T12:00:00Z");
const connectionId = "0192a8c0-0000-7000-8000-000000000001";
const evidence = evidenceSchema.parse({ inventory: [{ itemCode: "RM-001", availableQty: 30, uom: "kg" }],
  orders: [{ externalId: "SO-1/1", itemCode: "RM-001", quantity: 100, dueDate: "2026-09-06", unitPrice: 120, currency: "INR" }], suppliers: [{ externalId: "S-1", name: "Acme", leadDays: null }] });
const snapshot = { id: "snapshot-one", observedAt: now, evidence, warnings: [] };
const commitment = commitmentRequest.parse({ connectionId, orderRef: "Q-001", itemCode: "RM-001", quantity: 100, dueDate: "2026-09-20", sellingPrice: 120, currency: "INR", productionDays: 3, capacityConfirmed: true, materialUnitCost: 50, conversionCost: 2000, procurementLeadDays: 2 });

test("commitment reports shortages, date and margin from supplied evidence and assumptions", () => {
  const result = assessCommitment(commitment, snapshot, now);
  assert.equal(result.status, "feasible"); assert.equal(result.shortageQty, 70);
  assert.equal(result.earliestDeliveryDate, "2026-09-12"); assert.equal(result.projectedCost, 7000);
  assert.equal(result.projectedMarginPct, 41.67); assert.equal(result.evidence.snapshotId, "snapshot-one");
});
test("commitment never treats missing inventory as zero or a supported promise", () => {
  const result = assessCommitment({ ...commitment, itemCode: "MISSING" }, snapshot, now);
  assert.equal(result.status, "needs_evidence"); assert.equal(result.availableQty, null); assert.equal(result.shortageQty, null); assert.equal(result.earliestDeliveryDate, null);
});
test("zero stock is known evidence and calculates full shortage", () => {
  const result = assessCommitment(commitment, { ...snapshot, evidence: evidenceSchema.parse({ inventory: [{ itemCode: "RM-001", availableQty: 0 }] }) }, now);
  assert.equal(result.shortageQty, 100); assert.equal(result.status, "feasible");
});
test("stale evidence blocks an otherwise feasible commitment", () => {
  assert.equal(assessCommitment(commitment, { ...snapshot, observedAt: new Date("2026-09-01") }, now).status, "needs_evidence");
});
test("missing cost and capacity remain unknown", () => {
  const result = assessCommitment({ ...commitment, materialUnitCost: undefined, capacityConfirmed: false }, snapshot, now);
  assert.equal(result.status, "needs_evidence"); assert.equal(result.projectedCost, null); assert.equal(result.projectedMarginPct, null);
});
test("past due and insufficient margin are independent risk flags", () => {
  const result = assessCommitment({ ...commitment, dueDate: "2026-09-10", sellingPrice: 60 }, snapshot, now);
  assert.equal(result.status, "at_risk"); assert.ok(result.projectedMarginPct! < 0);
  assert.ok(result.warnings.some((w) => w.includes("requested date"))); assert.ok(result.warnings.some((w) => w.includes("target")));
});
test("inventory coverage removes procurement wait but does not invent production duration", () => {
  const result = assessCommitment({ ...commitment, quantity: 10, conversionCost: 200, procurementLeadDays: undefined, productionDays: undefined }, snapshot, now);
  assert.equal(result.shortageQty, 0); assert.equal(result.earliestDeliveryDate, null); assert.equal(result.status, "needs_evidence");
});
const recovery = recoveryRequest.parse({ connectionId, itemCode: "RM-001", quantity: 100, needDate: "2026-09-10", currency: "INR", options: [
  { name: "Standard", quantity: 70, unitCost: 50, freightCost: 200, leadDays: 5, currency: "INR" },
  { name: "Expedite", quantity: 70, unitCost: 55, freightCost: 500, leadDays: 2, currency: "INR" },
  { name: "Partial", quantity: 20, unitCost: 20, freightCost: 0, leadDays: 1, currency: "INR" },
  { name: "Unpriced", quantity: 70, unitCost: null, freightCost: 0, leadDays: 1, currency: "INR" },
  { name: "Different currency", quantity: 70, unitCost: 1, freightCost: 0, leadDays: 1, currency: "USD" },
] });
test("recovery prioritizes on-time full coverage over cheaper late or incomplete offers", () => {
  const result = compareRecovery(recovery, snapshot, now);
  assert.equal(result.recommendedOption, "Expedite"); assert.equal(result.options[0]?.daysLate, 2); assert.equal(result.options[1]?.totalCost, 4350);
  assert.equal(result.options[2]?.eligible, false); assert.equal(result.options[3]?.totalCost, null); assert.equal(result.options[4]?.eligible, false);
});
test("unknown stock and stale evidence suppress recovery recommendation", () => {
  assert.equal(compareRecovery({ ...recovery, itemCode: "MISSING" }, snapshot, now).recommendedOption, null);
  assert.equal(compareRecovery(recovery, { ...snapshot, observedAt: new Date("2026-09-01") }, now).recommendedOption, null);
});
test("no shortage does not trigger unnecessary procurement", () => {
  assert.equal(compareRecovery({ ...recovery, quantity: 5 }, snapshot, now).recommendedOption, null);
});
test("CSV reads quoted commas and escaped quotes without evaluating values", () => {
  assert.deepEqual(parseCsv('externalId,name,leadDays\r\nS1,"Acme, \"\"Works\"\"",5\r\n'), [["externalId", "name", "leadDays"], ["S1", 'Acme, "Works"', "5"]]);
  const imported = parseImport(importRequest.parse({ format: "csv", entity: "inventory", observedAt: now.toISOString(), content: "itemCode,availableQty,uom\nRM-1,0,kg\nRM-2,,nos" }), now);
  assert.equal(imported.inventory[0]?.availableQty, 0); assert.equal(imported.inventory[1]?.availableQty, null);
});
test("imports reject malformed quotes, row widths, duplicate items, bad quantities and future evidence", () => {
  assert.throws(() => parseCsv('a,b\n"broken,2'));
  assert.throws(() => parseImport({ format: "csv", entity: "inventory", observedAt: now.toISOString(), content: "itemCode,availableQty\nRM-1,2,3" }, now));
  assert.throws(() => evidenceSchema.parse({ inventory: [{ itemCode: "A", availableQty: 1 }, { itemCode: "A", availableQty: 2 }] }));
  assert.throws(() => evidenceSchema.parse({ inventory: [{ itemCode: "A", availableQty: -1 }] }));
  assert.throws(() => parseImport({ format: "json", observedAt: "2027-01-01T00:00:00Z", content: "{}" }, now));
});
test("calendar validation rejects rollover dates and permits leap years", () => {
  assert.equal(calendarDate.safeParse("2026-02-29").success, false); assert.equal(calendarDate.safeParse("2024-02-29").success, true);
});
test("SAP maps OData suppliers and never equates unrestricted stock with availability", () => {
  assert.equal(normalizeSap({ d: { results: [{ BusinessPartner: "42", BusinessPartnerFullName: "Supplier" }] } }, "suppliers").evidence.suppliers[0]?.name, "Supplier");
  assert.equal(normalizeSap({ value: [{ Material: "M", MatlWrhsStkQtyInMatlBaseUnit: 999, MaterialBaseUnit: "EA" }] }, "inventory").evidence.inventory[0]?.availableQty, null);
});
test("SAP refuses pagination and unidentified orders", () => {
  assert.throws(() => normalizeSap({ value: [], "@odata.nextLink": "https://private/next" }, "orders"), /paginated/);
  assert.throws(() => normalizeSap({ value: [{ Material: "M", OrderQuantity: 1 }] }, "orders"), /identifiers/);
});
test("Tally export records closing stock separately from unknown availability", () => {
  const result = parseTallyStock('<ENVELOPE><COLLECTION><STOCKITEM NAME="Steel &amp; metal"><CLOSINGBALANCE>1,250.5 kg</CLOSINGBALANCE><BASEUNITS>kg</BASEUNITS></STOCKITEM></COLLECTION></ENVELOPE>');
  assert.equal(result.evidence.inventory[0]?.itemCode, "Steel & metal"); assert.equal(result.evidence.inventory[0]?.availableQty, null); assert.equal(result.evidence.inventory[0]?.onHandQty, 1250.5);
});
test("Tally rejects entity expansion and error envelopes", () => {
  assert.throws(() => parseTallyStock('<!DOCTYPE root><ENVELOPE/>'), /DTD/);
  assert.throws(() => parseTallyStock('<ENVELOPE><LINEERROR>Company missing</LINEERROR></ENVELOPE>'), /rejected/);
  assert.throws(() => parseTallyStock('<ENVELOPE>'), /complete/);
});
test("credentials are randomized encrypted and authenticated to tenant and connection", () => {
  const key = randomBytes(32).toString("base64"); const value = { apiKey: "top-secret" };
  const encoded = encryptCredentials(value, "tenant-one:connection-one", key);
  assert.ok(!encoded.includes("top-secret")); assert.notEqual(encoded, encryptCredentials(value, "tenant-one:connection-one", key));
  assert.deepEqual(decryptCredentials(encoded, "tenant-one:connection-one", key), value);
  assert.throws(() => decryptCredentials(encoded, "tenant-two:connection-one", key));
  assert.throws(() => encryptCredentials(value, "one", "short"));
});
test("connector origins require exact operator allowlist; embedded credentials are rejected", () => {
  assert.equal(validateConnectorUrl("https://erp.example.com/api", "https://erp.example.com").hostname, "erp.example.com");
  assert.throws(() => validateConnectorUrl("https://erp.example.com.evil.test", "https://erp.example.com"));
  assert.throws(() => validateConnectorUrl("https://user:secret@erp.example.com", "https://erp.example.com"));
  assert.throws(() => validateConnectorUrl("https://erp.example.com?token=x", "https://erp.example.com"));
});
test("metadata and link-local destinations remain blocked even if explicitly allowlisted", () => {
  for (const address of ["169.254.169.254", "0.0.0.0", "100.100.100.200", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "fe80::1", "febf::1", "fd00:ec2::254", "fd00:0ec2:0000:0000:0000:0000:0000:0254"]) assert.ok(blockedAddress(address), address);
  assert.throws(() => validateConnectorUrl("http://169.254.169.254", "http://169.254.169.254"));
  assert.equal(blockedAddress("192.168.1.10"), false); // Explicit allowlisting permits factory LAN bridges.
});
test("real HTTP transport pins local DNS, rejects redirects, and bounds response size", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/redirect") { response.writeHead(302, { location: "http://169.254.169.254/" }); response.end(); }
    else if (request.url === "/large") response.end("x".repeat(2_000_001));
    else { response.setHeader("content-type", "application/json"); response.end('{"ok":true}'); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`; const before = process.env.CONNECTIVITY_ALLOWED_ORIGINS; process.env.CONNECTIVITY_ALLOWED_ORIGINS = base;
  try {
    assert.equal(await connectorRequest(base, "/"), '{"ok":true}');
    await assert.rejects(connectorRequest(base, "/redirect"), /HTTP 302/);
    await assert.rejects(connectorRequest(base, "/large"));
    await assert.rejects(connectorRequest(base, "http://example.com/"), /origin/);
  } finally {
    if (before === undefined) delete process.env.CONNECTIVITY_ALLOWED_ORIGINS; else process.env.CONNECTIVITY_ALLOWED_ORIGINS = before;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
test("Odoo JSON-2 adapter reads external records and sends bearer authentication", async () => {
  const requests: Array<{ path: string; authorization: string | undefined; method: string | undefined; body: unknown }> = [];
  const server = createServer(async (request, response) => {
    let body = ""; for await (const chunk of request) body += String(chunk);
    requests.push({ path: request.url!, authorization: request.headers.authorization, method: request.method, body: JSON.parse(body) });
    const payload = request.url!.includes("product.product") ? [{ id: 42, default_code: "EXT-STEEL", uom_id: [1, "kg"], free_qty: 18 }]
      : request.url!.includes("sale.order.line") ? [{ id: 77, product_id: [42, "Steel"], product_uom_qty: 30, qty_delivered: 5, price_unit: 100, currency_id: [1, "INR"] }]
        : [{ id: 5, name: "External supplier" }];
    response.setHeader("content-type", "application/json"); response.end(JSON.stringify(payload));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`; const before = process.env.CONNECTIVITY_ALLOWED_ORIGINS; process.env.CONNECTIVITY_ALLOWED_ORIGINS = base;
  try {
    const result = await readExternalEvidence({ kind: "odoo", baseUrl: base, settings: { database: "factory" }, credentials: { apiKey: "fixture-token" } });
    assert.equal(result.evidence.inventory[0]?.itemCode, "EXT-STEEL"); assert.equal(result.evidence.inventory[0]?.availableQty, 18);
    assert.equal(result.evidence.orders[0]?.quantity, 25); assert.equal(result.evidence.orders[0]?.dueDate, null); assert.equal(result.evidence.suppliers[0]?.name, "External supplier");
    assert.equal(requests.length, 3); assert.ok(requests.every((r) => r.path.startsWith("/json/2/") && r.path.endsWith("/search_read") && r.method === "POST" && r.authorization === "bearer fixture-token"));
  } finally {
    if (before === undefined) delete process.env.CONNECTIVITY_ALLOWED_ORIGINS; else process.env.CONNECTIVITY_ALLOWED_ORIGINS = before;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
test("grounded answers cite selected source rows and label stale evidence", () => {
  const result = answerFromEvidence("What stock is available for RM-001?", snapshot, now);
  assert.match(result.answer, /30 kg/); assert.equal(result.citations[0]?.snapshotId, "snapshot-one"); assert.equal(result.mode, "grounded_rules");
  const stale = answerFromEvidence("Which orders are overdue?", { ...snapshot, observedAt: new Date("2026-09-01") }, now);
  assert.match(stale.answer, /past due/); assert.equal(stale.freshness, "stale");
});
test("unsupported questions and empty evidence never manufacture facts", () => {
  const result = answerFromEvidence("Tell me next month's profit", snapshot, now);
  assert.equal(result.citations.length, 0); assert.match(result.answer, /explicit assumptions/);
  assert.match(answerFromEvidence("inventory available?", { ...snapshot, evidence: evidenceSchema.parse({}) }, now).answer, /no inventory records/);
});
test("outcomes compare actual against comparable prior baseline; estimates never count as savings", () => {
  const baseline = { id: "a", ...outcomeRequest.parse({ metric: "buyer_minutes", kind: "baseline", scope: "Machining", value: 100, sampleSize: 10, periodStart: "2026-07-01", periodEnd: "2026-07-07", evidenceRef: "Timesheet July" }) };
  const actual = { ...baseline, id: "b", kind: "actual" as const, value: 70, periodStart: "2026-08-01", periodEnd: "2026-08-07" };
  assert.equal(compareOutcomes([actual, baseline])[0]?.improvementPct, 30);
  assert.equal(compareOutcomes([{ ...actual, kind: "estimate" }, baseline]).length, 0);
  assert.equal(compareOutcomes([{ ...actual, periodEnd: "2026-08-30" }, baseline]).length, 0);
  assert.equal(compareOutcomes([{ ...actual, periodStart: "2026-07-01", periodEnd: "2026-07-07" }, baseline]).length, 0);
});
