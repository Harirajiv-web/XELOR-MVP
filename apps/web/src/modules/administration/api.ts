/**
 * Administration's own slice of the API. Nothing outside this folder imports it, and it
 * imports nothing from another module — which is what makes the folder deletable.
 *
 * Every field below was read off the service that produces it, not guessed. Two shapes
 * recur and are NOT interchangeable: the list endpoints answer `{data: T[]}`, and the
 * single-object endpoints (`/admin/posture`, `/admin/licence`) answer the object itself.
 */

/* --------------------------------- access -------------------------------- */

export interface RoleRow {
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  isPrivileged: boolean;
  /** True when the role bypasses row scoping entirely — it sees every plant. */
  isRowUnrestricted: boolean;
  permissionCount: number;
  holderCount: number;
}

/* -------------------------- segregation of duties ------------------------ */

export interface SodFindingRow {
  id: string;
  subject: string;
  subjectName: string;
  riskLevel: string;
  status: string;
  detectedAt: string;
  /** The rule's name, already resolved server-side. */
  rule: string;
  /** The two role codes the rule keeps apart. */
  roles: readonly string[];
  enforcement: string;
  /** The deterministic sentence. This is the product; the AI one is an addition. */
  explanation: string;
  aiExplanation: string | null;
  compensatingControl: string | null;
}

export interface SodRuleRow {
  id: string;
  name: string;
  roleACode: string;
  roleBCode: string;
  riskLevel: string;
  enforcement: string;
  description: string;
  compensatingControl: string | null;
}

/* ------------------------------- compliance ------------------------------ */

/** A row of `/admin/incidents`: the register fields plus the live dual clock. */
export interface IncidentRow {
  incidentNo: string;
  title: string;
  severity: string;
  category: string;
  /** The workflow status. Named `recordStatus` because the clock also has a `status`. */
  recordStatus: string;
  piiAffected: boolean;
  containmentNote: string | null;
  detectedAt: string;
  certInDueAt: string;
  certInReportable: boolean;
  dpdpBoardDueAt: string | null;
  /** Hours left against the six-hour clock; negative once it has passed. */
  certInHoursRemaining: number;
  breached: boolean;
  /** reported | on_track | urgent | breached | not_reportable */
  status: string;
  message: string;
}

export interface DsrRow {
  requestNo: string;
  requestType: string;
  dataPrincipalRef: string;
  recordStatus: string;
  receivedAt: string;
  dueAt: string;
  daysRemaining: number;
  /** fulfilled | on_track | approaching | overdue | refused_statutory_hold */
  status: string;
  message: string;
}

export interface ConsentRow {
  dataPrincipalRef: string;
  purposeCode: string;
  basis: string;
  givenAt: string | null;
  withdrawnAt: string | null;
  note: string;
}

/* --------------------------------- chain --------------------------------- */

/** A stored attestation. `intact` is the verdict; `breakKind` says what kind of tampering. */
export interface ChainVerificationRow {
  id: string;
  chainName: string;
  fromSeq: number;
  toSeq: number;
  rowsChecked: number;
  intact: boolean;
  firstBreakSeq: number | null;
  /** none | hash_mismatch | link_mismatch | sequence_gap */
  breakKind: string;
  message: string;
  verifiedAt: string;
}

/* --------------------------- licence and platform ------------------------ */

/**
 * `/admin/licence` answers one of two shapes: a full record, or `{licensed:false, note}`
 * when the tenant has no licence row at all. Both are modelled here because collapsing them
 * would make "not licensed" look like "plan: undefined".
 */
export interface LicenceRow {
  licensed?: boolean;
  plan?: string;
  namedSeats?: number;
  seatsUsed?: number;
  seatsRemaining?: number;
  modules?: readonly string[];
  validFrom?: string;
  validTo?: string;
  /** soft | hard. Soft is the decision: a plant does not stop because a licence lapsed. */
  enforcement?: string;
  /** ok | expired | over_seats */
  status?: string;
  note?: string;
}

export interface SettingRow {
  key: string;
  value: string;
  valueType: string;
  statutoryFloor: number | null;
  /** The statute the floor comes from. A floor with no source is folklore. */
  floorSource: string | null;
  description: string | null;
}

export interface FlagRow {
  flagKey: string;
  enabled: boolean;
  scope: string;
  description: string | null;
}

export interface BackupRow {
  name: string;
  schedule: string;
  target: string;
  region: string;
  encryption: string;
  retentionPolicy: string;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRestoreTestAt: string | null;
  restorePreservedChain: boolean | null;
  /** "India", or a sentence saying the data left it. */
  residency: string;
  assurance: string;
}

export interface PostureRow {
  asOf: string;
  activeUsers: number;
  usersWithoutMfa: number;
  liveSessions: number;
  recentFailedLogins: number;
  licence: LicenceRow;
  backups: BackupRow[];
  issues: string[];
  headline: string;
}

/** The list endpoints all answer this envelope. */
export interface DataEnvelope<T> {
  data: T[];
}

export const administrationApi = {
  rolesPath: "/admin/roles",
  sodFindingsPath: "/admin/sod/findings",
  sodRulesPath: "/admin/sod/rules",
  posturePath: "/admin/posture",
  incidentsPath: "/admin/incidents",
  dsrPath: "/admin/dsr",
  consentPath: "/admin/consent",
  verificationsPath: "/admin/audit/verifications",
  licencePath: "/admin/licence",
  settingsPath: "/admin/settings",
  flagsPath: "/admin/flags",
  backupsPath: "/admin/backups",
} as const;

/**
 * Risk and severity words mapped to the eight-state badge language, deliberately and in one
 * place.
 *
 * `toneFor()` has never seen "critical" or "high" and would render them all as `unknown`,
 * which makes a critical conflict look exactly like a low one. The mapping is explicit so
 * the choice is reviewable, and every badge that uses it also carries the raw word as its
 * label — hue is never the only thing carrying the severity.
 */
export function severityTone(level: string | null | undefined): "rejected" | "overdue" | "pending" | "unknown" {
  switch ((level ?? "").toLowerCase()) {
    case "critical":
      return "rejected";
    case "high":
      return "overdue";
    case "medium":
      return "pending";
    default:
      return "unknown";
  }
}
