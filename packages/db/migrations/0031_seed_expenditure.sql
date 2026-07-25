-- =============================================================================
-- 0031_seed_expenditure — the spend catalogue, the statutory rate books, the FY 26-27
-- budgets and the recurring templates.
--
-- Everything here is CONFIGURATION or MASTER DATA. Not one claim, advance or invoice is
-- seeded: the EXP-2627 documents of §20.5 and §20.8 are created by the services, through
-- the same code path a person would drive, so the demo proves the budget engine rather
-- than a fixture that agrees with it.
--
-- TWO statutory reconciliations are stated rather than glossed, because the blueprint's
-- own figures predate the Finance Act 2025:
--
--  (a) **194J.** §20.8 deducts ₹4,500 on a single ₹45,000 professional-fee bill. The
--      threshold for s.194J was raised from ₹30,000 to ₹50,000 with effect from
--      01-Apr-2025, so a FIRST ₹45,000 bill in FY 26-27 does not reach it. Both rate rows
--      are seeded — the pre-2025 one closed on 31-Mar-2025 — and the accumulator is seeded
--      with the Q1 payment, so the deduction lands on the Q2 bill where it is actually due.
--      The demo shows the crossing, which is a better beat than an unexplained ₹4,500.
--
--  (b) **194I.** §20.8 justifies the ₹10,000 rent deduction as "annual > ₹2.4L". That was
--      the pre-2025 test. From 01-Apr-2025 the test is ₹50,000 PER MONTH, which a
--      ₹1,00,000 monthly rent crosses on the first bill — so the blueprint's figure is
--      right and its stated reason is out of date. The seeded row carries the current
--      rule and a source note saying exactly that.
--
-- Every rate row carries a `source_note`. A number in a tax register that cannot say where
-- it came from is a number somebody will have to defend without help.
-- =============================================================================

-- Trishul tenant 0192a8c0-0000-7000-8000-000000000001 · Kaveri …002
-- system actor    0192a8c0-0000-7000-8000-0000000000ff
-- employees (HRM): Rajesh …201 · Meera …202 · Priya …203 · Kavita …204 · Deepa …205
--                  Arun …206 · Imran …207 · Sanjay …208

