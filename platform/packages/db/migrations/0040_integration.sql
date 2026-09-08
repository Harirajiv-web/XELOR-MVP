-- =============================================================================
-- 0040_integration — INTEGRATION (Module 15): the edge of the system.
--
-- Everything here talks to something we do not control. SEVEN guarantees are made HERE, in
-- the database, and each one exists because the alternative fails quietly:
--
--  (1) NO SECRET IS STORED IN THE CLEAR. `credential` holds a KMS-wrapped data key and a
--      ciphertext reference. There is deliberately no plaintext column, which is the only
--      way to be certain nobody added one later.
--
--  (2) AN IRN CHAIN IS UNIQUE PER DOCUMENT. UNIQUE (tenant, gstin, doc_type, invoice_ref,
--      fy). Two IRN rows for one invoice means two filings, and a duplicate statutory
--      filing is visible to a regulator and cannot be quietly withdrawn.
--
--  (3) A "GENERATED" IRN MUST HAVE AN IRN, and a reported one must say whether it made the
--      30-day window. A status that can disagree with its own fields is how a compliance
--      dashboard shows green over a problem.
--
--  (4) THE 30-DAY WINDOW IS COMPUTED, NOT TYPED. A CHECK ties `window_deadline_at` to
--      `doc_date + 30 days` whenever the window applies. That deadline is a cliff — past
--      it the portal refuses the invoice permanently — so it may not be a free-text field
--      somebody can fat-finger.
--
--  (5) AN E-WAY BILL REMEMBERS WHICH PORTAL MADE IT. `portal_used` is NOT NULL. A bill
--      generated on the secondary portal must be cancelled on the secondary portal, and
--      losing that fact is how a cancellation silently fails while the truck is moving.
--
--  (6) A DEAD-LETTERED MESSAGE ALWAYS CARRIES ITS TRIAGE. `error_category`, `severity` and
--      `triage_action` are NOT NULL — the queue's whole value is that every row already
--      says what a person should do about it.
--
--  (7) A RESOLVED DEAD LETTER MUST SAY HOW. A CHECK ties `resolved_at` to a
--      `resolution_note`. "Resolved" with no note is how the same failure is diagnosed
--      from scratch three months later.
--
-- Note what is deliberately NOT enforced: nothing stops a `fake` adapter in production.
-- That is a running mode, not a mistake — it is how a drill, a demo and a chaos exercise
-- happen without touching a government sandbox, and forbidding it would mean the only way
-- to rehearse an outage is to cause one.
-- =============================================================================

CREATE TABLE connector (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  code          text NOT NULL,
  name          text NOT NULL,
  category      text NOT NULL CHECK (category IN ('statutory','bank','accounting','hr_device','ot','generic')),
  protocol      text NOT NULL CHECK (protocol IN ('https','sftp','mqtt','file')),
  direction     text NOT NULL CHECK (direction IN ('inbound','outbound','bidirectional')),
  version       text NOT NULL DEFAULT '1',
  config_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  capabilities  jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        text NOT NULL DEFAULT 'available',
  CONSTRAINT uq_connector_tenant_code UNIQUE (tenant_id, code)
);

CREATE TABLE credential (
  id                     uuid PRIMARY KEY,
  tenant_id              uuid NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid NOT NULL,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             uuid NOT NULL,
  is_active              boolean NOT NULL DEFAULT true,
  label                  text NOT NULL,
  credential_type        text NOT NULL CHECK (credential_type IN ('api_key','basic','oauth2','sftp_key','mtls','hmac_secret')),
  encrypted_data_key     text NOT NULL,
  ciphertext_ref         text NOT NULL,
  key_version            integer NOT NULL DEFAULT 1 CHECK (key_version >= 1),
  rotation_policy_days   integer CHECK (rotation_policy_days IS NULL OR rotation_policy_days > 0),
  expires_at             timestamptz,
  last_rotated_at        timestamptz,
  last_used_at           timestamptz,
  CONSTRAINT uq_credential_tenant_label UNIQUE (tenant_id, label)
);
COMMENT ON TABLE credential IS
  'Guarantee (1): KMS envelope only. There is deliberately no plaintext column — the only way to be sure nobody added one.';
