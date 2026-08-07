-- A cancelled mission must not leave a decision request looking actionable.
-- "cancelled" is a system lifecycle outcome, distinct from a human rejection.
ALTER TABLE agent_approval
  DROP CONSTRAINT agent_approval_status_check;

ALTER TABLE agent_approval
  ADD CONSTRAINT agent_approval_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));