-- ---------------------------------------------------------------------------
-- The spend catalogue (§20.1). The ITC column is the module's most consequential
-- configuration: it is the difference between a recoverable tax and a cost, and the
-- s.17(5) blocks below are the ones a factory actually hits.
--
-- `category_keywords` is the deterministic baseline AI #1 must beat. It is data here, not
-- a dictionary compiled into the code, so a tenant whose canteen is called something else
-- fixes their own categorisation without a release.
-- ---------------------------------------------------------------------------
INSERT INTO expense_head
  (id, tenant_id, created_by, updated_by, code, name, capex_flag, gst_rate, itc_eligibility,
   default_tds_section, receipt_threshold, category_keywords) VALUES
 ('0192a8c0-0031-7000-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'EH-TRV-AIR','Travel — air and rail',false,5.00,'eligible',NULL,0,
  '["indigo","air india","vistara","spicejet","akasa","irctc","railway","boarding pass","pnr","e-ticket"]'::jsonb),
 ('0192a8c0-0031-7000-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'EH-TRV-HTL','Travel — lodging',false,12.00,'eligible',NULL,0,
  '["hotel","residency","inn","lodge","suites","guest house","room rent","tariff","check-in"]'::jsonb),
 -- s.17(5)(b)(i). A meal on a company-GSTIN invoice is still a meal.
 ('0192a8c0-0031-7000-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'EH-TRV-MEA','Travel — meals',false,5.00,'blocked_17_5_food',NULL,500,
  '["restaurant","cafe","dhaba","hotel meals","food","bhojan","canteen","tiffin","barbeque"]'::jsonb),
 ('0192a8c0-0031-7000-8000-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'EH-TRV-PDM','Per-diem allowance',false,NULL,'blocked_other',NULL,0,'[]'::jsonb),
 -- s.17(5)(a)/(b): rent-a-cab scope.
 ('0192a8c0-0031-7000-8000-000000000005','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'EH-TRV-CONV','Local conveyance and mileage',false,5.00,'blocked_17_5_motor_vehicle',NULL,500,
  '["ola","uber","travels","taxi","cab","auto","rickshaw","transfer","toll","parking"]'::jsonb),
 ('0192a8c0-0031-7000-8000-000000000006','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'EH-MRO-SPR','MRO spares (indirect)',false,18.00,'eligible',NULL,0,
  '["spare","bearing","seal","gasket","belt","lubricant","grease","hardware","fastener"]'::jsonb),
 ('0192a8c0-0031-7000-8000-000000000007','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'EH-MNT-AMC','AMC and service contracts',false,18.00,'eligible','194C',0,
  '["amc","annual maintenance","service contract","preventive","breakdown call"]'::jsonb),
 ('0192a8c0-0031-7000-8000-000000000008','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'EH-FAC-HKP','Housekeeping and facility',false,18.00,'eligible','194C',0,
  '["housekeeping","facility","cleaning","pest control","security","manpower"]'::jsonb),
 -- Electricity is an exempt supply: no GST is charged, so there is no credit to take. The
 -- ck_head_exempt CHECK refuses this row if anybody ever puts a rate on it.
 ('0192a8c0-0031-7000-8000-000000000009','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'EH-UTL-ELE','Electricity',false,NULL,'exempt',NULL,0,
  '["msedcl","mseb","discom","tangedco","electricity","power bill","units consumed","meter"]'::jsonb),
 ('0192a8c0-0031-7000-8000-00000000000a','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'EH-FRT-EXP','Freight on expense',false,5.00,'rcm','194C',0,
  '["logistics","freight","transport","courier","lorry","consignment","lr no"]'::jsonb),
 ('0192a8c0-0031-7000-8000-00000000000b','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'EH-PRF-FEE','Professional fees',false,18.00,'eligible','194J',0,
  '["chartered","consult","advocate","audit","professional","advisory","company secretary"]'::jsonb),
 ('0192a8c0-0031-7000-8000-00000000000c','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'EH-RNT-FAC','Rent — factory and office',false,18.00,'eligible','194I',0,
  '["rent","lease","shed","premises","landlord","tenancy"]'::jsonb),
 -- s.17(5)(g): personal consumption.
 ('0192a8c0-0031-7000-8000-00000000000d','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'EH-STF-WEL','Staff welfare and guest house',false,18.00,'blocked_17_5_personal',NULL,500,
  '["guest house","welfare","gift","diwali","refreshment","grocery","provision"]'::jsonb),
 ('0192a8c0-0031-7000-8000-00000000000e','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'EH-PRD-CON','Production consumables',false,18.00,'eligible',NULL,0,
  '["consumable","cutting oil","coolant","abrasive","insert","tip","welding"]'::jsonb),
 ('0192a8c0-0031-7000-8000-00000000000f','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'EH-PRD-TOOL','Tooling (indirect)',false,18.00,'eligible','194C',0,
  '["regrind","tooling","carbide","fixture","jig","gauge"]'::jsonb),
 ('0192a8c0-0031-7000-8000-000000000010','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'EH-PWR-FUL','Power and fuel',false,18.00,'eligible',NULL,0,
  '["diesel","hsd","furnace oil","lpg","indian oil","bharat petroleum","hp petrol"]'::jsonb),
 ('0192a8c0-0031-7000-8000-000000000011','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'EH-OFF-MSC','Office and miscellaneous',false,18.00,'eligible',NULL,500,
  '["stationery","printer","cartridge","courier","subscription","xerox"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- The TDS rate book. Append-only and effective-dated: the pre-Finance-Act-2025 rows are
-- CLOSED rather than edited, so a 2024 document can still be reproduced exactly.
-- ---------------------------------------------------------------------------
INSERT INTO tds_config
  (id, tenant_id, created_by, updated_by, section, deductee_type, rate_pct,
   single_payment_threshold, annual_threshold, it_act_2025_section, effective_from, effective_to, source_note) VALUES
 -- 194C — contractors. Unchanged by the Finance Act 2025.
 ('0192a8c0-0031-7000-8000-000000000101','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '194C','individual_huf',1.000,30000,100000,'s.393(3) Table',DATE '2020-04-01',NULL,
  'Income-tax Act 1961 s.194C: 1% where the payee is an individual or HUF; single payment limit Rs 30,000, aggregate Rs 1,00,000 in the financial year.'),
 ('0192a8c0-0031-7000-8000-000000000102','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '194C','company_firm_other',2.000,30000,100000,'s.393(3) Table',DATE '2020-04-01',NULL,
  'Income-tax Act 1961 s.194C: 2% where the payee is any other person; same thresholds.'),
 -- 194J — professional and technical. The threshold moved on 01-Apr-2025.
 ('0192a8c0-0031-7000-8000-000000000103','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '194J','any',10.000,30000,30000,'s.393(3) Table',DATE '2020-04-01',DATE '2025-03-31',
  'Income-tax Act 1961 s.194J before the Finance Act 2025: 10% on professional fees, threshold Rs 30,000. CLOSED, retained so pre-FY-25-26 documents remain reproducible.'),
 ('0192a8c0-0031-7000-8000-000000000104','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '194J','any',10.000,50000,50000,'s.393(3) Table',DATE '2025-04-01',NULL,
  'Income-tax Act 1961 s.194J as amended by the Finance Act 2025: threshold raised from Rs 30,000 to Rs 50,000 with effect from 01-Apr-2025. This is why the demo''s first Rs 45,000 professional-fee bill carries no deduction and the second one does.'),
 -- 194I — rent. Now a per-month test, which is what the demo actually crosses.
 ('0192a8c0-0031-7000-8000-000000000105','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '194I','any',10.000,240000,240000,'s.393(3) Table',DATE '2020-04-01',DATE '2025-03-31',
  'Income-tax Act 1961 s.194I before the Finance Act 2025: 10% on rent of land, building or furniture, annual threshold Rs 2,40,000. CLOSED.'),
 ('0192a8c0-0031-7000-8000-000000000106','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '194I','any',10.000,50000,600000,'s.393(3) Table',DATE '2025-04-01',NULL,
  'Income-tax Act 1961 s.194I as amended by the Finance Act 2025: the test becomes Rs 50,000 PER MONTH from 01-Apr-2025. A Rs 1,00,000 monthly rent therefore crosses on the first bill — the blueprint reaches the same Rs 10,000 deduction by the older annual-Rs-2.4L reasoning.'),
 -- 194Q — purchase of goods. Seeded so the section is configured rather than guessed at.
 ('0192a8c0-0031-7000-8000-000000000107','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '194Q','any',0.100,5000000,5000000,'s.393(3) Table',DATE '2021-07-01',NULL,
  'Income-tax Act 1961 s.194Q: 0.1% on purchase of goods beyond Rs 50,00,000 from one seller in the financial year.')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Per-diem, effective 01-Apr-2026 (§20.2). Grade codes match the HRM designations.
-- ---------------------------------------------------------------------------
INSERT INTO per_diem_rate
  (id, tenant_id, created_by, updated_by, grade_code, city_tier, trip_type, daily_rate, lodging_rate, meals_rate, effective_from) VALUES
 ('0192a8c0-0031-7000-8000-000000000201','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','MGR','A','domestic',1800,4500,900,DATE '2026-04-01'),
 ('0192a8c0-0031-7000-8000-000000000202','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','MGR','B','domestic',1400,3200,700,DATE '2026-04-01'),
 ('0192a8c0-0031-7000-8000-000000000203','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','MGR','C','domestic',1000,2200,500,DATE '2026-04-01'),
 ('0192a8c0-0031-7000-8000-000000000204','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','ENG','A','domestic',1400,3500,700,DATE '2026-04-01'),
 ('0192a8c0-0031-7000-8000-000000000205','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','ENG','B','domestic',1100,2600,550,DATE '2026-04-01'),
 ('0192a8c0-0031-7000-8000-000000000206','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','ENG','C','domestic',800,1800,400,DATE '2026-04-01'),
 ('0192a8c0-0031-7000-8000-000000000207','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','OPR','A','domestic',1000,2500,500,DATE '2026-04-01'),
 ('0192a8c0-0031-7000-8000-000000000208','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','OPR','B','domestic',800,2000,400,DATE '2026-04-01'),
 ('0192a8c0-0031-7000-8000-000000000209','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','OPR','C','domestic',600,1500,300,DATE '2026-04-01')
ON CONFLICT (id) DO NOTHING;

-- A single FX row so the effective-dated conversion rule has something to demonstrate.
INSERT INTO fx_rate (id, tenant_id, created_by, updated_by, currency, rate_to_inr, effective_from, source) VALUES
 ('0192a8c0-0031-7000-8000-000000000301','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','USD',86.400000,DATE '2026-07-01','rbi_reference'),
 ('0192a8c0-0031-7000-8000-000000000302','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','EUR',94.150000,DATE '2026-07-01','rbi_reference')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Numbering. FY 2026-27 → `2627`. Claims start at 11 and indirect expenses at 21, which
-- is the §20 narrative's own numbering.
-- ---------------------------------------------------------------------------
INSERT INTO exp_document_series (id, tenant_id, created_by, updated_by, doc_type, prefix, fy_code, width, next_no) VALUES
 ('0192a8c0-0031-7000-8000-000000000401','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','claim'   ,'EXP','2627',5,11),
 ('0192a8c0-0031-7000-8000-000000000402','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','indirect','EXP','2627',5,21),
 ('0192a8c0-0031-7000-8000-000000000403','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','travel'  ,'TRV','2627',5,4),
 ('0192a8c0-0031-7000-8000-000000000404','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','advance' ,'ADV','2627',5,3),
 ('0192a8c0-0031-7000-8000-000000000405','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','batch'   ,'RMB','2627',4,1)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- FY 2026-27 OpEx budgets (§20.4), one active version per cost centre.
--
-- The control action per line is the interesting configuration. MRO spares and tooling are
-- STOP because an unbudgeted spike there is exactly what a controller wants to hear about
-- before it happens. Travel is WARN because refusing a customer visit to protect a budget
-- line is usually the more expensive decision. Rent is IGNORE because the lease was signed
-- last year and the system refusing to record it changes nothing except the accounts.
-- ---------------------------------------------------------------------------
INSERT INTO budget (id, tenant_id, created_by, updated_by, fiscal_year, cost_centre_ref, budget_type, basis, version_no, status) VALUES
 ('0192a8c0-0031-7000-8000-000000000501','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','2627','CC-PNQ-PROD','opex','monthly',1,'active'),
 ('0192a8c0-0031-7000-8000-000000000502','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','2627','CC-PNQ-MNT' ,'opex','monthly',1,'active'),
 ('0192a8c0-0031-7000-8000-000000000503','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','2627','CC-ADM'     ,'opex','monthly',1,'active'),
 ('0192a8c0-0031-7000-8000-000000000504','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','2627','CC-SLS'     ,'opex','monthly',1,'active'),
 ('0192a8c0-0031-7000-8000-000000000505','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','2627','CC-CBE-PROD','opex','monthly',1,'active')
ON CONFLICT (id) DO NOTHING;

-- An even twelfth for every line: the CHECK refuses any distribution whose cells do not
-- sum to the annual figure, so the arithmetic below is verified by the database on insert.
INSERT INTO budget_line (id, tenant_id, created_by, updated_by, budget_id, expense_head_id, annual_amount, monthly_distribution, control_action) VALUES
 -- CC-PNQ-PROD
 ('0192a8c0-0031-7000-8000-000000000601','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000501','0192a8c0-0031-7000-8000-00000000000e', 900000,'[75000,75000,75000,75000,75000,75000,75000,75000,75000,75000,75000,75000]'::jsonb,'warn'),
 ('0192a8c0-0031-7000-8000-000000000602','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000501','0192a8c0-0031-7000-8000-000000000010',2400000,'[200000,200000,200000,200000,200000,200000,200000,200000,200000,200000,200000,200000]'::jsonb,'warn'),
 ('0192a8c0-0031-7000-8000-000000000603','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000501','0192a8c0-0031-7000-8000-00000000000f', 600000,'[50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000]'::jsonb,'stop'),
 -- CC-PNQ-MNT — the STOP head the demo's budget arc runs through.
 ('0192a8c0-0031-7000-8000-000000000604','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000502','0192a8c0-0031-7000-8000-000000000006', 720000,'[60000,60000,60000,60000,60000,60000,60000,60000,60000,60000,60000,60000]'::jsonb,'stop'),
 ('0192a8c0-0031-7000-8000-000000000605','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000502','0192a8c0-0031-7000-8000-000000000007', 480000,'[40000,40000,40000,40000,40000,40000,40000,40000,40000,40000,40000,40000]'::jsonb,'warn'),
 -- CC-ADM
 ('0192a8c0-0031-7000-8000-000000000606','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000503','0192a8c0-0031-7000-8000-000000000008', 576000,'[48000,48000,48000,48000,48000,48000,48000,48000,48000,48000,48000,48000]'::jsonb,'warn'),
 ('0192a8c0-0031-7000-8000-000000000607','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000503','0192a8c0-0031-7000-8000-00000000000c',1200000,'[100000,100000,100000,100000,100000,100000,100000,100000,100000,100000,100000,100000]'::jsonb,'ignore'),
 ('0192a8c0-0031-7000-8000-000000000608','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000503','0192a8c0-0031-7000-8000-000000000011', 360000,'[30000,30000,30000,30000,30000,30000,30000,30000,30000,30000,30000,30000]'::jsonb,'warn'),
 ('0192a8c0-0031-7000-8000-000000000609','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000503','0192a8c0-0031-7000-8000-00000000000b', 240000,'[20000,20000,20000,20000,20000,20000,20000,20000,20000,20000,20000,20000]'::jsonb,'warn'),
 -- CC-SLS — per-diem is STOP, which is what makes the travel story have a limit.
 ('0192a8c0-0031-7000-8000-00000000060a','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000504','0192a8c0-0031-7000-8000-000000000001', 840000,'[70000,70000,70000,70000,70000,70000,70000,70000,70000,70000,70000,70000]'::jsonb,'warn'),
 ('0192a8c0-0031-7000-8000-00000000060b','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000504','0192a8c0-0031-7000-8000-000000000002', 600000,'[50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000,50000]'::jsonb,'warn'),
 ('0192a8c0-0031-7000-8000-00000000060c','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000504','0192a8c0-0031-7000-8000-000000000004', 300000,'[25000,25000,25000,25000,25000,25000,25000,25000,25000,25000,25000,25000]'::jsonb,'stop'),
 ('0192a8c0-0031-7000-8000-00000000060d','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000504','0192a8c0-0031-7000-8000-00000000000a', 420000,'[35000,35000,35000,35000,35000,35000,35000,35000,35000,35000,35000,35000]'::jsonb,'warn'),
 ('0192a8c0-0031-7000-8000-00000000060e','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000504','0192a8c0-0031-7000-8000-000000000003', 180000,'[15000,15000,15000,15000,15000,15000,15000,15000,15000,15000,15000,15000]'::jsonb,'warn'),
 ('0192a8c0-0031-7000-8000-00000000060f','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000504','0192a8c0-0031-7000-8000-000000000005', 120000,'[10000,10000,10000,10000,10000,10000,10000,10000,10000,10000,10000,10000]'::jsonb,'warn'),
 -- CC-CBE-PROD
 ('0192a8c0-0031-7000-8000-000000000610','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000505','0192a8c0-0031-7000-8000-000000000010',1500000,'[125000,125000,125000,125000,125000,125000,125000,125000,125000,125000,125000,125000]'::jsonb,'warn'),
 ('0192a8c0-0031-7000-8000-000000000611','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000505','0192a8c0-0031-7000-8000-00000000000e', 540000,'[45000,45000,45000,45000,45000,45000,45000,45000,45000,45000,45000,45000]'::jsonb,'warn'),
 ('0192a8c0-0031-7000-8000-000000000612','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000505','0192a8c0-0031-7000-8000-00000000000c',1200000,'[100000,100000,100000,100000,100000,100000,100000,100000,100000,100000,100000,100000]'::jsonb,'ignore')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Recurring templates (§20.9). None auto-posts: `auto_post` is false everywhere, so the
-- generator produces a DRAFT that a person approves. The ceiling column exists for the day
-- a tenant turns it on, and the CHECK refuses auto-posting without one.
-- ---------------------------------------------------------------------------
INSERT INTO recurring_expense
  (id, tenant_id, created_by, updated_by, template_code, expense_head_id, vendor_name, cost_centre_ref,
   amount, gst_rate, frequency, next_run_date, auto_post, auto_post_ceiling, status) VALUES
 ('0192a8c0-0031-7000-8000-000000000701','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'REC-HKP-ARKA','0192a8c0-0031-7000-8000-000000000008','Arka Facility Services','CC-ADM',40000,18.00,'monthly',DATE '2026-08-01',false,NULL,'active'),
 ('0192a8c0-0031-7000-8000-000000000702','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'REC-RNT-CBE','0192a8c0-0031-7000-8000-00000000000c','Coimbatore shed landlord','CC-CBE-PROD',100000,18.00,'monthly',DATE '2026-08-01',false,NULL,'active'),
 ('0192a8c0-0031-7000-8000-000000000703','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'REC-ISO-CERT','0192a8c0-0031-7000-8000-00000000000b','TUV certification body','CC-ADM',85000,18.00,'annual',DATE '2027-01-15',false,NULL,'active')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Kaveri ElectroFab: the cross-tenant leak-probe counterpart. One head, one budget, one
-- series — the minimum a claim needs to exist.
-- ---------------------------------------------------------------------------
INSERT INTO expense_head (id, tenant_id, created_by, updated_by, code, name, gst_rate, itc_eligibility, receipt_threshold) VALUES
 ('0192a8c0-0031-7000-8000-000000000801','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','EH-GEN','General expense',18.00,'eligible',500)
ON CONFLICT (id) DO NOTHING;

INSERT INTO budget (id, tenant_id, created_by, updated_by, fiscal_year, cost_centre_ref, budget_type, basis, version_no, status) VALUES
 ('0192a8c0-0031-7000-8000-000000000802','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','2627','KEF-GEN','opex','monthly',1,'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO budget_line (id, tenant_id, created_by, updated_by, budget_id, expense_head_id, annual_amount, monthly_distribution, control_action) VALUES
 ('0192a8c0-0031-7000-8000-000000000803','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0031-7000-8000-000000000802','0192a8c0-0031-7000-8000-000000000801',120000,'[10000,10000,10000,10000,10000,10000,10000,10000,10000,10000,10000,10000]'::jsonb,'warn')
ON CONFLICT (id) DO NOTHING;

INSERT INTO exp_document_series (id, tenant_id, created_by, updated_by, doc_type, prefix, fy_code, width, next_no) VALUES
 ('0192a8c0-0031-7000-8000-000000000804','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','claim','EXP','2627',5,1)
ON CONFLICT (id) DO NOTHING;
