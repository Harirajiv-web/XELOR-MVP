import assert from "node:assert/strict";
import { test } from "node:test";
import { canResumeImportBatch } from "./dataimport.service.js";

test("an interrupted accepted row can resume from running, partial or failed batches", () => {
  assert.equal(canResumeImportBatch("running", 1), true);
  assert.equal(canResumeImportBatch("partial", 1), true);
  assert.equal(canResumeImportBatch("failed", 3), true);
});

test("a terminal batch without accepted work never advertises resumability", () => {
  assert.equal(canResumeImportBatch("partial", 0), false);
  assert.equal(canResumeImportBatch("failed", 0), false);
  assert.equal(canResumeImportBatch("completed", 2), false);
  assert.equal(canResumeImportBatch("unknown", 2), false);
});
