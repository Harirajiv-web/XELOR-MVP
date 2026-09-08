import { bigserial, boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenantScopedColumns } from "./columns.js";

/**
 * ADMINISTRATION (HEXA, Module 14) — the control plane.
 *
 * Identity, what people may do, what the system did, and what the law requires be kept.
 * Three of those four already existed as platform bootstrap: Keycloak authenticates,
 * `role`/`role_permission`/`user_role` decide, `audit_log` records. What this module adds
 * is everything that turns those primitives into something an auditor, a regulator or a
 * plant manager can actually work with:
 *
 *  - **which rows**, not just which doctypes (`user_permission`), and **how much of each
 *    row** (`field_permission`) — a correct permission grid with no row scope is how a
 *    shop-floor operator ends up able to read every plant's costs;
 *  - **who must not hold both** (`sod_rule`) — the classic control, deterministic;
 *  - **proof the record was not edited** (`audit_anchor`, `chain_verification`);
 *  - **the two clocks the law starts**: CERT-In's six hours and DPDP's ninety days;
 *  - **machine access** that can be revoked without turning the plant off.
 *
 * One thing deliberately absent: no password, secret or token material lives here.
 * Credentials are Keycloak's, API-key secrets are stored only as hashes. A control plane
 * that can read back its own secrets is a single table away from being the breach.
 */

/* -------------------------------------------------------------------------- */
/*  Identity                                                                  */
/* -------------------------------------------------------------------------- */

// The app's view of a person. Keycloak owns the credential; this owns everything the ERP
// needs to know about them — and `perm_version`, which is what makes a revocation take
// effect immediately instead of when a cache happens to expire.
export const appUser = pgTable(
  "app_user",
  {
    ...tenantScopedColumns,
    keycloakSub: uuid("keycloak_sub").notNull(),
    loginEmail: text("login_email").notNull(),
    fullName: text("full_name").notNull(),
    employeeRef: uuid("employee_ref"), // → HRM, logical ref
    homeCompanyRef: uuid("home_company_ref"), // → General
    defaultBranchRef: text("default_branch_ref"),
    authSource: text("auth_source").notNull().default("keycloak"),
    status: text("status").notNull().default("invited"), // invited | active | suspended | disabled
    mfaEnrolled: boolean("mfa_enrolled").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    // Bumped on ANY grant, role or scope change. Caches key on it.
    permVersion: integer("perm_version").notNull().default(1),
    accessReviewDue: date("access_review_due"),
  },
  (t) => [
    unique("uq_appuser_tenant_email").on(t.tenantId, t.loginEmail),
    unique("uq_appuser_kc_sub").on(t.keycloakSub),
    index("ix_appuser_tenant_status").on(t.tenantId, t.status),
  ],
);

