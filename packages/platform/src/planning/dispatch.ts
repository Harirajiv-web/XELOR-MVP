import { isWorkingDay, type PlanCalendar, DEFAULT_PLAN_CALENDAR } from "./calendar.js";
import { addDays, daysBetween } from "../time/date.js";

/**
 * TIER-1 FINITE SCHEDULING (PLANNING §11.7, MVP scope).
 *
 * MRP says what to make and roughly when. It does not say which machine, in what order, or
 * whether the week's work physically fits. This is the simulation that answers that: a
 * list scheduler that walks a per-machine timeline and, at every decision point, picks the
 * next operation by a stated priority rule.
 *
 * It is deliberately a HEURISTIC, and deliberately labelled as one. The full constraint
 * solver is Phase 3 (§18). What ships here is the thing planners actually recognise —
 * "schedule by earliest due date and show me what slips" — computed exactly, in a way that
 * can be argued with:
 *
 *  - **EDD** (earliest due date): the default, and the rule that minimises maximum lateness
 *    on a single machine. What a planner does by hand on a whiteboard.
 *  - **SPT** (shortest processing time): minimises average flow time. Clears the queue
 *    fastest, and starves the big jobs — visible here rather than argued about.
 *  - **CR** (critical ratio): time remaining ÷ work remaining. Below 1.0 an order cannot
 *    make its date even if nothing else is in its way.
 *
 * The schedule is a PROPOSAL. Nothing here publishes: the output is compared against the
 * current plan and a human approves it (§11.7 — "never auto-publishes").
 */

export type DispatchRule = "EDD" | "SPT" | "CR";

export interface SchedulableOp {
  /** The order this operation belongs to — work order or planned order. */
  orderRef: string;
  itemCode: string;
  /** Position within the order. Operation 20 cannot start before operation 10 finishes. */
  seq: number;
  workCentreId: string;
  workCentreCode: string;
  /** Setup plus run, in hours. */
  hours: number;
  /** When the order must be complete. */
  dueDate: string;
  /** Material availability — the operation cannot start before this. */
  earliestStart?: string;
  /** Locked operations are already committed and are scheduled where they sit. */
  locked?: boolean;
  lockedStart?: string;
}

export interface ScheduleOptions {
  rule?: DispatchRule;
  today: string;
  /** Productive hours a work centre offers per working day. */
  hoursPerDay?: number;
  calendar?: PlanCalendar;
}

export interface ScheduledOp extends SchedulableOp {
  startDate: string;
  endDate: string;
  /** Hours into `startDate` that the operation begins. */
  startHourOfDay: number;
  endHourOfDay: number;
  /** Working days late against the order due date; 0 when on time. */
  daysLate: number;
}

export interface ScheduleResult {
  rule: DispatchRule;
  operations: ScheduledOp[];
  /** Per order: the finish date of its last operation, and whether it makes its date. */
  orders: { orderRef: string; itemCode: string; dueDate: string; finishDate: string; daysLate: number; onTime: boolean }[];
  makespanDays: number;
  totalTardinessDays: number;
  lateOrderCount: number;
  note: string;
}

/** Convert a working-hour offset from `fromDate` into a calendar date + hour-of-day. */
function hoursToPoint(fromDate: string, hourOffset: number, hoursPerDay: number, cal: PlanCalendar): { date: string; hour: number } {
  let remaining = hourOffset;
  let cursor = fromDate;
  // Land on a working day before consuming anything.
  let guard = 0;
  while (!isWorkingDay(cursor, cal)) {
    cursor = addDays(cursor, 1);
    if ((guard += 1) > 1461) throw new Error("planning calendar has no working days");
  }
  while (remaining >= hoursPerDay) {
    remaining -= hoursPerDay;
    do {
      cursor = addDays(cursor, 1);
      if ((guard += 1) > 100_000) throw new Error("scheduling horizon exceeded");
    } while (!isWorkingDay(cursor, cal));
  }
  return { date: cursor, hour: round2(remaining) };
}

/** Working-hour distance from `fromDate` to a point, so timelines can be compared. */
function pointToHours(fromDate: string, date: string, hour: number, hoursPerDay: number, cal: PlanCalendar): number {
  if (date < fromDate) return 0;
  let days = 0;
  for (let d = fromDate; d < date; d = addDays(d, 1)) if (isWorkingDay(d, cal)) days += 1;
  return days * hoursPerDay + hour;
}

