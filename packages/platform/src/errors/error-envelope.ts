/**
 * The single platform-wide error envelope (DECISIONS-V2 §5.3) — NOT raw RFC 7807
 * per module. Every module's HTTP errors serialize to exactly this shape so the
 * frontend and integrators parse one contract.
 */
export interface ErrorEnvelope {
  error: {
    /** Stable machine code, SCREAMING_SNAKE, e.g. TENANT_MISSING, VALIDATION_FAILED. */
    code: string;
    /** Human-readable, safe to surface. Never leak internals or PII. */
    message: string;
    /** Optional per-field detail for validation failures. */
    details?: Array<{ field: string; message: string }>;
    /** Correlation id — ties the response to logs/traces (OTel). */
    traceId?: string;
  };
}

/**
 * Domain error carrying an HTTP status + canonical code. Thrown by services;
 * the API's exception filter renders it into an ErrorEnvelope.
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message: string,
    readonly details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = "AppError";
  }

  toEnvelope(traceId?: string): ErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
        ...(traceId ? { traceId } : {}),
      },
    };
  }
}

/** Common constructors so codes stay consistent across modules. */
export const Errors = {
  tenantMissing: () =>
    new AppError("TENANT_MISSING", 401, "No tenant in request context."),
  validation: (details: Array<{ field: string; message: string }>) =>
    new AppError("VALIDATION_FAILED", 422, "Request failed validation.", details),
  notFound: (what: string) =>
    new AppError("NOT_FOUND", 404, `${what} not found.`),
  conflict: (message: string) => new AppError("CONFLICT", 409, message),
  idempotencyMismatch: () =>
    new AppError(
      "IDEMPOTENCY_KEY_MISMATCH",
      409,
      "Idempotency-Key was reused with a different payload.",
    ),
} as const;
