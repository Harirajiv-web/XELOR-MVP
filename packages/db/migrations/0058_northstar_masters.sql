-- =============================================================================
-- 0058 — the masters the Northstar PX-400 story hangs on.
--
-- WHAT BELONGS IN HERE AND WHAT DOES NOT.
--
-- The investor demo tells ONE story across seven departments: Northstar Process Systems
-- orders 120 PX-400 precision pump assemblies, and the same order is visible from the sales
-- desk, the stores, the planner's board, the shop floor, the inspection bench, the payroll
-- register and the platform console.
--
-- Every DOCUMENT in that story — the order, the purchase order, the receipt, the works
-- order, the inspection, the maintenance job — is created by
-- `apps/api/scripts/demo/02-seed-northstar-story.mjs`
-- through a real HTTP request, for the reasons that file's header sets out: numbers come
-- from the real series, stock arrives through the one write path, and every write leaves
-- its own audit row. A fixture INSERTed here would prove only that Postgres accepts rows.
--
-- What is here is the reference data those documents REFER to, and only the part of it the
-- API cannot create. There is no endpoint that defines a routing operation, a planning
-- policy, an inspection characteristic, a PM schedule or a budget — those are masters, and
-- the modules that own them expose read and decide surfaces rather than create ones. Items
-- and BOMs do have create endpoints, but they are seeded here alongside the policies and
-- routings that key off their ids, because 0012 established that pattern for the CP-50 and
-- splitting one item master across two mechanisms is how the two drift apart.
--
-- Idempotent throughout (ON CONFLICT DO NOTHING), so a re-run adds nothing.
--
-- ---------------------------------------------------------------------------
-- THE PRODUCT, AND WHY ITS NUMBERS ARE WHAT THEY ARE
-- ---------------------------------------------------------------------------
-- The PX-400 is deliberately a HARDER product than the CP-50 the base demo already carries:
-- stainless 316L rather than cast iron, a machined casing register, a cartridge seal, and a
-- 16-working-day lead time on the bar stock. That last number is the whole point of the
-- planning half of the demo — 120 pumps need roughly 707 kg of 316L bar, the bar takes
-- longer to arrive than the order allows, and MRP has to say so in a way a person can act
-- on. A demo where nothing is short has nothing for a planner to decide.
--
-- Trishul tenant 0192a8c0-0000-7000-8000-000000000001, system actor …0000ff, as every
-- other seed migration in this tree. UUIDs carry the 0058 block so every row this file
-- creates is identifiable at a glance.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The item master.
--
-- Six items: the pump, the two parts Trishul machines itself, and the three it buys. The
-- make/buy split is what gives MRP a multi-level explosion to walk rather than a flat list.
-- ---------------------------------------------------------------------------
INSERT INTO item (id, tenant_id, created_by, updated_by, item_code, name, description, item_type, uom, hsn_code, item_group, is_purchasable, is_manufacturable, is_sellable, standard_cost) VALUES
 ('0192a8c0-0058-7000-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','PMP-PX400','PX-400 Precision Pump Assembly','316L process pump, 400 series, cartridge seal, 42 m head at duty','finished_good','nos','8413','Pumps',false,true,true,41500.00),
 ('0192a8c0-0058-7000-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CMP-PX4-IMP','PX-400 Impeller 316L','Closed impeller, 316L, milled vanes','component','nos','8413','Impellers',false,true,false,6800.00),
 ('0192a8c0-0058-7000-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CMP-PX4-SFT','PX-400 Shaft 32mm 316L','Ground shaft, 316L, 32 mm','component','nos','8483','Shafts',false,true,false,4200.00),
 ('0192a8c0-0058-7000-8000-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CST-PX4-CAS','PX-400 Casing Casting Blank','Investment cast 316L volute blank, PX-400','raw_material','nos','7325','Castings',true,false,false,9600.00),
 ('0192a8c0-0058-7000-8000-000000000005','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','RAW-316L-B40','SS 316L Bright Bar 40mm','Stainless 316L bright bar, 40 mm dia, lot-traced','raw_material','kg','7222','Bar Stock',true,false,false,385.00),
 ('0192a8c0-0058-7000-8000-000000000006','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CMP-PX4-SEAL','PX-400 Cartridge Seal 32mm','Cartridge mechanical seal, SiC/SiC, 32 mm','component','nos','8484','Seals',true,false,false,3150.00)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. The bills of material — three levels, because that is what makes the plan interesting.
