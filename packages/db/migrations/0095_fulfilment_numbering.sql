-- Numbering series for the fulfilment runtime.
--
-- A mission, its approvals and its actions are numbered through the same gapless per-year
-- series as every other document in the product. That is deliberate rather than incidental:
-- these are records an auditor will ask to see in order, and "an agent created this one" is
-- not a reason to number it differently from a purchase order.
--
-- Seeded for every tenant that already has a sales-order series, so a new tenant inherits
-- the same financial years rather than failing on its first mission with
-- DOC_SERIES_NOT_CONFIGURED — which is a confusing way to learn that a migration only
-- covered the demo data.

INSERT INTO document_series (id, tenant_id, created_by, updated_by, doc_type, prefix, fy_code, width, next_no)
SELECT
  gen_random_uuid(),
  s.tenant_id,
  s.created_by,
  s.updated_by,
  d.doc_type,
  d.prefix,
  s.fy_code,
  5,
  1
FROM (SELECT DISTINCT tenant_id, fy_code, created_by, updated_by FROM document_series WHERE doc_type = 'sales_order') s
CROSS JOIN (VALUES
  ('fulfilment_mission',  'MSN'),
  ('fulfilment_approval', 'APR'),
  ('fulfilment_action',   'ACT')
) AS d(doc_type, prefix)
ON CONFLICT (tenant_id, doc_type, fy_code) DO NOTHING;
