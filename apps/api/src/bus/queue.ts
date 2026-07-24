import { Queue } from "bullmq";
import type { Redis } from "ioredis";

/**
 * The single event-bus topic the outbox relay publishes onto (DECISIONS-V2 §5.4).
 * One durable BullMQ queue on Valkey carries every `module.entity.verb.vN` event;
 * subscribers filter by `name`. Keeping one topic keeps ordering + ops simple for the
 * MVP; per-module topics are a later refinement, not a correctness requirement.
 */
export const EVENT_QUEUE = "ind-core.events";

/** One job on the bus = one outbox row, carried verbatim to consumers. */
export interface EventJob {
  eventId: string; // the outbox_event id — also used as the BullMQ jobId (dedup)
  tenantId: string;
  name: string; // module.entity.verb.vN
  payload: unknown;
  createdAt: string; // ISO — when the domain write staged it
}

export function makeQueue(connection: Redis): Queue<EventJob> {
  return new Queue<EventJob>(EVENT_QUEUE, { connection });
}
