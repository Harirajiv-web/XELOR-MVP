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
