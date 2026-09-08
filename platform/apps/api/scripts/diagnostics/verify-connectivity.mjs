import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const origin = process.env.API_BASE ?? "http://localhost:4300";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname)) throw new Error("This fixture verifier only runs against a local isolated demo API");
const run = randomUUID(); let checks = 0;
const check = (description, predicate) => { assert.ok(predicate, description); checks++; console.log(`ok ${checks} - ${description}`); };
const key = (suffix) => `verify-connectivity:${run}:${suffix}`;
async function call(method, path, body, requestKey, persona = "hari", expected = 200) {
  const response = await fetch(`${origin}/api/v1/connectivity${path}`, { method,
    headers: { ...(persona ? { "x-xelor-public-demo": "investor-presentation", "x-xelor-demo-persona": persona } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }), ...(requestKey ? { "idempotency-key": requestKey } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(json)}`);
  return json.data;
}

await call("GET", "/connections", undefined, undefined, null, 401);
check("unauthenticated connections denied", true);
const catalog = await call("GET", "/catalog");
check("all six connector families catalogued", catalog.length === 6);
const nativeInput = { name: "Factory ERP — connection verification", kind: "native", settings: {} };
const native = await call("POST", "/connections", nativeInput, key("create-native"), "hari", 201);
const repeatedNative = await call("POST", "/connections", nativeInput, key("create-native"), "hari", 201);
check("connection creation replay returns same id", native.id === repeatedNative.id);
await call("POST", "/connections", { ...nativeInput, name: "Changed payload" }, key("create-native"), "hari", 409);
check("changed payload with the same key rejected", true);
const tested = await call("POST", `/connections/${native.id}/test`, {}, key("test-native"), "hari", 201);
check("native source access verified", tested.status === "connected");
const synchronized = await call("POST", `/connections/${native.id}/sync`, {}, key("sync-native"), "hari", 201);
const syncedAgain = await call("POST", `/connections/${native.id}/sync`, {}, key("sync-native"), "hari", 201);
check("native snapshot includes actual stock and suppliers", synchronized.counts.inventory > 0 && synchronized.counts.suppliers > 0);
check("sync replay returns the same immutable snapshot", synchronized.id === syncedAgain.id);
const answer = await call("POST", `/connections/${native.id}/ask`, { question: "What inventory is available?" }, key("ask-native"), "hari", 201);
check("grounded answer cites selected native snapshot", answer.citations.length > 0 && answer.citations.every((c) => c.snapshotId === synchronized.id));
const rejectedQuestion = await call("POST", `/connections/${native.id}/ask`, { question: "Predict our profit next year" }, key("ask-unsupported"), "hari", 201);
check("unsupported question returns no fabricated citations", rejectedQuestion.citations.length === 0);

const item = synchronized.evidence.inventory[0];
const dueDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
const commitmentInput = { connectionId: native.id, orderRef: "VERIFICATION-ASSUMPTIONS", itemCode: item.itemCode,
  quantity: (item.availableQty ?? 0) + 10, dueDate, sellingPrice: 100, currency: "INR", productionDays: 2,
  capacityConfirmed: true, materialUnitCost: 50, conversionCost: 100, procurementLeadDays: 2 };
const commitment = await call("POST", "/decisions/commitment", commitmentInput, key("commitment"), "hari", 201);
const replayCommitment = await call("POST", "/decisions/commitment", commitmentInput, key("commitment"), "hari", 201);
check("commitment records source provenance and a ten-unit shortage", commitment.evidence.snapshotId === synchronized.id && commitment.shortageQty === 10);
check("commitment retry creates no duplicate decision", replayCommitment.id === commitment.id);
const unknown = await call("POST", "/decisions/commitment", { ...commitmentInput, itemCode: "NOT-IN-SOURCE" }, key("commitment-unknown"), "hari", 201);
check("missing source item remains unknown", unknown.status === "needs_evidence" && unknown.shortageQty === null);
const recovery = await call("POST", "/decisions/recovery", { connectionId: native.id, itemCode: item.itemCode, quantity: commitmentInput.quantity,
  needDate: dueDate, currency: "INR", options: [{ name: "Complete option", quantity: 10, unitCost: 50, freightCost: 100, leadDays: 3, currency: "INR" },
    { name: "Partial option", quantity: 2, unitCost: 10, freightCost: 0, leadDays: 1, currency: "INR" }] }, key("recovery"), "hari", 201);
check("recovery refuses a cheap option that cannot cover the shortage", recovery.recommendedOption === "Complete option" && recovery.options[1].eligible === false);

const importedConnection = await call("POST", "/connections", { name: "Integration verification — synthetic import fixture", kind: "generic" }, key("create-import"), "hari", 201);
const imported = await call("POST", `/connections/${importedConnection.id}/import`, { format: "csv", entity: "inventory",
  content: "itemCode,availableQty,uom\nVERIFY-ONLY,0,kg", observedAt: new Date().toISOString() }, key("csv"), "hari", 201);
check("CSV preserves explicit zero and absent dimensions", imported.evidence.inventory[0].availableQty === 0 && imported.counts.orders === 0);
const old = await call("POST", `/connections/${importedConnection.id}/import`, { format: "json", content: JSON.stringify({ inventory: [{ itemCode: "VERIFY-ONLY", availableQty: 100, uom: "kg" }] }), observedAt: "2026-01-01T00:00:00Z" }, key("stale-import"), "hari", 201);
const stale = await call("POST", "/decisions/commitment", { ...commitmentInput, connectionId: importedConnection.id, itemCode: "VERIFY-ONLY", quantity: 10 }, key("stale-decision"), "hari", 201);
check("old evidence cannot support a commitment even when stock is sufficient", stale.status === "needs_evidence" && stale.evidence.snapshotId === old.id);
const large = { inventory: [{ itemCode: "VERIFY-ONLY", availableQty: 1, uom: "kg" }], suppliers: Array.from({ length: 650 }, (_, index) => ({ externalId: `VERIFY-${index}`, name: `Synthetic fixture supplier ${String(index).padStart(4, "0")} ${"x".repeat(150)}`, leadDays: null })) };
const largeResult = await call("POST", `/connections/${importedConnection.id}/import`, { format: "json", content: JSON.stringify(large), observedAt: new Date().toISOString() }, key("large-import"), "hari", 201);
check("JSON import over default 100 KB passes the configured bounded parser", largeResult.counts.suppliers === 650);

const scope = `Verification fixture ${run}`;
const baselineInput = { metric: "buyer_minutes", kind: "baseline", scope, value: 100, sampleSize: 10, periodStart: "2026-07-01", periodEnd: "2026-07-07", evidenceRef: "Synthetic test fixture, no business savings claim" };
await call("POST", "/outcomes", baselineInput, key("baseline"), "hari", 201);
const actualInput = { ...baselineInput, kind: "actual", value: 70, periodStart: "2026-08-01", periodEnd: "2026-08-07" };
const actual = await call("POST", "/outcomes", actualInput, key("actual"), "hari", 201);
const repeatedActual = await call("POST", "/outcomes", actualInput, key("actual"), "hari", 201);
const outcomes = await call("GET", "/outcomes");
check("measurement retry replays the same recorded outcome", actual.id === repeatedActual.id && outcomes.entries.filter((e) => e.id === actual.id).length === 1);
check("comparable baseline and actual measurements calculate the documented delta", outcomes.comparisons.find((c) => c.scope === scope)?.improvementPct === 30);
await call("POST", "/outcomes", { ...actualInput, kind: "estimate", value: 0 }, key("estimate"), "hari", 201);
check("estimated measurements never replace actual savings evidence", (await call("GET", "/outcomes")).comparisons.find((c) => c.scope === scope)?.actual === 70);

await call("GET", `/connections/${native.id}/snapshot`, undefined, undefined, "kaveri-admin", 404);
check("another tenant cannot address the primary tenant's snapshot", true);
const otherConnections = await call("GET", "/connections", undefined, undefined, "kaveri-admin");
check("connection listing does not leak across tenants", !otherConnections.some((row) => row.id === native.id || row.id === importedConnection.id));
await call("POST", "/decisions/commitment", commitmentInput, key("foreign-decision"), "kaveri-admin", 404);
check("another tenant cannot derive a decision from the primary source", true);
const redacted = await call("GET", "/connections");
check("connection reads never expose credential fields", redacted.every((row) => !Object.hasOwn(row, "credentials") && !Object.hasOwn(row, "credentialsEncrypted")));

console.log(`\n${checks} connectivity integration checks passed. Fixture connections: ${native.id}, ${importedConnection.id}`);
