-- Agent OS execution evidence must never point across a tenant boundary. RLS protects the
-- application path, while these composite foreign keys protect owner jobs, future services,
-- imports and any other path that can bypass RLS.

-- Fail explicitly before replacing the legacy id-only foreign keys. This preserves any
-- suspect evidence for investigation instead of silently repairing its tenant attribution.
DO $$
DECLARE
  relation record;
  mismatch_count bigint;
BEGIN
  FOR relation IN
    SELECT *
    FROM (VALUES
      ('agent_node_run',          'run_id',             'agent_run'),
      ('agent_checkpoint',        'run_id',             'agent_run'),
      ('agent_approval',          'run_id',             'agent_run'),
      ('agent_run_event',         'run_id',             'agent_run'),
      ('agent_action_dispatch',   'run_id',             'agent_run'),
      ('agent_step_gate',         'run_id',             'agent_run'),
      ('decision_evidence_link',  'mission_run_id',     'agent_run'),
      ('decision_outcome_metric', 'mission_run_id',     'agent_run'),
      ('decision_outcome_metric', 'action_dispatch_id', 'agent_action_dispatch')
    ) AS relations(child_table, child_column, parent_table)
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I child JOIN %I parent ON parent.id = child.%I
       WHERE child.%I IS NOT NULL AND child.tenant_id <> parent.tenant_id',
      relation.child_table,
      relation.parent_table,
      relation.child_column,
      relation.child_column
    ) INTO mismatch_count;

    IF mismatch_count > 0 THEN
      RAISE EXCEPTION
        'Agent OS tenancy hardening refused: %.% has % cross-tenant reference(s)',
        relation.child_table,
        relation.child_column,
        mismatch_count;
    END IF;
  END LOOP;
END $$;

-- A fresh token can identify the executor that owns a particular node attempt. Existing
-- rows intentionally remain unclaimed; the runtime sets and rotates this value via CAS.
ALTER TABLE agent_node_run
  ADD COLUMN execution_token uuid;

ALTER TABLE agent_run
  ADD CONSTRAINT uq_agentrun_tenant_id UNIQUE (tenant_id, id);

-- decision_outcome_metric links to a dispatch, so that evidence parent needs the same
-- tenant-addressable identity as agent_run.
ALTER TABLE agent_action_dispatch
  ADD CONSTRAINT uq_agentaction_tenant_id UNIQUE (tenant_id, id);

ALTER TABLE agent_node_run
  DROP CONSTRAINT agent_node_run_run_id_fkey,
  ADD CONSTRAINT fk_agentnode_run_tenant
    FOREIGN KEY (tenant_id, run_id)
    REFERENCES agent_run (tenant_id, id);

ALTER TABLE agent_checkpoint
  DROP CONSTRAINT agent_checkpoint_run_id_fkey,
  ADD CONSTRAINT fk_agentcheckpoint_run_tenant
    FOREIGN KEY (tenant_id, run_id)
    REFERENCES agent_run (tenant_id, id);

ALTER TABLE agent_approval
  DROP CONSTRAINT agent_approval_run_id_fkey,
  ADD CONSTRAINT fk_agentapproval_run_tenant
    FOREIGN KEY (tenant_id, run_id)
    REFERENCES agent_run (tenant_id, id);

ALTER TABLE agent_run_event
  DROP CONSTRAINT agent_run_event_run_id_fkey,
  ADD CONSTRAINT fk_agentevent_run_tenant
    FOREIGN KEY (tenant_id, run_id)
    REFERENCES agent_run (tenant_id, id);

ALTER TABLE agent_action_dispatch
  DROP CONSTRAINT agent_action_dispatch_run_id_fkey,
  ADD CONSTRAINT fk_agentaction_run_tenant
    FOREIGN KEY (tenant_id, run_id)
    REFERENCES agent_run (tenant_id, id);

ALTER TABLE agent_step_gate
  DROP CONSTRAINT agent_step_gate_run_id_fkey,
  ADD CONSTRAINT fk_agentstep_run_tenant
    FOREIGN KEY (tenant_id, run_id)
    REFERENCES agent_run (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE decision_evidence_link
  DROP CONSTRAINT decision_evidence_link_mission_run_id_fkey,
  ADD CONSTRAINT fk_decisionevidence_run_tenant
    FOREIGN KEY (tenant_id, mission_run_id)
    REFERENCES agent_run (tenant_id, id);

ALTER TABLE decision_outcome_metric
  DROP CONSTRAINT decision_outcome_metric_mission_run_id_fkey,
  DROP CONSTRAINT decision_outcome_metric_action_dispatch_id_fkey,
  ADD CONSTRAINT fk_decisionoutcome_run_tenant
    FOREIGN KEY (tenant_id, mission_run_id)
    REFERENCES agent_run (tenant_id, id),
  ADD CONSTRAINT fk_decisionoutcome_action_tenant
    FOREIGN KEY (tenant_id, action_dispatch_id)
    REFERENCES agent_action_dispatch (tenant_id, id);

-- A run may advance through lifecycle states, consume its budget and acquire output, but
-- its selected graph and original input are the immutable basis of every later decision.
CREATE FUNCTION agent_run_evidence_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(NEW.graph_key, NEW.graph_version, NEW.input, NEW.graph_snapshot)
     IS DISTINCT FROM
     ROW(OLD.graph_key, OLD.graph_version, OLD.input, OLD.graph_snapshot) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'agent run graph identity, input and snapshot are immutable after insert';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agentrun_evidence_immutable
  BEFORE UPDATE ON agent_run
  FOR EACH ROW EXECUTE FUNCTION agent_run_evidence_immutable_guard();

-- Decision lifecycle fields may change from pending to a terminal decision. The proposal
-- being decided, its risk statement and its run/node attribution may not be rewritten.
CREATE FUNCTION agent_approval_proposal_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(NEW.run_id, NEW.node_id, NEW.proposed, NEW.proposed_action, NEW.title, NEW.risk)
     IS DISTINCT FROM
     ROW(OLD.run_id, OLD.node_id, OLD.proposed, OLD.proposed_action, OLD.title, OLD.risk) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'agent approval attribution and proposed action are immutable after insert';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agentapproval_proposal_immutable
  BEFORE UPDATE ON agent_approval
  FOR EACH ROW EXECUTE FUNCTION agent_approval_proposal_immutable_guard();
