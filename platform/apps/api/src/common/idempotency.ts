import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import { currentTenant, newId, AppError, Errors } from "@ind-core/platform";

/**
 * The "no-duplicates notebook" (DECISIONS-V2 §5.3). Makes Idempotency-Key real:
 * a retried request replays the first answer instead of doing the work twice; a
 * key reused for a *different* request is rejected.
 */
const idem = schema.idempotencyKey;

/** A stable fingerprint of the request body — same input, same fingerprint. */
export function fingerprint(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export interface IdemResult<T> {
  replayed: boolean;
  status: number;
  body: T;
}

function resolveExisting<T>(
  row: { fingerprint: string; status: string; responseStatus: number | null; responseBody: unknown },
  fp: string,
): IdemResult<T> {
  // Same ticket, different request → the client made a mistake.
  if (row.fingerprint !== fp) throw Errors.idempotencyMismatch();
  // Answer already recorded → hand it back (the replay).
  if (row.status === "completed") {
    return { replayed: true, status: row.responseStatus ?? 200, body: row.responseBody as T };
  }
  // Someone else is mid-flight with this ticket → ask the client to retry shortly.
  throw new AppError("IDEMPOTENCY_IN_PROGRESS", 409, "A request with this key is still being processed.");
}

/**
 * Run `work` at most once per Idempotency-Key. `work` performs the real mutation
 * (in its own tenant transaction) and returns the {status, body} to remember.
 *
 * ---------------------------------------------------------------------------
 * A KEY CAN WEDGE, AND THAT IS THE SAFE FAILURE — DO NOT "FIX" IT WITH A TTL
 * ---------------------------------------------------------------------------
 * Step 3 does the work; step 4 records the answer. Between those two the row is
 * `pending`. If the process is killed in that window — a deploy, an OOM, a pulled plug —
 * the row stays `pending` for ever and every retry of that key gets
 * `IDEMPOTENCY_IN_PROGRESS` (409). Permanently. That looks like a bug and it is reported
 * as one, so the reasoning is written down here rather than rediscovered under pressure.
 *
 * The obvious repair — expire `pending` rows after N minutes and let the retry through —
 * is WRONG here, because the two states this code cannot distinguish are:
 *
 *   (a) the work never ran            -> replaying is correct;
 *   (b) the work ran and committed,
 *       and only the bookkeeping died -> replaying posts it TWICE.
 *
 * These are the endpoints that carry stock movements, GST invoices and journal vouchers.
 * (b) is a duplicate financial write into an append-only ledger with no row-level undo;
 * (a) is a request the caller can simply re-issue under a new key. A stuck 409 is the
 * cheaper of the two by a wide margin, so it is deliberate, not an oversight.
 *
 * OPERATOR PROCEDURE when a caller reports a permanently-409 key:
 *
 *   1. Find it:  SELECT * FROM idempotency_key
 *                 WHERE tenant_id = $1 AND key = $2 AND status = 'pending';
 *   2. Decide whether the work actually landed — look for the domain row the request
 *      would have written (the voucher, the stock entry, the invoice), NOT at this table.
 *   3. If it did land: the request succeeded. Nothing to replay; tell the caller the
 *      outcome and leave the row alone.
 *   4. If it did NOT land: delete that single row, and the next retry runs cleanly.
 *
 * Step 2 is the whole procedure. Deleting without it is the double-post.
 */
export async function runIdempotent<T>(
  key: string,
  fp: string,
  work: () => Promise<{ status: number; body: T }>,
): Promise<IdemResult<T>> {
  const { tenantId } = currentTenant();
  const readRow = () =>
    withTenant(async (tx) =>
      (
        await tx
          .select()
          .from(idem)
          .where(and(eq(idem.tenantId, tenantId), eq(idem.key, key)))
          .limit(1)
      )[0],
    );

  // 1) Seen before? Replay or reject.
  const existing = await readRow();
  if (existing) return resolveExisting<T>(existing, fp);

  // 2) Claim the ticket. If we lose a race, the winner's row is now there → replay.
  try {
    await withTenant(async (tx) => {
      await tx.insert(idem).values({ id: newId(), tenantId, key, fingerprint: fp, status: "pending" });
    });
  } catch (e) {
    const row = await readRow();
    if (row) return resolveExisting<T>(row, fp);
    throw e;
  }

  // 3) Do the work once. If it fails, drop the claim so a later retry can proceed.
  let result: { status: number; body: T };
  try {
    result = await work();
  } catch (e) {
    await withTenant(async (tx) => {
      await tx.delete(idem).where(and(eq(idem.tenantId, tenantId), eq(idem.key, key)));
    }).catch(() => {});
    throw e;
  }

  // 4) Record the answer for next time.
  await withTenant(async (tx) => {
    await tx
      .update(idem)
      .set({ status: "completed", responseStatus: result.status, responseBody: result.body })
      .where(and(eq(idem.tenantId, tenantId), eq(idem.key, key)));
  });
  return { replayed: false, status: result.status, body: result.body };
}
