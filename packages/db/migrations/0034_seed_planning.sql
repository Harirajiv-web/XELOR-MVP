-- =============================================================================
-- 0034_seed_planning — PLANNING demo data, reconciled to DECISIONS-V2 §7.
--
-- PLANNING §20 was written against its own demo universe (Kaveri Pumps, Coimbatore, demo
-- "today" = Mon 13-Jul-2026 = W29). DECISIONS-V2 §7 is binding and wins on conflict: the
-- primary tenant is Trishul Precision Components and demo "today" is Mon 20-Jul-2026,
-- which is ISO week 2026-W30.
--
-- The reconciliation is a pure one-week SHIFT. Every quantity in the blueprint's
-- hand-verified worked example (§20.5) is preserved exactly; every bucket label moves up by
-- one. The past-due beat survives, which is the point of checking it — the casting release
-- lands in W29, the week before today.
--
--   blueprint  W28  W29  W30  W31  W32  W33  W34
--   here       W29  W30  W31  W32  W33  W34  W35
--
-- The item codes are the §7 universe's, not the blueprint's:
--   PUMP-KV50      → PMP-CP50    (level 0, MPS item)
--   IMPELLER-KV50  → CMP-IMP6    (level 1)
--   CI-CASTING-IMP → CST-IMP6    (level 2, MOQ 50, 2-week lead time)
--
-- This migration also DEEPENS the shared demo universe from two BOM levels to three. Those
-- item and BOM rows belong to ENGINEERING and remain its system of record; they are seeded
-- here because this is the module that first needs a product structure deeper than one
-- level, and a two-level BOM cannot demonstrate the thing MRP exists to do.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ENGINEERING rows: the third BOM level.
-- ---------------------------------------------------------------------------

