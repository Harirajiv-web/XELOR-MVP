import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CircularBomError, computeLowLevelCodes, topologicalOrder, whereUsed, type BomEdge } from "./llc.js";

describe("low-level codes", () => {
  it("levels a simple three-deep structure", () => {
    const edges: BomEdge[] = [
      { parentItemId: "PUMP", componentItemId: "IMPELLER" },
      { parentItemId: "IMPELLER", componentItemId: "CASTING" },
    ];
    const llc = computeLowLevelCodes(["PUMP", "IMPELLER", "CASTING"], edges);
    assert.equal(llc.get("PUMP"), 0);
    assert.equal(llc.get("IMPELLER"), 1);
    assert.equal(llc.get("CASTING"), 2);
  });

  it("plans a shared item at its DEEPEST occurrence, which is the whole point", () => {
    // A washer used directly on the pump AND inside the impeller must be planned at level 2
    // — after both parents have declared what they will release.
    const edges: BomEdge[] = [
      { parentItemId: "PUMP", componentItemId: "IMPELLER" },
      { parentItemId: "PUMP", componentItemId: "WASHER" },
      { parentItemId: "IMPELLER", componentItemId: "WASHER" },
    ];
    const llc = computeLowLevelCodes(["PUMP", "IMPELLER", "WASHER"], edges);
    assert.equal(llc.get("WASHER"), 2, "netting the washer at level 1 would miss the impeller's demand");
  });

  it("handles a diamond — two parents, one shared grandchild", () => {
    const edges: BomEdge[] = [
      { parentItemId: "PUMP", componentItemId: "IMPELLER" },
      { parentItemId: "PUMP", componentItemId: "CASING" },
      { parentItemId: "IMPELLER", componentItemId: "STEEL" },
      { parentItemId: "CASING", componentItemId: "STEEL" },
    ];
    const llc = computeLowLevelCodes(["PUMP", "IMPELLER", "CASING", "STEEL"], edges);
    assert.equal(llc.get("STEEL"), 2);
  });

  it("orders parents before the components they consume", () => {
    const edges: BomEdge[] = [
      { parentItemId: "A", componentItemId: "B" },
      { parentItemId: "B", componentItemId: "C" },
    ];
    const order = topologicalOrder(["A", "B", "C"], edges);
    assert.ok(order.indexOf("A") < order.indexOf("B"));
    assert.ok(order.indexOf("B") < order.indexOf("C"));
  });

  it("counts a component appearing twice on one BOM as one edge", () => {
    const edges: BomEdge[] = [
      { parentItemId: "A", componentItemId: "B" },
      { parentItemId: "A", componentItemId: "B" },
    ];
    // Not deduplicating would leave B with an indegree that never drains, and Kahn would
    // report a cycle that is not there.
    assert.deepEqual(topologicalOrder(["A", "B"], edges), ["A", "B"]);
  });

  it("is deterministic — a re-run must produce the identical order", () => {
    const edges: BomEdge[] = [
      { parentItemId: "P", componentItemId: "Z" },
      { parentItemId: "P", componentItemId: "A" },
      { parentItemId: "P", componentItemId: "M" },
    ];
    assert.deepEqual(topologicalOrder(["P", "A", "M", "Z"], edges), topologicalOrder(["P", "A", "M", "Z"], edges));
  });

  it("rejects a circular BOM and NAMES the cycle", () => {
    const edges: BomEdge[] = [
      { parentItemId: "A", componentItemId: "B" },
      { parentItemId: "B", componentItemId: "C" },
      { parentItemId: "C", componentItemId: "A" },
    ];
    try {
      topologicalOrder(["A", "B", "C"], edges);
      assert.fail("a circular BOM must not be planned");
    } catch (e) {
      assert.ok(e instanceof CircularBomError);
      // The message has to be actionable: a planner cannot bisect a product structure by hand.
      assert.equal(e.cycle[0], e.cycle[e.cycle.length - 1], "the reported cycle should close on itself");
      assert.deepEqual([...new Set(e.cycle)].sort(), ["A", "B", "C"]);
    }
  });

  it("catches an item that contains itself", () => {
    assert.throws(() => topologicalOrder(["A"], [{ parentItemId: "A", componentItemId: "A" }]), CircularBomError);
  });

  it("finds every parent that uses an item, at any depth", () => {
    const edges: BomEdge[] = [
      { parentItemId: "PUMP", componentItemId: "IMPELLER" },
      { parentItemId: "IMPELLER", componentItemId: "CASTING" },
      { parentItemId: "PUMP80", componentItemId: "IMPELLER" },
    ];
    assert.deepEqual(whereUsed("CASTING", edges), ["IMPELLER", "PUMP", "PUMP80"]);
    assert.deepEqual(whereUsed("PUMP", edges), []);
  });
});
