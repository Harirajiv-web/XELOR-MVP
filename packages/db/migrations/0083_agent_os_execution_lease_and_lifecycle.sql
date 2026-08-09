-- Renewable, attempt-bound execution leases allow a crashed node to be reclaimed before
-- the bounded graph deadline without stealing a live slow executor. Existing running rows
-- are deliberately not rewritten during deployment; the runtime's conservative legacy
-- fallback handles them.
ALTER TABLE agent_node_run
  ADD COLUMN execution_lease_expires_at timestamptz;

CREATE INDEX ix_agentnode_expired_lease
  ON agent_node_run (tenant_id, execution_lease_expires_at)
  WHERE status = 'running';

ALTER TABLE agent_node_run
  ADD CONSTRAINT ck_agentnode_execution_lease
  CHECK (
    (status = 'running' AND execution_token IS NOT NULL AND execution_lease_expires_at IS NOT NULL)
    OR
    (status <> 'running' AND execution_token IS NULL AND execution_lease_expires_at IS NULL)
  ) NOT VALID;

-- Freeze the full request identity, not only its graph/input JSON. Lifecycle fields may
-- advance, and timeout_at may move only because human-review time is paused by the runtime.
CREATE OR REPLACE FUNCTION agent_run_evidence_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
       NEW.id, NEW.tenant_id, NEW.created_at, NEW.created_by,
       NEW.graph_key, NEW.graph_version, NEW.goal, NEW.input, NEW.graph_snapshot,
       NEW.provider_mode, NEW.max_steps, NEW.idempotency_key, NEW.request_fingerprint
     ) IS DISTINCT FROM ROW(
       OLD.id, OLD.tenant_id, OLD.created_at, OLD.created_by,
       OLD.graph_key, OLD.graph_version, OLD.goal, OLD.input, OLD.graph_snapshot,
       OLD.provider_mode, OLD.max_steps, OLD.idempotency_key, OLD.request_fingerprint
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'agent run request identity, input and graph snapshot are immutable after insert';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION agent_run_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('completed', 'failed', 'cancelled') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'terminal agent run evidence is immutable';
  END IF;

  IF NEW.status <> OLD.status AND NOT (
    (OLD.status = 'pending' AND NEW.status IN ('running','failed','cancelled','halted'))
    OR (OLD.status = 'running' AND NEW.status IN ('waiting_step','waiting_approval','completed','failed','cancelled','halted'))
    OR (OLD.status = 'waiting_step' AND NEW.status IN ('pending','running','failed','cancelled','halted'))
    OR (OLD.status = 'waiting_approval' AND NEW.status IN ('running','failed','cancelled','halted'))
    OR (OLD.status = 'halted' AND NEW.status IN ('running','waiting_approval','failed','cancelled'))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('invalid agent run lifecycle transition: %s -> %s', OLD.status, NEW.status);
  END IF;

  IF NEW.status = 'completed' AND NEW.output IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'a completed agent run must retain its output evidence';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agentrun_lifecycle
  BEFORE UPDATE ON agent_run
  FOR EACH ROW EXECUTE FUNCTION agent_run_lifecycle_guard();

-- A pending approval may receive one terminal decision. Once terminal, neither its human
-- attribution nor its lifecycle can be rewritten through the shared application role.
CREATE OR REPLACE FUNCTION agent_approval_proposal_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
       NEW.id, NEW.tenant_id, NEW.created_at, NEW.created_by,
       NEW.run_id, NEW.node_id, NEW.proposed, NEW.proposed_action, NEW.title, NEW.risk
     ) IS DISTINCT FROM ROW(
       OLD.id, OLD.tenant_id, OLD.created_at, OLD.created_by,
       OLD.run_id, OLD.node_id, OLD.proposed, OLD.proposed_action, OLD.title, OLD.risk
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'agent approval attribution and proposed action are immutable after insert';
  END IF;

  IF OLD.status <> 'pending' AND ROW(
       NEW.status, NEW.decision_note, NEW.decided_by, NEW.decided_at
     ) IS DISTINCT FROM ROW(
       OLD.status, OLD.decision_note, OLD.decided_by, OLD.decided_at
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'terminal agent approval decision evidence is immutable';
  END IF;

  IF OLD.status = 'pending' AND NEW.status <> 'pending' AND (
    NEW.status NOT IN ('approved','rejected','cancelled')
    OR NEW.decided_by IS NULL
    OR NEW.decided_at IS NULL
    OR length(trim(coalesce(NEW.decision_note, ''))) < 3
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'an agent approval terminal decision requires coherent human attribution';
  END IF;
  RETURN NEW;
END;
$$;

-- A dispatch must name an actual approved gate from the same tenant/run and must preserve
-- that gate's human decider. The runtime additionally binds dispatch to the live attempt
-- token; this trigger is the database backstop for raw application-role inserts.
ALTER TABLE agent_action_dispatch
  ADD CONSTRAINT fk_agentaction_approval_tenant
    FOREIGN KEY (tenant_id, run_id, approval_node_id)
    REFERENCES agent_approval (tenant_id, run_id, node_id),
  ADD CONSTRAINT fk_agentaction_node_tenant
    FOREIGN KEY (tenant_id, run_id, node_id)
    REFERENCES agent_node_run (tenant_id, run_id, node_id);

CREATE FUNCTION agent_action_approved_gate_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  gate_decider uuid;
BEGIN
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

CREATE TRIGGER trg_agentaction_approved_gate
  BEFORE INSERT ON agent_action_dispatch
  FOR EACH ROW EXECUTE FUNCTION agent_action_approved_gate_guard();
