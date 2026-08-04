import {
  Controller,
  Get,
  Headers,
  UnauthorizedException,
} from "@nestjs/common";
import { makeRedis } from "./bus/connection.js";
import { startConsumer } from "./bus/event-consumer.js";
import { OutboxRelay } from "./bus/outbox-relay.js";
import { makeQueue } from "./bus/queue.js";

const MAX_DRAIN_WAIT_MS = 20_000;

/**
 * Bounded replacement for the continuously running demo worker on Vercel.
 *
 * The database outbox remains the durable source. A Vercel Cron invocation (or
 * an explicitly authorized operator call) relays one batch and gives the demo
 * consumer time to record its idempotent effects before the function exits.
 */
@Controller("internal/outbox")
export class ServerlessWorkerController {
  @Get("drain")
  async drain(
    @Headers("authorization") authorization?: string,
  ): Promise<{
    status: "ok";
    shipped: number;
    pending: number;
    active: number;
    delayed: number;
    failed: number;
  }> {
    const secret = process.env.CRON_SECRET;
    if (!secret || authorization !== `Bearer ${secret}`) {
      throw new UnauthorizedException("Valid cron authorization is required.");
    }

    const producerConnection = makeRedis();
    const consumerConnection = makeRedis();
    const queue = makeQueue(producerConnection);
    const relay = new OutboxRelay(queue);
    const consumer = startConsumer(consumerConnection);

    try {
      await consumer.waitUntilReady();
      const shipped = await relay.drainOnce();
      const deadline = Date.now() + MAX_DRAIN_WAIT_MS;
      let counts = await queue.getJobCounts("wait", "active", "delayed", "failed");

      while (
        Date.now() < deadline &&
        ((counts.wait ?? 0) > 0 ||
          (counts.active ?? 0) > 0 ||
          (counts.delayed ?? 0) > 0)
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        counts = await queue.getJobCounts("wait", "active", "delayed", "failed");
      }

      return {
        status: "ok",
        shipped,
        pending: counts.wait ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
      };
    } finally {
      await consumer.close();
      await queue.close();
      await producerConnection.quit();
      await consumerConnection.quit();
    }
  }
}
