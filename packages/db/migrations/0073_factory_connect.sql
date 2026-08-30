-- =============================================================================
-- 0073 — Additive XELOR Factory Connect foundation.
--
-- Operational events and governed command evidence only. High-frequency motion telemetry
-- remains at the edge/historian, and no table can bypass a robot controller or safety PLC.
-- =============================================================================

ALTER TABLE connector DROP CONSTRAINT connector_protocol_check;
ALTER TABLE connector ADD CONSTRAINT connector_protocol_check
  CHECK (protocol IN ('https','sftp','mqtt','file','opcua','dds'));

CREATE TABLE factory_edge_gateway (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true, code text NOT NULL, name text NOT NULL,
  site_code text NOT NULL, zone_code text, deployment_mode text NOT NULL DEFAULT 'simulator',
  software_version text NOT NULL, health_status text NOT NULL DEFAULT 'unknown',
  last_heartbeat_at timestamptz, command_mode text NOT NULL DEFAULT 'read_only',
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT uq_factory_gateway_code UNIQUE (tenant_id, code),
  CONSTRAINT ck_factory_gateway_mode CHECK (deployment_mode IN ('simulator', 'edge')),
  CONSTRAINT ck_factory_gateway_command_mode CHECK (command_mode IN ('read_only', 'governed'))
);

CREATE TABLE industrial_asset_binding (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true, asset_code text NOT NULL, name text NOT NULL,
  asset_kind text NOT NULL, site_code text NOT NULL, zone_code text NOT NULL,
  gateway_id uuid NOT NULL, connector_code text NOT NULL, external_ref text NOT NULL,
  maintenance_asset_ref uuid, work_center_ref uuid, manufacturer text, model text,
  controller_version text, command_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_industrial_asset_code UNIQUE (tenant_id, asset_code),
  CONSTRAINT uq_industrial_asset_external UNIQUE (tenant_id, gateway_id, external_ref)
);
CREATE INDEX ix_industrial_asset_zone ON industrial_asset_binding (tenant_id, site_code, zone_code);

CREATE TABLE asset_state_event (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true, asset_id uuid NOT NULL, source_event_id text NOT NULL,
  observed_at timestamptz NOT NULL, state text NOT NULL, safety_state text NOT NULL DEFAULT 'unknown',
  active_program text, work_ref text, material_ref text,
  cycle_time_seconds numeric(12,3), good_count integer, reject_count integer,
  energy_kwh numeric(14,4), alarm_code text, evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_asset_state_source_event UNIQUE (tenant_id, asset_id, source_event_id),
  CONSTRAINT ck_asset_state CHECK (state IN ('running','idle','blocked','faulted','protective_stop','offline'))
);
CREATE INDEX ix_asset_state_time ON asset_state_event (tenant_id, asset_id, observed_at DESC);

CREATE TABLE asset_location_event (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true, tracked_ref text NOT NULL, source_event_id text NOT NULL,
  observed_at timestamptz NOT NULL, site_code text NOT NULL, zone_code text NOT NULL,
  x numeric(12,4), y numeric(12,4), confidence numeric(7,4), source text NOT NULL,
  payload_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_asset_location_source_event UNIQUE (tenant_id, source, source_event_id)
);
CREATE INDEX ix_asset_location_time ON asset_location_event (tenant_id, tracked_ref, observed_at DESC);

CREATE TABLE material_dwell_interval (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true, tracked_ref text NOT NULL, material_ref text, batch_ref text,
  work_ref text, zone_code text NOT NULL, entered_at timestamptz NOT NULL,
  exited_at timestamptz, expected_max_minutes integer NOT NULL, status text NOT NULL DEFAULT 'active',
  cause_code text,
  CONSTRAINT ck_material_dwell_status CHECK (status IN ('active','exceeded','cleared')),
  CONSTRAINT ck_material_dwell_minutes CHECK (expected_max_minutes > 0)
);
CREATE INDEX ix_material_dwell_status ON material_dwell_interval (tenant_id, status, entered_at);

