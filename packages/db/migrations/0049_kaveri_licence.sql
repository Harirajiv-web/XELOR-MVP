-- =============================================================================
-- 0049 — Kaveri gets a licence, and a SMALLER one than Trishul.
--
-- Found by building the first screen: `GET /me` reported `licence: none` for the second
-- tenant, because only Trishul was ever given a licence row. The web app treats a missing
-- licence as an unrestricted install — correct for a developer machine or an on-premise
-- deployment with no entitlement file, and exactly wrong here, where it meant Kaveri's
-- administrator would have seen every module in the product including ones the tenant was
-- never sold.
--
-- The fix is not just "add a row". Kaveri is deliberately given a NARROWER plan: general,
-- engineering, inventory, sales and administration — five, against Trishul's fourteen. No
-- manufacturing, no planning, no service portal, because Kaveri is an electro-fabrication
-- shop in the §7 universe rather than a full precision-components plant.
--
-- That difference is a demonstration in itself. Switching tenants in the sidebar visibly
-- changes which modules exist — the same build, the same user interface, a different
-- entitlement — which is the clearest way to show that removing a module for a customer is
-- a licensing decision and not a rebuild.
-- =============================================================================

INSERT INTO licence_record (
  id, tenant_id, created_by, updated_by,
  plan, named_seats, modules, valid_from, valid_to, enforcement
) VALUES (
  '0192a8c0-0036-7900-8000-000000000002',
  '0192a8c0-0000-7000-8000-000000000002',
  '0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0000-7000-8000-0000000000ff',
  'IND-CORE Essentials',
  8,
  '["general","engineering","inventory","sales","administration"]'::jsonb,
  '2026-04-01', '2027-03-31',
  -- Soft, like Trishul's. A plant does not stop because a licence lapsed on a Friday
  -- evening; the console says so, loudly, and the work continues.
  'soft'
)
ON CONFLICT (id) DO UPDATE
  SET plan = EXCLUDED.plan,
      named_seats = EXCLUDED.named_seats,
      modules = EXCLUDED.modules,
      valid_from = EXCLUDED.valid_from,
      valid_to = EXCLUDED.valid_to,
      enforcement = EXCLUDED.enforcement,
      updated_at = now();

COMMENT ON TABLE licence_record IS
  'What a tenant bought. `modules` is the entitlement list the web app reads to decide which modules exist for this company — separate from, and checked before, whether a given person may open one.';
