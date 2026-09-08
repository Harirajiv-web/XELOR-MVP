-- =============================================================================
-- 0028_csp — CUSTOMER SERVICE PORTAL (Module 11): the internet-facing surface.
--
-- Every other module in this suite is reached by an employee, through a VPN, with a
-- staff-realm token. This one is reached by a customer, from the public internet, with a
-- portal-realm token — and that single difference is the reason this migration looks the
-- way it does.
--
-- SIX guarantees are made HERE, in the database, and none of them depends on the
-- application layer remembering to add a WHERE clause:
--
--  (1) THE SECOND SCOPING DIMENSION. Every portal-reachable table carries
--      `customer_account_id` and a RESTRICTIVE policy on it, in ADDITION to the ordinary
--      permissive tenant policy. Postgres ANDs restrictive policies with the permissive
--      ones, so a portal session sees rows that are both this tenant's AND this customer's.
--      A BlueOrbit engineer holding a valid token and a correctly-guessed ticket id reads
--      nothing. A staff session leaves `app.customer_account_id` empty and the restrictive
--      policy is a no-op, so an agent sees every customer in their tenant, as they must.
--
--  (2) THE RESTRICTIVE POLICY CARRIES `WITH CHECK`, NOT ONLY `USING`. The blueprint's DDL
--      shows only USING, which fences reads. Without WITH CHECK a portal principal could
--      INSERT a ticket stamped with somebody else's account: the row would vanish from
--      their own view (so nothing would look wrong) and appear in the victim's. Writes are
--      fenced to the same account as reads.
--
--  (3) A CHILD ROW CANNOT CLAIM A DIFFERENT CUSTOMER FROM ITS TICKET. Comments,
--      attachments, events, pauses, complaints and CSAT rows reference the ticket by the
--      COMPOSITE key (id, customer_account_id). Postgres therefore refuses a comment whose
--      account does not match its ticket's — so the restrictive policy on the child cannot
--      be side-stepped by mislabelling the child, which is the one way an application bug
--      could have leaked a thread.
--
--  (4) A TICKET CANNOT BE PAUSED TWICE OVER THE SAME MINUTE. A btree_gist EXCLUDE
--      constraint over (tenant, ticket, tstzrange(paused_at, coalesce(resumed_at,
--      'infinity'))) makes overlapping pause intervals unrepresentable. Overlapping pauses
--      would have their minutes subtracted twice and the ticket would appear to have
--      consumed less of its SLA clock than it did — the quiet way an SLA report becomes
--      fiction.
--
--  (5) THE TIMELINE AND THE SECURITY LEDGER ARE APPEND-ONLY, at the grant AND at a
--      trigger. `csp_ticket_event` is what an SLA dispute is settled from and
--      `csp_abuse_event` is part of the CERT-In evidence pack; both would settle nothing
--      if they could be edited.
--
--  (6) A REPLY THAT HAS BEEN SENT IS FROZEN. Once a comment is public and sent, its body
--      is what the company said to the customer. Editing it afterwards would rewrite a
--      statement the customer has already read and quoted back.
--
-- KB visibility is RLS too, not merely a WHERE clause: a portal session sees published,
-- public articles and nothing else, whatever query reaches the database.
-- =============================================================================

-- Overlap exclusion over scalar equality columns needs btree_gist (already installed by
-- 0026; repeated because a migration must be readable on its own).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- Shared guard functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION csp_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only: % on % is not permitted', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

-- A sent public reply is a statement the company has made. The customer has read it, may
-- have quoted it, and may be relying on it. It is frozen; a correction is a NEW comment.
-- An unsent AI draft, by contrast, is freely editable — that is the entire point of it.
CREATE OR REPLACE FUNCTION csp_guard_comment() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ticket comments are never deleted; add a correcting comment instead'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.sent_at IS NOT NULL AND NEW.body IS DISTINCT FROM OLD.body THEN
    RAISE EXCEPTION 'comment % has been sent and its text is frozen', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  -- A public, non-draft comment is visible to the customer the moment it is written.
  IF OLD.visibility = 'public' AND OLD.author_type <> 'ai_draft'
     AND NEW.body IS DISTINCT FROM OLD.body THEN
    RAISE EXCEPTION 'comment % is public and its text is frozen', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A complaint whose CAPA is still open is not closed by an agent tidying their queue.
