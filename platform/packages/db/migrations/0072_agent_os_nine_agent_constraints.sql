-- Keep persisted Agent OS runs aligned with the current nine-agent catalogue.
-- ACHILES may appear in run evidence, but remains deliberately excluded from the
-- action-dispatch constraint because platform assurance is read-only.
ALTER TABLE agent_node_run
  DROP CONSTRAINT agent_node_run_agent_key_check;

ALTER TABLE agent_node_run
  ADD CONSTRAINT agent_node_run_agent_key_check
  CHECK (
    agent_key IS NULL OR agent_key IN (
      'ONYX', 'HEXA', 'MICA', 'SPAR', 'AXLE', 'KILN', 'RASP', 'RELAY', 'ACHILES'
    )
  );

ALTER TABLE agent_action_dispatch
  DROP CONSTRAINT agent_action_dispatch_agent_key_check;

ALTER TABLE agent_action_dispatch
  ADD CONSTRAINT agent_action_dispatch_agent_key_check
  CHECK (
    agent_key IN ('ONYX', 'HEXA', 'MICA', 'SPAR', 'AXLE', 'KILN', 'RASP', 'RELAY')
  );
