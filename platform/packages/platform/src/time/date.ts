/**
 * Calendar-day arithmetic on `YYYY-MM-DD` strings.
 *
 * These live here, next to `IST_OFFSET_MINUTES`, for the same reason it does: three
 * engines need them and none of them owns them — the maintenance PM clock, the reliability
 * window, and the planning bucket calendar. Two implementations of "add a day" is how two
 * modules quietly disagree about which day a due date falls on.
 *
 * Everything is UTC-anchored on purpose. A plain date has no time zone, and a planning
 * bucket that shifted by one day because the server ran in IST would move a whole week's
 * requirement into the previous bucket.
 */

/** Calendar-day arithmetic on a YYYY-MM-DD string, UTC-safe. */
export function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `fromISO` to `toISO`; negative when `toISO` is earlier. */
export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86_400_000);
}

/** 1 = Monday … 7 = Sunday (ISO-8601), not JavaScript's 0 = Sunday. */
export function isoDayOfWeek(dateISO: string): number {
  const d = new Date(`${dateISO}T00:00:00.000Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** The Monday of the ISO week containing `dateISO`. */
export function startOfIsoWeek(dateISO: string): string {
  return addDays(dateISO, 1 - isoDayOfWeek(dateISO));
}

/**
 * The ISO-8601 week label, `YYYY-Www` — e.g. `2026-W30` for Mon 20 Jul 2026.
 *
 * ISO weeks start on Monday and week 1 is the week containing the first Thursday of the
 * year, which is why this is computed from the Thursday of the target week rather than
 * from 1 January: a year can begin in week 52 or 53 of the previous year, and a planning
 * horizon that straddles new year gets the bucket labels wrong if that is fudged.
 */
export function isoWeek(dateISO: string): string {
  const thursday = addDays(startOfIsoWeek(dateISO), 3);
  const year = thursday.slice(0, 4);
  // 4 January is in ISO week 1 of its year, in every year, by definition of the standard.
  const week1Monday = startOfIsoWeek(`${year}-01-04`);
  const week = Math.floor(daysBetween(week1Monday, thursday) / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The Monday that starts the ISO week labelled `YYYY-Www`. */
export function isoWeekStart(label: string): string {
  const [yearPart, weekPart] = label.split("-W");
  const week = Number(weekPart);
  // 4 January is always in ISO week 1, in every year, by definition of the standard.
  const week1Monday = startOfIsoWeek(`${yearPart}-01-04`);
  return addDays(week1Monday, (week - 1) * 7);
}
