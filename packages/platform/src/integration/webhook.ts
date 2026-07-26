import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * OUTBOUND WEBHOOKS (INTEGRATION §11).
 *
 * A webhook is an HTTP call to somebody else's server carrying our data. Three things have
 * to be true or it is a liability rather than a feature:
 *
 *  - **The receiver can prove it came from us.** HMAC over `timestamp.payload`, in the
 *    `t=…,v1=…` form the ecosystem already understands. Signing the payload alone lets an
 *    attacker replay a valid old message forever; binding the timestamp INTO the signature
 *    is what makes the replay window enforceable rather than advisory.
 *  - **We stop calling a dead endpoint.** Consecutive failures auto-pause the subscription.
 *    An integration that retries a customer's decommissioned URL for six months is a
 *    denial-of-service we are running against somebody who left.
 *  - **A secret can be rotated without an outage.** During the grace period both the new
 *    and the previous secret verify, so the receiver can redeploy on their own schedule
 *    instead of ours.
 */

export const SIGNATURE_HEADER = "x-indcore-signature";
export const DEFAULT_REPLAY_WINDOW_SECONDS = 300;

/** `t=<unix seconds>,v1=<hex hmac of "t.payload">`. */
export function signWebhook(payload: string, secret: string, timestampSeconds: number): string {
  const v1 = createHmac("sha256", secret).update(`${timestampSeconds}.${payload}`).digest("hex");
  return `t=${timestampSeconds},v1=${v1}`;
}

export interface SignatureCheck {
  ok: boolean;
  code: "ok" | "malformed" | "stale" | "future" | "mismatch";
  reason: string;
  /** Which secret verified it — useful during a rotation grace period. */
  matched?: "current" | "previous";
}

function parseHeader(header: string): { t: number; v1: string } | null {
  const parts = Object.fromEntries(
    header
      .split(",")
      .map((p) => p.trim().split("="))
      .filter((kv): kv is [string, string] => kv.length === 2),
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1) return null;
  return { t, v1: parts.v1 };
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * Verify an inbound signature.
 *
 * The replay window is checked BEFORE the HMAC and in both directions. A future timestamp
 * is rejected too — otherwise an attacker who captures one valid message can set `t` far
 * ahead and replay it for as long as they like, and the window becomes decoration.
 */
export function verifyWebhook(input: {
  payload: string;
  header: string;
  secret: string;
  previousSecret?: string | null;
  nowSeconds: number;
  windowSeconds?: number;
}): SignatureCheck {
  const parsed = parseHeader(input.header);
  if (!parsed) {
    return { ok: false, code: "malformed", reason: `Signature header is not in the form 't=…,v1=…'.` };
  }
  const window = input.windowSeconds ?? DEFAULT_REPLAY_WINDOW_SECONDS;
  const age = input.nowSeconds - parsed.t;
  if (age > window) {
    return { ok: false, code: "stale", reason: `Signature is ${age}s old; the replay window is ${window}s.` };
  }
  if (age < -window) {
    return { ok: false, code: "future", reason: `Signature is timestamped ${Math.abs(age)}s in the future. Rejecting — otherwise one captured message replays indefinitely.` };
  }

  const expected = createHmac("sha256", input.secret).update(`${parsed.t}.${input.payload}`).digest("hex");
  if (safeEqualHex(expected, parsed.v1)) {
    return { ok: true, code: "ok", reason: "Signature valid.", matched: "current" };
  }
  if (input.previousSecret) {
    const prev = createHmac("sha256", input.previousSecret).update(`${parsed.t}.${input.payload}`).digest("hex");
    if (safeEqualHex(prev, parsed.v1)) {
      return { ok: true, code: "ok", reason: "Signature valid against the PREVIOUS secret — this subscription is mid-rotation.", matched: "previous" };
    }
  }
  return { ok: false, code: "mismatch", reason: "Signature does not match. The payload or the secret is wrong." };
}

/* -------------------------------------------------------------------------- */
/*  Delivery health                                                           */
/* -------------------------------------------------------------------------- */

export type SubscriptionStatus = "active" | "paused" | "auto_paused";

export interface DeliveryHealth {
  status: SubscriptionStatus;
  consecutiveFailures: number;
  shouldAutoPause: boolean;
  message: string;
}

export const AUTO_PAUSE_AFTER = 20;

/**
 * Whether to stop calling this endpoint.
 *
 * Twenty consecutive failures with no success in between is not a blip. Continuing is a
 * slow denial-of-service against somebody who very likely decommissioned the URL — and it
 * fills our own queues with work that cannot succeed.
 */
export function deliveryHealth(input: {
  status: SubscriptionStatus;
  consecutiveFailures: number;
  lastOutcome: "success" | "failure";
}): DeliveryHealth {
  if (input.lastOutcome === "success") {
    return {
      status: input.status === "auto_paused" ? "active" : input.status,
      consecutiveFailures: 0,
      shouldAutoPause: false,
      message: input.status === "auto_paused" ? "Delivered — the subscription is un-paused automatically." : "Delivered.",
    };
  }
  const failures = input.consecutiveFailures + 1;
  if (failures >= AUTO_PAUSE_AFTER && input.status === "active") {
    return {
      status: "auto_paused",
      consecutiveFailures: failures,
      shouldAutoPause: true,
      message: `Paused after ${failures} consecutive failures. Continuing would be a slow denial-of-service against an endpoint that has very likely gone away.`,
    };
  }
  return { status: input.status, consecutiveFailures: failures, shouldAutoPause: false, message: `Failure ${failures} of ${AUTO_PAUSE_AFTER} before auto-pause.` };
}

/**
 * A rotation with a grace period.
 *
 * The previous secret keeps verifying until the grace expires, so the receiver redeploys on
 * their schedule. Rotating without a grace period means every rotation is a coordinated
 * outage, so in practice nobody rotates.
 */
export function rotationPlan(input: { rotatedAt: string; graceHours?: number }): {
  graceUntil: string;
  message: string;
} {
  const grace = input.graceHours ?? 48;
  const until = new Date(Date.parse(input.rotatedAt) + grace * 3_600_000).toISOString();
  return {
    graceUntil: until,
    message: `Both secrets verify until ${until.slice(0, 16).replace("T", " ")} UTC. The receiver can redeploy on their own schedule; a rotation with no grace period is a coordinated outage, which is why nobody does it.`,
  };
}
