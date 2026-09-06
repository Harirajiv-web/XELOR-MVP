-- =============================================================================
-- 0095 — The supplier network: taking a request out to people who do not use this ERP.
--
-- Sourcing (0094) held the buying decision but assumed the quotes arrived somehow. This is
-- the somehow. A request is published to matching suppliers, each is sent a message carrying
-- a signed link, and the link opens a page where they answer without an account.
--
-- The constraint that shapes the whole design: A SUPPLIER WILL NOT SIGN UP. If answering
-- costs a registration, they do not answer. So the link IS the identity — scoped to one
-- request, one supplier, and an expiry.
-- =============================================================================

CREATE TABLE network_supplier (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  supplier_code   text NOT NULL,
  name            text NOT NULL,
  categories      jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(categories) = 'array'),
  city            text,
  state_code      text,
  gstin           text,
  contact_name    text,
  -- E.164 or nothing. A phone number stored in six local formats cannot be messaged.
  whatsapp_e164   text CHECK (whatsapp_e164 IS NULL OR whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email           text,
  vendor_id       uuid,
  status          text NOT NULL DEFAULT 'active',
  notes           text,
  CONSTRAINT uq_netsupplier_code UNIQUE (tenant_id, supplier_code),
  CONSTRAINT ck_netsupplier_status CHECK (status IN ('invited','active','suspended')),
  -- Unreachable by every channel means uninvitable, and a network of those is a list.
  CONSTRAINT ck_netsupplier_reachable CHECK (whatsapp_e164 IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX ix_netsupplier_status ON network_supplier (tenant_id, status);

CREATE TABLE rfq_broadcast (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  rfq_id          uuid NOT NULL REFERENCES sourcing_rfq (id),
  rfq_no          text NOT NULL,
  -- Frozen at publication: what the suppliers were actually shown, whatever changes later.
  card_payload    jsonb NOT NULL,
  supplier_count  integer NOT NULL DEFAULT 0 CHECK (supplier_count >= 0),
  status          text NOT NULL DEFAULT 'published',
  closes_at       timestamptz,
  CONSTRAINT ck_rfqbroadcast_status CHECK (status IN ('published','closed'))
);
CREATE INDEX ix_rfqbroadcast_rfq ON rfq_broadcast (tenant_id, rfq_id);

CREATE TABLE rfq_invite (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  broadcast_id    uuid NOT NULL REFERENCES rfq_broadcast (id),
  rfq_id          uuid NOT NULL REFERENCES sourcing_rfq (id),
  supplier_id     uuid NOT NULL REFERENCES network_supplier (id),
  -- SHA-256 of the token, never the token. A leaked database must not hand somebody every
  -- outstanding invitation; the plaintext exists only in the message that was sent.
  token_hash      text NOT NULL,
  expires_at      timestamptz NOT NULL,
  opened_at       timestamptz,
  responded_at    timestamptz,
  state           text NOT NULL DEFAULT 'sent',
  decline_reason  text,
  CONSTRAINT uq_rfqinvite_broadcast_supplier UNIQUE (tenant_id, broadcast_id, supplier_id),
  CONSTRAINT uq_rfqinvite_token UNIQUE (tenant_id, token_hash),
  CONSTRAINT ck_rfqinvite_state CHECK (state IN ('sent','opened','quoted','declined','expired'))
);
CREATE INDEX ix_rfqinvite_rfq ON rfq_invite (tenant_id, rfq_id);

CREATE TABLE notification_outbox (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  channel             text NOT NULL,
  recipient           text NOT NULL,
  recipient_name      text,
  template            text NOT NULL,
  subject             text,
  -- The card, rendered. What a person would actually read.
  body                text NOT NULL,
  variables           jsonb NOT NULL DEFAULT '{}'::jsonb,
  link_url            text,
  related_type        text,
  related_id          uuid,
  provider            text NOT NULL,
  status              text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  failure_reason      text,
  sent_at             timestamptz,
  CONSTRAINT ck_outbox_channel CHECK (channel IN ('whatsapp','email')),
  CONSTRAINT ck_outbox_status CHECK (status IN ('pending','previewed','sent','failed'))
);
CREATE INDEX ix_outbox_tenant_status ON notification_outbox (tenant_id, status);
CREATE INDEX ix_outbox_tenant_related ON notification_outbox (tenant_id, related_type, related_id);

CREATE TABLE network_quote_submission (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid NOT NULL,
  is_active          boolean NOT NULL DEFAULT true,
  invite_id          uuid NOT NULL REFERENCES rfq_invite (id),
  rfq_id             uuid NOT NULL REFERENCES sourcing_rfq (id),
  supplier_id        uuid NOT NULL REFERENCES network_supplier (id),
  unit_price         numeric(18,2) NOT NULL CHECK (unit_price >= 0),
  tooling_cost       numeric(18,2) NOT NULL DEFAULT 0 CHECK (tooling_cost >= 0),
  freight_cost       numeric(18,2) NOT NULL DEFAULT 0 CHECK (freight_cost >= 0),
  landed_cost        numeric(18,2) NOT NULL CHECK (landed_cost >= 0),
  promised_date      text,
  lead_time_days     integer CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  moq                numeric(18,3),
  supplier_note      text,
  sourcing_quote_id  uuid,
  status             text NOT NULL DEFAULT 'received',
  -- One submission per invitation, and one sourcing quote per submission. Both are database
  -- promises because both are the kind of mistake a supplier discovers by being asked twice.
  CONSTRAINT uq_netquote_invite UNIQUE (tenant_id, invite_id),
  CONSTRAINT uq_netquote_sourcing UNIQUE (tenant_id, sourcing_quote_id),
  CONSTRAINT ck_netquote_status CHECK (status IN ('received','accepted_into_sourcing'))
);
CREATE INDEX ix_netquote_rfq ON network_quote_submission (tenant_id, rfq_id);

-- --- Tenant isolation ------------------------------------------------------

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'network_supplier','rfq_broadcast','rfq_invite','notification_outbox','network_quote_submission'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)',
      table_name
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO app_user', table_name);
    EXECUTE format('REVOKE DELETE ON %I FROM app_user', table_name);
  END LOOP;
END $$;

-- A sent message is a record of what left the building. Only its delivery result may change.
REVOKE UPDATE ON notification_outbox FROM app_user;
GRANT UPDATE (status, provider_message_id, failure_reason, sent_at, updated_at, updated_by)
  ON notification_outbox TO app_user;

-- --- Permissions -----------------------------------------------------------

INSERT INTO permission_catalogue (
  id, tenant_id, created_by, updated_by, permission, doc_type, action, description, is_privileged
)
SELECT gen_random_uuid(), t.id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  p.permission, p.doc_type, p.action, p.description, p.is_privileged
FROM tenant t
CROSS JOIN (VALUES
  ('purchase.network.read',      'network_supplier', 'read',      'Read the supplier network and the messages sent to it.', false),
  ('purchase.network.manage',    'network_supplier', 'manage',    'Add and maintain suppliers on the network.', false),
  ('purchase.network.broadcast', 'rfq_broadcast',    'broadcast', 'Publish a request for quotation to network suppliers.', false)
) AS p(permission, doc_type, action, description, is_privileged)
ON CONFLICT (tenant_id, permission) DO UPDATE SET
  doc_type = EXCLUDED.doc_type, action = EXCLUDED.action, description = EXCLUDED.description,
  is_privileged = EXCLUDED.is_privileged, updated_at = now(), updated_by = EXCLUDED.updated_by;

CREATE TEMP TABLE _netfollows (new_permission text, follows_permission text) ON COMMIT DROP;
INSERT INTO _netfollows (new_permission, follows_permission) VALUES
  ('purchase.network.read',      'purchase.rfq.read'),
  ('purchase.network.manage',    'purchase.rfq.create'),
  ('purchase.network.broadcast', 'purchase.rfq.issue');

INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT DISTINCT gen_random_uuid(), rp.tenant_id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  rp.role_id, f.new_permission
FROM role_permission rp
JOIN _netfollows f ON f.follows_permission = rp.permission
WHERE NOT EXISTS (
  SELECT 1 FROM role_permission existing
  WHERE existing.tenant_id = rp.tenant_id AND existing.role_id = rp.role_id
    AND existing.permission = f.new_permission)
ON CONFLICT DO NOTHING;

INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT gen_random_uuid(), ro.tenant_id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  ro.id, p.permission
FROM role ro
CROSS JOIN (VALUES
  ('purchase.network.read'), ('purchase.network.manage'), ('purchase.network.broadcast')
) AS p(permission)
WHERE ro.code IN ('admin', 'demo_admin', 'xelor_admin', 'it_admin')
ON CONFLICT DO NOTHING;

-- --- Proof -----------------------------------------------------------------

DO $$
DECLARE catalogued integer; granted integer;
BEGIN
  SELECT count(*) INTO catalogued FROM permission_catalogue WHERE permission LIKE 'purchase.network.%';
  SELECT count(*) INTO granted FROM role_permission WHERE permission LIKE 'purchase.network.%';
  IF catalogued < 3 THEN
    RAISE EXCEPTION 'expected at least 3 catalogued network permissions, found %', catalogued;
  END IF;
  IF granted = 0 THEN
    RAISE EXCEPTION 'no role received a network permission — the derivation matched nothing';
  END IF;
END $$;