-- A manager may override, but only with a reason ON THE ROW — an override nobody can
-- read afterwards is indistinguishable from no control at all.
CREATE OR REPLACE FUNCTION csp_guard_complaint_close() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'complaints are never deleted (%)' , OLD.complaint_no
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
    IF NEW.capa_ref IS NOT NULL AND coalesce(NEW.capa_progress_pct, 0) < 100 THEN
      IF NEW.closure_override_by IS NULL OR NEW.closure_override_reason IS NULL THEN
        RAISE EXCEPTION
          'complaint % cannot close while CAPA % is at %%%: a manager override needs a recorded reason',
          OLD.complaint_no, NEW.capa_ref, coalesce(NEW.capa_progress_pct, 0)
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Configuration & routing
-- =============================================================================

CREATE TABLE csp_business_calendar (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid NOT NULL,
  is_active          boolean NOT NULL DEFAULT true,
  code               text NOT NULL,
  name               text NOT NULL,
  working_weekdays   jsonb NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  day_start_minutes  integer NOT NULL DEFAULT 540,
  day_end_minutes    integer NOT NULL DEFAULT 1080,
  holidays           jsonb NOT NULL DEFAULT '[]'::jsonb,
  utc_offset_minutes integer NOT NULL DEFAULT 330,
  CONSTRAINT uq_csp_calendar_code UNIQUE (tenant_id, code),
  CONSTRAINT ck_csp_calendar_window CHECK (day_end_minutes > day_start_minutes)
);
COMMENT ON TABLE csp_business_calendar IS
  'The service-desk working calendar. Business time is computed from this and nothing else. Lives in CSP only because the platform has no shared calendar master yet; the column shape matches BusinessCalendar in @ind-core/platform exactly, so the move to GENERAL is a rename.';

CREATE TABLE csp_team (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  code        text NOT NULL,
  name        text NOT NULL,
  email_alias text,
  CONSTRAINT uq_csp_team_code UNIQUE (tenant_id, code)
);

CREATE TABLE csp_team_member (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  team_id      uuid NOT NULL REFERENCES csp_team (id),
  employee_ref uuid NOT NULL,
  is_lead      boolean NOT NULL DEFAULT false,
  is_manager   boolean NOT NULL DEFAULT false,
  CONSTRAINT uq_csp_team_member UNIQUE (tenant_id, team_id, employee_ref)
);
COMMENT ON COLUMN csp_team_member.employee_ref IS
  'Logical reference to HRM employee. CSP stores no name, no contact detail, no grade.';

CREATE TABLE csp_ticket_category (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  code              text NOT NULL,
  parent_id         uuid REFERENCES csp_ticket_category (id),
  name              text NOT NULL,
  default_team_id   uuid REFERENCES csp_team (id),
  default_priority  text NOT NULL DEFAULT 'medium'
                      CHECK (default_priority IN ('low','medium','high','urgent')),
  is_portal_visible boolean NOT NULL DEFAULT true,
  creates_complaint boolean NOT NULL DEFAULT false,
  sort_order        smallint NOT NULL DEFAULT 0,
  CONSTRAINT uq_csp_category_code UNIQUE (tenant_id, code)
);
COMMENT ON COLUMN csp_ticket_category.code IS
  'The stable key the SLA policy and the AI triage baseline both match on. The display name may change without moving an SLA.';

CREATE TABLE csp_sla_policy (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  code              text NOT NULL,
  name              text NOT NULL,
  applies_to        text NOT NULL CHECK (applies_to IN ('contract','category','priority')),
  match_value       text NOT NULL,
  response_mins     integer NOT NULL CHECK (response_mins > 0),
  resolution_mins   integer NOT NULL CHECK (resolution_mins > 0),
  calendar_id       uuid NOT NULL REFERENCES csp_business_calendar (id),
  pause_on_pending  boolean NOT NULL DEFAULT true,
  escalation_matrix jsonb NOT NULL DEFAULT '[]'::jsonb,
  active            boolean NOT NULL DEFAULT true,
  CONSTRAINT uq_csp_sla_code UNIQUE (tenant_id, code),
  -- A resolution allowance shorter than the response allowance is not a strict SLA, it is
  -- a typo that breaches every ticket it touches the moment it is saved.
  CONSTRAINT ck_csp_sla_order CHECK (resolution_mins >= response_mins)
);
CREATE INDEX ix_csp_sla_match ON csp_sla_policy (tenant_id, applies_to, match_value);

CREATE TABLE csp_document_series (
  id         uuid PRIMARY KEY,
  tenant_id  uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  doc_type   text NOT NULL CHECK (doc_type IN ('ticket','complaint','spare_request')),
  prefix     text NOT NULL,
  fy_code    text NOT NULL,
  width      smallint NOT NULL DEFAULT 5,
  next_no    integer NOT NULL DEFAULT 1,
  CONSTRAINT uq_csp_series UNIQUE (tenant_id, doc_type, fy_code)
);
COMMENT ON TABLE csp_document_series IS
  'TKT-2627-00031 is a number a customer quotes on the phone, so it is allocated from a counter under a row lock — gapless and ordered — rather than derived from a uuid suffix.';

