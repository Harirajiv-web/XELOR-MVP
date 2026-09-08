-- Source evidence, decision assumptions and baseline measurements are historical facts.
-- Corrections are new records, preserving the evidence behind an earlier decision.
CREATE FUNCTION manufacturing_evidence_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Manufacturing evidence is append-only; record a new snapshot or measurement';
END;
$$ LANGUAGE plpgsql;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['manufacturing_snapshot','manufacturing_decision','manufacturing_outcome'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_append_only BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION manufacturing_evidence_append_only()', t,t);
    EXECUTE format('REVOKE UPDATE,DELETE ON %I FROM app_user',t);
  END LOOP;
END $$;
