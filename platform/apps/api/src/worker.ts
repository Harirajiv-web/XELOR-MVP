import { closeDb } from "@ind-core/db";
import { makeRedis } from "./bus/connection.js";
import { makeQueue } from "./bus/queue.js";
import { OutboxRelay } from "./bus/outbox-relay.js";
import { startConsumer } from "./bus/event-consumer.js";

/**
 * The XELOR worker process — the "mailman" and its subscribers. Deliberately a
 * SEPARATE process from the API (apps/api/src/main.ts): workers scale and restart
 * independently of request-serving, and a stuck consumer must never stall HTTP.
 *
 *   run:  node dist/src/worker.js   (pnpm --filter @ind-core/api worker)
 */
async function main(): Promise<void> {
  const producerConn = makeRedis(); // for the queue (enqueue side)
  const workerConn = makeRedis(); // dedicated blocking connection for the Worker

  const queue = makeQueue(producerConn);
  const relay = new OutboxRelay(queue);
  const consumer = startConsumer(workerConn, ({ name, eventId, duplicate }) =>
    console.log(
      `[consumer] ${duplicate ? "skip (already handled)" : "handled"} ${name} ${eventId}`,
    ),
  );

  relay.start((e) => console.error("[relay] sweep error:", e));
  console.log("XELOR worker up — outbox relay + demo consumer running.");

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} — worker shutting down ...`);
    await relay.stop();
    await consumer.close();
    await queue.close();
    await producerConn.quit();
    await workerConn.quit();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
