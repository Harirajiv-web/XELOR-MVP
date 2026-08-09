-- Local upgrade compatibility for databases that applied the first 0073 draft before its
-- naming proof ran. Fresh databases already receive work_ref directly from corrected 0073.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'asset_state_event' AND column_name = 'production_order_ref'
  ) THEN
    ALTER TABLE asset_state_event RENAME COLUMN production_order_ref TO work_ref;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'material_dwell_interval' AND column_name = 'production_order_ref'
  ) THEN
    ALTER TABLE material_dwell_interval RENAME COLUMN production_order_ref TO work_ref;
  END IF;
END $$;
