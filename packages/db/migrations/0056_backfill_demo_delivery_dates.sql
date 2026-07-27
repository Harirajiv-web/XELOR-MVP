-- =============================================================================
-- 0056 — the promised delivery dates the demo orders should always have had.
--
-- `sales_order_line.requested_delivery_date` landed in migration 0033 with a trigger and a
-- partial index, and nothing could ever set it: `POST /sales/orders` had no field for it.
-- The seed script has carried the three dates since it was written — it prints them in its
-- own progress output — and then discarded them for want of somewhere to put them.
--
-- The API accepts the field now. The three demo orders predate that, and they cannot simply
-- be re-seeded: SO-2627-00001 is partially dispatched, so it has stock movements and an
-- invoice behind it, and deleting it to recreate it would tear a hole in the ledger to fix
-- a display field. Backfilling the value is the smaller, safer change — and it is the same
-- value the seed would have written had the field existed on the day.
--
-- This matters past the screen it shows on: Planning nets against these dates, so with them
-- null MRP has been doing arithmetic against nothing and producing a plan that still looked
-- plausible.
--
-- Matched on the customer's own PO number rather than on our sequence number, because
-- `so_no` depends on the order rows happened to be created in and `cust_po_no` is what the
-- customer actually sent. Only NULL rows are touched, so a re-run changes nothing and a
-- date somebody sets by hand later is never overwritten. The 0033 trigger still fires: a
-- date before the order date is refused here exactly as it would be through the API.
-- =============================================================================

UPDATE sales_order_line l
   SET requested_delivery_date = v.due::date,
       updated_at = now()
  FROM (VALUES
         ('BAC/PO/2026/1187', '2026-08-07'),
         ('SML-4471',         '2026-08-21'),
         ('BAC/PO/2026/1206', '2026-09-04')
       ) AS v(cust_po_no, due)
  JOIN sales_order so ON so.cust_po_no = v.cust_po_no
 WHERE l.order_id = so.id
   AND l.requested_delivery_date IS NULL;

COMMENT ON COLUMN sales_order_line.requested_delivery_date IS
  'What the customer was promised for this line. Optional — orders do get taken without a date — but it is the demand date Planning nets against, so a null here means MRP has no view of when this line is actually wanted.';