REVOKE DELETE ON credential FROM app_user;

CREATE TABLE connection (
  id                      uuid PRIMARY KEY,
  tenant_id               uuid NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid NOT NULL,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid NOT NULL,
  is_active               boolean NOT NULL DEFAULT true,
  connector_id            uuid NOT NULL REFERENCES connector (id),
  name                    text NOT NULL,
  environment             text NOT NULL DEFAULT 'uat' CHECK (environment IN ('dev','uat','prod')),
  adapter_mode            text NOT NULL DEFAULT 'fake' CHECK (adapter_mode IN ('real','fake')),
  endpoint_url            text,
  secondary_endpoint_url  text,
  auth_type               text NOT NULL DEFAULT 'none',
  credential_id           uuid REFERENCES credential (id),
  config                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  health_status           text NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('healthy','degraded','down','unknown')),
  circuit_state           text NOT NULL DEFAULT 'closed' CHECK (circuit_state IN ('closed','open','half_open')),
  consecutive_failures    integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  consecutive_successes   integer NOT NULL DEFAULT 0 CHECK (consecutive_successes >= 0),
  circuit_opened_at       timestamptz,
  last_health_check_at    timestamptz,
  CONSTRAINT uq_connection_tenant_name UNIQUE (tenant_id, name),
  -- An open circuit without the moment it opened cannot be half-opened on schedule; it
  -- would stay open forever, which turns a protective measure into an outage.
  CONSTRAINT ck_connection_circuit CHECK ((circuit_state = 'open') = (circuit_opened_at IS NOT NULL)),
  -- A real connection needs somewhere to connect to. A fake one deliberately does not.
  CONSTRAINT ck_connection_endpoint CHECK (adapter_mode = 'fake' OR endpoint_url IS NOT NULL)
);

CREATE TABLE integration_flow (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  code                  text NOT NULL,
  name                  text NOT NULL,
  trigger_type          text NOT NULL CHECK (trigger_type IN ('event','schedule','manual','inbound')),
  trigger_config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_connection_id  uuid REFERENCES connection (id),
  target_connection_id  uuid REFERENCES connection (id),
  canonical_entity      text NOT NULL,
  version               integer NOT NULL DEFAULT 1,
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','retired')),
  pause_reason          text,
  retry_policy          jsonb NOT NULL DEFAULT '{}'::jsonb,
  sla_ms                integer CHECK (sla_ms IS NULL OR sla_ms > 0),
  is_statutory          boolean NOT NULL DEFAULT false,
  CONSTRAINT uq_flow_tenant_code UNIQUE (tenant_id, code),
  -- A paused flow with no reason is one nobody dares restart.
  CONSTRAINT ck_flow_pause CHECK (status <> 'paused' OR pause_reason IS NOT NULL)
);

CREATE TABLE field_mapping (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  flow_id         uuid NOT NULL REFERENCES integration_flow (id),
  seq             integer NOT NULL CHECK (seq > 0),
  source_path     text NOT NULL,
  canonical_path  text NOT NULL,
  target_path     text,
  transform_name  text CHECK (transform_name IS NULL OR transform_name IN
                    ('trim','upper','lower','digits_only','to_number','to_iso_date','paise_to_rupees','rupees_to_paise','boolean_yn')),
  default_value   text,
  is_required     boolean NOT NULL DEFAULT false,
  lookup_table    text CHECK (lookup_table IS NULL OR lookup_table IN ('uqc_codes','gst_state_codes','tally_ledger_map')),
  CONSTRAINT uq_fieldmap_flow_seq UNIQUE (tenant_id, flow_id, seq)
);

