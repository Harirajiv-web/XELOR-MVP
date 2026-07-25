import { AsyncLocalStorage } from "node:async_hooks";
import { isUuidV7 } from "../ids/uuidv7.js";
import { Errors } from "../errors/error-envelope.js";

/**
 * Per-request tenant context (DECISIONS-V2 §1.2). App-layer scoping is the PRIMARY
 * mechanism; FORCE RLS is the fail-closed backstop. Both are mandatory (belt-and-braces).
 *
 * The tenant id is resolved once (from the Keycloak org claim) and carried here for
 * the life of the request, then written to Postgres as `SET LOCAL app.current_tenant`
 * at the start of every transaction so RLS policies can read it.
 */
export interface TenantContext {
  tenantId: string;
  /** Keycloak subject (user id) — used for created_by/updated_by + audit actor. */
  actorId: string;
  /**
   * THE SECOND SCOPING DIMENSION (CSP §9.3), present only for **portal** principals —
   * an external customer contact signing in to the customer portal, not an employee.
   *
   * It is minted server-side from the portal realm's organization membership and is
   * never accepted from a request parameter, a header or a body field. When it is set,
   * `withTenant` writes it as `app.customer_account_id` and a RESTRICTIVE row-level
   * policy narrows every portal-reachable table to that one customer account — so a
   * BlueOrbit engineer cannot read an Ashvamedha ticket even if the application layer
   * forgets to filter, and even if the ticket id is guessed correctly.
   *
   * Absent (staff sessions) the restrictive policy is a no-op and ordinary tenant
   * isolation applies: an agent legitimately sees every customer in their tenant.
   */
  customerAccountId?: string;
  /** `portal` sessions are internet-facing and get the narrower surface. */
  principal?: "staff" | "portal";
}

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  if (!isUuidV7(ctx.tenantId)) {
    // Fail closed: a malformed/absent tenant must never reach the database layer.
    throw Errors.tenantMissing();
  }
  return storage.run(ctx, fn);
}

export function currentTenant(): TenantContext {
  const ctx = storage.getStore();
  if (!ctx) throw Errors.tenantMissing();
  return ctx;
}

/**
 * The exact statement that fences a transaction to the current tenant. Bind it as
 * the FIRST statement of every app transaction. Uses set_config(..., true) = LOCAL
 * so it is scoped to the transaction and safe under PgBouncer transaction pooling.
 */
export function setLocalTenantSql(): { sql: string; params: [string] } {
  const { tenantId } = currentTenant();
  return {
    sql: "SELECT set_config('app.current_tenant', $1, true)",
    params: [tenantId],
  };
}