--
--   PX-400  →  impeller, shaft, casing blank, 2 seals, 16 bolts
--   impeller →  3.2 kg of 316L bar   (6% scrap: vane milling loses material)
--   shaft    →  2.4 kg of 316L bar   (4% scrap)
--
-- 120 pumps therefore pull 120 × (3.2×1.06 + 2.4×1.04) ≈ 707 kg of bar through two levels
-- of explosion. Nobody can arrive at that number by looking at the order.
-- ---------------------------------------------------------------------------
INSERT INTO bom (id, tenant_id, created_by, updated_by, item_id, version, output_qty, uom, notes) VALUES
 ('0192a8c0-0058-7000-8000-0000000000b1','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-000000000001',1,1,'nos','PX-400 assembly BOM'),
 ('0192a8c0-0058-7000-8000-0000000000b2','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-000000000002',1,1,'nos','PX-400 impeller from 316L bar'),
 ('0192a8c0-0058-7000-8000-0000000000b3','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-000000000003',1,1,'nos','PX-400 shaft from 316L bar')
ON CONFLICT (id) DO NOTHING;

INSERT INTO bom_line (id, tenant_id, created_by, updated_by, bom_id, line_no, component_item_id, qty, uom, scrap_pct) VALUES
 -- PX-400 assembly
 ('0192a8c0-0058-7000-8000-0000000000c1','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-0000000000b1',1,'0192a8c0-0058-7000-8000-000000000002',1,'nos',0),
 ('0192a8c0-0058-7000-8000-0000000000c2','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-0000000000b1',2,'0192a8c0-0058-7000-8000-000000000003',1,'nos',0),
 ('0192a8c0-0058-7000-8000-0000000000c3','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-0000000000b1',3,'0192a8c0-0058-7000-8000-000000000004',1,'nos',2),
 ('0192a8c0-0058-7000-8000-0000000000c4','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-0000000000b1',4,'0192a8c0-0058-7000-8000-000000000006',2,'nos',0),
 ('0192a8c0-0058-7000-8000-0000000000c5','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-0000000000b1',5,'0192a8c0-0012-7000-8000-000000000006',16,'nos',2),
 -- impeller and shaft, both from the same traced bar stock
 ('0192a8c0-0058-7000-8000-0000000000c6','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-0000000000b2',1,'0192a8c0-0058-7000-8000-000000000005',3.2,'kg',6),
 ('0192a8c0-0058-7000-8000-0000000000c7','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-0000000000b3',1,'0192a8c0-0058-7000-8000-000000000005',2.4,'kg',4)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. How each item is replenished.
