"use client";

/**
 * THE PIECES ALL SIX WAREHOUSE SCREENS SHARE.
 *
 * Six screens, one bench, one scanner, one pair of hands. If the scan field behaves differently
 * on receiving than it does on picking, the operator has to learn two devices — and the one
 * they learn second is the one they get wrong at the end of a shift.
 *
 * So the input, the refusal strip, the ledger receipt and the honesty notes live here and are
 * used unchanged everywhere. They are in `screens/` rather than a `components/` folder purely
 * to keep the module's file list to what the module contract allows; nothing here is routable,
 * because the manifest decides what is a screen, not the filesystem.
 *
 * NOTHING IN THIS FILE HOLDS A QUANTITY THAT ISN'T ON THE LEDGER. `LedgerReceipt` renders what
 * the server sent back and nothing else.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Camera,
  CircleAlert,
  Info,
  ScanLine,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@spine/ui/cn";
import { qty as fmtQty } from "@spine/format";
import {
  explainWarehouseError,
  handlingKeyFor,
  hasBarcodeDetector,
  normaliseScan,
  type ScanLogEntry,
  type StockMovement,
} from "../api";

/* ============================================================================================
   THE SCAN FIELD.
   ============================================================================================ */

/**
 * ONE INPUT THAT A SCANNER AND A PERSON BOTH USE.
 *
 * A keyboard-wedge scanner types into whatever has focus and sends Enter. This is that input.
 * It autofocuses, selects on focus so the next scan overwrites the last, and submits on Enter.
 * There is no hardware requirement anywhere in this module.
 *
 * TWO THINGS DELIBERATELY ABSENT.
 *
 * There is NO debounce that swallows a fast second scan. The screen must be able to SEE a
 * duplicate in order to refuse it out loud — silently dropping it would look identical to
 * accepting it, and the operator would never learn that the trigger is bouncing.
 *
 * There is NO camera unless the browser actually has `BarcodeDetector`. It does not exist in
 * Firefox or desktop Safari, and a button that opens a camera which never resolves is worse
 * than no button. The check is at runtime, the typed field stays visible underneath, and the
 * camera is strictly an addition to it.
 */
export function ScanField({
  label,
  hint,
  onScan,
  disabled = false,
  autoFocus = true,
  placeholder = "Scan or type a code, then press Enter",
}: {
  label: string;
  hint?: string;
  onScan: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}): React.JSX.Element {
  const [value, setValue] = useState("");
  const [cameraNote, setCameraNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Resolved once, after mount. Reading it during render would differ between the server
  // render and the client one and React would rightly complain about the mismatch.
  const [cameraAvailable, setCameraAvailable] = useState(false);

  useEffect(() => {
    setCameraAvailable(hasBarcodeDetector());
  }, []);

  useEffect(() => {
    if (autoFocus && !disabled) inputRef.current?.focus();
  }, [autoFocus, disabled]);

  const submit = useCallback((): void => {
    const code = normaliseScan(value);
    if (!code) return;
    onScan(code);
    setValue("");
    inputRef.current?.focus();
  }, [onScan, value]);

  return (
    <div className="flex flex-col gap-2">
      <label className="x-field">
        <span className="flex items-center gap-1.5">
          <ScanLine className="h-3.5 w-3.5" aria-hidden />
          {label}
        </span>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            className="font-[var(--font-mono)]"
            aria-describedby={hint ? `${label}-hint` : undefined}
          />
          <button
            type="button"
            className="btn btn-ghost shrink-0"
            onClick={submit}
            disabled={disabled || normaliseScan(value) === ""}
          >
            Enter
          </button>
        </div>
        {hint ? <small id={`${label}-hint`}>{hint}</small> : null}
      </label>

      {cameraAvailable ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm w-fit"
          onClick={() =>
            setCameraNote(
              "Your browser does have a barcode reader. It is not wired into this screen in this build — the field above takes a scanner gun or typed code, and that is what the plant runs on. Nothing is lost by typing it.",
            )
          }
        >
          <Camera className="h-3.5 w-3.5" aria-hidden />
          About camera scanning
        </button>
      ) : null}
      {cameraNote ? (
        <p className="x-notice" role="note">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{cameraNote}</span>
        </p>
      ) : null}
    </div>
  );
}

/* ============================================================================================
   THE SCAN LOG — AND THE DUPLICATE REFUSAL THAT IS THE POINT OF IT.
   ============================================================================================ */

