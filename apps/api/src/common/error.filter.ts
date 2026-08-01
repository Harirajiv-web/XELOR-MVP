import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { AppError, type ErrorEnvelope } from "@ind-core/platform";

/**
 * Renders every thrown error as the ONE canonical error envelope (§5.3). Known
 * AppErrors carry their status + code; anything else becomes a generic 500 that
 * leaks nothing (no stack, no PII) but keeps the traceId for log correlation.
 */
@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    // A traceId the caller did not supply is MINTED here rather than omitted. The whole
    // point of the field is that a user reporting "it said something went wrong" can hand
    // over a string that finds the log line; an envelope with no id correlates to nothing.
    const traceId = String(req.header("x-trace-id") ?? "") || randomUUID();

    if (exception instanceof AppError) {
      res.status(exception.httpStatus).json(exception.toEnvelope(traceId));
      return;
    }

    // Nest's own HttpExceptions — chiefly the router's 404 for an unknown URL, but also
    // 405, 413 and the like — are not internal failures. Collapsing them into a 500 told
    // every caller that a typo'd path was a server fault, and logged each one as an
    // unhandled error. They carry a real status and a real reason; both are preserved.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === "string"
          ? body
          : ((body as { message?: unknown }).message ?? exception.message);
      const envelope: ErrorEnvelope = {
        error: {
          code: httpCode(status),
          message: Array.isArray(message) ? message.join("; ") : String(message),
          traceId,
        },
      };
      res.status(status).json(envelope);
      return;
    }

    // node-postgres errors can arrive directly or wrapped as `cause` by an ORM. A unique
    // collision is a caller-visible conflict, never an opaque server failure. Do not expose
    // the constraint or DETAIL string: both can reveal table and tenant data.
    const database = postgresError(exception);
    if (database?.code === "23505") {
      const envelope: ErrorEnvelope = {
        error: {
          code: "CONFLICT",
          message: "This request conflicts with a record that already exists.",
          traceId,
        },
      };
      res.status(409).json(envelope);
      return;
    }

    // Genuinely unexpected. Log WITH the traceId so the opaque response can be found.
    console.error(`Unhandled error [trace ${traceId}]:`, exception);
    const envelope: ErrorEnvelope = {
      error: { code: "INTERNAL", message: "An unexpected error occurred.", traceId },
    };
    res.status(500).json(envelope);
  }
}

interface PostgresErrorShape {
  code?: string;
  cause?: unknown;
}

/** Find a PostgreSQL error through the shallow wrapper chain used by pg/Drizzle. */
export function postgresError(exception: unknown): PostgresErrorShape | null {
  let value = exception;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof value !== "object" || value === null || seen.has(value)) return null;
    seen.add(value);
    const candidate = value as PostgresErrorShape;
    if (typeof candidate.code === "string" && /^23\d{3}$/.test(candidate.code)) return candidate;
    value = candidate.cause;
  }
  return null;
}

/** Status → the canonical SCREAMING_SNAKE code the envelope contract promises (§5.3). */
function httpCode(status: number): string {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHENTICATED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 405:
      return "METHOD_NOT_ALLOWED";
    case 409:
      return "CONFLICT";
    case 413:
      return "PAYLOAD_TOO_LARGE";
    case 415:
      return "UNSUPPORTED_MEDIA_TYPE";
    case 422:
      return "VALIDATION_FAILED";
    case 429:
      return "RATE_LIMITED";
    default:
      return status >= 500 ? "INTERNAL" : "REQUEST_REJECTED";
  }
}
