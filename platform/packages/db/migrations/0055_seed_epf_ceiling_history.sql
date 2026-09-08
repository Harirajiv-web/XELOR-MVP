-- =============================================================================
-- 0055_seed_epf_ceiling_history — the EPF wage ceiling as it actually moved.
--
-- The statutory-rates screen makes the strongest claim this module has to a finance head:
-- a rate change is a ROW SOMEBODY ADDS, not a software release, and the old rate never goes
-- anywhere because a payslip recomputed in 2029 must resolve the rate that applied to the
-- month it was earned. With one row per statute that claim can only be asserted. With the
-- ceiling's real history it is visible — two superseded rows sitting above the one in force,
-- none of them edited, none of them removed.
--
-- Both rows are historical fact, not demo furniture:
--
--   01-Jun-2001  ceiling Rs 6,500. Raised from Rs 5,000 by the EPFO with effect from
--                1 June 2001, and it then stood unchanged for thirteen years.
--   01-Sep-2014  ceiling Rs 15,000. G.S.R. 609(E) dated 22-Aug-2014 raised it from
--                Rs 6,500 with effect from 1 September 2014.
--
-- The administrative charge on each row is the one in force on that row's date, because a
-- rate book that gets the ceiling right and the admin charge wrong is still wrong: admin
-- charges were 1.10% until 31-Dec-2014, then 0.85%, then 0.65% from Apr-2017, then the
-- 0.50% the 2026 row already carries. EPS has been 8.33% and EDLI 0.50% throughout.
--
-- NO FUTURE-DATED ROW IS SEEDED. A "scheduled" row would light up a third state on the
-- screen and would be a fabricated notification — a statutory rate nobody has announced,
-- presented as one that has been. The whole point of this product is that it does not do
-- that, and a demo that cheats on exactly the claim it is making is worse than a demo with
-- one fewer badge on it.
--
-- Nothing here needs `effective_to`. The resolver takes the newest row whose
-- `effective_from` has arrived, so superseding a rate is an INSERT and only an INSERT —
-- closing the old row would be an UPDATE, which 0024 revokes and blocks by trigger anyway.
-- =============================================================================

INSERT INTO stat_epf_config
 (id, effective_from, source_note, created_by, wage_ceiling, employee_pct, eps_pct, admin_pct, edli_pct) VALUES
 ('0192a8c0-0052-7000-8000-000000000001', DATE '2001-06-01',
  'EPF wage ceiling raised to Rs 6,500 w.e.f. 01-Jun-2001; EPS 8.33%, admin 1.10%, EDLI 0.50%',
  '0192a8c0-0000-7000-8000-0000000000ff', 6500.00, 12.00, 8.33, 1.10, 0.50),
 ('0192a8c0-0052-7000-8000-000000000002', DATE '2014-09-01',
  'EPF wage ceiling raised to Rs 15,000 w.e.f. 01-Sep-2014 (G.S.R. 609(E), 22-Aug-2014); EPS 8.33%, admin 1.10%, EDLI 0.50%',
  '0192a8c0-0000-7000-8000-0000000000ff', 15000.00, 12.00, 8.33, 1.10, 0.50)
ON CONFLICT (id) DO NOTHING;
