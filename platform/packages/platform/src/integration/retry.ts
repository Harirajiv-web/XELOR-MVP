/**
 * RETRY, BACKOFF AND THE CIRCUIT BREAKER (INTEGRATION §11).
 *
 * Everything in this module exists because the other end of an integration is not under
 * our control and will fail in ways we cannot fix. The only decisions available are: is it
 * worth trying again, how long to wait, and when to stop trying so we do not make somebody
 * else's outage worse.
 *
 * The classification is the load-bearing part. Retrying a validation error is pointless —
 * the payload will be just as wrong in thirty seconds — and it burns the retry budget that
 * a genuine timeout needed. Retrying an authentication failure is worse than pointless: it
 * is how an account gets locked out during an incident.
 */

export type FailureOutcome = "success" | "retryable" | "fatal";

export type ErrorCategory =
  | "validation"
  | "auth"
  | "transform"
  | "timeout"
  | "rate_limit"
  | "downstream"
  | "unknown";

export interface FailureClassification {
  outcome: FailureOutcome;
  category: ErrorCategory;
  reason: string;
  /** Honour the server's own instruction when it gave one. */
  retryAfterMs?: number;
}

/**
 * Classify one failure.
 *
 * HTTP status is the primary signal and the body is secondary, because a gateway that
 * returns 200 with an error body is common enough in Indian statutory APIs that trusting
 * the status alone loses real failures.
 */
export function classifyFailure(input: {
  httpStatus?: number | null;
  errorCode?: string | null;
  message?: string | null;
  timedOut?: boolean;
  retryAfterSeconds?: number | null;
}): FailureClassification {
  const retryAfterMs = input.retryAfterSeconds != null ? input.retryAfterSeconds * 1000 : undefined;

  if (input.timedOut) {
    return { outcome: "retryable", category: "timeout", reason: "The request timed out. The other end may still have processed it — check before sending again.", retryAfterMs };
  }

  const s = input.httpStatus ?? 0;

  if (s === 429) {
    return { outcome: "retryable", category: "rate_limit", reason: "Rate limited. Backing off is the only correct response; retrying faster makes it worse.", retryAfterMs };
  }
  if (s === 401 || s === 403) {
    // Deliberately FATAL. Retrying an auth failure is how an account gets locked out in
    // the middle of an incident, and no amount of waiting fixes a wrong credential.
    return { outcome: "fatal", category: "auth", reason: "Authentication or authorisation failed. Retrying will not fix a credential, and may lock the account.", retryAfterMs };
  }
  if (s === 408 || s === 425) {
    return { outcome: "retryable", category: "timeout", reason: "The other end asked for the request to be repeated.", retryAfterMs };
  }
  if (s >= 500) {
    return { outcome: "retryable", category: "downstream", reason: `The other end returned ${s}. Their problem, and it usually passes.`, retryAfterMs };
  }
  if (s === 409) {
    // A conflict on an idempotent submit almost always means it already succeeded.
    return { outcome: "fatal", category: "validation", reason: "Conflict — the document was almost certainly already accepted. Fetch its current state rather than sending again.", retryAfterMs };
  }
  if (s >= 400) {
    return { outcome: "fatal", category: "validation", reason: `The payload was rejected (${s}). It will be just as wrong in thirty seconds; fix it or send it to the dead-letter queue.`, retryAfterMs };
  }

  const msg = (input.message ?? "").toLowerCase();
  if (/timeout|timed out|econnreset|socket hang up|etimedout/.test(msg)) {
    return { outcome: "retryable", category: "timeout", reason: "Network-level failure. Worth another attempt.", retryAfterMs };
  }
  if (/enotfound|econnrefused|dns/.test(msg)) {
    return { outcome: "retryable", category: "downstream", reason: "The endpoint could not be reached at all.", retryAfterMs };
  }
  if (/schema|mapping|transform|parse|cast/.test(msg)) {
    return { outcome: "fatal", category: "transform", reason: "The message could not be transformed. Retrying runs the same broken mapping again.", retryAfterMs };
  }
  if (s > 0 && s < 300) {
    return { outcome: "success", category: "unknown", reason: "Succeeded." };
  }
  return { outcome: "retryable", category: "unknown", reason: "Unrecognised failure. Treated as retryable once, then dead-lettered — an unknown failure that is actually permanent costs one wasted attempt, and one that is transient costs a lost message.", retryAfterMs };
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Random spread applied to the delay, 0–1. Zero makes the jitter deterministic (tests). */
  jitterRatio: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 2_000,
  maxDelayMs: 300_000,
  jitterRatio: 0.2,
};

export interface RetryDecision {
  shouldRetry: boolean;
  attemptNo: number;
  delayMs: number;
  reason: string;
}

/**
 * Exponential backoff with jitter.
 *
 * The jitter is not decoration. Without it, everything that failed during one outage
 * retries at exactly the same instants afterwards, and the recovering system is hit by a
 * synchronised wave — which is how a downstream that just came back goes down again.
 *
 * `randomSource` is injected so a test can assert an exact delay instead of a range.
 */
