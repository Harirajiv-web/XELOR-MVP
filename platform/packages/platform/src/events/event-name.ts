/**
 * Versioned event names: `module.entity.verb.v1` (DECISIONS-V2 §5.4).
 * e.g. general.company.created.v1, purchase.grn.submitted.v1, qms.ncr.created.v1.
 */
export type EventName = `${string}.${string}.${string}.v${number}`;

const EVENT_RE = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.v\d+$/;

export function isEventName(value: string): value is EventName {
  return EVENT_RE.test(value);
}

/** Build + validate an event name; throws on a malformed name (fail fast). */
export function eventName(
  module: string,
  entity: string,
  verb: string,
  version = 1,
): EventName {
  const name = `${module}.${entity}.${verb}.v${version}`;
  if (!isEventName(name)) {
    throw new Error(`Malformed event name: ${name}`);
  }
  return name as EventName;
}
