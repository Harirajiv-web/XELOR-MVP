import { newId } from "../ids/uuidv7.js";
import type { EventName } from "./event-name.js";

/**
 * Transactional outbox (DECISIONS-V2 §5.4): the durability anchor for events.
 * A domain write and its outbox row are inserted in the SAME transaction, so the
 * event cannot be lost or emitted without the write. A relay later ships rows to
 * Valkey/BullMQ; at-least-once delivery + idempotent consumers = exactly-once effect.
 *
 * NOTE: events are for SIDE-EFFECTS only. Ledger-critical correctness (stock,
 * journals, budget) stays synchronous in-transaction and NEVER rides the bus (§5.5).
 */
export interface OutboxRow {
  id: string;
  tenantId: string;
  name: EventName;
  payload: unknown;
  createdAt: Date;
}

/** Minimal contract for something that can INSERT one row inside a caller's tx. */
export interface OutboxSink {
  insert(row: OutboxRow): Promise<void>;
}

/**
 * Stage an event on the outbox within the caller's transaction. The `sink` MUST
 * be bound to the same tx as the domain write — that is the whole guarantee.
 */
export async function emit(
  sink: OutboxSink,
  tenantId: string,
  name: EventName,
  payload: unknown,
  now: Date,
): Promise<OutboxRow> {
  const row: OutboxRow = { id: newId(), tenantId, name, payload, createdAt: now };
  await sink.insert(row);
  return row;
}
