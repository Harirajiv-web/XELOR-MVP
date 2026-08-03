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
      getOrder: async () => ({
        id: "so-1",
        lines: [{ itemId: "item-1" }],
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
    {
      listOrders: async () => ({ items: [{ id: "so-2", soNo: "SO-2000", customerId: "c-2", customerCode: "C2", customerName: "Customer", custPoNo: null, orderDate: "2026-08-01", requestedDeliveryDate: now, lineCount: 1, isInterState: false, grandTotal: "1000", creditStatus: "clear", status: "confirmed" }], nextCursor: null }),
      getOrder: async () => ({ id: "so-2", lines: [{ itemId: "item-2" }] }),
    } as never,
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

test("commander prioritizes a customer commitment linked to rejected quality and groups duplicate plan cards", async () => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
  const repository = {
    valueSummary: async () => ({ estimatedValue: 0, verifiedValue: 0, outcomeCount: 0, verifiedCount: 0, currency: "INR", disclosure: "" }),
    decisionHistory: async () => ({}),
    knowledgeGraph: async () => ({ nodes: [], edges: [], summary: { rememberedDecisions: 0, relationships: 0, businessAreas: 0 } }),
    organizationalMemory: async () => ({ summary: { decisionsRemembered: 0, withVerifiedOutcome: 0, awaitingHumanDecision: 0, lastDecisionAt: null }, items: [], disclosure: "" }),
  };
  const service = new DecisionIntelligenceService(
    {
      listOrders: async () => ({ items: [{ id: "northstar", soNo: "SO-NS", customerId: "customer", customerCode: "NS", customerName: "Northstar", custPoNo: "NPS/1", orderDate: "2026-08-01", requestedDeliveryDate: tomorrow, lineCount: 1, isInterState: true, grandTotal: "7434000", creditStatus: "override", status: "partially_dispatched" }], nextCursor: null }),
      getOrder: async () => ({ id: "northstar", lines: [{ itemId: "px400" }] }),
    } as never,
    {
      list: async () => [
        { id: "p-1", severity: "critical", status: "open", ref: "CMP-1@W30", pegRef: null, currentBucket: "2026-W29", message: "Component is past due" },
        { id: "p-2", severity: "critical", status: "open", ref: "CMP-1@W30", pegRef: null, currentBucket: "2026-W30", message: "Component is short" },
      ],
    } as never,
    { listPos: async () => ({ items: [], nextCursor: null }) } as never,
    {
      listInspections: async () => ({
        items: [{
          id: "inspection-1", inspectionNo: "INS-1", inspectionType: "final", itemRef: "px400",
          itemCode: "PMP-PX400", itemName: "PX-400", result: "rejected", completedAt: new Date().toISOString(),
          qtyRejected: "40", verdictRationale: "Critical runout failed.",
          dispositions: [{ dispositionType: "quarantine", qty: "12" }],
        }],
        nextCursor: null,
      }),
    } as never,
    { list: async () => [] } as never,
    repository as never,
  );

  const result = await service.commander();
  assert.equal(result.risks.length, 3);
  assert.match(result.risks[0]?.title ?? "", /Northstar/);
  assert.equal(result.risks[0]?.severity, "critical");
  assert.equal(result.risks[0]?.evidence.length, 2);
  assert.match(result.risks[0]?.plainSummary ?? "", /12 PMP-PX400/);
  const planning = result.risks.find((risk) => risk.kind === "planning");
  assert.equal(planning?.causes.length, 2);
  assert.equal(planning?.evidence.length, 2);
  assert.match(planning?.plainSummary ?? "", /2 related planning exceptions/i);
});
