-- =============================================================================
-- 0050 — three modules exist in code but were never sold to anybody.
--
-- `licence_record.modules` is the list the web app reads to decide which modules exist for
-- a company. Trishul's list was written in 0037, before Integration, AI Operations and the
-- copilot were built, so all three shipped invisible: the code is installed, the person has
-- the permissions, and the sidebar still shows nothing — because the third gate, "did this
-- company buy it", was answering no.
--
-- That is the gate working correctly. It is also exactly the drift this project has been
-- bitten by before: a fact with more than one home, and nothing comparing the copies.
--
-- Trishul (IND-CORE Plant) gets all three. Kaveri (IND-CORE Essentials) deliberately does
-- NOT — its five-module entitlement is what makes the licence gate demonstrable on screen
-- rather than merely asserted in a slide.
--
-- Written as a set union rather than a rewrite: re-running it is a no-op, and a module
-- somebody adds by hand between deployments is not silently deleted.
-- =============================================================================

UPDATE licence_record
   SET modules = (
         SELECT jsonb_agg(DISTINCT m ORDER BY m)
           FROM jsonb_array_elements_text(
                  modules || '["integration","aiops","copilot"]'::jsonb
                ) AS m
       ),
       updated_at = now()
 WHERE id = '0192a8c0-0036-7900-8000-000000000001';

COMMENT ON COLUMN licence_record.modules IS
  'The modules this tenant bought. Read by the web app''s module registry as the second of three independent gates — INSTALLED (the code is in this build), LICENSED (this column), PERMITTED (the person''s permissions). Three gates because three different people fix them: an engineer, a salesperson, an administrator.';
