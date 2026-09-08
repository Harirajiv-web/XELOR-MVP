-- A data-import row is evidence owned by both its batch and its tenant. Migration 0096
-- created both tables with tenant RLS, but batch_id had no database parent constraint.
-- RLS protects ordinary app requests; this composite key also protects migrations,
-- maintenance jobs and any future owner path that can bypass RLS.

-- Refuse to hide pre-existing bad evidence. If an orphan or cross-tenant reference somehow
-- exists, preserve it for investigation and stop the migration instead of silently
-- rewriting its attribution.
DO $$
DECLARE
  mismatch_count bigint;
BEGIN
  SELECT count(*)
    INTO mismatch_count
    FROM data_import_row child
    LEFT JOIN data_import_batch parent ON parent.id = child.batch_id
   WHERE parent.id IS NULL OR child.tenant_id <> parent.tenant_id;

  IF mismatch_count > 0 THEN
    RAISE EXCEPTION
      'Data-import tenancy hardening refused: data_import_row has % orphan/cross-tenant parent reference(s)',
      mismatch_count;
  END IF;
END $$;

ALTER TABLE data_import_batch
  ADD CONSTRAINT uq_dibatch_tenant_id UNIQUE (tenant_id, id);

ALTER TABLE data_import_row
  ADD CONSTRAINT fk_dirow_batch_tenant
    FOREIGN KEY (tenant_id, batch_id)
    REFERENCES data_import_batch (tenant_id, id)
    ON DELETE RESTRICT;
