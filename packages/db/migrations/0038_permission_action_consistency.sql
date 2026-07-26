-- =============================================================================
-- 0038 — the permission string and its action column cannot disagree.
--
-- `permission_catalogue` stores a permission twice: once as the string the guard checks
-- (`purchase.po.amend`) and once decomposed (`doc_type` = purchase_order, `action` =
-- amend). Migration 0036 constrained the SHAPE of the string and the VALUE of the action
-- column, but not the relationship between them — so `purchase.po.approve` with
-- `action = 'amend'` was storable, and the seed did exactly that.
--
-- It is worth catching because of how it fails: the row looks correct in the console, the
-- action column passes its check, and the guard denies forever because nothing ever asks
-- for `purchase.po.approve`. A permission that grants nothing is indistinguishable from a
-- permission that works until somebody is standing in front of the screen it blocks.
--
-- The 13 actions are closed. There is deliberately no `approve`: approval is a state
-- change, expressed as `submit` or `amend`.
-- =============================================================================

ALTER TABLE permission_catalogue
  ADD CONSTRAINT ck_permcat_action_matches
  CHECK (permission = split_part(permission, '.', 1) || '.' || split_part(permission, '.', 2) || '.' || action);

COMMENT ON CONSTRAINT ck_permcat_action_matches ON permission_catalogue IS
  'The last segment of the permission string IS the action column. Without this the two can drift, and the result is a grant that checks nothing and denies silently.';
