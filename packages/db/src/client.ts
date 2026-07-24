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
  connectionString: process.env.DATABASE_URL,
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
  const { tenantId } = currentTenant(); // throws TENANT_MISSING if absent (fail closed)
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_tenant', ${tenantId}, true)`);
    return fn(tx);
  });
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
