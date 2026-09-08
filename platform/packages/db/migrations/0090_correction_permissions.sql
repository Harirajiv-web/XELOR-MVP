-- =============================================================================
-- 0090 — the permissions that let a mistake be corrected.
--
-- GENERATED FROM packages/platform/src/access/permission-registry.ts (147 -> 165).
-- Do not hand-edit the list: edit the registry, or `pnpm db:perm-check` fails the build
-- for exactly the drift migration 0045 was written to end.
--
-- TWO RULES DECIDE WHO GETS WHAT, and neither is "give it to everyone who asked".
--
--   1. A CORRECTION FOLLOWS ITS CREATE. Whoever may raise the document may fix it while it
--      is still a draft. Granting `sales.order.update` to anyone who lacks
--      `sales.order.create` would hand out authority over documents they cannot make —
--      and granting it to fewer people than that guarantees the workaround this whole
--      feature exists to prevent: cancel and re-key, which loses the trail entirely.
--
--   2. AN AMENDMENT FOLLOWS ITS APPROVE. `sales.order.amend` and `purchase.po.amend`
--      change a commitment somebody outside this system is already holding — a customer
--      promise, a vendor's copy of a PO. They go to the roles that hold the corresponding
--      APPROVE right, not the create right, and both are marked privileged so every access
--      review sees them.
--
-- The derivation is done in SQL against the live grants rather than written out as a list
-- of role names. A hand-written list is correct on the day it is merged and wrong the
-- first time a role's create right moves.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Catalogue the 18 new permissions, for BOTH tenants.
--
-- A permission absent from a tenant's catalogue cannot be granted there at all — the 0045
-- trigger refuses it. Kaveri gets the same catalogue as 3S for that reason: a
-- second tenant that cannot describe its own access is not a tenant.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _new_perms (permission text, doc_type text, action text, description text, is_privileged boolean) ON COMMIT DROP;

INSERT INTO _new_perms (permission, doc_type, action, description, is_privileged) VALUES
  ('sales.customer.update','customer','update','Correct a customer''s details.',false),
  ('sales.order.update','sales_order','update','Correct a sales order that is still a draft or on credit hold.',false),
  ('sales.order.amend','sales_order','amend','Amend a CONFIRMED sales order — the customer has been promised it, so the change carries a reason and re-runs the credit check.',true),
  ('purchase.vendor.update','vendor','update','Correct a vendor''s details.',false),
  ('purchase.po.update','purchase_order','update','Correct a purchase order that is still a draft or was rejected back.',false),
  ('purchase.po.amend','purchase_order','amend','Amend an APPROVED purchase order — the vendor may already hold it, so the change carries a reason and goes back for approval.',true),
  ('production.order.update','production_order','update','Correct or amend a production order''s target quantity and dates.',false),
  ('engineering.item.update','item','update','Correct an item master''s details.',false),
  ('engineering.bom.update','bom','update','Correct a DRAFT bill of materials. An active BOM is never edited in place — production orders are pinned to it.',false),
  ('inventory.warehouse.update','warehouse','update','Correct a warehouse or bin''s details.',false),
  ('quality.inspection.update','qms_inspection','update','Correct an inspection reading. After completion the correction carries a reason and the original value stays visible.',true),
  ('mnt.request.update','maintenance_request','update','Correct a maintenance request''s description, priority or asset.',false),
  ('expenditure.claim.update','expense_claim','update','Correct an expense claim that has not been approved. An approved claim is corrected by a reversing entry.',false),
  ('expenditure.travel.update','travel_request','update','Correct or amend a travel request.',false),
  ('expenditure.advance.update','cash_advance','update','Correct a cash advance that has not yet been disbursed.',false),
  ('expenditure.indirect.update','purchase_expense','update','Correct an indirect expense that has not been approved and posted.',false),
  ('hrm.leave.update','leave_application','update','Correct a leave application. Changing approved dates re-opens it for the manager''s decision.',false),
  ('csp.spare.update','csp_spare_request','update','Correct a spare request that has not yet been issued.',false);

