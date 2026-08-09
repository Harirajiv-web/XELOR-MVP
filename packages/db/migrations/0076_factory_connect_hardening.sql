-- =============================================================================
-- 0076 — Factory Connect safety, tenancy, intent binding and least privilege.
--
-- Additive hardening for databases that already applied 0073-0075. Real edge dispatch
-- remains disabled in application code; persisted completed commands are truthful
-- simulator policy evaluations with no dispatch/ack timestamps.
-- =============================================================================

ALTER TABLE factory_edge_gateway
  ADD CONSTRAINT uq_factory_gateway_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE industrial_asset_binding
  ADD CONSTRAINT uq_industrial_asset_tenant_id UNIQUE (tenant_id, id),
  ADD CONSTRAINT fk_industrial_asset_gateway_tenant
    FOREIGN KEY (tenant_id, gateway_id)
    REFERENCES factory_edge_gateway (tenant_id, id);
ALTER TABLE asset_state_event
  ADD CONSTRAINT uq_asset_state_tenant_id UNIQUE (tenant_id, id),
  ADD CONSTRAINT fk_asset_state_asset_tenant
    FOREIGN KEY (tenant_id, asset_id)
    REFERENCES industrial_asset_binding (tenant_id, id);

ALTER TABLE machine_command
  ADD COLUMN request_fingerprint text,
  ADD COLUMN approval_intent_hash text,
  ADD COLUMN source_state_event_id uuid,
  ADD COLUMN policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN approval_decided_by uuid,
  ADD COLUMN approval_decided_at timestamptz;

-- Legacy commands were not bound to an exact approval intent. Keep them as evidence but
-- make them impossible to replay as an authorized command under the hardened contract.
UPDATE machine_command mc
SET source_state_event_id = (
      SELECT event.id
      FROM asset_state_event event
      WHERE event.tenant_id = mc.tenant_id
        AND event.asset_id = mc.asset_id
        AND event.is_active = true
      ORDER BY event.observed_at DESC
      LIMIT 1
    ),
    required_state = COALESCE(
      mc.required_state,
      (
        SELECT event.state
        FROM asset_state_event event
        WHERE event.tenant_id = mc.tenant_id
          AND event.asset_id = mc.asset_id
          AND event.is_active = true
        ORDER BY event.observed_at DESC
        LIMIT 1
      ),
      'offline'
    ),
    request_fingerprint =
      md5(concat_ws('|', mc.tenant_id::text, mc.idempotency_key, mc.approval_ref, mc.id::text)) ||
      md5(concat_ws('|', 'legacy', mc.id::text, mc.approval_ref)),
    approval_intent_hash =
      md5('legacy-unbound-factory-command:' || mc.id::text) ||
      md5('legacy-unbound-factory-command-second-half:' || mc.id::text),
    policy_snapshot = jsonb_build_object(
      'legacyUnbound', true,
      'reason', 'Created before exact Factory approval-intent binding was enforced.'
    ),
    status = 'rejected',
    simulated = true,
    dispatched_at = NULL,
    acknowledged_at = NULL,
    result = jsonb_build_object(
      'outcome', 'legacy_command_invalidated',
      'physicalControllerContacted', false,
      'edgeExecutionAttempted', false
    )
WHERE request_fingerprint IS NULL;

UPDATE machine_command mc
SET approval_decided_by = approval.decided_by,
    approval_decided_at = approval.decided_at
FROM agent_approval approval
WHERE approval.tenant_id = mc.tenant_id
  AND approval.id::text = mc.approval_ref;

ALTER TABLE machine_command
  ALTER COLUMN required_state SET NOT NULL,
  ALTER COLUMN request_fingerprint SET NOT NULL,
  ALTER COLUMN approval_intent_hash SET NOT NULL,
  ADD CONSTRAINT fk_machine_command_asset_tenant
    FOREIGN KEY (tenant_id, asset_id)
    REFERENCES industrial_asset_binding (tenant_id, id),
  ADD CONSTRAINT fk_machine_command_state_tenant
    FOREIGN KEY (tenant_id, source_state_event_id)
    REFERENCES asset_state_event (tenant_id, id),
  ADD CONSTRAINT ck_machine_command_capability CHECK (
    capability IN (
      'robot.job.enqueue','robot.program.select_approved','robot.pause_after_cycle',
      'amr.route.dispatch','quality.output.quarantine','maintenance.inspection.request'
    )
  ),
  ADD CONSTRAINT ck_machine_command_state CHECK (
    required_state IN ('running','idle','blocked','faulted','protective_stop','offline')
  ),
  ADD CONSTRAINT ck_machine_command_status_value CHECK (
    status IN ('pending','accepted','completed','rejected','expired')
  ),
  ADD CONSTRAINT ck_machine_command_hashes CHECK (
    request_fingerprint ~ '^[a-f0-9]{64}$'
    AND approval_intent_hash ~ '^[a-f0-9]{64}$'
  ),
  ADD CONSTRAINT ck_machine_command_ttl CHECK (
    status = 'rejected'
    OR (expires_at > created_at AND expires_at <= created_at + interval '15 minutes')
  ),
  ADD CONSTRAINT ck_machine_command_simulation_truth CHECK (
    dispatched_at IS NULL
    AND acknowledged_at IS NULL
    AND (simulated = true OR status = 'rejected')
  ),
  ADD CONSTRAINT ck_machine_command_completed_state_evidence CHECK (
    status <> 'completed' OR source_state_event_id IS NOT NULL
  );

