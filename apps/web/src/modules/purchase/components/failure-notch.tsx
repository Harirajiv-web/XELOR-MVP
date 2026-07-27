"use client";

import { Lock, RefreshCw, TriangleAlert } from "lucide-react";
import type { FailureNotice } from "../api";

/**
 * A refused write, shown INSIDE the thing the user was doing.
 *
 * The spine's `ErrorState` and `Forbidden` take over a whole screen, which is right when a
 * page could not load and wrong here: the form is still full of the user's typing, and
 * replacing it with an error panel throws that away to tell them a rate was invalid. This is
 * the same four-way distinction the spine draws — broken, not allowed, wrong input, somebody
 * got there first — rendered as a strip that sits above the fields it is talking about.
 *
 * Lives in Purchase only because the spine has no inline equivalent yet. It is generic;
 * PROMOTE IT to `src/spine/states` the first time another module needs one.
 */
export function FailureNotch({
  notice,
  onReload,
}: {
  notice: FailureNotice;
  /** Offered only for the stale cases, where retrying is the wrong move and reloading is not. */
  onReload?: () => void;
}): React.JSX.Element {
  const forbidden = notice.missingPermission !== null;
  const tone = forbidden || notice.stale ? "warn" : "bad";
  const Icon = forbidden ? Lock : TriangleAlert;

  return (
    <div
      role="alert"
      className={
        tone === "warn"
          ? "rounded-[var(--radius-control)] border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2.5 text-[var(--warn-ink)]"
          : "rounded-[var(--radius-control)] border border-[var(--bad)] bg-[var(--bad-soft)] px-3 py-2.5 text-[var(--bad-ink)]"
      }
    >
      <div className="flex gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 text-[12.5px] leading-5">
          <p className="font-semibold">{notice.title}</p>
          {notice.body ? <p className="mt-0.5 opacity-90">{notice.body}</p> : null}
          {notice.missingPermission ? (
            <p className="mt-1.5">
              <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11.5px]">
                {notice.missingPermission}
              </code>
            </p>
          ) : null}
          {notice.traceId ? (
            // The one thing that turns a support call into a single query.
            <p className="mt-1.5 opacity-80">
              Reference{" "}
              <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11.5px]">
                {notice.traceId}
              </code>
            </p>
          ) : null}
          {notice.stale && onReload ? (
            <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={onReload}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Reload
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
