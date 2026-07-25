-- =============================================================================
-- 0025_seed_hrm — the statutory rate book, and the ten employees of §20.
--
-- Everything in the first half of this file is LAW, not preference: EPF's re-notified
-- ceiling, ESI's threshold, Maharashtra's February anomaly, Tamil Nadu's half-yearly
-- slabs, the FY 2026-27 new-regime bands, the s.2(y) 50% threshold in force since
-- 21 Nov 2025, and the 1-year fixed-term gratuity horizon. Each row carries a
-- `source_note` so a reader can trace the number to the notification it came from, and
-- none of them can ever be edited — only superseded by a row with a later
-- `effective_from` (0024 revokes UPDATE/DELETE and adds a trigger).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- s.2(y) Code on Wages — the definition the whole module turns on
-- ---------------------------------------------------------------------------
INSERT INTO stat_wage_definition (id, effective_from, source_note, created_by, addback_threshold_pct) VALUES
 ('0192a8c0-0025-7000-8000-000000000001', DATE '2025-11-21',
  'Code on Wages s.2(y); all four Labour Codes in force from 21-Nov-2025 (Ministry of Labour FAQs, 16-Mar-2026)',
  '0192a8c0-0000-7000-8000-0000000000ff', 50.00)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- EPF — ceiling Rs 15,000, re-notified 29-May-2026
-- ---------------------------------------------------------------------------
INSERT INTO stat_epf_config
 (id, effective_from, source_note, created_by, wage_ceiling, employee_pct, eps_pct, admin_pct, edli_pct) VALUES
 ('0192a8c0-0025-7000-8000-000000000002', DATE '2026-05-29',
  'EPF wage ceiling Rs 15,000 re-notified 29-May-2026; EPS 8.33%, admin 0.5%, EDLI 0.5%',
  '0192a8c0-0000-7000-8000-0000000000ff', 15000.00, 12.00, 8.33, 0.50, 0.50)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- ESI — Rs 21,000 gross threshold, Apr-Sep / Oct-Mar contribution-period lock-in
