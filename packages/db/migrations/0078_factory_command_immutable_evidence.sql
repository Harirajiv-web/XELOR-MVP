-- A command row is an insert-once simulator evaluation today. No lifecycle updater exists,
-- so every column is immutable evidence. A future physical claim/ack implementation must
-- introduce append-only status events before deliberately widening this privilege.

UPDATE permission_catalogue
SET description = 'Request an approval-bound allowlisted simulator command evaluation; physical edge execution is disabled.',
    updated_at = now(),
    updated_by = '0192a8c0-0000-7000-8000-0000000000ff'::uuid
WHERE permission = 'factory.command.execute';

REVOKE UPDATE, DELETE ON machine_command FROM app_user;

CREATE OR REPLACE FUNCTION prevent_machine_command_request_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'machine command evidence is immutable; append a new evidence event';
END $$;

DROP TRIGGER machine_command_request_immutable ON machine_command;
CREATE TRIGGER machine_command_request_immutable
BEFORE UPDATE OR DELETE ON machine_command
FOR EACH ROW EXECUTE FUNCTION prevent_machine_command_request_mutation();
