-- Preserve supplier unit prices while including order-level charges in approval commitments.
ALTER TABLE purchase_order ADD COLUMN additional_charges numeric(18,2) NOT NULL DEFAULT 0
  CHECK (additional_charges >= 0);