-- ---------------------------------------------------------------------------
INSERT INTO stat_esi_config
 (id, effective_from, source_note, created_by, gross_threshold, employee_pct, employer_pct, round_up) VALUES
 ('0192a8c0-0025-7000-8000-000000000003', DATE '2025-11-21',
  'ESI wage limit Rs 21,000; employee 0.75%, employer 3.25%; contributions round UP to the next rupee',
  '0192a8c0-0000-7000-8000-0000000000ff', 21000.00, 0.75, 3.25, true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Professional tax — Maharashtra (monthly, with the February anomaly)
-- ---------------------------------------------------------------------------
INSERT INTO stat_pt_slab
 (id, effective_from, source_note, created_by, state, period_basis, municipality,
  slab_from, slab_to, amount, amount_february, annual_cap, women_exempt_upto) VALUES
 ('0192a8c0-0025-7000-8000-000000000010', DATE '2025-04-01',
  'MH PT: nil up to Rs 7,500', '0192a8c0-0000-7000-8000-0000000000ff',
  'MH','monthly',NULL, 0.00, 7500.00, 0.00, NULL, 2500.00, 25000.00),
 ('0192a8c0-0025-7000-8000-000000000011', DATE '2025-04-01',
  'MH PT: Rs 175 between Rs 7,501 and Rs 10,000; women exemption threshold pending MH notification',
  '0192a8c0-0000-7000-8000-0000000000ff',
  'MH','monthly',NULL, 7500.01, 10000.00, 175.00, NULL, 2500.00, 25000.00),
 ('0192a8c0-0025-7000-8000-000000000012', DATE '2025-04-01',
  'MH PT: Rs 200/month above Rs 10,000, Rs 300 in February so the year totals exactly Rs 2,500',
  '0192a8c0-0000-7000-8000-0000000000ff',
  'MH','monthly',NULL, 10000.01, NULL, 200.00, 300.00, 2500.00, 25000.00)
ON CONFLICT (id) DO NOTHING;

-- Professional tax — Tamil Nadu (half-yearly, per municipality)
INSERT INTO stat_pt_slab
 (id, effective_from, source_note, created_by, state, period_basis, municipality,
  slab_from, slab_to, amount, amount_february, annual_cap, women_exempt_upto) VALUES
 ('0192a8c0-0025-7000-8000-000000000020', DATE '2025-04-01', 'TN PT half-yearly, Coimbatore',
  '0192a8c0-0000-7000-8000-0000000000ff','TN','half_yearly','Coimbatore',     0.00, 21000.00,    0.00, NULL, 2500.00, NULL),
 ('0192a8c0-0025-7000-8000-000000000021', DATE '2025-04-01', 'TN PT half-yearly, Coimbatore',
  '0192a8c0-0000-7000-8000-0000000000ff','TN','half_yearly','Coimbatore', 21000.01, 30000.00,  135.00, NULL, 2500.00, NULL),
 ('0192a8c0-0025-7000-8000-000000000022', DATE '2025-04-01', 'TN PT half-yearly, Coimbatore',
  '0192a8c0-0000-7000-8000-0000000000ff','TN','half_yearly','Coimbatore', 30000.01, 45000.00,  315.00, NULL, 2500.00, NULL),
 ('0192a8c0-0025-7000-8000-000000000023', DATE '2025-04-01', 'TN PT half-yearly, Coimbatore',
  '0192a8c0-0000-7000-8000-0000000000ff','TN','half_yearly','Coimbatore', 45000.01, 60000.00,  690.00, NULL, 2500.00, NULL),
 ('0192a8c0-0025-7000-8000-000000000024', DATE '2025-04-01', 'TN PT half-yearly, Coimbatore',
  '0192a8c0-0000-7000-8000-0000000000ff','TN','half_yearly','Coimbatore', 60000.01, 75000.00, 1025.00, NULL, 2500.00, NULL),
 ('0192a8c0-0025-7000-8000-000000000025', DATE '2025-04-01',
  'TN PT half-yearly: Rs 1,250 above Rs 75,000 half-yearly gross, the statutory maximum',
  '0192a8c0-0000-7000-8000-0000000000ff','TN','half_yearly','Coimbatore', 75000.01, NULL,    1250.00, NULL, 2500.00, NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- TDS — new regime, FY 2026-27
-- ---------------------------------------------------------------------------
INSERT INTO stat_tds_config
 (id, effective_from, source_note, created_by, fy, regime, standard_deduction,
  rebate_87a_amount, rebate_87a_income_limit, cess_pct, act_reference) VALUES
 ('0192a8c0-0025-7000-8000-000000000030', DATE '2026-04-01',
  'FY 2026-27 new regime: SD Rs 75,000; s.87A rebate Rs 60,000 where total income <= Rs 12,00,000; cess 4%',
  '0192a8c0-0000-7000-8000-0000000000ff', '2026-27', 'new', 75000.00, 60000.00, 1200000.00, 4.00,
  'Income-tax Act 2025 (eff. 01-Apr-2026), old-section cross-reference retained on registers')
ON CONFLICT (id) DO NOTHING;

INSERT INTO stat_tds_slab (id, effective_from, source_note, created_by, fy, regime, slab_from, slab_to, rate_pct) VALUES
 ('0192a8c0-0025-7000-8000-000000000031', DATE '2026-04-01','FY 2026-27 new regime slab','0192a8c0-0000-7000-8000-0000000000ff','2026-27','new',       0.00,  400000.00,  0.00),
 ('0192a8c0-0025-7000-8000-000000000032', DATE '2026-04-01','FY 2026-27 new regime slab','0192a8c0-0000-7000-8000-0000000000ff','2026-27','new',  400000.00,  800000.00,  5.00),
 ('0192a8c0-0025-7000-8000-000000000033', DATE '2026-04-01','FY 2026-27 new regime slab','0192a8c0-0000-7000-8000-0000000000ff','2026-27','new',  800000.00, 1200000.00, 10.00),
 ('0192a8c0-0025-7000-8000-000000000034', DATE '2026-04-01','FY 2026-27 new regime slab','0192a8c0-0000-7000-8000-0000000000ff','2026-27','new', 1200000.00, 1600000.00, 15.00),
 ('0192a8c0-0025-7000-8000-000000000035', DATE '2026-04-01','FY 2026-27 new regime slab','0192a8c0-0000-7000-8000-0000000000ff','2026-27','new', 1600000.00, 2000000.00, 20.00),
 ('0192a8c0-0025-7000-8000-000000000036', DATE '2026-04-01','FY 2026-27 new regime slab','0192a8c0-0000-7000-8000-0000000000ff','2026-27','new', 2000000.00, 2400000.00, 25.00),
 ('0192a8c0-0025-7000-8000-000000000037', DATE '2026-04-01','FY 2026-27 new regime slab','0192a8c0-0000-7000-8000-0000000000ff','2026-27','new', 2400000.00,       NULL, 30.00)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Gratuity and overtime
-- ---------------------------------------------------------------------------
INSERT INTO stat_gratuity_config
 (id, effective_from, source_note, created_by, factor_num, factor_den,
  vesting_years_default, vesting_years_fixed_term, tax_exempt_cap, wage_base) VALUES
 ('0192a8c0-0025-7000-8000-000000000040', DATE '2025-11-21',
  'Gratuity 15/26 on DEEMED wages; fixed-term staff vest at 1 year under the Codes, others at 5',
  '0192a8c0-0000-7000-8000-0000000000ff', 15, 26, 5, 1, 2000000.00, 'deemed_wages')
ON CONFLICT (id) DO NOTHING;

INSERT INTO stat_ot_config
 (id, effective_from, source_note, created_by, multiplier, rate_basis,
  daily_hours_cap, weekly_hours_cap, quarterly_ot_cap_hours) VALUES
 ('0192a8c0-0025-7000-8000-000000000041', DATE '2025-11-21',
  'Factories Act s.59: overtime at twice the ordinary rate; 9h daily / 48h weekly caps; 75h quarterly cap (state-overridable)',
  '0192a8c0-0000-7000-8000-0000000000ff', 2.00, 'gross_26_8', 9.00, 48.00, 75.00)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- The GL accounts a payroll journal posts to.
--
-- Defined here as DATA in the shared chart of accounts, not as constants in HRM code:
-- payroll posts THROUGH the Accounts port, and Accounts owns the ledger. HRM decides the
-- amounts; Accounts decides whether they may be recorded.
-- =============================================================================
INSERT INTO gl_account (id, tenant_id, created_by, updated_by, code, name, account_type, is_postable) VALUES
 ('0192a8c0-0025-7000-8000-000000000050','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','5110','Salaries and Wages','expense',true),
 ('0192a8c0-0025-7000-8000-000000000051','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','5115','Overtime Wages','expense',true),
 ('0192a8c0-0025-7000-8000-000000000052','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','5120','Employer Contribution - EPF','expense',true),
 ('0192a8c0-0025-7000-8000-000000000053','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','5121','Employer Contribution - ESI','expense',true),
 ('0192a8c0-0025-7000-8000-000000000054','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','2210','Salaries Payable','liability',true),
 ('0192a8c0-0025-7000-8000-000000000055','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','2410','EPF Payable','liability',true),
 ('0192a8c0-0025-7000-8000-000000000056','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','2411','ESI Payable','liability',true),
 ('0192a8c0-0025-7000-8000-000000000057','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','2412','Professional Tax Payable','liability',true),
 ('0192a8c0-0025-7000-8000-000000000058','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','2413','TDS Payable - Salaries','liability',true)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Shifts (§20.2). Trishul runs A/B/C rotating on the shop floor plus a General shift.
-- =============================================================================
INSERT INTO shift (id, tenant_id, created_by, updated_by, code, name, start_time, end_time,
                   break_minutes, grace_minutes, is_night, ot_after_minutes, half_day_threshold_minutes) VALUES
 ('0192a8c0-0025-7000-8000-000000000100','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','A','Shift A','06:00','14:00',30,10,false,480,240),
 ('0192a8c0-0025-7000-8000-000000000101','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','B','Shift B','14:00','22:00',30,10,false,480,240),
 -- C crosses midnight: its out-punch lands on the NEXT calendar day.
 ('0192a8c0-0025-7000-8000-000000000102','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','C','Shift C (night)','22:00','06:00',30,10,true,480,240),
 ('0192a8c0-0025-7000-8000-000000000103','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','GEN','General','09:00','17:30',60,15,false,510,255)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Leave types
-- =============================================================================
INSERT INTO leave_type (id, tenant_id, created_by, updated_by, code, name, is_paid, accrual_rule,
                        monthly_rate, annual_quota, carry_forward_cap, encashable, allow_negative, count_holidays) VALUES
 ('0192a8c0-0025-7000-8000-000000000110','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','PL','Privilege Leave',true,'monthly',1.50,18.00,30.00,true,false,true),
 ('0192a8c0-0025-7000-8000-000000000111','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CL','Casual Leave',true,'on_join',0.00,7.00,0.00,false,false,false),
 ('0192a8c0-0025-7000-8000-000000000112','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','SL','Sick Leave',true,'on_join',0.00,7.00,0.00,false,false,false),
 ('0192a8c0-0025-7000-8000-000000000113','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','ML','Maternity Leave',true,'none',0.00,182.00,0.00,false,false,true),
 ('0192a8c0-0025-7000-8000-000000000114','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CO','Comp-Off',true,'none',0.00,0.00,0.00,false,false,false),
 -- LOP is a leave TYPE so that an unpaid absence is an explicit, approvable decision
 -- rather than an unexplained gap in the muster.
 ('0192a8c0-0025-7000-8000-000000000115','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','LOP','Loss of Pay',false,'none',0.00,0.00,0.00,false,true,false)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Salary components — every one classified for s.2(y). There is no 'unclassified'.
-- =============================================================================
INSERT INTO salary_component (id, tenant_id, created_by, updated_by, code, name, component_type,
                              calc_type, is_taxable, wage_class, gl_account_code, sequence) VALUES
 ('0192a8c0-0025-7000-8000-000000000120','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','BASIC','Basic','earning','percentage',true,'included','5110',10),
 ('0192a8c0-0025-7000-8000-000000000121','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','HRA','House Rent Allowance','earning','percentage',true,'excluded','5110',20),
 ('0192a8c0-0025-7000-8000-000000000122','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','SPL','Special Allowance','earning','percentage',true,'excluded','5110',30),
 -- OT is EXCLUDED — which is precisely why paying it can trigger the s.2(y) add-back.
 ('0192a8c0-0025-7000-8000-000000000123','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','OT','Overtime (2x)','earning','formula',true,'excluded','5115',40)
ON CONFLICT (id) DO NOTHING;

-- Structure "TPC Operator O2" — 50 / 20 / 30. On Sanjay's Rs 19,500 that is exactly the
-- 9,750 / 3,900 / 5,850 of the worked payslip in §20.4.
INSERT INTO salary_structure (id, tenant_id, created_by, updated_by, code, name, effective_from, status) VALUES
 ('0192a8c0-0025-7000-8000-000000000130','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','TPC-O2','TPC Operator O2',DATE '2026-04-01','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO salary_structure_component (id, tenant_id, created_by, updated_by, structure_id, component_id, value_pct, value_amount, sequence) VALUES
 ('0192a8c0-0025-7000-8000-000000000131','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0025-7000-8000-000000000130','0192a8c0-0025-7000-8000-000000000120',50.000,NULL,10),
 ('0192a8c0-0025-7000-8000-000000000132','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0025-7000-8000-000000000130','0192a8c0-0025-7000-8000-000000000121',20.000,NULL,20),
 ('0192a8c0-0025-7000-8000-000000000133','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0025-7000-8000-000000000130','0192a8c0-0025-7000-8000-000000000122',30.000,NULL,30)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- The ten employees of §20.1. PAN/Aadhaar/bank are deliberately NULL here: they are
-- written through the application so they arrive ENCRYPTED. A seed file cannot produce a
-- valid AES-GCM envelope, and it should not be able to.
-- =============================================================================
INSERT INTO employee (id, tenant_id, created_by, updated_by, emp_code, first_name, last_name, gender,
                      employment_type, fixed_term_end_date, date_of_joining, status,
                      pt_state, pt_municipality, epf_ceiling_policy, location_ref,
                      department, designation, cost_centre, default_shift_id, pii_notice_version) VALUES
 ('0192a8c0-0025-7000-8000-000000000201','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','TPC-0001','Rajesh','Kulkarni','male','permanent',NULL,DATE '2016-06-01','active','MH',NULL,'capped_at_15000','0192a8c0-0002-7000-8000-000000000001','Operations','Plant Head','CC-OPS','0192a8c0-0025-7000-8000-000000000103','v1.0'),
 ('0192a8c0-0025-7000-8000-000000000202','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','TPC-0002','Meera','Iyer','female','permanent',NULL,DATE '2018-04-02','active','MH',NULL,'capped_at_15000','0192a8c0-0002-7000-8000-000000000001','Finance','Finance Controller','CC-FIN','0192a8c0-0025-7000-8000-000000000103','v1.0'),
 ('0192a8c0-0025-7000-8000-000000000203','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','TPC-0003','Priya','Deshmukh','female','permanent',NULL,DATE '2019-07-15','active','MH',NULL,'capped_at_15000','0192a8c0-0002-7000-8000-000000000001','HR','HR Manager','CC-HR','0192a8c0-0025-7000-8000-000000000103','v1.0'),
 ('0192a8c0-0025-7000-8000-000000000204','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','TPC-0004','Kavita','Rao','female','permanent',NULL,DATE '2020-01-06','active','MH',NULL,'capped_at_15000','0192a8c0-0002-7000-8000-000000000001','Quality','Quality Engineer','CC-QC','0192a8c0-0025-7000-8000-000000000103','v1.0'),
 ('0192a8c0-0025-7000-8000-000000000205','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','TPC-0005','Deepa','Menon','female','permanent',NULL,DATE '2020-09-01','active','MH',NULL,'capped_at_15000','0192a8c0-0002-7000-8000-000000000001','Purchase','Purchase Officer','CC-PUR','0192a8c0-0025-7000-8000-000000000103','v1.0'),
 ('0192a8c0-0025-7000-8000-000000000206','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','TPC-0006','Arun','Nair','male','permanent',NULL,DATE '2021-02-15','active','MH',NULL,'capped_at_15000','0192a8c0-0002-7000-8000-000000000001','Stores','Stores In-charge','CC-STR','0192a8c0-0025-7000-8000-000000000103','v1.0'),
 ('0192a8c0-0025-7000-8000-000000000207','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','TPC-0007','Imran','Shaikh','male','permanent',NULL,DATE '2021-08-09','active','MH',NULL,'capped_at_15000','0192a8c0-0002-7000-8000-000000000001','Maintenance','Maintenance Technician','CC-MNT','0192a8c0-0025-7000-8000-000000000101','v1.0'),
 ('0192a8c0-0025-7000-8000-000000000208','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','TPC-0008','Sanjay','Patil','male','permanent',NULL,DATE '2021-06-01','active','MH',NULL,'capped_at_15000','0192a8c0-0002-7000-8000-000000000001','Production','CNC Operator','CC-PRD','0192a8c0-0025-7000-8000-000000000100','v1.0'),
 -- Vikram is FIXED-TERM: gratuity vests at one year (01-Apr-2027), not five.
 ('0192a8c0-0025-7000-8000-000000000209','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','TPC-0009','Vikram','Jadhav','male','fixed_term',DATE '2027-03-31',DATE '2026-04-01','active','MH',NULL,'capped_at_15000','0192a8c0-0002-7000-8000-000000000001','Production','CNC Operator','CC-PRD','0192a8c0-0025-7000-8000-000000000101','v1.0'),
 -- Lakshmi is at the Coimbatore plant: Tamil Nadu PT, half-yearly, per municipality.
 ('0192a8c0-0025-7000-8000-000000000210','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','TPC-0010','Lakshmi','Subramanian','female','permanent',NULL,DATE '2019-11-04','active','TN','Coimbatore','capped_at_15000','0192a8c0-0002-7000-8000-000000000002','Production','Machine Operator','CC-PRD','0192a8c0-0025-7000-8000-000000000100','v1.0')
ON CONFLICT (id) DO NOTHING;

-- Reporting lines: everyone reports to the Plant Head for demo approval routing.
UPDATE employee SET reporting_manager_id = '0192a8c0-0025-7000-8000-000000000201'
 WHERE tenant_id = '0192a8c0-0000-7000-8000-000000000001'
   AND id <> '0192a8c0-0025-7000-8000-000000000201';

-- Statutory identifiers and bank routing, so the ECR and bank-advice exports are
-- believable rather than blank. (PAN/Aadhaar/bank ACCOUNT numbers stay NULL — those are
-- the encrypted fields, and only the application can produce a valid envelope.)
UPDATE employee
   SET uan         = '1011' || lpad(substring(emp_code from 5), 8, '0'),
       esic_number = '31'   || lpad(substring(emp_code from 5), 15, '0'),
       bank_ifsc   = CASE WHEN pt_state = 'TN' THEN 'HDFC0001234' ELSE 'ICIC0000456' END
 WHERE tenant_id = '0192a8c0-0000-7000-8000-000000000001'
   AND uan IS NULL;

-- Salary assignments (§20.1 monthly gross).
INSERT INTO employee_salary_assignment (id, tenant_id, created_by, updated_by, employee_id, structure_id,
                                        monthly_gross, ctc, effective_from, status) VALUES
 ('0192a8c0-0025-7000-8000-000000000301','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0025-7000-8000-000000000201','0192a8c0-0025-7000-8000-000000000130',220000.00,2640000.00,DATE '2026-04-01','active'),
 ('0192a8c0-0025-7000-8000-000000000302','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0025-7000-8000-000000000202','0192a8c0-0025-7000-8000-000000000130',180000.00,2160000.00,DATE '2026-04-01','active'),
 ('0192a8c0-0025-7000-8000-000000000303','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0025-7000-8000-000000000203','0192a8c0-0025-7000-8000-000000000130',125000.00,1500000.00,DATE '2026-04-01','active'),
 ('0192a8c0-0025-7000-8000-000000000304','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0025-7000-8000-000000000204','0192a8c0-0025-7000-8000-000000000130', 60000.00, 720000.00,DATE '2026-04-01','active'),
 ('0192a8c0-0025-7000-8000-000000000305','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0025-7000-8000-000000000205','0192a8c0-0025-7000-8000-000000000130', 55000.00, 660000.00,DATE '2026-04-01','active'),
 ('0192a8c0-0025-7000-8000-000000000306','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0025-7000-8000-000000000206','0192a8c0-0025-7000-8000-000000000130', 45000.00, 540000.00,DATE '2026-04-01','active'),
 ('0192a8c0-0025-7000-8000-000000000307','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0025-7000-8000-000000000207','0192a8c0-0025-7000-8000-000000000130', 32000.00, 384000.00,DATE '2026-04-01','active'),
 ('0192a8c0-0025-7000-8000-000000000308','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0025-7000-8000-000000000208','0192a8c0-0025-7000-8000-000000000130', 19500.00, 234000.00,DATE '2026-04-01','active'),
 ('0192a8c0-0025-7000-8000-000000000309','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0025-7000-8000-000000000209','0192a8c0-0025-7000-8000-000000000130', 18200.00, 218400.00,DATE '2026-04-01','active'),
 ('0192a8c0-0025-7000-8000-000000000310','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0025-7000-8000-000000000210','0192a8c0-0025-7000-8000-000000000130', 20500.00, 246000.00,DATE '2026-04-01','active')
ON CONFLICT (id) DO NOTHING;

-- Opening leave balances for FY 2026-27 (PL accrues 1.5/month; CL and SL credited on join).
INSERT INTO leave_balance (id, tenant_id, created_by, updated_by, employee_id, leave_type_id, period_year, opening, accrued, used, encashed)
SELECT
  ('0192a8c0-0025-7100-8000-' || lpad((row_number() OVER (ORDER BY e.emp_code, lt.code))::text, 12, '0'))::uuid,
  e.tenant_id, e.created_by, e.updated_by, e.id, lt.id, '2026-27',
  CASE lt.code WHEN 'PL' THEN 6.00 WHEN 'CL' THEN 7.00 WHEN 'SL' THEN 7.00 ELSE 0.00 END,
  CASE lt.code WHEN 'PL' THEN 4.50 ELSE 0.00 END,   -- Apr, May, Jun accrual
  0.00, 0.00
FROM employee e
CROSS JOIN leave_type lt
WHERE e.tenant_id = '0192a8c0-0000-7000-8000-000000000001'
  AND lt.tenant_id = '0192a8c0-0000-7000-8000-000000000001'
  AND lt.code IN ('PL','CL','SL')
ON CONFLICT (tenant_id, employee_id, leave_type_id, period_year) DO NOTHING;

-- =============================================================================
-- RBAC. Note how the payroll permissions are split across TWO roles.
--
-- Segregation of duties is defended three times over, and this is the outermost layer:
--   (a) the preparer's role does not carry `hrm.payroll.approve` at all, so the request
--       is refused by the permission guard before it reaches a service;
--   (b) the service refuses an approver equal to the preparer;
--   (c) `ck_payrollrun_sod` refuses it in the database, even for a direct SQL statement.
-- =============================================================================
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT gen_random_uuid(),
       '0192a8c0-0000-7000-8000-000000000001',
       '0192a8c0-0000-7000-8000-0000000000ff',
       '0192a8c0-0000-7000-8000-0000000000ff',
       '0192a8c0-0003-7000-8000-000000000001',
       p
FROM unnest(ARRAY[
  'hrm.employee.read','hrm.employee.write','hrm.employee.pii_reveal',
  'hrm.attendance.read','hrm.attendance.ingest','hrm.attendance.process',
  'hrm.attendance.lock','hrm.attendance.regularise','hrm.attendance.approve',
  'hrm.roster.write',
  'hrm.leave.read','hrm.leave.apply','hrm.leave.approve','hrm.leave.accrue',
  'hrm.payroll.read','hrm.payroll.prepare','hrm.payroll.post',
  'hrm.statutory.read'
  -- deliberately ABSENT: hrm.payroll.approve
]) AS p
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;

-- The approver is a different person holding a different role.
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT gen_random_uuid(),
       '0192a8c0-0000-7000-8000-000000000001',
       '0192a8c0-0000-7000-8000-0000000000ff',
       '0192a8c0-0000-7000-8000-0000000000ff',
       '0192a8c0-0003-7000-8000-000000000002',
       p
FROM unnest(ARRAY['hrm.payroll.read','hrm.payroll.approve','hrm.attendance.read']) AS p
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;
