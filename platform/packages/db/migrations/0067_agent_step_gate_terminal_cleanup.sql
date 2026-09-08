-- Closed missions cannot retain actionable Proceed gates. Keep their rows for audit
-- history, but remove them from the live control queue.
UPDATE agent_step_gate AS gate
SET is_active = false,
    updated_at = now()
FROM agent_run AS run
WHERE gate.run_id = run.id
  AND gate.tenant_id = run.tenant_id
  AND gate.is_active = true
  AND gate.status = 'pending'
  AND run.status IN ('completed', 'failed', 'cancelled');
