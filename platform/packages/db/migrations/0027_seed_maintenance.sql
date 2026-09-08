-- =============================================================================
-- 0027_seed_maintenance — the 3S asset register, the rate book, the PM plan.
--
-- Everything here is CONFIGURATION or MASTER DATA. Not one transaction is seeded: the
-- requests, work orders, downtime intervals and PM occurrences of §20.4-§20.6 are created
-- by the services themselves, through the same endpoints a user would drive, so the demo
-- proves the engine rather than a fixture.
--
-- Two things are law rather than preference and carry their provenance in a comment:
-- the Factories Act examination intervals (s.28 six-monthly hoists and lifts, s.29
-- twelve-monthly lifting machines, chains, ropes and tackle) and the ISO 14224 shape of
-- the failure taxonomy. Both live as effective-dated rows, never as constants in code.
-- =============================================================================

-- 3S tenant 0192a8c0-0000-7000-8000-000000000001 · Kaveri …002
-- system actor    0192a8c0-0000-7000-8000-0000000000ff

-- ---------------------------------------------------------------------------
-- Maintenance staff.
--
-- These three are HRM employees, because that is where a person lives -- Maintenance holds
-- only a trade tag against a logical employee_ref. They are seeded WITHOUT a salary
-- assignment, deliberately: payroll pays whoever has an active assignment, so adding them
-- leaves Module 09's published June figures (gross 7,77,001.93 across ten payslips)
-- untouched to the paisa. Onboarding them to payroll is one INSERT when the demo wants it.
-- ---------------------------------------------------------------------------
INSERT INTO employee (id, tenant_id, created_by, updated_by, emp_code, first_name, last_name, gender,
                      employment_type, fixed_term_end_date, date_of_joining, status,
                      pt_state, pt_municipality, epf_ceiling_policy, location_ref,
                      department, designation, cost_centre, default_shift_id, pii_notice_version) VALUES
 ('0192a8c0-0027-7000-8000-000000000211','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','3S-0011','Balaji','Gaikwad','male','permanent',NULL,DATE '2018-11-05','active','MH',NULL,'capped_at_15000','0192a8c0-0002-7000-8000-000000000001','Maintenance','Maintenance Technician (Fitter)','CC-MNT','0192a8c0-0025-7000-8000-000000000100','v1.0'),
 ('0192a8c0-0027-7000-8000-000000000212','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','3S-0012','Nitin','Jadhav','male','permanent',NULL,DATE '2019-03-18','active','MH',NULL,'capped_at_15000','0192a8c0-0002-7000-8000-000000000001','Maintenance','Maintenance Technician (Electrician)','CC-MNT','0192a8c0-0025-7000-8000-000000000100','v1.0'),
 ('0192a8c0-0027-7000-8000-000000000213','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','3S-0013','Sundar','Raman','male','permanent',NULL,DATE '2020-07-20','active','TN','Coimbatore','capped_at_15000','0192a8c0-0002-7000-8000-000000000002','Maintenance','Maintenance Technician (Fitter)','CC-MNT','0192a8c0-0025-7000-8000-000000000100','v1.0')
ON CONFLICT (id) DO NOTHING;

-- The maintenance-side profile: trade, grade, plant, competent-person flag. No name, no
-- pay, no identity document -- those stay in HRM (§9.5 / NFR-13).
INSERT INTO maintenance_technician (id, tenant_id, created_by, updated_by, employee_ref, trade, grade, plant_ref, is_competent_person, competency_note) VALUES
 ('0192a8c0-0027-7000-8000-000000000301','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8000-000000000211','fitter','T2','0192a8c0-0002-7000-8000-000000000001',false,NULL),
 ('0192a8c0-0027-7000-8000-000000000302','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8000-000000000212','electrician','T2','0192a8c0-0002-7000-8000-000000000001',false,NULL),
 ('0192a8c0-0027-7000-8000-000000000303','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8000-000000000213','fitter','T1','0192a8c0-0002-7000-8000-000000000002',false,NULL),
 -- Imran (3S-0007) is the maintenance manager and the registered competent person for the
 -- s.29 twelve-monthly examination of lifting machines, chains, ropes and tackle.
 ('0192a8c0-0027-7000-8000-000000000304','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0025-7000-8000-000000000207','technician','T3','0192a8c0-0002-7000-8000-000000000001',true,'Competent person for Factories Act s.29 examinations; certificate on file')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Criticality x severity -> priority + SLA (§4.C default matrix, effective 01-Apr-2026).
-- Append-only: a change is a new effective_from, so a July deadline can never be restated.
-- ---------------------------------------------------------------------------
INSERT INTO criticality_sla_matrix (id, tenant_id, created_by, updated_by, criticality, severity, priority, respond_minutes, restore_minutes, effective_from) VALUES
 ('0192a8c0-0027-7000-8000-000000000401','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','A','stopped' ,'P1',  15,   240, DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8000-000000000402','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','A','degraded','P2', 120,  1440, DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8000-000000000403','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','A','cosmetic','P3', 480,  4320, DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8000-000000000404','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','B','stopped' ,'P2',  30,   480, DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8000-000000000405','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','B','degraded','P3', 240,  2880, DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8000-000000000406','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','B','cosmetic','P4',1440, 10080, DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8000-000000000407','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','C','stopped' ,'P3', 240,  1440, DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8000-000000000408','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','C','degraded','P4',1440, 10080, DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8000-000000000409','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','C','cosmetic','P4',1440, 20160, DATE '2026-04-01')
ON CONFLICT (id) DO NOTHING;

