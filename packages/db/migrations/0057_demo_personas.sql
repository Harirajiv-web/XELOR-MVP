-- =============================================================================
-- 0057 — the five investor-demo personas, and their department boundaries.
--
-- WHAT THIS IS FOR. A demo has to show two things at once: that the whole factory is
-- connected, and that a person only sees their part of it. One administrator proves the
-- first; four department-only personas prove the second. Without the second, "role-based
-- access" is a claim on a slide rather than something anybody watched happen.
--
-- ---------------------------------------------------------------------------
-- THE GRANTS ARE DERIVED, NOT TYPED
-- ---------------------------------------------------------------------------
-- There are 133 permissions. Hand-listing the ~30 that belong to each persona would be
-- 120 lines of string literals that go stale the first time somebody adds a screen — and
-- this codebase has already paid for exactly that mistake once: migration 0045 exists
-- because three hand-maintained registries drifted until 59 of 87 readable endpoints
-- answered 403 to every user in the system, the administrator included.
--
-- So each persona is defined by the MODULE PREFIXES its department owns, and the grants
-- are selected out of `permission_catalogue` — which 0045 generates from the typed
-- registry. Add a screen to Purchase tomorrow and the SPAR persona can open it without
-- anybody remembering this file exists.
--
-- The prefix is not always the module key, and that is why the map below is written out
-- rather than inferred: Administration's permissions are `admin.*`, Maintenance's are
-- `mnt.*` and `maintenance.*`, and the AI router's single cross-cutting permission is
-- `ai.*` while the rest of AI Operations is `aiops.*`.
--
-- ---------------------------------------------------------------------------
-- WHY ONYX IS IN EVERY PERSONA
-- ---------------------------------------------------------------------------
-- ONYX is not a department, it is a cross-cutting component — it serves the other six and
-- owns no business domain. The demo's whole argument is that one intelligence layer reads
-- across a factory whose parts are otherwise walled off from each other, so every persona
-- holds `aiops.*`, `copilot.*` and `ai.*`.
--
-- That is a claim about VISIBILITY, not about data. A briefing may tell a supply-chain
-- executive that twelve units are held at final inspection; it does not let them open the
-- inspection record. Those are two different permissions and the guard checks the second
-- one when they click.
--
-- All five personas belong to Trishul Precision Components (DECISIONS-V2 §7). Kaveri stays
-- as it is: it exists to prove tenant isolation, and adding demo staff to it would blunt
-- the one thing it is for.
-- =============================================================================

-- Trishul, and the system actor every seed writes as. Written out in full at each use
-- rather than bound to a variable: the runner is node-postgres executing the file as one
-- statement batch, so psql meta-commands like `\set` are not available here — they parse
-- as SQL and fail. No other migration in this tree uses them either.
--   tenant 0192a8c0-0000-7000-8000-000000000001  Trishul Precision Components
--   actor  0192a8c0-0000-7000-8000-0000000000ff  the system/seed actor

-- ---------------------------------------------------------------------------
-- 1. The personas, and the prefixes each one may hold.
--
-- A temp table rather than five near-identical INSERT blocks: the shape of the decision
-- is "who gets which departments", and that is easier to review as six rows than as a
-- hundred lines of SQL where a missing prefix looks like every other line.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _persona (
  role_id     uuid,
  code        text,
  name        text,
  subject     uuid,   -- the Keycloak user id from infra/keycloak/realm-indcore.json
  prefixes    text[]
) ON COMMIT DROP;