ALTER TABLE asset_state_event
  ADD CONSTRAINT ck_asset_state_value CHECK (
    state IN ('running','idle','blocked','faulted','protective_stop','offline')
  ),
  ADD CONSTRAINT ck_asset_state_cycle CHECK (cycle_time_seconds IS NULL OR cycle_time_seconds >= 0),
  ADD CONSTRAINT ck_asset_state_counts CHECK (
    (good_count IS NULL OR good_count >= 0) AND (reject_count IS NULL OR reject_count >= 0)
  ),
  ADD CONSTRAINT ck_asset_state_energy CHECK (energy_kwh IS NULL OR energy_kwh >= 0);

ALTER TABLE asset_location_event
  ADD CONSTRAINT ck_asset_location_confidence CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  );

ALTER TABLE material_dwell_interval
  ADD CONSTRAINT ck_material_dwell_value CHECK (status IN ('active','exceeded','cleared')),
  ADD CONSTRAINT ck_material_dwell_expected CHECK (expected_max_minutes > 0),
  ADD CONSTRAINT ck_material_dwell_time CHECK (exited_at IS NULL OR exited_at >= entered_at);

CREATE UNIQUE INDEX uq_material_dwell_active_ref
  ON material_dwell_interval (tenant_id, tracked_ref)
  WHERE exited_at IS NULL AND is_active = true;

-- Request and approval evidence is immutable. Only a future dedicated edge-state migration
-- may widen the mutable execution columns once a claim/ack protocol exists.
CREATE OR REPLACE FUNCTION prevent_machine_command_request_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(
    NEW.tenant_id, NEW.command_key, NEW.asset_id, NEW.capability, NEW.parameters,
    NEW.required_state, NEW.approval_ref, NEW.idempotency_key, NEW.request_fingerprint,
    NEW.approval_intent_hash, NEW.source_state_event_id, NEW.policy_snapshot,
    NEW.approval_decided_by, NEW.approval_decided_at, NEW.expires_at, NEW.simulated,
    NEW.created_at, NEW.created_by
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.command_key, OLD.asset_id, OLD.capability, OLD.parameters,
    OLD.required_state, OLD.approval_ref, OLD.idempotency_key, OLD.request_fingerprint,
    OLD.approval_intent_hash, OLD.source_state_event_id, OLD.policy_snapshot,
    OLD.approval_decided_by, OLD.approval_decided_at, OLD.expires_at, OLD.simulated,
    OLD.created_at, OLD.created_by
  ) THEN
    RAISE EXCEPTION 'machine command request evidence is immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER machine_command_request_immutable
BEFORE UPDATE ON machine_command
FOR EACH ROW EXECUTE FUNCTION prevent_machine_command_request_mutation();

-- Refresh the durable simulator scenario for already-migrated local/demo databases. This
-- is explicitly simulator evidence and makes no claim about a physical controller.
UPDATE factory_edge_gateway
SET last_heartbeat_at = now(), updated_at = now()
WHERE deployment_mode = 'simulator' AND is_active = true;

INSERT INTO asset_state_event (
  id, tenant_id, created_by, updated_by, asset_id, source_event_id, observed_at,
  state, safety_state, active_program, work_ref, material_ref, cycle_time_seconds,
  good_count, reject_count, energy_kwh, alarm_code, evidence
)
SELECT
  gen_random_uuid(), latest.tenant_id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  latest.asset_id, 'migration-0076-simulator-refresh', now(), latest.state,
  latest.safety_state, latest.active_program, latest.work_ref, latest.material_ref,
  latest.cycle_time_seconds, latest.good_count, latest.reject_count, latest.energy_kwh,
  latest.alarm_code,
  latest.evidence || jsonb_build_object(
    'source', 'policy_simulator',
    'boundary', 'Scenario refresh only; no physical controller observation.'
  )
FROM (
  SELECT DISTINCT ON (event.tenant_id, event.asset_id) event.*
  FROM asset_state_event event
  JOIN industrial_asset_binding asset
    ON asset.tenant_id = event.tenant_id AND asset.id = event.asset_id
  JOIN factory_edge_gateway gateway
    ON gateway.tenant_id = asset.tenant_id AND gateway.id = asset.gateway_id
  WHERE event.is_active = true AND asset.is_active = true AND gateway.is_active = true
    AND gateway.deployment_mode = 'simulator'
  ORDER BY event.tenant_id, event.asset_id, event.observed_at DESC
) latest
ON CONFLICT (tenant_id, asset_id, source_event_id) DO NOTHING;