-- =============================================================================
-- Portal identity
-- =============================================================================

CREATE TABLE csp_portal_user (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  customer_account_id uuid NOT NULL,
  contact_ref         uuid,
  email               text NOT NULL,
  display_name        text NOT NULL,
  phone               text,
  role                text NOT NULL DEFAULT 'customer_user'
                        CHECK (role IN ('customer_user','customer_admin')),
  status              text NOT NULL DEFAULT 'invited'
                        CHECK (status IN ('invited','active','suspended','locked','deactivated')),
  keycloak_sub        text,
  keycloak_org_id     text,
  consent_record_id   uuid,
  consent_version     text,
  last_login_at       timestamptz,
  failed_login_count  smallint NOT NULL DEFAULT 0,
  locked_until        timestamptz,
  erased_at           timestamptz,
  CONSTRAINT uq_csp_portal_email UNIQUE (tenant_id, email),
  -- An active portal principal has accepted the DPDP notice. There is no path to an
  -- active account without a consent record, because the notice is the lawful basis.
  CONSTRAINT ck_csp_portal_consent
    CHECK (status <> 'active' OR consent_record_id IS NOT NULL OR erased_at IS NOT NULL)
);
CREATE INDEX ix_csp_portal_account ON csp_portal_user (tenant_id, customer_account_id);
COMMENT ON COLUMN csp_portal_user.customer_account_id IS
  'The source of the second scoping dimension. Minted server-side from the Keycloak organization the principal belongs to; never accepted from a request parameter, header or body.';
REVOKE DELETE ON csp_portal_user FROM app_user;

CREATE TABLE csp_portal_invite (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  customer_account_id uuid NOT NULL,
  email               text NOT NULL,
  contact_ref         uuid,
  token_hash          text NOT NULL,
  invited_role        text NOT NULL DEFAULT 'customer_user'
                        CHECK (invited_role IN ('customer_user','customer_admin')),
  keycloak_org_id     text,
  invited_by_ref      uuid NOT NULL,
  expires_at          timestamptz NOT NULL,
  accepted_at         timestamptz,
  revoked_at          timestamptz,
  CONSTRAINT uq_csp_invite_token UNIQUE (tenant_id, token_hash)
);
CREATE INDEX ix_csp_invite_account ON csp_portal_invite (tenant_id, customer_account_id);
COMMENT ON COLUMN csp_portal_invite.token_hash IS
  'Only the hash. An invite link is a bearer credential; storing it in the clear would make the table as sensitive as a password file.';
REVOKE DELETE ON csp_portal_invite FROM app_user;

-- =============================================================================
-- The case
-- =============================================================================

CREATE TABLE csp_ticket (
  id                       uuid PRIMARY KEY,
  tenant_id                uuid NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid NOT NULL,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid NOT NULL,
  is_active                boolean NOT NULL DEFAULT true,
  customer_account_id      uuid NOT NULL,
  ticket_no                text NOT NULL,
  contact_ref              uuid,
  portal_user_id           uuid REFERENCES csp_portal_user (id),
  product_serial_no        text,
  item_ref                 uuid,
  channel                  text NOT NULL DEFAULT 'portal'
                             CHECK (channel IN ('portal','phone','email','whatsapp')),
  subject                  text NOT NULL,
  description              text NOT NULL,
  category_id              uuid REFERENCES csp_ticket_category (id),
  priority                 text NOT NULL DEFAULT 'medium'
                             CHECK (priority IN ('low','medium','high','urgent')),
  severity                 text,
  status                   text NOT NULL DEFAULT 'new'
                             CHECK (status IN ('new','triaged','in_progress','pending_customer',
                                               'resolved','closed','reopened')),
  sla_policy_id            uuid REFERENCES csp_sla_policy (id),
  sla_calendar_id          uuid REFERENCES csp_business_calendar (id),
  sla_state                text NOT NULL DEFAULT 'on_track'
                             CHECK (sla_state IN ('on_track','at_risk','paused',
                                                  'breached_response','breached_resolution','met')),
  response_allowance_mins   integer,
  resolution_allowance_mins integer,
  first_response_due       timestamptz,
  first_responded_at       timestamptz,
  resolution_due           timestamptz,
  resolved_at              timestamptz,
  closed_at                timestamptz,
  escalation_fired         jsonb NOT NULL DEFAULT '[]'::jsonb,
  team_id                  uuid REFERENCES csp_team (id),
  owner_employee_ref       uuid,
  assigned_version         integer NOT NULL DEFAULT 0,
  complaint_id             uuid,
  entitlement_result       text CHECK (entitlement_result IS NULL OR entitlement_result IN
                             ('covered_warranty','covered_amc','partial','not_covered')),
  entitlement_checked_at   timestamptz,
  ai_triage                jsonb,
  reopen_count             smallint NOT NULL DEFAULT 0,
  reopened_after_csat      boolean NOT NULL DEFAULT false,
  linked_ticket_id         uuid REFERENCES csp_ticket (id),
  idempotency_key_hash     text,
  CONSTRAINT uq_csp_ticket_no UNIQUE (tenant_id, ticket_no),
  -- The composite key children point at. See guarantee (3) in the header.
  CONSTRAINT uq_csp_ticket_account UNIQUE (id, customer_account_id),
  -- A cached verdict without the moment it was reached is not evidence: coverage that
  -- expired last week must not be able to read as coverage today.
  CONSTRAINT ck_csp_entitlement_stamped
    CHECK ((entitlement_result IS NULL) = (entitlement_checked_at IS NULL)),
  CONSTRAINT ck_csp_closed_after_resolved
    CHECK (closed_at IS NULL OR resolved_at IS NULL OR closed_at >= resolved_at)
);
CREATE INDEX ix_ticket_queue       ON csp_ticket (tenant_id, status, team_id);
CREATE INDEX ix_ticket_portal_list ON csp_ticket (tenant_id, customer_account_id, created_at DESC);
CREATE INDEX ix_ticket_owner       ON csp_ticket (tenant_id, owner_employee_ref, status);
-- The SLA scanner's hot path: a partial index, because the scanner only ever asks about
-- the tickets that are in trouble, and the healthy majority should not be paged in.
CREATE INDEX ix_ticket_sla_scan    ON csp_ticket (tenant_id, sla_state, resolution_due)
  WHERE sla_state IN ('at_risk','breached_response');
