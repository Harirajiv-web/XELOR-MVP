-- Agent OS request fingerprints were originally raw SHA-256 hex values (64 characters).
-- The canonical-v2 format prefixes that digest with its algorithm version so future
-- canonicalisation changes remain distinguishable while legacy rows still replay.
ALTER TABLE agent_run
  ALTER COLUMN request_fingerprint TYPE text
  USING btrim(request_fingerprint);

ALTER TABLE agent_run
  ADD CONSTRAINT ck_agentrun_request_fingerprint
  CHECK (
    request_fingerprint ~ '^([a-f0-9]{64}|v[1-9][0-9]*:[a-f0-9]{64})$'
  );