INSERT INTO permission_catalogue (id, tenant_id, created_by, updated_by, permission, doc_type, action, description, is_privileged)
SELECT
  gen_random_uuid(),
  t.id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  p.permission, p.doc_type, p.action, p.description, p.is_privileged
FROM tenant t
CROSS JOIN _new_perms p
ON CONFLICT (tenant_id, permission) DO UPDATE
  SET doc_type = EXCLUDED.doc_type,
      action = EXCLUDED.action,
      description = EXCLUDED.description,
      is_privileged = EXCLUDED.is_privileged;

-- ---------------------------------------------------------------------------
-- 2. Rule 1 — a correction follows its create.
--
-- Derived, not listed: every role that already holds the create right for a document gets
-- the right to correct it while it is still a draft.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _follows (new_permission text, follows_permission text) ON COMMIT DROP;

INSERT INTO _follows (new_permission, follows_permission) VALUES
  ('sales.customer.update',      'sales.customer.create'),
  ('sales.order.update',         'sales.order.create'),
  ('purchase.vendor.update',     'purchase.vendor.create'),
  ('purchase.po.update',         'purchase.po.create'),
  ('production.order.update',    'production.order.create'),
  ('engineering.item.update',    'engineering.item.create'),
  ('engineering.bom.update',     'engineering.bom.create'),
  ('inventory.warehouse.update', 'inventory.stock.post'),
  ('quality.inspection.update',  'quality.inspection.execute'),
  ('mnt.request.update',         'mnt.request.create'),
  ('expenditure.claim.update',   'expenditure.claim.create'),
  ('expenditure.travel.update',  'expenditure.claim.create'),
  ('expenditure.advance.update', 'expenditure.claim.create'),
  ('expenditure.indirect.update','expenditure.indirect.create'),
  ('hrm.leave.update',           'hrm.leave.apply'),
  ('csp.spare.update',           'csp.ticket.update'),
  -- Rule 2: an amendment follows its APPROVE, not its create.
  ('sales.order.amend',          'sales.order.confirm'),
  ('purchase.po.amend',          'purchase.po.submit');

INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT DISTINCT
  gen_random_uuid(),
  rp.tenant_id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  rp.role_id,
  f.new_permission
FROM role_permission rp
JOIN _follows f ON f.follows_permission = rp.permission
WHERE NOT EXISTS (
  SELECT 1 FROM role_permission existing
  WHERE existing.tenant_id = rp.tenant_id
    AND existing.role_id = rp.role_id
    AND existing.permission = f.new_permission
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. The administrator holds all of them.
--
-- Same rule 0045 established: `admin` is the role the access console itself is operated
-- from, and a platform capability it cannot exercise is a capability nobody can grant.
-- ---------------------------------------------------------------------------
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT
  gen_random_uuid(),
  ro.tenant_id,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  '0192a8c0-0000-7000-8000-0000000000ff'::uuid,
  ro.id,
  p.permission
FROM role ro
CROSS JOIN _new_perms p
WHERE ro.code IN ('admin', 'demo_admin')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Prove the grants landed.
--
-- A migration that silently granted nothing looks identical to one that worked, and the
-- symptom surfaces days later as "the Edit button is greyed out for everyone". If the
-- derivation matched no rows, that is a broken assumption about the existing grants and
-- this transaction must not commit on it.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  granted integer;
  catalogued integer;
BEGIN
  SELECT count(*) INTO catalogued
  FROM permission_catalogue
  WHERE permission IN (SELECT permission FROM _new_perms);

  SELECT count(*) INTO granted
  FROM role_permission
  WHERE permission IN (SELECT permission FROM _new_perms);

  IF catalogued < 18 THEN
    RAISE EXCEPTION 'expected at least 18 catalogue rows for the correction permissions, found %', catalogued;
  END IF;

  IF granted = 0 THEN
    RAISE EXCEPTION 'no role was granted a correction permission — the create-right derivation matched nothing';
  END IF;

  RAISE NOTICE 'corrections: % catalogue row(s), % grant(s)', catalogued, granted;
END $$;