-- Kaveri gets the same defaults, so the leak probe compares like with like.
INSERT INTO criticality_sla_matrix (id, tenant_id, created_by, updated_by, criticality, severity, priority, respond_minutes, restore_minutes, effective_from) VALUES
 ('0192a8c0-0027-7000-8000-00000000040a','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','A','stopped','P1', 15, 240, DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8000-00000000040b','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','B','stopped','P2', 30, 480, DATE '2026-04-01')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Labour rates (§20.2, effective 01-Apr-2026). FALLBACK values: where HRM publishes a
-- costing rate for the employee it is preferred and consumed by reference.
-- ---------------------------------------------------------------------------
INSERT INTO maintenance_labour_rate (id, tenant_id, created_by, updated_by, trade, grade, rate_per_hour, ot_multiplier, effective_from) VALUES
 ('0192a8c0-0027-7000-8000-000000000421','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','fitter'     ,'T1',380.00,1.500,DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8000-000000000422','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','fitter'     ,'T2',420.00,1.500,DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8000-000000000423','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','electrician','T2',460.00,1.500,DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8000-000000000424','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','technician' ,'T3',520.00,1.500,DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8000-000000000425','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','contractor' ,NULL ,550.00,1.500,DATE '2026-04-01')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Downtime reason codes (§4.F FR-MNT-086) and the ISO 14224-shaped failure taxonomy.
-- Retiring a code sets effective_to; it never rewrites the history that used it.
-- ---------------------------------------------------------------------------
INSERT INTO downtime_reason_code (id, tenant_id, created_by, updated_by, code, label, default_kind, effective_from)
SELECT ('0192a8c0-0027-7000-8100-' || lpad(row_number() OVER (ORDER BY c.code)::text, 12, '0'))::uuid,
       '0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
       c.code, c.label, c.kind, DATE '2026-04-01'
FROM (VALUES
  ('mechanical'      ,'Mechanical failure'            ,'unplanned'),
  ('electrical'      ,'Electrical failure'            ,'unplanned'),
  ('hydraulic'       ,'Hydraulic failure'             ,'unplanned'),
  ('pneumatic'       ,'Pneumatic failure'             ,'unplanned'),
  ('tooling'         ,'Tooling problem'               ,'unplanned'),
  ('utility_failure' ,'Utility failure (air/power)'   ,'unplanned'),
  ('operator_error'  ,'Operator-related stop'         ,'unplanned'),
  ('awaiting_spare'  ,'Awaiting spare part'           ,'unplanned'),
  ('awaiting_vendor' ,'Awaiting external vendor'      ,'unplanned'),
  ('planned_pm'      ,'Planned preventive maintenance','planned'),
  ('statutory_exam'  ,'Statutory examination'         ,'planned'),
  ('other'           ,'Other'                         ,'unplanned')
) AS c(code,label,kind)
ON CONFLICT (id) DO NOTHING;

-- ISO 14224 borrows its SHAPE here (mode / cause / detection), not its equipment classes:
-- the standard is written for petroleum and gas, and this is a discrete-machining subset.
INSERT INTO failure_code (id, tenant_id, created_by, updated_by, code, kind, label, effective_from)
SELECT ('0192a8c0-0027-7000-8200-' || lpad(row_number() OVER (ORDER BY f.kind, f.code)::text, 12, '0'))::uuid,
       '0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
       f.code, f.kind, f.label, DATE '2026-04-01'
FROM (VALUES
  -- failure modes
  ('EXT-LEAK','mode','External leakage — process medium'),
  ('INT-LEAK','mode','Internal leakage'),
  ('VIB'     ,'mode','Vibration above limit'),
  ('NOISE'   ,'mode','Abnormal noise'),
  ('OHE'     ,'mode','Overheating'),
  ('STP'     ,'mode','Fails to start on demand'),
  ('BRD'     ,'mode','Breakdown — will not run'),
  ('ELP'     ,'mode','Electrical or power failure'),
  ('ERO'     ,'mode','Erratic output / out of tolerance'),
  ('PLU'     ,'mode','Plugged or choked'),
  ('SER'     ,'mode','Minor in-service problem'),
  ('STD'     ,'mode','Structural deficiency'),
  -- failure causes
  ('SEAL-WEAR','cause','Seal wear or degradation'),
  ('BEAR-WEAR','cause','Bearing wear'),
  ('FATIGUE'  ,'cause','Material fatigue'),
  ('CORROSION','cause','Corrosion'),
  ('LUBE'     ,'cause','Inadequate lubrication'),
  ('CONTAM'   ,'cause','Contamination'),
  ('MISALIGN' ,'cause','Misalignment'),
  ('LOOSE'    ,'cause','Loose fastening or connection'),
  ('OVERLOAD' ,'cause','Overload'),
  ('CTRL-FAIL','cause','Control or instrument failure'),
  ('INSTALL'  ,'cause','Installation or assembly error'),
  ('UNKNOWN'  ,'cause','Cause not established'),
  -- detection methods
  ('OPR-OBS' ,'detection','Observed by operator'),
  ('PM-INSP' ,'detection','Found during preventive inspection'),
  ('CBM'     ,'detection','Condition monitoring'),
  ('PROD-QC' ,'detection','Detected by product quality check'),
  ('ALARM'   ,'detection','Machine alarm or trip'),
  ('AUDIT'   ,'detection','Detected during audit or walkdown'),
  -- actions taken
  ('REPLACE' ,'action','Component replaced'),
  ('REPAIR'  ,'action','Component repaired'),
  ('ADJUST'  ,'action','Adjusted or realigned'),
  ('CLEAN'   ,'action','Cleaned'),
  ('TOPUP'   ,'action','Refilled or topped up')
) AS f(code,kind,label)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- The asset register (§20.1). Plant -> Area -> Machine -> Component, with a materialised
-- path so a subtree query is an index scan rather than a recursive walk.
--
-- `work_center_ref` values below are LOGICAL placeholders. Production does not yet own a
-- work-center master in this prototype, and the whole point of the reference being logical
-- is that Maintenance neither needs nor is allowed to have a foreign key into it: when
-- Production ships work centers, these ids are re-pointed by an UPDATE and nothing else
-- changes. `uq_asset_workcenter` still enforces one asset per work center today.
-- ---------------------------------------------------------------------------
INSERT INTO maintenance_asset
 (id, tenant_id, created_by, updated_by, asset_code, name, asset_type, parent_asset_id, path, depth,
  criticality, criticality_reason, status, make, model, serial_no, manufacture_year, commissioned_on,
  location_ref, cost_centre_ref, work_center_ref, warranty_end_date, statutory_class, competent_person_ref) VALUES
 -- Pune-Chakan
 ('0192a8c0-0027-7000-8300-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ','Pune-Chakan Plant','plant',NULL,'/AST-PNQ',0,NULL,NULL,'operational',NULL,NULL,NULL,NULL,NULL,'0192a8c0-0002-7000-8000-000000000001','CC-OPS',NULL,NULL,'none',NULL),
 ('0192a8c0-0027-7000-8300-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-MS','Machine Shop','area','0192a8c0-0027-7000-8300-000000000001','/AST-PNQ/AST-PNQ-MS',1,NULL,NULL,'operational',NULL,NULL,NULL,NULL,NULL,'0192a8c0-0002-7000-8000-000000000001','CC-PRD',NULL,NULL,'none',NULL),
 ('0192a8c0-0027-7000-8300-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-PS','Press Shop','area','0192a8c0-0027-7000-8300-000000000001','/AST-PNQ/AST-PNQ-PS',1,NULL,NULL,'operational',NULL,NULL,NULL,NULL,NULL,'0192a8c0-0002-7000-8000-000000000001','CC-PRD',NULL,NULL,'none',NULL),
 ('0192a8c0-0027-7000-8300-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-UT','Utilities','area','0192a8c0-0027-7000-8300-000000000001','/AST-PNQ/AST-PNQ-UT',1,NULL,NULL,'operational',NULL,NULL,NULL,NULL,NULL,'0192a8c0-0002-7000-8000-000000000001','CC-OPS',NULL,NULL,'none',NULL),
 -- the hero asset and its components
 ('0192a8c0-0027-7000-8300-000000000010','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-VMC-01','VMC 850 vertical machining centre #1','machine','0192a8c0-0027-7000-8300-000000000002','/AST-PNQ/AST-PNQ-MS/AST-PNQ-VMC-01',2,'A','Single-source for the CP-50 casing operations; no redundancy on the line','operational','Jyoti','VMC 850','JY-VMC-850-1147',2019,DATE '2019-08-12','0192a8c0-0002-7000-8000-000000000001','CC-PRD','0192a8c0-0017-7000-8000-0000000000c1',NULL,'none',NULL),
 ('0192a8c0-0027-7000-8300-000000000011','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-VMC-01-SPN','Spindle unit','component','0192a8c0-0027-7000-8300-000000000010','/AST-PNQ/AST-PNQ-MS/AST-PNQ-VMC-01/AST-PNQ-VMC-01-SPN',3,'A','Spindle failure stops the machine and has a 6-week rebuild lead time','operational',NULL,NULL,NULL,NULL,NULL,'0192a8c0-0002-7000-8000-000000000001','CC-PRD',NULL,NULL,'none',NULL),
 ('0192a8c0-0027-7000-8300-000000000012','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-VMC-01-CLT','Coolant system','component','0192a8c0-0027-7000-8300-000000000010','/AST-PNQ/AST-PNQ-MS/AST-PNQ-VMC-01/AST-PNQ-VMC-01-CLT',3,'B','Repeat offender; spares held in stores','operational',NULL,NULL,NULL,NULL,NULL,'0192a8c0-0002-7000-8000-000000000001','CC-PRD',NULL,NULL,'none',NULL),
 ('0192a8c0-0027-7000-8300-000000000013','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-VMC-01-ATC','Tool changer (ATC)','component','0192a8c0-0027-7000-8300-000000000010','/AST-PNQ/AST-PNQ-MS/AST-PNQ-VMC-01/AST-PNQ-VMC-01-ATC',3,'B','Jam stops the machine but is recoverable in under two hours','operational',NULL,NULL,NULL,NULL,NULL,'0192a8c0-0002-7000-8000-000000000001','CC-PRD',NULL,NULL,'none',NULL),
 -- the rest of the machine shop
 ('0192a8c0-0027-7000-8300-000000000020','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-VMC-02','VMC 850 #2','machine','0192a8c0-0027-7000-8300-000000000002','/AST-PNQ/AST-PNQ-MS/AST-PNQ-VMC-02',2,'A','Second machine on CNC Line 1','operational','Jyoti','VMC 850','JY-VMC-850-1620',2024,DATE '2024-11-03','0192a8c0-0002-7000-8000-000000000001','CC-PRD','0192a8c0-0017-7000-8000-0000000000c2',DATE '2027-02-28','none',NULL),
 ('0192a8c0-0027-7000-8300-000000000021','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-TRN-01','CNC turning centre','machine','0192a8c0-0027-7000-8300-000000000002','/AST-PNQ/AST-PNQ-MS/AST-PNQ-TRN-01',2,'A','Only turning capacity for the shaft family','operational','Ace','LT-20',
 'ACE-LT20-0442',2018,DATE '2018-05-22','0192a8c0-0002-7000-8000-000000000001','CC-PRD','0192a8c0-0017-7000-8000-0000000000c3',NULL,'none',NULL),
 ('0192a8c0-0027-7000-8300-000000000022','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-GRD-01','Surface grinder','machine','0192a8c0-0027-7000-8300-000000000002','/AST-PNQ/AST-PNQ-MS/AST-PNQ-GRD-01',2,'C','Work can be subcontracted at short notice','operational','Bhagwansons','BSG-450',NULL,2015,DATE '2015-09-30','0192a8c0-0002-7000-8000-000000000001','CC-PRD','0192a8c0-0017-7000-8000-0000000000c4',NULL,'none',NULL),
 -- press shop
 ('0192a8c0-0027-7000-8300-000000000030','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-PRS-01','100 T hydraulic press','machine','0192a8c0-0027-7000-8300-000000000003','/AST-PNQ/AST-PNQ-PS/AST-PNQ-PRS-01',2,'B','Alternate press available at reduced rate','operational','Rajesh Machine Tools','RMT-100T',NULL,2017,DATE '2017-03-14','0192a8c0-0002-7000-8000-000000000001','CC-PRD','0192a8c0-0017-7000-8000-0000000000c5',NULL,'none',NULL),
 ('0192a8c0-0027-7000-8300-000000000031','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-PRS-01-HPU','Hydraulic power pack','component','0192a8c0-0027-7000-8300-000000000030','/AST-PNQ/AST-PNQ-PS/AST-PNQ-PRS-01/AST-PNQ-PRS-01-HPU',3,'B','Hose failures are the press''s most common stop','operational',NULL,NULL,NULL,NULL,NULL,'0192a8c0-0002-7000-8000-000000000001','CC-PRD',NULL,NULL,'none',NULL),
 -- the EOT crane: a STATUTORY asset under Factories Act s.29
 ('0192a8c0-0027-7000-8300-000000000032','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-CRN-01','5 T EOT crane, Bay 2','machine','0192a8c0-0027-7000-8300-000000000003','/AST-PNQ/AST-PNQ-PS/AST-PNQ-CRN-01',2,'B','Bay 2 material movement; manual handling possible but slow','operational','Hercules','HC-5T-EOT','HRC-5T-2213',2016,DATE '2016-12-01','0192a8c0-0002-7000-8000-000000000001','CC-OPS',NULL,NULL,'lifting_tackle_s29','0192a8c0-0025-7000-8000-000000000207'),
 -- utilities: assets with no work center at all, which is normal and unremarkable
 ('0192a8c0-0027-7000-8300-000000000040','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-CMP-01','55 kW screw air compressor','machine','0192a8c0-0027-7000-8300-000000000004','/AST-PNQ/AST-PNQ-UT/AST-PNQ-CMP-01',2,'A','Plant-wide dependency: no air, no plant','operational','Elgi','EG55',
 'ELG-55-8871',2020,DATE '2020-02-18','0192a8c0-0002-7000-8000-000000000001','CC-OPS',NULL,NULL,'none',NULL),
 ('0192a8c0-0027-7000-8300-000000000041','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-CMP-01-DRY','Refrigerated air dryer','component','0192a8c0-0027-7000-8300-000000000040','/AST-PNQ/AST-PNQ-UT/AST-PNQ-CMP-01/AST-PNQ-CMP-01-DRY',3,'B','Wet air spoils pneumatics downstream','operational',NULL,NULL,NULL,NULL,NULL,'0192a8c0-0002-7000-8000-000000000001','CC-OPS',NULL,NULL,'none',NULL),
 ('0192a8c0-0027-7000-8300-000000000042','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-DG-01','250 kVA DG set','machine','0192a8c0-0027-7000-8300-000000000004','/AST-PNQ/AST-PNQ-UT/AST-PNQ-DG-01',2,'B','Only backup power; monsoon dependency','standby','Kirloskar','KG1-250',NULL,2019,DATE '2019-06-05','0192a8c0-0002-7000-8000-000000000001','CC-OPS',NULL,NULL,'none',NULL),
 ('0192a8c0-0027-7000-8300-000000000043','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-CHL-01','20 TR process chiller','machine','0192a8c0-0027-7000-8300-000000000004','/AST-PNQ/AST-PNQ-UT/AST-PNQ-CHL-01',2,'B','Grinding and VMC coolant temperature control','operational','Voltas','VC-20TR',NULL,2021,DATE '2021-04-09','0192a8c0-0002-7000-8000-000000000001','CC-OPS',NULL,NULL,'none',NULL),
 -- Coimbatore
 ('0192a8c0-0027-7000-8300-000000000050','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-CBE','Coimbatore Plant','plant',NULL,'/AST-CBE',0,NULL,NULL,'operational',NULL,NULL,NULL,NULL,NULL,'0192a8c0-0002-7000-8000-000000000002','CC-OPS',NULL,NULL,'none',NULL),
 ('0192a8c0-0027-7000-8300-000000000051','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-CBE-MS','CBE Machine Shop','area','0192a8c0-0027-7000-8300-000000000050','/AST-CBE/AST-CBE-MS',1,NULL,NULL,'operational',NULL,NULL,NULL,NULL,NULL,'0192a8c0-0002-7000-8000-000000000002','CC-PRD',NULL,NULL,'none',NULL),
 ('0192a8c0-0027-7000-8300-000000000052','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-CBE-UT','CBE Utilities','area','0192a8c0-0027-7000-8300-000000000050','/AST-CBE/AST-CBE-UT',1,NULL,NULL,'operational',NULL,NULL,NULL,NULL,NULL,'0192a8c0-0002-7000-8000-000000000002','CC-OPS',NULL,NULL,'none',NULL),
 ('0192a8c0-0027-7000-8300-000000000053','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-CBE-VMC-03','VMC 650 #3','machine','0192a8c0-0027-7000-8300-000000000051','/AST-CBE/AST-CBE-MS/AST-CBE-VMC-03',2,'A','Sole machining capacity at Coimbatore','operational','Jyoti','VMC 650',NULL,2023,DATE '2023-01-16','0192a8c0-0002-7000-8000-000000000002','CC-PRD',NULL,NULL,'none',NULL),
 ('0192a8c0-0027-7000-8300-000000000054','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-CBE-CMP-02','37 kW screw compressor','machine','0192a8c0-0027-7000-8300-000000000052','/AST-CBE/AST-CBE-UT/AST-CBE-CMP-02',2,'B','Plant air at Coimbatore','operational','Elgi','EG37',NULL,2022,DATE '2022-08-11','0192a8c0-0002-7000-8000-000000000002','CC-OPS',NULL,NULL,'none',NULL)
ON CONFLICT (id) DO NOTHING;

-- Kaveri ElectroFab: three assets and nothing else, purely so the RLS leak probe has
-- something real on the other side of the fence.
INSERT INTO maintenance_asset
 (id, tenant_id, created_by, updated_by, asset_code, name, asset_type, parent_asset_id, path, depth,
  criticality, status, location_ref, cost_centre_ref) VALUES
 ('0192a8c0-0027-7000-8300-0000000000a1','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-BLR','Bengaluru Plant','plant',NULL,'/AST-BLR',0,NULL,'operational',NULL,'CC-OPS'),
 ('0192a8c0-0027-7000-8300-0000000000a2','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-BLR-FB','Fabrication','area','0192a8c0-0027-7000-8300-0000000000a1','/AST-BLR/AST-BLR-FB',1,NULL,'operational',NULL,'CC-PRD'),
 ('0192a8c0-0027-7000-8300-0000000000a3','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-BLR-LSR-01','Fibre laser cutter','machine','0192a8c0-0027-7000-8300-0000000000a2','/AST-BLR/AST-BLR-FB/AST-BLR-LSR-01',2,'A','operational',NULL,'CC-PRD')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Meters and their opening readings.
--
-- `current_value` is a projection, so every meter gets a real reading behind it -- and the
-- compressor gets TWO, because that is what makes its consumption rate an arithmetic fact
-- rather than a seeded opinion.
--
-- Recorded honestly: §20.3 quotes `daily_rate_est` 22.4 h/day, but the two readings the
-- same document gives (11,450 on 15-Jun and 11,842.5 on 03-Jul) imply 21.8056 h/day. The
-- rate seeded here is the one those readings support. The forecast is anchored at the last
-- reading, so 157.5 hours to go at 21.8056/day projects the service to 10-Jul-2026 with a
-- seven-day trigger on 03-Jul -- which is exactly what §16.2's own step-1 arithmetic
-- computes (550 hours at 22.0/day from 15-Jun = 25 days = 10-Jul). The document's other
-- figure, 22-Jul, does not follow from any reading it gives.
-- ---------------------------------------------------------------------------
INSERT INTO asset_meter (id, tenant_id, created_by, updated_by, asset_id, meter_type, uom, current_value, last_reading_at, last_real_reading_at, daily_rate_est) VALUES
 ('0192a8c0-0027-7000-8400-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8300-000000000010','run_hours','hours',18240.0000,TIMESTAMPTZ '2026-07-03 18:00:00+05:30',TIMESTAMPTZ '2026-07-03 18:00:00+05:30',NULL),
 ('0192a8c0-0027-7000-8400-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8300-000000000013','cycles','nos',214880.0000,TIMESTAMPTZ '2026-07-03 18:00:00+05:30',TIMESTAMPTZ '2026-07-03 18:00:00+05:30',NULL),
 ('0192a8c0-0027-7000-8400-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8300-000000000020','run_hours','hours',16905.0000,TIMESTAMPTZ '2026-07-03 18:00:00+05:30',TIMESTAMPTZ '2026-07-03 18:00:00+05:30',NULL),
 ('0192a8c0-0027-7000-8400-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8300-000000000021','run_hours','hours',21470.0000,TIMESTAMPTZ '2026-07-03 18:00:00+05:30',TIMESTAMPTZ '2026-07-03 18:00:00+05:30',NULL),
 ('0192a8c0-0027-7000-8400-000000000005','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8300-000000000022','run_hours','hours',9120.0000,TIMESTAMPTZ '2026-07-03 18:00:00+05:30',TIMESTAMPTZ '2026-07-03 18:00:00+05:30',NULL),
 ('0192a8c0-0027-7000-8400-000000000006','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8300-000000000030','strokes','nos',1842300.0000,TIMESTAMPTZ '2026-07-03 18:00:00+05:30',TIMESTAMPTZ '2026-07-03 18:00:00+05:30',NULL),
 ('0192a8c0-0027-7000-8400-000000000007','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8300-000000000040','run_hours','hours',11842.5000,TIMESTAMPTZ '2026-07-03 18:00:00+05:30',TIMESTAMPTZ '2026-07-03 18:00:00+05:30',NULL),
 ('0192a8c0-0027-7000-8400-000000000008','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8300-000000000042','run_hours','hours',1286.0000,TIMESTAMPTZ '2026-07-03 18:00:00+05:30',TIMESTAMPTZ '2026-07-03 18:00:00+05:30',NULL),
 ('0192a8c0-0027-7000-8400-000000000009','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8300-000000000043','run_hours','hours',14310.0000,TIMESTAMPTZ '2026-07-03 18:00:00+05:30',TIMESTAMPTZ '2026-07-03 18:00:00+05:30',NULL),
 ('0192a8c0-0027-7000-8400-00000000000a','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8300-000000000053','run_hours','hours',7430.0000,TIMESTAMPTZ '2026-07-03 18:00:00+05:30',TIMESTAMPTZ '2026-07-03 18:00:00+05:30',NULL),
 ('0192a8c0-0027-7000-8400-00000000000b','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8300-000000000054','run_hours','hours',8905.0000,TIMESTAMPTZ '2026-07-03 18:00:00+05:30',TIMESTAMPTZ '2026-07-03 18:00:00+05:30',NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO asset_meter_reading (id, tenant_id, created_by, updated_by, meter_id, reading_value, reading_at, source, source_ref)
SELECT ('0192a8c0-0027-7000-8500-' || lpad(row_number() OVER (ORDER BY m.id)::text, 12, '0'))::uuid,
       m.tenant_id,'0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
       m.id, m.current_value, m.last_reading_at, 'manual', 'opening reading'
FROM asset_meter m
ON CONFLICT (id) DO NOTHING;

-- The compressor's earlier reading, so its consumption rate is a division a maintenance
-- manager can check rather than a number the software asserts.
INSERT INTO asset_meter_reading (id, tenant_id, created_by, updated_by, meter_id, reading_value, reading_at, source, source_ref) VALUES
 ('0192a8c0-0027-7000-8500-0000000000f1','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8400-000000000007',11450.0000,TIMESTAMPTZ '2026-06-15 18:00:00+05:30','manual','15-Jun round')
ON CONFLICT (id) DO NOTHING;
UPDATE asset_meter SET daily_rate_est = round((11842.5 - 11450.0) / 18, 4)
 WHERE id = '0192a8c0-0027-7000-8400-000000000007';

-- ---------------------------------------------------------------------------
-- MRO spare items. They live in ENGINEERING's item master and their stock lives in
-- INVENTORY -- this module only ever references them by id (§4.E FR-MNT-070).
-- ---------------------------------------------------------------------------
INSERT INTO item (id, tenant_id, created_by, updated_by, item_code, name, description, item_type, uom, hsn_code, item_group, is_purchasable, is_manufacturable, is_sellable, standard_cost) VALUES
 ('0192a8c0-0027-7000-8600-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','MRO-SEAL-KIT','Coolant pump mechanical seal kit','Seal kit for VMC coolant pump','consumable','nos','8484','MRO Spares',true,false,false,2840.00),
 ('0192a8c0-0027-7000-8600-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','MRO-HOSE-12','Coolant hose assembly 1.2 m','Braided hose assembly with clamps','consumable','nos','4009','MRO Spares',true,false,false,1180.00),
 ('0192a8c0-0027-7000-8600-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','MRO-ORING-SET','O-ring set','Nitrile O-ring assortment','consumable','set','4016','MRO Spares',true,false,false,656.00),
 ('0192a8c0-0027-7000-8600-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','MRO-AF-OS-KIT','Air filter + oil separator kit','Service kit for 55 kW screw compressor','consumable','set','8421','MRO Spares',true,false,false,9400.00),
 ('0192a8c0-0027-7000-8600-000000000005','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','MRO-PROX-SENS','Turret index proximity sensor','Inductive proximity sensor, M18','consumable','nos','8536','MRO Spares',true,false,false,7850.00),
 ('0192a8c0-0027-7000-8600-000000000006','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','MRO-VBELT-SET','V-belt set','Matched V-belt set for compressor drive','consumable','set','4010','MRO Spares',true,false,false,1240.00),
 ('0192a8c0-0027-7000-8600-000000000007','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','MRO-CONT-32A','Contactor 32 A','3-pole contactor, 32 A, 415 V','consumable','nos','8536','MRO Spares',true,false,false,2180.00)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- The PM plan (§20.3). Note what the database refuses to let anyone do: the statutory
-- schedule below CANNOT be set to floating drift (ck_statutory_fixed), because a
-- twelve-monthly examination that slides with the work is not a twelve-monthly examination.
-- ---------------------------------------------------------------------------
INSERT INTO pm_schedule
 (id, tenant_id, created_by, updated_by, pms_code, name, asset_id, pm_type,
  interval_value, interval_unit, anchor_date, drift_policy,
  meter_type, interval_meter_value, last_generated_meter, generate_on_forecast,
  lead_days, grace_days, est_duration_min, trade, statutory_ref, requires_competent_person,
  owner_ref, status, valid_from) VALUES
 ('0192a8c0-0027-7000-8700-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','PMS-PNQ-VMC-01-M','VMC-01 monthly lubrication & coolant check','0192a8c0-0027-7000-8300-000000000010','calendar',1,'month',DATE '2026-06-20','floating',NULL,NULL,NULL,true,7,3,90,'fitter',NULL,false,'0192a8c0-0025-7000-8000-000000000207','active',DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8700-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','PMS-PNQ-VMC-01-Q','VMC-01 quarterly spindle & ATC check','0192a8c0-0027-7000-8300-000000000010','calendar',3,'month',DATE '2026-04-11','fixed',NULL,NULL,NULL,true,7,3,240,'fitter',NULL,false,'0192a8c0-0025-7000-8000-000000000207','active',DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8700-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','PMS-PNQ-CMP-01-2000H','Compressor 2,000-hour service','0192a8c0-0027-7000-8300-000000000040','meter',NULL,NULL,NULL,NULL,'run_hours',2000.0000,10000.0000,true,7,3,180,'fitter',NULL,false,'0192a8c0-0025-7000-8000-000000000207','active',DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8700-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','PMS-PNQ-CMP-01-6M','Compressor six-monthly safety-valve check','0192a8c0-0027-7000-8300-000000000040','calendar',6,'month',DATE '2026-03-01','fixed',NULL,NULL,NULL,true,7,3,120,'fitter',NULL,false,'0192a8c0-0025-7000-8000-000000000207','active',DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8700-000000000005','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','PMS-PNQ-DG-01-M','DG set monthly no-load run & battery check','0192a8c0-0027-7000-8300-000000000042','calendar',1,'month',DATE '2026-06-17','fixed',NULL,NULL,NULL,true,7,3,60,'electrician',NULL,false,'0192a8c0-0025-7000-8000-000000000207','active',DATE '2026-04-01'),
 -- Factories Act 1948 s.29: lifting machines, chains, ropes and lifting tackle are to be
 -- thoroughly examined by a competent person at least once every twelve months, with a
 -- register entry. Interval, competent-person requirement and drift policy are all DATA.
 ('0192a8c0-0027-7000-8700-000000000006','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','PMS-PNQ-CRN-01-12M','EOT crane twelve-monthly thorough examination','0192a8c0-0027-7000-8300-000000000032','statutory',12,'month',DATE '2025-08-09','fixed',NULL,NULL,NULL,true,30,0,300,'technician','Factories Act 1948 s.29',true,'0192a8c0-0025-7000-8000-000000000201','active',DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8700-000000000007','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','PMS-PNQ-CHL-01-Q','Chiller quarterly AMC visit','0192a8c0-0027-7000-8300-000000000043','calendar',3,'month',DATE '2026-04-15','fixed',NULL,NULL,NULL,true,7,3,180,'contractor',NULL,false,'0192a8c0-0025-7000-8000-000000000207','active',DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8700-000000000008','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','PMS-PNQ-PRS-01-100K','Press: every 100,000 strokes or 6 months','0192a8c0-0027-7000-8300-000000000030','hybrid',6,'month',DATE '2026-02-20','fixed','strokes',100000.0000,1800000.0000,true,7,3,240,'fitter',NULL,false,'0192a8c0-0025-7000-8000-000000000207','active',DATE '2026-04-01'),
 ('0192a8c0-0027-7000-8700-000000000009','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','PMS-CBE-VMC-03-M','CBE VMC-03 monthly lubrication','0192a8c0-0027-7000-8300-000000000053','calendar',1,'month',DATE '2026-06-25','floating',NULL,NULL,NULL,true,7,3,90,'fitter',NULL,false,'0192a8c0-0025-7000-8000-000000000207','active',DATE '2026-04-01')
ON CONFLICT (id) DO NOTHING;

-- Checklist templates. Version 1 of each; an in-flight MWO pins the version it was built
-- from, so revising a checklist never rewrites a job already on the floor.
INSERT INTO pm_task_template (id, tenant_id, created_by, updated_by, pm_schedule_id, version, sequence, instruction, safety_note, result_type, expected_min, expected_max, uom, is_mandatory)
SELECT ('0192a8c0-0027-7000-8800-' || lpad(row_number() OVER (ORDER BY t.pms, t.seq)::text, 12, '0'))::uuid,
       '0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
       s.id, 1, t.seq, t.instruction, t.safety_note, t.result_type, t.emin, t.emax, t.uom, t.mandatory
FROM (VALUES
  ('PMS-PNQ-VMC-01-M',1::smallint,'Inspect coolant pump seal area for weeping','Isolate and lock out before opening the guard','ok_not_ok',NULL::numeric,NULL::numeric,NULL::text,true),
  ('PMS-PNQ-VMC-01-M',2,'Check hose clamps and chafe points at the drag chain',NULL,'ok_not_ok',NULL,NULL,NULL,true),
  ('PMS-PNQ-VMC-01-M',3,'Measure coolant concentration',NULL,'numeric',6.0,9.0,'%',true),
  ('PMS-PNQ-VMC-01-M',4,'Grease way covers and check for damage',NULL,'ok_not_ok',NULL,NULL,NULL,true),
  ('PMS-PNQ-VMC-01-M',5,'Photograph the pump housing',NULL,'photo',NULL,NULL,NULL,false),
  ('PMS-PNQ-VMC-01-Q',1,'Check spindle taper runout','Spindle must be at rest and locked out','numeric',0.0,0.01,'mm',true),
  ('PMS-PNQ-VMC-01-Q',2,'Verify ATC arm alignment and clamping',NULL,'ok_not_ok',NULL,NULL,NULL,true),
  ('PMS-PNQ-VMC-01-Q',3,'Measure backlash on X and Y axes',NULL,'numeric',0.0,0.02,'mm',true),
  ('PMS-PNQ-CMP-01-2000H',1,'Replace air filter element','Depressurise the receiver before opening','ok_not_ok',NULL,NULL,NULL,true),
  ('PMS-PNQ-CMP-01-2000H',2,'Replace oil separator element',NULL,'ok_not_ok',NULL,NULL,NULL,true),
  ('PMS-PNQ-CMP-01-2000H',3,'Change compressor oil and record quantity',NULL,'numeric',18.0,22.0,'litre',true),
  ('PMS-PNQ-CMP-01-2000H',4,'Record discharge pressure after restart',NULL,'numeric',6.5,7.5,'bar',true),
  ('PMS-PNQ-DG-01-M',1,'Run on no load for 15 minutes','Ensure exhaust area is clear','ok_not_ok',NULL,NULL,NULL,true),
  ('PMS-PNQ-DG-01-M',2,'Measure battery terminal voltage',NULL,'numeric',12.4,13.8,'V',true),
  ('PMS-PNQ-DG-01-M',3,'Check coolant level and top up',NULL,'ok_not_ok',NULL,NULL,NULL,true),
  ('PMS-PNQ-DG-01-M',4,'Record fuel level',NULL,'numeric',0.0,100.0,'%',false),
  ('PMS-PNQ-CRN-01-12M',1,'Thorough examination of hoisting mechanism by the competent person','Lock out and tag out; barrier the bay below','ok_not_ok',NULL,NULL,NULL,true),
  ('PMS-PNQ-CRN-01-12M',2,'Examine chains, ropes and lifting tackle for wear, stretch and deformation',NULL,'ok_not_ok',NULL,NULL,NULL,true),
  ('PMS-PNQ-CRN-01-12M',3,'Test brakes and limit switches under load',NULL,'ok_not_ok',NULL,NULL,NULL,true),
  ('PMS-PNQ-CRN-01-12M',4,'Record safe working load marking legibility',NULL,'ok_not_ok',NULL,NULL,NULL,true),
  ('PMS-PNQ-CRN-01-12M',5,'Enter the result in the statutory examination register',NULL,'text',NULL,NULL,NULL,true)
) AS t(pms,seq,instruction,safety_note,result_type,emin,emax,uom,mandatory)
JOIN pm_schedule s ON s.pms_code = t.pms AND s.tenant_id = '0192a8c0-0000-7000-8000-000000000001'
ON CONFLICT (id) DO NOTHING;

-- Default spares: what stores should be warned about before the technician arrives.
INSERT INTO pm_default_spare (id, tenant_id, created_by, updated_by, pm_schedule_id, item_ref, uom, qty, reserve_ahead) VALUES
 ('0192a8c0-0027-7000-8900-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8700-000000000003','0192a8c0-0027-7000-8600-000000000004','set',1.0000,true),
 ('0192a8c0-0027-7000-8900-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8700-000000000003','0192a8c0-0027-7000-8600-000000000006','set',1.0000,true),
 ('0192a8c0-0027-7000-8900-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8700-000000000001','0192a8c0-0027-7000-8600-000000000003','set',1.0000,false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- AMC coverage mirror (§20.6). The contract of record lives in Purchase/Expenditure;
-- these rows exist so an MWO can show "covered until dd-mmm" and default its external work
-- to the right vendor. Nothing here is editable as a contract, and `vendor_ref` is a
-- logical reference into Purchase's vendor master (seeded by the demo run, not here).
-- ---------------------------------------------------------------------------
INSERT INTO amc_contract (id, tenant_id, created_by, updated_by, contract_ref, vendor_ref, vendor_name_cache, coverage_type, valid_from, valid_to, response_sla_hours, visits_contracted, visits_used, contract_value) VALUES
 ('0192a8c0-0027-7000-8a00-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AMC-2627-004','0192a8c0-0027-7000-8b00-000000000001','Meridian Cooling Services','comprehensive',DATE '2026-04-01',DATE '2027-03-31',24,4,1,96000.00),
 ('0192a8c0-0027-7000-8a00-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AMC-2627-007','0192a8c0-0027-7000-8b00-000000000002','Pravin Compressor Services','labour_only',DATE '2026-07-01',DATE '2027-06-30',24,2,0,54000.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO amc_contract_asset (id, tenant_id, created_by, updated_by, amc_contract_id, asset_id) VALUES
 ('0192a8c0-0027-7000-8a10-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8a00-000000000001','0192a8c0-0027-7000-8300-000000000043'),
 ('0192a8c0-0027-7000-8a10-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0027-7000-8a00-000000000002','0192a8c0-0027-7000-8300-000000000040')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- The closure-approval ladder (FR-MNT-037). Above the cost threshold, or on ANY
-- safety-related job, closure routes through the platform W1 engine — Maintenance owns no
-- approval engine of its own. Roles map onto the demo realm's existing two; the ladder
-- itself is W1 configuration, so a tenant adds a plant-head step without a release.
-- ---------------------------------------------------------------------------
INSERT INTO workflow_definition (id, tenant_id, created_by, updated_by, code, version, name, subject_type, steps) VALUES
  ('0192a8c0-0027-7000-8c00-000000000001','0192a8c0-0000-7000-8000-000000000001',
   '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
   'mwo_closure_approval', 1, 'Maintenance Work Order Closure Approval', 'maintenance_work_order',
   '[{"seq":1,"name":"Maintenance manager review","approverType":"role","approverRef":"stores_incharge","slaHours":24},
     {"seq":2,"name":"Plant head sign-off","approverType":"role","approverRef":"admin","slaHours":48}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RBAC. Note the two grants that are deliberately SEPARATE and land only on the manager:
-- `mnt.downtime.adjust` and `mnt.mwo.prioritise`. They are the two levers that could
-- quietly flatter every reliability KPI at once, so they are made noisy by design (§14.3).
-- ---------------------------------------------------------------------------
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
       '0192a8c0-0003-7000-8000-000000000001', p
FROM unnest(ARRAY[
  'mnt.asset.read','mnt.asset.write','mnt.meter.read','mnt.meter.write',
  'mnt.request.create','mnt.request.read','mnt.request.triage',
  'mnt.mwo.read','mnt.mwo.write','mnt.mwo.execute','mnt.mwo.prioritise','mnt.mwo.close',
  'mnt.spare.read','mnt.spare.issue','mnt.labour.write',
  'mnt.pm.read','mnt.pm.write','mnt.downtime.read','mnt.downtime.adjust',
  'mnt.external.request','mnt.report.read','mnt.statutory.read','mnt.admin'
]) AS p
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;

-- Stores sees spare demand and reservations; the stock issue itself executes under
-- INVENTORY's permissions, never under a maintenance role. Structural SoD (§14.3).
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
       '0192a8c0-0003-7000-8000-000000000002', p
FROM unnest(ARRAY['mnt.asset.read','mnt.request.create','mnt.mwo.read','mnt.spare.read','mnt.pm.read']) AS p
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;

INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT gen_random_uuid(),'0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
       '0192a8c0-0003-7000-8000-000000000003', p
FROM unnest(ARRAY['mnt.asset.read','mnt.request.create','mnt.mwo.read','mnt.pm.read','mnt.report.read']) AS p
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;
