-- =============================================================================
-- 0012_seed_engineering — demo items + one BOM for Trishul (§7 canonical universe).
-- A centrifugal pump (finished good) and its components, plus the pump's BOM. Runs as
-- the superuser owner (bypasses RLS), so explicit tenant_id is honoured. Idempotent.
-- =============================================================================

-- Trishul tenant + system actor
-- tenant 0192a8c0-0000-7000-8000-000000000001 · actor 0192a8c0-0000-7000-8000-0000000000ff

INSERT INTO item (id, tenant_id, created_by, updated_by, item_code, name, description, item_type, uom, hsn_code, item_group, is_purchasable, is_manufacturable, is_sellable, standard_cost) VALUES
 ('0192a8c0-0012-7000-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','PMP-CP50','Centrifugal Pump CP-50','End-suction centrifugal pump, 50mm','finished_good','nos','8413','Pumps',false,true,true,8500.00),
 ('0192a8c0-0012-7000-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CMP-CAS50','Cast Iron Casing CP-50','Volute casing for CP-50','component','nos','8413','Castings',true,false,false,1800.00),
 ('0192a8c0-0012-7000-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CMP-IMP6','SS Impeller 6in','Stainless impeller, 6 inch','component','nos','8413','Impellers',true,false,false,1250.00),
 ('0192a8c0-0012-7000-8000-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CMP-SFT20','Pump Shaft 20mm','EN8 shaft, 20mm','component','nos','8483','Shafts',true,false,false,950.00),
 ('0192a8c0-0012-7000-8000-000000000005','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CMP-SEAL20','Mechanical Seal 20mm','Carbon-ceramic seal, 20mm','component','nos','8484','Seals',true,false,false,420.00),
 ('0192a8c0-0012-7000-8000-000000000006','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','RAW-BLT-M8','M8 Hex Bolt SS304','Hex bolt M8x25, SS304','raw_material','nos','7318','Fasteners',true,false,false,4.50)
ON CONFLICT (id) DO NOTHING;

-- BOM for the pump (version 1): what one CP-50 is made of.
INSERT INTO bom (id, tenant_id, created_by, updated_by, item_id, version, output_qty, uom, notes) VALUES
 ('0192a8c0-0012-7000-8000-0000000000b1','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000001',1,1,'nos','CP-50 assembly BOM')
ON CONFLICT (id) DO NOTHING;

INSERT INTO bom_line (id, tenant_id, created_by, updated_by, bom_id, line_no, component_item_id, qty, uom, scrap_pct) VALUES
 ('0192a8c0-0012-7000-8000-0000000000c1','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-0000000000b1',1,'0192a8c0-0012-7000-8000-000000000002',1,'nos',0),
 ('0192a8c0-0012-7000-8000-0000000000c2','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-0000000000b1',2,'0192a8c0-0012-7000-8000-000000000003',1,'nos',0),
 ('0192a8c0-0012-7000-8000-0000000000c3','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-0000000000b1',3,'0192a8c0-0012-7000-8000-000000000004',1,'nos',0),
 ('0192a8c0-0012-7000-8000-0000000000c4','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-0000000000b1',4,'0192a8c0-0012-7000-8000-000000000005',1,'nos',0),
 ('0192a8c0-0012-7000-8000-0000000000c5','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-0000000000b1',5,'0192a8c0-0012-7000-8000-000000000006',8,'nos',2)
ON CONFLICT (id) DO NOTHING;
