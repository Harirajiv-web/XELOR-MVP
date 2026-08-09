import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "@ind-core/platform";
import { tenantIdFromVerifiedGroups } from "./tenant-groups.js";

describe("tenantIdFromVerifiedGroups", () => {
  it("maps one verified tenant group and tolerates duplicates", () => {
    assert.equal(
      tenantIdFromVerifiedGroups(["/trishul", "trishul", "unmapped"]),
      "0192a8c0-0000-7000-8000-000000000001",
    );
  });

  it("rejects a verified identity mapped to multiple tenants", () => {
    assert.throws(
      () => tenantIdFromVerifiedGroups(["trishul", "/kaveri"]),
      (error) => error instanceof AppError && error.code === "TENANT_AMBIGUOUS" && error.httpStatus === 403,
    );
  });

  it("rejects an identity with no known tenant", () => {
    assert.throws(
      () => tenantIdFromVerifiedGroups(["unknown"]),
      (error) => error instanceof AppError && error.code === "TENANT_MISSING",
    );
  });
});
