import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { canonicalize, runWithTenant } from "@ind-core/platform";
import {
  FulfilmentMissionService,
  actionPersistenceMode,
  allocateProductionDemand,
  allocateSourcingPegs,
  evaluateOutcomeGate,
  expectedMaterialDate,
  isMissionStopStatus,
} from "./mission.service.js";

const A = "0192a8c0-0001-7000-8000-000000000001";
const B = "0192a8c0-0001-7000-8000-000000000002";
const L1 = "0192a8c0-0001-7000-8000-000000000011";
const L2 = "0192a8c0-0001-7000-8000-000000000012";

test("line demand keeps each item and removes already-covered finished stock", () => {
  const demand = allocateProductionDemand(
    [
      { lineId: L1, itemId: A, itemCode: "FG-A", qty: 10, reservedQty: 2 },
      { lineId: L2, itemId: B, itemCode: "FG-B", qty: 5, reservedQty: 0 },
    ],
    new Map([[A, 4], [B, 2]]),
  );

  assert.deepEqual(
    demand.map((d) => ({ lineId: d.lineId, itemId: d.itemId, covered: d.coveredQty, make: d.makeQty })),
    [
      { lineId: L1, itemId: A, covered: 4, make: 6 },
      { lineId: L2, itemId: B, covered: 2, make: 3 },
    ],
  );
});

test("two lines for the same item share one stock pool rather than each seeing all of it", () => {
  const demand = allocateProductionDemand(
    [
      { lineId: L1, itemId: A, itemCode: "FG-A", qty: 4, reservedQty: 0 },
      { lineId: L2, itemId: A, itemCode: "FG-A", qty: 4, reservedQty: 0 },
    ],
    new Map([[A, 5]]),
  );
  assert.deepEqual(demand.map((d) => d.makeQty), [0, 3]);
});

test("split sourcing retains the sales-order-line peg across vendors", () => {
  const result = allocateSourcingPegs(
    [{ itemCode: "RAW-X", qty: 4 }, { itemCode: "RAW-X", qty: 4 }],
    new Map([["RAW-X", [{ salesOrderLineId: L1, qty: 3 }, { salesOrderLineId: L2, qty: 5 }]]]),
  );

  assert.deepEqual(result.unallocated, []);
  assert.deepEqual(
    result.allocations.map((a) => ({ source: a.sourceIndex, line: a.salesOrderLineId, qty: a.qty })),
    [
      { source: 0, line: L1, qty: 3 },
      { source: 0, line: L2, qty: 1 },
      { source: 1, line: L2, qty: 4 },
    ],
  );
});

test("unpegged sourcing is reported instead of silently assigned to line zero", () => {
  const result = allocateSourcingPegs(
    [{ itemCode: "RAW-X", qty: 6 }],
    new Map([["RAW-X", [{ salesOrderLineId: L1, qty: 5 }]]]),
  );
  assert.deepEqual(result.unallocated, [{ itemCode: "RAW-X", qty: 1 }]);
});

test("waiting is a real stream boundary", () => {
  assert.equal(isMissionStopStatus("waiting"), true);
  assert.equal(isMissionStopStatus("awaiting_approval"), true);
  assert.equal(isMissionStopStatus("executing"), false);
});

test("PO material date is anchored to the plan and uses the six-day factory calendar", () => {
  assert.equal(expectedMaterialDate("2026-08-11T18:00:00.000Z", 6), "2026-08-18");
});

test("outcome gate waits for real downstream records and enforces target margin", () => {
  const missingDelivery = evaluateOutcomeGate({
    deliveryComplete: false,
    qualityComplete: false,
    invoiceComplete: false,
    unverifiedActions: 0,
    onTime: true,
    forecastMarginPct: 22,
    targetMarginPct: 18,
  });
  assert.equal(missingDelivery.downstreamReady, false);
  assert.equal(missingDelivery.met, false);

  const belowTarget = evaluateOutcomeGate({
    deliveryComplete: true,
    qualityComplete: true,
    invoiceComplete: true,
    unverifiedActions: 0,
    onTime: true,
    forecastMarginPct: 15.07,
    targetMarginPct: 18,
  });
  assert.equal(belowTarget.downstreamReady, true);
  assert.equal(belowTarget.met, false);
  assert.match(belowTarget.reasons.join(" "), /below target/);
});

test("a stale failed action is reset in place on retry instead of inserting its unique key again", async () => {
  const planVersionId = "0192a8c0-0001-7000-8000-000000000021";
  const missionId = "0192a8c0-0001-7000-8000-000000000022";
  const params = { workOrders: [{ itemId: A, qty: 3, salesOrderLineId: L1 }] };
  const digest = createHash("sha256")
    .update(canonicalize({ type: "production.release", params, plan: planVersionId }))
    .digest("hex")
    .slice(0, 32);
  const prior = { id: "action-1", actionNo: "FA-1", digest, status: "failed", verified: false };

  let selectNo = 0;
  let updateValues: Record<string, unknown> | null = null;
  let numberingCalls = 0;
  const query = (answer: unknown[]) => {
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: async () => answer,
    };
    return chain;
  };
  const tx = {
    select: () => query(selectNo++ === 0 ? [] : [prior]),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updateValues = values;
        return { where: async () => undefined };
      },
    }),
    insert: () => {
      throw new Error("retry must not insert a second fulfilment_action");
    },
  };
  const service = new FulfilmentMissionService(
    {} as never,
    { next: async () => { numberingCalls++; return "FA-NEW"; } } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const result = await runWithTenant(
    { tenantId: "0192a8c0-0000-7000-8000-000000000001", actorId: "0192a8c0-0000-7000-8000-000000000002" },
    () => (service as unknown as {
      recordAction: (
        tx: unknown,
        missionId: string,
        planVersionId: string,
        action: Record<string, unknown>,
      ) => Promise<{ id: string; actionNo: string }>;
    }).recordAction(tx, missionId, planVersionId, {
      actionType: "production.release",
      targetDomain: "production",
      title: "retry",
      params,
      result: { productionOrders: ["WO-1", "WO-2"] },
      autonomyTier: "A3",
    }),
  );

  assert.equal(actionPersistenceMode(prior), "reset_for_retry");
  assert.deepEqual(result, { id: "action-1", actionNo: "FA-1", digest });
  assert.equal(numberingCalls, 0);
  assert.equal(updateValues?.status, "executed");
  assert.equal(updateValues?.verified, null);
  assert.equal(updateValues?.postcondition, null);
  assert.equal(updateValues?.failureReason, null);
});
