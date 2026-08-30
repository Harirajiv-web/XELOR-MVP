"use client";

import {
  CircleAlert,
  CircleSlash,
  Inbox,
  Loader2,
  Lock,
  RefreshCw,
  ShoppingBag,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../ui/cn";
import { AppError } from "../api/errors";
import { Disclosure } from "../ui/disclosure";

/**
 * THE FOUR WAYS A SCREEN CAN FAIL, AND WHY THEY LOOK DIFFERENT.
 *
 * Most applications render all of these as one grey box saying "Something went wrong",
 * which trains people that messages from the software are noise. They are not the same
 * situation, and the differences decide what the user does next:
 *
 *   BROKEN      — our fault, nothing they can do, give them the trace id so the support
 *                 call is one query instead of twenty questions.
 *   NOT ALLOWED — not a fault at all. Name the permission, because in a company this size
 *                 they know exactly who to ask once it has a name.
 *   NOT BOUGHT  — also not a fault, and a different person fixes it: this one goes to a
 *                 salesperson, not an administrator.
 *   EMPTY       — not a failure. It is an answer, and it should look like one.
 *
 * A fifth, REFUSED, belongs to the copilot: "I can't answer that" is a calm, deliberate
 * outcome, not an error, and giving it the red error treatment would teach users that the
 * assistant is unreliable when it is being exactly as reliable as promised.
 */

export function Loading({ label = "Loading…" }: { label?: string }): React.JSX.Element {
  return (
    <div className="x-loading-state flex items-center justify-center gap-2 py-16 text-[var(--text-muted)]">
      {/* Spinner, not a shimmering skeleton. On a cheap office machine a skeleton that
          animates for three seconds reads as "broken", not as "premium". */}
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span className="text-[13px]">{label}</span>
    </div>
  );
}

function Frame({
  icon,
  title,
  body,
  action,
  tone = "neutral",
}: {
  icon: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  tone?: "neutral" | "danger" | "warning";
}): React.JSX.Element {
  const toneClass =
    tone === "danger"
      ? "text-[var(--status-rejected-text)]"
      : tone === "warning"
        ? "text-[var(--status-pending-text)]"
        : "text-[var(--text-muted)]";
  return (
    <div className="x-state-frame flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className={cn("[&>svg]:h-8 [&>svg]:w-8", toneClass)}>{icon}</div>
      <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
      {body ? (
        <div className="max-w-prose text-[13px] leading-5 text-[var(--text-secondary)]">{body}</div>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/** Nothing matched. An answer, not a failure — so no alarming colour and no apology. */
export function Empty({
  title = "Nothing here yet",
  body,
  action,
  icon,
}: {
  title?: string;
  body?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}): React.JSX.Element {
  // No mascot, no "Nothing to see here!". The register of this product is accurate and
  // accountable; a joke here reads as a system that is not taking the money seriously.
  return <Frame icon={icon ?? <Inbox />} title={title} body={body} action={action} />;
}

/** Our fault. Carries the trace id, because that is what makes the support call short. */
export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}): React.JSX.Element {
  const appError = error instanceof AppError ? error : null;

  if (appError?.kind === "network") {
    return (
      <Frame
        icon={<WifiOff />}
        title="Could not reach the server"
        tone="warning"
        body="Check your connection and try again."
        action={onRetry ? <RetryButton onRetry={onRetry} /> : null}
      />
    );
  }

  const message =
    appError?.message ??
    (error instanceof Error ? error.message : "An unexpected error occurred.");

  return (
    <Frame
      icon={<TriangleAlert />}
      title="Something went wrong"
      tone="danger"
      body={
        <div className="w-full max-w-[520px]">
          <p>Try again. If the problem continues, contact support.</p>
          <Disclosure title="Technical details" className="mt-3 text-left">
            <p>{message}</p>
            {appError?.traceId ? (
              <p className="mt-2 text-[var(--text-muted)]">
                Support reference{" "}
                <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-[var(--font-mono)] text-[12px]">
                  {appError.traceId}
                </code>
              </p>
            ) : null}
          </Disclosure>
        </div>
      }
      action={onRetry ? <RetryButton onRetry={onRetry} /> : null}
    />
  );
}

/**
 * Not allowed — and amber, not red, because this is a boundary rather than a bug.
 *
 * Naming the permission is the whole point. "You do not have access" leaves somebody
 * stuck; "this needs planning.mrp.read" is a sentence they can send to their administrator,
 * and in a factory of forty people they already know who that is.
 */
export function Forbidden({
  needs,
  what,
}: {
  needs?: readonly string[] | string | null;
  what?: string;
}): React.JSX.Element {
  const list = typeof needs === "string" ? [needs] : (needs ?? []);
  return (
    <Frame
      icon={<Lock />}
      tone="warning"
      title={what ? `You don't have access to ${what}` : "You don't have access to this"}
      body={
        list.length > 0 ? (
          <div className="w-full max-w-[460px]">
            <p>Ask your administrator for access.</p>
            <Disclosure title="Access details" className="mt-3 text-left">
              <p className="flex flex-wrap gap-1.5">
                {list.map((p) => (
                  <code
                    key={p}
                    className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-[var(--font-mono)] text-[12px] text-[var(--text-primary)]"
                  >
                    {p}
                  </code>
                ))}
              </p>
            </Disclosure>
          </div>
        ) : (
          <p>Ask your administrator for access.</p>
        )
      }
    />
  );
}

/**
 * Not bought. Deliberately distinct from "not allowed" — a different person fixes it, and
 * sending the user to their administrator for a licensing question wastes both their time.
 */
export function NotLicensed({
  moduleName,
  summary,
}: {
  moduleName: string;
  summary?: string;
}): React.JSX.Element {
  return (
    <Frame
      icon={<ShoppingBag />}
      title={`${moduleName} is not part of your plan`}
      body={
        <div className="w-full max-w-[480px]">
          <p>Contact the person who manages your ONYX subscription.</p>
          {summary ? (
            <Disclosure title="Module details" className="mt-3 text-left">
              <p>{summary}</p>
            </Disclosure>
          ) : null}
        </div>
      }
    />
  );
}

/**
 * The copilot declined. A FIFTH visual language, neutral and calm.
 *
 * Never red. A refusal is the system working exactly as designed — the alternative is a
 * confident wrong answer, which is the failure this whole product exists to prevent. If
 * refusals looked like errors, users would learn to distrust the one behaviour that
 * deserves the most trust.
 */
export function Refusal({
  message,
  because,
  nextStep,
}: {
  message: string;
  because?: string;
  nextStep?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
      <div className="flex gap-2.5">
        <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
        <div className="text-[13px] leading-5">
          <p className="text-[var(--text-primary)]">{message}</p>
          {because ? <p className="mt-1 text-[var(--text-secondary)]">{because}</p> : null}
          {nextStep ? <div className="mt-2">{nextStep}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** Inline field-level error — the one that belongs next to an input, not on its own page. */
export function FieldError({ message }: { message: string }): React.JSX.Element {
  return (
    <p className="mt-1 flex items-center gap-1 text-[12px] text-[var(--status-rejected-text)]">
      <CircleAlert className="h-3 w-3 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border-input)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
    >
      <RefreshCw className="h-3.5 w-3.5" aria-hidden />
      Try again
    </button>
  );
}
