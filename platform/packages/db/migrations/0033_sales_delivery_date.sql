-- =============================================================================
-- 0033_sales_delivery_date — a requested delivery date on the sales-order line.
--
-- This is a structural addition to SMBD's table, made because PLANNING cannot exist
-- without it, and it is worth stating plainly rather than burying in a seed.
--
-- Until now a sales order recorded WHAT a customer bought and WHAT it cost. It did not
-- record WHEN they want it. For an invoicing flow that is survivable — the invoice is
-- raised on dispatch and the date is whatever the date is. For a manufacturing plan it is
-- fatal: MRP's entire output is dates, derived by walking backwards from the date the
-- customer expects delivery. Without this column, "demand from confirmed sales orders"
-- (PLANNING §17) is fiction, and every planned order would be dated from an assumption.
--
-- It is NULLABLE on purpose. Existing orders have no promised date and inventing one for
-- them would be worse than admitting there isn't one: PLANNING treats a line with no
-- requested date as demand in the current bucket and raises a `data_warning`, so the gap
-- is visible on the planner's worklist instead of silently becoming a promise nobody made.
--
-- The column belongs to SMBD, which remains its system of record. PLANNING reads it
-- through the DEMAND_SOURCE port and never selects from `sales_order_line` directly.
-- =============================================================================

ALTER TABLE sales_order_line
  ADD COLUMN requested_delivery_date date;

COMMENT ON COLUMN sales_order_line.requested_delivery_date IS
  'When the customer wants this line delivered. Owned by SMBD; read by PLANNING through the DEMAND_SOURCE port to place independent demand in a bucket. NULL means no date was promised — PLANNING raises a data_warning rather than assuming one.';

-- A delivery date before the order was taken is a typo, and it would place the demand in a
-- bucket that has already passed — where it becomes an immediate, permanent past-due
-- exception that no action can clear. Validating it needs the HEADER's order_date, which a
-- CHECK constraint cannot reach (a CHECK may not contain a subquery). A trigger can.
CREATE OR REPLACE FUNCTION sales_guard_delivery_date() RETURNS trigger AS $$
DECLARE ordered date;
BEGIN
  IF NEW.requested_delivery_date IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT order_date INTO ordered FROM sales_order WHERE id = NEW.order_id;
  IF ordered IS NOT NULL AND NEW.requested_delivery_date < ordered THEN
    RAISE EXCEPTION 'requested delivery date % is before the order date % — the plan cannot promise a date in the past',
      NEW.requested_delivery_date, ordered
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_soline_delivery_date BEFORE INSERT OR UPDATE ON sales_order_line
  FOR EACH ROW EXECUTE FUNCTION sales_guard_delivery_date();

CREATE INDEX ix_soline_tenant_delivery ON sales_order_line (tenant_id, requested_delivery_date)
  WHERE requested_delivery_date IS NOT NULL;
