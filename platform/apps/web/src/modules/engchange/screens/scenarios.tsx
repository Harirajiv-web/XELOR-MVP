"use client";

import { useCallback, useMemo, useState } from "react";
import { Columns2, Info, ShieldCheck, TriangleAlert } from "lucide-react";
import { api } from "@spine/api/client";
import { useQuery } from "@spine/data/use-query";
import { Empty, ErrorState } from "@spine/states";
import { date, humanise, inr, num } from "@spine/format";
import { Can, useAccess } from "@spine/access/permissions";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge, toneFor } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import {
  engChangeApi,
  valueAtStandardCost,
  type ItemRow,
  type MrpRunHeader,
  type PlannedOrderRow,
  type ScheduleProposal,
  type ScheduledOperation,
  type StoredSchedule,
} from "../api";

/**
 * SCENARIOS — sequence the same plan two ways and compare what it costs in delivery.
 *
 * ============================================================================
 * WHAT THIS IS, IN THE WORDS THAT MUST NOT BE OVERSOLD
 * ============================================================================
 *
 * The scheduler behind this screen is a FINITE-CAPACITY HEURISTIC. It simulates a per-machine
 * timeline and picks the next operation by a stated priority rule — earliest due date,
 * shortest processing time, or critical ratio. That is all it is.
 *
 * IT IS NOT AN ADVANCED PLANNING SYSTEM AND IT DOES NOT OPTIMIZE. It does not search a
 * solution space, it does not find the best sequence, and there is no sense in which its
 * answer is optimal — a different rule can and does beat it on a different measure, which is
 * exactly why all three rules are shown side by side rather than one "recommended" one. The
 * word "optimal" appears nowhere on this screen, and it should not be added.
 *
 * IT DOES NOT FORECAST ANYTHING. No model is consulted here and none should be. A planning
 * rule that a person can explain beats a model trained on unreliable shop-floor history, and
 * a forecast that cannot state its horizon, its item mix, what was excluded from its training
 * data and how its error is measured is not a forecast — it is a number with a confident
 * font. Nothing on this screen predicts; everything on it is arithmetic over the last run.
 *
 * ============================================================================
 * "WITHOUT CHANGING THE PUBLISHED PLAN" — PRECISELY WHAT THAT MEANS
 * ============================================================================
 *
 * Proposing a scenario is a WRITE. `POST /planning/schedule/propose` inserts a `plan_schedule`
 * row with status `draft` plus one row per operation. It does NOT touch the published
 * schedule: publishing is a separate call, behind a separate permission, and it is the only
 * thing that makes a proposal the shop's dispatch list.
 *
 * So comparing two scenarios genuinely does not disturb what the plant is working to, and it
 * genuinely does write two draft rows. Those are different statements and the screen makes
 * both, because a user told "nothing is written" who then finds two draft schedules has been
 * misled about something small in a place where being misled matters.
 *
 * ============================================================================
 * DOUBLE ALLOCATION — WHAT IS CHECKED, AND WHAT IS NOT
 * ============================================================================
 *
 * A proposed plan must never allocate the same machine, tool or material twice. Of those
 * three, exactly one can be verified from what this API returns, and the screen says so
 * rather than implying all three were checked:
 *
 *   MACHINE   — CHECKED, here, in `overlaps()`. The board returns every operation with its
 *               work centre, start and end, so overlapping intervals on one work centre are
 *               findable by comparison. The answer is computed and shown, including when it
 *               is zero. A claim that is checked and reported beats a claim that is asserted.
 *
 *               One caveat that makes the board CONSERVATIVE rather than unsafe: it treats
 *               each work centre as a single machine, ignoring `plan_work_centre.machine_count`.
 *               A cell with three identical machines is scheduled as one, so the board is
 *               more pessimistic than the plant. Being wrong in that direction is the right
 *               way round for a schedule.
 *
 *   TOOL      — NOT CHECKED, AND NOT CHECKABLE. There is no tooling table anywhere in this
 *               schema — no fixtures, no dies, no gauges, no tool life. Two operations needing
 *               the same fixture at the same hour would both be scheduled and nothing here
 *               would notice. This is stated on the screen in those words.
 *
 *   MATERIAL  — NOT CHECKED. The scheduler takes each planned order's RELEASE DATE as the
 *               earliest an operation may start. That date comes from the lead-time
 *               arithmetic in MRP; it is an assumption that material will have arrived, not a
 *               reservation against stock and not a check of one. Two orders may therefore be
 *               scheduled to consume the same physical stock. Also stated on the screen.
 *
 * ============================================================================
 * PUBLISHING: EXPLICIT APPROVAL, AND A STALENESS CHECK BEFORE IT
 * ============================================================================
 *
 * Publishing decides what a plant works on tonight, so it needs both:
 *
 *   APPROVAL  — `planning.schedule.publish`, a separate permission from proposing, plus an
 *               acknowledgement on this screen that names the schedule being published. The
 *               API stamps the approver; a schedule that could publish itself would be a
 *               heuristic deciding a plant's evening.
 *
 *   FRESHNESS — two reads immediately before the write. The MRP run the proposal was built
 *               from is compared against the LATEST run, and the proposal itself is re-read
 *               to confirm it is still a draft rather than superseded by a later one.
 *               Publishing a schedule computed from a plan that has since been re-run is the
 *               quiet failure this check exists for: it succeeds, and the shop works to
 *               yesterday's requirements all week.
 */

