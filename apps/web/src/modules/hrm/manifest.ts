import type { ModuleManifest } from "@spine/registry/manifest";

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
};
