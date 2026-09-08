// Named `Redis` class, not the default export: under NodeNext resolution ioredis' default
// export is not constructable, which only surfaces on `typecheck` (SWC builds skip types).
import { Redis } from "ioredis";

/**
 * A Valkey connection (Redis wire protocol) for BullMQ. BullMQ's blocking commands
 * REQUIRE `maxRetriesPerRequest: null`, so we set it here. Producers (the queue) and
 * the Worker each take their OWN connection — a Worker holds a blocking connection
 * and must not share it with anything else.
 */
export function makeRedis(): Redis {
  const url = process.env.VALKEY_URL ?? "redis://localhost:6379";
  return new Redis(url, { maxRetriesPerRequest: null });
}
