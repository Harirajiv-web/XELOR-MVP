"use client";

import { useCallback, useMemo, useState } from "react";
import { Loader2, PackagePlus, ShieldAlert } from "lucide-react";
import { api } from "@spine/api/client";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { useAccess } from "@spine/access/permissions";
import { Empty, ErrorState, Loading } from "@spine/states";
import { date, qty as fmtQty, humanise, relativeDays } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type {
  GrnBody,
  GrnLineInput,
  GrnResult,
  InspectionRow,
  PoDetail,
  PoLineRow,
  PoSummaryRow,
  ScanLogEntry,
  WarehouseRow,
} from "../api";
import {
  CAPABILITY_GAPS,
  isHoldWarehouse,
  isReceivable,
  matchScan,
  outstanding,
  parseQty,
  round3,
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
 * RECEIVING — THE SCREEN THE WHOLE MODULE WAS DESIGNED AROUND.
 * ============================================================================================
 *
 * A goods-in bench has one job and five ways to get it wrong, and the five are not exotic. They
 * are what happens on an ordinary Tuesday with a bouncing scanner trigger, a torn label and a
 * Wi-Fi access point at the far end of a shed. This screen was written against those five, and
 * the requirement is one sentence:
 *
 *   A WRONG LOT, A DUPLICATE SCAN, A DAMAGED LABEL, A PARTIAL RECEIPT AND A DROPPED NETWORK
 *   MUST BETWEEN THEM PRODUCE NO DUPLICATE STOCK MOVEMENT.
 *
 * Each one is handled somewhere specific, and each is handled VISIBLY, because a refusal the
 * operator cannot see is indistinguishable from an acceptance:
 *
 *   A CODE THAT IS NOT ON THIS ORDER is refused at the scan field, named, and logged. It is
 *     never fuzzy-matched to the closest line — a receiving screen that helpfully picks the
 *     nearest part number will one day book a casting against the wrong drawing, and the
 *     operator will not question it because the system chose it.
 *
 *   A DUPLICATE SCAN — the same code arriving twice inside `DUPLICATE_WINDOW_MS`, which is what
 *     a bouncing trigger looks like — is refused, shown as refused, and offered as a deliberate
 *     "count it again" the operator has to choose. Scanning the same part number for a second
 *     carton is legitimate; scanning it twice in 400 ms is not, and the difference between them
 *     is time, so time is what is measured.
 *
 *   A DAMAGED LABEL is why this is a TEXT FIELD and not a camera. The code gets typed, the
 *     quantity gets typed, and the receipt is posted exactly as if the gun had worked. Nothing
 *     on this screen requires hardware to be present or working.
 *
 *   A PARTIAL RECEIPT is the normal case, not an exception: receive what turned up, the server
 *     moves the order to `partially_received`, and the rest stays outstanding. Over-receiving is
 *     refused here before it is sent AND again by the server with `OVER_RECEIPT`.
 *
 *   A DROPPED NETWORK is the one the UI cannot solve on its own, and it is solved by the PINNED
 *     IDEMPOTENCY KEY. The key is derived from the figures being posted, so pressing Post again
 *     after a timeout REPLAYS the first attempt instead of repeating it. The screen says so in
 *     those words, because a storekeeper who is unsure will otherwise wait, or worse, press it
 *     twice deliberately.
 *
 * ------------------------------------------------------------------------------------------
 * THE STOCK MOVEMENT IS NOT MADE HERE.
 * ------------------------------------------------------------------------------------------
 * `POST /purchase/grns` posts the receipt through INVENTORY'S single write path inside the same
 * transaction as the receipt document and the purchase-order update. All three commit together
 * or none of them do. This screen builds a document body; it does not build a stock movement and
 * it does not call a stock endpoint.
 *
 * ------------------------------------------------------------------------------------------
 * THE QUALITY HOLD IS A PLACE, NOT A FLAG.
 * ------------------------------------------------------------------------------------------
 * There is no "hold" checkbox, because there is no hold column. What there IS, and what the
 * plant already uses, is a warehouse whose type is `quarantine`: stock received there is on the
 * books, in the ledger and counted, and it cannot be picked from because nobody picks from
 * quarantine. Choosing that destination IS the hold, it is one decision rather than two, and it
 * cannot drift out of step with a flag somewhere else.
 *
 * Whether Quality then opens an inspection is Quality's decision. This screen holds
 * `quality.inspection.read` and nothing more: it can show that an inspection exists, and it
 * offers no button to open, judge or disposition one.
 */

/**
 * A trigger bounce, in milliseconds.
 *
 * Measured against the behaviour being guarded: a wedge scanner that double-fires does it in
 * well under a second, while a person scanning a second carton takes at least a second to move
 * their hand. 1500 ms sits between the two with room on both sides. It is deliberately not zero
 * (which would refuse nothing) and deliberately not "once per code ever" (which would make
 * receiving a 40-carton pallet impossible).
 */
const DUPLICATE_WINDOW_MS = 1500;

/** What the operator has typed and NOT yet posted. Never a balance — see the module's api.ts. */
interface StagedLine {
  /** Free text while typing. Parsed only at submit, so a half-typed "1." is not a zero. */
  qty: string;
  /** The supplier's lot, as printed. Recorded, never validated — see the note on screen. */
  batch: string;
}

export default function ReceiveScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const canSeeWarehouses = can("inventory.warehouse.read");
  const canSeeInspections = can("quality.inspection.read");

  const orders = useCursorList<PoSummaryRow>(warehouseApi.purchaseOrdersPath, {
    limit: warehouseApi.pageSize,
  });
  const [poId, setPoId] = useState("");
  const detail = useQuery<PoDetail>(poId ? warehouseApi.purchaseOrderPath(poId) : null);
  const warehouses = useQuery<WarehouseRow[]>(
    canSeeWarehouses ? warehouseApi.warehousesPath : null,
  );
  const inspections = useCursorList<InspectionRow>(
    canSeeInspections ? warehouseApi.inspectionsPath : null,
    { limit: warehouseApi.pageSize },
  );

  const [warehouseId, setWarehouseId] = useState("");
  const [staged, setStaged] = useState<Record<string, StagedLine>>({});
  const [log, setLog] = useState<readonly ScanLogEntry[]>([]);
  const [lastScan, setLastScan] = useState<{ code: string; at: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [posted, setPosted] = useState<GrnResult | null>(null);

  const handling = useHandlingKey();
  const inFlight = useInFlight();

  /** Only these two states can be received — `purchase.service.ts` refuses every other one. */
  const receivable = useMemo(
    () => orders.rows.filter((row) => isReceivable(row.status)),
    [orders.rows],
  );

  const po = detail.data;
  const openLines = useMemo(
    () => (po ? po.lines.filter((line) => outstanding(line.qty, line.receivedQty) > 0) : []),
    [po],
  );

  const destination = warehouses.data?.find((w) => w.id === warehouseId) ?? null;
  const isHold = destination ? isHoldWarehouse(destination.warehouseType) : false;

  /** Inspections already opened against a receipt. Read-only context, never an action. */
  const receiptInspections = useMemo(
    () => inspections.rows.filter((row) => row.refType === "grn"),
    [inspections.rows],
  );

  const note = useCallback((entry: Omit<ScanLogEntry, "seq" | "at">): void => {
    setLog((current) => appendScan(current, entry));
  }, []);

  /* ------------------------------------------------------------------------------------------
     THE SCAN. Every path through this function ends in a log entry, including every refusal.
     ------------------------------------------------------------------------------------------ */
  const handleScan = useCallback(
    (code: string): void => {
      if (!po) {
        note({ code, outcome: "unknown", note: "No purchase order is open, so there is nothing to receive against." });
        return;
      }

      const matches = matchScan(openLines, code);
      const line = matches[0];
      if (!line) {
        // Named refusal. "Not recognised" would leave the operator guessing whether the gun,
        // the label or the order is wrong; naming the order tells them which.
        note({
          code,
          outcome: "unknown",
          note: `Nothing outstanding on ${po.poNo} has this code. Check the label against the order, or receive it against the order it actually belongs to.`,
        });
        return;
      }
      if (matches.length > 1) {
        note({
          code,
          outcome: "unknown",
          note: `${po.poNo} has ${matches.length} outstanding lines for this code. Type the quantity against the right line instead — the system will not guess which one.`,
        });
        return;
      }

      const now = Date.now();
      if (lastScan && lastScan.code === code && now - lastScan.at < DUPLICATE_WINDOW_MS) {
        // THE DUPLICATE REFUSAL. Loud, specific, and it does NOT silently drop the scan — the
        // operator is told the count was left alone and how to count it deliberately.
        note({
          code,
          outcome: "duplicate",
          note: `Scanned again within ${DUPLICATE_WINDOW_MS / 1000}s — that is a trigger bounce, not a second carton. The count was NOT increased. If it really is a second one, add it in the quantity box on the line.`,
        });
        setLastScan({ code, at: now });
        return;
      }

      const current = staged[line.id]?.qty ?? "";
      const currentQty = parseQty(current) ?? 0;
      const remaining = outstanding(line.qty, line.receivedQty);
      const next = round3(currentQty + 1);
      if (next > remaining) {
        note({
          code,
          outcome: "over",
          note: `${po.poNo} line ${line.lineNo} has only ${remaining} ${line.uom ?? ""} still to come and ${currentQty} is already counted. Receiving more than was ordered needs Purchasing to amend the order.`,
        });
        setLastScan({ code, at: now });
        return;
      }

      setStaged((s) => ({
        ...s,
        [line.id]: { qty: String(next), batch: s[line.id]?.batch ?? "" },
      }));
      setLastScan({ code, at: now });
      note({
        code,
        outcome: "accepted",
        note: `Line ${line.lineNo} · ${line.itemCode ?? line.itemId.slice(0, 8)} — counted ${next} of ${remaining}. Nothing is posted yet.`,
      });
    },
    [lastScan, note, openLines, po, staged],
  );

  /* ------------------------------------------------------------------------------------------
     THE POST.
     ------------------------------------------------------------------------------------------ */
  const body: GrnBody | null = useMemo(() => {
    if (!po || !warehouseId) return null;
    const lines: GrnLineInput[] = [];
    for (const line of openLines) {
      const entry = staged[line.id];
      if (!entry) continue;
      const parsed = parseQty(entry.qty);
      if (parsed === null || parsed <= 0) continue;
      const batch = entry.batch.trim();
      lines.push(batch ? { poLineId: line.id, qty: parsed, batch } : { poLineId: line.id, qty: parsed });
    }
    if (lines.length === 0) return null;
    return { poId: po.id, warehouseId, lines };
  }, [openLines, po, staged, warehouseId]);

  /** Lines typed past what the order still expects. Refused here, and again by the server. */
  const overLines = useMemo(() => {
    if (!po) return [] as PoLineRow[];
    return openLines.filter((line) => {
      const parsed = parseQty(staged[line.id]?.qty ?? "");
      return parsed !== null && parsed > outstanding(line.qty, line.receivedQty);
    });
  }, [openLines, po, staged]);

  async function post(): Promise<void> {
    if (!body || inFlight.held()) return;
    inFlight.hold();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<GrnResult>(warehouseApi.grnsPath, body, {
        // PINNED to the figures. A retry after a timeout replays; it cannot post twice.
        idempotencyKey: handling.keyFor("grn", body),
      });
      setPosted(result);
      setStaged({});
      setLog([]);
      setLastScan(null);
      detail.reload();
      orders.reload();
    } catch (e) {
      setError(e);
    } finally {
      inFlight.release();
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------------------------------------
     RENDER.
     ------------------------------------------------------------------------------------------ */

  const labelFor = useCallback(
    (itemId: string, whId: string): { item: string; warehouse: string; uom: string | null } => {
      const line = po?.lines.find((l) => l.itemId === itemId);
      const wh = warehouses.data?.find((w) => w.id === whId);
      return {
        item: line?.itemCode ?? itemId.slice(0, 8),
        warehouse: wh ? `${wh.code} — ${wh.name}` : whId.slice(0, 8),
        uom: line?.uom ?? null,
      };
    },
    [po, warehouses.data],
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Goods in"
        subtitle="Receive against a purchase order with a scanner or by typing. Every receipt posts to the one stock ledger through Purchasing's receipt, and a repeated post cannot move stock twice."
        meta={[
          { label: "Open to receive", value: orders.loading ? "…" : String(receivable.length) },
          { label: "Counted, unposted", value: String(Object.keys(staged).length) },
        ]}
      />

      <HonestyNote title="This is a website, not an offline application.">
        <p>{CAPABILITY_GAPS.offline}</p>
      </HonestyNote>

      {posted ? (
        <LedgerReceipt
          title={`Receipt ${posted.grnNo} posted against ${posted.poNo}`}
          movements={posted.stockMovements ?? []}
          labelFor={labelFor}
        >
          <p>
            The purchase order is now <b>{humanise(posted.poStatus)}</b>. The receipt document, the
            order&rsquo;s received quantities and the ledger rows below were written in one
            transaction — all of them, or none of them.
          </p>
          {isHold ? (
            <p className="mt-1">
              It landed in a quarantine location. The stock is on the books and counted; it is not
              available to pick until Quality moves it.
            </p>
          ) : null}
        </LedgerReceipt>
      ) : null}

      <ActionNotice error={error} />

      {/* ---- 1. WHICH ORDER ---------------------------------------------------------------- */}
      <section className="x-home-panel" aria-labelledby="receive-order-heading">
        <div className="x-home-panel-head flex-wrap gap-3">
          <div>
            <h2 id="receive-order-heading" className="x-section-heading">
              What arrived, and against what
            </h2>
            <p>
              Only approved and part-received orders are listed. The server refuses a receipt
              against any other state, so offering one would be offering a guaranteed rejection.
            </p>
          </div>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <label className="x-field">
            Purchase order
            <select
              value={poId}
              onChange={(e) => {
                setPoId(e.target.value);
                setStaged({});
                setLog([]);
                setPosted(null);
                setError(null);
              }}
              aria-label="Purchase order to receive against"
            >
              <option value="">Choose an order…</option>
              {receivable.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.poNo} · {row.vendorName}
                  {row.expectedDate ? ` · due ${date(row.expectedDate)}` : ""}
                </option>
              ))}
            </select>
            <small>
              {orders.loading
                ? "Reading the order book…"
                : receivable.length === 0
                  ? "No order is in a state that can be received. An order has to be approved first."
                  : `${receivable.length} order${receivable.length === 1 ? "" : "s"} can be received. ${
                      orders.hasMore ? "More are still to load." : ""
                    }`}
            </small>
          </label>

          <label className="x-field">
            Where it is going
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              disabled={!canSeeWarehouses}
              aria-label="Destination warehouse"
            >
              <option value="">Choose a location…</option>
              {(warehouses.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name} ({warehouseTypeLabel(w.warehouseType)})
                </option>
              ))}
            </select>
            <small>
              {!canSeeWarehouses
                ? "You cannot read the warehouse master, so a destination cannot be chosen here. Ask your administrator for inventory.warehouse.read."
                : destination
                  ? isHold
                    ? "A quarantine location. The stock will be on the books and counted, and nobody picks from quarantine — this IS the quality hold."
                    : `Type: ${warehouseTypeLabel(destination.warehouseType)}. Stock received here is immediately available to pick.`
                  : "Receiving into a quarantine-typed location is how a batch is held for inspection. There is no separate hold switch, because there is no separate hold record."}
            </small>
          </label>
        </div>

        {destination && isHold ? (
          <div className="px-5 pb-5">
            <div className="x-notice" data-tone="warning" role="note">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">This receipt will be held.</p>
                <p>
                  {destination.code} is a quarantine location. The quantity still enters the ledger
                  and still appears on a stock count — held is not invisible. Whether an inspection
                  is opened against it is Quality&rsquo;s decision and is not made from this screen.
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* ---- 2. THE BENCH ------------------------------------------------------------------ */}
      {!poId ? (
        <Empty
          title="Choose an order to start receiving"
          body="Pick the purchase order the delivery belongs to. The lines it still expects will appear here, and the scan field will only accept codes that are on it."
        />
      ) : detail.loading ? (
        <Loading label="Reading the order…" />
      ) : detail.error ? (
        <ErrorState error={detail.error} onRetry={detail.reload} />
      ) : !po ? (
        <Empty title="That order is no longer readable" body="Choose another from the list." />
      ) : (
        <>
          <section className="x-home-panel" aria-labelledby="receive-scan-heading">
            <div className="x-home-panel-head flex-wrap gap-3">
              <div>
                <h2 id="receive-scan-heading" className="x-section-heading">
                  {po.poNo} · {po.vendorName}
                </h2>
                <p>
                  {openLines.length === 0
                    ? "Every line on this order has been received in full."
                    : `${openLines.length} line${openLines.length === 1 ? "" : "s"} still outstanding. Scan a part, or type the quantity straight onto the line.`}
                </p>
              </div>
              <StatusBadge status={po.status} />
            </div>

            <div className="flex flex-col gap-4 p-5">
              <ScanField
                label="Scan a part"
                hint="A scanner gun types into this field and presses Enter. So can you — if the label is torn, type the part code. Each accepted scan counts one; nothing posts until you press Post receipt."
                disabled={openLines.length === 0 || busy}
                onScan={handleScan}
              />

              <HonestyNote title="A lot number is recorded here, not checked.">
                <p>
                  A purchase order carries no expected lot, so there is nothing for the system to
                  check a supplier&rsquo;s lot against. What you type is what goes on the ledger row
                  and what the batch will be called for the rest of its life — so type it from the
                  label, not from memory. Leave it blank and the stock is received unbatched.
                </p>
              </HonestyNote>

              {openLines.length === 0 ? (
                <Empty
                  title="Nothing outstanding on this order"
                  body="Every line has been received in full. Choose another order above."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="grid-table min-w-[48rem]">
                    <caption className="sr-only">
                      Outstanding lines on {po.poNo}, with the quantity counted at this bench
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className="w-16">
                          Line
                        </th>
                        <th scope="col">Part</th>
                        <th scope="col" className="w-32 text-right!">
                          Ordered
                        </th>
                        <th scope="col" className="w-32 text-right!">
                          Already in
                        </th>
                        <th scope="col" className="w-32 text-right!">
                          Still due
                        </th>
                        <th scope="col" className="w-40">
                          Receiving now
                        </th>
                        <th scope="col" className="w-44">
                          Lot on the label
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {openLines.map((line) => {
                        const remaining = outstanding(line.qty, line.receivedQty);
                        const entry = staged[line.id];
                        const parsed = parseQty(entry?.qty ?? "");
                        const over = parsed !== null && parsed > remaining;
                        return (
                          <tr key={line.id}>
                            <td className="tabular-nums" data-numeric="">
                              {line.lineNo}
                            </td>
                            <td>
                              <div className="min-w-0">
                                <div className="font-semibold text-[var(--text-primary)]">
                                  {line.itemCode ?? (
                                    <span className="font-[var(--font-mono)] text-[12px]">
                                      {line.itemId.slice(0, 8)}
                                    </span>
                                  )}
                                </div>
                                {line.itemName ? (
                                  <div className="truncate text-[12px] text-[var(--text-secondary)]">
                                    {line.itemName}
                                  </div>
                                ) : null}
                              </div>
                            </td>
                            <td className="text-right tabular-nums" data-numeric="">
                              {fmtQty(line.qty, line.uom)}
                            </td>
                            <td className="text-right tabular-nums" data-numeric="">
                              {fmtQty(line.receivedQty, line.uom)}
                            </td>
                            <td
                              className="text-right font-semibold tabular-nums text-[var(--text-primary)]"
                              data-numeric=""
                            >
                              {fmtQty(remaining, line.uom)}
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                max={remaining}
                                step="0.001"
                                inputMode="decimal"
                                value={entry?.qty ?? ""}
                                disabled={busy}
                                aria-label={`Quantity received on line ${line.lineNo}`}
                                aria-invalid={over}
                                onChange={(e) =>
                                  setStaged((s) => ({
                                    ...s,
                                    [line.id]: { qty: e.target.value, batch: s[line.id]?.batch ?? "" },
                                  }))
                                }
                                className="h-10 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 text-right tabular-nums text-[13px] text-[var(--text-primary)]"
                              />
                              {over ? (
                                <span className="mt-1 block text-[11px] text-[var(--status-rejected-text)]">
                                  More than the {fmtQty(remaining, line.uom)} still due.
                                </span>
                              ) : null}
                            </td>
                            <td>
                              <input
                                type="text"
                                maxLength={60}
                                autoComplete="off"
                                spellCheck={false}
                                value={entry?.batch ?? ""}
                                disabled={busy}
                                placeholder="As printed"
                                aria-label={`Lot number on line ${line.lineNo}`}
                                onChange={(e) =>
                                  setStaged((s) => ({
                                    ...s,
                                    [line.id]: { qty: s[line.id]?.qty ?? "", batch: e.target.value },
                                  }))
                                }
                                className="h-10 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] px-2 font-[var(--font-mono)] text-[12px] text-[var(--text-primary)]"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-prose text-[12px] leading-[1.6] text-[var(--text-secondary)]">
                  <b className="text-[var(--text-primary)]">Pressing Post twice is safe.</b> This
                  receipt carries a key derived from the figures above, so if the connection drops
                  and you press it again, the server replays the first answer rather than receiving
                  the goods a second time. Change a figure and it correctly becomes a new receipt.
                </p>
                <button
                  type="button"
                  className="btn btn-pri min-h-[42px] px-5"
                  disabled={busy || body === null || overLines.length > 0}
                  onClick={() => void post()}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <PackagePlus className="h-4 w-4" aria-hidden />
                  )}
                  {busy
                    ? "Posting…"
                    : body === null
                      ? "Nothing counted yet"
                      : `Post receipt — ${body.lines.length} line${body.lines.length === 1 ? "" : "s"}`}
                </button>
              </div>

              {overLines.length > 0 ? (
                <div className="x-notice" data-tone="error" role="alert">
                  <div>
                    <p className="font-semibold">
                      {overLines.length} line{overLines.length === 1 ? " is" : "s are"} over the
                      quantity ordered.
                    </p>
                    <p>
                      The server refuses an over-receipt outright, so this is stopped here rather
                      than sent to fail. Correct the figure, or ask Purchasing to amend the order.
                    </p>
                  </div>
                </div>
              ) : null}

              {warehouseId === "" ? (
                <p className="text-[12px] text-[var(--text-muted)]">
                  Choose where the goods are going before posting — the receipt has to name a
                  location, and that choice is also what decides whether the batch is held.
                </p>
              ) : null}
            </div>
          </section>

          <ScanLog entries={log} />

          {canSeeInspections && receiptInspections.length > 0 ? (
            <section className="x-home-panel" aria-labelledby="receive-quality-heading">
              <div className="x-home-panel-head">
                <div>
                  <h2 id="receive-quality-heading" className="x-section-heading">
                    Inspections opened against receipts
                  </h2>
                  <p>
                    Read-only. Quality opens, judges and dispositions these; nothing on this screen
                    can change one, and no button here pretends otherwise.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="grid-table">
                  <caption className="sr-only">Inspections raised against goods receipts</caption>
                  <thead>
                    <tr>
                      <th scope="col">Inspection</th>
                      <th scope="col">Material</th>
                      <th scope="col" className="w-36">
                        Status
                      </th>
                      <th scope="col" className="w-36">
                        Result
                      </th>
                      <th scope="col" className="w-36">
                        Completed
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptInspections.slice(0, 10).map((row) => (
                      <tr key={row.id}>
                        <td className="font-semibold text-[var(--text-primary)]">
                          {row.inspectionNo}
                        </td>
                        <td>
                          {row.itemCode ?? "Not resolvable"}
                          {row.itemName ? (
                            <div className="truncate text-[12px] text-[var(--text-secondary)]">
                              {row.itemName}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <StatusBadge status={row.status} />
                        </td>
                        <td>{humanise(row.result)}</td>
                        <td className="text-[var(--text-secondary)]">
                          {row.completedAt ? (
                            <>
                              {date(row.completedAt)}{" "}
                              <span className="text-[var(--text-muted)]">
                                {relativeDays(row.completedAt)}
                              </span>
                            </>
                          ) : (
                            "Not finished"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
