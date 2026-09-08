import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb } from "@ind-core/db";
import { newId, runWithTenant } from "@ind-core/platform";
import { DataImportService } from "./dataimport.service.js";
import {
  DomainApiClient,
  type DomainResponse,
  type ForwardedCredentials,
} from "./domain-client.js";

/**
 * Live-DB regression for the lifecycle promise. The first domain call models another
 * invocation holding the row's deterministic idempotency key, which deliberately leaves
 * the row accepted while the batch closes as failed. Re-posting the identical import must
 * reopen that batch, replay only the accepted row and then become completed.
 */
const databaseConfigured = Boolean(
  process.env.XELOR_DATABASE_URL ?? process.env.DATABASE_URL,
);

after(async () => {
  await closeDb();
});

class InProgressThenSuccessClient extends DomainApiClient {
  attempts = 0;

  override async post<T>(
    _path: string,
    _body: unknown,
    _idempotencyKey: string,
    _creds: ForwardedCredentials,
  ): Promise<DomainResponse<T>> {
    this.attempts += 1;
    if (this.attempts === 1) {
      return {
        status: 409,
        body: { error: { code: "IDEMPOTENCY_IN_PROGRESS" } } as T,
      };
    }
    return {
      status: 201,
      body: { id: newId(), code: "RESUME-CUSTOMER" } as T,
    };
  }
}

interface CommitDetail {
  id: string;
  status: string;
  resumable: boolean;
  importedCount: number;
  summary: { stillPending: number };
}

test(
  "a failed batch with an accepted row safely resumes and completed batches replay",
  { skip: !databaseConfigured },
  async () => {
    const domain = new InProgressThenSuccessClient();
    const imports = new DataImportService(domain);
    const code = `RESUME-${newId().slice(-12)}`;
    const csv = `Customer code,Name\n${code},Resume lifecycle customer\n`;
    const input = {
      fileBase64: Buffer.from(csv, "utf8").toString("base64"),
      filename: `${code}.csv`,
      sheet: "Sheet1",
      target: "customers" as const,
      mapping: { code: "Customer code", name: "Name" },
      onDuplicate: "skip" as const,
    };
    const ctx = { tenantId: newId(), actorId: newId() };

    const first = (await runWithTenant(ctx, () => imports.commit(input, {}))) as CommitDetail;
    assert.equal(first.status, "failed");
    assert.equal(first.resumable, true);
    assert.equal(first.summary.stillPending, 1);
    assert.equal(domain.attempts, 1);
    const firstList = (await runWithTenant(ctx, () => imports.listBatches(100))) as {
      items: Array<{ id: string; resumable: boolean }>;
    };
    assert.equal(firstList.items.find((batch) => batch.id === first.id)?.resumable, true);

    const resumed = (await runWithTenant(ctx, () => imports.commit(input, {}))) as CommitDetail;
    assert.equal(resumed.id, first.id);
    assert.equal(resumed.status, "completed");
    assert.equal(resumed.resumable, false);
    assert.equal(resumed.importedCount, 1);
    assert.equal(resumed.summary.stillPending, 0);
    assert.equal(domain.attempts, 2);
    const resumedList = (await runWithTenant(ctx, () => imports.listBatches(100))) as {
      items: Array<{ id: string; resumable: boolean }>;
    };
    assert.equal(resumedList.items.find((batch) => batch.id === first.id)?.resumable, false);

    const replay = (await runWithTenant(ctx, () => imports.commit(input, {}))) as CommitDetail;
    assert.equal(replay.id, first.id);
    assert.equal(replay.status, "completed");
    assert.equal(domain.attempts, 2, "completed batch unexpectedly called the domain route again");
  },
);