CREATE UNIQUE INDEX uq_csp_ticket_idem ON csp_ticket (tenant_id, idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;
-- Full-text over what the customer actually wrote.
CREATE INDEX ix_ticket_fts ON csp_ticket
  USING GIN (to_tsvector('english', subject || ' ' || description));
COMMENT ON COLUMN csp_ticket.product_serial_no IS
  'Logical reference to the dispatched machine, stored as the text on the nameplate: Inventory does not yet carry a serial register in this prototype, and the warranty registry is keyed the same way.';
COMMENT ON COLUMN csp_ticket.ai_triage IS
  'A SUGGESTION from AI #3, never auto-applied: {suggested_category, suggested_priority, sentiment, confidence, model, rationale, accepted_by?, overridden_fields?[]}.';
REVOKE DELETE ON csp_ticket FROM app_user;

CREATE TABLE csp_ticket_pause (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  customer_account_id uuid NOT NULL,
  ticket_id           uuid NOT NULL,
  paused_at           timestamptz NOT NULL,
  resumed_at          timestamptz,
  reason              text NOT NULL DEFAULT 'pending_customer',
  CONSTRAINT fk_csp_pause_ticket FOREIGN KEY (ticket_id, customer_account_id)
    REFERENCES csp_ticket (id, customer_account_id),
  CONSTRAINT ck_csp_pause_window CHECK (resumed_at IS NULL OR resumed_at > paused_at),
  -- Guarantee (4): one ticket cannot be paused twice over the same minute.
  CONSTRAINT ex_csp_pause_overlap EXCLUDE USING gist (
    tenant_id WITH =, ticket_id WITH =,
    tstzrange(paused_at, coalesce(resumed_at, 'infinity'::timestamptz)) WITH &&
  )
);
CREATE INDEX ix_csp_pause_ticket ON csp_ticket_pause (tenant_id, ticket_id);
COMMENT ON TABLE csp_ticket_pause IS
  'The raw material an SLA verdict is recomputed from. The blueprint models these as a tstzrange[] on the ticket; a table is used instead because an array can hold two overlapping ranges and nothing notices — and doubly-subtracted minutes make a ticket look less consumed than it is.';
REVOKE DELETE ON csp_ticket_pause FROM app_user;

CREATE TABLE csp_ticket_comment (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  customer_account_id uuid NOT NULL,
  ticket_id           uuid NOT NULL,
  body                text NOT NULL,
  visibility          text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','internal')),
  author_type         text NOT NULL CHECK (author_type IN ('staff','portal','system','ai_draft')),
  author_ref          uuid,
  sent_at             timestamptz,
  sent_by_ref         uuid,
  ai_provenance       jsonb,
  CONSTRAINT fk_csp_comment_ticket FOREIGN KEY (ticket_id, customer_account_id)
    REFERENCES csp_ticket (id, customer_account_id),
  -- A draft that has been sent is no longer a draft: sending REWRITES author_type to
  -- 'staff' and stamps the sender. An ai_draft row with a sent_at is a contradiction.
  CONSTRAINT ck_csp_draft_unsent CHECK (author_type <> 'ai_draft' OR sent_at IS NULL),
  CONSTRAINT ck_csp_sent_by CHECK ((sent_at IS NULL) = (sent_by_ref IS NULL))
);
CREATE INDEX ix_csp_comment_ticket ON csp_ticket_comment (tenant_id, ticket_id, created_at);
CREATE TRIGGER trg_csp_comment_guard
  BEFORE UPDATE OR DELETE ON csp_ticket_comment
  FOR EACH ROW EXECUTE FUNCTION csp_guard_comment();
REVOKE DELETE ON csp_ticket_comment FROM app_user;

CREATE TABLE csp_ticket_attachment (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  customer_account_id uuid NOT NULL,
  ticket_id           uuid NOT NULL,
  comment_id          uuid REFERENCES csp_ticket_comment (id),
  file_name           text NOT NULL,
  mime_type           text NOT NULL,
  size_bytes          integer NOT NULL CHECK (size_bytes > 0),
  s3_key              text NOT NULL,
  scan_status         text NOT NULL DEFAULT 'pending'
                        CHECK (scan_status IN ('pending','clean','blocked')),
  uploaded_by_type    text NOT NULL CHECK (uploaded_by_type IN ('staff','portal')),
  uploaded_by_ref     uuid,
  CONSTRAINT fk_csp_attach_ticket FOREIGN KEY (ticket_id, customer_account_id)
    REFERENCES csp_ticket (id, customer_account_id)
);
CREATE INDEX ix_csp_attach_ticket ON csp_ticket_attachment (tenant_id, ticket_id);
COMMENT ON COLUMN csp_ticket_attachment.scan_status IS
  'Only `clean` is ever served. An unscanned upload is invisible rather than merely unlinked.';

CREATE TABLE csp_ticket_event (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  customer_account_id uuid NOT NULL,
  ticket_id           uuid NOT NULL,
  event_type          text NOT NULL,
  from_value          text,
  to_value            text,
  actor_type          text NOT NULL CHECK (actor_type IN ('staff','portal','system','ai')),
  actor_ref           uuid,
  detail              jsonb,
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_csp_event_ticket FOREIGN KEY (ticket_id, customer_account_id)
    REFERENCES csp_ticket (id, customer_account_id)
);
CREATE INDEX ix_csp_event_ticket ON csp_ticket_event (tenant_id, ticket_id, occurred_at);
CREATE TRIGGER trg_csp_event_append_only
  BEFORE UPDATE OR DELETE ON csp_ticket_event
  FOR EACH ROW EXECUTE FUNCTION csp_forbid_mutation();
REVOKE UPDATE, DELETE ON csp_ticket_event FROM app_user;
COMMENT ON TABLE csp_ticket_event IS
  'The table an SLA dispute is settled from. Append-only at the grant AND at a trigger — it would settle nothing if it could be edited.';

-- =============================================================================
-- Complaints & quality hand-off
-- =============================================================================

CREATE TABLE csp_complaint (
  id                      uuid PRIMARY KEY,
  tenant_id               uuid NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid NOT NULL,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid NOT NULL,
  is_active               boolean NOT NULL DEFAULT true,
  customer_account_id     uuid NOT NULL,
  complaint_no            text NOT NULL,
  ticket_id               uuid NOT NULL,
  product_serial_no       text,
  batch_ref               text,
  item_ref                uuid,
  failure_symptom         text NOT NULL,
  in_service_date         date,
  severity                text NOT NULL DEFAULT 'major'
                            CHECK (severity IN ('minor','major','critical')),
  disposition             text,
  status                  text NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open','investigation','corrective_action','closed')),
  qms_sync_status         text NOT NULL DEFAULT 'pending'
                            CHECK (qms_sync_status IN ('pending','sent','acknowledged','failed')),
  ncr_ref                 text,
  capa_ref                text,
  capa_progress_pct       smallint CHECK (capa_progress_pct IS NULL OR capa_progress_pct BETWEEN 0 AND 100),
  closed_at               timestamptz,
  closure_override_by     uuid,
  closure_override_reason text,
  CONSTRAINT uq_csp_complaint_no UNIQUE (tenant_id, complaint_no),
  CONSTRAINT uq_csp_complaint_ticket UNIQUE (tenant_id, ticket_id),
  CONSTRAINT fk_csp_complaint_ticket FOREIGN KEY (ticket_id, customer_account_id)
    REFERENCES csp_ticket (id, customer_account_id)
);
CREATE INDEX ix_csp_complaint_ticket ON csp_complaint (tenant_id, ticket_id);
CREATE TRIGGER trg_csp_complaint_guard
  BEFORE UPDATE OR DELETE ON csp_complaint
  FOR EACH ROW EXECUTE FUNCTION csp_guard_complaint_close();
REVOKE DELETE ON csp_complaint FROM app_user;
COMMENT ON COLUMN csp_complaint.ncr_ref IS
  'Logical reference to a QMS non-conformance report. The customer never sees it: the portal reads status through a label map ("Under investigation by Quality") that reveals neither the number nor the engineer.';

ALTER TABLE csp_ticket
  ADD CONSTRAINT fk_csp_ticket_complaint FOREIGN KEY (complaint_id) REFERENCES csp_complaint (id);

-- =============================================================================
-- Entitlement: warranty & AMC
-- =============================================================================

CREATE TABLE csp_warranty (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  customer_account_id uuid NOT NULL,
  serial_no           text NOT NULL,
  item_ref            uuid,
  warranty_type       text NOT NULL DEFAULT 'standard_12m',
  start_date          date NOT NULL,
  end_date            date NOT NULL,
  coverage_terms      text,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','void')),
  source              text NOT NULL DEFAULT 'auto_dispatch' CHECK (source IN ('auto_dispatch','manual')),
  sales_order_ref     text,
  dispatched_on       date,
  CONSTRAINT ck_csp_warranty_window CHECK (end_date >= start_date)
);
CREATE INDEX ix_csp_warranty_serial  ON csp_warranty (tenant_id, serial_no);
CREATE INDEX ix_csp_warranty_account ON csp_warranty (tenant_id, customer_account_id);
REVOKE DELETE ON csp_warranty FROM app_user;
COMMENT ON TABLE csp_warranty IS
  'Deliberately NOT unique on (tenant, serial): two live warranties on one serial is a data-entry error worth SEEING, and detectAnomalies() reports it for a human. A unique index would have silently refused the second dispatch instead.';

CREATE TABLE csp_amc_contract (
  id                      uuid PRIMARY KEY,
  tenant_id               uuid NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid NOT NULL,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid NOT NULL,
  is_active               boolean NOT NULL DEFAULT true,
  customer_account_id     uuid NOT NULL,
  contract_no             text NOT NULL,
  coverage_type           text NOT NULL CHECK (coverage_type IN ('comprehensive','non_comprehensive')),
  entitlements            jsonb NOT NULL DEFAULT '{}'::jsonb,
  start_date              date NOT NULL,
  end_date                date NOT NULL,
  renewal_date            date,
  annual_value            numeric(18,2),
  status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','expiring','expired','renewed','cancelled')),
  renewal_lead_emitted_at timestamptz,
  CONSTRAINT uq_csp_amc_no UNIQUE (tenant_id, contract_no),
  CONSTRAINT ck_csp_amc_window CHECK (end_date >= start_date),
  CONSTRAINT uq_csp_amc_account UNIQUE (id, customer_account_id)
);
CREATE INDEX ix_csp_amc_account ON csp_amc_contract (tenant_id, customer_account_id, status);
REVOKE DELETE ON csp_amc_contract FROM app_user;
COMMENT ON COLUMN csp_amc_contract.renewal_lead_emitted_at IS
  'Set when the T-60 renewal lead has gone to SMBD. Present so it goes ONCE, not nightly for two months — the difference between a lead and a nuisance.';

CREATE TABLE csp_amc_contract_asset (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  customer_account_id uuid NOT NULL,
  contract_id         uuid NOT NULL,
  serial_no           text NOT NULL,
  item_ref            uuid,
  site_label          text,
  CONSTRAINT uq_csp_amc_asset UNIQUE (tenant_id, contract_id, serial_no),
  CONSTRAINT fk_csp_amc_asset_contract FOREIGN KEY (contract_id, customer_account_id)
    REFERENCES csp_amc_contract (id, customer_account_id)
);

-- =============================================================================
-- Spare requests
-- =============================================================================

CREATE TABLE csp_spare_request (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  customer_account_id uuid NOT NULL,
  request_no          text NOT NULL,
  ticket_id           uuid,
  item_ref            uuid NOT NULL,
  item_code           text NOT NULL,
  qty                 numeric(12,3) NOT NULL CHECK (qty > 0),
  uom                 text NOT NULL DEFAULT 'nos',
  is_warranty         text NOT NULL DEFAULT 'not_covered'
                        CHECK (is_warranty IN ('covered_warranty','covered_amc','partial','not_covered')),
  unit_price          numeric(18,2),
  line_amount         numeric(18,2),
  ship_to_gstin       text,
  ship_to_address     text,
  status              text NOT NULL DEFAULT 'submitted'
                        CHECK (status IN ('submitted','quoted','reserved','fulfilled','closed','rejected')),
  reservation_ref     text,
  fulfilment_ref      text,
  CONSTRAINT uq_csp_spare_no UNIQUE (tenant_id, request_no),
  CONSTRAINT fk_csp_spare_ticket FOREIGN KEY (ticket_id, customer_account_id)
    REFERENCES csp_ticket (id, customer_account_id),
  -- A quote with no price is not a quote. Refusing it here is the difference between a
  -- customer seeing "₹1,08,000" and a customer seeing "—" and telephoning about it.
  CONSTRAINT ck_csp_spare_quoted
    CHECK (status <> 'quoted' OR is_warranty <> 'not_covered' OR unit_price IS NOT NULL)
);
CREATE INDEX ix_csp_spare_account ON csp_spare_request (tenant_id, customer_account_id, status);
REVOKE DELETE ON csp_spare_request FROM app_user;
COMMENT ON TABLE csp_spare_request IS
  'No quantity on hand, no bin, no valuation. CSP asks Inventory whether the part exists and reserves it through reservation_ref; it never reads or writes stock. is_warranty is the entitlement engine''s verdict copied on, not a checkbox the customer ticks.';

-- =============================================================================
-- Knowledge base
-- =============================================================================

CREATE TABLE csp_kb_article (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  article_code        text NOT NULL,
  title               text NOT NULL,
  body_md             text NOT NULL,
  category            text,
  product_model_tags  jsonb NOT NULL DEFAULT '[]'::jsonb,
  visibility          text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','public')),
  version             smallint NOT NULL DEFAULT 1,
  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','review','published','archived')),
  view_count          integer NOT NULL DEFAULT 0,
  helpful_count       integer NOT NULL DEFAULT 0,
  not_helpful_count   integer NOT NULL DEFAULT 0,
  published_at        timestamptz,
  author_employee_ref uuid,
  -- GENERATED, so an edited article cannot fall out of the index. A tsvector maintained
  -- by application code is a tsvector that is stale exactly when it matters.
  search_tsv          tsvector GENERATED ALWAYS AS
                        (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body_md,''))) STORED,
  -- Provisioned now (nullable) so the fast-follow RAG assistant is a backfill rather than
  -- a migration on a live table. 384 dims = the small sentence-transformer class.
  embedding           vector(384),
  CONSTRAINT uq_csp_kb_code UNIQUE (tenant_id, article_code),
  CONSTRAINT ck_csp_kb_published CHECK (status <> 'published' OR published_at IS NOT NULL)
);
CREATE INDEX ix_kb_tsv        ON csp_kb_article USING GIN (search_tsv);
CREATE INDEX ix_kb_title_trgm ON csp_kb_article USING GIN (title gin_trgm_ops);
-- Provisioned alongside the column; empty until the fast-follow embeds the corpus.
CREATE INDEX ix_kb_embedding  ON csp_kb_article USING hnsw (embedding vector_cosine_ops);

