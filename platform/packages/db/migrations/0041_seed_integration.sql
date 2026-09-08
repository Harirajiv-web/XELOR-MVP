-- =============================================================================
-- 0041_seed_integration — the edge, seeded against the §7 demo universe.
--
-- Every connection ships in `fake` adapter mode. That is not a shortcut: it is how the
-- outage handling can be rehearsed at all. A system whose failover can only be demonstrated
-- by causing a real failure never gets demonstrated, and the first time anybody sees it is
-- during the incident.
-- =============================================================================

INSERT INTO connector (id, tenant_id, created_by, updated_by, code, name, category, protocol, direction, capabilities) VALUES
 ('0192a8c0-0040-7000-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','gsp_einvoice_sandbox','GSP e-Invoice (sandbox)','statutory','https','outbound','["generate_irn","get_irn_by_doc","cancel_irn"]'::jsonb),
 ('0192a8c0-0040-7000-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','gsp_ewb_sandbox','GSP e-Way Bill (dual portal)','statutory','https','outbound','["generate_ewb","update_part_b","cancel_ewb","close_ewb"]'::jsonb),
 ('0192a8c0-0040-7000-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','tally_csv_export','Tally CSV export','accounting','file','outbound','["export_vouchers"]'::jsonb),
 ('0192a8c0-0040-7000-8000-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','suvarna_bank_h2h','Suvarna Bank host-to-host','bank','sftp','bidirectional','["payment_file","ack_import"]'::jsonb),
 ('0192a8c0-0040-7000-8000-000000000005','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','biometric_sftp_csv','Biometric punch drop (SFTP CSV)','hr_device','sftp','inbound','["pull_punches"]'::jsonb),
 ('0192a8c0-0040-7000-8000-000000000006','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','mqtt_cnc_mock','CNC machine telemetry (MQTT)','ot','mqtt','inbound','["subscribe_tags"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO credential (id, tenant_id, created_by, updated_by, label, credential_type, encrypted_data_key, ciphertext_ref, rotation_policy_days, last_rotated_at) VALUES
 ('0192a8c0-0040-7100-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','gsp-sandbox-api','api_key','kms:ap-south-1:key/demo-0001','secretsmanager://xelor/gsp/sandbox',90,'2026-06-01T00:00:00Z'),
 ('0192a8c0-0040-7100-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','suvarna-sftp-key','sftp_key','kms:ap-south-1:key/demo-0002','secretsmanager://xelor/bank/suvarna',180,'2026-05-15T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO connection (id, tenant_id, created_by, updated_by, connector_id, name, environment, adapter_mode, endpoint_url, secondary_endpoint_url, auth_type, credential_id, health_status) VALUES
 ('0192a8c0-0040-7200-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0040-7000-8000-000000000001','gsp-einvoice','uat','fake',NULL,NULL,'api_key','0192a8c0-0040-7100-8000-000000000001','healthy'),
 -- Two endpoints on purpose: the e-way bill portal has scheduled and unscheduled downtime,
 -- and a truck at a gate cannot wait for it.
 ('0192a8c0-0040-7200-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0040-7000-8000-000000000002','gsp-ewaybill','uat','fake',NULL,NULL,'api_key','0192a8c0-0040-7100-8000-000000000001','healthy'),
 ('0192a8c0-0040-7200-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0040-7000-8000-000000000004','suvarna-bank','uat','fake',NULL,NULL,'sftp_key','0192a8c0-0040-7100-8000-000000000002','healthy'),
 ('0192a8c0-0040-7200-8000-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0040-7000-8000-000000000005','biometric-drop','uat','fake',NULL,NULL,'sftp_key','0192a8c0-0040-7100-8000-000000000002','healthy')
ON CONFLICT (id) DO NOTHING;

INSERT INTO integration_flow (id, tenant_id, created_by, updated_by, code, name, trigger_type, source_connection_id, target_connection_id, canonical_entity, status, sla_ms, is_statutory) VALUES
 ('0192a8c0-0040-7300-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','invoice_to_irn','Sales invoice → IRN','event',NULL,'0192a8c0-0040-7200-8000-000000000001','invoice','active',30000,true),
 ('0192a8c0-0040-7300-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','dispatch_to_ewb','Dispatch → e-way bill','event',NULL,'0192a8c0-0040-7200-8000-000000000002','shipment','active',30000,true),
 ('0192a8c0-0040-7300-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','punch_import','Biometric punches → attendance','schedule','0192a8c0-0040-7200-8000-000000000004',NULL,'attendance_punch','active',NULL,false),
 ('0192a8c0-0040-7300-8000-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','payment_file','Payment run → bank file','manual',NULL,'0192a8c0-0040-7200-8000-000000000003','payment_batch','active',NULL,false)
ON CONFLICT (id) DO NOTHING;

-- The punch-import mapping. `uqc_codes` is not used here, but `to_iso_date` is — and it is
-- the field that catches a device exporting dd/mm/yyyy while the parser assumes mm/dd,
-- which produces a valid-looking wrong date for eleven days of every month.
INSERT INTO field_mapping (id, tenant_id, created_by, updated_by, flow_id, seq, source_path, canonical_path, transform_name, default_value, is_required, lookup_table) VALUES
 ('0192a8c0-0040-7400-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0040-7300-8000-000000000003',1,'EmpCode','employeeRef','trim',NULL,true,NULL),
 ('0192a8c0-0040-7400-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0040-7300-8000-000000000003',2,'PunchDate','punchDate','to_iso_date',NULL,true,NULL),
 ('0192a8c0-0040-7400-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0040-7300-8000-000000000003',3,'Direction','direction','upper',NULL,true,NULL),
 ('0192a8c0-0040-7400-8000-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0040-7300-8000-000000000003',4,'DeviceId','deviceRef','trim','GATE-1',false,NULL)
ON CONFLICT (id) DO NOTHING;

-- The bank payment-file mapping, where a unit lookup and a money conversion both matter.
INSERT INTO field_mapping (id, tenant_id, created_by, updated_by, flow_id, seq, source_path, canonical_path, transform_name, is_required, lookup_table) VALUES
 ('0192a8c0-0040-7400-8000-000000000011','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0040-7300-8000-000000000004',1,'Beneficiary.Name','beneficiaryName','trim',true,NULL),
 ('0192a8c0-0040-7400-8000-000000000012','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0040-7300-8000-000000000004',2,'Beneficiary.IFSC','ifsc','upper',true,NULL),
 ('0192a8c0-0040-7400-8000-000000000013','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0040-7300-8000-000000000004',3,'Amount','amountPaise','rupees_to_paise',true,NULL),
 ('0192a8c0-0040-7400-8000-000000000014','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0040-7300-8000-000000000004',4,'State','stateCode',NULL,true,'gst_state_codes')
ON CONFLICT (id) DO NOTHING;

INSERT INTO integration_schedule (id, tenant_id, created_by, updated_by, flow_id, cron_expr, timezone, enabled) VALUES
 ('0192a8c0-0040-7500-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0040-7300-8000-000000000003','*/15 * * * *','Asia/Kolkata',true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO api_client (id, tenant_id, created_by, updated_by, client_id, name, secret_hash, scopes, rate_limit_per_min, quota_per_day) VALUES
 ('0192a8c0-0040-7600-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','ashvamedha-dealer-portal','Ashvamedha dealer portal','$argon2id$demo$notarealhash','["orders.read","invoices.read"]'::jsonb,120,50000)
ON CONFLICT (id) DO NOTHING;

-- Kaveri — the leak-probe counterpart.
INSERT INTO connector (id, tenant_id, created_by, updated_by, code, name, category, protocol, direction) VALUES
 ('0192a8c0-0040-7000-8000-0000000000f1','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','gsp_einvoice_sandbox','GSP e-Invoice (sandbox)','statutory','https','outbound')
ON CONFLICT (id) DO NOTHING;
