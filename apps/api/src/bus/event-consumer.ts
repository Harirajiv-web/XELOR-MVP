import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { withTenant, schema } from "@ind-core/db";
import { newId, runWithTenant } from "@ind-core/platform";
import { EVENT_QUEUE, type EventJob } from "./queue.js";

const { eventConsumption } = schema;

// Same nominal system principal as the relay — the consumer records a system fact.
const SYSTEM_ACTOR = "0192a8c0-0000-7000-8000-0000000000ff";

/** The demo subscriber name recorded in the dedup ledger. */
export const DEMO_CONSUMER = "demo-logger";

export interface ConsumedInfo {
  name: string;
  eventId: string;
  duplicate: boolean; // true => this delivery was a redelivery and did nothing
}

/**
 * A demo subscriber that proves the loop is CLOSED and idempotent. For every event
 * the relay ships, it records ONE consumption row (tenant, consumer, event_id) under
 * that event's own tenant RLS context. A redelivery collides on the unique key and is
 * skipped — so the side effect happens exactly once even though the bus only promises
 * at-least-once. Real modules replace the body with their own reaction (send a
 * notification, project a read-model, kick off a follow-on workflow, …).
 */
export function startConsumer(
  connection: Redis,
  onEvent?: (info: ConsumedInfo) => void,
): Worker<EventJob> {
  return new Worker<EventJob>(
    EVENT_QUEUE,
    async (job: Job<EventJob>): Promise<void> => {
      const { tenantId, eventId, name } = job.data;
      const duplicate = await runWithTenant({ tenantId, actorId: SYSTEM_ACTOR }, () =>
        withTenant(async (tx) => {
          const inserted = await tx
            .insert(eventConsumption)
            .values({ id: newId(), tenantId, consumer: DEMO_CONSUMER, eventId, eventName: name })
            .onConflictDoNothing({
              target: [
                eventConsumption.tenantId,
                eventConsumption.consumer,
                eventConsumption.eventId,
              ],
            })
            .returning({ id: eventConsumption.id });
          return inserted.length === 0; // nothing inserted => already consumed
        }),
      );
      onEvent?.({ name, eventId, duplicate });
    },
    { connection, concurrency: Number(process.env.CONSUMER_CONCURRENCY ?? 8) },
  );
}
