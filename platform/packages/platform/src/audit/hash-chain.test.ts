import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GENESIS_HASH,
  computeEntryHash,
  verifyChain,
  type AuditEntry,
} from "./hash-chain.js";
import { eventName, isEventName } from "../events/event-name.js";

function entry(seq: number, action: string): AuditEntry {
  return {
    tenantId: "0192a8c0-0000-7000-8000-000000000001",
    seq,
    actorId: "user-1",
    action,
    entityType: "company",
    entityId: `c-${seq}`,
    data: { name: `Co ${seq}` },
    at: `2026-07-20T10:0${seq}:00.000Z`,
  };
}

function buildChain(actions: string[]) {
  let prev = GENESIS_HASH;
  return actions.map((a, i) => {
    const e = entry(i, a);
    const hash = computeEntryHash(prev, e);
    const row = { entry: e, prevHash: prev, hash };
    prev = hash;
    return row;
  });
}

test("an intact chain verifies", () => {
  const chain = buildChain(["created", "updated", "deactivated"]);
  assert.deepEqual(verifyChain(chain), { ok: true });
});

test("editing a historical entry breaks the chain (tamper-evident)", () => {
  const chain = buildChain(["created", "updated", "deactivated"]);
  // Tamper with row 1's data without recomputing downstream hashes.
  chain[1]!.entry.data = { name: "SILENTLY CHANGED" };
  const result = verifyChain(chain);
  assert.equal(result.ok, false);
  assert.equal((result as { brokenAtSeq: number }).brokenAtSeq, 1);
});

test("deleting a historical entry breaks the chain", () => {
  const chain = buildChain(["created", "updated", "deactivated"]);
  chain.splice(1, 1); // drop the middle row
  assert.equal(verifyChain(chain).ok, false);
});

test("event names must be module.entity.verb.vN", () => {
  assert.equal(eventName("general", "company", "created"), "general.company.created.v1");
  assert.ok(isEventName("purchase.grn.submitted.v1"));
  assert.ok(!isEventName("Purchase.GRN.submitted")); // no version, wrong case
  assert.throws(() => eventName("general", "company", "Created"));
});
