-- Close the final cancel-vs-dispatch race at the evidence boundary. FOR KEY SHARE
-- serializes this insert with every UPDATE of the parent run row. Under READ COMMITTED, an
-- insert waiting behind cancellation rechecks the updated row and fails because the run is
-- no longer running; if the insert locks first, the action existed before cancellation.
CREATE OR REPLACE FUNCTION agent_action_approved_gate_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  gate_decider uuid;
  live_run_id uuid;
BEGIN
  SELECT run.id
    INTO live_run_id
  FROM agent_run run
  WHERE run.tenant_id = NEW.tenant_id
    AND run.id = NEW.run_id
    AND run.status = 'running'
    AND run.is_active = true
  FOR KEY SHARE;

  IF live_run_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'agent action dispatch requires an active running mission';
  END IF;

  SELECT approval.decided_by
    INTO gate_decider
  FROM agent_approval approval
  WHERE approval.tenant_id = NEW.tenant_id
    AND approval.run_id = NEW.run_id
    AND approval.node_id = NEW.approval_node_id
    AND approval.status = 'approved'
    AND approval.is_active = true;

  IF gate_decider IS NULL OR NEW.approved_by IS DISTINCT FROM gate_decider THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'agent action dispatch must retain its approved gate and human decider';
  END IF;
  RETURN NEW;
END;
$$;