export function nextRetry(
  classification: FailureClassification,
  attemptNo: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  randomSource: () => number = Math.random,
): RetryDecision {
  if (classification.outcome === "success") {
    return { shouldRetry: false, attemptNo, delayMs: 0, reason: "Succeeded." };
  }
  if (classification.outcome === "fatal") {
    return { shouldRetry: false, attemptNo, delayMs: 0, reason: `Not retryable: ${classification.reason}` };
  }
  if (attemptNo >= policy.maxAttempts) {
    return {
      shouldRetry: false,
      attemptNo,
      delayMs: 0,
      reason: `Retry budget exhausted after ${attemptNo} attempt(s). Dead-lettered rather than dropped — a message that disappears is worse than one that needs a human.`,
    };
  }

  // The server's own Retry-After wins. It knows when it will be ready and we do not.
  if (classification.retryAfterMs != null) {
    return {
      shouldRetry: true,
      attemptNo: attemptNo + 1,
      delayMs: Math.min(classification.retryAfterMs, policy.maxDelayMs),
      reason: `The other end asked for ${Math.round(classification.retryAfterMs / 1000)}s. Its instruction beats our schedule.`,
    };
  }

  const exponential = Math.min(policy.baseDelayMs * 2 ** attemptNo, policy.maxDelayMs);
  const jitter = exponential * policy.jitterRatio * (randomSource() * 2 - 1);
  const delayMs = Math.max(0, Math.round(exponential + jitter));
  return {
    shouldRetry: true,
    attemptNo: attemptNo + 1,
    delayMs,
    reason: `Attempt ${attemptNo + 1} of ${policy.maxAttempts} in ${Math.round(delayMs / 1000)}s.`,
  };
}

/* -------------------------------------------------------------------------- */
/*  The circuit breaker                                                       */
/* -------------------------------------------------------------------------- */

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitConfig {
  /** Consecutive failures that trip the breaker. */
  failureThreshold: number;
  /** How long to stay open before allowing one probe. */
  openMs: number;
  /** Consecutive successes in half-open before closing. */
  successThreshold: number;
}

export const DEFAULT_CIRCUIT: CircuitConfig = { failureThreshold: 5, openMs: 60_000, successThreshold: 2 };

export interface CircuitSnapshot {
  state: CircuitState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  openedAt: string | null;
}

export interface CircuitVerdict extends CircuitSnapshot {
  allowRequest: boolean;
  changed: boolean;
  message: string;
}

/**
 * Whether a call may go out right now.
 *
 * An open breaker fails FAST and locally. That is the point: when a statutory gateway is
 * down, the useful behaviour is to queue documents and tell the operator, not to spend
 * thirty seconds per invoice discovering the same outage over and over.
 */
export function circuitAllows(snapshot: CircuitSnapshot, now: string, config: CircuitConfig = DEFAULT_CIRCUIT): CircuitVerdict {
  if (snapshot.state === "closed") {
    return { ...snapshot, allowRequest: true, changed: false, message: "Circuit closed — calls flow normally." };
  }
  if (snapshot.state === "half_open") {
    return { ...snapshot, allowRequest: true, changed: false, message: "Circuit half-open — letting one probe through." };
  }
  const openedAt = snapshot.openedAt ? Date.parse(snapshot.openedAt) : 0;
  const elapsed = Date.parse(now) - openedAt;
  if (elapsed >= config.openMs) {
    return {
      ...snapshot,
      state: "half_open",
      allowRequest: true,
      changed: true,
      message: `Circuit has been open ${Math.round(elapsed / 1000)}s — trying one probe.`,
    };
  }
  return {
    ...snapshot,
    allowRequest: false,
    changed: false,
    message: `Circuit open for another ${Math.round((config.openMs - elapsed) / 1000)}s. Documents are being queued, not lost.`,
  };
}

export function recordCircuitResult(
  snapshot: CircuitSnapshot,
  outcome: "success" | "failure",
  now: string,
  config: CircuitConfig = DEFAULT_CIRCUIT,
): CircuitVerdict {
  if (outcome === "success") {
    const successes = snapshot.consecutiveSuccesses + 1;
    if (snapshot.state === "half_open" && successes >= config.successThreshold) {
      return { state: "closed", consecutiveFailures: 0, consecutiveSuccesses: 0, openedAt: null, allowRequest: true, changed: true, message: "Circuit closed — the endpoint is healthy again." };
    }
    return { ...snapshot, consecutiveFailures: 0, consecutiveSuccesses: successes, allowRequest: true, changed: snapshot.consecutiveFailures > 0, message: "Success recorded." };
  }

  const failures = snapshot.consecutiveFailures + 1;
  // A failure while probing re-opens immediately: the endpoint said it is still broken and
  // there is nothing to learn by asking again straight away.
  if (snapshot.state === "half_open") {
    return { state: "open", consecutiveFailures: failures, consecutiveSuccesses: 0, openedAt: now, allowRequest: false, changed: true, message: "The probe failed — circuit re-opened." };
  }
  if (failures >= config.failureThreshold) {
    return { state: "open", consecutiveFailures: failures, consecutiveSuccesses: 0, openedAt: now, allowRequest: false, changed: true, message: `Circuit opened after ${failures} consecutive failures. Calls will fail fast and locally until the endpoint recovers.` };
  }
  return { ...snapshot, consecutiveFailures: failures, consecutiveSuccesses: 0, allowRequest: true, changed: false, message: `Failure ${failures} of ${config.failureThreshold} before the circuit opens.` };
}