--
-- `low_level_code` is set to the level the BOM implies, but it is not load-bearing here:
-- the seeder calls POST /planning/policies/recompute-levels, and MRP uses what that
-- computes. Writing them by hand and letting the recompute correct them is deliberate —
-- if the two ever disagree, the recompute is right and this file is the stale one.
--
-- The bar stock is the constraint: MOQ 250 kg, 16 working days. That single row is what
-- turns "120 pumps by 4 September" into an exception a planner has to answer.
-- ---------------------------------------------------------------------------
INSERT INTO item_planning_policy
 (id, tenant_id, created_by, updated_by, item_id, item_code, low_level_code, planning_method, source_type,
  lot_rule, lot_size, lead_time_working_days, safety_stock, service_level, abc_class, uom_precision,
  is_mps_item, demand_time_fence_buckets, planning_time_fence_buckets, planner_ref) VALUES
 ('0192a8c0-0058-7000-8000-0000000000e1','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-000000000001','PMP-PX400',0,'mrp','make','L4L',NULL,8,0,0.95,'A',0,true,1,3,'PPC'),
 ('0192a8c0-0058-7000-8000-0000000000e2','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-000000000002','CMP-PX4-IMP',1,'mrp','make','L4L',NULL,5,8,0.95,'A',0,false,0,0,'PPC'),
 ('0192a8c0-0058-7000-8000-0000000000e3','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-000000000003','CMP-PX4-SFT',1,'mrp','make','L4L',NULL,4,10,0.95,'A',0,false,0,0,'PPC'),
 ('0192a8c0-0058-7000-8000-0000000000e4','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-000000000004','CST-PX4-CAS',1,'mrp','buy','MOQ',30,21,6,0.95,'B',0,false,0,0,'BUY'),
 ('0192a8c0-0058-7000-8000-0000000000e5','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-000000000006','CMP-PX4-SEAL',1,'mrp','buy','MULT',25,14,20,0.95,'B',0,false,0,0,'BUY'),
 ('0192a8c0-0058-7000-8000-0000000000e6','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-000000000005','RAW-316L-B40',2,'mrp','buy','MOQ',250,16,120,0.98,'A',1,false,0,0,'BUY')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Routings — what each operation costs on which machine.
--
-- Operation 10 runs on WC-VMC01, which is already flagged the bottleneck. That is not
-- decoration either: finite scheduling has to contend the PX-400 casing against the CP-50
-- casing on the same machine, and the schedule board is only worth showing if something
-- actually competes for capacity.
-- ---------------------------------------------------------------------------
INSERT INTO plan_routing_operation (id, tenant_id, created_by, updated_by, item_id, item_code, operation_seq, work_centre_id, alternate_work_centre_id, description, setup_hours, run_hours_per_unit) VALUES
 ('0192a8c0-0058-7000-8000-0000000000d1','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-000000000001','PMP-PX400',10,'0192a8c0-0032-7000-8000-000000000015',NULL,'Machine casing faces and register bore',0.750,0.6000),
 ('0192a8c0-0058-7000-8000-0000000000d2','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-000000000001','PMP-PX400',20,'0192a8c0-0032-7000-8000-000000000011',NULL,'Assemble PX-400 and set cartridge seal',0.250,0.9000),
 ('0192a8c0-0058-7000-8000-0000000000d3','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-000000000001','PMP-PX400',30,'0192a8c0-0032-7000-8000-000000000012',NULL,'Hydraulic performance and seal integrity test',0.167,0.5000),
 ('0192a8c0-0058-7000-8000-0000000000d4','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-000000000002','CMP-PX4-IMP',10,'0192a8c0-0032-7000-8000-000000000015',NULL,'Mill impeller vanes, 316L',0.667,0.4200),
 ('0192a8c0-0058-7000-8000-0000000000d5','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-000000000003','CMP-PX4-SFT',10,'0192a8c0-0032-7000-8000-000000000013','0192a8c0-0032-7000-8000-000000000014','Turn and grind shaft to 32 mm',0.500,0.3500)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. What "good" means for a PX-400.