/* -------------------------------------------------------------------------- */
/* Machine double-booking, checked rather than claimed                        */
/* -------------------------------------------------------------------------- */

interface Overlap {
  workCentreCode: string;
  a: ScheduledOperation;
  b: ScheduledOperation;
}

/** A point on the board, as a comparable pair. Dates are ISO so they compare as strings. */
function before(aDate: string, aHour: number, bDate: string, bHour: number): boolean {
  if (aDate !== bDate) return aDate < bDate;
  return aHour < bHour;
}

/**
 * Every pair of operations that occupies the same work centre at the same time.
 *
 * Two intervals overlap when each starts before the other ends. Compared on (date, hour)
 * rather than on a converted hour count, because converting would need the plant calendar —
 * which this screen does not have and should not guess at. The board already resolved the
 * calendar when it produced these dates.
 *
 * Expected to be empty. It is shown WHEN it is empty, because "we checked and found none" is
 * a different and much more useful statement than silence.
 */
function overlaps(operations: readonly ScheduledOperation[]): readonly Overlap[] {
  const byCentre = new Map<string, ScheduledOperation[]>();
  for (const op of operations) {
    const list = byCentre.get(op.workCentreId);
    if (list) list.push(op);
    else byCentre.set(op.workCentreId, [op]);
  }
  const found: Overlap[] = [];
  for (const list of byCentre.values()) {
    const sorted = [...list].sort(
      (x, y) => x.startDate.localeCompare(y.startDate) || x.startHourOfDay - y.startHourOfDay,
    );
    for (let i = 0; i < sorted.length; i += 1) {
      const a = sorted[i];
      if (!a) continue;
      for (let j = i + 1; j < sorted.length; j += 1) {
        const b = sorted[j];
        if (!b) continue;
        // Sorted by start, so once b starts at or after a ends, nothing later can overlap a.
        if (!before(b.startDate, b.startHourOfDay, a.endDate, a.endHourOfDay)) break;
        if (before(a.startDate, a.startHourOfDay, b.endDate, b.endHourOfDay)) {
          found.push({ workCentreCode: a.workCentreCode, a, b });
        }
      }
    }
  }
  return found;
}

/**
 * Orders the board reports on but never actually placed an operation for.
 *
 * The scheduler has a structural safety net that stops the placement loop rather than
 * spinning, and an order caught by it appears in the per-order summary with no operations
 * behind it. That produces a board which looks complete and is not — the single failure mode
 * of a schedule that matters most, so it is looked for explicitly.
 */
function ordersWithNoOperation(proposal: ScheduleProposal): readonly string[] {
  const placed = new Set(proposal.operations.map((op) => op.orderRef));
  return proposal.orders.filter((order) => !placed.has(order.orderRef)).map((o) => o.orderRef);
}

/* -------------------------------------------------------------------------- */
/* Scenario state                                                             */
/* -------------------------------------------------------------------------- */

type Rule = "EDD" | "SPT" | "CR";

const RULES: ReadonlyArray<{ rule: Rule; label: string; good: string }> = [
  { rule: "EDD", label: "Earliest due date", good: "Keeps promises. The default." },
  { rule: "SPT", label: "Shortest processing time", good: "Clears the queue fastest." },
  { rule: "CR", label: "Critical ratio", good: "Balances time left against work left." },
];

interface Slot {
  rule: Rule;
  hoursPerDay: number;
  proposal: ScheduleProposal | null;
  busy: boolean;
  error: unknown;
}

const EMPTY_SLOT: Slot = { rule: "EDD", hoursPerDay: 8, proposal: null, busy: false, error: null };

type PublishState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "blocked"; reason: string }
  | { kind: "publishing" }
  | { kind: "done"; message: string }
  | { kind: "failed"; error: unknown };

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

