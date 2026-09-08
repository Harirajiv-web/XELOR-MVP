-- =============================================================================
-- 0045 — the permission catalogue becomes the permission registry.
--
-- GENERATED from packages/platform/src/access/permission-registry.ts. Do not hand-edit:
-- edit the registry and regenerate, or the guard and the catalogue drift apart again.
--
-- WHY THIS EXISTS. Booting the API over HTTP for the first time found that 59 of 87
-- readable endpoints answered 403 to every user in the system, the administrator
-- included. The cause was not a bug in the guard — the guard was right. Three registries
-- had drifted apart, each maintained by hand:
--
--     the @RequirePermission strings the guard enforces .............. 133
--     the permission_catalogue rows the access console can describe ... 21
--     the role_permission grants seeded module by module .............. 79
--
-- 56 permissions were demanded by a route and held by nobody, so those routes were
-- unreachable. Six were granted to roles while no code checked them — access the console
-- showed and the runtime did not honour, which is the more dangerous direction: it reads
-- as a control that exists.
--
-- Migration 0039 already stated the rule — "a permission nobody registered cannot be
-- granted, whatever it is spelt like". It was never enforced. This migration makes it
-- true: the catalogue is complete, a trigger refuses an uncatalogued grant, and the six
-- dead grants are removed. The type system (PermissionKey) and `pnpm perm-check` stop
-- the drift recurring in either direction.
--
-- 133 permissions; 49 privileged.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The catalogue, complete, for BOTH tenants.
--
-- Kaveri had ZERO catalogue rows: the second tenant could not describe its own access at
-- all. A per-tenant catalogue that only one tenant has is not a per-tenant catalogue.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE _perm_registry (permission text, doc_type text, action text, description text, is_privileged boolean) ON COMMIT DROP;
INSERT INTO _perm_registry (permission, doc_type, action, description, is_privileged) VALUES
  ('general.company.read','company','read','Read company, plant and branch masters.',false),
  ('general.company.create','company','create','Create a company, plant or branch.',true),
  ('admin.access.read','role','read','Read roles, grants, scopes and the access simulator.',true),
  ('admin.access.write','role','write','Grant and revoke access, and change what a role may do.',true),
  ('admin.audit.read','audit_log','read','Read the audit trail and verify its hash chain.',true),
  ('admin.audit.export','audit_log','export','Export the Rule 11(g) auditor pack.',true),
  ('admin.incident.write','security_incident','write','Record security incidents and drive the CERT-In / DPDP clocks.',true),
  ('admin.dsr.write','dsr_request','write','Handle data-principal requests (access, correction, erasure).',true),
  ('admin.apikey.write','api_key','write','Issue and revoke machine keys.',true),
  ('admin.settings.write','system_setting','write','Change platform settings, feature flags, licence and backups.',true),
  ('engineering.item.read','item','read','Read the item master.',false),
  ('engineering.item.create','item','create','Create an item.',false),
  ('engineering.bom.read','bom','read','Read bills of material.',false),
  ('engineering.bom.create','bom','create','Create a bill of material.',false),
  ('inventory.stock.read','stock','read','Read stock balances and the stock ledger.',false),
  ('inventory.stock.post','stock_entry','post','Post a stock movement through the single write path.',false),
  ('inventory.warehouse.read','warehouse','read','Read warehouses and storage locations.',false),
  ('purchase.vendor.read','vendor','read','Read the vendor master.',false),
  ('purchase.vendor.create','vendor','create','Create a vendor.',true),
  ('purchase.po.read','purchase_order','read','Read purchase orders.',false),
  ('purchase.po.create','purchase_order','create','Raise a purchase order.',false),
  ('purchase.po.submit','purchase_order','submit','Submit a purchase order into the approval workflow.',false),
  ('purchase.grn.read','goods_receipt','read','Read goods receipts.',false),
  ('purchase.grn.create','goods_receipt','create','Record what physically arrived, posting stock.',false),
  ('production.order.read','production_order','read','Read production orders.',false),
  ('production.order.create','production_order','create','Create a production order.',false),
  ('production.order.execute','production_order','execute','Issue components to, and receive output from, a production order.',false),
  ('quality.inspection.read','inspection','read','Read inspections and their results.',false),
  ('quality.inspection.execute','inspection','execute','Open an inspection and record measured results.',false),
  ('quality.disposition.decide','inspection','decide','Decide the disposition of rejected material (accept, rework, scrap, return).',true),
  ('sales.customer.read','customer','read','Read the customer master.',false),
  ('sales.customer.create','customer','create','Create a customer.',false),
  ('sales.order.read','sales_order','read','Read sales orders.',false),
  ('sales.order.create','sales_order','create','Create a sales order.',false),
  ('sales.order.confirm','sales_order','confirm','Confirm a sales order, passing the credit gate.',true),
  ('sales.dispatch.execute','sales_order','execute','Dispatch against a sales order, reducing stock and raising the invoice.',true),
  ('accounts.ledger.read','voucher','read','Read the general ledger, vouchers and the AR subledger.',true),
  ('accounts.journal.post','journal','post','Post a journal entry to the append-only ledger.',true),
  ('accounts.voucher.reverse','voucher','reverse','Reverse a posted voucher (a new contra entry; nothing is erased).',true),
  ('accounts.receipt.record','receipt','record','Record a customer receipt and allocate it.',true),
  ('planning.policy.read','item_planning_policy','read','Read item planning policies, lot rules and safety stock.',false),
  ('planning.policy.manage','item_planning_policy','manage','Change planning policies and recompute low-level codes.',false),
  ('planning.demand.read','demand','read','Read the demand grid and forecast consumption.',false),
  ('planning.demand.manage','demand','manage','Set and revise the forecast.',false),
  ('planning.mps.read','mps','read','Read the master production schedule.',false),
  ('planning.mps.manage','mps','manage','Set the master production schedule.',false),
  ('planning.mrp.read','mrp_run','read','Read MRP runs, planned orders and pegging.',false),
  ('planning.mrp.run','mrp_run','run','Run material requirements planning.',false),
  ('planning.order.manage','planned_order','manage','Firm and reschedule planned orders.',false),
  ('planning.order.convert','planned_order','convert','Convert a planned order into a real purchase requisition or production order.',true),
  ('planning.exception.action','planning_exception','action','Accept, defer or dismiss planning exceptions.',false),
  ('planning.capacity.read','capacity_load','read','Read the capacity load profile against a plan.',false),
  ('planning.schedule.read','dispatch_schedule','read','Read the shop-floor dispatch schedule.',false),
  ('planning.schedule.manage','dispatch_schedule','manage','Propose a dispatch schedule.',false),
  ('planning.schedule.publish','dispatch_schedule','publish','Publish a dispatch schedule to the shop floor.',true),
  ('hrm.employee.read','employee','read','Read employee records (personal identifiers stay masked).',false),
  ('hrm.employee.write','employee','write','Create and amend employee records.',true),
  ('hrm.employee.pii_reveal','employee','pii_reveal','Reveal a masked personal identifier. Every reveal is logged with a reason.',true),
  ('hrm.roster.write','roster','write','Assign shift rosters.',false),
  ('hrm.attendance.read','attendance','read','Read the attendance muster.',false),
  ('hrm.attendance.ingest','attendance','ingest','Ingest punches from biometric devices or a file.',false),
  ('hrm.attendance.process','attendance','process','Run the deterministic attendance computation for a day.',false),
  ('hrm.attendance.regularise','attendance_regularisation','regularise','Raise a regularisation for a missed or wrong punch.',false),
  ('hrm.attendance.approve','attendance_regularisation','approve','Approve or reject an attendance regularisation.',true),
  ('hrm.attendance.lock','attendance','lock','Lock an attendance period so payroll can rely on it.',true),
  ('hrm.leave.read','leave_balance','read','Read leave balances.',false),
  ('hrm.leave.apply','leave_application','apply','Apply for leave.',false),
  ('hrm.leave.approve','leave_application','approve','Approve or reject a leave application.',false),
  ('hrm.leave.accrue','leave_balance','accrue','Run the leave accrual for a period.',true),
  ('hrm.payroll.read','payroll_run','read','Read payroll runs, payslips and variance.',true),
  ('hrm.payroll.prepare','payroll_run','prepare','Prepare and recompute a payroll run.',true),
  ('hrm.payroll.approve','payroll_run','approve','Approve and release a payroll run.',true),
  ('hrm.payroll.post','payroll_run','post','Post the payroll journal to the ledger.',true),
  ('hrm.statutory.read','statutory_config','read','Read the effective-dated statutory rate configuration.',false),
  ('mnt.asset.read','asset','read','Read the asset register.',false),
  ('mnt.asset.write','asset','write','Create and amend assets.',false),
  ('mnt.meter.write','asset_meter','write','Record a meter reading against an asset.',false),
  ('mnt.request.read','maintenance_request','read','Read the maintenance request queue.',false),
  ('mnt.request.create','maintenance_request','create','Raise a maintenance request.',false),
  ('mnt.request.triage','maintenance_request','triage','Acknowledge and triage maintenance requests.',false),
  ('mnt.mwo.read','maintenance_work_order','read','Read maintenance work orders and the board.',false),
  ('mnt.mwo.write','maintenance_work_order','write','Create, assign and amend maintenance work orders.',false),
  ('mnt.mwo.execute','maintenance_work_order','execute','Start, pause and record work on a maintenance work order.',false),
  ('mnt.mwo.prioritise','maintenance_work_order','prioritise','Change the priority of a maintenance work order.',false),
  ('mnt.mwo.close','maintenance_work_order','close','Close a maintenance work order.',true),
  ('mnt.labour.write','maintenance_labour','write','Book labour time against a maintenance work order.',false),
  ('mnt.spare.read','maintenance_spare','read','Plan and read spares on a work order.',false),
  ('mnt.spare.issue','maintenance_spare','issue','Issue a spare from stores to a work order.',false),
  ('mnt.downtime.read','downtime','read','Read the downtime log.',false),
  ('mnt.downtime.adjust','downtime','adjust','Start, stop and adjust downtime — the clock availability is computed from.',true),
  ('mnt.pm.read','pm_schedule','read','Read preventive maintenance schedules and forecasts.',false),
  ('mnt.pm.write','pm_schedule','write','Define and generate preventive maintenance schedules.',false),
  ('mnt.external.request','maintenance_work_order','request','Send maintenance work to an external contractor.',true),
  ('mnt.report.read','maintenance_report','read','Read maintenance KPIs and Pareto reports.',false),
  ('mnt.statutory.read','maintenance_report','read','Read the statutory equipment register.',false),
  ('csp.ticket.read','ticket','read','Read the service ticket queue.',false),
  ('csp.ticket.create','ticket','create','Open a service ticket.',false),
  ('csp.ticket.update','ticket','update','Work a ticket: transition, assign, reply, resolve.',false),
  ('csp.complaint.create','complaint','create','Raise a formal complaint from a ticket.',false),
  ('csp.complaint.update','complaint','update','Investigate and close a complaint.',false),
  ('csp.contract.update','service_contract','update','Maintain AMC and warranty contracts, and scan renewals.',true),
  ('csp.dashboard.read','service_dashboard','read','Read service dashboards, SLA health and CSAT.',false),
  ('csp.portal_user.manage','portal_user','manage','Invite and disable customer portal users.',true),
  ('expenditure.budget.read','budget','read','Read budgets, consumption and the budget check.',false),
  ('expenditure.budget.manage','budget','manage','Set and revise budgets.',true),
  ('expenditure.claim.read','expense_claim','read','Read expense claims.',false),
  ('expenditure.claim.create','expense_claim','create','Submit an expense claim and its receipts.',false),
  ('expenditure.claim.approve','expense_claim','approve','Approve or reject an expense claim.',true),
  ('expenditure.indirect.create','purchase_expense','create','Record an indirect (non-PO) expense invoice.',false),
  ('expenditure.indirect.approve','purchase_expense','approve','Approve an indirect expense invoice for payment.',true),
  ('expenditure.posting.manage','posting_instruction','manage','Acknowledge and retry posting instructions handed to Accounts.',true),
  ('integration.connector.read','connector','read','Read available connectors and configured connections.',false),
  ('integration.flow.read','integration_flow','read','Read integration flows and their health.',false),
  ('integration.flow.manage','integration_flow','manage','Configure flows, mappings and the connection circuit breaker.',true),
  ('integration.message.read','integration_message','read','Trace a message end to end across systems.',false),
  ('integration.message.send','integration_message','send','Dispatch a message to an external system.',true),
  ('integration.dlq.replay','dead_letter','replay','Triage and replay dead-lettered messages.',true),
  ('integration.statutory.read','statutory_filing','read','Read e-invoice and e-way-bill status and the reporting window watch.',false),
  ('integration.statutory.submit','statutory_filing','submit','Submit an e-invoice or e-way bill to the government portal.',true),
  ('integration.webhook.manage','webhook_subscription','manage','Manage webhook subscriptions and rotate signing secrets.',true),
  ('ai.governance.manage','ai_governance','manage','Operate the shared AI kill switch, release, training opt-out and budget.',true),
  ('aiops.registry.read','ai_registry','read','Read the AI feature registry, providers, models and rollout stages.',false),
  ('aiops.rollout.manage','ai_feature_rollout','manage','Move a feature between rollout stages.',true),
  ('aiops.route.manage','ai_route_policy','manage','Define and activate routing chains.',true),
  ('aiops.prompt.read','ai_prompt_version','read','Read prompt versions and diffs.',false),
  ('aiops.prompt.author','ai_prompt_version','author','Author a new prompt version.',false),
  ('aiops.prompt.approve','ai_prompt_version','approve','Promote a prompt to production, or roll one back. Never the author''s own.',true),
  ('aiops.eval.run','ai_eval_run','run','Record an evaluation run against a golden set.',false),
  ('aiops.guardrail.run','ai_guardrail_event','run','Run the pre-call and post-call guardrails.',false),
  ('aiops.hitl.review','ai_hitl_item','review','Review the human-in-the-loop queue and accept or reject drafts.',true),
  ('aiops.cost.read','ai_call_metric','read','Read AI cost, metering and budget status.',false),
  ('aiops.killswitch.operate','ai_kill_switch','operate','Engage, release and probe the AI kill switch.',true),
  ('aiops.audit.read','ai_action_log','read','Explain a single AI call and export the AI evidence pack.',true);

