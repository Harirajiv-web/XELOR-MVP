-- =============================================================================
-- 0036_administration — ADMINISTRATION (Module 14): the control plane.
--
-- Identity, what people may do, what the system did, and what the law requires be kept.
-- Keycloak already authenticates and `audit_log` already chains; this is everything that
-- turns those primitives into something an auditor can work with.
--
-- SEVEN guarantees are made HERE, in the database:
--
--  (1) A ROW SCOPE CANNOT BE FORGED INTO UNRESTRICTED ACCESS. `user_permission_scope` has
--      no "all" value and no null value id — absence of a row means no access, and there
--      is deliberately no way to express "every row" in this table. Unrestricted access is
--      a role flag, granted explicitly, and therefore visible in a role listing.
--
--  (2) A FIELD MASK CANNOT BE A NO-OP. `access` is a closed set, and `mask_format` is
--      required whenever access is `masked`. A masked field with no format would fall
--      through to the raw value, which is the exact failure the mask existed to prevent.
--
--  (3) A SEGREGATION-OF-DUTIES RULE CANNOT PAIR A ROLE WITH ITSELF, and the pair is
--      stored in a canonical order with a UNIQUE on it — so (buyer, approver) and
--      (approver, buyer) cannot both exist and be maintained separately until they
--      disagree.
--
--  (4) AN ACCEPTED SoD RISK MUST NAME WHO ACCEPTED IT AND WHY. A CHECK ties
--      `accepted_by` and `accepted_reason` together. "Accepted risk" with no name on it
--      is how a control becomes a checkbox.
--
--  (5) A CHAIN VERIFICATION THAT FOUND A BREAK MUST SAY WHERE. A CHECK asserts
--      `intact = (first_break_seq IS NULL)`. An attestation recording a break with no
--      position is not evidence of anything.
--
--  (6) A REPORTABLE INCIDENT ALWAYS CARRIES ITS SIX-HOUR DEADLINE, computed from
--      DETECTION, and personal-data incidents carry the 72-hour Board deadline too. Both
--      are NOT NULL when they apply — a deadline that can be null is a deadline that gets
--      missed.
--
--  (7) AN API KEY'S SECRET IS NEVER STORED. Only `key_prefix` (clear, so a leaked key is
--      identifiable) and `secret_hash`. There is no column a secret could be read back
--      from, which is the only way to be sure nobody added one.
--
-- Note what is deliberately NOT enforced here: nothing prevents a `detect`-level SoD
-- conflict from existing. Blocking every classic conflict in a plant whose whole office is
-- four people stops the plant, and a control that stops the plant is switched off in week
-- two — after which nothing is controlled at all.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Existing RBAC tables gain the attributes the console needs.
-- ---------------------------------------------------------------------------

ALTER TABLE role ADD COLUMN IF NOT EXISTS description   text NOT NULL DEFAULT '';
ALTER TABLE role ADD COLUMN IF NOT EXISTS category      text NOT NULL DEFAULT 'functional';
-- A privileged role forces MFA and revokes sessions when it is removed.
ALTER TABLE role ADD COLUMN IF NOT EXISTS is_privileged boolean NOT NULL DEFAULT false;
-- Unrestricted row access is a deliberate, visible grant — never the absence of a scope.
ALTER TABLE role ADD COLUMN IF NOT EXISTS is_row_unrestricted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN role.is_row_unrestricted IS
  'Explicit grant of unrestricted row access. Guarantee (1): an unscoped user sees NOTHING; only this flag opens everything, and it is visible in any role listing.';

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE TABLE app_user (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid NOT NULL,
  is_active          boolean NOT NULL DEFAULT true,
  keycloak_sub       uuid NOT NULL,
  login_email        text NOT NULL,
  full_name          text NOT NULL,
  employee_ref       uuid,
  home_company_ref   uuid,
  default_branch_ref text,
  auth_source        text NOT NULL DEFAULT 'keycloak',
  status             text NOT NULL DEFAULT 'invited'
                       CHECK (status IN ('invited','active','suspended','disabled')),
  mfa_enrolled       boolean NOT NULL DEFAULT false,
  last_login_at      timestamptz,
  perm_version       integer NOT NULL DEFAULT 1 CHECK (perm_version >= 1),
  access_review_due  date,
  CONSTRAINT uq_appuser_tenant_email UNIQUE (tenant_id, login_email),
  CONSTRAINT uq_appuser_kc_sub UNIQUE (keycloak_sub)
);
CREATE INDEX ix_appuser_tenant_status ON app_user (tenant_id, status);
COMMENT ON TABLE app_user IS 'The app''s view of a person. No password or secret material — credentials live in Keycloak only.';
REVOKE DELETE ON app_user FROM app_user;