export default function ScenariosScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const canPropose = can("planning.schedule.manage");

  const run = useQuery<MrpRunHeader | null>(
    can("planning.mrp.read") ? engChangeApi.latestRunPath : null,
  );

  const [slotA, setSlotA] = useState<Slot>({ ...EMPTY_SLOT, rule: "EDD" });
  const [slotB, setSlotB] = useState<Slot>({ ...EMPTY_SLOT, rule: "SPT" });

  /**
   * Build one scenario.
   *
   * No idempotency key is passed, and that is correct rather than an omission: `propose` does
   * not require one, and each press is meant to produce a NEW draft. Replaying the previous
   * proposal on a second press would silently show a board built from an older run.
   */
  const propose = useCallback(
    async (slot: Slot, set: (next: Slot) => void): Promise<void> => {
      set({ ...slot, busy: true, error: null });
      try {
        const proposal = await api.post<ScheduleProposal>(engChangeApi.scheduleProposePath, {
          rule: slot.rule,
          hoursPerDay: slot.hoursPerDay,
        });
        set({ ...slot, proposal, busy: false, error: null });
      } catch (failure) {
        set({ ...slot, proposal: null, busy: false, error: failure });
      }
    },
    [],
  );

  const a = slotA.proposal;
  const b = slotB.proposal;
  const bothBuilt = a !== null && b !== null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Scenarios"
        subtitle="Sequence the same planning run two ways and compare the delivery consequences side by side. The published dispatch list is untouched until somebody publishes deliberately."
      />

      <div className="x-notice">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <p>
            <strong>This is a finite-capacity heuristic, not an optimizer.</strong> It simulates a
            per-machine timeline and picks the next operation by the rule you choose. It does not
            search for the best schedule and there is no sense in which its answer is optimal — a
            different rule wins on a different measure, which is why both are shown rather than one
            being recommended.
          </p>
          <p className="mt-1.5">
            Nothing here is forecast and no model is consulted. Every figure is arithmetic over the
            planned orders the last MRP run produced.
          </p>
        </div>
      </div>

      <RunHeader run={run.data ?? null} loading={run.loading} error={run.error} onRetry={run.reload} />

      {!canPropose ? (
        <div className="x-notice" data-tone="warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Building a scenario needs{" "}
            <code className="font-[var(--font-mono)] text-[12px]">planning.schedule.manage</code>,
            which your role does not hold. You can read a published schedule but not propose one.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ScenarioCard
            title="Scenario A"
            slot={slotA}
            onChange={setSlotA}
            onPropose={() => void propose(slotA, setSlotA)}
          />
          <ScenarioCard
            title="Scenario B"
            slot={slotB}
            onChange={setSlotB}
            onPropose={() => void propose(slotB, setSlotB)}
          />
        </div>
      )}

      {bothBuilt && a && b ? (
        <>
          <Comparison a={a} b={b} />
          <DoubleAllocation a={a} b={b} />
          <MaterialAndCost runNo={a.runNo} sameRun={a.runNo === b.runNo} />
          <PublishPanel proposals={[a, b]} />
        </>
      ) : canPropose ? (
        <Empty
          title="Build both scenarios to compare them"
          body="Each one sequences the same planning run by a different priority rule. Nothing the shop is working to changes until a proposal is published."
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The run this is all computed from                                          */
/* -------------------------------------------------------------------------- */

function RunHeader({
  run,
  loading,
  error,
  onRetry,
}: {
  run: MrpRunHeader | null;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}): React.JSX.Element {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading) {
    return (
      <p className="text-[13px] text-[var(--text-secondary)]" role="status">
        Reading the last planning run…
      </p>
    );
  }
  if (!run) {
    return (
      <div className="x-notice" data-tone="warning">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          MRP has never been run, or you cannot read it. A scenario sequences the planned orders a
          run produced, so there is nothing to sequence until one exists.
        </p>
      </div>
    );
  }
  return (
    <section className="x-home-panel">
      <div className="x-home-panel-head flex-wrap gap-3">
        <div>
          <h2 className="x-section-heading">Both scenarios sequence run {run.runNo}</h2>
          <p>
            Worked out as of {date(run.planningDate)} · {run.horizonBuckets} weeks from{" "}
            {run.firstBucket} to {run.lastBucket} · {run.plannedOrderCount} planned orders ·{" "}
            {run.exceptionCount} exceptions
          </p>
        </div>
        <StatusBadge status={run.status} tone={toneFor(run.status)} />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* One scenario                                                               */
/* -------------------------------------------------------------------------- */

function ScenarioCard({
  title,
  slot,
  onChange,
  onPropose,
}: {
  title: string;
  slot: Slot;
  onChange: (next: Slot) => void;
  onPropose: () => void;
}): React.JSX.Element {
  const meta = RULES.find((entry) => entry.rule === slot.rule);
  return (
    <section className="x-home-panel">
      <div className="x-home-panel-head">
        <div>
          <h2 className="x-section-heading">{title}</h2>
          <p>{slot.proposal ? `Draft ${slot.proposal.scheduleNo}` : "Not built yet"}</p>
        </div>
        <Columns2 className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
      </div>
      <div className="space-y-3 p-5">
        <div className="x-form-grid">
          <label className="x-field">
            Priority rule
            <select
              aria-label={`${title} priority rule`}
              value={slot.rule}
              onChange={(event) => onChange({ ...slot, rule: event.target.value as Rule })}
            >
              {RULES.map((entry) => (
                <option key={entry.rule} value={entry.rule}>
                  {entry.label}
                </option>
              ))}
            </select>
            <small>{meta?.good}</small>
          </label>
          <label className="x-field">
            Productive hours per day
            <input
              type="number"
              min={1}
              max={24}
              value={slot.hoursPerDay}
              aria-label={`${title} productive hours per day`}
              onChange={(event) =>
                onChange({ ...slot, hoursPerDay: Number(event.target.value) || 8 })
              }
            />
            <small>
              What a work centre actually offers, not what the shift is. Break, changeover and
              cleaning time are not in this figure anywhere else, so they come out here.
            </small>
          </label>
        </div>

        <button type="button" className="btn btn-pri btn-sm" onClick={onPropose} disabled={slot.busy}>
          {slot.busy ? "Sequencing…" : slot.proposal ? "Rebuild this scenario" : "Build this scenario"}
        </button>

        {slot.error ? <ErrorState error={slot.error} /> : null}

        {slot.proposal ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniStat label="Orders late" value={String(slot.proposal.lateOrderCount)} />
              <MiniStat label="Total days late" value={num(slot.proposal.totalTardinessDays, 0)} />
              <MiniStat label="Days to finish all" value={num(slot.proposal.makespanDays, 0)} />
            </div>
            <p className="text-[11px] leading-[1.7] text-[var(--text-muted)]">
              {slot.proposal.note}
            </p>
            {slot.proposal.warning ? (
              <div className="x-notice" data-tone="warning">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>{slot.proposal.warning}</p>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Side by side                                                               */
/* -------------------------------------------------------------------------- */

function Comparison({ a, b }: { a: ScheduleProposal; b: ScheduleProposal }): React.JSX.Element {
  // Per-order delivery, joined on the planned order key. An order in one board and not the
  // other is shown rather than dropped: that difference is itself the finding.
  const orders = useMemo(() => {
    const keys = [...new Set([...a.orders.map((o) => o.orderRef), ...b.orders.map((o) => o.orderRef)])];
    return keys
      .map((key) => ({
        key,
        a: a.orders.find((o) => o.orderRef === key),
        b: b.orders.find((o) => o.orderRef === key),
      }))
      .sort((x, y) => {
        const dx = (x.b?.daysLate ?? 0) - (x.a?.daysLate ?? 0);
        const dy = (y.b?.daysLate ?? 0) - (y.a?.daysLate ?? 0);
        return Math.abs(dy) - Math.abs(dx) || x.key.localeCompare(y.key);
      });
  }, [a, b]);

  const movedCount = orders.filter(
    (row) => (row.a?.finishDate ?? "") !== (row.b?.finishDate ?? ""),
  ).length;

  return (
    <section className="x-home-panel">
      <div className="x-home-panel-head">
        <div>
          <h2 className="x-section-heading">Delivery, side by side</h2>
          <p>
            The same planned orders, sequenced two ways. Orders whose finish date moved most are
            listed first.
          </p>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <div className="overflow-x-auto">
          <table className="x-data-table min-w-[40rem]">
            <thead>
              <tr>
                <th>Measure</th>
                <th>A · {a.rule}</th>
                <th>B · {b.rule}</th>
                <th>Difference</th>
              </tr>
            </thead>
            <tbody>
              <MeasureRow
                label="Orders that miss their date"
                a={a.lateOrderCount}
                b={b.lateOrderCount}
              />
              <MeasureRow
                label="Total days late, added up"
                a={a.totalTardinessDays}
                b={b.totalTardinessDays}
              />
              <MeasureRow label="Days to finish everything" a={a.makespanDays} b={b.makespanDays} />
              <MeasureRow label="Operations on the board" a={a.operationCount} b={b.operationCount} />
              <tr>
                <td>Parts missing a routing</td>
                <td>{a.itemsWithoutRouting.length}</td>
                <td>{b.itemsWithoutRouting.length}</td>
                <td>
                  {a.itemsWithoutRouting.length === 0 && b.itemsWithoutRouting.length === 0
                    ? "None — both boards are complete"
                    : "Both boards are optimistic by the same missing work"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-[12px] text-[var(--text-secondary)]">
          {movedCount === 0
            ? "No order finishes on a different date between the two. The rule made no difference to delivery on this plan."
            : `${movedCount} order(s) finish on a different date depending on the rule.`}
        </p>

        {orders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="x-data-table min-w-[44rem]">
              <thead>
                <tr>
                  <th>Planned order</th>
                  <th>Part</th>
                  <th>Wanted by</th>
                  <th>Finishes · A</th>
                  <th>Finishes · B</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((row) => {
                  const lateA = row.a?.daysLate ?? null;
                  const lateB = row.b?.daysLate ?? null;
                  return (
                    <tr key={row.key}>
                      <td>
                        <strong>{row.key}</strong>
                      </td>
                      <td>{row.a?.itemCode ?? row.b?.itemCode ?? "—"}</td>
                      <td>{row.a?.dueDate ? date(row.a.dueDate) : row.b?.dueDate ? date(row.b.dueDate) : "—"}</td>
                      <td>
                        {row.a ? date(row.a.finishDate) : "Not on this board"}
                        {lateA !== null && lateA > 0 ? (
                          <div className="text-[11px] text-[var(--bad-ink)]">{lateA} day(s) late</div>
                        ) : null}
                      </td>
                      <td>
                        {row.b ? date(row.b.finishDate) : "Not on this board"}
                        {lateB !== null && lateB > 0 ? (
                          <div className="text-[11px] text-[var(--bad-ink)]">{lateB} day(s) late</div>
                        ) : null}
                      </td>
                      <td>
                        {lateA === null || lateB === null ? (
                          <StatusBadge tone="unknown" label="Not comparable" />
                        ) : lateA === lateB ? (
                          <StatusBadge tone="unknown" label="No change" />
                        ) : lateB < lateA ? (
                          <StatusBadge tone="approved" label={`B better by ${lateA - lateB}d`} />
                        ) : (
                          <StatusBadge tone="pending" label={`A better by ${lateB - lateA}d`} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {/*
          The server costs all three rules against the same operations in one pass. Shown
          because a rule is not better in the abstract — it is better at something — and a
          planner choosing between two should be able to see the third they did not pick.
        */}
        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">
            All three rules, costed by the server on scenario A&rsquo;s operations
          </h3>
          <div className="overflow-x-auto">
            <table className="x-data-table min-w-[32rem]">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Orders late</th>
                  <th>Total days late</th>
                  <th>Days to finish</th>
                </tr>
              </thead>
              <tbody>
                {a.ruleComparison.map((row) => (
                  <tr key={row.rule}>
                    <td>
                      <strong>{row.rule}</strong>{" "}
                      <span className="text-[var(--text-muted)]">
                        {RULES.find((entry) => entry.rule === row.rule)?.label ?? ""}
                      </span>
                    </td>
                    <td>{row.lateOrderCount}</td>
                    <td>{num(row.totalTardinessDays, 0)}</td>
                    <td>{num(row.makespanDays, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function MeasureRow({
  label,
  a,
  b,
}: {
  label: string;
  a: number | string;
  b: number | string;
}): React.JSX.Element {
  const na = Number(a);
  const nb = Number(b);
  const comparable = Number.isFinite(na) && Number.isFinite(nb);
  const delta = comparable ? nb - na : null;
  return (
    <tr>
      <td>{label}</td>
      <td>{num(na, 0)}</td>
      <td>{num(nb, 0)}</td>
      <td>
        {delta === null ? (
          "—"
        ) : delta === 0 ? (
          <span className="text-[var(--text-muted)]">No difference</span>
        ) : delta < 0 ? (
          <StatusBadge tone="approved" label={`B lower by ${num(Math.abs(delta), 0)}`} />
        ) : (
          <StatusBadge tone="pending" label={`B higher by ${num(delta, 0)}`} />
        )}
      </td>
    </tr>
  );
}

function MiniStat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="x-stat-card">
      <span className="x-stat-top">{label}</span>
      <strong className="x-stat-value">{value}</strong>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Double allocation                                                          */
/* -------------------------------------------------------------------------- */

function DoubleAllocation({ a, b }: { a: ScheduleProposal; b: ScheduleProposal }): React.JSX.Element {
  const clashA = useMemo(() => overlaps(a.operations), [a]);
  const clashB = useMemo(() => overlaps(b.operations), [b]);
  const orphanA = useMemo(() => ordersWithNoOperation(a), [a]);
  const orphanB = useMemo(() => ordersWithNoOperation(b), [b]);
  const clashes = [...clashA, ...clashB];
  const orphans = [...orphanA, ...orphanB];

  return (
    <section className="x-home-panel">
      <div className="x-home-panel-head">
        <div>
          <h2 className="x-section-heading">Is anything allocated twice?</h2>
          <p>One of the three answers is computed. The other two cannot be, and are not guessed.</p>
        </div>
        <ShieldCheck className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
      </div>
      <div className="space-y-4 p-5">
        <div className="overflow-x-auto">
          <table className="x-data-table min-w-[40rem]">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Checked?</th>
                <th>What was found</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Machine time</strong>
                </td>
                <td>
                  <StatusBadge tone="approved" label="Checked here" />
                </td>
                <td>
                  {clashes.length === 0 ? (
                    <>
                      No work centre is occupied by two operations at once, across{" "}
                      {a.operations.length + b.operations.length} operations in both boards. Every
                      pair of operations sharing a work centre was compared.
                    </>
                  ) : (
                    <>
                      <strong>{clashes.length} overlapping pair(s) found.</strong> This should not
                      happen — the board serialises each work centre — so treat it as a defect in
                      the schedule rather than a scheduling decision.
                      <ul className="mt-2 list-disc pl-4">
                        {clashes.slice(0, 5).map((clash) => (
                          <li key={`${clash.a.orderRef}#${clash.a.seq}-${clash.b.orderRef}#${clash.b.seq}`}>
                            {clash.workCentreCode}: {clash.a.orderRef} op {clash.a.seq} and{" "}
                            {clash.b.orderRef} op {clash.b.seq}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Tooling</strong>
                </td>
                <td>
                  <StatusBadge tone="unknown" label="Not checkable" />
                </td>
                <td>
                  There is no tooling anywhere in this system — no fixtures, no dies, no gauges, no
                  tool life. Two operations needing the same fixture in the same hour would both be
                  scheduled and nothing would notice. <strong>Do not read this board as
                  tool-feasible.</strong>
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Material</strong>
                </td>
                <td>
                  <StatusBadge tone="unknown" label="Not checked" />
                </td>
                <td>
                  The board takes each planned order&rsquo;s release date as the earliest its work
                  may start. That date is lead-time arithmetic from MRP — an assumption that
                  material will have arrived, not a reservation against stock and not a check of
                  one. Two orders may be sequenced to consume the same physical stock.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {orphans.length > 0 ? (
          <div className="x-notice" data-tone="error">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              {orphans.length} order(s) are summarised on a board with no operation actually placed
              for them: {orphans.slice(0, 6).join(", ")}
              {orphans.length > 6 ? ", and more" : ""}. That board is reporting a finish date for
              work it never scheduled. Do not publish it.
            </p>
          </div>
        ) : null}

        <p className="text-[11px] leading-[1.7] text-[var(--text-muted)]">
          The machine check treats each work centre as ONE machine, because the board does — a cell
          with three identical machines is scheduled as one and the board comes out more
          pessimistic than the plant. That is the right direction for a schedule to be wrong in,
          but it means the dates here are conservative, not tight.
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Material and cost                                                          */
/* -------------------------------------------------------------------------- */

/**
 * What the two scenarios cost in material — and the honest answer is: the same.
 *
 * Both boards sequence the SAME planned orders from the SAME run. A priority rule changes the
 * order work is done in; it does not change what is bought or made. So the material bill and
 * its value are identical between the scenarios, and the screen says that outright instead of
 * printing two identical columns and letting somebody infer a difference from rounding.
 *
 * The valuation is indicative and labelled as such. It multiplies planned quantity by the
 * item master's standard cost, which is a standard cost and not a price: no supplier quote,
 * no freight, no duty, no exchange rate, and no currency conversion. Items the loaded page
 * does not cover, or that carry no standard cost, are COUNTED and the count is shown — a
 * total silently missing its uncosted half is worse than no total.
 */
function MaterialAndCost({ runNo, sameRun }: { runNo: string; sameRun: boolean }): React.JSX.Element {
  const { can } = useAccess();
  const planned = useQuery<{ data?: PlannedOrderRow[] }>(
    can("planning.mrp.read") ? engChangeApi.plannedOrdersPath : null,
    { query: { runNo } },
  );
  const items = useQuery<{ items?: ItemRow[]; nextCursor?: string | null }>(
    can("engineering.item.read") ? engChangeApi.itemsPath : null,
    { query: { limit: 100 } },
  );

  const costByCode = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const item of items.data?.items ?? []) map.set(item.itemCode, item.standardCost);
    return map;
  }, [items.data]);

  const rows = (planned.data?.data ?? []).filter((row) => row.status !== "cancelled");
  const buy = rows.filter((row) => row.sourceType === "buy");
  const make = rows.filter((row) => row.sourceType === "make");

  let valued = 0;
  let uncosted = 0;
  let total = 0;
  for (const row of rows) {
    const cost = costByCode.has(row.itemCode) ? (costByCode.get(row.itemCode) ?? null) : null;
    const value = valueAtStandardCost(row.qty, cost);
    if (value === null) uncosted += 1;
    else {
      total += value;
      valued += 1;
    }
  }

  return (
    <section className="x-home-panel">
      <div className="x-home-panel-head">
        <div>
          <h2 className="x-section-heading">Material and cost</h2>
          <p>What the plan buys and makes. Identical in both scenarios, and here is why.</p>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <div className="x-notice">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            {sameRun ? (
              <>
                Both scenarios sequence the same planned orders from run {runNo}. A priority rule
                changes the order work is done in — it does not change what is bought or made, so
                the material below and its value are the SAME under either scenario. The difference
                between them is entirely in delivery.
              </>
            ) : (
              <>
                The two scenarios were built from different planning runs, so the material below
                belongs to run {runNo} only and the comparison above is not like for like. Rebuild
                both scenarios before drawing a conclusion.
              </>
            )}
          </p>
        </div>

        {planned.error ? (
          <ErrorState error={planned.error} onRetry={planned.reload} />
        ) : planned.loading ? (
          <p className="text-[13px] text-[var(--text-secondary)]" role="status">
            Reading the planned orders behind this run…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-[var(--text-secondary)]">
            Run {runNo} produced no live planned orders.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniStat label="To buy" value={String(buy.length)} />
              <MiniStat label="To make" value={String(make.length)} />
              <MiniStat
                label="Indicative value"
                value={uncosted === rows.length ? "Not valuable" : inr(total)}
              />
            </div>
            <p className="text-[11px] leading-[1.7] text-[var(--text-muted)]">
              Valued {valued} of {rows.length} planned order line(s) at the item master&rsquo;s
              standard cost.{" "}
              {uncosted > 0
                ? `${uncosted} line(s) are EXCLUDED because the part carries no standard cost or was not in the first hundred items read — the total above is short by whatever those are worth.`
                : "Every line had a standard cost."}{" "}
              {items.data?.nextCursor
                ? "More items exist than were read, so a part beyond the first hundred is excluded even if it is costed."
                : ""}{" "}
              A standard cost is not a price: no quote, no freight, no duty. Do not put this figure
              in a purchase decision.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Publishing                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Publishing a proposal, with the two things that make it safe.
 *
 * FIRST, EXPLICIT APPROVAL. `planning.schedule.publish` is a different permission from the
 * one that builds a proposal, and this screen adds an acknowledgement that NAMES the schedule
 * being published. A single button that turns a comparison into tonight's dispatch list is
 * one mis-click from a plant working to the wrong board.
 *
 * SECOND, A STALENESS CHECK IMMEDIATELY BEFORE THE WRITE — not on load, because a screen open
 * for twenty minutes is exactly the one this protects against. Two reads:
 *
 *   - the LATEST MRP run, compared against the run the proposal was built from. If MRP has
 *     re-run since, the proposal sequences requirements that no longer hold. Publishing it
 *     succeeds and is wrong, which is the failure that costs a week.
 *   - the proposal itself, to confirm it is still `draft`. A later proposal supersedes an
 *     earlier one and the API answers 409; asking first turns a stack trace into a sentence.
 */
function PublishPanel({ proposals }: { proposals: readonly ScheduleProposal[] }): React.JSX.Element {
  const [chosen, setChosen] = useState<string>(proposals[0]?.scheduleNo ?? "");
  const [acknowledged, setAcknowledged] = useState(false);
  const [state, setState] = useState<PublishState>({ kind: "idle" });

  const proposal = proposals.find((entry) => entry.scheduleNo === chosen) ?? proposals[0];

  const publish = useCallback(async (): Promise<void> => {
    if (!proposal) return;
    setState({ kind: "checking" });
    try {
      const latest = await api.get<MrpRunHeader | null>(engChangeApi.latestRunPath);
      if (latest && latest.runNo !== proposal.runNo) {
        setState({
          kind: "blocked",
          reason: `${proposal.scheduleNo} was sequenced from run ${proposal.runNo}, but the latest planning run is now ${latest.runNo}. The requirements underneath this proposal have changed. Rebuild the scenarios before publishing.`,
        });
        return;
      }
      const stored = await api.get<StoredSchedule>(engChangeApi.schedulePath(proposal.scheduleNo));
      if (stored.status === "superseded") {
        setState({
          kind: "blocked",
          reason: `${proposal.scheduleNo} has been superseded by a later proposal and can no longer be published. Build the scenario again.`,
        });
        return;
      }
      if (stored.status === "published") {
        setState({
          kind: "blocked",
          reason: `${proposal.scheduleNo} is already the shop's dispatch list — approved by ${stored.approvedBy ?? "an approver"}${stored.approvedAt ? ` on ${date(stored.approvedAt)}` : ""}. There is nothing to publish.`,
        });
        return;
      }

      setState({ kind: "publishing" });
      const result = await api.post<{ scheduleNo: string; message?: string }>(
        engChangeApi.schedulePublishPath(proposal.scheduleNo),
      );
      setState({
        kind: "done",
        message:
          result.message ??
          `${result.scheduleNo} is now the shop's dispatch list. Any earlier published schedule has been superseded.`,
      });
      setAcknowledged(false);
    } catch (failure) {
      setState({ kind: "failed", error: failure });
    }
  }, [proposal]);

  return (
    <section className="x-home-panel">
      <div className="x-home-panel-head">
        <div>
          <h2 className="x-section-heading">Publish one of these</h2>
          <p>
            Publishing replaces what the shop floor is working to. Until then both proposals are
            drafts and the plant has not noticed either.
          </p>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <div className="x-notice">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Building a scenario DID write something: each proposal is a draft schedule row with its
            operations. What it did not do is change the published dispatch list, which only the
            button below does. Two different statements, both true.
          </p>
        </div>

        <Can
          permission="planning.schedule.publish"
          fallback={
            <p className="text-[13px] text-[var(--text-secondary)]">
              Publishing needs{" "}
              <code className="font-[var(--font-mono)] text-[12px]">
                planning.schedule.publish
              </code>
              , which your role does not hold. Take the comparison above to whoever does — the
              schedule numbers are {proposals.map((entry) => entry.scheduleNo).join(" and ")}.
            </p>
          }
        >
          <div className="x-form-grid">
            <label className="x-field">
              Which proposal
              <select
                aria-label="Proposal to publish"
                value={proposal?.scheduleNo ?? ""}
                onChange={(event) => {
                  setChosen(event.target.value);
                  setAcknowledged(false);
                  setState({ kind: "idle" });
                }}
              >
                {proposals.map((entry) => (
                  <option key={entry.scheduleNo} value={entry.scheduleNo}>
                    {entry.scheduleNo} · {entry.rule} · {entry.lateOrderCount} late
                  </option>
                ))}
              </select>
              <small>Both were sequenced from run {proposal?.runNo ?? "—"}.</small>
            </label>
          </div>

          <label className="flex items-start gap-2 text-[12px] leading-[1.7] text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              I am approving <strong>{proposal?.scheduleNo ?? "this proposal"}</strong> as the shop
              floor&rsquo;s dispatch list. I understand it is a heuristic sequence, that tooling and
              material availability were not checked, and that publishing supersedes the schedule
              currently in force.
            </span>
          </label>

          <button
            type="button"
            className="btn btn-pri btn-sm"
            disabled={
              !acknowledged || state.kind === "checking" || state.kind === "publishing" || !proposal
            }
            onClick={() => void publish()}
          >
            {state.kind === "checking"
              ? "Checking the plan has not moved…"
              : state.kind === "publishing"
                ? "Publishing…"
                : `Publish ${proposal?.scheduleNo ?? ""}`}
          </button>

          {state.kind === "blocked" ? (
            <div className="x-notice" data-tone="warning">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{state.reason}</p>
            </div>
          ) : null}
          {state.kind === "failed" ? <ErrorState error={state.error} /> : null}
          {state.kind === "done" ? (
            <div className="x-notice">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{state.message}</p>
            </div>
          ) : null}
        </Can>

        <p className="text-[11px] leading-[1.7] text-[var(--text-muted)]">
          Before the write, two reads: the latest MRP run is compared against the run this proposal
          was sequenced from, and the proposal is re-read to confirm it is still a draft. Both are
          done at the moment of publishing rather than when the screen loaded — a screen open for
          twenty minutes is precisely the one this protects against. Statuses are shown as{" "}
          {humanise("draft")}, {humanise("published")} or {humanise("superseded")}, which are the
          API&rsquo;s own words for them.
        </p>
      </div>
    </section>
  );
}
