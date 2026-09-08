import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * MACHINE ACCESS (ADMINISTRATION §9.7 `api_key`).
 *
 * A kiosk on the shop floor, a weighbridge, an OT gateway. None of them can complete an
 * OIDC code flow, so they carry a key — and a key is a password that never changes and is
 * written on a device somebody can walk away with.
 *
 * Four properties follow from that, and each is a decision:
 *
 *  - **The secret is stored hashed and shown exactly once.** A key you can read back from
 *    the console is a key every admin who ever looked at the console still has.
 *  - **The prefix is stored in clear** so a leaked key found in a log can be identified and
 *    revoked without anybody having to guess which one it is.
 *  - **Scopes are explicit and narrow.** A kiosk that posts production output gets
 *    `production.output.create` and nothing else; the blast radius of a stolen device is
 *    then the thing it was allowed to do anyway.
 *  - **Comparison is constant-time.** Comparing hashes with `===` leaks their length and
 *    their prefix through timing, and this is the one comparison in the system where an
 *    attacker controls the input and can run it a million times.
 */

export const KEY_PREFIX_LENGTH = 12;

export interface IssuedApiKey {
  /** Shown ONCE. Never stored, never logged, never recoverable. */
  secret: string;
  prefix: string;
  secretHash: string;
}

export function issueApiKey(environment: "live" | "test" = "live"): IssuedApiKey {
  const body = randomBytes(24).toString("base64url");
  const prefix = `ik_${environment === "test" ? "t" : "l"}_${randomBytes(4).toString("hex")}`.slice(0, KEY_PREFIX_LENGTH);
  const secret = `${prefix}.${body}`;
  return { secret, prefix, secretHash: hashSecret(secret) };
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function verifySecret(presented: string, storedHash: string): boolean {
  const a = Buffer.from(hashSecret(presented), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function prefixOf(secret: string): string {
  const dot = secret.indexOf(".");
  return dot > 0 ? secret.slice(0, dot) : secret.slice(0, KEY_PREFIX_LENGTH);
}

export interface ApiKeyRecord {
  prefix: string;
  secretHash: string;
  scopes: readonly string[];
  status: "active" | "revoked" | "expired";
  expiresAt?: string | null;
  ipAllowlist?: readonly string[];
  rateLimitRpm: number;
}

export interface KeyCheck {
  ok: boolean;
  reason: string;
  /** Distinguishes "this key is wrong" from "this key may not do that". */
  code: "ok" | "unknown_key" | "bad_secret" | "revoked" | "expired" | "scope_denied" | "ip_denied";
}

/**
 * Authenticate and authorise one call.
 *
 * A revoked key is reported as revoked rather than as unknown. That is deliberate: the
 * holder of a revoked key is usually a device somebody forgot to reconfigure, and telling
 * its operator "unknown key" sends them to issue a second key instead of finding out why
 * the first one was revoked.
 */
export function checkApiKey(
  presented: string,
  record: ApiKeyRecord | null,
  required: { scope: string; ip?: string | null; asOf: string },
): KeyCheck {
  if (!record) return { ok: false, code: "unknown_key", reason: "No API key with that prefix exists." };
  if (!verifySecret(presented, record.secretHash)) {
    return { ok: false, code: "bad_secret", reason: "The key prefix is known but the secret does not match." };
  }
  if (record.status === "revoked") {
    return { ok: false, code: "revoked", reason: `This key was revoked. If a device is still using it, reconfigure the device — do not issue a second key alongside it.` };
  }
  if (record.expiresAt && Date.parse(record.expiresAt) <= Date.parse(required.asOf)) {
    return { ok: false, code: "expired", reason: `This key expired on ${record.expiresAt.slice(0, 10)}.` };
  }
  if (record.ipAllowlist && record.ipAllowlist.length > 0 && required.ip && !record.ipAllowlist.includes(required.ip)) {
    return { ok: false, code: "ip_denied", reason: `Calls from ${required.ip} are not on this key's allowlist.` };
  }
  if (!record.scopes.includes(required.scope)) {
    return {
      ok: false,
      code: "scope_denied",
      reason: `This key is scoped to ${record.scopes.join(", ") || "nothing"} and does not include ${required.scope}. Widen the scope deliberately or use a different key.`,
    };
  }
  return { ok: true, code: "ok", reason: `Authorised for ${required.scope}.` };
}

/**
 * A fixed-window rate limit, evaluated from a count the caller supplies.
 *
 * Deliberately not a token bucket held in memory: a limit that lives in one process is not
 * a limit once there are two processes, and pretending otherwise is worse than a coarse
 * window that is actually shared.
 */
export function rateLimitVerdict(
  used: number,
  limitRpm: number,
): { allowed: boolean; remaining: number; reason: string } {
  const remaining = Math.max(0, limitRpm - used);
  if (used >= limitRpm) {
    return { allowed: false, remaining: 0, reason: `Rate limit of ${limitRpm} requests/minute reached for this key.` };
  }
  return { allowed: true, remaining, reason: `${remaining} of ${limitRpm} requests remaining this minute.` };
}
