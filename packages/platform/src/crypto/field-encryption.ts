import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "../errors/error-envelope.js";

/**
 * FIELD-LEVEL encryption for employee PII (HRM NFR-08, HR-06).
 *
 * The DPDP posture the blueprint commits to is precise, and worth restating because it is
 * unusual: employment data is a **"legitimate use" under s.7** — no consent theatre is
 * required — but the security safeguards, breach notification and rights handling apply
 * regardless, with penalties to ₹250 crore once obligations land 12/13 May 2027. Meanwhile
 * CERT-In obligations bind today.
 *
 * So PAN, Aadhaar and bank account numbers are encrypted at rest, masked by default, and
 * revealed only through an audited call. Marketing wording is always **"DPDP-ready"**,
 * never "DPDP-compliant", in 2026 (NFR-08).
 *
 * AES-256-GCM, with the tenant id and field name bound in as **additional authenticated
 * data**. That last part matters more than it looks: a ciphertext lifted from one tenant's
 * row and pasted into another's will not decrypt, so a row-level mix-up fails loudly
 * instead of leaking. Column-level encryption alone would not give you that.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const ENVELOPE_VERSION = "v1";

/** Resolve the data-encryption key. Fails CLOSED — an absent key must never mean plaintext. */
export function resolveFieldKey(raw: string | undefined = process.env.PII_ENCRYPTION_KEY): Buffer {
  if (!raw) {
    throw new AppError(
      "PII_KEY_MISSING",
      500,
      "PII_ENCRYPTION_KEY is not configured; refusing to handle employee PII.",
    );
  }
  // Accept a 32-byte key as base64 or hex; anything else is derived, never silently padded.
  const asBuf = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (asBuf.length === 32) return asBuf;
  // A passphrase is hashed to a full-strength key rather than truncated or zero-padded.
  return createHash("sha256").update(raw, "utf8").digest();
}

export interface FieldContext {
  tenantId: string;
  /** e.g. "employee.pan". Bound into the AAD so a ciphertext cannot be moved between fields. */
  field: string;
}

function aad(ctx: FieldContext): Buffer {
  return Buffer.from(`${ctx.tenantId}|${ctx.field}`, "utf8");
}

/**
 * Encrypt one field. The envelope is self-describing (`v1:iv:tag:ciphertext`, base64url) so
 * a future key rotation or algorithm change can be told apart from old data at read time
 * rather than guessed.
 */
export function encryptField(plaintext: string, ctx: FieldContext, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(aad(ctx));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENVELOPE_VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(":");
}

export function decryptField(envelope: string, ctx: FieldContext, key: Buffer): string {
  const parts = envelope.split(":");
  if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) {
    throw new AppError("PII_ENVELOPE_INVALID", 500, "Encrypted field is not a recognised envelope.");
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(parts[1]!, "base64url"));
    decipher.setAAD(aad(ctx));
    decipher.setAuthTag(Buffer.from(parts[2]!, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3]!, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key, wrong tenant, wrong field, or tampered ciphertext — all indistinguishable
    // to a caller on purpose.
    throw new AppError("PII_DECRYPT_FAILED", 500, "Encrypted field could not be authenticated.");
  }
}

/* -------------------------------------------------------------------------- */
/* Masking — what every screen and every API response shows by default          */
/* -------------------------------------------------------------------------- */

/** PAN: ABCDE1234F → XXXXXXX234F-style, keeping only the last four. */
export function maskPan(pan: string): string {
  if (pan.length <= 4) return "*".repeat(pan.length);
  return "*".repeat(pan.length - 4) + pan.slice(-4);
}

/** Aadhaar: the last four digits only, in the UIDAI-conventional grouping. */
export function maskAadhaar(aadhaar: string): string {
  const digits = aadhaar.replace(/\D/g, "");
  if (digits.length < 4) return "XXXX XXXX XXXX";
  return `XXXX XXXX ${digits.slice(-4)}`;
}

/** Bank account: last four, which is all a payslip or a support call ever needs. */
export function maskAccountNumber(account: string): string {
  const t = account.trim();
  if (t.length <= 4) return "*".repeat(t.length);
  return "*".repeat(Math.max(4, t.length - 4)) + t.slice(-4);
}

export type PiiField = "pan" | "aadhaar" | "bank_account";

export function maskFor(field: PiiField, value: string): string {
  if (field === "pan") return maskPan(value);
  if (field === "aadhaar") return maskAadhaar(value);
  return maskAccountNumber(value);
}

/* -------------------------------------------------------------------------- */
/* Format checks — cheap, and they catch the paste-into-the-wrong-box mistake   */
/* -------------------------------------------------------------------------- */

/** Five letters, four digits, one letter. The 4th letter encodes the holder type. */
export function isValidPanFormat(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.trim().toUpperCase());
}

/**
 * Aadhaar is 12 digits with a Verhoeff checksum. Validating it locally means a typo is
 * caught before the number is encrypted and becomes expensive to inspect.
 */
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function isValidAadhaarFormat(aadhaar: string): boolean {
  const digits = aadhaar.replace(/\s/g, "");
  if (!/^[2-9][0-9]{11}$/.test(digits)) return false; // UIDAI never issues a leading 0 or 1
  let c = 0;
  const reversed = digits.split("").reverse().map(Number);
  for (const [i, n] of reversed.entries()) c = VERHOEFF_D[c]![VERHOEFF_P[i % 8]![n]!]!;
  return c === 0;
}

/**
 * Constant-time comparison, for the rare case where a stored PII value must be matched
 * without being revealed (duplicate-PAN detection). Length is not secret; content is.
 */
export function piiEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