CREATE TABLE machine_command (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true, command_key text NOT NULL, asset_id uuid NOT NULL,
  capability text NOT NULL, parameters jsonb NOT NULL DEFAULT '{}'::jsonb, required_state text,
  approval_ref text NOT NULL, idempotency_key text NOT NULL, expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending', simulated boolean NOT NULL DEFAULT true,
  dispatched_at timestamptz, acknowledged_at timestamptz, result jsonb,
  CONSTRAINT uq_machine_command_key UNIQUE (tenant_id, command_key),
  CONSTRAINT uq_machine_command_idempotency UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT ck_machine_command_status CHECK (status IN ('pending','accepted','completed','rejected','expired'))
);
CREATE INDEX ix_machine_command_asset_time ON machine_command (tenant_id, asset_id, created_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'factory_edge_gateway','industrial_asset_binding','asset_state_event',
    'asset_location_event','material_dwell_interval','machine_command'
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

-- Append-only observations. Corrections arrive as new source events.
REVOKE UPDATE ON asset_state_event, asset_location_event FROM app_user;

INSERT INTO permission_catalogue (
  id, tenant_id, created_by, updated_by, permission, doc_type, action, description, is_privileged
)
SELECT gen_random_uuid(), t.id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  p.permission, p.doc_type, p.action, p.description, p.is_privileged
FROM tenant t
CROSS JOIN (VALUES
  ('factory.connect.read', 'industrial_asset_binding', 'read', 'Read factory gateways, robot cells, dwell intervals and command evidence.', false),
  ('factory.telemetry.ingest', 'asset_state_event', 'ingest', 'Ingest idempotent operational events through reserved factory edge gateway authority.', true),
  ('factory.command.execute', 'machine_command', 'execute', 'Request an approval-bound allowlisted simulator command evaluation; physical edge execution is disabled.', true)
) AS p(permission, doc_type, action, description, is_privileged)
ON CONFLICT (tenant_id, permission) DO UPDATE SET
  doc_type = EXCLUDED.doc_type, action = EXCLUDED.action, description = EXCLUDED.description,
  is_privileged = EXCLUDED.is_privileged, updated_at = now(), updated_by = EXCLUDED.updated_by;

INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT gen_random_uuid(), r.tenant_id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  r.id, p.permission
FROM role r
CROSS JOIN (VALUES
  ('factory.connect.read'), ('factory.telemetry.ingest'), ('factory.command.execute')
) AS p(permission)
WHERE r.code IN ('xelor_admin', 'it_admin', 'demo_admin', 'demo_hexa', 'demo_kiln')
ON CONFLICT DO NOTHING;

INSERT INTO connector (
  id, tenant_id, created_by, updated_by, code, name, category, protocol,
  direction, version, config_schema, capabilities, status
)
SELECT gen_random_uuid(), t.id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  c.code, c.name, 'ot', c.protocol, c.direction, '1', c.config_schema, c.capabilities, 'available'
FROM tenant t
CROSS JOIN (VALUES
  ('opcua_robotics', 'OPC UA Robotics', 'opcua', 'bidirectional',
   '{"requires":["endpoint","applicationCertificate","securityPolicy"]}'::jsonb,
   '["asset.read","state.read","alarm.read","cycle.read","allowlisted_command.request"]'::jsonb),
  ('mqtt_factory', 'MQTT Factory Telemetry', 'mqtt', 'inbound',
   '{"requires":["broker","topicPrefix","clientCertificate"]}'::jsonb,
   '["telemetry.ingest","event.ingest"]'::jsonb),
  ('ros2_amr', 'ROS 2 AMR Bridge', 'dds', 'bidirectional',
   '{"requires":["edgeBridge","securityEnclave","fleetNamespace"]}'::jsonb,
   '["amr.state.read","amr.route.dispatch"]'::jsonb),
  ('cisco_spaces', 'Cisco Spaces Location', 'https', 'inbound',
   '{"requires":["apiBase","credential","siteMapping"]}'::jsonb,
   '["location.read","location.webhook","map.read"]'::jsonb),
  ('splunk_ot', 'Splunk OT and Security Events', 'https', 'bidirectional',
   '{"requires":["hecEndpoint","credential","index"]}'::jsonb,
   '["security_finding.ingest","connector_health.publish","command_audit.publish"]'::jsonb)
) AS c(code, name, protocol, direction, config_schema, capabilities)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- One explicit simulator world for the canonical 3S demo tenant. Kaveri remains empty
-- so the existing cross-tenant leak probe keeps a genuinely distinct dataset.
INSERT INTO factory_edge_gateway (
  id, tenant_id, created_by, updated_by, code, name, site_code, zone_code,
  deployment_mode, software_version, health_status, last_heartbeat_at, command_mode, capabilities
) VALUES (
  '0192a8c0-0073-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff', '0192a8c0-0000-7000-8000-0000000000ff',
  'EDGE-PUNE-01', 'Pune factory edge simulator', 'PUNE-01', 'MACHINE-SHOP',
  'simulator', '0.1.0', 'healthy', now(), 'governed',
  '["opcua.read","mqtt.ingest","robot.job.enqueue","robot.pause_after_cycle","amr.route.dispatch","quality.output.quarantine","maintenance.inspection.request"]'::jsonb
) ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO industrial_asset_binding (
  id, tenant_id, created_by, updated_by, asset_code, name, asset_kind, site_code,
  zone_code, gateway_id, connector_code, external_ref, manufacturer, model,
  controller_version, command_policy, attributes
) VALUES
  ('0192a8c0-0073-7000-8000-000000000010', '0192a8c0-0000-7000-8000-000000000001',
   '0192a8c0-0000-7000-8000-0000000000ff', '0192a8c0-0000-7000-8000-0000000000ff',
   'ROBOT-CELL-03', 'Robot Cell 03', 'robot_arm', 'PUNE-01', 'MACHINE-SHOP',
   '0192a8c0-0073-7000-8000-000000000001', 'opcua_robotics', 'ns=4;s=RobotCell03',
   'Demo Robotics', 'DR-20', '5.4.2',
   '{"allowlistedCapabilities":["robot.job.enqueue","robot.pause_after_cycle","quality.output.quarantine","maintenance.inspection.request"],"requiresApproval":true,"forbidden":["safety.override","motion.jog","program.upload","emergency_stop.release"]}'::jsonb,
   '{"targetCycleSeconds":72,"mapX":68,"mapY":42}'::jsonb),
  ('0192a8c0-0073-7000-8000-000000000011', '0192a8c0-0000-7000-8000-000000000001',
   '0192a8c0-0000-7000-8000-0000000000ff', '0192a8c0-0000-7000-8000-0000000000ff',
   'AMR-07', 'Material Runner 07', 'amr', 'PUNE-01', 'STORES-TO-MACHINE',
   '0192a8c0-0073-7000-8000-000000000001', 'ros2_amr', '/fleet/amr_07',
   'Demo Mobility', 'MR-07', '2.1.0',
   '{"allowlistedCapabilities":["amr.route.dispatch"],"requiresApproval":true,"forbidden":["safety.override","velocity.raw"]}'::jsonb,
   '{"mapX":31,"mapY":64}'::jsonb)
ON CONFLICT (tenant_id, asset_code) DO NOTHING;

INSERT INTO asset_state_event (
  id, tenant_id, created_by, updated_by, asset_id, source_event_id, observed_at,
  state, safety_state, active_program, work_ref, material_ref,
  cycle_time_seconds, good_count, reject_count, energy_kwh, alarm_code, evidence
) VALUES
  ('0192a8c0-0073-7000-8000-000000000020', '0192a8c0-0000-7000-8000-000000000001',
   '0192a8c0-0000-7000-8000-0000000000ff', '0192a8c0-0000-7000-8000-0000000000ff',
   '0192a8c0-0073-7000-8000-000000000010', 'sim-state-robot-001', now() - interval '30 seconds',
   'blocked', 'normal', 'PX400_SHAFT_LOAD_V4', 'PO-2627-00002', 'BATCH-B-204',
   0, 28, 0, 41.2700, 'MATERIAL_NOT_PRESENT',
   '{"source":"edge_simulator","boundary":"No physical robot is connected."}'::jsonb),
  ('0192a8c0-0073-7000-8000-000000000021', '0192a8c0-0000-7000-8000-000000000001',
   '0192a8c0-0000-7000-8000-0000000000ff', '0192a8c0-0000-7000-8000-0000000000ff',
   '0192a8c0-0073-7000-8000-000000000011', 'sim-state-amr-001', now() - interval '20 seconds',
   'idle', 'normal', NULL, NULL, NULL, NULL, 0, 0, 5.1400, NULL,
   '{"source":"edge_simulator","batteryPercent":84,"boundary":"No physical AMR is connected."}'::jsonb)
ON CONFLICT (tenant_id, asset_id, source_event_id) DO NOTHING;

INSERT INTO asset_location_event (
  id, tenant_id, created_by, updated_by, tracked_ref, source_event_id, observed_at,
  site_code, zone_code, x, y, confidence, source, payload_redacted
) VALUES
  ('0192a8c0-0073-7000-8000-000000000030', '0192a8c0-0000-7000-8000-000000000001',
   '0192a8c0-0000-7000-8000-0000000000ff', '0192a8c0-0000-7000-8000-0000000000ff',
   'PALLET-204', 'sim-location-001', now() - interval '45 seconds', 'PUNE-01',
   'STAGING-WEST', 24.5, 61.0, 0.86, 'ble', '{"tag":"PALLET-204"}'::jsonb)
ON CONFLICT (tenant_id, source, source_event_id) DO NOTHING;

INSERT INTO material_dwell_interval (
  id, tenant_id, created_by, updated_by, tracked_ref, material_ref, batch_ref,
  work_ref, zone_code, entered_at, expected_max_minutes, status, cause_code
) VALUES (
  '0192a8c0-0073-7000-8000-000000000040', '0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff', '0192a8c0-0000-7000-8000-0000000000ff',
  'PALLET-204', 'PX-400-SHAFT', 'BATCH-B-204', 'PO-2627-00002', 'STAGING-WEST',
  now() - interval '74 minutes', 20, 'exceeded', 'WAITING_FOR_INTERNAL_MOVE'
) ON CONFLICT (id) DO NOTHING;