export function scheduleOperations(ops: readonly SchedulableOp[], opts: ScheduleOptions): ScheduleResult {
  const rule = opts.rule ?? "EDD";
  const cal = opts.calendar ?? DEFAULT_PLAN_CALENDAR;
  const hoursPerDay = opts.hoursPerDay ?? 8;
  const datum = opts.today;

  // Remaining work per order drives the critical ratio, so it is computed before anything
  // is scheduled — CR compares time left against work left, not against this operation.
  const remainingByOrder = new Map<string, number>();
  for (const o of ops) remainingByOrder.set(o.orderRef, round2((remainingByOrder.get(o.orderRef) ?? 0) + o.hours));

  const pending = [...ops].sort((a, b) => a.orderRef.localeCompare(b.orderRef) || a.seq - b.seq);
  const centreFree = new Map<string, number>(); // work centre -> hours from datum
  const orderFree = new Map<string, number>(); // order -> hours from datum (precedence)
  const done: ScheduledOp[] = [];
  const scheduled = new Set<string>();
  const opKey = (o: SchedulableOp) => `${o.orderRef}#${o.seq}`;

  // Locked operations are facts: place them first so everything else schedules around them.
  for (const o of pending.filter((x) => x.locked && x.lockedStart)) {
    const startHours = pointToHours(datum, o.lockedStart!, 0, hoursPerDay, cal);
    place(o, startHours);
  }

  let guard = 0;
  while (scheduled.size < pending.length) {
    if ((guard += 1) > pending.length + 5) break; // structural safety net; see the check below

    const ready = pending.filter((o) => {
      if (scheduled.has(opKey(o))) return false;
      // Every earlier operation of the same order must already be placed.
      return pending.filter((p) => p.orderRef === o.orderRef && p.seq < o.seq).every((p) => scheduled.has(opKey(p)));
    });
    if (ready.length === 0) break;

    const next = pickByRule(ready, rule, { datum, hoursPerDay, cal, remainingByOrder, orderFree, centreFree });
    const earliestMaterial = next.earliestStart ? pointToHours(datum, next.earliestStart, 0, hoursPerDay, cal) : 0;
    const start = Math.max(centreFree.get(next.workCentreId) ?? 0, orderFree.get(next.orderRef) ?? 0, earliestMaterial);
    place(next, start);
  }

  function place(o: SchedulableOp, startHours: number): void {
    const endHours = round2(startHours + o.hours);
    const s = hoursToPoint(datum, startHours, hoursPerDay, cal);
    const e = hoursToPoint(datum, endHours, hoursPerDay, cal);
    const lateBy = Math.max(0, daysBetween(o.dueDate, e.date));
    done.push({
      ...o,
      startDate: s.date,
      endDate: e.date,
      startHourOfDay: s.hour,
      endHourOfDay: e.hour,
      daysLate: lateBy,
    });
    centreFree.set(o.workCentreId, Math.max(centreFree.get(o.workCentreId) ?? 0, endHours));
    orderFree.set(o.orderRef, Math.max(orderFree.get(o.orderRef) ?? 0, endHours));
    remainingByOrder.set(o.orderRef, round2((remainingByOrder.get(o.orderRef) ?? 0) - o.hours));
    scheduled.add(opKey(o));
  }

  const orders = [...new Set(ops.map((o) => o.orderRef))].sort().map((ref) => {
    const mine = done.filter((d) => d.orderRef === ref);
    const finishDate = mine.reduce((a, d) => (d.endDate > a ? d.endDate : a), mine[0]?.endDate ?? datum);
    const dueDate = mine[0]?.dueDate ?? datum;
    const late = Math.max(0, daysBetween(dueDate, finishDate));
    return { orderRef: ref, itemCode: mine[0]?.itemCode ?? "", dueDate, finishDate, daysLate: late, onTime: late === 0 };
  });

  const makespanEnd = done.reduce((a, d) => (d.endDate > a ? d.endDate : a), datum);
  const totalTardinessDays = orders.reduce((a, o) => a + o.daysLate, 0);
  const lateOrderCount = orders.filter((o) => !o.onTime).length;

  return {
    rule,
    operations: done.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.startHourOfDay - b.startHourOfDay || a.workCentreCode.localeCompare(b.workCentreCode)),
    orders,
    makespanDays: Math.max(0, daysBetween(datum, makespanEnd)),
    totalTardinessDays,
    lateOrderCount,
    note:
      lateOrderCount === 0
        ? `Every order fits its date under ${rule}. This is a proposal — nothing is published until it is approved.`
        : `${lateOrderCount} order(s) finish late under ${rule}, ${totalTardinessDays} order-day(s) of tardiness in total. Try another rule, add capacity, or move a date.`,
  };
}

function pickByRule(
  ready: readonly SchedulableOp[],
  rule: DispatchRule,
  ctx: {
    datum: string;
    hoursPerDay: number;
    cal: PlanCalendar;
    remainingByOrder: Map<string, number>;
    orderFree: Map<string, number>;
    centreFree: Map<string, number>;
  },
): SchedulableOp {
  const sorted = [...ready];
  if (rule === "SPT") {
    sorted.sort((a, b) => a.hours - b.hours || a.dueDate.localeCompare(b.dueDate) || a.orderRef.localeCompare(b.orderRef));
  } else if (rule === "CR") {
    // Critical ratio = working hours until due ÷ working hours of work left. Under 1.0 the
    // order is already impossible; the smallest ratio is the most urgent.
    const cr = (o: SchedulableOp): number => {
      const timeLeft = pointToHours(ctx.datum, o.dueDate, 0, ctx.hoursPerDay, ctx.cal);
      const workLeft = ctx.remainingByOrder.get(o.orderRef) ?? o.hours;
      return workLeft <= 0 ? Number.POSITIVE_INFINITY : timeLeft / workLeft;
    };
    sorted.sort((a, b) => cr(a) - cr(b) || a.dueDate.localeCompare(b.dueDate) || a.orderRef.localeCompare(b.orderRef));
  } else {
    sorted.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.seq - b.seq || a.orderRef.localeCompare(b.orderRef));
  }
  return sorted[0]!;
}

/**
 * Compare two rules on the same work — the honest way to choose one.
 *
 * A rule is not better in the abstract; it is better at something. EDD keeps promises, SPT
 * clears the queue. Showing both figures is how a planner picks with their eyes open.
 */
export function compareRules(ops: readonly SchedulableOp[], opts: ScheduleOptions, rules: readonly DispatchRule[] = ["EDD", "SPT", "CR"]) {
  return rules.map((rule) => {
    const r = scheduleOperations(ops, { ...opts, rule });
    return {
      rule,
      lateOrderCount: r.lateOrderCount,
      totalTardinessDays: r.totalTardinessDays,
      makespanDays: r.makespanDays,
    };
  });
}

function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}
