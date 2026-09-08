-- =============================================================================
-- 0092 — 3S Factory Operations / Workroom POC evidence.
--
-- This is an intentionally small, customer-specific simulator snapshot. It binds the
-- existing 3S Maintenance assets and Planning work centres into Factory Connect and stores
-- enough explicit shift evidence to calculate OEE. Job/operator assignments are mock
-- projection evidence only: Production, Planning and HR remain their systems of record.
-- No row below is a physical command and no proposed replan is auto-published.
-- =============================================================================

-- These four codes and ids are the scenario's stable append-only identities. A custom
-- installation may already use a code or id, so fail with an intentional precondition
-- before any state-event FK can fail opaquely. Empty/fresh databases pass and are seeded.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('AST-PNQ-VMC-01', '0192a8c0-0092-7000-8000-000000000010'::uuid),
      ('AST-PNQ-VMC-02', '0192a8c0-0092-7000-8000-000000000011'::uuid),
      ('AST-PNQ-TRN-01', '0192a8c0-0092-7000-8000-000000000012'::uuid),
      ('AST-PNQ-LTH-02', '0192a8c0-0092-7000-8000-000000000013'::uuid)
    ) AS expected(asset_code, asset_id)
    JOIN industrial_asset_binding asset
      ON asset.tenant_id = '0192a8c0-0000-7000-8000-000000000001'::uuid
     AND (asset.asset_code = expected.asset_code OR asset.id = expected.asset_id)
    WHERE asset.asset_code <> expected.asset_code OR asset.id <> expected.asset_id
  ) THEN
    RAISE EXCEPTION '0092 Workroom precondition failed: a 3S scenario asset code or fixed id is already bound to a different asset';
  END IF;
END $$;

