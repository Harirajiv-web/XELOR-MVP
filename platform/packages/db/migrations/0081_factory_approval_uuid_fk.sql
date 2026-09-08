-- Approval identity is a UUID, not case-sensitive text. Canonical typing closes the
-- uppercase/lowercase approval-once bypass at the database boundary, while the composite
-- FK also proves that command evidence references an approval from the same tenant.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM machine_command
    WHERE approval_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'machine_command contains a non-UUID approval_ref; investigate evidence before migrating';
  END IF;
END $$;

ALTER TABLE agent_approval
  ADD CONSTRAINT uq_agentapproval_tenant_id UNIQUE (tenant_id, id);

ALTER TABLE machine_command
  ALTER COLUMN approval_ref TYPE uuid USING lower(approval_ref)::uuid;

ALTER TABLE machine_command
  ADD CONSTRAINT fk_machine_command_approval_tenant
    FOREIGN KEY (tenant_id, approval_ref)
    REFERENCES agent_approval (tenant_id, id);
