import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bucketEnd,
  bucketHorizon,
  bucketOf,
  bucketStart,
  bucketsBetween,
  isWorkingDay,
  offsetWorkingDaysBack,
  offsetWorkingDaysForward,
  workingDaysBetween,
  type PlanCalendar,
} from "./calendar.js";
import { isoWeek, isoWeekStart, isoDayOfWeek, startOfIsoWeek, addDays, daysBetween } from "../time/date.js";

const MON_SAT: PlanCalendar = { workingDays: [1, 2, 3, 4, 5, 6], holidays: [] };

describe("ISO week labelling", () => {
  it("labels the §7 demo week correctly", () => {
    assert.equal(isoWeek("2026-07-20"), "2026-W30"); // Monday
    assert.equal(isoWeek("2026-07-26"), "2026-W30"); // the Sunday that closes it
    assert.equal(isoWeek("2026-07-13"), "2026-W29");
    assert.equal(isoWeek("2026-07-27"), "2026-W31");
  });

  it("round-trips a label back to its Monday", () => {
    assert.equal(isoWeekStart("2026-W30"), "2026-07-20");
    assert.equal(isoWeekStart("2026-W01"), "2025-12-29"); // 2026 opens mid-week
    assert.equal(isoWeek(isoWeekStart("2026-W44")), "2026-W44");
  });

  it("handles the year boundary, where naive week maths goes wrong", () => {
    // 1 Jan 2026 is a Thursday, so it belongs to week 1 — which STARTS in December 2025.
    assert.equal(isoWeek("2026-01-01"), "2026-W01");
    assert.equal(isoWeek("2025-12-29"), "2026-W01");
    // 31 Dec 2024 is a Tuesday in week 1 of 2025.
    assert.equal(isoWeek("2024-12-31"), "2025-W01");
    // A leap year's last days.
    assert.equal(isoWeek("2028-01-01"), "2027-W52");
  });

  it("numbers days the ISO way, not the JavaScript way", () => {
    assert.equal(isoDayOfWeek("2026-07-20"), 1); // Monday
    assert.equal(isoDayOfWeek("2026-07-26"), 7); // Sunday, not 0
    assert.equal(startOfIsoWeek("2026-07-26"), "2026-07-20");
  });

  it("does calendar arithmetic without drifting across month and year ends", () => {
    assert.equal(addDays("2026-07-31", 1), "2026-08-01");
    assert.equal(addDays("2026-01-01", -1), "2025-12-31");
    assert.equal(addDays("2028-02-28", 1), "2028-02-29"); // leap year
    assert.equal(daysBetween("2026-07-13", "2026-07-20"), 7);
    assert.equal(daysBetween("2026-07-20", "2026-07-13"), -7);
  });
});

describe("the working-day calendar", () => {
  it("treats Sunday as the weekly off and a holiday as non-working", () => {
    assert.equal(isWorkingDay("2026-07-25", MON_SAT), true); // Saturday
    assert.equal(isWorkingDay("2026-07-26", MON_SAT), false); // Sunday
    assert.equal(isWorkingDay("2026-08-15", { workingDays: [1, 2, 3, 4, 5, 6], holidays: ["2026-08-15"] }), false);
  });

  it("offsets a lead time over working days, skipping the weekly off", () => {
    // Six working days back from Monday: Sat, Fri, Thu, Wed, Tue, Mon — exactly one week.
    assert.equal(offsetWorkingDaysBack("2026-07-27", 6, MON_SAT), "2026-07-20");
    // Twelve — "two weeks" — lands two Mondays back.
    assert.equal(offsetWorkingDaysBack("2026-07-27", 12, MON_SAT), "2026-07-13");
  });

  it("a holiday inside the lead time pushes the release one more day back", () => {
    const withHoliday: PlanCalendar = { workingDays: [1, 2, 3, 4, 5, 6], holidays: ["2026-07-22"] };
    assert.equal(offsetWorkingDaysBack("2026-07-27", 6, MON_SAT), "2026-07-20");
    assert.equal(offsetWorkingDaysBack("2026-07-27", 6, withHoliday), "2026-07-18");
  });

  it("a five-day week needs more calendar time for the same lead time", () => {
    const monFri: PlanCalendar = { workingDays: [1, 2, 3, 4, 5], holidays: [] };
    // Same six working days, but two days off per week instead of one.
    assert.equal(offsetWorkingDaysBack("2026-07-27", 6, monFri), "2026-07-17");
  });

  it("refuses to spin forever on a calendar with no working days", () => {
    assert.throws(() => offsetWorkingDaysBack("2026-07-27", 3, { workingDays: [], holidays: [] }), /no working days/);
  });

  it("counts and walks forward consistently", () => {
    assert.equal(workingDaysBetween("2026-07-20", "2026-07-27", MON_SAT), 6);
    assert.equal(workingDaysBetween("2026-07-27", "2026-07-20", MON_SAT), 0); // never negative
    assert.equal(offsetWorkingDaysForward("2026-07-20", 6, MON_SAT), "2026-07-27");
  });

  it("a zero lead time releases on the day it is needed", () => {
    assert.equal(offsetWorkingDaysBack("2026-07-27", 0, MON_SAT), "2026-07-27");
  });
});

describe("planning buckets", () => {
  it("opens on a Monday and closes on a Sunday", () => {
    assert.equal(bucketStart("2026-W30"), "2026-07-20");
    assert.equal(bucketEnd("2026-W30"), "2026-07-26");
    assert.equal(bucketOf("2026-07-24"), "2026-W30");
  });

  it("builds a horizon from a DATE, not a label", () => {
    assert.deepEqual(bucketHorizon("2026-07-22", 3), ["2026-W30", "2026-W31", "2026-W32"]);
  });

  it("spans the year boundary without a gap or a repeat", () => {
    const h = bucketHorizon("2026-12-21", 4);
    assert.deepEqual(h, ["2026-W52", "2026-W53", "2027-W01", "2027-W02"]);
    assert.equal(bucketsBetween("2026-W52", "2027-W01"), 2);
  });

  it("measures distance between buckets in both directions", () => {
    assert.equal(bucketsBetween("2026-W30", "2026-W33"), 3);
    assert.equal(bucketsBetween("2026-W33", "2026-W30"), -3);
    assert.equal(bucketsBetween("2026-W30", "2026-W30"), 0);
  });
});