-- =============================================================================
-- CSAT
-- =============================================================================

CREATE TABLE csp_csat_survey (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  customer_account_id uuid NOT NULL,
  ticket_id           uuid NOT NULL,
  portal_user_id      uuid REFERENCES csp_portal_user (id),
  token_hash          text NOT NULL,
  sent_at             timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  responded_at        timestamptz,
  CONSTRAINT uq_csp_csat_ticket UNIQUE (tenant_id, ticket_id),
  CONSTRAINT uq_csp_csat_token  UNIQUE (tenant_id, token_hash),
  CONSTRAINT uq_csp_csat_survey_account UNIQUE (id, customer_account_id),
  CONSTRAINT fk_csp_csat_ticket FOREIGN KEY (ticket_id, customer_account_id)
    REFERENCES csp_ticket (id, customer_account_id)
);
COMMENT ON COLUMN csp_csat_survey.token_hash IS
  'A survey link is a bearer credential to write on a ticket, and is treated as one: hashed at rest, purged at 90 days.';

CREATE TABLE csp_csat_response (
  id                     uuid PRIMARY KEY,
  tenant_id              uuid NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid NOT NULL,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             uuid NOT NULL,
  is_active              boolean NOT NULL DEFAULT true,
  customer_account_id    uuid NOT NULL,
  survey_id              uuid NOT NULL,
  ticket_id              uuid NOT NULL,
  csat_score             smallint NOT NULL CHECK (csat_score BETWEEN 1 AND 5),
  comment                text,
  sentiment              text CHECK (sentiment IS NULL OR sentiment IN ('positive','neutral','negative')),
  followup_task_created  boolean NOT NULL DEFAULT false,
  -- One response per survey, enforced here rather than by the UI hiding a button.
  CONSTRAINT uq_csp_csat_response UNIQUE (tenant_id, survey_id),
  CONSTRAINT fk_csp_csat_response_survey FOREIGN KEY (survey_id, customer_account_id)
    REFERENCES csp_csat_survey (id, customer_account_id)
);
CREATE TRIGGER trg_csp_csat_append_only
  BEFORE UPDATE OR DELETE ON csp_csat_response
  FOR EACH ROW EXECUTE FUNCTION csp_forbid_mutation();
