import { Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db, schema } from "@ind-core/db";
import { runWithTenant, isUuidV7, AppError, type TenantContext } from "@ind-core/platform";
import { tenantIdFromVerifiedGroups } from "./tenant-groups.js";
import { tokenTargetsClient } from "./token-audience.js";

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
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? "indcore-api";
const ISSUER = `${KEYCLOAK_URL}/realms/${REALM}`;
const PUBLIC_DEMO_ENABLED = process.env.API_PUBLIC_DEMO === "true";
const PUBLIC_DEMO_HEADER = "investor-presentation";
const PUBLIC_DEMO_CONTEXT: TenantContext = {
  tenantId: "0192a8c0-0000-7000-8000-000000000001",
  // The seeded demo administrator. This mode is valid only against the isolated demo
  // world and still passes every request through normal database permissions and RLS.
  actorId: "d0000000-0000-4000-8000-00000000000a",
  principal: "staff",
};

// Seed scripts need the same small set of identities that Keycloak supplies in
// local development (for example, a requester must not approve their own PO).
// These selectors are honoured only inside the explicitly enabled, isolated
// public-demo mode; they are not an authentication mechanism.
const PUBLIC_DEMO_PERSONAS: Readonly<Record<string, TenantContext>> = {
  hari: PUBLIC_DEMO_CONTEXT,
  venkat: {
    tenantId: "0192a8c0-0000-7000-8000-000000000001",
    actorId: "22222222-2222-4222-8222-222222222222",
    principal: "staff",
  },
  poongodi: {
    tenantId: "0192a8c0-0000-7000-8000-000000000001",
    actorId: "11111111-1111-4111-8111-111111111111",
    principal: "staff",
  },
  "kaveri-admin": {
    tenantId: "0192a8c0-0000-7000-8000-000000000002",
    actorId: "33333333-3333-4333-8333-333333333333",
    principal: "staff",
  },
  "mica.commercial": {
    tenantId: "0192a8c0-0000-7000-8000-000000000001",
    actorId: "d0000000-0000-4000-8000-00000000000b",
    principal: "staff",
  },
  "hexa.admin": {
    tenantId: "0192a8c0-0000-7000-8000-000000000001",
    actorId: "d0000000-0000-4000-8000-00000000000c",
    principal: "staff",
  },
  "kiln.operations": {
    tenantId: "0192a8c0-0000-7000-8000-000000000001",
    actorId: "d0000000-0000-4000-8000-00000000000d",
    principal: "staff",
  },
  "spar.supply": {
    tenantId: "0192a8c0-0000-7000-8000-000000000001",
    actorId: "d0000000-0000-4000-8000-00000000000e",
    principal: "staff",
  },
};

/* -------------------------------------------------------------------------
 * THE PUBLIC-DEMO GATE — GUARDED BY THE DATA, NOT BY A FLAG
 * -------------------------------------------------------------------------
 * `API_PUBLIC_DEMO=true` turns a STATIC HEADER into a signed-in administrator. That is
 * correct for the hosted investor stack, which deliberately ships without Keycloak, and
 * catastrophic anywhere else: the header value is a constant in this repository, so the
 * flag alone is the whole authentication boundary.
 *
 * An env var is a weak place to put that. `infra/railway/Dockerfile.api` already sets
 * NODE_ENV=production, so "is this production" cannot distinguish the two cases, and one
 * copied environment block is all it takes to carry the flag somewhere real.
 *
 * So this refuses on a property of the CONTENTS, exactly as `demo-reset` does: the `tenant`
 * table must hold nothing except the two §7 demo tenants. One real customer in there and
 * the bypass never activates, whatever the flag says. Verified once, on the first request
 * that tries to use it, and cached — including the refusal.
 *
 * Fail-closed both ways: if the check itself cannot run, the bypass stays off. An
 * unverifiable auth bypass is not a bypass worth having.
 */
const DEMO_TENANTS: ReadonlySet<string> = new Set([
  "0192a8c0-0000-7000-8000-000000000001", // 3S Precision Parts Pvt Ltd
  "0192a8c0-0000-7000-8000-000000000002", // Kaveri ElectroFab Industries
]);

let publicDemoGate: Promise<boolean> | null = null;

