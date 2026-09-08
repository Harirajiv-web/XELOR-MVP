import { eq, isNull } from "drizzle-orm";
import type { Queue } from "bullmq";
import { db, withTenant, schema } from "@ind-core/db";
import { runWithTenant } from "@ind-core/platform";
import type { EventJob } from "./queue.js";

const { tenant, outboxEvent } = schema;

// A fixed system principal for the relay's tenant context. The relay only flips
// published_at/attempts (it never authors domain rows), so the actor is nominal;
// it just has to be a valid UUIDv7 for runWithTenant's fail-closed check.
const SYSTEM_ACTOR = "0192a8c0-0000-7000-8000-0000000000ff";

const BATCH = Number(process.env.RELAY_BATCH ?? 100);
const INTERVAL_MS = Number(process.env.RELAY_INTERVAL_MS ?? 1000);

/**
 * The "mailman" (DECISIONS-V2 §5.4). Domain writes stage events on `outbox_event`
 * inside their OWN transaction (so an event can never be lost or emitted without its
 * write). This relay is the ONLY thing that ships them onward, and it does so
 * reliably:
 *
 *   for each tenant:
 *     under that tenant's RLS context, claim a batch of unpublished rows with
 *     FOR UPDATE SKIP LOCKED  (so parallel relays never grab the same note),
 *     enqueue each onto BullMQ keyed by event id (jobId dedup),
 *     then mark published_at + bump attempts — all in one transaction.
 *
 * At-least-once here + idempotent consumers = exactly-once EFFECT. The relay drains
 * PER TENANT under `SET LOCAL app.current_tenant`, so it never bypasses FORCE RLS —
 * the tenant registry is the only cross-tenant read, and that table is not RLS-scoped.
 */
export class OutboxRelay {
  private stopped = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly queue: Queue<EventJob>,
    private readonly intervalMs: number = INTERVAL_MS,
  ) {}

  /** One full sweep across every tenant. Returns how many events were shipped. */
  async drainOnce(): Promise<number> {
    const tenants = await db.select({ id: tenant.id }).from(tenant);
    let shipped = 0;
    for (const t of tenants) {
      shipped += await this.drainTenant(t.id);
    }
    return shipped;
  }

  private async drainTenant(tenantId: string): Promise<number> {
    return runWithTenant({ tenantId, actorId: SYSTEM_ACTOR }, () =>
      withTenant(async (tx) => {
        // Claim a batch. SKIP LOCKED lets N relay instances run without colliding;
        // rows stay locked until this tx commits, so no one else ships them meanwhile.
        const rows = await tx
          .select({
            id: outboxEvent.id,
            name: outboxEvent.name,
            payload: outboxEvent.payload,
            createdAt: outboxEvent.createdAt,
            attempts: outboxEvent.attempts,
          })
          .from(outboxEvent)
          .where(isNull(outboxEvent.publishedAt))
          .orderBy(outboxEvent.createdAt)
          .limit(BATCH)
          .for("update", { skipLocked: true });

        let n = 0;
        for (const r of rows) {
          // Enqueue keyed by event id: a double-enqueue of the same in-flight event
          // is dedup'd by BullMQ; a post-completion redelivery is caught by the
          // consumer's event_consumption ledger. Both together = exactly-once effect.
          await this.queue.add(
            r.name,
            {
              eventId: r.id,
              tenantId,
              name: r.name,
              payload: r.payload,
              createdAt: r.createdAt.toISOString(),
            },
            { jobId: r.id, removeOnComplete: true, removeOnFail: { count: 5000 } },
          );
          await tx
            .update(outboxEvent)
            .set({ publishedAt: new Date(), attempts: r.attempts + 1 })
            .where(eq(outboxEvent.id, r.id));
          n++;
        }
        return n;
      }),
    );
  }

  /** Start the poll loop. `onError` is called (not thrown) if a sweep fails. */
  start(onError?: (e: unknown) => void): void {
    const tick = async (): Promise<void> => {
      if (this.stopped) return;
      try {
        await this.drainOnce();
      } catch (e) {
        onError?.(e);
      } finally {
        if (!this.stopped) this.timer = setTimeout(tick, this.intervalMs);
      }
    };
    void tick();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
