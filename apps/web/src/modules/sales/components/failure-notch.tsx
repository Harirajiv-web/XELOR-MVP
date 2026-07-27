"use client";

import { TriangleAlert } from "lucide-react";

/**
 * A FAILURE, RENDERED INSIDE THE FORM THAT CAUSED IT.
 *
 * ⚠ THIS BELONGS IN THE SPINE, and SPAR has built the same thing in its own module folder
 * for the same reason. The two should be consolidated into one `spine/states` export and
 * both copies deleted. They are separate today only because a module may not import another
 * module's folder, and that rule is exactly what keeps both folders deletable — copying
 * forty lines is the cheaper side of that trade.
 *
 * WHY NOT `ErrorState` OR `Forbidden` FROM THE SPINE. Both take the whole screen. On a
 * READ screen that is right: there is nothing else to look at, and a full-page explanation
 * with a trace id is the most useful thing available. On a CREATE form it is a disaster —
 * it replaces a half-typed five-line order with an apology, and the work is gone. The user
 * then re-enters everything, which is precisely what an error message should be helping
 * them avoid.
 *
 * So: same four situations, same vocabulary, same trace id, one tenth of the footprint, and
 * the form is still underneath it with every keystroke intact.
 */
export function FailureNotch({
  title,
  body,
  missingPermission,
  traceId,
}: {
  title: string;
  body: string;
  /** Named on a 403 — a permission you can ask for by name beats "access denied". */
  missingPermission?: string;
  /** Shown when a support call is the only next step. */
  traceId?: string;
}): React.JSX.Element {
  return (
    <div
      role="alert"
      className="mb-4 rounded-[var(--radius-control)] border border-[var(--bad)] bg-[var(--bad-soft)] px-3.5 py-3"
    >
      <div className="flex gap-2.5">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bad-ink)]" aria-hidden />
        <div className="min-w-0 text-[13px] leading-5">
          <p className="font-semibold text-[var(--bad-ink)]">{title}</p>
          <p className="mt-0.5 text-[var(--text-secondary)]">{body}</p>
          {missingPermission ? (
            <p className="mt-1.5">
              Ask your administrator for{" "}
              <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)] text-[12px] text-[var(--text-primary)]">
                {missingPermission}
              </code>
            </p>
          ) : null}
          {traceId ? (
            <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">
              Reference{" "}
              <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)] text-[12px]">
                {traceId}
              </code>{" "}
              — quote this to support and they can find the exact request.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
