-- =============================================================================
-- 0042 — a half-open circuit keeps the moment it opened.
--
-- Migration 0040 asserted `(circuit_state = 'open') = (circuit_opened_at IS NOT NULL)`,
-- which is wrong about the middle state. A breaker moves closed → open → HALF-OPEN → closed,
-- and half-open still needs the timestamp: if the probe fails the breaker re-opens, and the
-- cool-down is measured from when it originally opened, not from now. Clearing the
-- timestamp on the way into half-open would restart the cool-down on every probe, so a
-- flapping endpoint would be probed forever at the shortest possible interval — the exact
-- behaviour the breaker exists to prevent.
--
-- The correct rule is the other way round: only a CLOSED circuit has no opened-at.
-- =============================================================================

ALTER TABLE connection DROP CONSTRAINT IF EXISTS ck_connection_circuit;

ALTER TABLE connection
  ADD CONSTRAINT ck_connection_circuit
  CHECK ((circuit_state = 'closed') = (circuit_opened_at IS NULL));

COMMENT ON COLUMN connection.circuit_opened_at IS
  'When the breaker opened. Retained through half-open: the cool-down is measured from the original opening, so a flapping endpoint is not probed at the shortest possible interval forever.';
