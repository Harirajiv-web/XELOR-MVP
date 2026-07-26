import type { ErrorCategory } from "./retry.js";

/**
 * THE DEAD-LETTER QUEUE AND ITS TRIAGE (INTEGRATION §11, §13).
 *
 * INTEGRATION is the one module in the registry with an explicit NULL AI entry
 * (`integrations.no_mvp_ai`), and this table is why. Triaging a failed message is a lookup:
 * the error category already determines what a human should do about it, and a model
 * guessing at that would be slower, less consistent and impossible to audit — while adding
 * the one failure mode this queue cannot afford, which is a confident wrong answer about a
 * statutory document.
 *
 * The deterministic table IS the feature. It is also the registered baseline any future
 * model would have to beat.
 *
 * The other half of this file is the replay guard. A dead-letter queue whose contents can
 * be replayed with one click is a way to submit the same invoice to the tax portal four
 * times, so replay is refused for anything that might already have taken effect.
 */

export type DlqStatus = "new" | "retrying" | "resolved" | "ignored";

export interface TriageRule {
  category: ErrorCategory;
  severity: "critical" | "high" | "medium" | "low";
  suggestedAction: string;
  replayable: boolean;
  ownerHint: string;
}

/**
 * The triage table. One row per error category, and the mapping never guesses.
 */
export const TRIAGE_RULES: Readonly<Record<ErrorCategory, TriageRule>> = {
  validation: {
    category: "validation",
    severity: "high",
    suggestedAction: "Fix the source document, then re-send it from the document rather than replaying this message. The payload was rejected on its content and will be rejected identically.",
    replayable: false,
    ownerHint: "the team that owns the document",
  },
  transform: {
    category: "transform",
    severity: "high",
    suggestedAction: "Fix the field mapping on the flow, then replay. Replaying before fixing runs the same broken mapping again.",
    replayable: false,
    ownerHint: "integration owner",
  },
  auth: {
    category: "auth",
    severity: "critical",
    suggestedAction: "Rotate or re-enter the credential for this connection, confirm it against the endpoint, then replay. Do not retry in a loop — that is how the account gets locked.",
    replayable: true,
    ownerHint: "integration owner",
  },
  timeout: {
    category: "timeout",
    severity: "critical",
    suggestedAction: "CHECK THE OTHER END FIRST. A timeout is not a failure — the far side may have processed it. Fetch the document's status before replaying anything.",
    replayable: false,
    ownerHint: "integration owner",
  },
  rate_limit: {
    category: "rate_limit",
    severity: "medium",
    suggestedAction: "Wait for the limit to reset and replay. If it recurs, lower the flow's concurrency rather than retrying harder.",
    replayable: true,
    ownerHint: "integration owner",
  },
  downstream: {
    category: "downstream",
    severity: "high",
    suggestedAction: "The other end failed. Confirm it is healthy, then replay in a batch.",
    replayable: true,
    ownerHint: "integration owner",
  },
  unknown: {
    category: "unknown",
    severity: "high",
    suggestedAction: "Read the stored response before doing anything. An unrecognised failure replayed blindly is the one that duplicates a document.",
    replayable: false,
    ownerHint: "integration owner",
  },
};

export function triage(category: ErrorCategory): TriageRule {
  return TRIAGE_RULES[category] ?? TRIAGE_RULES.unknown;
}

export interface DlqEntry {
  id: string;
  flowCode: string;
  correlationId: string;
  errorCategory: ErrorCategory;
  attempts: number;
  status: DlqStatus;
  /** True when the message may already have taken effect on the far side. */
  sideEffectPossible: boolean;
  /** Statutory documents get a harder guard than telemetry. */
  isStatutory: boolean;
}

export interface ReplayVerdict {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason: string;
}

/**
 * Whether a dead-lettered message may be replayed.
 *
 * The guards are deliberately conservative and they are the point of the queue. A DLQ that
 * replays anything on one click is a way to submit the same invoice to the tax portal four
 * times — and unlike most mistakes in an ERP, that one is visible to a regulator.
 */
export function canReplay(entry: DlqEntry): ReplayVerdict {
  if (entry.status === "resolved" || entry.status === "ignored") {
    return { allowed: false, requiresConfirmation: false, reason: `This entry is already ${entry.status}. Replaying a settled entry is how the same message goes out twice.` };
  }
  if (entry.errorCategory === "timeout" && entry.sideEffectPossible) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: "Refused: this timed out against a system that may already have processed it. Fetch the document's current state first — a duplicate statutory filing cannot be withdrawn.",
    };
  }
  const rule = triage(entry.errorCategory);
  if (!rule.replayable) {
    return { allowed: false, requiresConfirmation: false, reason: `Refused: ${rule.suggestedAction}` };
  }
  if (entry.isStatutory) {
    return {
      allowed: true,
      requiresConfirmation: true,
      reason: "Allowed, but this is a statutory document. Confirm explicitly — a duplicate filing is visible to a regulator and cannot be quietly undone.",
    };
  }
  return { allowed: true, requiresConfirmation: false, reason: rule.suggestedAction };
}

export interface DlqSummary {
  total: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  replayableNow: number;
  needsHumanFirst: number;
  headline: string;
}

export function summariseDlq(entries: readonly DlqEntry[]): DlqSummary {
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let replayableNow = 0;
  let needsHumanFirst = 0;

  for (const e of entries) {
    const rule = triage(e.errorCategory);
    byCategory[e.errorCategory] = (byCategory[e.errorCategory] ?? 0) + 1;
    bySeverity[rule.severity] = (bySeverity[rule.severity] ?? 0) + 1;
    if (canReplay(e).allowed) replayableNow += 1;
    else needsHumanFirst += 1;
  }

  const critical = bySeverity.critical ?? 0;
  return {
    total: entries.length,
    byCategory,
    bySeverity,
    replayableNow,
    needsHumanFirst,
    headline:
      entries.length === 0
        ? "The dead-letter queue is empty."
        : critical > 0
          ? `${entries.length} dead-lettered message(s); ${critical} critical. ${needsHumanFirst} need a person to look before anything is replayed.`
          : `${entries.length} dead-lettered message(s), none critical. ${replayableNow} can be replayed as a batch.`,
  };
}

/**
 * Redact a payload before it is stored.
 *
 * A dead-letter queue is the one place in the system where raw third-party payloads pile
 * up and stay — which makes it the most likely place for a credential or a PAN to be sitting
 * in plain text a year later.
 */
const SENSITIVE_KEY = /pass(word)?|secret|token|auth|api[_-]?key|otp|pan\b|aadhaar|account[_-]?no|ifsc|cvv/i;

export function redactPayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return "…";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactPayload(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redactPayload(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 2000) return `${value.slice(0, 2000)}… [${value.length} chars]`;
  return value;
}
