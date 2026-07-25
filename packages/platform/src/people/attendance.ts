/**
 * The ATTENDANCE engine (HRM §11.2, HR-23) — deterministic and replayable by design.
 *
 * NFR-03 is the contract this file exists to keep: attendance processing is a **pure
 * function of (punches, roster, holiday calendar, leave, policy)**. Reprocessing any day is
 * safe; a regularisation appends corrective punches and replays to the same result set
 * regardless of arrival order. That property is what lets payroll lock a month and lets an
 * employee dispute a day without anyone "adjusting" a stored number by hand.
 *
 * The hard part is not the arithmetic — it is the C shift. A 22:00–06:00 shift's out-punch
 * lands on the NEXT calendar day, and a naive `WHERE punch_time::date = att_date` silently
 * loses it, which is exactly the manual adjustment SMBs do every month. Here the pairing
 * window is derived from the roster and bounded by the neighbouring rostered shifts, so
 * back-to-back C shifts cannot steal each other's punches.
 */

/** How the day ended up. Letter codes double as the WCAG-safe muster labels. */
export type AttendanceStatus =
  | "present"
  | "absent"
  | "half"
  | "leave"
  | "holiday"
  | "off"
  | "od"
  | "pending_reg";

export interface ShiftDef {
  code: string;
  /** "HH:MM" local wall-clock. */
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceMinutes: number;
  /** end <= start, i.e. the shift crosses midnight. Stored, not inferred, so it is auditable. */
  isNight: boolean;
  /** Worked minutes beyond this earn OT. */
  otAfterMinutes: number;
  /** Below this, the day is a half-day rather than present. */
  halfDayThresholdMinutes: number;
}

export interface PunchRecord {
  /** ISO-8601 instant. */
  punchTime: string;
  direction: "in" | "out" | "auto";
  source: "device" | "csv" | "mobile" | "web" | "manual";
}

export interface AttendancePolicy {
  /** Tenant wall-clock offset. 330 = IST. Passed in, never assumed from the host clock. */
  utcOffsetMinutes: number;
  /** How early before shift start a punch still counts as this shift's. */
  windowPadBeforeMinutes: number;
  /** How late after shift end a punch still counts as this shift's. */
  windowPadAfterMinutes: number;
  /** Punches closer together than this are the same press of the same finger. */
  duplicateWindowSeconds: number;
}

export const DEFAULT_ATTENDANCE_POLICY: AttendancePolicy = {
  utcOffsetMinutes: 330,
  windowPadBeforeMinutes: 120,
  // Deliberately wider than the before-pad: overtime legitimately runs past shift end, and
  // a window that closes at the rostered end time would silently drop the out-punch of the
  // very days OT is paid for. The neighbouring-shift clamp keeps it from over-reaching.
  windowPadAfterMinutes: 240,
  duplicateWindowSeconds: 60,
};

export interface DayContext {
  attDate: string; // YYYY-MM-DD
  /** Undefined when the roster says weekly-off. */
  shift?: ShiftDef;
  entryType: "shift" | "weekly_off";
  isHoliday: boolean;
  /** An approved leave covering this date, if any. */
  leave?: { leaveTypeCode: string; isPaid: boolean; halfDay: boolean };
  /** Neighbouring rostered shifts, used to bound the pairing window. */
  prevShiftEndsAt?: string;
  nextShiftStartsAt?: string;
}

export interface AttendanceDayResult {
  attDate: string;
  status: AttendanceStatus;
  firstIn: string | null;
  lastOut: string | null;
  workedHours: number;
  otHours: number;
  lateMinutes: number;
  /** Days of LOP this row contributes: 1 for an unauthorised absence, 0.5 for a half-day LOP. */
  lopUnits: number;
  /** What payroll counts this day as: 1, 0.5 or 0. */
  payableUnits: number;
  /** Muster chips — why a human should look at this day. */
  exceptions: string[];
  shiftCode: string | null;
}

/* -------------------------------------------------------------------------- */
/* Time helpers — all arithmetic in epoch ms, all display in tenant wall-clock  */
/* -------------------------------------------------------------------------- */

const MIN = 60_000;

