-- =============================================================================
-- 0029_seed_csp — the service desk: calendar, teams, taxonomy, SLA policies,
--                 portal identities, the entitlement registry and the knowledge base.
--
-- Everything here is CONFIGURATION or MASTER DATA. Not one ticket is seeded. The eight
-- TKT-2627 cases of CSP §20.2, their comments, their pauses, their escalations, their
-- complaints, their CSAT and their AI triage suggestions are all created by the services
-- themselves, through the same code path a customer or an agent would drive — so the demo
-- proves the SLA engine rather than a fixture that agrees with it.
--
-- THREE reconciliations to the established demo universe, stated rather than glossed:
--
--  (a) DEMO "TODAY" IS MONDAY 20 JULY 2026. DECISIONS-V2 §7 fixes it and DECISIONS-V2
--      binds; CSP §20 writes 18-Jul-2026, which is a Saturday. Every SLA figure in this
--      module is therefore COMPUTED at 20-Jul rather than copied from the blueprint's
--      table, and the computed values are what the verification prints.
--
--  (b) THE CUSTOMERS ARE SMBD'S, NOT NEW ONES. CSP §20 names Ashvamedha Motors, BlueOrbit
--      Pumps and Deccan Agrotech; migration 0021 already seeded this tenant's customer
--      master. Inventing three more would give the demo two sets of customers and the
--      first genuinely divergent master in the prototype. The narrative maps onto the
--      existing rows:
--          BlueOrbit Pumps India Pvt Ltd (CUST-BLO) → "BlueOrbit"
--          Sundaram Motors Ltd          (CUST-SUN) → stands in for "Ashvamedha Motors"
--          Bharat Auto Components       (CUST-BAC) → stands in for "Deccan Agrotech"
--      `customer_account_id` is that customer's id, which is exactly what it is for.
--
--  (c) THE MACHINES ARE THE PUMP. §20 names 3S-SFT-001 / 3S-BRG-HSG-004 / 3S-FLG-010;
--      this prototype's item master is the CP-50 centrifugal pump and its components.
--      Serials are minted against the CP-50, and the spare requests are for the seal, the
--      shaft and the impeller that actually exist in Engineering — because a spare request
--      calls ITEM_PROVIDER, and a request for an item that does not exist would be a demo
--      that only works if nobody presses the button.
-- =============================================================================

-- 3S tenant 0192a8c0-0000-7000-8000-000000000001 · Kaveri …002
-- system actor    0192a8c0-0000-7000-8000-0000000000ff
-- customers (SMBD): CUST-BLO …0020-…0002 · CUST-SUN …0020-…0003 · CUST-BAC …0020-…0001
-- employees (HRM):  Priya Deshmukh …0025-…203 · Meera Iyer …0025-…202 · Kavita Rao …0025-…204

-- ---------------------------------------------------------------------------
-- The working calendar. Mon–Sat 09:00–18:00 IST — a nine-hour day, six days a week,
-- which is what a Pune machine shop's service desk actually runs and NOT the Mon–Fri
-- 9-to-5 that a default would have assumed. Assuming an eight-hour day would have
-- promised every customer roughly an extra day on every resolution clock.
--
-- The holiday is real and is inside the demo's forward window: Independence Day,
-- Saturday 15 August 2026 — a working weekday under this calendar, so it has to be an
-- explicit holiday or the clock would keep running through it.
-- ---------------------------------------------------------------------------
INSERT INTO csp_business_calendar
  (id, tenant_id, created_by, updated_by, code, name, working_weekdays,
   day_start_minutes, day_end_minutes, holidays, utc_offset_minutes) VALUES
 ('0192a8c0-0029-7000-8000-000000000001','0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '3S-DESK','3S service desk (Mon–Sat, 09:00–18:00 IST)',
  '[1,2,3,4,5,6]'::jsonb, 540, 1080,
  '["2026-08-15","2026-10-02","2026-11-08"]'::jsonb, 330)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Teams. A ticket is owned by a QUEUE first and a person second, so an agent going on
