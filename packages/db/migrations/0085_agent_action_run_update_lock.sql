-- 0084 used FOR KEY SHARE, which permits a concurrent non-key UPDATE such as a status
-- transition. FOR UPDATE is intentionally stronger: raw app-role cancellation/halt/failure
-- and action insertion now serialize on the same parent run row.
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
  FOR UPDATE;

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