CREATE TABLE message_log (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  flow_id           uuid NOT NULL REFERENCES integration_flow (id),
  correlation_id    text NOT NULL,
  direction         text NOT NULL CHECK (direction IN ('inbound','outbound')),
  entity_ref        text,
  status            text NOT NULL CHECK (status IN ('pending','in_flight','success','failed','dead_lettered')),
  latency_ms        integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  payload_redacted  jsonb,
  error_code        text,
  error_message     text,
  attempt_count     integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ts                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_msglog_tenant_corr    ON message_log (tenant_id, correlation_id);
CREATE INDEX ix_msglog_tenant_flow_ts ON message_log (tenant_id, flow_id, ts DESC);
REVOKE DELETE ON message_log FROM app_user;

CREATE TABLE delivery_attempt (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  message_log_id       uuid REFERENCES message_log (id),
  webhook_delivery_id  uuid,
  attempt_no           integer NOT NULL CHECK (attempt_no >= 1),
  started_at           timestamptz NOT NULL DEFAULT now(),
  finished_at          timestamptz,
  outcome              text NOT NULL CHECK (outcome IN ('success','retryable','fatal')),
  error_category       text CHECK (error_category IS NULL OR error_category IN
                         ('validation','auth','transform','timeout','rate_limit','downstream','unknown')),
  response_code        integer,
  error_detail         text,
  next_retry_at        timestamptz,
  -- An attempt belongs to a message or a webhook delivery, never to both and never to
  -- neither: an orphaned attempt cannot be traced back to anything.
  CONSTRAINT ck_attempt_parent CHECK ((message_log_id IS NULL) <> (webhook_delivery_id IS NULL))
);
CREATE INDEX ix_attempt_tenant_msg ON delivery_attempt (tenant_id, message_log_id);
REVOKE DELETE ON delivery_attempt FROM app_user;

CREATE TABLE dead_letter (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  flow_id               uuid NOT NULL REFERENCES integration_flow (id),
  correlation_id        text NOT NULL,
  source_ref            text,
  -- Guarantee (6): the queue's whole value is that every row says what to do about it.
  error_category        text NOT NULL CHECK (error_category IN
                          ('validation','auth','transform','timeout','rate_limit','downstream','unknown')),
  triage_action         text NOT NULL,
  severity              text NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  replayable            boolean NOT NULL DEFAULT false,
  side_effect_possible  boolean NOT NULL DEFAULT false,
  is_statutory          boolean NOT NULL DEFAULT false,
  payload_redacted      jsonb,
  attempts              integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  status                text NOT NULL DEFAULT 'new' CHECK (status IN ('new','retrying','resolved','ignored')),
  assigned_to           uuid,
  resolution_note       text,
  resolved_at           timestamptz,
  -- Guarantee (7): "resolved" with no note is how the same failure is diagnosed from
  -- scratch three months later.
  CONSTRAINT ck_dlq_resolved CHECK ((resolved_at IS NULL) = (resolution_note IS NULL)),
  CONSTRAINT ck_dlq_settled CHECK (status NOT IN ('resolved','ignored') OR resolution_note IS NOT NULL)
);
CREATE INDEX ix_dlq_tenant_status ON dead_letter (tenant_id, status, severity);
REVOKE DELETE ON dead_letter FROM app_user;

CREATE TABLE webhook_subscription (
  id                              uuid PRIMARY KEY,
  tenant_id                       uuid NOT NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  created_by                      uuid NOT NULL,
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  updated_by                      uuid NOT NULL,
  is_active                       boolean NOT NULL DEFAULT true,
  subscriber_name                 text NOT NULL,
  target_url                      text NOT NULL,
  event_names                     jsonb NOT NULL DEFAULT '[]'::jsonb,
  secret_credential_id            uuid REFERENCES credential (id),
  previous_secret_credential_id   uuid REFERENCES credential (id),
  rotation_grace_until            timestamptz,
  status                          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','auto_paused')),
  consecutive_failures            integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_delivery_at                timestamptz,
  CONSTRAINT uq_webhooksub_tenant_name UNIQUE (tenant_id, subscriber_name),
  -- A subscription that listens for nothing will never fire, and looks configured.
  CONSTRAINT ck_websub_events CHECK (jsonb_array_length(event_names) > 0),
  -- https only: a signed payload sent over plain http is signed and readable.
  CONSTRAINT ck_websub_https CHECK (target_url LIKE 'https://%'),
  -- A previous secret with no expiry never stops working, which is not a rotation.
  CONSTRAINT ck_websub_rotation CHECK ((previous_secret_credential_id IS NULL) = (rotation_grace_until IS NULL))
);

CREATE TABLE webhook_delivery (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  subscription_id   uuid NOT NULL REFERENCES webhook_subscription (id),
  event_id          uuid NOT NULL,
  event_name        text NOT NULL,
  attempt_no        integer NOT NULL DEFAULT 1 CHECK (attempt_no >= 1),
  signature_ts      integer NOT NULL,
  response_code     integer,
  response_time_ms  integer,
  status            text NOT NULL DEFAULT 'retrying' CHECK (status IN ('delivered','retrying','failed','dead')),
  next_retry_at     timestamptz,
  -- One delivery per (subscription, event). Without this a relay restart re-fans the same
  -- event and the subscriber sees it twice.
  CONSTRAINT uq_delivery_sub_event UNIQUE (tenant_id, subscription_id, event_id)
);
CREATE INDEX ix_delivery_tenant_status ON webhook_delivery (tenant_id, status);

CREATE TABLE einvoice_irn_log (
  id                      uuid PRIMARY KEY,
  tenant_id               uuid NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid NOT NULL,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid NOT NULL,
  is_active               boolean NOT NULL DEFAULT true,
  invoice_ref             text NOT NULL,
  gstin                   char(15) NOT NULL,
  buyer_gstin             char(15),
  ship_to_gstin           text,
  doc_type                text NOT NULL DEFAULT 'INV' CHECK (doc_type IN ('INV','CRN','DBN')),
  doc_date                date NOT NULL,
  fy                      text NOT NULL,
  taxable_value           numeric(14,2) NOT NULL CHECK (taxable_value >= 0),
  total_value             numeric(14,2) NOT NULL CHECK (total_value >= 0),
  status                  text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generated','cancelled','failed')),
  irn                     char(64),
  ack_no                  text,
  ack_date                timestamptz,
  signed_invoice_ref      text,
  signed_qr_ref           text,
  window_applicable       boolean NOT NULL DEFAULT false,
  window_deadline_at      date,
  window_alert_level      integer NOT NULL DEFAULT 0 CHECK (window_alert_level BETWEEN 0 AND 3),
  reported_at             timestamptz,
  reported_within_window  boolean,
  attempts                integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_idempotency_key    text,
  error_code              text,
  error_message           text,
  cancelled_at            timestamptz,
  cancel_reason           text,
  correlation_id          text NOT NULL,
  -- Guarantee (2): one IRN chain per document. Two rows means two filings.
  CONSTRAINT uq_irn_document UNIQUE (tenant_id, gstin, doc_type, invoice_ref, fy),
  -- Guarantee (3): a status cannot disagree with its own fields.
  CONSTRAINT ck_irn_generated CHECK (status <> 'generated' OR (irn IS NOT NULL AND ack_no IS NOT NULL)),
  CONSTRAINT ck_irn_cancelled CHECK (status <> 'cancelled' OR (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)),
  -- Guarantee (4): the 30-day cliff is computed, never typed.
  CONSTRAINT ck_irn_window CHECK (
    (window_applicable = false AND window_deadline_at IS NULL)
    OR (window_applicable = true AND window_deadline_at = doc_date + 30)),
  CONSTRAINT ck_irn_reported CHECK (reported_at IS NULL OR reported_within_window IS NOT NULL)
);
CREATE INDEX ix_irn_window ON einvoice_irn_log (tenant_id, window_deadline_at)
  WHERE window_applicable AND status IN ('pending','failed');
REVOKE DELETE ON einvoice_irn_log FROM app_user;

CREATE TABLE ewaybill_log (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  shipment_ref        text NOT NULL,
  invoice_ref         text,
  irn                 char(64),
  ewb_no              text,
  consignment_value   numeric(14,2) NOT NULL CHECK (consignment_value >= 0),
  distance_km         integer NOT NULL CHECK (distance_km >= 0),
  valid_upto          timestamptz,
  vehicle_no          text,
  transporter_gstin   text,
  ship_to_gstin       text,
  bill_to_state       text,
  ship_to_state       text,
  -- Guarantee (5): a bill made on ewb2 must be cancelled on ewb2.
  portal_used         text NOT NULL DEFAULT 'ewb1' CHECK (portal_used IN ('ewb1','ewb2')),
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','generated','part_b_updated','cancelled','expired','failed')),
  closure_status      text NOT NULL DEFAULT 'not_closed' CHECK (closure_status IN ('not_closed','closed','closure_failed')),
  closed_at           timestamptz,
  closure_remarks     text,
  error_code          text,
  error_message       text,
  correlation_id      text NOT NULL,
  CONSTRAINT uq_ewb_tenant_shipment UNIQUE (tenant_id, shipment_ref),
  CONSTRAINT ck_ewb_generated CHECK (status NOT IN ('generated','part_b_updated') OR (ewb_no IS NOT NULL AND valid_upto IS NOT NULL)),
  CONSTRAINT ck_ewb_closed CHECK ((closure_status = 'closed') = (closed_at IS NOT NULL))
);
REVOKE DELETE ON ewaybill_log FROM app_user;

CREATE TABLE integration_schedule (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  flow_id           uuid NOT NULL REFERENCES integration_flow (id),
  cron_expr         text,
  interval_sec      integer CHECK (interval_sec IS NULL OR interval_sec >= 10),
  timezone          text NOT NULL DEFAULT 'Asia/Kolkata',
  blackout_windows  jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_run_at       timestamptz,
  next_run_at       timestamptz,
  enabled           boolean NOT NULL DEFAULT true,
  CONSTRAINT uq_schedule_flow UNIQUE (tenant_id, flow_id),
  -- A schedule with neither a cron nor an interval never runs, and looks configured.
  CONSTRAINT ck_schedule_when CHECK ((cron_expr IS NULL) <> (interval_sec IS NULL))
);

CREATE TABLE sync_job (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  flow_id          uuid NOT NULL REFERENCES integration_flow (id),
  mode             text NOT NULL DEFAULT 'delta' CHECK (mode IN ('delta','full','replay')),
  watermark        text,
  records_read     integer NOT NULL DEFAULT 0 CHECK (records_read >= 0),
  records_written  integer NOT NULL DEFAULT 0 CHECK (records_written >= 0),
  records_failed   integer NOT NULL DEFAULT 0 CHECK (records_failed >= 0),
  status           text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','cancelled')),
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  triggered_by     text NOT NULL DEFAULT 'schedule'
);
CREATE INDEX ix_syncjob_tenant_flow ON sync_job (tenant_id, flow_id, started_at DESC);

CREATE TABLE message_metric (
  id         bigserial PRIMARY KEY,
  tenant_id  uuid NOT NULL,
  flow_id    uuid NOT NULL,
  minute     timestamptz NOT NULL,
  count_ok   integer NOT NULL DEFAULT 0,
  count_err  integer NOT NULL DEFAULT 0,
  p50_ms     integer,
  p95_ms     integer,
  backlog    integer NOT NULL DEFAULT 0,
  CONSTRAINT uq_metric_flow_minute UNIQUE (tenant_id, flow_id, minute)
);

CREATE TABLE api_client (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  client_id           text NOT NULL,
  name                text NOT NULL,
  secret_hash         text NOT NULL,
  auth_type           text NOT NULL DEFAULT 'hmac',
  scopes              jsonb NOT NULL DEFAULT '[]'::jsonb,
  rate_limit_per_min  integer NOT NULL DEFAULT 60 CHECK (rate_limit_per_min > 0),
  quota_per_day       integer NOT NULL DEFAULT 10000 CHECK (quota_per_day > 0),
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  last_used_at        timestamptz,
  CONSTRAINT uq_apiclient_id UNIQUE (client_id),
  CONSTRAINT ck_apiclient_scoped CHECK (jsonb_array_length(scopes) > 0)
);

-- =============================================================================
-- FORCE RLS on every tenant-scoped table in this migration.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'connector','credential','connection','integration_flow','field_mapping','message_log',
    'delivery_attempt','dead_letter','webhook_subscription','webhook_delivery',
    'einvoice_irn_log','ewaybill_log','integration_schedule','sync_job','message_metric','api_client']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)', t);
  END LOOP;
END $$;