// A session the app knows about, so it can be ended. Keycloak can end its own; this exists
// because "revoke this person's access now" must not depend on a second system being up.
export const appSession = pgTable(
  "app_session",
  {
    ...tenantScopedColumns,
    userId: uuid("user_id").notNull(), // intra-module FK -> app_user
    kcSessionId: text("kc_session_id"),
    tokenHash: text("token_hash").notNull(), // never the token itself
    ipAddress: text("ip_address"),
    deviceFingerprint: text("device_fingerprint"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: text("revoke_reason"), // logout | admin | role_revoked | incident
    mfaSatisfied: boolean("mfa_satisfied").notNull().default(false),
  },
  (t) => [index("ix_session_tenant_user").on(t.tenantId, t.userId)],
);

// CERT-In authentication telemetry. Retained 180 days minimum, India-resident. Every
// attempt, not only the failures — a successful login from a new country at 03:00 is the
// signal, and it is invisible if only failures are kept.
export const loginAttempt = pgTable(
  "login_attempt",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    loginEmail: text("login_email").notNull(),
    userId: uuid("user_id"),
    result: text("result").notNull(), // success | bad_credentials | locked | mfa_failed | unknown_user
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_loginattempt_tenant_time").on(t.tenantId, t.attemptedAt)],
);

/* -------------------------------------------------------------------------- */
/*  Authorisation: the catalogue, row scope, field masks                      */
/* -------------------------------------------------------------------------- */

// The privilege catalogue. A grant that references a permission not in here is a typo, and
// a typo grants nothing while looking exactly like a grant.
export const permissionCatalogue = pgTable(
  "permission_catalogue",
  {
    ...tenantScopedColumns,
    permission: text("permission").notNull(), // module.entity.action
    docType: text("doc_type").notNull(),
    action: text("action").notNull(),
    description: text("description").notNull(),
    isPrivileged: boolean("is_privileged").notNull().default(false),
  },
  (t) => [unique("uq_permcat_tenant_perm").on(t.tenantId, t.permission)],
);

// WHICH ROWS. Absence of a row here means no access — never all access.
export const userPermissionScope = pgTable(
  "user_permission_scope",
  {
    ...tenantScopedColumns,
    subject: uuid("subject").notNull(), // Keycloak sub — matches user_role.subject
    scopeDimension: text("scope_dimension").notNull(), // company|branch|warehouse|cost_center|department|plant
    scopeValueId: text("scope_value_id").notNull(),
    applyToDocType: text("apply_to_doc_type"), // null = every doctype
    isDefault: boolean("is_default").notNull().default(false),
    grantedBy: uuid("granted_by"),
    justification: text("justification"),
  },
  (t) => [
    unique("uq_userscope").on(t.tenantId, t.subject, t.scopeDimension, t.scopeValueId, t.applyToDocType),
    index("ix_userscope_tenant_subject").on(t.tenantId, t.subject),
  ],
);

// HOW MUCH OF EACH ROW. Applied on the way out, to the whole row, before it becomes JSON.
export const fieldPermission = pgTable(
  "field_permission",
  {
    ...tenantScopedColumns,
    roleId: uuid("role_id").notNull(), // intra-module FK -> role
    docType: text("doc_type").notNull(),
    fieldName: text("field_name").notNull(),
    access: text("access").notNull(), // hidden | masked | read_only | editable
    maskFormat: text("mask_format"), // last4 | initials | domain_only | amount_band
  },
  (t) => [unique("uq_fieldperm").on(t.tenantId, t.roleId, t.docType, t.fieldName)],
);

/* -------------------------------------------------------------------------- */
/*  Segregation of duties                                                     */
/* -------------------------------------------------------------------------- */

export const sodRule = pgTable(
  "sod_rule",
  {
    ...tenantScopedColumns,
    name: text("name").notNull(),
    roleACode: text("role_a_code").notNull(),
    roleBCode: text("role_b_code").notNull(),
    riskLevel: text("risk_level").notNull(), // critical | high | medium | low
    enforcement: text("enforcement").notNull().default("detect"), // prevent | warn | detect
    description: text("description").notNull(),
    compensatingControl: text("compensating_control"),
    sourceNote: text("source_note").notNull(),
  },
  (t) => [unique("uq_sodrule_pair").on(t.tenantId, t.roleACode, t.roleBCode)],
);

// A conflict found by a scan. Kept rather than recomputed, so "when did this start?" has
// an answer, and so an accepted-risk decision has something to attach to.
export const sodFinding = pgTable(
  "sod_finding",
  {
    ...tenantScopedColumns,
    ruleId: uuid("rule_id").notNull(),
    subject: uuid("subject").notNull(),
    subjectName: text("subject_name").notNull(),
    riskLevel: text("risk_level").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("open"), // open | accepted_risk | resolved
    // The deterministic sentence, always. The AI explanation is stored beside it, never
    // instead of it — so the record still reads correctly when the model is off.
    templateExplanation: text("template_explanation").notNull(),
    aiExplanation: text("ai_explanation"),
    aiGrounded: boolean("ai_grounded"),
    acceptedBy: uuid("accepted_by"),
    acceptedReason: text("accepted_reason"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_sodfinding_open").on(t.tenantId, t.ruleId, t.subject),
    index("ix_sodfinding_tenant_status").on(t.tenantId, t.status, t.riskLevel),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Audit chain proof                                                         */
/* -------------------------------------------------------------------------- */

export const auditAnchor = pgTable(
  "audit_anchor",
  {
    ...tenantScopedColumns,
    uptoSeq: integer("upto_seq").notNull(),
    anchorHash: text("anchor_hash").notNull(),
    anchoredAt: timestamp("anchored_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("uq_auditanchor").on(t.tenantId, t.uptoSeq)],
);

// The attestation. A verification that is not recorded proves nothing later — "we check
// the chain nightly" is a claim; a row per night is evidence.
export const chainVerification = pgTable(
  "chain_verification",
  {
    ...tenantScopedColumns,
    chainName: text("chain_name").notNull().default("audit_log"), // audit_log | ai_action_log
    fromSeq: integer("from_seq").notNull(),
    toSeq: integer("to_seq").notNull(),
    rowsChecked: integer("rows_checked").notNull(),
    intact: boolean("intact").notNull(),
    firstBreakSeq: integer("first_break_seq"),
    breakKind: text("break_kind").notNull().default("none"),
    message: text("message").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_chainverif_tenant_time").on(t.tenantId, t.chainName, t.verifiedAt)],
);

/* -------------------------------------------------------------------------- */
/*  Compliance: incidents, consent, data-principal requests                   */
/* -------------------------------------------------------------------------- */

export const securityIncident = pgTable(
  "security_incident",
  {
    ...tenantScopedColumns,
    incidentNo: text("incident_no").notNull(),
    title: text("title").notNull(),
    severity: text("severity").notNull(), // critical | high | medium | low
    category: text("category").notNull(), // one of the CERT-In categories, or other
    // Captured BEFORE anybody knows how bad it is — both statutory clocks run from here.
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    description: text("description").notNull(),
    piiAffected: boolean("pii_affected").notNull().default(false),
    dataPrincipalsEstimate: integer("data_principals_estimate"),
    certInReportable: boolean("cert_in_reportable").notNull().default(false),
    certInDueAt: timestamp("cert_in_due_at", { withTimezone: true }).notNull(),
    certInReportedAt: timestamp("cert_in_reported_at", { withTimezone: true }),
    certInReference: text("cert_in_reference"),
    dpdpBoardDueAt: timestamp("dpdp_board_due_at", { withTimezone: true }),
    dpdpBoardIntimatedAt: timestamp("dpdp_board_intimated_at", { withTimezone: true }),
    principalsNotifiedAt: timestamp("principals_notified_at", { withTimezone: true }),
    evidencePackRef: text("evidence_pack_ref"),
    status: text("status").notNull().default("open"), // open | contained | reported | closed
    containmentNote: text("containment_note"),
  },
  (t) => [
    unique("uq_incident_tenant_no").on(t.tenantId, t.incidentNo),
    index("ix_incident_tenant_status").on(t.tenantId, t.status, t.detectedAt),
  ],
);

export const consentRecord = pgTable(
  "consent_record",
  {
    ...tenantScopedColumns,
    dataPrincipalRef: text("data_principal_ref").notNull(),
    purposeCode: text("purpose_code").notNull(),
    // Employment data is processed under legitimate use (s.7), NOT consent. Recording it
    // as consent would imply it can be withdrawn, and payroll cannot stop because it was.
    basis: text("basis").notNull(), // consent | legitimate_use_employment
    givenAt: timestamp("given_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    via: text("via").notNull().default("direct"), // direct | consent_manager
    noticeVersion: text("notice_version"),
  },
  (t) => [index("ix_consent_tenant_principal").on(t.tenantId, t.dataPrincipalRef)],
);

export const dsrRequest = pgTable(
  "dsr_request",
  {
    ...tenantScopedColumns,
    requestNo: text("request_no").notNull(),
    requestType: text("request_type").notNull(), // access | correction | erasure
    dataPrincipalRef: text("data_principal_ref").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    dueAt: date("due_at").notNull(), // received + 90 days
    status: text("status").notNull().default("open"),
    resolution: jsonb("resolution"),
    statutoryHoldRefs: text("statutory_hold_refs"),
    handledBy: uuid("handled_by"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_dsr_tenant_no").on(t.tenantId, t.requestNo),
    index("ix_dsr_tenant_status").on(t.tenantId, t.status, t.dueAt),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Platform operations                                                       */
/* -------------------------------------------------------------------------- */

export const apiKey = pgTable(
  "api_key",
  {
    ...tenantScopedColumns,
    label: text("label").notNull(),
    keyPrefix: text("key_prefix").notNull(), // stored in clear so a leaked key is identifiable
    secretHash: text("secret_hash").notNull(), // the secret itself is shown exactly once
    scopes: jsonb("scopes").notNull().default([]),
    environment: text("environment").notNull().default("live"),
    rateLimitRpm: integer("rate_limit_rpm").notNull().default(60),
    ipAllowlist: jsonb("ip_allowlist").notNull().default([]),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    status: text("status").notNull().default("active"), // active | revoked | expired
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
  },
  (t) => [
    unique("uq_apikey_prefix").on(t.keyPrefix),
    index("ix_apikey_tenant_status").on(t.tenantId, t.status),
  ],
);

export const featureFlag = pgTable(
  "feature_flag",
  {
    ...tenantScopedColumns,
    flagKey: text("flag_key").notNull(),
    description: text("description").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    scope: text("scope").notNull().default("tenant"), // tenant | company | role
    scopeValue: text("scope_value"),
    environment: text("environment").notNull().default("live"),
  },
  (t) => [unique("uq_flag").on(t.tenantId, t.flagKey, t.environment, t.scopeValue)],
);

// Typed settings with STATUTORY FLOORS. A retention setting below its floor is refused by
// the service layer with the statute named, not silently clamped.
export const systemSetting = pgTable(
  "system_setting",
  {
    ...tenantScopedColumns,
    settingKey: text("setting_key").notNull(),
    valueType: text("value_type").notNull(), // int | text | bool | json
    value: text("value").notNull(),
    statutoryFloor: numeric("statutory_floor", { precision: 18, scale: 3 }),
    floorSource: text("floor_source"), // e.g. "MCA Rule 11(g)"
    isSecret: boolean("is_secret").notNull().default(false),
    description: text("description").notNull(),
  },
  (t) => [unique("uq_setting").on(t.tenantId, t.settingKey)],
);

export const licenceRecord = pgTable(
  "licence_record",
  {
    ...tenantScopedColumns,
    plan: text("plan").notNull(),
    namedSeats: integer("named_seats").notNull(),
    modules: jsonb("modules").notNull().default([]),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to").notNull(),
    // Soft enforcement on purpose: a plant does not stop because a licence lapsed on a
    // Friday. It warns, loudly and in the console, and keeps running.
    enforcement: text("enforcement").notNull().default("soft"),
  },
  (t) => [index("ix_licence_tenant_valid").on(t.tenantId, t.validTo)],
);

export const backupJob = pgTable(
  "backup_job",
  {
    ...tenantScopedColumns,
    name: text("name").notNull(),
    schedule: text("schedule").notNull(),
    target: text("target").notNull(), // s3://…  ap-south-1
    region: text("region").notNull().default("ap-south-1"),
    encryption: text("encryption").notNull().default("kms"),
    retentionPolicy: text("retention_policy").notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastRunStatus: text("last_run_status"),
    lastSizeBytes: numeric("last_size_bytes", { precision: 20, scale: 0 }),
    lastRestoreTestAt: timestamp("last_restore_test_at", { withTimezone: true }),
    // Set by the restore drill. A restore that silently breaks the audit chain has
    // destroyed the evidence it was meant to protect.
    restorePreservedChain: boolean("restore_preserved_chain"),
  },
  (t) => [unique("uq_backupjob_tenant_name").on(t.tenantId, t.name)],
);

// NTP traceability evidence — CERT-In requires synchronisation to NIC/NPL time.
export const timeSyncLog = pgTable(
  "time_sync_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    host: text("host").notNull(),
    source: text("source").notNull(), // samay1.nic.in | samay2.nic.in | fallback
    offsetMs: numeric("offset_ms", { precision: 12, scale: 3 }).notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ix_timesync_tenant_time").on(t.tenantId, t.checkedAt)],
);