--
-- Four characteristics, and they are not interchangeable. The bore is a MAJOR dimension —
-- out of tolerance and the pump is reworkable. Runout and the leak test are CRITICAL — out
-- of tolerance and the pump is scrap, because a 316L process pump that weeps is a customer
-- incident rather than a quality one. That distinction is what the disposition screen acts
-- on, so it is stored on the characteristic rather than decided at the bench.
-- ---------------------------------------------------------------------------
INSERT INTO qms_characteristic (id, tenant_id, created_by, updated_by, code, name, item_ref, char_type, nominal, usl, lsl, uom, defect_class, effective_from) VALUES
 ('0192a8c0-0058-7000-8000-0000000000f1','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CH-PX4-BORE','Casing register bore','0192a8c0-0058-7000-8000-000000000001','variable',32.000,32.025,32.000,'mm','major','2026-04-01'),
 ('0192a8c0-0058-7000-8000-0000000000f2','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CH-PX4-RUNOUT','Shaft runout at seal face (TIR)','0192a8c0-0058-7000-8000-000000000001','variable',0.000,0.020,0.000,'mm','critical','2026-04-01'),
 ('0192a8c0-0058-7000-8000-0000000000f3','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CH-PX4-HEAD','Total head at duty point','0192a8c0-0058-7000-8000-000000000001','variable',42.0,44.0,40.0,'m','major','2026-04-01'),
 ('0192a8c0-0058-7000-8000-0000000000f4','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CH-PX4-LEAK','Seal integrity, 1.5× hydro (go / no-go)','0192a8c0-0058-7000-8000-000000000001','attribute',NULL,NULL,NULL,NULL,'critical','2026-04-01'),
 -- …and what "good" means for the bar stock it is machined from. An incoming inspection
 -- with no characteristics defined opens onto an empty checklist, which looks like a bug
 -- rather than like a gate — so the traced 316L lot gets its own four.
 ('0192a8c0-0058-7000-8000-0000000000f5','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CH-316L-CR','Chromium content','0192a8c0-0058-7000-8000-000000000005','variable',17.00,18.00,16.00,'%','major','2026-04-01'),
 ('0192a8c0-0058-7000-8000-0000000000f6','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CH-316L-MO','Molybdenum content','0192a8c0-0058-7000-8000-000000000005','variable',2.50,3.00,2.00,'%','major','2026-04-01'),
 ('0192a8c0-0058-7000-8000-0000000000f7','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CH-316L-HRB','Hardness, Rockwell B','0192a8c0-0058-7000-8000-000000000005','variable',82.0,95.0,70.0,'HRB','minor','2026-04-01'),
 ('0192a8c0-0058-7000-8000-0000000000f8','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CH-316L-MTC','EN 10204 3.1 mill certificate present and matching (go / no-go)','0192a8c0-0058-7000-8000-000000000005','attribute',NULL,NULL,NULL,NULL,'critical','2026-04-01')
ON CONFLICT (id) DO NOTHING;

