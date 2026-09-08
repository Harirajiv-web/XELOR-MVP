"use client";

import { CircleAlert, TriangleAlert } from "lucide-react";
import { AppError } from "@spine/api/errors";
import { cn } from "@spine/ui/cn";

/**
 * WHY A REFUSAL WAS A REFUSAL, in words a supervisor can act on.
 *
 * AN INLINE STRIP, NEVER A PAGE TAKEOVER. The spine's `ErrorState` and `Forbidden` replace
 * the whole screen, which is right for a read that failed and wrong for a form: it would
 * throw away the quantity somebody just typed, and on a shop floor they will re-type it
 * differently. This renders inside the dialog, above the fields, and the fields keep what
 * is in them.
 *
 * NOTE FOR HEXA: SPAR built the same thing independently as `failure-notch.tsx` in its own
 * module. Neither imports the other — the boundary rule is what keeps both folders
 * deletable — but the two should be consolidated into one spine component once the shape
 * has settled. The per-code vocabulary below stays here; it is Production's.
 *
 * The API answers every failure with one envelope, and the codes it uses on these three
 * endpoints are not interchangeable — each one sends the reader to a different place:
 *
 *   a STATE-MACHINE refusal means the order moved on; the message names the state it is
 *     ACTUALLY in, so the fix is "reload and look", never "press it again";
 *   a SHORT-STOCK refusal means the storekeeper is the next stop, and — importantly —
 *     that NOTHING was issued, because one short line refuses the whole posting;
 *   a QUALITY refusal means the lot is held or rejected, and Quality decides, not Production;
 *   a 403 means an administrator, and it is only useful if the permission is NAMED;
 *   anything unrecognised falls back to the server's own message plus the `traceId`, which
 *     is what turns a support call into one query.
 *
 * "Could not complete the action" would collapse all five and help with none of them.
 */

export interface Explained {
  tone: "warn" | "bad";
  title: string;
  body: string;
  /** The permission a 403 was missing — named, because a name is something you can ask for. */
  permission: string | null;
  traceId: string | null;
}

