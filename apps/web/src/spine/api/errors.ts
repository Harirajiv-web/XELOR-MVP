/**
 * The backend's canonical error envelope, on the client side of the wire.
 *
 * The API answers EVERY failure with one shape. Mirroring it here rather than parsing it
 * ad hoc in each screen is what lets the UI tell four genuinely different situations
 * apart — and they are different, whatever they look like in a stack trace:
 *
 *   - THE SYSTEM BROKE (500). Not the user's fault, nothing they can do, show the traceId
 *     so support can find it in one query.
 *   - THEY ARE NOT ALLOWED (403). Not a bug. Naming the missing permission turns a dead
 *     end into a sentence they can take to their administrator.
 *   - THEY TYPED SOMETHING WRONG (422). Field-level, fixable, belongs next to the input.
 *   - SOMEBODY ELSE GOT THERE FIRST (409). The document moved on; reload, don't retry.
 *
 * Rendering all four as "an error occurred" is how a product teaches its users that
 * errors are noise.
 */

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
    traceId?: string;
  };
}

export type ErrorKind =
  | "unauthenticated"
  | "forbidden"
  | "validation"
  | "conflict"
  | "not_found"
  | "rate_limited"
  | "network"
  | "server";

export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details: ReadonlyArray<{ field: string; message: string }>;
  readonly traceId: string | undefined;

  constructor(input: {
    code: string;
    message: string;
    httpStatus: number;
    details?: Array<{ field: string; message: string }>;
    traceId?: string;
  }) {
    super(input.message);
    this.name = "AppError";
    this.code = input.code;
    this.httpStatus = input.httpStatus;
    this.details = input.details ?? [];
    this.traceId = input.traceId;
  }

  static fromEnvelope(envelope: ErrorEnvelope | null, httpStatus: number): AppError {
    const e = envelope?.error;
    if (!e?.code) {
      return new AppError({
        code: httpStatus >= 500 ? "INTERNAL" : "REQUEST_FAILED",
        message:
          httpStatus >= 500
            ? "Something went wrong at our end."
            : "The request was refused.",
        httpStatus,
      });
    }
    return new AppError({
      code: e.code,
      message: e.message,
      httpStatus,
      details: e.details ?? [],
      traceId: e.traceId,
    });
  }

  /** Which of the four situations this is — decides which component renders it. */
  get kind(): ErrorKind {
    if (this.httpStatus === 0) return "network";
    if (this.httpStatus === 401) return "unauthenticated";
    if (this.httpStatus === 403) return "forbidden";
    if (this.httpStatus === 404) return "not_found";
    if (this.httpStatus === 409) return "conflict";
    if (this.httpStatus === 422 || this.httpStatus === 400) return "validation";
    if (this.httpStatus === 429) return "rate_limited";
    return "server";
  }

  /**
   * The permission a 403 was missing, pulled out of the backend's message.
   *
   * The API says "Missing permission: planning.mrp.read." because a person can act on
   * that — they can ask for it by name. Extracting it lets the screen say so instead of
   * "access denied", which tells them only that they are stuck.
   */
  get missingPermission(): string | null {
    const m = /Missing permission:\s*([a-z0-9_.]+)/i.exec(this.message);
    return m?.[1] ?? null;
  }

  /** Field errors keyed by field name, for putting messages next to inputs. */
  byField(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details) out[d.field] = d.message;
    return out;
  }
}
