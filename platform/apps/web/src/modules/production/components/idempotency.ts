"use client";

import { useCallback, useRef } from "react";

/**
 * ONE IDEMPOTENCY KEY PER OPEN DIALOG — and why this overrides the one `api.post` mints.
 *
 * THE SPINE'S KEY DOES NOT STOP A DOUBLE SUBMIT. `api.post` mints a fresh
 * `Idempotency-Key` per REQUEST, so two clicks are two keys and the server correctly treats
 * them as two deliberate actions. That is right for most screens. It is wrong here, and on
 * an issue it is materially wrong.
 *
 * These hooks are held by the dialog component, which is mounted only while the dialog is
 * open. Opening the dialog afresh therefore mints a fresh key — a deliberate second issue is
 * genuinely a second issue — while everything that happens inside one open dialog is one
 * action, however many times the button is pressed.
 *
 * The failure this exists for is real and it is expensive. A tablet on the shop floor sends
 * "issue components", the plant Wi-Fi drops before the response comes back, and the
 * supervisor — who has no way to know whether the server got it — presses the button again.
 * With a fresh key the second press is a SECOND ISSUE: the components are consumed twice and
 * material that is still sitting in the stores bin has left the ledger. Nobody notices until
 * a stock count months later.
 *
 * So the key is minted once per logical action and reused across every retry of THAT action.
 * The server replays the first result instead of posting again, and the retry is free.
 *
 * The key is re-minted when the SEED changes, because the backend refuses a key reused with a
 * different payload (`IDEMPOTENCY_KEY_MISMATCH`). Seeding on the request body means "confirm
 * 40 pieces, fail, change it to 45, confirm again" is correctly a new action, while "confirm
 * 40, no answer, confirm 40 again" is correctly the same one.
 *
 * This is BOTH belts, not either: the button is disabled while a request is in flight and an
 * `inFlight` ref refuses a re-entrant call, AND the key makes a retry after a timeout replay
 * rather than repeat. The disabled button cannot help once the request has already left, and
 * the key cannot help against a touchscreen reporting two taps in the same tick.
 *
 * The server drops its claim when the work FAILS (`runIdempotent`), so a genuine retry after
 * a short-stock refusal proceeds normally. Only a posting that succeeded is replayed.
 */
export interface ActionKey {
  /** The key for this action. Stable while `seed` is unchanged. */
  keyFor: (seed: string) => string;
  /** Forget it — call after a success, so the next action starts a fresh key. */
  reset: () => void;
}

export function useActionKey(): ActionKey {
  const key = useRef<string | null>(null);
  const seed = useRef<string | null>(null);

  const keyFor = useCallback((next: string): string => {
    if (key.current === null || seed.current !== next) {
      const fresh = crypto.randomUUID();
      key.current = fresh;
      seed.current = next;
      return fresh;
    }
    return key.current;
  }, []);

  const reset = useCallback((): void => {
    key.current = null;
    seed.current = null;
  }, []);

  return { keyFor, reset };
}
