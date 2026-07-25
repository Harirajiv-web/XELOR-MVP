-- =============================================================================
-- 0019_seed_quality — the §7 demo universe for Inspection.
--
-- Trishul inspects its CP-50 centrifugal pump on a FINAL inspection template with three
-- characteristics that mirror what a real pump shop measures: a bore diameter (variable,
-- CRITICAL), a shaft runout (variable, major) and a pressure-leak test (attribute, critical).
-- Sampling is an ISO 2859-1-style General Level II / AQL 1.0 table loaded as CONFIGURATION,
-- so an OEM auditor's "what standard do you apply?" has a defensible answer.
-- =============================================================================

-- ---- sampling plan: General Inspection Level II, AQL 1.0 (trimmed band table) ----
INSERT INTO qms_sampling_plan
  (id, tenant_id, created_by, updated_by, code, name, standard, inspection_level, aql, plan_table) VALUES
 ('0192a8c0-0018-7000-8000-000000000001','0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'AQL-1.0-II','ISO 2859-1 style · General Level II · AQL 1.0','iso_2859_1_style','II',1.0,
  '[{"lotFrom":2,"lotTo":8,"codeLetter":"A","n":2,"ac":0,"re":1},
    {"lotFrom":9,"lotTo":15,"codeLetter":"B","n":3,"ac":0,"re":1},
    {"lotFrom":16,"lotTo":25,"codeLetter":"C","n":5,"ac":0,"re":1},
    {"lotFrom":26,"lotTo":50,"codeLetter":"D","n":8,"ac":0,"re":1},
    {"lotFrom":51,"lotTo":90,"codeLetter":"E","n":13,"ac":0,"re":1},
    {"lotFrom":91,"lotTo":150,"codeLetter":"F","n":20,"ac":1,"re":2},
    {"lotFrom":151,"lotTo":280,"codeLetter":"G","n":32,"ac":1,"re":2},
    {"lotFrom":281,"lotTo":500,"codeLetter":"H","n":50,"ac":2,"re":3}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ---- characteristics (effective-dated specs for the CP-50 pump) ----
INSERT INTO qms_characteristic
  (id, tenant_id, created_by, updated_by, code, name, item_ref, char_type,
   nominal, usl, lsl, uom, defect_class, effective_from) VALUES
 ('0192a8c0-0018-7000-8000-000000000011','0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'CH-BORE-50','Impeller bore diameter','0192a8c0-0012-7000-8000-000000000001','variable',
  50.000000, 50.050000, 49.950000, 'mm', 'critical', DATE '2026-04-01'),
 ('0192a8c0-0018-7000-8000-000000000012','0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'CH-RUNOUT','Shaft runout (TIR)','0192a8c0-0012-7000-8000-000000000001','variable',
  0.000000, 0.050000, NULL, 'mm', 'major', DATE '2026-04-01'),
 ('0192a8c0-0018-7000-8000-000000000013','0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'CH-LEAK','Pressure leak test (go / no-go)','0192a8c0-0012-7000-8000-000000000001','attribute',
  NULL, NULL, NULL, NULL, 'critical', DATE '2026-04-01')
ON CONFLICT (id) DO NOTHING;

-- ---- the FINAL inspection template for the pump (active) ----
INSERT INTO qms_inspection_template
  (id, tenant_id, created_by, updated_by, code, name, inspection_type, item_ref,
   sampling_plan_id, version_no, status) VALUES
 ('0192a8c0-0018-7000-8000-000000000021','0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'TMPL-CP50-FINAL','CP-50 pump · final inspection','final',
  '0192a8c0-0012-7000-8000-000000000001','0192a8c0-0018-7000-8000-000000000001',1,'active')
ON CONFLICT (id) DO NOTHING;

-- ---- and an INCOMING template for the bought-in pump casing, so a supplier lot can be
-- ---- inspected on arrival and quarantined when it fails.
INSERT INTO qms_characteristic
  (id, tenant_id, created_by, updated_by, code, name, item_ref, char_type,
   nominal, usl, lsl, uom, defect_class, effective_from) VALUES
 ('0192a8c0-0018-7000-8000-000000000014','0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'CH-CAST-OD','Casing outer diameter','0192a8c0-0012-7000-8000-000000000002','variable',
  120.000000, 120.500000, 119.500000, 'mm', 'critical', DATE '2026-04-01')
ON CONFLICT (id) DO NOTHING;

INSERT INTO qms_inspection_template
  (id, tenant_id, created_by, updated_by, code, name, inspection_type, item_ref,
   sampling_plan_id, version_no, status) VALUES
 ('0192a8c0-0018-7000-8000-000000000022','0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'TMPL-CASING-IN','Pump casing · incoming inspection','incoming',
  '0192a8c0-0012-7000-8000-000000000002','0192a8c0-0018-7000-8000-000000000001',1,'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO qms_template_characteristic
  (id, tenant_id, created_by, updated_by, template_id, characteristic_id, seq, is_mandatory) VALUES
 ('0192a8c0-0018-7000-8000-000000000034','0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0018-7000-8000-000000000022','0192a8c0-0018-7000-8000-000000000014',1,true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO qms_template_characteristic
  (id, tenant_id, created_by, updated_by, template_id, characteristic_id, seq, is_mandatory) VALUES
 ('0192a8c0-0018-7000-8000-000000000031','0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0018-7000-8000-000000000021','0192a8c0-0018-7000-8000-000000000011',1,true),
 ('0192a8c0-0018-7000-8000-000000000032','0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0018-7000-8000-000000000021','0192a8c0-0018-7000-8000-000000000012',2,true),
 ('0192a8c0-0018-7000-8000-000000000033','0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0018-7000-8000-000000000021','0192a8c0-0018-7000-8000-000000000013',3,true)
ON CONFLICT (id) DO NOTHING;
