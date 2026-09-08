import { createHash } from "node:crypto";
import { uuidv7 as generate } from "uuidv7";

/**
 * UUIDv7 primary keys everywhere (DECISIONS-V2 §5.1). v7 is time-ordered, so it
 * indexes like a sequence without exposing a raw cross-tenant counter — the exit
 * that keeps Citus distribution and per-tenant extraction cheap (§1.2).
 */
export function newId(): string {
  return generate();
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True only for a well-formed v7 UUID. Used to fail closed on tenant ids. */
export function isUuidV7(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * The legacy XELOR namespace for name-based ids. Fixed forever — changing it would re-point
 * every derived id and orphan the audit entries already written against the old one.
 */
const IND_CORE_NAMESPACE = "0192a8c0-0000-7000-8000-00000000ffff";

/**
 * RFC 9562 UUIDv5 (SHA-1, name-based) over the fixed XELOR namespace.
 *
 * Some auditable things are not rows: "the June 2026 attendance month", "the FY 2026-27
 * leave accrual". `audit_log.entity_id` is a `uuid NOT NULL` — deliberately, so an entry
 * always points at something — which leaves two options for those cases: invent a fresh id
 * each time (and lose the ability to query an entity's history), or DERIVE one from the
 * natural key. This does the latter, so every audit entry about June 2026's attendance
 * lock shares one stable id and the trail can actually be followed.
 */
export function derivedId(entityType: string, naturalKey: string): string {
  const ns = Buffer.from(IND_CORE_NAMESPACE.replace(/-/g, ""), "hex");
  const hash = createHash("sha1")
    .update(Buffer.concat([ns, Buffer.from(`${entityType}:${naturalKey}`, "utf8")]))
    .digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x50; // version 5
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
