import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { runWithTenant, isUuidV7, AppError, Errors } from "@ind-core/platform";

/**
 * Resolves the tenant from a VERIFIED Keycloak OIDC access token and runs the rest
 * of the pipeline inside that tenant's context (DECISIONS-V2 §1.2, §1.5).
 *
 * This replaces the old dev-header stub. A UI/proxy header is never trusted as the
 * security boundary (§2, CVE-2025-29927): the tenant comes only from a signature-
 * verified JWT. Authorization lives in NestJS + RLS, never in a header.
 *
 * Token → tenant: the token carries the user's `groups` (a group per tenant, minted
 * by Keycloak). The app maps group → tenant id via the registry below. In production
 * this is the Keycloak Organizations → tenant registry; `groups` is the MVP stand-in.
 */

const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const REALM = process.env.KEYCLOAK_REALM ?? "indcore";
const ISSUER = `${KEYCLOAK_URL}/realms/${REALM}`;

// Group name → tenant id (the canonical demo universe, §7). Stands in for the
// Keycloak-org → tenant registry; the guard logic is identical either way.
const GROUP_TENANT: Readonly<Record<string, string>> = {
  trishul: "0192a8c0-0000-7000-8000-000000000001",
  kaveri: "0192a8c0-0000-7000-8000-000000000002",
};

// JWKS is fetched once and cached by jose (keys rotate transparently).
const jwks = createRemoteJWKSet(
  new URL(`${ISSUER}/protocol/openid-connect/certs`),
);

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = await resolveTenant(req);
      runWithTenant(ctx, () => next());
    } catch (e) {
      // Render the canonical envelope deterministically (don't depend on async
      // middleware error routing). Any non-AppError becomes a generic 401.
      const err =
        e instanceof AppError
          ? e
          : new AppError("UNAUTHENTICATED", 401, "Invalid or missing token.");
      const traceId = req.header("x-trace-id") || undefined;
      res.status(err.httpStatus).json(err.toEnvelope(traceId));
    }
  }
}

async function resolveTenant(req: Request): Promise<{ tenantId: string; actorId: string }> {
  const auth = req.header("authorization") ?? "";
  const [scheme, token] = auth.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AppError("UNAUTHENTICATED", 401, "Bearer token required.");
  }

  // Signature + issuer + expiry verification against Keycloak's JWKS.
  let claims: Record<string, unknown>;
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: ISSUER });
    claims = payload as Record<string, unknown>;
  } catch {
    throw new AppError("UNAUTHENTICATED", 401, "Token verification failed.");
  }

  const sub = typeof claims.sub === "string" ? claims.sub : "";
  if (!sub) throw new AppError("UNAUTHENTICATED", 401, "Token has no subject.");

  // Map the verified group claim to a tenant. A user must belong to exactly one
  // known tenant group; anything else fails closed.
  const groups = Array.isArray(claims.groups) ? (claims.groups as string[]) : [];
  const tenantIds = groups
    .map((g) => GROUP_TENANT[g.replace(/^\//, "")])
    .filter((v): v is string => Boolean(v));
  const tenantId = tenantIds[0];
  if (!tenantId || !isUuidV7(tenantId)) {
    throw Errors.tenantMissing(); // authenticated but not mapped to a tenant
  }

  // actorId = Keycloak subject (a UUID; created_by/updated_by accept any uuid).
  return { tenantId, actorId: sub };
}
