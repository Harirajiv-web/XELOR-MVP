-- =============================================================================
-- 0039 — the permission catalogue can describe the system as it actually is.
--
-- Migration 0036 constrained `permission_catalogue.action` to the 13 document actions from
-- the blueprint. Seeding the catalogue immediately proved that wrong: this system enforces
-- 112 permissions and 46 of them use operational verbs the 13 do not contain —
-- `hrm.payroll.approve`, `inventory.stock.post`, `quality.disposition.decide`,
-- `sales.order.confirm`, `planning.mrp.run`, `mnt.mwo.close`.
--
-- The consequence of leaving it was concrete and bad: those 46 permissions could never be
-- catalogued, the "Explain access" simulator could never describe them, and the console
-- could not grant them. A control plane that cannot describe half the system it governs is
-- worse than no control plane, because it looks complete.
--
-- Renaming them to fit was the other option and it is worse. `hrm.payroll.approve` says
-- what it guards; `hrm.payroll.amend` does not.
--
-- So the 13 stay as the RECOMMENDED document vocabulary (see DOCUMENT_ACTIONS in the
-- platform), the action column accepts any lowercase verb, and the constraint that actually
-- carries the weight — the string's last segment IS the action column, added in 0038 —
-- stays exactly as it is. Typos are caught by catalogue membership instead: a permission
-- nobody registered cannot be granted, whatever it is spelt like.
-- =============================================================================

-- NOTE, added later: 0036 now declares `action` without the closed list in the first place,
-- because with it there the migration set could not be replayed from an empty database —
-- 0037 seeds `planning.mrp.run`, which 0036 forbade and only this file allowed. So on a
-- fresh database the DROP below finds nothing and the ADD is the first to define the shape;
-- on a database built before that correction, the DROP does the work described above. Both
-- paths end identically, which is the only property that matters.
ALTER TABLE permission_catalogue DROP CONSTRAINT IF EXISTS permission_catalogue_action_check;
ALTER TABLE permission_catalogue DROP CONSTRAINT IF EXISTS ck_permcat_action_shape;

ALTER TABLE permission_catalogue
  ADD CONSTRAINT ck_permcat_action_shape CHECK (action ~ '^[a-z][a-z0-9_]*$');

COMMENT ON COLUMN permission_catalogue.action IS
  'The verb. The 13 document actions (create/read/write/delete/submit/cancel/amend/print/export/email/import/report/share) are the recommended vocabulary, not a closed set — 46 of this system''s permissions use operational verbs instead, and they say what they guard more clearly than the 13 would.';
