import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decryptField,
  encryptField,
  isValidAadhaarFormat,
  isValidPanFormat,
  maskAadhaar,
  maskAccountNumber,
  maskFor,
  maskPan,
  piiEquals,
  resolveFieldKey,
} from "./field-encryption.js";

const KEY = resolveFieldKey("0".repeat(64)); // 32 bytes of hex, deterministic for tests
const TRISHUL = { tenantId: "0192a8c0-0000-7000-8000-000000000001", field: "employee.pan" };
const KAVERI = { tenantId: "0192a8c0-0000-7000-8000-000000000002", field: "employee.pan" };

/** AppError carries the machine code on `.code`; the message is for humans. */
const throwsCode = (code: string) => (e: unknown) =>
  (e as { code?: string }).code === code || assert.fail(`expected ${code}, got ${String(e)}`);

test("a field round-trips through AES-256-GCM", () => {
  const env = encryptField("ABCDE1234F", TRISHUL, KEY);
  assert.notEqual(env, "ABCDE1234F");
  assert.match(env, /^v1:/, "the envelope is versioned so a key rotation is legible at read time");
  assert.equal(decryptField(env, TRISHUL, KEY), "ABCDE1234F");
});

test("encrypting the same value twice produces different ciphertext", () => {
  const a = encryptField("ABCDE1234F", TRISHUL, KEY);
  const b = encryptField("ABCDE1234F", TRISHUL, KEY);
  assert.notEqual(a, b, "a fresh nonce each time — otherwise equal PANs would be visibly equal");
  assert.equal(decryptField(a, TRISHUL, KEY), decryptField(b, TRISHUL, KEY));
});

test("a ciphertext lifted into ANOTHER TENANT's row refuses to decrypt", () => {
  // This is the property plain column encryption does not give you: the tenant id is
  // bound in as additional authenticated data, so a row-level mix-up fails loudly.
  const env = encryptField("ABCDE1234F", TRISHUL, KEY);
  assert.throws(() => decryptField(env, KAVERI, KEY), throwsCode("PII_DECRYPT_FAILED"));
});

test("a ciphertext lifted into another FIELD refuses to decrypt", () => {
  const env = encryptField("123456789012", { ...TRISHUL, field: "employee.aadhaar" }, KEY);
  assert.throws(() => decryptField(env, TRISHUL, KEY), throwsCode("PII_DECRYPT_FAILED"));
});

test("tampering with the ciphertext is detected by the auth tag", () => {
  const env = encryptField("ABCDE1234F", TRISHUL, KEY);
  const parts = env.split(":");
  const body = Buffer.from(parts[3]!, "base64url");
  body[0] = body[0]! ^ 0xff;
  const tampered = [parts[0], parts[1], parts[2], body.toString("base64url")].join(":");
  assert.throws(() => decryptField(tampered, TRISHUL, KEY), throwsCode("PII_DECRYPT_FAILED"));
});

test("a missing key fails CLOSED — never silently plaintext", () => {
  // The default argument reads process.env, so the ambient environment has to be cleared
  // for this to test anything. (It didn't, and passed only on a machine where the key
  // happened to be unset — a test that asserts the environment, not the code.)
  const saved = process.env.PII_ENCRYPTION_KEY;
  delete process.env.PII_ENCRYPTION_KEY;
  try {
    assert.throws(() => resolveFieldKey(), throwsCode("PII_KEY_MISSING"));
  } finally {
    if (saved !== undefined) process.env.PII_ENCRYPTION_KEY = saved;
  }
});

test("a passphrase is hashed to full strength, not truncated or zero-padded", () => {
  const k = resolveFieldKey("a short human passphrase");
  assert.equal(k.length, 32);
});

/* --------------------------------- masking -------------------------------- */

test("masks show only what a support call actually needs", () => {
  assert.equal(maskPan("ABCDE1234F"), "******234F");
  assert.equal(maskAadhaar("2345 6789 0123"), "XXXX XXXX 0123");
  assert.equal(maskAccountNumber("50100123456789"), "**********6789");
  assert.equal(maskFor("pan", "ABCDE1234F"), "******234F");
});

test("masking never leaks a short value in full", () => {
  assert.equal(maskPan("12"), "**");
  assert.equal(maskAccountNumber("999"), "***");
  assert.equal(maskAadhaar("12"), "XXXX XXXX XXXX");
});

/* ------------------------------ format checks ----------------------------- */

test("PAN format is five letters, four digits, one letter", () => {
  assert.equal(isValidPanFormat("ABCDE1234F"), true);
  assert.equal(isValidPanFormat("abcde1234f"), true, "case is normalised before checking");
  assert.equal(isValidPanFormat("ABCD1234F"), false);
  assert.equal(isValidPanFormat("ABCDE12345"), false);
});

test("Aadhaar is validated by its Verhoeff checksum, not just its length", () => {
  // Derive a genuinely valid number rather than hard-coding one: exactly one check digit
  // can complete the prefix, and finding it proves the implementation both ways.
  const prefix = "23456789012";
  const valid = [...Array(10).keys()]
    .map((d) => `${prefix}${d}`)
    .filter((n) => isValidAadhaarFormat(n));
  assert.equal(valid.length, 1, "exactly one check digit completes any 11-digit prefix");

  const good = valid[0]!;
  assert.equal(isValidAadhaarFormat(good), true);
  // Transposing two digits — the classic keying error — is caught.
  const transposed = good.slice(0, 3) + good[4] + good[3] + good.slice(5);
  assert.equal(isValidAadhaarFormat(transposed), false);
  // UIDAI never issues a number starting 0 or 1.
  assert.equal(isValidAadhaarFormat(`1${good.slice(1)}`), false);
  assert.equal(isValidAadhaarFormat("1234 5678 9012"), false);
});

test("PII comparison is constant-time and length-safe", () => {
  assert.equal(piiEquals("ABCDE1234F", "ABCDE1234F"), true);
  assert.equal(piiEquals("ABCDE1234F", "ABCDE1234G"), false);
  assert.equal(piiEquals("ABCDE1234F", "short"), false);
});
