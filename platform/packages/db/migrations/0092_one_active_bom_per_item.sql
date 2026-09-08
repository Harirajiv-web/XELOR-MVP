-- ONE ACTIVE BOM PER ITEM.
--
-- `EngineeringService.activeBomEdges()` selects every BOM line whose parent BOM has
-- `is_active = true`, and hands the result to MRP as the product structure. Nothing
-- constrained that to one BOM per item, so two active versions of the same item did not
-- make MRP choose — it made MRP receive BOTH edge sets and SUM them. Every component
-- requirement doubled, silently, with a plan that looked entirely reasonable.
--
-- That is the worst shape a defect can take in a planning system: not a crash, not an
-- obviously wrong number, but a confident purchase order for twice what the factory needs.
--
-- The fix is a partial unique index rather than application code, because the guarantee has
-- to hold for the seeders, the demo reset, a support engineer with psql, and any future
-- module that inserts a BOM without knowing this rule exists.
--
-- `is_active` is already how this schema says "the version in force" — `activeBomEdges` has
-- always read it that way. Superseding a revision is therefore the same operation as
-- retiring one: clear the flag on the old row, set it on the new. That is what an ECO does.

-- Refuse to install the constraint over data that already violates it. Creating the index
-- would fail anyway, but with a bare "could not create unique index" naming a row id and
-- nothing a human can act on. This names the item.
DO $$
DECLARE
  offender record;
  offences int := 0;
  detail text := '';
BEGIN
  FOR offender IN
    SELECT tenant_id, item_id, count(*) AS n
    FROM bom
    WHERE is_active
    GROUP BY tenant_id, item_id
    HAVING count(*) > 1
  LOOP
    offences := offences + 1;
    detail := detail || format(E'\n  tenant %s, item %s has %s active BOMs',
                               offender.tenant_id, offender.item_id, offender.n);
  END LOOP;

  IF offences > 0 THEN
    RAISE EXCEPTION '%', format(
      E'Cannot enforce one active BOM per item: %s item(s) already have more than one.%s\n'
      'MRP has been summing these into a doubled requirement. Decide which revision is in '
      'force and clear is_active on the others before migrating.',
      offences, detail);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bom_one_active_per_item
  ON bom (tenant_id, item_id)
  WHERE is_active;

COMMENT ON INDEX uq_bom_one_active_per_item IS
  'Exactly one BOM revision per item may be active. activeBomEdges() sums the rows it '
  'returns, so a second active revision doubles every component requirement rather than '
  'creating an ambiguity somebody would notice.';