REVOKE UPDATE, DELETE ON csp_csat_response FROM app_user;
COMMENT ON TABLE csp_csat_response IS
  'Append-only. A satisfaction score that the organisation being scored can revise is not a measurement.';

-- =============================================================================
-- Abuse & security telemetry
-- =============================================================================

CREATE TABLE csp_abuse_event (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  event_type     text NOT NULL,
  principal_type text NOT NULL CHECK (principal_type IN ('portal','staff','anonymous')),
  principal_ref  text,
  ip             text,
  user_agent     text,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_abuse_time ON csp_abuse_event (tenant_id, occurred_at);
CREATE TRIGGER trg_csp_abuse_append_only
  BEFORE UPDATE OR DELETE ON csp_abuse_event
  FOR EACH ROW EXECUTE FUNCTION csp_forbid_mutation();
REVOKE UPDATE, DELETE ON csp_abuse_event FROM app_user;
COMMENT ON TABLE csp_abuse_event IS
  'Deliberately NOT scoped to a customer account: a principal probing for other customers'' tickets must appear in the tenant''s security view, not be hidden by the very isolation it is testing.';

-- =============================================================================
-- FORCE RLS — the ordinary permissive tenant policy on every table in this migration.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'csp_business_calendar','csp_team','csp_team_member','csp_ticket_category',
    'csp_sla_policy','csp_document_series','csp_portal_user','csp_portal_invite',
    'csp_ticket','csp_ticket_pause','csp_ticket_comment','csp_ticket_attachment',
    'csp_ticket_event','csp_complaint','csp_warranty','csp_amc_contract',
    'csp_amc_contract_asset','csp_spare_request','csp_kb_article','csp_csat_survey',
    'csp_csat_response','csp_abuse_event']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)', t);
  END LOOP;
