-- =============================================================================
-- 0048 — the copilot's question log, and the grants that let anyone ask.
--
-- The copilot is READ-ONLY over the tenant's own data. This migration adds exactly one
-- table — a log of questions — and two permissions. It creates no business table, because
-- the feature stores no business data: it reads what is already there.
--
-- The log records the QUESTION and never the ANSWER. Keeping returned rows would make a
-- second copy of business data outside the tables whose access rules protect it, and that
-- copy would need securing as carefully as the ledger — one badly-granted "read the
-- copilot log" and a payroll figure walks out through the audit trail. What is kept is
-- enough to reconstruct any answer from the source of truth: which catalogue question ran,
-- with which parameters, over which tables, returning how many rows, for whom, when.
--
-- Refusals are logged as carefully as answers. A log of only the successful questions
-- would say the assistant is doing well; a log of everything it could not understand is
-- the list of what to build next, and the evidence that a question about payroll was
-- turned away rather than quietly answered.
-- =============================================================================

CREATE TABLE IF NOT EXISTS copilot_question (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  question     text NOT NULL,
  intent_key   text,
  outcome      text NOT NULL,
  confidence   numeric(5,4) NOT NULL DEFAULT 0,
  routed_by    text NOT NULL DEFAULT 'deterministic',
  params       jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources      jsonb NOT NULL DEFAULT '[]'::jsonb,
  row_count    integer NOT NULL DEFAULT 0,

  CONSTRAINT ck_copilot_outcome CHECK (outcome IN ('answered','refused','clarify','forbidden','no_query')),
  CONSTRAINT ck_copilot_routed_by CHECK (routed_by IN ('deterministic','model','none')),
  CONSTRAINT ck_copilot_confidence CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT ck_copilot_rowcount CHECK (row_count >= 0),
  -- A 500-character ceiling matches the endpoint. A 5,000-character "question" is either a
  -- paste accident or an attempt to bury an instruction where a reviewer will not read it.
  CONSTRAINT ck_copilot_question_len CHECK (length(question) BETWEEN 1 AND 500),
  -- An answered question must say which catalogue entry answered it. "Answered by nothing"
  -- is the shape a bug takes when a query runs outside the catalogue, and it must not be
  -- expressible.
  CONSTRAINT ck_copilot_answered_has_intent CHECK (outcome <> 'answered' OR intent_key IS NOT NULL),
  -- ...and which tables it read. An answer that cites no source cannot be checked, and an
  -- answer that cannot be checked is a rumour with a database behind it.
  CONSTRAINT ck_copilot_answered_has_sources CHECK (outcome <> 'answered' OR jsonb_array_length(sources) > 0),
  -- A refusal returned no rows, by definition. If this ever fires, something answered a
  -- question it had already declined.
  CONSTRAINT ck_copilot_refusal_returns_nothing CHECK (outcome NOT IN ('refused','forbidden','clarify') OR row_count = 0)
);

CREATE INDEX IF NOT EXISTS ix_copilot_q_tenant_time ON copilot_question (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_copilot_q_tenant_outcome ON copilot_question (tenant_id, outcome);

ALTER TABLE copilot_question ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_question FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON copilot_question;
CREATE POLICY tenant_isolation ON copilot_question
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- The log is append-only, for the same reason the audit trail is: a record of what was
-- asked is worthless if the person who asked can edit it afterwards. Reuse the trigger
-- function migration 0000 installed.
CREATE TRIGGER trg_copilot_question_append_only
  BEFORE UPDATE OR DELETE ON copilot_question
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
REVOKE UPDATE, DELETE ON copilot_question FROM app_user;

-- ---------------------------------------------------------------------------
-- The two permissions, catalogued for both tenants, then granted to admin.
--
-- `copilot.ask` lets a person ASK; it shows them nothing on its own. Every question in the
-- catalogue carries its own module permission as well, so the copilot can only retrieve
-- what the asker could already open a screen for. Two gates deliberately: revoking
-- `copilot.ask` switches the assistant off for someone without touching anything else they
-- can do, and granting it widens nothing.
-- ---------------------------------------------------------------------------

INSERT INTO permission_catalogue (id, tenant_id, created_by, updated_by, permission, doc_type, action, description, is_privileged)
SELECT gen_random_uuid(), t.tenant_id,
       '0192a8c0-0000-7000-8000-0000000000ff', '0192a8c0-0000-7000-8000-0000000000ff',
       p.permission, 'copilot_question', p.action, p.description, p.priv
FROM (VALUES
  ('copilot.question.ask','ask','Ask the read-only copilot a question. Answers are still limited to what the asker''s other permissions allow.',false),
  ('copilot.log.read','read','Read the log of questions asked of the copilot, and what each answer was drawn from.',true)
) AS p(permission, action, description, priv)
CROSS JOIN (VALUES
  ('0192a8c0-0000-7000-8000-000000000001'::uuid),
  ('0192a8c0-0000-7000-8000-000000000002'::uuid)
) AS t(tenant_id)
ON CONFLICT (tenant_id, permission) DO UPDATE
  SET description = EXCLUDED.description, is_privileged = EXCLUDED.is_privileged, updated_at = now();

INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT gen_random_uuid(), ro.tenant_id,
       '0192a8c0-0000-7000-8000-0000000000ff', '0192a8c0-0000-7000-8000-0000000000ff',
       ro.id, p.permission
FROM role ro
CROSS JOIN (VALUES ('copilot.question.ask'), ('copilot.log.read')) AS p(permission)
WHERE ro.code = 'admin'
ON CONFLICT DO NOTHING;

-- The stores in-charge gets to ASK but not to read the log. Deliberate, and it is the
-- demonstration: she can ask about stock (she holds inventory.stock.read) and is refused
-- on payroll by the same rule that hides the payroll screen. One person, one permission
-- set, the copilot obeying it exactly.
INSERT INTO role_permission (id, tenant_id, created_by, updated_by, role_id, permission)
SELECT gen_random_uuid(), ro.tenant_id,
       '0192a8c0-0000-7000-8000-0000000000ff', '0192a8c0-0000-7000-8000-0000000000ff',
       ro.id, 'copilot.question.ask'
FROM role ro
WHERE ro.code = 'stores_incharge'
ON CONFLICT DO NOTHING;

COMMENT ON TABLE copilot_question IS
  'Every copilot question — answered, refused or misunderstood. Stores the question and what was read, never the rows returned.';