function atLocal(dateISO: string, hhmm: string, offsetMinutes: number): number {
  const ms = Date.parse(`${dateISO}T${hhmm}:00Z`);
  if (Number.isNaN(ms)) throw new Error(`invalid local time ${dateISO} ${hhmm}`);
  return ms - offsetMinutes * MIN;
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ShiftWindow {
  /** Nominal shift boundaries (no padding) — what lateness is measured against. */
  shiftStart: number;
  shiftEnd: number;
  /** Padded boundaries — the range within which a punch belongs to this day. */
  windowStart: number;
  windowEnd: number;
}

/**
 * The pairing window for one rostered day.
 *
 * For a night shift the end lands on the following calendar date, which is precisely why
 * an out-punch at 06:10 on the 16th belongs to the 15th's attendance row. The padding is
 * then CLAMPED against the neighbouring rostered shifts, so two consecutive C shifts each
 * keep their own punches instead of the window swallowing the next one's in-punch.
 */
export function resolveShiftWindow(ctx: DayContext, policy: AttendancePolicy): ShiftWindow {
  const shift = ctx.shift;
  if (!shift) throw new Error("resolveShiftWindow requires a rostered shift");
  const start = atLocal(ctx.attDate, shift.startTime, policy.utcOffsetMinutes);
  const endDate = shift.isNight ? addDaysISO(ctx.attDate, 1) : ctx.attDate;
  const end = atLocal(endDate, shift.endTime, policy.utcOffsetMinutes);

  let windowStart = start - policy.windowPadBeforeMinutes * MIN;
  let windowEnd = end + policy.windowPadAfterMinutes * MIN;

  // Bound by roster context (§15.2 rule 7) — meet the neighbour halfway, never past it.
  if (ctx.prevShiftEndsAt) {
    const prevEnd = Date.parse(ctx.prevShiftEndsAt);
    if (!Number.isNaN(prevEnd) && prevEnd < start) {
      windowStart = Math.max(windowStart, prevEnd + (start - prevEnd) / 2);
    }
  }
  if (ctx.nextShiftStartsAt) {
    const nextStart = Date.parse(ctx.nextShiftStartsAt);
    if (!Number.isNaN(nextStart) && nextStart > end) {
      windowEnd = Math.min(windowEnd, end + (nextStart - end) / 2);
    }
  }

  return { shiftStart: start, shiftEnd: end, windowStart, windowEnd };
}

/**
 * Collapse near-duplicate punches (§15.3 rule 8). Two reads within the configured window
 * are one press; the ORIGINAL is retained (the raw store is append-only — nothing is
 * deleted, this only affects the derived pairing).
 */
export function dedupePunches(punches: readonly PunchRecord[], policy: AttendancePolicy): PunchRecord[] {
  const sorted = [...punches].sort((a, b) => Date.parse(a.punchTime) - Date.parse(b.punchTime));
  const out: PunchRecord[] = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.direction === p.direction &&
      Date.parse(p.punchTime) - Date.parse(prev.punchTime) < policy.duplicateWindowSeconds * 1000
    ) {
      continue;
    }
    out.push(p);
  }
  return out;
}

export interface PairedPunches {
  firstIn: PunchRecord | null;
  lastOut: PunchRecord | null;
  count: number;
}

/**
 * First-in / last-out within the window.
 *
 * Direction-less (`auto`) punches — what cheap turnstiles emit — are resolved by
 * ALTERNATION: the first is an in, the next an out, and so on. That is the same rule the
 * device vendor's own utility uses, and making it explicit here is what lets a disputed day
 * be re-derived rather than argued about.
 */
export function pairPunches(punches: readonly PunchRecord[], window: ShiftWindow): PairedPunches {
  const inWindow = punches
    .filter((p) => {
      const t = Date.parse(p.punchTime);
      return t >= window.windowStart && t <= window.windowEnd;
    })
    .sort((a, b) => Date.parse(a.punchTime) - Date.parse(b.punchTime));

  let alternate: "in" | "out" = "in";
  const resolved = inWindow.map((p) => {
    if (p.direction !== "auto") {
      alternate = p.direction === "in" ? "out" : "in";
      return p;
    }
    const d = alternate;
    alternate = d === "in" ? "out" : "in";
    return { ...p, direction: d };
  });

  const ins = resolved.filter((p) => p.direction === "in");
  const outs = resolved.filter((p) => p.direction === "out");
  return {
    firstIn: ins[0] ?? null,
    lastOut: outs[outs.length - 1] ?? null,
    count: resolved.length,
  };
}

/**
 * Process one employee-day. Pure: same inputs, same output, every time.
 *
 * Precedence is deliberate and matches §11.2 — weekly-off, then holiday, then approved
 * leave, and only then the punches. A worker who punches in on a holiday still shows as a
 * holiday day (with the punches recorded) rather than silently becoming a working day.
 */
