-- Upgrade databases that applied the first 0078 draft: owner access also cannot erase
-- simulator command evidence accidentally. Future lifecycle work must append status events.
DROP TRIGGER machine_command_request_immutable ON machine_command;
CREATE TRIGGER machine_command_request_immutable
BEFORE UPDATE OR DELETE ON machine_command
FOR EACH ROW EXECUTE FUNCTION prevent_machine_command_request_mutation();
