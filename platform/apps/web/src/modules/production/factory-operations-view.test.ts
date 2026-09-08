import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cycleTimeLabel,
  oeeFormulaLabel,
  oeePercent,
  workroomScenarioAction,
} from "./factory-operations-view.js";

test("Factory Operations labels preserve evidenced precision and missing values", () => {
  assert.equal(oeePercent(82.224), "82.22%");
  assert.equal(oeePercent(null), "Not evidenced");
  assert.equal(
    oeeFormulaLabel({ availabilityPct: 90, performancePct: 93.83, qualityPct: 97.37, oeePct: 82.22 }),
    "(90.00% × 93.83% × 97.37%) = 82.22%",
  );
  assert.equal(
    oeeFormulaLabel({ availabilityPct: 90, performancePct: null, qualityPct: 97.37, oeePct: null }),
    "A × P × Q = not fully evidenced",
  );
});

test("cycle comparison is explicit about actual versus ideal", () => {
  assert.equal(cycleTimeLabel(635, 600), "635s actual · 600s ideal · 35s slower");
  assert.equal(cycleTimeLabel(590, 600), "590s actual · 600s ideal · 10s faster");
  assert.equal(cycleTimeLabel(null, 600), "Cycle comparison not evidenced");
});

test("the single simulator control follows the displayed machine state", () => {
  assert.equal(workroomScenarioAction("running"), "breakdown");
  assert.equal(workroomScenarioAction("faulted"), "recover");
});