INSERT INTO permission_catalogue (id, tenant_id, created_by, updated_by, permission, doc_type, action, description, is_privileged)
SELECT gen_random_uuid(), t.tenant_id, '0192a8c0-0000-7000-8000-0000000000ff', '0192a8c0-0000-7000-8000-0000000000ff', r.permission, r.doc_type, r.action, r.description, r.is_privileged
FROM _perm_registry r
CROSS JOIN (VALUES ('0192a8c0-0000-7000-8000-000000000001'::uuid), ('0192a8c0-0000-7000-8000-000000000002'::uuid)) AS t(tenant_id)
ON CONFLICT (tenant_id, permission) DO UPDATE
  SET doc_type = EXCLUDED.doc_type,
      action = EXCLUDED.action,
      description = EXCLUDED.description,
      is_privileged = EXCLUDED.is_privileged,
      updated_at = now(),
      updated_by = EXCLUDED.updated_by;

-- Catalogue rows that predate the registry and no route demands. A permission the runtime
-- never checks is not access control; leaving it listed invites somebody to grant it and
-- believe something was conferred.
DELETE FROM permission_catalogue c
WHERE NOT EXISTS (SELECT 1 FROM _perm_registry r WHERE r.permission = c.permission);

-- ---------------------------------------------------------------------------
-- 2. The same clean-up on the grants, then the administrator holds the whole registry.
-- ---------------------------------------------------------------------------