CREATE TABLE app_session (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  user_id             uuid NOT NULL REFERENCES app_user (id),
  kc_session_id       text,
  token_hash          text NOT NULL,
  ip_address          text,
  device_fingerprint  text,
  last_seen_at        timestamptz,
  expires_at          timestamptz NOT NULL,
  revoked_at          timestamptz,
  revoke_reason       text CHECK (revoke_reason IS NULL OR revoke_reason IN ('logout','admin','role_revoked','incident','expired')),
  mfa_satisfied       boolean NOT NULL DEFAULT false,
  -- A revocation without a reason is untraceable six months later, when somebody asks why
  -- a shift supervisor was logged out in the middle of a shift.
  CONSTRAINT ck_session_revoked CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL))
);
CREATE INDEX ix_session_tenant_user ON app_session (tenant_id, user_id);
CREATE INDEX ix_session_live ON app_session (tenant_id, user_id) WHERE revoked_at IS NULL;

CREATE TABLE login_attempt (
  id            bigserial PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  login_email   text NOT NULL,
  user_id       uuid,
  result        text NOT NULL CHECK (result IN ('success','bad_credentials','locked','mfa_failed','unknown_user')),
  ip_address    text,
  user_agent    text,
  attempted_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_loginattempt_tenant_time ON login_attempt (tenant_id, attempted_at DESC);
COMMENT ON TABLE login_attempt IS
  'CERT-In authentication telemetry, 180-day floor. EVERY attempt, not only failures — a successful login from a new country at 03:00 is the signal, and it is invisible if only failures are kept.';

-- ---------------------------------------------------------------------------
-- Authorisation
-- ---------------------------------------------------------------------------

CREATE TABLE permission_catalogue (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  permission    text NOT NULL,
  doc_type      text NOT NULL,
  -- Any lowercase verb, not the blueprint's closed 13. This CONSTRAINT ORIGINALLY LISTED
  -- THE 13 and it was wrong: 0037 immediately seeds `planning.mrp.run`, and 45 other
  -- permissions this system enforces use operational verbs (`post`, `confirm`, `decide`,
  -- `close`) that say what they guard. Migration 0039 sets out the full reasoning.
  --
  -- It is corrected HERE, at source, rather than only in 0039, because the migration set
  -- has to be replayable from an empty database — and with the closed list in place it was
  -- not: 0037 inserted a row 0036 forbade, and only 0039 lifted the ban. Every existing
  -- database had run them one at a time as they were written, so nothing failed until the
  -- first from-scratch rebuild, which stopped dead at 0037.
  action        text NOT NULL,
  description   text NOT NULL,
  is_privileged boolean NOT NULL DEFAULT false,
  CONSTRAINT uq_permcat_tenant_perm UNIQUE (tenant_id, permission),
  -- module.entity.action, lowercase. A misspelt permission grants nothing while looking
  -- exactly like a grant, so the shape is enforced where somebody is still looking.
  CONSTRAINT ck_permcat_shape CHECK (permission ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z_]+$')
);

CREATE TABLE user_permission_scope (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  subject           uuid NOT NULL,
  scope_dimension   text NOT NULL CHECK (scope_dimension IN ('company','branch','warehouse','cost_center','department','plant')),
  -- Guarantee (1): NOT NULL and no sentinel. There is no way to write "every row" here.
  scope_value_id    text NOT NULL CHECK (length(trim(scope_value_id)) > 0 AND scope_value_id NOT IN ('*','all','ALL')),
  apply_to_doc_type text,
  is_default        boolean NOT NULL DEFAULT false,
  granted_by        uuid,
  justification     text,
  CONSTRAINT uq_userscope UNIQUE (tenant_id, subject, scope_dimension, scope_value_id, apply_to_doc_type)
);
CREATE INDEX ix_userscope_tenant_subject ON user_permission_scope (tenant_id, subject);

CREATE TABLE field_permission (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  role_id      uuid NOT NULL REFERENCES role (id),
  doc_type     text NOT NULL,
  field_name   text NOT NULL,
  access       text NOT NULL CHECK (access IN ('hidden','masked','read_only','editable')),
  mask_format  text CHECK (mask_format IS NULL OR mask_format IN ('last4','initials','domain_only','amount_band','redact')),
  CONSTRAINT uq_fieldperm UNIQUE (tenant_id, role_id, doc_type, field_name),
  -- Guarantee (2): a masked field with no format falls through to the raw value, which is
  -- exactly the failure the mask existed to prevent.
  CONSTRAINT ck_fieldperm_mask CHECK (access <> 'masked' OR mask_format IS NOT NULL)
);

-- ---------------------------------------------------------------------------
-- Segregation of duties
-- ---------------------------------------------------------------------------

CREATE TABLE sod_rule (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  name                  text NOT NULL,
  role_a_code           text NOT NULL,
  role_b_code           text NOT NULL,
  risk_level            text NOT NULL CHECK (risk_level IN ('critical','high','medium','low')),
  enforcement           text NOT NULL DEFAULT 'detect' CHECK (enforcement IN ('prevent','warn','detect')),
  description           text NOT NULL,
  compensating_control  text,
  source_note           text NOT NULL,
  -- Guarantee (3). A role cannot conflict with itself, and the canonical ordering stops
  -- (a,b) and (b,a) existing as two rules that drift apart until they disagree.
  CONSTRAINT ck_sodrule_distinct CHECK (role_a_code <> role_b_code),
  CONSTRAINT ck_sodrule_canonical CHECK (role_a_code < role_b_code),
  CONSTRAINT uq_sodrule_pair UNIQUE (tenant_id, role_a_code, role_b_code)
);

CREATE TABLE sod_finding (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  rule_id               uuid NOT NULL REFERENCES sod_rule (id),
  subject               uuid NOT NULL,
  subject_name          text NOT NULL,
  risk_level            text NOT NULL CHECK (risk_level IN ('critical','high','medium','low')),
  detected_at           timestamptz NOT NULL DEFAULT now(),
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted_risk','resolved')),
  template_explanation  text NOT NULL,
  ai_explanation        text,
  ai_grounded           boolean,
  accepted_by           uuid,
  accepted_reason       text,
  resolved_at           timestamptz,
  CONSTRAINT uq_sodfinding UNIQUE (tenant_id, rule_id, subject),
  -- Guarantee (4). "Accepted risk" with no name on it is how a control becomes a checkbox.
  CONSTRAINT ck_sodfinding_accept CHECK (status <> 'accepted_risk' OR (accepted_by IS NOT NULL AND accepted_reason IS NOT NULL)),
  -- An AI explanation is only ever stored ALONGSIDE the deterministic sentence, and only
  -- when the grounding gate passed. An ungrounded explanation is not kept at all.
  CONSTRAINT ck_sodfinding_ai CHECK (ai_explanation IS NULL OR ai_grounded = true)
);
CREATE INDEX ix_sodfinding_tenant_status ON sod_finding (tenant_id, status, risk_level);

-- ---------------------------------------------------------------------------
-- Audit chain proof
-- ---------------------------------------------------------------------------

CREATE TABLE audit_anchor (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  upto_seq     integer NOT NULL CHECK (upto_seq >= 0),
  anchor_hash  char(64) NOT NULL,
  anchored_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_auditanchor UNIQUE (tenant_id, upto_seq)
);

CREATE TABLE chain_verification (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  chain_name      text NOT NULL DEFAULT 'audit_log' CHECK (chain_name IN ('audit_log','ai_action_log')),
  from_seq        integer NOT NULL,
  to_seq          integer NOT NULL,
  rows_checked    integer NOT NULL CHECK (rows_checked >= 0),
  intact          boolean NOT NULL,
  first_break_seq integer,
  break_kind      text NOT NULL DEFAULT 'none' CHECK (break_kind IN ('none','hash_mismatch','link_mismatch','sequence_gap')),
  message         text NOT NULL,
  verified_at     timestamptz NOT NULL DEFAULT now(),
  -- Guarantee (5). An attestation recording a break with no position is not evidence.
  CONSTRAINT ck_chainverif_break CHECK (intact = (first_break_seq IS NULL)),
  CONSTRAINT ck_chainverif_kind  CHECK (intact = (break_kind = 'none'))
);
CREATE INDEX ix_chainverif_tenant_time ON chain_verification (tenant_id, chain_name, verified_at DESC);
COMMENT ON TABLE chain_verification IS
  'Attestations. "We verify the chain nightly" is a claim; a row per night is evidence.';

-- ---------------------------------------------------------------------------
-- Compliance
-- ---------------------------------------------------------------------------

CREATE TABLE security_incident (
  id                        uuid PRIMARY KEY,
  tenant_id                 uuid NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid NOT NULL,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid NOT NULL,
  is_active                 boolean NOT NULL DEFAULT true,
  incident_no               text NOT NULL,
  title                     text NOT NULL,
  severity                  text NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  category                  text NOT NULL,
  detected_at               timestamptz NOT NULL,
  description               text NOT NULL,
  pii_affected              boolean NOT NULL DEFAULT false,
  data_principals_estimate  integer CHECK (data_principals_estimate IS NULL OR data_principals_estimate >= 0),
  cert_in_reportable        boolean NOT NULL DEFAULT false,
  cert_in_due_at            timestamptz NOT NULL,
  cert_in_reported_at       timestamptz,
  cert_in_reference         text,
  dpdp_board_due_at         timestamptz,
  dpdp_board_intimated_at   timestamptz,
  principals_notified_at    timestamptz,
  evidence_pack_ref         text,
  status                    text NOT NULL DEFAULT 'open' CHECK (status IN ('open','contained','reported','closed')),
  containment_note          text,
  CONSTRAINT uq_incident_tenant_no UNIQUE (tenant_id, incident_no),
  -- Guarantee (6). Both clocks run from DETECTION and in PARALLEL — the six-hour report is
  -- not a prerequisite for the 72-hour intimation, and treating them as a pipeline is how
  -- the second deadline is missed while the first is being handled.
  CONSTRAINT ck_incident_certin_clock CHECK (cert_in_due_at = detected_at + interval '6 hours'),
  CONSTRAINT ck_incident_dpdp_clock CHECK (
    (pii_affected = false AND dpdp_board_due_at IS NULL)
    OR (pii_affected = true AND dpdp_board_due_at = detected_at + interval '72 hours')),
  -- A reported incident carries the reference the regulator gave back.
  CONSTRAINT ck_incident_reported CHECK (cert_in_reported_at IS NULL OR cert_in_reference IS NOT NULL)
);
CREATE INDEX ix_incident_tenant_status ON security_incident (tenant_id, status, detected_at DESC);
REVOKE DELETE ON security_incident FROM app_user;

CREATE TABLE consent_record (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  data_principal_ref  text NOT NULL,
  purpose_code        text NOT NULL,
  basis               text NOT NULL CHECK (basis IN ('consent','legitimate_use_employment')),
  given_at            timestamptz,
  withdrawn_at        timestamptz,
  via                 text NOT NULL DEFAULT 'direct' CHECK (via IN ('direct','consent_manager')),
  notice_version      text,
  -- Consent that was never given cannot be withdrawn, and employment data processed under
  -- legitimate use (s.7) is not withdrawable at all — recording it as consent would imply
  -- payroll stops when somebody clicks withdraw.
  CONSTRAINT ck_consent_given CHECK (basis <> 'consent' OR given_at IS NOT NULL),
  CONSTRAINT ck_consent_withdraw CHECK (withdrawn_at IS NULL OR (basis = 'consent' AND given_at IS NOT NULL AND withdrawn_at >= given_at))
);
CREATE INDEX ix_consent_tenant_principal ON consent_record (tenant_id, data_principal_ref);
REVOKE DELETE ON consent_record FROM app_user;

CREATE TABLE dsr_request (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  request_no           text NOT NULL,
  request_type         text NOT NULL CHECK (request_type IN ('access','correction','erasure')),
  data_principal_ref   text NOT NULL,
  received_at          timestamptz NOT NULL,
  due_at               date NOT NULL,
  status               text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','in_progress','fulfilled','refused_statutory_hold')),
  resolution           jsonb,
  statutory_hold_refs  text,
  handled_by           uuid,
  closed_at            timestamptz,
  CONSTRAINT uq_dsr_tenant_no UNIQUE (tenant_id, request_no),
  CONSTRAINT ck_dsr_due CHECK (due_at = (received_at AT TIME ZONE 'UTC')::date + 90),
  -- A refusal must name the obligation it is refusing under. "Refused" alone is what a
  -- regulator asks about first.
  CONSTRAINT ck_dsr_refusal CHECK (status <> 'refused_statutory_hold' OR statutory_hold_refs IS NOT NULL)
);
CREATE INDEX ix_dsr_tenant_status ON dsr_request (tenant_id, status, due_at);
REVOKE DELETE ON dsr_request FROM app_user;

-- ---------------------------------------------------------------------------
-- Platform operations
-- ---------------------------------------------------------------------------

CREATE TABLE api_key (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  label           text NOT NULL,
  key_prefix      text NOT NULL,
  secret_hash     text NOT NULL,
  scopes          jsonb NOT NULL DEFAULT '[]'::jsonb,
  environment     text NOT NULL DEFAULT 'live' CHECK (environment IN ('live','test')),
  rate_limit_rpm  integer NOT NULL DEFAULT 60 CHECK (rate_limit_rpm > 0),
  ip_allowlist    jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at      timestamptz,
  last_used_at    timestamptz,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  revoked_at      timestamptz,
  revoked_reason  text,
  CONSTRAINT uq_apikey_prefix UNIQUE (key_prefix),
  -- Guarantee (7): a key with no scopes can do nothing, and is therefore a mistake worth
  -- refusing at creation rather than debugging at 2 a.m. on a shop floor.
  CONSTRAINT ck_apikey_scoped CHECK (jsonb_array_length(scopes) > 0),
  CONSTRAINT ck_apikey_revoked CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
  CONSTRAINT ck_apikey_revoke_reason CHECK (revoked_at IS NULL OR revoked_reason IS NOT NULL)
);
CREATE INDEX ix_apikey_tenant_status ON api_key (tenant_id, status);
COMMENT ON TABLE api_key IS
  'The secret is NEVER stored — only key_prefix (clear, so a leaked key is identifiable) and secret_hash. There is deliberately no column a secret could be read back from.';

CREATE TABLE feature_flag (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  flag_key     text NOT NULL,
  description  text NOT NULL,
  enabled      boolean NOT NULL DEFAULT false,
  scope        text NOT NULL DEFAULT 'tenant' CHECK (scope IN ('tenant','company','role')),
  scope_value  text,
  environment  text NOT NULL DEFAULT 'live',
  CONSTRAINT uq_flag UNIQUE (tenant_id, flag_key, environment, scope_value),
  CONSTRAINT ck_flag_scope CHECK (scope = 'tenant' OR scope_value IS NOT NULL)
);

CREATE TABLE system_setting (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  setting_key      text NOT NULL,
  value_type       text NOT NULL CHECK (value_type IN ('int','text','bool','json')),
  value            text NOT NULL,
  statutory_floor  numeric(18,3),
  floor_source     text,
  is_secret        boolean NOT NULL DEFAULT false,
  description      text NOT NULL,
  CONSTRAINT uq_setting UNIQUE (tenant_id, setting_key),
  -- A floor with no citation is a number somebody guessed.
  CONSTRAINT ck_setting_floor_cited CHECK (statutory_floor IS NULL OR floor_source IS NOT NULL),
  -- The floor is enforced in the DATABASE as well as the service layer, because a floor
  -- that only one code path checks is a floor until somebody writes a second code path.
  CONSTRAINT ck_setting_floor_met CHECK (
    statutory_floor IS NULL OR value_type <> 'int' OR value::numeric >= statutory_floor)
);

CREATE TABLE licence_record (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  plan         text NOT NULL,
  named_seats  integer NOT NULL CHECK (named_seats > 0),
  modules      jsonb NOT NULL DEFAULT '[]'::jsonb,
  valid_from   date NOT NULL,
  valid_to     date NOT NULL,
  enforcement  text NOT NULL DEFAULT 'soft' CHECK (enforcement IN ('soft','hard')),
  CONSTRAINT ck_licence_window CHECK (valid_to > valid_from)
);
CREATE INDEX ix_licence_tenant_valid ON licence_record (tenant_id, valid_to);

CREATE TABLE backup_job (
  id                        uuid PRIMARY KEY,
  tenant_id                 uuid NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid NOT NULL,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid NOT NULL,
  is_active                 boolean NOT NULL DEFAULT true,
  name                      text NOT NULL,
  schedule                  text NOT NULL,
  target                    text NOT NULL,
  region                    text NOT NULL DEFAULT 'ap-south-1',
  encryption                text NOT NULL DEFAULT 'kms',
  retention_policy          text NOT NULL,
  last_run_at               timestamptz,
  last_run_status           text,
  last_size_bytes           numeric(20,0),
  last_restore_test_at      timestamptz,
  restore_preserved_chain   boolean,
  CONSTRAINT uq_backupjob_tenant_name UNIQUE (tenant_id, name),
  -- Data residency is a contractual claim, so it is a constraint rather than a default.
  CONSTRAINT ck_backup_region CHECK (region IN ('ap-south-1','ap-south-2'))
);
COMMENT ON COLUMN backup_job.restore_preserved_chain IS
  'Set by the restore drill. A restore that silently breaks the audit chain has destroyed the evidence the backup existed to protect.';

CREATE TABLE time_sync_log (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  host        text NOT NULL,
  source      text NOT NULL,
  offset_ms   numeric(12,3) NOT NULL,
  checked_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_timesync_tenant_time ON time_sync_log (tenant_id, checked_at DESC);

-- =============================================================================
-- FORCE RLS on every tenant-scoped table in this migration.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_user','app_session','login_attempt','permission_catalogue','user_permission_scope',
    'field_permission','sod_rule','sod_finding','audit_anchor','chain_verification',
    'security_incident','consent_record','dsr_request','api_key','feature_flag',
    'system_setting','licence_record','backup_job','time_sync_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)', t);
  END LOOP;
END $$;
