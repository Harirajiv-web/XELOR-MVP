-- =============================================================================
-- 0054_seed_attendance_july_2026 — a real muster for the demo month.
--
-- The attendance muster is the screen a factory owner recognises instantly, because it is
-- the paper register they already keep. Until now it rendered every employee with zeroes,
-- which does not read as "we have not computed this month" — it reads as "nobody came to
-- work", and that is a much more alarming claim than the truth.
--
-- Three properties this seed keeps, because the module's whole argument rests on them:
--
--   1. THE PUNCHES ARE SEEDED TOO, not just the conclusions. Attendance is deterministic —
--      the same inputs always produce the same output — and a day whose result exists with
--      no input behind it is a number nobody can defend. Re-running the attendance process
--      over this month must reproduce these rows exactly, so the inputs are here.
--   2. THE ROSTER IS SEEDED. Weekly-off is a first-class roster entry, NEVER inferred from
--      the day being a Sunday (§15.2 rule 6). Without the roster the engine would answer
--      "no shift rostered" and route seventeen perfectly ordinary days to a human.
--   3. EVERY DERIVED NUMBER IS COMPUTED HERE THE WAY THE ENGINE COMPUTES IT — worked
--      minutes as gross less the shift's break, late minutes measured from shift start PLUS
--      the grace, overtime as worked less the shift's own `ot_after_minutes`. None of them
--      is typed in. Change a shift's break in the master and this seed would move with it.
--
-- The month is 01–20 July 2026, ending on the demo world's "today" (Monday 20 Jul 2026).
-- Sunday is the weekly off and Saturday is a working day, which is how a Pune MSME on a
-- six-day week actually runs — not an oversight.
--
-- The story in the data, all of it visible on the muster:
--   · TPC-0004 Kavita Rao   — one day of approved Casual Leave (10 Jul), paid, reconciled
--                             against the leave balance seeded in 0025.
--   · TPC-0009 Vikram Jadhav— one unexplained absence (14 Jul): one day of loss of pay.
--   · TPC-0008 Sanjay Patil — two late marks beyond Shift A's ten-minute grace, and three
--                             days of overtime.
--   · TPC-0007 Imran Shaikh — one late mark on Shift B.
--   · TPC-0010 Lakshmi S.   — three shorter overtime days at the Coimbatore plant.
-- Everybody else has a clean month, which is what a clean month should look like.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The shape of the month, resolved once and reused by all four inserts below.
--
-- `kind` is the only judgement in this file. Everything after it is arithmetic.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TEMPORARY VIEW july_2026_day AS
WITH cal AS (
  SELECT d::date AS att_date
    FROM generate_series(DATE '2026-07-01', DATE '2026-07-20', INTERVAL '1 day') AS d
),
emp AS (
  SELECT e.id, e.tenant_id, e.created_by, e.updated_by, e.emp_code, e.default_shift_id
    FROM employee e
   WHERE e.tenant_id = '0192a8c0-0000-7000-8000-000000000001'
     AND e.is_active
),
classified AS (
  SELECT
    e.id AS employee_id, e.tenant_id, e.created_by, e.updated_by, e.emp_code,
    c.att_date,
    s.id AS shift_id, s.code AS shift_code, s.start_time, s.end_time,
    s.break_minutes, s.grace_minutes, s.ot_after_minutes, s.half_day_threshold_minutes,
    CASE
      -- ISODOW 7 is Sunday. The roster row below is what actually makes the day an off;
      -- this is only how the roster itself is generated.
      WHEN EXTRACT(ISODOW FROM c.att_date) = 7                                     THEN 'off'
      WHEN e.emp_code = 'TPC-0004' AND c.att_date = DATE '2026-07-10'              THEN 'leave'
      WHEN e.emp_code = 'TPC-0009' AND c.att_date = DATE '2026-07-14'              THEN 'absent'
      WHEN e.emp_code = 'TPC-0008'
       AND c.att_date IN (DATE '2026-07-08', DATE '2026-07-15')                    THEN 'late'
      WHEN e.emp_code = 'TPC-0007' AND c.att_date = DATE '2026-07-09'              THEN 'late'
      WHEN e.emp_code = 'TPC-0008'
       AND c.att_date IN (DATE '2026-07-03', DATE '2026-07-10', DATE '2026-07-17') THEN 'ot_long'
      WHEN e.emp_code = 'TPC-0010'
       AND c.att_date IN (DATE '2026-07-02', DATE '2026-07-09', DATE '2026-07-16') THEN 'ot_short'
      ELSE 'present'
    END AS kind
  FROM emp e
  CROSS JOIN cal c
  JOIN shift s ON s.id = e.default_shift_id
),
punched AS (
  SELECT
    d.*,
    -- Every employee in the demo runs A, B or GEN, all of which end on the day they start.
    -- Shift C crosses midnight and would need the out-punch dated to the following day;
    -- nobody is rostered on it here, and this seed does not pretend to handle it.
    ((d.att_date + d.start_time) AT TIME ZONE 'Asia/Kolkata')
      + CASE d.kind WHEN 'late' THEN INTERVAL '18 minutes' ELSE INTERVAL '0' END AS first_in,
    ((d.att_date + d.end_time) AT TIME ZONE 'Asia/Kolkata')
      + CASE d.kind
          WHEN 'ot_long'  THEN INTERVAL '2 hours'
          WHEN 'ot_short' THEN INTERVAL '1 hour'
          ELSE INTERVAL '0'
        END AS last_out,
    (d.att_date + d.start_time) AT TIME ZONE 'Asia/Kolkata' AS shift_start
  FROM classified d
  WHERE d.kind NOT IN ('off', 'leave', 'absent')
)
SELECT
  c.employee_id, c.tenant_id, c.created_by, c.updated_by, c.emp_code, c.att_date,
  c.shift_id, c.shift_code, c.kind,
  c.break_minutes, c.grace_minutes, c.ot_after_minutes, c.half_day_threshold_minutes,
  p.first_in, p.last_out,
  -- The engine's arithmetic, restated. worked = gross − break.
  COALESCE(ROUND((EXTRACT(EPOCH FROM (p.last_out - p.first_in)) / 60 - c.break_minutes)::numeric, 0), 0)
    AS worked_minutes,
  -- Late is measured from shift start PLUS the grace, never from shift start.
  COALESCE(GREATEST(0, ROUND((EXTRACT(EPOCH FROM (p.first_in - p.shift_start)) / 60)::numeric, 0)
                       - c.grace_minutes), 0)::int AS late_minutes