export function explainProductionError(error: unknown): Explained {
  if (!(error instanceof AppError)) {
    return {
      tone: "bad",
      title: "Something went wrong",
      body: error instanceof Error ? error.message : "An unexpected error occurred.",
      permission: null,
      traceId: null,
    };
  }

  const base = { permission: null as string | null, traceId: error.traceId ?? null };

  switch (error.code) {
    // ---- the work order's own state machine ----
    case "PRODUCTION_NOT_PLANNED":
      return {
        ...base,
        tone: "warn",
        title: "This order is past the issue step",
        // The server's message names the real status ("Order is in_progress; components
        // already issued."), which is the one fact worth repeating verbatim.
        body: `${error.message} Nothing was issued a second time. Reload the order to see where it actually stands.`,
      };
    case "PRODUCTION_NOT_IN_PROGRESS":
      return {
        ...base,
        tone: "warn",
        title: "Components have not been issued yet",
        body: `${error.message} Output is only received against an order that is in progress.`,
      };

    // ---- the stock ledger refusing, through Inventory's write path ----
    case "INSUFFICIENT_STOCK":
      return {
        ...base,
        tone: "warn",
        title: "Not enough stock to issue",
        body: `${error.message} Nothing left stores — one short line refuses the whole issue, so there is no half-issued order to unpick.`,
      };

    // ---- the quality gate, which is Quality's decision and not Production's ----
    case "INSPECTION_PENDING":
      return {
        ...base,
        tone: "warn",
        title: "Quality has not cleared this lot",
        body: `${error.message} Finished goods are held until the inspection is completed.`,
      };
    case "INSPECTION_REJECTED":
      return {
        ...base,
        tone: "bad",
        title: "Quality rejected this lot",
        body: `${error.message} Disposition it in Quality — it cannot be received here.`,
      };

    // ---- creating an order ----
    case "PRODUCTION_NO_BOM":
      return {
        ...base,
        tone: "warn",
        title: "This item has no bill of materials",
        body: `${error.message} A work order is exploded from a BOM, so Engineering has to release one before this item can be made.`,
      };
    case "PRODUCTION_BOM_MISMATCH":
      return {
        ...base,
        tone: "warn",
        title: "That bill of materials makes a different item",
        body: error.message,
      };

    // ---- the request itself ----
    case "VALIDATION_FAILED":
      return {
        ...base,
        tone: "warn",
        title: "Some of this was refused",
        body:
          error.details.length > 0
            ? "The fields marked below need fixing before this can be saved."
            : error.message,
      };
    // ---- the no-duplicates notebook, reachable BECAUSE the key is pinned ----
    // Both of these mean the server protected the ledger. Neither is a fault, and neither
    // should read like one: a supervisor who sees "something went wrong" after an issue will
    // press the button again to be safe, which is the exact outcome the key exists to stop.
    case "IDEMPOTENCY_KEY_MISMATCH":
      return {
        ...base,
        tone: "warn",
        title: "This action was already recorded",
        body: "The server has this request under the same key with different figures, so it refused to run it a second time. Nothing new was posted. Close this and reload the work order — check what it already says before doing anything again.",
      };
    case "IDEMPOTENCY_IN_PROGRESS":
      return {
        ...base,
        tone: "warn",
        title: "The same posting is still going through",
        body: "An identical request is already running on the server. Wait a moment and reload the work order rather than pressing again — the work is being done, and pressing again cannot make it happen twice.",
      };
    case "NOT_FOUND":
      return {
        ...base,
        tone: "warn",
        title: "This work order is no longer readable",
        body: "It may have been removed, or it belongs to a plant you no longer have access to. Go back to the list and open it again.",
      };
    case "FORBIDDEN":
      return {
        tone: "warn",
        title: "You are not allowed to do this",
        body: "This is a permissions boundary, not a fault. Your administrator can grant it.",
        permission: error.missingPermission,
        traceId: base.traceId,
      };
    case "NETWORK_UNREACHABLE":
      return {
        ...base,
        tone: "warn",
        title: "The server did not answer",
        // True because of `useActionKey`: the retry carries the SAME Idempotency-Key, so a
        // request that did land is replayed rather than posted twice.
        body: "This may or may not have reached the plant. Press the button again — the retry carries the same key, so the same posting cannot happen twice.",
      };
    default:
      break;
  }

  if (error.kind === "forbidden") {
    return {
      tone: "warn",
      title: "You are not allowed to do this",
      body: "This is a permissions boundary, not a fault. Your administrator can grant it.",
      permission: error.missingPermission,
      traceId: base.traceId,
    };
  }

  return {
    ...base,
    tone: error.kind === "server" ? "bad" : "warn",
    title: error.kind === "server" ? "Something went wrong at our end" : "This was refused",
    body: error.message,
  };
}

/** The refusal, rendered inside the dialog that caused it — never as a page-level takeover. */
export function ActionError({ error }: { error: unknown }): React.JSX.Element | null {
  if (error === null || error === undefined) return null;
  const e = explainProductionError(error);
  const bad = e.tone === "bad";
  const Icon = bad ? TriangleAlert : CircleAlert;

  return (
    <div
      role="alert"
      className={cn(
        "flex gap-2.5 rounded-[var(--radius-card)] border p-3 text-[13px] leading-5",
        bad
          ? "border-[var(--bad)] bg-[var(--bad-soft)] text-[var(--bad-ink)]"
          : "border-[var(--warn)] bg-[var(--warn-soft)] text-[var(--warn-ink)]",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">{e.title}</p>
        <p className="mt-0.5">{e.body}</p>
        {e.permission ? (
          <p className="mt-1.5">
            Ask your administrator to grant{" "}
            <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)] text-[12px]">
              {e.permission}
            </code>
            .
          </p>
        ) : null}
        {e.traceId ? (
          <p className="mt-1.5 text-[12px]">
            Reference{" "}
            <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)] text-[12px]">
              {e.traceId}
            </code>{" "}
            — quote this to support and they can find the exact request.
          </p>
        ) : null}
      </div>
    </div>
  );
}
