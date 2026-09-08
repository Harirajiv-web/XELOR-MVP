-- =============================================================================
-- 0021_seed_sales — §7 demo customers, chosen to exercise place of supply.
--
-- 3S sells the CP-50 pump from its PUNE registration (27, Maharashtra):
--   * Bharat Auto Components, Pune (27)      -> INTRA-state -> CGST + SGST
--   * BlueOrbit Pumps, Bengaluru (29)        -> INTER-state -> IGST
--   * Sundaram Motors, Coimbatore (33)       -> INTER-state from Pune, but INTRA-state
--                                               from the Coimbatore GSTIN — the reason the
--                                               two-GSTIN tenant exists (§7).
--   * Raja Traders (unregistered)            -> no GSTIN; ship-to becomes "URP" once the
--                                               1 Aug 2026 mandate is live.
-- =============================================================================

INSERT INTO customer
  (id, tenant_id, created_by, updated_by, code, name, gstin, state_code, is_registered,
   contact_email, billing_address, credit_limit, credit_days) VALUES
 ('0192a8c0-0020-7000-8000-000000000001','0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'CUST-BAC','Bharat Auto Components Pvt Ltd','27AAACB2233K1Z9','27',true,
  'purchase@bharatauto.example','Plot 44, MIDC Bhosari, Pune 411026', 2500000.00, 45),
 ('0192a8c0-0020-7000-8000-000000000002','0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'CUST-BLO','BlueOrbit Pumps India Pvt Ltd','29AABCB7788M1Z4','29',true,
  'scm@blueorbit.example','12 Peenya Industrial Area, Bengaluru 560058', 1500000.00, 30),
 ('0192a8c0-0020-7000-8000-000000000003','0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'CUST-SUN','Sundaram Motors Ltd','33AADCS4455L1Z2','33',true,
  'stores@sundarammotors.example','SIDCO Industrial Estate, Coimbatore 641021', 800000.00, 30),
 ('0192a8c0-0020-7000-8000-000000000004','0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff',
  'CUST-RAJ','Raja Traders (unregistered)',NULL,'27',false,
  NULL,'Shop 7, Bhosari Market, Pune 411039', 100000.00, 15)
ON CONFLICT (id) DO NOTHING;
