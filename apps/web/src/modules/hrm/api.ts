/**
 * People's own slice of the API. Nothing outside this folder imports it, and it imports
 * nothing from another module — which is what makes the folder deletable.
 */

/**
 * `GET /hrm/employees` and `GET /hrm/employees/:id`.
 *
 * `pan`, `aadhaar` and `bankAccount` arrive ALREADY MASKED and there is no field here that
 * could hold a plaintext one. The API's employee projection never decrypts; the unmask is a
 * separate, logged endpoint behind its own permission. Typing it this way means no screen
 * in this folder can accidentally render an identifier, even by mistake.
 */
export interface EmployeeRow {
  id: string;
  empCode: string;
  name: string;
  gender: string | null;
  employmentType: string;
  dateOfJoining: string;
  status: string;
  department: string | null;
  designation: string | null;
  ptState: string;
  epfCeilingPolicy: string;
  pan: string | null;
  aadhaar: string | null;
  bankAccount: string | null;
  /** Why this data may be held at all — DPDP s.7 legitimate use, not consent. */
  piiLegalBasis: string;
}

/**
 * The platform's cursor envelope (`CursorPage<T>`), which `useCursorList` reads for itself.
 *
 * It is still typed here because ONE screen needs the raw shape: the leave picker is a
 * `<select>`, and a dropdown cannot page — a person missing from it is a person the user
 * concludes does not exist. That screen therefore asks for a deliberate ceiling in a single
 * call rather than pretending a control that shows everything at once can be paginated.
 */
export interface EmployeePage {
  items: EmployeeRow[];
  nextCursor: string | null;
}

/** The month roll-up payroll consumes — attendance's conclusion, never its punches. */
export interface MusterSummary {
  workingDays: number;
  paidDays: number;
  lopDays: number;
  otHours: number;
  presentDays: number;
  halfDays: number;
  leaveDays: number;
  absentDays: number;
  /** A month cannot be locked while any of these remain outstanding. */
  pendingRegularisations: number;
}

export interface MusterDay {
  date: string;
  status: string;
  otHours: number;
  exceptions: string[];
}

export interface MusterRow {
  employeeId: string;
  empCode: string;
  name: string;
  days: MusterDay[];
  summary: MusterSummary;
}

export interface LeaveBalanceRow {
  leaveTypeCode: string;
  leaveTypeName: string;
  isPaid: boolean;
  opening: number;
  accrued: number;
  used: number;
  encashed: number;
  /** opening + accrued − used − encashed, computed by the API so two screens cannot differ. */
  closing: number;
}

/**
 * One row of the statutory rate book. `effectiveFrom` is the whole point: a Budget-day
 * change is an INSERT, so the old row and the new one both survive and a payslip recomputed
 * in 2029 still resolves the rate that applied on the day it was earned.
 */
export interface StatutoryRow {
  statute: string;
  effectiveFrom: string;
  summary: string;
  sourceNote: string | null;
}

export const hrmApi = {
  employeesPath: "/hrm/employees",
  employeePath: (id: string) => `/hrm/employees/${id}`,
  musterPath: "/hrm/attendance/muster",
  leaveBalancesPath: "/hrm/leave-balances",
  statutoryPath: "/hrm/statutory-config",
  /**
   * The demo world's today is Monday 20 July 2026 and the financial year is 2026-27.
   * The muster and the leave ledger both REQUIRE a period — omitting it is a 400, not an
   * empty screen — so the defaults live here rather than being retyped on each screen.
   */
  demoMonth: "2026-07",
  demoLeaveYear: "2026-27",
  /** Used only to decide which rate row is the one in force today. */
  demoToday: "2026-07-20",
} as const;