FROM classified c
LEFT JOIN punched p ON p.employee_id = c.employee_id AND p.att_date = c.att_date;

-- ---------------------------------------------------------------------------
-- (1) The roster. A weekly off is a published roster entry with no shift on it.
-- ---------------------------------------------------------------------------
INSERT INTO shift_roster (id, tenant_id, created_by, updated_by, employee_id, roster_date,
                          shift_id, entry_type, status, is_ot_planned)
SELECT
  ('0192a8c0-0051-7000-8000-' || lpad((row_number() OVER (ORDER BY d.emp_code, d.att_date))::text, 12, '0'))::uuid,
  d.tenant_id, d.created_by, d.updated_by, d.employee_id, d.att_date,
  CASE WHEN d.kind = 'off' THEN NULL ELSE d.shift_id END,
  CASE WHEN d.kind = 'off' THEN 'weekly_off' ELSE 'shift' END,
  'published',
  d.kind IN ('ot_long', 'ot_short')
FROM july_2026_day d
ON CONFLICT (tenant_id, employee_id, roster_date) DO NOTHING;

-- ---------------------------------------------------------------------------
-- (2) Kavita's leave application. The muster shows a paid leave day; this is the approved
--     application behind it, so the day is a decision somebody made rather than a status
--     that appeared. `days` is 1.00 and the balance below moves by the same 1.00.
-- ---------------------------------------------------------------------------
INSERT INTO leave_application (id, tenant_id, created_by, updated_by, employee_id, leave_type_id,
                               from_date, to_date, half_day, days, reason, status, approver_id, decided_at)
VALUES (
  '0192a8c0-0051-7100-8000-000000000001',
  '0192a8c0-0000-7000-8000-000000000001',
  '0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0000-7000-8000-0000000000ff',
  '0192a8c0-0025-7000-8000-000000000204',  -- Kavita Rao
  '0192a8c0-0025-7000-8000-000000000111',  -- Casual Leave
  DATE '2026-07-10', DATE '2026-07-10', false, 1.00,
  'Family function',
  'approved',
  '0192a8c0-0025-7000-8000-000000000201',  -- approved by the Plant Head
  TIMESTAMPTZ '2026-07-07 11:20:00+05:30'
)
ON CONFLICT (id) DO NOTHING;