export function processAttendanceDay(
  ctx: DayContext,
  punches: readonly PunchRecord[],
  policy: AttendancePolicy = DEFAULT_ATTENDANCE_POLICY,
): AttendanceDayResult {
  const base = {
    attDate: ctx.attDate,
    firstIn: null,
    lastOut: null,
    workedHours: 0,
    otHours: 0,
    lateMinutes: 0,
    lopUnits: 0,
    exceptions: [] as string[],
    shiftCode: ctx.shift?.code ?? null,
  };

  // Weekly-off is a first-class roster entry, NEVER inferred from Sunday (§15.2 rule 6).
  if (ctx.entryType === "weekly_off") {
    return { ...base, status: "off", payableUnits: 0 };
  }
  if (ctx.isHoliday) {
    return { ...base, status: "holiday", payableUnits: 0 };
  }
  if (ctx.leave) {
    const units = ctx.leave.halfDay ? 0.5 : 1;
    return {
      ...base,
      status: "leave",
      payableUnits: ctx.leave.isPaid ? units : 0,
      lopUnits: ctx.leave.isPaid ? 0 : units,
      exceptions: ctx.leave.isPaid ? [] : [`unpaid leave (${ctx.leave.leaveTypeCode}) — LOP`],
    };
  }
  if (!ctx.shift) {
    return { ...base, status: "pending_reg", payableUnits: 0, exceptions: ["no shift rostered"] };
  }

  const window = resolveShiftWindow(ctx, policy);
  const paired = pairPunches(dedupePunches(punches, policy), window);

  if (paired.count === 0) {
    return {
      ...base,
      status: "absent",
      payableUnits: 0,
      lopUnits: 1,
      exceptions: ["no punches — absent"],
    };
  }

  // A single punch is NEVER auto-Present (§15.3 rule 9). Guessing the missing half of a
  // day is how payroll disputes start; this routes it to a human instead.
  if (paired.firstIn == null || paired.lastOut == null) {
    return {
      ...base,
      status: "pending_reg",
      firstIn: paired.firstIn?.punchTime ?? null,
      lastOut: paired.lastOut?.punchTime ?? null,
      payableUnits: 0,
      exceptions: [paired.firstIn ? "missing out-punch" : "missing in-punch"],
    };
  }

  const inMs = Date.parse(paired.firstIn.punchTime);
  const outMs = Date.parse(paired.lastOut.punchTime);
  if (outMs <= inMs) {
    return {
      ...base,
      status: "pending_reg",
      firstIn: paired.firstIn.punchTime,
      lastOut: paired.lastOut.punchTime,
      payableUnits: 0,
      exceptions: ["out-punch is not after the in-punch"],
    };
  }

  const grossMinutes = (outMs - inMs) / MIN;
  const workedMinutes = Math.max(0, grossMinutes - ctx.shift.breakMinutes);
  const lateMinutes = Math.max(0, Math.round((inMs - (window.shiftStart + ctx.shift.graceMinutes * MIN)) / MIN));
  const otMinutes = Math.max(0, workedMinutes - ctx.shift.otAfterMinutes);
  const isHalf = workedMinutes < ctx.shift.halfDayThresholdMinutes;

  const exceptions: string[] = [];
  if (lateMinutes > 0) exceptions.push(`late by ${lateMinutes} min beyond the ${ctx.shift.graceMinutes} min grace`);
  if (isHalf) exceptions.push(`short hours: ${round2(workedMinutes / 60)}h worked`);

  return {
    attDate: ctx.attDate,
    // Half-day AND overtime on the same day is legal (§15.3 rule 14) — a late start does
    // not erase hours worked at the end of the shift.
    status: isHalf ? "half" : "present",
    firstIn: paired.firstIn.punchTime,
    lastOut: paired.lastOut.punchTime,
    workedHours: round2(workedMinutes / 60),
    otHours: round2(otMinutes / 60),
    lateMinutes,
    lopUnits: isHalf ? 0.5 : 0,
    payableUnits: isHalf ? 0.5 : 1,
    exceptions,
    shiftCode: ctx.shift.code,
  };
}

/* -------------------------------------------------------------------------- */
/* Month roll-up — what payroll actually consumes                              */
/* -------------------------------------------------------------------------- */

export interface MonthSummary {
  /** Days that count towards the payroll denominator (offs and holidays excluded). */
  workingDays: number;
  paidDays: number;
  lopDays: number;
  otHours: number;
  presentDays: number;
  halfDays: number;
  leaveDays: number;
  absentDays: number;
  /** A month cannot be locked while any of these remain (§15.3 rule 12). */
  pendingRegularisations: number;
}

/**
 * Roll a month of processed days into the four numbers payroll needs. Nothing here is
 * re-derived from punches — payroll consumes attendance's conclusion, never its inputs.
 */
export function summariseMonth(days: readonly AttendanceDayResult[]): MonthSummary {
  const s: MonthSummary = {
    workingDays: 0,
    paidDays: 0,
    lopDays: 0,
    otHours: 0,
    presentDays: 0,
    halfDays: 0,
    leaveDays: 0,
    absentDays: 0,
    pendingRegularisations: 0,
  };
  for (const d of days) {
    s.otHours = round2(s.otHours + d.otHours);
    if (d.status === "off" || d.status === "holiday") continue;
    s.workingDays += 1;
    s.paidDays = round2(s.paidDays + d.payableUnits);
    s.lopDays = round2(s.lopDays + d.lopUnits);
    if (d.status === "present") s.presentDays += 1;
    else if (d.status === "half") s.halfDays += 1;
    else if (d.status === "leave") s.leaveDays += 1;
    else if (d.status === "absent") s.absentDays += 1;
    else if (d.status === "pending_reg") s.pendingRegularisations += 1;
  }
  return s;
}
