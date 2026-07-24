import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";
import { runWithTenant, isUuidV7, Errors } from "@ind-core/platform";

/**
 * Resolves the tenant for the request and runs the rest of the pipeline inside
 * that tenant's AsyncLocalStorage context (DECISIONS-V2 §1.2 — app-layer scoping
 * is primary; RLS is the backstop).
 *
 * MVP: tenant/actor come from dev headers so the slice is exercisable without a
 * live Keycloak. PRODUCTION: they come ONLY from the verified Keycloak OIDC token
 * (the org claim → tenant, sub → actor). Headers must be rejected once auth lands —
 * a UI/proxy header must never be a security boundary (§2, CVE-2025-29927 lesson).
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const tenantId = String(req.header("x-tenant-id") ?? "");
    const actorId = String(req.header("x-actor-id") ?? "");
    if (!isUuidV7(tenantId) || !isUuidV7(actorId)) {
      throw Errors.tenantMissing();
    }
    runWithTenant({ tenantId, actorId }, () => next());
  }
}