-- The bar stock needs its OWN sampling plan, and the reason is worth a line.
--
-- `AQL-1.0-II` is an ISO 2859-1 style attribute plan whose band table stops at a lot of 500,
-- so opening an inspection on a 750 kg heat is refused outright: `SAMPLING_PLAN_GAP — the
-- plan table must cover every lot size it will be asked about`. That refusal is correct.
-- Extending the table to cover 750 would be the wrong fix, because AQL sampling counts
-- DEFECTIVE UNITS in a lot of discrete articles, and a heat of bar stock is not that — you
-- do not draw 50 samples from a tonne of steel to decide whether the melt is 316L.
--
-- A fixed-n plan is what a metallurgical lab actually does: three specimens from the heat,
-- any non-conformance rejects it. `fixed_n` is already a first-class standard in the
-- schema, so this is using the model as designed rather than bending the AQL table.
INSERT INTO qms_sampling_plan (id, tenant_id, created_by, updated_by, code, name, standard, fixed_n) VALUES
 ('0192a8c0-0058-7000-8000-0000000000c9','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','FIXED-3-HEAT','Three specimens per heat · any non-conformance rejects','fixed_n',3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO qms_inspection_template (id, tenant_id, created_by, updated_by, code, name, inspection_type, item_ref, sampling_plan_id, version_no, status) VALUES
 ('0192a8c0-0058-7000-8000-0000000000f9','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','TMPL-PX400-FINAL','PX-400 · final inspection','final','0192a8c0-0058-7000-8000-000000000001','0192a8c0-0018-7000-8000-000000000001',1,'active'),
 ('0192a8c0-0058-7000-8000-0000000000e9','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','TMPL-316L-IN','SS 316L bar · incoming inspection','incoming','0192a8c0-0058-7000-8000-000000000005','0192a8c0-0058-7000-8000-0000000000c9',1,'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO qms_template_characteristic (id, tenant_id, created_by, updated_by, template_id, characteristic_id, seq, is_mandatory) VALUES
 ('0192a8c0-0058-7000-8000-0000000000fa','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-0000000000f9','0192a8c0-0058-7000-8000-0000000000f1',1,true),
 ('0192a8c0-0058-7000-8000-0000000000fb','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-0000000000f9','0192a8c0-0058-7000-8000-0000000000f2',2,true),
 ('0192a8c0-0058-7000-8000-0000000000fc','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-0000000000f9','0192a8c0-0058-7000-8000-0000000000f3',3,true),
 ('0192a8c0-0058-7000-8000-0000000000fd','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-0000000000f9','0192a8c0-0058-7000-8000-0000000000f4',4,true),
 ('0192a8c0-0058-7000-8000-0000000000ea','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-0000000000e9','0192a8c0-0058-7000-8000-0000000000f5',1,true),
 ('0192a8c0-0058-7000-8000-0000000000eb','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-0000000000e9','0192a8c0-0058-7000-8000-0000000000f6',2,true),
 ('0192a8c0-0058-7000-8000-0000000000ec','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-0000000000e9','0192a8c0-0058-7000-8000-0000000000f7',3,true),
 ('0192a8c0-0058-7000-8000-0000000000ed','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0058-7000-8000-0000000000e9','0192a8c0-0058-7000-8000-0000000000f8',4,true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Furnace 02, and the preventive schedule that will collide with the order.
--
-- The PX-400 shaft and impeller are solution-annealed after machining, and Furnace 02 is
-- where that happens. It is criticality A because there is no second furnace: when it stops,
-- the 316L parts stop, and the pumps stop behind them.
--
-- The PM is quarterly, floating, anchored at 15-Apr — which puts the next occurrence in the
-- middle of the Northstar build. That collision is the demo's maintenance moment: the
-- planner's schedule and the maintenance calendar are looking at the same machine, and
-- neither of them can see the other in a plant that runs on spreadsheets.
-- ---------------------------------------------------------------------------
INSERT INTO maintenance_asset (id, tenant_id, created_by, updated_by, asset_code, name, asset_type, parent_asset_id, path, depth, criticality, criticality_reason, status, make, model, serial_no, manufacture_year, commissioned_on, cost_centre_ref, statutory_class) VALUES
 ('0192a8c0-0058-7000-8300-000000000060','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','AST-PNQ-FUR-02','Vacuum tempering furnace #2','machine','0192a8c0-0027-7000-8300-000000000002','/AST-PNQ/AST-PNQ-MS/AST-PNQ-FUR-02',2,'A','Sole solution-annealing route for 316L parts; no standby furnace.','operational','Thermotech','VTF-600','TT-VTF-600-1188',2022,'2022-11-18','CC-PRD','none')
ON CONFLICT (id) DO NOTHING;

INSERT INTO pm_schedule (id, tenant_id, created_by, updated_by, pms_code, name, asset_id, pm_type, interval_value, interval_unit, anchor_date, drift_policy, generate_on_forecast, lead_days, grace_days, max_open_occurrences, est_duration_min, trade, requires_competent_person, template_version, status, valid_from) VALUES
 ('0192a8c0-0058-7000-8300-000000000061','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','PMS-FUR-02-Q','Furnace 02 — quarterly element and vacuum-seal service','0192a8c0-0058-7000-8300-000000000060','calendar',3,'month','2026-04-15','floating',true,7,5,1,240,'mechanical',false,1,'active','2026-04-01')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. NO BUDGET IS DEFINED HERE, and that is the corrected decision.
--
-- An earlier version of this file added an FY 2026-27 opex budget on cost centre `CC-PRD`
-- so the Northstar travel claim would land against a real budget line. Both halves of that
-- were wrong, and the way they were wrong is worth keeping:
--
--   * The fiscal year is stored as the FOUR-DIGIT code `2627`, not `2026-27`. `fiscalYearOf()`
--     derives it from the claim date, so a budget filed under `2026-27` is invisible to the
--     reservation that goes looking for it — present in the table, absent from every query.
--   * `CC-PRD` is the cost centre on the EMPLOYEE master. The BUDGET master uses
--     `CC-PNQ-PROD`, `CC-PNQ-MNT`, `CC-ADM`, `CC-SLS`, `CC-CBE-PROD`. Two vocabularies for
--     the same idea, and a claim keyed to the wrong one silently finds no budget.
--
-- 0031 already seeds `CC-SLS` with travel, lodging and meals lines under FY 2627, which is
-- exactly what a customer-facing trip should hit. The seeder charges the claim there instead
-- of inventing a parallel budget. The cost-centre vocabulary split is a real inconsistency
-- and is in the gap report; papering over it with a third vocabulary would have hidden it.

-- ---------------------------------------------------------------------------
-- 8. Prove it landed, rather than discovering it on stage.
--
-- Three ways this file can succeed and still leave the demo broken, none of which raises an
-- error on its own: an item lands but its BOM does not, a BOM lands but the routing that
-- schedules it does not, or the inspection template lands with no characteristics attached
-- so the quality screen opens onto an empty checklist.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n_items int; n_bom int; n_lines int; n_policy int; n_route int; n_char int; n_tchar int;
BEGIN
  SELECT count(*) INTO n_items  FROM item WHERE item_code IN ('PMP-PX400','CMP-PX4-IMP','CMP-PX4-SFT','CST-PX4-CAS','RAW-316L-B40','CMP-PX4-SEAL');
  SELECT count(*) INTO n_bom    FROM bom WHERE id::text LIKE '0192a8c0-0058-%';
  SELECT count(*) INTO n_lines  FROM bom_line WHERE id::text LIKE '0192a8c0-0058-%';
  SELECT count(*) INTO n_policy FROM item_planning_policy WHERE id::text LIKE '0192a8c0-0058-%';
  SELECT count(*) INTO n_route  FROM plan_routing_operation WHERE id::text LIKE '0192a8c0-0058-%';
  SELECT count(*) INTO n_char   FROM qms_characteristic WHERE id::text LIKE '0192a8c0-0058-%';
  SELECT count(*) INTO n_tchar  FROM qms_template_characteristic WHERE id::text LIKE '0192a8c0-0058-%';

  IF n_items <> 6 THEN RAISE EXCEPTION 'PX-400 item master incomplete: % of 6', n_items; END IF;
  IF n_bom <> 3 OR n_lines <> 7 THEN RAISE EXCEPTION 'PX-400 BOM incomplete: % bom(s), % line(s) — wanted 3 and 7', n_bom, n_lines; END IF;
  IF n_policy <> 6 THEN RAISE EXCEPTION 'an item has no planning policy: % of 6 — MRP would silently skip it', n_policy; END IF;
  IF n_route <> 5 THEN RAISE EXCEPTION 'routing incomplete: % of 5 operations — the schedule board would be empty', n_route; END IF;
  IF n_char <> 8 OR n_tchar <> 8 THEN RAISE EXCEPTION 'inspection templates have % characteristic(s) attached of % defined', n_tchar, n_char; END IF;

  RAISE NOTICE 'Northstar masters: % items, % BOMs (% lines), % policies, % routings, % characteristics',
    n_items, n_bom, n_lines, n_policy, n_route, n_char;
END $$;
