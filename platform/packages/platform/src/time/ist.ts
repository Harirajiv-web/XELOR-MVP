/**
 * India Standard Time, as an offset in minutes.
 *
 * It lives on its own because two different engines need it and neither owns it: the
 * maintenance KPI window (a shift that runs 22:00 to 03:00 IST belongs to the day it
 * started, not to two UTC days) and the CSP business-time clock (a working window of
 * 09:00–18:00 is local wall-clock, not UTC). Defining it twice is how those two quietly
 * disagree by five and a half hours.
 *
 * IST has no daylight saving and has been UTC+05:30 since 1945, so a constant is correct
 * here in a way it would not be for most zones. A tenant outside India supplies its own
 * `utcOffsetMinutes` on the calendar rather than editing this.
 */
export const IST_OFFSET_MINUTES = 330;