INSERT INTO _persona (role_id, code, name, subject, prefixes) VALUES
  -- Everything. The end-to-end narrative, and the existing administration controls.
  ('0192a8c0-0057-7000-8000-000000000001','demo_admin','XELOR Administrator',
   'd0000000-0000-4000-8000-00000000000a',
   ARRAY['general','admin','integration','sales','csp','purchase','inventory',
         'engineering','planning','production','quality','maintenance','mnt',
         'hrm','accounts','expenditure','aiops','copilot','ai']),

  -- MICA — Commercial. Customer, order, dispatch, tickets and warranty.
  ('0192a8c0-0057-7000-8000-000000000002','demo_mica','MICA Commercial Executive',
   'd0000000-0000-4000-8000-00000000000b',
   ARRAY['sales','csp','aiops','copilot','ai']),

  -- HEXA — Platform & Governance. Master data, access, audit, connectors.
  ('0192a8c0-0057-7000-8000-000000000003','demo_hexa','HEXA Platform Administrator',
   'd0000000-0000-4000-8000-00000000000c',
   ARRAY['general','admin','integration','aiops','copilot','ai']),

  -- KILN — Manufacturing Operations. Work orders, quality gates, assets.
  ('0192a8c0-0057-7000-8000-000000000004','demo_kiln','KILN Operations Lead',
   'd0000000-0000-4000-8000-00000000000d',
   ARRAY['production','quality','maintenance','mnt','aiops','copilot','ai']),

  -- SPAR — Supply Chain. Suppliers, purchase-to-receipt, stock and valuation.
  ('0192a8c0-0057-7000-8000-000000000005','demo_spar','SPAR Supply Chain Executive',
   'd0000000-0000-4000-8000-00000000000e',
   ARRAY['purchase','inventory','aiops','copilot','ai']);

-- ---------------------------------------------------------------------------
-- 2. The roles.
-- ---------------------------------------------------------------------------
INSERT INTO role (id, tenant_id, created_by, updated_by, code, name)
SELECT p.role_id, '0192a8c0-0000-7000-8000-000000000001'::uuid, '0192a8c0-0000-7000-8000-0000000000ff'::uuid, '0192a8c0-0000-7000-8000-0000000000ff'::uuid, p.code, p.name
FROM _persona p
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. The grants, selected out of the catalogue.
--
-- `split_part(permission, '.', 1)` is the module prefix, and the database already
-- guarantees the rest of the shape: migration 0038 asserts the last segment is the action,
-- and the 0045 trigger refuses any grant whose permission is not catalogued for this
-- tenant. So a typo in the prefix list below cannot create a phantom grant — it can only
-- select nothing, which section 5 then reports.
-- ---------------------------------------------------------------------------
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT gen_random_uuid(), '0192a8c0-0000-7000-8000-000000000001'::uuid, '0192a8c0-0000-7000-8000-0000000000ff'::uuid, '0192a8c0-0000-7000-8000-0000000000ff'::uuid, p.role_id, c.permission
FROM _persona p
JOIN permission_catalogue c
  ON c.tenant_id = '0192a8c0-0000-7000-8000-000000000001'::uuid
 AND split_part(c.permission, '.', 1) = ANY (p.prefixes)
ON CONFLICT (tenant_id, role_id, permission) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. The bindings.
-- ---------------------------------------------------------------------------
INSERT INTO user_role (id, tenant_id, created_by, updated_by, subject, role_id)
SELECT gen_random_uuid(), '0192a8c0-0000-7000-8000-000000000001'::uuid, '0192a8c0-0000-7000-8000-0000000000ff'::uuid, '0192a8c0-0000-7000-8000-0000000000ff'::uuid, p.subject, p.role_id
FROM _persona p
ON CONFLICT (tenant_id, subject, role_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Prove it landed, here, rather than discovering it on stage.
--
-- Two ways this migration can succeed and still be wrong, and neither shows up as an
-- error: a persona ends up with no grants at all (every prefix misspelt), or the
-- department-only personas quietly receive everything (a prefix list that over-matched).
-- Both are silent, both are fatal to the one thing the demo is meant to prove, and both
-- are one COUNT away from being impossible.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  total int;
BEGIN
  SELECT count(*) INTO total FROM permission_catalogue
   WHERE tenant_id = '0192a8c0-0000-7000-8000-000000000001';

  FOR r IN
    SELECT ro.code, count(rp.id) AS granted
    FROM role ro
    LEFT JOIN role_permission rp ON rp.role_id = ro.id
    WHERE ro.tenant_id = '0192a8c0-0000-7000-8000-000000000001'
      AND ro.code LIKE 'demo_%'
    GROUP BY ro.code
  LOOP
    IF r.granted = 0 THEN
      RAISE EXCEPTION 'persona % received no permissions — check its prefix list', r.code;
    END IF;
    IF r.code <> 'demo_admin' AND r.granted >= total THEN
      RAISE EXCEPTION 'persona % holds the whole registry (% of %) — it is not department-scoped',
        r.code, r.granted, total;
    END IF;
    RAISE NOTICE 'persona % holds % of % permissions', r.code, r.granted, total;
  END LOOP;
END $$;