/**
 * WHAT HAPPENED AT THIS BENCH, IN ORDER, INCLUDING THE REFUSALS.
 *
 * A refused duplicate that leaves no mark is indistinguishable from an accepted one. The whole
 * acceptance test this module was written against — a wrong lot, a duplicate scan, a damaged
 * label, a partial pick and a dropped network must produce NO duplicate stock movement — rests
 * on the operator being able to SEE that the second scan was refused, and why.
 *
 * The header says what this is and, more importantly, what it is not: not a queue, not stock,
 * gone on refresh. That sentence is there because a list of pending-looking rows in a web app
 * is exactly what makes people believe it is offline-capable when it is not.
 */
export function ScanLog({ entries }: { entries: readonly ScanLogEntry[] }): React.JSX.Element | null {
  if (entries.length === 0) return null;
  return (
    <section className="card overflow-hidden" aria-label="Scan log for this bench">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
          Scanned at this bench
        </h3>
        <p className="text-[11px] leading-[1.5] text-[var(--text-muted)]">
          What you have scanned in this tab, newest first. Not a queue, not stock, and gone when
          this page is refreshed — only a posting reaches the ledger.
        </p>
      </div>
      <ul className="divide-y divide-[var(--border-subtle)]">
        {[...entries]
          .reverse()
          .slice(0, 12)
          .map((entry) => (
            <li key={entry.seq} className="flex items-start gap-3 px-4 py-2.5 text-[12px]">
              <span
                className={cn(
                  "chip shrink-0 uppercase",
                  entry.outcome === "accepted"
                    ? "text-[var(--status-approved-text)] bg-[var(--status-approved-bg)]"
                    : entry.outcome === "cleared"
                      ? "text-[var(--text-muted)] bg-[var(--surface-sunken)]"
                      : "text-[var(--status-rejected-text)] bg-[var(--status-rejected-bg)]",
                )}
              >
                {entry.outcome === "duplicate"
                  ? "Refused — duplicate"
                  : entry.outcome === "unknown"
                    ? "Refused — not on this document"
                    : entry.outcome === "over"
                      ? "Refused — over quantity"
                      : entry.outcome === "cleared"
                        ? "Cleared"
                        : "Accepted"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-[var(--font-mono)] text-[12px] text-[var(--text-primary)]">
                  {entry.code}
                </span>
                <span className="block text-[var(--text-secondary)]">{entry.note}</span>
              </span>
              <span className="shrink-0 tabular-nums text-[var(--text-muted)]">
                {entry.at}
              </span>
            </li>
          ))}
      </ul>
    </section>
  );
}

/** Append to the log without letting a caller invent a sequence number or a timestamp. */
export function appendScan(
  log: readonly ScanLogEntry[],
  entry: Omit<ScanLogEntry, "seq" | "at">,
): readonly ScanLogEntry[] {
  const last = log[log.length - 1];
  return [
    ...log,
    {
      ...entry,
      seq: (last?.seq ?? 0) + 1,
      at: new Date().toLocaleTimeString("en-IN", { hour12: false }),
    },
  ];
}

/* ============================================================================================
   REFUSALS AND NOTES.
   ============================================================================================ */

/**
 * WHY SOMETHING WAS REFUSED, INLINE, NEVER AS A PAGE TAKEOVER.
 *
 * The spine's `ErrorState` replaces the whole screen, which is right for a read that failed and
 * wrong for a bench: it would throw away the quantities somebody just counted, and they will
 * re-type them differently. This renders above the fields and the fields keep what is in them.
 */
export function ActionNotice({ error }: { error: unknown }): React.JSX.Element | null {
  if (error === null || error === undefined) return null;
  const e = explainWarehouseError(error);
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

/**
 * A GAP IN THE PLATFORM, SAID OUT LOUD WHERE SOMEBODY WOULD OTHERWISE ASSUME OTHERWISE.
 *
 * Rendered in the ordinary notice treatment rather than as a warning: this is not an error and
 * nothing is broken. It is the product being accurate about its own edges, which is the
 * behaviour that earns the right to be believed about everything else.
 */
export function HonestyNote({
  title,
  children,
  tone = "neutral",
}: {
  title: string;
  children: ReactNode;
  tone?: "neutral" | "warning";
}): React.JSX.Element {
  return (
    <div className="x-notice" data-tone={tone === "warning" ? "warning" : undefined} role="note">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}

/* ============================================================================================
   THE RECEIPT.
   ============================================================================================ */

/**
 * WHAT THE LEDGER SAID IT DID — printed exactly as it came back.
 *
 * This is the only place in the module that shows a balance, and it shows the one the SERVER
 * returned for the row it just wrote. Nothing is added up here, nothing is carried forward, and
 * the next screen that needs a balance re-reads `/inventory/stock` rather than trusting this.
 *
 * `lineCount` can exceed the number of lines the operator submitted: an issue with no named lot
 * is split FIFO across batches server-side, and each split is a real, separately auditable
 * movement. Saying so is worth the sentence — a receipt that shows three movements for one
 * typed line otherwise looks like a bug.
 */
export function LedgerReceipt({
  title,
  entryId,
  lineCount,
  movements,
  labelFor,
  children,
}: {
  title: string;
  entryId?: string;
  lineCount?: number;
  movements: readonly StockMovement[] | readonly { itemId: string; warehouseId: string; delta: number; balanceAfter: number }[];
  /** Turn an id into something a person reads. Falls back to the id, never to a blank. */
  labelFor: (itemId: string, warehouseId: string) => { item: string; warehouse: string; uom: string | null };
  children?: ReactNode;
}): React.JSX.Element {
  return (
    <section
      className="rounded-[var(--radius-card)] border border-[var(--status-approved-text)] bg-[var(--status-approved-bg)] p-4"
      role="status"
      aria-live="polite"
    >
      <p className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</p>
      {children ? <div className="mt-1 text-[12px] leading-[1.6]">{children}</div> : null}
      {entryId ? (
        <p className="mt-1.5 text-[12px] text-[var(--text-secondary)]">
          Stock entry{" "}
          <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11px]">
            {entryId}
          </code>
          {typeof lineCount === "number" && lineCount !== movements.length ? (
            <> · {lineCount} posted lines</>
          ) : null}
        </p>
      ) : null}
      {movements.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="grid-table">
            <caption className="sr-only">Movements posted to the stock ledger</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Location</th>
                <th scope="col" className="w-32 text-right!">
                  Moved
                </th>
                <th scope="col" className="w-36 text-right!">
                  Balance after
                </th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m, index) => {
                const label = labelFor(m.itemId, m.warehouseId);
                return (
                  <tr key={`${m.itemId}-${m.warehouseId}-${index}`}>
                    <td className="font-semibold text-[var(--text-primary)]">{label.item}</td>
                    <td className="text-[var(--text-secondary)]">{label.warehouse}</td>
                    <td className="text-right tabular-nums" data-numeric="">
                      {m.delta > 0 ? "+" : ""}
                      {fmtQty(m.delta, label.uom)}
                    </td>
                    <td
                      className="text-right font-semibold tabular-nums text-[var(--text-primary)]"
                      data-numeric=""
                    >
                      {fmtQty(m.balanceAfter, label.uom)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="mt-3 text-[11px] leading-[1.55] text-[var(--text-secondary)]">
        These figures are the ledger&rsquo;s, not this screen&rsquo;s. A posted movement is never
        edited — a mistake is corrected by posting a further movement, and both stay on the
        record.
      </p>
    </section>
  );
}

/* ============================================================================================
   THE PINNED KEY, AS A HOOK.
   ============================================================================================ */

export interface HandlingKey {
  /** Stable for identical figures; changes the moment a figure does. See `handlingKeyFor`. */
  keyFor: (scope: string, payload: unknown) => string;
}

/**
 * The pinned idempotency key, held for the life of the screen.
 *
 * Deliberately derived from the PAYLOAD rather than minted on mount: two attempts at the same
 * receipt are one action however long the operator took between them, and correcting a quantity
 * is genuinely a new one. See the long note on `handlingKeyFor` in `api.ts` for the failure this
 * exists to prevent.
 */
export function useHandlingKey(): HandlingKey {
  const keyFor = useCallback(
    (scope: string, payload: unknown): string => handlingKeyFor(scope, payload),
    [],
  );
  return { keyFor };
}

/**
 * A guard against a re-entrant submit, for the case the disabled button cannot cover: a
 * touchscreen reporting two taps in the same tick, before React has re-rendered the button.
 */
export function useInFlight(): { held: () => boolean; hold: () => void; release: () => void } {
  const ref = useRef(false);
  return {
    held: () => ref.current,
    hold: () => {
      ref.current = true;
    },
    release: () => {
      ref.current = false;
    },
  };
}
