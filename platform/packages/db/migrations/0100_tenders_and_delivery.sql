-- Procurement events and durable provider delivery states. No existing documents are rewritten.
CREATE TABLE sourcing_tender (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL,
 is_active boolean NOT NULL DEFAULT true,
 tender_no text NOT NULL, title text NOT NULL,
 quote_deadline date NOT NULL, need_date date NOT NULL, delivery_plant text NOT NULL,
 notes text, status text NOT NULL DEFAULT 'draft', published_at timestamptz, closed_at timestamptz,
 cancel_reason text,
 CONSTRAINT uq_tender_tenant_no UNIQUE (tenant_id, tender_no),
 CONSTRAINT ck_tender_status CHECK (status IN ('draft','published','evaluation','awarded','cancelled')),
 CONSTRAINT ck_tender_dates CHECK (quote_deadline <= need_date)
);
CREATE INDEX ix_tender_tenant_status ON sourcing_tender(tenant_id,status);
ALTER TABLE sourcing_tender ENABLE ROW LEVEL SECURITY;
ALTER TABLE sourcing_tender FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sourcing_tender
 USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
 WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT,INSERT,UPDATE ON sourcing_tender TO app_user;
REVOKE DELETE ON sourcing_tender FROM app_user;
ALTER TABLE sourcing_rfq ADD COLUMN tender_id uuid REFERENCES sourcing_tender(id), ADD COLUMN tender_line_no integer;
CREATE UNIQUE INDEX uq_tender_line ON sourcing_rfq(tenant_id,tender_id,tender_line_no) WHERE tender_id IS NOT NULL;
ALTER TABLE notification_outbox DROP CONSTRAINT ck_outbox_status;
ALTER TABLE notification_outbox ADD CONSTRAINT ck_outbox_status CHECK(status IN ('pending','previewed','sending','sent','failed','delivery_unknown'));
