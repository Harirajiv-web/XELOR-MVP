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
