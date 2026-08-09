import assert from "node:assert/strict";
import { test } from "node:test";
import { tokenTargetsClient } from "./token-audience.js";

test("accepts the configured Keycloak client through aud or azp", () => {
  assert.equal(tokenTargetsClient({ aud: "indcore-api" }, "indcore-api"), true);
  assert.equal(tokenTargetsClient({ aud: ["account", "indcore-api"] }, "indcore-api"), true);
  assert.equal(tokenTargetsClient({ aud: "account", azp: "indcore-api" }, "indcore-api"), true);
});

test("rejects a valid same-realm token minted for another client", () => {
  assert.equal(tokenTargetsClient({ aud: "account", azp: "other-client" }, "indcore-api"), false);
  assert.equal(tokenTargetsClient({}, "indcore-api"), false);
});