DELETE FROM role_permission p
WHERE NOT EXISTS (SELECT 1 FROM _perm_registry r WHERE r.permission = p.permission);

INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT gen_random_uuid(), ro.tenant_id, '0192a8c0-0000-7000-8000-0000000000ff', '0192a8c0-0000-7000-8000-0000000000ff', ro.id, r.permission
FROM role ro
CROSS JOIN _perm_registry r
WHERE ro.code = 'admin'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. The rule, enforced.
--
-- A trigger rather than a foreign key: role_permission is tenant-scoped under FORCE RLS
-- and the catalogue is keyed (tenant_id, permission), so the check must name the tenant
-- explicitly. Refusing the write is the whole point — a grant that resolves to nothing is
-- worse than a refused one, because it is invisible until someone is denied a screen they
-- were told they had.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION role_permission_must_be_catalogued() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM permission_catalogue c
    WHERE c.tenant_id = NEW.tenant_id AND c.permission = NEW.permission
  ) THEN
    RAISE EXCEPTION 'permission % is not in this tenant''s permission catalogue — register it before granting it', NEW.permission
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_role_permission_catalogued ON role_permission;
CREATE TRIGGER trg_role_permission_catalogued
  BEFORE INSERT OR UPDATE ON role_permission
  FOR EACH ROW EXECUTE FUNCTION role_permission_must_be_catalogued();

COMMENT ON FUNCTION role_permission_must_be_catalogued() IS
  'A permission nobody registered cannot be granted (migration 0039''s stated rule, now enforced).';

COMMENT ON TABLE permission_catalogue IS
  'Generated from packages/platform/src/access/permission-registry.ts by migration 0045. The guard enforces exactly this list; pnpm perm-check fails CI if they diverge.';
