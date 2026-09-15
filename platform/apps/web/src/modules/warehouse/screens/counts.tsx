"use client";

import { useCallback, useMemo, useState } from "react";
import { ClipboardCheck, Loader2, Scale } from "lucide-react";
import { api } from "@spine/api/client";
import { useQuery } from "@spine/data/use-query";
import { Can, useAccess } from "@spine/access/permissions";
import { Empty, ErrorState, Loading } from "@spine/states";
import { dateTime, qty as fmtQty } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import type { ScreenProps } from "@spine/registry/manifest";
import type {
  ScanLogEntry,
  StockEditPolicy,
  StockEntryBody,
  StockEntryLine,
  StockEntryResult,
  StockRow,
  WarehouseRow,
} from "../api";
import {
  matchScan,
  parseQty,
  round3,
  sumQty,
  variance,
  warehouseApi,
  warehouseTypeLabel,
} from "../api";
import {
  ActionNotice,
  HonestyNote,
  LedgerReceipt,
  ScanField,
  ScanLog,
  appendScan,
  useHandlingKey,
  useInFlight,
} from "./shared";

/**
 * ============================================================================================
 * CYCLE COUNTS — A DISAGREEMENT BETWEEN THE SHELF AND THE LEDGER, RESOLVED IN PUBLIC.
 * ============================================================================================
 *
 * A stock adjustment is the single most dangerous thing a warehouse module offers, because it is
 * the one action that changes a number without anything physically happening. Every other
 * movement on this screen's siblings is a consequence of a real event — goods arrived, a pallet
 * moved, a truck left. An adjustment is somebody saying "the system is wrong", and if that is
 * cheap and quiet it becomes the tool used to make awkward numbers go away.
 *
 * So three things are deliberately true here, and each one costs the operator something:
 *
 *   1. THE COUNT IS TYPED, THE VARIANCE IS CALCULATED. Nobody types a difference. They type what
 *      they counted, and the screen subtracts. A person who types "-3" has already decided what
 *      the answer is; a person who types "17" has counted a shelf. It is the same arithmetic and
 *      a completely different act.
 *
 *   2. A REASON IS REQUIRED, AND THE SERVER AGREES. `inventory.service.ts` refuses an adjustment
 *      with no `reasonCode` outright — this is not a form rule that a determined caller could
 *      skip. The reasons offered are the real ones a plant has, because "adjustment" as a reason
 *      for an adjustment tells a future reader nothing.
 *
 *   3. THE COUNTER IS NAMED. The signed-in principal travels in the entry's remarks, in addition
 *      to the `created_by` the audit trail records anyway. Ownership that is only in an audit
 *      table is ownership nobody sees; ownership on the document is ownership somebody expects
 *      to be asked about.
 *
 * WHAT CANNOT BE UNDONE, AND WHY THE SCREEN SAYS SO BEFORE RATHER THAN AFTER. A posted movement
 * is never edited. Inventory answers `editable: false, correctBy: "stock_adjustment"` at
 * `/inventory/stock/edit-policy` and this screen reads that endpoint rather than asserting it,
 * so the sentence shown to the operator is the server's own and cannot drift from it.
 *
 * ------------------------------------------------------------------------------------------
 * REPLENISHMENT, AND WHY THERE IS NO "BELOW MINIMUM" LIST.
 * ------------------------------------------------------------------------------------------
 * The item master holds no reorder level, no minimum, no maximum and no pick-face quantity, and
 * no endpoint exposes one. A screen that ranked parts as "needs replenishing" would be ranking
 * them against a threshold it invented. So replenishment here is the question that CAN be
 * answered from real data: for each part on this count sheet, how much of it is somewhere else
 * in the plant? That is what decides whether a short pick face can be topped up at all, and the
 * move itself is a transfer on the Locations screen.
 */

/**
 * The reasons a real plant adjusts stock. Free text up to 60 characters server-side; offered as a
 * list because a free-text reason box fills up with "correction" within a week, and a ledger
 * whose every adjustment says "correction" is a ledger with no explanation in it at all.
 */
