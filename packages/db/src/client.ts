import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import { currentTenant } from "@ind-core/platform";
import * as schema from "./schema/index.js";

/**
 * The application database handle. Connects as the NON-OWNER `app_user`
 * (NOBYPASSRLS), so FORCE RLS actually fences every query (DECISIONS-V2 §1.2).
 */
const pool = new pg.Pool({
  // Marketplace integrations reserve DATABASE_URL for the managed owner. The
  // Vercel demo supplies XELOR_DATABASE_URL for the restricted app_user so the
  // runtime never inherits schema-owner/BYPASSRLS authority.
  connectionString: process.env.XELOR_DATABASE_URL ?? process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 10),
});

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });
export { schema };
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Run `fn` inside ONE transaction that is first fenced to the current tenant.
 * `SET LOCAL app.current_tenant` is transaction-scoped, so it is safe under
 * PgBouncer transaction pooling. This is the ONLY sanctioned way the app touches
 * tenant-scoped data — it guarantees the RLS backstop is armed for every read/write.
 *
 * Ledger-critical writes (stock, journals, budget) live inside this same tx and
 * NEVER ride the event bus (§5.5); the outbox row is staged here too.
 */
export async function withTenant<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const { tenantId, customerAccountId } = currentTenant(); // throws TENANT_MISSING if absent
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_tenant', ${tenantId}, true)`);
    // The SECOND scoping dimension, for portal principals only (CSP §9.3). It is set
    // explicitly to '' rather than left unset, because a connection returned to the pool
    // carrying a stale value would be the exact leak this exists to prevent — and the
    // restrictive policy reads an empty string as "staff session, no narrowing".
    await tx.execute(sql`select set_config('app.customer_account_id', ${customerAccountId ?? ""}, true)`);
    return fn(tx);
  });
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
