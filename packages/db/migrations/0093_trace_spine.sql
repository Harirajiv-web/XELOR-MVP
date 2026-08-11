-- THE TRACE SPINE.
--
-- Before this migration you could not answer, in SQL, the only question a customer ever
-- asks: "where is my order?" Every document existed and every document was individually
-- correct, but `grep sales_order_line_id` across the whole schema returned nothing. The
-- chain broke in a specific place — `ProductionService.createFromPlan` received a planned
-- order carrying a need date and a demand peg, and forwarded the item and the quantity.
--
-- So a work order knew what to make and not who it was for. Planning knew the peg but only
-- until conversion. Purchasing knew a requisition existed but not which commitment it
-- served. The result is a system that can create individually valid records and cannot
-- prove they collectively fulfilled anything.
--
-- No autonomous fulfilment mission is possible without this: a mission that cannot ask
-- "which work orders belong to my objective?" cannot verify that its objective was met,
-- and a mission that cannot verify can only claim.
--
-- The columns are NULLable on purpose. Stock made to forecast, a spares requisition, and
-- every row that already exists have no sales order line, and inventing one would be worse
-- than admitting the absence. NULL here means "not pegged to a customer commitment", which
-- is a real and common state, not missing data.

-- ---------------------------------------------------------------- production ----
ALTER TABLE production_order
  ADD COLUMN IF NOT EXISTS sales_order_line_id uuid,
  ADD COLUMN IF NOT EXISTS planned_order_id    uuid,
  ADD COLUMN IF NOT EXISTS need_date           date;

COMMENT ON COLUMN production_order.sales_order_line_id IS
  'The customer commitment this work order serves. NULL for make-to-stock.';
COMMENT ON COLUMN production_order.need_date IS
  'When the finished quantity is needed. Carried from the planned order, which computed it '
  'from the demand peg; losing it made every production order equally urgent.';

CREATE INDEX IF NOT EXISTS ix_prodorder_tenant_so_line
  ON production_order (tenant_id, sales_order_line_id)
  WHERE sales_order_line_id IS NOT NULL;

-- ---------------------------------------------------------------- purchasing ----
ALTER TABLE purchase_requisition
  ADD COLUMN IF NOT EXISTS sales_order_line_id uuid;

CREATE INDEX IF NOT EXISTS ix_purchreq_tenant_so_line
  ON purchase_requisition (tenant_id, sales_order_line_id)
  WHERE sales_order_line_id IS NOT NULL;

-- A purchase order line that came from a requisition. Purchase owns its own document, so
-- this is a logical reference and not a foreign key across a module boundary — but without
-- it the chain stops at the requisition and the goods receipt cannot be traced back to the
-- customer whose order caused it.
ALTER TABLE purchase_order_line
  ADD COLUMN IF NOT EXISTS requisition_id      uuid,
  ADD COLUMN IF NOT EXISTS sales_order_line_id uuid;

CREATE INDEX IF NOT EXISTS ix_poline_tenant_so_line
  ON purchase_order_line (tenant_id, sales_order_line_id)
  WHERE sales_order_line_id IS NOT NULL;

-- ----------------------------------------------------------------- allocation ----
-- Available-to-promise, persisted rather than recomputed.
--
-- A mission that decides "there is enough stock" and then acts on that decision three
-- steps later has, in between, told the truth about a quantity anyone else could take.
-- Reserving makes the commitment real: the quantity is spoken for by a named order line,
-- and the next mission planning against the same warehouse sees less.
ALTER TABLE sales_order_line
  ADD COLUMN IF NOT EXISTS reserved_qty numeric(18,3) NOT NULL DEFAULT 0;

ALTER TABLE sales_order_line
  DROP CONSTRAINT IF EXISTS ck_soline_reserved_within_ordered;
ALTER TABLE sales_order_line
  ADD CONSTRAINT ck_soline_reserved_within_ordered
  CHECK (reserved_qty >= 0 AND reserved_qty <= qty);

COMMENT ON COLUMN sales_order_line.reserved_qty IS
  'Stock committed to this line and no longer available to promise elsewhere. Bounded by '
  'the ordered quantity: reserving more than was ordered is not a business state.';

-- ------------------------------------------------------------ quality release ----
-- Dispatch was gated on "is there finished stock left to ship", which is a quantity
-- question standing in for a quality question. Stock existing is not stock passed.
--
-- An explicit release is a row somebody can point at during an audit, and its absence is
-- the reason a shipment was held — rather than the shipment silently succeeding because
-- the warehouse happened to have the number.
CREATE TABLE IF NOT EXISTS quality_release (
  id                  uuid PRIMARY KEY,
  tenant_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  release_no          text NOT NULL,
  sales_order_line_id uuid,
  production_order_id uuid,
  inspection_id       uuid NOT NULL,
  item_id             uuid NOT NULL,
  qty_released        numeric(18,3) NOT NULL,
  released_at         timestamptz NOT NULL DEFAULT now(),
  released_by         uuid NOT NULL,
  basis               text NOT NULL,
  CONSTRAINT uq_qrelease_tenant_no UNIQUE (tenant_id, release_no),
  CONSTRAINT ck_qrelease_qty_positive CHECK (qty_released > 0)
);

CREATE INDEX IF NOT EXISTS ix_qrelease_tenant_so_line
  ON quality_release (tenant_id, sales_order_line_id)
  WHERE sales_order_line_id IS NOT NULL;

ALTER TABLE quality_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_release FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_quality_release ON quality_release;
CREATE POLICY rls_quality_release ON quality_release
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON quality_release TO app_user;

COMMENT ON TABLE quality_release IS
  'An explicit statement that a quantity passed quality and may ship. Dispatch checks for '
  'this rather than inferring permission from remaining finished-goods quantity.';
