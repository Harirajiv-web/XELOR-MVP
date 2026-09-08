-- =============================================================================
-- 0037_seed_administration — the control plane, seeded against the §7 demo universe.
--
-- The interesting seed rows are the ones that are deliberately WRONG in a realistic way:
-- a demo tenant where every control is already green proves nothing. So 3S ships with
-- a real segregation-of-duties conflict on a real person, an incident mid-way through its
-- six-hour CERT-In clock, and an erasure request that must be refused because the
-- Companies Act says the books stay for eight years.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The roles the control plane needs. `admin` and `stores_incharge` already exist.
-- ---------------------------------------------------------------------------

UPDATE role SET is_privileged = true, is_row_unrestricted = true,
                description = 'Full administrative access. Forces MFA; removing it revokes live sessions.'
 WHERE code = 'admin';

INSERT INTO role (id, tenant_id, created_by, updated_by, code, name, description, category, is_privileged, is_row_unrestricted) VALUES
 ('0192a8c0-0036-7000-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','buyer','Buyer','Raises purchase orders.','functional',false,false),
 ('0192a8c0-0036-7000-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','purchase_approver','Purchase Approver','Approves purchase orders.','approval',true,false),
 ('0192a8c0-0036-7000-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','vendor_master','Vendor Master','Creates and edits vendors.','master',false,false),
 ('0192a8c0-0036-7000-8000-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','payments','Payments','Releases payments to vendors.','financial',true,false),
 ('0192a8c0-0036-7000-8000-000000000005','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','accountant','Accountant','Posts journal entries.','financial',false,false),
 ('0192a8c0-0036-7000-8000-000000000006','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','finance_controller','Finance Controller','Closes periods and overrides budgets.','financial',true,false),
 ('0192a8c0-0036-7000-8000-000000000007','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','goods_receipt','Goods Receipt','Records what physically arrived.','functional',false,false),
 ('0192a8c0-0036-7000-8000-000000000008','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','payroll_admin','Payroll Administrator','Prepares payroll.','financial',true,false),
 ('0192a8c0-0036-7000-8000-000000000009','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','payroll_approver','Payroll Approver','Approves and releases payroll.','approval',true,false),
 ('0192a8c0-0036-7000-8000-00000000000a','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','cnc_operator','CNC Operator','Shop-floor operator; one plant, costs masked.','shopfloor',false,false),
 ('0192a8c0-0036-7000-8000-00000000000b','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','plant_head','Plant Head','Runs one plant end to end.','management',true,false),
 ('0192a8c0-0036-7000-8000-00000000000c','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','security_admin','Security Administrator','Owns the audit trail, incidents and access reviews.','security',true,false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Permission catalogue (an excerpt — enough for the console to explain access).
-- ---------------------------------------------------------------------------

INSERT INTO permission_catalogue (id, tenant_id, created_by, updated_by, permission, doc_type, action, description, is_privileged)
SELECT ('0192a8c0-0036-7100-8000-0000000000' || lpad(row_number() over ()::text, 2, '0'))::uuid,
       '0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
       p.permission, p.doc_type, p.action, p.description, p.priv
FROM (VALUES
  ('purchase.po.create','purchase_order','create','Raise a purchase order.',false),
  ('purchase.po.submit','purchase_order','submit','Submit a purchase order for approval.',false),
  ('purchase.po.amend','purchase_order','amend','Approve (amend the state of) a purchase order. There is no ''approve'' action — the 13 are closed, and approval is a state change.',true),
  ('purchase.vendor.create','vendor','create','Create a vendor.',false),
  ('accounts.journal.create','journal','create','Post a journal entry.',false),
  ('accounts.period.cancel','accounting_period','cancel','Close an accounting period.',true),
  ('inventory.stock.read','stock','read','Read stock balances.',false),
  ('inventory.stock.write','stock','write','Post a stock movement.',false),
  ('production.order.read','production_order','read','Read work orders.',false),
  ('production.order.write','production_order','write','Record production output.',false),
  ('planning.mrp.run','mrp_run','run','Run material requirements planning. "run" is an operational verb, not one of the 13 document actions — it says what it guards.',false),
  ('hrm.payroll.approve','payroll_run','approve','Approve and release a payroll run.',true),
  ('inventory.stock.post','stock_entry','post','Post a stock movement through the single write path.',false),
  ('admin.audit.read','audit_log','read','Read the audit trail.',true),
  ('admin.audit.export','audit_log','export','Export the Rule 11(g) auditor pack.',true),
  ('admin.access.read','role','read','Read roles, grants and scopes.',true),
  ('admin.access.write','role','write','Grant and revoke access.',true),
  ('admin.incident.write','security_incident','write','Record and report security incidents.',true),
  ('admin.dsr.write','dsr_request','write','Handle data-principal requests.',true),
  ('admin.apikey.write','api_key','write','Issue and revoke machine keys.',true),
  ('admin.settings.write','system_setting','write','Change platform settings.',true)
) AS p(permission, doc_type, action, description, priv)
ON CONFLICT (tenant_id, permission) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Segregation of duties — the classics, in canonical (a < b) order.
--
-- Only ONE is set to `prevent`. Blocking every classic conflict in a plant whose entire
-- office is four people stops the plant, and a control that stops the plant is switched
-- off in week two — after which nothing is controlled at all.
-- ---------------------------------------------------------------------------

INSERT INTO sod_rule (id, tenant_id, created_by, updated_by, name, role_a_code, role_b_code, risk_level, enforcement, description, compensating_control, source_note) VALUES
 ('0192a8c0-0036-7200-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'Raise and approve a purchase order','buyer','purchase_approver','critical','prevent',
  'One person who can both raise a purchase order and approve it can commit company money to any supplier with no second pair of eyes.',
  NULL,'Classic procure-to-pay conflict; ICAI/IIA standard control matrix.'),
 ('0192a8c0-0036-7200-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'Create a vendor and pay it','payments','vendor_master','critical','warn',
  'Creating a vendor and releasing payment to it allows money to be paid to a supplier the same person invented.',
  'Every new vendor''s first payment is reviewed by the finance controller','Classic procure-to-pay conflict; the fictitious-vendor scheme.'),
 ('0192a8c0-0036-7200-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'Post a journal and close the period','accountant','finance_controller','high','detect',
  'Posting entries and closing the period lets an adjustment be made and sealed before anyone else looks at it.',
  'Period-close checklist is signed off by a second person','Classic record-to-report conflict.'),
 ('0192a8c0-0036-7200-8000-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'Receive goods and pay for them','goods_receipt','payments','high','warn',
  'Recording what arrived and paying for it allows payment for goods that never came through the gate.',
  'Three-way match (PO / GRN / invoice) is enforced by the system','Classic procure-to-pay conflict.'),
 ('0192a8c0-0036-7200-8000-000000000005','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'Prepare and approve payroll','payroll_admin','payroll_approver','critical','prevent',
  'Preparing payroll and approving it allows a payment to a person who does not work here.',
  NULL,'Classic hire-to-retire conflict; the ghost-employee scheme.')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- People, and a REAL conflict on one of them.
-- ---------------------------------------------------------------------------

INSERT INTO app_user (id, tenant_id, created_by, updated_by, keycloak_sub, login_email, full_name, status, mfa_enrolled, last_login_at) VALUES
 ('0192a8c0-0036-7300-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0036-7300-8000-000000000001','rajesh.kulkarni@trishul.example','Rajesh Kulkarni','active',true,'2026-07-20T03:40:00Z'),
 ('0192a8c0-0036-7300-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0036-7300-8000-000000000002','priya.deshmukh@trishul.example','Priya Deshmukh','active',true,'2026-07-20T04:05:00Z'),
 ('0192a8c0-0036-7300-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0036-7300-8000-000000000003','sanjay.patil@trishul.example','Sanjay Patil','active',false,'2026-07-20T02:15:00Z'),
 ('0192a8c0-0036-7300-8000-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0036-7300-8000-000000000004','meena.iyer@trishul.example','Meena Iyer','active',true,'2026-07-19T11:20:00Z')
ON CONFLICT (id) DO NOTHING;

-- Priya holds BOTH buyer and purchase_approver — a live critical conflict on the demo
-- tenant, because a control plane whose every light is green demonstrates nothing.
INSERT INTO user_role (id, tenant_id, created_by, updated_by, subject, role_id) VALUES
 ('0192a8c0-0036-7400-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0036-7300-8000-000000000002','0192a8c0-0036-7000-8000-000000000001'),
 ('0192a8c0-0036-7400-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0036-7300-8000-000000000002','0192a8c0-0036-7000-8000-000000000002'),
 ('0192a8c0-0036-7400-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0036-7300-8000-000000000003','0192a8c0-0036-7000-8000-00000000000a'),
 ('0192a8c0-0036-7400-8000-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0036-7300-8000-000000000001','0192a8c0-0036-7000-8000-00000000000b'),
 ('0192a8c0-0036-7400-8000-000000000005','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0036-7300-8000-000000000004','0192a8c0-0036-7000-8000-00000000000c'),
 ('0192a8c0-0036-7400-8000-000000000006','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0036-7300-8000-000000000004','0192a8c0-0036-7000-8000-000000000005'),
 ('0192a8c0-0036-7400-8000-000000000007','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0036-7300-8000-000000000004','0192a8c0-0036-7000-8000-000000000006')
ON CONFLICT (id) DO NOTHING;

-- Sanjay is a CNC operator scoped to ONE plant. With no row here he would see nothing —
-- which is the correct default, and the demo beat.
INSERT INTO user_permission_scope (id, tenant_id, created_by, updated_by, subject, scope_dimension, scope_value_id, apply_to_doc_type, is_default, granted_by, justification) VALUES
 ('0192a8c0-0036-7500-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0036-7300-8000-000000000003','plant','pune-chakan',NULL,true,'0192a8c0-0036-7300-8000-000000000004','Works the Pune-Chakan line.'),
 ('0192a8c0-0036-7500-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0036-7300-8000-000000000001','plant','pune-chakan',NULL,true,'0192a8c0-0036-7300-8000-000000000004','Plant head, Pune-Chakan.')
ON CONFLICT (id) DO NOTHING;

-- A CNC operator may see a work order but not what it cost.
INSERT INTO field_permission (id, tenant_id, created_by, updated_by, role_id, doc_type, field_name, access, mask_format) VALUES
 ('0192a8c0-0036-7600-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0036-7000-8000-00000000000a','production_order','standardCost','masked','amount_band'),
 ('0192a8c0-0036-7600-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0036-7000-8000-00000000000a','production_order','vendorRate','hidden',NULL),
 ('0192a8c0-0036-7600-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0036-7000-8000-00000000000a','production_order','orderNo','read_only',NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Settings with statutory floors. The floor is enforced by a CHECK as well as by the
-- service layer — a floor only one code path checks lasts until somebody writes a second.
-- ---------------------------------------------------------------------------

INSERT INTO system_setting (id, tenant_id, created_by, updated_by, setting_key, value_type, value, statutory_floor, floor_source, description) VALUES
 ('0192a8c0-0036-7700-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','audit.retention_years','int','8',8,'MCA Rule 11(g)','Years the audit trail must be kept unalterable.'),
 ('0192a8c0-0036-7700-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','logs.security_min_retention_days','int','180',180,'CERT-In Directions 2022','Days security logs are retained, India-resident.'),
 ('0192a8c0-0036-7700-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','logs.pii_access_min_retention_days','int','365',365,'DPDP readiness','Days PII-access logs are retained.'),
 ('0192a8c0-0036-7700-8000-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','session.idle_timeout_minutes','int','30',NULL,NULL,'Idle minutes before a session is ended.'),
 ('0192a8c0-0036-7700-8000-000000000005','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','ntp.primary_source','text','samay1.nic.in',NULL,NULL,'Time source; CERT-In requires NIC/NPL traceability.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO feature_flag (id, tenant_id, created_by, updated_by, flag_key, description, enabled, scope, environment) VALUES
 ('0192a8c0-0036-7800-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','ai_sod_explain','AI #8 — let the model phrase a segregation-of-duties finding the rules already produced.',false,'tenant','live'),
 ('0192a8c0-0036-7800-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','sod_prevent_enforcement','Enforce `prevent`-level SoD rules at the point of grant.',true,'tenant','live')
ON CONFLICT (id) DO NOTHING;

INSERT INTO licence_record (id, tenant_id, created_by, updated_by, plan, named_seats, modules, valid_from, valid_to, enforcement) VALUES
 ('0192a8c0-0036-7900-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','XELOR Plant',25,
  '["general","engineering","inventory","purchase","production","quality","sales","accounts","hrm","maintenance","csp","expenditure","planning","administration"]'::jsonb,
  '2026-04-01','2027-03-31','soft')
ON CONFLICT (id) DO NOTHING;

INSERT INTO backup_job (id, tenant_id, created_by, updated_by, name, schedule, target, region, encryption, retention_policy, last_run_at, last_run_status, last_size_bytes, last_restore_test_at, restore_preserved_chain) VALUES
 ('0192a8c0-0036-7a00-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','Nightly full + PITR','0 18 * * *','s3://xelor-backups-ap-south-1/trishul','ap-south-1','kms','GFS: 7 daily, 5 weekly, 12 monthly, 8 yearly','2026-07-19T18:30:00Z','success',48213004288,'2026-07-05T06:00:00Z',true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- A live incident, mid-clock. Detected 09:12 UTC on demo day; six-hour CERT-In deadline
-- at 15:12; personal data affected, so the 72-hour Board clock is running in parallel.
-- ---------------------------------------------------------------------------

INSERT INTO security_incident (id, tenant_id, created_by, updated_by, incident_no, title, severity, category, detected_at, description, pii_affected, data_principals_estimate, cert_in_reportable, cert_in_due_at, dpdp_board_due_at, status, containment_note) VALUES
 ('0192a8c0-0036-7b00-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'INC-2627-0007','Credential-stuffing attempt against the customer portal','high','Unauthorised access to IT systems / data breach',
  '2026-07-20T09:12:00Z',
  '4,812 failed logins from 213 source addresses over 40 minutes against portal accounts. Three accounts locked. One session showed a successful login from an unfamiliar address and was revoked.',
  true, 3, true,
  '2026-07-20T15:12:00Z', '2026-07-23T09:12:00Z',
  'contained','Portal rate limit tightened, three accounts locked, one session revoked, source ranges blocked at the edge.')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Data-principal requests: one running, one that must be REFUSED.
-- ---------------------------------------------------------------------------

INSERT INTO dsr_request (id, tenant_id, created_by, updated_by, request_no, request_type, data_principal_ref, received_at, due_at, status, statutory_hold_refs) VALUES
 ('0192a8c0-0036-7c00-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'DSR-2627-0001','access','EMP-TR-0184','2026-07-06T04:30:00Z','2026-10-04','in_progress',NULL),
 ('0192a8c0-0036-7c00-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'DSR-2627-0002','erasure','EMP-TR-0092','2026-06-15T05:00:00Z','2026-09-13','refused_statutory_hold',
  'Companies Act 2013 s.128 — books of account retained 8 years; Income-tax Act s.44AA')
ON CONFLICT (id) DO NOTHING;

-- Employment data is processed under LEGITIMATE USE (s.7), not consent. Recording it as
-- consent would imply payroll stops the moment somebody clicks withdraw.
INSERT INTO consent_record (id, tenant_id, created_by, updated_by, data_principal_ref, purpose_code, basis, given_at, via, notice_version) VALUES
 ('0192a8c0-0036-7d00-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','EMP-TR-0184','payroll_and_statutory','legitimate_use_employment',NULL,'direct','notice-v1.0'),
 ('0192a8c0-0036-7d00-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CUST-PORTAL-0031','service_portal_contact','consent','2026-05-11T06:20:00Z','direct','notice-v1.0')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- NTP traceability evidence and a shop-floor kiosk key.
-- ---------------------------------------------------------------------------

INSERT INTO time_sync_log (tenant_id, host, source, offset_ms, checked_at) VALUES
 ('0192a8c0-0000-7000-8000-000000000001','api-1','samay1.nic.in',2.310,'2026-07-20T03:00:00Z'),
 ('0192a8c0-0000-7000-8000-000000000001','api-1','samay1.nic.in',1.870,'2026-07-20T09:00:00Z'),
 ('0192a8c0-0000-7000-8000-000000000001','worker-1','samay2.nic.in',3.040,'2026-07-20T09:00:00Z');

-- ---------------------------------------------------------------------------
-- Kaveri — the RLS leak-probe counterpart. Enough rows that a cross-tenant query has
-- something to WRONGLY return if the fence ever fails.
-- ---------------------------------------------------------------------------

INSERT INTO app_user (id, tenant_id, created_by, updated_by, keycloak_sub, login_email, full_name, status, mfa_enrolled) VALUES
 ('0192a8c0-0036-7300-8000-0000000000f1','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0036-7300-8000-0000000000f1','admin@kaveri.example','Kaveri Administrator','active',true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sod_rule (id, tenant_id, created_by, updated_by, name, role_a_code, role_b_code, risk_level, enforcement, description, source_note) VALUES
 ('0192a8c0-0036-7200-8000-0000000000f1','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'Raise and approve a purchase order','buyer','purchase_approver','critical','prevent','Kaveri counterpart rule.','Leak-probe counterpart.')
ON CONFLICT (id) DO NOTHING;
