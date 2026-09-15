"use client";

import { useEffect, useMemo, useState } from "react";
import { History, Info, RefreshCw, TriangleAlert } from "lucide-react";
import { api } from "@spine/api/client";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { Empty, ErrorState } from "@spine/states";
import { date, dateTime, humanise, num, qty as fmtQty } from "@spine/format";
import { useAccess } from "@spine/access/permissions";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge, toneFor } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import {
  diffBoms,
  diffKindLabel,
  diffTone,
  engChangeApi,
  type BomEditPolicy,
  type BomView,
  type ItemHistoryResponse,
  type ItemRow,
  type ProductionOrderRow,
} from "../api";

/**
 * REVISIONS — which revision is current, which revision was built, and what changed.
 *
 * ============================================================================
 * THE QUESTION THIS SCREEN EXISTS FOR
 * ============================================================================
 *
 * The project's own gap analysis names one sentence as unanswerable: "which revision was in
 * the unit we shipped in August". It is answerable, and this screen answers it — but only
 * through one specific record, and it is worth knowing exactly which, because the answer is
 * only as good as that record.
 *
 * A PRODUCTION ORDER PINS `bom_id` AT CREATION. The BOM controller then refuses to edit an
 * ACTIVE bill in place, with the reason saying to publish a new version instead, precisely
 * so that a later change cannot alter a build already on the floor. Those two facts together
 * make the pinned `bom_id` a permanent record of the revision a build was made to.
 *
 * So: production order → `bomId` → `GET /engineering/boms/:id` → `version`. That chain is
 * the answer, and it is the ONLY chain in this system that carries a revision.
 *
 * ============================================================================
 * THREE LIMITS, ALL OF WHICH ARE ON THE SCREEN AS WELL AS IN THIS COMMENT
 * ============================================================================
 *
 * 1. THERE IS NO "LIST THE VERSIONS OF THIS PART'S BILL" ENDPOINT. `GET /engineering/boms/:id`
 *    takes an id and nothing lists them. So the revisions shown here are DISCOVERED, from
 *    two places: the item's current bill (`defaultBomId`, the highest active version) and
 *    every bill pinned by a production order. A revision that was cut, never built, and then
 *    superseded is invisible to this screen. It is not hidden — it is genuinely unreachable
 *    through the API, and the screen says which of the two it is.
 *
 * 2. A BILL CARRIES NO DATE AND NO AUTHOR. `GET /engineering/boms/:id` returns id, item,
 *    version, output quantity, unit, notes and lines. There is no `createdAt` and no
 *    `createdBy` in the answer. "When was revision 3 cut, and by whom" therefore has no
 *    answer here. The columns are absent rather than blank: an empty column reads as missing
 *    data, which sends somebody looking for a bug that is actually a schema gap.
 *
 * 3. PUBLISHING A REVISION DOES NOT RETIRE THE ONE BEFORE IT. `POST /engineering/boms`
 *    inserts version n+1 and leaves version n active — nothing in this schema supersedes a
 *    bill. Both then appear in the active bill-of-materials graph that where-used and MRP's
 *    low-level codes are computed over. That is the single most consequential finding this
 *    module surfaces, so it is called out in the interface whenever it is true, not buried.
 *
 * The line-by-line difference between two revisions is real arithmetic over real rows, done
 * in `diffBoms` in `../api.ts`, matched on component ITEM ID and compared PER UNIT OF OUTPUT.
 * The reasoning for both of those choices is in that function.
 */

/* -------------------------------------------------------------------------- */
/* Discovering the revisions of one part                                      */
/* -------------------------------------------------------------------------- */

interface Revision {
  bom: BomView;
  /** From `edit-policy`, the only endpoint that reveals whether a bill is live. */
  policy: BomEditPolicy | null;
  /** Production orders built — or being built — to this exact revision. */
  builtBy: readonly ProductionOrderRow[];
  /** True when this is the item's `defaultBomId`: the highest live version. */
  isCurrent: boolean;
}

interface RevisionSet {
  revisions: readonly Revision[];
  loading: boolean;
  error: unknown;
  /** Production orders for this part whose pinned bill could not be read. */
  unreadable: number;
}

