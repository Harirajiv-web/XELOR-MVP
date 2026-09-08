-- One approved Factory Flow gate may authorize one idempotent machine command only.
-- The service verifies that approval_ref points to an approved factory.flow-recovery
-- human gate; this unique constraint closes the concurrent-request race below it.
ALTER TABLE machine_command
  ADD CONSTRAINT uq_machine_command_approval UNIQUE (tenant_id, approval_ref);