INSERT INTO item (id, tenant_id, created_by, updated_by, item_code, name, description, item_type, uom, hsn_code, item_group, is_purchasable, is_manufacturable, is_sellable, standard_cost) VALUES
 ('0192a8c0-0012-7000-8000-000000000007','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CST-IMP6','Impeller Casting Blank 6in','Rough SS casting for CMP-IMP6; 5% loss at machining','raw_material','nos','7325','Castings',true,false,false,780.00),
 ('0192a8c0-0012-7000-8000-000000000008','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CST-CAS50','Casing Casting Blank CP-50','Rough CI volute casting for CMP-CAS50; 3% loss at machining','raw_material','nos','7325','Castings',true,false,false,1450.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO bom (id, tenant_id, created_by, updated_by, item_id, version, output_qty, uom, notes) VALUES
 ('0192a8c0-0012-7000-8000-0000000000b2','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000003',1,1,'nos','Impeller machining BOM — one casting blank in, one impeller out'),
 ('0192a8c0-0012-7000-8000-0000000000b3','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000002',1,1,'nos','Casing machining BOM')
ON CONFLICT (id) DO NOTHING;

INSERT INTO bom_line (id, tenant_id, created_by, updated_by, bom_id, line_no, component_item_id, qty, uom, scrap_pct) VALUES
 ('0192a8c0-0012-7000-8000-0000000000c6','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-0000000000b2',1,'0192a8c0-0012-7000-8000-000000000007',1,'nos',5),
 ('0192a8c0-0012-7000-8000-0000000000c7','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-0000000000b3',1,'0192a8c0-0012-7000-8000-000000000008',1,'nos',3)
ON CONFLICT (id) DO NOTHING;

-- The blueprint's scrap percentages on the top-level assembly. The original seed carried 0,
-- which makes the gross-up step invisible — and the gross-up is where MRP stops being
-- arithmetic anybody could do in a spreadsheet.
UPDATE bom_line SET scrap_pct = 1, updated_at = now() WHERE id = '0192a8c0-0012-7000-8000-0000000000c1'; -- casing, 1%
UPDATE bom_line SET scrap_pct = 2, updated_at = now() WHERE id = '0192a8c0-0012-7000-8000-0000000000c2'; -- impeller, 2%

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------

INSERT INTO plan_calendar (id, tenant_id, created_by, updated_by, code, name, working_days, is_default) VALUES
 ('0192a8c0-0032-7000-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CAL-STD','Standard plant calendar (Mon–Sat)','[1,2,3,4,5,6]'::jsonb,true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO plan_holiday (id, tenant_id, created_by, updated_by, calendar_id, holiday_date, name) VALUES
 ('0192a8c0-0032-7000-8000-0000000000a1','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0032-7000-8000-000000000001','2026-08-15','Independence Day'),
 ('0192a8c0-0032-7000-8000-0000000000a2','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0032-7000-8000-000000000001','2026-10-02','Gandhi Jayanti')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Work centres and shifts
--
-- WC-VMC01 runs two 8-hour shifts Mon–Sat: 96 nominal hours, × 0.85 utilisation × 0.90
-- efficiency = 73.44 available hours a week. That is the blueprint's §20.7 baseline, and it
-- is 22.5 hours a week less than the 96 an optimistic plant would plan against.
-- ---------------------------------------------------------------------------

INSERT INTO plan_work_centre (id, tenant_id, created_by, updated_by, code, name, calendar_id, machine_count, utilisation_pct, efficiency_pct, is_bottleneck, cost_centre_ref) VALUES
 ('0192a8c0-0032-7000-8000-000000000011','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','WC-ASSY','Pump assembly bench','0192a8c0-0032-7000-8000-000000000001',2,0.85,0.90,false,'CC-PRD'),
 ('0192a8c0-0032-7000-8000-000000000012','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','WC-TEST','Pump test rig','0192a8c0-0032-7000-8000-000000000001',1,0.80,0.95,false,'CC-PRD'),
 ('0192a8c0-0032-7000-8000-000000000013','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','WC-LTH01','CNC lathe 1','0192a8c0-0032-7000-8000-000000000001',1,0.85,0.90,false,'CC-PRD'),
 ('0192a8c0-0032-7000-8000-000000000014','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','WC-LTH02','CNC lathe 2 (alternate)','0192a8c0-0032-7000-8000-000000000001',1,0.85,0.90,false,'CC-PRD'),
 ('0192a8c0-0032-7000-8000-000000000015','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','WC-VMC01','Vertical machining centre','0192a8c0-0032-7000-8000-000000000001',1,0.85,0.90,true,'CC-PRD')
ON CONFLICT (id) DO NOTHING;

INSERT INTO plan_shift (id, tenant_id, created_by, updated_by, work_centre_id, name, hours, days) VALUES
 ('0192a8c0-0032-7000-8000-0000000000b1','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0032-7000-8000-000000000011','A',8,'[1,2,3,4,5,6]'::jsonb),
 ('0192a8c0-0032-7000-8000-0000000000b2','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0032-7000-8000-000000000012','A',8,'[1,2,3,4,5,6]'::jsonb),
 ('0192a8c0-0032-7000-8000-0000000000b3','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0032-7000-8000-000000000013','A',8,'[1,2,3,4,5,6]'::jsonb),
 ('0192a8c0-0032-7000-8000-0000000000b4','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0032-7000-8000-000000000014','A',8,'[1,2,3,4,5,6]'::jsonb),
 ('0192a8c0-0032-7000-8000-0000000000b5','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0032-7000-8000-000000000015','A',8,'[1,2,3,4,5,6]'::jsonb),
 ('0192a8c0-0032-7000-8000-0000000000b6','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0032-7000-8000-000000000015','B',8,'[1,2,3,4,5,6]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- The §20.7 preventive-maintenance block: 4 hours on the bottleneck, which costs
-- 4 × 0.85 × 0.90 = 3.06 EFFECTIVE hours, not 4.
INSERT INTO plan_wc_downtime (id, tenant_id, created_by, updated_by, work_centre_id, bucket, hours, reason) VALUES
 ('0192a8c0-0032-7000-8000-0000000000c1','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0032-7000-8000-000000000015','2026-W31',4,'Quarterly preventive maintenance — spindle and ballscrew')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Routings (PLANNING §20.3, minutes converted to hours)
-- ---------------------------------------------------------------------------

INSERT INTO plan_routing_operation (id, tenant_id, created_by, updated_by, item_id, item_code, operation_seq, work_centre_id, alternate_work_centre_id, description, setup_hours, run_hours_per_unit) VALUES
 ('0192a8c0-0032-7000-8000-0000000000d1','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000001','PMP-CP50',10,'0192a8c0-0032-7000-8000-000000000011',NULL,'Assemble pump',0.250,0.7500),
 ('0192a8c0-0032-7000-8000-0000000000d2','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000001','PMP-CP50',20,'0192a8c0-0032-7000-8000-000000000012',NULL,'Performance test and seal check',0.167,0.3333),
 ('0192a8c0-0032-7000-8000-0000000000d3','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000003','CMP-IMP6',10,'0192a8c0-0032-7000-8000-000000000013','0192a8c0-0032-7000-8000-000000000014','Turn impeller hub and bore',0.500,0.3000),
 ('0192a8c0-0032-7000-8000-0000000000d4','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000003','CMP-IMP6',20,'0192a8c0-0032-7000-8000-000000000015',NULL,'Mill vanes',0.667,0.3667),
 ('0192a8c0-0032-7000-8000-0000000000d5','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000002','CMP-CAS50',10,'0192a8c0-0032-7000-8000-000000000015',NULL,'Mill casing faces and bore',0.750,0.5833)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Planning policy — how each item is replenished.
--
-- The three that carry the golden case are PMP-CP50, CMP-IMP6 and CST-IMP6; their lot
-- rules, lead times and safety stocks are the blueprint's §20.3 figures verbatim. Lead
-- times are in WORKING days: "1 wk" is 6 on a Mon–Sat calendar, "2 wk" is 12, "3 wk" is 18.
-- ---------------------------------------------------------------------------

INSERT INTO item_planning_policy
 (id, tenant_id, created_by, updated_by, item_id, item_code, low_level_code, planning_method, source_type,
  lot_rule, lot_size, lead_time_working_days, safety_stock, service_level, abc_class, uom_precision,
  annual_demand, order_cost, holding_cost, reorder_point, max_level, is_mps_item,
  demand_time_fence_buckets, planning_time_fence_buckets, planner_ref) VALUES
 ('0192a8c0-0032-7000-8000-0000000000e1','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000001','PMP-CP50',0,'mrp','make','L4L',NULL,6,0,0.95,'A',0,NULL,NULL,NULL,NULL,NULL,true,1,3,'PPC'),
 ('0192a8c0-0032-7000-8000-0000000000e2','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000003','CMP-IMP6',1,'mrp','make','L4L',NULL,6,10,0.95,'A',0,NULL,NULL,NULL,NULL,NULL,false,0,0,'PPC'),
 ('0192a8c0-0032-7000-8000-0000000000e3','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000002','CMP-CAS50',1,'mrp','make','L4L',NULL,6,8,0.95,'A',0,NULL,NULL,NULL,NULL,NULL,false,0,0,'PPC'),
 ('0192a8c0-0032-7000-8000-0000000000e4','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000007','CST-IMP6',2,'mrp','buy','MOQ',50,12,15,0.95,'B',0,NULL,NULL,NULL,NULL,NULL,false,0,0,'BUY'),
 ('0192a8c0-0032-7000-8000-0000000000e5','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000008','CST-CAS50',2,'mrp','buy','MOQ',30,18,12,0.95,'B',0,NULL,NULL,NULL,NULL,NULL,false,0,0,'BUY'),
 ('0192a8c0-0032-7000-8000-0000000000e6','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000004','CMP-SFT20',1,'mrp','buy','MULT',25,6,20,0.90,'C',0,NULL,NULL,NULL,NULL,NULL,false,0,0,'BUY'),
 -- EOQ inputs are stored beside the rule that consumes them, so a planner can see why the
 -- number is 200 rather than being told to trust it: √(2·1560·400/31) = 200.5.
 ('0192a8c0-0032-7000-8000-0000000000e7','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000005','CMP-SEAL20',1,'mrp','buy','EOQ',NULL,12,48,0.98,'B',0,1560,400,31,NULL,NULL,false,0,0,'BUY'),
 -- A C-class fastener is not worth an MRP explosion. It gets a reorder point instead — and
 -- BECAUSE it does, planning_method must not be 'mrp'; the database refuses that pair.
 ('0192a8c0-0032-7000-8000-0000000000e8','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000006','RAW-BLT-M8',1,'reorder_point','buy','MULT',100,6,200,0.90,'C',0,NULL,NULL,NULL,800,2000,false,0,0,'BUY')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Demand: the forecast, and the spares demand that is neither forecast nor sales order.
-- PLANNING §20.4 — 20 pumps a week, flat, across the planning horizon.
-- ---------------------------------------------------------------------------

INSERT INTO plan_forecast (id, tenant_id, created_by, updated_by, item_id, item_code, bucket, qty, source, note) VALUES
 ('0192a8c0-0032-7000-8000-0000000000f1','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000001','PMP-CP50','2026-W31',20,'manual','Flat run-rate; monsoon season pull-forward not yet applied'),
 ('0192a8c0-0032-7000-8000-0000000000f2','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000001','PMP-CP50','2026-W32',20,'manual',NULL),
 ('0192a8c0-0032-7000-8000-0000000000f3','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000001','PMP-CP50','2026-W33',20,'manual',NULL),
 ('0192a8c0-0032-7000-8000-0000000000f4','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000001','PMP-CP50','2026-W34',20,'manual',NULL),
 ('0192a8c0-0032-7000-8000-0000000000f5','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000001','PMP-CP50','2026-W35',20,'manual',NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO plan_demand_line (id, tenant_id, created_by, updated_by, item_id, item_code, bucket, qty, demand_kind, ref) VALUES
 ('0192a8c0-0032-7000-8000-000000000101','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000005','CMP-SEAL20','2026-W32',15,'spares','SPARE-2627-0031')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- The MPS grid (PLANNING §20.4, shifted one week).
--
-- The ATP row is what the sales desk quotes from, and it is NOT the projected on-hand:
-- both are zero in W33, but for opposite reasons — stock will be zero, and everything
-- arriving is already sold.
-- ---------------------------------------------------------------------------

INSERT INTO mps_row (id, tenant_id, created_by, updated_by, item_id, item_code, bucket, mps_receipt_qty, forecast_qty, order_qty, demand_qty, projected_on_hand, atp, fence) VALUES
 ('0192a8c0-0032-7000-8000-000000000111','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000001','PMP-CP50','2026-W31',16,20,24,24,0,0,'frozen'),
 ('0192a8c0-0032-7000-8000-000000000112','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000001','PMP-CP50','2026-W32',20,20,18,20,0,2,'firm'),
 ('0192a8c0-0032-7000-8000-000000000113','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000001','PMP-CP50','2026-W33',25,20,25,25,0,0,'firm'),
 ('0192a8c0-0032-7000-8000-000000000114','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000001','PMP-CP50','2026-W34',20,20,10,20,0,10,'free'),
 ('0192a8c0-0032-7000-8000-000000000115','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0012-7000-8000-000000000001','PMP-CP50','2026-W35',20,20,0,20,0,20,'free')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Document numbering, FY 2026-27.
-- ---------------------------------------------------------------------------

INSERT INTO plan_number_series (id, tenant_id, created_by, updated_by, series_key, fiscal_year, prefix, next_number, width) VALUES
 ('0192a8c0-0032-7000-8000-000000000121','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','mrp_run','2627','MRP-2627-',1,5),
 ('0192a8c0-0032-7000-8000-000000000122','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','schedule','2627','SCH-2627-',1,5),
 ('0192a8c0-0032-7000-8000-000000000123','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','requisition','2627','PR-2627-',1,5)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Kaveri ElectroFab — the RLS leak-probe counterpart. Deliberately minimal: enough rows
-- that a cross-tenant query has something to WRONGLY return if the fence ever fails.
-- ---------------------------------------------------------------------------

INSERT INTO plan_calendar (id, tenant_id, created_by, updated_by, code, name, working_days, is_default) VALUES
 ('0192a8c0-0032-7000-8000-000000000201','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','CAL-STD','Kaveri plant calendar','[1,2,3,4,5]'::jsonb,true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO plan_work_centre (id, tenant_id, created_by, updated_by, code, name, calendar_id, machine_count, utilisation_pct, efficiency_pct, is_bottleneck, cost_centre_ref) VALUES
 ('0192a8c0-0032-7000-8000-000000000202','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','WC-PRESS','Kaveri press shop','0192a8c0-0032-7000-8000-000000000201',3,0.80,0.85,true,'KV-CC-01')
ON CONFLICT (id) DO NOTHING;

INSERT INTO item_planning_policy
 (id, tenant_id, created_by, updated_by, item_id, item_code, low_level_code, planning_method, source_type,
  lot_rule, lot_size, lead_time_working_days, safety_stock, abc_class, uom_precision, is_mps_item,
  demand_time_fence_buckets, planning_time_fence_buckets) VALUES
 ('0192a8c0-0032-7000-8000-000000000203','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0032-7000-8000-0000000002ff','KV-ENCL-4U',0,'mrp','make','L4L',NULL,10,5,'A',0,true,1,2)
ON CONFLICT (id) DO NOTHING;