-- Department-scoped view permissions drive navigation; factory.connect.read remains the
-- shared API evidence permission behind /integration/factory/overview.
-- The scoped names are product contracts and use a hyphenated entity segment. Keep the
-- same three-part lowercase grammar while allowing that separator in the entity only.
ALTER TABLE permission_catalogue DROP CONSTRAINT ck_permcat_shape;
ALTER TABLE permission_catalogue ADD CONSTRAINT ck_permcat_shape CHECK (
  permission ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_-]*\.[a-z_]+$'
);

INSERT INTO permission_catalogue (
  id, tenant_id, created_by, updated_by, permission, doc_type, action, description, is_privileged
)
SELECT gen_random_uuid(), tenant.id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  spec.permission, spec.doc_type, 'read', spec.description, false
FROM tenant
CROSS JOIN (VALUES
  ('integration.factory-connect.read', 'integration_factory_connect_view', 'Open the Integration Factory Connect view for governed connector evidence.'),
  ('production.factory-connect.read', 'production_factory_connect_view', 'Open the Production robot-cell view backed by Factory Connect evidence.'),
  ('planning.factory-flow.read', 'planning_factory_flow_view', 'Open the Planning factory-flow view backed by dwell and asset evidence.')
) AS spec(permission, doc_type, description)
ON CONFLICT (tenant_id, permission) DO UPDATE SET
  doc_type = EXCLUDED.doc_type,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  is_privileged = EXCLUDED.is_privileged,
  is_active = true,
  updated_at = now(),
  updated_by = EXCLUDED.updated_by;

INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT gen_random_uuid(), grant_row.tenant_id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  grant_row.role_id, grant_row.target_permission
FROM (
  SELECT DISTINCT source.tenant_id, source.role_id, mapping.target_permission
  FROM role_permission source
  JOIN role ON role.tenant_id = source.tenant_id AND role.id = source.role_id
  JOIN (VALUES
    ('integration.connector.read', 'integration.factory-connect.read'),
    ('production.order.read', 'production.factory-connect.read'),
    ('planning.mrp.read', 'planning.factory-flow.read'),
    ('integration.connector.read', 'factory.connect.read'),
    ('production.order.read', 'factory.connect.read'),
    ('planning.mrp.read', 'factory.connect.read')
  ) AS mapping(source_permission, target_permission)
    ON mapping.source_permission = source.permission
  WHERE source.is_active = true AND role.is_active = true
) grant_row
ON CONFLICT (tenant_id, role_id, permission) DO UPDATE SET
  is_active = true,
  updated_at = now(),
  updated_by = EXCLUDED.updated_by;

-- Telemetry ingestion belongs to a non-human gateway role. It is deliberately unassigned;
-- provisioning a real gateway must create an attributable service principal assignment.
UPDATE role_permission grant_row
SET is_active = false,
    updated_at = now(),
    updated_by = '0192a8c0-0000-7000-8000-0000000000ff'::uuid
FROM role
WHERE role.tenant_id = grant_row.tenant_id
  AND role.id = grant_row.role_id
  AND grant_row.permission = 'factory.telemetry.ingest';

INSERT INTO role (
  id, tenant_id, created_by, updated_by, code, name, description,
  category, is_privileged, is_row_unrestricted
)
SELECT gen_random_uuid(), tenant.id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  'factory_edge_gateway', 'Factory edge gateway',
  'Non-human identity reserved for idempotent Factory Connect telemetry. Signing and mTLS are required before physical deployment.',
  'service', true, false
FROM tenant
ON CONFLICT (tenant_id, code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_privileged = EXCLUDED.is_privileged,
  is_active = true,
  updated_at = now(),
  updated_by = EXCLUDED.updated_by;

INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT gen_random_uuid(), role.tenant_id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  role.id, 'factory.telemetry.ingest'
FROM role
WHERE role.code = 'factory_edge_gateway' AND role.is_active = true
ON CONFLICT (tenant_id, role_id, permission) DO UPDATE SET
  is_active = true,
  updated_at = now(),
  updated_by = EXCLUDED.updated_by;

-- Machine-command execution is not an automatic administrator power. Keep the canonical
-- simulator demo usable through demo_admin/KILN and allow an explicitly named plant-head
-- role when present. This grants no physical authority: edge dispatch remains hard-refused.
UPDATE role_permission grant_row
SET is_active = false,
    updated_at = now(),
    updated_by = '0192a8c0-0000-7000-8000-0000000000ff'::uuid
FROM role
WHERE role.tenant_id = grant_row.tenant_id
  AND role.id = grant_row.role_id
  AND grant_row.permission = 'factory.command.execute'
  AND role.code NOT IN ('demo_admin', 'demo_kiln', 'plant_head');

INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT gen_random_uuid(), role.tenant_id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  role.id, 'factory.command.execute'
FROM role
WHERE role.code IN ('demo_admin', 'demo_kiln', 'plant_head') AND role.is_active = true
ON CONFLICT (tenant_id, role_id, permission) DO UPDATE SET
  is_active = true,
  updated_at = now(),
  updated_by = EXCLUDED.updated_by;