-- leave leaves a queue with a backlog rather than a set of orphaned tickets.
-- ---------------------------------------------------------------------------
INSERT INTO csp_team (id, tenant_id, created_by, updated_by, code, name, email_alias) VALUES
 ('0192a8c0-0029-7000-8000-000000000101','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','SVC-DESK','Service desk (front line)','service@trishul.example'),
 ('0192a8c0-0029-7000-8000-000000000102','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','SVC-TECH','Technical support','techsupport@trishul.example'),
 ('0192a8c0-0029-7000-8000-000000000103','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','SVC-COMM','Commercial (billing & spares)','accounts@trishul.example')
ON CONFLICT (id) DO NOTHING;

-- Priya Deshmukh is the agent §20.3 names. Meera Iyer is the service manager — the only
-- principal who may reopen outside the window or override a complaint closure.
INSERT INTO csp_team_member (id, tenant_id, created_by, updated_by, team_id, employee_ref, is_lead, is_manager) VALUES
 ('0192a8c0-0029-7000-8000-000000000111','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0029-7000-8000-000000000101','0192a8c0-0025-7000-8000-000000000203',true ,false),
 ('0192a8c0-0029-7000-8000-000000000112','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0029-7000-8000-000000000101','0192a8c0-0025-7000-8000-000000000204',false,false),
 ('0192a8c0-0029-7000-8000-000000000113','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0029-7000-8000-000000000102','0192a8c0-0025-7000-8000-000000000206',true ,false),
 ('0192a8c0-0029-7000-8000-000000000114','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0029-7000-8000-000000000103','0192a8c0-0025-7000-8000-000000000205',true ,false),
 ('0192a8c0-0029-7000-8000-000000000115','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0029-7000-8000-000000000101','0192a8c0-0025-7000-8000-000000000202',false,true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- The category taxonomy. `code` is the stable key: the SLA policies match on it and the
-- AI #3 baseline classifies into exactly this closed set, so a renamed category cannot
-- silently move an SLA or invalidate the eval golden set.
--
-- `creates_complaint` is what turns a product-defect ticket into a Quality hand-off. It
-- is configuration, not a branch in the service.
-- ---------------------------------------------------------------------------
INSERT INTO csp_ticket_category
  (id, tenant_id, created_by, updated_by, code, name, default_team_id, default_priority,
   is_portal_visible, creates_complaint, sort_order) VALUES
 ('0192a8c0-0029-7000-8000-000000000201','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','product_defect' ,'Complaint / Product defect'   ,'0192a8c0-0029-7000-8000-000000000102','high'  ,true ,true ,1),
 ('0192a8c0-0029-7000-8000-000000000202','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','spares_request' ,'Spares request'               ,'0192a8c0-0029-7000-8000-000000000103','medium',true ,false,2),
 ('0192a8c0-0029-7000-8000-000000000203','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','technical_query','Technical query'              ,'0192a8c0-0029-7000-8000-000000000102','medium',true ,false,3),
 ('0192a8c0-0029-7000-8000-000000000204','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','billing_query'  ,'Billing query'                ,'0192a8c0-0029-7000-8000-000000000103','low'   ,true ,false,4),
 ('0192a8c0-0029-7000-8000-000000000205','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','service_query'  ,'Service query'                ,'0192a8c0-0029-7000-8000-000000000101','medium',true ,false,5),
 ('0192a8c0-0029-7000-8000-000000000206','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','warranty_query' ,'Warranty query'               ,'0192a8c0-0029-7000-8000-000000000101','medium',true ,false,6),
 ('0192a8c0-0029-7000-8000-000000000207','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','support'        ,'Support'                      ,'0192a8c0-0029-7000-8000-000000000101','low'   ,true ,false,7),
 -- A DPDP rights request is a ticket like any other operationally, and unlike any other
 -- legally: it has a statutory clock, it is not portal-visible as a category the customer
 -- browses to, and it never routes to the front line.
 ('0192a8c0-0029-7000-8000-000000000208','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','rights_request' ,'Data-protection rights request','0192a8c0-0029-7000-8000-000000000103','high'  ,false,false,8)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SLA policies, in the three precedence bands. `resolveSlaPolicy` picks
-- contract > category > priority, so the AMC's contractual four-hour commitment beats the
-- tenant's own "urgent" default — the contract is the one with a penalty attached.
--
-- The escalation matrix fires each tier exactly once per ticket. t80 warns the owner at
-- 80% of the response clock; t100 tells the service manager it has gone; res100 tells
-- management the resolution allowance has gone. Three tiers, not eight, because an
-- escalation ladder people mute is worse than none.
-- ---------------------------------------------------------------------------
INSERT INTO csp_sla_policy
  (id, tenant_id, created_by, updated_by, code, name, applies_to, match_value,
   response_mins, resolution_mins, calendar_id, pause_on_pending, escalation_matrix, active) VALUES
 -- priority band (the floor: something always matches)
 ('0192a8c0-0029-7000-8000-000000000301','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','SLA-URGENT','Urgent — 4h response / 1 business day','priority','urgent',240,540,'0192a8c0-0029-7000-8000-000000000001',true,
  '[{"tier":"t80","clock":"response","atFraction":0.8,"notifyRole":"owner"},{"tier":"t100","clock":"response","atFraction":1.0,"notifyRole":"service_manager"},{"tier":"res100","clock":"resolution","atFraction":1.0,"notifyRole":"management"}]'::jsonb,true),
 ('0192a8c0-0029-7000-8000-000000000302','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','SLA-HIGH','High — 8h response / 2 business days','priority','high',480,1080,'0192a8c0-0029-7000-8000-000000000001',true,
  '[{"tier":"t80","clock":"response","atFraction":0.8,"notifyRole":"owner"},{"tier":"t100","clock":"response","atFraction":1.0,"notifyRole":"service_manager"},{"tier":"res100","clock":"resolution","atFraction":1.0,"notifyRole":"management"}]'::jsonb,true),
 ('0192a8c0-0029-7000-8000-000000000303','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','SLA-MEDIUM','Medium — 1 business day / 3 business days','priority','medium',540,1620,'0192a8c0-0029-7000-8000-000000000001',true,
  '[{"tier":"t100","clock":"response","atFraction":1.0,"notifyRole":"service_manager"},{"tier":"res100","clock":"resolution","atFraction":1.0,"notifyRole":"management"}]'::jsonb,true),
 ('0192a8c0-0029-7000-8000-000000000304','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','SLA-LOW','Low — 2 business days / 5 business days','priority','low',1080,2700,'0192a8c0-0029-7000-8000-000000000001',true,
  '[{"tier":"res100","clock":"resolution","atFraction":1.0,"notifyRole":"management"}]'::jsonb,true),
 -- category band: a data-protection request has a STATUTORY clock, so it does not inherit
 -- a commercial priority. Response inside one business day, resolved inside the DPDP
 -- window, and it does NOT pause when the desk is waiting on the customer.
 ('0192a8c0-0029-7000-8000-000000000305','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','SLA-DPDP','DPDP rights request — statutory','category','rights_request',540,10800,'0192a8c0-0029-7000-8000-000000000001',false,
  '[{"tier":"t100","clock":"response","atFraction":1.0,"notifyRole":"dpo"},{"tier":"res100","clock":"resolution","atFraction":1.0,"notifyRole":"dpo"}]'::jsonb,true),
 -- contract band: what the comprehensive AMC actually promises. 240 business minutes
 -- response is the contract's own number, and it outranks everything above it.
 ('0192a8c0-0029-7000-8000-000000000306','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','SLA-AMC-COMP','AMC comprehensive — contractual 240-min response','contract','AMC-2627-0002',240,540,'0192a8c0-0029-7000-8000-000000000001',true,
  '[{"tier":"t80","clock":"response","atFraction":0.8,"notifyRole":"owner"},{"tier":"t100","clock":"response","atFraction":1.0,"notifyRole":"service_manager"},{"tier":"res100","clock":"resolution","atFraction":1.0,"notifyRole":"management"}]'::jsonb,true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Numbering. FY 2026-27 → `2627`. The ticket counter starts at 15 so the demo's first
-- generated ticket is TKT-2627-00015 and the series matches §20.2's narrative order.
-- ---------------------------------------------------------------------------
INSERT INTO csp_document_series (id, tenant_id, created_by, updated_by, doc_type, prefix, fy_code, width, next_no) VALUES
 ('0192a8c0-0029-7000-8000-000000000401','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','ticket'       ,'TKT','2627',5,15),
 ('0192a8c0-0029-7000-8000-000000000402','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','complaint'    ,'CMP','2627',4,6),
 ('0192a8c0-0029-7000-8000-000000000403','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','spare_request','SPR','2627',4,3)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Portal users (§20.1). These are the business records; the credentials live in
-- Keycloak's portal realm and nothing here stores or could store one.
--
-- Farida is seeded `invited` — deliberately, because "invited but not yet accepted" is a
-- real state with real consequences: she has no consent record, so the CHECK constraint
-- would refuse to make her active, and the portal must refuse her a session.
-- ---------------------------------------------------------------------------
INSERT INTO csp_portal_user
  (id, tenant_id, created_by, updated_by, customer_account_id, contact_ref, email, display_name,
   phone, role, status, keycloak_sub, keycloak_org_id, consent_record_id, consent_version, last_login_at) VALUES
 ('0192a8c0-0029-7000-8000-000000000501','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0020-7000-8000-000000000003',NULL,'pradeep.sharma@ashvamedha.example','Pradeep Sharma (SQA Manager)','+919840012345','customer_admin','active',
  'portal-sub-pradeep','org-ashvamedha','0192a8c0-0029-7000-8000-0000000005a1','v1.0', TIMESTAMPTZ '2026-07-20 09:12:00+05:30'),
 ('0192a8c0-0029-7000-8000-000000000502','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0020-7000-8000-000000000003',NULL,'lakshmi.venkat@ashvamedha.example','Lakshmi Venkatesan (Line Maintenance)','+919840067890','customer_user','active',
  'portal-sub-lakshmi','org-ashvamedha','0192a8c0-0029-7000-8000-0000000005a2','v1.0', TIMESTAMPTZ '2026-07-17 16:40:00+05:30'),
 ('0192a8c0-0029-7000-8000-000000000503','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0020-7000-8000-000000000002',NULL,'harshad.mehta@blueorbit.example','Harshad Mehta (Plant Engineer)','+919824011223','customer_admin','active',
  'portal-sub-harshad','org-blueorbit','0192a8c0-0029-7000-8000-0000000005a3','v1.0', TIMESTAMPTZ '2026-07-20 06:20:00+05:30'),
 ('0192a8c0-0029-7000-8000-000000000504','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0020-7000-8000-000000000001',NULL,'farida.ansari@deccanagro.example','Farida Ansari (Service Coordinator)','+919701033445','customer_user','invited',
  NULL,'org-deccan',NULL,NULL,NULL)
ON CONFLICT (id) DO NOTHING;

-- Farida's outstanding invitation. Only the HASH of the token is stored — an invite link
-- is a bearer credential, and a table of live ones would be as sensitive as a password
-- file. (The hash below is sha256 of a token that exists nowhere else; it cannot be
-- reversed into a working link.)
INSERT INTO csp_portal_invite
  (id, tenant_id, created_by, updated_by, customer_account_id, email, token_hash, invited_role,
   keycloak_org_id, invited_by_ref, expires_at) VALUES
 ('0192a8c0-0029-7000-8000-000000000511','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0020-7000-8000-000000000001','farida.ansari@deccanagro.example',
  encode(sha256('demo-invite-token-farida'::bytea),'hex'),'customer_user','org-deccan',
  '0192a8c0-0025-7000-8000-000000000203', TIMESTAMPTZ '2026-07-27 23:59:00+05:30')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- The entitlement registry.
--
-- BlueOrbit's eight dispatched CP-50 pumps carry the standard twelve-month cover from
-- 12-Mar-2026. SR-CP50-26-0452 is the one the demo's oil-leak complaint is raised against,
-- so the entitlement engine has something real to decide on.
-- ---------------------------------------------------------------------------
INSERT INTO csp_warranty
  (id, tenant_id, created_by, updated_by, customer_account_id, serial_no, item_ref, warranty_type,
   start_date, end_date, coverage_terms, status, source, sales_order_ref, dispatched_on)
SELECT
  ('0192a8c0-0029-7000-8000-0000000006' || lpad(g::text, 2, '0'))::uuid,
  '0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0020-7000-8000-000000000002',
  'SR-CP50-26-04' || lpad((51 + g)::text, 2, '0'),
  '0192a8c0-0012-7000-8000-000000000001',
  'standard_12m', DATE '2026-03-12', DATE '2027-03-12',
  'Manufacturing defects, parts and labour. Excludes wear parts, misuse and unauthorised repair.',
  'active','auto_dispatch','SO-DEMO-BLO-0042', DATE '2026-03-12'
FROM generate_series(1, 8) AS g
ON CONFLICT (id) DO NOTHING;

-- Ashvamedha's comprehensive AMC — the one whose CONTRACT-band SLA outranks priority, and
-- the one that is 42 days from expiry on 20-Jul-2026, inside the T-60 renewal window.
-- `renewal_lead_emitted_at` is left NULL so the demo can watch the lead fire exactly once.
INSERT INTO csp_amc_contract
  (id, tenant_id, created_by, updated_by, customer_account_id, contract_no, coverage_type,
   entitlements, start_date, end_date, renewal_date, annual_value, status, renewal_lead_emitted_at) VALUES
 ('0192a8c0-0029-7000-8000-000000000701','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0020-7000-8000-000000000003','AMC-2627-0002','comprehensive',
  '{"visitsPerYear":4,"responseMins":240,"partsIncluded":true}'::jsonb,
  DATE '2025-09-01', DATE '2026-08-31', DATE '2026-08-31', 480000.00, 'active', NULL),
 -- Deccan's non-comprehensive contract: visits and labour included, PARTS CHARGEABLE.
 -- This is the contract that makes the entitlement engine return `partial` rather than
 -- lying in either direction.
 ('0192a8c0-0029-7000-8000-000000000702','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0020-7000-8000-000000000001','AMC-2627-0005','non_comprehensive',
  '{"visitsPerYear":2,"partsIncluded":false}'::jsonb,
  DATE '2026-04-01', DATE '2027-03-31', DATE '2027-03-31', 145000.00, 'active', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO csp_amc_contract_asset
  (id, tenant_id, created_by, updated_by, customer_account_id, contract_id, serial_no, item_ref, site_label)
SELECT
  ('0192a8c0-0029-7000-8000-0000000007' || lpad((10 + g)::text, 2, '0'))::uuid,
  '0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0020-7000-8000-000000000003',
  '0192a8c0-0029-7000-8000-000000000701',
  'SR-CP50-25-01' || lpad(g::text, 2, '0'),
  '0192a8c0-0012-7000-8000-000000000001',
  'Chennai line-2 fixtures'
FROM generate_series(1, 12) AS g
ON CONFLICT (id) DO NOTHING;

INSERT INTO csp_amc_contract_asset
  (id, tenant_id, created_by, updated_by, customer_account_id, contract_id, serial_no, item_ref, site_label)
SELECT
  ('0192a8c0-0029-7000-8000-0000000007' || lpad((30 + g)::text, 2, '0'))::uuid,
  '0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0020-7000-8000-000000000001',
  '0192a8c0-0029-7000-8000-000000000702',
  'SR-CP50-26-02' || lpad(g::text, 2, '0'),
  '0192a8c0-0012-7000-8000-000000000001',
  'Hyderabad plant'
FROM generate_series(1, 5) AS g
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Knowledge base (§20.6). Four public articles the portal search returns, and one
-- INTERNAL article that must never appear in a portal result — it is the leak probe for
-- the KB's own restrictive policy, and it is deliberately full of the vocabulary a
-- customer search would match ("complaint", "NCR", "seal") so a broken policy fails
-- loudly rather than subtly.
-- ---------------------------------------------------------------------------
INSERT INTO csp_kb_article
  (id, tenant_id, created_by, updated_by, article_code, title, body_md, category,
   product_model_tags, visibility, version, status, view_count, helpful_count,
   not_helpful_count, published_at, author_employee_ref) VALUES
 ('0192a8c0-0029-7000-8000-000000000801','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'KB-001','Storage and rust prevention for machined components',
  E'Machined carbon-steel parts will develop surface rust within weeks in coastal or monsoon humidity, even in a covered store.\n\n**Before storage**\n- Wipe down with a lint-free cloth; fingerprints are the usual initiation site.\n- Apply a thin film of rust-preventive oil (VCI grade) to all machined faces.\n- Wrap in VCI paper, printed side inward.\n\n**In store**\n- Keep pallets 150 mm clear of the floor and away from external walls.\n- Do not stack unwrapped machined faces directly against one another.\n\n**Light surface rust already present** — it is cosmetic if it wipes off with oil and a non-woven pad and leaves no pitting. Pitting that can be felt with a fingernail is not cosmetic; raise a support request with a photograph.',
  'Storage','["CMP-SFT20","CMP-IMP6"]'::jsonb,'public',1,'published',412,92,8, TIMESTAMPTZ '2026-04-14 11:00:00+05:30','0192a8c0-0025-7000-8000-000000000206'),
 ('0192a8c0-0029-7000-8000-000000000802','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'KB-002','Pump-shaft seal installation: torque and seating guide',
  E'A weeping mechanical seal on a CP-50 is most often a seating problem rather than a seal defect.\n\n**Seating**\n1. Check the shaft for score marks at the seal face. A visible score will weep whatever seal is fitted.\n2. Lubricate the elastomer with clean water or the pumped fluid — never with mineral oil, which swells EPDM.\n3. Seat the stationary face square. A face seated 0.05 mm out of square will weep under pressure and look exactly like a defective seal.\n\n**Torque**\n- Gland bolts: 12 Nm, diagonally, in two passes.\n- Do not over-torque to stop a weep. Over-torque distorts the stationary face and makes the weep permanent.\n\n**Run-in** — a light weep for the first 15 minutes is normal and should stop. A weep that persists past 30 minutes, or any weep with the pump stopped, should be raised as a request with a photograph of the shaft-to-seal area.',
  'Maintenance','["CMP-SEAL20","PMP-CP50"]'::jsonb,'public',2,'published',368,88,12, TIMESTAMPTZ '2026-05-02 10:30:00+05:30','0192a8c0-0025-7000-8000-000000000206'),
 ('0192a8c0-0029-7000-8000-000000000803','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'KB-003','How to read your 3S warranty certificate',
  E'Your certificate carries four things that decide a claim.\n\n**Serial number** — the number stamped on the nameplate. Quote it on every request; it is how coverage is looked up.\n\n**Start date** — the date of dispatch, not the date of commissioning or of your purchase order. Standard cover runs twelve months from dispatch.\n\n**Coverage terms** — manufacturing defects in parts and labour. Wear parts, damage from misuse and unauthorised repair are outside cover; this is stated on the certificate itself.\n\n**Claims are judged on the DATE OF FAILURE**, not the date you report it. A failure that happened inside the cover period remains covered even if you raise the request afterwards — so record the date you first noticed it.\n\nIf you also hold an AMC, the AMC is checked first: a comprehensive contract is broader than the standard warranty.',
  'Warranty','[]'::jsonb,'public',1,'published',521,95,5, TIMESTAMPTZ '2026-04-02 09:00:00+05:30','0192a8c0-0025-7000-8000-000000000205'),
 ('0192a8c0-0029-7000-8000-000000000804','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'KB-004','CP-50 impeller fitment checklist',
  E'**Before fitting**\n- Confirm the impeller part number against the pump nameplate. A 6-inch impeller in a 5-inch volute will pass a bench test and fail in service.\n- Check the key and keyway for burrs.\n\n**Fitting**\n1. Clean the shaft taper; it must be dry and oil-free.\n2. Fit the key, then the impeller, by hand as far as it will go.\n3. Tighten the impeller nut to 35 Nm. Do not use an impact wrench.\n4. Rotate by hand for one full turn. Any rub is a fitment error, not a running-in condition.\n\n**After fitting** — check the running clearance at four points. Uneven clearance means the shaft or the volute needs attention before the pump is run.',
  'Maintenance','["CMP-IMP6","PMP-CP50"]'::jsonb,'public',1,'published',203,81,19, TIMESTAMPTZ '2026-06-11 15:20:00+05:30','0192a8c0-0025-7000-8000-000000000206'),
 ('0192a8c0-0029-7000-8000-000000000805','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'KB-005','INTERNAL: complaint to NCR hand-off SOP (agent checklist)',
  E'**Do not share this article or its contents with a customer.**\n\n1. Confirm the serial and the batch before raising the complaint. A complaint against the wrong batch contaminates the Pareto.\n2. Raise the complaint from the ticket, never standalone — the outbox event carries the ticket reference and Quality works from it.\n3. Quality opens an NCR and returns the reference. NCR numbers are INTERNAL: the customer-facing status is "Under investigation by Quality" and nothing more.\n4. If a CAPA is raised, the complaint cannot be closed until the CAPA reaches 100%. A manager override is possible and is recorded on the row with a reason.\n5. Containment notes may be summarised to the customer in plain language. Do not paste the NCR text: it names the operator and the machine.\n\nEscalate to the service manager if the customer asks directly for the NCR number.',
  'Process','[]'::jsonb,'internal',3,'published',44,0,0, TIMESTAMPTZ '2026-03-20 12:00:00+05:30','0192a8c0-0025-7000-8000-000000000202')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Kaveri ElectroFab: the cross-tenant leak-probe counterpart (§16.B).
--
-- One calendar, one policy, one series — the minimum a ticket needs to exist. The probe
-- creates a Kaveri ticket and then asserts that a 3S session, and a 3S portal
-- session, both count zero.
-- ---------------------------------------------------------------------------
INSERT INTO csp_business_calendar
  (id, tenant_id, created_by, updated_by, code, name, working_weekdays, day_start_minutes,
   day_end_minutes, holidays, utc_offset_minutes) VALUES
 ('0192a8c0-0029-7000-8000-000000000901','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'KEF-DESK','Kaveri service desk','[1,2,3,4,5]'::jsonb,540,1080,'[]'::jsonb,330)
ON CONFLICT (id) DO NOTHING;

INSERT INTO csp_sla_policy
  (id, tenant_id, created_by, updated_by, code, name, applies_to, match_value, response_mins,
   resolution_mins, calendar_id, pause_on_pending, escalation_matrix, active) VALUES
 ('0192a8c0-0029-7000-8000-000000000902','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'SLA-MEDIUM','Medium','priority','medium',480,1440,'0192a8c0-0029-7000-8000-000000000901',true,'[]'::jsonb,true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO csp_document_series (id, tenant_id, created_by, updated_by, doc_type, prefix, fy_code, width, next_no) VALUES
 ('0192a8c0-0029-7000-8000-000000000903','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','ticket','TKT','2627',5,1)
ON CONFLICT (id) DO NOTHING;
