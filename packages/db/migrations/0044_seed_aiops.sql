-- =============================================================================
-- 0044_seed_aiops — the AI control plane, seeded against the §7 demo universe.
--
-- Three providers, and one of them serves from outside India on purpose: a residency
-- control that has never had anything to refuse has not been demonstrated.
-- =============================================================================

INSERT INTO ai_provider (id, tenant_id, created_by, updated_by, code, name, kind, region, status, training_exclusion_confirmed) VALUES
 ('0192a8c0-0043-7000-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','stub','Offline deterministic stub','stub','ap-south-1','active',true),
 ('0192a8c0-0043-7000-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','edge-ollama','Local model on the plant server','edge','ap-south-1','active',true),
 ('0192a8c0-0043-7000-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','hosted-small','Hosted small-model tier','hosted','ap-south-1','active',true),
 -- Deliberately out of region. A residency control with nothing to refuse is untested.
 ('0192a8c0-0043-7000-8000-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','hosted-us','Hosted premium tier (us-east-1)','hosted','us-east-1','active',false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_model (id, tenant_id, created_by, updated_by, provider_id, code, display_name, tier, context_tokens) VALUES
 ('0192a8c0-0043-7100-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0043-7000-8000-000000000001','stub-deterministic','Deterministic stub','local',8192),
 ('0192a8c0-0043-7100-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0043-7000-8000-000000000002','qwen-3b-local','Qwen 3B (local)','local',32768),
 ('0192a8c0-0043-7100-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0043-7000-8000-000000000003','small-in','Small model, India region','small',128000),
 ('0192a8c0-0043-7100-8000-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0043-7000-8000-000000000004','premium-us','Premium model, US region','premium',200000)
ON CONFLICT (id) DO NOTHING;

-- Effective-dated: a price change is a NEW row. The old one is closed, never edited, so a
-- call made in June is still costed at June's rate when the report runs in September.
INSERT INTO ai_model_price (id, tenant_id, created_by, updated_by, model_code, input_per_1k, output_per_1k, effective_from, effective_to, source_note) VALUES
 ('0192a8c0-0043-7200-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','stub-deterministic',0,0,'2026-04-01',NULL,'The offline stub costs nothing; recorded so every call has a price row.'),
 ('0192a8c0-0043-7200-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','qwen-3b-local',0,0,'2026-04-01',NULL,'Local model: no per-token cost, only the machine it runs on.'),
 ('0192a8c0-0043-7200-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','small-in',0.5000,1.5000,'2026-04-01','2026-06-30','Launch pricing.'),
 ('0192a8c0-0043-7200-8000-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','small-in',0.6000,1.8000,'2026-07-01',NULL,'Revised 1 Jul 2026. The June rate is closed, not overwritten.'),
 ('0192a8c0-0043-7200-8000-000000000005','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','premium-us',6.0000,18.0000,'2026-04-01',NULL,'Premium tier.')
ON CONFLICT (id) DO NOTHING;

-- The rollout state of the eight registered features. Three committed features are further
-- along than the stretch ones, and the stretch AI is off — which is where it should be.
INSERT INTO ai_feature_rollout (id, tenant_id, created_by, updated_by, feature_key, stage, changed_by, reason) VALUES
 ('0192a8c0-0043-7300-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','expenditure.receipt_extraction','pilot','0192a8c0-0000-7000-8000-0000000000ff',NULL),
 ('0192a8c0-0043-7300-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','general.master_dedup','general','0192a8c0-0000-7000-8000-0000000000ff',NULL),
 ('0192a8c0-0043-7300-8000-000000000003','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','csp.ticket_triage','pilot','0192a8c0-0000-7000-8000-0000000000ff',NULL),
 ('0192a8c0-0043-7300-8000-000000000004','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','admin.sod_explain','off','0192a8c0-0000-7000-8000-0000000000ff',NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_eval_dataset (id, tenant_id, created_by, updated_by, feature_key, dataset_version, description, case_count) VALUES
 ('0192a8c0-0043-7400-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','expenditure.receipt_extraction','v1-2026-07-20','13 labelled Indian receipts: hotel, taxi, fuel, courier, staff welfare, electricity.',13),
 ('0192a8c0-0043-7400-8000-000000000002','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','admin.sod_explain','v1-2026-07-20','11 explanation candidates covering the failure modes a small model actually produces.',11)
ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_embedding_index (id, tenant_id, created_by, updated_by, index_name, entity_type, model_code, dimensions, vector_count, last_rebuilt_at) VALUES
 ('0192a8c0-0043-7500-8000-000000000001','0192a8c0-0000-7000-8000-000000000001','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','item_master_dedup','item','small-in',768,412,'2026-07-19T20:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- Kaveri — the leak-probe counterpart.
INSERT INTO ai_provider (id, tenant_id, created_by, updated_by, code, name, kind, region) VALUES
 ('0192a8c0-0043-7000-8000-0000000000f1','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','stub','Offline deterministic stub','stub','ap-south-1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_feature_rollout (id, tenant_id, created_by, updated_by, feature_key, stage, changed_by) VALUES
 ('0192a8c0-0043-7300-8000-0000000000f1','0192a8c0-0000-7000-8000-000000000002','0192a8c0-0000-7000-8000-0000000000ff','0192a8c0-0000-7000-8000-0000000000ff','general.master_dedup','internal','0192a8c0-0000-7000-8000-0000000000ff')
ON CONFLICT (id) DO NOTHING;
