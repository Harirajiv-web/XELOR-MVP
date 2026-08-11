import assert from "node:assert/strict";
import { test } from "node:test";
import { formatImportFailureMessage } from "./dataimport.service.js";

test("domain validation detail leaves an actionable field-level import reason", () => {
  assert.equal(
    formatImportFailureMessage("Request failed validation.", [
      { field: "gstin", message: "checksum is invalid" },
      { field: "contactEmail", message: "must be a valid email address" },
    ]),
    "Request failed validation. gstin: checksum is invalid; contactEmail: must be a valid email address",
  );
});

test("malformed, primitive and null detail entries are ignored without hiding valid detail", () => {
  assert.equal(
    formatImportFailureMessage("Request failed validation.", [
      null,
      undefined,
      "not an envelope detail",
      42,
      {},
      { field: "gstin", message: "checksum is invalid" },
    ]),
    "Request failed validation. gstin: checksum is invalid",
  );
  assert.equal(
    formatImportFailureMessage("Request failed validation.", { field: "gstin" }),
    "Request failed validation.",
  );
  assert.equal(
    formatImportFailureMessage("Request failed validation.", [null, false, {}]),
    "Request failed validation.",
  );
});
