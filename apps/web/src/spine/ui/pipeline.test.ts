import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LAYER_OF,
  LEGEND_ORDER,
  PHASE_WORD,
  PIPELINE_STATUS,
  liveStageIndex,
  readPipeline,
  type PipelineStage,
} from "./pipeline.logic";

/**
 * THE HONESTY RULES, PINNED.
 *
 * Every failure this file guards against is silent. A malformed stage rendered as "unknown"
 * looks like a real phase. A seeded supplier price drawn in the Phase 1 grey looks like a
 * figure out of the customer's own ERP. A rail that opens on the last row shows "waiting"
 * when the thing the person is being asked about is three pills to the left. None of those
 * throw, none of them fail a build, and each one quietly tells somebody the wrong thing
 * about a machine that is committing their money.
 *
 * The rules are pure and closed, so they can be pinned exactly. These deliberately assert on
 * the API'S OWN vocabulary — `phase1-erp`, `requires_review`, `simulated-api` — because that
 * is the contract that breaks when somebody renames a field in the mission engine without
 * looking at the web app.
 */

function stage(over: Partial<PipelineStage> = {}): PipelineStage {
  return {
    phase: "collect",
    label: "Read the confirmed order.",
    system: "Sales · Orders",
    sourceKind: "phase1-erp",
    status: "completed",
    detail: "SO-2627-00006, 240 units",
    at: "2026-07-20T09:14:02.000Z",
    ...over,
  };
}

/* --------------------------------------------------------------- degradation -- */

test("a step with no pipeline yields nothing at all, never an error", () => {
  assert.deepEqual(readPipeline(undefined), []);
  assert.deepEqual(readPipeline(null), []);
  assert.deepEqual(readPipeline({}), []);
  assert.deepEqual(readPipeline({ pipeline: null }), []);
  // The shape most likely to arrive from a half-landed API change.
  assert.deepEqual(readPipeline({ pipeline: "collect,analyse" }), []);
});

test("a stage the UI does not understand is dropped, not drawn as unknown", () => {
  const parsed = readPipeline({
    pipeline: [
      stage(),
      { ...stage(), phase: "teleport" },
      { ...stage(), sourceKind: "sap-live" },
      { ...stage(), status: "probably_fine" },
      null,
      "collect",
    ],
  });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.phase, "collect");
});

test("optional fields fall back to null and a dash, never to invented text", () => {
  const [only] = readPipeline({
    pipeline: [{ phase: "analyse", sourceKind: "phase2-derived", status: "in_progress" }],
  });
  assert.equal(only?.label, "");
  assert.equal(only?.system, "—");
  assert.equal(only?.detail, null);
  assert.equal(only?.at, null);
});

/* -------------------------------------------------------------- the two layers -- */

test("every source kind lands in exactly one layer, and only the ERP one is phase 1", () => {
  assert.deepEqual(LAYER_OF, {
    "phase1-erp": "phase1",
    "phase2-derived": "phase2",
    "user-input": "human",
    file: "file",
    "simulated-api": "external",
  });
  // The two that must never collapse into each other: a record and a derivation.
  assert.notEqual(LAYER_OF["phase1-erp"], LAYER_OF["phase2-derived"]);
  // A stand-in for a system nobody is connected to must never read as a real read.
  assert.notEqual(LAYER_OF["simulated-api"], LAYER_OF["phase1-erp"]);
});

test("the legend shows all five layers and no more", () => {
  assert.equal(LEGEND_ORDER.length, 5);
  assert.deepEqual([...LEGEND_ORDER].sort(), [...new Set(Object.values(LAYER_OF))].sort());
});

/* ------------------------------------------------------------------ statuses -- */

test("the status vocabulary is the engine's, with a tint for each", () => {
  assert.deepEqual(Object.keys(PIPELINE_STATUS).sort(), [
    "approved",
    "completed",
    "failed",
    "in_progress",
    "requires_review",
    "retrying",
    "skipped",
    "waiting",
  ]);
  // Ink on a tint, never bare colour — and the two that mean "stop and look" are not the
  // same treatment as the one that means "done".
  assert.equal(PIPELINE_STATUS.completed.chip, "chip-ok");
  assert.equal(PIPELINE_STATUS.requires_review.chip, "chip-warn");
  assert.equal(PIPELINE_STATUS.failed.chip, "chip-bad");
});

test("all thirteen phases have a word for the pill", () => {
  assert.equal(Object.keys(PHASE_WORD).length, 13);
  for (const [key, word] of Object.entries(PHASE_WORD)) {
    assert.ok(word.length > 0, `${key} has no word`);
    assert.ok(word.length <= 10, `${key} is too long for a pill: ${word}`);
  }
});

/* ------------------------------------------------------------- what is shown -- */

test("the rail opens on the last phase that actually did something", () => {
  const stages = [
    stage({ phase: "trigger" }),
    stage({ phase: "collect" }),
    stage({ phase: "analyse", status: "in_progress" }),
    stage({ phase: "approve", status: "waiting" }),
    stage({ phase: "continue", status: "waiting" }),
  ];
  assert.equal(liveStageIndex(stages), 2);
});

test("an approval waiting on a person is what the rail opens on", () => {
  const stages = [
    stage({ phase: "collect" }),
    stage({ phase: "recommend" }),
    stage({ phase: "approve", sourceKind: "user-input", status: "requires_review" }),
    stage({ phase: "execute", status: "waiting" }),
  ];
  assert.equal(liveStageIndex(stages), 2);
});

test("a skipped phase is never the one presented as current", () => {
  const stages = [
    stage({ phase: "collect" }),
    stage({ phase: "approve", status: "skipped" }),
  ];
  assert.equal(liveStageIndex(stages), 0);
});

test("nothing has happened yet — the first phase, and no crash on an empty list", () => {
  assert.equal(liveStageIndex([stage({ status: "waiting" })]), 0);
  assert.equal(liveStageIndex([]), 0);
});
