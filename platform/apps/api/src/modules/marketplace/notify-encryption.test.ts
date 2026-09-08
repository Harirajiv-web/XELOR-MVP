import assert from "node:assert/strict";
import test from "node:test";
import { runWithTenant } from "@ind-core/platform";
import type { Tx, schema } from "@ind-core/db";
import { NotifyService } from "./notify.service.js";

test("outbox encryption hides invitation credentials and authenticates the tenant and row", async () => {
  const oldKey = process.env.NOTIFY_ENCRYPTION_KEY;
  const oldProvider = process.env.NOTIFY_EMAIL_PROVIDER;
  process.env.NOTIFY_ENCRYPTION_KEY = "ab".repeat(32);
  process.env.NOTIFY_EMAIL_PROVIDER = "preview";
  let stored: typeof schema.notificationOutbox.$inferSelect | undefined;
  const tx = {
    insert: () => ({
      values: async (value: typeof stored) => {
        stored = value;
      },
    }),
  } as unknown as Tx;
  const service = new NotifyService();
  try {
    await runWithTenant(
      {
        tenantId: "0192a8c0-0000-7000-8000-000000000001",
        actorId: "0192a8c0-0000-7000-8000-000000000002",
      },
      () =>
        service.queueInTx(tx, {
          channel: "email",
          recipient: "supplier@example.invalid",
          template: "rfq_invitation",
          body: "Open https://factory.example/supplier/secret-token",
          variables: { link: "secret-token" },
          linkUrl: "https://factory.example/supplier/secret-token",
        }),
    );
    assert.ok(stored);
    assert.equal(JSON.stringify(stored).includes("secret-token"), false);
    assert.equal(stored.status, "previewed");
    assert.equal(stored.sentAt, null);
    assert.equal(
      service.decode(stored).linkUrl,
      "https://factory.example/supplier/secret-token",
    );
    assert.throws(() =>
      service.decode({
        ...stored!,
        id: "0192a8c0-0000-7000-8000-000000000099",
      }),
    );
    assert.throws(() =>
      service.decode({
        ...stored!,
        tenantId: "0192a8c0-0000-7000-8000-000000000099",
      }),
    );
  } finally {
    if (oldKey === undefined) delete process.env.NOTIFY_ENCRYPTION_KEY;
    else process.env.NOTIFY_ENCRYPTION_KEY = oldKey;
    if (oldProvider === undefined) delete process.env.NOTIFY_EMAIL_PROVIDER;
    else process.env.NOTIFY_EMAIL_PROVIDER = oldProvider;
  }
});