const REASONS: ReadonlyArray<{ code: string; label: string; help: string }> = [
  {
    code: "cycle_count_variance",
    label: "Count variance — cause not yet known",
    help: "The shelf and the ledger disagree and nobody knows why yet. Honest, and the right answer more often than people admit.",
  },
  {
    code: "damaged_in_store",
    label: "Damaged in store",
    help: "Physically there but unusable. Consider moving it to a scrap location instead, so it stays counted.",
  },
  {
    code: "found_stock",
    label: "Found — was not on the ledger",
    help: "Stock that exists and the system did not know about. Usually a receipt that never got posted.",
  },
  {
    code: "mis_posted_issue",
    label: "An issue was posted wrongly",
    help: "Material was booked out that did not leave, or more was booked out than went.",
  },
  {
    code: "mis_posted_receipt",
    label: "A receipt was posted wrongly",
    help: "Goods were booked in that did not arrive, or the quantity was wrong.",
  },
  {
    code: "uom_or_conversion_error",
    label: "Unit or conversion error",
    help: "Counted in one unit, posted in another. Common with lengths, coils and fasteners by weight.",
  },
];

/** What the counter has typed and not yet posted. Never a balance. */
type Counted = Record<string, string>;

export default function CountsScreen(_props: ScreenProps): React.JSX.Element {
  const { can, identity } = useAccess();
  const canPost = can("inventory.stock.post");

  const warehouses = useQuery<WarehouseRow[]>(
    can("inventory.warehouse.read") ? warehouseApi.warehousesPath : null,
  );
  const [warehouseId, setWarehouseId] = useState("");
  const sheet = useQuery<StockRow[]>(warehouseId ? warehouseApi.stockPath : null, {
    query: warehouseId ? { warehouseId } : {},
  });
  /** Everything, everywhere — so "is there more of this elsewhere?" can be answered honestly. */
  const everywhere = useQuery<StockRow[]>(warehouseApi.stockPath);
  const policy = useQuery<StockEditPolicy>(warehouseApi.stockEditPolicyPath);

  const [counted, setCounted] = useState<Counted>({});
  const [reason, setReason] = useState<string>(REASONS[0]?.code ?? "cycle_count_variance");
  const [remarks, setRemarks] = useState("");
  const [log, setLog] = useState<readonly ScanLogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [posted, setPosted] = useState<StockEntryResult | null>(null);

  const handling = useHandlingKey();
  const inFlight = useInFlight();

  // Memoised rather than defaulted inline: a fresh `[]` on every render would change the identity
  // of every dependency array below it, and the variance arithmetic would re-run on each keystroke
  // of every other field on the page.
  const rows = useMemo(() => sheet.data ?? [], [sheet.data]);
  const keyOf = (row: StockRow): string => `${row.itemId}:${row.batch}`;

  /**
   * THE EXCEPTIONS. Computed, not judged — a variance is a subtraction and nothing else decides
   * whether it is one. No model is consulted and none could usefully be.
   */
  const exceptions = useMemo(
    () =>
      rows
        .map((row) => {
          const typed = parseQty(counted[keyOf(row)] ?? "");
          if (typed === null) return null;
          const delta = variance(row.qty, typed);
          return delta === 0 ? null : { row, counted: typed, delta };
        })
        .filter((x): x is { row: StockRow; counted: number; delta: number } => x !== null),
    [counted, rows],
  );

  const agreed = useMemo(
    () =>
      rows.filter((row) => {
        const typed = parseQty(counted[keyOf(row)] ?? "");
        return typed !== null && variance(row.qty, typed) === 0;
      }).length,
    [counted, rows],
  );

  /** How much of a part sits somewhere other than the location being counted. */
  const elsewhere = useCallback(
    (itemId: string): number =>
      sumQty(
        (everywhere.data ?? [])
          .filter((r) => r.itemId === itemId && r.warehouseId !== warehouseId)
          .map((r) => r.qty),
      ),
    [everywhere.data, warehouseId],
  );

  const note = useCallback((entry: Omit<ScanLogEntry, "seq" | "at">): void => {
    setLog((current) => appendScan(current, entry));
  }, []);

  /**
   * A scan on a count sheet FINDS a line; it never counts one.
   *
   * Deliberate, and the opposite of the receiving bench. On goods-in each scan is one carton, so
   * incrementing is the act. On a count the operator has a shelf of forty in front of them and
   * types forty — a scanner that incremented would turn a count into a forty-trigger endurance
   * test, and a mis-fire in the middle of it would be invisible.
   */
  const handleScan = useCallback(
    (code: string): void => {
      const matches = matchScan(
        rows.map((r) => ({ ...r, itemCode: r.itemCode })),
        code,
      );
      const first = matches[0];
      if (!first) {
        note({
          code,
          outcome: "unknown",
          note: "Nothing with this code is on the ledger in this location. If it is physically here, that is itself the finding — count it into the nearest line, or post it as found stock once somebody has decided which lot it is.",
        });
        return;
      }
      if (matches.length > 1) {
        note({
          code,
          outcome: "accepted",
          note: `${matches.length} lots of ${first.itemCode} are on the sheet. Count each lot separately — they are separate rows on the ledger.`,
        });
        return;
      }
      note({
        code,
        outcome: "accepted",
        note: `${first.itemCode}${first.batch ? ` · lot ${first.batch}` : ""} — the ledger says ${fmtQty(first.qty, first.uom)}. Type what you counted.`,
      });
      // Focus the field the operator is about to use. `scrollIntoView` rather than autofocus so a
      // scanner burst cannot steal focus mid-typing on the previous line.
      document.getElementById(`count-${keyOf(first)}`)?.scrollIntoView({ block: "center" });
    },
    [note, rows],
  );

  /* ------------------------------------------------------------------------------------------
     THE POSTING. One adjustment entry, every exception as a signed line.
     ------------------------------------------------------------------------------------------ */
  const body: StockEntryBody | null = useMemo(() => {
    if (!warehouseId || exceptions.length === 0) return null;
    const lines: StockEntryLine[] = exceptions.map((exception) => ({
      itemId: exception.row.itemId,
      // An adjustment names only a destination and carries a SIGNED quantity — a shortfall is a
      // negative to the same location, not an issue to nowhere.
      toWarehouseId: exception.row.warehouseId,
      batch: exception.row.batch,
      qty: round3(exception.delta),
    }));
    const who = identity?.principal ?? "an unidentified user";
    return {
      entryType: "adjustment",
      reasonCode: reason,
      remarks:
        `Cycle count by ${who}${remarks.trim() ? ` — ${remarks.trim()}` : ""}`.slice(0, 500),
      lines,
    };
  }, [exceptions, identity, reason, remarks, warehouseId]);

  async function post(): Promise<void> {
    if (!body || inFlight.held()) return;
    inFlight.hold();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<StockEntryResult>(warehouseApi.stockEntriesPath, body, {
        idempotencyKey: handling.keyFor("cyclecount", body),
      });
      setPosted(result);
      setCounted({});
      setLog([]);
      sheet.reload();
      everywhere.reload();
    } catch (e) {
      setError(e);
    } finally {
      inFlight.release();
      setBusy(false);
    }
  }

  const labelFor = useCallback(
    (itemId: string, whId: string): { item: string; warehouse: string; uom: string | null } => {
      const row = rows.find((r) => r.itemId === itemId);
      const wh = warehouses.data?.find((w) => w.id === whId);
      return {
        item: row?.itemCode ?? itemId.slice(0, 8),
        warehouse: wh ? `${wh.code} — ${wh.name}` : whId.slice(0, 8),
        uom: row?.uom ?? null,
      };
    },
    [rows, warehouses.data],
  );

  const chosenReason = REASONS.find((r) => r.code === reason);
  const location = warehouses.data?.find((w) => w.id === warehouseId);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Cycle counts"
        subtitle="Count a location against the ledger, see every disagreement, and post the corrections as one adjustment with a reason and a named counter."
        meta={[
          { label: "Lines on the sheet", value: warehouseId ? String(rows.length) : "—" },
          { label: "Counted and agreeing", value: String(agreed) },
          { label: "Disagreements", value: String(exceptions.length) },
        ]}
      />

      <ActionNotice error={error} />

      {posted ? (
        <LedgerReceipt
          title="Adjustment posted"
          entryId={posted.entryId}
          lineCount={posted.lineCount}
          movements={posted.movements}
          labelFor={labelFor}
        >
          <p>
            Recorded as a cycle count by{" "}
            <b>{identity?.principal ?? "an unidentified user"}</b>, reason{" "}
            <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11px]">
              {posted.entryType === "adjustment" ? reason : posted.entryType}
            </code>
            . This cannot be reversed from here — a mistake in a count is corrected by counting
            again and posting a further adjustment, and both stay on the record.
          </p>
        </LedgerReceipt>
      ) : null}

      {/* ---- what is being counted ---------------------------------------------------------- */}
      <section className="x-home-panel" aria-labelledby="counts-setup-heading">
        <div className="x-home-panel-head flex-wrap gap-3">
          <div>
            <h2 id="counts-setup-heading" className="x-section-heading">
              What is being counted, and by whom
            </h2>
            <p>
              Counting one location at a time is the point of a cycle count — a plant-wide count
              needs the plant stopped, and a count taken while stock is moving is a count of
              nothing.
            </p>
          </div>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <label className="x-field">
            Location
            <select
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setCounted({});
                setLog([]);
                setPosted(null);
                setError(null);
              }}
              aria-label="Location to count"
            >
              <option value="">Choose a location…</option>
              {(warehouses.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name} ({warehouseTypeLabel(w.warehouseType)})
                </option>
              ))}
            </select>
            <small>
              {location
                ? `Only non-zero balances are listed. A part that the ledger thinks is absent will not appear — if you find some, that is found stock and it needs a line adding by Inventory.`
                : "Pick a location to draw its count sheet."}
            </small>
          </label>

          <label className="x-field">
            Reason for any difference
            <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Adjustment reason">
              {REASONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
            <small>{chosenReason?.help ?? "One reason covers every line on this posting."}</small>
          </label>

          <label className="x-field">
            Counted by
            <input
              type="text"
              value={identity?.principal ?? "Not signed in"}
              readOnly
              aria-readonly
              className="cursor-not-allowed"
            />
            <small>
              Taken from your sign-in and written onto the stock entry. It cannot be typed over —
              ownership of a count is not a free-text field.
            </small>
          </label>
        </div>
        <div className="px-5 pb-5">
          <label className="x-field">
            Note for whoever reads this in six months (optional)
            <input
              type="text"
              maxLength={300}
              value={remarks}
              placeholder="Rack 4 was re-labelled last week"
              onChange={(e) => setRemarks(e.target.value)}
            />
            <small>Added to the entry&rsquo;s remarks alongside your name.</small>
          </label>
        </div>
      </section>

      {/* ---- the sheet ---------------------------------------------------------------------- */}
      {!warehouseId ? (
        <Empty
          title="Choose a location to count"
          body="The sheet is the ledger's own picture of that location: every part, every lot, and the quantity the system believes is there."
        />
      ) : sheet.loading ? (
        <Loading label="Drawing the count sheet…" />
      ) : sheet.error ? (
        <ErrorState error={sheet.error} onRetry={sheet.reload} />
      ) : rows.length === 0 ? (
        <Empty
          title="The ledger says this location is empty"
          body="Nothing is on hand here. If there is stock on the shelf, the ledger has no line to adjust — Inventory has to receive it before it can be counted."
        />
      ) : (
        <>
          <section className="x-home-panel" aria-labelledby="counts-sheet-heading">
            <div className="x-home-panel-head flex-wrap gap-3">
              <div>
                <h2 id="counts-sheet-heading" className="x-section-heading">
                  {location ? `${location.code} — ${location.name}` : "Count sheet"}
                </h2>
                <p>
                  Type what you counted. Leave a line blank and it is not touched — a blank is
                  &ldquo;not counted&rdquo;, never zero.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4 p-5">
              <ScanField
                label="Find a line"
                hint="Scanning here jumps to the part's line so you can type the count. It does not count anything — on a count sheet, the number comes from the shelf, not from the trigger."
                autoFocus={false}
                onScan={handleScan}
              />

              <div className="overflow-x-auto">
                <table className="grid-table min-w-[52rem]">
                  <caption className="sr-only">
                    Count sheet: ledger quantity, counted quantity and the difference
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Part</th>
                      <th scope="col" className="w-40">
                        Lot
                      </th>
                      <th scope="col" className="w-36 text-right!">
                        Ledger says
                      </th>
                      <th scope="col" className="w-36">
                        You counted
                      </th>
                      <th scope="col" className="w-36 text-right!">
                        Difference
                      </th>
                      <th scope="col" className="w-40 text-right!">
                        Elsewhere
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const key = keyOf(row);
                      const typed = parseQty(counted[key] ?? "");
                      const delta = typed === null ? null : variance(row.qty, typed);
                      const other = elsewhere(row.itemId);
                      return (
                        <tr key={key}>
                          <td>
                            <div className="min-w-0">
                              <div className="font-semibold text-[var(--text-primary)]">
                                {row.itemCode}
                              </div>
                              <div className="truncate text-[12px] text-[var(--text-secondary)]">
                                {row.itemName}
                              </div>
                            </div>
                          </td>
                          <td>
                            {row.batch ? (
                              <span className="font-[var(--font-mono)] text-[12px]">{row.batch}</span>
                            ) : (
                              <span className="text-[var(--text-muted)]">Unbatched</span>
                            )}
                          </td>
                          <td className="text-right tabular-nums" data-numeric="">
                            {fmtQty(row.qty, row.uom)}
                          </td>
                          <td>
                            <input
                              id={`count-${key}`}
                              type="number"
                              min={0}
                              step="0.001"
                              inputMode="decimal"
                              value={counted[key] ?? ""}
                              disabled={busy}
                              aria-label={`Counted quantity for ${row.itemCode}${row.batch ? ` lot ${row.batch}` : ""}`}
                              onChange={(e) =>
                                setCounted((c) => ({ ...c, [key]: e.target.value }))
                              }
                              className="h-10 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-right tabular-nums text-[13px] text-[var(--text-primary)]"
                            />
                          </td>
                          <td className="text-right tabular-nums" data-numeric="">
                            {delta === null ? (
                              <span className="text-[var(--text-muted)]">Not counted</span>
                            ) : delta === 0 ? (
                              <span className="text-[var(--status-approved-text)]">Agrees</span>
                            ) : (
                              <span
                                className={
                                  delta < 0
                                    ? "font-semibold text-[var(--status-rejected-text)]"
                                    : "font-semibold text-[var(--status-pending-text)]"
                                }
                              >
                                {delta > 0 ? "+" : ""}
                                {fmtQty(delta, row.uom)}
                              </span>
                            )}
                          </td>
                          <td className="text-right tabular-nums text-[var(--text-secondary)]" data-numeric="">
                            {other > 0 ? fmtQty(other, row.uom) : "None"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <HonestyNote title="A surplus is not good news.">
                <p>
                  A count that finds more than the ledger expected is as much a sign of a
                  mis-posted issue as a shortfall is of a mis-posted receipt. Both directions are
                  shown, both need a reason, and neither is rounded away.
                </p>
              </HonestyNote>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-prose text-[12px] leading-[1.6] text-[var(--text-secondary)]">
                  {exceptions.length === 0 ? (
                    <>
                      Nothing to post yet. Lines you have counted that agree with the ledger need no
                      adjustment — a count that agrees is the normal outcome and produces no
                      movement at all.
                    </>
                  ) : (
                    <>
                      <b className="text-[var(--text-primary)]">
                        {exceptions.length} line{exceptions.length === 1 ? "" : "s"} disagree with the
                        ledger.
                      </b>{" "}
                      They post as one adjustment, all together or not at all. Pressing the button
                      twice is safe — the key is derived from these figures, so a retry replays.
                    </>
                  )}
                </p>
                <Can
                  permission="inventory.stock.post"
                  fallback={
                    <span className="text-[12px] text-[var(--text-muted)]">
                      Posting an adjustment needs inventory.stock.post.
                    </span>
                  }
                >
                  <button
                    type="button"
                    className="btn btn-pri min-h-[42px] px-5"
                    disabled={busy || body === null || !canPost}
                    onClick={() => void post()}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <ClipboardCheck className="h-4 w-4" aria-hidden />
                    )}
                    {busy
                      ? "Posting…"
                      : exceptions.length === 0
                        ? "Nothing to correct"
                        : `Post ${exceptions.length} correction${exceptions.length === 1 ? "" : "s"}`}
                  </button>
                </Can>
              </div>
            </div>
          </section>

          <ScanLog entries={log} />

          {/* ---- replenishment, honestly scoped ------------------------------------------- */}
          <section className="x-home-panel" aria-labelledby="counts-replen-heading">
            <div className="x-home-panel-head">
              <div>
                <h2 id="counts-replen-heading" className="x-section-heading">
                  Can this be topped up?
                </h2>
                <p>
                  There is no minimum, maximum or reorder level anywhere in this system, so nothing
                  here calls a part &ldquo;low&rdquo;. What it can answer is whether more of it
                  exists somewhere else in the plant.
                </p>
              </div>
            </div>
            <div className="p-5">
              {rows.filter((row) => elsewhere(row.itemId) > 0).length === 0 ? (
                <p className="text-[13px] text-[var(--text-secondary)]">
                  Nothing on this sheet is held anywhere else. Anything short here has to be bought
                  or made, not moved.
                </p>
              ) : (
                <ul className="flex flex-col gap-2 text-[13px]">
                  {rows
                    .filter((row) => elsewhere(row.itemId) > 0)
                    .slice(0, 12)
                    .map((row) => (
                      <li key={keyOf(row)} className="flex flex-wrap items-baseline gap-2">
                        <Scale className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
                        <b className="text-[var(--text-primary)]">{row.itemCode}</b>
                        <span className="text-[var(--text-secondary)]">
                          {fmtQty(row.qty, row.uom)} here · {fmtQty(elsewhere(row.itemId), row.uom)}{" "}
                          in other locations
                        </span>
                      </li>
                    ))}
                </ul>
              )}
              <p className="mt-3 text-[12px] text-[var(--text-muted)]">
                Moving it is a transfer, and it is done on the Locations screen so the movement and
                the count stay two separate, separately auditable decisions.
              </p>
            </div>
          </section>
        </>
      )}

      {/* ---- the server's own refusal to allow edits ---------------------------------------- */}
      <HonestyNote title="A posted count is never edited.">
        <p>
          {policy.data?.reason ??
            "Inventory refuses to edit a stock entry: the ledger records what physically moved, and editing a past movement changes the story about the shelf rather than the shelf."}{" "}
          The correction route it names is{" "}
          <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)] text-[12px]">
            {policy.data?.correctBy ?? "stock_adjustment"}
          </code>
          {policy.loading ? " (still reading the policy from the server)" : ""} — which is this
          screen. {policy.error ? "The policy endpoint could not be read just now, so the sentence above is this module's own statement of it." : ""}
        </p>
        {posted ? (
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">
            Last posting from this screen: {dateTime(new Date())}.
          </p>
        ) : null}
      </HonestyNote>
    </div>
  );
}
