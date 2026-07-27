import { num } from "@spine/format";
import type { ModuleManifest } from "@spine/registry/manifest";
import { hrmApi } from "./api";

/**
 * PEOPLE (RASP, HRM & Attendance).
 *
 * The whole module is this folder. Delete it and remove one line from
 * `src/modules/registry.ts`, and the application compiles, runs, and has one fewer item in
 * the sidebar — no route file to clean up, no navigation array to edit, no import left
 * dangling anywhere else.
 *
 * Two absences are deliberate rather than unfinished. There is no PAYROLL entry, because
 * the API exposes payroll runs only by id — there is no list endpoint to hang a screen on.
 * And nothing here reveals a personal identifier: the unmask is a separate permission on a
 * separate endpoint that writes a reason to an append-only log, and it does not belong on a
 * read-only screen.
 */

/* ------------------------------ dashboard signals ------------------------------ */

/**
 * The three envelopes this API actually answers with — a bare array (the muster), `items`
 * (the cursor page), or `data`. A signal receives `unknown` and must survive ALL of them,
 * because a decorative tile that throws would take the department dashboard down with it.
 */
function rowsOf(data: unknown): readonly unknown[] | null {
  if (Array.isArray(data)) return data;
  if (data !== null && typeof data === "object") {
    const o = data as { items?: unknown; data?: unknown };
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return null;
}

interface DaySummary {
  paid: number;
  lop: number;
  present: number;
  half: number;
  leave: number;
  absent: number;
}

/** A muster row's month roll-up, or null if this is not one. Never touches `days[]`. */
function summaryOf(row: unknown): DaySummary | null {
  if (row === null || typeof row !== "object") return null;
  const s = (row as { summary?: unknown }).summary;
  if (s === null || typeof s !== "object") return null;
  const f = s as Record<string, unknown>;
  // `paidDays` is the one figure payroll multiplies by. If it is not a number this is not a
  // muster row, whatever else the shape looks like.
  if (typeof f.paidDays !== "number") return null;
  const n = (k: string): number =>
    typeof f[k] === "number" && Number.isFinite(f[k]) ? (f[k] as number) : 0;
  return {
    paid: n("paidDays"),
    lop: n("lopDays"),
    present: n("presentDays"),
    half: n("halfDays"),
    leave: n("leaveDays"),
    absent: n("absentDays"),
  };
}

/** Day counts carry a half day, so the decimal appears only when there actually is one. */
function days(value: number): string {
  return num(value, Number.isInteger(value) ? 0 : 1);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-07" → "Jul 2026". A figure for a month must say WHICH month, on the tile itself. */
const MONTH_LABEL = ((): string => {
  const [year, mm] = hrmApi.demoMonth.split("-");
  const name = MONTHS[Number(mm) - 1];
  return year && name ? `${name} ${year}` : hrmApi.demoMonth;
})();

export const hrmManifest: ModuleManifest = {
  key: "hrm",
  name: "People",
  summary: "Who works here, what they were paid for, and the statutory rate book behind it.",
  department: "RASP",
  icon: "Users",
  licenceKey: "hrm",
  order: 65,
  nav: [
    {
      label: "Employees",
      path: "employees",
      permission: "hrm.employee.read",
      icon: "Contact",
    },
    {
      // Reached by clicking a row on Employees. Routable, never in the sidebar — a menu
      // item that needs an id in the URL to work is a menu item that leads to an error.
      label: "Employee",
      path: "employee",
      permission: "hrm.employee.read",
      hidden: true,
    },
    {
      label: "Attendance muster",
      path: "muster",
      permission: "hrm.attendance.read",
      icon: "CalendarCheck",
    },
    {
      label: "Leave balances",
      path: "leave",
      permission: "hrm.leave.read",
      icon: "CalendarDays",
    },
    {
      label: "Statutory rates",
      path: "statutory",
      permission: "hrm.statutory.read",
      icon: "Scale",
    },
  ],
  screens: {
    employees: () => import("./screens/employees"),
    employee: () => import("./screens/employee"),
    muster: () => import("./screens/muster"),
    leave: () => import("./screens/leave"),
    statutory: () => import("./screens/statutory"),
  },
  /**
   * What People is willing to put on the department dashboard. Three figures, each read
   * from an endpoint this module's own screens already call with the parameters they
   * already worked out — the muster answers 400 without a `month`, so the month is passed.
   *
   * NOTHING HERE IS DERIVED FROM A PERSONAL IDENTIFIER. The employee projection cannot
   * return an unmasked PAN, Aadhaar or bank account at all, and these tiles read only
   * counts, placements and day totals — no name, no code, no identifier reaches the tile.
   */
  signals: [
    {
      label: "On roll",
      permission: "hrm.employee.read",
      path: hrmApi.employeesPath,
      // 100 is the API's own ceiling. Beyond it the count is a page, not a headcount, and
      // the tile says so rather than under-reporting the payroll by a page.
      query: { limit: 100 },
      reduce: (data) => {
        const rows = rowsOf(data);
        if (!rows) return null;
        const more =
          data !== null &&
          typeof data === "object" &&
          typeof (data as { nextCursor?: unknown }).nextCursor === "string";
        const departments = new Set(
          rows
            .map((r) => (r !== null && typeof r === "object" ? (r as { department?: unknown }).department : null))
            .filter((d): d is string => typeof d === "string" && d.length > 0),
        );
        return {
          value: more ? `${num(rows.length)}+` : num(rows.length),
          hint: more
            ? "First page of the employee master"
            : departments.size > 0
              ? `Across ${num(departments.size)} department${departments.size === 1 ? "" : "s"}`
              : "Active employee records",
          tone: "neutral",
        };
      },
    },
    {
      label: "Paid days",
      permission: "hrm.attendance.read",
      path: hrmApi.musterPath,
      query: { month: hrmApi.demoMonth },
      reduce: (data) => {
        const rows = rowsOf(data);
        if (!rows) return null;
        let paid = 0;
        let lop = 0;
        let counted = 0;
        for (const row of rows) {
          const s = summaryOf(row);
          if (!s) continue;
          counted += 1;
          paid += s.paid;
          lop += s.lop;
        }
        // No recognisable muster row, or a month nobody has processed yet. An unprocessed
        // month reads as "nobody came to work", so the tile withdraws instead of claiming it.
        if (counted === 0 || paid + lop === 0) return null;
        return {
          value: days(Math.round(paid * 100) / 100),
          hint:
            lop > 0
              ? `${MONTH_LABEL} · ${days(Math.round(lop * 100) / 100)} lost to LOP`
              : `${MONTH_LABEL} · no loss of pay`,
          tone: lop > 0 ? "warn" : "ok",
          fraction: paid / (paid + lop),
        };
      },
    },
    {
      label: `Attendance, ${MONTH_LABEL}`,
      permission: "hrm.attendance.read",
      path: hrmApi.musterPath,
      query: { month: hrmApi.demoMonth },
      reduce: (data) => {
        const rows = rowsOf(data);
        if (!rows) return null;
        let present = 0;
        let half = 0;
        let leave = 0;
        let absent = 0;
        let counted = 0;
        for (const row of rows) {
          const s = summaryOf(row);
          if (!s) continue;
          counted += 1;
          present += s.present;
          half += s.half;
          leave += s.leave;
          absent += s.absent;
        }
        const total = present + half + leave + absent;
        if (counted === 0 || total === 0) return null;
        // All four are kept even at zero: "leave 0" is a fact worth reading, and dropping
        // empty categories would change the chart's shape from one month to the next.
        return {
          value: num(total),
          hint: "Working days",
          series: [
            { label: "Present", value: present },
            { label: "Half day", value: half },
            { label: "Leave", value: leave },
            { label: "Absent", value: absent },
          ],
        };
      },
    },
  ],
};