function useRevisions(
  item: ItemRow | undefined,
  productionRows: readonly ProductionOrderRow[],
  enabled: boolean,
  nonce: number,
): RevisionSet {
  const [revisions, setRevisions] = useState<readonly Revision[]>([]);
  const [unreadable, setUnreadable] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // The production orders for THIS part, and the distinct bills they pin. Computed outside
  // the effect so the effect does not re-run on every render of an unchanged array.
  const ownOrders = useMemo(
    () => (item ? productionRows.filter((row) => row.itemId === item.id) : []),
    [item, productionRows],
  );
  const bomIds = useMemo(() => {
    const ids = new Set<string>();
    if (item?.defaultBomId) ids.add(item.defaultBomId);
    for (const order of ownOrders) if (order.bomId) ids.add(order.bomId);
    return [...ids];
  }, [item?.defaultBomId, ownOrders]);
  const bomKey = bomIds.join(",");

  useEffect(() => {
    if (!enabled || !item || bomIds.length === 0) {
      setRevisions([]);
      setUnreadable(0);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const found: Revision[] = [];
        let missed = 0;
        for (const bomId of bomIds) {
          if (controller.signal.aborted) return;
          let bom: BomView;
          try {
            bom = await api.get<BomView>(engChangeApi.bomPath(bomId), {
              signal: controller.signal,
            });
          } catch (failure) {
            if (controller.signal.aborted || (failure as Error)?.name === "AbortError") return;
            // A bill a production order points at that cannot be read is COUNTED, never
            // skipped silently. A revision history missing one entry is worse than one that
            // says it is missing an entry, because only the second can be acted on.
            missed += 1;
            continue;
          }
          // The edit policy is a second request per revision and it earns it: it is the only
          // route that says whether a bill is live or a draft, and "is this the one we build
          // to" is the question the screen exists to answer. A failure here degrades to
          // "unknown" rather than taking the revision down with it.
          let policy: BomEditPolicy | null = null;
          try {
            policy = await api.get<BomEditPolicy>(engChangeApi.bomEditPolicyPath(bomId), {
              signal: controller.signal,
            });
          } catch {
            policy = null;
          }
          found.push({
            bom,
            policy,
            builtBy: ownOrders.filter((order) => order.bomId === bomId),
            isCurrent: item.defaultBomId === bomId,
          });
        }
        if (controller.signal.aborted) return;
        found.sort((a, b) => b.bom.version - a.bom.version);
        setRevisions(found);
        setUnreadable(missed);
      } catch (failure) {
        if (controller.signal.aborted || (failure as Error)?.name === "AbortError") return;
        setError(failure);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
    // `bomKey` stands in for the id array so an identical set does not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, item?.id, item?.defaultBomId, bomKey, ownOrders, nonce]);

  return { revisions, loading, error, unreadable };
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

export default function RevisionsScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const canBom = can("engineering.bom.read");
  const canProduction = can("production.order.read");

  const items = useCursorList<ItemRow>(engChangeApi.itemsPath, {
    limit: engChangeApi.pageSize,
  });
  const production = useCursorList<ProductionOrderRow>(
    canProduction ? engChangeApi.productionOrdersPath : null,
    { limit: 100 },
  );

  const [selectedId, setSelectedId] = useState("");
  const [nonce, setNonce] = useState(0);

  // Parts that are MADE here are the only ones with a revision to talk about. A bought part
  // has no bill, so offering it in the selector would offer a screen that can only ever say
  // "nothing here" — an empty answer to a question the user did not really ask.
  const madeItems = useMemo(
    () => items.rows.filter((row) => row.bomCount > 0 || row.defaultBomId !== null),
    [items.rows],
  );
  const selected = madeItems.find((row) => row.id === selectedId) ?? madeItems[0];

  const { revisions, loading, error, unreadable } = useRevisions(
    selected,
    production.rows,
    canBom,
    nonce,
  );

  const [fromVersion, setFromVersion] = useState<number | null>(null);
  const [toVersion, setToVersion] = useState<number | null>(null);

  // Default the comparison to the two newest revisions — the pair somebody almost always
  // wants, and the pair that answers "what did the last change actually do".
  useEffect(() => {
    const newest = revisions[0];
    const previous = revisions[1];
    setToVersion(newest ? newest.bom.version : null);
    setFromVersion(previous ? previous.bom.version : null);
  }, [revisions]);

  const from = revisions.find((r) => r.bom.version === fromVersion);
  const to = revisions.find((r) => r.bom.version === toVersion);
  const diff = from && to ? diffBoms(from.bom, to.bom) : null;
  const changedCount = diff ? diff.filter((row) => row.kind !== "unchanged").length : 0;

  const liveCount = revisions.filter((r) => r.policy?.status === "active").length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Revisions"
        subtitle="Which revision of a part's bill of material is current, which revisions were actually built, and exactly what changed between any two of them."
      />

      <section className="x-home-panel" aria-labelledby="revision-picker-heading">
        <div className="x-home-panel-head flex-wrap gap-3">
          <div>
            <h2 id="revision-picker-heading" className="x-section-heading">
              Choose a part
            </h2>
            <p>
              Only parts with a bill of material are listed — a bought part has no revision to
              show.
            </p>
          </div>
          {madeItems.length > 0 ? (
            <label className="flex min-w-0 flex-col gap-1 text-[12px] text-[var(--text-secondary)]">
              Part
              <select
                aria-label="Choose a part to see its revisions"
                className="h-10 max-w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-3 text-[var(--text-primary)]"
                value={selected?.id ?? ""}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {madeItems.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.itemCode} · {row.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {items.error ? (
          <div className="p-5">
            <ErrorState error={items.error} onRetry={items.reload} />
          </div>
        ) : items.loading ? (
          <p className="p-5 text-[13px] text-[var(--text-secondary)]" role="status">
            Loading the part list…
          </p>
        ) : madeItems.length === 0 ? (
          <div className="p-5">
            <Empty
              title="No part has a bill of material yet"
              body="A revision history needs a bill to have versions of. Add one through Engineering, and every version published afterwards will be visible here."
            />
          </div>
        ) : (
          <p className="px-5 pb-4 pt-4 text-[12px] text-[var(--text-muted)]">
            {items.hasMore
              ? "The selector shows the parts loaded so far. More exist — load them on the Change impact screen, or keep scrolling there."
              : `Every part with a bill of material is listed (${madeItems.length}).`}
          </p>
        )}
      </section>

      {!canBom ? (
        <div className="x-notice" data-tone="warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Revisions cannot be read without{" "}
            <code className="font-[var(--font-mono)] text-[12px]">engineering.bom.read</code>. This
            screen is empty because of your permissions, not because there are no revisions.
          </p>
        </div>
      ) : null}

      {selected && canBom ? (
        <>
          {liveCount > 1 ? (
            <div className="x-notice" data-tone="warning">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p>
                  <strong>
                    {selected.itemCode} has {liveCount} live bills of material.
                  </strong>{" "}
                  Publishing a revision does not retire the one before it — nothing in this system
                  supersedes a bill — so more than one version is active at once, and planning
                  walks all of them.
                </p>
                <p className="mt-1.5">
                  Until that is resolved, &ldquo;which revision is current&rdquo; has more than one
                  defensible answer. The screen treats the HIGHEST live version as current, because
                  that is what the item master&rsquo;s own default bill does.
                </p>
              </div>
            </div>
          ) : null}

          <section className="x-home-panel" aria-labelledby="revision-list-heading">
            <div className="x-home-panel-head flex-wrap gap-3">
              <div>
                <h2 id="revision-list-heading" className="x-section-heading">
                  Revisions of {selected.itemCode}
                </h2>
                <p>
                  Found from the part&rsquo;s current bill and from every bill a production order
                  pinned. A revision never built and no longer current cannot be listed.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setNonce((value) => value + 1)}
                disabled={loading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
                Re-read
              </button>
            </div>

            <div className="space-y-4 p-5">
              {error ? (
                <ErrorState error={error} onRetry={() => setNonce((value) => value + 1)} />
              ) : loading ? (
                <p className="text-[13px] text-[var(--text-secondary)]" role="status">
                  Reading each revision and asking whether it is still live…
                </p>
              ) : revisions.length === 0 ? (
                <Empty
                  title="No revision could be read"
                  body="This part has no current bill of material and no production order has pinned one. There is nothing to compare."
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="x-data-table min-w-[44rem]">
                      <thead>
                        <tr>
                          <th>Revision</th>
                          <th>State</th>
                          <th>Makes</th>
                          <th>Lines</th>
                          <th>Built by</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {revisions.map((revision) => (
                          <tr key={revision.bom.id}>
                            <td>
                              <strong>Version {revision.bom.version}</strong>
                              {revision.isCurrent ? (
                                <div className="mt-1">
                                  <StatusBadge tone="approved" label="Current" />
                                </div>
                              ) : null}
                            </td>
                            <td>
                              {revision.policy ? (
                                <StatusBadge
                                  status={revision.policy.status}
                                  tone={toneFor(revision.policy.status)}
                                />
                              ) : (
                                <span className="text-[var(--text-muted)]">Unknown</span>
                              )}
                              {revision.policy?.editable === false ? (
                                <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                                  Cannot be edited in place
                                </div>
                              ) : null}
                            </td>
                            <td>{fmtQty(revision.bom.outputQty, revision.bom.uom)}</td>
                            <td>{revision.bom.lines.length}</td>
                            <td>
                              {revision.builtBy.length === 0 ? (
                                <span className="text-[var(--text-muted)]">
                                  No production order
                                </span>
                              ) : (
                                <div className="flex flex-col gap-1">
                                  {revision.builtBy.map((order) => (
                                    <span key={order.id}>
                                      <strong>{order.orderNo}</strong> ·{" "}
                                      {fmtQty(order.qtyToProduce, order.uom)} ·{" "}
                                      {humanise(order.status)} · {date(order.createdAt)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="max-w-[24ch]">
                              {revision.bom.notes ? (
                                revision.bom.notes
                              ) : (
                                <span className="text-[var(--text-muted)]">None recorded</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-[11px] leading-[1.7] text-[var(--text-muted)]">
                    The <strong>Built by</strong> column is the answer to &ldquo;which revision was
                    in the unit we shipped&rdquo;. A production order fixes the bill it was
                    exploded from and an active bill cannot be edited in place, so the version
                    against an order is the version that was built — not the version that is
                    current now.
                    {unreadable > 0
                      ? ` ${unreadable} production order(s) point at a bill that could not be read; those revisions are missing from this table.`
                      : ""}
                    {production.hasMore
                      ? " Only the first 100 production orders were read, so an older build may pin a revision not listed here."
                      : ""}
                    {!canProduction
                      ? " Production orders are not visible to your role, so no built revision can be shown — only the current bill."
                      : ""}
                  </p>

                  <div className="x-notice">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <p>
                      No column here says <em>when</em> a revision was cut or <em>who</em> cut it,
                      because a bill of material carries neither over the API. The dates above are
                      the dates production orders were raised, which is the nearest real evidence
                      the system holds.
                    </p>
                  </div>
                </>
              )}
            </div>
          </section>

          {revisions.length > 1 ? (
            <section className="x-home-panel" aria-labelledby="revision-diff-heading">
              <div className="x-home-panel-head flex-wrap gap-3">
                <div>
                  <h2 id="revision-diff-heading" className="x-section-heading">
                    What changed
                  </h2>
                  <p>
                    Matched on the component part, compared per unit of output — so renumbering a
                    line or changing the batch size does not read as a change of recipe.
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <VersionPicker
                    label="From"
                    value={fromVersion}
                    revisions={revisions}
                    onChange={setFromVersion}
                  />
                  <VersionPicker
                    label="To"
                    value={toVersion}
                    revisions={revisions}
                    onChange={setToVersion}
                  />
                </div>
              </div>

              <div className="p-5">
                {!diff || !from || !to ? (
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    Choose two revisions to compare.
                  </p>
                ) : from.bom.version === to.bom.version ? (
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    Those are the same revision. Choose two different ones.
                  </p>
                ) : (
                  <>
                    <p className="mb-3 text-[13px] text-[var(--text-secondary)]">
                      {changedCount === 0 ? (
                        <>
                          Version {from.bom.version} and version {to.bom.version} consume exactly
                          the same components in the same quantities per unit. The versions differ
                          in something this comparison does not cover — the output quantity, the
                          unit, or the notes.
                        </>
                      ) : (
                        <>
                          <strong>
                            {changedCount} line
                            {changedCount === 1 ? "" : "s"} changed
                          </strong>{" "}
                          between version {from.bom.version} and version {to.bom.version}, out of{" "}
                          {diff.length} components across both.
                        </>
                      )}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="x-data-table min-w-[44rem]">
                        <thead>
                          <tr>
                            <th>Component</th>
                            <th>Change</th>
                            <th>Version {from.bom.version}</th>
                            <th>Version {to.bom.version}</th>
                            <th>Scrap allowance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diff.map((row) => (
                            <tr key={row.componentItemId}>
                              <td>
                                <strong>{row.componentCode}</strong>
                                <div className="text-[11px] text-[var(--text-muted)]">
                                  {row.componentName}
                                </div>
                              </td>
                              <td>
                                <StatusBadge
                                  tone={diffTone(row.kind)}
                                  label={diffKindLabel(row.kind)}
                                />
                              </td>
                              <td>
                                {row.fromQtyPer === null
                                  ? "Not on this revision"
                                  : `${num(row.fromQtyPer, 4)} ${row.uom} per unit`}
                              </td>
                              <td>
                                {row.toQtyPer === null
                                  ? "Not on this revision"
                                  : `${num(row.toQtyPer, 4)} ${row.uom} per unit`}
                              </td>
                              <td>
                                {row.fromScrapPct === null || row.toScrapPct === null
                                  ? "—"
                                  : `${num(row.fromScrapPct, 2)}% → ${num(row.toScrapPct, 2)}%`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-3 text-[11px] leading-[1.7] text-[var(--text-muted)]">
                      Version {from.bom.version} makes{" "}
                      {fmtQty(from.bom.outputQty, from.bom.uom)} per run; version {to.bom.version}{" "}
                      makes {fmtQty(to.bom.outputQty, to.bom.uom)}. Quantities above are divided by
                      those figures so the two are comparable. Additions and removals are coloured
                      the same: a revision that deletes a part is as much a change as one that adds
                      one, and colouring one of them reassuringly would make it skimmed.
                    </p>
                  </>
                )}
              </div>
            </section>
          ) : null}

          <ItemCorrections item={selected} />
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

function VersionPicker({
  label,
  value,
  revisions,
  onChange,
}: {
  label: string;
  value: number | null;
  revisions: readonly Revision[];
  onChange: (version: number) => void;
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-[var(--text-secondary)]">
      {label}
      <select
        aria-label={`${label} revision`}
        className="h-10 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-3 text-[var(--text-primary)]"
        value={value ?? ""}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {revisions.map((revision) => (
          <option key={revision.bom.id} value={revision.bom.version}>
            Version {revision.bom.version}
            {revision.isCurrent ? " (current)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Corrections to the ITEM MASTER — and a warning about what this list is not.
 *
 * `GET /engineering/items/:id/history` returns audit entries for the item RECORD: a rename,
 * a re-coded unit, a changed standard cost. It is NOT a bill-of-material history and does
 * not contain one. The two are easy to confuse — the screen is about revisions and the
 * panel is called history — so the distinction is stated rather than implied. Somebody
 * reading a rename as a recipe change would draw exactly the wrong conclusion.
 */
function ItemCorrections({ item }: { item: ItemRow }): React.JSX.Element {
  const { can } = useAccess();
  const history = useQuery<ItemHistoryResponse>(
    can("engineering.item.read") ? engChangeApi.itemHistoryPath(item.id) : null,
  );
  const entries = history.data?.entries ?? [];

  return (
    <section className="x-home-panel" aria-labelledby="item-history-heading">
      <div className="x-home-panel-head">
        <div>
          <h2 id="item-history-heading" className="x-section-heading">
            Corrections to the {item.itemCode} record
          </h2>
          <p>
            Changes to the item master itself — not to its bill of material. A rename or a
            re-costing appears here; a recipe change does not.
          </p>
        </div>
        <History className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
      </div>
      <div className="p-5">
        {history.error ? (
          <ErrorState error={history.error} onRetry={history.reload} />
        ) : history.loading ? (
          <p className="text-[13px] text-[var(--text-secondary)]" role="status">
            Reading the correction trail…
          </p>
        ) : entries.length === 0 ? (
          <p className="text-[13px] text-[var(--text-secondary)]">
            The {item.itemCode} record has never been corrected. Added {date(item.createdAt)}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="x-data-table min-w-[36rem]">
              <thead>
                <tr>
                  <th>When</th>
                  <th>What</th>
                  <th>Changed</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.seq}>
                    <td>{dateTime(entry.at)}</td>
                    <td>{humanise(entry.action.split(".").pop() ?? entry.action)}</td>
                    <td>
                      {entry.changeSet ? (
                        Object.entries(entry.changeSet).map(([field, change]) => (
                          <div key={field}>
                            <strong>{humanise(field)}</strong>: {String(change.before ?? "—")} →{" "}
                            {String(change.after ?? "—")}
                          </div>
                        ))
                      ) : (
                        <span className="text-[var(--text-muted)]">
                          No field-level detail recorded
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