function isolatedDemoDatabase(): Promise<boolean> {
  publicDemoGate ??= (async () => {
    try {
      const rows = await db
        .select({ id: schema.tenant.id, legalName: schema.tenant.legalName })
        .from(schema.tenant);
      const strangers = rows.filter((row) => !DEMO_TENANTS.has(row.id));
      if (strangers.length > 0) {
        console.error(
          `[public-demo] REFUSED. API_PUBLIC_DEMO is set, but this database holds ` +
            `${strangers.length} tenant(s) outside the §7 demo universe:\n` +
            strangers.map((s) => `    ${s.id}  ${s.legalName}`).join("\n") +
            `\n[public-demo] The sign-in-free bypass is DISABLED. Every request now ` +
            `requires a verified Keycloak token.`,
        );
        return false;
      }
      console.warn(
        `[public-demo] ENABLED — a static header authenticates as a demo administrator ` +
          `without any token. Verified isolated: ${rows.length} demo tenant(s), no ` +
          `strangers. This must never front real customer data.`,
      );
      return true;
    } catch (error) {
      console.error(
        `[public-demo] REFUSED — could not verify that this is an isolated demo ` +
          `database: ${error instanceof Error ? error.message : String(error)}. ` +
          `The bypass stays off.`,
      );
      return false;
    }
  })();
  return publicDemoGate;
}

// JWKS is fetched once and cached by jose (keys rotate transparently).
const jwks = createRemoteJWKSet(
  new URL(`${ISSUER}/protocol/openid-connect/certs`),
);

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // A platform health check cannot attach a user's token and does not touch data.
    const pathname = req.originalUrl.split("?", 1)[0]?.replace(/\/$/, "");
    if (
      pathname === "/api/v1/health" ||
      pathname?.startsWith("/api/v1/health/") ||
      pathname === "/api/v1/internal/outbox/drain" ||
      pathname === "/api/v1/internal/platform-health/run" ||
      pathname === "/health" ||
      pathname?.startsWith("/health/")
    ) {
      next();
      return;
    }

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
      // Mint the correlation id when the caller sent none — same rule as the exception
      // filter. A 401 nobody can trace is a support ticket with nothing in it.
      const traceId = req.header("x-trace-id") || randomUUID();
      res.status(err.httpStatus).json(err.toEnvelope(traceId));
    }
  }
}

async function resolveTenant(req: Request): Promise<TenantContext> {
  if (
    PUBLIC_DEMO_ENABLED &&
    req.header("x-xelor-public-demo") === PUBLIC_DEMO_HEADER &&
    // Checked last, and only when the header actually asks for the bypass, so a normal
    // token request never waits on it.
    (await isolatedDemoDatabase())
  ) {
    const requestedPersona = req.header("x-xelor-demo-persona")?.trim().toLowerCase();
    return (requestedPersona && PUBLIC_DEMO_PERSONAS[requestedPersona]) || PUBLIC_DEMO_CONTEXT;
  }
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
  if (!tokenTargetsClient(claims, KEYCLOAK_CLIENT_ID)) {
    throw new AppError(
      "UNAUTHENTICATED",
      401,
      "Token was not issued to this API client.",
    );
  }

  const sub = typeof claims.sub === "string" ? claims.sub : "";
  if (!sub) throw new AppError("UNAUTHENTICATED", 401, "Token has no subject.");

  // Map the verified group claim to a tenant. A user must belong to exactly one
  // known tenant group; anything else fails closed.
  const groups = Array.isArray(claims.groups) ? claims.groups : [];
  const tenantId = tenantIdFromVerifiedGroups(groups);

  // ---- THE SECOND SCOPING DIMENSION (CSP §9.3) --------------------------------
  //
  // A portal-realm token carries the customer organization it belongs to. That claim, and
  // only that claim, becomes `customerAccountId` — it is minted here from a
  // signature-verified token and is never read from a header, a query parameter or a body
  // field, because the whole guarantee rests on the caller being unable to choose it.
  //
  // A staff token has no such claim, `customerAccountId` stays undefined, `withTenant`
  // writes an empty string, and the RESTRICTIVE row policy becomes a no-op: an agent sees
  // every customer in their tenant, which is exactly right.
  //
  // The realm claim is checked as well as the org claim. A staff token that somehow
  // acquired an org claim would otherwise be silently narrowed to one customer — failing
  // closed in a way that looks like missing data rather than like a security event.
  const realm = typeof claims.realm === "string" ? claims.realm : REALM;
  const isPortalRealm = realm.endsWith("-portal") || claims.principal === "portal";
  const orgClaim =
    typeof claims.customer_account_id === "string" ? claims.customer_account_id : undefined;

  if (isPortalRealm) {
    if (!orgClaim || !isUuidV7(orgClaim)) {
      // A portal principal with no organization is authenticated and unscoped. There is no
      // safe default: refusing is the only fail-closed answer.
      throw new AppError(
        "PORTAL_ACCOUNT_MISSING",
        403,
        "Portal token carries no customer organization.",
      );
    }
    return { tenantId, actorId: sub, customerAccountId: orgClaim, principal: "portal" };
  }

  // actorId = Keycloak subject (a UUID; created_by/updated_by accept any uuid).
  return { tenantId, actorId: sub, principal: "staff" };
}
