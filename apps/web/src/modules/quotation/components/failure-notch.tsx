"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import type { FailureNotice } from "../api";

/**
 * A FAILURE, RENDERED INSIDE THE THING THAT CAUSED IT.
 *
 * ⚠ THIS BELONGS IN THE SPINE. Sales and Purchase have each built the same forty lines in
 * their own module folders, and this is the third copy. They should be consolidated into one
 * `spine/states` export and all three deleted. They are separate today only because a module
 * may not import another module's folder, and that rule is exactly what keeps every folder
 * deletable — copying forty lines is the cheaper side of that trade.
 *
 * WHY NOT `ErrorState` OR `Forbidden` FROM THE SPINE. Both take the whole screen. On a READ
 * screen that is right. On a CREATE form it is a disaster — it replaces a half-typed
 * five-line quotation with an apology, and the work is gone. Same four situations, same
 * vocabulary, same trace id, one tenth of the footprint, and the form is still underneath it
 * with every keystroke intact.
 */
export function FailureNotch({
  notice,
  onReload,
}: {
  notice: FailureNotice;
  /** Offered only when the failure says this page is looking at a copy that has moved on. */
  onReload?: () => void;
}): React.JSX.Element {
  return (
    <div
      role="alert"
      className="mb-4 rounded-[var(--radius-control)] border border-[var(--bad)] bg-[var(--bad-soft)] px-3.5 py-3"
    >
      <div className="flex gap-2.5">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bad-ink)]" aria-hidden />
        <div className="min-w-0 text-[13px] leading-5">
          <p className="font-semibold text-[var(--bad-ink)]">{notice.title}</p>
          {notice.body ? (
            <p className="mt-0.5 text-[var(--text-secondary)]">{notice.body}</p>
          ) : null}
          {notice.missingPermission ? (
            <p className="mt-1.5 text-[var(--text-secondary)]">
              Ask your administrator for{" "}
              <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)] text-[12px] text-[var(--text-primary)]">
                {notice.missingPermission}
              </code>
            </p>
          ) : null}
          {notice.traceId ? (
            <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">
              Reference{" "}
              <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)] text-[12px]">
                {notice.traceId}
              </code>{" "}
              — quote this to support and they can find the exact request.
            </p>
          ) : null}
          {onReload ? (
            <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={onReload}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Reload this quotation
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
