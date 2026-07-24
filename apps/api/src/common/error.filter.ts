import { Catch, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
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
    const traceId = String(req.header("x-trace-id") ?? "") || undefined;

    if (exception instanceof AppError) {
      res.status(exception.httpStatus).json(exception.toEnvelope(traceId));
      return;
    }

    console.error("Unhandled error:", exception);
    const envelope: ErrorEnvelope = {
      error: {
        code: "INTERNAL",
        message: "An unexpected error occurred.",
        ...(traceId ? { traceId } : {}),
      },
    };
    res.status(500).json(envelope);
  }
}