INSERT INTO industrial_asset_binding (
  id, tenant_id, created_by, updated_by, asset_code, name, asset_kind, site_code,
  zone_code, gateway_id, connector_code, external_ref, maintenance_asset_ref,
  work_center_ref, manufacturer, model, controller_version, command_policy, attributes
) VALUES
  (
    '0192a8c0-0092-7000-8000-000000000010',
    '0192a8c0-0000-7000-8000-000000000001',
    '0192a8c0-0000-7000-8000-0000000000ff',
    '0192a8c0-0000-7000-8000-0000000000ff',
    'AST-PNQ-VMC-01', 'VMC 850 #1', 'machine', 'PUNE-01', 'MACHINE-SHOP',
    '0192a8c0-0073-7000-8000-000000000001', 'opcua_robotics',
    'poc://3s/machine-shop/vmc-01',
    '0192a8c0-0027-7000-8300-000000000010',
    '0192a8c0-0032-7000-8000-000000000015',
    'Jyoti', 'VMC 850', 'mock-workroom-v1',
    '{"allowlistedCapabilities":[],"requiresApproval":true,"forbidden":["physical.command","schedule.publish","safety.override"]}'::jsonb,
    '{
      "targetCycleSeconds":600,"mapX":48,"mapY":38,
      "workroom":{
        "mockOnly":true,"workCenterCode":"WC-VMC01",
        "alternateAssetCodes":["AST-PNQ-VMC-02"],
        "job":{"jobId":"POC-REPLAY-MO-2627-00004-OP10","orderRef":"MO-2627-00004","itemCode":"PMP-PX400","operationCode":"OP-10","operationName":"Machine casing faces and register bore · POC replay snapshot","quantity":40,"dueAt":"2026-08-22T18:00:00+05:30","priority":10},
        "operator":{"employeeRef":"0192a8c0-0025-7000-8000-000000000208","employeeCode":"3S-0008","name":"Sanjay Patil","skill":"CNC Operator · VMC","shiftCode":"A","availability":"configured_available","basis":"3S mock snapshot: active HR employee, CNC Operator designation and Shift A default. Not a live roster write."}
      }
    }'::jsonb
  ),
  (
    '0192a8c0-0092-7000-8000-000000000011',
    '0192a8c0-0000-7000-8000-000000000001',
    '0192a8c0-0000-7000-8000-0000000000ff',
    '0192a8c0-0000-7000-8000-0000000000ff',
    'AST-PNQ-VMC-02', 'VMC 850 #2', 'machine', 'PUNE-01', 'MACHINE-SHOP',
    '0192a8c0-0073-7000-8000-000000000001', 'opcua_robotics',
    'poc://3s/machine-shop/vmc-02',
    '0192a8c0-0027-7000-8300-000000000020',
    '0192a8c0-0032-7000-8000-000000000015',
    'Jyoti', 'VMC 850', 'mock-workroom-v1',
    '{"allowlistedCapabilities":[],"requiresApproval":true,"forbidden":["physical.command","schedule.publish","safety.override"]}'::jsonb,
    '{"targetCycleSeconds":600,"mapX":61,"mapY":38,"workroom":{"mockOnly":true,"workCenterCode":"WC-VMC01","alternateAssetCodes":["AST-PNQ-VMC-01"]}}'::jsonb
  ),
  (
    '0192a8c0-0092-7000-8000-000000000012',
    '0192a8c0-0000-7000-8000-000000000001',
    '0192a8c0-0000-7000-8000-0000000000ff',
    '0192a8c0-0000-7000-8000-0000000000ff',
    'AST-PNQ-TRN-01', 'CNC turning centre', 'machine', 'PUNE-01', 'MACHINE-SHOP',
    '0192a8c0-0073-7000-8000-000000000001', 'opcua_robotics',
    'poc://3s/machine-shop/lathe-01',
    '0192a8c0-0027-7000-8300-000000000021',
    '0192a8c0-0032-7000-8000-000000000013',
    'Ace', 'LT-20', 'mock-workroom-v1',
    '{"allowlistedCapabilities":[],"requiresApproval":true,"forbidden":["physical.command","schedule.publish","safety.override"]}'::jsonb,
    '{
      "targetCycleSeconds":1260,"mapX":48,"mapY":58,
      "workroom":{
        "mockOnly":true,"workCenterCode":"WC-LTH01",
        "alternateAssetCodes":["AST-PNQ-LTH-02"],
        "job":{"jobId":"POC-REPLAY-MO-2627-00003-OP10","orderRef":"MO-2627-00003","itemCode":"CMP-PX4-SFT","operationCode":"OP-10","operationName":"Turn and grind shaft to 32 mm · POC replay snapshot","quantity":45,"dueAt":"2026-08-23T18:00:00+05:30","priority":20},
        "operator":{"employeeRef":"0192a8c0-0025-7000-8000-000000000209","employeeCode":"3S-0009","name":"Vikram Jadhav","skill":"CNC Operator · Turning","shiftCode":"B","availability":"configured_available","basis":"3S mock snapshot: active HR employee, CNC Operator designation and Shift B default. Not a live roster write."}
      }
    }'::jsonb
  ),
  (
    '0192a8c0-0092-7000-8000-000000000013',
    '0192a8c0-0000-7000-8000-000000000001',
    '0192a8c0-0000-7000-8000-0000000000ff',
    '0192a8c0-0000-7000-8000-0000000000ff',
    'AST-PNQ-LTH-02', 'CNC lathe 2 · planning alternate', 'machine', 'PUNE-01', 'MACHINE-SHOP',
    '0192a8c0-0073-7000-8000-000000000001', 'opcua_robotics',
    'poc://3s/machine-shop/lathe-02', NULL,
    '0192a8c0-0032-7000-8000-000000000014',
    '3S POC', 'Configured alternate', 'mock-workroom-v1',
    '{"allowlistedCapabilities":[],"requiresApproval":true,"forbidden":["physical.command","schedule.publish","safety.override"]}'::jsonb,
    '{"targetCycleSeconds":1260,"mapX":61,"mapY":58,"workroom":{"mockOnly":true,"workCenterCode":"WC-LTH02","alternateAssetCodes":["AST-PNQ-TRN-01"]}}'::jsonb
  )
ON CONFLICT (tenant_id, asset_code) DO UPDATE SET
  maintenance_asset_ref = EXCLUDED.maintenance_asset_ref,
  work_center_ref = EXCLUDED.work_center_ref,
  attributes = EXCLUDED.attributes,
  updated_at = now(),
  updated_by = EXCLUDED.updated_by;

