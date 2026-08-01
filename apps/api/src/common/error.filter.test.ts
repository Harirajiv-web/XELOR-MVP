import assert from "node:assert/strict";
import test from "node:test";
import { postgresError } from "./error.filter.js";

test("finds a direct PostgreSQL constraint error", () => {
  assert.equal(postgresError({ code: "23505", detail: "private database detail" })?.code, "23505");
});

test("finds a PostgreSQL constraint error wrapped by an ORM", () => {
  assert.equal(postgresError({ cause: { cause: { code: "23503" } } })?.code, "23503");
});

test("does not mistake arbitrary application errors for PostgreSQL errors", () => {
  assert.equal(postgresError(new Error("duplicate")), null);
  const cyclic: { cause?: unknown } = {};
  cyclic.cause = cyclic;
  assert.equal(postgresError(cyclic), null);
});