-- The balance and the muster must agree. A leave day on the muster that has not moved the
-- balance is the first thing an employee spots and the last thing they forget.
UPDATE leave_balance
   SET used = 1.00, updated_at = now()
 WHERE tenant_id    = '0192a8c0-0000-7000-8000-000000000001'
   AND employee_id  = '0192a8c0-0025-7000-8000-000000000204'
   AND leave_type_id= '0192a8c0-0025-7000-8000-000000000111'
   AND period_year  = '2026-27'
   AND used = 0.00;

-- ---------------------------------------------------------------------------
-- (3) The raw punches — the INPUT. Append-only, and deliberately seeded before the
--     conclusions so the conclusions can be re-derived rather than believed.
-- ---------------------------------------------------------------------------
INSERT INTO biometric_punch (id, tenant_id, created_by, updated_by, device_id, emp_code,
                             employee_id, punch_time, direction, source, processed)
SELECT
  ('0192a8c0-0051-7200-8000-' || lpad((row_number() OVER (ORDER BY d.emp_code, d.att_date, t.punch_time))::text, 12, '0'))::uuid,
  d.tenant_id, d.created_by, d.updated_by,
  'ESSL-K30-01', d.emp_code, d.employee_id,
  t.punch_time, t.direction, 'device', true
FROM july_2026_day d
CROSS JOIN LATERAL (
  VALUES (d.first_in, 'in'), (d.last_out, 'out')
) AS t(punch_time, direction)
WHERE d.first_in IS NOT NULL
ON CONFLICT (tenant_id, device_id, emp_code, punch_time) DO NOTHING;

-- ---------------------------------------------------------------------------
-- (4) The processed days — the OUTPUT. Every column below is derived from (1) and (3) by
--     the same rules `processAttendanceDay` applies, including the precedence: weekly-off,
--     then holiday, then approved leave, and only then the punches.
-- ---------------------------------------------------------------------------
INSERT INTO attendance_day (id, tenant_id, created_by, updated_by, employee_id, att_date, shift_id,
                            first_in, last_out, worked_hours, ot_hours, late_minutes, status,
                            lop_units, payable_units, exceptions, leave_application_id, locked)
SELECT
  ('0192a8c0-0051-7300-8000-' || lpad((row_number() OVER (ORDER BY d.emp_code, d.att_date))::text, 12, '0'))::uuid,
  d.tenant_id, d.created_by, d.updated_by, d.employee_id, d.att_date,
  CASE WHEN d.kind = 'off' THEN NULL ELSE d.shift_id END,
  d.first_in, d.last_out,
  ROUND(d.worked_minutes / 60.0, 2),
  ROUND(GREATEST(0, d.worked_minutes - d.ot_after_minutes) / 60.0, 2),
  d.late_minutes,
  CASE d.kind
    WHEN 'off'    THEN 'off'
    WHEN 'leave'  THEN 'leave'
    WHEN 'absent' THEN 'absent'
    -- A short day is a half day, whatever caused it. None arise in this month.
    ELSE CASE WHEN d.worked_minutes < d.half_day_threshold_minutes THEN 'half' ELSE 'present' END
  END,
  CASE WHEN d.kind = 'absent' THEN 1.00
       WHEN d.kind IN ('off', 'leave') THEN 0.00
       WHEN d.worked_minutes < d.half_day_threshold_minutes THEN 0.50
       ELSE 0.00 END,                                   -- lop_units
  CASE WHEN d.kind IN ('off', 'absent') THEN 0.00
       WHEN d.kind = 'leave' THEN 1.00                  -- Casual Leave is PAID
       WHEN d.worked_minutes < d.half_day_threshold_minutes THEN 0.50
       ELSE 1.00 END,                                   -- payable_units
  CASE
    WHEN d.kind = 'absent' THEN jsonb_build_array('no punches — absent')
    WHEN d.late_minutes > 0 THEN
      jsonb_build_array('late by ' || d.late_minutes || ' min beyond the ' || d.grace_minutes || ' min grace')
    ELSE '[]'::jsonb
  END,
  CASE WHEN d.kind = 'leave' THEN '0192a8c0-0051-7100-8000-000000000001'::uuid ELSE NULL END,
  -- NOT locked. July is still open: locking it is a decision a human makes once every
  -- regularisation is resolved, and pre-locking it in a seed would hide that step.
  false
FROM july_2026_day d
ON CONFLICT (tenant_id, employee_id, att_date) DO NOTHING;

DROP VIEW IF EXISTS july_2026_day;
