import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "@ind-core/platform";
import { resolveDomainApiOrigin } from "./domain-client.js";

test("Vercel fails closed when API_SELF_ORIGIN is not explicit", () => {
  assert.throws(
    () => resolveDomainApiOrigin({ VERCEL: "1", PORT: "3000" }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "IMPORT_SELF_ORIGIN_REQUIRED" &&
      error.httpStatus === 503,
  );
});

test("Lambda fails closed when API_SELF_ORIGIN is not explicit", () => {
  assert.throws(
    () => resolveDomainApiOrigin({ AWS_LAMBDA_FUNCTION_NAME: "xelor-api", PORT: "3000" }),
    (error: unknown) => error instanceof AppError && error.code === "IMPORT_SELF_ORIGIN_REQUIRED",
  );
});

test("an explicit serverless API origin is normalized and accepted", () => {
  assert.equal(
    resolveDomainApiOrigin({
      VERCEL: "1",
      API_SELF_ORIGIN: "https://xelor-api.example.com/",
    }),
    "https://xelor-api.example.com",
  );
});

test("ordinary local/container processes retain the loopback listener default", () => {
  assert.equal(resolveDomainApiOrigin({ PORT: "3100" }), "http://127.0.0.1:3100");
  assert.equal(resolveDomainApiOrigin({ API_PORT: "3200" }), "http://127.0.0.1:3200");
});

test("API_SELF_ORIGIN refuses paths, credentials and non-http schemes", () => {
  for (const value of [
    "https://api.example.com/base",
    "https://user:secret@api.example.com",
    "file:///tmp/socket",
  ]) {
    assert.throws(
      () => resolveDomainApiOrigin({ API_SELF_ORIGIN: value }),
      (error: unknown) => error instanceof AppError && error.code === "IMPORT_SELF_ORIGIN_INVALID",
    );
  }
});