END $$;

-- =============================================================================
-- THE SECOND DIMENSION — a RESTRICTIVE policy on every portal-reachable table.
--
-- Postgres evaluates policies as:  (OR of permissive)  AND  (AND of restrictive).
-- So this narrows, and can only ever narrow, what the tenant policy already allowed.
--
-- `NULLIF(..., '')` is doing the load-bearing work. `withTenant` sets the GUC to '' for a
-- staff session — explicitly, on every transaction — rather than leaving it unset, because
-- a pooled connection carrying a previous request's customer id would be precisely the
-- leak this exists to prevent. Empty resolves to NULL, the first disjunct is true, and the
-- policy is a no-op for staff. A portal session sets a real uuid and every row must match.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'csp_portal_user','csp_portal_invite','csp_ticket','csp_ticket_pause',
    'csp_ticket_comment','csp_ticket_attachment','csp_ticket_event','csp_complaint',
    'csp_warranty','csp_amc_contract','csp_amc_contract_asset','csp_spare_request',
    'csp_csat_survey','csp_csat_response']
  LOOP
    EXECUTE format(
      'CREATE POLICY customer_account_isolation ON %I AS RESTRICTIVE
         USING (NULLIF(current_setting(''app.customer_account_id'', true), '''') IS NULL
                OR customer_account_id = NULLIF(current_setting(''app.customer_account_id'', true), '''')::uuid)
         WITH CHECK (NULLIF(current_setting(''app.customer_account_id'', true), '''') IS NULL
                OR customer_account_id = NULLIF(current_setting(''app.customer_account_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;

-- The knowledge base has no customer account — its second dimension is PUBLICATION. A
-- portal session sees published, public articles; the internal complaint→NCR hand-off SOP
-- is invisible to it whatever query arrives. Same GUC, same fail-closed shape.
CREATE POLICY portal_visibility ON csp_kb_article AS RESTRICTIVE
  USING (NULLIF(current_setting('app.customer_account_id', true), '') IS NULL
         OR (visibility = 'public' AND status = 'published'))
  WITH CHECK (NULLIF(current_setting('app.customer_account_id', true), '') IS NULL);
