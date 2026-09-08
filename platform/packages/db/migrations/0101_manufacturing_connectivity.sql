-- External manufacturing evidence is tenant-owned and never mutates ERP ledgers.
CREATE TABLE manufacturing_connection (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  name text NOT NULL, kind text NOT NULL CHECK (kind IN ('native','odoo','tally','sap','vyapar','generic')),
  base_url text, credentials_encrypted text, settings jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'configured' CHECK (status IN ('configured','connected','failed','import_ready')),
  last_tested_at timestamptz, last_synced_at timestamptz, last_error text,
  CONSTRAINT uq_manufacturing_connection_tenant_id UNIQUE (tenant_id,id)
);
CREATE INDEX ix_manufacturing_connection_tenant_kind ON manufacturing_connection (tenant_id,kind);

CREATE TABLE manufacturing_snapshot (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  connection_id uuid NOT NULL, observed_at timestamptz NOT NULL,
  evidence jsonb NOT NULL, warnings jsonb NOT NULL DEFAULT '[]', fingerprint text NOT NULL,
  CONSTRAINT uq_manufacturing_snapshot_tenant_id UNIQUE (tenant_id,id),
  CONSTRAINT fk_manufacturing_snapshot_connection FOREIGN KEY (tenant_id,connection_id) REFERENCES manufacturing_connection (tenant_id,id),
  CONSTRAINT ck_manufacturing_snapshot_fingerprint CHECK (fingerprint ~ '^[a-f0-9]{64}$')
);
CREATE INDEX ix_manufacturing_snapshot_tenant_connection ON manufacturing_snapshot (tenant_id,connection_id,created_at);

CREATE TABLE manufacturing_decision (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  connection_id uuid NOT NULL, snapshot_id uuid NOT NULL,
  decision_type text NOT NULL CHECK (decision_type IN ('commitment','recovery')),
  request jsonb NOT NULL, result jsonb NOT NULL,
  CONSTRAINT fk_manufacturing_decision_connection FOREIGN KEY (tenant_id,connection_id) REFERENCES manufacturing_connection (tenant_id,id),
  CONSTRAINT fk_manufacturing_decision_snapshot FOREIGN KEY (tenant_id,snapshot_id) REFERENCES manufacturing_snapshot (tenant_id,id)
);
CREATE INDEX ix_manufacturing_decision_tenant_time ON manufacturing_decision (tenant_id,created_at);

CREATE TABLE manufacturing_outcome (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true, measurement jsonb NOT NULL
);
CREATE INDEX ix_manufacturing_outcome_tenant_time ON manufacturing_outcome (tenant_id,created_at);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['manufacturing_connection','manufacturing_snapshot','manufacturing_decision','manufacturing_outcome'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.current_tenant'',true)::uuid) WITH CHECK (tenant_id = current_setting(''app.current_tenant'',true)::uuid)',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO app_user',t);
  END LOOP;
END $$;