INSERT INTO asset_state_event (
  id, tenant_id, created_by, updated_by, asset_id, source_event_id, observed_at,
  state, safety_state, active_program, work_ref, material_ref,
  cycle_time_seconds, good_count, reject_count, energy_kwh, alarm_code, evidence
) VALUES
  (
    '0192a8c0-0092-7000-8000-000000000020',
    '0192a8c0-0000-7000-8000-000000000001',
    '0192a8c0-0000-7000-8000-0000000000ff',
    '0192a8c0-0000-7000-8000-0000000000ff',
    '0192a8c0-0092-7000-8000-000000000010', 'workroom-poc-vmc01-shift-a',
    now() - interval '45 seconds', 'running', 'normal', 'PX400_VMC_OP10',
    'MO-2627-00004', 'PMP-PX400', 635, 37, 1, 52.8100, NULL,
    '{"source":"configured_3s_mock_shift","mockOnly":true,"physicalControllerContacted":false,"autoPublished":false,"boundary":"3S deterministic POC evidence only; not machine telemetry.","mockShift":{"code":"A","label":"Shift A · deterministic POC snapshot","source":"configured_3s_mock_shift","plannedProductionSeconds":27000,"runSeconds":24300,"idealCycleSeconds":600}}'::jsonb
  ),
  (
    '0192a8c0-0092-7000-8000-000000000021',
    '0192a8c0-0000-7000-8000-000000000001',
    '0192a8c0-0000-7000-8000-0000000000ff',
    '0192a8c0-0000-7000-8000-0000000000ff',
    '0192a8c0-0092-7000-8000-000000000011', 'workroom-poc-vmc02-shift-a',
    now() - interval '35 seconds', 'idle', 'normal', NULL, NULL, NULL,
    610, 5, 0, 8.4200, NULL,
    '{"source":"configured_3s_mock_shift","mockOnly":true,"physicalControllerContacted":false,"autoPublished":false,"boundary":"3S deterministic POC evidence only; not machine telemetry.","mockShift":{"code":"A","label":"Shift A · deterministic POC snapshot","source":"configured_3s_mock_shift","plannedProductionSeconds":27000,"runSeconds":3600,"idealCycleSeconds":600}}'::jsonb
  ),
  (
    '0192a8c0-0092-7000-8000-000000000022',
    '0192a8c0-0000-7000-8000-000000000001',
    '0192a8c0-0000-7000-8000-0000000000ff',
    '0192a8c0-0000-7000-8000-0000000000ff',
    '0192a8c0-0092-7000-8000-000000000012', 'workroom-poc-lathe01-shift-b',
    now() - interval '30 seconds', 'running', 'normal', 'PX400_SHAFT_OP10',
    'MO-2627-00003', 'CMP-PX4-SFT', 1320, 18, 0, 38.6700, NULL,
    '{"source":"configured_3s_mock_shift","mockOnly":true,"physicalControllerContacted":false,"autoPublished":false,"boundary":"3S deterministic POC evidence only; not machine telemetry.","mockShift":{"code":"B","label":"Shift B · deterministic POC snapshot","source":"configured_3s_mock_shift","plannedProductionSeconds":27000,"runSeconds":23800,"idealCycleSeconds":1260}}'::jsonb
  ),
  (
    '0192a8c0-0092-7000-8000-000000000023',
    '0192a8c0-0000-7000-8000-000000000001',
    '0192a8c0-0000-7000-8000-0000000000ff',
    '0192a8c0-0000-7000-8000-0000000000ff',
    '0192a8c0-0092-7000-8000-000000000013', 'workroom-poc-lathe02-shift-a',
    now() - interval '25 seconds', 'idle', 'normal', NULL, NULL, NULL,
    NULL, 0, 0, 2.1100, NULL,
    '{"source":"configured_3s_mock_shift","mockOnly":true,"physicalControllerContacted":false,"autoPublished":false,"boundary":"3S deterministic POC evidence only; not machine telemetry.","mockShift":{"code":"A","label":"Shift A · deterministic POC snapshot","source":"configured_3s_mock_shift","plannedProductionSeconds":27000,"runSeconds":0,"idealCycleSeconds":1260}}'::jsonb
  )
ON CONFLICT (tenant_id, asset_id, source_event_id) DO NOTHING;

UPDATE factory_edge_gateway
SET last_heartbeat_at = now(), updated_at = now(),
    updated_by = '0192a8c0-0000-7000-8000-0000000000ff'::uuid
WHERE tenant_id = '0192a8c0-0000-7000-8000-000000000001'::uuid
  AND code = 'EDGE-PUNE-01' AND deployment_mode = 'simulator' AND is_active = true;

-- The hosted 3S presenter may operate this one no-hardware scenario through the existing
-- telemetry permission. The API still verifies the exact tenant, asset and simulator
-- gateway. No new permission or auth bypass is introduced.
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT CASE role.code
    WHEN 'demo_admin' THEN '0192a8c0-0092-7000-8000-0000000000a1'::uuid
    WHEN 'demo_kiln' THEN '0192a8c0-0092-7000-8000-0000000000a2'::uuid
  END,
  role.tenant_id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  role.id, 'factory.telemetry.ingest'
FROM role
WHERE role.tenant_id = '0192a8c0-0000-7000-8000-000000000001'::uuid
  AND role.code IN ('demo_admin', 'demo_kiln')
  AND role.is_active = true
ON CONFLICT (tenant_id, role_id, permission) DO UPDATE SET
  is_active = true, updated_at = now(), updated_by = EXCLUDED.updated_by;
