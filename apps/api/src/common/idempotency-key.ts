import { Errors } from "@ind-core/platform";

/**
 * Endpoints that already carry a stable business id in the body keep accepting clients that
 * omit Idempotency-Key. When a client does send the header, however, it must identify that
 * same logical request rather than presenting two competing replay identities.
 */
export function assertMatchingIdempotencyKey(
  headerValue: string | undefined,
  bodyValue: string,
  bodyField: string,
): void {
  if (headerValue === undefined) return;
  if (headerValue.trim() === bodyValue) return;
  throw Errors.validation([{
    field: "Idempotency-Key",
    message: `must match ${bodyField}`,
  }]);
}
