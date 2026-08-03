import assert from "node:assert/strict";
import test from "node:test";
import { DecisionIntelligenceService } from "./decision-intelligence.service.js";

test("commander joins current cross-domain facts without presenting exposure as verified value", async () => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
  const service = new DecisionIntelligenceService(
    {
      listOrders: async () => ({
        items: [{
          id: "so-1", soNo: "SO-1048", customerId: "customer-1", customerCode: "APEX",
          customerName: "Apex Mobility", custPoNo: "PO-CUST-1", orderDate: "2026-07-30",
          requestedDeliveryDate: tomorrow, lineCount: 1, isInterState: false,
          grandTotal: "1860000.00", creditStatus: "clear", status: "confirmed",
        }],
        nextCursor: null,
      }),
    } as never,
    {
      list: async () => [{
        id: "exception-1", severity: "critical", status: "open", itemCode: "BEARING-01",
        ref: "SO-1048/1", pegRef: "SO-1048", message: "Critical bearing is short",
        suggestion: "Confirm alternate supply",
      }],
    } as never,
    { listPos: async () => ({ items: [], nextCursor: null }) } as never,
    { listInspections: async () => ({ items: [], nextCursor: null }) } as never,
    { list: async () => [] } as never,
    {
      valueSummary: async () => ({
        estimatedValue: 0, verifiedValue: 0, outcomeCount: 0, verifiedCount: 0,
        currency: "INR", disclosure: "Only checked value is included.",
      }),
      decisionHistory: async () => ({}),
      knowledgeGraph: async () => ({ nodes: [], edges: [], summary: { rememberedDecisions: 0, relationships: 0, businessAreas: 0 } }),
      organizationalMemory: async () => ({ summary: { decisionsRemembered: 0, withVerifiedOutcome: 0, awaitingHumanDecision: 0, lastDecisionAt: null }, items: [], disclosure: "" }),
    } as never,
  );

  const result = await service.commander();
  assert.equal(result.risks.length, 1);
  assert.equal(result.risks[0]?.kind, "delivery");
  assert.equal(result.risks[0]?.severity, "critical");
  assert.equal(result.risks[0]?.exposure.amount, 1_860_000);
  assert.match(result.risks[0]?.exposure.basis ?? "", /not a forecast loss/i);
  assert.equal(result.value.verifiedValue, 0);
  assert.equal(result.graph.edges.length, 2);
  assert.match(result.risks[0]?.causes[0] ?? "", /bearing is short/i);
});

test("commander leaves monetary exposure blank when a source has no defensible rate", async () => {
  const service = new DecisionIntelligenceService(
    { listOrders: async () => ({ items: [], nextCursor: null }) } as never,
    { list: async () => [] } as never,
    { listPos: async () => ({ items: [], nextCursor: null }) } as never,
    { listInspections: async () => ({ items: [], nextCursor: null }) } as never,
    {
      list: async () => [{
        id: "down-1", assetId: "asset-1", assetCode: "CNC-07", assetName: "CNC 07",
        startedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(), endedAt: null,
        durationMinutes: null, kind: "unplanned", productionImpacting: true,
        reasonCode: null, source: "operator", mwoId: null, corrected: false, disputed: false,
      }],
    } as never,
    {
      valueSummary: async () => ({ estimatedValue: 0, verifiedValue: 0, outcomeCount: 0, verifiedCount: 0, currency: "INR", disclosure: "" }),
      decisionHistory: async () => ({}),
      knowledgeGraph: async () => ({ nodes: [], edges: [], summary: { rememberedDecisions: 0, relationships: 0, businessAreas: 0 } }),
      organizationalMemory: async () => ({ summary: { decisionsRemembered: 0, withVerifiedOutcome: 0, awaitingHumanDecision: 0, lastDecisionAt: null }, items: [], disclosure: "" }),
    } as never,
  );
  const result = await service.commander();
  assert.equal(result.risks[0]?.kind, "maintenance");
  assert.equal(result.risks[0]?.exposure.amount, null);
  assert.match(result.risks[0]?.exposure.basis ?? "", /not shown/i);
});

test("commander confidence is explainable and organizational memory stays explicit", async () => {
  const now = new Date().toISOString();
  const service = new DecisionIntelligenceService(
    { listOrders: async () => ({ items: [{ id: "so-2", soNo: "SO-2000", customerId: "c-2", customerCode: "C2", customerName: "Customer", custPoNo: null, orderDate: "2026-08-01", requestedDeliveryDate: now, lineCount: 1, isInterState: false, grandTotal: "1000", creditStatus: "clear", status: "confirmed" }], nextCursor: null }) } as never,
    { list: async () => [{ id: "p-2", severity: "high", status: "open", ref: "SO-2000/1", pegRef: "SO-2000", message: "Material is short", suggestion: "Review supply" }] } as never,
    { listPos: async () => ({ items: [], nextCursor: null }) } as never,
    { listInspections: async () => ({ items: [], nextCursor: null }) } as never,
    { list: async () => [] } as never,
    {
      valueSummary: async () => ({ estimatedValue: 0, verifiedValue: 250, outcomeCount: 1, verifiedCount: 1, currency: "INR", disclosure: "" }),
      decisionHistory: async () => ({ "delivery:so-2": { previousDecisionCount: 1, verifiedOutcomeCount: 1 } }),
      knowledgeGraph: async () => ({ nodes: [], edges: [], summary: { rememberedDecisions: 1, relationships: 2, businessAreas: 2 } }),
      organizationalMemory: async () => ({ summary: { decisionsRemembered: 1, withVerifiedOutcome: 1, awaitingHumanDecision: 0, lastDecisionAt: now }, items: [{ decisionKey: "delivery:so-2" }], disclosure: "Mission-backed memory." }),
    } as never,
  );

  const result = await service.commander();
  assert.equal(result.risks[0]?.confidence.band, "high");
  assert.equal(result.confidence.high, 1);
  assert.equal(result.memory.summary.decisionsRemembered, 1);
  assert.match(result.graph.disclosure, /persisted evidence/i);
});
